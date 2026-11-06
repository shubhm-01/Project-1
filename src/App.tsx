/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { GameCanvas, GameCanvasHandle } from './components/GameCanvas';
import {
  GameMode,
  HudState,
  PersistentSaveData,
  STAGES,
} from './types/game';
import { loadSaveData, saveGameData } from './utils/storage';
import { soundEngine } from './audio/soundEngine';

const INITIAL_HUD: HudState = {
  score: 0,
  distance: 0,
  coins: 0,
  diamonds: 0,
  stage: STAGES[0],
  speed: 72,
  shieldActive: false,
  shieldTimeLeft: 0,
  shieldMaxTime: 8,
  boosterActive: false,
  boosterTimeLeft: 0,
  boosterMaxTime: 6,
  monsterThreat: 38,
  combo: 1,
  stageBannerText: null,
  tutorialInfo: null,
  statusToast: null,
};

export default function App() {
  const canvasRef = useRef<GameCanvasHandle | null>(null);
  const [saveData, setSaveData] = useState<PersistentSaveData>(() => loadSaveData());
  const [gameMode, setGameMode] = useState<GameMode>('title');
  const [activePlayMode, setActivePlayMode] = useState<'playing' | 'tutorial'>('playing');
  const [selectedStageId, setSelectedStageId] = useState<number>(1);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [controlsCollapsed, setControlsCollapsed] = useState<boolean>(false);
  const [showUpgradesModal, setShowUpgradesModal] = useState<boolean>(false);

  const [lastRunStats, setLastRunStats] = useState<{
    score: number;
    distance: number;
    coins: number;
    diamonds: number;
    stageId: number;
    cause: string;
    isNewRecord: boolean;
  } | null>(null);

  // Sync mute state with soundEngine on mount
  useEffect(() => {
    soundEngine.setMuted(saveData.muted);
  }, [saveData.muted]);

  const handleToggleMute = useCallback(() => {
    setSaveData((prev) => {
      const next = { ...prev, muted: !prev.muted };
      soundEngine.setMuted(next.muted);
      saveGameData(next);
      return next;
    });
  }, []);

  const handleStartGame = useCallback(
    (mode: 'playing' | 'tutorial', stageId: number = selectedStageId) => {
      setShowUpgradesModal(false);
      setActivePlayMode(mode);
      setGameMode(mode);
      canvasRef.current?.startNewRun(mode, stageId);
    },
    [selectedStageId],
  );

  const handleTogglePause = useCallback(() => {
    setGameMode((prev) => {
      if (prev === 'playing' || prev === 'tutorial') {
        soundEngine.stopMusic();
        return 'paused';
      }
      if (prev === 'paused') {
        soundEngine.startMusic(hud.stage.id);
        return activePlayMode;
      }
      return prev;
    });
  }, [activePlayMode, hud.stage.id]);

  const handleGameOver = useCallback(
    (finalStats: {
      score: number;
      distance: number;
      coins: number;
      diamonds: number;
      stageId: number;
      cause: string;
    }) => {
      setGameMode('gameover');
      setSaveData((prev) => {
        const isNewRecord = finalStats.score > prev.highScore;
        const next: PersistentSaveData = {
          ...prev,
          highScore: Math.max(prev.highScore, finalStats.score),
          bestDistance: Math.max(prev.bestDistance, finalStats.distance),
          highestStage: Math.max(prev.highestStage, finalStats.stageId),
          totalCoins: prev.totalCoins + finalStats.coins,
          totalDiamonds: prev.totalDiamonds + finalStats.diamonds,
        };
        saveGameData(next);
        setLastRunStats({
          ...finalStats,
          isNewRecord,
        });
        return next;
      });
    },
    [],
  );

  const handleTutorialComplete = useCallback(() => {
    setActivePlayMode('playing');
    setGameMode('playing');
    setSaveData((prev) => {
      const next = { ...prev, tutorialCompleted: true, totalCoins: prev.totalCoins + 50 };
      saveGameData(next);
      return next;
    });
  }, []);

  // Keyboard shortcuts on Title / GameOver / Pause screens
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'KeyM') {
        handleToggleMute();
      } else if (e.code === 'KeyH') {
        setControlsCollapsed((c) => !c);
      } else if (
        (e.code === 'Enter' || e.code === 'Space') &&
        gameMode === 'title' &&
        !showUpgradesModal
      ) {
        e.preventDefault();
        handleStartGame('playing', selectedStageId);
      } else if ((e.code === 'Enter' || e.code === 'Space') && gameMode === 'gameover') {
        e.preventDefault();
        handleStartGame('playing', selectedStageId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gameMode, showUpgradesModal, selectedStageId, handleStartGame, handleToggleMute]);

  // Native Android Hardware Back Button & App Background Lifecycle Handling
  useEffect(() => {
    const backListenerPromise = CapacitorApp.addListener('backButton', () => {
      if (showUpgradesModal) {
        setShowUpgradesModal(false);
      } else if (gameMode === 'playing' || gameMode === 'tutorial') {
        handleTogglePause();
      } else if (gameMode === 'paused' || gameMode === 'gameover') {
        soundEngine.stopMusic();
        setGameMode('title');
      } else {
        CapacitorApp.exitApp();
      }
    });

    const stateListenerPromise = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        soundEngine.stopMusic();
        if (gameMode === 'playing' || gameMode === 'tutorial') {
          setGameMode('paused');
        }
      }
    });

    return () => {
      backListenerPromise.then((h) => h.remove()).catch(() => {});
      stateListenerPromise.then((h) => h.remove()).catch(() => {});
    };
  }, [gameMode, showUpgradesModal, handleTogglePause]);

  // Upgrade purchase handler
  const handleUpgrade = (key: keyof PersistentSaveData['upgrades'], costCoins: number) => {
    setSaveData((prev) => {
      const currentLvl = prev.upgrades[key];
      if (currentLvl >= 5 || prev.totalCoins < costCoins) return prev;
      soundEngine.playDiamond();
      const next: PersistentSaveData = {
        ...prev,
        totalCoins: prev.totalCoins - costCoins,
        upgrades: {
          ...prev.upgrades,
          [key]: currentLvl + 1,
        },
      };
      saveGameData(next);
      return next;
    });
  };

  const isInRun = gameMode === 'playing' || gameMode === 'tutorial';

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-[#05060d] text-slate-100">
      {/* Isolated Full-Bleed Three.js 3D Viewport */}
      <GameCanvas
        ref={canvasRef}
        gameMode={gameMode}
        upgrades={saveData.upgrades}
        onHudUpdate={setHud}
        onGameOver={handleGameOver}
        onTutorialComplete={handleTutorialComplete}
        onTogglePause={handleTogglePause}
      />

      {/* =====================================================================
          1. TITLE SCREEN OVERLAY (Full-Viewport Game Shell, Live 3D Backdrop)
      ===================================================================== */}
      {gameMode === 'title' && (
        <div className="fixed inset-0 z-20 flex flex-col justify-between p-5 sm:p-8 pointer-events-none bg-gradient-to-t from-[#05060d]/95 via-[#05060d]/35 to-[#05060d]/80">
          {/* Top Perimeter Bar: High Score Readout & Audio Toggle */}
          <div className="flex items-center justify-between w-full max-w-6xl mx-auto pointer-events-auto">
            <div className="flex items-center gap-3 text-xs sm:text-sm font-mono tabular-nums text-slate-300 bg-[#090d1a]/90 border border-cyan-500/25 px-3.5 py-2 rounded-lg">
              <span className="text-cyan-400 font-bold">HIGH SCORE</span>
              <span className="text-white font-bold">{saveData.highScore.toLocaleString()}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-slate-400">BEST {saveData.bestDistance}M</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-amber-400">{saveData.totalCoins} COINS</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-fuchsia-400">{saveData.totalDiamonds} GEMS</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowUpgradesModal((v) => !v)}
                className="px-3.5 py-2 text-xs font-semibold tracking-wider uppercase text-cyan-300 bg-[#090d1a]/90 border border-cyan-500/30 rounded-lg hover:bg-cyan-950/80 hover:border-cyan-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Suit Armory
              </button>
              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={saveData.muted ? 'Unmute Audio' : 'Mute Audio'}
                className="p-2.5 text-slate-200 bg-[#090d1a]/90 border border-slate-700/80 rounded-lg hover:border-cyan-400 transition-colors cursor-pointer"
              >
                {saveData.muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
              </button>
            </div>
          </div>

          {/* Center Negative Space (35%+) with Bespoke SVG Title Lockup */}
          <div className="my-auto flex flex-col items-center text-center max-w-3xl mx-auto pointer-events-auto">
            {/* Bespoke Inline SVG Emblem & Lockup */}
            <svg
              viewBox="0 0 560 110"
              className="w-full max-w-[480px] h-auto mb-2 drop-shadow-[0_4px_24px_rgba(6,182,212,0.35)]"
              role="img"
              aria-label="Shadow Escape: The Last Survivor"
            >
              <defs>
                <linearGradient id="neonTitleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="50%" stopColor="#e2e8f0" />
                  <stop offset="100%" stopColor="#c084fc" />
                </linearGradient>
                <linearGradient id="bladeAccent" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="50%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#f43f5e" />
                </linearGradient>
              </defs>
              {/* Cybernetic Wing Frame */}
              <polygon points="30,18 120,18 105,24 20,24" fill="#06b6d4" opacity="0.85" />
              <polygon points="440,18 530,18 540,24 455,24" fill="#f43f5e" opacity="0.85" />
              <text
                x="280"
                y="58"
                textAnchor="middle"
                fill="url(#neonTitleGrad)"
                fontFamily="Orbitron, sans-serif"
                fontWeight="900"
                fontSize="44"
                letterSpacing="4"
              >
                SHADOW ESCAPE
              </text>
              {/* Razor Horizon Divider */}
              <rect x="70" y="70" width="420" height="3" fill="url(#bladeAccent)" rx="1.5" />
              <text
                x="280"
                y="96"
                textAnchor="middle"
                fill="#f43f5e"
                fontFamily="Orbitron, sans-serif"
                fontWeight="700"
                fontSize="15"
                letterSpacing="9"
              >
                THE LAST SURVIVOR
              </text>
            </svg>

            <p className="text-xs sm:text-sm text-slate-300 max-w-lg mb-5 leading-relaxed">
              Sprint through 5 progressively deadlier neon sectors at midnight. Dodge plasma blockades, outrun the Void Stalker, and harness Aegis Shields and Overdrive Boosters.
            </p>

            {/* Stage Selector (Stages 1 to 5) */}
            <div className="w-full max-w-xl mb-5 bg-[#090d1a]/92 border border-slate-800/90 rounded-xl p-3">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2 px-1">
                <span className="font-semibold text-slate-200">Select Deployment Sector (5 Stages)</span>
                <span className="font-mono text-cyan-400">
                  {STAGES[selectedStageId - 1].subtitle}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {STAGES.map((stg) => {
                  const isSelected = selectedStageId === stg.id;
                  return (
                    <button
                      key={stg.id}
                      type="button"
                      onClick={() => setSelectedStageId(stg.id)}
                      className={`py-2 px-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        isSelected
                          ? 'bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.5)]'
                          : 'bg-slate-900/90 text-slate-300 border border-slate-800 hover:border-cyan-500/50'
                      }`}
                    >
                      S0{stg.id}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 mt-2 text-left px-1">
                {STAGES[selectedStageId - 1].description} · Base Speed: {Math.round(STAGES[selectedStageId - 1].baseSpeed * 3.6)} km/h
              </p>
            </div>

            {/* Primary CTA Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => handleStartGame('playing', selectedStageId)}
                className="flex items-center gap-2.5 px-7 py-3.5 rounded-xl font-display font-bold text-sm sm:text-base tracking-wider uppercase bg-cyan-400 text-slate-950 hover:bg-cyan-300 shadow-[0_0_28px_rgba(6,182,212,0.55)] transition-transform active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Play className="w-4 h-4 fill-current" />
                Start Escape Run
              </button>

              <button
                type="button"
                onClick={() => handleStartGame('tutorial', 1)}
                className="flex items-center gap-2 px-5 py-3.5 rounded-xl font-display font-bold text-xs sm:text-sm tracking-wider uppercase bg-[#0d1326]/95 text-purple-300 border border-purple-500/45 hover:bg-purple-950/60 hover:border-purple-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Playable Tutorial
                {!saveData.tutorialCompleted && (
                  <span className="ml-1 text-[10px] text-cyan-300 font-mono">
                    (+50 Coins)
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Single Flat Control-Hint Line at Bottom */}
          <div className="text-center text-xs font-mono text-slate-400 tracking-wide pointer-events-auto">
            A/D or Left/Right Move · W/Space Jump · S/Down Slide · Swipe on Mobile · Esc Pause
          </div>
        </div>
      )}

      {/* =====================================================================
          SUIT ARMORY UPGRADE MODAL (On Title Screen)
      ===================================================================== */}
      {gameMode === 'title' && showUpgradesModal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#05060d]/90">
          <div className="w-full max-w-md bg-[#0b1021] border border-cyan-500/35 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-bold text-lg text-white tracking-wide">
                CYBER-SUIT ARMORY
              </h2>
              <span className="text-xs font-mono text-amber-400 font-bold">
                {saveData.totalCoins} COINS AVAILABLE
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-5">
              Upgrade your survivor rig using coins collected during escape runs.
            </p>

            <div className="space-y-3 mb-6">
              {/* Shield Duration */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <div>
                  <div className="text-sm font-semibold text-cyan-300">
                    Aegis Shield Capacitor
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    Level {saveData.upgrades.shieldDurationLevel}/5 · Duration {(7 + saveData.upgrades.shieldDurationLevel * 1.5).toFixed(1)}s
                  </div>
                </div>
                <button
                  type="button"
                  disabled={
                    saveData.upgrades.shieldDurationLevel >= 5 ||
                    saveData.totalCoins < saveData.upgrades.shieldDurationLevel * 40
                  }
                  onClick={() =>
                    handleUpgrade(
                      'shieldDurationLevel',
                      saveData.upgrades.shieldDurationLevel * 40,
                    )
                  }
                  className="px-3.5 py-2 rounded-lg text-xs font-mono font-bold bg-cyan-500 text-slate-950 disabled:bg-slate-800 disabled:text-slate-500 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {saveData.upgrades.shieldDurationLevel >= 5
                    ? 'MAXED'
                    : `${saveData.upgrades.shieldDurationLevel * 40} COINS`}
                </button>
              </div>

              {/* Booster Duration */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <div>
                  <div className="text-sm font-semibold text-rose-400">
                    Overdrive Thruster Core
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    Level {saveData.upgrades.boosterDurationLevel}/5 · Duration {(5 + saveData.upgrades.boosterDurationLevel * 1.2).toFixed(1)}s
                  </div>
                </div>
                <button
                  type="button"
                  disabled={
                    saveData.upgrades.boosterDurationLevel >= 5 ||
                    saveData.totalCoins < saveData.upgrades.boosterDurationLevel * 40
                  }
                  onClick={() =>
                    handleUpgrade(
                      'boosterDurationLevel',
                      saveData.upgrades.boosterDurationLevel * 40,
                    )
                  }
                  className="px-3.5 py-2 rounded-lg text-xs font-mono font-bold bg-rose-500 text-white disabled:bg-slate-800 disabled:text-slate-500 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {saveData.upgrades.boosterDurationLevel >= 5
                    ? 'MAXED'
                    : `${saveData.upgrades.boosterDurationLevel * 40} COINS`}
                </button>
              </div>

              {/* Score Multiplier */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <div>
                  <div className="text-sm font-semibold text-purple-300">
                    Neural Telemetry Amplifier
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    Level {saveData.upgrades.scoreMultiplierLevel}/5 · Score {(1 + (saveData.upgrades.scoreMultiplierLevel - 1) * 0.25).toFixed(2)}x
                  </div>
                </div>
                <button
                  type="button"
                  disabled={
                    saveData.upgrades.scoreMultiplierLevel >= 5 ||
                    saveData.totalCoins < saveData.upgrades.scoreMultiplierLevel * 50
                  }
                  onClick={() =>
                    handleUpgrade(
                      'scoreMultiplierLevel',
                      saveData.upgrades.scoreMultiplierLevel * 50,
                    )
                  }
                  className="px-3.5 py-2 rounded-lg text-xs font-mono font-bold bg-purple-500 text-white disabled:bg-slate-800 disabled:text-slate-500 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {saveData.upgrades.scoreMultiplierLevel >= 5
                    ? 'MAXED'
                    : `${saveData.upgrades.scoreMultiplierLevel * 50} COINS`}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowUpgradesModal(false)}
              className="w-full py-2.5 rounded-xl text-xs font-display font-bold uppercase tracking-wider bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer"
            >
              Close Armory
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          2. LOW-OCCLUSION IN-GAME PERIMETER HUD (<= 15% Viewport Footprint)
      ===================================================================== */}
      {(isInRun || gameMode === 'paused') && (
        <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
          {/* Top Perimeter Telemetry Bar */}
          <div className="flex items-start justify-between gap-2 w-full max-w-6xl mx-auto">
            {/* Left Cluster: Score, Distance, Stage */}
            <div className="pointer-events-auto bg-[#070b17]/90 border border-cyan-500/30 rounded-xl px-3.5 py-2.5 shadow-lg">
              <div className="flex items-baseline gap-3">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">
                    SCORE · {hud.combo}X
                  </div>
                  <div className="font-display font-extrabold text-xl sm:text-2xl tabular-nums text-white">
                    {hud.score.toLocaleString()}
                  </div>
                </div>
                <div className="h-7 w-px bg-slate-800" />
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-purple-400">
                    DISTANCE
                  </div>
                  <div className="font-mono font-bold text-base sm:text-lg tabular-nums text-slate-100">
                    {hud.distance}m
                  </div>
                </div>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-400">
                <span className="text-cyan-300 font-semibold">{hud.stage.name}</span>
                <span aria-hidden="true">·</span>
                <span>{hud.speed} km/h</span>
                <span aria-hidden="true">·</span>
                <span>HI { Math.max(saveData.highScore, hud.score).toLocaleString() }</span>
              </div>
            </div>

            {/* Center Cluster: Collectibles & Active Power-Up Timers */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="pointer-events-auto flex items-center gap-3 bg-[#070b17]/90 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono tabular-nums">
                <span className="text-amber-400 font-bold">
                  COINS {hud.coins}
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-cyan-300 font-bold">
                  DIAMONDS {hud.diamonds}
                </span>
                <span aria-hidden="true" className="text-slate-600 hidden sm:inline">·</span>
                <span className="text-rose-400 font-bold hidden sm:inline">
                  THREAT {hud.monsterThreat}%
                </span>
              </div>

              {/* Active Power-Up Bars */}
              <div className="flex items-center gap-2">
                {hud.shieldActive && (
                  <div className="flex items-center gap-1.5 bg-[#082f49]/95 border border-cyan-400/50 rounded-lg px-2.5 py-1 text-[11px] font-mono text-cyan-200 tabular-nums">
                    <Shield className="w-3.5 h-3.5 text-cyan-400" />
                    <span>SHIELD {hud.shieldTimeLeft.toFixed(1)}s</span>
                  </div>
                )}
                {hud.boosterActive && (
                  <div className="flex items-center gap-1.5 bg-[#4c0519]/95 border border-rose-400/50 rounded-lg px-2.5 py-1 text-[11px] font-mono text-rose-200 tabular-nums">
                    <Zap className="w-3.5 h-3.5 text-rose-400" />
                    <span>BOOST {hud.boosterTimeLeft.toFixed(1)}s</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Cluster: Mute & Pause Action Buttons */}
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={saveData.muted ? 'Unmute' : 'Mute'}
                className="p-2.5 bg-[#070b17]/90 border border-slate-800 rounded-xl text-slate-200 hover:border-cyan-400 transition-colors cursor-pointer"
              >
                {saveData.muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
              </button>
              <button
                type="button"
                onClick={handleTogglePause}
                aria-label="Pause Game"
                className="p-2.5 bg-[#070b17]/90 border border-slate-800 rounded-xl text-slate-200 hover:border-cyan-400 transition-colors cursor-pointer"
              >
                <Pause className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive Tutorial Banner (When in Tutorial Mode) */}
          {hud.tutorialInfo && (
            <div className="mx-auto max-w-md w-full bg-[#090d1e]/95 border border-purple-500/50 rounded-xl p-3.5 text-center shadow-xl pointer-events-auto">
              <div className="flex items-center justify-between text-xs font-mono text-purple-300 mb-1">
                <span>{hud.tutorialInfo.title}</span>
                <span className="tabular-nums font-bold text-cyan-300">
                  {hud.tutorialInfo.progress} / {hud.tutorialInfo.target}
                </span>
              </div>
              <p className="text-xs sm:text-sm font-medium text-white mb-1">
                {hud.tutorialInfo.instruction}
              </p>
              <div className="text-[11px] font-mono text-slate-400">
                {hud.tutorialInfo.keyHint} · {hud.tutorialInfo.touchHint}
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleStartGame('playing', 1)}
                  className="text-[11px] font-mono text-cyan-400 hover:underline cursor-pointer"
                >
                  Skip to Stage 01 →
                </button>
              </div>
            </div>
          )}

          {/* Stage Transition Announcement & Toast Notifications */}
          <div className="my-auto flex flex-col items-center pointer-events-none">
            {hud.stageBannerText && (
              <div className="bg-[#070b17]/92 border-y border-cyan-400/50 px-8 py-3 text-center">
                <div className="font-display font-black text-lg sm:text-2xl tracking-widest text-cyan-300">
                  {hud.stageBannerText}
                </div>
              </div>
            )}
            {hud.statusToast && (
              <div className="mt-2 bg-[#090d1a]/92 border border-purple-500/40 px-4 py-1.5 rounded-lg text-xs font-mono font-bold text-purple-200">
                {hud.statusToast}
              </div>
            )}
          </div>

          {/* Unified Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
          <div className="mx-auto w-full max-w-[540px] flex flex-col items-center pointer-events-auto">
            <button
              type="button"
              onClick={() => setControlsCollapsed((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-t-lg bg-[#070b17]/90 border border-b-0 border-slate-800 text-[11px] font-mono text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              {controlsCollapsed ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Show Touch Dock (H)</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Hide Touch Dock (H)</span>
                </>
              )}
            </button>

            {!controlsCollapsed && (
              <div className="w-full bg-[#070b17]/92 border border-slate-800/90 rounded-xl p-2 flex items-center justify-between gap-2 shadow-xl">
                {/* Left / Right Steering Controls */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      canvasRef.current?.triggerAction('left');
                    }}
                    className="w-14 h-12 sm:w-16 sm:h-12 flex items-center justify-center rounded-lg bg-slate-900 border border-cyan-500/35 text-cyan-300 active:bg-cyan-500 active:text-slate-950 transition-colors cursor-pointer"
                    aria-label="Move Left"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      canvasRef.current?.triggerAction('right');
                    }}
                    className="w-14 h-12 sm:w-16 sm:h-12 flex items-center justify-center rounded-lg bg-slate-900 border border-cyan-500/35 text-cyan-300 active:bg-cyan-500 active:text-slate-950 transition-colors cursor-pointer"
                    aria-label="Move Right"
                  >
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>

                {/* Center Stage / Threat Compact Readout */}
                <div className="hidden sm:flex flex-col items-center text-[11px] font-mono text-slate-400 tabular-nums">
                  <span className="text-slate-300 font-semibold">{hud.stage.subtitle}</span>
                  <span>SWIPE OR USE BUTTONS</span>
                </div>

                {/* Jump / Slide Action Controls */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      canvasRef.current?.triggerAction('slide');
                    }}
                    className="px-4 h-12 flex items-center gap-1.5 rounded-lg bg-slate-900 border border-purple-500/40 text-purple-300 font-display font-bold text-xs active:bg-purple-500 active:text-slate-950 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <ArrowDown className="w-4 h-4" />
                    <span>SLIDE</span>
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      canvasRef.current?.triggerAction('jump');
                    }}
                    className="px-4 h-12 flex items-center gap-1.5 rounded-lg bg-slate-900 border border-rose-500/40 text-rose-300 font-display font-bold text-xs active:bg-rose-500 active:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <ArrowUp className="w-4 h-4" />
                    <span>JUMP</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          3. PAUSE MODAL
      ===================================================================== */}
      {gameMode === 'paused' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#05060d]/88">
          <div className="w-full max-w-sm bg-[#0b1021] border border-cyan-500/35 rounded-2xl p-6 text-center shadow-2xl">
            <h2 className="font-display font-black text-2xl text-white tracking-wider mb-1">
              SYSTEM PAUSED
            </h2>
            <p className="text-xs font-mono text-cyan-400 mb-5">
              {hud.stage.name} · {hud.stage.subtitle}
            </p>

            <div className="grid grid-cols-2 gap-2.5 mb-6 text-left bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 font-mono text-xs tabular-nums">
              <div>
                <div className="text-slate-400">SCORE</div>
                <div className="text-white font-bold text-sm">{hud.score.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-slate-400">DISTANCE</div>
                <div className="text-white font-bold text-sm">{hud.distance}m</div>
              </div>
              <div>
                <div className="text-slate-400">COINS</div>
                <div className="text-amber-400 font-bold text-sm">{hud.coins}</div>
              </div>
              <div>
                <div className="text-slate-400">DIAMONDS</div>
                <div className="text-cyan-300 font-bold text-sm">{hud.diamonds}</div>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleTogglePause}
                className="w-full py-3 rounded-xl font-display font-bold text-sm uppercase tracking-wider bg-cyan-400 text-slate-950 hover:bg-cyan-300 cursor-pointer"
              >
                Resume Escape
              </button>
              <button
                type="button"
                onClick={() => handleStartGame(activePlayMode, selectedStageId)}
                className="w-full py-3 rounded-xl font-display font-bold text-xs uppercase tracking-wider bg-slate-800 text-slate-100 hover:bg-slate-700 cursor-pointer"
              >
                Restart Sector
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.stopMusic();
                  setGameMode('title');
                }}
                className="w-full py-2.5 rounded-xl font-mono text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Return to Title Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          4. GAME OVER MODAL
      ===================================================================== */}
      {gameMode === 'gameover' && lastRunStats && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#05060d]/90">
          <div className="w-full max-w-md bg-[#0b1021] border border-rose-500/45 rounded-2xl p-6 text-center shadow-2xl">
            <div className="text-xs font-mono uppercase tracking-widest text-rose-400 mb-1">
              VOID STALKER INTERCEPTION
            </div>
            <h2 className="font-display font-black text-2xl sm:text-3xl text-white tracking-wider mb-1">
              SURVIVOR DOWN
            </h2>
            <p className="text-xs text-slate-400 mb-5">{lastRunStats.cause}</p>

            {lastRunStats.isNewRecord && (
              <div className="mb-4 py-1.5 px-3 rounded-lg bg-cyan-950/90 border border-cyan-400/50 text-xs font-mono font-bold text-cyan-300">
                NEW PERSONAL HIGH SCORE RECORD!
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-6 text-left bg-slate-900/90 border border-slate-800 rounded-xl p-4 font-mono tabular-nums">
              <div>
                <div className="text-[11px] text-slate-400">FINAL SCORE</div>
                <div className="text-lg font-bold text-white">
                  {lastRunStats.score.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">HIGH SCORE</div>
                <div className="text-lg font-bold text-cyan-400">
                  {saveData.highScore.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">DISTANCE REACHED</div>
                <div className="text-sm font-bold text-purple-300">
                  {lastRunStats.distance}m (Stage 0{lastRunStats.stageId})
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">LOOT SECURED</div>
                <div className="text-sm font-bold text-amber-400">
                  +{lastRunStats.coins} Coins · +{lastRunStats.diamonds} Gems
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => handleStartGame('playing', selectedStageId)}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl font-display font-bold text-xs sm:text-sm uppercase tracking-wider bg-cyan-400 text-slate-950 hover:bg-cyan-300 cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
                Play Again
              </button>
              <button
                type="button"
                onClick={() => setGameMode('title')}
                className="py-3.5 px-5 rounded-xl font-display font-bold text-xs sm:text-sm uppercase tracking-wider bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer whitespace-nowrap shrink-0"
              >
                Title & Armory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
