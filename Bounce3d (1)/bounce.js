/* -------------------------------------------------------------
   BOUNCE 3D – Slopes, Pause, Score‑History & Balanced Jump
   ------------------------------------------------------------- */

/* ---------- 0️⃣ GLOBAL SETTINGS ---------- */
const CONFIG = {
  ballRadius: 1,
  gravity: 0.05,
  jumpForce: 0.75, // vertical impulse (balanced)
  accelGround: 0.04,
  accelAir: 0.02,
  maxSpeed: 0.7,
  groundFriction: 0.9,
  airFriction: 0.98,
  squashSpeed: 0.2,
};
const BOOST_MAG = 0.15; // tiny forward push when you jump

/* ---------- 1️⃣ GLOBAL STATE ---------- */
let scene, camera, renderer;
let ballGroup, ballMesh;
let platforms = []; // static, moving, rotating
let movingPlatforms = []; // sinusoidal movers
let rotatingPlatforms = []; // spin‑y platforms
let slopedPlatforms = []; // ramp meshes (detectable by ray‑cast)
let fireflies = [],
  mountains = [],
  gems = [];

let sunLight; // moving directional light

let score = 0,
  level = 0;
const LEVEL_COUNT = 3;
let isGameOver = false;
let isPaused = false; // pause flag
let time = 0;

/* ---------- 2️⃣ PHYSICS STATE ---------- */
let velocity = new THREE.Vector3(); // ball linear velocity
let isGrounded = false;
let squashScale = 1,
  targetSquash = 1;

// forward boost that lasts a few frames after a jump
let jumpBoost = new THREE.Vector3();
let boostFrames = 0;

/* ---------- 3️⃣ UI ELEMENTS ---------- */
const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const finalScoreEl = document.getElementById("final-score");
const loadingEl = document.getElementById("loading");
const retryBtn = document.getElementById("retry-btn");

/* Pause‑menu elements */
const pauseScreen = document.getElementById("pause-screen");
const resumeBtn = document.getElementById("resume-btn");
const scoresBtn = document.getElementById("scores-btn");
const restartLevelBtn = document.getElementById("restart-level-btn");
const backFromScoresBtn = document.getElementById("back-from-scores-btn");
const scoreHistoryDiv = document.getElementById("score-history");
const scoreList = document.getElementById("score-list");

/* ---------- 4️⃣ INPUT ---------- */
const pressed = new Set(); // holds *all* pressed keys

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") e.preventDefault(); // stop page scroll on Space
  pressed.add(e.code);
  if (e.code === "Space") handleJump(); // instant jump on press
  if (e.code === "Escape") togglePause(); // pause / resume
});
window.addEventListener("keyup", (e) => pressed.delete(e.code));

let mouseX = 0,
  mouseY = 0;
window.addEventListener("mousemove", (e) => {
  mouseX = (e.clientX / window.innerWidth) * 2 - 1; // -1 … +1
  mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
});

/* ---------- 5️⃣ TEXTURE HELPERS ---------- */
function createBallTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ff4757";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#ff6b81";
  for (let i = 0; i < 256; i += 32) {
    for (let j = 0; j < 256; j += 32) {
      if ((i + j) % 64 === 0) {
        ctx.beginPath();
        ctx.arc(i + 16, j + 16, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const grad = ctx.createRadialGradient(80, 80, 10, 128, 128, 150);
  grad.addColorStop(0, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
function createPlatformTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#2ecc71";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? "#27ae60" : "#2ecc71";
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
  }
  ctx.fillStyle = "#5d4037";
  ctx.fillRect(0, 480, 512, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* ---------- 6️⃣ ENVIRONMENT ---------- */
function generateMountains() {
  const geo = new THREE.ConeGeometry(40, 60, 4);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x34495e,
    flatShading: true,
  });
  for (let i = 0; i < 20; i++) {
    const m = new THREE.Mesh(geo, mat);
    const ang = (i / 20) * Math.PI * 2;
    const rad = 80 + Math.random() * 20;
    m.position.set(Math.cos(ang) * rad, -10, Math.sin(ang) * rad);
    m.rotation.y = Math.random() * Math.PI;
    m.scale.setScalar(1 + Math.random() * 0.3);
    scene.add(m);
    mountains.push(m);
  }
}
function spawnFirefly() {
  const geo = new THREE.SphereGeometry(0.3, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  const mesh = new THREE.Mesh(geo, mat);
  const light = new THREE.PointLight(0xffff00, 1, 5);
  mesh.add(light);
  mesh.position.set(
    (Math.random() - 0.5) * 60,
    2 + Math.random() * 10,
    (Math.random() - 0.5) * 60,
  );
  scene.add(mesh);
  fireflies.push({
    mesh,
    origin: mesh.position.clone(),
    vel: new THREE.Vector3(),
  });
}
function initFireflies() {
  for (let i = 0; i < 30; i++) spawnFirefly();
}

/* ---------- 7️⃣ PLATFORM HELPERS ---------- */
function addStaticPlatform(x, y, z, w, d, color = 0x2ecc71) {
  const geo = new THREE.BoxGeometry(w, 2, d);
  const mat = new THREE.MeshStandardMaterial({ map: createPlatformTexture() });
  if (color !== 0x2ecc71) mat.color.setHex(color);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.material.map.repeat.set(w / 4, d / 4);
  scene.add(mesh);
  const box = new THREE.Box3().setFromObject(mesh);
  platforms.push({ mesh, box });
}
function addMovingPlatform(
  x,
  y,
  z,
  w,
  d,
  axis,
  range,
  speed,
  color = 0x2ecc71,
) {
  const geo = new THREE.BoxGeometry(w, 2, d);
  const mat = new THREE.MeshStandardMaterial({ map: createPlatformTexture() });
  if (color !== 0x2ecc71) mat.color.setHex(color);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.material.map.repeat.set(w / 4, d / 4);
  scene.add(mesh);
  const box = new THREE.Box3().setFromObject(mesh);
  const obj = {
    mesh,
    box,
    axis,
    range,
    speed,
    origin: mesh.position.clone(),
    time: 0,
  };
  platforms.push(obj);
  movingPlatforms.push(obj);
}
function addRotatingPlatform(x, y, z, w, d, speed, color = 0x2ecc71) {
  const geo = new THREE.BoxGeometry(w, 2, d);
  const mat = new THREE.MeshStandardMaterial({ map: createPlatformTexture() });
  if (color !== 0x2ecc71) mat.color.setHex(color);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.material.map.repeat.set(w / 4, d / 4);
  scene.add(mesh);
  const box = new THREE.Box3().setFromObject(mesh);
  const obj = { mesh, box, speed };
  platforms.push(obj);
  rotatingPlatforms.push(obj);
}
function addSlopePlatform(
  x,
  y,
  z,
  w,
  d,
  angleDeg,
  axis = "x",
  color = 0x2ecc71,
) {
  // thin ramp – thickness 0.4, then rotate around the chosen axis
  const geo = new THREE.BoxGeometry(w, 0.4, d);
  const mat = new THREE.MeshStandardMaterial({ map: createPlatformTexture() });
  if (color !== 0x2ecc71) mat.color.setHex(color);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  const rad = THREE.MathUtils.degToRad(angleDeg);
  if (axis === "x") mesh.rotation.x = rad;
  else if (axis === "z") mesh.rotation.z = rad;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const box = new THREE.Box3().setFromObject(mesh);
  const obj = { mesh, box, isSlope: true, axis, angleDeg };
  platforms.push(obj);
  slopedPlatforms.push(obj);
}
function addGoalPlatform(x, y, z, w = 6, d = 6) {
  const geo = new THREE.BoxGeometry(w, 2, d);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd700 }); // gold
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const box = new THREE.Box3().setFromObject(mesh);
  const obj = { mesh, box, isGoal: true };
  platforms.push(obj);
  return obj;
}
function addGem(x, y, z) {
  const geo = new THREE.OctahedronGeometry(0.8);
  const mat = new THREE.MeshPhongMaterial({
    color: 0x00ffff,
    emissive: 0x004444,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y + 1.5, z);
  mesh.castShadow = true;
  scene.add(mesh);
  const box = new THREE.Box3().setFromObject(mesh);
  gems.push({ mesh, box, baseY: y + 1.5, active: true });
}

/* ---------- 8️⃣ LEVEL DESIGN ---------- */
function clearLevel() {
  platforms.forEach((p) => scene.remove(p.mesh));
  platforms = [];
  movingPlatforms = [];
  rotatingPlatforms = [];
  slopedPlatforms = [];
  gems.forEach((g) => scene.remove(g.mesh));
  gems = [];
}
function generateLevel(idx) {
  clearLevel();

  switch (idx) {
    /* ---------- LEVEL 0 – Intro (ramps make gaps ≤ 9) ---------- */
    case 0:
      addStaticPlatform(0, 0, 0, 8, 8);
      addSlopePlatform(0, 0.5, -8, 8, 6, 15, "x");
      addStaticPlatform(0, 2, -16, 6, 6);
      addGem(0, 2, -16);
      addSlopePlatform(0, 2.5, -24, 6, 6, 12, "x");
      addStaticPlatform(0, 4, -32, 6, 6);
      addGem(0, 4, -32);
      addSlopePlatform(0, 4.5, -40, 6, 6, 10, "x");
      addStaticPlatform(0, 6, -48, 8, 8);
      addGem(0, 6, -48);
      addGoalPlatform(0, 8, -60);
      break;

    /* ---------- LEVEL 1 – Moving & Rotating (still ramps) ---------- */
    case 1:
      addStaticPlatform(0, 0, 0, 8, 8);
      addStaticPlatform(0, 2, -12, 6, 6);
      addGem(0, 2, -12);
      addMovingPlatform(-5, 2, -22, 6, 6, "x", 6, 0.02);
      addSlopePlatform(-5, 2.5, -30, 6, 6, 12, "x");
      addStaticPlatform(0, 4, -38, 4, 4);
      addGem(0, 4, -38);
      addRotatingPlatform(12, 6, -48, 6, 6, 0.02);
      addSlopePlatform(12, 6.5, -56, 6, 6, 10, "x");
      addStaticPlatform(0, 8, -64, 6, 6);
      addGem(0, 8, -64);
      addGoalPlatform(0, 10, -78);
      break;

    /* ---------- LEVEL 2 – Spikes & Tight Gaps (ramps keep jumps tame) ---------- */
    case 2:
      addStaticPlatform(0, 0, 0, 8, 8);
      addStaticPlatform(0, 2, -13, 4, 4);
      addGem(0, 2, -13);
      addMovingPlatform(-5, 0, -23, 5, 5, "y", 6, 0.025, 0x8e44ad);
      addSlopePlatform(-5, 0.5, -31, 5, 5, 12, "z");
      addStaticPlatform(5, 2, -39, 3, 3);
      addGem(5, 2, -39);
      addRotatingPlatform(-8, 6, -49, 6, 6, 0.03);
      // Spikes – instant death
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c });
      const spikeGeo = new THREE.ConeGeometry(1, 2, 4);
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Mesh(spikeGeo, spikeMat);
        s.position.set(-2 + i * 2, 1, -57);
        s.rotation.x = Math.PI;
        s.castShadow = true;
        scene.add(s);
        const box = new THREE.Box3().setFromObject(s);
        platforms.push({ mesh: s, box, isDead: true });
      }
      addMovingPlatform(0, 4, -71, 8, 8, "x", 8, 0.03);
      addGoalPlatform(0, 6, -90);
      break;
  }

  // reset player’s position / velocity and UI
  resetBallPos();
  levelEl.textContent = idx + 1;
}

/* ---------- 9️⃣ PLAYER ---------- */
function createBall() {
  ballGroup = new THREE.Group();
  const geo = new THREE.SphereGeometry(CONFIG.ballRadius, 32, 32);
  const mat = new THREE.MeshStandardMaterial({
    map: createBallTexture(),
    roughness: 0.3,
    metalness: 0.2,
  });
  ballMesh = new THREE.Mesh(geo, mat);
  ballMesh.castShadow = true;
  ballMesh.receiveShadow = true;
  ballGroup.add(ballMesh);
  scene.add(ballGroup);
  resetBallPos();
}
function resetBallPos() {
  ballGroup.position.set(0, 5, 0);
  velocity.set(0, 0, 0);
  squashScale = targetSquash = 1;
  isGrounded = false;
}

/* ---------- 10️⃣ JUMP LOGIC (balanced) ---------- */
function handleJump() {
  if (!isGrounded) return; // only jump from a platform

  // Direction = current horizontal velocity OR arrow keys if almost still
  let dir = new THREE.Vector3(velocity.x, 0, velocity.z);
  if (dir.lengthSq() < 0.001) {
    dir.set(
      (pressed.has("ArrowRight") ? 1 : 0) - (pressed.has("ArrowLeft") ? 1 : 0),
      0,
      (pressed.has("ArrowDown") ? 1 : 0) - (pressed.has("ArrowUp") ? 1 : 0),
    );
  }
  if (dir.lengthSq() > 0) dir.normalize();

  velocity.y = CONFIG.jumpForce; // vertical lift
  jumpBoost.copy(dir).multiplyScalar(BOOST_MAG); // forward push
  boostFrames = 5; // boost lives a few frames
  targetSquash = 0.5; // visual squash on lift‑off
}

/* ---------- 11️⃣ MOVEMENT ---------- */
function applyMovement() {
  // ----- acceleration (ground vs. air) -----
  const dir = new THREE.Vector3(
    (pressed.has("ArrowRight") ? 1 : 0) - (pressed.has("ArrowLeft") ? 1 : 0),
    0,
    (pressed.has("ArrowDown") ? 1 : 0) - (pressed.has("ArrowUp") ? 1 : 0),
  );
  if (dir.lengthSq() > 0) {
    dir.normalize();
    const accel = isGrounded ? CONFIG.accelGround : CONFIG.accelAir;
    velocity.x += dir.x * accel;
    velocity.z += dir.z * accel;
  }

  // ----- forward boost from recent jump -----
  if (boostFrames > 0) {
    velocity.x += jumpBoost.x;
    velocity.z += jumpBoost.z;
    boostFrames--;
  }

  // ----- friction / air resistance -----
  const fric = isGrounded ? CONFIG.groundFriction : CONFIG.airFriction;
  velocity.x *= fric;
  velocity.z *= fric;

  // ----- speed clamp -----
  velocity.x = THREE.MathUtils.clamp(
    velocity.x,
    -CONFIG.maxSpeed,
    CONFIG.maxSpeed,
  );
  velocity.z = THREE.MathUtils.clamp(
    velocity.z,
    -CONFIG.maxSpeed,
    CONFIG.maxSpeed,
  );

  // ----- gravity -----
  velocity.y -= CONFIG.gravity;

  // ----- move the ball -----
  ballGroup.position.add(velocity);

  // ----- visual spin (roll) -----
  const horiz = Math.hypot(velocity.x, velocity.z);
  if (horiz > 0.01) {
    const axis = new THREE.Vector3(-velocity.z, 0, velocity.x).normalize();
    ballMesh.rotateOnWorldAxis(axis, horiz * 0.2);
  }
}

/* ---------- 12️⃣ COLLISION – BOX PLATFORMS ---------- */
function resolveCollisions() {
  isGrounded = false;
  const ballBox = new THREE.Box3().setFromObject(ballMesh);
  ballBox.expandByScalar(-0.2); // small forgiving margin

  for (const p of platforms) {
    if (!p.box) continue;
    if (!ballBox.intersectsBox(p.box)) continue;

    // ----- goal platform? -----
    if (p.isGoal) {
      if (!p._completed) {
        p._completed = true;
        levelComplete();
      }
      continue;
    }

    // ----- deadly spike -----
    if (p.isDead) {
      gameOver();
      return;
    }

    // ----- normal box platform -----
    const priorY = ballGroup.position.y - velocity.y;
    const topY = p.box.max.y;
    if (priorY >= topY && ballGroup.position.y <= topY + CONFIG.ballRadius) {
      // landed on top
      ballGroup.position.y = topY + CONFIG.ballRadius;
      velocity.y = 0;
      isGrounded = true;
      if (Math.abs(velocity.y) > 0.2) targetSquash = 1.4; // hard landing
    } else {
      // side hit – bounce back a bit
      velocity.x *= -0.5;
      velocity.z *= -0.5;
      ballGroup.position.add(velocity);
    }
  }

  // If we haven't landed on a regular platform, try ramps
  if (!isGrounded) checkSlopedCollisions();
}

/* ---------- 13️⃣ RAMP / SLOPE COLLISION (partial landing) ---------- */
function checkSlopedCollisions() {
  // Only while falling or standing still vertically
  if (velocity.y > 0) return;

  const ray = new THREE.Raycaster(
    ballGroup.position.clone(),
    new THREE.Vector3(0, -1, 0),
    0,
    CONFIG.ballRadius + 0.05,
  );
  const hits = ray.intersectObjects(slopedPlatforms.map((p) => p.mesh));

  if (hits.length > 0) {
    const pt = hits[0].point;
    ballGroup.position.y = pt.y + CONFIG.ballRadius;
    velocity.y = 0;
    isGrounded = true;
  }
}

/* ---------- 14️⃣ GEM COLLECTION ---------- */
function collectGems() {
  const ballPos = ballGroup.position.clone();
  for (let i = gems.length - 1; i >= 0; i--) {
    const g = gems[i];
    if (!g.active) continue;
    // spin + gentle bobbing
    g.mesh.rotation.y += 0.05;
    g.mesh.position.y = g.baseY + Math.sin(Date.now() * 0.005) * 0.5;
    if (ballPos.distanceTo(g.mesh.position) < CONFIG.ballRadius + 1) {
      g.active = false;
      scene.remove(g.mesh);
      gems.splice(i, 1);
      score += 100;
      scoreEl.textContent = score;
    }
  }
}

/* ---------- 15️⃣ FALL DEATH ---------- */
function checkFall() {
  if (ballGroup.position.y < -15) gameOver();
}

/* ---------- 16️⃣ SQUASH‑AND‑STRETCH (visual) ---------- */
function animateSquash() {
  squashScale += (targetSquash - squashScale) * CONFIG.squashSpeed;
  if (isGrounded) targetSquash += (1 - targetSquash) * 0.1;
  else targetSquash += (1 - targetSquash) * 0.05;
  const stretch = 1 / Math.sqrt(squashScale);
  ballGroup.scale.set(stretch, squashScale, stretch);
}

/* ---------- 17️⃣ MOVING / ROTATING PLATFORM UPDATES ---------- */
function updateMovingPlatforms() {
  movingPlatforms.forEach((p) => {
    p.time += p.speed;
    const offset = Math.sin(p.time) * p.range;
    p.mesh.position[p.axis] = p.origin[p.axis] + offset;
    p.box.setFromObject(p.mesh);
  });
}
function updateRotatingPlatforms() {
  rotatingPlatforms.forEach((p) => {
    p.mesh.rotation.y += p.speed;
    p.box.setFromObject(p.mesh);
  });
}

/* ---------- 18️⃣ FIRE‑FLIES (ambient) ---------- */
function updateFireflies() {
  fireflies.forEach((f) => {
    // wander a little
    f.mesh.position.add(f.vel);
    f.vel.x += (Math.random() - 0.5) * 0.02;
    f.vel.y += (Math.random() - 0.5) * 0.02;
    f.vel.z += (Math.random() - 0.5) * 0.02;
    f.vel.multiplyScalar(0.96);

    const dist = f.mesh.position.distanceTo(ballGroup.position);
    if (dist < 8) {
      // scared – move away, turn red
      const away = new THREE.Vector3()
        .subVectors(f.mesh.position, ballGroup.position)
        .normalize();
      f.mesh.position.add(away.multiplyScalar(0.2));
      f.mesh.material.color.setHex(0xff0000);
    } else {
      // calm – drift back, stay yellow
      f.mesh.position.lerp(f.origin, 0.005);
      f.mesh.material.color.setHex(0xffff00);
    }

    // keep inside vertical bounds
    if (f.mesh.position.y < 1) f.mesh.position.y = 1;
    if (f.mesh.position.y > 20) f.mesh.position.y = 20;
  });
}

/* ---------- 19️⃣ SUN & SKY ---------- */
function updateSunAndSky() {
  time += 0.005;
  const sx = Math.sin(time) * 50;
  const sy = Math.cos(time) * 50 + 30; // stay above horizon
  sunLight.position.set(sx, sy, 20);
  sunLight.lookAt(0, 0, 0);

  const skyL = THREE.MathUtils.clamp(sy / 80 + 0.45, 0.2, 0.9);
  const sky = new THREE.Color().setHSL(0.58, 0.5, skyL);
  scene.background = sky;
  scene.fog.color.copy(sky);
}

/* ---------- 20️⃣ CAMERA (mouse‑look) ---------- */
function updateCamera() {
  const camOffsetX = mouseX * 15;
  const camOffsetY = 10 + mouseY * 5;
  const camOffsetZ = 18 + mouseY * 5;
  const target = ballGroup.position.clone();
  target.x += camOffsetX;
  target.y += camOffsetY;
  target.z += camOffsetZ;
  camera.position.lerp(target, 0.1);
  camera.lookAt(ballGroup.position);
}

/* ---------- 21️⃣ SCORE‑HISTORY (localStorage) ---------- */
function loadScores() {
  const raw = localStorage.getItem("bounce_scores");
  return raw ? JSON.parse(raw) : [];
}
function saveScore(finalScore) {
  const scores = loadScores();
  scores.push({ score: finalScore, date: new Date().toISOString() });
  localStorage.setItem("bounce_scores", JSON.stringify(scores));
}
function populateScoreHistory() {
  const scores = loadScores().reverse(); // newest first
  scoreList.innerHTML = "";
  if (scores.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No scores yet.";
    scoreList.appendChild(li);
    return;
  }
  scores.forEach((entry) => {
    const li = document.createElement("li");
    const d = new Date(entry.date);
    li.textContent = `${d.toLocaleDateString()} – ${entry.score}`;
    scoreList.appendChild(li);
  });
}

/* ---------- 22️⃣ PAUSE MENU ---------- */
function togglePause() {
  if (isGameOver) return; // cannot pause when game‑over screen is up
  if (isPaused) {
    resumeGame();
  } else {
    pauseGame();
  }
}
function pauseGame() {
  isPaused = true;
  pauseScreen.style.display = "flex";
}
function resumeGame() {
  isPaused = false;
  pauseScreen.style.display = "none";
  // hide the score‑history panel if it was open
  scoreHistoryDiv.style.display = "none";
  // make sure the main pause buttons are visible again
  document
    .querySelectorAll("#pause-screen .pause-content button")
    .forEach((b) => (b.style.display = "inline-block"));
}
function restartCurrentLevel() {
  // Close pause UI, reset the current level (score stays!)
  pauseScreen.style.display = "none";
  isPaused = false;
  generateLevel(level); // keep same level index
}

/* pause‑menu button handlers */
resumeBtn.addEventListener("click", resumeGame);
restartLevelBtn.addEventListener("click", restartCurrentLevel);
scoresBtn.addEventListener("click", () => {
  // hide the three main buttons, show the score list
  document
    .querySelectorAll("#pause-screen .pause-content > button")
    .forEach((b) => (b.style.display = "none"));
  scoreHistoryDiv.style.display = "block";
  populateScoreHistory();
});
backFromScoresBtn.addEventListener("click", () => {
  // show the main pause buttons again
  document
    .querySelectorAll("#pause-screen .pause-content > button")
    .forEach((b) => (b.style.display = "inline-block"));
  scoreHistoryDiv.style.display = "none";
});

/* ---------- 23️⃣ GAME STATE ---------- */
function gameOver() {
  isGameOver = true;
  finalScoreEl.textContent = score;
  document.getElementById("game-over-screen").style.display = "flex";
  // Store the final total score so the player can see it later
  saveScore(score);
}
function levelComplete() {
  // small bonus for finishing a level
  score += 500;
  scoreEl.textContent = score;
  if (level < LEVEL_COUNT - 1) {
    level++;
    generateLevel(level);
  } else {
    alert("Congratulations! You beat every level.");
    level = 0;
    generateLevel(level);
  }
}

/* Retry after game‑over – start a fresh game (score resets) */
retryBtn.addEventListener("click", () => {
  isGameOver = false;
  score = 0;
  scoreEl.textContent = "0";
  document.getElementById("game-over-screen").style.display = "none";
  level = 0;
  generateLevel(level);
});

/* ---------- 24️⃣ MAIN LOOP ---------- */
function animate() {
  requestAnimationFrame(animate);

  // Skip updates while paused or after a game‑over
  if (!isGameOver && !isPaused) {
    applyMovement();
    resolveCollisions();
    collectGems();
    checkFall();
    animateSquash();

    updateMovingPlatforms();
    updateRotatingPlatforms();
    updateFireflies();
    updateSunAndSky();
  }

  updateCamera();
  renderer.render(scene, camera);
}

/* ---------- 25️⃣ INITIALISATION ---------- */
function init() {
  // ----- scene & camera -----
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.015);
  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );
  camera.position.set(0, 12, 18);

  // ----- renderer -----
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById("canvas-container").appendChild(renderer.domElement);

  // ----- lights -----
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  scene.add(hemi);
  sunLight = new THREE.DirectionalLight(0xffffff, 1);
  sunLight.position.set(50, 50, 50);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.left = -50;
  sunLight.shadow.camera.right = 50;
  sunLight.shadow.camera.top = 50;
  sunLight.shadow.camera.bottom = -50;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 150;
  scene.add(sunLight);

  // ----- visual grid (floor) -----
  const grid = new THREE.GridHelper(200, 50, 0xffffff, 0xffffff);
  grid.position.y = -30;
  grid.material.opacity = 0.3;
  grid.material.transparent = true;
  scene.add(grid);

  // ----- environment (mountains + fireflies) -----
  generateMountains();
  initFireflies();

  // ----- player -----
  createBall();

  // ----- first level -----
  generateLevel(level);

  // ----- window resize -----
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // hide the “Generating World…” overlay
  loadingEl.style.display = "none";

  // ----- start the animation loop -----
  animate();
}
init();
