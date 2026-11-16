import Phaser from 'phaser';
import { gameState } from '../core/GameState';
import { SFX } from '../core/SoundFX';
import manifest from '../data/assetManifest.json';
import { vectorToDirection, type Direction } from './AnimationRegistry';

export class Player extends Phaser.GameObjects.Container {
  public sprite: Phaser.GameObjects.Sprite;
  public shadow: Phaser.GameObjects.Ellipse;
  public facing: Direction = 'down';
  public isDashing = false;
  public isActionLocked = false;
  public invulnerableMs = 0;

  private actionCooldownMs = 0;
  private dashCooldownMs = 0;
  private dashTimerMs = 0;
  private dashDir = new Phaser.Math.Vector2(0, 1);
  private currentAnimKey = '';

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    const heroInfo = (manifest.heroes as Record<string, { idle?: { feetOffset?: number } }>)[
      gameState.heroClass
    ];
    const feetOffset = heroInfo?.idle?.feetOffset ?? 8;
    // Shadow centered slightly above y=0 so it overlaps the bottom half of the character's feet
    this.shadow = scene.add.ellipse(0, -1.5, 11, 5, 0x000000, 0.4);
    const startTex = `heroes/${gameState.heroClass}/${gameState.heroClass}_idle`;
    this.sprite = scene.add.sprite(0, -feetOffset, startTex, 0);
    this.add([this.shadow, this.sprite]);
    this.setDepth(y);
    scene.add.existing(this);

    this.playHeroAnim('idle', true);
  }

  public playHeroAnim(anim: string, force = false): void {
    const key = `hero_${gameState.heroClass}_${anim}_${this.facing}`;
    const fallback = `hero_${gameState.heroClass}_idle_${this.facing}`;
    const target = this.scene.anims.exists(key) ? key : fallback;
    if (!force && this.currentAnimKey === target && this.sprite.anims.isPlaying) return;
    this.currentAnimKey = target;
    this.sprite.play(target, true);
  }

  public tryDash(moveVec: Phaser.Math.Vector2): boolean {
    if (this.isDashing || this.dashCooldownMs > 0 || gameState.energy < 8) return false;
    if (moveVec.lengthSq() > 0.01) {
      this.dashDir.copy(moveVec).normalize();
      this.facing = vectorToDirection(this.dashDir.x, this.dashDir.y, this.facing);
    } else {
      const dirMap: Record<Direction, [number, number]> = {
        down: [0, 1],
        up: [0, -1],
        left: [-1, 0],
        right: [1, 0],
      };
      const [dx, dy] = dirMap[this.facing];
      this.dashDir.set(dx, dy);
    }
    gameState.energy = Math.max(0, gameState.energy - 8);
    this.isDashing = true;
    this.dashTimerMs = 170;
    this.invulnerableMs = Math.max(this.invulnerableMs, 220);
    this.dashCooldownMs = gameState.getDashCooldownMs();
    SFX.playDash();
    this.playHeroAnim('dash', true);
    gameState.emitVitals();
    return true;
  }

  public startAction(
    animName: string,
    cooldownMs: number,
    aimDx: number,
    aimDy: number,
    lockMs = 180,
  ): boolean {
    if (this.actionCooldownMs > 0 || this.isDashing) return false;
    this.facing = vectorToDirection(aimDx, aimDy, this.facing);
    this.actionCooldownMs = cooldownMs;
    this.isActionLocked = true;
    this.playHeroAnim(animName, true);
    this.scene.time.delayedCall(lockMs, () => {
      this.isActionLocked = false;
    });
    return true;
  }

  public takeDamage(amount: number, knockX: number, knockY: number): boolean {
    if (this.invulnerableMs > 0 || gameState.hp <= 0) return false;
    const mitigated = Math.max(1, amount - Math.floor(gameState.getArmorDefense() * 0.6));
    gameState.hp = Math.max(0, gameState.hp - mitigated);
    this.invulnerableMs = 650;
    SFX.playHit();
    this.sprite.setTintFill(0xff6b6b);
    this.scene.time.delayedCall(120, () => {
      if (this.sprite.active) this.sprite.clearTint();
    });
    this.x += knockX * 8;
    this.y += knockY * 8;
    gameState.emitVitals();
    return true;
  }

  public updatePlayer(
    dtMs: number,
    inputDir: Phaser.Math.Vector2,
    isWalkable: (nx: number, ny: number) => boolean,
    speedBonus = 1,
  ): void {
    const dt = dtMs / 1000;
    if (this.actionCooldownMs > 0) this.actionCooldownMs = Math.max(0, this.actionCooldownMs - dtMs);
    if (this.dashCooldownMs > 0) this.dashCooldownMs = Math.max(0, this.dashCooldownMs - dtMs);
    if (this.invulnerableMs > 0) {
      this.invulnerableMs = Math.max(0, this.invulnerableMs - dtMs);
      this.sprite.alpha = Math.floor(this.invulnerableMs / 70) % 2 === 0 ? 0.55 : 1;
    } else {
      this.sprite.alpha = 1;
    }

    let vx = 0;
    let vy = 0;

    if (this.isDashing) {
      this.dashTimerMs -= dtMs;
      const dashSpeed = 240;
      vx = this.dashDir.x * dashSpeed;
      vy = this.dashDir.y * dashSpeed;
      if (this.dashTimerMs <= 0) {
        this.isDashing = false;
      }
    } else if (inputDir.lengthSq() > 0.01) {
      const spd = gameState.getMoveSpeed() * speedBonus * (this.isActionLocked ? 0.45 : 1);
      const norm = inputDir.clone().normalize();
      vx = norm.x * spd;
      vy = norm.y * spd;
      if (!this.isActionLocked) {
        this.facing = vectorToDirection(norm.x, norm.y, this.facing);
        this.playHeroAnim('walk');
      }
    } else if (!this.isActionLocked) {
      this.playHeroAnim('idle');
    }

    // Separate X / Y collision slide (and allow stepping out if currently overlapping a solid)
    const stuckNow = !isWalkable(this.x, this.y);
    const nextX = this.x + vx * dt;
    if (isWalkable(nextX, this.y) || (stuckNow && Math.abs(vx) > 0)) {
      this.x = nextX;
    }
    const nextY = this.y + vy * dt;
    if (isWalkable(this.x, nextY) || (stuckNow && Math.abs(vy) > 0)) {
      this.y = nextY;
    }

    this.setDepth(this.y);
  }
}

export class FoxCompanion extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Sprite;
  private facing: Direction = 'down';
  private curAnim = '';

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    const foxInfo = (manifest.heroes as Record<string, { idle?: { feetOffset?: number } }>).Fox;
    const scale = 0.8;
    const feetOffset = (foxInfo?.idle?.feetOffset ?? 8) * scale;
    const shadow = scene.add.ellipse(0, -1, 9, 4, 0x000000, 0.35);
    this.sprite = scene.add.sprite(0, -feetOffset, 'heroes/Fox/Fox_idle', 0).setScale(scale);
    this.add([shadow, this.sprite]);
    this.setDepth(y);
    scene.add.existing(this);
  }

  public updateCompanion(dtMs: number, targetX: number, targetY: number): void {
    const dx = targetX - 16 - this.x;
    const dy = targetY + 6 - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 140) {
      this.x = targetX - 16;
      this.y = targetY + 6;
    } else if (dist > 14) {
      const spd = Math.min(95, dist * 3.5) * (dtMs / 1000);
      this.x += (dx / dist) * spd;
      this.y += (dy / dist) * spd;
      this.facing = vectorToDirection(dx, dy, this.facing);
      this.playAnim('walk');
    } else {
      this.playAnim('idle');
    }
    this.setDepth(this.y);
  }

  private playAnim(anim: 'idle' | 'walk'): void {
    const key = `hero_Fox_${anim}_${this.facing}`;
    if (this.curAnim === key) return;
    this.curAnim = key;
    if (this.scene.anims.exists(key)) this.sprite.play(key, true);
  }
}
