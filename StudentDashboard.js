document.addEventListener("DOMContentLoaded", () => {
  const xpFill = document.querySelector(".xp-fill");
  const xpCurrent = document.getElementById("xpCurrent");
  const meters = Array.from(document.querySelectorAll(".meter-fill"));
  const activeNodeIcon = document.querySelector(".node.active i");

  if (!xpFill || !xpCurrent || !meters.length) {
    return;
  }

  const xpGoal = 3000;
  let xpValue = 2460;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function animateProgress() {
    const xpTarget = Number(xpFill.dataset.target) || 82;
    xpFill.style.width = xpTarget + "%";

    meters.forEach((meter) => {
      const target = Number(meter.dataset.target) || 0;
      meter.style.width = target + "%";
    });
  }

  function refreshXp() {
    const drift = Math.floor(Math.random() * 24) - 8;
    xpValue = clamp(xpValue + drift, 2300, 2995);
    const percent = Math.round((xpValue / xpGoal) * 100);
    xpCurrent.textContent = xpValue.toLocaleString();
    xpFill.style.width = percent + "%";
  }

  function pulseNode() {
    if (!activeNodeIcon) {
      return;
    }
    activeNodeIcon.style.transform = "scale(1.08)";
    setTimeout(() => {
      activeNodeIcon.style.transform = "scale(1)";
    }, 240);
  }

  animateProgress();
  setInterval(refreshXp, 2800);
  setInterval(pulseNode, 1500);
});

// -- Privilege display --------------------------------------------------------
(function loadStudentPrivileges() {
  const session = JSON.parse(localStorage.getItem("sp_session") || "null");
  if (!session) return;

  const card = document.getElementById("privilegesCard");
  const badgesEl = document.getElementById("privBadges");
  if (!card || !badgesEl) return;

  const privileges = JSON.parse(localStorage.getItem("sp_privileges") || "[]");
  const mine = privileges.filter(p => p.studentEmail === session.email);

  if (!mine.length) return;

  card.style.display = "";

  badgesEl.innerHTML = mine.map(p => `
    <div class="priv-grant-row">
      <span class="priv-grant-from"><i class="fa-solid fa-user-tie"></i> ${p.grantedByName || 'Teacher'}</span>
      <span class="priv-grant-perms">
        ${p.permissions.map(x => '<span class="priv-badge">' + x.replace('_',' ') + '</span>').join('')}
      </span>
    </div>
  `).join('');
})();

// -- Discipline display -------------------------------------------------------
(function loadStudentDiscipline() {
  const session = JSON.parse(localStorage.getItem("sp_session") || "null");
  if (!session || !session.email) return;

  const statusEl = document.getElementById("disciplineStatus");
  const pointsEl = document.getElementById("penaltyPointsTotal");
  const flagsEl = document.getElementById("activeFlagsCount");
  const logEl = document.getElementById("disciplineLog");

  if (!statusEl || !pointsEl || !flagsEl || !logEl) return;

  const normalize = (value) => String(value || "").trim().toLowerCase();
  const myEmail = normalize(session.email);

  const penalties = JSON.parse(localStorage.getItem("sp_penalties") || "[]")
    .filter((entry) => normalize(entry.studentEmail) === myEmail);
  const flags = JSON.parse(localStorage.getItem("sp_student_flags") || "[]")
    .filter((entry) => normalize(entry.studentEmail) === myEmail);
  const notes = JSON.parse(localStorage.getItem("sp_discipline_notes") || "[]")
    .filter((entry) => normalize(entry.studentEmail) === myEmail && entry.type === "warning");

  const activeSuspension = flags.find((entry) => Boolean(entry.suspended));
  const totalPenaltyPoints = penalties.reduce((sum, entry) => sum + Number(entry.points || 0), 0);
  const activeFlagsCount = flags.filter((entry) => Boolean(entry.suspended)).length;

  pointsEl.textContent = String(totalPenaltyPoints);
  flagsEl.textContent = String(activeFlagsCount);

  statusEl.classList.remove("warning", "alert");
  if (activeSuspension) {
    statusEl.classList.add("alert");
    statusEl.textContent = "Suspended";
  } else if (totalPenaltyPoints > 0 || notes.length > 0) {
    statusEl.classList.add("warning");
    statusEl.textContent = "Watchlist";
  } else {
    statusEl.textContent = "Good standing";
  }

  const logItems = [];

  if (activeSuspension) {
    const when = activeSuspension.updatedAt ? new Date(activeSuspension.updatedAt).toLocaleString() : "Recently";
    logItems.push(`
      <article class="discipline-item">
        <strong><i class="fa-solid fa-user-lock"></i> Suspension Active</strong>
        <p>${activeSuspension.reason || "Suspended by teacher"} | ${when}</p>
      </article>
    `);
  }

  if (penalties.length) {
    const recentPenalty = penalties[0];
    const when = recentPenalty.issuedAt ? new Date(recentPenalty.issuedAt).toLocaleString() : "Recently";
    logItems.push(`
      <article class="discipline-item">
        <strong><i class="fa-solid fa-triangle-exclamation"></i> Penalty Record</strong>
        <p>${recentPenalty.reason || "Penalty logged"} (-${Number(recentPenalty.points || 0)} pts) | ${when}</p>
      </article>
    `);
  }

  if (notes.length) {
    const recentWarning = notes[0];
    const when = recentWarning.createdAt ? new Date(recentWarning.createdAt).toLocaleString() : "Recently";
    logItems.push(`
      <article class="discipline-item">
        <strong><i class="fa-solid fa-bullhorn"></i> Warning Notice</strong>
        <p>${recentWarning.text || "Teacher warning issued"} | ${when}</p>
      </article>
    `);
  }

  if (!logItems.length) {
    logEl.innerHTML = '<p class="discipline-empty">No disciplinary actions on your record.</p>';
    return;
  }

  logEl.innerHTML = logItems.join("");
})();
