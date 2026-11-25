/**
 * Dynamic Supply/Demand Market Engine for Forage Ahead.
 * Prices respond smoothly to player stock + recent sold volume vs. item equilibrium,
 * with bulk sale slippage and daily volume decay.
 */

export type MarketTrendKind = 'surging' | 'high' | 'normal' | 'low' | 'flooded';

export interface MarketTrend {
  kind: MarketTrendKind;
  label: string;
  arrow: string;
  color: string;
  pct: number;
}

export interface MarketQuote {
  total: number;
  unitPrice: number;
  multiplier: number;
  trend: MarketTrend;
}

export const MARKET_MIN_MULT = 0.35;
export const MARKET_MAX_MULT = 1.65;
export const MARKET_DAILY_DECAY = 0.80;

/**
 * Smooth equilibrium supply target based on an item's base sell value.
 * Cheap staples (~1-5g) tolerate high supply (~68-90 units), while rare items (>=100g) saturate sooner (~12-18 units).
 */
export function getEquilibriumSupply(baseSellValue: number): number {
  return Math.max(12, Math.min(90, Math.round(140 / Math.pow(Math.max(1, baseSellValue), 0.45))));
}

/**
 * Computes the market price multiplier for an item given current owned stock and recent sold volume.
 * Clamped to [MARKET_MIN_MULT, MARKET_MAX_MULT] and strictly non-increasing with supply.
 */
export function getMarketMultiplier(baseSellValue: number, ownedCount: number, soldVolume: number): number {
  const effectiveSupply = Math.max(0, ownedCount) * 0.35 + Math.max(0, soldVolume);
  const eq = getEquilibriumSupply(baseSellValue);

  const raw =
    effectiveSupply < eq
      ? 1 + 0.65 * ((eq - effectiveSupply) / (eq + effectiveSupply * 0.5))
      : 1 / (1 + 0.55 * ((effectiveSupply - eq) / eq));

  return Math.max(MARKET_MIN_MULT, Math.min(MARKET_MAX_MULT, raw));
}

/**
 * Classifies a market multiplier into a UI trend badge descriptor.
 */
export function getMarketTrend(multiplier: number): MarketTrend {
  const pct = Math.round(multiplier * 100);
  if (multiplier >= 1.35) {
    return { kind: 'surging', label: 'Surging', arrow: '▲▲', color: '#4ee68a', pct };
  }
  if (multiplier >= 1.10) {
    return { kind: 'high', label: 'High Demand', arrow: '▲', color: '#8ef5a7', pct };
  }
  if (multiplier >= 0.90) {
    return { kind: 'normal', label: 'Normal', arrow: '•', color: '#c8daeb', pct };
  }
  if (multiplier >= 0.65) {
    return { kind: 'low', label: 'Oversupplied', arrow: '▼', color: '#ffb84d', pct };
  }
  return { kind: 'flooded', label: 'Flooded', arrow: '▼▼', color: '#ff6b78', pct };
}

/**
 * Calculates a sell quote for `count` units, accounting for bulk slippage as sold volume grows
 * during the transaction (bounded to <= 50 simulation steps for O(1) performance).
 */
export function calculateDynamicSellTotal(
  baseSellValue: number,
  count: number,
  ownedCount: number,
  soldVolume: number,
  barterMult = 1,
): MarketQuote {
  const qty = Math.floor(count);
  if (baseSellValue <= 0 || qty <= 0) {
    return { total: 0, unitPrice: 0, multiplier: 1, trend: getMarketTrend(1) };
  }

  const multiplier = getMarketMultiplier(baseSellValue, ownedCount, soldVolume);
  const unitPrice = Math.max(1, Math.round(baseSellValue * multiplier * barterMult));
  const trend = getMarketTrend(multiplier);

  if (qty === 1) {
    return { total: unitPrice, unitPrice, multiplier, trend };
  }

  const steps = Math.min(qty, 50);
  let curOwned = Math.max(0, ownedCount);
  let curSold = Math.max(0, soldVolume);
  let sum = 0;
  let remaining = qty;

  for (let i = 0; i < steps; i++) {
    const chunk = i === steps - 1 ? remaining : Math.round(remaining / (steps - i));
    remaining -= chunk;
    const m = getMarketMultiplier(baseSellValue, curOwned, curSold);
    sum += chunk * baseSellValue * m * barterMult;
    curOwned = Math.max(0, curOwned - chunk);
    curSold += chunk;
  }

  const total = Math.max(qty, Math.round(sum));
  return { total, unitPrice, multiplier, trend };
}

/**
 * Decays recorded sold volumes by 20% per elapsed in-game day, pruning entries below 0.5.
 */
export function decayMarketVolume(volumes: Record<string, number>, days = 1): Record<string, number> {
  const factor = Math.pow(MARKET_DAILY_DECAY, Math.max(0, days));
  const result: Record<string, number> = {};

  for (const [itemId, volume] of Object.entries(volumes)) {
    if (!Number.isFinite(volume) || volume <= 0) continue;
    const decayed = volume * factor;
    if (decayed >= 0.5) {
      result[itemId] = Math.round(decayed * 100) / 100;
    }
  }

  return result;
}
