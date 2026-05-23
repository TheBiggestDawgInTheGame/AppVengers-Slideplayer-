/**
 * p2p-session.js  —  Peer-to-peer session layer using Trystero (WebRTC via BitTorrent trackers)
 *
 * Drop-in companion to firebase-session.js for cross-location play WITHOUT a server.
 * Uses Trystero to open direct WebRTC channels, routed through public BitTorrent trackers
 * (no accounts, no server, completely free).
 *
 * CDN dependency — add BEFORE this script in your HTML:
 *   <script type="module" src="https://cdn.jsdelivr.net/npm/trystero@0.21.1/torrent.js"></script>
 *
 * Or with importmap (recommended for plain HTML pages):
 *   <script type="importmap">
 *     { "imports": { "trystero/torrent": "https://cdn.jsdelivr.net/npm/trystero@0.21.1/torrent.js" } }
 *   </script>
 *
 * Usage:
 *   const sess = await P2PSession.hostSession(code, opts);   // teacher
 *   const sess = await P2PSession.joinSession(code, name);   // student
 *   P2PSession.listenSession(code, callback);                 // both
 *
 * NOTE: The host (teacher) device must remain open — there is no persistent database.
 *       For truly offline same-location use only. For cross-location with persistence, use firebase-session.js.
 */

(function () {
  "use strict";

  const APP_ID = "slideplayer-p2p-v1";

  // ── Internal state ────────────────────────────────────────────
  let _room = null;
  let _role = null;         // "host" | "peer"
  let _localSession = null; // host's session copy
  let _listeners = [];      // callbacks registered via listenSession

  // Trystero actions (set after room join)
  let _sendQuestion = null;
  let _getQuestion  = null;
  let _sendAnswer   = null;
  let _getAnswer    = null;
  let _sendState    = null;
  let _getState     = null;
  let _sendJoin     = null;
  let _getJoin      = null;

  // ── Load Trystero dynamically ─────────────────────────────────
  async function loadTrystero() {
    if (window._trysteroLoaded) return window._trysteroJoinRoom;

    return new Promise((resolve, reject) => {
      // Try to import as ES module
      const script = document.createElement("script");
      script.type = "module";
      script.textContent = `
        import { joinRoom } from "https://cdn.jsdelivr.net/npm/trystero@0.21.1/torrent.js";
        window._trysteroJoinRoom = joinRoom;
        window._trysteroLoaded = true;
        window.dispatchEvent(new Event("trysteroReady"));
      `;
      document.head.appendChild(script);

      window.addEventListener("trysteroReady", () => resolve(window._trysteroJoinRoom), { once: true });
      setTimeout(() => reject(new Error("Trystero failed to load within 10s")), 10000);
    });
  }

  // ── Broadcast local session to all peers ─────────────────────
  function broadcastState() {
    if (_sendState && _localSession) {
      _sendState(_localSession);
    }
    _notifyListeners(_localSession);
  }

  function _notifyListeners(data) {
    _listeners.forEach(fn => { try { fn(data); } catch (_) {} });
  }

  // ── Public API ────────────────────────────────────────────────
  const P2PSession = {

    /**
     * HOST (teacher): create a P2P session room.
     * opts: { host, game, mode, difficulty, timePerQ, questionType, shuffle, showTimer, questionCount }
     */
    async hostSession(code, opts = {}) {
      const joinRoom = await loadTrystero();

      _room = joinRoom({ appId: APP_ID }, code);
      _role = "host";

      // Generate questions (reuse firebase-session.js helper if available, else inline)
      const questions = window.SessionDB
        ? SessionDB.generateQuestions(opts.questionCount || 10)
        : _generateQuestions(opts.questionCount || 10);

      _localSession = {
        code,
        status: "waiting",
        name: opts.host || "Session",
        game: opts.game || "quiz",
        mode: opts.mode || "individual",
        settings: {
          difficulty:   opts.difficulty || "easy",
          timePerQ:     opts.timePerQ   || 20,
          questionType: opts.questionType || "mixed",
          shuffle:      opts.shuffle   || false,
          showTimer:    opts.showTimer !== false,
        },
        questions,
        currentQuestion: -1,
        questionStartedAt: null,
        players: {},
        createdAt: Date.now(),
      };

      // Wire up actions
      [_sendQuestion, _getQuestion] = _room.makeAction("question");
      [_sendAnswer,   _getAnswer]   = _room.makeAction("answer");
      [_sendState,    _getState]    = _room.makeAction("state");
      [_sendJoin,     _getJoin]     = _room.makeAction("join");

      // Handle incoming player joins
      _getJoin((data, peerId) => {
        const playerKey = peerId;
        _localSession.players[playerKey] = {
          name: data.name || "Student",
          score: 0,
          answers: {},
          answeredAt: {},
          joinedAt: Date.now(),
        };
        broadcastState();
      });

      // Handle incoming answers
      _getAnswer((data, peerId) => {
        const p = _localSession.players[peerId];
        if (!p) return;
        const qIdx = data.questionIndex;
        p.answers[qIdx]     = data.answerIndex;
        p.answeredAt[qIdx]  = Date.now();
        if (data.correct) p.score = (p.score || 0) + (data.pointsEarned || 0);
        broadcastState();
      });

      // Send current state to newly connected peers
      _room.onPeerJoin(peerId => {
        if (_sendState) _sendState(_localSession, [peerId]);
      });

      broadcastState();
      return _localSession;
    },

    /**
     * PEER (student): join a P2P session room.
     * Returns { playerKey, session } — session may be null until host sends state.
     */
    async joinSession(code, playerName) {
      const joinRoom = await loadTrystero();

      _room = joinRoom({ appId: APP_ID }, code);
      _role = "peer";

      [_sendQuestion, _getQuestion] = _room.makeAction("question");
      [_sendAnswer,   _getAnswer]   = _room.makeAction("answer");
      [_sendState,    _getState]    = _room.makeAction("state");
      [_sendJoin,     _getJoin]     = _room.makeAction("join");

      // Listen for state updates from host
      _getState((data) => {
        _localSession = data;
        _notifyListeners(_localSession);
      });

      // Wait until we have at least one peer (the host) then send join
      await new Promise(resolve => {
        _room.onPeerJoin(() => resolve());
        setTimeout(resolve, 5000); // don't wait forever
      });

      const playerKey = _room.selfId || ("student-" + Math.random().toString(36).slice(2, 8));
      _sendJoin({ name: playerName });

      return { playerKey, session: _localSession };
    },

    /** Listen for session updates (works for both host and peer) */
    listenSession(code, callback) {
      _listeners.push(callback);
      // Immediately notify with current state if available
      if (_localSession) { try { callback(_localSession); } catch (_) {} }
      return {
        stop() {
          _listeners = _listeners.filter(fn => fn !== callback);
        }
      };
    },

    /** HOST: mark session active, go to first question */
    startGame(code) {
      if (_role !== "host" || !_localSession) return;
      _localSession.status          = "active";
      _localSession.currentQuestion = 0;
      _localSession.questionStartedAt = Date.now();
      broadcastState();
    },

    /** HOST: advance to next question */
    nextQuestion(code, index) {
      if (_role !== "host" || !_localSession) return;
      _localSession.currentQuestion  = index;
      _localSession.questionStartedAt = Date.now();
      broadcastState();
    },

    /** HOST: end the game */
    endGame(code) {
      if (_role !== "host" || !_localSession) return;
      _localSession.status = "finished";
      broadcastState();
    },

    /** PEER: submit an answer */
    submitAnswer(code, playerKey, questionIndex, answerIndex, correct, pointsEarned) {
      if (_role !== "peer") return;
      if (_sendAnswer) {
        _sendAnswer({ questionIndex, answerIndex, correct, pointsEarned });
      }
    },

    /** Disconnect from the room */
    disconnect() {
      if (_room) {
        try { _room.leave?.(); } catch (_) {}
        _room = null;
      }
      _listeners = [];
      _localSession = null;
    },

    /** Same API surface as SessionDB for easy swap */
    generateQuestions: _generateQuestions,
  };

  // ── Inline question fallback (if firebase-session.js not loaded) ─
  function _generateQuestions(count = 10) {
    const pool = [
      { text: "What is 2 + 2?",                    options: ["3","4","5","6"],            correct: 1 },
      { text: "What color is the sky?",             options: ["Green","Blue","Red","Yellow"], correct: 1 },
      { text: "What is the capital of France?",     options: ["Berlin","Madrid","Paris","Rome"], correct: 2 },
      { text: "Which planet is largest?",           options: ["Earth","Saturn","Jupiter","Neptune"], correct: 2 },
      { text: "How many sides does a triangle have?", options: ["2","3","4","5"],          correct: 1 },
      { text: "What is 5 × 6?",                    options: ["25","30","35","40"],         correct: 1 },
      { text: "What language do Brazilians speak?", options: ["Spanish","English","Portuguese","French"], correct: 2 },
      { text: "What is the speed of light (approx)?", options: ["300 km/s","3000 km/s","300,000 km/s","3,000,000 km/s"], correct: 2 },
      { text: "Who wrote Romeo and Juliet?",        options: ["Dickens","Shakespeare","Tolstoy","Austen"], correct: 1 },
      { text: "What is H2O?",                       options: ["Oxygen","Hydrogen","Water","Salt"], correct: 2 },
    ];
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const result = {};
    for (let i = 0; i < Math.min(count, shuffled.length); i++) result[i] = shuffled[i];
    return result;
  }

  window.P2PSession = P2PSession;
  console.log("[P2PSession] Loaded — Trystero P2P session layer ready.");
})();
