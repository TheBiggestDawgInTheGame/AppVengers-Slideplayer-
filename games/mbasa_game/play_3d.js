import * as THREE from "https://esm.sh/three@0.160.0";
import { GLTFLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

const stage = document.getElementById("stage");
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
const sourceInfo = document.getElementById("sourceInfo");
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
      .filter(item => item && typeof item.question === 'string' && Array.isArray(item.options))
      .map(item => ({
        prompt: String(item.question),
        options: item.options.map((text, idx) => ({
          text: String(text),
          correct: idx === Number(item.correct)
        }))
      }))
      .filter(item => item.options.length >= 2);
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
const QUIZ_SLOW_DROP = 14;
const QUIZ_SLOW_MIN_SPEED = 10;
const QUIZ_SLOW_ACTIVATE = 0.56;
const QUIZ_SLOW_DURATION = 8;
let quizSlowTimeRemaining = 0;

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
    label: "2 Players",
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
  const lines = question.options
    .map((opt) => `<div class="mcq-option"><strong>${opt.letter})</strong> ${escapeHtml(opt.text)}</div>`)
    .join("");
  quizQuestionText.innerHTML = `<div class="mcq-question">${escapeHtml(question.prompt)}</div>${lines}`;
  quizFeedback.textContent = "Navigate to the block matching the correct letter.";
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
  const closestProgress = Math.max(0, ...quizItems.map((item) => item.progress));
  if (closestProgress < QUIZ_SLOW_ACTIVATE) return speed;

  const ramp = Math.min(1, (closestProgress - QUIZ_SLOW_ACTIVATE) / (0.92 - QUIZ_SLOW_ACTIVATE));
  return Math.max(QUIZ_SLOW_MIN_SPEED, speed - QUIZ_SLOW_DROP * ramp);
}

function createTextTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  
  // Background with better contrast
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Use compact letter labels for lane-mapped MCQ blocks.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 980px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Add a thin outline for contrast
  ctx.strokeStyle = '#ffff00';
  ctx.lineWidth = 6;
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

class QuizItem {
  constructor(lane, label, correct) {
    this.lane = lane;
    this.progress = 0;
    this.correct = correct;
    this.alive = true;
    this.hit = false;
    
    const textTexture = createTextTexture(label);
    const material = new THREE.MeshStandardMaterial({
      map: textTexture,
      color: correct ? 0xffffff : 0xff4444, // White for correct, red for wrong
      roughness: 0.2,
      metalness: 0.8,
      emissive: correct ? 0x444444 : 0x441111, // Strong emissive glow
      emissiveIntensity: 1.0 // Increased from 0.4
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
  // Keep quiz rounds focused on answer navigation only.
  clearObstacles();
  quizItems.forEach(item => item.destroy());
  quizItems = options.map((option, lane) => new QuizItem(lane, option.letter, option.correct));
  showQuizPrompt(currentQuestion);
}

function finishQuiz(correct) {
  quizSlowTimeRemaining = 0;
  quizActive = false;
  currentQuestion = null;
  quizItems.forEach(item => item.destroy());
  quizItems = [];
  quizFeedback.textContent = correct ? 'Correct! Nice choice.' : 'Wrong answer. Try again next time.';
  if (correct) {
    score += 25;
    updateHud();
  }
    quizFeedback.textContent = correct ? 'Correct! Nice choice.' : 'Wrong answer. Try again next time.';
    if (correct) {
      sfxCorrect();
      score += 25 * comboMultiplier;
      updateHud();
    } else {
      sfxWrong();
    }
  setTimeout(() => {
    hideQuizPrompt();
  }, 1500);
  nextQuizFrame = frameCount + QUIZ_INTERVAL;
}

function updateQuizItems(playerLaneX, playerZ) {
  void playerLaneX;
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
    if (item.collides(currentLane, playerZ)) {
      item.mesh.scale.set(1.2, 1.2, 1.2);
      finishQuiz(item.correct);
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
const starField = new THREE.Points(
  starGeom,
  new THREE.PointsMaterial({ color: 0x99bbff, size: 0.35, sizeAttenuation: true })
);
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
let currentLane = 1;
let laneSwitchImpulse = 0;
let lastFrameDt = 0;
let lastMotionSpeed = 0;

const playerRoot = new THREE.Group();
playerRoot.position.set(laneX[currentLane], 0, 7);
scene.add(playerRoot);

const fallbackBody = new THREE.Mesh(
  new THREE.BoxGeometry(1.1, 2, 1.1),
  new THREE.MeshStandardMaterial({ color: 0x70ff7d })
);
fallbackBody.position.y = 1.1;
fallbackBody.visible = false;
playerRoot.add(fallbackBody);

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
  new THREE.MeshStandardMaterial({ color: 0x39ff14 })
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
  const pylonCylGeom = new THREE.CylinderGeometry(0.13, 0.13, 2.6, 6);
  [
    { xPos: -12.0, emissive: 0x0088ff },
    { xPos:  12.0, emissive: 0xff2266 }
  ].forEach(({ xPos, emissive }) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x060616, emissive, emissiveIntensity: 1.4 });
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


function updateModeHud() {
  if (modeEl) {
    modeEl.textContent = "Mode: " + getModeTuning().label;
  }
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (running) return;
    playMode = btn.dataset.mode || "solo";
    updateModeButtons();
    updateModeHud();
  });
});

updateModeButtons();
updateModeHud();

let score = 0;
let lives = getModeTuning().lives;
let best = readBestScore();
let speed = difficulty.startSpeed * getModeTuning().speedMult;
let distanceMeter = 0;
let spawnTimer = 0;
let spawnEvery = difficulty.spawnStart * getModeTuning().spawnMult;
let running = false;
let isStarting = false;
let hitCooldown = 0;
let speedStepTimer = 0;
let wavesCleared = 0;
let frameCount = 0;
lastMotionSpeed = speed;

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
  const zPos = -130;
  for (let lane = 0; lane < laneX.length; lane++) {
    if (lane === safeLane) continue;
    makeObstacle(lane, zPos);
  }
}

function resetGame() {
  const modeTuning = getModeTuning();
  score = 0;
  lives = modeTuning.lives;
  speed = difficulty.startSpeed * modeTuning.speedMult;
  distanceMeter = 0;
  spawnEvery = difficulty.spawnStart * modeTuning.spawnMult;
  spawnTimer = 0;
  speedStepTimer = 0;
  hitCooldown = 0;
  wavesCleared = 0;
  laneHintIndex = 0;
  frameCount = 0;
  quizActive = false;
  currentQuestion = null;
  nextQuizFrame = 300;
  quizItems.forEach(item => item.destroy());
  quizItems = [];
  currentLane = 1;
  playerRoot.position.x = laneX[currentLane];

  paused = false;
  if (pauseOverlay) pauseOverlay.classList.add("hidden");
  shakeTime = 0;
  shakeMag = 0;
  resetCombo();

  clearObstacles();

  hideQuizPrompt();
  updateHud();
}

function updateHud(displaySpeed = speed) {
  scoreEl.textContent = "Score: " + Math.floor(score);
  livesEl.textContent = "Lives: " + lives;
  speedEl.textContent = "Speed: " + (displaySpeed / 20).toFixed(1) + "x";
}

function takeHit() {
  const modeTuning = getModeTuning();
  if (hitCooldown > 0) return;
  hitCooldown = 0.6;
  lives -= 1;
  score = Math.max(0, score - difficulty.hitPenalty * modeTuning.hitPenaltyMult);
  resetCombo();
  sfxHit();
  shakeTime = 0.38;
  shakeMag = 1.4;
  updateHud();

  hitFlash.classList.remove("active");
  void hitFlash.offsetWidth;
  hitFlash.classList.add("active");

  if (lives <= 0) {
    running = false;
    if (score > best) {
      best = score;
      writeBestScore(best);
    }
    finalScoreEl.textContent = "Score: " + Math.floor(score);
    bestScoreEl.textContent = "Best: " + best;
    gameOverOverlay.classList.remove("hidden");
  }
}

function startRun() {
  if (running || isStarting) return;
  isStarting = true;
  try { getAudioCtx()?.resume(); } catch (_) {}
  resetGame();
  startOverlay.classList.add("hidden");
  gameOverOverlay.classList.add("hidden");
  runCountdown(() => {
    running = true;
    isStarting = false;
  });
}

function moveLeft() {
  if (!running || paused || currentLane === 0) return;
  currentLane -= 1;
  laneSwitchImpulse = -1;
  sfxLane();
}

function moveRight() {
  if (!running || paused || currentLane === laneX.length - 1) return;
  currentLane += 1;
  laneSwitchImpulse = 1;
  sfxLane();
}

document.addEventListener("keydown", (event) => {
  if (!running && !startOverlay.classList.contains("hidden") && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    startRun();
    return;
  }
  if (event.key === "Escape" || event.key === "p" || event.key === "P") { togglePause(); return; }
  if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") moveLeft();
  if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") moveRight();
});

let touchStartX = 0;
document.addEventListener("touchstart", (event) => {
  if (!event.touches || !event.touches[0]) return;
  touchStartX = event.touches[0].clientX;
}, { passive: true });

document.addEventListener("touchend", (event) => {
  if (!event.changedTouches || !event.changedTouches[0]) return;
  const dx = event.changedTouches[0].clientX - touchStartX;
  if (dx > 26) moveRight();
  if (dx < -26) moveLeft();
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
    mobileLeft.addEventListener("touchstart", (e) => { e.preventDefault(); moveLeft(); }, { passive: false });
    mobileLeft.addEventListener("click", moveLeft);
  }

  if (mobileRight) {
    mobileRight.addEventListener("touchstart", (e) => { e.preventDefault(); moveRight(); }, { passive: false });
    mobileRight.addEventListener("click", moveRight);
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
  const targetX = laneX[currentLane];
  const laneDelta = targetX - playerRoot.position.x;
  playerRoot.position.x += laneDelta * Math.min(1, dt * 22);
  if (Math.abs(laneDelta) < 0.02) {
    playerRoot.position.x = targetX;
  }

  laneSwitchImpulse *= Math.max(0, 1 - dt * 8);
  const laneTiltTarget = THREE.MathUtils.clamp((-laneDelta * 0.1) + laneSwitchImpulse * 0.16, -0.28, 0.28);
  playerRoot.rotation.z += (laneTiltTarget - playerRoot.rotation.z) * Math.min(1, dt * 14);

  const cameraTargetX = playerRoot.position.x * 0.16;
  camera.position.x += (cameraTargetX - camera.position.x) * Math.min(1, dt * 5);
  camera.lookAt(playerRoot.position.x * 0.12, 1, -30);

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

    motionSpeed = getEffectiveSpeed();
    lastMotionSpeed = motionSpeed;
    updateQuizItems(playerRoot.position.x, playerRoot.position.z);

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

    if (hitCooldown > 0) hitCooldown -= dt;

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const item = obstacles[i];
      item.mesh.position.z += motionSpeed * dt;
      item.mesh.rotation.x += dt * 1.7;
      item.mesh.rotation.y += dt * 2.2;

      if (!item.passed && item.mesh.position.z > playerRoot.position.z + 1.3) {
        item.passed = true;
        incrementCombo();
        sfxPass();
        score += difficulty.passPoints * modeTuning.scoreMult * comboMultiplier;
      }

      if (!quizActive) {
        const sameLane = item.lane === currentLane;
        const zClose = Math.abs(item.mesh.position.z - playerRoot.position.z) < 1.35;
        if (sameLane && zClose) {
          scene.remove(item.mesh);
          obstacles.splice(i, 1);
          takeHit();
          continue;
        }
      }

      if (item.mesh.position.z > 18) {
        if (item.passed) {
          wavesCleared += 1;
          if (wavesCleared % difficulty.waveBonusEvery === 0) {
            score += difficulty.waveBonus * modeTuning.scoreMult;
          }
        }
        scene.remove(item.mesh);
        obstacles.splice(i, 1);
      }
    }

    updateHud(motionSpeed);
  }

  renderer.render(scene, camera);
}

updateHud();
animate();
