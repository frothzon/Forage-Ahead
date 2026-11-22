import Phaser from 'phaser';
import {
  gameState,
  SAVE_SLOT_COUNT,
  type HeroClassId,
  type SaveSlotIndex,
} from '../core/GameState';
import { SFX } from '../core/SoundFX';
import { startSceneAndWaitCreate, transitionManager } from '../core/TransitionManager';
import { dialogueBox } from '../ui/DialogueBox';
import { revealSequence } from '../ui/RevealSequence';
import { addSproutNineSlice, createSproutButton } from '../ui/PhaserNineSlice';
import { getFamiliarSpecForClass } from '../data/familiars';

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

  create(data?: { skipSplash?: boolean; promoOutro?: boolean }): void {
    dialogueBox.close(false);
    revealSequence.forceClose();
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
    const bgRect = this.add.rectangle(width / 2, height / 2, width, height, 0x0d192a);
    for (let i = 0; i < 40; i++) {
      const rx = Phaser.Math.Between(24, Math.max(48, width - 24));
      const ry = Phaser.Math.Between(20, Math.max(40, Math.round(height * 0.82)));
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
    const horizonRect = this.add.rectangle(width / 2, this.groundY + (height - this.groundY) / 2, width, height - this.groundY, 0x101d2d);
    const horizonLine = this.add.rectangle(width / 2, this.groundY, width, 2, 0x2f4d6e, 0.7);
    this.rubbleContainer = this.add.container(0, 0).setDepth(5);
    this.menuContainer = this.add.container(0, 0).setDepth(20);

    const onResize = (gameSize: Phaser.Structs.Size) => {
      const w = gameSize.width;
      const h = gameSize.height;
      this.cameras.main.setSize(w, h);
      this.groundY = h * 0.87;
      bgRect.setPosition(w / 2, h / 2).setSize(w, h);
      horizonRect.setPosition(w / 2, this.groundY + (h - this.groundY) / 2).setSize(w, h - this.groundY);
      horizonLine.setPosition(w / 2, this.groundY).setSize(w, 2);
      if (this.splashSkipped) {
        this.showFileSelectMenu();
      }
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
    });

    if (data?.promoOutro) {
      this.splashSkipped = true;
      const heroes = ['Gladiator', 'Beastmaster', 'Sorcerer', 'Swashbuckler'];
      const spacing = Math.min(130, width / 7);
      const startX = width / 2 - ((heroes.length - 1) * spacing) / 2;
      const heroY = this.groundY - 12;
      this.add
        .text(width / 2, height * 0.24, 'FORAGE AHEAD', {
          fontFamily: 'SproutLandsDisplay, monospace, sans-serif',
          fontSize: '58px',
          fontStyle: 'bold',
          color: '#ffe596',
          stroke: '#3b2316',
          strokeThickness: 10,
          resolution: 2,
        })
        .setOrigin(0.5)
        .setDepth(30);
      this.add
        .text(width / 2, height * 0.35, 'FORAGE • CRAFT • CONQUER 25 ISLANDS', {
          fontFamily: 'SproutLandsDisplay, monospace, sans-serif',
          fontSize: '20px',
          color: '#9ee6ff',
          stroke: '#0d192a',
          strokeThickness: 5,
          resolution: 2,
        })
        .setOrigin(0.5)
        .setDepth(30);
      heroes.forEach((cls, i) => {
        const spr = this.add.sprite(startX + i * spacing, heroY, `hero_${cls.toLowerCase()}_idle_down`).setScale(3.5).setDepth(25);
        const animKey = `${cls.toLowerCase()}_attack_down`;
        if (this.anims.exists(animKey)) spr.play(animKey);
        this.add
          .text(startX + i * spacing, heroY + 46, cls.toUpperCase(), {
            fontFamily: 'SproutLandsDisplay, monospace, sans-serif',
            fontSize: '12px',
            color: '#f6eedc',
            stroke: '#1b110b',
            strokeThickness: 4,
          })
          .setOrigin(0.5)
          .setDepth(26);
      });
      if (typeof window !== 'undefined') {
        (window as unknown as { __PROMO_READY?: boolean }).__PROMO_READY = true;
      }
      return;
    }

    if (data?.skipSplash) {
      this.splashSkipped = true;
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
        fontFamily: 'SproutLandsDisplay, monospace, sans-serif',
        fontSize: compact ? '20px' : '30px',
        fontStyle: 'bold',
        color: '#ffe596',
        stroke: '#3b2316',
        strokeThickness: 6,
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
          fontFamily: 'SproutLandsUI, monospace, sans-serif',
          fontSize: compact ? '10px' : '12px',
          fontStyle: 'bold',
          color: this.copySourceSlot !== null ? '#7ce8ff' : '#fff6e5',
        },
      )
      .setOrigin(0.5);

    this.menuContainer.add([title, subtitle]);

    const slotW = Math.min(660, width - 32);
    const slotH = compact ? Math.min(76, Math.floor((height - 108) / 3)) : 100;
    const slotGap = compact ? 8 : 12;
    const totalH = SAVE_SLOT_COUNT * slotH + (SAVE_SLOT_COUNT - 1) * slotGap;
    const startY = (compact ? 56 : 96) + (height - (compact ? 86 : 140) - totalH) / 2 + slotH / 2;

    for (let i = 0; i < SAVE_SLOT_COUNT; i++) {
      const slot = i as SaveSlotIndex;
      const cy = startY + i * (slotH + slotGap);
      const summary = gameState.peekSaveSummary(slot);
      const isCopySource = this.copySourceSlot === slot;
      const isPasteTarget = this.copySourceSlot !== null && !summary;

      const cardBg = addSproutNineSlice(
        this,
        width / 2,
        cy,
        slotW,
        slotH,
        summary ? 'panel_wood' : 'dock_dark',
        2,
      ).setInteractive({ useHandCursor: true });
      if (isCopySource) cardBg.setTint(0xc8f4ff);
      else if (isPasteTarget) cardBg.setTint(0xd4ffdc);

      const slotTag = this.add
        .text(width / 2 - slotW / 2 + 14, cy - slotH / 2 + 10, `FILE ${slot + 1}`, {
          fontFamily: 'SproutLandsCompact, SproutLandsUI, monospace',
          fontSize: compact ? '9px' : '11px',
          fontStyle: 'bold',
          color: summary ? '#7a4b1e' : '#f2d9b1',
        })
        .setOrigin(0, 0);

      this.menuContainer.add([cardBg, slotTag]);

      if (summary) {
        const clsMeta = CLASSES.find((c) => c.id === summary.heroClass) ?? CLASSES[0];
        const sprX = width / 2 - slotW / 2 + (compact ? 44 : 56);
        const portFrame = addSproutNineSlice(
          this,
          sprX,
          cy + 4,
          compact ? 44 : 54,
          compact ? 44 : 54,
          'frame_wood_a1',
          2,
        );
        const spr = this.add
          .sprite(sprX, cy + 4, `heroes/${summary.heroClass}/${summary.heroClass}_idle`, 0)
          .setScale(compact ? 1.25 : 1.55);
        const animKey = `hero_${summary.heroClass}_idle_down`;
        if (this.anims.exists(animKey)) spr.play(animKey);

        const infoX = sprX + (compact ? 34 : 44);
        const heroTitle = this.add
          .text(infoX, cy - (compact ? 14 : 18), `Lv.${summary.level} ${clsMeta.title}`, {
            fontFamily: 'SproutLandsDisplay, SproutLandsUI, monospace',
            fontSize: compact ? '12px' : '15px',
            fontStyle: 'bold',
            color: '#3b2316',
          })
          .setOrigin(0, 0.5);

        const statsLine = this.add
          .text(
            infoX,
            cy + (compact ? 7 : 9),
            `♥ ${summary.hp}/${summary.maxHp}  •  ${summary.coins}g  •  Islands ${summary.islands}/25  •  Dungeons ${summary.dungeonsCleared}/4${summary.voidSpireFloor > 0 ? `  •  Void Fl.${summary.voidSpireFloor}` : ''}`,
            {
              fontFamily: 'SproutLandsUI, monospace, sans-serif',
              fontSize: compact ? '9px' : '11px',
              color: '#5c3a24',
            },
          )
          .setOrigin(0, 0.5);

        this.menuContainer.add([portFrame, spr, heroTitle, statsLine]);

        // Action buttons on right side of card
        const rightX = width / 2 + slotW / 2 - 14;
        const btnH = compact ? 28 : 34;

        const launchSlot = () => {
          if (transitionManager.isActive) return;
          SFX.playUiClick();
          if (gameState.load(slot)) {
            SFX.playPortalWarp();
            void transitionManager.transitionTo({
              onMidpoint: async () => {
                SFX.setMusicSituation('overworld');
                await startSceneAndWaitCreate(
                this,
                gameState.tutorialCompleted ? 'OverworldScene' : 'TutorialDungeonScene',
              );
              },
            });
          }
        };

        const playBtn = this.add
          .image(
            rightX - (compact ? 128 : 162),
            cy,
            'sprout_ui/buttons/btn_wide_play_normal',
          )
          .setScale(compact ? 0.95 : 1.15)
          .setInteractive({ useHandCursor: true });
        playBtn.on('pointerdown', () => {
          playBtn.setTexture('sprout_ui/buttons/btn_wide_play_pressed');
          launchSlot();
        });
        playBtn.on('pointerout', () => playBtn.setTexture('sprout_ui/buttons/btn_wide_play_normal'));

        const copyBtn = createSproutButton(this, {
          x: rightX - (compact ? 64 : 80),
          y: cy,
          width: compact ? 52 : 62,
          height: btnH,
          label: isCopySource ? 'CANCEL' : 'COPY',
          variant: 'tan',
          fontSize: compact ? '9px' : '10px',
          onClick: () => {
            SFX.playUiClick();
            this.copySourceSlot = isCopySource ? null : slot;
            this.showFileSelectMenu();
          },
        });

        let eraseConfirm = false;
        const eraseBtn = createSproutButton(this, {
          x: rightX - (compact ? 24 : 28),
          y: cy,
          width: compact ? 48 : 56,
          height: btnH,
          label: 'ERASE',
          variant: 'dark',
          textColor: '#ffb4bc',
          fontSize: compact ? '9px' : '10px',
          onClick: () => {
            SFX.playUiClick();
            if (!eraseConfirm) {
              eraseConfirm = true;
              eraseBtn.bg.setTint(0xff9aa2);
              eraseBtn.setLabel('SURE?');
              this.time.delayedCall(2800, () => {
                if (!eraseBtn.bg.active) return;
                eraseConfirm = false;
                eraseBtn.bg.clearTint();
                eraseBtn.setLabel('ERASE');
              });
              return;
            }
            gameState.deleteSlot(slot);
            if (this.copySourceSlot === slot) this.copySourceSlot = null;
            this.showFileSelectMenu();
          },
        });

        cardBg.on('pointerdown', launchSlot);

        this.menuContainer.add([playBtn, copyBtn.container, eraseBtn.container]);
      } else {
        const emptyLabel = this.add
          .text(
            width / 2,
            cy,
            isPasteTarget ? `TAP TO PASTE FILE ${this.copySourceSlot! + 1} HERE` : '+ NEW ADVENTURE',
            {
              fontFamily: 'SproutLandsDisplay, SproutLandsUI, monospace',
              fontSize: compact ? '12px' : '14px',
              fontStyle: 'bold',
              color: isPasteTarget ? '#8ef5a7' : '#fff6e5',
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
        fontFamily: 'SproutLandsDisplay, monospace, sans-serif',
        fontSize: compact ? '16px' : '24px',
        fontStyle: 'bold',
        color: '#ffe596',
        stroke: '#3b2316',
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    const sub = this.add
      .text(width / 2, compact ? 42 : 74, 'Select a starting class to begin your adventure', {
        fontFamily: 'SproutLandsUI, monospace, sans-serif',
        fontSize: compact ? '10px' : '12px',
        color: '#fff6e5',
      })
      .setOrigin(0.5);

    this.menuContainer.add([header, sub]);

    const gap = compact ? 10 : 18;
    const cardW = compact ? Math.min(180, Math.floor((width - 40 - gap * 3) / 4)) : 190;
    const cardH = compact ? Math.min(176, Math.floor(height * 0.48)) : 210;
    const totalW = CLASSES.length * cardW + (CLASSES.length - 1) * gap;
    const startX = width / 2 - totalW / 2 + cardW / 2;
    const cardY = compact ? height * 0.48 : height / 2 - 10;

    const cards: Array<{ id: HeroClassId; bg: Phaser.GameObjects.NineSlice; brackets: Phaser.GameObjects.Image[] }> = [];
    const refreshCards = () => {
      for (const c of cards) {
        const isSel = c.id === this.selected;
        c.bg.setTint(isSel ? 0xffffff : 0xead8be);
        c.brackets.forEach((b) => b.setVisible(isSel));
      }
    };

    CLASSES.forEach((cls, idx) => {
      const cx = startX + idx * (cardW + gap);
      const isSel = cls.id === this.selected;
      const bg = addSproutNineSlice(this, cx, cardY, cardW, cardH, 'panel_wood', 2)
        .setInteractive({ useHandCursor: true });
      bg.setTint(isSel ? 0xffffff : 0xead8be);

      const bOffX = cardW / 2 - 4;
      const bOffY = cardH / 2 - 4;
      const brackets = [
        this.add.image(cx - bOffX, cardY - bOffY, 'sprout_ui/selectors/selector_c_tl').setScale(1.5).setVisible(isSel),
        this.add.image(cx + bOffX, cardY - bOffY, 'sprout_ui/selectors/selector_c_tr').setScale(1.5).setVisible(isSel),
        this.add.image(cx - bOffX, cardY + bOffY, 'sprout_ui/selectors/selector_c_bl').setScale(1.5).setVisible(isSel),
        this.add.image(cx + bOffX, cardY + bOffY, 'sprout_ui/selectors/selector_c_br').setScale(1.5).setVisible(isSel),
      ];

      const children: Phaser.GameObjects.GameObject[] = [bg, ...brackets];
      const portFrame = addSproutNineSlice(
        this,
        cx,
        cardY - cardH * 0.27,
        compact ? 48 : 58,
        compact ? 48 : 58,
        'frame_wood_a4',
        2,
      );
      children.push(portFrame);
      if (this.textures.exists(cls.portraitKey)) {
        children.push(this.add.image(cx, cardY - cardH * 0.27, cls.portraitKey).setScale(compact ? 1.3 : 1.7));
      }
      const heroSpr = this.add
        .sprite(cx - (compact ? 10 : 12), cardY + (compact ? 2 : 4), `heroes/${cls.id}/${cls.id}_idle`, 0)
        .setScale(compact ? 1.8 : 2.3);
      const animKey = `hero_${cls.id}_idle_down`;
      if (this.anims.exists(animKey)) heroSpr.play(animKey);
      children.push(heroSpr);

      const famSpec = getFamiliarSpecForClass(cls.id);
      const famX = cx + (compact ? 22 : 28);
      const famY = cardY + (compact ? 8 : 12);
      if (famSpec.spriteKind === 'fox') {
        const famSpr = this.add.sprite(famX, famY, 'heroes/Fox/Fox_idle', 0).setScale(compact ? 1.2 : 1.5);
        if (this.anims.exists('hero_Fox_idle_down')) famSpr.play('hero_Fox_idle_down');
        children.push(famSpr);
      } else {
        const famTex = `familiars/${famSpec.baseId}`;
        if (this.textures.exists(famTex)) {
          const famSpr = this.add.sprite(famX, famY, famTex, 1).setScale(compact ? 1.3 : 1.6);
          const famAnim = `fam_${famSpec.baseId}_walk_down`;
          if (this.anims.exists(famAnim)) famSpr.play(famAnim);
          children.push(famSpr);
        }
      }

      children.push(
        this.add
          .text(cx, cardY + cardH * 0.22, cls.title, {
            fontFamily: 'SproutLandsDisplay, SproutLandsUI, monospace',
            fontSize: compact ? '13px' : '16px',
            fontStyle: 'bold',
            color: '#3b2316',
          })
          .setOrigin(0.5),
      );
      children.push(
        this.add
          .text(cx, cardY + cardH * 0.36, cls.perk, {
            fontFamily: 'SproutLandsUI, monospace, sans-serif',
            fontSize: compact ? '9px' : '11px',
            color: '#5c3a24',
            align: 'center',
            wordWrap: { width: cardW - 18 },
          })
          .setOrigin(0.5),
      );

      bg.on('pointerdown', () => {
        SFX.playHotbarSelect();
        this.selected = cls.id;
        refreshCards();
      });

      cards.push({ id: cls.id, bg, brackets });
      this.menuContainer?.add(children);
    });

    const btnY = compact ? cardY + cardH / 2 + 26 : cardY + 146;
    const btnH = compact ? 34 : 42;

    const backBtn = createSproutButton(this, {
      x: width / 2 - (compact ? 96 : 114),
      y: btnY,
      width: compact ? 156 : 176,
      height: btnH,
      label: '← BACK TO FILES',
      variant: 'tan',
      fontSize: compact ? '11px' : '13px',
      onClick: () => {
        SFX.playUiClick();
        this.showFileSelectMenu();
      },
    });

    const startBtn = createSproutButton(this, {
      x: width / 2 + (compact ? 96 : 114),
      y: btnY,
      width: compact ? 176 : 196,
      height: btnH,
      label: 'START ADVENTURE',
      variant: 'white',
      textColor: '#214f26',
      fontSize: compact ? '11px' : '13px',
      onClick: () => {
        if (transitionManager.isActive) return;
        SFX.playUiClick();
        SFX.playPortalWarp();
        gameState.setActiveSlot(targetSlot);
        gameState.startNewGameWithTutorial(this.selected);
        gameState.save(targetSlot);
        void transitionManager.transitionTo({
          onMidpoint: async () => {
            SFX.setMusicSituation('dungeon');
            await startSceneAndWaitCreate(this, 'TutorialDungeonScene');
          },
        });
      },
    });

    this.menuContainer.add([backBtn.container, startBtn.container]);

    this.tweens.add({
      targets: this.menuContainer,
      alpha: 1,
      y: 0,
      duration: 280,
      ease: 'Cubic.Out',
    });
  }
}
