import prisma from "../../db.server";
import { 
  type AutomationType, 
  DEFAULT_DELAYS, 
  AUTOMATION_META 
} from "./automation.constants";

// Re-export for backwards compatibility
export { type AutomationType, DEFAULT_DELAYS, AUTOMATION_META };

// Default templates for each automation type
const DEFAULT_TEMPLATES: Record<AutomationType, string> = {
  order_confirmation: `Thank you for your order from {shopName}. This is a confirmation message.

*Order Details:*

Order ID: {orderId}
Order Number: {orderNumber}

*Items:* {itemsXquantity}
*Subtotal:* {subtotal}

*Address:* {address}
*City:* {city}

Please confirm your order.`,

  order_fulfillment: `📦 Great news, *{shippingFirstName}*!

Your recent order from *{shopName}*, *#{orderNumber}*, has been carefully packed and is now on its way to you! 📦

It's being shipped via *{carrier}* with tracking number *{trackingNumber}*.

You can easily follow its journey here:
🔗 {trackingUrl}

Your order included:
* {itemsXquantity}

We appreciate your business! 😊`,

  order_cancellation: `🚫 We regret to inform you, *{billingFirstName}*, that your order *#{orderNumber}* from *{shopName}* has been cancelled.

If you have any questions regarding this cancellation, please do not hesitate to contact our support team. We apologize for any inconvenience this may cause.

Your order details were:
* {itemsXquantity}`,

  order_notification: `🎉 Wonderful!

We've successfully received your order *#{orderNumber}* at *{shopName}*, *{firstName}*! Thank you for choosing us.

We're now processing your order which includes:
* {itemsXquantity}

You'll receive another notification with tracking information as soon as your order ships. We're excited for you to receive your items! 😊`,

  admin_notification: `🔔 New Order Alert!

Order #{{order_number}}
Customer: {{customer_name}}
Total: {{order_total}}
Items: {{product_list}}`,

  abandoned_checkout: `🛒 *Checkout Reminder!*
Hi *{billingFirstName}*, you left items in your cart at *WhatFlow*!
Complete your purchase: {recoveryLink}`,

  draft_order_recovery: `Hi {{customer_name}}!

You have a pending order waiting for you.

Complete your order here: {{order_url}}

Let us know if you need any help!`,

  auto_replier: `Thank you for your message! We'll get back to you shortly.`,

  back_in_stock: `Great news, {{customer_name}}! 🎉

{{product_name}} is back in stock!

Get yours before it sells out again: {{product_url}}`
};

/**
 * Get or create a Shop record by domain
 */
export async function getOrCreateShop(shopDomain: string, accessToken?: string): Promise<string> {
  let shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopDomain }
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        shopifyDomain: shopDomain,
        accessToken: accessToken || '',
      }
    });
    // Create default automations
    await createDefaultAutomations(shop.id);
  }

  return shop.id;
}

/**
 * Create default automations for a new shop
 */
export async function createDefaultAutomations(shopId: string): Promise<void> {
  const automationTypes: AutomationType[] = [
    'order_confirmation',
    'order_fulfillment', 
    'order_cancellation',
    'order_notification',
    'admin_notification',
    'abandoned_checkout',
    'draft_order_recovery',
    'auto_replier',
    'back_in_stock'
  ];

  for (const type of automationTypes) {
    await prisma.automation.upsert({
      where: { shopId_type: { shopId, type } },
      create: {
        shopId,
        type,
        enabled: false,
        template: DEFAULT_TEMPLATES[type],
        delayMinutes: type === 'abandoned_checkout' ? 120 : 0 // 2 hour delay for abandoned checkout
      },
      update: {} // Don't update if exists
    });
  }
}

/**
 * Check if a specific automation is enabled for a shop
 */
export async function isAutomationEnabled(shopDomain: string, type: AutomationType): Promise<boolean> {
  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopDomain },
    include: {
      automations: {
        where: { type }
      }
    }
  });

  if (!shop || shop.automations.length === 0) {
    return false;
  }

  return shop.automations[0].enabled;
}

/**
 * Get automation settings for a shop
 */
export async function getAutomation(shopDomain: string, type: AutomationType) {
  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopDomain },
    include: {
      automations: {
        where: { type }
      }
    }
  });

  if (!shop || shop.automations.length === 0) {
    return null;
  }

  return shop.automations[0];
}

/**
 * Get all automations for a shop
 */
export async function getAllAutomations(shopDomain: string) {
  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopDomain },
    include: { automations: true }
  });

  return shop?.automations || [];
}

/**
 * Update automation settings
 */
export async function updateAutomation(
  shopDomain: string, 
  type: AutomationType, 
  data: { enabled?: boolean; template?: string; delayMinutes?: number; sendProductImages?: boolean; conditions?: object }
) {
  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopDomain }
  });

  if (!shop) {
    throw new Error('Shop not found');
  }

  return prisma.automation.upsert({
    where: { shopId_type: { shopId: shop.id, type } },
    create: {
      shopId: shop.id,
      type,
      enabled: data.enabled ?? false,
      template: data.template ?? DEFAULT_TEMPLATES[type],
      delayMinutes: data.delayMinutes ?? 0,
      sendProductImages: data.sendProductImages ?? false,
      conditions: data.conditions ?? undefined
    },
    update: {
      enabled: data.enabled,
      template: data.template,
      delayMinutes: data.delayMinutes,
      sendProductImages: data.sendProductImages,
      conditions: data.conditions ?? undefined
    }
  });
}

/**
 * Get shop's WhatsApp connection status
 */
export async function getShopConnectionStatus(shopDomain: string) {
  try {
    const shop = await prisma.shop.findUnique({
      where: { shopifyDomain: shopDomain },
      select: {
        whatsappConnected: true,
        connectionStatus: true,
        whatsappNumber: true,
        lastConnectedAt: true,
        testPhone: true
      }
    });
    return shop;
  } catch (error) {
    // Fallback if testPhone column doesn't exist yet (migration not run)
    console.warn('getShopConnectionStatus fallback - testPhone may not exist:', error);
    const shop = await prisma.shop.findUnique({
      where: { shopifyDomain: shopDomain },
      select: {
        whatsappConnected: true,
        connectionStatus: true,
        whatsappNumber: true,
        lastConnectedAt: true
      }
    });
    return shop ? { ...shop, testPhone: null } : null;
  }
}

/**
 * Get test phone number for a shop
 */
export async function getTestPhone(shopDomain: string): Promise<string | null> {
  try {
    const shop = await prisma.shop.findUnique({
      where: { shopifyDomain: shopDomain },
      select: { testPhone: true }
    });
    return shop?.testPhone || null;
  } catch (error) {
    // Column may not exist yet
    console.warn('getTestPhone fallback - testPhone may not exist:', error);
    return null;
  }
}

/**
 * Set test phone number for a shop
 */
export async function setTestPhone(shopDomain: string, testPhone: string): Promise<void> {
  try {
    await prisma.shop.update({
      where: { shopifyDomain: shopDomain },
      data: { testPhone }
    });
  } catch (error) {
    console.error('setTestPhone error - testPhone column may not exist:', error);
    throw new Error('Unable to save test phone number. Please try again later.');
  }
}
