import { settingsStore, type SpeechBubbleSpeed } from '../core/GameSettings';
import { isMobileTouchDevice } from '../core/Platform';
import { SFX } from '../core/SoundFX';

export const DIALOGUE_SPEED_MS: Record<SpeechBubbleSpeed, number> = {
  slow: 34,
  normal: 18,
  fast: 8,
  instant: 0,
};

export const DIALOGUE_BLIP_GAP_MS: Record<SpeechBubbleSpeed, number> = {
  slow: 95,
  normal: 65,
  fast: 48,
  instant: 0,
};

export function getDialogueMsPerChar(speed?: SpeechBubbleSpeed): number {
  const effective = speed ?? settingsStore.get().dialogue.speed;
  return DIALOGUE_SPEED_MS[effective] ?? DIALOGUE_SPEED_MS.normal;
}

export interface DialogueChoice {
  label: string;
  primary?: boolean;
  onSelect: () => void;
}

export interface DialogueConfig {
  speaker: string;
  portraitKey?: string;
  subtitle?: string;
  voicePitch?: number;
  lines: string[];
  choices?: DialogueChoice[];
  onClose?: () => void;
}

export interface RichCharToken {
  ch: string;
  color?: string;
  effect?: 'bounce' | 'jiggle' | 'roll';
}

export function parseRichDialogue(input: string): RichCharToken[] {
  const tokens: RichCharToken[] = [];
  let color: string | undefined;
  let effect: 'bounce' | 'jiggle' | 'roll' | undefined;

  let i = 0;
  while (i < input.length) {
    if (input[i] === '{') {
      const closeIdx = input.indexOf('}', i);
      if (closeIdx !== -1) {
        const tag = input.slice(i + 1, closeIdx).trim();
        if (tag.startsWith('c:')) {
          color = tag.slice(2).trim();
          i = closeIdx + 1;
          continue;
        }
        if (tag === '/c') {
          color = undefined;
          i = closeIdx + 1;
          continue;
        }
        if (tag === 'bounce' || tag === 'jiggle' || tag === 'roll') {
          effect = tag;
          i = closeIdx + 1;
          continue;
        }
        if (tag === '/bounce' || tag === '/jiggle' || tag === '/roll') {
          effect = undefined;
          i = closeIdx + 1;
          continue;
        }
      }
    }
    tokens.push({ ch: input[i], color, effect });
    i += 1;
  }
  return tokens;
}

class DialogueBoxManager {
  private active = false;
  private overlay: HTMLElement | null = null;
  private textEl: HTMLElement | null = null;
  private actionsEl: HTMLElement | null = null;
  private hintEl: HTMLElement | null = null;
  private cfg: DialogueConfig | null = null;

  private lineIndex = 0;
  private tokens: RichCharToken[] = [];
  private charSpans: HTMLElement[] = [];
  private revealedCount = 0;
  private typeRafId?: number;
  private typeStartMs = 0;
  private lastBlipAtMs = 0;
  private keyHandler?: (e: KeyboardEvent) => void;
  private stylesInjected = false;

  public isActive(): boolean {
    return this.active;
  }

  private ensureStyles(): void {
    if (this.stylesInjected || typeof document === 'undefined') return;
    this.stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'forage-dialogue-styles';
    style.textContent = `
      @keyframes dlgSlideUp { from { transform: translateY(22px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @keyframes dlgBounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
      }
      @keyframes dlgJiggle {
        0%, 100% { transform: translate(0, 0); }
        25% { transform: translate(-1px, 1px); }
        50% { transform: translate(1px, -1px); }
        75% { transform: translate(-1px, -1px); }
      }
      @keyframes dlgRoll {
        0% { transform: translateY(0) rotate(0deg); }
        25% { transform: translateY(-3px) rotate(-8deg); }
        50% { transform: translateY(0) rotate(0deg); }
        75% { transform: translateY(2px) rotate(8deg); }
        100% { transform: translateY(0) rotate(0deg); }
      }
      @keyframes dlgPortraitBob {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-2px); }
      }
      .dlg-char-bounce { display: inline-block; animation: dlgBounce 0.65s ease-in-out infinite; }
      .dlg-char-jiggle { display: inline-block; animation: dlgJiggle 0.14s linear infinite; }
      .dlg-char-roll { display: inline-block; animation: dlgRoll 0.9s ease-in-out infinite; }
      @keyframes dlgContinueAnim {
        0% { background-position: 0px 0px; }
        100% { background-position: -168px 0px; }
      }
      .dlg-continue-sprite {
        width: 24px;
        height: 24px;
        background-image: url('assets/sprout_ui/dialogue/continue_indicator.png');
        background-size: 168px 24px;
        background-repeat: no-repeat;
        image-rendering: pixelated;
        animation: dlgContinueAnim 0.85s steps(7) infinite;
        display: inline-block;
        flex-shrink: 0;
      }
    `;
    document.head.appendChild(style);
  }

  public show(cfg: DialogueConfig): void {
    if (typeof document === 'undefined') return;
    this.close(false);
    this.ensureStyles();

    this.cfg = cfg;
    this.lineIndex = 0;
    this.active = true;

    const root = document.getElementById('hud-root') ?? document.body;
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 9200;
      background: rgba(6, 10, 18, 0.42);
      display: flex; align-items: flex-end; justify-content: center;
      padding: 18px; pointer-events: auto; user-select: none;
    `;

    const panel = document.createElement('div');
    panel.className = 'hud-panel';
    panel.style.cssText = `
      width: min(700px, 96vw); min-height: 152px;
      display: flex; gap: 14px; padding: 8px 10px; align-items: stretch;
      contain: layout style paint; will-change: transform, opacity;
      animation: dlgSlideUp 0.22s ease-out forwards;
    `;

    if (cfg.portraitKey) {
      const portBox = document.createElement('div');
      portBox.style.cssText = `
        width: 96px; min-width: 96px; height: 102px; align-self: center;
        border-style: solid;
        border-image-source: url('assets/sprout_ui/frames/backdrop_c4.png');
        border-image-slice: 8 8 8 8 fill;
        border-image-width: 16px;
        border-width: 8px;
        image-rendering: pixelated;
        display: flex; align-items: center; justify-content: center; overflow: hidden;
      `;
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 72;
      canvas.style.cssText = `
        width: 56px; height: 84px; image-rendering: pixelated;
        animation: dlgPortraitBob 1.8s ease-in-out infinite;
      `;
      const img = new Image();
      img.src = `assets/${cfg.portraitKey}.png`;
      img.onload = () => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        // Townsfolk _idle sheets are 4x4 (64x96 -> 16x24 per frame), frame 0 (0,0) is downward-facing
        const fw = img.width >= 64 && img.height >= 96 ? Math.floor(img.width / 4) : img.width;
        const fh = img.width >= 64 && img.height >= 96 ? Math.floor(img.height / 4) : img.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, fw, fh, 0, 0, canvas.width, canvas.height);
      };
      img.onerror = () => {
        portBox.style.display = 'none';
      };
      portBox.appendChild(canvas);
      panel.appendChild(portBox);
    }

    const body = document.createElement('div');
    body.style.cssText = `
      flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-width: 0;
      position: relative; padding: 6px 10px;
      border-style: solid;
      border-image-source: url('assets/sprout_ui/dialogue/dialog_box_frame.png');
      border-image-slice: 4 4 6 4 fill;
      border-image-width: 8px 8px 12px 8px;
      border-width: 6px 8px 10px 8px;
      image-rendering: pixelated;
    `;

    if (cfg.portraitKey) {
      const tail = document.createElement('img');
      tail.src = 'assets/sprout_ui/dialogue/dialog_tail_left.png';
      tail.style.cssText = 'position:absolute; left:-14px; top:50%; transform:translateY(-50%); width:12px; height:22px; image-rendering:pixelated; pointer-events:none;';
      body.appendChild(tail);
    }

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;';
    const speakerEl = document.createElement('div');
    speakerEl.style.cssText = 'font-size: 14px; font-weight: 800; color: #3b2316; letter-spacing: 0.4px; font-family: SproutLandsDisplay, SproutLandsUI, monospace;';
    speakerEl.textContent = cfg.speaker;
    header.appendChild(speakerEl);

    if (cfg.subtitle) {
      const subEl = document.createElement('div');
      subEl.style.cssText = 'font-size: 10px; font-weight: 700; color: #fff6e5; background: #7a5438; padding: 2px 8px; border-radius: 4px; border: 1px solid #4a2e1b;';
      subEl.textContent = cfg.subtitle;
      header.appendChild(subEl);
    }

    const textEl = document.createElement('div');
    textEl.style.cssText = 'font-size: 13px; line-height: 1.5; color: #3b2316; font-weight: 600; min-height: 50px; word-break: break-word;';

    const footer = document.createElement('div');
    footer.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-top: 8px; gap: 8px;';

    const hintWrap = document.createElement('div');
    hintWrap.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    const continueSprite = document.createElement('span');
    continueSprite.className = 'dlg-continue-sprite';
    const hintEl = document.createElement('div');
    hintEl.style.cssText = 'font-size: 10px; color: #7a5438; font-weight: 700;';
    hintEl.textContent = isMobileTouchDevice() ? 'Tap to continue' : 'Click or [Space]';
    hintWrap.appendChild(continueSprite);
    hintWrap.appendChild(hintEl);

    const actionsEl = document.createElement('div');
    actionsEl.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';

    footer.appendChild(hintWrap);
    footer.appendChild(actionsEl);
    body.appendChild(header);
    body.appendChild(textEl);
    body.appendChild(footer);
    panel.appendChild(body);
    overlay.appendChild(panel);
    root.appendChild(overlay);

    this.overlay = overlay;
    this.textEl = textEl;
    this.actionsEl = actionsEl;
    this.hintEl = hintEl;

    panel.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.advance();
    });

    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        this.advance();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        this.close(true);
      }
    };
    window.addEventListener('keydown', this.keyHandler);

    SFX.playUiOpen();
    this.renderCurrentLine();
  }

  private renderCurrentLine(): void {
    if (!this.cfg || !this.textEl || !this.actionsEl || !this.hintEl) return;
    if (this.typeRafId !== undefined) {
      cancelAnimationFrame(this.typeRafId);
      this.typeRafId = undefined;
    }

    const raw = this.cfg.lines[this.lineIndex] ?? '';
    this.tokens = parseRichDialogue(raw);
    this.charSpans = [];
    this.revealedCount = 0;
    this.textEl.innerHTML = '';
    this.actionsEl.innerHTML = '';

    const frag = document.createDocumentFragment();
    this.tokens.forEach((tok, idx) => {
      const span = document.createElement('span');
      span.textContent = tok.ch === ' ' && tok.effect ? '\u00A0' : tok.ch;
      if (tok.color) {
        span.style.color = tok.color;
        span.style.textShadow = '-1px -1px 0 #1b1109, 1px -1px 0 #1b1109, -1px 1px 0 #1b1109, 1px 1px 0 #1b1109';
      }
      if (tok.effect) {
        span.className = `dlg-char-${tok.effect}`;
        span.style.animationDelay = `${(idx % 8) * 55}ms`;
      }
      span.style.opacity = '0';
      frag.appendChild(span);
      this.charSpans.push(span);
    });
    this.textEl.appendChild(frag);

    const isLast = this.lineIndex >= this.cfg.lines.length - 1;
    const mobile = isMobileTouchDevice();
    this.hintEl.textContent = isLast
      ? mobile
        ? 'Choose an option'
        : 'Choose an option or [Space]'
      : `Page ${this.lineIndex + 1}/${this.cfg.lines.length} • ${mobile ? 'Tap' : 'Click or [Space]'}`;

    const speed = settingsStore.get().dialogue.speed;
    const msPerChar = getDialogueMsPerChar(speed);
    if (speed === 'instant' || msPerChar <= 0) {
      this.finishTyping();
      if (this.tokens.some((tok) => tok.ch.trim())) {
        SFX.playDialogueBlip(this.cfg?.voicePitch ?? 1);
      }
      return;
    }

    const blipGapMs = DIALOGUE_BLIP_GAP_MS[speed] ?? DIALOGUE_BLIP_GAP_MS.normal;
    this.typeStartMs = performance.now();
    this.lastBlipAtMs = 0;
    const step = (now: number) => {
      if (!this.active) return;
      const target = Math.min(this.charSpans.length, Math.floor((now - this.typeStartMs) / msPerChar) + 1);
      let playedBlip = false;
      while (this.revealedCount < target) {
        this.charSpans[this.revealedCount].style.opacity = '1';
        const ch = this.tokens[this.revealedCount]?.ch ?? '';
        if (!playedBlip && ch.trim() && now - this.lastBlipAtMs >= blipGapMs) {
          this.lastBlipAtMs = now;
          playedBlip = true;
          SFX.playDialogueBlip(this.cfg?.voicePitch ?? 1);
        }
        this.revealedCount += 1;
      }
      if (this.revealedCount >= this.charSpans.length) {
        this.finishTyping();
        return;
      }
      this.typeRafId = requestAnimationFrame(step);
    };
    this.typeRafId = requestAnimationFrame(step);
  }

  private finishTyping(): void {
    if (this.typeRafId !== undefined) {
      cancelAnimationFrame(this.typeRafId);
      this.typeRafId = undefined;
    }
    this.charSpans.forEach((sp) => {
      sp.style.opacity = '1';
    });
    this.revealedCount = this.charSpans.length;
    this.renderActions();
  }

  private renderActions(): void {
    if (!this.cfg || !this.actionsEl) return;
    this.actionsEl.innerHTML = '';
    const isLast = this.lineIndex >= this.cfg.lines.length - 1;
    if (!isLast) {
      const nextBtn = this.makeBtn('Next ▸', true, () => this.advance());
      this.actionsEl.appendChild(nextBtn);
      return;
    }

    const choices = this.cfg.choices?.length
      ? this.cfg.choices
      : [{ label: 'Continue', primary: true, onSelect: () => this.close(true) }];

    choices.forEach((ch) => {
      const btn = this.makeBtn(ch.label, !!ch.primary, () => {
        SFX.playUiClick();
        this.close(false);
        ch.onSelect();
      });
      this.actionsEl!.appendChild(btn);
    });
  }

  private makeBtn(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = primary ? 'hud-btn primary' : 'hud-btn';
    btn.textContent = label;
    btn.style.cssText = 'padding: 3px 12px; font-size: 12px;';
    btn.onclick = onClick;
    return btn;
  }

  public advance(): void {
    if (!this.active || !this.cfg) return;
    if (this.revealedCount < this.charSpans.length) {
      this.finishTyping();
      return;
    }
    if (this.lineIndex < this.cfg.lines.length - 1) {
      SFX.playUiClick();
      this.lineIndex += 1;
      this.renderCurrentLine();
      return;
    }
    if (!this.cfg.choices?.length) {
      SFX.playUiClose();
      this.close(true);
    }
  }

  public close(invokeOnClose = true): void {
    if (this.typeRafId !== undefined) {
      cancelAnimationFrame(this.typeRafId);
      this.typeRafId = undefined;
    }
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = undefined;
    }
    const cb = invokeOnClose ? this.cfg?.onClose : undefined;
    this.overlay?.remove();
    this.overlay = null;
    this.textEl = null;
    this.actionsEl = null;
    this.hintEl = null;
    this.cfg = null;
    this.active = false;
    cb?.();
  }
}

export const dialogueBox = new DialogueBoxManager();
