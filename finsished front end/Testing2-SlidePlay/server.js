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
const GAMEPLAY_EVENTS_FILE = path.join(__dirname, "gameplay-events.json");
const MISSIONS_FILE = path.join(__dirname, "learning-missions.json");
const STUDENT_REPORTS_FILE = path.join(__dirname, "teacher-student-reports.json");
const LESSON_PLANS_FILE = path.join(__dirname, "teacher-lesson-plans.json");
const DECKS_FILE = path.join(__dirname, "ai-decks.json");
const DECK_EMBEDDINGS_FILE = path.join(__dirname, "ai-deck-embeddings.json");
const DEFAULT_DB_URL = "https://slideplay-38d3f-default-rtdb.firebaseio.com";
const EMAIL_BRAND_NAME = process.env.EMAIL_BRAND_NAME || "SlidePlay";
const EMAIL_APP_URL = process.env.APP_URL || "https://appvengers-slideplayer-1.onrender.com";
const SESSION_HISTORY_MAX_ROWS = Math.max(50, Number(process.env.SESSION_HISTORY_MAX_ROWS || 1000));
const SESSION_HISTORY_RETENTION_DAYS = Math.max(7, Number(process.env.SESSION_HISTORY_RETENTION_DAYS || 120));
const SESSION_HISTORY_RETENTION_MS = SESSION_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const PUBLIC_SITE_URL = String(process.env.PUBLIC_SITE_URL || EMAIL_APP_URL || "https://appvengers-slideplayer-1.onrender.com")
  .trim()
  .replace(/\/+$/, "");
const TEACHER_ACCESS_CODE = String(process.env.TEACHER_ACCESS_CODE || "SLIDEPLAY").trim().toUpperCase();
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

const NOINDEX_PATHS = new Set([
  "/login.html",
  "/signup.html",
  "/reset.html",
  "/admin-dashboard.html",
  "/teacher-manager.html",
  "/AcessControl.html",
]);

app.use((req, res, next) => {
  const reqPath = String(req.path || "");
  if (reqPath.startsWith("/api/")) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
  } else if (NOINDEX_PATHS.has(reqPath)) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  next();
});

app.use(express.static(__dirname));
const slideUploadDir = path.resolve(__dirname, "../../slide_upload");
if (fs.existsSync(slideUploadDir)) {
  app.use("/slide_upload", express.static(slideUploadDir));
}
const sharedAssetsDir = path.resolve(__dirname, "../../shared");
if (fs.existsSync(sharedAssetsDir)) {
  app.use("/shared", express.static(sharedAssetsDir));
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

function isValidE164Phone(value) {
  return /^\+[1-9]\d{7,14}$/.test(String(value || "").trim());
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

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_) {
    return "";
  }
}

function isLocalLikeBaseUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return true;
  try {
    const host = new URL(normalized).hostname.toLowerCase();
    if (!host) return true;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "temp.local" ||
      host.endsWith(".local")
    );
  } catch (_) {
    return true;
  }
}

function getPublicBaseUrl(req) {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim() || "https";
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const requestBase = host ? normalizeBaseUrl(`${proto}://${host}`) : "";
  const envBase = normalizeBaseUrl(PUBLIC_SITE_URL);

  if (requestBase && !isLocalLikeBaseUrl(requestBase)) {
    return requestBase;
  }

  if (envBase && !isLocalLikeBaseUrl(envBase)) {
    return envBase;
  }

  const appBase = normalizeBaseUrl(EMAIL_APP_URL);
  if (appBase && !isLocalLikeBaseUrl(appBase)) {
    return appBase;
  }

  return "https://appvengers-slideplayer-1.onrender.com";
}

function toAbsoluteUrl(req, routePath) {
  const base = getPublicBaseUrl(req);
  const suffix = String(routePath || "/").startsWith("/") ? routePath : `/${routePath}`;
  return `${base}${suffix}`;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSitemapEntries(req) {
  const fixedPages = [
    "/",
    "/main.html",
    "/about.html",
    "/features.html",
    "/help.html",
    "/library.html",
    "/choose_exp.html",
  ];

  const dynamicPages = [];
  const gamesRoot = path.resolve(__dirname, "../../games");
  if (fs.existsSync(gamesRoot)) {
    try {
      const gameDirs = fs.readdirSync(gamesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
      for (const entry of gameDirs) {
        const indexPath = path.join(gamesRoot, entry.name, "index.html");
        if (fs.existsSync(indexPath)) {
          dynamicPages.push(`/games/${entry.name}/index.html`);
        }
      }
    } catch (_) {
      // Ignore filesystem failures; fixed pages still provide crawl entry points.
    }
  }

  const allPages = [...fixedPages, ...dynamicPages].filter((routePath) => {
    if (routePath === "/") return true;
    if (routePath.startsWith("/games/")) return true;
    return fs.existsSync(path.join(__dirname, routePath.slice(1)));
  });

  const deduped = Array.from(new Set(allPages));
  const now = new Date().toISOString();
  return deduped.map((routePath) => ({
    loc: toAbsoluteUrl(req, routePath),
    lastmod: now,
    changefreq: routePath === "/" ? "daily" : "weekly",
    priority: routePath === "/" ? "1.0" : routePath.includes("/games/") ? "0.7" : "0.8",
  }));
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

function readGameplayEvents() {
  const raw = safeReadJson(GAMEPLAY_EVENTS_FILE, []);
  if (!Array.isArray(raw)) return [];

  const normalizeQuestionAttempts = (attempts) => {
    if (!Array.isArray(attempts)) return [];
    return attempts
      .map((row, idx) => ({
        attemptId: String(row?.attemptId || `ATT-${idx + 1}`),
        question: String(row?.question || row?.questionText || "").trim(),
        selectedAnswer: String(row?.selectedAnswer || row?.chosenAnswer || "").trim(),
        correctAnswer: String(row?.correctAnswer || "").trim(),
        isCorrect: Boolean(row?.isCorrect),
        explanation: String(row?.explanation || "").trim(),
      }))
      .filter((row) => row.question);
  };

  const normalizeWrongAnswers = (wrongAnswers) => {
    if (!Array.isArray(wrongAnswers)) return [];
    return wrongAnswers
      .map((row) => ({
        question: String(row?.question || row?.questionText || "").trim(),
        selectedAnswer: String(row?.selectedAnswer || row?.chosenAnswer || "").trim(),
        correctAnswer: String(row?.correctAnswer || "").trim(),
        explanation: String(row?.explanation || "").trim(),
      }))
      .filter((row) => row.question);
  };

  const normalizeNotes = (notes) => {
    if (!Array.isArray(notes)) return [];
    return notes
      .map((note) => ({
        noteId: String(note?.noteId || `NOTE-${Date.now().toString(36).toUpperCase()}`),
        text: String(note?.text || "").trim(),
        createdAt: normalizeIsoDate(note?.createdAt) || new Date().toISOString(),
        updatedAt: normalizeIsoDate(note?.updatedAt) || normalizeIsoDate(note?.createdAt) || new Date().toISOString(),
      }))
      .filter((note) => note.text.length > 0)
      .slice(0, 100);
  };

  return raw
    .map((item) => ({
      eventId: String(item?.eventId || ""),
      uid: String(item?.uid || "").trim(),
      email: normalizeEmail(item?.email || ""),
      displayName: String(item?.displayName || "").trim(),
      gameType: String(item?.gameType || "quiz").toLowerCase(),
      gameMode: String(item?.gameMode || "solo").toLowerCase(),
      score: Number(item?.score || 0),
      totalQuestions: Number(item?.totalQuestions || 0),
      correctCount: Number(item?.correctCount || 0),
      durationSec: Number(item?.durationSec || 0),
      createdAt: normalizeIsoDate(item?.createdAt) || new Date().toISOString(),
      meta: item?.meta && typeof item.meta === "object"
        ? {
            ...item.meta,
            questionAttempts: normalizeQuestionAttempts(item.meta?.questionAttempts),
            wrongAnswers: normalizeWrongAnswers(item.meta?.wrongAnswers),
          }
        : { questionAttempts: [], wrongAnswers: [] },
      notes: normalizeNotes(item?.notes),
    }))
    .filter((item) => item.uid || item.email);
}

function writeGameplayEvents(rows) {
  const payload = Array.isArray(rows) ? rows.slice(0, 10000) : [];
  return safeWriteJson(GAMEPLAY_EVENTS_FILE, payload);
}

function appendGameplayEvent(eventRow) {
  const rows = readGameplayEvents();

  const rawMeta = eventRow?.meta && typeof eventRow.meta === "object" ? eventRow.meta : {};
  const questionAttempts = Array.isArray(rawMeta.questionAttempts)
    ? rawMeta.questionAttempts
      .map((row, idx) => ({
        attemptId: String(row?.attemptId || `ATT-${idx + 1}`),
        question: String(row?.question || row?.questionText || "").trim(),
        selectedAnswer: String(row?.selectedAnswer || row?.chosenAnswer || "").trim(),
        correctAnswer: String(row?.correctAnswer || "").trim(),
        isCorrect: Boolean(row?.isCorrect),
        explanation: String(row?.explanation || "").trim(),
      }))
      .filter((row) => row.question)
    : [];

  const wrongAnswersFromPayload = Array.isArray(rawMeta.wrongAnswers)
    ? rawMeta.wrongAnswers
      .map((row) => ({
        question: String(row?.question || row?.questionText || "").trim(),
        selectedAnswer: String(row?.selectedAnswer || row?.chosenAnswer || "").trim(),
        correctAnswer: String(row?.correctAnswer || "").trim(),
        explanation: String(row?.explanation || "").trim(),
      }))
      .filter((row) => row.question)
    : [];

  const derivedWrongAnswers = questionAttempts
    .filter((row) => !row.isCorrect)
    .map((row) => ({
      question: row.question,
      selectedAnswer: row.selectedAnswer,
      correctAnswer: row.correctAnswer,
      explanation: row.explanation,
    }));

  rows.unshift({
    eventId: String(eventRow?.eventId || `EVT-${Date.now().toString(36).toUpperCase()}`),
    uid: String(eventRow?.uid || "").trim(),
    email: normalizeEmail(eventRow?.email || ""),
    displayName: String(eventRow?.displayName || ""),
    gameType: String(eventRow?.gameType || "quiz").toLowerCase(),
    gameMode: String(eventRow?.gameMode || "solo").toLowerCase(),
    score: Number(eventRow?.score || 0),
    totalQuestions: Number(eventRow?.totalQuestions || 0),
    correctCount: Number(eventRow?.correctCount || 0),
    durationSec: Number(eventRow?.durationSec || 0),
    createdAt: normalizeIsoDate(eventRow?.createdAt) || new Date().toISOString(),
    meta: {
      ...rawMeta,
      questionAttempts,
      wrongAnswers: wrongAnswersFromPayload.length ? wrongAnswersFromPayload : derivedWrongAnswers,
    },
    notes: Array.isArray(eventRow?.notes) ? eventRow.notes : [],
  });
  return writeGameplayEvents(rows);
}

function gameplayEventBelongsToPlayer(eventRow, uid, email) {
  const normalizedUid = String(uid || "").trim();
  const normalizedEmail = normalizeEmail(email || "");
  return (
    (normalizedUid && eventRow.uid === normalizedUid) ||
    (normalizedEmail && normalizeEmail(eventRow.email) === normalizedEmail)
  );
}

function sanitizeGameplayEventForNotes(eventRow) {
  const attempts = Array.isArray(eventRow?.meta?.questionAttempts) ? eventRow.meta.questionAttempts : [];
  const wrongAnswers = Array.isArray(eventRow?.meta?.wrongAnswers)
    ? eventRow.meta.wrongAnswers
    : attempts.filter((row) => !row.isCorrect).map((row) => ({
        question: row.question,
        selectedAnswer: row.selectedAnswer,
        correctAnswer: row.correctAnswer,
        explanation: row.explanation,
      }));

  return {
    eventId: eventRow.eventId,
    gameType: eventRow.gameType,
    gameMode: eventRow.gameMode,
    score: Number(eventRow.score || 0),
    totalQuestions: Number(eventRow.totalQuestions || 0),
    correctCount: Number(eventRow.correctCount || 0),
    durationSec: Number(eventRow.durationSec || 0),
    createdAt: eventRow.createdAt,
    questionAttempts: attempts,
    wrongAnswers,
    notes: Array.isArray(eventRow.notes) ? eventRow.notes : [],
  };
}

function getRecentPlayerEvents(uid, email, limit = 8) {
  const normalizedUid = String(uid || "").trim();
  const normalizedEmail = normalizeEmail(email || "");
  if (!normalizedUid && !normalizedEmail) return [];

  return readGameplayEvents()
    .filter((row) =>
      (normalizedUid && row.uid === normalizedUid) ||
      (normalizedEmail && normalizeEmail(row.email) === normalizedEmail)
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

function computeAdaptiveDifficulty(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return { recommendedDifficulty: "medium", reason: "No previous attempts yet." };
  }

  let weighted = 0;
  for (const row of events) {
    const total = Number(row.totalQuestions || 0);
    const correct = Number(row.correctCount || 0);
    if (total > 0) {
      weighted += Math.max(0, Math.min(1, correct / total));
      continue;
    }
    const score = Number(row.score || 0);
    const normalizedScore = Math.max(0, Math.min(1, score / 100));
    weighted += normalizedScore;
  }

  const avg = weighted / Math.max(1, events.length);
  if (avg >= 0.78) {
    return { recommendedDifficulty: "hard", reason: "Strong recent performance. Increase challenge." };
  }
  if (avg <= 0.45) {
    return { recommendedDifficulty: "easy", reason: "Recent accuracy dropped. Ease difficulty to rebuild momentum." };
  }
  return { recommendedDifficulty: "medium", reason: "Balanced performance. Keep current challenge level." };
}

function readMissions() {
  const raw = safeReadJson(MISSIONS_FILE, []);
  return Array.isArray(raw) ? raw : [];
}

function writeMissions(rows) {
  return safeWriteJson(MISSIONS_FILE, Array.isArray(rows) ? rows : []);
}

function readStudentReports() {
  const raw = safeReadJson(STUDENT_REPORTS_FILE, []);
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    reportId: String(item?.reportId || `REP-${Date.now().toString(36).toUpperCase()}`),
    teacherUid: String(item?.teacherUid || "").trim(),
    teacherEmail: normalizeEmail(item?.teacherEmail || ""),
    studentUid: String(item?.studentUid || "").trim(),
    studentEmail: normalizeEmail(item?.studentEmail || ""),
    studentName: String(item?.studentName || "Student"),
    courseName: String(item?.courseName || "General").trim(),
    marks: Number(item?.marks || 0),
    summary: String(item?.summary || "").trim(),
    status: String(item?.status || "draft").toLowerCase(),
    createdAt: normalizeIsoDate(item?.createdAt) || new Date().toISOString(),
    updatedAt: normalizeIsoDate(item?.updatedAt) || normalizeIsoDate(item?.createdAt) || new Date().toISOString(),
  }));
}

function writeStudentReports(rows) {
  return safeWriteJson(STUDENT_REPORTS_FILE, Array.isArray(rows) ? rows.slice(0, 5000) : []);
}

function readLessonPlans() {
  const raw = safeReadJson(LESSON_PLANS_FILE, []);
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    planId: String(item?.planId || `PLAN-${Date.now().toString(36).toUpperCase()}`),
    teacherUid: String(item?.teacherUid || "").trim(),
    teacherEmail: normalizeEmail(item?.teacherEmail || ""),
    title: String(item?.title || "Untitled lesson").trim(),
    courseName: String(item?.courseName || "General").trim(),
    focusTopics: String(item?.focusTopics || "").trim(),
    notes: String(item?.notes || "").trim(),
    questionGoals: String(item?.questionGoals || "").trim(),
    status: String(item?.status || "draft").toLowerCase(),
    createdAt: normalizeIsoDate(item?.createdAt) || new Date().toISOString(),
    updatedAt: normalizeIsoDate(item?.updatedAt) || normalizeIsoDate(item?.createdAt) || new Date().toISOString(),
  }));
}

function writeLessonPlans(rows) {
  return safeWriteJson(LESSON_PLANS_FILE, Array.isArray(rows) ? rows.slice(0, 5000) : []);
}

function teacherIdentityFromRequest(req) {
  return {
    uid: String(req.query?.uid || req.body?.uid || "").trim(),
    email: normalizeEmail(req.query?.email || req.body?.email || ""),
  };
}

async function verifyHighestPaidTeacher(req, res) {
  const { uid, email } = teacherIdentityFromRequest(req);
  if (!uid && !email) {
    res.status(400).json({ error: "Missing teacher uid or email" });
    return null;
  }

  const users = await fetchUsersFromDb();
  const normalizedUsers = withUserPaymentStats(users, normalizePaymentRows(safeReadJson(PAYMENTS_FILE, {})));
  const teacher = normalizedUsers.find((row) =>
    (uid && String(row.FirebaseUID || "").trim() === uid) ||
    (email && normalizeEmail(row.Email) === email)
  );

  const plan = String(teacher?.CurrentPlan || "").toLowerCase();
  const highestPlans = new Set(["school", "teacher_premium"]);
  if (!highestPlans.has(plan)) {
    res.status(402).json({
      error: "Highest paid teacher plan required",
      requiredPlans: ["school", "teacher_premium"],
      currentPlan: plan || "free",
    });
    return null;
  }

  return {
    uid: uid || String(teacher?.FirebaseUID || "").trim(),
    email: email || normalizeEmail(teacher?.Email || ""),
  };
}

function buildReplaySummary(events) {
  const byGame = new Map();
  for (const evt of events || []) {
    const key = String(evt.gameType || "quiz");
    if (!byGame.has(key)) {
      byGame.set(key, { gameType: key, plays: 0, totalScore: 0, avgScore: 0 });
    }
    const bucket = byGame.get(key);
    bucket.plays += 1;
    bucket.totalScore += Number(evt.score || 0);
    bucket.avgScore = Math.round(bucket.totalScore / Math.max(1, bucket.plays));
  }

  const games = Array.from(byGame.values()).sort((a, b) => b.avgScore - a.avgScore);
  const strengths = games.slice(0, 3).map((g) => `${g.gameType} (${g.avgScore})`);
  const weakAreas = games.slice(-3).reverse().map((g) => `${g.gameType} (${g.avgScore})`);
  const totalSessions = events.length;
  const totalMinutes = Math.round(
    events.reduce((sum, evt) => sum + Number(evt.durationSec || 0), 0) / 60
  );

  return {
    totalSessions,
    totalMinutes,
    strengths,
    weakAreas,
    perGame: games,
  };
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

function normalizeDeckRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item) => ({
      deckId: String(item?.deckId || "").trim(),
      uid: String(item?.uid || "anonymous").trim() || "anonymous",
      title: String(item?.title || "Untitled Deck").trim() || "Untitled Deck",
      rawText: String(item?.rawText || ""),
      textLength: Number(item?.textLength || 0),
      createdAt: normalizeIsoDate(item?.createdAt) || new Date().toISOString(),
      updatedAt: normalizeIsoDate(item?.updatedAt) || normalizeIsoDate(item?.createdAt) || new Date().toISOString(),
    }))
    .filter((item) => item.deckId);
}

function readDecks() {
  return normalizeDeckRows(safeReadJson(DECKS_FILE, []));
}

function writeDecks(rows) {
  return safeWriteJson(DECKS_FILE, normalizeDeckRows(rows));
}

function readDeckEmbeddings() {
  const raw = safeReadJson(DECK_EMBEDDINGS_FILE, {});
  return raw && typeof raw === "object" ? raw : {};
}

function writeDeckEmbeddings(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  return safeWriteJson(DECK_EMBEDDINGS_FILE, data);
}

function tokenizeForSearch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function chunkDeckText(rawText, maxWords = 180, overlapWords = 35) {
  const words = String(rawText || "").split(/\s+/).filter(Boolean);
  const chunks = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + maxWords, words.length);
    const chunkText = words.slice(start, end).join(" ").trim();
    if (chunkText) chunks.push(chunkText);
    if (end >= words.length) break;
    start += Math.max(1, maxWords - overlapWords);
  }

  return chunks;
}

function buildSparseVector(text, maxTerms = 80) {
  const counts = new Map();
  const tokens = tokenizeForSearch(text);
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  const entries = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxTerms);

  const vector = {};
  let normSq = 0;
  for (const [token, count] of entries) {
    vector[token] = count;
    normSq += count * count;
  }

  return {
    vector,
    norm: Math.sqrt(normSq),
  };
}

function cosineSparse(a, b) {
  const vecA = a?.vector || {};
  const vecB = b?.vector || {};
  const normA = Number(a?.norm || 0);
  const normB = Number(b?.norm || 0);
  if (!normA || !normB) return 0;

  let dot = 0;
  const keysA = Object.keys(vecA);
  for (const key of keysA) {
    if (Object.prototype.hasOwnProperty.call(vecB, key)) {
      dot += Number(vecA[key] || 0) * Number(vecB[key] || 0);
    }
  }
  return dot / (normA * normB);
}

function upsertDeck(payload) {
  const deckId = String(payload?.deckId || `deck-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`);
  const nextDeck = {
    deckId,
    uid: String(payload?.uid || "anonymous").trim() || "anonymous",
    title: String(payload?.title || "Untitled Deck").trim() || "Untitled Deck",
    rawText: String(payload?.rawText || ""),
    textLength: Number(String(payload?.rawText || "").length),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const rows = readDecks();
  const idx = rows.findIndex((row) => row.deckId === deckId);
  if (idx >= 0) {
    rows[idx] = {
      ...rows[idx],
      ...nextDeck,
      createdAt: rows[idx].createdAt || nextDeck.createdAt,
      updatedAt: new Date().toISOString(),
    };
  } else {
    rows.unshift(nextDeck);
  }

  writeDecks(rows);
  return idx >= 0 ? rows[idx] : nextDeck;
}

function embedDeckLocally(deckId, rawText) {
  const chunks = chunkDeckText(rawText);
  const chunkRows = chunks.map((text, index) => ({
    index,
    text,
    ...buildSparseVector(text),
  }));

  const allEmbeddings = readDeckEmbeddings();
  allEmbeddings[deckId] = {
    deckId,
    chunkCount: chunkRows.length,
    updatedAt: new Date().toISOString(),
    chunks: chunkRows,
  };
  writeDeckEmbeddings(allEmbeddings);

  return chunkRows.length;
}

function searchDeckLocally(deckId, queryText, topK = 5) {
  const allEmbeddings = readDeckEmbeddings();
  const deck = allEmbeddings[deckId];
  if (!deck || !Array.isArray(deck.chunks) || deck.chunks.length === 0) return [];

  const qVec = buildSparseVector(queryText);
  return deck.chunks
    .map((chunk) => ({
      index: Number(chunk.index || 0),
      text: String(chunk.text || ""),
      score: cosineSparse(qVec, chunk),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Number(topK || 5)));
}

function extractGeminiText(response) {
  if (!response) return "";
  if (typeof response.text === "function") {
    const txt = response.text();
    if (typeof txt === "string" && txt.trim()) return txt.trim();
  }

  const candidateText = response?.candidates?.[0]?.content?.parts?.map((p) => p?.text || "").join("\n").trim();
  return candidateText || "";
}

function isGeminiQuotaError(message) {
  return /429|too many requests|quota exceeded|rate-limits?/i.test(String(message || ""));
}

async function runGeminiPrompt({ prompt, image, modelName, responseSchema, generationConfig }) {
  if (!gemini) {
    throw new Error("Gemini API key is not configured on the server");
  }

  const selectedModel = String(modelName || "gemini-2.0-flash");
  const model = gemini.getGenerativeModel({ model: selectedModel });
  const parts = [{ text: String(prompt || "") }];

  if (image?.data) {
    parts.push({
      inlineData: {
        data: String(image.data),
        mimeType: String(image.mimeType || "image/png"),
      },
    });
  }

  const nextConfig = {
    temperature: typeof generationConfig?.temperature === "number" ? generationConfig.temperature : 0.35,
    maxOutputTokens: Number(generationConfig?.maxOutputTokens || 2048),
  };

  if (responseSchema && typeof responseSchema === "object") {
    nextConfig.responseMimeType = "application/json";
    nextConfig.responseSchema = responseSchema;
  }

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
      generationConfig: nextConfig,
    });

    const text = extractGeminiText(result?.response);
    return {
      text,
      model: selectedModel,
    };
  } catch (error) {
    if (responseSchema) {
      const fallbackResult = await model.generateContent({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: nextConfig.temperature,
          maxOutputTokens: nextConfig.maxOutputTokens,
        },
      });

      return {
        text: extractGeminiText(fallbackResult?.response),
        model: selectedModel,
      };
    }
    throw error;
  }
}

app.post("/api/gemini-proxy", async (req, res) => {
  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) {
    res.status(400).json({ error: "Missing prompt" });
    return;
  }

  try {
    const result = await runGeminiPrompt({
      prompt,
      image: req.body?.image,
      modelName: req.body?.model,
      responseSchema: req.body?.responseSchema,
      generationConfig: req.body?.generationConfig,
    });

    if (!result.text) {
      res.status(502).json({ error: "Model returned an empty response" });
      return;
    }

    res.json(result);
  } catch (error) {
    const message = String(error?.message || "AI generation failed");
    const unavailable = /not configured|api key/i.test(message);
    if (isGeminiQuotaError(message)) {
      res.status(429).json({ error: message, retryable: true });
      return;
    }
    res.status(unavailable ? 503 : 500).json({ error: message });
  }
});

app.post("/api/decks/create", (req, res) => {
  const uid = String(req.body?.uid || "anonymous").trim() || "anonymous";
  const title = String(req.body?.title || "Untitled Deck").trim() || "Untitled Deck";
  const rawText = String(req.body?.rawText || "");
  const created = upsertDeck({ uid, title, rawText });
  res.json({ ok: true, deckId: created.deckId, textLength: created.textLength });
});

app.get("/api/decks/:deckId", (req, res) => {
  const deckId = String(req.params.deckId || "").trim();
  const deck = readDecks().find((row) => row.deckId === deckId);
  if (!deck) {
    res.status(404).json({ error: "Deck not found" });
    return;
  }

  res.json({
    deckId: deck.deckId,
    uid: deck.uid,
    title: deck.title,
    textLength: deck.textLength,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
  });
});

app.post("/api/decks/:deckId/embed", (req, res) => {
  const deckId = String(req.params.deckId || "").trim();
  if (!deckId) {
    res.status(400).json({ error: "Missing deckId" });
    return;
  }

  const rows = readDecks();
  const idx = rows.findIndex((row) => row.deckId === deckId);
  if (idx < 0) {
    res.status(404).json({ error: "Deck not found" });
    return;
  }

  const rawText = String(req.body?.rawText || rows[idx].rawText || "").trim();
  if (rawText.length < 40) {
    res.status(400).json({ error: "Deck text is too short to embed" });
    return;
  }

  rows[idx] = {
    ...rows[idx],
    rawText,
    textLength: rawText.length,
    updatedAt: new Date().toISOString(),
  };
  writeDecks(rows);

  const chunkCount = embedDeckLocally(deckId, rawText);
  res.status(202).json({ ok: true, deckId, chunkCount });
});

app.get("/api/decks/:deckId/retrieve", (req, res) => {
  const deckId = String(req.params.deckId || "").trim();
  const q = String(req.query.q || "").trim();
  const k = Number(req.query.k || 5);

  if (!q) {
    res.status(400).json({ error: "Missing query parameter q" });
    return;
  }

  const matches = searchDeckLocally(deckId, q, k).map((item) => ({
    index: item.index,
    score: Math.round(item.score * 1000) / 1000,
    text: item.text,
  }));

  res.json({ deckId, query: q, matches });
});

app.post("/api/decks/:deckId/study", async (req, res) => {
  const deckId = String(req.params.deckId || "").trim();
  const question = String(req.body?.question || "").trim();
  if (!question) {
    res.status(400).json({ error: "Missing question" });
    return;
  }

  const topChunks = searchDeckLocally(deckId, question, 5);
  if (!topChunks.length) {
    res.json({
      answer: "I could not find relevant content in this deck yet. Please upload or embed slide text first.",
      sources: [],
      grounded: false,
    });
    return;
  }

  const context = topChunks
    .map((chunk, i) => `[Excerpt ${i + 1}]\n${chunk.text}`)
    .join("\n\n");

  if (!gemini) {
    const fallback = topChunks[0].text.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
    res.json({
      answer: fallback || "Relevant context found, but AI answering is unavailable right now.",
      sources: topChunks.map((c) => ({ index: c.index, score: Math.round(c.score * 1000) / 1000 })),
      grounded: true,
      fallback: true,
    });
    return;
  }

  try {
    const prompt = [
      "You are a study tutor for SlidePlay.",
      "Answer using ONLY the provided excerpts.",
      "If the excerpts do not contain the answer, reply exactly: This topic is not covered in the uploaded slides.",
      "Keep response concise (2-4 sentences).",
      "",
      "EXCERPTS:",
      context,
      "",
      `QUESTION: ${question}`,
    ].join("\n");

    const result = await runGeminiPrompt({
      prompt,
      modelName: "gemini-2.0-flash",
      generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
    });

    res.json({
      answer: result.text || "This topic is not covered in the uploaded slides.",
      sources: topChunks.map((c) => ({ index: c.index, score: Math.round(c.score * 1000) / 1000 })),
      grounded: true,
      model: result.model,
    });
  } catch (error) {
    const message = String(error?.message || "Study answer failed");
    const fallback = topChunks[0]?.text?.split(/(?<=[.!?])\s+/)?.slice(0, 2)?.join(" ") || "";
    res.status(isGeminiQuotaError(message) ? 429 : 200).json({
      answer: fallback || "Relevant deck context is available, but AI answering is temporarily unavailable.",
      sources: topChunks.map((c) => ({ index: c.index, score: Math.round(c.score * 1000) / 1000 })),
      grounded: true,
      fallback: true,
      error: message,
    });
  }
});

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

app.post("/api/verify-teacher-code", (req, res) => {
  const submitted = String(req.body?.code || req.body?.teacherCode || "").trim().toUpperCase();
  if (!submitted) {
    res.status(400).json({ ok: false, error: "Missing teacher code" });
    return;
  }

  if (submitted !== TEACHER_ACCESS_CODE) {
    res.status(401).json({ ok: false, error: "Invalid teacher access code" });
    return;
  }

  res.json({ ok: true, role: "teacher" });
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

  const gameplayEvent = {
    uid,
    email,
    displayName: hostName,
    gameType: String(body.gameType || "quiz"),
    gameMode: String(body.gameMode || "solo"),
    score: Number(body.totalScore || body.winnerScore || 0),
    totalQuestions: Number(body.totalQuestions || 0),
    correctCount: Number(body.correctCount || 0),
    durationSec: Number(body.durationSec || 0),
    createdAt: new Date().toISOString(),
    meta: body.meta && typeof body.meta === "object" ? body.meta : {},
  };
  appendGameplayEvent(gameplayEvent);

  const recentEvents = getRecentPlayerEvents(uid, email, 8);
  const adaptive = computeAdaptiveDifficulty(recentEvents);

  res.json({
    ok: true,
    sessionCode,
    adaptive,
    replayPath: uid ? `/learning-replay.html?uid=${encodeURIComponent(uid)}` : "/learning-replay.html",
  });
});

app.post("/api/missions/create", (req, res) => {
  const body = req.body || {};
  const title = String(body.title || "SlidePlay Mission").trim();
  const topic = String(body.topic || "General Skills").trim();
  const createdBy = String(body.createdBy || "teacher").trim();
  const missionId = `MIS-${Date.now().toString(36).toUpperCase()}`;

  const chapters = Array.isArray(body.chapters) && body.chapters.length
    ? body.chapters.map((name, idx) => ({
        chapterId: `CH-${idx + 1}`,
        title: String(name || `Checkpoint ${idx + 1}`),
      }))
    : [
        { chapterId: "CH-1", title: `${topic} Primer` },
        { chapterId: "CH-2", title: `${topic} Challenge Run` },
        { chapterId: "CH-3", title: `${topic} Mastery Finale` },
      ];

  const mission = {
    missionId,
    title,
    topic,
    createdBy,
    status: "active",
    chapters,
    progress: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const missions = readMissions();
  missions.unshift(mission);
  writeMissions(missions.slice(0, 300));
  res.json({ ok: true, mission });
});

app.get("/api/missions/:missionId", (req, res) => {
  const missionId = String(req.params.missionId || "").trim();
  const mission = readMissions().find((item) => item && item.missionId === missionId);
  if (!mission) {
    res.status(404).json({ error: "Mission not found" });
    return;
  }
  res.json({ mission });
});

app.post("/api/missions/:missionId/progress", (req, res) => {
  const missionId = String(req.params.missionId || "").trim();
  const body = req.body || {};
  const uid = String(body.uid || "").trim();
  const email = normalizeEmail(body.email || "");

  if (!uid && !email) {
    res.status(400).json({ error: "Missing uid or email" });
    return;
  }

  const missions = readMissions();
  const idx = missions.findIndex((item) => item && item.missionId === missionId);
  if (idx < 0) {
    res.status(404).json({ error: "Mission not found" });
    return;
  }

  const entry = {
    uid,
    email,
    chapterId: String(body.chapterId || "").trim(),
    status: String(body.status || "completed").toLowerCase(),
    score: Number(body.score || 0),
    notes: String(body.notes || ""),
    createdAt: new Date().toISOString(),
  };

  const mission = missions[idx] || {};
  mission.progress = Array.isArray(mission.progress) ? mission.progress : [];
  mission.progress.unshift(entry);
  mission.updatedAt = new Date().toISOString();
  missions[idx] = mission;
  writeMissions(missions);

  res.json({ ok: true, missionId, progressCount: mission.progress.length });
});

app.get("/api/replay/:uid", (req, res) => {
  const uid = String(req.params.uid || "").trim();
  const email = normalizeEmail(req.query.email || "");
  if (!uid && !email) {
    res.status(400).json({ error: "Missing uid or email" });
    return;
  }

  const events = getRecentPlayerEvents(uid, email, 80);
  const replay = buildReplaySummary(events);
  const adaptive = computeAdaptiveDifficulty(events.slice(0, 8));

  const missionProgress = readMissions()
    .map((mission) => ({
      missionId: mission.missionId,
      title: mission.title,
      topic: mission.topic,
      completed: (Array.isArray(mission.progress) ? mission.progress : [])
        .filter((item) => (uid && item.uid === uid) || (email && normalizeEmail(item.email) === email))
        .length,
    }))
    .filter((item) => item.completed > 0)
    .slice(0, 8);

  res.json({
    ok: true,
    player: { uid, email },
    adaptive,
    replay,
    missionProgress,
  });
});

app.get("/api/teacher/student-roster", async (req, res) => {
  const identity = await verifyHighestPaidTeacher(req, res);
  if (!identity) return;

  const users = await fetchUsersFromDb();
  const payments = normalizePaymentRows(safeReadJson(PAYMENTS_FILE, {}));
  const enriched = withUserPaymentStats(users, payments);

  const students = enriched
    .filter((row) => String(row.Role || "").toLowerCase() === "student")
    .map((student) => {
      const events = getRecentPlayerEvents(String(student.FirebaseUID || ""), normalizeEmail(student.Email || ""), 60);
      const attempted = events.reduce((sum, item) => sum + Number(item.totalQuestions || 0), 0);
      const correct = events.reduce((sum, item) => sum + Number(item.correctCount || 0), 0);
      const marks = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
      return {
        uid: String(student.FirebaseUID || ""),
        email: normalizeEmail(student.Email || ""),
        name: String(student.DisplayName || student.Email || "Student"),
        paid: Boolean(student.CurrentPlan),
        plan: String(student.CurrentPlan || "free"),
        marks,
        gamesPlayed: Number(student.GamesPlayed || events.length || 0),
      };
    })
    .sort((a, b) => b.marks - a.marks)
    .slice(0, 500);

  res.json({ ok: true, students });
});

app.get("/api/teacher/student-reports", async (req, res) => {
  const identity = await verifyHighestPaidTeacher(req, res);
  if (!identity) return;

  const reports = readStudentReports()
    .filter((row) =>
      (identity.uid && row.teacherUid === identity.uid) ||
      (identity.email && row.teacherEmail === identity.email)
    )
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  res.json({ ok: true, reports });
});

app.post("/api/teacher/student-reports", async (req, res) => {
  const identity = await verifyHighestPaidTeacher(req, res);
  if (!identity) return;

  const studentName = String(req.body?.studentName || "").trim();
  const courseName = String(req.body?.courseName || "General").trim();
  const summary = String(req.body?.summary || "").trim();
  const marks = Number(req.body?.marks || 0);

  if (!studentName || summary.length < 5) {
    res.status(400).json({ error: "Student name and summary are required" });
    return;
  }

  const rows = readStudentReports();
  const report = {
    reportId: `REP-${Date.now().toString(36).toUpperCase()}`,
    teacherUid: identity.uid,
    teacherEmail: identity.email,
    studentUid: String(req.body?.studentUid || "").trim(),
    studentEmail: normalizeEmail(req.body?.studentEmail || ""),
    studentName,
    courseName: courseName || "General",
    marks: Number.isFinite(marks) ? marks : 0,
    summary,
    status: String(req.body?.status || "draft").toLowerCase(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  rows.unshift(report);
  if (!writeStudentReports(rows)) {
    res.status(500).json({ error: "Could not save report" });
    return;
  }
  res.status(201).json({ ok: true, report });
});

app.patch("/api/teacher/student-reports/:reportId", async (req, res) => {
  const identity = await verifyHighestPaidTeacher(req, res);
  if (!identity) return;

  const reportId = String(req.params.reportId || "").trim();
  if (!reportId) {
    res.status(400).json({ error: "Missing reportId" });
    return;
  }

  const rows = readStudentReports();
  const idx = rows.findIndex((row) => row.reportId === reportId && (
    (identity.uid && row.teacherUid === identity.uid) ||
    (identity.email && row.teacherEmail === identity.email)
  ));
  if (idx < 0) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  rows[idx] = {
    ...rows[idx],
    studentName: String(req.body?.studentName || rows[idx].studentName || "Student").trim(),
    courseName: String(req.body?.courseName || rows[idx].courseName || "General").trim(),
    marks: Number.isFinite(Number(req.body?.marks)) ? Number(req.body?.marks) : Number(rows[idx].marks || 0),
    summary: String(req.body?.summary || rows[idx].summary || "").trim(),
    status: String(req.body?.status || rows[idx].status || "draft").toLowerCase(),
    updatedAt: new Date().toISOString(),
  };

  if (!writeStudentReports(rows)) {
    res.status(500).json({ error: "Could not update report" });
    return;
  }
  res.json({ ok: true, report: rows[idx] });
});

app.delete("/api/teacher/student-reports/:reportId", async (req, res) => {
  const identity = await verifyHighestPaidTeacher(req, res);
  if (!identity) return;

  const reportId = String(req.params.reportId || "").trim();
  const rows = readStudentReports();
  const next = rows.filter((row) => !(row.reportId === reportId && (
    (identity.uid && row.teacherUid === identity.uid) ||
    (identity.email && row.teacherEmail === identity.email)
  )));

  if (next.length === rows.length) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  if (!writeStudentReports(next)) {
    res.status(500).json({ error: "Could not delete report" });
    return;
  }
  res.json({ ok: true, deleted: reportId });
});

app.get("/api/teacher/lesson-plans", async (req, res) => {
  const identity = await verifyHighestPaidTeacher(req, res);
  if (!identity) return;

  const plans = readLessonPlans()
    .filter((row) =>
      (identity.uid && row.teacherUid === identity.uid) ||
      (identity.email && row.teacherEmail === identity.email)
    )
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  res.json({ ok: true, plans });
});

app.post("/api/teacher/lesson-plans", async (req, res) => {
  const identity = await verifyHighestPaidTeacher(req, res);
  if (!identity) return;

  const title = String(req.body?.title || "").trim();
  if (!title) {
    res.status(400).json({ error: "Title is required" });
    return;
  }

  const rows = readLessonPlans();
  const plan = {
    planId: `PLAN-${Date.now().toString(36).toUpperCase()}`,
    teacherUid: identity.uid,
    teacherEmail: identity.email,
    title,
    courseName: String(req.body?.courseName || "General").trim(),
    focusTopics: String(req.body?.focusTopics || "").trim(),
    notes: String(req.body?.notes || "").trim(),
    questionGoals: String(req.body?.questionGoals || "").trim(),
    status: String(req.body?.status || "draft").toLowerCase(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  rows.unshift(plan);
  if (!writeLessonPlans(rows)) {
    res.status(500).json({ error: "Could not save lesson plan" });
    return;
  }
  res.status(201).json({ ok: true, plan });
});

app.patch("/api/teacher/lesson-plans/:planId", async (req, res) => {
  const identity = await verifyHighestPaidTeacher(req, res);
  if (!identity) return;

  const planId = String(req.params.planId || "").trim();
  const rows = readLessonPlans();
  const idx = rows.findIndex((row) => row.planId === planId && (
    (identity.uid && row.teacherUid === identity.uid) ||
    (identity.email && row.teacherEmail === identity.email)
  ));

  if (idx < 0) {
    res.status(404).json({ error: "Lesson plan not found" });
    return;
  }

  rows[idx] = {
    ...rows[idx],
    title: String(req.body?.title || rows[idx].title || "Untitled lesson").trim(),
    courseName: String(req.body?.courseName || rows[idx].courseName || "General").trim(),
    focusTopics: String(req.body?.focusTopics || rows[idx].focusTopics || "").trim(),
    notes: String(req.body?.notes || rows[idx].notes || "").trim(),
    questionGoals: String(req.body?.questionGoals || rows[idx].questionGoals || "").trim(),
    status: String(req.body?.status || rows[idx].status || "draft").toLowerCase(),
    updatedAt: new Date().toISOString(),
  };

  if (!writeLessonPlans(rows)) {
    res.status(500).json({ error: "Could not update lesson plan" });
    return;
  }
  res.json({ ok: true, plan: rows[idx] });
});

app.delete("/api/teacher/lesson-plans/:planId", async (req, res) => {
  const identity = await verifyHighestPaidTeacher(req, res);
  if (!identity) return;

  const planId = String(req.params.planId || "").trim();
  const rows = readLessonPlans();
  const next = rows.filter((row) => !(row.planId === planId && (
    (identity.uid && row.teacherUid === identity.uid) ||
    (identity.email && row.teacherEmail === identity.email)
  )));

  if (next.length === rows.length) {
    res.status(404).json({ error: "Lesson plan not found" });
    return;
  }

  if (!writeLessonPlans(next)) {
    res.status(500).json({ error: "Could not delete lesson plan" });
    return;
  }
  res.json({ ok: true, deleted: planId });
});

app.get("/api/student/game-notes", (req, res) => {
  const uid = String(req.query.uid || "").trim();
  const email = normalizeEmail(req.query.email || "");
  if (!uid && !email) {
    res.status(400).json({ error: "Missing uid or email" });
    return;
  }

  const events = getRecentPlayerEvents(uid, email, 300)
    .map((eventRow) => sanitizeGameplayEventForNotes(eventRow));

  res.json({ ok: true, events });
});

app.post("/api/student/game-notes/:eventId/notes", (req, res) => {
  const eventId = String(req.params.eventId || "").trim();
  const uid = String(req.body?.uid || "").trim();
  const email = normalizeEmail(req.body?.email || "");
  const text = String(req.body?.text || "").trim();

  if (!eventId) {
    res.status(400).json({ error: "Missing eventId" });
    return;
  }
  if (!uid && !email) {
    res.status(400).json({ error: "Missing uid or email" });
    return;
  }
  if (!text || text.length < 2) {
    res.status(400).json({ error: "Note must be at least 2 characters" });
    return;
  }

  const rows = readGameplayEvents();
  const idx = rows.findIndex((row) => row.eventId === eventId && gameplayEventBelongsToPlayer(row, uid, email));
  if (idx < 0) {
    res.status(404).json({ error: "Game history entry not found" });
    return;
  }

  const note = {
    noteId: `NOTE-${Date.now().toString(36).toUpperCase()}`,
    text,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  rows[idx].notes = Array.isArray(rows[idx].notes) ? rows[idx].notes : [];
  rows[idx].notes.unshift(note);
  rows[idx].notes = rows[idx].notes.slice(0, 100);

  if (!writeGameplayEvents(rows)) {
    res.status(500).json({ error: "Could not save note" });
    return;
  }

  res.status(201).json({ ok: true, note, event: sanitizeGameplayEventForNotes(rows[idx]) });
});

app.patch("/api/student/game-notes/:eventId/notes/:noteId", (req, res) => {
  const eventId = String(req.params.eventId || "").trim();
  const noteId = String(req.params.noteId || "").trim();
  const uid = String(req.body?.uid || "").trim();
  const email = normalizeEmail(req.body?.email || "");
  const text = String(req.body?.text || "").trim();

  if (!eventId || !noteId) {
    res.status(400).json({ error: "Missing eventId or noteId" });
    return;
  }
  if (!uid && !email) {
    res.status(400).json({ error: "Missing uid or email" });
    return;
  }
  if (!text || text.length < 2) {
    res.status(400).json({ error: "Note must be at least 2 characters" });
    return;
  }

  const rows = readGameplayEvents();
  const eventIdx = rows.findIndex((row) => row.eventId === eventId && gameplayEventBelongsToPlayer(row, uid, email));
  if (eventIdx < 0) {
    res.status(404).json({ error: "Game history entry not found" });
    return;
  }

  const noteIdx = (Array.isArray(rows[eventIdx].notes) ? rows[eventIdx].notes : [])
    .findIndex((note) => String(note?.noteId || "") === noteId);
  if (noteIdx < 0) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  rows[eventIdx].notes[noteIdx] = {
    ...rows[eventIdx].notes[noteIdx],
    text,
    updatedAt: new Date().toISOString(),
  };

  if (!writeGameplayEvents(rows)) {
    res.status(500).json({ error: "Could not update note" });
    return;
  }

  res.json({ ok: true, note: rows[eventIdx].notes[noteIdx], event: sanitizeGameplayEventForNotes(rows[eventIdx]) });
});

app.delete("/api/student/game-notes/:eventId/notes/:noteId", (req, res) => {
  const eventId = String(req.params.eventId || "").trim();
  const noteId = String(req.params.noteId || "").trim();
  const uid = String(req.query.uid || req.body?.uid || "").trim();
  const email = normalizeEmail(req.query.email || req.body?.email || "");

  if (!eventId || !noteId) {
    res.status(400).json({ error: "Missing eventId or noteId" });
    return;
  }
  if (!uid && !email) {
    res.status(400).json({ error: "Missing uid or email" });
    return;
  }

  const rows = readGameplayEvents();
  const eventIdx = rows.findIndex((row) => row.eventId === eventId && gameplayEventBelongsToPlayer(row, uid, email));
  if (eventIdx < 0) {
    res.status(404).json({ error: "Game history entry not found" });
    return;
  }

  const currentNotes = Array.isArray(rows[eventIdx].notes) ? rows[eventIdx].notes : [];
  const nextNotes = currentNotes.filter((note) => String(note?.noteId || "") !== noteId);
  if (nextNotes.length === currentNotes.length) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  rows[eventIdx].notes = nextNotes;
  if (!writeGameplayEvents(rows)) {
    res.status(500).json({ error: "Could not delete note" });
    return;
  }

  res.json({ ok: true, event: sanitizeGameplayEventForNotes(rows[eventIdx]) });
});

app.delete("/api/student/game-notes/:eventId", (req, res) => {
  const eventId = String(req.params.eventId || "").trim();
  const uid = String(req.query.uid || req.body?.uid || "").trim();
  const email = normalizeEmail(req.query.email || req.body?.email || "");

  if (!eventId) {
    res.status(400).json({ error: "Missing eventId" });
    return;
  }
  if (!uid && !email) {
    res.status(400).json({ error: "Missing uid or email" });
    return;
  }

  const rows = readGameplayEvents();
  const idx = rows.findIndex((row) => row.eventId === eventId && gameplayEventBelongsToPlayer(row, uid, email));
  if (idx < 0) {
    res.status(404).json({ error: "Game history entry not found" });
    return;
  }

  rows.splice(idx, 1);
  if (!writeGameplayEvents(rows)) {
    res.status(500).json({ error: "Could not delete game history" });
    return;
  }

  res.json({ ok: true, deletedEventId: eventId });
});

app.post("/api/sms/test", async (req, res) => {
  const to = String(req.body?.to || "").trim();
  if (!isValidE164Phone(to)) {
    res.status(400).json({ ok: false, code: "INVALID_PHONE", error: "Phone must be in E.164 format (for example: +27831234567)." });
    return;
  }

  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = String(process.env.TWILIO_FROM_NUMBER || "").trim();

  if (!sid || !token || !from) {
    res.status(503).json({ ok: false, code: "NOT_CONFIGURED", error: "SMS service is not configured." });
    return;
  }

  let twilio;
  try {
    twilio = require("twilio");
  } catch (_error) {
    res.status(503).json({ ok: false, code: "NOT_CONFIGURED", error: "Twilio package is not installed on the server." });
    return;
  }

  try {
    const client = twilio(sid, token);
    const body = `SlidePlay test SMS: your notifications are connected. Time: ${new Date().toISOString()}`;
    const message = await client.messages.create({ from, to, body });
    res.json({ ok: true, sid: message?.sid || null });
  } catch (error) {
    res.status(502).json({ ok: false, code: "SEND_FAILED", error: String(error?.message || "Unable to send SMS.") });
  }
});

app.post("/api/notify-session", async (req, res) => {
  const body = req.body || {};
  const code = String(body.code || "").trim().toUpperCase();
  const sessionName = String(body.sessionName || "a live session").trim();
  const hostName = String(body.hostName || "Teacher").trim();
  const contactsRaw = Array.isArray(body.contacts) ? body.contacts : [];

  if (!code || code.length < 4) {
    res.status(400).json({ error: "Missing or invalid session code" });
    return;
  }

  const contacts = Array.from(new Set(
    contactsRaw
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  ));

  if (!contacts.length) {
    res.status(400).json({ error: "Provide at least one contact" });
    return;
  }

  const baseUrl = getPublicBaseUrl(req);
  const joinUrl = `${baseUrl}/Studentdashboard.html`;
  const emailContacts = contacts
    .map((value) => normalizeEmail(value))
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
  const smsContacts = contacts
    .filter((value) => /^\+[1-9]\d{7,14}$/.test(value));

  const accepted = [];
  const failed = [];

  const canSendEmail = Boolean(process.env.SENDGRID_API_KEY);
  const twilioSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const twilioToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const twilioFrom = String(process.env.TWILIO_FROM_NUMBER || "").trim();
  const canSendSms = Boolean(twilioSid && twilioToken && twilioFrom);

  let twilioClient = null;
  if (canSendSms) {
    try {
      const twilio = require("twilio");
      twilioClient = twilio(twilioSid, twilioToken);
    } catch (_) {
      // SMS remains unavailable when Twilio package is missing.
    }
  }

  const emailHtml = renderEmailTemplate({
    title: "Session Code Invitation",
    intro: `${hostName} invited you to join ${sessionName}.`,
    bodyHtml:
      `<p><strong>Session code:</strong> ${escapeHtml(code)}</p>` +
      `<p>Open the student dashboard and enter this code to join.</p>` +
      `<p><a href="${escapeHtml(joinUrl)}" style="color:#0ea5e9">${escapeHtml(joinUrl)}</a></p>`,
    ctaLabel: "Join Session",
    ctaUrl: joinUrl,
  });

  const emailText =
    `${hostName} invited you to join ${sessionName}.\n` +
    `Session code: ${code}\n` +
    `Join here: ${joinUrl}`;

  for (const email of emailContacts) {
    if (!canSendEmail) {
      failed.push({ contact: email, reason: "Email service is not configured" });
      continue;
    }
    try {
      await sgMail.send({
        to: email,
        from: getSendgridFrom(),
        subject: `Session Code: ${code}`,
        text: emailText,
        html: emailHtml,
      });
      accepted.push({ contact: email, channel: "email" });
    } catch (error) {
      failed.push({ contact: email, reason: getSendgridErrorDetail(error) });
    }
  }

  for (const phone of smsContacts) {
    if (!twilioClient) {
      failed.push({ contact: phone, reason: "SMS service is not configured" });
      continue;
    }
    try {
      const smsBody = `SlidePlay invite from ${hostName}. Session code: ${code}. Join: ${joinUrl}`;
      await twilioClient.messages.create({ from: twilioFrom, to: phone, body: smsBody });
      accepted.push({ contact: phone, channel: "sms" });
    } catch (error) {
      failed.push({ contact: phone, reason: String(error?.message || "SMS send failed") });
    }
  }

  const unmatched = contacts.filter((value) => {
    const normalized = String(value || "").trim();
    return !emailContacts.includes(normalizeEmail(normalized)) && !smsContacts.includes(normalized);
  });
  unmatched.forEach((contact) => {
    failed.push({ contact, reason: "Unsupported contact format (use email or E.164 phone)" });
  });

  res.json({
    ok: true,
    code,
    sent: accepted.length,
    failed: failed.length,
    accepted,
    errors: failed,
  });
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

function normalizeSupportMessages(rawMessages) {
  const rows = Array.isArray(rawMessages)
    ? rawMessages
    : Object.values(rawMessages || {});

  return rows
    .map((item, idx) => {
      const messageId = Number(item?.MessageID || item?.id || idx + 1);
      return {
        MessageID: Number.isFinite(messageId) && messageId > 0 ? messageId : idx + 1,
        Name: String(item?.Name || item?.name || "").trim(),
        Email: normalizeEmail(item?.Email || item?.email || ""),
        Subject: String(item?.Subject || item?.subject || "Help Center Request").trim(),
        MessageText: String(item?.MessageText || item?.messageText || item?.message || "").trim(),
        SourcePage: String(item?.SourcePage || item?.sourcePage || "help.html").trim(),
        Status: String(item?.Status || item?.status || "open").trim().toLowerCase(),
        CreatedAt: normalizeIsoDate(item?.CreatedAt || item?.createdAt || new Date().toISOString()),
        UpdatedAt: normalizeIsoDate(item?.UpdatedAt || item?.updatedAt || ""),
      };
    })
    .filter((item) => item.Name || item.Email || item.MessageText);
}

app.post("/api/support/messages", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = normalizeEmail(req.body?.email || "");
  const messageText = String(req.body?.message || req.body?.messageText || "").trim();
  const subject = String(req.body?.subject || "Help Center Request").trim();
  const sourcePage = String(req.body?.sourcePage || "help.html").trim();

  if (!name || name.length < 2) {
    res.status(400).json({ error: "Please provide your name" });
    return;
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Please provide a valid email" });
    return;
  }

  if (!messageText || messageText.length < 10) {
    res.status(400).json({ error: "Message must be at least 10 characters" });
    return;
  }

  const rows = normalizeSupportMessages(safeReadJson(SUPPORT_FILE, []));
  const nextId = rows.reduce((max, row) => {
    const id = Number(row?.MessageID);
    return Number.isFinite(id) ? Math.max(max, id) : max;
  }, 0) + 1;

  const record = {
    MessageID: nextId,
    Name: name,
    Email: email,
    Subject: subject || "Help Center Request",
    MessageText: messageText,
    SourcePage: sourcePage || "help.html",
    Status: "open",
    CreatedAt: new Date().toISOString(),
  };

  rows.push(record);
  if (!safeWriteJson(SUPPORT_FILE, rows)) {
    res.status(500).json({ error: "Could not save your support request" });
    return;
  }

  res.status(201).json({ ok: true, message: record });
});

app.get("/api/admin/support/messages", ensureAdmin, async (_req, res) => {
  const messages = normalizeSupportMessages(safeReadJson(SUPPORT_FILE, []));
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

  const messages = normalizeSupportMessages(safeReadJson(SUPPORT_FILE, []));
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

  const brandedHtml = renderEmailTemplate({
    title: subject,
    intro: "Message from your SlidePlay admin team.",
    bodyHtml: html || `<p>${normalizeTextToHtml(text)}</p>`,
    ctaLabel: "Open SlidePlay",
    ctaUrl: `${EMAIL_APP_URL}/main.html`,
  });

  for (const email of recipients) {
    try {
      await sgMail.send({
        to: email,
        from: getSendgridFrom(),
        subject,
        text: text || "Message from SlidePlay admin. Open the HTML version for full formatting.",
        html: brandedHtml,
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

app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send([
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /admin-dashboard.html",
    "Disallow: /teacher-manager.html",
    "Disallow: /AcessControl.html",
    `Sitemap: ${toAbsoluteUrl(req, "/sitemap.xml")}`,
    "",
  ].join("\n"));
});

app.get("/sitemap.xml", (req, res) => {
  const urls = buildSitemapEntries(req)
    .map((entry) => {
      return [
        "  <url>",
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`,
        `    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`,
        `    <priority>${escapeXml(entry.priority)}</priority>`,
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  res.type("application/xml");
  res.send([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
  ].join("\n"));
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
