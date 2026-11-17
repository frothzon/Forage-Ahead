import Phaser from 'phaser';
import { gameState } from '../core/GameState';
import { SFX } from '../core/SoundFX';
import manifest from '../data/assetManifest.json';
import { ITEMS } from '../data/items';
import { vectorToDirection, type Direction } from './AnimationRegistry';
import { applySafeKnockback } from './knockback';

export class Player extends Phaser.GameObjects.Container {
  public sprite: Phaser.GameObjects.Sprite;
  public shadow: Phaser.GameObjects.Ellipse;
  public heldItemSprite: Phaser.GameObjects.Image;
  public facing: Direction = 'down';
  public isDashing = false;
  public isActionLocked = false;
  public invulnerableMs = 0;
  public dodgeMomentumMs = 0;

  private actionCooldownMs = 0;
  private dashCooldownMs = 0;
  private dashTimerMs = 0;
  private dashDir = new Phaser.Math.Vector2(0, 1);
  private currentAnimKey = '';
  private heldItemKey = '';
  private swingTimerMs = 0;
  private swingDurationMs = 180;
  private footstepTimerMs = 0;

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
    this.heldItemSprite = scene.add.image(6, -6, 'ui_icons/pickaxe').setScale(0.55).setVisible(false);
    this.add([this.shadow, this.sprite, this.heldItemSprite]);
    this.setDepth(y);
    scene.add.existing(this);

    this.playHeroAnim('idle', true);
    this.syncHeldItem();
  }

  public syncHeldItem(): void {
    const itemId = gameState.hotbar[gameState.selectedHotbarIndex];
    const def = itemId ? ITEMS[itemId] : undefined;
    const hasQty =
      def && (!def.equipSlot && def.category !== 'gadget' ? (gameState.inventory[itemId] ?? 0) > 0 : true);
    const texKey = def && hasQty ? def.iconKey ?? '' : '';

    const hideForAction = this.isActionLocked || this.swingTimerMs > 0 || this.isDashing;
    if (!hideForAction && texKey && this.scene.textures.exists(texKey)) {
      if (this.heldItemKey !== texKey) {
        this.heldItemKey = texKey;
        this.heldItemSprite.setTexture(texKey);
      }
      this.heldItemSprite.setVisible(true);
    } else {
      if (!texKey) this.heldItemKey = '';
      this.heldItemSprite.setVisible(false);
    }
    this.positionHeldItem();
  }

  private positionHeldItem(): void {
    if (!this.heldItemSprite.visible) return;
    const handOffsets: Record<Direction, { x: number; y: number; flipX: boolean; baseAngle: number }> = {
      down: { x: 6, y: -5, flipX: false, baseAngle: 15 },
      up: { x: -6, y: -9, flipX: true, baseAngle: -25 },
      left: { x: -7, y: -6, flipX: true, baseAngle: -20 },
      right: { x: 7, y: -6, flipX: false, baseAngle: 20 },
    };
    const off = handOffsets[this.facing];
    let swingAngle = off.baseAngle;
    let thrustX = 0;
    let thrustY = 0;
    if (this.swingTimerMs > 0) {
      const t = 1 - this.swingTimerMs / this.swingDurationMs;
      const arc = Math.sin(t * Math.PI);
      const dirSign = this.facing === 'left' ? -1 : 1;
      swingAngle = off.baseAngle + dirSign * (-55 + t * 115);
      thrustX = (this.facing === 'left' ? -1 : this.facing === 'right' ? 1 : 0) * arc * 4;
      thrustY = (this.facing === 'up' ? -1 : this.facing === 'down' ? 1 : 0) * arc * 4;
    }
    this.heldItemSprite.setPosition(off.x + thrustX, off.y + thrustY);
    this.heldItemSprite.setFlipX(off.flipX);
    this.heldItemSprite.setAngle(swingAngle);
    if (this.facing === 'up') {
      this.sendToBack(this.heldItemSprite);
      this.sendToBack(this.shadow);
    } else {
      this.bringToTop(this.heldItemSprite);
    }
  }

  public playHeroAnim(anim: string, force = false): void {
    const key = `hero_${gameState.heroClass}_${anim}_${this.facing}`;
    const fallback = `hero_${gameState.heroClass}_idle_${this.facing}`;
    const target = this.scene.anims.exists(key) ? key : fallback;
    if (!force && this.currentAnimKey === target && this.sprite.anims.isPlaying) return;
    this.currentAnimKey = target;
    this.sprite.play(target, true);
  }

  public grantDodgeMomentum(ms = 2200): void {
    this.dodgeMomentumMs = Math.max(this.dodgeMomentumMs, ms);
    this.sprite.setTint(0xffe57f);
    this.scene.time.delayedCall(180, () => {
      if (this.sprite.active) this.sprite.clearTint();
    });
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
    this.swingDurationMs = Math.max(120, lockMs);
    this.swingTimerMs = this.swingDurationMs;
    this.playHeroAnim(animName, true);
    this.scene.time.delayedCall(lockMs, () => {
      this.isActionLocked = false;
    });
    return true;
  }

  public takeDamage(
    amount: number,
    knockX: number,
    knockY: number,
    isWalkable?: (nx: number, ny: number) => boolean,
  ): boolean {
    if (this.invulnerableMs > 0 || gameState.hp <= 0) return false;
    const mitigated = Math.max(1, amount - Math.floor(gameState.getArmorDefense() * 0.6));
    gameState.hp = Math.max(0, gameState.hp - mitigated);
    this.invulnerableMs = 650;
    SFX.playPlayerHurt();
    this.sprite.setTintFill(0xff6b6b);
    this.scene.time.delayedCall(120, () => {
      if (this.sprite.active) this.sprite.clearTint();
    });
    applySafeKnockback(this, knockX, knockY, 8, isWalkable, 4);
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
    if (this.dodgeMomentumMs > 0) this.dodgeMomentumMs = Math.max(0, this.dodgeMomentumMs - dtMs);
    if (this.actionCooldownMs > 0) this.actionCooldownMs = Math.max(0, this.actionCooldownMs - dtMs);
    if (this.dashCooldownMs > 0) this.dashCooldownMs = Math.max(0, this.dashCooldownMs - dtMs);
    if (this.swingTimerMs > 0) this.swingTimerMs = Math.max(0, this.swingTimerMs - dtMs);
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
        this.footstepTimerMs -= dtMs;
        if (this.footstepTimerMs <= 0) {
          this.footstepTimerMs = 260;
          SFX.playFootstep('grass');
          const dust = this.scene.add.circle(this.x + Phaser.Math.Between(-3, 3), this.y + 1, 1.8, 0xd8d2c5, 0.45).setDepth(this.y - 1);
          this.scene.tweens.add({
            targets: dust,
            y: dust.y - 4,
            scale: 0.3,
            alpha: 0,
            duration: 240,
            onComplete: () => dust.destroy(),
          });
        }
      }
    } else if (!this.isActionLocked) {
      this.footstepTimerMs = 60;
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

    this.syncHeldItem();
    this.setDepth(this.y);
  }
}

export class FoxCompanion extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Sprite;
  private facing: Direction = 'down';
  private curAnim = '';
  private attackCooldownMs = 2500;
  private forageCooldownMs = 18000;
  private strikeLungeMs = 0;
  private strikeTargetX = 0;
  private strikeTargetY = 0;

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

  public updateCompanion(
    dtMs: number,
    targetX: number,
    targetY: number,
    assists?: {
      findTarget: () => { x: number; y: number } | null;
      onBite: (x: number, y: number, dmg: number) => void;
      onForage: (x: number, y: number) => void;
    },
  ): void {
    if (this.attackCooldownMs > 0) this.attackCooldownMs -= dtMs;
    if (this.forageCooldownMs > 0) this.forageCooldownMs -= dtMs;
    if (this.strikeLungeMs > 0) this.strikeLungeMs -= dtMs;

    if (assists) {
      if (this.attackCooldownMs <= 0) {
        const foe = assists.findTarget();
        if (foe && Math.hypot(foe.x - targetX, foe.y - targetY) <= 78) {
          this.attackCooldownMs = 5200;
          this.strikeLungeMs = 260;
          this.strikeTargetX = foe.x;
          this.strikeTargetY = foe.y;
          const dmg = Math.round(5 + gameState.level * 1.5);
          assists.onBite(foe.x, foe.y, dmg);
        }
      }
      if (this.forageCooldownMs <= 0 && !assists.findTarget()) {
        this.forageCooldownMs = 21000;
        assists.onForage(this.x, this.y);
      }
    }

    const goalX = this.strikeLungeMs > 0 ? this.strikeTargetX : targetX - 16;
    const goalY = this.strikeLungeMs > 0 ? this.strikeTargetY : targetY + 6;
    const dx = goalX - this.x;
    const dy = goalY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 140) {
      this.x = targetX - 16;
      this.y = targetY + 6;
    } else if (dist > (this.strikeLungeMs > 0 ? 4 : 14)) {
      const spd = Math.min(this.strikeLungeMs > 0 ? 180 : 95, dist * 4.0) * (dtMs / 1000);
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
