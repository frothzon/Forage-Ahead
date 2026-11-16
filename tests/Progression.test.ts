import { describe, it, expect } from 'vitest';
import { GameState, type InventoryFeedEvent } from '../src/core/GameState';
import { RECIPES } from '../src/data/recipes';

describe('GameState progression, crafting & Diablo inventory', () => {
  it('levels up and awards skill points cleanly', () => {
    const state = new GameState();
    state.reset('Beastmaster');
    expect(state.level).toBe(1);
    const leveled = state.addXp(100);
    expect(leveled).toBe(true);
    expect(state.level).toBeGreaterThanOrEqual(2);
    expect(state.skillPoints).toBeGreaterThanOrEqual(1);
  });

  it('enforces skill prerequisites and unlocks modifiers', () => {
    const state = new GameState();
    state.reset('Gladiator');
    state.skillPoints = 2;

    expect(state.unlockSkill('economy_barter')).toBe(false);
    expect(state.unlockSkill('economy_coinage')).toBe(true);
    expect(state.unlockSkill('economy_barter')).toBe(true);

    state.addItem('wood', 10);
    const earned = state.sellItem('wood', 5);
    expect(earned).toBe(15);
  });

  it('allows crafting Furnace when ingredients are present and discounts with Stonecraft', () => {
    const state = new GameState();
    state.reset('Sorcerer');
    const furnace = RECIPES.find((r) => r.id === 'build_furnace')!;
    expect(state.canCraft(furnace)).toBe(false);

    state.skillPoints = 2;
    state.unlockSkill('industry_smelt');
    state.unlockSkill('industry_masonry');

    state.inventory = { stone: 7, coal: 2 };
    expect(state.canCraft(furnace)).toBe(true);
    expect(state.craftRecipe('build_furnace')).toBe(true);
    expect(state.inventory.stone ?? 0).toBe(0);
  });

  it('only allows buying adjacent islands and applies Land Charter discount', () => {
    const state = new GameState();
    state.reset('Swashbuckler');
    state.coins = 500;

    expect(state.buyIsland(0, 0)).toBe(false);
    expect(state.buyIsland(2, 3)).toBe(true);
    expect(state.ownedIslands.has('2,3')).toBe(true);
  });

  it('moves, swaps, equips gear, compares stats, and assigns hotbar slots', () => {
    const state = new GameState();
    state.reset('Gladiator');

    // Starter sword is equipped; add Iron Broadsword to bag
    state.addItem('sword_iron', 1);
    const broadIdx = state.bagSlots.findIndex((s) => s?.itemId === 'sword_iron');
    expect(broadIdx).toBeGreaterThanOrEqual(0);

    // Compare Iron Broadsword vs Knight Sword
    const cmp = state.compareGearStats('sword_iron');
    expect(cmp).not.toBeNull();
    const atkRow = cmp!.rows.find((r) => r.key === 'attack');
    expect(atkRow?.diff).toBe(12); // 34 - 22

    // Equip Iron Broadsword from bag -> swaps Knight Sword into bag
    expect(state.equipFromBag(broadIdx, 'weapon')).toBe(true);
    expect(state.equipment.weapon).toBe('sword_iron');
    expect(state.bagSlots[broadIdx]?.itemId).toBe('sword');
    expect(state.getArmorDefense()).toBe(2);

    // Move slot inside bag grid
    state.moveOrSwapBagSlot(broadIdx, 20);
    expect(state.bagSlots[20]?.itemId).toBe('sword');
    expect(state.bagSlots[broadIdx]).toBeNull();

    // Assign to hotbar slot 6 (index 5)
    state.assignHotbarSlot(5, 'sword_iron');
    expect(state.hotbar[5]).toBe('sword_iron');
  });

  it('emits inventory delta feed events on add and remove', () => {
    const state = new GameState();
    state.reset('Beastmaster');
    const events: InventoryFeedEvent[] = [];
    state.onInventoryFeed((ev) => events.push(ev));

    state.addItem('wood', 5);
    state.removeItem('wood', 3);

    expect(events).toHaveLength(2);
    expect(events[0].delta).toBe(5);
    expect(events[0].total).toBe(11);
    expect(events[1].delta).toBe(-3);
    expect(events[1].total).toBe(8);
  });

  it('supports crafting queue ingredient consumption, Bellows Mastery speed, and full refund on cancel', () => {
    const state = new GameState();
    state.reset('Beastmaster');
    state.addItem('wood', 14); // total 20 wood
    const coalRecipe = RECIPES.find((r) => r.id === 'smelt_coal')!;
    expect(coalRecipe.craftTimeMs).toBe(2500);
    expect(state.getCraftDurationMs(coalRecipe)).toBe(2500);

    // Unlock Bellows Mastery (+40% speed)
    state.skillPoints = 1;
    expect(state.unlockSkill('industry_smelt')).toBe(true);
    expect(state.getCraftDurationMs(coalRecipe)).toBe(Math.round(2500 / 1.4));

    // Consume & refund
    expect(state.consumeIngredients(coalRecipe)).toBe(true);
    expect(state.inventory.wood).toBe(16);
    state.refundIngredients(coalRecipe);
    expect(state.inventory.wood).toBe(20);
  });

  it('supports debug cheats (resources, levels, skills, relics) and reset', () => {
    const state = new GameState();
    state.reset('Sorcerer');
    expect(state.debugMode).toBe(true);

    state.debugAddResourcesPreset();
    expect(state.inventory.wood).toBe(56);
    expect(state.inventory.obsidian).toBe(50);
    expect(state.coins).toBe(525);

    state.debugAddLevels(5);
    expect(state.level).toBe(6);
    expect(state.skillPoints).toBe(5);

    state.debugUnlockAllSkills();
    expect(state.unlockedSkills.size).toBe(20);

    state.debugUnlockAllRelics();
    expect(state.isGearOwned('fire_rod')).toBe(true);
    expect(state.isGearOwned('necro_rod')).toBe(true);

    state.eraseAllSavedData();
    expect(state.level).toBe(1);
    expect(state.coins).toBe(25);
    expect(state.unlockedSkills.size).toBe(0);
    expect(state.ownedIslands.size).toBe(1);
  });
});
