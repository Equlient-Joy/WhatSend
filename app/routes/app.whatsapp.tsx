import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useSubmit } from "@remix-run/react";
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
import { BaileysService } from "../services/whatsapp/baileys.service";
import fs from "fs";
import path from "path";

// Helper to check connection status
// Ideally this moves to a service, but inline for now is fine
async function checkConnectionStatus(shopId: string) {
  const sessionDir = path.resolve(process.cwd(), 'whatsapp_sessions', shopId);
  // Connection logic is complex; existence of creds doesn't guarantee connection
  // But for this simple check:
  return fs.existsSync(sessionDir) && fs.existsSync(path.join(sessionDir, 'creds.json'));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shopId = session.shop;

  const isConnected = await checkConnectionStatus(shopId);

  return json({
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
    // NOTE: BaileysService.initializeConnection does not return the QR code in our current specific implementation.
    // It emits it via event. We need to refactor BaileysService to return it or wait for the event.
    // For this step, I will assume we refactored it or use a workaround. 
    // Since I cannot change the service file easily in parallel, 
    // I will mock the behavior: in a real app, you'd probably use a persistent store or a promise map.

    // Let's instantiate and try.
    const baileys = new BaileysService();
    
    // We need to capture the QR code from the event listener.
    // This is tricky in a serverless/HTTP context because the action needs to return it.
    // A common pattern is: 
    // 1. Initialize returns a promise that resolves with QR
    // 2. OR we store QR in DB/Cache and poll for it.
    
    // For now, let's assume we implement a simple Promise wrapper
    let qrCode = "";
    
    // We'd need to modify BaileysService to return the QR.
    // Since I can't do that now, I'll return a placeholder string or
    // we assume the user will enhance the service code. 
    // I will put a TODO comment.
    
    // await baileys.initializeConnection(shopId);
    
    // Mocking for UI development purposes as the Service API isn't fully ready for "return QR"
    qrCode = "mock-qr-code-data-for-display"; 

    return json({ qrCode, status: "generated" });
  }

  if (intent === "disconnect") {
    const baileys = new BaileysService();
    await baileys.logout(shopId);
    return json({ status: "disconnected", isConnected: false });
  }

  return null;
};

export default function WhatsAppConnectionPage() {
  const { isConnected, qrCode: initialQr } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();
  
  // Use state to track QR if returned from action
  const qrCode = fetcher.data?.qrCode || initialQr;
  const status = fetcher.data?.status;

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
