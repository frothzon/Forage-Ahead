import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('Overworld chest & dungeon room persistence', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = createMemoryStorage();
  });

  it('tracks overworld chests, emits once per new chest, and round-trips through save/load', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');

    const listener = vi.fn();
    gs.onChange(listener);

    expect(gs.isOverworldChestLooted('island_2_2_chest_0')).toBe(false);
    gs.markOverworldChestLooted('island_2_2_chest_0');
    gs.markOverworldChestLooted('island_2_2_chest_0'); // duplicate should not re-emit
    gs.markOverworldChestLooted('island_3_2_chest_1');

    expect(listener).toHaveBeenCalledTimes(2);
    expect(gs.isOverworldChestLooted('island_2_2_chest_0')).toBe(true);
    expect(gs.isOverworldChestLooted('island_3_2_chest_1')).toBe(true);
    expect(gs.isOverworldChestLooted('island_1_2_chest_0')).toBe(false);

    gs.save(0);

    const restored = new GameState();
    expect(restored.load(0)).toBe(true);
    expect(restored.isOverworldChestLooted('island_2_2_chest_0')).toBe(true);
    expect(restored.isOverworldChestLooted('island_3_2_chest_1')).toBe(true);
    expect(restored.isOverworldChestLooted('island_1_2_chest_0')).toBe(false);
  });

  it('tracks dungeon puzzles and chests across dungeons, floors, and rooms and round-trips through save/load', () => {
    const gs = new GameState();
    gs.reset('Sorcerer');

    expect(gs.getDungeonRoomKey('skull_crypt', 1, 4)).toBe('skull_crypt:1:4');

    const listener = vi.fn();
    gs.onChange(listener);

    gs.markDungeonPuzzleSolved('skull_crypt', 1, 2);
    gs.markDungeonPuzzleSolved('skull_crypt', 1, 2); // duplicate no-op
    gs.markDungeonPuzzleSolved('void_spire', 3, 5);

    gs.markDungeonChestOpened('skull_crypt', 1, 2);
    gs.markDungeonChestOpened('sunken_tomb', 2, 1);
    gs.markDungeonChestOpened('sunken_tomb', 2, 1); // duplicate no-op

    expect(listener).toHaveBeenCalledTimes(4);

    // Distinctness across dungeon / floor / room
    expect(gs.isDungeonPuzzleSolved('skull_crypt', 1, 2)).toBe(true);
    expect(gs.isDungeonPuzzleSolved('skull_crypt', 2, 2)).toBe(false);
    expect(gs.isDungeonPuzzleSolved('skull_crypt', 1, 3)).toBe(false);
    expect(gs.isDungeonPuzzleSolved('void_spire', 3, 5)).toBe(true);
    expect(gs.isDungeonPuzzleSolved('void_spire', 1, 5)).toBe(false);

    expect(gs.isDungeonChestOpened('skull_crypt', 1, 2)).toBe(true);
    expect(gs.isDungeonChestOpened('sunken_tomb', 2, 1)).toBe(true);
    expect(gs.isDungeonChestOpened('sunken_tomb', 1, 1)).toBe(false);
    expect(gs.isDungeonChestOpened('void_spire', 3, 5)).toBe(false);

    gs.save(1);

    const restored = new GameState();
    expect(restored.load(1)).toBe(true);
    expect(restored.isDungeonPuzzleSolved('skull_crypt', 1, 2)).toBe(true);
    expect(restored.isDungeonPuzzleSolved('skull_crypt', 2, 2)).toBe(false);
    expect(restored.isDungeonPuzzleSolved('void_spire', 3, 5)).toBe(true);
    expect(restored.isDungeonChestOpened('skull_crypt', 1, 2)).toBe(true);
    expect(restored.isDungeonChestOpened('sunken_tomb', 2, 1)).toBe(true);
    expect(restored.isDungeonChestOpened('sunken_tomb', 1, 1)).toBe(false);
  });

  it('clears all chest and puzzle persistence sets on reset() and defaults safely on legacy saves', () => {
    const gs = new GameState();
    gs.reset('Gladiator');
    gs.markOverworldChestLooted('ow_chest_1');
    gs.markDungeonPuzzleSolved('frost_cavern', 1, 3);
    gs.markDungeonChestOpened('infernal_sanctum', 2, 4);

    expect(gs.lootedOverworldChests.size).toBe(1);
    expect(gs.solvedDungeonPuzzles.size).toBe(1);
    expect(gs.openedDungeonChests.size).toBe(1);

    gs.reset('Swashbuckler');

    expect(gs.lootedOverworldChests.size).toBe(0);
    expect(gs.solvedDungeonPuzzles.size).toBe(0);
    expect(gs.openedDungeonChests.size).toBe(0);
    expect(gs.isOverworldChestLooted('ow_chest_1')).toBe(false);
    expect(gs.isDungeonPuzzleSolved('frost_cavern', 1, 3)).toBe(false);
    expect(gs.isDungeonChestOpened('infernal_sanctum', 2, 4)).toBe(false);

    // Loading a legacy save missing the new arrays resets the sets to empty
    gs.markOverworldChestLooted('stale_chest');
    gs.markDungeonPuzzleSolved('skull_crypt', 1, 1);
    gs.markDungeonChestOpened('skull_crypt', 1, 1);
    localStorage.setItem(
      'isles_of_foraging_save_v2_slot_2',
      JSON.stringify({ version: 2, heroClass: 'Beastmaster' }),
    );
    expect(gs.load(2)).toBe(true);
    expect(gs.lootedOverworldChests.size).toBe(0);
    expect(gs.solvedDungeonPuzzles.size).toBe(0);
    expect(gs.openedDungeonChests.size).toBe(0);
  });
});
