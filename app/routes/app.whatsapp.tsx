import { useLoaderData, useFetcher, data } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { 
  Page, 
  Layout, 
  Card, 
  Button, 
  Text, 
  BlockStack, 
  Banner 
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
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

  return data({
    shop: shopId,
    isConnected,
    qrCode: null // Initial load has no QR
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
  const { isConnected, qrCode: initialQr } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ qrCode?: string; status?: string }>();
  
  // Use state to track QR if returned from action
  const qrCode = fetcher.data?.qrCode || initialQr;

  return (
    <Page title="WhatsApp Connection">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <Text as="h2" variant="headingMd">
                Connect your WhatsApp
              </Text>
              
              <p>
                Scan the QR code to connect your WhatsApp Business account. 
                This will allow WhatSend to send automated messages on your behalf.
              </p>

              {isConnected ? (
                <Banner tone="success" title="Connected">
                  <p>Your WhatsApp account is successfully connected.</p>
                </Banner>
              ) : (
                <Banner tone="warning" title="Disconnected">
                  <p>You are not currently connected.</p>
                </Banner>
              )}

              {!isConnected && !qrCode && (
                <BlockStack>
                  <fetcher.Form method="post">
                    <Button submit variant="primary" name="intent" value="connect" loading={fetcher.state === "submitting"}>
                      Generate QR Code
                    </Button>
                  </fetcher.Form>
                </BlockStack>
              )}

              {qrCode && !isConnected && (
                <div style={{ background: 'white', padding: '16px', display: 'inline-block' }}>
                   <QRCode value={qrCode} />
                   <p style={{marginTop: '10px'}}>Scan this code with WhatsApp mobile app</p>
                </div>
              )}

              {isConnected && (
                 <fetcher.Form method="post">
                    <Button submit tone="critical" name="intent" value="disconnect" loading={fetcher.state === "submitting"}>
                      Disconnect WhatsApp
                    </Button>
                 </fetcher.Form>
              )}

            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
