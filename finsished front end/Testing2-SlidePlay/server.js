const express = require("express");
const app = express();
require("dotenv").config();

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

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For PayFast IPN
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

// Helper: Save payment status (demo: to file, replace with DB in prod)
function savePaymentStatus(email, plan, status) {
  const paymentsFile = __dirname + "/payfast_payments.json";
  let payments = {};
  if (fs.existsSync(paymentsFile)) {
    payments = JSON.parse(fs.readFileSync(paymentsFile, "utf8"));
  }
  payments[email] = { plan, status, date: new Date().toISOString() };
  fs.writeFileSync(paymentsFile, JSON.stringify(payments, null, 2));
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
      savePaymentStatus(ipnData.email_address, ipnData.custom_str1, "COMPLETE");
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

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
