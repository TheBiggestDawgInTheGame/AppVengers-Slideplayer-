(function () {
  function safeParse(jsonText, fallbackValue) {
    try {
      return JSON.parse(jsonText);
    } catch (_error) {
      return fallbackValue;
    }
  }

  function isPremiumStudentLocal() {
    var sub = safeParse(localStorage.getItem("sp_student_subscription") || "null", null);
    if (!sub) return false;
    var plan = String(sub.plan || "").toLowerCase();
    var status = String(sub.status || "").toLowerCase();
    return (plan === "student_elite" || plan === "student_premium") && status !== "cancelled" && status !== "locked";
  }

  function getStudentUid() {
    return localStorage.getItem("sp_user_uid") || "";
  }

  function getApiBase() {
    var fromStorage = localStorage.getItem("slideplay_api_base");
    if (fromStorage && fromStorage.trim()) {
      return fromStorage.trim().replace(/\/$/, "");
    }

    if (window.location && window.location.origin && /^https?:/i.test(window.location.origin)) {
      return window.location.origin;
    }

    return "http://localhost:3004";
  }

  function cacheLocalReport(payload, reportText) {
    var current = safeParse(localStorage.getItem("sp_game_reports") || "[]", []);
    if (!Array.isArray(current)) current = [];

    current.unshift({
      date: new Date().toISOString(),
      gameType: payload.gameType || "quiz",
      score: Number(payload.score || 0),
      totalQuestions: Number(payload.totalQuestions || 0),
      correctCount: Number(payload.correctCount || 0),
      reportText: reportText || "",
      sessionCode: payload.sessionCode || "",
    });

    localStorage.setItem("sp_game_reports", JSON.stringify(current.slice(0, 50)));
  }

  async function submitReport(payload) {
    if (!isPremiumStudentLocal()) {
      return { ok: false, reason: "not-premium" };
    }

    var uid = getStudentUid();
    if (!uid) {
      return { ok: false, reason: "missing-uid" };
    }

    var body = Object.assign({}, payload || {});
    if (!Array.isArray(body.questionAttempts)) {
      body.questionAttempts = [];
    }

    var endpoint =
      getApiBase() + "/api/students/" + encodeURIComponent(uid) + "/game-reports";

    try {
      var response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        return { ok: false, reason: "http-" + response.status };
      }

      var data = await response.json();
      var reportText =
        data && data.report && typeof data.report.reportText === "string"
          ? data.report.reportText
          : "";

      cacheLocalReport(body, reportText);
      return { ok: true, data: data };
    } catch (_error) {
      return { ok: false, reason: "network" };
    }
  }

  window.PremiumGameReporter = {
    isPremiumStudentLocal: isPremiumStudentLocal,
    submitReport: submitReport,
  };
})();
