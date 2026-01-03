import { useLoaderData, data } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { 
  Page, 
  Layout, 
  Card, 
  Text, 
  BlockStack,
  InlineStack,
  Select,
  DataTable,
  Badge,
  EmptyState,
  Box
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Date range options
const DATE_RANGES = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 Days', value: '7days' },
  { label: 'Last 30 Days', value: '30days' },
  { label: 'This Month', value: 'month' },
  { label: 'All Time', value: 'all' },
];

function getDateRange(range: string): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (range) {
    case 'today':
      return { start: today, end: now };
    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { start: yesterday, end: today };
    }
    case '7days': {
      const week = new Date(today);
      week.setDate(week.getDate() - 7);
      return { start: week, end: now };
    }
    case '30days': {
      const month = new Date(today);
      month.setDate(month.getDate() - 30);
      return { start: month, end: now };
    }
    case 'month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: monthStart, end: now };
    }
    case 'all':
    default:
      return { start: new Date(0), end: now };
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    // Get shop
    const shop = await prisma.shop.findUnique({
      where: { shopifyDomain: shopDomain }
    });

    if (!shop) {
      return data({
        stats: { sent: 0, failed: 0, pending: 0 },
        messages: [],
        totalMessages: 0,
        selectedRange: 'today'
      });
    }

    // Get URL params for date range
    const url = new URL(request.url);
    const range = url.searchParams.get('range') || 'today';
    const { start, end } = getDateRange(range);

    // Get message stats for the date range
    const [sentCount, failedCount, pendingCount] = await Promise.all([
      prisma.messageHistory.count({
        where: {
          shopId: shop.id,
          status: 'sent',
          sentAt: { gte: start, lte: end }
        }
      }),
      prisma.messageHistory.count({
        where: {
          shopId: shop.id,
          status: 'failed',
          sentAt: { gte: start, lte: end }
        }
      }),
      prisma.messageQueue.count({
        where: {
          shopId: shop.id,
          status: 'pending'
        }
      })
    ]);

    // Get recent messages
    const messages = await prisma.messageHistory.findMany({
      where: {
        shopId: shop.id,
        sentAt: { gte: start, lte: end }
      },
      orderBy: { sentAt: 'desc' },
      take: 50
    });

    return data({
      stats: {
        sent: sentCount,
        failed: failedCount,
        pending: pendingCount
      },
      messages: messages.map(m => ({
        id: m.id,
        phone: m.recipientPhone,
        type: m.messageType,
        status: m.status,
        orderNumber: m.orderNumber || '-',
        sentAt: m.sentAt?.toISOString() || '-'
      })),
      totalMessages: sentCount + failedCount,
      selectedRange: range
    });
  } catch (error) {
    console.error('Dashboard loader error:', error);
    return data({
      stats: { sent: 0, failed: 0, pending: 0 },
      messages: [],
      totalMessages: 0,
      selectedRange: 'today'
    });
  }
};

export default function DashboardPage() {
  const { stats, messages, totalMessages, selectedRange } = useLoaderData<typeof loader>();
  const [dateRange, setDateRange] = useState(selectedRange || 'today');

  const handleRangeChange = (value: string) => {
    setDateRange(value);
    // Navigate with new range
    window.location.href = `/app/dashboard?range=${value}`;
  };

  const formatDate = (isoString: string) => {
    if (isoString === '-') return '-';
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return <Badge tone="success">Sent</Badge>;
      case 'failed':
        return <Badge tone="critical">Failed</Badge>;
      case 'pending':
        return <Badge tone="attention">Pending</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const tableRows = messages.map((msg: { id: string; phone: string; type: string; status: string; orderNumber: string; sentAt: string }) => [
    msg.phone,
    msg.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    msg.orderNumber,
    getStatusBadge(msg.status),
    formatDate(msg.sentAt)
  ]);

  return (
    <Page 
      backAction={{ content: 'Back', url: '/app' }}
      title="Messages Dashboard"
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {/* Date Range Selector */}
            <Card>
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Date Range</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Select a date range to view message statistics.
                  </Text>
                </BlockStack>
                <Box minWidth="150px">
                  <Select
                    label="Date Range"
                    labelHidden
                    options={DATE_RANGES}
                    value={dateRange}
                    onChange={handleRangeChange}
                  />
                </Box>
              </InlineStack>
            </Card>

            {/* Stats Cards */}
            <InlineStack gap="400" wrap={false}>
              <Box minWidth="200px" width="100%">
                <Card>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">Messages Sent</Text>
                    <Text as="h2" variant="headingXl">{stats.sent}</Text>
                  </BlockStack>
                </Card>
              </Box>
              <Box minWidth="200px" width="100%">
                <Card>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">Failed</Text>
                    <Text as="h2" variant="headingXl" tone="critical">{stats.failed}</Text>
                  </BlockStack>
                </Card>
              </Box>
              <Box minWidth="200px" width="100%">
                <Card>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">Pending</Text>
                    <Text as="h2" variant="headingXl" tone="caution">{stats.pending}</Text>
                  </BlockStack>
                </Card>
              </Box>
            </InlineStack>

            {/* Message History Table */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Message History</Text>
                
                {messages.length === 0 ? (
                  <EmptyState
                    heading="No messages yet"
                    image=""
                  >
                    <p>Select a date range to view your WhatsApp message history.</p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                    headings={['Phone', 'Type', 'Order #', 'Status', 'Sent At']}
                    rows={tableRows}
                    footerContent={`Showing ${messages.length} of ${totalMessages} messages`}
                  />
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
