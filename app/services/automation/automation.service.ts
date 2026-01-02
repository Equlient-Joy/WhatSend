import prisma from "../../db.server";

// Automation type definitions
export type AutomationType =
  | 'order_confirmation'
  | 'order_fulfillment'
  | 'order_cancellation'
  | 'order_notification'
  | 'admin_notification'
  | 'abandoned_checkout'
  | 'draft_order_recovery'
  | 'auto_replier'
  | 'back_in_stock';

// Default templates for each automation type
const DEFAULT_TEMPLATES: Record<AutomationType, string> = {
  order_confirmation: `Hi {{customer_name}}! 🎉

Your order #{{order_number}} has been confirmed!

Items: {{product_list}}

Thank you for shopping with us!`,

  order_fulfillment: `Great news, {{customer_name}}! 🚚

Your order #{{order_number}} has been shipped!

{{#if tracking_number}}
Tracking: {{tracking_number}}
{{/if}}
{{#if tracking_url}}
Track here: {{tracking_url}}
{{/if}}

Thank you for your patience!`,

  order_cancellation: `Hi {{customer_name}},

Your order #{{order_number}} has been cancelled as requested.

If you have any questions, please contact us.

Thank you.`,

  order_notification: `Hi {{customer_name}}! 📦

We've received your order #{{order_number}}.

Items: {{product_list}}

We'll keep you updated!`,

  admin_notification: `🔔 New Order Alert!

Order #{{order_number}}
Customer: {{customer_name}}
Total: {{order_total}}
Items: {{product_list}}`,

  abandoned_checkout: `Hi {{customer_name}}! 👋

We noticed you left some items in your cart.

Complete your purchase here: {{checkout_url}}

Need help? Just reply to this message!`,

  draft_order_recovery: `Hi {{customer_name}}!

You have a pending order waiting for you.

Complete your order here: {{order_url}}

Let us know if you need any help!`,

  auto_replier: `Thank you for your message! We'll get back to you shortly.`,

  back_in_stock: `Great news, {{customer_name}}! 🎉

{{product_name}} is back in stock!

Get yours before it sells out again: {{product_url}}`
};

// Automation metadata for UI
export const AUTOMATION_META: Record<AutomationType, { 
  title: string; 
  description: string; 
  icon: string;
  comingSoon?: boolean;
}> = {
  order_confirmation: {
    title: 'Order Confirmation',
    description: 'Configure how your customers confirm orders via WhatsApp. Set up custom messages and response options.',
    icon: '📋'
  },
  order_fulfillment: {
    title: 'Order Fulfillment',
    description: 'Keep customers updated when their orders are being processed and shipped.',
    icon: '📦'
  },
  order_cancellation: {
    title: 'Order Cancellation',
    description: 'Notify customers when their orders are cancelled and provide them with relevant information.',
    icon: '❌'
  },
  order_notification: {
    title: 'Order Notification',
    description: 'Send simple notification messages to customers when orders are placed, without requiring confirmation.',
    icon: '🔔'
  },
  admin_notification: {
    title: 'Admin Notification',
    description: 'Send order notifications to multiple admin WhatsApp numbers when new orders are placed.',
    icon: '👤'
  },
  abandoned_checkout: {
    title: 'Abandoned Checkout',
    description: 'Recover lost sales by automatically reaching out to customers who abandon their shopping carts.',
    icon: '🛒'
  },
  draft_order_recovery: {
    title: 'Draft Order Recovery',
    description: 'Follow up on draft orders with automated WhatsApp messages to convert them into completed orders.',
    icon: '📝'
  },
  auto_replier: {
    title: 'Auto Replier',
    description: 'Set up automated WhatsApp replies to common customer questions using keywords or fixed phrases.',
    icon: '💬',
    comingSoon: true
  },
  back_in_stock: {
    title: 'Back In Stock Alerts',
    description: 'Automatically notify customers via WhatsApp when products are back in stock. Capture interest and boost sales.',
    icon: '📢',
    comingSoon: true
  }
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
  data: { enabled?: boolean; template?: string; delayMinutes?: number; conditions?: object }
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
      conditions: data.conditions ?? undefined
    },
    update: {
      enabled: data.enabled,
      template: data.template,
      delayMinutes: data.delayMinutes,
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
