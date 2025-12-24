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
  const isEnabled = await isAutomationEnabled(shop, 'draft_order_recovery');
  if (!isEnabled) {
    console.log(`Draft order recovery automation is disabled for ${shop}`);
    return data({ success: true, skipped: "automation_disabled" }, { status: 200 });
  }

  const draftOrder = payload as {
    id?: string | number;
    name?: string;
    invoice_url?: string;
    status?: string;
    total_price?: string;
    currency?: string;
    customer?: { 
      phone?: string; 
      first_name?: string;
      email?: string;
    };
    shipping_address?: { 
      phone?: string;
      first_name?: string;
    };
    billing_address?: { 
      phone?: string;
      first_name?: string;
    };
    line_items?: Array<{
      name?: string;
      title?: string;
      quantity?: number;
    }>;
  };

  // Skip if draft order is completed
  if (draftOrder.status === 'completed') {
    console.log(`Draft order ${draftOrder.id} is completed, skipping notification`);
    return data({ success: true, skipped: "draft_completed" }, { status: 200 });
  }

  const phone = draftOrder.shipping_address?.phone || draftOrder.billing_address?.phone || draftOrder.customer?.phone;
  const customerName = draftOrder.shipping_address?.first_name || draftOrder.billing_address?.first_name || draftOrder.customer?.first_name || 'Customer';

  if (!phone) {
    console.log(`No phone number found for draft order ${draftOrder.id}. Skipping WhatsApp notification.`);
    return data({ success: false, reason: "no_phone" }, { status: 200 });
  }

  // Get product list
  const productList = draftOrder.line_items?.map(item => item.name || item.title).join(', ') || '';
  const productName = draftOrder.line_items?.[0]?.name || draftOrder.line_items?.[0]?.title || '';
  const orderTotal = draftOrder.total_price ? formatCurrency(draftOrder.total_price, draftOrder.currency) : '';

  // Clean shop name
  const shopName = shop.replace('.myshopify.com', '');

  try {
    const automation = await getAutomation(shop, 'draft_order_recovery');
    if (!automation?.template) {
      console.log(`No template found for draft_order_recovery automation`);
      return data({ success: false, reason: "no_template" }, { status: 200 });
    }

    const message = processTemplate(automation.template, {
      customerName,
      orderNumber: draftOrder.name || '',
      orderTotal,
      orderUrl: draftOrder.invoice_url || '',
      productList,
      productName,
      shopName
    });

    const { queueMessage } = await import("../services/queue/message-queue.service");

    // Add a small delay (default 30 minutes) for draft orders
    const delayMinutes = automation.delayMinutes || 30;
    const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);

    await queueMessage({
      shopId: shop,
      phone: formatPhoneForWhatsApp(phone),
      message,
      messageType: 'draft_order_recovery',
      orderId: draftOrder.id?.toString(),
      orderNumber: draftOrder.name,
      scheduledAt,
      priority: 4
    });

    console.log(`Draft order recovery notification scheduled for ${draftOrder.id}`);
    return data({ success: true, queued: true, scheduledAt: scheduledAt.toISOString() });

  } catch (error) {
    console.error("Failed to process draft_orders/update webhook:", error);
    return data({ success: false, error: "internal_error" }, { status: 200 });
  }
};
