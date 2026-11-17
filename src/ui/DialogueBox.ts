import { SFX } from '../core/SoundFX';

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
  private typeTimer?: number;
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
    panel.style.cssText = `
      width: min(680px, 96vw); min-height: 148px;
      background: linear-gradient(180deg, rgba(22, 31, 52, 0.97) 0%, rgba(13, 19, 34, 0.98) 100%);
      border: 2px solid #ffe066; border-radius: 12px;
      box-shadow: 0 12px 38px rgba(0,0,0,0.75), inset 0 0 0 1px rgba(255,255,255,0.08);
      display: flex; gap: 16px; padding: 14px 16px; align-items: stretch;
      animation: dlgSlideUp 0.22s ease-out forwards;
    `;

    if (cfg.portraitKey) {
      const portBox = document.createElement('div');
      portBox.style.cssText = `
        width: 88px; min-width: 88px; height: 96px; align-self: center;
        background: radial-gradient(circle, #2a3a61 0%, #141c30 100%);
        border: 2px solid #6b88b8; border-radius: 10px;
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
    body.style.cssText = 'flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-width: 0;';

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;';
    const speakerEl = document.createElement('div');
    speakerEl.style.cssText = 'font-size: 15px; font-weight: 800; color: #ffe066; letter-spacing: 0.4px;';
    speakerEl.textContent = cfg.speaker;
    header.appendChild(speakerEl);

    if (cfg.subtitle) {
      const subEl = document.createElement('div');
      subEl.style.cssText = 'font-size: 11px; font-weight: 700; color: #9ec5ff; background: rgba(122,199,255,0.14); padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(122,199,255,0.3);';
      subEl.textContent = cfg.subtitle;
      header.appendChild(subEl);
    }

    const textEl = document.createElement('div');
    textEl.style.cssText = 'font-size: 14px; line-height: 1.52; color: #e8f0f8; min-height: 54px; word-break: break-word;';

    const footer = document.createElement('div');
    footer.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-top: 10px; gap: 8px;';

    const hintEl = document.createElement('div');
    hintEl.style.cssText = 'font-size: 11px; color: #95abc4; font-family: monospace;';
    hintEl.textContent = 'Click or [Space]';

    const actionsEl = document.createElement('div');
    actionsEl.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';

    footer.appendChild(hintEl);
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
    if (this.typeTimer) window.clearInterval(this.typeTimer);

    const raw = this.cfg.lines[this.lineIndex] ?? '';
    this.tokens = parseRichDialogue(raw);
    this.charSpans = [];
    this.revealedCount = 0;
    this.textEl.innerHTML = '';
    this.actionsEl.innerHTML = '';

    this.tokens.forEach((tok, idx) => {
      const span = document.createElement('span');
      span.textContent = tok.ch === ' ' && tok.effect ? '\u00A0' : tok.ch;
      if (tok.color) span.style.color = tok.color;
      if (tok.effect) {
        span.className = `dlg-char-${tok.effect}`;
        span.style.animationDelay = `${(idx % 8) * 55}ms`;
      }
      span.style.opacity = '0';
      this.textEl!.appendChild(span);
      this.charSpans.push(span);
    });

    const isLast = this.lineIndex >= this.cfg.lines.length - 1;
    this.hintEl.textContent = isLast ? 'Choose an option or [Space]' : `Page ${this.lineIndex + 1}/${this.cfg.lines.length} • Click or [Space]`;

    this.typeTimer = window.setInterval(() => {
      if (this.revealedCount >= this.charSpans.length) {
        this.finishTyping();
        return;
      }
      const sp = this.charSpans[this.revealedCount];
      sp.style.opacity = '1';
      const ch = this.tokens[this.revealedCount]?.ch ?? '';
      if (ch.trim() && this.revealedCount % 2 === 0) {
        SFX.playDialogueBlip(this.cfg?.voicePitch ?? 1);
      }
      this.revealedCount += 1;
      if (this.revealedCount >= this.charSpans.length) {
        this.finishTyping();
      }
    }, 22);
  }

  private finishTyping(): void {
    if (this.typeTimer) {
      window.clearInterval(this.typeTimer);
      this.typeTimer = undefined;
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
    btn.textContent = label;
    btn.style.cssText = primary
      ? 'padding: 6px 14px; border-radius: 7px; border: 1px solid #ffe066; background: #ffe066; color: #12192b; font-weight: 800; font-size: 12px; cursor: pointer;'
      : 'padding: 6px 12px; border-radius: 7px; border: 1px solid #556c91; background: rgba(34,47,74,0.9); color: #dce7f5; font-weight: 700; font-size: 12px; cursor: pointer;';
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
    if (this.typeTimer) {
      window.clearInterval(this.typeTimer);
      this.typeTimer = undefined;
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
