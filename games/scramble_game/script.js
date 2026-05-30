let gameData = {
    easy: [
        { word: 'planet', hint: 'A large object orbiting a star' },
        { word: 'coffee', hint: 'A popular hot drink' },
        { word: 'window', hint: 'You can open it for fresh air' },
        { word: 'garden', hint: 'A place where flowers grow' },
        { word: 'jacket', hint: 'A piece of outer clothing' }
    ],
    medium: [
        { word: 'network', hint: 'Connected system of computers' },
        { word: 'library', hint: 'A place full of books' },
        { word: 'rainbow', hint: 'Color arc after rain' },
        { word: 'journey', hint: 'A trip from one place to another' },
        { word: 'captain', hint: 'Leader of a team or ship' }
    ],
    hard: [
        { word: 'algorithm', hint: 'Step-by-step process for solving a problem' },
        { word: 'knowledge', hint: 'Information and understanding gained by learning' },
        { word: 'adventure', hint: 'An exciting or unusual experience' },
        { word: 'challenge', hint: 'A difficult task that tests ability' },
        { word: 'precision', hint: 'Quality of being exact and accurate' }
    ]
};

const levelConfig = {
    easy: { time: 35, score: 10, lives: 5, task: 'Unscramble a short word' },
    medium: { time: 30, score: 15, lives: 4, task: 'Unscramble a medium word' },
    hard: { time: 25, score: 20, lives: 3, task: 'Unscramble a hard word' }
};

const levelButtons = document.querySelectorAll('.btn-level');
const scrambleBox = document.getElementById('scrambleBox');
const answerInput = document.getElementById('answerInput');
const submitBtn = document.getElementById('submitBtn');
const nextBtn = document.getElementById('nextBtn');
const restartBtn = document.getElementById('restartBtn');
const feedbackMessage = document.getElementById('feedbackMessage');
const selectedLevel = document.getElementById('selectedLevel');
const taskType = document.getElementById('taskType');
const timerDisplay = document.getElementById('timerDisplay');
const hintText = document.getElementById('hintText');
const scoreDisplay = document.getElementById('scoreDisplay');
const streakDisplay = document.getElementById('streakDisplay');
const bestStreakDisplay = document.getElementById('bestStreakDisplay');
const livesDisplay = document.getElementById('livesDisplay');

let currentLevel = null;
let currentText = '';
let currentAnswer = '';
let timerInterval = null;
let remainingSeconds = 0;
let score = 0;
let streak = 0;
let bestStreak = Number(localStorage.getItem('scrambleBestStreak') || 0);
let lives = 0;
let maxLives = 0;
let runStartedAt = 0;
let premiumReportSubmitted = false;
let attemptLog = [];
let solvedCount = 0;

const GENERATED_QUIZ_KEY = 'slidePlayGeneratedQuizData';
const UPLOADED_FILES_KEY = 'slidePlayUploadedFiles';
const useUploadedSource = new URLSearchParams(window.location.search).get('source') === 'upload';

levelButtons.forEach(button => {
    button.addEventListener('click', () => {
        setDifficulty(button.dataset.level);
    });
});

submitBtn.addEventListener('click', checkAnswer);
nextBtn.addEventListener('click', nextScramble);
restartBtn.addEventListener('click', restartGame);
answerInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault();
        checkAnswer();
    }
});

function setDifficulty(level) {
    currentLevel = level;
    runStartedAt = Date.now();
    premiumReportSubmitted = false;
    attemptLog = [];
    solvedCount = 0;
    if (window.StudyAdventure) {
        window.StudyAdventure.startSession('scramble_game', `Word Unscramble (${capitalize(level)})`);
        window.StudyAdventure.pushHint('Use letter clusters and suffix patterns to solve faster.');
    }
    selectedLevel.textContent = capitalize(level);
    answerInput.value = '';
    feedbackMessage.textContent = '';
    restartBtn.classList.add('hidden');
    submitBtn.disabled = false;
    answerInput.disabled = false;
    nextBtn.disabled = false;

    levelButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.level === level));

    taskType.textContent = levelConfig[level].task;
    maxLives = levelConfig[level].lives;
    lives = maxLives;
    score = 0;
    streak = 0;
    updateStatsUI();
    loadScramble(level);
}

function loadScramble(level) {
    const item = randomItem(gameData[level]);
    currentAnswer = item.word;
    currentText = scrambleWord(item.word);
    scrambleBox.textContent = currentText;
    hintText.textContent = item.hint;
    answerInput.value = '';
    answerInput.focus();
    feedbackMessage.textContent = '';
    feedbackMessage.className = 'feedback';
    submitBtn.disabled = false;
    answerInput.disabled = false;
    startTimer(levelConfig[level].time);
}

function scrambleWord(word) {
    if (word.length <= 3) return word;
    const letters = word.split('');
    let scrambled = shuffleArray(letters).join('');

    while (scrambled.toLowerCase() === word.toLowerCase()) {
        scrambled = shuffleArray(letters).join('');
    }

    return scrambled;
}

function checkAnswer() {
    if (!currentLevel || lives <= 0) return;

    const answer = normalizeText(answerInput.value);
    const expected = normalizeText(currentAnswer);

    if (!answer) {
        feedbackMessage.textContent = 'Type your answer before submitting.';
        feedbackMessage.className = 'feedback error';
        return;
    }

    if (answer === expected) {
        clearInterval(timerInterval);
        solvedCount += 1;
        attemptLog.push({
            questionNumber: attemptLog.length + 1,
            questionText: currentText,
            userAnswer: answer,
            correctAnswer: expected,
            correct: true,
            responseSeconds: Number(remainingSeconds || 0),
            outcome: 'correct'
        });
        score += levelConfig[currentLevel].score;
        streak += 1;
        if (window.StudyAdventure) {
            window.StudyAdventure.recordSuccess({
                points: 2,
                message: 'Word restored correctly. Lexical quest progress increased.'
            });
        }
        if (streak > bestStreak) {
            bestStreak = streak;
            localStorage.setItem('scrambleBestStreak', String(bestStreak));
            // Submit new best streak to leaderboard
            try {
                const session = JSON.parse(localStorage.getItem('sp_session') || 'null');
                const playerName = session?.username || session?.email?.split('@')[0] || 'Anonymous';
                fetch('http://localhost:3000/api/leaderboard', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ game: 'scramble', name: playerName, score: bestStreak })
                }).catch(() => {});
            } catch (_e) {}
        }

        updateStatsUI();

        feedbackMessage.textContent = 'Correct! Loading next word...';
        feedbackMessage.className = 'feedback success';
        submitBtn.disabled = true;
        answerInput.disabled = true;
        setTimeout(() => {
            if (currentLevel) {
                loadScramble(currentLevel);
            }
        }, 900);
    } else {
        attemptLog.push({
            questionNumber: attemptLog.length + 1,
            questionText: currentText,
            userAnswer: answer,
            correctAnswer: expected,
            correct: false,
            responseSeconds: Number(remainingSeconds || 0),
            outcome: 'wrong'
        });
        loseLife(`Wrong guess. The word is still scrambled as "${currentText}".`);
    }
}

function nextScramble() {
    if (!currentLevel || lives <= 0) return;
    streak = 0;
    updateStatsUI();
    loadScramble(currentLevel);
}

function startTimer(seconds) {
    remainingSeconds = seconds;
    updateTimerDisplay();
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        remainingSeconds -= 1;
        updateTimerDisplay();
        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            onTimerExpired();
        }
    }, 1000);
}

function resetTimer() {
    clearInterval(timerInterval);
    remainingSeconds = 0;
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
    const seconds = String(remainingSeconds % 60).padStart(2, '0');
    timerDisplay.textContent = `${minutes}:${seconds}`;
}

function onTimerExpired() {
    attemptLog.push({
        questionNumber: attemptLog.length + 1,
        questionText: currentText,
        userAnswer: '',
        correctAnswer: normalizeText(currentAnswer),
        correct: false,
        responseSeconds: 0,
        outcome: 'timeout'
    });
    loseLife(`Time is up! The word was "${currentAnswer}".`);
}

function loseLife(reasonText) {
    if (lives <= 0) return;

    lives -= 1;
    streak = 0;
    if (window.StudyAdventure) {
        window.StudyAdventure.recordSetback({
            message: 'Scramble miss detected. Slow down and isolate root fragments.'
        });
    }
    updateStatsUI();

    if (lives <= 0) {
        clearInterval(timerInterval);
        feedbackMessage.textContent = `${reasonText} Game over. No lives left.`;
        feedbackMessage.className = 'feedback error';
        submitBtn.disabled = true;
        nextBtn.disabled = true;
        answerInput.disabled = true;
        answerInput.value = '';
        restartBtn.classList.remove('hidden');
        if (window.GameModes) GameModes.roundEnd(score);
        void submitPremiumScrambleReport();
        if (window.StudyAdventure) window.StudyAdventure.endSession(score);
        return;
    }

    feedbackMessage.textContent = `${reasonText} Lives left: ${lives}.`;
    feedbackMessage.className = 'feedback error';
    submitBtn.disabled = true;
    answerInput.disabled = true;
    setTimeout(() => {
        if (currentLevel && lives > 0) {
            loadScramble(currentLevel);
        }
    }, 900);
}

function restartGame() {
    if (!currentLevel) return;
    clearInterval(timerInterval);
    setDifficulty(currentLevel);
}

function updateStatsUI() {
    scoreDisplay.textContent = String(score);
    streakDisplay.textContent = String(streak);
    bestStreakDisplay.textContent = String(bestStreak);
    livesDisplay.textContent = '❤ '.repeat(lives).trim() || '0';
}

function normalizeText(text) {
    return text
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function randomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function shuffleArray(array) {
    const clone = [...array];
    for (let i = clone.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [clone[i], clone[j]] = [clone[j], clone[i]];
    }
    return clone;
}

function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

async function submitPremiumScrambleReport() {
    if (premiumReportSubmitted) {
        return;
    }

    if (!window.PremiumGameReporter || typeof window.PremiumGameReporter.submitReport !== 'function') {
        return;
    }

    const durationSec = Math.max(0, Math.round((Date.now() - Number(runStartedAt || Date.now())) / 1000));
    const attempts = Array.isArray(attemptLog) ? attemptLog.slice() : [];

    const payload = {
        gameType: 'word-scramble',
        score: Number(score || 0),
        totalQuestions: Number(attempts.length || 0),
        correctCount: Number(solvedCount || 0),
        durationSec,
        questionAttempts: attempts,
        meta: {
            source: 'scramble_game',
            difficulty: currentLevel || 'easy',
            maxLives: Number(maxLives || 0),
            livesRemaining: Number(lives || 0),
            bestStreak: Number(bestStreak || 0),
            finalStreak: Number(streak || 0),
            usedUploadedSource: !!useUploadedSource
        }
    };

    const result = await window.PremiumGameReporter.submitReport(payload);
    if (result && result.ok) {
        premiumReportSubmitted = true;
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

function normalizeWordListItem(word, hint) {
    const cleanWord = (word || '').toLowerCase().replace(/[^a-z]/g, '');
    if (cleanWord.length < 4) return null;
    return {
        word: cleanWord,
        hint
    };
}

function buildUploadedScrambleData() {
    const generatedQuiz = readJsonStorage(GENERATED_QUIZ_KEY, []);
    const uploadedFiles = readJsonStorage(UPLOADED_FILES_KEY, []);
    const entries = [];

    generatedQuiz.forEach((item) => {
        if (!item || !Array.isArray(item.options)) return;

        item.options.forEach((option) => {
            const candidate = normalizeWordListItem(option, item.question || 'From your uploaded slides');
            if (candidate) {
                entries.push(candidate);
            }
        });
    });

    uploadedFiles.forEach((file) => {
        const baseName = (file.originalName || '').replace(/\.[^.]+$/, '');
        const pieces = baseName.split(/[^a-zA-Z]+/).filter(Boolean);
        pieces.forEach((piece) => {
            const candidate = normalizeWordListItem(piece, `Term pulled from uploaded file ${file.originalName}`);
            if (candidate) {
                entries.push(candidate);
            }
        });
    });

    const unique = [];
    const seen = new Set();
    for (const entry of entries) {
        if (!seen.has(entry.word)) {
            seen.add(entry.word);
            unique.push(entry);
        }
    }

    const split = {
        easy: unique.filter((item) => item.word.length <= 6),
        medium: unique.filter((item) => item.word.length >= 7 && item.word.length <= 8),
        hard: unique.filter((item) => item.word.length >= 9)
    };

    if (split.easy.length < 3 || split.medium.length < 3 || split.hard.length < 2) {
        return null;
    }

    return split;
}

window.addEventListener('load', () => {
    if (useUploadedSource) {
        const uploadedData = buildUploadedScrambleData();
        if (uploadedData) {
            gameData = uploadedData;
            document.querySelector('.header-middle h2').textContent = 'Slide Word Unscramble';
            document.querySelector('.header-middle p').textContent = 'Unscramble words extracted from your uploaded slides.';
        }
    }

    updateStatsUI();
    setDifficulty('easy');
});

if (window.GameModes) {
    GameModes.init({
        gameLabel: 'Word Scramble',
        startFn: () => { if (currentLevel) restartGame(); },
        resetFn: () => {},
        getScore: () => score
    });
}
