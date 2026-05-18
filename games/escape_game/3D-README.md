# 🔒 Escape Room 3D - Quick Start Guide

## What's New in 3D Version?

The game has been enhanced with **full 3D first-person immersion** using Three.js!

### Files
- **index-3d.html** - Play the 3D version here
- **script-3d.js** - 3D logic (same puzzles, new visuals)
- **multiplayer-server.js** - WebSocket relay server for live multiplayer
- Original 2D version still available at 2d_escape_room/index.html

### Live Multiplayer Setup (Cross-Device)

1. In this folder, install dependencies: `npm install`
2. Start the relay server: `npm run start:mp`
3. In the game startup screen, choose **Multiplayer**
4. Enter the same **Live Server** and **Room ID** on both devices
5. Use unique **Player Name** values so each avatar is distinguishable

If devices are on the same network, replace `localhost` with the host machine IP, e.g. `ws://192.168.1.20:8081`.

### How to Play

#### Movement
- **WASD** - Move forward/backward/strafe
- **Mouse** - Look around (click to lock/unlock pointer)
- **Click** - Interact with objects

#### Controls
- Look at an object and you'll see "CLICK to examine"
- Click to open object details
- Solve puzzles by entering answers or collecting clues
- Check inventory in bottom-left corner
- Watch the progress dots and timer at the top

### Technical Details

**MVP Features Implemented:**
✓ Full 3D classroom with textured walls  
✓ First-person camera with mouse look  
✓ Interactive clickable objects (board, clock, skull, RTH, globe, etc.)  
✓ Raycasting for precise click detection  
✓ Reused puzzle logic from original  
✓ HUD with timer and progress tracking  
✓ Inventory system  
✓ Same game state and win conditions  

**Performance:**
- Optimized for most browsers
- Fog effect for depth
- Simple geometries for fast rendering
- Shadows enabled on key objects

### Puzzles (Same as Original)

The 6 key puzzles you need to solve:
1. **Chalkboard** (①) - Math equations → code 39
2. **Clock** (②) - Time clue → 20  
3. **Skull** (③) - RTH code → 206
4. **RTH Machine** (④) - Color sequence
5. **Bookshelf** (⑤) - Confirms 4-digit code
6. **Door** (⑥) - Final code entry → 2039 = ESCAPE!

### Known Limitations (MVP)

- Simple geometric shapes (can be replaced with 3D models later)
- Flat canvas textures for some objects
- No sound yet
- No particle effects
- Camera is fixed to walking height
- Can't jump or crouch

### Next Enhancements

Could add:
- 3D models of classroom objects
- More detailed textures
- Sound effects
- Ambient environmental details
- Interactive object physics (grab, rotate)
- VR support
- Better lighting/shadows
- Particle effects

---

**Built with:** Three.js r128  
**Last Updated:** April 2026
