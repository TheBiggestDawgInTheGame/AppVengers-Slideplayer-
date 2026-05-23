let selectedGame = "";

function selectFormat(element, gameName) {
  // 1. Remove 'selected' class from all cards
  const cards = document.querySelectorAll(".game-card");
  cards.forEach((card) => card.classList.remove("selected"));

  // 2. Add 'selected' class to clicked card
  element.classList.add("selected");

  // 3. Update global variable
  selectedGame = gameName;

  // 4. Show the action bar
  const actionBar = document.getElementById("action-bar");
  const selectedNameDisplay = document.getElementById("selected-name");

  actionBar.style.display = "flex";
  selectedNameDisplay.innerText = gameName;
  selectedNameDisplay.style.color = "var(--accent-teal)";
}

function startAnalysis() {
  if (selectedGame) {
    // Redirect to upload page
    window.location.href = `UploadPage.html?format=${selectedGame}`;
  }
}
