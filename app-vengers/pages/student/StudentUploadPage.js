let uploadedFiles = [];
let selectedMode = "";
let pendingFiles = [];
let modalSelection = "";
let pendingDemoTopic = "";

const GENERATED_QUIZ_KEY = "slidePlayGeneratedQuizData";
const UPLOADED_FILES_KEY = "slidePlayUploadedFiles";
const DEMO_SESSION_KEY = "slidePlayDemoSession";
const MODE_ENV_KEY = "slidePlayModeEnvironment";
const GAMES_ENDPOINT = "../../slide_upload/games.html";
const MODE_ENV_ENDPOINT = "StudentModeEnvironment.html";

const DEMO_TOPICS = {
  "data-modeling-demo-v1": {
    id: "data-modeling-demo-v1",
    title: "Data Modeling and ERD Fundamentals",
    files: [
      {
        originalName: "Demo Topic - Data Modeling and ERD Fundamentals.pdf",
        storedName: "demo-data-modeling-erd.pdf",
        size: 0,
        type: "application/pdf"
      }
    ],
    quizData: [
      { question: "What is the primary purpose of an Entity Relationship Diagram (ERD)?", options: ["To design user interface colors", "To model data entities and relationships", "To optimize CPU usage", "To compile source code"], correct: 1 },
      { question: "Which key uniquely identifies each row in a table?", options: ["Foreign key", "Primary key", "Composite note", "Alias key"], correct: 1 },
      { question: "A foreign key is mainly used to:", options: ["Encrypt data fields", "Create relationships across tables", "Sort values alphabetically", "Render chart legends"], correct: 1 }
    ]
  },
  "biology-cells-demo-v1": {
    id: "biology-cells-demo-v1",
    title: "Biology: Cells and Genetics",
    files: [
      {
        originalName: "Demo Topic - Biology Cells and Genetics.pdf",
        storedName: "demo-biology-cells.pdf",
        size: 0,
        type: "application/pdf"
      }
    ],
    quizData: [
      { question: "Which organelle is known as the powerhouse of the cell?", options: ["Nucleus", "Mitochondrion", "Ribosome", "Golgi apparatus"], correct: 1 },
      { question: "DNA is primarily located in which part of a eukaryotic cell?", options: ["Nucleus", "Cell membrane", "Cytoplasm only", "Lysosome"], correct: 0 },
      { question: "What process makes an exact copy of DNA before cell division?", options: ["Transcription", "Translation", "Replication", "Fermentation"], correct: 2 }
    ]
  },
  "world-history-demo-v1": {
    id: "world-history-demo-v1",
    title: "World History: Industrial Revolution",
    files: [
      {
        originalName: "Demo Topic - Industrial Revolution Overview.pdf",
        storedName: "demo-industrial-revolution.pdf",
        size: 0,
        type: "application/pdf"
      }
    ],
    quizData: [
      { question: "The Industrial Revolution first began in which country?", options: ["France", "Germany", "Great Britain", "United States"], correct: 2 },
      { question: "Which invention was crucial for mechanized textile production?", options: ["Printing press", "Steam engine", "Spinning jenny", "Telegraph"], correct: 2 },
      { question: "What major energy source powered many early factories?", options: ["Solar energy", "Coal", "Natural gas", "Nuclear power"], correct: 1 }
    ]
  }
};

document.addEventListener("DOMContentLoaded", function () {
  setupUploadArea();
  setupModeFlow();
  setupActions();
  setupDemoFlow();
  setupModeConfigs();
  syncDemoSessionBadge();
  renderFiles();
  updateModeLabel();
  updateModeConfigView();
});

function setupUploadArea() {
  const uploadArea = document.getElementById("slides-upload-area");
  const fileInput = document.getElementById("slides-input");
  const browseBtn = document.getElementById("browse-files-btn");

  if (browseBtn && fileInput) {
    browseBtn.addEventListener("click", function () {
      fileInput.click();
    });
  }

  if (uploadArea) {
    uploadArea.addEventListener("dragover", function (event) {
      event.preventDefault();
      uploadArea.classList.add("drag-over");
    });

    uploadArea.addEventListener("dragleave", function () {
      uploadArea.classList.remove("drag-over");
    });

    uploadArea.addEventListener("drop", function (event) {
      event.preventDefault();
      uploadArea.classList.remove("drag-over");
      requestModeThenAdd(event.dataTransfer.files);
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", function () {
      requestModeThenAdd(fileInput.files);
      fileInput.value = "";
    });
  }
}

function setupModeFlow() {
  const chooseBtn = document.getElementById("choose-mode-btn");
  const modal = document.getElementById("mode-modal");
  const closeBtn = document.getElementById("close-mode-modal");
  const confirmBtn = document.getElementById("confirm-mode-btn");
  const modeButtons = document.querySelectorAll(".mode-option");

  if (chooseBtn) {
    chooseBtn.addEventListener("click", function () {
      modalSelection = selectedMode;
      syncModeSelectionUI();
      openModeModal();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      closeModeModal();
      modalSelection = "";
      syncModeSelectionUI();
    });
  }

  if (modal) {
    modal.addEventListener("click", function (event) {
      if (event.target === modal) {
        closeModeModal();
      }
    });
  }

  modeButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      modalSelection = button.getAttribute("data-mode") || "";
      syncModeSelectionUI();
    });
  });

  if (confirmBtn) {
    confirmBtn.addEventListener("click", function () {
      if (!modalSelection) {
        return;
      }

      selectedMode = modalSelection;
      updateModeLabel();
      updateModeConfigView();
      closeModeModal();

      if (pendingFiles.length > 0) {
        addFiles(pendingFiles);
        pendingFiles = [];
      }

      if (pendingDemoTopic) {
        const topicToRun = pendingDemoTopic;
        pendingDemoTopic = "";
        activateDemoSlides(topicToRun);
      }
    });
  }
}

function setupActions() {
  const clearBtn = document.getElementById("clear-files-btn");
  const startBtn = document.getElementById("start-session-btn");

  if (clearBtn) {
    clearBtn.addEventListener("click", clearAllFiles);
  }

  if (startBtn) {
    startBtn.addEventListener("click", startModeSession);
  }
}

function setupDemoFlow() {
  const demoBtn = document.getElementById("use-demo-btn");
  const topicSelect = document.getElementById("demo-topic-select");

  if (!demoBtn || !topicSelect) {
    return;
  }

  demoBtn.addEventListener("click", function () {
    const topicId = topicSelect.value;

    if (!selectedMode) {
      pendingDemoTopic = topicId;
      modalSelection = "single";
      syncModeSelectionUI();
      openModeModal();
      return;
    }

    activateDemoSlides(topicId);
  });
}

function setupModeConfigs() {
  const roomInput = document.getElementById("multi-room-code");
  const roomBtn = document.getElementById("generate-room-code");

  if (roomBtn && roomInput) {
    roomBtn.addEventListener("click", function () {
      roomInput.value = makeRoomCode();
    });
  }

  if (roomInput) {
    roomInput.addEventListener("input", function () {
      roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    });
  }
}

function requestModeThenAdd(fileList) {
  const files = Array.from(fileList || []);
  if (files.length === 0) {
    return;
  }

  if (!selectedMode) {
    pendingFiles = files;
    modalSelection = "";
    syncModeSelectionUI();
    openModeModal();
    return;
  }

  addFiles(files);
}

function addFiles(files) {
  localStorage.removeItem(DEMO_SESSION_KEY);
  syncDemoSessionBadge();

  files.forEach(function (file) {
    if (file.size > 50 * 1024 * 1024) {
      alert('File "' + file.name + '" is too large. Maximum size is 50MB.');
      return;
    }

    uploadedFiles.push({
      id: "file_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      name: file.name,
      size: file.size,
      type: file.type || "",
      mode: selectedMode
    });
  });

  renderFiles();
}

function renderFiles() {
  const list = document.getElementById("files-list");
  if (!list) {
    return;
  }

  if (uploadedFiles.length === 0) {
    list.innerHTML = '<p class="empty-state"><i class="fa-solid fa-satellite-dish"></i> No files loaded - upload to begin.</p>';
    return;
  }

  list.innerHTML = uploadedFiles
    .map(function (fileObj) {
      return ""
        + '<div class="file-item">'
        + '  <div class="file-icon">' + getFileIcon(fileObj.type) + "</div>"
        + '  <div class="file-name">' + truncateName(fileObj.name) + "</div>"
        + '  <div class="file-size">' + formatFileSize(fileObj.size) + "</div>"
        + '  <div class="file-size mode-pill">' + prettyMode(fileObj.mode) + "</div>"
        + '  <button class="file-remove" data-id="' + fileObj.id + '">Remove</button>'
        + "</div>";
    })
    .join("");

  list.querySelectorAll(".file-remove").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const id = btn.getAttribute("data-id");
      removeFile(id || "");
    });
  });
}

function removeFile(fileId) {
  uploadedFiles = uploadedFiles.filter(function (fileObj) {
    return fileObj.id !== fileId;
  });
  renderFiles();
}

function clearAllFiles() {
  if (uploadedFiles.length === 0) {
    alert("No files to clear.");
    return;
  }

  if (confirm("Remove all uploaded files?")) {
    uploadedFiles = [];
    localStorage.removeItem(DEMO_SESSION_KEY);
    syncDemoSessionBadge();
    renderFiles();
  }
}

function startModeSession() {
  if (uploadedFiles.length === 0) {
    alert("Upload at least one slide first.");
    return;
  }

  if (!selectedMode) {
    alert("Choose a mode before starting.");
    openModeModal();
    return;
  }

  const modeConfig = collectModeConfig();
  if (!modeConfig.ok) {
    alert(modeConfig.error);
    return;
  }

  launchModeEnvironment(modeConfig);
}

function activateDemoSlides(topicId) {
  const topic = DEMO_TOPICS[topicId] || DEMO_TOPICS["data-modeling-demo-v1"];

  localStorage.setItem(GENERATED_QUIZ_KEY, JSON.stringify(topic.quizData));
  localStorage.setItem(UPLOADED_FILES_KEY, JSON.stringify(topic.files));
  const demoSession = {
    id: topic.id,
    title: topic.title,
    activatedAt: new Date().toISOString(),
    source: "student-upload-page",
    mode: selectedMode || "single"
  };

  localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(demoSession));
  syncDemoSessionBadge(demoSession);

  uploadedFiles = topic.files.map(function (file, index) {
    return {
      id: "demo_" + index,
      name: file.originalName,
      size: file.size || 0,
      type: file.type || "application/pdf",
      mode: selectedMode || "single"
    };
  });

  renderFiles();
  const modeConfig = collectModeConfig();
  if (!modeConfig.ok) {
    window.location.href = GAMES_ENDPOINT;
    return;
  }

  launchModeEnvironment(modeConfig);
}

function launchModeEnvironment(modeConfig) {
  const demoSession = readDemoSession();
  const payload = {
    mode: selectedMode,
    modeLabel: prettyMode(selectedMode),
    configuredAt: new Date().toISOString(),
    filesCount: uploadedFiles.length,
    fileNames: uploadedFiles.map(function (item) { return item.name; }),
    modeConfig: modeConfig.config || {},
    modeSummary: modeConfig.summary,
    hasDemo: !!demoSession,
    demoTitle: demoSession && demoSession.title ? demoSession.title : ""
  };

  localStorage.setItem(MODE_ENV_KEY, JSON.stringify(payload));
  window.location.href = MODE_ENV_ENDPOINT;
}

function readDemoSession() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_SESSION_KEY) || "null");
  } catch (_error) {
    return null;
  }
}

function syncDemoSessionBadge(session) {
  const badge = document.getElementById("demo-session-badge");
  const title = document.getElementById("demo-session-title");
  if (!badge || !title) {
    return;
  }

  const active = session || readDemoSession();
  if (!active || !active.title) {
    badge.classList.remove("active");
    title.textContent = "-";
    return;
  }

  badge.classList.add("active");
  title.textContent = active.title;
}

function openModeModal() {
  const modal = document.getElementById("mode-modal");
  if (modal) {
    modal.classList.remove("hidden");
  }
  applyModeThemeClass(modalSelection || selectedMode);
}

function closeModeModal() {
  const modal = document.getElementById("mode-modal");
  if (modal) {
    modal.classList.add("hidden");
  }
}

function syncModeSelectionUI() {
  const confirmBtn = document.getElementById("confirm-mode-btn");
  const modeButtons = document.querySelectorAll(".mode-option");

  modeButtons.forEach(function (button) {
    const value = button.getAttribute("data-mode") || "";
    button.classList.toggle("selected", value === modalSelection);
  });

  if (confirmBtn) {
    confirmBtn.disabled = !modalSelection;
  }

  applyModeThemeClass(modalSelection || selectedMode);
}

function applyModeThemeClass(modeValue) {
  const panel = document.querySelector("#mode-modal .mode-panel");
  if (!panel) {
    return;
  }

  panel.classList.remove("mode-theme-single", "mode-theme-hot-seat", "mode-theme-tournament", "mode-theme-live-2-player");

  if (modeValue === "single") {
    panel.classList.add("mode-theme-single");
  } else if (modeValue === "hot-seat") {
    panel.classList.add("mode-theme-hot-seat");
  } else if (modeValue === "tournament") {
    panel.classList.add("mode-theme-tournament");
  } else if (modeValue === "live-2-player") {
    panel.classList.add("mode-theme-live-2-player");
  }
}

function updateModeLabel() {
  const modeValue = document.getElementById("mode-value");
  if (!modeValue) {
    return;
  }

  modeValue.textContent = selectedMode ? prettyMode(selectedMode) : "Not selected";
}

function updateModeConfigView() {
  const single = document.getElementById("config-single");
  const multi = document.getElementById("config-hot-seat");
  const tournament = document.getElementById("config-tournament");
  const simultaneous = document.getElementById("config-live-2-player");

  if (!single || !multi || !tournament || !simultaneous) {
    return;
  }

  single.classList.toggle("hidden", selectedMode && selectedMode !== "single");
  multi.classList.toggle("hidden", selectedMode !== "hot-seat");
  tournament.classList.toggle("hidden", selectedMode !== "tournament");
  simultaneous.classList.toggle("hidden", selectedMode !== "live-2-player");
}

function collectModeConfig() {
  if (selectedMode === "single") {
    const timerInput = document.getElementById("single-timer");
    const difficultyInput = document.getElementById("single-difficulty");
    const timer = parseInt(timerInput ? timerInput.value : "0", 10);
    const difficulty = difficultyInput ? difficultyInput.value : "normal";

    if (Number.isNaN(timer) || timer < 5 || timer > 120) {
      return { ok: false, error: "Single Player timer must be between 5 and 120 minutes." };
    }

    return {
      ok: true,
      summary: "Timer: " + timer + " mins\nChallenge: " + capitalize(difficulty) + "\n\nSolo run initialized.",
      config: {
        timer: timer,
        difficulty: difficulty
      }
    };
  }

  if (selectedMode === "hot-seat") {
    const roomInput = document.getElementById("multi-room-code");
    const playersInput = document.getElementById("multi-players");
    let roomCode = roomInput ? roomInput.value.trim().toUpperCase() : "";
    const players = parseInt(playersInput ? playersInput.value : "0", 10);

    if (!roomCode) {
      roomCode = makeRoomCode();
      if (roomInput) {
        roomInput.value = roomCode;
      }
    }

    if (Number.isNaN(players) || players < 2 || players > 20) {
      return { ok: false, error: "Hot-Seat max players must be between 2 and 20." };
    }

    return {
      ok: true,
      summary: "Room Code: " + roomCode + "\nMax Players: " + players + "\n\nLobby opened for teammates.",
      config: {
        roomCode: roomCode,
        maxPlayers: players
      }
    };
  }

  if (selectedMode === "tournament") {
    const bracketInput = document.getElementById("tour-bracket");
    const seedInput = document.getElementById("tour-seed");
    const bracket = parseInt(bracketInput ? bracketInput.value : "0", 10);
    const seed = seedInput ? seedInput.value : "balanced";

    if ([8, 16, 32].indexOf(bracket) === -1) {
      return { ok: false, error: "Tournament bracket must be 8, 16, or 32 players." };
    }

    return {
      ok: true,
      summary: "Bracket Size: " + bracket + " players\nSeeding: " + capitalize(seed) + "\n\nTournament bracket generated.",
      config: {
        bracketSize: bracket,
        seeding: seed
      }
    };
  }

  if (selectedMode === "live-2-player") {
    const playersInput = document.getElementById("sim-players");
    const syncInput = document.getElementById("sim-sync-window");
    const players = parseInt(playersInput ? playersInput.value : "0", 10);
    const syncWindow = parseInt(syncInput ? syncInput.value : "0", 10);

    if (Number.isNaN(players) || players < 2 || players > 12) {
      return { ok: false, error: "Live 2-Player players must be between 2 and 12." };
    }

    if (Number.isNaN(syncWindow) || syncWindow < 5 || syncWindow > 60) {
      return { ok: false, error: "Sync window must be between 5 and 60 seconds." };
    }

    return {
      ok: true,
      summary: "Concurrent Players: " + players + "\nSync Window: " + syncWindow + " seconds\n\nLive 2-Player room initialized.",
      config: {
        players: players,
        syncWindow: syncWindow
      }
    };
  }

  return { ok: false, error: "Please choose a valid play mode." };
}

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function capitalize(value) {
  if (!value) {
    return "";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function prettyMode(modeValue) {
  if (modeValue === "single") {
    return "Single Player";
  }
  if (modeValue === "hot-seat") {
    return "Hot-Seat";
  }
  if (modeValue === "tournament") {
    return "Tournament";
  }
  if (modeValue === "live-2-player") {
    return "Live 2-Player";
  }
  return "Unknown";
}

function getFileIcon(type) {
  if (type.includes("pdf")) {
    return "PDF";
  }
  if (type.includes("presentation") || type.includes("powerpoint")) {
    return "PPT";
  }
  if (type.includes("image")) {
    return "IMG";
  }
  return "FILE";
}

function formatFileSize(bytes) {
  if (bytes === 0) {
    return "0 Bytes";
  }

  const base = 1024;
  const units = ["Bytes", "KB", "MB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(base)), units.length - 1);
  const value = bytes / Math.pow(base, unitIndex);
  return Math.round(value * 100) / 100 + " " + units[unitIndex];
}

function truncateName(name) {
  const max = 22;
  if (name.length <= max) {
    return name;
  }
  return name.slice(0, max - 3) + "...";
}
