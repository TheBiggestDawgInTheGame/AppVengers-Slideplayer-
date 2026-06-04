(function () {
  if (window.__slideplayBackNavLoaded) return;
  window.__slideplayBackNavLoaded = true;

  function sameOriginReferrerPath() {
    try {
      if (!document.referrer) return "";
      var ref = new URL(document.referrer);
      if (ref.origin !== window.location.origin) return "";
      return ref.pathname + (ref.search || "");
    } catch (_err) {
      return "";
    }
  }

  function fallbackUrl() {
    var fromReferrer = sameOriginReferrerPath();
    if (fromReferrer && fromReferrer !== window.location.pathname) return fromReferrer;
    return "/main.html";
  }

  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = fallbackUrl();
  }

  function injectStyles() {
    if (document.getElementById("sp-back-nav-style")) return;
    var style = document.createElement("style");
    style.id = "sp-back-nav-style";
    style.textContent = [
      ".sp-back-nav-btn {",
      "  position: fixed;",
      "  left: 16px;",
      "  bottom: 16px;",
      "  z-index: 2147483000;",
      "  display: inline-flex;",
      "  align-items: center;",
      "  gap: 8px;",
      "  padding: 10px 14px;",
      "  border-radius: 999px;",
      "  border: 1px solid rgba(148, 163, 184, 0.35);",
      "  background: rgba(15, 23, 42, 0.86);",
      "  color: #e2e8f0;",
      "  font: 600 13px/1.2 'Poppins', Arial, sans-serif;",
      "  cursor: pointer;",
      "  box-shadow: 0 10px 24px rgba(2, 6, 23, 0.35);",
      "  backdrop-filter: blur(8px);",
      "}",
      ".sp-back-nav-btn:hover {",
      "  transform: translateY(-1px);",
      "  background: rgba(30, 41, 59, 0.92);",
      "}",
      ".sp-back-nav-btn:active {",
      "  transform: translateY(0);",
      "}",
      ".sp-back-nav-btn i {",
      "  font-size: 12px;",
      "}",
      "@media (max-width: 640px) {",
      "  .sp-back-nav-btn {",
      "    left: 10px;",
      "    bottom: 10px;",
      "    padding: 9px 12px;",
      "    font-size: 12px;",
      "  }",
      "}",
    ].join("\n");
    document.head.appendChild(style);
  }

  function injectButton() {
    if (document.getElementById("spBackNavBtn")) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "spBackNavBtn";
    btn.className = "sp-back-nav-btn";
    btn.setAttribute("aria-label", "Return to previous page");
    btn.innerHTML = '<i class="fa-solid fa-arrow-left"></i><span>Back</span>';
    btn.addEventListener("click", goBack);

    document.body.appendChild(btn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      injectStyles();
      injectButton();
    });
  } else {
    injectStyles();
    injectButton();
  }
})();
