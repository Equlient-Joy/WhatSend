import { ActionFunctionArgs, json } from "@remix-run/node";
import { authenticate } from "../../shopify.server";
import { queueMessage } from "../../services/queue/message-queue.service";

export const action = async ({ request }: ActionFunctionArgs) => {
  // 1. Authenticate the webhook request (verifies HMAC)
  const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

  if (!payload) {
    return new Response("No payload", { status: 400 });
  }

  console.log(`Received ${topic} webhook for ${shop}`);

  // 2. Extract Data
  // Note: The payload type depends on the specific webhook version.
  // Using 'any' here for simplicity, but strictly should define an Order interface.
  const order = payload as any;
  const orderId = order.id;
  const orderNumber = order.name;
  
  // Try to find a phone number (shipping address, billing address, or customer record)
  const phone = order.shipping_address?.phone || order.billing_address?.phone || order.customer?.phone;

  if (!phone) {
    console.log(`No phone number found for order ${orderNumber}. Skipping WhatsApp notification.`);
    return json({ success: false, reason: "no_phone" }, { status: 200 }); // Return 200 to acknowledge webhook
  }

  try {
    // 3. Queue the Message
    // In a real app, you would:
    // a) Check if the shop has the 'order_confirmation' automation enabled in the DB
    // b) Fetch the custom template for this shop
    // c) Replace variables in the template
    
    // For this MVP step:
    const message = `Hi! Thank you for your order ${orderNumber} at ${shop}. We will notify you when it ships!`;

    // Map the shop domain to our internal shopId (assuming we store it, or strictly use shop domain for now)
    // The previous steps used 'shopId' for sessions. 
    // Usually, authenticate.webhook gives us 'shop' (domain).
    // We should ideally look up our internal ID.
    // For now, let's use the shop domain as the ID for simplicity in the prototype.
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
