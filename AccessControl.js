(function () {
  const usersKey = "sp_users";
  const sessionKey = "sp_session";
  const privilegesKey = "sp_privileges";
  const penaltiesKey = "sp_penalties";
  const flagsKey = "sp_student_flags";
  const notesKey = "sp_discipline_notes";

  const grantEmailsEl = document.getElementById("grantEmails");
  const grantBtn = document.getElementById("grantBtn");
  const penaltyEmailEl = document.getElementById("penaltyEmail");
  const penaltyPointsEl = document.getElementById("penaltyPoints");
  const penaltyReasonEl = document.getElementById("penaltyReason");
  const penalizeBtn = document.getElementById("penalizeBtn");
  const modEmailEl = document.getElementById("modEmail");
  const modReasonEl = document.getElementById("modReason");
  const suspendBtn = document.getElementById("suspendBtn");
  const restoreBtn = document.getElementById("restoreBtn");
  const warnBtn = document.getElementById("warnBtn");
  const teacherStatusEl = document.getElementById("teacherStatus");

  const grantListEl = document.getElementById("grantList");
  const penaltyListEl = document.getElementById("penaltyList");
  const suspendListEl = document.getElementById("suspendList");
  const grantCountEl = document.getElementById("grantCount");
  const penaltyCountEl = document.getElementById("penaltyCount");
  const suspendCountEl = document.getElementById("suspendCount");
  const toastEl = document.getElementById("toast");

  const session = readJson(sessionKey, null);

  if (!session || session.role !== "teacher") {
    teacherStatusEl.textContent = "Unauthorized";
    teacherStatusEl.style.color = "#ffb0ca";
    teacherStatusEl.style.borderColor = "rgba(255, 92, 141, 0.45)";
    disableActions();
    toast("Only teachers can use this page.");
  } else {
    teacherStatusEl.textContent = "Teacher: " + (session.username || session.email || "Unknown");
  }

  grantBtn.addEventListener("click", grantAccess);
  penalizeBtn.addEventListener("click", applyPenalty);
  suspendBtn.addEventListener("click", function () { updateSuspension(true); });
  restoreBtn.addEventListener("click", function () { updateSuspension(false); });
  warnBtn.addEventListener("click", issueWarning);

  renderAll();
  applyInterventionPrefill();

  function disableActions() {
    [grantBtn, penalizeBtn, suspendBtn, restoreBtn, warnBtn].forEach(function (btn) {
      if (btn) {
        btn.disabled = true;
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
      }
    });
  }

  function applyInterventionPrefill() {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source");
    const student = normalizeEmail(params.get("student"));
    const reason = String(params.get("reason") || "").trim();
    const severity = String(params.get("severity") || "").trim();

    if (source !== "analytics" || !student) {
      return;
    }

    if (penaltyEmailEl) {
      penaltyEmailEl.value = student;
    }
    if (modEmailEl) {
      modEmailEl.value = student;
    }
    if (penaltyReasonEl && reason) {
      penaltyReasonEl.value = reason;
    }
    if (modReasonEl && reason) {
      modReasonEl.value = reason;
    }
    if (penaltyPointsEl && severity === "high") {
      penaltyPointsEl.value = "12";
    }

    toast("Intervention loaded for " + student + ".");

    if (modEmailEl) {
      modEmailEl.scrollIntoView({ behavior: "smooth", block: "center" });
      modEmailEl.focus();
    }
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || "") || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function getUsers() {
    const users = readJson(usersKey, []);
    return Array.isArray(users) ? users : [];
  }

  function getStudentByEmail(email) {
    const clean = normalizeEmail(email);
    const users = getUsers();
    return users.find(function (u) {
      return normalizeEmail(u.email) === clean && u.role === "student";
    });
  }

  function selectedPermissions() {
    return Array.from(document.querySelectorAll('.check-grid input[type="checkbox"]:checked')).map(function (node) {
      return node.value;
    });
  }

  function grantAccess() {
    if (!session || session.role !== "teacher") {
      toast("Teacher session required.");
      return;
    }

    const raw = grantEmailsEl.value || "";
    const emails = raw.split(/[\n,;]+/).map(normalizeEmail).filter(Boolean);
    const uniqueEmails = Array.from(new Set(emails));
    const perms = selectedPermissions();

    if (!uniqueEmails.length) {
      toast("Enter at least one student email.");
      return;
    }
    if (!perms.length) {
      toast("Select at least one permission.");
      return;
    }

    let privileges = readJson(privilegesKey, []);
    let grantedCount = 0;
    const invalid = [];

    uniqueEmails.forEach(function (email) {
      const student = getStudentByEmail(email);
      if (!student) {
        invalid.push(email);
        return;
      }

      const idx = privileges.findIndex(function (p) {
        return p.grantedByTeacherId === session.id && normalizeEmail(p.studentEmail) === email;
      });

      if (idx > -1) {
        const merged = Array.from(new Set([].concat(privileges[idx].permissions || [], perms)));
        privileges[idx].permissions = merged;
        privileges[idx].updatedAt = Date.now();
      } else {
        privileges.push({
          id: "priv_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
          grantedByTeacherId: session.id,
          grantedByName: session.username || session.email,
          studentEmail: email,
          studentId: student.id,
          permissions: perms,
          grantedAt: Date.now()
        });
      }
      grantedCount += 1;
    });

    writeJson(privilegesKey, privileges);
    renderPrivileges();

    grantEmailsEl.value = "";
    document.querySelectorAll('.check-grid input[type="checkbox"]').forEach(function (box) {
      box.checked = false;
    });

    let msg = "Granted or updated access for " + grantedCount + " student(s).";
    if (invalid.length) {
      msg += " Missing student account: " + invalid.join(", ");
    }
    toast(msg);
  }

  function applyPenalty() {
    if (!session || session.role !== "teacher") {
      toast("Teacher session required.");
      return;
    }

    const email = normalizeEmail(penaltyEmailEl.value);
    const points = Number(penaltyPointsEl.value);
    const reason = String(penaltyReasonEl.value || "").trim();

    if (!email) {
      toast("Enter a student email for penalty.");
      return;
    }
    if (!getStudentByEmail(email)) {
      toast("No student found for that email.");
      return;
    }
    if (!Number.isFinite(points) || points < 1) {
      toast("Penalty points must be at least 1.");
      return;
    }
    if (!reason) {
      toast("Add a reason for the penalty.");
      return;
    }

    const penalties = readJson(penaltiesKey, []);
    penalties.unshift({
      id: "pen_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      studentEmail: email,
      points: Math.round(points),
      reason: reason,
      issuedByTeacherId: session.id,
      issuedByName: session.username || session.email,
      issuedAt: Date.now(),
      active: true
    });

    writeJson(penaltiesKey, penalties);
    renderPenalties();

    penaltyEmailEl.value = "";
    penaltyPointsEl.value = "5";
    penaltyReasonEl.value = "";

    toast("Penalty applied to " + email + ".");
  }

  function updateSuspension(suspend) {
    if (!session || session.role !== "teacher") {
      toast("Teacher session required.");
      return;
    }

    const email = normalizeEmail(modEmailEl.value);
    const reason = String(modReasonEl.value || "").trim();

    if (!email) {
      toast("Enter a student email first.");
      return;
    }
    if (!getStudentByEmail(email)) {
      toast("No student found for that email.");
      return;
    }

    const flags = readJson(flagsKey, []);
    const idx = flags.findIndex(function (f) {
      return normalizeEmail(f.studentEmail) === email;
    });

    const payload = {
      id: idx > -1 ? flags[idx].id : "flag_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      studentEmail: email,
      suspended: suspend,
      reason: reason || (suspend ? "Suspended by teacher" : "Restored by teacher"),
      updatedByTeacherId: session.id,
      updatedByName: session.username || session.email,
      updatedAt: Date.now()
    };

    if (idx > -1) {
      flags[idx] = payload;
    } else {
      flags.push(payload);
    }

    writeJson(flagsKey, flags);
    renderSuspensions();

    toast((suspend ? "Suspended: " : "Restored: ") + email);
  }

  function issueWarning() {
    if (!session || session.role !== "teacher") {
      toast("Teacher session required.");
      return;
    }

    const email = normalizeEmail(modEmailEl.value);
    const reason = String(modReasonEl.value || "").trim();

    if (!email) {
      toast("Enter a student email first.");
      return;
    }
    if (!getStudentByEmail(email)) {
      toast("No student found for that email.");
      return;
    }
    if (!reason) {
      toast("Add a warning note.");
      return;
    }

    const notes = readJson(notesKey, []);
    notes.unshift({
      id: "note_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      studentEmail: email,
      type: "warning",
      text: reason,
      createdByTeacherId: session.id,
      createdByName: session.username || session.email,
      createdAt: Date.now()
    });

    writeJson(notesKey, notes);
    toast("Warning logged for " + email + ".");
  }

  function revokePrivilege(id) {
    const privileges = readJson(privilegesKey, []).filter(function (p) {
      return p.id !== id;
    });
    writeJson(privilegesKey, privileges);
    renderPrivileges();
  }

  function clearPenalty(id) {
    const penalties = readJson(penaltiesKey, []).filter(function (p) {
      return p.id !== id;
    });
    writeJson(penaltiesKey, penalties);
    renderPenalties();
  }

  function renderAll() {
    renderPrivileges();
    renderPenalties();
    renderSuspensions();
  }

  function renderPrivileges() {
    const all = readJson(privilegesKey, []);
    const mine = session && session.id ? all.filter(function (p) { return p.grantedByTeacherId === session.id; }) : [];

    grantCountEl.textContent = String(mine.length);

    if (!mine.length) {
      grantListEl.innerHTML = '<p class="muted-empty">No grants yet.</p>';
      return;
    }

    grantListEl.innerHTML = mine.map(function (entry) {
      const tags = (entry.permissions || []).map(function (perm) {
        return '<span class="tag">' + perm.replace(/_/g, " ") + '</span>';
      }).join("");

      return '' +
        '<article class="row-item">' +
          '<div class="row-main">' +
            '<strong class="row-title">' + escapeHtml(entry.studentEmail) + '</strong>' +
            '<div class="tag-group">' + tags + '</div>' +
          '</div>' +
          '<button class="btn danger" data-revoke="' + entry.id + '"><i class="fa-solid fa-xmark"></i> Revoke</button>' +
        '</article>';
    }).join("");

    grantListEl.querySelectorAll("[data-revoke]").forEach(function (button) {
      button.addEventListener("click", function () {
        revokePrivilege(button.getAttribute("data-revoke"));
      });
    });
  }

  function renderPenalties() {
    const all = readJson(penaltiesKey, []);
    const mine = session && session.id ? all.filter(function (p) { return p.issuedByTeacherId === session.id; }) : [];

    penaltyCountEl.textContent = String(mine.length);

    if (!mine.length) {
      penaltyListEl.innerHTML = '<p class="muted-empty">No penalties logged yet.</p>';
      return;
    }

    penaltyListEl.innerHTML = mine.map(function (entry) {
      const when = new Date(entry.issuedAt).toLocaleString();
      return '' +
        '<article class="row-item">' +
          '<div class="row-main">' +
            '<strong class="row-title">' + escapeHtml(entry.studentEmail) + ' (-' + Number(entry.points) + ' pts)</strong>' +
            '<span class="row-sub">' + escapeHtml(entry.reason) + ' | ' + escapeHtml(when) + '</span>' +
          '</div>' +
          '<button class="btn ok" data-clear-penalty="' + entry.id + '"><i class="fa-solid fa-check"></i> Clear</button>' +
        '</article>';
    }).join("");

    penaltyListEl.querySelectorAll("[data-clear-penalty]").forEach(function (button) {
      button.addEventListener("click", function () {
        clearPenalty(button.getAttribute("data-clear-penalty"));
      });
    });
  }

  function renderSuspensions() {
    const all = readJson(flagsKey, []);
    const active = all.filter(function (f) {
      return Boolean(f.suspended);
    });

    suspendCountEl.textContent = String(active.length);

    if (!active.length) {
      suspendListEl.innerHTML = '<p class="muted-empty">No active suspensions.</p>';
      return;
    }

    suspendListEl.innerHTML = active.map(function (entry) {
      const when = new Date(entry.updatedAt).toLocaleString();
      return '' +
        '<article class="row-item">' +
          '<div class="row-main">' +
            '<strong class="row-title">' + escapeHtml(entry.studentEmail) + '</strong>' +
            '<span class="row-sub">' + escapeHtml(entry.reason || "Suspended") + ' | ' + escapeHtml(when) + '</span>' +
          '</div>' +
          '<button class="btn ok" data-restore="' + escapeHtml(entry.studentEmail) + '"><i class="fa-solid fa-unlock"></i> Restore</button>' +
        '</article>';
    }).join("");

    suspendListEl.querySelectorAll("[data-restore]").forEach(function (button) {
      button.addEventListener("click", function () {
        modEmailEl.value = button.getAttribute("data-restore");
        modReasonEl.value = "Restored by teacher action.";
        updateSuspension(false);
      });
    });
  }

  function escapeHtml(input) {
    return String(input)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  let toastTimer = null;
  function toast(message) {
    if (!toastEl) {
      return;
    }
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2800);
  }
})();
