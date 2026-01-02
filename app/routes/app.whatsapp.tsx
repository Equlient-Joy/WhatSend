import { useLoaderData, useFetcher, data } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { 
  Page, 
  Layout, 
  Card, 
  Button, 
  Text, 
  BlockStack, 
  Banner,
  Box,
  InlineStack,
  Badge
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getShopConnectionStatus } from "../services/automation/automation.service";
import QRCode from "react-qr-code";

// Server-only imports - these run only on the server
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;

  // Check connection status by checking if session folder exists
  // This is a simple check - production would query database
  const fs = await import("fs");
  const path = await import("path");
  const sessionDir = path.resolve(process.cwd(), 'whatsapp_sessions', shopId);
  const isConnected = fs.existsSync(sessionDir) && fs.existsSync(path.join(sessionDir, 'creds.json'));
  
  // Get test phone from database
  const connectionStatus = await getShopConnectionStatus(shopId);
  const testPhone = connectionStatus?.testPhone || null;

  return data({
    shop: shopId,
    isConnected,
    qrCode: null, // Initial load has no QR
    testPhone
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "connect") {
    // For now, return a mock QR code for UI development
    // In production, this would initialize BaileysService and return real QR
    const qrCode = "mock-qr-code-data-for-display"; 
    return data({ qrCode, status: "generated" });
  }

  if (intent === "disconnect") {
    // Dynamic import to avoid bundling issues
    const { BaileysService } = await import("../services/whatsapp/baileys.service");
    const baileys = new BaileysService();
    await baileys.logout(shopId);
    return data({ status: "disconnected", isConnected: false });
  }

  return null;
};

export default function WhatsAppConnectionPage() {
  const { isConnected, qrCode: initialQr, testPhone } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ qrCode?: string; status?: string }>();
  
  // Use state to track QR if returned from action
  const qrCode = fetcher.data?.qrCode || initialQr;

  return (
    <Page 
      title="WhatsApp Connection"
      backAction={{ content: 'Back', url: '/app' }}
    >
      <Layout>
        {/* Connection Status Card */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Connection Status
              </Text>
              
              {isConnected ? (
                <Banner tone="success" title="Connected">
                  <p>Your WhatsApp account is successfully connected and ready to send messages.</p>
                </Banner>
              ) : (
                <Banner tone="warning" title="Not Connected">
                  <p>Connect your WhatsApp to start sending automated messages.</p>
                </Banner>
              )}

              {!isConnected && !qrCode && (
                <Box>
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="connect" />
                    <Button submit variant="primary" loading={fetcher.state === "submitting"}>
                      Connect WhatsApp
                    </Button>
                  </fetcher.Form>
                </Box>
              )}

              {qrCode && !isConnected && (
                <BlockStack gap="300">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
                  </Text>
                  <div style={{ background: 'white', padding: '16px', display: 'inline-block', borderRadius: '8px' }}>
                     <QRCode value={qrCode} size={200} />
                  </div>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Scan this QR code with your WhatsApp mobile app
                  </Text>
                </BlockStack>
              )}

              {isConnected && (
                <Box>
                   <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="disconnect" />
                      <Button submit tone="critical" loading={fetcher.state === "submitting"}>
                        Disconnect WhatsApp
                      </Button>
                   </fetcher.Form>
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Test Phone Number Card */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Test Phone Number</Text>
                {testPhone && <Badge tone="success">Configured</Badge>}
              </InlineStack>
              
              {testPhone ? (
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    <strong>{testPhone}</strong>
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Test messages will be sent to this number. You can change it on the home page.
                  </Text>
                </BlockStack>
              ) : (
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    No test phone number configured. Add one on the home page to test message templates.
                  </Text>
                  <Box>
                    <Button url="/app">Go to Home Page</Button>
                  </Box>
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Help Card */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Need Help?</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                If you&apos;re having trouble connecting, make sure:
              </Text>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm">• Your phone has an active internet connection</Text>
                <Text as="p" variant="bodySm">• WhatsApp is updated to the latest version</Text>
                <Text as="p" variant="bodySm">• You&apos;re using WhatsApp Business (recommended)</Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
