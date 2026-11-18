import Phaser from 'phaser';
import { ITEMS, type ItemRarity } from '../data/items';
import { gameState } from '../core/GameState';
import { SFX } from '../core/SoundFX';

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
  private auraShader?: Phaser.GameObjects.Shader;
  private badgeText?: Phaser.GameObjects.Text;
  private ageMs = 0;
  private vy = -38;
  private vx = 0;
  private zHeight = 2;
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
    this.vx = Phaser.Math.Between(-28, 28);

    const def = ITEMS[itemId];
    const rarity: ItemRarity = isCoin ? 'common' : (def?.rarity ?? 'common');
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

    const shadow = scene.add.ellipse(0, 4, 8, 4, 0x000000, 0.35);
    this.add(shadow);

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
    const dt = dtMs / 1000;

    // Short pop-out bounce on spawn
    if (this.ageMs < 380) {
      this.x += this.vx * dt;
      this.zHeight += -this.vy * dt * 0.5;
      this.vy += 180 * dt;
      if (this.zHeight < 0) this.zHeight = 0;
      this.iconObj.y = -1 - this.zHeight * 0.4;
      return false;
    }

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);
    const magnetRange = gameState.getPickupRadius();

    if (dist < magnetRange && dist > 1) {
      const pull = 165 * dt;
      this.x += (dx / dist) * pull;
      this.y += (dy / dist) * pull;
      this.setDepth(this.y);
    }

    if (dist < 13) {
      this.collected = true;
      if (this.isCoin) {
        gameState.coins += this.qty;
        SFX.playCoin();
        gameState.emit();
      } else {
        gameState.addItem(this.itemId, this.qty);
        SFX.playPickup();
      }
      this.destroy();
      return true;
    }

    // Gentle hover bob
    this.iconObj.y = -2 + Math.sin(this.ageMs * 0.006) * 1.4;
    return false;
  }
}
