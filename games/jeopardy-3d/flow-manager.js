/* flow-manager.js - Multi-screen game flow orchestration */
(function (window) {
  const GameFlowManager = {
    // Available game modes
    AVAILABLE_MODES: [
      { id: 'jeopardy', name: '🎯 Jeopardy 3D', description: 'Fast-paced trivia with prize ladder' },
      { id: 'millionaire', name: '💰 Who Wants to Be a Millionaire', description: 'Strategic gameplay with lifelines' },
      { id: 'quiz', name: '📝 Quiz Game', description: 'Classic quiz with instant feedback' },
      { id: 'scramble', name: '🔀 Word Scramble', description: 'Unscramble words from content' },
    ],

    // Play style options
    PLAY_STYLES: ['solo', 'multiplayer', 'tournament'],

    // Game state
    currentFlow: {
      screen: 'mode-chooser',
      selectedMode: null,
      uploadedContent: null,
      selectedGame: null,
      selectedPlayStyle: null,
      desiredPlayers: null,
      uploadedFileName: null,
      players: [],
    },

    // DOM references
    dom: {
      modeChooser: null,
      uploadPanel: null,
      gameSelector: null,
      playStyleSelector: null,
      lobbyScreen: null,
      gameEngine: null,
    },

    // Initialize flow manager
    init() {
      this.cacheDOM();
      this.ensureLobbyScreen();
      this.bindFlowEvents();
      if (!this.applyDeepLinkFromQuery()) {
        this.showScreen('mode-chooser');
      }
    },

    applyDeepLinkFromQuery() {
      const params = new URLSearchParams(window.location.search);
      const gameParam = (params.get('game') || '').toLowerCase();
      const playStyleParam = (params.get('playStyle') || '').toLowerCase();
      const playersParam = Number(params.get('players') || '0');
      const sourceParam = params.get('source');

      const gameAliasMap = {
        jeopardy: 'jeopardy',
        millionaire: 'millionaire',
        quiz: 'quiz',
        scramble: 'scramble',
      };

      const playStyleAliasMap = {
        solo: 'solo',
        single: 'solo',
        multiplayer: 'multiplayer',
        '2p': 'multiplayer',
        '2-player': 'multiplayer',
        'two-player': 'multiplayer',
        tournament: 'tournament',
      };

      const mapped = gameAliasMap[gameParam];
      if (!mapped) return false;

      const mappedStyle = playStyleAliasMap[playStyleParam] || null;
      const defaultGameByMode = {
        quiz: 'quiz-standard',
        scramble: 'scramble-words',
      };

      // Preselect mode and game
      this.currentFlow.selectedMode = mapped;
      this.currentFlow.selectedGame = defaultGameByMode[mapped] || 'jeopardy-3d';

      if (mappedStyle && this.PLAY_STYLES.includes(mappedStyle)) {
        this.currentFlow.selectedPlayStyle = mappedStyle;
      }

      if (Number.isFinite(playersParam) && playersParam >= 1) {
        this.currentFlow.desiredPlayers = Math.min(8, Math.floor(playersParam));
      }

      // ── If coming from the slide upload page, check for existing quiz data ──
      // Skip the upload screen entirely if content already exists in localStorage.
      if (sourceParam === 'upload') {
        try {
          const existingQuiz = JSON.parse(localStorage.getItem('slidePlayGeneratedQuizData') || 'null');
          const existingFiles = JSON.parse(localStorage.getItem('slidePlayUploadedFiles') || 'null');
          const firstFile = Array.isArray(existingFiles) && existingFiles.length > 0 ? existingFiles[0] : null;
          const extractedText = firstFile
            ? String(firstFile.extractedText || firstFile.text || firstFile.content || '').trim()
            : '';
          const hasContent = Array.isArray(existingQuiz) && existingQuiz.length > 0 && extractedText.length >= 50;

          if (hasContent) {
            // Restore content into flow state so proceedToGameSelector() won't block
            this.currentFlow.uploadedContent = extractedText;
            this.currentFlow.uploadedFileName = firstFile.originalName || 'previous upload';

            // Skip upload screen — go straight to play-style (or game engine for solo)
            if (mappedStyle) {
              this.selectPlayStyle(mappedStyle);
            } else {
              this.showScreen('play-style');
            }
            return true;
          }
        } catch (_) {
          // Fall through to show upload screen
        }
      }

      this.showScreen('upload');
      return true;
    },

    cacheDOM() {
      this.dom.modeChooser = document.getElementById('mode-chooser-screen');
      this.dom.uploadPanel = document.getElementById('upload-panel');
      this.dom.gameSelector = document.getElementById('game-selector-screen');
      this.dom.playStyleSelector = document.getElementById('play-style-screen');
      this.dom.lobbyScreen = document.getElementById('lobby-screen');
      this.dom.gameEngine = document.getElementById('game-engine-screen');
    },

    ensureLobbyScreen() {
      if (!this.dom.lobbyScreen) {
        const el = document.createElement('div');
        el.id = 'lobby-screen';
        el.className = 'flow-screen hidden';
        el.innerHTML = `
          <h1>👥 Player Setup</h1>
          <p class="subtitle">Add players before the game starts</p>
          <div id="player-inputs-list"></div>
          <button id="btn-add-player" class="action-btn secondary-btn" style="margin-top:10px;">+ Add Player</button>
          <br><br>
          <button id="btn-lobby-start" class="proceed-btn" disabled>🎮 Start Game</button>
        `;
        // Insert before game-engine-screen
        const gameEngine = this.dom.gameEngine;
        if (gameEngine && gameEngine.parentNode) {
          gameEngine.parentNode.insertBefore(el, gameEngine);
        }
        this.dom.lobbyScreen = el;
      }
    },

    bindFlowEvents() {
      document.addEventListener('click', (e) => {
        if (e.target.closest('.mode-option')) {
          const modeId = e.target.closest('.mode-option').dataset.modeId;
          this.selectMode(modeId);
        }
        if (e.target.id === 'btn-upload-proceed') {
          this.proceedToGameSelector();
        }
        if (e.target.closest('.game-option')) {
          const gameId = e.target.closest('.game-option').dataset.gameId;
          this.selectGame(gameId);
        }
        if (e.target.closest('.play-style-option')) {
          const style = e.target.closest('.play-style-option').dataset.style;
          this.selectPlayStyle(style);
        }
        if (e.target.id === 'btn-add-player') {
          this.addPlayerInput();
        }
        if (e.target.id === 'btn-lobby-start') {
          this.startFromLobby();
        }
      });
    },

    showScreen(screenName) {
      // Hide all flow screens
      Object.values(this.dom).forEach(el => {
        if (el) el.classList.add('hidden');
      });

      // Show selected screen
      switch (screenName) {
        case 'mode-chooser':
          if (this.dom.modeChooser) this.dom.modeChooser.classList.remove('hidden');
          break;
        case 'upload':
          if (this.dom.uploadPanel) this.dom.uploadPanel.classList.remove('hidden');
          break;
        case 'game-selector':
          if (this.dom.gameSelector) this.dom.gameSelector.classList.remove('hidden');
          this.renderGameSelector();
          break;
        case 'play-style':
          if (this.dom.playStyleSelector) this.dom.playStyleSelector.classList.remove('hidden');
          this.renderPlayStyleSelector();
          break;
        case 'lobby':
          if (this.dom.lobbyScreen) this.dom.lobbyScreen.classList.remove('hidden');
          this.renderLobby();
          break;
        case 'game-engine':
          if (this.dom.gameEngine) this.dom.gameEngine.classList.remove('hidden');
          this.launchGameEngine();
          break;
      }

      this.currentFlow.screen = screenName;
    },

    selectMode(modeId) {
      this.currentFlow.selectedMode = modeId;
      this.showScreen('upload');
    },

    proceedToGameSelector() {
      if (!this.currentFlow.uploadedContent) {
        const statusEl = document.getElementById('upload-status');
        if (statusEl) {
          statusEl.textContent = '⚠️ Please upload a file first';
          statusEl.style.color = '#e74c3c';
        }
        return;
      }

      if (this.currentFlow.selectedPlayStyle) {
        this.selectPlayStyle(this.currentFlow.selectedPlayStyle);
        return;
      }

      // If a game is already preselected by a deep link or upload flow,
      // skip the redundant internal game picker and go straight to play style.
      if (this.currentFlow.selectedGame) {
        this.showScreen('play-style');
        return;
      }

      this.showScreen('game-selector');
    },

    renderGameSelector() {
      const container = document.querySelector('#game-selector-screen .game-options');
      if (!container) return;

      const mode = this.currentFlow.selectedMode;
      let availableGames = [];

      if (mode === 'jeopardy' || mode === 'millionaire') {
        availableGames = [
          { id: 'jeopardy-3d', name: '🎮 3D Game Show', description: 'Immersive 3D trivia with prize ladder & lifelines' },
          { id: 'classic-quiz', name: '📺 Classic Quiz', description: 'Traditional multiple-choice quiz interface' },
        ];
      } else if (mode === 'quiz') {
        availableGames = [
          { id: 'quiz-standard', name: '📋 Standard Quiz', description: 'Multiple choice with timer' },
          { id: 'quiz-timed', name: '⏱️ Speed Quiz', description: 'Rapid-fire questions for quick thinkers' },
        ];
      } else if (mode === 'scramble') {
        availableGames = [
          { id: 'scramble-words', name: '🔤 Word Scramble', description: 'Unscramble and guess words from your content' },
        ];
      } else {
        availableGames = [
          { id: 'jeopardy-3d', name: '🎮 3D Game Show', description: 'Immersive 3D trivia experience' },
          { id: 'classic-quiz', name: '📝 Quiz Game', description: 'Classic multiple-choice quiz' },
        ];
      }

      container.innerHTML = availableGames.map(game => `
        <div class="game-option" data-game-id="${game.id}">
          <div class="game-option-title">${game.name}</div>
          <div class="game-option-desc">${game.description}</div>
        </div>
      `).join('');
    },

    selectGame(gameId) {
      this.currentFlow.selectedGame = gameId;
      this.showScreen('play-style');
    },

    renderPlayStyleSelector() {
      const container = document.querySelector('#play-style-screen .play-style-options');
      if (!container) return;

      container.innerHTML = this.PLAY_STYLES.map(style => `
        <div class="play-style-option" data-style="${style}">
          <div class="play-style-icon">
            ${style === 'solo' ? '🎮' : style === 'multiplayer' ? '👥' : '🏆'}
          </div>
          <div class="play-style-title">${style.charAt(0).toUpperCase() + style.slice(1)}</div>
          <div class="play-style-desc">
            ${style === 'solo' ? 'Play alone at your own pace' : style === 'multiplayer' ? 'Take turns with friends' : 'Bracket competition, best score wins'}
          </div>
        </div>
      `).join('');
    },

    selectPlayStyle(style) {
      this.currentFlow.selectedPlayStyle = style;

      if (style === 'solo') {
        // Solo mode goes straight to game
        this.currentFlow.players = [{ name: 'Player 1', score: 0 }];
        this.showScreen('game-engine');
      } else {
        // Multiplayer/tournament → lobby to add players
        this.showScreen('lobby');
      }
    },

    renderLobby() {
      const listEl = document.getElementById('player-inputs-list');
      if (!listEl) return;

      const style = this.currentFlow.selectedPlayStyle;
      const minPlayers = 2;
      const maxPlayers = style === 'tournament' ? 8 : 4;
      const requestedPlayers = Number(this.currentFlow.desiredPlayers || 0);
      const initialPlayers = Math.max(
        minPlayers,
        Math.min(maxPlayers, Number.isFinite(requestedPlayers) ? requestedPlayers : minPlayers),
      );

      listEl.innerHTML = '';

      // Pre-fill inputs based on deep-link player count when available.
      for (let i = 0; i < initialPlayers; i++) {
        this.addPlayerInputEl(listEl, i + 1);
      }

      const addBtn = document.getElementById('btn-add-player');
      if (addBtn) {
        addBtn.style.display = listEl.children.length < maxPlayers ? '' : 'none';
      }

      this.updateLobbyStartButton();

      // Store max players info
      listEl.dataset.maxPlayers = String(maxPlayers);
    },

    addPlayerInput() {
      const listEl = document.getElementById('player-inputs-list');
      if (!listEl) return;

      const maxPlayers = Number(listEl.dataset.maxPlayers || 4);
      const current = listEl.querySelectorAll('.player-input-row').length;

      if (current >= maxPlayers) return;

      this.addPlayerInputEl(listEl, current + 1);

      const addBtn = document.getElementById('btn-add-player');
      if (addBtn) {
        addBtn.style.display = listEl.querySelectorAll('.player-input-row').length < maxPlayers ? '' : 'none';
      }

      this.updateLobbyStartButton();
    },

    addPlayerInputEl(container, playerNum) {
      const row = document.createElement('div');
      row.className = 'player-input-row';
      row.style.cssText = 'display:flex;gap:10px;align-items:center;margin-bottom:10px;';
      row.innerHTML = `
        <span style="color:#d4a745;font-weight:700;min-width:70px;">Player ${playerNum}</span>
        <input 
          type="text" 
          class="player-name-input" 
          placeholder="Enter name..."
          value="Player ${playerNum}"
          style="flex:1;padding:10px 14px;border-radius:10px;border:1px solid rgba(212,167,69,0.5);background:rgba(0,0,0,0.4);color:#f0e6d3;font-size:0.95em;"
          maxlength="30"
        />
      `;
      container.appendChild(row);

      const input = row.querySelector('.player-name-input');
      if (input) {
        input.addEventListener('input', () => this.updateLobbyStartButton());
      }
    },

    updateLobbyStartButton() {
      const startBtn = document.getElementById('btn-lobby-start');
      if (!startBtn) return;

      const inputs = document.querySelectorAll('.player-name-input');
      const allFilled = Array.from(inputs).every(i => i.value.trim().length > 0);
      startBtn.disabled = !allFilled || inputs.length < 2;
    },

    startFromLobby() {
      const inputs = document.querySelectorAll('.player-name-input');
      const players = Array.from(inputs).map((input, idx) => ({
        name: input.value.trim() || `Player ${idx + 1}`,
        score: 0,
        roundsPlayed: 0,
      }));

      this.currentFlow.players = players;
      console.log('Starting with players:', players);

      this.showScreen('game-engine');
    },

    setUploadedContent(content, fileName) {
      this.currentFlow.uploadedContent = content;
      this.currentFlow.uploadedFileName = fileName;
    },

    launchGameEngine() {
      const gameParams = {
        mode: this.currentFlow.selectedMode,
        game: this.currentFlow.selectedGame,
        playStyle: this.currentFlow.selectedPlayStyle,
        content: this.currentFlow.uploadedContent,
        fileName: this.currentFlow.uploadedFileName,
        players: this.currentFlow.players,
      };

      console.log('Launching game with params:', gameParams);

      if (typeof window.gameEngine !== 'undefined' && window.gameEngine.startWithParams) {
        window.gameEngine.startWithParams(gameParams);
      }
    },

    resetFlow() {
      this.currentFlow = {
        screen: 'mode-chooser',
        selectedMode: null,
        uploadedContent: null,
        selectedGame: null,
        selectedPlayStyle: null,
        desiredPlayers: null,
        uploadedFileName: null,
        players: [],
      };

      // Reset upload status
      const statusEl = document.getElementById('upload-status');
      if (statusEl) {
        statusEl.textContent = '';
        statusEl.style.color = '';
      }
      const proceedBtn = document.getElementById('btn-upload-proceed');
      if (proceedBtn) {
        proceedBtn.disabled = true;
      }

      this.showScreen('mode-chooser');
    },

    getFlowState() {
      return { ...this.currentFlow };
    },
  };

  // Export to window
  window.GameFlowManager = GameFlowManager;
})(window);
