document.addEventListener("DOMContentLoaded", () => {
  const stepButtons = [...document.querySelectorAll(".studio-step")];
  const stepPanels = [...document.querySelectorAll(".studio-panel")];

  const dropArea = document.getElementById("dropArea");
  const browseBtn = document.getElementById("browseBtn");
  const fileInput = document.getElementById("fileInput");
  const fileList = document.getElementById("fileList");
  const extractBtn = document.getElementById("extractBtn");
  const generateBtn = document.getElementById("generateBtn");
  const launchQuizBtn = document.getElementById("launchQuizBtn");
  const quizSummary = document.getElementById("quizSummary");
  const summaryBlock = document.getElementById("summaryBlock");
  const keyPointsList = document.getElementById("keyPointsList");
  const analysisPlaceholder = document.getElementById("analysisPlaceholder");

  const chatMessages = document.getElementById("chatMessages");
  const userInput = document.getElementById("userInput");
  const sendBtn = document.getElementById("sendBtn");

  const quizModal = document.getElementById("quizModal");
  const quizQuestion = document.getElementById("quizQuestion");
  const quizOptions = document.getElementById("quizOptions");
  const quizFeedback = document.getElementById("quizFeedback");
  const quizProgress = document.getElementById("quizProgress");
  const nextQuizBtn = document.getElementById("nextQuizBtn");
  const closeQuizBtn = document.getElementById("closeQuizBtn");

  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");

  const OLLAMA_ENDPOINT_CANDIDATES = [
    "http://localhost:11434/api/generate",
    "http://127.0.0.1:11434/api/generate"
  ];
  const PREFERRED_MODELS = ["gemma2", "mistral", "llama3", "phi3"];
  const OLLAMA_TIMEOUT_MS = 30000;
  const OLLAMA_STATUS_TIMEOUT_MS = 6000;
  const OLLAMA_STATUS_POLL_MS = 15000;
  const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "html", "htm"]);
  const DOCX_EXTENSIONS = new Set(["docx"]);
  const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "bmp", "gif", "tif", "tiff"]);
  const OCR_TIMEOUT_MS = 90000;
  const OCR_LANGUAGE_PRIMARY = "eng+fra";
  const OCR_LANGUAGE_FALLBACK = "eng";

  function getPdfLib() {
    return window.pdfjsLib || window["pdfjs-dist/build/pdf"] || null;
  }

  const pdfLib = getPdfLib();
  if (pdfLib?.GlobalWorkerOptions) {
    pdfLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.worker.min.js";
  }

  const state = {
    files: [],
    fileContents: {},
    learningMap: null,
    questions: [],
    currentQuestionIndex: 0,
    score: 0,
    ollamaOnline: false,
    ollamaEndpoint: OLLAMA_ENDPOINT_CANDIDATES[0],
    modelReady: false,
    modelName: ""
  };

  let lastOllamaSignature = "";

  const progress = {
    uploaded: false,
    extracted: false,
    quizGenerated: false,
    followUpAsked: false
  };

  setActiveStep("step-upload");
  refreshStepCompletion();
  setOllamaActionState(false);

  checkOllamaStatus();

  stepButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.stepTarget;
      if (!target) return;
      if (!canOpenStep(target)) return;
      setActiveStep(target);
    });
  });

  browseBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (event) => handleFiles(event.target.files));

  dropArea.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropArea.classList.add("dragover");
  });

  dropArea.addEventListener("dragleave", () => {
    dropArea.classList.remove("dragover");
  });

  dropArea.addEventListener("drop", (event) => {
    event.preventDefault();
    dropArea.classList.remove("dragover");
    handleFiles(event.dataTransfer.files);
  });

  window.addEventListener("paste", (event) => {
    void handlePaste(event);
  });

  extractBtn.addEventListener("click", extractKeyIdeas);
  generateBtn.addEventListener("click", generateQuestions);
  launchQuizBtn.addEventListener("click", startQuiz);

  sendBtn.addEventListener("click", sendMessage);
  userInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  nextQuizBtn.addEventListener("click", moveToNextQuestion);
  closeQuizBtn.addEventListener("click", () => {
    quizModal.style.display = "none";
  });

  window.addEventListener("focus", () => {
    void checkOllamaStatus();
  });

  setInterval(() => {
    void checkOllamaStatus();
  }, OLLAMA_STATUS_POLL_MS);

  function getBestAvailableModel(models) {
    const names = models
      .map((model) => String(model?.name || "").trim().toLowerCase())
      .filter(Boolean);

    if (!names.length) return "";

    for (const preferred of PREFERRED_MODELS) {
      const exact = names.find((name) => name === preferred || name.startsWith(`${preferred}:`));
      if (exact) return exact;
    }

    return names[0];
  }

  function setActiveStep(stepId) {
    stepButtons.forEach((button) => {
      const isActive = button.dataset.stepTarget === stepId;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    stepPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.id === stepId);
    });
  }

  function setStepCompleted(stepId, completed) {
    const stepButton = stepButtons.find((button) => button.dataset.stepTarget === stepId);
    if (!stepButton) return;
    stepButton.classList.toggle("completed", completed);
  }

  function refreshStepCompletion() {
    setStepCompleted("step-upload", progress.uploaded);
    setStepCompleted("step-extract", progress.extracted);
    setStepCompleted("step-quiz", progress.quizGenerated);
    setStepCompleted("step-chat", progress.followUpAsked);
  }

  function canOpenStep(stepId) {
    if (stepId === "step-extract" && state.files.length === 0) {
      analysisPlaceholder.classList.remove("hidden");
      analysisPlaceholder.textContent = "Upload at least one readable file first, then click Extract Key Ideas.";
      addMessage("bot", "Upload at least one file before extraction.");
      return false;
    }

    if (stepId === "step-quiz" && !state.learningMap) {
      addMessage("bot", "Extract key ideas first, then generate your quiz.");
      return false;
    }

    if (stepId === "step-chat" && !state.learningMap) {
      addMessage("bot", "You can chat now, but answers improve after extraction and quiz generation.");
    }

    return true;
  }

  async function checkOllamaStatus() {
    for (const endpoint of OLLAMA_ENDPOINT_CANDIDATES) {
      try {
        const tagsEndpoint = endpoint.replace("/generate", "/tags");
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OLLAMA_STATUS_TIMEOUT_MS);
        const response = await fetch(tagsEndpoint, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) continue;

        const payload = await response.json();
        const models = Array.isArray(payload?.models) ? payload.models : [];
        const selectedModel = getBestAvailableModel(models);
        const modelReady = Boolean(selectedModel);

        state.ollamaOnline = true;
        state.ollamaEndpoint = endpoint;
        state.modelReady = modelReady;
        state.modelName = selectedModel;
        statusDot.className = "status-dot online";
        if (modelReady) {
          statusText.textContent = `Ollama Online (${selectedModel})`;
        } else {
          statusText.textContent = "Ollama Online - No model installed";
        }
        setOllamaActionState(modelReady);

        const signature = `online:${endpoint}:${selectedModel}`;
        if (signature !== lastOllamaSignature) {
          addMessage("bot", modelReady
            ? `Connected to Ollama at ${endpoint} using model ${selectedModel}.`
            : `Connected to Ollama at ${endpoint}, but no model is installed yet.`);
          lastOllamaSignature = signature;
        }
        return;
      } catch (_error) {
        // Try next endpoint candidate.
      }
    }

    state.ollamaOnline = false;
    state.modelReady = false;
    state.modelName = "";
    statusDot.className = "status-dot offline";
    statusText.textContent = "Ollama Offline - run 'ollama serve'";
    setOllamaActionState(false);

    if (lastOllamaSignature !== "offline") {
      addMessage("bot", "Ollama appears offline. I will keep retrying automatically every few seconds.");
      lastOllamaSignature = "offline";
    }
  }

  function setOllamaActionState(online) {
    extractBtn.disabled = !online;
    generateBtn.disabled = !online;
    sendBtn.disabled = !online;
    userInput.disabled = !online;
    if (!online) {
      launchQuizBtn.disabled = true;
    }
  }

  async function ensureOllamaOnline() {
    if (state.ollamaOnline && state.modelReady) return true;
    await checkOllamaStatus();
    if (state.ollamaOnline && state.modelReady) return true;

    if (state.ollamaOnline && !state.modelReady) {
      addMessage("bot", "No Ollama model is installed. Run one of: ollama pull gemma2 OR ollama pull mistral");
      return false;
    }

    addMessage("bot", "Ollama is required for this app. Start it with: ollama serve");
    return false;
  }

  function getExtension(fileName) {
    const parts = String(fileName).toLowerCase().split(".");
    return parts.length > 1 ? parts.pop() : "";
  }

  async function handleFiles(fileListLike) {
    const files = [...fileListLike];
    if (!files.length) return;

    for (const file of files) {
      const duplicate = state.files.some((item) => item.name === file.name && item.size === file.size);
      if (duplicate) continue;

      state.files.push(file);
      renderFileItem(file);
      await processFileContent(file);
    }

    if (state.files.length > 0) {
      progress.uploaded = true;
      refreshStepCompletion();
    }
  }

  async function handlePaste(event) {
    const clipboard = event.clipboardData;
    if (!clipboard) return;

    const pastedFiles = [];
    for (const item of [...clipboard.items]) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) pastedFiles.push(file);
      }
    }

    if (pastedFiles.length) {
      event.preventDefault();
      await handleFiles(pastedFiles);
      addMessage("bot", `Pasted ${pastedFiles.length} file(s) from clipboard.`);
      return;
    }

    const pastedText = clipboard.getData("text/plain");
    if (pastedText && pastedText.trim()) {
      event.preventDefault();
      const textFile = new File([pastedText], `pasted-notes-${Date.now()}.txt`, { type: "text/plain" });
      await handleFiles([textFile]);
      addMessage("bot", "Pasted text was added as a note file for extraction.");
    }
  }

  function renderFileItem(file) {
    const fileItem = document.createElement("div");
    fileItem.className = "file-item";

    fileItem.innerHTML = `
      <div class="file-icon">${getFileIcon(file.name)}</div>
      <div class="file-info">
        <div class="file-name">${escapeHtml(file.name)}</div>
        <div class="file-size">${formatFileSize(file.size)}</div>
      </div>
      <button class="remove-file" aria-label="Remove file">x</button>
    `;

    fileItem.querySelector(".remove-file").addEventListener("click", () => {
      state.files = state.files.filter((item) => !(item.name === file.name && item.size === file.size));
      delete state.fileContents[file.name];
      fileItem.remove();
      addMessage("bot", `Removed ${file.name}.`);

      if (!state.files.length) {
        progress.uploaded = false;
        refreshStepCompletion();
      }
    });

    fileList.appendChild(fileItem);
  }

  function getFileIcon(fileName) {
    const extension = getExtension(fileName);
    if (extension === "txt" || extension === "md") return "📝";
    if (extension === "csv" || extension === "json") return "📊";
    if (extension === "html" || extension === "htm") return "🌐";
    if (extension === "pdf") return "📄";
    if (extension === "doc" || extension === "docx") return "📘";
    if (IMAGE_EXTENSIONS.has(extension)) return "🖼️";
    if (extension === "ppt" || extension === "pptx") return "📽️";
    return "📁";
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  async function processFileContent(file) {
    const extension = getExtension(file.name);

    if (IMAGE_EXTENSIONS.has(extension) || String(file.type || "").startsWith("image/")) {
      try {
        addMessage("bot", `Running OCR on ${file.name}...`);
        const rawText = await extractImageText(file);
        const cleaned = cleanText(rawText);

        if (!cleaned) {
          state.fileContents[file.name] = {
            extractable: false,
            text: "",
            reason: "No readable text was detected in this image."
          };
          addMessage("bot", `${file.name} has no detectable text. Try a clearer image or higher contrast scan.`);
          return;
        }

        state.fileContents[file.name] = {
          extractable: true,
          text: cleaned,
          reason: ""
        };
        addMessage("bot", `Analyzed ${file.name}. OCR extracted ${cleaned.split(/\s+/).filter(Boolean).length} words.`);
        return;
      } catch (_error) {
        state.fileContents[file.name] = {
          extractable: false,
          text: "",
          reason: "Could not run OCR for this image in browser."
        };
        addMessage("bot", `I could not OCR ${file.name}. Try JPG or PNG, or use a clearer screenshot.`);
        return;
      }
    }

    if (extension === "pdf") {
      try {
        const rawText = await extractPdfText(file);
        const cleaned = cleanText(rawText);

        if (!cleaned) {
          state.fileContents[file.name] = {
            extractable: false,
            text: "",
            reason: "No selectable text was found in this PDF (it may be scanned images)."
          };
          addMessage("bot", `${file.name} appears to contain no selectable text. If this is a scanned PDF, run OCR first.`);
          return;
        }

        state.fileContents[file.name] = {
          extractable: true,
          text: cleaned,
          reason: ""
        };

        addMessage("bot", `Analyzed ${file.name}. I extracted ${cleaned.split(/\s+/).filter(Boolean).length} words from the PDF.`);
        return;
      } catch (_error) {
        state.fileContents[file.name] = {
          extractable: false,
          text: "",
          reason: "Could not parse PDF text in browser."
        };
        addMessage("bot", `I could not read text from ${file.name}. ${_error?.message || "Try another PDF or convert it to TXT/MD."}`);
        return;
      }
    }

    if (!TEXT_EXTENSIONS.has(extension)) {
      if (DOCX_EXTENSIONS.has(extension)) {
        try {
          const rawText = await extractDocxText(file);
          const cleaned = cleanText(rawText);

          if (!cleaned) {
            state.fileContents[file.name] = {
              extractable: false,
              text: "",
              reason: "No readable text was found in this DOCX file."
            };
            addMessage("bot", `${file.name} did not contain readable text for extraction.`);
            return;
          }

          state.fileContents[file.name] = {
            extractable: true,
            text: cleaned,
            reason: ""
          };
          addMessage("bot", `Analyzed ${file.name}. I extracted ${cleaned.split(/\s+/).filter(Boolean).length} words from the DOCX file.`);
          return;
        } catch (_error) {
          state.fileContents[file.name] = {
            extractable: false,
            text: "",
            reason: "Could not parse DOCX text in browser."
          };
          addMessage("bot", `I could not read text from ${file.name}. Try another DOCX or convert it to TXT/MD.`);
          return;
        }
      }

      if (extension === "doc") {
        state.fileContents[file.name] = {
          extractable: false,
          text: "",
          reason: "Legacy DOC is not supported in browser parsing. Convert DOC to DOCX or TXT first."
        };
        addMessage("bot", `Added ${file.name}, but legacy .doc files are not supported. Convert to .docx or .txt for extraction.`);
        return;
      }

      // Best-effort path for unknown extensions that are still text-based.
      const unknownText = await tryExtractUnknownText(file);
      if (unknownText) {
        state.fileContents[file.name] = {
          extractable: true,
          text: unknownText,
          reason: ""
        };
        addMessage("bot", `Analyzed ${file.name} as plain text. I extracted ${unknownText.split(/\s+/).filter(Boolean).length} words.`);
        return;
      }

      state.fileContents[file.name] = {
        extractable: false,
        text: "",
        reason: "This binary format is not directly readable in-browser."
      };
      addMessage("bot", `Added ${file.name}. Upload accepted, but this file format cannot be parsed for text in-browser.`);
      return;
    }

    try {
      const rawText = await file.text();
      const cleaned = cleanText(rawText);
      state.fileContents[file.name] = {
        extractable: true,
        text: cleaned,
        reason: ""
      };

      addMessage("bot", `Analyzed ${file.name}. I extracted ${cleaned.split(/\s+/).filter(Boolean).length} words of learning material.`);
    } catch (_error) {
      state.fileContents[file.name] = {
        extractable: false,
        text: "",
        reason: "Could not read file content."
      };
      addMessage("bot", `I could not read ${file.name}. Please re-upload or convert it to plain text.`);
    }
  }

  async function extractPdfText(file) {
    const lib = getPdfLib();
    if (!lib?.getDocument) {
      throw new Error("PDF.js is not available");
    }

    const buffer = await file.arrayBuffer();
    let pdf;

    try {
      pdf = await lib.getDocument({ data: buffer }).promise;
    } catch (_workerError) {
      // Fallback for worker-loading issues in local/dev environments.
      pdf = await lib.getDocument({ data: buffer, disableWorker: true }).promise;
    }

    const pagesText = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => String(item?.str || "").trim())
        .filter(Boolean)
        .join(" ");
      if (pageText) {
        pagesText.push(pageText);
      }
    }

    return pagesText.join("\n\n");
  }

  async function extractDocxText(file) {
    if (!window.mammoth?.extractRawText) {
      throw new Error("Mammoth is not available");
    }

    const buffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
    return String(result?.value || "");
  }

  async function extractImageText(file) {
    if (!window.Tesseract?.recognize) {
      throw new Error("Tesseract is not available");
    }

    const runOcrWithTimeout = async (lang) => {
      const recognizeTask = window.Tesseract.recognize(file, lang);
      const timeoutTask = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("OCR timed out")), OCR_TIMEOUT_MS);
      });
      const result = await Promise.race([recognizeTask, timeoutTask]);
      return String(result?.data?.text || "");
    };

    try {
      return await runOcrWithTimeout(OCR_LANGUAGE_PRIMARY);
    } catch (_error) {
      return await runOcrWithTimeout(OCR_LANGUAGE_FALLBACK);
    }
  }

  async function tryExtractUnknownText(file) {
    try {
      const raw = await file.text();
      const cleaned = cleanText(raw);
      if (!cleaned || cleaned.length < 24) return "";

      const sample = cleaned.slice(0, 4000);
      const printableCount = [...sample].filter((ch) => {
        const code = ch.charCodeAt(0);
        return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126) || code > 159;
      }).length;

      const ratio = sample.length ? printableCount / sample.length : 0;
      if (ratio < 0.75) return "";
      return cleaned;
    } catch (_error) {
      return "";
    }
  }

  function cleanText(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function buildCombinedContent(limitChars = 24000) {
    const blocks = Object.entries(state.fileContents)
      .filter(([, value]) => value.extractable && value.text)
      .map(([fileName, value]) => `FILE: ${fileName}\n${value.text}`);

    const combined = blocks.join("\n\n");
    return combined.length > limitChars ? combined.slice(0, limitChars) : combined;
  }

  async function extractKeyIdeas() {
    if (!(await ensureOllamaOnline())) return;

    const combined = buildCombinedContent();
    if (!combined) {
      const reasons = Object.entries(state.fileContents)
        .filter(([, fileInfo]) => !fileInfo.extractable)
        .slice(0, 3)
        .map(([fileName, fileInfo]) => `${fileName}: ${fileInfo.reason}`);

      const detail = reasons.length
        ? ` Uploaded but not extractable: ${reasons.join(" | ")}`
        : " Upload or paste notes first. Supported extraction: text files, PDF, DOCX, and images via OCR.";

      analysisPlaceholder.classList.remove("hidden");
      analysisPlaceholder.textContent = `No readable content found.${detail}`;
      addMessage("bot", "I could not find extractable text yet. Upload or paste text/images, or use PDF/DOCX with selectable text.");
      return;
    }

    extractBtn.disabled = true;
    const originalExtractLabel = extractBtn.textContent;
    extractBtn.textContent = "Extracting...";
    analysisPlaceholder.classList.remove("hidden");
    analysisPlaceholder.textContent = "Extracting key ideas...";
    addMessage("bot", "Extracting summary and key learning ideas...");

    try {
      const prompt = [
        "You are an educational assistant.",
        "Analyze the material and return ONLY valid JSON with this shape:",
        '{"summary":"...","keyPoints":["...","...","..."]}',
        "Rules:",
        "- summary: 2 to 4 sentences.",
        "- keyPoints: 5 to 8 concise bullet points.",
        "- no markdown, no code fences, no extra text.",
        "Material:",
        combined
      ].join("\n");

      const data = await callOllamaJson(prompt);
      const learningMap = {
        summary: String(data.summary || "").trim(),
        keyPoints: Array.isArray(data.keyPoints)
          ? data.keyPoints.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
          : []
      };

      if (!learningMap.summary) {
        learningMap.summary = "Summary could not be generated yet, but your material is loaded and ready.";
      }

      if (!learningMap.keyPoints.length) {
        learningMap.keyPoints = ["Review the uploaded material and identify the main terms and definitions."];
      }

      state.learningMap = learningMap;
      progress.extracted = true;
      refreshStepCompletion();
      renderLearningMap();
      analysisPlaceholder.textContent = "Extraction complete. Review your learning map below.";
      addMessage("bot", "Key ideas extracted. Now click Generate Questions to build a quiz from your file content.");
      setActiveStep("step-quiz");
    } catch (error) {
      analysisPlaceholder.textContent = "Extraction failed. Check Ollama and retry.";
      addMessage("bot", `Extraction failed: ${error?.message || "Unknown Ollama error"}`);
    } finally {
      extractBtn.disabled = false;
      extractBtn.textContent = originalExtractLabel;
    }
  }

  function fallbackLearningMap(content) {
    const sentences = content
      .split(/[\n\.\!\?]+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 30);

    const keyPoints = [];
    for (const sentence of sentences) {
      if (keyPoints.length >= 6) break;
      keyPoints.push(sentence);
    }

    return {
      summary: keyPoints.slice(0, 3).join(". ") + (keyPoints.length ? "." : ""),
      keyPoints
    };
  }

  function renderLearningMap() {
    analysisPlaceholder.classList.add("hidden");
    summaryBlock.classList.remove("hidden");

    summaryBlock.innerHTML = `
      <h4>Summary</h4>
      <p>${escapeHtml(state.learningMap.summary)}</p>
    `;

    keyPointsList.innerHTML = "";
    state.learningMap.keyPoints.forEach((point) => {
      const item = document.createElement("li");
      item.textContent = point;
      keyPointsList.appendChild(item);
    });
  }

  async function generateQuestions() {
    if (!(await ensureOllamaOnline())) return;

    const combined = buildCombinedContent();
    if (!combined) {
      addMessage("bot", "I need readable text content before I can generate questions.");
      return;
    }

    generateBtn.disabled = true;
    const originalGenerateLabel = generateBtn.textContent;
    generateBtn.textContent = "Generating...";
    addMessage("bot", "Generating question bank from your materials...");

    try {
      const prompt = [
        "Create a study quiz from this material.",
        "Return ONLY valid JSON in this exact shape:",
        '{"questions":[{"question":"...","options":["...","...","...","..."],"answerIndex":0,"explanation":"..."}]}',
        "Rules:",
        "- 6 to 10 questions.",
        "- exactly 4 options per question.",
        "- answerIndex from 0 to 3.",
        "- explanation one short sentence.",
        "- no markdown, no extra text.",
        "Material:",
        combined
      ].join("\n");

      const data = await callOllamaJson(prompt);
      const questions = normalizeQuestions(data.questions);
      if (!questions.length) {
        throw new Error("Model did not return valid quiz JSON");
      }

      state.questions = questions;
      progress.quizGenerated = questions.length > 0;
      refreshStepCompletion();
      launchQuizBtn.disabled = false;
      quizSummary.textContent = `Generated ${questions.length} questions. Click Start Quiz to begin.`;
      addMessage("bot", `Generated ${questions.length} questions. Open the quiz from Step 3, then continue to Step 4 for follow-up.`);
      setActiveStep("step-quiz");
    } catch (error) {
      launchQuizBtn.disabled = true;
      quizSummary.textContent = "Quiz generation failed. Check Ollama output and retry.";
      addMessage("bot", `Question generation failed: ${error?.message || "Unknown Ollama error"}`);
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = originalGenerateLabel;
    }
  }

  function normalizeQuestions(rawQuestions) {
    if (!Array.isArray(rawQuestions)) return [];

    return rawQuestions
      .map((item) => ({
        question: String(item?.question || "").trim(),
        options: Array.isArray(item?.options)
          ? item.options.map((option) => String(option).trim()).filter(Boolean).slice(0, 4)
          : [],
        answerIndex: Number.isInteger(item?.answerIndex) ? item.answerIndex : -1,
        explanation: String(item?.explanation || "").trim()
      }))
      .filter((item) => item.question && item.options.length === 4 && item.answerIndex >= 0 && item.answerIndex <= 3);
  }

  function fallbackQuestions() {
    const keyPoints = state.learningMap?.keyPoints || ["Review the uploaded material."];
    const questions = [];

    for (const point of keyPoints.slice(0, 6)) {
      questions.push({
        question: `Which statement best matches this key idea: "${point}"?`,
        options: [
          point,
          "It is unrelated to the uploaded material.",
          "It is only a formatting detail.",
          "It contradicts the core lesson."
        ],
        answerIndex: 0,
        explanation: "The correct option restates the extracted key idea from your file."
      });
    }

    return questions;
  }

  async function sendMessage() {
    if (!(await ensureOllamaOnline())) return;

    const message = userInput.value.trim();
    if (!message) return;

    addMessage("user", message);
    progress.followUpAsked = true;
    refreshStepCompletion();
    userInput.value = "";

    const combined = buildCombinedContent(12000);
    const summaryContext = state.learningMap
      ? `Summary: ${state.learningMap.summary}\nKey points: ${(state.learningMap.keyPoints || []).join("; ")}`
      : "No extracted summary yet.";

    const prompt = [
      "You are a study tutor.",
      "Use the uploaded material context to answer clearly and briefly.",
      summaryContext,
      combined ? `Material excerpt:\n${combined}` : "No material excerpt available.",
      `Student question: ${message}`
    ].join("\n\n");

    try {
      const response = await callOllama(prompt);
      addMessage("bot", response || "I could not produce a response. Please try rephrasing.");
    } catch (_error) {
      addMessage("bot", "I could not connect to Ollama for this answer. Check that Ollama is running and try again.");
    }
  }

  function addMessage(sender, text) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${sender}-message`;

    if (sender === "bot") {
      messageDiv.innerHTML = `
        <div class="avatar">🤖</div>
        <div class="content"></div>
      `;
    } else {
      messageDiv.innerHTML = `
        <div class="content"></div>
        <div class="avatar">👤</div>
      `;
    }

    const content = messageDiv.querySelector(".content");
    content.textContent = text;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function callOllama(prompt) {
    if (!state.ollamaEndpoint) {
      throw new Error("No Ollama endpoint detected");
    }
    if (!state.modelName) {
      throw new Error("No Ollama model selected");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(state.ollamaEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: state.modelName,
          prompt,
          stream: false
        }),
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`Ollama request timed out after ${Math.round(OLLAMA_TIMEOUT_MS / 1000)}s`);
      }
      await checkOllamaStatus();
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }

    const payload = await response.json();
    return String(payload.response || "").trim();
  }

  async function callOllamaJson(prompt) {
    const text = await callOllama(prompt);
    const parsed = parseJsonFromText(text);
    if (!parsed) throw new Error("Invalid JSON response from model");
    return parsed;
  }

  function parseJsonFromText(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return null;

    try {
      return JSON.parse(trimmed);
    } catch (_error) {
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        const candidate = trimmed.slice(start, end + 1);
        try {
          return JSON.parse(candidate);
        } catch (_innerError) {
          return null;
        }
      }
      return null;
    }
  }

  function startQuiz() {
    if (!state.questions.length) {
      addMessage("bot", "No quiz questions are available yet.");
      return;
    }

    state.currentQuestionIndex = 0;
    state.score = 0;
    quizModal.style.display = "flex";
    quizFeedback.textContent = "";
    nextQuizBtn.textContent = "Next Question";
    renderQuestion();
  }

  function renderQuestion() {
    const question = state.questions[state.currentQuestionIndex];
    if (!question) {
      renderQuizComplete();
      return;
    }

    quizQuestion.textContent = question.question;
    quizOptions.innerHTML = "";
    quizFeedback.textContent = "";
    quizProgress.textContent = `Question ${state.currentQuestionIndex + 1} of ${state.questions.length}`;
    nextQuizBtn.disabled = true;

    question.options.forEach((option, optionIndex) => {
      const button = document.createElement("button");
      button.className = "option-btn";
      button.textContent = option;
      button.addEventListener("click", () => checkAnswer(optionIndex));
      quizOptions.appendChild(button);
    });
  }

  function checkAnswer(selectedIndex) {
    const question = state.questions[state.currentQuestionIndex];
    const buttons = [...quizOptions.querySelectorAll(".option-btn")];
    const isCorrect = selectedIndex === question.answerIndex;

    buttons.forEach((button, index) => {
      button.disabled = true;
      if (index === question.answerIndex) {
        button.classList.add("correct");
      } else if (index === selectedIndex) {
        button.classList.add("incorrect");
      }
    });

    if (isCorrect) {
      state.score += 1;
      quizFeedback.textContent = `Correct. ${question.explanation}`;
    } else {
      quizFeedback.textContent = `Not quite. ${question.explanation}`;
    }

    nextQuizBtn.disabled = false;
  }

  function moveToNextQuestion() {
    if (state.currentQuestionIndex >= state.questions.length - 1) {
      renderQuizComplete();
      return;
    }

    state.currentQuestionIndex += 1;
    renderQuestion();
  }

  function renderQuizComplete() {
    quizQuestion.textContent = "Knowledge Check Complete";
    quizOptions.innerHTML = "";
    quizProgress.textContent = "";

    const total = state.questions.length;
    const percent = total ? Math.round((state.score / total) * 100) : 0;
    quizFeedback.textContent = `You scored ${state.score}/${total} (${percent}%).`;
    quizSummary.textContent = `Last result: ${state.score}/${total} (${percent}%). Continue with follow-up questions in Step 4.`;

    nextQuizBtn.textContent = "Close";
    nextQuizBtn.disabled = false;
    nextQuizBtn.onclick = () => {
      quizModal.style.display = "none";
      nextQuizBtn.textContent = "Next Question";
      nextQuizBtn.onclick = moveToNextQuestion;
      setActiveStep("step-chat");
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
});
