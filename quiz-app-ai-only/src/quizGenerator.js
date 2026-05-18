import { generateFromGemini } from "./geminiClient.js";

function extractJsonObject(text) {
  const cleaned = String(text || "").replace(/^```json\s*/i, "").replace(/```$/i, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    if (start < 0) {
      throw new Error("No JSON object found in AI response");
    }

    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = start; i < cleaned.length; i += 1) {
      const ch = cleaned[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (ch === "\\") {
        escapeNext = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return JSON.parse(cleaned.slice(start, i + 1));
        }
      }
    }

    throw new Error("Could not parse JSON payload from AI response");
  }
}

function normalizeQuestion(raw) {
  const options = Array.isArray(raw?.options) ? raw.options.map((x) => String(x || "").trim()) : [];
  const answer = String(raw?.correctAnswer || "").trim().toUpperCase();
  const map = { A: 0, B: 1, C: 2, D: 3 };

  return {
    question: String(raw?.question || "").trim(),
    options,
    correctAnswer: answer,
    answerIndex: map[answer] ?? -1,
    explanation: String(raw?.explanation || "").trim(),
    difficulty: String(raw?.difficulty || "medium").trim().toLowerCase()
  };
}

function validateQuestion(q) {
  return q.question.length > 0 && q.options.length === 4 && q.answerIndex >= 0 && q.answerIndex <= 3;
}

export async function generateQuiz({ topic, numQuestions = 5, difficulty = "medium" }) {
  const count = Math.max(1, Math.min(20, Number(numQuestions) || 5));
  const level = ["easy", "medium", "hard"].includes(String(difficulty).toLowerCase())
    ? String(difficulty).toLowerCase()
    : "medium";

  const prompt = `
You are an expert quiz generator.
Generate ${count} multiple choice questions about: ${topic}
Difficulty: ${level}

Return ONLY JSON in this shape:
{
  "questions": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correctAnswer": "A",
      "difficulty": "${level}",
      "explanation": "string"
    }
  ]
}
`;

  const aiText = await generateFromGemini(prompt, { preferredModel: "gemini-2.5-pro", maxRetries: 2 });
  const parsed = extractJsonObject(aiText);

  const normalized = (Array.isArray(parsed?.questions) ? parsed.questions : [])
    .map(normalizeQuestion)
    .filter(validateQuestion)
    .slice(0, count);

  if (!normalized.length) {
    throw new Error("AI returned no valid quiz questions");
  }

  return {
    topic,
    difficulty: level,
    total: normalized.length,
    questions: normalized
  };
}

export async function generateSummaryFromSlides({ content }) {
  const cleaned = String(content || "").trim();
  if (!cleaned) {
    throw new Error("Slide content is required");
  }

  const prompt = `
You are an educational assistant.
Analyze the slide content and return ONLY JSON with this shape:
{
  "summary": "2-4 sentence summary",
  "keyPoints": ["point", "point", "point"]
}

Rules:
- Keep keyPoints to 5-8 concise bullets.
- No markdown, no code fences, no additional text.

Slide content:
${cleaned.slice(0, 24000)}
`;

  const aiText = await generateFromGemini(prompt, { preferredModel: "gemini-2.5-pro", maxRetries: 2 });
  const parsed = extractJsonObject(aiText);

  const summary = String(parsed?.summary || "").trim();
  const keyPoints = Array.isArray(parsed?.keyPoints)
    ? parsed.keyPoints.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
    : [];

  if (!summary && keyPoints.length === 0) {
    throw new Error("AI returned no valid summary information");
  }

  return {
    summary: summary || "Summary was not available, but slide content was processed.",
    keyPoints
  };
}

export async function generateQuizFromSlides({ content, numQuestions = 5, difficulty = "medium" }) {
  const cleaned = String(content || "").trim();
  if (!cleaned) {
    throw new Error("Slide content is required");
  }

  const count = Math.max(1, Math.min(20, Number(numQuestions) || 5));
  const level = ["easy", "medium", "hard"].includes(String(difficulty).toLowerCase())
    ? String(difficulty).toLowerCase()
    : "medium";

  const prompt = `
You are an expert quiz generator.
Create ${count} multiple choice questions from the slide content below.
Difficulty: ${level}

Return ONLY JSON in this shape:
{
  "questions": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correctAnswer": "A",
      "difficulty": "${level}",
      "explanation": "string"
    }
  ]
}

Slide content:
${cleaned.slice(0, 24000)}
`;

  const aiText = await generateFromGemini(prompt, { preferredModel: "gemini-2.5-pro", maxRetries: 2 });
  const parsed = extractJsonObject(aiText);

  const normalized = (Array.isArray(parsed?.questions) ? parsed.questions : [])
    .map(normalizeQuestion)
    .filter(validateQuestion)
    .slice(0, count);

  if (!normalized.length) {
    throw new Error("AI returned no valid quiz questions from slides");
  }

  return {
    difficulty: level,
    total: normalized.length,
    questions: normalized
  };
}

export async function generateCodeFromSlides({ content, language = "javascript" }) {
  const cleaned = String(content || "").trim();
  if (!cleaned) {
    throw new Error("Slide content is required");
  }

  const selectedLanguage = String(language || "javascript").trim().toLowerCase();
  const prompt = `
You are a senior software engineer.
Based on the provided slide content, generate practical ${selectedLanguage} code that implements the main concept.

Return ONLY JSON in this shape:
{
  "language": "${selectedLanguage}",
  "title": "short title",
  "code": "full code",
  "explanation": "2-4 sentence explanation"
}

Rules:
- Code must be runnable and coherent.
- No markdown or code fences.
- Keep code focused on the core concept from the slides.

Slide content:
${cleaned.slice(0, 24000)}
`;

  const aiText = await generateFromGemini(prompt, { preferredModel: "gemini-2.5-pro", maxRetries: 2 });
  const parsed = extractJsonObject(aiText);

  const title = String(parsed?.title || "Generated Slide Code").trim();
  const code = String(parsed?.code || "").trim();
  const explanation = String(parsed?.explanation || "").trim();

  if (!code) {
    throw new Error("AI returned no code from slides");
  }

  return {
    language: String(parsed?.language || selectedLanguage).trim().toLowerCase(),
    title,
    code,
    explanation
  };
}
