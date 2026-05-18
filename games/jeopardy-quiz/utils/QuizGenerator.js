class QuizGenerator {
  static generateQuestionsFromFileContent(contents) {
    const questions = [];
    const combinedContent = contents.map((c) => c.content).join(" ");

    // Simple sentence extraction and question generation
    const sentences = combinedContent
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);

    // Generate questions based on sentences
    sentences.slice(0, 10).forEach((sentence, index) => {
      const question = this.createQuestionFromSentence(sentence, index);
      if (question) {
        questions.push(question);
      }
    });

    return questions;
  }

  static createQuestionFromSentence(sentence, index) {
    // Remove extra whitespace and clean up
    sentence = sentence.replace(/\s+/g, " ").trim();

    if (sentence.length < 30) return null;

    // Simple approach: remove a key phrase and ask what was removed
    const words = sentence.split(" ");
    if (words.length < 8) return null;

    // Find a good word to remove (not articles, prepositions, etc.)
    const importantWords = words.filter(
      (word) =>
        ![
          "the",
          "a",
          "an",
          "and",
          "or",
          "but",
          "in",
          "on",
          "at",
          "to",
          "for",
          "of",
          "with",
          "by",
        ].includes(word.toLowerCase()) && word.length > 3,
    );

    if (importantWords.length === 0) return null;

    const wordToRemove =
      importantWords[Math.floor(Math.random() * importantWords.length)];
    const questionText = sentence.replace(
      new RegExp(`\\b${wordToRemove}\\b`, "gi"),
      "_____",
    );

    // Generate answer options
    const answers = this.generateAnswerOptions(wordToRemove);

    return {
      id: index,
      question: questionText,
      correctAnswer: wordToRemove,
      answers: answers,
      category: this.determineCategory(sentence),
      difficulty: this.determineDifficulty(sentence),
    };
  }

  static generateAnswerOptions(correctAnswer) {
    // In a real implementation, you'd use an API like WordNet or similar
    const distractors = [
      "option",
      "choice",
      "selection",
      "alternative",
      "possibility",
      "opportunity",
      "solution",
      "resolution",
    ];

    const answers = [correctAnswer];

    // Add 3 random distractors
    while (answers.length < 4) {
      const randomDistractor =
        distractors[Math.floor(Math.random() * distractors.length)];
      if (!answers.includes(randomDistractor)) {
        answers.push(randomDistractor);
      }
    }

    // Shuffle the answers
    return this.shuffleArray(answers);
  }

  static shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  static determineCategory(sentence) {
    const categories = [
      "Science",
      "History",
      "Literature",
      "Geography",
      "Mathematics",
    ];
    return categories[Math.floor(Math.random() * categories.length)];
  }

  static determineDifficulty(sentence) {
    const wordCount = sentence.split(" ").length;
    if (wordCount < 15) return "Easy";
    if (wordCount < 30) return "Medium";
    return "Hard";
  }
}

window.QuizGenerator = QuizGenerator;
