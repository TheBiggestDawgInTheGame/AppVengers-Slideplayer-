// Global variables
let currentFiles = [];
let quizData = [];
let currentQuestionIndex = 0;
let score = 0;
let timerInterval;
let timeLeft = 30;
let questionResults = [];
let questionAttempts = [];
let gameStartedAt = 0;
let reportSubmitted = false;

// Initialize Three.js scene for 3D background
function initThreeJSScene() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000,
  );
  const renderer = new THREE.WebGLRenderer({ alpha: true });

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  document.getElementById("threejs-scene").appendChild(renderer.domElement);

  // Create stars
  const starsGeometry = new THREE.BufferGeometry();
  const starsMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.1,
  });

  const starsVertices = [];
  for (let i = 0; i < 10000; i++) {
    const x = (Math.random() - 0.5) * 2000;
    const y = (Math.random() - 0.5) * 2000;
    const z = (Math.random() - 0.5) * 2000;
    starsVertices.push(x, y, z);
  }

  starsGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(starsVertices, 3),
  );
  const starField = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(starField);

  camera.position.z = 5;

  function animate() {
    requestAnimationFrame(animate);

    // Rotate stars slowly
    starField.rotation.x += 0.0001;
    starField.rotation.y += 0.0001;

    renderer.render(scene, camera);
  }

  animate();

  // Handle window resize
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// Initialize the game
document.addEventListener("DOMContentLoaded", () => {
  initThreeJSScene();
  initializeUploadScreen();
});

// Utility functions
function switchScreen(screenId) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("active");
  });
  document.getElementById(screenId).classList.add("active");
}

function updateTimer() {
  const timerProgress = document.getElementById("timer-progress");
  if (timeLeft > 0) {
    timeLeft--;
    timerProgress.style.width = `${(timeLeft / 30) * 100}%`;
  } else {
    clearInterval(timerInterval);
    handleTimeUp();
  }
}

function startTimer() {
  timeLeft = 30;
  document.getElementById("timer-progress").style.width = "100%";
  timerInterval = setInterval(updateTimer, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}

function handleTimeUp() {
  // Show correct answer and move to next question
  const currentQuestion = quizData[currentQuestionIndex] || {};
  const startedAt = Number(window.__jeopardyQuizQuestionStartedAt || Date.now());
  const responseSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));

  questionResults.push({
    category: currentQuestion?.category || "General",
    correct: false,
  });
  questionAttempts.push({
    questionNumber: currentQuestionIndex + 1,
    questionText: currentQuestion.question || "",
    userAnswer: "",
    correctAnswer: currentQuestion.correctAnswer || "",
    correct: false,
    responseSeconds,
    category: currentQuestion.category || "General",
    outcome: "timeout",
  });

  const answerButtons = document.querySelectorAll(".answer-btn");
  answerButtons.forEach((btn) => {
    if (btn.dataset.correct === "true") {
      btn.classList.add("correct");
    }
    btn.disabled = true;
  });

  setTimeout(() => {
    nextQuestion();
  }, 2000);
}

function nextQuestion() {
  currentQuestionIndex++;
  if (currentQuestionIndex < quizData.length) {
    displayQuestion(currentQuestionIndex);
  } else {
    showResults();
  }
}

function showResults() {
  switchScreen("results-screen");
  document.getElementById("final-score").textContent = score;
  const accuracy = Math.round((score / (quizData.length * 100)) * 100);
  document.getElementById("accuracy-percent").textContent = accuracy;

  // Create simple performance chart
  createPerformanceChart();
  void submitPremiumReportForJeopardyQuiz();
}

async function submitPremiumReportForJeopardyQuiz() {
  if (reportSubmitted) return;
  if (!window.PremiumGameReporter || typeof window.PremiumGameReporter.submitReport !== "function") return;

  const correctCount = questionAttempts.filter((item) => item.correct).length;
  const durationSec = Math.max(0, Math.round((Date.now() - gameStartedAt) / 1000));

  const payload = {
    gameType: "jeopardy-quiz",
    score,
    totalQuestions: quizData.length,
    correctCount,
    durationSec,
    questionAttempts,
    meta: {
      source: "jeopardy-quiz",
      categoryCount: new Set(questionAttempts.map((item) => item.category || "General")).size,
    },
  };

  const result = await window.PremiumGameReporter.submitReport(payload);
  if (result && result.ok) {
    reportSubmitted = true;
  }
}

function createPerformanceChart() {
  const chartContainer = document.getElementById("performance-chart");
  chartContainer.innerHTML = "";

  const categories = {};
  quizData.forEach((q, index) => {
    const category = q.category || "General";
    if (!categories[category]) {
      categories[category] = { total: 0, correct: 0 };
    }
    categories[category].total++;

    if (questionResults[index]?.correct) {
      categories[category].correct++;
    }
  });

  Object.entries(categories).forEach(([category, data]) => {
    const bar = document.createElement("div");
    bar.className = "chart-bar";
    const percentage = data.total > 0 ? (data.correct / data.total) * 100 : 0;
    bar.style.height = `${Math.max(36, percentage * 1.45)}px`;
    bar.innerHTML = `<div class="chart-label">${category}<span>${Math.round(percentage)}%</span></div>`;
    chartContainer.appendChild(bar);
  });
}

// Event listeners
document.getElementById("restart-btn").addEventListener("click", () => {
  location.reload();
});

gameStartedAt = Date.now();
window.__jeopardyQuizAttempts = questionAttempts;

window.addEventListener("beforeunload", () => {
  questionResults = [];
  questionAttempts = [];
});
