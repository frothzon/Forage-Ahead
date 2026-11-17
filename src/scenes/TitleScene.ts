import Phaser from 'phaser';
import { gameState, type HeroClassId } from '../core/GameState';
import { SFX } from '../core/SoundFX';

interface ClassMeta {
  id: HeroClassId;
  title: string;
  perk: string;
  color: number;
  portraitKey: string;
}

const CLASSES: ClassMeta[] = [
  {
    id: 'Beastmaster',
    title: 'Beastmaster',
    perk: '+15% Harvest Power & Loyal Fox',
    color: 0x55b86f,
    portraitKey: 'portraits/Beastmaster/Beastmaster_frame',
  },
  {
    id: 'Gladiator',
    title: 'Gladiator',
    perk: '+20 Max HP & +15% Sword Damage',
    color: 0xd95f52,
    portraitKey: 'portraits/Gladiator/Gladiator_frame',
  },
  {
    id: 'Sorcerer',
    title: 'Sorcerer',
    perk: '+20% Relic Rod Magic Damage',
    color: 0x9b66e8,
    portraitKey: 'portraits/Sorcerer/Sorcerer_frame',
  },
  {
    id: 'Swashbuckler',
    title: 'Swashbuckler',
    perk: '+10% Speed, +7% Crit & +15% Bow',
    color: 0x4ca8e0,
    portraitKey: 'portraits/Swashbuckler/Swashbuckler_frame',
  },
];

export class TitleScene extends Phaser.Scene {
  private selected: HeroClassId = 'Beastmaster';
  private cards: Array<{ id: HeroClassId; bg: Phaser.GameObjects.Rectangle }> = [];

  constructor() {
    super('TitleScene');
  }

  create(): void {
    const hud = document.getElementById('hud-root');
    if (hud) hud.innerHTML = '';
    SFX.setMusicPaused(false);
    SFX.setMusicSituation('title');

    const { width, height } = this.scale;
    const compact = width < 920 || height < 480;
    this.add.rectangle(width / 2, height / 2, width, height, 0x0f1c2e);

    // Decorative ocean grid shimmer
    for (let i = 0; i < 36; i++) {
      const rx = Phaser.Math.Between(30, width - 30);
      const ry = Phaser.Math.Between(30, height - 30);
      const dot = this.add.circle(rx, ry, Phaser.Math.Between(1, 2), 0x3b78a8, 0.35);
      this.tweens.add({
        targets: dot,
        alpha: { from: 0.15, to: 0.55 },
        duration: Phaser.Math.Between(1200, 2600),
        yoyo: true,
        repeat: -1,
      });
    }

    this.add
      .text(width / 2, compact ? 24 : 54, 'FORAGE AHEAD', {
        fontSize: compact ? '22px' : '34px',
        fontStyle: 'bold',
        color: '#ffe596',
        stroke: '#101824',
        strokeThickness: compact ? 4 : 6,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, compact ? 46 : 92, 'Gather • Craft • Automate • Expand Across 5 Biomes & 4 Boss Dungeons', {
        fontSize: compact ? '10px' : '13px',
        color: '#b6cce0',
      })
      .setOrigin(0.5);

    const gap = compact ? 10 : 18;
    const cardW = compact ? Math.min(180, Math.floor((width - 40 - gap * 3) / 4)) : 190;
    const cardH = compact ? Math.min(176, Math.floor(height * 0.48)) : 210;
    const totalW = CLASSES.length * cardW + (CLASSES.length - 1) * gap;
    const startX = width / 2 - totalW / 2 + cardW / 2;
    const cardY = compact ? height * 0.48 : height / 2 - 12;

    this.cards = [];
    CLASSES.forEach((cls, idx) => {
      const cx = startX + idx * (cardW + gap);
      const bg = this.add
        .rectangle(cx, cardY, cardW, cardH, 0x192a3f, 0.95)
        .setStrokeStyle(3, cls.id === this.selected ? 0xffe066 : 0x38506e)
        .setInteractive({ useHandCursor: true });

      if (this.textures.exists(cls.portraitKey)) {
        this.add.image(cx, cardY - cardH * 0.29, cls.portraitKey).setScale(compact ? 1.5 : 2);
      }
      const heroSpr = this.add
        .sprite(cx, cardY + (compact ? 0 : 2), `heroes/${cls.id}/${cls.id}_idle`, 0)
        .setScale(compact ? 1.85 : 2.4);
      const animKey = `hero_${cls.id}_idle_down`;
      if (this.anims.exists(animKey)) heroSpr.play(animKey);

      this.add
        .text(cx, cardY + cardH * 0.21, cls.title, {
          fontSize: compact ? '13px' : '16px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5);

      this.add
        .text(cx, cardY + cardH * 0.36, cls.perk, {
          fontSize: compact ? '9px' : '11px',
          color: '#b7d4ea',
          align: 'center',
          wordWrap: { width: cardW - 14 },
        })
        .setOrigin(0.5);

      bg.on('pointerdown', () => {
        this.selected = cls.id;
        this.refreshSelection();
      });

      this.cards.push({ id: cls.id, bg });
    });

    const btnY = compact ? cardY + cardH / 2 + 26 : cardY + 148;
    const btnH = compact ? 34 : 42;
    const btnW = compact ? 160 : 185;
    const startBtn = this.add
      .rectangle(width / 2 - (gameState.hasSavedGame() ? (compact ? 90 : 105) : 0), btnY, btnW, btnH, 0x3b8c52)
      .setStrokeStyle(2, 0x8ef5a7)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(startBtn.x, btnY, 'NEW ADVENTURE', {
        fontSize: compact ? '12px' : '14px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    startBtn.on('pointerdown', () => {
      gameState.reset(this.selected);
      this.scene.start('OverworldScene');
    });

    if (gameState.hasSavedGame()) {
      const contBtn = this.add
        .rectangle(width / 2 + (compact ? 90 : 105), btnY, btnW, btnH, 0x2f5f8f)
        .setStrokeStyle(2, 0x8cc8ff)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(contBtn.x, btnY, 'CONTINUE SAVE', {
          fontSize: compact ? '12px' : '14px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5);

      contBtn.on('pointerdown', () => {
        if (gameState.load()) {
          this.scene.start('OverworldScene');
        }
      });
    }

    this.add
      .text(
        width / 2,
        height - 26,
        'Controls: WASD Move • Mouse Aim & Click Use/Attack • Space Dash • 1-9 Hotbar • E Interact • Tab Craft • K Skills • M Islands',
        { fontSize: '11px', color: '#8ba4bd' },
      )
      .setOrigin(0.5);
  }

  private refreshSelection(): void {
    for (const c of this.cards) {
      c.bg.setStrokeStyle(3, c.id === this.selected ? 0xffe066 : 0x38506e);
    }
  }
}
