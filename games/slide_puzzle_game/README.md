Slide Puzzle Game

Purpose:
- Turn ordered slide content into puzzle fragments.
- Learners drag shuffled fragments back into the correct layout.

How fragments are loaded:
1) Read uploaded slide text from localStorage.
2) Prefer numbered lines and ordered process content.
3) Fallback to generated quiz questions.
4) Use built-in demo fragments if no slide source is available.

Core features:
- Drag pieces from pool to board slots.
- Drag placed pieces back to pool.
- Immediate slot feedback: green (correct), red (incorrect).
- Accuracy + speed based score.
- Difficulty progression: Easy -> Medium -> Hard.

Main files:
- index.html: UI structure.
- style.css: layout and visual feedback styles.
- script.js: modular puzzle logic.

Extension ideas:
- Add image-tile puzzle mode from slide screenshots.
- Add animated snap transitions.
- Add multiplayer race mode with shared board sync.
