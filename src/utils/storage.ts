import { PersistentSaveData } from '../types/game';

const STORAGE_KEY = 'shadow_escape_last_survivor_save_v1';

const DEFAULT_SAVE: PersistentSaveData = {
  highScore: 0,
  bestDistance: 0,
  highestStage: 1,
  totalCoins: 0,
  totalDiamonds: 0,
  tutorialCompleted: false,
  muted: false,
  upgrades: {
    shieldDurationLevel: 1,
    boosterDurationLevel: 1,
    scoreMultiplierLevel: 1,
  },
};

export function loadSaveData(): PersistentSaveData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SAVE, upgrades: { ...DEFAULT_SAVE.upgrades } };
    const parsed = JSON.parse(raw);
    return {
      highScore: typeof parsed.highScore === 'number' ? parsed.highScore : 0,
      bestDistance: typeof parsed.bestDistance === 'number' ? parsed.bestDistance : 0,
      highestStage: typeof parsed.highestStage === 'number' ? Math.max(1, parsed.highestStage) : 1,
      totalCoins: typeof parsed.totalCoins === 'number' ? parsed.totalCoins : 0,
      totalDiamonds: typeof parsed.totalDiamonds === 'number' ? parsed.totalDiamonds : 0,
      tutorialCompleted: Boolean(parsed.tutorialCompleted),
      muted: Boolean(parsed.muted),
      upgrades: {
        shieldDurationLevel: parsed.upgrades?.shieldDurationLevel ?? 1,
        boosterDurationLevel: parsed.upgrades?.boosterDurationLevel ?? 1,
        scoreMultiplierLevel: parsed.upgrades?.scoreMultiplierLevel ?? 1,
      },
    };
  } catch {
    return { ...DEFAULT_SAVE, upgrades: { ...DEFAULT_SAVE.upgrades } };
  }
}

export function saveGameData(data: PersistentSaveData): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors in restricted webviews
  }
}
