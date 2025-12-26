/**
 * GDPR Webhook: shop/redact
 * 
 * This mandatory GDPR webhook is triggered 48 hours after an app is uninstalled
 * from a shop. The app must delete ALL customer data stored for this shop
 * and respond with 200 OK.
 * 
 * @see https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Extract shop information from payload
  const shopPayload = payload as {
    shop_id?: string | number;
    shop_domain?: string;
  };

  console.log(`Shop redact request for: ${shop}`);
  console.log(`Shop ID from payload: ${shopPayload.shop_id}`);

  try {
    // Find the shop in database
    const shopRecord = await db.shop.findUnique({
      where: { shopifyDomain: shop },
      include: {
        _count: {
          select: {
            automations: true,
            messageQueue: true,
            messageHistory: true,
            widgets: true,
            connectionLogs: true,
          },
        },
      },
    });

    if (!shopRecord) {
      console.log(`Shop ${shop} not found in database for shop redact`);
      // Return 200 OK - shop may have already been deleted
      return new Response(JSON.stringify({
        success: true,
        message: "Shop not found, may have already been deleted",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`Found shop ${shop} with data:`, shopRecord._count);

    // Delete all related data (cascade should handle most of this, but being explicit)
    // Order matters due to foreign key constraints

    // 1. Delete message history
    const deletedHistory = await db.messageHistory.deleteMany({
      where: { shopId: shopRecord.id },
    });
    console.log(`Deleted ${deletedHistory.count} message history records`);

    // 2. Delete message queue
    const deletedQueue = await db.messageQueue.deleteMany({
      where: { shopId: shopRecord.id },
    });
    console.log(`Deleted ${deletedQueue.count} queued messages`);

    // 3. Delete automations
    const deletedAutomations = await db.automation.deleteMany({
      where: { shopId: shopRecord.id },
    });
    console.log(`Deleted ${deletedAutomations.count} automations`);

    // 4. Delete widgets
    const deletedWidgets = await db.widget.deleteMany({
      where: { shopId: shopRecord.id },
    });
    console.log(`Deleted ${deletedWidgets.count} widgets`);

    // 5. Delete connection logs
    const deletedLogs = await db.connectionLog.deleteMany({
      where: { shopId: shopRecord.id },
    });
    console.log(`Deleted ${deletedLogs.count} connection logs`);

    // 6. Finally, delete the shop record itself
    await db.shop.delete({
      where: { id: shopRecord.id },
    });
    console.log(`Deleted shop record for ${shop}`);

    // 7. Clean up any remaining session data
    const deletedSessions = await db.session.deleteMany({
      where: { shop: shop },
    });
    console.log(`Deleted ${deletedSessions.count} session records`);

    console.log(`Successfully completed shop redact for ${shop}`);

    return new Response(JSON.stringify({
      success: true,
      shop: shop,
      deletedRecords: {
        messageHistory: deletedHistory.count,
        queuedMessages: deletedQueue.count,
        automations: deletedAutomations.count,
        widgets: deletedWidgets.count,
        connectionLogs: deletedLogs.count,
        sessions: deletedSessions.count,
        shopRecord: 1,
      },
      message: "All shop data deleted successfully",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error processing shop redact request:", error);
    
    // Return 200 OK even on error - Shopify requires this
    // Log the error for investigation but don't fail the webhook
    return new Response(JSON.stringify({
      success: false,
      error: "Internal error processing shop redact request",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};
