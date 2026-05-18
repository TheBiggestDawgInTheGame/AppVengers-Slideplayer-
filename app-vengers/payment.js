// payment.js — SlidePlay Billing & Subscription Logic

// ── Role detection (set data-role="student" on <body> for student page) ──
const IS_STUDENT = document.body.getAttribute("data-role") === "student";

const SUBSCRIPTION_KEY = IS_STUDENT ? "sp_student_subscription" : "sp_subscription";
const PAYMENTS_KEY = IS_STUDENT ? "sp_student_payments" : "sp_payments";

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

// ── Stripe Return Handler ─────────────────────────
// Called on page load to detect redirects back from Stripe Checkout.
function handleStripeReturn() {
  const params = new URLSearchParams(window.location.search);

  // PayFast return
  const pfStatus = params.get("payfast_status");
  if (pfStatus) {
    history.replaceState({}, "", window.location.pathname);
    if (pfStatus === "cancelled") {
      alert("PayFast payment was cancelled. Your plan was not changed.");
      return;
    }
    if (pfStatus === "success") {
      const pending = readJson("sp_pending_checkout", null);
      const plan    = pending?.plan    || (IS_STUDENT ? "student_plus" : "pro");
      const billing = pending?.billing || "monthly";
      localStorage.removeItem("sp_pending_checkout");
      const renewsOn = new Date();
      if (billing === "yearly") renewsOn.setFullYear(renewsOn.getFullYear() + 1);
      else renewsOn.setMonth(renewsOn.getMonth() + 1);
      const receiptId = generateReceiptId();
      const subscription = {
        plan, billing,
        price: billing === "yearly" ? PLAN_YEARLY[plan] : PLAN_MONTHLY[plan],
        activatedAt: new Date().toISOString(),
        renewsOn: renewsOn.toISOString(),
        receiptId,
        source: "payfast",
      };
      const payments = readJson(PAYMENTS_KEY, []);
      payments.unshift({ receiptId, plan: PLAN_LABELS[plan], amount: "R" + subscription.price, date: new Date().toISOString(), status: "paid", method: "payfast" });
      writeJson(SUBSCRIPTION_KEY, subscription);
      writeJson(PAYMENTS_KEY, payments);
      showSuccessModal(plan, receiptId);
      return;
    }
  }

  // Stripe return
  const status = params.get("status");
  if (!status) return;

  // Clean the URL so a refresh doesn't re-trigger this
  history.replaceState({}, "", window.location.pathname);

  if (status === "cancelled") {
    alert("Checkout was cancelled. Your plan was not changed.");
    return;
  }

  if (status === "success") {
    // Stripe has confirmed payment on its end. Record locally and show success.
    // In production, listen to the stripe webhook (checkout.session.completed)
    // and write the authoritative subscription record from the server.
    const sessionId = params.get("session_id") || "";

    // We don't know the exact plan from the URL alone, so read the last
    // pending selection saved before redirect (or default to the first paid plan).
    const pending = readJson("sp_pending_checkout", null);
    const plan    = pending?.plan    || (IS_STUDENT ? "student_plus" : "pro");
    const billing = pending?.billing || "monthly";
    localStorage.removeItem("sp_pending_checkout");

    const renewsOn = new Date();
    if (billing === "yearly") {
      renewsOn.setFullYear(renewsOn.getFullYear() + 1);
    } else {
      renewsOn.setMonth(renewsOn.getMonth() + 1);
    }

    const receiptId = sessionId ? "SP-" + sessionId.slice(-8).toUpperCase() : generateReceiptId();

    const subscription = {
      plan, billing,
      price: isYearly ? PLAN_YEARLY[plan] : PLAN_MONTHLY[plan],
      activatedAt: new Date().toISOString(),
      renewsOn: renewsOn.toISOString(),
      receiptId,
      source: "stripe",
    };

    const payments = readJson(PAYMENTS_KEY, []);
    payments.unshift({
      receiptId,
      plan: PLAN_LABELS[plan],
      amount: "$" + subscription.price,
      date: new Date().toISOString(),
      status: "paid",
      method: "stripe",
    });

    writeJson(SUBSCRIPTION_KEY, subscription);
    writeJson(PAYMENTS_KEY, payments);

    showSuccessModal(plan, receiptId);
  }
}

// ── Init ──────────────────────────────────────────

document.addEventListener("DOMContentLoaded", function () {
  handleStripeReturn();     // ← check ?status= from Stripe redirect first
  loadCurrentSubscription();
  setupBillingToggle();
  setupPlanButtons();
  setupMethodTabs();
  setupCheckoutClose();
  setupCoupon();
  setupPaymentForm();
  setupInvoiceToggle();
  setupCancelSub();
  formatCardInputs();
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
    summary.innerHTML = "Upgrading to <strong>" + PLAN_LABELS[plan] + "</strong> — " +
      (isYearly ? "Yearly billing" : "Monthly billing");
  }

  if (couponInput) couponInput.value = "";
  if (couponMsg) { couponMsg.textContent = ""; couponMsg.className = "coupon-msg"; }

  updateOrderSummary(plan);
  generateBankRef();

  if (modal) modal.classList.add("open");

  document.getElementById("paymentForm").reset();
  showMethodPanel("card");
  document.querySelectorAll(".method-tab").forEach(function (t) { t.classList.remove("active"); });
  const firstTab = document.querySelector(".method-tab[data-method='card']");
  if (firstTab) firstTab.classList.add("active");
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
      showMethodPanel(tab.getAttribute("data-method"));
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

// ── Stripe Checkout ───────────────────────────────

/**
 * Create a Stripe Checkout session via the backend and redirect the user.
 * Called when the active payment method is "card".
 */
async function createStripeSession(plan, billing, role, appliedDiscount = 0) {
  const res = await fetch('http://localhost:3000/api/payments/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, billing, role, appliedDiscount })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Stripe session failed');
  return data.url; // Redirect user to this URL
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

async function handlePayment() {
  // ── Must be logged in ─────────────────────────
  const session = readJson("sp_session", null);
  if (!session || !session.email) {
    alert("You must be logged in to purchase a plan.");
    window.location.href = "login.html";
    return;
  }

  // ── Cannot buy the same plan twice ────────────
  const existingSub = readJson(SUBSCRIPTION_KEY, null);
  if (existingSub && existingSub.plan === selectedPlan && existingSub.plan !== "free") {
    alert("You are already subscribed to " + PLAN_LABELS[selectedPlan] + ". No changes were made.");
    return;
  }

  // ── Terms must be agreed ──────────────────────
  const termsCheck = document.getElementById("termsCheck");
  if (!termsCheck || !termsCheck.checked) {
    alert("Please agree to the Terms of Service before proceeding.");
    return;
  }

  const activeTab = document.querySelector(".method-tab.active");
  const method = activeTab ? activeTab.getAttribute("data-method") : "card";

  if (method === "card" && !validateCardFields()) return;
  if (method === "mobile" && !validateMobileFields()) return;

  if (method === "crypto") {
    // ── Coinbase Commerce path ────────────────────
    setPayBtnLoading(true);
    const plan  = selectedPlan;
    const price = isYearly ? PLAN_YEARLY[plan] : PLAN_MONTHLY[plan];
    const discountedPrice = Math.max(0, price - Math.round(price * appliedDiscount / 100));
    try {
      const res = await fetch("http://localhost:3000/api/payments/create-crypto-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: PLAN_LABELS[plan] + " — SlidePlay",
          description: (isYearly ? "Yearly" : "Monthly") + " subscription",
          amountUsd: discountedPrice,
          metadata: { plan, billing: isYearly ? "yearly" : "monthly", role: IS_STUDENT ? "student" : "teacher" }
        })
      });
      const data = await res.json();
      setPayBtnLoading(false);
      if (!res.ok || !data.hostedUrl) {
        alert("Could not create crypto charge: " + (data.error || "Unknown error"));
        return;
      }
      // Save pending so we can record the subscription if the user returns
      writeJson("sp_pending_checkout", { plan, billing: isYearly ? "yearly" : "monthly" });
      window.location.href = data.hostedUrl;
    } catch (err) {
      setPayBtnLoading(false);
      alert("Crypto payment error: " + err.message);
    }
    return;
  }

  if (method === "payfast") {
    // ── PayFast redirect flow (SA gateway) ────────────
    setPayBtnLoading(true);
    const plan  = selectedPlan;
    const price = isYearly ? PLAN_YEARLY[plan] : PLAN_MONTHLY[plan];
    const discountedPrice = Math.max(0, price - Math.round(price * appliedDiscount / 100));
    if (discountedPrice === 0) {
      setPayBtnLoading(false);
      completePurchase(method);
      return;
    }
    const session = readJson("sp_session", null);
    const pfFirst = (document.getElementById("pfFirstName")?.value || "").trim() || "SlidePlay";
    const pfLast  = (document.getElementById("pfLastName")?.value  || "").trim() || "User";
    try {
      const res = await fetch("http://localhost:3000/api/payments/create-payfast-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planLabel:  PLAN_LABELS[plan] + " — SlidePlay " + (isYearly ? "Yearly" : "Monthly"),
          amountZar:  discountedPrice,
          email:      session?.email || "",
          firstName:  pfFirst,
          lastName:   pfLast,
          orderId:    "SP-" + Date.now()
        })
      });
      const data = await res.json();
      setPayBtnLoading(false);
      if (!res.ok || !data.action || !data.fields) {
        alert("Could not initiate PayFast payment: " + (data.error || "Unknown error"));
        return;
      }
      // Save pending plan so we can record the subscription on return
      writeJson("sp_pending_checkout", { plan, billing: isYearly ? "yearly" : "monthly" });
      // Build and submit hidden form to PayFast
      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.action;
      Object.entries(data.fields).forEach(function ([k, v]) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = k;
        input.value = String(v);
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      setPayBtnLoading(false);
      alert("PayFast error: " + err.message);
    }
    return;
  }

  setPayBtnLoading(true);
  setTimeout(function () {
    setPayBtnLoading(false);
    completePurchase(method);
  }, 1800);
}

// ── Luhn algorithm ───────────────────────────────
function luhnCheck(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 13) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

// ── Card expiry check (MM/YY) ─────────────────────
function isCardExpired(expiry) {
  const parts = expiry.replace(/\s/g, "").split("/");
  if (parts.length !== 2) return true;
  const month = parseInt(parts[0], 10);
  const year = parseInt("20" + parts[1], 10);
  if (isNaN(month) || isNaN(year) || month < 1 || month > 12) return true;
  const now = new Date();
  const expDate = new Date(year, month); // first day of the month AFTER expiry
  return now >= expDate;
}

function validateCardFields() {
  const name = document.getElementById("cardName");
  const number = document.getElementById("cardNumber");
  const expiry = document.getElementById("cardExpiry");
  const cvc = document.getElementById("cardCvc");

  // Name: must have at least first and last name
  if (!name || name.value.trim().split(/\s+/).filter(Boolean).length < 2) {
    alert("Please enter your full name (first and last name).");
    return false;
  }

  // Card number: Luhn check
  if (!number || !luhnCheck(number.value)) {
    alert("The card number is invalid. Please check and try again.");
    return false;
  }

  // Expiry: must not be expired
  if (!expiry || expiry.value.trim().length < 4 || isCardExpired(expiry.value.trim())) {
    alert("Your card has expired or the expiry date is invalid.");
    return false;
  }

  // CVC: 3 digits (4 for Amex — 15-digit cards)
  const rawNum = number.value.replace(/\D/g, "");
  const expectedCvc = rawNum.length === 15 ? 4 : 3;
  if (!cvc || cvc.value.replace(/\D/g, "").length < expectedCvc) {
    alert("Please enter a valid " + expectedCvc + "-digit CVC.");
    return false;
  }

  return true;
}

// ── SA mobile number: 10 digits, starts with 0, valid prefix ──
function isValidSAMobile(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 10 || digits[0] !== "0") return false;
  // Valid SA prefixes: 06X, 07X, 08X, 010–019
  const prefix = parseInt(digits.substring(0, 3), 10);
  return (prefix >= 60 && prefix <= 89) || (prefix >= 10 && prefix <= 19);
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
  if (!isValidSAMobile(number.value)) {
    alert("Please enter a valid South African mobile number (e.g. 071 234 5678).");
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
  const discountedPrice = Math.max(0, price - Math.round(price * appliedDiscount / 100));

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
