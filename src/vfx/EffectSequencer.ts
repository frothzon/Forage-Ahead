import Phaser from 'phaser';
import { SFX } from '../core/SoundFX';
import { EFFECT_SEQUENCES, type EffectSequenceDef, type EffectStep } from '../data/effectSequences';
import type { CameraRig } from './CameraRig';

export interface PlayEffectOptions {
  x: number;
  y: number;
  tint?: number;
  scale?: number;
}

interface ActiveParticle {
  obj: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  gravityY: number;
  groundY: number;
  bounce: boolean;
  elapsedMs: number;
  lifespanMs: number;
  scaleStart: number;
  scaleEnd: number;
}

/**
 * Data-driven multi-stage VFX pipeline unifying particles, SoundFX,
 * shockwave rings, additive flash lights, camera trauma, and selective hitstop.
 */
export class EffectSequencer {
  private readonly scene: Phaser.Scene;
  private readonly cameraRig?: CameraRig;
  private readonly onHitstop?: (durationMs: number) => void;
  private readonly particles: ActiveParticle[] = [];
  private readonly updateListener: (_time: number, dtMs: number) => void;

  constructor(
    scene: Phaser.Scene,
    opts?: { cameraRig?: CameraRig; onHitstop?: (durationMs: number) => void },
  ) {
    this.scene = scene;
    this.cameraRig = opts?.cameraRig;
    this.onHitstop = opts?.onHitstop;

    this.updateListener = (_time: number, dtMs: number) => this.updateParticles(dtMs);
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.updateListener);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.updateListener);
      this.clearParticles();
    });
  }

  public play(sequenceId: string | EffectSequenceDef, opts: PlayEffectOptions): void {
    const def = typeof sequenceId === 'string' ? EFFECT_SEQUENCES[sequenceId] : sequenceId;
    if (!def) return;

    for (const step of def.steps) {
      if (step.delayMs <= 0) {
        this.executeStep(step, opts);
      } else {
        this.scene.time.delayedCall(step.delayMs, () => {
          if (this.scene.sys?.isActive()) {
            this.executeStep(step, opts);
          }
        });
      }
    }
  }

  private executeStep(step: EffectStep, opts: PlayEffectOptions): void {
    const { x, y } = opts;
    switch (step.type) {
      case 'particles':
        this.spawnParticles(step, opts);
        break;
      case 'sound': {
        const fn = SFX[step.sfx] as (() => void) | undefined;
        if (typeof fn === 'function') {
          if (step.pitchScale && step.pitchScale !== 1) {
            SFX.withPitchScale(step.pitchScale, () => fn.call(SFX));
          } else {
            fn.call(SFX);
          }
        }
        break;
      }
      case 'ring': {
        const r0 = Math.max(1, step.radiusStart);
        const ring = this.scene.add
          .circle(x, y, r0, step.color, 0)
          .setStrokeStyle(step.lineWidth ?? 2, step.color, 0.95)
          .setDepth(y + 18);
        this.scene.tweens.add({
          targets: ring,
          scale: step.radiusEnd / r0,
          alpha: 0,
          duration: step.durationMs,
          ease: 'Cubic.Out',
          onComplete: () => ring.destroy(),
        });
        break;
      }
      case 'flashLight': {
        const glow = this.scene.add
          .circle(x, y, step.radius, step.color, Math.min(0.65, step.intensity * 0.35))
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(y + 20);
        this.scene.tweens.add({
          targets: glow,
          scale: { from: 0.75, to: 1.25 },
          alpha: 0,
          duration: step.durationMs,
          ease: 'Quad.Out',
          onComplete: () => glow.destroy(),
        });
        break;
      }
      case 'shake':
        if (this.cameraRig) {
          this.cameraRig.addTrauma(step.trauma);
        } else {
          this.scene.cameras.main?.shake(Math.round(step.trauma * 320), step.trauma * 0.015);
        }
        break;
      case 'hitstop':
        if (this.onHitstop) {
          this.onHitstop(step.durationMs);
        } else {
          this.scene.time.timeScale = 0.18;
          this.scene.time.delayedCall(Math.max(12, Math.round(step.durationMs * 0.2)), () => {
            if (this.scene.time) this.scene.time.timeScale = 1;
          });
        }
        break;
    }
  }

  private spawnParticles(
    step: Extract<EffectStep, { type: 'particles' }>,
    opts: PlayEffectOptions,
  ): void {
    const textures = Array.isArray(step.texture) ? step.texture : [step.texture];
    const [spdMin, spdMax] = step.speed;
    const [lifeMin, lifeMax] = step.lifespan;
    const [scaleStart, scaleEnd] = step.scale ?? [1, 0.3];
    const tint = opts.tint ?? step.tint;
    const scaleMult = opts.scale ?? 1;

    for (let i = 0; i < step.count; i++) {
      const texKey = textures[i % textures.length];
      const px = opts.x + Phaser.Math.FloatBetween(-4, 4);
      const py = opts.y + Phaser.Math.FloatBetween(-4, 2);

      let obj: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
      if (texKey && this.scene.textures.exists(texKey)) {
        const img = this.scene.add.image(px, py, texKey);
        if (tint !== undefined) img.setTint(tint);
        obj = img;
      } else {
        obj = this.scene.add.rectangle(px, py, 3, 3, tint ?? 0xffffff);
      }

      obj.setDepth(opts.y + 16).setScale(scaleStart * scaleMult);
      if (step.blendMode === 'ADD') {
        obj.setBlendMode(Phaser.BlendModes.ADD);
      }

      const spd = Phaser.Math.FloatBetween(spdMin, spdMax);
      let vx: number;
      let vy: number;
      if (step.riseOnly) {
        const ang = Phaser.Math.FloatBetween(-Math.PI * 0.85, -Math.PI * 0.15);
        vx = Math.cos(ang) * spd * 0.7;
        vy = Math.sin(ang) * spd;
      } else {
        const ang = Math.random() * Math.PI * 2;
        vx = Math.cos(ang) * spd;
        vy = Math.sin(ang) * spd * 0.75 - (step.gravityY && step.gravityY > 0 ? Phaser.Math.FloatBetween(26, 52) : 0);
      }

      this.particles.push({
        obj,
        vx,
        vy,
        gravityY: step.gravityY ?? 0,
        groundY: opts.y + Phaser.Math.FloatBetween(3, 8),
        bounce: Boolean(step.bounce),
        elapsedMs: 0,
        lifespanMs: Phaser.Math.FloatBetween(lifeMin, lifeMax),
        scaleStart: scaleStart * scaleMult,
        scaleEnd: scaleEnd * scaleMult,
      });
    }
  }

  private updateParticles(dtMs: number): void {
    if (this.particles.length === 0) return;
    const dt = Math.min(0.05, dtMs / 1000);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.elapsedMs += dtMs;
      const t = Math.min(1, p.elapsedMs / p.lifespanMs);
      if (t >= 1 || !p.obj.active) {
        if (p.obj.active) p.obj.destroy();
        this.particles.splice(i, 1);
        continue;
      }

      p.vy += p.gravityY * dt;
      p.obj.x += p.vx * dt;
      p.obj.y += p.vy * dt;

      if (p.bounce && p.obj.y >= p.groundY && p.vy > 0) {
        p.obj.y = p.groundY;
        p.vy = -p.vy * 0.48;
        p.vx *= 0.72;
      }

      const s = Phaser.Math.Linear(p.scaleStart, p.scaleEnd, t);
      p.obj.setScale(s);
      p.obj.setAlpha(t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
      if (p.gravityY > 0) {
        p.obj.angle += p.vx * dt * 2.2;
      }
    }
  }

  private clearParticles(): void {
    for (const p of this.particles) {
      if (p.obj.active) p.obj.destroy();
    }
    this.particles.length = 0;
  }
}
