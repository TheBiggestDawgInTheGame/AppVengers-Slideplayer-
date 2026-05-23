// games-mode.js
// Handles play mode selection modal logic

document.addEventListener('DOMContentLoaded', function () {
  const options = document.querySelectorAll('.psm-option');
  const launchBtn = document.getElementById('launch-btn');
  let selectedMode = null;

  options.forEach(option => {
    option.addEventListener('click', function () {
      options.forEach(opt => opt.classList.remove('active'));
      this.classList.add('active');
      selectedMode = this.id;
      launchBtn.classList.remove('hidden');
    });
  });

  launchBtn.addEventListener('click', function () {
    if (selectedMode) {
      // Replace with navigation or callback as needed
      alert('Selected mode: ' + selectedMode.replace('-mode', ''));
      // Example: window.location.href = 'game.html?mode=' + selectedMode;
    }
  });
});
