import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import path from "path";
import Stripe from "stripe";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";
import crypto from "crypto";
import http from "http";
import { Server as SocketIOServer } from "socket.io";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const port = process.env.PORT || 3000;
const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";
const DEFAULT_MODEL = process.env.HF_MODEL || "Qwen/Qwen2.5-7B-Instruct";
const frontendRoot = path.resolve(__dirname, "..");
const dataRoot = path.resolve(__dirname, "data");
const authUsersFile = path.join(dataRoot, "users.json");
const AUTH_SALT_BYTES = 16;
const AUTH_SCRYPT_BYTES = 64;
const AUTH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const authSessions = new Map();
const multiplayerRooms = new Map();
const socketToPlayer = new Map();
const MULTIPLAYER_GRID_SIZE = 21;
const MULTIPLAYER_MAX_PLAYERS = 4;
const MULTIPLAYER_TICK_MS = 150;
const MULTIPLAYER_GROWTH_POINTS = 10;
const MULTIPLAYER_RECONNECT_GRACE_MS = 30 * 1000;
const MULTIPLAYER_PLAYER_COLORS = ["#7aff95", "#7fe4ff", "#ffb86c", "#caa8ff"];
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
const demoCheckoutSessions = new Map();

const PLAN_CATALOG = {
  teacher: {
    pro: { name: "Teacher Pro", monthly: 12, yearly: 115 },
    school: { name: "School Premium", monthly: 49, yearly: 470 },
  },
  student: {
    student_plus: { name: "Student Plus", monthly: 5, yearly: 48 },
    student_elite: { name: "Student Elite", monthly: 9, yearly: 86 },
  },
};

const COUPON_CATALOG = {
  teacher: {
    TEACH20: { discount: 20 },
    SCHOOL10: { discount: 10 },
    LAUNCH50: { discount: 50 },
  },
  student: {
    STUDENT10: { discount: 10 },
    BACK2SCHOOL: { discount: 25 },
    LAUNCH50: { discount: 50 },
  },
};

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json());
app.use(express.static(frontendRoot));

function toCellKey(point) {
  return `${point.x},${point.y}`;
}

function randomRoomId() {
  return `room_${crypto.randomBytes(3).toString("hex")}`;
}

function randomPlayerId() {
  return `ply_${crypto.randomBytes(4).toString("hex")}`;
}

function randomReconnectToken() {
  return crypto.randomBytes(16).toString("hex");
}

function pickSpawnByIndex(index) {
  const spawnSets = [
    [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 }
    ],
    [
      { x: 15, y: 15 },
      { x: 16, y: 15 },
      { x: 17, y: 15 }
    ],
    [
      { x: 15, y: 5 },
      { x: 16, y: 5 },
      { x: 17, y: 5 }
    ],
    [
      { x: 5, y: 15 },
      { x: 4, y: 15 },
      { x: 3, y: 15 }
    ]
  ];

  return spawnSets[index % spawnSets.length].map((point) => ({ ...point }));
}

function buildEmptyRoom(roomId, hostUserId = null) {
  return {
    id: roomId,
    mode: "snake",
    hostUserId,
    createdAt: Date.now(),
    food: { x: 10, y: 10 },
    tickMs: MULTIPLAYER_TICK_MS,
    status: "waiting",
    players: new Map(),
    loopId: null,
    updatedAt: Date.now()
  };
}

function sanitizePlayer(player) {
  return {
    playerId: player.playerId,
    userId: player.userId,
    displayName: player.displayName,
    color: player.color,
    score: player.score,
    connected: player.connected,
    alive: player.alive,
    snake: player.snake
  };
}

function getRoomStateSnapshot(room) {
  return {
    roomId: room.id,
    mode: room.mode,
    createdAt: room.createdAt,
    status: room.status,
    gridSize: MULTIPLAYER_GRID_SIZE,
    tickMs: room.tickMs,
    food: room.food,
    players: [...room.players.values()].map(sanitizePlayer),
    connectedCount: [...room.players.values()].filter((player) => player.connected).length,
    updatedAt: room.updatedAt
  };
}

function emitRoomState(room) {
  io.to(room.id).emit("multiplayer:state", getRoomStateSnapshot(room));
}

function chooseFoodPosition(room) {
  const occupied = new Set();
  for (const player of room.players.values()) {
    for (const segment of player.snake) {
      occupied.add(toCellKey(segment));
    }
  }

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const candidate = {
      x: Math.floor(Math.random() * MULTIPLAYER_GRID_SIZE),
      y: Math.floor(Math.random() * MULTIPLAYER_GRID_SIZE)
    };
    if (!occupied.has(toCellKey(candidate))) {
      return candidate;
    }
  }

  return { x: 10, y: 10 };
}

function isOppositeDirection(nextDirection, currentDirection) {
  return nextDirection.x === -currentDirection.x && nextDirection.y === -currentDirection.y;
}

function stepRoom(room) {
  const now = Date.now();
  const stalePlayers = [];

  for (const player of room.players.values()) {
    if (!player.connected && player.disconnectedAt && now - player.disconnectedAt > MULTIPLAYER_RECONNECT_GRACE_MS) {
      stalePlayers.push(player.playerId);
    }
  }

  stalePlayers.forEach((playerId) => room.players.delete(playerId));

  if (room.players.size === 0) {
    if (room.loopId) {
      clearInterval(room.loopId);
      room.loopId = null;
    }
    room.updatedAt = now;
    return;
  }

  room.status = room.players.size > 1 ? "active" : "waiting";

  const alivePlayers = [...room.players.values()].filter((player) => player.alive);
  if (alivePlayers.length === 0) {
    let spawnIndex = 0;
    for (const player of room.players.values()) {
      player.snake = pickSpawnByIndex(spawnIndex);
      player.direction = { x: 1, y: 0 };
      player.queuedDirection = { x: 1, y: 0 };
      player.alive = true;
      spawnIndex += 1;
    }
    room.food = chooseFoodPosition(room);
    room.updatedAt = now;
    emitRoomState(room);
    return;
  }

  const intents = alivePlayers.map((player) => {
    const desiredDirection = isOppositeDirection(player.queuedDirection, player.direction)
      ? player.direction
      : player.queuedDirection;
    const nextHead = {
      x: player.snake[0].x + desiredDirection.x,
      y: player.snake[0].y + desiredDirection.y
    };
    return {
      player,
      desiredDirection,
      nextHead,
      dead: false
    };
  });

  const headCollisions = new Map();
  intents.forEach((intent) => {
    const key = toCellKey(intent.nextHead);
    headCollisions.set(key, (headCollisions.get(key) || 0) + 1);
  });

  intents.forEach((intent) => {
    const { nextHead } = intent;
    if (
      nextHead.x < 0
      || nextHead.x >= MULTIPLAYER_GRID_SIZE
      || nextHead.y < 0
      || nextHead.y >= MULTIPLAYER_GRID_SIZE
    ) {
      intent.dead = true;
      return;
    }

    if ((headCollisions.get(toCellKey(nextHead)) || 0) > 1) {
      intent.dead = true;
    }
  });

  const occupied = new Map();
  for (const player of room.players.values()) {
    for (const segment of player.snake) {
      occupied.set(toCellKey(segment), player.playerId);
    }
  }

  intents.forEach((intent) => {
    if (intent.dead) {
      return;
    }

    const nextKey = toCellKey(intent.nextHead);
    const nextOwner = occupied.get(nextKey);
    const tail = intent.player.snake[intent.player.snake.length - 1];
    const tailKey = toCellKey(tail);
    const touchingOwnTail = nextOwner === intent.player.playerId && nextKey === tailKey;

    if (nextOwner && !touchingOwnTail) {
      intent.dead = true;
    }
  });

  let foodEaten = false;
  for (const intent of intents) {
    const player = intent.player;
    if (intent.dead) {
      player.alive = false;
      continue;
    }

    player.direction = intent.desiredDirection;
    player.snake.unshift(intent.nextHead);

    const consumedFood = intent.nextHead.x === room.food.x && intent.nextHead.y === room.food.y && !foodEaten;
    if (consumedFood) {
      player.score += MULTIPLAYER_GROWTH_POINTS;
      foodEaten = true;
    } else {
      player.snake.pop();
    }
  }

  if (foodEaten) {
    room.food = chooseFoodPosition(room);
  }

  room.updatedAt = now;
  emitRoomState(room);
}

function ensureRoomLoop(room) {
  if (room.loopId) {
    return;
  }

  room.loopId = setInterval(() => {
    stepRoom(room);
  }, room.tickMs);
}

function getPlayerByToken(room, playerToken) {
  if (!playerToken) {
    return null;
  }

  return [...room.players.values()].find((player) => player.reconnectToken === playerToken) || null;
}

async function ensureAuthStorage() {
  await fs.mkdir(dataRoot, { recursive: true });
  try {
    await fs.access(authUsersFile);
  } catch (_error) {
    await fs.writeFile(authUsersFile, "[]", "utf8");
  }
}

async function readUsers() {
  await ensureAuthStorage();
  const raw = await fs.readFile(authUsersFile, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeUsers(users) {
  await ensureAuthStorage();
  await fs.writeFile(authUsersFile, JSON.stringify(users, null, 2), "utf8");
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(AUTH_SALT_BYTES).toString("hex");
    crypto.scrypt(password, salt, AUTH_SCRYPT_BYTES, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

function verifyPassword(password, storedHash) {
  return new Promise((resolve, reject) => {
    const parts = String(storedHash || "").split(":");
    if (parts.length !== 2) {
      resolve(false);
      return;
    }

    const [salt, keyHex] = parts;
    crypto.scrypt(password, salt, AUTH_SCRYPT_BYTES, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      const keyBuffer = Buffer.from(keyHex, "hex");
      const sameLength = keyBuffer.length === derivedKey.length;
      const isValid = sameLength && crypto.timingSafeEqual(keyBuffer, derivedKey);
      resolve(isValid);
    });
  });
}

function sanitizeAuthUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    age: user.age,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function getBearerToken(req) {
  const authHeader = String(req.headers.authorization || "");
  if (!authHeader.startsWith("Bearer ")) {
    return "";
  }

  return authHeader.slice(7).trim();
}

function createAuthSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  authSessions.set(token, {
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + AUTH_TOKEN_TTL_MS,
  });
  return token;
}

async function resolveAuthUserFromToken(token) {
  const session = getSessionFromToken(token);
  if (!session) {
    return null;
  }

  const users = await readUsers();
  return users.find((item) => item.id === session.userId) || null;
}

async function resolveAuthUserFromRequest(req) {
  const token = getBearerToken(req);
  if (!token) {
    return null;
  }

  return resolveAuthUserFromToken(token);
}

function getSessionFromToken(token) {
  const session = authSessions.get(token);
  if (!session) {
    return null;
  }

  if (session.expiresAt < Date.now()) {
    authSessions.delete(token);
    return null;
  }

  return session;
}

app.get("/api/auth/health", (_req, res) => {
  res.json({ ok: true, service: "auth" });
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { username, email, age, password, role } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedUsername = String(username || "").trim();
    const normalizedRole = role === "teacher" ? "teacher" : "student";
    const ageNumber = Number(age);

    if (!normalizedUsername || !normalizedEmail || !password) {
      return res.status(400).json({ error: "username, email, and password are required." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: "Please provide a valid email address." });
    }

    if (!Number.isFinite(ageNumber) || ageNumber < 5 || ageNumber > 120) {
      return res.status(400).json({ error: "Age must be a number between 5 and 120." });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const users = await readUsers();
    const existing = users.find((user) => String(user.email).toLowerCase() === normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await hashPassword(String(password));
    const user = {
      id: crypto.randomUUID(),
      username: normalizedUsername,
      email: normalizedEmail,
      age: Math.round(ageNumber),
      role: normalizedRole,
      passwordHash,
      createdAt: Date.now(),
    };

    users.push(user);
    await writeUsers(users);

    const token = createAuthSession(user.id);
    return res.status(201).json({
      token,
      user: sanitizeAuthUser(user),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const passwordValue = String(password || "");

    if (!normalizedEmail || !passwordValue) {
      return res.status(400).json({ error: "email and password are required." });
    }

    const users = await readUsers();
    const user = users.find((item) => String(item.email).toLowerCase() === normalizedEmail);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const passwordMatches = await verifyPassword(passwordValue, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = createAuthSession(user.id);
    return res.json({ token, user: sanitizeAuthUser(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to sign in." });
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Missing bearer token." });
    }

    const session = getSessionFromToken(token);
    if (!session) {
      return res.status(401).json({ error: "Session is invalid or expired." });
    }

    const users = await readUsers();
    const user = users.find((item) => item.id === session.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.json({ user: sanitizeAuthUser(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch profile." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(400).json({ error: "Missing bearer token." });
  }

  authSessions.delete(token);
  return res.json({ ok: true });
});

app.post("/api/multiplayer/rooms", async (req, res) => {
  try {
    const authUser = await resolveAuthUserFromRequest(req);
    const roomId = randomRoomId();
    const room = buildEmptyRoom(roomId, authUser?.id || null);
    multiplayerRooms.set(roomId, room);

    return res.status(201).json({
      roomId,
      mode: room.mode,
      status: room.status,
      tickMs: room.tickMs,
      createdAt: room.createdAt
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create room." });
  }
});

app.post("/api/multiplayer/rooms/:roomId/join", async (req, res) => {
  try {
    const room = multiplayerRooms.get(req.params.roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found." });
    }

    const authUser = await resolveAuthUserFromRequest(req);
    const providedPlayerToken = String(req.body?.playerToken || "").trim();
    const displayNameFromBody = String(req.body?.displayName || "").trim();

    let player = null;
    if (authUser) {
      player = [...room.players.values()].find((item) => item.userId === authUser.id) || null;
    }

    if (!player) {
      player = getPlayerByToken(room, providedPlayerToken);
    }

    if (!player) {
      if (room.players.size >= MULTIPLAYER_MAX_PLAYERS) {
        return res.status(409).json({ error: "Room is full." });
      }

      const spawnIndex = room.players.size;
      const playerId = randomPlayerId();
      player = {
        playerId,
        reconnectToken: randomReconnectToken(),
        userId: authUser?.id || null,
        displayName: displayNameFromBody || authUser?.username || `Player ${room.players.size + 1}`,
        color: MULTIPLAYER_PLAYER_COLORS[spawnIndex % MULTIPLAYER_PLAYER_COLORS.length],
        snake: pickSpawnByIndex(spawnIndex),
        direction: { x: 1, y: 0 },
        queuedDirection: { x: 1, y: 0 },
        score: 0,
        alive: true,
        connected: false,
        socketId: "",
        disconnectedAt: 0,
        createdAt: Date.now()
      };
      room.players.set(player.playerId, player);
      room.food = chooseFoodPosition(room);
    } else if (displayNameFromBody) {
      player.displayName = displayNameFromBody;
    }

    room.updatedAt = Date.now();

    return res.json({
      roomId: room.id,
      playerId: player.playerId,
      playerToken: player.reconnectToken,
      socketNamespace: "/",
      state: getRoomStateSnapshot(room)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to join room." });
  }
});

app.get("/api/multiplayer/rooms/:roomId/state", (req, res) => {
  const room = multiplayerRooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found." });
  }

  return res.json(getRoomStateSnapshot(room));
});

io.on("connection", async (socket) => {
  try {
    const roomId = String(socket.handshake.auth?.roomId || "").trim();
    const playerToken = String(socket.handshake.auth?.playerToken || "").trim();
    const authToken = String(socket.handshake.auth?.authToken || "").trim();
    const displayName = String(socket.handshake.auth?.displayName || "").trim();

    if (!roomId) {
      socket.emit("multiplayer:error", { error: "Missing roomId in socket auth payload." });
      socket.disconnect(true);
      return;
    }

    const room = multiplayerRooms.get(roomId);
    if (!room) {
      socket.emit("multiplayer:error", { error: "Room not found." });
      socket.disconnect(true);
      return;
    }

    let authUser = null;
    if (authToken) {
      authUser = await resolveAuthUserFromToken(authToken);
    }

    let player = null;
    if (authUser) {
      player = [...room.players.values()].find((item) => item.userId === authUser.id) || null;
    }
    if (!player) {
      player = getPlayerByToken(room, playerToken);
    }

    if (!player) {
      socket.emit("multiplayer:error", { error: "Player is not registered in this room. Join via REST API first." });
      socket.disconnect(true);
      return;
    }

    player.connected = true;
    player.socketId = socket.id;
    player.disconnectedAt = 0;
    if (displayName) {
      player.displayName = displayName;
    }

    socket.join(room.id);
    socketToPlayer.set(socket.id, { roomId: room.id, playerId: player.playerId });

    room.updatedAt = Date.now();
    ensureRoomLoop(room);

    socket.emit("multiplayer:joined", {
      roomId: room.id,
      playerId: player.playerId,
      state: getRoomStateSnapshot(room)
    });
    emitRoomState(room);

    socket.on("snake:input", (payload) => {
      const mapping = socketToPlayer.get(socket.id);
      if (!mapping) {
        return;
      }

      const mappedRoom = multiplayerRooms.get(mapping.roomId);
      if (!mappedRoom) {
        return;
      }

      const mappedPlayer = mappedRoom.players.get(mapping.playerId);
      if (!mappedPlayer || !mappedPlayer.alive) {
        return;
      }

      const x = Number(payload?.x);
      const y = Number(payload?.y);
      const isCardinal = Number.isInteger(x) && Number.isInteger(y) && Math.abs(x) + Math.abs(y) === 1;
      if (!isCardinal) {
        return;
      }

      mappedPlayer.queuedDirection = { x, y };
    });

    socket.on("disconnect", () => {
      const mapping = socketToPlayer.get(socket.id);
      socketToPlayer.delete(socket.id);
      if (!mapping) {
        return;
      }

      const mappedRoom = multiplayerRooms.get(mapping.roomId);
      if (!mappedRoom) {
        return;
      }

      const mappedPlayer = mappedRoom.players.get(mapping.playerId);
      if (!mappedPlayer) {
        return;
      }

      mappedPlayer.connected = false;
      mappedPlayer.socketId = "";
      mappedPlayer.disconnectedAt = Date.now();
      mappedRoom.updatedAt = Date.now();
      emitRoomState(mappedRoom);
    });
  } catch (error) {
    console.error(error);
    socket.emit("multiplayer:error", { error: "Socket connection failed." });
    socket.disconnect(true);
  }
});

function getBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.trim()) {
    return process.env.PUBLIC_BASE_URL.trim().replace(/\/$/, "");
  }

  return `${req.protocol}://${req.get("host")}`;
}

function normalizeRole(role) {
  return role === "student" ? "student" : "teacher";
}

function sanitizePagePath(pagePath, fallbackPath) {
  const candidate = String(pagePath || fallbackPath || "/pages/billing/payment.html").trim();
  const withoutOrigin = candidate.replace(/^https?:\/\/[^/]+/i, "");
  const withLeadingSlash = withoutOrigin.startsWith("/") ? withoutOrigin : `/${withoutOrigin.replace(/^\.?\//, "")}`;
  return withLeadingSlash.split("?")[0].split("#")[0];
}

function resolveCheckoutPlan({ role, plan, billingPeriod, couponCode }) {
  const normalizedRole = normalizeRole(role);
  const plans = PLAN_CATALOG[normalizedRole];
  const coupons = COUPON_CATALOG[normalizedRole];
  const planConfig = plans[plan];

  if (!planConfig) {
    throw new Error("Unknown plan selected for Stripe Checkout.");
  }

  if (billingPeriod !== "monthly" && billingPeriod !== "yearly") {
    throw new Error("Billing period must be 'monthly' or 'yearly'.");
  }

  const basePrice = billingPeriod === "yearly" ? planConfig.yearly : planConfig.monthly;
  const interval = billingPeriod === "yearly" ? "year" : "month";
  const normalizedCoupon = String(couponCode || "").trim().toUpperCase();
  const coupon = normalizedCoupon ? coupons[normalizedCoupon] : null;

  if (normalizedCoupon && !coupon) {
    throw new Error("Coupon code is not valid for this plan.");
  }

  const discount = coupon ? coupon.discount : 0;
  const discountedPrice = Math.max(0, basePrice - Math.round(basePrice * discount / 100));

  if (discountedPrice <= 0) {
    throw new Error("This checkout total cannot be processed through Stripe.");
  }

  return {
    role: normalizedRole,
    roleLabel: normalizedRole === "student" ? "Student" : "Teacher",
    plan,
    planName: planConfig.name,
    billingPeriod,
    interval,
    discount,
    couponCode: normalizedCoupon,
    amountDollars: discountedPrice,
    amountCents: discountedPrice * 100,
  };
}

function generateDemoSessionId() {
  return `demo_cs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildReceiptId(sessionId) {
  return `STRIPE-${String(sessionId).slice(-12).toUpperCase()}`;
}

function createDemoCheckoutSession({
  req,
  checkout,
  customerEmail,
  customerName,
  successPath,
  cancelPath,
}) {
  const sessionId = generateDemoSessionId();
  const baseUrl = getBaseUrl(req);
  const defaultPath = checkout.role === "student" ? "/pages/billing/student-payment.html" : "/pages/billing/payment.html";
  const successUrl = new URL(sanitizePagePath(successPath, defaultPath), baseUrl);
  const cancelUrl = new URL(sanitizePagePath(cancelPath, defaultPath), baseUrl);

  successUrl.searchParams.set("checkout", "success");
  successUrl.searchParams.set("session_id", sessionId);
  cancelUrl.searchParams.set("checkout", "cancel");

  demoCheckoutSessions.set(sessionId, {
    id: sessionId,
    amountTotal: checkout.amountCents,
    createdAt: Date.now(),
    currency: "usd",
    customerEmail: customerEmail.trim(),
    customerName: String(customerName || "").trim(),
    mode: "demo",
    paymentStatus: "unpaid",
    planName: checkout.planName,
    status: "open",
    successUrl: successUrl.toString(),
    cancelUrl: cancelUrl.toString(),
    metadata: {
      billing: checkout.billingPeriod,
      couponCode: checkout.couponCode,
      customerEmail: customerEmail.trim(),
      customerName: String(customerName || "").trim(),
      discount: String(checkout.discount),
      plan: checkout.plan,
      role: checkout.role,
    },
  });

  return {
    id: sessionId,
    url: `${baseUrl}/demo-checkout.html?session_id=${encodeURIComponent(sessionId)}`,
    mode: "demo",
  };
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "slideplay-ai",
    hasApiKey: Boolean(process.env.HF_API_KEY),
    hasStripeKey: Boolean(process.env.STRIPE_SECRET_KEY),
    defaultModel: DEFAULT_MODEL,
    frontendRoot,
  });
});

app.post("/api/stripe/create-checkout-session", async (req, res) => {
  try {
    const {
      plan,
      billingPeriod,
      role,
      couponCode,
      customerEmail,
      customerName,
      successPath,
      cancelPath,
    } = req.body || {};

    if (!customerEmail || typeof customerEmail !== "string") {
      return res.status(400).json({ error: "Request body must include a customerEmail string." });
    }

    const checkout = resolveCheckoutPlan({ role, plan, billingPeriod, couponCode });

    if (!stripe) {
      return res.json(createDemoCheckoutSession({
        req,
        checkout,
        customerEmail,
        customerName,
        successPath,
        cancelPath,
      }));
    }

    const baseUrl = getBaseUrl(req);
    const defaultPath = checkout.role === "student" ? "/pages/billing/student-payment.html" : "/pages/billing/payment.html";
    const successUrl = new URL(sanitizePagePath(successPath, defaultPath), baseUrl);
    const cancelUrl = new URL(sanitizePagePath(cancelPath, defaultPath), baseUrl);

    successUrl.searchParams.set("checkout", "success");
    successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
    cancelUrl.searchParams.set("checkout", "cancel");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: customerEmail.trim(),
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
      billing_address_collection: "auto",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: checkout.amountCents,
            recurring: { interval: checkout.interval },
            product_data: {
              name: checkout.planName,
              description: `${checkout.roleLabel} ${checkout.billingPeriod} SlidePlay plan`,
            },
          },
        },
      ],
      metadata: {
        billing: checkout.billingPeriod,
        couponCode: checkout.couponCode,
        customerEmail: customerEmail.trim(),
        customerName: String(customerName || "").trim(),
        discount: String(checkout.discount),
        plan: checkout.plan,
        role: checkout.role,
      },
    });

    return res.json({
      id: session.id,
      url: session.url,
      mode: "stripe",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || "Failed to create Stripe Checkout Session." });
  }
});

app.get("/api/demo-checkout/:sessionId", (req, res) => {
  const session = demoCheckoutSessions.get(req.params.sessionId);

  if (!session) {
    return res.status(404).json({ error: "Demo checkout session not found." });
  }

  return res.json({
    id: session.id,
    amountTotal: session.amountTotal,
    currency: session.currency,
    customerEmail: session.customerEmail,
    customerName: session.customerName,
    mode: session.mode,
    planName: session.planName,
    status: session.status,
    paymentStatus: session.paymentStatus,
    metadata: session.metadata,
  });
});

app.post("/api/demo-checkout/:sessionId/complete", (req, res) => {
  const session = demoCheckoutSessions.get(req.params.sessionId);

  if (!session) {
    return res.status(404).json({ error: "Demo checkout session not found." });
  }

  session.status = "complete";
  session.paymentStatus = "paid";
  demoCheckoutSessions.set(session.id, session);

  return res.json({
    id: session.id,
    redirectUrl: session.successUrl,
  });
});

app.post("/api/demo-checkout/:sessionId/cancel", (req, res) => {
  const session = demoCheckoutSessions.get(req.params.sessionId);

  if (!session) {
    return res.status(404).json({ error: "Demo checkout session not found." });
  }

  session.status = "expired";
  session.paymentStatus = "unpaid";
  demoCheckoutSessions.set(session.id, session);

  return res.json({
    id: session.id,
    redirectUrl: session.cancelUrl,
  });
});

app.get("/api/stripe/checkout-session/:sessionId", async (req, res) => {
  try {
    const demoSession = demoCheckoutSessions.get(req.params.sessionId);

    if (demoSession) {
      return res.json({
        id: demoSession.id,
        status: demoSession.status,
        paymentStatus: demoSession.paymentStatus,
        amountTotal: demoSession.amountTotal,
        currency: demoSession.currency,
        customerEmail: demoSession.customerEmail,
        receiptId: buildReceiptId(demoSession.id),
        metadata: {
          billing: demoSession.metadata.billing || "monthly",
          couponCode: demoSession.metadata.couponCode || "",
          discount: Number(demoSession.metadata.discount || 0),
          plan: demoSession.metadata.plan || "",
          role: demoSession.metadata.role || "teacher",
        },
      });
    }

    if (!stripe) {
      return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY in environment variables." });
    }

    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);

    return res.json({
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
      customerEmail: session.customer_details?.email || session.customer_email || session.metadata?.customerEmail || "",
      receiptId: buildReceiptId(session.id),
      metadata: {
        billing: session.metadata?.billing || "monthly",
        couponCode: session.metadata?.couponCode || "",
        discount: Number(session.metadata?.discount || 0),
        plan: session.metadata?.plan || "",
        role: session.metadata?.role || "teacher",
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || "Failed to fetch Stripe Checkout Session." });
  }
});

app.post("/generate-quiz", async (req, res) => {
  try {
    const { topic, model } = req.body || {};

    if (!topic || typeof topic !== "string") {
      return res.status(400).json({ error: "Request body must include a string 'topic'." });
    }

    if (!process.env.HF_API_KEY) {
      return res.status(500).json({ error: "Missing HF_API_KEY in environment variables." });
    }

    if (model !== undefined && typeof model !== "string") {
      return res.status(400).json({ error: "If provided, 'model' must be a string." });
    }

    const selectedModel = model?.trim() ? model.trim() : DEFAULT_MODEL;

    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: "You are a quiz generator for SlidePlay." },
          { role: "user", content: `Create 3 multiple-choice questions on ${topic}.` }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: "Hugging Face request failed.", details: data });
    }

    return res.json({ quiz: data, model: selectedModel });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate quiz." });
  }
});

httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Frontend available at http://localhost:${port}/payment.html`);
});
