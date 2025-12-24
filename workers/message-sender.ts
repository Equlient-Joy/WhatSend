import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { BaileysService } from '../app/services/whatsapp/baileys.service';
import { PrismaClient } from '@prisma/client';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const prisma = new PrismaClient();

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

console.log('🚀 Starting Message Sender Worker...');

interface MessageJobData {
  shopId: string;
  phone: string;
  message: string;
  messageType: string;
  imageUrl?: string;
  orderId?: string;
  orderNumber?: string;
}

const worker = new Worker('whatsapp-messages', async (job: Job<MessageJobData>) => {
  const { shopId, phone, message, messageType, imageUrl, orderId, orderNumber } = job.data;
  console.log(`[Job ${job.id}] Processing ${messageType} message for Shop: ${shopId} -> To: ${phone}`);

  try {
    const baileys = new BaileysService();
    
    // 1. Initialize session/connection for this shop
    await baileys.initializeConnection(shopId);

    // 2. Wait a moment for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. Send Message (with or without image)
    if (imageUrl) {
      await baileys.sendImageMessage(shopId, phone, imageUrl, message);
      console.log(`✅ [Job ${job.id}] Image message sent successfully`);
    } else {
      await baileys.sendMessage(shopId, phone, message);
      console.log(`✅ [Job ${job.id}] Text message sent successfully`);
    }

    // 4. Log to MessageHistory
    try {
      // Find shop ID by domain
      const shop = await prisma.shop.findUnique({
        where: { shopifyDomain: shopId }
      });

      if (shop) {
        await prisma.messageHistory.create({
          data: {
            shopId: shop.id,
            recipientPhone: phone,
            message: message,
            messageType: messageType,
            orderId: orderId,
            orderNumber: orderNumber,
            status: 'sent',
            sentAt: new Date()
          }
        });
      }
    } catch (historyError) {
      console.error(`[Job ${job.id}] Failed to log message history:`, historyError);
      // Don't throw - message was sent successfully
    }

    // 5. Update shop message count
    try {
      await prisma.shop.update({
        where: { shopifyDomain: shopId },
        data: { messagesSent: { increment: 1 } }
      });
    } catch (updateError) {
      console.error(`[Job ${job.id}] Failed to update message count:`, updateError);
    }
    
    return { success: true, sentAt: new Date() };

  } catch (error) {
    console.error(`❌ [Job ${job.id}] Failed to send message:`, error);

    // Log failed attempt to MessageHistory
    try {
      const shop = await prisma.shop.findUnique({
        where: { shopifyDomain: shopId }
      });

      if (shop) {
        await prisma.messageHistory.create({
          data: {
            shopId: shop.id,
            recipientPhone: phone,
            message: message,
            messageType: messageType,
            orderId: orderId,
            orderNumber: orderNumber,
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            sentAt: new Date()
          }
        });
      }
    } catch (historyError) {
      console.error(`[Job ${job.id}] Failed to log failed message:`, historyError);
    }

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

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down worker...');
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down worker...');
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});
