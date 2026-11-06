import * as THREE from 'three';
import { CollectibleType, ObstacleType } from '../types/game';

export interface HeroRunnerRig {
  root: THREE.Group;
  pelvisGroup: THREE.Group;
  spineGroup: THREE.Group;
  headGroup: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  leftAnkle: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  rightAnkle: THREE.Group;
  shieldDome: THREE.Mesh;
  boosterFlames: THREE.Group;
  contactShadow: THREE.Mesh;
  // Backward-compat aliases
  bodyGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
}

export interface ShadowMonsterRig {
  root: THREE.Group;
  coreBody: THREE.Group;
  jawLeft: THREE.Mesh;
  jawRight: THREE.Mesh;
  limbs: THREE.Group[];
}

export function createHeroRunner(
  contactShadowTexture: THREE.CanvasTexture,
  isSoftwareGl: boolean,
): HeroRunnerRig {
  const root = new THREE.Group();

  // Grounded ambient occlusion shadow plane at y = 0.015
  const shadowGeo = new THREE.PlaneGeometry(1.85, 2.15);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0.78,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.015;
  root.add(contactShadow);

  // =========================================================================
  // REALISTIC PBR SURVIVAL SUIT MATERIALS
  // =========================================================================
  // 1. Brushed Gunmetal Titanium Exosuit Plates
  const titaniumArmorMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e2530,
    metalness: 0.82,
    roughness: 0.28,
    clearcoat: 0.35,
    clearcoatRoughness: 0.25,
  });

  // 2. Matte Ballistic Cordura Fabric Undersuit
  const ballisticFabricMat = new THREE.MeshStandardMaterial({
    color: 0x11151c,
    metalness: 0.12,
    roughness: 0.82,
  });

  // 3. Carbon-Fiber Joint & Knee/Shoulder Guards
  const carbonTrimMat = new THREE.MeshStandardMaterial({
    color: 0x090b10,
    metalness: 0.45,
    roughness: 0.42,
  });

  // 4. Warm Human Skin Tone (Neck / Lower Face)
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xc69076,
    metalness: 0.05,
    roughness: 0.65,
  });

  // 5. Polycarbonate Tinted Tactical Visor Glass
  const visorGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    metalness: 0.9,
    roughness: 0.08,
    clearcoat: 1.0,
  });

  // 6. Subtle Tactical Telemetry Strip (Restrained Ice-Blue LED)
  const tacticalLedMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 1.4,
    roughness: 0.2,
    metalness: 0.3,
  });

  // 7. Tactical Amber Thruster & Boot Heel Indicator
  const amberIndicatorMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 1.2,
    roughness: 0.25,
    metalness: 0.4,
  });

  // =========================================================================
  // ANATOMICAL HIERARCHY: PELVIS (y = 0.95m) -> SPINE -> HEAD & LIMBS
  // =========================================================================
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.95, 0);
  root.add(pelvisGroup);

  // Sculpted Pelvis & Tactical Utility Belt
  const pelvisMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.165, 0.145, 0.18, 14),
    ballisticFabricMat,
  );
  pelvisMesh.scale.set(1.15, 1, 0.82);
  pelvisMesh.castShadow = !isSoftwareGl;
  pelvisGroup.add(pelvisMesh);

  const beltMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.175, 0.172, 0.065, 14),
    carbonTrimMat,
  );
  beltMesh.scale.set(1.16, 1, 0.85);
  beltMesh.position.y = 0.06;
  pelvisGroup.add(beltMesh);

  // Holster Pouches on Left/Right Hips
  const pouchGeo = new THREE.BoxGeometry(0.06, 0.11, 0.12);
  const leftPouch = new THREE.Mesh(pouchGeo, carbonTrimMat);
  leftPouch.position.set(-0.21, 0.02, 0);
  const rightPouch = new THREE.Mesh(pouchGeo, carbonTrimMat);
  rightPouch.position.set(0.21, 0.02, 0);
  pelvisGroup.add(leftPouch, rightPouch);

  // =========================================================================
  // UPPER TORSO & SPINE GROUP (Pivots at Waist)
  // =========================================================================
  const spineGroup = new THREE.Group();
  spineGroup.position.set(0, 0.08, 0);
  pelvisGroup.add(spineGroup);

  // Lower Abdomen (Athletic Taper)
  const abdomenMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.185, 0.155, 0.24, 14),
    ballisticFabricMat,
  );
  abdomenMesh.scale.set(1.12, 1, 0.78);
  abdomenMesh.position.set(0, 0.12, 0);
  abdomenMesh.castShadow = !isSoftwareGl;
  spineGroup.add(abdomenMesh);

  // Sculpted Upper Chest Rig (Athletic V-Taper)
  const chestShape = new THREE.Shape();
  chestShape.moveTo(-0.18, 0);
  chestShape.lineTo(0.18, 0);
  chestShape.lineTo(0.23, 0.28);
  chestShape.lineTo(0.16, 0.36);
  chestShape.lineTo(-0.16, 0.36);
  chestShape.lineTo(-0.23, 0.28);
  chestShape.closePath();

  const chestGeo = new THREE.ExtrudeGeometry(chestShape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 3,
  });
  chestGeo.translate(0, 0, -0.1);
  const chestArmor = new THREE.Mesh(chestGeo, titaniumArmorMat);
  chestArmor.position.set(0, 0.2, 0);
  chestArmor.castShadow = !isSoftwareGl;
  spineGroup.add(chestArmor);

  // Subtle Dorsal Spine Exoskeleton Column & Micro-LED Strip
  for (let s = 0; s < 4; s++) {
    const vertebra = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.055, 0.04),
      carbonTrimMat,
    );
    vertebra.position.set(0, 0.14 + s * 0.085, 0.13);
    spineGroup.add(vertebra);
  }
  const dorsalLed = new THREE.Mesh(
    new THREE.BoxGeometry(0.022, 0.28, 0.02),
    tacticalLedMat,
  );
  dorsalLed.position.set(0, 0.36, 0.145);
  spineGroup.add(dorsalLed);

  // Compact Tactical Jump-Pack on Upper Back
  const packGroup = new THREE.Group();
  packGroup.position.set(0, 0.38, 0.14);

  const mainPack = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.32, 0.11),
    titaniumArmorMat,
  );
  mainPack.castShadow = !isSoftwareGl;
  packGroup.add(mainPack);

  const nozzlePoints = [
    new THREE.Vector2(0.025, 0),
    new THREE.Vector2(0.055, 0.04),
    new THREE.Vector2(0.048, 0.12),
    new THREE.Vector2(0.02, 0.14),
  ];
  const nozzleGeo = new THREE.LatheGeometry(nozzlePoints, 12);
  const leftNozzle = new THREE.Mesh(nozzleGeo, carbonTrimMat);
  leftNozzle.position.set(-0.085, -0.22, 0.01);
  const rightNozzle = new THREE.Mesh(nozzleGeo, carbonTrimMat);
  rightNozzle.position.set(0.085, -0.22, 0.01);
  packGroup.add(leftNozzle, rightNozzle);
  spineGroup.add(packGroup);

  // Thruster Exhaust Plumes (visible on jump takeoff & overdrive boost)
  const boosterFlames = new THREE.Group();
  const flameGeo = new THREE.ConeGeometry(0.055, 0.38, 10);
  flameGeo.rotateX(Math.PI);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
  });
  const flameL = new THREE.Mesh(flameGeo, flameMat);
  flameL.position.set(-0.085, 0.02, 0.16);
  const flameR = new THREE.Mesh(flameGeo, flameMat);
  flameR.position.set(0.085, 0.02, 0.16);
  boosterFlames.add(flameL, flameR);
  spineGroup.add(boosterFlames);

  // =========================================================================
  // REALISTIC HEAD, NECK & TACTICAL RECON HELMET
  // =========================================================================
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.62, 0);
  spineGroup.add(headGroup);

  // Anatomical Neck & Ballistic Collar
  const neckMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.062, 0.072, 0.1, 12),
    skinMat,
  );
  neckMesh.position.set(0, 0.03, 0);
  headGroup.add(neckMesh);

  // Lower Face / Jaw Profile
  const headCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.115, 16, 16),
    skinMat,
  );
  headCore.scale.set(0.92, 1.08, 0.98);
  headCore.position.set(0, 0.14, -0.01);
  headGroup.add(headCore);

  // Sculpted Tactical Ballistic Helmet Shell
  const helmetShell = new THREE.Mesh(
    new THREE.SphereGeometry(0.128, 18, 18),
    titaniumArmorMat,
  );
  helmetShell.scale.set(0.96, 1.05, 1.12);
  helmetShell.position.set(0, 0.155, 0.005);
  helmetShell.castShadow = !isSoftwareGl;
  headGroup.add(helmetShell);

  // Chin Guard / Respirator Mask
  const respirator = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.075, 0.12),
    carbonTrimMat,
  );
  respirator.position.set(0, 0.085, -0.065);
  headGroup.add(respirator);

  // Sleek Reflective Dark Polycarbonate Visor + Thin Optical HUD Line
  const visorShield = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.126,
      0.122,
      0.075,
      16,
      1,
      false,
      Math.PI * 0.62,
      Math.PI * 0.76,
    ),
    visorGlassMat,
  );
  visorShield.position.set(0, 0.15, -0.015);
  headGroup.add(visorShield);

  const visorHudStrip = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.128,
      0.128,
      0.012,
      16,
      1,
      false,
      Math.PI * 0.72,
      Math.PI * 0.56,
    ),
    tacticalLedMat,
  );
  visorHudStrip.position.set(0, 0.152, -0.016);
  headGroup.add(visorHudStrip);

  // =========================================================================
  // MULTI-JOINT ARTICULATED ARMS (Shoulder -> Upper Arm -> Elbow -> Forearm -> Hand)
  // =========================================================================
  function createArticulatedArm(side: -1 | 1): {
    shoulder: THREE.Group;
    elbow: THREE.Group;
  } {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.255, 0.52, 0);

    // Sculpted Deltoid Pauldron
    const pauldron = new THREE.Mesh(
      new THREE.SphereGeometry(0.078, 12, 12),
      titaniumArmorMat,
    );
    pauldron.scale.set(1.05, 0.95, 1.1);
    pauldron.castShadow = !isSoftwareGl;
    shoulder.add(pauldron);

    // Upper Arm (Bicep / Tricep)
    const upperArm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.052, 0.21, 4, 10),
      ballisticFabricMat,
    );
    upperArm.position.set(side * 0.015, -0.145, 0);
    upperArm.castShadow = !isSoftwareGl;
    shoulder.add(upperArm);

    // Articulated Elbow Pivot at y = -0.27
    const elbow = new THREE.Group();
    elbow.position.set(side * 0.015, -0.27, 0);
    shoulder.add(elbow);

    const elbowPad = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 10, 10),
      carbonTrimMat,
    );
    elbow.add(elbowPad);

    // Tapered Forearm & Tactical Gauntlet
    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.038, 0.23, 10),
      titaniumArmorMat,
    );
    forearm.position.set(0, -0.125, 0);
    forearm.castShadow = !isSoftwareGl;
    elbow.add(forearm);

    // Gloved Hand Fist
    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.044, 10, 10),
      carbonTrimMat,
    );
    hand.scale.set(0.85, 1.15, 1.05);
    hand.position.set(0, -0.26, -0.01);
    elbow.add(hand);

    return { shoulder, elbow };
  }

  const leftArmRig = createArticulatedArm(-1);
  const rightArmRig = createArticulatedArm(1);
  spineGroup.add(leftArmRig.shoulder, rightArmRig.shoulder);

  // =========================================================================
  // MULTI-JOINT ARTICULATED LEGS (Hip -> Thigh -> Knee -> Shin -> Ankle -> Boot)
  // Total leg length = 0.95m (Thigh 0.42m + Shin 0.43m + Boot 0.10m = grounded at y = 0)
  // =========================================================================
  function createArticulatedLeg(side: -1 | 1): {
    hip: THREE.Group;
    knee: THREE.Group;
    ankle: THREE.Group;
  } {
    const hip = new THREE.Group();
    hip.position.set(side * 0.115, 0, 0);

    // Sculpted Athletic Thigh (Quadriceps / Hamstring)
    const thighMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.082, 0.064, 0.39, 12),
      ballisticFabricMat,
    );
    thighMesh.position.set(0, -0.205, 0);
    thighMesh.castShadow = !isSoftwareGl;
    hip.add(thighMesh);

    // Outer Thigh Armor Plate
    const thighPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.24, 0.11),
      titaniumArmorMat,
    );
    thighPlate.position.set(side * 0.068, -0.19, -0.01);
    hip.add(thighPlate);

    // Articulated Knee Joint at y = -0.42
    const knee = new THREE.Group();
    knee.position.set(0, -0.42, 0);
    hip.add(knee);

    // Carbon-Fiber Knee Guard
    const kneeGuard = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.1, 0.12),
      carbonTrimMat,
    );
    kneeGuard.position.set(0, 0, -0.02);
    knee.add(kneeGuard);

    // Lower Leg / Calf & Armored Shin Greave
    const shinMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.062, 0.046, 0.4, 12),
      titaniumArmorMat,
    );
    shinMesh.position.set(0, -0.215, 0);
    shinMesh.castShadow = !isSoftwareGl;
    knee.add(shinMesh);

    // Articulated Ankle Joint at y = -0.43
    const ankle = new THREE.Group();
    ankle.position.set(0, -0.43, 0);
    knee.add(ankle);

    // Combat Boot Upper Collar
    const bootCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.054, 0.08, 10),
      carbonTrimMat,
    );
    bootCollar.position.set(0, -0.03, 0);
    ankle.add(bootCollar);

    // Sculpted Tactical Running Boot Foot (extends forward in -Z)
    const bootFoot = new THREE.Mesh(
      new THREE.BoxGeometry(0.105, 0.065, 0.24),
      titaniumArmorMat,
    );
    bootFoot.position.set(0, -0.065, -0.045);
    bootFoot.castShadow = !isSoftwareGl;
    ankle.add(bootFoot);

    // Rubberized Grip Sole (bottom sits flush at y = -0.10 -> 0.95 - 0.42 - 0.43 - 0.10 = 0.00m)
    const bootSole = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.022, 0.25),
      carbonTrimMat,
    );
    bootSole.position.set(0, -0.09, -0.045);
    ankle.add(bootSole);

    // Subtle Heel Amber Reflector
    const heelReflector = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.022, 0.02),
      amberIndicatorMat,
    );
    heelReflector.position.set(0, -0.065, 0.075);
    ankle.add(heelReflector);

    return { hip, knee, ankle };
  }

  const leftLegRig = createArticulatedLeg(-1);
  const rightLegRig = createArticulatedLeg(1);
  pelvisGroup.add(leftLegRig.hip, rightLegRig.hip);

  // =========================================================================
  // AEGIS REFRACTIVE TACTICAL SHIELD DOME (depthWrite: false)
  // =========================================================================
  const shieldGeo = new THREE.IcosahedronGeometry(1.32, 2);
  const shieldMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.45,
    roughness: 0.12,
    metalness: 0.1,
    transmission: isSoftwareGl ? 0 : 0.72,
    transparent: true,
    opacity: isSoftwareGl ? 0.24 : 0.36,
    depthWrite: false,
  });
  const shieldDome = new THREE.Mesh(shieldGeo, shieldMat);
  shieldDome.position.set(0, 1.05, 0);
  shieldDome.renderOrder = 10;
  shieldDome.visible = false;
  root.add(shieldDome);

  return {
    root,
    pelvisGroup,
    spineGroup,
    headGroup,
    leftShoulder: leftArmRig.shoulder,
    leftElbow: leftArmRig.elbow,
    rightShoulder: rightArmRig.shoulder,
    rightElbow: rightArmRig.elbow,
    leftHip: leftLegRig.hip,
    leftKnee: leftLegRig.knee,
    leftAnkle: leftLegRig.ankle,
    rightHip: rightLegRig.hip,
    rightKnee: rightLegRig.knee,
    rightAnkle: rightLegRig.ankle,
    shieldDome,
    boosterFlames,
    contactShadow,
    bodyGroup: pelvisGroup,
    leftArm: leftArmRig.shoulder,
    rightArm: rightArmRig.shoulder,
    leftLeg: leftLegRig.hip,
    rightLeg: rightLegRig.hip,
  };
}

export function createShadowMonster(isSoftwareGl: boolean): ShadowMonsterRig {
  const root = new THREE.Group();
  const coreBody = new THREE.Group();
  coreBody.position.set(0, 1.75, 0);
  root.add(coreBody);

  const gunmetalCarapaceMat = new THREE.MeshPhysicalMaterial({
    color: 0x141821,
    metalness: 0.88,
    roughness: 0.24,
    clearcoat: 0.4,
  });
  const hydraulicMat = new THREE.MeshStandardMaterial({
    color: 0x27272a,
    metalness: 0.7,
    roughness: 0.45,
  });
  const crimsonSensorMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 2.2,
    roughness: 0.15,
    metalness: 0.2,
  });

  // 1. Armored Biomechanical Thorax Chassis
  const thorax = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.08, 1),
    gunmetalCarapaceMat,
  );
  thorax.scale.set(1.22, 0.88, 1.42);
  thorax.castShadow = !isSoftwareGl;
  coreBody.add(thorax);

  // 2. Internal Turbine Core
  const reactorCore = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.55, 1),
    crimsonSensorMat,
  );
  reactorCore.position.set(0, 0.08, -0.78);
  coreBody.add(reactorCore);

  // 3. Quad Optical Tracking Sensors
  const eyeGeo = new THREE.SphereGeometry(0.11, 10, 10);
  const eyePositions = [
    [-0.38, 0.32, -1.22],
    [0.38, 0.32, -1.22],
    [-0.18, 0.18, -1.32],
    [0.18, 0.18, -1.32],
  ];
  eyePositions.forEach(([x, y, z]) => {
    const eye = new THREE.Mesh(eyeGeo, crimsonSensorMat);
    eye.position.set(x, y, z);
    coreBody.add(eye);
  });

  // 4 & 5. Mechanical Mandible Pincers
  const jawGeo = new THREE.ConeGeometry(0.18, 0.92, 6);
  jawGeo.rotateX(-Math.PI / 2);
  const jawLeft = new THREE.Mesh(jawGeo, gunmetalCarapaceMat);
  jawLeft.position.set(-0.5, -0.22, -1.35);
  const jawRight = new THREE.Mesh(jawGeo, gunmetalCarapaceMat);
  jawRight.position.set(0.5, -0.22, -1.35);
  coreBody.add(jawLeft, jawRight);

  // 6. Dorsal Cooling Fins
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.58, 0.36),
      hydraulicMat,
    );
    fin.position.set(0, 0.85, -0.35 + i * 0.52);
    fin.rotation.x = 0.32;
    coreBody.add(fin);
  }

  // 7–10. Four Articulated Mechanical Predator Limbs
  const limbs: THREE.Group[] = [];
  const limbConfigs = [
    { x: -1.18, y: 0.08, z: -0.4, side: -1 },
    { x: 1.18, y: 0.08, z: -0.4, side: 1 },
    { x: -1.28, y: -0.18, z: 0.48, side: -1 },
    { x: 1.28, y: -0.18, z: 0.48, side: 1 },
  ];

  limbConfigs.forEach((cfg) => {
    const limbGroup = new THREE.Group();
    limbGroup.position.set(cfg.x, cfg.y, cfg.z);

    const upperStrut = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 0.18, 0.22),
      hydraulicMat,
    );
    upperStrut.position.set(cfg.side * 0.35, 0.24, 0);
    upperStrut.rotation.z = cfg.side * 0.42;
    limbGroup.add(upperStrut);

    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 1.4, 5),
      gunmetalCarapaceMat,
    );
    blade.position.set(cfg.side * 0.72, -0.45, -0.22);
    blade.rotation.x = Math.PI * 0.85;
    limbGroup.add(blade);

    coreBody.add(limbGroup);
    limbs.push(limbGroup);
  });

  return {
    root,
    coreBody,
    jawLeft,
    jawRight,
    limbs,
  };
}

export function createObstacleGroup(
  type: ObstacleType,
  hazardTexture: THREE.CanvasTexture,
  contactShadowTexture: THREE.CanvasTexture,
): THREE.Group {
  const group = new THREE.Group();

  // Contact shadow on asphalt
  const shadowGeo = new THREE.PlaneGeometry(2.7, 2.4);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0.7,
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.y = 0.02;
  group.add(shadow);

  const weatheredSteelMat = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    metalness: 0.82,
    roughness: 0.32,
  });
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.08,
    roughness: 0.88,
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    map: hazardTexture,
    metalness: 0.35,
    roughness: 0.5,
  });
  const crimsonEmitterMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 2.2,
    roughness: 0.2,
  });
  const amberStrobeMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 2.0,
    roughness: 0.2,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: 0xe0f2fe,
    emissiveIntensity: 2.4,
  });

  if (type === 'low_barrier') {
    // JUMP OVER: Realistic Precast Concrete Jersey Barrier + Hazard Bar + Laser Emitter (Total height ~ 1.02m)
    const jerseyShape = new THREE.Shape();
    jerseyShape.moveTo(-0.32, 0);
    jerseyShape.lineTo(0.32, 0);
    jerseyShape.lineTo(0.28, 0.18);
    jerseyShape.lineTo(0.14, 0.62);
    jerseyShape.lineTo(-0.14, 0.62);
    jerseyShape.lineTo(-0.28, 0.18);
    jerseyShape.closePath();

    const jerseyGeo = new THREE.ExtrudeGeometry(jerseyShape, {
      depth: 2.25,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
    });
    jerseyGeo.rotateY(Math.PI / 2);
    jerseyGeo.translate(-1.125, 0, 0);
    const jerseyWall = new THREE.Mesh(jerseyGeo, concreteMat);

    const hazardBoard = new THREE.Mesh(
      new THREE.BoxGeometry(2.15, 0.22, 0.16),
      hazardMat,
    );
    hazardBoard.position.set(0, 0.76, 0);

    const laserTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 2.05, 10),
      crimsonEmitterMat,
    );
    laserTube.rotation.z = Math.PI / 2;
    laserTube.position.set(0, 0.96, 0);

    const strobeL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 0.14, 10),
      amberStrobeMat,
    );
    strobeL.position.set(-0.98, 0.96, 0);
    const strobeR = strobeL.clone();
    strobeR.position.set(0.98, 0.96, 0);

    group.add(jerseyWall, hazardBoard, laserTube, strobeL, strobeR);
  } else if (type === 'high_laser') {
    // SLIDE UNDER: Realistic Steel Security Overpass Gantry (Clearance below y = 1.32m)
    const columnGeo = new THREE.BoxGeometry(0.28, 2.95, 0.36);
    const leftCol = new THREE.Mesh(columnGeo, weatheredSteelMat);
    leftCol.position.set(-1.18, 1.475, 0);
    const rightCol = new THREE.Mesh(columnGeo, weatheredSteelMat);
    rightCol.position.set(1.18, 1.475, 0);

    const baseFootGeo = new THREE.BoxGeometry(0.46, 0.25, 0.56);
    const footL = new THREE.Mesh(baseFootGeo, concreteMat);
    footL.position.set(-1.18, 0.125, 0);
    const footR = new THREE.Mesh(baseFootGeo, concreteMat);
    footR.position.set(1.18, 0.125, 0);

    const upperGantry = new THREE.Mesh(
      new THREE.BoxGeometry(2.65, 0.55, 0.48),
      hazardMat,
    );
    upperGantry.position.set(0, 2.65, 0);

    // Suspended Laser Security Grid (y = 1.48m and y = 1.98m)
    const beam1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 2.25, 12),
      crimsonEmitterMat,
    );
    beam1.rotation.z = Math.PI / 2;
    beam1.position.set(0, 1.48, 0);

    const beam2 = beam1.clone();
    beam2.position.set(0, 1.98, 0);

    const emitterBoxL = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.75, 0.24),
      weatheredSteelMat,
    );
    emitterBoxL.position.set(-1.05, 1.75, 0);
    const emitterBoxR = emitterBoxL.clone();
    emitterBoxR.position.set(1.05, 1.75, 0);

    group.add(
      leftCol,
      rightCol,
      footL,
      footR,
      upperGantry,
      beam1,
      beam2,
      emitterBoxL,
      emitterBoxR,
    );
  } else if (type === 'blockade') {
    // SWITCH LANES: Armored Tactical Interceptor APC / SUV Vehicle Blockade
    const vehicleGroup = new THREE.Group();
    vehicleGroup.rotation.y = 0.08; // Slightly angled roadblock posture

    // Lower Armored Chassis
    const lowerBody = new THREE.Mesh(
      new THREE.BoxGeometry(2.15, 0.92, 2.85),
      weatheredSteelMat,
    );
    lowerBody.position.set(0, 0.68, 0);
    vehicleGroup.add(lowerBody);

    // Sloped Cabin & Armored Windshield
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.88, 0.72, 1.75),
      weatheredSteelMat,
    );
    cabin.position.set(0, 1.48, -0.18);
    vehicleGroup.add(cabin);

    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(1.72, 0.48, 0.1),
      new THREE.MeshPhysicalMaterial({
        color: 0x090d16,
        metalness: 0.9,
        roughness: 0.1,
      }),
    );
    windshield.position.set(0, 1.5, 0.71);
    windshield.rotation.x = -0.22;
    vehicleGroup.add(windshield);

    // Heavy Front Bull-Bar Bumper
    const bullBar = new THREE.Mesh(
      new THREE.BoxGeometry(2.24, 0.46, 0.28),
      hazardMat,
    );
    bullBar.position.set(0, 0.48, 1.44);
    vehicleGroup.add(bullBar);

    // Four Rugged Tactical Tires
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x090b10,
      roughness: 0.85,
      metalness: 0.15,
    });
    const wheelPositions = [
      [-1.08, 0.42, 0.92],
      [1.08, 0.42, 0.92],
      [-1.08, 0.42, -0.92],
      [1.08, 0.42, -0.92],
    ];
    wheelPositions.forEach(([wx, wy, wz]) => {
      const wheel = new THREE.Mesh(wheelGeo, tireMat);
      wheel.position.set(wx, wy, wz);
      vehicleGroup.add(wheel);
    });

    // Dual High-Intensity LED Headlights
    const hlLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.16, 0.08),
      headlightMat,
    );
    hlLeft.position.set(-0.72, 0.92, 1.44);
    const hlRight = hlLeft.clone();
    hlRight.position.set(0.72, 0.92, 1.44);
    vehicleGroup.add(hlLeft, hlRight);

    // Police / Tactical Roof Emergency Lightbar
    const lightBarLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.14, 0.26),
      crimsonEmitterMat,
    );
    lightBarLeft.position.set(-0.36, 1.92, -0.05);
    const lightBarRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.14, 0.26),
      amberStrobeMat,
    );
    lightBarRight.position.set(0.36, 1.92, -0.05);
    vehicleGroup.add(lightBarLeft, lightBarRight);

    group.add(vehicleGroup);
  } else if (type === 'drone') {
    // PATROL DRONE: Realistic Quad-Rotor Autonomous Security UAV
    const droneCore = new THREE.Group();
    droneCore.name = 'droneCore';
    droneCore.position.set(0, 1.35, 0);

    // Central Carbon-Fiber Fuselage Pod
    const fuselage = new THREE.Mesh(
      new THREE.SphereGeometry(0.44, 16, 16),
      weatheredSteelMat,
    );
    fuselage.scale.set(1.1, 0.68, 1.35);
    droneCore.add(fuselage);

    // Under-Slung Gimbal Optical Turret
    const turretLens = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 12),
      crimsonEmitterMat,
    );
    turretLens.position.set(0, -0.12, 0.42);
    droneCore.add(turretLens);

    // 4 Quad-Rotor Strut Arms & Rotor Shrouds
    const rotorOffsets = [
      [-0.68, 0.08, 0.58],
      [0.68, 0.08, 0.58],
      [-0.68, 0.08, -0.58],
      [0.68, 0.08, -0.58],
    ];
    const shroudGeo = new THREE.TorusGeometry(0.28, 0.035, 8, 18);
    shroudGeo.rotateX(Math.PI / 2);

    rotorOffsets.forEach(([rx, ry, rz]) => {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.05, 0.07),
        hazardMat,
      );
      arm.position.set(rx * 0.5, ry, rz * 0.5);
      arm.rotation.y = Math.atan2(rx, rz);
      droneCore.add(arm);

      const shroud = new THREE.Mesh(shroudGeo, weatheredSteelMat);
      shroud.position.set(rx, ry, rz);
      droneCore.add(shroud);
    });

    group.add(droneCore);
  }

  return group;
}

export function createCollectibleGroup(
  type: CollectibleType,
  isSoftwareGl: boolean,
): THREE.Group {
  const group = new THREE.Group();
  group.position.y = 1.15;

  if (type === 'coin') {
    const goldMat = new THREE.MeshPhysicalMaterial({
      color: 0xfbbf24,
      emissive: 0xb45309,
      emissiveIntensity: 0.45,
      metalness: 0.95,
      roughness: 0.14,
      clearcoat: 0.8,
    });
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xd97706,
      emissiveIntensity: 0.9,
      metalness: 0.65,
      roughness: 0.32,
    });

    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.095, 12, 24),
      goldMat,
    );
    const innerDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.07, 16),
      coreMat,
    );
    innerDisc.rotation.x = Math.PI / 2;
    const centerGem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.15, 0),
      goldMat,
    );
    group.add(outerRing, innerDisc, centerGem);
  } else if (type === 'diamond') {
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.95,
      metalness: 0.1,
      roughness: 0.05,
      transmission: isSoftwareGl ? 0 : 0.85,
      transparent: true,
      opacity: isSoftwareGl ? 0.9 : 1,
      ior: 2.1,
      clearcoat: 1,
    });
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.9,
      roughness: 0.18,
    });

    const mainCrystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.46, 0),
      crystalMat,
    );
    mainCrystal.scale.set(0.85, 1.25, 0.85);
    const orbitRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.56, 0.04, 8, 24),
      ringMat,
    );
    orbitRing.rotation.x = Math.PI / 3;
    group.add(mainCrystal, orbitRing);
  } else if (type === 'shield') {
    const cyanMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.6,
      metalness: 0.35,
      roughness: 0.15,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.92,
      roughness: 0.18,
    });

    const coreSphere = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.35, 1),
      cyanMat,
    );
    const hexRing1 = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.055, 8, 6),
      frameMat,
    );
    const hexRing2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.66, 0.038, 8, 6),
      cyanMat,
    );
    hexRing2.rotation.y = Math.PI / 2;
    group.add(coreSphere, hexRing1, hexRing2);
  } else if (type === 'booster') {
    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xea580c,
      emissiveIntensity: 1.8,
      metalness: 0.3,
      roughness: 0.2,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.92,
      roughness: 0.15,
    });

    const cellLeft = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.13, 0.4, 4, 10),
      chromeMat,
    );
    cellLeft.position.x = -0.21;
    const cellRight = cellLeft.clone();
    cellRight.position.x = 0.21;

    const plasmaBridge = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.3, 0),
      flameMat,
    );
    const chevronFin = new THREE.Mesh(
      new THREE.TorusGeometry(0.52, 0.045, 8, 16),
      flameMat,
    );
    group.add(cellLeft, cellRight, plasmaBridge, chevronFin);
  }

  return group;
}
