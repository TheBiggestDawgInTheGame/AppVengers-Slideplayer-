function displayQuestion(index) {
  const question = quizData[index];
  currentQuestionIndex = index;
  window.__jeopardyQuizQuestionStartedAt = Date.now();

  // Update question display
  document.getElementById("question-text").textContent = question.question;
  document.getElementById("question-category").textContent = question.category;
  document.getElementById("current-question").textContent = index + 1;

  // Clear previous answers
  const answersContainer = document.getElementById("answers-container");
  answersContainer.innerHTML = "";

  // Add answer buttons
  question.answers.forEach((answer) => {
    const button = document.createElement("button");
    button.className = "answer-btn";
    button.textContent = answer;
    button.dataset.correct =
      answer === question.correctAnswer ? "true" : "false";
    button.addEventListener("click", handleAnswerClick);
    answersContainer.appendChild(button);
  });

  // Reset timer
  stopTimer();
  startTimer();

  // Reset button states
  document.querySelectorAll(".answer-btn").forEach((btn) => {
    btn.classList.remove("correct", "incorrect");
    btn.disabled = false;
  });
}

function handleAnswerClick(event) {
  const button = event.target;
  const isCorrect = button.dataset.correct === "true";
  const question = quizData[currentQuestionIndex] || {};
  const startedAt = Number(window.__jeopardyQuizQuestionStartedAt || Date.now());
  const responseSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));

  // Stop timer
  stopTimer();

  // Disable all buttons
  document.querySelectorAll(".answer-btn").forEach((btn) => {
    btn.disabled = true;
    if (btn.dataset.correct === "true") {
      btn.classList.add("correct");
    }
  });

  // Highlight user's choice
  if (!isCorrect) {
    button.classList.add("incorrect");
  } else {
    // Add points for correct answer
    score += 100;
    document.getElementById("current-score").textContent = score;
  }

  questionResults.push({
    category: question.category || "General",
    correct: isCorrect,
  });

  if (Array.isArray(window.__jeopardyQuizAttempts)) {
    window.__jeopardyQuizAttempts.push({
      questionNumber: currentQuestionIndex + 1,
      questionText: question.question || "",
      userAnswer: button.textContent || "",
      correctAnswer: question.correctAnswer || "",
      correct: isCorrect,
      responseSeconds,
      category: question.category || "General",
      outcome: "answered",
    });
  }

  // Move to next question after delay
  setTimeout(() => {
    if (currentQuestionIndex < quizData.length - 1) {
      displayQuestion(currentQuestionIndex + 1);
    } else {
      showResults();
    }
  }, 2000);
}

window.displayQuestion = displayQuestion;
window.handleAnswerClick = handleAnswerClick;
