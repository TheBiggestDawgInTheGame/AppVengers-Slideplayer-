//Quiz Engine
/**
 * quizEngine.js - File parsing & Question generation
 */
const QuizEngine = (function () {
  let allQuestions = [];
  let currentQuestionIndex = -1;
  let score = 0;
  let streak = 0;
  let bestStreak = 0;

  function reset() {
    allQuestions = [];
    currentQuestionIndex = -1;
    score = 0;
    streak = 0;
    bestStreak = 0;
  }

  async function parseFile(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    let text = "";

    if (ext === "txt" || ext === "md" || ext === "csv" || ext === "json") {
      text = await readTextFile(file);
    } else if (ext === "pdf") {
      text = await readPdfFile(file);
    } else if (ext === "docx") {
      text = await readDocxFile(file);
    } else {
      throw new Error(
        "Unsupported file type: ." +
          ext +
          "\nSupported: .txt, .pdf, .docx, .md, .csv, .json",
      );
    }

    if (!text || text.trim().length < 50) {
      throw new Error(
        "The file contains insufficient text content for generating questions. Please upload a file with more educational content.",
      );
    }

    return text;
  }

  function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }

  async function readPdfFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => item.str).join(" ");
      fullText += pageText + "\n";
    }
    return fullText;
  }

  async function readDocxFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  function generateQuestions(text, count = 10) {
    // Clean text
    const cleaned = text
      .replace(/\s+/g, " ")
      .replace(/\n+/g, ". ")
      .replace(/\.{2,}/g, ".")
      .trim();

    // Split into sentences
    const sentences = cleaned
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 30 && s.length < 400 && /\w{4,}/.test(s));

    if (sentences.length < 3) {
      throw new Error(
        "Not enough substantial sentences found. Please upload content with more complete sentences.",
      );
    }

    // Extract key terms (words that appear frequently and are significant)
    const wordFreq = {};
    const stopWords = new Set([
      "the",
      "is",
      "at",
      "which",
      "on",
      "and",
      "a",
      "an",
      "in",
      "to",
      "of",
      "for",
      "with",
      "that",
      "this",
      "are",
      "was",
      "were",
      "been",
      "being",
      "have",
      "has",
      "had",
      "does",
      "did",
      "but",
      "or",
      "nor",
      "not",
      "so",
      "if",
      "then",
      "than",
      "too",
      "very",
      "can",
      "will",
      "just",
      "about",
      "each",
      "all",
      "also",
      "from",
      "its",
      "it",
      "they",
      "them",
      "their",
      "our",
      "your",
      "my",
      "his",
      "her",
      "its",
      "be",
      "do",
      "as",
      "by",
      "up",
      "out",
      "into",
      "over",
      "under",
      "after",
      "before",
    ]);

    sentences.forEach((sentence) => {
      const words = sentence.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      words.forEach((w) => {
        if (!stopWords.has(w)) {
          wordFreq[w] = (wordFreq[w] || 0) + 1;
        }
      });
    });

    // Sort words by frequency
    const sortedWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .map((e) => e[0]);

    // Select top sentences for questions
    const targetCount = Math.min(
      count,
      Math.max(4, Math.floor(sentences.length * 0.7)),
    );
    const selectedSentences = [];
    const usedIndices = new Set();

    // Pick sentences that contain key terms
    for (const word of sortedWords.slice(0, targetCount * 2)) {
      if (selectedSentences.length >= targetCount) break;
      for (let i = 0; i < sentences.length; i++) {
        if (usedIndices.has(i)) continue;
        if (
          sentences[i].toLowerCase().includes(word) &&
          sentences[i].length > 40
        ) {
          selectedSentences.push({
            sentence: sentences[i],
            keyWord: word,
            index: i,
          });
          usedIndices.add(i);
          break;
        }
      }
    }

    // Fill remaining slots with random sentences
    if (selectedSentences.length < targetCount) {
      for (
        let i = 0;
        i < sentences.length && selectedSentences.length < targetCount;
        i++
      ) {
        if (!usedIndices.has(i) && sentences[i].length > 40) {
          selectedSentences.push({
            sentence: sentences[i],
            keyWord: extractKeyWord(sentences[i], sortedWords),
            index: i,
          });
          usedIndices.add(i);
        }
      }
    }

    // Generate questions
    allQuestions = selectedSentences.map((item, idx) => {
      const question = createQuestionFromSentence(
        item.sentence,
        item.keyWord,
        sortedWords,
        sentences,
      );
      return {
        id: idx,
        questionText: question.text,
        correctAnswer: question.correctAnswer,
        options: question.options,
        sourceSentence: item.sentence,
      };
    });

    // Shuffle questions
    shuffleArray(allQuestions);

    // Limit to requested count
    allQuestions = allQuestions.slice(0, count);

    if (allQuestions.length < 3) {
      throw new Error(
        "Could only generate " +
          allQuestions.length +
          " questions. Please upload more content.",
      );
    }

    currentQuestionIndex = -1;
    return allQuestions.length;
  }

  function extractKeyWord(sentence, sortedWords) {
    const lower = sentence.toLowerCase();
    for (const word of sortedWords) {
      if (lower.includes(word) && word.length >= 4) return word;
    }
    // Fallback: pick the longest word
    const words = sentence.match(/\b[a-z]{4,}\b/gi) || [];
    if (words.length > 0) {
      return words.reduce((a, b) => (a.length >= b.length ? a : b), words[0]);
    }
    return "concept";
  }

  function createQuestionFromSentence(
    sentence,
    keyWord,
    allKeyWords,
    allSentences,
  ) {
    // Create a fill-in-the-blank style question
    const regex = new RegExp(
      "\\b" + keyWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b",
      "i",
    );
    const questionText = sentence.replace(regex, "__________");

    // Capitalize key word for answer
    const correctAnswer =
      keyWord.charAt(0).toUpperCase() + keyWord.slice(1).toLowerCase();

    // Generate distractors
    const distractors = new Set();
    distractors.add(keyWord.toLowerCase());

    // Add similar words from key words
    for (const kw of allKeyWords) {
      if (distractors.size >= 4) break;
      const kwLower = kw.toLowerCase();
      if (
        kwLower !== keyWord.toLowerCase() &&
        kwLower.length >= 3 &&
        !distractors.has(kwLower)
      ) {
        distractors.add(kwLower);
      }
    }

    // If not enough distractors, generate variations
    const fallbackDistractors = [
      keyWord + "s",
      keyWord + "ing",
      keyWord + "ed",
      "un" + keyWord,
      keyWord.slice(0, -1) + "al",
      keyWord + "tion",
      keyWord + "ment",
    ];

    for (const fd of fallbackDistractors) {
      if (distractors.size >= 4) break;
      if (!distractors.has(fd.toLowerCase()) && fd.length >= 3) {
        distractors.add(fd.toLowerCase());
      }
    }

    // Convert to array and pick 3 distractors
    const distractorArray = Array.from(distractors)
      .filter((d) => d !== keyWord.toLowerCase())
      .slice(0, 3);

    // If still short, use random words
    while (distractorArray.length < 3) {
      const randWord = "option_" + distractorArray.length;
      if (!distractorArray.includes(randWord)) distractorArray.push(randWord);
    }

    // Build options array
    const options = [
      correctAnswer,
      ...distractorArray.map(
        (d) => d.charAt(0).toUpperCase() + d.slice(1).toLowerCase(),
      ),
    ];

    // Shuffle options
    shuffleArray(options);

    return {
      text: questionText,
      correctAnswer,
      options,
    };
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function getNextQuestion() {
    currentQuestionIndex++;
    if (currentQuestionIndex >= allQuestions.length) {
      return null;
    }
    return allQuestions[currentQuestionIndex];
  }

  function getCurrentQuestion() {
    if (currentQuestionIndex < 0 || currentQuestionIndex >= allQuestions.length)
      return null;
    return allQuestions[currentQuestionIndex];
  }

  function checkAnswer(selectedAnswer) {
    const question = getCurrentQuestion();
    if (!question) return null;
    const isCorrect =
      selectedAnswer.trim().toLowerCase() ===
      question.correctAnswer.trim().toLowerCase();
    if (isCorrect) {
      score += 100 + streak * 20;
      streak++;
      if (streak > bestStreak) bestStreak = streak;
    } else {
      streak = 0;
    }
    return {
      isCorrect,
      correctAnswer: question.correctAnswer,
      score,
      streak,
      bestStreak,
    };
  }

  function getProgress() {
    return {
      current: currentQuestionIndex + 1,
      total: allQuestions.length,
      score,
      streak,
      bestStreak,
      isComplete: currentQuestionIndex >= allQuestions.length - 1,
    };
  }

  function hasMoreQuestions() {
    return currentQuestionIndex < allQuestions.length - 1;
  }

  return {
    reset,
    parseFile,
    generateQuestions,
    getNextQuestion,
    getCurrentQuestion,
    checkAnswer,
    getProgress,
    hasMoreQuestions,
    getTotalQuestions: () => allQuestions.length,
  };
})();
