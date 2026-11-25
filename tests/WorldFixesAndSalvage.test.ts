import { describe, expect, it } from 'vitest';
import { formatCompactNumber } from '../src/core/FormatNumber';
import { gameState } from '../src/core/GameState';
import { MAX_FISH_SPOTS_PER_ISLAND, MAX_NODES_PER_ISLAND } from '../src/data/economy';
import { isDungeonPortalEnterable } from '../src/data/islands';
import { ITEMS } from '../src/data/items';
import { RECIPES } from '../src/data/recipes';
import {
  FEAR_DURATION_MS,
  STUCK_FEAR_TIMEOUT_MS,
  createStuckFearState,
  updateStuckFearTracker,
} from '../src/entities/EnemyFear';
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

  it('triggers enemy fear mode after 5s with <= 5px progress while chasing out of attack range', () => {
    const state = createStuckFearState(100, 100);
    // 2.5s stuck with only 3px progress -> not feared yet
    expect(updateStuckFearTracker(state, 103, 100, 2500, true)).toBe(false);
    expect(state.stuckTimerMs).toBe(2500);
    expect(state.fearTimerMs).toBe(0);

    // Making > 5px progress resets stuck timer
    expect(updateStuckFearTracker(state, 109, 100, 500, true)).toBe(false);
    expect(state.stuckTimerMs).toBe(0);

    // Now stuck for full 5000ms within 5px -> enters fear mode
    expect(updateStuckFearTracker(state, 110, 100, 2500, true)).toBe(false);
    expect(updateStuckFearTracker(state, 111, 100, STUCK_FEAR_TIMEOUT_MS - 2500, true)).toBe(true);
    expect(state.fearTimerMs).toBe(FEAR_DURATION_MS);

    // Entering attack range resets stuck timer
    expect(updateStuckFearTracker(state, 111, 100, 1000, false)).toBe(false);
    expect(state.stuckTimerMs).toBe(0);
  });

  it('hides Void Spire until infernal_sanctum is cleared and hides unowned/story-locked portals', () => {
    const owned = new Set(['2,2', '2,1']);
    const cleared = new Set<'skull_crypt' | 'sunken_tomb' | 'frost_cavern' | 'infernal_sanctum' | 'void_spire'>();

    expect(isDungeonPortalEnterable('void_spire', 2, 2, owned, cleared, false)).toBe(false);
    expect(isDungeonPortalEnterable('skull_crypt', 2, 1, owned, cleared, false)).toBe(true);
    expect(isDungeonPortalEnterable('skull_crypt', 2, 1, owned, cleared, true)).toBe(false);
    expect(isDungeonPortalEnterable('sunken_tomb', 4, 2, owned, cleared, false)).toBe(false);

    cleared.add('infernal_sanctum');
    expect(isDungeonPortalEnterable('void_spire', 2, 2, owned, cleared, false)).toBe(true);
  });

  it('removes sold equipment from the hotbar when no copies remain', () => {
    gameState.reset(gameState.heroClass);
    gameState.addItem('sword_iron', 1);
    gameState.assignHotbarSlot(5, 'sword_iron');
    expect(gameState.hotbar[5]).toBe('sword_iron');

    const earned = gameState.sellItem('sword_iron', 1);
    expect(earned).toBeGreaterThan(0);
    expect(gameState.getItemCount('sword_iron')).toBe(0);
    expect(gameState.hotbar[5]).toBe('');
  });

  it('tracks equipped status and blocks selling items while equipped', () => {
    gameState.reset(gameState.heroClass);
    gameState.equipment.tool = 'pickaxe';
    expect(gameState.isItemEquipped('pickaxe')).toBe(true);

    gameState.addItem('pickaxe', 1);
    gameState.assignHotbarSlot(2, 'pickaxe');
    const coinsBefore = gameState.coins;
    const bagCountBefore = gameState.getBagItemCount('pickaxe');
    expect(bagCountBefore).toBe(1);

    const earnedWhileEquipped = gameState.sellItem('pickaxe', 1);
    expect(earnedWhileEquipped).toBe(0);
    expect(gameState.coins).toBe(coinsBefore);
    expect(gameState.getBagItemCount('pickaxe')).toBe(1);
    expect(gameState.hotbar[2]).toBe('pickaxe');
    expect(gameState.equipment.tool).toBe('pickaxe');

    expect(gameState.unequipToBag('tool')).toBe(true);
    expect(gameState.isItemEquipped('pickaxe')).toBe(false);

    const earnedAfterUnequip = gameState.sellItem('pickaxe', 1);
    expect(earnedAfterUnequip).toBeGreaterThan(0);
    expect(gameState.coins).toBe(coinsBefore + earnedAfterUnequip);
  });

  it('flags identical or lower-stat duplicate gear as already equipped and skips equipFromBag', () => {
    gameState.reset(gameState.heroClass);
    gameState.gearInstances['eq_pick'] = {
      id: 'eq_pick',
      itemId: 'pickaxe',
      rarity: 'common',
      stats: { gather: 4 },
      reforgeCount: 0,
    };
    gameState.equipment.tool = 'pickaxe';
    gameState.equippedInstanceIds.tool = 'eq_pick';

    gameState.gearInstances['dup_pick'] = {
      id: 'dup_pick',
      itemId: 'pickaxe',
      rarity: 'common',
      stats: { gather: 4 },
      reforgeCount: 0,
    };
    const bagIdx = gameState.bagSlots.findIndex((s) => s === null);
    expect(bagIdx).toBeGreaterThanOrEqual(0);
    gameState.bagSlots[bagIdx] = { itemId: 'pickaxe', count: 1, instanceId: 'dup_pick' };
    const hotbarBefore = [...gameState.hotbar];

    const cmp = gameState.compareGearStats('pickaxe', 'dup_pick');
    expect(cmp?.isAlreadyEquipped).toBe(true);
    expect(gameState.equipFromBag(bagIdx)).toBe(false);
    expect(gameState.equipment.tool).toBe('pickaxe');
    expect(gameState.equippedInstanceIds.tool).toBe('eq_pick');
    expect(gameState.bagSlots[bagIdx]).toEqual({ itemId: 'pickaxe', count: 1, instanceId: 'dup_pick' });
    expect(gameState.hotbar).toEqual(hotbarBefore);
  });

  it('allows equipping a strictly higher-stat reforged copy of the same item and marks different tools as not equipped', () => {
    gameState.reset(gameState.heroClass);
    gameState.gearInstances['eq_pick'] = {
      id: 'eq_pick',
      itemId: 'pickaxe',
      rarity: 'common',
      stats: { gather: 4 },
      reforgeCount: 0,
    };
    gameState.equipment.tool = 'pickaxe';
    gameState.equippedInstanceIds.tool = 'eq_pick';

    // Different tool is not considered already equipped
    const diffCmp = gameState.compareGearStats('pickaxe_iron');
    expect(diffCmp?.isAlreadyEquipped).toBe(false);

    // Strictly higher-stat reforged copy of pickaxe is an upgrade
    gameState.gearInstances['upg_pick'] = {
      id: 'upg_pick',
      itemId: 'pickaxe',
      rarity: 'rare',
      stats: { gather: 6, critPct: 3 },
      reforgeCount: 1,
    };
    const bagIdx = gameState.bagSlots.findIndex((s) => s === null);
    expect(bagIdx).toBeGreaterThanOrEqual(0);
    gameState.bagSlots[bagIdx] = { itemId: 'pickaxe', count: 1, instanceId: 'upg_pick' };

    const upgCmp = gameState.compareGearStats('pickaxe', 'upg_pick');
    expect(upgCmp?.isAlreadyEquipped).toBe(false);
    expect(gameState.equipFromBag(bagIdx)).toBe(true);
    expect(gameState.equipment.tool).toBe('pickaxe');
    expect(gameState.equippedInstanceIds.tool).toBe('upg_pick');
    expect(gameState.bagSlots[bagIdx]).toEqual({ itemId: 'pickaxe', count: 1, instanceId: 'eq_pick' });
  });

  it('caps per-island fishing spots independently of land resource nodes', () => {
    expect(MAX_FISH_SPOTS_PER_ISLAND).toBeGreaterThan(0);
    expect(MAX_FISH_SPOTS_PER_ISLAND).toBeLessThan(MAX_NODES_PER_ISLAND);
    expect(MAX_FISH_SPOTS_PER_ISLAND).toBe(5);
  });
});
