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
    if (this.hp > 0) {
      SFX.playHit();
      this.sprite.setTintFill(0xffffff);
      this.scene.time.delayedCall(60, () => {
        if (this.sprite.active && !this.broken) this.sprite.setTint(this.spec.tint);
      });
      this.sprite.x = this.x + dirX * 1.5;
      this.sprite.y = this.y + dirY * 1.5;
      this.scene.tweens.add({
        targets: this.sprite,
        x: this.x,
        y: this.y,
        duration: 90,
        ease: 'Back.easeOut',
      });
      spawnArcParticles(this.scene, this.x, this.y, this.spec.particleColor, 4);
      return false;
    }

    this.broken = true;
    this.sprite.destroy();
    SFX.playBreakProp(this.spec.breakKind);
    spawnArcParticles(this.scene, this.x, this.y, this.spec.particleColor, 9);
    return true;
  }
}
