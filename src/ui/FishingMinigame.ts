import { Haptics } from '../core/Haptics';
import { SFX } from '../core/SoundFX';

export type FishBehavior = 'steady' | 'heavy' | 'erratic' | 'dart' | 'sinker';

export interface FishingStartOpts {
  fishName?: string;
  behavior?: FishBehavior;
}

const BEHAVIOR_LABELS: Record<FishBehavior, { label: string; color: string }> = {
  steady: { label: 'Steady', color: '#7ef29d' },
  heavy: { label: 'Heavy', color: '#ffbe76' },
  erratic: { label: 'Erratic', color: '#ff7eb6' },
  dart: { label: 'Dart', color: '#7ce8ff' },
  sinker: { label: 'Sinker', color: '#c49eff' },
};

export class FishingMinigame {
  private container: HTMLElement | null = null;
  private active = false;
  private elapsedMs = 0;
  private readonly maxDurationMs = 20000;

  private barPos = 0.25; // 0..1 bottom..top (bottom edge of catch bar)
  private barVel = 0;
  private readonly barHeight = 0.26;
  private barBounceSquash = 0;

  private fishPos = 0.45;
  private fishTarget = 0.65;
  private fishMoveTimer = 0;

  private progress = 0.32;
  private holding = false;
  private readyTimerMs = 0;
  private goShown = false;
  private reelTickTimerMs = 0;
  private overlapGraceMs = 0;
  private fishBehavior: FishBehavior = 'steady';
  private fishSpeed = 0.42;
  private rafId?: number;
  private lastTs = 0;
  private stylesInjected = false;

  private onFinish?: (caught: boolean) => void;
  private keyDownHandler?: (e: KeyboardEvent) => void;
  private keyUpHandler?: (e: KeyboardEvent) => void;

  public isActive(): boolean {
    return this.active;
  }

  public isHolding(): boolean {
    return this.holding;
  }

  public setHolding(holding: boolean): void {
    if (!this.active) return;
    this.holding = holding;
    const btn = this.container?.querySelector<HTMLElement>('#fish-reel-btn');
    if (btn) {
      btn.classList.toggle('is-pressed', holding);
    }
  }

  private ensureStyles(): void {
    if (this.stylesInjected || typeof document === 'undefined') return;
    this.stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'forage-fishing-styles';
    style.textContent = `
      @keyframes fishWave {
        0%, 100% { transform: translateX(0); }
        50% { transform: translateX(-6px); }
      }
      @keyframes fishBubbleRise {
        0% { transform: translateY(0) scale(0.8); opacity: 0.75; }
        100% { transform: translateY(-195px) scale(1.15); opacity: 0; }
      }
      @keyframes fishDangerPulse {
        0%, 100% { filter: brightness(1); }
        50% { filter: brightness(1.35); }
      }
      @keyframes fishBannerPop {
        0% { transform: scale(0.7); opacity: 0; }
        60% { transform: scale(1.12); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      .fishing-overlay {
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
        min-width: 176px;
        touch-action: none;
      }
      @media (max-width: 900px) {
        .fishing-overlay {
          left: 38%;
          top: 46%;
        }
      }
      .fish-water-crest {
        position: absolute;
        top: 0;
        left: -6px;
        right: -6px;
        height: 7px;
        background: repeating-linear-gradient(90deg, rgba(168, 240, 255, 0.55) 0 6px, rgba(84, 185, 235, 0.35) 6px 12px);
        animation: fishWave 1.4s ease-in-out infinite;
        pointer-events: none;
      }
      .fish-sand-bed {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 6px;
        background: linear-gradient(180deg, rgba(196, 158, 96, 0.45), rgba(140, 102, 54, 0.8));
        pointer-events: none;
      }
      .fish-bubble {
        position: absolute;
        bottom: 6px;
        width: 3px;
        height: 3px;
        border-radius: 1px;
        background: rgba(210, 248, 255, 0.65);
        pointer-events: none;
        animation: fishBubbleRise 2.4s linear infinite;
      }
      .fishing-overlay.reeling .fish-bubble {
        animation-duration: 1.25s;
      }
      .fish-outline-text {
        text-shadow: -1px -1px 0 #1b1109, 1px -1px 0 #1b1109, -1px 1px 0 #1b1109, 1px 1px 0 #1b1109;
      }
    `;
    document.head.appendChild(style);
  }

  public start(onFinish: (caught: boolean) => void, opts?: FishingStartOpts): void {
    if (this.active) return;
    this.ensureStyles();
    this.active = true;
    this.onFinish = onFinish;
    this.fishBehavior = opts?.behavior ?? 'steady';
    this.fishSpeed = 0.42;
    const fishTitle = opts?.fishName ? `${opts.fishName}!` : 'REELING IN!';
    const behSpec = BEHAVIOR_LABELS[this.fishBehavior];
    this.elapsedMs = 0;
    this.barPos = 0.2;
    this.barVel = 0;
    this.barBounceSquash = 0;
    this.fishPos = 0.45;
    this.fishTarget = 0.68;
    this.fishMoveTimer = 0;
    this.progress = 0.32;
    this.holding = false;
    this.readyTimerMs = 1750;
    this.goShown = false;
    this.overlapGraceMs = 0;
    SFX.playFishBite();
    Haptics.impactMedium();

    const root = typeof document === 'undefined' ? null : document.getElementById('hud-root');
    if (!root) {
      this.finish(true);
      return;
    }

    const wrap = document.createElement('div');
    wrap.id = 'fishing-minigame-overlay';
    wrap.className = 'hud-panel hud-interactive fishing-overlay';

    wrap.innerHTML = `
      <div style="display:flex; justify-content:space-between; width:100%; align-items:center; gap:10px;">
        <strong style="font-size:12px; color:#3b2316;">${fishTitle}</strong>
        <span id="fish-timer" style="font-size:12px; font-weight:800; color:#8f5616;">20.0s</span>
      </div>
      <div style="width:100%; display:flex; justify-content:space-between; align-items:center;">
        <span class="fish-outline-text" style="font-size:10px; font-weight:800; padding:1px 6px; border-radius:4px; background:rgba(24,14,8,0.78); color:${behSpec.color};">${behSpec.label}</span>
        <span id="fish-lock-badge" class="fish-outline-text" style="font-size:10px; font-weight:800; color:#d8c8b8;">Aim...</span>
      </div>
      <div id="fish-stage" style="display:flex; gap:10px; align-items:stretch; height:210px; position:relative;">
        <!-- Water Track -->
        <div id="fish-track" style="position:relative; width:40px; height:210px; background:linear-gradient(180deg, #2776ab 0%, #174c73 55%, #0e2e49 100%); border-style:solid; border-image-source:url('assets/sprout_ui/frames/backdrop_c3.png'); border-image-slice:5 5 5 5; border-image-width:10px; border-width:5px; image-rendering:pixelated; overflow:hidden;">
          <div class="fish-water-crest"></div>
          <div class="fish-bubble" style="left:7px; animation-delay:0s;"></div>
          <div class="fish-bubble" style="left:19px; animation-delay:0.8s;"></div>
          <div class="fish-bubble" style="left:28px; animation-delay:1.5s;"></div>
          <div class="fish-sand-bed"></div>
          <div id="fish-bar" style="position:absolute; left:2px; right:2px; height:54px; border-style:solid; border-image-source:url('assets/sprout_ui/controls/scrollbar_v_thumb_med.png'); border-image-slice:4 4 5 4 fill; border-image-width:8px 8px 10px 8px; border-width:4px; image-rendering:pixelated; transition:box-shadow 90ms ease;"></div>
          <img id="fish-sprite" src="assets/ui_icons/fish.png" style="position:absolute; left:50%; transform:translateX(-50%); width:22px; height:22px; image-rendering:pixelated; pointer-events:none; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.75));" />
        </div>
        <!-- Catch Progress Meter -->
        <div style="width:16px; height:210px; border-style:solid; border-image-source:url('assets/sprout_ui/bars/bar_frame_empty_sm.png'); border-image-slice:3 4 3 4 fill; border-image-width:4px; border-width:3px; image-rendering:pixelated; position:relative; overflow:hidden; background:rgba(16,12,10,0.55);">
          <div id="fish-prog" style="position:absolute; left:0; right:0; bottom:0; height:32%; background:#ffb84d; transition:background-color 140ms ease;"></div>
        </div>
        <div id="fish-ready-banner" class="fish-outline-text" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; font-size:16px; font-weight:900; color:#ffe066; background:rgba(28,16,8,0.52); border-radius:4px;">Ready...</div>
      </div>
      <button id="fish-reel-btn" class="hud-btn primary" style="width:100%; font-size:11px;">Hold Click / Space / ACT</button>
      <button id="fish-cancel-btn" class="hud-btn danger" style="width:100%; font-size:10px; padding:2px 8px;">Cancel [ESC]</button>
    `;

    const cancelBtn = wrap.querySelector<HTMLButtonElement>('#fish-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
      });
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.finish(false);
      });
    }

    wrap.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('#fish-cancel-btn')) return;
      e.stopPropagation();
      try {
        wrap.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture failures on synthetic events
      }
      this.setHolding(true);
    });
    wrap.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      try {
        if (wrap.hasPointerCapture(e.pointerId)) wrap.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      this.setHolding(false);
    });
    wrap.addEventListener('pointercancel', () => {
      this.setHolding(false);
    });

    this.keyDownHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        e.preventDefault();
        this.setHolding(true);
      } else if (e.code === 'Escape') {
        this.finish(false);
      }
    };
    this.keyUpHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        this.setHolding(false);
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
        if (this.readyTimerMs <= 600) {
          if (!this.goShown) {
            this.goShown = true;
            SFX.playFishGo();
            Haptics.impactMedium();
            bannerEl.style.animation = 'fishBannerPop 220ms ease-out';
          }
          bannerEl.textContent = 'GO!';
          bannerEl.style.color = '#7ef29d';
          bannerEl.style.fontSize = '21px';
        } else {
          bannerEl.textContent = 'Ready...';
          bannerEl.style.color = '#ffe066';
        }
        if (this.readyTimerMs <= 0) bannerEl.style.display = 'none';
      }
      const trackH = 210;
      const barEl = this.container?.querySelector<HTMLElement>('#fish-bar');
      const fishEl = this.container?.querySelector<HTMLElement>('#fish-sprite');
      if (barEl) barEl.style.bottom = `${Math.round(this.barPos * trackH)}px`;
      if (fishEl) fishEl.style.bottom = `${Math.round(this.fishPos * (trackH - 22))}px`;
      this.rafId = requestAnimationFrame((nextTs) => this.tick(nextTs));
      return;
    }

    this.elapsedMs += dt * 1000;
    this.container?.classList.toggle('reeling', this.holding);

    // 1. Catch Bar physics (Stardew-style gravity + upward thrust + softened bottom bounce)
    const accel = this.holding ? 2.45 : -1.92;
    this.barVel = Math.max(-1.38, Math.min(1.38, this.barVel + accel * dt));
    this.barPos += this.barVel * dt;
    if (this.barPos < 0) {
      this.barPos = 0;
      if (Math.abs(this.barVel) > 0.25) this.barBounceSquash = 1;
      this.barVel = Math.abs(this.barVel) * 0.26;
    }
    if (this.barPos > 1 - this.barHeight) {
      this.barPos = 1 - this.barHeight;
      if (this.barVel > 0.25) this.barBounceSquash = 1;
      this.barVel = 0;
    }
    if (this.barBounceSquash > 0) {
      this.barBounceSquash = Math.max(0, this.barBounceSquash - dt * 8);
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
    const fishStep = Math.sign(fishDiff) * Math.min(Math.abs(fishDiff), this.fishSpeed * dt);
    this.fishPos += fishStep;

    // 3. Overlap check with 45ms grace buffer -> fill/drain progress
    const barTop = this.barPos + this.barHeight;
    const directOverlap = this.fishPos >= this.barPos - 0.035 && this.fishPos <= barTop + 0.035;
    if (directOverlap) {
      this.overlapGraceMs = 45;
    } else if (this.overlapGraceMs > 0) {
      this.overlapGraceMs = Math.max(0, this.overlapGraceMs - dt * 1000);
    }
    const overlapping = directOverlap || this.overlapGraceMs > 0;

    this.progress += (overlapping ? 0.27 : -0.145) * dt;
    if (overlapping) {
      this.reelTickTimerMs -= dt * 1000;
      if (this.reelTickTimerMs <= 0) {
        this.reelTickTimerMs = 135;
        SFX.playFishTick(this.progress);
        Haptics.impactLight();
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
      const lockEl = this.container.querySelector<HTMLElement>('#fish-lock-badge');
      const stageEl = this.container.querySelector<HTMLElement>('#fish-stage');

      if (stageEl) {
        const jx = this.holding && overlapping ? (Math.random() - 0.5) * 1.6 : 0;
        const jy = this.holding && overlapping ? (Math.random() - 0.5) * 1.6 : 0;
        stageEl.style.transform = jx || jy ? `translate(${jx.toFixed(1)}px, ${jy.toFixed(1)}px)` : 'none';
      }

      if (barEl) {
        barEl.style.bottom = `${Math.round(this.barPos * trackH)}px`;
        const sy = 1 - this.barBounceSquash * 0.12;
        const sx = 1 + this.barBounceSquash * 0.1;
        barEl.style.transform = this.barBounceSquash > 0 ? `scale(${sx.toFixed(3)}, ${sy.toFixed(3)})` : 'none';
        if (overlapping) {
          barEl.style.filter = 'hue-rotate(65deg) saturate(1.45) brightness(1.15)';
          barEl.style.boxShadow = '0 0 8px rgba(126, 242, 157, 0.85), inset 0 0 4px rgba(255, 255, 255, 0.45)';
        } else {
          barEl.style.filter = 'saturate(0.65) brightness(0.9)';
          barEl.style.boxShadow = 'none';
        }
      }
      if (fishEl) {
        fishEl.style.bottom = `${Math.round(this.fishPos * (trackH - 22))}px`;
        const tiltDeg = Math.max(-24, Math.min(24, -fishDiff * 48));
        const wiggleX = this.fishSpeed > 0.55 ? Math.sin(this.elapsedMs * 0.03) * 2.5 : 0;
        fishEl.style.transform = `translateX(calc(-50% + ${wiggleX.toFixed(1)}px)) rotate(${tiltDeg.toFixed(1)}deg)`;
      }
      if (progEl) {
        const pct = Math.max(0, Math.min(100, this.progress * 100));
        progEl.style.height = `${pct}%`;
        if (pct < 25) {
          progEl.style.background = '#ff5e6c';
          progEl.style.animation = 'fishDangerPulse 0.5s ease-in-out infinite';
        } else if (pct < 65) {
          progEl.style.background = '#ffb84d';
          progEl.style.animation = 'none';
        } else {
          progEl.style.background = '#6ee88a';
          progEl.style.animation = 'none';
        }
      }
      if (lockEl) {
        lockEl.textContent = overlapping ? 'LOCKED!' : 'Slipping!';
        lockEl.style.color = overlapping ? '#7ef29d' : '#ff9e9e';
      }
      if (timerEl) {
        const rem = Math.max(0, (this.maxDurationMs - this.elapsedMs) / 1000);
        timerEl.textContent = `${rem.toFixed(1)}s`;
      }
    }

    if (this.progress >= 1) {
      SFX.playFishCatch();
      Haptics.notifySuccess();
      this.finish(true);
      return;
    }
    if (this.progress <= 0 || this.elapsedMs >= this.maxDurationMs) {
      SFX.playFishFail();
      Haptics.impactMedium();
      this.finish(false);
      return;
    }

    this.rafId = requestAnimationFrame((nextTs) => this.tick(nextTs));
  }

  public finish(caught: boolean): void {
    if (!this.active) return;
    this.active = false;
    this.holding = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.keyDownHandler) window.removeEventListener('keydown', this.keyDownHandler);
    if (this.keyUpHandler) window.removeEventListener('keyup', this.keyUpHandler);
    this.container?.remove();
    this.container = null;
    this.onFinish?.(caught);
  }
}
