/**
 * Data Cleanup Service
 * Automatically removes old message history and logs to comply with data retention policies
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Data retention periods (in days)
const RETENTION_PERIODS = {
  messageHistory: 30,      // Keep message history for 30 days
  connectionLogs: 7,       // Keep connection logs for 7 days
  messageQueue: 1,         // Clear completed queue items after 1 day
};

/**
 * Clean up old message history records
 */
export async function cleanupMessageHistory(retentionDays: number = RETENTION_PERIODS.messageHistory): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await prisma.messageHistory.deleteMany({
    where: {
      sentAt: {
        lt: cutoffDate
      }
    }
  });

  console.log(`Cleaned up ${result.count} old message history records (older than ${retentionDays} days)`);
  return result.count;
}

/**
 * Clean up old connection logs
 */
export async function cleanupConnectionLogs(retentionDays: number = RETENTION_PERIODS.connectionLogs): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await prisma.connectionLog.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate
      }
    }
  });

  console.log(`Cleaned up ${result.count} old connection log records (older than ${retentionDays} days)`);
  return result.count;
}

/**
 * Clean up completed/failed queue items
 */
export async function cleanupMessageQueue(retentionDays: number = RETENTION_PERIODS.messageQueue): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await prisma.messageQueue.deleteMany({
    where: {
      status: {
        in: ['completed', 'failed']
      },
      scheduledAt: {
        lt: cutoffDate
      }
    }
  });

  console.log(`Cleaned up ${result.count} completed/failed queue items (older than ${retentionDays} days)`);
  return result.count;
}

/**
 * Run all cleanup tasks
 * This should be called daily (via cron job or scheduled task)
 */
export async function runAllCleanupTasks(): Promise<{
  messageHistory: number;
  connectionLogs: number;
  messageQueue: number;
}> {
  console.log('Starting data cleanup tasks...');
  
  const results = {
    messageHistory: await cleanupMessageHistory(),
    connectionLogs: await cleanupConnectionLogs(),
    messageQueue: await cleanupMessageQueue(),
  };

  console.log('Data cleanup completed:', results);
  return results;
}

// If running as a standalone script
if (require.main === module) {
  runAllCleanupTasks()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Cleanup failed:', error);
      process.exit(1);
    });
}
