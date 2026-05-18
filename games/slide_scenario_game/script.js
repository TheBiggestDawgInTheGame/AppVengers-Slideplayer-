(function () {
  const GENERATED_QUIZ_KEY = "slidePlayGeneratedQuizData";
  const UPLOADED_FILES_KEY = "slidePlayUploadedFiles";

  const LEVELS = {
    easy: { label: "Easy", rounds: 5, multiplier: 1.0, targetSeconds: 45 },
    medium: { label: "Medium", rounds: 7, multiplier: 1.35, targetSeconds: 38 },
    hard: { label: "Hard", rounds: 9, multiplier: 1.8, targetSeconds: 32 }
  };

  const FALLBACK_SCENARIOS = [
    {
      title: "Start a lesson",
      prompt: "The class is beginning a new topic. What should the teacher do first?",
      options: [
        { text: "Jump to the hardest example immediately", correct: false },
        { text: "Review the objective and key vocabulary", correct: true },
        { text: "Skip instructions to save time", correct: false },
        { text: "Give the final quiz right away", correct: false }
      ]
    },
    {
      title: "Group work",
      prompt: "A group is working on a slide-based project. What improves their chances of success?",
      options: [
        { text: "Everyone works silently without a plan", correct: false },
        { text: "One learner does everything", correct: false },
        { text: "Assign roles and check progress together", correct: true },
        { text: "Ignore the task checklist", correct: false }
      ]
    },
    {
      title: "Confusing slide",
      prompt: "A slide has too much text and the students look lost. What is the best move?",
      options: [
        { text: "Read the whole slide faster", correct: false },
        { text: "Break the slide into smaller ideas", correct: true },
        { text: "Hide the slide and move on", correct: false },
        { text: "Ask learners to guess randomly", correct: false }
      ]
    },
    {
      title: "Study review",
      prompt: "At the end of the lesson, what should happen?",
      options: [
        { text: "Reflect, answer questions, and identify weak points", correct: true },
        { text: "Stop without checking understanding", correct: false },
        { text: "Only praise the strongest learners", correct: false },
        { text: "Remove all summary slides", correct: false }
      ]
    }
  ];

  class ScenarioSource {
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

      return this.extractScenarios(text);
    }

    static buildFromFragments(fragments) {
      const cleanFragments = Array.isArray(fragments)
        ? fragments.map((item) => String(item || "").trim()).filter((item) => item.length > 8)
        : [];

      if (cleanFragments.length < 4) return [];

      return cleanFragments.slice(0, 12).map((fragment, index) => {
        const nextFragment = cleanFragments[(index + 1) % cleanFragments.length];
        // Pick two more distractors from other parts of the content
        const distractor1 = cleanFragments[(index + 2) % cleanFragments.length];
        const distractor2 = cleanFragments[(index + 3) % cleanFragments.length];
        const keyWord = this.pickKeyPhrase(fragment);

        const options = [
          { text: nextFragment, correct: true },
          { text: distractor1, correct: false },
          { text: distractor2, correct: false },
          { text: cleanFragments[(index + 4) % cleanFragments.length] || "None of the above", correct: false }
        ];

        // Shuffle so correct answer isn't always first
        for (let i = options.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [options[i], options[j]] = [options[j], options[i]];
        }

        return {
          title: keyWord ? keyWord + " Decision" : "Slide Decision " + (index + 1),
          prompt: "Based on this slide content: \"" + fragment + "\"\nWhat is the most logical next point?",
          options
        };
      });
    }

    static pickKeyPhrase(text) {
      const words = String(text || "")
        .replace(/^[\d\).:-]+\s*/, "")
        .split(/\s+/)
        .filter((word) => word.length > 3 && !/^(the|and|for|with|from|that|this|then|step)$/i.test(word));
      return words.slice(0, 2).join(" ");
    }

    static fromQuiz() {
      const items = this.readJson(GENERATED_QUIZ_KEY, []);
      if (!Array.isArray(items) || items.length === 0) return [];

      return items
        .map((item, idx) => {
          const q = String(item.question || item.questionText || "").trim();
          if (q.length < 20) return null;

          // Use the real AI-generated options if they exist
          let options = null;
          if (Array.isArray(item.options) && item.options.length === 4) {
            const correctIdx = Number.isInteger(item.correct) ? item.correct : 0;
            options = item.options.map((text, i) => ({
              text: String(text).trim(),
              correct: i === correctIdx
            }));
          }

          if (!options) {
            // Fallback: shouldn't happen with well-formed AI output
            options = [
              { text: "Apply the concept described above", correct: true },
              { text: "Avoid this approach entirely", correct: false },
              { text: "Use the opposite strategy", correct: false },
              { text: "Skip to the next topic", correct: false }
            ];
          }

          return {
            title: "Scenario " + (idx + 1),
            prompt: q,
            options
          };
        })
        .filter(Boolean)
        .slice(0, 12);
    }

    static extractScenarios(text) {
      if (!text || typeof text !== "string") return [];

      const sentences = text
        .split(/[\n.!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 30);

      const scenarios = [];
      for (let i = 0; i < Math.min(sentences.length, 12); i += 1) {
        const prompt = sentences[i];
        if (!prompt) continue;

        scenarios.push({
          title: "Scenario " + (i + 1),
          prompt,
          options: [
            { text: "Choose the most relevant next action", correct: true },
            { text: "Ignore the context and move on", correct: false },
            { text: "Pick the least detailed response", correct: false },
            { text: "Guess without reading carefully", correct: false }
          ]
        });
      }

      return scenarios;
    }

    static getScenarios() {
      // Prefer AI-generated quiz data — it has real questions and real options
      const fromQuiz = this.fromQuiz();
      if (fromQuiz.length >= 3) {
        return { source: "Built from AI-generated quiz", scenarios: fromQuiz };
      }

      const fromSlides = this.fromUploads();
      if (fromSlides.length >= 4) {
        return { source: "Built from uploaded slide situations", scenarios: fromSlides };
      }

      return {
        source: "Using built-in demo scenarios",
        scenarios: this.buildFromFragments(FALLBACK_SCENARIOS.map((item) => item.prompt || item.title || ""))
      };
    }
  }

  class SlideScenarioGame {
    constructor() {
      this.titleEl = document.getElementById("scenarioTitle");
      this.textEl = document.getElementById("scenarioText");
      this.tagEl = document.getElementById("scenarioTag");
      this.choicesEl = document.getElementById("answerChoices");
      this.feedbackEl = document.getElementById("feedbackText");
      this.sourceInfoEl = document.getElementById("sourceInfo");

      this.shuffleBtn = document.getElementById("shuffleBtn");
      this.checkBtn = document.getElementById("checkBtn");
      this.nextBtn = document.getElementById("nextBtn");
      this.levelBtns = Array.from(document.querySelectorAll(".difficulty-btn"));

      this.difficultyValueEl = document.getElementById("difficultyValue");
      this.roundValueEl = document.getElementById("roundValue");
      this.timeValueEl = document.getElementById("timeValue");
      this.accuracyValueEl = document.getElementById("accuracyValue");
      this.roundPointsValueEl = document.getElementById("roundPointsValue");
      this.totalScoreValueEl = document.getElementById("totalScoreValue");
      this.streakValueEl = document.getElementById("streakValue");

      const source = ScenarioSource.getScenarios();
      this.source = source.source;
      this.baseScenarios = source.scenarios;

      this.level = "easy";
      this.round = 1;
      this.totalScore = 0;
      this.roundScore = 0;
      this.accuracy = 0;
      this.streak = 0;

      this.currentScenarioSet = [];
      this.currentSelected = null;
      this.roundStartedAt = null;
      this.roundLocked = false;
      this.clockId = null;
    }

    init() {
      this.bindEvents();
      this.sourceInfoEl.textContent = this.source + " | Scenarios: " + this.baseScenarios.length;
      this.startRound();
    }

    bindEvents() {
      this.shuffleBtn.addEventListener("click", () => {
        this.shuffleChoices();
        this.renderChoices();
        this.feedbackEl.textContent = "Choices shuffled.";
      });

      this.checkBtn.addEventListener("click", () => this.checkAnswer());
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

      this.choicesEl.addEventListener("click", (event) => {
        const btn = event.target.closest(".choice-btn");
        if (!btn || this.roundLocked) return;
        this.currentSelected = Number(btn.dataset.index);
        this.renderChoiceState();
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
      const roundCount = Math.min(cfg.rounds, this.baseScenarios.length);
      this.currentScenarioSet = this.baseScenarios.slice(0, roundCount).map((scenario, idx) => ({
        id: idx,
        title: scenario.title,
        prompt: scenario.prompt,
        options: scenario.options.slice()
      }));

      this.roundLocked = false;
      this.currentSelected = null;
      this.roundScore = 0;
      this.accuracy = 0;
      this.nextBtn.disabled = true;
      this.feedbackEl.textContent = "The scenario is generated from slide content. Choose the option that best follows the slide.";

      this.currentScenario = this.currentScenarioSet[this.round - 1] || this.currentScenarioSet[0];
      this.shuffleChoices();
      this.startedAt = Date.now();
      this.startClock();

      this.renderScenario();
      this.renderChoices();
      this.updateStats();
    }

    shuffleChoices() {
      if (!this.currentScenario) return;
      for (let i = this.currentScenario.options.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = this.currentScenario.options[i];
        this.currentScenario.options[i] = this.currentScenario.options[j];
        this.currentScenario.options[j] = temp;
      }
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

    renderScenario() {
      this.tagEl.textContent = "Scenario " + this.round;
      this.titleEl.textContent = this.currentScenario.title;
      this.textEl.textContent = this.currentScenario.prompt;
    }

    renderChoices() {
      this.choicesEl.innerHTML = this.currentScenario.options.map((option, index) => {
        return [
          "<button class=\"choice-btn\" type=\"button\" data-index=\"" + index + "\">",
          "<span class=\"choice-title\">Option " + String.fromCharCode(65 + index) + "</span>",
          "<span class=\"choice-desc\">" + this.escape(option.text) + "</span>",
          "</button>"
        ].join("");
      }).join("");
      this.renderChoiceState();
    }

    renderChoiceState() {
      this.choicesEl.querySelectorAll(".choice-btn").forEach((btn) => {
        btn.classList.toggle("selected", Number(btn.dataset.index) === this.currentSelected);
      });
    }

    checkAnswer() {
      if (this.roundLocked) return;
      if (this.currentSelected === null) {
        this.feedbackEl.textContent = "Select one option first.";
        return;
      }

      this.roundLocked = true;
      const cfg = this.getConfig();
      const elapsed = Math.max(1, Math.floor((Date.now() - this.startedAt) / 1000));
      const selected = this.currentScenario.options[this.currentSelected];
      const correctIndex = this.currentScenario.options.findIndex((item) => item.correct);
      const correct = this.currentSelected === correctIndex;

      this.choicesEl.querySelectorAll(".choice-btn").forEach((btn, index) => {
        btn.classList.remove("selected");
        if (index === correctIndex) btn.classList.add("correct");
        if (index === this.currentSelected && !correct) btn.classList.add("wrong");
      });

      this.accuracy = correct ? 100 : 0;
      const base = correct ? 160 : 20;
      const speedBonus = Math.max(0, cfg.targetSeconds - elapsed) * 2;
      const streakBonus = this.streak * 25;
      this.roundScore = Math.round((base + speedBonus + streakBonus) * cfg.multiplier);
      this.totalScore += this.roundScore;

      if (correct) {
        this.streak += 1;
        this.feedbackEl.textContent = "Correct decision. You followed the slide content accurately.";
      } else {
        this.streak = 0;
        this.feedbackEl.textContent = "That was not the best choice. The green answer is the slide-based follow-up.";
      }

      this.nextBtn.disabled = false;
      this.updateStats();

      if (window.GameModes && typeof window.GameModes.roundEnd === "function") {
        window.GameModes.roundEnd(this.roundScore);
      }

      if (window.StudyAdventure) {
        if (correct) {
          window.StudyAdventure.recordSuccess({
            points: Math.max(1, Math.round(this.roundScore / 140)),
            message: "Scenario decision was strong and well reasoned."
          });
        } else {
          window.StudyAdventure.recordSetback({
            message: "Scenario answer showed a weakness in decision making."
          });
        }
      }
    }

    updateStats() {
      const cfg = this.getConfig();
      this.difficultyValueEl.textContent = cfg.label;
      this.roundValueEl.textContent = String(this.round);
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

  const game = new SlideScenarioGame();

  window.addEventListener("load", () => {
    game.init();

    if (window.StudyAdventure) {
      window.StudyAdventure.startSession("slide_scenario_game", "Slide Scenario Decision Builder");
      window.StudyAdventure.pushHint("Read the slide situation, identify the best next action, and avoid superficial answers.");
    }
  });

  if (window.GameModes) {
    window.GameModes.init({
      gameLabel: "Scenario Quest",
      startFn: () => {
        game.startRound();
      },
      resetFn: () => {
        game.level = "easy";
        game.round = 1;
        game.totalScore = 0;
        game.roundScore = 0;
        game.accuracy = 0;
        game.streak = 0;
        game.highlightLevel();
        game.startRound();
      },
      getScore: () => game.totalScore
    });
  }
})();
