import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateFalloutChoices,
  type ChoiceGenContext,
} from '../src/ai/DialogueChoiceGenerator';
import { NpcBrainRuntime } from '../src/ai/NpcBrainRuntime';
import { settingsStore } from '../src/core/GameSettings';
import { dialogueBox, type DialogueConfig } from '../src/ui/DialogueBox';

/* -------------------------------------------------------------------------- */
/* Lightweight in-memory DOM / Window shim for Node Vitest environment         */
/* -------------------------------------------------------------------------- */

class MockClassList {
  private set = new Set<string>();
  constructor(private owner: MockElement) {}
  syncFromClassName(name: string): void {
    this.set = new Set(name.split(/\s+/).filter(Boolean));
  }
  add(...tokens: string[]): void {
    tokens.forEach((t) => this.set.add(t));
    this.owner._syncClassName([...this.set].join(' '));
  }
  remove(...tokens: string[]): void {
    tokens.forEach((t) => this.set.delete(t));
    this.owner._syncClassName([...this.set].join(' '));
  }
  contains(token: string): boolean {
    return this.set.has(token);
  }
}

class MockNode {
  public children: MockNode[] = [];
  public parentNode: MockNode | null = null;
  protected _text = '';

  appendChild<T extends MockNode>(child: T): T {
    if (child instanceof MockFragment) {
      const items = [...child.children];
      child.children = [];
      items.forEach((c) => this.appendChild(c));
      return child;
    }
    if (child.parentNode) {
      child.parentNode.children = child.parentNode.children.filter((c) => c !== child);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertBefore<T extends MockNode>(newNode: T, refNode: MockNode | null): T {
    if (!refNode) return this.appendChild(newNode);
    const idx = this.children.indexOf(refNode);
    if (idx === -1) return this.appendChild(newNode);
    if (newNode.parentNode) {
      newNode.parentNode.children = newNode.parentNode.children.filter((c) => c !== newNode);
    }
    newNode.parentNode = this;
    this.children.splice(idx, 0, newNode);
    return newNode;
  }

  remove(): void {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
    this.parentNode = null;
  }
}

class MockFragment extends MockNode {}

class MockElement extends MockNode {
  public tagName: string;
  public id = '';
  public style: Record<string, string> = {};
  public dataset: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  public onclick: ((e?: unknown) => void) | null = null;
  public width = 0;
  public height = 0;
  public src = '';
  public type = '';
  public classList: MockClassList;
  private _className = '';
  private listeners = new Map<string, Array<(e: unknown) => void>>();

  constructor(tagName: string) {
    super();
    this.tagName = tagName.toUpperCase();
    this.classList = new MockClassList(this);
  }

  get className(): string {
    return this._className;
  }

  set className(val: string) {
    this._className = val;
    this.classList.syncFromClassName(val);
  }

  _syncClassName(val: string): void {
    this._className = val;
  }

  get textContent(): string {
    if (this.children.length === 0) return this._text;
    return this.children.map((c) => (c instanceof MockElement ? c.textContent : '')).join('');
  }

  set textContent(val: string | null) {
    this.children = [];
    this._text = val ?? '';
  }

  get innerHTML(): string {
    return this.textContent;
  }

  set innerHTML(val: string) {
    this.children = [];
    this._text = val;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  addEventListener(type: string, fn: (e: unknown) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }

  dispatchEvent(evt: { type: string; target?: unknown }): void {
    if (!evt.target) evt.target = this;
    if (evt.type === 'click' && this.onclick) {
      this.onclick(evt);
    }
    const arr = this.listeners.get(evt.type) ?? [];
    arr.forEach((fn) => fn(evt));
  }

  click(): void {
    this.dispatchEvent({ type: 'click', target: this });
  }

  closest(selector: string): MockElement | null {
    const targetTag = selector.toUpperCase();
    let curr: MockNode | null = this;
    while (curr instanceof MockElement) {
      if (curr.tagName === targetTag) return curr;
      curr = curr.parentNode;
    }
    return null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const out: MockElement[] = [];
    const visit = (node: MockNode): void => {
      for (const child of node.children) {
        if (child instanceof MockElement) {
          if (matchesSelector(child, selector)) out.push(child);
          visit(child);
        }
      }
    };
    visit(this);
    return out;
  }

  querySelector(selector: string): MockElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

function matchesSelector(el: MockElement, selector: string): boolean {
  if (selector.startsWith('.')) {
    return el.classList.contains(selector.slice(1));
  }
  const roleMatch = /^\[data-role="([^"]+)"\]$/.exec(selector);
  if (roleMatch) {
    return el.dataset.role === roleMatch[1];
  }
  if (selector === '[data-choice-index]') {
    return el.dataset.choiceIndex !== undefined;
  }
  return el.tagName === selector.toUpperCase();
}

interface DomHarness {
  body: MockElement;
  head: MockElement;
  hudRoot: MockElement;
  dispatchKeyDown: (opts: { key: string; code: string }) => { defaultPrevented: boolean };
  flushRaf: (nowMs: number) => void;
  cleanup: () => void;
}

function installDomHarness(): DomHarness {
  const prevDoc = (globalThis as Record<string, unknown>).document;
  const prevWin = (globalThis as Record<string, unknown>).window;
  const prevRaf = (globalThis as Record<string, unknown>).requestAnimationFrame;
  const prevCaf = (globalThis as Record<string, unknown>).cancelAnimationFrame;
  const prevPerf = (globalThis as Record<string, unknown>).performance;

  const head = new MockElement('head');
  const body = new MockElement('body');
  const hudRoot = new MockElement('div');
  hudRoot.id = 'hud-root';
  body.appendChild(hudRoot);

  const findById = (root: MockNode, id: string): MockElement | null => {
    for (const child of root.children) {
      if (child instanceof MockElement) {
        if (child.id === id) return child;
        const nested = findById(child, id);
        if (nested) return nested;
      }
    }
    return null;
  };

  const doc = {
    head,
    body,
    createElement: (tag: string) => new MockElement(tag),
    createDocumentFragment: () => new MockFragment(),
    getElementById: (id: string) => findById(body, id),
  };

  const winListeners = new Map<string, Set<(e: unknown) => void>>();
  const win = {
    innerWidth: 1024,
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      let set = winListeners.get(type);
      if (!set) {
        set = new Set();
        winListeners.set(type, set);
      }
      set.add(fn);
    },
    removeEventListener: (type: string, fn: (e: unknown) => void) => {
      winListeners.get(type)?.delete(fn);
    },
  };

  let rafSeq = 1;
  let rafQueue = new Map<number, (now: number) => void>();
  let mockNow = 1000;

  const raf = (cb: (now: number) => void): number => {
    const id = rafSeq++;
    rafQueue.set(id, cb);
    return id;
  };
  const caf = (id: number): void => {
    rafQueue.delete(id);
  };

  (globalThis as Record<string, unknown>).document = doc;
  (globalThis as Record<string, unknown>).window = win;
  (globalThis as Record<string, unknown>).requestAnimationFrame = raf;
  (globalThis as Record<string, unknown>).cancelAnimationFrame = caf;
  (globalThis as Record<string, unknown>).performance = { now: () => mockNow };

  return {
    body,
    head,
    hudRoot,
    dispatchKeyDown: ({ key, code }) => {
      const evt = {
        key,
        code,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
      };
      const handlers = [...(winListeners.get('keydown') ?? [])];
      handlers.forEach((fn) => fn(evt));
      return evt;
    },
    flushRaf: (nowMs: number) => {
      mockNow = nowMs;
      const batch = [...rafQueue.entries()];
      rafQueue = new Map();
      batch.forEach(([, cb]) => cb(nowMs));
    },
    cleanup: () => {
      (globalThis as Record<string, unknown>).document = prevDoc;
      (globalThis as Record<string, unknown>).window = prevWin;
      (globalThis as Record<string, unknown>).requestAnimationFrame = prevRaf;
      (globalThis as Record<string, unknown>).cancelAnimationFrame = prevCaf;
      (globalThis as Record<string, unknown>).performance = prevPerf;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function baseCtx(overrides: Partial<ChoiceGenContext> = {}): ChoiceGenContext {
  return {
    npcName: 'Farmer Bram',
    role: 'homestead farmer',
    stance: 'neutral',
    mood: [0.1, 0.2, 0, 0],
    hearts: 2,
    secretUnlocked: false,
    secretClaimed: false,
    turnIndex: 0,
    lastConceptSeq: [],
    lastOpenQuestion: null,
    activeTopicsUsed: [],
    loreTopics: {
      crisis: 'the goblin raids',
      rival: 'Old Barnaby',
      item: 'the golden turnip',
      home: 'Meadow Homestead',
      rumor: 'strange lights near the pier',
    },
    questAction: null,
    giftCandidate: null,
    giftedToday: false,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Part 1: DialogueChoiceGenerator Tests                                      */
/* -------------------------------------------------------------------------- */

describe('generateFalloutChoices', () => {
  it('always returns between 2 and 4 unique choices including a clean leave option', () => {
    const scenarios: ChoiceGenContext[] = [
      baseCtx(),
      baseCtx({ loreTopics: {}, turnIndex: 4 }),
      baseCtx({
        questAction: { label: 'Accept Quest: Harvest Time', kind: 'offer' },
        secretUnlocked: true,
        giftCandidate: { itemId: 'berries', itemName: 'Wild Berries' },
      }),
      baseCtx({
        activeTopicsUsed: ['crisis', 'rival', 'item', 'home', 'rumor'],
        turnIndex: 7,
      }),
    ];

    for (const ctx of scenarios) {
      const choices = generateFalloutChoices(ctx);
      expect(choices.length).toBeGreaterThanOrEqual(2);
      expect(choices.length).toBeLessThanOrEqual(4);

      const ids = new Set(choices.map((c) => c.id));
      const labels = new Set(choices.map((c) => c.label.toLowerCase()));
      const prompts = new Set(choices.map((c) => c.prompt.toLowerCase()));
      expect(ids.size).toBe(choices.length);
      expect(labels.size).toBe(choices.length);
      expect(prompts.size).toBe(choices.length);

      const leaveChoices = choices.filter((c) => c.tone === 'leave' && c.action === 'leave');
      expect(leaveChoices).toHaveLength(1);
    }
  });

  it('reacts to openQuestion for trade, rumor, crisis (2-hop solution), and contradiction', () => {
    const tradeChoices = generateFalloutChoices(
      baseCtx({
        lastOpenQuestion: { type: 'trade', options: ['Trade 5 Berries for 20g'], topic: 'berries' },
      }),
    );
    expect(tradeChoices[0].tone).toBe('contextual');
    expect(tradeChoices[0].label).toContain('Trade 5 Berries');

    const rumorChoices = generateFalloutChoices(
      baseCtx({
        lastOpenQuestion: { type: 'rumor', topic: 'sunken ruins' },
      }),
    );
    expect(rumorChoices[0].tone).toBe('contextual');
    expect(rumorChoices[0].prompt.toLowerCase()).toContain('sunken ruins');

    const crisisQChoices = generateFalloutChoices(
      baseCtx({
        activeTopicsUsed: ['crisis'],
        lastOpenQuestion: { type: 'crisis', topic: 'the goblin raids' },
      }),
    );
    expect(crisisQChoices[0].id).toBe('ctx_solve_crisis');
    expect(crisisQChoices[0].label.toLowerCase()).toContain('stop');

    const contradictionChoices = generateFalloutChoices(
      baseCtx({
        lastOpenQuestion: { type: 'contradiction' },
      }),
    );
    expect(contradictionChoices[0].id).toBe('ctx_apology');
  });

  it('offers 2-hop crisis solution when lastConceptSeq is active and handles CogniWSP concept/mood/openQuestion shapes', () => {
    const twoHop = generateFalloutChoices(
      baseCtx({
        activeTopicsUsed: ['crisis'],
        lastConceptSeq: [13, 14], // CRISIS_OPENER, CRISIS_IMPACT
        lastOpenQuestion: null,
      }),
    );
    expect(twoHop[0].id).toBe('ctx_solve_crisis');

    const contradictionConcept = generateFalloutChoices(
      baseCtx({
        lastConceptSeq: [50], // CALLOUT_STANCE_CONTRADICTION
        lastOpenQuestion: null,
      }),
    );
    expect(contradictionConcept[0].id).toBe('ctx_apology');

    const cogniGreetChoice = generateFalloutChoices(
      baseCtx({
        lastOpenQuestion: { type: 'CHOICE', options: ['ITEM', 'RUMOR'], topic: 'trade_or_rumor' },
      }),
    );
    expect(cogniGreetChoice[0].id).toBe('ctx_answer_trade_choice');
    expect(cogniGreetChoice[0].label).not.toBe('ITEM');

    const hostile = generateFalloutChoices(
      baseCtx({
        stance: 'hostile',
        hearts: 0,
        lastConceptSeq: [5],
      }),
    );
    expect(hostile[0].id).toBe('ctx_apology');
    expect(hostile[hostile.length - 1].label).toBe('I should head out.');

    // 7D CogniWSP mood vector with high anger (index 3) triggers hostile apology + guarded leave
    const angryMood7d = generateFalloutChoices(
      baseCtx({
        stance: 'neutral',
        mood: [0.1, 0.1, 0.2, 0.85, 0.3, 0.1, 0.2],
        hearts: 0,
        lastConceptSeq: [5],
      }),
    );
    expect(angryMood7d[0].id).toBe('ctx_apology');
    expect(angryMood7d[angryMood7d.length - 1].label).toBe('I should head out.');
  });

  it('adapts Slot 2 relationship tone to stance/hearts and evolves across turns without repeats', () => {
    const used: string[] = [];
    const turnSlots: Array<{ tone: string; prompt: string }> = [];

    for (let turn = 0; turn < 4; turn += 1) {
      const choices = generateFalloutChoices(
        baseCtx({
          turnIndex: turn,
          hearts: 2,
          stance: 'curious',
          activeTopicsUsed: used,
        }),
      );
      const lever = choices.find((c) => c.tone === 'friendly' || c.tone === 'bold');
      expect(lever).toBeDefined();
      expect(used).not.toContain(lever!.prompt);
      turnSlots.push({ tone: lever!.tone, prompt: lever!.prompt });
      used.push(lever!.prompt);
    }

    // Should include both friendly and bold levers over consecutive turns
    const tones = new Set(turnSlots.map((t) => t.tone));
    expect(tones.has('friendly')).toBe(true);
    expect(tones.has('bold')).toBe(true);
    expect(new Set(turnSlots.map((t) => t.prompt)).size).toBe(4);
  });

  it('enforces Slot 3 world priority: Quest > Secret > Gift > Lore', () => {
    // 1. Quest beats secret and gift
    const withQuest = generateFalloutChoices(
      baseCtx({
        questAction: { label: 'Complete Quest (+65g)', kind: 'complete' },
        secretUnlocked: true,
        secretClaimed: false,
        giftCandidate: { itemId: 'carrot', itemName: 'Carrot' },
        giftedToday: false,
      }),
    );
    expect(withQuest.some((c) => c.tone === 'quest' && c.action === 'quest' && c.primary)).toBe(true);
    expect(withQuest.some((c) => c.tone === 'secret')).toBe(false);
    expect(withQuest.some((c) => c.tone === 'gift')).toBe(false);

    // 2. Secret beats gift and lore when no quest
    const withSecret = generateFalloutChoices(
      baseCtx({
        questAction: null,
        secretUnlocked: true,
        secretClaimed: false,
        giftCandidate: { itemId: 'carrot', itemName: 'Carrot' },
        giftedToday: false,
      }),
    );
    expect(withSecret.some((c) => c.tone === 'secret' && c.action === 'secret' && c.primary)).toBe(true);
    expect(withSecret.some((c) => c.tone === 'gift')).toBe(false);

    // 3. Gift beats lore when secret already claimed (or locked) and not giftedToday
    const withGift = generateFalloutChoices(
      baseCtx({
        secretUnlocked: true,
        secretClaimed: true,
        giftCandidate: { itemId: 'sunflower', itemName: 'Sunflower' },
        giftedToday: false,
      }),
    );
    const giftChoice = withGift.find((c) => c.tone === 'gift');
    expect(giftChoice).toBeDefined();
    expect(giftChoice!.action).toBe('gift');
    expect(giftChoice!.giftItemId).toBe('sunflower');
    expect(giftChoice!.label).toContain('Sunflower');

    // 4. Lore fallback when giftedToday is true
    const afterGift = generateFalloutChoices(
      baseCtx({
        secretUnlocked: false,
        giftCandidate: { itemId: 'sunflower', itemName: 'Sunflower' },
        giftedToday: true,
      }),
    );
    expect(afterGift.some((c) => c.tone === 'gift')).toBe(false);
    expect(afterGift.some((c) => c.tone === 'lore')).toBe(true);
  });

  it('keeps generated player prompts strictly Player-to-NPC without internal openQuestion leaks or accidental identity claims', () => {
    const runtime = new NpcBrainRuntime({ seed: 2026 });
    const pip = runtime.ensureNpc({
      id: 'family_farmer',
      personaKey: 'family',
      loreSlice: {
        name: 'Pip',
        role: 'Seed Keeper',
        home: 'Meadow Homestead',
      },
    });

    // Internal CogniWSP OPEN topics ('player_intent', 'motive') must never leak into choice labels/prompts
    for (const internalTopic of ['player_intent', 'motive']) {
      const openChoices = generateFalloutChoices(
        baseCtx({
          npcName: 'Pip',
          role: 'Seed Keeper',
          lastOpenQuestion: { type: 'OPEN', topic: internalTopic },
        }),
      );
      for (const c of openChoices) {
        expect(c.label.toLowerCase()).not.toContain(internalTopic);
        expect(c.prompt.toLowerCase()).not.toContain(internalTopic);
      }
    }

    // All talk prompts generated across turns speak cleanly to the NPC without triggering CLAIM_IDENTITY
    const used: string[] = [];
    for (let turn = 0; turn < 6; turn += 1) {
      const choices = generateFalloutChoices(
        baseCtx({
          npcName: 'Pip',
          role: 'Seed Keeper',
          turnIndex: turn,
          activeTopicsUsed: used,
        }),
      );
      for (const ch of choices) {
        if (ch.action === 'talk') {
          const res = pip.talk(ch.prompt);
          expect(res.trace.perceptualFrame.primaryAct).not.toBe('CLAIM_IDENTITY');
          expect(res.trace.contradictions).toHaveLength(0);
          used.push(ch.id, ch.label, ch.prompt);
        }
      }
    }

    const homeChoice = generateFalloutChoices(
      baseCtx({
        npcName: 'Pip',
        role: 'Seed Keeper',
        activeTopicsUsed: ['crisis', 'item', 'rival'],
      }),
    ).find((c) => c.id === 'lore_home');
    expect(homeChoice).toBeDefined();
    expect(homeChoice!.prompt).not.toContain('means to Pip');
    expect(homeChoice!.prompt.toLowerCase()).toContain('for you');
  });
});

/* -------------------------------------------------------------------------- */
/* Part 2: DialogueBox UI + Hotkeys + updateTurn Tests                        */
/* -------------------------------------------------------------------------- */

describe('DialogueBox Fallout upgrade and backward compatibility', () => {
  let dom: DomHarness;

  beforeEach(() => {
    dom = installDomHarness();
    settingsStore.reset();
  });

  afterEach(() => {
    dialogueBox.close(false);
    settingsStore.reset();
    dom.cleanup();
    vi.restoreAllMocks();
  });

  it('renders hearts meter, mood pill, and Fallout numbered choices with tone badges', () => {
    settingsStore.update({ dialogue: { speed: 'instant' } });

    const onSelect1 = vi.fn();
    const onSelect2 = vi.fn();
    const onSelect3 = vi.fn();
    const onSelect4 = vi.fn();

    dialogueBox.show({
      speaker: 'Farmer Bram',
      subtitle: 'Homestead Farmer',
      hearts: 3,
      moodLabel: 'Warm',
      moodColor: '#2c6e31',
      choiceLayout: 'fallout',
      lines: ['Good to see you out here!'],
      choices: [
        { label: 'How do we stop the raids?', tone: 'contextual', onSelect: onSelect1 },
        { label: 'This island relies on you.', tone: 'friendly', onSelect: onSelect2 },
        { label: 'Accept Quest', tone: 'quest', primary: true, onSelect: onSelect3 },
        { label: 'Take care.', tone: 'leave', onSelect: onSelect4 },
      ],
    });

    const heartsEl = dom.hudRoot.querySelector('[data-role="dialogue-hearts"]');
    expect(heartsEl).not.toBeNull();
    expect(heartsEl!.textContent).toBe('♥♥♥♡♡');

    const moodEl = dom.hudRoot.querySelector('[data-role="dialogue-mood"]');
    expect(moodEl).not.toBeNull();
    expect(moodEl!.textContent).toBe('Warm');
    expect(moodEl!.style.background).toBe('#2c6e31');

    const actionsEl = dom.hudRoot.querySelector('[data-role="dialogue-actions"]');
    expect(actionsEl!.dataset.layout).toBe('fallout');

    const btns = actionsEl!.querySelectorAll('[data-choice-index]');
    expect(btns).toHaveLength(4);
    expect(btns[0].textContent).toContain('1.');
    expect(btns[0].textContent).toContain('[?]');
    expect(btns[1].textContent).toContain('2.');
    expect(btns[1].textContent).toContain('[♥]');
    expect(btns[2].textContent).toContain('3.');
    expect(btns[2].textContent).toContain('[★]');
    expect(btns[3].textContent).toContain('4.');
    expect(btns[3].textContent).toContain('[→]');
  });

  it('updates speaker, hearts, mood, text, and choices in-place via updateTurn() without recreating overlay', () => {
    settingsStore.update({ dialogue: { speed: 'instant' } });
    const onClose = vi.fn();
    const turn2Select = vi.fn();

    let nextTurnTriggered = false;
    const cfg1: DialogueConfig = {
      speaker: 'Farmer Bram',
      subtitle: 'Townsfolk',
      hearts: 1,
      moodLabel: 'Guarded',
      moodColor: '#9e2a35',
      choiceLayout: 'fallout',
      lines: ['What do you want?'],
      onClose,
      choices: [
        {
          label: 'Sorry about earlier.',
          tone: 'contextual',
          onSelect: () => {
            nextTurnTriggered = true;
            dialogueBox.updateTurn({
              speaker: 'Farmer Bram',
              subtitle: 'Homestead Farmer',
              hearts: 4,
              moodLabel: 'Curious',
              moodColor: '#2e658e',
              choiceLayout: 'fallout',
              lines: ['Alright, I appreciate that.'],
              onClose,
              choices: [
                { label: 'Tell me about the raids.', tone: 'lore', onSelect: turn2Select },
                { label: 'Gift Carrot', tone: 'gift', onSelect: vi.fn() },
                { label: 'What are you hiding?', tone: 'bold', onSelect: vi.fn() },
                { label: 'Take care.', tone: 'leave', onSelect: vi.fn() },
              ],
            });
          },
        },
        { label: 'I should head out.', tone: 'leave', onSelect: vi.fn() },
      ],
    };

    dialogueBox.show(cfg1);
    const initialOverlay = dom.hudRoot.children[0];
    expect(initialOverlay).toBeDefined();

    // Trigger choice 1 via keyboard '1'
    dom.dispatchKeyDown({ key: '1', code: 'Digit1' });
    expect(nextTurnTriggered).toBe(true);
    expect(dialogueBox.isActive()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    // Same overlay DOM node preserved in-place
    expect(dom.hudRoot.children[0]).toBe(initialOverlay);

    expect(dom.hudRoot.querySelector('[data-role="dialogue-hearts"]')!.textContent).toBe('♥♥♥♥♡');
    expect(dom.hudRoot.querySelector('[data-role="dialogue-mood"]')!.textContent).toBe('Curious');
    expect(dom.hudRoot.querySelector('[data-role="dialogue-subtitle"]')!.textContent).toBe('Homestead Farmer');
    expect(dom.hudRoot.querySelector('[data-role="dialogue-text"]')!.textContent).toBe('Alright, I appreciate that.');

    const updatedBtns = dom.hudRoot.querySelectorAll('[data-choice-index]');
    expect(updatedBtns).toHaveLength(4);
    expect(updatedBtns[1].textContent).toContain('[🎁]');
    expect(updatedBtns[2].textContent).toContain('[!]');

    // Selecting choice 1 on turn 2 (which does NOT call updateTurn) runs callback and closes cleanly
    dom.dispatchKeyDown({ key: '1', code: 'Digit1' });
    expect(turn2Select).toHaveBeenCalledTimes(1);
    expect(dialogueBox.isActive()).toBe(false);
  });

  it('ignores 1-4 hotkeys until typing finishes, supports ArrowUp/Down + Enter, and preserves Escape/legacy Space', () => {
    settingsStore.update({ dialogue: { speed: 'normal' } });
    const c1 = vi.fn();
    const c2 = vi.fn();
    const onClose = vi.fn();

    dialogueBox.show({
      speaker: 'Old Barnaby',
      choiceLayout: 'fallout',
      lines: ['Ahoy, sailor!'],
      onClose,
      choices: [
        { label: 'Ask about the pier', tone: 'lore', onSelect: c1 },
        { label: 'Offer help', tone: 'friendly', onSelect: c2 },
      ],
    });

    // While still typing (rAF has not completed), '1' must NOT fire choice 1
    dom.dispatchKeyDown({ key: '1', code: 'Digit1' });
    expect(c1).not.toHaveBeenCalled();
    expect(dialogueBox.isActive()).toBe(true);

    // Space reveals the rest of the line without selecting a choice
    dom.dispatchKeyDown({ key: ' ', code: 'Space' });
    expect(c1).not.toHaveBeenCalled();
    expect(dialogueBox.isActive()).toBe(true);

    // Pressing Enter without ArrowUp/ArrowDown still calls advance() (no accidental choice pick)
    dom.dispatchKeyDown({ key: 'Enter', code: 'Enter' });
    expect(c1).not.toHaveBeenCalled();
    expect(c2).not.toHaveBeenCalled();

    // ArrowDown highlights choice 0, second ArrowDown moves to choice 1, Enter confirms choice 1
    dom.dispatchKeyDown({ key: 'ArrowDown', code: 'ArrowDown' });
    let btns = dom.hudRoot.querySelectorAll('[data-choice-index]');
    expect(btns[0].classList.contains('is-selected')).toBe(true);
    expect(btns[1].classList.contains('is-selected')).toBe(false);

    dom.dispatchKeyDown({ key: 'ArrowDown', code: 'ArrowDown' });
    btns = dom.hudRoot.querySelectorAll('[data-choice-index]');
    expect(btns[0].classList.contains('is-selected')).toBe(false);
    expect(btns[1].classList.contains('is-selected')).toBe(true);

    dom.dispatchKeyDown({ key: 'Enter', code: 'Enter' });
    expect(c2).toHaveBeenCalledTimes(1);
    expect(dialogueBox.isActive()).toBe(false);

    // Legacy choice-less dialogue still closes on Space and Escape invokes onClose
    const legacyClose = vi.fn();
    settingsStore.update({ dialogue: { speed: 'instant' } });
    dialogueBox.show({
      speaker: 'Townsfolk',
      lines: ['Safe travels!'],
      onClose: legacyClose,
    });
    expect(dom.hudRoot.querySelector('[data-role="dialogue-hearts"]')!.style.display).toBe('none');
    dom.dispatchKeyDown({ key: 'Escape', code: 'Escape' });
    expect(legacyClose).toHaveBeenCalledTimes(1);
    expect(dialogueBox.isActive()).toBe(false);
  });
});
