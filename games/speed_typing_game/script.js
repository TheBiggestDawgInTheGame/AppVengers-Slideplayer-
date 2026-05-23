let challengePools = {
    easy: [
        'speed typing is a great way to improve keyboard skills',
        'practice every day to increase your typing speed and accuracy'
    ],
    medium: [
        'focus on the sentence and try to avoid errors while typing',
        'the fastest typist stays calm under pressure and keeps going',
        'consistent practice makes a big difference in typing performance'
    ],
    hard: [
        'mastering typing helps you work faster and more confidently',
        'typing with rhythm and precision builds confidence under pressure',
        'high accuracy at speed is the real sign of an expert typist'
    ]
};

const timeLimits = {
    easy: 60,
    medium: 45,
    hard: 30
};

const GENERATED_QUIZ_KEY = 'slidePlayGeneratedQuizData';
const UPLOADED_FILES_KEY = 'slidePlayUploadedFiles';
const useUploadedSource = new URLSearchParams(window.location.search).get('source') === 'upload';

const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const typingInput = document.getElementById('typingInput');
const challengeText = document.getElementById('challengeText');
const timeLeftDisplay = document.getElementById('timeLeft');
const scoreDisplay = document.getElementById('score');
const typedCountDisplay = document.getElementById('typedCount');
const wpmDisplay = document.getElementById('wpm');
const accuracyDisplay = document.getElementById('accuracy');
const bestScoreDisplay = document.getElementById('bestScore');
const feedback = document.getElementById('feedback');
const summaryModal = document.getElementById('summaryModal');
const finalScoreDisplay = document.getElementById('finalScore');
const finalWpmDisplay = document.getElementById('finalWpm');
const finalAccuracyDisplay = document.getElementById('finalAccuracy');
const finalBestScoreDisplay = document.getElementById('finalBestScore');
const playAgainBtn = document.getElementById('playAgainBtn');
const closeSummaryBtn = document.getElementById('closeSummaryBtn');

let timer = null;
let timeLeft = 0;
let score = 0;
let currentChallenge = '';
let wordsCompleted = 0;
let gameActive = false;
let currentDifficulty = 'easy';
let lastChallenge = '';
let startTime = 0;
let totalTypedChars = 0;
let totalCorrectChars = 0;
let attemptCharsCurrent = 0;
let previousInputLength = 0;
let bestScore = Number(localStorage.getItem('typingBestScore') || 0);
let countdownTimer = null;
let isCountingDown = false;

function readJsonStorage(key, fallback) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        return parsed ?? fallback;
    } catch (_error) {
        return fallback;
    }
}

function normalizeSentence(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function wordsCount(text) {
    return normalizeSentence(text).split(' ').filter(Boolean).length;
}

function buildUploadedChallengePools() {
    const quizData = readJsonStorage(GENERATED_QUIZ_KEY, []);
    const uploadedFiles = readJsonStorage(UPLOADED_FILES_KEY, []);
    const candidates = [];

    quizData.forEach((item) => {
        if (!item || !item.question) return;
        candidates.push(normalizeSentence(item.question));

        if (Array.isArray(item.options) && item.options.length > 1) {
            const line = item.options.map((option) => normalizeSentence(option)).filter(Boolean).join(' then ');
            if (line) {
                candidates.push(`review key terms ${line}`);
            }
        }
    });

    uploadedFiles.forEach((file) => {
        if (!file || !file.originalName) return;
        const label = normalizeSentence(file.originalName.replace(/\.[^.]+$/, ''));
        if (label) {
            candidates.push(`practice slide topic ${label} with focused typing drills`);
        }
    });

    const unique = [];
    const seen = new Set();
    candidates.forEach((line) => {
        if (!line || line.length < 20) return;
        if (seen.has(line)) return;
        seen.add(line);
        unique.push(line);
    });

    const pools = { easy: [], medium: [], hard: [] };
    unique.forEach((line) => {
        const count = wordsCount(line);
        if (count <= 8) pools.easy.push(line);
        else if (count <= 12) pools.medium.push(line);
        else pools.hard.push(line);
    });

    if (pools.easy.length < 2 || pools.medium.length < 2 || pools.hard.length < 2) {
        return null;
    }

    return pools;
}

function getRandomChallenge(difficulty) {
    const pool = challengePools[difficulty] || challengePools.easy;
    if (pool.length === 1) return pool[0];

    let selected = randomItem(pool);
    let guard = 0;
    while (selected === lastChallenge && guard < 8) {
        selected = randomItem(pool);
        guard += 1;
    }
    lastChallenge = selected;
    return selected;
}

function startGame() {
    if (gameActive || isCountingDown) return;

    if (window.StudyAdventure) {
        window.StudyAdventure.startSession('speed_typing_game', `Speed Typing (${currentDifficulty})`);
        window.StudyAdventure.pushHint('Prioritize accuracy first, then increase typing tempo.');
    }

    hideSummaryModal();

    timeLeft = timeLimits[currentDifficulty];
    score = 0;
    wordsCompleted = 0;
    totalTypedChars = 0;
    totalCorrectChars = 0;
    attemptCharsCurrent = 0;
    previousInputLength = 0;
    startTime = 0;

    updateUI();

    isCountingDown = true;
    startBtn.disabled = true;
    startBtn.textContent = 'Get Ready...';
    resetBtn.disabled = true;
    typingInput.disabled = true;
    typingInput.value = '';
    challengeText.textContent = 'Starting in 3...';
    feedback.textContent = 'Get your hands ready.';
    feedback.className = 'feedback';

    startCountdown(3);
}

function startCountdown(seconds) {
    clearInterval(countdownTimer);
    let remaining = seconds;

    countdownTimer = setInterval(() => {
        remaining -= 1;

        if (remaining > 0) {
            challengeText.textContent = `Starting in ${remaining}...`;
            return;
        }

        clearInterval(countdownTimer);
        countdownTimer = null;
        isCountingDown = false;
        beginRound();
    }, 1000);
}

function beginRound() {
    currentChallenge = getRandomChallenge(currentDifficulty);
    challengeText.textContent = currentChallenge;
    startTime = Date.now();
    gameActive = true;
    startBtn.textContent = 'Running...';
    resetBtn.disabled = false;
    typingInput.disabled = false;
    typingInput.focus();
    feedback.textContent = '';
    feedback.className = 'feedback';
    clearInterval(timer);
    timer = setInterval(onTick, 1000);
}

function resetGame() {
    clearInterval(timer);
    clearInterval(countdownTimer);
    timer = null;
    countdownTimer = null;
    gameActive = false;
    isCountingDown = false;
    currentDifficulty = 'easy';
    selectedDifficultyUI();
    timeLeft = timeLimits[currentDifficulty];
    score = 0;
    wordsCompleted = 0;
    totalTypedChars = 0;
    totalCorrectChars = 0;
    attemptCharsCurrent = 0;
    previousInputLength = 0;
    startTime = 0;
    currentChallenge = 'Press Start to begin!';
    challengeText.textContent = currentChallenge;
    typingInput.value = '';
    typingInput.disabled = true;
    resetBtn.disabled = false;
    startBtn.disabled = false;
    startBtn.textContent = 'Start';
    updateUI();
    feedback.textContent = '';
    feedback.className = 'feedback';
    hideSummaryModal();
}

function onTick() {
    if (!gameActive) return;
    timeLeft -= 1;
    if (timeLeft <= 0) {
        endGame(false);
        return;
    }
    updateUI();
}

function updateUI() {
    timeLeftDisplay.textContent = timeLeft;
    scoreDisplay.textContent = score;
    typedCountDisplay.textContent = wordsCompleted;

    const elapsedMinutes = startTime > 0 ? (Date.now() - startTime) / 60000 : 0;
    const currentWpm = elapsedMinutes > 0 ? Math.round((totalCorrectChars / 5) / elapsedMinutes) : 0;
    const accuracy = totalTypedChars > 0 ? Math.round((totalCorrectChars / totalTypedChars) * 100) : 100;

    wpmDisplay.textContent = currentWpm;
    accuracyDisplay.textContent = `${accuracy}%`;
    bestScoreDisplay.textContent = bestScore;
}

function onInput() {
    if (!gameActive) return;
    const typedValue = typingInput.value;
    const expectedPhrase = currentChallenge.slice(0, typedValue.length);

    if (typedValue.length > previousInputLength) {
        attemptCharsCurrent += typedValue.length - previousInputLength;
    }
    previousInputLength = typedValue.length;

    if (typedValue === currentChallenge) {
        const wordCount = currentChallenge.trim().split(/\s+/).length;
        wordsCompleted += wordCount;

        totalCorrectChars += currentChallenge.length;
        totalTypedChars += Math.max(attemptCharsCurrent, currentChallenge.length);

        score += calculateScore(currentDifficulty, typedValue.length);

        if (score > bestScore) {
            bestScore = score;
            localStorage.setItem('typingBestScore', String(bestScore));
        }

        if (window.StudyAdventure) {
            window.StudyAdventure.recordSuccess({
                points: 2,
                message: 'Typing challenge completed cleanly. Recall speed improved.'
            });
        }

        feedback.textContent = 'Great! You finished this challenge.';
        feedback.className = 'feedback success';
        typingInput.value = '';
        previousInputLength = 0;
        attemptCharsCurrent = 0;
        currentChallenge = getRandomChallenge(currentDifficulty);
        challengeText.textContent = currentChallenge;
    } else if (typedValue === expectedPhrase) {
        feedback.textContent = '';
        feedback.className = 'feedback';
    } else {
        feedback.textContent = 'Keep going, watch for mistakes.';
        feedback.className = 'feedback error';
    }
    updateUI();
}

function calculateScore(difficulty, length) {
    const multiplier = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 1.5 : 2;
    return Math.round(length * multiplier);
}

function selectDifficulty(level) {
    currentDifficulty = level;
    selectedDifficultyUI();
    if (!gameActive) {
        timeLeft = timeLimits[currentDifficulty];
        updateUI();
    }
}

function selectedDifficultyUI() {
    const levels = ['easy', 'medium', 'hard'];
    levels.forEach(level => {
        const button = document.querySelector(`[data-difficulty="${level}"]`);
        if (button) {
            button.classList.toggle('active', level === currentDifficulty);
        }
    });
}

function randomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function endGame(won) {
    clearInterval(timer);
    timer = null;
    gameActive = false;
    isCountingDown = false;
    typingInput.disabled = true;
    resetBtn.disabled = false;
    startBtn.disabled = false;
    startBtn.textContent = 'Start';
    feedback.textContent = won ? 'Time up! Great effort.' : 'Time up! Try again faster.';
    feedback.className = 'feedback error';
    updateUI();
    if (window.GameModes) GameModes.roundEnd(score);
    if (typeof window.saveLeaderboardScore === 'function') window.saveLeaderboardScore('typing', score);
    showSummaryModal();

    if (window.StudyAdventure) {
        if (score >= 80) {
            window.StudyAdventure.recordSuccess({
                points: 3,
                message: 'Session complete with strong throughput. Topic unlock progress advanced.'
            });
        } else {
            window.StudyAdventure.recordSetback({
                message: 'Session ended below target pace. Aim for shorter error bursts next round.'
            });
        }
        window.StudyAdventure.endSession(score);
    }
}

function getCurrentStats() {
    const elapsedMinutes = startTime > 0 ? (Date.now() - startTime) / 60000 : 0;
    const wpm = elapsedMinutes > 0 ? Math.round((totalCorrectChars / 5) / elapsedMinutes) : 0;
    const accuracy = totalTypedChars > 0 ? Math.round((totalCorrectChars / totalTypedChars) * 100) : 100;
    return { wpm, accuracy };
}

function showSummaryModal() {
    const stats = getCurrentStats();
    finalScoreDisplay.textContent = score;
    finalWpmDisplay.textContent = stats.wpm;
    finalAccuracyDisplay.textContent = `${stats.accuracy}%`;
    finalBestScoreDisplay.textContent = bestScore;
    summaryModal.classList.remove('hidden');
}

function hideSummaryModal() {
    summaryModal.classList.add('hidden');
}

window.addEventListener('load', () => {
    if (useUploadedSource) {
        const uploadedPools = buildUploadedChallengePools();
        if (uploadedPools) {
            challengePools = uploadedPools;
            const heading = document.querySelector('.header-middle h2');
            const sub = document.querySelector('.header-middle p');
            if (heading) heading.textContent = 'Slide Speed Typing Challenge';
            if (sub) sub.textContent = 'Type statements and terms generated from your uploaded slide content.';
        }
    }

    const difficultyButtons = document.querySelectorAll('.btn-difficulty');
    difficultyButtons.forEach(button => {
        button.addEventListener('click', () => selectDifficulty(button.dataset.difficulty));
    });
    startBtn.addEventListener('click', startGame);
    resetBtn.addEventListener('click', resetGame);
    playAgainBtn.addEventListener('click', () => {
        hideSummaryModal();
        startGame();
    });
    closeSummaryBtn.addEventListener('click', hideSummaryModal);
    summaryModal.addEventListener('click', event => {
        if (event.target === summaryModal) {
            hideSummaryModal();
        }
    });
    typingInput.addEventListener('input', onInput);
    resetGame();
});

if (window.GameModes) {
    GameModes.init({
        gameLabel: 'Speed Typing',
        startFn: startGame,
        resetFn: () => {},
        getScore: () => score
    });
}
