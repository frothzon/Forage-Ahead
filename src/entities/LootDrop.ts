import Phaser from 'phaser';
import { ITEMS, type ItemRarity } from '../data/items';
import { gameState } from '../core/GameState';
import { SFX } from '../core/SoundFX';
import { spawnRollingHarvestText } from './CombatHelpers';

const LOOT_AURA_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 outTexCoord;
uniform float uTime;
uniform vec3 uColor;
uniform float uStrength;
uniform float uBeam;

void main() {
  vec2 uv = outTexCoord;
  // Item sits near bottom-center (0.5, 0.86)
  vec2 d = vec2((uv.x - 0.5) * 1.1, (uv.y - 0.86) * 2.6);
  float dist = length(d);
  float pulse = 0.85 + 0.15 * sin(uTime * 3.4);
  float radial = clamp(1.0 - dist * 2.1, 0.0, 1.0);
  radial = radial * radial * uStrength * pulse;

  float beam = 0.0;
  if (uBeam > 0.5 && uv.y <= 0.88) {
    float dx = abs(uv.x - 0.5);
    float core = clamp(1.0 - dx * 12.0, 0.0, 1.0);
    core = core * core;
    float halo = clamp(1.0 - dx * 4.2, 0.0, 1.0);
    halo = halo * halo * 0.55;
    float heightFade = smoothstep(0.0, 0.72, uv.y) * smoothstep(0.92, 0.78, uv.y);
    float shimmer = 0.82 + 0.18 * sin(uv.y * 22.0 + uTime * 4.8);
    beam = (core * 0.95 + halo) * heightFade * shimmer * uStrength;
  }

  float alpha = clamp(radial * 0.75 + beam * 0.88, 0.0, 0.95);
  vec3 col = mix(uColor, vec3(1.0, 0.98, 0.86), clamp(beam * 0.55, 0.0, 0.7));
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

export class LootDrop extends Phaser.GameObjects.Container {
  public readonly itemId: string;
  public readonly isCoin: boolean;
  public qty: number;
  private iconObj: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  private shadowObj: Phaser.GameObjects.Image | Phaser.GameObjects.Ellipse;
  private glowRing?: Phaser.GameObjects.Arc;
  private auraShader?: Phaser.GameObjects.Shader;
  private badgeText?: Phaser.GameObjects.Text;
  private rarity: ItemRarity = 'common';
  private ageMs = 0;
  private zHeight = 2;
  private zVel = 88;
  private vx = 0;
  private vyGround = 0;
  private bouncesLeft = 3;
  private magnetState: 'idle' | 'anticipation' | 'homing' = 'idle';
  private anticipationMs = 0;
  private homingSpeed = 140;
  private curveSign = 1;
  private shimmerTimerMs = 450;
  private collected = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    itemId: string,
    count: number,
    isCoin = false,
  ) {
    super(scene, x, y);
    this.itemId = itemId;
    this.qty = count;
    this.isCoin = isCoin;
    const ang = Math.random() * Math.PI * 2;
    const spd = Phaser.Math.FloatBetween(18, 36);
    this.vx = Math.cos(ang) * spd;
    this.vyGround = Math.sin(ang) * spd * 0.55;
    this.curveSign = Math.random() < 0.5 ? -1 : 1;

    const def = ITEMS[itemId];
    const rarity: ItemRarity = isCoin ? 'common' : (def?.rarity ?? 'common');
    this.rarity = rarity;
    const isLegendary = rarity === 'epic' || rarity === 'relic';
    const isRare = rarity === 'rare';

    // Shader-driven glow (faint white, golden for rare, Diablo light-pillar for epic/relic)
    if (scene.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      const col = isLegendary
        ? { x: 1.0, y: 0.86, z: 0.30 }
        : isRare
          ? { x: 1.0, y: 0.80, z: 0.22 }
          : { x: 0.94, y: 0.97, z: 1.0 };
      const baseShader = new Phaser.Display.BaseShader('loot_aura', LOOT_AURA_FRAG, undefined, {
        uTime: { type: '1f', value: Math.random() * 6.28 },
        uColor: { type: '3f', value: col },
        uStrength: { type: '1f', value: isLegendary ? 1.0 : isRare ? 0.72 : 0.36 },
        uBeam: { type: '1f', value: isLegendary ? 1.0 : 0.0 },
      });
      this.auraShader = scene.add
        .shader(baseShader, 0, 4, 24, 64)
        .setOrigin(0.5, 0.88);
      this.add(this.auraShader);
    }

    if (isRare || isLegendary) {
      const ringCol = isLegendary ? 0xffe066 : 0x7ce8ff;
      this.glowRing = scene.add
        .circle(0, 4, isLegendary ? 8 : 6.5, ringCol, 0.14)
        .setStrokeStyle(1, ringCol, 0.45);
      this.add(this.glowRing);
    }

    if (scene.textures.exists('extras/Shadow')) {
      this.shadowObj = scene.add.image(0, 4, 'extras/Shadow').setAlpha(0.45).setScale(0.65);
    } else {
      this.shadowObj = scene.add.ellipse(0, 4, 8, 4, 0x000000, 0.35);
    }
    this.add(this.shadowObj);

    const texKey = isCoin ? 'ui_icons/coin' : def?.iconKey;
    if (texKey && scene.textures.exists(texKey)) {
      this.iconObj = scene.add.image(0, -1, texKey).setScale(0.75);
    } else {
      const hex = isCoin ? 0xffd54f : Phaser.Display.Color.HexStringToColor(def?.color ?? '#ffffff').color;
      this.iconObj = scene.add.circle(0, -1, isCoin ? 3.5 : 4, hex).setStrokeStyle(1, 0x1b1f27);
    }
    this.add(this.iconObj);

    if (count > 1) {
      this.ensureBadge(count);
    }

    this.setDepth(y);
    scene.add.existing(this);
  }

  private ensureBadge(count: number): void {
    if (this.badgeText) {
      this.badgeText.setText(`${count}`);
      return;
    }
    this.badgeText = this.scene.add
      .text(3, -7, `${count}`, {
        fontSize: '7px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
        resolution: 4,
      })
      .setOrigin(0, 0.5);
    this.add(this.badgeText);
  }

  public addCount(amount: number): void {
    if (this.collected || amount <= 0) return;
    this.qty += amount;
    if (this.qty > 1) {
      this.ensureBadge(this.qty);
    }
    this.scene.tweens.add({
      targets: this,
      scale: { from: 1.28, to: 1 },
      duration: 140,
      ease: 'Back.Out',
    });
  }

  public updateDrop(dtMs: number, playerX: number, playerY: number): boolean {
    if (this.collected) return true;
    this.ageMs += dtMs;
    if (this.auraShader) {
      this.auraShader.setUniform('uTime.value', (this.scene.time.now * 0.001) % 628.3185);
    }
    const dt = Math.min(0.05, dtMs / 1000);

    // 2.5D Parabolic Z-bounce on spawn
    if (this.bouncesLeft > 0 || this.zHeight > 0.1) {
      this.x += this.vx * dt;
      this.y += this.vyGround * dt;
      this.zVel -= 320 * dt;
      this.zHeight += this.zVel * dt;
      if (this.zHeight <= 0) {
        this.zHeight = 0;
        if (this.bouncesLeft > 0 && Math.abs(this.zVel) > 18) {
          this.zVel = -this.zVel * 0.52;
          this.vx *= 0.62;
          this.vyGround *= 0.62;
          this.bouncesLeft--;
        } else {
          this.zVel = 0;
          this.vx = 0;
          this.vyGround = 0;
          this.bouncesLeft = 0;
        }
      }
      this.iconObj.y = -1 - this.zHeight;
      const shadowScale = Math.max(0.42, 1 - this.zHeight * 0.025);
      this.shadowObj.setScale(
        this.shadowObj instanceof Phaser.GameObjects.Image ? 0.65 * shadowScale : shadowScale,
      );
      this.setDepth(this.y);
      if (this.ageMs < 240) return false;
    }

    // Idle shimmer for rare/epic/relic drops
    if (this.rarity === 'rare' || this.rarity === 'epic' || this.rarity === 'relic') {
      if (this.glowRing) {
        const pulse = 0.85 + 0.2 * Math.sin(this.ageMs * 0.006);
        this.glowRing.setScale(pulse);
      }
      this.shimmerTimerMs -= dtMs;
      if (this.shimmerTimerMs <= 0) {
        this.shimmerTimerMs = this.rarity === 'rare' ? 680 : 420;
        const col = this.rarity === 'rare' ? 0x7ce8ff : 0xffe066;
        const sp = this.scene.add
          .rectangle(
            this.x + Phaser.Math.FloatBetween(-5, 5),
            this.y - 2,
            2,
            2,
            col,
            0.9,
          )
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(this.depth + 8);
        this.scene.tweens.add({
          targets: sp,
          y: sp.y - 12,
          alpha: 0,
          scale: 0.3,
          duration: 480,
          ease: 'Sine.Out',
          onComplete: () => sp.destroy(),
        });
      }
    }

    const targetX = playerX;
    const targetY = playerY - 6;
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);
    const magnetRange = gameState.getPickupRadius();

    if (this.magnetState === 'idle' && dist < magnetRange) {
      this.magnetState = 'anticipation';
      this.anticipationMs = 70;
      this.homingSpeed = 140;
    }

    if (this.magnetState === 'anticipation') {
      this.anticipationMs -= dtMs;
      if (dist > 1) {
        // Kick slightly away from the player for anticipation
        const awayPull = 48 * dt;
        this.x -= (dx / dist) * awayPull;
        this.y -= (dy / dist) * awayPull;
      }
      if (this.anticipationMs <= 0) {
        this.magnetState = 'homing';
      }
    } else if (this.magnetState === 'homing' && dist > 1) {
      this.homingSpeed = Math.min(340, this.homingSpeed + 480 * dt);
      const nx = dx / dist;
      const ny = dy / dist;
      // Subtle perpendicular arc that tightens as distance shrinks
      const arcWeight = Math.min(0.42, dist / 90) * this.curveSign;
      const px = -ny * arcWeight;
      const py = nx * arcWeight;
      const step = this.homingSpeed * dt;
      this.x += (nx + px) * step;
      this.y += (ny + py) * step;
      this.setDepth(this.y);
    }

    if (dist < 12) {
      this.collected = true;
      const sparkCol = this.isCoin ? 0xffe066 : 0xa6ffbe;
      for (let i = 0; i < 4; i++) {
        const p = this.scene.add.circle(this.x, this.y - 2, 1.4, sparkCol, 0.9).setDepth(this.depth + 20);
        const ang = (Math.PI * 2 * i) / 4 + 0.4;
        this.scene.tweens.add({
          targets: p,
          x: this.x + Math.cos(ang) * 9,
          y: this.y - 4 + Math.sin(ang) * 7,
          alpha: 0,
          duration: 210,
          onComplete: () => p.destroy(),
        });
      }
      if (this.isCoin) {
        gameState.coins += this.qty;
        SFX.playCoin();
        spawnRollingHarvestText(this.scene, 'coins', playerX, playerY - 18, 'Coins', this.qty, '#ffe066');
        gameState.emit();
      } else {
        gameState.addItem(this.itemId, this.qty);
        SFX.playPickup();
        const label = ITEMS[this.itemId]?.name ?? this.itemId;
        spawnRollingHarvestText(this.scene, this.itemId, playerX, playerY - 18, label, this.qty, '#a6ffbe');
      }
      this.destroy();
      return true;
    }

    // Gentle hover bob
    this.iconObj.y = -2 + Math.sin(this.ageMs * 0.006) * 1.4;
    return false;
  }
}
