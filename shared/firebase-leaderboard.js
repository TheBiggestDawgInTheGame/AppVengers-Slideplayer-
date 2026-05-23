/**
 * firebase-leaderboard.js
 * Load this as <script type="module"> in any game HTML.
 * Exposes window.saveLeaderboardScore(game, score) globally.
 * Saves best score to MongoDB via the SlidePlay API (POST /api/leaderboard/:game).
 */
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAhxLX6fffl9477tNoqlmQomr51oL-6PDM",
  authDomain: "slideplayer-d024f.firebaseapp.com",
  projectId: "slideplayer-d024f",
  storageBucket: "slideplayer-d024f.appspot.com",
  messagingSenderId: "59789322114",
  appId: "1:59789322114:web:99b1546f1a9040ca9ad19b",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

const API_BASE = "http://localhost:3000";

/**
 * Save score to MongoDB via the SlidePlay API (only updates if score is a new best).
 * @param {string} game - game identifier e.g. "snake", "quiz"
 * @param {number} score - final score
 */
window.saveLeaderboardScore = async function saveLeaderboardScore(game, score) {
  const user = auth.currentUser;
  if (!user) return; // not logged in — skip silently
  try {
    const token = await user.getIdToken();
    await fetch(`${API_BASE}/api/leaderboard/${game}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
      },
      body: JSON.stringify({
        score,
        name: user.displayName || user.email?.split("@")[0] || "Player",
        email: user.email || "",
      }),
    });
  } catch (err) {
    console.warn("[Leaderboard] API write failed:", err.message);
  }
};
