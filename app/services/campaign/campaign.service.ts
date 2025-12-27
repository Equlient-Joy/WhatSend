import prisma from "../../db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { Campaign } from "@prisma/client";
import { canSendMessages, incrementMessageCount } from "../billing/billing.service";

export interface CustomerSegment {
  id: string;
  name: string;
  query: string;
}

/**
 * Fetch segments from Shopify Admin API
 */
export async function getSegments(
  graphql: AdminApiContext["graphql"],
): Promise<CustomerSegment[]> {
  const response = await graphql(`
    query getSegments {
      segments(first: 50) {
        edges {
          node {
            id
            name
            query
          }
        }
      }
    }
  `);

  const data = await response.json();

  // @ts-ignore
  return (
    data.data?.segments?.edges.map((edge: any) => ({
      id: edge.node.id,
      name: edge.node.name,
      query: edge.node.query,
    })) || []
  );
}

/**
 * Create a campaign and queue messages
 */
export async function createCampaign(
  shopId: string,
  shopDomain: string,
  campaignData: {
    name: string;
    segmentId: string;
    segmentQuery: string;
    message: string;
  },
  graphql: AdminApiContext["graphql"],
): Promise<{ success: boolean; campaign?: Campaign; error?: string }> {
  // Check billing status before allowing campaign creation
  const billingCheck = await canSendMessages(shopDomain, 1);
  if (!billingCheck.allowed) {
    return { success: false, error: billingCheck.reason };
  }

  // 1. Create Campaign Record
  const campaign = await prisma.campaign.create({
    data: {
      shop: { connect: { id: shopId } },
      name: campaignData.name,
      segmentId: campaignData.segmentId,
      segmentQuery: campaignData.segmentQuery,
      message: campaignData.message,
      status: "processing",
    },
  });

  // 2. Fetch Customers for Segment
  // Note: segmentQuery needs to be passed to customers query.
  // We'll fetch in batches. For MVP we'll limit to 200 to avoid timeout.
  // In production this should be a background job.

  const response = await graphql(
    `
      query getCustomers($query: String!) {
        customers(first: 200, query: $query) {
          edges {
            node {
              id
              firstName
              lastName
              phone
              email
            }
          }
        }
      }
    `,
    { variables: { query: campaignData.segmentQuery } },
  );

  const customerData = await response.json();
  // @ts-ignore
  const customers =
    customerData.data?.customers?.edges.map((e: any) => e.node) || [];

  // Filter customers with phone numbers
  const validCustomers = customers.filter((c: any) => c.phone);

  if (validCustomers.length === 0) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "completed", totalRecipients: 0 },
    });
    return { success: true, campaign };
  }

  // 3. Create Message Queue Items
  const messagesData = validCustomers.map((c: any) => ({
    shopId,
    campaignId: campaign.id,
    recipientPhone: c.phone,
    recipientName: `${c.firstName || ""} ${c.lastName || ""}`.trim(),
    message: formatMessage(campaignData.message, c),
    messageType: "campaign",
    status: "pending",
  }));

  // Batch insert (Prisma createMany is supported in Postgres)
  await prisma.messageQueue.createMany({
    data: messagesData,
  });

  // Update campaign stats
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: "scheduled",
      totalRecipients: messagesData.length,
    },
  });

  // Increment message count for billing
  await incrementMessageCount(shopDomain, messagesData.length);

  return { success: true, campaign };
}

/**
 * Replace variables in message
 */
function formatMessage(template: string, customer: any): string {
  let message = template;
  message = message.replace(
    /{{customer_name}}/g,
    `${customer.firstName || ""}`.trim() || "Customer",
  );
  message = message.replace(
    /{{first_name}}/g,
    customer.firstName || "Customer",
  );
  return message;
}
