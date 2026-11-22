import { describe, expect, it } from 'vitest';
import { formatCompactNumber } from '../src/core/FormatNumber';
import { ITEMS } from '../src/data/items';
import { RECIPES } from '../src/data/recipes';
import { OUTDOOR_NPC_BUILDINGS } from '../src/world/OutdoorBuildingStamps';

describe('World fixes, large number formatting & salvage tool', () => {
  it('formats numbers >3 digits with truncated compact suffixes up to very large numbers', () => {
    expect(formatCompactNumber(0)).toBe('0');
    expect(formatCompactNumber(42)).toBe('42');
    expect(formatCompactNumber(999)).toBe('999');
    expect(formatCompactNumber(1000)).toBe('1.0K');
    expect(formatCompactNumber(1599)).toBe('1.5K');
    expect(formatCompactNumber(1_000_000)).toBe('1.0M');
    expect(formatCompactNumber(2_750_000_000)).toBe('2.7B');
    expect(formatCompactNumber(1_000_000_000_000)).toBe('1.0T');
    expect(formatCompactNumber(1e15)).toBe('1.0Qa');
    expect(formatCompactNumber(1e18)).toBe('1.0Qi');
    expect(formatCompactNumber(1e33)).toBe('1.0Dc');
    expect(formatCompactNumber(1e39)).toBe('1.0Dd');
    expect(formatCompactNumber(5.4e45)).toBe('5.4e45');
  });

  it('defines salvage_hammer item and craft_salvage_hammer recipe', () => {
    expect(ITEMS.salvage_hammer).toBeDefined();
    expect(ITEMS.salvage_hammer.category).toBe('tool');
    const rec = RECIPES.find((r) => r.id === 'craft_salvage_hammer');
    expect(rec).toBeDefined();
    expect(rec?.outputItemId).toBe('salvage_hammer');
    expect(rec?.station).toBe('hand');
  });

  it('identifies north walls, south walls, and doors bordering interior floors for under-wall floor rendering', () => {
    const stamp = OUTDOOR_NPC_BUILDINGS.farmer;
    const floorAt = new Set(
      stamp.placements.filter((p) => p.type === 'house_floor').map((p) => `${p.lx},${p.ly}`),
    );
    const northWalls = stamp.placements.filter(
      (p) => p.type === 'house_wall' && floorAt.has(`${p.lx},${p.ly + 1}`),
    );
    const southWalls = stamp.placements.filter(
      (p) => p.type === 'house_wall' && floorAt.has(`${p.lx},${p.ly - 1}`),
    );
    expect(northWalls.length).toBeGreaterThan(0);
    expect(southWalls.length).toBeGreaterThan(0);
    expect(floorAt.has(`${stamp.doorLx},${stamp.doorLy - 1}`)).toBe(true);
  });
});
