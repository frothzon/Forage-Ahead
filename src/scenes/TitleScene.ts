import Phaser from 'phaser';
import {
  gameState,
  SAVE_SLOT_COUNT,
  type HeroClassId,
  type SaveSlotIndex,
} from '../core/GameState';
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

// 5x5 pixel bitmap font for 3D voxel title
const GLYPHS: Record<string, string[]> = {
  F: ['11111', '10000', '11110', '10000', '10000'],
  O: ['01110', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '11110', '10100', '10010'],
  A: ['01110', '10001', '11111', '10001', '10001'],
  G: ['01111', '10000', '10111', '10001', '01110'],
  E: ['11111', '10000', '11110', '10000', '11111'],
  H: ['10001', '10001', '11111', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '11110'],
};

interface Shard {
  gfx: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  vr: number;
  bounces: number;
  settled: boolean;
}

export class TitleScene extends Phaser.Scene {
  private selected: HeroClassId = 'Beastmaster';
  private menuContainer?: Phaser.GameObjects.Container;
  private rubbleContainer?: Phaser.GameObjects.Container;
  private shards: Shard[] = [];
  private groundY = 0;
  private copySourceSlot: SaveSlotIndex | null = null;
  private splashSkipped = false;

  constructor() {
    super('TitleScene');
  }

  create(data?: { skipSplash?: boolean }): void {
    const hud = document.getElementById('hud-root');
    if (hud) hud.innerHTML = '';
    SFX.setMusicPaused(false);
    SFX.setMusicSituation('title');

    this.shards = [];
    this.copySourceSlot = null;
    this.splashSkipped = false;

    const { width, height } = this.scale;
    this.groundY = height * 0.87;

    // Backdrop + subtle animated stars/ocean shimmer
    this.add.rectangle(width / 2, height / 2, width, height, 0x0d192a);
    for (let i = 0; i < 40; i++) {
      const rx = Phaser.Math.Between(24, width - 24);
      const ry = Phaser.Math.Between(20, Math.round(height * 0.82));
      const dot = this.add.circle(rx, ry, Phaser.Math.Between(1, 2), 0x4b8ec2, 0.35);
      this.tweens.add({
        targets: dot,
        alpha: { from: 0.12, to: 0.6 },
        duration: Phaser.Math.Between(1100, 2600),
        yoyo: true,
        repeat: -1,
      });
    }

    // Ground horizon strip where shattered title pieces settle
    this.add.rectangle(width / 2, this.groundY + (height - this.groundY) / 2, width, height - this.groundY, 0x101d2d);
    this.add.rectangle(width / 2, this.groundY, width, 2, 0x2f4d6e, 0.7);
    this.rubbleContainer = this.add.container(0, 0).setDepth(5);
    this.menuContainer = this.add.container(0, 0).setDepth(20);

    if (data?.skipSplash) {
      this.showFileSelectMenu();
    } else {
      this.playIntroSplash();
    }
  }

  update(_time: number, dtMs: number): void {
    if (this.shards.length === 0) return;
    const dt = Math.min(0.05, dtMs / 1000);
    const gravity = 640;

    for (const s of this.shards) {
      if (s.settled) continue;
      s.vy += gravity * dt;
      s.gfx.x += s.vx * dt;
      s.gfx.y += s.vy * dt;
      s.gfx.angle += s.vr * dt;

      if (s.gfx.y >= this.groundY) {
        s.gfx.y = this.groundY - Phaser.Math.Between(0, 4);
        if (s.bounces < 2 && Math.abs(s.vy) > 45) {
          s.vy = -Math.abs(s.vy) * Phaser.Math.FloatBetween(0.28, 0.45);
          s.vx *= 0.65;
          s.vr *= 0.55;
          s.bounces += 1;
        } else {
          s.vx = 0;
          s.vy = 0;
          s.vr = 0;
          s.settled = true;
          s.gfx.setAlpha(0.72);
        }
      }
    }
  }

  private playIntroSplash(): void {
    const { width, height } = this.scale;
    const compact = width < 920 || height < 480;
    const cell = compact ? 7 : 10;
    const step = cell + (compact ? 1 : 2);
    const depthOffset = Math.max(3, Math.round(cell * 0.45));

    const titleContainer = this.add.container(width / 2, -120).setDepth(15);
    const blocks: Array<{
      bx: number;
      by: number;
      front: Phaser.GameObjects.Rectangle;
      top: Phaser.GameObjects.Rectangle;
      side: Phaser.GameObjects.Rectangle;
      crack: Phaser.GameObjects.Graphics;
    }> = [];

    const buildWord = (word: string, rowCenterY: number) => {
      const charW = 5 * step;
      const charGap = step * 1.1;
      const totalW = word.length * charW + (word.length - 1) * charGap;
      let cursorX = -totalW / 2 + cell / 2;

      for (const ch of word) {
        const glyph = GLYPHS[ch];
        if (glyph) {
          for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 5; c++) {
              if (glyph[r][c] !== '1') continue;
              const bx = cursorX + c * step;
              const by = rowCenterY + (r - 2) * step;

              const side = this.add
                .rectangle(bx + depthOffset, by + depthOffset, cell, cell, 0x6b4b12)
                .setOrigin(0.5);
              const top = this.add
                .rectangle(bx + depthOffset * 0.5, by + depthOffset * 0.5, cell, cell, 0xa87a1c)
                .setOrigin(0.5);
              const front = this.add
                .rectangle(bx, by, cell, cell, 0xffd54f)
                .setOrigin(0.5);
              const crack = this.add.graphics({ x: bx, y: by });

              titleContainer.add([side, top, front, crack]);
              blocks.push({ bx, by, front, top, side, crack });
            }
          }
        }
        cursorX += charW + charGap;
      }
    };

    const rowGap = compact ? 5.8 * step : 6.4 * step;
    buildWord('FORAGE', -rowGap * 0.5);
    buildWord('AHEAD', rowGap * 0.5);

    const skipHint = this.add
      .text(width / 2, height - 18, 'Tap or press any key to skip', {
        fontSize: '10px',
        color: '#7c99b8',
      })
      .setOrigin(0.5)
      .setAlpha(0.75)
      .setDepth(25);

    const finishToMenu = () => {
      if (this.splashSkipped) return;
      this.splashSkipped = true;
      titleContainer.destroy();
      skipHint.destroy();
      this.showFileSelectMenu();
    };

    const onSkip = () => {
      if (this.splashSkipped) return;
      this.time.removeAllEvents();
      this.tweens.killAll();
      finishToMenu();
    };
    this.input.once('pointerdown', onSkip);
    this.input.keyboard?.once('keydown', onSkip);

    // Stage 1: Slam down into center
    this.tweens.add({
      targets: titleContainer,
      y: height * 0.44,
      duration: 540,
      ease: 'Bounce.Out',
      onComplete: () => {
        if (this.splashSkipped) return;
        this.cameras.main.shake(140, 0.008);
        SFX.playMine();
        const ring = this.add
          .circle(width / 2, height * 0.44, 24, 0xffe066, 0.08)
          .setStrokeStyle(2, 0xffe066, 0.85)
          .setDepth(14);
        this.tweens.add({
          targets: ring,
          scale: { from: 1, to: 6.5 },
          alpha: 0,
          duration: 520,
          ease: 'Quad.Out',
          onComplete: () => ring.destroy(),
        });
      },
    });

    // Stage 2: Age & Crack (stone weathering + glowing fractures)
    this.time.delayedCall(920, () => {
      if (this.splashSkipped) return;
      SFX.playStoneCrack();
      for (const b of blocks) {
        b.front.setFillStyle(0x9a9184);
        b.top.setFillStyle(0x6c655c);
        b.side.setFillStyle(0x413c37);
        if (Math.random() < 0.72) {
          b.crack.lineStyle(1.3, Math.random() < 0.35 ? 0xffb347 : 0x26211e, 0.95);
          b.crack.beginPath();
          b.crack.moveTo(-cell * 0.45, Phaser.Math.FloatBetween(-cell * 0.4, cell * 0.4));
          b.crack.lineTo(0, Phaser.Math.FloatBetween(-cell * 0.25, cell * 0.25));
          b.crack.lineTo(cell * 0.45, Phaser.Math.FloatBetween(-cell * 0.4, cell * 0.4));
          b.crack.strokePath();
        }
      }
      this.cameras.main.shake(220, 0.005);
    });

    this.time.delayedCall(1450, () => {
      if (this.splashSkipped) return;
      SFX.playStoneCrack();
      for (const b of blocks) {
        b.front.setFillStyle(0x6e6963);
        b.crack.lineStyle(1.2, 0x7ce8ff, 0.85);
        b.crack.beginPath();
        b.crack.moveTo(Phaser.Math.FloatBetween(-cell * 0.35, cell * 0.35), -cell * 0.45);
        b.crack.lineTo(Phaser.Math.FloatBetween(-cell * 0.2, cell * 0.2), cell * 0.45);
        b.crack.strokePath();
      }
      this.tweens.add({
        targets: titleContainer,
        x: { from: width / 2 - 2, to: width / 2 + 2 },
        duration: 45,
        yoyo: true,
        repeat: 5,
      });
    });

    // Stage 3: Shatter into a million pieces on the ground
    this.time.delayedCall(1900, () => {
      if (this.splashSkipped) return;
      SFX.playShatter();
      this.cameras.main.shake(280, 0.014);

      const baseX = titleContainer.x;
      const baseY = titleContainer.y;
      const palette = [0x8c857c, 0x6b655e, 0xb89748, 0x4d4843, 0xa89f94];

      for (const b of blocks) {
        const wx = baseX + b.bx;
        const wy = baseY + b.by;
        const shardCount = 2;
        for (let i = 0; i < shardCount; i++) {
          const sz = Phaser.Math.Between(Math.max(2, Math.floor(cell * 0.32)), Math.max(4, Math.floor(cell * 0.65)));
          const rect = this.add
            .rectangle(
              wx + Phaser.Math.Between(-3, 3),
              wy + Phaser.Math.Between(-3, 3),
              sz,
              sz,
              Phaser.Utils.Array.GetRandom(palette),
            )
            .setDepth(6);
          this.rubbleContainer?.add(rect);

          const dx = wx - width / 2;
          this.shards.push({
            gfx: rect,
            vx: dx * Phaser.Math.FloatBetween(0.6, 1.35) + Phaser.Math.Between(-95, 95),
            vy: Phaser.Math.Between(-210, 40),
            vr: Phaser.Math.Between(-360, 360),
            bounces: 0,
            settled: false,
          });
        }
      }

      titleContainer.destroy();

      // Stage 4: Arcane shockwave transition into the Game Selection Menu
      const wave = this.add
        .circle(width / 2, height * 0.44, 18, 0x7ce8ff, 0.16)
        .setStrokeStyle(3, 0xffe066, 0.9)
        .setDepth(18);
      this.tweens.add({
        targets: wave,
        scale: { from: 1, to: 16 },
        alpha: 0,
        duration: 720,
        ease: 'Cubic.Out',
        onComplete: () => wave.destroy(),
      });
    });

    this.time.delayedCall(2850, () => {
      if (this.splashSkipped) return;
      this.input.off('pointerdown', onSkip);
      this.input.keyboard?.off('keydown', onSkip);
      this.splashSkipped = true;
      skipHint.destroy();
      this.showFileSelectMenu();
    });
  }

  private showFileSelectMenu(): void {
    if (!this.menuContainer) return;
    this.menuContainer.removeAll(true);
    this.menuContainer.setAlpha(0).setY(18);

    const { width, height } = this.scale;
    const compact = width < 920 || height < 500;

    // Header banner
    const title = this.add
      .text(width / 2, compact ? 22 : 42, 'FORAGE AHEAD', {
        fontSize: compact ? '20px' : '30px',
        fontStyle: 'bold',
        color: '#ffe596',
        stroke: '#09121d',
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    const subtitle = this.add
      .text(
        width / 2,
        compact ? 42 : 72,
        this.copySourceSlot !== null
          ? `SELECT AN EMPTY FILE TO COPY FILE ${this.copySourceSlot + 1} INTO`
          : 'SELECT AN ADVENTURE FILE',
        {
          fontSize: compact ? '10px' : '12px',
          fontStyle: 'bold',
          color: this.copySourceSlot !== null ? '#7ce8ff' : '#9fc2e6',
        },
      )
      .setOrigin(0.5);

    this.menuContainer.add([title, subtitle]);

    const slotW = Math.min(640, width - 32);
    const slotH = compact ? Math.min(72, Math.floor((height - 108) / 3)) : 96;
    const slotGap = compact ? 8 : 12;
    const totalH = SAVE_SLOT_COUNT * slotH + (SAVE_SLOT_COUNT - 1) * slotGap;
    const startY = (compact ? 56 : 96) + (height - (compact ? 86 : 140) - totalH) / 2 + slotH / 2;

    for (let i = 0; i < SAVE_SLOT_COUNT; i++) {
      const slot = i as SaveSlotIndex;
      const cy = startY + i * (slotH + slotGap);
      const summary = gameState.peekSaveSummary(slot);
      const isCopySource = this.copySourceSlot === slot;
      const isPasteTarget = this.copySourceSlot !== null && !summary;

      const cardBg = this.add
        .rectangle(width / 2, cy, slotW, slotH, summary ? 0x16263a : 0x111d2c, 0.94)
        .setStrokeStyle(
          2,
          isCopySource ? 0x7ce8ff : isPasteTarget ? 0x8ef5a7 : summary ? 0x4b6e94 : 0x2c425c,
        )
        .setInteractive({ useHandCursor: true });

      const slotTag = this.add
        .text(width / 2 - slotW / 2 + 12, cy - slotH / 2 + 8, `FILE ${slot + 1}`, {
          fontSize: compact ? '9px' : '11px',
          fontStyle: 'bold',
          color: summary ? '#ffe066' : '#6c87a6',
        })
        .setOrigin(0, 0);

      this.menuContainer.add([cardBg, slotTag]);

      if (summary) {
        const clsMeta = CLASSES.find((c) => c.id === summary.heroClass) ?? CLASSES[0];
        const sprX = width / 2 - slotW / 2 + (compact ? 42 : 54);
        const spr = this.add
          .sprite(sprX, cy + 6, `heroes/${summary.heroClass}/${summary.heroClass}_idle`, 0)
          .setScale(compact ? 1.35 : 1.75);
        const animKey = `hero_${summary.heroClass}_idle_down`;
        if (this.anims.exists(animKey)) spr.play(animKey);

        const infoX = sprX + (compact ? 34 : 44);
        const heroTitle = this.add
          .text(infoX, cy - (compact ? 14 : 20), `Lv.${summary.level} ${clsMeta.title}`, {
            fontSize: compact ? '12px' : '15px',
            fontStyle: 'bold',
            color: '#ffffff',
          })
          .setOrigin(0, 0.5);

        const statsLine = this.add
          .text(
            infoX,
            cy + (compact ? 6 : 8),
            `♥ ${summary.hp}/${summary.maxHp}   •   ${summary.coins}g   •   Islands ${summary.islands}/25   •   Dungeons ${summary.dungeonsCleared}/4${summary.voidSpireFloor > 0 ? `   •   Void Fl.${summary.voidSpireFloor}` : ''}`,
            {
              fontSize: compact ? '9px' : '11px',
              color: '#a8cbe8',
            },
          )
          .setOrigin(0, 0.5);

        this.menuContainer.add([spr, heroTitle, statsLine]);

        // Action buttons on right side of card
        const rightX = width / 2 + slotW / 2 - 12;
        const btnH = compact ? 24 : 30;
        const btnW = compact ? 64 : 84;

        const playBtn = this.add
          .rectangle(rightX - btnW / 2 - (compact ? 104 : 132), cy, btnW + 10, btnH, 0x327a4a)
          .setStrokeStyle(1.5, 0x8ef5a7)
          .setInteractive({ useHandCursor: true });
        const playTxt = this.add
          .text(playBtn.x, cy, 'PLAY', { fontSize: compact ? '10px' : '12px', fontStyle: 'bold', color: '#ffffff' })
          .setOrigin(0.5);

        const copyBtn = this.add
          .rectangle(rightX - btnW / 2 - (compact ? 48 : 62), cy, compact ? 46 : 56, btnH, 0x243b57)
          .setStrokeStyle(1.5, isCopySource ? 0x7ce8ff : 0x58789c)
          .setInteractive({ useHandCursor: true });
        const copyTxt = this.add
          .text(copyBtn.x, cy, isCopySource ? 'CANCEL' : 'COPY', {
            fontSize: compact ? '9px' : '10px',
            fontStyle: 'bold',
            color: '#d6e9ff',
          })
          .setOrigin(0.5);

        let eraseConfirm = false;
        const eraseBtn = this.add
          .rectangle(rightX - (compact ? 22 : 26), cy, compact ? 44 : 52, btnH, 0x5c232b)
          .setStrokeStyle(1.5, 0xff7d8a)
          .setInteractive({ useHandCursor: true });
        const eraseTxt = this.add
          .text(eraseBtn.x, cy, 'ERASE', {
            fontSize: compact ? '9px' : '10px',
            fontStyle: 'bold',
            color: '#ffb4bc',
          })
          .setOrigin(0.5);

        const launchSlot = () => {
          SFX.playUiClick();
          if (gameState.load(slot)) {
            this.scene.start('OverworldScene');
          }
        };
        cardBg.on('pointerdown', launchSlot);
        playBtn.on('pointerdown', launchSlot);

        copyBtn.on('pointerdown', () => {
          SFX.playUiClick();
          this.copySourceSlot = isCopySource ? null : slot;
          this.showFileSelectMenu();
        });

        eraseBtn.on('pointerdown', () => {
          SFX.playUiClick();
          if (!eraseConfirm) {
            eraseConfirm = true;
            eraseBtn.setFillStyle(0x9e2a37);
            eraseTxt.setText('SURE?');
            this.time.delayedCall(2800, () => {
              if (!eraseBtn.active) return;
              eraseConfirm = false;
              eraseBtn.setFillStyle(0x5c232b);
              eraseTxt.setText('ERASE');
            });
            return;
          }
          gameState.deleteSlot(slot);
          if (this.copySourceSlot === slot) this.copySourceSlot = null;
          this.showFileSelectMenu();
        });

        this.menuContainer.add([playBtn, playTxt, copyBtn, copyTxt, eraseBtn, eraseTxt]);
      } else {
        const emptyLabel = this.add
          .text(
            width / 2,
            cy,
            isPasteTarget ? `TAP TO PASTE FILE ${this.copySourceSlot! + 1} HERE` : '+ NEW ADVENTURE',
            {
              fontSize: compact ? '12px' : '14px',
              fontStyle: 'bold',
              color: isPasteTarget ? '#8ef5a7' : '#8fb3d9',
            },
          )
          .setOrigin(0.5);

        cardBg.on('pointerdown', () => {
          SFX.playUiClick();
          if (this.copySourceSlot !== null) {
            gameState.copySlot(this.copySourceSlot, slot);
            this.copySourceSlot = null;
            this.showFileSelectMenu();
            return;
          }
          this.showClassSelectMenu(slot);
        });

        this.menuContainer.add(emptyLabel);
      }
    }

    this.tweens.add({
      targets: this.menuContainer,
      alpha: 1,
      y: 0,
      duration: 380,
      ease: 'Cubic.Out',
    });
  }

  private showClassSelectMenu(targetSlot: SaveSlotIndex): void {
    if (!this.menuContainer) return;
    this.menuContainer.removeAll(true);
    this.menuContainer.setAlpha(0).setY(14);

    const { width, height } = this.scale;
    const compact = width < 920 || height < 480;

    const header = this.add
      .text(width / 2, compact ? 22 : 44, `CHOOSE YOUR HERO — FILE ${targetSlot + 1}`, {
        fontSize: compact ? '16px' : '24px',
        fontStyle: 'bold',
        color: '#ffe596',
        stroke: '#09121d',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    const sub = this.add
      .text(width / 2, compact ? 42 : 74, 'Select a starting class to begin your adventure', {
        fontSize: compact ? '10px' : '12px',
        color: '#9fc2e6',
      })
      .setOrigin(0.5);

    this.menuContainer.add([header, sub]);

    const gap = compact ? 10 : 18;
    const cardW = compact ? Math.min(180, Math.floor((width - 40 - gap * 3) / 4)) : 190;
    const cardH = compact ? Math.min(176, Math.floor(height * 0.48)) : 210;
    const totalW = CLASSES.length * cardW + (CLASSES.length - 1) * gap;
    const startX = width / 2 - totalW / 2 + cardW / 2;
    const cardY = compact ? height * 0.48 : height / 2 - 10;

    const cards: Array<{ id: HeroClassId; bg: Phaser.GameObjects.Rectangle }> = [];
    const refreshCards = () => {
      for (const c of cards) {
        c.bg.setStrokeStyle(3, c.id === this.selected ? 0xffe066 : 0x38506e);
      }
    };

    CLASSES.forEach((cls, idx) => {
      const cx = startX + idx * (cardW + gap);
      const bg = this.add
        .rectangle(cx, cardY, cardW, cardH, 0x192a3f, 0.95)
        .setStrokeStyle(3, cls.id === this.selected ? 0xffe066 : 0x38506e)
        .setInteractive({ useHandCursor: true });

      const children: Phaser.GameObjects.GameObject[] = [bg];
      if (this.textures.exists(cls.portraitKey)) {
        children.push(this.add.image(cx, cardY - cardH * 0.29, cls.portraitKey).setScale(compact ? 1.5 : 2));
      }
      const heroSpr = this.add
        .sprite(cx, cardY + (compact ? 0 : 2), `heroes/${cls.id}/${cls.id}_idle`, 0)
        .setScale(compact ? 1.85 : 2.4);
      const animKey = `hero_${cls.id}_idle_down`;
      if (this.anims.exists(animKey)) heroSpr.play(animKey);
      children.push(heroSpr);

      children.push(
        this.add
          .text(cx, cardY + cardH * 0.21, cls.title, {
            fontSize: compact ? '13px' : '16px',
            fontStyle: 'bold',
            color: '#ffffff',
          })
          .setOrigin(0.5),
      );
      children.push(
        this.add
          .text(cx, cardY + cardH * 0.36, cls.perk, {
            fontSize: compact ? '9px' : '11px',
            color: '#b7d4ea',
            align: 'center',
            wordWrap: { width: cardW - 14 },
          })
          .setOrigin(0.5),
      );

      bg.on('pointerdown', () => {
        SFX.playHotbarSelect();
        this.selected = cls.id;
        refreshCards();
      });

      cards.push({ id: cls.id, bg });
      this.menuContainer?.add(children);
    });

    const btnY = compact ? cardY + cardH / 2 + 26 : cardY + 146;
    const btnH = compact ? 34 : 42;

    const backBtn = this.add
      .rectangle(width / 2 - (compact ? 96 : 114), btnY, compact ? 156 : 176, btnH, 0x22344d)
      .setStrokeStyle(2, 0x58789c)
      .setInteractive({ useHandCursor: true });
    const backTxt = this.add
      .text(backBtn.x, btnY, '← BACK TO FILES', {
        fontSize: compact ? '11px' : '13px',
        fontStyle: 'bold',
        color: '#d6e9ff',
      })
      .setOrigin(0.5);

    const startBtn = this.add
      .rectangle(width / 2 + (compact ? 96 : 114), btnY, compact ? 176 : 196, btnH, 0x3b8c52)
      .setStrokeStyle(2, 0x8ef5a7)
      .setInteractive({ useHandCursor: true });
    const startTxt = this.add
      .text(startBtn.x, btnY, 'START ADVENTURE', {
        fontSize: compact ? '11px' : '13px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    backBtn.on('pointerdown', () => {
      SFX.playUiClick();
      this.showFileSelectMenu();
    });
    startBtn.on('pointerdown', () => {
      SFX.playUiClick();
      gameState.setActiveSlot(targetSlot);
      gameState.reset(this.selected);
      gameState.save(targetSlot);
      this.scene.start('OverworldScene');
    });

    this.menuContainer.add([backBtn, backTxt, startBtn, startTxt]);

    this.tweens.add({
      targets: this.menuContainer,
      alpha: 1,
      y: 0,
      duration: 280,
      ease: 'Cubic.Out',
    });
  }
}
