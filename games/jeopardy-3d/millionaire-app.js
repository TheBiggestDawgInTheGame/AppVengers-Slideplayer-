/* millionaire-app.js */
(function () {
  const GENERATED_QUIZ_KEY = "slidePlayGeneratedQuizData";
  const UPLOADED_FILES_KEY = "slidePlayUploadedFiles";
  const PERFORMANCE_HISTORY_KEY = "slidePlayJeopardy3dPerformanceHistory";
  const IMPROVEMENT_PREF_KEY = "slidePlayJeopardy3dImproveOptIn";
  const COACH_PROMPT_STATE_KEY = "slidePlayJeopardy3dCoachPromptState";
  const ADAPTIVE_PROFILE_KEY = "slidePlayJeopardy3dAdaptiveProfile";
  const ADAPTIVE_SETTINGS_KEY = "slidePlayJeopardy3dAdaptiveSettings";
  const COACH_PROMPT_EVERY_ROUNDS = 3;
  const TIME_PER_QUESTION = 30;
  const MIN_TIME_PER_QUESTION = 20;
  const MAX_TIME_PER_QUESTION = 42;
  const BASE_PRIZES = [
    100,
    200,
    300,
    500,
    1000,
    2000,
    4000,
    8000,
    16000,
    32000,
    64000,
    125000,
    250000,
    500000,
    1000000,
  ];

  const dom = {
    uploadPanel: document.getElementById("upload-panel"),
    gameHud: document.getElementById("game-hud"),
    questionPanel: document.getElementById("question-panel"),
    questionText: document.getElementById("question-text"),
    answersContainer: document.getElementById("answers-container"),
    feedbackToast: document.getElementById("feedback-toast"),
    resultsPanel: document.getElementById("results-panel"),
    finalScoreEl: document.getElementById("final-score"),
    resultsDetail: document.getElementById("results-detail"),
    resultsInsights: document.getElementById("results-insights"),
    btnRestart: document.getElementById("btn-restart"),
    hudQnum: document.getElementById("hud-qnum"),
    hudQtotal: document.getElementById("hud-qtotal"),
    hudTimer: document.getElementById("hud-timer"),
    hudWinnings: document.getElementById("hud-winnings"),
    controlsPanel: document.getElementById("controls-panel"),
    ladderPanel: document.getElementById("ladder-panel"),
    hintLine: document.getElementById("hint-line"),
    ladderEl: document.getElementById("prize-ladder"),
    btnLock: document.getElementById("btn-lock"),
    btnNext: document.getElementById("btn-next"),
    btn5050: document.getElementById("lifeline-5050"),
    btnCall: document.getElementById("lifeline-call"),
    btnAudience: document.getElementById("lifeline-audience"),
    btnAdaptiveToggle: document.getElementById("btn-adaptive-toggle"),
    btnAdaptiveReset: document.getElementById("btn-adaptive-reset"),
    answerButtons: Array.from(document.querySelectorAll(".answer-btn")),
  };

  const state = {
    gameActive: false,
    questions: [],
    currentQuestionData: null,
    selectedOptionIndex: null,
    questionLocked: false,
    totalQuestions: 0,
    currentQuestionIndex: -1,
    clearedQuestions: 0,
    prizeValues: [],
    timeLeft: TIME_PER_QUESTION,
    timerInterval: null,
    usedFiftyFifty: false,
    usedCallFriend: false,
    usedAskAudience: false,
    performanceLog: [],
    currentTopic: "General",
    currentTimeLimit: TIME_PER_QUESTION,
    adaptiveProfile: null,
    adaptiveEnabled: true,
    currentPlayerIndex: 0,
    gameParams: {
      mode: null,
      game: null,
      playStyle: null,
      content: null,
      fileName: null,
      players: [{ name: "Player 1", score: 0 }],
    },
  };

  function getGameScene() {
    return typeof GameScene !== "undefined" ? GameScene : null;
  }

  async function startWithParams(params) {
    // Store game parameters
    if (params) {
      state.gameParams = {
        mode: params.mode || null,
        game: params.game || null,
        playStyle: params.playStyle || "solo",
        content: params.content || null,
        fileName: params.fileName || null,
        players: params.players || [{ name: "Player 1", score: 0 }],
      };
    }

    // Reset player index for new game session
    state.currentPlayerIndex = 0;

    console.log("Game starting with params:", state.gameParams);

    // Continue with normal initialization
    await init();
  }

  async function init() {
    const scene = getGameScene();
    if (scene) {
      scene.init();
    }

    bindEvents();
    resetRoundUI();
    state.adaptiveEnabled = loadAdaptiveSettings();
    state.adaptiveProfile = loadAdaptiveProfile();
    syncAdaptiveControls();

    if (dom.uploadPanel) {
      dom.uploadPanel.classList.add("hidden");
      // Do NOT use style.display since flow manager controls visibility via classList
    }

    const localQuestions = readStoredQuizData();
    const remoteQuestions = localQuestions.length ? [] : await maybeLoadQuestionsFromBackend();
    const questions = localQuestions.length ? localQuestions : remoteQuestions;

    if (questions.length === 0) {
      showMissingDataState();
      return;
    }

    hydrateQuestions(questions);
    startGame();
  }

  async function maybeLoadQuestionsFromBackend() {
    const sourceText = readUploadedSourceText();
    if (!sourceText) {
      return [];
    }

    // Try backend API first
    if (window.QuizAppApi) {
      try {
        const generated = await window.QuizAppApi.generateQuestionsFromText(sourceText, 10);
        if (Array.isArray(generated) && generated.length > 0) {
          localStorage.setItem(GENERATED_QUIZ_KEY, JSON.stringify(generated));
          return generated.map(normalizeQuestion).filter((item) => !!item);
        }
      } catch (_error) {
        // Fall through to local generation
      }
    }

    // Fallback: use local QuizEngine if available
    if (typeof QuizEngine !== "undefined") {
      try {
        if (QuizEngine.reset) QuizEngine.reset();
        await QuizEngine.generateQuestions(sourceText, 10);
        const localQuestions = [];
        let q;
        while ((q = QuizEngine.getNextQuestion())) {
          localQuestions.push(q);
        }
        if (localQuestions.length > 0) {
          const normalized = localQuestions.map(normalizeQuestion).filter((item) => !!item);
          localStorage.setItem(GENERATED_QUIZ_KEY, JSON.stringify(normalized));
          return normalized;
        }
      } catch (_e) {
        // Failed local generation too
      }
    }

    return [];
  }

  function readUploadedSourceText() {
    try {
      const files = JSON.parse(localStorage.getItem(UPLOADED_FILES_KEY) || "[]");
      if (!Array.isArray(files) || files.length === 0) {
        return "";
      }

      return files
        .map((file) => {
          if (!file || typeof file !== "object") return "";
          return String(file.extractedText || file.text || file.content || file.originalName || "").trim();
        })
        .filter((part) => part.length > 0)
        .join("\n");
    } catch (_error) {
      return "";
    }
  }

  function bindEvents() {
    dom.answerButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (!state.gameActive || state.questionLocked || !state.currentQuestionData) {
          return;
        }

        const index = Number(button.getAttribute("data-index"));
        if (index >= 0 && index < state.currentQuestionData.options.length && !button.disabled) {
          selectOption(index);
        }
      });
    });

    dom.btnLock.addEventListener("click", lockAnswer);
    dom.btnNext.addEventListener("click", nextQuestion);
    dom.btn5050.addEventListener("click", useFiftyFifty);
    dom.btnCall.addEventListener("click", useCallFriend);
    dom.btnAudience.addEventListener("click", useAskAudience);
    dom.btnRestart.addEventListener("click", restartGame);
    if (dom.btnAdaptiveToggle) {
      dom.btnAdaptiveToggle.addEventListener("click", toggleAdaptiveMode);
    }
    if (dom.btnAdaptiveReset) {
      dom.btnAdaptiveReset.addEventListener("click", resetAdaptiveProfile);
    }

    document.addEventListener("keydown", (event) => {
      if (!state.gameActive || state.questionLocked) {
        return;
      }

      const key = event.key.toLowerCase();
      const keyMap = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };

      if (keyMap[key] !== undefined && state.currentQuestionData) {
        const button = dom.answerButtons[keyMap[key]];
        if (button && !button.disabled && button.style.display !== "none") {
          selectOption(keyMap[key]);
        }
      }

      if (key === "enter") {
        lockAnswer();
      }
    });
  }

  function readStoredQuizData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GENERATED_QUIZ_KEY) || "[]");
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map(normalizeQuestion)
        .filter((item) => !!item);
    } catch (_error) {
      return [];
    }
  }

  function normalizeQuestion(item) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const questionText = String(item.questionText || item.question || "").trim();
    const options = Array.isArray(item.options)
      ? item.options.map((option) => String(option || "").trim()).filter((option) => option.length > 0)
      : [];

    if (!questionText || options.length < 2) {
      return null;
    }

    let correctAnswer = "";
    if (typeof item.correctAnswer === "string" && item.correctAnswer.trim()) {
      correctAnswer = item.correctAnswer.trim();
    } else if (Number.isInteger(item.correct) && options[item.correct]) {
      correctAnswer = options[item.correct];
    } else if (Number.isInteger(item.correctIndex) && options[item.correctIndex]) {
      correctAnswer = options[item.correctIndex];
    }

    if (!correctAnswer) {
      return null;
    }

    if (!options.some((option) => option.toLowerCase() === correctAnswer.toLowerCase())) {
      return null;
    }

    return {
      questionText,
      options: options.slice(0, 4),
      correctAnswer,
    };
  }

  function hydrateQuestions(questions) {
    state.questions = questions;
    state.totalQuestions = questions.length;
    state.prizeValues = buildPrizeValues(state.totalQuestions);
    state.currentQuestionIndex = -1;
    state.clearedQuestions = 0;
    state.selectedOptionIndex = null;
    state.questionLocked = false;
    state.usedFiftyFifty = false;
    state.usedCallFriend = false;
    state.usedAskAudience = false;
  }

  function startGame() {
    if (!state.questions.length) {
      showMissingDataState();
      return;
    }

    state.gameActive = true;
    state.currentQuestionIndex = -1;
    state.clearedQuestions = 0;
    state.usedFiftyFifty = false;
    state.usedCallFriend = false;
    state.usedAskAudience = false;
    state.performanceLog = [];
    state.currentTimeLimit = TIME_PER_QUESTION;
    state.currentTopic = "General";
    state.currentQuestionData = null;

    dom.gameHud.classList.add("visible");
    if (dom.questionPanel) dom.questionPanel.classList.add("visible");
    dom.answersContainer.classList.add("visible");
    dom.controlsPanel.classList.add("visible");
    dom.ladderPanel.classList.add("visible");

    // Show player indicator in HUD for multiplayer
    const players = state.gameParams.players || [];
    const currentPlayer = players[state.currentPlayerIndex || 0];
    const playStyle = state.gameParams.playStyle || "solo";

    if (playStyle !== "solo" && currentPlayer) {
      setHint(`${currentPlayer.name}'s turn – good luck!`);
      setTimeout(() => setHint("Select your best option and press Lock Answer."), 2500);
    } else {
      setHint("Select your best option and press Lock Answer.");
    }

    dom.hudQnum.textContent = "1";
    dom.hudQtotal.textContent = String(state.totalQuestions);
    dom.hudTimer.textContent = String(TIME_PER_QUESTION);
    dom.hudWinnings.textContent = "0";

    renderPrizeLadder();
    updateLadderUI();
    updateLifelineButtons();
    resetAnswerButtons();

    dom.resultsPanel.classList.remove("show");
    dom.btnLock.disabled = true;
    dom.btnNext.disabled = true;
    setHint("Select your best option and press Lock Answer.");

    if (dom.questionText) {
      dom.questionText.textContent = "Get ready...";
    }

    const scene = getGameScene();
    if (scene) {
      scene.updateQuestionScreen("Get ready...");
      scene.updateAllAnswerScreens(["", "", "", ""]);
    }

    loadNextQuestion();
  }

  function loadNextQuestion() {
    if (!state.gameActive) {
      return;
    }

    const nextIndex = state.currentQuestionIndex + 1;
    const question = state.questions[nextIndex];
    if (!question) {
      endGame(true, "All questions complete.");
      return;
    }

    state.currentQuestionData = question;
    state.currentQuestionIndex = nextIndex;
    state.selectedOptionIndex = null;
    state.questionLocked = false;
    state.currentTopic = inferTopic(question.questionText);

    const adaptiveSetup = getAdaptiveQuestionSetup(state.currentTopic);
    state.currentTimeLimit = adaptiveSetup.timeLimit;

    if (dom.questionText) {
      dom.questionText.textContent = question.questionText;
    }

    const scene = getGameScene();
    if (scene) {
      scene.updateQuestionScreen(question.questionText);
      scene.updateAllAnswerScreens(question.options);
    }

    dom.hudQnum.textContent = String(state.currentQuestionIndex + 1);
    dom.hudQtotal.textContent = String(state.totalQuestions);

    startTimer();
    updateLadderUI();
    updateLifelineButtons();
    setHint(adaptiveSetup.hint);

    dom.answerButtons.forEach((button, index) => {
      button.classList.remove("correct-flash", "incorrect-flash", "selected", "eliminated");
      button.disabled = false;
      button.style.display = index < question.options.length ? "" : "none";
      if (index < question.options.length) {
        button.textContent = question.options[index];
      }
    });

    dom.btnLock.disabled = true;
    dom.btnNext.disabled = true;
    dom.feedbackToast.classList.remove("show-correct", "show-incorrect");
    dom.feedbackToast.textContent = "";
  }

  function selectOption(index) {
    if (!state.gameActive || state.questionLocked || !state.currentQuestionData) {
      return;
    }

    state.selectedOptionIndex = index;
    dom.answerButtons.forEach((button, buttonIndex) => {
      button.classList.toggle("selected", buttonIndex === index);
    });

    dom.btnLock.disabled = false;
    setHint("Press Lock Answer when you are ready.");
  }

  function lockAnswer() {
    if (
      !state.gameActive ||
      state.questionLocked ||
      !state.currentQuestionData ||
      state.selectedOptionIndex === null
    ) {
      return;
    }

    state.questionLocked = true;
    stopTimer();
    dom.btnLock.disabled = true;
    dom.btnNext.disabled = true;
    setHint("Final answer locked...");

    const selectedText = state.currentQuestionData.options[state.selectedOptionIndex];
    const correctIndex = state.currentQuestionData.options.findIndex(
      (option) => option.trim().toLowerCase() === state.currentQuestionData.correctAnswer.trim().toLowerCase(),
    );
    const correctText = state.currentQuestionData.correctAnswer;
    const isCorrect = selectedText.trim().toLowerCase() === correctText.trim().toLowerCase();
    recordPerformance(isCorrect, "locked", {
      userAnswer: selectedText,
      correctAnswer: correctText,
      questionText: state.currentQuestionData.questionText,
    });

    dom.answerButtons.forEach((button, index) => {
      button.disabled = true;
      if (index === correctIndex) {
        button.classList.add("correct-flash");
      } else if (index === state.selectedOptionIndex && state.selectedOptionIndex !== correctIndex) {
        button.classList.add("incorrect-flash");
      }
    });

    const scene = getGameScene();
    if (scene) {
      if (correctIndex >= 0) {
        scene.flashAnswerScreen(correctIndex, 0x2ecc71);
      }
      if (state.selectedOptionIndex >= 0 && state.selectedOptionIndex !== correctIndex) {
        scene.flashAnswerScreen(state.selectedOptionIndex, 0xe74c3c);
      }
    }

    if (isCorrect) {
      state.clearedQuestions += 1;
      dom.hudWinnings.textContent = formatMoney(currentWinnings());
      updateLadderUI();

      dom.feedbackToast.textContent = "✅ CORRECT!";
      dom.feedbackToast.classList.add("show-correct");
      dom.feedbackToast.classList.remove("show-incorrect");
      setHint("Great answer. Press Next Question to continue.");

      if (dom.questionText) {
        dom.questionText.textContent = `Correct! ${correctText}`;
      }
      if (scene) {
        scene.updateQuestionScreen("✅ Correct!\n" + correctText);
      }

      if (state.clearedQuestions >= state.totalQuestions) {
        delay(1100).then(() => endGame(true, "You won the top prize."));
        return;
      }

      dom.btnNext.disabled = false;
    } else {
      dom.feedbackToast.textContent = "❌ WRONG";
      dom.feedbackToast.classList.add("show-incorrect");
      dom.feedbackToast.classList.remove("show-correct");
      setHint("Round over. Better luck on the next run.");

      if (dom.questionText) {
        dom.questionText.textContent = `The answer was: ${correctText}`;
      }
      if (scene) {
        scene.updateQuestionScreen("❌ The answer was:\n" + correctText);
      }

      delay(1100).then(() => endGame(false, "Incorrect lock-in."));
    }

    delay(900).then(() => {
      if (state.gameActive) {
        dom.feedbackToast.classList.remove("show-correct", "show-incorrect");
        dom.feedbackToast.textContent = "";
      }
    });
  }

  function nextQuestion() {
    if (!state.gameActive || !state.questionLocked) {
      return;
    }

    loadNextQuestion();
  }

  function onTimeExpired() {
    if (!state.gameActive || state.questionLocked || !state.currentQuestionData) {
      return;
    }

    state.questionLocked = true;
    dom.btnLock.disabled = true;
    dom.btnNext.disabled = true;

    const correctIndex = state.currentQuestionData.options.findIndex(
      (option) => option.trim().toLowerCase() === state.currentQuestionData.correctAnswer.trim().toLowerCase(),
    );

    dom.answerButtons.forEach((button, index) => {
      button.disabled = true;
      if (index === correctIndex) {
        button.classList.add("correct-flash");
      }
    });

    const scene = getGameScene();
    if (scene && correctIndex >= 0) {
      scene.flashAnswerScreen(correctIndex, 0x2ecc71);
    }

    dom.feedbackToast.textContent = "⏱️ TIME UP";
    dom.feedbackToast.classList.add("show-incorrect");
    dom.feedbackToast.classList.remove("show-correct");

    if (dom.questionText) {
      dom.questionText.textContent = `Time up! Correct: ${state.currentQuestionData.correctAnswer}`;
    }
    if (scene) {
      scene.updateQuestionScreen("⏱️ Time up!\nCorrect: " + state.currentQuestionData.correctAnswer);
    }

    setHint("Time expired before lock-in.");
    recordPerformance(false, "timeout", {
      userAnswer: "",
      correctAnswer: state.currentQuestionData.correctAnswer,
      questionText: state.currentQuestionData.questionText,
    });
    delay(1100).then(() => endGame(false, "Time expired."));
  }

  function endGame(isWin, reason) {
    state.gameActive = false;
    stopTimer();

    if (dom.questionPanel) dom.questionPanel.classList.remove("visible");

    const scene = getGameScene();
    if (scene) {
      scene.updateQuestionScreen(isWin ? "🏆 You Won!" : "🎬 Round Complete");
      scene.updateAllAnswerScreens(["Great", "Job!", "Thanks", "Playing!"]);
    }

    dom.answersContainer.classList.remove("visible");
    dom.controlsPanel.classList.remove("visible");
    dom.btnLock.disabled = true;
    dom.btnNext.disabled = true;
    updateLifelineButtons();

    const winnings = currentWinnings();
    const coaching = buildCoachingSummary();
    const history = persistRoundHistory(coaching);
    const latestRecord = history.length ? history[history.length - 1] : null;
    const trend = buildTrendSummary(history);
    const aggregate = buildAggregateWeaknessProfile(history);
    const profile = state.adaptiveProfile || loadAdaptiveProfile();
    const masterySummary = buildMasterySummary(profile);

    // Update player score if multiplayer
    const playStyle = state.gameParams.playStyle || "solo";
    const players = state.gameParams.players || [];
    const currentPlayerIdx = state.currentPlayerIndex || 0;

    if (playStyle !== "solo" && players.length > 0 && players[currentPlayerIdx]) {
      players[currentPlayerIdx].score = winnings;
      players[currentPlayerIdx].roundsPlayed = (players[currentPlayerIdx].roundsPlayed || 0) + 1;
      state.gameParams.players = players;
    }

    const currentPlayer = players[currentPlayerIdx];
    const playerPrefix = playStyle !== "solo" && currentPlayer ? `${currentPlayer.name} – ` : "";

    dom.finalScoreEl.textContent = `${playerPrefix}$${formatMoney(winnings)}`;
    dom.resultsDetail.textContent = [
      `Cleared ${state.clearedQuestions}/${state.totalQuestions} questions. ${reason}`,
      `Round Coach: ${coaching.summary}`,
      `Round weakness focus: ${coaching.weaknesses.length ? coaching.weaknesses.join(", ") : "No major weakness detected this round."}`,
      `Cumulative weakness focus: ${aggregate.weaknesses.length ? aggregate.weaknesses.join(", ") : "No persistent weakness yet."}`,
      `Adaptive memory: ${profile.rounds} rounds tracked. Focus topics: ${profile.focusTopics.length ? profile.focusTopics.join(", ") : "None"}`,
      `Topic mastery: ${masterySummary || "Not enough attempts yet."}`,
      `Long-term trend: ${trend}`,
    ].join("\n");

    // Update restart button for multiplayer/tournament
    if (playStyle === "multiplayer" && currentPlayerIdx < players.length - 1) {
      const nextPlayer = players[currentPlayerIdx + 1];
      dom.btnRestart.textContent = `▶️ Next: ${nextPlayer.name}`;
      dom.btnRestart.dataset.nextPlayer = String(currentPlayerIdx + 1);
    } else if (playStyle !== "solo" && currentPlayerIdx >= players.length - 1) {
      dom.btnRestart.textContent = "🏆 View Leaderboard";
      dom.btnRestart.dataset.nextPlayer = "leaderboard";
    } else {
      dom.btnRestart.textContent = "🔄 Play Again";
      delete dom.btnRestart.dataset.nextPlayer;
    }

    setResultsInsightsText("Loading backend insights...");
    maybePromptImprovementPlan(coaching, aggregate, history);
    void submitRoundReportToBackend({ isWin, reason, winnings, latestRecord });
    void loadBackendInsightsForResults({ coaching, aggregate, trend });
    dom.resultsPanel.classList.add("show");

    if (scene) {
      for (let i = 0; i < 4; i += 1) {
        setTimeout(() => scene.flashAnswerScreen(i, 0xf7d774), i * 200);
      }
    }
  }

  function restartGame() {
    stopTimer();
    dom.resultsPanel.classList.remove("show");
    setResultsInsightsText("AI insights will appear here after the round.");

    const playStyle = state.gameParams.playStyle || "solo";
    const nextPlayerStr = dom.btnRestart.dataset.nextPlayer;

    // Show leaderboard if all players have finished
    if (nextPlayerStr === "leaderboard") {
      showLeaderboard();
      return;
    }

    // Advance to next player in multiplayer mode
    if (playStyle !== "solo" && nextPlayerStr !== undefined) {
      state.currentPlayerIndex = Number(nextPlayerStr);
      const players = state.gameParams.players || [];
      const nextPlayer = players[state.currentPlayerIndex];

      // Brief transition screen
      if (nextPlayer) {
        dom.resultsPanel.classList.remove("show");
        setHint(`${nextPlayer.name}'s turn – get ready!`);
        setTimeout(() => {
          setHint("");
          const storedQuestions = readStoredQuizData();
          if (storedQuestions.length > 0) {
            hydrateQuestions(storedQuestions);
            startGame();
          }
        }, 2000);
        return;
      }
    }

    // If using flow manager, go back to mode selection
    if (typeof window.GameFlowManager !== "undefined") {
      setTimeout(() => {
        window.GameFlowManager.resetFlow();
      }, 300);
      return;
    }

    // Fallback for direct access
    const storedQuestions = readStoredQuizData();
    if (storedQuestions.length === 0) {
      showMissingDataState();
      return;
    }

    hydrateQuestions(storedQuestions);
    startGame();
  }

  function showLeaderboard() {
    const players = state.gameParams.players || [];

    if (players.length === 0) {
      if (typeof window.GameFlowManager !== "undefined") {
        window.GameFlowManager.resetFlow();
      }
      return;
    }

    // Sort by score descending
    const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
    const leaderboard = sorted.map((p, idx) => {
      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`;
      return `${medal} ${p.name}: $${formatMoney(p.score || 0)}`;
    }).join("\n");

    dom.finalScoreEl.textContent = `🏆 ${sorted[0].name}`;
    dom.resultsDetail.textContent = `Final Leaderboard:\n\n${leaderboard}`;
    dom.btnRestart.textContent = "🔄 Play Again";
    delete dom.btnRestart.dataset.nextPlayer;

    dom.resultsPanel.classList.add("show");
  }

  function startTimer() {
    stopTimer();
    state.timeLeft = state.currentTimeLimit;
    dom.hudTimer.textContent = String(state.timeLeft);

    state.timerInterval = setInterval(() => {
      if (!state.gameActive || state.questionLocked) {
        return;
      }

      state.timeLeft -= 1;
      dom.hudTimer.textContent = String(Math.max(0, state.timeLeft));

      if (state.timeLeft <= 0) {
        stopTimer();
        onTimeExpired();
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  function useFiftyFifty() {
    if (state.usedFiftyFifty || state.questionLocked || !state.currentQuestionData) {
      return;
    }

    const correctIndex = state.currentQuestionData.options.findIndex(
      (option) => option.trim().toLowerCase() === state.currentQuestionData.correctAnswer.trim().toLowerCase(),
    );
    const wrongIndexes = [0, 1, 2, 3].filter((index) => index !== correctIndex);
    shuffleArray(wrongIndexes);

    wrongIndexes.slice(0, 2).forEach((index) => {
      const button = dom.answerButtons[index];
      if (!button) {
        return;
      }

      button.disabled = true;
      button.classList.add("eliminated");
      if (state.selectedOptionIndex === index) {
        state.selectedOptionIndex = null;
        dom.btnLock.disabled = true;
      }
    });

    state.usedFiftyFifty = true;
    setHint("50:50 used. Two wrong options are removed.");
    updateLifelineButtons();
  }

  function useCallFriend() {
    if (state.usedCallFriend || state.questionLocked || !state.currentQuestionData) {
      return;
    }

    const correctIndex = state.currentQuestionData.options.findIndex(
      (option) => option.trim().toLowerCase() === state.currentQuestionData.correctAnswer.trim().toLowerCase(),
    );

    const adaptiveAssist = getAdaptiveAssistanceFactor(state.currentTopic);
    const confidence = Math.random();
    const missChance = Math.max(0.05, 0.22 - adaptiveAssist * 0.12);
    let suggestedIndex = correctIndex;
    if (confidence < missChance) {
      const wrongIndexes = [0, 1, 2, 3].filter((index) => index !== correctIndex);
      suggestedIndex = wrongIndexes[Math.floor(Math.random() * wrongIndexes.length)];
    }

    const letter = String.fromCharCode(65 + suggestedIndex);
    setHint(`Friend says: "I think it is ${letter}, but go with your gut."`);
    state.usedCallFriend = true;
    updateLifelineButtons();
  }

  function useAskAudience() {
    if (state.usedAskAudience || state.questionLocked || !state.currentQuestionData) {
      return;
    }

    const correctIndex = state.currentQuestionData.options.findIndex(
      (option) => option.trim().toLowerCase() === state.currentQuestionData.correctAnswer.trim().toLowerCase(),
    );
    const percentages = [0, 0, 0, 0];
    const adaptiveAssist = getAdaptiveAssistanceFactor(state.currentTopic);
    const minShare = Math.round(52 + adaptiveAssist * 12);
    const maxShare = Math.round(74 + adaptiveAssist * 12);
    const correctShare = minShare + Math.floor(Math.random() * Math.max(1, maxShare - minShare + 1));
    percentages[correctIndex] = correctShare;

    let remainder = 100 - correctShare;
    const wrongIndexes = [0, 1, 2, 3].filter((index) => index !== correctIndex);
    for (let i = 0; i < wrongIndexes.length; i += 1) {
      if (i === wrongIndexes.length - 1) {
        percentages[wrongIndexes[i]] = remainder;
      } else {
        const split = Math.floor(Math.random() * (remainder + 1));
        percentages[wrongIndexes[i]] = split;
        remainder -= split;
      }
    }

    const voteText = ["A", "B", "C", "D"]
      .map((label, index) => `${label}: ${percentages[index]}%`)
      .join(" | ");

    setHint(`Audience vote: ${voteText}`);
    state.usedAskAudience = true;
    updateLifelineButtons();
  }

  function updateLifelineButtons() {
    const disabledState = !state.gameActive || state.questionLocked;
    dom.btn5050.disabled = disabledState || state.usedFiftyFifty;
    dom.btnCall.disabled = disabledState || state.usedCallFriend;
    dom.btnAudience.disabled = disabledState || state.usedAskAudience;

    dom.btn5050.classList.toggle("used", state.usedFiftyFifty);
    dom.btnCall.classList.toggle("used", state.usedCallFriend);
    dom.btnAudience.classList.toggle("used", state.usedAskAudience);
  }

  function buildPrizeValues(count) {
    if (count <= 1) {
      return [1000000];
    }

    const values = [];
    for (let i = 0; i < count - 1; i += 1) {
      values.push(BASE_PRIZES[Math.min(i, BASE_PRIZES.length - 2)]);
    }
    values.push(1000000);
    return values;
  }

  function renderPrizeLadder() {
    dom.ladderEl.innerHTML = "";
    for (let i = state.prizeValues.length - 1; i >= 0; i -= 1) {
      const row = document.createElement("li");
      row.className = "prize-row";
      row.id = `prize-row-${i}`;
      row.innerHTML = `<span>Q${i + 1}</span><strong>$${formatMoney(state.prizeValues[i])}</strong>`;
      dom.ladderEl.appendChild(row);
    }
  }

  function updateLadderUI() {
    for (let i = 0; i < state.prizeValues.length; i += 1) {
      const row = document.getElementById(`prize-row-${i}`);
      if (!row) {
        continue;
      }
      row.classList.remove("active", "won");
      if (i < state.clearedQuestions) {
        row.classList.add("won");
      }
      if (i === state.currentQuestionIndex) {
        row.classList.add("active");
      }
    }
  }

  function showMissingDataState() {
    state.gameActive = false;
    state.questions = [];
    stopTimer();
    resetRoundUI();

    dom.gameHud.classList.remove("visible");
    if (dom.questionPanel) dom.questionPanel.classList.remove("visible");
    dom.answersContainer.classList.remove("visible");
    dom.controlsPanel.classList.remove("visible");
    dom.ladderPanel.classList.remove("visible");
    dom.resultsPanel.classList.remove("show");

    setHint("No generated quiz found. Upload slides and choose this game from Select Game.");
    if (dom.questionText) {
      dom.questionText.textContent = "";
    }
    const scene = getGameScene();
    if (scene) {
      scene.updateQuestionScreen(
        "No quiz data found.\nUpload slides first, then open this game from Select Game.",
      );
      scene.updateAllAnswerScreens(["", "", "", ""]);
    }
  }

  function currentWinnings() {
    return state.clearedQuestions > 0 ? state.prizeValues[state.clearedQuestions - 1] || 0 : 0;
  }

  function inferTopic(questionText) {
    const text = String(questionText || "").toLowerCase();
    if (/(capital|country|city|continent|planet|ocean)/.test(text)) return "Geography";
    if (/(history|war|century|year|industrial|revolution)/.test(text)) return "History";
    if (/(cell|biology|genetics|dna|science|physics|chemistry)/.test(text)) return "Science";
    if (/(algorithm|network|computer|program|function|variable|array)/.test(text)) return "Computing";
    return "General";
  }

  function getAdaptiveQuestionSetup(topic) {
    if (!state.adaptiveEnabled) {
      return {
        timeLimit: TIME_PER_QUESTION,
        hint: "Adaptive Coach is off. Select your best option and press Lock Answer.",
      };
    }

    const profile = state.adaptiveProfile || loadAdaptiveProfile();
    const topicProfile = profile.topics && profile.topics[topic] ? profile.topics[topic] : null;
    if (!topicProfile || Number(topicProfile.attempts || 0) < 3) {
      return {
        timeLimit: TIME_PER_QUESTION,
        hint: "Select your best option and press Lock Answer.",
      };
    }

    const accuracy = topicProfile.correct / Math.max(1, topicProfile.attempts);
    const avgResponseSeconds = Number(topicProfile.avgResponseSeconds || TIME_PER_QUESTION * 0.55);
    const mastery = topicProfile.mastery || getMasteryLabel(accuracy, topicProfile.attempts);

    if (accuracy <= 0.45) {
      return {
        timeLimit: Math.min(MAX_TIME_PER_QUESTION, TIME_PER_QUESTION + 8),
        hint: `Adaptive Coach: ${topic} (${mastery}) needs support. Slow down and consider 50:50 early.`,
      };
    }

    if (accuracy >= 0.8 && avgResponseSeconds <= 12) {
      return {
        timeLimit: Math.max(MIN_TIME_PER_QUESTION, TIME_PER_QUESTION - 6),
        hint: `Adaptive Coach: ${topic} (${mastery}) is strong. Push faster precision this round.`,
      };
    }

    return {
      timeLimit: TIME_PER_QUESTION,
      hint: "Select your best option and press Lock Answer.",
    };
  }

  function recordPerformance(isCorrect, outcome, meta = {}) {
    const question = state.currentQuestionData;
    if (!question) return;
    state.performanceLog.push({
      topic: inferTopic(question.questionText),
      isCorrect,
      outcome,
      responseSeconds: Math.max(0, state.currentTimeLimit - Math.max(0, state.timeLeft)),
      timeLimit: state.currentTimeLimit,
      questionText: meta.questionText || question.questionText,
      userAnswer: meta.userAnswer || "",
      correctAnswer: meta.correctAnswer || question.correctAnswer,
    });
  }

  async function submitRoundReportToBackend(payload) {
    if (!window.QuizAppApi) {
      return;
    }

    const record = payload && payload.latestRecord ? payload.latestRecord : null;

    const report = {
      quizName: "Knowledge Quest 3D",
      score: state.clearedQuestions,
      totalQuestions: state.totalQuestions,
      winnings: payload.winnings || 0,
      status: payload.isWin ? "win" : "loss",
      reason: payload.reason || "",
      roundTimestamp: Date.now(),
      topicStats: (record && record.topicStats) || buildRoundTopicStats(),
      questions: state.performanceLog.map((item, index) => ({
        questionNumber: index + 1,
        topic: item.topic,
        questionText: item.questionText,
        userAnswer: item.userAnswer,
        correctAnswer: item.correctAnswer,
        isCorrect: !!item.isCorrect,
        responseSeconds: Number(item.responseSeconds || 0),
        outcome: item.outcome,
      })),
    };

    try {
      await window.QuizAppApi.submitRoundReport(report);
      setHint("Round complete. AI tracking runs in the background.");
    } catch (_error) {
      // Report sync is best-effort; local gameplay should not fail if backend is unavailable.
    }
  }

  function setResultsInsightsText(text) {
    if (!dom.resultsInsights) {
      return;
    }
    dom.resultsInsights.textContent = text;
  }

  async function loadBackendInsightsForResults(localSnapshot) {
    if (!window.QuizAppApi || typeof window.QuizAppApi.getPostRoundInsights !== "function") {
      setResultsInsightsText(buildFallbackInsights(localSnapshot));
      return;
    }

    try {
      const insights = await window.QuizAppApi.getPostRoundInsights();
      if (!insights || typeof insights !== "object") {
        setResultsInsightsText(buildFallbackInsights(localSnapshot));
        return;
      }

      const lines = [
        `Backend trend: ${insights.recentTrend || "No trend returned."}`,
        `Overall accuracy: ${typeof insights.overallAccuracy === "number" ? `${Math.round(insights.overallAccuracy * 100)}%` : "N/A"}`,
        `Strong topics: ${insights.strongTopics && insights.strongTopics.length ? insights.strongTopics.join(", ") : "Not enough signal yet."}`,
        `Weak topics: ${insights.weakTopics && insights.weakTopics.length ? insights.weakTopics.join(", ") : "No persistent weak topics."}`,
        `Recommendation: ${insights.recommendation || "Keep practicing and complete a few more rounds."}`,
      ];

      setResultsInsightsText(lines.join("\n"));
    } catch (_error) {
      setResultsInsightsText(buildFallbackInsights(localSnapshot));
    }
  }

  function buildFallbackInsights(localSnapshot) {
    const snapshot = localSnapshot || {};
    const coaching = snapshot.coaching || { recommendations: [], weaknesses: [] };
    const aggregate = snapshot.aggregate || { weaknesses: [] };
    const trend = snapshot.trend || "No trend yet.";

    return [
      `Backend insights unavailable. Using local adaptive summary.`,
      `Trend: ${trend}`,
      `Weak topics: ${aggregate.weaknesses.length ? aggregate.weaknesses.join(", ") : "No persistent weak topics."}`,
      `Recommendation: ${coaching.recommendations && coaching.recommendations.length ? coaching.recommendations[0] : "Keep building attempts for stronger analytics."}`,
    ].join("\n");
  }

  function buildCoachingSummary() {
    if (!state.performanceLog.length) {
      return {
        summary: "No attempts recorded yet.",
        weaknesses: [],
        recommendations: ["Play another round to generate a learning profile."],
      };
    }

    const topicStats = {};
    let totalSeconds = 0;
    state.performanceLog.forEach((item) => {
      if (!topicStats[item.topic]) {
        topicStats[item.topic] = { attempts: 0, correct: 0 };
      }
      topicStats[item.topic].attempts += 1;
      topicStats[item.topic].correct += item.isCorrect ? 1 : 0;
      totalSeconds += item.responseSeconds;
    });

    const avgResponse = totalSeconds / state.performanceLog.length;
    const weaknesses = Object.entries(topicStats)
      .map(([topic, stats]) => ({
        topic,
        accuracy: stats.correct / stats.attempts,
        attempts: stats.attempts,
      }))
      .filter((row) => row.accuracy <= 0.5)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 2)
      .map((row) => `${row.topic} (${Math.round(row.accuracy * 100)}% over ${row.attempts})`);

    const recommendations = [];
    if (weaknesses.length) {
      recommendations.push(`Review weak topics first: ${weaknesses.join(", ")}.`);
    } else {
      recommendations.push("Keep current momentum and increase question difficulty.");
    }
    if (avgResponse > 16) {
      recommendations.push("Speed drill: aim to commit within 12-15 seconds.");
    } else {
      recommendations.push("Tempo is strong. Focus on precision under pressure.");
    }

    return {
      summary: `${state.clearedQuestions}/${state.totalQuestions} correct, average response ${avgResponse.toFixed(1)}s.`,
      weaknesses,
      recommendations,
    };
  }

  function persistRoundHistory(coaching) {
    const topicStats = buildRoundTopicStats();
    const record = {
      ts: Date.now(),
      score: state.clearedQuestions,
      total: state.totalQuestions,
      weaknesses: coaching.weaknesses,
      topicStats,
    };

    let history = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(PERFORMANCE_HISTORY_KEY) || "[]");
      if (Array.isArray(parsed)) history = parsed;
    } catch (_error) {
      history = [];
    }
    history.push(record);
    history = history.slice(-25);
    localStorage.setItem(PERFORMANCE_HISTORY_KEY, JSON.stringify(history));
    updateAdaptiveProfileFromRound(record);
    return history;
  }

  function loadAdaptiveProfile() {
    const fallback = {
      rounds: 0,
      topics: {},
      focusTopics: [],
      lastUpdated: null,
    };

    try {
      const parsed = JSON.parse(localStorage.getItem(ADAPTIVE_PROFILE_KEY) || "null");
      if (!parsed || typeof parsed !== "object") return fallback;
      return {
        rounds: Number(parsed.rounds || 0),
        topics: parsed.topics && typeof parsed.topics === "object" ? parsed.topics : {},
        focusTopics: Array.isArray(parsed.focusTopics) ? parsed.focusTopics : [],
        lastUpdated: parsed.lastUpdated || null,
      };
    } catch (_error) {
      return fallback;
    }
  }

  function updateAdaptiveProfileFromRound(roundRecord) {
    const profile = state.adaptiveProfile || loadAdaptiveProfile();
    profile.rounds += 1;

    const roundStats = roundRecord.topicStats || {};
    Object.entries(roundStats).forEach(([topic, values]) => {
      if (!profile.topics[topic]) {
        profile.topics[topic] = {
          attempts: 0,
          correct: 0,
          avgResponseSeconds: 0,
        };
      }

      const topicProfile = profile.topics[topic];
      const attempts = Number(values.attempts || 0);
      const correct = Number(values.correct || 0);
      const responseSeconds = Number(values.responseSeconds || 0);
      const roundAvgResponse = attempts > 0 ? responseSeconds / attempts : 0;
      const prevAttempts = topicProfile.attempts;

      topicProfile.attempts += attempts;
      topicProfile.correct += correct;
      topicProfile.avgResponseSeconds =
        (topicProfile.avgResponseSeconds * prevAttempts + roundAvgResponse * attempts) /
        Math.max(1, topicProfile.attempts);
      topicProfile.mastery = getMasteryLabel(
        topicProfile.correct / Math.max(1, topicProfile.attempts),
        topicProfile.attempts,
      );
    });

    profile.focusTopics = Object.entries(profile.topics)
      .map(([topic, values]) => ({
        topic,
        attempts: Number(values.attempts || 0),
        accuracy:
          Number(values.attempts || 0) > 0
            ? Number(values.correct || 0) / Number(values.attempts || 0)
            : 1,
      }))
      .filter((row) => row.attempts >= 3)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 3)
      .map((row) => row.topic);

    profile.lastUpdated = Date.now();
    localStorage.setItem(ADAPTIVE_PROFILE_KEY, JSON.stringify(profile));
    state.adaptiveProfile = profile;
    syncAdaptiveControls();
    return profile;
  }

  function loadAdaptiveSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ADAPTIVE_SETTINGS_KEY) || "null");
      if (!parsed || typeof parsed !== "object") return true;
      return parsed.enabled !== false;
    } catch (_error) {
      return true;
    }
  }

  function saveAdaptiveSettings(enabled) {
    localStorage.setItem(ADAPTIVE_SETTINGS_KEY, JSON.stringify({ enabled: !!enabled, ts: Date.now() }));
  }

  function syncAdaptiveControls() {
    if (dom.btnAdaptiveToggle) {
      dom.btnAdaptiveToggle.textContent = state.adaptiveEnabled ? "Adaptive: ON" : "Adaptive: OFF";
      dom.btnAdaptiveToggle.classList.toggle("inactive", !state.adaptiveEnabled);
    }
    if (dom.btnAdaptiveReset) {
      const hasRounds = !!(state.adaptiveProfile && Number(state.adaptiveProfile.rounds || 0) > 0);
      dom.btnAdaptiveReset.disabled = !hasRounds;
    }
  }

  function toggleAdaptiveMode() {
    state.adaptiveEnabled = !state.adaptiveEnabled;
    saveAdaptiveSettings(state.adaptiveEnabled);
    syncAdaptiveControls();
    setHint(
      state.adaptiveEnabled
        ? "Adaptive Coach enabled. Support now adjusts to your topic performance."
        : "Adaptive Coach disabled. Using standard timing and neutral hints.",
    );
  }

  function resetAdaptiveProfile() {
    if (!window.confirm("Reset adaptive memory and topic mastery for this browser?")) {
      return;
    }

    localStorage.removeItem(ADAPTIVE_PROFILE_KEY);
    state.adaptiveProfile = loadAdaptiveProfile();
    syncAdaptiveControls();
    setHint("Adaptive memory reset complete. New rounds will rebuild your profile.");
  }

  function getMasteryLabel(accuracy, attempts) {
    if (attempts < 3) return "Uncalibrated";
    if (accuracy >= 0.85 && attempts >= 8) return "Mastery";
    if (accuracy >= 0.65) return "Developing";
    return "Needs Work";
  }

  function getAdaptiveAssistanceFactor(topic) {
    if (!state.adaptiveEnabled) {
      return 0;
    }
    const profile = state.adaptiveProfile || loadAdaptiveProfile();
    const topicProfile = profile.topics && profile.topics[topic] ? profile.topics[topic] : null;
    if (!topicProfile || Number(topicProfile.attempts || 0) < 3) {
      return 0;
    }

    const accuracy = Number(topicProfile.correct || 0) / Math.max(1, Number(topicProfile.attempts || 0));
    const weaknessScore = Math.max(0, 0.7 - accuracy);
    return Math.min(1, weaknessScore / 0.7);
  }

  function buildMasterySummary(profile) {
    const topicRows = Object.entries((profile && profile.topics) || {})
      .map(([topic, values]) => {
        const attempts = Number(values.attempts || 0);
        const correct = Number(values.correct || 0);
        const accuracy = attempts > 0 ? correct / attempts : 0;
        const mastery = values.mastery || getMasteryLabel(accuracy, attempts);
        return {
          topic,
          attempts,
          mastery,
          accuracy,
        };
      })
      .filter((row) => row.attempts >= 3)
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 4);

    return topicRows.map((row) => `${row.topic}: ${row.mastery} (${Math.round(row.accuracy * 100)}%)`).join(" | ");
  }

  function buildTrendSummary(history) {
    if (!history.length) return "No history yet.";
    const recent = history.slice(-8);
    const avg = recent.reduce((sum, item) => sum + (item.total ? item.score / item.total : 0), 0) / recent.length;
    return `${recent.length} round avg accuracy ${Math.round(avg * 100)}%`;
  }

  function buildRoundTopicStats() {
    const stats = {};
    state.performanceLog.forEach((item) => {
      if (!stats[item.topic]) {
        stats[item.topic] = { attempts: 0, correct: 0, responseSeconds: 0 };
      }
      stats[item.topic].attempts += 1;
      stats[item.topic].correct += item.isCorrect ? 1 : 0;
      stats[item.topic].responseSeconds += Number(item.responseSeconds || 0);
    });
    return stats;
  }

  function buildAggregateWeaknessProfile(history) {
    const topicTotals = {};
    history.forEach((round) => {
      const roundStats = round.topicStats || {};
      Object.entries(roundStats).forEach(([topic, values]) => {
        if (!topicTotals[topic]) {
          topicTotals[topic] = { attempts: 0, correct: 0 };
        }
        topicTotals[topic].attempts += Number(values.attempts || 0);
        topicTotals[topic].correct += Number(values.correct || 0);
      });
    });

    const weaknesses = Object.entries(topicTotals)
      .map(([topic, values]) => ({
        topic,
        attempts: values.attempts,
        accuracy: values.attempts > 0 ? values.correct / values.attempts : 0,
      }))
      .filter((row) => row.attempts >= 2 && row.accuracy <= 0.6)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 3)
      .map((row) => `${row.topic} (${Math.round(row.accuracy * 100)}% over ${row.attempts})`);

    return { weaknesses };
  }

  function shouldPromptForImprovement(history, aggregate) {
    if (history.length < COACH_PROMPT_EVERY_ROUNDS) {
      return false;
    }

    let promptState = { lastPromptRound: 0 };
    try {
      const parsed = JSON.parse(localStorage.getItem(COACH_PROMPT_STATE_KEY) || "null");
      if (parsed && typeof parsed === "object") {
        promptState = {
          lastPromptRound: Number(parsed.lastPromptRound || 0),
        };
      }
    } catch (_error) {
      promptState = { lastPromptRound: 0 };
    }

    const roundsSincePrompt = history.length - promptState.lastPromptRound;
    const checkpointDue = roundsSincePrompt >= COACH_PROMPT_EVERY_ROUNDS;
    const hasPersistentWeakness = aggregate.weaknesses.length > 0;

    return checkpointDue && hasPersistentWeakness;
  }

  function maybePromptImprovementPlan(coaching, aggregate, history) {
    if (!shouldPromptForImprovement(history, aggregate)) {
      setHint("Round complete. AI tracking runs in the background.");
      return;
    }

    const planText = coaching.recommendations.join(" ");
    localStorage.setItem(IMPROVEMENT_PREF_KEY, "auto");
    localStorage.setItem(
      COACH_PROMPT_STATE_KEY,
      JSON.stringify({ lastPromptRound: history.length, ts: Date.now() }),
    );
    localStorage.setItem(
      "slidePlayJeopardy3dLatestPlan",
      JSON.stringify({ ts: Date.now(), weaknesses: aggregate.weaknesses, planText }),
    );
    setHint("Round complete. AI tracking runs in the background.");
  }

  function resetRoundUI() {
    state.currentQuestionData = null;
    state.selectedOptionIndex = null;
    state.questionLocked = false;
    state.currentQuestionIndex = -1;
    state.clearedQuestions = 0;
    state.usedFiftyFifty = false;
    state.usedCallFriend = false;
    state.usedAskAudience = false;
    state.performanceLog = [];

    dom.hudQnum.textContent = "1";
    dom.hudQtotal.textContent = String(state.totalQuestions || 10);
    dom.hudTimer.textContent = String(TIME_PER_QUESTION);
    dom.hudWinnings.textContent = "0";
    dom.btnLock.disabled = true;
    dom.btnNext.disabled = true;
    dom.feedbackToast.classList.remove("show-correct", "show-incorrect");
    dom.feedbackToast.textContent = "";
    syncAdaptiveControls();

    dom.answerButtons.forEach((button) => {
      button.classList.remove("correct-flash", "incorrect-flash", "selected", "eliminated");
      button.disabled = false;
      button.textContent = "---";
      button.style.display = "";
    });
  }

  function resetAnswerButtons() {
    dom.answerButtons.forEach((button) => {
      button.classList.remove("correct-flash", "incorrect-flash", "selected", "eliminated");
      button.disabled = false;
      button.textContent = "---";
      button.style.display = "";
    });
  }

  function setHint(text) {
    dom.hintLine.textContent = text;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString("en-US");
  }

  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    // Only auto-init if flow manager is NOT present (direct access / legacy mode)
    if (typeof window.GameFlowManager === "undefined") {
      void init();
    }
    // Otherwise, GameFlowManager will call startWithParams() when ready
  });

  // Export game engine for flow manager
  window.gameEngine = {
    startWithParams,
    init,
    startGame,
    endGame,
    getCurrentState: () => state,
  };
})();
