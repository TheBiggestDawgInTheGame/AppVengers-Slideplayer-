import "dotenv/config";
import express from "express";
import cors from "cors";
import { generateCodeFromSlides, generateQuiz, generateQuizFromSlides, generateSummaryFromSlides } from "./quizGenerator.js";
import { generateFromGemini } from "./geminiClient.js";

const app = express();
const port = Number(process.env.PORT || 4100);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function parseAiJson(rawText) {
  const raw = String(rawText || "").trim();
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (_e) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("AI did not return valid JSON");
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "quiz-app-ai-only" });
});

app.post("/api/npc-message", async (req, res) => {
  try {
    const event = String(req.body?.event || "success").trim();   // success | setback | start | hint
    const game  = String(req.body?.game  || "quiz game").trim();
    const context = String(req.body?.context || "").trim();      // e.g. question text, word, topic
    const stats = req.body?.stats || {};                         // { successes, points, topic, remaining }

    const prompt = `You are two NPCs inside an educational game called "${game}".

NPC 1 — Professor Byte: a witty, encouraging tutor. Reacts to what just happened academically.
NPC 2 — Quest Master Nova: a quest tracker. Focuses on progress numbers and unlocks.

Event: "${event}"
${context ? `Detail: "${context}"` : ""}
Student stats: ${stats.successes ?? 0} total successes, ${stats.points ?? 0} points, current topic "${stats.topic ?? "Orientation Deck"}"${stats.remaining != null ? `, ${stats.remaining} actions until next unlock` : ""}.

Reply ONLY with valid JSON (no markdown, no extra text):
{
  "professor": "Professor Byte's message — 1 punchy sentence, max 90 chars",
  "quest": "Quest Master Nova's message — 1 sentence about progress/unlock, max 90 chars"
}`;

    const raw = await generateFromGemini(prompt, { preferredModel: "gemini-2.5-flash-lite", maxRetries: 1 });
    const parsed = parseAiJson(raw);

    return res.json({
      professor: String(parsed.professor || "").slice(0, 150),
      quest: String(parsed.quest || "").slice(0, 150)
    });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || error) });
  }
});

app.post("/api/generate-escape-clues", async (req, res) => {
  try {
    const content = String(req.body?.content || "").trim();
    const roomTheme = String(req.body?.roomTheme || "classroom").trim();

    if (!content || content.length < 60) {
      return res.status(400).json({ error: "content is required (minimum 60 chars)" });
    }

    const prompt = `You are designing clues for an educational escape room game.

Theme: ${roomTheme}
Source material:
"""
${content.slice(0, 12000)}
"""

Create clues that help a player solve room puzzles while reinforcing the source material.
Requirements:
- Keep clues short and concrete.
- Avoid giving final door codes directly.
- Keep language suitable for teens.
- Blend study content with escape-room flavor.

Return ONLY valid JSON:
{
  "summary": "1 sentence mission brief",
  "clues": [
    "5 to 8 clue lines based on source material"
  ],
  "npcHints": [
    "4 to 8 short NPC hint lines"
  ]
}`;

    const raw = await generateFromGemini(prompt, { preferredModel: "gemini-2.5-flash-lite", maxRetries: 1 });
    const parsed = parseAiJson(raw);

    const clues = Array.isArray(parsed.clues)
      ? parsed.clues.map((line) => String(line || "").trim()).filter(Boolean).slice(0, 10)
      : [];
    const npcHints = Array.isArray(parsed.npcHints)
      ? parsed.npcHints.map((line) => String(line || "").trim()).filter(Boolean).slice(0, 10)
      : [];

    return res.json({
      summary: String(parsed.summary || "Use what you learned in the slides to escape.").slice(0, 220),
      clues,
      npcHints,
      sourceLength: content.length
    });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || error) });
  }
});

app.post("/api/generate-quiz", async (req, res) => {
  try {
    const topic = String(req.body?.topic || "").trim();
    const numQuestions = req.body?.numQuestions;
    const difficulty = req.body?.difficulty;

    if (!topic) {
      return res.status(400).json({ error: "topic is required" });
    }

    const data = await generateQuiz({ topic, numQuestions, difficulty });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || error) });
  }
});

app.post("/api/generate-from-slides", async (req, res) => {
  try {
    const task = String(req.body?.task || "quiz").trim().toLowerCase();
    const content = String(req.body?.content || "").trim();
    const numQuestions = req.body?.numQuestions;
    const difficulty = req.body?.difficulty;
    const language = req.body?.language;

    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }

    if (task === "summary") {
      const data = await generateSummaryFromSlides({ content });
      return res.json({ task, ...data });
    }

    if (task === "code") {
      const data = await generateCodeFromSlides({ content, language });
      return res.json({ task, ...data });
    }

    const data = await generateQuizFromSlides({ content, numQuestions, difficulty });
    return res.json({ task: "quiz", ...data });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || error) });
  }
});

app.listen(port, () => {
  console.log(`quiz-app-ai-only running on http://localhost:${port}`);
});
