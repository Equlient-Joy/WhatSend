import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { isAutomationEnabled, getAutomation, getOrCreateShop } from "../services/automation/automation.service";
import { processTemplate, extractProductInfo, formatPhoneForWhatsApp, formatCurrency } from "../services/automation/template.service";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (!payload) {
    return new Response("No payload", { status: 400 });
  }

  console.log(`Received ${topic} webhook for ${shop}`);

  // Ensure shop exists in database
  await getOrCreateShop(shop);

  const order = payload as {
    id?: string | number;
    name?: string;
    order_number?: string | number;
    total_price?: string;
    currency?: string;
    shipping_address?: { phone?: string; first_name?: string };
    billing_address?: { phone?: string; first_name?: string };
    customer?: { phone?: string; first_name?: string; email?: string };
    line_items?: Array<{
      name?: string;
      title?: string;
      quantity?: number;
      product_id?: string | number;
    }>;
  };

  const orderId = order.id?.toString();
  const orderNumber = order.name || `#${order.order_number}`;
  
  // Try to find customer phone and name
  const phone = order.shipping_address?.phone || order.billing_address?.phone || order.customer?.phone;
  const customerName = order.shipping_address?.first_name || order.billing_address?.first_name || order.customer?.first_name || 'Customer';

  if (!phone) {
    console.log(`No phone number found for order ${orderNumber}. Skipping WhatsApp notification.`);
    return data({ success: false, reason: "no_phone" }, { status: 200 });
  }

  // Extract product info
  const { productList, productName } = extractProductInfo(order.line_items || []);
  const orderTotal = order.total_price ? formatCurrency(order.total_price, order.currency) : '';

  // Clean shop name (remove .myshopify.com)
  const shopName = shop.replace('.myshopify.com', '');

  try {
    const { queueMessage } = await import("../services/queue/message-queue.service");
    
    // Process Order Confirmation automation
    const orderConfirmationEnabled = await isAutomationEnabled(shop, 'order_confirmation');
    if (orderConfirmationEnabled) {
      const automation = await getAutomation(shop, 'order_confirmation');
      if (automation?.template) {
        const message = processTemplate(automation.template, {
          customerName,
          orderNumber,
          orderTotal,
          productList,
          productName,
          shopName
        });

        await queueMessage({
          shopId: shop,
          phone: formatPhoneForWhatsApp(phone),
          message,
          messageType: 'order_confirmation',
          orderId,
          orderNumber,
          priority: 1
        });

        console.log(`Order confirmation queued for ${orderNumber}`);
      }
    }

    // Process Order Notification automation (simpler, no confirmation)
    const orderNotificationEnabled = await isAutomationEnabled(shop, 'order_notification');
    if (orderNotificationEnabled) {
      const automation = await getAutomation(shop, 'order_notification');
      if (automation?.template) {
        const message = processTemplate(automation.template, {
          customerName,
          orderNumber,
          orderTotal,
          productList,
          productName,
          shopName
        });

        await queueMessage({
          shopId: shop,
          phone: formatPhoneForWhatsApp(phone),
          message,
          messageType: 'order_notification',
          orderId,
          orderNumber,
          priority: 2
        });

        console.log(`Order notification queued for ${orderNumber}`);
      }
    }

    // Process Admin Notification automation
    const adminNotificationEnabled = await isAutomationEnabled(shop, 'admin_notification');
    if (adminNotificationEnabled) {
      const automation = await getAutomation(shop, 'admin_notification');
      if (automation?.template && automation.conditions) {
        // Admin phone is stored in conditions as { adminPhone: "..." }
        const conditions = automation.conditions as { adminPhone?: string };
        if (conditions.adminPhone) {
          const message = processTemplate(automation.template, {
            customerName,
            orderNumber,
            orderTotal,
            productList,
            productName,
            shopName
          });

          await queueMessage({
            shopId: shop,
            phone: formatPhoneForWhatsApp(conditions.adminPhone),
            message,
            messageType: 'admin_notification',
            orderId,
            orderNumber,
            priority: 3
          });

          console.log(`Admin notification queued for ${orderNumber}`);
        }
      }
    }

    return data({ success: true, queued: true });

  } catch (error) {
    console.error("Failed to process orders/create webhook:", error);
    return data({ success: false, error: "internal_error" }, { status: 200 });
  }
};
