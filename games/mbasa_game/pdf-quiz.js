const pdfFileInput = document.getElementById('pdfFile');
const loadBtn = document.getElementById('loadBtn');
const statusText = document.getElementById('status');
const quizArea = document.getElementById('quizArea');
const questionText = document.getElementById('questionText');
const answerButtons = document.getElementById('answerButtons');
const nextQuestionBtn = document.getElementById('nextQuestionBtn');
const restartQuizBtn = document.getElementById('restartQuizBtn');
const playGameBtn = document.getElementById('playGameBtn');

let questions = [];
let currentQuestionIndex = 0;
let answered = false;

function updateLoadButton() {
  const hasFile = pdfFileInput.files.length > 0 || pdfFileInput.value;
  loadBtn.disabled = !hasFile;
  statusText.textContent = hasFile
    ? 'Ready to load the selected PDF file.'
    : 'PDF only. Choose a file to begin.';
}

pdfFileInput.addEventListener('change', updateLoadButton);
updateLoadButton();

loadBtn.addEventListener('click', async () => {
  const file = pdfFileInput.files[0];
  if (!file) return;
  const isPdfMime = file.type === 'application/pdf';
  const isPdfExt = file.name.toLowerCase().endsWith('.pdf');
  if (!isPdfMime && !isPdfExt) {
    statusText.textContent = 'Only PDF files are accepted.';
    return;
  }

  if (!window.pdfjsLib || typeof window.pdfjsLib.getDocument !== 'function') {
    statusText.textContent = 'PDF.js did not load. Ensure you have network access for the CDN script.';
    return;
  }

  statusText.textContent = 'Reading PDF... please wait.';
  quizArea.classList.add('hidden');
  try {
    const text = await extractTextFromPdf(file);
    questions = buildQuestions(text);
    if (!questions.length) {
      statusText.textContent = 'Could not create questions from this PDF. Try another file.';
      return;
    }
    currentQuestionIndex = 0;
    saveQuestionsToStorage(questions, file.name);
    statusText.textContent = 'Questions generated! Launching the 3D game...';
    window.location.href = 'play_3d.html?source=upload';
  }
  catch{
    showQuiz();
  }
  
});

restartQuizBtn.addEventListener('click', () => {
  pdfFileInput.value = '';
  updateLoadButton();
  quizArea.classList.add('hidden');
  playGameBtn.classList.add('hidden');
  questions = [];
  currentQuestionIndex = 0;
});

playGameBtn.addEventListener('click', () => {
  launchGame();
});

function showQuiz() {
  const question = questions[currentQuestionIndex];
  quizArea.classList.remove('hidden');
  questionText.textContent = question.prompt;
  answerButtons.innerHTML = '';
  answered = false;

  question.options.forEach((option, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'answerBtn';
    btn.textContent = option.text;
    btn.addEventListener('click', () => selectAnswer(index));
    answerButtons.appendChild(btn);
  });

  nextQuestionBtn.classList.add('hidden');
  playGameBtn.classList.add('hidden');
}

function selectAnswer(index) {
  if (answered) return;
  answered = true;

  const question = questions[currentQuestionIndex];
  const buttons = Array.from(answerButtons.children);
  buttons.forEach((btn, idx) => {
    btn.disabled = true;
    const isCorrect = question.options[idx].correct;
    if (idx === index) {
      btn.classList.add(isCorrect ? 'correct' : 'wrong');
    }
    if (isCorrect) {
      btn.classList.add('correct');
    }
  });

  if (question.options[index].correct) {
    statusText.textContent = 'Correct! Click Next Question to continue.';
  } else {
    statusText.textContent = 'Wrong answer. Click Next Question to continue.';
  }

  nextQuestionBtn.classList.remove('hidden');
  if (currentQuestionIndex === questions.length - 1) {
    playGameBtn.classList.remove('hidden');
  }
}

async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n\n';
  }
  return fullText;
}

function buildQuestions(text) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  // Extract key concepts and facts
  const concepts = [];
  
  // Pattern 1: Explicit definitions (X is/are/means/refers to Y)
  const defPattern = /([A-Z][A-Za-z0-9 \-]{2,70}?)\s+(?:is|are|means|refers to|defined as|defined by)\s+([^.!?]{10,150})[.!?]/gi;
  let match;
  while ((match = defPattern.exec(normalized)) !== null) {
    const term = match[1].trim();
    const fullDefinition = match[2].trim();
    
    // Extract 1-2 word definition from the full definition
    const words = fullDefinition.split(/\s+/);
    let shortDefinition = '';
    
    // Try to find a concise definition (1-2 words)
    if (words.length >= 1) {
      // Look for common patterns: "a X", "an X", "the X", or just the first 1-2 meaningful words
      const firstWord = words[0].toLowerCase();
      if (firstWord === 'a' || firstWord === 'an' || firstWord === 'the') {
        shortDefinition = words.slice(0, 3).join(' '); // "a X Y" or "the X Y"
      } else {
        shortDefinition = words.slice(0, 2).join(' '); // First 1-2 words
      }
      
      // Clean up and ensure it's not too long
      shortDefinition = shortDefinition.replace(/[^\w\s]/g, '').trim();
      if (shortDefinition.split(/\s+/).length > 2) {
        shortDefinition = shortDefinition.split(/\s+/).slice(0, 2).join(' ');
      }
    }
    
    if (term.length > 1 && shortDefinition.length > 0 && !term.includes('http')) {
      concepts.push({
        type: 'definition',
        term,
        definition: shortDefinition,
        fullDefinition, // Keep full for wrong answers
        source: `What is ${term}?`
      });
    }
    if (concepts.length >= 15) break;
  }

  // Pattern 2: Key sentences (statements about subjects)
  const sentences = normalized.match(/[A-Z][^.!?]{40,250}[.!?]/g) || [];
  const keySentences = sentences
    .filter(s => {
      const trimmed = s.trim();
      return trimmed.length > 40 && 
             !trimmed.toLowerCase().includes('copyright') &&
             !trimmed.toLowerCase().includes('http');
    })
    .slice(0, 20);

  // Build questions from concepts
  const questionSet = [];

  // Generate definition questions
  if (concepts.length >= 3) {
    for (let i = 0; i < Math.min(5, concepts.length); i++) {
      const concept = concepts[i];
      const wrongAnswers = concepts
        .filter((_, idx) => idx !== i)
        .map(c => c.definition)
        .slice(0, 2);
      
      questionSet.push({
        prompt: `What is "${concept.term}"?`,
        options: shuffleArray([
          { text: concept.definition, correct: true },
          { text: wrongAnswers[0] || 'Unknown', correct: false },
          { text: wrongAnswers[1] || 'Not defined', correct: false },
        ]),
      });
    }
  }

  // Generate comprehension questions from key sentences (short phrases)
  if (keySentences.length >= 4) {
    for (let i = 0; i < Math.min(5, keySentences.length - 2); i++) {
      const sentence = keySentences[i].trim();
      
      // Extract 1-2 word key phrase from sentence
      const words = sentence.split(/\s+/);
      let keyPhrase = '';
      
      // Try to find a meaningful 1-2 word phrase
      if (words.length >= 2) {
        // Look for noun phrases or key terms
        const firstWord = words[0];
        const secondWord = words[1];
        
        if (firstWord.length > 3 && secondWord.length > 3) {
          keyPhrase = `${firstWord} ${secondWord}`;
        } else if (firstWord.length > 3) {
          keyPhrase = firstWord;
        } else {
          keyPhrase = words.slice(0, 2).join(' ');
        }
      }
      
      if (keyPhrase.length > 0) {
        const wrong1 = keySentences[i + 1].trim().split(/\s+/).slice(0, 2).join(' ') || 'Other topic';
        const wrong2 = keySentences[i + 2].trim().split(/\s+/).slice(0, 2).join(' ') || 'Different subject';
        
        questionSet.push({
          prompt: 'Which key concept is mentioned?',
          options: shuffleArray([
            { text: keyPhrase, correct: true },
            { text: wrong1, correct: false },
            { text: wrong2, correct: false },
          ]),
        });
      }
    }
  }

  // Fallback: if still no questions, create simple sentence recognition
  if (questionSet.length === 0 && keySentences.length > 0) {
    for (let i = 0; i < Math.min(5, keySentences.length - 2); i++) {
      const sentence = keySentences[i].trim();
      const words = sentence.split(/\s+/);
      const keyPhrase = words.length >= 2 ? `${words[0]} ${words[1]}` : words[0] || 'Key concept';
      
      const wrong1 = keySentences[i + 1].trim().split(/\s+/).slice(0, 2).join(' ') || 'Other topic';
      const wrong2 = keySentences[i + 2].trim().split(/\s+/).slice(0, 2).join(' ') || 'Different subject';
      
      questionSet.push({
        prompt: 'Which concept is from the PDF?',
        options: shuffleArray([
          { text: keyPhrase, correct: true },
          { text: wrong1, correct: false },
          { text: wrong2, correct: false },
        ]),
      });
    }
  }

  return questionSet.slice(0, 8);
}

function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function saveQuestionsToStorage(questionsArray, fileName) {
  try {
    // Convert questions to format expected by play_3d.js
    const formattedQuestions = questionsArray.map((q, idx) => ({
      question: q.prompt,
      options: q.options.map(opt => opt.text),
      correct: q.options.findIndex(opt => opt.correct),
      source: fileName
    }));
    localStorage.setItem('slidePlayGeneratedQuizData', JSON.stringify(formattedQuestions));
  } catch (error) {
    console.error('Failed to save questions to storage:', error);
  }
}

function launchGame() {
  if (!questions.length) {
    statusText.textContent = 'No questions available. Please load a PDF first.';
    return;
  }
  window.location.href = 'play_3d.html?source=upload';
}

