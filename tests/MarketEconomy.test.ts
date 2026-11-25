import { describe, it, expect } from 'vitest';
import {
  BASE_STOKE_COST,
  STOKE_COST_GROWTH,
  DEATH_REVIVAL_FEE_RATE,
  getStokeCost,
  getReforgeCoinCost,
  getDeathRevivalFee,
} from '../src/data/economy';
import {
  MARKET_MIN_MULT,
  MARKET_MAX_MULT,
  MARKET_DAILY_DECAY,
  getEquilibriumSupply,
  getMarketMultiplier,
  getMarketTrend,
  calculateDynamicSellTotal,
  decayMarketVolume,
} from '../src/data/marketEconomy';

describe('Economy formulas & Dynamic Market Engine', () => {
  describe('Stoke, Reforge, and Death Revival Fee', () => {
    it('computes compounding +1% campfire stoke cost starting at 20', () => {
      expect(BASE_STOKE_COST).toBe(20);
      expect(STOKE_COST_GROWTH).toBe(1.01);
      expect(getStokeCost(0)).toBe(20);
      expect(getStokeCost(-5)).toBe(20);
      expect(getStokeCost(100)).toBe(54);

      let prev = getStokeCost(0);
      for (let i = 1; i <= 150; i++) {
        const cur = getStokeCost(i);
        expect(cur).toBeGreaterThanOrEqual(prev);
        prev = cur;
      }
    });

    it('computes exponential gear reforge coin cost rounded to 5g', () => {
      expect(getReforgeCoinCost(0)).toBe(40);
      expect(getReforgeCoinCost(-1)).toBe(40);
      expect(getReforgeCoinCost(1)).toBe(50);
      expect(getReforgeCoinCost(2)).toBe(65);
      expect(getReforgeCoinCost(3)).toBe(80);
      expect(getReforgeCoinCost(4)).toBe(100);
    });

    it('computes 30% floored death revival fee', () => {
      expect(DEATH_REVIVAL_FEE_RATE).toBe(0.30);
      expect(getDeathRevivalFee(100)).toBe(30);
      expect(getDeathRevivalFee(3)).toBe(0);
      expect(getDeathRevivalFee(0)).toBe(0);
      expect(getDeathRevivalFee(-50)).toBe(0);
      expect(getDeathRevivalFee(19)).toBe(5);
    });
  });

  describe('Dynamic Market Supply & Demand', () => {
    it('scales equilibrium supply inversely with item value within [12, 90]', () => {
      const cheapEq = getEquilibriumSupply(3);
      const midEq = getEquilibriumSupply(25);
      const rareEq = getEquilibriumSupply(120);

      expect(cheapEq).toBeGreaterThan(midEq);
      expect(midEq).toBeGreaterThan(rareEq);
      expect(getEquilibriumSupply(1)).toBeLessThanOrEqual(90);
      expect(getEquilibriumSupply(10000)).toBeGreaterThanOrEqual(12);
    });

    it('returns scarcity premium at 0 supply, 1.0 at equilibrium, and floors at 0.35 on oversupply', () => {
      const eq = getEquilibriumSupply(25);

      const zeroSupplyMult = getMarketMultiplier(25, 0, 0);
      expect(zeroSupplyMult).toBeGreaterThan(1.0);
      expect(zeroSupplyMult).toBeLessThanOrEqual(MARKET_MAX_MULT);

      const eqMult = getMarketMultiplier(25, 0, eq);
      expect(eqMult).toBeCloseTo(1.0, 10);

      const floodedMult = getMarketMultiplier(25, 0, eq * 1000);
      expect(floodedMult).toBe(MARKET_MIN_MULT);
    });

    it('is strictly monotonically non-increasing as ownedCount or soldVolume increases', () => {
      let prevOwned = getMarketMultiplier(20, 0, 0);
      for (let owned = 1; owned <= 300; owned += 5) {
        const cur = getMarketMultiplier(20, owned, 0);
        expect(cur).toBeLessThanOrEqual(prevOwned);
        prevOwned = cur;
      }

      let prevSold = getMarketMultiplier(20, 10, 0);
      for (let sold = 1; sold <= 300; sold += 5) {
        const cur = getMarketMultiplier(20, 10, sold);
        expect(cur).toBeLessThanOrEqual(prevSold);
        prevSold = cur;
      }
    });

    it('maps multipliers to expected trend tiers', () => {
      expect(getMarketTrend(1.45).kind).toBe('surging');
      expect(getMarketTrend(1.20).kind).toBe('high');
      expect(getMarketTrend(1.00).kind).toBe('normal');
      expect(getMarketTrend(0.75).kind).toBe('low');
      expect(getMarketTrend(0.40).kind).toBe('flooded');
      expect(getMarketTrend(1.25).pct).toBe(125);
    });

    it('applies bulk slippage when selling large stacks at once', () => {
      const quote100 = calculateDynamicSellTotal(25, 100, 100, 0, 1);
      expect(quote100.multiplier).toBeGreaterThanOrEqual(0.9);
      expect(quote100.total).toBeLessThan(100 * quote100.unitPrice);
      expect(quote100.total).toBeGreaterThanOrEqual(100);

      const quoteSingle = calculateDynamicSellTotal(25, 1, 100, 0, 1);
      expect(quoteSingle.total).toBe(quoteSingle.unitPrice);

      const zeroQuote = calculateDynamicSellTotal(0, 10, 0, 0);
      expect(zeroQuote.total).toBe(0);
      expect(zeroQuote.unitPrice).toBe(0);

      // Handles huge counts cleanly in O(1) bounded steps
      const hugeQuote = calculateDynamicSellTotal(10, 10000, 10000, 0, 1.2);
      expect(hugeQuote.total).toBeGreaterThanOrEqual(10000);
      expect(Number.isFinite(hugeQuote.total)).toBe(true);
    });

    it('decays market volume by 20% per day and drops tiny residuals < 0.5', () => {
      expect(MARKET_DAILY_DECAY).toBe(0.80);

      const day1 = decayMarketVolume({ wood: 10, ore: 2, tiny: 0.6, zero: 0, neg: -3 }, 1);
      expect(day1).toEqual({
        wood: 8,
        ore: 1.6,
      });

      const day3 = decayMarketVolume({ wood: 10 }, 3);
      expect(day3.wood).toBe(5.12);

      const day0 = decayMarketVolume({ wood: 10 }, 0);
      expect(day0.wood).toBe(10);
    });
  });
});
