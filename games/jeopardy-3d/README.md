# 3D Jeopardy Learning Game

Transform your learning materials into an immersive game show experience with professional 3D graphics, dynamic audience, and interactive quiz mechanics.

## Features

### 🎬 Professional 3D Environment
- Game show stage with lighting and effects
- Dynamic host and contestant podiums
- Multiple camera angles
- Particle effects and atmospheric elements
- Cinematic lighting with colored spotlights

### 📚 Learning Integration
- Upload any learning material (PDF, DOCX, images, text)
- Extract key concepts automatically
- Generate quiz questions from content
- Real-time question display on virtual screens

### 👥 Smart Audience System
- Up to 80+ audience members in stadium seating
- Procedural generation as default (always works)
- Optional 3D character models for enhanced immersion
- Automatic fallback if models aren't available

### 🎮 Interactive Quiz Engine
- 4-choice multiple choice questions
- Score tracking and progress display
- Visual feedback (correct/incorrect)
- Audience reactions and effects
- Session results and analytics

## Quick Start

### 1. Open the Game
```bash
# Navigate to the project folder
cd jeopardy-3d

# Open in browser
open index.html
# or right-click → Open with Browser
```

### 2. Upload Learning Material
- Click "📁 Choose Learning Material"
- Select files: PDF, DOCX, images, or text files
- Click "Start Quiz" to begin

### 3. Play the Quiz
- Questions appear on the main screen
- Click answer options
- Watch the audience react to your answers
- Track your score in real-time

## File Structure

```
jeopardy-3d/
├── index.html              # Main game UI
├── script.js               # Game logic & quiz engine
├── threeScene.js           # 3D rendering & animations
├── styles.css              # Game styling
├── quizengine.js           # Quiz mechanics
│
├── models/                 # 3D character models (optional)
│   ├── character-1.gltf    # Add your GLTF models here
│   ├── character-2.gltf
│   └── character-3.gltf
│
├── setup-models.js         # Helper script for models
├── README_3D_MODELS.md     # Detailed model setup guide
└── README.md               # This file
```

## Adding 3D Audience Models

The game comes with procedurally generated audience (basic shapes) that always works. To add realistic 3D characters:

### Quick Setup (5 minutes)

1. **Get 3D Models**
   - Create models in Blender, TinkerCAD, or Spline
   - Or download from Sketchfab, TurboSquid, etc.
   - Support format: GLTF (.gltf or .glb)

2. **Convert FBX to GLTF** (if needed)
   ```
   - Open model in Blender
   - File → Export → glTF 2.0 (.glb)
   - Save to jeopardy-3d/models/
   ```

3. **Name and Place Models**
   ```
   jeopardy-3d/models/
   ├── character-1.gltf
   ├── character-2.gltf
   └── character-3.gltf
   ```

4. **Game Automatically Uses Them!**
   - Reload the page
   - Check browser console for: ✓ Audience 3D models loaded: 3/3
   - 60% of audience will now use your 3D models

### Detailed Guide
See [README_3D_MODELS.md](./README_3D_MODELS.md) for:
- Converting FBX from escape_game folder
- Creating custom characters
- Customizing model scaling and appearance
- Troubleshooting

## Integration with Learning Studio

This 3D Jeopardy game is part of the broader Learning Studio ecosystem:

### Workflow:
```
1. Learning Studio (Gemma2)
   ↓ (Upload learning materials)
   ↓ (Extract key concepts with AI)
   ↓ (Generate quiz questions)
   
2. 3D Jeopardy Game
   ↓ (Take quiz in immersive environment)
   ↓ (Get real-time feedback)
   
3. Results & Analytics
   ↓ (Track learning progress)
   ↓ (Identify weak areas)
```

### Shared Features:
- Same file upload pipeline (PDF, DOCX, images, text)
- Same question generation engine
- Seamless transitions between tools

## Technologies Used

### Frontend
- **Three.js** (3D graphics and rendering)
- **GLTFLoader** (3D model loading)
- **PDF.js** (PDF text extraction)
- **Mammoth.js** (DOCX parsing)
- **Tesseract.js** (Image OCR)

### Game Logic
- Vanilla JavaScript (no frameworks)
- Canvas for dynamic screen rendering
- WebGL for 3D rendering
- LocalStorage for session persistence

### Optional Backend
- **Ollama + Gemma2** (LLM for content processing)
- **Ollama + Mistral** (Alternative LLM)

## System Requirements

### Minimum
- Browser: Chrome, Firefox, Edge (last 2 versions)
- RAM: 2GB
- GPU: Intel HD Graphics or better

### Recommended
- Browser: Latest Chrome/Edge
- RAM: 4GB+
- GPU: NVIDIA/AMD discrete GPU

### File Support
- **Documents:** PDF, DOCX, DOC, TXT, MD
- **Images:** PNG, JPG, JPEG, WebP, GIF, BMP
- **OCR Languages:** English, French (customizable)

## Advanced Configuration

### Game Settings
Edit `threeScene.js` to customize:

```javascript
// Audience size (rows × people per row)
const seatsInRow = 16 - row;

// Model probability (0-1)
const useLoadedModel = loadedModels[modelIdx] && Math.random() < 0.6;

// Model scale (smaller = 0.3, larger = 0.5)
modelClone.scale.set(0.4, 0.4, 0.4);
```

### Quiz Settings
Edit `quizengine.js`:

```javascript
// Time limit per question (ms)
QUESTION_TIMEOUT = 30000;

// Number of answer choices
ANSWER_CHOICES = 4;

// Score multiplier for speed
SPEED_BONUS = 1.0;
```

### Graphics Settings
Edit `styles.css`:

```css
/* Adjust colors */
--gold: #d4a745;
--blue: #1a3a5c;
--correct: #2ecc71;
--incorrect: #e74c3c;

/* Adjust glow effects */
--glow: #4a90d9;
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1-4` | Select answer (A, B, C, D) |
| `Enter` | Submit answer |
| `Space` | Start quiz / Next question |
| `Esc` | Return to upload screen |
| `F12` | Open developer console (debugging) |

## Troubleshooting

### Game Won't Start
- Check browser console (F12 → Console)
- Ensure JavaScript is enabled
- Try a different browser
- Clear cache and reload

### Models Not Loading
- Confirm files are in `models/` directory
- Check file names: `character-1.gltf`, etc.
- Verify GLTFLoader is loaded (check Network tab in F12)
- Check browser console for CORS errors

### Performance Issues
- Reduce audience size (edit `threeScene.js`)
- Disable particle effects
- Close other browser tabs
- Update GPU drivers

### Questions Not Showing
- Ensure learning files are readable
- Try a different document type
- Check console for extraction errors
- Verify Ollama is running (if using AI extraction)

## Development

### Local Testing
```bash
# Simple HTTP server
python -m http.server 8000
# or
npx http-server

# Then visit: http://localhost:8000/jeopardy-3d/
```

### Debugging
1. Open Developer Tools: F12
2. Check Console for messages
3. Use Network tab to verify file loading
4. Inspect 3D scene with Three.js DevTools extension

### Making Changes
- Edit `threeScene.js` for 3D modifications
- Edit `script.js` for quiz logic
- Edit `styles.css` for UI/styling
- Edit `index.html` for structure

## Future Roadmap

- [ ] Audience animation reactions
- [ ] Multiplayer quiz mode
- [ ] Leaderboard system
- [ ] Custom themes and stages
- [ ] Voice-based questions
- [ ] Adaptive difficulty
- [ ] Integration with learning analytics

## Credits

### Open Source Libraries
- Three.js (3D Graphics)
- PDF.js (PDF Processing)
- Mammoth.js (DOCX Processing)
- Tesseract.js (OCR)

### Assets
- Fonts: Segoe UI, Helvetica Neue
- Models: Your custom GLTF models

### Inspired By
- Jeopardy! Quiz show format
- Game show presentations
- Educational gaming platforms

## License

This project is part of the AppVengers Learning Platform.

## Support

### Getting Help
1. Check this README
2. Check [README_3D_MODELS.md](./README_3D_MODELS.md)
3. Review browser console (F12)
4. Check GitHub issues

### Reporting Issues
Include:
- Browser and version
- Error message from console
- Steps to reproduce
- Screenshots if relevant

---

**Ready to learn in 3D?** 🚀

Start with the Learning Studio to prepare materials, then launch 3D Jeopardy for an immersive quiz experience!
