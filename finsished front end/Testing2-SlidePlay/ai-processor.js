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

  // ── ⚙️  CONFIG — paste your Gemini API key here ──────────────
  const GEMINI_KEY = "AIzaSyADrAnpihJDNSD0-9A_fT953765qqLesFQ";
  // ─────────────────────────────────────────────────────────────

  const GEMINI_ENDPOINT =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

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

  // ── Prompt builder ───────────────────────────────────────────

  function buildPrompt(text, opts) {
    const { difficulty = "medium", count = 10, questionType = "mcq" } = opts;
    const bloom = BLOOM[difficulty] || BLOOM.medium;

    // Trim text to ~6000 chars to stay within token limits
    const excerpt = text.length > 6000 ? text.substring(0, 6000) + "\n[...content truncated...]" : text;

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

  // ── Gemini REST call ─────────────────────────────────────────

  async function callGemini(prompt) {
    if (!GEMINI_KEY) throw new Error("NO_KEY");

    const resp = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.65, maxOutputTokens: 4096 }
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Gemini API error ${resp.status}`);
    }

    const data = await resp.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  // ── Response parser & quality filter ────────────────────────

  function parseAndFilter(rawText, count, questionType) {
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
    let rawText = "";
    try {
      rawText = await extractText(file);
      rawText = rawText.replace(/\s+/g, " ").trim();
    } catch (e) {
      console.warn("Text extraction error:", e.message);
    }

    // If no API key, fall through to hardcoded fallback immediately
    if (!GEMINI_KEY) {
      onProgress("AI key not configured — using topic fallback…", 60);
      console.warn("[AIProcessor] GEMINI_KEY is empty. Set it in ai-processor.js to enable real AI generation.");
      return _fallback(file.name, count, difficulty);
    }

    // ── Stage 2: call Gemini ───────────────────────────────────
    const MAX_ATTEMPTS = 2;
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
          result = parseAndFilter(raw, count, questionType);
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
      return _fallback(file.name, count, difficulty);
    }

    onProgress("Done!", 100);
    return {
      questions: result.questions,
      count: result.questions.length,
      topic: result.topic,
      rawText,
      source: "ai"
    };
  }

  /** Built-in fallback when AI is unavailable */
  function _fallback(filename, count, difficulty) {
    const topic = filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    // Use firebase-session.js pool if available
    const fbQs = window.SessionDB?.generateQuestions?.(count);
    if (fbQs) {
      const arr = Object.values(fbQs);
      return { questions: arr, count: arr.length, topic, rawText: "", source: "fallback" };
    }
    return { questions: [], count: 0, topic, rawText: "", source: "fallback" };
  }

  window.AIProcessor = { processFile };
  console.log("[AIProcessor] Loaded. GEMINI_KEY:", GEMINI_KEY ? "✓ set" : "✗ empty — add yours to ai-processor.js");
})();
