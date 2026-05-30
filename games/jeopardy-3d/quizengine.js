//Quiz Engine
/**
 * quizEngine.js - File parsing & Question generation
 */
const QuizEngine = (function () {
  const DEFAULT_QUESTION_COUNT = 20;
  const GENERIC_CONCEPTS = new Set([
    "topic", "topics", "slide", "slides", "lesson", "lessons", "chapter", "chapters",
    "section", "sections", "unit", "units", "content", "material", "materials", "notes",
    "detail", "details", "concept", "concepts", "example", "examples", "information",
  ]);
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

  function generateQuestions(text, count = DEFAULT_QUESTION_COUNT) {
    const sentences = extractFragments(text);

    if (sentences.length < 3) {
      throw new Error(
        "Not enough substantial sentences found. Please upload content with more complete sentences.",
      );
    }
    const factPool = sentences.map((sentence) => extractFact(sentence)).filter(Boolean);
    const conceptPool = buildConceptPool(sentences);

    // Select top sentences for questions
    const targetCount = Math.min(
      count,
      Math.max(4, Math.floor(sentences.length * 0.7)),
    );
    const selectedSentences = [];
    const usedIndices = new Set();

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
            index: i,
          });
          usedIndices.add(i);
        }
      }
    }

    // Generate questions
    allQuestions = selectedSentences.map((item, idx) => {
      const question = createQuestionFromFragment(
        item.sentence,
        item.index,
        sentences,
        factPool,
        conceptPool,
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

  function extractFragments(text) {
    return String(text || "")
      .replace(/\r/g, "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => line.split(/(?<=[.!?])\s+/))
      .map((fragment) => cleanPhrase(fragment))
      .filter((fragment) => fragment.length >= 24);
  }

  function cleanPhrase(text) {
    return String(text || "")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+/g, " ")
      .replace(/[\.:;,!?]+$/g, "")
      .trim();
  }

  function isGenericConcept(term) {
    const normalized = cleanPhrase(term).toLowerCase();
    return !normalized ||
      GENERIC_CONCEPTS.has(normalized) ||
      /^(topic|slide|lesson|chapter|section|unit)\s*\d*$/i.test(normalized);
  }

  function extractFact(fragment) {
    const sentence = cleanPhrase(fragment);
    const match = sentence.match(
      /^(.{3,70}?)\s+(is|are|means|refers to|defined as|describes|shows|explains|includes|contains|helps|allows|supports|uses|produces|creates|causes|comes from|requires)\s+(.{8,220})$/i,
    );
    if (!match) return null;
    const subject = cleanPhrase(match[1]);
    const relation = match[2].toLowerCase();
    const answer = cleanPhrase(match[3]);
    if (!subject || !answer || isGenericConcept(subject)) return null;
    if (subject.split(/\s+/).length > 6) return null;
    if (/\b(absorbs?|releases?|changes?|forms?|participates?|converts?|cools?|drives?|creates?|supports?|helps?|uses?|causes?)\b/i.test(subject)) return null;
    return { subject, relation, answer };
  }

  function buildConceptPool(fragments) {
    const pool = [];
    const seen = new Set();
    fragments.forEach((fragment) => {
      const concept = pickKeyConcept(fragment);
      const key = cleanPhrase(concept).toLowerCase();
      if (!concept || !key || seen.has(key)) return;
      seen.add(key);
      pool.push(concept);
    });
    return pool;
  }

  function pickKeyConcept(sentence) {
    const fact = extractFact(sentence);
    if (fact) return fact.subject;
    const leadingPhrase = extractLeadingPhrase(sentence);
    if (leadingPhrase) return leadingPhrase;
    const capitalized = cleanPhrase(sentence).match(/\b([A-Z][a-zA-Z0-9-]{3,}(?:\s+[A-Z][a-zA-Z0-9-]{3,})*)\b/g) || [];
    const bestCapitalized = capitalized
      .map((item) => cleanPhrase(item))
      .filter((item) => item.length > 3 && !isGenericConcept(item))
      .sort((a, b) => b.length - a.length)[0];
    if (bestCapitalized) return bestCapitalized;
    const tokens = cleanPhrase(sentence)
      .replace(/[^A-Za-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 5 && !isGenericConcept(token))
      .sort((a, b) => b.length - a.length);
    return tokens[0] || "this topic";
  }

  function extractLeadingPhrase(sentence) {
    const cleaned = cleanPhrase(sentence).replace(/^(the|a|an)\s+/i, "");
    const match = cleaned.match(
      /^([A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z][A-Za-z0-9-]*){0,2})\s+(?:absorbs?|releases?|changes?|forms?|participates?|converts?|cools?|drives?|creates?|supports?|helps?|uses?|causes?|produces?|includes?|contains?|develops?|maintains?)\b/i,
    );
    if (!match) return null;
    const phrase = cleanPhrase(match[1]);
    if (!phrase || isGenericConcept(phrase)) return null;
    return phrase;
  }

  function buildPromptFromFact(fact) {
    if (/^(is|are|means|refers to|defined as|describes|shows|explains)$/.test(fact.relation)) {
      return `Which statement best describes ${fact.subject}?`;
    }
    if (/^(includes|contains)$/.test(fact.relation)) {
      return `What does ${fact.subject} include?`;
    }
    return `According to the material, what does ${fact.subject} ${fact.relation}?`;
  }

  function createStatementAnswer(fragment) {
    const sentence = cleanPhrase(fragment);
    if (sentence.length <= 120) return sentence;
    return `${sentence.slice(0, 117).trimEnd()}...`;
  }

  function buildAnswerSet(correctAnswer, fragments, factPool, conceptPool, seed, mode, currentIndex) {
    const answers = [correctAnswer];
    const seen = new Set([cleanPhrase(correctAnswer).toLowerCase()]);
    const candidates = [];
    const localFragments = fragments.slice(Math.max(0, currentIndex - 4), currentIndex + 5);
    const localFacts = localFragments.map((fragment) => extractFact(fragment)).filter(Boolean);

    function pushCandidate(value) {
      const normalized = cleanPhrase(value);
      const key = normalized.toLowerCase();
      if (!normalized || normalized.length < 4 || seen.has(key)) return;
      seen.add(key);
      candidates.push(normalized);
    }

    if (mode === "fact") {
      localFacts.forEach((fact) => pushCandidate(fact.answer));
      factPool.forEach((fact) => pushCandidate(fact.answer));
    } else {
      localFragments.forEach((fragment) => pushCandidate(createStatementAnswer(fragment)));
      fragments.forEach((fragment) => pushCandidate(createStatementAnswer(fragment)));
    }

    conceptPool.forEach((concept) => pushCandidate(concept));
    cleanPhrase(seed)
      .split(/\s+/)
      .filter((word) => word.length > 4 && !isGenericConcept(word))
      .forEach((word) => pushCandidate(word));

    [
      "A different process from the material",
      "Another explanation from the lesson",
      "A separate supporting example",
      "A contrasting historical detail",
    ].forEach((item) => pushCandidate(item));

    for (const candidate of candidates) {
      if (answers.length >= 4) break;
      answers.push(candidate);
    }

    shuffleArray(answers);
    return answers;
  }

  function createQuestionFromFragment(sentence, sourceIndex, allSentences, factPool, conceptPool) {
    const fact = extractFact(sentence);
    if (fact) {
      return {
        text: buildPromptFromFact(fact),
        correctAnswer: fact.answer,
        options: buildAnswerSet(fact.answer, allSentences, factPool, conceptPool, fact.subject, "fact", sourceIndex),
      };
    }

    const concept = pickKeyConcept(sentence);
    const correctAnswer = createStatementAnswer(sentence);
    return {
      text: `Which statement about ${concept} matches the material?`,
      correctAnswer,
      options: buildAnswerSet(correctAnswer, allSentences, factPool, conceptPool, concept, "statement", sourceIndex),
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
