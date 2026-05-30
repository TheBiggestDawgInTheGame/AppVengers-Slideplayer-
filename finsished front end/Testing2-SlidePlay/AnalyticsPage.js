// Analytics Page Interactive Functionality

document.addEventListener("DOMContentLoaded", function () {
  initializeAnalytics();
  applySubscriptionUnlocks();
});

// ── Subscription-based unlocks ─────────────────────────────────────────────
function applySubscriptionUnlocks() {
  try {
    var sub = JSON.parse(localStorage.getItem("sp_student_subscription") || "null");
    var isPaid = sub && sub.status !== "cancelled" &&
      (sub.plan === "student_elite" || sub.plan === "student_premium");
    if (!isPaid) return;

    // Unlock all locked premium badges
    document.querySelectorAll(".badge.locked").forEach(function (badge) {
      badge.classList.remove("locked");
      badge.classList.add("earned");
    });

    // Hide any "unlock premium" upsell prompts on the page
    document.querySelectorAll("[data-requires='premium'], .premium-upsell, .locked-overlay").forEach(function (el) {
      el.style.display = "none";
    });
  } catch (_) {}
}

// Initialize all analytics features
function initializeAnalytics() {
  animateProgressBars();
  setupLeaderboardInteractivity();
  setupChartInteractivity();
  setupBadgeInteractivity();
  setupMilestoneInteractivity();
  startLiveUpdates();
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
