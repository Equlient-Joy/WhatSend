import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// Ensure we have a Redis connection
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Create the message queue instance
export const messageQueue = new Queue('whatsapp-messages', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: {
      age: 24 * 3600 // Keep failed jobs for 24 hours
    }
  },
});

export interface QueueMessagePayload {
  shopId: string;
  phone: string;
  message: string;
  messageType: string;       // order_confirmation, fulfillment, etc.
  imageUrl?: string;         // Product image URL (optional)
  orderId?: string;          // For tracking
  orderNumber?: string;      // For tracking
  scheduledAt?: Date;        // For delayed messages (abandoned checkout)
  priority?: number;
}

/**
 * Adds a WhatsApp message to the processing queue
 */
export async function queueMessage(payload: QueueMessagePayload) {
  const { 
    shopId, 
    phone, 
    message, 
    messageType,
    imageUrl,
    orderId,
    orderNumber,
    scheduledAt,
    priority = 10 
  } = payload;
  
  // Use shopId as part of the job ID to potentially allow debouncing or tracking
  const jobId = `${shopId}-${messageType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Calculate delay if scheduledAt is provided
  const delay = scheduledAt ? Math.max(0, scheduledAt.getTime() - Date.now()) : undefined;

  await messageQueue.add('send-message', {
    shopId,
    phone,
    message,
    messageType,
    imageUrl,
    orderId,
    orderNumber
  }, {
    priority,
    jobId,
    delay
  });

  return jobId;
}
