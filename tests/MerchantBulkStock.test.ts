import { beforeEach, describe, expect, it } from 'vitest';
import { BAG_SIZE, GameState } from '../src/core/GameState';
import manifest from '../src/data/assetManifest.json';
import { ITEMS } from '../src/data/items';
import {
  getMerchantMarketplaceStock,
  purchaseMerchantBulk,
} from '../src/data/merchantShop';

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

const manifestImages = manifest.images as Record<string, { path: string } | undefined>;

describe('Traveling Merchant Bulk Marketplace (Track 1)', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = createMemoryStorage();
  });

  it('generates 6 distinct daily items with valid iconPath, tier stock ranges, unit prices, and heart discounts', () => {
    const stockA = getMerchantMarketplaceStock({
      merchantId: 'merchant_1',
      worldSeed: 2026,
      dayNumber: 1,
      hearts: 0,
    });
    const stockB = getMerchantMarketplaceStock({
      merchantId: 'merchant_1',
      worldSeed: 2026,
      dayNumber: 1,
      hearts: 0,
    });

    expect(stockA).toEqual(stockB);
    expect(stockA).toHaveLength(6);

    const distinctItemIds = new Set(stockA.map((item) => item.itemId));
    expect(distinctItemIds.size).toBe(6);

    // Tier stock bounds: 2 Supplies/Provisions (6-12), 2 Materials (8-15), 2 Rare Find (2-4)
    for (let i = 0; i < 2; i += 1) {
      expect(['Supplies', 'Provisions']).toContain(stockA[i].tag);
      expect(stockA[i].maxStock).toBeGreaterThanOrEqual(6);
      expect(stockA[i].maxStock).toBeLessThanOrEqual(12);
    }
    for (let i = 2; i < 4; i += 1) {
      expect(stockA[i].tag).toBe('Materials');
      expect(stockA[i].maxStock).toBeGreaterThanOrEqual(8);
      expect(stockA[i].maxStock).toBeLessThanOrEqual(15);
    }
    for (let i = 4; i < 6; i += 1) {
      expect(stockA[i].tag).toBe('Rare Find');
      expect(stockA[i].maxStock).toBeGreaterThanOrEqual(2);
      expect(stockA[i].maxStock).toBeLessThanOrEqual(4);
    }

    for (const item of stockA) {
      const def = ITEMS[item.itemId];
      expect(def).toBeDefined();
      expect(item.name).toBe(def.name);
      expect(item.description).toBe(def.description);
      expect(item.iconPath).toMatch(/^assets\/.+\.png$/);
      if (def.iconKey && manifestImages[def.iconKey]) {
        expect(item.iconPath).toBe(manifestImages[def.iconKey]!.path);
      }
      expect(item.baseUnitPrice).toBeGreaterThanOrEqual(4);
      expect(item.unitPrice).toBe(item.baseUnitPrice);
      expect(item.discountPct).toBe(0);
      expect(item.remainingStock).toBe(item.maxStock);
    }

    // 2 hearts => 10% discount
    const twoHearts = getMerchantMarketplaceStock({
      merchantId: 'merchant_1',
      worldSeed: 2026,
      dayNumber: 1,
      hearts: 2,
    });
    for (let i = 0; i < 6; i += 1) {
      expect(twoHearts[i].itemId).toBe(stockA[i].itemId);
      expect(twoHearts[i].discountPct).toBe(10);
      expect(twoHearts[i].unitPrice).toBe(
        Math.max(1, Math.round(twoHearts[i].baseUnitPrice * 0.9)),
      );
      expect(twoHearts[i].unitPrice).toBeLessThan(twoHearts[i].baseUnitPrice);
    }

    // 4 hearts => 20% discount; secretClaimed => 25% discount
    const secretStock = getMerchantMarketplaceStock({
      merchantId: 'merchant_1',
      worldSeed: 2026,
      dayNumber: 1,
      hearts: 4,
      secretClaimed: true,
    });
    for (let i = 0; i < 6; i += 1) {
      expect(secretStock[i].discountPct).toBe(25);
      expect(secretStock[i].unitPrice).toBe(
        Math.max(1, Math.round(secretStock[i].baseUnitPrice * 0.75)),
      );
    }

    // Different merchants get distinct stock selections
    const otherMerchant = getMerchantMarketplaceStock({
      merchantId: 'merchant_2',
      worldSeed: 2026,
      dayNumber: 1,
      hearts: 0,
    });
    expect(otherMerchant.map((i) => i.itemId)).not.toEqual(stockA.map((i) => i.itemId));
  });

  it('supports bulk x5 purchase, decrements remainingStock, and blocks buying beyond remainingStock', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');
    gs.worldSeed = 4040;

    const stock = getMerchantMarketplaceStock({
      merchantId: 'merchant_1',
      worldSeed: gs.worldSeed,
      dayNumber: 2,
      hearts: 2,
      state: gs,
    });

    // Supplies item has maxStock between 6 and 12, so x5 is always affordable within stock
    const supplyItem = stock[0];
    expect(supplyItem.maxStock).toBeGreaterThanOrEqual(6);

    const startingCoins = supplyItem.unitPrice * 20;
    gs.coins = startingCoins;
    const bagBefore = gs.getBagItemCount(supplyItem.itemId);

    // Invalid quantities rejected cleanly
    for (const badQty of [0, -2, 1.5, Number.NaN]) {
      const badRes = purchaseMerchantBulk(gs, supplyItem, badQty, 'merchant_1', 2);
      expect(badRes.ok).toBe(false);
      expect(badRes.reason).toBe('invalid_quantity');
      expect(gs.coins).toBe(startingCoins);
      expect(gs.getBagItemCount(supplyItem.itemId)).toBe(bagBefore);
    }

    // Bulk purchase x5 succeeds
    const res5 = purchaseMerchantBulk(gs, supplyItem, 5, 'merchant_1', 2);
    expect(res5).toEqual({
      ok: true,
      quantityBought: 5,
      totalCost: supplyItem.unitPrice * 5,
      remainingStock: supplyItem.maxStock - 5,
    });
    expect(gs.coins).toBe(startingCoins - supplyItem.unitPrice * 5);
    expect(gs.getBagItemCount(supplyItem.itemId)).toBe(bagBefore + 5);
    expect(gs.getMerchantPurchasedCount('merchant_1', supplyItem.itemId, 2)).toBe(5);

    // Subsequent stock query reflects updated remainingStock
    const refreshed = getMerchantMarketplaceStock({
      merchantId: 'merchant_1',
      worldSeed: gs.worldSeed,
      dayNumber: 2,
      hearts: 2,
      state: gs,
    });
    expect(refreshed[0].remainingStock).toBe(supplyItem.maxStock - 5);

    // Attempting to buy more than remainingStock (even using stale supplyItem) fails with out_of_stock
    const overBuyQty = supplyItem.maxStock - 5 + 1;
    const coinsBeforeFail = gs.coins;
    const bagBeforeFail = gs.getBagItemCount(supplyItem.itemId);
    const overRes = purchaseMerchantBulk(gs, supplyItem, overBuyQty, 'merchant_1', 2);
    expect(overRes).toEqual({
      ok: false,
      quantityBought: 0,
      totalCost: 0,
      remainingStock: supplyItem.maxStock - 5,
      reason: 'out_of_stock',
    });
    expect(gs.coins).toBe(coinsBeforeFail);
    expect(gs.getBagItemCount(supplyItem.itemId)).toBe(bagBeforeFail);
    expect(gs.getMerchantPurchasedCount('merchant_1', supplyItem.itemId, 2)).toBe(5);

    // Buying the exact remaining amount brings remainingStock to 0 and blocks further buys
    const rem = supplyItem.maxStock - 5;
    const finishRes = purchaseMerchantBulk(gs, refreshed[0], rem, 'merchant_1', 2);
    expect(finishRes).toEqual({
      ok: true,
      quantityBought: rem,
      totalCost: supplyItem.unitPrice * rem,
      remainingStock: 0,
    });
    const depletedRes = purchaseMerchantBulk(gs, refreshed[0], 1, 'merchant_1', 2);
    expect(depletedRes).toEqual({
      ok: false,
      quantityBought: 0,
      totalCost: 0,
      remainingStock: 0,
      reason: 'out_of_stock',
    });
  });

  it('rejects insufficient coins and bag_full without modifying coins, inventory, or stock', () => {
    const gs = new GameState();
    gs.reset('Gladiator');
    gs.worldSeed = 8888;

    const stock = getMerchantMarketplaceStock({
      merchantId: 'merchant_1',
      worldSeed: gs.worldSeed,
      dayNumber: 1,
      hearts: 0,
      state: gs,
    });

    const target = stock[2]; // Materials item (8-15 stock)
    gs.coins = target.unitPrice * 3 - 1;
    const bagBefore = gs.getBagItemCount(target.itemId);

    const coinFail = purchaseMerchantBulk(gs, target, 3, 'merchant_1', 1);
    expect(coinFail).toEqual({
      ok: false,
      quantityBought: 0,
      totalCost: 0,
      remainingStock: target.maxStock,
      reason: 'insufficient_coins',
    });
    expect(gs.coins).toBe(target.unitPrice * 3 - 1);
    expect(gs.getBagItemCount(target.itemId)).toBe(bagBefore);
    expect(gs.getMerchantPurchasedCount('merchant_1', target.itemId, 1)).toBe(0);

    // Bag full check for an unowned rare item
    const rareItem = stock[4];
    for (let i = 0; i < BAG_SIZE; i += 1) {
      gs.bagSlots[i] = { itemId: 'berries', count: 1 };
    }
    // Ensure rareItem isn't berries
    expect(rareItem.itemId).not.toBe('berries');
    gs.coins = 5000;

    const bagFail = purchaseMerchantBulk(gs, rareItem, 1, 'merchant_1', 1);
    expect(bagFail).toEqual({
      ok: false,
      quantityBought: 0,
      totalCost: 0,
      remainingStock: rareItem.maxStock,
      reason: 'bag_full',
    });
    expect(gs.coins).toBe(5000);
    expect(gs.getMerchantPurchasedCount('merchant_1', rareItem.itemId, 1)).toBe(0);
  });

  it('resets stock on daily rollover (dayNumber + 1)', () => {
    const gs = new GameState();
    gs.reset('Sorcerer');
    gs.worldSeed = 5150;
    gs.coins = 5000;

    const day1 = getMerchantMarketplaceStock({
      merchantId: 'merchant_1',
      worldSeed: gs.worldSeed,
      dayNumber: 1,
      hearts: 0,
      state: gs,
    });
    const buyRes = purchaseMerchantBulk(gs, day1[0], 4, 'merchant_1', 1);
    expect(buyRes.ok).toBe(true);
    expect(gs.getMerchantPurchasedCount('merchant_1', day1[0].itemId, 1)).toBe(4);

    // Day 2 resets purchased count for any item
    expect(gs.getMerchantPurchasedCount('merchant_1', day1[0].itemId, 2)).toBe(0);

    const day2 = getMerchantMarketplaceStock({
      merchantId: 'merchant_1',
      worldSeed: gs.worldSeed,
      dayNumber: 2,
      hearts: 0,
      state: gs,
    });
    expect(day2).toHaveLength(6);
    expect(day2.map((i) => i.itemId)).not.toEqual(day1.map((i) => i.itemId));
    for (const item of day2) {
      expect(item.remainingStock).toBe(item.maxStock);
    }

    // Buying on Day 2 clears Day 1 counts in merchantStockBought
    const buyDay2 = purchaseMerchantBulk(gs, day2[0], 2, 'merchant_1', 2);
    expect(buyDay2.ok).toBe(true);
    expect(gs.merchantStockBought.day).toBe(2);
    expect(gs.merchantStockBought.counts[`merchant_1:${day1[0].itemId}`]).toBeUndefined();
    expect(gs.merchantStockBought.counts[`merchant_1:${day2[0].itemId}`]).toBe(2);
  });

  it('persists and restores merchantStockBought across save() and load() on the same day', () => {
    const gs = new GameState();
    gs.reset('Swashbuckler');
    gs.worldSeed = 9009;
    gs.coins = 5000;

    const day3Before = getMerchantMarketplaceStock({
      merchantId: 'merchant_1',
      worldSeed: gs.worldSeed,
      dayNumber: 3,
      hearts: 3,
      state: gs,
    });
    const item0 = day3Before[0];
    const res = purchaseMerchantBulk(gs, item0, 5, 'merchant_1', 3);
    expect(res.ok).toBe(true);
    gs.save(0);

    const restored = new GameState();
    expect(restored.load(0)).toBe(true);
    expect(restored.merchantStockBought).toEqual({
      day: 3,
      counts: { [`merchant_1:${item0.itemId}`]: 5 },
    });
    expect(restored.getMerchantPurchasedCount('merchant_1', item0.itemId, 3)).toBe(5);
    expect(restored.getMerchantPurchasedCount('merchant_1', item0.itemId, 4)).toBe(0);

    const day3After = getMerchantMarketplaceStock({
      merchantId: 'merchant_1',
      worldSeed: restored.worldSeed,
      dayNumber: 3,
      hearts: 3,
      state: restored,
    });
    expect(day3After[0].itemId).toBe(item0.itemId);
    expect(day3After[0].remainingStock).toBe(item0.maxStock - 5);

    // Attempting to buy remaining + 1 after reload is still blocked
    const overBuy = purchaseMerchantBulk(
      restored,
      day3After[0],
      day3After[0].remainingStock + 1,
      'merchant_1',
      3,
    );
    expect(overBuy.ok).toBe(false);
    expect(overBuy.reason).toBe('out_of_stock');

    // Legacy / malformed merchantStockBought payloads hydrate safely
    localStorage.setItem(
      'isles_of_foraging_save_v2_slot_1',
      JSON.stringify({
        version: 3,
        heroClass: 'Beastmaster',
        merchantStockBought: { day: -5, counts: { bad: 'oops' } },
      }),
    );
    const sanitized = new GameState();
    expect(sanitized.load(1)).toBe(true);
    expect(sanitized.merchantStockBought).toEqual({ day: 1, counts: {} });
  });
});
