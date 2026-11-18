import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { DungeonScene } from './scenes/DungeonScene';
import { OverworldScene } from './scenes/OverworldScene';
import { TitleScene } from './scenes/TitleScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: '100%',
  height: '100%',
  backgroundColor: '#0d1624',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  scene: [BootScene, TitleScene, OverworldScene, DungeonScene],
};

new Phaser.Game(config);
