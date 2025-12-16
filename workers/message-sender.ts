import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { BaileysService } from '../app/services/whatsapp/baileys.service';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

console.log('🚀 Starting Message Sender Worker...');

const worker = new Worker('whatsapp-messages', async (job: Job) => {
  const { shopId, phone, message } = job.data;
  console.log(`[Job ${job.id}] Processing message for Shop: ${shopId} -> To: ${phone}`);

  try {
    const baileys = new BaileysService();
    
    // 1. Initialize session/connection for this shop
    await baileys.initializeConnection(shopId);

    // 2. Wait a moment for connection to stabilize (simple approach for now)
    // In production, we'd wait for the 'open' event promise
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. Send Message
    await baileys.sendMessage(shopId, phone, message);
    
    console.log(`✅ [Job ${job.id}] Message sent successfully`);
    return { success: true, sentAt: new Date() };

  } catch (error) {
    console.error(`❌ [Job ${job.id}] Failed to send message:`, error);
    throw error; // Triggers BullMQ retry
  }
}, {
  connection,
  concurrency: 5, // Process up to 5 messages in parallel
  limiter: {
    max: 10,  // Max 10 jobs
    duration: 1000 // per 1 second
  }
});

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed!`);
});

worker.on('failed', (job, err) => {
  console.log(`Job ${job?.id} failed with ${err.message}`);
});
