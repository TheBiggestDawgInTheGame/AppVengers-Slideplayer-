const MODE_ENV_KEY = "slidePlayModeEnvironment";
const GAMES_ENDPOINT = "../../slide_upload/games.html";

const modeTitle = document.getElementById("modeTitle");
const modeSubtitle = document.getElementById("modeSubtitle");
const sessionMeta = document.getElementById("sessionMeta");
const fileList = document.getElementById("fileList");
const hotSeatPanel = document.getElementById("hotSeatPanel");
const tournamentPanel = document.getElementById("tournamentPanel");
const live2PlayerPanel = document.getElementById("live2PlayerPanel");
const fallbackPanel = document.getElementById("fallbackPanel");

document.addEventListener("DOMContentLoaded", initEnvironment);

function initEnvironment() {
  const data = readEnvData();
  if (!data || !data.mode) {
    modeTitle.textContent = "No Session Found";
    modeSubtitle.textContent = "Configure a mode from Upload Arena first.";
    fallbackPanel.classList.remove("hidden");
    fallbackPanel.querySelector("p").innerHTML = 'No session payload detected. <a href="StudentUploadPage.html">Go back to Upload Arena</a>.';
    return;
  }

  renderHeader(data);
  renderMeta(data);
  renderFiles(data.fileNames || []);

  if (data.mode === "hot-seat") {
    renderHotSeat(data);
  } else if (data.mode === "tournament") {
    renderTournament(data);
  } else if (data.mode === "live-2-player") {
    renderLive2Player(data);
  } else {
    fallbackPanel.classList.remove("hidden");
  }
}

function readEnvData() {
  try {
    return JSON.parse(localStorage.getItem(MODE_ENV_KEY) || "null");
  } catch (_error) {
    return null;
  }
}

function renderHeader(data) {
  modeTitle.textContent = data.modeLabel + " Environment";
  modeSubtitle.textContent = data.hasDemo
    ? "Demo session active: " + (data.demoTitle || "Demo Topic")
    : "Live upload session initialized for your selected mode.";
}

function renderMeta(data) {
  const items = [
    { k: "Mode", v: data.modeLabel },
    { k: "Slides", v: String(data.filesCount || 0) },
    { k: "Demo", v: data.hasDemo ? "Active" : "Off" },
    { k: "Configured", v: formatTime(data.configuredAt) }
  ];

  sessionMeta.innerHTML = items
    .map(function (item) {
      return '<div class="meta-item"><div class="k">' + item.k + '</div><div class="v">' + item.v + "</div></div>";
    })
    .join("");
}

function renderFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    fileList.innerHTML = "<li>No files loaded in this session.</li>";
    return;
  }

  fileList.innerHTML = files.map(function (name) { return "<li>" + name + "</li>"; }).join("");
}

function renderHotSeat(data) {
  hotSeatPanel.classList.remove("hidden");

  const config = data.modeConfig || {};
  const roomCode = String(config.roomCode || makeRoomCode());
  const maxPlayers = Math.max(2, Math.min(20, Number(config.maxPlayers || 6)));
  const roomCodeValue = document.getElementById("roomCodeValue");
  const playerList = document.getElementById("playerList");

  roomCodeValue.textContent = roomCode;
  playerList.innerHTML = "";

  const names = ["Aiden", "Lebo", "Musa", "Nia", "Zara", "Theo", "Amara", "Neo", "Mpho", "Ivy", "Sam", "Zane"];
  const roster = names.slice(0, maxPlayers);
  let index = 0;

  const timer = setInterval(function () {
    if (index >= roster.length) {
      clearInterval(timer);
      return;
    }

    const li = document.createElement("li");
    li.textContent = roster[index] + " connected";
    playerList.appendChild(li);

    window.setTimeout(function () {
      li.classList.add("ready");
      li.textContent = roster[index] + " ready";
    }, 900);

    index += 1;
  }, 800);
}

function renderTournament(data) {
  tournamentPanel.classList.remove("hidden");

  const config = data.modeConfig || {};
  const bracketSize = Number(config.bracketSize || 8);
  const seeding = String(config.seeding || "balanced");
  const bracketGrid = document.getElementById("bracketGrid");
  const players = buildTournamentPlayers(bracketSize, seeding);

  const rounds = [];
  for (let i = 0; i < players.length; i += 2) {
    rounds.push([players[i], players[i + 1]]);
  }

  bracketGrid.innerHTML = rounds
    .map(function (match, idx) {
      return '<div class="match"><strong>Match ' + (idx + 1) + '</strong><div>' + match[0] + ' vs ' + match[1] + "</div></div>";
    })
    .join("");
}

function renderLive2Player(data) {
  live2PlayerPanel.classList.remove("hidden");

  const config = data.modeConfig || {};
  const players = Math.max(2, Math.min(12, Number(config.players || 4)));
  const syncWindow = Math.max(5, Math.min(60, Number(config.syncWindow || 15)));
  const laneWrap = document.getElementById("laneWrap");
  const simInfo = document.getElementById("simInfo");

  simInfo.textContent = "Players: " + players + " | Sync window: " + syncWindow + " seconds";
  laneWrap.innerHTML = "";

  const bars = [];
  for (let i = 1; i <= players; i += 1) {
    const lane = document.createElement("div");
    lane.className = "lane";
    lane.innerHTML = '<div class="lane-head"><strong>Player ' + i + '</strong><span id="pct_' + i + '">0%</span></div><div class="progress"><div class="bar" id="bar_' + i + '"></div></div>';
    laneWrap.appendChild(lane);
    bars.push({
      bar: lane.querySelector(".bar"),
      pct: lane.querySelector("span"),
      value: 0
    });
  }

  const timer = setInterval(function () {
    let done = 0;

    bars.forEach(function (item) {
      if (item.value < 100) {
        const jump = 4 + Math.floor(Math.random() * 13);
        item.value = Math.min(100, item.value + jump);
        item.bar.style.width = item.value + "%";
        item.pct.textContent = item.value + "%";
      }
      if (item.value >= 100) {
        done += 1;
      }
    });

    if (done === bars.length) {
      clearInterval(timer);
    }
  }, 900);
}

function buildTournamentPlayers(size, seeding) {
  const base = ["Lebo", "Musa", "Nia", "Theo", "Aiden", "Ivy", "Sam", "Mpho", "Neo", "Kay", "Zoe", "Noah", "Liam", "Ava", "Mila", "Nova", "Rae", "Kian", "Ari", "Zane", "Maya", "Sia", "Nate", "Tariq", "Luca", "Yara", "Jade", "Nora", "Rami", "Piper", "Nico", "Elia"];
  const pool = base.slice(0, Math.max(8, Math.min(32, size)));

  if (seeding === "random") {
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = pool[i];
      pool[i] = pool[j];
      pool[j] = temp;
    }
    return pool;
  }

  if (seeding === "ranked") {
    return pool.sort();
  }

  return pool;
}

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function formatTime(value) {
  if (!value) {
    return "Now";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Now";
  }

  return date.toLocaleTimeString();
}
