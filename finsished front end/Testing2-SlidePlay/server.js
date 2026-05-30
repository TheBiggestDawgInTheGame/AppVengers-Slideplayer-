const express = require("express");
const app = express();
require("dotenv").config();

const { getPool, query, sql } = require("./db");
const { embedDeck, studyAsk } = require("./rag");

const { GoogleGenerativeAI } = require("@google/generative-ai");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let gemini = null;
if (GEMINI_API_KEY) {
  gemini = new GoogleGenerativeAI(GEMINI_API_KEY);
}

const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const crypto = require("crypto");
const querystring = require("querystring");
const axios = require("axios");
const fs = require("fs");

app.use(express.json({
  verify: (req, _res, buf) => {
    // Preserve raw body for Coinbase Commerce webhook HMAC verification
    if (req.path === '/api/crypto/webhook') req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true })); // For PayFast IPN

// Allow Firebase Google Auth popup to communicate back (COOP must not be same-origin)
app.use((_req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  next();
});

app.use(express.static(__dirname));

// --- AI Hint Endpoint for Escape Game ---
app.post("/api/ai-hint", async (req, res) => {
  const { game, context } = req.body;
  if (!game || !context) return res.status(400).json({ error: "Missing game or context" });
  let prompt = "You are an expert escape room coach AI. The player is in a 3D escape room game. Based on their current state, provide a helpful, context-aware hint. Be concise, avoid spoilers, and encourage learning.\n";
  prompt += `Game: ${game}\n`;
  prompt += `Level: ${context.level}\n`;
  prompt += `Inventory: ${Array.isArray(context.inv) ? context.inv.join(", ") : ''}\n`;
  prompt += `Solved: ${Array.isArray(context.solved) ? context.solved.join(", ") : ''}\n`;
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

// Helper to generate PayFast signature
function generatePayFastSignature(data, passphrase) {
  let pfData = { ...data };
  // Remove empty/null fields
  Object.keys(pfData).forEach((k) => {
    if (pfData[k] === undefined || pfData[k] === null) delete pfData[k];
  });
  // Build query string
  let pfString = Object.keys(pfData)
    .sort()
    .map((key) => `${key}=${encodeURIComponent(pfData[key])}`)
    .join("&");
  if (passphrase) pfString += `&passphrase=${encodeURIComponent(passphrase)}`;
  return crypto.createHash("md5").update(pfString).digest("hex");
}

// Endpoint to create PayFast payment URL
app.post("/api/payfast/init", (req, res) => {
  const { amount, item_name, user_email, plan, return_url, cancel_url, notify_url } = req.body;
  // These should be set in your .env file
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
  const pfQuery = querystring.stringify(pfData);
  const payfastUrl = `${pf_url}?${pfQuery}`;
  res.json({ url: payfastUrl });
});

// (Optional) IPN endpoint for PayFast notifications
// (axios, fs, express already required above)
// app.use(express.urlencoded({ extended: true })); // Already set above

// Save payment + upsert subscription in SLIDEPLAYDB
async function savePaymentStatus(email, plan, status, provider = 'payfast', amountZAR = 0) {
  try {
    // Lookup FirebaseUID by email
    const userRes = await query('SELECT FirebaseUID FROM Users WHERE Email = @email', { email });
    if (!userRes.recordset.length) {
      console.warn('savePaymentStatus: user not found in DB for', email);
      return;
    }
    const uid = userRes.recordset[0].FirebaseUID;

    // Record the payment
    await query(`
      INSERT INTO Payments (FirebaseUID, Plan, AmountZAR, BillingCycle, Provider, Status)
      VALUES (@uid, @plan, @amount, 'monthly', @provider, @status)
    `, { uid, plan, amount: amountZAR, provider, status: status === 'COMPLETE' ? 'succeeded' : 'pending' });

    // Upsert subscription
    if (status === 'COMPLETE') {
      await query(`
        MERGE Subscriptions AS target
        USING (SELECT @uid AS FirebaseUID) AS src ON target.FirebaseUID = src.FirebaseUID
        WHEN MATCHED THEN
          UPDATE SET Plan = @plan, Status = 'active', RenewsAt = DATEADD(month, 1, SYSUTCDATETIME())
        WHEN NOT MATCHED THEN
          INSERT (FirebaseUID, Plan, Status, PriceZAR, RenewsAt)
          VALUES (@uid, @plan, 'active', @amount, DATEADD(month, 1, SYSUTCDATETIME()));
      `, { uid, plan, amount: amountZAR });
    }
    console.log('DB payment recorded for', email, plan, status);
  } catch (err) {
    console.error('savePaymentStatus DB error:', err.message);
  }
}

// PayFast IPN handler with verification and Firebase update
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
    if (pfRes.data.trim() !== "VALID") {
      console.error("PayFast IPN not valid:", pfRes.data);
      return res.status(400).send("Invalid IPN");
    }
    if (ipnData.payment_status === "COMPLETE") {
      await savePaymentStatus(
        ipnData.email_address,
        ipnData.custom_str1,
        'COMPLETE',
        'payfast',
        parseFloat(ipnData.amount_gross || 0)
      );
      // --- Firebase Admin SDK: set premium ---
      try {
        const admin = require("firebase-admin");
        if (!admin.apps.length) {
          const serviceAccount = require("./firebase-service-account.json");
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://slideplayer-d024f-default-rtdb.firebaseio.com/"
          });
        }
        // Find user by email
        const userRecord = await admin.auth().getUserByEmail(ipnData.email_address);
        // Set premium in Realtime Database
        await admin.database().ref("users/" + userRecord.uid).update({
          premium: true,
          plan: ipnData.custom_str1,
          paidAt: new Date().toISOString(),
        });
        console.log("Firebase premium set for", ipnData.email_address);
      } catch (e) {
        console.error("Firebase premium update error:", e);
      }
      // Send email notification
      if (ipnData.email_address) {
        const msg = {
          to: ipnData.email_address,
          from: "slideplayer90@gmail.com",
          subject: "Payment Received - SlidePlayer",
          text: `Thank you for your payment for the ${ipnData.custom_str1} plan! Your premium access is now active.`,
        };
        try {
          await sgMail.send(msg);
        } catch (e) {
          console.error("SendGrid error:", e);
        }
      }
      console.log("Payment marked COMPLETE for", ipnData.email_address);
    }
    res.status(200).send("OK");
  } catch (err) {
    console.error("PayFast IPN error:", err);
    res.status(500).send("IPN error");
  }
});
// ── Coinbase Commerce: Create Crypto Charge ─────────────────────────────────
app.post("/api/crypto/create-charge", async (req, res) => {
  const { plan, amount, user_email } = req.body;

  if (!plan || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: "Invalid plan or amount." });
  }

  const COINBASE_API_KEY = process.env.COINBASE_COMMERCE_API_KEY;
  if (!COINBASE_API_KEY) {
    return res.status(503).json({ error: "Crypto payments are not configured on this server." });
  }

  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const PLAN_LABELS_SERVER = {
    student_elite: "Student Elite",
    student_premium: "Student Premium",
    pro: "Teacher Pro",
    school: "School Premium",
  };

  try {
    const chargeRes = await axios.post(
      "https://api.commerce.coinbase.com/charges",
      {
        name: `SlidePlay ${PLAN_LABELS_SERVER[plan] || plan}`,
        description: `SlidePlay ${PLAN_LABELS_SERVER[plan] || plan} subscription`,
        local_price: { amount: Number(amount).toFixed(2), currency: "USD" },
        pricing_type: "fixed_price",
        metadata: { plan, user_email: user_email || "" },
        redirect_url: `${appUrl}/studentpayment.html?payment=success&provider=crypto&plan=${encodeURIComponent(plan)}`,
        cancel_url: `${appUrl}/studentpayment.html?payment=cancelled&provider=crypto`,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-CC-Api-Key": COINBASE_API_KEY,
          "X-CC-Version": "2018-03-22",
        },
        timeout: 10000,
      }
    );

    const charge = chargeRes.data?.data;
    if (charge?.hosted_url) {
      res.json({ url: charge.hosted_url, chargeId: charge.id });
    } else {
      res.status(502).json({ error: "No hosted URL returned from Coinbase Commerce." });
    }
  } catch (e) {
    const apiMsg = e.response?.data?.error?.message;
    console.error("Coinbase Commerce create-charge error:", apiMsg || e.message);
    res.status(502).json({ error: apiMsg || "Failed to create crypto charge. Please try again." });
  }
});

// ── Coinbase Commerce: Webhook ────────────────────────────────────────────────
// Coinbase sends an HMAC-SHA256 signed payload; raw body captured via express.json verify above
app.post("/api/crypto/webhook", async (req, res) => {
  const signature = req.headers["x-cc-webhook-signature"];
  const webhookSecret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("COINBASE_COMMERCE_WEBHOOK_SECRET is not set.");
    return res.status(500).send("Webhook secret not configured.");
  }
  if (!signature || !req.rawBody) {
    return res.status(400).send("Missing signature or body.");
  }

  // Verify HMAC-SHA256
  const expectedSig = crypto
    .createHmac("sha256", webhookSecret)
    .update(req.rawBody)
    .digest("hex");
  if (signature !== expectedSig) {
    console.warn("Coinbase Commerce webhook: invalid signature — possible spoofed request.");
    return res.status(400).send("Invalid signature.");
  }

  let event;
  try {
    event = JSON.parse(req.rawBody.toString());
  } catch {
    return res.status(400).send("Invalid JSON payload.");
  }

  const eventType = event?.event?.type;
  const { plan, user_email } = event?.event?.data?.metadata || {};

  if (
    (eventType === "charge:confirmed" || eventType === "charge:resolved") &&
    plan && user_email
  ) {
    savePaymentStatus(user_email, plan, "COMPLETE", 'coinbase', 0);

    // Update Firebase premium status
    try {
      const admin = require("firebase-admin");
      if (!admin.apps.length) {
        const serviceAccount = require("./firebase-service-account.json");
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: "https://slideplayer-d024f-default-rtdb.firebaseio.com/",
        });
      }
      const userRecord = await admin.auth().getUserByEmail(user_email);
      await admin.database().ref("users/" + userRecord.uid).update({
        premium: true,
        plan,
        paidAt: new Date().toISOString(),
        paymentProvider: "coinbase_commerce",
      });
      console.log("Firebase premium set via crypto webhook for", user_email);
    } catch (e) {
      console.error("Firebase crypto webhook error:", e.message);
    }

    // Send confirmation email
    try {
      await sgMail.send({
        to: user_email,
        from: "slideplayer90@gmail.com",
        subject: "Crypto Payment Confirmed — SlidePlayer",
        text: `Your crypto payment for the ${plan} plan has been confirmed on the blockchain. Your premium access is now active.`,
      });
    } catch (e) {
      console.error("SendGrid crypto confirmation email error:", e.message);
    }
  }

  res.status(200).send("OK");
});

// Integrating SendGrid+ API to send welcome email to new users after signing up


app.post("/send-welcome-email", async (req, res) => {
  const { email } = req.body;
  const msg = {
    to: email,
    from: "slideplayer90@gmail.com",
    subject: "Welcome to SlidePlayer!",
    text: "Thank you for signing up for SlidePlayer! We're excited to have you on board. If you have any questions or need assistance, feel free to reach out to our support team.",
  };

  try {
    await sgMail.send(msg);
    res.status(200).send("Email sent");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error sending email");
  }
});

// ─── DATABASE ENDPOINTS ──────────────────────────────────────────────────────

// Sync a Firebase user into the Users table (upsert by FirebaseUID)
app.post('/api/users/sync', async (req, res) => {
  const { uid, email, displayName, role } = req.body;
  if (!uid || !email) return res.status(400).json({ error: 'uid and email required' });
  try {
    await query(`
      MERGE Users AS target
      USING (SELECT @uid AS FirebaseUID) AS src ON target.FirebaseUID = src.FirebaseUID
      WHEN MATCHED THEN
        UPDATE SET Email = @email, DisplayName = @displayName, Role = @role, LastLoginAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (FirebaseUID, Email, DisplayName, Role) VALUES (@uid, @email, @displayName, @role);
    `, { uid, email, displayName: displayName || '', role: role || 'student' });
    res.json({ ok: true });
  } catch (err) {
    console.error('users/sync error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get a game session by join code
app.get('/api/sessions/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const result = await query(
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

// Student joins a session by code
app.post('/api/sessions/:code/join', async (req, res) => {
  const { code } = req.params;
  const { uid, displayName } = req.body;
  if (!uid) return res.status(400).json({ error: 'uid required' });
  try {
    // Get session
    const sess = await query(
      "SELECT SessionID FROM GameSessions WHERE SessionCode = @code AND Status = 'waiting'",
      { code }
    );
    if (!sess.recordset.length) return res.status(404).json({ error: 'Session not open' });
    const sessionId = sess.recordset[0].SessionID;

    // Upsert player
    await query(`
      IF NOT EXISTS (SELECT 1 FROM SessionPlayers WHERE SessionID = @sessionId AND StudentUID = @uid)
        INSERT INTO SessionPlayers (SessionID, StudentUID, DisplayName) VALUES (@sessionId, @uid, @displayName)
    `, { sessionId, uid, displayName: displayName || uid });

    res.json({ ok: true, sessionId });
  } catch (err) {
    console.error('sessions/:code/join error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// Get a student's subscription info
app.get('/api/users/:uid/subscription', async (req, res) => {
  const { uid } = req.params;
  try {
    const result = await query(
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

// ─────────────────────────────────────────────────────────────────────────────

// ─── RAG ENDPOINTS ───────────────────────────────────────────────────────────

// Create a SlideDecks record and return the new deckId
app.post('/api/decks/create', async (req, res) => {
  const { uid, title, rawText } = req.body;
  if (!uid || !title) return res.status(400).json({ error: 'uid and title required' });
  try {
    const result = await query(
      `INSERT INTO SlideDecks (TeacherUID, Title, RawText)
       OUTPUT INSERTED.DeckID
       VALUES (@uid, @title, @rawText)`,
      { uid, title, rawText: rawText || '' }
    );
    const deckId = result.recordset[0].DeckID;
    res.json({ deckId });
  } catch (err) {
    console.error('decks/create error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// Chunk + embed a deck's raw text (runs in background, returns 202 immediately)
app.post('/api/decks/:deckId/embed', async (req, res) => {
  const deckId = parseInt(req.params.deckId);
  const { rawText } = req.body;
  if (!rawText) return res.status(400).json({ error: 'rawText required' });
  // Respond immediately so the client isn't blocked — embedding happens async
  res.json({ ok: true, message: 'Embedding started' });
  try {
    const count = await embedDeck(deckId, rawText);
    // Update QuestionCount on the deck as a proxy for embed status
    await query('UPDATE SlideDecks SET QuestionCount = @count WHERE DeckID = @deckId', { count, deckId });
  } catch (err) {
    console.error(`embed deck ${deckId} error:`, err.message);
  }
});

// Grounded study-mode Q&A using RAG
app.post('/api/study/ask', async (req, res) => {
  const { deckId, question, history } = req.body;
  if (!deckId || !question) return res.status(400).json({ error: 'deckId and question required' });
  try {
    const result = await studyAsk(parseInt(deckId), question, history || []);
    res.json(result);
  } catch (err) {
    console.error('study/ask error:', err.message);
    res.status(500).json({ error: 'RAG error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

app.listen(3000, async () => {
  await getPool(); // connect to DB on startup
  console.log("Server running on port 3000");
});
