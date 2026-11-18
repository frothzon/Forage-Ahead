import { SFX } from '../core/SoundFX';

export type FishBehavior = 'steady' | 'heavy' | 'erratic' | 'dart' | 'sinker';

export interface FishingStartOpts {
  fishName?: string;
  behavior?: FishBehavior;
}

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
  private readyTimerMs = 0;
  private goShown = false;
  private reelTickTimerMs = 0;
  private fishBehavior: FishBehavior = 'steady';
  private fishSpeed = 0.42;
  private rafId?: number;
  private lastTs = 0;

  private onFinish?: (caught: boolean) => void;
  private keyDownHandler?: (e: KeyboardEvent) => void;
  private keyUpHandler?: (e: KeyboardEvent) => void;

  public isActive(): boolean {
    return this.active;
  }

  public start(onFinish: (caught: boolean) => void, opts?: FishingStartOpts): void {
    if (this.active) return;
    this.active = true;
    this.onFinish = onFinish;
    this.fishBehavior = opts?.behavior ?? 'steady';
    this.fishSpeed = 0.42;
    const fishTitle = opts?.fishName ? `${opts.fishName}!` : 'REELING IN!';
    this.elapsedMs = 0;
    this.barPos = 0.2;
    this.barVel = 0;
    this.fishPos = 0.45;
    this.fishTarget = 0.68;
    this.fishMoveTimer = 0;
    this.progress = 0.32;
    this.holding = false;
    this.readyTimerMs = 2000;
    this.goShown = false;
    SFX.playFishBite();

    const root = document.getElementById('hud-root');
    if (!root) {
      this.finish(true);
      return;
    }

    const wrap = document.createElement('div');
    wrap.id = 'fishing-minigame-overlay';
    wrap.className = 'hud-panel hud-interactive';
    wrap.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      z-index: 40;
    `;

    wrap.innerHTML = `
      <div style="display:flex; justify-content:space-between; width:100%; align-items:center; gap:12px;">
        <strong style="font-size:12px; color:#3b2316;">${fishTitle}</strong>
        <span id="fish-timer" style="font-size:12px; font-weight:700; color:#8f5616;">20.0s</span>
      </div>
      <div style="display:flex; gap:10px; align-items:stretch; height:210px; position:relative;">
        <!-- Water Track -->
        <div id="fish-track" style="position:relative; width:38px; height:210px; background:linear-gradient(180deg, #1e5f8c 0%, #10324f 100%); border-style:solid; border-image-source:url('assets/sprout_ui/frames/backdrop_c3.png'); border-image-slice:5 5 5 5; border-image-width:10px; border-width:5px; image-rendering:pixelated; overflow:hidden;">
          <div id="fish-bar" style="position:absolute; left:2px; right:2px; height:54px; border-style:solid; border-image-source:url('assets/sprout_ui/controls/scrollbar_v_thumb_med.png'); border-image-slice:4 4 5 4 fill; border-image-width:8px 8px 10px 8px; border-width:4px; image-rendering:pixelated; opacity:0.9;"></div>
          <img id="fish-sprite" src="assets/ui_icons/fish.png" style="position:absolute; left:50%; transform:translateX(-50%); width:22px; height:22px; image-rendering:pixelated; pointer-events:none;" />
        </div>
        <!-- Catch Progress Meter -->
        <div style="width:16px; height:210px; border-style:solid; border-image-source:url('assets/sprout_ui/bars/bar_frame_empty_sm.png'); border-image-slice:3 4 3 4 fill; border-image-width:4px; border-width:3px; image-rendering:pixelated; position:relative; overflow:hidden;">
          <div id="fish-prog" style="position:absolute; left:0; right:0; bottom:0; height:32%; background:url('assets/sprout_ui/bars/bar_fill_green.png') repeat-y center / 100% 100%; image-rendering:pixelated;"></div>
        </div>
        <div id="fish-ready-banner" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; font-size:16px; font-weight:900; color:#ffe066; text-shadow:0 2px 8px rgba(0,0,0,0.95); background:rgba(36,22,12,0.5); border-radius:4px;">Ready...</div>
      </div>
      <button id="fish-reel-btn" class="hud-btn primary" style="width:100%; font-size:11px;">Hold Click / Space to Reel</button>
      <div style="font-size:10px; color:#5c3a24;">[ESC] Cancel</div>
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

    if (this.readyTimerMs > 0) {
      this.readyTimerMs = Math.max(0, this.readyTimerMs - dt * 1000);
      const bannerEl = this.container?.querySelector<HTMLElement>('#fish-ready-banner');
      if (bannerEl) {
        if (this.readyTimerMs <= 650) {
          if (!this.goShown) {
            this.goShown = true;
            SFX.playFishGo();
          }
          bannerEl.textContent = 'Go!';
          bannerEl.style.color = '#7ef29d';
          bannerEl.style.fontSize = '20px';
        } else {
          bannerEl.textContent = 'Ready...';
          bannerEl.style.color = '#ffe066';
        }
        if (this.readyTimerMs <= 0) bannerEl.style.display = 'none';
      }
      // Position initial bar and fish during countdown
      const trackH = 210;
      const barEl = this.container?.querySelector<HTMLElement>('#fish-bar');
      const fishEl = this.container?.querySelector<HTMLElement>('#fish-sprite');
      if (barEl) barEl.style.bottom = `${Math.round(this.barPos * trackH)}px`;
      if (fishEl) fishEl.style.bottom = `${Math.round(this.fishPos * (trackH - 22))}px`;
      this.rafId = requestAnimationFrame((nextTs) => this.tick(nextTs));
      return;
    }

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

    // 2. Fish swimming AI (unique movement per fish behavior)
    this.fishMoveTimer -= dt;
    if (this.fishMoveTimer <= 0) {
      if (this.fishBehavior === 'heavy') {
        const lunge = Math.random() < 0.35;
        this.fishMoveTimer = lunge ? 0.45 : 0.95 + Math.random() * 0.75;
        this.fishSpeed = lunge ? 0.78 : 0.28;
        this.fishTarget = 0.08 + Math.random() * 0.76;
      } else if (this.fishBehavior === 'erratic') {
        this.fishMoveTimer = 0.32 + Math.random() * 0.42;
        this.fishSpeed = 0.65;
        this.fishTarget = 0.06 + Math.random() * 0.86;
      } else if (this.fishBehavior === 'dart') {
        this.fishMoveTimer = 0.42 + Math.random() * 0.5;
        this.fishSpeed = 0.72;
        this.fishTarget = Math.random() < 0.5 ? 0.62 + Math.random() * 0.28 : 0.1 + Math.random() * 0.28;
      } else if (this.fishBehavior === 'sinker') {
        this.fishMoveTimer = 0.38 + Math.random() * 0.48;
        this.fishSpeed = 0.78;
        this.fishTarget = Math.random() < 0.65 ? 0.05 + Math.random() * 0.2 : 0.72 + Math.random() * 0.2;
      } else {
        this.fishMoveTimer = 0.68 + Math.random() * 0.85;
        this.fishSpeed = 0.42;
        this.fishTarget = 0.1 + Math.random() * 0.78;
      }
    }
    const fishDiff = this.fishTarget - this.fishPos;
    this.fishPos += Math.sign(fishDiff) * Math.min(Math.abs(fishDiff), this.fishSpeed * dt);

    // 3. Overlap check -> fill/drain progress
    const barTop = this.barPos + this.barHeight;
    const overlapping = this.fishPos >= this.barPos - 0.03 && this.fishPos <= barTop + 0.03;
    this.progress += (overlapping ? 0.27 : -0.15) * dt;
    if (overlapping) {
      this.reelTickTimerMs -= dt * 1000;
      if (this.reelTickTimerMs <= 0) {
        this.reelTickTimerMs = 130;
        SFX.playFishTick(this.progress);
      }
    } else {
      this.reelTickTimerMs = 30;
    }

    // 4. Update DOM visuals
    if (this.container) {
      const trackH = 210;
      const barEl = this.container.querySelector<HTMLElement>('#fish-bar');
      const fishEl = this.container.querySelector<HTMLElement>('#fish-sprite');
      const progEl = this.container.querySelector<HTMLElement>('#fish-prog');
      const timerEl = this.container.querySelector<HTMLElement>('#fish-timer');

      if (barEl) {
        barEl.style.bottom = `${Math.round(this.barPos * trackH)}px`;
        barEl.style.filter = overlapping
          ? 'hue-rotate(65deg) saturate(1.4) brightness(1.1)'
          : 'none';
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
      SFX.playFishCatch();
      this.finish(true);
      return;
    }
    if (this.progress <= 0 || this.elapsedMs >= this.maxDurationMs) {
      SFX.playFishFail();
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
