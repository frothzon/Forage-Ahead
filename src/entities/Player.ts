import Phaser from 'phaser';
import { gameState } from '../core/GameState';
import { Haptics } from '../core/Haptics';
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
  private dashTrailTimerMs = 0;
  private exhaustedTimerMs = 0;
  private hitstopMs = 0;
  private baseFeetOffset = 8;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    const heroInfo = (manifest.heroes as Record<string, { idle?: { feetOffset?: number } }>)[
      gameState.heroClass
    ];
    const feetOffset = heroInfo?.idle?.feetOffset ?? 8;
    this.baseFeetOffset = feetOffset;
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

  public applyHitstop(ms: number): void {
    if (ms <= 0) return;
    this.hitstopMs = Math.max(this.hitstopMs, ms);
    if (this.sprite.anims?.isPlaying) {
      this.sprite.anims.pause();
    }
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
    Haptics.impactMedium();
    this.playHeroAnim('dash', true);
    // Stretch along the dash velocity vector
    const horiz = Math.abs(this.dashDir.x) >= Math.abs(this.dashDir.y);
    this.sprite.setScale(horiz ? 1.22 : 0.84, horiz ? 0.82 : 1.2);
    gameState.emitVitals();
    return true;
  }

  public isExhausted(): boolean {
    return this.exhaustedTimerMs > 0;
  }

  public triggerExhausted(durationMs = 2000): boolean {
    if (this.exhaustedTimerMs > 0) return false;
    this.exhaustedTimerMs = durationMs;
    this.actionCooldownMs = Math.max(this.actionCooldownMs, durationMs);
    this.swingTimerMs = 0;
    this.isActionLocked = false;
    this.heldItemSprite.setVisible(false);
    this.playHeroAnim('idle', true);
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setScale(1, 1);
    this.sprite.y = -this.baseFeetOffset;
    this.sprite.setTint(0x9fc2e6);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleY: 0.84,
      scaleX: 1.09,
      y: -this.baseFeetOffset + 2.5,
      duration: 240,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.InOut',
      onComplete: () => {
        if (!this.sprite.active) return;
        this.sprite.setScale(1, 1);
        this.sprite.y = -this.baseFeetOffset;
        this.sprite.clearTint();
      },
    });
    // Sweat drop particles
    for (let i = 0; i < 3; i++) {
      const drop = this.scene.add
        .circle(this.x + (i - 1) * 5, this.y - 12, 1.5, 0x7ce8ff, 0.9)
        .setDepth(this.y + 10);
      this.scene.tweens.add({
        targets: drop,
        x: drop.x + (i - 1) * 6,
        y: drop.y + 8,
        alpha: 0,
        duration: 420 + i * 90,
        delay: i * 110,
        ease: 'Quad.In',
        onComplete: () => drop.destroy(),
      });
    }
    return true;
  }

  public startAction(
    animName: string,
    cooldownMs: number,
    aimDx: number,
    aimDy: number,
    lockMs = 180,
  ): boolean {
    if (this.exhaustedTimerMs > 0 || this.actionCooldownMs > 0 || this.isDashing) return false;
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
    Haptics.impactHeavy();
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(55, () => {
      if (!this.sprite.active) return;
      this.sprite.setTint(0xff6b6b);
      this.scene.time.delayedCall(65, () => {
        if (this.sprite.active) this.sprite.clearTint();
      });
    });
    applySafeKnockback(this, knockX, knockY, 8, isWalkable, 4);
    gameState.emitVitals();
    return true;
  }

  private canStandAt(
    px: number,
    py: number,
    isWalkable: (nx: number, ny: number) => boolean,
  ): boolean {
    const hw = 3.5;
    const hh = 2;
    return (
      isWalkable(px, py) &&
      isWalkable(px - hw, py - hh) &&
      isWalkable(px + hw, py - hh) &&
      isWalkable(px - hw, py + hh) &&
      isWalkable(px + hw, py + hh)
    );
  }

  public updatePlayer(
    dtMs: number,
    inputDir: Phaser.Math.Vector2,
    isWalkable: (nx: number, ny: number) => boolean,
    speedBonus = 1,
    stepColor = 0xd8d2c5,
    surface: 'grass' | 'sand' | 'stone' | 'snow' = 'grass',
  ): void {
    if (this.hitstopMs > 0) {
      this.hitstopMs = Math.max(0, this.hitstopMs - dtMs);
      if (this.hitstopMs <= 0 && this.sprite.anims?.isPaused) {
        this.sprite.anims.resume();
      }
      return;
    }
    const dt = dtMs / 1000;
    if (this.dodgeMomentumMs > 0) this.dodgeMomentumMs = Math.max(0, this.dodgeMomentumMs - dtMs);
    if (this.exhaustedTimerMs > 0) this.exhaustedTimerMs = Math.max(0, this.exhaustedTimerMs - dtMs);
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
      this.dashTrailTimerMs -= dtMs;
      if (this.dashTrailTimerMs <= 0) {
        this.dashTrailTimerMs = 38;
        const ghost = this.scene.add
          .sprite(this.x, this.y - this.baseFeetOffset, this.sprite.texture.key, this.sprite.frame.name)
          .setTint(0x7ce8ff)
          .setAlpha(0.55)
          .setDepth(this.depth - 1);
        this.scene.tweens.add({
          targets: ghost,
          alpha: 0,
          scale: 0.85,
          duration: 180,
          onComplete: () => ghost.destroy(),
        });
      }
      if (this.dashTimerMs <= 0) {
        this.isDashing = false;
        this.scene.tweens.add({
          targets: this.sprite,
          scaleX: 1,
          scaleY: 1,
          duration: 90,
          ease: 'Back.easeOut',
        });
      }
    } else if (inputDir.lengthSq() > 0.01) {
      const spd = gameState.getMoveSpeed() * speedBonus * (this.isActionLocked ? 0.45 : 1);
      const inputMag = Math.min(1, inputDir.length());
      const norm = inputDir.clone().normalize();
      vx = norm.x * spd * inputMag;
      vy = norm.y * spd * inputMag;
      if (!this.isActionLocked) {
        this.facing = vectorToDirection(norm.x, norm.y, this.facing);
        this.playHeroAnim('walk');
        this.footstepTimerMs -= dtMs;
        if (this.footstepTimerMs <= 0) {
          this.footstepTimerMs = 260;
          SFX.playFootstep(surface);
          const puffCount = Math.random() < 0.45 ? 2 : 1;
          for (let i = 0; i < puffCount; i++) {
            const dustKey = Math.random() < 0.5 ? 'extras/Particle_dust_3' : 'extras/Particle_dust_4';
            const px = this.x + Phaser.Math.Between(-3, 3);
            const py = this.y + 1;
            const dust = this.scene.textures.exists(dustKey)
              ? this.scene.add.image(px, py, dustKey).setTint(stepColor).setScale(0.55).setAlpha(0.65)
              : this.scene.add.circle(px, py, 1.8, stepColor, 0.5);
            dust.setDepth(this.y - 1);
            this.scene.tweens.add({
              targets: dust,
              x: px + Phaser.Math.Between(-3, 3),
              y: py - Phaser.Math.Between(3, 6),
              scale: 0.2,
              alpha: 0,
              duration: 240,
              onComplete: () => dust.destroy(),
            });
          }
        }
      }
    } else if (!this.isActionLocked) {
      this.footstepTimerMs = 60;
      this.playHeroAnim('idle');
    }

    // If ever wedged on a shoreline/edge (e.g. from knockback), nudge back onto safe walkable ground
    if (!this.canStandAt(this.x, this.y, isWalkable)) {
      outer: for (let r = 2; r <= 18; r += 2) {
        for (const [dx, dy] of [
          [1, 0], [-1, 0], [0, 1], [0, -1],
          [1, 1], [-1, 1], [1, -1], [-1, -1],
        ]) {
          if (this.canStandAt(this.x + dx * r, this.y + dy * r, isWalkable)) {
            this.x += dx * r;
            this.y += dy * r;
            break outer;
          }
        }
      }
    }

    // Separate X / Y collision slide using the player's feet collision mask (7x4px)
    const nextX = this.x + vx * dt;
    if (this.canStandAt(nextX, this.y, isWalkable)) {
      this.x = nextX;
    }
    const nextY = this.y + vy * dt;
    if (this.canStandAt(this.x, nextY, isWalkable)) {
      this.y = nextY;
    }

    this.syncHeldItem();
    this.setDepth(this.y);
  }
}

import { getFamiliarSpecForClass, type FamiliarSpec } from '../data/familiars';

export interface FamiliarCombatHooks {
  findTarget: () => { x: number; y: number } | null;
  onBite: (x: number, y: number, dmg: number, meta?: { isCrit?: boolean; isSlam?: boolean; isFlurry?: boolean; isNova?: boolean; knockback?: number }) => void;
  onRangedBolt?: (
    fromX: number,
    fromY: number,
    target: { x: number; y: number },
    meta: { damage: number; count: number; pierce: number; tint: number; isNova: boolean; canCrit: boolean },
  ) => void;
  onForage?: (x: number, y: number, gatherPct: number, maxNodes: number) => void;
  onFetchLoot?: (x: number, y: number, radius: number) => void;
  onTendCrops?: (x: number, y: number) => void;
  onTaunt?: (x: number, y: number, radius: number) => void;
}

export class FamiliarCompanion extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Ellipse;
  private spec: FamiliarSpec;
  private curFormId = '';
  private curIsApex = false;
  private baseFeetOffset = 8;
  private facing: Direction = 'down';
  private curAnim = '';
  private attackCooldownMs = 2200;
  private forageCooldownMs = 2500;
  private fetchCooldownMs = 600;
  private cropCooldownMs = 3500;
  private tauntCooldownMs = 8000;
  private energyRegenTimerMs = 0;
  private attackCounter = 0;
  private strikeLungeMs = 0;
  private strikeTargetX = 0;
  private strikeTargetY = 0;
  private splashTimerMs = 0;
  private swimClockMs = 0;
  private hoverClockMs = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.spec = getFamiliarSpecForClass(gameState.heroClass);
    this.shadow = scene.add.ellipse(0, -1, 10, 4, 0x000000, 0.35);
    this.sprite = scene.add.sprite(0, -8, 'heroes/Fox/Fox_idle', 0);
    this.add([this.shadow, this.sprite]);
    this.syncAppearance(gameState.getFamiliarTier() >= 12, true);
    this.setDepth(y);
    scene.add.existing(this);
  }

  public syncAppearance(isApex: boolean, force = false): void {
    const newSpec = getFamiliarSpecForClass(gameState.heroClass);
    const formId = isApex ? newSpec.apexId : newSpec.baseId;
    if (!force && this.curFormId === formId && this.curIsApex === isApex) return;

    this.spec = newSpec;
    this.curFormId = formId;
    this.curIsApex = isApex;
    this.curAnim = '';

    if (newSpec.spriteKind === 'fox') {
      const foxInfo = (manifest.heroes as Record<string, { idle?: { feetOffset?: number } }>).Fox;
      const feetOffset = (foxInfo?.idle?.feetOffset ?? 8) * newSpec.scale;
      this.baseFeetOffset = feetOffset;
      this.sprite.setTexture('heroes/Fox/Fox_idle', 0);
      this.sprite.setScale(newSpec.scale);
      this.sprite.setPosition(0, -feetOffset);
      this.sprite.setTint(isApex ? newSpec.apexTint : 0xffffff);
    } else {
      const famManifest = (manifest as { familiars?: Record<string, { key: string; feetOffset?: number }> }).familiars ?? {};
      const entry = famManifest[formId] ?? famManifest[newSpec.baseId];
      const texKey = entry?.key ?? `familiars/${formId}`;
      const feetOffset = (entry?.feetOffset ?? 10) * newSpec.scale;
      this.baseFeetOffset = feetOffset;
      if (this.scene.textures.exists(texKey)) {
        this.sprite.setTexture(texKey, 1);
      }
      this.sprite.setScale(newSpec.scale);
      this.sprite.setPosition(0, -feetOffset);
      this.sprite.setTint(0xffffff);
    }

    if (!force && isApex) {
      // Brief golden evolution flash
      this.scene.tweens.add({
        targets: this.sprite,
        scaleX: newSpec.scale * 1.3,
        scaleY: newSpec.scale * 1.3,
        duration: 180,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }
    this.playAnim('idle');
  }

  private playAttackFeedback(): void {
    if (this.spec.spriteKind === 'fox') return;
    const baseScale = this.spec.scale;
    if (this.spec.heroClass === 'Gladiator') {
      this.scene.tweens.add({
        targets: this.sprite,
        scaleX: baseScale * 1.24,
        scaleY: baseScale * 0.82,
        duration: 110,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    } else {
      this.scene.tweens.add({
        targets: this.sprite,
        scaleX: baseScale * 1.18,
        scaleY: baseScale * 1.18,
        duration: 120,
        yoyo: true,
        ease: 'Sine.easeInOut',
      });
    }
  }

  public updateCompanion(
    dtMs: number,
    targetX: number,
    targetY: number,
    assists?: FamiliarCombatHooks,
    water?: {
      isWaterAt: (x: number, y: number) => boolean;
      onSplash: (x: number, y: number) => void;
      isBlockedByWall?: (x: number, y: number) => boolean;
    },
  ): void {
    const isBlocked = water?.isBlockedByWall;
    const profile = gameState.getFamiliarCombatProfile();
    this.syncAppearance(profile.isApex);

    if (this.attackCooldownMs > 0) this.attackCooldownMs -= dtMs;
    if (this.forageCooldownMs > 0) this.forageCooldownMs -= dtMs;
    if (this.fetchCooldownMs > 0) this.fetchCooldownMs -= dtMs;
    if (this.cropCooldownMs > 0) this.cropCooldownMs -= dtMs;
    if (this.tauntCooldownMs > 0) this.tauntCooldownMs -= dtMs;
    if (this.strikeLungeMs > 0) this.strikeLungeMs -= dtMs;
    this.hoverClockMs += dtMs;

    // Sorcerer passive Energy regen aura
    const regenRate = gameState.getFamiliarEnergyRegenPerSec();
    if (regenRate > 0 && Math.hypot(this.x - targetX, this.y - targetY) <= 120) {
      this.energyRegenTimerMs += dtMs;
      if (this.energyRegenTimerMs >= 1000) {
        this.energyRegenTimerMs -= 1000;
        gameState.energy = Math.min(gameState.getMaxEnergy(), gameState.energy + regenRate);
      }
    }

    const foe = assists?.findTarget() ?? null;
    if (!foe && this.strikeLungeMs > 0) {
      this.strikeLungeMs = 0;
    }

    if (assists) {
      // Combat
      if (this.attackCooldownMs <= 0 && foe && Math.hypot(foe.x - targetX, foe.y - targetY) <= profile.detectRange) {
        this.attackCooldownMs = profile.cooldownMs;
        this.attackCounter += 1;

        if (profile.attackStyle === 'ranged' && assists.onRangedBolt) {
          this.facing = vectorToDirection(foe.x - this.x, foe.y - this.y, this.facing);
          this.playAttackFeedback();
          const isNova = gameState.hasSkill('fam_so_t8') && this.attackCounter % 5 === 0;
          assists.onRangedBolt(this.x, this.y - 6, foe, {
            damage: isNova ? Math.round(profile.damage * 1.45) : profile.damage,
            count: profile.projectileCount,
            pierce: profile.pierceCount,
            tint: this.spec.projectileTint,
            isNova,
            canCrit: profile.canCrit,
          });
        } else {
          this.strikeLungeMs = 240;
          this.strikeTargetX = foe.x;
          this.strikeTargetY = foe.y;
          this.playAttackFeedback();

          const isSlam =
            this.spec.heroClass === 'Gladiator' &&
            gameState.hasSkill('fam_gl_t6') &&
            this.attackCounter % (profile.isApex ? 2 : 3) === 0;
          const isFlurry =
            this.spec.heroClass === 'Beastmaster' &&
            gameState.hasSkill('fam_bm_t8') &&
            this.attackCounter % 4 === 0;
          const isCrit = profile.canCrit && Math.random() < gameState.getCritChance();
          const dmg = isCrit ? Math.round(profile.damage * gameState.getCritDamageMultiplier()) : profile.damage;

          assists.onBite(foe.x, foe.y, dmg, {
            isCrit,
            isSlam,
            isFlurry,
            knockback: profile.knockback,
          });
        }
      }

      // Beastmaster Utility (gated behind Skills!)
      if (gameState.hasSkill('fam_bm_t1') && this.forageCooldownMs <= 0 && !foe && assists.onForage) {
        this.forageCooldownMs = 2500;
        const pct = gameState.hasSkill('fam_bm_t9') ? 0.85 : 0.25;
        const maxNodes = gameState.hasSkill('fam_bm_t9') ? 2 : 1;
        assists.onForage(this.x, this.y, pct, maxNodes);
      }

      if (gameState.hasSkill('fam_bm_t2') && this.fetchCooldownMs <= 0 && assists.onFetchLoot) {
        this.fetchCooldownMs = 550;
        assists.onFetchLoot(this.x, this.y, 96);
      }

      if (gameState.hasSkill('fam_bm_t5') && this.cropCooldownMs <= 0 && !foe && assists.onTendCrops) {
        this.cropCooldownMs = 3500;
        assists.onTendCrops(this.x, this.y);
      }

      // Gladiator Taunt (T3+)
      if (gameState.hasSkill('fam_gl_t3') && this.tauntCooldownMs <= 0 && foe && assists.onTaunt) {
        this.tauntCooldownMs = 8000;
        assists.onTaunt(this.x, this.y, 72);
      }
    }

    // Positioning: Gladiator T1 Bulwark Stance positions between player and nearest foe
    let restX = targetX - 16;
    let restY = targetY + 6;
    if (
      this.spec.heroClass === 'Gladiator' &&
      gameState.hasSkill('fam_gl_t1') &&
      foe &&
      Math.hypot(foe.x - targetX, foe.y - targetY) <= 110
    ) {
      const fdx = foe.x - targetX;
      const fdy = foe.y - targetY;
      const fdist = Math.hypot(fdx, fdy) || 1;
      const offset = Math.min(28, fdist * 0.45);
      restX = targetX + (fdx / fdist) * offset;
      restY = targetY + (fdy / fdist) * offset;
    }
    if (isBlocked && isBlocked(restX, restY)) {
      const fallbacks: ReadonlyArray<[number, number]> = [
        [16, 6],
        [-12, -10],
        [12, -10],
        [0, 14],
        [0, -14],
        [0, 0],
      ];
      for (const [ox, oy] of fallbacks) {
        const cx = targetX + ox;
        const cy = targetY + oy;
        if (!isBlocked(cx, cy)) {
          restX = cx;
          restY = cy;
          break;
        }
      }
    }

    const goalX = this.strikeLungeMs > 0 ? this.strikeTargetX : restX;
    const goalY = this.strikeLungeMs > 0 ? this.strikeTargetY : restY;
    const dx = goalX - this.x;
    const dy = goalY - this.y;
    const dist = Math.hypot(dx, dy);
    let isMoving = false;
    if (dist > 140) {
      if (!isBlocked || !isBlocked(restX, restY)) {
        this.x = restX;
        this.y = restY;
      } else {
        this.x = targetX;
        this.y = targetY;
      }
    } else if (dist > (this.strikeLungeMs > 0 ? 4 : 14)) {
      const spd = Math.min(this.strikeLungeMs > 0 ? 185 : 98, dist * 4.0) * (dtMs / 1000);
      const nextX = this.x + (dx / dist) * spd;
      const nextY = this.y + (dy / dist) * spd;
      if (isBlocked) {
        if (!isBlocked(nextX, nextY)) {
          this.x = nextX;
          this.y = nextY;
          isMoving = true;
        } else if (!isBlocked(nextX, this.y)) {
          this.x = nextX;
          isMoving = true;
        } else if (!isBlocked(this.x, nextY)) {
          this.y = nextY;
          isMoving = true;
        } else {
          this.strikeLungeMs = 0;
        }
      } else {
        this.x = nextX;
        this.y = nextY;
        isMoving = true;
      }

      if (isMoving) {
        this.facing = vectorToDirection(dx, dy, this.facing);
        this.playAnim('walk');
      } else {
        this.playAnim('idle');
      }
    } else {
      this.playAnim('idle');
    }

    const inWater = Boolean(water?.isWaterAt(this.x, this.y));
    if (inWater) {
      this.swimClockMs += dtMs;
      this.shadow.setVisible(false);
      this.sprite.y = -this.baseFeetOffset + 4.5 + Math.sin(this.swimClockMs * 0.012) * 1.1;
      const fw = this.sprite.width || 16;
      const fh = this.sprite.height || 16;
      this.sprite.setCrop(0, 0, fw, Math.round(fh * 0.62));
      this.playAnim('walk');
      this.splashTimerMs -= dtMs;
      if (this.splashTimerMs <= 0) {
        this.splashTimerMs = isMoving ? 340 : 780;
        water?.onSplash(this.x, this.y);
      }
    } else {
      this.shadow.setVisible(true);
      this.sprite.setCrop();
      const hoverY =
        this.spec.heroClass === 'Sorcerer' || this.spec.heroClass === 'Swashbuckler'
          ? Math.sin(this.hoverClockMs * 0.006) * 2
          : 0;
      this.sprite.y = -this.baseFeetOffset + hoverY;
      this.splashTimerMs = 0;
    }

    this.setDepth(this.y);
  }

  private playAnim(anim: 'idle' | 'walk'): void {
    const key =
      this.spec.spriteKind === 'fox'
        ? `hero_Fox_${anim}_${this.facing}`
        : `fam_${this.curFormId}_${anim}_${this.facing}`;
    if (this.curAnim === key) return;
    this.curAnim = key;
    if (this.scene.anims.exists(key)) this.sprite.play(key, true);
  }
}

export { FamiliarCompanion as FoxCompanion };
