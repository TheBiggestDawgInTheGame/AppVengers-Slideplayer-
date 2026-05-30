// Character Data
const characters = [
    {
        id: 1,
        name: "Sizwe Mokoena",
        classType: "Infiltrator",
        role: "Street Runner",
        difficulty: "Hard",
        cardGradient: "linear-gradient(160deg, #5d667f 0%, #1d233f 70%)",
        image: "images/kasi_gent.png",
        description: "Raised in Soweto, Sizwe grew up reading every corner, shortcut, and escape line before anyone else saw trouble coming. He carries kasi survival instinct, coded street smarts, and the kind of quiet confidence earned from making a plan when the lights go out.",
        abilities: [
            { title: "Taxi Reflexes", note: "Moves through tight pressure like Joburg traffic at rush hour." },
            { title: "Loadshedding Vision", note: "Stays sharp and effective in blackout and low-light zones." },
            { title: "Gate Bypass", note: "Opens locked systems fast using hustler logic and clean code." },
            { title: "Kasi Footwork", note: "Quick directional bursts shaped by street football and survival." }
        ],
        missions: [
            { id: 1, title: "Shattered Academy", difficulty: "Easy", description: "Move through a broken training complex and recover hidden intel." },
            { id: 2, title: "Neon District", difficulty: "Hard", description: "Slip past surveillance towers and shut down a hostile signal grid." },
            { id: 3, title: "Obsidian Peak", difficulty: "Medium", description: "Climb the ridge line and secure the relay before dawn." }
        ]
    },
    {
        id: 2,
        name: "Ayanda Naidoo",
        classType: "Vanguard",
        role: "Shield Captain",
        difficulty: "Medium",
        cardGradient: "linear-gradient(160deg, #6b7a7f 0%, #1f2d3b 70%)",
        image: "images/kasi_girl.png",
        description: "From Durban through Chatsworth and into city response units, Ayanda became known for standing firm when panic starts spreading. She leads with heart, discipline, and that unmistakable South African habit of making a plan together under pressure.",
        abilities: [
            { title: "Frontline Heart", note: "Holds formation and keeps the squad steady when the heat rises." },
            { title: "Gqom Pulse", note: "A shockwave hit that rattles everyone in close range." },
            { title: "Braai Stand", note: "Plants hard and absorbs pressure without giving ground." },
            { title: "Ubuntu Call", note: "Draws danger away from teammates and protects the whole team." }
        ],
        missions: [
            { id: 1, title: "Zen Garden", difficulty: "Medium", description: "Cross the silent pathways and secure the signal shrine." },
            { id: 2, title: "Core Terminal", difficulty: "Hard", description: "Break through the defense grid and stabilize the central node." },
            { id: 3, title: "Dreamscape", difficulty: "Easy", description: "Enter the hidden layer and bring back the final memory shard." }
        ]
    },
    {
        id: 3,
        name: "Jason Daniels",
        classType: "Striker",
        role: "Cape Flats Scout",
        difficulty: "Medium",
        cardGradient: "linear-gradient(160deg, #7d5d5d 0%, #2d1d23 70%)",
        image: "images/colored_gent.png",
        description: "Jason came up on the Cape Flats, where reading people fast is as important as reading the road. He brings sharp instincts, dry humour, and the kind of street discipline built from watching every entrance and every exit.",
        abilities: [
            { title: "Flats Awareness", note: "Spots movement early and adjusts before the pressure lands." },
            { title: "Fast Hands", note: "Quick weapon handling and faster reaction under stress." },
            { title: "Side-Step Story", note: "Slips danger with smooth footwork and calm timing." },
            { title: "Hard Lines", note: "Locks onto a route and commits without hesitation." }
        ],
        missions: [
            { id: 1, title: "Harbour Ghost", difficulty: "Easy", description: "Sweep the docks and recover a crate before it disappears inland." },
            { id: 2, title: "Signal Run", difficulty: "Medium", description: "Cross the district under pressure and deliver a live uplink." },
            { id: 3, title: "Night Watch", difficulty: "Hard", description: "Hold a rooftop route while the city grid starts collapsing." }
        ]
    },
    {
        id: 4,
        name: "Bianca Abrahams",
        classType: "Netweaver",
        role: "Route Reader",
        difficulty: "Easy",
        cardGradient: "linear-gradient(160deg, #856f8d 0%, #2b1f40 70%)",
        image: "images/coloured_girl.png",
        description: "Bianca grew up between Athlone and the Southern Suburbs, learning to balance pressure, people, and fast decisions. She reads patterns the way others read headlines and turns local hustle into clean tactical control.",
        abilities: [
            { title: "Minibus Map", note: "Tracks changing routes and reveals the safest line forward." },
            { title: "Quiet Signal", note: "Cuts through noise and keeps comms clear for the squad." },
            { title: "Sharp Memory", note: "Marks useful paths, threats, and weak points instantly." },
            { title: "Local Link", note: "Improves team coordination when the fight becomes messy." }
        ],
        missions: [
            { id: 1, title: "Library Vault", difficulty: "Easy", description: "Secure hidden archives buried below the old civic block." },
            { id: 2, title: "Glass District", difficulty: "Medium", description: "Navigate mirrored towers while tracing a stolen data trail." },
            { id: 3, title: "Sea Point Relay", difficulty: "Hard", description: "Activate the final node before the shoreline blackout spreads." }
        ]
    },
    {
        id: 5,
        name: "Pieter van Wyk",
        classType: "Vanguard",
        role: "Field Anchor",
        difficulty: "Medium",
        cardGradient: "linear-gradient(160deg, #6b7d8d 0%, #1f2a3c 70%)",
        image: "images/white_boy.png",
        description: "Raised in Pretoria East with weekends on dusty Free State roads, Pieter learned patience, pressure control, and how to stay steady when things turn rough. He is reliable in the old-school South African way: quiet, practical, and impossible to shake.",
        abilities: [
            { title: "Bakkie Build", note: "Takes heavy punishment and keeps moving forward." },
            { title: "Veld Focus", note: "Keeps aim steady across long sightlines and open spaces." },
            { title: "Steel Nerves", note: "Reduces panic effects when the situation turns chaotic." },
            { title: "Checkpoint Hold", note: "Turns any position into a hard point for the team." }
        ],
        missions: [
            { id: 1, title: "Dry River Post", difficulty: "Easy", description: "Reinforce the outpost and recover supply signals from the floodplain." },
            { id: 2, title: "Granite Gate", difficulty: "Hard", description: "Break through a fortified canyon entrance under heavy resistance." },
            { id: 3, title: "Highveld Line", difficulty: "Medium", description: "Escort the convoy through open terrain before sunset." }
        ]
    },
    {
        id: 6,
        name: "Mia Fourie",
        classType: "Specialist",
        role: "Skyline Analyst",
        difficulty: "Hard",
        cardGradient: "linear-gradient(160deg, #8d737a 0%, #312129 70%)",
        image: "images/white girl.png",
        description: "From Stellenbosch lecture halls to emergency tech deployments across the Western Cape, Mia built her name by staying calm, thinking fast, and solving hard problems while everyone else is still arguing about the plan.",
        abilities: [
            { title: "Cape Wind", note: "Shifts position fast and resets angles before enemies adapt." },
            { title: "Clean Read", note: "Processes tactical information quickly and marks the best option." },
            { title: "Circuit Sense", note: "Stabilizes damaged systems and restores utility access." },
            { title: "Cold Front", note: "Slows enemy tempo by disrupting their rhythm at key moments." }
        ],
        missions: [
            { id: 1, title: "Summit Array", difficulty: "Medium", description: "Repair the weather grid on the ridge before the storm front rolls in." },
            { id: 2, title: "Winelands Circuit", difficulty: "Easy", description: "Sweep the estates and bring the silent network back online." },
            { id: 3, title: "Table Edge", difficulty: "Hard", description: "Hold the final platform while data lifts off above the city." }
        ]
    },
    {
        id: 7,
        name: "Thandeka Zulu",
        classType: "Support",
        role: "Pulse Medic",
        difficulty: "Medium",
        cardGradient: "linear-gradient(160deg, #7a5f8d 0%, #241c39 70%)",
        image: "images/dark_girl.png",
        description: "Raised between Pietermaritzburg and Umlazi, Thandeka learned early that keeping people steady is its own kind of power. She mixes compassion, discipline, and hard township resilience, becoming the one everyone looks for when the mission starts turning rough.",
        abilities: [
            { title: "Clinic Hands", note: "Stabilizes teammates quickly under pressure and keeps the squad moving." },
            { title: "Taxi Rank Read", note: "Reads tension fast and positions the team before chaos breaks out." },
            { title: "Heartbeat Call", note: "Boosts nearby allies with a calm recovery pulse." },
            { title: "Zulu Resolve", note: "Stays composed through fear effects and helps others do the same." }
        ],
        missions: [
            { id: 1, title: "Red Crossing", difficulty: "Easy", description: "Escort civilians through a collapsing transit corridor." },
            { id: 2, title: "Storm Shelter", difficulty: "Medium", description: "Restore life-support systems before the blackout reaches the ward." },
            { id: 3, title: "Last Beacon", difficulty: "Hard", description: "Protect the medical uplink while enemies close in from every side." }
        ]
    }
];

let selectedCharacter = null;
let selectedMission = null;
let currentMissionWorlds = [];

const avatarOptions = [
    { id: 'operator-sizwe', icon: '🕶️', label: 'Shadow Runner' },
    { id: 'operator-ayanda', icon: '🛡️', label: 'Shield Captain' },
    { id: 'operator-jason', icon: '🎯', label: 'Recon Striker' },
    { id: 'operator-bianca', icon: '🧠', label: 'Signal Weaver' },
    { id: 'operator-thandeka', icon: '💚', label: 'Pulse Medic' },
    { id: 'operator-mia', icon: '⚡', label: 'Sky Analyst' }
];

let selectedAvatarId = localStorage.getItem('storyModeAvatarId') || avatarOptions[0].id;
let progressState = {
    missionsCompleted: Number(localStorage.getItem('storyModeMissionsCompleted') || 0),
    points: Number(localStorage.getItem('storyModePoints') || 0),
    coopEnabled: localStorage.getItem('storyModeCoopEnabled') === 'true'
};
let storyMissionReportSubmitted = false;

const SLIDE_QUIZ_KEY = 'slidePlayGeneratedQuizData';
const SLIDE_FILES_KEY = 'slidePlayUploadedFiles';
const SLIDE_DEMO_KEY = 'slidePlayDemoSession';
const DAILY_STREAK_KEY = 'storyModeDailyStreak';
const DAILY_STREAK_DAY_KEY = 'storyModeDailyStreakDay';
const BRANCH_KEY = 'storyModeBranchChoice';
const LANGUAGE_KEY = 'storyModeLanguage';
const ANALYTICS_KEY = 'storyModeAnalytics';
const SAVE_SLOT_PREFIX = 'storyModeSaveSlot';
const ACHIEVEMENTS_KEY = 'storyModeAchievements';

const ACHIEVEMENT_DEFS = [
    { id: 'first_mission',    icon: '🎯', label: 'First Mission',        desc: 'Complete your first world.',                         check: (p, a, s) => p.missionsCompleted >= 1 },
    { id: 'triple_worlds',   icon: '🌍', label: 'World Traveller',       desc: 'Complete 3 worlds.',                                 check: (p, a, s) => p.missionsCompleted >= 3 },
    { id: 'all_worlds',      icon: '🏆', label: 'Full Operator',         desc: 'Complete all 5 worlds.',                             check: (p, a, s) => p.missionsCompleted >= 5 },
    { id: 'points_500',      icon: '⭐', label: 'Rising Star',           desc: 'Reach 500 points.',                                  check: (p, a, s) => p.points >= 500 },
    { id: 'points_1500',     icon: '💎', label: 'Diamond Agent',         desc: 'Reach 1 500 points.',                                check: (p, a, s) => p.points >= 1500 },
    { id: 'streak_3',        icon: '🔥', label: 'On Fire',               desc: 'Maintain a 3-day challenge streak.',                  check: (p, a, s) => s >= 3 },
    { id: 'streak_7',        icon: '🌟', label: 'Unstoppable',           desc: 'Maintain a 7-day challenge streak.',                  check: (p, a, s) => s >= 7 },
    { id: 'challenge_done',  icon: '✅', label: 'Challenge Accepted',    desc: 'Complete 1 daily challenge.',                         check: (p, a, s) => a.challengeCompleted >= 1 },
    { id: 'challenge_5',     icon: '🏅', label: 'Challenge Regular',     desc: 'Complete 5 daily challenges.',                        check: (p, a, s) => a.challengeCompleted >= 5 },
    { id: 'quiz_ace',        icon: '📚', label: 'Quiz Ace',              desc: 'Answer 10 quiz questions correctly.',                 check: (p, a, s) => a.quizCorrect >= 10 },
    { id: 'coop_player',     icon: '🤝', label: 'Team Player',           desc: 'Complete a world with Co-op mode on.',               check: (p, a, s) => Boolean(localStorage.getItem('storyModeCoopComplete')) },
];

// ── Toast notification (replaces all alert() calls) ──────────────
function showToast(message, type) {
    const t = type || 'info';
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;';
        document.body.appendChild(container);
    }
    const colors = { success: '#00d1a0', error: '#ff2f7d', warn: '#ffd86b', info: '#00d9ff' };
    const textColors = { warn: '#1a1c2e' };
    const toast = document.createElement('div');
    toast.style.cssText = `background:${colors[t]||colors.info};color:${textColors[t]||'#061026'};padding:10px 22px;border-radius:10px;font-size:0.86rem;font-weight:700;letter-spacing:0.4px;box-shadow:0 6px 24px rgba(0,0,0,0.45);pointer-events:auto;opacity:0;transition:opacity 0.2s;max-width:480px;text-align:center;`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(function () { toast.style.opacity = '1'; });
    setTimeout(function () {
        toast.style.opacity = '0';
        setTimeout(function () { if (toast.parentNode) toast.remove(); }, 240);
    }, 3400);
}

let currentDailyChallenge = null;
let activeModal = null;
let lastFocusedElement = null;
let selectedLanguage = localStorage.getItem(LANGUAGE_KEY) || 'en';
let analyticsState = readJsonLocal(ANALYTICS_KEY, {
    challengeAccepted: 0,
    challengeCompleted: 0,
    quizCorrect: 0,
    quizWrong: 0,
    launches: 0,
    returns: 0
});

function readJsonLocal(key, fallback) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        return parsed ?? fallback;
    } catch (_error) {
        return fallback;
    }
}

function getDayKey() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}

function hashString(input) {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function getSlideDeckLabel(files, demoSession) {
    if (demoSession?.title) {
        return demoSession.title;
    }
    if (Array.isArray(files) && files.length > 0) {
        return files[0].originalName || 'your uploaded deck';
    }
    return 'your current slide deck';
}

function getSlideContextSummary() {
    const quizData = readJsonLocal(SLIDE_QUIZ_KEY, []);
    const uploadedFiles = readJsonLocal(SLIDE_FILES_KEY, []);
    const demoSession = readJsonLocal(SLIDE_DEMO_KEY, null);
    const deckLabel = getSlideDeckLabel(uploadedFiles, demoSession);
    const sampleQuestion = Array.isArray(quizData) && quizData.length > 0 ? String(quizData[0].question || '') : '';

    return {
        hasSlides: uploadedFiles.length > 0 || quizData.length > 0 || Boolean(demoSession?.title),
        deckLabel,
        quizCount: quizData.length,
        fileCount: uploadedFiles.length,
        sampleQuestion
    };
}

function ensureSlideContextAvailable() {
    const context = getSlideContextSummary();
    if (context.hasSlides) {
        return true;
    }
    // No slide data — activate demo mode so the flow still runs
    localStorage.setItem(SLIDE_DEMO_KEY, JSON.stringify({
        title: 'Demo Deck',
        topic: 'General Knowledge'
    }));
    showToast('Demo mode active — using sample slide deck to preview the game', 'warn');
    return true;
}

function saveAnalytics() {
    localStorage.setItem(ANALYTICS_KEY, JSON.stringify(analyticsState));
}

function updateDebugPanel() {
    const shouldShow = window.location.search.includes('debug=1') || localStorage.getItem('storyModeDebug') === '1';
    const panel = document.getElementById('debug-panel');
    const content = document.getElementById('debug-panel-content');
    if (!panel || !content) {
        return;
    }

    panel.style.display = shouldShow ? 'block' : 'none';
    if (!shouldShow) {
        return;
    }

    content.innerHTML = `
        Challenge Accept: ${analyticsState.challengeAccepted} | Complete: ${analyticsState.challengeCompleted}<br>
        Quiz Correct: ${analyticsState.quizCorrect} | Wrong: ${analyticsState.quizWrong}<br>
        Launches: ${analyticsState.launches} | Returns: ${analyticsState.returns}
    `;
}

function getCurrentBranchChoice() {
    return localStorage.getItem(BRANCH_KEY) || 'balanced';
}

function getTopicRecommendation() {
    const uploadedFiles = readJsonLocal(SLIDE_FILES_KEY, []);
    const quizData = readJsonLocal(SLIDE_QUIZ_KEY, []);
    const demoSession = readJsonLocal(SLIDE_DEMO_KEY, null);
    const combined = [
        demoSession?.title || '',
        ...uploadedFiles.map(f => f.originalName || ''),
        ...quizData.slice(0, 4).map(q => q.question || '')
    ].join(' ').toLowerCase();

    if (/history|revolution|war|empire/.test(combined)) {
        return { missionId: 4, reason: 'History topics align with Union Grounds.' };
    }
    if (/biology|cell|genetic|dna|science/.test(combined)) {
        return { missionId: 6, reason: 'Science topics align with Cradle Vault.' };
    }
    if (/data|model|database|erd|coding|system/.test(combined)) {
        return { missionId: 1, reason: 'Tech topics align with Table Mountain Summit.' };
    }
    return { missionId: 2, reason: 'General content aligns with Vilakazi Pulse.' };
}

function openModalWithFocus(id) {
    const modal = document.getElementById(id);
    if (!modal) {
        return;
    }
    lastFocusedElement = document.activeElement;
    modal.style.display = 'flex';
    activeModal = modal;
    const focusables = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusables.length > 0) {
        focusables[0].focus();
    } else {
        modal.focus();
    }
}

function closeModalWithFocus(id) {
    const modal = document.getElementById(id);
    if (!modal) {
        return;
    }
    modal.style.display = 'none';
    if (activeModal === modal) {
        activeModal = null;
    }
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
    }
}

function setupModalAccessibility() {
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && activeModal) {
            activeModal.style.display = 'none';
            activeModal = null;
        }

        if (e.key !== 'Tab' || !activeModal) {
            return;
        }

        const focusables = activeModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusables.length) {
            return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    });
}

function toggleHighContrast() {
    document.body.classList.toggle('high-contrast');
    localStorage.setItem('storyModeHighContrast', document.body.classList.contains('high-contrast') ? '1' : '0');
}

function toggleReducedMotion() {
    document.body.classList.toggle('reduced-motion');
    localStorage.setItem('storyModeReducedMotion', document.body.classList.contains('reduced-motion') ? '1' : '0');
}

function applyStoredAccessibilityPrefs() {
    if (localStorage.getItem('storyModeHighContrast') === '1') {
        document.body.classList.add('high-contrast');
    }
    if (localStorage.getItem('storyModeReducedMotion') === '1') {
        document.body.classList.add('reduced-motion');
    }
}

function renderSaveSlots() {
    const container = document.getElementById('save-slots');
    if (!container) {
        return;
    }

    container.innerHTML = '';
    for (let i = 1; i <= 3; i += 1) {
        const key = `${SAVE_SLOT_PREFIX}${i}`;
        const slot = readJsonLocal(key, null);
        const row = document.createElement('div');
        row.className = 'save-slot-row';
        const label = slot ? `Slot ${i}: ${slot.characterName} | ${slot.points} pts | ${slot.savedAt}` : `Slot ${i}: Empty`;
        row.innerHTML = `
            <span>${label}</span>
            <div class="save-slot-actions">
                <button type="button" onclick="saveSlot(${i})">Save</button>
                <button type="button" onclick="loadSlot(${i})">Load</button>
            </div>
        `;
        container.appendChild(row);
    }
}

function saveSlot(slotIndex) {
    const payload = {
        characterId: selectedCharacter?.id || 1,
        characterName: selectedCharacter?.name || 'Operator',
        avatarId: selectedAvatarId,
        points: progressState.points,
        missionsCompleted: progressState.missionsCompleted,
        coopEnabled: coopMode,
        branch: getCurrentBranchChoice(),
        language: selectedLanguage,
        savedAt: new Date().toLocaleString()
    };
    localStorage.setItem(`${SAVE_SLOT_PREFIX}${slotIndex}`, JSON.stringify(payload));
    renderSaveSlots();
}

function loadSlot(slotIndex) {
    const slot = readJsonLocal(`${SAVE_SLOT_PREFIX}${slotIndex}`, null);
    if (!slot) {
        showToast('That save slot is empty', 'warn');
        return;
    }

    const found = characters.find(c => c.id === Number(slot.characterId));
    if (found) {
        selectedCharacter = found;
    }
    selectedAvatarId = slot.avatarId || selectedAvatarId;
    progressState.points = Number(slot.points || progressState.points);
    progressState.missionsCompleted = Number(slot.missionsCompleted || progressState.missionsCompleted);
    progressState.coopEnabled = Boolean(slot.coopEnabled);
    coopMode = progressState.coopEnabled;
    selectedLanguage = slot.language || selectedLanguage;
    if (slot.branch) {
        localStorage.setItem(BRANCH_KEY, slot.branch);
    }

    localStorage.setItem(LANGUAGE_KEY, selectedLanguage);
    persistProgressState();
    renderSaveSlots();
    loadCharacters();
    renderFeaturedCharacter();
    renderAvatarPicker();
    updateCoopStatusUI();
    renderLeaderboard();
    renderDailyChallenge();
}

function applyLanguage() {
    const labels = {
        en: { start: 'START ADVENTURE', challenge: 'Challenge of the Day' },
        af: { start: 'BEGIN AVONTUUR', challenge: 'Uitdaging van die Dag' },
        zu: { start: 'QALA UHAMBO', challenge: 'Inselelo Yosuku' },
        xh: { start: 'QALA UHAMBO', challenge: 'Umngeni Wosuku' },
        st: { start: 'QALA LEETO', challenge: 'Phephetso Ya Letsatsi' }
    };
    const mapped = labels[selectedLanguage] || labels.en;
    const startBtn = document.querySelector('#mainMenuScreen .menu-button');
    const challengeTitle = document.querySelector('#daily-challenge h3');
    if (startBtn) startBtn.textContent = mapped.start;
    if (challengeTitle) challengeTitle.textContent = mapped.challenge;
}

function openBranchingPrompt() {
    showBranchingChoices([
        { text: 'Direct Route (Speed)', value: 'aggressive' },
        { text: 'Research Route (Learning)', value: 'balanced' },
        { text: 'Support Route (Co-op)', value: 'support' }
    ]);
}

function applyReturnFromLauncher() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('from') !== 'webgl_launcher') {
        return;
    }

    analyticsState.returns += 1;
    saveAnalytics();

    const status = params.get('resultStatus') || 'complete';
    const score = Number(params.get('resultScore') || 0);
    const time = Number(params.get('resultTime') || 0);
    const collectibles = Number(params.get('resultCollectibles') || 0);

    if (status === 'win') {
        const earned = Math.max(0, Math.floor(score / 5)) + (collectibles * 20);
        progressState.points += earned;
        progressState.missionsCompleted = Math.min(progressState.missionsCompleted + 1, 5);
        persistProgressState();
        completeDailyChallengeIfEligible();
        checkAndGrantAchievements();
        renderMenuHUD();
        showToast(`Mission complete — +${earned} pts earned`, 'success');
    } else {
        showToast(`Mission ${status} — Score: ${score} | Time: ${time}s`, 'warn');
    }

    void submitPremiumStoryModeReport({
        status,
        score,
        time,
        collectibles,
        missionTitle: params.get('missionTitle') || selectedMission?.title || 'Story Mission'
    });

    if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

async function submitPremiumStoryModeReport(result) {
    if (storyMissionReportSubmitted) {
        return;
    }

    if (!window.PremiumGameReporter || typeof window.PremiumGameReporter.submitReport !== 'function') {
        return;
    }

    const payload = {
        gameType: 'story-mode',
        score: Number(result.score || 0),
        totalQuestions: 1,
        correctCount: String(result.status || '').toLowerCase() === 'win' ? 1 : 0,
        durationSec: Math.max(0, Number(result.time || 0)),
        questionAttempts: [
            {
                questionNumber: 1,
                questionText: String(result.missionTitle || 'Story Mission'),
                userAnswer: String(result.status || 'complete'),
                correctAnswer: 'win',
                correct: String(result.status || '').toLowerCase() === 'win',
                responseSeconds: Math.max(0, Number(result.time || 0)),
                outcome: String(result.status || 'complete')
            }
        ],
        meta: {
            source: 'story_mode',
            collectibles: Number(result.collectibles || 0),
            pointsSnapshot: Number(progressState.points || 0),
            missionsCompleted: Number(progressState.missionsCompleted || 0),
            coopEnabled: !!progressState.coopEnabled,
            language: selectedLanguage,
            branch: getCurrentBranchChoice()
        }
    };

    const response = await window.PremiumGameReporter.submitReport(payload);
    if (response && response.ok) {
        storyMissionReportSubmitted = true;
    }
}

function toDateFromDayKey(dayKey) {
    return new Date(`${dayKey}T00:00:00`);
}

function getEffectiveDailyStreak(dayKey) {
    const savedStreak = Number(localStorage.getItem(DAILY_STREAK_KEY) || 0);
    const savedDay = localStorage.getItem(DAILY_STREAK_DAY_KEY);
    if (!savedDay) {
        return 0;
    }

    const currentDate = toDateFromDayKey(dayKey);
    const lastDate = toDateFromDayKey(savedDay);
    const diffDays = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays <= 1) {
        return savedStreak;
    }

    return 0;
}

function getChallengeDifficultyMeta(quizCount, streak) {
    if (quizCount >= 20 || streak >= 7) {
        return { label: 'Legendary', rewardMultiplier: 1.6 };
    }
    if (quizCount >= 10 || streak >= 4) {
        return { label: 'Hard', rewardMultiplier: 1.35 };
    }
    if (quizCount >= 5 || streak >= 2) {
        return { label: 'Medium', rewardMultiplier: 1.15 };
    }
    return { label: 'Easy', rewardMultiplier: 1.0 };
}

function calculateReward(baseReward, multiplier) {
    return Math.round((baseReward * multiplier) / 10) * 10;
}

function updateDailyStreakOnCompletion(dayKey) {
    const savedStreak = Number(localStorage.getItem(DAILY_STREAK_KEY) || 0);
    const savedDay = localStorage.getItem(DAILY_STREAK_DAY_KEY);

    if (savedDay === dayKey) {
        return savedStreak;
    }

    let nextStreak = 1;
    if (savedDay) {
        const currentDate = toDateFromDayKey(dayKey);
        const lastDate = toDateFromDayKey(savedDay);
        const diffDays = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
            nextStreak = savedStreak + 1;
        }
    }

    localStorage.setItem(DAILY_STREAK_KEY, String(nextStreak));
    localStorage.setItem(DAILY_STREAK_DAY_KEY, dayKey);
    return nextStreak;
}

function buildDailyChallenge() {
    const quizData = readJsonLocal(SLIDE_QUIZ_KEY, []);
    const uploadedFiles = readJsonLocal(SLIDE_FILES_KEY, []);
    const demoSession = readJsonLocal(SLIDE_DEMO_KEY, null);
    const dayKey = getDayKey();
    const currentStreak = getEffectiveDailyStreak(dayKey);
    const difficultyMeta = getChallengeDifficultyMeta(Array.isArray(quizData) ? quizData.length : 0, currentStreak);
    const seed = hashString(dayKey + JSON.stringify(uploadedFiles).slice(0, 120) + difficultyMeta.label + String(currentStreak));
    const deckLabel = getSlideDeckLabel(uploadedFiles, demoSession);

    if (Array.isArray(quizData) && quizData.length > 0) {
        const q = quizData[seed % quizData.length];
        const reward = calculateReward(220, difficultyMeta.rewardMultiplier);
        return {
            id: `slide-quiz-${dayKey}`,
            type: 'quiz',
            question: q.question,
            options: Array.isArray(q.options) ? q.options : [],
            correct: Number.isInteger(q.correct) ? q.correct : 0,
            reward,
            difficulty: difficultyMeta.label,
            streak: currentStreak,
            description: `Slide Challenge [${difficultyMeta.label}]: In ${deckLabel}, complete one world and answer this checkpoint: "${q.question}"`
        };
    }

    const reward = calculateReward(140, difficultyMeta.rewardMultiplier);

    return {
        id: `slide-theme-${dayKey}`,
        type: 'theme',
        reward,
        difficulty: difficultyMeta.label,
        streak: currentStreak,
        description: `Slide Challenge [${difficultyMeta.label}]: Use the theme from ${deckLabel}, complete one world, and finish with co-op ${progressState.coopEnabled ? 'enabled' : 'disabled'}.`
    };
}

function getChallengeState() {
    if (!currentDailyChallenge) {
        return { accepted: false, completed: false };
    }
    const accepted = localStorage.getItem(`storyModeDailyAccepted:${currentDailyChallenge.id}`) === 'true';
    const completed = localStorage.getItem(`storyModeDailyCompleted:${currentDailyChallenge.id}`) === 'true';
    return { accepted, completed };
}

function renderDailyChallenge() {
    currentDailyChallenge = buildDailyChallenge();
    const desc = document.getElementById('challenge-desc');
    const button = document.querySelector('#daily-challenge button');
    const state = getChallengeState();

    if (desc) {
        const streakLabel = `Streak: ${currentDailyChallenge.streak || 0} day(s)`;
        const badge = state.completed ? '✅ Completed' : `Reward: +${currentDailyChallenge.reward} pts`;
        desc.textContent = `${currentDailyChallenge.description} (${badge} | ${streakLabel})`;
    }

    const difficultyBadge = document.getElementById('challenge-difficulty-badge');
    if (difficultyBadge) {
        const level = String(currentDailyChallenge.difficulty || 'Easy').toLowerCase();
        difficultyBadge.className = `challenge-difficulty-badge ${level}`;
        difficultyBadge.textContent = currentDailyChallenge.difficulty || 'Easy';
    }

    if (button) {
        if (state.completed) {
            button.textContent = 'Completed';
            button.disabled = true;
        } else if (state.accepted) {
            button.textContent = 'Accepted';
            button.disabled = true;
        } else {
            button.textContent = 'Accept';
            button.disabled = false;
        }
    }
}

function acceptChallenge() {
    if (!currentDailyChallenge) {
        currentDailyChallenge = buildDailyChallenge();
    }
    localStorage.setItem(`storyModeDailyAccepted:${currentDailyChallenge.id}`, 'true');
    analyticsState.challengeAccepted += 1;
    saveAnalytics();
    updateDebugPanel();
    renderDailyChallenge();
    showToast('Daily challenge accepted — complete one world to claim your reward', 'info');
}

function completeDailyChallengeIfEligible() {
    if (!currentDailyChallenge) {
        return;
    }

    const state = getChallengeState();
    if (!state.accepted || state.completed) {
        return;
    }

    if (currentDailyChallenge.type === 'quiz' && Array.isArray(currentDailyChallenge.options) && currentDailyChallenge.options.length > 0) {
        openChallengeQuiz();
        return;
    }

    awardDailyChallenge();
}

function awardDailyChallenge() {
    if (!currentDailyChallenge) {
        return;
    }

    const dayKey = getDayKey();
    const streak = updateDailyStreakOnCompletion(dayKey);
    localStorage.setItem(`storyModeDailyCompleted:${currentDailyChallenge.id}`, 'true');
    analyticsState.challengeCompleted += 1;
    saveAnalytics();
    progressState.points += currentDailyChallenge.reward;
    persistProgressState();
    openRewardBreakdown(streak);
    renderDailyChallenge();
    renderLeaderboard();
    updateDebugPanel();
    showToast(`Challenge complete! +${currentDailyChallenge.reward} pts — Streak: ${streak} day(s)`, 'success');
}

function openRewardBreakdown(streak) {
    const breakdown = document.getElementById('reward-breakdown-content');
    if (!breakdown || !currentDailyChallenge) {
        return;
    }

    const base = currentDailyChallenge.type === 'quiz' ? 220 : 140;
    const scaled = currentDailyChallenge.reward - base;
    breakdown.innerHTML = `
        <p>Base Reward: ${base} pts</p>
        <p>Difficulty Bonus: ${scaled > 0 ? '+' : ''}${scaled} pts</p>
        <p>Challenge Type: ${currentDailyChallenge.type}</p>
        <p>Difficulty: ${currentDailyChallenge.difficulty}</p>
        <p>Current Streak: ${streak} day(s)</p>
    `;
    openModalWithFocus('reward-breakdown-modal');
}

function openChallengeQuiz() {
    const modal = document.getElementById('challenge-quiz-modal');
    const questionEl = document.getElementById('challenge-quiz-question');
    const optionsEl = document.getElementById('challenge-quiz-options');
    const feedbackEl = document.getElementById('challenge-quiz-feedback');

    if (!modal || !questionEl || !optionsEl || !feedbackEl || !currentDailyChallenge) {
        return;
    }

    questionEl.textContent = currentDailyChallenge.question || 'Answer the slide checkpoint question.';
    feedbackEl.textContent = 'Select the best answer to complete your daily challenge bonus.';
    optionsEl.innerHTML = '';

    currentDailyChallenge.options.forEach((option, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'challenge-quiz-option';
        btn.textContent = option;
        btn.addEventListener('click', () => submitChallengeQuizAnswer(idx));
        optionsEl.appendChild(btn);
    });

    openModalWithFocus('challenge-quiz-modal');
}

function submitChallengeQuizAnswer(answerIndex) {
    const feedbackEl = document.getElementById('challenge-quiz-feedback');
    if (!currentDailyChallenge || !feedbackEl) {
        return;
    }

    if (answerIndex === currentDailyChallenge.correct) {
        analyticsState.quizCorrect += 1;
        saveAnalytics();
        feedbackEl.textContent = 'Correct. Daily challenge reward unlocked.';
        setTimeout(() => {
            closeChallengeQuiz();
            awardDailyChallenge();
        }, 350);
    } else {
        analyticsState.quizWrong += 1;
        saveAnalytics();
        updateDebugPanel();
        feedbackEl.textContent = 'Not quite. Try again to unlock the bonus reward.';
    }
}

function closeChallengeQuiz() {
    closeModalWithFocus('challenge-quiz-modal');
}

// Screen Navigation
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function goToCharacterSelection() {
    if (!selectedCharacter) {
        selectedCharacter = characters[0];
    }
    loadCharacters();
    renderFeaturedCharacter();
    showScreen('characterScreen');
}

function backToMenu() {
    showScreen('mainMenuScreen');
}

function backToCharacterSelection() {
    loadCharacters();
    renderFeaturedCharacter();
    showScreen('characterScreen');
}

// Load Characters
function loadCharacters() {
    const grid = document.getElementById('characterGrid');
    grid.innerHTML = '';
    
    characters.forEach(character => {
        const card = document.createElement('div');
        card.className = 'character-card';
        if (selectedCharacter && selectedCharacter.id === character.id) {
            card.classList.add('active');
        }
        const initials = character.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        card.innerHTML = `
            <div class="character-card-media" style="background:${character.cardGradient};">
                <img src="${character.image}" alt="${character.name} portrait" class="character-portrait" loading="lazy"
                    onerror="this.style.display='none';var fb=this.parentNode.querySelector('.char-img-fallback');if(fb)fb.style.display='flex';">
                <div class="char-img-fallback" style="display:none;">
                    <span>${initials}</span>
                    <small>${character.classType}</small>
                </div>
            </div>
            <div class="character-card-info">
                <div class="character-name">${character.name}</div>
                <div class="character-role">${character.role}</div>
            </div>
            <button class="select-button" onclick="selectCharacter(${character.id})">
                Select Operator
            </button>
        `;
        grid.appendChild(card);
    });
}

function renderFeaturedCharacter() {
    if (!selectedCharacter) {
        return;
    }

    const featuredMedia = document.getElementById('featuredMedia');
    const featuredClass = document.getElementById('featuredClass');
    const featuredDifficulty = document.getElementById('featuredDifficulty');
    const featuredName = document.getElementById('featuredName');
    const featuredDescription = document.getElementById('featuredDescription');
    const abilityGrid = document.getElementById('abilityGrid');

    featuredMedia.style.background = selectedCharacter.cardGradient;
    const featInitials = selectedCharacter.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    featuredMedia.innerHTML = `
        <img src="${selectedCharacter.image}" alt="${selectedCharacter.name} portrait" class="featured-portrait"
            onerror="this.style.display='none';var fb=this.parentNode.querySelector('.char-img-fallback');if(fb)fb.style.display='flex';">
        <div class="char-img-fallback" style="display:none;">
            <span>${featInitials}</span>
            <small>${selectedCharacter.classType}</small>
        </div>`;
    featuredClass.textContent = `Class: ${selectedCharacter.classType}`;
    featuredDifficulty.textContent = `Difficulty: ${selectedCharacter.difficulty}`;
    featuredName.textContent = selectedCharacter.name;
    featuredDescription.textContent = selectedCharacter.description;

    const avatarBadge = document.getElementById('selectedAvatarBadge');
    const selectedAvatar = avatarOptions.find(a => a.id === selectedAvatarId) || avatarOptions[0];
    if (avatarBadge) {
        avatarBadge.textContent = `Avatar: ${selectedAvatar.icon} ${selectedAvatar.label}`;
    }

    abilityGrid.innerHTML = '';
    selectedCharacter.abilities.forEach(ability => {
        const abilityCard = document.createElement('div');
        abilityCard.className = 'ability-card';
        abilityCard.innerHTML = `
            <div class="ability-title">${ability.title}</div>
            <div class="ability-note">${ability.note}</div>
        `;
        abilityGrid.appendChild(abilityCard);
    });
}

// Select Character for the featured panel
function selectCharacter(characterId) {
    selectedCharacter = characters.find(c => c.id === characterId);
    loadCharacters();
    renderFeaturedCharacter();
}

function proceedToMissionSelection() {
    if (!selectedCharacter) {
        selectedCharacter = characters[0];
    }
    loadMissions();
    showScreen('missionScreen');
}

function getMissionWorlds() {
    const base = selectedCharacter.missions;
    return [
        {
            id: 1,
            sector: "Western Cape",
            landmark: "Table Mountain",
            title: "Table Mountain Summit",
            difficulty: base[0]?.difficulty || "Easy",
            description: base[0]?.description || "Take the upper route, pass the mist line, and recover the summit beacon before sunrise.",
            ambience: "Cable lines, cliff paths, and cold Atlantic wind.",
            image: "https://picsum.photos/seed/table-mountain-cape-town/1200/800",
            themeClass: "theme-1",
            buttonClass: "enter-pink",
            unlocked: true
        },
        {
            id: 2,
            sector: "Gauteng",
            landmark: "Vilakazi Street",
            title: "Vilakazi Pulse",
            difficulty: base[1]?.difficulty || "Medium",
            description: base[1]?.description || "Move through a living street of memory and resistance while carrying a live intel package.",
            ambience: "Historic homes, bright murals, and dense township energy.",
            image: "https://picsum.photos/seed/vilakazi-street-soweto/1200/800",
            themeClass: "theme-2",
            buttonClass: "enter-teal",
            unlocked: true
        },
        {
            id: 3,
            sector: "KwaZulu-Natal",
            landmark: "Moses Mabhida Stadium",
            title: "Sky Arc Stadium",
            difficulty: base[2]?.difficulty || "Hard",
            description: base[2]?.description || "Scale the arch, dodge drone sweeps, and trigger the skyline relay over Durban.",
            ambience: "Floodlights, sea air, and a high exposed skyline route.",
            image: "https://picsum.photos/seed/moses-mabhida-durban/1200/800",
            themeClass: "theme-3",
            buttonClass: "enter-violet",
            unlocked: true
        },
        {
            id: 4,
            sector: "Tshwane",
            landmark: "Union Buildings",
            title: "Union Grounds",
            difficulty: "Medium",
            description: "Cross the terraced gardens and secure the archives beneath the seat of power.",
            ambience: "Stone steps, jacaranda light, and ceremonial courtyards.",
            image: "https://picsum.photos/seed/union-buildings-pretoria/1200/800",
            themeClass: "theme-4",
            buttonClass: "enter-muted",
            unlocked: true
        },
        {
            id: 5,
            sector: "Mpumalanga",
            landmark: "Blyde River Canyon",
            title: "Canyon Echo",
            difficulty: "Hard",
            description: "Descend through the canyon edge and restore the relay hidden in the rock face.",
            ambience: "Red cliffs, deep drop-offs, and echoing wind channels.",
            image: "https://picsum.photos/seed/blyde-river-canyon/1200/800",
            themeClass: "theme-5",
            buttonClass: "enter-muted",
            unlocked: true
        },
        {
            id: 6,
            sector: "Gauteng/North West",
            landmark: "Cradle of Humankind",
            title: "Cradle Vault",
            difficulty: "Locked",
            description: "Complete every landmark route to unlock the buried origin vault.",
            ambience: "Cave chambers, fossil halls, and the oldest silence in the country.",
            themeClass: "theme-locked",
            buttonClass: "enter-muted",
            unlocked: false
        }
    ];
}

// Load Missions
function loadMissions() {
    const slideContext = getSlideContextSummary();
    document.getElementById('selectedCharacterInfo').textContent = `Operator: ${selectedCharacter.name} | Deck: ${slideContext.deckLabel} | Questions: ${slideContext.quizCount}`;
    updateCoopStatusUI();

    const totalWorlds = 5;
    const completed = Math.min(progressState.missionsCompleted, totalWorlds);
    const unlockedPercent = Math.round((completed / totalWorlds) * 100);
    document.getElementById('missionProgressValue').textContent = `${unlockedPercent}%`;
    document.getElementById('missionProgressFill').style.width = `${unlockedPercent}%`;

    currentMissionWorlds = getMissionWorlds();
    const recommendation = getTopicRecommendation();
    const branchChoice = getCurrentBranchChoice();
    
    const grid = document.getElementById('missionGrid');
    grid.innerHTML = '';

    currentMissionWorlds.forEach((mission, idx) => {
        const card = document.createElement('div');
        card.className = `mission-card ${mission.themeClass}`;
        if (mission.image) {
            card.classList.add('has-image');
            card.style.setProperty('--mission-image', `url("${mission.image}")`);
        }

        const buttonText = mission.unlocked ? 'Enter World' : 'Locked';
        const disabled = mission.unlocked ? '' : 'disabled';
        const recommended = mission.id === recommendation.missionId;
        const branchTag = branchChoice === 'aggressive' ? 'Fast Path' : (branchChoice === 'support' ? 'Co-op Path' : 'Study Path');

        // Completion badge
        let badgeHtml = '';
        if (!mission.unlocked) {
            badgeHtml = '<span class="badge-progress locked">🔒 Locked</span>';
        } else if (mission.id <= completed) {
            badgeHtml = '<span class="badge-progress complete">✓ Done</span>';
        } else if (mission.id === completed + 1) {
            badgeHtml = '<span class="badge-progress inprogress">▶ Next</span>';
        }

        card.innerHTML = `
            ${badgeHtml}
            <div class="mission-sector">${mission.sector}</div>
            <div class="mission-landmark">${mission.landmark}</div>
            <div class="mission-title">${mission.title}${recommended ? ' ⭐' : ''}</div>
            <div class="mission-difficulty">${mission.difficulty}</div>
            <div class="mission-description">${mission.description}</div>
            <div class="mission-ambience">${mission.ambience} ${recommended ? 'Recommended from your slide topic.' : ''} ${branchTag}</div>
            <button class="info-btn" aria-label="World Facts" onclick="showWorldFacts(${idx})" style="margin-top:8px;">ℹ️</button>
            <button class="mission-enter ${mission.buttonClass}" ${disabled} onclick="startMissionWorld(${mission.id})">
                ${buttonText}
            </button>
        `;

        grid.appendChild(card);
    });
}

// World Facts popup logic
function showWorldFacts(idx) {
    const world = currentMissionWorlds[idx];
    if (!world) {
        return;
    }
    const facts = [
        `Sector: <b>${world.sector}</b>`,
        `Landmark: <b>${world.landmark}</b>`,
        `Ambience: <i>${world.ambience}</i>`
    ];
    document.getElementById('world-facts-content').innerHTML = facts.join('<br>');
    document.getElementById('world-facts-modal').style.display = 'flex';
}

// Branching Storyline UI (placeholder)
function showBranchingChoices(choices) {
    const modal = document.getElementById('branch-modal');
    const options = document.getElementById('branch-options');
    const question = document.getElementById('branch-question');
    if (!modal || !options || !question) {
        return;
    }

    question.textContent = 'Choose your route. This affects recommendations and launch state.';
    options.innerHTML = '';
    (choices || []).forEach(choice => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'info-btn';
        btn.textContent = choice.text;
        btn.addEventListener('click', function () {
            localStorage.setItem(BRANCH_KEY, choice.value || 'balanced');
            closeModalWithFocus('branch-modal');
            loadMissions();
        });
        options.appendChild(btn);
    });
    openModalWithFocus('branch-modal');
}

// Co-op toggle (placeholder)
let coopMode = false;
function toggleCoopMode() {
    coopMode = !coopMode;
    progressState.coopEnabled = coopMode;
    localStorage.setItem('storyModeCoopEnabled', String(coopMode));
    updateCoopStatusUI();
    renderDailyChallenge();
    showToast('Co-op mode: ' + (coopMode ? 'ON' : 'OFF'), coopMode ? 'success' : 'info');
}

function updateCoopStatusUI() {
    const status = document.getElementById('coopStatusInfo');
    const button = document.getElementById('coop-btn');
    if (status) {
        status.textContent = `Co-op Story Mode: ${coopMode ? 'On' : 'Off'}`;
    }
    if (button) {
        button.style.filter = coopMode ? 'none' : 'grayscale(0.15)';
    }
}

function persistProgressState() {
    localStorage.setItem('storyModeMissionsCompleted', String(progressState.missionsCompleted));
    localStorage.setItem('storyModePoints', String(progressState.points));
}

// Save/Resume placeholder
function saveProgress() {
    localStorage.setItem('storyModeCharacterId', String(selectedCharacter?.id || 1));
    localStorage.setItem('storyModeAvatarId', selectedAvatarId);
    persistProgressState();
    renderSaveSlots();
    showToast('Progress saved!', 'success');
}

function resumeProgress() {
    const savedCharacterId = Number(localStorage.getItem('storyModeCharacterId'));
    const savedAvatarId = localStorage.getItem('storyModeAvatarId');

    if (savedCharacterId) {
        const found = characters.find(c => c.id === savedCharacterId);
        if (found) {
            selectedCharacter = found;
        }
    }

    if (savedAvatarId) {
        selectedAvatarId = savedAvatarId;
    }

    progressState = {
        missionsCompleted: Number(localStorage.getItem('storyModeMissionsCompleted') || 0),
        points: Number(localStorage.getItem('storyModePoints') || 0),
        coopEnabled: localStorage.getItem('storyModeCoopEnabled') === 'true'
    };
    coopMode = progressState.coopEnabled;

    loadCharacters();
    renderFeaturedCharacter();
    renderAvatarPicker();
    renderLeaderboard();
    updateCoopStatusUI();
    renderDailyChallenge();
    renderSaveSlots();
    showToast('Last saved setup restored', 'success');
}

// Language change placeholder
document.getElementById('language-select')?.addEventListener('change', function (e) {
    selectedLanguage = e.target.value;
    localStorage.setItem(LANGUAGE_KEY, selectedLanguage);
    applyLanguage();
});

// Functional avatar customization
function renderAvatarPicker() {
    const picker = document.getElementById('avatar-picker');
    const preview = document.getElementById('avatar-preview');
    if (!picker) {
        return;
    }

    picker.innerHTML = '';
    avatarOptions.forEach(option => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'avatar-option' + (option.id === selectedAvatarId ? ' active' : '');
        btn.setAttribute('aria-label', `Select ${option.label}`);
        btn.innerHTML = `<span class="avatar-icon">${option.icon}</span><span>${option.label}</span>`;
        btn.addEventListener('click', () => pickAvatar(option.id));
        picker.appendChild(btn);
    });

    const selected = avatarOptions.find(a => a.id === selectedAvatarId) || avatarOptions[0];
    if (preview) {
        preview.textContent = `${selected.icon} ${selected.label}`;
    }
}

function pickAvatar(avatarId) {
    selectedAvatarId = avatarId;
    localStorage.setItem('storyModeAvatarId', selectedAvatarId);
    renderAvatarPicker();
    renderFeaturedCharacter();
}

// In-game help placeholder
function showHelpTopic(topic) {
    alert('Help topic: ' + topic + ' (feature coming soon)');
}

function renderLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    if (!list) {
        return;
    }

    const friends = [
        { name: 'You', score: progressState.points },
        { name: 'Lerato', score: 520 },
        { name: 'Neo', score: 460 },
        { name: 'Aisha', score: 410 }
    ].sort((a, b) => b.score - a.score);

    list.innerHTML = friends
        .map((f, i) => `<li>#${i + 1} ${f.name} - ${f.score} pts</li>`)
        .join('');
}

function startMissionWorld(worldId) {
    const world = currentMissionWorlds.find(m => m.id === worldId);
    if (!world || !world.unlocked) {
        return;
    }
    if (!ensureSlideContextAvailable()) {
        return;
    }
    startGame(world.id, world.title);
}

function buildWebGlLaunchUrl(missionTitle) {
    const target = 'webgl_game_launcher/index.html';
    const slideContext = getSlideContextSummary();
    const quizData = readJsonLocal(SLIDE_QUIZ_KEY, []);
    const preStartQuestion = Array.isArray(quizData) && quizData.length > 0 ? quizData[0] : null;
    const preStartOptions = Array.isArray(preStartQuestion?.options) ? preStartQuestion.options : [];
    const preStartCorrect = Number.isInteger(preStartQuestion?.correct) ? preStartQuestion.correct : -1;
    const params = new URLSearchParams({
        characterId: String(selectedCharacter?.id || 1),
        characterName: selectedCharacter?.name || 'Operator',
        avatarId: selectedAvatarId,
        missionId: String(selectedMission?.id || 0),
        missionTitle: missionTitle || selectedMission?.title || 'Story Mission',
        source: 'story_mode',
        challengeType: currentDailyChallenge?.type || 'theme',
        challengeDifficulty: currentDailyChallenge?.difficulty || 'Easy',
        challengeReward: String(currentDailyChallenge?.reward || 0),
        pointsSnapshot: String(progressState.points),
        coop: coopMode ? '1' : '0',
        branch: getCurrentBranchChoice(),
        language: selectedLanguage,
        slideDeckLabel: slideContext.deckLabel,
        slideQuizCount: String(slideContext.quizCount),
        slideFileCount: String(slideContext.fileCount),
        slideSampleQuestion: slideContext.sampleQuestion,
        preStartQuestion: preStartQuestion?.question || '',
        preStartOptions: JSON.stringify(preStartOptions),
        preStartCorrect: String(preStartCorrect),
        returnUrl: '../index.html'
    });
    return `${target}?${params.toString()}`;
}

function checkAndGrantAchievements() {
    const earned = readJsonLocal(ACHIEVEMENTS_KEY, {});
    const streak = getEffectiveDailyStreak(getDayKey());
    let changed = false;
    ACHIEVEMENT_DEFS.forEach(def => {
        if (!earned[def.id] && def.check(progressState, analyticsState, streak)) {
            earned[def.id] = new Date().toLocaleDateString();
            changed = true;
            showToast(`Achievement unlocked: ${def.icon} ${def.label}`, 'success');
        }
    });
    if (changed) {
        localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(earned));
    }
}

function renderAchievements() {
    const list = document.getElementById('achievements-list');
    if (!list) {
        return;
    }
    const earned = readJsonLocal(ACHIEVEMENTS_KEY, {});
    const streak = getEffectiveDailyStreak(getDayKey());
    list.innerHTML = '';
    ACHIEVEMENT_DEFS.forEach(def => {
        const isEarned = Boolean(earned[def.id]);
        const li = document.createElement('li');
        li.className = `achievement-item${isEarned ? ' earned' : ' locked'}`;
        li.innerHTML = `
            <span class="ach-icon">${def.icon}</span>
            <div class="ach-body">
                <strong>${def.label}</strong>
                <span>${def.desc}</span>
            </div>
            ${isEarned ? `<span class="ach-date">${earned[def.id]}</span>` : '<span class="ach-lock">🔒</span>'}`;
        list.appendChild(li);
    });
}
function renderMenuHUD() {
    const hudPoints = document.getElementById('hudPoints');
    const hudMissions = document.getElementById('hudMissions');
    const hudStreak = document.getElementById('hudStreak');
    const continueBtn = document.getElementById('continueBtn');
    if (!hudPoints) {
        return;
    }
    const streak = getEffectiveDailyStreak(getDayKey());
    hudPoints.textContent = progressState.points.toLocaleString();
    hudMissions.textContent = `${progressState.missionsCompleted}/5`;
    hudStreak.innerHTML = streak > 0 ? `🔥 ${streak}` : '&mdash;';
    if (continueBtn) {
        continueBtn.style.display = progressState.missionsCompleted > 0 ? 'block' : 'none';
    }
}

function continueSavedGame() {
    if (!selectedCharacter) {
        selectedCharacter = characters[0];
    }
    loadCharacters();
    renderFeaturedCharacter();
    loadMissions();
    showScreen('missionScreen');
}

// Start Game
function startGame(missionId, missionTitle) {
    selectedMission = currentMissionWorlds.find(m => m.id === missionId) || { id: missionId, title: missionTitle };

    // Populate rich loading screen
    const operatorRow = document.getElementById('loadingOperatorRow');
    const info = document.getElementById('loadingInfo');
    const heading = document.getElementById('loadingHeading');
    const note = document.getElementById('loadingNote');
    const charInitials = selectedCharacter.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const diffColor = { Easy: '#baff6b', Medium: '#ffd86b', Hard: '#ff2f7d', Legendary: '#c084fc' }[selectedMission.difficulty] || '#00d9ff';

    if (operatorRow) {
        operatorRow.innerHTML = `
            <div class="loading-avatar" style="background:${selectedCharacter.cardGradient}">${charInitials}</div>
            <div class="loading-operator-meta">
                <span class="loading-operator-name">${selectedCharacter.name}</span>
                <span class="loading-operator-role">${selectedCharacter.role} • ${selectedCharacter.classType}</span>
            </div>`;
    }
    if (heading) heading.textContent = missionTitle.toUpperCase();
    if (info) {
        info.innerHTML = `
            <span class="loading-world-badge" style="color:${diffColor};border-color:${diffColor}22">${selectedMission.difficulty || 'Standard'}</span>
            <span class="loading-world-label">${selectedMission.landmark || 'South African Landmark World'}</span>
            ${selectedMission.description ? `<p class="loading-world-desc">${selectedMission.description}</p>` : ''}`;
    }
    const hint = selectedCharacter.abilities[Math.floor(Math.random() * selectedCharacter.abilities.length)];
    if (note) note.innerHTML = `<em>“${hint.title}”</em> — ${hint.note}`;

    showScreen('gameLoadingScreen');
    
    // Launch imported WebGL story game after the loading animation.
    setTimeout(() => {
        analyticsState.launches += 1;
        saveAnalytics();
        progressState.missionsCompleted += 1;
        progressState.points += coopMode ? 180 : 120;
        completeDailyChallengeIfEligible();
        persistProgressState();
        renderLeaderboard();
        updateDebugPanel();
        window.location.href = buildWebGlLaunchUrl(missionTitle);
    }, 3200);
}

// Initialize
coopMode = progressState.coopEnabled;
selectedCharacter = characters[0];
applyStoredAccessibilityPrefs();
applyReturnFromLauncher();
loadCharacters();
renderFeaturedCharacter();
renderAvatarPicker();
renderLeaderboard();
updateCoopStatusUI();
renderDailyChallenge();
renderSaveSlots();
renderMenuHUD();
checkAndGrantAchievements();
applyLanguage();
setupModalAccessibility();
updateDebugPanel();

window.toggleHighContrast = toggleHighContrast;
window.toggleReducedMotion = toggleReducedMotion;
window.renderSaveSlots = renderSaveSlots;
window.saveSlot = saveSlot;
window.loadSlot = loadSlot;
window.openBranchingPrompt = openBranchingPrompt;
window.openModalWithFocus = openModalWithFocus;
window.closeModalWithFocus = closeModalWithFocus;
window.renderAchievements = renderAchievements;
window.progressState = progressState;
window.selectedCharacter = selectedCharacter;
window.getEffectiveDailyStreak = getEffectiveDailyStreak;
window.getDayKey = getDayKey;
window.closeModalWithFocus = closeModalWithFocus;
