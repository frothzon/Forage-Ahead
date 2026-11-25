import Phaser from 'phaser';
import { onSettingsChange, settingsStore, type FpsLimit } from './core/GameSettings';
import { musicEngine } from './core/MusicEngine';
import { isMobileTouchDevice } from './core/Platform';
import { transitionManager } from './core/TransitionManager';
import { BootScene } from './scenes/BootScene';
import { DungeonScene } from './scenes/DungeonScene';
import { HouseScene } from './scenes/HouseScene';
import { HouseTestScene } from './scenes/HouseTestScene';
import { OverworldScene } from './scenes/OverworldScene';
import { TitleScene } from './scenes/TitleScene';
import { TutorialDungeonScene } from './scenes/TutorialDungeonScene';

const initialSettings = settingsStore.get();
const initialFpsLimit: FpsLimit = initialSettings.graphics.fpsLimit;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: '100%',
  height: '100%',
  backgroundColor: '#0d1624',
  pixelArt: true,
  roundPixels: false,
  fps: {
    target: initialFpsLimit > 0 ? initialFpsLimit : 60,
    limit: initialFpsLimit,
  },
  render: {
    pixelArt: true,
    antialias: false,
    antialiasGL: false,
    powerPreference: isMobileTouchDevice() ? 'low-power' : 'default',
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  scene: [BootScene, TitleScene, TutorialDungeonScene, OverworldScene, DungeonScene, HouseScene, HouseTestScene],
};

function applyFpsLimit(targetGame: Phaser.Game, fpsLimit: FpsLimit): void {
  const loop = targetGame.loop as
    | (Phaser.Core.TimeStep & { _limitRate?: number; _target?: number })
    | undefined;
  if (!loop) return;
  const prevHasLimit = Boolean(loop.hasFpsLimit);
  const nextHasLimit = fpsLimit > 0;
  const nextTargetFps = nextHasLimit ? fpsLimit : 60;
  try {
    if ('fpsLimit' in loop) loop.fpsLimit = fpsLimit;
    if ('hasFpsLimit' in loop) loop.hasFpsLimit = nextHasLimit;
    if ('targetFps' in loop) loop.targetFps = nextTargetFps;
    if ('_limitRate' in loop) loop._limitRate = nextHasLimit ? 1000 / fpsLimit : 0;
    if ('_target' in loop) loop._target = 1000 / nextTargetFps;
    if (prevHasLimit !== nextHasLimit && loop.started && loop.running) {
      loop.sleep();
      loop.wake(true);
    }
  } catch {
    // Ignore if TimeStep internals differ in a given runtime
  }
}

transitionManager.mount();
const game = new Phaser.Game(config);
applyFpsLimit(game, initialFpsLimit);

let lastFpsLimit: FpsLimit = initialFpsLimit;
onSettingsChange((s) => {
  if (s.graphics.fpsLimit !== lastFpsLimit) {
    lastFpsLimit = s.graphics.fpsLimit;
    applyFpsLimit(game, lastFpsLimit);
  }
});

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      game.loop.sleep();
      musicEngine.suspend();
    } else {
      game.loop.wake();
      musicEngine.resume();
    }
  });
}
