/**
 * progress-tracker.js
 * Tracks time on site, game sessions, scores and daily activity.
 * Writes data to localStorage keys that Analysis.js and StudentDashboard read.
 * Auto-initialises on load — no setup required in individual game files.
 */
(function () {
  // Storage keys
  const TRACKER_KEY     = 'spProgressTracker';
  const PROGRESS_KEY    = 'sp_class_progress';   // read by Analysis.js
  const ACTIVITY_KEY    = 'sp_class_activities';  // read by Analysis.js

  // ── Helpers ────────────────────────────────────────────────────────────────
  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  function nowMs() { return Date.now(); }

  // ── Main store ─────────────────────────────────────────────────────────────
  function loadTracker() {
    return readJson(TRACKER_KEY, {
      totalTimeMs:    0,
      dailyTime:      {},   // { "2026-05-17": ms }
      gameSessions:   [],   // last 100 entries
      streak:         0,
      lastStreakDate: '',
      lastActive:     0,
    });
  }

  function saveTracker(t) { writeJson(TRACKER_KEY, t); }

  // ── Session timer ──────────────────────────────────────────────────────────
  let tracker        = loadTracker();
  let sessionStart   = nowMs();
  let accumulatedMs  = 0;       // ms banked while tab was visible this session
  let tabVisible     = !document.hidden;

  // Called each time the tab becomes hidden — banks elapsed time
  function bankTime() {
    if (!tabVisible) return;
    const delta = nowMs() - sessionStart;
    accumulatedMs += delta;
    sessionStart  = nowMs();
  }

  // Called each time the tab becomes visible — resume the clock
  function resumeTime() {
    sessionStart = nowMs();
    tabVisible   = true;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      tabVisible = false;
      bankTime();
      flushTimeToStorage();
    } else {
      resumeTime();
    }
  });

  // Bank and flush every 60 s so data is never lost on crash/close
  setInterval(function () {
    if (!document.hidden) bankTime();
    flushTimeToStorage();
    if (!document.hidden) sessionStart = nowMs(); // reset so we don't double-count
  }, 60_000);

  window.addEventListener('beforeunload', function () {
    bankTime();
    flushTimeToStorage();
  });

  function flushTimeToStorage() {
    if (accumulatedMs <= 0) return;
    tracker = loadTracker(); // refresh in case another tab wrote
    const today = todayStr();
    tracker.totalTimeMs             += accumulatedMs;
    tracker.dailyTime[today]         = (tracker.dailyTime[today] || 0) + accumulatedMs;
    tracker.lastActive               = nowMs();
    accumulatedMs = 0;

    // Streak logic
    updateStreak(tracker, today);
    saveTracker(tracker);
    pushDayActivityRecord(today);
  }

  function updateStreak(t, today) {
    if (!t.lastStreakDate) { t.streak = 1; t.lastStreakDate = today; return; }
    if (t.lastStreakDate === today) return;
    const prev = new Date(t.lastStreakDate);
    const curr = new Date(today);
    const diff = Math.round((curr - prev) / 86_400_000);
    t.streak        = diff === 1 ? (t.streak || 0) + 1 : 1;
    t.lastStreakDate = today;
  }

  // ── Activity log (feeds Analysis.js) ──────────────────────────────────────
  function pushDayActivityRecord(today) {
    const activities = readJson(ACTIVITY_KEY, []);
    // Remove duplicate for today then push fresh
    const filtered = activities.filter(function (a) { return a.date !== today; });
    const tracker2 = loadTracker();
    filtered.unshift({
      date:      today,
      timeMs:    tracker2.dailyTime[today] || 0,
      timeLabel: msToLabel(tracker2.dailyTime[today] || 0),
      sessions:  tracker2.gameSessions.filter(function (s) { return s.date === today; }).length,
    });
    writeJson(ACTIVITY_KEY, filtered.slice(0, 90)); // keep 90 days
  }

  function msToLabel(ms) {
    const m = Math.round(ms / 60_000);
    if (m < 60) return m + 'm';
    return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  }

  // ── Game session tracking ──────────────────────────────────────────────────
  let currentGameId    = '';
  let currentGameStart = 0;

  function startGame(gameId) {
    currentGameId    = gameId || document.title || 'game';
    currentGameStart = nowMs();
  }

  function endGame(finalScore) {
    if (!currentGameStart) return;
    const durationMs = nowMs() - currentGameStart;
    const today      = todayStr();

    tracker = loadTracker();
    const entry = {
      game:       currentGameId,
      date:       today,
      durationMs: durationMs,
      score:      Number(finalScore) || 0,
      completion: Math.min(100, Math.round((durationMs / 120_000) * 100)), // proxy: 2 min = 100%
      timestamp:  nowMs(),
    };
    tracker.gameSessions.unshift(entry);
    if (tracker.gameSessions.length > 100) tracker.gameSessions.length = 100;
    saveTracker(tracker);

    // Write to sp_class_progress (array read by Analysis.js)
    const progress = readJson(PROGRESS_KEY, []);
    progress.unshift(entry);
    writeJson(PROGRESS_KEY, progress.slice(0, 200));

    pushDayActivityRecord(today);
    currentGameStart = 0;
  }

  // ── Public stats ───────────────────────────────────────────────────────────
  function getStats() {
    const t     = loadTracker();
    const today = todayStr();
    return {
      totalTimeMs:    t.totalTimeMs,
      todayTimeMs:    t.dailyTime[today] || 0,
      todayTimeLabel: msToLabel(t.dailyTime[today] || 0),
      totalSessions:  t.gameSessions.length,
      streak:         t.streak,
      lastGame:       t.gameSessions[0] ? t.gameSessions[0].game : '',
      dailyTime:      t.dailyTime,
      recentSessions: t.gameSessions.slice(0, 10),
    };
  }

  // ── Periodic AI nudge messages (used by adventure-layer) ──────────────────
  function buildNudgeMessage() {
    const stats   = getStats();
    const minutes = Math.round(stats.todayTimeMs / 60_000);
    const streak  = stats.streak;
    const game    = stats.lastGame;

    const pool = [
      'You have been active for ' + minutes + ' minute' + (minutes !== 1 ? 's' : '') + ' today. Great focus.',
      streak > 1
        ? 'Day ' + streak + ' streak! Consistency is the highest form of skill.'
        : 'Start a daily streak — even 10 minutes a day builds mastery.',
      game
        ? 'You are making solid progress in ' + game + '. Keep pushing.'
        : 'Pick a game and challenge yourself — every session counts.',
      minutes >= 15
        ? 'Excellent session time today (' + minutes + ' min). Your retention rate increases with active play.'
        : 'Short sessions still build skill. Try to hit 15 minutes today.',
      'Your best improvement comes after the next mistake — stay in the game.',
      stats.totalSessions > 5
        ? 'Session ' + (stats.totalSessions + 1) + ' coming up. Patterns are forming — keep going.'
        : 'Early sessions build your baseline. Do not skip days.',
    ];

    // Pick one pseudo-randomly, weighted toward first few based on time
    const idx = Math.floor(nowMs() / 1_000) % pool.length;
    return pool[idx];
  }

  // ── Expose API ─────────────────────────────────────────────────────────────
  window.ProgressTracker = {
    startGame:          startGame,
    endGame:            endGame,
    getStats:           getStats,
    buildNudgeMessage:  buildNudgeMessage,
    msToLabel:          msToLabel,
  };

  // Kick off the first bank so sessionStart is set correctly
  sessionStart = nowMs();
  tabVisible   = !document.hidden;
})();
