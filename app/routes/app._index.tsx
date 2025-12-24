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
  ProgressBar
} from "@shopify/polaris";
import { SettingsIcon } from "@shopify/polaris-icons";
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
    { id: 'plan', title: 'Choose a Plan', description: 'Select a subscription plan to start sending messages.', completed: hasPlan, action: 'Select Plan' },
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

export default function AppHome() {
  const { 
    automations, 
    setupSteps, 
    completedSteps, 
    totalSteps,
    automationMeta 
  } = useLoaderData<typeof loader>();

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
    { type: 'chat_button', title: 'WhatsApp Chat Button', description: 'Add a customizable WhatsApp chat button to your storefront for instant customer support.', icon: '💬' },
    { type: 'direct_order', title: 'WhatsApp Direct Order', description: 'Add a direct order button that allows customers to send their cart items via WhatsApp.', icon: '🛍️' },
    { type: 'product_button', title: 'WhatsApp Product Page Button', description: 'Add WhatsApp buttons to product pages allowing customers to inquire about specific products directly.', icon: '📱' }
  ];

  const getAutomationStatus = (type: string) => {
    const automation = automations.find(a => a.type === type);
    return automation?.enabled || false;
  };

  return (
    <Page 
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
        {/* Setup Guide */}
        {completedSteps < totalSteps && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">Setup Guide</Text>
                <Text as="span" variant="bodySm" tone="subdued">...</Text>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                Use this personalized guide to get your app up and running.
              </Text>
              
              <InlineStack gap="200" align="start" blockAlign="center">
                <Text as="span" variant="bodySm">{completedSteps} / {totalSteps} completed</Text>
                <div style={{ flexGrow: 1, maxWidth: '200px' }}>
                  <ProgressBar progress={(completedSteps / totalSteps) * 100} size="small" />
                </div>
              </InlineStack>

              <BlockStack gap="300">
                {setupSteps.map((step, index) => (
                  <Box key={step.id} paddingBlockStart="200">
                    <InlineStack gap="300" align="start" blockAlign="start">
                      <div style={{ 
                        width: '24px', 
                        height: '24px', 
                        borderRadius: '50%', 
                        backgroundColor: step.completed ? '#008060' : '#e4e5e7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: step.completed ? 'white' : '#6d7175',
                        fontSize: '12px'
                      }}>
                        {step.completed ? '✓' : index + 1}
                      </div>
                      <BlockStack gap="100">
                        <Text as="span" variant="bodyMd" fontWeight="semibold">{step.title}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">{step.description}</Text>
                        {!step.completed && step.link && (
                          <Button size="slim" url={step.link}>{step.action}</Button>
                        )}
                      </BlockStack>
                    </InlineStack>
                  </Box>
                ))}
              </BlockStack>
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
            <InlineStack gap="200">
              <Button url="/app/dashboard" variant="secondary">📊 View Dashboard</Button>
              <Button url="/app/plans" variant="secondary">💳 Plans & Usage</Button>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* WhatsApp Automation Features */}
        <Box id="automations">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">WhatsApp Automation Features</Text>
              
              <BlockStack gap="0">
                {mainAutomations.map((type) => {
                  const meta = automationMeta[type];
                  const isEnabled = getAutomationStatus(type);
                  
                  return (
                    <Box key={type} paddingBlock="300" borderBlockEndWidth="025" borderColor="border">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="300" blockAlign="center">
                          <Text as="span" variant="bodyLg">{meta.icon}</Text>
                          <BlockStack gap="050">
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="span" variant="bodyMd" fontWeight="semibold">{meta.title}</Text>
                              <Badge tone={isEnabled ? "success" : "new"}>{isEnabled ? 'On' : 'Off'}</Badge>
                            </InlineStack>
                            <Text as="p" variant="bodySm" tone="subdued">{meta.description}</Text>
                          </BlockStack>
                        </InlineStack>
                        <Button url={`/app/automation/${type}`} variant="secondary" icon={SettingsIcon}>
                          Settings
                        </Button>
                      </InlineStack>
                    </Box>
                  );
                })}

                {/* Coming Soon Automations */}
                {comingSoonAutomations.map((type) => {
                  const meta = automationMeta[type];
                  
                  return (
                    <Box key={type} paddingBlock="300" borderBlockEndWidth="025" borderColor="border">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="300" blockAlign="center">
                          <Text as="span" variant="bodyLg">{meta.icon}</Text>
                          <BlockStack gap="050">
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="span" variant="bodyMd" fontWeight="semibold">{meta.title}</Text>
                              <Badge tone="attention">Coming Soon</Badge>
                              <Badge tone="new">Off</Badge>
                            </InlineStack>
                            <Text as="p" variant="bodySm" tone="subdued">{meta.description}</Text>
                          </BlockStack>
                        </InlineStack>
                        <Button disabled variant="secondary" icon={SettingsIcon}>
                          Settings
                        </Button>
                      </InlineStack>
                    </Box>
                  );
                })}
              </BlockStack>
            </BlockStack>
          </Card>
        </Box>

        {/* WhatsApp Buttons & Widgets */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">WhatsApp Buttons & Widgets</Text>
            
            <BlockStack gap="0">
              {widgets.map((widget) => (
                <Box key={widget.type} paddingBlock="300" borderBlockEndWidth="025" borderColor="border">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="300" blockAlign="center">
                      <Text as="span" variant="bodyLg">{widget.icon}</Text>
                      <BlockStack gap="050">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="span" variant="bodyMd" fontWeight="semibold">{widget.title}</Text>
                          <Badge tone="new">Off</Badge>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">{widget.description}</Text>
                      </BlockStack>
                    </InlineStack>
                    <Button disabled variant="secondary" icon={SettingsIcon}>
                      Settings
                    </Button>
                  </InlineStack>
                </Box>
              ))}
            </BlockStack>
          </BlockStack>
        </Card>

        {/* Shopify Flow Integration */}
        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="300" blockAlign="center">
              <Text as="span" variant="bodyLg">⚡</Text>
              <BlockStack gap="050">
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
        </Card>
      </BlockStack>
    </Page>
  );
}
