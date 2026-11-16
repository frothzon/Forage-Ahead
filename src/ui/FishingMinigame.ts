import { SFX } from '../core/SoundFX';

export class FishingMinigame {
  private container: HTMLElement | null = null;
  private active = false;
  private elapsedMs = 0;
  private readonly maxDurationMs = 20000;

  private barPos = 0.25; // 0..1 bottom..top (bottom edge of catch bar)
  private barVel = 0;
  private readonly barHeight = 0.26;

  private fishPos = 0.45;
  private fishTarget = 0.65;
  private fishMoveTimer = 0;

  private progress = 0.32;
  private holding = false;
  private rafId?: number;
  private lastTs = 0;

  private onFinish?: (caught: boolean) => void;
  private keyDownHandler?: (e: KeyboardEvent) => void;
  private keyUpHandler?: (e: KeyboardEvent) => void;

  public isActive(): boolean {
    return this.active;
  }

  public start(onFinish: (caught: boolean) => void): void {
    if (this.active) return;
    this.active = true;
    this.onFinish = onFinish;
    this.elapsedMs = 0;
    this.barPos = 0.2;
    this.barVel = 0;
    this.fishPos = 0.45;
    this.fishTarget = 0.68;
    this.fishMoveTimer = 0;
    this.progress = 0.32;
    this.holding = false;

    const root = document.getElementById('hud-root');
    if (!root) {
      this.finish(true);
      return;
    }

    const wrap = document.createElement('div');
    wrap.id = 'fishing-minigame-overlay';
    wrap.className = 'hud-interactive';
    wrap.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      background: rgba(12, 22, 36, 0.95);
      border: 2.5px solid #59a8d9;
      border-radius: 10px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      z-index: 40;
      box-shadow: 0 10px 30px rgba(0,0,0,0.65);
      color: #f6eedc;
    `;

    wrap.innerHTML = `
      <div style="display:flex; justify-content:space-between; width:100%; align-items:center; gap:12px;">
        <strong style="font-size:12px; color:#8ae6ff;">REELING IN!</strong>
        <span id="fish-timer" style="font-size:12px; font-weight:700; color:#ffe066;">20.0s</span>
      </div>
      <div style="display:flex; gap:10px; align-items:stretch; height:210px;">
        <!-- Water Track -->
        <div id="fish-track" style="position:relative; width:34px; height:210px; background:linear-gradient(180deg, #1b527a 0%, #0e2d47 100%); border:2px solid #75b8e0; border-radius:6px; overflow:hidden;">
          <div id="fish-bar" style="position:absolute; left:2px; right:2px; height:54px; background:rgba(104, 232, 134, 0.65); border:1.5px solid #a8ffbb; border-radius:4px;"></div>
          <img id="fish-sprite" src="assets/ui_icons/fish.png" style="position:absolute; left:50%; transform:translateX(-50%); width:22px; height:22px; image-rendering:pixelated; pointer-events:none;" />
        </div>
        <!-- Catch Progress Meter -->
        <div style="width:14px; height:210px; background:#0b131f; border:1.5px solid #486485; border-radius:4px; position:relative; overflow:hidden;">
          <div id="fish-prog" style="position:absolute; left:0; right:0; bottom:0; height:32%; background:linear-gradient(180deg, #ffe066 0%, #59d97d 100%);"></div>
        </div>
      </div>
      <button id="fish-reel-btn" class="hud-btn primary" style="width:100%; font-size:11px;">Hold Click / Space to Reel</button>
      <div style="font-size:10px; color:#9db6cf;">[ESC] Cancel</div>
    `;

    wrap.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.holding = true;
    });
    wrap.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      this.holding = false;
    });
    wrap.addEventListener('pointerleave', () => {
      this.holding = false;
    });

    this.keyDownHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        e.preventDefault();
        this.holding = true;
      } else if (e.code === 'Escape') {
        this.finish(false);
      }
    };
    this.keyUpHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        this.holding = false;
      }
    };
    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);

    root.appendChild(wrap);
    this.container = wrap;
    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
  }

  private tick(ts: number): void {
    if (!this.active) return;
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    this.elapsedMs += dt * 1000;

    // 1. Catch Bar physics (Stardew-style gravity + upward thrust + bottom bounce)
    const accel = this.holding ? 2.4 : -1.95;
    this.barVel = Math.max(-1.4, Math.min(1.4, this.barVel + accel * dt));
    this.barPos += this.barVel * dt;
    if (this.barPos < 0) {
      this.barPos = 0;
      this.barVel = Math.abs(this.barVel) * 0.35;
    }
    if (this.barPos > 1 - this.barHeight) {
      this.barPos = 1 - this.barHeight;
      this.barVel = 0;
    }

    // 2. Fish swimming AI
    this.fishMoveTimer -= dt;
    if (this.fishMoveTimer <= 0) {
      this.fishMoveTimer = 0.65 + Math.random() * 0.95;
      this.fishTarget = 0.08 + Math.random() * 0.82;
    }
    const fishDiff = this.fishTarget - this.fishPos;
    this.fishPos += Math.sign(fishDiff) * Math.min(Math.abs(fishDiff), 0.42 * dt);

    // 3. Overlap check -> fill/drain progress
    const barTop = this.barPos + this.barHeight;
    const overlapping = this.fishPos >= this.barPos - 0.03 && this.fishPos <= barTop + 0.03;
    this.progress += (overlapping ? 0.27 : -0.15) * dt;

    // 4. Update DOM visuals
    if (this.container) {
      const trackH = 210;
      const barEl = this.container.querySelector<HTMLElement>('#fish-bar');
      const fishEl = this.container.querySelector<HTMLElement>('#fish-sprite');
      const progEl = this.container.querySelector<HTMLElement>('#fish-prog');
      const timerEl = this.container.querySelector<HTMLElement>('#fish-timer');

      if (barEl) {
        barEl.style.bottom = `${Math.round(this.barPos * trackH)}px`;
        barEl.style.background = overlapping
          ? 'rgba(110, 240, 140, 0.78)'
          : 'rgba(235, 130, 95, 0.55)';
      }
      if (fishEl) {
        fishEl.style.bottom = `${Math.round(this.fishPos * (trackH - 22))}px`;
      }
      if (progEl) {
        progEl.style.height = `${Math.max(0, Math.min(100, this.progress * 100))}%`;
      }
      if (timerEl) {
        const rem = Math.max(0, (this.maxDurationMs - this.elapsedMs) / 1000);
        timerEl.textContent = `${rem.toFixed(1)}s`;
      }
    }

    if (this.progress >= 1) {
      SFX.playLevelUp();
      this.finish(true);
      return;
    }
    if (this.progress <= 0 || this.elapsedMs >= this.maxDurationMs) {
      SFX.playHit();
      this.finish(false);
      return;
    }

    this.rafId = requestAnimationFrame((nextTs) => this.tick(nextTs));
  }

  public finish(caught: boolean): void {
    if (!this.active) return;
    this.active = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.keyDownHandler) window.removeEventListener('keydown', this.keyDownHandler);
    if (this.keyUpHandler) window.removeEventListener('keyup', this.keyUpHandler);
    this.container?.remove();
    this.container = null;
    this.onFinish?.(caught);
  }
}
