require('dotenv').config();
const http    = require('http');
const express = require('express');
const multer  = require('multer');
const fs      = require('fs');
const path    = require('path');
const { Server } = require('socket.io');

const HUGGING_FACE_API_KEY = process.env.HUGGING_FACE_API_KEY || process.env.HF_API_TOKEN || '';
const HUGGING_FACE_MODEL = process.env.HUGGING_FACE_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3';
const HUGGING_FACE_API_URL = `https://api-inference.huggingface.co/models/${HUGGING_FACE_MODEL}`;

const app        = express();
const httpServer = http.createServer(app);
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
  res.redirect('/games');
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

async function extractTextFromPdf(filePath) {
  try {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return (data.text || '').replace(/\s+/g, ' ').trim();
  } catch (err) {
    console.warn('PDF extraction failed:', err.message);
    return '';
  }
}

async function extractTextFromDocx(filePath) {
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || '';
  } catch (err) {
    console.warn('DOCX extraction failed:', err.message);
    return '';
  }
}

function extractTextFromPptx(filePath) {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(filePath);
    const slideEntries = zip.getEntries()
      .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
      .sort((a, b) => a.entryName.localeCompare(b.entryName));
    return slideEntries.map((entry) => {
      const xml = entry.getData().toString('utf8');
      const matches = xml.match(/<a:t[^>]*?>([^<]+)<\/a:t>/g) || [];
      return matches.map((m) => m.replace(/<[^>]*?>/g, '').trim()).filter(Boolean).join(' ');
    }).filter(Boolean).join('\n');
  } catch (err) {
    console.warn('PPTX extraction failed:', err.message);
    return '';
  }
}

async function extractAllText(file) {
  const originalName = getOriginalName(file);
  const ext = path.extname(originalName).toLowerCase();
  const filePath = getFilePath(file);
  if (!filePath) return '';
  switch (ext) {
    case '.txt':
    case '.md':
      return readTextFromFile(file);
    case '.pdf':
      return extractTextFromPdf(filePath);
    case '.docx':
    case '.doc':
      return extractTextFromDocx(filePath);
    case '.pptx':
    case '.ppt':
      return extractTextFromPptx(filePath);
    default:
      return '';
  }
}

async function generateQuizWithHuggingFace(combinedText, targetCount) {
  const MAX_CHARS = 50000;
  const text = combinedText.length > MAX_CHARS
    ? combinedText.slice(0, MAX_CHARS) + '\n[Content truncated - first 50,000 characters used]'
    : combinedText;

  const count = Math.min(Math.max(targetCount, 5), 15);

  const prompt = `You are an expert educator. Read the following content from student slides and generate exactly ${count} multiple-choice quiz questions that test genuine understanding of the material. Questions must be specific to concepts, facts, or ideas found in the content.

Rules:
- Each question must have exactly 4 answer options
- Only one option is correct; the other three are plausible but clearly wrong to someone who studied the content
- Cover different concepts spread throughout the material
- Do NOT ask about file names, formatting, or meta information about the slides themselves
- Questions should range from factual recall to application of concepts

Return ONLY a valid JSON array with no markdown, no code blocks, and no explanation text:
[{"question":"...","options":["...","...","...","..."],"correct":0}]

The "correct" field is the 0-based index of the correct option in the options array.

Slide content:
${text}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  let response;
  try {
    response = await fetch(HUGGING_FACE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HUGGING_FACE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 1400,
          temperature: 0.2,
          return_full_text: false
        },
        options: {
          wait_for_model: true,
          use_cache: false
        }
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Hugging Face API error (${response.status}): ${errText.slice(0, 180)}`);
  }

  const payload = await response.json();
  const responseText = Array.isArray(payload)
    ? String(payload[0]?.generated_text || '')
    : String(payload?.generated_text || payload?.error || '');

  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Hugging Face response contained no JSON array');

  const parsed = JSON.parse(jsonMatch[0]);
  const valid = parsed.filter(
    (q) =>
      q &&
      typeof q.question === 'string' &&
      q.question.length > 10 &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      typeof q.correct === 'number' &&
      q.correct >= 0 &&
      q.correct <= 3
  );

  if (valid.length < 3) throw new Error(`Only ${valid.length} valid questions returned by Hugging Face`);
  return valid;
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
  upload.array('slides', 20)(req, res, async (err) => {
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
    let aiGenerated = false;

    try {
      const textResults = await Promise.all(files.map(extractAllText));
      const combinedText = textResults.filter(Boolean).join('\n\n---\n\n');

      if (combinedText.trim() && HUGGING_FACE_API_KEY) {
        try {
          const hfQuiz = await generateQuizWithHuggingFace(combinedText, 8);
          if (hfQuiz && hfQuiz.length >= 3) {
            quizData = hfQuiz;
            aiGenerated = true;
          }
        } catch (hfErr) {
          console.warn('Hugging Face quiz generation failed, using fallback:', hfErr.message);
        }
      }

      if (quizData.length < 3) {
        quizData = generateQuizData(files);
      }
    } catch (extractErr) {
      console.warn('Text extraction error, using fallback:', extractErr.message);
      quizData = generateFilenameQuestions(files);
    }

    res.json({
      message: aiGenerated
        ? `AI quiz generated from your slides (${files.length} file${files.length > 1 ? 's' : ''} analysed).`
        : `${files.length} file(s) uploaded successfully.`,
      files: files.map((file) => ({
        originalName: file.originalName,
        storedName: file.storedName,
        size: file.size
      })),
      quizData,
      aiGenerated
    });
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    huggingFaceEnabled: !!HUGGING_FACE_API_KEY,
    model: HUGGING_FACE_MODEL,
    version: '2.1'
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uploadDir });
});

// ── Real-time multiplayer (socket.io) ────────────────────────────────────────
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

io.on('connection', (socket) => {
  // ── Create a new room ──────────────────────────────────────────────────────
  socket.on('create-room', ({ gameLabel } = {}) => {
    let code;
    let attempts = 0;
    do { code = generateRoomCode(); attempts++; } while (rooms.has(code) && attempts < 100);
    rooms.set(code, {
      code,
      gameLabel: String(gameLabel || 'Game').slice(0, 64),
      players: [{ id: socket.id, playerIndex: 1, finalScore: null }],
      status: 'waiting',
      createdAt: Date.now()
    });
    socket.join(code);
    socket.emit('room-created', { code });
  });

  // ── Join an existing room ──────────────────────────────────────────────────
  socket.on('join-room', ({ code } = {}) => {
    const safeCode = String(code || '').trim().toUpperCase().slice(0, 4);
    const room = rooms.get(safeCode);
    if (!room) {
      socket.emit('join-error', { message: 'Room not found. Check the code and try again.' });
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('join-error', { message: 'Room is full.' });
      return;
    }
    if (room.status !== 'waiting') {
      socket.emit('join-error', { message: 'Game already started.' });
      return;
    }
    room.players.push({ id: socket.id, playerIndex: 2, finalScore: null });
    room.status = 'playing';
    socket.join(safeCode);
    // Tell P1 the opponent joined (they get playerIndex 1)
    socket.to(safeCode).emit('room-ready', { playerIndex: 1, code: safeCode });
    // Tell P2 they joined (they get playerIndex 2)
    socket.emit('room-ready', { playerIndex: 2, code: safeCode });
  });

  // ── Live score update (broadcast to opponent only) ─────────────────────────
  socket.on('score-update', ({ code, score } = {}) => {
    const safeCode = String(code || '').slice(0, 4);
    if (rooms.has(safeCode)) {
      socket.to(safeCode).emit('opponent-score', { score: Number(score) || 0 });
    }
  });

  // ── Round finished ─────────────────────────────────────────────────────────
  socket.on('round-end', ({ code, score } = {}) => {
    const safeCode = String(code || '').slice(0, 4);
    const room = rooms.get(safeCode);
    if (!room) return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;
    player.finalScore = Number(score) || 0;
    socket.to(safeCode).emit('opponent-done', { score: player.finalScore });
    if (room.players.every((p) => p.finalScore !== null)) {
      const p1 = room.players.find((p) => p.playerIndex === 1);
      const p2 = room.players.find((p) => p.playerIndex === 2);
      io.to(safeCode).emit('game-results', {
        p1: p1 ? p1.finalScore : 0,
        p2: p2 ? p2.finalScore : 0
      });
      setTimeout(() => rooms.delete(safeCode), 120000);
    }
  });

  // ── Disconnect cleanup ─────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    for (const [code, room] of rooms.entries()) {
      const idx = room.players.findIndex((p) => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        io.to(code).emit('opponent-disconnected');
        if (room.players.length === 0) rooms.delete(code);
        break;
      }
    }
  });
});

// Periodically clean up stale rooms (older than 2 hours)
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [code, room] of rooms.entries()) {
    if (room.createdAt < cutoff) rooms.delete(code);
  }
}, 30 * 60 * 1000);

httpServer.listen(PORT, () => {
  console.log(`Slide upload server running on http://localhost:${PORT}`);
  if (HUGGING_FACE_API_KEY) {
    console.log(`Hugging Face AI quiz generation: ENABLED (${HUGGING_FACE_MODEL})`);
  } else {
    console.log('Hugging Face AI quiz generation: DISABLED (set HUGGING_FACE_API_KEY in .env to enable)');
  }
});
