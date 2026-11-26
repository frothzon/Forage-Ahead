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
  tone?: string;
  hotkey?: string;
  onSelect: () => void;
}

export interface DialogueConfig {
  speaker: string;
  portraitKey?: string;
  subtitle?: string;
  voicePitch?: number;
  hearts?: number;
  moodLabel?: string;
  moodColor?: string;
  choiceLayout?: 'row' | 'fallout';
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

interface ToneVisual {
  badge: string;
  color: string;
}

function getToneVisual(tone?: string): ToneVisual | null {
  const t = (tone ?? '').trim().toLowerCase();
  if (!t) return null;
  if (t === 'friendly' || t === 'warm' || t === 'heart') {
    return { badge: '[♥]', color: '#b83254' };
  }
  if (t === 'contextual' || t === 'lore' || t === 'question' || t === 'curious') {
    return { badge: '[?]', color: '#2b618a' };
  }
  if (t === 'bold' || t === 'warning' || t === 'hostile' || t === 'press') {
    return { badge: '[!]', color: '#b54c1e' };
  }
  if (t === 'gift') {
    return { badge: '[🎁]', color: '#286e3b' };
  }
  if (t === 'quest') {
    return { badge: '[★]', color: '#9c680c' };
  }
  if (t === 'secret' || t === 'star' || t === 'special') {
    return { badge: '[★]', color: '#6b3a9c' };
  }
  if (t === 'leave') {
    return { badge: '[→]', color: '#6e523a' };
  }
  return null;
}

class DialogueBoxManager {
  private active = false;
  private overlay: HTMLElement | null = null;
  private panelEl: HTMLElement | null = null;
  private portBoxEl: HTMLElement | null = null;
  private portCanvasEl: HTMLCanvasElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private tailEl: HTMLImageElement | null = null;
  private speakerEl: HTMLElement | null = null;
  private heartsEl: HTMLElement | null = null;
  private subEl: HTMLElement | null = null;
  private moodEl: HTMLElement | null = null;
  private textEl: HTMLElement | null = null;
  private footerEl: HTMLElement | null = null;
  private actionsEl: HTMLElement | null = null;
  private hintEl: HTMLElement | null = null;
  private cfg: DialogueConfig | null = null;

  private currentPortraitKey?: string;
  private lineIndex = 0;
  private tokens: RichCharToken[] = [];
  private charSpans: HTMLElement[] = [];
  private revealedCount = 0;
  private typeRafId?: number;
  private typeStartMs = 0;
  private lastBlipAtMs = 0;
  private keyHandler?: (e: KeyboardEvent) => void;
  private stylesInjected = false;
  private sessionGen = 0;
  private turnGen = 0;
  private selectedChoiceIndex = -1;
  private choiceButtons: HTMLButtonElement[] = [];
  private renderedChoices: DialogueChoice[] = [];

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
      .dlg-hearts {
        display: inline-flex;
        align-items: center;
        gap: 1px;
        font-size: 12px;
        line-height: 1;
        letter-spacing: 1px;
        padding: 1px 6px;
        background: rgba(59, 35, 22, 0.1);
        border: 1px solid rgba(74, 46, 27, 0.35);
        border-radius: 4px;
      }
      .dlg-heart-full {
        color: #d1384b;
        text-shadow: 0 1px 0 #2b130a;
      }
      .dlg-heart-empty {
        color: #9c7d63;
      }
      .dlg-mood-pill {
        font-size: 10px;
        font-weight: 800;
        color: #fff6e5;
        padding: 2px 7px;
        border-radius: 4px;
        border: 1px solid #2c1a0e;
        text-shadow: 0 1px 0 rgba(0, 0, 0, 0.6);
        letter-spacing: 0.2px;
      }
      .dlg-choices-fallout {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        width: 100%;
      }
      @media (max-width: 560px) {
        .dlg-choices-fallout {
          grid-template-columns: 1fr;
        }
      }
      .dlg-choice-btn {
        width: 100%;
        justify-content: flex-start;
        text-align: left;
        padding: 5px 9px;
        font-size: 12px;
        line-height: 1.25;
        min-height: 34px;
        white-space: normal;
        word-break: break-word;
        box-sizing: border-box;
      }
      .dlg-choice-btn.is-selected {
        outline: 2px solid #ffe066;
        outline-offset: 1px;
        filter: brightness(1.08);
      }
      .dlg-choice-num {
        font-weight: 800;
        color: #5c3a24;
        flex-shrink: 0;
      }
      .dlg-tone-badge {
        font-weight: 800;
        font-size: 11px;
        flex-shrink: 0;
      }
      .dlg-choice-label {
        flex: 1;
        min-width: 0;
      }
    `;
    document.head.appendChild(style);
  }

  public show(cfg: DialogueConfig): void {
    if (typeof document === 'undefined') return;
    this.close(false);
    this.ensureStyles();

    this.sessionGen += 1;
    this.turnGen = 0;
    this.cfg = cfg;
    this.lineIndex = 0;
    this.active = true;
    this.currentPortraitKey = undefined;
    this.selectedChoiceIndex = -1;
    this.choiceButtons = [];
    this.renderedChoices = [];

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

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;';

    const headerLeft = document.createElement('div');
    headerLeft.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0;';

    const speakerEl = document.createElement('div');
    speakerEl.dataset.role = 'dialogue-speaker';
    speakerEl.style.cssText = 'font-size: 14px; font-weight: 800; color: #3b2316; letter-spacing: 0.4px; font-family: SproutLandsDisplay, SproutLandsUI, monospace;';
    headerLeft.appendChild(speakerEl);

    const heartsEl = document.createElement('div');
    heartsEl.className = 'dlg-hearts';
    heartsEl.dataset.role = 'dialogue-hearts';
    heartsEl.style.display = 'none';
    headerLeft.appendChild(heartsEl);

    const headerRight = document.createElement('div');
    headerRight.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end;';

    const subEl = document.createElement('div');
    subEl.dataset.role = 'dialogue-subtitle';
    subEl.style.cssText = 'font-size: 10px; font-weight: 700; color: #fff6e5; background: #7a5438; padding: 2px 8px; border-radius: 4px; border: 1px solid #4a2e1b; display: none;';
    headerRight.appendChild(subEl);

    const moodEl = document.createElement('div');
    moodEl.className = 'dlg-mood-pill';
    moodEl.dataset.role = 'dialogue-mood';
    moodEl.style.display = 'none';
    headerRight.appendChild(moodEl);

    header.appendChild(headerLeft);
    header.appendChild(headerRight);

    const textEl = document.createElement('div');
    textEl.dataset.role = 'dialogue-text';
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
    actionsEl.dataset.role = 'dialogue-actions';
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
    this.panelEl = panel;
    this.bodyEl = body;
    this.speakerEl = speakerEl;
    this.heartsEl = heartsEl;
    this.subEl = subEl;
    this.moodEl = moodEl;
    this.textEl = textEl;
    this.footerEl = footer;
    this.actionsEl = actionsEl;
    this.hintEl = hintEl;

    this.updatePortrait(cfg.portraitKey);
    this.updateHeader(cfg);

    panel.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (target && typeof target.closest === 'function' && target.closest('button')) return;
      this.advance();
    });

    this.keyHandler = (e: KeyboardEvent) => {
      this.handleKeyDown(e);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.keyHandler);
    }

    SFX.playUiOpen();
    this.renderCurrentLine();
  }

  public updateTurn(cfg: DialogueConfig): void {
    if (typeof document === 'undefined') return;
    if (!this.active || !this.overlay) {
      this.show(cfg);
      return;
    }
    this.turnGen += 1;
    this.cfg = cfg;
    this.lineIndex = 0;
    this.selectedChoiceIndex = -1;
    this.choiceButtons = [];
    this.renderedChoices = [];

    this.updatePortrait(cfg.portraitKey);
    this.updateHeader(cfg);
    this.renderCurrentLine();
  }

  private updatePortrait(portraitKey?: string): void {
    if (!this.panelEl || !this.bodyEl) return;
    if (!portraitKey) {
      if (this.portBoxEl) this.portBoxEl.style.display = 'none';
      if (this.tailEl) this.tailEl.style.display = 'none';
      this.currentPortraitKey = undefined;
      return;
    }

    if (!this.portBoxEl) {
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
      portBox.appendChild(canvas);
      this.panelEl.insertBefore(portBox, this.bodyEl);
      this.portBoxEl = portBox;
      this.portCanvasEl = canvas;
    }

    if (!this.tailEl) {
      const tail = document.createElement('img');
      tail.src = 'assets/sprout_ui/dialogue/dialog_tail_left.png';
      tail.style.cssText = 'position:absolute; left:-14px; top:50%; transform:translateY(-50%); width:12px; height:22px; image-rendering:pixelated; pointer-events:none;';
      this.bodyEl.appendChild(tail);
      this.tailEl = tail;
    }

    this.portBoxEl.style.display = 'flex';
    this.tailEl.style.display = '';

    if (portraitKey === this.currentPortraitKey) return;
    this.currentPortraitKey = portraitKey;

    if (typeof Image === 'undefined' || !this.portCanvasEl) return;
    const canvas = this.portCanvasEl;
    const portBox = this.portBoxEl;
    const img = new Image();
    img.src = `assets/${portraitKey}.png`;
    img.onload = () => {
      const ctx = canvas.getContext?.('2d');
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
  }

  private updateHeader(cfg: DialogueConfig): void {
    if (this.speakerEl) {
      this.speakerEl.textContent = cfg.speaker;
    }

    if (this.heartsEl) {
      if (typeof cfg.hearts === 'number' && !Number.isNaN(cfg.hearts)) {
        const filled = Math.max(0, Math.min(5, Math.round(cfg.hearts)));
        this.heartsEl.innerHTML = '';
        for (let i = 0; i < 5; i += 1) {
          const span = document.createElement('span');
          const isFull = i < filled;
          span.className = isFull ? 'dlg-heart-full' : 'dlg-heart-empty';
          span.textContent = isFull ? '♥' : '♡';
          this.heartsEl.appendChild(span);
        }
        this.heartsEl.setAttribute('aria-label', `${filled} of 5 hearts`);
        this.heartsEl.setAttribute('title', `${filled}/5 Hearts`);
        this.heartsEl.style.display = 'inline-flex';
      } else {
        this.heartsEl.innerHTML = '';
        this.heartsEl.style.display = 'none';
      }
    }

    if (this.subEl) {
      if (cfg.subtitle) {
        this.subEl.textContent = cfg.subtitle;
        this.subEl.style.display = '';
      } else {
        this.subEl.textContent = '';
        this.subEl.style.display = 'none';
      }
    }

    if (this.moodEl) {
      if (cfg.moodLabel) {
        this.moodEl.textContent = cfg.moodLabel;
        this.moodEl.style.background = cfg.moodColor || '#5a7a42';
        this.moodEl.style.display = '';
      } else {
        this.moodEl.textContent = '';
        this.moodEl.style.display = 'none';
      }
    }
  }

  private isChoicesVisible(): boolean {
    if (!this.active || !this.cfg) return false;
    const isLast = this.lineIndex >= this.cfg.lines.length - 1;
    const revealed = this.revealedCount >= this.charSpans.length;
    return isLast && revealed && this.renderedChoices.length > 0;
  }

  private setSelectedChoice(index: number): void {
    this.selectedChoiceIndex = index;
    this.choiceButtons.forEach((btn, idx) => {
      if (idx === index) {
        btn.classList.add('is-selected');
      } else {
        btn.classList.remove('is-selected');
      }
    });
  }

  private parseHotkeyNumber(e: KeyboardEvent): number | null {
    const key = e.key;
    if (key === '1' || key === '2' || key === '3' || key === '4') {
      return Number(key);
    }
    const code = e.code;
    if (code === 'Digit1' || code === 'Numpad1') return 1;
    if (code === 'Digit2' || code === 'Numpad2') return 2;
    if (code === 'Digit3' || code === 'Numpad3') return 3;
    if (code === 'Digit4' || code === 'Numpad4') return 4;
    return null;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.active) return;

    if (e.code === 'Escape' || e.key === 'Escape') {
      e.preventDefault();
      this.close(true);
      return;
    }

    if (this.isChoicesVisible()) {
      const hotkeyNum = this.parseHotkeyNumber(e);
      if (hotkeyNum !== null) {
        const keyStr = String(hotkeyNum);
        const byCustomHotkey = this.renderedChoices.find(
          (ch) => ch.hotkey && ch.hotkey.trim().toLowerCase() === keyStr,
        );
        const target = byCustomHotkey ?? this.renderedChoices[hotkeyNum - 1];
        if (target) {
          e.preventDefault();
          this.selectChoice(target);
          return;
        }
      }

      if (e.key && e.key.length === 1) {
        const lowerKey = e.key.toLowerCase();
        const customMatch = this.renderedChoices.find(
          (ch) => ch.hotkey && ch.hotkey.trim().toLowerCase() === lowerKey,
        );
        if (customMatch) {
          e.preventDefault();
          this.selectChoice(customMatch);
          return;
        }
      }

      if (e.code === 'ArrowDown' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx =
          this.selectedChoiceIndex < 0 ? 0 : (this.selectedChoiceIndex + 1) % this.renderedChoices.length;
        this.setSelectedChoice(nextIdx);
        return;
      }

      if (e.code === 'ArrowUp' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx =
          this.selectedChoiceIndex < 0
            ? this.renderedChoices.length - 1
            : (this.selectedChoiceIndex - 1 + this.renderedChoices.length) % this.renderedChoices.length;
        this.setSelectedChoice(prevIdx);
        return;
      }

      if ((e.code === 'Enter' || e.key === 'Enter' || e.code === 'Space' || e.key === ' ') && this.selectedChoiceIndex >= 0) {
        const chosen = this.renderedChoices[this.selectedChoiceIndex];
        if (chosen) {
          e.preventDefault();
          this.selectChoice(chosen);
          return;
        }
      }
    }

    if (e.code === 'Space' || e.code === 'Enter' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      this.advance();
    }
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
    this.selectedChoiceIndex = -1;
    this.choiceButtons = [];
    this.renderedChoices = [];
    this.textEl.innerHTML = '';
    this.actionsEl.innerHTML = '';
    this.applyFooterLayout(false);

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
    if (isLast) {
      if (this.cfg.choiceLayout === 'fallout' && this.cfg.choices?.length) {
        this.hintEl.textContent = mobile ? 'Tap a reply' : 'Keys [1-4], Arrows, or Click';
      } else {
        this.hintEl.textContent = mobile ? 'Choose an option' : 'Choose an option or [Space]';
      }
    } else {
      this.hintEl.textContent = `Page ${this.lineIndex + 1}/${this.cfg.lines.length} • ${mobile ? 'Tap' : 'Click or [Space]'}`;
    }

    const speed = settingsStore.get().dialogue.speed;
    const msPerChar = getDialogueMsPerChar(speed);
    if (speed === 'instant' || msPerChar <= 0 || typeof requestAnimationFrame !== 'function') {
      this.finishTyping();
      if (this.tokens.some((tok) => tok.ch.trim())) {
        SFX.playDialogueBlip(this.cfg?.voicePitch ?? 1);
      }
      return;
    }

    const blipGapMs = DIALOGUE_BLIP_GAP_MS[speed] ?? DIALOGUE_BLIP_GAP_MS.normal;
    this.typeStartMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
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

  private applyFooterLayout(useFallout: boolean): void {
    if (!this.footerEl || !this.actionsEl) return;
    if (useFallout) {
      this.footerEl.style.flexDirection = 'column-reverse';
      this.footerEl.style.alignItems = 'stretch';
      this.actionsEl.className = 'dlg-choices-fallout';
      this.actionsEl.dataset.layout = 'fallout';
      this.actionsEl.style.cssText = '';
    } else {
      this.footerEl.style.flexDirection = '';
      this.footerEl.style.alignItems = 'center';
      this.actionsEl.className = '';
      this.actionsEl.dataset.layout = 'row';
      this.actionsEl.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';
    }
  }

  private selectChoice(ch: DialogueChoice): void {
    SFX.playUiClick();
    const prevCfg = this.cfg;
    const prevSession = this.sessionGen;
    const prevTurn = this.turnGen;
    ch.onSelect();
    if (this.active && this.sessionGen === prevSession && this.turnGen === prevTurn && this.cfg === prevCfg) {
      this.close(false);
    }
  }

  private renderActions(): void {
    if (!this.cfg || !this.actionsEl) return;
    this.actionsEl.innerHTML = '';
    this.choiceButtons = [];
    this.renderedChoices = [];
    this.selectedChoiceIndex = -1;

    const isLast = this.lineIndex >= this.cfg.lines.length - 1;
    if (!isLast) {
      this.applyFooterLayout(false);
      const nextBtn = this.makeBtn('Next ▸', true, () => this.advance());
      this.actionsEl.appendChild(nextBtn);
      return;
    }

    const hasExplicitChoices = Boolean(this.cfg.choices?.length);
    const choices = hasExplicitChoices
      ? this.cfg.choices!
      : [{ label: 'Continue', primary: true, onSelect: () => this.close(true) }];

    const useFallout = this.cfg.choiceLayout === 'fallout' && hasExplicitChoices;
    this.applyFooterLayout(useFallout);

    if (hasExplicitChoices) {
      this.renderedChoices = choices;
    }

    choices.forEach((ch, idx) => {
      const btn = useFallout
        ? this.makeFalloutChoiceBtn(ch, idx, () => this.selectChoice(ch))
        : this.makeBtn(ch.hotkey ? `[${ch.hotkey}] ${ch.label}` : ch.label, !!ch.primary, () => this.selectChoice(ch));
      if (hasExplicitChoices) {
        btn.dataset.choiceIndex = String(idx);
        if (ch.tone) btn.dataset.tone = ch.tone;
        this.choiceButtons.push(btn);
      }
      this.actionsEl!.appendChild(btn);
    });
  }

  private makeBtn(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = primary ? 'hud-btn primary' : 'hud-btn';
    btn.textContent = label;
    btn.style.cssText = 'padding: 3px 12px; font-size: 12px;';
    btn.onclick = onClick;
    return btn;
  }

  private makeFalloutChoiceBtn(ch: DialogueChoice, idx: number, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    const toneLower = (ch.tone ?? '').toLowerCase();
    let variant = '';
    if (ch.primary) variant = ' primary';
    else if (toneLower === 'quest' || toneLower === 'secret') variant = ' gold';
    else if (toneLower === 'gift') variant = ' tan';
    btn.className = `hud-btn${variant} dlg-choice-btn`;

    const numSpan = document.createElement('span');
    numSpan.className = 'dlg-choice-num';
    numSpan.textContent = `${ch.hotkey ? ch.hotkey.trim() : String(idx + 1)}.`;
    btn.appendChild(numSpan);

    const toneVis = getToneVisual(ch.tone);
    if (toneVis) {
      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'dlg-tone-badge';
      badgeSpan.textContent = toneVis.badge;
      badgeSpan.style.color = toneVis.color;
      btn.appendChild(badgeSpan);
    }

    const labelSpan = document.createElement('span');
    labelSpan.className = 'dlg-choice-label';
    labelSpan.textContent = ch.label;
    btn.appendChild(labelSpan);

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
    if (this.keyHandler && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = undefined;
    }
    const cb = invokeOnClose ? this.cfg?.onClose : undefined;
    this.overlay?.remove();
    this.overlay = null;
    this.panelEl = null;
    this.portBoxEl = null;
    this.portCanvasEl = null;
    this.bodyEl = null;
    this.tailEl = null;
    this.speakerEl = null;
    this.heartsEl = null;
    this.subEl = null;
    this.moodEl = null;
    this.textEl = null;
    this.footerEl = null;
    this.actionsEl = null;
    this.hintEl = null;
    this.currentPortraitKey = undefined;
    this.selectedChoiceIndex = -1;
    this.choiceButtons = [];
    this.renderedChoices = [];
    this.cfg = null;
    this.active = false;
    cb?.();
  }
}

export const dialogueBox = new DialogueBoxManager();
