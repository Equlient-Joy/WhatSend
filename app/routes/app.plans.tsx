import { Page, Layout, Card, BlockStack, Text, Button, Grid, Box, Badge, TextField, Banner, InlineStack, Divider } from "@shopify/polaris";
import { useState } from "react";
import { useFetcher, data, redirect, useLoaderData, Form } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { redeemPromoCode, syncSubscriptionStatus } from "../services/billing/billing.service";

// Plan definitions with pricing in INR (paise for Shopify)
const PLANS = {
  starter: {
    name: "Starter Plan",
    firstMonthPrice: 400,
    recurringPrice: 300,
    messageLimit: 1500,
    description: "Ideal for small-scale users, offering up to 1,500 messages before automatic upgrades."
  },
  growth: {
    name: "Growth Plan", 
    firstMonthPrice: 800,
    recurringPrice: 600,
    messageLimit: 3000,
    description: "Perfect for expanding businesses, allowing up to 3,000 messages before upgrading."
  },
  pro: {
    name: "Pro Plan",
    firstMonthPrice: 1400,
    recurringPrice: 1000,
    messageLimit: null, // Unlimited
    description: "For high-volume senders who need unlimited messaging power."
  }
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  try {
    // Get current billing status and sync with Shopify
    const billingStatus = await syncSubscriptionStatus(session.shop, admin.graphql);
    return data({ billingStatus });
  } catch (error) {
    console.error('Error loading billing status:', error);
    // Return default billing status if database query fails
    return data({ 
      billingStatus: {
        hasActiveSubscription: false,
        planType: 'free' as const,
        messagesSent: 0,
        messagesLimit: 0,
        messagesRemaining: 0,
        canSendMessages: false,
        subscriptionId: null
      }
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "redeem") {
    const promoCode = formData.get("promoCode") as string;
    
    // Use billing service to redeem promo code (saves to database)
    const result = await redeemPromoCode(session.shop, promoCode);
    return data(result);
  }

  if (intent === "subscribe") {
    const planKey = formData.get("plan") as keyof typeof PLANS;
    const plan = PLANS[planKey];

    if (!plan) {
      return data({ success: false, message: "Invalid plan selected." });
    }

    // Create app subscription using Shopify Billing API
    // For first month, we use the firstMonthPrice. Shopify handles subsequent billing.
    // Note: Shopify's recurring billing charges the same amount each interval.
    // For different first-month pricing, you would use a discount on the first billing cycle.
    const response = await admin.graphql(`
      mutation CreateSubscription($name: String!, $returnUrl: URL!, $price: Decimal!, $currencyCode: CurrencyCode!) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          lineItems: [{
            plan: {
              appRecurringPricingDetails: {
                price: { amount: $price, currencyCode: $currencyCode }
                interval: EVERY_30_DAYS
              }
            }
          }]
        ) {
          appSubscription {
            id
            status
          }
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        name: plan.name,
        returnUrl: `https://${session.shop}/admin/apps/whatsend`,
        price: plan.recurringPrice.toString(),
        currencyCode: "INR"
      }
    });

    const result = await response.json();
    
    if (result.data?.appSubscriptionCreate?.userErrors?.length > 0) {
      return data({ 
        success: false, 
        message: result.data.appSubscriptionCreate.userErrors.map((e: any) => e.message).join(", ") 
      });
    }

    const confirmationUrl = result.data?.appSubscriptionCreate?.confirmationUrl;
    
    if (confirmationUrl) {
      // Redirect merchant to Shopify's payment confirmation page
      return redirect(confirmationUrl);
    }

    return data({ success: false, message: "Failed to create subscription. Please try again." });
  }

  return data({ success: false, message: "Unknown action" });
};

export default function PlansPage() {
  const { billingStatus } = useLoaderData<typeof loader>();
  const [promoCode, setPromoCode] = useState("");
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();

  const isSubmitting = fetcher.state === "submitting";
  const hasLifetime = billingStatus.planType === "lifetime";
  const hasActivePlan = billingStatus.hasActiveSubscription;

  return (
    <Page title="Plans & Pricing" backAction={{ content: 'Back', url: '/app' }}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {/* Current Plan Status */}
            {hasLifetime && (
              <Banner tone="success" title="🎉 Lifetime Access Active">
                <p>You have lifetime access to all features! Enjoy unlimited messaging.</p>
              </Banner>
            )}
            {hasActivePlan && !hasLifetime && (
              <Banner tone="info" title={`Current Plan: ${billingStatus.planType.charAt(0).toUpperCase() + billingStatus.planType.slice(1)}`}>
                <p>
                  Messages sent this month: {billingStatus.messagesSent.toLocaleString()}
                  {billingStatus.messagesLimit !== null && ` / ${billingStatus.messagesLimit.toLocaleString()}`}
                </p>
              </Banner>
            )}

            {/* Header */}
            <div style={{textAlign: 'center'}}>
              <Text as="h1" variant="headingXl">Choose the right plan for your business</Text>
              <Box paddingBlockStart="200">
                <Text as="p" variant="bodyLg" tone="subdued">
                  Upgrade anytime to unlock more messages and features.
                </Text>
              </Box>
            </div>

            {/* Promo Code Section */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Have a Promo Code?</Text>
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="redeem" />
                  <InlineStack gap="300" blockAlign="end">
                    <div style={{flexGrow: 1}}>
                      <TextField
                        label="Promo Code"
                        value={promoCode}
                        onChange={setPromoCode}
                        name="promoCode"
                        placeholder="Enter your promo code"
                        autoComplete="off"
                      />
                    </div>
                    <Button submit loading={isSubmitting && fetcher.formData?.get("intent") === "redeem"}>
                      Redeem Code
                    </Button>
                  </InlineStack>
                </fetcher.Form>
                {fetcher.data?.message && (
                  <Banner tone={fetcher.data.success ? "success" : "critical"}>
                    <p>{fetcher.data.message}</p>
                  </Banner>
                )}
              </BlockStack>
            </Card>
            
            {/* Pricing Grid */}
            <Grid>
              {/* Starter Plan */}
              <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 2, lg: 4, xl: 4}}>
                <Card>
                  <BlockStack gap="400">
                    <Box paddingBlockEnd="400" borderBlockEndWidth="025" borderColor="border-secondary">
                      <BlockStack gap="200">
                        <Text as="h2" variant="headingLg" alignment="center">Starter</Text>
                        <Text as="p" tone="subdued" alignment="center">
                          {PLANS.starter.description}
                        </Text>
                      </BlockStack>
                    </Box>
                    
                    <BlockStack gap="100">
                      <Text as="h3" variant="heading2xl" alignment="center">
                        ₹{PLANS.starter.firstMonthPrice} <span style={{fontSize: '1rem', color: '#6d7175'}}>first month</span>
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                        then ₹{PLANS.starter.recurringPrice} / month
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="200">
                      <PlanFeature>Up to {PLANS.starter.messageLimit?.toLocaleString()} messages / month</PlanFeature>
                      <PlanFeature>All automation features</PlanFeature>
                      <PlanFeature>Basic templates</PlanFeature>
                      <PlanFeature>Auto-upgrade to Growth if exceeded</PlanFeature>
                    </BlockStack>

                    <Form method="post">
                      <input type="hidden" name="intent" value="subscribe" />
                      <input type="hidden" name="plan" value="starter" />
                      <Button submit fullWidth>
                        Subscribe
                      </Button>
                    </Form>
                  </BlockStack>
                </Card>
              </Grid.Cell>

              {/* Growth Plan */}
              <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 2, lg: 4, xl: 4}}>
                <div style={{position: 'relative'}}>
                  <div style={{position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', zIndex: 1}}>
                    <Badge tone="success">Most Popular</Badge>
                  </div>
                  <Card>
                    <BlockStack gap="400">
                      <Box paddingBlockEnd="400" borderBlockEndWidth="025" borderColor="border-secondary">
                        <BlockStack gap="200">
                          <Text as="h2" variant="headingLg" alignment="center">Growth</Text>
                          <Text as="p" tone="subdued" alignment="center">
                            {PLANS.growth.description}
                          </Text>
                        </BlockStack>
                      </Box>

                      <BlockStack gap="100">
                        <Text as="h3" variant="heading2xl" alignment="center">
                          ₹{PLANS.growth.firstMonthPrice} <span style={{fontSize: '1rem', color: '#6d7175'}}>first month</span>
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                          then ₹{PLANS.growth.recurringPrice} / month
                        </Text>
                      </BlockStack>

                      <Divider />

                      <BlockStack gap="200">
                        <PlanFeature>Up to {PLANS.growth.messageLimit?.toLocaleString()} messages / month</PlanFeature>
                        <PlanFeature>All automation features</PlanFeature>
                        <PlanFeature>Advanced segmentation</PlanFeature>
                        <PlanFeature>Bulk campaigns</PlanFeature>
                        <PlanFeature>Auto-upgrade to Pro if exceeded</PlanFeature>
                      </BlockStack>

                      <Form method="post">
                        <input type="hidden" name="intent" value="subscribe" />
                        <input type="hidden" name="plan" value="growth" />
                        <Button submit variant="primary" fullWidth>
                          Subscribe
                        </Button>
                      </Form>
                    </BlockStack>
                  </Card>
                </div>
              </Grid.Cell>

              {/* Pro Plan */}
              <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 2, lg: 4, xl: 4}}>
                <Card>
                  <BlockStack gap="400">
                    <Box paddingBlockEnd="400" borderBlockEndWidth="025" borderColor="border-secondary">
                      <BlockStack gap="200">
                        <Text as="h2" variant="headingLg" alignment="center">Pro</Text>
                        <Text as="p" tone="subdued" alignment="center">
                          {PLANS.pro.description}
                        </Text>
                      </BlockStack>
                    </Box>

                    <BlockStack gap="100">
                      <Text as="h3" variant="heading2xl" alignment="center">
                        ₹{PLANS.pro.firstMonthPrice} <span style={{fontSize: '1rem', color: '#6d7175'}}>first month</span>
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                        then ₹{PLANS.pro.recurringPrice} / month
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="200">
                      <PlanFeature>Unlimited messages</PlanFeature>
                      <PlanFeature>All automation features</PlanFeature>
                      <PlanFeature>Priority support</PlanFeature>
                      <PlanFeature>Advanced analytics</PlanFeature>
                      <PlanFeature>API access</PlanFeature>
                    </BlockStack>

                    <Form method="post">
                      <input type="hidden" name="intent" value="subscribe" />
                      <input type="hidden" name="plan" value="pro" />
                      <Button submit fullWidth>
                        Subscribe
                      </Button>
                    </Form>
                  </BlockStack>
                </Card>
              </Grid.Cell>
            </Grid>

            {/* Warning for Pro users */}
            <Banner tone="warning" title="Important Notice for High-Volume Senders">
              <p>
                While our Pro plan offers unlimited messaging, please use this responsibly to avoid account suspension. 
                For very high-volume messaging needs (&gt;10,000 messages/day), we recommend migrating to the 
                <strong> Official Meta WhatsApp Business API</strong> for better reliability and compliance.
              </p>
            </Banner>

            {/* Currency Notice */}
            <Text as="p" variant="bodySm" tone="subdued" alignment="center">
              All prices are in Indian Rupees (INR). Prices may vary based on your region.
            </Text>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function PlanFeature({children}: {children: React.ReactNode}) {
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
      <div style={{width: '20px', color: '#008060'}}>
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
      </div>
      <Text as="span" variant="bodyMd">{children}</Text>
    </div>
  );
}
