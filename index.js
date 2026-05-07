const createGame = require('voxel-engine');
const game = createGame({ 
  materials: ['grass', 'brick', 'wood'],
  generate: (x, y, z) => y === 0 ? 1 : 0 // flat floor
});
const container = document.body;
game.appendTo(container);


const player = game.controls.target();
player.position.set(0, 5, 0); // spawn point
// Add NPCs as static cubes with name tags



