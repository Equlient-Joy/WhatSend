import { ActionFunctionArgs, json } from "@remix-run/node";
import { authenticate } from "../../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // 1. Authenticate the webhook request (verifies HMAC)
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (!payload) {
    return new Response("No payload", { status: 400 });
  }

  console.log(`Received ${topic} webhook for ${shop}`);

  // 2. Extract Data
  const order = payload as { id?: string; name?: string; shipping_address?: { phone?: string }; billing_address?: { phone?: string }; customer?: { phone?: string } };
  const orderId = order.id;
  const orderNumber = order.name;
  
  // Try to find a phone number (shipping address, billing address, or customer record)
  const phone = order.shipping_address?.phone || order.billing_address?.phone || order.customer?.phone;

  if (!phone) {
    console.log(`No phone number found for order ${orderNumber}. Skipping WhatsApp notification.`);
    return json({ success: false, reason: "no_phone" }, { status: 200 }); // Return 200 to acknowledge webhook
  }

  try {
    // 3. Queue the Message - use dynamic import to avoid bundling issues
    const { queueMessage } = await import("../../services/queue/message-queue.service");
    
    const message = `Hi! Thank you for your order ${orderNumber} at ${shop}. We will notify you when it ships!`;
    const shopId = shop; 

    await queueMessage({
      shopId,
      phone,
      message,
      priority: 1 // High priority for order confirmations
    });

    return json({ success: true, queued: true });

  } catch (error) {
    console.error("Failed to process webhook:", error);
    // Still return 200 to Shopify so they don't retry indefinitely
    return json({ success: false, error: "internal_error" }, { status: 200 });
  }
};
