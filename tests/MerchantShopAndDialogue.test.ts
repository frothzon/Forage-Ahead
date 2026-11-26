import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateFalloutChoices,
  type ChoiceGenContext,
} from '../src/ai/DialogueChoiceGenerator';
import { NpcBrainRuntime } from '../src/ai/NpcBrainRuntime';
import {
  resolveGiftCandidate,
  startNpcConversation,
} from '../src/ai/NpcConversationController';
import { settingsStore } from '../src/core/GameSettings';
import { BAG_SIZE, GameState } from '../src/core/GameState';
import { ITEMS } from '../src/data/items';
import {
  getMerchantDailyStock,
  getMerchantDiscountPct,
  purchaseMerchantOffer,
  type MerchantShopOffer,
} from '../src/data/merchantShop';
import {
  buildAnchorNpcProfiles,
  generateProceduralTown,
  type ProceduralNpcProfile,
} from '../src/data/proceduralNpcs';
import type { QuestDef } from '../src/data/quests';
import { dialogueBox } from '../src/ui/DialogueBox';

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

function baseCtx(overrides: Partial<ChoiceGenContext> = {}): ChoiceGenContext {
  return {
    npcName: 'Alden',
    role: 'Guild Factor',
    stance: 'neutral',
    mood: [0.3, 0.4, 0, 0],
    hearts: 2,
    secretUnlocked: false,
    secretClaimed: false,
    turnIndex: 0,
    lastConceptSeq: [],
    lastOpenQuestion: null,
    activeTopicsUsed: [],
    loreTopics: {
      crisis: 'sea monsters driving up shipping premiums',
      rival: 'rival Guild caravan brokers',
      item: 'exotic seeds and Gold Ingots',
      home: 'the rotating trade routes',
      rumor: 'top prices on Starfruit Tarts and Frost Salmon',
    },
    questAction: null,
    giftCandidate: null,
    giftedToday: false,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Part 1: Traveling Merchant Shop Unit Tests                                 */
/* -------------------------------------------------------------------------- */

describe('Traveling Merchant Shop (src/data/merchantShop.ts)', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = createMemoryStorage();
  });

  it('computes heart-based discounts (0/10/20%) and 25% cap when secretClaimed is true', () => {
    expect(getMerchantDiscountPct(0)).toBe(0);
    expect(getMerchantDiscountPct(1)).toBe(0);
    expect(getMerchantDiscountPct(2)).toBe(10);
    expect(getMerchantDiscountPct(3)).toBe(10);
    expect(getMerchantDiscountPct(4)).toBe(20);
    expect(getMerchantDiscountPct(5)).toBe(20);
    expect(getMerchantDiscountPct(3, true)).toBe(25);
    expect(getMerchantDiscountPct(5, true)).toBe(25);
  });

  it('generates 3 deterministic daily offers that rotate cleanly across days and merchants', () => {
    const day1A = getMerchantDailyStock({
      merchantId: 'merchant_1',
      worldSeed: 2026,
      dayNumber: 1,
      hearts: 0,
    });
    const day1B = getMerchantDailyStock({
      merchantId: 'merchant_1',
      worldSeed: 2026,
      dayNumber: 1,
      hearts: 0,
    });
    expect(day1A).toEqual(day1B);
    expect(day1A).toHaveLength(3);

    for (const offer of day1A) {
      expect(ITEMS[offer.itemId]).toBeDefined();
      expect(offer.name).toBe(ITEMS[offer.itemId].name);
      expect(offer.count).toBeGreaterThanOrEqual(1);
      expect(offer.discountPct).toBe(0);
      expect(offer.finalPrice).toBe(offer.basePrice);
    }
    expect(['Supplies', 'Provisions']).toContain(day1A[0].tag);
    expect(day1A[1].tag).toBe('Materials');
    expect(day1A[2].tag).toBe('Rare Find');

    const day2 = getMerchantDailyStock({
      merchantId: 'merchant_1',
      worldSeed: 2026,
      dayNumber: 2,
      hearts: 0,
    });
    expect(day2).toHaveLength(3);
    expect(day2.map((o) => o.itemId)).not.toEqual(day1A.map((o) => o.itemId));
    expect(day2[0].itemId).not.toBe(day1A[0].itemId);
    expect(day2[1].itemId).not.toBe(day1A[1].itemId);
    expect(day2[2].itemId).not.toBe(day1A[2].itemId);

    const otherMerchantDay1 = getMerchantDailyStock({
      merchantId: 'merchant_2',
      worldSeed: 2026,
      dayNumber: 1,
      hearts: 0,
    });
    expect(otherMerchantDay1.map((o) => o.itemId)).not.toEqual(day1A.map((o) => o.itemId));

    // Heart & secret discounts scale finalPrice strictly below basePrice
    const discounted = getMerchantDailyStock({
      merchantId: 'merchant_1',
      worldSeed: 2026,
      dayNumber: 1,
      hearts: 4,
      secretClaimed: true,
    });
    for (let i = 0; i < 3; i += 1) {
      expect(discounted[i].itemId).toBe(day1A[i].itemId);
      expect(discounted[i].discountPct).toBe(25);
      expect(discounted[i].finalPrice).toBe(Math.max(1, Math.round(day1A[i].basePrice * 0.75)));
    }
  });

  it('deducts coins and adds items on purchase, and rejects insufficient coins or full bags', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');

    const [offer] = getMerchantDailyStock({
      merchantId: 'merchant_1',
      worldSeed: 777,
      dayNumber: 1,
      hearts: 2,
    });

    // Insufficient coins
    gs.coins = offer.finalPrice - 1;
    const beforeCount = gs.getBagItemCount(offer.itemId);
    const failCoins = purchaseMerchantOffer(gs, offer);
    expect(failCoins).toEqual({ ok: false, reason: 'insufficient_coins' });
    expect(gs.coins).toBe(offer.finalPrice - 1);
    expect(gs.getBagItemCount(offer.itemId)).toBe(beforeCount);

    // Sufficient coins
    gs.coins = offer.finalPrice + 25;
    const okRes = purchaseMerchantOffer(gs, offer);
    expect(okRes).toEqual({ ok: true });
    expect(gs.coins).toBe(25);
    expect(gs.getBagItemCount(offer.itemId)).toBe(beforeCount + offer.count);

    // Bag full check for a new unowned stackable item
    for (let i = 0; i < BAG_SIZE; i += 1) {
      gs.bagSlots[i] = { itemId: 'stone', count: 1 };
    }
    const uniqueOffer: MerchantShopOffer = {
      id: 'test_full_bag',
      itemId: 'egg_slime',
      name: 'Slime Egg',
      count: 1,
      basePrice: 60,
      finalPrice: 60,
      discountPct: 0,
      tag: 'Rare Find',
    };
    gs.coins = 200;
    const failBag = purchaseMerchantOffer(gs, uniqueOffer);
    expect(failBag).toEqual({ ok: false, reason: 'bag_full' });
    expect(gs.coins).toBe(200);
  });
});

/* -------------------------------------------------------------------------- */
/* Part 2: DialogueChoiceGenerator Merchant, Gift Tags & Gift Hint Tests      */
/* -------------------------------------------------------------------------- */

describe('DialogueChoiceGenerator merchant shop, gift tags, and gift hints', () => {
  it('always offers Browse Wares for traveling merchants with proper primary priority', () => {
    const merchantChoices = generateFalloutChoices(
      baseCtx({
        isMerchant: true,
        questAction: null,
        giftCandidate: { itemId: 'gold_ingot', itemName: 'Gold Ingot' },
      }),
    );
    expect(merchantChoices.length).toBeGreaterThanOrEqual(2);
    expect(merchantChoices.length).toBeLessThanOrEqual(4);
    const shopChoice = merchantChoices.find((c) => c.action === 'shop');
    expect(shopChoice).toBeDefined();
    expect(shopChoice!.label).toBe('Browse Wares');
    expect(shopChoice!.tone).toBe('shop');
    expect(shopChoice!.primary).toBe(true);
    expect(merchantChoices.some((c) => c.action === 'gift')).toBe(true);

    // With an active quest, quest is primary and Browse Wares is secondary (primary: false)
    const merchantWithQuest = generateFalloutChoices(
      baseCtx({
        isMerchant: true,
        questAction: { label: 'Quest: Caravan Delivery', kind: 'offer' },
      }),
    );
    const shopWithQuest = merchantWithQuest.find((c) => c.action === 'shop');
    const questChoice = merchantWithQuest.find((c) => c.action === 'quest');
    expect(shopWithQuest).toBeDefined();
    expect(shopWithQuest!.primary).toBe(false);
    expect(questChoice).toBeDefined();
    expect(questChoice!.primary).toBe(true);
  });

  it('appends known gift reaction suffixes (♥), (+), (!) on the gift button label', () => {
    const loved = generateFalloutChoices(
      baseCtx({
        giftCandidate: { itemId: 'sunflower', itemName: 'Golden Sunflower' },
        knownGiftReaction: 'loved',
      }),
    ).find((c) => c.action === 'gift');
    expect(loved?.label).toBe('Gift Golden Sunflower (♥)');

    const liked = generateFalloutChoices(
      baseCtx({
        giftCandidate: { itemId: 'carrot', itemName: 'Crisp Carrot' },
        knownGiftReaction: 'liked',
      }),
    ).find((c) => c.action === 'gift');
    expect(liked?.label).toBe('Gift Crisp Carrot (+)');

    const disliked = generateFalloutChoices(
      baseCtx({
        giftCandidate: { itemId: 'bone', itemName: 'Ancient Bone' },
        knownGiftReaction: 'disliked',
      }),
    ).find((c) => c.action === 'gift');
    expect(disliked?.label).toBe('Gift Ancient Bone (!)');

    const unknown = generateFalloutChoices(
      baseCtx({
        giftCandidate: { itemId: 'wood', itemName: 'Wood' },
        knownGiftReaction: null,
      }),
    ).find((c) => c.action === 'gift');
    expect(unknown?.label).toBe('Gift Wood');
  });

  it('offers lore_gift_hint only when giftHintAvailable, hearts >= 1, and gift_hint unused', () => {
    const available = generateFalloutChoices(
      baseCtx({
        hearts: 1,
        giftHintAvailable: true,
        activeTopicsUsed: [],
      }),
    );
    const hintChoice = available.find((c) => c.id === 'lore_gift_hint');
    expect(hintChoice).toBeDefined();
    expect(hintChoice!.label).toBe('What sort of gifts do you like?');

    const tooLowHearts = generateFalloutChoices(
      baseCtx({
        hearts: 0,
        giftHintAvailable: true,
      }),
    );
    expect(tooLowHearts.some((c) => c.id === 'lore_gift_hint')).toBe(false);

    const alreadyAsked = generateFalloutChoices(
      baseCtx({
        hearts: 3,
        giftHintAvailable: true,
        activeTopicsUsed: ['gift_hint'],
      }),
    );
    expect(alreadyAsked.some((c) => c.id === 'lore_gift_hint')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Part 3: NpcConversationController Shop, Smart Gifts, Hint & Heart-Up Tests */
/* -------------------------------------------------------------------------- */

describe('NpcConversationController shop flow, smart gifts, and heart-up celebration', () => {
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

  it('runs the in-dialogue merchant shop flow, purchase feedback, and Back to Conversation', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');
    gs.worldSeed = 4242;
    const runtime = new NpcBrainRuntime({ seed: 4242 });
    const merchant = generateProceduralTown(4242).find((n) => n.category === 'merchant')!;

    // Set baseline mood to yield 2+ hearts so discount badge is also visible
    const merchantProfile: ProceduralNpcProfile = {
      ...merchant,
      baselineMood: [0.55, 0.55, 0.5, 0.5],
    };

    const moodBefore = runtime.ensureNpc({
      id: merchantProfile.id,
      personaKey: merchantProfile.personaKey,
      baselineMood: merchantProfile.baselineMood,
      seed: merchantProfile.seed,
    }).getMoodState();

    const expectedOffers = getMerchantDailyStock({
      merchantId: merchantProfile.id,
      worldSeed: gs.worldSeed,
      dayNumber: 3,
      hearts: moodBefore.hearts,
      secretClaimed: false,
    });

    gs.coins = expectedOffers[0].finalPrice + 10;
    const onMerchantPurchase = vi.fn();

    startNpcConversation({
      profile: merchantProfile,
      currentDay: 3,
      runtime,
      state: gs,
      onMerchantPurchase,
    });

    const initialOverlay = dom.hudRoot.children[0];
    const shopBtn = getChoiceButtons(dom.hudRoot).find((b) => b.dataset.tone === 'shop');
    expect(shopBtn).toBeDefined();
    expect(shopBtn!.textContent).toContain('Browse Wares');

    // Open shop in-place
    shopBtn!.click();
    expect(dialogueBox.isActive()).toBe(true);
    expect(dom.hudRoot.children[0]).toBe(initialOverlay);

    const shopButtons = getChoiceButtons(dom.hudRoot);
    expect(shopButtons).toHaveLength(4);
    expect(shopButtons[0].textContent).toContain(expectedOffers[0].name);
    expect(shopButtons[0].textContent).toContain(`${expectedOffers[0].finalPrice}g`);
    if (expectedOffers[0].discountPct > 0) {
      expect(shopButtons[0].textContent).toContain(`-${expectedOffers[0].discountPct}%`);
    }
    expect(shopButtons[3].textContent).toContain('Back to Conversation');

    // Buy item 1
    const countBefore = gs.getBagItemCount(expectedOffers[0].itemId);
    shopButtons[0].click();
    expect(onMerchantPurchase).toHaveBeenCalledTimes(1);
    expect(onMerchantPurchase.mock.calls[0][0].itemId).toBe(expectedOffers[0].itemId);
    expect(gs.coins).toBe(10);
    expect(gs.getBagItemCount(expectedOffers[0].itemId)).toBe(
      countBefore + expectedOffers[0].count,
    );
    expect(dialogueBox.isActive()).toBe(true);
    expect(dom.hudRoot.querySelector('[data-role="dialogue-text"]')!.textContent).toContain(
      '10g',
    );

    // Try buying expensive item 3 (not enough coins) -> stays in shop, does not purchase
    const coinsLeft = gs.coins;
    if (expectedOffers[2].finalPrice > coinsLeft) {
      getChoiceButtons(dom.hudRoot)[2].click();
      expect(onMerchantPurchase).toHaveBeenCalledTimes(1);
      expect(gs.coins).toBe(coinsLeft);
      expect(dom.hudRoot.querySelector('[data-role="dialogue-text"]')!.textContent).toContain(
        'Not enough coins',
      );
    }

    // Back to conversation restores 4-choice dialogue menu
    getChoiceButtons(dom.hudRoot)[3].click();
    expect(dialogueBox.isActive()).toBe(true);
    const backBtns = getChoiceButtons(dom.hudRoot);
    expect(backBtns.some((b) => b.dataset.tone === 'shop')).toBe(true);
  });

  it('smart gift picker prioritizes loved > liked > unknown > disliked and avoids disliked items', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');
    gs.bagSlots = Array.from({ length: gs.bagSlots.length }, () => null);
    gs.selectedHotbarIndex = 0; // pickaxe (not giftable)

    gs.bagSlots[0] = { itemId: 'bone', count: 2 };
    gs.bagSlots[1] = { itemId: 'wood', count: 3 };
    gs.bagSlots[2] = { itemId: 'carrot', count: 2 };
    gs.bagSlots[3] = { itemId: 'sunflower', count: 1 };

    // Avoids disliked ('bone') in favor of unknown ('wood')
    expect(resolveGiftCandidate(gs, { bone: 'disliked' })?.itemId).toBe('wood');
    // Prefers liked ('carrot') over unknown ('wood') and disliked ('bone')
    expect(resolveGiftCandidate(gs, { bone: 'disliked', carrot: 'liked' })?.itemId).toBe('carrot');
    // Prefers loved ('sunflower') over all others
    expect(
      resolveGiftCandidate(gs, { bone: 'disliked', carrot: 'liked', sunflower: 'loved' })?.itemId,
    ).toBe('sunflower');
  });

  it('displays diegetic giftHint in-place when lore_gift_hint is selected and fires onHeartLevelUp on heart gain', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');
    const runtime = new NpcBrainRuntime({ seed: 9001 });
    const farmer = buildAnchorNpcProfiles(9001).find((p) => p.id === 'farmer')!;

    // Inject optional giftHint & a mock heart-gated quest hook onto state
    const profileWithHint: ProceduralNpcProfile = {
      ...farmer,
      baselineMood: [0.02, 0.05, 0.5, 0.5],
      giftHint: 'Between you and me, nothing beats a Golden Sunflower or Pumpkin Soup!',
    };

    const heartQuest: QuestDef = {
      id: 'farmer_heart_2',
      npcId: 'farmer',
      npcName: 'Farmer Bram',
      step: 99,
      title: 'Meadow Feast',
      description: 'Friendship quest unlocked at 3 hearts.',
      offerDialogue: ['Let us celebrate!'],
      progressDialogue: ['Almost ready!'],
      completeDialogue: ['Cheers!'],
      objectives: [{ id: 's', type: 'collect', targetId: 'sunflower', count: 1, label: 'Sunflower' }],
      rewards: { coins: 100, xp: 100 },
    };

    const recordedGifts: Array<{ npcId: string; itemId: string; reaction: string }> = [];
    gs.getNextQuestForNpc = (npcId: string, currentHearts = 0) => {
      if (npcId === 'farmer' && currentHearts >= 3) return heartQuest;
      return undefined;
    };
    const origRecordKnown = gs.recordNpcKnownGift.bind(gs);
    gs.recordNpcKnownGift = (npcId, itemId, reaction) => {
      recordedGifts.push({ npcId, itemId, reaction });
      origRecordKnown(npcId, itemId, reaction);
    };

    // Give player a loved Sunflower in hotbar
    gs.addItem('sunflower', 1);
    const sfIdx = gs.hotbar.indexOf('sunflower');
    gs.selectedHotbarIndex = sfIdx !== -1 ? sfIdx : 0;

    const onHeartLevelUp = vi.fn();

    startNpcConversation({
      profile: profileWithHint,
      currentDay: 1,
      runtime,
      state: gs,
      onHeartLevelUp,
    });

    // Give loved Sunflower -> boosts hearts and triggers onHeartLevelUp with unlocked quest title
    const giftBtn = getChoiceButtons(dom.hudRoot).find((b) => b.dataset.tone === 'gift');
    expect(giftBtn).toBeDefined();
    giftBtn!.click();

    expect(recordedGifts).toEqual([
      { npcId: 'farmer', itemId: 'sunflower', reaction: 'loved' },
    ]);
    expect(gs.getNpcKnownGifts('farmer').sunflower).toBe('loved');
    expect(onHeartLevelUp).toHaveBeenCalled();
    const [newHearts, unlockedTitle] = onHeartLevelUp.mock.calls[0];
    expect(newHearts).toBeGreaterThanOrEqual(3);
    expect(unlockedTitle).toBe('Meadow Feast');

    // Now hearts >= 1 and gift_hint not asked -> select "What sort of gifts do you like?"
    // First answer openQuestion if Slot 1 had one
    let hintBtn = getChoiceButtons(dom.hudRoot).find((b) =>
      b.textContent.includes('What sort of gifts do you like?'),
    );
    if (!hintBtn) {
      getChoiceButtons(dom.hudRoot)[0].click();
      hintBtn = getChoiceButtons(dom.hudRoot).find((b) =>
        b.textContent.includes('What sort of gifts do you like?'),
      );
    }
    expect(hintBtn).toBeDefined();
    hintBtn!.click();

    expect(dom.hudRoot.querySelector('[data-role="dialogue-text"]')!.textContent).toBe(
      profileWithHint.giftHint,
    );
    // Exhausted afterward so it does not repeat
    expect(
      getChoiceButtons(dom.hudRoot).some((b) =>
        b.textContent.includes('What sort of gifts do you like?'),
      ),
    ).toBe(false);
  });

  it('shows known gift reaction badges on subsequent days and handles bag-full shop rejections', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');
    gs.worldSeed = 3131;
    const runtime = new NpcBrainRuntime({ seed: 3131 });
    const merchant = generateProceduralTown(3131).find((n) => n.category === 'merchant')!;
    gs.claimNpcSecret(merchant.id);
    gs.completedQuests.add('merchant_1_1');
    gs.completedQuests.add('merchant_2_1');

    // Record known loved & disliked gifts on GameState
    const lovedId = merchant.gifts.loved[0];
    const dislikedId = merchant.gifts.disliked[0];
    gs.bagSlots = Array.from({ length: gs.bagSlots.length }, () => null);
    gs.selectedHotbarIndex = 0; // pickaxe (not giftable)
    gs.bagSlots[0] = { itemId: dislikedId, count: 1 };
    gs.bagSlots[1] = { itemId: lovedId, count: 1 };
    gs.recordNpcKnownGift(merchant.id, dislikedId, 'disliked');
    gs.recordNpcKnownGift(merchant.id, lovedId, 'loved');

    const onMerchantPurchase = vi.fn();
    startNpcConversation({
      profile: merchant,
      currentDay: 2,
      runtime,
      state: gs,
      onMerchantPurchase,
    });

    // Smart picker selects lovedId and marks it with (♥)
    const giftBtn = getChoiceButtons(dom.hudRoot).find((b) => b.dataset.tone === 'gift');
    expect(giftBtn).toBeDefined();
    expect(giftBtn!.textContent).toContain('(♥)');

    // Open shop, fill bag with stones (not matching offers), and verify bag-full feedback
    const shopBtn = getChoiceButtons(dom.hudRoot).find((b) => b.dataset.tone === 'shop');
    shopBtn!.click();
    const offers = getMerchantDailyStock({
      merchantId: merchant.id,
      worldSeed: gs.worldSeed,
      dayNumber: 2,
      hearts: runtime.getNpcMoodState(merchant.id).hearts,
      secretClaimed: true,
    });
    const rareOfferIdx = 2; // Rare Find item not in bag
    gs.coins = offers[rareOfferIdx].finalPrice + 100;
    for (let i = 0; i < BAG_SIZE; i += 1) {
      gs.bagSlots[i] = { itemId: 'stone', count: 1 };
    }
    getChoiceButtons(dom.hudRoot)[rareOfferIdx].click();
    expect(onMerchantPurchase).not.toHaveBeenCalled();
    expect(gs.coins).toBe(offers[rareOfferIdx].finalPrice + 100);
    expect(dom.hudRoot.querySelector('[data-role="dialogue-text"]')!.textContent).toContain(
      'Your bag is full!',
    );
  });
});
