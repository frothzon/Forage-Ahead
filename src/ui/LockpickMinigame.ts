import { Haptics } from '../core/Haptics';
import { SFX } from '../core/SoundFX';
import {
  LOCKPICK_MAX_ATTEMPTS,
  LOCKPICK_PINS,
  LOCKPICK_SHEAR_LINE,
  attemptLockpickPin,
  createLockpickState,
  stepLockpickPin,
  type LockpickState,
} from '../world/lockpickRules';

export interface LockpickStartOpts {
  title?: string;
}

const UNLOCK_HOLD_MS = 650;
const FAIL_HOLD_MS = 500;

/**
 * Sprout UI 3-Pin Tumbler Lockpicking Minigame overlay.
 * Mounts into `#hud-root`, drives pin oscillation via `requestAnimationFrame`,
 * and resolves cleanly with `true` (unlocked) or `false` (failed / cancelled).
 */
export class LockpickMinigame {
  private container: HTMLElement | null = null;
  private active = false;
  private state: LockpickState | null = null;
  private rafId?: number;
  private finishTimerId?: number;
  private lastTs = 0;
  private stylesInjected = false;
  private onFinish?: (unlocked: boolean) => void;
  private keyDownHandler?: (e: KeyboardEvent) => void;

  public isActive(): boolean {
    return this.active;
  }

  private ensureStyles(): void {
    if (this.stylesInjected || typeof document === 'undefined') return;
    if (document.getElementById('forage-lockpick-styles')) {
      this.stylesInjected = true;
      return;
    }
    this.stylesInjected = true;

    const style = document.createElement('style');
    style.id = 'forage-lockpick-styles';
    style.textContent = `
      @keyframes lockpickEnterPop {
        0% { transform: translate(-50%, -46%) scale(0.9); opacity: 0; }
        70% { transform: translate(-50%, -50%) scale(1.03); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      }
      @keyframes lockpickHitPop {
        0% { transform: scale(1); }
        35% { transform: scale(1.045, 0.965); }
        70% { transform: scale(0.985, 1.02); }
        100% { transform: scale(1); }
      }
      @keyframes lockpickMissShake {
        0%, 100% { transform: translateX(0); }
        18% { transform: translateX(-7px) rotate(-1.4deg); }
        38% { transform: translateX(6px) rotate(1.4deg); }
        58% { transform: translateX(-5px) rotate(-0.8deg); }
        78% { transform: translateX(4px) rotate(0.6deg); }
      }
      @keyframes lockpickSparkBurst {
        0% {
          transform: translate(-50%, -50%) scale(0.45) rotate(0deg);
          opacity: 1;
        }
        100% {
          transform: translate(calc(-50% + var(--sx)), calc(-50% + var(--sy))) scale(1.15) rotate(var(--sr));
          opacity: 0;
        }
      }
      @keyframes lockpickPipShatter {
        0% { transform: scale(1); opacity: 1; filter: brightness(1.6); }
        45% { transform: scale(1.35) rotate(-16deg); opacity: 0.9; filter: brightness(1.8); }
        100% { transform: scale(0.75) rotate(10deg); opacity: 0.28; filter: grayscale(0.9); }
      }
      @keyframes lockpickBannerPop {
        0% { transform: scale(0.68); opacity: 0; }
        60% { transform: scale(1.08); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes lockpickChamberFlash {
        0% { box-shadow: 0 0 18px rgba(126, 242, 157, 0.95), inset 0 0 18px rgba(255, 232, 130, 0.7); }
        100% { box-shadow: 0 0 10px rgba(126, 242, 157, 0.55), inset 0 0 10px rgba(126, 242, 157, 0.2); }
      }

      .lockpick-overlay {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        z-index: 50;
        width: min(336px, calc(100vw - 24px));
        padding: 10px 14px 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 9px;
        touch-action: manipulation;
        animation: lockpickEnterPop 180ms cubic-bezier(0.22, 1, 0.36, 1);
      }

      .lockpick-padlock {
        position: relative;
        width: 100%;
        padding-top: 28px;
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      .lockpick-shackle {
        position: absolute;
        top: 2px;
        left: 50%;
        width: 98px;
        height: 42px;
        margin-left: -49px;
        border: 10px solid #b4c2d0;
        border-bottom: none;
        border-radius: 50px 50px 0 0;
        background: transparent;
        box-shadow:
          inset 0 2px 3px rgba(255, 255, 255, 0.68),
          inset 0 -1px 2px rgba(40, 52, 66, 0.55),
          0 3px 6px rgba(14, 10, 6, 0.5);
        transform-origin: 14px 38px;
        transition:
          transform 340ms cubic-bezier(0.34, 1.56, 0.64, 1),
          border-color 220ms ease,
          filter 260ms ease;
        pointer-events: none;
        z-index: 1;
      }
      .lockpick-shackle.unlocked {
        transform: translateY(-12px) rotate(-14deg);
        border-color: #ffe384;
        filter: drop-shadow(0 0 12px rgba(255, 224, 102, 0.95));
      }

      .lockpick-housing {
        position: relative;
        z-index: 2;
        width: 100%;
        border-radius: 12px;
        padding: 10px 12px 12px;
        background: linear-gradient(180deg, #e5ae49 0%, #c18328 48%, #915b17 100%);
        border: 2px solid #49280a;
        box-shadow:
          inset 0 2px 0 rgba(255, 242, 188, 0.6),
          inset 0 -3px 0 rgba(64, 33, 6, 0.68),
          0 7px 16px rgba(15, 8, 2, 0.52);
        transition: border-color 140ms ease, box-shadow 140ms ease;
      }
      .lockpick-housing.lockpick-hit-pop {
        animation: lockpickHitPop 240ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .lockpick-housing.lockpick-miss-shake {
        animation: lockpickMissShake 280ms ease-out;
      }
      .lockpick-housing.lockpick-miss-flash {
        border-color: #ff5b69;
        box-shadow:
          inset 0 2px 0 rgba(255, 190, 190, 0.5),
          0 0 16px rgba(255, 76, 92, 0.8),
          0 7px 16px rgba(15, 8, 2, 0.52);
      }
      .lockpick-housing.is-unlocked {
        border-color: #ffe67a;
        box-shadow:
          inset 0 2px 0 rgba(255, 250, 210, 0.75),
          0 0 18px rgba(255, 224, 102, 0.75),
          0 7px 16px rgba(15, 8, 2, 0.52);
      }

      .lockpick-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 10px;
      }
      .lockpick-title {
        font-size: 12px;
        font-weight: 800;
        color: #fff6dc;
        text-shadow: -1px -1px 0 #3a1f08, 1px -1px 0 #3a1f08, -1px 1px 0 #3a1f08, 1px 1px 0 #3a1f08;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .lockpick-attempts {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 6px;
        border-radius: 999px;
        background: rgba(34, 18, 6, 0.62);
        border: 1px solid rgba(255, 223, 140, 0.35);
      }
      .lockpick-pip {
        width: 11px;
        height: 11px;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 32%, #fff5ba 0%, #f5be41 55%, #a86b14 100%);
        border: 1px solid #fff2bd;
        box-shadow: 0 0 6px rgba(255, 212, 92, 0.85);
        transition: opacity 160ms ease, transform 160ms ease, filter 160ms ease;
      }
      .lockpick-pip.is-breaking {
        animation: lockpickPipShatter 280ms ease-out forwards;
      }
      .lockpick-pip.is-spent {
        opacity: 0.25;
        filter: grayscale(0.95) brightness(0.6);
        box-shadow: none;
        border-color: #6b4b28;
        transform: scale(0.8);
      }

      .lockpick-chambers {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 11px;
      }

      .lockpick-chamber {
        position: relative;
        height: 140px;
        border-radius: 8px;
        padding: 9px 5px;
        background: linear-gradient(180deg, #17100c 0%, #271a12 52%, #130d09 100%);
        border: 2px solid #593918;
        box-shadow:
          inset 0 4px 10px rgba(0, 0, 0, 0.88),
          0 1px 0 rgba(255, 232, 175, 0.38);
        opacity: 0.76;
        transition: border-color 140ms ease, box-shadow 140ms ease, opacity 140ms ease;
      }
      .lockpick-chamber::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 6px;
        background: linear-gradient(112deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.02) 38%, transparent 45%);
        pointer-events: none;
        z-index: 3;
      }
      .lockpick-chamber.is-active {
        opacity: 1;
        border-color: #ffe066;
        box-shadow:
          0 0 12px rgba(255, 224, 102, 0.65),
          inset 0 4px 10px rgba(0, 0, 0, 0.85);
      }
      .lockpick-chamber.is-set {
        opacity: 1;
        border-color: #7ef29d;
        background: linear-gradient(180deg, #132518 0%, #1d3523 52%, #101f14 100%);
        box-shadow:
          0 0 10px rgba(126, 242, 157, 0.55),
          inset 0 0 12px rgba(126, 242, 157, 0.2);
      }
      .lockpick-chamber.is-flash {
        animation: lockpickChamberFlash 360ms ease-out;
      }

      .lockpick-track {
        position: relative;
        width: 100%;
        height: 100%;
      }

      .lockpick-sweet-spot {
        position: absolute;
        left: 2px;
        right: 2px;
        transform: translateY(-50%);
        border-radius: 3px;
        background: linear-gradient(
          180deg,
          rgba(255, 214, 79, 0.14) 0%,
          rgba(255, 224, 102, 0.34) 50%,
          rgba(255, 214, 79, 0.14) 100%
        );
        border-top: 1px solid rgba(255, 224, 102, 0.72);
        border-bottom: 1px solid rgba(255, 224, 102, 0.72);
        box-shadow: 0 0 8px rgba(255, 214, 82, 0.25);
        pointer-events: none;
      }
      .lockpick-sweet-spot::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        top: 50%;
        height: 1px;
        background: rgba(255, 244, 184, 0.85);
      }
      .lockpick-chamber.is-set .lockpick-sweet-spot {
        background: linear-gradient(
          180deg,
          rgba(126, 242, 157, 0.18) 0%,
          rgba(126, 242, 157, 0.42) 50%,
          rgba(126, 242, 157, 0.18) 100%
        );
        border-color: rgba(140, 255, 174, 0.85);
      }

      .lockpick-slider {
        position: absolute;
        left: 50%;
        width: 78%;
        height: 14px;
        transform: translate(-50%, -50%);
        border-radius: 4px;
        background: linear-gradient(180deg, #ffe89e 0%, #d8982e 55%, #8f5c14 100%);
        border: 1px solid #fff2c2;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.65),
          0 2px 5px rgba(0, 0, 0, 0.75);
        pointer-events: none;
        z-index: 2;
      }
      .lockpick-chamber.is-active .lockpick-slider {
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.8),
          0 0 9px rgba(255, 224, 102, 0.85),
          0 2px 5px rgba(0, 0, 0, 0.75);
      }
      .lockpick-chamber.is-set .lockpick-slider {
        background: linear-gradient(180deg, #d7ffd9 0%, #7ef29d 45%, #e7bf48 100%);
        border-color: #ffffff;
        box-shadow: 0 0 10px rgba(126, 242, 157, 0.9);
      }

      .lockpick-pin-badge {
        position: absolute;
        left: 50%;
        bottom: 3px;
        transform: translateX(-50%);
        font-size: 9px;
        font-weight: 800;
        color: #b79f84;
        text-shadow: 0 1px 1px #000;
        pointer-events: none;
        z-index: 4;
      }
      .lockpick-chamber.is-active .lockpick-pin-badge {
        color: #ffe066;
      }
      .lockpick-chamber.is-set .lockpick-pin-badge {
        color: #7ef29d;
        text-shadow: 0 0 6px rgba(126, 242, 157, 0.85);
      }

      .lockpick-spark {
        position: absolute;
        left: 50%;
        top: 50%;
        color: #ffe270;
        font-size: 12px;
        font-weight: 900;
        line-height: 1;
        pointer-events: none;
        z-index: 10;
        text-shadow: 0 0 8px rgba(255, 210, 64, 0.95);
        animation: lockpickSparkBurst 460ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      .lockpick-banner {
        position: absolute;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        border-radius: 10px;
        font-size: 17px;
        font-weight: 900;
        letter-spacing: 0.5px;
        pointer-events: none;
        z-index: 8;
        text-shadow: -1px -1px 0 #1b1109, 1px -1px 0 #1b1109, -1px 1px 0 #1b1109, 1px 1px 0 #1b1109, 0 2px 8px rgba(0, 0, 0, 0.75);
      }
      .lockpick-banner.is-visible {
        display: flex;
        animation: lockpickBannerPop 220ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .lockpick-banner.is-unlocked {
        background: rgba(24, 48, 22, 0.62);
        color: #ffe875;
      }
      .lockpick-banner.is-failed {
        background: rgba(54, 16, 18, 0.68);
        color: #ff949c;
      }

      .lockpick-controls {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .lockpick-pick-btn {
        width: 100%;
        min-height: 40px;
        font-size: 12px;
        font-weight: 800;
      }
      .lockpick-cancel-btn {
        width: 100%;
        font-size: 10px;
        padding: 2px 8px;
      }

      @media (max-width: 600px) {
        .lockpick-overlay {
          width: min(312px, calc(100vw - 20px));
          padding: 8px 11px 10px;
        }
        .lockpick-chamber {
          height: 126px;
        }
        .lockpick-pick-btn {
          min-height: 44px;
          font-size: 13px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  public start(onFinish: (unlocked: boolean) => void, opts?: LockpickStartOpts): void {
    if (this.active) return;
    this.ensureStyles();

    this.active = true;
    this.onFinish = onFinish;
    this.state = createLockpickState();

    const root = typeof document === 'undefined' ? null : document.getElementById('hud-root');
    if (!root) {
      this.finish(false);
      return;
    }

    const title = opts?.title?.trim() ? opts.title.trim() : 'Locked Door';

    const wrap = document.createElement('div');
    wrap.id = 'lockpick-minigame-overlay';
    wrap.className = 'lockpick-overlay hud-panel hud-interactive';
    wrap.setAttribute('data-lockpick-active', 'true');

    const padlock = document.createElement('div');
    padlock.className = 'lockpick-padlock';

    const shackle = document.createElement('div');
    shackle.className = 'lockpick-shackle';
    padlock.appendChild(shackle);

    const housing = document.createElement('div');
    housing.className = 'lockpick-housing';

    const header = document.createElement('div');
    header.className = 'lockpick-header';

    const titleEl = document.createElement('strong');
    titleEl.className = 'lockpick-title';
    titleEl.textContent = `🔒 ${title}`;

    const attemptsEl = document.createElement('div');
    attemptsEl.id = 'lockpick-attempts';
    attemptsEl.className = 'lockpick-attempts';
    for (let i = 0; i < LOCKPICK_MAX_ATTEMPTS; i++) {
      const pip = document.createElement('span');
      pip.className = 'lockpick-pip';
      pip.dataset.attemptIdx = String(i);
      attemptsEl.appendChild(pip);
    }

    header.appendChild(titleEl);
    header.appendChild(attemptsEl);
    housing.appendChild(header);

    const chambers = document.createElement('div');
    chambers.className = 'lockpick-chambers';

    const shearPct = (LOCKPICK_SHEAR_LINE * 100).toFixed(2);
    for (let i = 0; i < LOCKPICK_PINS.length; i++) {
      const cfg = LOCKPICK_PINS[i];
      const chamber = document.createElement('div');
      chamber.id = `lockpick-pin-${i}`;
      chamber.className = 'lockpick-chamber';

      const track = document.createElement('div');
      track.className = 'lockpick-track';

      const sweetSpot = document.createElement('div');
      sweetSpot.className = 'lockpick-sweet-spot';
      sweetSpot.style.top = `${shearPct}%`;
      sweetSpot.style.height = `${(2 * cfg.sweetSpotHalf * 100).toFixed(2)}%`;

      const slider = document.createElement('div');
      slider.id = `lockpick-slider-${i}`;
      slider.className = 'lockpick-slider';

      const badge = document.createElement('span');
      badge.className = 'lockpick-pin-badge';
      badge.textContent = String(i + 1);

      track.appendChild(sweetSpot);
      track.appendChild(slider);
      chamber.appendChild(track);
      chamber.appendChild(badge);
      chambers.appendChild(chamber);
    }
    housing.appendChild(chambers);

    const banner = document.createElement('div');
    banner.id = 'lockpick-banner';
    banner.className = 'lockpick-banner';
    housing.appendChild(banner);

    padlock.appendChild(housing);
    wrap.appendChild(padlock);

    const controls = document.createElement('div');
    controls.className = 'lockpick-controls';

    const pickBtn = document.createElement('button');
    pickBtn.id = 'lockpick-pick-btn';
    pickBtn.type = 'button';
    pickBtn.className = 'hud-btn primary lockpick-pick-btn';
    pickBtn.textContent = '🔑 PICK PIN [SPACE]';

    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'lockpick-cancel-btn';
    cancelBtn.type = 'button';
    cancelBtn.className = 'hud-btn danger lockpick-cancel-btn';
    cancelBtn.textContent = 'Cancel [Esc]';

    pickBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    pickBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.triggerPick();
    });

    cancelBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.finish(false);
    });

    controls.appendChild(pickBtn);
    controls.appendChild(cancelBtn);
    wrap.appendChild(controls);

    wrap.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });

    this.keyDownHandler = (e: KeyboardEvent) => {
      if (!this.active) return;
      if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) {
          this.triggerPick();
        }
      } else if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (this.state?.status === 'active') {
          this.finish(false);
        }
      }
    };
    window.addEventListener('keydown', this.keyDownHandler);

    root.appendChild(wrap);
    this.container = wrap;
    this.renderState();

    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
  }

  public triggerPick(): void {
    if (!this.active || !this.state || this.state.status !== 'active') return;

    const hitPinIdx = this.state.pinIndex;
    const prevAttempts = this.state.attemptsLeft;
    const result = attemptLockpickPin(this.state);
    this.state = result.state;
    this.renderState();

    if (result.hit) {
      SFX.playCoin(hitPinIdx);
      this.triggerHapticTap();
      this.playHitJuice(hitPinIdx);

      if (result.unlocked) {
        this.handleUnlocked();
      }
    } else {
      SFX.playUiError();
      this.triggerHapticError();
      const lostIdx = Math.max(0, prevAttempts - 1);
      this.playMissJuice(lostIdx);

      if (result.failed) {
        this.handleFailed();
      }
    }
  }

  public stop(): void {
    this.cleanup();
  }

  private tick(ts: number): void {
    if (!this.active || !this.state || this.state.status !== 'active') return;
    const dtSec = Math.min(0.05, Math.max(0, (ts - this.lastTs) / 1000));
    this.lastTs = ts;

    this.state = stepLockpickPin(this.state, dtSec);
    this.renderState();

    this.rafId = requestAnimationFrame((nextTs) => this.tick(nextTs));
  }

  private renderState(): void {
    if (!this.container || !this.state) return;

    const { pinIndex, pinPos, setPins, attemptsLeft } = this.state;
    this.container.setAttribute('data-pin-index', String(pinIndex));
    this.container.setAttribute('data-pin-pos', pinPos.toFixed(4));

    for (let i = 0; i < LOCKPICK_PINS.length; i++) {
      const chamber = this.container.querySelector<HTMLElement>(`#lockpick-pin-${i}`);
      const slider = this.container.querySelector<HTMLElement>(`#lockpick-slider-${i}`);
      const badge = chamber?.querySelector<HTMLElement>('.lockpick-pin-badge');
      const isSet = Boolean(setPins[i]);
      const isActive = this.state.status === 'active' && i === pinIndex && !isSet;
      const pos = isSet ? LOCKPICK_SHEAR_LINE : isActive ? pinPos : 0.12;

      if (chamber) {
        chamber.classList.toggle('is-set', isSet);
        chamber.classList.toggle('is-active', isActive);
        chamber.setAttribute('data-pin-pos', pos.toFixed(4));
        chamber.setAttribute('data-pin-set', isSet ? 'true' : 'false');
      }
      if (slider) {
        slider.style.top = `${(pos * 100).toFixed(2)}%`;
        slider.setAttribute('data-pin-pos', pos.toFixed(4));
      }
      if (badge) {
        badge.textContent = isSet ? '✓' : String(i + 1);
      }
    }

    const pips = this.container.querySelectorAll<HTMLElement>('#lockpick-attempts .lockpick-pip');
    pips.forEach((pip, idx) => {
      pip.classList.toggle('is-spent', idx >= attemptsLeft);
    });
  }

  private playHitJuice(pinIdx: number): void {
    if (!this.container) return;
    const housing = this.container.querySelector<HTMLElement>('.lockpick-housing');
    if (housing) {
      housing.classList.remove('lockpick-hit-pop', 'lockpick-miss-shake', 'lockpick-miss-flash');
      void housing.offsetWidth;
      housing.classList.add('lockpick-hit-pop');
    }

    const chamber = this.container.querySelector<HTMLElement>(`#lockpick-pin-${pinIdx}`);
    if (chamber) {
      chamber.classList.remove('is-flash');
      void chamber.offsetWidth;
      chamber.classList.add('is-flash');
      this.spawnSparks(chamber, 6, 26, 44);
    }
  }

  private playMissJuice(lostPipIdx: number): void {
    if (!this.container) return;
    const housing = this.container.querySelector<HTMLElement>('.lockpick-housing');
    if (housing) {
      housing.classList.remove('lockpick-hit-pop', 'lockpick-miss-shake', 'lockpick-miss-flash');
      void housing.offsetWidth;
      housing.classList.add('lockpick-miss-shake', 'lockpick-miss-flash');
    }

    const pip = this.container.querySelector<HTMLElement>(`#lockpick-attempts .lockpick-pip[data-attempt-idx="${lostPipIdx}"]`);
    if (pip) {
      pip.classList.remove('is-breaking');
      void pip.offsetWidth;
      pip.classList.add('is-breaking');
    }
  }

  private handleUnlocked(): void {
    if (!this.container) {
      this.finish(true);
      return;
    }

    if (this.rafId !== undefined) {
      cancelAnimationFrame(this.rafId);
      this.rafId = undefined;
    }

    SFX.playLevelUp();
    try {
      Haptics.notifySuccess();
    } catch {
      // Ignore in unsupported environments
    }

    const shackle = this.container.querySelector<HTMLElement>('.lockpick-shackle');
    shackle?.classList.add('unlocked');

    const housing = this.container.querySelector<HTMLElement>('.lockpick-housing');
    if (housing) {
      housing.classList.add('is-unlocked');
      this.spawnSparks(housing, 12, 48, 86);
    }

    const banner = this.container.querySelector<HTMLElement>('#lockpick-banner');
    if (banner) {
      banner.textContent = '🔓 UNLOCKED!';
      banner.className = 'lockpick-banner is-visible is-unlocked';
    }

    const pickBtn = this.container.querySelector<HTMLButtonElement>('#lockpick-pick-btn');
    if (pickBtn) pickBtn.disabled = true;

    this.finishTimerId = window.setTimeout(() => {
      this.finish(true);
    }, UNLOCK_HOLD_MS);
  }

  private handleFailed(): void {
    if (!this.container) {
      this.finish(false);
      return;
    }

    if (this.rafId !== undefined) {
      cancelAnimationFrame(this.rafId);
      this.rafId = undefined;
    }

    const banner = this.container.querySelector<HTMLElement>('#lockpick-banner');
    if (banner) {
      banner.textContent = '🔒 PICK SNAPPED!';
      banner.className = 'lockpick-banner is-visible is-failed';
    }

    const pickBtn = this.container.querySelector<HTMLButtonElement>('#lockpick-pick-btn');
    if (pickBtn) pickBtn.disabled = true;

    this.finishTimerId = window.setTimeout(() => {
      this.finish(false);
    }, FAIL_HOLD_MS);
  }

  private spawnSparks(parent: HTMLElement, count: number, minDist: number, maxDist: number): void {
    for (let i = 0; i < count; i++) {
      const spark = document.createElement('span');
      spark.className = 'lockpick-spark';
      spark.textContent = '✦';
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
      const dist = minDist + Math.random() * (maxDist - minDist);
      spark.style.setProperty('--sx', `${(Math.cos(angle) * dist).toFixed(1)}px`);
      spark.style.setProperty('--sy', `${(Math.sin(angle) * dist).toFixed(1)}px`);
      spark.style.setProperty('--sr', `${Math.round((Math.random() - 0.5) * 160)}deg`);
      spark.addEventListener('animationend', () => spark.remove(), { once: true });
      parent.appendChild(spark);
    }
  }

  private triggerHapticTap(): void {
    try {
      const h = Haptics as unknown as { tap?: () => void; impactLight?: () => void };
      if (typeof h.tap === 'function') {
        h.tap();
      } else {
        h.impactLight?.();
      }
    } catch {
      // Ignore in unsupported environments
    }
  }

  private triggerHapticError(): void {
    try {
      Haptics.impactMedium();
    } catch {
      // Ignore in unsupported environments
    }
  }

  private finish(unlocked: boolean): void {
    if (!this.active) return;
    const cb = this.onFinish;
    this.cleanup();
    cb?.(unlocked);
  }

  private cleanup(): void {
    this.active = false;
    this.state = null;
    this.onFinish = undefined;
    if (this.finishTimerId !== undefined) {
      window.clearTimeout(this.finishTimerId);
      this.finishTimerId = undefined;
    }
    if (this.rafId !== undefined) {
      cancelAnimationFrame(this.rafId);
      this.rafId = undefined;
    }
    if (this.keyDownHandler) {
      window.removeEventListener('keydown', this.keyDownHandler);
      this.keyDownHandler = undefined;
    }
    if (this.container) {
      this.container.removeAttribute('data-lockpick-active');
      this.container.remove();
      this.container = null;
    }
  }
}
