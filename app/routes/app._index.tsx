import { useLoaderData, useFetcher, data } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { 
  Page, 
  Layout,
  Card, 
  Button, 
  Text, 
  BlockStack, 
  InlineStack,
  Badge,
  Box,
  ProgressBar,
  Collapsible,
  TextField,
  Banner
} from "@shopify/polaris";
import { useState, useEffect, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { 
  getAllAutomations, 
  getShopConnectionStatus, 
  getOrCreateShop,
  updateAutomation,
  setTestPhone
} from "../services/automation/automation.service";
import { AUTOMATION_META, type AutomationType } from "../services/automation/automation.constants";
import { getShopBillingStatus } from "../services/billing/billing.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    // Ensure shop and default automations exist
    await getOrCreateShop(shop);

    // Get automations and connection status
    const automations = await getAllAutomations(shop);
    const connectionStatus = await getShopConnectionStatus(shop);

    // Calculate setup progress with actual billing status
    const isConnected = connectionStatus?.whatsappConnected || false;
    const hasEnabledAutomation = automations.some(a => a.enabled);
    
    // Check actual billing status from database
    let hasPlan = false;
    try {
      const billingStatus = await getShopBillingStatus(shop);
      hasPlan = billingStatus.hasActiveSubscription;
    } catch (billingError) {
      console.warn('Could not get billing status:', billingError);
    }
    
    const setupSteps = [
      { id: 'plan', title: 'Choose a Plan', description: 'Select a subscription plan to start sending messages.', completed: hasPlan, action: 'Select Plan', link: '/app/plans' },
      { id: 'connect', title: 'Connect WhatsApp', description: 'Link your WhatsApp number to send messages.', completed: isConnected, action: 'Connect', link: '/app/whatsapp' },
      { id: 'automations', title: 'Enable Automations', description: 'Turn on message automations for your store.', completed: hasEnabledAutomation, action: 'Configure', link: '/app#automations' }
    ];
    
    const completedSteps = setupSteps.filter(s => s.completed).length;
    const testPhone = (connectionStatus as any)?.testPhone || '';

    return data({
      shop,
      automations,
      isConnected,
      setupSteps,
      completedSteps,
      totalSteps: setupSteps.length,
      automationMeta: AUTOMATION_META,
      testPhone
    });
  } catch (error) {
    console.error('Error in app._index loader:', error);
    // Return minimal data to prevent 500 error
    return data({
      shop,
      automations: [],
      isConnected: false,
      setupSteps: [
        { id: 'plan', title: 'Choose a Plan', description: 'Select a subscription plan.', completed: false, action: 'Select Plan', link: '/app/plans' },
        { id: 'connect', title: 'Connect WhatsApp', description: 'Link your WhatsApp number.', completed: false, action: 'Connect', link: '/app/whatsapp' },
        { id: 'automations', title: 'Enable Automations', description: 'Turn on automations.', completed: false, action: 'Configure', link: '/app#automations' }
      ],
      completedSteps: 0,
      totalSteps: 3,
      automationMeta: AUTOMATION_META,
      testPhone: ''
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Toggle automation on/off from home page
  if (intent === "toggle") {
    const automationType = formData.get("type") as AutomationType;
    const currentEnabled = formData.get("enabled") === "true";
    
    await updateAutomation(shop, automationType, {
      enabled: !currentEnabled
    });
    
    return data({ success: true, toggled: true, type: automationType });
  }

  // Save test phone number
  if (intent === "saveTestPhone") {
    const testPhone = formData.get("testPhone") as string;
    
    if (!testPhone) {
      return data({ error: "Please enter a phone number" }, { status: 400 });
    }
    
    // Basic validation - must start with + and have numbers
    if (!testPhone.match(/^\+\d{10,15}$/)) {
      return data({ error: "Invalid phone format. Use: +1234567890" }, { status: 400 });
    }
    
    await setTestPhone(shop, testPhone);
    return data({ success: true, testPhoneSaved: true });
  }

  return data({ error: "Unknown action" }, { status: 400 });
};

// Automation row with inline toggle
function AutomationRow({ 
  type,
  title, 
  description, 
  isEnabled, 
  isComingSoon = false,
  onToggle,
  isLoading = false
}: {
  type: string;
  title: string;
  description: string;
  isEnabled: boolean;
  isComingSoon?: boolean;
  onToggle: () => void;
  isLoading?: boolean;
}) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <InlineStack gap="200" blockAlign="center">
              <Text as="span" variant="bodyMd" fontWeight="semibold">{title}</Text>
              {isComingSoon && <Badge tone="attention">Coming Soon</Badge>}
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">{description}</Text>
          </BlockStack>
          
          <InlineStack gap="200">
            <Button
              onClick={onToggle}
              disabled={isComingSoon || isLoading}
              loading={isLoading}
              variant={isEnabled ? "secondary" : "primary"}
              size="slim"
            >
              {isEnabled ? 'Turn Off' : 'Turn On'}
            </Button>
            <Button 
              url={`/app/automation/${type}`}
              disabled={isComingSoon}
              variant="tertiary"
              size="slim"
            >
              Edit
            </Button>
          </InlineStack>
        </InlineStack>
        
        {/* Status indicator */}
        <InlineStack gap="200">
          <Badge tone={isEnabled ? "success" : undefined}>
            {isEnabled ? 'Active' : 'Inactive'}
          </Badge>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

export default function AppHome() {
  const { 
    automations, 
    setupSteps, 
    completedSteps, 
    totalSteps,
    automationMeta,
    isConnected,
    testPhone: initialTestPhone
  } = useLoaderData<typeof loader>();
  
  const fetcher = useFetcher<{ success?: boolean; toggled?: boolean; type?: string; testPhoneSaved?: boolean; error?: string }>();
  
  const [setupOpen, setSetupOpen] = useState(true);
  const [testPhone, setTestPhoneState] = useState(initialTestPhone);
  const [togglingType, setTogglingType] = useState<string | null>(null);

  // Scroll to automations section when hash is present
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#automations') {
      const element = document.getElementById('automations');
      if (element) {
        setTimeout(() => element.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    }
  }, []);

  // Update toggling state when fetcher completes
  useEffect(() => {
    if (fetcher.data?.toggled) {
      setTogglingType(null);
    }
  }, [fetcher.data?.toggled]);

  const handleToggle = useCallback((type: string, currentEnabled: boolean) => {
    setTogglingType(type);
    fetcher.submit(
      { intent: "toggle", type, enabled: String(currentEnabled) },
      { method: "POST" }
    );
  }, [fetcher]);

  const handleSaveTestPhone = useCallback(() => {
    fetcher.submit(
      { intent: "saveTestPhone", testPhone },
      { method: "POST" }
    );
  }, [fetcher, testPhone]);

  // Separate main automations from coming soon
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

  const getAutomationStatus = (type: string) => {
    // Check if we just toggled this one
    if (fetcher.data?.toggled && fetcher.data?.type === type) {
      const automation = automations.find(a => a.type === type);
      return !automation?.enabled; // Return opposite since it was toggled
    }
    const automation = automations.find(a => a.type === type);
    return automation?.enabled || false;
  };

  const progressPercent = Math.round((completedSteps / totalSteps) * 100);
  const isTogglingAny = fetcher.state === "submitting" && fetcher.formData?.get("intent") === "toggle";
  const isSavingPhone = fetcher.state === "submitting" && fetcher.formData?.get("intent") === "saveTestPhone";

  return (
    <Page
      title="WhatSend"
      primaryAction={
        <Button url="/app/whatsapp" variant="primary">
          Manage Connection
        </Button>
      }
      secondaryActions={[
        { content: 'Plans', url: '/app/plans' }
      ]}
    >
      <Layout>
        {/* Setup Guide Section */}
        <Layout.Section>
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
                  variant="tertiary" 
                  onClick={() => setSetupOpen(!setupOpen)}
                >
                  {setupOpen ? 'Hide' : 'Show'}
                </Button>
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
        </Layout.Section>

        {/* Welcome Section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingLg">Welcome to WhatSend</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Connect with your customers on WhatsApp and boost your sales with automated messaging workflows.
              </Text>
              <InlineStack gap="200">
                <Button url="/app/dashboard" variant="primary">Messages Dashboard</Button>
                <Button url="/app/plans">Plans & Usage</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* WhatsApp Automation Features */}
        <Layout.Section>
          <Box id="automations">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">WhatsApp Automation Features</Text>
              
              {/* Main automations with inline toggles */}
              {mainAutomations.map((type) => {
                const meta = automationMeta[type];
                const isEnabled = getAutomationStatus(type);
                const isToggling = togglingType === type && isTogglingAny;
                
                return (
                  <AutomationRow
                    key={type}
                    type={type}
                    title={meta.title}
                    description={meta.description}
                    isEnabled={isEnabled}
                    onToggle={() => handleToggle(type, isEnabled)}
                    isLoading={isToggling}
                  />
                );
              })}

              {/* Coming Soon Automations */}
              {comingSoonAutomations.map((type) => {
                const meta = automationMeta[type];
                
                return (
                  <AutomationRow
                    key={type}
                    type={type}
                    title={meta.title}
                    description={meta.description}
                    isEnabled={false}
                    isComingSoon={true}
                    onToggle={() => {}}
                  />
                );
              })}
            </BlockStack>
          </Box>
        </Layout.Section>

        {/* WhatsApp Connection Status */}
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">WhatsApp Connection</Text>
              <Text as="p" tone="subdued">
                {isConnected ? '✅ Connected' : '❌ No account connected'}
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
        </Layout.Section>

        {/* Feedback Section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">We&apos;d love to hear from you!</Text>
              <Text as="p" tone="subdued">
                Your feedback helps us improve and continue delivering the best experience possible.
              </Text>
              <InlineStack gap="200">
                <Button variant="secondary">👍 Good</Button>
                <Button variant="secondary">👎 Bad</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Test Phone Number Section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h3" variant="headingMd">Test WhatsApp Number</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Add your phone number to test message templates before enabling automations.
                </Text>
              </BlockStack>
              
              {fetcher.data?.testPhoneSaved && (
                <Banner tone="success" onDismiss={() => {}}>
                  Test phone number saved successfully!
                </Banner>
              )}
              
              {fetcher.data?.error && (
                <Banner tone="critical" onDismiss={() => {}}>
                  {fetcher.data.error}
                </Banner>
              )}
              
              <TextField
                label="Phone Number"
                value={testPhone}
                onChange={setTestPhoneState}
                placeholder="+1234567890"
                helpText="Include country code (e.g., +1 for US, +91 for India)"
                autoComplete="tel"
              />
              
              <Box>
                <Button 
                  onClick={handleSaveTestPhone} 
                  loading={isSavingPhone}
                  variant="primary"
                >
                  Save Test Number
                </Button>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
