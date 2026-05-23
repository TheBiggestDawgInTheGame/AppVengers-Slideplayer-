# PowerShell script to start all SlidePlay servers from their correct directories
# Run this script from the root of your workspace

$ErrorActionPreference = 'Continue'

# Start Escape Game server
if (Test-Path "games/escape_game/multiplayer-server.js") {
    Start-Process powershell -ArgumentList 'cd games/escape_game; npm install; node multiplayer-server.js' -WindowStyle Minimized
    Write-Host "Started: games/escape_game/multiplayer-server.js"
}

# Start Slideplay-AI server
if (Test-Path "slideplay-ai/server.js") {
    Start-Process powershell -ArgumentList 'cd slideplay-ai; npm install; node server.js' -WindowStyle Minimized
    Write-Host "Started: slideplay-ai/server.js"
}

# Start Slide Upload server
if (Test-Path "slide_upload/server.js") {
    Start-Process powershell -ArgumentList 'cd slide_upload; npm install; node server.js' -WindowStyle Minimized
    Write-Host "Started: slide_upload/server.js"
}

# Start Gemma2 Model AI Chat server
if (Test-Path "gemma2-model-ai-chat/server.js") {
    Start-Process powershell -ArgumentList 'cd gemma2-model-ai-chat; npm install; node server.js' -WindowStyle Minimized
    Write-Host "Started: gemma2-model-ai-chat/server.js"
}

# Start Quiz App AI Only server
if (Test-Path "quiz-app-ai-only/server.js") {
    Start-Process powershell -ArgumentList 'cd quiz-app-ai-only; npm install; node server.js' -WindowStyle Minimized
    Write-Host "Started: quiz-app-ai-only/server.js"
}

# Start Testing2-SlidePlay server
if (Test-Path "finsished front end/Testing2-SlidePlay/server.js") {
    Start-Process powershell -ArgumentList 'cd "finsished front end/Testing2-SlidePlay"; npm install; node server.js' -WindowStyle Minimized
    Write-Host "Started: finsished front end/Testing2-SlidePlay/server.js"
}

Write-Host "All available servers have been started in new PowerShell windows."
