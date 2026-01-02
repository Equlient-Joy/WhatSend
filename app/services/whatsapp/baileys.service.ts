import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  ConnectionState,
  WASocket,
  AuthenticationCreds,
  SignalDataTypeMap,
  initAuthCreds,
  proto,
  BufferJSON
} from '@whiskeysockets/baileys';
import pino, { Logger } from 'pino';

// Database auth state interface
interface DatabaseAuthState {
  creds: AuthenticationCreds;
  keys: {
    get: <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => Promise<{ [id: string]: SignalDataTypeMap[T] | undefined }>;
    set: (data: { [type: string]: { [id: string]: unknown } }) => Promise<void>;
  };
  saveCreds: () => Promise<void>;
}

/**
 * Custom auth state that stores everything in the database
 */
async function useDatabaseAuthState(shopId: string): Promise<DatabaseAuthState> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  // Load existing session from database
  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopId },
    select: { whatsappSession: true }
  });

  let sessionData: { creds?: AuthenticationCreds; keys?: Record<string, unknown> } = {};
  
  if (shop?.whatsappSession && typeof shop.whatsappSession === 'object') {
    try {
      // Parse session data from database JSON
      sessionData = JSON.parse(JSON.stringify(shop.whatsappSession, BufferJSON.replacer));
      // Deserialize with BufferJSON
      sessionData = JSON.parse(JSON.stringify(sessionData), BufferJSON.reviver);
    } catch (err) {
      console.error('Failed to parse session data:', err);
      sessionData = {};
    }
  }

  // Initialize creds
  const creds: AuthenticationCreds = sessionData.creds || initAuthCreds();
  const keys: Record<string, Record<string, unknown>> = (sessionData.keys as Record<string, Record<string, unknown>>) || {};

  // Save function
  const saveToDatabase = async () => {
    try {
      const dataToSave = JSON.parse(JSON.stringify({ creds, keys }, BufferJSON.replacer));
      await prisma.shop.update({
        where: { shopifyDomain: shopId },
        data: { whatsappSession: dataToSave }
      });
    } catch (err) {
      console.error('Failed to save session to database:', err);
    }
  };

  return {
    creds,
    keys: {
      get: async (type, ids) => {
        const data: { [id: string]: unknown } = {};
        for (const id of ids) {
          const key = `${type}-${id}`;
          const value = keys[type]?.[id];
          if (value) {
            data[id] = value;
          }
        }
        return data as { [id: string]: SignalDataTypeMap[typeof type] };
      },
      set: async (newData) => {
        for (const type in newData) {
          if (!keys[type]) {
            keys[type] = {};
          }
          for (const id in newData[type]) {
            const value = newData[type][id];
            if (value === null || value === undefined) {
              delete keys[type][id];
            } else {
              keys[type][id] = value;
            }
          }
        }
        await saveToDatabase();
      }
    },
    saveCreds: async () => {
      await saveToDatabase();
    }
  };
}

// Update connection status in database
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
  private logger: Logger;

  constructor() {
    this.logger = pino({ level: 'info' });
  }

  /**
   * Initialize WhatsApp connection for a specific shop
   * Uses database for session persistence instead of filesystem
   */
  async initializeConnection(shopId: string): Promise<void> {
    try {
      this.logger.info(`Initializing connection for shop: ${shopId}`);
      await updateConnectionStatus(shopId, 'connecting');
      
      // 1. Get auth state from database
      const { creds, keys, saveCreds } = await useDatabaseAuthState(shopId);
      
      // 2. Get latest version
      const { version, isLatest } = await fetchLatestBaileysVersion();
      this.logger.info(`Using Baileys version ${version.join('.')}, isLatest: ${isLatest}`);

      // 3. Create socket
      this.socket = makeWASocket({
        version,
        auth: { creds, keys },
        printQRInTerminal: true,
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
          
          this.logger.warn(`Connection closed for shop ${shopId}. Reconnecting: ${shouldReconnect}`);
          
          if (shouldReconnect) {
            setTimeout(() => this.initializeConnection(shopId), 3000);
          } else {
            this.logger.error(`Shop ${shopId} logged out. Marking as disconnected.`);
            await updateConnectionStatus(shopId, 'disconnected');
            // Clear session on logout
            await this.clearSession(shopId);
          }
        } else if (connection === 'open') {
          this.logger.info(`✅ Connection opened successfully for shop ${shopId}`);
          await updateConnectionStatus(shopId, 'connected');
        }
      });

      this.socket.ev.on('creds.update', async () => {
        await saveCreds();
        this.logger.info(`Credentials saved to database for shop ${shopId}`);
      });

    } catch (error) {
      this.logger.error(`Failed to initialize connection for shop ${shopId}: ${error}`);
      await updateConnectionStatus(shopId, 'error');
      throw error;
    }
  }

  /**
   * Clear session from database
   */
  private async clearSession(shopId: string): Promise<void> {
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      
      await prisma.shop.update({
        where: { shopifyDomain: shopId },
        data: { whatsappSession: null }
      });
      
      await prisma.$disconnect();
      this.logger.info(`Session cleared for shop ${shopId}`);
    } catch (error) {
      this.logger.error(`Failed to clear session for shop ${shopId}:`, error);
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
    
    // Clear session from database
    await this.clearSession(shopId);
    
    this.logger.info(`Logged out shop ${shopId}`);
  }
}
