/**
 * threeScene.js - 3D Game Show Environment
 * Creates immersive stage, host, contestants, crowd, and dynamic screens
 */
const GameScene = (function () {
  // Private variables
  let scene, camera, renderer, canvas;
  let stageGroup, audienceGroup, lightingGroup;
  let questionScreenMesh,
    answerScreenMeshes = [];
  let hostGroup,
    contestantGroups = [];
  let spotlights = [];
  let particlesSystem;
  let animationObjects = [];
  let clock;
  let gltfLoader;

  // Canvas textures for screens
  let questionCanvas, questionCtx;
  let answerCanvases = [],
    answerCtxs = [];

  // Screen dimensions
  const QUESTION_SCREEN_W = 1024;
  const QUESTION_SCREEN_H = 300;
  const ANSWER_SCREEN_W = 400;
  const ANSWER_SCREEN_H = 180;

  function init() {
    canvas = document.getElementById("three-canvas");
    clock = new THREE.Clock();
    
    // Initialize GLTF loader for 3D models
    if (typeof THREE.GLTFLoader !== 'undefined') {
      gltfLoader = new THREE.GLTFLoader();
    }

    // Renderer
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    // Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a20, 0.00015);
    scene.background = new THREE.Color(0x080818);

    // Camera
    camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.5,
      60,
    );
    camera.position.set(0, 5, 14);
    camera.lookAt(0, 0, -3);

    // Build environment
    buildStage();
    buildBackdrop();
    buildScreens();
    buildLighting();
    buildHost();
    buildContestants();
    buildAudience();
    buildParticles();
    buildFloorReflection();

    // Start animation
    animate();

    // Handle resize
    window.addEventListener("resize", onResize);

    return { scene, camera, renderer };
  }

  function buildStage() {
    stageGroup = new THREE.Group();
    scene.add(stageGroup);

    // Main stage platform
    const stageGeo = new THREE.BoxGeometry(14, 0.4, 8);
    const stageMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a3a,
      roughness: 0.25,
      metalness: 0.6,
    });
    const stage = new THREE.Mesh(stageGeo, stageMat);
    stage.position.y = -0.2;
    stage.receiveShadow = true;
    stage.castShadow = true;
    stageGroup.add(stage);

    // Stage edge trim (gold)
    const trimGeo = new THREE.BoxGeometry(14.2, 0.08, 8.2);
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xd4a745,
      roughness: 0.3,
      metalness: 0.8,
      emissive: 0x332200,
      emissiveIntensity: 0.5,
    });
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.position.y = 0.05;
    stageGroup.add(trim);

    // Stage surface pattern (grid lines)
    for (let i = -6; i <= 6; i += 1.2) {
      const lineGeo = new THREE.BoxGeometry(0.03, 0.01, 7.5);
      const lineMat = new THREE.MeshStandardMaterial({
        color: 0x334466,
        roughness: 0.5,
        metalness: 0.3,
        emissive: 0x111133,
        emissiveIntensity: 0.3,
      });
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.position.set(i, 0.22, 0);
      stageGroup.add(line);
    }
    for (let j = -3; j <= 3; j += 1) {
      const lineGeo = new THREE.BoxGeometry(13.5, 0.01, 0.03);
      const lineMat = new THREE.MeshStandardMaterial({
        color: 0x334466,
        roughness: 0.5,
        metalness: 0.3,
        emissive: 0x111133,
        emissiveIntensity: 0.3,
      });
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.position.set(0, 0.22, j);
      stageGroup.add(line);
    }

    // Steps in front
    for (let s = 0; s < 3; s++) {
      const stepGeo = new THREE.BoxGeometry(10 - s * 1.5, 0.25, 0.8);
      const stepMat = new THREE.MeshStandardMaterial({
        color: 0x2a2a4a,
        roughness: 0.3,
        metalness: 0.5,
      });
      const step = new THREE.Mesh(stepGeo, stepMat);
      step.position.set(0, -0.45 - s * 0.25, 4.2 + s * 0.8);
      step.receiveShadow = true;
      stageGroup.add(step);
    }
  }

  function buildBackdrop() {
    const bgGroup = new THREE.Group();
    scene.add(bgGroup);

    // Main backdrop wall
    const wallGeo = new THREE.BoxGeometry(16, 7, 0.3);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a40,
      roughness: 0.5,
      metalness: 0.3,
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 3, -6.5);
    wall.receiveShadow = true;
    bgGroup.add(wall);

    // Decorative arches
    for (let a = -3; a <= 3; a += 2) {
      const archGeo = new THREE.TorusGeometry(1.3, 0.12, 16, 32, Math.PI);
      const archMat = new THREE.MeshStandardMaterial({
        color: 0xd4a745,
        roughness: 0.2,
        metalness: 0.9,
        emissive: 0x221100,
        emissiveIntensity: 0.4,
      });
      const arch = new THREE.Mesh(archGeo, archMat);
      arch.position.set(a, 4.8, -6.3);
      arch.rotation.z = Math.PI;
      bgGroup.add(arch);
    }

    // Central emblem (circle)
    const emblemGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.15, 48);
    const emblemMat = new THREE.MeshStandardMaterial({
      color: 0xd4a745,
      roughness: 0.15,
      metalness: 0.95,
      emissive: 0x332200,
      emissiveIntensity: 0.7,
    });
    const emblem = new THREE.Mesh(emblemGeo, emblemMat);
    emblem.position.set(0, 5.5, -6.2);
    emblem.rotation.x = Math.PI / 2;
    bgGroup.add(emblem);

    // Star in center of emblem
    const starGeo = new THREE.OctahedronGeometry(0.5, 0);
    const starMat = new THREE.MeshStandardMaterial({
      color: 0xffdd88,
      roughness: 0.1,
      metalness: 0.2,
      emissive: 0xffaa00,
      emissiveIntensity: 1.5,
    });
    const star = new THREE.Mesh(starGeo, starMat);
    star.position.set(0, 5.5, -6.1);
    star.rotation.y = Math.PI / 4;
    bgGroup.add(star);
    animationObjects.push({ mesh: star, type: "rotate", speed: 0.8 });
  }

  function buildScreens() {
    // Create canvas textures
    questionCanvas = document.createElement("canvas");
    questionCanvas.width = QUESTION_SCREEN_W;
    questionCanvas.height = QUESTION_SCREEN_H;
    questionCtx = questionCanvas.getContext("2d");
    drawQuestionScreen("Upload learning material\nto begin the game show!");

    const qTex = new THREE.CanvasTexture(questionCanvas);
    qTex.minFilter = THREE.LinearFilter;
    qTex.magFilter = THREE.LinearFilter;

    // Question screen (large, center)
    const qScreenGeo = new THREE.PlaneGeometry(7, 2.1);
    const qScreenMat = new THREE.MeshStandardMaterial({
      map: qTex,
      emissive: 0x4488cc,
      emissiveIntensity: 0.7,
      emissiveMap: qTex,
      roughness: 0.3,
      metalness: 0.2,
      side: THREE.DoubleSide,
    });
    questionScreenMesh = new THREE.Mesh(qScreenGeo, qScreenMat);
    questionScreenMesh.position.set(0, 4.2, -5.5);
    questionScreenMesh.castShadow = false;
    scene.add(questionScreenMesh);

    // Screen frame
    const frameGeo = new THREE.BoxGeometry(7.4, 2.5, 0.2);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xd4a745,
      roughness: 0.2,
      metalness: 0.9,
      emissive: 0x221100,
      emissiveIntensity: 0.5,
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(0, 4.2, -5.35);
    scene.add(frame);

    // Answer screens (4 smaller screens in a row below question screen)
    const answerPositions = [
      { x: -3.3, y: 1.6, z: -4.8 },
      { x: -1.1, y: 1.6, z: -4.8 },
      { x: 1.1, y: 1.6, z: -4.8 },
      { x: 3.3, y: 1.6, z: -4.8 },
    ];

    const answerColors = [0x4499dd, 0x44bb77, 0xdd9944, 0xdd5577];

    for (let i = 0; i < 4; i++) {
      const aCanvas = document.createElement("canvas");
      aCanvas.width = ANSWER_SCREEN_W;
      aCanvas.height = ANSWER_SCREEN_H;
      const aCtx = aCanvas.getContext("2d");
      drawAnswerScreen(aCtx, "", i);
      answerCanvases.push(aCanvas);
      answerCtxs.push(aCtx);

      const aTex = new THREE.CanvasTexture(aCanvas);
      aTex.minFilter = THREE.LinearFilter;
      aTex.magFilter = THREE.LinearFilter;

      const aScreenGeo = new THREE.PlaneGeometry(1.9, 0.85);
      const aScreenMat = new THREE.MeshStandardMaterial({
        map: aTex,
        emissive: answerColors[i],
        emissiveIntensity: 0.5,
        emissiveMap: aTex,
        roughness: 0.3,
        metalness: 0.2,
        side: THREE.DoubleSide,
      });
      const aScreenMesh = new THREE.Mesh(aScreenGeo, aScreenMat);
      aScreenMesh.position.set(
        answerPositions[i].x,
        answerPositions[i].y,
        answerPositions[i].z,
      );
      aScreenMesh.userData = { index: i, color: answerColors[i] };
      scene.add(aScreenMesh);
      answerScreenMeshes.push(aScreenMesh);

      // Small frame for each
      const aFrameGeo = new THREE.BoxGeometry(2.15, 1.1, 0.12);
      const aFrame = new THREE.Mesh(aFrameGeo, frameMat.clone());
      aFrame.position.set(
        answerPositions[i].x,
        answerPositions[i].y,
        answerPositions[i].z - 0.05,
      );
      scene.add(aFrame);
    }
  }

  function drawQuestionScreen(text) {
    questionCtx.fillStyle = "#0a0a28";
    questionCtx.fillRect(0, 0, QUESTION_SCREEN_W, QUESTION_SCREEN_H);
    questionCtx.fillStyle = "#e8dcc8";
    questionCtx.font =
      'bold 36px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
    questionCtx.textAlign = "center";
    questionCtx.textBaseline = "middle";
    const lines = text.split("\n");
    const lineHeight = 50;
    const startY =
      QUESTION_SCREEN_H / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, idx) => {
      questionCtx.fillText(
        line,
        QUESTION_SCREEN_W / 2,
        startY + idx * lineHeight,
      );
    });
    // Glow border
    questionCtx.strokeStyle = "#4a90d9";
    questionCtx.lineWidth = 6;
    questionCtx.strokeRect(
      8,
      8,
      QUESTION_SCREEN_W - 16,
      QUESTION_SCREEN_H - 16,
    );
  }

  function drawAnswerScreen(ctx, text, index) {
    const colors = ["#1a3a5c", "#1a4a3a", "#4a3a1a", "#4a1a2a"];
    ctx.fillStyle = colors[index];
    ctx.fillRect(0, 0, ANSWER_SCREEN_W, ANSWER_SCREEN_H);
    ctx.fillStyle = "#f0e6d3";
    ctx.font = 'bold 26px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, ANSWER_SCREEN_W / 2, ANSWER_SCREEN_H / 2);
    ctx.strokeStyle = "#d4a745";
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, ANSWER_SCREEN_W - 12, ANSWER_SCREEN_H - 12);
  }

  function updateQuestionScreen(text) {
    drawQuestionScreen(text);
    questionScreenMesh.material.map.needsUpdate = true;
    questionScreenMesh.material.emissiveMap.needsUpdate = true;
  }

  function updateAnswerScreen(index, text) {
    if (index >= 0 && index < 4) {
      drawAnswerScreen(answerCtxs[index], text, index);
      answerScreenMeshes[index].material.map.needsUpdate = true;
      answerScreenMeshes[index].material.emissiveMap.needsUpdate = true;
    }
  }

  function updateAllAnswerScreens(texts) {
    for (let i = 0; i < 4; i++) {
      updateAnswerScreen(i, texts[i] || "");
    }
  }

  function buildLighting() {
    lightingGroup = new THREE.Group();
    scene.add(lightingGroup);

    // Ambient light
    const ambient = new THREE.AmbientLight(0x223344, 0.6);
    scene.add(ambient);

    // Main spotlight (center)
    const mainSpot = new THREE.SpotLight(
      0xffffff,
      1.8,
      25,
      Math.PI / 7,
      0.3,
      0.5,
    );
    mainSpot.position.set(0, 10, -4);
    mainSpot.target.position.set(0, 0, -3);
    mainSpot.castShadow = true;
    mainSpot.shadow.mapSize.width = 1024;
    mainSpot.shadow.mapSize.height = 1024;
    mainSpot.shadow.camera.near = 0.5;
    mainSpot.shadow.camera.far = 30;
    mainSpot.shadow.bias = -0.0005;
    scene.add(mainSpot);
    scene.add(mainSpot.target);
    spotlights.push(mainSpot);

    // Colored spotlights
    const colors = [0x4488ff, 0xff8844, 0x44ff88, 0xff4488];
    const positions = [
      { x: -5, z: -5 },
      { x: 5, z: -5 },
      { x: -3, z: -3 },
      { x: 3, z: -3 },
    ];

    positions.forEach((pos, i) => {
      const spot = new THREE.SpotLight(
        colors[i],
        0.8,
        18,
        Math.PI / 8,
        0.4,
        0.6,
      );
      spot.position.set(pos.x, 8, pos.z);
      spot.target.position.set(pos.x * 0.5, 0, -3);
      spot.castShadow = true;
      spot.shadow.mapSize.width = 512;
      spot.shadow.mapSize.height = 512;
      spot.shadow.bias = -0.0004;
      scene.add(spot);
      scene.add(spot.target);
      spotlights.push(spot);
    });

    // Audience wash lights
    const washLight = new THREE.PointLight(0x4466aa, 1.5, 15, 1.5);
    washLight.position.set(0, 3, 6);
    scene.add(washLight);

    // Stage edge lights (small point lights along the front)
    for (let i = -5; i <= 5; i += 1.5) {
      const edgeLight = new THREE.PointLight(0xd4a745, 0.4, 3, 2);
      edgeLight.position.set(i, 0.1, 3.8);
      scene.add(edgeLight);
    }
  }

  function buildHost() {
    hostGroup = new THREE.Group();
    hostGroup.position.set(-4.5, 0, -2.5);
    scene.add(hostGroup);

    // Podium
    const podiumGeo = new THREE.CylinderGeometry(0.7, 0.85, 1.4, 32);
    const podiumMat = new THREE.MeshStandardMaterial({
      color: 0x3a2a1a,
      roughness: 0.3,
      metalness: 0.6,
    });
    const podium = new THREE.Mesh(podiumGeo, podiumMat);
    podium.position.y = 0.7;
    podium.castShadow = true;
    podium.receiveShadow = true;
    hostGroup.add(podium);

    // Podium top
    const topGeo = new THREE.CylinderGeometry(0.85, 0.7, 0.1, 32);
    const topMat = new THREE.MeshStandardMaterial({
      color: 0xd4a745,
      roughness: 0.2,
      metalness: 0.9,
    });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = 1.42;
    hostGroup.add(top);

    // Host body
    const bodyGeo = new THREE.CylinderGeometry(0.35, 0.45, 1.8, 24);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2c2c4a,
      roughness: 0.4,
      metalness: 0.3,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 2.4;
    body.castShadow = true;
    hostGroup.add(body);

    // Host head
    const headGeo = new THREE.SphereGeometry(0.4, 32, 32);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xf5d5b0,
      roughness: 0.5,
      metalness: 0.05,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 3.45;
    head.castShadow = true;
    hostGroup.add(head);
    animationObjects.push({
      mesh: head,
      type: "nod",
      speed: 0.3,
      group: hostGroup,
    });

    // Bowtie
    const bowGeo1 = new THREE.BoxGeometry(0.4, 0.1, 0.12);
    const bowGeo2 = new THREE.BoxGeometry(0.12, 0.1, 0.4);
    const bowMat = new THREE.MeshStandardMaterial({
      color: 0xdd3333,
      roughness: 0.2,
      metalness: 0.4,
      emissive: 0x330000,
      emissiveIntensity: 0.3,
    });
    const bow1 = new THREE.Mesh(bowGeo1, bowMat);
    bow1.position.set(0, 3.1, 0.42);
    hostGroup.add(bow1);
    const bow2 = new THREE.Mesh(bowGeo2, bowMat);
    bow2.position.set(0, 3.1, 0.42);
    hostGroup.add(bow2);

    // Arms
    const armGeo = new THREE.CylinderGeometry(0.1, 0.13, 1.2, 16);
    const armMat = new THREE.MeshStandardMaterial({
      color: 0x2c2c4a,
      roughness: 0.4,
      metalness: 0.3,
    });
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.5, 2.8, 0);
    leftArm.rotation.z = Math.PI / 6;
    leftArm.castShadow = true;
    hostGroup.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.5, 2.8, 0);
    rightArm.rotation.z = -Math.PI / 6;
    rightArm.castShadow = true;
    hostGroup.add(rightArm);
  }

  function buildContestants() {
    const positions = [
      { x: 2.5, z: -2.8 },
      { x: 4.5, z: -2.8 },
      { x: 6.5, z: -2.8 },
    ];
    const bodyColors = [0x3a3050, 0x304050, 0x403040];

    positions.forEach((pos, i) => {
      const group = new THREE.Group();
      group.position.set(pos.x, 0, pos.z);
      scene.add(group);
      contestantGroups.push(group);

      // Small podium
      const pGeo = new THREE.CylinderGeometry(0.5, 0.6, 1.2, 24);
      const pMat = new THREE.MeshStandardMaterial({
        color: 0x2a2a3a,
        roughness: 0.3,
        metalness: 0.5,
      });
      const podium = new THREE.Mesh(pGeo, pMat);
      podium.position.y = 0.6;
      podium.castShadow = true;
      podium.receiveShadow = true;
      group.add(podium);

      const pTopGeo = new THREE.CylinderGeometry(0.6, 0.5, 0.08, 24);
      const pTop = new THREE.Mesh(
        pTopGeo,
        new THREE.MeshStandardMaterial({
          color: 0x8899aa,
          roughness: 0.2,
          metalness: 0.7,
        }),
      );
      pTop.position.y = 1.22;
      group.add(pTop);

      // Body
      const bGeo = new THREE.CylinderGeometry(0.28, 0.35, 1.5, 20);
      const bMat = new THREE.MeshStandardMaterial({
        color: bodyColors[i],
        roughness: 0.4,
        metalness: 0.3,
      });
      const body = new THREE.Mesh(bGeo, bMat);
      body.position.y = 2.05;
      body.castShadow = true;
      group.add(body);

      // Head
      const hGeo = new THREE.SphereGeometry(0.32, 24, 24);
      const hMat = new THREE.MeshStandardMaterial({
        color: 0xf0c8a0,
        roughness: 0.5,
        metalness: 0.05,
      });
      const head = new THREE.Mesh(hGeo, hMat);
      head.position.y = 2.95;
      head.castShadow = true;
      group.add(head);

      // Buzzer light on podium
      const buzzGeo = new THREE.SphereGeometry(0.08, 16, 16);
      const buzzMat = new THREE.MeshStandardMaterial({
        color: 0xff4444,
        roughness: 0.1,
        metalness: 0.1,
        emissive: 0x330000,
        emissiveIntensity: 0.8,
      });
      const buzz = new THREE.Mesh(buzzGeo, buzzMat);
      buzz.position.set(0, 1.28, 0.55);
      buzz.name = "buzzer";
      group.add(buzz);
    });
  }

  function buildAudience() {
    audienceGroup = new THREE.Group();
    audienceGroup.position.set(0, -0.3, 5.5);
    scene.add(audienceGroup);

    // Available character types for audience
    const characterTypes = [
      "student-with-backpack",
      "professional-suit",
      "casual-denim",
      "student-notebook"
    ];
    
    // Attempt to load actual 3D models, fall back to procedural
    const useModels = gltfLoader && characterTypes.length > 0;
    const loadedModels = {};
    let modelsLoaded = 0;
    let totalModelsToLoad = 3;

    // Try loading models asynchronously
    if (useModels) {
      const modelPaths = [
        './models/character-1.gltf',
        './models/character-2.gltf',
        './models/character-3.gltf'
      ];

      modelPaths.forEach((path, idx) => {
        if (gltfLoader) {
          gltfLoader.load(
            path,
            (gltf) => {
              loadedModels[idx] = gltf.scene;
              modelsLoaded++;
            },
            undefined,
            () => {
              // Error or not found - just increment counter
              modelsLoaded++;
            }
          );
        }
      });
    }

    // Seating risers
    for (let row = 0; row < 5; row++) {
      const riserGeo = new THREE.BoxGeometry(16, 0.3, 1.5);
      const riserMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a2a,
        roughness: 0.6,
        metalness: 0.2,
      });
      const riser = new THREE.Mesh(riserGeo, riserMat);
      riser.position.set(0, row * 0.7, row * 1.6);
      riser.receiveShadow = true;
      audienceGroup.add(riser);

      // Audience members on this row
      const seatsInRow = 16 - row;
      const rowWidth = 14;
      const spacing = rowWidth / seatsInRow;

      for (let s = 0; s < seatsInRow; s++) {
        const memberGroup = new THREE.Group();
        const xPos = -rowWidth / 2 + spacing / 2 + s * spacing;
        memberGroup.position.set(xPos, row * 0.7 + 0.35, row * 1.6);

        // Try to use a loaded model, fall back to procedural
        const modelIdx = s % 3;
        const useLoadedModel = loadedModels[modelIdx] && Math.random() < 0.6;

        if (useLoadedModel) {
          // Clone the loaded model
          const modelClone = loadedModels[modelIdx].clone();
          modelClone.scale.set(0.4, 0.4, 0.4);
          
          // Position it properly
          modelClone.traverse((node) => {
            if (node.isMesh) {
              node.castShadow = true;
              node.receiveShadow = true;
            }
          });
          memberGroup.add(modelClone);
        } else {
          // Procedural fallback
          // Body
          const bodyGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.55, 12);
          const hue = Math.random() * 0.15 + 0.55;
          const bodyColor = new THREE.Color().setHSL(
            hue,
            0.3,
            0.2 + Math.random() * 0.3,
          );
          const bodyMat = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: 0.7,
            metalness: 0.1,
          });
          const body = new THREE.Mesh(bodyGeo, bodyMat);
          body.position.y = 0.28;
          memberGroup.add(body);

          // Head
          const headGeo = new THREE.SphereGeometry(0.14, 12, 12);
          const headColor = new THREE.Color().setHSL(
            0.08,
            0.3,
            0.5 + Math.random() * 0.4,
          );
          const headMat = new THREE.MeshStandardMaterial({
            color: headColor,
            roughness: 0.6,
            metalness: 0.05,
          });
          const head = new THREE.Mesh(headGeo, headMat);
          head.position.y = 0.65;
          memberGroup.add(head);

          // Store for potential animation
          if (Math.random() < 0.3) {
            animationObjects.push({
              mesh: head,
              type: "audience",
              speed: 0.1 + Math.random() * 0.4,
              baseY: head.position.y,
              group: memberGroup,
              offset: Math.random() * Math.PI * 2,
            });
          }
        }

        audienceGroup.add(memberGroup);
      }
    }
    
    // Log model loading status
    setTimeout(() => {
      if (Object.keys(loadedModels).length > 0) {
        console.log(`✓ Audience 3D models loaded: ${Object.keys(loadedModels).length}/3`);
      } else {
        console.log('📍 Using procedural audience (add .gltf models to /models/ for 3D characters)');
      }
    }, 2000);
  }

  function buildParticles() {
    const particlesGeo = new THREE.BufferGeometry();
    const count = 400;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 16;
      positions[i * 3 + 1] = Math.random() * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 14;
      const c = new THREE.Color().setHSL(
        0.15 + Math.random() * 0.1,
        0.8,
        0.5 + Math.random() * 0.5,
      );
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    particlesGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    particlesGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const particlesMat = new THREE.PointsMaterial({
      size: 0.04,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.7,
    });

    particlesSystem = new THREE.Points(particlesGeo, particlesMat);
    scene.add(particlesSystem);
  }

  function buildFloorReflection() {
    // Subtle floor plane in front of stage for reflection-like appearance
    const floorGeo = new THREE.PlaneGeometry(20, 12);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a18,
      roughness: 0.15,
      metalness: 0.9,
      transparent: true,
      opacity: 0.4,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.5, 2);
    floor.receiveShadow = true;
    scene.add(floor);
  }

  function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1);
    const time = performance.now() * 0.001;

    // Animate objects
    animationObjects.forEach((obj) => {
      if (obj.type === "rotate") {
        obj.mesh.rotation.y += obj.speed * dt;
      } else if (obj.type === "nod") {
        obj.mesh.rotation.x = Math.sin(time * 1.5) * 0.08;
      } else if (obj.type === "audience") {
        obj.mesh.position.y =
          obj.baseY + Math.sin(time * obj.speed + obj.offset) * 0.04;
      }
    });

    // Animate particles
    if (particlesSystem) {
      const posArray = particlesSystem.geometry.attributes.position.array;
      for (let i = 0; i < posArray.length; i += 3) {
        posArray[i + 1] += Math.sin(time * 0.7 + i) * 0.003;
        if (posArray[i + 1] > 8) posArray[i + 1] = 0;
        if (posArray[i + 1] < 0) posArray[i + 1] = 8;
      }
      particlesSystem.geometry.attributes.position.needsUpdate = true;
      particlesSystem.rotation.y += dt * 0.06;
    }

    // Subtle spotlight animation
    spotlights.forEach((spot, i) => {
      if (i > 0) {
        spot.intensity = 0.6 + Math.sin(time * 0.8 + i) * 0.25;
      }
    });

    // Subtle camera sway
    camera.position.x += Math.sin(time * 0.3) * 0.008;
    camera.position.y += Math.cos(time * 0.35) * 0.005;
    camera.lookAt(0, 1.5, -3);

    renderer.render(scene, camera);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Flash an answer screen
  function flashAnswerScreen(index, color) {
    if (index >= 0 && index < answerScreenMeshes.length) {
      const mesh = answerScreenMeshes[index];
      const origEmissive = mesh.material.emissive.getHex();
      mesh.material.emissive.setHex(color);
      mesh.material.emissiveIntensity = 1.5;
      setTimeout(() => {
        mesh.material.emissive.setHex(origEmissive);
        mesh.material.emissiveIntensity = 0.5;
      }, 600);
    }
  }

  // Public API
  return {
    init,
    updateQuestionScreen,
    updateAnswerScreen,
    updateAllAnswerScreens,
    flashAnswerScreen,
    getScene: () => scene,
    getCamera: () => camera,
    getAnswerScreenMeshes: () => answerScreenMeshes,
    getQuestionScreenMesh: () => questionScreenMesh,
    animate,
  };
})();
