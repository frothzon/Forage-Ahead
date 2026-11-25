import { beforeEach, describe, expect, it } from 'vitest';
import { GameState } from '../src/core/GameState';

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

describe('GameState save & load robustness', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = createMemoryStorage();
  });

  it('round-trips player state through save() and load()', () => {
    const gs = new GameState();
    gs.reset('Gladiator');
    gs.coins = 420;
    gs.level = 5;
    gs.xp = 88;
    gs.addItem('iron_ingot', 7);
    gs.save();

    const restored = new GameState();
    expect(restored.hasSavedGame()).toBe(true);
    expect(restored.load()).toBe(true);
    expect(restored.heroClass).toBe('Gladiator');
    expect(restored.coins).toBe(420);
    expect(restored.level).toBe(5);
    expect(restored.xp).toBe(88);
    expect(restored.getItemCount('iron_ingot')).toBe(7);
  });

  it('falls back to backup save if primary save JSON is corrupted', () => {
    const gs = new GameState();
    gs.reset('Sorcerer');
    gs.coins = 150;
    gs.save();

    gs.coins = 300;
    gs.save(); // writes 150 to backup, 300 to primary

    localStorage.setItem('isles_of_foraging_save_v2_slot_0', '{corrupt-json!!!');

    const restored = new GameState();
    expect(restored.load(0)).toBe(true);
    expect(restored.heroClass).toBe('Sorcerer');
    expect(restored.coins).toBe(150);
  });

  it('applies safe defaults for legacy/partial saves and migrates to slot 0', () => {
    localStorage.setItem(
      'isles_of_foraging_save_v2',
      JSON.stringify({
        version: 1,
        heroClass: 'Swashbuckler',
        completedQuests: ['farmer'],
      }),
    );

    const restored = new GameState();
    expect(restored.load(0)).toBe(true);
    expect(restored.heroClass).toBe('Swashbuckler');
    expect(restored.hp).toBe(100);
    expect(restored.level).toBe(1);
    expect(restored.ownedIslands.has('2,2')).toBe(true);
    expect(restored.completedQuests.has('farmer_1')).toBe(true);
  });

  it('keeps save slots 0, 1, 2 isolated and supports copySlot and deleteSlot', () => {
    const gs = new GameState();
    gs.reset('Gladiator');
    gs.coins = 111;
    gs.save(0);

    gs.reset('Sorcerer');
    gs.coins = 222;
    gs.save(1);

    expect(gs.peekSaveSummary(0)?.heroClass).toBe('Gladiator');
    expect(gs.peekSaveSummary(0)?.coins).toBe(111);
    expect(gs.peekSaveSummary(1)?.heroClass).toBe('Sorcerer');
    expect(gs.peekSaveSummary(1)?.coins).toBe(222);
    expect(gs.hasSavedGame(2)).toBe(false);

    expect(gs.copySlot(1, 2)).toBe(true);
    expect(gs.peekSaveSummary(2)?.heroClass).toBe('Sorcerer');
    expect(gs.peekSaveSummary(2)?.coins).toBe(222);

    gs.deleteSlot(1);
    expect(gs.hasSavedGame(1)).toBe(false);
    expect(gs.hasSavedGame(2)).toBe(true);

    const loaded2 = new GameState();
    expect(loaded2.load(2)).toBe(true);
    expect(loaded2.activeSlotIndex).toBe(2);
    expect(loaded2.coins).toBe(222);
  });

  it('populates, derives per-floor, backfills, and round-trips locked dungeonSeeds', () => {
    const dungeonIds = [
      'skull_crypt',
      'sunken_tomb',
      'frost_cavern',
      'infernal_sanctum',
      'void_spire',
    ] as const;

    const gs = new GameState();
    gs.reset('Beastmaster');

    // All 5 dungeons get positive 32-bit integer seeds on reset()
    const seen = new Set<number>();
    for (const id of dungeonIds) {
      const seed = gs.dungeonSeeds[id];
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThan(0);
      seen.add(seed);
    }
    expect(seen.size).toBe(5);

    // Deterministic repeated calls & distinct per-floor derivation
    const cryptSeedA = gs.getDungeonSeed('skull_crypt');
    const cryptSeedB = gs.getDungeonSeed('skull_crypt');
    expect(cryptSeedA).toBe(cryptSeedB);

    const spireF1 = gs.getDungeonSeed('void_spire', 1);
    const spireF2 = gs.getDungeonSeed('void_spire', 2);
    expect(spireF1).not.toBe(spireF2);
    expect(gs.getDungeonSeed('void_spire', 2)).toBe(spireF2);

    // Survives save() -> reset() -> load() round-trip intact
    const savedSeeds = { ...gs.dungeonSeeds };
    gs.save(0);
    gs.reset('Gladiator');
    expect(gs.load(0)).toBe(true);
    expect(gs.dungeonSeeds).toEqual(savedSeeds);

    // Legacy saves missing dungeonSeeds get backfilled for all 5 dungeons
    localStorage.setItem(
      'isles_of_foraging_save_v2_slot_1',
      JSON.stringify({
        version: 2,
        heroClass: 'Sorcerer',
      }),
    );
    const legacy = new GameState();
    expect(legacy.load(1)).toBe(true);
    for (const id of dungeonIds) {
      expect(Number.isInteger(legacy.dungeonSeeds[id])).toBe(true);
      expect(legacy.dungeonSeeds[id]).toBeGreaterThan(0);
    }
  });

  it('uses 1.65 base crit damage multiplier while preserving skill bonuses', () => {
    const gs = new GameState();
    gs.reset('Swashbuckler');
    expect(gs.getCritDamageMultiplier(false)).toBeCloseTo(1.65, 5);
    gs.unlockedSkills.add('fam_sw_t7');
    expect(gs.getCritDamageMultiplier(true)).toBeCloseTo(1.85, 5);
  });
});
