/* quiz-app-api.js */
(function () {
  const BACKEND_URL_KEY = "slidePlayQuizAppBackendUrl";
  const TOKEN_KEY = "slidePlayQuizAppToken";
  const USER_KEY = "slidePlayQuizAppUser";
  const CREDS_KEY = "slidePlayQuizAppCreds";

  const DEFAULT_BACKEND_URL = "http://localhost:4000";

  function getBackendUrl() {
    return (localStorage.getItem(BACKEND_URL_KEY) || DEFAULT_BACKEND_URL).replace(/\/$/, "");
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setAuth(token, user) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  async function apiFetch(path, options) {
    const token = getToken();
    const headers = Object.assign(
      {
        "Content-Type": "application/json",
      },
      (options && options.headers) || {},
    );

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${getBackendUrl()}${path}`, {
      method: (options && options.method) || "GET",
      headers,
      body: options && options.body ? JSON.stringify(options.body) : undefined,
      credentials: "include",
    });

    let data = null;
    try {
      data = await response.json();
    } catch (_error) {
      data = null;
    }

    if (!response.ok) {
      const message = (data && (data.message || data.error)) || `HTTP ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  function randomId() {
    return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }

  function loadSavedCreds() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CREDS_KEY) || "null");
      if (!parsed || typeof parsed !== "object") return null;
      if (!parsed.email || !parsed.password || !parsed.name) return null;
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  function saveCreds(creds) {
    localStorage.setItem(CREDS_KEY, JSON.stringify(creds));
  }

  async function ensureAuth() {
    const existingToken = getToken();
    if (existingToken) {
      return existingToken;
    }

    const creds =
      loadSavedCreds() ||
      {
        name: "SlidePlay Player",
        email: `slideplay_${randomId()}@local.dev`,
        password: `SlidePlay#${Math.floor(Math.random() * 1000000)}`,
      };

    saveCreds(creds);

    try {
      await apiFetch("/api/users/register", {
        method: "POST",
        body: {
          name: creds.name,
          email: creds.email,
          password: creds.password,
        },
      });
    } catch (_error) {
      // Ignore registration errors (e.g., already exists), login will decide.
    }

    const loginData = await apiFetch("/api/users/login", {
      method: "POST",
      body: {
        email: creds.email,
        password: creds.password,
      },
    });

    const token =
      (loginData && loginData.token) ||
      (loginData && loginData.data && loginData.data.token) ||
      "";
    const user = (loginData && loginData.user) || (loginData && loginData.data && loginData.data.user) || null;

    if (!token) {
      throw new Error("Login succeeded but no token returned by backend");
    }

    setAuth(token, user);
    return token;
  }

  function normalizeQuestion(raw) {
    if (!raw || typeof raw !== "object") return null;

    const questionText = String(raw.questionText || raw.question || "").trim();
    const options = Array.isArray(raw.options)
      ? raw.options.map((option) => String(option || "").trim()).filter((option) => option.length > 0)
      : [];

    if (!questionText || options.length < 2) {
      return null;
    }

    let correctAnswer = "";
    if (typeof raw.correctAnswer === "string" && raw.correctAnswer.trim()) {
      const value = raw.correctAnswer.trim();
      if (/^[A-D]$/i.test(value)) {
        const idx = value.toUpperCase().charCodeAt(0) - 65;
        correctAnswer = options[idx] || "";
      } else {
        correctAnswer = value;
      }
    } else if (Number.isInteger(raw.correctIndex) && options[raw.correctIndex]) {
      correctAnswer = options[raw.correctIndex];
    }

    if (!correctAnswer) {
      return null;
    }

    return {
      questionText,
      options: options.slice(0, 4),
      correctAnswer,
    };
  }

  function extractQuestionArray(payload) {
    if (!payload || typeof payload !== "object") return [];

    const candidates = [
      payload.questions,
      payload.data && payload.data.questions,
      payload.quiz && payload.quiz.questions,
      payload.data && payload.data.quiz && payload.data.quiz.questions,
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      if (Array.isArray(candidates[i])) {
        return candidates[i];
      }
    }

    return [];
  }

  async function generateQuestionsFromText(content, count) {
    const text = String(content || "").trim();
    if (!text) {
      return [];
    }

    await ensureAuth();

    let payload = null;

    try {
      payload = await apiFetch("/api/ai-study-buddy/generate-quiz", {
        method: "POST",
        body: {
          topic: text.slice(0, 120),
          questionCount: Math.max(4, Number(count || 8)),
          focusAreas: [],
        },
      });
    } catch (_error) {
      payload = null;
    }

    if (!payload) {
      payload = await apiFetch("/api/adaptive", {
        method: "POST",
        body: {
          topic: text.slice(0, 120),
          numQuestions: Math.max(4, Number(count || 8)),
          questionType: "mcq",
          difficultyMode: "blended",
        },
      });
    }

    const rawQuestions = extractQuestionArray(payload);
    return rawQuestions.map(normalizeQuestion).filter((item) => !!item);
  }

  async function submitRoundReport(report) {
    await ensureAuth();
    return apiFetch("/api/reports", {
      method: "POST",
      body: report,
    });
  }

  function pickTopicNames(rows, type) {
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((row) => row && typeof row === "object")
      .filter((row) => {
        if (type === "weak") {
          return Number(row.accuracy || row.score || 0) <= 0.6;
        }
        if (type === "strong") {
          return Number(row.accuracy || row.score || 0) >= 0.75;
        }
        return false;
      })
      .slice(0, 3)
      .map((row) => String(row.topic || row.name || row.category || "").trim())
      .filter((name) => name.length > 0);
  }

  function normalizeInsightsPayload(payload) {
    if (!payload || typeof payload !== "object") return null;

    const root = payload.data && typeof payload.data === "object" ? payload.data : payload;
    const accuracyRaw =
      root.overallAccuracy ??
      root.accuracy ??
      root.averageAccuracy ??
      (root.stats && root.stats.accuracy) ??
      null;

    let overallAccuracy = Number(accuracyRaw);
    if (!Number.isFinite(overallAccuracy)) overallAccuracy = null;
    if (overallAccuracy !== null && overallAccuracy > 1) {
      overallAccuracy = overallAccuracy / 100;
    }

    const topicRows =
      root.topicPerformance ||
      root.topics ||
      (root.analytics && root.analytics.topics) ||
      [];

    const recommendations =
      root.recommendations ||
      root.suggestions ||
      (root.intelligence && root.intelligence.recommendations) ||
      [];

    const recommendation = Array.isArray(recommendations)
      ? String(recommendations[0] || "").trim()
      : String(recommendations || "").trim();

    const recentTrend = String(
      root.trend ||
      root.recentTrend ||
      (root.analytics && root.analytics.trend) ||
      "",
    ).trim();

    return {
      overallAccuracy,
      weakTopics: pickTopicNames(topicRows, "weak"),
      strongTopics: pickTopicNames(topicRows, "strong"),
      recommendation,
      recentTrend,
    };
  }

  async function getPostRoundInsights() {
    await ensureAuth();

    const endpoints = [
      "/api/analytics/overview",
      "/api/analytics/dashboard",
      "/api/intelligence/insights",
      "/api/intelligence/recommendations",
    ];

    for (let i = 0; i < endpoints.length; i += 1) {
      try {
        const payload = await apiFetch(endpoints[i], { method: "GET" });
        const normalized = normalizeInsightsPayload(payload);
        if (normalized) {
          return normalized;
        }
      } catch (_error) {
        // Keep trying alternate analytics endpoints.
      }
    }

    return null;
  }

  window.QuizAppApi = {
    getBackendUrl,
    ensureAuth,
    generateQuestionsFromText,
    submitRoundReport,
    getPostRoundInsights,
  };
})();
