const express = require("express");
const path = require("path");
const crypto = require("crypto");
const querystring = require("querystring");
const axios = require("axios");
const fs = require("fs");

require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

const { GoogleGenerativeAI } = require("@google/generative-ai");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let gemini = null;
if (GEMINI_API_KEY) {
  gemini = new GoogleGenerativeAI(GEMINI_API_KEY);
}

const sgMail = require("@sendgrid/mail");
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const PAYMENTS_FILE = path.join(__dirname, "payfast_payments.json");
const USERS_FILE = path.join(__dirname, "users-local.json");
const SUPPORT_FILE = path.join(__dirname, "support-messages.json");
const SESSION_HISTORY_FILE = path.join(__dirname, "session-history.json");
const DEFAULT_DB_URL = "https://slideplay-38d3f-default-rtdb.firebaseio.com";
const EMAIL_BRAND_NAME = process.env.EMAIL_BRAND_NAME || "SlidePlay";
const EMAIL_APP_URL = process.env.APP_URL || "https://appvengers-slideplayer-1.onrender.com";
const SESSION_HISTORY_MAX_ROWS = Math.max(50, Number(process.env.SESSION_HISTORY_MAX_ROWS || 1000));
const SESSION_HISTORY_RETENTION_DAYS = Math.max(7, Number(process.env.SESSION_HISTORY_RETENTION_DAYS || 120));
const SESSION_HISTORY_RETENTION_MS = SESSION_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const ADMIN_EMAIL_ALLOWLIST = new Set([
  "bossmk2209@gmail.com",
  "mutevherichard@gmail.com",
  "kingsleydasilva0@gmail.com",
].map((e) => String(e).trim().toLowerCase()));

const SECURITY_WINDOW_MS = Number(process.env.SECURITY_WINDOW_MS || 15 * 60 * 1000);
const SECURITY_THRESHOLD_TOTAL = Number(process.env.SECURITY_THRESHOLD_TOTAL || 25);
const SECURITY_THRESHOLD_PER_IP = Number(process.env.SECURITY_THRESHOLD_PER_IP || 8);
const SECURITY_THRESHOLD_PER_PATH = Number(process.env.SECURITY_THRESHOLD_PER_PATH || 8);
const securityEvents = [];
const securityAlerts = [];
let nextSecurityAlertId = 1;

let firebaseAdmin = null;
let firebaseAdminInitAttempted = false;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-admin-api-key");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
const slideUploadDir = path.resolve(__dirname, "../../slide_upload");
if (fs.existsSync(slideUploadDir)) {
  app.use("/slide_upload", express.static(slideUploadDir));
}
const sharedGamesDir = path.resolve(__dirname, "../../games");
if (fs.existsSync(sharedGamesDir)) {
  app.use("/games", express.static(sharedGamesDir));
}

function safeReadJson(filePath, fallbackValue) {
  try {
    if (!fs.existsSync(filePath)) return fallbackValue;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return fallbackValue;
  }
}

function safeWriteJson(filePath, value) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
    return true;
  } catch (error) {
    console.error("Failed writing JSON file:", filePath, error.message);
    return false;
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeIsoDate(value) {
  if (!value && value !== 0) return null;
  const dt = typeof value === "number" ? new Date(value) : new Date(String(value));
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeTextToHtml(value) {
  const safe = escapeHtml(value || "");
  return safe.replace(/\n/g, "<br>");
}

function getSendgridFrom() {
  const email = String(process.env.SENDGRID_FROM_EMAIL || "slideplayer90@gmail.com").trim();
  const name = String(process.env.SENDGRID_FROM_NAME || EMAIL_BRAND_NAME).trim();
  if (name) {
    return { email, name };
  }
  return email;
}

function renderEmailTemplate({ title, intro, bodyHtml, ctaLabel, ctaUrl }) {
  const safeTitle = escapeHtml(title || EMAIL_BRAND_NAME);
  const safeIntro = normalizeTextToHtml(intro || "");
  const safeBody = bodyHtml || "";
  const safeCtaLabel = escapeHtml(ctaLabel || "Open App");
  const safeCtaUrl = escapeHtml(ctaUrl || EMAIL_APP_URL);
  const safeBrand = escapeHtml(EMAIL_BRAND_NAME);
  return `
  <div style="margin:0;padding:24px;background:#f3f6fb;font-family:Segoe UI,Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e6ebf2;border-radius:14px;overflow:hidden;">
      <div style="background:linear-gradient(120deg,#06b6d4,#0ea5e9);padding:22px 24px;color:#ffffff;">
        <div style="font-size:12px;letter-spacing:.08em;opacity:.92;text-transform:uppercase;">${safeBrand}</div>
        <h1 style="margin:8px 0 0;font-size:24px;line-height:1.2;">${safeTitle}</h1>
      </div>
      <div style="padding:24px;color:#0f172a;line-height:1.6;font-size:15px;">
        <p style="margin:0 0 14px;">${safeIntro}</p>
        <div style="margin:0 0 20px;">${safeBody}</div>
        <a href="${safeCtaUrl}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;">${safeCtaLabel}</a>
      </div>
      <div style="padding:14px 24px;border-top:1px solid #e6ebf2;color:#64748b;font-size:12px;">
        You are receiving this email from ${safeBrand}.
      </div>
    </div>
  </div>`;
}

function getSendgridErrorDetail(error) {
  const fallback = String(error?.message || "send_failed");
  const sgErrors = error?.response?.body?.errors;
  if (!Array.isArray(sgErrors) || !sgErrors.length) {
    return fallback;
  }

  const lines = sgErrors
    .map((item) => {
      const message = String(item?.message || "").trim();
      const field = String(item?.field || "").trim();
      const help = String(item?.help || "").trim();
      const extras = [field ? `field=${field}` : "", help ? `help=${help}` : ""]
        .filter(Boolean)
        .join(" | ");
      return extras ? `${message} (${extras})` : message;
    })
    .filter(Boolean);

  return lines.length ? lines.join("; ") : fallback;
}

function normalizeServiceAccount(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Service account JSON is missing or invalid");
  }

  const serviceAccount = { ...raw };
  serviceAccount.project_id = String(serviceAccount.project_id || "").trim();
  serviceAccount.client_email = String(serviceAccount.client_email || "").trim();
  serviceAccount.private_key = String(serviceAccount.private_key || "");

  // Handle one-line env values that keep escaped newlines.
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n").trim();
  if (serviceAccount.private_key && !serviceAccount.private_key.endsWith("\n")) {
    serviceAccount.private_key += "\n";
  }

  const placeholderHit =
    serviceAccount.private_key.includes("YOUR_PRIVATE_KEY") ||
    String(serviceAccount.private_key_id || "").includes("YOUR_PRIVATE_KEY_ID") ||
    serviceAccount.client_email.includes("firebase-adminsdk-xxxx") ||
    String(serviceAccount.client_id || "").includes("YOUR_CLIENT_ID");

  if (placeholderHit) {
    throw new Error(
      "Service account is still using placeholder values. Download a real key from Firebase Console > Project Settings > Service accounts."
    );
  }

  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("Service account is missing project_id, client_email, or private_key");
  }

  if (!serviceAccount.private_key.includes("BEGIN PRIVATE KEY") || !serviceAccount.private_key.includes("END PRIVATE KEY")) {
    throw new Error("Service account private_key is not a valid PEM block");
  }

  return serviceAccount;
}

function getFirebaseAdmin() {
  if (firebaseAdminInitAttempted) return firebaseAdmin;
  firebaseAdminInitAttempted = true;

  try {
    const admin = require("firebase-admin");

    if (!admin.apps.length) {
      let serviceAccount = null;
      const serviceAccountPath = path.join(__dirname, "firebase-service-account.json");

      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        serviceAccount = normalizeServiceAccount(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
      } else if (fs.existsSync(serviceAccountPath)) {
        serviceAccount = normalizeServiceAccount(require(serviceAccountPath));
      }

      if (!serviceAccount) {
        console.warn("Firebase Admin not initialized: missing service account credentials.");
        firebaseAdmin = null;
        return firebaseAdmin;
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DB_URL || DEFAULT_DB_URL,
      });
    }

    firebaseAdmin = admin;
    return firebaseAdmin;
  } catch (error) {
    console.warn("Firebase Admin not initialized:", error.message);
    firebaseAdmin = null;
    return firebaseAdmin;
  }
}

function getBearerToken(req) {
  const authHeader = String(req.headers.authorization || "");
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function decodeJwtPayload(token) {
  try {
    const payload = String(token || "").split(".")[1] || "";
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    const normalized = base64 + (pad ? "=".repeat(4 - pad) : "");
    const json = Buffer.from(normalized, "base64").toString("utf8");
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

function getClientIp(req) {
  const fromForwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fromForwarded || req.ip || req.socket?.remoteAddress || "unknown";
}

function pruneSecurityEvents(nowMs) {
  while (securityEvents.length && nowMs - securityEvents[0].tsMs > SECURITY_WINDOW_MS) {
    securityEvents.shift();
  }
}

function addSecurityEvent(req, statusCode) {
  if (![401, 403, 429].includes(Number(statusCode))) return;

  const evt = {
    tsMs: Date.now(),
    status: Number(statusCode),
    ip: getClientIp(req),
    path: String(req.path || req.originalUrl || ""),
    method: String(req.method || "GET").toUpperCase(),
  };

  securityEvents.push(evt);
  pruneSecurityEvents(evt.tsMs);

  if (securityEvents.length > 2000) {
    securityEvents.splice(0, securityEvents.length - 2000);
  }
}

function collectTopCountRows(items, getKey) {
  const map = new Map();
  for (const item of items) {
    const key = String(getKey(item) || "");
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

function upsertSecurityAlert(key, count, message) {
  const nowMs = Date.now();
  const existing = securityAlerts.find(
    (a) => a.key === key && !a.acknowledgedAt && nowMs - Number(a.tsMs || 0) < SECURITY_WINDOW_MS
  );
  if (existing) {
    existing.count = count;
    existing.message = message;
    existing.tsMs = nowMs;
    return;
  }

  securityAlerts.unshift({
    alertId: nextSecurityAlertId++,
    key,
    count,
    message,
    tsMs: nowMs,
    acknowledgedAt: null,
  });

  if (securityAlerts.length > 300) {
    securityAlerts.splice(300);
  }
}

function getSecuritySnapshot() {
  const nowMs = Date.now();
  pruneSecurityEvents(nowMs);

  const inWindow = securityEvents.filter((e) => nowMs - e.tsMs <= SECURITY_WINDOW_MS);

  const statusCounts = {
    "401": inWindow.filter((e) => e.status === 401).length,
    "403": inWindow.filter((e) => e.status === 403).length,
    "429": inWindow.filter((e) => e.status === 429).length,
  };

  const topIps = collectTopCountRows(inWindow, (e) => e.ip)
    .slice(0, 5)
    .map((row) => ({ ip: row.key, count: row.count }));

  const topPaths = collectTopCountRows(inWindow, (e) => e.path)
    .slice(0, 5)
    .map((row) => ({ path: row.key, count: row.count }));

  if (inWindow.length >= SECURITY_THRESHOLD_TOTAL) {
    upsertSecurityAlert(
      "global",
      inWindow.length,
      `High volume of admin auth failures in last ${Math.round(SECURITY_WINDOW_MS / 60000)} minutes (${inWindow.length} events).`
    );
  }

  for (const row of topIps) {
    if (row.count >= SECURITY_THRESHOLD_PER_IP) {
      upsertSecurityAlert(
        `ip:${row.ip}`,
        row.count,
        `Repeated admin auth failures from IP ${row.ip} (${row.count} events).`
      );
    }
  }

  for (const row of topPaths) {
    if (row.count >= SECURITY_THRESHOLD_PER_PATH) {
      upsertSecurityAlert(
        `path:${row.path}`,
        row.count,
        `Route ${row.path} is receiving repeated failed admin requests (${row.count}).`
      );
    }
  }

  const rateLimitCount = statusCounts["429"];
  if (rateLimitCount >= Math.max(3, Math.floor(SECURITY_THRESHOLD_PER_IP / 2))) {
    upsertSecurityAlert(
      "ratelimit:admin",
      rateLimitCount,
      `Rate-limit events detected on admin APIs (${rateLimitCount} recent 429 responses).`
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    windowMs: SECURITY_WINDOW_MS,
    totals: {
      recentEvents: inWindow.length,
      bufferedAlerts: securityAlerts.length,
    },
    statusCounts,
    thresholds: {
      total: SECURITY_THRESHOLD_TOTAL,
      perIp: SECURITY_THRESHOLD_PER_IP,
      perPath: SECURITY_THRESHOLD_PER_PATH,
    },
    topIps,
    topPaths,
    recentAlerts: securityAlerts
      .slice()
      .sort((a, b) => Number(b.tsMs || 0) - Number(a.tsMs || 0))
      .slice(0, 50),
  };
}

app.use((req, res, next) => {
  if (!String(req.path || "").startsWith("/api/admin/")) {
    next();
    return;
  }
  res.on("finish", () => {
    addSecurityEvent(req, res.statusCode);
  });
  next();
});

async function ensureAdmin(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing admin bearer token" });
    return;
  }

  const admin = getFirebaseAdmin();
  if (!admin) {
    const isLocalHost = req.hostname === "localhost" || req.hostname === "127.0.0.1";
    if (isLocalHost) {
      const payload = decodeJwtPayload(token);
      const email = normalizeEmail(payload?.email || "");
      if (ADMIN_EMAIL_ALLOWLIST.has(email)) {
        req.adminUser = {
          uid: String(payload?.user_id || payload?.uid || "local-admin"),
          email,
          role: "admin",
          devFallback: true,
        };
        next();
        return;
      }
    }
    res.status(503).json({ error: "Admin API unavailable: Firebase Admin is not configured" });
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token, true);
    const uid = String(decoded.uid || "");
    const email = normalizeEmail(decoded.email || "");

    let role = "student";
    try {
      const roleSnap = await admin.database().ref(`users/${uid}/role`).get();
      role = String(roleSnap.val() || "student").toLowerCase();
    } catch (_) {
      // Ignore role lookup failures, allowlist can still grant access.
    }

    if (role !== "admin" && !ADMIN_EMAIL_ALLOWLIST.has(email)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    if (ADMIN_EMAIL_ALLOWLIST.has(email) && role !== "admin") {
      try {
        await admin.database().ref(`users/${uid}`).update({
          role: "admin",
          updatedAt: new Date().toISOString(),
        });
        role = "admin";
      } catch (_) {
        // Best effort only.
      }
    }

    req.adminUser = { uid, email, role };
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function mapPaymentStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "complete" || s === "completed" || s === "success" || s === "succeeded") return "succeeded";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "failed") return "failed";
  return s || "pending";
}

function planAmount(plan) {
  const p = String(plan || "").toLowerCase();
  const known = {
    student_elite: 99,
    student_premium: 149,
    teacher_pro: 299,
    teacher_premium: 399,
    premium: 199,
  };
  return known[p] || 0;
}

function normalizePaymentRows(rawPayments) {
  if (Array.isArray(rawPayments)) {
    return rawPayments
      .map((row, idx) => ({
        PaymentID: Number(row.PaymentID || row.paymentId || idx + 1),
        FirebaseUID: String(row.FirebaseUID || row.uid || ""),
        DisplayName: String(row.DisplayName || row.displayName || ""),
        Email: String(row.Email || row.email || ""),
        Plan: String(row.Plan || row.plan || ""),
        AmountZAR: Number(row.AmountZAR || row.amount || 0),
        BillingCycle: String(row.BillingCycle || row.billingCycle || "monthly"),
        Provider: String(row.Provider || row.provider || "payfast"),
        Status: mapPaymentStatus(row.Status || row.status),
        CreatedAt: normalizeIsoDate(row.CreatedAt || row.date || row.createdAt),
      }))
      .filter((row) => row.Email || row.FirebaseUID || row.Plan);
  }

  const out = [];
  const entries = Object.entries(rawPayments || {});
  for (let i = 0; i < entries.length; i += 1) {
    const [email, info] = entries[i];
    const plan = String(info?.plan || "");
    out.push({
      PaymentID: i + 1,
      FirebaseUID: "",
      DisplayName: "",
      Email: String(email || ""),
      Plan: plan,
      AmountZAR: Number(info?.amount || planAmount(plan) || 0),
      BillingCycle: String(info?.billingCycle || "monthly"),
      Provider: String(info?.provider || "payfast"),
      Status: mapPaymentStatus(info?.status),
      CreatedAt: normalizeIsoDate(info?.date || info?.createdAt),
    });
  }

  return out;
}

async function fetchUsersFromDb() {
  const admin = getFirebaseAdmin();
  if (!admin) {
    return readLocalUsers();
  }

  try {
    const snap = await admin.database().ref("users").get();
    const usersObj = snap.val() || {};
    return Object.entries(usersObj).map(([uid, raw]) => {
      const item = raw || {};
      const email = String(item.email || "");
      const displayName = String(item.displayName || item.username || email.split("@")[0] || "User");
      const role = String(item.role || "student").toLowerCase();
      const createdAt = normalizeIsoDate(item.createdAt || item.created_at || item.joinedAt);
      const lastLoginAt = normalizeIsoDate(item.lastLoginAt || item.lastSeenAt);

      return {
        FirebaseUID: uid,
        DisplayName: displayName,
        Email: email,
        Role: role,
        AuthProvider: String(item.authProvider || "password"),
        CurrentPlan: String(item.plan || (item.premium ? "premium" : "")),
        TotalSpent: Number(item.totalSpent || 0),
        GamesPlayed: Number(item.gamesPlayed || 0),
        LastLoginAt: lastLoginAt,
        CreatedAt: createdAt,
      };
    });
  } catch (error) {
    console.error("Failed loading users from Firebase:", error.message);
    return readLocalUsers();
  }
}

function readLocalUsers() {
  const rows = safeReadJson(USERS_FILE, []);
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      FirebaseUID: String(row.FirebaseUID || row.uid || ""),
      DisplayName: String(row.DisplayName || row.displayName || row.username || "User"),
      Email: normalizeEmail(row.Email || row.email || ""),
      Role: String(row.Role || row.role || "student").toLowerCase(),
      AuthProvider: String(row.AuthProvider || row.authProvider || "password"),
      CurrentPlan: String(row.CurrentPlan || row.plan || ""),
      TotalSpent: Number(row.TotalSpent || row.totalSpent || 0),
      GamesPlayed: Number(row.GamesPlayed || row.gamesPlayed || 0),
      LastLoginAt: normalizeIsoDate(row.LastLoginAt || row.lastLoginAt),
      CreatedAt: normalizeIsoDate(row.CreatedAt || row.createdAt) || new Date().toISOString(),
    }))
    .filter((row) => row.FirebaseUID || row.Email);
}

function upsertLocalUser(payload) {
  const uid = String(payload.uid || payload.FirebaseUID || "").trim();
  const email = normalizeEmail(payload.email || payload.Email || "");
  if (!uid || !email) return false;

  const users = readLocalUsers();
  const idx = users.findIndex((u) => u.FirebaseUID === uid || normalizeEmail(u.Email) === email);
  const existing = idx >= 0 ? users[idx] : null;

  const nextUser = {
    FirebaseUID: uid,
    DisplayName: String(payload.displayName || existing?.DisplayName || email.split("@")[0] || "User"),
    Email: email,
    Role: String(payload.role || existing?.Role || "student").toLowerCase(),
    AuthProvider: String(payload.authProvider || existing?.AuthProvider || "password"),
    CurrentPlan: String(payload.plan || existing?.CurrentPlan || ""),
    TotalSpent: Number(payload.totalSpent || existing?.TotalSpent || 0),
    GamesPlayed: Number(payload.gamesPlayed || existing?.GamesPlayed || 0),
    LastLoginAt: new Date().toISOString(),
    CreatedAt: existing?.CreatedAt || new Date().toISOString(),
  };

  if (idx >= 0) users[idx] = nextUser;
  else users.push(nextUser);
  return safeWriteJson(USERS_FILE, users);
}

function incrementLocalGamesPlayed(payload) {
  const uid = String(payload.uid || payload.FirebaseUID || "").trim();
  const email = normalizeEmail(payload.email || payload.Email || "");
  if (!uid && !email) return false;

  const users = readLocalUsers();
  let idx = users.findIndex((u) => (uid && u.FirebaseUID === uid) || (email && normalizeEmail(u.Email) === email));

  if (idx < 0) {
    const saved = upsertLocalUser(payload);
    if (!saved) return false;
    const refreshed = readLocalUsers();
    idx = refreshed.findIndex((u) => (uid && u.FirebaseUID === uid) || (email && normalizeEmail(u.Email) === email));
    if (idx < 0) return false;
    refreshed[idx].GamesPlayed = Number(refreshed[idx].GamesPlayed || 0) + 1;
    refreshed[idx].LastLoginAt = new Date().toISOString();
    return safeWriteJson(USERS_FILE, refreshed);
  }

  users[idx].GamesPlayed = Number(users[idx].GamesPlayed || 0) + 1;
  users[idx].LastLoginAt = new Date().toISOString();
  return safeWriteJson(USERS_FILE, users);
}

async function fetchSessionsFromDb() {
  const admin = getFirebaseAdmin();
  if (!admin) return [];

  try {
    const snap = await admin.database().ref("sessions").get();
    const sessionsObj = snap.val() || {};
    return Object.entries(sessionsObj).map(([sessionCode, raw]) => {
      const item = raw || {};
      const players = item.players && typeof item.players === "object" ? Object.values(item.players) : [];
      const winner = players
        .slice()
        .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0))[0] || null;

      return {
        SessionCode: String(sessionCode || item.code || ""),
        GameType: String(item.game || "quiz"),
        GameMode: String(item.mode || "solo"),
        HostName: String(item.host || item.hostName || "Teacher"),
        HostUID: String(item.hostUid || ""),
        PlayerCount: Number(players.length || 0),
        WinnerName: winner ? String(winner.name || "") : "",
        WinnerScore: winner ? Number(winner.score || 0) : null,
        TotalScore: winner ? Number(winner.score || 0) : null,
        Status: String(item.status || "waiting").toLowerCase(),
        CreatedAt: normalizeIsoDate(item.createdAt),
        JoinedAt: normalizeIsoDate(item.createdAt),
      };
    });
  } catch (error) {
    console.error("Failed loading sessions from Firebase:", error.message);
    return [];
  }
}

function withUserPaymentStats(users, payments) {
  const byEmail = new Map();
  for (const payment of payments) {
    const key = normalizeEmail(payment.Email);
    if (!key) continue;
    if (!byEmail.has(key)) {
      byEmail.set(key, { totalSpent: 0, latestPlan: "" });
    }
    const bucket = byEmail.get(key);
    if (payment.Status === "succeeded") {
      bucket.totalSpent += Number(payment.AmountZAR || 0);
      if (payment.Plan) bucket.latestPlan = payment.Plan;
    }
  }

  return users.map((u) => {
    const stat = byEmail.get(normalizeEmail(u.Email)) || { totalSpent: 0, latestPlan: "" };
    return {
      ...u,
      TotalSpent: Number(u.TotalSpent || 0) || Number(stat.totalSpent || 0),
      CurrentPlan: u.CurrentPlan || stat.latestPlan || "",
    };
  });
}

function buildUsersPerDay(users, days = 14) {
  const now = new Date();
  const map = new Map();

  for (let i = days - 1; i >= 0; i -= 1) {
    const dt = new Date(now);
    dt.setDate(now.getDate() - i);
    const key = dt.toISOString().slice(0, 10);
    map.set(key, 0);
  }

  for (const user of users) {
    if (!user.CreatedAt) continue;
    const key = String(user.CreatedAt).slice(0, 10);
    if (map.has(key)) {
      map.set(key, Number(map.get(key) || 0) + 1);
    }
  }

  return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
}

function sortByDateDesc(items, key) {
  return items.slice().sort((a, b) => {
    const at = new Date(a[key] || 0).getTime();
    const bt = new Date(b[key] || 0).getTime();
    return bt - at;
  });
}

function sessionSortMs(item) {
  return new Date(item?.FinishedAt || item?.CreatedAt || 0).getTime();
}

function normalizeSessionRow(row) {
  const item = row || {};
  return {
    SessionCode: String(item.SessionCode || item.sessionCode || ""),
    GameType: String(item.GameType || item.gameType || "quiz"),
    GameMode: String(item.GameMode || item.gameMode || "solo"),
    HostName: String(item.HostName || item.hostName || "Teacher"),
    HostUID: String(item.HostUID || item.hostUid || ""),
    PlayerCount: Number(item.PlayerCount || item.playerCount || 0),
    WinnerName: String(item.WinnerName || item.winnerName || ""),
    WinnerScore: item.WinnerScore == null ? null : Number(item.WinnerScore),
    TotalScore: item.TotalScore == null ? null : Number(item.TotalScore),
    Status: String(item.Status || item.status || "finished").toLowerCase(),
    CreatedAt: normalizeIsoDate(item.CreatedAt || item.createdAt) || new Date().toISOString(),
    FinishedAt: normalizeIsoDate(item.FinishedAt || item.finishedAt),
    ArchivedAt: normalizeIsoDate(item.ArchivedAt || item.archivedAt) || new Date().toISOString(),
  };
}

function readSessionHistory() {
  const raw = safeReadJson(SESSION_HISTORY_FILE, []);
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .map((row) => normalizeSessionRow(row))
    .filter((row) => row.SessionCode);
  return pruneSessionHistory(normalized);
}

function pruneSessionHistory(rows) {
  const cutoff = Date.now() - SESSION_HISTORY_RETENTION_MS;
  const deduped = new Map();

  for (const row of rows || []) {
    if (!row?.SessionCode) continue;
    const ts = sessionSortMs(row);
    if (Number.isFinite(ts) && ts < cutoff) continue;
    const existing = deduped.get(row.SessionCode);
    if (!existing || ts >= sessionSortMs(existing)) {
      deduped.set(row.SessionCode, row);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => sessionSortMs(b) - sessionSortMs(a))
    .slice(0, SESSION_HISTORY_MAX_ROWS);
}

function upsertSessionHistory(entry) {
  const history = pruneSessionHistory(readSessionHistory());
  const idx = history.findIndex((r) => r.SessionCode === entry.SessionCode);
  if (idx >= 0) {
    history[idx] = {
      ...history[idx],
      ...entry,
      ArchivedAt: new Date().toISOString(),
    };
  } else {
    history.unshift({
      ...entry,
      ArchivedAt: new Date().toISOString(),
    });
  }
  safeWriteJson(SESSION_HISTORY_FILE, pruneSessionHistory(history));
}

function mergeSessionHistory(currentSessions, archivedSessions) {
  const byCode = new Map();
  const pushBest = (row) => {
    if (!row?.SessionCode) return;
    const existing = byCode.get(row.SessionCode);
    if (!existing || sessionSortMs(row) >= sessionSortMs(existing)) {
      byCode.set(row.SessionCode, row);
    }
  };

  for (const row of currentSessions || []) {
    if (String(row?.Status || "").toLowerCase() !== "active") {
      pushBest(normalizeSessionRow(row));
    }
  }
  for (const row of archivedSessions || []) {
    pushBest(normalizeSessionRow(row));
  }

  const activeCodes = new Set(
    (currentSessions || [])
      .filter((row) => String(row?.Status || "").toLowerCase() === "active")
      .map((row) => String(row?.SessionCode || ""))
      .filter(Boolean)
  );

  return Array.from(byCode.values())
    .filter((row) => !activeCodes.has(row.SessionCode))
    .sort((a, b) => sessionSortMs(b) - sessionSortMs(a));
}

// --- AI Hint Endpoint for Escape Game ---
app.post("/api/ai-hint", async (req, res) => {
  const { game, context } = req.body;
  if (!game || !context) return res.status(400).json({ error: "Missing game or context" });
  let prompt = "You are an expert escape room coach AI. The player is in a 3D escape room game. Based on their current state, provide a helpful, context-aware hint. Be concise, avoid spoilers, and encourage learning.\n";
  prompt += `Game: ${game}\n`;
  prompt += `Level: ${context.level}\n`;
  prompt += `Inventory: ${Array.isArray(context.inv) ? context.inv.join(", ") : ""}\n`;
  prompt += `Solved: ${Array.isArray(context.solved) ? context.solved.join(", ") : ""}\n`;
  prompt += `Time left: ${context.secs}s\n`;
  prompt += "Hint:";
  try {
    let hint = null;
    if (gemini) {
      const model = gemini.getGenerativeModel({ model: "gemini-pro" });
      const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
      hint = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    }
    if (!hint) hint = "Try examining your surroundings for clues you may have missed.";
    res.json({ hint });
  } catch (e) {
    console.error("AI hint error:", e);
    res.json({ hint: "AI is currently unavailable. Try again soon!" });
  }
});

app.get("/api/users/:uid/role", async (req, res) => {
  const uid = String(req.params.uid || "").trim();
  if (!uid) {
    res.status(400).json({ error: "Missing uid" });
    return;
  }

  const admin = getFirebaseAdmin();
  if (!admin) {
    res.json({ role: "student" });
    return;
  }

  try {
    const roleSnap = await admin.database().ref(`users/${uid}/role`).get();
    const role = String(roleSnap.val() || "student").toLowerCase();
    res.json({ role });
  } catch (_) {
    res.json({ role: "student" });
  }
});

app.post("/api/users/sync", async (req, res) => {
  const payload = req.body || {};
  const uid = String(payload.uid || "").trim();
  const email = normalizeEmail(payload.email || "");
  const role = String(payload.role || "student").toLowerCase();

  if (!uid || !email) {
    res.status(400).json({ error: "Missing uid or email" });
    return;
  }

  const admin = getFirebaseAdmin();
  if (!admin) {
    const saved = upsertLocalUser(payload);
    if (!saved) {
      res.status(500).json({ error: "User sync unavailable: could not persist local fallback" });
      return;
    }
    res.json({ ok: true, fallback: "local" });
    return;
  }

  const token = getBearerToken(req);
  if (token) {
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      if (String(decoded.uid || "") !== uid) {
        res.status(403).json({ error: "Token does not match user" });
        return;
      }
    } catch (_) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
  }

  try {
    const userRef = admin.database().ref(`users/${uid}`);
    const existingSnap = await userRef.get();
    const existing = existingSnap.val() || {};

    await userRef.update({
      email,
      displayName: String(payload.displayName || existing.displayName || ""),
      role,
      inviteChannel: String(payload.inviteChannel || existing.inviteChannel || ""),
      phone: String(payload.phone || existing.phone || ""),
      authProvider: String(existing.authProvider || payload.authProvider || "password"),
      createdAt: existing.createdAt || new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("User sync failed:", error);
    res.status(500).json({ error: "Could not sync user" });
  }
});

// Helper to generate PayFast signature
function generatePayFastSignature(data, passphrase) {
  let pfData = { ...data };
  Object.keys(pfData).forEach((k) => {
    if (pfData[k] === undefined || pfData[k] === null) delete pfData[k];
  });
  let pfString = Object.keys(pfData)
    .sort()
    .map((key) => `${key}=${encodeURIComponent(pfData[key])}`)
    .join("&");
  if (passphrase) pfString += `&passphrase=${encodeURIComponent(passphrase)}`;
  return crypto.createHash("md5").update(pfString).digest("hex");
}

app.post("/api/payfast/init", (req, res) => {
  const { amount, item_name, user_email, plan, return_url, cancel_url, notify_url } = req.body;
  const pf_merchant_id = process.env.PAYFAST_MERCHANT_ID;
  const pf_merchant_key = process.env.PAYFAST_MERCHANT_KEY;
  const pf_passphrase = process.env.PAYFAST_PASSPHRASE;
  const pf_url = process.env.PAYFAST_URL || "https://www.payfast.co.za/eng/process";

  if (!pf_merchant_id || !pf_merchant_key) {
    return res.status(500).json({ error: "PayFast merchant credentials not set." });
  }

  const pfData = {
    merchant_id: pf_merchant_id,
    merchant_key: pf_merchant_key,
    return_url: return_url || "http://localhost:3000/payment.html?payfast=success",
    cancel_url: cancel_url || "http://localhost:3000/payment.html?payfast=cancel",
    notify_url: notify_url || "http://localhost:3000/api/payfast/ipn",
    amount: Number(amount).toFixed(2),
    item_name: item_name || plan || "SlidePlay Plan",
    email_address: user_email || "",
    custom_str1: plan || "",
  };

  pfData.signature = generatePayFastSignature(pfData, pf_passphrase);
  const payfastUrl = `${pf_url}?${querystring.stringify(pfData)}`;
  res.json({ url: payfastUrl });
});

function savePaymentStatus(email, plan, status, provider = "payfast", billingCycle = "monthly", amountOverride) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !plan) return;

  const existingRows = normalizePaymentRows(safeReadJson(PAYMENTS_FILE, {}));
  existingRows.unshift({
    PaymentID: Date.now(),
    Email: normalizedEmail,
    Plan: String(plan),
    AmountZAR: Number.isFinite(Number(amountOverride)) ? Number(amountOverride) : planAmount(plan),
    Provider: String(provider || "payfast"),
    BillingCycle: String(billingCycle || "monthly"),
    Status: mapPaymentStatus(status),
    CreatedAt: new Date().toISOString(),
  });
  safeWriteJson(PAYMENTS_FILE, existingRows.slice(0, 5000));
}

app.post("/api/payments/simulate", (req, res) => {
  const email = normalizeEmail(req.body?.email || "");
  const plan = String(req.body?.plan || "").trim();
  const provider = String(req.body?.provider || "card").trim() || "card";
  const billingCycle = String(req.body?.billingCycle || "monthly").trim() || "monthly";
  const amount = Number(req.body?.amount);

  if (!email || !plan) {
    res.status(400).json({ error: "Missing email or plan" });
    return;
  }

  savePaymentStatus(email, plan, "COMPLETE", provider, billingCycle, amount);
  res.json({ ok: true });
});

app.post("/api/payfast/ipn", async (req, res) => {
  const ipnData = req.body;
  console.log("PayFast IPN received:", ipnData);

  try {
    const pfUrl = process.env.PAYFAST_SANDBOX === "false"
      ? "https://www.payfast.co.za/eng/query/validate"
      : "https://sandbox.payfast.co.za/eng/query/validate";

    const rawBody = Object.keys(ipnData)
      .map((k) => `${k}=${encodeURIComponent(ipnData[k])}`)
      .join("&");

    const pfRes = await axios.post(pfUrl, rawBody, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (String(pfRes.data || "").trim() !== "VALID") {
      console.error("PayFast IPN not valid:", pfRes.data);
      return res.status(400).send("Invalid IPN");
    }

    if (String(ipnData.payment_status || "").toUpperCase() === "COMPLETE") {
      const email = normalizeEmail(ipnData.email_address);
      const plan = String(ipnData.custom_str1 || "");
      savePaymentStatus(email, plan, "COMPLETE");

      const admin = getFirebaseAdmin();
      if (admin && email) {
        try {
          const userRecord = await admin.auth().getUserByEmail(email);
          await admin.database().ref(`users/${userRecord.uid}`).update({
            premium: true,
            plan,
            paidAt: new Date().toISOString(),
            totalSpent: planAmount(plan),
          });
        } catch (e) {
          console.error("Firebase premium update error:", e.message);
        }
      }

      if (email && process.env.SENDGRID_API_KEY) {
        const planLabel = escapeHtml(plan || "Premium");
        const msg = {
          to: email,
          from: getSendgridFrom(),
          subject: `Payment Received - ${EMAIL_BRAND_NAME}`,
          text: `Thank you for your payment for the ${plan} plan! Your premium access is now active.`,
          html: renderEmailTemplate({
            title: "Payment Confirmed",
            intro: `Thanks for upgrading to ${plan || "your selected"} plan.`,
            bodyHtml: `<p>Your premium access is now active. You can launch games and continue learning immediately.</p><p><strong>Plan:</strong> ${planLabel}</p>`,
            ctaLabel: "Open SlidePlay",
            ctaUrl: `${EMAIL_APP_URL}/main.html`,
          }),
        };
        try {
          await sgMail.send(msg);
        } catch (e) {
          console.error("SendGrid error:", getSendgridErrorDetail(e));
        }
      }

      console.log("Payment marked COMPLETE for", email);
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("PayFast IPN error:", err);
    return res.status(500).send("IPN error");
  }
});

app.post("/send-welcome-email", async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    res.status(400).send("Missing email");
    return;
  }

  if (!process.env.SENDGRID_API_KEY) {
    res.status(200).send("Email skipped (SendGrid not configured)");
    return;
  }

  const msg = {
    to: email,
    from: getSendgridFrom(),
    subject: `Welcome to ${EMAIL_BRAND_NAME}!`,
    text: "Thank you for signing up for SlidePlayer! We're excited to have you on board. If you have any questions or need assistance, feel free to reach out to our support team.",
    html: renderEmailTemplate({
      title: `Welcome to ${EMAIL_BRAND_NAME}`,
      intro: "Thanks for signing up. Your account is ready.",
      bodyHtml: "<p>Start by uploading your slides, generating a quiz, and jumping into game mode.</p><p>If you need help, reply to this email and our support team will assist you.</p>",
      ctaLabel: "Start Learning",
      ctaUrl: `${EMAIL_APP_URL}/login.html`,
    }),
  };

  try {
    await sgMail.send(msg);
    res.status(200).send("Email sent");
  } catch (error) {
    const detail = getSendgridErrorDetail(error);
    console.error("Welcome email failed:", detail);
    res.status(500).json({ error: "Error sending email", detail });
  }
});

app.post("/api/sessions/archive", async (req, res) => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing auth token" });
    return;
  }

  const admin = getFirebaseAdmin();
  if (!admin) {
    res.status(503).json({ error: "Session archive unavailable: Firebase Admin is not configured" });
    return;
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token, true);
  } catch (_) {
    res.status(401).json({ error: "Invalid auth token" });
    return;
  }

  const payload = req.body || {};
  const sessionCode = String(payload.sessionCode || payload.SessionCode || "").trim().toUpperCase();
  if (!sessionCode) {
    res.status(400).json({ error: "Missing sessionCode" });
    return;
  }

  const normalized = normalizeSessionRow({
    SessionCode: sessionCode,
    GameType: payload.gameType,
    GameMode: payload.gameMode,
    HostName: payload.hostName || payload.host || decoded.name || decoded.email || "Teacher",
    HostUID: decoded.uid,
    PlayerCount: payload.playerCount,
    WinnerName: payload.winnerName,
    WinnerScore: payload.winnerScore,
    TotalScore: payload.totalScore,
    Status: payload.status || "finished",
    CreatedAt: payload.createdAt || payload.startedAt,
    FinishedAt: payload.finishedAt || new Date().toISOString(),
  });

  if (!normalized.PlayerCount) {
    normalized.PlayerCount = Number(payload.players || 0);
  }

  upsertSessionHistory(normalized);
  res.json({ ok: true, sessionCode: normalized.SessionCode });
});

app.post("/api/gameplay/record", (req, res) => {
  const body = req.body || {};
  const uid = String(body.uid || "").trim();
  const email = normalizeEmail(body.email || "");

  if (!uid && !email) {
    res.status(400).json({ error: "Missing uid or email" });
    return;
  }

  const hostName = String(body.displayName || body.hostName || email || "Player");
  const sessionCode = String(body.sessionCode || `LOCAL-${Date.now().toString(36).toUpperCase()}`)
    .trim()
    .toUpperCase();

  const recorded = incrementLocalGamesPlayed({
    uid,
    email,
    displayName: hostName,
    role: String(body.role || "student").toLowerCase(),
  });

  if (!recorded) {
    res.status(500).json({ error: "Could not persist gameplay record" });
    return;
  }

  upsertSessionHistory(
    normalizeSessionRow({
      SessionCode: sessionCode,
      GameType: String(body.gameType || "quiz"),
      GameMode: String(body.gameMode || "solo"),
      HostName: hostName,
      HostUID: uid,
      PlayerCount: Number(body.playerCount || 1),
      WinnerName: hostName,
      WinnerScore: Number(body.winnerScore || body.totalScore || 0),
      TotalScore: Number(body.totalScore || body.winnerScore || 0),
      Status: "finished",
      CreatedAt: body.createdAt || new Date().toISOString(),
      FinishedAt: new Date().toISOString(),
    })
  );

  res.json({ ok: true, sessionCode });
});

app.get("/api/admin/stats", ensureAdmin, async (_req, res) => {
  try {
    const paymentRows = normalizePaymentRows(safeReadJson(PAYMENTS_FILE, {}));
    const usersRaw = await fetchUsersFromDb();
    const users = withUserPaymentStats(usersRaw, paymentRows);
    const sessions = await fetchSessionsFromDb();

    const counts = {
      total: users.length,
      students: users.filter((u) => u.Role === "student").length,
      teachers: users.filter((u) => u.Role === "teacher").length,
      admins: users.filter((u) => u.Role === "admin").length,
    };

    const activeSubscriptions = users.filter((u) => u.CurrentPlan).length;
    const mrr = users.reduce((sum, u) => sum + planAmount(u.CurrentPlan), 0);
    const totalRevenue = paymentRows
      .filter((p) => p.Status === "succeeded")
      .reduce((sum, p) => sum + Number(p.AmountZAR || 0), 0);

    const today = new Date().toISOString().slice(0, 10);
    const onlineToday = users.filter((u) => String(u.LastLoginAt || "").slice(0, 10) === today).length;

    const recentUsers = sortByDateDesc(users, "CreatedAt")
      .slice(0, 6)
      .map((u) => ({
        name: u.DisplayName || u.Email || u.FirebaseUID,
        role: u.Role || "student",
        createdAt: u.CreatedAt,
      }));

    const sessionsSorted = sortByDateDesc(sessions, "CreatedAt");
    const recentSessions = sessionsSorted.slice(0, 6).map((s) => ({
      code: s.SessionCode,
      status: s.Status,
      createdAt: s.CreatedAt,
    }));

    const planBuckets = new Map();
    for (const u of users) {
      const plan = String(u.CurrentPlan || "").trim();
      if (!plan) continue;
      if (!planBuckets.has(plan)) planBuckets.set(plan, { plan, count: 0, monthlyRevenue: 0 });
      const bucket = planBuckets.get(plan);
      bucket.count += 1;
      bucket.monthlyRevenue += planAmount(plan);
    }

    const planBreakdown = Array.from(planBuckets.values()).sort((a, b) => b.count - a.count);

    res.json({
      serverTime: new Date().toISOString(),
      counts,
      activeSubscriptions,
      mrr,
      totalRevenue,
      onlineToday,
      usersPerDay: buildUsersPerDay(users, 14),
      recentUsers,
      recentSessions,
      planBreakdown,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ error: "Could not load admin stats" });
  }
});

app.get("/api/admin/users", ensureAdmin, async (_req, res) => {
  try {
    const paymentRows = normalizePaymentRows(safeReadJson(PAYMENTS_FILE, {}));
    const users = withUserPaymentStats(await fetchUsersFromDb(), paymentRows);
    res.json({ users: sortByDateDesc(users, "CreatedAt") });
  } catch (error) {
    res.status(500).json({ error: "Could not load users" });
  }
});

app.get("/api/admin/users/:uid", ensureAdmin, async (req, res) => {
  const uid = String(req.params.uid || "").trim();
  if (!uid) {
    res.status(400).json({ error: "Missing user uid" });
    return;
  }

  try {
    const paymentRows = normalizePaymentRows(safeReadJson(PAYMENTS_FILE, {}));
    const users = withUserPaymentStats(await fetchUsersFromDb(), paymentRows);
    const user = users.find((u) => u.FirebaseUID === uid);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const sessions = await fetchSessionsFromDb();
    const userSessions = sessions.filter((s) => s.HostUID === uid || normalizeEmail(s.HostName) === normalizeEmail(user.DisplayName));
    const userPayments = paymentRows.filter((p) => normalizeEmail(p.Email) === normalizeEmail(user.Email));

    res.json({
      user,
      sessions: sortByDateDesc(userSessions, "CreatedAt"),
      payments: sortByDateDesc(userPayments, "CreatedAt"),
    });
  } catch (error) {
    res.status(500).json({ error: "Could not load user profile" });
  }
});

app.get("/api/admin/sessions", ensureAdmin, async (_req, res) => {
  try {
    const allCurrent = sortByDateDesc(await fetchSessionsFromDb(), "CreatedAt");
    const archived = readSessionHistory();
    const liveRooms = allCurrent.filter((s) => String(s.Status || "").toLowerCase() === "active");
    const sessions = mergeSessionHistory(allCurrent, archived);
    res.json({ sessions, liveRooms });
  } catch (error) {
    res.status(500).json({ error: "Could not load sessions" });
  }
});

app.get("/api/admin/payments", ensureAdmin, async (_req, res) => {
  try {
    const paymentRows = normalizePaymentRows(safeReadJson(PAYMENTS_FILE, {}));
    const users = await fetchUsersFromDb();
    const userByEmail = new Map(users.map((u) => [normalizeEmail(u.Email), u]));

    const payments = paymentRows.map((p) => {
      const user = userByEmail.get(normalizeEmail(p.Email));
      return {
        ...p,
        FirebaseUID: p.FirebaseUID || user?.FirebaseUID || "",
        DisplayName: p.DisplayName || user?.DisplayName || "",
      };
    });

    res.json({ payments: sortByDateDesc(payments, "CreatedAt") });
  } catch (error) {
    res.status(500).json({ error: "Could not load payments" });
  }
});

app.get("/api/admin/support/messages", ensureAdmin, async (_req, res) => {
  const messages = safeReadJson(SUPPORT_FILE, []);
  if (!Array.isArray(messages)) {
    res.json({ messages: [] });
    return;
  }
  res.json({ messages: sortByDateDesc(messages, "CreatedAt") });
});

app.patch("/api/admin/support/messages/:id", ensureAdmin, (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || "").toLowerCase();
  const allowed = new Set(["open", "in_progress", "resolved"]);

  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid message id" });
    return;
  }

  if (!allowed.has(status)) {
    res.status(400).json({ error: "Invalid status value" });
    return;
  }

  const messages = safeReadJson(SUPPORT_FILE, []);
  if (!Array.isArray(messages)) {
    res.status(500).json({ error: "Support inbox is unavailable" });
    return;
  }

  const idx = messages.findIndex((m) => Number(m?.MessageID) === id);
  if (idx < 0) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  messages[idx] = {
    ...messages[idx],
    Status: status,
    UpdatedAt: new Date().toISOString(),
  };

  if (!safeWriteJson(SUPPORT_FILE, messages)) {
    res.status(500).json({ error: "Could not persist support status" });
    return;
  }

  res.json({ ok: true, message: messages[idx] });
});

app.post("/api/admin/email/send", ensureAdmin, async (req, res) => {
  if (!process.env.SENDGRID_API_KEY) {
    res.status(500).json({ error: "SendGrid is not configured" });
    return;
  }

  const toList = Array.isArray(req.body?.to) ? req.body.to : [];
  const subject = String(req.body?.subject || "").trim();
  const text = String(req.body?.text || "").trim();
  const html = String(req.body?.html || "").trim();

  const recipients = toList
    .map((email) => normalizeEmail(email))
    .filter(Boolean);

  if (!recipients.length || !subject || (!text && !html)) {
    res.status(400).json({ error: "Missing recipients, subject, and body (text or html)" });
    return;
  }

  const accepted = [];
  const failed = [];

  for (const email of recipients) {
    try {
      await sgMail.send({
        to: email,
        from: getSendgridFrom(),
        subject,
        text: text || " ",
        html: html || renderEmailTemplate({
          title: subject,
          intro: "Message from your SlidePlay admin team.",
          bodyHtml: `<p>${normalizeTextToHtml(text)}</p>`,
          ctaLabel: "Open SlidePlay",
          ctaUrl: `${EMAIL_APP_URL}/main.html`,
        }),
      });
      accepted.push(email);
    } catch (error) {
      failed.push({ email, reason: getSendgridErrorDetail(error) });
    }
  }

  res.json({ accepted, failed, sent: accepted.length });
});

app.get("/api/admin/security-alerts", ensureAdmin, (_req, res) => {
  res.json(getSecuritySnapshot());
});

app.post("/api/admin/security-alerts/ack", ensureAdmin, (req, res) => {
  const id = Number(req.body?.alertId);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid alert id" });
    return;
  }

  const alert = securityAlerts.find((a) => Number(a.alertId) === id);
  if (!alert) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }

  alert.acknowledgedAt = new Date().toISOString();
  res.json({ ok: true, alertId: id });
});

app.post("/api/admin/security-alerts/ack-all", ensureAdmin, (_req, res) => {
  const now = new Date().toISOString();
  let updated = 0;
  for (const alert of securityAlerts) {
    if (!alert.acknowledgedAt) {
      alert.acknowledgedAt = now;
      updated += 1;
    }
  }
  res.json({ ok: true, updated });
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "slideplay-app" });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "main.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
