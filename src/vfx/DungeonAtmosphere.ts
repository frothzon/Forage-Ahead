import Phaser from 'phaser';
import { isMobileTouchDevice } from '../core/Platform';

interface DustMote {
  rect: Phaser.GameObjects.Rectangle;
  nx: number;
  ny: number;
  vx: number;
  vy: number;
  phase: number;
  sparkle: boolean;
  baseAlpha: number;
}

/**
 * Ambient decrepit dungeon dust motes & subtle sparkly air specks rendered across the viewport.
 */
export class DungeonAtmosphere {
  private readonly scene: Phaser.Scene;
  private motes: DustMote[] = [];
  private clockSec = 0;

  constructor(scene: Phaser.Scene, accentColor = 0xe8dec8, count = 34) {
    this.scene = scene;
    const effectiveCount = isMobileTouchDevice() ? Math.min(count, 18) : count;
    for (let i = 0; i < effectiveCount; i++) {
      const sparkle = i % 4 === 0;
      const size = sparkle ? 1.8 : 1.3;
      const color = sparkle ? 0xfff3b8 : accentColor;
      const baseAlpha = sparkle ? 0.55 : 0.3;
      const rect = scene.add
        .rectangle(0, 0, size, size, color, baseAlpha)
        .setScrollFactor(0)
        .setDepth(8850);
      this.motes.push({
        rect,
        nx: Math.random(),
        ny: Math.random(),
        vx: (Math.random() - 0.5) * 0.018,
        vy: -0.008 - Math.random() * 0.014,
        phase: Math.random() * Math.PI * 2,
        sparkle,
        baseAlpha,
      });
    }
  }

  public update(dtMs: number): void {
    const dt = Math.min(0.05, Math.max(0, dtMs / 1000));
    this.clockSec += dt;
    const vw = Math.max(320, this.scene.scale.width);
    const vh = Math.max(200, this.scene.scale.height);

    for (const m of this.motes) {
      m.nx = (m.nx + m.vx * dt + Math.sin(this.clockSec * 0.8 + m.phase) * 0.004 * dt + 1) % 1;
      m.ny = (m.ny + m.vy * dt + 1) % 1;
      m.rect.x = m.nx * vw;
      m.rect.y = m.ny * vh;
      const twinkle = m.sparkle
        ? Math.max(0.05, Math.sin(this.clockSec * 3.8 + m.phase) * 0.55 + 0.35)
        : 0.18 + Math.sin(this.clockSec * 1.4 + m.phase) * 0.14;
      m.rect.setAlpha(twinkle * (m.baseAlpha / 0.45));
    }
  }
}
