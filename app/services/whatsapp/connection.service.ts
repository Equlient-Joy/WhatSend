import prisma from "../../db.server";
import { BaileysService } from "../whatsapp/baileys.service";

// Store active connections per shop (singleton pattern for server)
const activeConnections: Map<string, BaileysService> = new Map();

/**
 * Start WhatsApp connection for a shop and store QR in database
 */
export async function startWhatsAppConnection(shopDomain: string): Promise<{ status: string }> {
  try {
    // Update status to connecting
    await prisma.shop.update({
      where: { shopifyDomain: shopDomain },
      data: { 
        connectionStatus: 'connecting',
        qrCode: null
      }
    });

    // Create or get existing connection
    let baileys = activeConnections.get(shopDomain);
    if (!baileys) {
      baileys = new BaileysService();
      activeConnections.set(shopDomain, baileys);
    }

    // Initialize connection (this will generate QR code)
    await baileys.initializeConnection(shopDomain);

    return { status: 'connecting' };
  } catch (error) {
    console.error('Failed to start WhatsApp connection:', error);
    
    await prisma.shop.update({
      where: { shopifyDomain: shopDomain },
      data: { 
        connectionStatus: 'error',
        qrCode: null
      }
    });
    
    throw error;
  }
}

/**
 * Get current connection status for a shop
 */
export async function getConnectionStatus(shopDomain: string): Promise<{
  isConnected: boolean;
  connectionStatus: string;
  qrCode: string | null;
}> {
  try {
    const shop = await prisma.shop.findUnique({
      where: { shopifyDomain: shopDomain },
      select: {
        whatsappConnected: true,
        connectionStatus: true,
        qrCode: true
      }
    });

    return {
      isConnected: shop?.whatsappConnected || false,
      connectionStatus: shop?.connectionStatus || 'disconnected',
      qrCode: shop?.qrCode || null
    };
  } catch (error) {
    console.error('Failed to get connection status:', error);
    return {
      isConnected: false,
      connectionStatus: 'error',
      qrCode: null
    };
  }
}

/**
 * Store QR code in database (called from worker or connection handler)
 */
export async function storeQRCode(shopDomain: string, qrCode: string): Promise<void> {
  await prisma.shop.update({
    where: { shopifyDomain: shopDomain },
    data: { 
      qrCode,
      connectionStatus: 'awaiting_scan'
    }
  });
}

/**
 * Mark shop as connected after successful QR scan
 */
export async function markAsConnected(shopDomain: string, whatsappNumber?: string): Promise<void> {
  await prisma.shop.update({
    where: { shopifyDomain: shopDomain },
    data: { 
      whatsappConnected: true,
      whatsappNumber: whatsappNumber || null,
      connectionStatus: 'connected',
      qrCode: null,
      lastConnectedAt: new Date()
    }
  });
}

/**
 * Mark shop as disconnected
 */
export async function markAsDisconnected(shopDomain: string): Promise<void> {
  await prisma.shop.update({
    where: { shopifyDomain: shopDomain },
    data: { 
      whatsappConnected: false,
      connectionStatus: 'disconnected',
      qrCode: null
    }
  });

  // Remove from active connections
  activeConnections.delete(shopDomain);
}

/**
 * Disconnect WhatsApp for a shop
 */
export async function disconnectWhatsApp(shopDomain: string): Promise<void> {
  const baileys = activeConnections.get(shopDomain);
  if (baileys) {
    await baileys.logout(shopDomain);
    activeConnections.delete(shopDomain);
  }

  await markAsDisconnected(shopDomain);
}
