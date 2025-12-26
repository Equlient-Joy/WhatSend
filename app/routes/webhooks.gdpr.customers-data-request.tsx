/**
 * GDPR Webhook: customers/data_request
 * 
 * This mandatory GDPR webhook is triggered when a customer requests to view
 * their personal data stored by a merchant. The app must respond with 200 OK
 * and provide the requested customer data to the store owner.
 * 
 * @see https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Extract customer information from payload
  const customerPayload = payload as {
    customer?: {
      id?: string | number;
      email?: string;
      phone?: string;
    };
    shop_id?: string | number;
    shop_domain?: string;
    orders_requested?: Array<string | number>;
    customer_id?: string | number;
    data_request?: {
      id?: string | number;
    };
  };

  const customerId = customerPayload.customer?.id?.toString() || customerPayload.customer_id?.toString();
  const customerEmail = customerPayload.customer?.email;
  const customerPhone = customerPayload.customer?.phone;

  console.log(`Customer data request for shop: ${shop}`);
  console.log(`Customer ID: ${customerId}, Email: ${customerEmail}, Phone: ${customerPhone}`);

  try {
    // Find the shop in database
    const shopRecord = await db.shop.findUnique({
      where: { shopifyDomain: shop },
    });

    if (!shopRecord) {
      console.log(`Shop ${shop} not found in database for data request`);
      // Still return 200 OK as required by Shopify
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Shop not found, no customer data stored" 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Collect customer data from our database
    // Look for message history with this customer's phone
    const customerData: {
      messages: Array<{
        id: string;
        messageType: string;
        message: string;
        sentAt: Date;
        status: string;
        orderNumber: string | null;
      }>;
      queuedMessages: Array<{
        id: string;
        messageType: string;
        message: string;
        status: string;
        createdAt: Date;
      }>;
    } = {
      messages: [],
      queuedMessages: [],
    };

    if (customerPhone) {
      // Get message history for this customer
      const messageHistory = await db.messageHistory.findMany({
        where: {
          shopId: shopRecord.id,
          recipientPhone: {
            contains: customerPhone.replace(/\D/g, '').slice(-10), // Match last 10 digits
          },
        },
        select: {
          id: true,
          messageType: true,
          message: true,
          sentAt: true,
          status: true,
          orderNumber: true,
        },
      });

      customerData.messages = messageHistory;

      // Get any pending queued messages
      const queuedMessages = await db.messageQueue.findMany({
        where: {
          shopId: shopRecord.id,
          recipientPhone: {
            contains: customerPhone.replace(/\D/g, '').slice(-10),
          },
        },
        select: {
          id: true,
          messageType: true,
          message: true,
          status: true,
          createdAt: true,
        },
      });

      customerData.queuedMessages = queuedMessages;
    }

    console.log(`Found ${customerData.messages.length} messages and ${customerData.queuedMessages.length} queued messages for customer`);

    // Return success with customer data
    // In production, you would typically email this to the merchant
    return new Response(JSON.stringify({
      success: true,
      shop: shop,
      customerId: customerId,
      customerEmail: customerEmail,
      customerPhone: customerPhone,
      dataCollected: customerData,
      message: "Customer data request processed successfully",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error processing customer data request:", error);
    
    // Return 200 OK even on error - Shopify requires this
    return new Response(JSON.stringify({
      success: false,
      error: "Internal error processing data request",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};
