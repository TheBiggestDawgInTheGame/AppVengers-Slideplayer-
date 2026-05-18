/* ═══════════════════════════════════════════════════════════
   3D ESCAPE ROOM - GAME STATE & CORE LOGIC
═══════════════════════════════════════════════════════════ */

const G = {
  inv: [],
  solved: new Set(),
  secs: 600,
  tick: null,
  over: false,
  paused: false,
  startTime: null,
  kpVal: '',
  level: 1,
  maxLevels: 3,
  roomStartTime: 0,
  totalElapsedTime: 0,
  completedLevels: [],
  checkpoint: null,
  checkpointPenaltySec: 45,
};

const PLAY_STYLE_KEY = 'slidePlayPlayStyle';
const PLAY_PLAYERS_KEY = 'slidePlayPlayers';
let selectedPlayMode = 'solo'; // only: solo | multiplayer
const MP_SERVER_KEY = 'escape3dMpServer';
const MP_ROOM_KEY = 'escape3dMpRoom';
const MP_NAME_KEY = 'escape3dMpName';
const multiplayerState = {
  ws: null,
  connected: false,
  playerId: null,
  roomId: null,
  name: null,
  remotePlayers: {}, // id -> {group, model, targetX, targetY, targetZ, targetRotY}
  lastSendAt: 0,
};

/* ═══════════════════════════════════════════════════════════
   ROOM DEFINITIONS - Progressive Difficulty
═══════════════════════════════════════════════════════════ */

const ROOMS = {
  1: {
    name: 'Room 14B — Mzansi High',
    subtitle: 'Level 1: The Classroom',
    timeLimit: 600,
    difficulty: 'Easy',
    lockCount: 2,
    description: 'Begin in die klaskamer. Solve die basic puzzles to earn your vryheid (freedom).',
    npc: { name: 'Mr. Nkosi', greeting: 'Sawubona, learner. Sharp sharp — ten minutes to get out.' },
    theme: 'classroom'
  },
  2: {
    name: 'Room 15A — Mzansi High',
    subtitle: 'Level 2: The Archive',
    timeLimit: 480,
    difficulty: 'Medium',
    lockCount: 3,
    description: "You're through! But wait... Room 15A awaits. Eish, this one is harder, neh.",
    npc: { name: 'Mr. Nkosi', greeting: 'Yoh! You made it through. But Room 15A? Sharp — eight minutes, learner.' },
    theme: 'archive'
  },
  3: {
    name: 'Room 15B — Mzansi High',
    subtitle: 'Level 3: The Vault',
    timeLimit: 420,
    difficulty: 'Hard',
    lockCount: 3,
    description: 'The final test. Room 15B holds the last secrets. Hayibo — can you make it?',
    npc: { name: 'Mr. Nkosi', greeting: 'Hawu! The vault door... Room 15B. Seven minutes. Lekker luck, sharp sharp!' },
    theme: 'vault'
  }
};

/* ═══════════════════════════════════════════════════════════
   SYNTHESIZED SFX ENGINE (Web Audio API)
   No audio files needed — all sounds generated in real-time
═══════════════════════════════════════════════════════════ */

const SFX = (function() {
  let ctx = null;
  let sfxVolume = 0.7;       // 0-1, controlled by SFX slider
  let ambientSource = null;   // ambient hum loop
  let tickSource = null;      // urgency ticking loop
  let tickGain = null;

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function vol(v) { return v * sfxVolume; }

  // ── Core helpers ──────────────────────────────────────

  function playTone(freq, duration, type, volume, ramp) {
    var c = getCtx();
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol(volume || 0.3), c.currentTime);
    if (ramp !== false) gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + duration);
  }

  function playNoise(duration, volume, filterFreq, filterType) {
    var c = getCtx();
    var bufferSize = c.sampleRate * duration;
    var buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource();
    src.buffer = buffer;
    var filter = c.createBiquadFilter();
    filter.type = filterType || 'lowpass';
    filter.frequency.value = filterFreq || 800;
    var gain = c.createGain();
    gain.gain.setValueAtTime(vol(volume || 0.15), c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    src.start();
  }

  // ── Sound Effects ─────────────────────────────────────

  function puzzleSolve() {
    // Ascending chime: C5 → E5 → G5
    var c = getCtx();
    playTone(523, 0.2, 'sine', 0.35);
    setTimeout(function() { playTone(659, 0.2, 'sine', 0.35); }, 120);
    setTimeout(function() { playTone(784, 0.4, 'sine', 0.4); }, 240);
  }

  function wrongAnswer() {
    // Two low buzzes
    playTone(150, 0.15, 'square', 0.2);
    setTimeout(function() { playTone(130, 0.25, 'square', 0.2); }, 180);
  }

  function doorUnlock() {
    // Metallic click + latch
    playNoise(0.08, 0.4, 3000, 'bandpass');
    setTimeout(function() { playTone(1200, 0.06, 'square', 0.25); }, 60);
    setTimeout(function() { playNoise(0.12, 0.3, 2000, 'bandpass'); }, 100);
  }

  function doorOpen() {
    // Low creak — sweeping sine
    var c = getCtx();
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, c.currentTime);
    osc.frequency.linearRampToValueAtTime(200, c.currentTime + 0.8);
    osc.frequency.linearRampToValueAtTime(60, c.currentTime + 1.5);
    gain.gain.setValueAtTime(vol(0.15), c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1.5);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 1.5);
    // Add metallic resonance
    playNoise(1.2, 0.08, 600, 'bandpass');
  }

  function victory() {
    // Fanfare: ascending arpeggio C5-E5-G5-C6
    var notes = [523, 659, 784, 1047];
    notes.forEach(function(freq, i) {
      setTimeout(function() { playTone(freq, 0.3, 'sine', 0.3); }, i * 180);
    });
    // Shimmer
    setTimeout(function() { playTone(1047, 0.8, 'triangle', 0.2); }, 750);
  }

  function failure() {
    // Low ominous drone descending
    var c = getCtx();
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, c.currentTime);
    osc.frequency.linearRampToValueAtTime(40, c.currentTime + 3);
    gain.gain.setValueAtTime(vol(0.2), c.currentTime);
    gain.gain.linearRampToValueAtTime(vol(0.3), c.currentTime + 1);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 3);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 3);
    // Sub-bass
    playTone(35, 3, 'sine', 0.25);
    // Noise rumble
    playNoise(2.5, 0.1, 200, 'lowpass');
  }

  function pickup() {
    // Quick bright pluck
    playTone(880, 0.12, 'triangle', 0.3);
    setTimeout(function() { playTone(1320, 0.08, 'sine', 0.2); }, 50);
  }

  function gmSpeak() {
    // Subtle intercom crackle + tone
    playNoise(0.1, 0.12, 4000, 'highpass');
    setTimeout(function() { playTone(440, 0.15, 'sine', 0.12); }, 80);
  }

  function hintUsed() {
    // Soft descending whisper tone
    playTone(600, 0.15, 'sine', 0.2);
    setTimeout(function() { playTone(400, 0.2, 'sine', 0.15); }, 100);
    playNoise(0.25, 0.06, 1500, 'highpass');
  }

  function keyFound() {
    // Jingly metallic
    playTone(1800, 0.08, 'sine', 0.2);
    setTimeout(function() { playTone(2200, 0.06, 'sine', 0.2); }, 60);
    setTimeout(function() { playTone(2600, 0.1, 'sine', 0.25); }, 120);
    playNoise(0.05, 0.15, 5000, 'bandpass');
  }

  function envReact() {
    // Electric flicker buzz
    playNoise(0.15, 0.15, 2500, 'bandpass');
    setTimeout(function() { playNoise(0.08, 0.1, 3000, 'bandpass'); }, 200);
  }

  function introLock() {
    // Heavy lock clicking shut
    playNoise(0.06, 0.35, 2000, 'bandpass');
    setTimeout(function() { playTone(180, 0.15, 'square', 0.15); }, 80);
    setTimeout(function() { playNoise(0.1, 0.25, 1500, 'bandpass'); }, 120);
  }

  // ── Ambient Room Hum (loop) ───────────────────────────

  function startAmbient() {
    if (ambientSource) return;
    var c = getCtx();
    // Gentle low hum (fluorescent light buzz)
    var osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 120; // 120Hz mains hum
    var osc2 = c.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 240; // harmonic
    var gain = c.createGain();
    gain.gain.value = vol(0.025);
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc2.start();
    ambientSource = { osc: osc, osc2: osc2, gain: gain };
  }

  function stopAmbient() {
    if (!ambientSource) return;
    try {
      ambientSource.osc.stop();
      ambientSource.osc2.stop();
    } catch(e) {}
    ambientSource = null;
  }

  // ── Urgency Ticking (for timer ≤ 60s) ────────────────

  function startTicking(fast) {
    stopTicking();
    var c = getCtx();
    // Use a repeating click pattern via ScriptProcessor or scheduled tones
    var interval = fast ? 250 : 600; // ms between ticks
    var doTick = function() {
      if (!tickGain) return;
      playTone(800, 0.03, 'sine', fast ? 0.25 : 0.15);
      playNoise(0.02, fast ? 0.1 : 0.06, 5000, 'highpass');
    };
    tickGain = { active: true };
    tickSource = setInterval(doTick, interval);
    doTick(); // first tick immediately
  }

  function stopTicking() {
    if (tickSource) { clearInterval(tickSource); tickSource = null; }
    tickGain = null;
  }

  // ── Volume Control ────────────────────────────────────

  function setVolume(v) {
    sfxVolume = Math.max(0, Math.min(1, v));
    // Update ambient volume if playing
    if (ambientSource && ambientSource.gain) {
      ambientSource.gain.gain.value = vol(0.025);
    }
  }

  return {
    puzzleSolve: puzzleSolve,
    wrongAnswer: wrongAnswer,
    doorUnlock: doorUnlock,
    doorOpen: doorOpen,
    victory: victory,
    failure: failure,
    pickup: pickup,
    gmSpeak: gmSpeak,
    hintUsed: hintUsed,
    keyFound: keyFound,
    envReact: envReact,
    introLock: introLock,
    startAmbient: startAmbient,
    stopAmbient: stopAmbient,
    startTicking: startTicking,
    stopTicking: stopTicking,
    setVolume: setVolume
  };
})();

/* ═══════════════════════════════════════════════════════════
   PUZZLE RANDOMIZATION — generates new values each playthrough
═══════════════════════════════════════════════════════════ */
const PUZZLE = (function generatePuzzle() {
  function safeParse(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed == null ? fallback : parsed;
    } catch (_error) {
      return fallback;
    }
  }

  function hashText(text) {
    const src = String(text || '');
    let hash = 0;
    for (let i = 0; i < src.length; i += 1) {
      hash = ((hash << 5) - hash + src.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) || 1;
  }

  function createSeededRandom(seedValue) {
    let seed = seedValue % 2147483647;
    if (seed <= 0) seed += 2147483646;
    return function next() {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  const useUploadedSource = new URLSearchParams(window.location.search).get('source') === 'upload';
  const quizData = safeParse('slidePlayGeneratedQuizData', []);
  const uploadedFiles = safeParse('slidePlayUploadedFiles', []);
  const demoSession = safeParse('slidePlayDemoSession', null);

  const sourceTextParts = [];
  if (demoSession && demoSession.title) sourceTextParts.push(demoSession.title);
  if (Array.isArray(uploadedFiles)) {
    uploadedFiles.slice(0, 4).forEach(function (f) {
      if (f && f.originalName) sourceTextParts.push(f.originalName);
    });
  }
  if (Array.isArray(quizData)) {
    quizData.slice(0, 8).forEach(function (q) {
      if (q && q.question) sourceTextParts.push(q.question);
    });
  }

  const sourceHash = hashText(sourceTextParts.join('|'));
  const rng = (useUploadedSource && sourceTextParts.length > 0)
    ? createSeededRandom(sourceHash)
    : Math.random;

  function randInt(min, max) {
    return min + Math.floor(rng() * (max - min + 1));
  }

  const clockHour = randInt(1, 12);
  const clockMinute = 5 * randInt(1, 11);
  const clockSum = clockHour + clockMinute;

  const a1 = randInt(2, 8);
  const b1 = randInt(3, 10);
  const eq1 = a1 * b1;
  const a2 = randInt(2, 10);
  const b2 = randInt(2, 10);
  const eq2 = a2 + b2;
  const boardSum = eq1 + eq2;

  const doorCode = String(clockSum) + String(boardSum);
  const rthCode = randInt(100, 999);

  const colorPool = ['RED', 'GREEN', 'BLUE', 'YELLOW', 'PURPLE'];
  const colorSeq = [];
  const pool = colorPool.slice();
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(rng() * pool.length);
    colorSeq.push(pool.splice(idx, 1)[0]);
  }

  const decoyDigits = [randInt(0, 9), randInt(0, 9), randInt(0, 9), randInt(0, 9)];
  const decoyWarnings = [
    'Looks convincing, but this trail is false.',
    'This code keeps showing up for a reason: to distract you.',
    'A planted clue from a previous run. Ignore it.',
    'Not every number in this room belongs to the door.'
  ];
  const decoyMessage = decoyWarnings[sourceHash % decoyWarnings.length];

  return {
    clockHour, clockMinute, clockSum,
    a1, b1, eq1, a2, b2, eq2, boardSum,
    doorCode, rthCode, colorSeq,
    sourceHash,
    decoySequence: decoyDigits.join(' - '),
    decoyMessage,
    clockTimeStr: clockHour + ':' + String(clockMinute).padStart(2, '0'),
    colorArrow: colorSeq.join(' → ')
  };
})();

// Three.js scene setup
let scene, camera, renderer, controls;
let player;
let isThirdPerson = true;
const playerConfig = {
  height: 1.6,
  radius: 0.35,
  cameraDistance: 3.5,
  cameraHeight: 1.6,
  firstPersonOffsetZ: 0.1
};
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const interactiveObjects = []; // Objects that can be clicked

// GLTF model loader
let playerModel = null;
let cachedStudentModel = null; // kept for teacher backward compat
const MODEL_PATH = 'models/casual-denim-layered-look/source/model.glb';
const pendingStudents = []; // queue students until models are cached

// Multiple character models — each used at most twice for students
const CHARACTER_MODELS = [
  'models/casual-denim-layered-look/source/model.glb',       // 0 - player + teacher
  'models/casual-confidence-in-denim/source/model.glb',      // 1
  'models/casual-denim-look/source/model.glb',               // 2
  'models/linen-suited-professional/source/model.glb',       // 3
  'models/student-with-backpack-and-notebook/source/model.glb', // 4
  'models/two-tone-raglan-portrait/source/model.glb',        // 5
  'models/2pac/source/2PAC.fbx'                              // 6 - FBX format
];
const cachedModels = {};    // modelIndex -> { scene, minY } (raw, unpositioned)
let modelsLoaded = 0;
const TOTAL_MODELS = CHARACTER_MODELS.length;

// Collision obstacles: array of { x, z, hw, hd } (center, half-width, half-depth)
const collisionBoxes = [];

// NPC models array — avoids scene.traverse() every frame
const studentModels = [];

// Reusable vectors — avoid per-frame allocations
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _newPos = new THREE.Vector3();
const _slideX = new THREE.Vector3();
const _slideZ = new THREE.Vector3();
const _tmpVec3 = new THREE.Vector3();

// Frame throttle counters
let _frameCount = 0;
const GLOW_INTERVAL = 6;    // update distance glow every 6 frames (~10fps at 60fps)
const MINIMAP_INTERVAL = 10; // update minimap every 10 frames (~6fps)

// Cached DOM references (set once in startGamePlay)
let _domHint = null;
let _domCrosshair = null;
let _domMinimap = null;
let _domMinimapCtx = null;

// Walking animation state
let walkTime = 0;
let isWalking = false;

// Delta-time & smooth movement
const gameClock = new THREE.Clock();
let velocity = new THREE.Vector3();
const MOVE_ACCEL = 1.5;   // acceleration factor (snappy ramp-up)
const MOVE_DECEL = 0.82;  // deceleration (friction) per frame
const BASE_SPEED = 9.0;   // units per second (delta-time based)
let idleTime = 0;         // breathing / idle sway timer

// Check if all character models are loaded, then spawn queued students
function checkAllModelsLoaded() {
  // Update loading bar
  var fillEl = document.getElementById('loading-bar-fill');
  if (fillEl) fillEl.style.width = Math.round((modelsLoaded / TOTAL_MODELS) * 100) + '%';

  if (modelsLoaded >= TOTAL_MODELS) {
    console.log('All character models loaded, spawning queued students');
    // Hide loading bar
    var barContainer = document.getElementById('loading-bar-container');
    if (barContainer) barContainer.style.display = 'none';
    // Fill in fallbacks for any models that failed before model 0 was ready
    for (var i = 0; i < TOTAL_MODELS; i++) {
      if (!cachedModels[i] && cachedModels[0]) cachedModels[i] = cachedModels[0];
    }
    pendingStudents.forEach(function(s) { s(); });
    pendingStudents.length = 0;
  }
}

/* ═══════════════════════════════════════════════════════════
   INIT SCENE & RENDERER
═══════════════════════════════════════════════════════════ */

function initScene() {
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2520);
  scene.fog = new THREE.Fog(0x2a2520, 25, 70);

  // Camera rig attached to the player character
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );

  // Player group (model will be loaded into this)
  player = new THREE.Group();
  player.position.set(0, 0, 8); // start further from desk, near door/window wall
  scene.add(player);

  // Load the GLTF character model for the player
  const loader = new THREE.GLTFLoader();
  var fbxLoader = (typeof THREE.FBXLoader !== 'undefined') ? new THREE.FBXLoader() : null;

  // Start loading ALL models in parallel (player + NPCs simultaneously)
  CHARACTER_MODELS.forEach(function(path, idx) {
    if (idx === 0) return; // player model loaded separately below
    var isFBX = path.toLowerCase().endsWith('.fbx');

    function processModel(m) {
      if (isFBX) {
        m.scale.set(0.01, 0.01, 0.01);
      } else {
        m.scale.set(1, 1, 1);
      }
      m.position.set(0, 0, 0);
      m.rotation.set(0, 0, 0);
      m.updateMatrixWorld(true);
      var b = new THREE.Box3().setFromObject(m);
      m.traverse(function(child) {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material && child.material.map) {
            child.material.map.encoding = THREE.sRGBEncoding;
          }
        }
      });
      var cloned;
      if (typeof THREE.SkeletonUtils !== 'undefined') {
        cloned = THREE.SkeletonUtils.clone(m);
      } else {
        cloned = m.clone();
      }
      cachedModels[idx] = { scene: cloned, minY: b.min.y, isFBX: isFBX };
      console.log('Loaded character model', idx, isFBX ? '(FBX)' : '(GLB)');
      modelsLoaded++;
      checkAllModelsLoaded();
    }

    function onError(err) {
      console.error('Failed to load model', idx, path, err);
      // Defer fallback — model 0 might not be loaded yet
      modelsLoaded++;
      checkAllModelsLoaded();
    }

    if (isFBX && fbxLoader) {
      fbxLoader.load(path, processModel, undefined, onError);
    } else {
      loader.load(path, function(g) { processModel(g.scene); }, undefined, onError);
    }
  });

  // Load player model (also in parallel with above)
  loader.load(MODEL_PATH, function(gltf) {
    playerModel = gltf.scene;
    playerModel.scale.set(1.2, 1.2, 1.2);
    playerModel.rotation.y = Math.PI;

    // Calculate bounding box to place feet on the floor
    const box = new THREE.Box3().setFromObject(playerModel);
    const modelHeight = box.max.y - box.min.y;
    // Shift model up so the bottom (feet) sits at y=0 (box already includes scale)
    playerModel.position.set(0, -box.min.y, 0);
    console.log('Model bounds:', box.min.y, box.max.y, 'height:', modelHeight);

    playerModel.traverse(function(child) {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    player.add(playerModel);

    // Cache model 0 (same as player) for teacher
    cachedStudentModel = playerModel.clone();
    var rawClone0 = gltf.scene.clone();
    rawClone0.scale.set(1, 1, 1);
    rawClone0.position.set(0, 0, 0);
    var rawBox0 = new THREE.Box3().setFromObject(rawClone0);
    cachedModels[0] = { scene: rawClone0, minY: rawBox0.min.y };

    // Store view meshes for first/third person toggle
    player.userData.viewMeshes = [playerModel];

    modelsLoaded++;
    checkAllModelsLoaded();

    // Name label above player
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256;
    labelCanvas.height = 64;
    const ctx = labelCanvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#ffd868';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('You', 128, 42);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const labelMat = new THREE.SpriteMaterial({ map: labelTexture, transparent: true });
    const playerLabel = new THREE.Sprite(labelMat);
    playerLabel.scale.set(1.4, 0.35, 1);
    playerLabel.position.set(0, 2.2, 0);
    player.add(playerLabel);
    player.userData.viewMeshes.push(playerLabel);

    setPlayerViewMode(isThirdPerson);
    console.log('Player model loaded successfully');
  }, undefined, function(error) {
    console.error('Error loading player model:', error);
    // Fallback: create a simple placeholder
    const fallbackGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.6, 16);
    const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x1e90ff });
    const fallback = new THREE.Mesh(fallbackGeo, fallbackMat);
    fallback.position.set(0, 0.8, 0);
    fallback.castShadow = true;
    player.add(fallback);
    player.userData.viewMeshes = [fallback];
  });
  camera.position.set(0, playerConfig.cameraHeight, playerConfig.cameraDistance);
  player.add(camera);
  setPlayerViewMode(isThirdPerson);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.getElementById('canvas-container').appendChild(renderer.domElement);

  const viewButton = document.getElementById('view-toggle');
  if (viewButton) {
    viewButton.addEventListener('click', toggleViewMode);
  }

  // Lighting — warm, realistic classroom with natural window light
  const ambientLight = new THREE.AmbientLight(0xfff5ee, 0.35);
  scene.add(ambientLight);

  // Strong overhead warm light (fluorescent ceiling feel)
  const directionalLight = new THREE.DirectionalLight(0xfff4e6, 0.5);
  directionalLight.position.set(3, 10, 2);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 1024;
  directionalLight.shadow.mapSize.height = 1024;
  directionalLight.shadow.camera.far = 50;
  directionalLight.shadow.camera.left = -20;
  directionalLight.shadow.camera.right = 20;
  directionalLight.shadow.camera.top = 20;
  directionalLight.shadow.camera.bottom = -20;
  directionalLight.shadow.bias = -0.0005;
  directionalLight.shadow.radius = 3;
  directionalLight.shadow.normalBias = 0.02;
  scene.add(directionalLight);

  // Fill light from window side (left wall) — cool daylight
  const fillLight = new THREE.DirectionalLight(0xaabbdd, 0.3);
  fillLight.position.set(-10, 6, 0);
  scene.add(fillLight);

  // Hemisphere light — warm ground bounce
  const hemiLight = new THREE.HemisphereLight(0x99aacc, 0x665544, 0.3);
  scene.add(hemiLight);

  // Rim light from back to give depth to characters
  const rimLight = new THREE.DirectionalLight(0xffeedd, 0.15);
  rimLight.position.set(0, 4, -14);
  scene.add(rimLight);

  // Simple mouse look controls
  setupMouseLook();

  // Create classroom geometry
  createClassroom();

  // Mouse click for interaction
  document.addEventListener('click', onMouseClick);
  window.addEventListener('resize', onWindowResize);
}

/* ═══════════════════════════════════════════════════════════
   CREATE CLASSROOM ENVIRONMENT
═══════════════════════════════════════════════════════════ */

function createClassroom() {
  // Book colors for realistic variety
  const bookColors = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181, 0xa8d8ea, 0xc1666b, 0xd4a373];

  // Floor — dark worn wood
  const floorGeo = new THREE.BoxGeometry(20, 1, 30);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.85, metalness: 0.0 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(0, -0.5, 0);
  floor.receiveShadow = true;
  scene.add(floor);

  // Ceiling — dark stained panels
  const ceilCv = document.createElement('canvas');
  ceilCv.width = 1024; ceilCv.height = 1024;
  const ceilCtx = ceilCv.getContext('2d');
  ceilCtx.fillStyle = '#3d3530';
  ceilCtx.fillRect(0, 0, 1024, 1024);
  ceilCtx.strokeStyle = '#2a2420';
  ceilCtx.lineWidth = 3;
  for (let gi = 0; gi <= 8; gi++) {
    ceilCtx.beginPath(); ceilCtx.moveTo(gi * 128, 0); ceilCtx.lineTo(gi * 128, 1024); ceilCtx.stroke();
    ceilCtx.beginPath(); ceilCtx.moveTo(0, gi * 128); ceilCtx.lineTo(1024, gi * 128); ceilCtx.stroke();
  }
  const ceilTex = new THREE.CanvasTexture(ceilCv);
  ceilTex.wrapS = THREE.RepeatWrapping; ceilTex.wrapT = THREE.RepeatWrapping;
  ceilTex.repeat.set(2, 3);
  const ceilingGeo = new THREE.BoxGeometry(20, 0.3, 30);
  const ceilingMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.95, metalness: 0.0 });
  const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
  ceiling.position.set(0, 3.15, 0);
  scene.add(ceiling);

  // Brick wall material (canvas-drawn brick texture)
  const brickCv = document.createElement('canvas');
  brickCv.width = 512; brickCv.height = 512;
  const bctx = brickCv.getContext('2d');
  // Mortar base
  bctx.fillStyle = '#4a4038';
  bctx.fillRect(0, 0, 512, 512);
  // Draw brick rows
  const brickH = 32, mortarW = 4;
  const brickColors = ['#8b4513','#7a3b10','#6b3410','#9c5224','#7e4218','#6a3a15'];
  for (let row = 0; row < 16; row++) {
    const offset = (row % 2 === 0) ? 0 : 64;
    for (let col = -1; col < 5; col++) {
      const bx = offset + col * 128 + mortarW / 2;
      const by = row * brickH + mortarW / 2;
      const bw = 128 - mortarW;
      const bh = brickH - mortarW;
      bctx.fillStyle = brickColors[Math.floor(Math.random() * brickColors.length)];
      bctx.fillRect(bx, by, bw, bh);
      // Subtle shade variation
      bctx.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.15) + ')';
      bctx.fillRect(bx, by, bw, bh);
    }
  }
  const brickTex = new THREE.CanvasTexture(brickCv);
  brickTex.wrapS = THREE.RepeatWrapping; brickTex.wrapT = THREE.RepeatWrapping;
  brickTex.encoding = THREE.sRGBEncoding;
  // Different repeat for different wall orientations
  const brickMatFB = new THREE.MeshStandardMaterial({ map: brickTex.clone(), roughness: 0.85, metalness: 0.0 });
  brickMatFB.map.repeat.set(5, 2);
  brickMatFB.map.wrapS = THREE.RepeatWrapping; brickMatFB.map.wrapT = THREE.RepeatWrapping;
  const brickMatLR = new THREE.MeshStandardMaterial({ map: brickTex.clone(), roughness: 0.85, metalness: 0.0 });
  brickMatLR.map.repeat.set(7, 2);
  brickMatLR.map.wrapS = THREE.RepeatWrapping; brickMatLR.map.wrapT = THREE.RepeatWrapping;
  const woodPanelMat = brickMatLR; // alias for existing references
  const woodPanelDarkMat = new THREE.MeshStandardMaterial({ color: 0x5a3520, roughness: 0.7 });

  // Back wall (whiteboard wall) — warm orange/wood
  const backWallGeo = new THREE.BoxGeometry(20, 4, 0.4);
  const backWall = new THREE.Mesh(backWallGeo, brickMatFB);
  backWall.position.set(0, 1.5, -14.7);
  backWall.receiveShadow = true;
  scene.add(backWall);

  // Front wall (door wall) — wood panel
  const frontWallGeo = new THREE.BoxGeometry(20, 4, 0.4);
  const frontWall = new THREE.Mesh(frontWallGeo, brickMatFB);
  frontWall.position.set(0, 1.5, 14.7);
  frontWall.receiveShadow = true;
  scene.add(frontWall);

  // Left wall (window wall) — wood panel
  const leftWallGeo = new THREE.BoxGeometry(0.4, 4, 30);
  const leftWall = new THREE.Mesh(leftWallGeo, woodPanelMat);
  leftWall.position.set(-9.8, 1.5, 0);
  leftWall.receiveShadow = true;
  scene.add(leftWall);

  // Right wall — wood panel
  const rightWallGeo = new THREE.BoxGeometry(0.4, 4, 30);
  const rightWall = new THREE.Mesh(rightWallGeo, woodPanelMat);
  rightWall.position.set(9.8, 1.5, 0);
  rightWall.receiveShadow = true;
  scene.add(rightWall);

  // ═══════════════════════════════════════════════════════════
  // MUTED ACCENT STRIPS ON WALLS (subtle against brick)
  // ═══════════════════════════════════════════════════════════

  // Baseboards — dark wood trim
  const baseboardMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.6 });
  const bbFront = new THREE.Mesh(new THREE.BoxGeometry(20, 0.15, 0.1), baseboardMat);
  bbFront.position.set(0, 0.075, 14.5); scene.add(bbFront);
  const bbBack = new THREE.Mesh(new THREE.BoxGeometry(20, 0.15, 0.1), baseboardMat);
  bbBack.position.set(0, 0.075, -14.5); scene.add(bbBack);
  const bbLeft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 30), baseboardMat);
  bbLeft.position.set(-9.6, 0.075, 0); scene.add(bbLeft);
  const bbRight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 30), baseboardMat);
  bbRight.position.set(9.6, 0.075, 0); scene.add(bbRight);

  // WHITEBOARD — large, white with aluminum frame (replacing chalkboard)
  const boardGeo = new THREE.BoxGeometry(7, 3, 0.12);
  const wbCanvas = document.createElement('canvas');
  wbCanvas.width = 1024;
  wbCanvas.height = 440;
  const wbCtx = wbCanvas.getContext('2d');
  wbCtx.fillStyle = '#fafafa';
  wbCtx.fillRect(0, 0, 1024, 440);
  // Dry-erase writing — uses randomized puzzle values
  wbCtx.fillStyle = '#2244bb';
  wbCtx.font = 'bold 36px Arial';
  wbCtx.fillText(PUZZLE.a1 + ' × ' + PUZZLE.b1 + ' = ?', 60, 70);
  wbCtx.fillText(PUZZLE.a2 + ' + ' + PUZZLE.b2 + ' = ?', 60, 140);
  wbCtx.fillStyle = '#cc2222';
  wbCtx.font = 'bold 28px Arial';
  wbCtx.fillText('→ E = P ~', 60, 220);
  wbCtx.fillStyle = '#228833';
  wbCtx.font = '22px Arial';
  wbCtx.fillText('Vandag: Wiskundige Legkaart \u2014 Klas 14B', 60, 310);
  const boardTexture = new THREE.CanvasTexture(wbCanvas);
  const boardMat = new THREE.MeshStandardMaterial({ map: boardTexture, roughness: 0.15, metalness: 0.05 });
  const board = new THREE.Mesh(boardGeo, boardMat);
  board.position.set(0, 2.0, -14.5);
  board.castShadow = true;
  scene.add(board);
  registerInteractive(board, 'board');
  // Aluminum frame
  const wbFrameMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.6, roughness: 0.3 });
  const wbfT = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.06, 0.15), wbFrameMat);
  wbfT.position.set(0, 3.52, -14.45); scene.add(wbfT);
  const wbfB = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.06, 0.15), wbFrameMat);
  wbfB.position.set(0, 0.48, -14.45); scene.add(wbfB);
  const wbfL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.1, 0.15), wbFrameMat);
  wbfL.position.set(-3.57, 2.0, -14.45); scene.add(wbfL);
  const wbfR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.1, 0.15), wbFrameMat);
  wbfR.position.set(3.57, 2.0, -14.45); scene.add(wbfR);
  // Marker tray at bottom
  const markerTray = new THREE.Mesh(new THREE.BoxGeometry(3, 0.06, 0.15),
    new THREE.MeshStandardMaterial({ color: 0xe0e0e0, metalness: 0.3, roughness: 0.4 }));
  markerTray.position.set(0, 0.5, -14.38); scene.add(markerTray);
  // Markers on tray
  const markerColors = [0x2244bb, 0xcc2222, 0x228833, 0x111111];
  markerColors.forEach(function(mc, mi) {
    const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8),
      new THREE.MeshStandardMaterial({ color: mc, roughness: 0.4 }));
    marker.position.set(-0.4 + mi * 0.25, 0.56, -14.35);
    marker.rotation.z = Math.PI / 2;
    scene.add(marker);
  });

  // PROJECTOR above whiteboard
  const projBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.3 }));
  projBody.position.set(0, 3.0, -13.5); scene.add(projBody);
  const projMount = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8),
    new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5 }));
  projMount.position.set(0, 3.15, -13.5); scene.add(projMount);

  // WALL CLOCK — round
  const clockGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 32);
  const clockMat = new THREE.MeshStandardMaterial({ color: 0xf5e6b8, emissive: 0x332200, roughness: 0.4, metalness: 0.2 });
  const clockFrame = new THREE.Mesh(clockGeo, clockMat);
  clockFrame.position.set(5, 2.8, -14.4);
  clockFrame.rotation.x = Math.PI / 2;
  clockFrame.castShadow = true;
  scene.add(clockFrame);
  registerInteractive(clockFrame, 'clock');

  // ═══════════════════════════════════════════════════════════
  // TEACHER'S DESK — Realistic with drawers and office chair
  // ═══════════════════════════════════════════════════════════
  const teacherDeskGroup = new THREE.Group();
  teacherDeskGroup.position.set(5.5, 0, -13);
  teacherDeskGroup.rotation.y = Math.PI;
  scene.add(teacherDeskGroup);

  const deskWoodMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.5, metalness: 0.05 });
  const deskDarkMat = new THREE.MeshStandardMaterial({ color: 0x4a2e14, roughness: 0.55 });

  // Desktop surface
  const tdSurface = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 1.3), deskWoodMat);
  tdSurface.position.y = 0.76;
  tdSurface.castShadow = true;
  tdSurface.receiveShadow = true;
  teacherDeskGroup.add(tdSurface);

  // Front modesty panel
  const tdFront = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.7, 0.05), deskDarkMat);
  tdFront.position.set(0, 0.38, -0.6);
  tdFront.castShadow = true;
  teacherDeskGroup.add(tdFront);

  // Side panels
  const tdLeft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 1.15), deskDarkMat);
  tdLeft.position.set(-1.25, 0.38, 0);
  teacherDeskGroup.add(tdLeft);
  const tdRight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 1.15), deskDarkMat);
  tdRight.position.set(1.25, 0.38, 0);
  teacherDeskGroup.add(tdRight);

  // Right drawer stack (3 drawers)
  const drawerMat = new THREE.MeshStandardMaterial({ color: 0x5a3518, roughness: 0.5 });
  const handleMetalMat = new THREE.MeshStandardMaterial({ color: 0xd4a843, metalness: 0.7, roughness: 0.3 });
  for (let di = 0; di < 3; di++) {
    const dr = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 1.05), drawerMat);
    dr.position.set(0.9, 0.15 + di * 0.22, 0);
    teacherDeskGroup.add(dr);
    const dh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), handleMetalMat);
    dh.position.set(0.9, 0.15 + di * 0.22, -0.55);
    teacherDeskGroup.add(dh);
  }

  // Left deep drawer
  const lDrawer = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 1.05), drawerMat);
  lDrawer.position.set(-0.9, 0.28, 0);
  teacherDeskGroup.add(lDrawer);
  const lHandle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), handleMetalMat);
  lHandle.position.set(-0.9, 0.28, -0.55);
  teacherDeskGroup.add(lHandle);

  const teacherDesk = tdSurface;
  addCollisionBox(5.5, -13, 1.4, 0.75);

  // Teacher's office chair (behind desk, between desk and wall)
  const tChairGroup = new THREE.Group();
  tChairGroup.position.set(5.5, 0, -14);
  tChairGroup.rotation.y = Math.PI;
  scene.add(tChairGroup);
  const chairBlackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
  const chairMetalMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.5, roughness: 0.3 });
  const tcSeat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.5), chairBlackMat);
  tcSeat.position.y = 0.5;
  tChairGroup.add(tcSeat);
  const tcBack = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.06), chairBlackMat);
  tcBack.position.set(0, 0.8, 0.24);
  tChairGroup.add(tcBack);
  const tcPost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 8), chairMetalMat);
  tcPost.position.y = 0.28;
  tChairGroup.add(tcPost);
  for (let ci = 0; ci < 5; ci++) {
    const ang = ci * Math.PI * 2 / 5;
    const bLeg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.28), chairMetalMat);
    bLeg.position.set(Math.sin(ang) * 0.14, 0.04, Math.cos(ang) * 0.14);
    bLeg.rotation.y = ang;
    tChairGroup.add(bLeg);
    const casterWheel = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), chairBlackMat);
    casterWheel.position.set(Math.sin(ang) * 0.28, 0.025, Math.cos(ang) * 0.28);
    tChairGroup.add(casterWheel);
  }
  addCollisionBox(5.5, -14, 0.4, 0.4);

  // Teacher character sitting at desk (beside whiteboard, facing class)
  (function createTeacher() {
    const teacherGroup = new THREE.Group();
    teacherGroup.position.set(5.5, 0, -13.8);
    teacherGroup.rotation.y = Math.PI;
    scene.add(teacherGroup);

    const tLabelCanvas = document.createElement('canvas');
    tLabelCanvas.width = 256;
    tLabelCanvas.height = 64;
    const tCtx = tLabelCanvas.getContext('2d');
    tCtx.fillStyle = 'rgba(20,20,20,0.85)';
    tCtx.fillRect(0, 0, 256, 64);
    tCtx.font = 'bold 22px Arial';
    tCtx.fillStyle = '#ff9900';
    tCtx.textAlign = 'center';
    tCtx.fillText('Mr. Nkosi', 128, 38);
    const tLabelTex = new THREE.CanvasTexture(tLabelCanvas);
    const tLabelMat = new THREE.SpriteMaterial({ map: tLabelTex, transparent: true });
    const tLabel = new THREE.Sprite(tLabelMat);
    tLabel.scale.set(1.6, 0.4, 1);
    tLabel.position.set(0, 1.6, 0);
    teacherGroup.add(tLabel);

    function spawnTeacherModel() {
      var cached = cachedModels[0];
      var tModel;
      var cloneFn = (typeof THREE.SkeletonUtils !== 'undefined') ? THREE.SkeletonUtils.clone : function(m) { return m.clone(); };
      if (cached) {
        tModel = cloneFn(cached.scene);
        tModel.scale.set(1.15, 1.15, 1.15);
        tModel.rotation.y = Math.PI;
        tModel.position.set(0, -cached.minY * 1.15 - 0.35, 0);
      } else {
        tModel = cloneFn(cachedStudentModel);
        tModel.scale.set(1.15, 1.15, 1.15);
        tModel.position.set(0, -0.35, 0);
      }
      tModel.traverse(function(child) {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          registerInteractive(child, 'teacher');
        }
      });
      teacherGroup.add(tModel);
    }

    if (cachedStudentModel) {
      spawnTeacherModel();
    } else {
      pendingStudents.push(spawnTeacherModel);
    }
  })();

  // RTH MACHINE — computer on teacher desk
  const rthGeo = new THREE.BoxGeometry(0.6, 0.5, 0.5);
  const rthMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.3 });
  const rth = new THREE.Mesh(rthGeo, rthMat);
  rth.position.set(6.2, 1.04, -12.8);
  rth.castShadow = true;
  scene.add(rth);
  registerInteractive(rth, 'rth');

  // Monitor screen
  const screenGeo = new THREE.BoxGeometry(0.55, 0.4, 0.04);
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x001a00, emissiveIntensity: 0.5 });
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.position.set(6.2, 1.32, -12.56);
  scene.add(screen);
  const monStand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.4 }));
  monStand.position.set(6.2, 1.16, -12.58);
  scene.add(monStand);
  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 }));
  keyboard.position.set(6.2, 0.8, -12.5);
  scene.add(keyboard);

  // SKULL — rounded
  const skullGeo = new THREE.SphereGeometry(0.22, 24, 24);
  const skullMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.4 });
  const skull = new THREE.Mesh(skullGeo, skullMat);
  skull.position.set(4.7, 1.0, -13);
  skull.castShadow = true;
  scene.add(skull);
  registerInteractive(skull, 'skull');

  // GLOBE — sphere on a stand
  const globeGeo = new THREE.SphereGeometry(0.28, 32, 32);
  const globeMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.5, metalness: 0.1 });
  const globe = new THREE.Mesh(globeGeo, globeMat);
  globe.position.set(5.7, 1.12, -13.3);
  globe.castShadow = true;
  scene.add(globe);
  const standGeo = new THREE.CylinderGeometry(0.03, 0.06, 0.3, 12);
  const standMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, metalness: 0.3 });
  const stand = new THREE.Mesh(standGeo, standMat);
  stand.position.set(5.7, 0.92, -13.3);
  scene.add(stand);
  registerInteractive(globe, 'globe_l');

  // Pencil holder on desk
  const cupGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.18, 12);
  const cupMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.6 });
  const cup = new THREE.Mesh(cupGeo, cupMat);
  cup.position.set(5.1, 0.88, -13.3);
  cup.castShadow = true;
  scene.add(cup);

  // Pencils in cup
  for (let pi = 0; pi < 5; pi++) {
    const pencilGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6);
    const pencilMat = new THREE.MeshLambertMaterial({
      color: [0xff0000, 0x0000ff, 0xffff00, 0x00ff00, 0xff8800][pi]
    });
    const pencil = new THREE.Mesh(pencilGeo, pencilMat);
    pencil.position.set(
      5.1 + Math.cos(pi / 5 * Math.PI * 2) * 0.04,
      1.0,
      -13.3 + Math.sin(pi / 5 * Math.PI * 2) * 0.04
    );
    pencil.rotation.z = (Math.random() - 0.5) * 0.2;
    scene.add(pencil);
  }

  // Stack of grading papers
  const paperGeo = new THREE.BoxGeometry(0.35, 0.02, 0.25);
  const paperMat = new THREE.MeshLambertMaterial({ color: 0xFFFFF0 });
  for (let pi = 0; pi < 6; pi++) {
    const paper = new THREE.Mesh(paperGeo, paperMat);
    paper.position.set(5.2 + (Math.random() - 0.5) * 0.03, 0.79 + pi * 0.022, -12.7);
    paper.rotation.y = (Math.random() - 0.5) * 0.15;
    paper.castShadow = true;
    scene.add(paper);
  }

  // Apple on teacher's desk
  const appleGeo = new THREE.SphereGeometry(0.12, 16, 16);
  const appleMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.4 });
  const apple = new THREE.Mesh(appleGeo, appleMat);
  apple.position.set(4.5, 0.91, -13);
  apple.castShadow = true;
  scene.add(apple);
  const appleStem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.06, 4),
    new THREE.MeshLambertMaterial({ color: 0x4a2e14 }));
  appleStem.position.set(4.5, 1.05, -13);
  scene.add(appleStem);

  // ═══════════════════════════════════════════════════════════
  // LONG SHARED TABLES WITH COLORFUL SIDE PANELS & CHAIRS
  // (matching reference: 2 rows of long tables, colorful panels)
  // ═══════════════════════════════════════════════════════════
  const chairColors = [0xe74c3c, 0xf1c40f, 0x27ae60, 0xff6b35, 0x3498db, 0x9b59b6];
  const panelColors = [0xe74c3c, 0xf1c40f, 0x3498db, 0x27ae60, 0xff6b35, 0x9b59b6];
  let chairColorIdx = 0;

  const createSharedTable = (x, z, tableWidth, seats) => {
    const tGroup = new THREE.Group();
    tGroup.position.set(x, 0, z);
    scene.add(tGroup);

    const hw = tableWidth / 2;
    const hd = 0.6;

    // Table surface — light wood
    const surfGeo = new THREE.BoxGeometry(tableWidth, 0.05, 1.2);
    const surfMat = new THREE.MeshStandardMaterial({ color: 0xd4a76a, roughness: 0.5 });
    const surf = new THREE.Mesh(surfGeo, surfMat);
    surf.position.y = 0.72;
    surf.castShadow = true; surf.receiveShadow = true;
    tGroup.add(surf);

    // Table legs — black metal
    const tLegGeo = new THREE.BoxGeometry(0.06, 0.7, 0.06);
    const tLegMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.4, roughness: 0.5 });
    for (let lx = -1; lx <= 1; lx += 2) {
      for (let lz = -1; lz <= 1; lz += 2) {
        const tLeg = new THREE.Mesh(tLegGeo, tLegMat);
        tLeg.position.set(lx * (hw - 0.15), 0.35, lz * 0.5);
        tLeg.castShadow = true;
        tGroup.add(tLeg);
      }
    }

    // Side support bars
    const barGeo = new THREE.BoxGeometry(tableWidth - 0.3, 0.04, 0.04);
    const barMesh = new THREE.Mesh(barGeo, tLegMat);
    barMesh.position.set(0, 0.15, 0.5);
    tGroup.add(barMesh);
    const barMesh2 = new THREE.Mesh(barGeo, tLegMat);
    barMesh2.position.set(0, 0.15, -0.5);
    tGroup.add(barMesh2);

    // Colorful front & back panels (like reference)
    const panelH = 0.45;
    const panelGeo = new THREE.PlaneGeometry(tableWidth - 0.1, panelH);
    const fPanelColor = panelColors[Math.floor(Math.random() * panelColors.length)];
    const bPanelColor = panelColors[Math.floor(Math.random() * panelColors.length)];
    const fPanel = new THREE.Mesh(panelGeo,
      new THREE.MeshStandardMaterial({ color: fPanelColor, roughness: 0.5 }));
    fPanel.position.set(0, 0.48, -0.6);
    tGroup.add(fPanel);
    const bPanel = new THREE.Mesh(panelGeo,
      new THREE.MeshStandardMaterial({ color: bPanelColor, roughness: 0.5 }));
    bPanel.position.set(0, 0.48, 0.6);
    bPanel.rotation.y = Math.PI;
    tGroup.add(bPanel);

    // Under-table shelf
    const shelfGeo = new THREE.BoxGeometry(tableWidth - 0.3, 0.03, 0.9);
    const shelfMesh = new THREE.Mesh(shelfGeo,
      new THREE.MeshLambertMaterial({ color: 0xb8904f }));
    shelfMesh.position.set(0, 0.32, 0);
    tGroup.add(shelfMesh);

    addCollisionBox(x, z, hw + 0.1, hd + 0.3);

    // Chairs — one per seat, colorful
    for (let si = 0; si < seats; si++) {
      const cx = -hw + 0.5 + si * (tableWidth / seats);
      const cColor = chairColors[chairColorIdx % chairColors.length];
      chairColorIdx++;

      const cGrp = new THREE.Group();
      cGrp.position.set(cx, 0, 1.1);
      tGroup.add(cGrp);

      const cMat = new THREE.MeshStandardMaterial({ color: cColor, roughness: 0.5, metalness: 0.05 });
      // Seat
      const cSeat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.38), cMat);
      cSeat.position.y = 0.44;
      cSeat.castShadow = true;
      cGrp.add(cSeat);
      // Back
      const cBack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.32, 0.04), cMat);
      cBack.position.set(0, 0.64, 0.17);
      cBack.castShadow = true;
      cGrp.add(cBack);
      // Metal legs
      const clGeo = new THREE.BoxGeometry(0.03, 0.44, 0.03);
      for (let ci = -1; ci <= 1; ci += 2) {
        for (let cj = -1; cj <= 1; cj += 2) {
          const cl = new THREE.Mesh(clGeo, tLegMat);
          cl.position.set(ci * 0.16, 0.22, cj * 0.14);
          cGrp.add(cl);
        }
      }
    }

    // Random items on table
    for (let si = 0; si < seats; si++) {
      const ix = -hw + 0.5 + si * (tableWidth / seats);
      if (Math.random() > 0.35) {
        const nb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.2),
          new THREE.MeshLambertMaterial({ color: chairColors[Math.floor(Math.random() * chairColors.length)] }));
        nb.position.set(ix, 0.76, (Math.random() - 0.5) * 0.4);
        nb.rotation.y = (Math.random() - 0.5) * 0.5;
        tGroup.add(nb);
      }
      if (Math.random() > 0.7) {
        const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 6),
          new THREE.MeshLambertMaterial({ color: 0xf1c40f }));
        pen.position.set(ix + 0.1, 0.76, (Math.random() - 0.5) * 0.3);
        pen.rotation.z = Math.PI / 2;
        tGroup.add(pen);
      }
    }
  };

  function createStudent(x, z, name, itemKey, shirtColor, hairColor, facingAngle, modelIndex) {
    const studentGroup = new THREE.Group();

    // Name label above student
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256;
    labelCanvas.height = 64;
    const ctx = labelCanvas.getContext('2d');
    ctx.fillStyle = 'rgba(20,20,20,0.85)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.font = '22px Arial';
    ctx.fillStyle = '#ffd868';
    ctx.textAlign = 'center';
    ctx.fillText(name, 128, 38);
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    labelTex.needsUpdate = true;
    const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true });
    const label = new THREE.Sprite(labelMat);
    label.scale.set(1.4, 0.35, 1);
    label.position.set(0, 2.0, 0);
    studentGroup.add(label);

    studentGroup.position.set(x, 0, z);
    // Face a specific direction (or random if not specified)
    studentGroup.rotation.y = (facingAngle !== undefined) ? facingAngle : Math.PI + (Math.random() - 0.5) * 0.4;
    scene.add(studentGroup);
    // Collision box for student body
    addCollisionBox(x, z, 0.4, 0.4);

    // Slight scale variation per student (0.88 – 1.05)
    const s = 0.88 + (name.charCodeAt(0) % 10) * 0.02;
    const mIdx = (modelIndex !== undefined) ? modelIndex : 0;

    function spawnModel() {
      var cached = cachedModels[mIdx] || cachedModels[0];
      var sourceModel = cached ? cached.scene : cachedStudentModel;
      // Use SkeletonUtils.clone for proper skinned mesh cloning (FBX models)
      var model;
      if (typeof THREE.SkeletonUtils !== 'undefined') {
        model = THREE.SkeletonUtils.clone(sourceModel);
      } else {
        model = sourceModel.clone();
      }
      model.scale.set(s, s, s);
      model.rotation.y = Math.PI;
      // Compute Y offset so feet sit exactly on the floor at this scale
      if (cached) {
        model.position.set(0, -cached.minY * s, 0);
      } else {
        model.position.set(0, 0, 0);
      }
      model.traverse(function(child) {
        if (child.isMesh) {
          child.castShadow = false;   // NPC shadows disabled for performance
          child.receiveShadow = true;
          registerInteractive(child, itemKey);
        }
      });
      // Tag for idle sway animation in animate loop
      model.userData.isStudentModel = true;
      model.userData.baseRotY = model.rotation.y;
      model.userData.basePosY = model.position.y;
      model.userData.swayOffset = name.charCodeAt(0) * 0.7; // unique offset per student
      studentModels.push(model); // direct reference for fast per-frame sway
      studentGroup.add(model);
    }

    if (modelsLoaded >= TOTAL_MODELS) {
      spawnModel();
    } else {
      pendingStudents.push(spawnModel);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // SHARED TABLES LAYOUT — 4 rows of 2 long tables
  // ═══════════════════════════════════════════════════════════

  // Row 1 (back, z=-11): two long tables
  createSharedTable(-4.5, -11, 5.5, 4);
  createSharedTable(4.5, -11, 5.5, 4);

  // Row 2 (z=-7): two long tables
  createSharedTable(-4.5, -7, 5.5, 4);
  createSharedTable(4.5, -7, 5.5, 4);

  // Row 3 (z=-3): two long tables
  createSharedTable(-4.5, -3, 5.5, 4);
  createSharedTable(4.5, -3, 5.5, 4);

  // Students — in pairs, facing each other in conversation
  // Each pair uses a different character model (models 1-5, each used exactly twice)

  // PAIR 1: Amahle & Sipho — left side, near row 2 tables (by windows)
  createStudent(-8, -6.5, 'Amahle', 'student_mia', 0x4a86e8, 0x2f2f2f, -Math.PI * 0.35, 1);
  createStudent(-8, -7.9, 'Sipho', 'student_tate', 0xe86b4a, 0x2b2b2b, Math.PI * 0.35, 2);

  // PAIR 2: Kagiso & Naledi — right side, near row 1 tables
  createStudent(8, -10.5, 'Kagiso', 'student_omar', 0xd484e8, 0x1f1f1f, Math.PI * 0.35, 3);
  createStudent(8, -11.9, 'Naledi', 'student_nia', 0xe8c54a, 0x1a1a1a, -Math.PI * 0.35, 4);

  // PAIR 3: Zinhle & Thabo — left side, near row 3 tables (by windows) — model 6 (2pac)
  createStudent(-7.5, -2.5, 'Zinhle', 'student_lina', 0x6be842, 0x3d2b1f, -Math.PI * 0.5 + 0.2, 6);
  createStudent(-7.5, -3.9, 'Thabo', 'student_alex', 0x8b4513, 0x8b4513, -Math.PI * 0.5 - 0.2, 6);

  // PAIR 4: Lethabo & Mpho — left side of whiteboard (back wall)
  createStudent(-5.5, -13.2, 'Lethabo', 'student_jordan', 0x4169e1, 0x000000, -Math.PI * 0.5 + 0.2, 3);
  createStudent(-4.3, -13.2, 'Mpho', 'student_sam', 0xff69b4, 0xffd700, -Math.PI * 0.5 - 0.2, 5);

  // PAIR 5: Asanda & Jabulani — front area near door (right side)
  createStudent(5, 9, 'Asanda', 'student_riley', 0x32cd32, 0xff4500, Math.PI + 0.3, 2);
  createStudent(6.2, 9, 'Jabulani', 'student_casey', 0x9370db, 0xffffff, Math.PI - 0.3, 4);

  // ═══════════════════════════════════════════════════════════
  // BOOKSHELF — Low, open, colorful (like reference)
  // ═══════════════════════════════════════════════════════════
  const bsGroup = new THREE.Group();
  bsGroup.position.set(8.8, 0, -10);
  scene.add(bsGroup);
  // Main frame — green/teal
  const bsFrameMat = new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.5 });
  const bsSide1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 1.2), bsFrameMat);
  bsSide1.position.set(-0.8, 0.6, 0); bsGroup.add(bsSide1);
  const bsSide2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 1.2), bsFrameMat);
  bsSide2.position.set(0.8, 0.6, 0); bsGroup.add(bsSide2);
  const bsTop = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 1.2), bsFrameMat);
  bsTop.position.set(0, 1.2, 0); bsGroup.add(bsTop);
  const bsMid = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.04, 1.15), bsFrameMat);
  bsMid.position.set(0, 0.6, 0); bsGroup.add(bsMid);
  const bsBack = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.04),
    new THREE.MeshLambertMaterial({ color: 0x3498db }));
  bsBack.position.set(0, 0.6, 0.58); bsGroup.add(bsBack);
  // Books
  for (let bi = 0; bi < 12; bi++) {
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18 + Math.random() * 0.08, 0.08),
      new THREE.MeshLambertMaterial({ color: bookColors[bi % bookColors.length] }));
    bk.position.set(-0.6 + (bi % 6) * 0.2, bi < 6 ? 0.25 : 0.85, (Math.random() - 0.5) * 0.3);
    bk.rotation.y = (Math.random() - 0.5) * 0.1;
    bsGroup.add(bk);
  }
  const bookshelf = bsTop; // reference for interactive highlight
  registerInteractive(bsTop, 'shelf');
  addCollisionBox(8.8, -10, 1.0, 0.8);

  // DOOR — wooden with frame and handle
  const doorGeo = new THREE.BoxGeometry(1.2, 2.2, 0.12);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.5, metalness: 0.05 });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(-8, 1.1, 14.5);
  door.castShadow = true;
  scene.add(door);
  // Door frame
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.4 });
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.2), frameMat);
  frameTop.position.set(-8, 2.25, 14.5); scene.add(frameTop);
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.2), frameMat);
  frameL.position.set(-8.63, 1.1, 14.5); scene.add(frameL);
  const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.2), frameMat);
  frameR.position.set(-7.37, 1.1, 14.5); scene.add(frameR);
  // Door handle
  const handleGeo = new THREE.SphereGeometry(0.06, 12, 12);
  const handleMat = new THREE.MeshStandardMaterial({ color: 0xd4a843, metalness: 0.8, roughness: 0.2 });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.set(-7.55, 1.0, 14.55); scene.add(handle);
  registerInteractive(door, 'door');
  addCollisionBox(-8, 14.5, 0.9, 0.3); // door area
  doorMeshRef = door; // store reference for door open animation

  // EXIT sign above door (green, glowing)
  (function() {
    const ec = document.createElement('canvas');
    ec.width = 256; ec.height = 64;
    const ectx = ec.getContext('2d');
    ectx.fillStyle = '#006622';
    ectx.fillRect(0, 0, 256, 64);
    ectx.strokeStyle = '#ffffff';
    ectx.lineWidth = 3;
    ectx.strokeRect(4, 4, 248, 56);
    ectx.fillStyle = '#ffffff';
    ectx.font = 'bold 40px Arial';
    ectx.textAlign = 'center';
    ectx.textBaseline = 'middle';
    ectx.fillText('EXIT \u2192', 128, 34);
    const eTex = new THREE.CanvasTexture(ec);
    const eMat = new THREE.MeshStandardMaterial({ map: eTex, emissive: 0x004400, emissiveIntensity: 0.6, roughness: 0.5 });
    const eMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.25), eMat);
    eMesh.position.set(-8, 2.5, 14.45);
    eMesh.rotation.y = Math.PI;
    scene.add(eMesh);
    const exitGlow = new THREE.PointLight(0x00ff44, 0.3, 3);
    exitGlow.position.set(-8, 2.5, 14.2);
    scene.add(exitGlow);
  })();

  // ═══════════════════════════════════════════════════════════
  // TALL WINDOWS ON LEFT WALL — dark frames, multi-pane (like reference)
  // ═══════════════════════════════════════════════════════════
  const wFrameMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.2 });
  const wGlassMat = new THREE.MeshStandardMaterial({
    color: 0xc8e8ff, emissive: 0x4488aa, emissiveIntensity: 0.25,
    transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0.1
  });

  function createTallWindow(wz) {
    const wGroup = new THREE.Group();
    wGroup.position.set(-9.55, 0, wz);
    wGroup.rotation.y = Math.PI / 2;
    scene.add(wGroup);

    const winW = 2.8, winH = 2.6;
    const hW = winW / 2, hH = winH / 2;
    const yCtr = 1.5;

    // Outer frame
    var ft = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.2, 0.1, 0.12), wFrameMat);
    ft.position.set(0, yCtr + hH, 0); wGroup.add(ft);
    var fb = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.2, 0.1, 0.12), wFrameMat);
    fb.position.set(0, yCtr - hH, 0); wGroup.add(fb);
    var fl = new THREE.Mesh(new THREE.BoxGeometry(0.1, winH + 0.2, 0.12), wFrameMat);
    fl.position.set(-hW, yCtr, 0); wGroup.add(fl);
    var fr = new THREE.Mesh(new THREE.BoxGeometry(0.1, winH + 0.2, 0.12), wFrameMat);
    fr.position.set(hW, yCtr, 0); wGroup.add(fr);

    // Mullions (dividers) — 2 vertical + 1 horizontal
    var mv1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, winH, 0.08), wFrameMat);
    mv1.position.set(-winW / 6, yCtr, 0); wGroup.add(mv1);
    var mv2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, winH, 0.08), wFrameMat);
    mv2.position.set(winW / 6, yCtr, 0); wGroup.add(mv2);
    var mh = new THREE.Mesh(new THREE.BoxGeometry(winW, 0.05, 0.08), wFrameMat);
    mh.position.set(0, yCtr, 0); wGroup.add(mh);

    // Glass panes (6 panes: 3 top + 3 bottom)
    const pW = winW / 3 - 0.08, pH = winH / 2 - 0.06;
    for (let px = -1; px <= 1; px++) {
      for (let py = -1; py <= 1; py += 2) {
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(pW, pH), wGlassMat);
        pane.position.set(px * (winW / 3), yCtr + py * (winH / 4), 0.02);
        wGroup.add(pane);
      }
    }

    // Window sill
    const sill = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.3, 0.06, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.6 }));
    sill.position.set(0, yCtr - hH - 0.03, 0.08);
    wGroup.add(sill);

    // Light from window — dim moonlight / overcast feel
    const wLight = new THREE.PointLight(0x8899bb, 0.25, 10);
    wLight.position.set(-9.2, 1.8, wz);
    scene.add(wLight);
  }

  createTallWindow(-8);
  createTallWindow(-2);
  createTallWindow(4);
  createTallWindow(10);

  // Window on front wall (smaller, existing interactive)
  const window_ = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01),
    new THREE.MeshBasicMaterial({ visible: false }));
  window_.position.set(-9.5, 1.5, -2);
  scene.add(window_);
  registerInteractive(window_, 'window');

  // WORLD MAP — right wall (moved from left wall which now has windows)
  const mapGeo = new THREE.PlaneGeometry(3, 2);
  const mapMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.7 });
  const map = new THREE.Mesh(mapGeo, mapMat);
  map.position.set(9.58, 1.8, -5);
  map.rotation.y = -Math.PI / 2;
  scene.add(map);
  registerInteractive(map, 'map');

  // CANDLE - somewhere on a shelf - Minecraft style
  const candleGeo = new THREE.BoxGeometry(0.16, 0.3, 0.16);
  const candleMat = new THREE.MeshLambertMaterial({ color: 0xfffacd, emissive: 0xffdd00 });
  const candle = new THREE.Mesh(candleGeo, candleMat);
  candle.position.set(0.5, 0.94, 1.4);
  candle.castShadow = true;
  scene.add(candle);
  registerInteractive(candle, 'candle');

  // Candle glow light
  const candleLight = new THREE.PointLight(0xffaa00, 0.8, 5);
  candleLight.position.copy(candle.position);
  scene.add(candleLight);

  // ═══════════════════════════════════════════════════════════
  // ADDITIONAL CLASSROOM FURNITURE
  // ═══════════════════════════════════════════════════════════

  // File cabinet - back left corner
  const fileCabGeo = new THREE.BoxGeometry(0.6, 1.2, 0.5);
  const fileCabMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.3, roughness: 0.5 });
  const fileCab = new THREE.Mesh(fileCabGeo, fileCabMat);
  fileCab.position.set(-8, 0.6, -12);
  fileCab.castShadow = true;
  fileCab.receiveShadow = true;
  scene.add(fileCab);
  addCollisionBox(-8, -12, 0.5, 0.4);

  // Cabinet drawers
  for (let i = 0; i < 3; i++) {
    const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.2 }));
    drawer.position.set(-8, 0.4 + i * 0.35, -11.76);
    scene.add(drawer);
    const dh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.5 }));
    dh.position.set(-8, 0.4 + i * 0.35, -11.72);
    scene.add(dh);
  }

  // TV/Monitor on a stand (like reference - near whiteboard)
  const tvStand = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5 }));
  tvStand.position.set(-8, 0.6, -13.5); scene.add(tvStand);
  const tvScreen = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 }));
  tvScreen.position.set(-8, 1.6, -13.5); scene.add(tvScreen);
  addCollisionBox(-8, -13.5, 0.5, 0.4);

  // Speaker on wall (near TV, like reference)
  const speaker = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }));
  speaker.position.set(-5.5, 2.8, -14.5); scene.add(speaker);

  // Storage cabinet - right wall (colored)
  const storageCabGeo = new THREE.BoxGeometry(1.2, 1.0, 0.7);
  const storageCab = new THREE.Mesh(storageCabGeo,
    new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.5 }));
  storageCab.position.set(8.5, 0.5, 5);
  storageCab.castShadow = true;
  scene.add(storageCab);
  addCollisionBox(8.5, 5, 0.8, 0.5);

  // Colorful supply bins on top
  const binColors = [0xe74c3c, 0xf1c40f, 0x3498db, 0x27ae60];
  binColors.forEach(function(bc, bi) {
    const bin = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.25),
      new THREE.MeshStandardMaterial({ color: bc, roughness: 0.5 }));
    bin.position.set(8.1 + bi * 0.3, 1.1, 5);
    scene.add(bin);
  });

  // ═══════════════════════════════════════════════════════════
  // CORK BULLETIN BOARDS & WALL DECORATIONS
  // ═══════════════════════════════════════════════════════════

  // Cork board texture helper
  function createCorkBoard(w, h, pos, rotY) {
    const cbGroup = new THREE.Group();
    cbGroup.position.copy(pos);
    cbGroup.rotation.y = rotY;
    scene.add(cbGroup);
    // Cork surface
    const corkMat = new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.9 });
    const cork = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), corkMat);
    cbGroup.add(cork);
    // Wood frame
    const fMat = new THREE.MeshStandardMaterial({ color: 0x5a3d1e, roughness: 0.5 });
    var cft = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.06, 0.06), fMat);
    cft.position.y = h / 2; cbGroup.add(cft);
    var cfb = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.06, 0.06), fMat);
    cfb.position.y = -h / 2; cbGroup.add(cfb);
    var cfl = new THREE.Mesh(new THREE.BoxGeometry(0.06, h + 0.08, 0.06), fMat);
    cfl.position.x = -w / 2; cbGroup.add(cfl);
    var cfr = new THREE.Mesh(new THREE.BoxGeometry(0.06, h + 0.08, 0.06), fMat);
    cfr.position.x = w / 2; cbGroup.add(cfr);
    // Pinned papers
    const paperColors = [0xffffff, 0xffe4b5, 0xd4edfc, 0xe8f5e9, 0xfff9c4];
    for (let pi = 0; pi < 6; pi++) {
      const pp = new THREE.Mesh(new THREE.PlaneGeometry(0.25 + Math.random() * 0.15, 0.3 + Math.random() * 0.1),
        new THREE.MeshLambertMaterial({ color: paperColors[pi % paperColors.length] }));
      pp.position.set((Math.random() - 0.5) * (w - 0.4), (Math.random() - 0.5) * (h - 0.4), 0.03);
      pp.rotation.z = (Math.random() - 0.5) * 0.2;
      cbGroup.add(pp);
      // Pin
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6),
        new THREE.MeshStandardMaterial({ color: [0xe74c3c, 0x3498db, 0xf1c40f, 0x27ae60][pi % 4] }));
      pin.position.set(pp.position.x, pp.position.y + 0.12, 0.05);
      cbGroup.add(pin);
    }
    return cbGroup;
  }

  // Cork board — back wall left of whiteboard
  createCorkBoard(2, 1.5, new THREE.Vector3(-7, 2.2, -14.5), 0);
  // Cork board — back wall right of whiteboard
  createCorkBoard(1.5, 1.5, new THREE.Vector3(7, 2.2, -14.5), 0);
  // Cork board — right wall
  createCorkBoard(2.5, 1.5, new THREE.Vector3(9.58, 2.2, 0), -Math.PI / 2);

  // ═══════════════════════════════════════════════════════════
  // EDUCATIONAL WALL CHARTS & POSTERS
  // ═══════════════════════════════════════════════════════════

  // Helper to create a framed canvas chart on a wall
  function addWallChart(drawFn, cW, cH, w, h, pos, rotY) {
    const cv = document.createElement('canvas');
    cv.width = cW; cv.height = cH;
    drawFn(cv.getContext('2d'), cW, cH);
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    m.position.copy(pos);
    m.rotation.y = rotY;
    scene.add(m);
    // Frame
    const fM = new THREE.MeshStandardMaterial({ color: 0x2c1810, roughness: 0.4 });
    const fg = new THREE.Group();
    fg.position.copy(pos); fg.rotation.y = rotY;
    var wft = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.05, 0.03), fM);
    wft.position.y = h / 2; fg.add(wft);
    var wfb = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.05, 0.03), fM);
    wfb.position.y = -h / 2; fg.add(wfb);
    var wfl = new THREE.Mesh(new THREE.BoxGeometry(0.05, h + 0.08, 0.03), fM);
    wfl.position.x = -w / 2; fg.add(wfl);
    var wfr = new THREE.Mesh(new THREE.BoxGeometry(0.05, h + 0.08, 0.03), fM);
    wfr.position.x = w / 2; fg.add(wfr);
    scene.add(fg);
  }

  // 1. ALPHABET CHART — Left wall, near front
  addWallChart(function(ctx, W, H) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#cc3333'; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center';
    ctx.fillText('THE ALPHABET', W / 2, 38);
    var colors = ['#e74c3c','#e67e22','#f1c40f','#27ae60','#3498db','#8e44ad'];
    var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    ctx.font = 'bold 34px Arial';
    for (var i = 0; i < 26; i++) {
      var row = Math.floor(i / 9), col = i % 9;
      ctx.fillStyle = colors[i % 6];
      ctx.fillText(abc[i], 40 + col * 50, 85 + row * 60);
    }
  }, 512, 256, 2.5, 1.2, new THREE.Vector3(3, 2.6, 14.58), Math.PI);

  // 2. MULTIPLICATION TABLE — Back wall, right of chalkboard
  addWallChart(function(ctx, W, H) {
    ctx.fillStyle = '#fffff0'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2c3e50'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center';
    ctx.fillText('MULTIPLICATION TABLE', W / 2, 30);
    ctx.font = '14px monospace'; ctx.textAlign = 'center';
    // Header row
    ctx.fillStyle = '#2980b9'; ctx.font = 'bold 14px monospace';
    for (var j = 1; j <= 10; j++) ctx.fillText(String(j), 30 + j * 44, 55);
    for (var i = 1; i <= 10; i++) {
      ctx.fillStyle = '#2980b9'; ctx.fillText(String(i), 30, 55 + i * 40);
      for (var j = 1; j <= 10; j++) {
        ctx.fillStyle = (i === j) ? '#e74c3c' : '#2c3e50';
        ctx.font = '14px monospace';
        ctx.fillText(String(i * j), 30 + j * 44, 55 + i * 40);
      }
    }
  }, 512, 480, 2.2, 2, new THREE.Vector3(5, 2.2, -14.6), 0);

  // 3. CLASSROOM RULES — Front wall, near door
  addWallChart(function(ctx, W, H) {
    ctx.fillStyle = '#fffde7'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c0392b'; ctx.font = 'bold 28px Arial'; ctx.textAlign = 'center';
    ctx.fillText('CLASSROOM RULES', W / 2, 38);
    ctx.fillStyle = '#f1c40f'; ctx.font = '22px Arial'; ctx.fillText('\u2B50', W - 30, 35);
    ctx.fillStyle = '#2c3e50'; ctx.font = '17px Arial'; ctx.textAlign = 'left';
    var rules = ['1. Be respectful to others','2. Raise your hand to speak',
      '3. Keep your desk clean','4. No running in class',
      '5. Complete homework on time','6. Listen when others speak',
      '7. Be kind and helpful','8. Follow instructions'];
    for (var i = 0; i < rules.length; i++) ctx.fillText(rules[i], 25, 80 + i * 48);
  }, 384, 460, 1.5, 1.8, new THREE.Vector3(-5, 1.8, 14.6), Math.PI);

  // 4. PERIODIC TABLE — Right wall
  addWallChart(function(ctx, W, H) {
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e0e0e0'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center';
    ctx.fillText('PERIODIC TABLE OF ELEMENTS', W / 2, 28);
    var ec = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#34495e'];
    var el = ['H','He','Li','Be','B','C','N','O','F','Ne','Na','Mg','Al','Si','P','S','Cl','Ar',
              'K','Ca','Sc','Ti','V','Cr','Mn','Fe','Co','Ni','Cu','Zn','Ga','Ge','As','Se','Br','Kr'];
    for (var i = 0; i < el.length; i++) {
      var row = Math.floor(i / 9), col = i % 9;
      ctx.fillStyle = ec[i % 8];
      ctx.fillRect(22 + col * 66, 45 + row * 75, 58, 65);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px Arial';
      ctx.fillText(el[i], 51 + col * 66, 75 + row * 75);
      ctx.font = '10px Arial';
      ctx.fillText(String(i + 1), 51 + col * 66, 95 + row * 75);
    }
  }, 640, 360, 2.5, 1.4, new THREE.Vector3(9.58, 2.2, -2), -Math.PI / 2);

  // 5. SOLAR SYSTEM — Left wall, lower
  addWallChart(function(ctx, W, H) {
    ctx.fillStyle = '#0a0a2e'; ctx.fillRect(0, 0, W, H);
    for (var s = 0; s < 80; s++) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + Math.random() * 0.7) + ')';
      ctx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
    }
    ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center';
    ctx.fillText('OUR SOLAR SYSTEM', W / 2, 24);
    var planets = [
      {n:'Sun',c:'#f39c12',r:20,x:42},{n:'Mercury',c:'#95a5a6',r:4,x:90},
      {n:'Venus',c:'#e67e22',r:6,x:130},{n:'Earth',c:'#3498db',r:7,x:175},
      {n:'Mars',c:'#e74c3c',r:5,x:215},{n:'Jupiter',c:'#d4a843',r:14,x:275},
      {n:'Saturn',c:'#c9a961',r:12,x:345},{n:'Uranus',c:'#76d7ea',r:9,x:410},
      {n:'Neptune',c:'#2980b9',r:8,x:468}
    ];
    planets.forEach(function(p) {
      ctx.beginPath(); ctx.arc(p.x, 120, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.c; ctx.fill();
      if (p.n === 'Saturn') {
        ctx.beginPath(); ctx.ellipse(p.x, 120, 22, 5, -0.3, 0, Math.PI * 2);
        ctx.strokeStyle = '#d4a843'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.fillStyle = '#fff'; ctx.font = '10px Arial'; ctx.fillText(p.n, p.x, 120 + p.r + 15);
    });
  }, 512, 256, 2.5, 1.2, new THREE.Vector3(7, 1.0, 14.58), Math.PI);

  // 6. WORLD MAP — enhance existing map with canvas texture
  (function() {
    const mc = document.createElement('canvas');
    mc.width = 512; mc.height = 340;
    const mctx = mc.getContext('2d');
    // Parchment background
    mctx.fillStyle = '#f5e6c8'; mctx.fillRect(0, 0, 512, 340);
    mctx.fillStyle = '#2e86c1'; // Oceans
    mctx.fillRect(0, 80, 512, 200);
    // Simplified continents (green shapes)
    mctx.fillStyle = '#27ae60';
    // Americas
    mctx.fillRect(60, 70, 60, 100); mctx.fillRect(70, 170, 40, 80);
    // Europe/Africa
    mctx.fillRect(220, 80, 50, 60); mctx.fillRect(225, 140, 40, 120);
    // Asia
    mctx.fillRect(280, 60, 120, 80);
    // Australia
    mctx.fillRect(380, 200, 50, 35);
    mctx.fillStyle = '#c0392b'; mctx.font = 'bold 18px Arial'; mctx.textAlign = 'center';
    mctx.fillText('MAP OF SOUTH AFRICA', 256, 25);
    // Circled cities
    mctx.strokeStyle = '#e74c3c'; mctx.lineWidth = 2;
    mctx.beginPath(); mctx.arc(240, 100, 10, 0, Math.PI * 2); mctx.stroke(); // Joburg
    mctx.beginPath(); mctx.arc(380, 95, 10, 0, Math.PI * 2); mctx.stroke(); // Cape Town
    mctx.beginPath(); mctx.arc(250, 155, 10, 0, Math.PI * 2); mctx.stroke(); // Durban
    mctx.fillStyle = '#fff'; mctx.font = '9px Arial';
    mctx.fillText('eGoli', 240, 85); mctx.fillText('iKapa', 380, 82); mctx.fillText('eThekwini', 250, 145);
    const mTex = new THREE.CanvasTexture(mc);
    mTex.encoding = THREE.sRGBEncoding;
    map.material = new THREE.MeshStandardMaterial({ map: mTex, roughness: 0.7 });
    map.material.needsUpdate = true;
  })();

  // ═══════════════════════════════════════════════════════════
  // CEILING LIGHT PANELS — reduced count, emissive fixtures provide visual fill
  // ═══════════════════════════════════════════════════════════

  const lightFixGeo = new THREE.BoxGeometry(1.8, 0.05, 0.5);
  const lightFixMat = new THREE.MeshStandardMaterial({
    color: 0xddd8cc, emissive: 0xffeedd, emissiveIntensity: 0.35, roughness: 0.3
  });
  // Visual-only light fixtures (emissive mesh, no PointLight)
  var ceilingLightPositions = [];
  for (let lx = -6; lx <= 6; lx += 4) {
    for (let lz = -12; lz <= 12; lz += 5) {
      ceilingLightPositions.push([lx, lz]);
    }
  }
  for (var cli = 0; cli < ceilingLightPositions.length; cli++) {
    var clp = ceilingLightPositions[cli];
    var lightFix = new THREE.Mesh(lightFixGeo, lightFixMat);
    lightFix.position.set(clp[0], 3.05, clp[1]);
    scene.add(lightFix);
  }
  // Actual PointLights — only 4 spread evenly (saves ~12 lights)
  var ceilingPLPositions = [[-4, -8], [4, -8], [-4, 6], [4, 6]];
  for (var pi = 0; pi < ceilingPLPositions.length; pi++) {
    var pp = ceilingPLPositions[pi];
    var planeLight = new THREE.PointLight(0xffe8d0, 0.35, 14);
    planeLight.position.set(pp[0], 2.95, pp[1]);
    scene.add(planeLight);
  }

  // ═══════════════════════════════════════════════════════════
  // TRASH CANS & MISCELLANEOUS
  // ═══════════════════════════════════════════════════════════

  // Round trash can — front left
  const trashGeo = new THREE.CylinderGeometry(0.2, 0.18, 0.5, 12);
  const trashMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.6, metalness: 0.2 });
  const trash = new THREE.Mesh(trashGeo, trashMat);
  trash.position.set(-7, 0.25, 10);
  trash.castShadow = true;
  scene.add(trash);

  // Round trash can — right
  const trash2 = new THREE.Mesh(trashGeo, trashMat);
  trash2.position.set(8, 0.25, 10);
  trash2.castShadow = true;
  scene.add(trash2);

  // ═══════════════════════════════════════════════════════════
  // DECORATIVE WALL ART — Tree mural + deer antlers (like reference)
  // ═══════════════════════════════════════════════════════════

  // Tree mural on right wall (canvas drawn)
  (function() {
    const tc = document.createElement('canvas');
    tc.width = 512; tc.height = 640;
    const tctx = tc.getContext('2d');
    // Transparent background (wood panel shows through)
    tctx.fillStyle = 'rgba(212,167,106,0)';
    tctx.clearRect(0, 0, 512, 640);
    // Tree trunk — brown
    tctx.fillStyle = '#5a3d1e';
    tctx.fillRect(220, 250, 70, 400);
    // Branches
    tctx.strokeStyle = '#5a3d1e'; tctx.lineWidth = 12; tctx.lineCap = 'round';
    var branches = [[255,250,150,150],[255,250,380,120],[255,300,100,250],[255,300,420,220],
      [255,350,180,330],[255,350,350,310],[150,150,80,80],[380,120,440,60],
      [100,250,50,200],[420,220,470,170]];
    branches.forEach(function(b) {
      tctx.beginPath(); tctx.moveTo(b[0],b[1]); tctx.lineTo(b[2],b[3]); tctx.stroke();
    });
    // Leaves — various green/orange/red circles
    var leafColors = ['#27ae60','#2ecc71','#e67e22','#e74c3c','#f39c12','#1abc9c'];
    for (var li = 0; li < 100; li++) {
      tctx.beginPath();
      var lx = 50 + Math.random() * 420, ly = 30 + Math.random() * 320;
      tctx.arc(lx, ly, 12 + Math.random() * 18, 0, Math.PI * 2);
      tctx.fillStyle = leafColors[Math.floor(Math.random() * leafColors.length)];
      tctx.fill();
    }
    const treeTex = new THREE.CanvasTexture(tc);
    treeTex.encoding = THREE.sRGBEncoding;
    const treeMat = new THREE.MeshStandardMaterial({
      map: treeTex, transparent: true, roughness: 0.7, side: THREE.DoubleSide
    });
    const treeMural = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.5), treeMat);
    treeMural.position.set(9.58, 1.8, 10);
    treeMural.rotation.y = -Math.PI / 2;
    scene.add(treeMural);
  })();

  // Deer antler decoration on right wall (above tree)
  (function() {
    const antlerMat = new THREE.MeshStandardMaterial({ color: 0x8b6b3d, roughness: 0.6 });
    const aGroup = new THREE.Group();
    aGroup.position.set(9.55, 2.8, 3);
    aGroup.rotation.y = -Math.PI / 2;
    scene.add(aGroup);
    // Mounting plaque
    const plaque = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 16), antlerMat);
    plaque.rotation.x = Math.PI / 2;
    aGroup.add(plaque);
    // Antler branches (cylinders angled out)
    for (var ai = -1; ai <= 1; ai += 2) {
      var antler = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.6, 6), antlerMat);
      antler.position.set(ai * 0.15, 0.2, 0);
      antler.rotation.z = ai * 0.5;
      aGroup.add(antler);
      var antlerTip = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.02, 0.3, 6), antlerMat);
      antlerTip.position.set(ai * 0.35, 0.4, 0);
      antlerTip.rotation.z = ai * 0.8;
      aGroup.add(antlerTip);
      var antlerTip2 = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.02, 0.25, 6), antlerMat);
      antlerTip2.position.set(ai * 0.2, 0.35, 0.1);
      antlerTip2.rotation.z = ai * 0.3;
      antlerTip2.rotation.x = 0.4;
      aGroup.add(antlerTip2);
    }
  })();

  // Colorful triangle flag bunting (above whiteboard area)
  (function() {
    const flagColors = [0xe74c3c, 0xf1c40f, 0x3498db, 0x27ae60, 0xff6b35, 0x9b59b6];
    for (var fi = 0; fi < 12; fi++) {
      var flagGeo = new THREE.BufferGeometry();
      var verts = new Float32Array([0, 0, 0, 0.15, -0.25, 0, -0.15, -0.25, 0]);
      flagGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      flagGeo.computeVertexNormals();
      var flag = new THREE.Mesh(flagGeo,
        new THREE.MeshStandardMaterial({ color: flagColors[fi % flagColors.length], side: THREE.DoubleSide, roughness: 0.6 }));
      flag.position.set(-5 + fi * 0.85, 2.9, -14.35);
      flag.rotation.z = (Math.random() - 0.5) * 0.3;
      scene.add(flag);
    }
    // Bunting string
    var stringGeo = new THREE.BoxGeometry(10.5, 0.015, 0.015);
    var stringMesh = new THREE.Mesh(stringGeo,
      new THREE.MeshLambertMaterial({ color: 0x888888 }));
    stringMesh.position.set(0, 2.92, -14.36);
    scene.add(stringMesh);
  })();

  // ═══════════════════════════════════════════════════════════
  // INTERACTIVE HIGHLIGHTS
  // ═══════════════════════════════════════════════════════════
  
  const highlightObjects = [teacherDesk, rth, skull, globe, bookshelf];
  highlightObjects.forEach((obj) => {
    if (obj.material) {
      obj.material.emissive = new THREE.Color(0x3a2f00);
    }
  });
}

function registerInteractive(mesh, itemKey) {
  mesh.userData.itemKey = itemKey;
  // Store original emissive color for hover effects
  if (mesh.material && mesh.material.emissive) {
    mesh.userData.originalEmissive = mesh.material.emissive.getHex();
  }
  interactiveObjects.push(mesh);
}

// Register an axis-aligned collision box (x, z center; half-width, half-depth)
function addCollisionBox(x, z, halfW, halfD) {
  collisionBoxes.push({ x: x, z: z, hw: halfW, hd: halfD });
}

// Check if a circle (player) at (px,pz) with radius r collides with any box
function checkCollision(px, pz, r) {
  for (let i = 0; i < collisionBoxes.length; i++) {
    const b = collisionBoxes[i];
    // Closest point on AABB to circle center
    const cx = Math.max(b.x - b.hw, Math.min(px, b.x + b.hw));
    const cz = Math.max(b.z - b.hd, Math.min(pz, b.z + b.hd));
    const dx = px - cx;
    const dz = pz - cz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════
   MOUSE LOOK CONTROLS
═══════════════════════════════════════════════════════════ */

let yaw = 0, pitch = 0;
const speed = 0.12; // legacy fallback
const keys = {};

function setupMouseLook() {
  // Request pointer lock on canvas click for mouse look
  const canvas = renderer.domElement;
  canvas.addEventListener('click', () => {
    canvas.requestPointerLock();
  });

  // Handle pointer lock change
  document.addEventListener('pointerlockchange', () => {
    const crosshair = document.getElementById('crosshair');
    if (document.pointerLockElement === canvas) {
      console.log('Pointer locked - mouse look enabled');
      crosshair.classList.add('active');
    } else {
      console.log('Pointer unlocked - click to enable mouse look');
      crosshair.classList.remove('active');
    }
  });

  document.addEventListener('mousemove', (e) => {
    // Only move camera if pointer is locked and game not paused
    if (document.pointerLockElement !== canvas) return;
    if (G.paused) return;

    yaw -= e.movementX * mouseSensitivity;
    pitch -= e.movementY * mouseSensitivity;

    // Clamp pitch to prevent camera flipping
    pitch = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, pitch));

    // Apply rotation to the player and camera pitch
    player.rotation.y = yaw;
    camera.rotation.order = 'YXZ';
    camera.rotation.x = pitch;
  });

  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'escape') {
      // Pause menu handles ESC; also exit pointer lock
      document.exitPointerLock();
      closeModal();
      return;
    }
    if (G.paused) return; // ignore movement keys when paused
    if (key === 'arrowup' || key === 'w') {
      keys['w'] = true;
    } else if (key === 'arrowdown' || key === 's') {
      keys['s'] = true;
    } else if (key === 'arrowleft' || key === 'a') {
      keys['a'] = true;
    } else if (key === 'arrowright' || key === 'd') {
      keys['d'] = true;
    } else {
      keys[key] = true;
    }
  });

  document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'arrowup' || key === 'w') {
      keys['w'] = false;
    } else if (key === 'arrowdown' || key === 's') {
      keys['s'] = false;
    } else if (key === 'arrowleft' || key === 'a') {
      keys['a'] = false;
    } else if (key === 'arrowright' || key === 'd') {
      keys['d'] = false;
    } else {
      keys[key] = false;
    }
  });
}

function setPlayerViewMode(thirdPerson) {
  isThirdPerson = thirdPerson;
  if (!player || !camera) return;

  const viewMeshes = player.userData.viewMeshes || [];
  viewMeshes.forEach(mesh => {
    mesh.visible = isThirdPerson;
  });

  if (isThirdPerson) {
    camera.position.set(0, playerConfig.cameraHeight, playerConfig.cameraDistance);
  } else {
    camera.position.set(0, playerConfig.cameraHeight, playerConfig.firstPersonOffsetZ);
  }

  const toggleButton = document.getElementById('view-toggle');
  if (toggleButton) {
    toggleButton.textContent = isThirdPerson ? 'View: 3rd Person' : 'View: 1st Person';
  }
}

function toggleViewMode() {
  setPlayerViewMode(!isThirdPerson);
}

/* ═══════════════════════════════════════════════════════════
   PARTICLE EFFECTS
═══════════════════════════════════════════════════════════ */

function createParticleEffect(position) {
  const particleCount = 50;
  const particles = new THREE.Group();
  scene.add(particles);

  for (let i = 0; i < particleCount; i++) {
    const geometry = new THREE.SphereGeometry(0.02, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: Math.random() * 0xffffff });
    const particle = new THREE.Mesh(geometry, material);
    particle.position.copy(position);
    particle.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.1,
      Math.random() * 0.1,
      (Math.random() - 0.5) * 0.1
    );
    particles.add(particle);
  }

  // Animate particles
  const animateParticles = () => {
    particles.children.forEach(particle => {
      particle.position.add(particle.velocity);
      particle.velocity.y -= 0.002; // Gravity
      particle.material.opacity -= 0.01;
      if (particle.material.opacity <= 0) {
        particles.remove(particle);
      }
    });
    if (particles.children.length > 0) {
      requestAnimationFrame(animateParticles);
    } else {
      scene.remove(particles);
    }
  };
  animateParticles();
}

/* ═══════════════════════════════════════════════════════════
   GAME STATE & UI
═══════════════════════════════════════════════════════════ */

function addInv(item) {
  if (!G.inv.includes(item)) {
    G.inv.push(item);
    updateInventoryDisplay();
    screenFlash('gold');
    showToast('📦 Collected: ' + item, 'ok');
    updateObjective();
    // Play pickup sound (synth + HTML audio fallback)
    SFX.pickup();
    const pickupSound = document.getElementById('pickup-sound');
    if (pickupSound) {
      pickupSound.currentTime = 0;
      pickupSound.play();
    }
  }
}

function addLog(msg, className = '') {
  const log = document.getElementById('log-entries');
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + className;
  entry.textContent = msg;
  log.insertBefore(entry, log.firstChild);
  if (log.children.length > 10) {
    log.removeChild(log.lastChild);
  }
}

function markPuzzleDone(id) {
  G.solved.add(id);
  const pdot = document.getElementById('d' + id);
  if (pdot) {
    pdot.classList.add('done');
  }
  // Create particle effect at player position
  if (player) {
    createParticleEffect(player.position.clone());
  }
  // Track solve time for hint system
  if (G.startTime) {
    lastSolveTime = Math.round((Date.now() - G.startTime) / 1000);
  }
  addLog('Puzzle solved!', 'ok');
  showToast('🎯 Puzzle solved!', 'ok');
  SFX.puzzleSolve();
  updateObjective();
  // GM reaction to solve
  gmReactToSolve(id);
  // Environment reacts
  environmentReact(id);
}

/* ═══════════════════════════════════════════════════════════
   TIMER & WIN CONDITION
═══════════════════════════════════════════════════════════ */

function startTimer() {
  G.startTime = Date.now();
  G.tick = setInterval(() => {
    if (G.paused) return;
    G.secs--;
    updateTimer();
    if (G.secs <= 0) {
      endGame(false);
    }
  }, 1000);
}

function updateTimer() {
  const mins = Math.floor(G.secs / 60);
  const secs = G.secs % 60;
  const timer = document.getElementById('timer');
  timer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  if (G.secs <= 60) {
    timer.classList.add('ok');
    const ub = document.getElementById('urgency-border');
    if (ub) ub.classList.add('urgent');
    // Start ticking sound at 60 seconds
    if (G.secs === 60) SFX.startTicking(false);
  }
  if (G.secs <= 10) {
    timer.style.color = 'var(--danger)';
    // Switch to fast ticking at 10 seconds
    if (G.secs === 10) SFX.startTicking(true);
  }
  // Check hint availability
  checkHintAvailability();
}

function updateHUDTitle() {
  const hudTitle = document.getElementById('hud-title');
  if (hudTitle) {
    const roomData = ROOMS[G.level];
    hudTitle.textContent = '🇿🇦 Mzansi Escape [3D] — Level ' + G.level + ': ' + roomData.subtitle;
  }
}

function endGame(won) {
  G.over = true;
  clearInterval(G.tick);
  if (won) {
    const elapsed = Math.round((Date.now() - G.startTime) / 1000);
    const rank = saveToLeaderboard(elapsed);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const timeStr = mins + ':' + String(secs).padStart(2, '0');
    let lbHtml = '<br><strong>Your time: ' + timeStr + '</strong>';
    if (rank <= 10) lbHtml += '<br>🏆 <strong>#' + rank + ' on the leaderboard!</strong>';
    lbHtml += '<br><br><button onclick="showLeaderboard()" style="padding:8px 16px;background:var(--gold);color:#000;border:none;border-radius:4px;cursor:pointer;font-family:Creepster,cursive;">View Leaderboard</button>';
    lbHtml += '<br><br><div class="story-note">Leerder #18 — Escaped in ' + timeStr + '.<br>Room 14B, Mzansi High, will remember you!<div class="signature">— Die Rekordboek (The Record Book)</div></div>';
    SFX.stopTicking();
    SFX.stopAmbient();
    SFX.victory();
    showModal('🎉 VASGEVANG — VRYHEID! (ESCAPED!)', 'Die deur swaai oop. Daylight floods the klaskamer.<br>You step through, <em>vry (free)</em> at last!<br><br>Behind you, Mr. Nkosi smiles.<br><em>"Sharp! Not bad at all, hey."</em>' + lbHtml);
  } else {
    // Dramatic failure sequence
    SFX.stopTicking();
    SFX.stopAmbient();
    SFX.failure();
    playFailureSequence();
  }
}

function completeLevel() {
  G.completedLevels.push(G.level);
  G.totalElapsedTime += (ROOMS[G.level].timeLimit - G.secs);
  G.paused = true;
  G.over = true;
  
  // Show level complete screen
  var levelCompleteOverlay = document.createElement('div');
  levelCompleteOverlay.id = 'level-complete-overlay';
  levelCompleteOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(10,26,10,0.95);display:flex;align-items:center;justify-content:center;z-index:10000;';
  
  var completePanel = document.createElement('div');
  completePanel.style.cssText = 'text-align:center;color:#f0ead3;font-family:Creepster,cursive;padding:40px;';
  
  var levelTime = ROOMS[G.level].timeLimit - G.secs;
  var levelTimeStr = Math.floor(levelTime / 60) + ':' + String(levelTime % 60).padStart(2, '0');
  
  completePanel.innerHTML = '<h1 style="font-size:3em;color:#FFB612;">🎉 LEVEL ' + G.level + ' COMPLETE!</h1>' +
    '<p style="font-size:1.5em;color:#009B55;margin:20px 0;">Klas ' + G.level + 'B Conquered!</p>' +
    '<p style="font-size:1.2em;">Time: <span style="color:#FFB612;">' + levelTimeStr + '</span></p>';
  
  if (G.level < G.maxLevels) {
    completePanel.innerHTML += '<p style="margin:40px 0;font-size:1.1em;color:#DE3831;">⚠️ Room ' + (G.level + 1) + 'A awaits...</p>' +
      '<button onclick="nextLevel()" style="padding:15px 40px;background:#FFB612;color:#000;border:none;border-radius:8px;cursor:pointer;font-family:Creepster,cursive;font-size:1.1em;margin-top:30px;">Enter Next Room 🚪</button>';
  } else {
    completePanel.innerHTML += '<p style="margin:40px 0;font-size:1.1em;color:#009B55;">🇿🇦 Vryheid! Freedom awaits!</p>' +
      '<button onclick="showFinalVictory()" style="padding:15px 40px;background:#009B55;color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:Creepster,cursive;font-size:1.1em;margin-top:30px;">See Final Score 🏆</button>';
  }
  
  levelCompleteOverlay.appendChild(completePanel);
  document.body.appendChild(levelCompleteOverlay);
}

function nextLevel() {
  // Remove level complete overlay
  var overlay = document.getElementById('level-complete-overlay');
  if (overlay) overlay.remove();
  
  // Increment level
  G.level++;
  var roomData = ROOMS[G.level];
  
  // Reset game state for new room
  G.inv = [];
  G.solved = new Set();
  G.secs = roomData.timeLimit;
  G.over = false;
  G.paused = false;
  G.kpVal = '';
  doorLocks.padlock = false;
  doorLocks.chain = false;
  doorLocks.keypad = false;
  G.checkpoint = null;
  Object.keys(multiplayerState.remotePlayers).forEach(function (id) {
    var peer = multiplayerState.remotePlayers[id];
    if (peer && peer.group && peer.group.parent) peer.group.parent.remove(peer.group);
  });
  multiplayerState.remotePlayers = {};
  G.roomStartTime = Date.now();
  
  // Clear scene
  while (scene.children.length > 0) {
    scene.remove(scene.children[0]);
  }
  
  // Recreate scene for new level
  createClassroom();
  if (selectedPlayMode === 'multiplayer') ensureMultiplayerTeammate();
  updateInventoryDisplay();
  updateObjective();
  updateDoorLockDisplay();
  
  // Update HUD
  updateHUDTitle();
  
  // Show intro for next room
  playIntroCinematic(function() {
    // Start timer
    saveCheckpoint('level-start');
    if (G.tick) clearInterval(G.tick);
    G.tick = setInterval(function() {
      if (G.paused || G.over) return;
      G.secs--;
      updateTimer();
      if (G.secs <= 0) {
        G.over = true;
        playFailureSequence();
      }
    }, 1000);
  });
}

function showFinalVictory() {
  // Remove level complete overlay
  var overlay = document.getElementById('level-complete-overlay');
  if (overlay) overlay.remove();
  
  // Calculate total time
  var totalTime = G.totalElapsedTime;
  var timeStr = Math.floor(totalTime / 60) + ':' + String(totalTime % 60).padStart(2, '0');
  
  var lbHtml = '';
  var lb = getLeaderboard();
  var rank = 0;
  for (let i = 0; i < lb.length; i++) {
    if (lb[i].time > totalTime) { rank = i + 1; break; }
  }
  if (rank === 0) rank = lb.length + 1;
  
  if (rank <= 5) {
    lbHtml = '<br><strong style="color:#FFB612;">🏆 TOP 5 SCORE! 🏆</strong>';
  } else if (rank <= 10) {
    lbHtml = '<br><strong style="color:#009B55;">★ Top 10!</strong>';
  }
  
  lbHtml += '<br><br><div class="story-note">Leerder #18 — All 3 Levels Complete in ' + timeStr + '.<br>Rank: #' + rank + '<br>Mzansi High, Room 14B, will remember you!<div class="signature">— Die Rekordboek (The Record Book)</div></div>';
  
  SFX.stopTicking();
  SFX.stopAmbient();
  SFX.victory();
  showModal('🎉 VASGEVANG — COMPLETE VRYHEID! (TOTAL FREEDOM!)', 'You have mastered all three levels!<br>Die deur final swaai oop. Daylight floods die finale room.<br>You step through, <em>truly vry (free)</em> at last!<br><br>Behind you, Mr. Nkosi smiles.<br><em>"Sharp sharp sharp! Lekker! Not just escaped — you conquered Mzansi High!"</em>' + lbHtml);
}

function triggerWin() {
  // Create victory particle effect
  if (player) {
    createParticleEffect(player.position.clone());
  }
  endGame(true);
}

/* ═══════════════════════════════════════════════════════════
   LEADERBOARD (localStorage)
═══════════════════════════════════════════════════════════ */

function getLeaderboard() {
  try {
    return JSON.parse(localStorage.getItem('escapeLeaderboard') || '[]');
  } catch(e) { return []; }
}

function saveToLeaderboard(seconds) {
  const lb = getLeaderboard();
  const entry = { time: seconds, date: new Date().toLocaleDateString() };
  lb.push(entry);
  lb.sort(function(a, b) { return a.time - b.time; });
  if (lb.length > 20) lb.length = 20; // keep top 20
  localStorage.setItem('escapeLeaderboard', JSON.stringify(lb));
  // Return rank of this entry
  for (let i = 0; i < lb.length; i++) {
    if (lb[i].time === seconds && lb[i].date === entry.date) return i + 1;
  }
  return lb.length;
}

function showLeaderboard() {
  const lb = getLeaderboard();
  const tbody = document.getElementById('lb-body');
  tbody.innerHTML = '';
  if (lb.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="color:#666;">No runs yet. Escape to set a time!</td></tr>';
  } else {
    lb.forEach(function(e, i) {
      const m = Math.floor(e.time / 60);
      const s = e.time % 60;
      const tr = document.createElement('tr');
      if (i < 3) tr.className = 'highlight';
      tr.innerHTML = '<td>' + (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1)) + '</td><td>' + m + ':' + String(s).padStart(2, '0') + '</td><td>' + e.date + '</td>';
      tbody.appendChild(tr);
    });
  }
  document.getElementById('leaderboard-overlay').style.display = 'flex';
}

/* ═══════════════════════════════════════════════════════════
   PAUSE MENU & SETTINGS
═══════════════════════════════════════════════════════════ */

let mouseSensitivity = 0.003; // default (matches slider midpoint)

function setupPauseMenu() {
  G.paused = false;

  const pauseBtn = document.getElementById('pause-btn');
  const overlay = document.getElementById('pause-overlay');
  const resumeBtn = document.getElementById('resume-btn');
  const showLbBtn = document.getElementById('show-lb-btn');
  const lbClose = document.getElementById('lb-close');

  const volMusic = document.getElementById('vol-music');
  const volSfx = document.getElementById('vol-sfx');
  const sensSlider = document.getElementById('sens-slider');
  const volMusicVal = document.getElementById('vol-music-val');
  const volSfxVal = document.getElementById('vol-sfx-val');
  const sensVal = document.getElementById('sens-val');

  // Load saved settings
  const saved = JSON.parse(localStorage.getItem('escapeSettings') || '{}');
  if (saved.musicVol !== undefined) volMusic.value = saved.musicVol;
  if (saved.sfxVol !== undefined) volSfx.value = saved.sfxVol;
  if (saved.sensitivity !== undefined) sensSlider.value = saved.sensitivity;
  applySettings();

  function applySettings() {
    const mv = parseInt(volMusic.value);
    const sv = parseInt(volSfx.value);
    const sens = parseInt(sensSlider.value);
    volMusicVal.textContent = mv;
    volSfxVal.textContent = sv;
    sensVal.textContent = sens;
    // Apply volumes
    const bgMusic = document.getElementById('bg-music');
    if (bgMusic) bgMusic.volume = mv / 100;
    const pickupSound = document.getElementById('pickup-sound');
    if (pickupSound) pickupSound.volume = sv / 100;
    // Apply SFX volume to synthesized sounds
    SFX.setVolume(sv / 100);
    // Apply mouse sensitivity (0.001 to 0.005 range)
    mouseSensitivity = 0.001 + (sens / 100) * 0.004;
    // Save
    localStorage.setItem('escapeSettings', JSON.stringify({ musicVol: mv, sfxVol: sv, sensitivity: sens }));
  }

  volMusic.addEventListener('input', applySettings);
  volSfx.addEventListener('input', applySettings);
  sensSlider.addEventListener('input', applySettings);

  function togglePause() {
    G.paused = !G.paused;
    overlay.style.display = G.paused ? 'flex' : 'none';
    if (G.paused) {
      document.exitPointerLock && document.exitPointerLock();
    }
  }

  pauseBtn.addEventListener('click', togglePause);
  resumeBtn.addEventListener('click', togglePause);
  showLbBtn.addEventListener('click', function() { showLeaderboard(); });
  lbClose.addEventListener('click', function() { document.getElementById('leaderboard-overlay').style.display = 'none'; });

  // ESC also toggles pause (only when game is running)
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && !G.over && G.startTime) {
      e.preventDefault();
      togglePause();
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   EXAMINE MODE — click inventory items to inspect them
═══════════════════════════════════════════════════════════ */

const EXAMINE_DATA = {
  '🕙': { icon: '🕙', title: 'Horlosie Leidraad (Clock Clue)', desc: 'Die horlosie was vasgeval. The hour and minute hands each pointed at a number. Adding them gives the first piece of the deur kode.' },
  '📋': { icon: '📋', title: 'Witbord Leidraad (Whiteboard Clue)', desc: 'Two equations on the witbord. Solving each and adding the results gives the second piece of the deur kode.' },
  '☠️': { icon: '☠️', title: 'Skull Secret', desc: 'A scroll from inside the skull. It speaks of bones and a number that unlocks the RTH machine, sharp.' },
  '⚙️': { icon: '⚙️', title: 'RTH Machine Leidraad', desc: 'The machine unlocked to reveal a colour pattern. It may help with other puzzles, neh.' },
  '📚': { icon: '📚', title: 'Boekrak Book', desc: "A book with a gold keyhole. It reveals that the deur kode is made of two separate numbers placed side by side — sharp sharp." },
  '🌍': { icon: '🌍', title: 'Wêreldbol Leidraad (Globe Clue)', desc: 'Die aarde is die 3de planeet van die Son (Earth is the 3rd planet from the Sun). The number 3 matters somewhere, eish.' },
  '🗺️': { icon: '🗺️', title: 'Map of South Africa', desc: 'Three cities circled: eGoli (Joburg), iKapa (Cape Town), eThekwini (Durban). Durban is the third. The number 3 appears again, sharp.' },
  '📜': { icon: '📜', title: "Student #16's Journal", desc: 'A journal page from a previous learner at Mzansi High. They mention a UV flashlight behind the boekrak that reveals hidden writing on the walls. They were Student #16 out of at least 17, yoh.' },
  '🔑': { icon: '🔑', title: 'Brass Key (Sleutel)', desc: "'n Klein geelkoper sleutel found hidden in the klaskamer. It fits the padlock on the exit deur." },
  '📷': { icon: '📷', title: 'Old Photograph', desc: "A 1994 class photo from Room 14B, Mzansi High. Student #16 has a red X drawn over her face. She escaped in 7:42. Still the record, hayibo." },
  '🔦': { icon: '🔦', title: 'UV Flashlight (UV Lig)', desc: "'n Blacklight torch. When equipped, it reveals invisible ink messages written on the klaskamer walls, sharp." }
};

function setupExamineMode() {
  const overlay = document.getElementById('examine-overlay');
  const closeBtn = document.getElementById('examine-close');

  closeBtn.addEventListener('click', function() {
    overlay.style.display = 'none';
  });

  // Delegate click on inventory items
  document.getElementById('inventory-display').addEventListener('click', function(e) {
    const li = e.target.closest('li');
    if (!li) return;
    const text = li.textContent;
    // Find matching examine data by emoji prefix
    for (const key in EXAMINE_DATA) {
      if (text.indexOf(key) !== -1) {
        const data = EXAMINE_DATA[key];
        document.getElementById('examine-icon').textContent = data.icon;
        document.getElementById('examine-title').textContent = data.title;
        document.getElementById('examine-desc').textContent = data.desc;
        overlay.style.display = 'flex';
        return;
      }
    }
  });
}

// Make inventory items look clickable
function updateInventoryDisplay() {
  const display = document.getElementById('inventory-display');
  display.innerHTML = G.inv.map(function(item) {
    return '<li style="cursor:pointer;transition:color .2s;" onmouseenter="this.style.color=\'#fff\'" onmouseleave="this.style.color=\'#e8c84a\'">' + item + '</li>';
  }).join('') || '<li style="color:#666;">empty</li>';
}

/* ═══════════════════════════════════════════════════════════
   MODAL SYSTEM
═══════════════════════════════════════════════════════════ */

let currentItem = null;

function showModal(title, body, inputConfig = null) {
  const wrapper = document.getElementById('modal-wrapper');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const inputEl = document.getElementById('modal-input');
  const buttonsEl = document.getElementById('modal-buttons');

  titleEl.textContent = title;
  bodyEl.innerHTML = body;
  inputEl.innerHTML = '';
  buttonsEl.innerHTML = '';

  if (inputConfig) {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = inputConfig.placeholder || 'Enter answer...';
    input.style.width = '100%';
    input.style.padding = '8px';
    input.style.fontSize = '1rem';
    input.style.background = '#0d0800';
    input.style.border = '1px solid var(--gold)';
    input.style.color = 'var(--text)';
    input.style.fontFamily = "'Share Tech Mono', monospace";
    inputEl.appendChild(input);

    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Submit';
    submitBtn.style.padding = '8px 16px';
    submitBtn.style.background = 'var(--gold)';
    submitBtn.style.color = '#000';
    submitBtn.style.border = 'none';
    submitBtn.style.borderRadius = '4px';
    submitBtn.style.cursor = 'pointer';
    submitBtn.style.fontFamily = "'Share Tech Mono', monospace";
    let submitLocked = false;
    submitBtn.onclick = () => {
      if (submitLocked) return;
      submitLocked = true;
      submitBtn.style.opacity = '0.5';
      setTimeout(() => { submitLocked = false; submitBtn.style.opacity = '1'; }, 1000);
      const answer = input.value;
      if (inputConfig.checkFn(answer)) {
        addLog(inputConfig.successMsg, 'ok');
        showToast(inputConfig.successMsg || 'Correct!', 'ok');
        screenFlash('gold');
        if (inputConfig.onSuccess) {
          inputConfig.onSuccess();
        }
        if (inputConfig.puzzleId) {
          markPuzzleDone(inputConfig.puzzleId);
        }
        closeModal();
      } else {
        addLog(inputConfig.errorMsg, 'fail');
        showToast(inputConfig.errorMsg || 'Wrong answer!', 'fail');
        screenFlash('red');
        SFX.wrongAnswer();
        shakeModal();
      }
    };
    buttonsEl.appendChild(submitBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.padding = '8px 16px';
  closeBtn.style.background = '#7a5020';
  closeBtn.style.color = 'var(--text)';
  closeBtn.style.border = '1px solid var(--gold)';
  closeBtn.style.borderRadius = '4px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.fontFamily = "'Share Tech Mono', monospace";
  closeBtn.onclick = closeModal;
  buttonsEl.appendChild(closeBtn);

  wrapper.style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-wrapper').style.display = 'none';
}

/* ═══════════════════════════════════════════════════════════
   TOAST NOTIFICATION SYSTEM (replaces log panel)
═══════════════════════════════════════════════════════════ */

function showToast(msg, type) {
  type = type || '';
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3200);
}

/* ═══════════════════════════════════════════════════════════
   SCREEN FLASH & MODAL SHAKE
═══════════════════════════════════════════════════════════ */

function screenFlash(color) {
  var el = document.getElementById('screen-flash');
  if (!el) return;
  el.className = '';
  void el.offsetWidth; // force reflow
  el.classList.add(color);
  setTimeout(function() { el.className = ''; }, 250);
}

function shakeModal() {
  var content = document.getElementById('modal-content');
  if (!content) return;
  content.style.animation = 'none';
  void content.offsetWidth;
  content.style.animation = 'modalShake .4s ease';
  setTimeout(function() { content.style.animation = ''; }, 450);
}

/* ═══════════════════════════════════════════════════════════
   OBJECTIVE TRACKER
═══════════════════════════════════════════════════════════ */

const OBJECTIVES = [
  { text: 'Verken die klaskamer — kyk oral! (Explore the classroom)', icon: '🎯' },
  { text: 'Kyk na die horlosie op die muur (Check the clock)', icon: '⏰' },
  { text: 'Los die witbord berekeninge op (Solve the whiteboard equations)', icon: '📋' },
  { text: 'Vind die skull op die onderwysertafel (Find the skull)', icon: '☠️' },
  { text: 'Kraak die RTH Machine (Crack the RTH machine)', icon: '⚙️' },
  { text: 'Deursoek die boekrak vir leidrade (Search the bookshelf)', icon: '📚' },
  { text: 'Vind \'n manier om die deur te ontsluit (Unlock the door)', icon: '🔑' },
  { text: 'Voer die deurkode in en ontsnap! (Enter code and escape!)', icon: '🚪' }
];
let currentObjective = 0;

function updateObjective() {
  // Determine which objective based on solved puzzles + door locks
  var solved = G.solved ? G.solved.size : 0;
  var invCount = G.inv.length;
  var idx = 0;
  // Count puzzle-specific inventory items (not story items)
  var hasClock = G.inv.some(function(i) { return i.indexOf('🕙') !== -1; });
  var hasBoard = G.inv.some(function(i) { return i.indexOf('📋') !== -1; });
  var hasSkull = G.inv.some(function(i) { return i.indexOf('☠️') !== -1; });
  var hasRTH = G.inv.some(function(i) { return i.indexOf('⚙️') !== -1; });
  var hasShelf = G.inv.some(function(i) { return i.indexOf('📚') !== -1; });

  if (!hasClock) idx = 1;
  else if (!hasBoard) idx = 2;
  else if (!hasSkull) idx = 3;
  else if (!hasRTH) idx = 4;
  else if (!hasShelf) idx = 5;
  else if (!doorLocks.padlock || !doorLocks.chain) idx = 6;
  else idx = 7;

  if (idx !== currentObjective) {
    currentObjective = idx;
    var obj = OBJECTIVES[idx] || OBJECTIVES[0];
    var textEl = document.getElementById('obj-text');
    var iconEl = document.getElementById('obj-icon');
    if (textEl) textEl.textContent = obj.text;
    if (iconEl) iconEl.textContent = obj.icon;
  }
}

/* ═══════════════════════════════════════════════════════════
   MINIMAP SYSTEM
═══════════════════════════════════════════════════════════ */

function drawMinimap() {
  var canvas = _domMinimap || document.getElementById('minimap');
  if (!canvas || !player) return;
  var ctx = _domMinimapCtx || canvas.getContext('2d');
  var w = canvas.width;
  var h = canvas.height;

  // Room bounds: x[-8.5, 8.5], z[-13.5, 13.5] → 17 x 27
  var roomW = 17, roomH = 27;
  var scaleX = w / roomW;
  var scaleZ = h / roomH;
  var oX = 8.5, oZ = 13.5; // offset to make coords positive

  ctx.clearRect(0, 0, w, h);

  // Room background
  ctx.fillStyle = 'rgba(26,14,4,.9)';
  ctx.fillRect(0, 0, w, h);

  // Draw walls
  ctx.strokeStyle = '#7a5020';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  // Draw furniture (collision boxes) as dark rects
  ctx.fillStyle = 'rgba(122,80,32,.5)';
  for (var i = 0; i < collisionBoxes.length; i++) {
    var b = collisionBoxes[i];
    var bx = (b.x + oX - b.hw) * scaleX;
    var bz = (b.z + oZ - b.hd) * scaleZ;
    var bw = b.hw * 2 * scaleX;
    var bh = b.hd * 2 * scaleZ;
    ctx.fillRect(bx, bz, bw, bh);
  }

  // Draw interactive objects as yellow dots (skip student sub-meshes for perf)
  ctx.fillStyle = 'rgba(232,200,74,.6)';
  for (var j = 0; j < interactiveObjects.length; j++) {
    var obj = interactiveObjects[j];
    // Skip student body-part meshes (they cluster at same spot)
    if (obj.userData.itemKey && obj.userData.itemKey.indexOf('student') === 0) continue;
    obj.getWorldPosition(_tmpVec3);
    var ix = (_tmpVec3.x + oX) * scaleX;
    var iz = (_tmpVec3.z + oZ) * scaleZ;
    ctx.beginPath();
    ctx.arc(ix, iz, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw door marker
  ctx.fillStyle = '#27ae60';
  var doorX = (0 + oX) * scaleX;
  var doorZ = (13.5 + oZ) * scaleZ;
  ctx.fillRect(doorX - 6, doorZ - 2, 12, 3);

  // Draw player as arrow
  var px = (player.position.x + oX) * scaleX;
  var pz = (player.position.z + oZ) * scaleZ;
  var angle = player.rotation.y;

  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(-angle);
  ctx.fillStyle = '#d4a843';
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(-3.5, 4);
  ctx.lineTo(3.5, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Label
  ctx.fillStyle = 'rgba(212,168,67,.4)';
  ctx.font = '9px monospace';
  ctx.fillText('MAP', 4, 12);
}

/* ═══════════════════════════════════════════════════════════
   PROGRESSIVE HINT SYSTEM
═══════════════════════════════════════════════════════════ */

let lastSolveTime = 0;
let hintShown = false;
const HINT_DELAY = 120; // seconds stuck before hint appears
const HINT_COST = 30;   // seconds deducted for using hint

let HINTS = [
  'Eish! The horlosie has stopped. Look at where the hands point — add those numbers, sharp.',
  'The witbord has two equations. Solve each one, then add the results together, neh.',
  'The skull hides something inside. Pick it up and read the scroll, sharp.',
  'The RTH machine needs a numeric code. Did you find the skull scroll? Hayibo!',
  'The boekrak has a black book with a gold keyhole. Click on it.',
  'The deur code is two numbers placed side by side: one from the horlosie, one from the witbord, sharp sharp.'
];

function getNextHint() {
  var invCount = G.inv.length;
  var solved = G.solved ? G.solved.size : 0;
  if (invCount === 0) return HINTS[0];
  if (solved < 1) return HINTS[1];
  if (invCount < 3) return HINTS[2];
  if (solved < 2) return HINTS[3];
  if (invCount < 4) return HINTS[4];
  return HINTS[5];
}

function checkHintAvailability() {
  var elapsed = Math.round((Date.now() - (G.startTime || Date.now())) / 1000);
  var timeSinceSolve = elapsed - lastSolveTime;
  var hintBtn = document.getElementById('hint-btn');
  if (!hintBtn) return;

  if (timeSinceSolve >= HINT_DELAY && !G.over) {
    hintBtn.style.display = 'block';
  } else {
    hintBtn.style.display = 'none';
  }
}

function useHint() {
  G.secs = Math.max(10, G.secs - HINT_COST);
  updateTimer();
  var hint = getNextHint();
  SFX.hintUsed();
  showToast('💡 ' + hint, 'hint');
  lastSolveTime = Math.round((Date.now() - G.startTime) / 1000);
  document.getElementById('hint-btn').style.display = 'none';
  screenFlash('gold');
}

/* ═══════════════════════════════════════════════════════════
   HELP OVERLAY
═══════════════════════════════════════════════════════════ */

function setupHelp() {
  var helpBtn = document.getElementById('help-btn');
  var overlay = document.getElementById('help-overlay');
  var closeBtn = document.getElementById('help-close');

  function toggleHelp() {
    if (overlay.style.display === 'flex') {
      overlay.style.display = 'none';
    } else {
      overlay.style.display = 'flex';
    }
  }

  if (helpBtn) helpBtn.addEventListener('click', toggleHelp);
  if (closeBtn) closeBtn.addEventListener('click', function() { overlay.style.display = 'none'; });
}

/* ═══════════════════════════════════════════════════════════
   CLICK-TO-MOVE (right-click on floor)
═══════════════════════════════════════════════════════════ */

let clickToMoveTarget = null;
const clickToMoveFloor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function setupClickToMove() {
  var canvas = renderer.domElement;
  canvas.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    if (G.paused || G.over) return;
    if (document.pointerLockElement !== canvas) return;

    // Cast ray from center of screen (where crosshair is)
    var ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    var target = new THREE.Vector3();
    ray.ray.intersectPlane(clickToMoveFloor, target);

    if (target) {
      // Clamp to room bounds
      var margin = 1.0;
      target.x = Math.max(-8.5 + margin, Math.min(8.5 - margin, target.x));
      target.z = Math.max(-13.5 + margin, Math.min(13.5 - margin, target.z));
      clickToMoveTarget = target;
      showToast('Walking to target...', '');
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════════════════════════ */

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    if (G.over) return;
    var key = e.key.toLowerCase();

    // Tab — toggle inventory panel
    if (key === 'tab') {
      e.preventDefault();
      var inv = document.getElementById('bottom-ui');
      if (inv) inv.style.display = inv.style.display === 'none' ? 'block' : (inv.style.display === 'block' ? 'none' : 'block');
    }

    // H — toggle help
    if (key === 'h' && !e.ctrlKey) {
      var helpOv = document.getElementById('help-overlay');
      if (helpOv) helpOv.style.display = helpOv.style.display === 'flex' ? 'none' : 'flex';
    }

    // I — examine last collected item
    if (key === 'i' && G.inv.length > 0) {
      var lastItem = G.inv[G.inv.length - 1];
      var examOv = document.getElementById('examine-overlay');
      if (examOv && examOv.style.display === 'flex') {
        examOv.style.display = 'none';
        return;
      }
      // Trigger examine on last item
      for (var k in EXAMINE_DATA) {
        if (lastItem.indexOf(k) !== -1) {
          var data = EXAMINE_DATA[k];
          document.getElementById('examine-icon').textContent = data.icon;
          document.getElementById('examine-title').textContent = data.title;
          document.getElementById('examine-desc').textContent = data.desc;
          document.getElementById('examine-overlay').style.display = 'flex';
          return;
        }
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   INTERACTION DISTANCE GLOW (objects glow softly from farther away)
═══════════════════════════════════════════════════════════ */

function updateDistanceGlow() {
  if (!player) return;
  var px = player.position.x;
  var pz = player.position.z;
  var glowRange = 6.0;  // start glowing within 6 units
  var maxGlow = 0.12;    // max emissive addition at closest range

  for (var i = 0; i < interactiveObjects.length; i++) {
    var obj = interactiveObjects[i];
    if (!obj.material || obj.userData.originalEmissive === undefined) continue;
    obj.getWorldPosition(_tmpVec3);
    var dist = Math.sqrt((px - _tmpVec3.x) * (px - _tmpVec3.x) + (pz - _tmpVec3.z) * (pz - _tmpVec3.z));

    if (dist < glowRange) {
      var intensity = (1 - dist / glowRange) * maxGlow;
      var base = obj.userData.originalEmissive;
      var r = ((base >> 16) & 255) / 255 + intensity;
      var g = ((base >> 8) & 255) / 255 + intensity * 0.7;
      var b = (base & 255) / 255;
      obj.material.emissive.setRGB(Math.min(r, 1), Math.min(g, 1), Math.min(b, 1));
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   GAME MASTER COMMENTARY (Mr. Nkosi speaks periodically)
═══════════════════════════════════════════════════════════ */

const GM_COMMENTS = {
  // Time-based triggers (seconds remaining)
  480: { text: "Eish! Still looking around? The horlosie on the wall isn't the only thing that's stopped, neh.", priority: 1 },
  360: { text: "Six minutes left. Most learners figure out the witbord by now, sharp...", priority: 1 },
  240: { text: "Four minutes. Yoh! The skull holds more secrets than you think.", priority: 2 },
  120: { text: "Two minutes! Hayibo! If you haven't found all the pieces yet, think about what's on the walls.", priority: 3 },
  60:  { text: "EEN MINUUT! The deur code is two numbers, side by side. Haamba! (Go!)", priority: 3 },
  30:  { text: "Thirty seconds... Aikhona, you're running out of time!", priority: 3 },
  // Puzzle-solve reactions (triggered by markPuzzleDone)
  solve_1: "The witbord yields its secret. Sharp! Now the machine awaits...",
  solve_2: "The machine hums with recognition. You're closer than you think, eish.",
  solve_3: "Interesting find in that skull, neh? Numbers have power here.",
  solve_4: "The boekrak gives up its knowledge. The deur remembers two things...",
  solve_5: "A globe, a map... patterns within patterns. Not everything is what it seems, sharp.",
  // Idle commentary (when player hasn't interacted in a while)
  idle_1: "Standing still won't open the deur. Everything in this klaskamer means something, neh.",
  idle_2: "The answer is right in front of you. Sometimes literally, bra.",
  idle_3: "I've watched many learners in this klaskamer. The ones who escape look at what's obvious first, sharp.",
};

let lastGMTime = 0;
let gmQueue = [];
let gmBubbleTimeout = null;
let lastInteractionTime = 0;
let idleCommentIndex = 0;

function showGMBubble(text, duration) {
  duration = duration || 5000;
  var bubble = document.getElementById('gm-bubble');
  var textEl = document.getElementById('gm-text');
  if (!bubble || !textEl) return;
  textEl.textContent = text;
  bubble.style.display = 'block';
  SFX.gmSpeak();
  bubble.style.animation = 'none';
  void bubble.offsetWidth;
  bubble.style.animation = 'gmFadeIn .5s ease';
  if (gmBubbleTimeout) clearTimeout(gmBubbleTimeout);
  gmBubbleTimeout = setTimeout(function() {
    bubble.style.display = 'none';
    gmBubbleTimeout = null;
  }, duration);
}

function checkGMCommentary() {
  if (G.over || G.paused) return;
  var secs = G.secs;
  // Time-based triggers
  var comment = GM_COMMENTS[secs];
  if (comment && comment.text && secs !== lastGMTime) {
    lastGMTime = secs;
    showGMBubble(comment.text, comment.priority >= 3 ? 6000 : 4500);
    return;
  }
  // Idle commentary (every 90 seconds of no interaction)
  var elapsed = Math.round((Date.now() - G.startTime) / 1000);
  if (elapsed - lastInteractionTime > 90 && idleCommentIndex < 3) {
    var key = 'idle_' + (idleCommentIndex + 1);
    if (GM_COMMENTS[key]) {
      showGMBubble(GM_COMMENTS[key], 5000);
      lastInteractionTime = elapsed;
      idleCommentIndex++;
    }
  }
}

function gmReactToSolve(puzzleId) {
  var key = 'solve_' + puzzleId;
  if (GM_COMMENTS[key]) {
    // Slight delay so it doesn't overlap with puzzle toast
    setTimeout(function() { showGMBubble(GM_COMMENTS[key], 5000); }, 1500);
  }
  lastInteractionTime = Math.round((Date.now() - G.startTime) / 1000);
}

/* ═══════════════════════════════════════════════════════════
   INTRO CINEMATIC SEQUENCE
═══════════════════════════════════════════════════════════ */

function playIntroCinematic(callback) {
  var overlay = document.getElementById('intro-overlay');
  var textEl = document.getElementById('intro-text');
  if (!overlay || !textEl) { callback(); return; }

  var roomData = ROOMS[G.level];
  var lines;
  
  if (G.level === 1) {
    lines = [
      '📍 ' + roomData.name + ', Na-ure (After Hours)',
      '',
      'Die neonligte flicker aan.',
      'Behind you, a heavy lock <em>clicks</em> shut.',
      '',
      'Mr. Nkosi\'s voice echoes from the intercom:',
      '',
      '"<em>Sawubona, learner. You have <strong>ten minutes</strong>.</em>"',
      '"<em>Everything you need is in this klaskamer.</em>"',
      '"<em>Nothing is accidental, neh.</em>"',
      '',
      '"<em>The horlosie, the witbord, the skull... they all speak</em>"',
      '"<em>if you know how to listen, sharp.</em>"',
      '',
      '🇿🇦 <strong>Vind die eerste deur kode!</strong>'
    ];
  } else if (G.level === 2) {
    lines = [
      '📍 ' + roomData.name,
      '',
      'The archive door slams open. Another room. More time. Less mercy.',
      '',
      'Mr. Nkosi speaks again:',
      '',
      '"<em>Yoh! You made it through Level 1.</em>"',
      '"<em>Room 15A is no klaskamer, eish.</em>"',
      '"<em>This time, <strong>eight minutes</strong>. And THREE locks.</em>"',
      '"<em>The puzzles are deeper. The darkness thicker.</em>"',
      '',
      '💪 <strong>Prove yourself worthy.</strong>'
    ];
  } else if (G.level === 3) {
    lines = [
      '📍 ' + roomData.name,
      '',
      'The vault entrance looms. Steel walls. Ancient locks. Absolute silence.',
      '',
      'Mr. Nkosi\'s final challenge:',
      '',
      '"<em>Hawu! The vault. Room 15B. Seven minutes.</em>"',
      '"<em>This is where legends are made... or locked forever.</em>"',
      '"<em><strong>THREE locks. ZERO mercy.</strong></em>"',
      '"<em>Sharp sharp sharp — this is your test.</em>"',
      '',
      '🏆 <strong>Conquer the vault. Claim your vryheid!</strong>'
    ];
  }

  overlay.style.display = 'flex';
  overlay.style.opacity = '1';
  textEl.innerHTML = '';

  // Play lock sound when "lock clicks shut" line appears
  setTimeout(function() { SFX.introLock(); }, 2100);

  var delay = 0;
  lines.forEach(function(line, i) {
    var div = document.createElement('div');
    div.className = 'intro-line';
    div.innerHTML = line || '&nbsp;';
    textEl.appendChild(div);
    var showDelay = line === '' ? 300 : 600;
    delay += showDelay;
    setTimeout(function() {
      div.classList.add('show');
    }, delay);
  });

  textEl.style.opacity = '1';

  // After all lines shown, wait then fade out
  setTimeout(function() {
    overlay.style.opacity = '0';
    setTimeout(function() {
      overlay.style.display = 'none';
      callback();
    }, 1200);
  }, delay + 2500);
}

/* ═══════════════════════════════════════════════════════════
   MULTI-STAGE DOOR SYSTEM (3 locks)
═══════════════════════════════════════════════════════════ */

const doorLocks = {
  padlock: false,  // unlocked by finding hidden key
  chain: false,    // unlocked by solving RTH color sequence
  keypad: false    // unlocked by entering correct door code
};

function saveCheckpoint(reason) {
  if (G.over) return;
  const now = Date.now();
  const elapsed = G.startTime ? Math.max(0, Math.round((now - G.startTime) / 1000)) : 0;
  G.checkpoint = {
    reason: reason || 'progress',
    inv: G.inv.slice(),
    solved: Array.from(G.solved || []),
    locks: {
      padlock: !!doorLocks.padlock,
      chain: !!doorLocks.chain,
      keypad: !!doorLocks.keypad
    },
    secs: Math.max(0, G.secs),
    elapsed: elapsed,
    level: G.level,
    lockCount: (doorLocks.padlock ? 1 : 0) + (doorLocks.chain ? 1 : 0) + (doorLocks.keypad ? 1 : 0)
  };
}

function restoreCheckpoint() {
  if (!G.checkpoint || G.checkpoint.level !== G.level) return false;

  const cp = G.checkpoint;
  G.inv = cp.inv.slice();
  G.solved = new Set(cp.solved);
  doorLocks.padlock = !!cp.locks.padlock;
  doorLocks.chain = !!cp.locks.chain;
  doorLocks.keypad = !!cp.locks.keypad;
  G.kpVal = '';
  G.over = false;
  G.paused = false;

  // Time penalty keeps checkpoints fair while reducing full-run frustration.
  G.secs = Math.max(60, cp.secs - G.checkpointPenaltySec);

  if (G.tick) clearInterval(G.tick);
  G.startTime = Date.now();
  G.tick = setInterval(function () {
    if (G.paused) return;
    G.secs--;
    updateTimer();
    if (G.secs <= 0) endGame(false);
  }, 1000);

  for (let i = 1; i <= 6; i++) {
    const dot = document.getElementById('d' + i);
    if (dot) dot.classList.remove('done');
  }
  G.solved.forEach(function (id) {
    const dot = document.getElementById('d' + id);
    if (dot) dot.classList.add('done');
  });

  updateInventoryDisplay();
  updateDoorLockDisplay();
  updateObjective();
  updateTimer();

  const overlay = document.getElementById('failure-overlay');
  const textEl = document.getElementById('failure-text');
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.display = 'none';
  }
  if (textEl) {
    textEl.innerHTML = '';
    textEl.style.opacity = '0';
  }

  showToast('⏱ Restored from checkpoint (-' + G.checkpointPenaltySec + 's penalty)', 'hint');
  addLog('Checkpoint restored after timeout penalty.', 'warn');
  return true;
}

window.restoreCheckpoint = restoreCheckpoint;

function updateDoorLockDisplay() {
  var pl = document.getElementById('lock-padlock');
  var ch = document.getElementById('lock-chain');
  var kp = document.getElementById('lock-keypad');
  if (pl) pl.className = 'door-lock' + (doorLocks.padlock ? ' unlocked' : '');
  if (ch) ch.className = 'door-lock' + (doorLocks.chain ? ' unlocked' : '');
  if (kp) kp.className = 'door-lock' + (doorLocks.keypad ? ' unlocked' : '');
}

function unlockDoorPart(part) {
  doorLocks[part] = true;
  updateDoorLockDisplay();
  saveCheckpoint('lock-' + part);
  SFX.doorUnlock();
  showToast('🔓 Door ' + part + ' unlocked!', 'ok');

  // Visual feedback on door mesh
  if (typeof doorMeshRef !== 'undefined' && doorMeshRef) {
    // Each unlock changes door appearance
    var unlockCount = (doorLocks.padlock ? 1 : 0) + (doorLocks.chain ? 1 : 0) + (doorLocks.keypad ? 1 : 0);
    var requiredLocks = ROOMS[G.level].lockCount;
    
    // Level 1: only needs padlock + chain (2 locks)
    // Levels 2-3: need all 3 locks
    if (unlockCount >= requiredLocks) {
      // All required locks unlocked — door opens!
      triggerDoorOpen();
    }
  }
}

function checkAllLocksOpen() {
  var requiredLocks = ROOMS[G.level].lockCount;
  var unlockCount = (doorLocks.padlock ? 1 : 0) + (doorLocks.chain ? 1 : 0) + (doorLocks.keypad ? 1 : 0);
  return unlockCount >= requiredLocks;
}

/* ═══════════════════════════════════════════════════════════
   DOOR OPEN ANIMATION & WIN SEQUENCE
═══════════════════════════════════════════════════════════ */

var doorMeshRef = null;  // set during createClassroom
var doorOpenAngle = 0;
var doorOpening = false;

function triggerDoorOpen() {
  doorOpening = true;
  SFX.doorOpen();
  
  if (G.level < G.maxLevels) {
    showGMBubble("Sharp, sharp! Room " + G.level + " complete. But wait... there's more! 🚪", 5000);
  } else {
    showGMBubble("Hawu! Sharp, sharp — you earned your freedom, neh! 🇿🇦", 4000);
  }
  // Animate in the render loop
}

function animateDoorOpen(dt) {
  if (!doorOpening || !doorMeshRef) return;
  doorOpenAngle += dt * 1.5; // radians per second
  if (doorOpenAngle >= Math.PI * 0.45) {
    doorOpenAngle = Math.PI * 0.45;
    doorOpening = false;
    // After door fully opens, trigger next level or win
    setTimeout(function() { 
      if (G.level < G.maxLevels) {
        completeLevel();
      } else {
        triggerWin();
      }
    }, 1200);
  }
  // Rotate door around its hinge (left edge)
  doorMeshRef.rotation.y = doorOpenAngle;
  // Shift pivot point
  doorMeshRef.position.x = -8 + Math.sin(doorOpenAngle) * 0.6;
  doorMeshRef.position.z = 14.5 - (1 - Math.cos(doorOpenAngle)) * 0.6;
}

/* ═══════════════════════════════════════════════════════════
   DRAMATIC FAILURE STATE
═══════════════════════════════════════════════════════════ */

function playFailureSequence() {
  var overlay = document.getElementById('failure-overlay');
  var textEl = document.getElementById('failure-text');
  if (!overlay || !textEl) return;

  // Flicker lights
  if (scene) {
    scene.traverse(function(child) {
      if (child.isLight && child.type === 'PointLight') {
        var origIntensity = child.intensity;
        var flicker = 0;
        var flickerInterval = setInterval(function() {
          child.intensity = flicker % 2 === 0 ? origIntensity * 0.1 : origIntensity;
          flicker++;
          if (flicker > 8) {
            clearInterval(flickerInterval);
            child.intensity = origIntensity * 0.05; // dim to near-darkness
          }
        }, 150);
      }
    });
  }

  // After flicker, show failure overlay
  setTimeout(function() {
    overlay.style.display = 'flex';
    setTimeout(function() {
      overlay.style.opacity = '1';
      textEl.innerHTML = "💀 TYDOP! (TIME'S UP)";
      setTimeout(function() {
        textEl.style.opacity = '1';
        setTimeout(function() {
          textEl.innerHTML += '<br><br><span style="font-size:1rem;color:#e8c84a;font-family:Special Elite,cursive;">"Die horlosie slaan nul.<br>You remain locked in die klaskamer.<br><br>Hayibo \u2014 no one hears you, neh."</span>';
          textEl.innerHTML += '<br><br><span style="font-size:.8rem;color:#666;">— Room 14B, Mzansi High, has claimed another leerder —</span>';
          if (G.checkpoint && G.checkpoint.level === G.level && G.checkpoint.lockCount > 0) {
            textEl.innerHTML += '<br><br><button onclick="window.restoreCheckpoint()" style="padding:10px 24px;background:#27ae60;color:#fff;border:none;border-radius:4px;cursor:pointer;font-family:Creepster,cursive;font-size:1rem;margin-right:8px;">↩ Resume From Checkpoint (-' + G.checkpointPenaltySec + 's)</button>';
          }
          textEl.innerHTML += '<br><br><button onclick="location.reload()" style="padding:10px 24px;background:var(--gold);color:#000;border:none;border-radius:4px;cursor:pointer;font-family:Creepster,cursive;font-size:1rem;">\ud83d\udd01 Probeer Weer (Try Again)</button>';
        }, 1500);
      }, 500);
    }, 100);
  }, 1500);
}

/* ═══════════════════════════════════════════════════════════
   ENVIRONMENT REACTIONS TO PUZZLE SOLVES
═══════════════════════════════════════════════════════════ */

function environmentReact(puzzleId) {
  if (!scene) return;
  SFX.envReact();

  switch(puzzleId) {
    case 1: // Whiteboard solved — file cabinet drawer slides open, light flickers
      showGMBubble("Did you hear that? Something clicked near the file cabinet...", 4000);
      // Brief light flicker
      scene.traverse(function(child) {
        if (child.isLight && child.type === 'DirectionalLight') {
          var orig = child.intensity;
          child.intensity = 0.1;
          setTimeout(function() { child.intensity = orig; }, 200);
          setTimeout(function() { child.intensity = 0.1; }, 400);
          setTimeout(function() { child.intensity = orig; }, 600);
        }
      });
      break;

    case 2: // RTH machine solved — screen changes, chain unlocked
      unlockDoorPart('chain');
      // Make RTH screen glow green
      scene.traverse(function(child) {
        if (child.material && child.userData && child.userData.itemKey === 'rth') {
          child.material.emissive = new THREE.Color(0x005500);
          child.material.emissiveIntensity = 0.8;
        }
      });
      break;

    case 3: // Skull collected — candle flickers dramatically
      scene.traverse(function(child) {
        if (child.isLight && child.type === 'PointLight' && child.color.getHex() === 0xffaa33) {
          var orig = child.intensity;
          var flick = 0;
          var fi = setInterval(function() {
            child.intensity = orig * (0.3 + Math.random() * 1.4);
            flick++;
            if (flick > 20) { clearInterval(fi); child.intensity = orig; }
          }, 100);
        }
      });
      break;

    case 4: // Bookshelf — room gets slightly brighter
      scene.traverse(function(child) {
        if (child.isLight && child.type === 'AmbientLight') {
          child.intensity = Math.min(child.intensity + 0.1, 0.6);
        }
      });
      break;
  }
}

/* ═══════════════════════════════════════════════════════════
   HIDDEN COMPARTMENTS & STORY ITEMS
═══════════════════════════════════════════════════════════ */

// Track which hidden items have been found
const hiddenFound = { drawer: false, underDesk: false, behindBook: false, wallTally: false, photo: false };

function createHiddenItems() {
  // 1) TEACHER DESK — bottom drawer is clickable, contains a journal page
  var drawerMat = new THREE.MeshStandardMaterial({ color: 0x5a3d1e, roughness: 0.6 });
  var hiddenDrawer = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.9), drawerMat);
  hiddenDrawer.position.set(1.9, 0.1, -11.5);
  scene.add(hiddenDrawer);
  registerInteractive(hiddenDrawer, 'hidden_drawer');

  // 2) UNDER TEACHER CHAIR — taped envelope
  var envelopeMat = new THREE.MeshStandardMaterial({ color: 0xd4c8a0, roughness: 0.8 });
  var envelope = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.01, 0.14), envelopeMat);
  envelope.position.set(0, 0.02, -12.8);
  scene.add(envelope);
  registerInteractive(envelope, 'hidden_envelope');

  // 3) FILE CABINET TOP DRAWER — old photograph
  var photoFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.1, 0.01),
    new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.7 })
  );
  photoFrame.position.set(-8, 1.25, -11.74);
  scene.add(photoFrame);
  registerInteractive(photoFrame, 'hidden_photo');

  // 4) WALL NEAR DOOR — scratched tally marks (small plane)
  var tallyCanvas = document.createElement('canvas');
  tallyCanvas.width = 128; tallyCanvas.height = 64;
  var tctx = tallyCanvas.getContext('2d');
  tctx.fillStyle = 'rgba(0,0,0,0)';
  tctx.clearRect(0, 0, 128, 64);
  tctx.strokeStyle = '#4a3520';
  tctx.lineWidth = 2;
  // Draw tally groups (5 marks per group, 3 groups + 2)
  for (var g = 0; g < 3; g++) {
    for (var m = 0; m < 5; m++) {
      var x = 10 + g * 35 + m * 6;
      if (m < 4) {
        tctx.beginPath();
        tctx.moveTo(x, 10);
        tctx.lineTo(x, 50);
        tctx.stroke();
      } else {
        tctx.beginPath();
        tctx.moveTo(x - 24, 40);
        tctx.lineTo(x + 2, 15);
        tctx.stroke();
      }
    }
  }
  // 2 more
  for (var m2 = 0; m2 < 2; m2++) {
    tctx.beginPath();
    tctx.moveTo(115 + m2 * 6, 10);
    tctx.lineTo(115 + m2 * 6, 50);
    tctx.stroke();
  }
  var tallyTex = new THREE.CanvasTexture(tallyCanvas);
  var tallyMat = new THREE.MeshStandardMaterial({ map: tallyTex, transparent: true, opacity: 0.5, roughness: 0.9 });
  var tallyMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), tallyMat);
  tallyMesh.position.set(-7.2, 0.5, 14.44);
  tallyMesh.rotation.y = Math.PI;
  scene.add(tallyMesh);
  registerInteractive(tallyMesh, 'wall_tally');

  // 5) UV FLASHLIGHT — hidden behind a book on the bookshelf
  var uvLight = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.04, 0.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.3 })
  );
  uvLight.rotation.z = Math.PI / 2;
  uvLight.position.set(8.2, 0.7, -3.5);
  scene.add(uvLight);
  registerInteractive(uvLight, 'uv_flashlight');

  // 6) UV MESSAGE — invisible text on wall near whiteboard (only visible with UV)
  var uvMsgCanvas = document.createElement('canvas');
  uvMsgCanvas.width = 256; uvMsgCanvas.height = 64;
  var uvctx = uvMsgCanvas.getContext('2d');
  uvctx.clearRect(0, 0, 256, 64);
  uvctx.fillStyle = 'rgba(155, 89, 255, 0.8)';
  uvctx.font = 'bold 22px monospace';
  uvctx.textAlign = 'center';
  uvctx.fillText('THE KEY IS TAPED UNDER', 128, 25);
  uvctx.fillText('THE TEACHER\'S CHAIR', 128, 50);
  var uvMsgTex = new THREE.CanvasTexture(uvMsgCanvas);
  var uvMsgMat = new THREE.MeshStandardMaterial({
    map: uvMsgTex, transparent: true, opacity: 0, // invisible until UV
    emissive: 0x6622cc, emissiveIntensity: 0, roughness: 0.9
  });
  var uvMsgMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.4), uvMsgMat);
  uvMsgMesh.position.set(3, 1.8, -14.44);
  scene.add(uvMsgMesh);
  uvMsgMesh.userData.isUVMessage = true;
  registerInteractive(uvMsgMesh, 'uv_message');

  // 7) RED HERRING — suspicious painting with numbers
  var herringCanvas = document.createElement('canvas');
  herringCanvas.width = 200; herringCanvas.height = 200;
  var hctx = herringCanvas.getContext('2d');
  hctx.fillStyle = '#2a1f14';
  hctx.fillRect(0, 0, 200, 200);
  hctx.fillStyle = '#0a3d1a';
  hctx.fillRect(10, 10, 180, 140);
  // Landscape
  hctx.fillStyle = '#1a5c2a';
  hctx.beginPath();
  hctx.moveTo(10, 100);
  hctx.lineTo(60, 40);
  hctx.lineTo(110, 80);
  hctx.lineTo(150, 30);
  hctx.lineTo(190, 100);
  hctx.lineTo(190, 150);
  hctx.lineTo(10, 150);
  hctx.fill();
  // Suspicious numbers
  hctx.fillStyle = 'rgba(200,180,140,.4)';
  hctx.font = '16px serif';
  hctx.fillText(PUZZLE.decoySequence, 30, 170);
  hctx.fillText('???', 85, 190);
  var herringTex = new THREE.CanvasTexture(herringCanvas);
  var herringMat = new THREE.MeshStandardMaterial({ map: herringTex, roughness: 0.8 });
  var herringMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), herringMat);
  herringMesh.position.set(9.7, 1.6, 2);
  herringMesh.rotation.y = -Math.PI / 2;
  scene.add(herringMesh);
  registerInteractive(herringMesh, 'red_herring_painting');

  // 8) RED HERRING — locked box that can't be opened
  var lockedBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.15, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x3d2b1f, metalness: 0.1, roughness: 0.6 })
  );
  lockedBox.position.set(1, 0.82, -11);
  scene.add(lockedBox);
  // Small padlock
  var miniLock = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.06, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xd4a843, metalness: 0.8 })
  );
  miniLock.position.set(1, 0.82, -10.89);
  scene.add(miniLock);
  registerInteractive(lockedBox, 'red_herring_box');

  // 9) HIDDEN KEY — taped under teacher's chair (found via UV hint or random search)
  var hiddenKey = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.02, 0.03),
    new THREE.MeshStandardMaterial({ color: 0xd4a843, metalness: 0.7, roughness: 0.2 })
  );
  hiddenKey.position.set(0, 0.02, -12.2);
  scene.add(hiddenKey);
  registerInteractive(hiddenKey, 'hidden_key');
}

// UV light state
var hasUVLight = false;

function revealUVMessages() {
  hasUVLight = true;
  showToast('🔦 UV light equipped! Hidden messages revealed...', 'hint');
  if (scene) {
    scene.traverse(function(child) {
      if (child.userData && child.userData.isUVMessage && child.material) {
        child.material.opacity = 0.85;
        child.material.emissiveIntensity = 0.5;
        child.material.needsUpdate = true;
      }
    });
  }
}

/* ═══════════════════════════════════════════════════════════
   ITEM DEFINITIONS — randomized each playthrough via PUZZLE
═══════════════════════════════════════════════════════════ */

const ITEMS = {
  clock: {
    title: "⏰ The Wall Clock",
    body: `The large round clock on the wall has <strong>stopped</strong>.<br>
           The hour hand points to <strong>${PUZZLE.clockHour}</strong> and the minute hand to <strong>${PUZZLE.clockMinute}</strong> — it reads exactly <strong>${PUZZLE.clockTimeStr}</strong>.<br><br>
           Scratched into the clock's wooden frame:<br>
           <div class="clue-box">
             "When time stopped, the lesson began.<br>
              What do the hands tell you when you add them together?"
           </div>`,
    action: 'collect',
    item: '🕙 Clock Clue: the hands hold a number',
    log: 'Clock stopped at ' + PUZZLE.clockTimeStr + '. The hands tell a number...'
  },

  board: {
    title: "📋 The Chalkboard",
    body: `<strong>Math equations written in blue marker:</strong>
           <div class="clue-box">${PUZZLE.a1} × ${PUZZLE.b1} = ?<br>${PUZZLE.a2} + ${PUZZLE.b2} = ?</div>
           <strong>Cipher below in red:</strong>
           <div class="clue-box">→ E = P ~</div>
           <div class="clue-box"><em>"Solve both, then combine the answers."</em></div>`,
    inputPlaceholder: 'What do both answers add up to?',
    checkFn: v => v.replace(/\s/g, '') === String(PUZZLE.boardSum),
    successMsg: '✓ Correct! The board reveals its secret.',
    errorMsg: '✗ Not quite. Solve both equations, then add the results together.',
    onSuccess: () => {
      addInv('📋 Board Clue: the equations hide a number');
      markPuzzleDone(1);
    },
    log: 'Chalkboard: two equations wait to be solved'
  },

  skull: {
    title: "☠️ The Skull",
    body: `A human skull sits on the desk. You pick it up carefully. Something rattles inside.<br><br>
           A small scroll falls out:
           <div class="clue-box">
             "I guard a secret number — the key to the machine.<br>
              Count every bone in the human body, then ask yourself:<br>
              is the answer really <em>that</em> number, or something else entirely?"
           </div>
           <em>The scroll feels heavier than it should.</em>`,
    action: 'collect',
    item: '☠️ Skull Secret: a number for the machine',
    log: 'Skull holds a cryptic scroll about bones and the RTH machine'
  },

  rth: {
    title: "⚙️ The RTH Machine",
    body: `A boxy machine with colored buttons and a numeric keypad.<br>
           <em>"Enter the colour sequence, then the numeric code."</em><br><br>
           The machine hums quietly, waiting for input.`,
    inputPlaceholder: 'Enter the numeric code',
    checkFn: v => v.replace(/\s/g, '') === String(PUZZLE.rthCode),
    successMsg: '✓ The machine whirs and unlocks!',
    errorMsg: '✗ The machine buzzes angrily. Wrong code.',
    onSuccess: () => {
      addInv('⚙️ RTH Machine: unlocked — reveals a colour pattern');
      markPuzzleDone(2);
    },
    log: 'The RTH machine waits for a code.'
  },

  shelf: {
    title: "📚 The Bookshelf",
    body: `Floor-to-ceiling shelves packed with colored books.<br><br>
           A <strong>black book with a gold keyhole</strong> catches your eye.<br><br>
           Inside:
           <div class="clue-box">
             "The door remembers two things the room taught you.<br>
              The first lesson is about <em>time</em>.<br>
              The second is about <em>numbers on the board</em>.<br>
              String them together."
           </div>`,
    action: 'collect',
    item: '📚 Shelf Book: two lessons make the door code',
    log: 'Bookshelf: gold-keyhole book speaks of time and numbers'
  },

  door: {
    title: "🚪 The Exit Door",
    body: function() {
      var lockStatus = '';
      lockStatus += '<br><strong>Door Locks:</strong><br>';
      lockStatus += (doorLocks.padlock ? '✅' : '🔒') + ' Padlock — ' + (doorLocks.padlock ? '<span style="color:var(--ok)">Unlocked</span>' : 'Needs a key') + '<br>';
      lockStatus += (doorLocks.chain ? '✅' : '⛓') + ' Chain — ' + (doorLocks.chain ? '<span style="color:var(--ok)">Removed</span>' : 'Held by the RTH machine\'s lock') + '<br>';
      lockStatus += (doorLocks.keypad ? '✅' : '🔢') + ' Keypad — ' + (doorLocks.keypad ? '<span style="color:var(--ok)">Code accepted</span>' : 'Waiting for code') + '<br>';
      if (!doorLocks.padlock && !doorLocks.chain) {
        return 'The heavy wooden door. Your only way out.<br>Three locks keep it sealed tight.' + lockStatus +
          '<div class="clue-box">"Two secrets, side by side, open the keypad.<br>But the padlock needs a key, and the chain... the machine holds that secret."</div>';
      }
      if (!doorLocks.keypad) {
        return 'The door is almost free.' + lockStatus +
          '<div class="clue-box">"Two secrets, side by side, open this door.<br>The first comes from the clock. The second from the board."</div>';
      }
      return 'The door stands open. Freedom awaits.' + lockStatus;
    },
    inputPlaceholder: 'Enter the keypad code',
    checkFn: function(v) {
      if (v.trim() === PUZZLE.doorCode) {
        return true;
      }
      return false;
    },
    successMsg: '✓ The keypad beeps — code accepted!',
    errorMsg: '✗ The keypad flashes red. Try again.',
    onSuccess: function() {
      unlockDoorPart('keypad');
      markPuzzleDone(6);
    },
    log: 'The exit door awaits your code.'
  },

  globe_l: {
    title: "🌍 Globe",
    body: `A beautiful globe on a stand. You spin it and it stops over Africa.<br><br>
           On the base, a sticker reads:
           <div class="clue-box">
             "Mercury=1, Venus=2, <strong>Earth=3</strong>, Mars=4..."<br>
             <em>Afrika lê op die 3de planeet.</em>
           </div>
           <strong>Earth is the 3rd planet — and South Africa sits at the very tip.</strong>`,
    action: 'collect',
    item: '🌍 Globe Clue: Earth=3rd planet',
    log: 'Globe: Earth is 3rd planet; Afrika at the bottom'
  },

  map: {
    title: "🗺️ Map of South Africa",
    body: `A large, colourful map of South Africa on the wall. Three cities are circled in red:<br>
           <div class="clue-box">
             eGoli (Johannesburg) → 1<br>
             iKapa (Cape Town) → 2<br>
             <strong>eThekwini (Durban) → 3</strong>
           </div>
           <em>"The answer is always the last one, sharp."</em>`,
    action: 'collect',
    item: '🗺️ Map Clue: eThekwini (Durban)=3',
    log: 'Map of SA: Durban circled as 3rd city'
  },

  candle: {
    title: "🕯️ The Candle",
    body: `A white candle in a brass holder. Wax drips down like the Cape Malay candles at Eid.<br><br>
           Scratched into the cooling wax:
           <div class="clue-box">"When all else fails — the answer glows, neh."</div>
           The flame flickers toward the boekrak (bookshelf).`,
    action: 'none',
    log: "Candle: 'the answer glows' — pointing at boekrak"
  },

  window: {
    title: "🪟 The Window",
    body: `Bright afternoon sun streams through the glass — typical Highveld weather.<br><br>
           The latch is locked and there are burglar bars outside. You can see the school grounds beyond — freedom, just out of reach.<br><br>
           <em>Hayibo! Not this way out. Find the deur code.</em>`,
    action: 'none',
    log: 'Window: burglar-proofed, locked tight — typical Mzansi school'
  },

  teacher: {
    title: "\ud83d\udc68\u200d\ud83c\udfeb Mr. Nkosi (Umfundisi)",
    body: `Mr. Nkosi looks up from a stack of matric papers, adjusting his spectacles.<br><br>
           <em>"Eish, still here? I told you all — in this klaskamer, nothing is by accident. Every object has a purpose. Start with what you can <strong>see</strong>, not what you can guess, neh?<br><br>
           Die witbord has today's equations — solve them. The clock will tell you its own story. And that skull... yoh, it knows things about the human body that might help with the machine, sharp?"</em><br><br>
           He taps his pen on the desk impatiently, then mutters something in Zulu.`,
    action: 'none',
    log: 'Mr. Nkosi: "In this klaskamer, nothing is by accident, neh?"'
  },

  student_mia: {
    title: "👩 Amahle",
    body: `Amahle is crouched by the boekrak, flipping through old books.<br><br>
           <em>"Eish! There's a book in here with a gold keyhole — something about needing two numbers for the deur. I think this klaskamer is trying to teach us something, sharp... Have you checked the clock? Time isn't just for watching, neh?"</em><br><br>
           <div class="clue-box">💡 <strong>Hint:</strong> The clock isn't just decoration. What happens when the hands speak mathematics?</div>`,
    action: 'none',
    log: 'Amahle: "The clock isn\'t just decoration, neh?"'
  },

  student_tate: {
    title: "👨 Sipho",
    body: `Sipho is leaning against the window, staring outside at the school grounds.<br><br>
           <em>"Yoh! I heard Mr. Nkosi muttering about the whiteboard before he locked us in, eish. Something about 'solving both and combining.' The equations up there aren’t homework, bra — they're a leidraad (clue). You need to do the wiskunde yourself."</em><br><br>
           <div class="clue-box">💡 <strong>Hint:</strong> The whiteboard has two equations. Solve each one, then think about what happens when you add the results.</div>`,
    action: 'none',
    log: 'Sipho: "The whiteboard equations are a clue, not homework, sharp."'
  },

  student_lina: {
    title: "👩 Zinhle",
    body: `Zinhle is standing in the middle of the room, arms crossed, thinking hard.<br><br>
           <em>"Okay, so the deur needs a code — I know that much, sharp. The boekrak book says it's made of <strong>two parts</strong>. One from something that <em>measures time</em>, one from something that <em>teaches numbers</em>. Put them side by side... not added, not multiplied — just <strong>side by side</strong>, neh."</em><br><br>
           <div class="clue-box">💡 <strong>Hint:</strong> The door code is two numbers placed next to each other. Find each one separately.</div>`,
    action: 'none',
    log: 'Zinhle: "Two parts, side by side — not added, sharp."'
  },

  student_omar: {
    title: "👨 Kagiso",
    body: `Kagiso is near the file cabinet, going through papers.<br><br>
           <em>"I found some notes about the RTH machine, bra. It needs a numeric code to unlock. The skull on the onderwysertafel (teacher’s desk) — there’s something inside it. A scroll, maybe? Whatever’s written there is the key to the machine, sharp. But you’ll have to figure it out yourself."</em><br><br>
           <div class="clue-box">💡 <strong>Hint:</strong> Examine the skull. What it reveals is the RTH machine's code.</div>`,
    action: 'none',
    log: 'Kagiso: "The skull holds the RTH machine\'s secret, sharp."'
  },

  student_nia: {
    title: "👩 Naledi",
    body: `Naledi is pacing by the deur, looking anxious, her koki-pen twirling.<br><br>
           <em>"Eish, I've been staring at this kodeblad for ages! It wants digits, but how many? I counted the buttons… I <strong>think</strong> it’s a four-digit code. Two from somewhere, two from somewhere else. Everyone keeps talking about the horlosie and the witbord. Maybe they’re right, hey."</em><br><br>
           <div class="clue-box">💡 <strong>Hint:</strong> The keypad wants exactly 4 digits. Two sources, two numbers, one code.</div>`,
    action: 'none',
    log: 'Naledi: "Four digits. Two sources, eish."'
  },

  student_alex: {
    title: "👨 Thabo",
    body: `Thabo is sitting on the storage cabinet, swinging his legs and humming a kwaito beat.<br><br>
           <em>"The globe says Earth is the 3rd planet, sharp. And the SA map on the wall has three cities circled — Joburg, Cape Town, Durban. The <strong>globe clue</strong> and the <strong>SA map</strong> definitely feed into something, bra. Check the map — cities are circled, and the last one is your answer."</em><br><br>
           <div class="clue-box">💡 <strong>Hint:</strong> The globe and SA map are connected. The third city is your number.</div>`,
    action: 'none',
    log: 'Thabo: "Globe + SA Map seem linked, sharp."'
  },

  student_jordan: {
    title: "👩 Lethabo",
    body: `Lethabo is standing near the witbord, studying the equations with a determined look.<br><br>
           <em>"See these equations? Mr. Nkosi wrote them before leaving, eish. They're not random wiskunde — they’re <strong>part of something bigger</strong>. You need to actually solve them, then combine the answers somehow. The other half of the puzzle is somewhere else in the klaskamer."</em><br><br>
           <div class="clue-box">💡 <strong>Hint:</strong> The whiteboard gives you half the door code. The other half is elsewhere.</div>`,
    action: 'none',
    log: 'Lethabo: "The witbord is half the puzzle, sharp."'
  },

  student_sam: {
    title: "👨 Mpho",
    body: `Mpho is near the back of the room, looking at the prikborde (bulletin boards).<br><br>
           <em>"These prikborde have some interesting stuff, neh. But honestly, bra? Don't get distracted by everything. The <strong>two most important objects</strong> in this klaskamer for escaping are things that display numbers. One moves (or used to), one's written down. Find both, sharp."</em><br><br>
           <div class="clue-box">💡 <strong>Hint:</strong> Two objects with numbers are the key. One used to move, one is written.</div>`,
    action: 'none',
    log: 'Mpho: "Two objects with numbers. Focus, sharp."'
  },

  student_riley: {
    title: "👩 Asanda",
    body: `Asanda is standing in the centre of the room, checking her watch impatiently.<br><br>
           <em>"Eish, time's running out! The onderwysertafel has a skull, a globe, and that RTH machine. Each one tells you something different, sharp. But for the <strong>deur</strong> specifically — don't overthink it, neh. The klaskamer has two big leidrade staring you in the face. One's on the wall, one's also on the wall but higher up."</em><br><br>
           <div class="clue-box">💡 <strong>Hint:</strong> Both main clues are on the walls. Look up and look ahead.</div>`,
    action: 'none',
    log: 'Asanda: "Both main clues are on the walls, eish."'
  },

  student_casey: {
    title: "👨 Jabulani",
    body: `Jabulani is near the trash cans, kicking one impatiently.<br><br>
           <em>"Aaaaai, I just want out of here, bra! Someone said the boekrak has a secret. And the SA map has circled cities. But if you just want to <strong>ontsnap</strong> (escape)... the answer is simpler than you think. Two things in this klaskamer show numbers. Figure them out, stick them together. That's literally it, sharp sharp."</em><br><br>
           <div class="clue-box">💡 <strong>Hint:</strong> It's simpler than you think. Two numbers → one code → vryheid (freedom).</div>`,
    action: 'none',
    log: 'Jabulani: "Two numbers, one code. Simple, sharp sharp."'
  },

  // ═══ HIDDEN COMPARTMENTS & STORY ITEMS ═══

  hidden_drawer: {
    title: "🗄️ Teacher's Desk — Bottom Drawer",
    body: `You pull open the bottom drawer of Mr. Nkosi's desk. Inside, under a stack of old matric papers, you find a <strong>worn journal page</strong>:<br><br>
           <div class="story-note">
             <em>"Day 17 in Room 14B. The horlosie stopped again today. Mr. Nkosi says time doesn’t matter here — only the numbers matter. I’ve been counting everything. The bones in my body. The equations on the witbord. The planets from the sun.<br><br>
             I found a flashlight behind the boekrak yesterday. It shows things written on the walls that you can’t normally see. Purple letters in the dark, yoh.<br><br>
             I’m close to getting out. The deur has three locks. I just need the sleutel..."</em>
             <div class="signature">— T.M., Student #16, Mzansi High</div>
           </div>
           <em>Student #16... You wonder how many have been through this klaskamer before you.</em>`,
    action: 'collect',
    item: '📜 Journal Page: Student #16\'s notes',
    log: 'Found a journal page from a previous student in the desk drawer...'
  },

  hidden_envelope: {
    title: "📧 Envelope Under the Chair",
    body: `You reach under the teacher’s chair and feel something taped to the underside. A small manila envelope.<br><br>
           Inside is a folded note:
           <div class="story-note">
             <em>"As jy dit lees, het jy gevind wat die UV-lig gewys het. Slim, sharp.<br><br>
             The key to the padlock is in this envelope. Use it on the deur.<br><br>
             Sterkte! (Good luck.) You’ll need it."</em>
             <div class="signature">— Room 14B Onderhoud (Maintenance)</div>
           </div>
           <strong>You find a small brass key inside!</strong>`,
    action: 'collect',
    item: '🔑 Brass Key (from envelope)',
    log: 'Found a brass key in an envelope under the teacher\'s chair!'
  },

  hidden_key: {
    title: "🔑 Something Shiny",
    body: `Near the teacher's chair, almost invisible against the dark floor, you spot a tiny glint of metal. A <strong>small brass key</strong>, taped to the floor with aging tape.<br><br>
           <em>This must unlock something important.</em>`,
    action: 'collect',
    item: '🔑 Brass Key (floor)',
    log: 'Found a small brass key near the teacher\'s chair!'
  },

  hidden_photo: {
    title: "📷 Old Photograph",
    body: `On top of the file cabinet, face-down, you find a faded photograph. It shows a group of learners standing in <em>this very klaskamer</em>. The date on the back reads: <strong>1994</strong>.<br><br>
           <div class="story-note">
             <em>"Class of '94 — Room 14B Final Challenge, Mzansi High"</em><br>
             Seventeen faces smile at the camera. The new SA flag is pinned to the wall behind them. But someone has drawn a red X over one of them — <strong>Student #16</strong>.<br><br>
             On the back, in different handwriting:<br>
             <em>"She got out. 7 minutes 42 seconds. Still the record."</em>
           </div>
           <em>1994 — the year of freedom. This room has a history...</em>`,
    action: 'collect',
    item: '📷 Old Photo: Class of \'94',
    log: 'Found an old photograph of previous learners in Room 14B...'
  },

  wall_tally: {
    title: "📊 Scratch Marks on the Wall",
    body: `Low on the wall near the deur, barely visible, someone has scratched tally marks into the plaster.<br><br>
           <div class="tally-marks">||||  ||||  ||||  ||</div>
           <br><strong>Sewentien (Seventeen) marks.</strong> One for each learner who’s been locked in this klaskamer?<br><br>
           Below the tallies, scratched smaller in isiZulu:<br>
           <div class="story-note">
             <em>"Wonke umuntu uyaphumelela. Abanye bathatha isikhathi eside."</em><br>
             <em>(Everyone gets out eventually. Some just take longer than others.)</em>
           </div>
           <em>You'd better make that eighteen.</em>`,
    action: 'none',
    log: 'Tally marks near the deur: 17 scratches. You\'re #18.'
  },

  uv_flashlight: {
    title: "🔦 Blacklight Flashlight",
    body: `Hidden behind a row of books on the shelf, you find a small <strong>UV flashlight</strong>. The previous student's journal mentioned this!<br><br>
           You click it on. A purple glow fills the area around you.<br><br>
           <em>With this, you might be able to see things written on the walls that are invisible to the naked eye...</em>`,
    action: 'collect',
    item: '🔦 UV Flashlight',
    log: 'Found a UV flashlight behind the bookshelf! Hidden messages may appear...',
    onCollect: function() { revealUVMessages(); }
  },

  uv_message: {
    title: "✨ Hidden UV Message",
    body: function() {
      if (!hasUVLight) {
        return 'You squint at the wall. There might be something here, but you can\'t quite make it out in normal light...<br><br><em>Maybe you need a special kind of light?</em>';
      }
      return 'Under the UV light, glowing purple text appears on the wall:<br><br><div class="clue-box"><span class="uv-reveal">"THE KEY IS TAPED UNDER THE TEACHER\'S CHAIR"</span></div><br><em>Someone left this message for the next person locked in here. You should check under the chair!</em>';
    },
    action: 'none',
    log: 'UV message found on the wall!'
  },

  red_herring_painting: {
    title: "🖼️ Landscape Painting",
    body: `A small oil painting of a mountain landscape. Unremarkable, except...<br><br>
           Faintly visible in the corner of the frame, someone has written:<br>
           <div class="clue-box">${PUZZLE.decoySequence}<br>???</div>
           <em>What do these numbers mean? Or... do they mean anything at all?</em><br><br>
           You stare at them for a moment. They don't match any pattern you've seen in the room. ${PUZZLE.decoyMessage}<br><br>
           <strong>Sometimes the answer is: it doesn't mean anything.</strong>`,
    action: 'none',
    log: 'Painting decoy sequence found — probably a red herring.'
  },

  red_herring_box: {
    title: "📦 Small Locked Box",
    body: `A small wooden box with a tiny brass padlock sits on the desk. You shake it — something <em>rattles</em> inside.<br><br>
           No matter how you try, the lock won't budge. The key must be somewhere...<br><br>
           <em>Wait — is this actually important, or just another distraction in Room 14B?</em><br><br>
              <div class="story-note">Scratched on the bottom: <em>"${PUZZLE.decoyMessage}"</em></div>`,
    action: 'none',
            log: 'Locked box note found — decoy clue confirmed.'
  }
};

const ESCAPE_SLIDE_CLUES_KEY = 'slidePlayEscapeCluesV1';
const ESCAPE_FROM_UPLOAD = new URLSearchParams(window.location.search).get('source') === 'upload';
const GENERATED_QUIZ_KEY = 'slidePlayGeneratedQuizData';
const UPLOADED_FILES_KEY = 'slidePlayUploadedFiles';
const DEMO_SESSION_KEY = 'slidePlayDemoSession';
const BASE_ITEM_BODIES = {};
Object.keys(ITEMS).forEach(function (key) {
  BASE_ITEM_BODIES[key] = ITEMS[key].body;
});

function readJsonStorage(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed ?? fallback;
  } catch (_error) {
    return fallback;
  }
}

function getEscapeSourceContext() {
  const uploadedFiles = readJsonStorage(UPLOADED_FILES_KEY, []);
  const quizData = readJsonStorage(GENERATED_QUIZ_KEY, []);
  const demoSession = readJsonStorage(DEMO_SESSION_KEY, null);

  const firstFile = Array.isArray(uploadedFiles) && uploadedFiles.length > 0 ? uploadedFiles[0] : null;
  const rawTopic = demoSession && demoSession.title
    ? demoSession.title
    : (firstFile && firstFile.originalName ? firstFile.originalName : '');
  const topicLabel = String(rawTopic || '').replace(/\.[^.]+$/, '').trim();

  const quizClues = (Array.isArray(quizData) ? quizData : [])
    .map(function (item) { return String(item && item.question ? item.question : '').trim(); })
    .filter(Boolean)
    .slice(0, 4);

  return {
    topicLabel: topicLabel,
    quizClues: quizClues,
    hasSource: Boolean(topicLabel) || quizClues.length > 0,
  };
}

const ESCAPE_SOURCE_CONTEXT = getEscapeSourceContext();

function readEscapeSlideClues() {
  if (window.__escapeSlideClues && Array.isArray(window.__escapeSlideClues.clues)) {
    return window.__escapeSlideClues;
  }
  try {
    return JSON.parse(localStorage.getItem(ESCAPE_SLIDE_CLUES_KEY) || 'null');
  } catch (_error) {
    return null;
  }
}

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function withSlideCue(baseBody, cueText) {
  if (!cueText) return baseBody;
  const cueBlock = '<div class="clue-box">📘 <strong>Slide Clue:</strong> ' + escapeHtml(cueText) + '</div>';

  if (typeof baseBody === 'function') {
    return function () {
      return baseBody() + '<br><br>' + cueBlock;
    };
  }

  return String(baseBody) + '<br><br>' + cueBlock;
}

function applySourceContextToUi(clueData) {
  if (!ESCAPE_FROM_UPLOAD) return;

  const topic = ESCAPE_SOURCE_CONTEXT.topicLabel;
  const clues = clueData && Array.isArray(clueData.clues) ? clueData.clues.filter(Boolean) : [];
  const quizClues = ESCAPE_SOURCE_CONTEXT.quizClues;
  const summary = clueData && clueData.summary ? String(clueData.summary) : '';

  if (topic) {
    OBJECTIVES[0] = { text: 'Explore clues from your source: ' + topic, icon: '🎯' };
    OBJECTIVES[1] = { text: 'Start with the clock clue for ' + topic, icon: '⏰' };
    if (GM_COMMENTS[480]) {
      GM_COMMENTS[480].text = 'Eish! Your source topic is ' + topic + '. Begin with the clock and board, sharp.';
    }
  }

  const hintPool = clues.length > 0 ? clues : quizClues;
  if (hintPool.length > 0) {
    HINTS = [
      'Source clue: ' + hintPool[0],
      'Source clue: ' + (hintPool[1] || hintPool[0]),
      'Investigate the skull and machine to connect these source clues.',
      'Use your source understanding to unlock the next puzzle step.',
      'Check bookshelf and map for support clues from this topic.',
      summary || 'Combine puzzle outputs and enter the final code to escape.'
    ];
  }
}

function applySlideCluesToItems() {
  if (!ESCAPE_FROM_UPLOAD) return;

  const clueData = readEscapeSlideClues();
  applySourceContextToUi(clueData);
  if (!clueData || !Array.isArray(clueData.clues) || clueData.clues.length === 0) {
    return;
  }

  // Restore base bodies first, then reapply to avoid duplicate appends.
  Object.keys(BASE_ITEM_BODIES).forEach(function (key) {
    if (ITEMS[key]) ITEMS[key].body = BASE_ITEM_BODIES[key];
  });

  const clues = clueData.clues;
  const npcHints = Array.isArray(clueData.npcHints) ? clueData.npcHints : [];
  const mission = clueData.summary ? String(clueData.summary) : '';

  if (ITEMS.clock) ITEMS.clock.body = withSlideCue(ITEMS.clock.body, clues[0] || mission);
  if (ITEMS.board) ITEMS.board.body = withSlideCue(ITEMS.board.body, clues[1] || clues[0]);
  if (ITEMS.skull) ITEMS.skull.body = withSlideCue(ITEMS.skull.body, clues[2] || clues[1]);
  if (ITEMS.rth) ITEMS.rth.body = withSlideCue(ITEMS.rth.body, clues[3] || clues[2]);
  if (ITEMS.shelf) ITEMS.shelf.body = withSlideCue(ITEMS.shelf.body, clues[4] || clues[3]);
  if (ITEMS.door) ITEMS.door.body = withSlideCue(ITEMS.door.body, clues[5] || mission || clues[0]);

  if (ITEMS.teacher) ITEMS.teacher.body = withSlideCue(ITEMS.teacher.body, npcHints[0] || clues[0]);
  if (ITEMS.student_mia) ITEMS.student_mia.body = withSlideCue(ITEMS.student_mia.body, npcHints[1] || clues[1]);
  if (ITEMS.student_tate) ITEMS.student_tate.body = withSlideCue(ITEMS.student_tate.body, npcHints[2] || clues[2]);
  if (ITEMS.student_lina) ITEMS.student_lina.body = withSlideCue(ITEMS.student_lina.body, npcHints[3] || clues[3]);

}

applySlideCluesToItems();
window.addEventListener('slide-clues-ready', applySlideCluesToItems);

/* ═══════════════════════════════════════════════════════════
   CLICK DETECTION & INTERACTION
═══════════════════════════════════════════════════════════ */

function onMouseClick() {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactiveObjects);

  if (intersects.length > 0) {
    const obj = intersects[0].object;
    const itemKey = obj.userData.itemKey;
    if (itemKey && ITEMS[itemKey]) {
      showItemModal(itemKey);
    }
  }
}

function showItemModal(itemKey) {
  const item = ITEMS[itemKey];
  if (!item) return;

  // Track interaction time for GM idle commentary
  if (G.startTime) lastInteractionTime = Math.round((Date.now() - G.startTime) / 1000);

  // Resolve dynamic body (function or string)
  var bodyContent = typeof item.body === 'function' ? item.body() : item.body;

  let inputConfig = null;

  if (item.checkFn && item.inputPlaceholder) {
    inputConfig = {
      placeholder: item.inputPlaceholder,
      checkFn: item.checkFn,
      successMsg: item.successMsg,
      errorMsg: item.errorMsg,
      onSuccess: item.onSuccess,
      puzzleId: item.puzzleId
    };
  } else if (item.action === 'collect') {
    addInv(item.item);
    addLog(item.log);
    // Call onCollect if it exists (e.g., UV flashlight)
    if (item.onCollect) item.onCollect();
    // Check if collected key should unlock padlock
    checkKeyUnlock();
    return showModal(item.title, bodyContent);
  }

  showModal(item.title, bodyContent, inputConfig);
}

// Check if player has a key and auto-unlock padlock
function checkKeyUnlock() {
  if (doorLocks.padlock) return;
  var hasKey = G.inv.some(function(i) { return i.indexOf('🔑') !== -1; });
  if (hasKey) {
    SFX.keyFound();
    setTimeout(function() {
      unlockDoorPart('padlock');
      showGMBubble('A lock clicks open on the door. One down...', 4000);
    }, 800);
  }
}

/* ═══════════════════════════════════════════════════════════
   INTERACTION HINT (show "CLICK to examine" when looking at objects)
═══════════════════════════════════════════════════════════ */

let _lastHoveredObj = null;

function updateInteractionHint() {
  var hint = _domHint || document.getElementById('interaction-hint');
  mouse.x = 0;
  mouse.y = 0;
  raycaster.setFromCamera(mouse, camera);
  var intersects = raycaster.intersectObjects(interactiveObjects);

  // Un-highlight previous hovered object (instead of resetting ALL objects)
  if (_lastHoveredObj && _lastHoveredObj.material && _lastHoveredObj.userData.originalEmissive !== undefined) {
    _lastHoveredObj.material.emissive.setHex(_lastHoveredObj.userData.originalEmissive);
    _lastHoveredObj = null;
  }

  var crosshair = _domCrosshair || document.getElementById('crosshair');
  if (intersects.length > 0) {
    var obj = intersects[0].object;
    if (obj.material && obj.userData.originalEmissive !== undefined) {
      obj.material.emissive.setHex(0x665500);
      _lastHoveredObj = obj;
    }
    hint.classList.add('show');
    if (crosshair) crosshair.classList.add('hover');
  } else {
    hint.classList.remove('show');
    if (crosshair) crosshair.classList.remove('hover');
  }
}

/* ═══════════════════════════════════════════════════════════
   ANIMATION LOOP
═══════════════════════════════════════════════════════════ */

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(gameClock.getDelta(), 0.05); // cap delta to avoid spiral on lag

  // Skip movement/animation when paused — still render for visibility
  if (G.paused) {
    renderer.render(scene, camera);
    return;
  }

  _frameCount++;

  // Movement direction from player facing (reuse pre-allocated vectors)
  _forward.set(0, 0, -1).applyQuaternion(player.quaternion).normalize();
  _right.set(1, 0, 0).applyQuaternion(player.quaternion).normalize();

  // Build desired movement direction
  _moveDir.set(0, 0, 0);
  const moving = keys['w'] || keys['s'] || keys['a'] || keys['d'];
  if (keys['w']) _moveDir.addScaledVector(_forward, 1);
  if (keys['s']) _moveDir.addScaledVector(_forward, -1);
  if (keys['a']) _moveDir.addScaledVector(_right, -1);
  if (keys['d']) _moveDir.addScaledVector(_right, 1);

  if (moving) {
    _moveDir.normalize();
    // Smooth acceleration toward target velocity
    velocity.x += (_moveDir.x * BASE_SPEED - velocity.x) * MOVE_ACCEL * dt * 10;
    velocity.z += (_moveDir.z * BASE_SPEED - velocity.z) * MOVE_ACCEL * dt * 10;
  } else {
    // Smooth deceleration (friction)
    velocity.x *= Math.pow(MOVE_DECEL, dt * 60);
    velocity.z *= Math.pow(MOVE_DECEL, dt * 60);
    // Stop micro-movement
    if (Math.abs(velocity.x) < 0.01) velocity.x = 0;
    if (Math.abs(velocity.z) < 0.01) velocity.z = 0;
  }

  const actuallyMoving = velocity.length() > 0.05;

  // Apply velocity to position (reuse pre-allocated vector)
  _newPos.copy(player.position);
  _newPos.x += velocity.x * dt;
  _newPos.z += velocity.z * dt;

  // Wall bounds
  const margin = 1.0;
  _newPos.x = Math.max(-8.5 + margin, Math.min(8.5 - margin, _newPos.x));
  _newPos.z = Math.max(-13.5 + margin, Math.min(13.5 - margin, _newPos.z));

  // Collision detection against furniture & students
  const playerRadius = 0.45;
  if (!checkCollision(_newPos.x, _newPos.z, playerRadius)) {
    player.position.copy(_newPos);
  } else {
    // Try sliding along each axis independently
    _slideX.copy(player.position);
    _slideX.x = _newPos.x;
    _slideZ.copy(player.position);
    _slideZ.z = _newPos.z;
    if (!checkCollision(_slideX.x, _slideX.z, playerRadius)) {
      player.position.x = _slideX.x;
    } else {
      velocity.x = 0; // stop velocity on collision axis
    }
    if (!checkCollision(_slideZ.x, _slideZ.z, playerRadius)) {
      player.position.z = _slideZ.z;
    } else {
      velocity.z = 0;
    }
  }

  // Walking animation — smooth procedural bob, sway, lean with acceleration
  if (playerModel) {
    const baseY = playerModel.userData.baseY || playerModel.position.y;
    if (!playerModel.userData.baseY) playerModel.userData.baseY = baseY;

    const currentSpeed = velocity.length();
    const walkIntensity = Math.min(currentSpeed / BASE_SPEED, 1.0);

    if (actuallyMoving) {
      walkTime += dt * (3.5 + walkIntensity * 3.5); // walk cycle frequency scales with speed
      idleTime = 0;
      // Smooth vertical bob (double-step frequency)
      const bob = Math.abs(Math.sin(walkTime * 2)) * 0.035 * walkIntensity;
      playerModel.position.y = baseY + bob;
      // Smooth left-right sway
      playerModel.rotation.z = Math.sin(walkTime) * 0.025 * walkIntensity;
      // Forward lean proportional to speed
      const targetLean = 0.03 * walkIntensity;
      playerModel.rotation.x += (targetLean - playerModel.rotation.x) * 0.12;
    } else {
      // Idle — breathing animation (subtle rise/fall + micro-sway)
      idleTime += dt;
      const breathe = Math.sin(idleTime * 1.5) * 0.006; // slow subtle bob
      const microSway = Math.sin(idleTime * 0.8) * 0.004; // very gentle side sway
      playerModel.position.y += (baseY + breathe - playerModel.position.y) * 0.08;
      playerModel.rotation.z += (microSway - playerModel.rotation.z) * 0.06;
      playerModel.rotation.x += (0 - playerModel.rotation.x) * 0.06;
      // Gradually slow walk cycle
      walkTime *= 0.95;
    }
  }

  // Subtle idle sway for NPC student models (direct array, no scene.traverse)
  var t = gameClock.elapsedTime;
  for (var si = 0; si < studentModels.length; si++) {
    var sm = studentModels[si];
    var seed = sm.userData.swayOffset || 0;
    sm.rotation.y = sm.userData.baseRotY + Math.sin(t * 0.6 + seed) * 0.015;
    sm.position.y = sm.userData.basePosY + Math.sin(t * 1.2 + seed) * 0.003;
  }

  // Click-to-move lerp
  if (clickToMoveTarget && !moving) {
    var dx = clickToMoveTarget.x - player.position.x;
    var dz = clickToMoveTarget.z - player.position.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.3) {
      var moveSpeed = BASE_SPEED * 0.6;
      velocity.x += (dx / dist * moveSpeed - velocity.x) * MOVE_ACCEL * dt * 10;
      velocity.z += (dz / dist * moveSpeed - velocity.z) * MOVE_ACCEL * dt * 10;
    } else {
      clickToMoveTarget = null;
    }
  }
  if (moving) clickToMoveTarget = null; // manual movement cancels click-to-move

  // Animate door opening if in progress
  animateDoorOpen(dt);
  updateMultiplayerTeammate(dt);

  // Per-frame: interaction hint + raycast (needed for responsive crosshair)
  updateInteractionHint();
  // Throttled: distance glow (every 6 frames) and minimap (every 10 frames)
  if (_frameCount % GLOW_INTERVAL === 0) updateDistanceGlow();
  if (_frameCount % MINIMAP_INTERVAL === 0) drawMinimap();
  checkGMCommentary();
  renderer.render(scene, camera);
}

/* ═══════════════════════════════════════════════════════════
   WINDOW RESIZE
═══════════════════════════════════════════════════════════ */

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ═══════════════════════════════════════════════════════════
   INIT & START
═══════════════════════════════════════════════════════════ */

function setupStartupBindings() {
  function normalizePlayMode(raw) {
    const v = String(raw || '').toLowerCase();
    if (v === 'multiplayer' || v === '2p' || v === '2-player' || v === 'two-player') return 'multiplayer';
    if (v === 'tournament') return 'multiplayer';
    return 'solo';
  }

  function getInitialPlayMode() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('playStyle') || '';
    const fromStorage = localStorage.getItem(PLAY_STYLE_KEY) || '';
    return normalizePlayMode(fromQuery || fromStorage || 'solo');
  }

  function applyModeUi(mode) {
    const soloBtn = document.getElementById('mode-solo-btn');
    const multiBtn = document.getElementById('mode-multi-btn');
    const note = document.getElementById('mode-note');
    const mpSettings = document.getElementById('multiplayer-settings');
    if (soloBtn) soloBtn.classList.toggle('active', mode === 'solo');
    if (multiBtn) multiBtn.classList.toggle('active', mode === 'multiplayer');
    if (mpSettings) mpSettings.hidden = mode !== 'multiplayer';
    if (note) {
      note.textContent = mode === 'multiplayer'
        ? 'Multiplayer selected: live cross-device session (no tournament mode).'
        : 'Solo selected.';
    }
  }

  function setPlayMode(mode, persist) {
    selectedPlayMode = normalizePlayMode(mode);
    applyModeUi(selectedPlayMode);
    if (persist !== false) {
      localStorage.setItem(PLAY_STYLE_KEY, selectedPlayMode);
      localStorage.setItem(PLAY_PLAYERS_KEY, selectedPlayMode === 'multiplayer' ? '2' : '1');
    }
  }

  function hydrateMultiplayerInputs() {
    const mpServer = document.getElementById('mp-server');
    const mpRoom = document.getElementById('mp-room');
    const mpName = document.getElementById('mp-name');
    const defaultServer = localStorage.getItem(MP_SERVER_KEY) || 'ws://localhost:8081';
    const defaultRoom = localStorage.getItem(MP_ROOM_KEY) || 'room-14b';
    const defaultName = localStorage.getItem(MP_NAME_KEY) || ('Player-' + Math.floor(100 + Math.random() * 900));
    if (mpServer) mpServer.value = defaultServer;
    if (mpRoom) mpRoom.value = defaultRoom;
    if (mpName) mpName.value = defaultName;
  }

  if (!window.__escape3dModeInit) {
    window.__escape3dModeInit = true;
    hydrateMultiplayerInputs();
    setPlayMode(getInitialPlayMode(), true);
  } else {
    applyModeUi(selectedPlayMode);
  }

  const soloBtn = document.getElementById('mode-solo-btn');
  if (soloBtn && !soloBtn.dataset.bound) {
    soloBtn.dataset.bound = '1';
    soloBtn.addEventListener('click', function () { setPlayMode('solo', true); });
  }

  const multiBtn = document.getElementById('mode-multi-btn');
  if (multiBtn && !multiBtn.dataset.bound) {
    multiBtn.dataset.bound = '1';
    multiBtn.addEventListener('click', function () { setPlayMode('multiplayer', true); });
  }

  const startBtn = document.getElementById('start-game');
  if (startBtn && !startBtn.dataset.bound) {
    startBtn.dataset.bound = '1';

    startBtn.addEventListener('click', (e) => {
      e.preventDefault();
      startTheGame();
    });

    startBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault();
        startTheGame();
      }
    });
  }

  const modalClose = document.getElementById('modal-close');
  if (modalClose && !modalClose.dataset.bound) {
    modalClose.dataset.bound = '1';
    modalClose.addEventListener('click', closeModal);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupStartupBindings, { once: true });
} else {
  setupStartupBindings();
}

// Extra safety in case startup DOM is injected/reloaded after initial parse.
window.addEventListener('load', setupStartupBindings, { once: true });
window.addEventListener('beforeunload', disconnectLiveMultiplayer);

function startTheGame() {
  if (selectedPlayMode === 'multiplayer') {
    const mpServer = document.getElementById('mp-server');
    const mpRoom = document.getElementById('mp-room');
    const mpName = document.getElementById('mp-name');
    const serverVal = (mpServer && mpServer.value ? mpServer.value : 'ws://localhost:8081').trim();
    const roomVal = (mpRoom && mpRoom.value ? mpRoom.value : 'room-14b').trim();
    const nameVal = (mpName && mpName.value ? mpName.value : 'Player').trim();
    localStorage.setItem(MP_SERVER_KEY, serverVal || 'ws://localhost:8081');
    localStorage.setItem(MP_ROOM_KEY, roomVal || 'room-14b');
    localStorage.setItem(MP_NAME_KEY, nameVal || 'Player');
  }

  const startupScreen = document.getElementById('startup-screen');
  if (startupScreen) {
    startupScreen.style.display = 'none';
    // Play intro cinematic, then start game
    playIntroCinematic(function() {
      startGamePlay();
    });
  }
}

function disconnectLiveMultiplayer() {
  if (multiplayerState.ws) {
    try { multiplayerState.ws.close(); } catch (_e) {}
  }
  multiplayerState.ws = null;
  multiplayerState.connected = false;
  multiplayerState.playerId = null;
  Object.keys(multiplayerState.remotePlayers).forEach(function (id) {
    var peer = multiplayerState.remotePlayers[id];
    if (peer && peer.group && peer.group.parent) peer.group.parent.remove(peer.group);
  });
  multiplayerState.remotePlayers = {};
}

function createRemotePeerAvatar(peerId, displayName) {
  if (!scene || !player) return null;

  var group = new THREE.Group();
  group.name = 'remote-peer-' + peerId;
  group.position.copy(player.position);
  group.position.x += (Math.random() - 0.5) * 2;
  group.position.z += (Math.random() - 0.5) * 2;
  scene.add(group);

  var model = null;
  var cached = cachedModels[2] || cachedModels[1] || cachedModels[0] || null;
  var sourceModel = cached ? cached.scene : null;
  if (sourceModel) {
    if (typeof THREE.SkeletonUtils !== 'undefined') model = THREE.SkeletonUtils.clone(sourceModel);
    else model = sourceModel.clone();
    var s = 1.08;
    model.scale.set(s, s, s);
    model.rotation.y = Math.PI;
    if (cached) model.position.set(0, -cached.minY * s, 0);
    else model.position.set(0, 0, 0);
    model.traverse(function (child) {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = true;
      }
    });
    model.userData.basePosY = model.position.y;
    group.add(model);
  } else {
    var fallback = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, 0.9, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x3498db, roughness: 0.7, metalness: 0.1 })
    );
    fallback.position.set(0, 0.95, 0);
    group.add(fallback);
  }

  var labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256;
  labelCanvas.height = 64;
  var lctx = labelCanvas.getContext('2d');
  lctx.fillStyle = 'rgba(10,10,10,0.85)';
  lctx.fillRect(0, 0, 256, 64);
  lctx.font = '22px Arial';
  lctx.fillStyle = '#72f0ff';
  lctx.textAlign = 'center';
  lctx.fillText(displayName || 'Player 2', 128, 40);
  var label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(labelCanvas), transparent: true }));
  label.scale.set(1.35, 0.34, 1);
  label.position.set(0, 2.2, 0);
  group.add(label);

  return {
    id: peerId,
    name: displayName || 'Peer',
    group: group,
    model: model,
    targetX: group.position.x,
    targetY: group.position.y,
    targetZ: group.position.z,
    targetRotY: group.rotation.y,
  };
}

function ensureMultiplayerTeammate() {
  if (selectedPlayMode !== 'multiplayer') return;
  if (multiplayerState.connected || multiplayerState.ws) return;

  var serverUrl = (localStorage.getItem(MP_SERVER_KEY) || 'ws://localhost:8081').trim();
  var roomId = (localStorage.getItem(MP_ROOM_KEY) || 'room-14b').trim();
  var name = (localStorage.getItem(MP_NAME_KEY) || 'Player').trim();
  multiplayerState.roomId = roomId;
  multiplayerState.name = name;

  var ws;
  try {
    ws = new WebSocket(serverUrl);
  } catch (_error) {
    showToast('Multiplayer server unavailable. Check server URL.', 'danger');
    addLog('Multiplayer connect failed (invalid URL).', 'warn');
    return;
  }

  multiplayerState.ws = ws;
  ws.addEventListener('open', function () {
    multiplayerState.connected = true;
    addLog('Connected to live multiplayer room: ' + roomId, 'ok');
    showToast('🌐 Live multiplayer connected', 'ok');
    ws.send(JSON.stringify({ type: 'join', roomId: roomId, name: name, level: G.level }));
  });

  ws.addEventListener('message', function (event) {
    var msg;
    try { msg = JSON.parse(event.data); } catch (_e) { return; }
    if (!msg || !msg.type) return;

    if (msg.type === 'welcome') {
      multiplayerState.playerId = msg.id;
      return;
    }

    if (msg.type === 'peer-left') {
      var existing = multiplayerState.remotePlayers[msg.id];
      if (existing && existing.group && existing.group.parent) existing.group.parent.remove(existing.group);
      delete multiplayerState.remotePlayers[msg.id];
      addLog('Peer left room.', 'warn');
      return;
    }

    if (msg.type === 'state' && msg.id && msg.id !== multiplayerState.playerId) {
      var peer = multiplayerState.remotePlayers[msg.id];
      if (!peer) {
        peer = createRemotePeerAvatar(msg.id, msg.name || 'Player 2');
        if (!peer) return;
        multiplayerState.remotePlayers[msg.id] = peer;
        addLog((msg.name || 'Player 2') + ' joined live session.', 'ok');
        showToast('🧑‍🤝‍🧑 Live peer joined', 'ok');
      }
      peer.targetX = Number(msg.x || 0);
      peer.targetY = Number(msg.y || 0);
      peer.targetZ = Number(msg.z || 0);
      peer.targetRotY = Number(msg.rotY || 0);
    }
  });

  ws.addEventListener('close', function () {
    multiplayerState.connected = false;
    multiplayerState.ws = null;
    showToast('Multiplayer disconnected.', 'info');
    addLog('Live multiplayer connection closed.', 'warn');
  });

  ws.addEventListener('error', function () {
    showToast('Multiplayer error. Ensure server is running.', 'danger');
    addLog('Live multiplayer error.', 'warn');
  });
}

function updateMultiplayerTeammate(dt) {
  if (selectedPlayMode !== 'multiplayer') return;

  if (multiplayerState.connected && multiplayerState.ws && multiplayerState.ws.readyState === 1 && player) {
    multiplayerState.lastSendAt += dt;
    if (multiplayerState.lastSendAt >= 0.08) {
      multiplayerState.lastSendAt = 0;
      multiplayerState.ws.send(JSON.stringify({
        type: 'state',
        roomId: multiplayerState.roomId,
        name: multiplayerState.name,
        level: G.level,
        x: Number(player.position.x.toFixed(3)),
        y: Number(player.position.y.toFixed(3)),
        z: Number(player.position.z.toFixed(3)),
        rotY: Number(player.rotation.y.toFixed(4)),
      }));
    }
  }

  Object.keys(multiplayerState.remotePlayers).forEach(function (id) {
    var peer = multiplayerState.remotePlayers[id];
    if (!peer || !peer.group) return;
    peer.group.position.lerp(
      new THREE.Vector3(peer.targetX, peer.targetY, peer.targetZ),
      Math.min(1, dt * 8)
    );
    peer.group.rotation.y += (peer.targetRotY - peer.group.rotation.y) * Math.min(1, dt * 8);
    if (peer.model) {
      var baseY = peer.model.userData.basePosY || peer.model.position.y;
      peer.model.position.y = baseY + Math.sin(gameClock.elapsedTime * 2.1 + id.length) * 0.008;
    }
  });
}

function startGamePlay() {
  try {
    // Show loading bar during model load
    var loadBar = document.getElementById('loading-bar-container');
    if (loadBar) loadBar.style.display = 'block';
    
    // Initialize level-specific timer
    G.secs = ROOMS[G.level].timeLimit;
    
    initScene();
    if (selectedPlayMode === 'multiplayer') ensureMultiplayerTeammate();
    else disconnectLiveMultiplayer();
    // Cache DOM references for per-frame use (avoids getElementById every frame)
    _domHint = document.getElementById('interaction-hint');
    _domCrosshair = document.getElementById('crosshair');
    _domMinimap = document.getElementById('minimap');
    if (_domMinimap) _domMinimapCtx = _domMinimap.getContext('2d');
    createHiddenItems(); // Add hidden compartments, UV items, story objects, red herrings
    updateInventoryDisplay();
    updateDoorLockDisplay();
    setupPauseMenu();
    setupExamineMode();
    setupHelp();
    setupClickToMove();
    setupKeyboardShortcuts();
    updateObjective();
    saveCheckpoint('start');
    startTimer();
    updateHUDTitle();
    animate();
    // Bind hint button
    var hintBtn = document.getElementById('hint-btn');
    if (hintBtn) hintBtn.addEventListener('click', useHint);
    // Start background music
    const bgMusic = document.getElementById('bg-music');
    if (bgMusic) {
      bgMusic.volume = 0.5; // default from settings
      bgMusic.play();
    }
    // Start ambient room hum (fluorescent light buzz)
    SFX.startAmbient();
  } catch (e) {
    console.error('Error starting game:', e);
  }
}

// Model path: models/casual-denim-layered-look/source/model.glb
