const GENERATED_QUIZ_KEY = 'slidePlayGeneratedQuizData';
const UPLOADED_FILES_KEY = 'slidePlayUploadedFiles';
const DEMO_SESSION_KEY = 'slidePlayDemoSession';
const PLAY_STYLE_KEY = 'slidePlayPlayStyle';
const PLAY_PLAYERS_KEY = 'slidePlayPlayers';
const JEOPARDY_COUNT_KEY = 'slidePlayJeopardyQuizQuestionCount';
const JEOPARDY_3D_COUNT_KEY = 'slidePlayJeopardy3dQuestionCount';

function getStudentPlan() {
  try {
    const sub = JSON.parse(localStorage.getItem('sp_student_subscription') || 'null');
    if (sub && sub.status !== 'cancelled' && sub.plan) return sub.plan;
  } catch (_) {}
  return 'free';
}

function getTeacherPlan() {
  try {
    const sub = JSON.parse(localStorage.getItem('sp_teacher_subscription') || localStorage.getItem('sp_subscription') || 'null');
    if (sub && sub.status !== 'cancelled' && sub.plan) return sub.plan;
  } catch (_) {}
  return 'free';
}

function isPaidPlan() {
  if (getUserRole() === 'teacher') {
    const p = getTeacherPlan();
    return p === 'pro' || p === 'school';
  }
  const p = getStudentPlan();
  return p === 'student_elite' || p === 'student_premium';
}

function getUserRole() {
  return String(localStorage.getItem('sp_user_role') || 'student').toLowerCase();
}

function getUpgradeUrlForRole() {
  const returnTo = encodeURIComponent(window.location.href);
  if (getUserRole() === 'teacher') {
    return 'onboarding-payment.html?role=teacher&source=games-modal&returnTo=' + returnTo;
  }
  return 'studentpayment.html?source=games-modal&return=' + returnTo;
}

function getPlanLabelForRole(style) {
  if (getUserRole() === 'teacher') {
    return style === 'tournament' ? 'School Premium' : 'Teacher Pro';
  }
  return style === 'tournament' ? 'Student Premium' : 'Student Elite';
}

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

const modal = document.getElementById('play-style-modal');
const psmGameName = document.getElementById('psm-game-name');
const psmClose = document.getElementById('psm-close');
const psmOptions = document.querySelectorAll('.psm-option');
const psmPlayers = document.getElementById('psm-players-section');
const psmPlayerList = document.getElementById('psm-player-list');
const psmAddPlayer = document.getElementById('psm-add-player');
const psmLaunch = document.getElementById('psm-launch');
const psmLaunchSolo = document.getElementById('psm-launch-solo');
const psmDeviceSection = document.getElementById('psm-device-section');
const psmDeviceOptions = document.querySelectorAll('#psm-device-section .psm-device-option[data-device]');
const psmRoomSection = document.getElementById('psm-room-section');
const psmRoomCode = document.getElementById('psm-room-code');
const psmCopyCode = document.getElementById('psm-copy-code');
const psmLaunchRoom = document.getElementById('psm-launch-room');
const psmQuizVersionSection = document.getElementById('psm-quiz-version');
const psmQuizVersionOptions = document.querySelectorAll('[data-quiz-version]');

let pendingHref = '';
let selectedStyle = '';
let selectedDevice = '';
let pendingCard = null;
let selectedQuizVersion = '';

function generateRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function resetModalSections(options = {}) {
  const { resetQuizVersion = true } = options;
  psmDeviceSection.classList.add('hidden');
  psmPlayers.classList.add('hidden');
  psmRoomSection.classList.add('hidden');
  psmLaunchSolo.classList.add('hidden');
  psmLaunch.classList.add('hidden');
  if (psmQuizVersionSection) {
    if (resetQuizVersion) {
      psmQuizVersionSection.classList.add('hidden');
      psmQuizVersionOptions.forEach((o) => o.classList.remove('active'));
      selectedQuizVersion = '';
    } else if (pendingCard?.dataset.quizSelector === 'true') {
      psmQuizVersionSection.classList.remove('hidden');
    }
  }
  psmDeviceOptions.forEach((o) => o.classList.remove('active'));
  selectedDevice = '';
}

function openModal(card) {
  pendingCard = card;
  pendingHref = card.getAttribute('href');
  psmGameName.textContent = card.querySelector('h3')?.textContent || 'Selected Game';
  selectedStyle = '';
  psmOptions.forEach((o) => o.classList.remove('active'));
  psmPlayerList.innerHTML = '';
  addPlayerRow(1);
  addPlayerRow(2);
  resetModalSections();

  if (card.dataset.quizSelector === 'true' && psmQuizVersionSection) {
    psmQuizVersionSection.classList.remove('hidden');
  }

  const paid = isPaidPlan();
  psmOptions.forEach((btn) => {
    btn.querySelectorAll('.psm-lock-badge').forEach((el) => el.remove());
    const style = btn.dataset.style;
    if (!paid && (style === 'multiplayer' || style === 'tournament')) {
      const badge = document.createElement('span');
      badge.className = 'psm-lock-badge';
      badge.style.cssText = 'position:absolute;top:8px;right:8px;font-size:0.65rem;background:rgba(139,92,246,0.25);color:#c084fc;border:1px solid rgba(139,92,246,0.4);border-radius:4px;padding:2px 6px;pointer-events:none;';
      badge.textContent = style === 'tournament' ? '🔒 PREMIUM' : '🔒 ELITE';
      btn.style.position = 'relative';
      btn.appendChild(badge);
    }
  });

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
    .map((i) => i.value.trim())
    .filter(Boolean);
}

function updateLaunchBtn() {
  const names = getPlayerNames();
  psmLaunch.disabled = names.length < 2;
}

psmOptions.forEach((btn) => {
  btn.addEventListener('click', () => {
    const style = btn.dataset.style;

    if ((style === 'multiplayer' || style === 'tournament') && !isPaidPlan()) {
      const planName = getPlanLabelForRole(style);
      const upgradeUrl = getUpgradeUrlForRole();
      const go = window.confirm(
        `🔒 ${style.charAt(0).toUpperCase() + style.slice(1)} mode is available on paid plans.\n\nUpgrade to ${planName} (from R90/mo) to unlock multiplayer & tournament play.\n\nClick OK to view plans.`
      );
      if (go) window.location.href = upgradeUrl;
      return;
    }

    psmOptions.forEach((o) => o.classList.remove('active'));
    btn.classList.add('active');
    selectedStyle = btn.dataset.style;

    resetModalSections({ resetQuizVersion: false });
    if (selectedStyle === 'solo') {
      psmLaunchSolo.classList.remove('hidden');
    } else {
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
  const activeQuizCard =
    (pendingCard?.dataset.quizSelector === 'true' && pendingCard) ||
    document.querySelector('.game-card.selected[data-quiz-selector="true"]');
  const quizVersionFromDom = document.querySelector('[data-quiz-version].active')?.dataset.quizVersion || '';
  const resolvedQuizVersion = selectedQuizVersion || quizVersionFromDom;

  if (activeQuizCard && !resolvedQuizVersion) {
    window.alert('Please choose Quiz version: 2D or 3D.');
    return;
  }

  let hrefToLaunch = pendingHref;
  if (activeQuizCard) {
    hrefToLaunch = resolvedQuizVersion === '3d'
      ? activeQuizCard.getAttribute('data-href-3d')
      : activeQuizCard.getAttribute('data-href-2d');
  }

  if (!hrefToLaunch || hrefToLaunch === '#') {
    window.alert('Unable to launch this game right now.');
    return;
  }

  const inferredCount = getRequestedQuestionCountForLaunch();
  if (inferredCount >= 5) {
    hrefToLaunch = appendCountToHref(hrefToLaunch, inferredCount);
  }

  const players = selectedStyle === 'solo' ? ['Solo Player'] : getPlayerNames();
  localStorage.setItem(PLAY_STYLE_KEY, selectedStyle);
  localStorage.setItem(PLAY_PLAYERS_KEY, JSON.stringify(players));
  localStorage.setItem('slidePlayDeviceMode', selectedDevice || 'same');
  window.location.href = hrefToLaunch;
}

psmLaunch.addEventListener('click', launchGame);
psmLaunchSolo.addEventListener('click', () => {
  selectedDevice = 'same';
  launchGame();
});
psmLaunchRoom.addEventListener('click', launchGame);

psmDeviceOptions.forEach((btn) => {
  btn.addEventListener('click', () => {
    psmDeviceOptions.forEach((o) => o.classList.remove('active'));
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

psmCopyCode.addEventListener('click', () => {
  navigator.clipboard.writeText(psmRoomCode.textContent).then(() => {
    psmCopyCode.textContent = '✅';
    setTimeout(() => {
      psmCopyCode.textContent = '📋';
    }, 1500);
  });
});

function getRequestedQuestionCountForLaunch() {
  const quizLen = Number(Array.isArray(generatedQuiz) ? generatedQuiz.length : 0);
  if (quizLen >= 5) {
    return Math.max(5, Math.min(40, quizLen));
  }

  const stored2d = Number.parseInt(localStorage.getItem(JEOPARDY_COUNT_KEY) || '', 10);
  if (Number.isFinite(stored2d)) {
    return Math.max(5, Math.min(40, stored2d));
  }

  const stored3d = Number.parseInt(localStorage.getItem(JEOPARDY_3D_COUNT_KEY) || '', 10);
  if (Number.isFinite(stored3d)) {
    return Math.max(5, Math.min(40, stored3d));
  }

  return 0;
}

function appendCountToHref(href, count) {
  try {
    const target = new URL(href, window.location.href);
    if (!target.searchParams.get('count')) {
      target.searchParams.set('count', String(count));
    }
    return target.pathname + target.search + target.hash;
  } catch (_error) {
    return href;
  }
}

function enableGuestLibraryMode() {
  localStorage.setItem('sp_guest_mode', 'true');
  localStorage.removeItem('sp_auth_token');
  localStorage.removeItem('sp_user_uid');
  localStorage.removeItem('sp_user_email');
  localStorage.setItem('sp_user_role', 'guest');
  localStorage.setItem('sp_user_displayName', 'Guest');

  window.alert('Guest mode enabled. You can keep playing without signing in.');
}

document.getElementById('libraryGuestBtn')?.addEventListener('click', enableGuestLibraryMode);

psmQuizVersionOptions.forEach((btn) => {
  btn.addEventListener('click', () => {
    psmQuizVersionOptions.forEach((o) => o.classList.remove('active'));
    btn.classList.add('active');
    selectedQuizVersion = btn.dataset.quizVersion;
  });
});

psmClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

document.querySelectorAll('.game-card[data-available]').forEach((card) => {
  card.addEventListener('click', (e) => {
    e.preventDefault();

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

    openModal(card);
  });
});
