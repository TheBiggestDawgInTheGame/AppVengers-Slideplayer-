// StudentUploadPage.js — Step-based student learning flow
// Steps: 1) Choose Mode  2a) Study code  OR  2b) Chill upload  3) Play mode

var chillFile = null;       // File object from upload
var selectedPlay = "";      // "solo" | "2players" | "tournament"
var API_BASE = (
  window.SLIDEPLAY_API_BASE ||
  localStorage.getItem("sp_api_base") ||
  window.location.origin
).replace(/\/$/, "");

// ── Refresh subscription from DB on load ──────────────────────────────────────
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
        updateTriesUI();
      }
    })
    .catch(function() { /* server offline — use cached localStorage value */ });
})();

// ── Tries tracker ─────────────────────────────────────────────────────────────
// Free plan: 5 uploads per week. Elite/Premium: unlimited.
var MAX_TRIES_FREE = 5;

function getWeekKey() {
  var d = new Date();
  // ISO week string: YYYY-Www
  var jan1 = new Date(d.getFullYear(), 0, 1);
  var week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return d.getFullYear() + "-W" + week;
}

function getTriesData() {
  try {
    var raw = localStorage.getItem("sp_upload_tries");
    if (raw) {
      var data = JSON.parse(raw);
      if (data.week === getWeekKey()) return data;
    }
  } catch (_) {}
  return { week: getWeekKey(), count: 0 };
}

function saveTriesData(data) {
  try { localStorage.setItem("sp_upload_tries", JSON.stringify(data)); } catch (_) {}
}

function isUnlimitedPlan() {
  try {
    var sub = JSON.parse(localStorage.getItem("sp_student_subscription") || "null");
    if (sub && sub.status !== "cancelled" && (sub.plan === "student_elite" || sub.plan === "student_premium")) {
      return true;
    }
  } catch (_) {}
  return false;
}

function normalizeGameQuestions(rawQuestions) {
  if (!Array.isArray(rawQuestions)) return [];

  return rawQuestions
    .map(function (item, idx) {
      var question = String(item && (item.question || item.questionText || item.text) || "").trim();
      var options = Array.isArray(item && item.options)
        ? item.options.map(function (opt) { return String(opt || "").trim(); }).filter(Boolean)
        : Array.isArray(item && item.answers)
          ? item.answers.map(function (opt) { return String(opt || "").trim(); }).filter(Boolean)
          : [];

      if (!question || options.length < 2) return null;

      var correct = Number.isInteger(item && item.correct) ? item.correct : -1;
      if (correct < 0 || correct >= options.length) {
        var letter = String(item && item.correctAnswer || "").trim().toUpperCase();
        if (/^[A-D]$/.test(letter)) {
          correct = letter.charCodeAt(0) - 65;
        } else if (letter) {
          var matchIdx = options.findIndex(function (opt) {
            return opt.toLowerCase() === letter.toLowerCase();
          });
          correct = matchIdx >= 0 ? matchIdx : 0;
        } else {
          correct = 0;
        }
      }

      return {
        id: idx,
        question: question,
        questionText: question,
        text: question,
        options: options,
        answers: options,
        correct: correct,
        correctAnswer: options[correct] || options[0] || "",
        explanation: String(item && item.explanation || "").trim(),
        difficulty: String(item && item.difficulty || "medium").trim().toLowerCase() || "medium",
        type: "mcq",
        source: String(item && item.source || "ai").trim() || "ai"
      };
    })
    .filter(function (q) {
      return q && q.question.length > 5 && Array.isArray(q.options) && q.options.length >= 2;
    });
}

function getMaxTries() {
  return isUnlimitedPlan() ? 999 : MAX_TRIES_FREE;
}

function updateTriesUI() {
  var data = getTriesData();
  var max  = getMaxTries();
  var used = Math.min(data.count, max);

  var usedEl = document.getElementById("tries-used");
  var maxEl  = document.getElementById("tries-max");
  var fill   = document.getElementById("tries-fill");

  if (usedEl) usedEl.textContent = used;
  if (maxEl)  maxEl.textContent  = isUnlimitedPlan() ? "∞" : max;
  if (fill)   fill.style.width   = isUnlimitedPlan() ? "5%" : Math.round((used / max) * 100) + "%";
}

function triesExhausted() {
  if (isUnlimitedPlan()) return false;
  var data = getTriesData();
  return data.count >= MAX_TRIES_FREE;
}

// ── Step indicator ─────────────────────────────────────────────────────────────
function setStep(stepNum) {
  [1, 2, 3].forEach(function (n) {
    var el = document.getElementById("si-" + n);
    if (!el) return;
    el.classList.remove("active", "done");
    if (n < stepNum)  el.classList.add("done");
    if (n === stepNum) el.classList.add("active");
  });
  [1, 2].forEach(function (n) {
    var el = document.getElementById("sl-" + n);
    if (!el) return;
    el.classList.toggle("done", n < stepNum);
  });
  // When going to games (step 3), flash the Games dot as done before redirect
  if (stepNum === 3) {
    var si3 = document.getElementById("si-3");
    if (si3) si3.classList.add("active");
    var sl2 = document.getElementById("sl-2");
    if (sl2) sl2.classList.add("done");
  }
}

function showPanel(id) {
  var panels = document.querySelectorAll(".su-panel");
  panels.forEach(function (p) { p.classList.remove("active"); });
  var target = document.getElementById(id);
  if (target) target.classList.add("active");
}

// ── Student plan check ─────────────────────────────────────────────────────────
function getStudentPlan() {
  try {
    var sub = JSON.parse(localStorage.getItem("sp_student_subscription") || "null");
    if (sub && sub.status !== "cancelled" && sub.plan && sub.plan !== "free") return sub.plan;
  } catch (_) {}
  return "free";
}

// ── Mode selection (Step 1) ───────────────────────────────────────────────────
function initModeSelection() {
  var cards = document.querySelectorAll(".su-mode-card");
  cards.forEach(function (card) {
    function handleSelect() {
      var mode = card.getAttribute("data-mode");
      if (mode === "study")  goToStudy();
      if (mode === "chill")  goToChill();
      if (mode === "story")  goToStory();
    }
    card.addEventListener("click", handleSelect);
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelect(); }
    });
  });
}

function goToStudy() {
  setStep(2);
  showPanel("sp-study");
  var input = document.getElementById("study-code-input");
  if (input) setTimeout(function () { input.focus(); }, 60);
}

function goToChill() {
  if (triesExhausted()) {
    alert("You've used all " + MAX_TRIES_FREE + " free uploads this week.\n\nUpgrade to Student Elite or Premium for unlimited uploads.");
    window.location.href = "student-payment.html";
    return;
  }
  updateTriesUI();
  setStep(2);
  showPanel("sp-chill");
}

function goToStory() {
  var plan = getStudentPlan();
  if (plan === "student_elite" || plan === "student_premium") {
    window.location.href = "../../games/story_mode/index.html";
  } else {
    var go = confirm("Story Mode requires a Premium plan.\n\nUpgrade to Student Elite or Premium to unlock it.\n\nGo to upgrade page?");
    if (go) window.location.href = "student-payment.html";
  }
}

// ── Study — teacher code (Step 2a) ─────────────────────────────────────────────
function initStudyStep() {
  var backBtn  = document.getElementById("back-from-study");
  var joinBtn  = document.getElementById("study-join-btn");
  var codeInput = document.getElementById("study-code-input");
  var errorEl  = document.getElementById("study-error");

  if (backBtn) backBtn.addEventListener("click", function () {
    setStep(1);
    showPanel("sp-mode");
  });

  function joinClass() {
    var raw = codeInput ? codeInput.value.trim().toUpperCase() : "";
    if (!raw) {
      if (errorEl) errorEl.textContent = "Please enter a class code.";
      return;
    }
    if (codeInput) codeInput.classList.remove("error");
    if (errorEl)   errorEl.textContent = "";

    var uid = localStorage.getItem("sp_user_uid") || "";
    var displayName =
      localStorage.getItem("sp_user_name") ||
      localStorage.getItem("sp_user_display_name") ||
      localStorage.getItem("sp_user_email") ||
      "Student";

    fetch(API_BASE + "/api/classes/" + encodeURIComponent(raw))
      .then(function (resp) {
        if (!resp.ok) throw new Error("not_found");
        return resp.json();
      })
      .then(function (payload) {
        var match = payload && payload.class ? payload.class : null;
        if (!match) throw new Error("not_found");

        if (!uid) return match;
        return fetch(API_BASE + "/api/classes/" + encodeURIComponent(raw) + "/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: uid, displayName: displayName }),
        }).then(function () { return match; });
      })
      .then(function (match) {
        try {
          localStorage.setItem("sp_active_class", JSON.stringify({
            classId: match.ClassID || match.classId || null,
            code: match.ClassCode || raw,
            name: match.Name || "Class",
            subject: match.Subject || "",
            teacherUid: match.TeacherUID || "",
          }));
        } catch (_) {}
        window.location.href = "StudentUploadPage.html?mode=study&class=" + encodeURIComponent(raw);
      })
      .catch(function () {
        // Fallback: local demo class storage for offline/dev mode.
        var classes = [];
        try { classes = JSON.parse(localStorage.getItem("sp_classes") || "[]"); } catch (_) {}
        var localMatch = null;
        for (var i = 0; i < classes.length; i++) {
          if (String(classes[i].code || "").trim().toUpperCase() === raw) {
            localMatch = classes[i];
            break;
          }
        }
        if (!localMatch) {
          if (errorEl) errorEl.textContent = "Code not recognised. Check with your teacher.";
          if (codeInput) {
            codeInput.classList.add("error");
            setTimeout(function () { codeInput.classList.remove("error"); }, 1400);
          }
          return;
        }
        try { localStorage.setItem("sp_active_class", JSON.stringify(localMatch)); } catch (_) {}
        window.location.href = "StudentUploadPage.html?mode=study&class=" + encodeURIComponent(raw);
      });
  }

  if (joinBtn)  joinBtn.addEventListener("click", joinClass);
  if (codeInput) codeInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") joinClass();
    if (errorEl) errorEl.textContent = "";
  });
}

// ── Chill — upload (Step 2b) ───────────────────────────────────────────────────
function initChillStep() {
  var backBtn   = document.getElementById("back-from-chill");
  var zone      = document.getElementById("chill-upload-zone");
  var browse    = document.getElementById("chill-browse");
  var fileInput = document.getElementById("chill-file-input");
  var fileReady = document.getElementById("chill-file-ready");
  var fileNameEl= document.getElementById("chill-file-name");
  var removeBtn = document.getElementById("chill-file-remove");
  var nextBtn   = document.getElementById("chill-next-btn");

  if (backBtn) backBtn.addEventListener("click", function () {
    setStep(1);
    showPanel("sp-mode");
  });

  // Browse click
  if (browse && fileInput) {
    browse.addEventListener("click", function (e) {
      e.preventDefault();
      fileInput.click();
    });
  }

  // Zone click
  if (zone && fileInput) {
    zone.addEventListener("click", function (e) {
      if (e.target !== browse) fileInput.click();
    });
  }

  // Drag & drop
  if (zone) {
    zone.addEventListener("dragover", function (e) {
      e.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", function () {
      zone.classList.remove("drag-over");
    });
    zone.addEventListener("drop", function (e) {
      e.preventDefault();
      zone.classList.remove("drag-over");
      var files = e.dataTransfer.files;
      if (files && files[0]) handleFileSelected(files[0]);
    });
  }

  // File input change
  if (fileInput) {
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) handleFileSelected(fileInput.files[0]);
      fileInput.value = "";
    });
  }

  // Remove file
  if (removeBtn) {
    removeBtn.addEventListener("click", function () {
      chillFile = null;
      if (fileReady) fileReady.style.display = "none";
      if (zone)      zone.style.display = "";
      if (nextBtn)   nextBtn.disabled = true;
    });
  }

  // Next — process file with AI then go to game selector
  if (nextBtn) {
    nextBtn.addEventListener("click", function () {
      if (!chillFile) return;

      var overlay    = document.getElementById("ai-processing-overlay");
      var progressBar = document.getElementById("ai-progress-bar");
      var progressLbl = document.getElementById("ai-progress-label");

      // Show overlay
      if (overlay) { overlay.style.display = "flex"; }
      nextBtn.disabled = true;

      function setProgress(pct) {
        var p = Math.round(pct);
        if (progressBar) progressBar.style.width = p + "%";
        if (progressLbl) progressLbl.textContent = p + "%";
      }

      if (!window.AIProcessor) {
        // Fallback: skip AI, go directly
        doRedirect([]);
        return;
      }

      window.AIProcessor.processFile(
        chillFile,
        { difficulty: "medium", count: 15, questionType: "mcq" },
        setProgress
      ).then(function (result) {
        var qs = normalizeGameQuestions(result.questions || []);

        // Store for games.html / all game pages to read
        var fileEntry = {
          originalName: chillFile.name,
          size: chillFile.size,
          type: chillFile.type,
          extractedText: result.rawText || "",
          uploadedAt: Date.now()
        };
        try {
          localStorage.setItem("slidePlayUploadedFiles", JSON.stringify([fileEntry]));
          localStorage.setItem("slidePlayGeneratedQuizData", JSON.stringify(qs));
        } catch (_) {}

        doRedirect(qs);
      }).catch(function () {
        doRedirect([]);
      });

      function doRedirect(qs) {
        // Increment weekly tries counter
        var data = getTriesData();
        data.count += 1;
        saveTriesData(data);

        // Store session info
        try {
          sessionStorage.setItem("sp_chill_session", JSON.stringify({
            fileName: chillFile.name,
            fileSize: chillFile.size,
            fileType: chillFile.type,
            questionCount: qs.length,
            uploadedAt: Date.now()
          }));
        } catch (_) {}

        window.location.href = "../../slide_upload/games.html";
      }
    });
  }

  function handleFileSelected(file) {
    if (file.size > 50 * 1024 * 1024) {
      alert("File is too large. Maximum size is 50 MB.");
      return;
    }
    var allowed = [".pdf",".pptx",".docx",".txt",".md"];
    var ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (allowed.indexOf(ext) === -1) {
      alert("Unsupported file type. Please upload PDF, PPTX, DOCX, TXT or MD.");
      return;
    }
    chillFile = file;
    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileReady)  fileReady.style.display = "flex";
    if (zone)       zone.style.display = "none";
    if (nextBtn)    nextBtn.disabled = false;
  }
}

// ── Play mode selection (Step 3) ───────────────────────────────────────────────
function initPlayStep() {
  var backBtn  = document.getElementById("back-from-play");
  var startBtn = document.getElementById("play-start-btn");
  var cards    = document.querySelectorAll(".su-play-card");

  if (backBtn) backBtn.addEventListener("click", function () {
    selectedPlay = "";
    cards.forEach(function (c) { c.classList.remove("selected"); });
    if (startBtn) startBtn.disabled = true;
    setStep(2);
    showPanel("sp-chill");
  });

  cards.forEach(function (card) {
    function handleSelect() {
      selectedPlay = card.getAttribute("data-play") || "";
      cards.forEach(function (c) { c.classList.remove("selected"); });
      card.classList.add("selected");
      if (startBtn) startBtn.disabled = false;
    }
    card.addEventListener("click", handleSelect);
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelect(); }
    });
  });

  if (startBtn) {
    startBtn.addEventListener("click", startSession);
  }
}

function startSession() {
  if (!chillFile || !selectedPlay) return;

  // Increment tries counter
  var data = getTriesData();
  data.count += 1;
  saveTriesData(data);

  // Store file metadata in sessionStorage for the game page to pick up
  try {
    sessionStorage.setItem("sp_chill_session", JSON.stringify({
      fileName: chillFile.name,
      fileSize: chillFile.size,
      playMode: selectedPlay
    }));
  } catch (_) {}

  // Route by play mode
  if (selectedPlay === "solo") {
    // Solo: redirect to quiz with file → UploadPage handles AI generation
    window.location.href = "UploadPage.html?student=1&play=solo";
  } else if (selectedPlay === "2players") {
    // 2 Players: redirect to upload page in student multiplayer mode
    window.location.href = "UploadPage.html?student=1&play=2players";
  } else if (selectedPlay === "tournament") {
    // Tournament: redirect to tournament setup
    window.location.href = "UploadPage.html?student=1&play=tournament";
  }
}

// ── URL param: pre-select a mode from choose_exp.html links ───────────────────
function checkUrlMode() {
  var params = new URLSearchParams(window.location.search);
  var mode   = params.get("mode");
  if (mode === "study") goToStudy();
  if (mode === "chill") goToChill();
  if (mode === "story") goToStory();
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  initModeSelection();
  initStudyStep();
  initChillStep();
  initPlayStep();
  checkUrlMode();
});