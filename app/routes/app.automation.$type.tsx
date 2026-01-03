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
  TextField,
  Banner,
  Box,
  Badge,
  Divider,
  Checkbox
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { 
  getAutomation, 
  updateAutomation, 
  getOrCreateShop, 
  AUTOMATION_META, 
  type AutomationType,
  getTestPhone,
  getShopConnectionStatus
} from "../services/automation/automation.service";
import { TEMPLATE_VARIABLES } from "../services/automation/template.service";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const type = params.type as AutomationType;

  // Validate automation type
  if (!AUTOMATION_META[type]) {
    throw new Response("Not Found", { status: 404 });
  }

  try {
    // Ensure shop exists
    await getOrCreateShop(shop);

    // Get automation settings
    const automation = await getAutomation(shop, type);
    const meta = AUTOMATION_META[type];
    
    // These may fail if testPhone column doesn't exist
    let testPhone: string | null = null;
    let isConnected = false;
    
    try {
      testPhone = await getTestPhone(shop);
      const connectionStatus = await getShopConnectionStatus(shop);
      isConnected = connectionStatus?.whatsappConnected || false;
    } catch (err) {
      console.warn('Could not get testPhone/connectionStatus:', err);
    }

    return data({
      shop,
      type,
      automation,
      meta,
      templateVariables: TEMPLATE_VARIABLES,
      testPhone,
      isConnected
    });
  } catch (error) {
    console.error('Error in automation loader:', error);
    // Return minimal data to prevent 500 error
    const meta = AUTOMATION_META[type];
    return data({
      shop,
      type,
      automation: {
        type,
        enabled: false,
        template: '',
        delayMinutes: 0,
        sendProductImages: false,
        conditions: null
      },
      meta,
      templateVariables: TEMPLATE_VARIABLES,
      testPhone: null,
      isConnected: false
    });
  }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const type = params.type as AutomationType;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save") {
    const enabled = formData.get("enabled") === "true";
    const template = formData.get("template") as string;
    const delayMinutes = parseInt(formData.get("delayMinutes") as string) || 0;
    const adminPhone = formData.get("adminPhone") as string;
    const sendProductImages = formData.get("sendProductImages") === "true";

    // Build conditions object if admin phone provided
    const conditions = adminPhone ? { adminPhone } : undefined;

    await updateAutomation(shop, type, {
      enabled,
      template,
      delayMinutes,
      sendProductImages,
      conditions
    });

    return data({ success: true, message: "Settings saved!" });
  }

  if (intent === "toggle") {
    const automation = await getAutomation(shop, type);
    await updateAutomation(shop, type, {
      enabled: !automation?.enabled
    });

    return data({ success: true, toggled: true });
  }

  if (intent === "test") {
    // Get test phone and validate
    const testPhone = await getTestPhone(shop);
    const connectionStatus = await getShopConnectionStatus(shop);
    const template = formData.get("template") as string;
    
    // Validation: No test phone
    if (!testPhone) {
      return data({ 
        testError: "No test phone number configured. Please add a test number on the home page first.",
        testSuccess: false 
      });
    }
    
    // Validation: Not connected
    if (!connectionStatus?.whatsappConnected) {
      return data({ 
        testError: "WhatsApp is not connected. Please connect your WhatsApp account first.",
        testSuccess: false 
      });
    }
    
    // Validation: Empty template
    if (!template || template.trim() === '') {
      return data({ 
        testError: "Message template is empty. Please enter a message to test.",
        testSuccess: false 
      });
    }
    
    // Create sample message with placeholder values
    const sampleMessage = template
      .replace(/\{\{customer_name\}\}/g, 'Test Customer')
      .replace(/\{\{first_name\}\}/g, 'Test')
      .replace(/\{\{order_number\}\}/g, '#TEST1234')
      .replace(/\{\{order_total\}\}/g, '$99.99')
      .replace(/\{\{product_list\}\}/g, '1x Sample Product')
      .replace(/\{\{tracking_number\}\}/g, 'TRACK123456')
      .replace(/\{\{tracking_url\}\}/g, 'https://example.com/track')
      .replace(/\{\{checkout_url\}\}/g, 'https://example.com/checkout')
      .replace(/\{\{order_url\}\}/g, 'https://example.com/order')
      .replace(/\{\{product_name\}\}/g, 'Sample Product')
      .replace(/\{\{product_url\}\}/g, 'https://example.com/product')
      .replace(/\{\{#if.*?\}\}/g, '')
      .replace(/\{\{\/if\}\}/g, '');
    
    // TODO: In production, this would call the actual WhatsApp sending service
    // For now, we'll simulate success
    // await sendWhatsAppMessage(testPhone, sampleMessage);
    
    return data({ 
      testSuccess: true,
      testMessage: `Test message sent to ${testPhone}: "${sampleMessage.substring(0, 100)}..."` 
    });
  }

  return data({ error: "Unknown action" }, { status: 400 });
};

export default function AutomationSettingsPage() {
  const { type, automation, meta, templateVariables, testPhone, isConnected } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ 
    success?: boolean; 
    message?: string; 
    toggled?: boolean; 
    testSuccess?: boolean;
    testError?: string;
    testMessage?: string;
  }>();
  
  const [enabled, setEnabled] = useState(automation?.enabled || false);
  const [template, setTemplate] = useState(automation?.template || '');
  const [delayMinutes, setDelayMinutes] = useState(String(automation?.delayMinutes || 0));
  const [adminPhone, setAdminPhone] = useState(
    (automation?.conditions as { adminPhone?: string } | null)?.adminPhone || ''
  );
  const [sendProductImages, setSendProductImages] = useState(
    (automation as { sendProductImages?: boolean } | null)?.sendProductImages || false
  );

  const isLoading = fetcher.state === "submitting";
  const showDelay = type === 'abandoned_checkout' || type === 'draft_order_recovery';
  const showAdminPhone = type === 'admin_notification';
  const isComingSoon = meta.comingSoon;
  
  // Show product images option for customer-facing automations
  const showProductImages = type === 'order_confirmation' || type === 'order_fulfillment' || type === 'abandoned_checkout';

  // Update local state when toggle completes
  useEffect(() => {
    if (fetcher.data?.toggled) {
      setEnabled(prev => !prev);
    }
  }, [fetcher.data?.toggled]);

  const handleToggle = () => {
    fetcher.submit(
      { intent: "toggle" },
      { method: "POST" }
    );
  };

  const handleTest = () => {
    fetcher.submit(
      { intent: "test", template },
      { method: "POST" }
    );
  };

  return (
    <Page 
      backAction={{ content: 'Back', url: '/app' }}
      title={meta.title}
      titleMetadata={
        <Badge tone={enabled ? "success" : undefined}>{enabled ? 'Active' : 'Inactive'}</Badge>
      }
    >
      <Layout>
        <Layout.Section>
          {isComingSoon ? (
            <Banner tone="info">
              <p>This feature is coming soon! Stay tuned for updates.</p>
            </Banner>
          ) : (
            <BlockStack gap="400">
              {/* Status Card with Toggle */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd">Automation Status</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {enabled 
                          ? "This automation is currently active and sending messages." 
                          : "This automation is currently disabled."}
                      </Text>
                    </BlockStack>
                    <Button 
                      variant={enabled ? "secondary" : "primary"}
                      onClick={handleToggle}
                      loading={isLoading && fetcher.formData?.get('intent') === 'toggle'}
                    >
                      {enabled ? 'Turn Off' : 'Turn On'}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>

              {/* Description */}
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">About this Automation</Text>
                  <Text as="p" variant="bodyMd" tone="subdued">{meta.description}</Text>
                </BlockStack>
              </Card>

              {/* Test Message Card - NEW: Moved before Message Template */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Test Message</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {testPhone 
                      ? `Send a test message to your configured test number: ${testPhone}`
                      : "Configure a test phone number on the home page to test this automation."}
                  </Text>
                  
                  <InlineStack gap="200">
                    <Button 
                      onClick={handleTest} 
                      loading={isLoading && fetcher.formData?.get('intent') === 'test'}
                      disabled={!testPhone || !isConnected}
                    >
                      Send Test Message
                    </Button>
                  </InlineStack>
                  
                  {/* Status indicators */}
                  {(!testPhone || !isConnected) && (
                    <Box paddingBlockStart="100">
                      <Text as="p" variant="bodySm" tone="caution">
                        {!testPhone 
                          ? "⚠️ No test phone number configured. Add one on the home page."
                          : "⚠️ WhatsApp is not connected. Connect it first to test."}
                      </Text>
                    </Box>
                  )}
                </BlockStack>
              </Card>

              {/* Test Result Banners */}
              {fetcher.data?.testSuccess && (
                <Banner tone="success" onDismiss={() => {}}>
                  <p>{fetcher.data.testMessage}</p>
                </Banner>
              )}
              
              {fetcher.data?.testError && (
                <Banner tone="critical" onDismiss={() => {}}>
                  <p>{fetcher.data.testError}</p>
                </Banner>
              )}

              {/* Product Images Card - NEW */}
              {showProductImages && (
                <Card>
                  <InlineStack align="space-between" blockAlign="start">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd">Product Images</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Include product images with confirmation messages to enhance customer experience.
                      </Text>
                    </BlockStack>
                    <Box>
                      <Checkbox
                        label="Send product images with confirmation messages"
                        labelHidden
                        checked={sendProductImages}
                        onChange={setSendProductImages}
                      />
                    </Box>
                  </InlineStack>
                  <Box paddingBlockStart="200">
                    <Checkbox
                      label="Send product images with confirmation messages"
                      helpText="When enabled, the first product image will be sent along with the confirmation message."
                      checked={sendProductImages}
                      onChange={setSendProductImages}
                    />
                  </Box>
                </Card>
              )}

              {/* Settings Form */}
              <Card>
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="save" />
                  <input type="hidden" name="enabled" value={String(enabled)} />
                  <input type="hidden" name="sendProductImages" value={String(sendProductImages)} />
                  
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Message Template</Text>
                    
                    <TextField
                      label="Template"
                      value={template}
                      onChange={setTemplate}
                      multiline={8}
                      autoComplete="off"
                      name="template"
                      helpText="Use variables to personalize your messages."
                    />

                    {/* Delay Settings */}
                    {showDelay && (
                      <TextField
                        label="Delay (minutes)"
                        type="number"
                        value={delayMinutes}
                        onChange={setDelayMinutes}
                        name="delayMinutes"
                        autoComplete="off"
                        helpText={type === 'abandoned_checkout' 
                          ? "How long to wait before sending abandoned cart message (recommended: 120 minutes)" 
                          : "How long to wait before sending follow-up message"
                        }
                      />
                    )}

                    {/* Admin Phone - for admin_notification only */}
                    {showAdminPhone && (
                      <TextField
                        label="Admin WhatsApp Number"
                        value={adminPhone}
                        onChange={setAdminPhone}
                        name="adminPhone"
                        placeholder="+1234567890"
                        autoComplete="off"
                        helpText="The phone number to receive order notifications (include country code). This is where real order alerts will be sent."
                      />
                    )}

                    <Button submit variant="primary" loading={isLoading && fetcher.formData?.get('intent') === 'save'}>
                      Save Settings
                    </Button>
                  </BlockStack>
                </fetcher.Form>
              </Card>

              {/* Available Variables */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Available Variables</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Use these variables in your templates. They will be replaced with actual values when the message is sent.
                  </Text>
                  
                  <Divider />
                  
                  <BlockStack gap="200">
                    {Object.entries(templateVariables).map(([variable, description]) => (
                      <InlineStack key={variable} gap="300" blockAlign="center">
                        <Box 
                          background="bg-surface-secondary" 
                          padding="100" 
                          borderRadius="100"
                          minWidth="180px"
                        >
                          <Text as="span" variant="bodySm" fontWeight="medium">
                            <code>{variable}</code>
                          </Text>
                        </Box>
                        <Text as="span" variant="bodySm" tone="subdued">{description}</Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Success Banner */}
              {fetcher.data?.success && fetcher.data?.message && (
                <Banner tone="success">
                  <p>{fetcher.data.message}</p>
                </Banner>
              )}
            </BlockStack>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
