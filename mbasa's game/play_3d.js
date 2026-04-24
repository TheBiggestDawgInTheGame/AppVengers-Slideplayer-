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

const GENERATED_QUIZ_KEY = "slidePlayGeneratedQuizData";
const UPLOADED_FILES_KEY = "slidePlayUploadedFiles";

function readBestScore() {
  try {
    return Number(localStorage.getItem("runner3dBest") || 0);
  } catch (_error) {
    return 0;
  }
}

function writeBestScore(value) {
  try {
    localStorage.setItem("runner3dBest", String(value));
  } catch (_error) {
    // Ignore storage failures (private mode / blocked storage).
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

  const title = uploadedFiles[0] && uploadedFiles[0].originalName
    ? String(uploadedFiles[0].originalName).replace(/\.[^.]+$/, "")
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
  currentLane = 1;
  playerRoot.position.x = laneX[currentLane];

  while (obstacles.length) {
    scene.remove(obstacles[0].mesh);
    obstacles.shift();
  }

  updateHud();
}

function updateHud() {
  scoreEl.textContent = "Score: " + Math.floor(score);
  livesEl.textContent = "Lives: " + lives;
  speedEl.textContent = "Speed: " + (speed / 20).toFixed(1) + "x";
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
    resetGame();
    gameOverOverlay.classList.add("hidden");
    running = true;
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

  roadMarks.forEach((m) => {
    m.position.z += speed * dt;
    if (m.position.z > 12) m.position.z = -240;
  });

  if (running) {
    distanceMeter += speed * dt;
    while (distanceMeter >= difficulty.distanceStep) {
      distanceMeter -= difficulty.distanceStep;
      score += 1;
    }

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

    if (hitCooldown > 0) hitCooldown -= dt;

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const item = obstacles[i];
      item.mesh.position.z += speed * dt;
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

    updateHud();
  }

  renderer.render(scene, camera);
}

updateHud();
animate();
