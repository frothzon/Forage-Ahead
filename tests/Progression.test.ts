import { describe, it, expect } from 'vitest';
import { GameState, type InventoryFeedEvent } from '../src/core/GameState';
import { RECIPES } from '../src/data/recipes';
import { MONSTERS } from '../src/data/monsters';
import { SKILLS } from '../src/data/skills';
import { lighthouseBonus, getLighthouseMultiplier, gearCoinCost, scaledIslandCost } from '../src/data/economy';

describe('GameState progression, crafting & Diablo inventory', () => {
  it('levels up and awards skill points cleanly', () => {
    const state = new GameState();
    state.reset('Beastmaster');
    expect(state.level).toBe(1);
    const leveled = state.addXp(650);
    expect(leveled).toBe(true);
    expect(state.level).toBeGreaterThanOrEqual(2);
    expect(state.skillPoints).toBeGreaterThanOrEqual(1);
  });

  it('enforces skill prerequisites and unlocks modifiers', () => {
    const state = new GameState();
    state.reset('Gladiator');
    state.skillPoints = 2;

    state.addItem('wood', 10);
    const quoteWithoutBarter = state.getDynamicSellQuote('wood', 5).total;

    expect(state.unlockSkill('economy_barter')).toBe(false);
    expect(state.unlockSkill('economy_coinage')).toBe(true);
    expect(state.unlockSkill('economy_barter')).toBe(true);

    const quoteWithBarter = state.getDynamicSellQuote('wood', 5).total;
    expect(quoteWithBarter).toBeGreaterThan(quoteWithoutBarter);
    const earned = state.sellItem('wood', 5);
    expect(earned).toBe(quoteWithBarter);
  });

  it('allows crafting Furnace when ingredients are present and discounts with Stonecraft', () => {
    const state = new GameState();
    state.reset('Sorcerer');
    const furnace = RECIPES.find((r) => r.id === 'build_furnace')!;
    expect(state.canCraft(furnace)).toBe(false);

    state.skillPoints = 2;
    state.unlockSkill('industry_smelt');
    state.unlockSkill('industry_masonry');

    state.inventory = { stone: 37, coal: 10 };
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
    expect(atkRow?.diff).toBeGreaterThanOrEqual(12); // >= 20 - 8

    // Equip Iron Broadsword from bag -> swaps Knight Sword into bag
    expect(state.equipFromBag(broadIdx, 'weapon')).toBe(true);
    expect(state.equipment.weapon).toBe('sword_iron');
    expect(state.bagSlots[broadIdx]?.itemId).toBe('sword');
    expect(state.getArmorDefense()).toBeGreaterThanOrEqual(2);

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
    // Unscaled coal recipe: 4 wood, 15000ms -> Math.round(15000 / 1.4) with Bellows Mastery
    // Beastmaster starts with 6 wood
    const coalRecipe = RECIPES.find((r) => r.id === 'smelt_coal')!;
    expect(coalRecipe.craftTimeMs).toBe(15000);
    expect(state.getCraftDurationMs(coalRecipe)).toBe(15000);

    // Unlock Bellows Mastery (+40% speed)
    state.skillPoints = 1;
    expect(state.unlockSkill('industry_smelt')).toBe(true);
    expect(state.getCraftDurationMs(coalRecipe)).toBe(Math.round(15000 / 1.4));

    // Consume & refund
    expect(state.consumeIngredients(coalRecipe)).toBe(true);
    expect(state.inventory.wood ?? 0).toBe(2);
    state.refundIngredients(coalRecipe);
    expect(state.inventory.wood).toBe(6);
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
    expect(state.skillPoints).toBe(6);

    state.debugUnlockAllSkills();
    expect(state.unlockedSkills.size).toBe(84);

    state.debugUnlockAllRelics();
    expect(state.isGearOwned('fire_rod')).toBe(true);
    expect(state.isGearOwned('necro_rod')).toBe(true);

    state.eraseAllSavedData();
    expect(state.level).toBe(1);
    expect(state.coins).toBe(25);
    expect(state.unlockedSkills.size).toBe(0);
    expect(state.ownedIslands.size).toBe(1);
  });

  it('tracks multi-step NPC quests, objectives, waypoints, and rewards', () => {
    const state = new GameState();
    state.reset('Beastmaster');

    const first = state.getNextQuestForNpc('farmer');
    expect(first?.id).toBe('farmer_1');
    expect(state.acceptQuest('farmer_2')).toBe(false); // prereq not met
    expect(state.acceptQuest('farmer_1')).toBe(true);
    expect(state.trackedQuestId).toBe('farmer_1');
    expect(state.getTrackedQuest()?.waypoint?.label).toBe('Meadow Homestead');

    expect(state.isQuestReadyToTurnIn('farmer_1')).toBe(false);
    state.addItem('berries', 10);
    expect(state.isQuestReadyToTurnIn('farmer_1')).toBe(true);

    const done = state.completeQuest('farmer_1');
    expect(done?.id).toBe('farmer_1');
    expect(state.completedQuests.has('farmer_1')).toBe(true);
    expect(state.inventory.carrot).toBe(5);
    expect(state.coins).toBe(90); // 25 + 65

    const second = state.getNextQuestForNpc('farmer');
    expect(second?.id).toBe('farmer_2');
    expect(state.acceptQuest('farmer_2')).toBe(true);
    state.recordQuestProgress('craft', 'craft_hoe', 1);
    state.recordQuestProgress('build', 'crop_carrot', 2);
    expect(state.isQuestReadyToTurnIn('farmer_2')).toBe(true);
  });

  it('gates blueprint recipes until unlocked', () => {
    const state = new GameState();
    state.reset('Gladiator');
    const goldSmelt = RECIPES.find((r) => r.id === 'smelt_gold')!;
    state.addItem('gold_ore', 10);
    state.addItem('coal', 5);

    expect(state.isRecipeUnlocked(goldSmelt)).toBe(false);
    expect(state.canCraft(goldSmelt)).toBe(false);

    expect(state.unlockBlueprint('smelt_gold')).toBe(true);
    expect(state.unlockBlueprint('smelt_gold')).toBe(false); // already unlocked
    expect(state.isRecipeUnlocked(goldSmelt)).toBe(true);
    expect(state.canCraft(goldSmelt)).toBe(true);
  });

  it('supports 3 trinket slots, randomized gear rarity/reforging, and gadget cooldowns', () => {
    const state = new GameState();
    state.reset('Beastmaster');

    // Equip 3 trinkets into trinket1..trinket3
    state.addItem('trinket_regen', 1);
    state.addItem('trinket_swift', 1);
    state.addItem('trinket_crit', 1);
    const i1 = state.bagSlots.findIndex((s) => s?.itemId === 'trinket_regen');
    const i2 = state.bagSlots.findIndex((s) => s?.itemId === 'trinket_swift');
    const i3 = state.bagSlots.findIndex((s) => s?.itemId === 'trinket_crit');
    expect(state.equipFromBag(i1)).toBe(true);
    expect(state.equipFromBag(i2)).toBe(true);
    expect(state.equipFromBag(i3)).toBe(true);
    expect(state.equipment.trinket1).toBe('trinket_regen');
    expect(state.equipment.trinket2).toBe('trinket_swift');
    expect(state.equipment.trinket3).toBe('trinket_crit');
    expect(state.hasTrinketEffect('regen_out_combat')).toBe(true);
    expect(state.hasTrinketEffect('pickup_magnet')).toBe(true);

    // Reforge gear in bag
    state.addItem('sword_iron', 1);
    const swIdx = state.bagSlots.findIndex((s) => s?.itemId === 'sword_iron');
    expect(swIdx).toBeGreaterThanOrEqual(0);
    state.coins = 200;
    state.addItem('iron_ingot', 4);
    const refRes = state.reforgeBagSlot(swIdx);
    expect(refRes.ok).toBe(true);
    expect(refRes.instance?.reforgeCount).toBe(1);

    // Gadget cooldown
    expect(state.getGadgetRemainingMs('gadget_blink')).toBe(0);
    expect(state.triggerGadgetCooldown('gadget_blink')).toBe(true);
    expect(state.getGadgetRemainingMs('gadget_blink')).toBeGreaterThan(0);
    expect(state.triggerGadgetCooldown('gadget_blink')).toBe(false);
  });

  it('supports monster homestead ranching, petting, and egg collection', () => {
    const state = new GameState();
    state.reset('Beastmaster');

    const rc = state.addRanchCreature('slime', 120, 140, 28000);
    expect(state.ranchCreatures.length).toBe(1);
    expect(rc.happiness).toBe(65);

    rc.readyEggs = 2;
    const pet1 = state.petRanchCreature(rc.id, 10000);
    expect(pet1.petted).toBe(true);
    expect(pet1.happiness).toBe(85);
    expect(pet1.eggsCollected).toBe(2);
    expect(rc.readyEggs).toBe(0);

    // Cooldown prevents spamming pet within 6s
    const pet2 = state.petRanchCreature(rc.id, 12000);
    expect(pet2.petted).toBe(false);
  });

  it('enforces hero journey curve, gear/power levels, and story chapter biome gating', () => {
    const state = new GameState();
    state.reset('Beastmaster');

    expect(state.getMaxHp()).toBe(60);
    expect(state.getMaxEnergy()).toBe(60);
    expect(state.getPowerLevel()).toBe(1);
    expect(state.getStoryChapter()).toBe(1);

    // Chapter 2 island (Amber Steppe 3,2) is story-gated in Chapter 1
    state.coins = 500;
    expect(state.getIslandStoryLockReason(3, 2)).not.toBeNull();
    expect(state.buyIsland(3, 2)).toBe(false);

    // Level-gap penalty against high-level enemy
    const scale = state.getDamageScaleVsEnemy(10);
    expect(scale.dealMult).toBeLessThan(1);
    expect(scale.takeMult).toBeGreaterThan(1);

    // Completing Ch.1 quests unlocks Chapter 2 (Autumn/Graveyard)
    state.completedQuests.add('farmer_1');
    state.completedQuests.add('fisherman_1');
    expect(state.getStoryChapter()).toBe(2);
    expect(state.getIslandStoryLockReason(3, 2)).toBeNull();
    expect(state.buyIsland(3, 2)).toBe(true);

    // Clearing Skull Crypt + Sunken Tomb unlocks Chapter 3 (Winter)
    state.clearedDungeons.add('skull_crypt');
    state.clearedDungeons.add('sunken_tomb');
    expect(state.getStoryChapter()).toBe(3);

    // Clearing Frost Cavern unlocks Chapter 4 (Infernal)
    state.clearedDungeons.add('frost_cavern');
    expect(state.getStoryChapter()).toBe(4);
  });

  it('supports Lv. 21-60 Void Spire progression, 55 monsters, 32 skills, and Void Altar crafting', () => {
    expect(Object.keys(MONSTERS).length).toBe(55);
    expect(MONSTERS['Ancient Black Dragon'].level).toBe(60);
    expect(MONSTERS['Oni'].level).toBe(30);
    expect(SKILLS.length).toBe(84);

    const wyrmheartRecipe = RECIPES.find((r) => r.id === 'craft_sword_wyrmheart');
    expect(wyrmheartRecipe?.station).toBe('void_altar');
    const ingMap = Object.fromEntries((wyrmheartRecipe?.ingredients ?? []).map((i) => [i.itemId, i.count]));
    expect(ingMap.celestial_scale).toBeGreaterThan(0);
    expect(ingMap.abyssal_core).toBeGreaterThan(0);
    expect(ingMap.egg_wyrmling).toBeGreaterThan(0);
    expect(ingMap.egg_hellhound).toBeGreaterThan(0);

    const state = new GameState();
    state.reset('Sorcerer');
    state.clearedDungeons.add('skull_crypt');
    state.clearedDungeons.add('sunken_tomb');
    state.clearedDungeons.add('frost_cavern');
    state.clearedDungeons.add('infernal_sanctum');
    expect(state.getStoryChapter()).toBe(5);

    state.voidSpireHighestFloor = 5;
    expect(state.getStoryChapter()).toBe(6);

    state.voidSpireHighestFloor = 10;
    expect(state.getStoryChapter()).toBe(7);

    state.voidSpireHighestFloor = 15;
    expect(state.getStoryChapter()).toBe(8);

    // Tier 6-8 skill bonuses
    const baseHp = state.getMaxHp();
    state.unlockedSkills.add('magic_void_resilience');
    expect(state.getMaxHp()).toBe(baseHp + 120);

    const baseAtk = state.getWeaponDamage('sword');
    state.unlockedSkills.add('magic_astral_surge');
    expect(state.getWeaponDamage('sword')).toBeGreaterThan(baseAtk);

    // Persistence of voidSpireHighestFloor and finalBossDefeated via save/load
    const store: Record<string, string> = {};
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {},
      key: () => null,
      length: 0,
    };
    state.finalBossDefeated = true;
    state.save();

    const loaded = new GameState();
    expect(loaded.load()).toBe(true);
    expect(loaded.voidSpireHighestFloor).toBe(15);
    expect(loaded.finalBossDefeated).toBe(true);
  });

  it('enforces diminishing lighthouse math, Beacon T9-T12 10x scaling, and exponential coin curves', () => {
    expect(lighthouseBonus(0)).toBe(0);
    expect(lighthouseBonus(1)).toBeCloseTo(0.5, 4);
    expect(lighthouseBonus(2)).toBeCloseTo(0.75, 4);
    expect(lighthouseBonus(60)).toBeCloseTo(1.1921, 3);
    expect(getLighthouseMultiplier(60, 10)).toBeCloseTo(12.921, 2);

    expect(gearCoinCost(1)).toBe(30);
    expect(gearCoinCost(60)).toBe(38250);
    expect(scaledIslandCost(40, 0)).toBe(40);
    expect(scaledIslandCost(40, 10)).toBe(210);

    // Beacon skills require minLevel + spCost and scale Beacon multiplier
    const state = new GameState();
    state.reset('Sorcerer');
    state.debugUnlockAllSkills();
    expect(state.getBeaconScale()).toBe(10);
    expect(state.getLighthouseRadius()).toBe(160);

    // Gear recipe coinCost deduction & refund
    const vest = RECIPES.find((r) => r.id === 'craft_armor_leather')!;
    expect(vest.coinCost).toBe(30);
    state.inventory = { wood: 30, slime_gel: 20, berries: 20 };
    state.coins = 20;
    expect(state.canCraft(vest)).toBe(false);
    state.coins = 50;
    expect(state.consumeIngredients(vest)).toBe(true);
    expect(state.coins).toBe(20);
    state.refundIngredients(vest);
    expect(state.coins).toBe(50);
  });

  it('keeps smelting unscaled, caps monster drops at 3x, and splits station craft speed skills', () => {
    const smeltIron = RECIPES.find((r) => r.id === 'smelt_iron')!;
    const smeltGold = RECIPES.find((r) => r.id === 'smelt_gold')!;
    expect(smeltIron.ingredients).toEqual([
      { itemId: 'iron_ore', count: 2 },
      { itemId: 'coal', count: 1 },
    ]);
    expect(smeltGold.ingredients).toEqual([
      { itemId: 'gold_ore', count: 2 },
      { itemId: 'coal', count: 1 },
    ]);

    const infernalForge = RECIPES.find((r) => r.id === 'build_infernal_forge')!;
    const demonHorn = infernalForge.ingredients.find((i) => i.itemId === 'demon_horn');
    expect(demonHorn?.count).toBe(12);

    const state = new GameState();
    state.reset('Sorcerer');
    state.level = 100;
    state.skillPoints = 20;

    const furnaceRec = RECIPES.find((r) => r.station === 'furnace')!;
    const anvilRec = RECIPES.find((r) => r.station === 'anvil')!;
    const infernalRec = RECIPES.find((r) => r.station === 'infernal_forge')!;
    const voidRec = RECIPES.find((r) => r.station === 'void_altar')!;

    expect(state.unlockSkill('industry_smelt')).toBe(true);
    expect(state.getCraftDurationMs(furnaceRec)).toBe(Math.round((furnaceRec.craftTimeMs ?? 3000) / 1.4));
    expect(state.getCraftDurationMs(anvilRec)).toBe(Math.round((anvilRec.craftTimeMs ?? 3000) / 1.4));
    expect(state.getCraftDurationMs(infernalRec)).toBe(infernalRec.craftTimeMs ?? 3000);

    state.debugUnlockAllSkills();
    expect(state.getCraftDurationMs(infernalRec)).toBe(Math.round((infernalRec.craftTimeMs ?? 3000) / 1.35));
    expect(state.getCraftDurationMs(voidRec)).toBe(Math.round((voidRec.craftTimeMs ?? 3000) / 1.35));
  });
});
