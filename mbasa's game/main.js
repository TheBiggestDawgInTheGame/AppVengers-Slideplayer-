/* ─────────────────────────────────────────────────────────────
   Road Runner 3D  –  main.js
   All game logic, canvas road rendering, obstacle management.
   ───────────────────────────────────────────────────────────── */

'use strict';

// ── Canvas & DOM references ───────────────────────────────────
const canvas    = document.getElementById('roadCanvas');
const ctx       = canvas.getContext('2d');
const character = document.getElementById('character');
const gameEl    = document.getElementById('game');
const speedLinesEl = document.getElementById('speedLines');

// ── Road geometry ─────────────────────────────────────────────
const GW = 600;          // game width
const GH = 500;          // game height
const VX = 300;          // vanishing-point x
const VY = 118;          // vanishing-point y (horizon)
const ROAD_BL = 48;      // road bottom-left x
const ROAD_BR = 552;     // road bottom-right x
const ROAD_HL = VX - 62; // road horizon-left x  (238)
const ROAD_HR = VX + 62; // road horizon-right x (362)
const ROAD_BW = ROAD_BR - ROAD_BL;   // 504
const ROAD_HW = ROAD_HR - ROAD_HL;   // 124

// ── Lane centres (x) at bottom and at horizon ─────────────────
//   Three lanes: 0 = left, 1 = centre, 2 = right
const LANE_BX = [
  ROAD_BL + ROAD_BW / 6,       // ≈ 132
  ROAD_BL + ROAD_BW / 2,       // = 300
  ROAD_BL + 5 * ROAD_BW / 6,   // ≈ 468
];
const LANE_HX = [
  ROAD_HL + ROAD_HW / 6,       // ≈ 259
  VX,                           // = 300
  ROAD_HL + 5 * ROAD_HW / 6,   // ≈ 341
];

// ── Character geometry ────────────────────────────────────────
const CHAR_W  = 54;
const CHAR_H  = 74;
const CHAR_BOTTOM = 82;   // px from bottom of #game
// vertical centre of character (y measured from top)
const CHAR_CY = GH - CHAR_BOTTOM - CHAR_H / 2;  // ≈ 381

// ── Game-state variables ──────────────────────────────────────
let currentLane   = 1;
let score         = 0;
let lives         = 3;
let gameActive    = false;
let speedMult     = 1.0;
let frameCount    = 0;
let spawnGap      = 100;    // frames between spawns
let lastSpawn     = 0;
let obstacles     = [];
let rafId         = null;
let dashOff       = 0;      // road-stripe animation offset
let highScore     = Number(localStorage.getItem('runnerHighScore') || 0);

// Star field (generated once)
const STARS = Array.from({ length: 65 }, () => ({
  x: Math.random() * GW,
  y: Math.random() * (VY - 10),
  r: Math.random() * 1.4 + 0.2,
  phase: Math.random() * Math.PI * 2,
}));

// ── Canvas road drawing ───────────────────────────────────────

function drawRoad() {
  ctx.clearRect(0, 0, GW, GH);

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, VY + 10);
  sky.addColorStop(0, '#020208');
  sky.addColorStop(1, '#101030');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, GW, VY + 10);

  // Twinkling stars
  const t = Date.now() / 900;
  STARS.forEach(s => {
    const alpha = 0.4 + 0.45 * Math.sin(t + s.phase);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fill();
  });

  // Off-road (left side)
  ctx.beginPath();
  ctx.moveTo(0, GH);
  ctx.lineTo(ROAD_BL, GH);
  ctx.lineTo(ROAD_HL, VY);
  ctx.lineTo(0, VY);
  ctx.closePath();
  ctx.fillStyle = '#06060e';
  ctx.fill();

  // Off-road (right side)
  ctx.beginPath();
  ctx.moveTo(ROAD_BR, GH);
  ctx.lineTo(GW, GH);
  ctx.lineTo(GW, VY);
  ctx.lineTo(ROAD_HR, VY);
  ctx.closePath();
  ctx.fillStyle = '#06060e';
  ctx.fill();

  // Road surface
  const roadGrad = ctx.createLinearGradient(0, VY, 0, GH);
  roadGrad.addColorStop(0,   '#0c0c22');
  roadGrad.addColorStop(0.6, '#161630');
  roadGrad.addColorStop(1,   '#0a0a18');
  ctx.beginPath();
  ctx.moveTo(ROAD_BL, GH);
  ctx.lineTo(ROAD_HL, VY);
  ctx.lineTo(ROAD_HR, VY);
  ctx.lineTo(ROAD_BR, GH);
  ctx.closePath();
  ctx.fillStyle = roadGrad;
  ctx.fill();

  // Animated perspective grid lines (road sections moving toward camera)
  drawPerspectiveGrid();

  // Horizon glow
  ctx.beginPath();
  ctx.moveTo(ROAD_HL, VY);
  ctx.lineTo(ROAD_HR, VY);
  ctx.strokeStyle = 'rgba(57,255,20,0.7)';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.stroke();

  // Road edges (greenyellow)
  ctx.strokeStyle = 'greenyellow';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(ROAD_BL, GH);
  ctx.lineTo(ROAD_HL, VY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ROAD_BR, GH);
  ctx.lineTo(ROAD_HR, VY);
  ctx.stroke();

  // Lane dividers (animated dashes)
  drawLaneDivider(1 / 3);
  drawLaneDivider(2 / 3);

  // Horizon radial glow
  const hGlow = ctx.createRadialGradient(VX, VY, 0, VX, VY, 130);
  hGlow.addColorStop(0,   'rgba(57,255,20,0.12)');
  hGlow.addColorStop(1,   'rgba(57,255,20,0)');
  ctx.fillStyle = hGlow;
  ctx.fillRect(ROAD_HL - 10, VY - 10, ROAD_HW + 20, 50);
}

function drawLaneDivider(frac) {
  const bx = ROAD_BL + ROAD_BW * frac;
  const hx = ROAD_HL + ROAD_HW * frac;
  ctx.save();
  ctx.setLineDash([18, 16]);
  ctx.lineDashOffset = -dashOff;
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(bx, GH);
  ctx.lineTo(hx, VY);
  ctx.stroke();
  ctx.restore();
}

function drawPerspectiveGrid() {
  const LINES = 7;
  for (let i = 0; i < LINES; i++) {
    // depth 0 = horizon, 1 = camera
    let depth = (i / LINES + (dashOff / 34)) % 1;
    const y  = VY + (GH - VY) * depth;
    const lx = ROAD_HL + (ROAD_BL - ROAD_HL) * depth;
    const rx = ROAD_HR + (ROAD_BR - ROAD_HR) * depth;
    const alpha = 0.03 + 0.07 * depth;
    ctx.beginPath();
    ctx.moveTo(lx, y);
    ctx.lineTo(rx, y);
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 0.8 + depth;
    ctx.setLineDash([]);
    ctx.stroke();
  }
}

// ── Obstacle class ────────────────────────────────────────────
const OBS_TYPES = ['obs-red', 'obs-blue', 'obs-orange', 'obs-purple', 'obs-teal'];

class Obstacle {
  constructor(lane) {
    this.lane     = lane;
    this.progress = 0;          // 0 = horizon, 1 = player
    this.speed    = 0.0045;
    this.alive    = true;
    this.hit      = false;
    this.el       = document.createElement('div');
    this.el.className = 'obstacle ' + OBS_TYPES[Math.floor(Math.random() * OBS_TYPES.length)];
    gameEl.appendChild(this.el);
  }

  // Interpolated x at given progress
  _x(p) {
    return LANE_HX[this.lane] + (LANE_BX[this.lane] - LANE_HX[this.lane]) * p;
  }

  // Interpolated y at given progress
  _y(p) {
    return VY + (CHAR_CY - VY) * p;
  }

  update() {
    this.progress += this.speed * speedMult;
    if (this.progress >= 1.05) {
      this.alive = false;
      score += 10;
      return;
    }
    const scale = 0.08 + 0.92 * this.progress;
    const size  = Math.round(62 * scale);
    const cx    = this._x(this.progress);
    const cy    = this._y(this.progress);
    this.el.style.left    = (cx - size / 2) + 'px';
    this.el.style.top     = (cy - size / 2) + 'px';
    this.el.style.width   = size + 'px';
    this.el.style.height  = size + 'px';
    this.el.style.opacity = String(Math.min(1, 0.25 + 0.75 * this.progress));
    this.el.style.zIndex  = String(Math.floor(this.progress * 19) + 1);
  }

  collides() {
    if (this.hit) return false;
    // Collision window: progress 0.82–0.99, same lane
    if (this.progress >= 0.82 && this.progress < 1.0 && this.lane === currentLane) {
      this.hit = true;
      return true;
    }
    return false;
  }

  destroy() {
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
  }
}

// ── Lane / character movement ─────────────────────────────────

function getCharLeft(lane) {
  return LANE_BX[lane] - CHAR_W / 2;
}

function setLane(lane) {
  if (lane < 0 || lane > 2) return;
  currentLane = lane;
  character.style.left = getCharLeft(lane) + 'px';
}

function moveLeft() {
  if (!gameActive || currentLane <= 0) return;
  setLane(currentLane - 1);
  character.style.transform = 'scaleX(0.82) skewX(-9deg)';
  setTimeout(() => { character.style.transform = ''; }, 140);
}

function moveRight() {
  if (!gameActive || currentLane >= 2) return;
  setLane(currentLane + 1);
  character.style.transform = 'scaleX(0.82) skewX(9deg)';
  setTimeout(() => { character.style.transform = ''; }, 140);
}

// ── Collision feedback (same pattern as original game) ────────

function shakeAndFlash() {
  gameEl.classList.remove('shake');
  // force reflow so animation restarts
  void gameEl.offsetWidth;
  gameEl.classList.add('shake');
  character.classList.add('flash');
  setTimeout(() => {
    gameEl.classList.remove('shake');
    character.classList.remove('flash');
  }, 420);
}

// ── HUD update ────────────────────────────────────────────────

function updateHUD() {
  document.getElementById('scoreDisplay').textContent  = 'Score: ' + score;
  document.getElementById('livesDisplay').textContent  = '❤ '.repeat(lives).trim();
  document.getElementById('speedDisplay').textContent  = 'Speed: ' + speedMult.toFixed(1) + '×';
}

// ── Spawn obstacle ────────────────────────────────────────────

function spawnObstacle() {
  // Never spawn three obstacles in the same lane consecutively
  const lane = Math.floor(Math.random() * 3);
  obstacles.push(new Obstacle(lane));
}

// ── Handle hit ────────────────────────────────────────────────

function handleHit() {
  lives--;
  updateHUD();
  shakeAndFlash();
  if (lives <= 0) endGame();
}

// ── Main game loop ────────────────────────────────────────────

function gameLoop() {
  if (!gameActive) return;
  frameCount++;

  // Advance road animation
  dashOff = (dashOff + 2.2 * speedMult) % 34;

  // Draw perspective road
  drawRoad();

  // Ramp up speed every 300 frames
  if (frameCount % 300 === 0) {
    speedMult   = Math.min(3.2, speedMult + 0.18);
    spawnGap    = Math.max(42, spawnGap - 8);
    updateHUD();
    // Show speed-lines above 1.6×
    if (speedMult >= 1.6) speedLinesEl.classList.add('visible');
  }

  // Passive score: +1 every 30 frames
  if (frameCount % 30 === 0) {
    score++;
    updateHUD();
  }

  // Spawn obstacles
  if (frameCount - lastSpawn >= spawnGap) {
    spawnObstacle();
    lastSpawn = frameCount;
  }

  // Update obstacles + collision check
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const obs = obstacles[i];
    obs.update();
    if (obs.collides()) {
      handleHit();
      obs.destroy();
      obstacles.splice(i, 1);
      continue;
    }
    if (!obs.alive) {
      obs.destroy();
      obstacles.splice(i, 1);
    }
  }

  rafId = requestAnimationFrame(gameLoop);
}

// ── Start / end game ──────────────────────────────────────────

function startGame() {
  score      = 0;
  lives      = 3;
  frameCount = 0;
  speedMult  = 1.0;
  spawnGap   = 100;
  lastSpawn  = 0;
  dashOff    = 0;

  obstacles.forEach(o => o.destroy());
  obstacles = [];
  speedLinesEl.classList.remove('visible');

  setLane(1);
  updateHUD();

  document.getElementById('startScreen').classList.add('hidden');
  document.getElementById('gameOverScreen').classList.add('hidden');

  gameActive = true;
  if (rafId) cancelAnimationFrame(rafId);
  gameLoop();
}

function endGame() {
  gameActive = false;
  if (rafId) cancelAnimationFrame(rafId);

  if (score > highScore) {
    highScore = score;
    localStorage.setItem('runnerHighScore', highScore);
  }

  obstacles.forEach(o => o.destroy());
  obstacles = [];
  speedLinesEl.classList.remove('visible');

  document.getElementById('finalScore').textContent     = 'Score: ' + score;
  document.getElementById('highScoreDisplay').textContent = 'Best: ' + highScore;
  document.getElementById('gameOverScreen').classList.remove('hidden');
}

// ── Controls ──────────────────────────────────────────────────

document.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft')  moveLeft();
  if (event.key === 'ArrowRight') moveRight();
});

// Touch / swipe support (mirrors original game's feel)
let touchX = 0;
document.addEventListener('touchstart', e => {
  touchX = e.touches[0].clientX;
}, { passive: true });
document.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchX;
  if (dx < -30) moveLeft();
  if (dx >  30) moveRight();
}, { passive: true });

// ── Button listeners ──────────────────────────────────────────

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);

// ── Initial static road render (shown behind start screen) ────
drawRoad();

