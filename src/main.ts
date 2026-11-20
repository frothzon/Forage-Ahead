import Phaser from 'phaser';
import { transitionManager } from './core/TransitionManager';
import { BootScene } from './scenes/BootScene';
import { DungeonScene } from './scenes/DungeonScene';
import { HouseScene } from './scenes/HouseScene';
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
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  scene: [BootScene, TitleScene, TutorialDungeonScene, OverworldScene, DungeonScene, HouseScene],
};

transitionManager.mount();
new Phaser.Game(config);
