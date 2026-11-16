import Phaser from 'phaser';
import { MONSTERS, type MonsterDef } from '../data/monsters';
import { vectorToDirection, type Direction } from './AnimationRegistry';
import { applySafeKnockback } from './knockback';
import manifest from '../data/assetManifest.json';

export class Enemy extends Phaser.GameObjects.Container {
  public readonly def: MonsterDef;
  public readonly homeX: number;
  public readonly homeY: number;
  public hp: number;
  public maxHp: number;
  public isDead = false;
  public facing: Direction = 'down';

  public sprite: Phaser.GameObjects.Sprite;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFill: Phaser.GameObjects.Rectangle;
  private curAnim = '';
  private attackCooldownMs = 0;
  private specialCooldownMs = 3200;
  private slowMs = 0;
  private wanderTimerMs = 0;
  private wanderVec = new Phaser.Math.Vector2(0, 0);
  private hitStunMs = 0;

  // Obstacle detour steering memory
  private detourSign: 1 | -1 = 1;
  private detourTimerMs = 0;

  constructor(scene: Phaser.Scene, monsterId: string, x: number, y: number) {
    super(scene, x, y);
    const def = MONSTERS[monsterId] ?? MONSTERS.Slime;
    this.def = def;
    this.homeX = x;
    this.homeY = y;
    this.maxHp = def.maxHp;
    this.hp = def.maxHp;

    const mSpec = (
      manifest.monsters as Record<
        string,
        {
          frameWidth: number;
          frameHeight: number;
          feetOffset?: number;
          anims: Record<string, { key: string }>;
        }
      >
    )[def.id];

    const scale = def.id === 'Adult Red Dragon' ? 0.75 : 1;
    const feetOffset = (mSpec?.feetOffset ?? 8) * scale;
    const shadowW = def.isBoss ? 26 : 12;
    const shadowH = def.isBoss ? 8 : 5;
    // Shadow centered slightly above y=0 so it overlaps the bottom half of the monster's feet
    const shadow = scene.add.ellipse(0, -1.5, shadowW, shadowH, 0x000000, 0.4);

    const idleKey = mSpec?.anims?.idle?.key ?? 'monsters/Slime/Slime_idle';
    this.sprite = scene.add.sprite(0, -feetOffset, idleKey, 0).setScale(scale);

    const barW = def.isBoss ? 38 : 18;
    const barY = def.isBoss ? -36 : -20;
    this.hpBarBg = scene.add.rectangle(0, barY, barW, 3, 0x11161f).setOrigin(0.5);
    this.hpBarFill = scene.add
      .rectangle(-barW / 2 + 0.5, barY, barW - 1, 2, def.isBoss ? 0xff4757 : 0xe85d5d)
      .setOrigin(0, 0.5);
    if (!def.isBoss) {
      this.hpBarBg.setVisible(false);
      this.hpBarFill.setVisible(false);
    }

    this.add([shadow, this.sprite, this.hpBarBg, this.hpBarFill]);
    this.setDepth(y);
    scene.add.existing(this);

    this.playMonAnim('idle', true);
  }

  private playMonAnim(anim: 'idle' | 'walk' | 'attack' | 'special' | 'hit' | 'die', force = false): void {
    let target = `mon_${this.def.id}_${anim}_${this.facing}`;
    if (!this.scene.anims.exists(target)) {
      if (anim === 'die' && this.scene.anims.exists(`mon_${this.def.id}_death_${this.facing}`)) {
        target = `mon_${this.def.id}_death_${this.facing}`;
      } else {
        target = `mon_${this.def.id}_idle_${this.facing}`;
      }
    }
    if (!force && this.curAnim === target && this.sprite.anims.isPlaying) return;
    this.curAnim = target;
    if (this.scene.anims.exists(target)) {
      this.sprite.play(target, true);
    }
  }

  public applySlow(ms: number): void {
    this.slowMs = Math.max(this.slowMs, ms);
  }

  public takeDamage(
    amount: number,
    knockX: number,
    knockY: number,
    isWalkable: (nx: number, ny: number) => boolean,
  ): boolean {
    if (this.isDead) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.hitStunMs = 150;
    this.hpBarBg.setVisible(true);
    this.hpBarFill.setVisible(true);
    const barW = this.def.isBoss ? 37 : 17;
    this.hpBarFill.width = Math.max(1, barW * (this.hp / this.maxHp));

    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(90, () => {
      if (this.sprite.active && !this.isDead) {
        if (this.slowMs > 0) this.sprite.setTint(0x74e5ff);
        else this.sprite.clearTint();
      }
    });

    applySafeKnockback(this, knockX, knockY, this.def.isBoss ? 3 : 9, isWalkable, 4);

    if (this.hp <= 0) {
      this.isDead = true;
      this.playMonAnim('die', true);
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        duration: this.def.isBoss ? 650 : 280,
        onComplete: () => this.destroy(),
      });
      return true;
    }
    return false;
  }

  public updateEnemy(
    dtMs: number,
    playerX: number,
    playerY: number,
    isWalkable: (nx: number, ny: number) => boolean,
    actions: {
      onMeleeHitPlayer: (dmg: number, dirX: number, dirY: number) => void;
      onFireProjectile: (x: number, y: number, vx: number, vy: number, dmg: number, texKey: string) => void;
      onBossSummon: (x: number, y: number, monsterId: string) => void;
    },
  ): void {
    if (this.isDead) return;
    const dt = dtMs / 1000;

    if (this.attackCooldownMs > 0) this.attackCooldownMs -= dtMs;
    if (this.specialCooldownMs > 0) this.specialCooldownMs -= dtMs;
    if (this.detourTimerMs > 0) this.detourTimerMs -= dtMs;
    if (this.hitStunMs > 0) {
      this.hitStunMs -= dtMs;
      return;
    }
    if (this.slowMs > 0) {
      this.slowMs -= dtMs;
      this.sprite.setTint(0x74e5ff);
      if (this.slowMs <= 0) this.sprite.clearTint();
    }

    const speedMult = this.slowMs > 0 ? 0.5 : 1;
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= this.def.aggroRange) {
      const nx = dist > 0.01 ? dx / dist : 0;
      const ny = dist > 0.01 ? dy / dist : 1;
      this.facing = vectorToDirection(nx, ny, this.facing);

      // Boss Special Abilities
      if (this.def.isBoss && this.specialCooldownMs <= 0) {
        this.specialCooldownMs = 4600;
        this.playMonAnim('special', true);
        if (this.def.ai === 'boss_summoner') {
          const proj = this.def.projectileKey ?? 'monster_projectiles/FireballBig';
          for (let i = 0; i < 8; i++) {
            const ang = (Math.PI * 2 * i) / 8;
            actions.onFireProjectile(this.x, this.y - 4, Math.cos(ang) * 95, Math.sin(ang) * 95, this.def.damage, proj);
          }
          if (Math.random() < 0.65) {
            const minion = this.def.id === 'Lich' ? 'Skeleton' : 'Imp';
            actions.onBossSummon(this.x + Phaser.Math.Between(-28, 28), this.y + 20, minion);
          }
        } else {
          const proj = this.def.projectileKey ?? 'monster_projectiles/EnergyBall';
          const baseAng = Math.atan2(dy, dx);
          for (const offset of [-0.35, 0, 0.35]) {
            actions.onFireProjectile(
              this.x,
              this.y - 4,
              Math.cos(baseAng + offset) * 115,
              Math.sin(baseAng + offset) * 115,
              this.def.damage,
              proj,
            );
          }
        }
      }

      if (this.def.ai === 'ranged' || (this.def.isBoss && dist > 65)) {
        if (dist > this.def.attackRange * 0.85) {
          this.steerAroundObstacles(nx * this.def.speed * speedMult * dt, ny * this.def.speed * speedMult * dt, isWalkable);
          this.playMonAnim('walk');
        } else {
          this.playMonAnim('idle');
        }
        if (dist <= this.def.attackRange && this.attackCooldownMs <= 0) {
          this.attackCooldownMs = this.def.isBoss ? 1400 : 1800;
          this.playMonAnim('attack', true);
          const proj = this.def.projectileKey ?? 'monster_projectiles/EnergyBall';
          actions.onFireProjectile(this.x, this.y - 4, nx * 110, ny * 110, this.def.damage, proj);
        }
      } else {
        if (dist > this.def.attackRange * 0.78) {
          this.steerAroundObstacles(nx * this.def.speed * speedMult * dt, ny * this.def.speed * speedMult * dt, isWalkable);
          this.playMonAnim('walk');
        } else if (this.attackCooldownMs <= 0) {
          this.attackCooldownMs = 1100;
          this.playMonAnim('attack', true);
          actions.onMeleeHitPlayer(this.def.damage, nx, ny);
        }
      }
    } else {
      // Idle / Wander near home
      this.wanderTimerMs -= dtMs;
      if (this.wanderTimerMs <= 0) {
        this.wanderTimerMs = Phaser.Math.Between(1600, 3200);
        if (Math.random() < 0.55) {
          const ang = Math.random() * Math.PI * 2;
          this.wanderVec.set(Math.cos(ang), Math.sin(ang));
        } else {
          this.wanderVec.set(0, 0);
        }
      }
      if (this.wanderVec.lengthSq() > 0.01) {
        const stepX = this.wanderVec.x * (this.def.speed * 0.45) * dt;
        const stepY = this.wanderVec.y * (this.def.speed * 0.45) * dt;
        if (Math.hypot(this.x + stepX - this.homeX, this.y + stepY - this.homeY) < 48) {
          const moved = this.steerAroundObstacles(stepX, stepY, isWalkable);
          if (!moved) {
            this.wanderVec.negate();
          } else {
            this.facing = vectorToDirection(this.wanderVec.x, this.wanderVec.y, this.facing);
            this.playMonAnim('walk');
          }
        } else {
          this.wanderVec.set(0, 0);
          this.playMonAnim('idle');
        }
      } else {
        this.playMonAnim('idle');
      }
    }

    this.setDepth(this.y);
  }

  /**
   * Moves toward (stepX, stepY); if blocked by an obstacle or water edge, probes
   * steered detour angles using short-term wall-follow direction memory.
   */
  public steerAroundObstacles(
    stepX: number,
    stepY: number,
    isWalkable: (nx: number, ny: number) => boolean,
  ): boolean {
    const stepLen = Math.hypot(stepX, stepY);
    if (stepLen < 0.001) return false;

    const baseAng = Math.atan2(stepY, stepX);
    const probeDist = Math.max(stepLen, 7);

    // If not actively detouring and straight ahead is clear, move directly with axis slide
    if (
      this.detourTimerMs <= 0 &&
      isWalkable(this.x + Math.cos(baseAng) * probeDist, this.y + Math.sin(baseAng) * probeDist)
    ) {
      let moved = false;
      if (isWalkable(this.x + stepX, this.y)) {
        this.x += stepX;
        moved = true;
      }
      if (isWalkable(this.x, this.y + stepY)) {
        this.y += stepY;
        moved = true;
      }
      if (moved) return true;
    }

    // Steer around obstacles by probing angled directions around target vector
    const offsets = [
      0,
      this.detourSign * 0.55,
      -this.detourSign * 0.55,
      this.detourSign * 1.05,
      -this.detourSign * 1.05,
      this.detourSign * 1.55,
      -this.detourSign * 1.55,
      this.detourSign * 2.1,
      -this.detourSign * 2.1,
    ];

    for (const off of offsets) {
      const ang = baseAng + off;
      const sx = Math.cos(ang) * stepLen;
      const sy = Math.sin(ang) * stepLen;
      const px = this.x + Math.cos(ang) * probeDist;
      const py = this.y + Math.sin(ang) * probeDist;
      if (isWalkable(px, py) && isWalkable(this.x + sx, this.y + sy)) {
        this.x += sx;
        this.y += sy;
        if (Math.abs(off) > 0.2) {
          this.detourSign = off > 0 ? 1 : -1;
          this.detourTimerMs = 550;
          this.facing = vectorToDirection(sx, sy, this.facing);
        }
        return true;
      }
    }

    // Flip preferred detour side if totally wedged
    this.detourSign = this.detourSign === 1 ? -1 : 1;
    this.detourTimerMs = 400;
    return false;
  }
}
