import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCompactNumber } from '../src/core/FormatNumber';
import { BAG_SIZE, GameState } from '../src/core/GameState';
import { SFX } from '../src/core/SoundFX';
import { getMerchantMarketplaceStock } from '../src/data/merchantShop';
import { computeBulkQuote, merchantShopModal } from '../src/ui/MerchantShopModal';

/* -------------------------------------------------------------------------- */
/* In-Memory DOM / Window Harness for Node Vitest                             */
/* -------------------------------------------------------------------------- */

function camelToDataAttr(key: string): string {
  return `data-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
}

function dataAttrToCamel(attr: string): string {
  return attr
    .slice(5)
    .replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
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
  public attributes: Record<string, string> = {};
  public onclick: ((e?: unknown) => void) | null = null;
  public width = 0;
  public height = 0;
  public src = '';
  public alt = '';
  public type = '';
  public disabled = false;
  public classList: MockClassList;
  public dataset: Record<string, string>;
  private _datasetStore: Record<string, string> = {};
  private _className = '';
  private listeners = new Map<string, Array<(e: unknown) => void>>();

  constructor(tagName: string) {
    super();
    this.tagName = tagName.toUpperCase();
    this.classList = new MockClassList(this);
    this.dataset = new Proxy(this._datasetStore, {
      set: (target, prop, value) => {
        if (typeof prop === 'string') {
          const strVal = String(value);
          target[prop] = strVal;
          this.attributes[camelToDataAttr(prop)] = strVal;
        }
        return true;
      },
      deleteProperty: (target, prop) => {
        if (typeof prop === 'string') {
          delete target[prop];
          delete this.attributes[camelToDataAttr(prop)];
        }
        return true;
      },
    });
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
    const strVal = String(value);
    this.attributes[name] = strVal;
    if (name.startsWith('data-')) {
      this._datasetStore[dataAttrToCamel(name)] = strVal;
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  addEventListener(type: string, fn: (e: unknown) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }

  dispatchEvent(evt: { type: string; target?: unknown; stopPropagation?: () => void }): void {
    if (evt.type === 'click' && this.disabled) return;
    if (!evt.target) evt.target = this;
    if (!evt.stopPropagation) evt.stopPropagation = () => {};
    if (evt.type === 'click' && this.onclick) {
      this.onclick(evt);
    }
    const arr = this.listeners.get(evt.type) ?? [];
    arr.forEach((fn) => fn(evt));
  }

  click(): void {
    if (this.disabled) return;
    this.dispatchEvent({ type: 'click', target: this });
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
  if (selector.startsWith('#')) {
    return el.id === selector.slice(1);
  }
  const attrEq = /^\[([a-zA-Z0-9_-]+)="([^"]*)"\]$/.exec(selector);
  if (attrEq) {
    return el.getAttribute(attrEq[1]) === attrEq[2];
  }
  const attrExists = /^\[([a-zA-Z0-9_-]+)\]$/.exec(selector);
  if (attrExists) {
    return el.getAttribute(attrExists[1]) !== null;
  }
  return el.tagName === selector.toUpperCase();
}

interface DomHarness {
  body: MockElement;
  head: MockElement;
  hudRoot: MockElement;
  dispatchKeyDown: (opts: { key: string; code: string }) => { defaultPrevented: boolean };
  cleanup: () => void;
}

function installDomHarness(): DomHarness {
  const prevDoc = (globalThis as Record<string, unknown>).document;
  const prevWin = (globalThis as Record<string, unknown>).window;

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
    getElementById: (id: string) => findById(head, id) ?? findById(body, id),
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
    cleanup: () => {
      (globalThis as Record<string, unknown>).document = prevDoc;
      (globalThis as Record<string, unknown>).window = prevWin;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Part 1: computeBulkQuote Unit Tests                                        */
/* -------------------------------------------------------------------------- */

describe('computeBulkQuote', () => {
  it('computes affordable bulk totals and clamps requested quantity to remainingStock', () => {
    const q1 = computeBulkQuote(15, 3, 100, 5);
    expect(q1).toEqual({
      quantity: 3,
      totalCost: 45,
      canAfford: true,
      shortfall: 0,
      soldOut: false,
    });

    const clamped = computeBulkQuote(20, 99, 500, 4);
    expect(clamped).toEqual({
      quantity: 4,
      totalCost: 80,
      canAfford: true,
      shortfall: 0,
      soldOut: false,
    });

    const minClamped = computeBulkQuote(20, 0, 500, 4);
    expect(minClamped.quantity).toBe(1);
    expect(minClamped.totalCost).toBe(20);
  });

  it('flags insufficient coins with exact shortfall and soldOut when stock is zero', () => {
    const short = computeBulkQuote(25, 4, 62, 10);
    expect(short).toEqual({
      quantity: 4,
      totalCost: 100,
      canAfford: false,
      shortfall: 38,
      soldOut: false,
    });

    const soldOut = computeBulkQuote(25, 3, 999, 0);
    expect(soldOut).toEqual({
      quantity: 0,
      totalCost: 0,
      canAfford: false,
      shortfall: 0,
      soldOut: true,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Part 2: MerchantShopModal UI & Interaction Tests                           */
/* -------------------------------------------------------------------------- */

describe('MerchantShopModal', () => {
  let dom: DomHarness;

  beforeEach(() => {
    dom = installDomHarness();
  });

  afterEach(() => {
    merchantShopModal.close(false);
    dom.cleanup();
    vi.restoreAllMocks();
  });

  it('renders 6 item cards with icons, unit prices, total gold readouts, discount pill, and green/red affordability', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');
    gs.worldSeed = 4242;

    const stock = getMerchantMarketplaceStock({
      merchantId: 'merchant_1',
      worldSeed: gs.worldSeed,
      dayNumber: 2,
      hearts: 3,
      secretClaimed: false,
      state: gs,
    });
    expect(stock).toHaveLength(6);

    const sortedByUnit = [...stock].sort((a, b) => a.unitPrice - b.unitPrice);
    const cheapest = sortedByUnit[0];
    const priciest = sortedByUnit[sortedByUnit.length - 1];
    gs.coins = cheapest.unitPrice;

    merchantShopModal.show({
      merchantId: 'merchant_1',
      merchantName: 'Vespera',
      merchantTitle: 'Wandering Peddler',
      portraitKey: 'npcs/NPC 03_idle (16x24)',
      hearts: 3,
      secretClaimed: false,
      worldSeed: gs.worldSeed,
      dayNumber: 2,
      state: gs,
    });

    expect(merchantShopModal.isActive()).toBe(true);

    expect(dom.hudRoot.querySelector('[data-role="shop-merchant-name"]')!.textContent).toBe(
      'Vespera',
    );
    expect(dom.hudRoot.querySelector('[data-role="shop-subtitle"]')!.textContent).toContain(
      'Traveling Marketplace',
    );
    expect(dom.hudRoot.querySelector('[data-role="shop-hearts"]')!.textContent).toBe('♥♥♥♡♡');
    expect(dom.hudRoot.querySelector('[data-role="shop-discount-pill"]')!.textContent).toContain(
      '-10% Friend Discount',
    );
    expect(dom.hudRoot.querySelector('[data-role="shop-player-gold"]')!.textContent).toContain(
      `${formatCompactNumber(gs.coins)}g`,
    );

    const cards = dom.hudRoot.querySelectorAll('[data-shop-item]');
    expect(cards).toHaveLength(6);

    for (const item of stock) {
      const card = dom.hudRoot.querySelector(`[data-shop-item="${item.itemId}"]`);
      expect(card).not.toBeNull();
      const img = card!.querySelector('img');
      expect(img).not.toBeNull();
      expect(img!.src).toBe(item.iconPath);
      expect(card!.querySelector('[data-role="shop-unit-price"]')!.textContent).toContain(
        `${item.unitPrice}g ea`,
      );
      expect(card!.querySelector('[data-role="shop-item-total"]')!.textContent).toContain(
        `Total: ${item.unitPrice}g`,
      );
    }

    const cheapCard = dom.hudRoot.querySelector(`[data-shop-item="${cheapest.itemId}"]`)!;
    const cheapBuy = dom.hudRoot.querySelector(`[data-buy-item="${cheapest.itemId}"]`)!;
    expect(cheapCard.getAttribute('data-affordable')).toBe('true');
    expect(cheapBuy.getAttribute('data-affordable')).toBe('true');
    expect(cheapBuy.classList.contains('is-affordable')).toBe(true);
    expect(cheapBuy.disabled).toBe(false);

    if (priciest.unitPrice > gs.coins) {
      const priceyCard = dom.hudRoot.querySelector(`[data-shop-item="${priciest.itemId}"]`)!;
      const priceyBuy = dom.hudRoot.querySelector(`[data-buy-item="${priciest.itemId}"]`)!;
      expect(priceyCard.getAttribute('data-affordable')).toBe('false');
      expect(priceyBuy.getAttribute('data-affordable')).toBe('false');
      expect(priceyBuy.classList.contains('is-unaffordable')).toBe(true);
      expect(priceyBuy.disabled).toBe(true);
      expect(priceyBuy.textContent).toBe(`Need ${priciest.unitPrice - gs.coins}g`);
    } else if (cheapest.remainingStock > 1) {
      // Even if all unit prices matched, increasing qty via Max exceeds coins and turns red
      cheapCard.querySelector(`[data-qty-max="${cheapest.itemId}"]`)!.click();
      const updatedBuy = dom.hudRoot.querySelector(`[data-buy-item="${cheapest.itemId}"]`)!;
      expect(updatedBuy.getAttribute('data-affordable')).toBe('false');
      expect(updatedBuy.classList.contains('is-unaffordable')).toBe(true);
      expect(updatedBuy.disabled).toBe(true);
    }
  });

  it('clamps Max, x5, x1, and +/- controls strictly to 1..remainingStock', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');
    gs.worldSeed = 777;
    gs.coins = 5000;

    const stock = getMerchantMarketplaceStock({
      merchantId: 'merchant_2',
      worldSeed: gs.worldSeed,
      dayNumber: 1,
      hearts: 0,
      secretClaimed: false,
      state: gs,
    });
    const target = [...stock].sort((a, b) => b.remainingStock - a.remainingStock)[0];
    expect(target.remainingStock).toBeGreaterThan(0);

    merchantShopModal.show({
      merchantId: 'merchant_2',
      merchantName: 'Bramwell',
      hearts: 0,
      secretClaimed: false,
      worldSeed: gs.worldSeed,
      dayNumber: 1,
      state: gs,
    });

    const getCard = () => dom.hudRoot.querySelector(`[data-shop-item="${target.itemId}"]`)!;
    const getQtyText = () => getCard().querySelector(`[data-qty-val="${target.itemId}"]`)!.textContent;

    expect(getQtyText()).toBe('1');

    getCard().querySelector(`[data-qty-max="${target.itemId}"]`)!.click();
    expect(getQtyText()).toBe(String(target.remainingStock));
    expect(getCard().querySelector(`[data-qty-inc="${target.itemId}"]`)!.disabled).toBe(true);

    getCard().querySelector('[data-qty-set="5"]')!.click();
    expect(getQtyText()).toBe(String(Math.min(5, target.remainingStock)));

    getCard().querySelector('[data-qty-set="1"]')!.click();
    expect(getQtyText()).toBe('1');
    expect(getCard().querySelector(`[data-qty-dec="${target.itemId}"]`)!.disabled).toBe(true);

    if (target.remainingStock >= 2) {
      getCard().querySelector(`[data-qty-inc="${target.itemId}"]`)!.click();
      expect(getQtyText()).toBe('2');
      getCard().querySelector(`[data-qty-dec="${target.itemId}"]`)!.click();
      expect(getQtyText()).toBe('1');
    }
  });

  it('buys bulk items, updates gold & remaining stock, transitions to SOLD OUT, and triggers onPurchase', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');
    gs.worldSeed = 5050;
    gs.coins = 5000;

    const coinSpy = vi.spyOn(SFX, 'playCoin');
    const onPurchase = vi.fn();

    const stock = getMerchantMarketplaceStock({
      merchantId: 'merchant_1',
      worldSeed: gs.worldSeed,
      dayNumber: 4,
      hearts: 5,
      secretClaimed: true,
      state: gs,
    });
    const target = [...stock].sort((a, b) => b.remainingStock - a.remainingStock)[0];
    const startStock = target.remainingStock;
    expect(startStock).toBeGreaterThanOrEqual(2);

    merchantShopModal.show({
      merchantId: 'merchant_1',
      merchantName: 'Vespera',
      hearts: 5,
      secretClaimed: true,
      worldSeed: gs.worldSeed,
      dayNumber: 4,
      state: gs,
      onPurchase,
    });

    // Discount pill reflects secretClaimed (25%)
    expect(dom.hudRoot.querySelector('[data-role="shop-discount-pill"]')!.textContent).toContain(
      '-25% Friend Discount',
    );

    // Step 1: buy 1 unit first and check partial stock update
    const bagBefore = gs.getBagItemCount(target.itemId);
    dom.hudRoot.querySelector(`[data-buy-item="${target.itemId}"]`)!.click();

    expect(coinSpy).toHaveBeenCalledTimes(1);
    expect(onPurchase).toHaveBeenNthCalledWith(1, target.name, 1, target.unitPrice);
    expect(gs.coins).toBe(5000 - target.unitPrice);
    expect(gs.getBagItemCount(target.itemId)).toBe(bagBefore + 1);
    expect(dom.hudRoot.querySelector('[data-role="shop-player-gold"]')!.textContent).toContain(
      `${formatCompactNumber(gs.coins)}g`,
    );

    const afterFirstStock = startStock - 1;
    const cardAfterFirst = dom.hudRoot.querySelector(`[data-shop-item="${target.itemId}"]`)!;
    expect(cardAfterFirst.querySelector('[data-role="shop-item-stock"]')!.textContent).toBe(
      `Stock: ${afterFirstStock}/${target.maxStock}`,
    );

    // Step 2: click Max and buy out all remaining stock -> SOLD OUT
    cardAfterFirst.querySelector(`[data-qty-max="${target.itemId}"]`)!.click();
    expect(cardAfterFirst.querySelector(`[data-qty-val="${target.itemId}"]`)!.textContent).toBe(
      String(afterFirstStock),
    );
    dom.hudRoot.querySelector(`[data-buy-item="${target.itemId}"]`)!.click();

    const expectedSecondCost = afterFirstStock * target.unitPrice;
    expect(onPurchase).toHaveBeenNthCalledWith(
      2,
      target.name,
      afterFirstStock,
      expectedSecondCost,
    );
    expect(gs.coins).toBe(5000 - target.unitPrice - expectedSecondCost);
    expect(gs.getBagItemCount(target.itemId)).toBe(bagBefore + startStock);

    const soldCard = dom.hudRoot.querySelector(`[data-shop-item="${target.itemId}"]`)!;
    expect(soldCard.getAttribute('data-sold-out')).toBe('true');
    expect(soldCard.querySelector('[data-role="shop-item-stock"]')!.textContent).toBe('SOLD OUT');

    const soldBuyBtn = dom.hudRoot.querySelector(`[data-buy-item="${target.itemId}"]`)!;
    expect(soldBuyBtn.disabled).toBe(true);
    expect(soldBuyBtn.textContent).toBe('Sold Out');
    expect(dom.hudRoot.querySelector('[data-role="shop-feedback"]')!.textContent).toContain(
      `Purchased ${afterFirstStock}× ${target.name}`,
    );
  });

  it('shows bag-full feedback without deducting coins when bag is full', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');
    gs.worldSeed = 1111;
    gs.coins = 5000;
    for (let i = 0; i < BAG_SIZE; i += 1) {
      gs.bagSlots[i] = { itemId: 'stone', count: 1 };
    }

    const stock = getMerchantMarketplaceStock({
      merchantId: 'merchant_1',
      worldSeed: gs.worldSeed,
      dayNumber: 1,
      hearts: 0,
      secretClaimed: false,
      state: gs,
    });
    const nonStone = stock.find((s) => s.itemId !== 'stone')!;
    const onPurchase = vi.fn();

    merchantShopModal.show({
      merchantId: 'merchant_1',
      merchantName: 'Vespera',
      hearts: 0,
      secretClaimed: false,
      worldSeed: gs.worldSeed,
      dayNumber: 1,
      state: gs,
      onPurchase,
    });

    dom.hudRoot.querySelector(`[data-buy-item="${nonStone.itemId}"]`)!.click();
    expect(onPurchase).not.toHaveBeenCalled();
    expect(gs.coins).toBe(5000);
    expect(dom.hudRoot.querySelector('[data-role="shop-feedback"]')!.textContent).toContain(
      'Your bag is full!',
    );
  });

  it('supports Back to Chat without invoking onClose, and Escape / Close invoke onClose', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');
    const onBackToChat = vi.fn();
    const onClose = vi.fn();

    merchantShopModal.show({
      merchantId: 'merchant_1',
      merchantName: 'Vespera',
      hearts: 1,
      secretClaimed: false,
      worldSeed: 123,
      dayNumber: 1,
      state: gs,
      onBackToChat,
      onClose,
    });

    dom.hudRoot.querySelector('[data-role="shop-back-to-chat"]')!.click();
    expect(onBackToChat).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(merchantShopModal.isActive()).toBe(false);
    expect(dom.hudRoot.querySelector('[data-role="merchant-shop-overlay"]')).toBeNull();

    // Re-open and press Escape -> invokes onClose without invoking onBackToChat
    merchantShopModal.show({
      merchantId: 'merchant_1',
      merchantName: 'Vespera',
      hearts: 1,
      secretClaimed: false,
      worldSeed: 123,
      dayNumber: 1,
      state: gs,
      onBackToChat,
      onClose,
    });

    const esc = dom.dispatchKeyDown({ key: 'Escape', code: 'Escape' });
    expect(esc.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onBackToChat).toHaveBeenCalledTimes(1);
    expect(merchantShopModal.isActive()).toBe(false);

    // Re-open and click X button -> invokes onClose
    merchantShopModal.show({
      merchantId: 'merchant_1',
      merchantName: 'Vespera',
      hearts: 1,
      secretClaimed: false,
      worldSeed: 123,
      dayNumber: 1,
      state: gs,
      onClose,
    });
    dom.hudRoot.querySelector('[data-role="shop-close-x"]')!.click();
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(merchantShopModal.isActive()).toBe(false);
  });
});
