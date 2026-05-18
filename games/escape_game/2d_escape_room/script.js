/* ═══════════════════════════════════════════════════════════════════
   2D ESCAPE ROOM — script.js  (complete rewrite)
   Matches index.html (2D edition) + style.css
   Door code: 4321  |  Time limit: 10 minutes
═══════════════════════════════════════════════════════════════════ */

const OBJECTS = {
  clock:   { icon: '⏰', title: 'Wall Clock',       desc: 'The clock stopped at 4:32 PM. A sticky note says: "Never forget — the order matters."', clue: 'Clock frozen at 4:32 — the digits matter.', dot: null },
  board:   { icon: '📋', title: 'Chalkboard',       desc: 'Maths puzzle: 4+3=7 and 2+1=3. A note: "The exit code uses room numbers in sequence, sharp."', clue: 'Door code starts with 4 then 3.', dot: 'd1' },
  skull:   { icon: '☠️', title: 'Decorative Skull', desc: 'A carved number on the skull\'s forehead: 4. Label: "first of four." You pocket a chip.', clue: 'First digit is 4.', dot: 'd3', item: { id: 'skull_fragment', label: '☠️ Skull Fragment', desc: 'Unlocks the padlock on the door.' }, unlocksLock: 'padlock' },
  rth:     { icon: '⚙️', title: 'RTH Machine',     desc: 'A device labelled "Room Transfer Hub." A dial shows 32. Scratched beside it: "Middle digits."', clue: 'Middle digits of the code: 3 and 2.', dot: 'd2' },
  shelf:   { icon: '📚', title: 'Bookshelf',        desc: 'Four thick books, one empty slot. A scrap falls out: "last digit: 1." You take the page.', clue: 'Last digit is 1.', dot: 'd4', item: { id: 'book_page', label: '📄 Book Page', desc: 'Threads through the chain on the door.' }, unlocksLock: 'chain' },
  globe_l: { icon: '🌍', title: 'Globe',            desc: 'The globe draws your eye to Africa. A label reads "3rd planet" and the base is slightly tilted.', clue: 'Third digit is 2.', dot: 'd5' },
  map:     { icon: '🗺️', title: 'Map',              desc: 'A classroom map. A red X marks the door — three locks. Solve in order: Padlock → Chain → Keypad.', clue: 'Three locks: Padlock, Chain, Keypad.', dot: null },
  door:    { icon: '🚪', title: 'Locked Door',      desc: null, dot: 'd6', isDoor: true },
  candle:  { icon: '🕯️', title: 'Candle',           desc: 'Flickering candle. Nothing useful — but it gives you courage.', clue: null, dot: null },
  window:  { icon: '🪟', title: 'Window',           desc: 'Locked and barred. School courtyard visible. No way out — focus on the door.', clue: null, dot: null },
  teacher: { icon: '👨‍🏫', title: 'Mr. Thompson',    desc: '"Look at the chalkboard, skull, bookshelf, and globe. All clues are there, sharp." He vanishes.', clue: null, dot: null, isNPC: true },
  hidden_drawer:          { icon: '📜', title: 'Hidden Drawer',   desc: 'Inside: a note — "Padlock + Chain must be opened before the keypad will respond."', clue: 'Unlock Padlock and Chain before trying the keypad.', dot: null, isHidden: true },
  hidden_envelope:        { icon: '✉️', title: 'Hidden Envelope', desc: 'One word inside: "SEQUENTIAL." Underlined three times.', clue: null, dot: null, isHidden: true },
  red_herring_painting:   { icon: '🖼️', title: 'Painting',       desc: 'An abstract painting. Nothing useful here — but oddly beautiful.', clue: null, dot: null, isHidden: true },
  red_herring_box:        { icon: '📦', title: 'Box',             desc: 'An empty box. Someone wrote "not here" on the bottom.', clue: null, dot: null, isHidden: true },
  student_mia:  { icon: '👧',   title: 'Mia',  desc: '"I heard the code has four digits and starts with a four…" she whispers.', isNPC: true },
  student_tate: { icon: '👦',   title: 'Tate', desc: '"Check the skull and the bookshelf — I saw clues there."', isNPC: true },
  student_lina: { icon: '👩',   title: 'Lina', desc: '"The globe and the RTH machine reveal the middle two digits."', isNPC: true },
  student_omar: { icon: '🧑',   title: 'Omar', desc: '"Examine the skull carefully — you will find something for the padlock!"', isNPC: true },
  student_nia:  { icon: '👧🏽', title: 'Nia',  desc: '"Three locks, four digits. Once all three are open, you are free. Haamba!"', isNPC: true },
};

const TOTAL_TIME = 600;
const DOOR_CODE  = '4321';
const GENERATED_QUIZ_KEY = 'slidePlayGeneratedQuizData';
const UPLOADED_FILES_KEY = 'slidePlayUploadedFiles';
const DEMO_SESSION_KEY = 'slidePlayDemoSession';

let HINTS_LIST = [
  'The skull gives you the first digit AND the Skull Fragment (needed for the padlock).',
  'The bookshelf holds the last digit AND the Book Page (needed for the chain).',
  'Full code: 4-3-2-1. Collect both items, use them on the door, then enter the code.',
];

const state = {
  started: false, paused: false, solved: false,
  timeLeft: TOTAL_TIME, timerRef: null,
  inventory: new Map(), visited: new Set(), dotsCompleted: new Set(),
  locks: { padlock: false, chain: false, keypad: false },
  sourceContext: null,
  hintIdx: 0,
};

const $    = id => document.getElementById(id);
const show = el => { el.style.display = 'flex'; };
const hide = el => { el.style.display = 'none'; };

function readJsonStorage(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed ?? fallback;
  } catch (_error) {
    return fallback;
  }
}

function getSourceContext() {
  const quizData = readJsonStorage(GENERATED_QUIZ_KEY, []);
  const uploadedFiles = readJsonStorage(UPLOADED_FILES_KEY, []);
  const demoSession = readJsonStorage(DEMO_SESSION_KEY, null);

  const firstFile = Array.isArray(uploadedFiles) && uploadedFiles.length > 0 ? uploadedFiles[0] : null;
  const rawTopic = demoSession && demoSession.title
    ? demoSession.title
    : (firstFile && firstFile.originalName ? firstFile.originalName : '');
  const topicLabel = String(rawTopic).replace(/\.[^.]+$/, '').trim();

  const quizClues = (Array.isArray(quizData) ? quizData : [])
    .map(function (item) { return String(item && item.question ? item.question : '').trim(); })
    .filter(Boolean)
    .slice(0, 3);

  return {
    hasSource: (Array.isArray(uploadedFiles) && uploadedFiles.length > 0) || quizClues.length > 0,
    topicLabel: topicLabel,
    quizClues: quizClues,
  };
}

function applySourceContext() {
  const ctx = getSourceContext();
  state.sourceContext = ctx;
  if (!ctx.hasSource) return;

  if (ctx.topicLabel) {
    OBJECTS.map.desc = 'A classroom map with notes from your source topic: ' + ctx.topicLabel + '. The door still has three locks in order: Padlock, Chain, Keypad.';
    OBJECTS.teacher.desc = '"Today\'s challenge is based on ' + ctx.topicLabel + '. Use the room clues and keep the lock order sharp."';
  }

  if (ctx.quizClues.length > 0) {
    OBJECTS.board.desc = 'Chalk notes include study prompts from your uploaded/demo material. One line reads: "' + ctx.quizClues[0] + '"';
    OBJECTS.board.clue = 'The board references your uploaded topic while still pointing to the 4-3-2-1 lock puzzle.';
    HINTS_LIST = [
      'Study clue from your files: ' + ctx.quizClues[0],
      ctx.quizClues[1] ? ('Another source clue: ' + ctx.quizClues[1]) : 'Use the skull for the padlock and the bookshelf for the chain.',
      'Puzzle path remains: collect both lock items, then enter 4321 on the keypad.',
    ];
  }
}

function showToast(msg, type) {
  const color = type === 'success' ? '#27ae60' : type === 'danger' ? '#c0392b' : 'var(--gold)';
  const t = document.createElement('div');
  t.style.cssText = 'background:rgba(26,14,4,.97);border:1px solid ' + color
    + ';color:var(--text);font-family:"Share Tech Mono",monospace;font-size:.78rem'
    + ';padding:8px 14px;border-radius:6px;margin-top:6px;transition:opacity .4s';
  t.textContent = msg;
  $('toast-container').appendChild(t);
  setTimeout(function () { t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 420); }, 3000);
}

function addLog(msg) {
  const d = document.createElement('div');
  d.style.cssText = 'padding:4px 0;border-bottom:1px solid rgba(212,168,67,.12);font-size:.75rem;color:#c8a85e';
  d.textContent = msg;
  $('log-entries').prepend(d);
}

function addItem(item) {
  if (state.inventory.has(item.id)) return;
  state.inventory.set(item.id, item);
  renderInv();
  showToast('+ ' + item.label + ' added to inventory', 'success');
}

function renderInv() {
  const list = $('inv-list');
  list.innerHTML = '';
  if (!state.inventory.size) { list.innerHTML = '<li style="opacity:.5;font-size:.75rem">Nothing yet…</li>'; return; }
  state.inventory.forEach(function (item) {
    const li = document.createElement('li');
    li.style.cssText = 'padding:4px 0;border-bottom:1px solid rgba(212,168,67,.12);font-size:.8rem;cursor:pointer';
    li.title = item.desc; li.textContent = item.label;
    li.addEventListener('click', function () { openExamine(item.label, item.desc); });
    list.appendChild(li);
  });
}

function fmt(s) { return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }

function startTimer() {
  const timerEl = $('timer');
  timerEl.textContent = fmt(state.timeLeft);
  timerEl.classList.add('ok');
  state.timerRef = setInterval(function () {
    if (state.paused || state.solved) return;
    state.timeLeft = Math.max(0, state.timeLeft - 1);
    timerEl.textContent = fmt(state.timeLeft);
    if (state.timeLeft <= 120) timerEl.classList.remove('ok');
    if (state.timeLeft === 0) { clearInterval(state.timerRef); triggerFailure(); }
  }, 1000);
}

function markDot(id) {
  if (!id || state.dotsCompleted.has(id)) return;
  state.dotsCompleted.add(id);
  const el = $(id); if (el) el.classList.add('done');
}

function setObj(text) { $('obj-text').textContent = text; }
function checkObj() {
  if (state.solved) return;
  const n = state.dotsCompleted.size;
  if (n >= 4) setObj('Try the door — use your items on the locks!');
  else if (n >= 2) setObj('Keep exploring — more clues to find.');
  else setObj('Investigate the classroom objects.');
}

function showGM(msg, ms) {
  $('gm-text').textContent = msg;
  show($('gm-bubble'));
  clearTimeout(showGM._t);
  showGM._t = setTimeout(function () { hide($('gm-bubble')); }, ms || 4500);
}
showGM._t = null;

function openExamine(title, desc) {
  $('examine-title').textContent = title;
  $('examine-desc').textContent  = desc || '';
  $('examine-icon').textContent  = '';
  show($('examine-overlay'));
}

function openModal(title, body) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML    = body || '';
  $('modal-input').innerHTML   = '';
  $('modal-buttons').innerHTML = '';
  show($('modal-wrapper'));
}

function closeModal() {
  hide($('modal-wrapper'));
  $('modal-input').innerHTML = '';
  $('modal-buttons').innerHTML = '';
}

function lockRow(label, unlocked, actionHtml) {
  return '<div style="margin:8px 0;padding:8px;background:rgba(255,255,255,.04);border-radius:6px;font-size:.82rem"><strong>'
    + label + '</strong>: '
    + (unlocked ? '<span style="color:#27ae60">✓ Unlocked</span>'
                : '<span style="color:#c0392b">Locked</span> — ' + actionHtml) + '</div>';
}

function openDoorModal() {
  const hasSkull = state.inventory.has('skull_fragment');
  const hasPage  = state.inventory.has('book_page');
  const body =
    lockRow('🔒 Padlock', state.locks.padlock,
      hasSkull ? '<button class="modal-btn" id="use-skull" type="button">Use Skull Fragment</button>'
               : '<em style="opacity:.6">Need: Skull Fragment</em>')
    + lockRow('⛓️ Chain', state.locks.chain,
      state.locks.padlock
        ? (hasPage ? '<button class="modal-btn" id="use-page" type="button">Use Book Page</button>'
                   : '<em style="opacity:.6">Need: Book Page</em>')
        : '<em style="opacity:.6">Unlock padlock first</em>')
    + lockRow('🔢 Keypad', state.locks.keypad,
      (state.locks.padlock && state.locks.chain)
        ? 'Code: <input id="door-code-input" type="text" maxlength="4" inputmode="numeric"'
          + ' style="width:72px;background:rgba(255,255,255,.08);border:1px solid var(--gold);'
          + 'color:var(--text);padding:3px 6px;border-radius:4px;'
          + 'font-family:share tech mono,monospace;margin:0 6px">'
          + '<button class="modal-btn" id="try-code" type="button">Try</button>'
        : '<em style="opacity:.6">Unlock both locks first</em>');

  openModal('🚪 Locked Door', body);
  markDot('d6');

  const btnSkull = $('use-skull');
  if (btnSkull) btnSkull.addEventListener('click', function () {
    state.locks.padlock = true; $('lock-padlock').classList.add('unlocked');
    state.inventory.delete('skull_fragment'); renderInv();
    addLog('Padlock removed using Skull Fragment.'); showToast('🔒 Padlock unlocked!', 'success');
    closeModal(); openDoorModal();
  });

  const btnPage = $('use-page');
  if (btnPage) btnPage.addEventListener('click', function () {
    state.locks.chain = true; $('lock-chain').classList.add('unlocked');
    state.inventory.delete('book_page'); renderInv();
    addLog('Chain removed using Book Page.'); showToast('⛓️ Chain unlocked!', 'success');
    closeModal(); openDoorModal();
  });

  const btnCode = $('try-code');
  if (btnCode) btnCode.addEventListener('click', function () {
    const inp = $('door-code-input');
    if (inp && inp.value.trim() === DOOR_CODE) {
      state.locks.keypad = true; $('lock-keypad').classList.add('unlocked');
      closeModal(); triggerVictory();
    } else { showToast('Wrong code. Keep searching.', 'danger'); if (inp) inp.value = ''; }
  });
}

function triggerVictory() {
  state.solved = true; clearInterval(state.timerRef); markDot('d6');
  const elapsed = TOTAL_TIME - state.timeLeft;
  saveLB(elapsed);
  const m = Math.floor(elapsed / 60), s = elapsed % 60;
  openModal('🎉 VASGEVANG! VRYHEID!',
    '<div style="text-align:center;padding:16px">'
    + '<div style="font-family:Creepster,cursive;font-size:2rem;color:#27ae60;text-shadow:0 0 12px #27ae60">You Escaped!</div>'
    + '<p style="margin-top:10px">Time: <strong>' + m + 'm ' + String(s).padStart(2, '0') + 's</strong></p>'
    + '<p style="margin-top:6px;opacity:.7;font-size:.82rem">Lekker! Sharp sharp.</p>'
    + '<button onclick="location.reload()" class="modal-btn" style="margin-top:14px" type="button">Play Again</button></div>');
  setObj('🏆 You escaped! Well done.');
  showGM('Haamba! Code 4321 — you are free, sharp!', 8000);
}

function triggerFailure() {
  state.solved = true;
  const fo = $('failure-overlay');
  $('failure-text').innerHTML =
    '<div style="font-family:Creepster,cursive;font-size:2.5rem;color:#c0392b;text-shadow:0 0 20px #c0392b">TIME UP</div>'
    + '<p style="font-family:share tech mono,monospace;margin-top:12px;color:#aaa">The door stays locked.</p>'
    + '<button onclick="location.reload()" style="margin-top:18px;padding:10px 24px;background:#c0392b;'
    + 'color:#fff;border:none;border-radius:6px;font-size:1rem;cursor:pointer" type="button">Try Again</button>';
  fo.style.opacity = '0'; show(fo);
  requestAnimationFrame(function () { fo.style.opacity = '1'; });
}

const LB_KEY = 'escapeRoom2dLB';
function saveLB(secs) {
  const lb = JSON.parse(localStorage.getItem(LB_KEY) || '[]');
  lb.push({ time: secs, date: new Date().toLocaleDateString() });
  lb.sort(function (a, b) { return a.time - b.time; });
  localStorage.setItem(LB_KEY, JSON.stringify(lb.slice(0, 10)));
}
function renderLB() {
  const tb = $('lb-table').querySelector('tbody');
  const lb = JSON.parse(localStorage.getItem(LB_KEY) || '[]');
  tb.innerHTML = lb.length
    ? lb.map(function (e, i) { const m = Math.floor(e.time / 60), s = e.time % 60;
        return '<tr><td>' + (i + 1) + '</td><td>' + m + 'm ' + String(s).padStart(2, '0') + 's</td><td>' + e.date + '</td></tr>'; }).join('')
    : '<tr><td colspan="3" style="opacity:.5;text-align:center">No records yet</td></tr>';
}

function giveHint() {
  if (state.hintIdx >= HINTS_LIST.length) { showToast('No more hints.', 'info'); return; }
  const hint = HINTS_LIST[state.hintIdx++];
  state.timeLeft = Math.max(0, state.timeLeft - 30);
  $('timer').textContent = fmt(state.timeLeft);
  showToast('💡 ' + hint, 'info'); addLog('💡 Hint (-30s): ' + hint);
  const left = HINTS_LIST.length - state.hintIdx;
  $('hint-btn').textContent = '💡 Hint (-30s)' + (left ? ' [' + left + ']' : ' [0]');
  if (!left) $('hint-btn').disabled = true;
}

function reveal(elId) {
  const el = $(elId);
  if (el && el.classList.contains('hidden-obj') && !el.classList.contains('revealed')) {
    el.classList.add('revealed'); showToast('🔍 You noticed something hidden!', 'info');
  }
}

function handleClick(key) {
  if (!state.started || state.paused || state.solved) return;
  const obj = OBJECTS[key]; if (!obj) return;

  state.visited.add(key);
  const el = document.querySelector('[data-key="' + key + '"]');
  if (el) el.classList.add('visited');

  if (obj.isDoor) { addLog('Examined the locked door.'); openDoorModal(); return; }

  if (obj.dot) markDot(obj.dot);

  if (obj.item && !state.inventory.has(obj.item.id)) {
    addItem(obj.item); if (el) el.classList.add('solved-obj');
    showToast('Go to the door and use your new item on a lock!', 'info');
  }

  addLog((obj.isNPC ? '💬 ' : '🔍 ') + obj.title);
  if (obj.clue && !state.visited.has(key + '_c')) { state.visited.add(key + '_c'); addLog('📌 Clue: ' + obj.clue); }

  openExamine((obj.icon || '') + ' ' + obj.title, obj.desc || 'Nothing unusual.');

  if (key === 'skull') reveal('hs-drawer');
  if (key === 'shelf') reveal('hs-envelope');
  if (key === 'hidden_drawer' || key === 'hidden_envelope') { reveal('hs-painting'); reveal('hs-box'); }

  checkObj();
}

function init() {
  applySourceContext();

  $('start-btn').addEventListener('click', function () {
    hide($('startup-screen')); state.started = true;
    startTimer(); renderInv();
    setObj(state.sourceContext && state.sourceContext.topicLabel
      ? ('Investigate clues from: ' + state.sourceContext.topicLabel + '.')
      : 'Investigate the classroom objects.');
    showGM(state.sourceContext && state.sourceContext.topicLabel
      ? ('Welcome to Room 14B. Topic loaded: ' + state.sourceContext.topicLabel + '. Find clues and crack the door code.')
      : 'Welcome to Room 14B. Find clues and crack the door code. Haamba!', 5500);
    addLog('Game started. Good luck!');
    if (state.sourceContext && state.sourceContext.hasSource) {
      addLog('Loaded uploaded/demo source context for this run.');
    }
    $('hint-btn').textContent = '💡 Hint (-30s) [' + HINTS_LIST.length + ']';
  });

  $('room').addEventListener('click', function (e) {
    const hs = e.target.closest('.hs'); if (hs && hs.dataset.key) handleClick(hs.dataset.key);
  });

  $('modal-close').addEventListener('click', closeModal);
  $('examine-close').addEventListener('click', function () { hide($('examine-overlay')); });
  $('resume-btn').addEventListener('click', function () { state.paused = false; hide($('pause-overlay')); });
  $('help-close').addEventListener('click', function () { hide($('help-overlay')); });
  $('lb-close').addEventListener('click', function () { hide($('leaderboard-overlay')); });
  $('show-lb-btn').addEventListener('click', function () { renderLB(); hide($('pause-overlay')); show($('leaderboard-overlay')); });
  $('hint-btn').addEventListener('click', function () { if (state.started && !state.paused && !state.solved) giveHint(); });
  $('pause-btn-fixed').addEventListener('click', function () { if (state.started && !state.solved) { state.paused = true; show($('pause-overlay')); } });
  $('help-btn-fixed').addEventListener('click', function () { show($('help-overlay')); });
  $('modal-wrapper').addEventListener('click', function (e) { if (e.target === $('modal-wrapper')) closeModal(); });

  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') {
      if ($('modal-wrapper').style.display === 'flex')       { closeModal(); return; }
      if ($('examine-overlay').style.display === 'flex')     { hide($('examine-overlay')); return; }
      if ($('help-overlay').style.display === 'flex')        { hide($('help-overlay')); return; }
      if ($('leaderboard-overlay').style.display === 'flex') { hide($('leaderboard-overlay')); return; }
      if ($('pause-overlay').style.display === 'flex')       { state.paused = false; hide($('pause-overlay')); return; }
      if (state.started && !state.solved) { state.paused = true; show($('pause-overlay')); }
    }
    if (e.key === 'h' || e.key === 'H') show($('help-overlay'));
  });

  hide($('gm-bubble'));
}

window.addEventListener('load', init);
