// File storage array
let uploadedFiles = [];

// Initialize event listeners when page loads
document.addEventListener('DOMContentLoaded', function() {
    setupTabSystem();
    setupFileUpload();
});

// Tab system functionality
function setupTabSystem() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Hide all tab contents
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => {
        content.classList.remove('active');
    });
    
    // Remove active class from all buttons
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab and mark button as active
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');
}

// File upload setup
function setupFileUpload() {
    // Slides upload
    const slidesArea = document.getElementById('slides-upload-area');
    const slidesInput = document.getElementById('slides-input');
    
    setupUploadArea(slidesArea, slidesInput);
    
    // Notes upload
    const notesArea = document.getElementById('notes-upload-area');
    const notesInput = document.getElementById('notes-input');
    
    setupUploadArea(notesArea, notesInput);
}

function setupUploadArea(area, input) {
    // Drag and drop events
    area.addEventListener('dragover', (e) => {
        e.preventDefault();
        area.classList.add('drag-over');
    });
    
    area.addEventListener('dragleave', () => {
        area.classList.remove('drag-over');
    });
    
    area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });
    
    // Click to upload
    area.addEventListener('click', () => {
        input.click();
    });
    
    // File input change
    input.addEventListener('change', () => {
        handleFiles(input.files);
    });
}

function handleFiles(files) {
    Array.from(files).forEach(file => {
        // Validate file size (50MB max)
        if (file.size > 50 * 1024 * 1024) {
            alert(`File "${file.name}" is too large. Maximum size is 50MB.`);
            return;
        }
        
        // Add file to array
        const fileObj = {
            id: Date.now() + Math.random(),
            name: file.name,
            size: file.size,
            type: file.type,
            file: file
        };
        
        uploadedFiles.push(fileObj);
        displayFiles();
    });
}

function displayFiles() {
    const filesList = document.getElementById('files-list');
    
    if (uploadedFiles.length === 0) {
        filesList.innerHTML = '<p class="empty-state">No files uploaded yet. Start by uploading slides or scanning notes.</p>';
        return;
    }
    
    filesList.innerHTML = uploadedFiles.map(fileObj => {
        const icon = getFileIcon(fileObj.type);
        const size = formatFileSize(fileObj.size);
        
        return `
            <div class="file-item">
                <div class="file-icon">${icon}</div>
                <div class="file-name">${truncateName(fileObj.name)}</div>
                <div class="file-size">${size}</div>
                <button class="file-remove" onclick="removeFile('${fileObj.id}')\">Remove</button>
            </div>
        `;
    }).join('');
}

function getFileIcon(type) {
    if (type.includes('pdf')) return '📄';
    if (type.includes('word') || type.includes('presentation')) return '📊';
    if (type.includes('image')) return '🖼️';
    return '📁';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function truncateName(name, maxLength = 20) {\n    if (name.length <= maxLength) return name;\n    return name.substring(0, maxLength - 3) + '...';\n}\n\nfunction removeFile(fileId) {\n    uploadedFiles = uploadedFiles.filter(f => f.id != fileId);\n    displayFiles();\n}\n\nfunction clearAllFiles() {\n    if (uploadedFiles.length === 0) {\n        alert('No files to clear.');\n        return;\n    }\n    \n    if (confirm('Are you sure you want to remove all files?')) {\n        uploadedFiles = [];\n        displayFiles();\n    }\n}\n\n// Quiz settings controls\nfunction increaseValue(elementId) {\n    const element = document.getElementById(elementId);\n    const max = parseInt(element.getAttribute('max'));\n    let value = parseInt(element.value);\n    \n    if (value < max) {\n        element.value = value + 1;\n    }\n}\n\nfunction decreaseValue(elementId) {\n    const element = document.getElementById(elementId);\n    const min = parseInt(element.getAttribute('min'));\n    let value = parseInt(element.value);\n    \n    if (value > min) {\n        element.value = value - 1;\n    }\n}\n\n// Camera functionality\nfunction startCamera() {\n    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {\n        alert('Camera access is not supported on this device.');\n        return;\n    }\n    \n    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })\n        .then(stream => {\n            alert('Camera started. Capture image and convert to file.');\n            // In a real app, this would open a camera interface\n        })\n        .catch(err => {\n            alert('Camera permission denied or unavailable.');\n        });\n}\n\n// Quiz generation\nfunction generateQuiz() {\n    if (uploadedFiles.length === 0) {\n        alert('Please upload files first.');\n        return;\n    }\n    \n    const questionCount = document.getElementById('question-count').value;\n    const difficulty = document.getElementById('difficulty').value;\n    const questionType = document.getElementById('question-type').value;\n    const timeLimit = document.getElementById('time-limit').value;\n    const includeAnswers = document.getElementById('include-answers').checked;\n    const shuffleQuestions = document.getElementById('shuffle-questions').checked;\n    const showTimer = document.getElementById('show-timer').checked;\n    \n    // Show processing modal\n    showProcessingModal();\n    \n    // Simulate processing with timeout\n    setTimeout(() => {\n        hideProcessingModal();\n        alert(`Quiz Generated Successfully!\\n\\n` +\n              `Questions: ${questionCount}\\n` +\n              `Difficulty: ${difficulty}\\n` +\n              `Type: ${questionType}\\n` +\n              `Time Limit: ${timeLimit} minutes\\n` +\n              `Files Processed: ${uploadedFiles.length}`);\n    }, 3000);\n}\n\nfunction showProcessingModal() {\n    const modal = document.getElementById('processing-modal');\n    modal.classList.remove('hidden');\n    \n    // Simulate progress\n    let progress = 0;\n    const progressFill = modal.querySelector('.progress-fill');\n    const processingText = document.getElementById('processing-text');\n    \n    const interval = setInterval(() => {\n        progress += Math.random() * 40;\n        if (progress > 100) progress = 100;\n        \n        progressFill.style.width = progress + '%';\n        \n        if (progress < 30) {\n            processingText.textContent = 'Analyzing slides and notes (' + Math.floor(progress) + '%)';\n        } else if (progress < 60) {\n            processingText.textContent = 'Extracting key concepts (' + Math.floor(progress) + '%)';\n        } else if (progress < 90) {\n            processingText.textContent = 'Generating questions (' + Math.floor(progress) + '%)';\n        } else {\n            processingText.textContent = 'Finalizing quiz (' + Math.floor(progress) + '%)';\n        }\n        \n        if (progress >= 100) {\n            clearInterval(interval);\n        }\n    }, 300);\n}\n\nfunction hideProcessingModal() {\n    const modal = document.getElementById('processing-modal');\n    modal.classList.add('hidden');\n}\n
