const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('bestScore');
const statusEl = document.getElementById('status');
const studyPromptEl = document.getElementById('studyPrompt');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');

const GRID_SIZE = 21;
const CELL_SIZE = canvas.width / GRID_SIZE;
const START_SPEED_MS = 190;
const MIN_SPEED_MS = 70;
const SPEED_STEP_SCORE = 10;
const SPEED_STEP_MS = 4;
const GENERATED_QUIZ_KEY = 'slidePlayGeneratedQuizData';
const UPLOADED_FILES_KEY = 'slidePlayUploadedFiles';
const useUploadedSource = new URLSearchParams(window.location.search).get('source') === 'upload';

let snake = [];
let direction = { x: 1, y: 0 };
let queuedDirection = { x: 1, y: 0 };
let food = { x: 10, y: 10 };
let score = 0;
let bestScore = Number(localStorage.getItem('snakeBestScore') || 0);
let tickSpeed = START_SPEED_MS;
let gameLoopId = null;
let isRunning = false;
let studyPrompts = [];
let studyPromptIndex = 0;

bestScoreEl.textContent = String(bestScore);

function resetState() {
    snake = [
        { x: 9, y: 10 },
        { x: 8, y: 10 },
        { x: 7, y: 10 }
    ];
    direction = { x: 1, y: 0 };
    queuedDirection = { x: 1, y: 0 };
    score = 0;
    tickSpeed = START_SPEED_MS;
    placeFood();
    updateScore();
    draw();
}

function startGame() {
    if (gameLoopId) clearTimeout(gameLoopId);
    resetState();
    isRunning = true;
    if (window.StudyAdventure) {
        window.StudyAdventure.startSession('snake_game', 'Slide Snake');
        window.StudyAdventure.pushHint('Build safe loops first, then increase pace for clean growth.');
    }
    statusEl.textContent = useUploadedSource && studyPrompts.length > 0
        ? 'Eat fact orbs and cycle through your slide prompts'
        : 'Eat food and avoid walls or yourself';
    updateStudyPrompt(false);
    tick();
}

function resetGame() {
    if (gameLoopId) clearTimeout(gameLoopId);
    gameLoopId = null;
    isRunning = false;
    resetState();
    statusEl.textContent = 'Press Start to play';
    updateStudyPrompt(false);
}

function tick() {
    if (!isRunning) return;

    direction = queuedDirection;

    const nextHead = {
        x: snake[0].x + direction.x,
        y: snake[0].y + direction.y
    };

    if (isCollision(nextHead)) {
        gameOver();
        return;
    }

    snake.unshift(nextHead);

    if (nextHead.x === food.x && nextHead.y === food.y) {
        score += 10;
        tickSpeed = getSpeedForScore(score);
        updateStudyPrompt(true);
        if (window.StudyAdventure) {
            window.StudyAdventure.recordSuccess({
                points: 1,
                message: 'Nutrient orb captured. Topic mastery chain extended.'
            });
        }
        placeFood();
        updateScore();
    } else {
        snake.pop();
    }

    draw();
    gameLoopId = setTimeout(tick, tickSpeed);
}

function getSpeedForScore(currentScore) {
    const steps = Math.floor(currentScore / SPEED_STEP_SCORE);
    return Math.max(MIN_SPEED_MS, START_SPEED_MS - (steps * SPEED_STEP_MS));
}

function isCollision(pos) {
    if (pos.x < 0 || pos.x >= GRID_SIZE || pos.y < 0 || pos.y >= GRID_SIZE) {
        return true;
    }

    for (const segment of snake) {
        if (segment.x === pos.x && segment.y === pos.y) {
            return true;
        }
    }

    return false;
}

function placeFood() {
    while (true) {
        const candidate = {
            x: Math.floor(Math.random() * GRID_SIZE),
            y: Math.floor(Math.random() * GRID_SIZE)
        };

        const occupied = snake.some(segment => segment.x === candidate.x && segment.y === candidate.y);
        if (!occupied) {
            food = candidate;
            return;
        }
    }
}

function updateScore() {
    scoreEl.textContent = String(score);
    if (score > bestScore) {
        bestScore = score;
        bestScoreEl.textContent = String(bestScore);
        localStorage.setItem('snakeBestScore', String(bestScore));
    }
}

function gameOver() {
    isRunning = false;
    statusEl.textContent = `Game over. Score: ${score}. Press Start to play again.`;
    if (window.StudyAdventure) {
        window.StudyAdventure.recordSetback({
            message: 'Snake run collapsed. Leave more turning room before committing.'
        });
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

function buildStudyPrompts() {
    const generatedQuiz = readJsonStorage(GENERATED_QUIZ_KEY, []);
    const uploadedFiles = readJsonStorage(UPLOADED_FILES_KEY, []);
    const prompts = [];

    generatedQuiz.forEach((item) => {
        if (!item || !item.question) return;
        const answer = Array.isArray(item.options) && item.correct >= 0 ? item.options[item.correct] : '';
        prompts.push(answer ? `${item.question} Answer: ${answer}.` : item.question);
    });

    uploadedFiles.forEach((file) => {
        if (file && file.originalName) {
            prompts.push(`Uploaded source: ${file.originalName}. Collect the next orb to keep studying.`);
        }
    });

    return prompts.filter(Boolean);
}

function updateStudyPrompt(advance) {
    if (!studyPromptEl) return;

    if (!useUploadedSource || studyPrompts.length === 0) {
        studyPromptEl.textContent = 'Launch from the upload flow to turn slide notes into food targets.';
        return;
    }

    if (advance) {
        studyPromptIndex = (studyPromptIndex + 1) % studyPrompts.length;
    }

    studyPromptEl.textContent = studyPrompts[studyPromptIndex];
}

function drawCell(x, y, color) {
    const px = x * CELL_SIZE;
    const py = y * CELL_SIZE;
    ctx.fillStyle = color;
    ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
}

function drawGridLines() {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i++) {
        const p = i * CELL_SIZE;
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, p);
        ctx.lineTo(canvas.width, p);
        ctx.stroke();
    }
}

function draw() {
    ctx.fillStyle = '#0d1325';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGridLines();
    drawCell(food.x, food.y, '#ff4d79');

    snake.forEach((segment, index) => {
        drawCell(segment.x, segment.y, index === 0 ? '#7aff95' : '#38c96e');
    });
}

function setDirection(x, y) {
    if (!isRunning) return;

    // Prevent instant 180-degree turn
    if (x === -direction.x && y === -direction.y) {
        return;
    }

    queuedDirection = { x, y };
}

document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();

    if (key === 'arrowup' || key === 'w') {
        setDirection(0, -1);
        event.preventDefault();
    } else if (key === 'arrowdown' || key === 's') {
        setDirection(0, 1);
        event.preventDefault();
    } else if (key === 'arrowleft' || key === 'a') {
        setDirection(-1, 0);
        event.preventDefault();
    } else if (key === 'arrowright' || key === 'd') {
        setDirection(1, 0);
        event.preventDefault();
    }
});

startBtn.addEventListener('click', startGame);
resetBtn.addEventListener('click', resetGame);

if (useUploadedSource) {
    studyPrompts = buildStudyPrompts();
    if (studyPrompts.length > 0) {
        document.querySelector('.game-header h1').textContent = 'Slide Snake';
    }
}

resetState();
