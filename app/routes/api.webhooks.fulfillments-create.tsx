import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { isAutomationEnabled, getAutomation, getOrCreateShop } from "../services/automation/automation.service";
import { processTemplate, formatPhoneForWhatsApp } from "../services/automation/template.service";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (!payload) {
    return new Response("No payload", { status: 400 });
  }

  console.log(`Received ${topic} webhook for ${shop}`);

  // Ensure shop exists
  await getOrCreateShop(shop);

  // Check if automation is enabled
  const isEnabled = await isAutomationEnabled(shop, 'order_fulfillment');
  if (!isEnabled) {
    console.log(`Order fulfillment automation is disabled for ${shop}`);
    return data({ success: true, skipped: "automation_disabled" }, { status: 200 });
  }

  const fulfillment = payload as {
    id?: string;
    order_id?: string | number;
    status?: string;
    tracking_number?: string;
    tracking_numbers?: string[];
    tracking_url?: string;
    tracking_urls?: string[];
    destination?: { 
      phone?: string; 
      first_name?: string;
    };
    line_items?: Array<{
      name?: string;
      title?: string;
      quantity?: number;
    }>;
  };

  const phone = fulfillment.destination?.phone;
  const customerName = fulfillment.destination?.first_name || 'Customer';

  if (!phone) {
    console.log(`No phone number found for fulfillment ${fulfillment.id}. Skipping WhatsApp notification.`);
    return data({ success: false, reason: "no_phone" }, { status: 200 });
  }

  // Get tracking info
  const trackingNumber = fulfillment.tracking_number || fulfillment.tracking_numbers?.[0] || '';
  const trackingUrl = fulfillment.tracking_url || fulfillment.tracking_urls?.[0] || '';

  // Get product list from line items
  const productList = fulfillment.line_items?.map(item => item.name || item.title).join(', ') || '';
  const productName = fulfillment.line_items?.[0]?.name || fulfillment.line_items?.[0]?.title || '';

  // Clean shop name
  const shopName = shop.replace('.myshopify.com', '');

  try {
    const automation = await getAutomation(shop, 'order_fulfillment');
    if (!automation?.template) {
      console.log(`No template found for order_fulfillment automation`);
      return data({ success: false, reason: "no_template" }, { status: 200 });
    }

    const message = processTemplate(automation.template, {
      customerName,
      trackingNumber,
      trackingUrl,
      productList,
      productName,
      shopName,
      orderNumber: fulfillment.order_id?.toString()
    });

    const { queueMessage } = await import("../services/queue/message-queue.service");

    await queueMessage({
      shopId: shop,
      phone: formatPhoneForWhatsApp(phone),
      message,
      messageType: 'order_fulfillment',
      orderId: fulfillment.order_id?.toString(),
      priority: 1
    });

    console.log(`Fulfillment notification queued for order ${fulfillment.order_id}`);
    return data({ success: true, queued: true });

  } catch (error) {
    console.error("Failed to process fulfillment webhook:", error);
    return data({ success: false, error: "internal_error" }, { status: 200 });
  }
};
