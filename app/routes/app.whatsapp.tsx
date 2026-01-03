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
  Badge,
  Spinner
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import QRCode from "react-qr-code";

// Server-only imports - these run only on the server
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;

  try {
    // Get connection status from database
    const shop = await prisma.shop.findUnique({
      where: { shopifyDomain: shopId },
      select: {
        whatsappConnected: true,
        connectionStatus: true,
        qrCode: true,
        testPhone: true,
        whatsappNumber: true
      }
    });

    return data({
      shop: shopId,
      isConnected: shop?.whatsappConnected || false,
      connectionStatus: shop?.connectionStatus || 'disconnected',
      qrCode: shop?.qrCode || null,
      testPhone: shop?.testPhone || null,
      whatsappNumber: shop?.whatsappNumber || null
    });
  } catch (error) {
    console.error('Error loading WhatsApp status:', error);
    return data({
      shop: shopId,
      isConnected: false,
      connectionStatus: 'error',
      qrCode: null,
      testPhone: null,
      whatsappNumber: null
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "connect") {
    try {
      // First ensure shop exists in database
      const shop = await prisma.shop.findUnique({
        where: { shopifyDomain: shopId }
      });

      if (!shop) {
        console.error('Shop not found in database:', shopId);
        return data({ status: "error", message: "Shop not configured. Please visit the home page first." }, { status: 400 });
      }

      // Update status to connecting
      await prisma.shop.update({
        where: { shopifyDomain: shopId },
        data: { connectionStatus: 'connecting', qrCode: null }
      });

      // Dynamic import to avoid bundling issues in browser
      try {
        const { BaileysService } = await import("../services/whatsapp/baileys.service");
        const baileys = new BaileysService();
        
        // This starts the connection process - QR will be stored in DB
        // The connection happens asynchronously
        baileys.initializeConnection(shopId).catch(async (err) => {
          console.error('WhatsApp connection error:', err);
          // Update status to error
          try {
            await prisma.shop.update({
              where: { shopifyDomain: shopId },
              data: { connectionStatus: 'error', qrCode: null }
            });
          } catch (updateError) {
            console.error('Failed to update error status:', updateError);
          }
        });
      } catch (baileysError) {
        console.error('Failed to initialize BaileysService:', baileysError);
        await prisma.shop.update({
          where: { shopifyDomain: shopId },
          data: { 
            connectionStatus: 'error', 
            qrCode: null 
          }
        });
        return data({ 
          status: "error", 
          message: "WhatsApp service unavailable. This may be a server configuration issue." 
        }, { status: 500 });
      }

      return data({ status: "connecting", message: "Connection started. QR code will appear shortly." });
    } catch (error) {
      console.error('Failed to start connection:', error);
      return data({ status: "error", message: "Failed to start connection. Please try again." }, { status: 500 });
    }
  }

  if (intent === "disconnect") {
    try {
      // Dynamic import to avoid bundling issues
      const { BaileysService } = await import("../services/whatsapp/baileys.service");
      const baileys = new BaileysService();
      await baileys.logout(shopId);
      
      // Update database
      await prisma.shop.update({
        where: { shopifyDomain: shopId },
        data: {
          whatsappConnected: false,
          connectionStatus: 'disconnected',
          qrCode: null
        }
      });

      return data({ status: "disconnected", isConnected: false });
    } catch (error) {
      console.error('Failed to disconnect:', error);
      return data({ status: "error", message: "Failed to disconnect" }, { status: 500 });
    }
  }

  if (intent === "refresh") {
    // Just reload the page to get latest status
    return data({ refreshed: true });
  }

  if (intent === "deleteTestPhone") {
    try {
      await prisma.shop.update({
        where: { shopifyDomain: shopId },
        data: { testPhone: null }
      });
      return data({ status: "deleted", message: "Test phone number deleted" });
    } catch (error) {
      console.error('Failed to delete test phone:', error);
      return data({ status: "error", message: "Failed to delete test phone" }, { status: 500 });
    }
  }

  return null;
};

export default function WhatsAppConnectionPage() {
  const { isConnected, connectionStatus, qrCode: initialQr, testPhone, whatsappNumber } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ status?: string; message?: string; refreshed?: boolean }>();
  
  // Poll for QR code updates when connecting
  const [pollCount, setPollCount] = useState(0);

  // Auto-refresh when connecting to get QR code
  useEffect(() => {
    if (connectionStatus === 'connecting' || connectionStatus === 'awaiting_scan') {
      const interval = setInterval(() => {
        fetcher.submit({ intent: 'refresh' }, { method: 'POST' });
        setPollCount(c => c + 1);
      }, 2000); // Poll every 2 seconds

      // Stop polling after 60 seconds (30 attempts)
      if (pollCount > 30) {
        clearInterval(interval);
      }

      return () => clearInterval(interval);
    }
  }, [connectionStatus, pollCount, fetcher]);

  const isProcessing = fetcher.state === "submitting";
  const showQR = initialQr && !isConnected;

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
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Connection Status
                </Text>
                <Badge tone={isConnected ? "success" : connectionStatus === 'connecting' ? "attention" : undefined}>
                  {isConnected ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting...' : 'Not Connected'}
                </Badge>
              </InlineStack>
              
              {isConnected && (
                <Banner tone="success" title="WhatsApp Connected">
                  <p>Your WhatsApp account is successfully connected and ready to send messages.</p>
                  {whatsappNumber && <p><strong>Number:</strong> {whatsappNumber}</p>}
                </Banner>
              )}

              {connectionStatus === 'connecting' && !showQR && (
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Spinner size="small" />
                    <Text as="p">Initializing connection... QR code will appear shortly.</Text>
                  </InlineStack>
                </BlockStack>
              )}

              {connectionStatus === 'awaiting_scan' && showQR && (
                <BlockStack gap="300">
                  <Banner tone="info" title="Scan QR Code">
                    <p>Open WhatsApp on your phone → Settings → Linked Devices → Link a Device</p>
                  </Banner>
                  <Box paddingBlockStart="300" paddingBlockEnd="300">
                    <div style={{ background: 'white', padding: '16px', display: 'inline-block', borderRadius: '8px' }}>
                      <QRCode value={initialQr} size={256} />
                    </div>
                  </Box>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Scan this QR code with your WhatsApp mobile app to connect.
                  </Text>
                </BlockStack>
              )}

              {connectionStatus === 'error' && (
                <Banner tone="critical" title="Connection Error">
                  <p>There was an error connecting to WhatsApp. Please try again.</p>
                </Banner>
              )}

              {!isConnected && connectionStatus === 'disconnected' && (
                <Banner tone="warning" title="Not Connected">
                  <p>Connect your WhatsApp to start sending automated messages to customers.</p>
                </Banner>
              )}

              <Box>
                {!isConnected && connectionStatus === 'disconnected' && (
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="connect" />
                    <Button submit variant="primary" loading={isProcessing}>
                      Connect WhatsApp
                    </Button>
                  </fetcher.Form>
                )}

                {isConnected && (
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="disconnect" />
                    <Button submit tone="critical" loading={isProcessing}>
                      Disconnect WhatsApp
                    </Button>
                  </fetcher.Form>
                )}
              </Box>
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
                <BlockStack gap="300">
                  <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text as="p" variant="headingSm">
                          {testPhone}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Test messages will be sent to this number
                        </Text>
                      </BlockStack>
                      <fetcher.Form method="POST">
                        <input type="hidden" name="intent" value="deleteTestPhone" />
                        <Button submit tone="critical" variant="plain">
                          Remove
                        </Button>
                      </fetcher.Form>
                    </InlineStack>
                  </Box>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Use the home page to change this number.
                  </Text>
                </BlockStack>
              ) : (
                <BlockStack gap="200">
                  <Banner tone="warning">
                    No test phone number configured. Add one to test message templates.
                  </Banner>
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
                <Text as="p" variant="bodySm">• The QR code hasn&apos;t expired (refresh if needed)</Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
