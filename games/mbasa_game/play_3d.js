import * as THREE from "https://esm.sh/three@0.160.0";
import { GLTFLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

const stage = document.getElementById("stage");
const appEl = document.getElementById("app");
const startOverlay = document.getElementById("startOverlay");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const speedEl = document.getElementById("speed");
const modeEl = document.getElementById("mode");
const topicEl = document.getElementById("topic");
const tuningEl = document.getElementById("tuning");
const finalScoreEl = document.getElementById("finalScore");
const bestScoreEl = document.getElementById("bestScore");
const hitFlash = document.getElementById("hitFlash");
const controlsHint = document.getElementById("controlsHint");
const sourceInfo = document.getElementById("sourceInfo");
const tournamentBanner = document.getElementById("tournamentBanner");
const quizPanel = document.getElementById("quizPanel");
const quizQuestionText = document.getElementById("quizQuestionText");
const quizFeedback = document.getElementById("quizFeedback");
const modeButtons = Array.from(document.querySelectorAll(".mode-btn"));
const countdownOverlay = document.getElementById("countdownOverlay");
const countdownText = document.getElementById("countdownText");
const pauseOverlay = document.getElementById("pauseOverlay");
const resumeBtn = document.getElementById("resumeBtn");
const comboEl = document.getElementById("combo");
const mobileLeft = document.getElementById("mobileLeft");
const mobileRight = document.getElementById("mobileRight");
const mobileLeftP2 = document.getElementById("mobileLeftP2");
const mobileRightP2 = document.getElementById("mobileRightP2");

const GENERATED_QUIZ_KEY = "slidePlayGeneratedQuizData";
const UPLOADED_FILES_KEY = "slidePlayUploadedFiles";
const sourceParam = new URLSearchParams(window.location.search).get("source");
const LANE_COUNT = 4;

function readBestScore() {
  try {
    return Number(localStorage.getItem("runner3dBest") || 0);
  } catch (_error) {
    return 0;
  }
}

function readJsonStorage(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed ?? fallback;
  } catch (_error) {
    return fallback;
  }
}

function sanitizeQuizData(items) {
  if (!Array.isArray(items)) return [];
  return items
      .filter(item => item && (typeof item.question === 'string' || typeof item.questionText === 'string' || typeof item.prompt === 'string') && Array.isArray(item.options))
      .map(item => ({
        prompt: String(item.prompt || item.question || item.questionText || '').trim(),
        options: item.options.map((opt, idx) => {
          if (opt && typeof opt === 'object') {
            return {
              text: String(opt.text || opt.label || ''),
              correct: opt.correct === true || idx === Number(item.correct)
            };
          }
          return {
            text: String(opt),
            correct: idx === Number(item.correct)
          };
        })
      }))
      .map(item => {
        const normalized = {
          prompt: item.prompt,
          options: item.options
            .map(opt => ({ text: String(opt.text || '').trim(), correct: !!opt.correct }))
            .filter(opt => opt.text.length > 0)
        };

        if (!normalized.prompt || normalized.options.length < 2) return null;

        if (!normalized.options.some(opt => opt.correct)) {
          const expected = String(items.find(src => String(src.prompt || src.question || src.questionText || '').trim() === normalized.prompt)?.correctAnswer || '').trim().toLowerCase();
          if (expected) {
            const idx = normalized.options.findIndex(opt => opt.text.toLowerCase() === expected);
            if (idx >= 0) normalized.options[idx].correct = true;
          }
        }

        if (!normalized.options.some(opt => opt.correct)) {
          normalized.options[0].correct = true;
        }

        return normalized;
      })
      .filter(Boolean);
}

function loadQuizQuestions() {
  const generatedQuiz = sanitizeQuizData(readJsonStorage(GENERATED_QUIZ_KEY, []));
  const forceDemo = sourceParam === "demo";
  return forceDemo ? [] : generatedQuiz;
}

function writeBestScore(value) {
  try {
    localStorage.setItem("runner3dBest", String(value));
  } catch (_error) {
    // Ignore storage failures (private mode / blocked storage).
  }
}

function extractTermsFromText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4);
}

function buildRunnerProfile() {
  const generatedQuiz = readJsonStorage(GENERATED_QUIZ_KEY, []);
  const uploadedFiles = readJsonStorage(UPLOADED_FILES_KEY, []);
  const hasSlideData = generatedQuiz.length > 0 || uploadedFiles.length > 0;
  const shouldUseSlides = sourceParam !== "demo" && hasSlideData;

  const terms = [];
  const laneHints = [];

  generatedQuiz.forEach((item) => {
    if (!item) return;
    terms.push(...extractTermsFromText(item.question));
    if (Array.isArray(item.options)) {
      item.options.forEach((opt) => terms.push(...extractTermsFromText(opt)));
    }
    if (typeof item.correct === "number") {
      laneHints.push(((item.correct % LANE_COUNT) + LANE_COUNT) % LANE_COUNT);
    }
  });

  uploadedFiles.forEach((file) => {
    const cleanName = String(file.originalName || "").replace(/\.[^.]+$/, "");
    terms.push(...extractTermsFromText(cleanName));
  });

  const dedupedTerms = [];
  const seen = new Set();
  for (const term of terms) {
    if (!seen.has(term)) {
      seen.add(term);
      dedupedTerms.push(term);
    }
  }

  const sourceName = String(generatedQuiz[0]?.source || uploadedFiles[0]?.originalName || "").trim();
  const title = sourceName
    ? sourceName.replace(/\.[^.]+$/, "")
    : (shouldUseSlides ? "Slide Track" : "Demo Track");

  return {
    isSlideDriven: shouldUseSlides,
    hasSlideData,
    title,
    questionCount: generatedQuiz.length,
    fileCount: uploadedFiles.length,
    terms: dedupedTerms,
    laneHints
  };
}

function buildDifficultySettings(profile) {
  const q = profile.questionCount;

  if (!profile.isSlideDriven) {
    return {
      label: "Default",
      startSpeed: 20,
      maxSpeed: 44,
      accelEvery: 4.2,
      accelStep: 1.15,
      spawnStart: 1.1,
      spawnMin: 0.55,
      spawnStep: 0.028,
      distanceStep: 7.5,
      passPoints: 4,
      waveBonusEvery: 2,
      waveBonus: 2,
      hitPenalty: 12
    };
  }

  if (q >= 22) {
    return {
      label: "Hard",
      startSpeed: 23,
      maxSpeed: 50,
      accelEvery: 3.6,
      accelStep: 1.35,
      spawnStart: 1.0,
      spawnMin: 0.48,
      spawnStep: 0.034,
      distanceStep: 6.8,
      passPoints: 5,
      waveBonusEvery: 2,
      waveBonus: 3,
      hitPenalty: 16
    };
  }

  if (q >= 10) {
    return {
      label: "Medium",
      startSpeed: 21,
      maxSpeed: 46,
      accelEvery: 4.0,
      accelStep: 1.2,
      spawnStart: 1.1,
      spawnMin: 0.52,
      spawnStep: 0.03,
      distanceStep: 7.2,
      passPoints: 4,
      waveBonusEvery: 2,
      waveBonus: 2,
      hitPenalty: 14
    };
  }

  return {
    label: "Easy",
    startSpeed: 18,
    maxSpeed: 40,
    accelEvery: 4.6,
    accelStep: 1.0,
    spawnStart: 1.25,
    spawnMin: 0.62,
    spawnStep: 0.022,
    distanceStep: 7.8,
    passPoints: 3,
    waveBonusEvery: 3,
    waveBonus: 2,
    hitPenalty: 10
  };
}

// ── Quiz System ───────────────────────────────────────────
const defaultQuizQuestions = [
  {
    prompt: 'Which definition matches "Velocity"?',
    options: [
      { text: 'Speed with direction', correct: true },
      { text: 'The distance covered', correct: false },
      { text: 'The amount of force', correct: false },
    ]
  },
  {
    prompt: 'What is a "Polygon"?',
    options: [
      { text: 'A closed shape with straight sides', correct: true },
      { text: 'A curved 3D object', correct: false },
      { text: 'A single point', correct: false },
    ]
  },
  {
    prompt: 'What does "DNA" stand for?',
    options: [
      { text: 'Deoxyribonucleic acid', correct: true },
      { text: 'Dynamic numeric array', correct: false },
      { text: 'Digital network access', correct: false },
    ]
  },
];

let quizQuestions = loadQuizQuestions();
if (quizQuestions.length === 0) {
  quizQuestions = defaultQuizQuestions;
}

let quizActive = false;
let currentQuestion = null;
let quizItems = [];
let nextQuizFrame = 300; // Appear much sooner (was 450)
const QUIZ_INTERVAL = 400; // Appear more frequently (was 600)
const QUIZ_SLOW_DROP = 22;
const QUIZ_SLOW_MIN_SPEED = 6;
const QUIZ_SLOW_ACTIVATE = 0.24;
const QUIZ_SLOW_DURATION = 10;
const QUIZ_READ_HOLD = 1.6;
let quizSlowTimeRemaining = 0;
let quizReadHoldRemaining = 0;

const PLAY_MODES = {
  solo: {
    label: "Solo",
    lives: 3,
    speedMult: 1,
    accelMult: 1,
    spawnMult: 1,
    scoreMult: 1,
    hitPenaltyMult: 1
  },
  multiplayer: {
    label: "Multiplayer / 2 Players",
    lives: 4,
    speedMult: 0.94,
    accelMult: 0.9,
    spawnMult: 1.08,
    scoreMult: 0.95,
    hitPenaltyMult: 0.9
  },
  tournament: {
    label: "Tournament",
    lives: 2,
    speedMult: 1.12,
    accelMult: 1.2,
    spawnMult: 0.9,
    scoreMult: 1.2,
    hitPenaltyMult: 1.15
  }
};

let playMode = "solo";
let shieldCharges = 0;
let supportStreak = 0;
let tournamentHype = 1;
let tournamentRound = 1;
let tournamentWavesThisRound = 0;
let tournamentAnnouncementTimer = 0;
let tournamentAnnouncementText = "";
const TOURNAMENT_WAVES_PER_ROUND = 3;
const TOURNAMENT_MAX_HYPE = 3.2;
const TOURNAMENT_MAX_ROUNDS = 5;

const MODE_LOOK = {
  solo: {
    fog: 0x04070f,
    border: 0x39ff14,
    stars: 0x99bbff,
    markEmissive: 0x223055,
    pylonLeft: 1.4,
    pylonRight: 1.4,
    cameraFov: 58
  },
  multiplayer: {
    fog: 0x081225,
    border: 0x3af2ff,
    stars: 0x89f7ff,
    markEmissive: 0x1f5870,
    pylonLeft: 1.8,
    pylonRight: 1.8,
    cameraFov: 60
  },
  tournament: {
    fog: 0x12070c,
    border: 0xff9f1a,
    stars: 0xffe08f,
    markEmissive: 0x69442a,
    pylonLeft: 2.1,
    pylonRight: 2.1,
    cameraFov: 63
  }
};

function getModeTuning() {
  return PLAY_MODES[playMode] || PLAY_MODES.solo;
}

function shuffleArray(array) {
  return array
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

  // ── Web Audio (synthesized — no files needed) ─────────────
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
    }
    return audioCtx;
  }
  function playTone(freq, type, dur, vol = 0.22, freqEnd = 0) {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + dur);
    } catch (_) {}
  }
  function sfxHit()     { playTone(130, 'sawtooth', 0.3, 0.35, 60); }
  function sfxCorrect() { playTone(660, 'sine', 0.1, 0.22); setTimeout(() => playTone(880, 'sine', 0.15, 0.2), 110); }
  function sfxWrong()   { playTone(200, 'sawtooth', 0.38, 0.28, 100); }
  function sfxLane()    { playTone(480, 'square', 0.06, 0.1); }
  function sfxPass()    { playTone(680, 'sine', 0.09, 0.13); }
  function sfxComboUp() { playTone(880, 'sine', 0.07, 0.18); setTimeout(() => playTone(1100, 'sine', 0.1, 0.16), 80); }

  // ── Combo system ──────────────────────────────────────────
  let comboStreak = 0;
  let comboMultiplier = 1;

  function updateComboHud() {
    if (!comboEl) return;
    comboEl.textContent = "x" + comboMultiplier.toFixed(1);
    comboEl.classList.toggle("hot", comboMultiplier >= 2);
  }

  function incrementCombo() {
    comboStreak += 1;
    const newMult = Math.min(4, 1 + Math.floor(comboStreak / 3) * 0.5);
    const leveled = newMult > comboMultiplier;
    comboMultiplier = newMult;
    if (leveled) sfxComboUp();
    updateComboHud();
  }

  function resetCombo() {
    comboStreak = 0;
    comboMultiplier = 1;
    if (playMode === "tournament") {
      tournamentHype = 1;
      updateModeHud();
    }
    updateComboHud();
  }

  // ── Camera shake ──────────────────────────────────────────
  let shakeTime = 0;
  let shakeMag = 0;

function buildFourOptionQuestion(question, questionPool) {
  const letters = ["A", "B", "C", "D"];
  const options = Array.isArray(question?.options) ? question.options : [];
  const correct = options.find((opt) => opt.correct) || options[0] || { text: "Unknown", correct: true };

  const distractorTexts = [];
  const seen = new Set([String(correct.text).trim().toLowerCase()]);

  options.forEach((opt) => {
    const text = String(opt?.text || "").trim();
    if (!text || opt.correct) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    distractorTexts.push(text);
  });

  for (const item of questionPool) {
    if (distractorTexts.length >= 3) break;
    if (!item || !Array.isArray(item.options)) continue;
    for (const opt of item.options) {
      if (distractorTexts.length >= 3) break;
      const text = String(opt?.text || "").trim();
      if (!text || opt.correct) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      distractorTexts.push(text);
    }
  }

  const fallbackDistractors = ["Not listed", "Insufficient data", "None of the above"];
  for (const fallback of fallbackDistractors) {
    if (distractorTexts.length >= 3) break;
    const key = fallback.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    distractorTexts.push(fallback);
  }

  const answerSet = [
    { text: String(correct.text), correct: true },
    ...distractorTexts.slice(0, 3).map((text) => ({ text, correct: false }))
  ];

  const finalOptions = shuffleArray(answerSet).slice(0, 4).map((opt, index) => ({
    ...opt,
    letter: letters[index]
  }));

  return {
    prompt: String(question?.prompt || "Choose the correct option"),
    options: finalOptions
  };
}

function showQuizPrompt(question) {
  quizQuestionText.innerHTML = `<div class="mcq-question">${escapeHtml(question.prompt)}</div>`;
  quizFeedback.textContent = "Game speed is reduced. Move into the block with the correct option text.";
  quizPanel.classList.remove('hidden');
}

function hideQuizPrompt() {
  quizPanel.classList.add('hidden');
  quizFeedback.textContent = '';
}

function clearObstacles() {
  while (obstacles.length) {
    scene.remove(obstacles[0].mesh);
    obstacles.shift();
  }
}

function getEffectiveSpeed() {
  if (!quizActive || quizSlowTimeRemaining <= 0) return speed;
  if (quizReadHoldRemaining > 0) return QUIZ_SLOW_MIN_SPEED;
  const closestProgress = Math.max(0, ...quizItems.map((item) => item.progress));
  if (closestProgress < QUIZ_SLOW_ACTIVATE) return speed;

  const ramp = Math.min(1, (closestProgress - QUIZ_SLOW_ACTIVATE) / (0.92 - QUIZ_SLOW_ACTIVATE));
  return Math.max(QUIZ_SLOW_MIN_SPEED, speed - QUIZ_SLOW_DROP * ramp);
}

function createTextTexture(text, isCorrect) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  if (isCorrect) {
    grad.addColorStop(0, 'rgba(74, 222, 128, 0.34)');
    grad.addColorStop(1, 'rgba(59, 130, 246, 0.26)');
  } else {
    grad.addColorStop(0, 'rgba(244, 114, 182, 0.3)');
    grad.addColorStop(1, 'rgba(239, 68, 68, 0.26)');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(230, 245, 255, 0.82)';
  ctx.lineWidth = 18;
  ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

  const clean = String(text || '').trim() || 'No option';
  const words = clean.split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > 16 && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);

  const visibleLines = lines.slice(0, 4);
  const lineHeight = 240;
  const totalHeight = visibleLines.length * lineHeight;
  const startY = (canvas.height - totalHeight) / 2 + lineHeight / 2;

  ctx.fillStyle = '#f7fbff';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.lineWidth = 16;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 205px "Segoe UI", Tahoma, sans-serif';

  visibleLines.forEach((line, idx) => {
    const y = startY + idx * lineHeight;
    ctx.strokeText(line, canvas.width / 2, y);
    ctx.fillText(line, canvas.width / 2, y);
  });

  if (lines.length > visibleLines.length) {
    ctx.font = '700 140px "Segoe UI", Tahoma, sans-serif';
    ctx.fillText('...', canvas.width / 2, canvas.height - 120);
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

class QuizItem {
  constructor(lane, label, correct) {
    this.lane = lane;
    this.label = label;
    this.progress = 0;
    this.correct = correct;
    this.alive = true;
    this.hit = false;
    
    const textTexture = createTextTexture(label, correct);
    const material = new THREE.MeshPhysicalMaterial({
      map: textTexture,
      color: correct ? 0xb9fbc0 : 0xfca5a5,
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity: 0.9,
      transmission: 0.36,
      thickness: 0.95,
      ior: 1.18,
      emissive: correct ? 0x2f855a : 0x9b2c2c,
      emissiveIntensity: 0.42
    });
    
    // Slightly smaller blocks with oversized text
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(2.05, 3.3, 1.8), material);
    this.mesh.position.set(laneX[lane], 1.6, -100);
    scene.add(this.mesh);
  }

  update(dt, motionSpeed) {
    const speedScale = Math.max(0.6, motionSpeed / 20);
    this.progress += dt * 0.24 * speedScale;
    if (this.progress >= 1.05) {
      this.alive = false;
      return;
    }
    
    // Move block toward player (appear closer)
    const targetZ = -100 + this.progress * 120; // Appear at -100 instead of -130
    this.mesh.position.z = targetZ;
    
    // Rotate for visual effect
    this.mesh.rotation.x += 0.01;
    this.mesh.rotation.y += 0.015;
    
    // Add pulsing effect for extra visibility
    const pulse = 1.0 + Math.sin(Date.now() * 0.005) * 0.1;
    this.mesh.scale.set(pulse, pulse, pulse);
  }

  collides(playerLane, playerZ) {
    if (this.hit || !quizActive) return false;
    if (this.progress >= 0.75 && this.progress < 0.95 && this.lane === playerLane) { // Earlier collision window
      this.hit = true;
      return true;
    }
    return false;
  }

  destroy() {
    scene.remove(this.mesh);
  }
}

function triggerQuiz() {
  if (!running || quizActive) return;
  const question = quizQuestions[Math.floor(Math.random() * quizQuestions.length)];
  const options = buildFourOptionQuestion(question, quizQuestions).options;
  quizActive = true;
  currentQuestion = { prompt: question.prompt, options };
  quizSlowTimeRemaining = QUIZ_SLOW_DURATION;
  quizReadHoldRemaining = QUIZ_READ_HOLD;
  // Keep quiz rounds focused on answer navigation only.
  clearObstacles();
  quizItems.forEach(item => item.destroy());
  quizItems = options.map((option, lane) => new QuizItem(lane, `${option.letter}) ${option.text}`, option.correct));
  showQuizPrompt(currentQuestion);
}

function finishQuiz(correct, answeredBy = -1) {
  const question = currentQuestion;
  const correctOption = Array.isArray(question?.options)
    ? question.options.find((option) => option && option.correct)
    : null;

  questionAttempts.push({
    questionNumber: questionAttempts.length + 1,
    questionText: question?.prompt || "",
    userAnswer: "",
    correctAnswer: correctOption ? String(correctOption.text || "") : "",
    correct: !!correct,
    responseSeconds: 0,
    outcome: correct ? "answered" : "incorrect-or-missed",
    meta: {
      answeredBy: answeredBy >= 0 ? `P${answeredBy + 1}` : "none",
      mode: playMode,
    },
  });

  quizSlowTimeRemaining = 0;
  quizReadHoldRemaining = 0;
  quizActive = false;
  currentQuestion = null;
  quizItems.forEach(item => item.destroy());
  quizItems = [];
  const playerTag = answeredBy >= 0 ? `P${answeredBy + 1}: ` : "";
  quizFeedback.textContent = correct
    ? `${playerTag}Correct! Nice choice.`
    : `${playerTag}Wrong answer. Try again next time.`;
  if (correct) {
    sfxCorrect();
    const tournamentBoost = playMode === "tournament" ? tournamentHype : 1;
    score += 25 * comboMultiplier * tournamentBoost;
    updateHud();
  } else {
    sfxWrong();
  }
  setTimeout(() => {
    hideQuizPrompt();
  }, 1500);
  nextQuizFrame = frameCount + QUIZ_INTERVAL;
}

function updateQuizItems() {
  const closestProgress = Math.max(0, ...quizItems.map((item) => item.progress));
  if (quizPanel) {
    if (quizActive && closestProgress >= QUIZ_SLOW_ACTIVATE) {
      quizPanel.classList.add("quiz-focus");
    } else {
      quizPanel.classList.remove("quiz-focus");
    }
  }

  for (let i = quizItems.length - 1; i >= 0; i--) {
    const item = quizItems[i];
    item.update(lastFrameDt, lastMotionSpeed);
    let answeredBy = -1;
    for (let playerIndex = 0; playerIndex < PLAYER_COUNT; playerIndex++) {
      if (!isPlayerAlive(playerIndex)) continue;
      if (item.collides(playerLane[playerIndex], playerRoots[playerIndex].position.z)) {
        answeredBy = playerIndex;
        break;
      }
    }

    if (answeredBy >= 0) {
      item.mesh.scale.set(1.2, 1.2, 1.2);
      finishQuiz(item.correct, answeredBy);
      break;
    }
    if (!item.alive) {
      item.destroy();
      quizItems.splice(i, 1);
    }
  }

  if (quizActive && quizItems.length === 0) {
    finishQuiz(false);
  }
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070f);
scene.fog = new THREE.Fog(0x04070f, 30, 130);

// Starfield — subtle depth cue
const starPositions = new Float32Array(500 * 3);
for (let si = 0; si < 500; si++) {
  starPositions[si * 3]     = (Math.random() - 0.5) * 160;
  starPositions[si * 3 + 1] = Math.random() * 55 + 8;
  starPositions[si * 3 + 2] = (Math.random() - 0.5) * 280;
}
const starGeom = new THREE.BufferGeometry();
starGeom.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({ color: 0x99bbff, size: 0.35, sizeAttenuation: true });
const starField = new THREE.Points(starGeom, starMaterial);
scene.add(starField);

const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 300);
camera.position.set(0, 5.4, 14);
camera.lookAt(0, 1, -30);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xb8c9ff, 0x0a1412, 1.25);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xd0ffd2, 1.15);
dir.position.set(5, 10, 7);
scene.add(dir);

const laneX = [-5.4, -1.8, 1.8, 5.4];
let lastFrameDt = 0;
let lastMotionSpeed = 0;

const playerRoot = new THREE.Group();
playerRoot.position.set(laneX[1], 0, 7.2);
scene.add(playerRoot);

const playerTwoRoot = new THREE.Group();
playerTwoRoot.position.set(laneX[2], 0, 6.1);
scene.add(playerTwoRoot);

const fallbackBody = new THREE.Mesh(
  new THREE.BoxGeometry(1.1, 2, 1.1),
  new THREE.MeshStandardMaterial({ color: 0x70ff7d })
);
fallbackBody.position.y = 1.1;
fallbackBody.visible = false;
playerRoot.add(fallbackBody);

const fallbackBodyP2 = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.48, 1.15, 6, 12),
  new THREE.MeshStandardMaterial({ color: 0x6ad6ff, emissive: 0x0a3a56, emissiveIntensity: 0.45 })
);
fallbackBodyP2.position.y = 1.1;
fallbackBodyP2.visible = true;
playerTwoRoot.add(fallbackBodyP2);

function createPlayerBadge(label, tint) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, tint);
  gradient.addColorStop(1, "rgba(255,255,255,0.12)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 12;
  ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 118px Segoe UI, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.2, 1.1, 1);
  sprite.position.set(0, 3.15, 0);
  return sprite;
}

const playerOneBadge = createPlayerBadge("P1", "rgba(57, 255, 20, 0.95)");
const playerTwoBadge = createPlayerBadge("P2", "rgba(106, 214, 255, 0.95)");
playerRoot.add(playerOneBadge);
playerTwoRoot.add(playerTwoBadge);

const playerTwoAura = new THREE.Mesh(
  new THREE.TorusGeometry(0.95, 0.16, 10, 28),
  new THREE.MeshStandardMaterial({
    color: 0x69d8ff,
    emissive: 0x1a5874,
    emissiveIntensity: 1.0,
    roughness: 0.18,
    metalness: 0.55,
    transparent: true,
    opacity: 0.82
  })
);
playerTwoAura.rotation.x = Math.PI / 2;
playerTwoAura.position.y = 1.02;
playerTwoRoot.add(playerTwoAura);

const PLAYER_COUNT = 2;
const playerRoots = [playerRoot, playerTwoRoot];
const playerLane = [1, 2];
const playerLaneImpulse = [0, 0];
const playerLives = [0, 0];
const playerHitCooldown = [0, 0];

function isMultiplayerMode() {
  return playMode === "multiplayer";
}

function isPlayerEnabled(index) {
  return index === 0 || isMultiplayerMode();
}

function isPlayerAlive(index) {
  return isPlayerEnabled(index) && playerLives[index] > 0;
}

function getActivePlayerIndices() {
  const ids = [];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    if (isPlayerAlive(i)) ids.push(i);
  }
  return ids;
}

let mixer = null;
const clock = new THREE.Clock();

const loader = new GLTFLoader();
loader.load(
  "./synth_running_foward/scene.gltf",
  (gltf) => {
    const model = gltf.scene;
    model.scale.set(1.65, 1.65, 1.65);
    model.rotation.y = Math.PI;
    model.position.set(0, 0, 0);

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });

    playerRoot.add(model);

    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      const runClip = gltf.animations[0];
      mixer.clipAction(runClip).play();
    }
  },
  undefined,
  (error) => {
    console.warn("Model failed to load, using fallback runner:", error);
    fallbackBody.visible = true;
  }
);

const road = new THREE.Mesh(
  new THREE.PlaneGeometry(22, 260),
  new THREE.MeshStandardMaterial({ color: 0x111a2d, roughness: 0.86, metalness: 0.08 })
);
road.rotation.x = -Math.PI / 2;
road.position.set(0, 0, -65);
scene.add(road);

const leftBorder = new THREE.Mesh(
  new THREE.BoxGeometry(0.2, 0.15, 260),
  new THREE.MeshStandardMaterial({ color: 0x39ff14, emissive: 0x113315, emissiveIntensity: 0.5 })
);
leftBorder.position.set(-11.2, 0.08, -65);
scene.add(leftBorder);

const rightBorder = leftBorder.clone();
rightBorder.position.x = 11.2;
scene.add(rightBorder);

const roadMarks = [];
const markGeom = new THREE.BoxGeometry(0.18, 0.03, 3);
const markMat = new THREE.MeshStandardMaterial({ color: 0xe9f1ff, emissive: 0x223055 });
const dividerX = [-3.6, 0, 3.6];
for (let i = 0; i < 28; i++) {
  const z = -8 - i * 9;
  dividerX.forEach((xPos) => {
    const dividerMark = new THREE.Mesh(markGeom, markMat);
    dividerMark.position.set(xPos, 0.05, z);
    scene.add(dividerMark);
    roadMarks.push(dividerMark);
  });
}

  // Roadside neon pylons — left (blue) and right (pink)
  const PYLON_SPACING = 18;
  const pylonMeshes = [];
  const pylonMaterials = [];
  const pylonCylGeom = new THREE.CylinderGeometry(0.13, 0.13, 2.6, 6);
  [
    { xPos: -12.0, emissive: 0x0088ff },
    { xPos:  12.0, emissive: 0xff2266 }
  ].forEach(({ xPos, emissive }) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x060616, emissive, emissiveIntensity: 1.4 });
    pylonMaterials.push(mat);
    for (let pi = 0; pi < 8; pi++) {
      const mesh = new THREE.Mesh(pylonCylGeom, mat);
      mesh.position.set(xPos, 1.3, -6 - pi * PYLON_SPACING);
      scene.add(mesh);
      pylonMeshes.push({ mesh, xPos });
    }
  });

const obstacleColors = [0xff5f62, 0x5fb4ff, 0xffb45f, 0xa86bff, 0x42e8c2];
const obstacles = [];

const runnerProfile = buildRunnerProfile();
const difficulty = buildDifficultySettings(runnerProfile);
let laneHintIndex = 0;
let termIndex = 0;

if (topicEl) {
  topicEl.textContent = runnerProfile.isSlideDriven
    ? "Source: " + runnerProfile.title + " | " + difficulty.label
    : "Source: demo track";
}

if (sourceInfo) {
  sourceInfo.textContent = runnerProfile.isSlideDriven
    ? "Track generated from your slide quiz data (" + runnerProfile.questionCount + " questions). Difficulty: " + difficulty.label + "."
    : "Running demo challenge data. Upload slides to auto-generate a personalized track.";
}

if (tuningEl) {
  tuningEl.textContent = "Tuning "
    + difficulty.label
    + " | spawn " + difficulty.spawnStart.toFixed(2) + "->" + difficulty.spawnMin.toFixed(2)
    + " | accel +" + difficulty.accelStep.toFixed(2) + "/" + difficulty.accelEvery.toFixed(1) + "s"
    + " | hit -" + difficulty.hitPenalty;
}

function updateModeButtons() {
  modeButtons.forEach((btn) => {
    const isActive = btn.dataset.mode === playMode;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function applyModeLook() {
  const look = MODE_LOOK[playMode] || MODE_LOOK.solo;
  if (appEl) appEl.dataset.playMode = playMode;
  document.body.dataset.playMode = playMode;

  scene.fog.color.setHex(look.fog);
  leftBorder.material.color.setHex(look.border);
  leftBorder.material.emissive.setHex(look.border);
  rightBorder.material.color.setHex(look.border);
  rightBorder.material.emissive.setHex(look.border);
  markMat.emissive.setHex(look.markEmissive);
  starMaterial.color.setHex(look.stars);

  if (pylonMaterials[0]) pylonMaterials[0].emissiveIntensity = look.pylonLeft;
  if (pylonMaterials[1]) pylonMaterials[1].emissiveIntensity = look.pylonRight;

  camera.fov += (look.cameraFov - camera.fov) * 0.35;
  camera.updateProjectionMatrix();
}
  // ── Pause ─────────────────────────────────────────────────
  let paused = false;

  function togglePause() {
    if (!running) return;
    paused = !paused;
    if (pauseOverlay) pauseOverlay.classList.toggle("hidden", !paused);
    if (!paused) clock.getDelta(); // drain accumulated delta to avoid time jump
  }

  if (resumeBtn) resumeBtn.addEventListener("click", togglePause);

  // ── Countdown 3-2-1 GO! ───────────────────────────────────
  function runCountdown(callback) {
    if (!countdownOverlay || !countdownText) { callback(); return; }
    let n = 3;
    countdownOverlay.classList.remove("hidden");
    countdownText.classList.remove("go");
    countdownText.textContent = n;
    function tick() {
      n -= 1;
      if (n > 0) {
        countdownText.textContent = n;
        countdownText.style.animation = "none";
        void countdownText.offsetWidth;
        countdownText.style.animation = "";
        setTimeout(tick, 800);
      } else {
        countdownText.textContent = "GO!";
        countdownText.classList.add("go");
        countdownText.style.animation = "none";
        void countdownText.offsetWidth;
        countdownText.style.animation = "";
        setTimeout(() => {
          countdownOverlay.classList.add("hidden");
          callback();
        }, 650);
      }
    }
    setTimeout(tick, 800);
  }


function restoreTournamentSourceInfo() {
  if (!sourceInfo) return;
  sourceInfo.textContent = runnerProfile.isSlideDriven
    ? "Track generated from your slide quiz data (" + runnerProfile.questionCount + " questions). Difficulty: " + difficulty.label + "."
    : "Running demo challenge data. Upload slides to auto-generate a personalized track.";
}

function setTournamentBanner(text) {
  if (!tournamentBanner) return;
  tournamentBanner.textContent = text;
  tournamentBanner.classList.toggle("hidden", !text);
}

function announceTournament(text, duration = 1.8) {
  tournamentAnnouncementText = text;
  tournamentAnnouncementTimer = duration;
  if (playMode === "tournament") {
    setTournamentBanner(text);
    if (sourceInfo) sourceInfo.textContent = text;
  }
}

function updateModeHud() {
  const modeTuning = getModeTuning();
  let status = "";
  if (playMode === "multiplayer") {
    status = " | Shield: " + shieldCharges;
  }
  if (playMode === "tournament") {
    status = " | Round: " + tournamentRound + " | Hype: x" + tournamentHype.toFixed(1);
  }
  if (modeEl) {
    modeEl.textContent = "Mode: " + modeTuning.label + status;
  }

  if (controlsHint) {
    if (playMode === "multiplayer") {
      controlsHint.textContent = "P1: Left/Right Arrows | P2: A/D (or on-screen A/D buttons)";
    } else if (playMode === "tournament") {
      controlsHint.textContent = "Tournament: Solo run with escalating heats. Left/Right Arrows (or swipe).";
    } else {
      controlsHint.textContent = "Solo: Left/Right Arrows (or swipe) to change lanes.";
    }
  }

  playerTwoRoot.visible = isMultiplayerMode();
}

function updateTournamentRoundBanner() {
  if (playMode !== "tournament") return;
  announceTournament("Tournament Heat " + tournamentRound + " - hold your lane and build hype.", 2.4);
}

function advanceTournamentRound() {
  if (playMode !== "tournament") return;
  if (tournamentRound >= TOURNAMENT_MAX_ROUNDS) {
    announceTournament("Final Heat - keep pushing!", 2.2);
    return;
  }

  tournamentRound += 1;
  tournamentWavesThisRound = 0;
  tournamentHype = Math.min(TOURNAMENT_MAX_HYPE, 1 + (tournamentRound - 1) * 0.22);
  speed = Math.min(difficulty.maxSpeed * getModeTuning().speedMult + tournamentRound * 0.9, speed + 0.45);
  spawnEvery = Math.max(difficulty.spawnMin * getModeTuning().spawnMult, spawnEvery - 0.04);
  updateModeHud();
  updateHud();
  announceTournament("Heat " + tournamentRound + " - the crowd is louder.", 2.0);
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (running) return;
    playMode = btn.dataset.mode || "solo";
    shieldCharges = 0;
    supportStreak = 0;
    tournamentRound = 1;
    tournamentWavesThisRound = 0;
    tournamentAnnouncementTimer = 0;
    tournamentAnnouncementText = "";
    tournamentHype = 1;
    playerLives[0] = getModeTuning().lives;
    playerLives[1] = isMultiplayerMode() ? getModeTuning().lives : 0;
    updateModeButtons();
    applyModeLook();
    if (playMode === "tournament") {
      updateTournamentRoundBanner();
    } else {
      setTournamentBanner("");
      restoreTournamentSourceInfo();
    }
    updateModeHud();
    updateHud();
  });
});

updateModeButtons();
applyModeLook();
updateModeHud();

let score = 0;
let best = readBestScore();
let speed = difficulty.startSpeed * getModeTuning().speedMult;
let distanceMeter = 0;
let spawnTimer = 0;
let spawnEvery = difficulty.spawnStart * getModeTuning().spawnMult;
let running = false;
let isStarting = false;
let speedStepTimer = 0;
let wavesCleared = 0;
let frameCount = 0;
let runStartedAt = 0;
let premiumReportSubmitted = false;
let questionAttempts = [];
lastMotionSpeed = speed;
playerLives[0] = getModeTuning().lives;
playerLives[1] = isMultiplayerMode() ? getModeTuning().lives : 0;

function nextSafeLane() {
  if (runnerProfile.laneHints.length > 0) {
    const lane = runnerProfile.laneHints[laneHintIndex % runnerProfile.laneHints.length];
    laneHintIndex += 1;
    return lane;
  }
  return Math.floor(Math.random() * laneX.length);
}

function nextObstacleColor() {
  if (runnerProfile.terms.length > 0) {
    const term = runnerProfile.terms[termIndex % runnerProfile.terms.length];
    termIndex += 1;
    let hash = 0;
    for (let i = 0; i < term.length; i++) {
      hash = (hash * 31 + term.charCodeAt(i)) >>> 0;
    }
    return obstacleColors[hash % obstacleColors.length];
  }
  return obstacleColors[Math.floor(Math.random() * obstacleColors.length)];
}

function makeObstacle(lane, zPos) {
  const mat = new THREE.MeshStandardMaterial({
    color: nextObstacleColor(),
    roughness: 0.35,
    metalness: 0.3
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.95, 2.6, 1.7), mat);
  mesh.position.set(laneX[lane], 1.3, zPos);
  scene.add(mesh);

  obstacles.push({ lane, mesh, passed: false });
}

function spawnObstacleWave() {
  const safeLane = nextSafeLane();
  const secondarySafeLane = (playMode === "multiplayer" && Math.random() < 0.42)
    ? (safeLane + (Math.random() > 0.5 ? 1 : 3)) % laneX.length
    : -1;
  const zPos = -130;
  for (let lane = 0; lane < laneX.length; lane++) {
    if (lane === safeLane || lane === secondarySafeLane) continue;
    makeObstacle(lane, zPos);
  }

  if (playMode === "tournament" && Math.random() < 0.36) {
    // Add a stinger obstacle in the safe lane further back to force quick follow-up lane changes.
    makeObstacle(safeLane, zPos - 18);
  }
}

function resetGame() {
  const modeTuning = getModeTuning();
  score = 0;
  speed = difficulty.startSpeed * modeTuning.speedMult;
  distanceMeter = 0;
  spawnEvery = difficulty.spawnStart * modeTuning.spawnMult;
  spawnTimer = 0;
  speedStepTimer = 0;
  wavesCleared = 0;
  laneHintIndex = 0;
  supportStreak = 0;
  tournamentHype = 1;
  tournamentRound = 1;
  tournamentWavesThisRound = 0;
  tournamentAnnouncementTimer = 0;
  tournamentAnnouncementText = "";
  if (playMode === "tournament") {
    announceTournament("Tournament Heat 1 - hold your lane and build hype.", 2.4);
  }
  shieldCharges = playMode === "multiplayer" ? 1 : 0;
  frameCount = 0;
  runStartedAt = 0;
  premiumReportSubmitted = false;
  questionAttempts = [];
  quizActive = false;
  currentQuestion = null;
  nextQuizFrame = 300;
  quizItems.forEach(item => item.destroy());
  quizItems = [];

  for (let i = 0; i < PLAYER_COUNT; i++) {
    playerLane[i] = i === 0 ? 1 : 2;
    playerLaneImpulse[i] = 0;
    playerHitCooldown[i] = 0;
    playerLives[i] = isPlayerEnabled(i) ? modeTuning.lives : 0;
    playerRoots[i].position.x = laneX[playerLane[i]];
    playerRoots[i].rotation.z = 0;
    playerRoots[i].visible = isPlayerEnabled(i);
    playerRoots[i].traverse((node) => {
      if (node.isMesh && node.material) {
        node.material.transparent = true;
        node.material.opacity = 1;
      }
    });
  }

  paused = false;
  if (pauseOverlay) pauseOverlay.classList.add("hidden");
  shakeTime = 0;
  shakeMag = 0;
  resetCombo();

  clearObstacles();

  hideQuizPrompt();
  applyModeLook();
  updateModeHud();
  updateHud();
}

function updateHud(displaySpeed = speed) {
  scoreEl.textContent = "Score: " + Math.floor(score);
  if (isMultiplayerMode()) {
    livesEl.textContent = "Lives: P1 " + playerLives[0] + " | P2 " + playerLives[1];
  } else {
    livesEl.textContent = "Lives: " + playerLives[0];
  }
  speedEl.textContent = "Speed: " + (displaySpeed / 20).toFixed(1) + "x";
}

function takeHit(playerIndex) {
  const modeTuning = getModeTuning();
  if (!isPlayerAlive(playerIndex) || playerHitCooldown[playerIndex] > 0) return;

  if (playMode === "multiplayer" && shieldCharges > 0) {
    shieldCharges -= 1;
    playerHitCooldown[playerIndex] = 0.45;
    shakeTime = 0.22;
    shakeMag = 0.7;
    sfxLane();
    updateModeHud();
    return;
  }

  playerHitCooldown[playerIndex] = 0.6;
  playerLives[playerIndex] = Math.max(0, playerLives[playerIndex] - 1);
  score = Math.max(0, score - difficulty.hitPenalty * modeTuning.hitPenaltyMult);
  resetCombo();
  sfxHit();
  shakeTime = 0.38;
  shakeMag = 1.4;
  if (playerLives[playerIndex] <= 0) {
    playerRoots[playerIndex].traverse((node) => {
      if (node.isMesh && node.material) {
        node.material.transparent = true;
        node.material.opacity = 0.28;
      }
    });
  }
  updateHud();

  hitFlash.classList.remove("active");
  void hitFlash.offsetWidth;
  hitFlash.classList.add("active");

  if (!getActivePlayerIndices().length) {
    running = false;
    if (score > best) {
      best = score;
      writeBestScore(best);
    }
    finalScoreEl.textContent = "Score: " + Math.floor(score);
    bestScoreEl.textContent = "Best: " + best;
    gameOverOverlay.classList.remove("hidden");
    void submitPremiumRunnerReport();
  }
}

async function submitPremiumRunnerReport() {
  if (premiumReportSubmitted) {
    return;
  }

  if (!window.PremiumGameReporter || typeof window.PremiumGameReporter.submitReport !== "function") {
    return;
  }

  const correctCount = questionAttempts.filter((attempt) => attempt.correct).length;
  const durationSec = Math.max(0, Math.round((Date.now() - Number(runStartedAt || Date.now())) / 1000));

  const payload = {
    gameType: "mbasa-game-3d",
    score: Math.floor(score),
    totalQuestions: questionAttempts.length,
    correctCount,
    durationSec,
    questionAttempts,
    meta: {
      source: "mbasa-play-3d",
      mode: playMode,
      bestScore: Math.floor(best),
      wavesCleared,
    },
  };

  const result = await window.PremiumGameReporter.submitReport(payload);
  if (result && result.ok) {
    premiumReportSubmitted = true;
  }
}

function startRun() {
  if (running || isStarting) return;
  isStarting = true;
  try { getAudioCtx()?.resume(); } catch (_) {}
  resetGame();
  runStartedAt = Date.now();
  premiumReportSubmitted = false;
  startOverlay.classList.add("hidden");
  gameOverOverlay.classList.add("hidden");
  runCountdown(() => {
    running = true;
    isStarting = false;
  });
}

function movePlayerLeft(playerIndex) {
  if (!running || paused || !isPlayerAlive(playerIndex) || playerLane[playerIndex] === 0) return;
  playerLane[playerIndex] -= 1;
  playerLaneImpulse[playerIndex] = -1;
  sfxLane();
}

function movePlayerRight(playerIndex) {
  if (!running || paused || !isPlayerAlive(playerIndex) || playerLane[playerIndex] === laneX.length - 1) return;
  playerLane[playerIndex] += 1;
  playerLaneImpulse[playerIndex] = 1;
  sfxLane();
}

document.addEventListener("keydown", (event) => {
  if (!running && !startOverlay.classList.contains("hidden") && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    startRun();
    return;
  }
  if (event.key === "Escape" || event.key === "p" || event.key === "P") { togglePause(); return; }
  if (event.key === "ArrowLeft") movePlayerLeft(0);
  if (event.key === "ArrowRight") movePlayerRight(0);
  if (isMultiplayerMode() && (event.key === "a" || event.key === "A")) movePlayerLeft(1);
  if (isMultiplayerMode() && (event.key === "d" || event.key === "D")) movePlayerRight(1);
});

let touchStartX = 0;
document.addEventListener("touchstart", (event) => {
  if (!event.touches || !event.touches[0]) return;
  touchStartX = event.touches[0].clientX;
}, { passive: true });

document.addEventListener("touchend", (event) => {
  if (!event.changedTouches || !event.changedTouches[0]) return;
  const dx = event.changedTouches[0].clientX - touchStartX;
  if (dx > 26) movePlayerRight(0);
  if (dx < -26) movePlayerLeft(0);
}, { passive: true });

if (startBtn) {
  startBtn.addEventListener("click", startRun);
  startBtn.addEventListener("touchend", (event) => {
    event.preventDefault();
    startRun();
  }, { passive: false });
  startBtn.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      startRun();
    }
  });
}

if (restartBtn) {
  restartBtn.addEventListener("click", startRun);
}

  if (mobileLeft) {
    mobileLeft.addEventListener("touchstart", (e) => { e.preventDefault(); movePlayerLeft(0); }, { passive: false });
    mobileLeft.addEventListener("click", () => movePlayerLeft(0));
  }

  if (mobileRight) {
    mobileRight.addEventListener("touchstart", (e) => { e.preventDefault(); movePlayerRight(0); }, { passive: false });
    mobileRight.addEventListener("click", () => movePlayerRight(0));
  }

  if (mobileLeftP2) {
    mobileLeftP2.addEventListener("touchstart", (e) => { e.preventDefault(); if (isMultiplayerMode()) movePlayerLeft(1); }, { passive: false });
    mobileLeftP2.addEventListener("click", () => { if (isMultiplayerMode()) movePlayerLeft(1); });
  }

  if (mobileRightP2) {
    mobileRightP2.addEventListener("touchstart", (e) => { e.preventDefault(); if (isMultiplayerMode()) movePlayerRight(1); }, { passive: false });
    mobileRightP2.addEventListener("click", () => { if (isMultiplayerMode()) movePlayerRight(1); });
  }

function onResize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener("resize", onResize);
onResize();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  lastFrameDt = dt;

  if (paused) { renderer.render(scene, camera); return; }

  if (mixer) mixer.update(dt);

  let targetCenterX = 0;
  let livePlayerCount = 0;
  for (let i = 0; i < PLAYER_COUNT; i++) {
    if (!isPlayerEnabled(i)) continue;

    const targetX = laneX[playerLane[i]];
    const laneDelta = targetX - playerRoots[i].position.x;
    playerRoots[i].position.x += laneDelta * Math.min(1, dt * 22);
    if (Math.abs(laneDelta) < 0.02) {
      playerRoots[i].position.x = targetX;
    }

    playerLaneImpulse[i] *= Math.max(0, 1 - dt * 8);
    const laneTiltTarget = THREE.MathUtils.clamp((-laneDelta * 0.1) + playerLaneImpulse[i] * 0.16, -0.28, 0.28);
    playerRoots[i].rotation.z += (laneTiltTarget - playerRoots[i].rotation.z) * Math.min(1, dt * 14);

    if (isPlayerAlive(i)) {
      targetCenterX += playerRoots[i].position.x;
      livePlayerCount += 1;
    }
  }

  if (!livePlayerCount) {
    targetCenterX = playerRoots[0].position.x;
    livePlayerCount = 1;
  }

  targetCenterX /= livePlayerCount;
  const cameraTargetX = targetCenterX * 0.16;
  camera.position.x += (cameraTargetX - camera.position.x) * Math.min(1, dt * 5);
  camera.lookAt(targetCenterX * 0.12, 1, -30);

  if (shakeTime > 0) {
    shakeTime = Math.max(0, shakeTime - dt);
    const sf = shakeMag * (shakeTime / 0.38);
    camera.position.x += (Math.random() - 0.5) * sf;
    camera.position.y += (Math.random() - 0.5) * sf * 0.45;
  }

  let motionSpeed = speed;

  if (running) {
    const modeTuning = getModeTuning();
    frameCount += 1;
    if (playMode === "tournament" && tournamentAnnouncementTimer > 0) {
      tournamentAnnouncementTimer = Math.max(0, tournamentAnnouncementTimer - dt);
      if (tournamentAnnouncementTimer <= 0) {
        setTournamentBanner("");
        restoreTournamentSourceInfo();
      }
    }

    speedStepTimer += dt;
    spawnTimer += dt;

    if (speedStepTimer >= difficulty.accelEvery) {
      speedStepTimer = 0;
      speed = Math.min(difficulty.maxSpeed * modeTuning.speedMult, speed + difficulty.accelStep * modeTuning.accelMult);
      spawnEvery = Math.max(difficulty.spawnMin * modeTuning.spawnMult, spawnEvery - difficulty.spawnStep);
    }

    if (!quizActive && spawnTimer >= spawnEvery) {
      spawnTimer = 0;
      spawnObstacleWave();
    }

    // Quiz system
    if (frameCount >= nextQuizFrame) {
      triggerQuiz();
    }

    if (quizSlowTimeRemaining > 0) {
      quizSlowTimeRemaining = Math.max(0, quizSlowTimeRemaining - dt);
    }
    if (quizReadHoldRemaining > 0) {
      quizReadHoldRemaining = Math.max(0, quizReadHoldRemaining - dt);
    }

    motionSpeed = getEffectiveSpeed();
    lastMotionSpeed = motionSpeed;
    updateQuizItems();

    roadMarks.forEach((m) => {
      m.position.z += motionSpeed * dt;
      if (m.position.z > 12) m.position.z = -240;
    });

    pylonMeshes.forEach((p) => {
      p.mesh.position.z += motionSpeed * dt;
      if (p.mesh.position.z > 16) {
        let minZ = Infinity;
        pylonMeshes.forEach((q) => {
          if (q.xPos === p.xPos && q.mesh.position.z < minZ) minZ = q.mesh.position.z;
        });
        p.mesh.position.z = minZ - PYLON_SPACING;
      }
    });

    distanceMeter += motionSpeed * dt;
    while (distanceMeter >= difficulty.distanceStep) {
      distanceMeter -= difficulty.distanceStep;
      score += 1;
    }

    for (let i = 0; i < PLAYER_COUNT; i++) {
      if (playerHitCooldown[i] > 0) {
        playerHitCooldown[i] = Math.max(0, playerHitCooldown[i] - dt);
      }
    }

    const leadPlayerZ = Math.max(...getActivePlayerIndices().map((idx) => playerRoots[idx].position.z), playerRoots[0].position.z);

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const item = obstacles[i];
      item.mesh.position.z += motionSpeed * dt;
      item.mesh.rotation.x += dt * 1.7;
      item.mesh.rotation.y += dt * 2.2;

      if (!item.passed && item.mesh.position.z > leadPlayerZ + 1.3) {
        item.passed = true;
        incrementCombo();
        sfxPass();

        if (playMode === "multiplayer") {
          supportStreak += 1;
          if (supportStreak % 8 === 0) {
            shieldCharges = Math.min(2, shieldCharges + 1);
            updateModeHud();
            sfxComboUp();
          }
        }

        if (playMode === "tournament") {
          tournamentHype = Math.min(2.4, 1 + comboStreak * 0.08 + (speed / Math.max(1, difficulty.maxSpeed)) * 0.3);
          updateModeHud();
        }

        const modeScoreBoost = playMode === "tournament" ? tournamentHype : 1;
        score += difficulty.passPoints * modeTuning.scoreMult * comboMultiplier * modeScoreBoost;
      }

      if (!quizActive) {
        let collidedPlayer = -1;
        for (let playerIndex = 0; playerIndex < PLAYER_COUNT; playerIndex++) {
          if (!isPlayerAlive(playerIndex)) continue;
          const sameLane = item.lane === playerLane[playerIndex];
          const zClose = Math.abs(item.mesh.position.z - playerRoots[playerIndex].position.z) < 1.35;
          if (sameLane && zClose) {
            collidedPlayer = playerIndex;
            break;
          }
        }

        if (collidedPlayer >= 0) {
          scene.remove(item.mesh);
          obstacles.splice(i, 1);
          takeHit(collidedPlayer);
          continue;
        }
      }

      if (item.mesh.position.z > 18) {
        if (item.passed) {
          wavesCleared += 1;
          if (wavesCleared % difficulty.waveBonusEvery === 0) {
            score += difficulty.waveBonus * modeTuning.scoreMult;
          }
          if (playMode === "tournament") {
            tournamentWavesThisRound += 1;
            if (tournamentWavesThisRound >= TOURNAMENT_WAVES_PER_ROUND) {
              tournamentWavesThisRound = 0;
              advanceTournamentRound();
            } else {
              tournamentHype = Math.min(TOURNAMENT_MAX_HYPE, 1 + (tournamentRound - 1) * 0.22 + tournamentWavesThisRound * 0.05);
              updateModeHud();
            }
          }
        }
        scene.remove(item.mesh);
        obstacles.splice(i, 1);
      }
    }

    updateHud(motionSpeed);

    if (playMode === "tournament") {
      const look = MODE_LOOK.tournament;
      const targetFov = look.cameraFov + Math.min(3.5, (tournamentHype - 1) * 2.4);
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
    }
  }

  renderer.render(scene, camera);
}

updateHud();
animate();
