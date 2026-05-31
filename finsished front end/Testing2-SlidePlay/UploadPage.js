// ── Session state ─────────────────────────────────────────────
const UP_GAMES = [
  { id: "quiz",     name: "Jeopardy Modes",      icon: "fa-cubes",            color: "#8b5cf6", kicker: "2D + 3D", note: "Choose classic board or immersive stage" },
  { id: "jeopardy", name: "Classic Slide Quiz",  icon: "fa-table-columns",    color: "#06b6d4", kicker: "2D Only", note: "Direct quiz with timer and instant feedback" },
  { id: "scramble", name: "Word Scramble",  icon: "fa-shuffle",          color: "#f59e0b" },
  { id: "memory",   name: "Memory Chain",   icon: "fa-brain",            color: "#10b981" },
  { id: "snake",    name: "Snake Quiz",     icon: "fa-worm",             color: "#84cc16" },
  { id: "typing",   name: "Speed Typing",   icon: "fa-keyboard",         color: "#3b82f6" },
  { id: "slide",    name: "Slide Puzzle",   icon: "fa-puzzle-piece",     color: "#ec4899" },
  { id: "story",    name: "Story Mode",     icon: "fa-book-open",        color: "#f97316" },
  { id: "pacman",   name: "Pac-Man Quiz",   icon: "fa-ghost",            color: "#eab308" },
  { id: "mbasa",    name: "Mbasa Game",     icon: "fa-star",             color: "#a855f7" }
];

const UP_GAME_URLS = {
  quiz:     "../../games/jeopardy/",
  jeopardy: "../../games/jeopardy-quiz/",
  scramble: "../../games/scramble_game/",
  memory:   "../../games/memory_chain_game/",
  snake:    "../../games/snake_game/",
  typing:   "../../games/speed_typing_game/",
  slide:    "../../games/slide_puzzle_game/",
  story:    "../../games/story_mode/",
  pacman:   "../../games/pacman_game/",
  mbasa:    "../../games/mbasa_game/"
};

const UP_COMING_SOON_GAMES = new Set(["snake", "pacman"]);

const UP_FAKE_NAMES = [
  "Sipho M.","Ayanda K.","Thabo N.","Zanele D.","Lebo P.",
  "Kagiso R.","Ntombi S.","Bongani T.","Naledi V.","Siyanda W.",
  "Mpho L.","Dineo C.","Tebogo F.","Keabetswe H.","Vusi J."
];

const up = {
  code: "",
  name: "",
  maxStudents: 30,
  game: null,
  mode: "individual",
  difficulty: "easy",
  timePerQ: 20,
  questionType: "mixed",
  questionCount: 10,
  shuffle: false,
  showTimer: true,
  uploadedFile: null,
  students: [],
  joinTimer: null,
  aiQuestions: null
};

const UP_API_BASE = (
  window.SLIDEPLAY_API_BASE ||
  localStorage.getItem("sp_api_base") ||
  window.location.origin
).replace(/\/$/, "");

// ── Utilities ─────────────────────────────────────────────────
function upGenCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function upCopyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
  });
}

function upCopyShareLink() {
  const input = document.getElementById("upShareUrl");
  const btn   = document.getElementById("upShareCopyBtn");
  if (input && btn) upCopyText(input.value, btn);
}

function upToggleNotify() {
  const body    = document.getElementById("upNotifyBody");
  const chevron = document.getElementById("upNotifyChevron");
  if (!body) return;
  const open = body.classList.toggle("hidden");
  if (chevron) chevron.style.transform = open ? "" : "rotate(180deg)";
}

async function upSendNotifications() {
  const textarea = document.getElementById("upNotifyContacts");
  const statusEl = document.getElementById("upNotifyStatus");
  const sendBtn  = document.getElementById("upNotifySendBtn");
  if (!textarea || !statusEl || !sendBtn) return;

  const raw = textarea.value;
  const contacts = raw
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean);

  if (!contacts.length) {
    statusEl.textContent = "Please add at least one email or phone number.";
    statusEl.className = "up-notify-status up-notify-err";
    return;
  }

  sendBtn.disabled = true;
  sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending…';
  statusEl.textContent = "";
  statusEl.className = "up-notify-status";

  const SERVER = (location.hostname === "127.0.0.1" || location.hostname === "localhost")
    ? "https://appvengers-slideplayer.onrender.com"
    : location.origin;

  try {
    const authToken = localStorage.getItem("sp_auth_token") || "";
    const res = await fetch(`${SERVER}/api/notify-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({
        code: up.code,
        sessionName: up.name || "a live session",
        hostName: localStorage.getItem("sp_user_email")?.split("@")[0] || "Your teacher",
        contacts
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Server error");
    statusEl.textContent = `✓ Sent to ${data.sent} contact${data.sent !== 1 ? "s" : ""}${data.failed ? ` (${data.failed} failed)` : ""}`;
    statusEl.className = "up-notify-status up-notify-ok";
  } catch (e) {
    statusEl.textContent = "Failed: " + e.message;
    statusEl.className = "up-notify-status up-notify-err";
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Code to All';
  }
}

function upHidden(id, hide) {
  const el = document.getElementById(id);
  if (el) hide ? el.classList.add("hidden") : el.classList.remove("hidden");
}

async function upArchiveSession(status = "finished") {
  const code = String(up.code || "").trim().toUpperCase();
  if (!code) return;

  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem("sp_auth_token") || "";
  if (token) headers.Authorization = `Bearer ${token}`;

  const payload = {
    sessionCode: code,
    gameType: up.game?.id || up.game?.name || "quiz",
    gameMode: up.mode || "individual",
    hostName: up.name || "Teacher",
    playerCount: Array.isArray(up.students) ? up.students.length : 0,
    winnerName: "",
    winnerScore: 0,
    totalScore: 0,
    status,
    createdAt: Date.now(),
    finishedAt: new Date().toISOString(),
  };

  try {
    await fetch(UP_API_BASE + "/api/sessions/archive", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (_) {
    // Best effort only.
  }
}

// ── Step navigation ───────────────────────────────────────────
function upGoStep(n) {
  for (let i = 1; i <= 5; i++) {
    const panel = document.getElementById("upStep" + i);
    const dot   = document.getElementById("upDot" + i);
    if (panel) panel.classList.toggle("hidden", i !== n);
    if (dot) {
      dot.classList.toggle("active", i === n);
      dot.classList.toggle("done",   i < n);
    }
    if (i < 5) {
      const line = document.getElementById("upLine" + i);
      if (line) line.classList.toggle("filled", i < n);
    }
  }
  if (n === 5) upActivateWaitroom();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── Game grid ─────────────────────────────────────────────────
function upBuildGameGrid() {
  const grid = document.getElementById("upGameGrid");
  if (!grid) return;
  grid.innerHTML = UP_GAMES.map(g => `
    <div class="up-game-card ${UP_COMING_SOON_GAMES.has(g.id) ? "up-game-card-soon" : ""}" data-gid="${g.id}" onclick="${UP_COMING_SOON_GAMES.has(g.id) ? `upShowComingSoon('${g.id}')` : `upPickGame('${g.id}')`}" style="--gc:${g.color}">
      ${g.kicker ? `<span class="ugc-kicker">${g.kicker}</span>` : ''}
      <div class="ugc-icon"><i class="fa-solid ${g.icon}"></i></div>
      <span class="ugc-name">${g.name}</span>
      ${g.note ? `<small class="ugc-note">${g.note}</small>` : ''}
      ${UP_COMING_SOON_GAMES.has(g.id) ? '<span class="ugc-soon">Coming Soon</span>' : ''}
    </div>
  `).join("");
}

function upPickGame(id) {
  if (UP_COMING_SOON_GAMES.has(id)) {
    upShowComingSoon(id);
    return;
  }
  up.game = UP_GAMES.find(g => g.id === id) || null;
  document.querySelectorAll(".up-game-card").forEach(c => c.classList.toggle("sel", c.dataset.gid === id));
  const nb = document.getElementById("upNext3");
  if (nb) nb.disabled = false;
}

function upShowComingSoon(id) {
  const card = document.querySelector(`.up-game-card[data-gid="${id}"]`);
  if (card) {
    card.classList.add("up-game-card-soon-pulse");
    setTimeout(() => card.classList.remove("up-game-card-soon-pulse"), 380);
  }
}

// ── Paid gate ─────────────────────────────────────────────────
function upShowPaidGate(el) {
  el.classList.add("umc-shake");
  setTimeout(() => el.classList.remove("umc-shake"), 400);
}

function upShowAddonGate(wrap) {
  wrap.classList.add("umc-shake");
  setTimeout(() => wrap.classList.remove("umc-shake"), 400);
}

// ── File upload ───────────────────────────────────────────────
function upResetFile() {
  up.uploadedFile = null;
  upHidden("upFilePicked", true);
  upHidden("upProcessing", true);
  upHidden("upSuccess", true);
  upHidden("upDropzone", false);
  const nb = document.getElementById("upNext1");
  if (nb) nb.disabled = true;
  const fi = document.getElementById("upFileInput");
  if (fi) fi.value = "";
}

function upHandleFile(file) {
  up.uploadedFile = file;
  upHidden("upDropzone", true);
  upHidden("upFilePicked", false);
  const nm = document.getElementById("upFileName");
  const sz = document.getElementById("upFileSize");
  if (nm) nm.textContent = file.name.length > 36 ? file.name.substring(0, 33) + "..." : file.name;
  if (sz) sz.textContent = file.size > 1048576
    ? (file.size / 1048576).toFixed(1) + " MB"
    : Math.round(file.size / 1024) + " KB";
  setTimeout(upStartProcessing, 700);
}

async function upStartProcessing() {
  upHidden("upFilePicked", true);
  upHidden("upProcessing", false);

  const fill = document.getElementById("upProgFill");
  const txt  = document.getElementById("upProcessText");

  function setProgress(stage, pct) {
    if (txt)  txt.textContent  = stage;
    if (fill) fill.style.width = pct + "%";
  }

  // Determine settings from Step 2 controls (may not be set yet, use defaults)
  const difficulty   = document.querySelector("#upDiffPills .diff-pill.active")?.dataset.diff || "medium";
  const questionType = document.getElementById("upQType")?.value || "mcq";
  const countHint    = parseInt(document.getElementById("upQCountInput")?.value) || 10;

  let result = null;

  if (window.AIProcessor && up.uploadedFile) {
    try {
      result = await AIProcessor.processFile(
        up.uploadedFile,
        { difficulty, count: countHint, questionType },
        setProgress
      );
    } catch (e) {
      console.warn("[UploadPage] AIProcessor error:", e.message);
    }
  }

  // If AI returned questions, store them; otherwise use empty (firebase-session will generate)
  if (result && result.questions && result.questions.length > 0) {
    up.aiQuestions = result.questions;
    up.questionCount = result.questions.length;
    if (result.topic) {
      // Pre-fill session name if empty
      const nameEl = document.getElementById("upSessName");
      if (nameEl && !nameEl.value.trim()) nameEl.value = result.topic;
    }
  } else {
    up.aiQuestions = null;
    // Fallback: keep a reasonable default count
    if (!up.questionCount || up.questionCount === 0) up.questionCount = countHint || 10;
  }

  setProgress("Done!", 100);

  upHidden("upProcessing", true);
  upHidden("upSuccess", false);

  const q = up.questionCount;
  const qEl    = document.getElementById("upQCount");
  const qInput = document.getElementById("upQCountInput");
  const qHint  = document.getElementById("upQAISuggested");
  if (qEl)    qEl.textContent  = q;
  if (qInput) qInput.value     = q;
  if (qHint) {
    if (result?.source === "ai") qHint.textContent = q + " (AI-generated from your slides)";
    else if (result?.source === "text_fallback") qHint.textContent = q + " (derived from slide text)";
    else qHint.textContent = q + " (estimated)";
  }

  const nb = document.getElementById("upNext1");
  if (nb) nb.disabled = false;
}

// ── Waiting room ──────────────────────────────────────────────
async function upActivateWaitroom() {
  up.name = document.getElementById("upSessName")?.value.trim() || "Untitled Session";
  up.maxStudents = parseInt(document.getElementById("upMaxStudents")?.value) || 30;
  up.questionCount = parseInt(document.getElementById("upQCountInput")?.value) || 10;
  up.difficulty = document.querySelector("#upDiffPills .diff-pill.active")?.dataset.diff || "easy";
  up.timePerQ = parseInt(document.querySelector("#upTimePills .diff-pill.active")?.dataset.time) || 20;
  up.questionType = document.getElementById("upQType")?.value || "mixed";

  document.getElementById("upLiveName").textContent = up.name;
  document.getElementById("upLiveGame").innerHTML =
    up.game ? `<i class="fa-solid ${up.game.icon}"></i> ${up.game.name}` : "No game";
  document.getElementById("upLiveMode").innerHTML =
    `<i class="fa-solid fa-user"></i> ${up.mode.charAt(0).toUpperCase() + up.mode.slice(1)}`;
  document.getElementById("upBigCode").textContent  = up.code;
  document.getElementById("upMaxCount").textContent = up.maxStudents;
  document.getElementById("upJoinedCount").textContent = "0";
  document.getElementById("upRosterList").innerHTML =
    '<div class="uwr-placeholder">Waiting for students to join\u2026</div>';

  up.students = [];

  // Clear any leftover sim players from a previous session
  localStorage.removeItem("sp_sim_players");

  // ── Populate share link ───────────────────────────────────
  const shareInput = document.getElementById("upShareUrl");
  if (shareInput) {
    // Prefer the deployed Render URL; fall back to current origin
    const base = (location.hostname === "127.0.0.1" || location.hostname === "localhost")
      ? "https://appvengers-slideplayer.onrender.com/app"
      : (location.origin + "/app");
    shareInput.value = base + "/Studentdashboard.html";
  }

  // ── Wire simulate button ──────────────────────────────────
  const simBtn = document.getElementById("upSimBtn");
  if (simBtn) {
    simBtn.onclick = () => _upFakeJoins(true);
  }

  // ── Write session to Firebase ─────────────────────────────
  if (window.SessionDB) {
    try {
      await SessionDB.createSession(up.code, {
        host: up.name,
        game: up.game?.id || "quiz",
        mode: up.mode,
        difficulty: up.difficulty,
        timePerQ: up.timePerQ,
        questionCount: up.questionCount,
        questionType: up.questionType,
        shuffle: document.getElementById("upShuffle")?.checked || false,
        showTimer: document.getElementById("upShowTimer")?.checked !== false,
        questions: up.aiQuestions || null   // ← real AI questions (null = firebase generates from pool)
      });

      // Listen for real players joining
      up._sessionListener = SessionDB.listenSession(up.code, (sess) => {
        if (!sess || !sess.players) return;
        const players = Object.values(sess.players);
        up.students = players;
        upRenderRoster();
      });
    } catch (e) {
      console.warn("Firebase unavailable, falling back to offline mode:", e.message);
      _upFakeJoins();
    }
  } else {
    _upFakeJoins();
  }

  // Also keep localStorage for backward compat
  localStorage.setItem("sp_active_session", JSON.stringify({
    code: up.code, name: up.name,
    game: up.game, mode: up.mode,
    maxStudents: up.maxStudents, createdAt: Date.now(), status: "waiting"
  }));
}

function _upFakeJoins(manual = false) {
  // Simulate students joining – used as Firebase fallback OR via the Simulate button
  const fakeNames = [
    "Sipho M.","Ayanda K.","Thabo N.","Zanele D.","Lebo P.",
    "Kagiso R.","Ntombi S.","Bongani T.","Naledi V.","Siyanda W.",
    "Mpho C.","Dineo F.","Lwazi G.","Nandi H.","Tshepo J."
  ];
  // Only pick names not already in the roster
  const existing = new Set(up.students.map(s => s.name));
  const available = fakeNames.filter(n => !existing.has(n));
  const shuffled = available.sort(() => Math.random() - 0.5);
  if (!shuffled.length) return; // all fakes already added
  let idx = 0;
  if (up.joinTimer) clearInterval(up.joinTimer);
  const simBtn = document.getElementById("upSimBtn");
  if (simBtn) simBtn.disabled = true;

  up.joinTimer = setInterval(async () => {
    if (idx >= shuffled.length || up.students.length >= up.maxStudents) {
      clearInterval(up.joinTimer);
      up.joinTimer = null;
      if (simBtn) simBtn.disabled = false;
      return;
    }
    const name = shuffled[idx++];
    let playerKey = "sim_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);

    // If Firebase is available, write real player entry so live-game.js can simulate answers
    if (window.SessionDB) {
      try {
        const result = await SessionDB.joinSession(up.code, name, { simulated: true });
        playerKey = result.playerKey;
      } catch (_) { /* offline fallback – use generated key */ }
    }

    up.students.push({ name, simulated: true, playerKey });
    upRenderRoster();

    // Persist sim player keys so live-game.js can auto-answer on their behalf
    const stored = JSON.parse(localStorage.getItem("sp_sim_players") || "[]");
    stored.push({ name, playerKey, code: up.code });
    localStorage.setItem("sp_sim_players", JSON.stringify(stored));
  }, 800);
}

function upRenderRoster() {
  const list = document.getElementById("upRosterList");
  const cnt  = document.getElementById("upJoinedCount");
  if (cnt) cnt.textContent = up.students.length;
  if (!list) return;
  list.innerHTML = up.students.map(s => `
    <div class="uwr-student${s.simulated ? " uwr-simulated" : ""}">
      <div class="uwr-avatar">${s.name.charAt(0)}</div>
      <span class="uwr-name">${s.name}</span>
      ${s.simulated
        ? `<span class="uwr-badge uwr-sim-badge"><i class="fa-solid fa-robot"></i> SIM</span>`
        : `<span class="uwr-badge"><i class="fa-solid fa-circle-check"></i> Ready</span>`}
    </div>
  `).join("");
}

// ── DOMContentLoaded wiring ───────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  up.code = upGenCode();

  upBuildGameGrid();

  // File input
  const fi = document.getElementById("upFileInput");
  if (fi) fi.addEventListener("change", function () {
    if (this.files[0]) upHandleFile(this.files[0]);
  });

  // Dropzone click
  document.getElementById("upDropzone")?.addEventListener("click", () => fi?.click());
  document.getElementById("upBrowseLink")?.addEventListener("click", e => { e.stopPropagation(); fi?.click(); });

  // Drag and drop
  const dz = document.getElementById("upDropzone");
  if (dz) {
    dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("dz-hover"); });
    dz.addEventListener("dragleave", () => dz.classList.remove("dz-hover"));
    dz.addEventListener("drop", e => {
      e.preventDefault();
      dz.classList.remove("dz-hover");
      const file = e.dataTransfer.files[0];
      if (file) upHandleFile(file);
    });
  }

  // Session code copy
  document.getElementById("upCopyCode")?.addEventListener("click", function () {
    upCopyText(up.code, this);
  });
  document.getElementById("upBigCopyCode")?.addEventListener("click", function () {
    upCopyText(up.code, this);
  });

  // Show code in Step 2
  const codeEl = document.getElementById("upCodeVal");
  if (codeEl) codeEl.textContent = up.code;

  // Difficulty pills
  document.querySelectorAll("#upDiffPills .diff-pill").forEach(btn => {
    btn.addEventListener("click", function () {
      document.querySelectorAll("#upDiffPills .diff-pill").forEach(b => b.classList.remove("active"));
      this.classList.add("active");
      up.difficulty = this.dataset.diff;
    });
  });

  // Time pills
  document.querySelectorAll("#upTimePills .diff-pill").forEach(btn => {
    btn.addEventListener("click", function () {
      document.querySelectorAll("#upTimePills .diff-pill").forEach(b => b.classList.remove("active"));
      this.classList.add("active");
      up.timePerQ = parseInt(this.dataset.time);
    });
  });

  // Question count input
  document.getElementById("upQCountInput")?.addEventListener("input", function () {
    up.questionCount = Math.max(1, Math.min(50, parseInt(this.value) || 1));
  });

  // Mode cards
  document.querySelectorAll(".up-mode-card:not(.umc-gated)").forEach(card => {
    card.addEventListener("click", function () {
      document.querySelectorAll(".up-mode-card:not(.umc-gated)").forEach(c => c.classList.remove("active"));
      this.classList.add("active");
      up.mode = this.dataset.mode;
    });
  });

  // Start session → Firebase + redirect to live-game.html (teacher view)
  document.getElementById("upStartBtn")?.addEventListener("click", async () => {
    if (!up.game) { alert("Please go back and select a game first."); upGoStep(3); return; }
    if (up.joinTimer) { clearInterval(up.joinTimer); up.joinTimer = null; }
    if (up._sessionListener) { up._sessionListener.stop(); }

    const startBtn = document.getElementById("upStartBtn");
    if (startBtn) { startBtn.disabled = true; startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Starting…'; }

    try {
      if (window.SessionDB) await SessionDB.startGame(up.code);
    } catch (e) {
      console.warn("Could not update Firebase session status:", e.message);
    }

    const teacherName = encodeURIComponent(up.name || "Teacher");
    window.location.href = `live-game.html?session=${encodeURIComponent(up.code)}&role=teacher&name=${teacherName}`;
  });

  // End session
  document.getElementById("upEndBtn")?.addEventListener("click", async () => {
    if (up.joinTimer) { clearInterval(up.joinTimer); up.joinTimer = null; }
    if (up._sessionListener) { up._sessionListener.stop(); }
    try {
      if (window.SessionDB) await SessionDB.endGame(up.code);
    } catch (e) { /* ignore */ }
    await upArchiveSession("ended");
    localStorage.removeItem("sp_active_session");
    window.location.href = "teacher.html";
  });
});
