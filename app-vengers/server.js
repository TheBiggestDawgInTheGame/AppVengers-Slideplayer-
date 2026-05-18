// Integrating SendGrid+ API to send welcome email to new users after signing up

const express = require("express");
const crypto = require("crypto");
const path = require("path");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const AdmZip = require("adm-zip");
const fs = require("fs");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function extractPptxText(buffer) {
  const zip = new AdmZip(buffer);
  let text = "";
  zip.getEntries().forEach(function(entry) {
    if (/^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName)) {
      const xml = entry.getData().toString("utf8");
      const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
      text += matches.map(function(m) { return m.replace(/<[^>]+>/g, ""); }).join(" ") + "\n";
    }
  });
  return text.trim();
}

function extractXlsxText(buffer) {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("xl/sharedStrings.xml");
  if (!entry) return "";
  const xml = entry.getData().toString("utf8");
  return (xml.match(/<t[^>]*>([^<]*)<\/t>/g) || []).map(function(m) { return m.replace(/<[^>]+>/g, ""); }).join(" ");
}

function extractOdtText(buffer) {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("content.xml");
  if (!entry) return "";
  return entry.getData().toString("utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractRtfText(buffer) {
  let text = buffer.toString("latin1");
  // Strip RTF control words, groups, and binary blobs
  text = text.replace(/\\bin\d+[^}]*/g, "");
  text = text.replace(/\\[a-z]+[-]?\d*\s?/gi, "");
  text = text.replace(/[{}\\]/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

async function extractTextFromImage(buffer, mimetype, filename) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return "[Image: " + filename + " — GEMINI_API_KEY not set]";
  const base64 = buffer.toString("base64");
  const mimeType = mimetype && mimetype.startsWith("image/") ? mimetype : "image/jpeg";
  const body = {
    contents: [{ parts: [
      { text: "Extract all visible text from this image. If it contains diagrams, charts, questions, or educational content, describe the key concepts, questions, and information presented. Return the extracted text and a concise content description." },
      { inline_data: { mime_type: mimeType, data: base64 } }
    ]}]
  };
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiKey,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  const data = await response.json();
  if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  }
  return "[Image: " + filename + " — could not extract text]";
}
const app = express();
require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const PORT = process.env.PORT || 3000;

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

app.use(express.json());
app.use(express.static("public"));

const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.post("/send-welcome-email",async(req,res)=>{
  const {email}=req.body;
  const msg = {
  to: email,
  from:"slideplayer90@gmail.com",
  subject:"Welcome to SlidePlayer!",
  text:"Thank you for signing up for SlidePlayer! We're excited to have you on board. If you have any questions or need assistance, feel free to reach out to our support team.",
};

try{
  await sgMail.send(msg);
  res.status(200).send("Email sent");
}
catch(error){
  console.error(error);
  res.status(500).send("Error sending email");
}
});

// ── Stripe price IDs ─────────────────────────────────────────────────────────
// Replace the placeholder values with your actual Stripe Price IDs from the
// Stripe Dashboard (Products → select product → copy price ID).
const STRIPE_PRICES = {
  teacher: {
    pro:     { monthly: "price_teacher_pro_monthly",     yearly: "price_teacher_pro_yearly"     },
    school:  { monthly: "price_teacher_school_monthly",  yearly: "price_teacher_school_yearly"  },
  },
  student: {
    student_plus:  { monthly: "price_student_plus_monthly",  yearly: "price_student_plus_yearly"  },
    student_elite: { monthly: "price_student_elite_monthly", yearly: "price_student_elite_yearly" },
  },
};

// POST /api/payments/create-checkout-session
app.post("/api/payments/create-checkout-session", async (req, res) => {
  try {
    const { plan, billing, role = "teacher", appliedDiscount = 0 } = req.body;

    const roleKey   = role === "student" ? "student" : "teacher";
    const billingKey = billing === "yearly" ? "yearly" : "monthly";
    const priceId   = STRIPE_PRICES[roleKey]?.[plan]?.[billingKey];

    if (!priceId) {
      return res.status(400).json({ error: "Invalid plan or billing period." });
    }

    const sessionParams = {
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${process.env.CLIENT_URL || "http://localhost:3000"}/app-vengers/payment.html?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url:  `${process.env.CLIENT_URL || "http://localhost:3000"}/app-vengers/payment.html?status=cancelled`,
      metadata: { plan, billing: billingKey, role: roleKey },
    };

    // Apply coupon discount if provided
    if (appliedDiscount > 0) {
      const coupon = await stripe.coupons.create({
        percent_off: appliedDiscount,
        duration: "once",
      });
      sessionParams.discounts = [{ coupon: coupon.id }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ---------- 1) Open Trivia ----------
app.get("/api/trivia", async (req, res) => {
  try {
    const amount = Math.max(1, Math.min(20, Number(req.query.amount) || 5));
    const difficulty = req.query.difficulty ? `&difficulty=${encodeURIComponent(req.query.difficulty)}` : "";
    const category = req.query.category ? `&category=${encodeURIComponent(req.query.category)}` : "";
    const type = "&type=multiple";

    const url = `https://opentdb.com/api.php?amount=${amount}${difficulty}${category}${type}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !Array.isArray(data.results)) {
      return res.status(500).json({ error: "Failed to fetch Open Trivia questions." });
    }

    const questions = data.results.map((q) => {
      const options = shuffle([q.correct_answer, ...q.incorrect_answers]);
      return {
        question: q.question,
        options,
        correctIndex: options.indexOf(q.correct_answer),
        category: q.category,
        difficulty: q.difficulty
      };
    });

    res.json({ source: "opentdb", count: questions.length, questions });
  } catch (err) {
    res.status(500).json({ error: err.message || "Trivia API error." });
  }
});

// ---------- 2) Hugging Face AI Quiz ----------
const HF_API_KEY = process.env.HUGGING_FACE_API_KEY || "";
const HF_MODEL = process.env.HUGGING_FACE_MODEL || "mistralai/Mistral-7B-Instruct-v0.3";
const HF_URL = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

app.post("/api/quiz/huggingface", async (req, res) => {
  try {
    if (!HF_API_KEY) {
      return res.status(500).json({ error: "Missing HUGGING_FACE_API_KEY in .env" });
    }

    const text = String(req.body?.text || "").trim();
    const count = Math.max(3, Math.min(15, Number(req.body?.count) || 5));

    if (!text) {
      return res.status(400).json({ error: "Body must include non-empty 'text'." });
    }

    const prompt = `
You are an expert teacher.
Generate exactly ${count} multiple-choice quiz questions from the content below.
Return ONLY valid JSON array:
[{"question":"...","options":["...","...","...","..."],"correct":0}]
Rules:
- 4 options each
- correct is 0-3
- no markdown

Content:
${text.slice(0, 50000)}
`;

    const hfRes = await fetch(HF_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { max_new_tokens: 1200, temperature: 0.2, return_full_text: false },
        options: { wait_for_model: true, use_cache: false }
      })
    });

    const hfData = await hfRes.json();
    const outputText = Array.isArray(hfData)
      ? String(hfData[0]?.generated_text || "")
      : String(hfData?.generated_text || hfData?.error || "");

    const jsonMatch = outputText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(500).json({ error: "Hugging Face response did not contain quiz JSON." });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const valid = parsed.filter(
      (q) =>
        q &&
        typeof q.question === "string" &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        Number.isInteger(q.correct) &&
        q.correct >= 0 &&
        q.correct <= 3
    );

    res.json({ source: "huggingface", count: valid.length, questions: valid });
  } catch (err) {
    res.status(500).json({ error: err.message || "Hugging Face quiz generation failed." });
  }
});

// ---------- 3) NOWPayments Crypto ----------
// Coinbase Commerce was shut down March 31, 2026.
// NOWPayments is a globally available replacement (300+ cryptos, works in SA).
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || "";
const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET || "";

// Create a hosted payment invoice — redirects user to NOWPayments payment page
app.post("/api/payments/create-crypto-charge", async (req, res) => {
  try {
    if (!NOWPAYMENTS_API_KEY) {
      return res.status(500).json({ error: "Missing NOWPAYMENTS_API_KEY in .env" });
    }

    const { name, description, amountUsd, metadata } = req.body || {};
    const amount = Number(amountUsd || 0);

    if (!name || !amount || amount <= 0) {
      return res.status(400).json({ error: "name and amountUsd are required." });
    }

    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

    const payload = {
      price_amount: amount.toFixed(2),
      price_currency: "usd",
      order_description: description || name,
      order_id: metadata?.plan ? `sp-${metadata.plan}-${Date.now()}` : `sp-${Date.now()}`,
      success_url: `${clientUrl}/app-vengers/payment.html?crypto_status=success`,
      cancel_url:  `${clientUrl}/app-vengers/payment.html?crypto_status=cancelled`
    };

    const npRes = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": NOWPAYMENTS_API_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await npRes.json();

    if (!npRes.ok || !data.invoice_url) {
      return res.status(500).json({ error: data?.message || "Failed to create NOWPayments invoice." });
    }

    res.json({
      id: data.id,
      hostedUrl: data.invoice_url
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Crypto charge error." });
  }
});

// NOWPayments IPN webhook (HMAC-SHA512 signature verification)
app.post("/api/payments/coinbase/webhook", express.raw({ type: "application/json" }), (req, res) => {
  try {
    if (!NOWPAYMENTS_IPN_SECRET) {
      return res.status(500).json({ error: "Missing NOWPAYMENTS_IPN_SECRET in .env" });
    }

    const signature = String(req.headers["x-nowpayments-sig"] || "");
    if (!signature) {
      return res.status(400).json({ error: "Missing x-nowpayments-sig header." });
    }

    const expected = crypto
      .createHmac("sha512", NOWPAYMENTS_IPN_SECRET)
      .update(req.body)
      .digest("hex");

    if (signature !== expected) {
      return res.status(400).json({ error: "Invalid IPN signature." });
    }

    const event = JSON.parse(req.body.toString("utf8"));
    if (event?.payment_status === "confirmed" || event?.payment_status === "finished") {
      console.log("NOWPayments confirmed:", event?.payment_id, event?.order_id);
    }

    res.json({ received: true });
  } catch (err) {
    res.status(400).json({ error: err.message || "Webhook error." });
  }
});

// ---------- 3b) Leaderboard ----------
const LEADERBOARD_FILE = path.join(__dirname, "leaderboard.json");

function loadLeaderboard() {
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      return JSON.parse(fs.readFileSync(LEADERBOARD_FILE, "utf8"));
    }
  } catch (e) { console.warn("Could not load leaderboard.json:", e.message); }
  return {};
}

function saveLeaderboard() {
  try { fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboardStore, null, 2), "utf8"); }
  catch (e) { console.warn("Could not save leaderboard.json:", e.message); }
}

const leaderboardStore = loadLeaderboard(); // { [game]: [{ name, score, ts }] }
const MAX_ENTRIES_PER_GAME = 100;

app.get("/api/leaderboard", (req, res) => {
  const game = String(req.query.game || "global").toLowerCase();
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const entries = (leaderboardStore[game] || []).slice(0, limit);
  res.json({ game, entries });
});

app.post("/api/leaderboard", (req, res) => {
  const { game, name, score } = req.body || {};
  if (!game || !name || score == null || isNaN(Number(score))) {
    return res.status(400).json({ error: "game, name, and score are required." });
  }
  const key = String(game).toLowerCase();
  if (!leaderboardStore[key]) leaderboardStore[key] = [];

  leaderboardStore[key].push({
    name: String(name).slice(0, 40),
    score: Number(score),
    ts: new Date().toISOString(),
  });

  // Keep sorted descending, trim to max
  leaderboardStore[key].sort((a, b) => b.score - a.score);
  leaderboardStore[key] = leaderboardStore[key].slice(0, MAX_ENTRIES_PER_GAME);
  saveLeaderboard();

  const rank = leaderboardStore[key].findIndex((e) => e.name === String(name).slice(0, 40)) + 1;
  res.json({ ok: true, rank });
});

// ---------- 4) Gemini AI Quiz ----------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

app.post("/api/quiz/gemini", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY in .env" });
    }

    const text  = String(req.body?.text  || "").trim();
    const count = Math.max(3, Math.min(20, Number(req.body?.count) || 5));

    if (!text) {
      return res.status(400).json({ error: "Body must include non-empty 'text'." });
    }

    const prompt = `You are an expert teacher.
Generate exactly ${count} multiple-choice quiz questions from the content below.
Return ONLY a valid JSON array — no markdown, no explanation:
[{"question":"...","options":["...","...","...","..."],"correct":0}]
Rules: 4 options each, correct is 0-3 index.

Content:
${text.slice(0, 50000)}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
        })
      }
    );

    const geminiData = await geminiRes.json();
    const outputText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const jsonMatch = outputText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(500).json({ error: "Gemini did not return quiz JSON." });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const valid = parsed.filter(
      (q) => q && typeof q.question === "string" &&
        Array.isArray(q.options) && q.options.length === 4 &&
        Number.isInteger(q.correct) && q.correct >= 0 && q.correct <= 3
    );

    res.json({ source: "gemini", count: valid.length, questions: valid });
  } catch (err) {
    res.status(500).json({ error: err.message || "Gemini quiz generation failed." });
  }
});

// ---------- 5) PayFast (SA payment gateway) ----------
const PF_MERCHANT_ID  = process.env.PAYFAST_MERCHANT_ID  || "10000100"; // sandbox default
const PF_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY || "46f0cd694581a";
const PF_PASSPHRASE   = process.env.PAYFAST_PASSPHRASE   || "";
const PF_SANDBOX      = process.env.PAYFAST_SANDBOX !== "false"; // true by default
const PF_URL = PF_SANDBOX
  ? "https://sandbox.payfast.co.za/eng/process"
  : "https://www.payfast.co.za/eng/process";

function buildPayfastSignature(fields, passphrase) {
  const parts = Object.entries(fields).map(
    ([k, v]) => `${k}=${encodeURIComponent(String(v).trim()).replace(/%20/g, "+")}`
  );
  let str = parts.join("&");
  if (passphrase) {
    str += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`;
  }
  return crypto.createHash("md5").update(str).digest("hex");
}

app.post("/api/payments/create-payfast-payment", (req, res) => {
  try {
    const { planLabel, amountZar, email, firstName, lastName, orderId } = req.body || {};
    const amount = Number(amountZar || 0);

    if (!planLabel || !amount || amount <= 0) {
      return res.status(400).json({ error: "planLabel and amountZar are required." });
    }

    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

    const fields = {
      merchant_id:   PF_MERCHANT_ID,
      merchant_key:  PF_MERCHANT_KEY,
      return_url:    `${clientUrl}/app-vengers/payment.html?payfast_status=success`,
      cancel_url:    `${clientUrl}/app-vengers/payment.html?payfast_status=cancelled`,
      notify_url:    `${clientUrl}/api/payments/payfast/webhook`,
      name_first:    firstName  || "SlidePlay",
      name_last:     lastName   || "User",
      email_address: email      || "user@slideplayer.app",
      m_payment_id:  orderId    || `SP-${Date.now()}`,
      amount:        amount.toFixed(2),
      item_name:     planLabel,
    };

    const signature = buildPayfastSignature(fields, PF_PASSPHRASE);

    res.json({ action: PF_URL, fields: { ...fields, signature } });
  } catch (err) {
    res.status(500).json({ error: err.message || "PayFast payment creation failed." });
  }
});

// PayFast IPN (server-side notification)
app.post("/api/payments/payfast/webhook", express.urlencoded({ extended: false }), (req, res) => {
  try {
    const { payment_status, m_payment_id, amount_gross, item_name } = req.body || {};
    if (payment_status === "COMPLETE") {
      console.log("PayFast payment complete:", m_payment_id, amount_gross, item_name);
      // TODO: mark subscription as active in your DB
    }
    res.sendStatus(200);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/parse-files", upload.array("files", 20), async function(req, res) {
  if (!req.files || req.files.length === 0)
    return res.status(400).json({ error: "No files provided." });
  let combinedText = "";
  const results = [];
  for (const file of req.files) {
    const ext = path.extname(file.originalname).toLowerCase();
    let text = "", status = "ok";
    try {
      if (ext === ".pdf" || file.mimetype === "application/pdf") {
        const data = await pdfParse(file.buffer); text = data.text;
      } else if (ext === ".docx" || ext === ".doc") {
        const result = await mammoth.extractRawText({ buffer: file.buffer }); text = result.value;
      } else if (ext === ".pptx" || ext === ".ppt") {
        text = extractPptxText(file.buffer);
      } else if (ext === ".xlsx" || ext === ".xls") {
        text = extractXlsxText(file.buffer);
      } else if (ext === ".odt") {
        text = extractOdtText(file.buffer);
      } else if (ext === ".rtf") {
        text = extractRtfText(file.buffer);
      } else if (/\.(jpg|jpeg|png|gif|webp|bmp)$/.test(ext) || (file.mimetype && file.mimetype.startsWith("image/"))) {
        text = await extractTextFromImage(file.buffer, file.mimetype, file.originalname);
      } else if (/\.(txt|md|csv|html|json|js|ts|py|css)$/.test(ext)) {
        text = file.buffer.toString("utf8");
      } else {
        status = "unsupported";
      }
    } catch (err) {
      status = "error";
      console.error("Parse error:", file.originalname, err.message);
    }
    results.push({ name: file.originalname, chars: text.length, status });
    if (text) combinedText += "\n\n--- " + file.originalname + " ---\n" + text;
  }
  res.json({ text: combinedText.trim(), files: results });
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});

