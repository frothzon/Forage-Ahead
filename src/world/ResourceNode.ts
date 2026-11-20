import Phaser from 'phaser';
import type { BiomeKind } from '../data/islands';
import { applyWindShader } from './WindShader';

export type NodeKind =
  | 'tree'
  | 'rock'
  | 'coal_vein'
  | 'iron_vein'
  | 'gold_vein'
  | 'crystal_vein'
  | 'obsidian_vein'
  | 'berry_bush'
  | 'dig_spot'
  | 'fish_spot';

export interface NodeDropSpec {
  itemId: string;
  min: number;
  max: number;
}

export class ResourceNode extends Phaser.GameObjects.Container {
  public readonly kind: NodeKind;
  public readonly biome: BiomeKind;
  public readonly tx: number;
  public readonly ty: number;
  public maxHp: number;
  public hp: number;
  public readonly xpReward: number;
  public readonly drops: NodeDropSpec[];
  public readonly requiredTool: 'pickaxe' | 'shovel' | 'fishing_rod' | 'any';
  public readonly solid: boolean;
  public readonly collisionOffsetY: number;
  public readonly collisionRadius: number;

  private sprite: Phaser.GameObjects.Image;
  private baseTint?: number;
  private baseScale = 1;
  private rustleCooldownMs = 0;
  private hpBarBorder?: Phaser.GameObjects.Rectangle;
  private hpBarBg?: Phaser.GameObjects.Rectangle;
  private hpBarTrail?: Phaser.GameObjects.Rectangle;
  private hpBarFill?: Phaser.GameObjects.Rectangle;
  private hpBarHighlight?: Phaser.GameObjects.Rectangle;
  private bobTween?: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene,
    tx: number,
    ty: number,
    kind: NodeKind,
    biome: BiomeKind,
  ) {
    const px = tx * 16 + 8;
    const py = ty * 16 + 8;
    super(scene, px, py);
    this.tx = tx;
    this.ty = ty;
    this.kind = kind;
    this.biome = biome;

    const cfg = ResourceNode.getConfig(kind, biome);
    this.maxHp = cfg.hp;
    this.hp = cfg.hp;
    this.xpReward = cfg.xp;
    this.drops = cfg.drops;
    this.requiredTool = cfg.tool;
    this.solid = cfg.solid;

    this.sprite = scene.add.image(0, cfg.offsetY, cfg.textureKey).setOrigin(0.5, cfg.originY);
    this.baseTint = cfg.tint;
    this.baseScale = cfg.scale ?? 1;
    if (cfg.tint) this.sprite.setTint(cfg.tint);
    if (cfg.scale) this.sprite.setScale(cfg.scale);
    this.add(this.sprite);

    // Center collision region 25% up from the bottom edge of the sprite ("feet" of the object)
    this.collisionOffsetY = cfg.solid ? cfg.offsetY + (0.75 - cfg.originY) * this.sprite.displayHeight : 0;
    this.collisionRadius = cfg.radius ?? 6;

    const phase = tx * 1.7 + ty * 2.3;
    if (kind === 'tree') {
      // Dampened sway so heavy trunks & canopies feel sturdy
      applyWindShader(this.sprite, 1.35, phase);
    } else if (kind === 'berry_bush') {
      applyWindShader(this.sprite, 2.8, phase);
    }

    if (kind === 'dig_spot' || kind === 'fish_spot') {
      this.bobTween = scene.tweens.add({
        targets: this.sprite,
        alpha: { from: 0.65, to: 1 },
        scaleX: { from: 0.9, to: 1.08 },
        scaleY: { from: 0.9, to: 1.08 },
        duration: 750,
        yoyo: true,
        repeat: -1,
      });
    }

    this.setDepth(kind === 'dig_spot' || kind === 'fish_spot' ? 4 : py + this.collisionOffsetY);
    scene.add.existing(this);
  }

  public getCollisionCenter(): { x: number; y: number } {
    return { x: this.x, y: this.y + this.collisionOffsetY };
  }

  private static getConfig(
    kind: NodeKind,
    biome: BiomeKind,
  ): {
    textureKey: string;
    hp: number;
    xp: number;
    drops: NodeDropSpec[];
    tool: 'pickaxe' | 'shovel' | 'fishing_rod' | 'any';
    solid: boolean;
    originY: number;
    offsetY: number;
    radius?: number;
    tint?: number;
    scale?: number;
  } {
    switch (kind) {
      case 'tree': {
        let textureKey = 'tileset/Tree_A1';
        let tint: number | undefined;
        if (biome === 'autumn') textureKey = 'tileset/Tree_A3';
        else if (biome === 'winter') textureKey = 'tileset/Tree_A4';
        else if (biome === 'graveyard') {
          textureKey = 'tileset/Tree_D1';
          tint = 0x8e86a8;
        } else if (biome === 'infernal') {
          textureKey = 'tileset/Tree_D3';
          tint = 0x8a4b4f;
        }
        return {
          textureKey,
          hp: biome === 'grass' ? 28 : 42,
          xp: 12,
          drops: [{ itemId: 'wood', min: 2, max: 4 }],
          tool: 'any',
          solid: true,
          originY: 0.85,
          offsetY: 6,
          radius: 11,
          tint,
        };
      }
      case 'rock':
        return {
          textureKey: 'tileset/Rock_1',
          hp: 30,
          xp: 12,
          drops: [{ itemId: 'stone', min: 2, max: 4 }],
          tool: 'any',
          solid: true,
          originY: 0.75,
          offsetY: 5,
          radius: 5.5,
        };
      case 'coal_vein':
        return {
          textureKey: 'tileset/Rock_2',
          hp: 38,
          xp: 16,
          drops: [
            { itemId: 'coal', min: 2, max: 3 },
            { itemId: 'stone', min: 1, max: 2 },
          ],
          tool: 'pickaxe',
          solid: true,
          originY: 0.75,
          offsetY: 5,
          radius: 5.5,
          tint: 0x626873,
        };
      case 'iron_vein':
        return {
          textureKey: 'tileset/Rock_3',
          hp: 48,
          xp: 20,
          drops: [
            { itemId: 'iron_ore', min: 2, max: 3 },
            { itemId: 'stone', min: 1, max: 2 },
          ],
          tool: 'pickaxe',
          solid: true,
          originY: 0.75,
          offsetY: 5,
          tint: 0xaac4db,
        };
      case 'gold_vein':
        return {
          textureKey: 'tileset/Rock_4',
          hp: 64,
          xp: 28,
          drops: [
            { itemId: 'gold_ore', min: 2, max: 3 },
            { itemId: 'coal', min: 1, max: 1 },
          ],
          tool: 'pickaxe',
          solid: true,
          originY: 0.75,
          offsetY: 5,
          tint: 0xffe066,
        };
      case 'crystal_vein':
        return {
          textureKey: 'tileset/Rock_4',
          hp: 85,
          xp: 36,
          drops: [
            { itemId: 'crystal', min: 1, max: 3 },
            { itemId: 'stone', min: 1, max: 2 },
          ],
          tool: 'pickaxe',
          solid: true,
          originY: 0.75,
          offsetY: 5,
          tint: 0x6ce5ff,
        };
      case 'obsidian_vein':
        return {
          textureKey: 'tileset/Rock_3',
          hp: 105,
          xp: 45,
          drops: [
            { itemId: 'obsidian', min: 1, max: 3 },
            { itemId: 'coal', min: 1, max: 2 },
          ],
          tool: 'pickaxe',
          solid: true,
          originY: 0.75,
          offsetY: 5,
          tint: 0x9945d6,
        };
      case 'berry_bush':
        return {
          textureKey: 'tileset/Bush_C1',
          hp: 14,
          xp: 8,
          drops: [
            { itemId: 'berries', min: 2, max: 3 },
            { itemId: 'wood', min: 1, max: 1 },
          ],
          tool: 'any',
          solid: true,
          originY: 0.75,
          offsetY: 6,
          scale: 0.85,
        };
      case 'dig_spot':
        return {
          textureKey: 'tileset/Flower_5',
          hp: 10,
          xp: 18,
          drops: [
            { itemId: 'coal', min: 1, max: 2 },
            { itemId: 'bone', min: 1, max: 2 },
          ],
          tool: 'shovel',
          solid: false,
          originY: 0.5,
          offsetY: 0,
          tint: 0xffd275,
        };
      case 'fish_spot':
        return {
          textureKey: 'tileset/Leaves_4',
          hp: 10,
          xp: 18,
          drops: [{ itemId: 'fish', min: 1, max: 2 }],
          tool: 'fishing_rod',
          solid: false,
          originY: 0.5,
          offsetY: 0,
          tint: 0x8af0ff,
        };
    }
  }

  public rustle(nowMs: number): void {
    if (!this.active || nowMs < this.rustleCooldownMs) return;
    this.rustleCooldownMs = nowMs + 550;
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: { from: this.baseScale * 1.12, to: this.baseScale },
      scaleY: { from: this.baseScale * 0.9, to: this.baseScale },
      angle: { from: -5, to: 5 },
      duration: 180,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.InOut',
      onComplete: () => {
        if (this.sprite.active) {
          this.sprite.setAngle(0);
          this.sprite.setScale(this.baseScale);
        }
      },
    });
    const leafCount = Math.random() < 0.5 ? 2 : 1;
    const leafKeys = ['extras/Leaf_particle1', 'extras/Leaf_particle2', 'extras/Leaf_particle3'];
    for (let i = 0; i < leafCount; i++) {
      const key = leafKeys[Math.floor(Math.random() * leafKeys.length)];
      const lx = this.x + Phaser.Math.Between(-5, 5);
      const ly = this.y - 6 + Phaser.Math.Between(-3, 3);
      if (this.scene.textures.exists(key)) {
        const leaf = this.scene.add.image(lx, ly, key).setDepth(this.depth + 6).setScale(0.85);
        this.scene.tweens.add({
          targets: leaf,
          x: lx + Phaser.Math.Between(-9, 9),
          y: ly + Phaser.Math.Between(6, 12),
          angle: Phaser.Math.Between(-90, 90),
          alpha: 0,
          duration: 520,
          ease: 'Sine.Out',
          onComplete: () => leaf.destroy(),
        });
      }
    }
  }

  public damage(amount: number, recoilDirX = 0): boolean {
    this.hp = Math.max(0, this.hp - amount);

    if (!this.hpBarBg) {
      this.hpBarBorder = this.scene.add.rectangle(0, -16, 19, 5, 0x070a0f).setOrigin(0.5);
      this.hpBarBg = this.scene.add.rectangle(0, -16, 17, 3.2, 0x161b22).setOrigin(0.5);
      this.hpBarTrail = this.scene.add.rectangle(-8, -16, 16, 2.2, 0xffd166).setOrigin(0, 0.5);
      this.hpBarFill = this.scene.add.rectangle(-8, -16, 16, 2.2, 0x70e070).setOrigin(0, 0.5);
      this.hpBarHighlight = this.scene.add
        .rectangle(-8, -16.6, 16, 0.8, 0xffffff, 0.35)
        .setOrigin(0, 0.5);
      this.add([this.hpBarBorder, this.hpBarBg, this.hpBarTrail, this.hpBarFill, this.hpBarHighlight]);
    }
    const ratio = this.hp / this.maxHp;
    const nextW = Math.max(1, 16 * ratio);
    const fillCol = ratio <= 0.3 ? 0xff6b6b : ratio <= 0.6 ? 0xf5c842 : 0x70e070;
    if (this.hpBarFill && this.hpBarHighlight) {
      this.hpBarFill.width = nextW;
      this.hpBarHighlight.width = nextW;
      this.hpBarFill.setFillStyle(0xffffff);
      this.scene.time.delayedCall(60, () => {
        if (this.hpBarFill?.active) this.hpBarFill.setFillStyle(fillCol);
      });
    }
    if (this.hpBarTrail) {
      this.scene.tweens.add({
        targets: this.hpBarTrail,
        width: nextW,
        delay: 130,
        duration: 210,
        ease: 'Quad.Out',
      });
    }
    const barParts = [this.hpBarBorder, this.hpBarBg, this.hpBarTrail, this.hpBarFill, this.hpBarHighlight].filter(
      (p): p is Phaser.GameObjects.Rectangle => Boolean(p),
    );
    for (const p of barParts) p.scaleY = 1.45;
    this.scene.tweens.add({
      targets: barParts,
      scaleY: 1,
      duration: 110,
      ease: 'Back.easeOut',
    });

    // 2-frame white hit-flash + elastic squash-and-stretch with horizontal recoil
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(55, () => {
      if (!this.sprite.active) return;
      if (this.baseTint) this.sprite.setTint(this.baseTint);
      else this.sprite.clearTint();
    });
    const recoilX = recoilDirX !== 0 ? Math.sign(recoilDirX) * 2.2 : (Math.random() < 0.5 ? -2 : 2);
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.x = recoilX;
    this.sprite.angle = Math.sign(recoilX) * 7;
    this.sprite.setScale(this.baseScale * 1.22, this.baseScale * 0.78);
    this.scene.tweens.add({
      targets: this.sprite,
      x: 0,
      angle: 0,
      scaleX: this.baseScale,
      scaleY: this.baseScale,
      duration: 140,
      ease: 'Elastic.Out',
      onComplete: () => {
        if (this.sprite.active) {
          this.sprite.x = 0;
          this.sprite.angle = 0;
          this.sprite.setScale(this.baseScale, this.baseScale);
        }
      },
    });

    if (this.hp <= 0) {
      this.bobTween?.stop();
      this.destroy();
      return true;
    }
    return false;
  }
}
