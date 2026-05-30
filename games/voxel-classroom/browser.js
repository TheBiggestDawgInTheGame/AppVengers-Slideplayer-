const createGame = require('voxel-engine');

const itemInfo = document.getElementById('itemInfo');

const game = createGame({
  startingPosition: [0, 3, 8],
  generate: function(x, y, z) {
    // Room floor
    if (y === 1 && x >= -12 && x <= 12 && z >= -12 && z <= 12) return 1;

    // Room walls
    if (y > 1 && y <= 6 && (x === -12 || x === 12 || z === -12 || z === 12)) {
      if (x === 12 && z === 0 && y <= 4) return 0; // door opening
      return 2;
    }

    // Blackboard wall surface
    if (z === -12 && y >= 3 && y <= 5 && x >= -8 && x <= 8) return 3;

    // Ceiling
    if (y === 7 && x >= -12 && x <= 12 && z >= -12 && z <= 12) return 2;

    return 0;
  },
  materialFlatColor: true,
  materials: [['grass', 'dirt', 'grass_dirt'], 'brick', 'quartz', 'wood', 'stone', 'sand', 'glass'],
  chunkDistance: 2,
  chunkSize: 16,
  controls: { discreteFire: false },
  lightsDisabled: false,
  fogDisabled: false,
  texturePath: './textures/',
});

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#090c1a';

game.appendTo(document.body);

const classroomItems = [
  { name: 'Mysterious Desk', pos: [0, 2, 10], value: 4, info: 'A desk with a locked drawer. The key might be hidden in one of the puzzle games.' },
  { name: 'Ancient Tome', pos: [1, 2, 10], value: 6, info: 'An old book with cryptic symbols. It might contain clues to the escape.' },
  { name: 'Puzzle Station A', pos: [-5, 2, 4], value: 4, info: 'A station with strange markings. Perhaps it holds a secret code.' },
  { name: 'Puzzle Station B', pos: [5, 2, 4], value: 4, info: 'Another station with glowing runes. Interact to reveal more.' },
  { name: 'Holographic Display', pos: [0, 5, -11], value: 6, info: 'A display showing fragmented images. Solve the games to complete the picture and find the exit code.' },
  { name: 'Locked Exit', pos: [12, 2, 0], value: 3, info: 'The door is locked. You need to solve all puzzles to escape.' },
  { name: 'Puzzle Guardian - Quiz', pos: [-6, 2, 0], value: 5, game: 'quiz_game' },
  { name: 'Puzzle Guardian - Pacman', pos: [-2, 2, 0], value: 5, game: 'pacman_game' },
  { name: 'Puzzle Guardian - Scramble', pos: [2, 2, 0], value: 5, game: 'scramble_game' },
  { name: 'Puzzle Guardian - Typing', pos: [6, 2, 0], value: 5, game: 'speed_typing_game' },
];

const gameEntryFiles = {
  pacman_game: 'pacman_game.html',
  snake_game: 'snake_game.html',
  scramble_game: 'scramble_game.html',
  quiz_game: 'index.html',
  speed_typing_game: 'speed_typing_game.html'
};

classroomItems.forEach(item => {
  game.setBlock(item.pos, item.value);
});

game.showAllChunks();

game.on('mousedown', function(clickEvent) {
  let blockPos = null;
  if (!clickEvent) return;
  if (Array.isArray(clickEvent)) {
    blockPos = clickEvent;
  } else if (clickEvent.position) {
    blockPos = clickEvent.position;
  } else if (clickEvent.voxel) {
    blockPos = clickEvent.voxel;
  }
  if (!blockPos) return;

  const matched = classroomItems.find(item =>
    item.pos[0] === blockPos[0] &&
    item.pos[1] === blockPos[1] &&
    item.pos[2] === blockPos[2]
  );

  if (matched) {
    if (matched.game) {
      itemInfo.textContent = `Challenged by ${matched.name}. Solving this puzzle might give you a key fragment!`;
      const entryFile = gameEntryFiles[matched.game] || 'index.html';
      window.open(`../${matched.game}/${entryFile}`, '_blank');
    } else {
      itemInfo.textContent = `${matched.name}: ${matched.info}`;
    }
  } else {
    itemInfo.textContent = 'Empty space. Look for interactive objects and guardians to find clues and solve puzzles.';
  }
});

game.on('tick', function() {
  // Could add animation or additional logic here.
});

window.game = game;
