let selectedCurriculum = "";

function selectFormat(element, name) {
  // 1. Remove 'selected' class and selection bars from all cards
  const cards = document.querySelectorAll(".game-card");
  cards.forEach((card) => {
    card.classList.remove("selected");
    // Remove selection bar if it exists to keep UI clean
    const bar = card.querySelector(".selection-bar");
    if (bar) bar.remove();
  });

  // 2. Add 'selected' class and visual bar to clicked card
  element.classList.add("selected");
  const bar = document.createElement("div");
  bar.className = "selection-bar";
  element.appendChild(bar);

  // 3. Update global state
  selectedCurriculum = name;

  // 4. Reveal and update the Action Bar
  const actionBar = document.getElementById("action-bar");
  const nameDisplay = document.getElementById("selected-name");

  actionBar.style.display = "flex";
  nameDisplay.innerText = name;
}

function startAnalysis() {
  if (selectedCurriculum) {
    // Redirects to your next page with the chosen curriculum in the URL
    window.location.href = `NotesPage.html?subject=${encodeURIComponent(selectedCurriculum)}`;
  }
}
