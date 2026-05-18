const createGame = require('voxel-engine');

console.log('Starting voxel-classroom...');

try {
  const game = createGame({
    generate: function(x, y, z) {
      return y === 1 ? 1 : 0; // simple flat world
    },
    generateChunks: false,
    chunkDistance: 1,
    chunkSize: 16,
    materialFlatColor: true,
    materials: [['grass', 'dirt', 'grass_dirt']],
    texturePath: './textures/',
    isClient: false
  });

  console.log('Voxel engine loaded successfully.');
  console.log('Headless game initialized:');
  console.log('  isClient =', game.isClient);
  console.log('  chunkDistance =', game.chunkDistance);
  console.log('  world origin =', game.worldOrigin);
} catch (error) {
  console.error('Failed to start voxel-engine:', error.message);
  process.exit(1);
}
