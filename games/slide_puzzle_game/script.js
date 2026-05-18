(function () {
  const GENERATED_QUIZ_KEY = "slidePlayGeneratedQuizData";
  const UPLOADED_FILES_KEY = "slidePlayUploadedFiles";

  const LEVELS = {
    easy: { label: "Easy", pieces: 6, cols: 3, multiplier: 1.0, targetSeconds: 55 },
    medium: { label: "Medium", pieces: 9, cols: 3, multiplier: 1.35, targetSeconds: 45 },
    hard: { label: "Hard", pieces: 12, cols: 4, multiplier: 1.75, targetSeconds: 35 }
  };

  const FALLBACK = [
    "1. Identify the learning objective.",
    "2. Gather source material and references.",
    "3. Break the topic into logical sequence blocks.",
    "4. Build examples to explain each block.",
    "5. Review and refine wording for clarity.",
    "6. Deliver and assess student understanding.",
    "7. Capture learner feedback.",
    "8. Improve the lesson flow for next session.",
    "9. Publish the updated learning slide.",
    "10. Track outcomes over time.",
    "11. Reflect on weak learning points.",
    "12. Prepare extension activities.",
  ];

  class SlideFragmentService {
    static readJson(key, fallback) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "null");
        return parsed ?? fallback;
      } catch (_error) {
        return fallback;
      }
    }

    static fromUploads() {
      const files = this.readJson(UPLOADED_FILES_KEY, []);
      if (!Array.isArray(files) || files.length === 0) return [];

      const text = files
        .map((f) => {
          if (typeof f.extractedText === "string") return f.extractedText;
          if (typeof f.text === "string") return f.text;
          return "";
        })
        .join("\n");

      return this.extractFragments(text);
    }

    static improveOrderedFragments(fragments) {
      const clean = Array.isArray(fragments)
        ? fragments.map((item) => String(item || "").trim()).filter((item) => item.length > 10)
        : [];

      if (clean.length < 2) return [];

      return clean.map((fragment, index) => {
        const normalized = fragment.replace(/^[\d\).:-]+\s*/, "");
        return String(index + 1) + ". " + normalized;
      });
    }

    static fromQuiz() {
      const items = this.readJson(GENERATED_QUIZ_KEY, []);
      if (!Array.isArray(items) || items.length === 0) return [];

      return items
        .map((item, idx) => {
          const q = String(item.question || item.questionText || "").trim();
          return q.length > 12 ? String(idx + 1) + ". " + q : "";
        })
        .filter(Boolean)
        .slice(0, 12);
    }

    static extractFragments(text) {
      if (!text || typeof text !== "string") return [];

      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 14);

      const numbered = lines
        .filter((line) => /^(?:step\s*)?\d+[\).:\-]\s+/i.test(line))
        .slice(0, 16);

      if (numbered.length >= 6) {
        return this.improveOrderedFragments(numbered);
      }

      const sentences = text
        .split(/[\n.!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 18)
        .slice(0, 16)
        .map((s, idx) => String(idx + 1) + ". " + s);

      return this.improveOrderedFragments(sentences);
    }

    static getFragments() {
      const fromSlides = this.fromUploads();
      if (fromSlides.length >= 6) {
        return { source: "Extracted from uploaded slides", fragments: fromSlides };
      }

      const fromQuiz = this.fromQuiz();
      if (fromQuiz.length >= 6) {
        return { source: "Built from generated quiz content", fragments: fromQuiz };
      }

      return { source: "Using built-in demo fragments", fragments: FALLBACK };
    }
  }

  class SlidePuzzleGame {
    constructor() {
      this.slotGridEl = document.getElementById("slotGrid");
      this.piecePoolEl = document.getElementById("piecePool");
      this.feedbackEl = document.getElementById("feedbackText");
      this.sourceInfoEl = document.getElementById("sourceInfo");

      this.shuffleBtn = document.getElementById("shuffleBtn");
      this.checkBtn = document.getElementById("checkBtn");
      this.nextBtn = document.getElementById("nextBtn");
      this.levelBtns = Array.from(document.querySelectorAll(".difficulty-btn"));

      this.difficultyValueEl = document.getElementById("difficultyValue");
      this.roundValueEl = document.getElementById("roundValue");
      this.pieceCountValueEl = document.getElementById("pieceCountValue");
      this.timeValueEl = document.getElementById("timeValue");
      this.accuracyValueEl = document.getElementById("accuracyValue");
      this.roundPointsValueEl = document.getElementById("roundPointsValue");
      this.totalScoreValueEl = document.getElementById("totalScoreValue");
      this.streakValueEl = document.getElementById("streakValue");

      const data = SlideFragmentService.getFragments();
      this.source = data.source;
      this.baseFragments = data.fragments;

      this.level = "easy";
      this.round = 1;
      this.totalScore = 0;
      this.roundScore = 0;
      this.accuracy = 0;
      this.streak = 0;

      this.correctOrder = [];
      this.slots = [];
      this.pool = [];

      this.startedAt = null;
      this.clockId = null;
      this.roundLocked = false;

      this.dragPayload = null;
    }

    init() {
      this.bindEvents();
      this.sourceInfoEl.textContent = this.source + " | Fragments: " + this.baseFragments.length;
      this.startRound();
    }

    bindEvents() {
      this.shuffleBtn.addEventListener("click", () => {
        this.shufflePool();
        this.renderPool();
        this.feedbackEl.textContent = "Pieces shuffled.";
      });

      this.checkBtn.addEventListener("click", () => this.checkArrangement());
      this.nextBtn.addEventListener("click", () => {
        this.round += 1;
        this.startRound();
      });

      this.levelBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          this.level = btn.dataset.level;
          this.round = 1;
          this.totalScore = 0;
          this.streak = 0;
          this.highlightLevel();
          this.startRound();
        });
      });
    }

    getConfig() {
      return LEVELS[this.level];
    }

    highlightLevel() {
      this.levelBtns.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.level === this.level);
      });
    }

    startRound() {
      const cfg = this.getConfig();
      const count = Math.min(cfg.pieces, this.baseFragments.length);
      this.correctOrder = this.baseFragments.slice(0, count).map((text, index) => ({ id: index, text }));

      this.slots = Array(count).fill(null);
      this.pool = this.correctOrder.slice();
      this.shufflePool();

      this.roundScore = 0;
      this.accuracy = 0;
      this.roundLocked = false;
      this.nextBtn.disabled = true;
      this.feedbackEl.textContent = "Drag pieces from the shuffled pool into board slots.";

      this.slotGridEl.style.gridTemplateColumns = "repeat(" + cfg.cols + ", minmax(0, 1fr))";
      this.startedAt = Date.now();
      this.startClock();

      this.renderSlots();
      this.renderPool();
      this.updateStats();
    }

    startClock() {
      if (this.clockId) clearInterval(this.clockId);
      this.clockId = setInterval(() => this.updateTime(), 250);
      this.updateTime();
    }

    updateTime() {
      if (!this.startedAt) {
        this.timeValueEl.textContent = "00:00";
        return;
      }
      const elapsed = Math.floor((Date.now() - this.startedAt) / 1000);
      const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const ss = String(elapsed % 60).padStart(2, "0");
      this.timeValueEl.textContent = mm + ":" + ss;
    }

    shufflePool() {
      for (let i = this.pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = this.pool[i];
        this.pool[i] = this.pool[j];
        this.pool[j] = temp;
      }
    }

    renderSlots() {
      this.slotGridEl.innerHTML = this.slots.map((piece, index) => {
        const content = piece
          ? "<div class=\"puzzle-piece\" draggable=\"true\" data-origin=\"slot\" data-slot-index=\"" + index + "\" data-piece-id=\"" + piece.id + "\">" + this.escape(piece.text) + "</div>"
          : "";

        return [
          "<div class=\"slot\" data-slot-index=\"" + index + "\">",
          content,
          "</div>"
        ].join("");
      }).join("");

      this.wireSlotDnD();
    }

    renderPool() {
      this.piecePoolEl.innerHTML = this.pool.map((piece, index) => {
        return "<div class=\"puzzle-piece\" draggable=\"true\" data-origin=\"pool\" data-pool-index=\"" + index + "\" data-piece-id=\"" + piece.id + "\">" + this.escape(piece.text) + "</div>";
      }).join("");

      this.wirePoolDnD();
    }

    wirePoolDnD() {
      this.piecePoolEl.querySelectorAll(".puzzle-piece").forEach((el) => {
        el.addEventListener("dragstart", (e) => this.onDragStart(e));
        el.addEventListener("dragend", (e) => this.onDragEnd(e));
      });

      this.piecePoolEl.addEventListener("dragover", (e) => {
        e.preventDefault();
      });

      this.piecePoolEl.addEventListener("drop", (e) => {
        e.preventDefault();
        if (this.roundLocked || !this.dragPayload) return;

        if (this.dragPayload.origin === "slot") {
          const fromIndex = this.dragPayload.slotIndex;
          if (Number.isInteger(fromIndex) && this.slots[fromIndex]) {
            this.pool.push(this.slots[fromIndex]);
            this.slots[fromIndex] = null;
            this.postMoveUpdate();
          }
        }
      });
    }

    wireSlotDnD() {
      this.slotGridEl.querySelectorAll(".slot").forEach((slotEl) => {
        slotEl.addEventListener("dragover", (e) => {
          e.preventDefault();
          slotEl.classList.add("drag-over");
        });

        slotEl.addEventListener("dragleave", () => {
          slotEl.classList.remove("drag-over");
        });

        slotEl.addEventListener("drop", (e) => {
          e.preventDefault();
          slotEl.classList.remove("drag-over");
          if (this.roundLocked || !this.dragPayload) return;

          const targetIndex = Number(slotEl.dataset.slotIndex);
          if (!Number.isInteger(targetIndex)) return;

          this.placeDraggedPiece(targetIndex);
        });
      });

      this.slotGridEl.querySelectorAll(".puzzle-piece").forEach((el) => {
        el.addEventListener("dragstart", (e) => this.onDragStart(e));
        el.addEventListener("dragend", (e) => this.onDragEnd(e));
      });
    }

    onDragStart(event) {
      const pieceEl = event.target.closest(".puzzle-piece");
      if (!pieceEl || this.roundLocked) return;

      const origin = pieceEl.dataset.origin;
      if (origin === "pool") {
        this.dragPayload = {
          origin: "pool",
          poolIndex: Number(pieceEl.dataset.poolIndex),
          pieceId: Number(pieceEl.dataset.pieceId),
        };
      } else {
        this.dragPayload = {
          origin: "slot",
          slotIndex: Number(pieceEl.dataset.slotIndex),
          pieceId: Number(pieceEl.dataset.pieceId),
        };
      }

      pieceEl.classList.add("dragging");
    }

    onDragEnd(event) {
      const pieceEl = event.target.closest(".puzzle-piece");
      if (pieceEl) pieceEl.classList.remove("dragging");
      this.dragPayload = null;
      this.slotGridEl.querySelectorAll(".slot").forEach((slot) => slot.classList.remove("drag-over"));
    }

    placeDraggedPiece(targetIndex) {
      const existing = this.slots[targetIndex];
      let moving = null;

      if (this.dragPayload.origin === "pool") {
        const fromIndex = this.dragPayload.poolIndex;
        if (!Number.isInteger(fromIndex) || !this.pool[fromIndex]) return;
        moving = this.pool.splice(fromIndex, 1)[0];
      } else {
        const fromSlot = this.dragPayload.slotIndex;
        if (!Number.isInteger(fromSlot) || !this.slots[fromSlot]) return;
        moving = this.slots[fromSlot];
        this.slots[fromSlot] = null;
      }

      if (existing) {
        this.pool.push(existing);
      }

      this.slots[targetIndex] = moving;
      this.postMoveUpdate();
    }

    postMoveUpdate() {
      this.renderSlots();
      this.renderPool();
      this.applyImmediatePlacementFeedback();
    }

    applyImmediatePlacementFeedback() {
      this.slotGridEl.querySelectorAll(".slot").forEach((slotEl) => {
        slotEl.classList.remove("correct", "wrong");
        const index = Number(slotEl.dataset.slotIndex);
        const piece = this.slots[index];
        if (!piece) return;

        if (piece.id === index) {
          slotEl.classList.add("correct");
        } else {
          slotEl.classList.add("wrong");
        }
      });
    }

    checkArrangement() {
      if (this.roundLocked) return;

      const placedCount = this.slots.filter(Boolean).length;
      if (placedCount < this.slots.length) {
        this.feedbackEl.textContent = "Place all pieces before checking.";
        return;
      }

      this.roundLocked = true;
      const cfg = this.getConfig();
      const elapsed = Math.max(1, Math.floor((Date.now() - this.startedAt) / 1000));

      let correct = 0;
      this.slots.forEach((piece, idx) => {
        if (piece && piece.id === idx) {
          correct += 1;
        }
      });

      this.accuracy = Math.round((correct / this.slots.length) * 100);

      const base = correct * 120;
      const speedBonus = Math.max(0, cfg.targetSeconds - elapsed) * 2;
      const streakBonus = this.streak * 25;
      this.roundScore = Math.round((base + speedBonus + streakBonus) * cfg.multiplier);
      this.totalScore += this.roundScore;

      if (this.accuracy === 100) {
        this.streak += 1;
        this.feedbackEl.textContent = "Perfect reconstruction. Layout restored correctly.";
        this.autoIncreaseDifficulty();
      } else {
        this.streak = 0;
        this.feedbackEl.textContent = "Good attempt. Red slots are misplaced pieces.";
      }

      this.nextBtn.disabled = false;
      this.updateStats();
      this.applyImmediatePlacementFeedback();

      if (window.GameModes && typeof window.GameModes.roundEnd === "function") {
        window.GameModes.roundEnd(this.roundScore);
      }

      if (window.StudyAdventure) {
        if (this.accuracy >= 80) {
          window.StudyAdventure.recordSuccess({
            points: Math.max(1, Math.round(this.roundScore / 140)),
            message: "High-accuracy puzzle solve with " + this.accuracy + "% placement precision."
          });
        } else {
          window.StudyAdventure.recordSetback({
            message: "Puzzle arrangement showed weakness in placement accuracy."
          });
        }
        window.StudyAdventure.endSession(this.roundScore);
      }
    }

    autoIncreaseDifficulty() {
      if (this.level === "easy") this.level = "medium";
      else if (this.level === "medium") this.level = "hard";
      this.highlightLevel();
    }

    updateStats() {
      const cfg = this.getConfig();
      this.difficultyValueEl.textContent = cfg.label;
      this.roundValueEl.textContent = String(this.round);
      this.pieceCountValueEl.textContent = String(this.slots.length);
      this.accuracyValueEl.textContent = String(this.accuracy) + "%";
      this.roundPointsValueEl.textContent = String(this.roundScore);
      this.totalScoreValueEl.textContent = String(this.totalScore);
      this.streakValueEl.textContent = String(this.streak);
      this.updateTime();
    }

    escape(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
  }

  const puzzle = new SlidePuzzleGame();

  window.addEventListener("load", () => {
    puzzle.init();

    if (window.StudyAdventure) {
      window.StudyAdventure.startSession("slide_puzzle_game", "Slide Puzzle Reconstruction");
      window.StudyAdventure.pushHint("Use transition words and sequence cues to identify the correct layout order.");
    }
  });

  if (window.GameModes) {
    window.GameModes.init({
      gameLabel: "Slide Puzzle",
      startFn: () => {
        puzzle.startRound();
      },
      resetFn: () => {
        puzzle.level = "easy";
        puzzle.round = 1;
        puzzle.totalScore = 0;
        puzzle.roundScore = 0;
        puzzle.accuracy = 0;
        puzzle.streak = 0;
        puzzle.highlightLevel();
        puzzle.startRound();
      },
      getScore: () => puzzle.totalScore
    });
  }
})();
