import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  ConnectionState,
  WASocket,
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
  initAuthCreds,
  BufferJSON
} from '@whiskeysockets/baileys';
import pino, { Logger } from 'pino';
import { Prisma, PrismaClient } from '@prisma/client';

// Singleton prisma client
let prismaInstance: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

/**
 * Custom auth state that stores everything in the database
 */
async function getDatabaseAuthState(shopId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const prisma = getPrisma();

  // Load existing session from database
  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopId },
    select: { whatsappSession: true }
  });

  let creds: AuthenticationCreds = initAuthCreds();
  const keys: Record<string, Record<string, unknown>> = {};
  
  if (shop?.whatsappSession && typeof shop.whatsappSession === 'object') {
    try {
      // Parse session data - it's already an object from Prisma JSON
      const sessionData = JSON.parse(
        JSON.stringify(shop.whatsappSession),
        BufferJSON.reviver
      ) as { creds?: AuthenticationCreds; keys?: Record<string, Record<string, unknown>> };
      
      if (sessionData.creds) {
        creds = sessionData.creds;
      }
      if (sessionData.keys) {
        Object.assign(keys, sessionData.keys);
      }
    } catch (err) {
      console.error('Failed to parse session data:', err);
    }
  }

  // Save function
  const saveToDatabase = async () => {
    try {
      const dataToSave = JSON.parse(
        JSON.stringify({ creds, keys }, BufferJSON.replacer)
      );
      await prisma.shop.update({
        where: { shopifyDomain: shopId },
        data: { whatsappSession: dataToSave }
      });
    } catch (err) {
      console.error('Failed to save session to database:', err);
    }
  };

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          const typeData = keys[type];
          if (typeData) {
            for (const id of ids) {
              const value = typeData[id];
              if (value !== undefined) {
                data[id] = value as SignalDataTypeMap[T];
              }
            }
          }
          return data;
        },
        set: async (data: { [T in keyof SignalDataTypeMap]?: { [id: string]: SignalDataTypeMap[T] | null } }) => {
          for (const type in data) {
            const typeKey = type as keyof SignalDataTypeMap;
            if (!keys[typeKey]) {
              keys[typeKey] = {};
            }
            const typeData = data[typeKey];
            if (typeData) {
              for (const id in typeData) {
                const value = typeData[id];
                if (value === null || value === undefined) {
                  delete keys[typeKey][id];
                } else {
                  keys[typeKey][id] = value;
                }
              }
            }
          }
          await saveToDatabase();
        }
      }
    },
    saveCreds: saveToDatabase
  };
}

// Update connection status in database
async function updateConnectionStatus(
  shopId: string, 
  status: 'connecting' | 'awaiting_scan' | 'connected' | 'disconnected' | 'error', 
  qrCode?: string | null
) {
  try {
    const prisma = getPrisma();
    
    const updateData: Prisma.ShopUpdateInput = { connectionStatus: status };
    
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
      const { state, saveCreds } = await getDatabaseAuthState(shopId);
      
      // 2. Get latest version
      const { version, isLatest } = await fetchLatestBaileysVersion();
      this.logger.info(`Using Baileys version ${version.join('.')}, isLatest: ${isLatest}`);

      // 3. Create socket with database-backed auth
      this.socket = makeWASocket({
        version,
        auth: state,
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
      const prisma = getPrisma();
      
      await prisma.shop.update({
        where: { shopifyDomain: shopId },
        data: { whatsappSession: Prisma.JsonNull }
      });
      
      this.logger.info(`Session cleared for shop ${shopId}`);
    } catch (error) {
      this.logger.error({ err: error }, `Failed to clear session for shop ${shopId}`);
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
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      
      const imageBuffer = Buffer.from(await response.arrayBuffer());
      
      await this.socket.sendMessage(remoteJid, {
        image: imageBuffer,
        caption: caption
      });
      
      this.logger.info(`Image message sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send image message: ${error}`);
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
    
    await this.clearSession(shopId);
    
    this.logger.info(`Logged out shop ${shopId}`);
  }
}
