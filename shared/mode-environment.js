(function () {
  const MODE_ENV_KEY = "slidePlayModeEnvironment";
  const BADGE_ID = "sp-mode-env-badge";
  const COUNTDOWN_ID = "sp-mode-env-countdown";

  function readModeEnvironment() {
    try {
      return JSON.parse(localStorage.getItem(MODE_ENV_KEY) || "null");
    } catch (_error) {
      return null;
    }
  }

  function ensureStyles() {
    if (document.getElementById("sp-mode-env-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "sp-mode-env-styles";
    style.textContent = [
      "#" + BADGE_ID + " {",
      "  position: fixed;",
      "  top: 10px;",
      "  right: 10px;",
      "  z-index: 12000;",
      "  min-width: 240px;",
      "  max-width: min(420px, calc(100vw - 20px));",
      "  padding: 10px 12px;",
      "  border-radius: 12px;",
      "  border: 1px solid rgba(87, 238, 255, 0.42);",
      "  background: linear-gradient(145deg, rgba(8, 17, 40, 0.9), rgba(12, 24, 58, 0.86));",
      "  color: #e7fbff;",
      "  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.34);",
      "  font-family: 'Rajdhani', 'Segoe UI', sans-serif;",
      "  backdrop-filter: blur(6px);",
      "  -webkit-backdrop-filter: blur(6px);",
      "}",
      "#" + BADGE_ID + " .label {",
      "  font-size: 11px;",
      "  opacity: 0.86;",
      "  letter-spacing: 0.11em;",
      "  text-transform: uppercase;",
      "}",
      "#" + BADGE_ID + " .value {",
      "  margin-top: 4px;",
      "  font-size: 18px;",
      "  font-weight: 700;",
      "}",
      "#" + BADGE_ID + " .meta {",
      "  margin-top: 3px;",
      "  font-size: 13px;",
      "  color: rgba(230, 245, 255, 0.9);",
      "}",
      "#" + COUNTDOWN_ID + " {",
      "  position: fixed;",
      "  inset: 0;",
      "  z-index: 12500;",
      "  display: grid;",
      "  place-items: center;",
      "  pointer-events: none;",
      "  background: radial-gradient(circle at center, rgba(25, 39, 85, 0.38), rgba(6, 12, 28, 0.62));",
      "  color: #edfdff;",
      "  font-family: 'Orbitron', 'Rajdhani', sans-serif;",
      "  font-size: clamp(40px, 10vw, 92px);",
      "  font-weight: 800;",
      "  letter-spacing: 0.08em;",
      "  text-shadow: 0 0 20px rgba(87, 238, 255, 0.52);",
      "}",
      "#" + COUNTDOWN_ID + " .tag {",
      "  position: absolute;",
      "  top: calc(50% - 84px);",
      "  font-size: clamp(14px, 2.3vw, 20px);",
      "  letter-spacing: 0.14em;",
      "  text-transform: uppercase;",
      "}",
      "@media (max-width: 720px) {",
      "  #" + BADGE_ID + " {",
      "    min-width: 0;",
      "    width: calc(100vw - 20px);",
      "  }",
      "}"
    ].join("\n");

    document.head.appendChild(style);
  }

  function buildMetaLine(data) {
    const mode = String(data.mode || "");
    const config = data.modeConfig || {};

    if (mode === "hot-seat") {
      const room = config.roomCode || "AUTO";
      const players = config.maxPlayers || "-";
      return "Room " + room + " | Max players " + players;
    }

    if (mode === "tournament") {
      const bracket = config.bracketSize || "-";
      const seeding = config.seeding || "balanced";
      return "Bracket " + bracket + " | Seeding " + seeding;
    }

    if (mode === "live-2-player") {
      const players = config.players || "-";
      const syncWindow = config.syncWindow || "-";
      return "Players " + players + " | Sync " + syncWindow + "s";
    }

    return data.modeSummary || "Mode active";
  }

  function mountBadge(data) {
    if (document.getElementById(BADGE_ID)) {
      return;
    }

    const badge = document.createElement("aside");
    badge.id = BADGE_ID;
    badge.setAttribute("aria-live", "polite");

    const demoText = data.hasDemo && data.demoTitle
      ? "Demo: " + data.demoTitle
      : "Source: Uploaded slides";

    badge.innerHTML = [
      '<div class="label">Mode Environment Active</div>',
      '<div class="value">' + (data.modeLabel || "Session") + "</div>",
      '<div class="meta">' + buildMetaLine(data) + "</div>",
      '<div class="meta">' + demoText + "</div>"
    ].join("");

    document.body.appendChild(badge);
  }

  function runSimultaneousCountdown(data) {
    if (document.getElementById(COUNTDOWN_ID)) {
      return;
    }

    const syncWindow = (data.modeConfig && data.modeConfig.syncWindow) || 15;
    const overlay = document.createElement("div");
    overlay.id = COUNTDOWN_ID;
      overlay.innerHTML = '<div class="tag">Live 2-Player Launch | Sync Window ' + syncWindow + 's</div><div id="sp-mode-env-count">3</div>';
    document.body.appendChild(overlay);

    const countNode = document.getElementById("sp-mode-env-count");
    const sequence = ["3", "2", "1", "GO"];
    let index = 0;

    const timer = setInterval(function () {
      index += 1;
      if (index >= sequence.length) {
        clearInterval(timer);
        setTimeout(function () {
          overlay.remove();
        }, 480);
        return;
      }

      if (countNode) {
        countNode.textContent = sequence[index];
      }
    }, 900);
  }

  function init() {
    const data = readModeEnvironment();
    if (!data || !data.mode) {
      return;
    }

    window.SlidePlayModeEnvironment = data;
    ensureStyles();
    mountBadge(data);

    if (data.mode === "live-2-player") {
      runSimultaneousCountdown(data);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
