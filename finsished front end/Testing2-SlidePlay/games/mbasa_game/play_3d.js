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
const topicEl = document.getElementById("topic");
const tuningEl = document.getElementById("tuning");
const finalScoreEl = document.getElementById("finalScore");
const bestScoreEl = document.getElementById("bestScore");
const hitFlash = document.getElementById("hitFlash");
const sourceInfo = document.getElementById("sourceInfo");
const quizPanel = document.getElementById("quizPanel");
const quizQuestionText = document.getElementById("quizQuestionText");
const quizFeedback = document.getElementById("quizFeedback");

const GENERATED_QUIZ_KEY = "slidePlayGeneratedQuizData";
const UPLOADED_FILES_KEY = "slidePlayUploadedFiles";

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

const storedQuizData = readJsonStorage(GENERATED_QUIZ_KEY, []);

function loadQuizQuestions() {
  if (Array.isArray(storedQuizData) && storedQuizData.length > 0) {
    return storedQuizData
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
  return [];
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
  const useUploadedSource = new URLSearchParams(window.location.search).get("source") === "upload";
  const shouldUseSlides = useUploadedSource || generatedQuiz.length > 0 || uploadedFiles.length > 0;
  let collisionLog = [];

  const terms = [];
  const laneHints = [];

  generatedQuiz.forEach((item) => {
    if (!item) return;
    terms.push(...extractTermsFromText(item.question));
    if (Array.isArray(item.options)) {
      item.options.forEach((opt) => terms.push(...extractTermsFromText(opt)));
    }
    if (typeof item.correct === "number") {
      laneHints.push(((item.correct % 3) + 3) % 3);
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

  const sourceName = String(storedQuizData[0]?.source || uploadedFiles[0]?.originalName || "").trim();
  const title = sourceName
    ? sourceName.replace(/\.[^.]+$/, "")
    : "Default Track";

  return {
    isSlideDriven: shouldUseSlides,
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
  }
];

let quizQuestions = loadQuizQuestions();
if (quizQuestions.length === 0) {
  quizQuestions = defaultQuizQuestions;
}

let quizActive = false;
let currentQuestion = null;
let quizItems = [];
let collisionLog = [];
let nextQuizFrame = 300; // Appear much sooner (was 450)
const QUIZ_INTERVAL = 400; // Appear more frequently (was 600)
const QUIZ_SLOW_DROP = 10; // Reduce speed by 10 units when answer blocks are near
const QUIZ_SLOW_MIN_SPEED = 10;
const QUIZ_SLOW_ACTIVATE = 0.58; // Start slowing when quiz blocks are visible and close
const QUIZ_SLOW_DURATION = 30; // Keep the slowdown active for 30 seconds
let quizSlowTimeRemaining = 0;

function shuffleArray(array) {
  return array
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}

function showQuizPrompt(question) {
  quizQuestionText.textContent = question.prompt;
  quizFeedback.textContent = 'Run into the correct block to answer.';
  quizPanel.classList.remove('hidden');
}

function hideQuizPrompt() {
  quizPanel.classList.add('hidden');
  quizFeedback.textContent = '';
}

function getEffectiveSpeed() {
  if (!quizActive || quizSlowTimeRemaining <= 0) return speed;

  return Math.max(QUIZ_SLOW_MIN_SPEED, speed - QUIZ_SLOW_DROP);
}

function createTextTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  
  // Background with better contrast
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Text settings - extremely large and intentionally oversized
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 600px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Add a thick, bright outline for maximum contrast
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 12;
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  
  // Double fill for brightness
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  
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
    
    const textTexture = createTextTexture(label);
    const material = new THREE.MeshStandardMaterial({
      map: textTexture,
      color: 0xffffff,
      roughness: 0.25,
      metalness: 0.4,
      emissive: 0x102f5d,
      emissiveIntensity: 1.2
    });
    
    // Slightly smaller blocks with oversized text
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.5, 2.2), material);
    this.mesh.position.set(laneX[lane], 1.6, -100);
    scene.add(this.mesh);
  }

  update() {
    this.progress += 0.002; // Slower movement for better readability
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
  const options = shuffleArray(question.options.slice());
  quizActive = true;
  currentQuestion = question;
  quizSlowTimeRemaining = QUIZ_SLOW_DURATION;
  quizItems.forEach(item => item.destroy());
  quizItems = options.map((option, lane) => new QuizItem(lane, option.text, option.correct));
  showQuizPrompt(question);
}

function finishQuiz(correct) {
  quizSlowTimeRemaining = 0;
  if(currentQuestion){
    const correctOption = currentQuestion.options.find(o=>o.correct);
    const hitOption = quizItems.find(item=>item.hit);
    collisionLog.push({
      prompt:currentQuestion.prompt,
      chosen:hitOption ? hitOption.label:'(missed)',
      correct:correctOption ? correctOption.text:'?',
      wasCorrect:correct
    });
  }


  quizActive = false;
  currentQuestion = null;
  quizItems.forEach(item => item.destroy());
  quizItems = [];
  hideQuizPrompt();
  quizFeedback.textContent = correct ? 'Correct! Nice choice.' : 'Wrong answer. Try again next time.';
  if (correct) {
    score += 25;
    updateHud();
  }
  setTimeout(() => {
    hideQuizPrompt();
  }, 1500);
  nextQuizFrame = frameCount + QUIZ_INTERVAL;
}

function updateQuizItems(playerLaneX, playerZ) {
  let closestDistance = Infinity;
  
  for (let i = quizItems.length - 1; i >= 0; i--) {
    const item = quizItems[i];
    item.update();
    
    // Track closest quiz block distance
    const distToBlock = Math.abs(item.mesh.position.z - playerZ);
    if (distToBlock < closestDistance) {
      closestDistance = distToBlock;
    }
    
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

  // Activate slowdown if blocks are within 1 second of travel
  if (quizActive && closestDistance < Infinity) {
    const timeToBlock = closestDistance / Math.max(speed, 1);
    if (timeToBlock <= 1.0) {
      quizSlowTimeRemaining = Math.max(quizSlowTimeRemaining, 1.5);
    }
  }

  if (quizActive && quizItems.length === 0) {
    finishQuiz(false);
  }
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070f);
scene.fog = new THREE.Fog(0x04070f, 30, 130);

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

const laneX = [-2.8, 0, 2.8];
let currentLane = 1;

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
  new THREE.PlaneGeometry(12, 260),
  new THREE.MeshStandardMaterial({ color: 0x111a2d, roughness: 0.86, metalness: 0.08 })
);
road.rotation.x = -Math.PI / 2;
road.position.set(0, 0, -65);
scene.add(road);

const leftBorder = new THREE.Mesh(
  new THREE.BoxGeometry(0.2, 0.15, 260),
  new THREE.MeshStandardMaterial({ color: 0x39ff14 })
);
leftBorder.position.set(-6.1, 0.08, -65);
scene.add(leftBorder);

const rightBorder = leftBorder.clone();
rightBorder.position.x = 6.1;
scene.add(rightBorder);

const roadMarks = [];
const markGeom = new THREE.BoxGeometry(0.18, 0.03, 3);
const markMat = new THREE.MeshStandardMaterial({ color: 0xe9f1ff, emissive: 0x223055 });
for (let i = 0; i < 28; i++) {
  const z = -8 - i * 9;
  const leftMark = new THREE.Mesh(markGeom, markMat);
  const rightMark = new THREE.Mesh(markGeom, markMat);
  leftMark.position.set(-2.0, 0.05, z);
  rightMark.position.set(2.0, 0.05, z);
  scene.add(leftMark);
  scene.add(rightMark);
  roadMarks.push(leftMark, rightMark);
}

const obstacleColors = [0xff5f62, 0x5fb4ff, 0xffb45f, 0xa86bff, 0x42e8c2];
const obstacles = [];

const runnerProfile = buildRunnerProfile();
const difficulty = buildDifficultySettings(runnerProfile);
let laneHintIndex = 0;
let termIndex = 0;

if (topicEl) {
  topicEl.textContent = runnerProfile.isSlideDriven
    ? "Source: " + runnerProfile.title + " | " + difficulty.label
    : "Source: built-in track";
}

if (sourceInfo) {
  sourceInfo.textContent = runnerProfile.isSlideDriven
    ? "Track generated from your slide quiz data (" + runnerProfile.questionCount + " questions). Difficulty: " + difficulty.label + "."
    : "No uploaded slide data found. Running default challenge track.";
}

if (tuningEl) {
  tuningEl.textContent = "Tuning "
    + difficulty.label
    + " | spawn " + difficulty.spawnStart.toFixed(2) + "->" + difficulty.spawnMin.toFixed(2)
    + " | accel +" + difficulty.accelStep.toFixed(2) + "/" + difficulty.accelEvery.toFixed(1) + "s"
    + " | hit -" + difficulty.hitPenalty;
}

let score = 0;
let lives = 3;
let best = readBestScore();
let speed = difficulty.startSpeed;
let distanceMeter = 0;
let spawnTimer = 0;
let spawnEvery = difficulty.spawnStart;
let running = false;
let hitCooldown = 0;
let speedStepTimer = 0;
let wavesCleared = 0;
let frameCount = 0;

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
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.6, 1.7), mat);
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
  score = 0;
  lives = 3;
  speed = difficulty.startSpeed;
  distanceMeter = 0;
  spawnEvery = difficulty.spawnStart;
  spawnTimer = 0;
  speedStepTimer = 0;
  hitCooldown = 0;
  wavesCleared = 0;
  laneHintIndex = 0;
  frameCount = 0;
  quizActive = false;
  currentQuestion = null;
  collisionLog = [];
  nextQuizFrame = 450;
  quizItems.forEach(item => item.destroy());
  quizItems = [];
  currentLane = 1;
  playerRoot.position.x = laneX[currentLane];

  while (obstacles.length) {
    scene.remove(obstacles[0].mesh);
    obstacles.shift();
  }

  hideQuizPrompt();
  updateHud();
}

function updateHud(displaySpeed = speed) {
  scoreEl.textContent = "Score: " + Math.floor(score);
  livesEl.textContent = "Lives: " + lives;
  speedEl.textContent = "Speed: " + (displaySpeed / 20).toFixed(1) + "x";
}

function takeHit() {
  if (hitCooldown > 0) return;
  hitCooldown = 0.6;
  lives -= 1;
  score = Math.max(0, score - difficulty.hitPenalty);
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

    const resultsList = document.getElementById('resultsList');
    const resultsSummary = document.getElementById('resultsSummary');
if (resultsList) {
        resultsList.innerHTML = '';
        collisionLog.forEach((entry, i) => {
          const div = document.createElement('div');
          div.className = 'result-entry ' + (entry.wasCorrect ? 'result-correct' : 'result-wrong');
          div.innerHTML = `
            <span>${entry.wasCorrect ? '✅' : '❌'} Q${i + 1}: ${entry.prompt}</span>
            <span class="result-answer">Hit: <strong>${entry.chosen}</strong>${entry.wasCorrect ? '' : ` — correct: <strong>${entry.correct}</strong>`}</span>`;
          resultsList.appendChild(div);
        });
        const total = collisionLog.length;
        const correctCount = collisionLog.filter((e) => e.wasCorrect).length;
        if (resultsSummary) {
          resultsSummary.textContent = total > 0
            ? `${correctCount}/${total} correct`
            : 'No quiz questions reached.';
        }
      }

    gameOverOverlay.classList.remove("hidden");
  }
}

function startRun() {
  resetGame();
  startOverlay.classList.add("hidden");
  gameOverOverlay.classList.add("hidden");
  running = true;
}

function moveLeft() {
  if (!running || currentLane === 0) return;
  currentLane -= 1;
}

function moveRight() {
  if (!running || currentLane === laneX.length - 1) return;
  currentLane += 1;
}

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") moveLeft();
  if (event.key === "ArrowRight") moveRight();
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
  restartBtn.addEventListener("click", () => {
    localStorage.removeItem("slidePlayGeneratedQuizData");
    window.location.href = "pdf-quiz.html";
  });
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

  if (mixer) mixer.update(dt);

  const targetX = laneX[currentLane];
  playerRoot.position.x += (targetX - playerRoot.position.x) * Math.min(1, dt * 16);

  let motionSpeed = speed;

  if (running) {
    frameCount += 1;

    speedStepTimer += dt;
    spawnTimer += dt;

    if (speedStepTimer >= difficulty.accelEvery) {
      speedStepTimer = 0;
      speed = Math.min(difficulty.maxSpeed, speed + difficulty.accelStep);
      spawnEvery = Math.max(difficulty.spawnMin, spawnEvery - difficulty.spawnStep);
    }

    if (spawnTimer >= spawnEvery) {
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
    updateQuizItems(playerRoot.position.x, playerRoot.position.z);

    roadMarks.forEach((m) => {
      m.position.z += motionSpeed * dt;
      if (m.position.z > 12) m.position.z = -240;
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
        score += difficulty.passPoints;
      }

      const sameLane = item.lane === currentLane;
      const zClose = Math.abs(item.mesh.position.z - playerRoot.position.z) < 1.35;
      if (sameLane && zClose) {
        scene.remove(item.mesh);
        obstacles.splice(i, 1);
        takeHit();
        continue;
      }

      if (item.mesh.position.z > 18) {
        if (item.passed) {
          wavesCleared += 1;
          if (wavesCleared % difficulty.waveBonusEvery === 0) {
            score += difficulty.waveBonus;
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
