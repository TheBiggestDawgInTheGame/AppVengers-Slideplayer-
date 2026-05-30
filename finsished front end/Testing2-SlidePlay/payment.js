// ── Return Handlers (PayFast / Coinbase / Stripe) ─────
function i18nText(key, fallback) {
  if (window.SP_I18N && typeof window.SP_I18N.t === "function") {
    return window.SP_I18N.t(key, fallback);
  }
  return fallback;
}

function isStrictPaymentMode() {
  const forcedStrict = localStorage.getItem("sp_force_strict_payments") === "1";
  const allowInsecureReturn = localStorage.getItem("sp_allow_insecure_payment_return") === "1";
  const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  return forcedStrict || (!isLocalHost && !allowInsecureReturn);
}

const STRICT_PAYMENT_MODE = isStrictPaymentMode();

function showVerificationPending(providerName) {
  showFailureModal(
    providerName,
    i18nText(
      "payment.serverVerificationPending",
      "Payment is awaiting secure server verification. Your plan will unlock after confirmation is received."
    )
  );
}

async function syncSubscriptionFromBackend(uid, subKey, payKey) {
  if (!uid) return false;

  const response = await fetch("/api/users/" + encodeURIComponent(uid) + "/subscription");
  if (!response.ok) return false;

  const subscription = await response.json();
  const isActive = Boolean(subscription && subscription.active);
  if (!isActive) return false;

  const nextSubscription = {
    plan: subscription.plan,
    status: subscription.status,
    billing: subscription.billing || "monthly",
    provider: subscription.provider || "stripe",
    activatedAt: new Date(subscription.activatedAt || Date.now()).toISOString(),
    updatedAt: new Date(subscription.updatedAt || Date.now()).toISOString(),
  };

  localStorage.setItem(subKey, JSON.stringify(nextSubscription));
  const existingPayments = (function () {
    try { return JSON.parse(localStorage.getItem(payKey) || "[]"); }
    catch (_) { return []; }
  })();
  if (!existingPayments.some((entry) => entry && entry.receiptId === subscription.sessionId)) {
    existingPayments.unshift({
      receiptId: subscription.sessionId || generateReceiptId(),
      plan: subscription.plan,
      amount: "R0",
      date: new Date().toISOString(),
      status: "paid",
      method: subscription.provider || "stripe",
    });
    localStorage.setItem(payKey, JSON.stringify(existingPayments));
  }

  return true;
}

document.addEventListener("DOMContentLoaded", function () {
  const urlParams = new URLSearchParams(window.location.search);

  // ── Stripe return (?checkout=success&session_id=...) ──
  if (urlParams.get("checkout") === "success") {
    const sessionId = urlParams.get("session_id");
    showProcessingModal();
    setTimeout(async () => {
      try {
        const res = await fetch("/api/stripe/checkout-session/" + encodeURIComponent(sessionId));
        const data = await res.json();
        let paymentActivated = false;
        if (data.paymentStatus === "paid" || data.status === "complete") {
          const pending = (function () {
            try { return JSON.parse(sessionStorage.getItem("sp_stripe_pending") || "null"); }
            catch (_) { return null; }
          })();
          const planKey   = (pending && pending.plan)   ? pending.plan   : (data.metadata && data.metadata.plan   ? data.metadata.plan   : "pro");
          const billingKey= (pending && pending.billing) ? pending.billing: (data.metadata && data.metadata.billing ? data.metadata.billing: "monthly");
          const subKey    = (pending && pending.subscriptionKey) ? pending.subscriptionKey : SUBSCRIPTION_KEY;
          const payKey    = (pending && pending.paymentsKey)     ? pending.paymentsKey     : PAYMENTS_KEY;
          const receiptId = data.receiptId || generateReceiptId();
          const renewsOn  = new Date();
          if (billingKey === "yearly") renewsOn.setFullYear(renewsOn.getFullYear() + 1);
          else renewsOn.setMonth(renewsOn.getMonth() + 1);
          const planLabels = { free:"Free", student_elite:"Elite", student_premium:"Premium", pro:"Teacher Pro", school:"School Premium" };
          const planMonthly = { free:0, student_elite:90, student_premium:150, pro:12, school:49 };
          const planYearly  = { free:0, student_elite:860, student_premium:1400, pro:115, school:470 };
          const price = billingKey === "yearly" ? (planYearly[planKey]||0) : (planMonthly[planKey]||0);
          const resolvedUid = localStorage.getItem("sp_user_uid") || (data.metadata && data.metadata.customerUid ? data.metadata.customerUid : "");

          if (STRICT_PAYMENT_MODE) {
            paymentActivated = await syncSubscriptionFromBackend(resolvedUid, subKey, payKey);
            if (!paymentActivated) {
              showVerificationPending("Stripe");
            }
          } else {
            const subscription = {
              plan: planKey, billing: billingKey, price,
              activatedAt: new Date().toISOString(),
              renewsOn: renewsOn.toISOString(), receiptId,
            };
            const payments = (function () {
              try { return JSON.parse(localStorage.getItem(payKey) || "[]"); }
              catch (_) { return []; }
            })();
            payments.unshift({ receiptId, plan: planLabels[planKey]||planKey, amount: "R"+price, date: new Date().toISOString(), status: "paid", method: "stripe" });
            localStorage.setItem(subKey,  JSON.stringify(subscription));
            localStorage.setItem(payKey,  JSON.stringify(payments));
            paymentActivated = true;
          }

          sessionStorage.removeItem("sp_stripe_pending");
          if (paymentActivated) {
            showSuccessModal(planKey, receiptId);
          }
        } else {
          showFailureModal("Stripe", i18nText("payment.verificationFailed", "Payment verification failed."));
        }
        if (paymentActivated) triggerConfetti();
      } catch (e) {
        showFailureModal("Stripe", i18nText("payment.verificationFailed", "Payment verification failed."));
      }
    }, 1200);
    return;
  }

  // ── Coinbase return (?payment=success|cancel&provider=crypto) ──
  if (urlParams.get("provider") === "crypto") {
    const cryptoStatus = urlParams.get("payment");
    if (cryptoStatus === "success") {
      showProcessingModal();
      setTimeout(async () => {
        if (STRICT_PAYMENT_MODE) {
          const pending = (function () {
            try { return JSON.parse(sessionStorage.getItem("sp_crypto_pending") || "null"); }
            catch (_) { return null; }
          })();
          const subKey = (pending && pending.subscriptionKey) ? pending.subscriptionKey : SUBSCRIPTION_KEY;
          const payKey = (pending && pending.paymentsKey) ? pending.paymentsKey : PAYMENTS_KEY;
          const uid = localStorage.getItem("sp_user_uid") || "";
          const synced = await syncSubscriptionFromBackend(uid, subKey, payKey);
          if (synced) {
            sessionStorage.removeItem("sp_crypto_pending");
            showSuccessModal((pending && pending.plan) ? pending.plan : "student_elite", generateReceiptId());
            triggerConfetti();
          } else {
            showVerificationPending("Coinbase");
          }
          return;
        }

        const cbData = (function () {
          try { return JSON.parse(sessionStorage.getItem("sp_crypto_pending") || "null"); }
          catch (_) { return null; }
        })();
        if (cbData && cbData.plan) {
          const renewsOn = new Date();
          if (cbData.isYearly) renewsOn.setFullYear(renewsOn.getFullYear() + 1);
          else renewsOn.setMonth(renewsOn.getMonth() + 1);
          const subKey = cbData.subscriptionKey || SUBSCRIPTION_KEY;
          const payKey = cbData.paymentsKey || PAYMENTS_KEY;
          const planLabels = { free:"Free", student_elite:"Elite", student_premium:"Premium", pro:"Teacher Pro", school:"School Premium" };
          const planMonthly = { free:0, student_elite:90, student_premium:150, pro:12, school:49 };
          const planYearly  = { free:0, student_elite:860, student_premium:1400, pro:115, school:470 };
          const price = cbData.isYearly ? (planYearly[cbData.plan]||0) : (planMonthly[cbData.plan]||0);
          const discountedPrice = Math.max(0, price - Math.round((price * (cbData.discount||0)) / 100));
          const receiptId = generateReceiptId();
          const subscription = {
            plan: cbData.plan, billing: cbData.isYearly ? "yearly" : "monthly", price: discountedPrice,
            activatedAt: new Date().toISOString(), renewsOn: renewsOn.toISOString(), receiptId,
          };
          const payments = (function () {
            try { return JSON.parse(localStorage.getItem(payKey) || "[]"); }
            catch (_) { return []; }
          })();
          payments.unshift({ receiptId, plan: planLabels[cbData.plan]||cbData.plan, amount: "R"+discountedPrice, date: new Date().toISOString(), status: "paid", method: "crypto" });
          localStorage.setItem(subKey, JSON.stringify(subscription));
          localStorage.setItem(payKey, JSON.stringify(payments));
          sessionStorage.removeItem("sp_crypto_pending");
          showSuccessModal(cbData.plan, receiptId);
          triggerConfetti();
        } else {
          showFailureModal("Coinbase", i18nText("payment.verificationFailed", "Payment verification failed."));
        }
      }, 1800);
    } else if (cryptoStatus === "cancel") {
      showFailureModal("Coinbase", i18nText("payment.notCaptured", "No payment was captured. You can try again anytime."));
    } else {
      showFailureModal("Coinbase", i18nText("payment.verificationFailed", "Payment verification failed."));
    }
    return;
  }

  // ── PayFast return (?payfast=success) ──────────────
  if (urlParams.has("payfast")) {
    const status = urlParams.get("payfast");
    if (status === "success") {
      showProcessingModal();
      setTimeout(async () => {
        if (STRICT_PAYMENT_MODE) {
          const pending = (function () {
            try { return JSON.parse(sessionStorage.getItem("sp_payfast_pending") || "null"); }
            catch (_) { return null; }
          })();
          const subKey = (pending && pending.subscriptionKey) ? pending.subscriptionKey : SUBSCRIPTION_KEY;
          const payKey = (pending && pending.paymentsKey) ? pending.paymentsKey : PAYMENTS_KEY;
          const uid = localStorage.getItem("sp_user_uid") || "";
          const synced = await syncSubscriptionFromBackend(uid, subKey, payKey);
          if (synced) {
            sessionStorage.removeItem("sp_payfast_pending");
            showSuccessModal((pending && pending.plan) ? pending.plan : "student_elite", generateReceiptId());
            triggerConfetti();
          } else {
            showVerificationPending("PayFast");
          }
          return;
        }

        // Restore plan info saved before the PayFast redirect
        const pfData = (function () {
          try { return JSON.parse(sessionStorage.getItem("sp_payfast_pending") || "null"); }
          catch (_) { return null; }
        })();
        if (pfData && pfData.plan) {
          // Reconstruct subscription and write it — same logic as completePurchase()
          const renewsOn = new Date();
          if (pfData.isYearly) { renewsOn.setFullYear(renewsOn.getFullYear() + 1); }
          else { renewsOn.setMonth(renewsOn.getMonth() + 1); }
          const subscriptionKey = pfData.subscriptionKey || "sp_student_subscription";
          const paymentsKey = pfData.paymentsKey || "sp_student_payments";
          const planLabels = { free:"Free", student_elite:"Elite", student_premium:"Premium", pro:"Teacher Pro", school:"School Premium" };
          const planMonthly = { free:0, student_elite:90, student_premium:150, pro:12, school:49 };
          const planYearly  = { free:0, student_elite:860, student_premium:1400, pro:115, school:470 };
          const price = pfData.isYearly ? (planYearly[pfData.plan] || 0) : (planMonthly[pfData.plan] || 0);
          const discountedPrice = Math.max(0, price - Math.round((price * (pfData.discount || 0)) / 100));
          const receiptId = generateReceiptId();
          const subscription = {
            plan: pfData.plan,
            billing: pfData.isYearly ? "yearly" : "monthly",
            price: discountedPrice,
            activatedAt: new Date().toISOString(),
            renewsOn: renewsOn.toISOString(),
            receiptId: receiptId,
          };
          const payments = (function () {
            try { return JSON.parse(localStorage.getItem(paymentsKey) || "[]"); }
            catch (_) { return []; }
          })();
          payments.unshift({ receiptId, plan: planLabels[pfData.plan] || pfData.plan, amount: "R" + discountedPrice, date: new Date().toISOString(), status: "paid", method: "payfast" });
          localStorage.setItem(subscriptionKey, JSON.stringify(subscription));
          localStorage.setItem(paymentsKey, JSON.stringify(payments));
          sessionStorage.removeItem("sp_payfast_pending");
          showSuccessModal(pfData.plan, receiptId);
          triggerConfetti();
        } else {
          showFailureModal("PayFast", i18nText("payment.verificationFailed", "Payment verification failed."));
        }
      }, 1800);
    } else if (status === "cancel") {
      showFailureModal("PayFast", i18nText("payment.notCaptured", "No payment was captured. You can try again anytime."));
    } else {
      showFailureModal("PayFast", i18nText("payment.verificationFailed", "Payment verification failed."));
    }
  }
});

function showProcessingModal() {
  let modal = document.getElementById("processingModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "processingModal";
    modal.className = "modal-overlay";
    modal.innerHTML = `<div class="success-panel"><div class="success-icon"><i class="fa-solid fa-spinner fa-spin"></i></div><h2>${i18nText("payment.processing", "Processing Payment...")}</h2><p>${i18nText("payment.pleaseWait", "Please wait while we verify your payment.")}</p></div>`;
    document.body.appendChild(modal);
  }
  modal.classList.add("open");
}

function hideProcessingModal() {
  const modal = document.getElementById("processingModal");
  if (modal) modal.classList.remove("open");
}

function showFailureModal(title, message) {
  hideProcessingModal();
  let modal = document.getElementById("failureModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "failureModal";
    modal.className = "modal-overlay open";
    modal.innerHTML = `
      <div class="success-panel">
        <div class="success-icon"><i class="fa-solid fa-circle-xmark"></i></div>
        <h2>Payment Failed</h2>
        <p id="failureMessage">Your payment could not be completed.</p>
        <div class="success-actions">
          <button type="button" class="pay-btn" id="failureTryAgain">Try Again</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const h2 = modal.querySelector("h2");
  const msg = modal.querySelector("#failureMessage");
  if (h2) h2.textContent = title ? title + ": " + i18nText("payment.failed", "Payment Failed") : i18nText("payment.failed", "Payment Failed");
  if (msg) msg.textContent = message || "Your payment could not be completed.";
  modal.classList.add("open");

  const tryBtn = modal.querySelector("#failureTryAgain");
  if (tryBtn) {
    tryBtn.addEventListener("click", function () {
      modal.classList.remove("open");
    }, { once: true });
  }

  modal.addEventListener("click", function (e) {
    if (e.target === modal) modal.classList.remove("open");
  }, { once: true });
}

function triggerConfetti() {
  // Simple confetti burst (can be replaced with a library)
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = 0;
  container.style.top = 0;
  container.style.width = "100vw";
  container.style.height = "100vh";
  container.style.pointerEvents = "none";
  container.style.zIndex = 9999;
  for (let i = 0; i < 60; i++) {
    const conf = document.createElement("div");
    conf.style.position = "absolute";
    conf.style.width = "10px";
    conf.style.height = "10px";
    conf.style.borderRadius = "50%";
    conf.style.background = `hsl(${Math.random()*360},90%,60%)`;
    conf.style.left = Math.random()*100 + "vw";
    conf.style.top = "-20px";
    conf.style.opacity = 0.8;
    conf.style.transform = `scale(${0.7+Math.random()*0.7})`;
    conf.animate([
      { transform: `translateY(0) scale(1)` },
      { transform: `translateY(${60+Math.random()*30}vh) scale(${0.7+Math.random()*0.7})` }
    ], {
      duration: 1800+Math.random()*800,
      easing: "cubic-bezier(.23,1.02,.32,1)",
      fill: "forwards"
    });
    container.appendChild(conf);
  }
  document.body.appendChild(container);
  setTimeout(()=>container.remove(), 2200);
}
// ── PayFast Integration ──────────────────────────────
function setupPayFast() {
  const btn = document.getElementById("payfastBtn");
  if (!btn) return;
  btn.addEventListener("click", async function () {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Redirecting…';
    try {
      // Gather order info
      const plan = selectedPlan || "free";
      const price = isYearly ? PLAN_YEARLY[plan] : PLAN_MONTHLY[plan];
      const discountedPrice = Math.max(0, price - Math.round((price * appliedDiscount) / 100));
      const user_email = localStorage.getItem("sp_user_email") || "";
      const user_phone  = localStorage.getItem("sp_user_phone")  || "";
      const user_uid = localStorage.getItem("sp_user_uid") || "";
      // ── Save plan info before leaving the page so it can be restored on return ──
      try {
        sessionStorage.setItem("sp_payfast_pending", JSON.stringify({
          plan,
          isYearly,
          discount: appliedDiscount,
          billing: isYearly ? "yearly" : "monthly",
          subscriptionKey: SUBSCRIPTION_KEY,
          paymentsKey: PAYMENTS_KEY,
        }));
      } catch (_) {}
      const res = await fetch("/api/payfast/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: discountedPrice,
          item_name: PLAN_LABELS[plan],
          user_email,
          user_uid,
          billing: isYearly ? "yearly" : "monthly",
          phone: user_phone,
          plan,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        sessionStorage.removeItem("sp_payfast_pending");
        alert("Could not initiate PayFast payment: " + (data.error || "Unknown error"));
        btn.disabled = false;
        btn.innerHTML = '<span><i class="fa-solid fa-lock"></i> Pay with PayFast</span>';
      }
    } catch (e) {
      sessionStorage.removeItem("sp_payfast_pending");
      alert("PayFast error: " + e.message);
      btn.disabled = false;
      btn.innerHTML = '<span><i class="fa-solid fa-lock"></i> Pay with PayFast</span>';
    }
  });
}

// ── Coinbase Commerce Integration ────────────────────
function setupCoinbase() {
  const btn = document.getElementById("cryptoBtn");
  if (!btn) return;
  btn.addEventListener("click", async function () {
    btn.disabled = true;
    btn.innerHTML = '<span><i class="fa-solid fa-spinner fa-spin"></i> Redirecting…</span>';
    try {
      const plan = selectedPlan || "free";
      const price = isYearly ? PLAN_YEARLY[plan] : PLAN_MONTHLY[plan];
      const discountedPrice = Math.max(0, price - Math.round((price * appliedDiscount) / 100));
      const user_email = localStorage.getItem("sp_user_email") || "";
      const user_phone  = localStorage.getItem("sp_user_phone")  || "";
      const user_uid = localStorage.getItem("sp_user_uid") || "";
      try {
        sessionStorage.setItem("sp_crypto_pending", JSON.stringify({
          plan, isYearly, discount: appliedDiscount,
          billing: isYearly ? "yearly" : "monthly",
          subscriptionKey: SUBSCRIPTION_KEY, paymentsKey: PAYMENTS_KEY,
        }));
      } catch (_) {}
      const returnUrl = window.location.origin + window.location.pathname
        + "?payment=success&provider=crypto";
      const cancelUrl = window.location.origin + window.location.pathname
        + "?payment=cancel&provider=crypto";
      const res = await fetch("/api/crypto/create-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: discountedPrice,
          currency: "ZAR",
          name: PLAN_LABELS[plan],
          description: "SlidePlay " + PLAN_LABELS[plan] + " subscription",
          customer_email: user_email,
          customer_phone: user_phone,
          user_uid,
          billing: isYearly ? "yearly" : "monthly",
          plan,
          redirect_url: returnUrl,
          cancel_url: cancelUrl,
        }),
      });
      const data = await res.json();
      if (data.hosted_url || data.url) {
        window.location.href = data.hosted_url || data.url;
      } else {
        sessionStorage.removeItem("sp_crypto_pending");
        alert("Could not initiate crypto payment: " + (data.error || "Unknown error"));
        btn.disabled = false;
        btn.innerHTML = '<span><i class="fa-brands fa-bitcoin"></i> Pay with Crypto</span>';
      }
    } catch (e) {
      sessionStorage.removeItem("sp_crypto_pending");
      alert("Crypto payment error: " + e.message);
      btn.disabled = false;
      btn.innerHTML = '<span><i class="fa-brands fa-bitcoin"></i> Pay with Crypto</span>';
    }
  });
}

// ── Stripe Integration ────────────────────────────────
function setupStripe() {
  const btn = document.getElementById("stripeBtn");
  if (!btn) return;
  btn.addEventListener("click", async function () {
    btn.disabled = true;
    btn.innerHTML = '<span><i class="fa-solid fa-spinner fa-spin"></i> Redirecting…</span>';
    try {
      const plan = selectedPlan || "free";
      const billing = isYearly ? "yearly" : "monthly";
      const user_email = localStorage.getItem("sp_user_email") || "";
      const user_name  = localStorage.getItem("sp_user_name")  || "";
      const user_phone = localStorage.getItem("sp_user_phone") || "";
      const user_uid   = localStorage.getItem("sp_user_uid") || "";
      try {
        sessionStorage.setItem("sp_stripe_pending", JSON.stringify({
          plan, billing, subscriptionKey: SUBSCRIPTION_KEY, paymentsKey: PAYMENTS_KEY,
        }));
      } catch (_) {}
      const pageUrl = window.location.origin + window.location.pathname;
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan, billingPeriod: billing,
          customerEmail: user_email,
          customerName: user_name,
          customerPhone: user_phone,
          customerUid: user_uid,
          successUrl: pageUrl,
          cancelUrl: pageUrl,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        sessionStorage.removeItem("sp_stripe_pending");
        alert("Could not initiate Stripe payment: " + (data.error || "Unknown error"));
        btn.disabled = false;
        btn.innerHTML = '<span><i class="fa-brands fa-stripe-s"></i> Pay with Stripe</span>';
      }
    } catch (e) {
      sessionStorage.removeItem("sp_stripe_pending");
      alert("Stripe error: " + e.message);
      btn.disabled = false;
      btn.innerHTML = '<span><i class="fa-brands fa-stripe-s"></i> Pay with Stripe</span>';
    }
  });
}


// ── Role detection (set data-role="student" on <body> for student page) ──
const IS_STUDENT = document.body.getAttribute("data-role") === "student";

const SUBSCRIPTION_KEY = IS_STUDENT
  ? "sp_student_subscription"
  : "sp_subscription";
const PAYMENTS_KEY = IS_STUDENT ? "sp_student_payments" : "sp_payments";

// Teacher plans
const TEACHER_PLAN_LABELS = {
  free: "Free",
  pro: "Teacher Pro",
  school: "School Premium",
};
const TEACHER_PLAN_MONTHLY = { free: 0, pro: 12, school: 49 };
const TEACHER_PLAN_YEARLY = { free: 0, pro: 115, school: 470 };

// Student plans
const STUDENT_PLAN_LABELS = {
  free: "Free",
  student_elite: "Elite",
  student_premium: "Premium",
};
const STUDENT_PLAN_MONTHLY = { free: 0, student_elite: 90, student_premium: 150 };
const STUDENT_PLAN_YEARLY = { free: 0, student_elite: 860, student_premium: 1400 };

const PLAN_LABELS = IS_STUDENT ? STUDENT_PLAN_LABELS : TEACHER_PLAN_LABELS;
const PLAN_MONTHLY = IS_STUDENT ? STUDENT_PLAN_MONTHLY : TEACHER_PLAN_MONTHLY;
const PLAN_YEARLY = IS_STUDENT ? STUDENT_PLAN_YEARLY : TEACHER_PLAN_YEARLY;

const VALID_COUPONS = IS_STUDENT
  ? {
      STUDENT10: { discount: 10, label: "10% off for students" },
      BACK2SCHOOL: { discount: 25, label: "25% Back-to-School discount" },
      LAUNCH50: { discount: 50, label: "50% launch discount" },
    }
  : {
      TEACH20: { discount: 20, label: "20% off" },
      SCHOOL10: { discount: 10, label: "10% off" },
      LAUNCH50: { discount: 50, label: "50% launch discount" },
    };

let selectedPlan = null;
let isYearly = false;
let appliedDiscount = 0;

// ── Init ──────────────────────────────────────────

document.addEventListener("DOMContentLoaded", function () {
  loadCurrentSubscription();
  setupBillingToggle();
  setupPlanButtons();
  setupMethodTabs();
  setupCheckoutClose();
  setupCoupon();
  setupPaymentForm();
  setupInvoiceToggle();
  setupCancelSub();
  setupPayFast();
  setupCoinbase();
  setupStripe();
  formatCardInputs();

  // ── URL param auto-open (from gate redirect) ──
  // Handles: studentpayment.html?plan=student_elite&provider=payfast&return=...
  (function handleGateRedirect() {
    const p = new URLSearchParams(window.location.search);
    const planParam = p.get("plan");
    const providerParam = p.get("provider");
    if (planParam && PLAN_LABELS[planParam]) {
      // Open checkout for the requested plan
      openCheckout(planParam);
      // Switch to the right payment tab
      if (providerParam === "payfast") {
        const pfTab = document.querySelector('[data-method="payfast"]');
        if (pfTab) pfTab.click();
      } else if (providerParam === "stripe") {
        const stripeTab = document.querySelector('[data-method="stripe"]');
        if (stripeTab) stripeTab.click();
      }
    }
  })();
});

// ── Subscription State ────────────────────────────

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadCurrentSubscription() {
  const sub = readJson(SUBSCRIPTION_KEY, null);
  const activePlanLabel = document.getElementById("activePlanLabel");
  const subInfoPanel = document.getElementById("subInfoPanel");
  const subPlanTitle = document.getElementById("subPlanTitle");
  const subRenewalDate = document.getElementById("subRenewalDate");
  const plansGrid = document.getElementById("plansGrid");

  if (!sub || sub.plan === "free") {
    if (activePlanLabel) activePlanLabel.textContent = "Free Plan";
    markCurrentPlanCard("free");
    return;
  }

  if (activePlanLabel) {
    activePlanLabel.textContent = PLAN_LABELS[sub.plan] + " — Active";
  }

  if (subInfoPanel) subInfoPanel.classList.remove("sp-hidden");
  if (subPlanTitle) {
    subPlanTitle.textContent = PLAN_LABELS[sub.plan] + " — Active";
  }
  if (subRenewalDate && sub.renewsOn) {
    subRenewalDate.textContent = "Renews on " + formatDate(sub.renewsOn);
  }

  markCurrentPlanCard(sub.plan);
  updateInvoicesList();
}

function markCurrentPlanCard(plan) {
  document.querySelectorAll(".plan-card").forEach(function (card) {
    const cardPlan = card.getAttribute("data-plan");
    const btn = card.querySelector(".plan-btn");
    if (!btn) return;

    if (cardPlan === plan) {
      btn.textContent = "Current Plan";
      btn.disabled = true;
      btn.classList.remove("upgrade-btn");
      btn.classList.add("current-btn");
      const badge = card.querySelector(".plan-badge");
      if (badge && cardPlan !== "free") {
        badge.textContent = "Active";
        badge.style.background = "rgba(61,255,192,.12)";
        badge.style.borderColor = "var(--green)";
        badge.style.color = "var(--green)";
      }
    } else {
      if (btn.classList.contains("current-btn") && cardPlan !== "free") {
        btn.textContent = "Upgrade Now";
        btn.disabled = false;
        btn.classList.add("upgrade-btn");
        btn.classList.remove("current-btn");
      }
    }
  });
}

// ── Billing Toggle ────────────────────────────────

function setupBillingToggle() {
  const toggle = document.getElementById("billingToggle");
  if (!toggle) return;

  toggle.addEventListener("change", function () {
    isYearly = toggle.checked;
    updateAllPlanPrices();
  });
}

function updateAllPlanPrices() {
  document.querySelectorAll(".plan-card").forEach(function (card) {
    const priceEl = card.querySelector(".price-amount");
    const periodEl = card.querySelector(".price-period");
    if (!priceEl) return;

    const monthly = priceEl.getAttribute("data-monthly");
    const yearly = priceEl.getAttribute("data-yearly");

    priceEl.textContent = isYearly ? yearly : monthly;
    if (periodEl) periodEl.textContent = isYearly ? "/yr" : "/mo";
  });

  if (selectedPlan) {
    updateOrderSummary(selectedPlan);
  }
}

// ── Plan Buttons ──────────────────────────────────

function setupPlanButtons() {
  document.querySelectorAll(".upgrade-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const plan = btn.getAttribute("data-target");
      openCheckout(plan);
    });
  });
}

function openCheckout(plan) {
  selectedPlan = plan;
  appliedDiscount = 0;

  const modal = document.getElementById("checkoutModal");
  const summary = document.getElementById("checkoutSummary");
  const couponInput = document.getElementById("couponCode");
  const couponMsg = document.getElementById("couponMsg");

  if (summary) {
    summary.innerHTML =
      "Upgrading to <strong>" +
      PLAN_LABELS[plan] +
      "</strong> — " +
      (isYearly ? "Yearly billing" : "Monthly billing");
  }

  if (couponInput) couponInput.value = "";
  if (couponMsg) {
    couponMsg.textContent = "";
    couponMsg.className = "coupon-msg";
  }

  updateOrderSummary(plan);
  generateBankRef();

  if (modal) modal.classList.add("open");

  document.getElementById("paymentForm").reset();
  showMethodPanel("card");
  document.querySelectorAll(".method-tab").forEach(function (t) {
    t.classList.remove("active");
  });
  const firstTab = document.querySelector(".method-tab[data-method='card']");
  if (firstTab) firstTab.classList.add("active");
}

function updateOrderSummary(plan) {
  const price = isYearly ? PLAN_YEARLY[plan] : PLAN_MONTHLY[plan];
  const discountedPrice = Math.max(
    0,
    price - Math.round((price * appliedDiscount) / 100),
  );
  const orderPlanName = document.getElementById("orderPlanName");
  const orderBilling = document.getElementById("orderBilling");
  const orderTotal = document.getElementById("orderTotal");
  const discountRow = document.getElementById("discountRow");
  const orderDiscount = document.getElementById("orderDiscount");

  if (orderPlanName) orderPlanName.textContent = PLAN_LABELS[plan];
  if (orderBilling) orderBilling.textContent = isYearly ? "Yearly" : "Monthly";
  if (orderTotal)
    orderTotal.textContent = "$" + discountedPrice + (isYearly ? "/yr" : "/mo");

  if (discountRow) {
    if (appliedDiscount > 0) {
      discountRow.classList.remove("sp-hidden");
      if (orderDiscount)
        orderDiscount.textContent = "–" + appliedDiscount + "%";
    } else {
      discountRow.classList.add("sp-hidden");
    }
  }
}

// ── Method Tabs ───────────────────────────────────

function setupMethodTabs() {
  document.querySelectorAll(".method-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".method-tab").forEach(function (t) {
        t.classList.remove("active");
      });
      tab.classList.add("active");
      showMethodPanel(tab.getAttribute("data-method"));
    });
  });
}

function showMethodPanel(method) {
  document.querySelectorAll(".pay-method-panel").forEach(function (p) {
    p.classList.remove("active");
  });
  const target = document.getElementById("panel-" + method);
  if (target) target.classList.add("active");
}

// ── Close Checkout ────────────────────────────────

function setupCheckoutClose() {
  const closeBtn = document.getElementById("closeCheckout");
  const overlay = document.getElementById("checkoutModal");

  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      if (overlay) overlay.classList.remove("open");
    });
  }

  if (overlay) {
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.classList.remove("open");
    });
  }
}

// ── Coupon ────────────────────────────────────────

function setupCoupon() {
  const applyBtn = document.getElementById("applyCoupon");
  if (!applyBtn) return;

  applyBtn.addEventListener("click", function () {
    const input = document.getElementById("couponCode");
    const msg = document.getElementById("couponMsg");
    const code = input ? input.value.trim().toUpperCase() : "";

    if (!code) {
      if (msg) {
        msg.textContent = "Enter a coupon code.";
        msg.className = "coupon-msg error";
      }
      return;
    }

    const coupon = VALID_COUPONS[code];
    if (!coupon) {
      if (msg) {
        msg.textContent = "Invalid coupon code.";
        msg.className = "coupon-msg error";
      }
      appliedDiscount = 0;
    } else {
      if (msg) {
        msg.textContent = "Coupon applied: " + coupon.label + "!";
        msg.className = "coupon-msg success";
      }
      appliedDiscount = coupon.discount;
    }

    if (selectedPlan) updateOrderSummary(selectedPlan);
  });
}

// ── Payment Form ──────────────────────────────────

function setupPaymentForm() {
  const form = document.getElementById("paymentForm");
  if (!form) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    handlePayment();
  });
}

function handlePayment() {
  const termsCheck = document.getElementById("termsCheck");
  if (!termsCheck || !termsCheck.checked) {
    alert("Please agree to the Terms of Service before proceeding.");
    return;
  }

  const activeTab = document.querySelector(".method-tab.active");
  const method = activeTab ? activeTab.getAttribute("data-method") : "card";

  if (method === "card" && !validateCardFields()) return;
  if (method === "mobile" && !validateMobileFields()) return;

  setPayBtnLoading(true);

  setTimeout(function () {
    setPayBtnLoading(false);
    completePurchase(method);
  }, 1800);
}

function validateCardFields() {
  const name = document.getElementById("cardName");
  const number = document.getElementById("cardNumber");
  const expiry = document.getElementById("cardExpiry");
  const cvc = document.getElementById("cardCvc");

  if (!name || !name.value.trim()) {
    alert("Please enter the cardholder name.");
    return false;
  }
  if (!number || number.value.replace(/\s/g, "").length < 13) {
    alert("Please enter a valid card number.");
    return false;
  }
  if (!expiry || expiry.value.trim().length < 4) {
    alert("Please enter a valid expiry date.");
    return false;
  }
  if (!cvc || cvc.value.trim().length < 3) {
    alert("Please enter the CVC.");
    return false;
  }
  return true;
}

function validateMobileFields() {
  const network = document.getElementById("mobileNetwork");
  const number = document.getElementById("mobileNumber");

  if (!network || !network.value) {
    alert("Please select a mobile network.");
    return false;
  }
  if (!number || !number.value.trim()) {
    alert("Please enter your mobile number.");
    return false;
  }
  return true;
}

function setPayBtnLoading(loading) {
  const payBtn = document.getElementById("payBtn");
  const payText = document.getElementById("payBtnText");
  const payLoading = document.getElementById("payBtnLoading");

  if (!payBtn) return;
  payBtn.disabled = loading;
  if (payText) payText.classList.toggle("sp-hidden", loading);
  if (payLoading) payLoading.classList.toggle("sp-hidden", !loading);
}

function completePurchase(method) {
  const receiptId = generateReceiptId();
  const plan = selectedPlan;
  const price = isYearly ? PLAN_YEARLY[plan] : PLAN_MONTHLY[plan];
  const discountedPrice = Math.max(
    0,
    price - Math.round((price * appliedDiscount) / 100),
  );

  const renewsOn = new Date();
  if (isYearly) {
    renewsOn.setFullYear(renewsOn.getFullYear() + 1);
  } else {
    renewsOn.setMonth(renewsOn.getMonth() + 1);
  }

  const subscription = {
    plan: plan,
    billing: isYearly ? "yearly" : "monthly",
    price: discountedPrice,
    activatedAt: new Date().toISOString(),
    renewsOn: renewsOn.toISOString(),
    receiptId: receiptId,
  };

  const payments = readJson(PAYMENTS_KEY, []);
  payments.unshift({
    receiptId: receiptId,
    plan: PLAN_LABELS[plan],
    amount: "$" + discountedPrice,
    date: new Date().toISOString(),
    status: method === "bank" ? "pending" : "paid",
    method: method,
  });

  writeJson(SUBSCRIPTION_KEY, subscription);
  writeJson(PAYMENTS_KEY, payments);

  document.getElementById("checkoutModal").classList.remove("open");
  showSuccessModal(plan, receiptId);
  loadCurrentSubscription();
  updateInvoicesList();
}

// ── Success Modal ─────────────────────────────────

function showSuccessModal(plan, receiptId) {
  hideProcessingModal();
  const modal = document.getElementById("successModal");
  const receiptEl = document.getElementById("receiptId");
  const planMsg = document.getElementById("successPlanMsg");
  const heading = modal ? modal.querySelector("h2") : null;

  if (receiptEl) receiptEl.textContent = receiptId;
  if (heading) heading.textContent = i18nText("payment.success", "Payment Successful");
  if (planMsg)
    planMsg.textContent = "Your " + (PLAN_LABELS[plan] || plan) + " plan is now active.";
  if (modal) modal.classList.add("open");

  // Determine if there's a return destination (set by gate modal's payWithFast/payWithStripe)
  const returnUrl = sessionStorage.getItem("pg_return");

  function handleClose() {
    if (modal) modal.classList.remove("open");
    // ── Redirect back to originating page with payment success flag ──
    if (returnUrl) {
      sessionStorage.removeItem("pg_return");
      const sep = returnUrl.includes("?") ? "&" : "?";
      window.location.href = returnUrl + sep + "payment=success&plan=" + encodeURIComponent(plan);
    }
  }

  const viewInvoicesBtn = document.getElementById("successViewInvoices");
  if (viewInvoicesBtn) {
    viewInvoicesBtn.addEventListener(
      "click",
      function () {
        if (modal) modal.classList.remove("open");
        showInvoices();
      },
      { once: true },
    );
  }

  modal.addEventListener(
    "click",
    function (e) {
      if (e.target === modal) handleClose();
    },
    { once: true },
  );

  // Also wire the close/done button if present
  const doneBtn = modal ? modal.querySelector(".success-close, #successClose, [data-dismiss='success']") : null;
  if (doneBtn) doneBtn.addEventListener("click", handleClose, { once: true });
}

// ── Invoice Toggle ────────────────────────────────

function setupInvoiceToggle() {
  const viewBtn = document.getElementById("viewInvoicesBtn");
  if (!viewBtn) return;

  viewBtn.addEventListener("click", function (e) {
    e.preventDefault();
    showInvoices();
  });
}

function showInvoices() {
  const section = document.getElementById("invoicesSection");
  if (!section) return;
  section.classList.remove("sp-hidden");
  section.scrollIntoView({ behavior: "smooth" });
  updateInvoicesList();
}

function updateInvoicesList() {
  const list = document.getElementById("invoicesList");
  if (!list) return;

  const payments = readJson(PAYMENTS_KEY, []);

  if (!payments.length) {
    list.innerHTML = '<div class="invoice-empty">No billing history yet.</div>';
    return;
  }

  list.innerHTML = payments
    .map(function (p) {
      const statusClass = p.status === "paid" ? "paid" : "pending";
      const statusIcon = p.status === "paid" ? "fa-check" : "fa-clock";
      return (
        '<div class="invoice-row">' +
        "<span>" +
        escHtml(p.receiptId) +
        "</span>" +
        "<span>" +
        escHtml(p.plan) +
        "</span>" +
        "<span>" +
        escHtml(p.amount) +
        "</span>" +
        "<span>" +
        formatDate(p.date) +
        "</span>" +
        '<span><span class="invoice-status ' +
        statusClass +
        '"><i class="fa-solid ' +
        statusIcon +
        '"></i> ' +
        capitalize(p.status) +
        "</span></span>" +
        "</div>"
      );
    })
    .join("");
}

// ── Cancel Subscription ───────────────────────────

function setupCancelSub() {
  const cancelBtn = document.getElementById("cancelSubBtn");
  if (!cancelBtn) return;

  cancelBtn.addEventListener("click", function () {
    const sub = readJson(SUBSCRIPTION_KEY, null);
    if (!sub || sub.plan === "free") return;

    const confirmed = confirm(
      "Cancel your " +
        PLAN_LABELS[sub.plan] +
        " subscription?\n\n" +
        "You will retain access until " +
        formatDate(sub.renewsOn) +
        ", after which your plan reverts to Free.",
    );

    if (!confirmed) return;

    sub.cancelledAt = new Date().toISOString();
    sub.status = "cancelled";
    writeJson(SUBSCRIPTION_KEY, sub);

    const subInfoPanel = document.getElementById("subInfoPanel");
    const subPlanTitle = document.getElementById("subPlanTitle");
    if (subPlanTitle)
      subPlanTitle.textContent = PLAN_LABELS[sub.plan] + " — Cancelled";
    if (cancelBtn) cancelBtn.textContent = "Subscription Cancelled";
    cancelBtn.disabled = true;
  });
}

// ── Bank Ref ──────────────────────────────────────

function generateBankRef() {
  const ref = document.getElementById("bankRef");
  if (ref) ref.textContent = generateReceiptId();
}

// ── Card Input Formatting ─────────────────────────

function formatCardInputs() {
  const cardNum = document.getElementById("cardNumber");
  if (cardNum) {
    cardNum.addEventListener("input", function () {
      let v = cardNum.value.replace(/\D/g, "").slice(0, 16);
      cardNum.value = v.replace(/(.{4})/g, "$1 ").trim();
      updateCardBrandIcon(v);
    });
  }

  const expiry = document.getElementById("cardExpiry");
  if (expiry) {
    expiry.addEventListener("input", function () {
      let v = expiry.value.replace(/\D/g, "").slice(0, 4);
      if (v.length >= 3) v = v.slice(0, 2) + " / " + v.slice(2);
      expiry.value = v;
    });
  }
}

function updateCardBrandIcon(number) {
  const icon = document.getElementById("cardBrandIcon");
  if (!icon) return;
  if (/^4/.test(number)) {
    icon.innerHTML = '<i class="fa-brands fa-cc-visa"></i>';
  } else if (/^5[1-5]/.test(number)) {
    icon.innerHTML = '<i class="fa-brands fa-cc-mastercard"></i>';
  } else if (/^3[47]/.test(number)) {
    icon.innerHTML = '<i class="fa-brands fa-cc-amex"></i>';
  } else {
    icon.innerHTML = '<i class="fa-regular fa-credit-card"></i>';
  }
}

// ── Helpers ───────────────────────────────────────

function generateReceiptId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "SP-";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch (e) {
    return "—";
  }
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Plan Gate (importable by other pages) ─────────

// Teacher plan gate
window.spHasActivePlan = function (requiredPlan) {
  const sub = readJson("sp_subscription", null);
  if (!sub || sub.plan === "free" || sub.status === "cancelled") return false;
  const tiers = ["free", "pro", "school"];
  return tiers.indexOf(sub.plan) >= tiers.indexOf(requiredPlan);
};

window.spRequirePlan = function (requiredPlan, featureName) {
  if (!window.spHasActivePlan(requiredPlan)) {
    const go = confirm(
      (featureName || "This feature") +
        " requires the " +
        TEACHER_PLAN_LABELS[requiredPlan] +
        " plan.\n\nUpgrade now?",
    );
    if (go) window.location.href = "payment.html";
    return false;
  }
  return true;
};

// Student plan gate
window.spStudentHasActivePlan = function (requiredPlan) {
  const sub = readJson("sp_student_subscription", null);
  if (!sub || sub.plan === "free" || sub.status === "cancelled") return false;
  const tiers = ["free", "student_plus", "student_elite"];
  return tiers.indexOf(sub.plan) >= tiers.indexOf(requiredPlan);
};

window.spStudentRequirePlan = function (requiredPlan, featureName) {
  if (!window.spStudentHasActivePlan(requiredPlan)) {
    const go = confirm(
      (featureName || "This feature") +
        " requires the " +
        STUDENT_PLAN_LABELS[requiredPlan] +
        " plan.\n\nUpgrade now?",
    );
    if (go) window.location.href = "student-payment.html";
    return false;
  }
  return true;
};

// XP multiplier helper for student pages
window.spGetXpMultiplier = function () {
  const sub = readJson("sp_student_subscription", null);
  if (!sub || sub.status === "cancelled") return 1;
  if (sub.plan === "student_elite") return 2;
  if (sub.plan === "student_plus") return 1.5;
  return 1;
};
