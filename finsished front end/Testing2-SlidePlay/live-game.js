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

// Local state
let session = null;
let sessionListener = null;
let timerInterval = null;
let answered = false;
let myScore = 0;
let lastQuestion = -1;

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

  // Subscribe to session
  sessionListener = SessionDB.listenSession(LG.code, onSessionUpdate);
});

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

  const questions = data.questions;
  if (!questions || qIndex >= Object.keys(questions).length) return;

  const q = questions[qIndex];
  const total = Object.keys(questions).length;
  const timePerQ = data.settings?.timePerQ || 20;

  if (LG.role === "teacher") {
    renderTeacherQuestion(q, qIndex, total, timePerQ, data);
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
  opts.innerHTML = q.options.map((opt, i) => `
    <div class="lg-opt-teacher ${i === q.correct ? "correct" : ""}">
      <span class="lg-opt-label">${LABELS[i]}</span>
      ${opt}
    </div>
  `).join("");

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
  opts.innerHTML = q.options.map((opt, i) => `
    <button class="lg-opt-btn" data-index="${i}" onclick="studentAnswer(${i})">
      <span class="lg-opt-lbl">${LABELS[i]}</span>
      ${opt}
    </button>
  `).join("");

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
          const btnsArr = Array.from(btns);
          btnsArr[q.correct]?.classList.add("correct");
          const fb = document.getElementById("lgFeedback");
          if (fb) {
            fb.classList.remove("hidden");
            fb.classList.add("wrong");
            document.getElementById("lgFbIcon").innerHTML = '<i class="fa-solid fa-clock" style="color:#f87171"></i>';
            document.getElementById("lgFbText").textContent = "Time's up!";
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
    document.getElementById("lgPodium").innerHTML = sorted.slice(0, 3).map((p, i) => `
      <div class="lg-pod-item">
        <span class="lg-pod-medal">${medals[i] || "#" + (i + 1)}</span>
        <span class="lg-pod-name">${esc(p.name)}</span>
        <span class="lg-pod-score">${p.score || 0} pts</span>
      </div>
    `).join("");
  }

  if (LG.role === "student") {
    document.getElementById("lgFinalScore").style.display = "flex";
    setText("lgFinalScoreVal", myScore);
    // Find player rank
    if (session?.players) {
      const sorted = Object.values(session.players).sort((a, b) => (b.score || 0) - (a.score || 0));
      const rank = sorted.findIndex(p => p.name === LG.name) + 1;
      const total = sorted.length;
      setText("lgFinalRank", rank ? `Rank ${rank} of ${total}` : "");
    }
  }
  setText("lgGoMessage", LG.role === "teacher" ? "Session complete. Well done!" : "Great work!");
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
