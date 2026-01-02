import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  ConnectionState,
  WASocket
} from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import pino, { Logger } from 'pino';

// Import database functions dynamically to avoid circular deps
async function updateConnectionStatus(shopId: string, status: 'connecting' | 'awaiting_scan' | 'connected' | 'disconnected' | 'error', qrCode?: string | null) {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const updateData: Record<string, unknown> = { connectionStatus: status };
    
    if (qrCode !== undefined) {
      updateData.qrCode = qrCode;
    }
    
    if (status === 'connected') {
      updateData.whatsappConnected = true;
      updateData.lastConnectedAt = new Date();
      updateData.qrCode = null;
    } else if (status === 'disconnected' || status === 'error') {
      updateData.whatsappConnected = false;
      updateData.qrCode = null;
    }
    
    await prisma.shop.update({
      where: { shopifyDomain: shopId },
      data: updateData
    });
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Failed to update connection status:', error);
  }
}

export class BaileysService {
  private socket: WASocket | null = null;
  private sessionsDir: string;
  private logger: Logger;

  constructor() {
    this.sessionsDir = path.resolve(process.cwd(), 'whatsapp_sessions');
    this.logger = pino({ level: 'info' });
    
    // Ensure session directory exists
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /**
   * Initialize WhatsApp connection for a specific shop
   * @param shopId The unique identifier for the shop (used as session folder name)
   */
  async initializeConnection(shopId: string): Promise<void> {
    try {
      this.logger.info(`Initializing connection for shop: ${shopId}`);
      await updateConnectionStatus(shopId, 'connecting');
      
      const sessionPath = path.join(this.sessionsDir, shopId);
      
      // 1. Get auth state
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      
      // 2. Get latest version
      const { version, isLatest } = await fetchLatestBaileysVersion();
      this.logger.info(`Using Baileys version ${version.join('.')}, isLatest: ${isLatest}`);

      // 3. Create socket
      this.socket = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true, // Useful for dev
        logger: this.logger,
        browser: ['WhatSend', 'Chrome', '10.0'],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
      });

      // 4. Handle events
      this.socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.logger.info(`QR Code received for shop ${shopId}`);
          // Store QR in database for frontend to poll
          await updateConnectionStatus(shopId, 'awaiting_scan', qr);
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          
          this.logger.warn(`Connection closed for shop ${shopId} due to ${lastDisconnect?.error}. Reconnecting: ${shouldReconnect}`);
          
          if (shouldReconnect) {
            this.initializeConnection(shopId);
          } else {
            this.logger.error(`Shop ${shopId} logged out. Marking as disconnected.`);
            await updateConnectionStatus(shopId, 'disconnected');
          }
        } else if (connection === 'open') {
          this.logger.info(`✅ Connection opened successfully for shop ${shopId}`);
          await updateConnectionStatus(shopId, 'connected');
        }
      });

      this.socket.ev.on('creds.update', async () => {
        await saveCreds();
      });

    } catch (error) {
      this.logger.error(`Failed to initialize connection for shop ${shopId}: ${error}`);
      await updateConnectionStatus(shopId, 'error');
      throw error;
    }
  }

  /**
   * Send a text message to a phone number
   */
  async sendMessage(shopId: string, to: string, message: string): Promise<void> {
    if (!this.socket) {
      throw new Error(`WhatsApp socket not initialized for shop ${shopId}`);
    }

    const remoteJid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
    
    await this.socket.sendMessage(remoteJid, { text: message });
    this.logger.info(`Message sent to ${to}`);
  }

  /**
   * Send an image message with caption to a phone number
   */
  async sendImageMessage(shopId: string, to: string, imageUrl: string, caption: string): Promise<void> {
    if (!this.socket) {
      throw new Error(`WhatsApp socket not initialized for shop ${shopId}`);
    }

    const remoteJid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;

    try {
      // Fetch the image from URL
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      
      const imageBuffer = Buffer.from(await response.arrayBuffer());
      
      // Send image with caption
      await this.socket.sendMessage(remoteJid, {
        image: imageBuffer,
        caption: caption
      });
      
      this.logger.info(`Image message sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send image message: ${error}`);
      // Fallback to text-only message
      this.logger.info('Falling back to text-only message');
      await this.socket.sendMessage(remoteJid, { text: caption });
    }
  }

  /**
   * Disconnect and clear session
   */
  async logout(shopId: string): Promise<void> {
    if (this.socket) {
      this.socket.end(undefined);
      this.socket = null;
    }
    
    // In a real implementation, you might want to delete the session folder here
    const sessionPath = path.join(this.sessionsDir, shopId);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }
    
    this.logger.info(`Logged out shop ${shopId}`);
  }
}
