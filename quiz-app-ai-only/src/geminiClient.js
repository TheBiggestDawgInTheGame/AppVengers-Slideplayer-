import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL_PRIORITY = [
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash"
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isQuotaError = (error) => {
  const msg = String(error?.message || error || "").toLowerCase();
  return msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("too many requests");
};

export async function generateFromGemini(prompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const preferredModel = options.preferredModel || "gemini-2.5-pro";
  const maxRetries = Number.isInteger(options.maxRetries) ? options.maxRetries : 2;

  const modelsToTry = MODEL_PRIORITY.includes(preferredModel)
    ? MODEL_PRIORITY.slice(MODEL_PRIORITY.indexOf(preferredModel))
    : [preferredModel, ...MODEL_PRIORITY];

  let lastError = null;

  for (const modelName of modelsToTry) {
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({
          contents: [{ parts: [{ text: prompt }] }]
        });
        return result.response.text();
      } catch (error) {
        lastError = error;
        if (!isQuotaError(error)) {
          throw error;
        }

        const isLastAttempt = attempt === maxRetries - 1;
        if (!isLastAttempt) {
          await sleep(1000 * (attempt + 1));
        }
      }
    }
  }

  throw lastError || new Error("Failed to generate content from Gemini");
}
