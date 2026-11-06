import React, { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CollectibleType,
  GameMode,
  HudState,
  LaneIndex,
  ObstacleType,
  STAGES,
  SuitUpgrades,
  TUTORIAL_STEPS,
} from '../types/game';
import { createProceduralTextures } from '../three/proceduralTextures';
import {
  createCollectibleGroup,
  createHeroRunner,
  createObstacleGroup,
  createShadowMonster,
  HeroRunnerRig,
} from '../three/models';
import { soundEngine } from '../audio/soundEngine';

export interface GameCanvasHandle {
  triggerAction: (action: 'left' | 'right' | 'jump' | 'slide') => void;
  startNewRun: (mode: 'playing' | 'tutorial', startingStageId?: number) => void;
}

interface GameCanvasProps {
  gameMode: GameMode;
  upgrades: SuitUpgrades;
  onHudUpdate: (hud: HudState) => void;
  onGameOver: (finalStats: {
    score: number;
    distance: number;
    coins: number;
    diamonds: number;
    stageId: number;
    cause: string;
  }) => void;
  onTutorialComplete: () => void;
  onTogglePause: () => void;
}

interface ActiveObstacle {
  id: number;
  type: ObstacleType;
  lane: LaneIndex;
  z: number;
  mesh: THREE.Group;
  passed: boolean;
  hit: boolean;
  dronePhase: number;
}

interface ActiveCollectible {
  id: number;
  type: CollectibleType;
  lane: LaneIndex;
  y: number;
  z: number;
  mesh: THREE.Group;
  collected: boolean;
}

interface ParticleInstance {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  colorHex: number;
}

// Module-scope scratch math objects (Zero GC in render loop)
const _dummyObj = new THREE.Object3D();
const _scratchColor = new THREE.Color();
const _targetFogColor = new THREE.Color();
const _targetKeyColor = new THREE.Color();
const _targetHemiSky = new THREE.Color();

const LANE_WIDTH = 3.1;
const BUILDING_COUNT = 120;
const LAMP_COUNT = 32;
const OVERPASS_COUNT = 4;
const PARTICLE_COUNT = 96;
const STREAK_COUNT = 80;

export const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(
  ({ gameMode, upgrades, onHudUpdate, onGameOver, onTutorialComplete, onTogglePause }, ref) => {
    const mountRef = useRef<HTMLDivElement | null>(null);

    // Latest prop refs to avoid re-initializing WebGL canvas
    const gameModeRef = useRef<GameMode>(gameMode);
    gameModeRef.current = gameMode;

    const upgradesRef = useRef<SuitUpgrades>(upgrades);
    upgradesRef.current = upgrades;

    const callbacksRef = useRef({
      onHudUpdate,
      onGameOver,
      onTutorialComplete,
      onTogglePause,
    });
    callbacksRef.current = {
      onHudUpdate,
      onGameOver,
      onTutorialComplete,
      onTogglePause,
    };

    // Mutable simulation & biomechanical blend state stored in ref
    const simRef = useRef({
      lane: 0 as LaneIndex,
      currentX: 0,
      lateralVelocity: 0,
      playerY: 0,
      velocityY: 0,
      isJumping: false,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      isSliding: false,
      slideTimer: 0,
      slideBufferTimer: 0,
      runCycleTime: 0,

      // Smooth animation blend weights (0 to 1)
      jumpBlend: 0,
      slideBlend: 0,
      landCompression: 0,
      stumbleImpulse: 0,
      tiltZ: 0,
      yawY: 0,
      slideSparkTimer: 0,

      score: 0,
      distance: 0,
      coins: 0,
      diamonds: 0,
      combo: 1,
      stageIndex: 0,
      speed: STAGES[0].baseSpeed,
      currentSpeed: 12, // Smoothly accelerates up to target speed

      shieldActive: false,
      shieldTimeLeft: 0,
      shieldMaxTime: 8,

      boosterActive: false,
      boosterTimeLeft: 0,
      boosterMaxTime: 6,

      monsterThreat: 38, // 0 to 100
      cameraShake: 0,
      hitstopTimer: 0,
      spawnTimer: 0.8,
      patternCounter: 0,
      nextEntityId: 1,

      stageBannerText: null as string | null,
      stageBannerTimer: 0,
      statusToast: null as string | null,
      statusToastTimer: 0,

      // Tutorial state
      isTutorial: false,
      tutorialStep: 1,
      tutorialProgress: 0,
      tutorialCompletedTimer: 0,
    });

    const actionHandlersRef = useRef<{
      triggerAction: (action: 'left' | 'right' | 'jump' | 'slide') => void;
      startNewRun: (mode: 'playing' | 'tutorial', startingStageId?: number) => void;
    }>({
      triggerAction: () => {},
      startNewRun: () => {},
    });

    useImperativeHandle(ref, () => ({
      triggerAction: (action) => actionHandlersRef.current.triggerAction(action),
      startNewRun: (mode, startingStageId) =>
        actionHandlersRef.current.startNewRun(mode, startingStageId),
    }));

    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      // 1. Software WebGL Detection (Three.js Skill Standard)
      const isSoftwareGl = (() => {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      })();

      // 2. Renderer & Cinematic ACES Filmic Tone Mapping
      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.setSize(
        container.clientWidth || window.innerWidth,
        container.clientHeight || window.innerHeight,
      );
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);

      // 3. Scene, Environment Reflection & Atmospheric Horizon Fog
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(STAGES[0].fogColor);
      scene.fog = new THREE.FogExp2(STAGES[0].fogColor, 0.0105);

      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      pmremGenerator.dispose();

      // 4. Cinematic Third-Person Chase Camera
      const camera = new THREE.PerspectiveCamera(
        58,
        (container.clientWidth || window.innerWidth) /
          (container.clientHeight || window.innerHeight),
        0.1,
        200,
      );
      camera.position.set(0, 3.6, 7.2);
      camera.lookAt(0, 1.35, -14);

      // 5. Realistic Cinematic Night Lighting Rig
      const hemiLight = new THREE.HemisphereLight(
        STAGES[0].hemiSkyColor,
        STAGES[0].hemiGroundColor,
        1.15,
      );
      hemiLight.position.set(0, 50, 0);
      scene.add(hemiLight);

      // Warm Sodium/Moonlight Key Directional Light with crisp shadows
      const keyLight = new THREE.DirectionalLight(STAGES[0].keyLightColor, 2.4);
      keyLight.position.set(14, 28, 16);
      keyLight.castShadow = !isSoftwareGl;
      if (!isSoftwareGl) {
        keyLight.shadow.mapSize.width = 1024;
        keyLight.shadow.mapSize.height = 1024;
        const d = 15;
        keyLight.shadow.camera.left = -d;
        keyLight.shadow.camera.right = d;
        keyLight.shadow.camera.top = d;
        keyLight.shadow.camera.bottom = -d;
        keyLight.shadow.camera.near = 1;
        keyLight.shadow.camera.far = 65;
        keyLight.shadow.bias = -0.0005;
        keyLight.shadow.normalBias = 0.02;
      }
      scene.add(keyLight);

      // Cool Atmospheric Back/Rim Light separating silhouettes from night fog
      const rimLight = new THREE.DirectionalLight(0x60a5fa, 1.35);
      rimLight.position.set(-12, 10, -24);
      scene.add(rimLight);

      // Local Streetlamp / Hero Fill Light
      const heroPointLight = new THREE.PointLight(0xfde68a, 1.8, 16, 2);
      heroPointLight.position.set(0, 3.4, 2.0);
      scene.add(heroPointLight);

      // 6. High-Resolution Procedural PBR Textures
      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      const textures = createProceduralTextures(maxAniso);

      // 7. Realistic Wet Asphalt Highway Deck (PBR Clearcoat + Roughness + Bump Map)
      const roadGeo = new THREE.PlaneGeometry(11.4, 230);
      roadGeo.rotateX(-Math.PI / 2);
      const roadMat = new THREE.MeshPhysicalMaterial({
        map: textures.roadTexture,
        roughnessMap: textures.roadRoughnessMap,
        bumpMap: textures.roadBumpMap,
        bumpScale: 0.018,
        metalness: 0.18,
        roughness: 0.72,
        clearcoat: 0.65,
        clearcoatRoughness: 0.16,
      });
      const roadMesh = new THREE.Mesh(roadGeo, roadMat);
      roadMesh.position.set(0, 0, -90);
      roadMesh.receiveShadow = !isSoftwareGl;
      scene.add(roadMesh);

      // Concrete Viaduct Substructure Deck & Sidewalks
      const sidewalkGeo = new THREE.BoxGeometry(2.4, 0.24, 230);
      const concreteMat = new THREE.MeshStandardMaterial({
        map: textures.concreteTexture,
        roughness: 0.85,
        metalness: 0.1,
      });
      const leftWalk = new THREE.Mesh(sidewalkGeo, concreteMat);
      leftWalk.position.set(-6.9, 0.12, -90);
      const rightWalk = new THREE.Mesh(sidewalkGeo, concreteMat);
      rightWalk.position.set(6.9, 0.12, -90);
      scene.add(leftWalk, rightWalk);

      // Highway Concrete Jersey Barriers & Steel Guardrails along Both Shoulders
      const barrierGeo = new THREE.BoxGeometry(0.48, 0.75, 230);
      const leftBarrier = new THREE.Mesh(barrierGeo, concreteMat);
      leftBarrier.position.set(-5.75, 0.375, -90);
      const rightBarrier = new THREE.Mesh(barrierGeo, concreteMat);
      rightBarrier.position.set(5.75, 0.375, -90);
      scene.add(leftBarrier, rightBarrier);

      const railGeo = new THREE.BoxGeometry(0.14, 0.16, 230);
      const steelMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.85,
        roughness: 0.28,
      });
      const leftRail = new THREE.Mesh(railGeo, steelMat);
      leftRail.position.set(-5.52, 0.82, -90);
      const rightRail = new THREE.Mesh(railGeo, steelMat);
      rightRail.position.set(5.52, 0.82, -90);
      scene.add(leftRail, rightRail);

      // Lower Metropolitan Ground Plane
      const groundGeo = new THREE.PlaneGeometry(260, 260);
      groundGeo.rotateX(-Math.PI / 2);
      const groundMat = new THREE.MeshBasicMaterial({ color: 0x050811 });
      const groundMesh = new THREE.Mesh(groundGeo, groundMat);
      groundMesh.position.set(0, -0.5, -90);
      scene.add(groundMesh);

      // 8. Realistic Glass & Concrete Skyscrapers (InstancedMesh + Setback Penthouses)
      const bldgGeo = new THREE.BoxGeometry(1, 1, 1);
      bldgGeo.translate(0, 0.5, 0);
      const bldgMat = new THREE.MeshStandardMaterial({
        map: textures.buildingTexture,
        roughnessMap: textures.buildingRoughnessMap,
        emissiveMap: textures.buildingEmissiveMap,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.75,
        metalness: 0.72,
        roughness: 0.25,
      });
      const buildingInstanced = new THREE.InstancedMesh(bldgGeo, bldgMat, BUILDING_COUNT);
      buildingInstanced.frustumCulled = false;

      // Rooftop Mechanical Penthouse / Setback Crown InstancedMesh
      const crownGeo = new THREE.BoxGeometry(0.72, 1, 0.72);
      crownGeo.translate(0, 0.5, 0);
      const crownInstanced = new THREE.InstancedMesh(crownGeo, concreteMat, BUILDING_COUNT);
      crownInstanced.frustumCulled = false;

      const buildingData: {
        x: number;
        z: number;
        sx: number;
        sy: number;
        sz: number;
        crownH: number;
      }[] = [];
      // Realistic architectural glass tints (cool slate, steel blue, warm bronze-gray, neutral charcoal)
      const bldgPalette = [0xcbd5e1, 0x94a3b8, 0xbfdbfe, 0xe2e8f0, 0x9ca3af, 0xd1d5db];

      for (let i = 0; i < BUILDING_COUNT; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const row = Math.floor(i / 2);
        const tier = i % 4 < 2 ? 0 : 1;
        const x = side * (12.2 + tier * 10.5 + (i % 3) * 1.9);
        const z = 18 - (row % 30) * 7.2;
        const sx = 5.0 + (i % 5) * 1.3;
        const sy = 18 + ((i * 19) % 42);
        const sz = 5.2 + (i % 4) * 1.3;
        const crownH = 2.2 + (i % 3) * 1.4;

        buildingData.push({ x, z, sx, sy, sz, crownH });

        _dummyObj.position.set(x, -0.5, z);
        _dummyObj.scale.set(sx, sy, sz);
        _dummyObj.rotation.set(0, 0, 0);
        _dummyObj.updateMatrix();
        buildingInstanced.setMatrixAt(i, _dummyObj.matrix);

        _dummyObj.position.set(x, sy - 0.5, z);
        _dummyObj.scale.set(sx, crownH, sz);
        _dummyObj.updateMatrix();
        crownInstanced.setMatrixAt(i, _dummyObj.matrix);

        _scratchColor.setHex(bldgPalette[i % bldgPalette.length]);
        buildingInstanced.setColorAt(i, _scratchColor);
      }
      buildingInstanced.instanceMatrix.needsUpdate = true;
      crownInstanced.instanceMatrix.needsUpdate = true;
      if (buildingInstanced.instanceColor) buildingInstanced.instanceColor.needsUpdate = true;
      scene.add(buildingInstanced, crownInstanced);

      // 9. Cantilevered Highway Streetlights (Pole + Overhang Arm + Warm Sodium/LED Luminaire)
      const poleGeo = new THREE.CylinderGeometry(0.08, 0.13, 7.2, 8);
      poleGeo.translate(0, 3.6, 0);
      const poleInstanced = new THREE.InstancedMesh(poleGeo, steelMat, LAMP_COUNT);
      poleInstanced.frustumCulled = false;

      const armGeo = new THREE.BoxGeometry(2.1, 0.1, 0.12);
      const armInstanced = new THREE.InstancedMesh(armGeo, steelMat, LAMP_COUNT);
      armInstanced.frustumCulled = false;

      const bulbGeo = new THREE.BoxGeometry(0.55, 0.08, 0.24);
      const bulbMat = new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        emissive: 0xf59e0b,
        emissiveIntensity: 2.6,
      });
      const bulbInstanced = new THREE.InstancedMesh(bulbGeo, bulbMat, LAMP_COUNT);
      bulbInstanced.frustumCulled = false;

      const lampZ: number[] = [];
      for (let i = 0; i < LAMP_COUNT; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const pairIdx = Math.floor(i / 2);
        const z = 12 - pairIdx * 13.5;
        lampZ.push(z);

        // Pole on shoulder
        _dummyObj.position.set(side * 6.0, 0, z);
        _dummyObj.scale.set(1, 1, 1);
        _dummyObj.rotation.set(0, 0, 0);
        _dummyObj.updateMatrix();
        poleInstanced.setMatrixAt(i, _dummyObj.matrix);

        // Cantilever arm reaching over the highway lane
        _dummyObj.position.set(side * 5.0, 7.1, z);
        _dummyObj.rotation.set(0, 0, side * 0.12);
        _dummyObj.updateMatrix();
        armInstanced.setMatrixAt(i, _dummyObj.matrix);

        // Glowing streetlamp fixture head
        _dummyObj.position.set(side * 4.15, 7.18, z);
        _dummyObj.rotation.set(0, 0, 0);
        _dummyObj.updateMatrix();
        bulbInstanced.setMatrixAt(i, _dummyObj.matrix);
      }
      poleInstanced.instanceMatrix.needsUpdate = true;
      armInstanced.instanceMatrix.needsUpdate = true;
      bulbInstanced.instanceMatrix.needsUpdate = true;
      scene.add(poleInstanced, armInstanced, bulbInstanced);

      // 10. Realistic Highway Overpass Bridges & Overhead Signage Trusses
      const overpassGroups: THREE.Group[] = [];
      const signMat = new THREE.MeshStandardMaterial({
        map: textures.highwaySignTexture,
        roughness: 0.35,
        metalness: 0.2,
      });

      for (let i = 0; i < OVERPASS_COUNT; i++) {
        const opGroup = new THREE.Group();
        const zPos = -20 - i * 54;
        opGroup.position.set(0, 0, zPos);

        // Left & Right Concrete Bridge Piers
        const pierGeo = new THREE.BoxGeometry(0.95, 8.8, 1.4);
        const leftPier = new THREE.Mesh(pierGeo, concreteMat);
        leftPier.position.set(-6.6, 4.4, 0);
        const rightPier = new THREE.Mesh(pierGeo, concreteMat);
        rightPier.position.set(6.6, 4.4, 0);

        // Overhead Steel Box Girder Deck
        const girder = new THREE.Mesh(
          new THREE.BoxGeometry(15.2, 1.15, 2.2),
          steelMat,
        );
        girder.position.set(0, 8.6, 0);

        // Illuminated Highway Signboard Mounted on Overpass Front
        const signBoard = new THREE.Mesh(
          new THREE.PlaneGeometry(6.8, 1.55),
          signMat,
        );
        signBoard.position.set(0, 8.5, 1.14);

        opGroup.add(leftPier, rightPier, girder, signBoard);
        scene.add(opGroup);
        overpassGroups.push(opGroup);
      }

      // 11. Pooled 3D Particle System (Sparks, Dust, Debris & Mist)
      const particleGeo = new THREE.DodecahedronGeometry(0.09, 0);
      const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const particleInstanced = new THREE.InstancedMesh(particleGeo, particleMat, PARTICLE_COUNT);
      particleInstanced.frustumCulled = false;

      const particles: ParticleInstance[] = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
          active: false,
          x: 0,
          y: -100,
          z: 0,
          vx: 0,
          vy: 0,
          vz: 0,
          life: 0,
          maxLife: 0.5,
          scale: 1,
          colorHex: 0xf59e0b,
        });
        _dummyObj.position.set(0, -100, 0);
        _dummyObj.scale.setScalar(0.001);
        _dummyObj.updateMatrix();
        particleInstanced.setMatrixAt(i, _dummyObj.matrix);
        _scratchColor.setHex(0xf59e0b);
        particleInstanced.setColorAt(i, _scratchColor);
      }
      particleInstanced.instanceMatrix.needsUpdate = true;
      if (particleInstanced.instanceColor) particleInstanced.instanceColor.needsUpdate = true;
      scene.add(particleInstanced);

      function spawnParticleBurst(
        x: number,
        y: number,
        z: number,
        colorHex: number,
        count = 16,
        spreadSpeed = 8,
      ) {
        let spawned = 0;
        for (let i = 0; i < PARTICLE_COUNT && spawned < count; i++) {
          const p = particles[i];
          if (!p.active) {
            p.active = true;
            p.x = x + (Math.random() - 0.5) * 0.45;
            p.y = y + (Math.random() - 0.5) * 0.35;
            p.z = z + (Math.random() - 0.5) * 0.45;
            p.vx = (Math.random() - 0.5) * spreadSpeed;
            p.vy = 1.8 + Math.random() * (spreadSpeed * 0.75);
            p.vz = (Math.random() - 0.5) * spreadSpeed;
            p.maxLife = 0.28 + Math.random() * 0.32;
            p.life = p.maxLife;
            p.scale = 0.7 + Math.random() * 0.85;
            p.colorHex = colorHex;
            _scratchColor.setHex(colorHex);
            particleInstanced.setColorAt(i, _scratchColor);
            spawned++;
          }
        }
        if (particleInstanced.instanceColor) particleInstanced.instanceColor.needsUpdate = true;
      }

      // 12. High-Speed Motion Blur / Atmospheric Rain & Wind Streaks (InstancedMesh)
      const streakGeo = new THREE.BoxGeometry(0.018, 0.018, 1.8);
      const streakMat = new THREE.MeshBasicMaterial({
        color: 0x94a3b8,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      });
      const streakInstanced = new THREE.InstancedMesh(streakGeo, streakMat, STREAK_COUNT);
      streakInstanced.frustumCulled = false;

      const streakData: { x: number; y: number; z: number; speedMul: number }[] = [];
      for (let i = 0; i < STREAK_COUNT; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const x = (Math.random() - 0.5) * 14 + side * 1.5;
        const y = 0.4 + Math.random() * 6.5;
        const z = 8 - Math.random() * 90;
        streakData.push({ x, y, z, speedMul: 1.2 + Math.random() * 0.6 });
        _dummyObj.position.set(x, y, z);
        _dummyObj.scale.set(1, 1, 1);
        _dummyObj.rotation.set(0.04, 0, 0);
        _dummyObj.updateMatrix();
        streakInstanced.setMatrixAt(i, _dummyObj.matrix);
      }
      streakInstanced.instanceMatrix.needsUpdate = true;
      scene.add(streakInstanced);

      // 13. Create Articulated Human Runner & Chasing Void Stalker
      const hero = createHeroRunner(textures.contactShadowTexture, isSoftwareGl);
      scene.add(hero.root);

      const monster = createShadowMonster(isSoftwareGl);
      monster.root.position.set(0, 0.2, 4.8);
      scene.add(monster.root);

      // =========================================================================
      // REALISTIC BIOMECHANICAL POSE & BLENDING SOLVER (Zero Foot Sliding)
      // =========================================================================
      function updateHeroBiomechanics(
        rig: HeroRunnerRig,
        phase: number,
        jumpBlend: number,
        slideBlend: number,
        landCompression: number,
        tiltZ: number,
        yawY: number,
        boosterActive: boolean,
      ) {
        const runWeight = Math.max(0, 1 - Math.max(jumpBlend, slideBlend));

        // 1. Natural Sprint Cycle Joint Angles (Left & Right 180° out of phase)
        const lSin = Math.sin(phase);
        const lCos = Math.cos(phase);
        const rSin = Math.sin(phase + Math.PI);
        const rCos = Math.cos(phase + Math.PI);

        // Hip swing: high knee drive forward (+0.76 rad), full extension backward (-0.62 rad)
        const runHipL = lSin * 0.68 + 0.08;
        const runHipR = rSin * 0.68 + 0.08;

        // Knee flexion: bends backward (-0.15 to -1.35 rad) during swing recovery
        const runKneeL = -(Math.max(0, -lCos) * 1.18 + 0.16 + landCompression * 0.45);
        const runKneeR = -(Math.max(0, -rCos) * 1.18 + 0.16 + landCompression * 0.45);

        // Ankle pitch: keeps boot sole parallel at ground strike & plantarflexes on push-off
        const runAnkleL = lCos * 0.28 - runHipL * 0.35 - runKneeL * 0.35;
        const runAnkleR = rCos * 0.28 - runHipR * 0.35 - runKneeR * 0.35;

        // Arm swing: opposite to legs, with realistic 85°–115° elbow bend
        const runShoulderL = rSin * 0.64 - 0.08;
        const runShoulderR = lSin * 0.64 - 0.08;
        const runElbowL = 0.88 + Math.max(0, rSin) * 0.52;
        const runElbowR = 0.88 + Math.max(0, lSin) * 0.52;

        // 2. Athletic Jump Pose (Lead knee driven high, trailing leg extended, arms balanced)
        const jumpHipL = 0.92;
        const jumpKneeL = -1.18;
        const jumpAnkleL = 0.25;
        const jumpHipR = -0.38;
        const jumpKneeR = -0.68;
        const jumpAnkleR = -0.32;
        const jumpShoulderL = 0.55;
        const jumpElbowL = 1.05;
        const jumpShoulderR = -0.35;
        const jumpElbowR = 0.95;

        // 3. Tactical Combat Slide Pose (Low baseball/knee slide under laser gates)
        const slideHipL = 1.12;
        const slideKneeL = -0.18;
        const slideAnkleL = -0.25;
        const slideHipR = 0.35;
        const slideKneeR = -1.52;
        const slideAnkleR = 0.35;
        const slideShoulderL = -0.58;
        const slideElbowL = 0.75;
        const slideShoulderR = 0.45;
        const slideElbowR = 1.1;

        // Blend Joint Rotations Smoothly
        rig.leftHip.rotation.x =
          runHipL * runWeight + jumpHipL * jumpBlend + slideHipL * slideBlend;
        rig.leftKnee.rotation.x =
          runKneeL * runWeight + jumpKneeL * jumpBlend + slideKneeL * slideBlend;
        rig.leftAnkle.rotation.x =
          runAnkleL * runWeight + jumpAnkleL * jumpBlend + slideAnkleL * slideBlend;

        rig.rightHip.rotation.x =
          runHipR * runWeight + jumpHipR * jumpBlend + slideHipR * slideBlend;
        rig.rightKnee.rotation.x =
          runKneeR * runWeight + jumpKneeR * jumpBlend + slideKneeR * slideBlend;
        rig.rightAnkle.rotation.x =
          runAnkleR * runWeight + jumpAnkleR * jumpBlend + slideAnkleR * slideBlend;

        rig.leftShoulder.rotation.x =
          runShoulderL * runWeight + jumpShoulderL * jumpBlend + slideShoulderL * slideBlend;
        rig.leftShoulder.rotation.z = 0.12 + slideBlend * 0.22;
        rig.leftElbow.rotation.x =
          runElbowL * runWeight + jumpElbowL * jumpBlend + slideElbowL * slideBlend;

        rig.rightShoulder.rotation.x =
          runShoulderR * runWeight + jumpShoulderR * jumpBlend + slideShoulderR * slideBlend;
        rig.rightShoulder.rotation.z = -0.12 - slideBlend * 0.22;
        rig.rightElbow.rotation.x =
          runElbowR * runWeight + jumpElbowR * jumpBlend + slideElbowR * slideBlend;

        // Pelvis vertical stride bounce + slide hip drop + landing knee absorption
        const strideBounce = Math.abs(Math.sin(phase)) * 0.065 * runWeight;
        const basePelvisY = 0.95 - slideBlend * 0.56 - landCompression * 0.14 + strideBounce;
        rig.pelvisGroup.position.y = simRef.current.playerY + basePelvisY;
        rig.pelvisGroup.rotation.z = tiltZ * 0.65 + lSin * 0.035 * runWeight;
        rig.pelvisGroup.rotation.y = yawY + lSin * 0.08 * runWeight + slideBlend * 0.28;

        // Spine forward sprint lean, slide recline & counter-rotation twist
        const sprintLean = (boosterActive ? 0.32 : 0.21) + landCompression * 0.18;
        rig.spineGroup.rotation.x =
          sprintLean * runWeight + 0.16 * jumpBlend - 0.68 * slideBlend;
        rig.spineGroup.rotation.y = -lSin * 0.16 * runWeight - slideBlend * 0.22;
        rig.spineGroup.rotation.z = tiltZ * 0.45;

        // Head stabilizes gaze forward down the expressway
        rig.headGroup.rotation.x =
          -0.12 * runWeight - 0.05 * jumpBlend + 0.52 * slideBlend;
        rig.headGroup.rotation.y = lSin * 0.08 * runWeight - yawY * 0.5;
      }

      // Active dynamic obstacles & collectibles
      const activeObstacles: ActiveObstacle[] = [];
      const activeCollectibles: ActiveCollectible[] = [];

      function clearDynamicEntities() {
        for (const obs of activeObstacles) {
          scene.remove(obs.mesh);
        }
        activeObstacles.length = 0;

        for (const col of activeCollectibles) {
          scene.remove(col.mesh);
        }
        activeCollectibles.length = 0;
      }

      function spawnObstacle(type: ObstacleType, lane: LaneIndex, zPos: number) {
        const mesh = createObstacleGroup(type, textures.hazardTexture, textures.contactShadowTexture);
        mesh.position.set(lane * LANE_WIDTH, 0, zPos);
        scene.add(mesh);
        activeObstacles.push({
          id: simRef.current.nextEntityId++,
          type,
          lane,
          z: zPos,
          mesh,
          passed: false,
          hit: false,
          dronePhase: Math.random() * Math.PI * 2,
        });
      }

      function spawnCollectible(type: CollectibleType, lane: LaneIndex, zPos: number, yPos = 1.15) {
        const mesh = createCollectibleGroup(type, isSoftwareGl);
        mesh.position.set(lane * LANE_WIDTH, yPos, zPos);
        scene.add(mesh);
        activeCollectibles.push({
          id: simRef.current.nextEntityId++,
          type,
          lane,
          y: yPos,
          z: zPos,
          mesh,
          collected: false,
        });
      }

      function syncHudNow() {
        const s = simRef.current;
        const stage = STAGES[s.stageIndex] || STAGES[0];
        let tutorialInfo = null;
        if (s.isTutorial) {
          const baseStep = TUTORIAL_STEPS[Math.min(s.tutorialStep - 1, TUTORIAL_STEPS.length - 1)];
          tutorialInfo = {
            ...baseStep,
            progress: s.tutorialProgress,
          };
        }
        callbacksRef.current.onHudUpdate({
          score: Math.floor(s.score),
          distance: Math.floor(s.distance),
          coins: s.coins,
          diamonds: s.diamonds,
          stage,
          speed: Math.round(s.currentSpeed * (s.boosterActive ? 1.45 : 1) * 3.6),
          shieldActive: s.shieldActive,
          shieldTimeLeft: s.shieldTimeLeft,
          shieldMaxTime: s.shieldMaxTime,
          boosterActive: s.boosterActive,
          boosterTimeLeft: s.boosterTimeLeft,
          boosterMaxTime: s.boosterMaxTime,
          monsterThreat: Math.round(s.monsterThreat),
          combo: s.combo,
          stageBannerText: s.stageBannerTimer > 0 ? s.stageBannerText : null,
          tutorialInfo,
          statusToast: s.statusToastTimer > 0 ? s.statusToast : null,
        });
      }

      // Initialize a new run or tutorial
      function startNewRun(mode: 'playing' | 'tutorial', startingStageId: number = 1) {
        clearDynamicEntities();
        const s = simRef.current;
        const startIdx = Math.max(0, Math.min(STAGES.length - 1, startingStageId - 1));
        const stg = STAGES[startIdx];

        s.lane = 0;
        s.currentX = 0;
        s.lateralVelocity = 0;
        s.playerY = 0;
        s.velocityY = 0;
        s.isJumping = false;
        s.coyoteTimer = 0;
        s.jumpBufferTimer = 0;
        s.isSliding = false;
        s.slideTimer = 0;
        s.slideBufferTimer = 0;
        s.runCycleTime = 0;

        s.jumpBlend = 0;
        s.slideBlend = 0;
        s.landCompression = 0;
        s.stumbleImpulse = 0;
        s.tiltZ = 0;
        s.yawY = 0;

        s.score = 0;
        s.distance = stg.minDistance;
        s.coins = 0;
        s.diamonds = 0;
        s.combo = 1;
        s.stageIndex = startIdx;
        s.speed = stg.baseSpeed;
        s.currentSpeed = stg.baseSpeed * 0.65; // Smooth initial acceleration

        s.shieldMaxTime = 7 + upgradesRef.current.shieldDurationLevel * 1.5;
        s.boosterMaxTime = 5 + upgradesRef.current.boosterDurationLevel * 1.2;
        s.shieldActive = false;
        s.shieldTimeLeft = 0;
        s.boosterActive = false;
        s.boosterTimeLeft = 0;

        s.monsterThreat = 42;
        s.cameraShake = 0;
        s.hitstopTimer = 0;
        s.spawnTimer = 0.6;
        s.patternCounter = 0;

        s.isTutorial = mode === 'tutorial';
        s.tutorialStep = 1;
        s.tutorialProgress = 0;
        s.tutorialCompletedTimer = 0;

        if (mode === 'tutorial') {
          s.stageBannerText = 'INTERACTIVE TRAINING — PROTOCOL ACTIVE';
          s.stageBannerTimer = 2.4;
        } else {
          s.stageBannerText = `${stg.name}: ${stg.subtitle}`;
          s.stageBannerTimer = 2.6;
        }
        s.statusToast = null;
        s.statusToastTimer = 0;

        soundEngine.startMusic(stg.id);
        soundEngine.playMonsterGrowl();
        syncHudNow();
      }

      // Handle discrete player actions
      function triggerAction(action: 'left' | 'right' | 'jump' | 'slide') {
        const mode = gameModeRef.current;
        if (mode !== 'playing' && mode !== 'tutorial') return;

        const s = simRef.current;
        if (action === 'left') {
          if (s.lane > -1) {
            s.lane = (s.lane - 1) as LaneIndex;
            s.tiltZ = 0.34;
            s.yawY = 0.26;
            soundEngine.playLaneShift();
            spawnParticleBurst(s.currentX, 0.1, 0, 0x94a3b8, 6, 4);
            if (s.isTutorial && s.tutorialStep === 1) {
              s.tutorialProgress++;
              checkTutorialStepAdvance();
            }
          }
        } else if (action === 'right') {
          if (s.lane < 1) {
            s.lane = (s.lane + 1) as LaneIndex;
            s.tiltZ = -0.34;
            s.yawY = -0.26;
            soundEngine.playLaneShift();
            spawnParticleBurst(s.currentX, 0.1, 0, 0x94a3b8, 6, 4);
            if (s.isTutorial && s.tutorialStep === 1) {
              s.tutorialProgress++;
              checkTutorialStepAdvance();
            }
          }
        } else if (action === 'jump') {
          s.jumpBufferTimer = 0.16;
        } else if (action === 'slide') {
          s.slideBufferTimer = 0.16;
        }
      }

      function checkTutorialStepAdvance() {
        const s = simRef.current;
        if (!s.isTutorial) return;
        const stepDef = TUTORIAL_STEPS[s.tutorialStep - 1];
        if (!stepDef) return;

        if (s.tutorialProgress >= stepDef.target) {
          soundEngine.playStageUp();
          if (s.tutorialStep < 4) {
            s.tutorialStep++;
            s.tutorialProgress = 0;
            clearDynamicEntities();
            s.spawnTimer = 0.35;
            const nextDef = TUTORIAL_STEPS[s.tutorialStep - 1];
            s.statusToast = `STEP COMPLETE! NEXT: ${nextDef.title.toUpperCase()}`;
            s.statusToastTimer = 2.0;
          } else {
            s.isTutorial = false;
            s.stageBannerText = 'TRAINING COMPLETE — ENTERING STAGE 01';
            s.stageBannerTimer = 2.8;
            s.statusToast = 'SURVIVAL RUN ENGAGED!';
            s.statusToastTimer = 2.2;
            callbacksRef.current.onTutorialComplete();
          }
        }
        syncHudNow();
      }

      actionHandlersRef.current = {
        triggerAction,
        startNewRun,
      };

      // Pre-warm shaders on GPU
      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      // Keyboard Controls
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.repeat) return;
        const code = e.code;
        if (code === 'KeyP' || code === 'Escape') {
          if (
            gameModeRef.current === 'playing' ||
            gameModeRef.current === 'tutorial' ||
            gameModeRef.current === 'paused'
          ) {
            e.preventDefault();
            callbacksRef.current.onTogglePause();
          }
          return;
        }
        if (gameModeRef.current !== 'playing' && gameModeRef.current !== 'tutorial') return;

        if (code === 'ArrowLeft' || code === 'KeyA') {
          e.preventDefault();
          triggerAction('left');
        } else if (code === 'ArrowRight' || code === 'KeyD') {
          e.preventDefault();
          triggerAction('right');
        } else if (code === 'ArrowUp' || code === 'KeyW' || code === 'Space') {
          e.preventDefault();
          triggerAction('jump');
        } else if (code === 'ArrowDown' || code === 'KeyS') {
          e.preventDefault();
          triggerAction('slide');
        }
      };

      window.addEventListener('keydown', handleKeyDown);

      // Touch Swipe Controls on Canvas
      let touchStartX = 0;
      let touchStartY = 0;
      let touchHandled = false;

      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 0) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchHandled = false;
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (touchHandled || e.touches.length === 0) return;
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        if (Math.max(absX, absY) > 22) {
          touchHandled = true;
          if (absX > absY) {
            triggerAction(dx > 0 ? 'right' : 'left');
          } else {
            triggerAction(dy > 0 ? 'slide' : 'jump');
          }
        }
      };

      const domElem = renderer.domElement;
      domElem.addEventListener('touchstart', handleTouchStart, { passive: true });
      domElem.addEventListener('touchmove', handleTouchMove, { passive: true });

      // Resize Handler
      const handleResize = () => {
        if (!container) return;
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', handleResize);

      // 14. Software WebGL Fence Pacing & Main Animation Loop
      let frameId = 0;
      let disposed = false;
      const clock = new THREE.Clock();
      let hudUpdateAccumulator = 0;

      function afterDraw(cb: () => void) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (!gl || !gl.fenceSync) {
          frameId = window.setTimeout(cb, 80);
          return;
        }
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      }

      function scrollEnvironment(scrollSpeed: number, dt: number) {
        // 1:1 Synchronized road texture scroll (prevents foot sliding!)
        const roadScrollAmount = scrollSpeed * dt * 0.062;
        textures.roadTexture.offset.y -= roadScrollAmount;
        textures.roadRoughnessMap.offset.y -= roadScrollAmount;

        // Scroll skyscrapers & rooftop penthouses
        for (let i = 0; i < BUILDING_COUNT; i++) {
          const b = buildingData[i];
          b.z += scrollSpeed * dt;
          if (b.z > 24) b.z -= 216;
          _dummyObj.position.set(b.x, -0.5, b.z);
          _dummyObj.scale.set(b.sx, b.sy, b.sz);
          _dummyObj.rotation.set(0, 0, 0);
          _dummyObj.updateMatrix();
          buildingInstanced.setMatrixAt(i, _dummyObj.matrix);

          _dummyObj.position.set(b.x, b.sy - 0.5, b.z);
          _dummyObj.scale.set(b.sx, b.crownH, b.sz);
          _dummyObj.updateMatrix();
          crownInstanced.setMatrixAt(i, _dummyObj.matrix);
        }
        buildingInstanced.instanceMatrix.needsUpdate = true;
        crownInstanced.instanceMatrix.needsUpdate = true;

        // Scroll cantilevered highway streetlights
        for (let i = 0; i < LAMP_COUNT; i++) {
          const side = i % 2 === 0 ? -1 : 1;
          lampZ[i] += scrollSpeed * dt;
          if (lampZ[i] > 20) lampZ[i] -= 216;

          _dummyObj.position.set(side * 6.0, 0, lampZ[i]);
          _dummyObj.scale.set(1, 1, 1);
          _dummyObj.rotation.set(0, 0, 0);
          _dummyObj.updateMatrix();
          poleInstanced.setMatrixAt(i, _dummyObj.matrix);

          _dummyObj.position.set(side * 5.0, 7.1, lampZ[i]);
          _dummyObj.rotation.set(0, 0, side * 0.12);
          _dummyObj.updateMatrix();
          armInstanced.setMatrixAt(i, _dummyObj.matrix);

          _dummyObj.position.set(side * 4.15, 7.18, lampZ[i]);
          _dummyObj.rotation.set(0, 0, 0);
          _dummyObj.updateMatrix();
          bulbInstanced.setMatrixAt(i, _dummyObj.matrix);
        }
        poleInstanced.instanceMatrix.needsUpdate = true;
        armInstanced.instanceMatrix.needsUpdate = true;
        bulbInstanced.instanceMatrix.needsUpdate = true;

        // Scroll highway overpass bridges
        for (let i = 0; i < OVERPASS_COUNT; i++) {
          const op = overpassGroups[i];
          op.position.z += scrollSpeed * dt;
          if (op.position.z > 22) op.position.z -= 216;
        }

        // Scroll high-speed motion blur & rain/wind streaks
        const streakScaleZ = THREE.MathUtils.clamp((scrollSpeed - 14) / 14, 0.35, 2.4);
        streakMat.opacity = THREE.MathUtils.clamp((scrollSpeed - 15) * 0.018, 0.14, 0.48);
        for (let i = 0; i < STREAK_COUNT; i++) {
          const st = streakData[i];
          st.z += scrollSpeed * st.speedMul * dt * 1.45;
          if (st.z > 12) {
            st.z = -85 - Math.random() * 20;
          }
          _dummyObj.position.set(st.x, st.y, st.z);
          _dummyObj.scale.set(1, 1, streakScaleZ);
          _dummyObj.rotation.set(0.05, 0, 0);
          _dummyObj.updateMatrix();
          streakInstanced.setMatrixAt(i, _dummyObj.matrix);
        }
        streakInstanced.instanceMatrix.needsUpdate = true;
      }

      function spawnWaveForStage() {
        const s = simRef.current;
        const zSpawn = -98;

        // Tutorial Custom Spawning
        if (s.isTutorial) {
          if (s.tutorialStep === 1) {
            const lanes: LaneIndex[] = [-1, 0, 1];
            const laneChoice = lanes[s.patternCounter % 3];
            spawnCollectible('coin', laneChoice, zSpawn + 25);
            spawnCollectible('coin', laneChoice, zSpawn + 20);
          } else if (s.tutorialStep === 2) {
            spawnObstacle('low_barrier', s.lane, zSpawn + 28);
            spawnCollectible('coin', s.lane, zSpawn + 28, 2.5);
          } else if (s.tutorialStep === 3) {
            spawnObstacle('high_laser', s.lane, zSpawn + 28);
            spawnCollectible('coin', s.lane, zSpawn + 28, 0.65);
          } else if (s.tutorialStep === 4) {
            const types: CollectibleType[] = ['coin', 'diamond', 'shield', 'booster'];
            const lanes: LaneIndex[] = [-1, 0, 1];
            const t = types[s.patternCounter % types.length];
            const l = lanes[s.patternCounter % 3];
            spawnCollectible(t, l, zSpawn + 32);
          }
          s.patternCounter++;
          return;
        }

        // Standard 5-Stage Procedural Gauntlet Spawner
        const stgId = STAGES[s.stageIndex].id;
        const lanes: LaneIndex[] = [-1, 0, 1];
        for (let i = lanes.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
        }

        const primaryLane = lanes[0];
        const secondaryLane = lanes[1];
        const freeLane = lanes[2];

        const roll = Math.random();
        let obsType: ObstacleType = 'low_barrier';
        if (stgId === 1) {
          obsType = roll < 0.45 ? 'low_barrier' : roll < 0.78 ? 'blockade' : 'high_laser';
        } else if (stgId === 2) {
          obsType = roll < 0.35 ? 'high_laser' : roll < 0.7 ? 'low_barrier' : 'blockade';
        } else {
          obsType =
            roll < 0.28
              ? 'drone'
              : roll < 0.54
                ? 'high_laser'
                : roll < 0.78
                  ? 'low_barrier'
                  : 'blockade';
        }

        spawnObstacle(obsType, primaryLane, zSpawn);

        if (stgId >= 2 && Math.random() < 0.45 + stgId * 0.08) {
          const secondType: ObstacleType =
            Math.random() < 0.5 ? 'blockade' : Math.random() < 0.5 ? 'low_barrier' : 'high_laser';
          spawnObstacle(secondType, secondaryLane, zSpawn);
        }

        const rewardRoll = Math.random();
        if (rewardRoll < 0.09) {
          spawnCollectible('shield', freeLane, zSpawn - 3);
        } else if (rewardRoll < 0.17) {
          spawnCollectible('booster', freeLane, zSpawn - 3);
        } else if (rewardRoll < 0.32) {
          spawnCollectible('diamond', freeLane, zSpawn - 2, 1.35);
        } else {
          for (let c = 0; c < 3; c++) {
            spawnCollectible('coin', freeLane, zSpawn - c * 3.8);
          }
        }

        if (obsType === 'low_barrier' && Math.random() < 0.65) {
          spawnCollectible('coin', primaryLane, zSpawn, 2.55);
        }
      }

      function tick() {
        if (disposed) return;
        const rawDt = clock.getDelta();
        const dt = Math.min(rawDt, 0.05);
        const elapsed = clock.getElapsedTime();
        const mode = gameModeRef.current;
        const s = simRef.current;

        // Hitstop freeze for heavy collision feedback
        if (s.hitstopTimer > 0) {
          s.hitstopTimer -= dt;
          renderer.render(scene, camera);
          if (isSoftwareGl) afterDraw(tick);
          else frameId = requestAnimationFrame(tick);
          return;
        }

        // Title Screen Atmospheric Live-World Showcase
        if (mode === 'title') {
          const idleSpeed = 18;
          scrollEnvironment(idleSpeed, dt);

          const idlePhase = elapsed * (idleSpeed * 0.44);
          const swayX = Math.sin(elapsed * 0.65) * 1.1;
          const swayTilt = Math.cos(elapsed * 0.65) * -0.08;
          hero.root.position.set(swayX, 0, 0);
          s.playerY = 0;

          updateHeroBiomechanics(hero, idlePhase, 0, 0, 0, swayTilt, swayTilt * 0.5, false);
          hero.boosterFlames.visible = false;
          hero.shieldDome.visible = false;

          monster.root.position.set(
            Math.sin(elapsed * 1.2) * 1.6,
            0.25 + Math.sin(elapsed * 4) * 0.14,
            4.3,
          );
          monster.limbs.forEach((limb, idx) => {
            limb.rotation.z = Math.sin(elapsed * 8 + idx) * 0.35;
          });

          const targetCamX = Math.sin(elapsed * 0.4) * 2.1;
          camera.position.x = THREE.MathUtils.damp(camera.position.x, targetCamX, 4, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, 3.3, 4, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, 6.8, 4, dt);
          camera.lookAt(swayX * 0.4, 1.35, -12);

          renderer.render(scene, camera);
          if (isSoftwareGl) afterDraw(tick);
          else frameId = requestAnimationFrame(tick);
          return;
        }

        // Paused or Game Over: keep scene rendered cleanly
        if (mode === 'paused' || mode === 'gameover') {
          renderer.render(scene, camera);
          if (isSoftwareGl) afterDraw(tick);
          else frameId = requestAnimationFrame(tick);
          return;
        }

        // =====================================================================
        // ACTIVE GAMEPLAY OR TUTORIAL SIMULATION
        // =====================================================================
        const currentStage = STAGES[s.stageIndex] || STAGES[0];

        // Smooth acceleration & deceleration (stumble recovery or overdrive surge)
        s.stumbleImpulse = THREE.MathUtils.damp(s.stumbleImpulse, 0, 4, dt);
        const targetRunSpeed = s.speed * (1 - s.stumbleImpulse * 0.35);
        s.currentSpeed = THREE.MathUtils.damp(s.currentSpeed, targetRunSpeed, 3.5, dt);
        const effectiveSpeed = s.currentSpeed * (s.boosterActive ? 1.46 : 1.0);

        // Advance distance & score
        const distDelta = effectiveSpeed * dt * 0.45;
        if (!s.isTutorial) {
          s.distance += distDelta;
        }
        const mult = 1 + (upgradesRef.current.scoreMultiplierLevel - 1) * 0.25;
        s.score += distDelta * 12 * mult * (s.boosterActive ? 2 : 1);

        // Check Stage Progression (5 Stages)
        if (!s.isTutorial && s.stageIndex < STAGES.length - 1) {
          const nextStage = STAGES[s.stageIndex + 1];
          if (s.distance >= nextStage.minDistance) {
            s.stageIndex++;
            s.speed = nextStage.baseSpeed;
            s.stageBannerText = `${nextStage.name}: ${nextStage.subtitle}`;
            s.stageBannerTimer = 3.0;
            s.monsterThreat = Math.min(90, s.monsterThreat + 15);
            soundEngine.playStageUp();
            soundEngine.updateMusicState(nextStage.id, s.boosterActive);
          }
        }

        if (!s.isTutorial) {
          s.speed = Math.min(currentStage.maxSpeed, s.speed + dt * 0.22);
        }

        // Smooth stage lighting & fog transition
        _targetFogColor.setHex(currentStage.fogColor);
        (scene.background as THREE.Color).lerp(_targetFogColor, dt * 2.5);
        if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.color.lerp(_targetFogColor, dt * 2.5);
        }
        _targetKeyColor.setHex(currentStage.keyLightColor);
        keyLight.color.lerp(_targetKeyColor, dt * 2.5);
        _targetHemiSky.setHex(currentStage.hemiSkyColor);
        hemiLight.color.lerp(_targetHemiSky, dt * 2.5);

        // Timers for banners & power-ups
        if (s.stageBannerTimer > 0) s.stageBannerTimer -= dt;
        if (s.statusToastTimer > 0) s.statusToastTimer -= dt;

        if (s.shieldActive) {
          s.shieldTimeLeft -= dt;
          if (s.shieldTimeLeft <= 0) {
            s.shieldActive = false;
            s.shieldTimeLeft = 0;
          }
        }

        if (s.boosterActive) {
          s.boosterTimeLeft -= dt;
          if (s.boosterTimeLeft <= 0) {
            s.boosterActive = false;
            s.boosterTimeLeft = 0;
            soundEngine.updateMusicState(currentStage.id, false);
          }
        }

        s.monsterThreat = Math.max(
          18 + s.stageIndex * 8,
          s.monsterThreat - dt * (s.boosterActive ? 10 : 2.5),
        );

        // Input Buffering & Coyote Time for Jump & Slide
        if (s.jumpBufferTimer > 0) s.jumpBufferTimer -= dt;
        if (s.slideBufferTimer > 0) s.slideBufferTimer -= dt;

        if (s.playerY <= 0.001) {
          s.coyoteTimer = 0.1;
        } else {
          s.coyoteTimer = Math.max(0, s.coyoteTimer - dt);
        }

        // Execute buffered Jump
        if (s.jumpBufferTimer > 0 && (s.coyoteTimer > 0 || s.isSliding)) {
          s.isJumping = true;
          s.isSliding = false;
          s.slideTimer = 0;
          s.velocityY = 13.6;
          s.coyoteTimer = 0;
          s.jumpBufferTimer = 0;
          soundEngine.playJump();
          spawnParticleBurst(s.currentX, 0.15, 0, 0x38bdf8, 12, 6);

          if (s.isTutorial && s.tutorialStep === 2) {
            s.tutorialProgress++;
            checkTutorialStepAdvance();
          }
        }

        // Execute buffered Slide
        if (s.slideBufferTimer > 0 && !s.isSliding) {
          s.isSliding = true;
          s.slideTimer = 0.68;
          s.slideBufferTimer = 0;
          if (s.playerY > 0) {
            s.velocityY = -25;
          }
          soundEngine.playSlide();
          spawnParticleBurst(s.currentX, 0.15, 0, 0xf59e0b, 10, 5);

          if (s.isTutorial && s.tutorialStep === 3) {
            s.tutorialProgress++;
            checkTutorialStepAdvance();
          }
        }

        // Vertical Jump Gravity & Cushioned Landing Recovery
        if (s.isJumping || s.playerY > 0) {
          s.playerY += s.velocityY * dt;
          s.velocityY -= 34.0 * dt;
          if (s.playerY <= 0) {
            s.playerY = 0;
            s.velocityY = 0;
            s.isJumping = false;
            s.landCompression = 0.95; // Triggers realistic knee-flex landing absorption
            spawnParticleBurst(s.currentX, 0.08, 0, 0x94a3b8, 8, 4);
          }
        }

        if (s.isSliding) {
          s.slideTimer -= dt;
          // Continuous friction sparks while sliding on asphalt
          s.slideSparkTimer -= dt;
          if (s.slideSparkTimer <= 0) {
            s.slideSparkTimer = 0.08;
            spawnParticleBurst(s.currentX, 0.1, 0.2, 0xf59e0b, 3, 4);
          }
          if (s.slideTimer <= 0) {
            s.isSliding = false;
          }
        }

        // Smooth Animation State Weight Blending (No Sudden Snapping)
        const targetJumpBlend = s.playerY > 0.08 || s.isJumping ? 1 : 0;
        const targetSlideBlend = s.isSliding ? 1 : 0;
        s.jumpBlend = THREE.MathUtils.damp(s.jumpBlend, targetJumpBlend, 14, dt);
        s.slideBlend = THREE.MathUtils.damp(s.slideBlend, targetSlideBlend, 16, dt);
        s.landCompression = THREE.MathUtils.damp(s.landCompression, 0, 12, dt);

        // Smooth Lateral Lane Change with Body Lean & Shoulder Yaw
        const targetX = s.lane * LANE_WIDTH;
        const prevX = s.currentX;
        s.currentX = THREE.MathUtils.damp(s.currentX, targetX, 13.5, dt);
        s.lateralVelocity = (s.currentX - prevX) / Math.max(dt, 0.001);

        // Dynamic body lean proportional to lateral velocity
        const targetTiltZ = THREE.MathUtils.clamp(-s.lateralVelocity * 0.032, -0.36, 0.36);
        const targetYawY = THREE.MathUtils.clamp(-s.lateralVelocity * 0.022, -0.26, 0.26);
        s.tiltZ = THREE.MathUtils.damp(s.tiltZ, targetTiltZ, 12, dt);
        s.yawY = THREE.MathUtils.damp(s.yawY, targetYawY, 12, dt);

        hero.root.position.set(s.currentX, 0, 0);

        // Advance stride phase strictly proportional to ground speed (Zero Foot Sliding)
        s.runCycleTime += dt * (effectiveSpeed * 0.44);
        updateHeroBiomechanics(
          hero,
          s.runCycleTime,
          s.jumpBlend,
          s.slideBlend,
          s.landCompression,
          s.tiltZ,
          s.yawY,
          s.boosterActive,
        );

        // Contact shadow scales with jump elevation
        const shadowScale = Math.max(0.42, 1 - s.playerY * 0.18);
        hero.contactShadow.scale.set(shadowScale, shadowScale, shadowScale);

        // Shield Dome & Thruster Exhaust Plumes
        hero.shieldDome.visible = s.shieldActive;
        if (s.shieldActive) {
          hero.shieldDome.rotation.y += dt * 2.2;
          hero.shieldDome.position.y = s.playerY + (s.isSliding ? 0.55 : 1.05);
        }
        hero.boosterFlames.visible = s.boosterActive || s.playerY > 0.25;
        if (hero.boosterFlames.visible) {
          const pulseScale = 0.8 + Math.sin(elapsed * 45) * 0.22 + (s.boosterActive ? 0.55 : 0);
          hero.boosterFlames.scale.set(1, pulseScale, 1);
        }
        heroPointLight.position.set(s.currentX, s.playerY + 3.1, 1.8);

        // Update Chasing Shadow Monster position & animations
        const threatNorm = THREE.MathUtils.clamp(s.monsterThreat / 100, 0, 1);
        const targetMonsterZ = THREE.MathUtils.lerp(5.8, 2.35, threatNorm);
        monster.root.position.x = THREE.MathUtils.damp(
          monster.root.position.x,
          s.currentX,
          5.5,
          dt,
        );
        monster.root.position.z = THREE.MathUtils.damp(
          monster.root.position.z,
          targetMonsterZ,
          4.5,
          dt,
        );
        monster.root.position.y = 0.25 + Math.sin(elapsed * 7) * 0.15;
        monster.jawLeft.rotation.y = Math.sin(elapsed * 10) * 0.25;
        monster.jawRight.rotation.y = -Math.sin(elapsed * 10) * 0.25;
        monster.limbs.forEach((limb, idx) => {
          limb.rotation.z = Math.sin(elapsed * 12 + idx * 1.4) * 0.42;
        });

        // Scroll All City Infrastructure & Motion Blur Streaks
        scrollEnvironment(effectiveSpeed, dt);

        // Spawn Obstacles & Collectibles
        s.spawnTimer -= dt;
        if (s.spawnTimer <= 0) {
          spawnWaveForStage();
          s.spawnTimer = s.isTutorial
            ? 1.55
            : currentStage.spawnInterval / (s.boosterActive ? 1.35 : 1.0);
        }

        // Update & Check Collisions on Active Obstacles
        const playerMinY = s.playerY;
        const playerMaxY = s.playerY + (s.isSliding ? 0.92 : 1.82);

        for (let i = activeObstacles.length - 1; i >= 0; i--) {
          const obs = activeObstacles[i];
          obs.z += effectiveSpeed * dt;

          if (obs.type === 'drone') {
            obs.dronePhase += dt * 3.2;
            const droneCore = obs.mesh.getObjectByName('droneCore');
            if (droneCore) {
              droneCore.position.y = 1.25 + Math.sin(obs.dronePhase) * 0.32;
              droneCore.rotation.z = Math.cos(obs.dronePhase) * 0.14;
            }
          }

          obs.mesh.position.z = obs.z;

          if (!obs.hit && Math.abs(obs.z) < 0.95) {
            const obsX = obs.mesh.position.x;
            if (Math.abs(s.currentX - obsX) < 1.05) {
              let collided = false;
              if (obs.type === 'low_barrier') {
                if (playerMinY < 0.96) collided = true;
              } else if (obs.type === 'high_laser') {
                if (playerMaxY > 1.25) collided = true;
              } else if (obs.type === 'blockade') {
                if (playerMinY < 2.15) collided = true;
              } else if (obs.type === 'drone') {
                if (playerMaxY > 0.75 && playerMinY < 1.85) collided = true;
              }

              if (collided) {
                obs.hit = true;
                if (s.boosterActive) {
                  spawnParticleBurst(obsX, 1.2, obs.z, 0xf97316, 24, 11);
                  soundEngine.playShieldBreak();
                  s.score += 150;
                  s.cameraShake = 0.28;
                  scene.remove(obs.mesh);
                  activeObstacles.splice(i, 1);
                  continue;
                } else if (s.shieldActive) {
                  s.shieldActive = false;
                  s.shieldTimeLeft = 0;
                  s.hitstopTimer = 0.055;
                  s.cameraShake = 0.48;
                  s.stumbleImpulse = 0.75; // Realistic stumble & re-acceleration reaction
                  s.landCompression = 0.85;
                  s.statusToast = 'AEGIS SHIELD ABSORBED IMPACT!';
                  s.statusToastTimer = 1.8;
                  soundEngine.playShieldBreak();
                  spawnParticleBurst(obsX, 1.2, obs.z, 0x38bdf8, 28, 10);
                  scene.remove(obs.mesh);
                  activeObstacles.splice(i, 1);
                  syncHudNow();
                  continue;
                } else if (s.isTutorial) {
                  s.cameraShake = 0.32;
                  s.stumbleImpulse = 0.55;
                  s.statusToast =
                    obs.type === 'low_barrier'
                      ? 'TIMING TIP: JUMP EARLIER OVER CONCRETE BARRIERS!'
                      : 'TIMING TIP: SLIDE UNDER SECURITY LASER GANTRIES!';
                  s.statusToastTimer = 1.8;
                  soundEngine.playShieldBreak();
                  spawnParticleBurst(obsX, 1.0, obs.z, 0xf59e0b, 16, 8);
                } else {
                  s.hitstopTimer = 0.07;
                  s.cameraShake = 0.72;
                  s.monsterThreat = 100;
                  soundEngine.stopMusic();
                  soundEngine.playGameOver();
                  spawnParticleBurst(s.currentX, 1.1, 0, 0xef4444, 36, 12);

                  const causeMap: Record<ObstacleType, string> = {
                    low_barrier: 'Clipped a Concrete Highway Jersey Barrier',
                    high_laser: 'Struck an Overhead Security Laser Gantry',
                    blockade: 'Collided with an Armored Tactical Blockade',
                    drone: 'Intercepted by an Autonomous Patrol UAV',
                  };

                  callbacksRef.current.onGameOver({
                    score: Math.floor(s.score),
                    distance: Math.floor(s.distance),
                    coins: s.coins,
                    diamonds: s.diamonds,
                    stageId: currentStage.id,
                    cause: causeMap[obs.type],
                  });
                  break;
                }
              }
            }
          }

          if (obs.z > 12) {
            scene.remove(obs.mesh);
            activeObstacles.splice(i, 1);
          }
        }

        // Update & Collect Collectibles
        for (let i = activeCollectibles.length - 1; i >= 0; i--) {
          const col = activeCollectibles[i];
          col.z += effectiveSpeed * dt;

          const magnetRadius = s.boosterActive ? 5.5 : 2.1;
          const distToHero = Math.hypot(col.mesh.position.x - s.currentX, col.z);
          if (distToHero < magnetRadius) {
            col.mesh.position.x = THREE.MathUtils.damp(
              col.mesh.position.x,
              s.currentX,
              12,
              dt,
            );
          }

          col.mesh.position.z = col.z;
          col.mesh.rotation.y += dt * 3.2;

          const dx = Math.abs(col.mesh.position.x - s.currentX);
          const dz = Math.abs(col.z);
          const dy = Math.abs(col.y - (s.playerY + 1.0));

          if (!col.collected && dx < 1.25 && dz < 1.25 && dy < 1.65) {
            col.collected = true;
            if (col.type === 'coin') {
              s.coins += 1;
              s.score += 50 * s.combo;
              soundEngine.playCoin();
              spawnParticleBurst(col.mesh.position.x, col.y, col.z, 0xfbbf24, 10, 6);
            } else if (col.type === 'diamond') {
              s.diamonds += 1;
              s.score += 500 * s.combo;
              s.combo = Math.min(5, s.combo + 1);
              s.statusToast = `DIAMOND SECURED! +${500 * s.combo} PTS`;
              s.statusToastTimer = 1.5;
              soundEngine.playDiamond();
              spawnParticleBurst(col.mesh.position.x, col.y, col.z, 0x38bdf8, 18, 8);
            } else if (col.type === 'shield') {
              s.shieldActive = true;
              s.shieldTimeLeft = s.shieldMaxTime;
              s.score += 250;
              s.statusToast = 'AEGIS TACTICAL SHIELD ACTIVATED!';
              s.statusToastTimer = 1.8;
              soundEngine.playPowerUp('shield');
              spawnParticleBurst(col.mesh.position.x, col.y, col.z, 0x38bdf8, 18, 8);
            } else if (col.type === 'booster') {
              s.boosterActive = true;
              s.boosterTimeLeft = s.boosterMaxTime;
              s.monsterThreat = Math.max(15, s.monsterThreat - 25);
              s.score += 350;
              s.statusToast = 'OVERDRIVE SPEED BOOSTER ENGAGED!';
              s.statusToastTimer = 1.8;
              soundEngine.playPowerUp('booster');
              soundEngine.updateMusicState(currentStage.id, true);
              spawnParticleBurst(col.mesh.position.x, col.y, col.z, 0xf97316, 22, 9);
            }

            if (s.isTutorial && s.tutorialStep === 4) {
              s.tutorialProgress++;
              checkTutorialStepAdvance();
            }

            scene.remove(col.mesh);
            activeCollectibles.splice(i, 1);
            syncHudNow();
            continue;
          }

          if (col.z > 12) {
            scene.remove(col.mesh);
            activeCollectibles.splice(i, 1);
          }
        }

        // Update Pooled 3D Particles
        let particlesDirty = false;
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const p = particles[i];
          if (p.active) {
            particlesDirty = true;
            p.life -= dt;
            if (p.life <= 0) {
              p.active = false;
              _dummyObj.position.set(0, -100, 0);
              _dummyObj.scale.setScalar(0.001);
              _dummyObj.updateMatrix();
              particleInstanced.setMatrixAt(i, _dummyObj.matrix);
            } else {
              p.x += p.vx * dt;
              p.y += p.vy * dt;
              p.z += p.vz * dt;
              p.vy -= 19 * dt;
              if (p.y < 0.04) {
                p.y = 0.04;
                p.vy *= -0.35; // Realistic spark bounce off wet asphalt
              }
              const lifeRatio = p.life / p.maxLife;
              _dummyObj.position.set(p.x, p.y, p.z);
              _dummyObj.scale.setScalar(p.scale * lifeRatio);
              _dummyObj.rotation.set(p.life * 6, p.life * 8, 0);
              _dummyObj.updateMatrix();
              particleInstanced.setMatrixAt(i, _dummyObj.matrix);
            }
          }
        }
        if (particlesDirty) {
          particleInstanced.instanceMatrix.needsUpdate = true;
        }

        // =====================================================================
        // CINEMATIC THIRD-PERSON CHASE CAMERA WITH DYNAMIC FOV & MICRO-SHAKE
        // =====================================================================
        s.cameraShake = Math.max(0, s.cameraShake - dt * 2.4);
        const speedVibration =
          s.boosterActive ? 0.028 : Math.max(0, (effectiveSpeed - 26) * 0.0008);
        const totalShake = s.cameraShake + speedVibration;
        const shakeOffsetX = (Math.random() - 0.5) * totalShake;
        const shakeOffsetY = (Math.random() - 0.5) * totalShake;

        const targetFov = s.boosterActive ? 74 : 58 + (effectiveSpeed - 20) * 0.35;
        if (Math.abs(camera.fov - targetFov) > 0.05) {
          camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 5.5, dt);
          camera.updateProjectionMatrix();
        }

        // Subtle camera height drop during slide & stride coupling
        const camBobY = Math.sin(s.runCycleTime * 2) * 0.025 * (1 - s.jumpBlend);
        const targetCamY = 3.55 + s.playerY * 0.38 - s.slideBlend * 0.45 + camBobY;
        const targetCamZ = s.boosterActive ? 6.45 : 7.35;

        camera.position.x =
          THREE.MathUtils.damp(camera.position.x, s.currentX * 0.68, 7.5, dt) + shakeOffsetX;
        camera.position.y =
          THREE.MathUtils.damp(camera.position.y, targetCamY, 8.0, dt) + shakeOffsetY;
        camera.position.z = THREE.MathUtils.damp(camera.position.z, targetCamZ, 6.0, dt);

        camera.lookAt(
          s.currentX * 0.42 + s.lateralVelocity * 0.04,
          1.32 + s.playerY * 0.22 - s.slideBlend * 0.25,
          -15,
        );

        // Throttled HUD updates (every ~50ms)
        hudUpdateAccumulator += dt;
        if (hudUpdateAccumulator >= 0.05) {
          hudUpdateAccumulator = 0;
          syncHudNow();
        }

        renderer.render(scene, camera);
        if (isSoftwareGl) afterDraw(tick);
        else frameId = requestAnimationFrame(tick);
      }

      frameId = requestAnimationFrame(tick);

      return () => {
        disposed = true;
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('resize', handleResize);
        domElem.removeEventListener('touchstart', handleTouchStart);
        domElem.removeEventListener('touchmove', handleTouchMove);
        soundEngine.stopMusic();
        textures.dispose();
        renderer.dispose();
        if (container.contains(domElem)) {
          container.removeChild(domElem);
        }
      };
    }, []);

    return (
      <div
        ref={mountRef}
        className="fixed inset-0 w-full h-full overflow-hidden bg-[#05060d]"
        aria-label="Shadow Escape 3D Viewport"
      />
    );
  },
);
