import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import path from "path";
import Stripe from "stripe";
import nodemailer from "nodemailer";
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
const subscriptionsFile = path.join(dataRoot, "subscriptions.json");
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
const isProduction = (process.env.NODE_ENV || "development").toLowerCase() === "production";
const demoCheckoutRequested = String(
  process.env.ALLOW_DEMO_CHECKOUT ??
    (isProduction ? "false" : "true")
).trim().toLowerCase() === "true";
const demoCheckoutEnabled = isProduction ? false : demoCheckoutRequested;

if (isProduction && demoCheckoutRequested) {
  console.warn("[security] ALLOW_DEMO_CHECKOUT was true in production and has been forced off.");
}

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

const DEFAULT_ADMIN_CONTACT_EMAILS = [
  "bossmk2209@gmail.com",
  "mutevherichard@gmail.com",
];

function parseBooleanEnv(value, fallback = false) {
  if (value == null) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function isValidEmailAddress(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function getAdminContactEmails() {
  const raw = process.env.ADMIN_CONTACT_EMAILS;
  const candidates = raw
    ? raw.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_ADMIN_CONTACT_EMAILS;

  const unique = [...new Set(candidates)];
  return unique.filter((email) => isValidEmailAddress(email));
}

function getEmailTransportConfig() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const portNumber = Number(process.env.SMTP_PORT || 587);
  const secure = parseBooleanEnv(process.env.SMTP_SECURE, portNumber === 465);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();

  if (!host || !Number.isFinite(portNumber) || !user || !pass) {
    return null;
  }

  return {
    host,
    port: portNumber,
    secure,
    auth: {
      user,
      pass,
    },
  };
}

function getSmtpTransporter() {
  const config = getEmailTransportConfig();
  if (!config) {
    return null;
  }

  return nodemailer.createTransport(config);
}

function getEmailSenderAddress() {
  const fallback = String(process.env.SMTP_USER || "").trim();
  const candidate = String(process.env.SMTP_FROM || fallback).trim();
  return isValidEmailAddress(candidate) ? candidate : "";
}

function renderSlidePlayEmailTemplate({
  heading = "SlidePlay Update",
  intro = "You have a new message from SlidePlay.",
  bodyText = "",
  ctaLabel = "Open SlidePlay",
  ctaUrl = "",
  footerNote = "You're receiving this message because your account is linked to SlidePlay.",
}) {
  const safeHeading = String(heading || "SlidePlay Update").trim();
  const safeIntro = String(intro || "").trim();
  const safeBody = String(bodyText || "").trim();
  const safeCtaLabel = String(ctaLabel || "Open SlidePlay").trim();
  const safeCtaUrl = String(ctaUrl || "").trim();
  const safeFooter = String(footerNote || "").trim();
  const year = new Date().getFullYear();

  const html = `
    <div style="margin:0;padding:24px;background:#070b14;font-family:Segoe UI,Arial,sans-serif;color:#e6edf6;">
      <div style="max-width:620px;margin:0 auto;background:linear-gradient(180deg,#0f172a 0%,#0a1324 100%);border:1px solid rgba(148,163,184,0.25);border-radius:16px;overflow:hidden;">
        <div style="padding:22px 24px;background:linear-gradient(90deg,#06b6d4,#8b5cf6);color:#fff;font-weight:800;font-size:20px;letter-spacing:.04em;text-transform:uppercase;">SlidePlay</div>
        <div style="padding:24px;line-height:1.6;">
          <h2 style="margin:0 0 10px;font-size:24px;color:#f8fbff;">${safeHeading}</h2>
          ${safeIntro ? `<p style="margin:0 0 14px;color:#cbd5e1;">${safeIntro}</p>` : ""}
          ${safeBody ? `<p style="margin:0 0 18px;color:#e2e8f0;white-space:pre-wrap;">${safeBody}</p>` : ""}
          ${safeCtaUrl ? `<a href="${safeCtaUrl}" style="display:inline-block;padding:11px 16px;border-radius:10px;background:linear-gradient(90deg,#22d3ee,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;">${safeCtaLabel}</a>` : ""}
        </div>
        <div style="padding:14px 24px;border-top:1px solid rgba(148,163,184,0.22);font-size:12px;color:#94a3b8;">${safeFooter} · © ${year} SlidePlay</div>
      </div>
    </div>
  `.trim();

  const text = [
    "SlidePlay",
    "",
    safeHeading,
    safeIntro,
    safeBody,
    safeCtaUrl ? `${safeCtaLabel}: ${safeCtaUrl}` : "",
    "",
    `${safeFooter} (© ${year} SlidePlay)`
  ].filter(Boolean).join("\n");

  return { html, text };
}

function getAppBaseUrl(req) {
  const configured = String(process.env.APP_URL || process.env.PUBLIC_BASE_URL || "").trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  return `${req.protocol}://${req.get("host")}`;
}

function getPayFastBaseUrl() {
  const isSandbox = String(process.env.PAYFAST_SANDBOX || "true").trim().toLowerCase() !== "false";
  return isSandbox
    ? "https://sandbox.payfast.co.za/eng/process"
    : "https://www.payfast.co.za/eng/process";
}

function generatePayFastSignature(data, passphrase) {
  const sanitized = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value == null) continue;
    const asString = String(value).trim();
    if (!asString) continue;
    sanitized[key] = asString;
  }

  const query = Object.keys(sanitized)
    .sort()
    .map((key) => `${key}=${encodeURIComponent(sanitized[key]).replace(/%20/g, "+")}`)
    .join("&");
  const payload = passphrase ? `${query}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, "+")}` : query;
  return crypto.createHash("md5").update(payload).digest("hex");
}

async function resolveUidFromEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return "";
  const users = await readUsers();
  const user = users.find((item) => String(item.email || "").trim().toLowerCase() === normalizedEmail);
  return user?.id || "";
}

async function requestHasAdminAccess(req) {
  const authUser = await resolveAuthUserFromRequest(req);
  if (authUser?.role === "admin") {
    return true;
  }

  const configuredApiKey = String(process.env.ADMIN_EMAIL_API_KEY || "").trim();
  const providedApiKey = String(req.headers["x-admin-api-key"] || "").trim();
  if (configuredApiKey && providedApiKey && configuredApiKey === providedApiKey) {
    return true;
  }

  return false;
}

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

app.use(express.json({
  verify: (req, _res, buf) => {
    if (req.path === "/api/crypto/webhook") {
      req.rawBody = Buffer.from(buf);
    }
  },
}));

app.use((err, _req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON body." });
  }
  return next(err);
});

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

  try {
    await fs.access(subscriptionsFile);
  } catch (_error) {
    await fs.writeFile(subscriptionsFile, "{}", "utf8");
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

async function readSubscriptions() {
  await ensureAuthStorage();
  const raw = await fs.readFile(subscriptionsFile, "utf8");
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

async function writeSubscriptions(subscriptionsByUid) {
  await ensureAuthStorage();
  await fs.writeFile(subscriptionsFile, JSON.stringify(subscriptionsByUid, null, 2), "utf8");
}

function normalizeSubscriptionRecord(uid, record) {
  const plan = String(record?.plan || "free").trim().toLowerCase();
  const status = String(record?.status || "inactive").trim().toLowerCase();
  const billing = String(record?.billing || "monthly").trim().toLowerCase();

  return {
    uid,
    plan,
    status,
    billing,
    provider: String(record?.provider || "stripe").trim().toLowerCase(),
    customerEmail: String(record?.customerEmail || "").trim().toLowerCase(),
    sessionId: String(record?.sessionId || "").trim(),
    activatedAt: Number(record?.activatedAt || Date.now()),
    updatedAt: Date.now(),
  };
}

async function upsertSubscription(uid, record) {
  const normalizedUid = String(uid || "").trim();
  if (!normalizedUid) {
    return null;
  }

  const subscriptionsByUid = await readSubscriptions();
  const normalized = normalizeSubscriptionRecord(normalizedUid, record);
  subscriptionsByUid[normalizedUid] = normalized;
  await writeSubscriptions(subscriptionsByUid);
  return normalized;
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

app.post("/api/admin/email/send", async (req, res) => {
  try {
    const hasAdminAccess = await requestHasAdminAccess(req);
    if (!hasAdminAccess) {
      return res.status(403).json({
        error: "Admin access required. Provide a valid admin bearer token or x-admin-api-key.",
      });
    }

    const transporter = getSmtpTransporter();
    const from = getEmailSenderAddress();
    if (!transporter || !from) {
      return res.status(500).json({
        error: "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and optional SMTP_FROM.",
      });
    }

    const body = req.body || {};
    const requestedRecipients = Array.isArray(body.to)
      ? body.to
      : typeof body.to === "string"
        ? body.to.split(",")
        : [];
    const fallbackRecipients = getAdminContactEmails();
    const recipients = [...new Set((requestedRecipients.length ? requestedRecipients : fallbackRecipients)
      .map((item) => String(item || "").trim().toLowerCase())
      .filter((email) => isValidEmailAddress(email)))];

    if (!recipients.length) {
      return res.status(400).json({ error: "No valid recipient emails were provided." });
    }

    const subject = String(body.subject || "SlidePlay admin message").trim().slice(0, 200);
    const text = String(body.text || "").trim();
    const html = String(body.html || "").trim();
    if (!text && !html) {
      return res.status(400).json({ error: "Provide at least one of text or html." });
    }

    const appUrl = getAppBaseUrl(req);
    const rendered = renderSlidePlayEmailTemplate({
      heading: subject,
      intro: "Message from the SlidePlay admin dashboard.",
      bodyText: text || "An update has been shared with you.",
      ctaLabel: "Open SlidePlay",
      ctaUrl: appUrl,
      footerNote: "This message was sent by a SlidePlay administrator.",
    });

    const info = await transporter.sendMail({
      from,
      to: recipients.join(", "),
      subject,
      text: rendered.text,
      html: html || rendered.html,
    });

    return res.status(201).json({
      ok: true,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      messageId: info.messageId || "",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to send email." });
  }
});

app.post("/api/payfast/init", (req, res) => {
  const merchantId = String(process.env.PAYFAST_MERCHANT_ID || "").trim();
  const merchantKey = String(process.env.PAYFAST_MERCHANT_KEY || "").trim();
  const passphrase = String(process.env.PAYFAST_PASSPHRASE || "").trim();
  if (!merchantId || !merchantKey) {
    return res.status(503).json({ error: "PayFast is not configured on this server." });
  }

  const amount = Number(req.body?.amount || 0);
  const plan = String(req.body?.plan || "").trim().toLowerCase();
  const userEmail = String(req.body?.user_email || req.body?.userEmail || "").trim().toLowerCase();
  const userUid = String(req.body?.user_uid || req.body?.userUid || "").trim();
  const billing = String(req.body?.billing || "monthly").trim().toLowerCase() === "yearly" ? "yearly" : "monthly";
  if (!Number.isFinite(amount) || amount <= 0 || !plan) {
    return res.status(400).json({ error: "Invalid amount or plan." });
  }

  const appBase = getAppBaseUrl(req);
  const paymentPage = `${appBase}/payment.html`;
  const payfastData = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: String(req.body?.return_url || `${paymentPage}?payfast=success`).trim(),
    cancel_url: String(req.body?.cancel_url || `${paymentPage}?payfast=cancel`).trim(),
    notify_url: String(req.body?.notify_url || `${appBase}/api/payfast/ipn`).trim(),
    amount: amount.toFixed(2),
    item_name: String(req.body?.item_name || `SlidePlay ${plan}`).trim(),
    email_address: userEmail,
    custom_str1: plan,
    custom_str2: userUid,
    custom_str3: billing,
  };
  payfastData.signature = generatePayFastSignature(payfastData, passphrase);

  const pfUrl = String(process.env.PAYFAST_URL || getPayFastBaseUrl()).trim();
  const query = new URLSearchParams(payfastData).toString();
  return res.json({ url: `${pfUrl}?${query}` });
});

app.post("/api/payfast/ipn", express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const payload = req.body || {};
    const providedSignature = String(payload.signature || "").trim();
    const passphrase = String(process.env.PAYFAST_PASSPHRASE || "").trim();
    const payloadWithoutSignature = { ...payload };
    delete payloadWithoutSignature.signature;
    const expectedSignature = generatePayFastSignature(payloadWithoutSignature, passphrase);
    if (!providedSignature || expectedSignature !== providedSignature) {
      return res.status(400).send("Invalid signature.");
    }

    if (String(payload.payment_status || "").toUpperCase() !== "COMPLETE") {
      return res.status(200).send("OK");
    }

    const uidFromPayload = String(payload.custom_str2 || "").trim();
    const emailFromPayload = String(payload.email_address || "").trim().toLowerCase();
    const uid = uidFromPayload || await resolveUidFromEmail(emailFromPayload);
    if (uid) {
      await upsertSubscription(uid, {
        plan: String(payload.custom_str1 || "free").trim().toLowerCase(),
        status: "active",
        billing: String(payload.custom_str3 || "monthly").trim().toLowerCase() === "yearly" ? "yearly" : "monthly",
        provider: "payfast",
        customerEmail: emailFromPayload,
        sessionId: String(payload.pf_payment_id || payload.m_payment_id || "").trim(),
        activatedAt: Date.now(),
      });
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error(error);
    return res.status(500).send("IPN error");
  }
});

app.post("/api/crypto/create-charge", async (req, res) => {
  try {
    const apiKey = String(process.env.COINBASE_COMMERCE_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(503).json({ error: "Crypto payments are not configured on this server." });
    }

    const plan = String(req.body?.plan || "").trim().toLowerCase();
    const amount = Number(req.body?.amount || 0);
    const customerEmail = String(req.body?.customer_email || req.body?.customerEmail || "").trim().toLowerCase();
    const customerUid = String(req.body?.user_uid || req.body?.userUid || "").trim();
    const billing = String(req.body?.billing || "monthly").trim().toLowerCase() === "yearly" ? "yearly" : "monthly";
    if (!plan || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid plan or amount." });
    }

    const appBase = getAppBaseUrl(req);
    const redirectUrl = String(req.body?.redirect_url || `${appBase}/payment.html?payment=success&provider=crypto`).trim();
    const cancelUrl = String(req.body?.cancel_url || `${appBase}/payment.html?payment=cancel&provider=crypto`).trim();

    const response = await fetch("https://api.commerce.coinbase.com/charges", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CC-Api-Key": apiKey,
        "X-CC-Version": "2018-03-22",
      },
      body: JSON.stringify({
        name: String(req.body?.name || `SlidePlay ${plan}`).trim(),
        description: String(req.body?.description || `SlidePlay ${plan} subscription`).trim(),
        local_price: { amount: amount.toFixed(2), currency: "USD" },
        pricing_type: "fixed_price",
        metadata: {
          plan,
          billing,
          user_uid: customerUid,
          user_email: customerEmail,
        },
        redirect_url: redirectUrl,
        cancel_url: cancelUrl,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const apiMsg = data?.error?.message || data?.error || "Failed to create crypto charge.";
      return res.status(502).json({ error: apiMsg });
    }

    const charge = data?.data;
    if (!charge?.hosted_url) {
      return res.status(502).json({ error: "No hosted URL returned from Coinbase Commerce." });
    }

    return res.json({
      hosted_url: charge.hosted_url,
      url: charge.hosted_url,
      chargeId: charge.id,
    });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: "Failed to create crypto charge. Please try again." });
  }
});

app.post("/api/crypto/webhook", async (req, res) => {
  try {
    const webhookSecret = String(process.env.COINBASE_COMMERCE_WEBHOOK_SECRET || "").trim();
    const signature = String(req.headers["x-cc-webhook-signature"] || "").trim();
    if (!webhookSecret) {
      return res.status(503).send("Webhook secret not configured.");
    }

    if (!signature || !req.rawBody) {
      return res.status(400).send("Missing signature or body.");
    }

    const expected = crypto.createHmac("sha256", webhookSecret).update(req.rawBody).digest("hex");
    if (expected !== signature) {
      return res.status(400).send("Invalid signature.");
    }

    const event = JSON.parse(req.rawBody.toString("utf8"));
    const eventType = String(event?.event?.type || "").trim().toLowerCase();
    if (!["charge:confirmed", "charge:resolved"].includes(eventType)) {
      return res.status(200).send("OK");
    }

    const metadata = event?.event?.data?.metadata || {};
    const uid = String(metadata.user_uid || "").trim() || await resolveUidFromEmail(metadata.user_email);
    if (uid) {
      await upsertSubscription(uid, {
        plan: String(metadata.plan || "free").trim().toLowerCase(),
        status: "active",
        billing: String(metadata.billing || "monthly").trim().toLowerCase() === "yearly" ? "yearly" : "monthly",
        provider: "coinbase",
        customerEmail: String(metadata.user_email || "").trim().toLowerCase(),
        sessionId: String(event?.event?.data?.id || "").trim(),
        activatedAt: Date.now(),
      });
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error(error);
    return res.status(500).send("Webhook error");
  }
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
      customerUid,
      successPath,
      cancelPath,
    } = req.body || {};

    if (!customerEmail || typeof customerEmail !== "string") {
      return res.status(400).json({ error: "Request body must include a customerEmail string." });
    }

    const checkout = resolveCheckoutPlan({ role, plan, billingPeriod, couponCode });

    if (!stripe) {
      if (!demoCheckoutEnabled) {
        return res.status(503).json({
          error: "Stripe is not configured and demo checkout is disabled.",
        });
      }

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
        customerUid: String(customerUid || "").trim(),
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
  if (!demoCheckoutEnabled) {
    return res.status(404).json({ error: "Demo checkout is disabled." });
  }

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
  if (!demoCheckoutEnabled) {
    return res.status(404).json({ error: "Demo checkout is disabled." });
  }

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
  if (!demoCheckoutEnabled) {
    return res.status(404).json({ error: "Demo checkout is disabled." });
  }

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

    if (demoSession && demoCheckoutEnabled) {
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

    const normalizedUid = String(session.metadata?.customerUid || "").trim();
    if (session.payment_status === "paid" && normalizedUid) {
      await upsertSubscription(normalizedUid, {
        plan: session.metadata?.plan || "free",
        status: "active",
        billing: session.metadata?.billing || "monthly",
        provider: "stripe",
        customerEmail: session.customer_details?.email || session.customer_email || session.metadata?.customerEmail || "",
        sessionId: session.id,
        activatedAt: Date.now(),
      });
    }

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
        customerUid: session.metadata?.customerUid || "",
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

app.get("/api/users/:uid/subscription", async (req, res) => {
  try {
    const uid = String(req.params.uid || "").trim();
    if (!uid) {
      return res.status(400).json({ error: "uid is required." });
    }

    const subscriptionsByUid = await readSubscriptions();
    const subscription = subscriptionsByUid[uid] || null;
    if (!subscription) {
      return res.json({
        uid,
        plan: "free",
        status: "locked",
        billing: "monthly",
        provider: "none",
        active: false,
      });
    }

    return res.json({
      ...subscription,
      active: subscription.status === "active" && subscription.plan !== "free",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to read subscription." });
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
