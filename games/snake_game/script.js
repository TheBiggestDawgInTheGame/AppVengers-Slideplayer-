const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('bestScore');
const statusEl = document.getElementById('status');
const studyPromptEl = document.getElementById('studyPrompt');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const checkpointEl = document.getElementById('studyCheckpoint');
const checkpointQuestionEl = document.getElementById('checkpointQuestion');
const checkpointOptionsEl = document.getElementById('checkpointOptions');
const checkpointFeedbackEl = document.getElementById('checkpointFeedback');
const mpDisplayNameEl = document.getElementById('mpDisplayName');
const mpRoomIdEl = document.getElementById('mpRoomId');
const mpCreateBtn = document.getElementById('mpCreateBtn');
const mpJoinBtn = document.getElementById('mpJoinBtn');
const mpLeaveBtn = document.getElementById('mpLeaveBtn');
const mpHintEl = document.getElementById('mpHint');
const mpPlayersEl = document.getElementById('mpPlayers');

const GRID_SIZE = 21;
const CELL_SIZE = canvas.width / GRID_SIZE;
const START_SPEED_MS = 190;
const MIN_SPEED_MS = 70;
const SPEED_STEP_SCORE = 10;
const SPEED_STEP_MS = 4;
const GENERATED_QUIZ_KEY = 'slidePlayGeneratedQuizData';
const UPLOADED_FILES_KEY = 'slidePlayUploadedFiles';
const useUploadedSource = new URLSearchParams(window.location.search).get('source') === 'upload';
const CHECKPOINT_INTERVAL = 3;
const CHECKPOINT_BONUS = 15;
const CHECKPOINT_PENALTY = 5;
const MP_TOKEN_PREFIX = 'snakeMpToken_';
const MP_ROOM_QUERY_KEY = 'room';

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
let studyQuestions = [];
let usedCheckpointIndexes = [];
let foodsCollected = 0;
let checkpointActive = false;
let multiplayer = {
    enabled: false,
    roomId: '',
    playerId: '',
    socket: null,
    state: null
};

bestScoreEl.textContent = String(bestScore);

function setMultiplayerHint(message) {
    if (mpHintEl) {
        mpHintEl.textContent = message;
    }
}

function getStoredTokenForRoom(roomId) {
    if (!roomId) return '';
    return localStorage.getItem(MP_TOKEN_PREFIX + roomId) || '';
}

function setStoredTokenForRoom(roomId, token) {
    if (!roomId || !token) return;
    localStorage.setItem(MP_TOKEN_PREFIX + roomId, token);
}

function getSelectedDisplayName() {
    const provided = String(mpDisplayNameEl?.value || '').trim();
    if (provided) return provided;

    try {
        const session = JSON.parse(localStorage.getItem('sp_session') || 'null');
        if (session && typeof session.username === 'string' && session.username.trim()) {
            return session.username.trim();
        }
    } catch (_error) {
        // ignore
    }

    return `Player-${Math.random().toString(36).slice(2, 6)}`;
}

function getAuthToken() {
    return String(localStorage.getItem('sp_auth_token') || '').trim();
}

function clearSinglePlayerLoop() {
    if (gameLoopId) clearTimeout(gameLoopId);
    gameLoopId = null;
    isRunning = false;
    checkpointActive = false;
    hideCheckpoint();
}

function renderMultiplayerPlayers(state) {
    if (!mpPlayersEl) return;
    const players = Array.isArray(state?.players) ? state.players : [];
    if (players.length === 0) {
        mpPlayersEl.innerHTML = '<div class="player-chip">No players yet.</div>';
        return;
    }

    const chips = players.map((player) => {
        const isMe = player.playerId === multiplayer.playerId;
        const lifeLabel = player.alive ? 'alive' : 'out';
        const connLabel = player.connected ? 'online' : 'reconnecting';
        return `<div class="player-chip" style="border-color:${player.color}">${isMe ? 'You' : player.displayName} • ${player.score} pts • ${lifeLabel} • ${connLabel}</div>`;
    });
    mpPlayersEl.innerHTML = chips.join('');
}

function drawMultiplayerState(state) {
    ctx.fillStyle = '#0d1325';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGridLines();

    if (state?.food) {
        drawCell(state.food.x, state.food.y, '#ff4d79');
    }

    const players = Array.isArray(state?.players) ? state.players : [];
    players.forEach((player) => {
        if (!Array.isArray(player.snake)) return;
        player.snake.forEach((segment, index) => {
            const color = index === 0 ? player.color : `${player.color}cc`;
            drawCell(segment.x, segment.y, color);
        });
    });
}

function applyMultiplayerState(state) {
    multiplayer.state = state;
    drawMultiplayerState(state);
    renderMultiplayerPlayers(state);

    const players = Array.isArray(state?.players) ? state.players : [];
    const me = players.find((player) => player.playerId === multiplayer.playerId);
    scoreEl.textContent = String(me?.score || 0);

    const connectedCount = Number(state?.connectedCount || 0);
    statusEl.textContent = `Multiplayer room ${multiplayer.roomId} • ${connectedCount} connected`;
}

async function createRoom() {
    try {
        const response = await fetch('/api/multiplayer/rooms', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {})
            },
            body: JSON.stringify({ mode: 'snake' })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            setMultiplayerHint(payload.error || 'Could not create room.');
            return;
        }

        if (mpRoomIdEl) {
            mpRoomIdEl.value = payload.roomId;
        }
        setMultiplayerHint(`Room created: ${payload.roomId}. Joining now...`);
        await joinRoom(payload.roomId);
    } catch (_error) {
        setMultiplayerHint('Could not create room. Check that the Node server is running.');
    }
}

async function joinRoom(roomIdValue) {
    const roomId = String(roomIdValue || mpRoomIdEl?.value || '').trim();
    if (!roomId) {
        setMultiplayerHint('Enter a room ID first.');
        return;
    }

    const savedToken = getStoredTokenForRoom(roomId);
    const displayName = getSelectedDisplayName();

    try {
        const response = await fetch(`/api/multiplayer/rooms/${encodeURIComponent(roomId)}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {})
            },
            body: JSON.stringify({
                displayName,
                playerToken: savedToken
            })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            setMultiplayerHint(payload.error || 'Unable to join room.');
            return;
        }

        setStoredTokenForRoom(roomId, payload.playerToken);
        multiplayer.roomId = roomId;
        multiplayer.playerId = payload.playerId;
        multiplayer.enabled = true;

        clearSinglePlayerLoop();
        connectMultiplayerSocket(roomId, payload.playerToken, displayName);

        const url = new URL(window.location.href);
        url.searchParams.set(MP_ROOM_QUERY_KEY, roomId);
        window.history.replaceState({}, '', url.toString());

        if (payload.state) {
            applyMultiplayerState(payload.state);
        }
        setMultiplayerHint(`Joined room ${roomId}. Share this ID with your friend.`);
    } catch (_error) {
        setMultiplayerHint('Unable to join room. Check server connection and try again.');
    }
}

function connectMultiplayerSocket(roomId, playerToken, displayName) {
    if (typeof io !== 'function') {
        setMultiplayerHint('Socket.IO client is missing on this page.');
        return;
    }

    if (multiplayer.socket) {
        multiplayer.socket.disconnect();
    }

    const socket = io({
        auth: {
            roomId,
            playerToken,
            authToken: getAuthToken(),
            displayName
        }
    });

    socket.on('connect', () => {
        statusEl.textContent = `Connected to room ${roomId}. Waiting for state sync...`;
    });

    socket.on('multiplayer:joined', (payload) => {
        if (payload?.state) {
            applyMultiplayerState(payload.state);
        }
    });

    socket.on('multiplayer:state', (state) => {
        applyMultiplayerState(state);
    });

    socket.on('multiplayer:error', (payload) => {
        setMultiplayerHint(payload?.error || 'Multiplayer socket error.');
    });

    socket.on('disconnect', () => {
        if (multiplayer.enabled) {
            statusEl.textContent = `Disconnected from room ${roomId}. Attempting reconnect...`;
        }
    });

    multiplayer.socket = socket;
}

function leaveRoom(resetUi = true) {
    if (multiplayer.socket) {
        multiplayer.socket.disconnect();
    }
    multiplayer = {
        enabled: false,
        roomId: '',
        playerId: '',
        socket: null,
        state: null
    };

    if (resetUi) {
        statusEl.textContent = 'Left multiplayer room. Press Start for solo play.';
        setMultiplayerHint('Create a room, share the ID, then play together in real time.');
        renderMultiplayerPlayers({ players: [] });
        resetState();
    }
}

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
    foodsCollected = 0;
    checkpointActive = false;
    hideCheckpoint();
    placeFood();
    updateScore();
    draw();
}

function startGame() {
    if (multiplayer.enabled) {
        statusEl.textContent = `Multiplayer active in room ${multiplayer.roomId}. Use arrow keys to control your snake.`;
        return;
    }

    if (gameLoopId) clearTimeout(gameLoopId);
    gameLoopId = null;
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
    if (multiplayer.enabled) {
        leaveRoom(true);
        return;
    }

    if (gameLoopId) clearTimeout(gameLoopId);
    gameLoopId = null;
    isRunning = false;
    checkpointActive = false;
    hideCheckpoint();
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
        foodsCollected += 1;
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

        if (shouldTriggerCheckpoint()) {
            openStudyCheckpoint();
            draw();
            return;
        }
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
    checkpointActive = false;
    hideCheckpoint();
    statusEl.textContent = `Game over. Score: ${score}. Press Start to play again.`;
    // Submit to Firebase leaderboard
    if (typeof window.saveLeaderboardScore === 'function') {
        window.saveLeaderboardScore('snake', score);
    }
    // Submit to local leaderboard (legacy)
    try {
        const session = JSON.parse(localStorage.getItem('sp_session') || 'null');
        const playerName = session?.username || session?.email?.split('@')[0] || 'Anonymous';
        fetch('http://localhost:3000/api/leaderboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game: 'snake', name: playerName, score })
        }).catch(() => {});
    } catch (_e) {}
    if (window.StudyAdventure) {
        window.StudyAdventure.recordSetback({
            message: 'Snake run collapsed. Leave more turning room before committing.'
        });
        window.StudyAdventure.endSession(score);
    }
    if (window.GameModes) GameModes.roundEnd(score);
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

function buildStudyQuestions() {
    const generatedQuiz = readJsonStorage(GENERATED_QUIZ_KEY, []);
    return generatedQuiz.filter((item) => {
        return item
            && typeof item.question === 'string'
            && Array.isArray(item.options)
            && item.options.length >= 2
            && Number.isInteger(item.correct)
            && item.correct >= 0
            && item.correct < item.options.length;
    });
}

function shouldTriggerCheckpoint() {
    return studyQuestions.length > 0
        && !checkpointActive
        && foodsCollected > 0
        && foodsCollected % CHECKPOINT_INTERVAL === 0;
}

function pickCheckpointQuestionIndex() {
    const availableIndexes = studyQuestions
        .map((_item, index) => index)
        .filter((index) => !usedCheckpointIndexes.includes(index));

    if (availableIndexes.length === 0) {
        usedCheckpointIndexes = [];
        return Math.floor(Math.random() * studyQuestions.length);
    }

    const randomPoolIndex = Math.floor(Math.random() * availableIndexes.length);
    return availableIndexes[randomPoolIndex];
}

function openStudyCheckpoint() {
    if (!checkpointEl || !checkpointQuestionEl || !checkpointOptionsEl || !checkpointFeedbackEl) {
        return;
    }

    const questionIndex = pickCheckpointQuestionIndex();
    const question = studyQuestions[questionIndex];
    usedCheckpointIndexes.push(questionIndex);

    checkpointActive = true;
    isRunning = false;
    statusEl.textContent = 'Study checkpoint: answer to continue your run.';

    checkpointQuestionEl.textContent = question.question;
    checkpointFeedbackEl.textContent = 'Pick the best answer from your study topic.';
    checkpointOptionsEl.innerHTML = '';

    question.options.forEach((optionText, optionIndex) => {
        const optionBtn = document.createElement('button');
        optionBtn.type = 'button';
        optionBtn.className = 'checkpoint-option';
        optionBtn.textContent = optionText;
        optionBtn.addEventListener('click', () => {
            resolveCheckpointAnswer(question, optionIndex);
        });
        checkpointOptionsEl.appendChild(optionBtn);
    });

    checkpointEl.classList.remove('hidden');
}

function resolveCheckpointAnswer(question, chosenIndex) {
    const optionButtons = checkpointOptionsEl.querySelectorAll('.checkpoint-option');
    optionButtons.forEach((button, index) => {
        button.disabled = true;
        if (index === question.correct) {
            button.classList.add('correct');
        } else if (index === chosenIndex) {
            button.classList.add('wrong');
        }
    });

    const isCorrect = chosenIndex === question.correct;
    if (isCorrect) {
        score += CHECKPOINT_BONUS;
        checkpointFeedbackEl.textContent = `Correct! +${CHECKPOINT_BONUS} bonus points.`;
        statusEl.textContent = 'Great answer. Snake run resumed.';
        if (window.StudyAdventure) {
            window.StudyAdventure.recordSuccess({
                points: 2,
                message: 'Checkpoint answer was correct. Topic retention increased.'
            });
        }
    } else {
        score = Math.max(0, score - CHECKPOINT_PENALTY);
        checkpointFeedbackEl.textContent = `Not quite. Correct answer: ${question.options[question.correct]}. -${CHECKPOINT_PENALTY} points.`;
        statusEl.textContent = 'Checkpoint reviewed. Keep practicing the topic.';
        if (window.StudyAdventure) {
            window.StudyAdventure.recordSetback({
                message: 'Checkpoint missed. Review the concept and continue the run.'
            });
        }
    }

    updateScore();
    studyPromptEl.textContent = `Checkpoint review: ${question.question} Answer: ${question.options[question.correct]}.`;

    setTimeout(() => {
        hideCheckpoint();
        resumeFromCheckpoint();
    }, 1300);
}

function hideCheckpoint() {
    if (!checkpointEl || !checkpointQuestionEl || !checkpointOptionsEl || !checkpointFeedbackEl) {
        return;
    }

    checkpointEl.classList.add('hidden');
    checkpointQuestionEl.textContent = '';
    checkpointOptionsEl.innerHTML = '';
    checkpointFeedbackEl.textContent = '';
}

function resumeFromCheckpoint() {
    checkpointActive = false;
    isRunning = true;
    if (gameLoopId) clearTimeout(gameLoopId);
    gameLoopId = setTimeout(tick, tickSpeed);
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
    if (multiplayer.enabled && multiplayer.state) {
        drawMultiplayerState(multiplayer.state);
        return;
    }

    ctx.fillStyle = '#0d1325';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGridLines();
    drawCell(food.x, food.y, '#ff4d79');

    snake.forEach((segment, index) => {
        drawCell(segment.x, segment.y, index === 0 ? '#7aff95' : '#38c96e');
    });
}

function setDirection(x, y) {
    if (multiplayer.enabled) {
        if (multiplayer.socket && multiplayer.socket.connected) {
            multiplayer.socket.emit('snake:input', { x, y });
        }
        return;
    }

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

if (mpCreateBtn) {
    mpCreateBtn.addEventListener('click', () => {
        createRoom();
    });
}

if (mpJoinBtn) {
    mpJoinBtn.addEventListener('click', () => {
        joinRoom();
    });
}

if (mpLeaveBtn) {
    mpLeaveBtn.addEventListener('click', () => {
        leaveRoom(true);
    });
}

if (useUploadedSource) {
    studyPrompts = buildStudyPrompts();
    studyQuestions = buildStudyQuestions();
    if (studyPrompts.length > 0) {
        document.querySelector('.game-header h1').textContent = 'Slide Snake';
    }
    if (studyQuestions.length > 0) {
        statusEl.textContent = 'Slide Snake active: checkpoints will test your knowledge.';
    }
}

resetState();
renderMultiplayerPlayers({ players: [] });

const initialRoomId = new URLSearchParams(window.location.search).get(MP_ROOM_QUERY_KEY);
if (initialRoomId) {
    if (mpRoomIdEl) mpRoomIdEl.value = initialRoomId;
    joinRoom(initialRoomId);
}

if (window.GameModes) {
    GameModes.init({
        gameLabel: 'Snake',
        startFn: startGame,
        resetFn: resetGame,
        getScore: () => score
    });
}
