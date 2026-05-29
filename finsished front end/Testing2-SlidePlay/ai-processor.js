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
 * opts: { difficulty:"easy"|"medium"|"hard", count:10, questionType:"mcq"|"true_false"|"mixed" }
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
    return /^(what is|who is|when is|when did|where is|define|name|identify)\b/i.test(String(s || "").trim());
  }

  function hasAnswerLeak(question, answerText) {
    const q = String(question || "").toLowerCase();
    const a = String(answerText || "").toLowerCase().trim();
    if (a.length < 6) return false;
    return q.includes(a);
  }

  function passesQualityGate(rawQ, questionType, expectedDifficulty) {
    const question = String(rawQ?.question || "").trim();
    const explanation = String(rawQ?.explanation || "").trim();

    if (question.length < 16 || wordCount(question) < 5) return false;
    if (explanation.length < 18) return false;

    // Medium/Hard should avoid short trivial recall stems.
    if ((expectedDifficulty === "medium" || expectedDifficulty === "hard") && looksTrivialStem(question) && question.length < 70) {
      return false;
    }

    if (questionType !== "true_false") {
      const options = Array.isArray(rawQ?.options) ? rawQ.options : [];
      if (options.length !== 4) return false;
      if (options.some(o => String(o || "").trim().length < 2)) return false;
      if (options.some(o => /all of the above|none of the above/i.test(String(o || "")))) return false;

      const correctIdx = { A:0, B:1, C:2, D:3 }[rawQ?.correctAnswer];
      if (typeof correctIdx !== "number") return false;
      if (hasAnswerLeak(question, options[correctIdx])) return false;
    }

    return true;
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
  async function callGeminiVision(file, opts) {
    const { difficulty = "medium", count = 10, questionType = "mcq", strict = false } = opts;
    const bloom = BLOOM[difficulty] || BLOOM.medium;

    // Read image as base64
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = e => res(e.target.result.split(",")[1]); // strip data:…;base64,
      r.onerror = () => rej(new Error("Image read failed"));
      r.readAsDataURL(file);
    });

    const mimeType = file.type || "image/png";

    const typeInstructions = questionType === "true_false"
      ? `- Generate TRUE/FALSE questions only. "correctAnswer" must be true or false (boolean).`
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

${questionType === "true_false" ? `{
  "topic": "Brief topic inferred from the image",
  "questions": [{ "question": "...", "correctAnswer": true, "difficulty": "${difficulty}", "explanation": "..." }]
}` : `{
  "topic": "Brief topic inferred from the image",
  "questions": [{ "question": "...", "options": ["A","B","C","D"], "correctAnswer": "A", "difficulty": "${difficulty}", "explanation": "...", "bloomLevel": "${bloom.levels[0]}" }]
}`}`.trim();

    const resp = await fetch(`${AI_PROXY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        image: { data: base64, mimeType }
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
    const bloom = BLOOM[difficulty] || BLOOM.medium;

    // Trim text to ~30 000 chars — Gemini 2.0 Flash supports ~1M tokens
    const excerpt = text.length > 30000 ? text.substring(0, 30000) + "\n[...content truncated...]" : text;

    const typeInstructions = questionType === "true_false"
      ? `- Generate TRUE/FALSE questions only.
- Each question must be an unambiguous factual statement that is clearly true or false.
- Aim for roughly half true, half false.
- "correctAnswer" must be true or false (boolean).`
      : `- Generate MULTIPLE CHOICE questions with exactly 4 options (A, B, C, D).
- All 4 options must be plausible — avoid obviously wrong distractors.
- "correctAnswer" must be "A", "B", "C", or "D".
${questionType === "mixed" ? "- Vary question styles: definition, application, scenario, comparison." : ""}`;

    return `You are an expert educator and quiz designer.
Your job is to create pedagogically sound quiz questions based ONLY on the lesson content below.

═══════════════════ LESSON CONTENT ═══════════════════
${excerpt}
══════════════════════════════════════════════════════

DIFFICULTY: ${difficulty.toUpperCase()}
Bloom's Taxonomy targets: ${bloom.levels.join(", ")}
Question verbs to use: ${bloom.verbs}

REQUIREMENTS:
- Generate exactly ${count} questions.
- Every question must be directly answerable from the lesson content above. Do NOT use general knowledge.
- ${difficulty === "hard" ? "Include nuanced reasoning, common misconceptions as distractors, and multi-step thinking." : ""}
- ${difficulty === "easy" ? "Use clear, direct language. Test recall and basic understanding." : ""}
- ${difficulty === "medium" ? "Test application and analysis of the content, not just recall." : ""}
${typeInstructions}
- Include a concise "explanation" (1–2 sentences) for each correct answer — this is used for coaching.
- Do NOT include questions about formatting, page numbers, or metadata.
- Avoid trivial stems (e.g., "What is...") unless pedagogically justified.
- Avoid answer leakage (the correct option phrase appearing inside the question text).
- If a draft question is weak, regenerate it before final output.

RESPONSE FORMAT: Return ONLY a single valid JSON object. No markdown, no extra text.

${questionType === "true_false" ? `{
  "topic": "Brief topic title inferred from content",
  "questions": [
    {
      "question": "A clear, factual statement that is true or false",
      "correctAnswer": true,
      "difficulty": "${difficulty}",
      "explanation": "Why this is true/false based on the lesson"
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
      "bloomLevel": "${bloom.levels[0]}"
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
- Focus on scenario-based, application, comparison, and reasoning prompts.
- Keep explanations concise and evidence-based from the lesson content.
`.trim();
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
    const terms = collectFallbackTerms(rawText, Math.max(8, count * 4));
    const topic = terms[0] || "lesson content";
    if (terms.length === 0) return { questions: [], count: 0, topic, rawText: "", source: "fallback" };

    const questions = [];
    for (let i = 0; i < terms.length && questions.length < count; i++) {
      const term = terms[i];

      if (questionType === "true_false") {
        questions.push({
          text: `The slide content mentions ${term}.`,
          options: ["True", "False"],
          correct: 0,
          explanation: `The extracted slide text includes the term "${term}".`,
          difficulty,
          type: "true_false"
        });
      } else {
        const distractors = terms.filter(t => t !== term).slice(0, 3);
        while (distractors.length < 3) distractors.push(`option${distractors.length + 1}`);
        const options = [term, ...distractors].sort(() => Math.random() - 0.5);
        questions.push({
          text: "Which of the following terms appears in the slide content?",
          options,
          correct: options.indexOf(term),
          explanation: `The slide text includes "${term}" among its key terms.`,
          difficulty,
          bloomLevel: difficulty === "hard" ? "analyze" : difficulty === "medium" ? "understand" : "remember",
          type: "mcq"
        });
      }
    }

    return { questions, count: questions.length, topic, rawText, source: "text_fallback" };
  }

  // ── Gemini REST call ─────────────────────────────────────────

  async function callGemini(prompt) {
    const resp = await fetch(AI_PROXY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
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
    const good = [];

    for (const q of rawQs) {
      // Basic validity
      if (!q.question || q.question.trim().length < 8) continue;

      if (questionType === "true_false") {
        if (typeof q.correctAnswer !== "boolean") continue;
      } else {
        if (!Array.isArray(q.options) || q.options.length !== 4) continue;
        if (!["A","B","C","D"].includes(q.correctAnswer)) continue;
        const unique = new Set(q.options.map(o => o.trim().toLowerCase()));
        if (unique.size < 4) continue; // duplicate options
        if (q.options.some(o => !o || o.trim().length === 0)) continue;
      }

      // Pedagogical quality gate
      if (!passesQualityGate(q, questionType, expectedDifficulty)) continue;

      // Semantic deduplication
      if (isDuplicate(q.question, seen)) continue;
      seen.add(q.question.trim().toLowerCase());

      // Normalise to SlidePlay format
      if (questionType === "true_false") {
        good.push({
          text: q.question.trim(),
          options: ["True", "False"],
          correct: q.correctAnswer ? 0 : 1,
          explanation: q.explanation || "",
          difficulty: q.difficulty || "medium",
          type: "true_false"
        });
      } else {
        const idx = { A:0, B:1, C:2, D:3 }[q.correctAnswer];
        good.push({
          text: q.question.trim(),
          options: q.options.map(o => o.trim()),
          correct: idx,
          explanation: q.explanation || "",
          difficulty: q.difficulty || "medium",
          bloomLevel: q.bloomLevel || "",
          type: "mcq"
        });
      }

      if (good.length >= count) break;
    }

    return { questions: good, topic: (parsed?.topic || "").trim() };
  }

  // ── Fallback topic-only generation (no source text) ──────────

  async function generateFromTopic(topic, opts) {
    const { difficulty="medium", count=10, questionType="mcq" } = opts;
    const bloom = BLOOM[difficulty] || BLOOM.medium;
    const type = questionType === "true_false" ? "TRUE/FALSE" : "multiple choice";

    const prompt = `You are an expert quiz designer.
Generate ${count} ${type} questions about: "${topic}"
Difficulty: ${difficulty.toUpperCase()} — Bloom's levels: ${bloom.levels.join(", ")} (${bloom.verbs})
${questionType !== "true_false"
  ? `Each question: 4 options (A-D), correctAnswer as letter, plausible distractors.`
  : `Each question: a clear statement, correctAnswer as true/false boolean.`}
Include a 1-sentence explanation per question.
Return ONLY valid JSON:
{ "topic": "${topic}", "questions": [{ "question":"...", ${questionType!=="true_false"?'"options":["...","...","...","..."], "correctAnswer":"A",':'"correctAnswer":true,'} "difficulty":"${difficulty}", "explanation":"..." }] }`;

    const raw = await callGemini(prompt);
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

    // ── Stage 1: extract text ──────────────────────────────────
    onProgress("Extracting slide content…", 15);

    // Images go straight to Gemini Vision — no text extraction needed
    if (isImageFile(file)) {
      onProgress("Analysing image with AI vision…", 30);
      try {
        const raw = await callGeminiVision(file, { difficulty, count, questionType });
        onProgress("Reviewing question quality…", 80);
        let result = parseAndFilter(raw, count, questionType, { difficulty });
        if (result.questions.length < Math.ceil(count * 0.75)) {
          const retryRaw = await callGeminiVision(file, { difficulty, count: Math.ceil(count * 1.5), questionType, strict: true });
          result = parseAndFilter(retryRaw, count, questionType, { difficulty });
        }
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
          const prompt = buildPrompt(ocrText, { difficulty, count: Math.ceil(count * 1.5), questionType });
          const raw = await callGemini(prompt);
          onProgress("Reviewing question quality…", 85);
          let result = parseAndFilter(raw, count, questionType, { difficulty });
          if (result.questions.length < Math.ceil(count * 0.75)) {
            const retryPrompt = buildRegenerationPrompt(ocrText, { difficulty, count: Math.ceil(count * 1.5), questionType }, result.questions.length);
            const retryRaw = await callGemini(retryPrompt);
            result = parseAndFilter(retryRaw, count, questionType, { difficulty });
          }
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

        return _fallback(file.name, count, difficulty, ocrText || "");
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
        return _fallback(file.name, count, difficulty, rawText);
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
          const prompt = buildPrompt(rawText, { difficulty, count: Math.ceil(count * 1.5), questionType });
          const raw = await callGemini(prompt);
          onProgress("Reviewing question quality…", 80);
          result = parseAndFilter(raw, count, questionType, { difficulty });
        } else if (attempt === 1 && hasText) {
          onProgress("Strengthening weak questions…", 62);
          const prompt = buildRegenerationPrompt(rawText, { difficulty, count: Math.ceil(count * 1.7), questionType }, result?.questions?.length || 0);
          const raw = await callGemini(prompt);
          onProgress("Applying strict quality checks…", 86);
          result = parseAndFilter(raw, count, questionType, { difficulty });
        } else {
          // Fallback: use filename as topic
          const topic = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
          onProgress(`Generating from topic: "${topic}"…`, 50);
          result = await generateFromTopic(topic, { difficulty, count, questionType });
        }

        if (result.questions.length > 0) break;
      } catch (e) {
        lastErr = e;
        console.warn(`AI attempt ${attempt + 1} failed:`, e.message);
      }
    }

    if (!result || result.questions.length === 0) {
      console.warn("[AIProcessor] All AI attempts failed, using built-in fallback. Last error:", lastErr?.message);
        return _fallback(file.name, count, difficulty, rawText);
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
