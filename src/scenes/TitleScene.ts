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
import { buildBaseSnapshot, isQaMode, markQaReady, registerQaApi, resetQaReady } from '../qa/QaDirector';
import { applyGoldGleamShader, type GoldGleamPipeline } from '../vfx/GoldGleamShader';
import { TitleDiorama } from '../vfx/TitleDiorama';

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
  gfx: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  vr: number;
  gravity: number;
  drag: number;
  restitution: number;
  isBoulder: boolean;
  bounces: number;
  settled: boolean;
}

interface DustPuff {
  gfx: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  drag: number;
  age: number;
  life: number;
  startScale: number;
  endScale: number;
  startAlpha: number;
}

export class TitleScene extends Phaser.Scene {
  private selected: HeroClassId = 'Beastmaster';
  private menuContainer?: Phaser.GameObjects.Container;
  private rubbleContainer?: Phaser.GameObjects.Container;
  private diorama?: TitleDiorama;
  private levelBgScrim?: Phaser.GameObjects.Rectangle;
  private horizonRect?: Phaser.GameObjects.Rectangle;
  private horizonLine?: Phaser.GameObjects.Rectangle;
  private introStars: Phaser.GameObjects.Arc[] = [];
  private shards: Shard[] = [];
  private dustPuffs: DustPuff[] = [];
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
    this.dustPuffs = [];
    this.introStars = [];
    this.diorama = undefined;
    this.levelBgScrim = undefined;
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
      this.introStars.push(dot);
      this.tweens.add({
        targets: dot,
        alpha: { from: 0.12, to: 0.6 },
        duration: Phaser.Math.Between(1100, 2600),
        yoyo: true,
        repeat: -1,
      });
    }

    // Ground horizon strip where shattered title pieces settle
    this.horizonRect = this.add.rectangle(width / 2, this.groundY + (height - this.groundY) / 2, width, height - this.groundY, 0x101d2d);
    this.horizonLine = this.add.rectangle(width / 2, this.groundY, width, 2, 0x2f4d6e, 0.7);
    this.rubbleContainer = this.add.container(0, 0).setDepth(5);
    this.menuContainer = this.add.container(0, 0).setDepth(20);

    const onResize = (gameSize: Phaser.Structs.Size) => {
      const w = gameSize.width;
      const h = gameSize.height;
      this.cameras.main.setSize(w, h);
      this.groundY = h * 0.87;
      bgRect.setPosition(w / 2, h / 2).setSize(w, h);
      this.horizonRect?.setPosition(w / 2, this.groundY + (h - this.groundY) / 2).setSize(w, h - this.groundY);
      this.horizonLine?.setPosition(w / 2, this.groundY).setSize(w, 2);
      this.diorama?.resize(w, h);
      this.levelBgScrim?.setPosition(w / 2, h / 2).setSize(w, h);
      if (this.splashSkipped) {
        this.showFileSelectMenu('instant');
      }
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
      this.diorama?.destroy();
      this.diorama = undefined;
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
      this.showLevelSelectBgImmediate();
      this.showFileSelectMenu('instant');
    } else {
      this.playIntroSplash();
    }

    if (isQaMode()) {
      registerQaApi({
        getStateSnapshot: () =>
          buildBaseSnapshot('TitleScene', {
            heroClass: this.selected,
          }),
        triggerAction: (action, payload) => {
          if (action === 'select_hero') {
            const hero = (payload?.heroClass as HeroClassId | undefined) ?? 'Gladiator';
            this.selected = hero;
            gameState.heroClass = hero;
            this.showClassSelectMenu(0);
            return true;
          }
          if (action === 'start_tutorial') {
            resetQaReady();
            gameState.setActiveSlot(0);
            gameState.startNewGameWithTutorial(this.selected);
            gameState.save(0);
            this.scene.start('TutorialDungeonScene');
            return true;
          }
          return false;
        },
      });
      markQaReady();
    }
  }

  update(_time: number, dtMs: number): void {
    const dt = Math.min(0.05, dtMs / 1000);
    this.diorama?.update(dt);

    for (let i = this.dustPuffs.length - 1; i >= 0; i--) {
      const p = this.dustPuffs[i];
      p.age += dt;
      if (p.age >= p.life) {
        p.gfx.destroy();
        this.dustPuffs.splice(i, 1);
        continue;
      }
      const dragPow = Math.pow(p.drag, dt * 60);
      p.vx *= dragPow;
      p.vy = p.vy * dragPow - 14 * dt;
      p.gfx.x += p.vx * dt;
      p.gfx.y += p.vy * dt;
      const t = p.age / p.life;
      p.gfx.setScale(Phaser.Math.Linear(p.startScale, p.endScale, t));
      p.gfx.setAlpha(p.startAlpha * (1 - t));
    }

    if (this.shards.length === 0) return;

    for (const s of this.shards) {
      if (s.settled) continue;
      const dragPow = Math.pow(s.drag, dt * 60);
      s.vx *= dragPow;
      s.vy += s.gravity * dt;
      s.gfx.x += s.vx * dt;
      s.gfx.y += s.vy * dt;
      s.gfx.angle += s.vr * dt;

      if (s.gfx.y >= this.groundY) {
        s.gfx.y = this.groundY - Phaser.Math.Between(0, 4);
        if (s.isBoulder && s.bounces === 0) {
          this.spawnDustPuff(
            s.gfx.x,
            this.groundY - 2,
            Phaser.Math.FloatBetween(-24, 24),
            Phaser.Math.FloatBetween(-26, -10),
            0.35,
            0.75,
            0.34,
            Phaser.Math.FloatBetween(0.55, 0.85),
          );
          for (let c = 0; c < 2; c++) {
            if (this.shards.length >= 220) break;
            this.spawnRockShard(
              s.gfx.x + Phaser.Math.Between(-5, 5),
              this.groundY - 4,
              Phaser.Math.FloatBetween(-85, 85),
              Phaser.Math.FloatBetween(-130, -55),
              Phaser.Math.FloatBetween(0.14, 0.24),
              640,
              0.99,
              0.25,
              false,
            );
          }
        }
        if (s.bounces < 2 && Math.abs(s.vy) > 45) {
          s.vy = -Math.abs(s.vy) * s.restitution;
          s.vx *= 0.65;
          s.vr *= 0.55;
          s.bounces += 1;
        } else {
          s.vx = 0;
          s.vy = 0;
          s.vr = 0;
          s.settled = true;
          s.gfx.setAlpha(0.78);
        }
      }
    }
  }

  private ensureRockTextures(): void {
    if (!this.textures.exists('title_rock_0')) {
      const variants: Array<{
        pts: Array<[number, number]>;
        base: string;
        hi: string;
        lo: string;
        goldVein?: boolean;
      }> = [
        { pts: [[6, 3], [16, 2], [21, 9], [19, 19], [9, 21], [3, 13]], base: '#92897c', hi: '#c4bba9', lo: '#4a443d' },
        { pts: [[4, 5], [13, 2], [20, 7], [21, 16], [12, 21], [4, 17]], base: '#7c7469', hi: '#b4ab9a', lo: '#3f3933', goldVein: true },
        { pts: [[7, 2], [18, 4], [22, 12], [16, 21], [6, 19], [2, 10]], base: '#a1988a', hi: '#cfc6b6', lo: '#554e46' },
        { pts: [[5, 4], [14, 3], [21, 10], [18, 20], [8, 22], [3, 14]], base: '#6e675e', hi: '#9e9587', lo: '#38332e' },
        { pts: [[6, 2], [17, 3], [21, 11], [17, 20], [7, 20], [2, 11]], base: '#8c8376', hi: '#bfb6a5', lo: '#47413a', goldVein: true },
        { pts: [[4, 6], [12, 2], [20, 6], [19, 18], [10, 22], [3, 15]], base: '#82796e', hi: '#b5ac9b', lo: '#423c36' },
      ];

      variants.forEach((v, idx) => {
        const tex = this.textures.createCanvas(`title_rock_${idx}`, 24, 24);
        if (!tex) return;
        const ctx = tex.getContext();
        ctx.beginPath();
        v.pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
        ctx.closePath();
        ctx.fillStyle = v.base;
        ctx.fill();

        // Top-left bevel highlight
        ctx.beginPath();
        ctx.moveTo(v.pts[0][0], v.pts[0][1]);
        ctx.lineTo(v.pts[1][0], v.pts[1][1]);
        ctx.lineTo(12, 12);
        ctx.lineTo(v.pts[v.pts.length - 1][0], v.pts[v.pts.length - 1][1]);
        ctx.closePath();
        ctx.fillStyle = v.hi;
        ctx.fill();

        // Bottom-right shadow facet
        ctx.beginPath();
        ctx.moveTo(v.pts[2][0], v.pts[2][1]);
        ctx.lineTo(v.pts[3][0], v.pts[3][1]);
        ctx.lineTo(v.pts[4][0], v.pts[4][1]);
        ctx.lineTo(12, 12);
        ctx.closePath();
        ctx.fillStyle = v.lo;
        ctx.fill();

        if (v.goldVein) {
          ctx.strokeStyle = '#ffd970';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(v.pts[0][0] + 2, v.pts[0][1] + 4);
          ctx.lineTo(13, 12);
          ctx.lineTo(v.pts[3][0] - 3, v.pts[3][1] - 3);
          ctx.stroke();
        }

        ctx.strokeStyle = '#2e2a25';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        v.pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
        ctx.closePath();
        ctx.stroke();
        tex.refresh();
      });
    }

    if (!this.textures.exists('title_dust_puff')) {
      const tex = this.textures.createCanvas('title_dust_puff', 32, 32);
      if (tex) {
        const ctx = tex.getContext();
        const grad = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
        grad.addColorStop(0, 'rgba(255,255,255,0.92)');
        grad.addColorStop(0.55, 'rgba(255,255,255,0.45)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 32, 32);
        tex.refresh();
      }
    }
  }

  private spawnRockShard(
    x: number,
    y: number,
    vx: number,
    vy: number,
    scale: number,
    gravity: number,
    drag: number,
    restitution: number,
    isBoulder: boolean,
    tint?: number,
  ): void {
    if (this.shards.length >= 220 || !this.textures.exists('title_rock_0')) return;
    const key = `title_rock_${Phaser.Math.Between(0, 5)}`;
    const img = this.add
      .image(x, y, key)
      .setScale(scale)
      .setAngle(Phaser.Math.Between(0, 359))
      .setDepth(isBoulder ? 7 : 6);
    if (tint !== undefined) img.setTint(tint);
    this.rubbleContainer?.add(img);
    this.shards.push({
      gfx: img,
      vx,
      vy,
      vr: isBoulder ? Phaser.Math.Between(-180, 180) : Phaser.Math.Between(-420, 420),
      gravity,
      drag,
      restitution,
      isBoulder,
      bounces: 0,
      settled: false,
    });
  }

  private spawnDustPuff(
    x: number,
    y: number,
    vx: number,
    vy: number,
    startScale: number,
    endScale: number,
    startAlpha: number,
    life: number,
  ): void {
    if (this.dustPuffs.length >= 35 || !this.textures.exists('title_dust_puff')) return;
    const palette = [0xd8cdb8, 0xb6a894, 0x8c8173];
    const img = this.add
      .image(x, y, 'title_dust_puff')
      .setTint(Phaser.Utils.Array.GetRandom(palette))
      .setScale(startScale)
      .setAlpha(startAlpha)
      .setDepth(5);
    this.rubbleContainer?.add(img);
    this.dustPuffs.push({
      gfx: img,
      vx,
      vy,
      drag: 0.94,
      age: 0,
      life,
      startScale,
      endScale,
      startAlpha,
    });
  }

  private buildCarvedStoneWordTexture(
    word: string,
    cell: number,
    rowCenterY: number,
  ): { key: string; offsetX: number; shatterPoints: Array<{ bx: number; by: number }> } {
    const key = `title_carved_${word}_${cell}`;
    const charW = 5 * cell;
    const charGap = Math.round(cell * 1.15);
    const totalW = word.length * charW + (word.length - 1) * charGap;
    const totalH = 5 * cell;
    const depthOffset = Math.max(4, Math.round(cell * 0.55));
    const pad = 6;
    const canvasW = totalW + pad * 2 + depthOffset;
    const canvasH = totalH + pad * 2 + depthOffset;

    const shatterPoints: Array<{ bx: number; by: number }> = [];
    let cursorX = -totalW / 2 + cell / 2;
    for (const ch of word) {
      const glyph = GLYPHS[ch];
      if (glyph) {
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            if (glyph[r][c] !== '1') continue;
            shatterPoints.push({
              bx: cursorX + c * cell,
              by: rowCenterY + (r - 2) * cell,
            });
          }
        }
      }
      cursorX += charW + charGap;
    }

    if (!this.textures.exists(key)) {
      const tex = this.textures.createCanvas(key, canvasW, canvasH);
      if (tex) {
        const ctx = tex.getContext();

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = canvasW;
        maskCanvas.height = canvasH;
        const mCtx = maskCanvas.getContext('2d')!;

        const hash = (a: number, b: number, c: number, d: number) => {
          const n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + d * 19.3) * 43758.5453;
          return n - Math.floor(n);
        };

        // 1. Draw continuous letter silhouettes with zero internal gaps
        let gx = pad;
        for (let wi = 0; wi < word.length; wi++) {
          const glyph = GLYPHS[word[wi]];
          if (glyph) {
            for (let r = 0; r < 5; r++) {
              for (let c = 0; c < 5; c++) {
                if (glyph[r][c] !== '1') continue;
                mCtx.fillStyle = '#ffffff';
                mCtx.fillRect(gx + c * cell, pad + r * cell, cell, cell);
              }
            }
            // Carve rough chiseled notches on outer boundary edges only
            mCtx.globalCompositeOperation = 'destination-out';
            for (let r = 0; r < 5; r++) {
              for (let c = 0; c < 5; c++) {
                if (glyph[r][c] !== '1') continue;
                const x0 = gx + c * cell;
                const y0 = pad + r * cell;
                const topEmpty = r === 0 || glyph[r - 1][c] === '0';
                const botEmpty = r === 4 || glyph[r + 1][c] === '0';
                const leftEmpty = c === 0 || glyph[r][c - 1] === '0';
                const rightEmpty = c === 4 || glyph[r][c + 1] === '0';

                if (topEmpty && hash(wi, r, c, 1) < 0.55) {
                  const nx = x0 + Math.floor(hash(wi, r, c, 2) * (cell - 3));
                  mCtx.fillRect(nx, y0, 2, 1.5);
                }
                if (botEmpty && hash(wi, r, c, 3) < 0.55) {
                  const nx = x0 + Math.floor(hash(wi, r, c, 4) * (cell - 3));
                  mCtx.fillRect(nx, y0 + cell - 1.5, 2, 1.5);
                }
                if (leftEmpty && hash(wi, r, c, 5) < 0.55) {
                  const ny = y0 + Math.floor(hash(wi, r, c, 6) * (cell - 3));
                  mCtx.fillRect(x0, ny, 1.5, 2);
                }
                if (rightEmpty && hash(wi, r, c, 7) < 0.55) {
                  const ny = y0 + Math.floor(hash(wi, r, c, 8) * (cell - 3));
                  mCtx.fillRect(x0 + cell - 1.5, ny, 1.5, 2);
                }
              }
            }
            mCtx.globalCompositeOperation = 'source-over';
          }
          gx += charW + charGap;
        }

        // Helper to tint the maskCanvas into a temporary canvas
        const makeTintedMask = (color: string) => {
          const tc = document.createElement('canvas');
          tc.width = canvasW;
          tc.height = canvasH;
          const tCtx = tc.getContext('2d')!;
          tCtx.drawImage(maskCanvas, 0, 0);
          tCtx.globalCompositeOperation = 'source-in';
          tCtx.fillStyle = color;
          tCtx.fillRect(0, 0, canvasW, canvasH);
          return tc;
        };

        // 2. Layered 3D chiseled stone extrusion
        const extColors = ['#342a22', '#524334', '#6f5c47'];
        for (let d = depthOffset; d >= 1; d--) {
          const ratio = 1 - d / Math.max(1, depthOffset);
          const colIdx = Math.min(extColors.length - 1, Math.floor(ratio * extColors.length));
          const layer = makeTintedMask(extColors[colIdx]);
          ctx.drawImage(layer, d, d);
        }

        // 3. Smooth continuous stone-to-gold interior face
        const faceCanvas = document.createElement('canvas');
        faceCanvas.width = canvasW;
        faceCanvas.height = canvasH;
        const fCtx = faceCanvas.getContext('2d')!;
        fCtx.drawImage(maskCanvas, 0, 0);
        fCtx.globalCompositeOperation = 'source-atop';

        const grad = fCtx.createLinearGradient(0, pad, 0, pad + totalH);
        grad.addColorStop(0, '#f4d57a');
        grad.addColorStop(0.38, '#c9a86a');
        grad.addColorStop(0.75, '#8b7a62');
        grad.addColorStop(1, '#685c4d');
        fCtx.fillStyle = grad;
        fCtx.fillRect(0, 0, canvasW, canvasH);

        // Soft organic mineral grain blotches (no grid lines)
        for (let i = 0; i < 42; i++) {
          const bx = hash(i, 1, 2, 3) * canvasW;
          const by = hash(i, 4, 5, 6) * canvasH;
          const br = 4 + hash(i, 7, 8, 9) * 10;
          fCtx.fillStyle = i % 2 === 0 ? 'rgba(255, 240, 196, 0.08)' : 'rgba(59, 50, 40, 0.1)';
          fCtx.beginPath();
          fCtx.arc(bx, by, br, 0, Math.PI * 2);
          fCtx.fill();
        }

        // Thin diagonal golden ore veins across each letter
        let vx = pad;
        for (let wi = 0; wi < word.length; wi++) {
          for (let v = 0; v < 2; v++) {
            const sx = vx + hash(wi, v, 10, 11) * (charW * 0.55);
            const sy = pad + hash(wi, v, 12, 13) * (totalH * 0.45);
            const ex = sx + charW * (0.35 + hash(wi, v, 14, 15) * 0.4);
            const ey = sy + totalH * (0.3 + hash(wi, v, 16, 17) * 0.45);
            fCtx.strokeStyle = 'rgba(92, 67, 20, 0.45)';
            fCtx.lineWidth = 2.2;
            fCtx.beginPath();
            fCtx.moveTo(sx, sy);
            fCtx.lineTo((sx + ex) * 0.5 + 3, (sy + ey) * 0.5 - 2);
            fCtx.lineTo(ex, ey);
            fCtx.stroke();

            fCtx.strokeStyle = 'rgba(255, 224, 118, 0.85)';
            fCtx.lineWidth = 1.2;
            fCtx.beginPath();
            fCtx.moveTo(sx, sy);
            fCtx.lineTo((sx + ex) * 0.5 + 3, (sy + ey) * 0.5 - 2);
            fCtx.lineTo(ex, ey);
            fCtx.stroke();
          }
          vx += charW + charGap;
        }

        // Crisp top-left chiseled bevel highlight & bottom-right inner rim
        const hiRim = makeTintedMask('#fff2bd');
        const hiCtx = hiRim.getContext('2d')!;
        hiCtx.globalCompositeOperation = 'destination-out';
        hiCtx.drawImage(maskCanvas, 1.6, 1.6);
        fCtx.drawImage(hiRim, 0, 0);

        const loRim = makeTintedMask('#2b221b');
        const loCtx = loRim.getContext('2d')!;
        loCtx.globalCompositeOperation = 'destination-out';
        loCtx.drawImage(maskCanvas, -1.6, -1.6);
        fCtx.drawImage(loRim, 0, 0);

        ctx.drawImage(faceCanvas, 0, 0);
        tex.refresh();
      }
    }

    return {
      key,
      offsetX: depthOffset * 0.5,
      shatterPoints,
    };
  }

  private playIntroSplash(): void {
    this.ensureRockTextures();
    const { width, height } = this.scale;
    const compact = width < 920 || height < 480;
    const cell = compact ? 7 : 10;

    const titleContainer = this.add.container(width / 2, -120).setDepth(15);
    const rowGap = compact ? 5.8 * cell : 6.4 * cell;
    const forageSpec = this.buildCarvedStoneWordTexture('FORAGE', cell, -rowGap * 0.5);
    const aheadSpec = this.buildCarvedStoneWordTexture('AHEAD', cell, rowGap * 0.5);

    const forageImg = this.add
      .image(forageSpec.offsetX, -rowGap * 0.5, forageSpec.key)
      .setOrigin(0.5);
    const aheadImg = this.add
      .image(aheadSpec.offsetX, rowGap * 0.5, aheadSpec.key)
      .setOrigin(0.5);
    const crackGfx = this.add.graphics();
    titleContainer.add([forageImg, aheadImg, crackGfx]);

    const gleamPipes: GoldGleamPipeline[] = [];
    const p1 = applyGoldGleamShader(forageImg, { intensity: 1.15, speed: 0.65 });
    const p2 = applyGoldGleamShader(aheadImg, { intensity: 1.15, speed: 0.65 });
    if (p1) gleamPipes.push(p1);
    if (p2) gleamPipes.push(p2);

    const blocks = [...forageSpec.shatterPoints, ...aheadSpec.shatterPoints];

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
      this.showLevelSelectBgImmediate();
      this.showFileSelectMenu('instant');
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
        for (const p of gleamPipes) {
          p.intensity = 1.45;
          this.tweens.add({ targets: p, intensity: 1.05, duration: 360, ease: 'Quad.Out' });
        }
        for (let i = 0; i < 9; i++) {
          const sideDir = i % 2 === 0 ? -1 : 1;
          this.spawnDustPuff(
            width / 2 + sideDir * Phaser.Math.Between(18, 125),
            height * 0.44 + Phaser.Math.Between(-12, 18),
            sideDir * Phaser.Math.FloatBetween(35, 95),
            Phaser.Math.FloatBetween(-28, 12),
            Phaser.Math.FloatBetween(0.45, 0.75),
            Phaser.Math.FloatBetween(1.1, 1.55),
            Phaser.Math.FloatBetween(0.28, 0.44),
            Phaser.Math.FloatBetween(0.75, 1.15),
          );
        }
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

    // Stage 2: Propagating Cracks & Pre-Shatter Crumbling (900ms -> 1880ms)
    this.time.delayedCall(920, () => {
      if (this.splashSkipped) return;
      SFX.playStoneCrack();
      this.cameras.main.shake(220, 0.005);
      forageImg.setTint(0xd6cfc4);
      aheadImg.setTint(0xd6cfc4);
      for (const p of gleamPipes) p.intensity = 0.72;

      let maxDist = 1;
      for (const b of blocks) {
        const d = Math.hypot(b.bx, b.by);
        if (d > maxDist) maxDist = d;
      }

      for (const b of blocks) {
        const waveDelay = Math.round((Math.hypot(b.bx, b.by) / maxDist) * 160);
        this.time.delayedCall(waveDelay, () => {
          if (this.splashSkipped || !crackGfx.active) return;
          if (Math.random() < 0.75) {
            crackGfx.lineStyle(1.3, Math.random() < 0.35 ? 0xffb347 : 0x26211e, 0.95);
            crackGfx.beginPath();
            crackGfx.moveTo(b.bx - cell * 0.45, b.by + Phaser.Math.FloatBetween(-cell * 0.4, cell * 0.4));
            crackGfx.lineTo(b.bx, b.by + Phaser.Math.FloatBetween(-cell * 0.25, cell * 0.25));
            crackGfx.lineTo(b.bx + cell * 0.45, b.by + Phaser.Math.FloatBetween(-cell * 0.4, cell * 0.4));
            crackGfx.strokePath();
          }
        });
      }

      const spawnCrumblePebble = () => {
        if (this.splashSkipped || blocks.length === 0 || !titleContainer.active) return;
        const b = Phaser.Utils.Array.GetRandom(blocks);
        const wx = titleContainer.x + b.bx + Phaser.Math.Between(-3, 3);
        const wy = titleContainer.y + b.by + cell * 0.4;
        this.spawnRockShard(
          wx,
          wy,
          Phaser.Math.FloatBetween(-28, 28),
          Phaser.Math.FloatBetween(10, 45),
          Phaser.Math.FloatBetween(0.14, 0.24),
          620,
          0.992,
          0.25,
          false,
        );
        this.spawnDustPuff(
          wx,
          wy,
          Phaser.Math.FloatBetween(-12, 12),
          Phaser.Math.FloatBetween(-14, 4),
          0.22,
          0.5,
          0.26,
          0.55,
        );
      };

      for (let t = 230; t <= 920; t += 110) {
        this.time.delayedCall(t, spawnCrumblePebble);
      }
    });

    this.time.delayedCall(1450, () => {
      if (this.splashSkipped) return;
      SFX.playStoneCrack();
      forageImg.setTint(0xafa89e);
      aheadImg.setTint(0xafa89e);
      for (const p of gleamPipes) p.intensity = 0.45;
      for (const b of blocks) {
        if (Math.random() < 0.72) {
          crackGfx.lineStyle(1.2, 0x7ce8ff, 0.85);
          crackGfx.beginPath();
          crackGfx.moveTo(b.bx + Phaser.Math.FloatBetween(-cell * 0.35, cell * 0.35), b.by - cell * 0.45);
          crackGfx.lineTo(b.bx + Phaser.Math.FloatBetween(-cell * 0.2, cell * 0.2), b.by + cell * 0.45);
          crackGfx.strokePath();
        }
      }
      this.tweens.add({
        targets: titleContainer,
        x: { from: width / 2 - 2, to: width / 2 + 2 },
        duration: 45,
        yoyo: true,
        repeat: 5,
      });
    });

    // Stage 3: Organic Multi-Tier Radial Rock Shatter (1900ms, staggered over ~140ms)
    this.time.delayedCall(1900, () => {
      if (this.splashSkipped) return;
      SFX.playShatter();
      this.cameras.main.shake(280, 0.014);

      const baseX = titleContainer.x;
      const baseY = titleContainer.y;

      let maxDist = 1;
      for (const b of blocks) {
        const d = Math.hypot(b.bx, b.by);
        if (d > maxDist) maxDist = d;
      }

      // Layered Stone Dust Clouds bursting outward from the rupture
      for (let i = 0; i < 24; i++) {
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const spd = Phaser.Math.FloatBetween(35, 165);
        this.spawnDustPuff(
          baseX + Phaser.Math.Between(-95, 95),
          baseY + Phaser.Math.Between(-35, 35),
          Math.cos(angle) * spd,
          Math.sin(angle) * spd * 0.6 - 18,
          Phaser.Math.FloatBetween(0.5, 0.95),
          Phaser.Math.FloatBetween(1.15, 1.95),
          Phaser.Math.FloatBetween(0.3, 0.52),
          Phaser.Math.FloatBetween(0.9, 1.5),
        );
      }

      const bucketDelays = [0, 35, 70, 105, 140];
      const buckets: Array<typeof blocks> = bucketDelays.map(() => []);
      for (const b of blocks) {
        const ratio = Math.hypot(b.bx, b.by) / maxDist;
        const idx = Math.min(buckets.length - 1, Math.floor(ratio * buckets.length));
        buckets[idx].push(b);
      }

      buckets.forEach((group, bIdx) => {
        const delay = bucketDelays[bIdx];
        const emitGroup = () => {
          if (this.splashSkipped) return;
          if (bIdx === 1 && titleContainer.active) {
            forageImg.setVisible(false);
            aheadImg.setVisible(false);
            crackGfx.setVisible(false);
          }
          for (const b of group) {
            const wx = baseX + b.bx;
            const wy = baseY + b.by;
            const dx = wx - width / 2;
            const dy = wy - baseY;
            const roll = Math.random();

            if (roll < 0.14) {
              // Large Boulder (~14%)
              this.spawnRockShard(
                wx + Phaser.Math.Between(-2, 2),
                wy + Phaser.Math.Between(-2, 2),
                dx * Phaser.Math.FloatBetween(0.45, 0.9) + Phaser.Math.Between(-55, 55),
                Phaser.Math.FloatBetween(-165, 20) + dy * 0.4,
                Phaser.Math.FloatBetween(0.65, 1.0),
                740,
                0.994,
                Phaser.Math.FloatBetween(0.22, 0.32),
                true,
              );
            } else if (roll < 0.6) {
              // Medium Rock Shard (~46%)
              this.spawnRockShard(
                wx + Phaser.Math.Between(-3, 3),
                wy + Phaser.Math.Between(-3, 3),
                dx * Phaser.Math.FloatBetween(0.65, 1.3) + Phaser.Math.Between(-85, 85),
                Phaser.Math.FloatBetween(-215, 35) + dy * 0.6,
                Phaser.Math.FloatBetween(0.34, 0.58),
                640,
                0.992,
                Phaser.Math.FloatBetween(0.22, 0.42),
                false,
              );
            } else {
              // Fine Gravel & Pebble Spray (~40%)
              const goldGlint = Math.random() < 0.2 ? 0xffd970 : undefined;
              this.spawnRockShard(
                wx + Phaser.Math.Between(-4, 4),
                wy + Phaser.Math.Between(-4, 4),
                dx * Phaser.Math.FloatBetween(0.85, 1.65) + Phaser.Math.Between(-130, 130),
                Phaser.Math.FloatBetween(-245, 25) + dy * 0.7,
                Phaser.Math.FloatBetween(0.14, 0.28),
                600,
                0.988,
                Phaser.Math.FloatBetween(0.26, 0.45),
                false,
                goldGlint,
              );
              if (Math.random() < 0.32) {
                this.spawnRockShard(
                  wx + Phaser.Math.Between(-4, 4),
                  wy + Phaser.Math.Between(-4, 4),
                  dx * Phaser.Math.FloatBetween(0.9, 1.75) + Phaser.Math.Between(-145, 145),
                  Phaser.Math.FloatBetween(-230, 30),
                  Phaser.Math.FloatBetween(0.14, 0.24),
                  590,
                  0.986,
                  Phaser.Math.FloatBetween(0.24, 0.4),
                  false,
                  Math.random() < 0.25 ? 0xe8be55 : undefined,
                );
              }
            }
          }
          if (bIdx === buckets.length - 1 && titleContainer.active) {
            titleContainer.destroy();
          }
        };

        if (delay === 0) emitGroup();
        else this.time.delayedCall(delay, emitGroup);
      });

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

    this.time.delayedCall(2750, () => {
      if (this.splashSkipped) return;

      // 1. Fade out the Forage Ahead text effect (rubble, horizon, stars, skip hint)
      this.tweens.killTweensOf(this.introStars);
      const fadeTargets: object[] = [skipHint, ...this.introStars];
      if (this.rubbleContainer) fadeTargets.push(this.rubbleContainer);
      if (this.horizonRect) fadeTargets.push(this.horizonRect);
      if (this.horizonLine) fadeTargets.push(this.horizonLine);
      this.tweens.add({
        targets: fadeTargets,
        alpha: 0,
        duration: 550,
        ease: 'Quad.Out',
        onComplete: () => {
          if (skipHint.active) skipHint.destroy();
        },
      });

      // 2. Fade in TitleDiorama (in-game pixel-art archipelago)
      this.ensureLevelSelectBg();
      const startBlurAndMenu = () => {
        if (this.splashSkipped) return;

        // 3. Slowly blur the entire diorama (sky + clouds + birds + 3D world) + fade in soft readability scrim
        this.diorama?.tweenBlur(0.55, 950);
        if (this.levelBgScrim) {
          this.tweens.add({
            targets: this.levelBgScrim,
            alpha: 0.2,
            duration: 950,
            ease: 'Sine.InOut',
          });
        }

        // 4. ~300ms after blur starts, drop down the Level Selection UI & jiggle
        this.time.delayedCall(300, () => {
          if (this.splashSkipped) return;
          this.input.off('pointerdown', onSkip);
          this.input.keyboard?.off('keydown', onSkip);
          this.splashSkipped = true;
          this.showFileSelectMenu('drop');
        });
      };

      if (this.diorama) {
        this.diorama.setAlpha(0);
        this.tweens.add({
          targets: [this.diorama.skyLayer, this.diorama.groundLayer, this.diorama.propLayer],
          alpha: 1,
          duration: 750,
          ease: 'Sine.InOut',
          onComplete: startBlurAndMenu,
        });
      } else {
        this.time.delayedCall(750, startBlurAndMenu);
      }
    });
  }

  private ensureLevelSelectBg(): void {
    const { width, height } = this.scale;
    if (!this.diorama) {
      this.diorama = new TitleDiorama(this, 8);
    }
    if (!this.levelBgScrim) {
      this.levelBgScrim = this.add
        .rectangle(width / 2, height / 2, width, height, 0x0a1320, 1)
        .setDepth(9)
        .setAlpha(0);
    }
    this.diorama.resize(width, height);
    this.levelBgScrim.setPosition(width / 2, height / 2).setSize(width, height);
  }

  private hideIntroElementsImmediate(): void {
    this.tweens.killTweensOf(this.introStars);
    for (const star of this.introStars) {
      star.setAlpha(0);
    }
    for (const s of this.shards) {
      s.gfx.destroy();
    }
    this.shards = [];
    for (const p of this.dustPuffs) {
      p.gfx.destroy();
    }
    this.dustPuffs = [];
    this.rubbleContainer?.setAlpha(0);
    this.horizonRect?.setAlpha(0);
    this.horizonLine?.setAlpha(0);
  }

  private showLevelSelectBgImmediate(): void {
    this.hideIntroElementsImmediate();
    this.ensureLevelSelectBg();
    this.diorama?.setAlpha(1);
    this.diorama?.setBlurStrength(0.55);
    this.levelBgScrim?.setAlpha(0.2);
  }

  private showFileSelectMenu(entrance: 'instant' | 'fade' | 'drop' = 'fade'): void {
    if (!this.menuContainer) return;
    this.tweens.killTweensOf(this.menuContainer);
    this.menuContainer.removeAll(true);

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
    applyGoldGleamShader(title, { intensity: 0.85, speed: 0.35 });

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

    if (entrance === 'instant') {
      this.menuContainer.setAlpha(1).setPosition(0, 0).setAngle(0);
      return;
    }

    if (entrance === 'drop') {
      this.menuContainer.setAlpha(0).setPosition(0, -height * 0.78).setAngle(0);
      this.tweens.add({
        targets: this.menuContainer,
        alpha: 1,
        duration: 300,
        ease: 'Quad.Out',
      });
      this.tweens.add({
        targets: this.menuContainer,
        y: 0,
        duration: 620,
        ease: 'Back.Out',
        easeParams: [1.3],
        onComplete: () => {
          if (!this.menuContainer?.active) return;
          this.tweens.chain({
            targets: this.menuContainer,
            tweens: [
              { y: 7, x: 3, duration: 85, ease: 'Sine.Out' },
              { y: -5, x: -2.5, duration: 90, ease: 'Sine.InOut' },
              { y: 2, x: 1, duration: 80, ease: 'Sine.InOut' },
              { y: 0, x: 0, duration: 75, ease: 'Sine.InOut' },
            ],
          });
        },
      });
      return;
    }

    this.menuContainer.setAlpha(0).setPosition(0, 18).setAngle(0);
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
    this.tweens.killTweensOf(this.menuContainer);
    this.menuContainer.removeAll(true);
    this.menuContainer.setAlpha(0).setPosition(0, 14).setAngle(0);

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
