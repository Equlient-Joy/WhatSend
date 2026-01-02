import { useLoaderData, data } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { 
  Page, 
  Card, 
  Button, 
  Text, 
  BlockStack, 
  InlineStack,
  Badge,
  Box,
  ProgressBar,
  Collapsible,
  Icon
} from "@shopify/polaris";
import { 
  OrderIcon,
  DeliveryIcon,
  AlertCircleIcon,
  NotificationIcon,
  PersonIcon,
  CartIcon,
  NoteIcon,
  ChatIcon,
  ProductIcon,
  WandIcon,
  SettingsIcon,
  MenuHorizontalIcon
} from "@shopify/polaris-icons";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { getAllAutomations, getShopConnectionStatus, getOrCreateShop, AUTOMATION_META, type AutomationType } from "../services/automation/automation.service";
import { getShopBillingStatus } from "../services/billing/billing.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Ensure shop and default automations exist
  await getOrCreateShop(shop);

  // Get automations and connection status
  const automations = await getAllAutomations(shop);
  const connectionStatus = await getShopConnectionStatus(shop);

  // Calculate setup progress with actual billing status
  const isConnected = connectionStatus?.whatsappConnected || false;
  const hasEnabledAutomation = automations.some(a => a.enabled);
  
  // Check actual billing status from database
  const billingStatus = await getShopBillingStatus(shop);
  const hasPlan = billingStatus.hasActiveSubscription;
  
  const setupSteps = [
    { id: 'plan', title: 'Choose a Plan', description: 'Select a subscription plan to start sending messages.', completed: hasPlan, action: 'Select Plan', link: '/app/plans' },
    { id: 'connect', title: 'Connect WhatsApp', description: 'Link your WhatsApp number to send messages.', completed: isConnected, action: 'Connect', link: '/app/whatsapp' },
    { id: 'automations', title: 'Enable Automations', description: 'Turn on message automations for your store.', completed: hasEnabledAutomation, action: 'Configure', link: '/app#automations' }
  ];
  
  const completedSteps = setupSteps.filter(s => s.completed).length;

  return data({
    shop,
    automations,
    isConnected,
    setupSteps,
    completedSteps,
    totalSteps: setupSteps.length,
    automationMeta: AUTOMATION_META
  });
};

// Icon mapping for automations
const automationIcons: Record<string, typeof OrderIcon> = {
  order_confirmation: OrderIcon,
  order_fulfillment: DeliveryIcon,
  order_cancellation: AlertCircleIcon,
  order_notification: NotificationIcon,
  admin_notification: PersonIcon,
  abandoned_checkout: CartIcon,
  draft_order_recovery: NoteIcon,
  auto_replier: ChatIcon,
  back_in_stock: ProductIcon,
};

// Feature row component matching WhatFlow reference design
function FeatureRow({ 
  icon: IconComponent, 
  title, 
  description, 
  isEnabled, 
  isComingSoon = false,
  settingsUrl,
  disabled = false,
  buttonLabel = "Settings"
}: {
  icon: typeof OrderIcon;
  title: string;
  description: string;
  isEnabled: boolean;
  isComingSoon?: boolean;
  settingsUrl?: string;
  disabled?: boolean;
  buttonLabel?: string;
}) {
  return (
    <Box padding="400">
      <InlineStack align="space-between" blockAlign="start" gap="400" wrap={false}>
        <InlineStack gap="300" blockAlign="start" wrap={false}>
          {/* Small inline icon */}
          <Box>
            <Icon source={IconComponent} tone="base" />
          </Box>
          
          {/* Title and description */}
          <BlockStack gap="100">
            <InlineStack gap="200" blockAlign="center" wrap>
              <Text as="span" variant="bodyMd" fontWeight="semibold">{title}</Text>
              {isComingSoon && <Badge tone="attention">Coming Soon</Badge>}
              <Badge tone={isEnabled ? "success" : undefined}>{isEnabled ? 'On' : 'Off'}</Badge>
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">{description}</Text>
          </BlockStack>
        </InlineStack>
        
        {/* Settings button */}
        <Button 
          url={settingsUrl} 
          disabled={disabled}
          variant="secondary"
        >
          {buttonLabel}
        </Button>
      </InlineStack>
    </Box>
  );
}

export default function AppHome() {
  const { 
    automations, 
    setupSteps, 
    completedSteps, 
    totalSteps,
    automationMeta,
    isConnected
  } = useLoaderData<typeof loader>();
  
  const [setupOpen, setSetupOpen] = useState(true);

  // Scroll to automations section when hash is present
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#automations') {
      const element = document.getElementById('automations');
      if (element) {
        setTimeout(() => element.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    }
  }, []);

  // Separate main automations from widgets/coming soon
  const mainAutomations: AutomationType[] = [
    'order_confirmation',
    'order_fulfillment', 
    'order_cancellation',
    'order_notification',
    'admin_notification',
    'abandoned_checkout',
    'draft_order_recovery'
  ];

  const comingSoonAutomations: AutomationType[] = [
    'auto_replier',
    'back_in_stock'
  ];

  const widgets = [
    { type: 'chat_button', title: 'WhatsApp Chat Button', description: 'Add a customizable WhatsApp chat button to your storefront for instant customer support.', icon: ChatIcon },
    { type: 'direct_order', title: 'WhatsApp Direct Order', description: 'Add a direct order button that allows customers to send their cart items via WhatsApp for quick ordering and checkout assistance.', icon: CartIcon },
    { type: 'product_button', title: 'WhatsApp Product Page Button', description: 'Add WhatsApp buttons to product pages allowing customers to inquire about specific products directly.', icon: ProductIcon }
  ];

  const getAutomationStatus = (type: string) => {
    const automation = automations.find(a => a.type === type);
    return automation?.enabled || false;
  };

  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  return (
    <Page
      title="WhatSend Home"
      secondaryActions={[
        { content: 'Plans', url: '/app/plans' }
      ]}
      primaryAction={
        <Button variant="primary" url="/app/whatsapp">
          Manage Connection
        </Button>
      }
    >
      <BlockStack gap="400">
        {/* Setup Guide - Collapsible Card */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Setup Guide</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Use this personalized guide to get your app up and running.
                </Text>
              </BlockStack>
              <InlineStack gap="200">
                <Button 
                  icon={MenuHorizontalIcon}
                  variant="tertiary" 
                  onClick={() => setSetupOpen(!setupOpen)}
                  accessibilityLabel="Toggle setup guide"
                />
              </InlineStack>
            </InlineStack>
            
            {/* Progress indicator */}
            <InlineStack gap="300" blockAlign="center">
              <Text as="span" variant="bodySm" tone="subdued">{completedSteps} / {totalSteps} completed</Text>
              <Box minWidth="200px">
                <ProgressBar progress={progressPercent} size="small" tone="primary" />
              </Box>
            </InlineStack>

            <Collapsible open={setupOpen} id="setup-guide">
              <BlockStack gap="400">
                {setupSteps.map((step, index) => (
                  <Box key={step.id} paddingBlockStart="200">
                    <InlineStack gap="300" blockAlign="start" wrap={false}>
                      {/* Step indicator circle */}
                      <Box>
                        <div style={{ 
                          width: '24px', 
                          height: '24px', 
                          borderRadius: '50%', 
                          backgroundColor: step.completed ? '#303030' : '#e4e5e7',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: step.completed ? 'white' : '#616161',
                          fontSize: '12px',
                          fontWeight: 500
                        }}>
                          {step.completed ? '✓' : index + 1}
                        </div>
                      </Box>
                      <BlockStack gap="200">
                        <Text as="span" variant="bodyMd" fontWeight="semibold">{step.title}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">{step.description}</Text>
                        {!step.completed && (
                          <Box>
                            <Button size="slim" url={step.link} variant="primary">{step.action}</Button>
                          </Box>
                        )}
                      </BlockStack>
                    </InlineStack>
                  </Box>
                ))}
              </BlockStack>
            </Collapsible>
          </BlockStack>
        </Card>

        {/* Welcome Card */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">Welcome to WhatSend</Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              Connect with your customers on WhatsApp and boost your sales with automated messaging workflows.
            </Text>
            <InlineStack gap="200">
              <Button icon={SettingsIcon} url="/app/plans">Plans & Usage</Button>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* WhatsApp Automation Features */}
        <Box id="automations">
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">WhatsApp Automation Features</Text>
            
            {/* Each automation in its own card */}
            {mainAutomations.map((type) => {
              const meta = automationMeta[type];
              const isEnabled = getAutomationStatus(type);
              const IconComponent = automationIcons[type] || OrderIcon;
              
              return (
                <Card key={type} padding="0">
                  <FeatureRow
                    icon={IconComponent}
                    title={meta.title}
                    description={meta.description}
                    isEnabled={isEnabled}
                    settingsUrl={`/app/automation/${type}`}
                  />
                </Card>
              );
            })}

            {/* Coming Soon Automations */}
            {comingSoonAutomations.map((type) => {
              const meta = automationMeta[type];
              const IconComponent = automationIcons[type] || OrderIcon;
              
              return (
                <Card key={type} padding="0">
                  <FeatureRow
                    icon={IconComponent}
                    title={meta.title}
                    description={meta.description}
                    isEnabled={false}
                    isComingSoon={true}
                    disabled={true}
                  />
                </Card>
              );
            })}
          </BlockStack>
        </Box>

        {/* WhatsApp Buttons & Widgets */}
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">WhatsApp Buttons & Widgets</Text>
          
          {/* Each widget in its own card */}
          {widgets.map((widget) => (
            <Card key={widget.type} padding="0">
              <FeatureRow
                icon={widget.icon}
                title={widget.title}
                description={widget.description}
                isEnabled={false}
                disabled={true}
              />
            </Card>
          ))}
        </BlockStack>

        {/* Shopify Flow Integration */}
        <Card padding="0">
          <Box padding="400">
            <InlineStack align="space-between" blockAlign="start" gap="400" wrap={false}>
              <InlineStack gap="300" blockAlign="start" wrap={false}>
                <Box>
                  <Icon source={WandIcon} tone="base" />
                </Box>
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Shopify Flow Integration</Text>
                    <Badge tone="success">Available</Badge>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Automate your WhatsApp messaging with Shopify Flow. Create custom workflows to send messages based on various triggers.
                  </Text>
                </BlockStack>
              </InlineStack>
              <Button variant="secondary">View Guide</Button>
            </InlineStack>
          </Box>
        </Card>

        {/* Bulk Message Sender */}
        <Card padding="0">
          <Box padding="400">
            <InlineStack align="space-between" blockAlign="start" gap="400" wrap={false}>
              <InlineStack gap="300" blockAlign="start" wrap={false}>
                <Box>
                  <Icon source={ChatIcon} tone="base" />
                </Box>
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Bulk Message Sender</Text>
                    <Badge tone="attention">Use with Caution</Badge>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Send WhatsApp messages to customer segments. Follow WhatsApp guidelines to avoid account suspension.
                  </Text>
                </BlockStack>
              </InlineStack>
              <Button variant="secondary" url="/app/campaigns/new">Open Tool</Button>
            </InlineStack>
          </Box>
        </Card>

        {/* WhatsApp Connection Card */}
        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingMd">WhatsApp Connection</Text>
            <Text as="p" tone="subdued">
              {isConnected ? 'Connected' : 'No account connected'}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              By clicking <strong>Connect</strong>, you agree to accept WhatSend&apos;s terms and conditions.
            </Text>
            <Box>
              <Button url="/app/whatsapp" variant={isConnected ? "secondary" : "primary"}>
                {isConnected ? 'Manage' : 'Connect'}
              </Button>
            </Box>
          </BlockStack>
        </Card>

        {/* Feedback Section */}
        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingMd">We&apos;d love to hear from you!</Text>
            <Text as="p" tone="subdued">
              Your feedback helps us improve and continue delivering the best experience possible. Let us know what you think and get a free surprise!
            </Text>
            <InlineStack gap="200">
              <Button variant="secondary">👍 Good</Button>
              <Button variant="secondary">👎 Bad</Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
