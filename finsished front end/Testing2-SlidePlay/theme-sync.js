(function () {
  var saved = localStorage.getItem("slideplayTheme");
  var cls = saved === "light-mode" ? "light-mode" : "dark-mode";

  function applyThemeClass() {
    document.documentElement.classList.remove("dark-mode", "light-mode");
    document.documentElement.classList.add(cls);

    if (document.body) {
      document.body.classList.remove("dark-mode", "light-mode");
      document.body.classList.add(cls);
    }
  }

  applyThemeClass();
  document.addEventListener("DOMContentLoaded", applyThemeClass);

  window.addEventListener("storage", function (e) {
    if (e.key !== "slideplayTheme") return;
    cls = e.newValue === "light-mode" ? "light-mode" : "dark-mode";
    applyThemeClass();
  });
})();
