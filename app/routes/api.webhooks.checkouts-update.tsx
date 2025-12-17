import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (!payload) {
    return new Response("No payload", { status: 400 });
  }

  console.log(`Received ${topic} webhook for ${shop}`);

  const checkout = payload as {
    id?: string;
    token?: string;
    abandoned_checkout_url?: string;
    customer?: { phone?: string };
    shipping_address?: { phone?: string };
    billing_address?: { phone?: string };
  };

  const phone = checkout.shipping_address?.phone || checkout.billing_address?.phone || checkout.customer?.phone;

  if (!phone) {
    console.log(`No phone number found for checkout ${checkout.id}. Skipping WhatsApp notification.`);
    return data({ success: false, reason: "no_phone" }, { status: 200 });
  }

  try {
    const { queueMessage } = await import("../services/queue/message-queue.service");

    const message = `Hi! We noticed you left some items in your cart at ${shop}. Complete your purchase here: ${checkout.abandoned_checkout_url || 'our store'}`;

    await queueMessage({
      shopId: shop,
      phone,
      message,
      priority: 2
    });

    return data({ success: true, queued: true });

  } catch (error) {
    console.error("Failed to process checkout webhook:", error);
    return data({ success: false, error: "internal_error" }, { status: 200 });
  }
};
