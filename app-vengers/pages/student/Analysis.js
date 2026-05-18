// Analytics Page Interactive Functionality

const CLASS_KEY = "sp_classes";
const ACTIVITY_KEY = "sp_class_activities";
const PROGRESS_KEY = "sp_class_progress";
const USERS_KEY = "sp_users";
const NOTES_KEY = "sp_discipline_notes";
let hasOpsAnalyticsData = false;

document.addEventListener("DOMContentLoaded", function () {
  setupReportToggle();
  renderClassOpsAnalytics();
  initializeAnalytics();
});

// Initialize all analytics features
function initializeAnalytics() {
  animateProgressBars();
  setupLeaderboardInteractivity();
  setupChartInteractivity();
  setupBadgeInteractivity();
  setupMilestoneInteractivity();
  startLiveUpdates();
}

function setupReportToggle() {
  const btn = document.getElementById("reportBtn");
  const reportSection = document.getElementById("fullReportSection");

  if (!btn || !reportSection) {
    return;
  }

  btn.addEventListener("click", function (event) {
    event.preventDefault();
    reportSection.classList.toggle("hidden");
    btn.textContent = reportSection.classList.contains("hidden")
      ? "View Full Report"
      : "Hide Full Report";
  });
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function renderClassOpsAnalytics() {
  const classes = readJson(CLASS_KEY, []);
  const activities = readJson(ACTIVITY_KEY, []);
  const progress = readJson(PROGRESS_KEY, []);

  hasOpsAnalyticsData = classes.length > 0;

  updateKpiCards(classes, activities, progress);
  updateWeeklyBars(progress, activities);
  renderClassFilter(classes);
  renderClassHealth(classes, progress, activities);
  renderRecentActivities(activities, classes);
  renderActivityTrend(classes, activities, progress);
  renderRiskStudents(classes, progress);
  renderStudentOutcomes(classes, progress);
  renderDynamicLeaderboard(progress);
}

function updateKpiCards(classes, activities, progress) {
  const totalSessionsNode = document.getElementById("totalSessionsValue");
  const avgSessionTimeNode = document.getElementById("avgSessionTime");
  const completionRateNode = document.getElementById("completionRateValue");
  const weeklyEngagementNode = document.getElementById("weeklyEngagementValue");
  const activeUsersNode = document.getElementById("activeUsersValue");
  const goalFill = document.getElementById("goalProgressFill");
  const goalText = document.getElementById("goalProgressText");
  const progressLabel = document.getElementById("progressLabel");
  const streakNode = document.getElementById("streakValue");
  const todayTimeNode = document.getElementById("todayTimeValue");

  const uniqueStudents = new Set();
  classes.forEach(function (item) {
    (item.students || []).forEach(function (email) {
      uniqueStudents.add(normalizeEmail(email));
    });
  });

  // Pull real tracker stats when available
  const tracker = readJson("spProgressTracker", null);
  const today = new Date().toISOString().slice(0, 10);

  const totalSessions = tracker
    ? tracker.gameSessions.length
    : progress.length;

  const avgCompletion = progress.length
    ? Math.round(
        progress.reduce(function (sum, row) {
          return sum + Number(row.completion || 0);
        }, 0) / progress.length,
      )
    : 0;
  const avgScore = progress.length
    ? Math.round(
        progress.reduce(function (sum, row) {
          return sum + Number(row.score || 0);
        }, 0) / progress.length,
      )
    : 0;

  // Use real today time if tracker is present, otherwise estimate
  const todayMs = tracker && tracker.dailyTime ? (tracker.dailyTime[today] || 0) : 0;
  const todayMinutes = Math.round(todayMs / 60_000);
  const todaySecs = Math.round((todayMs % 60_000) / 1_000);

  const estimatedMinutes = todayMs > 0 ? todayMinutes : Math.max(8, Math.round(10 + avgCompletion / 7));
  const estimatedSeconds = todayMs > 0 ? todaySecs : Math.round((avgScore % 10) * 6);
  const weeklyEngagement = Math.min(100, Math.round((avgCompletion * 0.65 + avgScore * 0.35) || 0));
  const streak = tracker ? (tracker.streak || 0) : 0;

  if (totalSessionsNode) {
    totalSessionsNode.textContent = String(totalSessions);
  }
  if (avgSessionTimeNode) {
    avgSessionTimeNode.textContent =
      String(estimatedMinutes) + "m " + String(estimatedSeconds).padStart(2, "0") + "s";
  }
  if (streakNode) {
    streakNode.textContent = streak + (streak === 1 ? " day" : " days");
  }
  if (todayTimeNode) {
    const todayLabel = todayMs > 0
      ? String(todayMinutes) + "m " + String(todaySecs).padStart(2, "0") + "s"
      : "0m 00s";
    todayTimeNode.textContent = todayLabel;
  }
  if (completionRateNode) {
    completionRateNode.textContent = avgCompletion + "%";
  }
  if (weeklyEngagementNode) {
    weeklyEngagementNode.textContent = weeklyEngagement + "%";
  }
  if (activeUsersNode) {
    activeUsersNode.textContent = String(uniqueStudents.size);
  }
  if (goalFill) {
    goalFill.style.width = Math.min(avgCompletion, 100) + "%";
  }
  if (goalText) {
    goalText.textContent = avgCompletion + " / 100 completion target";
  }
  if (progressLabel) {
    progressLabel.textContent = "Class completion objective";
  }
}

function updateWeeklyBars(progress, activities) {
  const dayClassMap = {
    0: "bar-sun",
    1: "bar-mon",
    2: "bar-tue",
    3: "bar-wed",
    4: "bar-thu",
    5: "bar-fri",
    6: "bar-sat",
  };

  const dayCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  // Prefer real daily time data from ProgressTracker
  const tracker = readJson("spProgressTracker", null);
  if (tracker && tracker.dailyTime && Object.keys(tracker.dailyTime).length > 0) {
    // Use time in minutes for each day; cap at last 7 days
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayIdx = d.getDay();
      dayCounts[dayIdx] = Math.round((tracker.dailyTime[key] || 0) / 60_000); // minutes
    }
  } else {
    // Fallback: count sessions per day from progress/activities
    progress.forEach(function (row) {
      const date = new Date(row.updatedAt || row.createdAt || Date.now());
      dayCounts[date.getDay()] += 1;
    });

    activities.forEach(function (row) {
      const date = new Date(row.createdAt || Date.now());
      dayCounts[date.getDay()] += 2;
    });
  }

  const maxCount = Math.max(
    dayCounts[0],
    dayCounts[1],
    dayCounts[2],
    dayCounts[3],
    dayCounts[4],
    dayCounts[5],
    dayCounts[6],
    1,
  );

  Object.keys(dayCounts).forEach(function (dayKey) {
    const className = dayClassMap[Number(dayKey)];
    const barNode = document.querySelector("." + className);
    if (!barNode) {
      return;
    }

    const normalized = Math.round((dayCounts[dayKey] / maxCount) * 100);
    barNode.style.height = Math.max(16, normalized) + "%";
  });
}

function renderClassFilter(classes) {
  const filter = document.getElementById("classFilter");
  if (!filter) {
    return;
  }

  if (!classes.length) {
    filter.innerHTML = '<option value="">No classes</option>';
    return;
  }

  filter.innerHTML = '<option value="all">All classes</option>' + classes
    .map(function (item) {
      return '<option value="' + item.id + '">' + item.name + " (" + item.code + ")</option>';
    })
    .join("");

  filter.addEventListener("change", function () {
    const activities = readJson(ACTIVITY_KEY, []);
    const progress = readJson(PROGRESS_KEY, []);
    renderClassHealth(classes, progress, activities);
    renderActivityTrend(classes, activities, progress);
    renderRiskStudents(classes, progress);
    renderStudentOutcomes(classes, progress);
  });
}

function getScopedProgress(progress) {
  const selectedClassId = getSelectedClassId();
  return selectedClassId
    ? progress.filter(function (row) { return row.classId === selectedClassId; })
    : progress;
}

function aggregateStudentPerformance(classes, progress) {
  const classMap = {};
  classes.forEach(function (item) {
    classMap[item.id] = item.name;
  });

  const scopedProgress = getScopedProgress(progress);
  const aggregate = {};

  scopedProgress.forEach(function (row) {
    const email = normalizeEmail(row.studentEmail);
    if (!aggregate[email]) {
      aggregate[email] = {
        email: email,
        classId: row.classId,
        completionTotal: 0,
        scoreTotal: 0,
        count: 0,
      };
    }

    aggregate[email].completionTotal += Number(row.completion || 0);
    aggregate[email].scoreTotal += Number(row.score || 0);
    aggregate[email].count += 1;
  });

  return Object.values(aggregate).map(function (item) {
    const avgCompletion = Math.round(item.completionTotal / Math.max(item.count, 1));
    const avgScore = Math.round(item.scoreTotal / Math.max(item.count, 1));
    const momentum = Math.round(avgCompletion * 0.45 + avgScore * 0.55);

    return {
      email: item.email,
      classId: item.classId,
      className: classMap[item.classId] || "Unknown class",
      avgCompletion: avgCompletion,
      avgScore: avgScore,
      momentum: momentum,
    };
  });
}

function renderStudentOutcomes(classes, progress) {
  const topList = document.getElementById("topStudentsList");
  const helpList = document.getElementById("helpStudentsList");
  const supportList = document.getElementById("supportActionsList");

  if (!topList || !helpList || !supportList) {
    return;
  }

  const students = aggregateStudentPerformance(classes, progress);

  if (!students.length) {
    topList.innerHTML = '<p class="intel-empty">No student performance data yet.</p>';
    helpList.innerHTML = '<p class="intel-empty">No student performance data yet.</p>';
    supportList.innerHTML = '<p class="intel-empty">No recommendations available yet.</p>';
    return;
  }

  const topPerformers = students
    .slice()
    .sort(function (a, b) { return b.momentum - a.momentum; })
    .slice(0, 6);

  topList.innerHTML = topPerformers.map(function (item) {
    return ""
      + '<div class="outcome-row">'
      + '  <div class="outcome-main">'
      + '    <strong>' + item.email + '</strong>'
      + '    <span>' + item.className + ' | Completion ' + item.avgCompletion + '%</span>'
      + '  </div>'
      + '  <span class="outcome-score">Score ' + item.avgScore + '%</span>'
      + '</div>';
  }).join("");

  const needHelp = students
    .filter(function (item) {
      return item.avgScore < 70 || item.avgCompletion < 65;
    })
    .sort(function (a, b) {
      return (a.avgScore + a.avgCompletion) - (b.avgScore + b.avgCompletion);
    })
    .slice(0, 8);

  if (!needHelp.length) {
    helpList.innerHTML = '<p class="intel-empty">No students currently need extra support.</p>';
  } else {
    helpList.innerHTML = needHelp.map(function (item) {
      const severity = item.avgScore < 50 || item.avgCompletion < 45 ? "high" : "medium";
      const severityLabel = severity === "high" ? "Urgent" : "Monitor";
      return ""
        + '<div class="outcome-row">'
        + '  <div class="outcome-main">'
        + '    <strong>' + item.email + '</strong>'
        + '    <span>' + item.className + ' | Completion ' + item.avgCompletion + '% | Score ' + item.avgScore + '%</span>'
        + '  </div>'
        + '  <div class="risk-actions">'
        + '    <span class="assist-chip ' + severity + '">' + severityLabel + '</span>'
        + '    <button class="plan-link" data-plan-email="' + item.email + '" data-plan-class="' + item.classId + '" data-plan-severity="' + severity + '"><i class="fa-solid fa-notes-medical"></i> Create Plan</button>'
        + '  </div>'
        + '</div>';
    }).join("");

    helpList.querySelectorAll("[data-plan-email]").forEach(function (button) {
      button.addEventListener("click", function () {
        const email = button.getAttribute("data-plan-email") || "";
        const classId = button.getAttribute("data-plan-class") || "";
        const severity = button.getAttribute("data-plan-severity") || "medium";
        createInterventionPlan(email, classId, severity);
      });
    });
  }

  const recommendationRows = buildSupportRecommendations(students);
  supportList.innerHTML = recommendationRows.map(function (item) {
    return ""
      + '<div class="outcome-row">'
      + '  <div class="outcome-main">'
      + '    <strong>' + item.title + '</strong>'
      + '    <span>' + item.detail + '</span>'
      + '  </div>'
      + '  <span class="assist-chip ' + item.level + '">' + item.badge + '</span>'
      + '</div>';
  }).join("");
}

function createInterventionPlan(studentEmail, classId, severity) {
  const classes = readJson(CLASS_KEY, []);
  const activities = readJson(ACTIVITY_KEY, []);
  const progress = readJson(PROGRESS_KEY, []);

  const classItem = classes.find(function (item) {
    return item.id === classId;
  });

  if (!classItem) {
    showNotification("Unable to create plan: class not found.");
    return;
  }

  const due = new Date();
  due.setDate(due.getDate() + (severity === "high" ? 3 : 7));
  const dueDate = due.toISOString().slice(0, 10);

  const existing = activities.find(function (activity) {
    return activity.classId === classId
      && activity.interventionFor === studentEmail
      && activity.status !== "completed";
  });

  if (existing) {
    showNotification("Intervention plan already exists for this student.");
    return;
  }

  const titlePrefix = severity === "high" ? "Priority Recovery Plan" : "Support Recovery Plan";
  const newActivity = {
    id: "act_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    classId: classId,
    type: "intervention",
    title: titlePrefix + " - " + studentEmail,
    points: severity === "high" ? 40 : 25,
    dueDate: dueDate,
    quizConfig: null,
    interventionFor: studentEmail,
    interventionSeverity: severity,
    status: "active",
    createdAt: Date.now(),
  };

  activities.push(newActivity);
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activities));

  const hasSeed = progress.some(function (row) {
    return row.activityId === newActivity.id && normalizeEmail(row.studentEmail) === normalizeEmail(studentEmail);
  });

  if (!hasSeed) {
    progress.push({
      id: "prog_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      classId: classId,
      activityId: newActivity.id,
      studentEmail: normalizeEmail(studentEmail),
      completion: 0,
      score: 0,
      updatedAt: Date.now(),
    });
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  }

  showNotification("Intervention plan created for " + studentEmail + " in " + classItem.name + ".");
  renderClassOpsAnalytics();
}

function buildSupportRecommendations(students) {
  const highRisk = students.filter(function (item) {
    return item.avgScore < 50 || item.avgCompletion < 45;
  }).length;

  const mediumRisk = students.filter(function (item) {
    return (item.avgScore < 70 || item.avgCompletion < 65) && !(item.avgScore < 50 || item.avgCompletion < 45);
  }).length;

  const topCount = students.filter(function (item) {
    return item.avgScore >= 85 && item.avgCompletion >= 85;
  }).length;

  const rows = [];

  rows.push({
    title: "Priority Intervention Queue",
    detail: highRisk + " student(s) require immediate one-to-one support or guardian contact.",
    badge: highRisk > 0 ? "High" : "Stable",
    level: highRisk > 0 ? "high" : "low",
  });

  rows.push({
    title: "Weekly Coaching Group",
    detail: mediumRisk + " student(s) should join focused revision sessions this week.",
    badge: mediumRisk > 0 ? "Medium" : "Ready",
    level: mediumRisk > 0 ? "medium" : "low",
  });

  rows.push({
    title: "Peer Mentor Candidates",
    detail: topCount + " high performers can mentor classmates in weak modules.",
    badge: topCount > 0 ? "Opportunity" : "Pending",
    level: "low",
  });

  return rows;
}

function getSelectedClassId() {
  const filter = document.getElementById("classFilter");
  if (!filter || !filter.value || filter.value === "all") {
    return null;
  }
  return filter.value;
}

function renderClassHealth(classes, progress, activities) {
  const list = document.getElementById("classHealthList");
  const filter = document.getElementById("classFilter");
  if (!list) {
    return;
  }

  if (!classes.length) {
    list.innerHTML = '<p class="intel-empty">No class data available yet.</p>';
    return;
  }

  const selected = filter ? filter.value : "all";
  const targetClasses = selected && selected !== "all"
    ? classes.filter(function (item) { return item.id === selected; })
    : classes;

  list.innerHTML = targetClasses
    .map(function (classItem) {
      const classActivities = activities.filter(function (activity) {
        return activity.classId === classItem.id;
      });

      const classProgress = progress.filter(function (row) {
        return row.classId === classItem.id;
      });

      const completion = classProgress.length
        ? Math.round(
            classProgress.reduce(function (sum, row) {
              return sum + Number(row.completion || 0);
            }, 0) / classProgress.length,
          )
        : 0;

      const score = classProgress.length
        ? Math.round(
            classProgress.reduce(function (sum, row) {
              return sum + Number(row.score || 0);
            }, 0) / classProgress.length,
          )
        : 0;

      return ""
        + '<div class="intel-row">'
        + '  <strong>' + classItem.name + " (" + classItem.code + ")</strong>'
        + '  <span>' + classItem.students.length + " students | " + classActivities.length + " activities | Completion " + completion + "% | Score " + score + '%</span>'
        + '</div>';
    })
    .join("");
}

function renderRecentActivities(activities, classes) {
  const list = document.getElementById("recentActivitiesList");
  if (!list) {
    return;
  }

  if (!activities.length) {
    list.innerHTML = '<p class="intel-empty">No activities planned yet.</p>';
    return;
  }

  const sorted = activities
    .slice()
    .sort(function (a, b) {
      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    })
    .slice(0, 8);

  list.innerHTML = sorted
    .map(function (activity) {
      const classItem = classes.find(function (item) {
        return item.id === activity.classId;
      });
      const className = classItem ? classItem.name : "Unknown class";
      const due = activity.dueDate ? "Due " + activity.dueDate : "No deadline";

      return ""
        + '<div class="intel-row">'
        + '  <strong>' + activity.title + " [" + activity.type + "]</strong>'
        + '  <span>' + className + " | " + due + " | " + activity.points + " pts</span>'
        + '</div>';
    })
    .join("");
}

function renderActivityTrend(classes, activities, progress) {
  const list = document.getElementById("activityTrendList");
  if (!list) {
    return;
  }

  const selectedClassId = getSelectedClassId();
  const scopedActivities = selectedClassId
    ? activities.filter(function (item) { return item.classId === selectedClassId; })
    : activities;

  if (!scopedActivities.length) {
    list.innerHTML = '<p class="intel-empty">No activity trend data available.</p>';
    return;
  }

  const rows = scopedActivities
    .slice()
    .sort(function (a, b) {
      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    })
    .slice(0, 8)
    .map(function (activity) {
      const classItem = classes.find(function (item) {
        return item.id === activity.classId;
      });
      const activityProgress = progress.filter(function (row) {
        return row.activityId === activity.id;
      });

      const avgCompletion = activityProgress.length
        ? Math.round(
            activityProgress.reduce(function (sum, row) {
              return sum + Number(row.completion || 0);
            }, 0) / activityProgress.length,
          )
        : 0;

      return {
        title: activity.title,
        className: classItem ? classItem.name : "Unknown class",
        completion: Math.max(0, Math.min(100, avgCompletion)),
      };
    });

  list.innerHTML = rows
    .map(function (row) {
      return ""
        + '<div class="trend-row">'
        + '  <div class="trend-head">'
        + '    <strong>' + row.title + '</strong>'
        + '    <span>' + row.className + " | " + row.completion + '%</span>'
        + '  </div>'
        + '  <div class="trend-track"><div class="trend-fill" style="width:' + row.completion + '%"></div></div>'
        + '</div>';
    })
    .join("");
}

function renderRiskStudents(classes, progress) {
  const list = document.getElementById("riskStudentsList");
  if (!list) {
    return;
  }

  const selectedClassId = getSelectedClassId();
  const targetProgress = selectedClassId
    ? progress.filter(function (row) { return row.classId === selectedClassId; })
    : progress;

  if (!targetProgress.length) {
    list.innerHTML = '<p class="intel-empty">No performance risk data yet.</p>';
    return;
  }

  const classMap = {};
  classes.forEach(function (item) {
    classMap[item.id] = item.name;
  });

  const aggregate = {};
  targetProgress.forEach(function (row) {
    const email = normalizeEmail(row.studentEmail);
    if (!aggregate[email]) {
      aggregate[email] = {
        email: email,
        classId: row.classId,
        scoreSum: 0,
        completionSum: 0,
        count: 0,
      };
    }
    aggregate[email].scoreSum += Number(row.score || 0);
    aggregate[email].completionSum += Number(row.completion || 0);
    aggregate[email].count += 1;
  });

  const risky = Object.values(aggregate)
    .map(function (item) {
      const avgScore = Math.round(item.scoreSum / Math.max(item.count, 1));
      const avgCompletion = Math.round(item.completionSum / Math.max(item.count, 1));
      const severity = avgScore < 50 || avgCompletion < 45 ? "high" : "medium";
      const className = classMap[item.classId] || "Unknown class";

      return {
        email: item.email,
        className: className,
        avgScore: avgScore,
        avgCompletion: avgCompletion,
        severity: severity,
      };
    })
    .filter(function (item) {
      return item.avgScore < 70 || item.avgCompletion < 65;
    })
    .sort(function (a, b) {
      return a.avgScore + a.avgCompletion - (b.avgScore + b.avgCompletion);
    })
    .slice(0, 10);

  if (!risky.length) {
    list.innerHTML = '<p class="intel-empty">No at-risk students in the current filter.</p>';
    return;
  }

  list.innerHTML = risky
    .map(function (item) {
      const severityLabel = item.severity === "high" ? "High Risk" : "Medium Risk";
      const suggestedReason =
        item.severity === "high"
          ? "Critical performance risk: intervention required"
          : "Performance watchlist: follow-up needed";
      const interventionHref =
        "AccessControl.html?student="
        + encodeURIComponent(item.email)
        + "&reason="
        + encodeURIComponent(suggestedReason)
        + "&severity="
        + encodeURIComponent(item.severity)
        + "&source=analytics";
      return ""
        + '<div class="intel-row">'
        + '  <strong>' + item.email + '</strong>'
        + '  <span>' + item.className + " | Score " + item.avgScore + "% | Completion " + item.avgCompletion + '%</span>'
        + '  <div class="risk-actions">'
        + '    <span class="risk-chip ' + item.severity + '">' + severityLabel + '</span>'
        + '    <a class="intervene-link" href="' + interventionHref + '"><i class="fa-solid fa-arrow-up-right-from-square"></i> Intervene</a>'
        + '    <button class="contact-link" data-contact-email="' + item.email + '" data-contact-severity="' + item.severity + '"><i class="fa-solid fa-paper-plane"></i> Message Contact</button>'
        + '  </div>'
        + '</div>';
    })
    .join("");

  list.querySelectorAll("[data-contact-email]").forEach(function (button) {
    button.addEventListener("click", function () {
      const email = button.getAttribute("data-contact-email") || "";
      const severity = button.getAttribute("data-contact-severity") || "medium";
      sendPerformanceContactMessage(email, severity);
    });
  });
}

function sendPerformanceContactMessage(studentEmail, severity) {
  const users = readJson(USERS_KEY, []);
  const notes = readJson(NOTES_KEY, []);
  const session = readJson("sp_session", null);
  const normalizedEmail = normalizeEmail(studentEmail);

  const student = users.find(function (user) {
    return normalizeEmail(user.email) === normalizedEmail && user.role === "student";
  });

  if (!student) {
    showNotification("Unable to send contact note: student profile not found.");
    return;
  }

  const age = resolveStudentAge(student, users);
  if (!Number.isFinite(age)) {
    showNotification("Contact cancelled: age is required to route the message.");
    return;
  }

  const toParent = age < 18;
  const contactTarget = toParent ? "parent/guardian" : "student";
  const reason =
    severity === "high"
      ? "Critical performance alert from analytics"
      : "Performance watchlist update from analytics";

  notes.unshift({
    id: "note_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    studentEmail: normalizedEmail,
    type: toParent ? "parent_contact" : "student_contact",
    target: contactTarget,
    text: reason,
    severity: severity,
    createdByTeacherId: session && session.id ? session.id : "unknown_teacher",
    createdByName: session && (session.username || session.email) ? (session.username || session.email) : "Teacher",
    createdAt: Date.now(),
  });

  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));

  showNotification(
    toParent
      ? "Message routed to parent/guardian (student is under 18)."
      : "Message routed directly to the student (18+).",
  );
}

function resolveStudentAge(student, users) {
  if (Number.isFinite(Number(student.age))) {
    return Number(student.age);
  }

  const dobRaw = student.dateOfBirth || student.birthDate || student.dob || "";
  if (dobRaw) {
    const ageFromDob = getAgeFromDateString(dobRaw);
    if (Number.isFinite(ageFromDob)) {
      return ageFromDob;
    }
  }

  const promptValue = window.prompt("Enter age for " + student.email + " to route the message correctly:", "17");
  if (promptValue === null) {
    return NaN;
  }

  const parsedAge = Number(promptValue);
  if (!Number.isFinite(parsedAge) || parsedAge < 1 || parsedAge > 120) {
    showNotification("Invalid age entered. Please try again.");
    return NaN;
  }

  const userIndex = users.findIndex(function (item) {
    return item.id === student.id;
  });

  if (userIndex > -1) {
    users[userIndex].age = Math.round(parsedAge);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  return Math.round(parsedAge);
}

function getAgeFromDateString(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return NaN;
  }

  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  const dayDiff = now.getDate() - date.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age;
}

function renderDynamicLeaderboard(progress) {
  const body = document.getElementById("leaderboardBody");
  if (!body) {
    return;
  }

  if (!progress.length) {
    body.innerHTML =
      '<div class="leaderboard-entry"><div class="rank">-</div><div class="user-info"><span class="avatar">📭</span><span>No data yet</span></div><div class="score">0</div><div class="streak">0 days</div></div>';
    return;
  }

  const aggregate = {};
  progress.forEach(function (row) {
    const email = normalizeEmail(row.studentEmail);
    if (!aggregate[email]) {
      aggregate[email] = {
        email: email,
        points: 0,
        entries: 0,
        completion: 0,
      };
    }
    aggregate[email].points += Number(row.score || 0);
    aggregate[email].completion += Number(row.completion || 0);
    aggregate[email].entries += 1;
  });

  const ranked = Object.values(aggregate)
    .sort(function (a, b) {
      return b.points - a.points;
    })
    .slice(0, 10);

  body.innerHTML = ranked
    .map(function (item, index) {
      const avgCompletion = Math.round(item.completion / Math.max(item.entries, 1));
      const streak = Math.max(3, Math.min(30, Math.round(avgCompletion / 4)));
      const rankClass = index === 0 ? " rank-1" : index === 1 ? " rank-2" : index === 2 ? " rank-3" : "";

      return ""
        + '<div class="leaderboard-entry' + rankClass + '">'
        + '  <div class="rank">' + String(index + 1) + '</div>'
        + '  <div class="user-info"><span class="avatar">🎓</span><span>' + item.email + '</span></div>'
        + '  <div class="score">' + Math.round(item.points) + '</div>'
        + '  <div class="streak">' + streak + ' days 🔥</div>'
        + '</div>';
    })
    .join("");
}

// Animate progress bars on page load
function animateProgressBars() {
  const progressBars = document.querySelectorAll(".progress-bar");

  progressBars.forEach((bar) => {
    const fill = bar.querySelector(".progress-fill");
    const targetWidth = fill.style.width;

    // Reset to 0
    fill.style.width = "0%";
    fill.style.transition = "none";

    // Trigger animation
    setTimeout(() => {
      fill.style.transition = "width 1.5s ease-out";
      fill.style.width = targetWidth;
    }, 100);
  });
}

// Leaderboard interactivity
function setupLeaderboardInteractivity() {
  const leaderboardEntries = document.querySelectorAll(".leaderboard-entry");

  leaderboardEntries.forEach((entry, index) => {
    entry.addEventListener("click", function () {
      toggleEntryDetails(this);
    });

    entry.addEventListener("mouseenter", function () {
      this.style.transform = "translateX(5px)";
    });

    entry.addEventListener("mouseleave", function () {
      this.style.transform = "translateX(0)";
    });

    // Add click animation
    entry.style.cursor = "pointer";
    entry.style.transition = "all 0.3s ease";
  });
}

function toggleEntryDetails(entry) {
  const scoreElement = entry.querySelector(".score");
  const currentScore = scoreElement.textContent;

  // Show a tooltip-like feedback
  const originalText = currentScore;
  scoreElement.textContent = "Selected ✓";
  scoreElement.style.color = "#00f7ff";

  setTimeout(() => {
    scoreElement.textContent = originalText;
    scoreElement.style.color = "#00f7ff";
  }, 1500);
}

// Chart interactivity
function setupChartInteractivity() {
  const bars = document.querySelectorAll(".bar");

  bars.forEach((bar) => {
    bar.addEventListener("mouseenter", function () {
      this.style.opacity = "0.8";

      // Show value tooltip
      const container = this.closest(".bar-item");
      const value = Math.round((parseFloat(this.style.height) / 100) * 100);

      const tooltip = document.createElement("div");
      tooltip.textContent = value + "%";
      tooltip.style.cssText = `
                position: absolute;
                background: #151528;
                color: white;
                padding: 5px 10px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                bottom: 100%;
                left: 50%;
                transform: translateX(-50%);
                margin-bottom: 8px;
            `;

      container.style.position = "relative";
      container.appendChild(tooltip);
    });

    bar.addEventListener("mouseleave", function () {
      this.style.opacity = "1";

      const container = this.closest(".bar-item");
      const tooltip = container.querySelector("div");
      if (tooltip) tooltip.remove();
    });
  });
}

// Badge interactivity
function setupBadgeInteractivity() {
  const badges = document.querySelectorAll(".badge.earned");

  badges.forEach((badge) => {
    badge.addEventListener("click", function () {
      animateBadgeClick(this);
    });

    badge.addEventListener("mouseenter", function () {
      const icon = this.querySelector(".badge-icon");
      icon.style.transform = "scale(1.2) rotate(10deg)";
      icon.style.transition = "all 0.3s ease";
    });

    badge.addEventListener("mouseleave", function () {
      const icon = this.querySelector(".badge-icon");
      icon.style.transform = "scale(1) rotate(0deg)";
    });
  });
}

function animateBadgeClick(badge) {
  const icon = badge.querySelector(".badge-icon");

  // Pulse animation
  icon.style.animation = "none";
  setTimeout(() => {
    icon.style.animation = "badgePulse 0.5s ease";
  }, 10);

  // Show notification
  showNotification(
    badge.querySelector("p").textContent + " Badge Unlocked! 🎉",
  );
}

// Add pulse animation
const style = document.createElement("style");
style.textContent = `
    @keyframes badgePulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.3); }
        100% { transform: scale(1); }
    }
`;
document.head.appendChild(style);

// Milestone interactivity
function setupMilestoneInteractivity() {
  const milestones = document.querySelectorAll(".milestone");

  milestones.forEach((milestone) => {
    milestone.style.cursor = "pointer";
    milestone.style.transition = "all 0.3s ease";

    milestone.addEventListener("mouseenter", function () {
      this.style.transform = "translateX(10px)";
    });

    milestone.addEventListener("mouseleave", function () {
      this.style.transform = "translateX(0)";
    });

    milestone.addEventListener("click", function () {
      handleMilestoneClick(this);
    });
  });
}

function handleMilestoneClick(milestone) {
  const isCompleted = milestone.classList.contains("completed");

  if (isCompleted) {
    const title = milestone.querySelector("h4").textContent;
    showNotification("✓ " + title + " - Great job! 🏆");
  } else {
    const progress = milestone.querySelector("p").textContent;
    showNotification("In progress: " + progress);
  }
}

// Notification system
function showNotification(message) {
  const notification = document.createElement("div");
  notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(90deg, #ff4ecd, #8a2be2, #00c6ff);
        color: white;
        padding: 16px 24px;
        border-radius: 10px;
        box-shadow: 0 8px 20px rgba(0, 247, 255, 0.4);
        font-weight: 600;
        z-index: 10000;
        animation: slideInRight 0.4s ease;
        max-width: 300px;
    `;

  notification.textContent = message;
  document.body.appendChild(notification);

  // Auto remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = "slideOutRight 0.4s ease";
    setTimeout(() => notification.remove(), 400);
  }, 3000);
}

// Add notification animations
const notificationStyle = document.createElement("style");
notificationStyle.textContent = `
    @keyframes slideInRight {
        from {
            opacity: 0;
            transform: translateX(100px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
    
    @keyframes slideOutRight {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100px);
        }
    }
`;
document.head.appendChild(notificationStyle);

// Live updates simulation
function startLiveUpdates() {
  if (hasOpsAnalyticsData) {
    return;
  }

  // Update leaderboard scores in real-time (every 5 seconds)
  setInterval(updateLeaderboardScores, 5000);

  // Update bar chart values (every 7 seconds)
  setInterval(updateChartBars, 7000);

  // Update progress bar (every 6 seconds)
  setInterval(updateProgressBar, 6000);
}

function updateLeaderboardScores() {
  const scores = document.querySelectorAll(".leaderboard-entry .score");

  scores.forEach((score) => {
    const currentValue = parseInt(score.textContent);
    const randomChange = Math.floor(Math.random() * 50) - 20; // -20 to +30
    const newValue = Math.max(currentValue + randomChange, 100); // Min 100 points

    if (randomChange !== 0) {
      score.style.color = randomChange > 0 ? "#00f7ff" : "#ff4ecd";
      score.textContent = newValue;

      setTimeout(() => {
        score.style.color = "#00f7ff";
      }, 1000);
    }
  });
}

function updateChartBars() {
  const bars = document.querySelectorAll(".bar");

  bars.forEach((bar) => {
    const minHeight = 20;
    const maxHeight = 95;
    const randomHeight =
      Math.floor(Math.random() * (maxHeight - minHeight)) + minHeight;

    bar.style.height = randomHeight + "%";
  });
}

function updateProgressBar() {
  const progressFill = document.querySelector(".progress-fill");
  const currentWidth = parseFloat(progressFill.style.width);
  const randomChange = Math.floor(Math.random() * 5) + 1; // 1 to 5% increase
  const newWidth = Math.min(currentWidth + randomChange, 100);

  progressFill.style.width = newWidth + "%";
}

// Search and filter functionality for leaderboard
function filterLeaderboard(searchTerm) {
  const entries = document.querySelectorAll(".leaderboard-entry");

  entries.forEach((entry) => {
    const userName = entry
      .querySelector(".user-info span:nth-child(2)")
      .textContent.toLowerCase();

    if (userName.includes(searchTerm.toLowerCase())) {
      entry.style.display = "grid";
    } else {
      entry.style.display = "none";
    }
  });
}

// Sort leaderboard by different criteria
function sortLeaderboard(criteria) {
  const table = document.querySelector(".leaderboard-table");
  const entries = Array.from(document.querySelectorAll(".leaderboard-entry"));

  entries.sort((a, b) => {
    let valueA, valueB;

    if (criteria === "score") {
      valueA = parseInt(a.querySelector(".score").textContent);
      valueB = parseInt(b.querySelector(".score").textContent);
    } else if (criteria === "streak") {
      valueA = parseInt(a.querySelector(".streak").textContent);
      valueB = parseInt(b.querySelector(".streak").textContent);
    } else if (criteria === "name") {
      valueA = a.querySelector(".user-info span:nth-child(2)").textContent;
      valueB = b.querySelector(".user-info span:nth-child(2)").textContent;
    }

    return criteria === "name" ? valueA.localeCompare(valueB) : valueB - valueA;
  });

  // Re-append sorted entries
  entries.forEach((entry) => {
    table.appendChild(entry);
  });
}

// Export data functionality
function exportAnalyticsData() {
  const leaderboardData = [];

  document.querySelectorAll(".leaderboard-entry").forEach((entry) => {
    leaderboardData.push({
      rank: entry.querySelector(".rank").textContent,
      user: entry.querySelector(".user-info span:nth-child(2)").textContent,
      points: entry.querySelector(".score").textContent,
      streak: entry.querySelector(".streak").textContent,
    });
  });

  const dataStr = JSON.stringify(leaderboardData, null, 2);
  const dataBlob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "analytics_data.json";
  link.click();

  showNotification("📊 Analytics data exported successfully!");
}

// Print report functionality
function printAnalyticsReport() {
  const printWindow = window.open("", "", "height=600,width=800");
  const content = document.querySelector(".analytics-dashboard").innerHTML;

  printWindow.document.write(`
        <html>
            <head>
                <title>Analytics Report</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; background: #0f0f1a; color: #ffffff; }
                    h1, h2 { color: #00f7ff; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    th, td { border: 1px solid rgba(0, 247, 255, 0.2); padding: 10px; text-align: left; }
                    th { background: #00f7ff; color: #0f0f1a; }
                </style>
            </head>
            <body>
                ${content}
            </body>
        </html>
    `);

  printWindow.document.close();
  printWindow.print();
}

// Make functions accessible globally
window.filterLeaderboard = filterLeaderboard;
window.sortLeaderboard = sortLeaderboard;
window.exportAnalyticsData = exportAnalyticsData;
window.printAnalyticsReport = printAnalyticsReport;
