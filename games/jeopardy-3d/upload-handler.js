/* upload-handler.js - File upload and parsing */
(function (window) {
  const UPLOADED_FILES_KEY = "slidePlayUploadedFiles";
  const GENERATED_QUIZ_KEY = "slidePlayGeneratedQuizData";

  const UploadHandler = {
    init() {
      this.setupFileInputListeners();
      this.setupDropZone();
      this.restoreExistingUpload();
    },

    restoreExistingUpload() {
      const statusEl = document.getElementById("upload-status");
      const proceedBtn = document.getElementById("btn-upload-proceed");

      let files = null;
      let quizData = null;

      try {
        files = JSON.parse(localStorage.getItem(UPLOADED_FILES_KEY) || "null");
      } catch (_error) {
        files = null;
      }

      try {
        quizData = JSON.parse(localStorage.getItem(GENERATED_QUIZ_KEY) || "null");
      } catch (_error) {
        quizData = null;
      }

      const firstFile = Array.isArray(files) && files.length > 0 ? files[0] : null;
      const extractedText = firstFile && typeof firstFile.extractedText === "string"
        ? firstFile.extractedText
        : (firstFile && typeof firstFile.text === "string" ? firstFile.text : "");
      const hasUsableContent = extractedText.trim().length >= 50;

      if (!hasUsableContent) return;

      if (proceedBtn) proceedBtn.disabled = false;

      if (statusEl) {
        const questionCount = Array.isArray(quizData) ? quizData.length : 0;
        const suffix = questionCount > 0
          ? ` (${questionCount} saved question${questionCount === 1 ? "" : "s"})`
          : "";
        statusEl.textContent = `✅ Using saved slides: ${firstFile.originalName || "previous upload"}${suffix}`;
        statusEl.style.color = "#2ecc71";
      }

      if (window.GameFlowManager) {
        window.GameFlowManager.setUploadedContent(extractedText, firstFile.originalName || "previous upload");
      }
    },

    setupFileInputListeners() {
      const fileInput = document.getElementById("file-input");
      const fileDropZone = document.getElementById("file-drop-zone");

      if (fileInput) {
        fileInput.addEventListener("change", (e) => {
          if (e.target.files && e.target.files[0]) {
            this.handleFileSelect(e.target.files[0]);
          }
        });
      }

      if (fileDropZone) {
        fileDropZone.addEventListener("click", () => {
          if (fileInput) fileInput.click();
        });
      }
    },

    setupDropZone() {
      const fileDropZone = document.getElementById("file-drop-zone");
      if (!fileDropZone) return;

      fileDropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileDropZone.classList.add("drag-over");
      });

      fileDropZone.addEventListener("dragleave", () => {
        fileDropZone.classList.remove("drag-over");
      });

      fileDropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileDropZone.classList.remove("drag-over");

        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.handleFileSelect(e.dataTransfer.files[0]);
        }
      });
    },

    async handleFileSelect(file) {
      const statusEl = document.getElementById("upload-status");
      const proceedBtn = document.getElementById("btn-upload-proceed");

      try {
        if (statusEl) statusEl.textContent = "📂 Reading file...";

        // Parse the file
        const extractedText = await this.parseFile(file);

        if (!extractedText || extractedText.trim().length < 50) {
          throw new Error("File is too short (minimum 50 characters needed)");
        }

        // Store in localStorage
        const uploadedData = {
          originalName: file.name,
          fileType: file.type,
          fileSize: file.size,
          uploadedAt: new Date().toISOString(),
          extractedText: extractedText,
          text: extractedText,
        };

        localStorage.setItem(UPLOADED_FILES_KEY, JSON.stringify([uploadedData]));
        localStorage.removeItem(GENERATED_QUIZ_KEY); // Clear old questions

        if (statusEl) {
          statusEl.textContent = `✅ Uploaded: ${file.name} (${Math.round(file.size / 1024)} KB)`;
          statusEl.style.color = "#2ecc71";
        }

        // Enable proceed button
        if (proceedBtn) {
          proceedBtn.disabled = false;
        }

        // Notify flow manager
        if (window.GameFlowManager) {
          window.GameFlowManager.setUploadedContent(extractedText, file.name);
        }

        console.log("✅ File uploaded and processed successfully");
      } catch (error) {
        console.error("Upload error:", error);
        if (statusEl) {
          statusEl.textContent = `❌ Error: ${error.message}`;
          statusEl.style.color = "#e74c3c";
        }
      }
    },

    async parseFile(file) {
      const ext = (file.name.split(".").pop() || "").toLowerCase();

      if (["txt", "md", "csv", "json"].includes(ext)) {
        return await this.readTextFile(file);
      } else if (ext === "pdf") {
        return await this.readPdfFile(file);
      } else if (ext === "docx") {
        return await this.readDocxFile(file);
      } else {
        throw new Error(`Unsupported file type: .${ext}`);
      }
    },

    readTextFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (typeof e.target?.result === "string") {
            resolve(e.target.result);
          } else {
            reject(new Error("Failed to read text file"));
          }
        };
        reader.onerror = () => reject(new Error("File read error"));
        reader.readAsText(file);
      });
    },

    async readPdfFile(file) {
      try {
        if (typeof pdfjsLib === "undefined") {
          throw new Error("PDF.js library not loaded");
        }

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          fullText += content.items.map((item) => item.str || "").join(" ") + "\n";
        }

        return fullText;
      } catch (error) {
        throw new Error(`PDF parsing failed: ${error.message}`);
      }
    },

    async readDocxFile(file) {
      try {
        if (typeof mammoth === "undefined") {
          throw new Error("Mammoth.js library not loaded");
        }

        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value || "";
      } catch (error) {
        throw new Error(`DOCX parsing failed: ${error.message}`);
      }
    },
  };

  // Export to window
  window.UploadHandler = UploadHandler;

  // Auto-initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      UploadHandler.init();
    });
  } else {
    UploadHandler.init();
  }
})(window);
