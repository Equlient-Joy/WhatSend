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

interface QueueMessagePayload {
  shopId: string;
  phone: string;
  message: string;
  priority?: number;
}

/**
 * Adds a WhatsApp message to the processing queue
 */
export async function queueMessage(payload: QueueMessagePayload) {
  const { shopId, phone, message, priority = 10 } = payload;
  
  // Use shopId as part of the job ID to potentially allow debouncing or tracking
  const jobId = `${shopId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  await messageQueue.add('send-message', {
    shopId,
    phone,
    message
  }, {
    priority, // Lower number = higher priority in BullMQ? Actually BullMQ standard is no priority, but if prioritized: 1 is highest
    jobId
  });

  return jobId;
}
