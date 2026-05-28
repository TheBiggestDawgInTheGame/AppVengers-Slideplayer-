document.addEventListener("DOMContentLoaded", () => {
  const barNodes = Array.from(document.querySelectorAll(".bar-chart .bar"));
  const liveFeedLabel = document.querySelector(".live-feed-label");
  const scoreRing = document.querySelector(".score-ring .progress");
  const scoreValue = document.querySelector(".score-ring strong");
  const ringNote = document.querySelector(".ring-note");

  if (!barNodes.length || !scoreRing || !scoreValue) {
    return;
  }

  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  let barValues = [48, 62, 85, 56, 78, 64];
  let score = parseFloat(scoreValue.textContent) || 8.2;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setBars(values) {
    values.forEach((value, index) => {
      if (barNodes[index]) {
        barNodes[index].style.height = value + "%";
      }
    });
  }

  function updateBars() {
    barValues = barValues.map((value) => {
      const drift = (Math.random() - 0.5) * 18;
      return Math.round(clamp(value + drift, 35, 95));
    });
    setBars(barValues);
  }

  function getBandCount(currentScore) {
    const base = Math.round(currentScore * 4);
    const variance = Math.floor(Math.random() * 5) - 2;
    return clamp(base + variance, 24, 40);
  }

  function setScore(nextScore) {
    score = clamp(nextScore, 6.8, 9.7);
    scoreValue.textContent = score.toFixed(1);

    const progress = score / 10;
    const offset = circumference * (1 - progress);
    scoreRing.style.strokeDasharray = circumference.toFixed(2);
    scoreRing.style.strokeDashoffset = offset.toFixed(2);

    scoreValue.classList.remove("high", "mid", "low");
    if (score >= 8.7) {
      scoreValue.classList.add("high");
    } else if (score >= 7.8) {
      scoreValue.classList.add("mid");
    } else {
      scoreValue.classList.add("low");
    }

    if (ringNote) {
      ringNote.textContent = "Top bracket (A): " + getBandCount(score) + " students";
    }
  }

  function updateScore() {
    const drift = (Math.random() - 0.5) * 0.7;
    setScore(score + drift);
  }

  function updateLiveClock() {
    if (!liveFeedLabel) {
      return;
    }
    const now = new Date();
    const time = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    liveFeedLabel.textContent = "Live Feed " + time;
  }

  barNodes.forEach((bar) => {
    bar.style.height = "0%";
  });

  requestAnimationFrame(() => {
    setBars(barValues);
    setScore(score);
    updateLiveClock();
  });

  setInterval(updateBars, 2200);
  setInterval(updateScore, 2800);
  setInterval(updateLiveClock, 1000);
});
