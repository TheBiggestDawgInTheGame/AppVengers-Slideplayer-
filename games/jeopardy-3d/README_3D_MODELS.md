# 3D Jeopardy Game - Audience Models Guide

## Overview

The enhanced 3D Jeopardy game features an immersive game show environment with an interactive audience. By default, the audience is rendered as procedurally generated shapes, but you can enhance it with custom 3D character models.

## Current Status

✅ **3D Game Show Infrastructure**
- Professional stage with lighting and screens
- Host and contestant podiums
- Animated particles and effects
- Question and answer display screens
- 5 rows of seating with ~16 audience members per row

🔄 **Audience Models (Customizable)**
- Currently uses procedural generation (cylinders + spheres)
- Ready to load GLTF 3D models from `./models/` directory
- Supports fallback to procedural if models unavailable

## Adding 3D Models to the Audience

### Option 1: Using GLTF Models (Recommended)

1. **Place model files** in the `models/` directory:
   ```
   jeopardy-3d/
   └── models/
       ├── character-1.gltf
       ├── character-2.gltf
       └── character-3.gltf
   ```

2. **Model requirements:**
   - Format: GLTF (.gltf) or GLTF Binary (.glb)
   - Scale: ~1-2 units height (will be scaled to 0.4 in game)
   - Rig/Animation: Optional (static models work fine)
   - Textures: Embedded or as separate files in the same directory

3. **The game will automatically:**
   - Load up to 3 unique character models
   - Randomly distribute them in the audience
   - Fall back to procedural generation if models fail to load
   - Scale and position them in the seating area

### Option 2: Converting FBX to GLTF

If you have FBX models (like from the escape_game folder), convert them using:

#### Using Blender (Free, Recommended):
1. Open Blender
2. Import the FBX file (File → Import → FBX)
3. Select the model
4. Export as GLTF 2.0 (File → Export → glTF 2.0 (.glb/.gltf))
   - Choose "GLB Binary" format for single-file export
   - Settings: 
     - ✓ Include Animations (if model has them)
     - ✓ Include All Bone Influences
     - Check "Only Selected" if only exporting the character

#### Using Online Converter:
- https://convertio.co/fbx-gltf/ (or similar)
- Upload FBX → Download GLTF

### Option 3: Creating Custom Models

You can create audience members in any 3D software:
- **Blender** (Free, open-source)
- **Spline** (Web-based, free tier)
- **TinkerCAD** (Free, simple)

Export as GLTF and place in the `models/` directory.

## Model Customization

### In `threeScene.js`, the `buildAudience()` function:

```javascript
// Adjust model scaling (currently 0.4 = 40% size)
modelClone.scale.set(0.4, 0.4, 0.4);

// Adjust probability of using models vs procedural (currently 60%)
const useLoadedModel = loadedModels[modelIdx] && Math.random() < 0.6;

// Change number of models to load (currently 3)
const modelPaths = [
  './models/character-1.gltf',
  './models/character-2.gltf',
  './models/character-3.gltf'
];
```

## Integration with Learning Materials

The 3D Jeopardy game is ready to integrate with the Learning Studio:

1. **Upload learning materials** in the main Learning Studio
2. **Extract key concepts** from documents
3. **Generate quiz questions** from extracted material
4. **Launch the 3D Game Show** with questions displayed on the main screen
5. **Audience reacts** to correct/incorrect answers

## Technical Details

### Model Loading
- Uses **GLTFLoader** from Three.js library
- Loads asynchronously to avoid blocking the game
- Automatically clones models for each audience member

### Fallback Behavior
- If models fail to load, game continues with procedural generation
- Status logged to console: 
  - Success: `✓ Audience 3D models loaded: X/3`
  - Fallback: `📍 Using procedural audience (...)`

### Performance
- Audience rendering optimized for 80+ members
- Models use hardware instancing where possible
- Fallback procedural generation is lightweight

## File Structure

```
jeopardy-3d/
├── index.html          # Main game UI
├── script.js           # Game logic (quiz engine)
├── threeScene.js       # 3D scene with model loading
├── styles.css          # Game styling
├── models/             # 3D character models (GLTF)
│   ├── character-1.gltf
│   ├── character-2.gltf
│   └── character-3.gltf
└── README_3D_MODELS.md # This file
```

## Browser Requirements

- Modern browser with WebGL support
- Chrome/Edge/Firefox (last 2 versions)
- 4GB+ RAM recommended for smooth performance with 80+ 3D objects

## Future Enhancements

- [ ] Load models from `escape_game/models/` (requires FBX→GLTF conversion)
- [ ] Audience reactions/animations based on quiz progress
- [ ] Character customization UI
- [ ] Motion capture for realistic audience body language
- [ ] Sound effects and crowd reactions

## Troubleshooting

**Models not loading?**
- Check browser console (F12) for CORS errors
- Ensure .gltf files are in correct path
- Verify GLTFLoader is loaded from CDN

**Models positioned incorrectly?**
- Adjust scale factor in `threeScene.js`
- Rotate model if orientation is wrong
- Check model's pivot point in original software

**Performance issues?**
- Reduce number of loaded models (change `modelPaths` array)
- Reduce audience size (change `seatsInRow` calculation)
- Optimize model geometry (fewer polygons)
