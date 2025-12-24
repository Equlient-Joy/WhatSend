/**
 * Template Service
 * Handles variable replacement in message templates
 */

export interface TemplateData {
  // Customer info
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  
  // Order info
  orderNumber?: string;
  orderId?: string;
  orderTotal?: string;
  orderUrl?: string;
  
  // Product info
  productList?: string;
  productName?: string;
  productImageUrl?: string;
  
  // Shipping/Tracking
  trackingNumber?: string;
  trackingUrl?: string;
  
  // Shop info
  shopName?: string;
  
  // Checkout
  checkoutUrl?: string;
  
  // Product (for back in stock)
  productUrl?: string;
}

/**
 * Available template variables with descriptions
 */
export const TEMPLATE_VARIABLES: Record<string, string> = {
  '{{customer_name}}': 'Customer\'s first name',
  '{{customer_phone}}': 'Customer\'s phone number',
  '{{customer_email}}': 'Customer\'s email address',
  '{{order_number}}': 'Order number (e.g., #1001)',
  '{{order_total}}': 'Order total amount',
  '{{order_url}}': 'Link to order status page',
  '{{product_list}}': 'Comma-separated list of product names',
  '{{product_name}}': 'Name of the main/first product',
  '{{tracking_number}}': 'Shipping tracking number',
  '{{tracking_url}}': 'Link to track shipment',
  '{{shop_name}}': 'Your store name',
  '{{checkout_url}}': 'Abandoned checkout recovery link',
  '{{product_url}}': 'Link to product page'
};

/**
 * Process a template by replacing variables with actual values
 */
export function processTemplate(template: string, data: TemplateData): string {
  let result = template;

  // Simple variable replacement
  const replacements: Record<string, string | undefined> = {
    '{{customer_name}}': data.customerName,
    '{{customer_phone}}': data.customerPhone,
    '{{customer_email}}': data.customerEmail,
    '{{order_number}}': data.orderNumber,
    '{{order_total}}': data.orderTotal,
    '{{order_url}}': data.orderUrl,
    '{{product_list}}': data.productList,
    '{{product_name}}': data.productName,
    '{{tracking_number}}': data.trackingNumber,
    '{{tracking_url}}': data.trackingUrl,
    '{{shop_name}}': data.shopName,
    '{{checkout_url}}': data.checkoutUrl,
    '{{product_url}}': data.productUrl
  };

  for (const [variable, value] of Object.entries(replacements)) {
    if (value !== undefined) {
      result = result.replaceAll(variable, value);
    } else {
      // Remove the variable if no value provided
      result = result.replaceAll(variable, '');
    }
  }

  // Handle conditional blocks {{#if variable}}...{{/if}}
  result = processConditionals(result, data);

  // Clean up any extra whitespace from removed conditionals
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  return result;
}

/**
 * Process conditional blocks in templates
 * Supports: {{#if variable}}content{{/if}}
 */
function processConditionals(template: string, data: TemplateData): string {
  const conditionalRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  
  return template.replace(conditionalRegex, (_match, variable, content) => {
    const dataKey = camelCase(variable) as keyof TemplateData;
    const value = data[dataKey];
    
    if (value && value.toString().trim() !== '') {
      return content;
    }
    return '';
  });
}

/**
 * Convert snake_case to camelCase
 */
function camelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_m, letter) => letter.toUpperCase());
}

/**
 * Extract product info from Shopify order payload
 */
export function extractProductInfo(lineItems: Array<{
  name?: string;
  title?: string;
  quantity?: number;
  product_id?: string | number;
}>): { productList: string; productName: string } {
  if (!lineItems || lineItems.length === 0) {
    return { productList: '', productName: '' };
  }

  const productNames = lineItems.map(item => {
    const name = item.name || item.title || 'Unknown Product';
    const qty = item.quantity || 1;
    return qty > 1 ? `${name} (x${qty})` : name;
  });

  return {
    productList: productNames.join(', '),
    productName: lineItems[0].name || lineItems[0].title || 'Unknown Product'
  };
}

/**
 * Extract the first product image URL from order line items
 * For webhook payloads that include image info
 */
export function extractProductImageUrl(lineItems: Array<{
  product_id?: string | number;
  variant_id?: string | number;
  image?: { src?: string };
}>): string | undefined {
  if (!lineItems || lineItems.length === 0) {
    return undefined;
  }

  // Check if any line item has an image directly in the payload
  for (const item of lineItems) {
    if (item.image?.src) {
      return item.image.src;
    }
  }

  // If no image in payload, we'd need to fetch from Shopify API
  // This will be handled by the webhook handler using GraphQL
  return undefined;
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: string | number, currency: string = 'USD'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(num);
}

/**
 * Clean and format phone number for WhatsApp
 * Removes spaces, dashes, and ensures proper format
 */
export function formatPhoneForWhatsApp(phone: string): string {
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Remove leading + if present (we'll use number format without it)
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  
  // Ensure it doesn't start with 0 (country code should be first)
  if (cleaned.startsWith('0')) {
    // This might need customization based on your user base
    // For now, assume it's a local number without country code
    console.warn('Phone number starts with 0, may need country code');
  }
  
  return cleaned;
}
