# Pacman Game

A classic Pacman game built with HTML, CSS, and JavaScript featuring the SlidePaly dark theme.

## Features

- 🎮 **Classic Pacman Gameplay** - Navigate the maze and collect pellets
- 👻 **AI Ghosts** - Four ghosts with random movement patterns
- ⚡ **Power-ups** - Eat power pellets to temporarily make ghosts vulnerable
- 🎯 **Score System** - Earn points for pellets and eating ghosts
- 💥 **Lives System** - Start with 3 lives
- 🎨 **Dark Theme** - Modern dark UI with magenta and cyan accents
- 📱 **Responsive Design** - Works on all screen sizes

## How to Play

1. Open `index.html` in your browser
2. Click "Start Game" to begin
3. Use **Arrow Keys** or **WASD** to move Pacman
4. Collect all yellow pellets to win
5. Avoid the colorful ghosts or eat power pellets (magenta) to turn the tables
6. Try to get the highest score!

## Game Rules

- **Pellets**: Regular pellets = 10 points
- **Power Pellets**: Magenta power-ups = 50 points + ghost vulnerability
- **Eating Ghosts**: While in power mode = 200 points each
- **Loss Condition**: Touch a ghost when not in power mode
- **Win Condition**: Collect all pellets
- **Lives**: Start with 3 lives, lose one when caught by a ghost

## Controls

- **Arrow Keys** - Move Pacman up, down, left, right
- **WASD** - Alternative movement controls
- **Start Game** - Begin a new game
- **Reset** - Clear the board and prepare for a new game

## Game Features

### Score
- Track your current score in real-time
- Final score displayed when game ends

### Lives
- Start with 3 lives
- Lose a life when caught by a ghost (unless in power mode)
- Game over when all lives are lost

### Power Mode
- Eat magenta power pellets to activate power mode (10 seconds)
- Ghosts become vulnerable and can be eaten
- Eat ghosts for bonus points
- Power mode timer shown in header

### Maze
- Classic Pacman-style maze layout
- Tunnel exits on sides for quick escape
- Strategic path planning needed

## Technical Details

- **Grid Size**: 19x21 cells
- **Cell Size**: 30px
- **Game Speed**: 200ms per move
- **Color Scheme**: Dark theme with magenta (#ff1493) and cyan (#00d9ff) accents

Enjoy the game! 🎮
