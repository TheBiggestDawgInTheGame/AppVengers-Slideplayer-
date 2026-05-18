let uploadedFiles = [];

const CLASS_KEY = "sp_classes";
const ACTIVITY_KEY = "sp_class_activities";
const PROGRESS_KEY = "sp_class_progress";

document.addEventListener("DOMContentLoaded", function () {
  setupTabSystem();
  setupFileUpload();
  loadOpsData();
  syncClassSelectors();
  renderClassList();
  renderActivityList();
  renderProgress();
});

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadOpsData() {
  const classes = readJson(CLASS_KEY, []);
  const activities = readJson(ACTIVITY_KEY, []);
  const progress = readJson(PROGRESS_KEY, []);

  if (!Array.isArray(classes)) {
    writeJson(CLASS_KEY, []);
  }
  if (!Array.isArray(activities)) {
    writeJson(ACTIVITY_KEY, []);
  }
  if (!Array.isArray(progress)) {
    writeJson(PROGRESS_KEY, []);
  }
}

function setupTabSystem() {
  const tabBtns = document.querySelectorAll(".tab-btn");

  tabBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      const tabName = this.getAttribute("data-tab");
      switchTab(tabName, this);
    });
  });
}

function switchTab(tabName, buttonEl) {
  const contents = document.querySelectorAll(".tab-content");
  contents.forEach(function (content) {
    content.classList.remove("active");
  });

  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach(function (btn) {
    btn.classList.remove("active");
  });

  const selectedTab = document.getElementById(tabName);
  if (selectedTab) {
    selectedTab.classList.add("active");
  }

  if (buttonEl) {
    buttonEl.classList.add("active");
  }
}

function setupFileUpload() {
  const slidesArea = document.getElementById("slides-upload-area");
  const slidesInput = document.getElementById("slides-input");

  setupUploadArea(slidesArea, slidesInput);

  const notesInput = document.getElementById("notes-input");
  if (notesInput) {
    notesInput.addEventListener("change", function () {
      handleFiles(notesInput.files);
    });
  }
}

function setupUploadArea(area, input) {
  if (!area || !input) {
    return;
  }

  area.addEventListener("dragover", function (event) {
    event.preventDefault();
    area.classList.add("drag-over");
  });

  area.addEventListener("dragleave", function () {
    area.classList.remove("drag-over");
  });

  area.addEventListener("drop", function (event) {
    event.preventDefault();
    area.classList.remove("drag-over");
    handleFiles(event.dataTransfer.files);
  });

  area.addEventListener("click", function () {
    input.click();
  });

  input.addEventListener("change", function () {
    handleFiles(input.files);
  });
}

function handleFiles(files) {
  Array.from(files).forEach(function (file) {
    if (file.size > 50 * 1024 * 1024) {
      alert('File "' + file.name + '" is too large. Maximum size is 50MB.');
      return;
    }

    const fileObj = {
      id: "file_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      name: file.name,
      size: file.size,
      type: file.type,
      file: file
    };

    uploadedFiles.push(fileObj);
  });

  displayFiles();
}

function displayFiles() {
  const filesList = document.getElementById("files-list");

  if (!filesList) {
    return;
  }

  if (uploadedFiles.length === 0) {
    filesList.innerHTML = '<p class="empty-state"><i class="fa-solid fa-satellite-dish"></i> No files loaded - upload to begin.</p>';
    return;
  }

  filesList.innerHTML = uploadedFiles.map(function (fileObj) {
    const icon = getFileIcon(fileObj.type);
    const size = formatFileSize(fileObj.size);

    return ""
      + '<div class="file-item">'
      + '  <div class="file-icon">' + icon + '</div>'
      + '  <div class="file-name">' + truncateName(fileObj.name) + '</div>'
      + '  <div class="file-size">' + size + '</div>'
      + '  <button class="file-remove" onclick="removeFile(\'' + fileObj.id + '\')">Remove</button>'
      + '</div>';
  }).join("");
}

function getFileIcon(type) {
  if (type && type.includes("pdf")) {
    return "📄";
  }
  if (type && (type.includes("word") || type.includes("presentation"))) {
    return "📊";
  }
  if (type && type.includes("image")) {
    return "🖼️";
  }
  return "📁";
}

function formatFileSize(bytes) {
  if (bytes === 0) {
    return "0 Bytes";
  }

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function truncateName(name, maxLength) {
  const safeMaxLength = maxLength || 20;
  if (name.length <= safeMaxLength) {
    return name;
  }
  return name.substring(0, safeMaxLength - 3) + "...";
}

function removeFile(fileId) {
  uploadedFiles = uploadedFiles.filter(function (item) {
    return item.id !== fileId;
  });
  displayFiles();
}

function clearAllFiles() {
  if (uploadedFiles.length === 0) {
    alert("No files to clear.");
    return;
  }

  if (confirm("Are you sure you want to remove all files?")) {
    uploadedFiles = [];
    displayFiles();
  }
}

function increaseValue(elementId) {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }

  const max = parseInt(element.getAttribute("max"), 10);
  const value = parseInt(element.value, 10);

  if (value < max) {
    element.value = value + 1;
  }
}

function decreaseValue(elementId) {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }

  const min = parseInt(element.getAttribute("min"), 10);
  const value = parseInt(element.value, 10);

  if (value > min) {
    element.value = value - 1;
  }
}

function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("Camera access is not supported on this device.");
    return;
  }

  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: "environment" } })
    .then(function (stream) {
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
      alert("Camera is available. You can capture notes from your device camera.");
    })
    .catch(function () {
      alert("Camera permission denied or unavailable.");
    });
}

function generateQuiz() {
  if (uploadedFiles.length === 0) {
    alert("Please upload files first.");
    return;
  }

  const questionCount = document.getElementById("question-count").value;
  const difficulty = document.getElementById("difficulty").value;
  const questionType = document.getElementById("question-type").value;
  const timeLimit = document.getElementById("time-limit").value;

  showProcessingModal();

  setTimeout(function () {
    hideProcessingModal();
    alert(
      "Quiz Generated Successfully!\n\n"
      + "Questions: " + questionCount + "\n"
      + "Difficulty: " + difficulty + "\n"
      + "Type: " + questionType + "\n"
      + "Time Limit: " + timeLimit + " minutes\n"
      + "Files Processed: " + uploadedFiles.length
    );
  }, 3000);
}

function showProcessingModal() {
  const modal = document.getElementById("processing-modal");
  if (!modal) {
    return;
  }

  modal.classList.remove("hidden");

  let progress = 0;
  const progressFill = modal.querySelector(".progress-fill");
  const processingText = document.getElementById("processing-text");

  const interval = setInterval(function () {
    progress += Math.random() * 40;
    if (progress > 100) {
      progress = 100;
    }

    if (progressFill) {
      progressFill.style.width = progress + "%";
    }

    if (processingText) {
      if (progress < 30) {
        processingText.textContent = "Analyzing slides and notes (" + Math.floor(progress) + "%)";
      } else if (progress < 60) {
        processingText.textContent = "Extracting key concepts (" + Math.floor(progress) + "%)";
      } else if (progress < 90) {
        processingText.textContent = "Generating questions (" + Math.floor(progress) + "%)";
      } else {
        processingText.textContent = "Finalizing quiz (" + Math.floor(progress) + "%)";
      }
    }

    if (progress >= 100) {
      clearInterval(interval);
    }
  }, 300);
}

function hideProcessingModal() {
  const modal = document.getElementById("processing-modal");
  if (!modal) {
    return;
  }

  modal.classList.add("hidden");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function parseStudentEmails(rawText) {
  return Array.from(
    new Set(
      String(rawText || "")
        .split(/[\n,;]+/)
        .map(normalizeEmail)
        .filter(Boolean)
    )
  );
}

function createClassroom() {
  const nameEl = document.getElementById("class-name");
  const codeEl = document.getElementById("class-code");
  const studentsEl = document.getElementById("class-students");

  const className = String(nameEl.value || "").trim();
  const classCodeInput = String(codeEl.value || "").trim();
  const students = parseStudentEmails(studentsEl.value);

  if (!className) {
    alert("Please enter a class name.");
    return;
  }

  if (students.length === 0) {
    alert("Please add at least one student email.");
    return;
  }

  const classes = readJson(CLASS_KEY, []);
  const classCode = classCodeInput || className.replace(/\s+/g, "-").toUpperCase();

  const exists = classes.some(function (item) {
    return item.code.toLowerCase() === classCode.toLowerCase();
  });

  if (exists) {
    alert("Class code already exists. Please use a unique class code.");
    return;
  }

  classes.push({
    id: "class_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    name: className,
    code: classCode,
    students: students,
    createdAt: Date.now()
  });

  writeJson(CLASS_KEY, classes);

  nameEl.value = "";
  codeEl.value = "";
  studentsEl.value = "";

  syncClassSelectors();
  renderClassList();
  renderProgress();

  alert("Class created successfully.");
}

function syncClassSelectors() {
  const classes = readJson(CLASS_KEY, []);
  const activitySelect = document.getElementById("activity-class");
  const progressSelect = document.getElementById("progress-class");

  const options = classes.map(function (item) {
    return '<option value="' + item.id + '">' + item.name + " (" + item.code + ")</option>';
  }).join("");

  const fallback = '<option value="">No classes yet</option>';

  if (activitySelect) {
    activitySelect.innerHTML = options || fallback;
  }

  if (progressSelect) {
    const previous = progressSelect.value;
    progressSelect.innerHTML = options || fallback;

    if (previous && classes.some(function (item) { return item.id === previous; })) {
      progressSelect.value = previous;
    }
  }
}

function renderClassList() {
  const classes = readJson(CLASS_KEY, []);
  const list = document.getElementById("class-list");

  if (!list) {
    return;
  }

  if (classes.length === 0) {
    list.innerHTML = '<p class="empty-state">No classes created yet.</p>';
    return;
  }

  list.innerHTML = classes.map(function (item) {
    return ""
      + '<div class="ops-entry">'
      + '  <strong>' + item.name + " (" + item.code + ")</strong>'
      + '  <span>' + item.students.length + " students enrolled</span>'
      + '</div>';
  }).join("");
}

function readCurrentQuizConfig() {
  return {
    questionCount: Number(document.getElementById("question-count").value),
    difficulty: document.getElementById("difficulty").value,
    questionType: document.getElementById("question-type").value,
    timeLimit: Number(document.getElementById("time-limit").value),
    includeAnswers: document.getElementById("include-answers").checked,
    shuffleQuestions: document.getElementById("shuffle-questions").checked,
    showTimer: document.getElementById("show-timer").checked
  };
}

function createActivity() {
  const classId = document.getElementById("activity-class").value;
  const activityType = document.getElementById("activity-type").value;
  const title = String(document.getElementById("activity-title").value || "").trim();
  const points = Number(document.getElementById("activity-points").value);
  const dueDate = document.getElementById("activity-due").value;
  const linkQuiz = document.getElementById("link-current-quiz").checked;

  if (!classId) {
    alert("Please create a class first.");
    return;
  }

  if (!title) {
    alert("Please enter an activity title.");
    return;
  }

  if (!Number.isFinite(points) || points < 1) {
    alert("Points must be at least 1.");
    return;
  }

  const activities = readJson(ACTIVITY_KEY, []);
  const activity = {
    id: "act_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    classId: classId,
    type: activityType,
    title: title,
    points: points,
    dueDate: dueDate || null,
    quizConfig: linkQuiz ? readCurrentQuizConfig() : null,
    createdAt: Date.now()
  };

  activities.push(activity);
  writeJson(ACTIVITY_KEY, activities);

  seedProgressForActivity(activity);
  renderActivityList();
  renderProgress();

  document.getElementById("activity-title").value = "";
  document.getElementById("activity-points").value = "20";
  document.getElementById("activity-due").value = "";

  alert("Activity added to class.");
}

function seedProgressForActivity(activity) {
  const classes = readJson(CLASS_KEY, []);
  const classItem = classes.find(function (item) {
    return item.id === activity.classId;
  });

  if (!classItem) {
    return;
  }

  const progress = readJson(PROGRESS_KEY, []);

  classItem.students.forEach(function (studentEmail) {
    progress.push({
      id: "prog_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      classId: classItem.id,
      activityId: activity.id,
      studentEmail: studentEmail,
      completion: Math.floor(Math.random() * 55),
      score: Math.floor(Math.random() * 45) + 40,
      updatedAt: Date.now()
    });
  });

  writeJson(PROGRESS_KEY, progress);
}

function renderActivityList() {
  const list = document.getElementById("activity-list");
  const activities = readJson(ACTIVITY_KEY, []);
  const classes = readJson(CLASS_KEY, []);

  if (!list) {
    return;
  }

  if (activities.length === 0) {
    list.innerHTML = '<p class="empty-state">No activities created yet.</p>';
    return;
  }

  list.innerHTML = activities.slice(-8).reverse().map(function (item) {
    const classItem = classes.find(function (cls) {
      return cls.id === item.classId;
    });

    const classLabel = classItem ? classItem.name : "Unknown Class";
    const due = item.dueDate ? "Due: " + item.dueDate : "No due date";
    const quizLinked = item.quizConfig ? "Quiz settings linked" : "Manual activity";

    return ""
      + '<div class="ops-entry">'
      + '  <strong>' + item.title + " [" + item.type + "]</strong>'
      + '  <span>' + classLabel + " | " + due + " | " + quizLinked + '</span>'
      + '</div>';
  }).join("");
}

function renderProgress() {
  const classId = document.getElementById("progress-class").value;
  const list = document.getElementById("progress-list");
  const studentsNode = document.getElementById("kpi-students");
  const completionNode = document.getElementById("kpi-completion");
  const scoreNode = document.getElementById("kpi-score");

  const classes = readJson(CLASS_KEY, []);
  const activities = readJson(ACTIVITY_KEY, []);
  const progress = readJson(PROGRESS_KEY, []);

  if (!list || !studentsNode || !completionNode || !scoreNode) {
    return;
  }

  if (!classId) {
    list.innerHTML = '<p class="empty-state">Create a class to monitor progress.</p>';
    studentsNode.textContent = "0";
    completionNode.textContent = "0%";
    scoreNode.textContent = "0%";
    return;
  }

  const classItem = classes.find(function (item) {
    return item.id === classId;
  });

  if (!classItem) {
    list.innerHTML = '<p class="empty-state">Class not found.</p>';
    studentsNode.textContent = "0";
    completionNode.textContent = "0%";
    scoreNode.textContent = "0%";
    return;
  }

  const classActivities = activities.filter(function (item) {
    return item.classId === classId;
  });

  const activityCount = classActivities.length || 1;

  const studentRows = classItem.students.map(function (email) {
    const studentRecords = progress.filter(function (entry) {
      return entry.classId === classId && normalizeEmail(entry.studentEmail) === normalizeEmail(email);
    });

    if (studentRecords.length === 0) {
      return {
        email: email,
        completion: 0,
        score: 0
      };
    }

    const completionSum = studentRecords.reduce(function (sum, row) {
      return sum + Number(row.completion || 0);
    }, 0);

    const scoreSum = studentRecords.reduce(function (sum, row) {
      return sum + Number(row.score || 0);
    }, 0);

    const completion = Math.round(completionSum / Math.max(studentRecords.length, activityCount));
    const score = Math.round(scoreSum / studentRecords.length);

    return {
      email: email,
      completion: Math.min(completion, 100),
      score: Math.min(score, 100)
    };
  });

  const avgCompletion = studentRows.length
    ? Math.round(studentRows.reduce(function (sum, row) { return sum + row.completion; }, 0) / studentRows.length)
    : 0;

  const avgScore = studentRows.length
    ? Math.round(studentRows.reduce(function (sum, row) { return sum + row.score; }, 0) / studentRows.length)
    : 0;

  studentsNode.textContent = String(classItem.students.length);
  completionNode.textContent = avgCompletion + "%";
  scoreNode.textContent = avgScore + "%";

  list.innerHTML = studentRows.map(function (row) {
    return ""
      + '<div class="ops-entry">'
      + '  <strong>' + row.email + '</strong>'
      + '  <span>Completion: ' + row.completion + '% | Score: ' + row.score + '%</span>'
      + '</div>';
  }).join("");
}
