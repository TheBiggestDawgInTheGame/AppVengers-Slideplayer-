const JEOPARDY_QUIZ_COUNT_KEY = "slidePlayJeopardyQuizQuestionCount";

function normalizeQuestionCount(count) {
  if (window.QuizGenerator && typeof QuizGenerator.normalizeQuestionCount === "function") {
    return QuizGenerator.normalizeQuestionCount(count);
  }
  const parsed = Number.parseInt(count, 10);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(5, Math.min(40, parsed));
}

function getQuestionCountInput() {
  return document.getElementById("question-count-input");
}

function getRequestedQuestionCount() {
  const params = new URLSearchParams(window.location.search);
  const paramCount = params.get("count");
  const inputValue = getQuestionCountInput()?.value;
  let storedCount = null;

  try {
    storedCount = localStorage.getItem(JEOPARDY_QUIZ_COUNT_KEY);
  } catch (_error) {
    storedCount = null;
  }

  return normalizeQuestionCount(paramCount || inputValue || storedCount || 20);
}

function syncQuestionCountInput(count) {
  const normalized = normalizeQuestionCount(count);
  const input = getQuestionCountInput();
  if (input) input.value = String(normalized);
  try {
    localStorage.setItem(JEOPARDY_QUIZ_COUNT_KEY, String(normalized));
  } catch (_error) {}
  return normalized;
}

function initializeUploadScreen() {
  // If arriving from the main upload flow, use the pre-generated quiz directly
  const source = new URLSearchParams(window.location.search).get("source");
  syncQuestionCountInput(getRequestedQuestionCount());
  if (source === "upload") {
    try {
      const stored = JSON.parse(localStorage.getItem("slidePlayGeneratedQuizData") || "null");
      const uploadedFiles = JSON.parse(localStorage.getItem("slidePlayUploadedFiles") || "null");
      const requestedCount = getRequestedQuestionCount();
      const fallbackContents = Array.isArray(uploadedFiles)
        ? uploadedFiles
            .map(function (file, idx) {
              return {
                name: file.originalName || `uploaded-${idx + 1}`,
                content: String(file.extractedText || file.text || file.content || "").trim()
              };
            })
            .filter(function (file) { return file.content.length >= 50; })
        : [];

      if (Array.isArray(stored) && stored.length > 0) {
        const normalizedStored = stored
          .map(function (item, idx) {
            const opts = Array.isArray(item.options) ? item.options.map(String) : [];
            const correctIdx = Number.isInteger(item.correct) ? item.correct : 0;
            return {
              id: idx,
              question: String(item.question || item.questionText || "").trim(),
              answers: opts,
              correctAnswer: String(opts[correctIdx] || opts[0] || ""),
              category: "Uploaded Content",
              difficulty: "medium"
            };
          })
          .filter(function (q) { return q.question.length > 5 && q.answers.length > 0; });

        quizData = normalizedStored.length >= Math.min(3, requestedCount) || fallbackContents.length === 0
          ? normalizedStored.slice(0, requestedCount)
          : QuizGenerator.generateQuestionsFromFileContent(fallbackContents, requestedCount);

        if (quizData.length > 0) {
          document.getElementById("total-questions").textContent = quizData.length;
          switchScreen("question-screen");
          displayQuestion(0);
          return;
        }
      }
    } catch (_e) {}
  }

  const fileInput = document.getElementById("file-input");
  const fileList = document.getElementById("file-list");
  const startGameBtn = document.getElementById("start-game-btn");
  const questionCountInput = getQuestionCountInput();

  if (questionCountInput) {
    questionCountInput.addEventListener("input", function () {
      syncQuestionCountInput(this.value);
    });
  }

  fileInput.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files);
    currentFiles = files;

    // Display selected files
    fileList.innerHTML = "";
    files.forEach((file) => {
      const fileItem = document.createElement("div");
      fileItem.className = "file-item";
      fileItem.innerHTML = `
                <span>${file.name}</span>
                <span>${(file.size / 1024).toFixed(1)} KB</span>
            `;
      fileList.appendChild(fileItem);
    });

    // Enable start button if files are selected
    startGameBtn.disabled = files.length === 0;
  });

  startGameBtn.addEventListener("click", async () => {
    if (currentFiles.length > 0) {
      await startGame();
    }
  });
}

async function startGame() {
  try {
    const requestedCount = syncQuestionCountInput(getRequestedQuestionCount());
    // Read file contents
    const fileContents = await FileReaderUtil.readMultipleFiles(currentFiles);

    // Generate quiz questions
    quizData = QuizGenerator.generateQuestionsFromFileContent(fileContents, requestedCount);

    if (quizData.length === 0) {
      alert("Could not generate questions from the provided files.");
      return;
    }

    // Update UI with quiz information
    document.getElementById("total-questions").textContent = quizData.length;

    // Switch to question screen
    switchScreen("question-screen");

    // Display first question
    displayQuestion(0);
  } catch (error) {
    console.error("Error starting game:", error);
    alert("Error processing files. Please try again.");
  }
}

window.initializeUploadScreen = initializeUploadScreen;
