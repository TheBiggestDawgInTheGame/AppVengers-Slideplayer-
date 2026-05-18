// payment.js — SlidePlay Billing & Subscription Logic

// ── Role detection (set data-role="student" on <body> for student page) ──
const IS_STUDENT = document.body.getAttribute("data-role") === "student";

const SUBSCRIPTION_KEY = IS_STUDENT ? "sp_student_subscription" : "sp_subscription";
const PAYMENTS_KEY = IS_STUDENT ? "sp_student_payments" : "sp_payments";
const CHECKOUT_SESSION_KEY = IS_STUDENT ? "sp_student_last_stripe_session" : "sp_last_stripe_session";
const CHECKOUT_MODE_KEY = IS_STUDENT ? "sp_student_checkout_mode" : "sp_checkout_mode";
const DEFAULT_BILLING_PAGE = IS_STUDENT ? "/student-payment.html" : "/payment.html";
const API_BASE = /^https?:$/i.test(window.location.protocol) ? window.location.origin : "http://localhost:3000";

// Teacher plans
const TEACHER_PLAN_LABELS   = { free: "Free", pro: "Teacher Pro", school: "School Premium" };
const TEACHER_PLAN_MONTHLY  = { free: 0, pro: 12, school: 49 };
const TEACHER_PLAN_YEARLY   = { free: 0, pro: 115, school: 470 };

// Student plans
const STUDENT_PLAN_LABELS   = { free: "Free Explorer", student_plus: "Student Plus", student_elite: "Student Elite" };
const STUDENT_PLAN_MONTHLY  = { free: 0, student_plus: 5, student_elite: 9 };
const STUDENT_PLAN_YEARLY   = { free: 0, student_plus: 48, student_elite: 86 };

const PLAN_LABELS  = IS_STUDENT ? STUDENT_PLAN_LABELS  : TEACHER_PLAN_LABELS;
const PLAN_MONTHLY = IS_STUDENT ? STUDENT_PLAN_MONTHLY : TEACHER_PLAN_MONTHLY;
const PLAN_YEARLY  = IS_STUDENT ? STUDENT_PLAN_YEARLY  : TEACHER_PLAN_YEARLY;

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
let checkoutMode = "live";

// ── Init ──────────────────────────────────────────

document.addEventListener("DOMContentLoaded", function () {
  hydrateCheckoutMode();
  loadCurrentSubscription();
  setupBillingToggle();
  setupPlanButtons();
  setupMethodTabs();
  setupCheckoutClose();
  setupCoupon();
  setupPaymentForm();
  setupInvoiceToggle();
  setupCancelSub();
  hydrateCheckoutProfile();
  refreshCheckoutMode();
  updatePayButtonLabel("card");
  handleCheckoutReturn();
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

function getCurrentBillingPagePath() {
  if (window.location.pathname && window.location.pathname !== "/") {
    return window.location.pathname;
  }

  return DEFAULT_BILLING_PAGE;
}

function clearCheckoutSearchParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("checkout");
  url.searchParams.delete("session_id");
  window.history.replaceState({}, document.title, url.toString());
}

function getSessionProfile() {
  const session = readJson("sp_session", null);
  if (session && session.email) return session;

  const currentUser = readJson("sp_cu", null);
  if (currentUser && currentUser.email) {
    return {
      id: currentUser.id,
      username: currentUser.name,
      email: currentUser.email,
      role: currentUser.role,
    };
  }

  return null;
}

function hydrateCheckoutProfile() {
  const profile = getSessionProfile();
  const nameEl = document.getElementById("checkoutCustomerName");
  const emailEl = document.getElementById("checkoutCustomerEmail");

  if (nameEl) {
    nameEl.textContent = profile && (profile.username || profile.email)
      ? (profile.username || profile.email)
      : "Sign in to continue";
  }

  if (emailEl) {
    emailEl.textContent = profile && profile.email ? profile.email : "No account email found";
  }
}

function hydrateCheckoutMode() {
  const storedMode = localStorage.getItem(CHECKOUT_MODE_KEY);
  if (storedMode === "demo" || storedMode === "live") {
    checkoutMode = storedMode;
  }

  renderCheckoutModeBadge();
}

function setCheckoutMode(mode) {
  checkoutMode = mode === "demo" ? "demo" : "live";
  localStorage.setItem(CHECKOUT_MODE_KEY, checkoutMode);
  renderCheckoutModeBadge();
}

function renderCheckoutModeBadge() {
  const badge = document.getElementById("checkoutModeBadge");
  const pageChip = document.getElementById("pageModeChip");

  if (badge) {
    badge.classList.remove("live", "demo", "sp-hidden");
  }

  if (pageChip) {
    pageChip.classList.remove("live", "demo");
  }

  if (checkoutMode === "demo") {
    if (badge) {
      badge.classList.add("demo");
      badge.innerHTML = '<i class="fa-solid fa-flask"></i><span>Demo Mode: simulating checkout (no real charge).</span>';
    }
    if (pageChip) {
      pageChip.classList.add("demo");
      pageChip.innerHTML = '<i class="fa-solid fa-flask"></i><span>Demo Mode</span>';
    }
    return;
  }

  if (badge) {
    badge.classList.add("live");
    badge.innerHTML = '<i class="fa-solid fa-shield-halved"></i><span>Live Mode: checkout handled by Stripe.</span>';
  }
  if (pageChip) {
    pageChip.classList.add("live");
    pageChip.innerHTML = '<i class="fa-solid fa-shield-halved"></i><span>Live Mode</span>';
  }
}

async function refreshCheckoutMode() {
  if (!/^https?:$/i.test(window.location.protocol)) {
    renderCheckoutModeBadge();
    return;
  }

  try {
    const response = await fetch(API_BASE + "/health", { cache: "no-store" });
    if (!response.ok) return;

    const data = await response.json();
    setCheckoutMode(data && data.hasStripeKey === false ? "demo" : "live");
  } catch (error) {
    renderCheckoutModeBadge();
  }
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
    summary.innerHTML = "Upgrading to <strong>" + PLAN_LABELS[plan] + "</strong> — " +
      (isYearly ? "Yearly billing" : "Monthly billing") +
      ". Card payments continue on Stripe so details are only entered once.";
  }

  if (couponInput) couponInput.value = "";
  if (couponMsg) { couponMsg.textContent = ""; couponMsg.className = "coupon-msg"; }

  updateOrderSummary(plan);
  generateBankRef();

  if (modal) modal.classList.add("open");

  document.getElementById("paymentForm").reset();
  hydrateCheckoutProfile();
  renderCheckoutModeBadge();
  refreshCheckoutMode();
  showMethodPanel("card");
  document.querySelectorAll(".method-tab").forEach(function (t) { t.classList.remove("active"); });
  const firstTab = document.querySelector(".method-tab[data-method='card']");
  if (firstTab) firstTab.classList.add("active");
  updatePayButtonLabel("card");
}

function updateOrderSummary(plan) {
  const price = isYearly ? PLAN_YEARLY[plan] : PLAN_MONTHLY[plan];
  const discountedPrice = Math.max(0, price - Math.round(price * appliedDiscount / 100));
  const orderPlanName = document.getElementById("orderPlanName");
  const orderBilling = document.getElementById("orderBilling");
  const orderTotal = document.getElementById("orderTotal");
  const discountRow = document.getElementById("discountRow");
  const orderDiscount = document.getElementById("orderDiscount");

  if (orderPlanName) orderPlanName.textContent = PLAN_LABELS[plan];
  if (orderBilling) orderBilling.textContent = isYearly ? "Yearly" : "Monthly";
  if (orderTotal) orderTotal.textContent = "$" + discountedPrice + (isYearly ? "/yr" : "/mo");

  if (discountRow) {
    if (appliedDiscount > 0) {
      discountRow.classList.remove("sp-hidden");
      if (orderDiscount) orderDiscount.textContent = "–" + appliedDiscount + "%";
    } else {
      discountRow.classList.add("sp-hidden");
    }
  }
}

// ── Method Tabs ───────────────────────────────────

function setupMethodTabs() {
  document.querySelectorAll(".method-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".method-tab").forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      const method = tab.getAttribute("data-method");
      showMethodPanel(method);
      updatePayButtonLabel(method);
    });
  });
}

function showMethodPanel(method) {
  document.querySelectorAll(".pay-method-panel").forEach(function (p) { p.classList.remove("active"); });
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
    const code = (input ? input.value.trim().toUpperCase() : "");

    if (!code) {
      if (msg) { msg.textContent = "Enter a coupon code."; msg.className = "coupon-msg error"; }
      return;
    }

    const coupon = VALID_COUPONS[code];
    if (!coupon) {
      if (msg) { msg.textContent = "Invalid coupon code."; msg.className = "coupon-msg error"; }
      appliedDiscount = 0;
    } else {
      if (msg) { msg.textContent = "Coupon applied: " + coupon.label + "!"; msg.className = "coupon-msg success"; }
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

  if (method === "card" && !validateCheckoutProfile()) return;
  if (method === "mobile" && !validateMobileFields()) return;

  if (method === "card") {
    redirectToStripeCheckout();
    return;
  }

  setPayBtnLoading(true);

  setTimeout(function () {
    setPayBtnLoading(false);
    completePurchase(method);
  }, 1800);
}

function validateCheckoutProfile() {
  const profile = getSessionProfile();

  if (!profile || !profile.email) {
    alert("Please sign in again so we can send your billing details to Stripe Checkout.");
    return false;
  }

  hydrateCheckoutProfile();
  return true;
}

async function redirectToStripeCheckout() {
  if (!/^https?:$/i.test(window.location.protocol)) {
    alert("Run SlidePlay through the local server before using Stripe Checkout. Open http://localhost:3000" + DEFAULT_BILLING_PAGE + ".");
    return;
  }

  const profile = getSessionProfile();
  const couponInput = document.getElementById("couponCode");

  setPayBtnLoading(true);

  try {
    const response = await fetch(API_BASE + "/api/stripe/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan: selectedPlan,
        billingPeriod: isYearly ? "yearly" : "monthly",
        role: IS_STUDENT ? "student" : "teacher",
        couponCode: couponInput ? couponInput.value.trim().toUpperCase() : "",
        customerEmail: profile ? profile.email : "",
        customerName: profile ? (profile.username || profile.email || "") : "",
        successPath: getCurrentBillingPagePath(),
        cancelPath: getCurrentBillingPagePath(),
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.url) {
      throw new Error(data.error || "Unable to start Stripe Checkout.");
    }

    setCheckoutMode(data.mode || "live");

    window.location.assign(data.url);
  } catch (error) {
    alert(error.message || "Unable to reach Stripe Checkout right now.");
    setPayBtnLoading(false);
  }
}

async function handleCheckoutReturn() {
  const url = new URL(window.location.href);
  const checkoutState = url.searchParams.get("checkout");
  const sessionId = url.searchParams.get("session_id");

  if (!checkoutState) {
    return;
  }

  if (checkoutState === "cancel") {
    clearCheckoutSearchParams();
    alert("Stripe Checkout was canceled before payment was completed.");
    return;
  }

  if (checkoutState !== "success" || !sessionId) {
    clearCheckoutSearchParams();
    return;
  }

  if (localStorage.getItem(CHECKOUT_SESSION_KEY) === sessionId) {
    clearCheckoutSearchParams();
    return;
  }

  setPayBtnLoading(true);

  try {
    const response = await fetch(API_BASE + "/api/stripe/checkout-session/" + encodeURIComponent(sessionId));
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to verify Stripe Checkout.");
    }

    if (data.status !== "complete") {
      throw new Error("Stripe has not marked this checkout as complete yet.");
    }

    localStorage.setItem(CHECKOUT_SESSION_KEY, sessionId);
    completePurchase("card", {
      billing: data.metadata && data.metadata.billing ? data.metadata.billing : "monthly",
      customerEmail: data.customerEmail || "",
      plan: data.metadata && data.metadata.plan ? data.metadata.plan : selectedPlan,
      price: typeof data.amountTotal === "number" ? data.amountTotal / 100 : undefined,
      receiptId: data.receiptId || sessionId,
    });
  } catch (error) {
    alert(error.message || "Unable to verify your Stripe payment.");
  } finally {
    clearCheckoutSearchParams();
    setPayBtnLoading(false);
  }
}

function validateMobileFields() {
  const network = document.getElementById("mobileNetwork");
  const number = document.getElementById("mobileNumber");

  if (!network || !network.value) { alert("Please select a mobile network."); return false; }
  if (!number || !number.value.trim()) { alert("Please enter your mobile number."); return false; }
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

function updatePayButtonLabel(method) {
  const payBtnText = document.getElementById("payBtnText");
  if (!payBtnText) return;

  if (method === "card") {
    payBtnText.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i> Continue to Stripe';
    return;
  }

  if (method === "bank") {
    payBtnText.innerHTML = '<i class="fa-solid fa-building-columns"></i> Confirm Transfer';
    return;
  }

  payBtnText.innerHTML = '<i class="fa-solid fa-lock"></i> Pay Now';
}

function completePurchase(method, overrides) {
  const purchase = overrides || {};
  const plan = purchase.plan || selectedPlan;
  const billing = purchase.billing || (isYearly ? "yearly" : "monthly");
  const price = billing === "yearly" ? PLAN_YEARLY[plan] : PLAN_MONTHLY[plan];
  const finalPrice = typeof purchase.price === "number"
    ? purchase.price
    : Math.max(0, price - Math.round(price * appliedDiscount / 100));
  const receiptId = purchase.receiptId || generateReceiptId();
  const profile = getSessionProfile();
  const customerEmail = purchase.customerEmail || (profile ? profile.email : "");

  const renewsOn = new Date();
  if (billing === "yearly") {
    renewsOn.setFullYear(renewsOn.getFullYear() + 1);
  } else {
    renewsOn.setMonth(renewsOn.getMonth() + 1);
  }

  const subscription = {
    plan: plan,
    billing: billing,
    price: finalPrice,
    activatedAt: new Date().toISOString(),
    renewsOn: renewsOn.toISOString(),
    receiptId: receiptId,
    checkoutProvider: method === "card" ? "stripe" : method,
    customerEmail: customerEmail,
  };

  const payments = readJson(PAYMENTS_KEY, []);
  payments.unshift({
    receiptId: receiptId,
    plan: PLAN_LABELS[plan],
    amount: "$" + finalPrice,
    date: new Date().toISOString(),
    status: method === "bank" ? "pending" : "paid",
    method: method,
    customerEmail: customerEmail,
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
  const modal = document.getElementById("successModal");
  const receiptEl = document.getElementById("receiptId");
  const planMsg = document.getElementById("successPlanMsg");

  if (receiptEl) receiptEl.textContent = receiptId;
  if (planMsg) planMsg.textContent = "Your " + PLAN_LABELS[plan] + " plan is now active.";
  if (modal) modal.classList.add("open");

  const viewInvoicesBtn = document.getElementById("successViewInvoices");
  if (viewInvoicesBtn) {
    viewInvoicesBtn.addEventListener("click", function () {
      modal.classList.remove("open");
      showInvoices();
    }, { once: true });
  }

  modal.addEventListener("click", function (e) {
    if (e.target === modal) modal.classList.remove("open");
  }, { once: true });
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

  list.innerHTML = payments.map(function (p) {
    const statusClass = p.status === "paid" ? "paid" : "pending";
    const statusIcon = p.status === "paid" ? "fa-check" : "fa-clock";
    return '<div class="invoice-row">'
      + '<span>' + escHtml(p.receiptId) + '</span>'
      + '<span>' + escHtml(p.plan) + '</span>'
      + '<span>' + escHtml(p.amount) + '</span>'
      + '<span>' + formatDate(p.date) + '</span>'
      + '<span><span class="invoice-status ' + statusClass + '"><i class="fa-solid ' + statusIcon + '"></i> ' + capitalize(p.status) + '</span></span>'
      + '</div>';
  }).join("");
}

// ── Cancel Subscription ───────────────────────────

function setupCancelSub() {
  const cancelBtn = document.getElementById("cancelSubBtn");
  if (!cancelBtn) return;

  cancelBtn.addEventListener("click", function () {
    const sub = readJson(SUBSCRIPTION_KEY, null);
    if (!sub || sub.plan === "free") return;

    const confirmed = confirm(
      "Cancel your " + PLAN_LABELS[sub.plan] + " subscription?\n\n" +
      "You will retain access until " + formatDate(sub.renewsOn) + ", after which your plan reverts to Free."
    );

    if (!confirmed) return;

    sub.cancelledAt = new Date().toISOString();
    sub.status = "cancelled";
    writeJson(SUBSCRIPTION_KEY, sub);

    const subInfoPanel = document.getElementById("subInfoPanel");
    const subPlanTitle = document.getElementById("subPlanTitle");
    if (subPlanTitle) subPlanTitle.textContent = PLAN_LABELS[sub.plan] + " — Cancelled";
    if (cancelBtn) cancelBtn.textContent = "Subscription Cancelled";
    cancelBtn.disabled = true;
  });
}

// ── Bank Ref ──────────────────────────────────────

function generateBankRef() {
  const ref = document.getElementById("bankRef");
  if (ref) ref.textContent = generateReceiptId();
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
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
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
      (featureName || "This feature") + " requires the " + TEACHER_PLAN_LABELS[requiredPlan] + " plan.\n\nUpgrade now?"
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
      (featureName || "This feature") + " requires the " + STUDENT_PLAN_LABELS[requiredPlan] + " plan.\n\nUpgrade now?"
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
