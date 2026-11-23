import Phaser from 'phaser';
import { isMobileTouchDevice } from '../core/Platform';
import type { BiomeKind } from '../data/islands';

type CritterKind = 'butterfly' | 'firefly' | 'ash';

interface Critter {
  obj: Phaser.GameObjects.Rectangle;
  kind: CritterKind;
  vx: number;
  vy: number;
  phase: number;
  lifeMs: number;
  maxLifeMs: number;
}

/**
 * Spawns lightweight non-colliding ambient critters (butterflies in Grass/Autumn,
 * fireflies at Night, drifting ash sparks in Infernal) that scatter when the player dashes nearby.
 */
export class AmbientCritterSystem {
  private readonly scene: Phaser.Scene;
  private readonly critters: Critter[] = [];
  private spawnTimerMs = 400;
  private readonly maxCritters = isMobileTouchDevice() ? 10 : 18;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public update(
    dtMs: number,
    playerX: number,
    playerY: number,
    playerDashing: boolean,
    biome: BiomeKind,
    nightFactor: number,
  ): void {
    const dt = Math.min(0.05, dtMs / 1000);
    this.spawnTimerMs -= dtMs;

    if (this.spawnTimerMs <= 0 && this.critters.length < this.maxCritters) {
      this.spawnTimerMs = 520;
      const kind = this.pickKind(biome, nightFactor);
      if (kind) {
        this.spawnNear(playerX, playerY, kind);
      }
    }

    for (let i = this.critters.length - 1; i >= 0; i--) {
      const c = this.critters[i];
      c.lifeMs += dtMs;
      if (c.lifeMs >= c.maxLifeMs || !c.obj.active) {
        if (c.obj.active) c.obj.destroy();
        this.critters.splice(i, 1);
        continue;
      }

      const dx = c.obj.x - playerX;
      const dy = c.obj.y - playerY;
      const distSq = dx * dx + dy * dy;
      if (playerDashing && distSq < 54 * 54 && distSq > 0.25) {
        const dist = Math.sqrt(distSq);
        c.vx += (dx / dist) * 140 * dt;
        c.vy += (dy / dist) * 140 * dt;
      }

      const t = c.lifeMs * 0.004 + c.phase;
      if (c.kind === 'butterfly') {
        c.obj.x += (c.vx + Math.sin(t * 2.2) * 14) * dt;
        c.obj.y += (c.vy + Math.cos(t * 3.4) * 10) * dt;
        c.obj.setScale(0.75 + Math.abs(Math.sin(t * 9)) * 0.5, 1);
      } else if (c.kind === 'firefly') {
        c.obj.x += (c.vx + Math.sin(t * 1.6) * 9) * dt;
        c.obj.y += (c.vy + Math.cos(t * 1.9) * 8) * dt;
        c.obj.setAlpha(0.35 + 0.65 * Math.abs(Math.sin(t * 2.8)));
      } else {
        c.obj.x += (c.vx + Math.sin(t * 1.3) * 12) * dt;
        c.obj.y += (c.vy - 12) * dt;
      }

      if (c.lifeMs > c.maxLifeMs - 500) {
        c.obj.setAlpha(Math.max(0, (c.maxLifeMs - c.lifeMs) / 500));
      }
      c.obj.setDepth(c.obj.y + 24);
    }
  }

  private pickKind(biome: BiomeKind, nightFactor: number): CritterKind | null {
    if (biome === 'infernal') return 'ash';
    if (nightFactor >= 0.48) return 'firefly';
    if (biome === 'grass' || biome === 'autumn') return 'butterfly';
    return null;
  }

  private spawnNear(px: number, py: number, kind: CritterKind): void {
    const x = px + Phaser.Math.Between(-150, 150);
    const y = py + Phaser.Math.Between(-95, 95);
    let color = 0xffe066;
    let size = 2.2;
    if (kind === 'butterfly') {
      const palette = [0xffe066, 0x7ce8ff, 0xff9ec4, 0xffffff];
      color = palette[Math.floor(Math.random() * palette.length)];
      size = 2.4;
    } else if (kind === 'firefly') {
      color = 0xb8ff78;
      size = 2.0;
    } else {
      color = Math.random() < 0.5 ? 0xff7b47 : 0xffc86b;
      size = 1.8;
    }

    const obj = this.scene.add.rectangle(x, y, size, size, color).setDepth(y + 24);
    if (kind === 'firefly' || kind === 'ash') {
      obj.setBlendMode(Phaser.BlendModes.ADD);
    }
    this.critters.push({
      obj,
      kind,
      vx: Phaser.Math.FloatBetween(-10, 10),
      vy: Phaser.Math.FloatBetween(-8, 8),
      phase: Math.random() * Math.PI * 2,
      lifeMs: 0,
      maxLifeMs: Phaser.Math.Between(3500, 6200),
    });
  }

  public destroy(): void {
    for (const c of this.critters) {
      if (c.obj.active) c.obj.destroy();
    }
    this.critters.length = 0;
  }
}
