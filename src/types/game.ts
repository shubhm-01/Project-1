export type GameMode = 'title' | 'playing' | 'tutorial' | 'paused' | 'gameover';

export type LaneIndex = -1 | 0 | 1; // -1 = Left, 0 = Center, 1 = Right

export type ObstacleType = 'low_barrier' | 'high_laser' | 'blockade' | 'drone';

export type CollectibleType = 'coin' | 'diamond' | 'shield' | 'booster';

export type GraphicsQuality = 'high' | 'balanced';

export interface StageConfig {
  id: number;
  name: string;
  subtitle: string;
  minDistance: number;
  baseSpeed: number;
  maxSpeed: number;
  spawnInterval: number;
  fogColor: number;
  keyLightColor: number;
  hemiSkyColor: number;
  hemiGroundColor: number;
  neonPrimaryHex: string;
  neonSecondaryHex: string;
  accentColor: number;
  description: string;
}

export const STAGES: StageConfig[] = [
  {
    id: 1,
    name: 'STAGE 01',
    subtitle: 'DOWNTOWN EXPRESSWAY — SECTOR 7',
    minDistance: 0,
    baseSpeed: 20,
    maxSpeed: 24,
    spawnInterval: 1.15,
    fogColor: 0x0a101d,
    keyLightColor: 0xfde68a, // Warm sodium/LED streetlamp & moonlight mix
    hemiSkyColor: 0x334155,
    hemiGroundColor: 0x090d16,
    neonPrimaryHex: '#38bdf8',
    neonSecondaryHex: '#f59e0b',
    accentColor: 0x38bdf8,
    description: 'Outrun the stalker across rain-slicked metropolitan expressway decks.',
  },
  {
    id: 2,
    name: 'STAGE 02',
    subtitle: 'FINANCIAL PLAZA — MIDNIGHT',
    minDistance: 450,
    baseSpeed: 25,
    maxSpeed: 29,
    spawnInterval: 0.95,
    fogColor: 0x0c1220,
    keyLightColor: 0xe0f2fe,
    hemiSkyColor: 0x1e293b,
    hemiGroundColor: 0x090d16,
    neonPrimaryHex: '#60a5fa',
    neonSecondaryHex: '#c084fc',
    accentColor: 0x60a5fa,
    description: 'High-rise glass towers, overpass security gates, and armored blockades.',
  },
  {
    id: 3,
    name: 'STAGE 03',
    subtitle: 'INDUSTRIAL REFINERY — CORE',
    minDistance: 1050,
    baseSpeed: 30,
    maxSpeed: 34,
    spawnInterval: 0.82,
    fogColor: 0x140d0b,
    keyLightColor: 0xfdba74,
    hemiSkyColor: 0x431407,
    hemiGroundColor: 0x0c0a09,
    neonPrimaryHex: '#f97316',
    neonSecondaryHex: '#ef4444',
    accentColor: 0xf97316,
    description: 'Autonomous hunter-seeker drones patrol the steel viaduct corridor.',
  },
  {
    id: 4,
    name: 'STAGE 04',
    subtitle: 'SUSPENSION SKYBRIDGE',
    minDistance: 1850,
    baseSpeed: 35,
    maxSpeed: 39,
    spawnInterval: 0.72,
    fogColor: 0x09131c,
    keyLightColor: 0xbae6fd,
    hemiSkyColor: 0x1e3a5f,
    hemiGroundColor: 0x060a10,
    neonPrimaryHex: '#38bdf8',
    neonSecondaryHex: '#f43f5e',
    accentColor: 0x38bdf8,
    description: 'Synchronized multi-lane barrier gauntlets across the upper bridge span.',
  },
  {
    id: 5,
    name: 'STAGE 05',
    subtitle: 'CITADEL TERMINAL — APEX',
    minDistance: 2800,
    baseSpeed: 40,
    maxSpeed: 48,
    spawnInterval: 0.62,
    fogColor: 0x13090c,
    keyLightColor: 0xfca5a5,
    hemiSkyColor: 0x450a0a,
    hemiGroundColor: 0x090406,
    neonPrimaryHex: '#ef4444',
    neonSecondaryHex: '#f59e0b',
    accentColor: 0xef4444,
    description: 'Maximum overdrive velocity under heavy lockdown. Zero margin for error.',
  },
];

export interface TutorialStepInfo {
  step: number;
  title: string;
  instruction: string;
  keyHint: string;
  touchHint: string;
  progress: number;
  target: number;
}

export const TUTORIAL_STEPS: Omit<TutorialStepInfo, 'progress'>[] = [
  {
    step: 1,
    title: '01. Tactical Lane Shift',
    instruction: 'Change lanes smoothly across the three expressway lanes.',
    keyHint: 'Press A / D or Left / Right Arrows (3 times)',
    touchHint: 'Swipe Left or Right (3 times)',
    target: 3,
  },
  {
    step: 2,
    title: '02. Athletic Vault & Jump',
    instruction: 'Leap cleanly over low concrete and laser roadblocks.',
    keyHint: 'Press W, Up Arrow, or Spacebar (2 times)',
    touchHint: 'Swipe Up or Tap Jump (2 times)',
    target: 2,
  },
  {
    step: 3,
    title: '03. Tactical Combat Slide',
    instruction: 'Slide underneath low-hanging security laser gantries.',
    keyHint: 'Press S or Down Arrow (2 times)',
    touchHint: 'Swipe Down or Tap Slide (2 times)',
    target: 2,
  },
  {
    step: 4,
    title: '04. Collectibles & Power-Ups',
    instruction: 'Gather Coins, Diamonds, Aegis Shields, and Speed Boosters ahead!',
    keyHint: 'Steer into 4 collectibles or power-ups',
    touchHint: 'Steer into 4 collectibles or power-ups',
    target: 4,
  },
];

export interface SuitUpgrades {
  shieldDurationLevel: number; // 1 to 5
  boosterDurationLevel: number; // 1 to 5
  scoreMultiplierLevel: number; // 1 to 5
}

export interface PersistentSaveData {
  highScore: number;
  bestDistance: number;
  highestStage: number;
  totalCoins: number;
  totalDiamonds: number;
  tutorialCompleted: boolean;
  muted: boolean;
  upgrades: SuitUpgrades;
}

export interface HudState {
  score: number;
  distance: number;
  coins: number;
  diamonds: number;
  stage: StageConfig;
  speed: number;
  shieldActive: boolean;
  shieldTimeLeft: number;
  shieldMaxTime: number;
  boosterActive: boolean;
  boosterTimeLeft: number;
  boosterMaxTime: number;
  monsterThreat: number; // 0 to 100 (higher = closer monster)
  combo: number;
  stageBannerText: string | null;
  tutorialInfo: TutorialStepInfo | null;
  statusToast: string | null;
}
