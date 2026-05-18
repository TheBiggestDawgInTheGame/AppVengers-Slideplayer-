(function () {
  const GENERATED_QUIZ_KEY = 'slidePlayGeneratedQuizData';
  const UPLOADED_FILES_KEY = 'slidePlayUploadedFiles';
  const ESCAPE_CLUES_KEY = 'slidePlayEscapeCluesV1';
  const useUploadedSource = new URLSearchParams(window.location.search).get('source') === 'upload';
  const AI_ENDPOINTS = [
    'http://localhost:4100/api/generate-escape-clues',
    'http://127.0.0.1:4100/api/generate-escape-clues'
  ];

  function readJsonStorage(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed ?? fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function buildLearningLines() {
    const quizData = readJsonStorage(GENERATED_QUIZ_KEY, []);
    const uploadedFiles = readJsonStorage(UPLOADED_FILES_KEY, []);
    const lines = [];

    quizData.forEach((item) => {
      if (!item || !item.question) return;
      const answer = Array.isArray(item.options) && Number.isInteger(item.correct)
        ? item.options[item.correct]
        : '';
      if (answer) {
        lines.push(item.question + ' Answer: ' + answer + '.');
      } else {
        lines.push(item.question);
      }
    });

    uploadedFiles.forEach((file) => {
      if (file && file.originalName) {
        lines.push('Source in this run: ' + file.originalName + '.');
      }
    });

    const unique = [];
    const seen = new Set();
    lines.forEach((line) => {
      const clean = String(line || '').trim();
      if (!clean || seen.has(clean)) return;
      seen.add(clean);
      unique.push(clean);
    });

    return unique;
  }

  function buildContentForAi() {
    const quizData = readJsonStorage(GENERATED_QUIZ_KEY, []);
    const uploadedFiles = readJsonStorage(UPLOADED_FILES_KEY, []);

    const chunks = [];

    uploadedFiles.forEach((file) => {
      const extracted = file && typeof file.extractedText === 'string'
        ? file.extractedText
        : (file && typeof file.text === 'string' ? file.text : '');
      if (extracted.trim()) {
        chunks.push('FILE: ' + (file.originalName || 'uploaded source'));
        chunks.push(extracted.trim());
      }
    });

    quizData.slice(0, 24).forEach((item, index) => {
      if (!item || !item.question) return;
      const answer = Array.isArray(item.options) && Number.isInteger(item.correct)
        ? item.options[item.correct]
        : '';
      chunks.push('Q' + (index + 1) + ': ' + item.question + (answer ? ' | A: ' + answer : ''));
    });

    return chunks.join('\n\n').slice(0, 12000);
  }

  function hashContent(text) {
    const src = String(text || '');
    let hash = 0;
    for (let i = 0; i < src.length; i += 1) {
      hash = ((hash << 5) - hash + src.charCodeAt(i)) | 0;
    }
    return String(hash);
  }

  function saveEscapeClues(data) {
    localStorage.setItem(ESCAPE_CLUES_KEY, JSON.stringify(data));
    window.__escapeSlideClues = data;
    window.dispatchEvent(new CustomEvent('slide-clues-ready', { detail: data }));
  }

  function buildFallbackClues(lines) {
    const short = (lines || []).slice(0, 8);
    return {
      summary: 'Use your uploaded study material as clues around the room.',
      clues: short.length > 0 ? short : [
        'The clock and board hide parts of the final keypad code.',
        'Each puzzle reveals one piece. Combine pieces to unlock the door.'
      ],
      npcHints: [
        'Mr. Nkosi: Focus on what the slides repeat most.',
        'Amahle: The board clue connects to your uploaded notes.',
        'Sipho: Solve each mini puzzle first, then combine the results.'
      ],
      source: 'fallback'
    };
  }

  async function fetchEscapeClues(content, sourceHash) {
    for (const endpoint of AI_ENDPOINTS) {
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, roomTheme: 'mzansi classroom escape' })
        });
        if (!resp.ok) continue;
        const json = await resp.json();
        return {
          summary: String(json.summary || 'Use your slide knowledge to escape.').slice(0, 220),
          clues: Array.isArray(json.clues) ? json.clues.slice(0, 10) : [],
          npcHints: Array.isArray(json.npcHints) ? json.npcHints.slice(0, 10) : [],
          source: 'ai',
          sourceHash,
          generatedAt: new Date().toISOString()
        };
      } catch (_error) {
        // try next endpoint
      }
    }
    return null;
  }

  async function ensureEscapeClues(lines) {
    const content = buildContentForAi();
    if (!content) {
      const fallback = buildFallbackClues(lines);
      saveEscapeClues(fallback);
      return fallback;
    }

    const sourceHash = hashContent(content);
    const cached = readJsonStorage(ESCAPE_CLUES_KEY, null);
    if (cached && cached.sourceHash === sourceHash && Array.isArray(cached.clues) && cached.clues.length > 0) {
      window.__escapeSlideClues = cached;
      window.dispatchEvent(new CustomEvent('slide-clues-ready', { detail: cached }));
      return cached;
    }

    const aiResult = await fetchEscapeClues(content, sourceHash);
    if (aiResult && aiResult.clues.length > 0) {
      saveEscapeClues(aiResult);
      return aiResult;
    }

    const fallback = {
      ...buildFallbackClues(lines),
      sourceHash,
      generatedAt: new Date().toISOString()
    };
    saveEscapeClues(fallback);
    return fallback;
  }

  function mountPanel(lines) {
    if (!Array.isArray(lines) || lines.length === 0) return;

    const style = document.createElement('style');
    style.textContent = [
      '#slide-learning-panel {',
      '  position: fixed;',
      '  left: 12px;',
      '  bottom: 12px;',
      '  width: min(420px, calc(100vw - 24px));',
      '  z-index: 13000;',
      '  border: 1px solid rgba(0, 217, 255, 0.42);',
      '  border-radius: 12px;',
      '  background: rgba(5, 13, 32, 0.88);',
      '  color: #dff4ff;',
      '  padding: 10px 12px;',
      '  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.36);',
      '  backdrop-filter: blur(4px);',
      '  font-family: "Share Tech Mono", monospace;',
      '}',
      '#slide-learning-panel .label {',
      '  display: block;',
      '  font-size: 11px;',
      '  letter-spacing: 0.08em;',
      '  text-transform: uppercase;',
      '  color: #72f0ff;',
      '  margin-bottom: 6px;',
      '}',
      '#slide-learning-panel .line {',
      '  margin: 0;',
      '  font-size: 13px;',
      '  line-height: 1.45;',
      '}',
      '@media (max-width: 720px) {',
      '  #slide-learning-panel {',
      '    width: calc(100vw - 16px);',
      '    left: 8px;',
      '    bottom: 8px;',
      '  }',
      '}'
    ].join('\n');

    const panel = document.createElement('section');
    panel.id = 'slide-learning-panel';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = [
      '<span class="label">Slide Study Feed</span>',
      '<p class="line" id="slide-learning-line"></p>'
    ].join('');

    document.body.appendChild(style);
    document.body.appendChild(panel);

    const lineEl = document.getElementById('slide-learning-line');
    let index = 0;

    function renderLine() {
      if (!lineEl) return;
      lineEl.textContent = lines[index];
      index = (index + 1) % lines.length;
    }

    renderLine();
    window.setInterval(renderLine, 9000);
  }

  if (!useUploadedSource) {
    return;
  }

  async function initSlideLearning() {
    const lines = buildLearningLines();
    if (lines.length > 0) {
      mountPanel(lines);
    }
    await ensureEscapeClues(lines);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSlideLearning);
  } else {
    initSlideLearning();
  }
})();
