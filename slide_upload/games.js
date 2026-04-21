const GENERATED_QUIZ_KEY = 'slidePlayGeneratedQuizData';
const UPLOADED_FILES_KEY = 'slidePlayUploadedFiles';
const DEMO_SESSION_KEY = 'slidePlayDemoSession';

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

// Card selection: clicking highlights the chosen card before navigating
document.querySelectorAll('.game-card[data-available]').forEach((card) => {
  card.addEventListener('click', () => {
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
  });
});
