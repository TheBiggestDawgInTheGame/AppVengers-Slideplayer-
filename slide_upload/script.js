const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const uploadBtn = document.getElementById('uploadBtn');
const playQuizBtn = document.getElementById('playQuizBtn');
const demoTopicSelect = document.getElementById('demoTopicSelect');
const demoBtn = document.getElementById('demoBtn');
const feedback = document.getElementById('feedback');
const fileList = document.getElementById('fileList');
const endpointHint = document.querySelector('.endpoint-hint');

const allowedExtensions = new Set(['pdf', 'ppt', 'pptx', 'txt', 'md', 'doc', 'docx']);
let selectedFiles = [];
const GENERATED_QUIZ_KEY = 'slidePlayGeneratedQuizData';
const UPLOADED_FILES_KEY = 'slidePlayUploadedFiles';
const DEMO_SESSION_KEY = 'slidePlayDemoSession';
const BACKEND_ORIGIN = window.location.port === '3000' ? window.location.origin : 'http://localhost:3000';
const UPLOAD_ENDPOINTS = [
  `${BACKEND_ORIGIN}/api/upload`,
  'http://127.0.0.1:3000/api/upload'
].filter((value, index, arr) => arr.indexOf(value) === index);
const GAMES_ENDPOINT = window.location.port === '3000'
  ? `${window.location.origin}/games`
  : new URL('games.html', window.location.href).href;

const DEMO_TOPICS = {
  'data-modeling-demo-v1': {
    id: 'data-modeling-demo-v1',
    title: 'Data Modeling and ERD Fundamentals',
    files: [
      {
        originalName: 'Demo Topic - Data Modeling and ERD Fundamentals.pdf',
        storedName: 'demo-data-modeling-erd.pdf',
        size: 0
      }
    ],
    quizData: [
      {
        question: 'What is the primary purpose of an Entity Relationship Diagram (ERD)?',
        options: ['To design user interface colors', 'To model data entities and relationships', 'To optimize CPU usage', 'To compile source code'],
        correct: 1
      },
      {
        question: 'In data modeling, what does cardinality describe?',
        options: ['Table background color', 'How many instances relate between entities', 'File storage location', 'Query execution speed'],
        correct: 1
      },
      {
        question: 'Which key uniquely identifies each row in a table?',
        options: ['Foreign key', 'Primary key', 'Composite note', 'Alias key'],
        correct: 1
      },
      {
        question: 'A foreign key is mainly used to:',
        options: ['Encrypt data fields', 'Create relationships across tables', 'Sort values alphabetically', 'Render chart legends'],
        correct: 1
      },
      {
        question: 'Normalization helps reduce:',
        options: ['Screen brightness', 'Data redundancy and anomalies', 'Network bandwidth only', 'User permissions'],
        correct: 1
      },
      {
        question: 'What relationship type means one record links to many records?',
        options: ['One-to-many', 'Many-to-one UI', 'Zero-to-one', 'Loopback'],
        correct: 0
      },
      {
        question: 'A junction table is commonly used to model which relationship?',
        options: ['One-to-one', 'Many-to-many', 'One-to-zero', 'None-to-all'],
        correct: 1
      },
      {
        question: 'Which data model is most implementation-focused for a DBMS?',
        options: ['Conceptual model', 'Logical model', 'Physical model', 'Narrative model'],
        correct: 2
      }
    ]
  },
  'biology-cells-demo-v1': {
    id: 'biology-cells-demo-v1',
    title: 'Biology: Cells and Genetics',
    files: [
      {
        originalName: 'Demo Topic - Biology Cells and Genetics.pdf',
        storedName: 'demo-biology-cells.pdf',
        size: 0
      }
    ],
    quizData: [
      {
        question: 'Which organelle is known as the powerhouse of the cell?',
        options: ['Nucleus', 'Mitochondrion', 'Ribosome', 'Golgi apparatus'],
        correct: 1
      },
      {
        question: 'DNA is primarily located in which part of a eukaryotic cell?',
        options: ['Nucleus', 'Cell membrane', 'Cytoplasm only', 'Lysosome'],
        correct: 0
      },
      {
        question: 'What process makes an exact copy of DNA before cell division?',
        options: ['Transcription', 'Translation', 'Replication', 'Fermentation'],
        correct: 2
      },
      {
        question: 'Which molecule carries amino acids to the ribosome during protein synthesis?',
        options: ['mRNA', 'tRNA', 'DNA polymerase', 'ATP synthase'],
        correct: 1
      },
      {
        question: 'In Mendelian genetics, a dominant allele will:',
        options: ['Always disappear', 'Be expressed when present', 'Only appear in females', 'Mutate every generation'],
        correct: 1
      },
      {
        question: 'What is the function of the cell membrane?',
        options: ['Store chromosomes only', 'Control movement of substances in and out', 'Create ATP directly', 'Synthesize DNA'],
        correct: 1
      }
    ]
  },
  'world-history-demo-v1': {
    id: 'world-history-demo-v1',
    title: 'World History: Industrial Revolution',
    files: [
      {
        originalName: 'Demo Topic - Industrial Revolution Overview.pdf',
        storedName: 'demo-industrial-revolution.pdf',
        size: 0
      }
    ],
    quizData: [
      {
        question: 'The Industrial Revolution first began in which country?',
        options: ['France', 'Germany', 'Great Britain', 'United States'],
        correct: 2
      },
      {
        question: 'Which invention was crucial for mechanized textile production?',
        options: ['Printing press', 'Steam engine', 'Spinning jenny', 'Telegraph'],
        correct: 2
      },
      {
        question: 'What major energy source powered many early factories?',
        options: ['Solar energy', 'Coal', 'Natural gas', 'Nuclear power'],
        correct: 1
      },
      {
        question: 'Urbanization during the Industrial Revolution mainly meant:',
        options: ['People moving from cities to farms', 'People moving from rural areas to cities', 'No change in population movement', 'Only military migration'],
        correct: 1
      },
      {
        question: 'Which transport development accelerated trade and mobility in the 19th century?',
        options: ['Railways', 'Hot air balloons', 'Sailing canoes only', 'Horse chariots'],
        correct: 0
      },
      {
        question: 'A common social effect of industrialization was:',
        options: ['Reduced factory labor', 'Growth of working-class movements', 'End of global trade', 'Immediate universal suffrage'],
        correct: 1
      }
    ]
  }
};

browseBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  handleFiles(fileInput.files);
});

uploadBtn.addEventListener('click', uploadFiles);
playQuizBtn.addEventListener('click', () => {
  window.location.href = GAMES_ENDPOINT;
});
demoBtn.addEventListener('click', activateDemoMode);

['dragenter', 'dragover'].forEach((type) => {
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach((type) => {
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    if (type === 'drop') {
      handleFiles(event.dataTransfer.files);
    }
    dropZone.classList.remove('drag-over');
  });
});

function handleFiles(fileCollection) {
  const files = Array.from(fileCollection || []);
  const validFiles = files.filter((file) => hasAllowedExtension(file.name));
  selectedFiles = validFiles;

  fileList.innerHTML = '';
  feedback.classList.remove('error');
  uploadBtn.disabled = true;
  playQuizBtn.disabled = true;

  if (files.length === 0) {
    feedback.textContent = 'No files selected.';
    feedback.classList.add('error');
    return;
  }

  if (validFiles.length === 0) {
    feedback.textContent = 'Unsupported file type. Upload PDF, PPTX, TXT, MD or DOCX.';
    feedback.classList.add('error');
    return;
  }

  uploadBtn.disabled = false;

  if (validFiles.length !== files.length) {
    feedback.textContent = `${validFiles.length} supported file(s) ready. Unsupported files were ignored.`;
  } else {
    feedback.textContent = `${validFiles.length} file(s) ready to upload.`;
  }

  validFiles.forEach((file) => {
    const item = document.createElement('li');
    item.textContent = `${file.name} (${formatSize(file.size)})`;
    fileList.appendChild(item);
  });
}

async function uploadFiles() {
  if (selectedFiles.length === 0) {
    feedback.textContent = 'Please choose at least one supported file first.';
    feedback.classList.add('error');
    return;
  }

  feedback.classList.remove('error');
  feedback.textContent = 'Uploading...';
  uploadBtn.disabled = true;

  const formData = new FormData();
  selectedFiles.forEach((file) => formData.append('slides', file));

  try {
    const result = await uploadViaBackend(formData);

    if (Array.isArray(result.quizData) && result.quizData.length > 0) {
      localStorage.setItem(GENERATED_QUIZ_KEY, JSON.stringify(result.quizData));
      playQuizBtn.disabled = false;
    }

    if (Array.isArray(result.files)) {
      localStorage.setItem(UPLOADED_FILES_KEY, JSON.stringify(result.files));
    }
    localStorage.removeItem(DEMO_SESSION_KEY);

    feedback.textContent = result.message || `${selectedFiles.length} file(s) uploaded successfully.`;
    fileList.innerHTML = '';

    for (const file of (result.files || [])) {
      const item = document.createElement('li');
      item.textContent = `Uploaded: ${file.originalName} (${formatSize(file.size)})`;
      fileList.appendChild(item);
    }

    selectedFiles = [];
    fileInput.value = '';
    setTimeout(() => {
      window.location.href = GAMES_ENDPOINT;
    }, 700);
  } catch (error) {
    try {
      const fallback = await buildOfflineFallback(selectedFiles);
      localStorage.setItem(GENERATED_QUIZ_KEY, JSON.stringify(fallback.quizData));
      localStorage.setItem(UPLOADED_FILES_KEY, JSON.stringify(fallback.files));
      playQuizBtn.disabled = false;
      feedback.classList.remove('error');
      feedback.textContent = 'Server is offline, but your files were prepared locally. Opening game chooser...';
      fileList.innerHTML = '';
      fallback.files.forEach((file) => {
        const item = document.createElement('li');
        item.textContent = `Prepared locally: ${file.originalName} (${formatSize(file.size)})`;
        fileList.appendChild(item);
      });
      selectedFiles = [];
      fileInput.value = '';
      setTimeout(() => {
        window.location.href = GAMES_ENDPOINT;
      }, 800);
    } catch (_fallbackError) {
      const isNetworkError = error instanceof TypeError;
      feedback.textContent = isNetworkError
        ? 'Could not reach upload server. Start server with: cd slide_upload && node server.js'
        : (error.message || 'Upload failed. Please try again.');
      feedback.classList.add('error');
      uploadBtn.disabled = false;
    }
  }
}

async function uploadViaBackend(formData) {
  let lastError = null;

  for (const endpoint of UPLOAD_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      const rawBody = await response.text();
      let result = {};
      if (rawBody) {
        try {
          result = JSON.parse(rawBody);
        } catch (_error) {
          result = { message: rawBody };
        }
      }

      if (!response.ok) {
        throw new Error(result.message || `Upload failed with status ${response.status}.`);
      }

      return result;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Upload failed.');
}

function fileNameTerms(name) {
  return name
    .replace(/\.[^.]+$/, '')
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4);
}

function normalizeQuizOption(text) {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function buildQuestionFromTerms(terms, sourceLabel, index) {
  if (terms.length < 4) return null;
  const options = [...new Set(terms.map(normalizeQuizOption))].slice(0, 4);
  if (options.length < 4) return null;
  const correct = index % options.length;
  return {
    question: `Which term appears in ${sourceLabel}?`,
    options,
    correct
  };
}

async function buildOfflineFallback(files) {
  const uploaded = files.map((file) => ({
    originalName: file.name,
    storedName: file.name,
    size: file.size
  }));

  const questions = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const extension = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
    const terms = fileNameTerms(file.name);

    if ((extension === 'txt' || extension === 'md') && typeof file.text === 'function') {
      try {
        const content = await file.text();
        const textTerms = content
          .replace(/[^a-zA-Z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((word) => word.length >= 5)
          .slice(0, 16);
        terms.push(...textTerms);
      } catch (_error) {
        // Ignore read failures and continue with filename terms.
      }
    }

    const question = buildQuestionFromTerms(terms, file.name, i);
    if (question) {
      questions.push(question);
    }
  }

  if (questions.length === 0) {
    questions.push({
      question: 'Which file type was part of your upload?',
      options: ['PDF', 'PPTX', 'DOCX', 'TXT'],
      correct: 0
    });
  }

  return {
    files: uploaded,
    quizData: questions
  };
}

function hasAllowedExtension(fileName) {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === fileName.length - 1) return false;
  const extension = fileName.slice(lastDot + 1).toLowerCase();
  return allowedExtensions.has(extension);
}

function activateDemoMode() {
  const selectedTopicId = demoTopicSelect ? demoTopicSelect.value : 'data-modeling-demo-v1';
  const demoTopic = DEMO_TOPICS[selectedTopicId] || DEMO_TOPICS['data-modeling-demo-v1'];

  localStorage.setItem(GENERATED_QUIZ_KEY, JSON.stringify(demoTopic.quizData));
  localStorage.setItem(UPLOADED_FILES_KEY, JSON.stringify(demoTopic.files));
  localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({
    id: demoTopic.id,
    title: demoTopic.title,
    activatedAt: Date.now()
  }));

  feedback.classList.remove('error');
  feedback.textContent = `Demo mode loaded: ${demoTopic.title}. Opening game chooser...`;
  fileList.innerHTML = '';
  demoTopic.files.forEach((file) => {
    const item = document.createElement('li');
    item.textContent = `Demo pack: ${file.originalName}`;
    fileList.appendChild(item);
  });

  playQuizBtn.disabled = false;
  setTimeout(() => {
    window.location.href = GAMES_ENDPOINT;
  }, 700);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

try {
  const stored = JSON.parse(localStorage.getItem(GENERATED_QUIZ_KEY) || '[]');
  playQuizBtn.disabled = !Array.isArray(stored) || stored.length === 0;
} catch (_error) {
  playQuizBtn.disabled = true;
}

if (endpointHint) {
  endpointHint.textContent = `Upload API: ${UPLOAD_ENDPOINTS[0]}`;
}
