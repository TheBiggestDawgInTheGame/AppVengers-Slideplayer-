require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const http        = require('http');
const express     = require('express');
const multer      = require('multer');
const fs          = require('fs');
const path        = require('path');
const crypto      = require('crypto');
const querystring = require('querystring');
const { Server }  = require('socket.io');

let createAdapter = null;
let createRedisClient = null;
try {
  ({ createAdapter } = require('@socket.io/redis-adapter'));
  ({ createClient: createRedisClient } = require('redis'));
} catch (_) {}

// ── Optional heavy deps (graceful fallback if not installed) ─────────────────
let axios = null;
try { axios = require('axios'); } catch (_) {}

let sgMail = null;
try {
  sgMail = require('@sendgrid/mail');
  if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} catch (_) {}

let GoogleGenerativeAI = null;
let geminiGen = null;
try {
  ({ GoogleGenerativeAI } = require('@google/generative-ai'));
  if (process.env.GEMINI_API_KEY) geminiGen = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} catch (_) {}

let dbModule = null;
let ragModule = null;
try {
  dbModule  = require('./db');
  ragModule = require('./rag');
} catch (e) {
  console.warn('DB/RAG modules not loaded:', e.message);
}

let twilioClient = null;
try {
  const TwilioSDK = require('twilio');
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    twilioClient = TwilioSDK(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    console.log('Twilio SMS: ENABLED');
  } else {
    console.log('Twilio SMS: DISABLED (set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN in .env)');
  }
} catch (_) {
  console.log('Twilio: package not installed, SMS unavailable');
}

const SENDGRID_FROM = 'slideplay.notify@gmail.com';

function buildReceiptHtml({ plan, provider, amount, date, email }) {
  const planLabel = (plan || 'Premium').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const providerLabel = { payfast: 'PayFast', coinbase_commerce: 'Crypto (Coinbase)', stripe: 'Stripe' }[provider] || provider || 'Card';
  const amountStr = amount ? `R${Number(amount).toFixed(2)}` : '';
  const dateStr = date || new Date().toLocaleDateString('en-ZA', { year:'numeric', month:'long', day:'numeric' });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;background:#111827;border-radius:16px;overflow:hidden;border:1px solid rgba(139,92,246,0.25);">
  <tr><td style="background:linear-gradient(135deg,#8b5cf6,#06b6d4);padding:32px 40px;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:1.8rem;letter-spacing:2px;">SlidePlay</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:0.95rem;">Payment Receipt</p>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="color:#3dffc0;font-size:1.05rem;font-weight:600;margin:0 0 20px;">&#10003; Payment Confirmed</p>
    <p style="color:#94a3b8;font-size:0.9rem;margin:0 0 24px;">Thank you! Your premium access is now active.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;overflow:hidden;">
      <tr style="background:rgba(255,255,255,0.04);"><td style="padding:12px 18px;color:#7a8499;font-size:0.82rem;width:40%;">PLAN</td><td style="padding:12px 18px;color:#e2e8f0;font-size:0.9rem;font-weight:600;">${planLabel}</td></tr>
      ${amountStr ? `<tr><td style="padding:12px 18px;color:#7a8499;font-size:0.82rem;border-top:1px solid rgba(255,255,255,0.05);">AMOUNT</td><td style="padding:12px 18px;color:#e2e8f0;font-size:0.9rem;font-weight:600;border-top:1px solid rgba(255,255,255,0.05);">${amountStr}</td></tr>` : ''}
      <tr><td style="padding:12px 18px;color:#7a8499;font-size:0.82rem;border-top:1px solid rgba(255,255,255,0.05);">PAYMENT METHOD</td><td style="padding:12px 18px;color:#e2e8f0;font-size:0.9rem;border-top:1px solid rgba(255,255,255,0.05);">${providerLabel}</td></tr>
      <tr><td style="padding:12px 18px;color:#7a8499;font-size:0.82rem;border-top:1px solid rgba(255,255,255,0.05);">DATE</td><td style="padding:12px 18px;color:#e2e8f0;font-size:0.9rem;border-top:1px solid rgba(255,255,255,0.05);">${dateStr}</td></tr>
      <tr><td style="padding:12px 18px;color:#7a8499;font-size:0.82rem;border-top:1px solid rgba(255,255,255,0.05);">ACCOUNT</td><td style="padding:12px 18px;color:#e2e8f0;font-size:0.9rem;border-top:1px solid rgba(255,255,255,0.05);">${email || ''}</td></tr>
    </table>
    <p style="margin:28px 0 0;color:#94a3b8;font-size:0.82rem;text-align:center;">Questions? Reply to this email or visit <a href="http://localhost:3000" style="color:#8b5cf6;">SlidePlay</a>.</p>
  </td></tr>
  <tr><td style="background:rgba(0,0,0,0.3);padding:18px 40px;text-align:center;">
    <p style="margin:0;color:#4a5568;font-size:0.75rem;">SlidePlay &mdash; Gamified Learning Platform &bull; This is an automated receipt, please do not reply directly.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function sendReceipt(toEmail, { plan, provider, amount }) {
  if (!sgMail) {
    return { ok: false, code: 'NOT_CONFIGURED', channel: 'email', error: 'SendGrid is not configured.' };
  }
  if (!toEmail) {
    return { ok: false, code: 'MISSING_RECIPIENT', channel: 'email', error: 'Recipient email is required.' };
  }
  try {
    await sgMail.send({
      to: toEmail,
      from: { name: 'SlidePlay', email: SENDGRID_FROM },
      subject: `Your SlidePlay Receipt — ${(plan || 'Premium').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())} Plan`,
      html: buildReceiptHtml({ plan, provider, amount, email: toEmail }),
      text: `SlidePlay Receipt\n\nPlan: ${plan}\nProvider: ${provider}\nAmount: ${amount ? 'R'+Number(amount).toFixed(2) : 'N/A'}\nYour premium access is now active.\n\nThank you for using SlidePlay!`,
    });
    console.log('Receipt email sent to', toEmail);
    return { ok: true, code: 'SENT', channel: 'email', to: toEmail, provider: 'sendgrid' };
  } catch (e) {
    console.warn('Receipt email failed (non-fatal):', e.message);
    return { ok: false, code: 'SEND_FAILED', channel: 'email', to: toEmail, provider: 'sendgrid', error: e.message };
  }
}

async function sendSms(to, body) {
  if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
    return { ok: false, code: 'NOT_CONFIGURED', channel: 'sms', error: 'Twilio is not fully configured.' };
  }
  if (!to) {
    return { ok: false, code: 'MISSING_RECIPIENT', channel: 'sms', error: 'Recipient phone number is required.' };
  }
  const phone = String(to).replace(/\s/g, '');
  if (!phone.startsWith('+')) {
    return { ok: false, code: 'INVALID_PHONE', channel: 'sms', to: phone, error: 'Phone must be in E.164 format (+1234567890).' };
  }
  try {
    await twilioClient.messages.create({ body, from: process.env.TWILIO_PHONE_NUMBER, to: phone });
    console.log('SMS sent to', phone);
    return { ok: true, code: 'SENT', channel: 'sms', to: phone, provider: 'twilio' };
  } catch (e) {
    console.warn('SMS send failed (non-fatal):', e.message);
    return { ok: false, code: 'SEND_FAILED', channel: 'sms', to: phone, provider: 'twilio', error: e.message };
  }
}

const HUGGING_FACE_API_KEY = process.env.HUGGING_FACE_API_KEY || process.env.HF_API_TOKEN || '';
const HUGGING_FACE_MODEL = process.env.HUGGING_FACE_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3';
const HUGGING_FACE_API_URL = `https://api-inference.huggingface.co/models/${HUGGING_FACE_MODEL}`;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'llama-3.2-11b-vision-preview';
const SOCKET_IO_USE_REDIS = process.env.SOCKET_IO_USE_REDIS !== 'false';
const SOCKET_IO_REDIS_URL = process.env.SOCKET_IO_REDIS_URL || '';
const SOCKET_IO_REQUIRE_REDIS = process.env.SOCKET_IO_REQUIRE_REDIS === 'true';
const FREE_WEEKLY_LIMIT = 5;

const app        = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3000;
const workspaceDir = path.join(__dirname, '..');
const uploadDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const allowedExtensions = new Set(['.pdf', '.ppt', '.pptx', '.txt', '.md', '.doc', '.docx']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.has(ext)) {
    cb(new Error('Unsupported file type. Allowed: PDF, PPT/PPTX, TXT, MD, DOC/DOCX'));
    return;
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 20
  }
});

// --- Firebase Admin Setup ---
let admin = null;
try {
  const serviceAccountPath = path.join(__dirname, '../finsished front end/Testing2-SlidePlay/firebase-service-account.json');
  if (fs.existsSync(serviceAccountPath)) {
    admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(require(serviceAccountPath)),
        databaseURL: process.env.FIREBASE_DB_URL || ''
      });
    }
  }
} catch (e) {
  console.warn('Firebase Admin not initialized:', e.message);
}

// ── JSON body parsing ───────────────────────────────────────────────────────
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    // Preserve raw body for Coinbase Commerce webhook HMAC verification
    if (req.path === '/api/crypto/webhook') req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true })); // For PayFast IPN

// ── Upload limit helpers ──────────────────────────────────────────────────────
const UPLOAD_LIMITS_FILE = path.join(uploadDir, '_upload_limits.json');

function getWeekKey() {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

function loadUploadLimits() {
  try {
    if (fs.existsSync(UPLOAD_LIMITS_FILE)) {
      return JSON.parse(fs.readFileSync(UPLOAD_LIMITS_FILE, 'utf8'));
    }
  } catch (_) {}
  return {};
}

function saveUploadLimits(limits) {
  try { fs.writeFileSync(UPLOAD_LIMITS_FILE, JSON.stringify(limits, null, 2)); } catch (_) {}
}

function getUserWeeklyCount(uid) {
  const limits = loadUploadLimits();
  const entry = limits[uid];
  if (!entry || entry.week !== getWeekKey()) return 0;
  return entry.count || 0;
}

function incrementUserWeeklyCount(uid) {
  const limits = loadUploadLimits();
  const week = getWeekKey();
  if (!limits[uid] || limits[uid].week !== week) limits[uid] = { week, count: 0 };
  limits[uid].count += 1;
  saveUploadLimits(limits);
}

async function isUserPremium(uid) {
  if (!admin) return false;
  try {
    const snap = await admin.database().ref(`users/${uid}/subscription`).get();
    if (!snap.exists()) return false;
    const sub = snap.val();
    if (!sub || sub.status !== 'active') return false;
    const premiumPlans = new Set(['student_elite', 'student_premium', 'pro', 'school']);
    return premiumPlans.has(sub.plan);
  } catch (_) { return false; }
}

// ── Gemini proxy (keeps API key server-side) ──────────────────────────────────
app.post('/api/gemini-proxy', async (req, res) => {
  const { prompt, image } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 10) {
    return res.status(400).json({ error: 'Invalid or missing prompt.' });
  }

  const isVision = !!(image && image.data && image.mimeType);
  const systemMsg = 'You are a strict academic assessment designer. Never generate trivial questions. Always challenge the student to think critically about the material.';

  // ── Groq vision (preferred for image prompts when available) ────────────
  if (GROQ_API_KEY && isVision) {
    try {
      const safePrompt = prompt.slice(0, 16000);
      const imageDataUrl = `data:${image.mimeType};base64,${image.data}`;
      const upstream = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: GROQ_VISION_MODEL,
          messages: [
            { role: 'system', content: systemMsg },
            {
              role: 'user',
              content: [
                { type: 'text', text: safePrompt },
                { type: 'image_url', image_url: { url: imageDataUrl } }
              ]
            }
          ],
          temperature: 0.5,
          max_tokens: 4096
        })
      });
      if (!upstream.ok) {
        const errData = await upstream.json().catch(() => ({}));
        console.warn('[Groq Vision] error:', errData?.error?.message || upstream.status);
      } else {
        const data = await upstream.json();
        const text = data?.choices?.[0]?.message?.content || '';
        if (text) return res.json({ text });
      }
    } catch (err) {
      console.warn('[Groq Vision] request failed, falling back to Gemini:', err.message);
    }
  }

  // ── Groq (text only — preferred when key is set and no image) ─────────────
  if (GROQ_API_KEY && !isVision) {
    try {
      const safePrompt = prompt.slice(0, 24000);
      const upstream = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user',   content: safePrompt }
          ],
          temperature: 0.7,
          max_tokens: 8192
        })
      });
      if (!upstream.ok) {
        const errData = await upstream.json().catch(() => ({}));
        // Fall through to Gemini on error
        console.warn('[Groq] error:', errData?.error?.message || upstream.status);
      } else {
        const data = await upstream.json();
        const text = data?.choices?.[0]?.message?.content || '';
        return res.json({ text });
      }
    } catch (err) {
      console.warn('[Groq] request failed, falling back to Gemini:', err.message);
    }
  }

  // ── Gemini (text + vision fallback) ──────────────────────────────────────
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: 'No AI service configured. Set GROQ_API_KEY or GEMINI_API_KEY in .env' });
  }

  let parts;
  if (isVision) {
    parts = [
      { text: prompt },
      { inline_data: { mime_type: image.mimeType, data: image.data } }
    ];
  } else {
    parts = [{ text: prompt.slice(0, 24000) }];
  }

  try {
    const upstream = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        systemInstruction: { parts: [{ text: systemMsg }] },
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
      })
    });
    if (!upstream.ok) {
      const errData = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({ error: errData?.error?.message || 'Gemini API error' });
    }
    const data = await upstream.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: 'Proxy request failed: ' + err.message });
  }
});

// --- Per-user upload directory helper ---
function getUserUploadDir(uid) {
  const safeUid = String(uid).replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.join(uploadDir, safeUid);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// --- Per-user upload endpoint ---
app.post('/api/user-upload', upload.array('slides', 20), async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'Missing user ID (uid)' });
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded.' });
  }

  // --- Server-side upload limit check ---
  const premium = await isUserPremium(uid);
  if (!premium) {
    const weeklyCount = getUserWeeklyCount(uid);
    if (weeklyCount >= FREE_WEEKLY_LIMIT) {
      for (const file of req.files) { try { fs.unlinkSync(file.path); } catch (_) {} }
      return res.status(429).json({
        error: `Free plan limit reached. You have used ${weeklyCount}/${FREE_WEEKLY_LIMIT} uploads this week. Upgrade to Premium for unlimited uploads.`,
        limitReached: true,
        used: weeklyCount,
        max: FREE_WEEKLY_LIMIT
      });
    }
  }

  // Move files to user directory
  const userDir = getUserUploadDir(uid);
  const files = [];
  for (const file of req.files) {
    const dest = path.join(userDir, file.filename);
    fs.renameSync(file.path, dest);
    files.push({
      originalName: file.originalname,
      storedName: file.filename,
      size: file.size,
      path: dest
    });
  }
  // Extract and save parsed content
  let quizData = [];
  let aiGenerated = false;
  try {
    const textResults = await Promise.all(files.map(extractAllText));
    const combinedText = textResults.filter(Boolean).join('\n\n---\n\n');
    if (combinedText.trim() && HUGGING_FACE_API_KEY) {
      try {
        const hfQuiz = await generateQuizWithHuggingFace(combinedText, 8);
        if (hfQuiz && hfQuiz.length >= 3) {
          quizData = hfQuiz;
          aiGenerated = true;
        }
      } catch (hfErr) {
        console.warn('Hugging Face quiz generation failed, using fallback:', hfErr.message);
      }
    }
    if (quizData.length < 3) {
      quizData = generateQuizData(files);
    }
  } catch (extractErr) {
    console.warn('Text extraction error, using fallback:', extractErr.message);
    quizData = generateFilenameQuestions(files);
  }
  // Save metadata and quizData to user dir
  fs.writeFileSync(path.join(userDir, 'files.json'), JSON.stringify(files, null, 2));
  fs.writeFileSync(path.join(userDir, 'quizData.json'), JSON.stringify(quizData, null, 2));

  // Increment weekly upload counter for free-plan users
  if (!premium) incrementUserWeeklyCount(uid);

  res.json({
    message: aiGenerated
      ? `AI quiz generated from your slides (${files.length} file${files.length > 1 ? 's' : ''} analysed).`
      : `${files.length} file(s) uploaded successfully.`,
    files: files.map(f => ({ originalName: f.originalName, storedName: f.storedName, size: f.size })),
    quizData,
    aiGenerated
  });
});

// --- Per-user retrieval endpoint ---
app.get('/api/user-upload', async (req, res) => {
  const uid = req.query.uid;
  if (!uid) return res.status(400).json({ error: 'Missing user ID (uid)' });
  const userDir = getUserUploadDir(uid);
  try {
    const files = JSON.parse(fs.readFileSync(path.join(userDir, 'files.json'), 'utf8'));
    const quizData = JSON.parse(fs.readFileSync(path.join(userDir, 'quizData.json'), 'utf8'));
    res.json({ files, quizData });
  } catch (e) {
    res.status(404).json({ error: 'No uploaded content found for this user.' });
  }
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  if (origin && /^http:\/\/localhost:\d+$/.test(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.static(workspaceDir));

// Clean /app route so friends can open https://<host>/app/Studentdashboard.html
const frontendDir = path.join(__dirname, '../finsished front end/Testing2-SlidePlay');
app.use('/app', express.static(frontendDir));

// /join shortcut → student dashboard
app.get('/join', (_req, res) => {
  res.redirect('/app/Studentdashboard.html');
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/slide_upload', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/games', (_req, res) => {
  res.sendFile(path.join(__dirname, 'games.html'));
});

app.get('/quiz_game', (_req, res) => {
  res.redirect('/games/jeopardy-3d/index.html');
});

// ── Convenience routes for the main app (avoids file:// protocol issues) ─────
// Using redirects so relative asset paths (JS, CSS, images) resolve correctly.
const APP_BASE = '/finsished%20front%20end/Testing2-SlidePlay';
const appRoute = (route, file) =>
  app.get(route, (_req, res) => res.redirect(APP_BASE + '/' + file));

appRoute('/login',          'login.html');
appRoute('/signup',         'signup.html');
appRoute('/student',        'Studentdashboard.html');
appRoute('/teacher',        'teacher.html');
appRoute('/upload',         'UploadPage.html');
appRoute('/payment',        'payment.html');
appRoute('/library',        'library.html');
appRoute('/choose-exp',     'choose_exp.html');
appRoute('/billing',        'billing.html');
appRoute('/access-control', 'AcessControl.html');
appRoute('/analytics',      'AnalyticsPage.html');

// ── Teacher registration code verification ───────────────────────────────────
app.post('/api/verify-teacher-code', (req, res) => {
  const { code } = req.body || {};
  const expected = process.env.TEACHER_CODE || '';
  if (!expected) {
    // No code configured — deny by default (admin must set TEACHER_CODE in .env)
    return res.status(403).json({ ok: false, reason: 'Teacher registration is not open.' });
  }
  if (!code || code.trim().toUpperCase() !== expected.trim().toUpperCase()) {
    return res.status(403).json({ ok: false, reason: 'Invalid teacher code.' });
  }
  res.json({ ok: true });
});

function getOriginalName(file) {
  return String(file?.originalname || file?.originalName || 'upload.txt');
}

function getFilePath(file) {
  return typeof file?.path === 'string' ? file.path : '';
}

function readTextFromFile(file) {
  const originalName = getOriginalName(file);
  const ext = path.extname(originalName).toLowerCase();
  if (ext !== '.txt' && ext !== '.md') {
    return '';
  }

  try {
    const filePath = getFilePath(file);
    if (!filePath) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch (_error) {
    return '';
  }
}

async function extractTextFromPdf(filePath) {
  try {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return (data.text || '').replace(/\s+/g, ' ').trim();
  } catch (err) {
    console.warn('PDF extraction failed:', err.message);
    return '';
  }
}

async function extractTextFromDocx(filePath) {
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || '';
  } catch (err) {
    console.warn('DOCX extraction failed:', err.message);
    return '';
  }
}

function extractTextFromPptx(filePath) {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(filePath);
    const slideEntries = zip.getEntries()
      .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
      .sort((a, b) => a.entryName.localeCompare(b.entryName));
    return slideEntries.map((entry) => {
      const xml = entry.getData().toString('utf8');
      const matches = xml.match(/<a:t[^>]*?>([^<]+)<\/a:t>/g) || [];
      return matches.map((m) => m.replace(/<[^>]*?>/g, '').trim()).filter(Boolean).join(' ');
    }).filter(Boolean).join('\n');
  } catch (err) {
    console.warn('PPTX extraction failed:', err.message);
    return '';
  }
}

async function extractAllText(file) {
  const originalName = getOriginalName(file);
  const ext = path.extname(originalName).toLowerCase();
  const filePath = getFilePath(file);
  if (!filePath) return '';
  switch (ext) {
    case '.txt':
    case '.md':
      return readTextFromFile(file);
    case '.pdf':
      return extractTextFromPdf(filePath);
    case '.docx':
    case '.doc':
      return extractTextFromDocx(filePath);
    case '.pptx':
    case '.ppt':
      return extractTextFromPptx(filePath);
    default:
      return '';
  }
}

async function generateQuizWithHuggingFace(combinedText, targetCount) {
  const MAX_CHARS = 50000;
  const text = combinedText.length > MAX_CHARS
    ? combinedText.slice(0, MAX_CHARS) + '\n[Content truncated - first 50,000 characters used]'
    : combinedText;

  const count = Math.min(Math.max(targetCount, 5), 15);

  const prompt = `You are an expert educator. Read the following content from student slides and generate exactly ${count} multiple-choice quiz questions that test genuine understanding of the material. Questions must be specific to concepts, facts, or ideas found in the content.

Rules:
- Each question must have exactly 4 answer options
- Only one option is correct; the other three are plausible but clearly wrong to someone who studied the content
- Cover different concepts spread throughout the material
- Do NOT ask about file names, formatting, or meta information about the slides themselves
- Questions should range from factual recall to application of concepts

Return ONLY a valid JSON array with no markdown, no code blocks, and no explanation text:
[{"question":"...","options":["...","...","...","..."],"correct":0}]

The "correct" field is the 0-based index of the correct option in the options array.

Slide content:
${text}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  let response;
  try {
    response = await fetch(HUGGING_FACE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HUGGING_FACE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 1400,
          temperature: 0.2,
          return_full_text: false
        },
        options: {
          wait_for_model: true,
          use_cache: false
        }
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Hugging Face API error (${response.status}): ${errText.slice(0, 180)}`);
  }

  const payload = await response.json();
  const responseText = Array.isArray(payload)
    ? String(payload[0]?.generated_text || '')
    : String(payload?.generated_text || payload?.error || '');

  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Hugging Face response contained no JSON array');

  const parsed = JSON.parse(jsonMatch[0]);
  const valid = parsed.filter(
    (q) =>
      q &&
      typeof q.question === 'string' &&
      q.question.length > 10 &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      typeof q.correct === 'number' &&
      q.correct >= 0 &&
      q.correct <= 3
  );

  if (valid.length < 3) throw new Error(`Only ${valid.length} valid questions returned by Hugging Face`);
  return valid;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 5);
}

function pickFallbackWrongOptions(correct, pool) {
  const wrong = [];
  for (const candidate of pool) {
    if (candidate !== correct && !wrong.includes(candidate)) {
      wrong.push(candidate);
    }
    if (wrong.length === 3) break;
  }

  const generic = ['context', 'framework', 'analysis', 'concept', 'overview', 'structure'];
  for (const candidate of generic) {
    if (candidate !== correct && !wrong.includes(candidate)) {
      wrong.push(candidate);
    }
    if (wrong.length === 3) break;
  }

  return wrong.slice(0, 3);
}

function generateQuestionFromSentence(sentence, keywordPool) {
  const clean = sentence.replace(/\s+/g, ' ').trim();
  if (clean.length < 40 || clean.length > 220) {
    return null;
  }

  const words = tokenize(clean);
  const unique = [...new Set(words)];
  if (unique.length < 4) {
    return null;
  }

  const correct = unique[0];
  const wrongOptions = pickFallbackWrongOptions(correct, keywordPool);
  if (wrongOptions.length < 3) {
    return null;
  }

  const masked = clean.replace(new RegExp(`\\b${correct}\\b`, 'i'), '_____');
  const options = [correct, ...wrongOptions].map((opt) => {
    return opt.charAt(0).toUpperCase() + opt.slice(1);
  });

  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  return {
    question: `Which word best completes this statement? ${masked}`,
    options,
    correct: options.findIndex((opt) => opt.toLowerCase() === correct)
  };
}

function generateFilenameQuestions(files) {
  return files.slice(0, 8).map((file) => {
    const originalName = getOriginalName(file);
    const ext = path.extname(originalName).slice(1).toLowerCase() || 'file';
    const cleanName = path.basename(originalName, path.extname(originalName));
    const options = ['PDF', 'PPTX', 'DOCX', 'TXT'];
    const upperExt = ext.toUpperCase();

    if (!options.includes(upperExt)) {
      options[3] = upperExt;
    }

    const correct = options.indexOf(upperExt);
    const safeCorrect = correct >= 0 ? correct : 3;

    return {
      question: `What is the file type of "${cleanName}"?`,
      options,
      correct: safeCorrect
    };
  });
}

function generateQuizData(files) {
  const combinedText = files
    .map((file) => readTextFromFile(file))
    .filter(Boolean)
    .join('\n');

  if (!combinedText.trim()) {
    return generateFilenameQuestions(files);
  }

  const sentences = combinedText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const keywordPool = [...new Set(tokenize(combinedText))];
  const generated = [];

  for (const sentence of sentences) {
    const q = generateQuestionFromSentence(sentence, keywordPool);
    if (q) {
      generated.push(q);
    }
    if (generated.length >= 12) break;
  }

  if (generated.length >= 4) {
    return generated;
  }

  return [...generated, ...generateFilenameQuestions(files)].slice(0, 10);
}

app.post('/api/upload', (req, res) => {
  upload.array('slides', 20)(req, res, async (err) => {
    if (err) {
      res.status(400).json({ message: err.message || 'Upload failed.' });
      return;
    }

    if (!req.files || req.files.length === 0) {
      res.status(400).json({ message: 'No files uploaded.' });
      return;
    }

    const files = req.files.map((file) => ({
      originalName: file.originalname,
      storedName: file.filename,
      size: file.size,
      path: file.path
    }));

    let quizData = [];
    let aiGenerated = false;

    try {
      const textResults = await Promise.all(files.map(extractAllText));
      const combinedText = textResults.filter(Boolean).join('\n\n---\n\n');

      if (combinedText.trim() && HUGGING_FACE_API_KEY) {
        try {
          const hfQuiz = await generateQuizWithHuggingFace(combinedText, 8);
          if (hfQuiz && hfQuiz.length >= 3) {
            quizData = hfQuiz;
            aiGenerated = true;
          }
        } catch (hfErr) {
          console.warn('Hugging Face quiz generation failed, using fallback:', hfErr.message);
        }
      }

      if (quizData.length < 3) {
        quizData = generateQuizData(files);
      }
    } catch (extractErr) {
      console.warn('Text extraction error, using fallback:', extractErr.message);
      quizData = generateFilenameQuestions(files);
    }

    res.json({
      message: aiGenerated
        ? `AI quiz generated from your slides (${files.length} file${files.length > 1 ? 's' : ''} analysed).`
        : `${files.length} file(s) uploaded successfully.`,
      files: files.map((file) => ({
        originalName: file.originalName,
        storedName: file.storedName,
        size: file.size
      })),
      quizData,
      aiGenerated
    });
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    huggingFaceEnabled: !!HUGGING_FACE_API_KEY,
    model: HUGGING_FACE_MODEL,
    version: '2.1'
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uploadDir, socketAdapter: socketAdapterMode });
});

app.get('/api/ready', (_req, res) => {
  const readiness = {
    ok: true,
    socketAdapter: socketAdapterMode,
    requireRedis: SOCKET_IO_REQUIRE_REDIS,
    redisConfigured: !!SOCKET_IO_REDIS_URL,
  };

  if (SOCKET_IO_REQUIRE_REDIS && socketAdapterMode !== 'redis') {
    readiness.ok = false;
    readiness.error = !SOCKET_IO_REDIS_URL
      ? 'Redis is required for multiplayer readiness, but SOCKET_IO_REDIS_URL is not set.'
      : 'Redis is required for multiplayer readiness, but the Socket.IO Redis adapter is not connected.';
    return res.status(503).json(readiness);
  }

  res.json(readiness);
});

// ── Real-time multiplayer (socket.io) ────────────────────────────────────────
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const rooms = new Map();
let socketAdapterMode = 'memory';

async function configureSocketIoAdapter() {
  if (!SOCKET_IO_USE_REDIS) {
    console.log('Socket.IO adapter: in-memory (SOCKET_IO_USE_REDIS=false)');
    return;
  }

  if (!SOCKET_IO_REDIS_URL) {
    console.log('Socket.IO adapter: in-memory (set SOCKET_IO_REDIS_URL for multi-instance scaling)');
    return;
  }

  if (!createAdapter || !createRedisClient) {
    console.warn('Socket.IO Redis adapter packages are missing; using in-memory adapter. Run: npm i @socket.io/redis-adapter redis');
    return;
  }

  try {
    const pubClient = createRedisClient({ url: SOCKET_IO_REDIS_URL });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (e) => console.warn('Redis pub client error:', e.message));
    subClient.on('error', (e) => console.warn('Redis sub client error:', e.message));

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    socketAdapterMode = 'redis';
    console.log('Socket.IO adapter: redis enabled');
  } catch (e) {
    console.warn('Socket.IO Redis adapter init failed; continuing with in-memory adapter:', e.message);
  }
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

io.on('connection', (socket) => {
  // ── Create a new room ──────────────────────────────────────────────────────
  socket.on('create-room', ({ gameLabel, gameMode, hostUID, hostName } = {}) => {
    let code;
    let attempts = 0;
    do { code = generateRoomCode(); attempts++; } while (rooms.has(code) && attempts < 100);
    const safeMode = ['solo','multiplayer','tournament'].includes(gameMode) ? gameMode : 'multiplayer';
    rooms.set(code, {
      code,
      gameLabel: String(gameLabel || 'Game').slice(0, 64),
      gameMode: safeMode,
      hostUID: hostUID || null,
      hostName: hostName || 'Host',
      players: [{ id: socket.id, playerIndex: 1, finalScore: null, name: hostName || 'Player 1' }],
      status: 'waiting',
      createdAt: Date.now()
    });
    socket.join(code);
    socket.emit('room-created', { code });
    // Persist to DB
    if (dbModule) {
      dbModule.query(
        `INSERT INTO GameSessions (SessionCode, [Status], GameType, GameMode)
         VALUES (@code, 'waiting', @gameType, @gameMode)`,
        { code, gameType: String(gameLabel || 'Game').slice(0,64), gameMode: safeMode }
      ).catch(e => console.warn('create-room DB error:', e.message));
    }
  });

  // ── Join an existing room ──────────────────────────────────────────────────
  socket.on('join-room', ({ code, playerName } = {}) => {
    const safeCode = String(code || '').trim().toUpperCase().slice(0, 4);
    const room = rooms.get(safeCode);
    if (!room) {
      socket.emit('join-error', { message: 'Room not found. Check the code and try again.' });
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('join-error', { message: 'Room is full.' });
      return;
    }
    if (room.status !== 'waiting') {
      socket.emit('join-error', { message: 'Game already started.' });
      return;
    }
    room.players.push({ id: socket.id, playerIndex: 2, finalScore: null, name: playerName || 'Player 2' });
    room.status = 'playing';
    socket.join(safeCode);
    // Tell P1 the opponent joined (they get playerIndex 1)
    socket.to(safeCode).emit('room-ready', { playerIndex: 1, code: safeCode });
    // Tell P2 they joined (they get playerIndex 2)
    socket.emit('room-ready', { playerIndex: 2, code: safeCode });
  });

  // ── Live score update (broadcast to opponent only) ─────────────────────────
  socket.on('score-update', ({ code, score } = {}) => {
    const safeCode = String(code || '').slice(0, 4);
    if (rooms.has(safeCode)) {
      socket.to(safeCode).emit('opponent-score', { score: Number(score) || 0 });
    }
  });

  // ── Round finished ─────────────────────────────────────────────────────────
  socket.on('round-end', ({ code, score } = {}) => {
    const safeCode = String(code || '').slice(0, 4);
    const room = rooms.get(safeCode);
    if (!room) return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;
    player.finalScore = Number(score) || 0;
    socket.to(safeCode).emit('opponent-done', { score: player.finalScore });
    if (room.players.every((p) => p.finalScore !== null)) {
      const p1 = room.players.find((p) => p.playerIndex === 1);
      const p2 = room.players.find((p) => p.playerIndex === 2);
      io.to(safeCode).emit('game-results', {
        p1: p1 ? p1.finalScore : 0,
        p2: p2 ? p2.finalScore : 0
      });
      // Determine winner
      const allP = room.players.filter(p => p.finalScore !== null);
      const winner = allP.reduce((best, p) => (!best || p.finalScore > best.finalScore) ? p : best, null);
      // Persist result to DB — update SessionPlayers with scores
      if (dbModule) {
        // Update session status
        dbModule.query(
          `UPDATE GameSessions SET [Status]='ended', EndedAt=SYSUTCDATETIME() WHERE SessionCode=@code`,
          { code: safeCode }
        ).catch(e => console.warn('round-end session DB error:', e.message));
        // Upsert player scores into SessionPlayers
        for (const p of allP) {
          if (p.name) {
            dbModule.query(
              `UPDATE SessionPlayers SET TotalScore=@score WHERE DisplayName=@name AND SessionID=(
                SELECT TOP 1 SessionID FROM GameSessions WHERE SessionCode=@code
              )`,
              { score: p.finalScore, name: p.name, code: safeCode }
            ).catch(() => {});
          }
        }
      }
      setTimeout(() => rooms.delete(safeCode), 120000);
    }
  });

  // ── Disconnect cleanup ─────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    for (const [code, room] of rooms.entries()) {
      const idx = room.players.findIndex((p) => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        io.to(code).emit('opponent-disconnected');
        if (room.players.length === 0) rooms.delete(code);
        break;
      }
    }
  });
});

// Periodically clean up stale rooms (older than 2 hours)
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [code, room] of rooms.entries()) {
    if (room.createdAt < cutoff) rooms.delete(code);
  }
}, 30 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT & DB ROUTES (merged from Testing2-SlidePlay/server.js)
// ═══════════════════════════════════════════════════════════════════════════

// ── AI Hint Endpoint for Escape Game ─────────────────────────────────────────
app.post('/api/ai-hint', async (req, res) => {
  const { game, context } = req.body;
  if (!game || !context) return res.status(400).json({ error: 'Missing game or context' });
  if (!geminiGen) return res.json({ hint: 'AI is currently unavailable. Try again soon!' });
  let prompt = 'You are an expert escape room coach AI. The player is in a 3D escape room game. Based on their current state, provide a helpful, context-aware hint. Be concise, avoid spoilers, and encourage learning.\n';
  prompt += `Game: ${game}\n`;
  prompt += `Level: ${context.level}\n`;
  prompt += `Inventory: ${Array.isArray(context.inv) ? context.inv.join(', ') : ''}\n`;
  prompt += `Solved: ${Array.isArray(context.solved) ? context.solved.join(', ') : ''}\n`;
  prompt += `Time left: ${context.secs}s\n`;
  prompt += 'Hint:';
  try {
    const model = geminiGen.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    const hint = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      || 'Try examining your surroundings for clues you may have missed.';
    res.json({ hint });
  } catch (e) {
    console.error('AI hint error:', e);
    res.json({ hint: 'AI is currently unavailable. Try again soon!' });
  }
});

// ── PayFast helper ────────────────────────────────────────────────────────────
function generatePayFastSignature(data, passphrase) {
  let pfData = { ...data };
  Object.keys(pfData).forEach((k) => {
    if (pfData[k] === undefined || pfData[k] === null) delete pfData[k];
  });
  let pfString = Object.keys(pfData)
    .sort()
    .map((key) => `${key}=${encodeURIComponent(pfData[key])}`)
    .join('&');
  if (passphrase) pfString += `&passphrase=${encodeURIComponent(passphrase)}`;
  return crypto.createHash('md5').update(pfString).digest('hex');
}

// ── PayFast: create payment URL ───────────────────────────────────────────────
app.post('/api/payfast/init', (req, res) => {
  const { amount, item_name, user_email, plan, return_url, cancel_url, notify_url } = req.body;
  const pf_merchant_id  = process.env.PAYFAST_MERCHANT_ID;
  const pf_merchant_key = process.env.PAYFAST_MERCHANT_KEY;
  const pf_passphrase   = process.env.PAYFAST_PASSPHRASE;
  const pf_url          = process.env.PAYFAST_URL || 'https://www.payfast.co.za/eng/process';

  if (!pf_merchant_id || !pf_merchant_key) {
    return res.status(500).json({ error: 'PayFast merchant credentials not set.' });
  }

  const appBase = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
  const pfBase  = `${appBase}/finsished%20front%20end/Testing2-SlidePlay`;
  const pfData = {
    merchant_id:   pf_merchant_id,
    merchant_key:  pf_merchant_key,
    return_url:    return_url  || `${pfBase}/payment.html?payfast=success`,
    cancel_url:    cancel_url  || `${pfBase}/payment.html?payfast=cancel`,
    notify_url:    notify_url  || `${appBase}/api/payfast/ipn`,
    amount:        Number(amount).toFixed(2),
    item_name:     item_name || plan || 'SlidePlay Plan',
    email_address: user_email || '',
    custom_str1:   plan || '',
    custom_str2:   req.body.phone || '',
  };
  pfData.signature = generatePayFastSignature(pfData, pf_passphrase);
  const payfastUrl = `${pf_url}?${querystring.stringify(pfData)}`;
  res.json({ url: payfastUrl });
});

// ── DB helper: save payment + upsert subscription ────────────────────────────
async function savePaymentStatus(email, plan, status, provider = 'payfast', amountZAR = 0) {
  if (!dbModule) { console.warn('savePaymentStatus: DB not available'); return; }
  const { query: dbQuery } = dbModule;
  try {
    const userRes = await dbQuery('SELECT FirebaseUID FROM Users WHERE Email = @email', { email });
    if (!userRes.recordset.length) { console.warn('savePaymentStatus: user not found for', email); return; }
    const uid = userRes.recordset[0].FirebaseUID;

    await dbQuery(
      `INSERT INTO Payments (FirebaseUID, Plan, AmountZAR, BillingCycle, Provider, Status)
       VALUES (@uid, @plan, @amount, 'monthly', @provider, @status)`,
      { uid, plan, amount: amountZAR, provider, status: status === 'COMPLETE' ? 'succeeded' : 'pending' }
    );

    if (status === 'COMPLETE') {
      await dbQuery(
        `MERGE Subscriptions AS target
         USING (SELECT @uid AS FirebaseUID) AS src ON target.FirebaseUID = src.FirebaseUID
         WHEN MATCHED THEN
           UPDATE SET Plan = @plan, Status = 'active', RenewsAt = DATEADD(month, 1, SYSUTCDATETIME())
         WHEN NOT MATCHED THEN
           INSERT (FirebaseUID, Plan, Status, PriceZAR, RenewsAt)
           VALUES (@uid, @plan, 'active', @amount, DATEADD(month, 1, SYSUTCDATETIME()));`,
        { uid, plan, amount: amountZAR }
      );
    }
    console.log('DB payment recorded for', email, plan, status);
  } catch (err) {
    console.error('savePaymentStatus DB error:', err.message);
  }
}

// ── PayFast IPN ───────────────────────────────────────────────────────────────
app.post('/api/payfast/ipn', async (req, res) => {
  const ipnData = req.body;
  console.log('PayFast IPN received:', ipnData);
  try {
    if (!axios) return res.status(503).send('IPN validation unavailable');
    const pfUrl = process.env.PAYFAST_SANDBOX === 'false'
      ? 'https://www.payfast.co.za/eng/query/validate'
      : 'https://sandbox.payfast.co.za/eng/query/validate';
    const rawBody = Object.keys(ipnData).map((k) => `${k}=${encodeURIComponent(ipnData[k])}`).join('&');
    const pfRes = await axios.post(pfUrl, rawBody, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    if (pfRes.data.trim() !== 'VALID') {
      console.error('PayFast IPN not valid:', pfRes.data);
      return res.status(400).send('Invalid IPN');
    }
    if (ipnData.payment_status === 'COMPLETE') {
      await savePaymentStatus(ipnData.email_address, ipnData.custom_str1, 'COMPLETE', 'payfast', parseFloat(ipnData.amount_gross || 0));
      if (admin) {
        try {
          const userRecord = await admin.auth().getUserByEmail(ipnData.email_address);
          await admin.database().ref('users/' + userRecord.uid).update({ premium: true, plan: ipnData.custom_str1, paidAt: new Date().toISOString() });
        } catch (e) { console.error('Firebase premium update error:', e); }
      }
      await sendReceipt(ipnData.email_address, { plan: ipnData.custom_str1, provider: 'payfast', amount: ipnData.amount_gross });
      if (ipnData.custom_str2) {
        await sendSms(ipnData.custom_str2, `SlidePlay: Payment confirmed for your ${ipnData.custom_str1 || 'Premium'} plan! You now have full access. 🎉`);
      }
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('PayFast IPN error:', err);
    res.status(500).send('IPN error');
  }
});

// ── Coinbase Commerce: create charge ─────────────────────────────────────────
app.post('/api/crypto/create-charge', async (req, res) => {
  const { plan, amount, user_email } = req.body;
  if (!plan || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Invalid plan or amount.' });
  }
  const COINBASE_API_KEY = process.env.COINBASE_COMMERCE_API_KEY;
  if (!COINBASE_API_KEY) return res.status(503).json({ error: 'Crypto payments are not configured on this server.' });
  if (!axios) return res.status(503).json({ error: 'Crypto payments unavailable.' });

  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const PLAN_LABELS = { student_elite: 'Student Elite', student_premium: 'Student Premium', pro: 'Teacher Pro', school: 'School Premium' };

  try {
    const chargeRes = await axios.post(
      'https://api.commerce.coinbase.com/charges',
      {
        name: `SlidePlay ${PLAN_LABELS[plan] || plan}`,
        description: `SlidePlay ${PLAN_LABELS[plan] || plan} subscription`,
        local_price: { amount: Number(amount).toFixed(2), currency: 'USD' },
        pricing_type: 'fixed_price',
        metadata: { plan, user_email: user_email || '' },
        redirect_url: `${appUrl}/studentpayment.html?payment=success&provider=crypto&plan=${encodeURIComponent(plan)}`,
        cancel_url:   `${appUrl}/studentpayment.html?payment=cancelled&provider=crypto`,
      },
      { headers: { 'Content-Type': 'application/json', 'X-CC-Api-Key': COINBASE_API_KEY, 'X-CC-Version': '2018-03-22' }, timeout: 10000 }
    );
    const charge = chargeRes.data?.data;
    if (charge?.hosted_url) res.json({ url: charge.hosted_url, chargeId: charge.id });
    else res.status(502).json({ error: 'No hosted URL returned from Coinbase Commerce.' });
  } catch (e) {
    const apiMsg = e.response?.data?.error?.message;
    console.error('Coinbase Commerce error:', apiMsg || e.message);
    res.status(502).json({ error: apiMsg || 'Failed to create crypto charge.' });
  }
});

// ── Coinbase Commerce: webhook ────────────────────────────────────────────────
app.post('/api/crypto/webhook', async (req, res) => {
  const signature    = req.headers['x-cc-webhook-signature'];
  const webhookSecret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(500).send('Webhook secret not configured.');
  if (!signature || !req.rawBody) return res.status(400).send('Missing signature or body.');

  const expectedSig = crypto.createHmac('sha256', webhookSecret).update(req.rawBody).digest('hex');
  if (signature !== expectedSig) {
    console.warn('Coinbase webhook: invalid signature — possible spoofed request.');
    return res.status(400).send('Invalid signature.');
  }

  let event;
  try { event = JSON.parse(req.rawBody.toString()); }
  catch { return res.status(400).send('Invalid JSON payload.'); }

  const eventType = event?.event?.type;
  const { plan, user_email } = event?.event?.data?.metadata || {};

  if ((eventType === 'charge:confirmed' || eventType === 'charge:resolved') && plan && user_email) {
    savePaymentStatus(user_email, plan, 'COMPLETE', 'coinbase', 0);
    if (admin) {
      try {
        const userRecord = await admin.auth().getUserByEmail(user_email);
        await admin.database().ref('users/' + userRecord.uid).update({ premium: true, plan, paidAt: new Date().toISOString(), paymentProvider: 'coinbase_commerce' });
      } catch (e) { console.error('Firebase crypto webhook error:', e.message); }
    }
    await sendReceipt(user_email, { plan, provider: 'coinbase_commerce', amount: null });
    const cbPhone = event?.event?.data?.metadata?.customer_phone || '';
    if (cbPhone) {
      await sendSms(cbPhone, `SlidePlay: Your crypto payment for the ${plan || 'Premium'} plan is confirmed! Access unlocked. 🎉`);
    }
  }
  res.status(200).send('OK');
});

// ── Welcome email ─────────────────────────────────────────────────────────────
app.post('/send-welcome-email', async (req, res) => {
  const { email } = req.body;
  if (!sgMail) return res.status(503).send('Email service not configured.');
  try {
    await sgMail.send({ to: email, from: { name: 'SlidePlay', email: SENDGRID_FROM }, subject: 'Welcome to SlidePlay!', text: 'Thank you for signing up for SlidePlay! We\'re excited to have you on board.' });
    res.status(200).send('Email sent');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error sending email');
  }
});

function makeJsonString(value, fallback = []) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return JSON.stringify(fallback);
    try {
      return JSON.stringify(JSON.parse(trimmed));
    } catch (_) {
      return JSON.stringify(trimmed.split(',').map((item) => item.trim()).filter(Boolean));
    }
  }
  if (value === undefined || value === null) return JSON.stringify(fallback);
  return JSON.stringify(value);
}

function readJsonField(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function normalizeNullableString(value, maxLen = 255) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function generateClassCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function getDbRole(uid) {
  if (!dbModule || !uid) return null;
  const result = await dbModule.query(
    'SELECT TOP 1 Role FROM Users WHERE FirebaseUID = @uid',
    { uid }
  );
  if (!result.recordset.length) return null;
  return String(result.recordset[0].Role || '').toLowerCase() || null;
}

async function ensureTeacherRole(uid) {
  const role = await getDbRole(uid);
  return role === 'teacher' || role === 'admin';
}

function formatProfileRow(row) {
  if (!row) return null;
  return {
    uid: row.FirebaseUID,
    email: row.Email,
    displayName: row.DisplayName,
    role: row.Role,
    bio: row.Bio || '',
    avatarUrl: row.AvatarUrl || '',
    gradeLevel: row.GradeLevel || '',
    schoolName: row.SchoolName || '',
    preferences: readJsonField(row.PreferencesJson, {}),
    isDeleted: Boolean(row.IsDeleted),
    createdAt: row.CreatedAt,
    lastLoginAt: row.LastLoginAt,
    deactivatedAt: row.DeactivatedAt,
  };
}

async function isPremiumStudent(uid) {
  if (!dbModule || !uid) return false;
  try {
    const result = await dbModule.query(
      `SELECT TOP 1 [Plan], [Status]
       FROM Subscriptions
       WHERE FirebaseUID = @uid
       ORDER BY CreatedAt DESC`,
      { uid }
    );
    if (!result.recordset.length) return false;
    const row = result.recordset[0];
    const plan = String(row.Plan || '').toLowerCase();
    const status = String(row.Status || '').toLowerCase();
    if (status !== 'active') return false;
    return plan === 'student_elite' || plan === 'student_premium';
  } catch (_) {
    return false;
  }
}

function buildFallbackPerformanceSummary(payload) {
  const total = Number(payload.totalQuestions || 0);
  const correct = Number(payload.correctCount || 0);
  const score = Number(payload.score || 0);
  const acc = total > 0 ? Math.round((correct / total) * 100) : 0;
  const weak = (payload.questionAttempts || [])
    .filter((q) => !q.correct)
    .slice(0, 3)
    .map((q) => q.question || 'a missed question');
  const weakLine = weak.length
    ? `Focus next on: ${weak.join('; ')}.`
    : 'No major weak spots detected in this game.';
  return [
    `Performance Summary: You scored ${score} points with ${correct}/${total} correct (${acc}%).`,
    weakLine,
    'Next Step: Review explanations for missed questions and replay one session to improve speed and accuracy.'
  ].join(' ');
}

async function generatePerformanceReportWithAI(payload) {
  const compactAttempts = (payload.questionAttempts || []).slice(0, 20).map((q, index) => ({
    idx: index + 1,
    question: q.question,
    correct: !!q.correct,
    points: Number(q.points || 0),
    timeSec: Number(q.timeSec || 0),
    chosen: typeof q.chosenIndex === 'number' ? q.chosenIndex : null,
    answer: typeof q.correctIndex === 'number' ? q.correctIndex : null,
  }));

  const prompt = [
    'You are an elite learning performance coach.',
    'Create a concise personalized student game report with this structure:',
    '1) Overall performance summary',
    '2) Strengths shown',
    '3) Mistake patterns and likely causes',
    '4) Question-level remediation tips (concrete and specific)',
    '5) 3 action steps for the next game session',
    'Keep it practical, encouraging, and specific to the provided attempts.',
    'Return plain text only.',
    '',
    'DATA:',
    JSON.stringify({
      gameType: payload.gameType || 'quiz',
      score: Number(payload.score || 0),
      totalQuestions: Number(payload.totalQuestions || 0),
      correctCount: Number(payload.correctCount || 0),
      durationSec: Number(payload.durationSec || 0),
      attempts: compactAttempts,
    })
  ].join('\n');

  if (GROQ_API_KEY) {
    try {
      const upstream = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: 'You produce high-quality educational performance reports.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.4,
          max_tokens: 1100
        })
      });
      if (upstream.ok) {
        const data = await upstream.json();
        const text = data?.choices?.[0]?.message?.content || '';
        if (text.trim()) return text.trim();
      }
    } catch (_) {}
  }

  if (GEMINI_API_KEY) {
    try {
      const geminiResp = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1100
          }
        })
      });
      if (geminiResp.ok) {
        const gData = await geminiResp.json();
        const text = gData?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('\n').trim();
        if (text) return text;
      }
    } catch (_) {}
  }

  return buildFallbackPerformanceSummary(payload);
}

// ── DB: sync Firebase user ────────────────────────────────────────────────────
app.post('/api/users/sync', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid, email, displayName, role } = req.body;
  if (!uid || !email) return res.status(400).json({ error: 'uid and email required' });
  try {
    await dbModule.query(
      `MERGE Users AS target
       USING (SELECT @uid AS FirebaseUID) AS src ON target.FirebaseUID = src.FirebaseUID
       WHEN MATCHED THEN
         UPDATE SET Email = @email, DisplayName = @displayName, Role = @role, LastLoginAt = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN
         INSERT (FirebaseUID, Email, DisplayName, Role) VALUES (@uid, @email, @displayName, @role);`,
      { uid, email, displayName: displayName || '', role: role || 'student' }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('users/sync error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ── DB: get game session ──────────────────────────────────────────────────────
app.get('/api/sessions/:code', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { code } = req.params;
  try {
    const result = await dbModule.query(
      "SELECT * FROM GameSessions WHERE SessionCode = @code AND Status IN ('waiting','active')",
      { code }
    );
    if (!result.recordset.length) return res.status(404).json({ error: 'Session not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('sessions/:code error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ── DB: join session ──────────────────────────────────────────────────────────
app.post('/api/sessions/:code/join', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { code } = req.params;
  const { uid, displayName } = req.body;
  if (!uid) return res.status(400).json({ error: 'uid required' });
  try {
    const sess = await dbModule.query(
      "SELECT SessionID FROM GameSessions WHERE SessionCode = @code AND Status = 'waiting'",
      { code }
    );
    if (!sess.recordset.length) return res.status(404).json({ error: 'Session not open' });
    const sessionId = sess.recordset[0].SessionID;
    await dbModule.query(
      `IF NOT EXISTS (SELECT 1 FROM SessionPlayers WHERE SessionID = @sessionId AND StudentUID = @uid)
         INSERT INTO SessionPlayers (SessionID, StudentUID, DisplayName) VALUES (@sessionId, @uid, @displayName)`,
      { sessionId, uid, displayName: displayName || uid }
    );
    res.json({ ok: true, sessionId });
  } catch (err) {
    console.error('sessions/:code/join error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ── DB: get subscription ──────────────────────────────────────────────────────
app.get('/api/users/:uid/subscription', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid } = req.params;
  try {
    const result = await dbModule.query(
      'SELECT Plan, Status, RenewsAt FROM Subscriptions WHERE FirebaseUID = @uid',
      { uid }
    );
    if (!result.recordset.length) return res.json({ Plan: 'free', Status: 'none' });
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('subscription error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ── DB: get user role ─────────────────────────────────────────────────────────
app.get('/api/users/:uid/role', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid } = req.params;
  try {
    const result = await dbModule.query(
      'SELECT TOP 1 Role FROM Users WHERE FirebaseUID = @uid',
      { uid }
    );
    if (!result.recordset.length) return res.json({ role: 'student', source: 'default' });
    res.json({ role: (result.recordset[0].Role || 'student').toLowerCase(), source: 'db' });
  } catch (err) {
    console.error('role lookup error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ── DB: user profile CRUD ─────────────────────────────────────────────────────
app.get('/api/users/:uid/profile', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid } = req.params;
  try {
    const result = await dbModule.query(
      `SELECT FirebaseUID, Email, DisplayName, Role, Bio, AvatarUrl, GradeLevel, SchoolName,
              PreferencesJson, IsDeleted, CreatedAt, LastLoginAt, DeactivatedAt
       FROM Users
       WHERE FirebaseUID = @uid`,
      { uid }
    );
    if (!result.recordset.length) return res.status(404).json({ error: 'User not found' });
    res.json({ profile: formatProfileRow(result.recordset[0]) });
  } catch (err) {
    console.error('users/:uid/profile error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.put('/api/users/:uid/profile', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid } = req.params;
  const {
    displayName,
    bio,
    avatarUrl,
    gradeLevel,
    schoolName,
    preferences,
  } = req.body || {};

  try {
    await dbModule.query(
      `UPDATE Users
       SET DisplayName = COALESCE(@displayName, DisplayName),
           Bio = @bio,
           AvatarUrl = @avatarUrl,
           GradeLevel = @gradeLevel,
           SchoolName = @schoolName,
           PreferencesJson = @preferencesJson
       WHERE FirebaseUID = @uid`,
      {
        uid,
        displayName: normalizeNullableString(displayName),
        bio: normalizeNullableString(bio, 1000),
        avatarUrl: normalizeNullableString(avatarUrl, 1000),
        gradeLevel: normalizeNullableString(gradeLevel, 80),
        schoolName: normalizeNullableString(schoolName, 200),
        preferencesJson: makeJsonString(preferences, {}),
      }
    );

    const updated = await dbModule.query(
      `SELECT FirebaseUID, Email, DisplayName, Role, Bio, AvatarUrl, GradeLevel, SchoolName,
              PreferencesJson, IsDeleted, CreatedAt, LastLoginAt, DeactivatedAt
       FROM Users
       WHERE FirebaseUID = @uid`,
      { uid }
    );
    if (!updated.recordset.length) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, profile: formatProfileRow(updated.recordset[0]) });
  } catch (err) {
    console.error('users/:uid/profile update error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/users/:uid/profile', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid } = req.params;
  try {
    const result = await dbModule.query(
      `UPDATE Users
       SET IsDeleted = 1,
           DeactivatedAt = SYSUTCDATETIME(),
           PreferencesJson = COALESCE(PreferencesJson, '{}')
       WHERE FirebaseUID = @uid`,
      { uid }
    );
    if (!result.rowsAffected?.[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, uid, status: 'deactivated' });
  } catch (err) {
    console.error('users/:uid/profile delete error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ── DB: personal notes CRUD ──────────────────────────────────────────────────
app.get('/api/users/:uid/notes', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid } = req.params;
  try {
    const result = await dbModule.query(
      `SELECT NoteID, FirebaseUID, Title, Content, Subject, TagsJson, CreatedAt, UpdatedAt, IsPinned
       FROM StudentNotes
       WHERE FirebaseUID = @uid
       ORDER BY IsPinned DESC, UpdatedAt DESC, CreatedAt DESC`,
      { uid }
    );
    const notes = (result.recordset || []).map((row) => ({
      noteId: row.NoteID,
      uid: row.FirebaseUID,
      title: row.Title,
      content: row.Content,
      subject: row.Subject || '',
      tags: readJsonField(row.TagsJson, []),
      isPinned: Boolean(row.IsPinned),
      createdAt: row.CreatedAt,
      updatedAt: row.UpdatedAt,
    }));
    res.json({ notes });
  } catch (err) {
    console.error('users/:uid/notes list error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/users/:uid/notes', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid } = req.params;
  const { title, content, subject, tags, isPinned } = req.body || {};
  if (!title && !content) return res.status(400).json({ error: 'title or content required' });
  try {
    const result = await dbModule.query(
      `INSERT INTO StudentNotes (FirebaseUID, Title, Content, Subject, TagsJson, IsPinned)
       OUTPUT INSERTED.NoteID, INSERTED.FirebaseUID, INSERTED.Title, INSERTED.Content,
              INSERTED.Subject, INSERTED.TagsJson, INSERTED.CreatedAt, INSERTED.UpdatedAt, INSERTED.IsPinned
       VALUES (@uid, @title, @content, @subject, @tagsJson, @isPinned)`,
      {
        uid,
        title: normalizeNullableString(title, 200) || 'Untitled note',
        content: normalizeNullableString(content, 4000) || '',
        subject: normalizeNullableString(subject, 120),
        tagsJson: makeJsonString(tags, []),
        isPinned: isPinned ? 1 : 0,
      }
    );
    const note = result.recordset[0];
    res.status(201).json({
      ok: true,
      note: {
        noteId: note.NoteID,
        uid: note.FirebaseUID,
        title: note.Title,
        content: note.Content,
        subject: note.Subject || '',
        tags: readJsonField(note.TagsJson, []),
        isPinned: Boolean(note.IsPinned),
        createdAt: note.CreatedAt,
        updatedAt: note.UpdatedAt,
      }
    });
  } catch (err) {
    console.error('users/:uid/notes create error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.put('/api/users/:uid/notes/:noteId', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid, noteId } = req.params;
  const { title, content, subject, tags, isPinned } = req.body || {};
  try {
    const result = await dbModule.query(
      `UPDATE StudentNotes
       SET Title = COALESCE(@title, Title),
           Content = COALESCE(@content, Content),
           Subject = @subject,
           TagsJson = @tagsJson,
           IsPinned = @isPinned,
           UpdatedAt = SYSUTCDATETIME()
       WHERE NoteID = @noteId AND FirebaseUID = @uid`,
      {
        uid,
        noteId: parseInt(noteId, 10),
        title: normalizeNullableString(title, 200),
        content: normalizeNullableString(content, 4000),
        subject: normalizeNullableString(subject, 120),
        tagsJson: makeJsonString(tags, []),
        isPinned: isPinned ? 1 : 0,
      }
    );
    if (!result.rowsAffected?.[0]) return res.status(404).json({ error: 'Note not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('users/:uid/notes update error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/users/:uid/notes/:noteId', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid, noteId } = req.params;
  try {
    const result = await dbModule.query(
      'DELETE FROM StudentNotes WHERE NoteID = @noteId AND FirebaseUID = @uid',
      { uid, noteId: parseInt(noteId, 10) }
    );
    if (!result.rowsAffected?.[0]) return res.status(404).json({ error: 'Note not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('users/:uid/notes delete error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ── DB: bookmarks CRUD ───────────────────────────────────────────────────────
app.get('/api/users/:uid/bookmarks', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid } = req.params;
  try {
    const result = await dbModule.query(
      `SELECT BookmarkID, FirebaseUID, ResourceType, ResourceId, Title, Url, MetadataJson, CreatedAt
       FROM UserBookmarks
       WHERE FirebaseUID = @uid
       ORDER BY CreatedAt DESC`,
      { uid }
    );
    res.json({
      bookmarks: (result.recordset || []).map((row) => ({
        bookmarkId: row.BookmarkID,
        uid: row.FirebaseUID,
        resourceType: row.ResourceType,
        resourceId: row.ResourceId || '',
        title: row.Title,
        url: row.Url || '',
        metadata: readJsonField(row.MetadataJson, {}),
        createdAt: row.CreatedAt,
      }))
    });
  } catch (err) {
    console.error('users/:uid/bookmarks list error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/users/:uid/bookmarks', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid } = req.params;
  const { resourceType, resourceId, title, url, metadata } = req.body || {};
  if (!resourceType || !title) return res.status(400).json({ error: 'resourceType and title required' });
  try {
    const result = await dbModule.query(
      `INSERT INTO UserBookmarks (FirebaseUID, ResourceType, ResourceId, Title, Url, MetadataJson)
       OUTPUT INSERTED.BookmarkID, INSERTED.FirebaseUID, INSERTED.ResourceType, INSERTED.ResourceId,
              INSERTED.Title, INSERTED.Url, INSERTED.MetadataJson, INSERTED.CreatedAt
       VALUES (@uid, @resourceType, @resourceId, @title, @url, @metadataJson)`,
      {
        uid,
        resourceType: normalizeNullableString(resourceType, 80),
        resourceId: normalizeNullableString(resourceId, 120),
        title: normalizeNullableString(title, 200),
        url: normalizeNullableString(url, 1000),
        metadataJson: makeJsonString(metadata, {}),
      }
    );
    const row = result.recordset[0];
    res.status(201).json({
      ok: true,
      bookmark: {
        bookmarkId: row.BookmarkID,
        uid: row.FirebaseUID,
        resourceType: row.ResourceType,
        resourceId: row.ResourceId || '',
        title: row.Title,
        url: row.Url || '',
        metadata: readJsonField(row.MetadataJson, {}),
        createdAt: row.CreatedAt,
      }
    });
  } catch (err) {
    console.error('users/:uid/bookmarks create error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.put('/api/users/:uid/bookmarks/:bookmarkId', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid, bookmarkId } = req.params;
  const { resourceType, resourceId, title, url, metadata } = req.body || {};
  try {
    const result = await dbModule.query(
      `UPDATE UserBookmarks
       SET ResourceType = COALESCE(@resourceType, ResourceType),
           ResourceId = @resourceId,
           Title = COALESCE(@title, Title),
           Url = @url,
           MetadataJson = @metadataJson
       WHERE BookmarkID = @bookmarkId AND FirebaseUID = @uid`,
      {
        uid,
        bookmarkId: parseInt(bookmarkId, 10),
        resourceType: normalizeNullableString(resourceType, 80),
        resourceId: normalizeNullableString(resourceId, 120),
        title: normalizeNullableString(title, 200),
        url: normalizeNullableString(url, 1000),
        metadataJson: makeJsonString(metadata, {}),
      }
    );
    if (!result.rowsAffected?.[0]) return res.status(404).json({ error: 'Bookmark not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('users/:uid/bookmarks update error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/users/:uid/bookmarks/:bookmarkId', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid, bookmarkId } = req.params;
  try {
    const result = await dbModule.query(
      'DELETE FROM UserBookmarks WHERE BookmarkID = @bookmarkId AND FirebaseUID = @uid',
      { uid, bookmarkId: parseInt(bookmarkId, 10) }
    );
    if (!result.rowsAffected?.[0]) return res.status(404).json({ error: 'Bookmark not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('users/:uid/bookmarks delete error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ── DB: notifications CRUD ───────────────────────────────────────────────────
app.get('/api/users/:uid/notifications', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid } = req.params;
  try {
    const result = await dbModule.query(
      `SELECT NotificationID, FirebaseUID, Type, Title, Message, LinkUrl, IsRead, CreatedAt, ReadAt
       FROM UserNotifications
       WHERE FirebaseUID = @uid
       ORDER BY CreatedAt DESC`,
      { uid }
    );
    res.json({
      notifications: (result.recordset || []).map((row) => ({
        notificationId: row.NotificationID,
        uid: row.FirebaseUID,
        type: row.Type,
        title: row.Title,
        message: row.Message,
        linkUrl: row.LinkUrl || '',
        isRead: Boolean(row.IsRead),
        createdAt: row.CreatedAt,
        readAt: row.ReadAt,
      }))
    });
  } catch (err) {
    console.error('users/:uid/notifications list error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/users/:uid/notifications', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid } = req.params;
  const { type, title, message, linkUrl, isRead } = req.body || {};
  if (!title || !message) return res.status(400).json({ error: 'title and message required' });
  try {
    const result = await dbModule.query(
      `INSERT INTO UserNotifications (FirebaseUID, Type, Title, Message, LinkUrl, IsRead, ReadAt)
       OUTPUT INSERTED.NotificationID, INSERTED.FirebaseUID, INSERTED.Type, INSERTED.Title,
              INSERTED.Message, INSERTED.LinkUrl, INSERTED.IsRead, INSERTED.CreatedAt, INSERTED.ReadAt
       VALUES (@uid, @type, @title, @message, @linkUrl, @isRead,
               CASE WHEN @isRead = 1 THEN SYSUTCDATETIME() ELSE NULL END)`,
      {
        uid,
        type: normalizeNullableString(type, 80) || 'general',
        title: normalizeNullableString(title, 200),
        message: normalizeNullableString(message, 2000),
        linkUrl: normalizeNullableString(linkUrl, 1000),
        isRead: isRead ? 1 : 0,
      }
    );
    const row = result.recordset[0];
    res.status(201).json({
      ok: true,
      notification: {
        notificationId: row.NotificationID,
        uid: row.FirebaseUID,
        type: row.Type,
        title: row.Title,
        message: row.Message,
        linkUrl: row.LinkUrl || '',
        isRead: Boolean(row.IsRead),
        createdAt: row.CreatedAt,
        readAt: row.ReadAt,
      }
    });
  } catch (err) {
    console.error('users/:uid/notifications create error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.patch('/api/users/:uid/notifications/:notificationId', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid, notificationId } = req.params;
  const { type, title, message, linkUrl, isRead } = req.body || {};
  try {
    const result = await dbModule.query(
      `UPDATE UserNotifications
       SET Type = COALESCE(@type, Type),
           Title = COALESCE(@title, Title),
           Message = COALESCE(@message, Message),
           LinkUrl = @linkUrl,
           IsRead = COALESCE(@isRead, IsRead),
           ReadAt = CASE
             WHEN COALESCE(@isRead, IsRead) = 1 THEN COALESCE(ReadAt, SYSUTCDATETIME())
             ELSE NULL
           END
       WHERE NotificationID = @notificationId AND FirebaseUID = @uid`,
      {
        uid,
        notificationId: parseInt(notificationId, 10),
        type: normalizeNullableString(type, 80),
        title: normalizeNullableString(title, 200),
        message: normalizeNullableString(message, 2000),
        linkUrl: normalizeNullableString(linkUrl, 1000),
        isRead: typeof isRead === 'boolean' ? (isRead ? 1 : 0) : null,
      }
    );
    if (!result.rowsAffected?.[0]) return res.status(404).json({ error: 'Notification not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('users/:uid/notifications update error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/users/:uid/notifications/:notificationId', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid, notificationId } = req.params;
  try {
    const result = await dbModule.query(
      'DELETE FROM UserNotifications WHERE NotificationID = @notificationId AND FirebaseUID = @uid',
      { uid, notificationId: parseInt(notificationId, 10) }
    );
    if (!result.rowsAffected?.[0]) return res.status(404).json({ error: 'Notification not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('users/:uid/notifications delete error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ── DB: premium student AI game reports ─────────────────────────────────────
app.post('/api/students/:uid/game-reports', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid } = req.params;
  const {
    gameType,
    sessionCode,
    score,
    totalQuestions,
    correctCount,
    durationSec,
    questionAttempts,
    meta
  } = req.body || {};

  if (!uid) return res.status(400).json({ error: 'uid required' });
  if (!Array.isArray(questionAttempts) || !questionAttempts.length) {
    return res.status(400).json({ error: 'questionAttempts required' });
  }

  try {
    const isPremium = await isPremiumStudent(uid);
    if (!isPremium) {
      return res.status(403).json({ error: 'Premium student plan required' });
    }

    const reportText = await generatePerformanceReportWithAI({
      gameType,
      score,
      totalQuestions,
      correctCount,
      durationSec,
      questionAttempts,
      meta,
    });

    const insert = await dbModule.query(
      `INSERT INTO PremiumGameReports
       (FirebaseUID, GameType, SessionCode, Score, TotalQuestions, CorrectCount, DurationSec, AttemptsJson, ReportText, MetaJson)
       OUTPUT INSERTED.ReportID, INSERTED.CreatedAt
       VALUES
       (@uid, @gameType, @sessionCode, @score, @totalQuestions, @correctCount, @durationSec, @attemptsJson, @reportText, @metaJson)`,
      {
        uid,
        gameType: normalizeNullableString(gameType, 80) || 'quiz',
        sessionCode: normalizeNullableString(sessionCode, 32),
        score: Number(score || 0),
        totalQuestions: Number(totalQuestions || 0),
        correctCount: Number(correctCount || 0),
        durationSec: Number(durationSec || 0),
        attemptsJson: makeJsonString(questionAttempts, []),
        reportText,
        metaJson: makeJsonString(meta, {}),
      }
    );

    const row = insert.recordset?.[0] || {};
    res.status(201).json({
      ok: true,
      report: {
        reportId: row.ReportID,
        createdAt: row.CreatedAt,
        reportText,
      }
    });
  } catch (err) {
    console.error('students/:uid/game-reports create error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/students/:uid/game-reports', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid } = req.params;
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
  try {
    const result = await dbModule.query(
      `SELECT TOP (@limit)
         ReportID, FirebaseUID, GameType, SessionCode, Score, TotalQuestions, CorrectCount,
         DurationSec, AttemptsJson, ReportText, MetaJson, CreatedAt
       FROM PremiumGameReports
       WHERE FirebaseUID = @uid
       ORDER BY CreatedAt DESC`,
      { uid, limit }
    );

    const reports = (result.recordset || []).map((row) => ({
      reportId: row.ReportID,
      uid: row.FirebaseUID,
      gameType: row.GameType,
      sessionCode: row.SessionCode || '',
      score: Number(row.Score || 0),
      totalQuestions: Number(row.TotalQuestions || 0),
      correctCount: Number(row.CorrectCount || 0),
      durationSec: Number(row.DurationSec || 0),
      attempts: readJsonField(row.AttemptsJson, []),
      reportText: row.ReportText || '',
      meta: readJsonField(row.MetaJson, {}),
      createdAt: row.CreatedAt,
    }));

    res.json({ reports });
  } catch (err) {
    console.error('students/:uid/game-reports list error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ── DB: teacher class CRUD ───────────────────────────────────────────────────
app.get('/api/teacher/classes', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const uid = req.query.uid;
  if (!uid) return res.status(400).json({ error: 'uid required' });
  try {
    if (!(await ensureTeacherRole(uid))) {
      return res.status(403).json({ error: 'Teacher access required' });
    }
    const result = await dbModule.query(
      `SELECT tc.ClassID, tc.TeacherUID, tc.ClassCode, tc.Name, tc.Subject, tc.Description,
              tc.GradeLevel, tc.IsArchived, tc.CreatedAt, tc.UpdatedAt,
              (SELECT COUNT(*) FROM ClassStudents cs WHERE cs.ClassID = tc.ClassID AND cs.Status = 'active') AS StudentCount
       FROM TeacherClasses tc
       WHERE tc.TeacherUID = @uid
       ORDER BY tc.CreatedAt DESC`,
      { uid }
    );
    res.json({ classes: result.recordset || [] });
  } catch (err) {
    console.error('teacher/classes list error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/teacher/classes', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid, name, subject, description, gradeLevel, classCode } = req.body || {};
  if (!uid || !name) return res.status(400).json({ error: 'uid and name required' });
  try {
    if (!(await ensureTeacherRole(uid))) {
      return res.status(403).json({ error: 'Teacher access required' });
    }
    const result = await dbModule.query(
      `INSERT INTO TeacherClasses (TeacherUID, ClassCode, Name, Subject, Description, GradeLevel)
       OUTPUT INSERTED.ClassID, INSERTED.TeacherUID, INSERTED.ClassCode, INSERTED.Name,
              INSERTED.Subject, INSERTED.Description, INSERTED.GradeLevel, INSERTED.CreatedAt, INSERTED.UpdatedAt, INSERTED.IsArchived
       VALUES (@uid, @classCode, @name, @subject, @description, @gradeLevel)`,
      {
        uid,
        classCode: normalizeNullableString(classCode, 12) || generateClassCode(),
        name: normalizeNullableString(name, 200),
        subject: normalizeNullableString(subject, 120),
        description: normalizeNullableString(description, 2000),
        gradeLevel: normalizeNullableString(gradeLevel, 80),
      }
    );
    res.status(201).json({ ok: true, class: result.recordset[0] });
  } catch (err) {
    console.error('teacher/classes create error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/teacher/classes/:classId', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const classId = parseInt(req.params.classId, 10);
  try {
    const [classRes, studentsRes, assignmentsRes] = await Promise.all([
      dbModule.query(
        `SELECT ClassID, TeacherUID, ClassCode, Name, Subject, Description, GradeLevel, IsArchived, CreatedAt, UpdatedAt
         FROM TeacherClasses WHERE ClassID = @classId`,
        { classId }
      ),
      dbModule.query(
        `SELECT ClassStudentID, ClassID, StudentUID, DisplayName, Status, JoinedAt
         FROM ClassStudents WHERE ClassID = @classId ORDER BY JoinedAt DESC`,
        { classId }
      ),
      dbModule.query(
        `SELECT AssignmentID, ClassID, TeacherUID, DeckID, Title, Instructions, DueAt, MaxPoints, Status, CreatedAt, UpdatedAt
         FROM TeacherAssignments WHERE ClassID = @classId AND IsArchived = 0 ORDER BY CreatedAt DESC`,
        { classId }
      )
    ]);
    if (!classRes.recordset.length) return res.status(404).json({ error: 'Class not found' });
    res.json({
      class: classRes.recordset[0],
      students: studentsRes.recordset || [],
      assignments: assignmentsRes.recordset || [],
    });
  } catch (err) {
    console.error('teacher/classes detail error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.put('/api/teacher/classes/:classId', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const classId = parseInt(req.params.classId, 10);
  const { uid, name, subject, description, gradeLevel, isArchived } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'uid required' });
  try {
    if (!(await ensureTeacherRole(uid))) {
      return res.status(403).json({ error: 'Teacher access required' });
    }
    const result = await dbModule.query(
      `UPDATE TeacherClasses
       SET Name = COALESCE(@name, Name),
           Subject = @subject,
           Description = @description,
           GradeLevel = @gradeLevel,
           IsArchived = COALESCE(@isArchived, IsArchived),
           UpdatedAt = SYSUTCDATETIME()
       WHERE ClassID = @classId AND TeacherUID = @uid`,
      {
        uid,
        classId,
        name: normalizeNullableString(name, 200),
        subject: normalizeNullableString(subject, 120),
        description: normalizeNullableString(description, 2000),
        gradeLevel: normalizeNullableString(gradeLevel, 80),
        isArchived: typeof isArchived === 'boolean' ? (isArchived ? 1 : 0) : null,
      }
    );
    if (!result.rowsAffected?.[0]) return res.status(404).json({ error: 'Class not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('teacher/classes update error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/teacher/classes/:classId', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const classId = parseInt(req.params.classId, 10);
  const uid = req.query.uid;
  if (!uid) return res.status(400).json({ error: 'uid required' });
  try {
    if (!(await ensureTeacherRole(uid))) {
      return res.status(403).json({ error: 'Teacher access required' });
    }
    const result = await dbModule.query(
      `UPDATE TeacherClasses
       SET IsArchived = 1, UpdatedAt = SYSUTCDATETIME()
       WHERE ClassID = @classId AND TeacherUID = @uid`,
      { classId, uid }
    );
    if (!result.rowsAffected?.[0]) return res.status(404).json({ error: 'Class not found' });
    res.json({ ok: true, archived: true });
  } catch (err) {
    console.error('teacher/classes delete error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/teacher/classes/:classId/students', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const classId = parseInt(req.params.classId, 10);
  try {
    const result = await dbModule.query(
      `SELECT cs.ClassStudentID, cs.ClassID, cs.StudentUID, cs.DisplayName, cs.Status, cs.JoinedAt,
              u.Email, u.Role
       FROM ClassStudents cs
       LEFT JOIN Users u ON u.FirebaseUID = cs.StudentUID
       WHERE cs.ClassID = @classId
       ORDER BY cs.JoinedAt DESC`,
      { classId }
    );
    res.json({ students: result.recordset || [] });
  } catch (err) {
    console.error('teacher/classes students error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/teacher/classes/:classId/students', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const classId = parseInt(req.params.classId, 10);
  const { studentUid, displayName } = req.body || {};
  if (!studentUid) return res.status(400).json({ error: 'studentUid required' });
  try {
    await dbModule.query(
      `IF NOT EXISTS (SELECT 1 FROM ClassStudents WHERE ClassID = @classId AND StudentUID = @studentUid)
         INSERT INTO ClassStudents (ClassID, StudentUID, DisplayName)
         VALUES (@classId, @studentUid, @displayName)
       ELSE
         UPDATE ClassStudents
         SET Status = 'active', DisplayName = COALESCE(@displayName, DisplayName)
         WHERE ClassID = @classId AND StudentUID = @studentUid`,
      {
        classId,
        studentUid,
        displayName: normalizeNullableString(displayName, 200),
      }
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('teacher/classes add student error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/teacher/classes/:classId/students/:studentUid', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const classId = parseInt(req.params.classId, 10);
  const { studentUid } = req.params;
  try {
    const result = await dbModule.query(
      `UPDATE ClassStudents
       SET Status = 'removed'
       WHERE ClassID = @classId AND StudentUID = @studentUid`,
      { classId, studentUid }
    );
    if (!result.rowsAffected?.[0]) return res.status(404).json({ error: 'Student membership not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('teacher/classes remove student error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ── DB: student class access ─────────────────────────────────────────────────
app.get('/api/classes/:code', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const code = String(req.params.code || '').trim().toUpperCase();
  try {
    const result = await dbModule.query(
      `SELECT TOP 1 ClassID, TeacherUID, ClassCode, Name, Subject, Description, GradeLevel, IsArchived, CreatedAt, UpdatedAt
       FROM TeacherClasses
       WHERE ClassCode = @code AND IsArchived = 0`,
      { code }
    );
    if (!result.recordset.length) return res.status(404).json({ error: 'Class not found' });
    res.json({ class: result.recordset[0] });
  } catch (err) {
    console.error('classes/:code lookup error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/classes/:code/join', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const code = String(req.params.code || '').trim().toUpperCase();
  const { uid, displayName } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'uid required' });
  try {
    const classRes = await dbModule.query(
      'SELECT TOP 1 ClassID FROM TeacherClasses WHERE ClassCode = @code AND IsArchived = 0',
      { code }
    );
    if (!classRes.recordset.length) return res.status(404).json({ error: 'Class not found' });
    const classId = classRes.recordset[0].ClassID;
    await dbModule.query(
      `IF NOT EXISTS (SELECT 1 FROM ClassStudents WHERE ClassID = @classId AND StudentUID = @uid)
         INSERT INTO ClassStudents (ClassID, StudentUID, DisplayName)
         VALUES (@classId, @uid, @displayName)
       ELSE
         UPDATE ClassStudents
         SET Status = 'active', DisplayName = COALESCE(@displayName, DisplayName)
         WHERE ClassID = @classId AND StudentUID = @uid`,
      { classId, uid, displayName: normalizeNullableString(displayName, 200) }
    );
    res.json({ ok: true, classId });
  } catch (err) {
    console.error('classes/:code/join error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/students/:uid/classes', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid } = req.params;
  try {
    const result = await dbModule.query(
      `SELECT tc.ClassID, tc.TeacherUID, tc.ClassCode, tc.Name, tc.Subject, tc.Description,
              tc.GradeLevel, cs.Status, cs.JoinedAt
       FROM ClassStudents cs
       JOIN TeacherClasses tc ON tc.ClassID = cs.ClassID
       WHERE cs.StudentUID = @uid AND tc.IsArchived = 0
       ORDER BY cs.JoinedAt DESC`,
      { uid }
    );
    res.json({ classes: result.recordset || [] });
  } catch (err) {
    console.error('students/:uid/classes error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ── DB: teacher assignments CRUD ─────────────────────────────────────────────
app.get('/api/teacher/assignments', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const uid = req.query.uid;
  const classId = req.query.classId ? parseInt(req.query.classId, 10) : null;
  if (!uid) return res.status(400).json({ error: 'uid required' });
  try {
    if (!(await ensureTeacherRole(uid))) {
      return res.status(403).json({ error: 'Teacher access required' });
    }
    const result = await dbModule.query(
      `SELECT AssignmentID, TeacherUID, ClassID, DeckID, Title, Instructions, DueAt, MaxPoints, Status, CreatedAt, UpdatedAt
       FROM TeacherAssignments
       WHERE TeacherUID = @uid
         AND IsArchived = 0
         AND (@classId IS NULL OR ClassID = @classId)
       ORDER BY CreatedAt DESC`,
      { uid, classId }
    );
    res.json({ assignments: result.recordset || [] });
  } catch (err) {
    console.error('teacher/assignments list error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/teacher/assignments', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid, classId, deckId, title, instructions, dueAt, maxPoints, status } = req.body || {};
  if (!uid || !title) return res.status(400).json({ error: 'uid and title required' });
  try {
    if (!(await ensureTeacherRole(uid))) {
      return res.status(403).json({ error: 'Teacher access required' });
    }
    const result = await dbModule.query(
      `INSERT INTO TeacherAssignments (TeacherUID, ClassID, DeckID, Title, Instructions, DueAt, MaxPoints, Status)
       OUTPUT INSERTED.AssignmentID, INSERTED.TeacherUID, INSERTED.ClassID, INSERTED.DeckID,
              INSERTED.Title, INSERTED.Instructions, INSERTED.DueAt, INSERTED.MaxPoints,
              INSERTED.Status, INSERTED.CreatedAt, INSERTED.UpdatedAt
       VALUES (@uid, @classId, @deckId, @title, @instructions, @dueAt, @maxPoints, @status)`,
      {
        uid,
        classId: classId ? parseInt(classId, 10) : null,
        deckId: deckId ? parseInt(deckId, 10) : null,
        title: normalizeNullableString(title, 200),
        instructions: normalizeNullableString(instructions, 4000),
        dueAt: dueAt || null,
        maxPoints: maxPoints ? parseInt(maxPoints, 10) : 100,
        status: normalizeNullableString(status, 40) || 'draft',
      }
    );
    res.status(201).json({ ok: true, assignment: result.recordset[0] });
  } catch (err) {
    console.error('teacher/assignments create error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/teacher/assignments/:assignmentId', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const assignmentId = parseInt(req.params.assignmentId, 10);
  try {
    const result = await dbModule.query(
      `SELECT AssignmentID, TeacherUID, ClassID, DeckID, Title, Instructions, DueAt, MaxPoints, Status, CreatedAt, UpdatedAt
       FROM TeacherAssignments
       WHERE AssignmentID = @assignmentId AND IsArchived = 0`,
      { assignmentId }
    );
    if (!result.recordset.length) return res.status(404).json({ error: 'Assignment not found' });
    res.json({ assignment: result.recordset[0] });
  } catch (err) {
    console.error('teacher/assignments detail error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.put('/api/teacher/assignments/:assignmentId', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const assignmentId = parseInt(req.params.assignmentId, 10);
  const { uid, classId, deckId, title, instructions, dueAt, maxPoints, status } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'uid required' });
  try {
    if (!(await ensureTeacherRole(uid))) {
      return res.status(403).json({ error: 'Teacher access required' });
    }
    const result = await dbModule.query(
      `UPDATE TeacherAssignments
       SET ClassID = @classId,
           DeckID = @deckId,
           Title = COALESCE(@title, Title),
           Instructions = @instructions,
           DueAt = @dueAt,
           MaxPoints = COALESCE(@maxPoints, MaxPoints),
           Status = COALESCE(@status, Status),
           UpdatedAt = SYSUTCDATETIME()
       WHERE AssignmentID = @assignmentId AND TeacherUID = @uid AND IsArchived = 0`,
      {
        uid,
        assignmentId,
        classId: classId ? parseInt(classId, 10) : null,
        deckId: deckId ? parseInt(deckId, 10) : null,
        title: normalizeNullableString(title, 200),
        instructions: normalizeNullableString(instructions, 4000),
        dueAt: dueAt || null,
        maxPoints: maxPoints ? parseInt(maxPoints, 10) : null,
        status: normalizeNullableString(status, 40),
      }
    );
    if (!result.rowsAffected?.[0]) return res.status(404).json({ error: 'Assignment not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('teacher/assignments update error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/teacher/assignments/:assignmentId', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const assignmentId = parseInt(req.params.assignmentId, 10);
  const uid = req.query.uid;
  if (!uid) return res.status(400).json({ error: 'uid required' });
  try {
    if (!(await ensureTeacherRole(uid))) {
      return res.status(403).json({ error: 'Teacher access required' });
    }
    const result = await dbModule.query(
      `UPDATE TeacherAssignments
       SET IsArchived = 1, UpdatedAt = SYSUTCDATETIME()
       WHERE AssignmentID = @assignmentId AND TeacherUID = @uid`,
      { assignmentId, uid }
    );
    if (!result.rowsAffected?.[0]) return res.status(404).json({ error: 'Assignment not found' });
    res.json({ ok: true, archived: true });
  } catch (err) {
    console.error('teacher/assignments delete error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ── RAG: list / manage decks ─────────────────────────────────────────────────
app.get('/api/decks', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const uid = req.query.uid;
  if (!uid) return res.status(400).json({ error: 'uid required' });
  try {
    const result = await dbModule.query(
      `SELECT DeckID, TeacherUID, Title, Description, RawText, QuestionCount, IsArchived, CreatedAt, UpdatedAt
       FROM SlideDecks
       WHERE TeacherUID = @uid
       ORDER BY CreatedAt DESC`,
      { uid }
    );
    res.json({ decks: result.recordset || [] });
  } catch (err) {
    console.error('decks list error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/decks/:deckId', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const deckId = parseInt(req.params.deckId, 10);
  try {
    const result = await dbModule.query(
      `SELECT DeckID, TeacherUID, Title, Description, RawText, QuestionCount, IsArchived, CreatedAt, UpdatedAt
       FROM SlideDecks
       WHERE DeckID = @deckId`,
      { deckId }
    );
    if (!result.recordset.length) return res.status(404).json({ error: 'Deck not found' });
    res.json({ deck: result.recordset[0] });
  } catch (err) {
    console.error('decks detail error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ── RAG: create deck ──────────────────────────────────────────────────────────
app.post('/api/decks/create', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const { uid, title, description, rawText } = req.body;
  if (!uid || !title) return res.status(400).json({ error: 'uid and title required' });
  try {
    if (!(await ensureTeacherRole(uid))) {
      return res.status(403).json({ error: 'Teacher access required' });
    }
    const result = await dbModule.query(
      `INSERT INTO SlideDecks (TeacherUID, Title, Description, RawText)
       OUTPUT INSERTED.DeckID, INSERTED.TeacherUID, INSERTED.Title, INSERTED.Description,
              INSERTED.RawText, INSERTED.QuestionCount, INSERTED.IsArchived, INSERTED.CreatedAt, INSERTED.UpdatedAt
       VALUES (@uid, @title, @description, @rawText)`,
      {
        uid,
        title,
        description: normalizeNullableString(description, 1000),
        rawText: rawText || ''
      }
    );
    res.status(201).json({ ok: true, deck: result.recordset[0] });
  } catch (err) {
    console.error('decks/create error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.put('/api/decks/:deckId', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const deckId = parseInt(req.params.deckId, 10);
  const { uid, title, description, rawText, isArchived } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'uid required' });
  try {
    if (!(await ensureTeacherRole(uid))) {
      return res.status(403).json({ error: 'Teacher access required' });
    }
    const result = await dbModule.query(
      `UPDATE SlideDecks
       SET Title = COALESCE(@title, Title),
           Description = @description,
           RawText = COALESCE(@rawText, RawText),
           IsArchived = COALESCE(@isArchived, IsArchived),
           UpdatedAt = SYSUTCDATETIME()
       WHERE DeckID = @deckId AND TeacherUID = @uid`,
      {
        uid,
        deckId,
        title: normalizeNullableString(title, 200),
        description: normalizeNullableString(description, 1000),
        rawText: normalizeNullableString(rawText, 4000),
        isArchived: typeof isArchived === 'boolean' ? (isArchived ? 1 : 0) : null,
      }
    );
    if (!result.rowsAffected?.[0]) return res.status(404).json({ error: 'Deck not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('decks update error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/decks/:deckId', async (req, res) => {
  if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
  const deckId = parseInt(req.params.deckId, 10);
  const uid = req.query.uid;
  if (!uid) return res.status(400).json({ error: 'uid required' });
  try {
    if (!(await ensureTeacherRole(uid))) {
      return res.status(403).json({ error: 'Teacher access required' });
    }
    const result = await dbModule.query(
      `UPDATE SlideDecks
       SET IsArchived = 1, UpdatedAt = SYSUTCDATETIME()
       WHERE DeckID = @deckId AND TeacherUID = @uid`,
      { deckId, uid }
    );
    if (!result.rowsAffected?.[0]) return res.status(404).json({ error: 'Deck not found' });
    res.json({ ok: true, archived: true });
  } catch (err) {
    console.error('decks delete error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ── RAG: embed deck ───────────────────────────────────────────────────────────
app.post('/api/decks/:deckId/embed', async (req, res) => {
  if (!ragModule || !dbModule) return res.status(503).json({ error: 'RAG not configured.' });
  const deckId = parseInt(req.params.deckId);
  const { rawText } = req.body;
  if (!rawText) return res.status(400).json({ error: 'rawText required' });
  res.json({ ok: true, message: 'Embedding started' });
  try {
    const count = await ragModule.embedDeck(deckId, rawText);
    await dbModule.query('UPDATE SlideDecks SET QuestionCount = @count WHERE DeckID = @deckId', { count, deckId });
  } catch (err) {
    console.error(`embed deck ${deckId} error:`, err.message);
  }
});

// ── RAG: study Q&A ────────────────────────────────────────────────────────────
app.post('/api/study/ask', async (req, res) => {
  if (!ragModule) return res.status(503).json({ error: 'RAG not configured.' });
  const { deckId, question, history } = req.body;
  if (!deckId || !question) return res.status(400).json({ error: 'deckId and question required' });
  try {
    const result = await ragModule.studyAsk(parseInt(deckId), question, history || []);
    res.json(result);
  } catch (err) {
    console.error('study/ask error:', err.message);
    res.status(500).json({ error: 'RAG error' });
  }
});

// ── DeepL Translation ─────────────────────────────────────────────────────────
const DEEPL_HARDCODED_LANGS = [
  { code: 'AR', name: 'Arabic' }, { code: 'BG', name: 'Bulgarian' },
  { code: 'ZH', name: 'Chinese (Simplified)' }, { code: 'CS', name: 'Czech' },
  { code: 'DA', name: 'Danish' }, { code: 'NL', name: 'Dutch' },
  { code: 'ET', name: 'Estonian' }, { code: 'FI', name: 'Finnish' },
  { code: 'FR', name: 'French' }, { code: 'DE', name: 'German' },
  { code: 'EL', name: 'Greek' }, { code: 'HU', name: 'Hungarian' },
  { code: 'ID', name: 'Indonesian' }, { code: 'IT', name: 'Italian' },
  { code: 'JA', name: 'Japanese' }, { code: 'KO', name: 'Korean' },
  { code: 'LV', name: 'Latvian' }, { code: 'LT', name: 'Lithuanian' },
  { code: 'NB', name: 'Norwegian' }, { code: 'PL', name: 'Polish' },
  { code: 'PT-BR', name: 'Portuguese (Brazilian)' }, { code: 'RO', name: 'Romanian' },
  { code: 'RU', name: 'Russian' }, { code: 'SK', name: 'Slovak' },
  { code: 'SL', name: 'Slovenian' }, { code: 'ES', name: 'Spanish' },
  { code: 'SV', name: 'Swedish' }, { code: 'TR', name: 'Turkish' },
  { code: 'UK', name: 'Ukrainian' },
];

function getDeepLBaseUrl() {
  const key = process.env.DEEPL_API_KEY || '';
  return key.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2'
    : 'https://api.deepl.com/v2';
}

app.post('/api/translate', async (req, res) => {
  const { text, targetLang, sourceLang } = req.body || {};
  if (!text || !targetLang) return res.status(400).json({ error: 'text and targetLang required' });
  const DEEPL_KEY = process.env.DEEPL_API_KEY;
  if (!DEEPL_KEY) return res.status(503).json({ error: 'Translation not configured. Set DEEPL_API_KEY in .env' });
  if (!axios) return res.status(503).json({ error: 'axios not available' });
  try {
    const payload = { text: [text], target_lang: targetLang.toUpperCase() };
    if (sourceLang) payload.source_lang = sourceLang.toUpperCase();
    const response = await axios.post(`${getDeepLBaseUrl()}/translate`, payload, {
      headers: { 'Authorization': `DeepL-Auth-Key ${DEEPL_KEY}`, 'Content-Type': 'application/json' },
    });
    const t = response.data.translations?.[0];
    res.json({ translatedText: t?.text || '', detectedSourceLang: t?.detected_source_language || '' });
  } catch (e) {
    const msg = e.response?.data?.message || e.message;
    res.status(500).json({ error: 'Translation failed: ' + msg });
  }
});

app.get('/api/translate/languages', async (req, res) => {
  const DEEPL_KEY = process.env.DEEPL_API_KEY;
  if (!DEEPL_KEY || !axios) return res.json({ languages: DEEPL_HARDCODED_LANGS });
  try {
    const response = await axios.get(`${getDeepLBaseUrl()}/languages?type=target`, {
      headers: { 'Authorization': `DeepL-Auth-Key ${DEEPL_KEY}` },
    });
    res.json({ languages: response.data.map(l => ({ code: l.language, name: l.name })) });
  } catch (_) {
    res.json({ languages: DEEPL_HARDCODED_LANGS });
  }
});

// ── SMS: Game Invite ──────────────────────────────────────────────────────────
app.post('/api/sms/game-invite', async (req, res) => {
  const { to, gameCode, hostName, gameType } = req.body || {};
  if (!to || !gameCode) return res.status(400).json({ error: 'to and gameCode required' });
  const gameName = gameType ? ` (${gameType})` : '';
  const result = await sendSms(to, `SlidePlay${gameName}: ${hostName || 'Your teacher'} invites you to play! Game Code: ${gameCode} — Join now at ${process.env.APP_URL || 'http://localhost:3000'}`);
  if (!result.ok) {
    const status = result.code === 'INVALID_PHONE' ? 400 : result.code === 'NOT_CONFIGURED' ? 503 : 502;
    return res.status(status).json(result);
  }
  res.json(result);
});

// ── Bulk session invite: email + SMS ─────────────────────────────────────────
// POST /api/notify-session
// Body: { code, sessionName, hostName, contacts: ["a@b.com", "+27821234567", ...] }
app.post('/api/notify-session', async (req, res) => {
  const { code, sessionName, hostName, contacts } = req.body || {};
  if (!code || !Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: 'code and contacts[] required' });
  }
  const appUrl = process.env.APP_URL || 'https://appvengers-slideplayer.onrender.com';
  const joinUrl = `${appUrl}/app/Studentdashboard.html`;
  const host = hostName || 'Your teacher';
  const sess = sessionName || 'a live session';

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phonePattern = /^\+\d{7,15}$/;

  const results = await Promise.all(contacts.map(async (contact) => {
    const c = String(contact).trim();
    if (emailPattern.test(c)) {
      // Send email
      if (!sgMail || !process.env.SENDGRID_API_KEY) {
        return { contact: c, ok: false, channel: 'email', error: 'Email not configured' };
      }
      try {
        await sgMail.send({
          to: c,
          from: SENDGRID_FROM,
          subject: `${host} invited you to join ${sess} on SlidePlay`,
          html: `
            <div style="font-family:'Segoe UI',Arial,sans-serif;background:#0a0e1a;padding:32px;border-radius:16px;max-width:520px;margin:auto;border:1px solid rgba(139,92,246,0.25);">
              <div style="text-align:center;margin-bottom:24px;">
                <span style="font-size:2rem;font-weight:800;background:linear-gradient(135deg,#8b5cf6,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">SlidePlay</span>
              </div>
              <h2 style="color:#e2e8f0;font-size:1.2rem;margin:0 0 12px;">You've been invited! 🎮</h2>
              <p style="color:#94a3b8;margin:0 0 24px;font-size:0.95rem;"><strong style="color:#c4b5fd;">${host}</strong> has started <strong style="color:#5ce8ff;">${sess}</strong> and wants you to join.</p>
              <div style="background:rgba(139,92,246,0.12);border:1px solid rgba(139,92,246,0.3);border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
                <p style="color:#a78bfa;font-size:0.8rem;margin:0 0 8px;letter-spacing:2px;font-weight:700;">SESSION CODE</p>
                <span style="font-size:2.4rem;font-weight:900;letter-spacing:10px;color:#fff;font-family:monospace;">${code}</span>
              </div>
              <div style="text-align:center;margin-bottom:20px;">
                <a href="${joinUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#06b6d4);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:1rem;">Join Session →</a>
              </div>
              <p style="color:#475569;font-size:0.78rem;text-align:center;margin:0;">Open the link, log in, and enter code <strong>${code}</strong></p>
            </div>`,
          text: `${host} invited you to ${sess} on SlidePlay.\nSession code: ${code}\nJoin at: ${joinUrl}`
        });
        return { contact: c, ok: true, channel: 'email' };
      } catch (e) {
        return { contact: c, ok: false, channel: 'email', error: e.message };
      }
    } else if (phonePattern.test(c.replace(/\s/g, ''))) {
      // Send SMS
      const smsBody = `SlidePlay: ${host} invited you to ${sess}! Code: ${code} — Join: ${joinUrl}`;
      const result = await sendSms(c, smsBody);
      return { contact: c, ...result };
    } else {
      return { contact: c, ok: false, error: 'Not a valid email or E.164 phone (+27...)' };
    }
  }));

  const sent  = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  res.json({ sent, failed, results });
});

// ── Email: Test receipt endpoint ──────────────────────────────────────────────
app.post('/api/email/test-receipt', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  const result = await sendReceipt(email, { plan: 'student_elite', provider: 'payfast', amount: 99 });
  if (!result.ok) {
    const status = result.code === 'NOT_CONFIGURED' ? 503 : 502;
    return res.status(status).json(result);
  }
  res.json(result);
});

// ── SMS: Test endpoint ────────────────────────────────────────────────────────
app.post('/api/sms/test', async (req, res) => {
  const { to } = req.body || {};
  if (!to) return res.status(400).json({ error: 'to required' });
  const result = await sendSms(to, 'SlidePlay: SMS notifications are working! 🎉');
  if (!result.ok) {
    const status = result.code === 'INVALID_PHONE' ? 400 : result.code === 'NOT_CONFIGURED' ? 503 : 502;
    return res.status(status).json(result);
  }
  res.json(result);
});

// ── Stripe (optional — falls back to demo mode if STRIPE_SECRET_KEY is not set) ───

let stripe = null;
try {
  const Stripe = require('stripe');
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    console.log('Stripe: ENABLED');
  } else {
    console.log('Stripe: DEMO MODE (set STRIPE_SECRET_KEY to enable real payments)');
  }
} catch (_) {
  console.log('Stripe: package not installed, running in demo mode');
}

const demoCheckoutSessions = new Map();

const STRIPE_PLAN_PRICES = {
  student_elite:   { monthly: 90,  yearly: 860,  name: 'Student Elite' },
  student_premium: { monthly: 150, yearly: 1400, name: 'Student Premium' },
  pro:             { monthly: 12,  yearly: 115,  name: 'Teacher Pro' },
  school:          { monthly: 49,  yearly: 470,  name: 'School Premium' },
};

function buildStripeReceiptId(sessionId) {
  return 'STRIPE-' + String(sessionId).slice(-12).toUpperCase();
}

app.post('/api/stripe/create-checkout-session', async (req, res) => {
  try {
    const { plan, billingPeriod, customerEmail, customerName, customerPhone, successUrl, cancelUrl } = req.body || {};
    if (!customerEmail || typeof customerEmail !== 'string') {
      return res.status(400).json({ error: 'customerEmail is required' });
    }
    const planConfig = STRIPE_PLAN_PRICES[plan];
    if (!planConfig) return res.status(400).json({ error: 'Invalid plan: ' + plan });
    const billing = billingPeriod === 'yearly' ? 'yearly' : 'monthly';
    const amount = billing === 'yearly' ? planConfig.yearly : planConfig.monthly;
    const interval = billing === 'yearly' ? 'year' : 'month';

    // Determine base URL for redirect (request origin or fallback)
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host  = req.headers['x-forwarded-host'] || req.headers['host'] || `localhost:${PORT}`;
    const appUrl = process.env.APP_URL || `${proto}://${host}`;

    const sUrl = successUrl || `${appUrl}/finsished%20front%20end/Testing2-SlidePlay/payment.html`;
    const cUrl = cancelUrl  || sUrl;

    const fullSuccess = new URL(sUrl.startsWith('http') ? sUrl : appUrl + sUrl);
    fullSuccess.searchParams.set('checkout', 'success');
    fullSuccess.searchParams.set('session_id', '__SESSION_ID__'); // placeholder for real Stripe
    const fullCancel = new URL(cUrl.startsWith('http') ? cUrl : appUrl + cUrl);
    fullCancel.searchParams.set('checkout', 'cancel');

    // ── DEMO MODE (no Stripe key) ───────────────────────────
    if (!stripe) {
      const sessionId = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const sessSuccess = new URL(sUrl.startsWith('http') ? sUrl : appUrl + sUrl);
      sessSuccess.searchParams.set('checkout', 'success');
      sessSuccess.searchParams.set('session_id', sessionId);
      const sessCancel = new URL(cUrl.startsWith('http') ? cUrl : appUrl + cUrl);
      sessCancel.searchParams.set('checkout', 'cancel');

      demoCheckoutSessions.set(sessionId, {
        id: sessionId, status: 'open', paymentStatus: 'unpaid',
        amountTotal: amount * 100, currency: 'zar',
        customerEmail: customerEmail.trim(),
        customerName: String(customerName || '').trim(),
        customerPhone: String(customerPhone || '').trim(),
        plan, billing, planName: planConfig.name,
        successUrl: sessSuccess.toString(),
        cancelUrl: sessCancel.toString(),
        createdAt: Date.now(),
      });

      const demoUrl = new URL(`${appUrl}/demo-checkout.html`);
      demoUrl.searchParams.set('session_id', sessionId);
      demoUrl.searchParams.set('plan_name', planConfig.name);
      demoUrl.searchParams.set('amount', String(amount));
      demoUrl.searchParams.set('billing', billing);
      demoUrl.searchParams.set('email', customerEmail.trim());

      return res.json({ id: sessionId, url: demoUrl.toString(), mode: 'demo' });
    }

    // ── REAL STRIPE ──────────────────────────────────────────
    const successStripe = new URL(sUrl.startsWith('http') ? sUrl : appUrl + sUrl);
    successStripe.searchParams.set('checkout', 'success');
    successStripe.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: customerEmail.trim(),
      success_url: successStripe.toString(),
      cancel_url: fullCancel.toString(),
      billing_address_collection: 'auto',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'zar',
          unit_amount: amount * 100,
          recurring: { interval },
          product_data: { name: planConfig.name, description: `SlidePlay ${planConfig.name} (${billing})` },
        },
      }],
      metadata: { plan, billing, customerEmail: customerEmail.trim(), customerName: String(customerName || '').trim() },
    });

    return res.json({ id: session.id, url: session.url, mode: 'stripe' });
  } catch (e) {
    console.error('stripe create-checkout-session error:', e.message);
    return res.status(500).json({ error: e.message || 'Failed to create Stripe checkout session' });
  }
});

app.get('/api/stripe/checkout-session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const demo = demoCheckoutSessions.get(sessionId);
    if (demo) {
      return res.json({
        id: demo.id, status: demo.status, paymentStatus: demo.paymentStatus,
        amountTotal: demo.amountTotal, currency: demo.currency,
        customerEmail: demo.customerEmail, receiptId: buildStripeReceiptId(demo.id),
        metadata: { plan: demo.plan, billing: demo.billing },
      });
    }
    if (!stripe) return res.status(404).json({ error: 'Session not found and no Stripe key configured.' });
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return res.json({
      id: session.id, status: session.status, paymentStatus: session.payment_status,
      amountTotal: session.amount_total, currency: session.currency,
      customerEmail: session.customer_details?.email || session.customer_email || '',
      receiptId: buildStripeReceiptId(session.id),
      metadata: {
        plan: session.metadata?.plan || '',
        billing: session.metadata?.billing || 'monthly',
      },
    });
  } catch (e) {
    console.error('stripe checkout-session error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/demo-checkout/:sessionId/complete', async (req, res) => {
  const session = demoCheckoutSessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Demo session not found.' });
  session.status = 'complete';
  session.paymentStatus = 'paid';
  demoCheckoutSessions.set(session.id, session);

  // Save to SQL DB so admin dashboard reflects the payment
  if (session.customerEmail && dbModule) {
    const amountZAR = session.amountTotal ? session.amountTotal / 100 : 0;
    savePaymentStatus(session.customerEmail, session.plan || 'pro', 'COMPLETE', 'stripe', amountZAR).catch(() => {});
  }

  if (session.customerPhone) {
    await sendSms(session.customerPhone, `SlidePlay: Your Stripe payment for ${session.planName || 'Premium'} is confirmed! Access unlocked. 🎉`);
  }
  if (session.customerEmail) {
    await sendReceipt(session.customerEmail, { plan: session.planName, provider: 'stripe', amount: session.amountTotal ? session.amountTotal / 100 : null });
  }
  return res.json({ id: session.id, redirectUrl: session.successUrl });
});

app.post('/api/demo-checkout/:sessionId/cancel', (req, res) => {
  const session = demoCheckoutSessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Demo session not found.' });
  session.status = 'expired';
  session.paymentStatus = 'unpaid';
  demoCheckoutSessions.set(session.id, session);
  return res.json({ id: session.id, redirectUrl: session.cancelUrl });
});

// ── Admin Stats ───────────────────────────────────────────────────────────────
const PLAN_PRICES = {
  student_elite:   { monthly: 90,  yearly: 860,  name: 'Student Elite' },
  student_premium: { monthly: 150, yearly: 1400, name: 'Student Premium' },
  pro:             { monthly: 12,  yearly: 115,  name: 'Teacher Pro' },
  school:          { monthly: 49,  yearly: 470,  name: 'School Premium' },
};

app.get('/api/admin/stats', async (req, res) => {
  try {
    const counts        = { total: 0, students: 0, teachers: 0, admins: 0 };
    const recentUsers   = [];
    const recentSessions = [];
    let activeSubscriptions = 0;
    let onlineToday     = 0;
    let totalRevenue    = 0;
    let mrr             = 0;
    const planBreakdown = [];
    const usersPerDay   = [];

    if (dbModule) {
      const { query } = dbModule;

      // Role counts
      const roleRes = await query(
        `SELECT Role, COUNT(*) AS cnt FROM Users GROUP BY Role`, {});
      for (const row of (roleRes.recordset || [])) {
        const r = (row.Role || '').toLowerCase();
        const n = parseInt(row.cnt || 0, 10);
        counts.total += n;
        if (r === 'student') counts.students = n;
        else if (r === 'teacher') counts.teachers = n;
        else if (r === 'admin') counts.admins = n;
      }

      // Recent signups
      const recentRes = await query(
        `SELECT TOP 10 DisplayName, Email, Role, CreatedAt FROM Users ORDER BY CreatedAt DESC`, {});
      for (const row of (recentRes.recordset || [])) {
        recentUsers.push({ name: row.DisplayName || row.Email || 'Unknown', email: row.Email, role: row.Role, createdAt: row.CreatedAt });
      }

      // Recent game sessions
      const sessRes = await query(
        `SELECT TOP 5 SessionCode, Status, CreatedAt FROM GameSessions ORDER BY CreatedAt DESC`, {});
      for (const row of (sessRes.recordset || [])) {
        recentSessions.push({ code: row.SessionCode, status: row.Status, createdAt: row.CreatedAt });
      }

      // Active subscriptions + plan breakdown
      const subRes = await query(
        `SELECT [Plan], COUNT(*) AS cnt FROM Subscriptions WHERE [Status] = 'active' GROUP BY [Plan]`, {});
      for (const row of (subRes.recordset || [])) {
        const n    = parseInt(row.cnt || 0, 10);
        const plan = (row.Plan || '').toLowerCase();
        const info = PLAN_PRICES[plan] || { monthly: 0, name: row.Plan };
        const rev  = info.monthly * n;
        activeSubscriptions += n;
        mrr += rev;
        planBreakdown.push({ plan: info.name || row.Plan, count: n, monthlyRevenue: rev, priceEach: info.monthly });
      }

      // Total all-time revenue from Payments table
      try {
        const revRes = await query(
          `SELECT SUM(AmountZAR) AS total FROM Payments WHERE [Status] = 'succeeded'`, {});
        totalRevenue = parseFloat((revRes.recordset[0] || {}).total || 0);
      } catch (_) {}

      // Logins today
      try {
        const onlineRes = await query(
          `SELECT COUNT(*) AS cnt FROM Users WHERE CAST(LastLoginAt AS DATE) = CAST(GETDATE() AS DATE)`, {});
        onlineToday = parseInt((onlineRes.recordset[0] || {}).cnt || 0, 10);
      } catch (_) {}

      // New users per day — last 14 days
      try {
        const dayRes = await query(`
          SELECT CAST(CreatedAt AS DATE) AS day, COUNT(*) AS cnt
          FROM Users
          WHERE CreatedAt >= DATEADD(DAY, -13, CAST(GETDATE() AS DATE))
          GROUP BY CAST(CreatedAt AS DATE)
          ORDER BY day ASC`, {});
        // Fill all 14 days (zero for missing days)
        for (let i = 13; i >= 0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          const found = (dayRes.recordset || []).find(r => {
            const rv = r.day instanceof Date ? r.day.toISOString().slice(0,10) : String(r.day).slice(0,10);
            return rv === key;
          });
          usersPerDay.push({ date: key, count: found ? parseInt(found.cnt || 0, 10) : 0 });
        }
      } catch (_) {}
    }

    res.json({
      counts, onlineToday, activeSubscriptions,
      totalRevenue, mrr, planBreakdown,
      recentUsers, recentSessions, usersPerDay,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Admin stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: game sessions ────────────────────────────────────────────────────
app.get('/api/admin/sessions', async (req, res) => {
  try {
    if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
    const { query } = dbModule;
    const result = await query(
      `SELECT TOP 50
         gs.SessionCode, gs.[Status], gs.CreatedAt, gs.EndedAt,
         ISNULL(gs.GameType,'unknown') AS GameType,
         ISNULL(gs.GameMode,'multiplayer') AS GameMode,
         ISNULL(u.DisplayName, gs.TeacherUID) AS HostName,
         (SELECT COUNT(*) FROM SessionPlayers sp WHERE sp.SessionID = gs.SessionID) AS PlayerCount,
         (SELECT TOP 1 sp2.DisplayName FROM SessionPlayers sp2 WHERE sp2.SessionID = gs.SessionID ORDER BY sp2.TotalScore DESC) AS WinnerName,
         (SELECT TOP 1 sp3.TotalScore FROM SessionPlayers sp3 WHERE sp3.SessionID = gs.SessionID ORDER BY sp3.TotalScore DESC) AS WinnerScore
       FROM GameSessions gs
       LEFT JOIN Users u ON u.FirebaseUID = gs.TeacherUID
       ORDER BY gs.CreatedAt DESC`, {});
    // Also pull in-memory active rooms for live data
    const liveRooms = [];
    for (const [code, room] of rooms.entries()) {
      liveRooms.push({
        SessionCode: code,
        Status: room.status,
        GameType: room.gameLabel,
        GameMode: room.gameMode || 'multiplayer',
        HostName: room.hostName || 'Unknown',
        WinnerName: null,
        WinnerScore: null,
        PlayerCount: room.players.length,
        CreatedAt: new Date(room.createdAt).toISOString(),
        EndedAt: null,
        live: true
      });
    }
    res.json({ sessions: result.recordset || [], liveRooms });
  } catch (err) {
    console.error('Admin sessions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: payment records ───────────────────────────────────────────────
app.get('/api/admin/payments', async (req, res) => {
  try {
    if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
    const { query } = dbModule;
    const result = await query(
      `SELECT TOP 100
         p.FirebaseUID, p.[Plan], p.AmountZAR, p.BillingCycle, p.Provider, p.[Status],
         p.CreatedAt,
         u.DisplayName, u.Email
       FROM Payments p
       LEFT JOIN Users u ON u.FirebaseUID = p.FirebaseUID
       ORDER BY p.CreatedAt DESC`, {});
    res.json({ payments: result.recordset || [] });
  } catch (err) {
    console.error('Admin payments error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: all users list ────────────────────────────────────────────────
app.get('/api/admin/users', async (req, res) => {
  try {
    if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
    const { query } = dbModule;
    const result = await query(
      `SELECT
         u.FirebaseUID, u.Email, u.DisplayName, u.Role, u.AuthProvider,
         u.CreatedAt, u.LastLoginAt,
         (SELECT TOP 1 p.[Plan] FROM Payments p WHERE p.FirebaseUID = u.FirebaseUID AND p.[Status]='succeeded' ORDER BY p.CreatedAt DESC) AS CurrentPlan,
         ISNULL((SELECT SUM(p2.AmountZAR) FROM Payments p2 WHERE p2.FirebaseUID = u.FirebaseUID AND p2.[Status]='succeeded'), 0) AS TotalSpent,
         (SELECT COUNT(*) FROM SessionPlayers sp WHERE sp.StudentUID = u.FirebaseUID) AS GamesPlayed
       FROM Users u
       ORDER BY u.CreatedAt DESC`, {});
    res.json({ users: result.recordset || [] });
  } catch (err) {
    console.error('Admin users error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: single user detailed profile ─────────────────────────────────
app.get('/api/admin/users/:uid', async (req, res) => {
  try {
    if (!dbModule) return res.status(503).json({ error: 'DB not configured.' });
    const { query } = dbModule;
    const uid = req.params.uid;
    const [userRes, paymentsRes, sessionsRes] = await Promise.all([
      query(`SELECT u.FirebaseUID, u.Email, u.DisplayName, u.Role, u.AuthProvider, u.CreatedAt, u.LastLoginAt FROM Users u WHERE u.FirebaseUID = @uid`, { uid }),
      query(`SELECT p.[Plan], p.AmountZAR, p.BillingCycle, p.Provider, p.[Status], p.CreatedAt, p.CouponCode, p.DiscountPct FROM Payments p WHERE p.FirebaseUID = @uid ORDER BY p.CreatedAt DESC`, { uid }),
      query(`SELECT gs.SessionCode, gs.GameType, gs.GameMode, sp.TotalScore, sp.JoinedAt, gs.[Status] FROM SessionPlayers sp JOIN GameSessions gs ON gs.SessionID = sp.SessionID WHERE sp.StudentUID = @uid ORDER BY sp.JoinedAt DESC`, { uid })
    ]);
    if (!userRes.recordset.length) return res.status(404).json({ error: 'User not found' });
    res.json({
      user: userRes.recordset[0],
      payments: paymentsRes.recordset || [],
      sessions: sessionsRes.recordset || []
    });
  } catch (err) {
    console.error('Admin user profile error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════

async function startServer() {
  await configureSocketIoAdapter();

  httpServer.listen(PORT, async () => {
    console.log(`SlidePlay server running on http://localhost:${PORT}`);
    if (SOCKET_IO_REQUIRE_REDIS && socketAdapterMode !== 'redis') {
      console.warn('Multiplayer readiness: NOT READY - Redis is required but not connected. /api/ready will return 503.');
    } else if (SOCKET_IO_USE_REDIS && SOCKET_IO_REDIS_URL && socketAdapterMode === 'redis') {
      console.log('Multiplayer readiness: READY - Redis-backed Socket.IO is active.');
    }
    if (GROQ_API_KEY) {
      console.log(`Groq AI: ENABLED (${GROQ_MODEL})`);
    } else if (GEMINI_API_KEY) {
      console.log('Groq AI: DISABLED — falling back to Gemini (set GROQ_API_KEY in .env for better quota)');
    } else {
      console.log('AI quiz generation: DISABLED (set GROQ_API_KEY in .env to enable)');
    }
    if (HUGGING_FACE_API_KEY) {
      console.log(`Hugging Face AI quiz generation: ENABLED (${HUGGING_FACE_MODEL})`);
    } else {
      console.log('Hugging Face AI quiz generation: DISABLED (set HUGGING_FACE_API_KEY in .env to enable)');
    }
    if (dbModule) {
      try {
        await dbModule.getPool();
        // Migrate: add columns to GameSessions if missing
        const migrations = [
          `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='Users')
            CREATE TABLE dbo.Users (
              FirebaseUID NVARCHAR(255) PRIMARY KEY,
              Email NVARCHAR(255) NOT NULL,
              DisplayName NVARCHAR(255) NULL,
              Role NVARCHAR(50) NOT NULL DEFAULT 'student',
              AuthProvider NVARCHAR(50) NULL,
              Bio NVARCHAR(1000) NULL,
              AvatarUrl NVARCHAR(1000) NULL,
              GradeLevel NVARCHAR(80) NULL,
              SchoolName NVARCHAR(200) NULL,
              PreferencesJson NVARCHAR(MAX) NULL,
              IsDeleted BIT NOT NULL DEFAULT 0,
              CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
              LastLoginAt DATETIME NULL,
              DeactivatedAt DATETIME NULL
            )`,
          `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='GameSessions')
            CREATE TABLE dbo.GameSessions (SessionID INT IDENTITY(1,1) PRIMARY KEY, SessionCode NVARCHAR(10) NOT NULL, [Status] NVARCHAR(20) NOT NULL DEFAULT 'waiting', GameType NVARCHAR(64) DEFAULT 'unknown', GameMode NVARCHAR(20) DEFAULT 'multiplayer', TeacherUID NVARCHAR(255), CreatedAt DATETIME DEFAULT GETUTCDATE(), EndedAt DATETIME)`,
          `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='SessionPlayers')
            CREATE TABLE dbo.SessionPlayers (PlayerID INT IDENTITY(1,1) PRIMARY KEY, SessionID INT NOT NULL, StudentUID NVARCHAR(255), DisplayName NVARCHAR(255), TotalScore INT DEFAULT 0, JoinedAt DATETIME DEFAULT GETUTCDATE())`,
          `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='SlideDecks')
            CREATE TABLE dbo.SlideDecks (
              DeckID INT IDENTITY(1,1) PRIMARY KEY,
              TeacherUID NVARCHAR(255) NOT NULL,
              Title NVARCHAR(200) NOT NULL,
              Description NVARCHAR(1000) NULL,
              RawText NVARCHAR(MAX) NULL,
              QuestionCount INT NOT NULL DEFAULT 0,
              IsArchived BIT NOT NULL DEFAULT 0,
              CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
              UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE()
            )`,
          `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='StudentNotes')
            CREATE TABLE dbo.StudentNotes (
              NoteID INT IDENTITY(1,1) PRIMARY KEY,
              FirebaseUID NVARCHAR(255) NOT NULL,
              Title NVARCHAR(200) NOT NULL,
              Content NVARCHAR(4000) NOT NULL DEFAULT '',
              Subject NVARCHAR(120) NULL,
              TagsJson NVARCHAR(MAX) NULL,
              IsPinned BIT NOT NULL DEFAULT 0,
              CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
              UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE()
            )`,
          `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='UserBookmarks')
            CREATE TABLE dbo.UserBookmarks (
              BookmarkID INT IDENTITY(1,1) PRIMARY KEY,
              FirebaseUID NVARCHAR(255) NOT NULL,
              ResourceType NVARCHAR(80) NOT NULL,
              ResourceId NVARCHAR(120) NULL,
              Title NVARCHAR(200) NOT NULL,
              Url NVARCHAR(1000) NULL,
              MetadataJson NVARCHAR(MAX) NULL,
              CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE()
            )`,
          `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='UserNotifications')
            CREATE TABLE dbo.UserNotifications (
              NotificationID INT IDENTITY(1,1) PRIMARY KEY,
              FirebaseUID NVARCHAR(255) NOT NULL,
              Type NVARCHAR(80) NOT NULL DEFAULT 'general',
              Title NVARCHAR(200) NOT NULL,
              Message NVARCHAR(2000) NOT NULL,
              LinkUrl NVARCHAR(1000) NULL,
              IsRead BIT NOT NULL DEFAULT 0,
              CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
              ReadAt DATETIME NULL
            )`,
          `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='TeacherClasses')
            CREATE TABLE dbo.TeacherClasses (
              ClassID INT IDENTITY(1,1) PRIMARY KEY,
              TeacherUID NVARCHAR(255) NOT NULL,
              ClassCode NVARCHAR(12) NOT NULL,
              Name NVARCHAR(200) NOT NULL,
              Subject NVARCHAR(120) NULL,
              Description NVARCHAR(2000) NULL,
              GradeLevel NVARCHAR(80) NULL,
              IsArchived BIT NOT NULL DEFAULT 0,
              CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
              UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE()
            )`,
          `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='ClassStudents')
            CREATE TABLE dbo.ClassStudents (
              ClassStudentID INT IDENTITY(1,1) PRIMARY KEY,
              ClassID INT NOT NULL,
              StudentUID NVARCHAR(255) NOT NULL,
              DisplayName NVARCHAR(200) NULL,
              Status NVARCHAR(30) NOT NULL DEFAULT 'active',
              JoinedAt DATETIME NOT NULL DEFAULT GETUTCDATE()
            )`,
          `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='TeacherAssignments')
            CREATE TABLE dbo.TeacherAssignments (
              AssignmentID INT IDENTITY(1,1) PRIMARY KEY,
              TeacherUID NVARCHAR(255) NOT NULL,
              ClassID INT NULL,
              DeckID INT NULL,
              Title NVARCHAR(200) NOT NULL,
              Instructions NVARCHAR(4000) NULL,
              DueAt DATETIME NULL,
              MaxPoints INT NOT NULL DEFAULT 100,
              Status NVARCHAR(40) NOT NULL DEFAULT 'draft',
              IsArchived BIT NOT NULL DEFAULT 0,
              CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
              UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE()
            )`,
          `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='PremiumGameReports')
            CREATE TABLE dbo.PremiumGameReports (
              ReportID INT IDENTITY(1,1) PRIMARY KEY,
              FirebaseUID NVARCHAR(255) NOT NULL,
              GameType NVARCHAR(80) NOT NULL,
              SessionCode NVARCHAR(32) NULL,
              Score INT NOT NULL DEFAULT 0,
              TotalQuestions INT NOT NULL DEFAULT 0,
              CorrectCount INT NOT NULL DEFAULT 0,
              DurationSec INT NOT NULL DEFAULT 0,
              AttemptsJson NVARCHAR(MAX) NULL,
              ReportText NVARCHAR(MAX) NOT NULL,
              MetaJson NVARCHAR(MAX) NULL,
              CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE()
            )`,
          `IF COL_LENGTH('Users', 'Bio') IS NULL ALTER TABLE dbo.Users ADD Bio NVARCHAR(1000) NULL`,
          `IF COL_LENGTH('Users', 'AvatarUrl') IS NULL ALTER TABLE dbo.Users ADD AvatarUrl NVARCHAR(1000) NULL`,
          `IF COL_LENGTH('Users', 'GradeLevel') IS NULL ALTER TABLE dbo.Users ADD GradeLevel NVARCHAR(80) NULL`,
          `IF COL_LENGTH('Users', 'SchoolName') IS NULL ALTER TABLE dbo.Users ADD SchoolName NVARCHAR(200) NULL`,
          `IF COL_LENGTH('Users', 'PreferencesJson') IS NULL ALTER TABLE dbo.Users ADD PreferencesJson NVARCHAR(MAX) NULL`,
          `IF COL_LENGTH('Users', 'IsDeleted') IS NULL ALTER TABLE dbo.Users ADD IsDeleted BIT NOT NULL CONSTRAINT DF_Users_IsDeleted DEFAULT 0`,
          `IF COL_LENGTH('Users', 'CreatedAt') IS NULL ALTER TABLE dbo.Users ADD CreatedAt DATETIME NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT GETUTCDATE()`,
          `IF COL_LENGTH('Users', 'DeactivatedAt') IS NULL ALTER TABLE dbo.Users ADD DeactivatedAt DATETIME NULL`,
          `IF COL_LENGTH('SlideDecks', 'Description') IS NULL ALTER TABLE dbo.SlideDecks ADD Description NVARCHAR(1000) NULL`,
          `IF COL_LENGTH('SlideDecks', 'QuestionCount') IS NULL ALTER TABLE dbo.SlideDecks ADD QuestionCount INT NOT NULL CONSTRAINT DF_SlideDecks_QuestionCount DEFAULT 0`,
          `IF COL_LENGTH('SlideDecks', 'IsArchived') IS NULL ALTER TABLE dbo.SlideDecks ADD IsArchived BIT NOT NULL CONSTRAINT DF_SlideDecks_IsArchived DEFAULT 0`,
          `IF COL_LENGTH('SlideDecks', 'CreatedAt') IS NULL ALTER TABLE dbo.SlideDecks ADD CreatedAt DATETIME NOT NULL CONSTRAINT DF_SlideDecks_CreatedAt DEFAULT GETUTCDATE()`,
          `IF COL_LENGTH('SlideDecks', 'UpdatedAt') IS NULL ALTER TABLE dbo.SlideDecks ADD UpdatedAt DATETIME NOT NULL CONSTRAINT DF_SlideDecks_UpdatedAt DEFAULT GETUTCDATE()`,
        ];
        for (const sql of migrations) {
          try { await dbModule.query(sql, {}); } catch (me) { console.warn('Migration warning:', me.message); }
        }
        console.log('DB migrations applied');
      } catch (e) { console.warn('DB connection failed (non-fatal):', e.message); }
    }
  });
}

startServer().catch((e) => {
  console.error('Server startup failed:', e.message);
  process.exit(1);
});
