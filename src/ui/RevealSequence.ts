import { SFX } from '../core/SoundFX';

export interface RevealOptions {
  title: string;
  subtitle?: string;
  iconKey?: string;
  badgeText?: string;
  accentColor?: string;
  durationMs?: number;
}

class RevealSequenceManager {
  private queue: RevealOptions[] = [];
  private activeEl: HTMLElement | null = null;
  private active = false;
  private timers: number[] = [];
  private keyHandler?: (e: KeyboardEvent) => void;
  private stylesInjected = false;

  public isActive(): boolean {
    return this.active;
  }

  public show(opts: RevealOptions): void {
    if (typeof document === 'undefined') return;
    if (this.active) {
      this.queue.push(opts);
      return;
    }
    this.playNow(opts);
  }

  private ensureStyles(): void {
    if (this.stylesInjected || typeof document === 'undefined') return;
    this.stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'forage-reveal-styles';
    style.textContent = `
      @keyframes revealFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes revealFadeOut { from { opacity: 1; } to { opacity: 0; } }
      @keyframes revealBorderTopIn { from { transform: translateY(-100%); } to { transform: translateY(0); } }
      @keyframes revealBorderBotIn { from { transform: translateY(100%); } to { transform: translateY(0); } }
      @keyframes revealBorderTopOut { from { transform: translateY(0); } to { transform: translateY(-100%); } }
      @keyframes revealBorderBotOut { from { transform: translateY(0); } to { transform: translateY(100%); } }
      @keyframes revealSpin { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
      @keyframes revealGrowPop {
        0%   { transform: scale(0.12); opacity: 0; }
        18%  { opacity: 1; }
        58%  { transform: scale(0.95); }
        72%  { transform: scale(1.62); }
        84%  { transform: scale(1.06); }
        93%  { transform: scale(1.24); }
        100% { transform: scale(1.16); opacity: 1; }
      }
      @keyframes revealTextIn {
        0% { transform: translateY(12px) scale(0.9); opacity: 0; }
        100% { transform: translateY(0) scale(1); opacity: 1; }
      }
      @keyframes revealSparkler {
        0%   { transform: translate(-50%, -50%) scale(0.3) rotate(0deg); opacity: 1; }
        65%  { opacity: 1; }
        100% { transform: translate(calc(-50% + var(--sx)), calc(-50% + var(--sy))) scale(1.1) rotate(220deg); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  private playNow(opts: RevealOptions): void {
    const root = document.getElementById('hud-root') ?? document.body;
    if (!root) return;
    this.ensureStyles();
    this.active = true;

    const accent = opts.accentColor ?? '#ffe066';
    const totalMs = opts.durationMs ?? 2650;

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 9500;
      background: radial-gradient(circle at center, rgba(16, 22, 38, 0.72) 0%, rgba(5, 8, 16, 0.88) 100%);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      pointer-events: auto; user-select: none; overflow: hidden;
      animation: revealFadeIn 0.28s ease-out forwards;
    `;

    const borderTop = document.createElement('div');
    borderTop.style.cssText = `
      position: absolute; top: 0; left: 0; right: 0; height: 54px;
      background: linear-gradient(180deg, #0b0f1b 0%, #161f35 80%, ${accent} 100%);
      border-bottom: 3px solid ${accent};
      box-shadow: 0 4px 20px rgba(0,0,0,0.65);
      animation: revealBorderTopIn 0.36s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    `;

    const borderBot = document.createElement('div');
    borderBot.style.cssText = `
      position: absolute; bottom: 0; left: 0; right: 0; height: 54px;
      background: linear-gradient(0deg, #0b0f1b 0%, #161f35 80%, ${accent} 100%);
      border-top: 3px solid ${accent};
      box-shadow: 0 -4px 20px rgba(0,0,0,0.65);
      display: flex; align-items: center; justify-content: center;
      color: #9ab2cc; font-family: monospace; font-size: 11px; letter-spacing: 1px;
      animation: revealBorderBotIn 0.36s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    `;
    borderBot.textContent = 'PRESS SPACE OR CLICK TO CONTINUE';

    const stage = document.createElement('div');
    stage.style.cssText = 'position: relative; width: 240px; height: 180px; display: flex; align-items: center; justify-content: center;';

    const halo = document.createElement('div');
    halo.style.cssText = `
      position: absolute; left: 50%; top: 50%; width: 210px; height: 210px; border-radius: 50%;
      background: repeating-conic-gradient(from 0deg, ${accent}33 0deg 12deg, transparent 12deg 24deg);
      -webkit-mask-image: radial-gradient(circle, black 25%, transparent 72%);
      mask-image: radial-gradient(circle, black 25%, transparent 72%);
      animation: revealSpin 8s linear infinite;
      pointer-events: none;
    `;

    const itemWrap = document.createElement('div');
    itemWrap.className = 'sl-frame-big';
    itemWrap.style.cssText = `
      position: relative; z-index: 2; width: 104px; height: 104px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 28px ${accent}88;
      animation: revealGrowPop 1.32s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    `;

    if (opts.iconKey) {
      const img = document.createElement('img');
      img.src = `assets/${opts.iconKey}.png`;
      img.style.cssText = 'width: 56px; height: 56px; image-rendering: pixelated; object-fit: contain;';
      img.onerror = () => {
        img.style.display = 'none';
      };
      itemWrap.appendChild(img);
    } else if (opts.badgeText && opts.badgeText.length > 2) {
      const badge = document.createElement('div');
      badge.style.cssText = `
        font-size: 20px; font-weight: 900; color: #3b2316;
        font-family: SproutLandsDisplay, SproutLandsUI, monospace;
      `;
      badge.textContent = opts.badgeText;
      itemWrap.appendChild(badge);
    } else {
      const star = document.createElement('img');
      star.src = 'assets/sprout_ui/vitals/star_wood_full.png';
      star.style.cssText = 'width: 56px; height: 56px; image-rendering: pixelated; object-fit: contain;';
      itemWrap.appendChild(star);
    }

    const sparkLayer = document.createElement('div');
    sparkLayer.style.cssText = 'position: absolute; left: 50%; top: 50%; width: 0; height: 0; z-index: 3; pointer-events: none;';

    const textBox = document.createElement('div');
    textBox.className = 'hud-dock-light';
    textBox.style.cssText = `
      margin-top: 14px; text-align: center; opacity: 0; z-index: 4; padding: 6px 20px;
      animation: revealTextIn 0.35s ease-out 0.88s forwards;
    `;
    const titleEl = document.createElement('div');
    titleEl.style.cssText = `
      font-size: 24px; font-weight: 900; color: #3b2316; letter-spacing: 1.5px;
      font-family: SproutLandsDisplay, SproutLandsUI, monospace;
    `;
    titleEl.textContent = opts.title;
    textBox.appendChild(titleEl);

    if (opts.subtitle) {
      const subEl = document.createElement('div');
      subEl.style.cssText = 'margin-top: 4px; font-size: 13px; font-weight: 700; color: #5c3a24;';
      subEl.textContent = opts.subtitle;
      textBox.appendChild(subEl);
    }

    stage.appendChild(halo);
    stage.appendChild(itemWrap);
    stage.appendChild(sparkLayer);
    overlay.appendChild(borderTop);
    overlay.appendChild(stage);
    overlay.appendChild(textBox);
    overlay.appendChild(borderBot);
    root.appendChild(overlay);
    this.activeEl = overlay;

    SFX.playRevealGrow();

    // Pop & Sparklers at ~920ms
    const popTimer = window.setTimeout(() => {
      SFX.playRevealBounce();
      this.spawnDomSparklers(sparkLayer, accent);
    }, 920);
    this.timers.push(popTimer);

    const exitTimer = window.setTimeout(() => {
      this.close(borderTop, borderBot, overlay);
    }, totalMs - 280);
    this.timers.push(exitTimer);

    const startedAt = performance.now();
    const skip = () => {
      if (performance.now() - startedAt < 650) return;
      this.close(borderTop, borderBot, overlay);
    };
    overlay.addEventListener('click', skip);
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private spawnDomSparklers(container: HTMLElement, accent: string): void {
    const palette = [accent, '#ffffff', '#7ef29d', '#7ac7ff', '#ff8fab'];
    const count = 26;
    for (let i = 0; i < count; i++) {
      const sp = document.createElement('div');
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.25;
      const dist = 75 + Math.random() * 95;
      const sx = Math.round(Math.cos(ang) * dist);
      const sy = Math.round(Math.sin(ang) * dist);
      const sz = 5 + Math.round(Math.random() * 6);
      const col = palette[i % palette.length];
      sp.style.cssText = `
        position: absolute; left: 0; top: 0; width: ${sz}px; height: ${sz}px;
        background: ${col}; border-radius: 2px;
        box-shadow: 0 0 8px ${col};
        --sx: ${sx}px; --sy: ${sy}px;
        animation: revealSparkler ${0.55 + Math.random() * 0.4}s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      `;
      container.appendChild(sp);
    }
  }

  private close(borderTop: HTMLElement, borderBot: HTMLElement, overlay: HTMLElement): void {
    if (!this.active || this.activeEl !== overlay) return;
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = undefined;
    }

    borderTop.style.animation = 'revealBorderTopOut 0.26s ease-in forwards';
    borderBot.style.animation = 'revealBorderBotOut 0.26s ease-in forwards';
    overlay.style.animation = 'revealFadeOut 0.28s ease-in forwards';

    window.setTimeout(() => {
      overlay.remove();
      if (this.activeEl === overlay) this.activeEl = null;
      this.active = false;
      const next = this.queue.shift();
      if (next) this.playNow(next);
    }, 270);
  }
}

export const revealSequence = new RevealSequenceManager();
