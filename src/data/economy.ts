/**
 * Economy formulas & progression curves for Forage Ahead.
 * Mirrors tools/economy_sim.py so simulation and runtime match 1:1.
 */

export const MAX_NODES_PER_ISLAND = 50;
export const MAX_FISH_SPOTS_PER_ISLAND = 5;
export const STARTER_ISLAND_NODES = 42;
export const NODE_RESPAWN_INTERVAL_MS = 3360;

/**
 * Diminishing overlapping lighthouse bonus:
 *   f(0) = 0
 *   f(n) = 0.5 * prod_{k=1}^{n-1} (1 + 1 / 2^k)
 * Converges to ~1.1921 as n -> infinity (f(1)=0.50, f(2)=0.75, f(3)=0.9375, f(4)=1.0547).
 */
export function lighthouseBonus(countInRange: number): number {
  if (countInRange <= 0) return 0;
  let prod = 1;
  for (let k = 1; k < countInRange; k++) {
    prod *= 1 + 1 / Math.pow(2, k);
  }
  return 0.5 * prod;
}

/**
 * Total drop multiplier from `countInRange` Lighthouses scaled by Beacon skill multiplier `beaconScale` (1..10).
 * At max tier (beaconScale = 10), bonus converges to ~11.92 (12.92x total).
 */
export function getLighthouseMultiplier(countInRange: number, beaconScale = 1): number {
  return 1 + beaconScale * lighthouseBonus(countInRange);
}

/**
 * Exponential coin crafting surcharge by gear level:
 *   coins = round((25 * 1.13^level) / 5) * 5
 */
export function gearCoinCost(level: number): number {
  const lv = Math.max(1, level);
  return Math.round((25 * Math.pow(1.13, lv)) / 5) * 5;
}

/**
 * Exponential island purchase price scaling with owned islands:
 *   price = round((baseCost * 1.18^ownedCount) / 5) * 5
 */
export function scaledIslandCost(baseCost: number, ownedCount: number): number {
  if (baseCost <= 0) return 0;
  return Math.round((baseCost * Math.pow(1.18, Math.max(0, ownedCount))) / 5) * 5;
}

export const BASE_STOKE_COST = 20;
export const STOKE_COST_GROWTH = 1.01;

/**
 * Compounding campfire stoke coin cost (+1% per prior stoke).
 */
export function getStokeCost(stokeCount: number): number {
  return Math.round(BASE_STOKE_COST * Math.pow(STOKE_COST_GROWTH, Math.max(0, stokeCount)));
}

/**
 * Exponential gear reforge coin cost, rounded to nearest 5g.
 */
export function getReforgeCoinCost(reforgeCount: number): number {
  return Math.round((40 * Math.pow(1.25, Math.max(0, reforgeCount))) / 5) * 5;
}

export const DEATH_REVIVAL_FEE_RATE = 0.30;

/**
 * Coin fee taken upon death revival (30% of current coins, floored).
 */
export function getDeathRevivalFee(coins: number): number {
  return Math.floor(Math.max(0, coins) * DEATH_REVIVAL_FEE_RATE);
}
