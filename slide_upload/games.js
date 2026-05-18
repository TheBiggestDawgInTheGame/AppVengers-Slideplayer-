const GENERATED_QUIZ_KEY = 'slidePlayGeneratedQuizData';
const UPLOADED_FILES_KEY = 'slidePlayUploadedFiles';
const DEMO_SESSION_KEY = 'slidePlayDemoSession';
const PLAY_STYLE_KEY = 'slidePlayPlayStyle';
const PLAY_PLAYERS_KEY = 'slidePlayPlayers';

function readJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed ?? fallback;
  } catch (_error) {
    return fallback;
  }
}

const uploadedFiles = readJson(UPLOADED_FILES_KEY, []);
const generatedQuiz = readJson(GENERATED_QUIZ_KEY, []);
const demoSession = readJson(DEMO_SESSION_KEY, null);

const fileCountEl = document.getElementById('fileCount');
const questionCountEl = document.getElementById('questionCount');
const summaryTitleEl = document.getElementById('summaryTitle');

if (fileCountEl) fileCountEl.textContent = String(uploadedFiles.length);
if (questionCountEl) questionCountEl.textContent = String(generatedQuiz.length);

if (summaryTitleEl) {
  if (uploadedFiles.length > 0) {
    const label = uploadedFiles.length === 1 ? uploadedFiles[0].originalName : `${uploadedFiles.length} uploaded files`;
    summaryTitleEl.textContent = label;
  }
  if (demoSession && demoSession.title) {
    summaryTitleEl.textContent = `Demo Topic: ${demoSession.title}`;
  }
}

// ── Play Style Modal ─────────────────────────────────────────────────────────
const modal       = document.getElementById('play-style-modal');
const psmGameName = document.getElementById('psm-game-name');
const psmClose    = document.getElementById('psm-close');
const psmOptions  = document.querySelectorAll('.psm-option');
const psmPlayers  = document.getElementById('psm-players-section');
const psmPlayerList = document.getElementById('psm-player-list');
const psmAddPlayer  = document.getElementById('psm-add-player');
const psmLaunch     = document.getElementById('psm-launch');
const psmLaunchSolo = document.getElementById('psm-launch-solo');
const psmDeviceSection = document.getElementById('psm-device-section');
const psmDeviceOptions = document.querySelectorAll('.psm-device-option');
const psmRoomSection   = document.getElementById('psm-room-section');
const psmRoomCode      = document.getElementById('psm-room-code');
const psmCopyCode      = document.getElementById('psm-copy-code');
const psmLaunchRoom    = document.getElementById('psm-launch-room');

let pendingHref    = '';
let selectedStyle  = '';
let selectedDevice = ''; // 'same' | 'different'

function generateRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function resetModalSections() {
  psmDeviceSection.classList.add('hidden');
  psmPlayers.classList.add('hidden');
  psmRoomSection.classList.add('hidden');
  psmLaunchSolo.classList.add('hidden');
  psmLaunch.classList.add('hidden');
  psmDeviceOptions.forEach(o => o.classList.remove('active'));
  selectedDevice = '';
}

function openModal(card) {
  pendingHref = card.getAttribute('href');
  psmGameName.textContent = card.querySelector('h3')?.textContent || 'Selected Game';
  selectedStyle = '';
  psmOptions.forEach(o => o.classList.remove('active'));
  psmPlayerList.innerHTML = '';
  addPlayerRow(1); addPlayerRow(2);
  resetModalSections();
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

function addPlayerRow(num) {
  const row = document.createElement('div');
  row.className = 'psm-player-row';
  row.innerHTML = `
    <span class="psm-player-label">Player ${num}</span>
    <input class="psm-player-input" type="text" placeholder="Enter name" data-player="${num}" autocomplete="off" autocorrect="off" spellcheck="false">
  `;
  psmPlayerList.appendChild(row);
  updateLaunchBtn();
}

function getPlayerNames() {
  return [...psmPlayerList.querySelectorAll('.psm-player-input')]
    .map(i => i.value.trim())
    .filter(Boolean);
}

function updateLaunchBtn() {
  const names = getPlayerNames();
  psmLaunch.disabled = names.length < 2;
}

psmOptions.forEach(btn => {
  btn.addEventListener('click', () => {
    psmOptions.forEach(o => o.classList.remove('active'));
    btn.classList.add('active');
    selectedStyle = btn.dataset.style;

    resetModalSections();
    if (selectedStyle === 'solo') {
      psmLaunchSolo.classList.remove('hidden');
    } else {
      // Show device choice step first
      psmDeviceSection.classList.remove('hidden');
    }
  });
});

psmPlayerList.addEventListener('input', updateLaunchBtn);

psmAddPlayer.addEventListener('click', () => {
  const count = psmPlayerList.querySelectorAll('.psm-player-row').length + 1;
  if (count <= 8) addPlayerRow(count);
  if (count >= 8) psmAddPlayer.disabled = true;
});

function launchGame() {
  const players = selectedStyle === 'solo' ? ['Solo Player'] : getPlayerNames();
  localStorage.setItem(PLAY_STYLE_KEY, selectedStyle);
  localStorage.setItem(PLAY_PLAYERS_KEY, JSON.stringify(players));
  localStorage.setItem('slidePlayDeviceMode', selectedDevice || 'same');
  window.location.href = pendingHref;
}

psmLaunch.addEventListener('click', launchGame);
psmLaunchSolo.addEventListener('click', () => { selectedDevice = 'same'; launchGame(); });
psmLaunchRoom.addEventListener('click', launchGame);

// Device option selection
psmDeviceOptions.forEach(btn => {
  btn.addEventListener('click', () => {
    psmDeviceOptions.forEach(o => o.classList.remove('active'));
    btn.classList.add('active');
    selectedDevice = btn.dataset.device;

    if (selectedDevice === 'same') {
      psmRoomSection.classList.add('hidden');
      psmPlayers.classList.remove('hidden');
      psmLaunch.classList.remove('hidden');
      updateLaunchBtn();
    } else {
      psmPlayers.classList.add('hidden');
      psmLaunch.classList.add('hidden');
      psmRoomSection.classList.remove('hidden');
      const code = generateRoomCode();
      psmRoomCode.textContent = code;
      localStorage.setItem('slidePlayRoomCode', code);
    }
  });
});

// Copy room code
psmCopyCode.addEventListener('click', () => {
  navigator.clipboard.writeText(psmRoomCode.textContent).then(() => {
    psmCopyCode.textContent = '✅';
    setTimeout(() => { psmCopyCode.textContent = '📋'; }, 1500);
  });
});
psmClose.addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── Game card selection ──────────────────────────────────────────────────────
document.querySelectorAll('.game-card[data-available]').forEach((card) => {
  card.addEventListener('click', (e) => {
    e.preventDefault();

    // Visual selection
    document.querySelectorAll('.game-card').forEach((c) => {
      c.classList.remove('selected');
      const badges = c.querySelector('.card-badges');
      if (badges) {
        const sel = badges.querySelector('.badge-selected');
        if (sel) sel.remove();
      }
      const bar = c.querySelector('.card-bar');
      if (bar) bar.remove();
    });
    card.classList.add('selected');
    const topRow = card.querySelector('.card-top');
    if (topRow) {
      let badges = card.querySelector('.card-badges');
      if (!badges) {
        const catBadge = topRow.querySelector('.badge-cat');
        badges = document.createElement('div');
        badges.className = 'card-badges';
        if (catBadge) topRow.replaceChild(badges, catBadge);
        else topRow.appendChild(badges);
        if (catBadge) badges.appendChild(catBadge);
      }
      if (!badges.querySelector('.badge-selected')) {
        const sel = document.createElement('span');
        sel.className = 'badge badge-selected';
        sel.textContent = 'SELECTED';
        badges.prepend(sel);
      }
    }
    if (!card.querySelector('.card-bar')) {
      const bar = document.createElement('div');
      bar.className = 'card-bar';
      card.appendChild(bar);
    }

    // Open play style modal
    openModal(card);
  });
});
