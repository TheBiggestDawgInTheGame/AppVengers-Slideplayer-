/**
 * ai-processor.js
 * Client-side AI question generator for SlidePlay.
 *
 * ─── HOW TO GET A FREE API KEY ───────────────────────────────────────────────
 *  1. Go to https://aistudio.google.com/app/apikey
 *  2. Click "Create API Key" (free tier, no credit card needed)
 *  3. Paste it below as the value of GEMINI_KEY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Exposes: window.AIProcessor
 *   .processFile(file, opts) → Promise<{ questions[], count, topic, rawText }>
 *
 * opts: { difficulty:"easy"|"medium"|"hard", count:10, questionType:"mcq"|"true_false"|"short_answer"|"mixed" }
 */

(function () {
  "use strict";

  const API_BASE = (
    window.SLIDEPLAY_API_BASE ||
    localStorage.getItem("sp_api_base") ||
    window.location.origin
  ).replace(/\/$/, "");

  // ── ⚙️  CONFIG — server proxy URL ──────────────────────────
  const AI_PROXY = API_BASE + '/api/gemini-proxy';
  // ─────────────────────────────────────────────────────────────

  // Bloom's Taxonomy per difficulty
  const BLOOM = {
    easy:   { levels: ["remember", "understand"],                   verbs: "identify, recall, describe, explain" },
    medium: { levels: ["apply", "analyze"],                         verbs: "apply, compare, distinguish, interpret, solve" },
    hard:   { levels: ["evaluate", "synthesize", "create"],         verbs: "evaluate, justify, critique, design, argue" },
  };

  // Stop-words for Jaccard deduplication
  const STOP = new Set(["a","an","the","is","are","was","were","in","on","at","of","to","and","or","not","what","which","who","how","when","where","does","do","it","its"]);
  function tokenize(s) {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g,"").split(/\s+/).filter(t => t.length>1 && !STOP.has(t));
  }
  function jaccard(a, b) {
    const sa = new Set(tokenize(a)), sb = new Set(tokenize(b));
    const inter = [...sa].filter(t => sb.has(t)).length;
    const union = new Set([...sa,...sb]).size;
    return union ? inter/union : 0;
  }
  function isDuplicate(q, seen, threshold=0.5) {
    for (const s of seen) if (jaccard(q, s) >= threshold) return true;
    return false;
  }

  function wordCount(s) {
    return String(s || "").trim().split(/\s+/).filter(Boolean).length;
  }

  function looksTrivialStem(s) {
    return /^(what is|who is|when is|when did|where is|define|name|identify|which of the following|choose the correct|select the correct)\b/i.test(String(s || "").trim());
  }

  function hasAnswerLeak(question, answerText) {
    const q = String(question || "").toLowerCase();
    const a = String(answerText || "").toLowerCase().trim();
    if (a.length < 6) return false;
    return q.includes(a);
  }

  function normalizeQuestionType(rawType) {
    const t = String(rawType || "mixed").toLowerCase().trim();
    if (t === "true-false" || t === "truefalse" || t === "tf") return "true_false";
    if (t === "short" || t === "short-answer" || t === "shortanswer") return "short_answer";
    if (t === "mcq" || t === "mixed" || t === "true_false" || t === "short_answer") return t;
    return "mixed";
  }

  function passesQualityGate(rawQ, questionType, expectedDifficulty) {
    const question = String(rawQ?.question || "").trim();
    const explanation = String(rawQ?.explanation || "").trim();

    if (question.length < 16 || wordCount(question) < 5) return false;
    if (explanation.length < 18) return false;

    // Medium/Hard should avoid short trivial recall stems.
    if ((expectedDifficulty === "medium" || expectedDifficulty === "hard") && looksTrivialStem(question) && question.length < 80) {
      return false;
    }

    if (questionType === "true_false") {
      if (!/\b(true|false)\b/i.test(question) && question.length < 20) return false;
      return true;
    }

    if (questionType !== "true_false") {
      if (questionType === "short_answer") {
        const accepted = Array.isArray(rawQ?.acceptedAnswers) ? rawQ.acceptedAnswers : [];
        if (accepted.length < 1) return false;
        if (accepted.some((a) => String(a || "").trim().length < 2)) return false;
        if (hasAnswerLeak(question, rawQ?.sampleAnswer || accepted[0])) return false;
        return true;
      }

      const options = Array.isArray(rawQ?.options) ? rawQ.options : [];
      if (options.length !== 4) return false;
      if (options.some(o => String(o || "").trim().length < 2)) return false;
      if (options.some(o => /all of the above|none of the above/i.test(String(o || "")))) return false;

      const correctIdx = { A:0, B:1, C:2, D:3 }[rawQ?.correctAnswer];
      if (typeof correctIdx !== "number") return false;
      if (hasAnswerLeak(question, options[correctIdx])) return false;

      const stemTokens = tokenize(question);
      const distractorOverlap = options
        .filter((_, idx) => idx !== correctIdx)
        .map((option) => clamp01(jaccard(question, option)));
      if (distractorOverlap.some((value) => value > 0.8)) return false;
      if (stemTokens.length < 4) return false;
    }

    return true;
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, Number(v) || 0));
  }

  function safeJsonParse(str, fallback) {
    try {
      const parsed = JSON.parse(str);
      return parsed == null ? fallback : parsed;
    } catch (_err) {
      return fallback;
    }
  }

  function inferUserRole() {
    const fromSession = safeJsonParse(localStorage.getItem("sp_session") || "null", null)?.role;
    if (fromSession === "teacher" || fromSession === "student") return fromSession;
    if (/student/i.test(window.location.pathname)) return "student";
    if (/teacher/i.test(window.location.pathname)) return "teacher";
    return "student";
  }

  function nextHarderDifficulty(level) {
    if (level === "easy") return "medium";
    if (level === "medium") return "hard";
    return "hard";
  }

  function nextEasierDifficulty(level) {
    if (level === "hard") return "medium";
    if (level === "medium") return "easy";
    return "easy";
  }

  function deriveStudentSkillSignal() {
    const reports = safeJsonParse(localStorage.getItem("sp_game_reports") || "[]", []);
    if (!Array.isArray(reports) || reports.length === 0) {
      return { confidence: 0, meanAccuracy: 0.6 };
    }

    const recent = reports.slice(-20);
    const accuracies = recent
      .map((r) => {
        if (!r) return null;
        if (typeof r.accuracy === "number") return clamp01(r.accuracy > 1 ? r.accuracy / 100 : r.accuracy);
        const total = Number(r.totalQuestions || r.total || 0);
        const correct = Number(r.correctCount || r.correct || 0);
        if (total > 0) return clamp01(correct / total);
        return null;
      })
      .filter((v) => typeof v === "number");

    if (accuracies.length === 0) {
      return { confidence: 0, meanAccuracy: 0.6 };
    }

    const mean = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    return { confidence: clamp01(accuracies.length / 8), meanAccuracy: clamp01(mean) };
  }

  function resolveAdaptiveDifficulty(inputDifficulty, role) {
    const base = inputDifficulty || "medium";
    if (role !== "student") return { effectiveDifficulty: base, adjusted: false };

    const signal = deriveStudentSkillSignal();
    if (signal.confidence < 0.35) {
      return { effectiveDifficulty: base, adjusted: false };
    }

    if (signal.meanAccuracy >= 0.82 && base !== "hard") {
      return { effectiveDifficulty: nextHarderDifficulty(base), adjusted: true };
    }

    if (signal.meanAccuracy <= 0.45 && base !== "easy") {
      return { effectiveDifficulty: nextEasierDifficulty(base), adjusted: true };
    }

    return { effectiveDifficulty: base, adjusted: false };
  }

  function conceptOverlapRatio(questionText, sourceText) {
    const qTokens = tokenize(questionText || "");
    const srcTokens = new Set(tokenize(String(sourceText || "").slice(0, 12000)));
    if (!qTokens.length || srcTokens.size === 0) return 0;
    let hits = 0;
    for (const t of qTokens) if (srcTokens.has(t)) hits += 1;
    return clamp01(hits / Math.max(4, qTokens.length));
  }

  function estimateDistractorQuality(options, correctIdx) {
    if (!Array.isArray(options) || options.length !== 4) return 0;
    const correct = String(options[correctIdx] || "").trim();
    if (!correct) return 0;
    const wrong = options.filter((_, i) => i !== correctIdx).map((o) => String(o || "").trim()).filter(Boolean);
    if (wrong.length !== 3) return 0;

    const lengths = wrong.map((o) => wordCount(o));
    const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const lenBalance = clamp01(1 - Math.abs(avgLen - wordCount(correct)) / Math.max(6, wordCount(correct)));

    const lexicalDistance = wrong
      .map((o) => 1 - jaccard(o, correct))
      .reduce((a, b) => a + b, 0) / wrong.length;

    return clamp01(0.55 * lexicalDistance + 0.45 * lenBalance);
  }

  function scoreQuestionCandidate(rawQ, normalizedQ, questionType, difficulty, sourceText) {
    const qText = String(rawQ?.question || "").trim();
    const qWords = wordCount(qText);
    const lengthScore = clamp01(Math.min(qWords, 20) / 20);
    const trivialPenalty = looksTrivialStem(qText) ? 0.25 : 0;
    const explanationScore = clamp01(Math.min(wordCount(rawQ?.explanation || ""), 24) / 24);
    const anchorScore = conceptOverlapRatio(qText, sourceText);

    let distractorScore = 0.7;
    if (questionType !== "true_false") {
      const idx = { A:0, B:1, C:2, D:3 }[rawQ?.correctAnswer];
      distractorScore = estimateDistractorQuality(rawQ?.options || [], idx);
    }

    const difficultyAlignment = rawQ?.difficulty && String(rawQ.difficulty).toLowerCase() === difficulty ? 1 : 0.7;

    const score =
      0.26 * lengthScore +
      0.24 * explanationScore +
      0.2 * anchorScore +
      0.2 * distractorScore +
      0.1 * difficultyAlignment -
      trivialPenalty;

    return {
      normalizedQ,
      score: clamp01(score),
      text: String(normalizedQ?.text || "")
    };
  }

  function selectDiverseTopQuestions(scored, count) {
    const sorted = scored.slice().sort((a, b) => b.score - a.score);
    const selected = [];

    for (const cand of sorted) {
      if (selected.length === 0) {
        selected.push(cand);
      } else {
        const maxSimilarity = selected.reduce((mx, s) => Math.max(mx, jaccard(s.text, cand.text)), 0);
        if (maxSimilarity < 0.55) selected.push(cand);
      }
      if (selected.length >= count) break;
    }

    if (selected.length < count) {
      for (const cand of sorted) {
        if (selected.includes(cand)) continue;
        selected.push(cand);
        if (selected.length >= count) break;
      }
    }

    return selected.map((x) => x.normalizedQ);
  }

  // ── Text extraction ─────────────────────────────────────────

  function readAsText(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = e => res(e.target.result);
      r.onerror = () => rej(new Error("FileReader failed"));
      r.readAsText(file);
    });
  }

  function readAsArrayBuffer(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = e => res(e.target.result);
      r.onerror = () => rej(new Error("FileReader failed"));
      r.readAsArrayBuffer(file);
    });
  }

  /** Extract text from a PDF using PDF.js (loaded from CDN) */
  async function extractPDF(file) {
    if (!window.pdfjsLib) throw new Error("PDF.js not loaded");
    const ab = await readAsArrayBuffer(file);
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
    const pages = [];
    const maxPages = Math.min(pdf.numPages, 30); // cap at 30 slides
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const str = content.items.map(it => it.str).join(" ").trim();
      if (str) pages.push(str);
    }
    return pages.join("\n\n");
  }

  /** Extract text from PPTX or DOCX using JSZip */
  async function extractZippedXML(file, fileMatcher, textTagRegex) {
    if (!window.JSZip) throw new Error("JSZip not loaded");
    const ab = await readAsArrayBuffer(file);
    const zip = await JSZip.loadAsync(ab);
    const textParts = [];
    const names = Object.keys(zip.files).filter(fileMatcher).sort();
    for (const name of names) {
      const xml = await zip.files[name].async("string");
      const matches = xml.match(textTagRegex) || [];
      const text = matches.map(m => m.replace(/<[^>]+>/g, "")).join(" ").replace(/\s+/g, " ").trim();
      if (text) textParts.push(text);
    }
    return textParts.join("\n\n");
  }

  async function extractText(file) {
    const name = file.name.toLowerCase();

    if (name.endsWith(".pdf")) {
      try { return await extractPDF(file); }
      catch (e) { console.warn("PDF extraction failed:", e.message); }
    }

    if (name.endsWith(".pptx")) {
      try {
        return await extractZippedXML(
          file,
          n => n.startsWith("ppt/slides/slide") && n.endsWith(".xml"),
          /<a:t[^>]*>.*?<\/a:t>/gs
        );
      } catch (e) { console.warn("PPTX extraction failed:", e.message); }
    }

    if (name.endsWith(".docx")) {
      try {
        return await extractZippedXML(
          file,
          n => n === "word/document.xml",
          /<w:t[^>]*>.*?<\/w:t>/gs
        );
      } catch (e) { console.warn("DOCX extraction failed:", e.message); }
    }

    if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".csv")) {
      try { return await readAsText(file); }
      catch (e) { console.warn("Text read failed:", e.message); }
    }

    // Last resort — try as plain text
    try { return await readAsText(file); }
    catch (_) { return ""; }
  }

  // ── Image file detector ──────────────────────────────────────
  const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"];
  function isImageFile(file) {
    const name = file.name.toLowerCase();
    return IMAGE_EXTS.some(ext => name.endsWith(ext));
  }

  let _tesseractLoadPromise = null;
  async function ensureTesseract() {
    if (window.Tesseract) return window.Tesseract;
    if (_tesseractLoadPromise) return _tesseractLoadPromise;

    _tesseractLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      script.async = true;
      script.onload = () => {
        if (window.Tesseract) resolve(window.Tesseract);
        else reject(new Error("Tesseract loaded but unavailable"));
      };
      script.onerror = () => reject(new Error("Failed to load OCR library"));
      document.head.appendChild(script);
    });

    return _tesseractLoadPromise;
  }

  async function extractImageTextOCR(file) {
    const Tesseract = await ensureTesseract();
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = () => rej(new Error("Image read failed for OCR"));
      r.readAsDataURL(file);
    });

    const result = await Tesseract.recognize(dataUrl, "eng");
    return (result?.data?.text || "").replace(/\s+/g, " ").trim();
  }

  // ── Gemini vision call (image → questions directly) ──────────
  function buildQuestionResponseSchema(questionType, difficulty) {
    const qType = normalizeQuestionType(questionType);
    const correctAnswerType = qType === "true_false" ? "BOOLEAN" : "STRING";
    return {
      type: "OBJECT",
      properties: {
        topic: { type: "STRING" },
        questions: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              question: { type: "STRING" },
              options: { type: "ARRAY", items: { type: "STRING" } },
              correctAnswer: { type: correctAnswerType },
              acceptedAnswers: { type: "ARRAY", items: { type: "STRING" } },
              sampleAnswer: { type: "STRING" },
              difficulty: { type: "STRING", enum: ["easy", "medium", "hard", difficulty || "medium"] },
              explanation: { type: "STRING" },
              bloomLevel: { type: "STRING" },
              type: { type: "STRING" }
            }
          }
        }
      }
    };
  }

  async function callGeminiVision(file, opts) {
    const { difficulty = "medium", count = 10, questionType = "mcq", strict = false } = opts;
    const qType = normalizeQuestionType(questionType);
    const bloom = BLOOM[difficulty] || BLOOM.medium;

    // Read image as base64
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = e => res(e.target.result.split(",")[1]); // strip data:…;base64,
      r.onerror = () => rej(new Error("Image read failed"));
      r.readAsDataURL(file);
    });

    const mimeType = file.type || "image/png";

        const typeInstructions = qType === "true_false"
      ? `- Generate TRUE/FALSE questions only. "correctAnswer" must be true or false (boolean).`
      : qType === "short_answer"
      ? `- Generate SHORT ANSWER questions only.
    - Each question must expect a typed answer of 2-20 words.
    - Provide "acceptedAnswers" as an array with at least 2 valid answer variants.
    - Provide "sampleAnswer" as a concise ideal answer.`
      : qType === "mixed"
      ? `- Generate a MIX of multiple choice and short-answer questions.
    - At least 30% must be short-answer when difficulty is hard.
    - For MCQ: exactly 4 options and "correctAnswer" as "A"|"B"|"C"|"D".
    - For short-answer: include "acceptedAnswers" (2+ variants) and "sampleAnswer".`
      : `- Generate MULTIPLE CHOICE questions with exactly 4 options (A, B, C, D).
    - All 4 options must be plausible. "correctAnswer" must be "A", "B", "C", or "D".`;

    const prompt = `You are an expert educator. The image contains slide content, a diagram, notes, or a whiteboard photo.
Analyse the visual content thoroughly — including text, charts, diagrams, tables, and any handwriting — then generate quiz questions from it.

DIFFICULTY: ${difficulty.toUpperCase()}
Bloom's targets: ${bloom.levels.join(", ")} | Verbs: ${bloom.verbs}

REQUIREMENTS:
- Generate exactly ${count} questions based on what you see in the image.
- NEVER ask a question answerable by copying a single visible sentence. Require thinking.
- ${difficulty === "hard" ? "Ask students to evaluate, justify, or apply the concepts shown." : ""}
- ${difficulty === "medium" ? "Test application and analysis — WHY and HOW, not just WHAT." : ""}
- ${difficulty === "easy" ? "Test direct recall of the content shown." : ""}
- Every question must be specific, clear, and non-trivial.
- Avoid generic stems like "What is ..." unless unavoidable.
- Avoid answer leakage where the correct option text appears in the question.
${typeInstructions}
- Include a 1-2 sentence "explanation" per answer.
- Do NOT ask about image quality, formatting, or metadata.
${strict ? "- PRIORITY QUALITY MODE: reject weak/repetitive items and regenerate stronger alternatives before returning." : ""}

RESPONSE FORMAT: Return ONLY valid JSON — no markdown fences, no extra text.

${qType === "true_false" ? `{
  "topic": "Brief topic inferred from the image",
  "questions": [{ "question": "...", "correctAnswer": true, "difficulty": "${difficulty}", "explanation": "..." }]
}` : qType === "short_answer" ? `{
  "topic": "Brief topic inferred from the image",
  "questions": [{ "question": "...", "acceptedAnswers": ["...", "..."], "sampleAnswer": "...", "difficulty": "${difficulty}", "explanation": "...", "type": "short_answer" }]
}` : `{
  "topic": "Brief topic inferred from the image",
  "questions": [{ "question": "...", "options": ["A","B","C","D"], "correctAnswer": "A", "difficulty": "${difficulty}", "explanation": "...", "bloomLevel": "${bloom.levels[0]}", "type": "mcq" }, { "question": "...", "acceptedAnswers": ["...", "..."], "sampleAnswer": "...", "difficulty": "${difficulty}", "explanation": "...", "type": "short_answer" }]
}`}`.trim();

    const resp = await fetch(`${AI_PROXY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        image: { data: base64, mimeType },
        responseSchema: buildQuestionResponseSchema(qType, difficulty)
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error || `Proxy vision error ${resp.status}`);
    }

    const data = await resp.json();
    return data?.text || "";
  }

  // ── Prompt builder ───────────────────────────────────────────

  function buildPrompt(text, opts) {
    const { difficulty = "medium", count = 10, questionType = "mcq" } = opts;
    const qType = normalizeQuestionType(questionType);
    const bloom = BLOOM[difficulty] || BLOOM.medium;
    const focusTerms = extractFocusTerms(text, 10);

    // Trim text to ~30 000 chars — Gemini 2.0 Flash supports ~1M tokens
    const excerpt = text.length > 30000 ? text.substring(0, 30000) + "\n[...content truncated...]" : text;

        const typeInstructions = qType === "true_false"
      ? `- Generate TRUE/FALSE questions only.
- Each question must be an unambiguous factual statement that is clearly true or false.
- Aim for roughly half true, half false.
- "correctAnswer" must be true or false (boolean).`
      : qType === "short_answer"
      ? `- Generate SHORT ANSWER questions only.
    - Include "acceptedAnswers" with at least 2 valid variants.
    - Include "sampleAnswer" as an exemplar answer under 25 words.
    - Keep prompts answerable from the lesson content only.`
      : qType === "mixed"
      ? `- Generate a MIX of multiple choice and short-answer questions.
    - For short-answer items, include "acceptedAnswers" and "sampleAnswer".
    - For multiple choice, use exactly 4 plausible options with "correctAnswer" as "A"|"B"|"C"|"D".
    - At hard difficulty, ensure at least 30% short-answer questions.`
      : `- Generate MULTIPLE CHOICE questions with exactly 4 options (A, B, C, D).
- All 4 options must be plausible — avoid obviously wrong distractors.
- "correctAnswer" must be "A", "B", "C", or "D".
    ${qType === "mixed" ? "- Vary question styles: definition, application, scenario, comparison." : ""}`;

    return `You are an expert educator and quiz designer.
Your job is to create pedagogically sound quiz questions based ONLY on the lesson content below.

═══════════════════ LESSON CONTENT ═══════════════════
${excerpt}
══════════════════════════════════════════════════════

DIFFICULTY: ${difficulty.toUpperCase()}
Bloom's Taxonomy targets: ${bloom.levels.join(", ")}
Question verbs to use: ${bloom.verbs}
${focusTerms.length ? `
FOCUS CONCEPTS / TERMS TO ANCHOR ON:
${focusTerms.map(t => `- ${t}`).join("\n")}` : ""}

REQUIREMENTS:
- Generate exactly ${count} questions.
- Every question must be directly answerable from the lesson content above. Do NOT use general knowledge.
- Prefer specific, slide-based questions over broad textbook trivia.
- Use the focus concepts above when choosing what to ask about.
- Mix question stems when appropriate: explain why, compare, apply, infer, evaluate, identify relationships.
- Aim for variety across the set: no repeated opening pattern, no repeated wording, and no near-duplicate concepts.
- At medium and hard difficulty, at least half of the questions should require application, comparison, inference, or reasoning rather than direct recall.
- ${difficulty === "hard" ? "Include nuanced reasoning, common misconceptions as distractors, and multi-step thinking." : ""}
- ${difficulty === "easy" ? "Use clear, direct language. Test recall and basic understanding." : ""}
- ${difficulty === "medium" ? "Test application and analysis of the content, not just recall." : ""}
${typeInstructions}
- Avoid repetitive openings like "What is..." unless the slide is clearly a definition slide.
- Favor stems such as "Which statement best explains...", "What would happen if...", "Which example best fits...", "How does...", and "Why does...".
- For MCQ: keep all four options plausible, similar in style and length, and based on likely misconceptions from the lesson.
- Do not make the correct answer obvious through length, wording, or grammar.
- Include a concise "explanation" (1–2 sentences) for each correct answer — this is used for coaching.
- Explanations should briefly justify the correct answer using the lesson content and should not simply restate the answer.
- Do NOT include questions about formatting, page numbers, or metadata.
- Avoid trivial stems (e.g., "What is...") unless pedagogically justified.
- Avoid answer leakage (the correct option phrase appearing inside the question text).
- If the content is sparse, return fewer high-quality questions instead of forcing weak ones.
- If a draft question is weak, regenerate it before final output.

RESPONSE FORMAT: Return ONLY a single valid JSON object. No markdown, no extra text.

${qType === "true_false" ? `{
  "topic": "Brief topic title inferred from content",
  "questions": [
    {
      "question": "A clear, factual statement that is true or false",
      "correctAnswer": true,
      "difficulty": "${difficulty}",
      "explanation": "Why this is true/false based on the lesson"
    }
  ]
}` : qType === "short_answer" ? `{
  "topic": "Brief topic title inferred from content",
  "questions": [
    {
      "question": "Question text based on the lesson content",
      "acceptedAnswers": ["Answer variant 1", "Answer variant 2"],
      "sampleAnswer": "Model short answer",
      "difficulty": "${difficulty}",
      "explanation": "1-2 sentence explanation citing lesson content",
      "bloomLevel": "${bloom.levels[0]}",
      "type": "short_answer"
    }
  ]
}` : `{
  "topic": "Brief topic title inferred from content",
  "questions": [
    {
      "question": "Question text based on the lesson content",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "A",
      "difficulty": "${difficulty}",
      "explanation": "1-2 sentence explanation citing the lesson content",
      "bloomLevel": "${bloom.levels[0]}",
      "type": "mcq"
    }
  ]
}`}`.trim();
  }

  function buildRegenerationPrompt(text, opts, previousCount) {
    const { difficulty = "medium", count = 10, questionType = "mcq" } = opts;
    const base = buildPrompt(text, { difficulty, count, questionType });
    return `${base}

QUALITY REGENERATION PASS:
- The previous draft produced only ${previousCount} acceptable questions.
- Regenerate to return exactly ${count} strong questions that pass strict quality.
- Replace any weak, repetitive, or overly generic question with a more specific one.
- Prefer scenario-based, application, comparison, and reasoning prompts.
- Make the distractors more plausible and closer in wording to the correct answer.
- Keep explanations concise and evidence-based from the lesson content.
- Do not reuse the same question stem patterns from the previous draft.
`.trim();
  }

  async function generateWithQualityRetry(sourceText, opts, questionType, sourceKind, buildFn) {
    const targetCount = Math.max(1, Number(opts.count || 10));
    const minAcceptable = Math.max(3, Math.ceil(targetCount * 0.75));
    const initialRaw = await buildFn(false, targetCount);
    let result = parseAndFilter(initialRaw, targetCount, questionType, {
      difficulty: opts.difficulty,
      sourceText,
    });

    if (result.questions.length >= minAcceptable) {
      return result;
    }

    const retryTarget = Math.max(targetCount, Math.ceil(targetCount * 1.5));
    const retryRaw = await buildFn(true, retryTarget, result.questions.length);
    const retried = parseAndFilter(retryRaw, targetCount, questionType, {
      difficulty: opts.difficulty,
      sourceText,
    });

    if (retried.questions.length > result.questions.length) {
      return retried;
    }

    if (sourceKind && result.questions.length > 0) {
      result.source = sourceKind;
    }

    return result;
  }

  function extractFocusTerms(text, limit = 10) {
    const terms = collectFallbackTerms(text, limit * 2);
    const phrases = [];
    const lines = String(text || "")
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const cleaned = line.replace(/\s+/g, " ");
      if (cleaned.length < 8) continue;
      if (/^(title|agenda|objectives?|summary|introduction|conclusion|thank you)/i.test(cleaned)) continue;
      if (cleaned.split(/\s+/).length <= 8 && /[:\-]/.test(cleaned)) {
        phrases.push(cleaned.replace(/[:\-].*$/, "").trim());
      }
      if (phrases.length >= limit) break;
    }

    return [...new Set([...phrases, ...terms])].slice(0, limit);
  }

  function collectFallbackTerms(text, limit = 20) {
    const words = String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .filter(word => word.length >= 5 && !STOP.has(word));

    const counts = new Map();
    for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([word]) => word)
      .slice(0, limit);
  }

  function buildTextFallbackQuestions(rawText, count, difficulty, questionType) {
    const qType = normalizeQuestionType(questionType);
    const terms = collectFallbackTerms(rawText, Math.max(8, count * 4));
    const topic = terms[0] || "lesson content";
    if (terms.length === 0) return { questions: [], count: 0, topic, rawText: "", source: "fallback" };

    const questions = [];
    for (let i = 0; i < terms.length && questions.length < count; i++) {
      const term = terms[i];

      if (qType === "true_false") {
        questions.push({
          text: "The slide content mentions " + term + ".",
          options: ["True", "False"],
          correct: 0,
          explanation: "The extracted slide text includes the term \"" + term + "\".",
          difficulty,
          type: "true_false"
        });
      } else if (qType === "short_answer" || (qType === "mixed" && difficulty === "hard" && i % 3 === 0)) {
        questions.push({
          text: "In one short phrase, explain the meaning of \"" + term + "\" as used in the lesson content.",
          acceptedAnswers: [term, "the concept of " + term],
          sampleAnswer: term,
          explanation: "A strong answer should correctly reference \"" + term + "\" in context.",
          difficulty,
          bloomLevel: difficulty === "hard" ? "evaluate" : "understand",
          type: "short_answer"
        });
      } else {
        const distractors = terms.filter((t) => t !== term).slice(0, 3);
        while (distractors.length < 3) distractors.push("option" + (distractors.length + 1));
        const options = [term, ...distractors].sort(() => Math.random() - 0.5);
        questions.push({
          text: "Which of the following terms appears in the slide content?",
          options,
          correct: options.indexOf(term),
          explanation: "The slide text includes \"" + term + "\" among its key terms.",
          difficulty,
          bloomLevel: difficulty === "hard" ? "analyze" : difficulty === "medium" ? "understand" : "remember",
          type: "mcq"
        });
      }
    }

    return { questions, count: questions.length, topic, rawText, source: "text_fallback" };
  }

  // ── Gemini REST call ─────────────────────────────────────────

  async function callGemini(prompt, options = {}) {
    const payload = { prompt };
    if (options.responseSchema && typeof options.responseSchema === "object") {
      payload.responseSchema = options.responseSchema;
    }

    const resp = await fetch(AI_PROXY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error || `Proxy error ${resp.status}`);
    }

    const data = await resp.json();
    return data?.text || "";
  }

  // ── Response parser & quality filter ────────────────────────

  function parseAndFilter(rawText, count, questionType, opts = {}) {
    const expectedDifficulty = opts.difficulty || "medium";
    const sourceText = opts.sourceText || "";
    // Strip markdown code fences if present
    const clean = rawText.replace(/```(?:json)?\s*([\s\S]*?)\s*```/, "$1").trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch (e) {
      // Try to extract JSON object from the text
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error("AI returned unparseable response");
    }

    const rawQs = parsed?.questions;
    if (!Array.isArray(rawQs) || rawQs.length === 0) throw new Error("No questions in AI response");

    const seen = new Set();
    const candidates = [];

    for (const q of rawQs) {
      // Basic validity
      if (!q.question || q.question.trim().length < 8) continue;

      if (questionType === "true_false") {
        if (typeof q.correctAnswer !== "boolean") continue;
      } else if (questionType === "short_answer") {
        const accepted = Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [];
        if (accepted.length < 1) continue;
      } else {
        const qType = normalizeQuestionType(q.type || questionType);
        if (qType === "short_answer") {
          const accepted = Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [];
          if (accepted.length < 1) continue;
        } else {
          if (!Array.isArray(q.options) || q.options.length !== 4) continue;
          if (!["A","B","C","D"].includes(q.correctAnswer)) continue;
          const unique = new Set(q.options.map(o => o.trim().toLowerCase()));
          if (unique.size < 4) continue; // duplicate options
          if (q.options.some(o => !o || o.trim().length === 0)) continue;
        }
      }

      // Pedagogical quality gate
      const qType = normalizeQuestionType(q.type || questionType);
      if (!passesQualityGate(q, qType, expectedDifficulty)) continue;

      // Semantic deduplication
      if (isDuplicate(q.question, seen)) continue;
      seen.add(q.question.trim().toLowerCase());

      // Normalise to SlidePlay format
      if (qType === "true_false") {
        const normalized = {
          text: q.question.trim(),
          options: ["True", "False"],
          correct: q.correctAnswer ? 0 : 1,
          explanation: q.explanation || "",
          difficulty: q.difficulty || "medium",
          type: "true_false"
        };
        candidates.push(scoreQuestionCandidate(q, normalized, qType, expectedDifficulty, sourceText));
      } else if (qType === "short_answer") {
        const acceptedAnswers = (Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [])
          .map((a) => String(a || "").trim())
          .filter(Boolean);
        const normalized = {
          text: q.question.trim(),
          acceptedAnswers: acceptedAnswers,
          sampleAnswer: String(q.sampleAnswer || acceptedAnswers[0] || "").trim(),
          explanation: q.explanation || "",
          difficulty: q.difficulty || "medium",
          bloomLevel: q.bloomLevel || "",
          type: "short_answer"
        };
        candidates.push(scoreQuestionCandidate(q, normalized, "short_answer", expectedDifficulty, sourceText));
      } else {
        const idx = { A:0, B:1, C:2, D:3 }[q.correctAnswer];
        const normalized = {
          text: q.question.trim(),
          options: q.options.map(o => o.trim()),
          correct: idx,
          explanation: q.explanation || "",
          difficulty: q.difficulty || "medium",
          bloomLevel: q.bloomLevel || "",
          type: "mcq"
        };
        candidates.push(scoreQuestionCandidate(q, normalized, qType, expectedDifficulty, sourceText));
      }
    }

    const good = selectDiverseTopQuestions(candidates, count);
    return { questions: good, topic: (parsed?.topic || "").trim() };
  }

  // ── Fallback topic-only generation (no source text) ──────────

  async function generateFromTopic(topic, opts) {
    const { difficulty="medium", count=10, questionType="mcq" } = opts;
    const qType = normalizeQuestionType(questionType);
    const bloom = BLOOM[difficulty] || BLOOM.medium;
    const type = qType === "true_false" ? "TRUE/FALSE" : qType === "short_answer" ? "short-answer" : "mixed";

    const prompt = `You are an expert quiz designer.
Generate ${count} ${type} questions about: "${topic}"
Difficulty: ${difficulty.toUpperCase()} — Bloom's levels: ${bloom.levels.join(", ")} (${bloom.verbs})
${qType === "mcq" || qType === "mixed"
  ? `Each question: 4 options (A-D), correctAnswer as letter, plausible distractors, and no answer leakage.`
  : qType === "true_false"
  ? `Each question: a clear statement, correctAnswer as true/false boolean.`
  : `Each question: include acceptedAnswers array and sampleAnswer for typed response.`}
Include a 1-2 sentence explanation per question that uses the topic in context.
Vary stems across the set so the questions do not all start the same way.
Prefer reasoning, application, and comparison questions over generic recall when difficulty is medium or hard.
Return ONLY valid JSON:
{ "topic": "${topic}", "questions": [{ "question":"...", ${qType==="true_false"?'"correctAnswer":true,':qType==="short_answer"?'"acceptedAnswers":["...","..."], "sampleAnswer":"...",':'"options":["...","...","...","..."], "correctAnswer":"A",'} "difficulty":"${difficulty}", "explanation":"..." }] }`;

    const raw = await callGemini(prompt, {
      responseSchema: buildQuestionResponseSchema(qType, difficulty),
    });
    return parseAndFilter(raw, count, questionType);
  }

  // ── Main public API ──────────────────────────────────────────

  /**
   * processFile(file, opts, onProgress)
   *
   * @param {File}   file        — The uploaded file
   * @param {Object} opts        — { difficulty, count, questionType }
   * @param {Function} onProgress — (stage, pct) callback for UI
   * @returns {Promise<{ questions, count, topic, rawText, source }>}
   */
  async function processFile(file, opts = {}, onProgress = () => {}) {
    const { difficulty = "medium", count = 10, questionType = "mcq" } = opts;
    const normalizedQuestionType = normalizeQuestionType(questionType);
    const role = inferUserRole();
    const adaptive = resolveAdaptiveDifficulty(difficulty, role);
    const effectiveDifficulty = adaptive.effectiveDifficulty;

    // ── Stage 1: extract text ──────────────────────────────────
    onProgress("Extracting slide content…", 15);

    // Images go straight to Gemini Vision — no text extraction needed
    if (isImageFile(file)) {
      onProgress("Analysing image with AI vision…", 30);
      try {
        const result = await generateWithQualityRetry(
          "",
          { difficulty: effectiveDifficulty, count },
          normalizedQuestionType,
          "vision",
          async (strict, retryCount) => callGeminiVision(file, { difficulty: effectiveDifficulty, count: retryCount, questionType: normalizedQuestionType, strict }),
        );
        onProgress("Reviewing question quality…", 80);
        if (result.questions.length > 0) {
          onProgress("Done!", 100);
          return { questions: result.questions, count: result.questions.length, topic: result.topic, rawText: "", source: "vision" };
        }
      } catch (e) {
        console.warn("Vision extraction failed:", e.message);
      }

      onProgress("Vision unavailable, running OCR fallback…", 45);
      try {
        const ocrText = await extractImageTextOCR(file);
        if (ocrText.length > 80) {
          onProgress("Generating questions from OCR text…", 65);
          const result = await generateWithQualityRetry(
          ocrText,
          { difficulty: effectiveDifficulty, count },
          normalizedQuestionType,
          "text",
          async (strict, retryCount, previousCount) => {
            const prompt = strict
              ? buildRegenerationPrompt(ocrText, { difficulty: effectiveDifficulty, count: retryCount, questionType: normalizedQuestionType }, previousCount || 0)
              : buildPrompt(ocrText, { difficulty: effectiveDifficulty, count: retryCount, questionType: normalizedQuestionType });
            return callGemini(prompt, {
              responseSchema: buildQuestionResponseSchema(normalizedQuestionType, effectiveDifficulty),
            });
          },
        );
          onProgress("Reviewing question quality…", 85);
          if (result.questions.length > 0) {
            onProgress("Done!", 100);
            return {
              questions: result.questions,
              count: result.questions.length,
              topic: result.topic,
              rawText: ocrText,
              source: "vision_ocr"
            };
          }
        }
      } catch (e) {
        console.warn("OCR fallback failed:", e.message);
      }

        return _fallback(file.name, count, effectiveDifficulty, "");
    }

    let rawText = "";
    try {
      rawText = await extractText(file);
      rawText = rawText.replace(/\s+/g, " ").trim();
    } catch (e) {
      console.warn("Text extraction error:", e.message);
    }

    // If proxy is unreachable, fall through to hardcoded fallback immediately
    if (!AI_PROXY) {
      onProgress("AI service unreachable — using topic fallback…", 60);
      console.warn("[AIProcessor] Proxy URL not set. Check server is running.");
        return _fallback(file.name, count, effectiveDifficulty, rawText);
    }

    // ── Stage 2: call Gemini ───────────────────────────────────
    const MAX_ATTEMPTS = 3;
    let result = null;
    let lastErr = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const hasText = rawText.length > 80;

        if (attempt === 0 && hasText) {
          onProgress("Generating questions from your slides…", 40);
          const prompt = buildPrompt(rawText, { difficulty: effectiveDifficulty, count: Math.ceil(count * 1.5), questionType: normalizedQuestionType });
          const raw = await callGemini(prompt, {
            responseSchema: buildQuestionResponseSchema(normalizedQuestionType, effectiveDifficulty),
          });
          onProgress("Reviewing question quality…", 80);
          result = parseAndFilter(raw, count, normalizedQuestionType, { difficulty: effectiveDifficulty, sourceText: rawText });
        } else if (attempt === 1 && hasText) {
          onProgress("Strengthening weak questions…", 62);
          const prompt = buildRegenerationPrompt(rawText, { difficulty: effectiveDifficulty, count: Math.ceil(count * 1.7), questionType: normalizedQuestionType }, result?.questions?.length || 0);
          const raw = await callGemini(prompt, {
            responseSchema: buildQuestionResponseSchema(normalizedQuestionType, effectiveDifficulty),
          });
          onProgress("Applying strict quality checks…", 86);
          result = parseAndFilter(raw, count, normalizedQuestionType, { difficulty: effectiveDifficulty, sourceText: rawText });
        } else {
          // Fallback: use filename as topic
          const topic = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
          onProgress(`Generating from topic: "${topic}"…`, 50);
          result = await generateFromTopic(topic, { difficulty: effectiveDifficulty, count, questionType: normalizedQuestionType });
        }

        if (result.questions.length > 0) break;
      } catch (e) {
        lastErr = e;
        console.warn(`AI attempt ${attempt + 1} failed:`, e.message);
      }
    }

    if (!result || result.questions.length === 0) {
      console.warn("[AIProcessor] All AI attempts failed, using built-in fallback. Last error:", lastErr?.message);
        return _fallback(file.name, count, effectiveDifficulty, rawText);
    }

    onProgress("Done!", 100);

    // ── Stage 3: send raw text to server for RAG embedding (background) ──
    if (rawText.length > 100) {
      const uid   = localStorage.getItem('sp_user_uid') || 'anonymous';
      const title = file.name.replace(/\.[^.]+$/, '');
      fetch(API_BASE + '/api/decks/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ uid, title, rawText }),
      })
        .then(r => r.json())
        .then(({ deckId }) => {
          if (!deckId) return;
          localStorage.setItem('sp_current_deck_id', deckId);
          // Trigger async embedding — server responds 202 immediately
          return fetch(API_BASE + `/api/decks/${deckId}/embed`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ rawText }),
          });
        })
        .catch(() => { /* server offline — study mode will be unavailable */ });
    }

    return {
      questions: result.questions,
      count: result.questions.length,
      topic: result.topic,
      rawText,
      source: "ai"
    };
  }

  /** Built-in fallback when AI is unavailable */
  function _fallback(filename, count, difficulty, rawText = "") {
    const topic = filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    if (String(rawText || "").trim().length > 40) {
      const textFallback = buildTextFallbackQuestions(rawText, count, difficulty, "mcq");
      if (textFallback.questions.length > 0) return textFallback;
    }

    // Use firebase-session.js pool if available
    const fbQs = window.SessionDB?.generateQuestions?.(count);
    if (fbQs) {
      const arr = Object.values(fbQs);
      return { questions: arr, count: arr.length, topic, rawText: "", source: "fallback" };
    }
    return { questions: [], count: 0, topic, rawText: "", source: "fallback" };
  }

  window.AIProcessor = { processFile };
  console.log("[AIProcessor] Loaded. AI proxy:", AI_PROXY);
})();
