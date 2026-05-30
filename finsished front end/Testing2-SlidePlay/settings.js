function applyTheme(theme) {
  const body = document.body;
  const btn = document.getElementById("theme-toggle");

  body.classList.remove("dark-mode", "light-mode");
  body.classList.add(theme);

  if (theme === "light-mode") {
    btn.innerText = "DARK MODE";
  } else {
    btn.innerText = "LIGHT MODE";
  }
}

function toggleTheme() {
  const body = document.body;
  const currentTheme = body.classList.contains("light-mode")
    ? "light-mode"
    : "dark-mode";
  const nextTheme = currentTheme === "light-mode" ? "dark-mode" : "light-mode";

  applyTheme(nextTheme);
  localStorage.setItem("slideplayTheme", nextTheme);
}

function savePhone() {
  const input    = document.getElementById("phoneInput");
  const feedback = document.getElementById("phoneFeedback");
  if (!input) return;
  const phone = input.value.trim();
  localStorage.setItem("sp_user_phone", phone);
  if (feedback) {
    feedback.textContent = phone ? "Phone saved!" : "Phone cleared.";
    feedback.style.display = "block";
    setTimeout(() => { feedback.style.display = "none"; }, 2500);
  }
}

function saveSmsOptIn(checked) {
  localStorage.setItem("sp_sms_optin", checked ? "true" : "false");
}

function saveLanguagePref(val) {
  localStorage.setItem("sp_language_pref", val || "English (US)");
}

function formatSmsError(data) {
  if (!data) return "SMS failed.";
  if (data.code === "INVALID_PHONE") {
    return "Use E.164 format, e.g. +27831234567.";
  }
  if (data.code === "NOT_CONFIGURED") {
    return "SMS service is not configured on the server yet.";
  }
  if (data.code === "SEND_FAILED" && typeof data.error === "string") {
    if (data.error.toLowerCase().includes("unverified")) {
      return "Twilio trial restriction: this number is not verified yet.";
    }
    return data.error;
  }
  return data.error || "SMS failed.";
}

async function testSms() {
  const phone    = document.getElementById("phoneInput")?.value?.trim();
  const feedback = document.getElementById("phoneFeedback");
  if (!phone) {
    if (feedback) { feedback.textContent = "Enter your phone number first."; feedback.style.color = "#ff4d6d"; feedback.style.display = "block"; }
    return;
  }
  try {
    const res  = await fetch("/api/sms/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: phone }),
    });
    const data = await res.json().catch(() => ({}));
    if (feedback) {
      if (res.ok && data.ok) {
        feedback.textContent = "Test SMS sent! Check your phone.";
      } else {
        feedback.textContent = formatSmsError(data);
      }
      feedback.style.color = data.ok ? "#3dffc0" : "#ff4d6d";
      feedback.style.display = "block";
    }
  } catch (e) {
    if (feedback) { feedback.textContent = "Error: " + e.message; feedback.style.color = "#ff4d6d"; feedback.style.display = "block"; }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("slideplayTheme");
  if (savedTheme === "light-mode" || savedTheme === "dark-mode") {
    applyTheme(savedTheme);
  } else {
    applyTheme("dark-mode");
  }

  // ── Phone + SMS opt-in ──────────────────────────────────────────
  const phoneInput = document.getElementById("phoneInput");
  const smsOptIn   = document.getElementById("smsOptIn");

  if (phoneInput) {
    const saved = localStorage.getItem("sp_user_phone") || "";
    phoneInput.value = saved;
  }
  if (smsOptIn) {
    smsOptIn.checked = localStorage.getItem("sp_sms_optin") === "true";
  }
});
