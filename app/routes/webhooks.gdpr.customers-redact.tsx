/**
 * GDPR Webhook: customers/redact
 * 
 * This mandatory GDPR webhook is triggered when a store owner requests deletion
 * of a customer's personal information. The app must delete all stored data
 * for this customer and respond with 200 OK.
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
    orders_to_redact?: Array<string | number>;
    customer_id?: string | number;
  };

  const customerId = customerPayload.customer?.id?.toString() || customerPayload.customer_id?.toString();
  const customerPhone = customerPayload.customer?.phone;
  const ordersToRedact = customerPayload.orders_to_redact || [];

  console.log(`Customer redact request for shop: ${shop}`);
  console.log(`Customer ID: ${customerId}, Phone: ${customerPhone}`);
  console.log(`Orders to redact: ${ordersToRedact.join(", ")}`);

  try {
    // Find the shop in database
    const shopRecord = await db.shop.findUnique({
      where: { shopifyDomain: shop },
    });

    if (!shopRecord) {
      console.log(`Shop ${shop} not found in database for customer redact`);
      // Return 200 OK as required - no data to delete
      return new Response(JSON.stringify({
        success: true,
        message: "Shop not found, no customer data to delete",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    let deletedMessages = 0;
    let deletedQueuedMessages = 0;

    // Delete customer data based on phone number
    if (customerPhone) {
      const phonePattern = customerPhone.replace(/\D/g, '').slice(-10);

      // Delete message history for this customer
      const deletedHistory = await db.messageHistory.deleteMany({
        where: {
          shopId: shopRecord.id,
          recipientPhone: {
            contains: phonePattern,
          },
        },
      });
      deletedMessages = deletedHistory.count;

      // Delete queued messages for this customer
      const deletedQueue = await db.messageQueue.deleteMany({
        where: {
          shopId: shopRecord.id,
          recipientPhone: {
            contains: phonePattern,
          },
        },
      });
      deletedQueuedMessages = deletedQueue.count;
    }

    // Also delete any messages related to specific orders
    if (ordersToRedact.length > 0) {
      const orderIds = ordersToRedact.map(id => id.toString());

      // Delete message history for these orders
      const deletedOrderHistory = await db.messageHistory.deleteMany({
        where: {
          shopId: shopRecord.id,
          orderId: { in: orderIds },
        },
      });
      deletedMessages += deletedOrderHistory.count;

      // Delete queued messages for these orders
      const deletedOrderQueue = await db.messageQueue.deleteMany({
        where: {
          shopId: shopRecord.id,
          orderId: { in: orderIds },
        },
      });
      deletedQueuedMessages += deletedOrderQueue.count;
    }

    console.log(`Deleted ${deletedMessages} message history records and ${deletedQueuedMessages} queued messages for customer`);

    return new Response(JSON.stringify({
      success: true,
      shop: shop,
      customerId: customerId,
      deletedRecords: {
        messageHistory: deletedMessages,
        queuedMessages: deletedQueuedMessages,
      },
      message: "Customer data deleted successfully",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error processing customer redact request:", error);
    
    // Return 200 OK even on error - Shopify requires this
    return new Response(JSON.stringify({
      success: false,
      error: "Internal error processing redact request",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};
