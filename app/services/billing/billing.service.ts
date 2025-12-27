import prisma from "../../db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

// Plan types
export type PlanType = "free" | "starter" | "growth" | "pro" | "lifetime";

// Plan limits
export const PLAN_LIMITS: Record<PlanType, number | null> = {
  free: 0,        // No messages allowed
  starter: 1500,
  growth: 3000,
  pro: null,      // Unlimited
  lifetime: null, // Unlimited
};

export interface BillingStatus {
  hasActiveSubscription: boolean;
  planType: PlanType;
  messagesSent: number;
  messagesLimit: number | null;
  messagesRemaining: number | null;
  canSendMessages: boolean;
  subscriptionId: string | null;
}

/**
 * Get billing status for a shop from database
 */
export async function getShopBillingStatus(shopDomain: string): Promise<BillingStatus> {
  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopDomain },
    select: {
      planType: true,
      messagesSent: true,
      messagesLimit: true,
      subscriptionId: true,
    },
  });

  if (!shop) {
    return {
      hasActiveSubscription: false,
      planType: "free",
      messagesSent: 0,
      messagesLimit: 0,
      messagesRemaining: 0,
      canSendMessages: false,
      subscriptionId: null,
    };
  }

  const planType = (shop.planType as PlanType) || "free";
  const limit = PLAN_LIMITS[planType];
  const messagesSent = shop.messagesSent || 0;
  
  // Lifetime and Pro have unlimited messages
  const isUnlimited = limit === null;
  const hasActiveSubscription = planType !== "free";
  const messagesRemaining = isUnlimited ? null : Math.max(0, (limit || 0) - messagesSent);
  const canSendMessages = hasActiveSubscription && (isUnlimited || (messagesRemaining !== null && messagesRemaining > 0));

  return {
    hasActiveSubscription,
    planType,
    messagesSent,
    messagesLimit: limit,
    messagesRemaining,
    canSendMessages,
    subscriptionId: shop.subscriptionId,
  };
}

/**
 * Check if shop has an active Shopify subscription via API
 */
export async function checkShopifySubscription(
  graphql: AdminApiContext["graphql"]
): Promise<{ hasActive: boolean; subscriptionId: string | null; planName: string | null }> {
  try {
    const response = await graphql(`
      query getAppSubscription {
        appInstallation {
          activeSubscriptions {
            id
            name
            status
          }
        }
      }
    `);

    const result = await response.json();
    const subscriptions = result.data?.appInstallation?.activeSubscriptions || [];
    
    // Find active subscription
    const activeSubscription = subscriptions.find(
      (sub: any) => sub.status === "ACTIVE"
    );

    if (activeSubscription) {
      return {
        hasActive: true,
        subscriptionId: activeSubscription.id,
        planName: activeSubscription.name,
      };
    }

    return { hasActive: false, subscriptionId: null, planName: null };
  } catch (error) {
    console.error("Error checking Shopify subscription:", error);
    return { hasActive: false, subscriptionId: null, planName: null };
  }
}

/**
 * Sync subscription status from Shopify to database
 */
export async function syncSubscriptionStatus(
  shopDomain: string,
  graphql: AdminApiContext["graphql"]
): Promise<BillingStatus> {
  const shopifyStatus = await checkShopifySubscription(graphql);
  
  // Get current shop status
  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopDomain },
    select: { planType: true, subscriptionId: true },
  });

  // If lifetime, never downgrade
  if (shop?.planType === "lifetime") {
    return getShopBillingStatus(shopDomain);
  }

  // Determine plan type from subscription name
  let newPlanType: PlanType = "free";
  if (shopifyStatus.hasActive && shopifyStatus.planName) {
    const planName = shopifyStatus.planName.toLowerCase();
    if (planName.includes("pro")) {
      newPlanType = "pro";
    } else if (planName.includes("growth")) {
      newPlanType = "growth";
    } else if (planName.includes("starter")) {
      newPlanType = "starter";
    }
  }

  // Update database if subscription changed
  if (shop?.subscriptionId !== shopifyStatus.subscriptionId || shop?.planType !== newPlanType) {
    await prisma.shop.update({
      where: { shopifyDomain: shopDomain },
      data: {
        planType: newPlanType,
        subscriptionId: shopifyStatus.subscriptionId,
        messagesLimit: PLAN_LIMITS[newPlanType] || 0,
      },
    });
  }

  return getShopBillingStatus(shopDomain);
}

/**
 * Redeem a promo code for a shop
 */
export async function redeemPromoCode(
  shopDomain: string,
  promoCode: string
): Promise<{ success: boolean; message: string }> {
  const LIFETIME_PROMO_CODE = "kardickLegaChoco";

  // Check if shop exists
  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopDomain },
    select: { planType: true },
  });

  if (!shop) {
    return { success: false, message: "Shop not found." };
  }

  // Check if already has lifetime
  if (shop.planType === "lifetime") {
    return { success: false, message: "You already have lifetime access!" };
  }

  // Validate promo code
  if (promoCode !== LIFETIME_PROMO_CODE) {
    return { success: false, message: "Invalid promo code. Please check and try again." };
  }

  // Apply lifetime access
  await prisma.shop.update({
    where: { shopifyDomain: shopDomain },
    data: {
      planType: "lifetime",
      messagesLimit: 0, // 0 means unlimited for lifetime
      subscriptionId: "PROMO_LIFETIME",
    },
  });

  return {
    success: true,
    message: "🎉 Congratulations! You now have lifetime access to all features!",
  };
}

/**
 * Increment message count for a shop
 */
export async function incrementMessageCount(
  shopDomain: string,
  count: number = 1
): Promise<void> {
  await prisma.shop.update({
    where: { shopifyDomain: shopDomain },
    data: {
      messagesSent: { increment: count },
    },
  });
}

/**
 * Reset monthly message count (call at billing cycle start)
 */
export async function resetMonthlyMessageCount(shopDomain: string): Promise<void> {
  await prisma.shop.update({
    where: { shopifyDomain: shopDomain },
    data: {
      messagesSent: 0,
      billingCycleStart: new Date(),
    },
  });
}

/**
 * Check if shop can send a specific number of messages
 */
export async function canSendMessages(
  shopDomain: string,
  messageCount: number
): Promise<{ allowed: boolean; reason?: string }> {
  const status = await getShopBillingStatus(shopDomain);

  if (!status.hasActiveSubscription) {
    return {
      allowed: false,
      reason: "No active subscription. Please subscribe to a plan to send messages.",
    };
  }

  // Unlimited plans
  if (status.messagesLimit === null) {
    return { allowed: true };
  }

  // Check quota
  if (status.messagesRemaining !== null && status.messagesRemaining < messageCount) {
    return {
      allowed: false,
      reason: `Message limit reached. You have ${status.messagesRemaining} messages remaining this month. Consider upgrading your plan.`,
    };
  }

  return { allowed: true };
}
