let uploadedFiles = [];
let selectedMode = "";
let pendingFiles = [];
let modalSelection = "";

document.addEventListener("DOMContentLoaded", function () {
  setupUploadArea();
  setupModeFlow();
  setupActions();
  setupModeConfigs();
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

  alert(
    "Session Ready!\n\n"
      + "Mode: " + prettyMode(selectedMode) + "\n"
      + "Slides: " + uploadedFiles.length + "\n\n"
      + modeConfig.summary
  );
}

function openModeModal() {
  const modal = document.getElementById("mode-modal");
  if (modal) {
    modal.classList.remove("hidden");
  }
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
  const multi = document.getElementById("config-multiplayer");
  const tournament = document.getElementById("config-tournament");

  if (!single || !multi || !tournament) {
    return;
  }

  single.classList.toggle("hidden", selectedMode && selectedMode !== "single");
  multi.classList.toggle("hidden", selectedMode !== "multiplayer");
  tournament.classList.toggle("hidden", selectedMode !== "tournament");
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
      summary: "Timer: " + timer + " mins\nChallenge: " + capitalize(difficulty) + "\n\nSolo run initialized."
    };
  }

  if (selectedMode === "multiplayer") {
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
      return { ok: false, error: "Multiplayer max players must be between 2 and 20." };
    }

    return {
      ok: true,
      summary: "Room Code: " + roomCode + "\nMax Players: " + players + "\n\nLobby opened for teammates."
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
      summary: "Bracket Size: " + bracket + " players\nSeeding: " + capitalize(seed) + "\n\nTournament bracket generated."
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
  if (modeValue === "multiplayer") {
    return "Multiplayer";
  }
  if (modeValue === "tournament") {
    return "Tournament";
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
