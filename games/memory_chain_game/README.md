Memory Chain Game

What it does:
- Reads ordered steps from uploaded slide content when available.
- Shuffles those steps into draggable cards.
- Lets learners rebuild the sequence by drag and drop or click swap.
- Validates the answer and marks each card as correct or misplaced.
- Scores each round using accuracy, speed, and difficulty multipliers.
- Increases challenge over time by moving from Easy to Medium to Hard.

How step extraction works:
1) It first searches for numbered step lines such as:
   1. Start process
   Step 2: Validate input
2) If numbered lines are missing, it looks for sentence clues like first, next, then, and finally.
3) If slide content is missing, it uses a built-in fallback workflow list.

How to run:
- Open memory_chain_game/index.html in your browser.
- Or launch it from slide_upload/games.html after adding the game card.

Files:
- index.html: game layout and UI structure.
- style.css: visual styles, feedback colors, and responsive layout.
- script.js: modular game logic (extract, shuffle, drag-drop, validate, score).

Extension points:
- Add animation hooks in renderBoard and checkSequence.
- Add per-round timer pressure in checkSequence and updateTimeDisplay.
- Add multiplayer sync by connecting GameModes live room logic to board actions.
