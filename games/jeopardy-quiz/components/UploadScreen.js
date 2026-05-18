function initializeUploadScreen() {
  const fileInput = document.getElementById("file-input");
  const fileList = document.getElementById("file-list");
  const startGameBtn = document.getElementById("start-game-btn");

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
    // Read file contents
    const fileContents = await FileReaderUtil.readMultipleFiles(currentFiles);

    // Generate quiz questions
    quizData = QuizGenerator.generateQuestionsFromFileContent(fileContents);

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
