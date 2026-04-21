(function () {
  const STORAGE_KEY = 'slidePlayAdventureState';
  const QUEST_TOPICS = [
    'Orientation Deck',
    'Core Concepts',
    'Applied Practice',
    'Mastery Arena',
    'Capstone Mission'
  ];

  const defaultState = {
    totalSuccesses: 0,
    totalSetbacks: 0,
    totalPoints: 0,
    unlockedTopicIndex: 0,
    sessionsPlayed: 0,
    lastGame: ''
  };

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || typeof parsed !== 'object') return { ...defaultState };
      return {
        ...defaultState,
        ...parsed,
        unlockedTopicIndex: Math.max(0, Math.min(QUEST_TOPICS.length - 1, Number(parsed.unlockedTopicIndex) || 0))
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
    '    <p class="line" id="advProfessorLine">Welcome back. Your learning mission is loading.</p>',
    '  </div>',
    '</div>',
    '<div class="adventure-card quest">',
    '  <div class="avatar">Quest Master</div>',
    '  <div class="adventure-body">',
    '    <div class="name">Quest Master Nova</div>',
    '    <p class="line" id="advQuestLine">Complete challenge actions to unlock the next topic.</p>',
    '    <div class="quest-track">',
    '      <span>Unlocked Topic:</span>',
    '      <strong id="advTopic">Orientation Deck</strong>',
    '    </div>',
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
    '}',
    '.adventure-card {',
    '  display: grid;',
    '  grid-template-columns: 88px 1fr;',
    '  gap: 10px;',
    '  align-items: center;',
    '  border-radius: 14px;',
    '  border: 1px solid rgba(255,255,255,0.18);',
    '  background: rgba(12, 16, 32, 0.9);',
    '  color: #e9efff;',
    '  padding: 10px;',
    '  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);',
    '  backdrop-filter: blur(6px);',
    '}',
    '.adventure-card.professor { border-color: rgba(20, 232, 208, 0.4); }',
    '.adventure-card.quest { border-color: rgba(255, 47, 156, 0.35); }',
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
    '.quest-track {',
    '  margin-top: 6px;',
    '  display: flex;',
    '  gap: 6px;',
    '  align-items: baseline;',
    '  color: #cdd8f8;',
    '  font-size: 12px;',
    '}',
    '.quest-track strong { color: #ff9acb; }',
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
  let questLine;
  let topicLabel;
  let state = readState();

  function ensureMounted() {
    if (ready) return;
    document.body.appendChild(style);
    document.body.appendChild(host);
    professorLine = document.getElementById('advProfessorLine');
    questLine = document.getElementById('advQuestLine');
    topicLabel = document.getElementById('advTopic');
    updateTopicText();
    ready = true;
  }

  function updateTopicText() {
    if (!topicLabel) return;
    topicLabel.textContent = QUEST_TOPICS[state.unlockedTopicIndex] || QUEST_TOPICS[0];
  }

  function animatePulse() {
    host.classList.remove('adventure-pulse');
    void host.offsetWidth;
    host.classList.add('adventure-pulse');
  }

  function maybeUnlockTopic() {
    const tier = Math.floor(state.totalSuccesses / 8);
    const target = Math.min(QUEST_TOPICS.length - 1, tier);
    const unlocked = target > state.unlockedTopicIndex;
    if (unlocked) {
      state.unlockedTopicIndex = target;
      updateTopicText();
      if (questLine) {
        questLine.textContent = 'Quest Master: Topic unlocked! New route available in your study path.';
      }
    }
    return unlocked;
  }

  function setProfessor(text) {
    ensureMounted();
    if (professorLine) professorLine.textContent = text;
    animatePulse();
  }

  function setQuest(text) {
    ensureMounted();
    if (questLine) questLine.textContent = text;
    animatePulse();
  }

  function startSession(gameId, contextTitle) {
    ensureMounted();
    state = readState();
    state.sessionsPlayed += 1;
    state.lastGame = gameId || '';
    writeState(state);
    updateTopicText();

    setProfessor('Professor Byte: Mission ready. Focus on understanding, then speed.');
    setQuest('Quest Master: Complete challenge actions to unlock your next study topic.');

    if (contextTitle) {
      setTimeout(() => {
        setProfessor('Professor Byte: Active arena - ' + contextTitle + '.');
      }, 200);
    }
  }

  function recordSuccess(payload) {
    ensureMounted();
    const points = Math.max(1, Number(payload && payload.points) || 1);
    state.totalSuccesses += 1;
    state.totalPoints += points;
    writeState(state);

    const unlocked = maybeUnlockTopic();
    writeState(state);

    const note = payload && payload.message
      ? payload.message
      : 'Excellent move. You are building durable recall.';
    setProfessor('Professor Byte: ' + note);

    if (!unlocked) {
      const remaining = Math.max(0, 8 - (state.totalSuccesses % 8));
      setQuest('Quest Master: ' + remaining + ' more successful actions to unlock the next topic.');
    }
  }

  function recordSetback(payload) {
    ensureMounted();
    state.totalSetbacks += 1;
    writeState(state);

    const note = payload && payload.message
      ? payload.message
      : 'Reset the strategy and try a cleaner approach.';
    setProfessor('Professor Byte: ' + note);
    setQuest('Quest Master: Keep going. Consistency unlocks new chapters, not perfection.');
  }

  function pushHint(text) {
    if (!text) return;
    setProfessor('Professor Byte Hint: ' + text);
  }

  window.StudyAdventure = {
    startSession,
    recordSuccess,
    recordSetback,
    pushHint,
    getState: function () { return { ...state }; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureMounted);
  } else {
    ensureMounted();
  }
})();
