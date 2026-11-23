import Phaser from 'phaser';
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

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: '100%',
  height: '100%',
  backgroundColor: '#0d1624',
  pixelArt: true,
  roundPixels: false,
  fps: {
    target: 60,
    limit: 60,
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

transitionManager.mount();
const game = new Phaser.Game(config);

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
