import Phaser from 'phaser';
import { gameState, type HeroClassId } from '../core/GameState';

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

    const { width, height } = this.scale;
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
      .text(width / 2, 54, 'FORAGE AHEAD', {
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#ffe596',
        stroke: '#101824',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 92, 'Gather • Craft • Automate • Expand Across 5 Biomes & 4 Boss Dungeons', {
        fontSize: '13px',
        color: '#b6cce0',
      })
      .setOrigin(0.5);

    const cardW = 190;
    const gap = 18;
    const totalW = CLASSES.length * cardW + (CLASSES.length - 1) * gap;
    const startX = width / 2 - totalW / 2 + cardW / 2;
    const cardY = height / 2 - 12;

    this.cards = [];
    CLASSES.forEach((cls, idx) => {
      const cx = startX + idx * (cardW + gap);
      const bg = this.add
        .rectangle(cx, cardY, cardW, 210, 0x192a3f, 0.95)
        .setStrokeStyle(3, cls.id === this.selected ? 0xffe066 : 0x38506e)
        .setInteractive({ useHandCursor: true });

      if (this.textures.exists(cls.portraitKey)) {
        this.add.image(cx, cardY - 62, cls.portraitKey).setScale(2);
      }
      const heroSpr = this.add
        .sprite(cx, cardY + 2, `heroes/${cls.id}/${cls.id}_idle`, 0)
        .setScale(2.4);
      const animKey = `hero_${cls.id}_idle_down`;
      if (this.anims.exists(animKey)) heroSpr.play(animKey);

      this.add
        .text(cx, cardY + 46, cls.title, {
          fontSize: '16px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5);

      this.add
        .text(cx, cardY + 74, cls.perk, {
          fontSize: '11px',
          color: '#b7d4ea',
          align: 'center',
          wordWrap: { width: cardW - 22 },
        })
        .setOrigin(0.5);

      bg.on('pointerdown', () => {
        this.selected = cls.id;
        this.refreshSelection();
      });

      this.cards.push({ id: cls.id, bg });
    });

    const btnY = cardY + 148;
    const startBtn = this.add
      .rectangle(width / 2 - (gameState.hasSavedGame() ? 105 : 0), btnY, 185, 42, 0x3b8c52)
      .setStrokeStyle(2, 0x8ef5a7)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(startBtn.x, btnY, 'NEW ADVENTURE', {
        fontSize: '14px',
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
        .rectangle(width / 2 + 105, btnY, 185, 42, 0x2f5f8f)
        .setStrokeStyle(2, 0x8cc8ff)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(contBtn.x, btnY, 'CONTINUE SAVE', {
          fontSize: '14px',
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
