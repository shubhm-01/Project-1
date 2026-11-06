import * as THREE from 'three';

export interface ProceduralTextureSet {
  roadTexture: THREE.CanvasTexture;
  roadRoughnessMap: THREE.CanvasTexture;
  roadBumpMap: THREE.CanvasTexture;
  buildingTexture: THREE.CanvasTexture;
  buildingRoughnessMap: THREE.CanvasTexture;
  buildingEmissiveMap: THREE.CanvasTexture;
  concreteTexture: THREE.CanvasTexture;
  hazardTexture: THREE.CanvasTexture;
  highwaySignTexture: THREE.CanvasTexture;
  contactShadowTexture: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // =========================================================================
  // 1. REALISTIC WET ASPHALT HIGHWAY (Albedo + Roughness + Bump Maps)
  // =========================================================================
  const roadCanvas = document.createElement('canvas');
  roadCanvas.width = 1024;
  roadCanvas.height = 1024;
  const rCtx = roadCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 512;
  roughCanvas.height = 512;
  const rgCtx = roughCanvas.getContext('2d')!;

  // Base dark charcoal asphalt
  rCtx.fillStyle = '#14171f';
  rCtx.fillRect(0, 0, 1024, 1024);

  // Base medium-high roughness for asphalt, with wet low-roughness puddles
  rgCtx.fillStyle = '#9ca3af';
  rgCtx.fillRect(0, 0, 512, 512);

  // Asphalt aggregate grain & micro-stones
  for (let i = 0; i < 18000; i++) {
    const x = (i * 73) % 1024;
    const y = (i * 137) % 1024;
    const shade = 16 + ((i * 29) % 26);
    rCtx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 6})`;
    rCtx.fillRect(x, y, 2, 2);
  }

  // Subtle longitudinal tire wear tracks along the 3 lanes
  const laneCenters = [220, 512, 804];
  laneCenters.forEach((cx) => {
    const tireGrad = rCtx.createLinearGradient(cx - 110, 0, cx + 110, 0);
    tireGrad.addColorStop(0, 'rgba(10, 12, 16, 0)');
    tireGrad.addColorStop(0.28, 'rgba(8, 10, 14, 0.42)');
    tireGrad.addColorStop(0.5, 'rgba(15, 18, 24, 0.12)');
    tireGrad.addColorStop(0.72, 'rgba(8, 10, 14, 0.42)');
    tireGrad.addColorStop(1, 'rgba(10, 12, 16, 0)');
    rCtx.fillStyle = tireGrad;
    rCtx.fillRect(cx - 110, 0, 220, 1024);
  });

  // Wet rain puddle patches on roughness map (dark = glossy mirror puddle)
  for (let p = 0; p < 22; p++) {
    const px = ((p * 97) % 440) + 36;
    const py = ((p * 163) % 460) + 26;
    const rx = 28 + (p % 4) * 18;
    const ry = 45 + (p % 5) * 26;
    const pGrad = rgCtx.createRadialGradient(px, py, 4, px, py, Math.max(rx, ry));
    pGrad.addColorStop(0, '#111827'); // Mirror wet puddle
    pGrad.addColorStop(0.65, '#374151');
    pGrad.addColorStop(1, 'rgba(156, 163, 175, 0)');
    rgCtx.fillStyle = pGrad;
    rgCtx.beginPath();
    rgCtx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    rgCtx.fill();

    // Slightly darken wet puddle on albedo
    rCtx.fillStyle = 'rgba(6, 9, 15, 0.35)';
    rCtx.beginPath();
    rCtx.ellipse(px * 2, py * 2, rx * 2, ry * 2, 0, 0, Math.PI * 2);
    rCtx.fill();
  }

  // Realistic weathered asphalt cracks & tar repair seams
  rCtx.strokeStyle = '#090b10';
  rCtx.lineWidth = 2.2;
  for (let c = 0; c < 14; c++) {
    let cx = 60 + ((c * 149) % 900);
    let cy = (c * 83) % 1024;
    rCtx.beginPath();
    rCtx.moveTo(cx, cy);
    for (let seg = 0; seg < 8; seg++) {
      cx += ((seg * 19 + c * 7) % 28) - 14;
      cy += 18 + (seg % 3) * 8;
      rCtx.lineTo(cx, cy);
    }
    rCtx.stroke();
  }

  // Concrete expansion joints across the highway deck
  rCtx.strokeStyle = 'rgba(7, 9, 14, 0.85)';
  rCtx.lineWidth = 3;
  for (let y = 0; y < 1024; y += 256) {
    rCtx.beginPath();
    rCtx.moveTo(0, y);
    rCtx.lineTo(1024, y);
    rCtx.stroke();
  }

  // Realistic Highway Shoulder Lines (Double solid amber/white edge lines)
  rCtx.fillStyle = '#d97706'; // Weathered highway amber left/right edge
  rCtx.fillRect(28, 0, 12, 1024);
  rCtx.fillRect(984, 0, 12, 1024);

  rCtx.fillStyle = '#cbd5e1'; // Inner white shoulder line
  rCtx.fillRect(46, 0, 8, 1024);
  rCtx.fillRect(970, 0, 8, 1024);

  // Dashed White Lane Dividers (between the 3 lanes at x=350 and x=674)
  for (let y = 0; y < 1024; y += 128) {
    rCtx.fillStyle = '#e2e8f0';
    rCtx.fillRect(346, y + 16, 12, 68);
    rCtx.fillRect(666, y + 16, 12, 68);

    // Reflective Cat's-Eye Road Studs between dashes
    rCtx.fillStyle = '#38bdf8';
    rCtx.fillRect(348, y + 100, 8, 8);
    rCtx.fillRect(668, y + 100, 8, 8);
  }

  const roadTexture = new THREE.CanvasTexture(roadCanvas);
  roadTexture.colorSpace = THREE.SRGBColorSpace;
  roadTexture.wrapS = THREE.RepeatWrapping;
  roadTexture.wrapT = THREE.RepeatWrapping;
  roadTexture.repeat.set(1, 12);
  roadTexture.anisotropy = maxAnisotropy;

  const roadRoughnessMap = new THREE.CanvasTexture(roughCanvas);
  roadRoughnessMap.wrapS = THREE.RepeatWrapping;
  roadRoughnessMap.wrapT = THREE.RepeatWrapping;
  roadRoughnessMap.repeat.set(1, 12);
  roadRoughnessMap.anisotropy = maxAnisotropy;

  const roadBumpMap = roadRoughnessMap;

  // =========================================================================
  // 2. REALISTIC METROPOLITAN SKYSCRAPER CURTAIN WALL (Albedo + Roughness + Emissive)
  // =========================================================================
  const bldgCanvas = document.createElement('canvas');
  bldgCanvas.width = 512;
  bldgCanvas.height = 1024;
  const bCtx = bldgCanvas.getContext('2d')!;

  const bRoughCanvas = document.createElement('canvas');
  bRoughCanvas.width = 512;
  bRoughCanvas.height = 1024;
  const brCtx = bRoughCanvas.getContext('2d')!;

  const bEmissiveCanvas = document.createElement('canvas');
  bEmissiveCanvas.width = 512;
  bEmissiveCanvas.height = 1024;
  const beCtx = bEmissiveCanvas.getContext('2d')!;

  // Structural dark steel & concrete frame
  bCtx.fillStyle = '#111622';
  bCtx.fillRect(0, 0, 512, 1024);

  brCtx.fillStyle = '#cbd5e1'; // Concrete mullions are rough
  brCtx.fillRect(0, 0, 512, 1024);

  beCtx.fillStyle = '#000000';
  beCtx.fillRect(0, 0, 512, 1024);

  // Realistic office window bays (32 floors x 12 columns)
  const warmTones = ['#fef3c7', '#fde68a', '#fed7aa', '#e0f2fe', '#cbd5e1', '#93c5fd'];
  for (let row = 0; row < 32; row++) {
    const wy = 8 + row * 31;
    // Horizontal concrete spandrel beam
    bCtx.fillStyle = '#1e293b';
    bCtx.fillRect(0, wy - 4, 512, 4);

    // Some office floors have entire suites lit or dark naturally
    const floorSuiteLit = (row * 11) % 7 !== 0;

    for (let col = 0; col < 12; col++) {
      const wx = 8 + col * 42;
      const hash = (row * 19 + col * 37) % 100;
      const isLit = floorSuiteLit && hash < 42;

      // Glass pane is mirror-smooth on roughness map
      brCtx.fillStyle = '#1e293b';
      brCtx.fillRect(wx, wy, 34, 23);

      if (isLit) {
        const tone = warmTones[(row + col) % warmTones.length];
        bCtx.fillStyle = tone;
        bCtx.fillRect(wx, wy, 34, 23);

        // Interior ceiling strip / blinds detail inside lit office window
        bCtx.fillStyle = 'rgba(15, 23, 42, 0.35)';
        bCtx.fillRect(wx, wy + 12, 34, 11);

        beCtx.fillStyle = tone;
        beCtx.fillRect(wx + 2, wy + 2, 30, 19);
      } else {
        // Dark reflective architectural glass pane
        const darkGlass = hash % 2 === 0 ? '#0f172a' : '#162032';
        bCtx.fillStyle = darkGlass;
        bCtx.fillRect(wx, wy, 34, 23);
      }
    }
  }

  const buildingTexture = new THREE.CanvasTexture(bldgCanvas);
  buildingTexture.colorSpace = THREE.SRGBColorSpace;
  buildingTexture.wrapS = THREE.RepeatWrapping;
  buildingTexture.wrapT = THREE.RepeatWrapping;
  buildingTexture.anisotropy = maxAnisotropy;

  const buildingRoughnessMap = new THREE.CanvasTexture(bRoughCanvas);
  buildingRoughnessMap.wrapS = THREE.RepeatWrapping;
  buildingRoughnessMap.wrapT = THREE.RepeatWrapping;
  buildingRoughnessMap.anisotropy = maxAnisotropy;

  const buildingEmissiveMap = new THREE.CanvasTexture(bEmissiveCanvas);
  buildingEmissiveMap.colorSpace = THREE.SRGBColorSpace;
  buildingEmissiveMap.wrapS = THREE.RepeatWrapping;
  buildingEmissiveMap.wrapT = THREE.RepeatWrapping;
  buildingEmissiveMap.anisotropy = maxAnisotropy;

  // =========================================================================
  // 3. WEATHERED ARCHITECTURAL CONCRETE TEXTURE (Barriers, Overpasses, Piers)
  // =========================================================================
  const concCanvas = document.createElement('canvas');
  concCanvas.width = 256;
  concCanvas.height = 256;
  const cCtx = concCanvas.getContext('2d')!;
  cCtx.fillStyle = '#334155';
  cCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const x = (i * 53) % 256;
    const y = (i * 97) % 256;
    const v = 42 + (i % 24);
    cCtx.fillStyle = `rgb(${v}, ${v + 4}, ${v + 10})`;
    cCtx.fillRect(x, y, 2, 2);
  }
  const concreteTexture = new THREE.CanvasTexture(concCanvas);
  concreteTexture.colorSpace = THREE.SRGBColorSpace;
  concreteTexture.wrapS = THREE.RepeatWrapping;
  concreteTexture.wrapT = THREE.RepeatWrapping;
  concreteTexture.anisotropy = maxAnisotropy;

  // =========================================================================
  // 4. REALISTIC INDUSTRIAL HAZARD & REFLECTIVE CHEVRON TEXTURE
  // =========================================================================
  const hazCanvas = document.createElement('canvas');
  hazCanvas.width = 256;
  hazCanvas.height = 64;
  const hCtx = hazCanvas.getContext('2d')!;
  hCtx.fillStyle = '#18181b';
  hCtx.fillRect(0, 0, 256, 64);
  hCtx.fillStyle = '#f59e0b'; // Realistic highway amber-orange hazard stripe
  for (let x = -64; x < 320; x += 48) {
    hCtx.beginPath();
    hCtx.moveTo(x, 0);
    hCtx.lineTo(x + 22, 0);
    hCtx.lineTo(x + 46, 64);
    hCtx.lineTo(x + 24, 64);
    hCtx.closePath();
    hCtx.fill();
  }
  // Top & bottom steel flange trim
  hCtx.fillStyle = '#3f3f46';
  hCtx.fillRect(0, 0, 256, 6);
  hCtx.fillRect(0, 58, 256, 6);

  const hazardTexture = new THREE.CanvasTexture(hazCanvas);
  hazardTexture.colorSpace = THREE.SRGBColorSpace;
  hazardTexture.wrapS = THREE.RepeatWrapping;
  hazardTexture.wrapT = THREE.RepeatWrapping;
  hazardTexture.anisotropy = maxAnisotropy;

  // =========================================================================
  // 5. METROPOLITAN OVERPASS HIGHWAY SIGNAGE TEXTURE
  // =========================================================================
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512;
  signCanvas.height = 128;
  const sgCtx = signCanvas.getContext('2d')!;
  sgCtx.fillStyle = '#064e3b'; // Authentic highway gantry sign deep green
  sgCtx.fillRect(0, 0, 512, 128);
  sgCtx.strokeStyle = '#e2e8f0';
  sgCtx.lineWidth = 5;
  sgCtx.strokeRect(6, 6, 500, 116);

  sgCtx.fillStyle = '#f8fafc';
  sgCtx.font = 'bold 26px sans-serif';
  sgCtx.textAlign = 'center';
  sgCtx.fillText('METRO I-90 EXPRESS · CITADEL CORE', 256, 48);

  sgCtx.fillStyle = '#fbbf24';
  sgCtx.font = 'bold 20px monospace';
  sgCtx.fillText('▼ LANE 1      ▼ CENTER      ▼ LANE 3', 256, 94);

  const highwaySignTexture = new THREE.CanvasTexture(signCanvas);
  highwaySignTexture.colorSpace = THREE.SRGBColorSpace;
  highwaySignTexture.anisotropy = maxAnisotropy;

  // =========================================================================
  // 6. REALISTIC GROUND AMBIENT OCCLUSION CONTACT SHADOW
  // =========================================================================
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sCtx = shadowCanvas.getContext('2d')!;
  const grad = sCtx.createRadialGradient(64, 64, 6, 64, 64, 58);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.42)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 128, 128);

  const contactShadowTexture = new THREE.CanvasTexture(shadowCanvas);
  contactShadowTexture.colorSpace = THREE.SRGBColorSpace;

  return {
    roadTexture,
    roadRoughnessMap,
    roadBumpMap,
    buildingTexture,
    buildingRoughnessMap,
    buildingEmissiveMap,
    concreteTexture,
    hazardTexture,
    highwaySignTexture,
    contactShadowTexture,
    dispose: () => {
      roadTexture.dispose();
      roadRoughnessMap.dispose();
      buildingTexture.dispose();
      buildingRoughnessMap.dispose();
      buildingEmissiveMap.dispose();
      concreteTexture.dispose();
      hazardTexture.dispose();
      highwaySignTexture.dispose();
      contactShadowTexture.dispose();
    },
  };
}
