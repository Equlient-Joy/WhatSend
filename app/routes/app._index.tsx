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
  Collapsible
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
  WandIcon
} from "@shopify/polaris-icons";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { getAllAutomations, getShopConnectionStatus, getOrCreateShop, AUTOMATION_META, type AutomationType } from "../services/automation/automation.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Ensure shop and default automations exist
  await getOrCreateShop(shop);

  // Get automations and connection status
  const automations = await getAllAutomations(shop);
  const connectionStatus = await getShopConnectionStatus(shop);

  // Calculate setup progress
  const isConnected = connectionStatus?.whatsappConnected || false;
  const hasEnabledAutomation = automations.some(a => a.enabled);
  const hasPlan = true; // For now, assume free plan
  
  const setupSteps = [
    { id: 'plan', title: 'Choose a Plan', description: 'Select a subscription plan to start sending messages.', completed: hasPlan, action: 'Select Plan', link: '/app/plans' },
    { id: 'connect', title: 'Connect WhatsApp', description: 'Link your WhatsApp number to send messages.', completed: isConnected, action: 'Connect', link: '/app/whatsapp' },
    { id: 'automations', title: 'Enable Automations', description: 'Turn on message automations for your store.', completed: hasEnabledAutomation, action: 'Configure', link: '#automations' }
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

// Feature row component matching WhatFlow reference design exactly
function FeatureRow({ 
  icon: IconComponent, 
  title, 
  description, 
  isEnabled, 
  isComingSoon = false,
  settingsUrl,
  disabled = false,
  buttonLabel = "Edit" // Default to Edit for automations
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
    <div style={{ 
      padding: '16px 20px', 
      borderBottom: '1px solid #e1e3e5',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: '16px'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1 }}>
        {/* Small inline icon */}
        <div style={{ 
          width: '20px', 
          height: '20px', 
          flexShrink: 0,
          marginTop: '2px',
          color: '#5c5f62'
        }}>
          <IconComponent />
        </div>
        
        {/* Title and description */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '14px', color: '#202223' }}>{title}</span>
            {isComingSoon && <Badge tone="warning">Coming Soon</Badge>}
            <Badge tone={isEnabled ? "success" : undefined}>{isEnabled ? 'On' : 'Off'}</Badge>
          </div>
          <p style={{ fontSize: '13px', color: '#6d7175', margin: 0, lineHeight: '1.4' }}>{description}</p>
        </div>
      </div>
      
      {/* Edit/Settings button - outlined style */}
      <Button 
        url={settingsUrl} 
        disabled={disabled}
        variant="secondary"
      >
        {buttonLabel}
      </Button>
    </div>
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
      backAction={{ content: 'Back', url: '/app' }}
      title="WhatSend Home"
      primaryAction={
        <Button variant="primary" url="/app/whatsapp">
          Manage Connection
        </Button>
      }
      secondaryActions={[
        { content: 'Plans', url: '/app/plans' }
      ]}
    >
      <BlockStack gap="500">
        {/* Setup Guide - Collapsible */}
        {completedSteps < totalSteps && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Setup Guide</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Use this personalized guide to get your app up and running.
                  </Text>
                </BlockStack>
                <Button 
                  variant="plain" 
                  onClick={() => setSetupOpen(!setupOpen)}
                  accessibilityLabel="Toggle setup guide"
                >
                  {setupOpen ? '▲' : '▼'}
                </Button>
              </InlineStack>
              
              <InlineStack gap="300" blockAlign="center">
                <Text as="span" variant="bodySm">{completedSteps} / {totalSteps} completed</Text>
                <Box minWidth="200px">
                  <ProgressBar progress={progressPercent} size="small" tone="primary" />
                </Box>
              </InlineStack>

              <Collapsible open={setupOpen} id="setup-guide">
                <BlockStack gap="400">
                  {setupSteps.map((step, index) => (
                    <Box key={step.id} paddingBlockStart="200">
                      <InlineStack gap="400" blockAlign="start" wrap={false}>
                        <Box 
                          minWidth="32px"
                          minHeight="32px"
                          background={step.completed ? "bg-fill-success" : "bg-surface-secondary"}
                          borderRadius="full"
                        >
                          <div style={{ 
                            width: '32px', 
                            height: '32px', 
                            borderRadius: '50%', 
                            backgroundColor: step.completed ? '#008060' : '#f1f1f1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: step.completed ? 'white' : '#616161',
                            fontSize: '14px',
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
                              <Button size="slim" url={step.link}>{step.action}</Button>
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
        )}

        {/* Welcome Card */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">Welcome to WhatSend</Text>
            <Text as="p" variant="bodyMd">
              Connect with your customers on WhatsApp and boost your sales with automated messaging workflows.
            </Text>
            <InlineStack gap="300">
              <Button url="/app/plans">Plans & Usage</Button>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* WhatsApp Automation Features */}
        <Box id="automations">
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">WhatsApp Automation Features</Text>
            
            <Card padding="0">
              <BlockStack gap="0">
                {mainAutomations.map((type) => {
                  const meta = automationMeta[type];
                  const isEnabled = getAutomationStatus(type);
                  const IconComponent = automationIcons[type] || OrderIcon;
                  
                  return (
                    <FeatureRow
                      key={type}
                      icon={IconComponent}
                      title={meta.title}
                      description={meta.description}
                      isEnabled={isEnabled}
                      settingsUrl={`/app/automation/${type}`}
                    />
                  );
                })}

                {/* Coming Soon Automations */}
                {comingSoonAutomations.map((type) => {
                  const meta = automationMeta[type];
                  const IconComponent = automationIcons[type] || OrderIcon;
                  
                  return (
                    <FeatureRow
                      key={type}
                      icon={IconComponent}
                      title={meta.title}
                      description={meta.description}
                      isEnabled={false}
                      isComingSoon={true}
                      disabled={true}
                    />
                  );
                })}
              </BlockStack>
            </Card>
          </BlockStack>
        </Box>

        {/* WhatsApp Buttons & Widgets */}
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">WhatsApp Buttons & Widgets</Text>
          
          <Card padding="0">
            <BlockStack gap="0">
              {widgets.map((widget) => (
                <FeatureRow
                  key={widget.type}
                  icon={widget.icon}
                  title={widget.title}
                  description={widget.description}
                  isEnabled={false}
                  disabled={true}
                />
              ))}
            </BlockStack>
          </Card>
        </BlockStack>

        {/* Shopify Flow Integration */}
        <Card padding="0">
          <div style={{ 
            padding: '16px 20px', 
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1 }}>
              <div style={{ 
                width: '20px', 
                height: '20px', 
                flexShrink: 0,
                marginTop: '2px',
                color: '#5c5f62'
              }}>
                <WandIcon />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#202223' }}>Shopify Flow Integration</span>
                  <Badge tone="success">Available</Badge>
                </div>
                <p style={{ fontSize: '13px', color: '#6d7175', margin: 0, lineHeight: '1.4' }}>
                  Automate your WhatsApp messaging with Shopify Flow. Create custom workflows to send messages based on various triggers.
                </p>
              </div>
            </div>
            <Button variant="secondary">View Guide</Button>
          </div>
        </Card>

        {/* Bulk Message Sender */}
        <Card padding="0">
          <div style={{ 
            padding: '16px 20px', 
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1 }}>
              <div style={{ 
                width: '20px', 
                height: '20px', 
                flexShrink: 0,
                marginTop: '2px',
                color: '#5c5f62'
              }}>
                <ChatIcon />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#202223' }}>Bulk Message Sender</span>
                  <Badge tone="warning">Use with Caution</Badge>
                </div>
                <p style={{ fontSize: '13px', color: '#6d7175', margin: 0, lineHeight: '1.4' }}>
                  Send WhatsApp messages to customer segments. Follow WhatsApp guidelines to avoid account suspension.
                </p>
              </div>
            </div>
            <Button variant="secondary" url="/app/campaigns/new">Open Tool</Button>
          </div>
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
            <div>
              <Button url="/app/whatsapp" variant={isConnected ? "secondary" : "primary"}>
                {isConnected ? 'Manage' : 'Connect'}
              </Button>
            </div>
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
