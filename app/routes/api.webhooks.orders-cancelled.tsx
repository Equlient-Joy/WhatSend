import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { isAutomationEnabled, getAutomation, getOrCreateShop } from "../services/automation/automation.service";
import { processTemplate, formatPhoneForWhatsApp, formatCurrency } from "../services/automation/template.service";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (!payload) {
    return new Response("No payload", { status: 400 });
  }

  console.log(`Received ${topic} webhook for ${shop}`);

  // Ensure shop exists
  await getOrCreateShop(shop);

  // Check if automation is enabled
  const isEnabled = await isAutomationEnabled(shop, 'order_cancellation');
  if (!isEnabled) {
    console.log(`Order cancellation automation is disabled for ${shop}`);
    return data({ success: true, skipped: "automation_disabled" }, { status: 200 });
  }

  const order = payload as {
    id?: string | number;
    name?: string;
    order_number?: string | number;
    total_price?: string;
    currency?: string;
    cancel_reason?: string;
    shipping_address?: { phone?: string; first_name?: string };
    billing_address?: { phone?: string; first_name?: string };
    customer?: { phone?: string; first_name?: string; email?: string };
    line_items?: Array<{
      name?: string;
      title?: string;
      quantity?: number;
    }>;
  };

  const orderId = order.id?.toString();
  const orderNumber = order.name || `#${order.order_number}`;
  
  const phone = order.shipping_address?.phone || order.billing_address?.phone || order.customer?.phone;
  const customerName = order.shipping_address?.first_name || order.billing_address?.first_name || order.customer?.first_name || 'Customer';

  if (!phone) {
    console.log(`No phone number found for cancelled order ${orderNumber}. Skipping WhatsApp notification.`);
    return data({ success: false, reason: "no_phone" }, { status: 200 });
  }

  // Get product list
  const productList = order.line_items?.map(item => item.name || item.title).join(', ') || '';
  const productName = order.line_items?.[0]?.name || order.line_items?.[0]?.title || '';
  const orderTotal = order.total_price ? formatCurrency(order.total_price, order.currency) : '';

  // Clean shop name
  const shopName = shop.replace('.myshopify.com', '');

  try {
    const automation = await getAutomation(shop, 'order_cancellation');
    if (!automation?.template) {
      console.log(`No template found for order_cancellation automation`);
      return data({ success: false, reason: "no_template" }, { status: 200 });
    }

    const message = processTemplate(automation.template, {
      customerName,
      orderNumber,
      orderTotal,
      productList,
      productName,
      shopName
    });

    const { queueMessage } = await import("../services/queue/message-queue.service");

    await queueMessage({
      shopId: shop,
      phone: formatPhoneForWhatsApp(phone),
      message,
      messageType: 'order_cancellation',
      orderId,
      orderNumber,
      priority: 2
    });

    console.log(`Order cancellation notification queued for ${orderNumber}`);
    return data({ success: true, queued: true });

  } catch (error) {
    console.error("Failed to process orders/cancelled webhook:", error);
    return data({ success: false, error: "internal_error" }, { status: 200 });
  }
};
