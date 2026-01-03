// Automation type definitions - shared between client and server
export type AutomationType =
  | 'order_confirmation'
  | 'order_fulfillment'
  | 'order_cancellation'
  | 'order_notification'
  | 'admin_notification'
  | 'abandoned_checkout'
  | 'draft_order_recovery'
  | 'auto_replier'
  | 'back_in_stock';

// Default delay settings for each automation type (in minutes)
export const DEFAULT_DELAYS: Record<AutomationType, number> = {
  order_confirmation: 0,
  order_fulfillment: 0,
  order_cancellation: 0,
  order_notification: 0,
  admin_notification: 0,
  abandoned_checkout: 360, // 6 hours
  draft_order_recovery: 0,
  auto_replier: 0,
  back_in_stock: 0
};

// Automation metadata for UI - safe for client-side use
export const AUTOMATION_META: Record<AutomationType, { 
  title: string; 
  description: string; 
  icon: string;
  comingSoon?: boolean;
}> = {
  order_confirmation: {
    title: 'Order Confirmation',
    description: 'Send a WhatsApp message when an order is created',
    icon: '📦',
    comingSoon: false,
  },
  order_fulfillment: {
    title: 'Order Fulfillment',
    description: 'Send tracking info when an order is shipped',
    icon: '🚚',
    comingSoon: false,
  },
  order_cancellation: {
    title: 'Order Cancellation',
    description: 'Notify customers when their order is cancelled',
    icon: '❌',
    comingSoon: false,
  },
  order_notification: {
    title: 'Order Notification',
    description: 'Send real-time order updates to customers',
    icon: '🔔',
    comingSoon: false,
  },
  admin_notification: {
    title: 'Admin Notification',
    description: 'Get WhatsApp alerts for new orders',
    icon: '👤',
    comingSoon: false,
  },
  abandoned_checkout: {
    title: 'Abandoned Checkout',
    description: 'Recover lost sales with automated reminders',
    icon: '🛒',
    comingSoon: false,
  },
  draft_order_recovery: {
    title: 'Draft Order Recovery',
    description: 'Follow up on pending draft orders',
    icon: '📝',
    comingSoon: true,
  },
  auto_replier: {
    title: 'Auto Replier',
    description: 'Automatic responses to incoming messages',
    icon: '💬',
    comingSoon: true,
  },
  back_in_stock: {
    title: 'Back in Stock',
    description: 'Notify customers when products are restocked',
    icon: '🔄',
    comingSoon: true,
  },
};
