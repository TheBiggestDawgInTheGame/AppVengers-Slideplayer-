//Main Application
/**
 * app.js - Main application controller
 */
(function () {
  const DEFAULT_QUIZ_QUESTION_COUNT = 20;

  // DOM Elements
  const uploadPanel = document.getElementById("upload-panel");
  const fileDropZone = document.getElementById("file-drop-zone");
  const fileInput = document.getElementById("file-input");
  const uploadStatus = document.getElementById("upload-status");
  const gameHud = document.getElementById("game-hud");
  const answersContainer = document.getElementById("answers-container");
  const feedbackToast = document.getElementById("feedback-toast");
  const resultsPanel = document.getElementById("results-panel");
  const finalScoreEl = document.getElementById("final-score");
  const resultsDetail = document.getElementById("results-detail");
  const btnRestart = document.getElementById("btn-restart");
  const hudQnum = document.getElementById("hud-qnum");
  const hudQtotal = document.getElementById("hud-qtotal");
  const hudScore = document.getElementById("hud-score");
  const hudStreak = document.getElementById("hud-streak");
  const answerButtons = document.querySelectorAll(".answer-btn");

  let gameActive = false;
  let currentQuestionData = null;
  let answerLocked = false;

  // Initialize 3D scene
  GameScene.init();

  // Set up PDF.js worker
  if (typeof pdfjsLib !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  // Event: File drop zone click
  fileDropZone.addEventListener("click", () => {
    fileInput.click();
  });

  // Event: File input change
  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });

  // Event: Drag and drop
  fileDropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileDropZone.classList.add("drag-over");
  });

  fileDropZone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileDropZone.classList.remove("drag-over");
  });

  fileDropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileDropZone.classList.remove("drag-over");
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  // Event: Answer buttons
  answerButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!gameActive || answerLocked) return;
      const index = parseInt(btn.getAttribute("data-index"));
      if (
        currentQuestionData &&
        index >= 0 &&
        index < currentQuestionData.options.length
      ) {
        submitAnswer(currentQuestionData.options[index]);
      }
    });
  });

  // Event: Restart
  btnRestart.addEventListener("click", restartGame);

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (!gameActive || answerLocked) return;
    const key = e.key.toLowerCase();
    const keyMap = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };
    if (keyMap[key] !== undefined && currentQuestionData) {
      submitAnswer(currentQuestionData.options[keyMap[key]]);
    }
  });

  async function handleFile(file) {
    uploadStatus.textContent = "📖 Reading file...";
    uploadStatus.style.color = "#8ab4d8";

    try {
      const text = await QuizEngine.parseFile(file);
      uploadStatus.textContent = "🧠 Generating questions...";
      uploadStatus.style.color = "#f7d774";

      // Small delay for visual feedback
      await new Promise((r) => setTimeout(r, 800));

      const questionCount = QuizEngine.generateQuestions(text, DEFAULT_QUIZ_QUESTION_COUNT);
      uploadStatus.textContent = `✅ Generated ${questionCount} questions! Starting game...`;
      uploadStatus.style.color = "#2ecc71";

      await new Promise((r) => setTimeout(r, 1200));
      startGame();
    } catch (error) {
      uploadStatus.textContent = "❌ " + error.message;
      uploadStatus.style.color = "#e74c3c";
      console.error("File processing error:", error);
    }
  }

  function startGame() {
    QuizEngine.reset();
    gameActive = true;
    answerLocked = false;

    // Hide upload panel
    uploadPanel.classList.add("hidden");

    // Show HUD
    gameHud.classList.add("visible");
    answersContainer.classList.add("visible");

    // Update 3D screen
    GameScene.updateQuestionScreen("Get ready...");
    GameScene.updateAllAnswerScreens(["", "", "", ""]);

    // Reset buttons
    answerButtons.forEach((b) => {
      b.classList.remove("correct-flash", "incorrect-flash");
      b.disabled = false;
      b.textContent = "---";
    });

    // Hide results
    resultsPanel.classList.remove("show");

    // Load first question
    setTimeout(() => {
      loadNextQuestion();
    }, 1500);
  }

  function loadNextQuestion() {
    if (!gameActive) return;

    const question = QuizEngine.getNextQuestion();
    if (!question) {
      endGame();
      return;
    }

    currentQuestionData = question;
    answerLocked = false;

    // Update 3D screens
    GameScene.updateQuestionScreen(question.questionText);
    GameScene.updateAllAnswerScreens(question.options);

    // Update HUD
    const progress = QuizEngine.getProgress();
    hudQnum.textContent = progress.current;
    hudQtotal.textContent = progress.total;
    hudScore.textContent = progress.score;
    hudStreak.textContent = progress.streak;

    // Update answer buttons
    answerButtons.forEach((btn, i) => {
      btn.classList.remove("correct-flash", "incorrect-flash");
      btn.disabled = false;
      if (i < question.options.length) {
        btn.textContent = question.options[i];
        btn.style.display = "";
      } else {
        btn.style.display = "none";
      }
    });

    // Reset feedback
    feedbackToast.classList.remove("show-correct", "show-incorrect");
    feedbackToast.textContent = "";
  }

  function submitAnswer(selectedAnswer) {
    if (!gameActive || answerLocked || !currentQuestionData) return;

    answerLocked = true;
    const result = QuizEngine.checkAnswer(selectedAnswer);

    // Find which button was selected
    const selectedIndex = currentQuestionData.options.findIndex(
      (opt) => opt.trim().toLowerCase() === selectedAnswer.trim().toLowerCase(),
    );
    const correctIndex = currentQuestionData.options.findIndex(
      (opt) =>
        opt.trim().toLowerCase() === result.correctAnswer.trim().toLowerCase(),
    );

    // Flash buttons
    answerButtons.forEach((btn, i) => {
      btn.disabled = true;
      if (i === correctIndex) {
        btn.classList.add("correct-flash");
      } else if (i === selectedIndex && selectedIndex !== correctIndex) {
        btn.classList.add("incorrect-flash");
      }
    });

    // Flash 3D answer screens
    if (correctIndex >= 0) {
      GameScene.flashAnswerScreen(correctIndex, 0x2ecc71);
    }
    if (selectedIndex >= 0 && selectedIndex !== correctIndex) {
      GameScene.flashAnswerScreen(selectedIndex, 0xe74c3c);
    }

    // Update HUD
    hudScore.textContent = result.score;
    hudStreak.textContent = result.streak;

    // Show feedback toast
    if (result.isCorrect) {
      feedbackToast.textContent = "✅ CORRECT!";
      feedbackToast.classList.add("show-correct");
      feedbackToast.classList.remove("show-incorrect");
      // Update question screen briefly
      GameScene.updateQuestionScreen(
        "✅ Correct!\n" + currentQuestionData.correctAnswer,
      );
    } else {
      feedbackToast.textContent = "❌ WRONG";
      feedbackToast.classList.add("show-incorrect");
      feedbackToast.classList.remove("show-correct");
      GameScene.updateQuestionScreen(
        "❌ The answer was:\n" + result.correctAnswer,
      );
    }

    // Wait then load next
    setTimeout(() => {
      feedbackToast.classList.remove("show-correct", "show-incorrect");
      feedbackToast.textContent = "";

      if (QuizEngine.hasMoreQuestions()) {
        loadNextQuestion();
      } else {
        endGame();
      }
    }, 2000);
  }

  function endGame() {
    gameActive = false;
    const progress = QuizEngine.getProgress();

    // Update 3D screen
    GameScene.updateQuestionScreen("🏆 Game Complete!");
    GameScene.updateAllAnswerScreens([
      "Great",
      "Job!",
      "Thanks for",
      "Playing!",
    ]);

    // Hide answer buttons
    answersContainer.classList.remove("visible");
    answerButtons.forEach((b) => (b.disabled = true));

    // Show results
    finalScoreEl.textContent = progress.score;
    const total = progress.total;
    const correctCount = Math.round(
      (progress.score - progress.bestStreak * 10) / 100,
    );
    const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    resultsDetail.textContent = `You answered approximately ${Math.max(0, Math.min(total, Math.round(progress.score / 100)))} out of ${total} correctly (est. ${percentage}%)\nBest streak: ${progress.bestStreak} 🔥`;
    resultsPanel.classList.add("show");

    // Flash all screens
    for (let i = 0; i < 4; i++) {
      setTimeout(() => GameScene.flashAnswerScreen(i, 0xf7d774), i * 200);
    }
  }

  function restartGame() {
    resultsPanel.classList.remove("show");
    gameActive = false;
    answerLocked = false;
    currentQuestionData = null;

    // Reset UI
    gameHud.classList.remove("visible");
    answersContainer.classList.remove("visible");
    answerButtons.forEach((b) => {
      b.classList.remove("correct-flash", "incorrect-flash");
      b.disabled = false;
      b.textContent = "---";
    });
    feedbackToast.classList.remove("show-correct", "show-incorrect");
    feedbackToast.textContent = "";

    // Reset 3D screens
    GameScene.updateQuestionScreen(
      "Upload learning material\nto begin the game show!",
    );
    GameScene.updateAllAnswerScreens(["", "", "", ""]);

    // Reset HUD values
    hudQnum.textContent = "1";
    hudQtotal.textContent = String(DEFAULT_QUIZ_QUESTION_COUNT);
    hudScore.textContent = "0";
    hudStreak.textContent = "0";

    // Show upload panel
    uploadPanel.classList.remove("hidden");
    uploadStatus.textContent = "";
    fileInput.value = "";

    QuizEngine.reset();
  }

  // Log initialization
  console.log("🎯 Knowledge Quest 3D Game Show initialized!");
  console.log("📁 Drop a .txt, .pdf, or .docx file to begin");
  console.log("⌨️ Keyboard shortcuts: 1-4 or A-D to select answers");
  console.log("🖱️ Click answer buttons or use keyboard to play");
})();
