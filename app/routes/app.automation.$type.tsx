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
  Badge
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { 
  getAutomation, 
  updateAutomation, 
  getOrCreateShop, 
  AUTOMATION_META, 
  type AutomationType 
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

  return data({
    shop,
    type,
    automation,
    meta,
    templateVariables: TEMPLATE_VARIABLES
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

  return data({ error: "Unknown action" }, { status: 400 });
};

export default function AutomationSettingsPage() {
  const { type, automation, meta, templateVariables } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();
  
  const [enabled, setEnabled] = useState(automation?.enabled || false);
  const [template, setTemplate] = useState(automation?.template || '');
  const [delayMinutes, setDelayMinutes] = useState(String(automation?.delayMinutes || 0));
  const [adminPhone, setAdminPhone] = useState((automation?.conditions as any)?.adminPhone || '');

  const isLoading = fetcher.state === "submitting";
  const showDelay = type === 'abandoned_checkout' || type === 'draft_order_recovery';
  const showAdminPhone = type === 'admin_notification';
  const isComingSoon = meta.comingSoon;

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.message) {
      // Show toast or notification
    }
  }, [fetcher.data]);

  const handleToggle = () => {
    setEnabled(!enabled);
    fetcher.submit(
      { intent: "toggle" },
      { method: "POST" }
    );
  };

  return (
    <Page 
      backAction={{ content: 'Back', url: '/app' }}
      title={meta.title}
      titleMetadata={
        <Badge tone={enabled ? "success" : "new"}>{enabled ? 'On' : 'Off'}</Badge>
      }
      primaryAction={
        !isComingSoon ? (
          <Button 
            variant="primary"
            onClick={handleToggle}
            loading={isLoading && fetcher.formData?.get('intent') === 'toggle'}
          >
            {enabled ? 'Disable' : 'Enable'}
          </Button>
        ) : undefined
      }
    >
      <Layout>
        <Layout.Section>
          {isComingSoon ? (
            <Banner tone="info">
              <p>This feature is coming soon! Stay tuned for updates.</p>
            </Banner>
          ) : (
            <BlockStack gap="500">
              {/* Description */}
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">{meta.icon} About this Automation</Text>
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
                        helpText="The phone number to receive order notifications (include country code)"
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
                  
                  <Box paddingBlockStart="200">
                    <BlockStack gap="200">
                      {Object.entries(templateVariables).map(([variable, description]) => (
                        <InlineStack key={variable} gap="300" align="start">
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
                  </Box>
                </BlockStack>
              </Card>

              {/* Success Banner */}
              {fetcher.data?.success && fetcher.data?.message && (
                <Banner tone="success" onDismiss={() => {}}>
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
