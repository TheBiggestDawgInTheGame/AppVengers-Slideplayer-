// File storage array
let uploadedFiles = [];

// Initialize event listeners when page loads
document.addEventListener('DOMContentLoaded', function () {
  setupFileUpload();
  displayFiles();
});

function setupFileUpload() {
  const slidesArea = document.getElementById('slides-upload-area');
  const slidesInput = document.getElementById('slides-input');

  if (slidesArea && slidesInput) {
    setupUploadArea(slidesArea, slidesInput);
  }

  const clearFilesButton = document.getElementById('clear-files-btn');
  if (clearFilesButton) {
    clearFilesButton.addEventListener('click', clearAllFiles);
  }
}

function setupUploadArea(area, input) {
  if (!area || !input) return;

  area.addEventListener('dragover', function (event) {
    event.preventDefault();
    area.classList.add('drag-over');
  });

  area.addEventListener('dragleave', function () {
    area.classList.remove('drag-over');
  });

  area.addEventListener('drop', function (event) {
    event.preventDefault();
    area.classList.remove('drag-over');
    handleFiles(event.dataTransfer.files);
  });

  area.addEventListener('click', function () {
    input.click();
  });

  input.addEventListener('change', function () {
    handleFiles(input.files);
    input.value = '';
  });

  const browseButton = document.getElementById('browse-files-btn');
  if (browseButton) {
    browseButton.addEventListener('click', function (event) {
      event.stopPropagation();
      input.click();
    });
  }
}

function handleFiles(files) {
  Array.from(files).forEach(function (file) {
    if (file.size > 50 * 1024 * 1024) {
      alert(`File "${file.name}" is too large. Maximum size is 50MB.`);
      return;
    }

    const fileObj = {
      id: 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name: file.name,
      size: file.size,
      type: file.type || ''
    };

    uploadedFiles.push(fileObj);
  });

  displayFiles();
}

function displayFiles() {
  const filesList = document.getElementById('files-list');
  if (!filesList) return;

  if (uploadedFiles.length === 0) {
    filesList.innerHTML = '<p class="empty-state">No files uploaded yet. Start by uploading slides or scanning notes.</p>';
    return;
  }

  filesList.innerHTML = uploadedFiles
    .map(function (fileObj) {
      return `
        <div class="file-item">
          <div class="file-icon">${getFileIcon(fileObj.type)}</div>
          <div class="file-name">${truncateName(fileObj.name)}</div>
          <div class="file-size">${formatFileSize(fileObj.size)}</div>
          <button class="file-remove" data-file-id="${fileObj.id}" type="button">Remove</button>
        </div>
      `;
    })
    .join('');

  filesList.querySelectorAll('.file-remove').forEach(function (button) {
    button.addEventListener('click', function () {
      const fileId = button.getAttribute('data-file-id');
      removeFile(fileId);
    });
  });
}

function getFileIcon(type) {
  if (type.includes('pdf')) return '??';
  if (type.includes('word') || type.includes('presentation')) return '??';
  if (type.includes('image')) return '???';
  return '??';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function truncateName(name, maxLength = 24) {
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength - 3) + '...';
}

function removeFile(fileId) {
  uploadedFiles = uploadedFiles.filter(function (file) {
    return file.id !== fileId;
  });
  displayFiles();
}

function clearAllFiles() {
  if (uploadedFiles.length === 0) {
    alert('No files to clear.');
    return;
  }

  if (confirm('Are you sure you want to remove all files?')) {
    uploadedFiles = [];
    displayFiles();
  }
}

function increaseValue(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const max = parseInt(element.getAttribute('max'), 10) || 999;
  let value = parseInt(element.value, 10) || 0;

  if (value < max) {
    element.value = value + 1;
  }
}

function decreaseValue(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const min = parseInt(element.getAttribute('min'), 10) || 0;
  let value = parseInt(element.value, 10) || 0;

  if (value > min) {
    element.value = value - 1;
  }
}

function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Camera access is not supported on this device.');
    return;
  }

  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: 'environment' } })
    .then(function () {
      alert('Camera access granted. Use your device camera to scan notes.');
    })
    .catch(function () {
      alert('Camera permission denied or unavailable.');
    });
}

function generateQuiz() {
  if (uploadedFiles.length === 0) {
    alert('Please upload at least one file first.');
    return;
  }

  const questionCount = document.getElementById('question-count')?.value || '10';
  const difficulty = document.getElementById('difficulty')?.value || 'medium';
  const questionType = document.getElementById('question-type')?.value || 'mixed';
  const timeLimit = document.getElementById('time-limit')?.value || '30';
  const includeAnswers = document.getElementById('include-answers')?.checked || false;
  const shuffleQuestions = document.getElementById('shuffle-questions')?.checked || false;
  const showTimer = document.getElementById('show-timer')?.checked || false;

  showProcessingModal();

  setTimeout(function () {
    hideProcessingModal();
    alert(
      'Quiz Generated Successfully!\n\n' +
        'Questions: ' + questionCount + '\n' +
        'Difficulty: ' + difficulty + '\n' +
        'Type: ' + questionType + '\n' +
        'Time Limit: ' + timeLimit + ' minutes\n' +
        'Include Answers: ' + (includeAnswers ? 'Yes' : 'No') + '\n' +
        'Shuffle Questions: ' + (shuffleQuestions ? 'Yes' : 'No') + '\n' +
        'Show Timer: ' + (showTimer ? 'Yes' : 'No') + '\n' +
        'Files Processed: ' + uploadedFiles.length
    );
  }, 1800);
}

function showProcessingModal() {
  const modal = document.getElementById('processing-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  let progress = 0;
  const progressFill = modal.querySelector('.progress-fill');
  const processingText = document.getElementById('processing-text');

  const interval = setInterval(function () {
    progress = Math.min(100, progress + Math.floor(Math.random() * 25) + 10);
    if (progressFill) {
      progressFill.style.width = progress + '%';
    }

    if (processingText) {
      if (progress < 30) {
        processingText.textContent = 'Analyzing slides and notes (' + progress + '%)';
      } else if (progress < 60) {
        processingText.textContent = 'Extracting key concepts (' + progress + '%)';
      } else if (progress < 90) {
        processingText.textContent = 'Generating questions (' + progress + '%)';
      } else {
        processingText.textContent = 'Finalizing quiz (' + progress + '%)';
      }
    }

    if (progress >= 100) {
      clearInterval(interval);
    }
  }, 250);
}

function hideProcessingModal() {
  const modal = document.getElementById('processing-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}
