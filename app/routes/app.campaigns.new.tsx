import { useLoaderData, useNavigation, useSubmit, data, redirect } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { 
  Page, 
  Layout, 
  Card, 
  Button, 
  Text, 
  BlockStack, 
  TextField,
  Select,
  Banner,
  Box,
  InlineStack
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { getSegments, createCampaign } from "../services/campaign/campaign.service";
import { getOrCreateShop } from "../services/automation/automation.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  await getOrCreateShop(shop);
  
  // Fetch available segments
  const segments = await getSegments(admin.graphql);

  return data({
    segments
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shopId = session.shop; // Note: our DB uses database ID, but createCampaign uses connect: { shopifyDomain: shop.shop } logic or I need to update createCampaign
  
  // Re-fetch shop to get database ID - strictly speaking createCampaign in my service used `connect: { id: shopId }` 
  // Wait, my service implementation had `connect: { id: shopId }`. 
  // But `session.shop` returns the domain (e.g. "my-store.myshopify.com").
  // I should fix the service to use `shopifyDomain` for connection or fetch the ID here.
  // Better to fix service to use `shopifyDomain`. I'll update the service after this or fix it in the action logic by finding the shop first.
  
  const shop = await getOrCreateShop(shopId); // This returns ID string based on my previous view of automation.service.ts
  
  const formData = await request.formData();
  const name = formData.get("name") as string;
  const segmentId = formData.get("segmentId") as string;
  const message = formData.get("message") as string;

  if (!name || !segmentId || !message) {
    return data({ error: "Please fill in all fields" }, { status: 400 });
  }

  // We need the query for the segment. Fetch segments again to find it (secure way)
  const segments = await getSegments(admin.graphql);
  const selectedSegment = segments.find(s => s.id === segmentId);

  if (!selectedSegment) {
    return data({ error: "Invalid segment selected" }, { status: 400 });
  }

  const result = await createCampaign(
    shop, // Passing DB ID
    session.shop, // Shop domain for billing check
    {
      name,
      segmentId,
      segmentQuery: selectedSegment.query,
      message
    },
    admin.graphql
  );

  if (!result.success) {
    return data({ error: result.error || "Failed to create campaign" }, { status: 400 });
  }

  return redirect("/app"); // Redirect to home or campaigns list
};

export default function NewCampaignPage() {
  const { segments } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const submit = useSubmit();
  
  const [name, setName] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [message, setMessage] = useState("");

  const isLoading = nav.state === "submitting";

  const segmentOptions = [
    { label: 'Select a customer segment', value: '' },
    ...segments.map(s => ({ label: s.name, value: s.id }))
  ];

  const handleSubmit = useCallback(() => {
    submit({ name, segmentId, message }, { method: "post" });
  }, [name, segmentId, message, submit]);

  const templateVariables = [
    { name: '{{first_name}}', desc: "Customer's first name" },
    { name: '{{customer_name}}', desc: "Full name" },
  ];

  return (
    <Page 
      backAction={{ content: 'Back', url: '/app' }}
      title="Create New Campaign"
    >
      <Layout>
        <Layout.Section>
           <BlockStack gap="500">
             <Card>
               <BlockStack gap="400">
                 <Text as="h2" variant="headingMd">Campaign Details</Text>
                 
                 <TextField
                   label="Campaign Name"
                   value={name}
                   onChange={setName}
                   autoComplete="off"
                   placeholder="e.g. Black Friday Sale"
                 />

                 <Select
                   label="Customer Segment"
                   options={segmentOptions}
                   onChange={setSegmentId}
                   value={segmentId}
                   helpText="Select a customer segment from your Shopify store."
                 />
               </BlockStack>
             </Card>

             <Card>
               <BlockStack gap="400">
                 <Text as="h2" variant="headingMd">Message Content</Text>
                 
                 <TextField
                   label="Message"
                   value={message}
                   onChange={setMessage}
                   multiline={6}
                   autoComplete="off"
                   placeholder="Hi {{first_name}}, check out our sale!"
                   helpText="WhatsApp ignores newlines in some cases, keep it concise."
                 />

                 <Box paddingBlockStart="200">
                   <Text as="p" variant="bodySm" fontWeight="medium">Available Variables:</Text>
                   <InlineStack gap="200" wrap>
                     {templateVariables.map(v => (
                       <Box key={v.name} background="bg-surface-secondary" padding="100" borderRadius="100">
                         <Text as="span" variant="bodyXs"><code>{v.name}</code></Text>
                       </Box>
                     ))}
                   </InlineStack>
                 </Box>
               </BlockStack>
             </Card>

             <Banner tone="warning">
               <Text as="p" variant="bodyMd">
                 <strong>Use with caution:</strong> Sending bulk messages can lead to your WhatsApp number being banned if marked as spam. Ensure customers have opted in.
               </Text>
             </Banner>
    
             <Box paddingBlockEnd="500">
                <Button variant="primary" onClick={handleSubmit} loading={isLoading} size="large">
                  Send Campaign
                </Button>
             </Box>
           </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
