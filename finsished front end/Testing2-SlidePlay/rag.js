// rag.js — Retrieval-Augmented Generation pipeline for SlidePlay
// Flow: rawText → chunk → embed (Gemini) → store in SlideChunks
//       query → embed → cosine similarity → top-K chunks → Gemini answer

const axios  = require('axios');
const { query, sql } = require('./db');

const GEMINI_KEY      = process.env.GEMINI_API_KEY;
const EMBED_ENDPOINT  = 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent';
const CHAT_ENDPOINT   = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;

// ── 1. Text chunker ────────────────────────────────────────────────────────────
// Splits text into overlapping ~400-word windows so context isn't lost at edges
function chunkText(text, maxWords = 400, overlapWords = 60) {
  const words   = text.split(/\s+/).filter(Boolean);
  const chunks  = [];
  let start     = 0;

  while (start < words.length) {
    const end   = Math.min(start + maxWords, words.length);
    const chunk = words.slice(start, end).join(' ');
    if (chunk.trim()) chunks.push(chunk.trim());
    if (end >= words.length) break;
    start += maxWords - overlapWords;   // slide forward with overlap
  }
  return chunks;
}

// ── 2. Embed a single text string via Gemini text-embedding-004 ───────────────
async function embedText(text) {
  const resp = await axios.post(
    `${EMBED_ENDPOINT}?key=${GEMINI_KEY}`,
    {
      model:   'models/text-embedding-004',
      content: { parts: [{ text }] },
    },
    { headers: { 'Content-Type': 'application/json' } }
  );
  return resp.data.embedding.values;   // float[]  length=768
}

// ── 3. Cosine similarity ───────────────────────────────────────────────────────
function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

// ── 4. Embed a full deck and store chunks in DB ────────────────────────────────
// Deletes old chunks first so re-uploads are clean
async function embedDeck(deckId, rawText) {
  // Clear existing chunks for this deck
  await query('DELETE FROM SlideChunks WHERE DeckID = @deckId', { deckId });

  const chunks = chunkText(rawText);
  console.log(`Embedding ${chunks.length} chunks for deck ${deckId}…`);

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await embedText(chunks[i]);
    await query(
      `INSERT INTO SlideChunks (DeckID, ChunkIndex, ChunkText, Embedding)
       VALUES (@deckId, @idx, @text, @emb)`,
      {
        deckId,
        idx:  i,
        text: chunks[i],
        emb:  JSON.stringify(embedding),
      }
    );
    // Small delay to stay within Gemini free-tier rate limit (1500 req/min)
    if (i % 10 === 9) await new Promise(r => setTimeout(r, 500));
  }
  console.log(`✅ Embedded ${chunks.length} chunks for deck ${deckId}`);
  return chunks.length;
}

// ── 5. Semantic search over a deck's chunks ───────────────────────────────────
async function searchDeck(deckId, userQuery, topK = 5) {
  // Embed the query
  const queryVec = await embedText(userQuery);

  // Fetch all chunks for this deck
  const result = await query(
    'SELECT ChunkIndex, ChunkText, Embedding FROM SlideChunks WHERE DeckID = @deckId ORDER BY ChunkIndex',
    { deckId }
  );

  if (!result.recordset.length) return [];

  // Score each chunk
  const scored = result.recordset.map(row => ({
    index:     row.ChunkIndex,
    text:      row.ChunkText,
    score:     cosineSim(queryVec, JSON.parse(row.Embedding)),
  }));

  // Return top-K by score
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ── 6. Grounded study-mode answer ─────────────────────────────────────────────
async function studyAsk(deckId, question, history = []) {
  const topChunks = await searchDeck(deckId, question, 5);

  if (!topChunks.length) {
    return { answer: "I couldn't find relevant content in your slides for that question.", sources: [] };
  }

  const context = topChunks.map((c, i) => `[Slide excerpt ${i + 1}]\n${c.text}`).join('\n\n');

  // Build chat history for multi-turn support
  const contents = [
    ...history,
    {
      role: 'user',
      parts: [{
        text: `You are a helpful study tutor. Answer the student's question using ONLY the slide excerpts below.
If the answer is not in the excerpts, say "This topic isn't covered in the uploaded slides."
Always be concise (2-4 sentences). Never make up information.

SLIDE EXCERPTS:
${context}

STUDENT QUESTION: ${question}`
      }]
    }
  ];

  const resp = await axios.post(
    `${CHAT_ENDPOINT}?key=${GEMINI_KEY}`,
    {
      contents,
      generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const answer = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';

  return {
    answer,
    sources: topChunks.map(c => ({ index: c.index, score: Math.round(c.score * 100) / 100 })),
  };
}

module.exports = { chunkText, embedText, embedDeck, searchDeck, studyAsk };
