/**
 * firebase-session.js
 * SlidePlay real-time session layer using Firebase RTDB REST API + SSE.
 * No imports needed — works as a plain <script> tag.
 * Exposed on window.SessionDB
 */

(function () {
  const DB = "https://slideplayer-d024f-default-rtdb.firebaseio.com";

  // ── Low-level REST helpers ──────────────────────────────────
  async function dbGet(path) {
    const r = await fetch(`${DB}/${path}.json`);
    if (!r.ok) throw new Error("Firebase GET failed: " + r.status);
    return r.json();
  }

  async function dbSet(path, data) {
    const r = await fetch(`${DB}/${path}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error("Firebase SET failed: " + r.status);
    return r.json();
  }

  async function dbPatch(path, data) {
    const r = await fetch(`${DB}/${path}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error("Firebase PATCH failed: " + r.status);
    return r.json();
  }

  async function dbPush(path, data) {
    const r = await fetch(`${DB}/${path}.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error("Firebase PUSH failed: " + r.status);
    return r.json(); // { name: "-AutoKey" }
  }

  async function dbDelete(path) {
    await fetch(`${DB}/${path}.json`, { method: "DELETE" });
  }

  // ── Real-time listener via SSE ──────────────────────────────
  // Returns a stop() function
  function dbListen(path, callback) {
    const url = `${DB}/${path}.json?accept=text/event-stream`;
    const es = new EventSource(url);
    let cache = null;

    es.addEventListener("put", (e) => {
      const d = JSON.parse(e.data);
      if (d.path === "/") {
        cache = d.data;
      } else {
        // Apply nested path update to cache
        const parts = d.path.replace(/^\//, "").split("/");
        if (!cache) cache = {};
        let node = cache;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!node[parts[i]]) node[parts[i]] = {};
          node = node[parts[i]];
        }
        node[parts[parts.length - 1]] = d.data;
      }
      if (cache) callback({ ...cache });
    });

    es.addEventListener("patch", (e) => {
      const d = JSON.parse(e.data);
      if (d.path === "/" && d.data) {
        cache = Object.assign({}, cache, d.data);
        callback({ ...cache });
      }
    });

    es.onerror = () => {
      // Reconnect on error — EventSource handles this automatically
    };

    return { stop: () => es.close() };
  }

  // ── Fake question bank (until real AI is connected) ─────────
  const QUESTION_POOL = [
    { text: "What is the powerhouse of the cell?", options: ["Nucleus", "Mitochondria", "Ribosome", "Golgi body"], correct: 1 },
    { text: "What does H₂O represent?", options: ["Hydrogen peroxide", "Hydrochloric acid", "Water", "Hydroxide"], correct: 2 },
    { text: "How many bones are in the adult human body?", options: ["186", "206", "226", "246"], correct: 1 },
    { text: "What planet is closest to the Sun?", options: ["Venus", "Earth", "Mercury", "Mars"], correct: 2 },
    { text: "What is the speed of light (approx)?", options: ["300,000 km/s", "150,000 km/s", "500,000 km/s", "1,000 km/s"], correct: 0 },
    { text: "What gas do plants absorb from the air?", options: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"], correct: 2 },
    { text: "How many continents are there?", options: ["5", "6", "7", "8"], correct: 2 },
    { text: "What is the chemical symbol for Gold?", options: ["Go", "Gd", "Au", "Ag"], correct: 2 },
    { text: "What is 15 × 15?", options: ["200", "215", "225", "235"], correct: 2 },
    { text: "Who wrote Romeo and Juliet?", options: ["Dickens", "Shakespeare", "Hemingway", "Twain"], correct: 1 },
    { text: "What is the largest ocean?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], correct: 3 },
    { text: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], correct: 1 },
    { text: "What is the capital of France?", options: ["Berlin", "Madrid", "Paris", "Rome"], correct: 2 },
    { text: "What is the boiling point of water in Celsius?", options: ["90°C", "95°C", "100°C", "110°C"], correct: 2 },
    { text: "What force keeps planets in orbit?", options: ["Magnetic", "Nuclear", "Gravity", "Friction"], correct: 2 },
  ];

  function generateQuestions(count = 10) {
    const shuffled = [...QUESTION_POOL].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  // ── Session API ─────────────────────────────────────────────

  async function createSession(code, opts = {}) {
    // Use caller-supplied questions (from AI) or fall back to built-in pool
    const questions = (Array.isArray(opts.questions) && opts.questions.length > 0)
      ? opts.questions
      : generateQuestions(opts.questionCount || 10);
    const session = {
      code,
      status: "waiting",
      host: opts.host || "Teacher",
      game: opts.game || "quiz",
      mode: opts.mode || "individual",
      settings: {
        difficulty: opts.difficulty || "easy",
        timePerQ: opts.timePerQ || 20,
        questionType: opts.questionType || "mixed",
        shuffle: opts.shuffle || false,
        showTimer: opts.showTimer !== false
      },
      questions,
      currentQuestion: -1,
      questionStartedAt: null,
      createdAt: Date.now()
    };
    await dbSet(`sessions/${code}`, session);
    return session;
  }

  async function getSession(code) {
    const s = await dbGet(`sessions/${code}`);
    return s; // null if not found
  }

  async function joinSession(code, playerName) {
    const session = await getSession(code);
    if (!session) throw new Error("Session not found. Check your code.");
    if (session.status === "finished") throw new Error("This session has already ended.");
    const playerKey = Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    await dbSet(`sessions/${code}/players/${playerKey}`, {
      name: playerName,
      score: 0,
      answers: {},
      answeredAt: {},
      joinedAt: Date.now()
    });
    return { playerKey, session };
  }

  async function startGame(code) {
    await dbPatch(`sessions/${code}`, {
      status: "active",
      currentQuestion: 0,
      questionStartedAt: Date.now()
    });
  }

  async function nextQuestion(code, index) {
    await dbPatch(`sessions/${code}`, {
      currentQuestion: index,
      questionStartedAt: Date.now()
    });
  }

  async function endGame(code) {
    await dbPatch(`sessions/${code}`, { status: "finished" });
  }

  async function submitAnswer(code, playerKey, questionIndex, answerIndex, correct, pointsEarned) {
    const updates = {};
    updates[`answers/${questionIndex}`] = answerIndex;
    updates[`answeredAt/${questionIndex}`] = Date.now();
    if (correct) {
      // Fetch current score first, then add points
      const current = await dbGet(`sessions/${code}/players/${playerKey}/score`);
      updates.score = (current || 0) + pointsEarned;
    }
    await dbPatch(`sessions/${code}/players/${playerKey}`, updates);
  }

  function listenSession(code, callback) {
    return dbListen(`sessions/${code}`, callback);
  }

  async function deleteSession(code) {
    await dbDelete(`sessions/${code}`);
  }

  // ── Expose on window ────────────────────────────────────────
  window.SessionDB = {
    createSession,
    getSession,
    joinSession,
    startGame,
    nextQuestion,
    endGame,
    submitAnswer,
    listenSession,
    deleteSession,
    generateQuestions
  };

})();
