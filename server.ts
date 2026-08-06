import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import multer from "multer";
import cors from "cors";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { createServer as createViteServer } from "vite";

const PORT = 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e7 // 10MB
});

// Setup paths
const DATA_DIR = path.join(process.cwd(), "data");
const PUBLIC_DIR = path.join(process.cwd(), "public");
const UPLOADS_DIR = path.join(PUBLIC_DIR, "uploads");

const USERS_FILE = path.join(DATA_DIR, "users.json");
const CHATS_FILE = path.join(DATA_DIR, "chats.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Initialize data files if missing
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}), "utf8");
if (!fs.existsSync(CHATS_FILE)) fs.writeFileSync(CHATS_FILE, JSON.stringify({}), "utf8");
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, JSON.stringify({}), "utf8");

// Load initial data
let users: Record<string, any> = {};
let chats: Record<string, any> = {};
let messages: Record<string, any[]> = {};

try {
  users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  chats = JSON.parse(fs.readFileSync(CHATS_FILE, "utf8"));
  messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf8"));
} catch (err) {
  console.error("Error reading JSON files:", err);
}

// Debounced save helper
let saveTimeout: NodeJS.Timeout | null = null;
function saveData() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), () => {});
    fs.writeFile(CHATS_FILE, JSON.stringify(chats, null, 2), () => {});
    fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2), () => {});
  }, 500);
}

// Ensure default "Telegram Updates" or "Saved Messages" bot or welcome user exists if empty
function ensureSystemAccount() {
  if (!users["system_telegram"]) {
    users["system_telegram"] = {
      id: "system_telegram",
      username: "telegram",
      displayName: "Telegram",
      avatarColor: "#2aabee",
      avatarUrl: "/telegram-official-avatar.png",
      lastSeen: Date.now(),
      chats: []
    };
    saveData();
  }
}
ensureSystemAccount();

// Configure Multer for File Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = `${Date.now()}-${uuidv4()}${ext}`;
    cb(null, safeName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB max file size
});

// Middleware
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use(express.static(PUBLIC_DIR));

// File Upload REST Route
app.post("/upload", upload.single("file"), (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({
    success: true,
    url: fileUrl,
    filename: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype
  });
});
app.post("/api/upload", upload.single("file"), (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({
    success: true,
    url: fileUrl,
    filename: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype
  });
});

// Check Username Availability Route
app.get("/api/check-username", (req: any, res: any) => {
  const username = String(req.query.username || "").toLowerCase().trim();
  if (!username || username.length < 3) {
    return res.json({ available: false, message: "Username must be at least 3 characters" });
  }
  const taken = Object.values(users).some(
    (u: any) => u.username && u.username.toLowerCase() === username
  );
  res.json({ available: !taken });
});

// Generate Telegram PNG Icons dynamically if missing
function generateTelegramIconSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <defs>
      <linearGradient id="tgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#2AABEE"/>
        <stop offset="100%" stop-color="#229ED9"/>
      </linearGradient>
    </defs>
    <circle cx="256" cy="256" r="256" fill="url(#tgGrad)"/>
    <path fill="#FFFFFF" d="M381.1 143.1L107.5 248.6c-18.7 7.5-18.6 17.9-3.4 22.5l70.2 21.9 162.6-102.6c7.7-4.7 14.7-2.1 8.9 3.1L214 286.3l-5.1 72.8c7.1 0 10.3-3.3 14.3-7.2l34.4-33.5 71.5 52.8c13.2 7.3 22.7 3.5 26-12.2l46.9-221.1c4.8-19.3-7.3-28-19.9-22.3z"/>
  </svg>`;
}

app.get("/icon-192.png", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(generateTelegramIconSVG());
});

app.get("/icon-512.png", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(generateTelegramIconSVG());
});

app.get("/telegram-official-avatar.png", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(generateTelegramIconSVG());
});

// Socket.io connection state tracking
const userSockets: Record<string, Set<string>> = {}; // userId -> set of socketIds

io.on("connection", (socket) => {
  let currentUserId: string | null = null;

  // 1. REGISTER
  socket.on("register", (data, callback) => {
    const { username, displayName, avatarColor, avatarUrl } = data || {};
    const cleanUsername = String(username || "").trim();
    const cleanName = String(displayName || "").trim();

    if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 20) {
      const err = "Username must be between 3 and 20 characters.";
      if (callback) callback({ error: err });
      socket.emit("registration-error", { message: err });
      return;
    }

    if (!/^[a-zA-Z0-0_]+$/.test(cleanUsername)) {
      const err = "Username can only contain letters, numbers, and underscores.";
      if (callback) callback({ error: err });
      socket.emit("registration-error", { message: err });
      return;
    }

    // Check uniqueness
    const existing = Object.values(users).find(
      (u: any) => u.username && u.username.toLowerCase() === cleanUsername.toLowerCase()
    );

    if (existing) {
      const err = `Username "@${cleanUsername}" is already taken.`;
      if (callback) callback({ error: err });
      socket.emit("registration-error", { message: err });
      return;
    }

    const userId = "user_" + uuidv4().slice(0, 8);
    const newUser = {
      id: userId,
      username: cleanUsername,
      displayName: cleanName || cleanUsername,
      avatarColor: avatarColor || "#4dabf7",
      avatarUrl: avatarUrl || null,
      lastSeen: Date.now(),
      chats: []
    };

    // Save to memory and JSON
    users[userId] = newUser;

    // Create Saved Messages default chat for this user
    const savedChatId = "chat_saved_" + userId;
    chats[savedChatId] = {
      id: savedChatId,
      type: "saved",
      name: "Saved Messages",
      participants: [userId],
      createdAt: Date.now()
    };
    newUser.chats.push(savedChatId);
    messages[savedChatId] = [
      {
        id: "msg_welcome_" + Date.now(),
        chatId: savedChatId,
        senderId: "system_telegram",
        text: "Welcome to Telegram! Save messages, photos, and notes here for yourself.",
        timestamp: Date.now(),
        type: "text",
        status: "read",
        data: null
      }
    ];

    saveData();

    currentUserId = userId;
    if (!userSockets[userId]) userSockets[userId] = new Set();
    userSockets[userId].add(socket.id);

    const payload = {
      userId,
      username: newUser.username,
      displayName: newUser.displayName,
      avatarColor: newUser.avatarColor,
      avatarUrl: newUser.avatarUrl
    };

    if (callback) callback({ success: true, user: payload });
    socket.emit("registered", payload);

    // Notify all clients of new user/contact
    io.emit("contact-updated", { user: newUser });
  });

  // 2. LOGIN / RECONNECT
  socket.on("login", (data, callback) => {
    const { userId } = data || {};
    const user = users[userId];

    if (!user) {
      const err = "User session expired or not found.";
      if (callback) callback({ error: err });
      socket.emit("login-error", { message: err });
      return;
    }

    currentUserId = userId;
    if (!userSockets[userId]) userSockets[userId] = new Set();
    userSockets[userId].add(socket.id);

    user.lastSeen = Date.now();
    saveData();

    // Get user's chats
    const userChatList = (user.chats || [])
      .map((cId: string) => chats[cId])
      .filter(Boolean);

    // All available users for contacts list
    const allUsers = Object.values(users).map((u: any) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarColor: u.avatarColor,
      avatarUrl: u.avatarUrl,
      lastSeen: u.lastSeen,
      isOnline: !!(userSockets[u.id] && userSockets[u.id].size > 0)
    }));

    const response = {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarColor: user.avatarColor,
        avatarUrl: user.avatarUrl
      },
      chats: userChatList,
      contacts: allUsers
    };

    if (callback) callback({ success: true, data: response });
    socket.emit("login-success", response);

    // Broadcast online status to all contacts
    io.emit("user-status", { userId, isOnline: true, lastSeen: Date.now() });
  });

  // 3. GET CONTACTS / ALL USERS
  socket.on("get-contacts", () => {
    const allUsers = Object.values(users).map((u: any) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarColor: u.avatarColor,
      avatarUrl: u.avatarUrl,
      lastSeen: u.lastSeen,
      isOnline: !!(userSockets[u.id] && userSockets[u.id].size > 0)
    }));
    socket.emit("contacts-list", allUsers);
  });

  // 4. CREATE OR OPEN CHAT
  socket.on("create-chat", (data, callback) => {
    const { type, participantIds, name, avatar } = data || {};
    if (!currentUserId) return;

    const fullParticipants = Array.from(new Set([currentUserId, ...(participantIds || [])]));

    // Private Chat Check (if chat between these 2 users exists, reuse it)
    if (type === "private" && fullParticipants.length === 2) {
      const existingChat = Object.values(chats).find((c: any) => {
        return (
          c.type === "private" &&
          c.participants.length === 2 &&
          c.participants.includes(fullParticipants[0]) &&
          c.participants.includes(fullParticipants[1])
        );
      });

      if (existingChat) {
        if (callback) callback({ success: true, chat: existingChat });
        socket.emit("chat-opened", existingChat);
        return;
      }
    }

    const chatId = "chat_" + uuidv4().slice(0, 8);
    const newChat = {
      id: chatId,
      type: type || "private",
      name: type === "group" ? (name || "Group Chat") : undefined,
      avatar: avatar || null,
      participants: fullParticipants,
      createdAt: Date.now()
    };

    chats[chatId] = newChat;
    messages[chatId] = [];

    // Add chat to participants' chats array
    fullParticipants.forEach((pId) => {
      if (users[pId]) {
        if (!users[pId].chats.includes(chatId)) {
          users[pId].chats.push(chatId);
        }
        // Emit to active sockets of this participant
        if (userSockets[pId]) {
          userSockets[pId].forEach((sId) => {
            io.to(sId).emit("chat-created", newChat);
          });
        }
      }
    });

    saveData();

    if (callback) callback({ success: true, chat: newChat });
  });

  // 5. FETCH CHAT HISTORY
  socket.on("fetch-chat", (data, callback) => {
    const { chatId } = data || {};
    const chatMsgs = messages[chatId] || [];
    const chatObj = chats[chatId];

    const result = {
      chatId,
      chat: chatObj,
      messages: chatMsgs
    };

    if (callback) callback(result);
    socket.emit("chat-history", result);
  });

  // 6. SEND MESSAGE
  socket.on("send-message", (data, callback) => {
    const { chatId, tempId, text, type, data: msgData } = data || {};
    if (!currentUserId || !chatId || !chats[chatId]) return;

    const msgId = "msg_" + uuidv4().slice(0, 10);
    const newMsg = {
      id: msgId,
      chatId,
      senderId: currentUserId,
      text: text || "",
      timestamp: Date.now(),
      type: type || "text",
      status: "sent",
      data: msgData || null
    };

    if (!messages[chatId]) messages[chatId] = [];
    messages[chatId].push(newMsg);
    saveData();

    const payload = {
      chatId,
      tempId,
      message: newMsg
    };

    // Broadcast to all participants in this chat
    const chat = chats[chatId];
    chat.participants.forEach((pId: string) => {
      if (userSockets[pId]) {
        userSockets[pId].forEach((sId) => {
          io.to(sId).emit("new-message", payload);
        });
      }
    });

    if (callback) callback({ success: true, message: newMsg });
  });

  // 7. MESSAGE READ RECEIPTS
  socket.on("message-read", (data) => {
    const { chatId, lastMessageId } = data || {};
    if (!chatId || !messages[chatId] || !currentUserId) return;

    let updated = false;
    messages[chatId].forEach((msg) => {
      if (msg.senderId !== currentUserId && msg.status !== "read") {
        msg.status = "read";
        updated = true;
      }
    });

    if (updated) {
      saveData();
      const chat = chats[chatId];
      chat.participants.forEach((pId: string) => {
        if (userSockets[pId]) {
          userSockets[pId].forEach((sId) => {
            io.to(sId).emit("messages-read-update", { chatId, lastMessageId, readerId: currentUserId });
          });
        }
      });
    }
  });

  // 8. TYPING INDICATOR
  socket.on("typing", (data) => {
    const { chatId, isTyping } = data || {};
    if (!chatId || !chats[chatId] || !currentUserId) return;

    const chat = chats[chatId];
    const user = users[currentUserId];

    chat.participants.forEach((pId: string) => {
      if (pId !== currentUserId && userSockets[pId]) {
        userSockets[pId].forEach((sId) => {
          io.to(sId).emit("user-typing", {
            chatId,
            userId: currentUserId,
            displayName: user?.displayName || user?.username,
            isTyping
          });
        });
      }
    });
  });

  // 9. POLL VOTING
  socket.on("vote-poll", (data, callback) => {
    const { chatId, messageId, optionIndex } = data || {};
    if (!chatId || !messageId || !currentUserId || !messages[chatId]) return;

    const msg = messages[chatId].find((m) => m.id === messageId);
    if (!msg || msg.type !== "poll" || !msg.data || !msg.data.options) return;

    const poll = msg.data;
    // Check if user already voted
    let previousVoteIndex = -1;
    poll.options.forEach((opt: any, idx: number) => {
      if (!opt.voters) opt.voters = [];
      const userIdx = opt.voters.indexOf(currentUserId);
      if (userIdx !== -1) {
        previousVoteIndex = idx;
        opt.voters.splice(userIdx, 1);
      }
    });

    // Toggle vote if clicking same option, or cast new vote
    if (previousVoteIndex !== optionIndex) {
      if (!poll.options[optionIndex].voters) poll.options[optionIndex].voters = [];
      poll.options[optionIndex].voters.push(currentUserId);
    }

    // Recalculate totals
    poll.totalVotes = poll.options.reduce((sum: number, opt: any) => sum + (opt.voters ? opt.voters.length : 0), 0);

    saveData();

    const payload = { chatId, messageId, pollData: poll };

    const chat = chats[chatId];
    chat.participants.forEach((pId: string) => {
      if (userSockets[pId]) {
        userSockets[pId].forEach((sId) => {
          io.to(sId).emit("poll-updated", payload);
        });
      }
    });

    if (callback) callback({ success: true, poll });
  });

  // 10. UPDATE PROFILE
  socket.on("update-profile", (data, callback) => {
    const { displayName, avatarUrl, avatarColor } = data || {};
    if (!currentUserId || !users[currentUserId]) return;

    const user = users[currentUserId];
    if (displayName) user.displayName = String(displayName).trim();
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
    if (avatarColor) user.avatarColor = avatarColor;

    saveData();

    const updatedUser = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarColor: user.avatarColor,
      avatarUrl: user.avatarUrl
    };

    io.emit("contact-updated", { user: updatedUser });
    if (callback) callback({ success: true, user: updatedUser });
  });

  // 11. CLEAR HISTORY OR DELETE CHAT
  socket.on("clear-history", (data, callback) => {
    const { chatId } = data || {};
    if (!chatId || !messages[chatId]) return;

    messages[chatId] = [];
    saveData();

    const chat = chats[chatId];
    if (chat) {
      chat.participants.forEach((pId: string) => {
        if (userSockets[pId]) {
          userSockets[pId].forEach((sId) => {
            io.to(sId).emit("history-cleared", { chatId });
          });
        }
      });
    }

    if (callback) callback({ success: true });
  });

  // 12. DISCONNECT
  socket.on("disconnect", () => {
    if (currentUserId && userSockets[currentUserId]) {
      userSockets[currentUserId].delete(socket.id);

      if (userSockets[currentUserId].size === 0) {
        delete userSockets[currentUserId];
        if (users[currentUserId]) {
          users[currentUserId].lastSeen = Date.now();
          saveData();
        }
        // Broadcast user offline status
        io.emit("user-status", { userId: currentUserId, isOnline: false, lastSeen: Date.now() });
      }
    }
  });
});

// Vite Middleware for Development / Static Production Handler
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Telegram server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
