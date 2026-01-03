/**
 * Reconnect WhatsApp Sessions on Startup
 * 
 * This script runs on app startup to restore WhatsApp connections
 * for all shops that were previously connected.
 */

import { PrismaClient } from '@prisma/client';
import { BaileysService } from '../app/services/whatsapp/baileys.service';

const prisma = new PrismaClient();

// Store active connections
const activeConnections: Map<string, BaileysService> = new Map();

export function getConnection(shopDomain: string): BaileysService | undefined {
  return activeConnections.get(shopDomain);
}

export function setConnection(shopDomain: string, service: BaileysService): void {
  activeConnections.set(shopDomain, service);
}

async function reconnectSessions(): Promise<void> {
  console.log('🔄 Starting WhatsApp session reconnection...');
  
  try {
    // Find all shops that were previously connected
    const allConnectedShops = await prisma.shop.findMany({
      where: {
        whatsappConnected: true
      },
      select: {
        shopifyDomain: true,
        whatsappNumber: true,
        lastConnectedAt: true,
        whatsappSession: true
      }
    });

    // Filter to only shops that have session data
    const connectedShops = allConnectedShops.filter(shop => 
      shop.whatsappSession !== null && 
      typeof shop.whatsappSession === 'object'
    );

    console.log(`📱 Found ${connectedShops.length} shop(s) with active WhatsApp sessions`);

    if (connectedShops.length === 0) {
      console.log('ℹ️ No shops to reconnect');
      return;
    }

    // Reconnect each shop sequentially to avoid rate limiting
    for (const shop of connectedShops) {
      try {
        console.log(`🔗 Reconnecting: ${shop.shopifyDomain} (${shop.whatsappNumber || 'unknown number'})`);
        
        const baileys = new BaileysService();
        await baileys.initializeConnection(shop.shopifyDomain);
        
        // Store the connection for later use
        activeConnections.set(shop.shopifyDomain, baileys);
        
        console.log(`✅ Reconnected: ${shop.shopifyDomain}`);
        
        // Wait between reconnections to avoid overwhelming resources
        await new Promise(resolve => setTimeout(resolve, 3000));
        
      } catch (error) {
        console.error(`❌ Failed to reconnect ${shop.shopifyDomain}:`, error);
        
        // Mark as disconnected in database
        await prisma.shop.update({
          where: { shopifyDomain: shop.shopifyDomain },
          data: { 
            whatsappConnected: false,
            connectionStatus: 'error'
          }
        });
      }
    }

    console.log('🎉 Session reconnection complete!');
    
  } catch (error) {
    console.error('❌ Error during session reconnection:', error);
  }
}

// Run reconnection
reconnectSessions()
  .then(() => {
    console.log('📡 Reconnection script finished, keeping process alive for connections...');
    // Keep the process alive to maintain WhatsApp connections
    // The connections will be used by the message worker
  })
  .catch((error) => {
    console.error('Fatal error in reconnection script:', error);
    process.exit(1);
  });
