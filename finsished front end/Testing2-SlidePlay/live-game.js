/**
 * live-game.js
 * Handles both teacher (control) and student (play) views.
 * URL params: ?session=CODE&role=teacher|student&name=NAME&playerKey=KEY
 */

// ── Parse URL params ──────────────────────────────────────────
const LG = (() => {
  const p = new URLSearchParams(window.location.search);
  return {
    code:      p.get("session") || "",
    role:      p.get("role") || "student",       // "teacher" | "student"
    name:      p.get("name") || "Student",
    playerKey: p.get("playerKey") || "",
  };
})();

const LABELS = ["A", "B", "C", "D"];

function normalizeAnswerText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shortAnswerMatches(studentAnswer, acceptedAnswers) {
  const student = normalizeAnswerText(studentAnswer);
  if (!student) return false;
  const accepted = (Array.isArray(acceptedAnswers) ? acceptedAnswers : [])
    .map((a) => normalizeAnswerText(a))
    .filter(Boolean);
  if (!accepted.length) return false;

  if (accepted.includes(student)) return true;
  if (accepted.some((a) => student.includes(a) || a.includes(student))) return true;

  const studentTokens = new Set(student.split(" ").filter(Boolean));
  return accepted.some((a) => {
    const tokens = a.split(" ").filter(Boolean);
    if (!tokens.length) return false;
    const overlap = tokens.filter((t) => studentTokens.has(t)).length;
    return overlap / tokens.length >= 0.75;
  });
}

// Local state
let session = null;
let sessionListener = null;
let timerInterval = null;
let answered = false;
let myScore = 0;
let lastQuestion = -1;
let gameStartedAt = Date.now();
let reportSubmitted = false;
let sessionArchived = false;
const questionAttempts = [];

const API_BASE = (
  window.SLIDEPLAY_API_BASE ||
  localStorage.getItem("sp_api_base") ||
  window.location.origin
).replace(/\/$/, "");

// ── Simulated players ─────────────────────────────────────────
// Loaded from localStorage (set by UploadPage when Simulate button is used)
const SIM_PLAYERS = (() => {
  try {
    const raw = localStorage.getItem("sp_sim_players");
    if (!raw) return [];
    const all = JSON.parse(raw);
    // Only include players that belong to this session
    const code = new URLSearchParams(location.search).get("session") || "";
    return all.filter(p => p.code === code);
  } catch (_) { return []; }
})();

let simAnswersPending = false; // prevent double-firing per question

function getSimPlayerKeys(playersMap) {
  const keys = new Set(SIM_PLAYERS.map(p => p.playerKey));
  Object.entries(playersMap || {}).forEach(([key, p]) => {
    if (p?.simulated) keys.add(key);
  });
  return Array.from(keys);
}

function scheduleSimAnswers(qIndex, questions, timePerQ, playersMap) {
  const simPlayerKeys = getSimPlayerKeys(playersMap);
  const q = questions[qIndex];
  if (!q) return;

  const allPlayers = Object.entries(playersMap || {});
  const alreadyAnswered = new Set(
    allPlayers
      .filter(([, p]) => p?.answers && p.answers[qIndex] !== undefined)
      .map(([key]) => key)
  );
  const targets = simPlayerKeys.filter(key => !alreadyAnswered.has(key));

  if (!targets.length || simAnswersPending) return;
  simAnswersPending = true;

  // Optimistic UI: simulated players answer during loading, before teacher advances.
  setText("lgAnsweredCount", alreadyAnswered.size + targets.length);
  setText("lgPlayerCount", allPlayers.length);

  targets.forEach((playerKey) => {
    // Tiny jitter so answers appear near-instant while still not all at same millisecond.
    const delay = 25 + Math.random() * 175;

    setTimeout(async () => {
      let submittedAnswer;
      let correct = false;
      if (q.type === "short_answer") {
        const accepted = Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [];
        const shouldBeCorrect = Math.random() < 0.65;
        submittedAnswer = shouldBeCorrect
          ? (accepted[Math.floor(Math.random() * Math.max(accepted.length, 1))] || "")
          : "I am not sure";
        correct = shouldBeCorrect && shortAnswerMatches(submittedAnswer, accepted);
      } else {
        const optionCount = Array.isArray(q.options) && q.options.length > 0 ? q.options.length : 4;
        submittedAnswer = Math.floor(Math.random() * optionCount);
        correct = submittedAnswer === q.correct;
      }
      const elapsed = Math.min(timePerQ, delay / 1000);
      const pts = correct ? Math.max(100, Math.round(1000 * (1 - elapsed / timePerQ))) : 0;
      try {
        await SessionDB.submitAnswer(LG.code, playerKey, qIndex, submittedAnswer, correct, pts);
      } catch (_) { /* ignore */ }
    }, delay);
  });
}

// ── Boot ──────────────────────────────────────────────────────
window.addEventListener("load", async () => {
  if (!LG.code) {
    alert("No session code found. Returning to dashboard.");
    window.location.href = "teacher.html";
    return;
  }

  // Show score pill for students
  if (LG.role === "student") {
    document.getElementById("lgScorePill").style.display = "flex";
  }

  // Show waiting room for students until game starts
  show(LG.role === "student" ? "lgWaiting" : "lgTeacher");
  document.getElementById("lgWaitCode").textContent = LG.code;

  const shortSubmitBtn = document.getElementById("lgSShortSubmit");
  if (shortSubmitBtn && !shortSubmitBtn._wired) {
    shortSubmitBtn._wired = true;
    shortSubmitBtn.addEventListener("click", studentShortAnswerSubmit);
  }
  const shortInput = document.getElementById("lgSShortInput");
  if (shortInput && !shortInput._wired) {
    shortInput._wired = true;
    shortInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        studentShortAnswerSubmit();
      }
    });
  }

  // Subscribe to session
  gameStartedAt = Date.now();
  sessionListener = SessionDB.listenSession(LG.code, onSessionUpdate);
});

function isPremiumStudentLocal() {
  try {
    const sub = JSON.parse(localStorage.getItem("sp_student_subscription") || "null");
    if (!sub) return false;
    const plan = String(sub.plan || "").toLowerCase();
    const status = String(sub.status || "").toLowerCase();
    return (plan === "student_elite" || plan === "student_premium") && status !== "cancelled" && status !== "locked";
  } catch (_) {
    return false;
  }
}

async function submitPremiumGameReport() {
  if (reportSubmitted) return;
  if (LG.role !== "student") return;
  if (!isPremiumStudentLocal()) return;

  const uid = localStorage.getItem("sp_user_uid");
  if (!uid) return;

  const totalQuestions = Array.isArray(session?.questions) ? session.questions.length : 0;
  const correctCount = questionAttempts.filter((a) => a.correct).length;
  const durationSec = Math.max(0, Math.round((Date.now() - gameStartedAt) / 1000));

  const payload = {
    gameType: session?.game || "quiz",
    sessionCode: LG.code,
    score: myScore,
    totalQuestions,
    correctCount,
    durationSec,
    questionAttempts,
    meta: {
      role: LG.role,
      mode: session?.mode || "individual",
      studentName: LG.name,
      source: "live-game",
    }
  };

  try {
    const resp = await fetch(
      API_BASE + "/api/students/" + encodeURIComponent(uid) + "/game-reports",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (!resp.ok) return;
    const data = await resp.json();
    const reportText = data?.report?.reportText || "";

    const current = (() => {
      try { return JSON.parse(localStorage.getItem("sp_game_reports") || "[]"); }
      catch (_) { return []; }
    })();
    current.unshift({
      date: new Date().toISOString(),
      gameType: payload.gameType,
      score: payload.score,
      totalQuestions: payload.totalQuestions,
      correctCount: payload.correctCount,
      reportText,
      sessionCode: payload.sessionCode,
    });
    localStorage.setItem("sp_game_reports", JSON.stringify(current.slice(0, 50)));

    const statusEl = document.getElementById("lgGoMessage");
    if (statusEl && reportText) {
      statusEl.textContent = "Great work! Your premium AI performance report was generated.";
    }

    reportSubmitted = true;
  } catch (_) {
    // Non-fatal: report generation should not block game completion.
  }
}

async function archiveCompletedSession() {
  if (sessionArchived) return;
  if (!session || LG.role !== "teacher") return;

  const playersArr = session?.players && typeof session.players === "object"
    ? Object.values(session.players)
    : [];
  const sorted = playersArr.slice().sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0));
  const winner = sorted[0] || null;

  const payload = {
    sessionCode: LG.code,
    gameType: session.game || "quiz",
    gameMode: session.mode || "solo",
    hostName: session.host || LG.name || "Teacher",
    playerCount: playersArr.length,
    winnerName: winner ? String(winner.name || "") : "",
    winnerScore: winner ? Number(winner.score || 0) : 0,
    totalScore: winner ? Number(winner.score || 0) : 0,
    status: "finished",
    createdAt: session.createdAt || Date.now(),
    finishedAt: new Date().toISOString(),
  };

  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem("sp_auth_token") || "";
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const resp = await fetch(API_BASE + "/api/sessions/archive", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (resp.ok) {
      sessionArchived = true;
    }
  } catch (_) {
    // Best effort only; game completion must not fail.
  }
}

// ── Main session update handler ───────────────────────────────
function onSessionUpdate(data) {
  if (!data) return;
  session = data;

  // Update top bar
  setText("lgSessionName", data.name || "Session");
  setText("lgGameName",    data.game || "Quiz");
  setText("lgModeName",    data.mode || "Individual");

  // Handle status changes
  if (data.status === "finished") {
    showGameOver();
    return;
  }

  if (data.status === "active" && data.currentQuestion >= 0) {
    if (LG.role === "student") {
      show("lgStudent");
    } else {
      show("lgTeacher");
      wireTeacherButtons();
    }
    renderQuestion(data);
  }
}

// ── Render current question ───────────────────────────────────
function renderQuestion(data) {
  const qIndex = data.currentQuestion;
  if (qIndex === lastQuestion) return; // No change
  lastQuestion = qIndex;
  answered = false;
  simAnswersPending = false; // reset for new question

  const questions = data.questions;
  if (!questions || qIndex >= Object.keys(questions).length) return;

  const q = questions[qIndex];
  const total = Object.keys(questions).length;
  const timePerQ = data.settings?.timePerQ || 20;

  if (LG.role === "teacher") {
    renderTeacherQuestion(q, qIndex, total, timePerQ, data);
    scheduleSimAnswers(qIndex, questions, timePerQ, data.players);
  } else {
    renderStudentQuestion(q, qIndex, total, timePerQ);
  }

  // Start timer
  startTimer(data.questionStartedAt, timePerQ);
}

// ── Teacher question view ─────────────────────────────────────
function renderTeacherQuestion(q, qIndex, total, timePerQ, data) {
  setText("lgTQNum",    qIndex + 1);
  setText("lgTQTotal",  total);
  setText("lgTQuestion", q.text);

  const opts = document.getElementById("lgTOptions");
  if (q.type === "short_answer") {
    const acceptedAnswers = (Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [])
      .map((a) => esc(a))
      .join(" / ");
    opts.innerHTML = `
      <div class="lg-opt-teacher correct">
        <span class="lg-opt-label">Ans</span>
        ${acceptedAnswers || esc(q.sampleAnswer || "Open-ended response")}
      </div>
    `;
  } else {
    opts.innerHTML = q.options.map((opt, i) => `
      <div class="lg-opt-teacher ${i === q.correct ? "correct" : ""}">
        <span class="lg-opt-label">${LABELS[i]}</span>
        ${opt}
      </div>
    `).join("");
  }

  // Next button state
  const nb = document.getElementById("lgNextBtn");
  if (nb) nb.disabled = (qIndex + 1 >= total);

  updateLeaderboard(data.players);
  updateAnswerCount(data, qIndex);
}

function updateAnswerCount(data, qIndex) {
  const players = Object.values(data.players || {});
  const answered = players.filter(p => p.answers && p.answers[qIndex] !== undefined).length;
  setText("lgAnsweredCount", answered);
  setText("lgPlayerCount",   players.length);
}

// ── Student question view ─────────────────────────────────────
function renderStudentQuestion(q, qIndex, total, timePerQ) {
  setText("lgSQNum",    qIndex + 1);
  setText("lgSQTotal",  total);
  setText("lgSQuestion", q.text);

  // Hide feedback from previous question
  document.getElementById("lgFeedback")?.classList.add("hidden");
  document.getElementById("lgFeedback")?.classList.remove("correct", "wrong");

  const opts = document.getElementById("lgSOptions");
  const shortWrap = document.getElementById("lgSShortWrap");
  const shortInput = document.getElementById("lgSShortInput");
  const shortSubmit = document.getElementById("lgSShortSubmit");

  if (q.type === "short_answer") {
    opts.innerHTML = "";
    shortWrap?.classList.remove("hidden");
    if (shortInput) {
      shortInput.value = "";
      shortInput.disabled = false;
      shortInput.focus();
    }
    if (shortSubmit) shortSubmit.disabled = false;
  } else {
    shortWrap?.classList.add("hidden");
    if (shortInput) shortInput.value = "";
    opts.innerHTML = q.options.map((opt, i) => `
      <button class="lg-opt-btn" data-index="${i}" onclick="studentAnswer(${i})">
        <span class="lg-opt-lbl">${LABELS[i]}</span>
        ${opt}
      </button>
    `).join("");
  }

  setText("lgScore", myScore);
}

// ── Student submits answer ────────────────────────────────────
async function studentAnswer(chosenIndex) {
  if (answered || !session) return;
  answered = true;

  const q = session.questions[session.currentQuestion];
  const correct = chosenIndex === q.correct;

  // Elapsed time bonus: faster = more points (max 1000, min 100)
  const elapsed = (Date.now() - session.questionStartedAt) / 1000;
  const timePerQ = session.settings?.timePerQ || 20;
  const pts = correct ? Math.max(100, Math.round(1000 * (1 - elapsed / timePerQ))) : 0;

  if (correct) myScore += pts;

  questionAttempts.push({
    questionIndex: session.currentQuestion,
    question: q.text,
    options: q.options,
    chosenIndex,
    correctIndex: q.correct,
    correct,
    points: pts,
    timeSec: Math.max(0, Math.round(elapsed * 100) / 100),
  });

  // Highlight options
  const btns = document.querySelectorAll(".lg-opt-btn");
  btns.forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.correct) btn.classList.add("correct");
    else if (i === chosenIndex && !correct) btn.classList.add("wrong");
  });

  // Show feedback
  const fb = document.getElementById("lgFeedback");
  const fbIcon = document.getElementById("lgFbIcon");
  const fbText = document.getElementById("lgFbText");
  const fbScore = document.getElementById("lgFbScore");
  if (fb) {
    fb.classList.remove("hidden");
    fb.classList.add(correct ? "correct" : "wrong");
    fbIcon.innerHTML = correct ? '<i class="fa-solid fa-circle-check" style="color:#34d399"></i>'
                                : '<i class="fa-solid fa-circle-xmark" style="color:#f87171"></i>';
    fbText.textContent = correct ? "Correct! Well done!" : `Wrong — the answer was ${LABELS[q.correct]}: ${q.options[q.correct]}`;
    fbScore.textContent = correct ? `+${pts} pts` : "";
  }

  // Update score display
  setText("lgScore", myScore);

  // Write to Firebase
  if (LG.playerKey) {
    try {
      await SessionDB.submitAnswer(LG.code, LG.playerKey, session.currentQuestion, chosenIndex, correct, pts);
    } catch (e) {
      console.warn("Could not save answer to Firebase:", e.message);
    }
  }
}

async function studentShortAnswerSubmit() {
  if (answered || !session) return;
  const q = session.questions[session.currentQuestion];
  if (!q || q.type !== "short_answer") return;

  const input = document.getElementById("lgSShortInput");
  const submitBtn = document.getElementById("lgSShortSubmit");
  const rawAnswer = String(input?.value || "").trim();
  if (!rawAnswer) return;

  answered = true;
  if (input) input.disabled = true;
  if (submitBtn) submitBtn.disabled = true;

  const correct = shortAnswerMatches(rawAnswer, q.acceptedAnswers);
  const elapsed = (Date.now() - session.questionStartedAt) / 1000;
  const timePerQ = session.settings?.timePerQ || 20;
  const pts = correct ? Math.max(100, Math.round(1000 * (1 - elapsed / timePerQ))) : 0;
  if (correct) myScore += pts;

  questionAttempts.push({
    questionIndex: session.currentQuestion,
    question: q.text,
    type: "short_answer",
    studentAnswer: rawAnswer,
    acceptedAnswers: q.acceptedAnswers || [],
    correct,
    points: pts,
    timeSec: Math.max(0, Math.round(elapsed * 100) / 100),
  });

  const fb = document.getElementById("lgFeedback");
  const fbIcon = document.getElementById("lgFbIcon");
  const fbText = document.getElementById("lgFbText");
  const fbScore = document.getElementById("lgFbScore");
  if (fb) {
    fb.classList.remove("hidden");
    fb.classList.add(correct ? "correct" : "wrong");
    fbIcon.innerHTML = correct
      ? '<i class="fa-solid fa-circle-check" style="color:#34d399"></i>'
      : '<i class="fa-solid fa-circle-xmark" style="color:#f87171"></i>';
    const modelAnswer = Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.length
      ? q.acceptedAnswers[0]
      : (q.sampleAnswer || "No sample answer");
    fbText.textContent = correct
      ? "Correct! Well done!"
      : `Not quite. Example answer: ${modelAnswer}`;
    fbScore.textContent = correct ? `+${pts} pts` : "";
  }

  setText("lgScore", myScore);

  if (LG.playerKey) {
    try {
      await SessionDB.submitAnswer(LG.code, LG.playerKey, session.currentQuestion, rawAnswer, correct, pts);
    } catch (e) {
      console.warn("Could not save answer to Firebase:", e.message);
    }
  }
}

// ── Timer ─────────────────────────────────────────────────────
function startTimer(startedAt, timePerQ) {
  clearInterval(timerInterval);
  const circumference = 213.6; // 2π×34

  function tick() {
    const elapsed = (Date.now() - startedAt) / 1000;
    const remaining = Math.max(0, timePerQ - elapsed);
    const pct = remaining / timePerQ;

    if (LG.role === "teacher") {
      const bar = document.getElementById("lgTimerBar");
      if (bar) bar.style.width = (pct * 100) + "%";
    } else {
      const num = document.getElementById("lgTimerNum");
      const ring = document.getElementById("lgRingFill");
      if (num) num.textContent = Math.ceil(remaining);
      if (ring) {
        ring.style.strokeDashoffset = circumference * (1 - pct);
        ring.classList.toggle("urgent", remaining <= 5);
      }
    }

    if (remaining <= 0) {
      clearInterval(timerInterval);
      if (LG.role === "student" && !answered) {
        // Time expired — auto-submit no-answer
        const btns = document.querySelectorAll(".lg-opt-btn");
        btns.forEach(b => b.disabled = true);
        const q = session.questions[session.currentQuestion];
        if (q) {
          const shortInput = document.getElementById("lgSShortInput");
          const shortSubmit = document.getElementById("lgSShortSubmit");
          if (shortInput) shortInput.disabled = true;
          if (shortSubmit) shortSubmit.disabled = true;
          const btnsArr = Array.from(btns);
          if (q.type !== "short_answer") {
            btnsArr[q.correct]?.classList.add("correct");
          }
          const fb = document.getElementById("lgFeedback");
          if (fb) {
            fb.classList.remove("hidden");
            fb.classList.add("wrong");
            document.getElementById("lgFbIcon").innerHTML = '<i class="fa-solid fa-clock" style="color:#f87171"></i>';
            document.getElementById("lgFbText").textContent = q.type === "short_answer"
              ? "Time's up! Short answer not submitted."
              : "Time's up!";
            document.getElementById("lgFbScore").textContent = "";
          }
        }
      }
    }
  }

  tick();
  timerInterval = setInterval(tick, 200);
}

// ── Teacher buttons ───────────────────────────────────────────
function wireTeacherButtons() {
  const nextBtn = document.getElementById("lgNextBtn");
  const endBtn  = document.getElementById("lgEndBtn");

  if (nextBtn && !nextBtn._wired) {
    nextBtn._wired = true;
    nextBtn.addEventListener("click", async () => {
      if (!session) return;
      const next = session.currentQuestion + 1;
      const total = Object.keys(session.questions || {}).length;
      if (next >= total) {
        await SessionDB.endGame(LG.code);
      } else {
        await SessionDB.nextQuestion(LG.code, next);
      }
    });
  }

  if (endBtn && !endBtn._wired) {
    endBtn._wired = true;
    endBtn.addEventListener("click", async () => {
      if (confirm("End the session now?")) {
        await SessionDB.endGame(LG.code);
      }
    });
  }
}

// ── Leaderboard ───────────────────────────────────────────────
function updateLeaderboard(players) {
  const lb = document.getElementById("lgLeaderboard");
  if (!lb || !players) return;

  const sorted = Object.values(players)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 10);

  lb.innerHTML = sorted.length === 0
    ? '<p style="color:#555;font-size:0.8rem;text-align:center">No players yet</p>'
    : sorted.map((p, i) => `
      <div class="lg-lb-row">
        <span class="lg-lb-rank">#${i + 1}</span>
        <span class="lg-lb-name">${esc(p.name)}</span>
        <span class="lg-lb-score">${p.score || 0}</span>
      </div>
    `).join("");
}

// ── Game Over ─────────────────────────────────────────────────
function showGameOver() {
  clearInterval(timerInterval);
  if (sessionListener) sessionListener.stop();
  show("lgGameOver");

  if (session?.players) {
    const sorted = Object.values(session.players).sort((a, b) => (b.score || 0) - (a.score || 0));
    const medals = ["🥇", "🥈", "🥉"];

    // Top-3 podium
    document.getElementById("lgPodium").innerHTML = sorted.slice(0, 3).map((p, i) => `
      <div class="lg-pod-item">
        <span class="lg-pod-medal">${medals[i] || "#" + (i + 1)}</span>
        <span class="lg-pod-name">${esc(p.name)}</span>
        <span class="lg-pod-score">${p.score || 0} pts</span>
      </div>
    `).join("");

    // Full leaderboard (all players)
    const fullLb   = document.getElementById("lgFullLb");
    const fullList = document.getElementById("lgFullLbList");
    if (fullLb && fullList && sorted.length > 0) {
      fullLb.style.display = "";
      const simKeys = new Set(SIM_PLAYERS.map(p => p.playerKey));
      fullList.innerHTML = sorted.map((p, i) => {
        const isSim = simKeys.has(p.playerKey) ||
                      SIM_PLAYERS.some(s => s.name === p.name);
        const badge = isSim
          ? `<span class="lg-sim-tag"><i class="fa-solid fa-robot"></i> SIM</span>`
          : `<span class="lg-real-tag"><i class="fa-solid fa-user"></i></span>`;
        const rankClass = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
        return `
          <div class="lg-full-row ${rankClass}">
            <span class="lg-full-rank">${medals[i] || "#" + (i + 1)}</span>
            <span class="lg-full-name">${esc(p.name)}</span>
            ${badge}
            <span class="lg-full-score">${p.score || 0} <small>pts</small></span>
          </div>`;
      }).join("");
    }
  }

  if (LG.role === "student") {
    document.getElementById("lgFinalScore").style.display = "flex";
    setText("lgFinalScoreVal", myScore);
    if (session?.players) {
      const sorted = Object.values(session.players).sort((a, b) => (b.score || 0) - (a.score || 0));
      const rank = sorted.findIndex(p => p.name === LG.name) + 1;
      const total = sorted.length;
      setText("lgFinalRank", rank ? `Rank ${rank} of ${total}` : "");
    }
  }
  setText("lgGoMessage", LG.role === "teacher" ? "Session complete. Well done!" : "Great work!");

  if (LG.role === "teacher") {
    archiveCompletedSession().catch(() => {});
  }

  if (LG.role === "student") {
    submitPremiumGameReport().catch(() => {});
  }
}

// ── Utilities ─────────────────────────────────────────────────
function show(id) {
  ["lgWaiting", "lgTeacher", "lgStudent", "lgGameOver"].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.toggle("hidden", s !== id);
  });
}
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function esc(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
