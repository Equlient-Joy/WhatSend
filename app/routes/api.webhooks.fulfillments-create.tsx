import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (!payload) {
    return new Response("No payload", { status: 400 });
  }

  console.log(`Received ${topic} webhook for ${shop}`);

  const fulfillment = payload as {
    id?: string;
    order_id?: string;
    status?: string;
    tracking_number?: string;
    tracking_url?: string;
    destination?: { phone?: string };
  };

  const phone = fulfillment.destination?.phone;

  if (!phone) {
    console.log(`No phone number found for fulfillment ${fulfillment.id}. Skipping WhatsApp notification.`);
    return data({ success: false, reason: "no_phone" }, { status: 200 });
  }

  try {
    const { queueMessage } = await import("../services/queue/message-queue.service");

    let message = `Great news! Your order from ${shop} has been shipped!`;
    if (fulfillment.tracking_number) {
      message += ` Tracking number: ${fulfillment.tracking_number}`;
    }
    if (fulfillment.tracking_url) {
      message += ` Track here: ${fulfillment.tracking_url}`;
    }

    await queueMessage({
      shopId: shop,
      phone,
      message,
      priority: 1
    });

    return data({ success: true, queued: true });

  } catch (error) {
    console.error("Failed to process fulfillment webhook:", error);
    return data({ success: false, error: "internal_error" }, { status: 200 });
  }
};
