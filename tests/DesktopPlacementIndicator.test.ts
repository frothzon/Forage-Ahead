import { describe, expect, it } from 'vitest';
import { RECIPES, type RecipeDef } from '../src/data/recipes';
import { getMaxCraftableCount } from '../src/ui/HudController';

describe('getMaxCraftableCount', () => {
  it('limits craftable count by the scarcest ingredient', () => {
    const rec: RecipeDef = {
      id: 'test_multi',
      name: 'Test Multi',
      station: 'build',
      description: 'Test recipe',
      ingredients: [
        { itemId: 'wood', count: 4 },
        { itemId: 'stone', count: 5 },
      ],
    };
    // wood allows 5 (22 / 4), stone allows 3 (17 / 5)
    expect(getMaxCraftableCount(rec, { wood: 22, stone: 17 }, 0)).toBe(3);
  });

  it('returns 0 when any required ingredient is missing or insufficient', () => {
    const rec: RecipeDef = {
      id: 'test_missing',
      name: 'Test Missing',
      station: 'build',
      description: 'Test recipe',
      ingredients: [
        { itemId: 'wood', count: 2 },
        { itemId: 'coal', count: 1 },
      ],
    };
    expect(getMaxCraftableCount(rec, { wood: 20 }, 100)).toBe(0);
    expect(getMaxCraftableCount(rec, { wood: 1, coal: 5 }, 100)).toBe(0);
  });

  it('respects coinCost alongside ingredients (limited by coins vs ingredients)', () => {
    const rec: RecipeDef = {
      id: 'test_coins',
      name: 'Test Coins',
      station: 'anvil',
      description: 'Test recipe with coins',
      ingredients: [{ itemId: 'iron_ingot', count: 2 }],
      coinCost: 50,
    };
    // Limited by coins: 10 ingots -> 5, 120 coins -> 2
    expect(getMaxCraftableCount(rec, { iron_ingot: 10 }, 120)).toBe(2);
    // Limited by ingredients: 3 ingots -> 1, 500 coins -> 10
    expect(getMaxCraftableCount(rec, { iron_ingot: 3 }, 500)).toBe(1);
    // Insufficient coins -> 0
    expect(getMaxCraftableCount(rec, { iron_ingot: 10 }, 49)).toBe(0);
  });

  it('returns Infinity when recipe has no ingredients and no coinCost', () => {
    const rec: RecipeDef = {
      id: 'test_free',
      name: 'Test Free',
      station: 'build',
      description: 'Free recipe',
      ingredients: [],
    };
    expect(getMaxCraftableCount(rec, {}, 0)).toBe(Infinity);
  });

  it('computes craftable count for real build recipes in RECIPES', () => {
    const bridge = RECIPES.find((r) => r.id === 'build_bridge')!;
    const furnace = RECIPES.find((r) => r.id === 'build_furnace')!;
    expect(bridge).toBeDefined();
    expect(furnace).toBeDefined();

    // build_bridge is scaled 2x -> 8 wood
    expect(bridge.ingredients).toEqual([{ itemId: 'wood', count: 8 }]);
    expect(getMaxCraftableCount(bridge, { wood: 19 }, 0)).toBe(2);
    expect(getMaxCraftableCount(bridge, { wood: 7 }, 0)).toBe(0);

    // build_furnace is scaled 5x -> 50 stone + 10 coal
    expect(furnace.ingredients).toEqual([
      { itemId: 'stone', count: 50 },
      { itemId: 'coal', count: 10 },
    ]);
    expect(getMaxCraftableCount(furnace, { stone: 120, coal: 25 }, 0)).toBe(2);
    expect(getMaxCraftableCount(furnace, { stone: 200, coal: 15 }, 0)).toBe(1);
    expect(getMaxCraftableCount(furnace, { stone: 100 }, 0)).toBe(0);
  });
});
