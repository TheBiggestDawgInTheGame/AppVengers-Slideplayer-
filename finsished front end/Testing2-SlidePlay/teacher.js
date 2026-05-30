document.addEventListener("DOMContentLoaded", () => {
  // ── Counter animation for hero metrics ──────────────────────
  document.querySelectorAll(".hero-metrics strong[data-target]").forEach((el) => {
    const target = parseFloat(el.dataset.target);
    const suffix = el.dataset.suffix || "";
    const isFloat = el.dataset.target.includes(".");
    const duration = 1200;
    const step = 16;
    const steps = duration / step;
    let current = 0;
    const increment = target / steps;
    el.textContent = isFloat ? (0).toFixed(1) + suffix : "0" + suffix;
    const timer = setInterval(() => {
      current = Math.min(current + increment, target);
      el.textContent = isFloat ? current.toFixed(1) + suffix : Math.round(current) + suffix;
      if (current >= target) clearInterval(timer);
    }, step);
  });

  const barNodes = Array.from(document.querySelectorAll(".bar-chart .bar"));
  const liveFeedLabel = document.querySelector(".live-feed-label");
  const scoreRing = document.querySelector(".score-ring .progress");
  const scoreValue = document.querySelector(".score-ring strong");
  const ringNote = document.querySelector(".ring-note");

  if (!barNodes.length || !scoreRing || !scoreValue) {
    return;
  }

  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  let barValues = [48, 62, 85, 56, 78, 64];
  let score = parseFloat(scoreValue.textContent) || 8.2;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setBars(values) {
    values.forEach((value, index) => {
      if (barNodes[index]) {
        barNodes[index].style.height = value + "%";
      }
    });
  }

  function updateBars() {
    barValues = barValues.map((value) => {
      const drift = (Math.random() - 0.5) * 18;
      return Math.round(clamp(value + drift, 35, 95));
    });
    setBars(barValues);
  }

  function getBandCount(currentScore) {
    const base = Math.round(currentScore * 4);
    const variance = Math.floor(Math.random() * 5) - 2;
    return clamp(base + variance, 24, 40);
  }

  function setScore(nextScore) {
    score = clamp(nextScore, 6.8, 9.7);
    scoreValue.textContent = score.toFixed(1);

    const progress = score / 10;
    const offset = circumference * (1 - progress);
    scoreRing.style.strokeDasharray = circumference.toFixed(2);
    scoreRing.style.strokeDashoffset = offset.toFixed(2);

    scoreValue.classList.remove("high", "mid", "low");
    if (score >= 8.7) {
      scoreValue.classList.add("high");
    } else if (score >= 7.8) {
      scoreValue.classList.add("mid");
    } else {
      scoreValue.classList.add("low");
    }

    if (ringNote) {
      ringNote.textContent =
        "Top bracket (A): " + getBandCount(score) + " students";
    }
  }

  function updateScore() {
    const drift = (Math.random() - 0.5) * 0.7;
    setScore(score + drift);
  }

  function updateLiveClock() {
    if (!liveFeedLabel) {
      return;
    }
    const now = new Date();
    const time = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    liveFeedLabel.textContent = "Live Feed " + time;
  }

  barNodes.forEach((bar) => {
    bar.style.height = "0%";
  });

  requestAnimationFrame(() => {
    setBars(barValues);
    setScore(score);
    updateLiveClock();
  });

  setInterval(updateBars, 2200);
  setInterval(updateScore, 2800);
  setInterval(updateLiveClock, 1000);
});

/* ================================================================
   SESSION SYSTEM
   ================================================================ */

const SESS_GAMES = [
  { id: "quiz",     name: "Quiz Battle",    icon: "fa-circle-question", color: "#8b5cf6" },
  { id: "jeopardy", name: "Jeopardy",       icon: "fa-trophy",          color: "#f59e0b" },
  { id: "scramble", name: "Word Scramble",  icon: "fa-font",            color: "#06b6d4" },
  { id: "memory",   name: "Memory Chain",   icon: "fa-brain",           color: "#ec4899" },
  { id: "snake",    name: "Snake Rush",     icon: "fa-worm",            color: "#10b981" },
  { id: "typing",   name: "Speed Typing",   icon: "fa-keyboard",        color: "#3b82f6" },
  { id: "slide",    name: "Slide Puzzle",   icon: "fa-puzzle-piece",    color: "#f97316" },
  { id: "story",    name: "Story Mode",     icon: "fa-book-open",       color: "#a78bfa" },
  { id: "pacman",   name: "Pac-Man",        icon: "fa-ghost",           color: "#fbbf24" },
  { id: "mbasa",    name: "Mbasa",          icon: "fa-dice",            color: "#34d399" },
];

const SESS_FAKE_NAMES = [
  "Ava Bennett", "Jayden Kim", "Marcus Thorne", "Sana Yusuf", "Liam Carter",
  "Zoe Nakamura", "Ethan Ross", "Priya Mehta", "Noah Williams", "Sofia Herrera",
  "Daniel Park", "Amara Jones", "Lucas Brown", "Mia Chen", "Oliver Davis",
];

const SESS_GAME_URLS = {
  quiz:     "../../games/jeopardy-3d/",
  jeopardy: "../../games/jeopardy-quiz/",
  scramble: "../../games/scramble_game/",
  memory:   "../../games/memory_chain_game/",
  snake:    "../../games/snake_game/",
  typing:   "../../games/speed_typing_game/",
  slide:    "../../games/slide_puzzle_game/",
  story:    "../../games/story_mode/",
  pacman:   "../../games/pacman_game/",
  mbasa:    "../../games/mbasa_game/",
};

const sess = {
  code: "",
  name: "",
  maxStudents: 30,
  game: null,
  mode: "individual",
  difficulty: "easy",
  timePerQ: 20,
  delegated: false,
  questionCount: 0,
  students: [],
  joinTimer: null,
  uploadedFile: null,
};

// ── Helpers ────────────────────────────────────────────────────
function sessGenCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function sessCopyText(elId, btn) {
  const val = document.getElementById(elId)?.textContent?.trim();
  if (!val || val === "------") return;
  navigator.clipboard?.writeText(val).catch(() => {});
  const orig = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
  btn.style.color = "#22c55e";
  setTimeout(() => { btn.innerHTML = orig; btn.style.color = ""; }, 2000);
}

// ── Open modal ────────────────────────────────────────────────
function sessOpen() {
  sess.code = sessGenCode();
  sess.students = [];
  sess.game = null;
  sess.mode = "individual";
  sess.difficulty = "easy";
  sess.timePerQ = 20;
  sess.delegated = false;
  sess.questionCount = 0;
  sess.uploadedFile = null;
  if (sess.joinTimer) { clearInterval(sess.joinTimer); sess.joinTimer = null; }

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("sessCodeVal", sess.code);
  set("ssBigCode", sess.code);
  set("ssMaxCount", "30");
  set("ssJoinedCount", "0");

  const rl = document.getElementById("ssRosterList");
  if (rl) rl.innerHTML = '<div class="wr-placeholder">Waiting for students to join...</div>';

  // Reset game grid selection
  buildSessGameGrid();

  // Reset next button on game step
  const nb = document.getElementById("sessNextToMode");
  if (nb) nb.disabled = true;

  // Reset upload step
  sessResetUpload();

  // Reset question count input + hint
  const qInput = document.getElementById("sessQCountInput");
  if (qInput) qInput.value = 10;
  const qHint = document.getElementById("sessQAISuggested");
  if (qHint) qHint.textContent = "—";

  // Reset difficulty pills to Easy
  document.querySelectorAll("#sessDiffPills .diff-pill").forEach(b => b.classList.remove("active"));
  document.querySelector("#sessDiffPills .diff-pill[data-diff='easy']")?.classList.add("active");

  // Reset time pills to 20s
  document.querySelectorAll("#sessTimePills .diff-pill").forEach(b => b.classList.remove("active"));
  document.querySelector("#sessTimePills .diff-pill[data-time='20']")?.classList.add("active");

  // Reset mode cards
  document.querySelectorAll(".sess-mode-card").forEach(c => c.classList.remove("active"));
  document.querySelector(".sess-mode-card[data-mode='individual']")?.classList.add("active");

  sessGoStep(1);
  const modal = document.getElementById("sessModal");
  if (modal) { modal.classList.add("open"); document.body.style.overflow = "hidden"; }
}

// ── Close modal ───────────────────────────────────────────────
function sessClose() {
  const modal = document.getElementById("sessModal");
  if (modal) { modal.classList.remove("open"); document.body.style.overflow = ""; }
  if (sess.joinTimer) { clearInterval(sess.joinTimer); sess.joinTimer = null; }
}

// ── Step navigation ───────────────────────────────────────────
function sessGoStep(n) {
  for (let i = 1; i <= 5; i++) {
    const panel = document.getElementById("ssStep" + i);
    if (panel) panel.classList.toggle("hidden", i !== n);
    const dot = document.getElementById("sdot" + i);
    if (dot) { dot.classList.toggle("active", i === n); dot.classList.toggle("done", i < n); }
    if (i < 5) {
      const line = document.getElementById("sline" + i);
      if (line) line.classList.toggle("filled", i < n);
    }
  }
  if (n === 5) sessActivateWaitroom();
}

// ── Build game grid ───────────────────────────────────────────
function buildSessGameGrid() {
  const grid = document.getElementById("sessGameGrid");
  if (!grid) return;
  grid.innerHTML = SESS_GAMES.map(g => `
    <div class="sgc" data-id="${g.id}" onclick="sessPickGame('${g.id}')" style="--gc:${g.color}">
      <div class="sgc-icon"><i class="fa-solid ${g.icon}"></i></div>
      <span>${g.name}</span>
    </div>
  `).join("");
}

// ── Pick game ─────────────────────────────────────────────────
function sessPickGame(id) {
  sess.game = SESS_GAMES.find(g => g.id === id) || null;
  document.querySelectorAll(".sgc").forEach(el => el.classList.toggle("sel", el.dataset.id === id));
  const nb = document.getElementById("sessNextToMode");
  if (nb) nb.disabled = false;
}

// ── Upload step ───────────────────────────────────────────────
function sessResetUpload() {
  const show = id => document.getElementById(id)?.classList.remove("hidden");
  const hide = id => document.getElementById(id)?.classList.add("hidden");
  show("sessDropzone");
  hide("sessFilePicked");
  hide("sessProcessing");
  hide("sessUploadSuccess");
  const nb = document.getElementById("sessUploadNext");
  if (nb) nb.disabled = true;
  const fi = document.getElementById("sessFileInput");
  if (fi) fi.value = "";
  sess.uploadedFile = null;
  sess.questionCount = 0;
}

function sessRemoveUpload() { sessResetUpload(); }

function sessHandleFile(file) {
  if (!file) return;
  sess.uploadedFile = file;
  document.getElementById("sessDropzone")?.classList.add("hidden");
  document.getElementById("sessFilePicked")?.classList.remove("hidden");
  const nm = document.getElementById("sessFileName");
  if (nm) nm.textContent = file.name;
  const sz = document.getElementById("sessFileSize");
  if (sz) sz.textContent = (file.size / 1024 / 1024).toFixed(1) + " MB";
  // Begin processing after a brief pause
  setTimeout(sessStartProcessing, 700);
}

function sessStartProcessing() {
  document.getElementById("sessFilePicked")?.classList.add("hidden");
  document.getElementById("sessProcessing")?.classList.remove("hidden");
  const fill = document.getElementById("sessProgressFill");
  const txt  = document.getElementById("sessProcessText");
  const stages = [
    { t: 0,    text: "Analysing slides\u2026",       pct: 28 },
    { t: 1100, text: "Generating questions\u2026",    pct: 62 },
    { t: 2100, text: "Finalising your quiz\u2026",    pct: 92 },
    { t: 3000, text: "Done!",                         pct: 100 },
  ];
  stages.forEach(({ t, text, pct }) => {
    setTimeout(() => {
      if (txt)  txt.textContent  = text;
      if (fill) fill.style.width = pct + "%";
    }, t);
  });
  setTimeout(() => {
    document.getElementById("sessProcessing")?.classList.add("hidden");
    document.getElementById("sessUploadSuccess")?.classList.remove("hidden");
    const q = Math.floor(Math.random() * 8) + 8; // 8-15 questions
    const qel = document.getElementById("sessQCount");
    if (qel) qel.textContent = q;
    // Sync to Step 2 question count input and AI hint
    const qInput = document.getElementById("sessQCountInput");
    if (qInput) qInput.value = q;
    const qHint = document.getElementById("sessQAISuggested");
    if (qHint) qHint.textContent = q;
    sess.questionCount = q;
    const nb = document.getElementById("sessUploadNext");
    if (nb) nb.disabled = false;
  }, 3400);
}

// ── Paid gate shake ───────────────────────────────────────────
function sessShowPaidGate(el) {
  el.classList.add("smc-shake");
  setTimeout(() => el.classList.remove("smc-shake"), 400);
}

// ── Activate waiting room (Step 4) ────────────────────────────
function sessActivateWaitroom() {
  const name = document.getElementById("sessName")?.value.trim() || "Untitled Session";
  const max  = parseInt(document.getElementById("sessMax")?.value) || 30;
  sess.name = name;
  sess.maxStudents = max;

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("ssLiveName", name);
  set("ssMaxCount", max);
  set("ssBigCode", sess.code);

  const gameEl = document.getElementById("ssLiveGame");
  if (gameEl && sess.game)
    gameEl.innerHTML = `<i class="fa-solid ${sess.game.icon}"></i> ${sess.game.name}`;

  const modeEl = document.getElementById("ssLiveMode");
  if (modeEl) modeEl.textContent = { individual: "Individual", tournament: "Tournament", moderated: "Moderated" }[sess.mode] || "Individual";

  // Persist to localStorage so students can look it up
  localStorage.setItem("sp_active_session", JSON.stringify({
    code: sess.code,
    name,
    game: sess.game ? { id: sess.game.id, name: sess.game.name, icon: sess.game.icon } : null,
    mode: sess.mode,
    maxStudents: max,
    createdAt: Date.now(),
    status: "waiting",
  }));

  // Simulate students gradually joining (demo purposes)
  const pool = [...SESS_FAKE_NAMES].sort(() => Math.random() - 0.5);
  let idx = 0;
  sess.students = [];
  sess.joinTimer = setInterval(() => {
    if (sess.students.length >= Math.min(max, pool.length)) {
      clearInterval(sess.joinTimer);
      return;
    }
    sess.students.push({ name: pool[idx++], id: idx });
    renderRoster();
  }, 2000);
}

// ── Render roster ─────────────────────────────────────────────
function renderRoster() {
  const list = document.getElementById("ssRosterList");
  const cnt  = document.getElementById("ssJoinedCount");
  if (!list || !cnt) return;
  cnt.textContent = sess.students.length;
  if (!sess.students.length) {
    list.innerHTML = '<div class="wr-placeholder">Waiting for students to join...</div>';
    return;
  }
  list.innerHTML = sess.students.map((s, i) => `
    <div class="wr-student" style="animation-delay:${i * 35}ms">
      <div class="wr-avatar">${s.name.charAt(0)}</div>
      <span class="wr-name">${s.name}</span>
      <span class="wr-badge"><i class="fa-solid fa-circle-check"></i> Ready</span>
    </div>
  `).join("");
}

// ── Event wiring ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("openSessBtn")?.addEventListener("click", sessOpen);
  document.getElementById("sessClose")?.addEventListener("click", sessClose);

  document.getElementById("sessModal")?.addEventListener("click", function (e) {
    if (e.target === this) sessClose();
  });

  // File input
  document.getElementById("sessFileInput")?.addEventListener("change", function () {
    if (this.files[0]) sessHandleFile(this.files[0]);
  });

  // Dropzone click → trigger file input
  document.getElementById("sessDropzone")?.addEventListener("click", () => {
    document.getElementById("sessFileInput")?.click();
  });

  // Drag & drop
  const dz = document.getElementById("sessDropzone");
  if (dz) {
    dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("dz-hover"); });
    dz.addEventListener("dragleave", () => dz.classList.remove("dz-hover"));
    dz.addEventListener("drop", e => {
      e.preventDefault();
      dz.classList.remove("dz-hover");
      const file = e.dataTransfer.files[0];
      if (file) sessHandleFile(file);
    });
  }

  document.getElementById("sessCodeCopy")?.addEventListener("click", function () {
    sessCopyText("sessCodeVal", this);
  });

  document.getElementById("ssBigCodeCopy")?.addEventListener("click", function () {
    sessCopyText("ssBigCode", this);
  });

  // Mode card selection (free cards only)
  document.querySelectorAll(".sess-mode-card:not(.smc-gated)").forEach(card => {
    card.addEventListener("click", function () {
      document.querySelectorAll(".sess-mode-card:not(.smc-gated)").forEach(c => c.classList.remove("active"));
      this.classList.add("active");
      sess.mode = this.dataset.mode;
    });
  });

  // Start session — launch game with session params
  document.getElementById("ssStartBtn")?.addEventListener("click", () => {
    if (!sess.game) {
      alert("Please go back and select a game first.");
      sessGoStep(2);
      return;
    }
    if (sess.joinTimer) { clearInterval(sess.joinTimer); sess.joinTimer = null; }
    const base = SESS_GAME_URLS[sess.game.id] || "#";
    window.location.href =
      base + "?session=" + encodeURIComponent(sess.code) +
      "&mode=" + sess.mode + "&teacher=1";
  });

  // End session
  document.getElementById("ssEndBtn")?.addEventListener("click", () => {
    if (sess.joinTimer) { clearInterval(sess.joinTimer); sess.joinTimer = null; }
    localStorage.removeItem("sp_active_session");
    sessClose();
  });

  // ── Difficulty pills ──────────────────────────────────────────
  document.querySelectorAll("#sessDiffPills .diff-pill").forEach(btn => {
    btn.addEventListener("click", function () {
      document.querySelectorAll("#sessDiffPills .diff-pill").forEach(b => b.classList.remove("active"));
      this.classList.add("active");
      sess.difficulty = this.dataset.diff;
    });
  });

  // ── Time-per-question pills ───────────────────────────────────
  document.querySelectorAll("#sessTimePills .diff-pill").forEach(btn => {
    btn.addEventListener("click", function () {
      document.querySelectorAll("#sessTimePills .diff-pill").forEach(b => b.classList.remove("active"));
      this.classList.add("active");
      sess.timePerQ = parseInt(this.dataset.time);
    });
  });

  // ── Question count input live sync ────────────────────────────
  document.getElementById("sessQCountInput")?.addEventListener("input", function () {
    const v = Math.max(1, Math.min(50, parseInt(this.value) || 1));
    sess.questionCount = v;
  });

  // ── Delegated moderation add-on gate (shows upgrade shake) ───
  // sessShowAddonGate is called from onclick in HTML
});

// ── Addon gate for delegated moderation toggle ────────────────
function sessShowAddonGate(wrap) {
  wrap.classList.add("smc-shake");
  setTimeout(() => wrap.classList.remove("smc-shake"), 400);
}
