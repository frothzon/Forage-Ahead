import type { GameState } from '../core/GameState';
import manifest from './assetManifest.json';
import { ITEMS } from './items';

export interface MerchantShopOffer {
  id: string;
  itemId: string;
  name: string;
  count: number;
  basePrice: number;
  finalPrice: number;
  discountPct: number;
  tag: string;
}

export interface MerchantMarketplaceItem {
  id: string;
  itemId: string;
  name: string;
  description: string;
  iconPath: string;
  tag: string; // 'Supplies' | 'Provisions' | 'Materials' | 'Rare Find'
  baseUnitPrice: number;
  unitPrice: number;
  discountPct: number;
  maxStock: number;
  remainingStock: number;
}

interface CatalogTemplate {
  itemId: string;
  count: number;
  basePrice: number;
  tag: string;
}

const SUPPLIES_POOL: readonly CatalogTemplate[] = [
  { itemId: 'seed_berries', count: 3, basePrice: 20, tag: 'Supplies' },
  { itemId: 'seed_carrot', count: 3, basePrice: 28, tag: 'Supplies' },
  { itemId: 'seed_sunflower', count: 2, basePrice: 32, tag: 'Supplies' },
  { itemId: 'seed_corn', count: 3, basePrice: 24, tag: 'Supplies' },
  { itemId: 'seed_pumpkin', count: 2, basePrice: 36, tag: 'Supplies' },
  { itemId: 'seed_pink_rose', count: 2, basePrice: 34, tag: 'Supplies' },
  { itemId: 'cooked_fish', count: 1, basePrice: 44, tag: 'Provisions' },
  { itemId: 'cooked_meat', count: 1, basePrice: 48, tag: 'Provisions' },
  { itemId: 'monster_omelet', count: 1, basePrice: 64, tag: 'Provisions' },
  { itemId: 'pumpkin_soup', count: 1, basePrice: 98, tag: 'Provisions' },
];

const MATERIALS_POOL: readonly CatalogTemplate[] = [
  { itemId: 'wood', count: 8, basePrice: 44, tag: 'Materials' },
  { itemId: 'stone', count: 8, basePrice: 44, tag: 'Materials' },
  { itemId: 'coal', count: 4, basePrice: 44, tag: 'Materials' },
  { itemId: 'iron_ore', count: 3, basePrice: 45, tag: 'Materials' },
  { itemId: 'iron_ingot', count: 2, basePrice: 76, tag: 'Materials' },
  { itemId: 'gold_ore', count: 2, basePrice: 52, tag: 'Materials' },
  { itemId: 'amber', count: 2, basePrice: 66, tag: 'Materials' },
  { itemId: 'gold_ingot', count: 1, basePrice: 78, tag: 'Materials' },
];

const RARE_POOL: readonly CatalogTemplate[] = [
  { itemId: 'potion_red', count: 1, basePrice: 55, tag: 'Rare Find' },
  { itemId: 'potion_blue', count: 1, basePrice: 55, tag: 'Rare Find' },
  { itemId: 'bomb', count: 2, basePrice: 64, tag: 'Rare Find' },
  { itemId: 'bomb_fire', count: 1, basePrice: 56, tag: 'Rare Find' },
  { itemId: 'crystal', count: 1, basePrice: 54, tag: 'Rare Find' },
  { itemId: 'seed_starfruit', count: 1, basePrice: 68, tag: 'Rare Find' },
  { itemId: 'egg_slime', count: 1, basePrice: 60, tag: 'Rare Find' },
  { itemId: 'egg_bat', count: 1, basePrice: 82, tag: 'Rare Find' },
  { itemId: 'egg_mummy', count: 1, basePrice: 105, tag: 'Rare Find' },
  { itemId: 'starfruit_tart', count: 1, basePrice: 190, tag: 'Rare Find' },
];

const TIER_POOLS: ReadonlyArray<readonly CatalogTemplate[]> = [
  SUPPLIES_POOL,
  MATERIALS_POOL,
  RARE_POOL,
];

function hashSeedParts(...parts: Array<string | number>): number {
  let h = 2166136261 >>> 0;
  for (const part of parts) {
    const str = String(part);
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 0xff;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function createSeededRng(seed: number): () => number {
  let t = seed >>> 0 || 0x9e3779b9;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  const rng = createSeededRng(seed);
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickTierOfferForDay(
  pool: readonly CatalogTemplate[],
  tierIdx: number,
  merchantId: string,
  worldSeed: number,
  dayNumber: number,
): CatalogTemplate {
  const epoch = Math.floor((dayNumber - 1) / pool.length);
  const offset = (dayNumber - 1) % pool.length;
  const order = shuffleWithSeed(pool, hashSeedParts(worldSeed, merchantId, tierIdx, epoch));

  if (epoch > 0 && offset === 0 && order.length > 1) {
    const prevOrder = shuffleWithSeed(
      pool,
      hashSeedParts(worldSeed, merchantId, tierIdx, epoch - 1),
    );
    if (order[0].itemId === prevOrder[prevOrder.length - 1].itemId) {
      [order[0], order[1]] = [order[1], order[0]];
    }
  }

  return order[offset];
}

function canFitOfferInBag(state: GameState, itemId: string, count: number): boolean {
  const def = ITEMS[itemId];
  if (!def || count <= 0) return false;
  if (!Array.isArray(state.bagSlots)) return true;

  if (!def.equipSlot) {
    const hasExisting = state.bagSlots.some((slot) => slot && slot.itemId === itemId);
    if (hasExisting) return true;
    return state.bagSlots.some((slot) => slot === null);
  }

  const emptySlots = state.bagSlots.filter((slot) => slot === null).length;
  return emptySlots >= count;
}

/**
 * Computes the traveling merchant discount percentage from friendship hearts
 * and whether the merchant's trust secret has been claimed (capped at 25%).
 */
export function getMerchantDiscountPct(hearts: number, secretClaimed = false): number {
  if (secretClaimed) return 25;
  const h = Number.isFinite(hearts) ? Math.floor(Math.max(0, hearts)) : 0;
  if (h >= 4) return 20;
  if (h >= 2) return 10;
  return 0;
}

/**
 * Generates 3 deterministic daily offers for a traveling merchant
 * (1 Supplies/Provisions, 1 Materials, 1 Rare Find), rotating across days.
 */
export function getMerchantDailyStock(params: {
  merchantId: string;
  worldSeed: number;
  dayNumber: number;
  hearts: number;
  secretClaimed?: boolean;
}): MerchantShopOffer[] {
  const merchantId = params.merchantId.trim() || 'merchant_1';
  const worldSeed = Number.isFinite(params.worldSeed) ? (params.worldSeed >>> 0) : 1;
  const dayNumber = Math.max(1, Math.floor(params.dayNumber || 1));
  const discountPct = getMerchantDiscountPct(params.hearts, Boolean(params.secretClaimed));

  return TIER_POOLS.map((pool, tierIdx) => {
    const tpl = pickTierOfferForDay(pool, tierIdx, merchantId, worldSeed, dayNumber);
    const def = ITEMS[tpl.itemId];
    const finalPrice = Math.max(1, Math.round(tpl.basePrice * (1 - discountPct / 100)));
    return {
      id: `offer_${merchantId}_d${dayNumber}_${tierIdx}_${tpl.itemId}`,
      itemId: tpl.itemId,
      name: def?.name ?? tpl.itemId,
      count: tpl.count,
      basePrice: tpl.basePrice,
      finalPrice,
      discountPct,
      tag: tpl.tag,
    };
  });
}

/**
 * Attempts to purchase a merchant offer, verifying coin balance and bag space
 * before deducting coins and adding the purchased items.
 */
export function purchaseMerchantOffer(
  state: GameState,
  offer: MerchantShopOffer,
): { ok: boolean; reason?: 'insufficient_coins' | 'bag_full' } {
  const price = Math.max(0, Math.floor(offer.finalPrice));
  if (state.coins < price) {
    return { ok: false, reason: 'insufficient_coins' };
  }
  if (!canFitOfferInBag(state, offer.itemId, offer.count)) {
    return { ok: false, reason: 'bag_full' };
  }

  state.coins = state.coins - price;
  state.addItem(offer.itemId, offer.count);
  return { ok: true };
}

const manifestImages = manifest.images as Record<string, { path?: string } | undefined>;

const MARKETPLACE_STOCK_RANGES: ReadonlyArray<readonly [number, number]> = [
  [6, 12], // SUPPLIES_POOL: 6-12 stock each
  [8, 15], // MATERIALS_POOL: 8-15 stock each
  [2, 4],  // RARE_POOL: 2-4 stock each
];

function resolveItemIconPath(itemId: string): string {
  const iconKey = ITEMS[itemId]?.iconKey;
  if (iconKey) {
    const manifestEntry = manifestImages[iconKey];
    if (manifestEntry?.path) return manifestEntry.path;
    return `assets/${iconKey}.png`;
  }
  return manifestImages['ui_icons/coin']?.path ?? 'assets/ui_icons/coin.png';
}

function pickMarketplaceTierPairForDay(
  pool: readonly CatalogTemplate[],
  tierIdx: number,
  merchantId: string,
  worldSeed: number,
  dayNumber: number,
): [CatalogTemplate, CatalogTemplate] {
  const pairCount = Math.max(1, Math.floor(pool.length / 2));
  const epoch = Math.floor((dayNumber - 1) / pairCount);
  const offset = (dayNumber - 1) % pairCount;
  const order = shuffleWithSeed(
    pool,
    hashSeedParts('marketplace', worldSeed, merchantId, tierIdx, epoch),
  );

  if (epoch > 0 && offset === 0 && order.length >= 4) {
    const prevOrder = shuffleWithSeed(
      pool,
      hashSeedParts('marketplace', worldSeed, merchantId, tierIdx, epoch - 1),
    );
    const prevIds = new Set([
      prevOrder[(pairCount - 1) * 2].itemId,
      prevOrder[(pairCount - 1) * 2 + 1].itemId,
    ]);
    for (let slot = 0; slot < 2; slot += 1) {
      if (prevIds.has(order[slot].itemId)) {
        const swapIdx = order.findIndex((tpl, idx) => idx >= 2 && !prevIds.has(tpl.itemId));
        if (swapIdx !== -1) {
          [order[slot], order[swapIdx]] = [order[swapIdx], order[slot]];
        }
      }
    }
  }

  return [order[offset * 2], order[offset * 2 + 1]];
}

/**
 * Generates 6 deterministic daily marketplace items for a traveling merchant
 * (2 Supplies/Provisions 6-12 stock, 2 Materials 8-15 stock, 2 Rare Find 2-4 stock),
 * with per-unit pricing, icon resolution, and persistent daily stock tracking.
 */
export function getMerchantMarketplaceStock(params: {
  merchantId: string;
  worldSeed: number;
  dayNumber: number;
  hearts: number;
  secretClaimed?: boolean;
  state?: GameState;
}): MerchantMarketplaceItem[] {
  const merchantId = params.merchantId.trim() || 'merchant_1';
  const worldSeed = Number.isFinite(params.worldSeed) ? (params.worldSeed >>> 0) : 1;
  const dayNumber = Math.max(1, Math.floor(params.dayNumber || 1));
  const discountPct = getMerchantDiscountPct(params.hearts, Boolean(params.secretClaimed));

  const stock: MerchantMarketplaceItem[] = [];
  for (let tierIdx = 0; tierIdx < TIER_POOLS.length; tierIdx += 1) {
    const pool = TIER_POOLS[tierIdx];
    const [minStock, maxStockLimit] = MARKETPLACE_STOCK_RANGES[tierIdx] ?? [4, 8];
    const pair = pickMarketplaceTierPairForDay(pool, tierIdx, merchantId, worldSeed, dayNumber);

    for (let slotIdx = 0; slotIdx < pair.length; slotIdx += 1) {
      const tpl = pair[slotIdx];
      const def = ITEMS[tpl.itemId];
      const baseUnitPrice = Math.max(4, Math.round(tpl.basePrice / tpl.count));
      const unitPrice = Math.max(1, Math.round(baseUnitPrice * (1 - discountPct / 100)));
      const stockRng = createSeededRng(
        hashSeedParts('marketplace_stock', worldSeed, merchantId, dayNumber, tpl.itemId),
      );
      const maxStock = minStock + Math.floor(stockRng() * (maxStockLimit - minStock + 1));
      const bought = params.state?.getMerchantPurchasedCount?.(merchantId, tpl.itemId, dayNumber) ?? 0;
      const remainingStock = Math.max(0, maxStock - bought);

      stock.push({
        id: `market_${merchantId}_d${dayNumber}_${tierIdx}_${slotIdx}_${tpl.itemId}`,
        itemId: tpl.itemId,
        name: def?.name ?? tpl.itemId,
        description: def?.description ?? '',
        iconPath: resolveItemIconPath(tpl.itemId),
        tag: tpl.tag,
        baseUnitPrice,
        unitPrice,
        discountPct,
        maxStock,
        remainingStock,
      });
    }
  }

  return stock;
}

/**
 * Attempts to purchase `quantity` units of a marketplace item, re-checking live
 * remaining stock, coins, and bag space before committing state changes.
 */
export function purchaseMerchantBulk(
  state: GameState,
  item: MerchantMarketplaceItem,
  quantity: number,
  merchantId: string,
  dayNumber: number,
): {
  ok: boolean;
  quantityBought: number;
  totalCost: number;
  remainingStock: number;
  reason?: 'invalid_quantity' | 'out_of_stock' | 'insufficient_coins' | 'bag_full';
} {
  const cleanMerchantId = merchantId.trim() || 'merchant_1';
  const normalizedDay = Math.max(1, Math.floor(dayNumber || 1));
  const alreadyBought =
    state.getMerchantPurchasedCount?.(cleanMerchantId, item.itemId, normalizedDay) ?? 0;
  const liveRemaining = Math.max(
    0,
    Math.min(
      Number.isFinite(item.remainingStock) ? Math.floor(item.remainingStock) : item.maxStock,
      item.maxStock - alreadyBought,
    ),
  );

  if (!Number.isInteger(quantity) || quantity < 1) {
    return {
      ok: false,
      quantityBought: 0,
      totalCost: 0,
      remainingStock: liveRemaining,
      reason: 'invalid_quantity',
    };
  }

  if (quantity > liveRemaining) {
    return {
      ok: false,
      quantityBought: 0,
      totalCost: 0,
      remainingStock: liveRemaining,
      reason: 'out_of_stock',
    };
  }

  const unitPrice = Number.isFinite(item.unitPrice) ? Math.max(0, Math.floor(item.unitPrice)) : 0;
  const totalCost = unitPrice * quantity;
  if (state.coins < totalCost) {
    return {
      ok: false,
      quantityBought: 0,
      totalCost: 0,
      remainingStock: liveRemaining,
      reason: 'insufficient_coins',
    };
  }

  if (!canFitOfferInBag(state, item.itemId, quantity)) {
    return {
      ok: false,
      quantityBought: 0,
      totalCost: 0,
      remainingStock: liveRemaining,
      reason: 'bag_full',
    };
  }

  state.coins = state.coins - totalCost;
  state.addItem(item.itemId, quantity);
  state.recordMerchantPurchase(cleanMerchantId, item.itemId, quantity, normalizedDay);
  const nextRemaining = Math.max(0, liveRemaining - quantity);

  return {
    ok: true,
    quantityBought: quantity,
    totalCost,
    remainingStock: nextRemaining,
  };
}
