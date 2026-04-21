let currentQuestionIndex = 0;
let score = 0;
let selectedOptionIndex = null;
let questionLocked = false;
let timeLeft = 0;
let timerInterval = null;
let usedFiftyFifty = false;
let usedCallFriend = false;
let usedAskAudience = false;
let lastOutcome = 'lose';
let isResolvingLock = false;
let soundEnabled = true;
let audioContext = null;
const GENERATED_QUIZ_KEY = 'slidePlayGeneratedQuizData';
const PERFORMANCE_HISTORY_KEY = 'slidePlayQuizPerformanceHistory';
const HISTORY_WINDOW = 10;
let activeQuizData = Array.isArray(window.quizData) ? [...window.quizData] : [];
let performanceLog = [];
let coachIssuedSlowHint = false;
let coachIssuedUrgentHint = false;

const TIME_PER_QUESTION = 30;
const prizeTemplate = [
    100,
    200,
    300,
    500,
    1000,
    2000,
    4000,
    8000,
    16000,
    32000,
    64000,
    125000,
    250000,
    500000,
    1000000
];
let prizeValues = [];

function init() {
    currentQuestionIndex = 0;
    score = 0;
    selectedOptionIndex = null;
    questionLocked = false;
    usedFiftyFifty = false;
    usedCallFriend = false;
    usedAskAudience = false;
    lastOutcome = 'lose';
    isResolvingLock = false;
    performanceLog = [];

    prizeValues = buildPrizeValues(activeQuizData.length);

    updateTotalQuestions();
    updateHeaderStats();
    renderPrizeLadder();
    clearHint();
    updateLifelineButtons();
}

function buildPrizeValues(totalQuestions) {
    if (totalQuestions <= 1) {
        return [1000000];
    }

    const values = [];
    for (let i = 0; i < totalQuestions - 1; i++) {
        const fallback = prizeTemplate[Math.min(i, prizeTemplate.length - 2)];
        values.push(fallback);
    }
    values.push(1000000);
    return values;
}

function updateTotalQuestions() {
    document.getElementById('totalQuestions').textContent = activeQuizData.length;
    document.getElementById('totalQuestionsNum').textContent = activeQuizData.length;
    document.getElementById('finalTotal').textContent = activeQuizData.length;
}

function updateHeaderStats() {
    document.getElementById('score').textContent = score;
}

function startQuiz() {
    init();
    if (window.StudyAdventure) {
        window.StudyAdventure.startSession('quiz_game', 'Quiz Hot Seat');
        window.StudyAdventure.pushHint('Lock answers with confidence and keep a steady tempo.');
    }
    playCue('start');
    playCue('murmur');
    showScreen('quizScreen');
    setHint('AI Coach active: stay calm, decide with intent, and keep momentum.' );
    loadQuestion();
}

function startTimer() {
    timeLeft = TIME_PER_QUESTION;
    updateTimerDisplay();

    stopTimer();
    timerInterval = setInterval(() => {
        timeLeft -= 1;
        updateTimerDisplay();
        maybeCoachLive();

        if (timeLeft <= 0) {
            stopTimer();
            onTimeExpired();
        }
    }, 1000);
}

function updateTimerDisplay() {
    document.getElementById('timeLeft').textContent = Math.max(0, timeLeft);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function loadQuestion() {
    const question = activeQuizData[currentQuestionIndex];

    selectedOptionIndex = null;
    questionLocked = false;
    coachIssuedSlowHint = false;
    coachIssuedUrgentHint = false;

    document.getElementById('questionText').textContent = question.question;
    document.getElementById('currentQuestion').textContent = currentQuestionIndex + 1;

    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`btn${i}`);
        btn.classList.remove('selected', 'correct', 'incorrect', 'eliminated', 'locking');
        btn.disabled = false;
        document.getElementById(`option${i}`).textContent = question.options[i];
    }

    document.getElementById('lockBtn').disabled = true;
    document.getElementById('nextBtn').disabled = true;
    clearHint();
    updateLadderUI();
    startTimer();
}

function maybeCoachLive() {
    if (questionLocked || isResolvingLock) return;

    if (!coachIssuedSlowHint && timeLeft <= 18 && timeLeft > 10) {
        if (selectedOptionIndex === null) {
            setHint('AI Coach: You have time. Eliminate two weak options and lock with confidence.');
        } else {
            setHint('AI Coach: Nice commitment. Quick check the wording, then lock it.');
        }
        coachIssuedSlowHint = true;
        return;
    }

    if (!coachIssuedUrgentHint && timeLeft <= 9 && timeLeft > 2) {
        if (selectedOptionIndex === null) {
            setHint('AI Coach: You are running low on time. Pick your best option now and trust your preparation.');
        } else {
            setHint('AI Coach: Time pressure is real. Lock now and back yourself.');
        }
        coachIssuedUrgentHint = true;
    }
}

function inferTopic(questionText) {
    const text = String(questionText || '').toLowerCase();

    if (/(capital|country|ocean|continent|city|planet|mars|earth|france)/.test(text)) {
        return 'Geography';
    }
    if (/(year|century|history|when did|war|titanic)/.test(text)) {
        return 'History';
    }
    if (/(science|physics|biology|chemistry|algorithm|network|computer|data|ai|technology)/.test(text)) {
        return 'Science & Tech';
    }
    if (/(word|term|definition|completes this statement|vocabulary|meaning)/.test(text)) {
        return 'Vocabulary';
    }
    return 'General Reasoning';
}

function recordPerformance(question, selectedIndex, isCorrect, outcome) {
    const responseSeconds = Math.max(0, TIME_PER_QUESTION - Math.max(0, timeLeft));
    performanceLog.push({
        topic: inferTopic(question.question),
        question: question.question,
        selectedIndex,
        correctIndex: question.correct,
        isCorrect,
        responseSeconds,
        outcome
    });
}

function selectOption(index) {
    if (questionLocked || isResolvingLock) return;

    playCue('select');

    selectedOptionIndex = index;

    document.querySelectorAll('.option').forEach((button, buttonIndex) => {
        button.classList.toggle('selected', buttonIndex === index);
    });

    document.getElementById('lockBtn').disabled = false;

    if (timeLeft > 10) {
        setHint('AI Coach: Good pick. If it still feels right, lock it and keep tempo.');
    }
}

function lockAnswer() {
    if (questionLocked || selectedOptionIndex === null || isResolvingLock) return;

    questionLocked = true;
    isResolvingLock = true;
    stopTimer();

    const question = activeQuizData[currentQuestionIndex];
    const optionButtons = document.querySelectorAll('.option');
    const selectedButton = optionButtons[selectedOptionIndex];
    const stagePanel = document.querySelector('.stage-panel');
    const gameLayout = document.querySelector('.game-layout');

    optionButtons.forEach(button => {
        button.disabled = true;
    });

    document.querySelectorAll('.lifeline-btn').forEach(button => {
        button.disabled = true;
    });

    selectedButton.classList.add('locking');
    stagePanel.classList.add('suspense');
    if (gameLayout) {
        gameLayout.classList.add('dimmed');
    }
    setHint('Final answer... locking in');
    playCue('lock');

    setTimeout(() => {
        selectedButton.classList.remove('locking');
        stagePanel.classList.remove('suspense');
        if (gameLayout) {
            gameLayout.classList.remove('dimmed');
        }

        const isCorrect = selectedOptionIndex === question.correct;
        recordPerformance(question, selectedOptionIndex, isCorrect, 'locked');
        optionButtons[question.correct].classList.add('correct');

        if (isCorrect) {
            score += 1;
            updateHeaderStats();
            lastOutcome = 'progress';
            setHint('AI Coach: Correct. Great composure, keep that rhythm.');
            if (window.StudyAdventure) {
                window.StudyAdventure.recordSuccess({
                    points: 2,
                    message: 'Correct answer locked. Quest momentum increased.'
                });
            }
            playCue('correct');
            playCue('murmur');
        } else {
            optionButtons[selectedOptionIndex].classList.add('incorrect');
            lastOutcome = 'lose';
            setHint('AI Coach: Tough miss. Breathe, reset, and attack the next challenge with intent.');
            if (window.StudyAdventure) {
                window.StudyAdventure.recordSetback({
                    message: 'Incorrect lock. Re-read keywords before committing.'
                });
            }
            playCue('wrong');
        }

        updateLadderUI();
        document.getElementById('lockBtn').disabled = true;
        isResolvingLock = false;

        if (isCorrect) {
            if (currentQuestionIndex === activeQuizData.length - 1) {
                lastOutcome = 'win';
                setTimeout(showResults, 900);
            } else {
                document.getElementById('nextBtn').disabled = false;
            }
        } else {
            setTimeout(showResults, 1100);
        }
    }, 950);
}

function nextQuestion() {
    if (!questionLocked || isResolvingLock || currentQuestionIndex >= activeQuizData.length - 1) return;

    currentQuestionIndex += 1;
    updateLifelineButtons();
    loadQuestion();
}

function onTimeExpired() {
    if (questionLocked) return;

    questionLocked = true;
    const question = activeQuizData[currentQuestionIndex];
    recordPerformance(question, null, false, 'timeout');
    const optionButtons = document.querySelectorAll('.option');

    optionButtons.forEach(button => {
        button.disabled = true;
    });

    optionButtons[question.correct].classList.add('correct');
    document.getElementById('lockBtn').disabled = true;
    lastOutcome = 'lose';
    setHint('AI Coach: Time ran out. Stay sharp, answer earlier next round, and bounce back stronger.');
    if (window.StudyAdventure) {
        window.StudyAdventure.recordSetback({
            message: 'Time expired. Quest tip: decide sooner and trust elimination.'
        });
    }
    playCue('wrong');
    setTimeout(showResults, 1100);
}

function renderPrizeLadder() {
    const ladder = document.getElementById('prizeLadder');
    ladder.innerHTML = '';

    for (let i = prizeValues.length - 1; i >= 0; i--) {
        const li = document.createElement('li');
        li.className = 'prize-item';
        li.id = `prize-${i}`;
        li.innerHTML = `<span>Q${i + 1}</span><strong>$${formatMoney(prizeValues[i])}</strong>`;
        ladder.appendChild(li);
    }
}

function updateLadderUI() {
    for (let i = 0; i < prizeValues.length; i++) {
        const row = document.getElementById(`prize-${i}`);
        if (!row) continue;
        row.classList.remove('active', 'won');

        if (i < score) {
            row.classList.add('won');
        }
        if (i === currentQuestionIndex) {
            row.classList.add('active');
        }
    }
}

function useFiftyFifty() {
    if (usedFiftyFifty || questionLocked || isResolvingLock) return;

    playCue('select');

    const question = activeQuizData[currentQuestionIndex];
    const wrongIndexes = [0, 1, 2, 3].filter(i => i !== question.correct);
    shuffleArray(wrongIndexes);

    const remove = wrongIndexes.slice(0, 2);
    remove.forEach(index => {
        const btn = document.getElementById(`btn${index}`);
        btn.classList.add('eliminated');
        btn.disabled = true;
        if (selectedOptionIndex === index) {
            selectedOptionIndex = null;
            document.getElementById('lockBtn').disabled = true;
        }
    });

    usedFiftyFifty = true;
    markLifelineUsed('lifeline5050');
    updateLifelineButtons();
}

function useCallFriend() {
    if (usedCallFriend || questionLocked || isResolvingLock) return;

    playCue('select');

    const question = activeQuizData[currentQuestionIndex];
    const correctLetter = String.fromCharCode(65 + question.correct);
    const confidence = Math.random();

    let suggestedIndex = question.correct;
    if (confidence < 0.22) {
        const wrongOptions = [0, 1, 2, 3].filter(i => i !== question.correct);
        suggestedIndex = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
    }

    const suggestedLetter = String.fromCharCode(65 + suggestedIndex);
    const tone = suggestedIndex === question.correct ? 'pretty sure' : 'not fully sure';

    setHint(`Call a Friend: "I am ${tone} it is ${suggestedLetter}, but trust your gut."`);

    usedCallFriend = true;
    markLifelineUsed('lifelineCallFriend');
    updateLifelineButtons();
}

function useAskAudience() {
    if (usedAskAudience || questionLocked || isResolvingLock) return;

    playCue('select');

    const question = activeQuizData[currentQuestionIndex];
    const letters = ['A', 'B', 'C', 'D'];
    const percentages = [0, 0, 0, 0];

    const correctShare = 52 + Math.floor(Math.random() * 23); // 52-74%
    percentages[question.correct] = correctShare;

    let remainder = 100 - correctShare;
    const wrongIndexes = [0, 1, 2, 3].filter(i => i !== question.correct);

    for (let i = 0; i < wrongIndexes.length; i++) {
        if (i === wrongIndexes.length - 1) {
            percentages[wrongIndexes[i]] = remainder;
        } else {
            const slice = Math.floor(Math.random() * (remainder + 1));
            percentages[wrongIndexes[i]] = slice;
            remainder -= slice;
        }
    }

    const display = letters
        .map((letter, i) => `${letter}: ${percentages[i]}%`)
        .join(' | ');

    setHint(`Ask the Audience: ${display}`);

    usedAskAudience = true;
    markLifelineUsed('lifelineAskAudience');
    updateLifelineButtons();
}

function setHint(text) {
    document.getElementById('hintLine').textContent = text;
}

function clearHint() {
    document.getElementById('hintLine').textContent = '';
}

function updateLifelineButtons() {
    const lockState = questionLocked || isResolvingLock;
    document.getElementById('lifeline5050').disabled = usedFiftyFifty || lockState;
    document.getElementById('lifelineCallFriend').disabled = usedCallFriend || lockState;
    document.getElementById('lifelineAskAudience').disabled = usedAskAudience || lockState;

    document.getElementById('lifeline5050').classList.toggle('used', usedFiftyFifty);
    document.getElementById('lifelineCallFriend').classList.toggle('used', usedCallFriend);
    document.getElementById('lifelineAskAudience').classList.toggle('used', usedAskAudience);
}

function markLifelineUsed(buttonId) {
    const button = document.getElementById(buttonId);
    if (!button) return;

    button.classList.remove('consume');
    void button.offsetWidth;
    button.classList.add('consume');
}

function showResults() {
    stopTimer();

    const percentage = Math.round((score / activeQuizData.length) * 100);
    const wonAmount = score > 0 ? prizeValues[score - 1] : 0;

    document.getElementById('finalScore').textContent = score;
    document.getElementById('percentageScore').textContent = `$${formatMoney(wonAmount)}`;

    let message = '';
    if (lastOutcome === 'win') {
        message = 'AI Coach: Outstanding win. Celebrate it, stay humble, and keep pushing your ceiling.';
    } else if (score === 0) {
        message = 'AI Coach: No win this time, but effort compounds. Regroup, learn the pattern, and go again.';
    } else {
        message = `AI Coach: Strong fight. You leave with $${formatMoney(wonAmount)}. Stay grounded and keep building.`;
    }

    message += ` Accuracy: ${percentage}%.`;
    document.getElementById('resultMessage').textContent = message;

    const profile = buildPerformanceProfile(performanceLog);
    renderPerformanceProfile(profile);

    if (window.StudyAdventure) {
        if (score >= Math.max(1, Math.ceil(activeQuizData.length * 0.7))) {
            window.StudyAdventure.recordSuccess({
                points: 4,
                message: 'Round complete with strong accuracy. Topic unlock progress accelerated.'
            });
        } else {
            window.StudyAdventure.pushHint('Review weak topics, then replay for cleaner quest progress.');
        }
    }

    const roundRecord = buildRoundRecord(profile);
    const history = persistRoundHistory(roundRecord);
    const trend = buildLongTermTrend(history);
    renderLongTermTrend(trend);

    showScreen('resultsScreen');
}

function safeReadJsonStorage(key, fallback) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        return parsed ?? fallback;
    } catch (_error) {
        return fallback;
    }
}

function buildRoundRecord(profile) {
    const totalQuestions = activeQuizData.length;
    const accuracy = totalQuestions > 0 ? score / totalQuestions : 0;

    const topicStats = {};
    for (const item of performanceLog) {
        if (!topicStats[item.topic]) {
            topicStats[item.topic] = { attempts: 0, correct: 0 };
        }
        topicStats[item.topic].attempts += 1;
        topicStats[item.topic].correct += item.isCorrect ? 1 : 0;
    }

    return {
        timestamp: Date.now(),
        score,
        totalQuestions,
        accuracy,
        avgResponseSeconds: profile.avgResponseSeconds,
        topicStats
    };
}

function persistRoundHistory(roundRecord) {
    const history = safeReadJsonStorage(PERFORMANCE_HISTORY_KEY, []);
    history.push(roundRecord);
    const trimmed = history.slice(-30);
    localStorage.setItem(PERFORMANCE_HISTORY_KEY, JSON.stringify(trimmed));
    return trimmed;
}

function buildLongTermTrend(history) {
    const windowRounds = history.slice(-HISTORY_WINDOW);
    if (windowRounds.length === 0) {
        return {
            rounds: 0,
            summary: 'No history yet. Finish more rounds for trend analysis.',
            bullets: ['Trend data will appear after multiple rounds.']
        };
    }

    const avgAccuracy = windowRounds.reduce((acc, r) => acc + (r.accuracy || 0), 0) / windowRounds.length;
    const avgResponse = windowRounds.reduce((acc, r) => acc + (r.avgResponseSeconds || 0), 0) / windowRounds.length;

    const firstHalf = windowRounds.slice(0, Math.max(1, Math.floor(windowRounds.length / 2)));
    const secondHalf = windowRounds.slice(Math.max(1, Math.floor(windowRounds.length / 2)));
    const firstAcc = firstHalf.reduce((acc, r) => acc + (r.accuracy || 0), 0) / firstHalf.length;
    const secondAcc = secondHalf.reduce((acc, r) => acc + (r.accuracy || 0), 0) / secondHalf.length;
    const delta = secondAcc - firstAcc;

    const trendLabel = delta > 0.06
        ? 'Improving'
        : delta < -0.06
            ? 'Declining'
            : 'Stable';

    const topicAgg = {};
    for (const round of windowRounds) {
        const stats = round.topicStats || {};
        Object.keys(stats).forEach((topic) => {
            if (!topicAgg[topic]) {
                topicAgg[topic] = { attempts: 0, correct: 0 };
            }
            topicAgg[topic].attempts += stats[topic].attempts || 0;
            topicAgg[topic].correct += stats[topic].correct || 0;
        });
    }

    const topicRows = Object.entries(topicAgg)
        .map(([topic, s]) => ({
            topic,
            attempts: s.attempts,
            accuracy: s.attempts > 0 ? s.correct / s.attempts : 0
        }))
        .filter((row) => row.attempts > 0)
        .sort((a, b) => b.accuracy - a.accuracy);

    const bullets = [];
    if (topicRows.length > 0) {
        const top = topicRows[0];
        bullets.push(`Most consistent topic: ${top.topic} (${Math.round(top.accuracy * 100)}% across ${top.attempts} attempts).`);
    }
    if (topicRows.length > 1) {
        const low = topicRows[topicRows.length - 1];
        bullets.push(`Most fragile topic: ${low.topic} (${Math.round(low.accuracy * 100)}% accuracy).`);
    }

    if (avgResponse > 14) {
        bullets.push(`Pace trend: average decision time is ${avgResponse.toFixed(1)}s. Practice faster elimination.`);
    } else {
        bullets.push(`Pace trend: strong tempo at ${avgResponse.toFixed(1)}s average response time.`);
    }

    return {
        rounds: windowRounds.length,
        summary: `Trend is ${trendLabel}. Average long-term accuracy is ${Math.round(avgAccuracy * 100)}%.`,
        bullets
    };
}

function renderLongTermTrend(trend) {
    document.getElementById('trendWindow').textContent = trend.rounds;
    document.getElementById('trendSummary').textContent = trend.summary;

    const list = document.getElementById('trendList');
    list.innerHTML = '';
    trend.bullets.forEach((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        list.appendChild(li);
    });
}

function buildPerformanceProfile(log) {
    if (!Array.isArray(log) || log.length === 0) {
        return {
            summary: 'Not enough data yet. Complete at least one locked answer for full analysis.',
            strengths: ['No performance data recorded yet.'],
            weaknesses: ['No weak areas detected yet.'],
            recommendations: ['Answer and lock more questions to generate targeted coaching.']
        };
    }

    const topicStats = {};
    let quickCorrect = 0;
    let slowMistakes = 0;
    let totalTime = 0;

    for (const item of log) {
        if (!topicStats[item.topic]) {
            topicStats[item.topic] = { attempts: 0, correct: 0 };
        }
        topicStats[item.topic].attempts += 1;
        topicStats[item.topic].correct += item.isCorrect ? 1 : 0;

        totalTime += item.responseSeconds;
        if (item.isCorrect && item.responseSeconds <= 8) quickCorrect += 1;
        if (!item.isCorrect && item.responseSeconds >= 18) slowMistakes += 1;
    }

    const topics = Object.entries(topicStats).map(([topic, stats]) => {
        const accuracy = stats.attempts > 0 ? stats.correct / stats.attempts : 0;
        return { topic, ...stats, accuracy };
    });

    topics.sort((a, b) => b.accuracy - a.accuracy);
    const strengths = topics
        .filter((t) => t.accuracy >= 0.67)
        .slice(0, 2)
        .map((t) => `${t.topic}: ${Math.round(t.accuracy * 100)}% accuracy across ${t.attempts} question(s).`);

    const weaknesses = topics
        .filter((t) => t.accuracy <= 0.5)
        .slice(0, 2)
        .map((t) => `${t.topic}: ${Math.round(t.accuracy * 100)}% accuracy. Focus revision here first.`);

    const avgTime = totalTime / log.length;
    const recommendations = [];

    if (avgTime > 14) {
        recommendations.push(`Your average decision time is ${avgTime.toFixed(1)}s. Try 10-second practice drills.`);
    } else {
        recommendations.push(`Great tempo: average decision time is ${avgTime.toFixed(1)}s.`);
    }

    if (quickCorrect >= 2) {
        recommendations.push('You perform well under speed pressure. Keep trust in first instincts.');
    }
    if (slowMistakes >= 2) {
        recommendations.push('Long deliberation still led to misses; prioritize elimination strategies sooner.');
    }

    if (weaknesses.length === 0) {
        recommendations.push('No clear weak topic detected this round. Increase difficulty or question count.');
    }

    return {
        summary: `AI review: ${score}/${activeQuizData.length} correct with an average response time of ${avgTime.toFixed(1)}s.`,
        strengths: strengths.length > 0 ? strengths : ['Balanced profile this round; no dominant strong topic yet.'],
        weaknesses: weaknesses.length > 0 ? weaknesses : ['No major weakness surfaced in this run.'],
        recommendations: recommendations.slice(0, 3),
        avgResponseSeconds: avgTime
    };
}

function renderPerformanceProfile(profile) {
    document.getElementById('aiSummary').textContent = profile.summary;

    const renderList = (id, values) => {
        const el = document.getElementById(id);
        el.innerHTML = '';
        values.forEach((text) => {
            const li = document.createElement('li');
            li.textContent = text;
            el.appendChild(li);
        });
    };

    renderList('strengthList', profile.strengths);
    renderList('weaknessList', profile.weaknesses);
    renderList('recommendationList', profile.recommendations);
}

function restartQuiz() {
    stopTimer();
    showScreen('startScreen');
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    document.getElementById(screenId).classList.remove('hidden');
}

function formatMoney(value) {
    return Number(value).toLocaleString('en-US');
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    const toggle = document.getElementById('soundToggle');
    toggle.textContent = soundEnabled ? 'Sound: On' : 'Sound: Off';
}

function getAudioContext() {
    if (!audioContext) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        audioContext = new Ctx();
    }

    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    return audioContext;
}

function playTone(config) {
    if (!soundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = config.type || 'sine';
    oscillator.frequency.setValueAtTime(config.freq, now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(config.volume || 0.035, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (config.duration || 0.2));

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(now);
    oscillator.stop(now + (config.duration || 0.2));
}

function playCue(type) {
    if (!soundEnabled) return;

    if (type === 'start') {
        playTone({ freq: 330, duration: 0.16, type: 'triangle', volume: 0.03 });
        setTimeout(() => playTone({ freq: 440, duration: 0.2, type: 'triangle', volume: 0.032 }), 120);
        return;
    }

    if (type === 'select') {
        playTone({ freq: 280, duration: 0.1, type: 'square', volume: 0.02 });
        return;
    }

    if (type === 'lock') {
        playTone({ freq: 210, duration: 0.15, type: 'sawtooth', volume: 0.02 });
        setTimeout(() => playTone({ freq: 240, duration: 0.15, type: 'sawtooth', volume: 0.02 }), 180);
        setTimeout(() => playTone({ freq: 270, duration: 0.18, type: 'sawtooth', volume: 0.022 }), 360);
        return;
    }

    if (type === 'correct') {
        playTone({ freq: 392, duration: 0.16, type: 'triangle', volume: 0.03 });
        setTimeout(() => playTone({ freq: 523, duration: 0.22, type: 'triangle', volume: 0.035 }), 150);
        return;
    }

    if (type === 'wrong') {
        playTone({ freq: 220, duration: 0.25, type: 'sawtooth', volume: 0.03 });
        setTimeout(() => playTone({ freq: 174, duration: 0.28, type: 'sawtooth', volume: 0.03 }), 150);
        return;
    }

    if (type === 'murmur') {
        playTone({ freq: 140, duration: 0.3, type: 'triangle', volume: 0.012 });
        setTimeout(() => playTone({ freq: 155, duration: 0.32, type: 'triangle', volume: 0.01 }), 110);
    }
}

window.addEventListener('load', () => {
    const url = new URL(window.location.href);
    const useUploaded = url.searchParams.get('source') === 'upload';

    if (useUploaded) {
        try {
            const parsed = JSON.parse(localStorage.getItem(GENERATED_QUIZ_KEY) || '[]');
            if (Array.isArray(parsed) && parsed.length > 0) {
                activeQuizData = parsed;
                document.getElementById('quizTitle').textContent = 'Slides Challenge Night';
            }
        } catch (_error) {
            // Keep default quiz data if localStorage payload is invalid.
        }
    }

    if (!Array.isArray(activeQuizData) || activeQuizData.length === 0) {
        activeQuizData = Array.isArray(window.quizData) ? [...window.quizData] : [];
    }

    updateTotalQuestions();
    const soundToggle = document.getElementById('soundToggle');
    if (soundToggle) {
        soundToggle.addEventListener('click', toggleSound);
    }
});
