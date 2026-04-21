const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const workspaceDir = path.join(__dirname, '..');
const uploadDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const allowedExtensions = new Set(['.pdf', '.ppt', '.pptx', '.txt', '.md', '.doc', '.docx']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.has(ext)) {
    cb(new Error('Unsupported file type. Allowed: PDF, PPT/PPTX, TXT, MD, DOC/DOCX'));
    return;
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 20
  }
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  if (origin && /^http:\/\/localhost:\d+$/.test(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.static(workspaceDir));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/slide_upload', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/games', (_req, res) => {
  res.sendFile(path.join(__dirname, 'games.html'));
});

app.get('/quiz_game', (_req, res) => {
  res.sendFile(path.join(workspaceDir, 'quiz_game', 'index.html'));
});

function getOriginalName(file) {
  return String(file?.originalname || file?.originalName || 'upload.txt');
}

function getFilePath(file) {
  return typeof file?.path === 'string' ? file.path : '';
}

function readTextFromFile(file) {
  const originalName = getOriginalName(file);
  const ext = path.extname(originalName).toLowerCase();
  if (ext !== '.txt' && ext !== '.md') {
    return '';
  }

  try {
    const filePath = getFilePath(file);
    if (!filePath) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch (_error) {
    return '';
  }
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 5);
}

function pickFallbackWrongOptions(correct, pool) {
  const wrong = [];
  for (const candidate of pool) {
    if (candidate !== correct && !wrong.includes(candidate)) {
      wrong.push(candidate);
    }
    if (wrong.length === 3) break;
  }

  const generic = ['context', 'framework', 'analysis', 'concept', 'overview', 'structure'];
  for (const candidate of generic) {
    if (candidate !== correct && !wrong.includes(candidate)) {
      wrong.push(candidate);
    }
    if (wrong.length === 3) break;
  }

  return wrong.slice(0, 3);
}

function generateQuestionFromSentence(sentence, keywordPool) {
  const clean = sentence.replace(/\s+/g, ' ').trim();
  if (clean.length < 40 || clean.length > 220) {
    return null;
  }

  const words = tokenize(clean);
  const unique = [...new Set(words)];
  if (unique.length < 4) {
    return null;
  }

  const correct = unique[0];
  const wrongOptions = pickFallbackWrongOptions(correct, keywordPool);
  if (wrongOptions.length < 3) {
    return null;
  }

  const masked = clean.replace(new RegExp(`\\b${correct}\\b`, 'i'), '_____');
  const options = [correct, ...wrongOptions].map((opt) => {
    return opt.charAt(0).toUpperCase() + opt.slice(1);
  });

  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  return {
    question: `Which word best completes this statement? ${masked}`,
    options,
    correct: options.findIndex((opt) => opt.toLowerCase() === correct)
  };
}

function generateFilenameQuestions(files) {
  return files.slice(0, 8).map((file) => {
    const originalName = getOriginalName(file);
    const ext = path.extname(originalName).slice(1).toLowerCase() || 'file';
    const cleanName = path.basename(originalName, path.extname(originalName));
    const options = ['PDF', 'PPTX', 'DOCX', 'TXT'];
    const upperExt = ext.toUpperCase();

    if (!options.includes(upperExt)) {
      options[3] = upperExt;
    }

    const correct = options.indexOf(upperExt);
    const safeCorrect = correct >= 0 ? correct : 3;

    return {
      question: `What is the file type of "${cleanName}"?`,
      options,
      correct: safeCorrect
    };
  });
}

function generateQuizData(files) {
  const combinedText = files
    .map((file) => readTextFromFile(file))
    .filter(Boolean)
    .join('\n');

  if (!combinedText.trim()) {
    return generateFilenameQuestions(files);
  }

  const sentences = combinedText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const keywordPool = [...new Set(tokenize(combinedText))];
  const generated = [];

  for (const sentence of sentences) {
    const q = generateQuestionFromSentence(sentence, keywordPool);
    if (q) {
      generated.push(q);
    }
    if (generated.length >= 12) break;
  }

  if (generated.length >= 4) {
    return generated;
  }

  return [...generated, ...generateFilenameQuestions(files)].slice(0, 10);
}

app.post('/api/upload', (req, res) => {
  upload.array('slides', 20)(req, res, (err) => {
    if (err) {
      res.status(400).json({ message: err.message || 'Upload failed.' });
      return;
    }

    if (!req.files || req.files.length === 0) {
      res.status(400).json({ message: 'No files uploaded.' });
      return;
    }

    const files = req.files.map((file) => ({
      originalName: file.originalname,
      storedName: file.filename,
      size: file.size,
      path: file.path
    }));

    let quizData = [];
    try {
      quizData = generateQuizData(files);
    } catch (_error) {
      quizData = generateFilenameQuestions(files);
    }

    res.json({
      message: `${files.length} file(s) uploaded successfully.`,
      files: files.map((file) => ({
        originalName: file.originalName,
        storedName: file.storedName,
        size: file.size
      })),
      quizData
    });
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uploadDir });
});

app.listen(PORT, () => {
  console.log(`Slide upload server running on http://localhost:${PORT}`);
});
