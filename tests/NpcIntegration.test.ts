import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NpcBrainRuntime } from '../src/ai/NpcBrainRuntime';
import {
  isGiftableItem,
  resolveGiftCandidate,
  startNpcConversation,
} from '../src/ai/NpcConversationController';
import { settingsStore } from '../src/core/GameSettings';
import { GameState } from '../src/core/GameState';
import {
  buildAnchorNpcProfiles,
  generateProceduralTown,
  type ProceduralNpcProfile,
} from '../src/data/proceduralNpcs';
import { dialogueBox } from '../src/ui/DialogueBox';

/* -------------------------------------------------------------------------- */
/* Memory Storage & Lightweight DOM Harness                                   */
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
  hudRoot: MockElement;
  dispatchKeyDown: (opts: { key: string; code: string }) => void;
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
    dispatchKeyDown: ({ key, code }) => {
      const evt = { key, code, preventDefault() {} };
      const handlers = [...(winListeners.get('keydown') ?? [])];
      handlers.forEach((fn) => fn(evt));
    },
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
/* Part 1: GameState NPC & WorldSeed Save/Load Round-Trip                     */
/* -------------------------------------------------------------------------- */

describe('GameState NPC & worldSeed persistence', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = createMemoryStorage();
  });

  it('round-trips worldSeed, npcBrains, npcGiftedDay, and npcClaimedSecrets cleanly', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');
    expect(Number.isInteger(gs.worldSeed)).toBe(true);
    expect(gs.worldSeed).toBeGreaterThan(0);

    const savedSeed = gs.worldSeed;
    const runtime = new NpcBrainRuntime({ seed: savedSeed });
    const bram = runtime.ensureNpc({ id: 'farmer', personaKey: 'farmer' });
    bram.talk('Hello! My name is Aria.');
    bram.applyGift('Golden Sunflower', 'loved');
    runtime.recordWorldEvent('Harvest Festival began in Meadow Homestead.');

    gs.setNpcBrainsSnapshot(runtime.serializeAll());
    gs.markNpcGiftedToday('farmer', 3);
    gs.claimNpcSecret('farmer');
    gs.claimNpcSecret('merchant_1');
    gs.save(0);

    const beforeMood = bram.getMoodState();

    const restored = new GameState();
    expect(restored.load(0)).toBe(true);
    expect(restored.worldSeed).toBe(savedSeed);
    expect(restored.hasGiftedNpcToday('farmer', 3)).toBe(true);
    expect(restored.hasGiftedNpcToday('farmer', 4)).toBe(false);
    expect(restored.hasClaimedNpcSecret('farmer')).toBe(true);
    expect(restored.hasClaimedNpcSecret('merchant_1')).toBe(true);
    expect(restored.hasClaimedNpcSecret('alchemist')).toBe(false);

    const restoredRuntime = new NpcBrainRuntime({ seed: restored.worldSeed });
    restoredRuntime.hydrateAll(restored.getNpcBrainsSnapshot());
    const restoredBram = restoredRuntime.getNpc('farmer');
    expect(restoredBram).not.toBeNull();
    expect(restoredBram!.getMoodState().hearts).toBe(beforeMood.hearts);
    expect(restoredBram!.getMoodState().mood[0]).toBeCloseTo(beforeMood.mood[0], 3);
  });

  it('backfills safe defaults when loading legacy saves without AI fields', () => {
    localStorage.setItem(
      'isles_of_foraging_save_v2_slot_0',
      JSON.stringify({
        version: 2,
        heroClass: 'Gladiator',
      }),
    );

    const gs = new GameState();
    expect(gs.load(0)).toBe(true);
    expect(Number.isInteger(gs.worldSeed)).toBe(true);
    expect(gs.worldSeed).toBeGreaterThan(0);
    expect(gs.getNpcBrainsSnapshot()).toEqual({});
    expect(gs.hasGiftedNpcToday('farmer', 1)).toBe(false);
    expect(gs.hasClaimedNpcSecret('farmer')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Part 2: startNpcConversation Multi-Turn Fallout Integration                */
/* -------------------------------------------------------------------------- */

describe('NpcConversationController multi-turn integration', () => {
  let dom: DomHarness;

  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = createMemoryStorage();
    dom = installDomHarness();
    settingsStore.reset();
    settingsStore.update({ dialogue: { speed: 'instant' } });
  });

  afterEach(() => {
    dialogueBox.close(false);
    settingsStore.reset();
    dom.cleanup();
    vi.restoreAllMocks();
  });

  it('selects giftable items while skipping tools and weapons', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');

    expect(isGiftableItem('pickaxe')).toBe(false);
    expect(isGiftableItem('sword')).toBe(false);
    expect(isGiftableItem('shovel')).toBe(false);
    expect(isGiftableItem('berries')).toBe(true);
    expect(isGiftableItem('iron_ore')).toBe(true);

    // Hotbar slot 0 is pickaxe (tool) -> skips tools/weapons in bagSlots and finds wood
    gs.selectedHotbarIndex = 0;
    expect(resolveGiftCandidate(gs)?.itemId).toBe('wood');

    // Selecting berries on hotbar index 4 prioritizes held giftable item
    gs.selectedHotbarIndex = 4;
    expect(resolveGiftCandidate(gs)?.itemId).toBe('berries');
  });

  it('runs multi-turn talk, in-place updateTurn, daily gifting, and one-time secret claiming', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');
    const runtime = new NpcBrainRuntime({ seed: 2026 });

    const town = generateProceduralTown(2026);
    const merchantWithCoins = town.find(
      (n) => n.category === 'merchant' && n.secretReward.kind === 'coins',
    );
    const villager: ProceduralNpcProfile =
      merchantWithCoins ?? {
        ...town[0],
        secretReward: { kind: 'coins', amount: 120, description: 'Hands over 120 coins.' },
      };
    // Ensure any friendship-gated quest for this villager doesn't preempt Slot 3's gift button in this gift/secret test
    const existingQuest = gs.getNextQuestForNpc(villager.id, 5);
    if (existingQuest) {
      gs.completedQuests.add(existingQuest.id);
    }

    const lovedId = villager.gifts.loved[0];
    gs.addItem(lovedId, 2);
    const lovedIdx = gs.hotbar.indexOf(lovedId);
    if (lovedIdx !== -1) {
      gs.selectedHotbarIndex = lovedIdx;
    } else {
      gs.assignHotbarSlot(5, lovedId);
      gs.selectedHotbarIndex = 5;
    }

    const onGiftReaction = vi.fn();
    const onSecretClaimed = vi.fn();
    const onConversationEnd = vi.fn();

    startNpcConversation({
      profile: villager,
      currentDay: 2,
      runtime,
      state: gs,
      onGiftReaction,
      onSecretClaimed,
      onConversationEnd,
    });

    expect(dialogueBox.isActive()).toBe(true);
    const initialOverlay = dom.hudRoot.children[0];
    expect(dom.hudRoot.querySelector('[data-role="dialogue-speaker"]')!.textContent).toBe(
      villager.name,
    );

    const turn0Btns = getChoiceButtons(dom.hudRoot);
    expect(turn0Btns.length).toBeGreaterThanOrEqual(2);
    expect(turn0Btns.length).toBeLessThanOrEqual(4);

    // 1. Select Slot 1 (contextual/talk) -> updates seamlessly in-place
    const firstLabel = turn0Btns[0].textContent;
    turn0Btns[0].click();
    expect(dialogueBox.isActive()).toBe(true);
    expect(dom.hudRoot.children[0]).toBe(initialOverlay);

    // Slot 1 label/topic rotates without repeating exhausted topic
    const turn1Btns = getChoiceButtons(dom.hudRoot);
    expect(turn1Btns[0].textContent).not.toBe(firstLabel);

    // 2. Give loved gift via Slot 3 ('gift')
    const giftBtn = turn1Btns.find((b) => b.dataset.tone === 'gift');
    expect(giftBtn).toBeDefined();
    const beforeCount = gs.getBagItemCount(lovedId);
    giftBtn!.click();

    expect(gs.getBagItemCount(lovedId)).toBe(beforeCount - 1);
    expect(gs.hasGiftedNpcToday(villager.id, 2)).toBe(true);
    expect(onGiftReaction).toHaveBeenCalledTimes(1);
    expect(onGiftReaction.mock.calls[0][0]).toBe('loved');
    expect(dialogueBox.isActive()).toBe(true);
    expect(dom.hudRoot.children[0]).toBe(initialOverlay);

    // Ensure gift is no longer offered today, and if secret isn't unlocked yet, boost friendliness once
    let nextBtns = getChoiceButtons(dom.hudRoot);
    expect(nextBtns.some((b) => b.dataset.tone === 'gift')).toBe(false);

    let secretBtn = nextBtns.find((b) => b.dataset.tone === 'secret');
    if (!secretBtn) {
      // One friendly lever turn raises trust over 0.3 threshold
      const friendlyBtn = nextBtns.find((b) => b.dataset.tone === 'friendly');
      friendlyBtn?.click();
      nextBtns = getChoiceButtons(dom.hudRoot);
      secretBtn = nextBtns.find((b) => b.dataset.tone === 'secret');
    }

    // Force-verify secret unlock in case persona mood needed one more friendly turn
    if (!secretBtn) {
      const friendlyBtn = nextBtns.find((b) => b.dataset.tone === 'friendly');
      friendlyBtn?.click();
      nextBtns = getChoiceButtons(dom.hudRoot);
      secretBtn = nextBtns.find((b) => b.dataset.tone === 'secret');
    }

    expect(secretBtn).toBeDefined();
    const coinsBefore = gs.coins;
    const bagBefore = { ...gs.inventory };
    secretBtn!.click();

    expect(gs.hasClaimedNpcSecret(villager.id)).toBe(true);
    expect(onSecretClaimed).toHaveBeenCalledTimes(1);
    if (villager.secretReward.kind === 'coins') {
      expect(gs.coins).toBe(coinsBefore + (villager.secretReward.amount ?? 50));
    } else if (villager.secretReward.kind === 'item' && villager.secretReward.itemId) {
      expect(gs.inventory[villager.secretReward.itemId]).toBe(
        (bagBefore[villager.secretReward.itemId] ?? 0) + (villager.secretReward.amount ?? 1),
      );
    }

    // Secret option never appears again once claimed
    const postSecretBtns = getChoiceButtons(dom.hudRoot);
    expect(postSecretBtns.some((b) => b.dataset.tone === 'secret')).toBe(false);

    // 4. Leaving closes cleanly, syncs brains, and calls onConversationEnd
    const leaveBtn = postSecretBtns.find((b) => b.dataset.tone === 'leave');
    expect(leaveBtn).toBeDefined();
    leaveBtn!.click();

    expect(dialogueBox.isActive()).toBe(false);
    expect(onConversationEnd).toHaveBeenCalledTimes(1);
    expect(Object.keys(gs.getNpcBrainsSnapshot())).toContain('npcs');
  });

  it('pins deterministic quest offer & complete callbacks in Slot 3 and records world events', () => {
    const gs = new GameState();
    gs.reset('Gladiator');
    const runtime = new NpcBrainRuntime({ seed: 9001 });
    const farmerProfile = buildAnchorNpcProfiles(9001).find((p) => p.id === 'farmer')!;

    const onAcceptQuest = vi.fn();
    const onCompleteQuest = vi.fn();

    // 1. Quest Offer Flow (farmer_1: Harvest Time)
    startNpcConversation({
      profile: farmerProfile,
      currentDay: 1,
      runtime,
      state: gs,
      onAcceptQuest,
      onCompleteQuest,
    });

    const turn0Btns = getChoiceButtons(dom.hudRoot);
    const questOfferBtn = turn0Btns.find((b) => b.dataset.tone === 'quest');
    expect(questOfferBtn).toBeDefined();
    expect(questOfferBtn!.textContent).toContain('Harvest Time');

    // Selecting Slot 3 advances to deterministic offerDialogue (may be multi-page)
    questOfferBtn!.click();
    expect(dialogueBox.isActive()).toBe(true);
    while (getChoiceButtons(dom.hudRoot).length === 0) {
      dialogueBox.advance();
    }
    const offerChoiceBtns = getChoiceButtons(dom.hudRoot);
    expect(offerChoiceBtns[0].textContent).toContain('Accept Quest');

    // Accepting fires callback, updates GameState, closes dialogueBox, and records world event
    offerChoiceBtns[0].click();
    expect(onAcceptQuest).toHaveBeenCalledTimes(1);
    expect(onAcceptQuest.mock.calls[0][0].id).toBe('farmer_1');
    expect(gs.isQuestActive('farmer_1')).toBe(true);
    expect(dialogueBox.isActive()).toBe(false);

    // 2. Quest Complete Flow (collect 10 Wild Berries)
    gs.addItem('berries', 10);
    expect(gs.isQuestReadyToTurnIn('farmer_1')).toBe(true);

    startNpcConversation({
      profile: farmerProfile,
      currentDay: 1,
      runtime,
      state: gs,
      onAcceptQuest,
      onCompleteQuest,
    });

    const turnTurnInBtns = getChoiceButtons(dom.hudRoot);
    const questCompleteBtn = turnTurnInBtns.find((b) => b.dataset.tone === 'quest');
    expect(questCompleteBtn).toBeDefined();
    expect(questCompleteBtn!.textContent).toContain('Turn In: Harvest Time');

    questCompleteBtn!.click();
    while (getChoiceButtons(dom.hudRoot).length === 0) {
      dialogueBox.advance();
    }
    const confirmCompleteBtns = getChoiceButtons(dom.hudRoot);
    expect(confirmCompleteBtns[0].textContent).toContain('Complete');

    const coinsBefore = gs.coins;
    confirmCompleteBtns[0].click();

    expect(onCompleteQuest).toHaveBeenCalledTimes(1);
    expect(onCompleteQuest.mock.calls[0][0].id).toBe('farmer_1');
    expect(gs.completedQuests.has('farmer_1')).toBe(true);
    expect(gs.coins).toBe(coinsBefore + 65);
    expect(gs.getBagItemCount('carrot')).toBe(5);
    expect(dialogueBox.isActive()).toBe(true);

    const savedBrains = gs.getNpcBrainsSnapshot() as { worldEvents?: string[] };
    expect(savedBrains.worldEvents?.some((e) => e.includes('Harvest Time'))).toBe(true);
  });
});
