// Global variables
let currentFiles = [];
let quizData = [];
let currentQuestionIndex = 0;
let score = 0;
let timerInterval;
let timeLeft = 30;

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
}

function createPerformanceChart() {
  const chartContainer = document.getElementById("performance-chart");
  chartContainer.innerHTML = "";

  const categories = {};
  quizData.forEach((q) => {
    const category = q.category || "General";
    if (!categories[category]) {
      categories[category] = { total: 0, correct: 0 };
    }
    categories[category].total++;
    // This would need more complex tracking in a real implementation
  });

  Object.keys(categories).forEach((category) => {
    const bar = document.createElement("div");
    bar.className = "chart-bar";
    bar.style.height = `${Math.random() * 150 + 50}px`;
    bar.innerHTML = `<div class="chart-label">${category}</div>`;
    chartContainer.appendChild(bar);
  });
}

// Event listeners
document.getElementById("restart-btn").addEventListener("click", () => {
  location.reload();
});
