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
  apiKey: "AIzaSyAhxLX6fffl9477tNoqlmQomr51oL-6PDM",
  authDomain: "slideplayer-d024f.firebaseapp.com",
  databaseURL: "https://slideplayer-d024f-default-rtdb.firebaseio.com",
  projectId: "slideplayer-d024f",
  storageBucket: "slideplayer-d024f.appspot.com",
  messagingSenderId: "59789322114",
  appId: "1:59789322114:web:99b1546f1a9040ca9ad19b",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
auth.languageCode = "en";
const provider = new GoogleAuthProvider();

// ── Utilities ────────────────────────────────────────────────────
function getDashboard(role) {
  return role === "teacher" ? "teacher.html" : "Studentdashboard.html";
}

async function fetchRole(uid) {
  const snap = await get(ref(db, "users/" + uid + "/role"));
  return snap.exists() ? snap.val() : "student";
}

function setLocalUser(email, role) {
  localStorage.setItem("sp_user_role", role);
  localStorage.setItem("sp_user_email", email);
}

// ── Role picker modal (new Google sign-in users) ─────────────────
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
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector("#rpStudent").addEventListener("click", () => { overlay.remove(); onSelect("student"); });
  overlay.querySelector("#rpTeacher").addEventListener("click", () => { overlay.remove(); onSelect("teacher"); });
}

// ── Google Sign-In (used by both pages) ──────────────────────────
function setupGoogle(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    btn.disabled = true;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>&nbsp; Connecting...`;

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Try DB read — if it fails, fall through to role picker
      let existingRole = null;
      try {
        const snap = await get(ref(db, "users/" + user.uid));
        if (snap.exists()) existingRole = snap.val().role || "student";
      } catch (_dbErr) {
        // DB unreachable — treat as new user
      }

      if (existingRole) {
        // Returning user — redirect immediately
        setLocalUser(user.email, existingRole);
        window.location.href = getDashboard(existingRole);
      } else {
        // New user (or DB unavailable) — ask for role
        btn.innerHTML = originalHTML;
        btn.disabled = false;
        showRolePicker(async (role) => {
          try {
            await set(ref(db, "users/" + user.uid), {
              email: user.email,
              displayName: user.displayName || "",
              role,
              createdAt: new Date().toISOString(),
            });
          } catch (_dbErr) {
            // DB write failed — localStorage is enough
          }
          setLocalUser(user.email, role);
          window.location.href = getDashboard(role);
        });
      }
    } catch (err) {
      console.error("Google sign-in error:", err.message);
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      // Show visible error under the button
      document.getElementById("googleAuthError")?.remove();
      const msg = document.createElement("p");
      msg.id = "googleAuthError";
      msg.textContent = err.code === "auth/popup-closed-by-user"
        ? "Sign-in cancelled."
        : "Google sign-in failed. Please try again.";
      msg.style.cssText = "color:#ff6b6b;font-size:0.78rem;text-align:center;margin-top:8px;font-family:'Poppins',sans-serif;";
      btn.insertAdjacentElement("afterend", msg);
      setTimeout(() => msg.remove(), 4000);
    }
  });
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
    if (!valid) return;

    const btn = form.querySelector(".signup-btn");
    btn.disabled = true;
    btn.textContent = "Creating account...";

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await set(ref(db, "users/" + cred.user.uid), {
        email,
        username,
        role,
        createdAt: new Date().toISOString(),
      });
      setLocalUser(email, role);
      window.location.href = getDashboard(role);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Create Account";
      if (err.code === "auth/email-already-in-use") {
        document.getElementById("emailError").textContent = "Email already in use";
        document.getElementById("emailBox").classList.add("error");
      } else {
        document.getElementById("emailError").textContent = "Signup failed. Try again.";
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
    const passVal = document.getElementById("password").value;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(emailVal)) {
      document.getElementById("emailError").textContent = "Enter a valid email";
      document.getElementById("emailBox").classList.add("error");
      valid = false;
    }
    if (passVal.length < 6) {
      document.getElementById("passwordError").textContent = "Password must be at least 6 characters";
      document.getElementById("passwordBox").classList.add("error");
      valid = false;
    }
    if (!valid) return;

    const btn = form.querySelector(".submit-btn");
    btn.disabled = true;
    btn.textContent = "SIGNING IN...";

    try {
      const cred = await signInWithEmailAndPassword(auth, emailVal, passVal);
      const role = await fetchRole(cred.user.uid);
      setLocalUser(emailVal, role);
      const successBox = document.getElementById("successBox");
      successBox.style.display = "block";
      successBox.textContent = role === "teacher" ? "Welcome, Teacher! Redirecting..." : "Login successful! Redirecting...";
      setTimeout(() => { window.location.href = getDashboard(role); }, 1000);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "SIGN IN";
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
