// Game Configuration
const GRID_WIDTH = 19;
const GRID_HEIGHT = 21;
const CELL_SIZE = 30;
const GENERATED_QUIZ_KEY = 'slidePlayGeneratedQuizData';
const UPLOADED_FILES_KEY = 'slidePlayUploadedFiles';
const useUploadedSource = new URLSearchParams(window.location.search).get('source') === 'upload';

// Game State
let gameActive = false;
let score = 0;
let lives = 3;
let pelletsRemaining = 0;
let powerUpActive = false;
let powerUpTimer = 0;
let level = 1;
let combo = 1;
let ghostCombo = 0;
let loopDelay = 200;
let highScore = Number(localStorage.getItem('pacmanHighScore') || 0);
let fruit = null;
let fruitTimer = 0;
let pelletsEaten = 0;
let totalPellets = 0;
let pendingCountdown = false;
let slideChallenges = [];
let slideChallengeIndex = 0;
let gameLoopTimeoutId = null;
let countdownTimeoutId = null;
let countdownSession = 0;

// DOM Cache
let cellElements = [];
let gridBuilt = false;
let prevPacman = { x: -1, y: -1 };
let prevGhostPositions = [];
let prevFruit = null;
// HUD element cache
let _elScore, _elLives, _elLevel, _elPelletsLeft, _elCombo, _elHighScore, _elStatus, _elComboWrapper;
let _elStudyBrief;

// Pacman State
let pacman = { x: 9, y: 15, direction: 0, nextDirection: 0 };

// Ghosts
let ghosts = [
    { x: 7, y: 7, color: 'ghost-red', direction: 0, frightened: false, warning: false },
    { x: 8, y: 8, color: 'ghost-pink', direction: 0, frightened: false, warning: false },
    { x: 9, y: 8, color: 'ghost-cyan', direction: 0, frightened: false, warning: false },
    { x: 10, y: 7, color: 'ghost-orange', direction: 0, frightened: false, warning: false }
];

// Maze
const maze = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,1,1,0,1,1,1,1,1,1,1,1,1,0,1,1,0,1],
    [1,0,1,1,0,1,1,1,1,1,1,1,1,1,0,1,1,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,0,1],
    [1,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,1],
    [1,1,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,1,1],
    [1,1,1,1,0,1,0,0,0,0,0,0,0,1,0,1,1,1,1],
    [1,1,1,1,0,1,0,1,1,0,1,1,0,1,0,1,1,1,1],
    [0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0],
    [1,1,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,1,1],
    [1,1,1,1,0,1,0,0,0,0,0,0,0,1,0,1,1,1,1],
    [1,1,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,1,1,0,1,1,1,1,1,1,1,1,1,0,1,1,0,1],
    [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1],
    [1,1,0,1,0,1,0,1,1,1,1,1,0,1,0,1,0,1,1],
    [1,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,1],
    [1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

// Pellets
let pellets = [];
let pelletMap = new Map();

function getPelletKey(x, y) {
    return `${x},${y}`;
}

function getPelletAt(x, y) {
    return pelletMap.get(getPelletKey(x, y)) || null;
}

function clearPelletAt(x, y) {
    pelletMap.delete(getPelletKey(x, y));
}

function initializePellets() {
    pellets = [];
    pelletMap.clear();
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            if (maze[y][x] === 0) {
                const pellet = {
                    x: x,
                    y: y,
                    isPowerUp: (x === 1 && y === 1) || (x === 17 && y === 1) || 
                             (x === 1 && y === 19) || (x === 17 && y === 19)
                };
                pellets.push(pellet);
                pelletMap.set(getPelletKey(x, y), pellet);
            }
        }
    }
    pelletsRemaining = pellets.length;
    totalPellets = pellets.length;
}

function initGame() {
    clearScheduledTimers();
    countdownSession++;
    gameActive = true;
    score = 0;
    lives = 3;
    level = 1;
    combo = 1;
    ghostCombo = 0;
    pelletsEaten = 0;
    fruit = null;
    fruitTimer = 0;
    loopDelay = 200;
    pacman = { x: 9, y: 15, direction: 0, nextDirection: 0 };
    ghosts = [
        { x: 7, y: 7, color: 'ghost-red', direction: 0, frightened: false, warning: false },
        { x: 8, y: 8, color: 'ghost-pink', direction: 0, frightened: false, warning: false },
        { x: 9, y: 8, color: 'ghost-cyan', direction: 0, frightened: false, warning: false },
        { x: 10, y: 7, color: 'ghost-orange', direction: 0, frightened: false, warning: false }
    ];
    powerUpActive = false;
    powerUpTimer = 0;

    if (window.StudyAdventure) {
        window.StudyAdventure.startSession('pacman_game', 'Slide Pac-Man');
        window.StudyAdventure.pushHint('Collect pellets in safe lanes, then commit to aggressive runs.');
    }

    if (useUploadedSource && slideChallenges.length > 0) {
        document.getElementById('gameTitle').textContent = 'Slide Pac-Man';
        updateStudyBrief(false);
    }
    
    initializePellets();
    updateUI();
    document.getElementById('gameOverModal').classList.add('hidden');
    setStartButtonsDisabled(true);
    
    buildGrid();
    const session = countdownSession;
    startCountdown(() => {
        if (!gameActive || session !== countdownSession) return;
        gameLoop();
    }, session);
}

function clearScheduledTimers() {
    if (gameLoopTimeoutId) {
        clearTimeout(gameLoopTimeoutId);
        gameLoopTimeoutId = null;
    }
    if (countdownTimeoutId) {
        clearTimeout(countdownTimeoutId);
        countdownTimeoutId = null;
    }
}

function setStartButtonsDisabled(disabled) {
    const startButtons = document.querySelectorAll('[data-start-game]');
    startButtons.forEach((btn) => {
        btn.disabled = disabled;
    });
}

function startCountdown(callback, sessionId = countdownSession) {
    const overlay = document.getElementById('countdownOverlay');
    const text = document.getElementById('countdownText');
    overlay.classList.remove('hidden');

    const steps = ['3', '2', '1', 'GO!'];
    let i = 0;

    function showNext() {
        if (sessionId !== countdownSession || !gameActive) {
            overlay.classList.add('hidden');
            return;
        }
        if (i >= steps.length) {
            overlay.classList.add('hidden');
            callback();
            return;
        }
        const step = steps[i];
        text.textContent = step;
        text.className = step === 'GO!' ? 'go' : '';
        // Re-trigger CSS animation
        text.style.animation = 'none';
        void text.offsetWidth;
        text.style.animation = '';
        i++;
        countdownTimeoutId = setTimeout(showNext, step === 'GO!' ? 650 : 800);
    }
    showNext();
}

function resetGame() {
    clearScheduledTimers();
    countdownSession++;
    gameActive = false;
    score = 0;
    lives = 3;
    level = 1;
    combo = 1;
    pelletsRemaining = 0;
    pendingCountdown = false;
    document.getElementById('countdownOverlay').classList.add('hidden');
    document.getElementById('gameOverModal').classList.add('hidden');
    document.getElementById('gameStatus').textContent = 'Ready to Start';
    document.getElementById('gameStatus').classList.remove('danger');
    setStartButtonsDisabled(false);
    gridBuilt = false;
    updateUI();
    renderGame();
    updateStudyBrief(false);
}

function cacheHUD() {
    _elScore        = document.getElementById('score');
    _elLives        = document.getElementById('lives');
    _elLevel        = document.getElementById('level');
    _elPelletsLeft  = document.getElementById('pelletsLeft');
    _elCombo        = document.getElementById('combo');
    _elHighScore    = document.getElementById('highScore');
    _elStatus       = document.getElementById('gameStatus');
    _elComboWrapper = document.querySelector('.combo');
    _elStudyBrief   = document.getElementById('studyBrief');
}

function updateUI() {
    if (!_elScore) cacheHUD();
    _elScore.textContent       = score;
    _elLives.textContent       = lives;
    _elLevel.textContent       = level;
    _elPelletsLeft.textContent = pelletsRemaining;
    _elCombo.textContent       = combo;
    _elHighScore.textContent   = highScore;

    _elComboWrapper.classList.toggle('hot', combo >= 3);
    _elStatus.classList.toggle('danger', lives === 1 && gameActive && !powerUpActive);

    if (powerUpActive) {
        _elStatus.textContent = `⚡ Power Mode (${Math.ceil(powerUpTimer / 5)}s)`;
    } else if (gameActive) {
        _elStatus.textContent = lives === 1 ? 'Danger! Last life!' : 'Playing...';
    }
}

// Build the grid DOM once; call when pellets are freshly initialized
function buildGrid() {
    const container = document.getElementById('gameContainer');
    container.innerHTML = '';
    cellElements = [];
    prevPacman = { x: -1, y: -1 };
    prevGhostPositions = [];
    prevFruit = null;

    const grid = document.createElement('div');
    grid.className = 'game-grid';
    grid.style.cssText = `grid-template-columns: repeat(${GRID_WIDTH}, 1fr);`;

    for (let y = 0; y < GRID_HEIGHT; y++) {
        cellElements[y] = [];
        for (let x = 0; x < GRID_WIDTH; x++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            if (maze[y][x] === 1) {
                cell.classList.add('wall');
            } else {
                const pellet = getPelletAt(x, y);
                if (pellet) {
                    cell.classList.add('pellet');
                    const dot = document.createElement('div');
                    dot.className = pellet.isPowerUp ? 'power-pellet-dot' : 'pellet-dot';
                    cell.appendChild(dot);
                }
            }
            cellElements[y][x] = cell;
            grid.appendChild(cell);
        }
    }
    container.appendChild(grid);
    gridBuilt = true;
}

// Only update the cells that actually changed each frame
function renderGame() {
    if (!gridBuilt) { buildGrid(); return; }

    // Clear previous pacman cell
    if (prevPacman.x >= 0) {
        const old = cellElements[prevPacman.y][prevPacman.x].querySelector('.pacman');
        if (old) old.remove();
    }

    // Clear previous ghost cells
    for (const pos of prevGhostPositions) {
        const old = cellElements[pos.y][pos.x].querySelector('.ghost');
        if (old) old.remove();
    }

    // Clear previous fruit cell
    if (prevFruit) {
        const old = cellElements[prevFruit.y][prevFruit.x].querySelector('.bonus-fruit');
        if (old) old.remove();
    }

    // Draw pacman
    const pacEl = document.createElement('div');
    pacEl.className = 'pacman';
    cellElements[pacman.y][pacman.x].appendChild(pacEl);
    prevPacman = { x: pacman.x, y: pacman.y };

    // Draw ghosts
    prevGhostPositions = [];
    for (const ghost of ghosts) {
        const ghostEl = document.createElement('div');
        ghostEl.className = `ghost ${ghost.color}`;
        if (ghost.frightened) ghostEl.classList.add('frightened');
        if (ghost.warning) ghostEl.classList.add('frightened-warning');
        const eyes1 = document.createElement('div');
        eyes1.className = 'ghost-eyes';
        const eyes2 = document.createElement('div');
        eyes2.className = 'ghost-eyes';
        ghostEl.appendChild(eyes1);
        ghostEl.appendChild(eyes2);
        cellElements[ghost.y][ghost.x].appendChild(ghostEl);
        prevGhostPositions.push({ x: ghost.x, y: ghost.y });
    }

    // Draw fruit
    if (fruit) {
        const fruitEl = document.createElement('div');
        fruitEl.className = 'bonus-fruit';
        cellElements[fruit.y][fruit.x].appendChild(fruitEl);
        prevFruit = { x: fruit.x, y: fruit.y };
    } else {
        prevFruit = null;
    }
}

function gameLoop() {
    gameLoopTimeoutId = null;
    if (!gameActive) return;
    
    movePacman();
    moveGhosts();
    checkCollisions();
    updatePowerUp();
    updateFruit();
    updateSpeed();
    renderGame();
    updateUI();

    if (pendingCountdown) {
        pendingCountdown = false;
        const session = countdownSession;
        startCountdown(() => {
            if (!gameActive || session !== countdownSession) return;
            gameLoop();
        }, session);
        return;
    }
    
    // Check win condition
    if (pelletsRemaining === 0) {
        endGame(true);
        return;
    }
    
    // Check lose condition
    if (lives <= 0) {
        endGame(false);
        return;
    }
    
    gameLoopTimeoutId = setTimeout(gameLoop, loopDelay);
}

function movePacman() {
    if (pacman.nextDirection !== undefined) {
        pacman.direction = pacman.nextDirection;
    }
    
    let newX = pacman.x;
    let newY = pacman.y;
    
    if (pacman.direction === 0) newX++; // Right
    else if (pacman.direction === 1) newY++; // Down
    else if (pacman.direction === 2) newX--; // Left
    else if (pacman.direction === 3) newY--; // Up
    
    // Tunnel wrap-around
    if (newX < 0) newX = GRID_WIDTH - 1;
    if (newX >= GRID_WIDTH) newX = 0;
    
    // Check collision with walls
    if (maze[newY] && maze[newY][newX] === 0) {
        pacman.x = newX;
        pacman.y = newY;
    }
    
    // Eat pellets
    const pellet = getPelletAt(pacman.x, pacman.y);
    if (pellet) {
        // Remove pellet from DOM immediately
        if (gridBuilt) {
            const cell = cellElements[pellet.y][pellet.x];
            cell.classList.remove('pellet');
            const dot = cell.querySelector('.pellet-dot, .power-pellet-dot');
            if (dot) dot.remove();
        }
        if (pellet.isPowerUp) {
            powerUpActive = true;
            powerUpTimer = 100; // 10 seconds at 200ms intervals
            ghosts.forEach(g => {
                g.frightened = true;
                g.warning = false;
            });
            ghostCombo = 0;
            combo = Math.max(combo, 2);
            updateStudyBrief(true);
            if (window.StudyAdventure) {
                window.StudyAdventure.recordSuccess({
                    points: 2,
                    message: 'Power mode activated. Great tactical timing.'
                });
            }
        }
        score += pellet.isPowerUp ? 50 : 10;
        pelletsEaten++;
        if (!pellet.isPowerUp) {
            combo = Math.min(combo + 1, 8);
            if (useUploadedSource && pelletsEaten % 12 === 0) {
                updateStudyBrief(true);
                if (window.StudyAdventure) {
                    window.StudyAdventure.recordSuccess({
                        points: 1,
                        message: 'Study checkpoint cleared in the maze.'
                    });
                }
            }
        }
        clearPelletAt(pellet.x, pellet.y);
        pelletsRemaining--;

        if (!fruit && pelletsEaten > 0 && pelletsEaten % 35 === 0) {
            spawnFruit();
        }
    }

    if (fruit && fruit.x === pacman.x && fruit.y === pacman.y) {
        score += 150;
        combo = Math.min(combo + 1, 8);
        fruit = null;
        fruitTimer = 0;
        updateStudyBrief(true);
        if (window.StudyAdventure) {
            window.StudyAdventure.recordSuccess({
                points: 3,
                message: 'Bonus artifact captured. Quest energy boosted.'
            });
        }
    }
}

function moveGhosts() {
    ghosts.forEach(ghost => {
        let moved = false;
        const directions = [0, 1, 2, 3];
        
        // Shuffle directions
        for (let i = directions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [directions[i], directions[j]] = [directions[j], directions[i]];
        }
        
        for (let dir of directions) {
            let newX = ghost.x;
            let newY = ghost.y;
            
            if (dir === 0) newX++; // Right
            else if (dir === 1) newY++; // Down
            else if (dir === 2) newX--; // Left
            else if (dir === 3) newY--; // Up
            
            // Tunnel wrap-around
            if (newX < 0) newX = GRID_WIDTH - 1;
            if (newX >= GRID_WIDTH) newX = 0;
            
            if (maze[newY] && maze[newY][newX] === 0) {
                ghost.x = newX;
                ghost.y = newY;
                ghost.direction = dir;
                moved = true;
                break;
            }
        }
    });
}

function checkCollisions() {
    for (let ghost of ghosts) {
        if (ghost.x === pacman.x && ghost.y === pacman.y) {
            if (ghost.frightened) {
                // Eat ghost
                ghostCombo += 1;
                score += 200 * ghostCombo;
                combo = Math.min(combo + 2, 8);
                ghost.x = 9;
                ghost.y = 9;
                ghost.frightened = false;
                ghost.warning = false;
            } else {
                // Hit by ghost
                lives--;
                combo = 1;
                ghostCombo = 0;
                if (window.StudyAdventure) {
                    window.StudyAdventure.recordSetback({
                        message: 'Ghost collision detected. Reset route and control intersections.'
                    });
                }
                triggerHitEffect();
                if (lives > 0) {
                    pacman.x = 9;
                    pacman.y = 15;
                    ghosts.forEach(g => {
                        g.x = Math.max(1, Math.min(GRID_WIDTH - 2, Math.round(9 + Math.random() * 3 - 1)));
                        g.y = Math.max(1, Math.min(GRID_HEIGHT - 2, Math.round(7 + Math.random() * 3 - 1)));
                        g.frightened = false;
                        g.warning = false;
                    });
                    pendingCountdown = true;
                }
            }
        }
    }
}

function updatePowerUp() {
    if (powerUpActive) {
        powerUpTimer--;
        const warningPhase = powerUpTimer <= 20;
        ghosts.forEach(g => {
            if (g.frightened) {
                g.warning = warningPhase;
            }
        });
        if (powerUpTimer <= 0) {
            powerUpActive = false;
            ghosts.forEach(g => {
                g.frightened = false;
                g.warning = false;
            });
            ghostCombo = 0;
        }
    }
}

function updateFruit() {
    if (!fruit) return;
    fruitTimer--;
    if (fruitTimer <= 0) {
        fruit = null;
    }
}

function spawnFruit() {
    const candidates = [];
    for (let y = 1; y < GRID_HEIGHT - 1; y++) {
        for (let x = 1; x < GRID_WIDTH - 1; x++) {
            if (maze[y][x] === 0 && !(x === pacman.x && y === pacman.y)) {
                candidates.push({ x, y });
            }
        }
    }
    if (candidates.length === 0) return;
    fruit = candidates[Math.floor(Math.random() * candidates.length)];
    fruitTimer = 45;
}

function updateSpeed() {
    const progress = 1 - (pelletsRemaining / Math.max(1, totalPellets));
    level = Math.min(1 + Math.floor(progress * 6), 7);
    const scoreBoost = Math.min(Math.floor(score / 400) * 4, 24);
    const levelBoost = (level - 1) * 8;
    loopDelay = Math.max(105, 200 - levelBoost - scoreBoost);
}

function triggerHitEffect() {
    const wrapper = document.querySelector('.game-wrapper');
    if (!wrapper) return;
    wrapper.classList.remove('hit');
    void wrapper.offsetWidth;
    wrapper.classList.add('hit');
}

function endGame(won) {
    gameActive = false;
    clearScheduledTimers();
    setStartButtonsDisabled(false);
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('pacmanHighScore', String(highScore));
    }
    if (window.GameModes) GameModes.roundEnd(score);
    if (typeof window.saveLeaderboardScore === 'function') window.saveLeaderboardScore('pacman', score);
    const modal = document.getElementById('gameOverModal');
    document.getElementById('modalTitle').textContent = won ? 'You Won! 🎉' : 'Game Over!';
    document.getElementById('modalMessage').textContent = won 
        ? 'Congratulations! You collected all the pellets!' 
        : `You ran out of lives. Better luck next time!`;
    document.getElementById('finalScore').textContent = score;
    modal.classList.remove('hidden');
    updateUI();

    if (window.StudyAdventure) {
        if (won) {
            window.StudyAdventure.recordSuccess({
                points: 5,
                message: 'Maze cleared. New quest topic progress secured.'
            });
        } else {
            window.StudyAdventure.recordSetback({
                message: 'Run ended early. Focus on pathing before speed.'
            });
        }
        window.StudyAdventure.endSession(score);
    }
}

function readJsonStorage(key, fallback) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        return parsed ?? fallback;
    } catch (_error) {
        return fallback;
    }
}

function buildSlideChallenges() {
    const generatedQuiz = readJsonStorage(GENERATED_QUIZ_KEY, []);
    const uploadedFiles = readJsonStorage(UPLOADED_FILES_KEY, []);
    const items = [];

    generatedQuiz.forEach((item) => {
        if (!item || !item.question) return;
        const answer = Array.isArray(item.options) && item.correct >= 0 ? item.options[item.correct] : '';
        items.push(answer ? `${item.question} Answer: ${answer}.` : item.question);
    });

    uploadedFiles.forEach((file) => {
        if (file && file.originalName) {
            items.push(`Source file in play: ${file.originalName}. Chase pellets to cycle another prompt.`);
        }
    });

    return items.filter(Boolean);
}

function updateStudyBrief(advance) {
    if (!_elStudyBrief) {
        cacheHUD();
    }

    if (!useUploadedSource || slideChallenges.length === 0) {
        _elStudyBrief.textContent = 'Launch from the upload flow to bring slide prompts into the maze.';
        return;
    }

    if (advance) {
        slideChallengeIndex = (slideChallengeIndex + 1) % slideChallenges.length;
    }

    _elStudyBrief.textContent = slideChallenges[slideChallengeIndex];
}

function bindControlButtons() {
    const startButtons = document.querySelectorAll('[data-start-game]');
    startButtons.forEach((button) => {
        button.addEventListener('click', initGame);
    });

    const resetButton = document.querySelector('[data-reset-game]');
    if (resetButton) {
        resetButton.addEventListener('click', resetGame);
    }
}

// Keyboard controls
document.addEventListener('keydown', (e) => {
    if (!gameActive) return;
    
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        pacman.nextDirection = 0;
        e.preventDefault();
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        pacman.nextDirection = 1;
        e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        pacman.nextDirection = 2;
        e.preventDefault();
    } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        pacman.nextDirection = 3;
        e.preventDefault();
    }
});

if (useUploadedSource) {
    slideChallenges = buildSlideChallenges();
}

// Initialize on page load
window.addEventListener('load', () => {
    bindControlButtons();
    resetGame();
});

if (window.GameModes) {
    GameModes.init({
        gameLabel: 'Pac-Man',
        startFn: initGame,
        resetFn: resetGame,
        getScore: () => score
    });
}
