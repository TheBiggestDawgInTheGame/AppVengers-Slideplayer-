#!/usr/bin/env node

/**
 * 3D Model Setup Helper for Jeopardy 3D Game
 * 
 * Helps with:
 * - Converting FBX models from escape_game to GLTF
 * - Creating sample character models
 * - Organizing models in the models/ directory
 */

const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, 'models');
const ESCAPE_GAME_PATH = path.join(__dirname, '..', 'escape_game', 'models');

console.log('🎭 3D Jeopardy Model Setup Helper\n');
console.log('Available commands:');
console.log('  node setup-models.js status      - Check available models');
console.log('  node setup-models.js create-sample - Create sample GLTF model');
console.log('  node setup-models.js list-escape  - List escape_game models\n');

const command = process.argv[2] || 'status';

// Ensure models directory exists
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  console.log(`✓ Created ${MODELS_DIR}\n`);
}

function checkStatus() {
  console.log('📊 Model Status:\n');
  
  // Check for GLTF models
  const gltfFiles = fs.readdirSync(MODELS_DIR).filter(f => 
    f.endsWith('.gltf') || f.endsWith('.glb')
  );
  
  console.log(`GLTF Models in ./models/: ${gltfFiles.length}`);
  gltfFiles.forEach(f => console.log(`  ✓ ${f}`));
  
  if (gltfFiles.length === 0) {
    console.log('  (none - audience will use procedural generation)');
  }
  
  console.log('\nTo add models:');
  console.log('  1. Convert FBX files to GLTF using Blender');
  console.log('  2. Place character-1.gltf, character-2.gltf, character-3.gltf in ./models/');
  console.log('  3. Game automatically loads and uses them for audience\n');
}

function listEscapeModels() {
  console.log('🎮 Models in escape_game folder:\n');
  
  if (!fs.existsSync(ESCAPE_GAME_PATH)) {
    console.log(`Path not found: ${ESCAPE_GAME_PATH}`);
    return;
  }
  
  const dirs = fs.readdirSync(ESCAPE_GAME_PATH).filter(f => {
    return fs.statSync(path.join(ESCAPE_GAME_PATH, f)).isDirectory();
  });
  
  dirs.forEach(dir => {
    const sourcePath = path.join(ESCAPE_GAME_PATH, dir, 'source');
    if (fs.existsSync(sourcePath)) {
      const files = fs.readdirSync(sourcePath);
      console.log(`  ${dir}/`);
      files.forEach(f => console.log(`    - ${f}`));
    }
  });
  
  console.log('\nTo convert these models to GLTF:');
  console.log('  1. Open the FBX file in Blender');
  console.log('  2. File → Export → glTF 2.0 (.glb)');
  console.log('  3. Save to jeopardy-3d/models/ as character-X.glb\n');
}

function createSampleModel() {
  console.log('🎨 Creating sample 3D character models...\n');
  
  // Create simple box models as placeholders
  // These are minimal valid GLTF files
  
  const createSimpleCharacter = (index, color) => {
    const filename = path.join(MODELS_DIR, `character-${index}.glb`);
    
    // For now, create placeholder info
    const info = `Sample Character ${index}\nColor: ${color}\n\nTo replace this:\n1. Convert FBX to GLTF using Blender\n2. Place .glb file here`;
    const infoFile = path.join(MODELS_DIR, `character-${index}-info.txt`);
    
    fs.writeFileSync(infoFile, info);
    console.log(`✓ Created placeholder for character-${index}`);
  };
  
  createSampleModel(1, 'Blue');
  createSampleModel(2, 'Red');
  createSampleModel(3, 'Green');
  
  console.log('\n📝 Placeholder files created in ./models/');
  console.log('Next: Convert actual FBX models from escape_game folder\n');
}

// Execute command
switch(command) {
  case 'status':
    checkStatus();
    break;
  case 'list-escape':
    listEscapeModels();
    break;
  case 'create-sample':
    createSampleModel();
    break;
  default:
    console.log(`Unknown command: ${command}`);
    console.log('Use: node setup-models.js [status|list-escape|create-sample]\n');
}
