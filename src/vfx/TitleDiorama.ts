import Phaser from 'phaser';
import {
  computeTerrainTile,
  DIRT_BLOCK,
  resolveBlockFrame,
  type TerrainType,
} from '../world/AutoTiler';
import { ensureCleanTilesets } from '../world/TilesetCleaner';
import { applyWindShader } from '../world/WindShader';
import {
  applyCylinderWorldShader,
  projectPointOnCylinder,
  type CylinderWorldOptions,
} from './CylinderWorldShader';

const CYLINDER_OPTS: CylinderWorldOptions = {
  horizonY: 0.36,
  curvature: 0.075,
  taper: 0.42,
};

const STAGE_W = 426;
const STAGE_H = 240;
const TILE_SIZE = 16;
const GRID_W = 27; // 27 * 16 = 432 (covers 426 cleanly)
const GRID_H = 15; // 15 * 16 = 240
const MAP_PX_W = GRID_W * TILE_SIZE;
const MAP_PX_H = GRID_H * TILE_SIZE;

interface VirtualProp {
  obj: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  vx: number;
  vy: number;
  baseScale: number;
}

interface WaterGlint {
  rect: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  speedX: number;
  phase: number;
}

interface ShorelineFoam {
  rect: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  phase: number;
}

interface Butterfly {
  rect: Phaser.GameObjects.Rectangle;
  homeVx: number;
  homeVy: number;
  vx: number;
  vy: number;
  phase: number;
}

interface SkyCloud {
  sprite: Phaser.GameObjects.Image;
  u: number;
  v: number;
  speedU: number;
  baseScale: number;
}

interface SkyBird {
  sprite: Phaser.GameObjects.Sprite;
  u: number;
  vBase: number;
  v: number;
  speedU: number;
  dir: 1 | -1;
  sizeScale: number;
  flapPhase: number;
  flapSpeed: number;
}

interface ClearingSlime {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  vx: number;
  vy: number;
  startVx: number;
  startVy: number;
  targetVx: number;
  targetVy: number;
  state: 'idle' | 'wander' | 'crouch' | 'hop' | 'land';
  timer: number;
  duration: number;
  hopPeak: number;
  hopZ: number;
  breathPhase: number;
  squashX: number;
  squashY: number;
}

const SLIME_CLEARING = {
  centerVx: 66,
  centerVy: 196,
  radiusVx: 20,
  radiusVy: 12,
} as const;

export class TitleDiorama {
  private scene: Phaser.Scene;
  public readonly skyLayer: Phaser.GameObjects.Layer;
  public readonly groundLayer: Phaser.GameObjects.Layer;
  public readonly propLayer: Phaser.GameObjects.Layer;
  private skyBlurFx?: Phaser.FX.Blur;
  private groundBlurFx?: Phaser.FX.Blur;
  private propBlurFx?: Phaser.FX.Blur;
  private currentBlur = 0;

  private skyGradImg?: Phaser.GameObjects.Image;
  private sunHalo?: Phaser.GameObjects.Arc;
  private sunDisc?: Phaser.GameObjects.Arc;
  private clouds: SkyCloud[] = [];
  private skyBirds: SkyBird[] = [];

  private oceanRect?: Phaser.GameObjects.Rectangle;
  private bakedTerrainImg?: Phaser.GameObjects.Image;
  private props: VirtualProp[] = [];
  private waterGlints: WaterGlint[] = [];
  private foamDots: ShorelineFoam[] = [];
  private butterflies: Butterfly[] = [];
  private clearingSlime?: ClearingSlime;
  private bonfireGlow?: { arc: Phaser.GameObjects.Arc; vx: number; vy: number; phase: number };
  private birdSpawnTimer?: Phaser.Time.TimerEvent;

  private stageScale = 1;
  private stageOriginX = 0;
  private stageOriginY = 0;
  private viewW = 1280;
  private viewH = 720;
  private destroyed = false;

  constructor(scene: Phaser.Scene, worldDepth = 8) {
    this.scene = scene;
    this.skyLayer = scene.add.layer().setDepth(worldDepth - 2).setAlpha(0);
    this.groundLayer = scene.add.layer().setDepth(worldDepth - 1).setAlpha(0);
    this.propLayer = scene.add.layer().setDepth(worldDepth).setAlpha(0);

    this.buildSkyAndClouds();
    this.buildArchipelago();

    applyCylinderWorldShader(this.groundLayer, CYLINDER_OPTS);

    this.resize(scene.scale.width, scene.scale.height);
  }

  public setAlpha(alpha: number): this {
    this.skyLayer.setAlpha(alpha);
    this.groundLayer.setAlpha(alpha);
    this.propLayer.setAlpha(alpha);
    return this;
  }

  public setBlurStrength(strength: number): void {
    this.currentBlur = strength;
    if (!this.skyBlurFx) {
      this.skyBlurFx = this.skyLayer.postFX?.addBlur(0, 1.0, 1.0, strength);
    } else {
      this.skyBlurFx.strength = strength;
    }
    if (!this.groundBlurFx) {
      this.groundBlurFx = this.groundLayer.postFX?.addBlur(0, 1.0, 1.0, strength);
    } else {
      this.groundBlurFx.strength = strength;
    }
    if (!this.propBlurFx) {
      this.propBlurFx = this.propLayer.postFX?.addBlur(0, 1.0, 1.0, strength);
    } else {
      this.propBlurFx.strength = strength;
    }
  }

  public tweenBlur(targetStrength: number, duration: number): void {
    const proxy = { strength: this.currentBlur };
    this.setBlurStrength(this.currentBlur);
    this.scene.tweens.add({
      targets: proxy,
      strength: targetStrength,
      duration,
      ease: 'Sine.InOut',
      onUpdate: () => {
        if (!this.destroyed) {
          this.setBlurStrength(proxy.strength);
        }
      },
    });
  }

  public resize(w: number, h: number): void {
    if (this.destroyed) return;
    this.viewW = w;
    this.viewH = h;
    this.stageScale = Math.max(w / STAGE_W, h / STAGE_H);
    this.stageOriginX = w / 2 - (MAP_PX_W * this.stageScale) / 2;
    this.stageOriginY = h / 2 - (MAP_PX_H * this.stageScale) / 2;

    // Sky layer sizing
    if (this.skyGradImg) {
      this.skyGradImg.setPosition(0, 0).setDisplaySize(w, h);
    }
    const sunX = w * 0.5;
    const sunY = h * 0.35;
    const sunScale = Math.max(0.75, Math.min(w, h) / 720);
    this.sunHalo?.setPosition(sunX, sunY).setScale(sunScale);
    this.sunDisc?.setPosition(sunX, sunY).setScale(sunScale);

    // World layer sizing
    this.oceanRect
      ?.setPosition(this.stageOriginX, this.stageOriginY)
      .setScale(this.stageScale);
    this.bakedTerrainImg
      ?.setPosition(this.stageOriginX, this.stageOriginY)
      .setScale(this.stageScale);

    for (const p of this.props) {
      const proj = projectPointOnCylinder(
        this.toScreenX(p.vx),
        this.toScreenY(p.vy),
        w,
        h,
        CYLINDER_OPTS,
      );
      p.obj
        .setPosition(proj.x, proj.y)
        .setScale(p.baseScale * this.stageScale * proj.scale)
        .setRotation(proj.normalAngle)
        .setDepth(proj.y);
    }

    if (this.bonfireGlow) {
      const proj = projectPointOnCylinder(
        this.toScreenX(this.bonfireGlow.vx),
        this.toScreenY(this.bonfireGlow.vy),
        w,
        h,
        CYLINDER_OPTS,
      );
      this.bonfireGlow.arc
        .setPosition(proj.x, proj.y)
        .setScale(this.stageScale * proj.scale)
        .setDepth(proj.y - 1);
    }

    this.updateAmbientPositions(0);
  }

  public update(dtSec: number): void {
    if (this.destroyed) return;
    this.updateAmbientPositions(dtSec);
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.birdSpawnTimer?.remove(false);
    this.birdSpawnTimer = undefined;
    for (const b of this.skyBirds) b.sprite.destroy();
    this.skyBirds = [];
    this.clouds = [];
    this.waterGlints = [];
    this.foamDots = [];
    this.butterflies = [];
    this.props = [];
    this.clearingSlime = undefined;
    this.skyLayer.destroy(true);
    this.groundLayer.destroy(true);
    this.propLayer.destroy(true);
  }

  private toScreenX(vx: number): number {
    return this.stageOriginX + vx * this.stageScale;
  }

  private toScreenY(vy: number): number {
    return this.stageOriginY + vy * this.stageScale;
  }

  private ensureSkyTextures(): void {
    if (!this.scene.textures.exists('title_sky_grad')) {
      const tex = this.scene.textures.createCanvas('title_sky_grad', 1, 240);
      if (tex) {
        const ctx = tex.getContext();
        const grad = ctx.createLinearGradient(0, 0, 0, 240);
        grad.addColorStop(0.0, '#23487d');
        grad.addColorStop(0.28, '#597cb8');
        grad.addColorStop(0.65, '#e09488');
        grad.addColorStop(1.0, '#ffe49e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1, 240);
        tex.refresh();
      }
    }

    if (!this.scene.textures.exists('title_cloud_0')) {
      const shapes: Array<{
        w: number;
        h: number;
        puffs: Array<[number, number, number]>;
      }> = [
        {
          w: 64,
          h: 24,
          puffs: [
            [18, 15, 8],
            [30, 11, 11],
            [44, 14, 9],
            [54, 17, 6],
            [10, 17, 6],
          ],
        },
        {
          w: 52,
          h: 22,
          puffs: [
            [14, 14, 7],
            [26, 10, 10],
            [38, 13, 8],
          ],
        },
        {
          w: 76,
          h: 26,
          puffs: [
            [14, 18, 7],
            [27, 13, 10],
            [42, 11, 12],
            [57, 14, 9],
            [66, 18, 6],
          ],
        },
      ];

      shapes.forEach((shape, idx) => {
        const tex = this.scene.textures.createCanvas(`title_cloud_${idx}`, shape.w, shape.h);
        if (!tex) return;
        const ctx = tex.getContext();
        ctx.imageSmoothingEnabled = false;

        // Lavender-violet underside
        ctx.fillStyle = '#9e8cb8';
        for (const [cx, cy, r] of shape.puffs) {
          ctx.beginPath();
          ctx.arc(cx, cy + 2, r, 0, Math.PI * 2);
          ctx.fill();
        }
        // Peach midtone
        ctx.fillStyle = '#f0beaa';
        for (const [cx, cy, r] of shape.puffs) {
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2);
          ctx.fill();
        }
        // Sunlit cream top
        ctx.fillStyle = '#fff5dc';
        for (const [cx, cy, r] of shape.puffs) {
          ctx.beginPath();
          ctx.arc(cx - 1, cy - 2, r * 0.72, 0, Math.PI * 2);
          ctx.fill();
        }
        tex.refresh();
      });
    }
  }

  private buildSkyAndClouds(): void {
    this.ensureSkyTextures();

    if (this.scene.textures.exists('title_sky_grad')) {
      this.skyGradImg = this.scene.add
        .image(0, 0, 'title_sky_grad')
        .setOrigin(0, 0)
        .setDepth(0);
      this.skyLayer.add(this.skyGradImg);
    }

    this.sunHalo = this.scene.add.circle(0, 0, 52, 0xffe49e, 0.24).setDepth(1);
    this.sunDisc = this.scene.add.circle(0, 0, 24, 0xfff6d1, 0.86).setDepth(1.5);
    this.skyLayer.add([this.sunHalo, this.sunDisc]);

    const cloudSpecs = [
      { key: 'title_cloud_2', u: 0.16, v: 0.12, speed: 0.008, scale: 2.3, alpha: 0.82 },
      { key: 'title_cloud_0', u: 0.48, v: 0.08, speed: 0.006, scale: 1.9, alpha: 0.75 },
      { key: 'title_cloud_1', u: 0.8, v: 0.16, speed: 0.01, scale: 2.1, alpha: 0.84 },
      { key: 'title_cloud_0', u: 0.31, v: 0.24, speed: 0.012, scale: 1.6, alpha: 0.68 },
    ];
    for (const c of cloudSpecs) {
      if (!this.scene.textures.exists(c.key)) continue;
      const sprite = this.scene.add
        .image(0, 0, c.key)
        .setAlpha(c.alpha)
        .setDepth(2);
      this.skyLayer.add(sprite);
      this.clouds.push({
        sprite,
        u: c.u,
        v: c.v,
        speedU: c.speed,
        baseScale: c.scale,
      });
    }

    // Periodic flying sky birds above the 3D cylinder horizon
    this.scene.time.delayedCall(350, () => {
      if (!this.destroyed) this.spawnBirdFlock();
    });
    this.scheduleNextBirdFlock();
  }

  private resolveSourceImage(
    preferredKey: string,
    fallbackKey: string,
  ): HTMLImageElement | HTMLCanvasElement | null {
    const key = this.scene.textures.exists(preferredKey) ? preferredKey : fallbackKey;
    if (!this.scene.textures.exists(key)) return null;
    return this.scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  }

  private bakeTerrainTexture(
    grid: TerrainType[][],
    dirtMask: boolean[][],
  ): string | null {
    const key = 'diorama_terrain_baked';
    if (this.scene.textures.exists(key)) {
      this.scene.textures.remove(key);
    }
    const tex = this.scene.textures.createCanvas(key, MAP_PX_W, MAP_PX_H);
    if (!tex) return null;
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, MAP_PX_W, MAP_PX_H);

    const sources: Record<string, HTMLImageElement | HTMLCanvasElement | null> = {
      tileset_grass: this.resolveSourceImage('tileset_grass', 'tileset_grass'),
      tileset_coastlines: this.resolveSourceImage('tileset_coastlines_clean', 'tileset_coastlines'),
      tileset_autumn: this.resolveSourceImage('tileset_autumn_clean', 'tileset_autumn'),
      tileset_winter: this.resolveSourceImage('tileset_winter_clean', 'tileset_winter'),
      tileset_dirt: this.resolveSourceImage('tileset_dirt', 'tileset_dirt'),
    };

    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const placement = computeTerrainTile(grid, x, y);
        if (placement) {
          const srcImg = sources[placement.tilesetKey];
          if (srcImg) {
            const cols = Math.max(1, Math.floor(srcImg.width / TILE_SIZE));
            const col = placement.frame % cols;
            const row = Math.floor(placement.frame / cols);
            ctx.drawImage(
              srcImg,
              col * TILE_SIZE,
              row * TILE_SIZE,
              TILE_SIZE,
              TILE_SIZE,
              x * TILE_SIZE,
              y * TILE_SIZE,
              TILE_SIZE,
              TILE_SIZE,
            );
          }
        }

        if (dirtMask[y][x] && sources.tileset_dirt) {
          const hasN = y > 0 && dirtMask[y - 1][x];
          const hasE = x + 1 < GRID_W && dirtMask[y][x + 1];
          const hasS = y + 1 < GRID_H && dirtMask[y + 1][x];
          const hasW = x > 0 && dirtMask[y][x - 1];
          const dFrame = resolveBlockFrame(DIRT_BLOCK, hasN, hasE, hasS, hasW);
          const dirtImg = sources.tileset_dirt;
          const cols = Math.max(1, Math.floor(dirtImg.width / TILE_SIZE));
          const col = dFrame % cols;
          const row = Math.floor(dFrame / cols);
          ctx.drawImage(
            dirtImg,
            col * TILE_SIZE,
            row * TILE_SIZE,
            TILE_SIZE,
            TILE_SIZE,
            x * TILE_SIZE,
            y * TILE_SIZE,
            TILE_SIZE,
            TILE_SIZE,
          );
        }
      }
    }

    tex.refresh();
    return key;
  }

  private buildArchipelago(): void {
    ensureCleanTilesets(this.scene);

    const grid: TerrainType[][] = Array.from({ length: GRID_H }, () =>
      Array.from({ length: GRID_W }, () => 'water' as TerrainType),
    );
    const dirtMask: boolean[][] = Array.from({ length: GRID_H }, () =>
      Array.from({ length: GRID_W }, () => false),
    );

    const paintEllipse = (
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      terrain: TerrainType,
    ) => {
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          const dx = (x - cx) / rx;
          const dy = (y - cy) / ry;
          if (dx * dx + dy * dy <= 1.0) {
            grid[y][x] = terrain;
          }
        }
      }
    };

    // 1. Main Left-Foreground Grassland Island (prominent beside File Select)
    paintEllipse(3.2, 11.2, 5.2, 4.1, 'grass');
    paintEllipse(5.5, 9.8, 2.4, 2.1, 'grass');

    // Warm dirt clearing in left-foreground (columns 2..5, rows 11..13)
    for (let y = 11; y <= 13; y++) {
      for (let x = 2; x <= 5; x++) {
        if (grid[y][x] === 'grass') dirtMask[y][x] = true;
      }
    }

    // 2. Right-Side Autumn / Desert Island
    paintEllipse(23.5, 9.4, 4.2, 3.6, 'autumn');

    // 3. Upper-Left Distant Grassland Islet
    paintEllipse(4.2, 3.0, 2.8, 1.8, 'grass');

    // 4. Upper-Right Distant Winter Islet
    paintEllipse(22.2, 2.6, 3.0, 1.7, 'winter');

    // Seamless turquoise ocean backdrop
    this.oceanRect = this.scene.add
      .rectangle(0, 0, MAP_PX_W, MAP_PX_H, 0x2d86b8)
      .setOrigin(0, 0)
      .setDepth(0);
    this.groundLayer.add(this.oceanRect);

    // Baked zero-seam terrain image
    const bakedKey = this.bakeTerrainTexture(grid, dirtMask);
    if (bakedKey) {
      this.bakedTerrainImg = this.scene.add
        .image(0, 0, bakedKey)
        .setOrigin(0, 0)
        .setDepth(1);
      this.groundLayer.add(this.bakedTerrainImg);
    }

    // Shoreline foam along south edges
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (grid[y][x] !== 'water' && y + 1 < GRID_H && grid[y + 1][x] === 'water') {
          this.spawnShorelineFoam(x * TILE_SIZE + 8, (y + 1) * TILE_SIZE + 1, x * 0.7 + y);
        }
      }
    }

    // Sparkling ocean glints
    for (let i = 0; i < 24; i++) {
      const vx = Phaser.Math.FloatBetween(12, MAP_PX_W - 12);
      const vy = Phaser.Math.FloatBetween(10, MAP_PX_H - 10);
      const tx = Math.floor(vx / TILE_SIZE);
      const ty = Math.floor(vy / TILE_SIZE);
      if (grid[ty]?.[tx] !== 'water') continue;
      const w = Phaser.Math.Between(3, 6);
      const rect = this.scene.add
        .rectangle(0, 0, w, 1.5, i % 3 === 0 ? 0xffffff : 0x9ee6ff, 0.55)
        .setDepth(0.5);
      this.groundLayer.add(rect);
      this.waterGlints.push({
        rect,
        vx,
        vy,
        speedX: Phaser.Math.FloatBetween(2.2, 4.5),
        phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      });
    }

    // Real in-game props (trees, bushes, rocks, bonfire)
    this.addStaticProp('tileset/Tree_A1', 28, 138, 0.85, 4, true);
    this.addStaticProp('tileset/Tree_A1', 86, 136, 0.85, 4, true);
    this.addStaticProp('tileset/Bush_C1', 18, 178, 0.75, 4, true);
    this.addStaticProp('tileset/Bush_C1', 102, 208, 0.75, 4, true);
    this.addStaticProp('tileset/Rock_1', 34, 224, 0.75, 3.5, false);

    // Upper-left islet props
    this.addStaticProp('tileset/Tree_A1', 54, 46, 0.85, 4, true);
    this.addStaticProp('tileset/Bush_C1', 80, 54, 0.75, 4, true);

    // Right-side Autumn island props
    this.addStaticProp('tileset/Tree_A3', 362, 128, 0.85, 4, true);
    this.addStaticProp('tileset/Tree_A3', 398, 144, 0.85, 4, true);
    this.addStaticProp('tileset/Rock_2', 348, 162, 0.75, 3.5, false);
    this.addStaticProp('tileset/Rock_3', 386, 180, 0.75, 3.5, false);

    // Upper-right Winter islet props
    this.addStaticProp('tileset/Tree_A4', 342, 38, 0.85, 4, true);
    this.addStaticProp('tileset/Rock_3', 368, 48, 0.75, 3.5, false);

    // Crackling Bonfire + subtle warm glow on left grassland
    if (this.scene.textures.exists('extras/Bonfire')) {
      const glow = this.scene.add.circle(0, 0, 22, 0xffb84d, 0.22).setDepth(3);
      this.propLayer.add(glow);
      this.bonfireGlow = { arc: glow, vx: 102, vy: 156, phase: 0 };

      const fire = this.scene.add
        .sprite(0, 0, 'extras/Bonfire', 0)
        .setOrigin(0.5, 0.75)
        .setDepth(4);
      if (this.scene.anims.exists('prop_bonfire')) {
        fire.play('prop_bonfire');
      }
      this.propLayer.add(fire);
      this.props.push({ obj: fire, vx: 102, vy: 160, baseScale: 1 });
    }

    // Wandering & Hopping Slime in the left dirt clearing
    this.spawnClearingSlime();

    // Ambient tiny butterflies near grassland bushes
    const bColors = [0xffe596, 0x9ee6ff];
    [
      { vx: 22, vy: 166 },
      { vx: 98, vy: 196 },
    ].forEach((spot, idx) => {
      const rect = this.scene.add.rectangle(0, 0, 2, 2, bColors[idx % bColors.length], 0.9).setDepth(6);
      this.propLayer.add(rect);
      this.butterflies.push({
        rect,
        homeVx: spot.vx,
        homeVy: spot.vy,
        vx: spot.vx,
        vy: spot.vy,
        phase: idx * 2.1,
      });
    });
  }

  private addStaticProp(
    textureKey: string,
    vx: number,
    vy: number,
    originY: number,
    depth: number,
    windSway: boolean,
  ): void {
    if (!this.scene.textures.exists(textureKey)) return;
    const img = this.scene.add.image(0, 0, textureKey).setOrigin(0.5, originY).setDepth(depth);
    if (windSway) {
      applyWindShader(img, 1.4, (vx + vy) * 0.05);
    }
    this.propLayer.add(img);
    this.props.push({ obj: img, vx, vy, baseScale: 1 });
  }

  private spawnShorelineFoam(vx: number, vy: number, phase: number): void {
    const baseW = Phaser.Math.Between(6, 11);
    const rect = this.scene.add.rectangle(0, 0, baseW, 1.5, 0xe8fbff, 0.45).setDepth(0.8);
    this.groundLayer.add(rect);
    this.foamDots.push({ rect, vx, vy, phase });
  }

  private ensureBirdTextures(): void {
    if (this.scene.textures.exists('title_bird_0')) return;
    const frames: string[][] = [
      ['11............11', '..11........11..', '....11....11....', '......1111......'],
      ['................', '111..........111', '...1111111111...', '......1111......'],
      ['......1111......', '....11....11....', '..11........11..', '11............11'],
    ];
    frames.forEach((rows, idx) => {
      const tex = this.scene.textures.createCanvas(`title_bird_${idx}`, 16, 6);
      if (!tex) return;
      const ctx = tex.getContext();
      ctx.fillStyle = '#ffffff';
      for (let y = 0; y < rows.length; y++) {
        for (let x = 0; x < rows[y].length; x++) {
          if (rows[y][x] === '1') ctx.fillRect(x, y + 1, 1, 1);
        }
      }
      tex.refresh();
    });
  }

  private scheduleNextBirdFlock(): void {
    this.birdSpawnTimer?.remove(false);
    this.birdSpawnTimer = this.scene.time.delayedCall(Phaser.Math.Between(3500, 7000), () => {
      if (this.destroyed) return;
      this.spawnBirdFlock();
      this.scheduleNextBirdFlock();
    });
  }

  private spawnBirdFlock(): void {
    if (this.destroyed) return;
    this.ensureBirdTextures();
    if (!this.scene.textures.exists('title_bird_0')) return;

    const count = Phaser.Math.Between(2, 4);
    const dir: 1 | -1 = Math.random() < 0.78 ? 1 : -1;
    const flockV = Phaser.Math.FloatBetween(0.08, 0.27);
    const palette = [0x4e3d56, 0x634d66, 0x3f344d];

    for (let i = 0; i < count; i++) {
      const sprite = this.scene.add
        .sprite(0, 0, 'title_bird_0')
        .setDepth(4)
        .setTint(Phaser.Utils.Array.GetRandom(palette))
        .setAlpha(0.86);
      this.skyLayer.add(sprite);

      const uOffset = i * Phaser.Math.FloatBetween(0.02, 0.04);
      const vBase = Phaser.Math.Clamp(flockV + Phaser.Math.FloatBetween(-0.025, 0.025), 0.07, 0.3);
      this.skyBirds.push({
        sprite,
        u: dir === 1 ? -0.04 - uOffset : 1.04 + uOffset,
        vBase,
        v: vBase,
        speedU: Phaser.Math.FloatBetween(0.038, 0.062),
        dir,
        sizeScale: Phaser.Math.FloatBetween(0.85, 1.35),
        flapPhase: Phaser.Math.FloatBetween(0, Math.PI * 2),
        flapSpeed: Phaser.Math.FloatBetween(6.5, 9.5),
      });
    }
  }

  private randomClearingPoint(): { vx: number; vy: number } {
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const r = Math.sqrt(Math.random());
    return {
      vx: SLIME_CLEARING.centerVx + Math.cos(angle) * r * SLIME_CLEARING.radiusVx,
      vy: SLIME_CLEARING.centerVy + Math.sin(angle) * r * SLIME_CLEARING.radiusVy,
    };
  }

  private spawnClearingSlime(): void {
    if (!this.scene.textures.exists('monsters/Slime/Slime_idle')) return;
    const shadow = this.scene.add.ellipse(0, 0, 12, 5, 0x2a1c0e, 0.34).setDepth(4.5);
    const sprite = this.scene.add
      .sprite(0, 0, 'monsters/Slime/Slime_idle', 0)
      .setOrigin(0.5, 0.72)
      .setDepth(5);
    if (this.scene.anims.exists('mon_Slime_idle_down')) {
      sprite.play('mon_Slime_idle_down');
    }
    this.groundLayer.add(shadow);
    this.propLayer.add(sprite);

    this.clearingSlime = {
      sprite,
      shadow,
      vx: SLIME_CLEARING.centerVx,
      vy: SLIME_CLEARING.centerVy,
      startVx: SLIME_CLEARING.centerVx,
      startVy: SLIME_CLEARING.centerVy,
      targetVx: SLIME_CLEARING.centerVx,
      targetVy: SLIME_CLEARING.centerVy,
      state: 'idle',
      timer: 0,
      duration: Phaser.Math.FloatBetween(0.9, 1.8),
      hopPeak: 9,
      hopZ: 0,
      breathPhase: 0,
      squashX: 1,
      squashY: 1,
    };
  }

  private updateAmbientPositions(dt: number): void {
    const skyScale = Math.max(0.7, this.viewW / 1280);

    // Drifting clouds in skyLayer
    for (const c of this.clouds) {
      c.u += c.speedU * dt;
      if (c.u > 1.12) c.u = -0.12;
      c.sprite
        .setPosition(c.u * this.viewW, c.v * this.viewH)
        .setScale(c.baseScale * skyScale);
    }

    // Flying sky birds in skyLayer
    for (let i = this.skyBirds.length - 1; i >= 0; i--) {
      const b = this.skyBirds[i];
      b.u += b.dir * b.speedU * dt;
      b.flapPhase += b.flapSpeed * dt;
      b.v = b.vBase + Math.sin(b.flapPhase * 0.45) * 0.006;

      if ((b.dir === 1 && b.u > 1.06) || (b.dir === -1 && b.u < -0.06)) {
        b.sprite.destroy();
        this.skyBirds.splice(i, 1);
        continue;
      }

      const wave = Math.sin(b.flapPhase);
      const frameIdx = wave > 0.35 ? 0 : wave < -0.35 ? 2 : 1;
      const frameKey = `title_bird_${frameIdx}`;
      if (b.sprite.texture.key !== frameKey && this.scene.textures.exists(frameKey)) {
        b.sprite.setTexture(frameKey);
      }
      b.sprite
        .setPosition(b.u * this.viewW, b.v * this.viewH)
        .setScale(b.sizeScale * skyScale);
    }

    // Water glints
    for (const g of this.waterGlints) {
      g.vx += g.speedX * dt;
      g.phase += dt * 2.5;
      if (g.vx > MAP_PX_W + 8) g.vx = -8;
      g.rect
        .setPosition(this.toScreenX(g.vx), this.toScreenY(g.vy))
        .setScale(this.stageScale)
        .setAlpha(0.28 + 0.32 * (0.5 + 0.5 * Math.sin(g.phase)));
    }

    // Shoreline foam
    for (const f of this.foamDots) {
      f.phase += dt * 2.4;
      const pulse = 0.5 + 0.5 * Math.sin(f.phase);
      f.rect
        .setPosition(this.toScreenX(f.vx), this.toScreenY(f.vy + pulse * 0.8))
        .setScale(this.stageScale * (0.85 + pulse * 0.25), this.stageScale)
        .setAlpha(0.25 + pulse * 0.35);
    }

    // Bonfire glow (projected upright on propLayer)
    if (this.bonfireGlow) {
      this.bonfireGlow.phase += dt * 7.5;
      const flicker = 0.88 + 0.14 * Math.sin(this.bonfireGlow.phase);
      const proj = projectPointOnCylinder(
        this.toScreenX(this.bonfireGlow.vx),
        this.toScreenY(this.bonfireGlow.vy),
        this.viewW,
        this.viewH,
        CYLINDER_OPTS,
      );
      this.bonfireGlow.arc
        .setPosition(proj.x, proj.y)
        .setScale(this.stageScale * proj.scale * flicker)
        .setDepth(proj.y - 1)
        .setAlpha(0.18 + 0.08 * Math.sin(this.bonfireGlow.phase * 1.3));
    }

    // Butterflies (projected upright on propLayer)
    for (const bf of this.butterflies) {
      bf.phase += dt * 3.4;
      bf.vx = bf.homeVx + Math.sin(bf.phase * 0.7) * 9;
      bf.vy = bf.homeVy + Math.cos(bf.phase * 1.1) * 5;
      const proj = projectPointOnCylinder(
        this.toScreenX(bf.vx),
        this.toScreenY(bf.vy),
        this.viewW,
        this.viewH,
        CYLINDER_OPTS,
      );
      bf.rect
        .setPosition(proj.x, proj.y)
        .setScale(this.stageScale * proj.scale * (0.8 + 0.4 * Math.abs(Math.sin(bf.phase * 3))))
        .setRotation(proj.normalAngle)
        .setDepth(proj.y + 5);
    }

    // Clearing Slime
    const slime = this.clearingSlime;
    if (slime) {
      slime.timer += dt;
      slime.breathPhase += dt * 4.2;

      if (slime.state === 'idle') {
        slime.hopZ = 0;
        slime.squashX = 1 + Math.sin(slime.breathPhase) * 0.06;
        slime.squashY = 1 - Math.sin(slime.breathPhase) * 0.05;
        if (slime.timer >= slime.duration) {
          slime.timer = 0;
          const pt = this.randomClearingPoint();
          slime.startVx = slime.vx;
          slime.startVy = slime.vy;
          slime.targetVx = pt.vx;
          slime.targetVy = pt.vy;
          if (Math.random() < 0.45) {
            slime.state = 'crouch';
            slime.duration = 0.14;
            slime.hopPeak = Phaser.Math.FloatBetween(7, 11);
          } else {
            slime.state = 'wander';
            slime.duration = Phaser.Math.FloatBetween(0.9, 1.8);
            const dirAnim = slime.targetVx < slime.vx ? 'mon_Slime_walk_left' : 'mon_Slime_walk_right';
            if (this.scene.anims.exists(dirAnim)) slime.sprite.play(dirAnim, true);
          }
        }
      } else if (slime.state === 'wander') {
        const p = Math.min(1, slime.timer / Math.max(0.01, slime.duration));
        slime.vx = Phaser.Math.Linear(slime.startVx, slime.targetVx, p);
        slime.vy = Phaser.Math.Linear(slime.startVy, slime.targetVy, p);
        slime.hopZ = 0;
        slime.squashX = 1 + Math.sin(slime.breathPhase * 1.8) * 0.05;
        slime.squashY = 1 - Math.sin(slime.breathPhase * 1.8) * 0.05;
        if (p >= 1) {
          slime.timer = 0;
          if (Math.random() < 0.42) {
            const pt = this.randomClearingPoint();
            slime.startVx = slime.vx;
            slime.startVy = slime.vy;
            slime.targetVx = pt.vx;
            slime.targetVy = pt.vy;
            slime.state = 'crouch';
            slime.duration = 0.14;
            slime.hopPeak = Phaser.Math.FloatBetween(7, 11);
          } else {
            slime.state = 'idle';
            slime.duration = Phaser.Math.FloatBetween(0.8, 2.0);
            if (this.scene.anims.exists('mon_Slime_idle_down')) {
              slime.sprite.play('mon_Slime_idle_down', true);
            }
          }
        }
      } else if (slime.state === 'crouch') {
        const p = Math.min(1, slime.timer / slime.duration);
        slime.hopZ = 0;
        slime.squashX = Phaser.Math.Linear(1, 1.22, p);
        slime.squashY = Phaser.Math.Linear(1, 0.78, p);
        if (p >= 1) {
          slime.state = 'hop';
          slime.timer = 0;
          slime.duration = 0.48;
          const dirAnim = slime.targetVx < slime.vx ? 'mon_Slime_walk_left' : 'mon_Slime_walk_right';
          if (this.scene.anims.exists(dirAnim)) slime.sprite.play(dirAnim, true);
        }
      } else if (slime.state === 'hop') {
        const p = Math.min(1, slime.timer / slime.duration);
        slime.vx = Phaser.Math.Linear(slime.startVx, slime.targetVx, p);
        slime.vy = Phaser.Math.Linear(slime.startVy, slime.targetVy, p);
        slime.hopZ = 4 * slime.hopPeak * p * (1 - p);
        slime.squashX = 0.86;
        slime.squashY = 1.16;
        if (p >= 1) {
          slime.state = 'land';
          slime.timer = 0;
          slime.duration = 0.18;
          slime.hopZ = 0;
        }
      } else if (slime.state === 'land') {
        const p = Math.min(1, slime.timer / slime.duration);
        slime.hopZ = 0;
        slime.squashX = Phaser.Math.Linear(1.24, 1, p);
        slime.squashY = Phaser.Math.Linear(0.76, 1, p);
        if (p >= 1) {
          slime.state = 'idle';
          slime.timer = 0;
          slime.duration = Phaser.Math.FloatBetween(0.9, 2.0);
          slime.squashX = 1;
          slime.squashY = 1;
          if (this.scene.anims.exists('mon_Slime_idle_down')) {
            slime.sprite.play('mon_Slime_idle_down', true);
          }
        }
      }

      const sx = this.toScreenX(slime.vx);
      const sy = this.toScreenY(slime.vy);
      const airRatio = slime.hopPeak > 0 ? Math.min(1, slime.hopZ / slime.hopPeak) : 0;

      slime.shadow
        .setPosition(sx, sy + 1.5 * this.stageScale)
        .setScale(this.stageScale * (1 - 0.35 * airRatio))
        .setAlpha(0.34 * (1 - 0.35 * airRatio));

      const proj = projectPointOnCylinder(sx, sy, this.viewW, this.viewH, CYLINDER_OPTS);
      const baseSlimeScale = 1.05 * this.stageScale * proj.scale;
      slime.sprite
        .setPosition(proj.x, proj.y - slime.hopZ * this.stageScale * proj.scale)
        .setScale(baseSlimeScale * slime.squashX, baseSlimeScale * slime.squashY)
        .setRotation(proj.normalAngle)
        .setDepth(proj.y);
    }
  }
}
