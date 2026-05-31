class QuizGenerator {
  static DEFAULT_QUESTION_COUNT = 20;
  static MIN_QUESTION_COUNT = 5;
  static MAX_QUESTION_COUNT = 40;
  static GENERIC_CONCEPTS = new Set([
    "topic", "topics", "slide", "slides", "lesson", "lessons", "chapter", "chapters",
    "section", "sections", "unit", "units", "content", "material", "materials", "notes",
    "detail", "details", "concept", "concepts", "example", "examples", "information"
  ]);

  static normalizeQuestionCount(count) {
    const parsed = Number.parseInt(count, 10);
    if (!Number.isFinite(parsed)) return this.DEFAULT_QUESTION_COUNT;
    return Math.max(this.MIN_QUESTION_COUNT, Math.min(this.MAX_QUESTION_COUNT, parsed));
  }

  static generateQuestionsFromFileContent(contents, requestedCount = this.DEFAULT_QUESTION_COUNT) {
    const questionCount = this.normalizeQuestionCount(requestedCount);
    const combinedContent = contents.map((c) => c.content).join("\n");
    const fragments = this.extractFragments(combinedContent);
    const conceptPool = this.buildConceptPool(fragments);
    const factPool = fragments.map((fragment) => this.extractFactPattern(fragment)).filter(Boolean);
    const questions = [];

    fragments.slice(0, questionCount * 2).forEach((fragment, index) => {
      const question = this.createQuestionFromFragment(fragment, index, conceptPool, fragments, factPool);
      if (question && !questions.some((item) => item.question === question.question)) {
        questions.push(question);
      }
    });

    return questions.slice(0, questionCount);
  }

  static createQuestionFromFragment(fragment, index, conceptPool, fragments, factPool) {
    const sentence = this.normalizeFragment(fragment);
    if (sentence.length < 24) return null;

    const fact = this.extractFactPattern(sentence);
    if (fact) {
      return {
        id: index,
        question: this.buildPromptFromFact(fact),
        correctAnswer: fact.answer,
        answers: this.buildAnswerSet(fact.answer, conceptPool, {
          seed: fact.subject,
          fragments,
          factPool,
          currentIndex: index,
          mode: "fact",
        }),
        category: this.inferCategory(fact.subject, sentence),
        difficulty: this.determineDifficulty(sentence),
      };
    }

    const keyConcept = this.pickKeyConcept(sentence, conceptPool);
    const questionText = this.buildPromptFromFragment(sentence, keyConcept);
    const correctAnswer = this.createStatementAnswer(sentence);
    const answers = this.buildAnswerSet(correctAnswer, conceptPool, {
      seed: keyConcept,
      fragments,
      factPool,
      currentIndex: index,
      mode: "statement",
    });

    return {
      id: index,
      question: questionText,
      correctAnswer,
      answers,
      category: this.inferCategory(keyConcept || "Slides", sentence),
      difficulty: this.determineDifficulty(sentence),
    };
  }

  static extractFragments(text) {
    return String(text || "")
      .replace(/\r/g, "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => line.split(/(?<=[.!?])\s+/))
      .map((fragment) => this.normalizeFragment(fragment))
      .filter((fragment) => fragment.length >= 24);
  }

  static buildConceptPool(fragments) {
    const pool = [];
    const seen = new Set();

    fragments.forEach((fragment) => {
      const term = this.pickKeyConcept(fragment);
      if (!term) return;
      const key = term.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      pool.push(term);
    });

    return pool;
  }

  static buildAnswerSet(correctAnswer, conceptPool, options = {}) {
    const { seed, fragments = [], factPool = [], currentIndex = 0, mode = "fact" } = options;
    const answers = [correctAnswer];
    const seen = new Set([String(correctAnswer).trim().toLowerCase()]);
    const distractors = [];

    const pushCandidate = (value) => {
      const normalized = this.cleanPhrase(value);
      const key = normalized.toLowerCase();
      if (!normalized || normalized.length < 4 || seen.has(key)) return;
      seen.add(key);
      distractors.push(normalized);
    };

    const localFragments = fragments.slice(Math.max(0, currentIndex - 4), currentIndex + 5);
    const localFacts = localFragments
      .map((fragment) => this.extractFactPattern(fragment))
      .filter(Boolean);

    if (mode === "fact") {
      localFacts.forEach((fact) => pushCandidate(fact.answer));
      factPool.forEach((fact) => pushCandidate(fact.answer));
    }

    if (mode === "statement") {
      localFragments.forEach((fragment) => pushCandidate(this.createStatementAnswer(fragment)));
      fragments.forEach((fragment) => pushCandidate(this.createStatementAnswer(fragment)));
    }

    conceptPool.forEach((concept) => {
      pushCandidate(concept);
    });

    if (seed) {
      const words = this.cleanPhrase(seed)
        .split(/\s+/)
        .filter((word) => word.length > 3);
      words.forEach((word) => {
        if (!this.isGenericConcept(word)) pushCandidate(word);
      });
    }

    const fallbackDistractors = [
      "A different process from the material",
      "Another explanation from the lesson",
      "A separate supporting example",
      "An unrelated historical detail",
      "A contrasting scientific idea",
    ];

    fallbackDistractors.forEach((item) => pushCandidate(item));

    for (const distractor of distractors) {
      if (answers.length >= 4) break;
      answers.push(distractor);
    }

    return this.shuffleArray(answers.slice(0, 4));
  }

  static extractFactPattern(fragment) {
    const sentence = this.cleanPhrase(fragment);
    const match = sentence.match(
      /^(.{3,70}?)\s+(is|are|means|refers to|defined as|describes|shows|explains|includes|contains|helps|allows|supports|uses|produces|creates|causes|comes from|requires)\s+(.{8,220})$/i,
    );

    if (!match) return null;

    const subject = this.cleanPhrase(match[1]);
    const relation = match[2].toLowerCase();
    const answer = this.cleanPhrase(match[3]);

    if (!subject || !answer || this.isGenericConcept(subject)) return null;
    if (subject.split(/\s+/).length > 6) return null;
    if (/\b(absorbs?|releases?|changes?|forms?|participates?|converts?|cools?|drives?|creates?|supports?|helps?|uses?|causes?)\b/i.test(subject)) return null;
    return { subject, relation, answer };
  }

  static buildPromptFromFact(fact) {
    if (/^(is|are|means|refers to|defined as|describes|shows|explains)$/.test(fact.relation)) {
      return `Which statement best describes ${fact.subject}?`;
    }

    if (/^(includes|contains)$/.test(fact.relation)) {
      return `What does ${fact.subject} include?`;
    }

    return `According to the slide, what does ${fact.subject} ${fact.relation}?`;
  }

  static createStatementAnswer(fragment) {
    const sentence = this.cleanPhrase(fragment);
    if (sentence.length <= 120) return sentence;
    const truncated = sentence.slice(0, 117).trimEnd();
    return `${truncated}...`;
  }

  static isGenericConcept(term) {
    const normalized = this.cleanPhrase(term).toLowerCase();
    return !normalized ||
      this.GENERIC_CONCEPTS.has(normalized) ||
      /^(topic|slide|lesson|chapter|section|unit)\s*\d*$/i.test(normalized);
  }

  static normalizeFragment(fragment) {
    return String(fragment || "")
      .replace(/^[-*•\d.)\s]+/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  static cleanPhrase(text) {
    return String(text || "")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+/g, " ")
      .replace(/[\.:;,!?]+$/g, "")
      .trim();
  }

  static pickKeyConcept(sentence, conceptPool) {
    const cleaned = this.cleanPhrase(sentence);
    const fact = this.extractFactPattern(cleaned);
    if (fact) return fact.subject;

    const leadingPhrase = this.extractLeadingPhrase(cleaned);
    if (leadingPhrase) return leadingPhrase;

    const stopWords = new Set([
      "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
      "of", "with", "by", "from", "into", "is", "are", "was", "were", "be",
      "this", "that", "these", "those", "it", "its", "as", "we", "you", "they",
      "he", "she", "their", "our", "your", "can", "will", "may", "might"
    ]);

    const capitalizedMatches = cleaned.match(/\b([A-Z][a-zA-Z0-9-]{3,}(?:\s+[A-Z][a-zA-Z0-9-]{3,})*)\b/g);
    if (capitalizedMatches && capitalizedMatches.length > 0) {
      const bestCapitalized = capitalizedMatches
        .map((item) => this.cleanPhrase(item))
        .filter((item) => item.length > 3 && !stopWords.has(item.toLowerCase()) && !this.isGenericConcept(item))
        .sort((a, b) => b.length - a.length)[0];
      if (bestCapitalized) {
        return bestCapitalized;
      }
    }

    const tokens = cleaned
      .replace(/[^A-Za-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4 && !stopWords.has(token.toLowerCase()) && !this.isGenericConcept(token))
      .sort((a, b) => b.length - a.length);

    if (tokens.length > 0) {
      return tokens[0];
    }

    return conceptPool[0] || null;
  }

  static extractLeadingPhrase(sentence) {
    const cleaned = this.cleanPhrase(sentence).replace(/^(the|a|an)\s+/i, "");
    const match = cleaned.match(
      /^([A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z][A-Za-z0-9-]*){0,2})\s+(?:absorbs?|releases?|changes?|forms?|participates?|converts?|cools?|drives?|creates?|supports?|helps?|uses?|causes?|produces?|includes?|contains?|develops?|maintains?)\b/i,
    );
    if (!match) return null;
    const phrase = this.cleanPhrase(match[1]);
    if (!phrase || this.isGenericConcept(phrase)) return null;
    return phrase;
  }

  static buildPromptFromFragment(fragment, concept) {
    const clean = this.cleanPhrase(fragment);
    if (concept) {
      return `Which statement about ${concept} matches the slide?`;
    }

    if (clean.length <= 140) {
      return `Which statement is supported by this slide excerpt?`;
    }

    return `Which statement is best supported by this slide excerpt?`;
  }

  static shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  static inferCategory(term, sentence) {
    const source = `${term} ${sentence}`.toLowerCase();
    if (/math|number|equation|formula|calculate|algebra|geometry/.test(source)) return "Mathematics";
    if (/science|cell|energy|biology|chemistry|physics|experiment/.test(source)) return "Science";
    if (/history|timeline|war|government|civilization|ancient/.test(source)) return "History";
    if (/book|story|novel|poem|character|author|literature/.test(source)) return "Literature";
    if (/map|country|city|continent|location|route|geography/.test(source)) return "Geography";
    return "Slides";
  }

  static determineDifficulty(sentence) {
    const wordCount = sentence.split(" ").length;
    if (wordCount < 15) return "Easy";
    if (wordCount < 30) return "Medium";
    return "Hard";
  }
}

window.QuizGenerator = QuizGenerator;
