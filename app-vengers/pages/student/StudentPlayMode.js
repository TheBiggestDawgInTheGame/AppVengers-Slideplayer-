document.addEventListener("DOMContentLoaded", function () {
  var studyBtn  = document.getElementById("studyBtn");
  var storyBtn  = document.getElementById("storyBtn");
  var overlay   = document.getElementById("pmOverlay");
  var closeBtn  = document.getElementById("pmClose");
  var codeInput = document.getElementById("pmCodeInput");
  var enterBtn  = document.getElementById("pmEnterBtn");
  var errorEl   = document.getElementById("pmError");

  // Study — open code gate
  if (studyBtn) {
    studyBtn.addEventListener("click", function () {
      if (codeInput) { codeInput.value = ""; codeInput.style.borderColor = ""; }
      if (errorEl)   { errorEl.textContent = ""; }
      if (overlay)   { overlay.classList.add("open"); }
      if (codeInput) { setTimeout(function () { codeInput.focus(); }, 60); }
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
    try { classes = JSON.parse(localStorage.getItem("sp_classes") || "[]"); } catch (_) {}

    var match = null;
    for (var i = 0; i < classes.length; i++) {
      if (String(classes[i].code || "").trim().toUpperCase() === raw) {
        match = classes[i];
        break;
      }
    }

    if (!match) {
      if (errorEl) errorEl.textContent = "Code not recognised. Check with your teacher.";
      if (codeInput) {
        codeInput.style.borderColor = "rgba(255,96,149,0.7)";
        setTimeout(function () { codeInput.style.borderColor = ""; }, 1200);
      }
      return;
    }

    try { localStorage.setItem("sp_active_class", JSON.stringify(match)); } catch (_) {}
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

  // Story — launch imported story mode
  if (storyBtn) {
    storyBtn.addEventListener("click", function () {
      window.location.href = "../../games/story_mode/index.html";
    });
  }
});
