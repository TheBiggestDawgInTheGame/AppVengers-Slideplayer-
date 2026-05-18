(function () {
  const STORAGE_KEY = 'slidePlayAdventureState';

  const defaultState = {
    totalSuccesses: 0,
    totalSetbacks: 0,
    totalPoints: 0,
    sessionsPlayed: 0,
    lastGame: '',
    lastWeakness: 'time management',
  };

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || typeof parsed !== 'object') return { ...defaultState };
      return {
        ...defaultState,
        ...parsed,
      };
    } catch (_error) {
      return { ...defaultState };
    }
  }

  function writeState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  const host = document.createElement('section');
  host.className = 'adventure-layer';
  host.setAttribute('aria-live', 'polite');
  host.innerHTML = [
    '<div class="adventure-card professor">',
    '  <div class="avatar">Professor NPC</div>',
    '  <div class="adventure-body">',
    '    <div class="name">Professor Byte</div>',
    '    <p class="line" id="advProfessorLine">Welcome back. I coach your progress and weaknesses.</p>',
    '  </div>',
    '</div>'
  ].join('');

  const style = document.createElement('style');
  style.textContent = [
    '.adventure-layer {',
    '  position: fixed;',
    '  right: 14px;',
    '  bottom: 14px;',
    '  width: min(360px, calc(100vw - 24px));',
    '  z-index: 9999;',
    '  display: grid;',
    '  gap: 10px;',
    '  pointer-events: none;',
    '  transform: translateY(24px);',
    '  opacity: 0;',
    '  transition: transform 0.38s cubic-bezier(0.22,1,0.36,1), opacity 0.32s ease;',
    '}',
    '.adventure-layer.adv-visible {',
    '  transform: translateY(0);',
    '  opacity: 1;',
    '}',
    '.adventure-layer.adv-hiding {',
    '  transform: translateY(18px);',
    '  opacity: 0;',
    '  transition: transform 0.4s ease-in, opacity 0.35s ease-in;',
    '}',
    '.adventure-layer.adv-visible.adv-hiding {',
    '  transform: translateY(18px);',
    '  opacity: 0;',
    '}',
    '.adventure-card {',
    '  display: grid;',
    '  grid-template-columns: 88px 1fr;',
    '  gap: 10px;',
    '  align-items: center;',
    '  border-radius: 14px;',
    '  border: 1px solid rgba(20, 232, 208, 0.4);',
    '  background: rgba(12, 16, 32, 0.9);',
    '  color: #e9efff;',
    '  padding: 10px;',
    '  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);',
    '  backdrop-filter: blur(6px);',
    '}',
    '.adventure-card .avatar {',
    '  font-size: 11px;',
    '  font-weight: 800;',
    '  text-transform: uppercase;',
    '  letter-spacing: 0.08em;',
    '  color: #b9caef;',
    '  background: rgba(255,255,255,0.06);',
    '  border: 1px solid rgba(255,255,255,0.12);',
    '  border-radius: 10px;',
    '  text-align: center;',
    '  padding: 12px 8px;',
    '}',
    '.adventure-body .name {',
    '  font-size: 13px;',
    '  font-weight: 800;',
    '  letter-spacing: 0.03em;',
    '  margin-bottom: 4px;',
    '}',
    '.adventure-body .line {',
    '  margin: 0;',
    '  color: #c9d4f1;',
    '  line-height: 1.45;',
    '  font-size: 13px;',
    '}',
    '.adventure-pulse {',
    '  animation: advPulse 460ms ease;',
    '}',
    '@keyframes advPulse {',
    '  0% { transform: translateY(1px) scale(0.995); opacity: 0.92; }',
    '  100% { transform: translateY(0) scale(1); opacity: 1; }',
    '}',
    '@media (max-width: 820px) {',
    '  .adventure-layer { right: 8px; bottom: 8px; width: min(330px, calc(100vw - 16px)); }',
    '  .adventure-card { grid-template-columns: 80px 1fr; }',
    '  .adventure-body .line { font-size: 12px; }',
    '}'
  ].join('\n');

  let ready = false;
  let professorLine;
  let state = readState();
  let hideTimer = null;
  const SHOW_DURATION = 180000;
  let config = { _gameId: '' };

  function showLayer() {
    host.classList.remove('adv-hiding');
    host.classList.add('adv-visible');
  }

  function hideLayer() {
    host.classList.add('adv-hiding');
    const onEnd = () => {
      host.classList.remove('adv-visible');
      host.removeEventListener('transitionend', onEnd);
    };
    host.addEventListener('transitionend', onEnd);
  }

  function scheduleHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hideLayer, SHOW_DURATION);
  }

  function ensureMounted() {
    if (ready) return;
    document.body.appendChild(style);
    document.body.appendChild(host);
    professorLine = document.getElementById('advProfessorLine');
    ready = true;
  }

  function animatePulse() {
    showLayer();
    scheduleHide();
    host.classList.remove('adventure-pulse');
    void host.offsetWidth;
    host.classList.add('adventure-pulse');
  }

  function inferWeakness(context, eventType) {
    const text = String(context || '').toLowerCase();

    if (text.includes('time') || text.includes('slow') || text.includes('expired')) {
      return 'time management';
    }
    if (text.includes('wrong') || text.includes('miss') || text.includes('incorrect')) {
      return 'accuracy under pressure';
    }
    if (text.includes('hint') || text.includes('clue')) {
      return 'pattern recognition';
    }
    if (eventType === 'setback') {
      return 'consistency';
    }
    return state.lastWeakness || 'consistency';
  }

  function buildFallbackMessage(eventType, context) {
    const weakness = inferWeakness(context, eventType);
    state.lastWeakness = weakness;
    writeState(state);

    if (eventType === 'start') {
      return 'Professor Byte: I am your AI coach. We will build confidence and improve your weakness in ' + weakness + '.';
    }

    if (eventType === 'success') {
      return 'Professor Byte: Great job. Keep this momentum and keep sharpening ' + weakness + ' for cleaner wins.';
    }

    if (eventType === 'setback') {
      return 'Professor Byte: You are improving. Current weakness: ' + weakness + '. Slow down, refocus, then try again.';
    }

    if (eventType === 'hint') {
      return 'Professor Byte Hint: ' + context;
    }

    return 'Professor Byte: Stay focused. We improve through each attempt.';
  }

  function setProfessor(text) {
    ensureMounted();
    if (professorLine) professorLine.textContent = text;
    animatePulse();
  }

  const AI_ENDPOINT = 'http://localhost:4100/api/npc-message';
  const AI_TIMEOUT_MS = 3500;
  let aiApiEnabled = true;

  async function fetchProfessorMessage(eventType, context, extraStats) {
    if (!aiApiEnabled) {
      return null;
    }

    const merged = { ...state, ...extraStats };
    const payload = {
      event: eventType,
      game: config._gameId || document.title || 'quiz game',
      context: context || '',
      stats: {
        successes: merged.totalSuccesses,
        setbacks: merged.totalSetbacks,
        points: merged.totalPoints,
        weakness: merged.lastWeakness || 'consistency',
      }
    };

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const resp = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(tid);
      if (!resp.ok) throw new Error('non-200');
      const data = await resp.json();
      const message = typeof data?.professor === 'string' ? data.professor : '';
      return message.trim() || null;
    } catch (_error) {
      clearTimeout(tid);
      aiApiEnabled = false;
      return null;
    }
  }

  function startSession(gameId, contextTitle) {
    ensureMounted();
    state = readState();
    state.sessionsPlayed += 1;
    state.lastGame = gameId || '';
    config._gameId = gameId || '';
    writeState(state);

    // Tell ProgressTracker which game is starting
    if (window.ProgressTracker && typeof window.ProgressTracker.startGame === 'function') {
      window.ProgressTracker.startGame(gameId || document.title || 'game');
    }

    const context = contextTitle || gameId || '';
    setProfessor(buildFallbackMessage('start', context));

    fetchProfessorMessage('start', context).then((message) => {
      if (message) {
        setProfessor(message);
      }
    });
  }

  function recordSuccess(payload) {
    ensureMounted();
    const points = Math.max(1, Number(payload && payload.points) || 1);
    state.totalSuccesses += 1;
    state.totalPoints += points;

    const context = payload && payload.message ? payload.message : (payload && payload.word) || '';
    state.lastWeakness = inferWeakness(context, 'success');
    writeState(state);

    setProfessor(buildFallbackMessage('success', context));

    fetchProfessorMessage('success', context).then((message) => {
      if (message) {
        setProfessor(message);
      }
    });
  }

  function recordSetback(payload) {
    ensureMounted();
    state.totalSetbacks += 1;

    const context = payload && payload.message ? payload.message : (payload && payload.word) || '';
    state.lastWeakness = inferWeakness(context, 'setback');
    writeState(state);

    setProfessor(buildFallbackMessage('setback', context));

    fetchProfessorMessage('setback', context).then((message) => {
      if (message) {
        setProfessor(message);
      }
    });
  }

  function pushHint(text) {
    if (!text) return;
    state.lastWeakness = inferWeakness(text, 'hint');
    writeState(state);

    setProfessor(buildFallbackMessage('hint', text));

    fetchProfessorMessage('hint', text).then((message) => {
      if (message) {
        setProfessor(message);
      }
    });
  }

  // ── Periodic random performance nudge ───────────────────────────────────────
  // Fires every 3 minutes of active play; pauses when tab is hidden.
  const NUDGE_INTERVAL_MS = 3 * 60 * 1000;
  let nudgeTimer = null;

  function fireNudge() {
    if (document.hidden) return; // tab not visible — skip silently
    state = readState();

    // Prefer ProgressTracker's richer message if it is loaded
    let message = '';
    if (window.ProgressTracker && typeof window.ProgressTracker.buildNudgeMessage === 'function') {
      message = window.ProgressTracker.buildNudgeMessage();
    }

    if (!message) {
      // Fallback: derive from adventure state
      const pts = state.totalPoints;
      const sets = state.totalSetbacks;
      const pool = [
        'Professor Byte: You have earned ' + pts + ' point' + (pts !== 1 ? 's' : '') + ' so far. Keep the momentum.',
        sets > 0
          ? 'Professor Byte: ' + sets + ' setback' + (sets !== 1 ? 's' : '') + ' logged — each one is a lesson. You are improving.'
          : 'Professor Byte: No setbacks yet — stay sharp, the hard questions are coming.',
        'Professor Byte: Regular breaks sharpen focus. You are doing well.',
        'Professor Byte: Consistency over intensity. Keep showing up.',
      ];
      message = pool[Math.floor(Date.now() / 1000) % pool.length];
    }

    setProfessor(message);
    scheduleNudge(); // schedule next one
  }

  function scheduleNudge() {
    if (nudgeTimer) clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(fireNudge, NUDGE_INTERVAL_MS);
  }

  function pauseNudge() {
    if (nudgeTimer) { clearTimeout(nudgeTimer); nudgeTimer = null; }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      pauseNudge();
    } else {
      scheduleNudge(); // restart clock when user comes back
    }
  });

  // Start the nudge cycle as soon as this script loads
  scheduleNudge();

  window.StudyAdventure = {
    startSession,
    recordSuccess,
    recordSetback,
    pushHint,
    endSession: function (finalScore) {
      if (window.ProgressTracker && typeof window.ProgressTracker.endGame === 'function') {
        window.ProgressTracker.endGame(finalScore);
      }
    },
    getState: function () { return { ...state }; },
  };
})();
