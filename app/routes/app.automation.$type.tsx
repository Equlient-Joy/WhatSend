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
  Divider
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

  // Ensure shop exists
  await getOrCreateShop(shop);

  // Get automation settings
  const automation = await getAutomation(shop, type);
  const meta = AUTOMATION_META[type];
  const testPhone = await getTestPhone(shop);
  const connectionStatus = await getShopConnectionStatus(shop);

  return data({
    shop,
    type,
    automation,
    meta,
    templateVariables: TEMPLATE_VARIABLES,
    testPhone,
    isConnected: connectionStatus?.whatsappConnected || false
  });
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

    // Build conditions object if admin phone provided
    const conditions = adminPhone ? { adminPhone } : undefined;

    await updateAutomation(shop, type, {
      enabled,
      template,
      delayMinutes,
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

  const isLoading = fetcher.state === "submitting";
  const showDelay = type === 'abandoned_checkout' || type === 'draft_order_recovery';
  const showAdminPhone = type === 'admin_notification';
  const isComingSoon = meta.comingSoon;

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

              {/* Settings Form */}
              <Card>
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="save" />
                  <input type="hidden" name="enabled" value={String(enabled)} />
                  
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

                    {/* Admin Phone */}
                    {showAdminPhone && (
                      <TextField
                        label="Admin WhatsApp Number"
                        value={adminPhone}
                        onChange={setAdminPhone}
                        name="adminPhone"
                        placeholder="+1234567890"
                        autoComplete="off"
                        helpText="The phone number to receive order notifications (include country code)"
                      />
                    )}

                    <InlineStack gap="200">
                      <Button submit variant="primary" loading={isLoading && fetcher.formData?.get('intent') === 'save'}>
                        Save Settings
                      </Button>
                      <Button 
                        onClick={handleTest} 
                        loading={isLoading && fetcher.formData?.get('intent') === 'test'}
                        disabled={!testPhone || !isConnected}
                      >
                        Test Message
                      </Button>
                    </InlineStack>
                    
                    {/* Test button help text */}
                    {(!testPhone || !isConnected) && (
                      <Text as="p" variant="bodySm" tone="subdued">
                        {!testPhone 
                          ? "Add a test phone number on the home page to test messages."
                          : "Connect WhatsApp to test messages."}
                      </Text>
                    )}
                  </BlockStack>
                </fetcher.Form>
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
