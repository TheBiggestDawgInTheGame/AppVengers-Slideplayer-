(function () {
  const GENERATED_QUIZ_KEY = "slidePlayGeneratedQuizData";
  const UPLOADED_FILES_KEY = "slidePlayUploadedFiles";

  const DIFFICULTY_CONFIG = {
    easy: { label: "Easy", stepCount: 4, multiplier: 1.0, targetSeconds: 50 },
    medium: { label: "Medium", stepCount: 6, multiplier: 1.35, targetSeconds: 40 },
    hard: { label: "Hard", stepCount: 8, multiplier: 1.75, targetSeconds: 32 }
  };

  const FALLBACK_STEPS = [
    "Gather requirements from stakeholders.",
    "Define system scope and constraints.",
    "Design architecture and data flow.",
    "Implement core modules in sequence.",
    "Run integration and validation tests.",
    "Deploy to production environment.",
    "Monitor performance and collect feedback."
  ];

  class SlideSequenceExtractor {
    static readJson(key, fallback) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "null");
        return parsed ?? fallback;
      } catch (_error) {
        return fallback;
      }
    }

    static fromUploadedFiles() {
      const files = this.readJson(UPLOADED_FILES_KEY, []);
      if (!Array.isArray(files) || files.length === 0) {
        return [];
      }

      const allText = files
        .map((file) => {
          if (typeof file.extractedText === "string") return file.extractedText;
          if (typeof file.text === "string") return file.text;
          return "";
        })
        .join("\n");

      return this.extractOrderedSteps(allText);
    }

    static fromGeneratedQuiz() {
      const questions = this.readJson(GENERATED_QUIZ_KEY, []);
      if (!Array.isArray(questions) || questions.length === 0) {
        return [];
      }

      const steps = questions
        .map((item) => String(item.question || item.questionText || "").trim())
        .filter((line) => line.length > 20)
        .slice(0, 10);

      return steps;
    }

    static extractOrderedSteps(text) {
      if (!text || typeof text !== "string") {
        return [];
      }

      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const numbered = [];
      const numberedRegex = /^(?:step\s*)?(\d+)[\).:\-]\s+(.+)$/i;

      lines.forEach((line) => {
        const match = line.match(numberedRegex);
        if (match) {
          numbered.push({ order: Number(match[1]), text: match[2].trim() });
        }
      });

      if (numbered.length >= 3) {
        return numbered
          .sort((a, b) => a.order - b.order)
          .map((item) => item.text)
          .filter((step, index, arr) => arr.indexOf(step) === index);
      }

      const sentenceCandidates = text
        .split(/[\n.!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 28)
        .filter((s) => /first|next|then|after|finally|step/i.test(s));

      if (sentenceCandidates.length >= 3) {
        return sentenceCandidates.slice(0, 10);
      }

      return [];
    }

    static getBestAvailableSteps() {
      const uploadedSteps = this.fromUploadedFiles();
      if (uploadedSteps.length >= 3) {
        return { steps: uploadedSteps, source: "Extracted from uploaded slides" };
      }

      const quizSteps = this.fromGeneratedQuiz();
      if (quizSteps.length >= 3) {
        return { steps: quizSteps, source: "Built from generated quiz prompts" };
      }

      return { steps: FALLBACK_STEPS, source: "Using built-in demo workflow" };
    }
  }

  class MemoryChainGame {
    constructor() {
      this.boardEl = document.getElementById("sequenceBoard");
      this.feedbackEl = document.getElementById("feedbackText");
      this.sourceSummaryEl = document.getElementById("sourceSummary");

      this.shuffleBtn = document.getElementById("shuffleBtn");
      this.checkBtn = document.getElementById("checkBtn");
      this.nextRoundBtn = document.getElementById("nextRoundBtn");
      this.difficultyButtons = Array.from(document.querySelectorAll(".difficulty-btn"));

      this.difficultyValueEl = document.getElementById("difficultyValue");
      this.roundValueEl = document.getElementById("roundValue");
      this.timeValueEl = document.getElementById("timeValue");
      this.accuracyValueEl = document.getElementById("accuracyValue");
      this.roundPointsValueEl = document.getElementById("roundPointsValue");
      this.totalScoreValueEl = document.getElementById("totalScoreValue");
      this.streakValueEl = document.getElementById("streakValue");

      this.sourceData = SlideSequenceExtractor.getBestAvailableSteps();
      this.allSteps = this.sourceData.steps.slice();

      this.currentDifficulty = "easy";
      this.round = 1;
      this.totalScore = 0;
      this.currentRoundPoints = 0;
      this.currentAccuracy = 0;
      this.streak = 0;

      this.correctSteps = [];
      this.displayedSteps = [];
      this.roundStartedAt = null;
      this.roundSubmitted = false;

      this.dragStartIndex = null;
      this.clickSelectedIndex = null;
      this.clockInterval = null;
    }

    init() {
      this.bindEvents();
      this.sourceSummaryEl.textContent = this.sourceData.source + " | Total steps found: " + this.allSteps.length;
      this.updateStats();
      this.startRound();
    }

    bindEvents() {
      this.shuffleBtn.addEventListener("click", () => {
        this.shuffleDisplayed();
        this.renderBoard();
        this.feedbackEl.textContent = "Steps shuffled. Rebuild the sequence.";
      });

      this.checkBtn.addEventListener("click", () => this.checkSequence());
      this.nextRoundBtn.addEventListener("click", () => this.nextRound());

      this.difficultyButtons.forEach((button) => {
        button.addEventListener("click", () => {
          this.currentDifficulty = button.dataset.difficulty;
          this.round = 1;
          this.totalScore = 0;
          this.streak = 0;
          this.highlightDifficulty();
          this.startRound();
        });
      });

      this.boardEl.addEventListener("dragstart", (event) => this.onDragStart(event));
      this.boardEl.addEventListener("dragover", (event) => this.onDragOver(event));
      this.boardEl.addEventListener("drop", (event) => this.onDrop(event));
      this.boardEl.addEventListener("dragend", () => this.onDragEnd());
      this.boardEl.addEventListener("click", (event) => this.onCardClick(event));
    }

    getConfig() {
      return DIFFICULTY_CONFIG[this.currentDifficulty];
    }

    highlightDifficulty() {
      this.difficultyButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.difficulty === this.currentDifficulty);
      });
    }

    startRound() {
      const config = this.getConfig();
      const stepCount = Math.min(config.stepCount, this.allSteps.length);

      this.correctSteps = this.allSteps.slice(0, stepCount).map((text, index) => ({ id: index, text }));
      this.displayedSteps = this.correctSteps.slice();
      this.shuffleDisplayed();

      this.currentRoundPoints = 0;
      this.currentAccuracy = 0;
      this.roundSubmitted = false;
      this.clickSelectedIndex = null;
      this.feedbackEl.textContent = "Drag or click cards to arrange the steps, then check your sequence.";

      this.roundStartedAt = Date.now();
      this.startClock();
      this.nextRoundBtn.disabled = true;

      this.renderBoard();
      this.updateStats();
    }

    startClock() {
      if (this.clockInterval) {
        clearInterval(this.clockInterval);
      }
      this.clockInterval = setInterval(() => this.updateTimeDisplay(), 250);
      this.updateTimeDisplay();
    }

    updateTimeDisplay() {
      if (!this.roundStartedAt) {
        this.timeValueEl.textContent = "00:00";
        return;
      }

      const elapsedSeconds = Math.floor((Date.now() - this.roundStartedAt) / 1000);
      const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
      const seconds = String(elapsedSeconds % 60).padStart(2, "0");
      this.timeValueEl.textContent = minutes + ":" + seconds;
    }

    shuffleDisplayed() {
      for (let i = this.displayedSteps.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = this.displayedSteps[i];
        this.displayedSteps[i] = this.displayedSteps[j];
        this.displayedSteps[j] = temp;
      }
    }

    renderBoard() {
      this.boardEl.innerHTML = this.displayedSteps
        .map((step, index) => {
          const label = index + 1;
          return [
            "<li class=\"sequence-card\" draggable=\"true\" data-index=\"" + index + "\">",
            "<span class=\"sequence-index\">" + label + "</span>",
            "<span class=\"sequence-text\">" + this.escapeHtml(step.text) + "</span>",
            "</li>"
          ].join("");
        })
        .join("");
    }

    onDragStart(event) {
      const card = event.target.closest(".sequence-card");
      if (!card || this.roundSubmitted) return;

      this.dragStartIndex = Number(card.dataset.index);
      card.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
    }

    onDragOver(event) {
      event.preventDefault();
      const card = event.target.closest(".sequence-card");
      if (!card || this.roundSubmitted) return;

      this.clearDropTargets();
      card.classList.add("drop-target");
    }

    onDrop(event) {
      event.preventDefault();
      const card = event.target.closest(".sequence-card");
      if (!card || this.roundSubmitted) return;

      const dropIndex = Number(card.dataset.index);
      if (!Number.isInteger(this.dragStartIndex) || this.dragStartIndex === dropIndex) {
        this.onDragEnd();
        return;
      }

      const moved = this.displayedSteps.splice(this.dragStartIndex, 1)[0];
      this.displayedSteps.splice(dropIndex, 0, moved);

      this.onDragEnd();
      this.renderBoard();
    }

    onDragEnd() {
      this.dragStartIndex = null;
      this.clearDropTargets();
      this.boardEl.querySelectorAll(".sequence-card.dragging").forEach((el) => {
        el.classList.remove("dragging");
      });
    }

    clearDropTargets() {
      this.boardEl.querySelectorAll(".sequence-card.drop-target").forEach((el) => {
        el.classList.remove("drop-target");
      });
    }

    onCardClick(event) {
      const card = event.target.closest(".sequence-card");
      if (!card || this.roundSubmitted) return;

      const clickedIndex = Number(card.dataset.index);
      if (!Number.isInteger(clickedIndex)) return;

      if (this.clickSelectedIndex === null) {
        this.clickSelectedIndex = clickedIndex;
        this.renderClickSelection();
        return;
      }

      if (this.clickSelectedIndex === clickedIndex) {
        this.clickSelectedIndex = null;
        this.renderClickSelection();
        return;
      }

      const first = this.displayedSteps[this.clickSelectedIndex];
      this.displayedSteps[this.clickSelectedIndex] = this.displayedSteps[clickedIndex];
      this.displayedSteps[clickedIndex] = first;

      this.clickSelectedIndex = null;
      this.renderBoard();
    }

    renderClickSelection() {
      this.boardEl.querySelectorAll(".sequence-card").forEach((card) => {
        const index = Number(card.dataset.index);
        card.classList.toggle("click-selected", index === this.clickSelectedIndex);
      });
    }

    checkSequence() {
      if (this.roundSubmitted) return;

      this.roundSubmitted = true;
      const elapsedSeconds = Math.max(1, Math.floor((Date.now() - this.roundStartedAt) / 1000));

      let correctCount = 0;
      const cards = Array.from(this.boardEl.querySelectorAll(".sequence-card"));
      cards.forEach((card, index) => {
        card.classList.remove("correct", "misplaced", "click-selected");
        const step = this.displayedSteps[index];
        if (step.id === index) {
          card.classList.add("correct");
          correctCount += 1;
        } else {
          card.classList.add("misplaced");
        }
      });

      this.currentAccuracy = Math.round((correctCount / this.correctSteps.length) * 100);
      const config = this.getConfig();
      const basePoints = this.correctSteps.length * 100 * (this.currentAccuracy / 100);
      const speedBonus = Math.max(0, config.targetSeconds - elapsedSeconds) * 2 * config.multiplier;
      const streakBonus = this.currentAccuracy === 100 ? this.streak * 25 : 0;

      this.currentRoundPoints = Math.round((basePoints + speedBonus + streakBonus) * config.multiplier);
      this.totalScore += this.currentRoundPoints;

      if (this.currentAccuracy === 100) {
        this.streak += 1;
        this.feedbackEl.textContent = "Perfect sequence. Great recall and order mapping.";
        this.bumpDifficulty();
      } else {
        this.streak = 0;
        this.feedbackEl.textContent = "Some steps are misplaced. Red cards show what needs fixing.";
      }

      this.nextRoundBtn.disabled = false;
      this.updateStats();

      if (window.GameModes && typeof window.GameModes.roundEnd === "function") {
        window.GameModes.roundEnd(this.currentRoundPoints);
      }
    }

    bumpDifficulty() {
      if (this.currentDifficulty === "easy") {
        this.currentDifficulty = "medium";
      } else if (this.currentDifficulty === "medium") {
        this.currentDifficulty = "hard";
      }
      this.highlightDifficulty();
    }

    nextRound() {
      this.round += 1;
      this.startRound();
    }

    updateStats() {
      const config = this.getConfig();
      this.difficultyValueEl.textContent = config.label;
      this.roundValueEl.textContent = String(this.round);
      this.accuracyValueEl.textContent = this.currentAccuracy + "%";
      this.roundPointsValueEl.textContent = String(this.currentRoundPoints);
      this.totalScoreValueEl.textContent = String(this.totalScore);
      this.streakValueEl.textContent = String(this.streak);
      this.updateTimeDisplay();
    }

    escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
  }

  const game = new MemoryChainGame();

  window.addEventListener("load", () => {
    game.init();

    if (window.StudyAdventure) {
      window.StudyAdventure.startSession("memory_chain_game", "Memory Chain Sequence Builder");
      window.StudyAdventure.pushHint("Look for transition words like first, then, and finally to rebuild order faster.");
    }
  });

  if (window.GameModes) {
    window.GameModes.init({
      gameLabel: "Memory Chain",
      startFn: () => {
        game.startRound();
      },
      resetFn: () => {
        game.currentDifficulty = "easy";
        game.round = 1;
        game.totalScore = 0;
        game.currentRoundPoints = 0;
        game.currentAccuracy = 0;
        game.streak = 0;
        game.highlightDifficulty();
        game.startRound();
      },
      getScore: () => game.totalScore
    });
  }
})();
