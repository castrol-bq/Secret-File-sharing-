import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { Server as SocketIOServer } from 'socket.io';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure temp storage exists
const VAULT_STORAGE_DIR = path.resolve(__dirname, 'vault_temp');
if (!fs.existsSync(VAULT_STORAGE_DIR)) {
  fs.mkdirSync(VAULT_STORAGE_DIR, { recursive: true });
}

// Secure Shredder: Overwrite with 0x00 and random bytes before unlinking
function secureWipeFile(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > 0) {
        // Pass 1: zero out
        const zeroBuffer = Buffer.alloc(stats.size, 0);
        const fd = fs.openSync(filePath, 'r+');
        fs.writeSync(fd, zeroBuffer, 0, stats.size, 0);
        fs.fsyncSync(fd);
        // Pass 2: random cryptographic noise
        const randBuffer = crypto.randomBytes(stats.size);
        fs.writeSync(fd, randBuffer, 0, stats.size, 0);
        fs.fsyncSync(fd);
        fs.closeSync(fd);
      }
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (err) {
    console.error(`[Security Shredder] Error securely wiping file ${filePath}:`, err);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}
  }
  return false;
}

// Types for Ephemeral Vault Items
interface VaultItem {
  id: string;
  tokenHash: string;
  isText: boolean;
  content?: string; // Text content (can be client-encrypted ciphertext)
  filePath?: string;
  filename?: string;
  mimeType?: string;
  size: number;
  createdAt: number;
  expiresAt: number;
  burnOnRead: boolean;
  maxViews: number;
  viewsRemaining: number;
  hasPassword: boolean;
  passwordHash?: string;
  passwordSalt?: string;
}

// In-Memory volatile storage for vault items
const vaultStore = new Map<string, VaultItem>(); // Key: tokenHash
const burnedTombstones = new Set<string>(); // Keep track of recently burned token hashes (for explicit 410 Gone)

// Stats
let totalWipedCount = 0;
let totalCreatedCount = 0;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

// Shred & Destroy a Vault Item
function burnVaultItem(tokenHash: string, reason: string = 'read'): boolean {
  const item = vaultStore.get(tokenHash);
  if (!item) return false;

  if (item.filePath) {
    secureWipeFile(item.filePath);
  }

  // Erase from memory
  vaultStore.delete(tokenHash);
  burnedTombstones.add(tokenHash);
  totalWipedCount++;

  // Limit tombstones size
  if (burnedTombstones.size > 10000) {
    const firstKey = burnedTombstones.values().next().value;
    if (firstKey) burnedTombstones.delete(firstKey);
  }

  console.log(`[Vault Wipe] Vault ${item.id} permanently destroyed (${reason}). Active: ${vaultStore.size}`);
  return true;
}

// Background cleanup cron (runs every 3 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [tokenHash, item] of vaultStore.entries()) {
    if (now >= item.expiresAt) {
      burnVaultItem(tokenHash, 'expired TTL');
    }
  }
}, 3000);

// Multer configuration for file uploads (max 50MB)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, VAULT_STORAGE_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const safeExt = path.extname(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '');
    cb(null, `vault_${Date.now()}_${uniqueSuffix}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// Setup Express app & HTTP Server
const app = express();
const httpServer = http.createServer(app);

// JSON and URL-encoded body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ----------------------------------------------------
// REST API ENDPOINTS: VAULT
// ----------------------------------------------------

// 1. Create Vault Item (Text or File)
app.post('/api/vault/create', upload.single('file'), (req, res) => {
  try {
    const {
      type, // 'text' | 'file'
      text, // text secret or encrypted payload
      ttlSeconds, // e.g. 60, 300, 3600
      burnOnRead, // 'true' | 'false' | boolean
      maxViews, // e.g. 1, 3, 5
      password, // optional
    } = req.body;

    const isText = type === 'text' || !req.file;

    if (isText && (!text || text.trim().length === 0)) {
      return res.status(400).json({ error: 'Secret text cannot be empty.' });
    }

    if (!isText && !req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    // Generate high-entropy 256-bit token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    const ttl = Math.max(10, Math.min(60 * 60 * 24 * 7, parseInt(ttlSeconds as string) || 3600)); // Default 1 hr, max 7 days
    const shouldBurnOnRead = burnOnRead === 'true' || burnOnRead === true;
    const views = shouldBurnOnRead ? 1 : Math.max(1, Math.min(100, parseInt(maxViews as string) || 1));

    let passwordSalt: string | undefined;
    let passwordHash: string | undefined;
    if (password && typeof password === 'string' && password.trim().length > 0) {
      passwordSalt = crypto.randomBytes(16).toString('hex');
      passwordHash = hashPassword(password.trim(), passwordSalt);
    }

    const id = crypto.randomBytes(8).toString('hex');
    const now = Date.now();

    const vaultItem: VaultItem = {
      id,
      tokenHash,
      isText,
      content: isText ? text : undefined,
      filePath: req.file ? req.file.path : undefined,
      filename: req.file ? req.file.originalname : undefined,
      mimeType: req.file ? req.file.mimetype : 'text/plain',
      size: req.file ? req.file.size : Buffer.byteLength(text || '', 'utf8'),
      createdAt: now,
      expiresAt: now + ttl * 1000,
      burnOnRead: shouldBurnOnRead,
      maxViews: views,
      viewsRemaining: views,
      hasPassword: !!passwordHash,
      passwordHash,
      passwordSalt,
    };

    vaultStore.set(tokenHash, vaultItem);
    totalCreatedCount++;

    return res.status(201).json({
      success: true,
      token: rawToken,
      id,
      isText,
      filename: vaultItem.filename,
      size: vaultItem.size,
      expiresAt: vaultItem.expiresAt,
      ttlSeconds: ttl,
      burnOnRead: shouldBurnOnRead,
      viewsRemaining: views,
      hasPassword: vaultItem.hasPassword,
    });
  } catch (error: any) {
    console.error('Error creating vault:', error);
    if (req.file) {
      secureWipeFile(req.file.path);
    }
    return res.status(500).json({ error: 'Failed to create secure vault.' });
  }
});

// 2. Inspect Vault Metadata (Without consuming view / burning yet)
app.get('/api/vault/meta/:token', (req, res) => {
  const token = req.params.token;
  if (!token) {
    return res.status(400).json({ error: 'Invalid token format.' });
  }

  const tokenHash = hashToken(token);

  if (burnedTombstones.has(tokenHash)) {
    return res.status(410).json({
      error: 'This secure vault has been permanently burned and destroyed.',
      burned: true,
    });
  }

  const item = vaultStore.get(tokenHash);
  if (!item) {
    return res.status(404).json({
      error: 'Secure vault item not found or expired.',
      burned: false,
    });
  }

  if (Date.now() >= item.expiresAt) {
    burnVaultItem(tokenHash, 'expired TTL during check');
    return res.status(410).json({
      error: 'This vault item reached its Time-To-Live expiration and was shredded.',
      burned: true,
    });
  }

  return res.json({
    id: item.id,
    isText: item.isText,
    filename: item.filename,
    mimeType: item.mimeType,
    size: item.size,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt,
    burnOnRead: item.burnOnRead,
    maxViews: item.maxViews,
    viewsRemaining: item.viewsRemaining,
    hasPassword: item.hasPassword,
  });
});

// 3. Unlock / Reveal Secret (Decrements view count; burns if burnOnRead or 0 views left)
app.post('/api/vault/unlock/:token', (req, res) => {
  const token = req.params.token;
  const { password } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token is required.' });
  }

  const tokenHash = hashToken(token);

  if (burnedTombstones.has(tokenHash)) {
    return res.status(410).json({
      error: 'This secure vault has already been burned and wiped from memory.',
      burned: true,
    });
  }

  const item = vaultStore.get(tokenHash);
  if (!item) {
    return res.status(404).json({
      error: 'Vault item not found or expired.',
      burned: false,
    });
  }

  if (Date.now() >= item.expiresAt) {
    burnVaultItem(tokenHash, 'expired TTL during unlock');
    return res.status(410).json({
      error: 'This vault item reached its Time-To-Live expiration and was shredded.',
      burned: true,
    });
  }

  // Password verification
  if (item.hasPassword) {
    if (!password || typeof password !== 'string') {
      return res.status(401).json({ error: 'This secret requires a password to unlock.' });
    }
    const computedHash = hashPassword(password.trim(), item.passwordSalt!);
    if (computedHash !== item.passwordHash) {
      return res.status(403).json({ error: 'Incorrect vault password.' });
    }
  }

  // Decrement remaining views
  item.viewsRemaining -= 1;
  const shouldBurnNow = item.burnOnRead || item.viewsRemaining <= 0;

  if (item.isText) {
    const textSecret = item.content;
    if (shouldBurnNow) {
      burnVaultItem(tokenHash, 'unlocked text burned');
    }
    return res.json({
      success: true,
      isText: true,
      secret: textSecret,
      viewsRemaining: shouldBurnNow ? 0 : item.viewsRemaining,
      burned: shouldBurnNow,
    });
  } else {
    // For files, generate a one-time ephemeral download authorization ticket
    const ticket = crypto.randomBytes(24).toString('hex');
    fileDownloadTickets.set(ticket, {
      tokenHash,
      expiresAt: Date.now() + 60000, // 60s ticket validity
      shouldBurnOnDownload: shouldBurnNow,
    });

    return res.json({
      success: true,
      isText: false,
      filename: item.filename,
      size: item.size,
      mimeType: item.mimeType,
      downloadTicket: ticket,
      viewsRemaining: shouldBurnNow ? 0 : item.viewsRemaining,
      burned: shouldBurnNow,
    });
  }
});

// Ephemeral file download tickets
const fileDownloadTickets = new Map<
  string,
  { tokenHash: string; expiresAt: number; shouldBurnOnDownload: boolean }
>();

// 4. Download file via one-time ticket
app.get('/api/vault/download/:ticket', (req, res) => {
  const ticket = req.params.ticket;
  const auth = fileDownloadTickets.get(ticket);

  if (!auth || Date.now() > auth.expiresAt) {
    fileDownloadTickets.delete(ticket);
    return res.status(403).json({ error: 'Download ticket expired or invalid.' });
  }

  // Consume ticket immediately
  fileDownloadTickets.delete(ticket);

  const item = vaultStore.get(auth.tokenHash);
  if (!item || !item.filePath || !fs.existsSync(item.filePath)) {
    return res.status(410).json({ error: 'File has already been permanently deleted.' });
  }

  const safeFilename = encodeURIComponent(item.filename || 'vault_file.bin');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.setHeader('Content-Type', item.mimeType || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  const fileStream = fs.createReadStream(item.filePath);
  fileStream.pipe(res);

  fileStream.on('end', () => {
    if (auth.shouldBurnOnDownload) {
      burnVaultItem(auth.tokenHash, 'download completed');
    }
  });

  fileStream.on('error', (err) => {
    console.error('Error streaming vault file:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream vault file.' });
    }
  });
});

// 5. Manual Instant Burn / Panic Destroy
app.post('/api/vault/burn/:token', (req, res) => {
  const token = req.params.token;
  if (!token) return res.status(400).json({ error: 'Token required.' });
  const tokenHash = hashToken(token);

  const success = burnVaultItem(tokenHash, 'manual burn command');
  if (success) {
    return res.json({ success: true, message: 'Vault permanently wiped.' });
  } else {
    return res.status(404).json({ error: 'Vault not found or already destroyed.' });
  }
});

// 6. Security Stats
app.get('/api/vault/stats', (_req, res) => {
  res.json({
    activeVaults: vaultStore.size,
    totalWiped: totalWipedCount,
    totalCreated: totalCreatedCount,
    activeChatRooms: chatRooms.size,
    serverUptimeSeconds: Math.floor(process.uptime()),
    timestamp: Date.now(),
  });
});

// ----------------------------------------------------
// SOCKET.IO: ZERO-LOG EPHEMERAL TEMPORARY CHAT ROOMS
// ----------------------------------------------------

interface ChatMember {
  socketId: string;
  codename: string;
  color: string;
  joinedAt: number;
  isHost: boolean;
}

interface ChatMessage {
  id: string;
  senderName: string;
  senderColor: string;
  senderSocketId: string;
  timestamp: number;
  text?: string;
  fileData?: {
    filename: string;
    size: number;
    mimeType: string;
    dataUrl: string; // Ephemeral in-memory only
  };
  isEncrypted: boolean;
  iv?: string; // For client-side AES-GCM
  ttlSeconds?: number; // In-chat ephemeral burn
  burnAt?: number;
}

interface ChatRoom {
  id: string;
  name: string;
  createdAt: number;
  expiresAt: number;
  hasPasscode: boolean;
  passcodeHash?: string;
  members: Map<string, ChatMember>; // socketId -> ChatMember
  messages: ChatMessage[]; // Capped ephemeral memory buffer (max 40)
  maxMembers: number;
}

const chatRooms = new Map<string, ChatRoom>();

// Socket Server initialization
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB for ephemeral images/files
});

function destroyChatRoom(roomId: string, reason: string = 'expired') {
  const room = chatRooms.get(roomId);
  if (!room) return;

  // Broadcast immediate self-destruct notice to all sockets
  io.to(roomId).emit('room:nuked', {
    roomId,
    reason: `Room has permanently self-destructed (${reason}). All volatile memory wiped.`,
  });

  // Disconnect all sockets in that room
  const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
  if (socketsInRoom) {
    for (const socketId of socketsInRoom) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(roomId);
      }
    }
  }

  // Clear in-memory buffers
  room.messages.length = 0;
  room.members.clear();
  chatRooms.delete(roomId);

  console.log(`[Chat Room Wipe] Room ${roomId} permanently shredded (${reason}). Active rooms: ${chatRooms.size}`);
}

// Background cleanup for expired chat rooms & in-chat message self-destruct
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of chatRooms.entries()) {
    if (now >= room.expiresAt) {
      destroyChatRoom(roomId, 'TTL expired');
      continue;
    }

    // Check message self-destructs
    const remainingMessages: ChatMessage[] = [];
    let burnedAny = false;
    for (const msg of room.messages) {
      if (msg.burnAt && now >= msg.burnAt) {
        burnedAny = true;
        io.to(roomId).emit('message:burned', { messageId: msg.id });
      } else {
        remainingMessages.push(msg);
      }
    }
    if (burnedAny) {
      room.messages = remainingMessages;
    }
  }
}, 1000);

io.on('connection', (socket) => {
  let currentRoomId: string | null = null;

  // Create Temporary Room
  socket.on('room:create', ({ name, ttlMinutes, passcode, codename, color }, callback) => {
    try {
      const roomId = crypto.randomBytes(6).toString('hex').toLowerCase(); // 12-char hex room code
      const ttl = Math.max(5, Math.min(1440, parseInt(ttlMinutes) || 60)); // 5 min to 24 hrs
      const now = Date.now();

      let passcodeHash: string | undefined;
      if (passcode && typeof passcode === 'string' && passcode.trim().length > 0) {
        passcodeHash = crypto.createHash('sha256').update(passcode.trim()).digest('hex');
      }

      const safeName = (name && typeof name === 'string' ? name.trim() : 'Secure Session').slice(0, 40);
      const safeCodename = (codename && typeof codename === 'string' ? codename.trim() : `Agent-${crypto.randomBytes(2).toString('hex')}`).slice(0, 24);
      const safeColor = color || '#00f0ff';

      const room: ChatRoom = {
        id: roomId,
        name: safeName,
        createdAt: now,
        expiresAt: now + ttl * 60 * 1000,
        hasPasscode: !!passcodeHash,
        passcodeHash,
        members: new Map(),
        messages: [],
        maxMembers: 20,
      };

      const member: ChatMember = {
        socketId: socket.id,
        codename: safeCodename,
        color: safeColor,
        joinedAt: now,
        isHost: true,
      };

      room.members.set(socket.id, member);
      chatRooms.set(roomId, room);

      socket.join(roomId);
      currentRoomId = roomId;

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomId,
          room: {
            id: roomId,
            name: room.name,
            createdAt: room.createdAt,
            expiresAt: room.expiresAt,
            hasPasscode: room.hasPasscode,
            isHost: true,
            myCodename: safeCodename,
            members: Array.from(room.members.values()),
          },
        });
      }
    } catch (err: any) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Failed to initialize ephemeral room.' });
      }
    }
  });

  // Join Temporary Room
  socket.on('room:join', ({ roomId, passcode, codename, color }, callback) => {
    try {
      if (!roomId) {
        return callback?.({ success: false, error: 'Room code required.' });
      }

      const room = chatRooms.get(roomId.toLowerCase().trim());
      if (!room) {
        return callback?.({ success: false, error: 'Room not found or already permanently closed.' });
      }

      if (Date.now() >= room.expiresAt) {
        destroyChatRoom(roomId, 'TTL expired on join');
        return callback?.({ success: false, error: 'Room TTL has expired and was deleted.' });
      }

      if (room.members.size >= room.maxMembers) {
        return callback?.({ success: false, error: 'Room has reached maximum participant capacity (20).' });
      }

      if (room.hasPasscode) {
        const inputHash = crypto.createHash('sha256').update((passcode || '').trim()).digest('hex');
        if (inputHash !== room.passcodeHash) {
          return callback?.({ success: false, error: 'Invalid room security passcode.' });
        }
      }

      const safeCodename = (codename && typeof codename === 'string' ? codename.trim() : `Agent-${crypto.randomBytes(2).toString('hex')}`).slice(0, 24);
      const safeColor = color || '#00f0ff';

      const member: ChatMember = {
        socketId: socket.id,
        codename: safeCodename,
        color: safeColor,
        joinedAt: Date.now(),
        isHost: room.members.size === 0,
      };

      room.members.set(socket.id, member);
      socket.join(room.id);
      currentRoomId = room.id;

      // Broadcast member joined
      socket.to(room.id).emit('room:user-joined', {
        member,
        activeCount: room.members.size,
        systemMessage: `${member.codename} entered the secure enclave.`,
      });

      if (typeof callback === 'function') {
        callback({
          success: true,
          room: {
            id: room.id,
            name: room.name,
            createdAt: room.createdAt,
            expiresAt: room.expiresAt,
            hasPasscode: room.hasPasscode,
            isHost: member.isHost,
            myCodename: member.codename,
            members: Array.from(room.members.values()),
            recentMessages: room.messages,
          },
        });
      }
    } catch (err: any) {
      callback?.({ success: false, error: 'Could not connect to room.' });
    }
  });

  // Send Message
  socket.on('room:message', ({ roomId, text, fileData, isEncrypted, iv, ttlSeconds }, callback) => {
    const room = chatRooms.get(roomId);
    if (!room) {
      return callback?.({ success: false, error: 'Room does not exist.' });
    }

    const member = room.members.get(socket.id);
    if (!member) {
      return callback?.({ success: false, error: 'Not authenticated in this room.' });
    }

    const now = Date.now();
    const ttl = ttlSeconds ? Math.max(5, Math.min(3600, parseInt(ttlSeconds))) : undefined;
    const burnAt = ttl ? now + ttl * 1000 : undefined;

    const message: ChatMessage = {
      id: crypto.randomBytes(12).toString('hex'),
      senderName: member.codename,
      senderColor: member.color,
      senderSocketId: socket.id,
      timestamp: now,
      text: typeof text === 'string' ? text.slice(0, 10000) : undefined,
      fileData: fileData ? {
        filename: String(fileData.filename || 'file').slice(0, 100),
        size: Number(fileData.size) || 0,
        mimeType: String(fileData.mimeType || 'application/octet-stream'),
        dataUrl: String(fileData.dataUrl || ''),
      } : undefined,
      isEncrypted: !!isEncrypted,
      iv: iv ? String(iv) : undefined,
      ttlSeconds: ttl,
      burnAt,
    };

    // Store in ephemeral ring buffer
    room.messages.push(message);
    if (room.messages.length > 40) {
      room.messages.shift();
    }

    // Broadcast message to all participants
    io.to(roomId).emit('room:new-message', message);

    callback?.({ success: true, messageId: message.id });
  });

  // Typing indicator
  socket.on('room:typing', ({ roomId, isTyping }) => {
    const room = chatRooms.get(roomId);
    if (room) {
      const member = room.members.get(socket.id);
      if (member) {
        socket.to(roomId).emit('room:typing', {
          socketId: socket.id,
          codename: member.codename,
          isTyping: !!isTyping,
        });
      }
    }
  });

  // Burn a specific message manually
  socket.on('room:burn-message', ({ roomId, messageId }) => {
    const room = chatRooms.get(roomId);
    if (room) {
      room.messages = room.messages.filter((m) => m.id !== messageId);
      io.to(roomId).emit('message:burned', { messageId });
    }
  });

  // Panic Nuke Room
  socket.on('room:nuke', ({ roomId }, callback) => {
    const room = chatRooms.get(roomId);
    if (!room) {
      return callback?.({ success: false, error: 'Room already gone.' });
    }
    destroyChatRoom(roomId, 'Emergency nuke triggered by operator');
    callback?.({ success: true });
  });

  // Leave Room
  socket.on('room:leave', ({ roomId }) => {
    const room = chatRooms.get(roomId);
    if (room) {
      const member = room.members.get(socket.id);
      room.members.delete(socket.id);
      socket.leave(roomId);

      if (member) {
        io.to(roomId).emit('room:user-left', {
          socketId: socket.id,
          codename: member.codename,
          activeCount: room.members.size,
          systemMessage: `${member.codename} severed connection and vanished.`,
        });
      }

      // If room is empty, destroy it after 60s if nobody rejoins
      if (room.members.size === 0) {
        setTimeout(() => {
          const fresh = chatRooms.get(roomId);
          if (fresh && fresh.members.size === 0) {
            destroyChatRoom(roomId, 'all participants disconnected');
          }
        }, 60000);
      }
    }
    if (currentRoomId === roomId) {
      currentRoomId = null;
    }
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    if (currentRoomId) {
      const room = chatRooms.get(currentRoomId);
      if (room) {
        const member = room.members.get(socket.id);
        room.members.delete(socket.id);
        if (member) {
          io.to(currentRoomId).emit('room:user-left', {
            socketId: socket.id,
            codename: member.codename,
            activeCount: room.members.size,
            systemMessage: `${member.codename} disconnected.`,
          });
        }
        if (room.members.size === 0) {
          setTimeout(() => {
            const fresh = chatRooms.get(currentRoomId!);
            if (fresh && fresh.members.size === 0) {
              destroyChatRoom(currentRoomId!, 'all participants disconnected');
            }
          }, 60000);
        }
      }
    }
  });
});

// ----------------------------------------------------
// CLIENT SERVING & SPA FALLBACK
// ----------------------------------------------------

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Jailoroom Core] Secure Vault & Chat Server listening on port ${PORT}`);
    console.log(`[Security Protocol] Volatile storage directory initialized: ${VAULT_STORAGE_DIR}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
