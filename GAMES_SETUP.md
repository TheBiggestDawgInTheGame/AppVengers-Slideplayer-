# Game Setup Instructions for SlidePlay Games

Follow these steps to make all games ready to use immediately:

## 1. Install Node.js Dependencies (Run Once)
For each game folder below, open a terminal and run:

```
cd <game_folder>
npm install
```

### Folders that need this:
- games/escape_game
- games/story_mode
- (Add any other folder with a package.json)

## 2. How to Start Server-Based Games
- **escape_game**: `node multiplayer-server.js` (after npm install)
- **story_mode**: Check for a README or use `node index.js` if present

## 3. How to Play Static HTML Games
For these games, just open the main HTML file in your browser:
- games/jeopardy/index.html
- games/jeopardy-3d/index.html
- games/jeopardy-quiz/index.html
- games/mbasa_game/index.html
- games/memory_chain_game/index.html
- games/pacman_game/pacman_game.html
- games/quiz_game/quiz_game.html
- games/scramble_game/scramble_game.html
- games/slide_puzzle_game/index.html
- games/slide_scenario_game/index.html
- games/snake_game/snake_game.html
- games/speed_typing_game/speed_typing_game.html
- games/voxel-classroom/index.html

## 4. Troubleshooting
- If a game does not start, check for missing dependencies and run `npm install` in that folder.
- For server-based games, make sure the server is running before opening the client in your browser.

---

You can automate the dependency installation with this PowerShell script (run from the root of your workspace):

```
$folders = @('games/escape_game', 'games/story_mode')
foreach ($folder in $folders) {
  if (Test-Path "$folder/package.json") {
    Write-Host "Installing dependencies in $folder..."
    cd $folder; npm install; cd ../..
  }
}
```

---
Now all your games will be ready to use instantly!
