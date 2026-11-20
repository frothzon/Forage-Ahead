import Phaser from 'phaser';

export interface CameraRigOptions {
  maxShakePx?: number;
  maxLookAheadPx?: number;
  traumaDecayPerSec?: number;
}

/**
 * Layered camera controller providing Trauma^2 sinusoidal shake,
 * directional recoil kicks, subtle aim/movement look-ahead, and zoom punches.
 */
export class CameraRig {
  private readonly scene: Phaser.Scene;
  private readonly maxShakePx: number;
  private readonly maxLookAheadPx: number;
  private readonly traumaDecayPerSec: number;

  private trauma = 0;
  private clockSec = 0;

  private kickX = 0;
  private kickY = 0;
  private kickTimerMs = 0;
  private kickDurationMs = 80;

  private targetLookX = 0;
  private targetLookY = 0;
  private lookX = 0;
  private lookY = 0;

  private zoomPulse = 0;
  private zoomPulseTween?: Phaser.Tweens.Tween;
  private focusActive = false;

  constructor(scene: Phaser.Scene, opts?: CameraRigOptions) {
    this.scene = scene;
    this.maxShakePx = opts?.maxShakePx ?? 7.5;
    this.maxLookAheadPx = opts?.maxLookAheadPx ?? 11;
    this.traumaDecayPerSec = opts?.traumaDecayPerSec ?? 1.85;
  }

  public addTrauma(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  public kick(dirX: number, dirY: number, distancePx = 3, durationMs = 80): void {
    const len = Math.hypot(dirX, dirY);
    if (len < 0.001) return;
    this.kickX = (dirX / len) * distancePx;
    this.kickY = (dirY / len) * distancePx;
    this.kickDurationMs = Math.max(20, durationMs);
    this.kickTimerMs = this.kickDurationMs;
  }

  public setLookAhead(dirX: number, dirY: number, distancePx = this.maxLookAheadPx): void {
    const len = Math.hypot(dirX, dirY);
    if (len < 0.001) {
      this.targetLookX = 0;
      this.targetLookY = 0;
      return;
    }
    const clamped = Math.min(this.maxLookAheadPx, Math.max(0, distancePx));
    this.targetLookX = (dirX / len) * clamped;
    this.targetLookY = (dirY / len) * clamped;
  }

  public zoomPunch(factor = 0.05, durationMs = 110): void {
    if (!this.scene.tweens) return;
    this.zoomPulseTween?.stop();
    const half = Math.max(30, Math.round(durationMs * 0.5));
    const state = { v: this.zoomPulse };
    this.zoomPulseTween = this.scene.tweens.add({
      targets: state,
      v: factor,
      duration: half,
      ease: 'Sine.easeOut',
      onUpdate: () => {
        this.zoomPulse = state.v;
      },
      onComplete: () => {
        this.zoomPulseTween = this.scene.tweens.add({
          targets: state,
          v: 0,
          duration: half,
          ease: 'Sine.easeIn',
          onUpdate: () => {
            this.zoomPulse = state.v;
          },
          onComplete: () => {
            this.zoomPulse = 0;
          },
        });
      },
    });
  }

  public getZoomMultiplier(): number {
    return 1 + this.zoomPulse;
  }

  public isFocusing(): boolean {
    return this.focusActive;
  }

  /**
   * Smoothly lerps the camera to `(targetX, targetY)`, runs `onArrive` (e.g. crumbling blocks,
   * unsealing a chest), holds briefly, then lerps smoothly back to `returnTarget` and resumes follow.
   */
  public focusOn(
    targetX: number,
    targetY: number,
    returnTarget: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject,
    opts?: {
      panMs?: number;
      holdMs?: number;
      onArrive?: () => void;
      onComplete?: () => void;
    },
  ): void {
    const cam = this.scene.cameras?.main;
    if (!cam || !this.scene.tweens || this.focusActive) {
      opts?.onArrive?.();
      opts?.onComplete?.();
      return;
    }

    this.focusActive = true;
    cam.stopFollow();
    const panMs = opts?.panMs ?? 320;
    const holdMs = opts?.holdMs ?? 480;
    const focal = { x: cam.midPoint.x, y: cam.midPoint.y };

    this.scene.tweens.add({
      targets: focal,
      x: targetX,
      y: targetY,
      duration: panMs,
      ease: 'Cubic.InOut',
      onUpdate: () => cam.centerOn(focal.x, focal.y),
      onComplete: () => {
        opts?.onArrive?.();
        this.scene.time.delayedCall(holdMs, () => {
          if (!this.scene.tweens || !returnTarget.active) {
            this.focusActive = false;
            opts?.onComplete?.();
            return;
          }
          this.scene.tweens.add({
            targets: focal,
            x: returnTarget.x,
            y: returnTarget.y,
            duration: panMs,
            ease: 'Cubic.InOut',
            onUpdate: () => cam.centerOn(focal.x, focal.y),
            onComplete: () => {
              cam.startFollow(returnTarget, true, 0.15, 0.15);
              this.focusActive = false;
              opts?.onComplete?.();
            },
          });
        });
      },
    });
  }

  public update(dtMs: number, baseZoom?: number): void {
    const cam = this.scene.cameras?.main;
    if (!cam) return;
    const dt = Math.min(0.05, Math.max(0, dtMs / 1000));
    this.clockSec += dt;

    // 1. Trauma^2 sinusoidal shake
    let shakeX = 0;
    let shakeY = 0;
    if (this.trauma > 0) {
      const shake = this.trauma * this.trauma;
      const t = this.clockSec;
      const nx = Math.sin(t * 31.7) * 0.6 + Math.sin(t * 53.1 + 1.3) * 0.4;
      const ny = Math.cos(t * 29.3 + 0.7) * 0.6 + Math.sin(t * 47.9 + 2.1) * 0.4;
      shakeX = nx * shake * this.maxShakePx;
      shakeY = ny * shake * this.maxShakePx;
      this.trauma = Math.max(0, this.trauma - this.traumaDecayPerSec * dt);
    }

    // 2. Directional recoil kick decay
    let curKickX = 0;
    let curKickY = 0;
    if (this.kickTimerMs > 0) {
      this.kickTimerMs = Math.max(0, this.kickTimerMs - dtMs);
      const t = this.kickTimerMs / this.kickDurationMs;
      curKickX = this.kickX * t;
      curKickY = this.kickY * t;
    }

    // 3. Subtle look-ahead lerp (skip followOffset overrides during cinematic focus pan)
    if (!this.focusActive) {
      const lookAlpha = 1 - Math.exp(-6.5 * dt);
      this.lookX = Phaser.Math.Linear(this.lookX, this.targetLookX, lookAlpha);
      this.lookY = Phaser.Math.Linear(this.lookY, this.targetLookY, lookAlpha);

      // Phaser subtracts followOffset from target position, so negate to shift camera forward
      cam.followOffset.set(-(this.lookX + curKickX + shakeX), -(this.lookY + curKickY + shakeY));
    }

    if (typeof baseZoom === 'number' && Number.isFinite(baseZoom)) {
      const targetZoom = baseZoom * (1 + this.zoomPulse);
      if (Math.abs(cam.zoom - targetZoom) > 0.002) {
        cam.setZoom(Phaser.Math.Linear(cam.zoom, targetZoom, Math.min(1, dtMs * 0.015)));
      } else if (cam.zoom !== targetZoom) {
        cam.setZoom(targetZoom);
      }
    }
  }
}
