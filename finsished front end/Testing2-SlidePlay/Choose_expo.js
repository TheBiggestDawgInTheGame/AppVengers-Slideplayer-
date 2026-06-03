document.addEventListener("DOMContentLoaded", function () {
  var API_BASE = (
    window.SLIDEPLAY_API_BASE ||
    localStorage.getItem("sp_api_base") ||
    window.location.origin
  ).replace(/\/$/, "");

  // Refresh subscription from DB before checking plan
  (function refreshSubscriptionFromDB() {
    var uid = localStorage.getItem("sp_user_uid");
    if (!uid) return;
    fetch(API_BASE + "/api/users/" + uid + "/subscription")
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data && data.Plan) {
          localStorage.setItem("sp_student_subscription", JSON.stringify({
            plan: data.Plan.toLowerCase(),
            status: data.Status ? data.Status.toLowerCase() : "active",
          }));
          // Re-evaluate story card unlock after DB refresh
          var plan = data.Plan.toLowerCase();
          if (plan === "student_elite" || plan === "student_premium") unlockStoryCard();
        }
      })
      .catch(function() {});
  })();
  var studyBtn = document.getElementById("studyBtn");
  var storyBtn = document.getElementById("storyBtn");
  var overlay = document.getElementById("pmOverlay");
  var closeBtn = document.getElementById("pmClose");
  var codeInput = document.getElementById("pmCodeInput");
  var enterBtn = document.getElementById("pmEnterBtn");
  var errorEl = document.getElementById("pmError");

  // Study — open code gate
  if (studyBtn) {
    studyBtn.addEventListener("click", function () {
      if (codeInput) {
        codeInput.value = "";
        codeInput.style.borderColor = "";
      }
      if (errorEl) {
        errorEl.textContent = "";
      }
      if (overlay) {
        overlay.classList.add("open");
      }
      if (codeInput) {
        setTimeout(function () {
          codeInput.focus();
        }, 60);
      }
    });
  }

  // Close modal
  function closeModal() {
    if (overlay) overlay.classList.remove("open");
  }

  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (overlay) {
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
    });
  }

  // Validate teacher code
  function validateCode() {
    var raw = codeInput ? codeInput.value.trim().toUpperCase() : "";
    if (!raw) {
      if (errorEl) errorEl.textContent = "Please enter a class code.";
      return;
    }

    var classes = [];
    try {
      classes = JSON.parse(localStorage.getItem("sp_classes") || "[]");
    } catch (_) {}

    var match = null;
    for (var i = 0; i < classes.length; i++) {
      if (
        String(classes[i].code || "")
          .trim()
          .toUpperCase() === raw
      ) {
        match = classes[i];
        break;
      }
    }

    if (!match) {
      if (errorEl)
        errorEl.textContent = "Code not recognised. Check with your teacher.";
      if (codeInput) {
        codeInput.style.borderColor = "rgba(255,96,149,0.7)";
        setTimeout(function () {
          codeInput.style.borderColor = "";
        }, 1200);
      }
      return;
    }

    try {
      localStorage.setItem("sp_active_class", JSON.stringify(match));
    } catch (_) {}
    closeModal();
    // Study mode goes to the upload page with study context
    window.location.href = "StudentUploadPage.html?mode=study";
  }

  if (enterBtn) enterBtn.addEventListener("click", validateCode);
  if (codeInput) {
    codeInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") validateCode();
      if (errorEl) errorEl.textContent = "";
    });
  }

  // Story — check subscription then redirect
  function getStudentPlan() {
    try {
      var sub = JSON.parse(localStorage.getItem("sp_student_subscription") || "null");
      if (sub && sub.status !== "cancelled" && sub.plan && sub.plan !== "free") {
        return sub.plan;
      }
    } catch (_) {}
    return "free";
  }

  function unlockStoryCard() {
    var card = document.querySelector(".mode-card.story");
    if (!card) return;
    card.classList.remove("premium-locked");
    var tag = card.querySelector(".premium-tag");
    if (tag) tag.style.display = "none";
    if (storyBtn) storyBtn.textContent = "Start Story";
  }

  var plan = getStudentPlan();
  if (plan === "student_elite" || plan === "student_premium") {
    unlockStoryCard();
  }

  if (storyBtn) {
    storyBtn.addEventListener("click", function () {
      var currentPlan = getStudentPlan();
      if (currentPlan === "student_elite" || currentPlan === "student_premium") {
        window.location.href = "../../games/story_mode/index.html";
      } else {
        var go = confirm(
          "Story Mode is a Premium feature.\n\nUpgrade to Student Elite or Premium to unlock it.\n\nGo to upgrade page?"
        );
        if (go) window.location.href = "studentpayment.html";
      }
    });
  }
});
