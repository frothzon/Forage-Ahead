import Phaser from 'phaser';
import manifest from '../data/assetManifest.json';
import { registerAllAnimations } from '../entities/AnimationRegistry';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    const { width, height } = this.scale;
    const barBg = this.add.rectangle(width / 2, height / 2, 320, 18, 0x1d2b3a);
    barBg.setStrokeStyle(2, 0x5c7a99);
    const barFill = this.add.rectangle(width / 2 - 156, height / 2, 0, 12, 0x6ce08a).setOrigin(0, 0.5);
    const label = this.add
      .text(width / 2, height / 2 - 26, 'Loading Fantasy RPG Assets...', {
        fontSize: '14px',
        color: '#f6eedc',
      })
      .setOrigin(0.5);

    this.load.on('progress', (val: number) => {
      barFill.width = 312 * val;
    });
    this.load.on('complete', () => {
      label.setText('Ready!');
    });

    // 1. Tilesets (as images for Phaser Tilemaps)
    this.load.image('tileset_grass', 'assets/extras/Tileset_grass (free demo).png');
    this.load.image('tileset_autumn', 'assets/extras/Tileset_autumn (free demo).png');
    this.load.image('tileset_winter', 'assets/extras/Tileset_winter (free demo).png');
    this.load.image('tileset_coastlines', 'assets/tileset/Coastlines.png');
    this.load.image('tileset_dirt', 'assets/tileset/Dirt.png');
    this.load.image('tileset_roads_stone', 'assets/tileset/Roads_stone.png');
    this.load.image('tileset_stone_tile', 'assets/tileset/Stone tile.png');

    // 2. Hero Spritesheets (all 48x48)
    const heroSpecs = manifest.heroes as Record<string, Record<string, { key: string; frameWidth: number; frameHeight: number }>>;
    const images = manifest.images as Record<string, { path: string; width: number; height: number }>;

    for (const anims of Object.values(heroSpecs)) {
      for (const info of Object.values(anims)) {
        const img = images[info.key];
        if (!img) continue;
        this.load.spritesheet(info.key, img.path, {
          frameWidth: info.frameWidth,
          frameHeight: info.frameHeight,
        });
      }
    }

    // 3. Monster Spritesheets
    const monsterSpecs = manifest.monsters as Record<
      string,
      { frameWidth: number; frameHeight: number; anims: Record<string, { key: string }> }
    >;
    for (const spec of Object.values(monsterSpecs)) {
      for (const anim of Object.values(spec.anims)) {
        const img = images[anim.key];
        if (!img) continue;
        this.load.spritesheet(anim.key, img.path, {
          frameWidth: spec.frameWidth,
          frameHeight: spec.frameHeight,
        });
      }
    }

    // 4. Crops, Chests, Bonfire, Bobber, NPCs, Animals, Bomb
    const sheetLoads: Array<{ key: string; fw: number; fh: number }> = [
      { key: 'objects/Crops (berries)', fw: 16, fh: 32 },
      { key: 'objects/Crops (carrot)', fw: 16, fh: 32 },
      { key: 'objects/Crops (sunflower)', fw: 16, fh: 32 },
      { key: 'objects/Chest_small', fw: 16, fh: 16 },
      { key: 'objects/Chest_big', fw: 16, fh: 16 },
      { key: 'extras/Bonfire', fw: 16, fh: 16 },
      { key: 'extras/Fishing bobber', fw: 16, fh: 16 },
      { key: 'tileset/Waterfall tiles (16x16 - 5 frames)', fw: 16, fh: 16 },
      { key: 'tileset/Cave entrance_2', fw: 16, fh: 16 },
      { key: 'npcs/Medieval Townsfolk pack (bonus)/Farmer_idle', fw: 16, fh: 24 },
      { key: 'npcs/Medieval Townsfolk pack (bonus)/Blacksmith_idle', fw: 16, fh: 24 },
      { key: 'npcs/Medieval Townsfolk pack (bonus)/Alchemist_idle', fw: 16, fh: 24 },
      { key: 'npcs/Medieval Townsfolk pack (bonus)/Fisherman_idle', fw: 16, fh: 24 },
      { key: 'animals/Cow_idle (20x16)', fw: 20, fh: 16 },
      { key: 'animals/Deer_Idle (32x32)', fw: 32, fh: 32 },
      { key: 'animals/Hen_idle (16x16)', fw: 16, fh: 16 },
      { key: 'animals/Rabbit_Idle (16x16)', fw: 16, fh: 16 },
      { key: 'projectiles/Bomb_impact', fw: 8, fh: 8 },
      { key: 'sprout/farming_plants', fw: 16, fh: 16 },
      { key: 'sprout/farming_items', fw: 16, fh: 16 },
      { key: 'sprout/house_walls', fw: 16, fh: 16 },
      { key: 'sprout/house_roof', fw: 16, fh: 16 },
      { key: 'sprout/house_door', fw: 16, fh: 16 },
      { key: 'sprout/furniture', fw: 16, fh: 16 },
      { key: 'sprout/fences', fw: 16, fh: 16 },
      { key: 'sprout/fence_gates', fw: 16, fh: 16 },
    ];
    for (const s of sheetLoads) {
      const img = images[s.key];
      if (img) {
        this.load.spritesheet(s.key, img.path, { frameWidth: s.fw, frameHeight: s.fh });
      }
    }

    // 5. Static World Props, Portraits, Projectiles, Particles, Icons
    for (const [key, img] of Object.entries(images)) {
      if (
        key.startsWith('tileset/') ||
        key.startsWith('objects/') ||
        key.startsWith('portraits/') ||
        key.startsWith('boss_portraits/') ||
        key.startsWith('projectiles/') ||
        key.startsWith('monster_projectiles/') ||
        key.startsWith('icons/') ||
        key.startsWith('extras/') ||
        key.startsWith('ui_icons/')
      ) {
        if (!this.textures.exists(key) && !sheetLoads.some((s) => s.key === key)) {
          this.load.image(key, img.path);
        }
      }
    }
  }

  create(): void {
    registerAllAnimations(this);
    this.scene.start('TitleScene');
  }
}
