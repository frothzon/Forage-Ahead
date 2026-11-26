import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class Scene {},
    BlendModes: { ADD: 1, MULTIPLY: 2 },
    GameObjects: {
      Container: class Container {},
    },
    Renderer: {
      WebGL: {
        Pipelines: {
          MultiPipeline: class MultiPipeline {},
          PostFXPipeline: class PostFXPipeline {},
        },
        WebGLRenderer: class WebGLRenderer {},
      },
    },
    Math: {
      Vector2: class Vector2 {
        public x = 0;
        public y = 0;
        constructor(x = 0, y = 0) {
          this.x = x;
          this.y = y;
        }
      },
      Clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)),
      Between: (min: number) => min,
      Linear: (a: number, b: number, t: number) => a + (b - a) * t,
    },
  },
}));

import { NpcBrainRuntime } from '../src/ai/NpcBrainRuntime';
import { startNpcConversation } from '../src/ai/NpcConversationController';
import { settingsStore } from '../src/core/GameSettings';
import { GameState } from '../src/core/GameState';
import { generateProceduralTown, type ProceduralNpcProfile } from '../src/data/proceduralNpcs';
import { isNpcBusyInConversation, shouldPauseWorldClock } from '../src/scenes/OverworldScene';
import { dialogueBox } from '../src/ui/DialogueBox';
import { merchantShopModal } from '../src/ui/MerchantShopModal';

/* -------------------------------------------------------------------------- */
/* Lightweight DOM & Storage Harness                                          */
/* -------------------------------------------------------------------------- */

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

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
  public alt = '';
  public type = '';
  public disabled = false;
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
  hudRoot: MockElement;
  cleanup: () => void;
}

function installDomHarness(): DomHarness {
  const prevDoc = (globalThis as Record<string, unknown>).document;
  const prevWin = (globalThis as Record<string, unknown>).window;
  const prevRaf = (globalThis as Record<string, unknown>).requestAnimationFrame;
  const prevCaf = (globalThis as Record<string, unknown>).cancelAnimationFrame;

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

  (globalThis as Record<string, unknown>).document = doc;
  (globalThis as Record<string, unknown>).window = win;
  (globalThis as Record<string, unknown>).requestAnimationFrame = () => 1;
  (globalThis as Record<string, unknown>).cancelAnimationFrame = () => {};

  return {
    hudRoot,
    cleanup: () => {
      (globalThis as Record<string, unknown>).document = prevDoc;
      (globalThis as Record<string, unknown>).window = prevWin;
      (globalThis as Record<string, unknown>).requestAnimationFrame = prevRaf;
      (globalThis as Record<string, unknown>).cancelAnimationFrame = prevCaf;
    },
  };
}

function getChoiceButtons(hudRoot: MockElement): MockElement[] {
  return hudRoot.querySelectorAll('[data-choice-index]');
}

/* -------------------------------------------------------------------------- */
/* World Clock Pause & Active NPC Freeze Helpers                              */
/* -------------------------------------------------------------------------- */

describe('OverworldScene world clock pause & active NPC freeze helpers', () => {
  it('pauses world clock iff dialogueBox or merchantShopModal is active', () => {
    expect(shouldPauseWorldClock(false, false)).toBe(false);
    expect(shouldPauseWorldClock(true, false)).toBe(true);
    expect(shouldPauseWorldClock(false, true)).toBe(true);
    expect(shouldPauseWorldClock(true, true)).toBe(true);
  });

  it('freezes ONLY the active speaking/shopping NPC and unfreezes immediately when both close', () => {
    // Active conversation with merchant_1 while dialogue is open
    expect(isNpcBusyInConversation('merchant_1', 'merchant_1', true, false)).toBe(true);
    expect(isNpcBusyInConversation('farmer', 'merchant_1', true, false)).toBe(false);

    // Handed off to merchant shop modal (dialogue closed, shop open)
    expect(isNpcBusyInConversation('merchant_1', 'merchant_1', false, true)).toBe(true);
    expect(isNpcBusyInConversation('farmer', 'merchant_1', false, true)).toBe(false);

    // Both open
    expect(isNpcBusyInConversation('merchant_1', 'merchant_1', true, true)).toBe(true);

    // Both closed -> unfreezes immediately even before stale activeConversationNpcId clears
    expect(isNpcBusyInConversation('merchant_1', 'merchant_1', false, false)).toBe(false);

    // No active conversation NPC -> never freezes
    expect(isNpcBusyInConversation('merchant_1', null, true, false)).toBe(false);
    expect(isNpcBusyInConversation('merchant_1', null, false, true)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* NpcConversationController -> onOpenMerchantShop Handoff                    */
/* -------------------------------------------------------------------------- */

describe('NpcConversationController onOpenMerchantShop handoff', () => {
  let dom: DomHarness;

  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = createMemoryStorage();
    dom = installDomHarness();
    settingsStore.reset();
    settingsStore.update({ dialogue: { speed: 'instant' } });
  });

  afterEach(() => {
    merchantShopModal.close(false);
    dialogueBox.close(false);
    settingsStore.reset();
    dom.cleanup();
    vi.restoreAllMocks();
  });

  it('hands off to onOpenMerchantShop without firing onConversationEnd, supports onBackToChat, and ends on Leave', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');
    gs.worldSeed = 5150;
    const runtime = new NpcBrainRuntime({ seed: 5150 });
    const merchant = generateProceduralTown(5150).find((n) => n.category === 'merchant')!;
    const merchantProfile: ProceduralNpcProfile = {
      ...merchant,
      baselineMood: [0.55, 0.55, 0.5, 0.5],
    };

    const onOpenMerchantShop = vi.fn();
    const onConversationEnd = vi.fn();

    startNpcConversation({
      profile: merchantProfile,
      currentDay: 4,
      runtime,
      state: gs,
      onOpenMerchantShop,
      onConversationEnd,
    });

    expect(dialogueBox.isActive()).toBe(true);
    const shopBtn = getChoiceButtons(dom.hudRoot).find((b) => b.dataset.tone === 'shop');
    expect(shopBtn).toBeDefined();

    // Selecting Browse Wares closes dialogueBox silently and opens external shop modal
    shopBtn!.click();
    expect(dialogueBox.isActive()).toBe(false);
    expect(onConversationEnd).not.toHaveBeenCalled();
    expect(onOpenMerchantShop).toHaveBeenCalledTimes(1);

    const ctx = onOpenMerchantShop.mock.calls[0][0];
    expect(ctx.profile.id).toBe(merchantProfile.id);
    expect(ctx.currentDay).toBe(4);
    expect(ctx.hearts).toBe(runtime.getNpcMoodState(merchantProfile.id).hearts);
    expect(ctx.secretClaimed).toBe(false);

    // Returning from shop re-opens dialogueBox on the last turn without ending conversation
    ctx.onBackToChat();
    expect(dialogueBox.isActive()).toBe(true);
    expect(onConversationEnd).not.toHaveBeenCalled();
    expect(dom.hudRoot.querySelector('[data-role="dialogue-speaker"]')!.textContent).toBe(
      merchantProfile.name,
    );
    const restoredBtns = getChoiceButtons(dom.hudRoot);
    expect(restoredBtns.some((b) => b.dataset.tone === 'shop')).toBe(true);

    // Leaving after returning finishes conversation cleanly
    const leaveBtn = restoredBtns.find((b) => b.dataset.tone === 'leave');
    expect(leaveBtn).toBeDefined();
    leaveBtn!.click();
    expect(dialogueBox.isActive()).toBe(false);
    expect(onConversationEnd).toHaveBeenCalledTimes(1);
    expect(Object.keys(gs.getNpcBrainsSnapshot())).toContain('npcs');
  });

  it('fires onConversationEnd once and saves brains when onCloseAll is called directly from shop', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');
    gs.worldSeed = 6262;
    const runtime = new NpcBrainRuntime({ seed: 6262 });
    const merchant = generateProceduralTown(6262).find((n) => n.category === 'merchant')!;
    gs.claimNpcSecret(merchant.id);

    const onOpenMerchantShop = vi.fn();
    const onConversationEnd = vi.fn();

    startNpcConversation({
      profile: merchant,
      currentDay: 7,
      runtime,
      state: gs,
      onOpenMerchantShop,
      onConversationEnd,
    });

    const shopBtn = getChoiceButtons(dom.hudRoot).find((b) => b.dataset.tone === 'shop');
    expect(shopBtn).toBeDefined();
    shopBtn!.click();

    expect(dialogueBox.isActive()).toBe(false);
    expect(onConversationEnd).not.toHaveBeenCalled();
    expect(onOpenMerchantShop).toHaveBeenCalledTimes(1);

    const ctx = onOpenMerchantShop.mock.calls[0][0];
    expect(ctx.currentDay).toBe(7);
    expect(ctx.secretClaimed).toBe(true);

    // Closing the shop directly ends the conversation and persists brains (idempotent)
    ctx.onCloseAll();
    ctx.onCloseAll();
    expect(dialogueBox.isActive()).toBe(false);
    expect(onConversationEnd).toHaveBeenCalledTimes(1);
    expect(Object.keys(gs.getNpcBrainsSnapshot())).toContain('npcs');
  });

  it('integrates end-to-end with real merchantShopModal for Back to Chat, Close, clock pause, and NPC freeze', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');
    gs.worldSeed = 7373;
    const runtime = new NpcBrainRuntime({ seed: 7373 });
    const merchant = generateProceduralTown(7373).find((n) => n.category === 'merchant')!;
    const activeNpcId = merchant.id;
    const onConversationEnd = vi.fn();

    startNpcConversation({
      profile: merchant,
      currentDay: 2,
      runtime,
      state: gs,
      onOpenMerchantShop: ({
        profile: mProfile,
        currentDay: day,
        hearts,
        secretClaimed,
        onBackToChat,
        onCloseAll,
      }) => {
        merchantShopModal.show({
          merchantId: mProfile.id,
          merchantName: mProfile.name,
          merchantTitle: mProfile.title,
          portraitKey: mProfile.spriteKey,
          hearts,
          secretClaimed,
          worldSeed: gs.worldSeed,
          dayNumber: day,
          state: gs,
          onBackToChat,
          onClose: onCloseAll,
        });
      },
      onConversationEnd,
    });

    // 1. Talking freezes merchant & pauses clock
    expect(shouldPauseWorldClock(dialogueBox.isActive(), merchantShopModal.isActive())).toBe(true);
    expect(
      isNpcBusyInConversation(
        merchant.id,
        activeNpcId,
        dialogueBox.isActive(),
        merchantShopModal.isActive(),
      ),
    ).toBe(true);
    expect(
      isNpcBusyInConversation(
        'farmer',
        activeNpcId,
        dialogueBox.isActive(),
        merchantShopModal.isActive(),
      ),
    ).toBe(false);

    // 2. Browse Wares hands off to merchantShopModal; clock & merchant freeze stay active
    getChoiceButtons(dom.hudRoot).find((b) => b.dataset.tone === 'shop')!.click();
    expect(dialogueBox.isActive()).toBe(false);
    expect(merchantShopModal.isActive()).toBe(true);
    expect(onConversationEnd).not.toHaveBeenCalled();
    expect(shouldPauseWorldClock(dialogueBox.isActive(), merchantShopModal.isActive())).toBe(true);
    expect(
      isNpcBusyInConversation(
        merchant.id,
        activeNpcId,
        dialogueBox.isActive(),
        merchantShopModal.isActive(),
      ),
    ).toBe(true);

    // 3. Back to Chat closes shop and restores dialogueBox without ending conversation
    const backBtn = dom.hudRoot.querySelector('[data-role="shop-back-to-chat"]');
    expect(backBtn).not.toBeNull();
    backBtn!.click();
    expect(merchantShopModal.isActive()).toBe(false);
    expect(dialogueBox.isActive()).toBe(true);
    expect(onConversationEnd).not.toHaveBeenCalled();
    expect(shouldPauseWorldClock(dialogueBox.isActive(), merchantShopModal.isActive())).toBe(true);
    expect(
      isNpcBusyInConversation(
        merchant.id,
        activeNpcId,
        dialogueBox.isActive(),
        merchantShopModal.isActive(),
      ),
    ).toBe(true);

    // 4. Re-open shop and close via Close button -> unfreezes clock & NPC, fires onConversationEnd once
    getChoiceButtons(dom.hudRoot).find((b) => b.dataset.tone === 'shop')!.click();
    expect(merchantShopModal.isActive()).toBe(true);
    const closeBtn = dom.hudRoot.querySelector('[data-role="shop-close-btn"]');
    expect(closeBtn).not.toBeNull();
    closeBtn!.click();

    expect(merchantShopModal.isActive()).toBe(false);
    expect(dialogueBox.isActive()).toBe(false);
    expect(onConversationEnd).toHaveBeenCalledTimes(1);
    expect(shouldPauseWorldClock(dialogueBox.isActive(), merchantShopModal.isActive())).toBe(false);
    expect(
      isNpcBusyInConversation(
        merchant.id,
        activeNpcId,
        dialogueBox.isActive(),
        merchantShopModal.isActive(),
      ),
    ).toBe(false);
  });
});
