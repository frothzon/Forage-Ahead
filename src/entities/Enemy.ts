import Phaser from 'phaser';
import { gameState } from '../core/GameState';
import { HALF_ISLAND_AGGRO_PX, MONSTERS, type MonsterDef } from '../data/monsters';
import { vectorToDirection, type Direction } from './AnimationRegistry';
import { applySafeKnockback } from './knockback';
import { showWorldEmote } from '../vfx/WorldEmote';
import { playSpawnGrowAndJello } from '../vfx/SpawnJuice';
import {
  FEAR_DURATION_MS,
  STUCK_FEAR_TIMEOUT_MS,
  STUCK_MIN_PROGRESS_PX,
  createStuckFearState,
  updateStuckFearTracker,
  type StuckFearState,
} from './EnemyFear';
import manifest from '../data/assetManifest.json';

export class Enemy extends Phaser.GameObjects.Container {
  public static readonly STUCK_FEAR_TIMEOUT_MS = STUCK_FEAR_TIMEOUT_MS;
  public static readonly STUCK_MIN_PROGRESS_PX = STUCK_MIN_PROGRESS_PX;
  public static readonly FEAR_DURATION_MS = FEAR_DURATION_MS;

  public readonly def: MonsterDef;
  public readonly homeX: number;
  public readonly homeY: number;
  public hp: number;
  public maxHp: number;
  public isDead = false;
  public facing: Direction = 'down';

  public sprite: Phaser.GameObjects.Sprite;
  private hpBarBorder: Phaser.GameObjects.Rectangle;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarTrail: Phaser.GameObjects.Rectangle;
  private hpBarFill: Phaser.GameObjects.Rectangle;
  private hpBarHighlight: Phaser.GameObjects.Rectangle;
  private levelLabel: Phaser.GameObjects.Text;
  private curAnim = '';
  private attackCooldownMs = 0;
  private specialCooldownMs = 3200;
  private slowMs = 0;
  private wanderTimerMs = 0;
  private wanderVec = new Phaser.Math.Vector2(0, 0);
  private hitStunMs = 0;
  private hitstopMs = 0;

  // Brief attack wind-up telegraph so player can react & dash
  private telegraphMs = 0;
  private pendingAttackType: 'melee' | 'ranged' | null = null;
  private baseScale = 1;
  private hasAggroEmoted = false;

  // Obstacle detour steering memory
  private detourSign: 1 | -1 = 1;
  private detourTimerMs = 0;
  private stuckFearState: StuckFearState;

  constructor(scene: Phaser.Scene, monsterId: string, x: number, y: number) {
    super(scene, x, y);
    this.stuckFearState = createStuckFearState(x, y);
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
    this.baseScale = scale;
    const feetOffset = (mSpec?.feetOffset ?? 8) * scale;
    const shadowW = def.isBoss ? 26 : 12;
    const shadowH = def.isBoss ? 8 : 5;
    // Shadow centered slightly above y=0 so it overlaps the bottom half of the monster's feet
    const shadow = scene.add.ellipse(0, -1.5, shadowW, shadowH, 0x000000, 0.4);

    const idleKey = mSpec?.anims?.idle?.key ?? 'monsters/Slime/Slime_idle';
    this.sprite = scene.add.sprite(0, -feetOffset, idleKey, 0).setScale(scale);

    const barW = def.isBoss ? 40 : 20;
    const barH = def.isBoss ? 4.5 : 3.5;
    const barY = def.isBoss ? -36 : -20;
    this.hpBarBorder = scene.add.rectangle(0, barY, barW + 2, barH + 2, 0x070a0f).setOrigin(0.5);
    this.hpBarBg = scene.add.rectangle(0, barY, barW, barH, 0x1b141a).setOrigin(0.5);
    this.hpBarTrail = scene.add
      .rectangle(-barW / 2 + 0.5, barY, barW - 1, barH - 1, 0xffd166)
      .setOrigin(0, 0.5);
    this.hpBarFill = scene.add
      .rectangle(-barW / 2 + 0.5, barY, barW - 1, barH - 1, def.isBoss ? 0xff4757 : 0xe85d5d)
      .setOrigin(0, 0.5);
    this.hpBarHighlight = scene.add
      .rectangle(-barW / 2 + 0.5, barY - (barH - 1) * 0.28, barW - 1, 0.9, 0xffffff, 0.35)
      .setOrigin(0, 0.5);
    if (!def.isBoss) {
      this.hpBarBorder.setVisible(false);
      this.hpBarBg.setVisible(false);
      this.hpBarTrail.setVisible(false);
      this.hpBarFill.setVisible(false);
      this.hpBarHighlight.setVisible(false);
    }
    this.levelLabel = scene.add
      .text(0, barY - 7, `Lv.${def.level}`, {
        fontSize: '7px',
        fontStyle: 'bold',
        color: '#ffe066',
        stroke: '#000000',
        strokeThickness: 2,
        resolution: 4,
      })
      .setOrigin(0.5);

    this.add([
      shadow,
      this.sprite,
      this.hpBarBorder,
      this.hpBarBg,
      this.hpBarTrail,
      this.hpBarFill,
      this.hpBarHighlight,
      this.levelLabel,
    ]);
    this.syncLevelColor();
    this.setDepth(y);
    scene.add.existing(this);

    this.playMonAnim('idle', true);
    playSpawnGrowAndJello(scene, this, 1, 1);
  }

  public isFeared(): boolean {
    return this.stuckFearState.fearTimerMs > 0;
  }

  public getStuckTimerMs(): number {
    return this.stuckFearState.stuckTimerMs;
  }

  private syncLevelColor(): void {
    const diff = this.def.level - gameState.getPowerLevel();
    const col = diff >= 4 ? '#ff5e6c' : diff >= 2 ? '#ff9b5a' : diff <= -2 ? '#8ef5a7' : '#ffe066';
    this.levelLabel.setColor(col);
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

  public applyHitstop(ms: number): void {
    if (this.isDead || ms <= 0) return;
    this.hitstopMs = Math.max(this.hitstopMs, ms);
    if (this.sprite.anims?.isPlaying) {
      this.sprite.anims.pause();
    }
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
    this.hpBarBorder.setVisible(true);
    this.hpBarBg.setVisible(true);
    this.hpBarTrail.setVisible(true);
    this.hpBarFill.setVisible(true);
    this.hpBarHighlight.setVisible(true);
    const barW = this.def.isBoss ? 39 : 19;
    const ratio = this.hp / this.maxHp;
    const nextW = Math.max(1, barW * ratio);
    this.hpBarFill.width = nextW;
    this.hpBarHighlight.width = nextW;
    const fillCol = this.def.isBoss ? 0xff4757 : ratio <= 0.3 ? 0xff3b52 : 0xe85d5d;
    this.hpBarFill.setFillStyle(0xffffff);
    this.scene.time.delayedCall(65, () => {
      if (this.hpBarFill.active) this.hpBarFill.setFillStyle(fillCol);
    });
    const barParts = [this.hpBarBorder, this.hpBarBg, this.hpBarTrail, this.hpBarFill, this.hpBarHighlight];
    for (const part of barParts) part.scaleY = 1.55;
    this.scene.tweens.add({
      targets: barParts,
      scaleY: 1,
      duration: 120,
      ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: this.hpBarTrail,
      width: nextW,
      delay: 150,
      duration: 240,
      ease: 'Quad.Out',
    });

    // 2-frame white hit-flash -> brief red damage tint + elastic squash-and-stretch
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(55, () => {
      if (!this.sprite.active || this.isDead) return;
      this.sprite.setTint(0xff6b6b);
      this.scene.time.delayedCall(65, () => {
        if (!this.sprite.active || this.isDead) return;
        if (this.slowMs > 0) this.sprite.setTint(0x74e5ff);
        else this.sprite.clearTint();
      });
    });

    this.sprite.setScale(this.baseScale * 1.18, this.baseScale * 0.82);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.baseScale,
      scaleY: this.baseScale,
      duration: 90,
      ease: 'Back.easeOut',
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

  public isWindingUp(): boolean {
    return this.telegraphMs > 0;
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
    opts?: { aggroMult?: number; maxAggroPx?: number; pacified?: boolean },
  ): void {
    if (this.isDead) return;
    if (this.hitstopMs > 0) {
      this.hitstopMs = Math.max(0, this.hitstopMs - dtMs);
      if (this.hitstopMs <= 0 && this.sprite.anims?.isPaused) {
        this.sprite.anims.resume();
      }
      return;
    }
    const dt = dtMs / 1000;
    const isPacified = Boolean(opts?.pacified && !this.def.isBoss);

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
      if (this.slowMs <= 0 && this.telegraphMs <= 0) this.sprite.clearTint();
    }

    const speedMult = this.slowMs > 0 ? 0.5 : 1;
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);

    if (isPacified && this.telegraphMs > 0) {
      this.telegraphMs = 0;
      this.pendingAttackType = null;
      this.sprite.setScale(this.baseScale);
      if (this.slowMs > 0) this.sprite.setTint(0x74e5ff);
      else this.sprite.clearTint();
    }

    // Handle active wind-up telegraph -> strike completion
    if (this.telegraphMs > 0) {
      this.telegraphMs -= dtMs;
      this.sprite.setTint(0xff9f43);
      this.sprite.setScale(this.baseScale * 1.1);
      if (this.telegraphMs <= 0) {
        this.sprite.setScale(this.baseScale);
        if (this.slowMs > 0) this.sprite.setTint(0x74e5ff);
        else this.sprite.clearTint();

        const nx = dist > 0.01 ? dx / dist : 0;
        const ny = dist > 0.01 ? dy / dist : 1;
        this.facing = vectorToDirection(nx, ny, this.facing);
        if (this.pendingAttackType === 'ranged') {
          this.attackCooldownMs = this.def.isBoss ? 1400 : 1800;
          this.playMonAnim('attack', true);
          const proj = this.def.projectileKey ?? 'monster_projectiles/EnergyBall';
          actions.onFireProjectile(this.x, this.y - 4, nx * 110, ny * 110, this.def.damage, proj);
        } else if (this.pendingAttackType === 'melee' && dist <= this.def.attackRange + 8) {
          this.attackCooldownMs = 1100;
          this.playMonAnim('attack', true);
          actions.onMeleeHitPlayer(this.def.damage, nx, ny);
        }
        this.pendingAttackType = null;
      }
      return;
    }

    const cap = this.def.isBoss ? this.def.aggroRange : (opts?.maxAggroPx ?? HALF_ISLAND_AGGRO_PX);
    const effectiveAggro = isPacified ? -1 : Math.min(this.def.aggroRange, cap) * (opts?.aggroMult ?? 1);

    if (this.stuckFearState.fearTimerMs > 0) {
      this.stuckFearState.fearTimerMs = Math.max(0, this.stuckFearState.fearTimerMs - dtMs);
      if (this.stuckFearState.fearTimerMs <= 0) {
        if (this.slowMs > 0) this.sprite.setTint(0x74e5ff);
        else this.sprite.clearTint();
      } else {
        this.sprite.setTint(0xc4b5fd);
        const awayX = dist > 0.01 ? -dx / dist : 0;
        const awayY = dist > 0.01 ? -dy / dist : -1;
        this.facing = vectorToDirection(awayX, awayY, this.facing);
        const fleeSpeed = this.def.speed * 1.15 * speedMult * dt;
        const moved = this.steerAroundObstacles(awayX * fleeSpeed, awayY * fleeSpeed, isWalkable);
        this.playMonAnim(moved ? 'walk' : 'idle');
        this.setDepth(this.y);
        return;
      }
    }

    if (dist <= effectiveAggro) {
      if (!this.hasAggroEmoted) {
        this.hasAggroEmoted = true;
        showWorldEmote(this.scene, this.x, this.y - (this.def.isBoss ? 34 : 20), 'portraits/Emote_alert', {
          durationMs: 850,
          scale: 0.65,
        });
      }
      const nx = dist > 0.01 ? dx / dist : 0;
      const ny = dist > 0.01 ? dy / dist : 1;
      this.facing = vectorToDirection(nx, ny, this.facing);

      const isRangedBehavior = this.def.ai === 'ranged' || (this.def.isBoss && dist > 65);
      const outOfAttackRange = isRangedBehavior
        ? dist > this.def.attackRange
        : dist > this.def.attackRange + 4;
      if (updateStuckFearTracker(this.stuckFearState, this.x, this.y, dtMs, outOfAttackRange)) {
        this.telegraphMs = 0;
        this.pendingAttackType = null;
        this.sprite.setTint(0xc4b5fd);
        showWorldEmote(this.scene, this.x, this.y - (this.def.isBoss ? 34 : 20), 'portraits/Emote_alert', {
          durationMs: 850,
          scale: 0.65,
        });
        this.setDepth(this.y);
        return;
      }

      // Boss Special Abilities (with 380ms ground danger telegraph: outer ring + expanding fill + 100ms white flash)
      if (this.def.isBoss && this.specialCooldownMs <= 0) {
        this.specialCooldownMs = 4600;
        this.playMonAnim('special', true);
        const radius = 26;
        const outerRing = this.scene.add
          .circle(this.x, this.y, radius, 0xff4757, 0.08)
          .setStrokeStyle(1.5, 0xff6b81, 0.9)
          .setDepth(this.y - 1);
        const innerFill = this.scene.add
          .circle(this.x, this.y, radius, 0xff4757, 0.34)
          .setScale(0.05)
          .setDepth(this.y - 1);
        this.scene.tweens.add({
          targets: innerFill,
          scale: 1,
          duration: 340,
          ease: 'Linear',
        });
        this.scene.time.delayedCall(240, () => {
          if (innerFill.active) innerFill.setFillStyle(0xffffff, 0.72);
          if (outerRing.active) outerRing.setStrokeStyle(2, 0xffffff, 1);
        });
        this.scene.time.delayedCall(380, () => {
          if (outerRing.active) outerRing.destroy();
          if (innerFill.active) innerFill.destroy();
        });
        const fireX = this.x;
        const fireY = this.y;
        this.scene.time.delayedCall(340, () => {
          if (this.isDead || !this.active) return;
          if (this.def.ai === 'boss_summoner') {
            const proj = this.def.projectileKey ?? 'monster_projectiles/FireballBig';
            for (let i = 0; i < 8; i++) {
              const ang = (Math.PI * 2 * i) / 8;
              actions.onFireProjectile(fireX, fireY - 4, Math.cos(ang) * 95, Math.sin(ang) * 95, this.def.damage, proj);
            }
            if (Math.random() < 0.65) {
              const minion = this.def.id === 'Lich' ? 'Skeleton' : 'Imp';
              actions.onBossSummon(fireX + Phaser.Math.Between(-28, 28), fireY + 20, minion);
            }
          } else {
            const proj = this.def.projectileKey ?? 'monster_projectiles/EnergyBall';
            const baseAng = Math.atan2(dy, dx);
            for (const offset of [-0.35, 0, 0.35]) {
              actions.onFireProjectile(
                fireX,
                fireY - 4,
                Math.cos(baseAng + offset) * 115,
                Math.sin(baseAng + offset) * 115,
                this.def.damage,
                proj,
              );
            }
          }
        });
        return;
      }

      if (this.def.ai === 'ranged' || (this.def.isBoss && dist > 65)) {
        if (dist > this.def.attackRange * 0.85) {
          this.steerAroundObstacles(nx * this.def.speed * speedMult * dt, ny * this.def.speed * speedMult * dt, isWalkable);
          this.playMonAnim('walk');
        } else {
          this.playMonAnim('idle');
        }
        if (dist <= this.def.attackRange && this.attackCooldownMs <= 0) {
          this.telegraphMs = 240;
          this.pendingAttackType = 'ranged';
        }
      } else {
        if (dist > this.def.attackRange * 0.78) {
          this.steerAroundObstacles(nx * this.def.speed * speedMult * dt, ny * this.def.speed * speedMult * dt, isWalkable);
          this.playMonAnim('walk');
        } else if (this.attackCooldownMs <= 0) {
          this.telegraphMs = 250;
          this.pendingAttackType = 'melee';
        }
      }
    } else {
      this.hasAggroEmoted = false;
      updateStuckFearTracker(this.stuckFearState, this.x, this.y, dtMs, false);
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
    const midDist = probeDist * 0.5;

    // If not actively detouring and both midpoint and full probe ahead are clear, move directly with axis slide
    if (
      this.detourTimerMs <= 0 &&
      isWalkable(this.x + Math.cos(baseAng) * midDist, this.y + Math.sin(baseAng) * midDist) &&
      isWalkable(this.x + Math.cos(baseAng) * probeDist, this.y + Math.sin(baseAng) * probeDist)
    ) {
      const startX = this.x;
      const startY = this.y;
      let moved = false;
      if (isWalkable(this.x + stepX, this.y)) {
        this.x += stepX;
        moved = true;
      }
      if (isWalkable(this.x, this.y + stepY)) {
        this.y += stepY;
        moved = true;
      }
      if (moved && isWalkable(this.x, this.y)) return true;
      this.x = startX;
      this.y = startY;
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
      const mx = this.x + Math.cos(ang) * midDist;
      const my = this.y + Math.sin(ang) * midDist;
      const px = this.x + Math.cos(ang) * probeDist;
      const py = this.y + Math.sin(ang) * probeDist;
      if (isWalkable(mx, my) && isWalkable(px, py) && isWalkable(this.x + sx, this.y + sy)) {
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
