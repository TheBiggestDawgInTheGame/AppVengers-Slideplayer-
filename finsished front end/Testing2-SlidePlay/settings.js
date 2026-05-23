function applyTheme(theme) {
  const body = document.body;
  const btn = document.getElementById("theme-toggle");

  body.classList.remove("dark-mode", "light-mode");
  body.classList.add(theme);

  if (theme === "light-mode") {
    btn.innerText = "DARK MODE";
  } else {
    btn.innerText = "LIGHT MODE";
  }
}

function toggleTheme() {
  const body = document.body;
  const currentTheme = body.classList.contains("light-mode")
    ? "light-mode"
    : "dark-mode";
  const nextTheme = currentTheme === "light-mode" ? "dark-mode" : "light-mode";

  applyTheme(nextTheme);
  localStorage.setItem("slideplayTheme", nextTheme);
}

window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("slideplayTheme");
  if (savedTheme === "light-mode" || savedTheme === "dark-mode") {
    applyTheme(savedTheme);
  } else {
    applyTheme("dark-mode");
  }
});
