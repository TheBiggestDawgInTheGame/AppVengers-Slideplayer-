// ── PayFast Return Handler & Animation ───────────────
document.addEventListener("DOMContentLoaded", function () {
  // Check for PayFast return
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has("payfast")) {
    const status = urlParams.get("payfast");
    if (status === "success") {
      showProcessingModal();
      setTimeout(() => {
        showSuccessModal(selectedPlan || "paid", generateReceiptId());
        triggerConfetti();
      }, 1800);
    } else if (status === "cancel") {
      alert("PayFast payment was cancelled.");
    }
  }
});

function showProcessingModal() {
  let modal = document.getElementById("processingModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "processingModal";
    modal.className = "modal-overlay";
    modal.innerHTML = `<div class="success-panel"><div class="success-icon"><i class="fa-solid fa-spinner fa-spin"></i></div><h2>Processing Payment…</h2><p>Please wait while we verify your payment.</p></div>`;
    document.body.appendChild(modal);
  }
  modal.classList.add("open");
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
// payment.js — SlidePlay Billing & Subscription Logic

// ── Role detection (set data-role="student" on <body> for student page) ──
const IS_STUDENT = document.body.getAttribute("data-role") === "student";

const SUBSCRIPTION_KEY = IS_STUDENT
  ? "sp_student_subscription"
  : "sp_teacher_subscription";
const PAYMENTS_KEY = IS_STUDENT ? "sp_student_payments" : "sp_payments";

function migrateLegacyTeacherSubscriptionKey() {
  if (IS_STUDENT) return;
  const nextRaw = localStorage.getItem("sp_teacher_subscription");
  if (nextRaw) return;
  const legacyRaw = localStorage.getItem("sp_subscription");
  if (!legacyRaw) return;
  try {
    JSON.parse(legacyRaw);
    localStorage.setItem("sp_teacher_subscription", legacyRaw);
  } catch (_e) {
    // Ignore malformed legacy payloads.
  }
}

// Teacher plans
const TEACHER_PLAN_LABELS = {
  free: "Free",
  pro: "Teacher Pro",
  school: "School Premium",
};
const TEACHER_PLAN_MONTHLY = { free: 0, pro: 150, school: 200 };
const TEACHER_PLAN_YEARLY = { free: 0, pro: 1440, school: 1920 };

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
  migrateLegacyTeacherSubscriptionKey();
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
    orderTotal.textContent = "R" + discountedPrice + (isYearly ? "/yr" : "/mo");

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
  updatePayButtonLabel(method);
}

function updatePayButtonLabel(method) {
  const payBtnText = document.getElementById("payBtnText");
  if (!payBtnText) return;
  if (method === "stripe") {
    payBtnText.innerHTML = '<i class="fa-brands fa-stripe-s"></i> Continue to Stripe';
    return;
  }
  if (method === "payfast") {
    payBtnText.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Continue to PayFast';
    return;
  }
  payBtnText.innerHTML = '<i class="fa-solid fa-lock"></i> Pay Now';
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

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    await handlePayment();
  });
}

async function handlePayment() {
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

  await new Promise((resolve) => setTimeout(resolve, 1200));

  try {
    const gatewayReceipt = await simulateGatewaySettlement(method);
    completePurchase(method, gatewayReceipt);
  } catch (error) {
    alert("Payment failed: " + (error?.message || "Could not complete payment."));
  } finally {
    setPayBtnLoading(false);
  }
}

async function simulateGatewaySettlement(method) {
  if (!selectedPlan) {
    throw new Error("Please select a plan first.");
  }

  const provider = method || "card";
  const price = isYearly ? PLAN_YEARLY[selectedPlan] : PLAN_MONTHLY[selectedPlan];
  const discountedPrice = Math.max(
    0,
    price - Math.round((price * appliedDiscount) / 100),
  );

  if (provider !== "stripe" && provider !== "payfast") {
    return null;
  }

  const fallbackEmail = "demo@slideplay.local";
  const email = String(localStorage.getItem("sp_user_email") || fallbackEmail).trim() || fallbackEmail;

  try {
    if (provider === "payfast") {
      await fetch("/api/payfast/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: discountedPrice,
          item_name: PLAN_LABELS[selectedPlan],
          user_email: email,
          plan: selectedPlan,
          return_url: window.location.origin + window.location.pathname + "?payfast=success",
          cancel_url: window.location.origin + window.location.pathname + "?payfast=cancel",
        }),
      });
    }
  } catch (_ignored) {
    // Best effort only. We still complete simulation through unified endpoint.
  }

  const res = await fetch("/api/payments/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      plan: selectedPlan,
      provider,
      billingCycle: isYearly ? "yearly" : "monthly",
      amount: discountedPrice,
    }),
  });

  if (!res.ok) {
    let message = "Gateway request failed.";
    try {
      const errData = await res.json();
      if (errData?.error) {
        message = String(errData.error);
      }
    } catch (_ignored) {
      // keep default message
    }
    throw new Error(message);
  }

  const data = await res.json();
  return data?.payment?.ReceiptID || data?.payment?.PaymentID || null;
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

function completePurchase(method, gatewayReceiptId) {
  const receiptId = gatewayReceiptId || generateReceiptId();
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
    amount: "R" + discountedPrice,
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
  if (planMsg)
    planMsg.textContent = "Your " + PLAN_LABELS[plan] + " plan is now active.";
  if (modal) modal.classList.add("open");

  const viewInvoicesBtn = document.getElementById("successViewInvoices");
  if (viewInvoicesBtn) {
    viewInvoicesBtn.addEventListener(
      "click",
      function () {
        modal.classList.remove("open");
        showInvoices();
      },
      { once: true },
    );
  }

  modal.addEventListener(
    "click",
    function (e) {
      if (e.target === modal) modal.classList.remove("open");
    },
    { once: true },
  );
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
  const sub = readJson("sp_teacher_subscription", null) || readJson("sp_subscription", null);
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
  const tiers = ["free", "student_elite", "student_premium"];
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
    if (go) window.location.href = "studentpayment.html";
    return false;
  }
  return true;
};

// XP multiplier helper for student pages
window.spGetXpMultiplier = function () {
  const sub = readJson("sp_student_subscription", null);
  if (!sub || sub.status === "cancelled") return 1;
  if (sub.plan === "student_premium") return 2;
  if (sub.plan === "student_elite") return 1.5;
  return 1;
};
