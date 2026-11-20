import Phaser from 'phaser';
import { SFX } from '../core/SoundFX';
import type { DungeonPropSpec } from '../data/dungeonTilesets';
import { spawnArcParticles } from './CombatHelpers';

export class DungeonProp {
  public readonly x: number;
  public readonly y: number;
  public readonly collisionRadius = 8.5;
  public readonly spec: DungeonPropSpec;
  public hp: number;
  public broken = false;
  public sprite: Phaser.GameObjects.Image;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, x: number, y: number, spec: DungeonPropSpec) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.spec = spec;
    this.hp = spec.hp;
    this.sprite = scene.add
      .image(x, y, spec.sheet, spec.frame)
      .setTint(spec.tint)
      .setDepth(y);
  }

  public hit(dmg = 1, dirX = 0, dirY = 0): boolean {
    if (this.broken) return false;
    this.hp -= dmg;

    const jiggleDir = dirX !== 0 ? Math.sign(dirX) : Math.random() < 0.5 ? -1 : 1;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setTintFill(0xffffff);
    this.sprite.setScale(1.22, 0.78);
    this.sprite.setAngle(jiggleDir * 9);
    this.sprite.x = this.x + jiggleDir * 2;
    this.sprite.y = this.y + dirY * 1.5;

    if (this.hp > 0) {
      SFX.playHit();
      this.scene.time.delayedCall(60, () => {
        if (this.sprite.active && !this.broken) this.sprite.setTint(this.spec.tint);
      });
      this.scene.tweens.add({
        targets: this.sprite,
        x: this.x,
        y: this.y,
        scaleX: 1,
        scaleY: 1,
        angle: 0,
        duration: 130,
        ease: 'Elastic.Out',
      });
      spawnArcParticles(this.scene, this.x, this.y, this.spec.particleColor, 4);
      return false;
    }

    // Mark broken immediately for collision, but jiggle/flash briefly before shattering
    this.broken = true;
    SFX.playBreakProp(this.spec.breakKind);
    spawnArcParticles(this.scene, this.x, this.y, this.spec.particleColor, 9);
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.x - jiggleDir * 1.5,
      scaleX: 1.28,
      scaleY: 0.72,
      angle: -jiggleDir * 11,
      alpha: 0.25,
      duration: 65,
      ease: 'Quad.Out',
      onComplete: () => {
        if (this.sprite.active) this.sprite.destroy();
      },
    });
    return true;
  }
}
