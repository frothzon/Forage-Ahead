import { beforeEach, describe, expect, it } from 'vitest';
import { GameState } from '../src/core/GameState';
import { ITEMS } from '../src/data/items';
import { MONSTERS } from '../src/data/monsters';
import { buildAnchorNpcProfiles, generateProceduralTown } from '../src/data/proceduralNpcs';
import { QUESTS, getQuestsForNpc } from '../src/data/quests';
import { OUTDOOR_NPC_BUILDINGS } from '../src/world/OutdoorBuildingStamps';

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

describe('NPC Polish Track 1 Data & State Contracts', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = createMemoryStorage();
  });

  it('places a distinct second bed for family NPCs inside every anchor house stamp', () => {
    const themes = ['farmer', 'fisherman', 'blacksmith', 'alchemist'] as const;
    for (const theme of themes) {
      const stamp = OUTDOOR_NPC_BUILDINGS[theme];
      expect(stamp.familyBedLx).toBeDefined();
      expect(stamp.familyBedLy).toBeDefined();
      expect(
        stamp.familyBedLx !== stamp.bedLx || stamp.familyBedLy !== stamp.bedLy,
      ).toBe(true);

      const beds = stamp.placements.filter((p) => p.type === 'furniture_bed');
      expect(beds.length).toBeGreaterThanOrEqual(2);
      expect(beds.some((b) => b.lx === stamp.bedLx && b.ly === stamp.bedLy)).toBe(true);
      expect(beds.some((b) => b.lx === stamp.familyBedLx && b.ly === stamp.familyBedLy)).toBe(
        true,
      );

      const familyKey = `${stamp.familyBedLx},${stamp.familyBedLy}`;
      const floorKeys = new Set(
        stamp.placements.filter((p) => p.type === 'house_floor').map((p) => `${p.lx},${p.ly}`),
      );
      const blockedKeys = new Set(
        stamp.placements
          .filter((p) => p.type !== 'house_floor' && !(p.type === 'furniture_bed' && `${p.lx},${p.ly}` === familyKey))
          .map((p) => `${p.lx},${p.ly}`),
      );
      expect(floorKeys.has(familyKey)).toBe(true);
      expect(blockedKeys.has(familyKey)).toBe(false);
    }
  });

  it('gives all 12 NPCs globally unique loved items, valid ITEMS IDs, and matching giftHints across seeds', () => {
    const seeds = [1, 42, 1337, 2026, 4242, 987654, -99];
    for (const seed of seeds) {
      const anchors = buildAnchorNpcProfiles(seed);
      const town = generateProceduralTown(seed);
      const cast = [...anchors, ...town];
      expect(cast).toHaveLength(12);

      const globalLoved = new Set<string>();
      let totalLovedCount = 0;

      for (const npc of cast) {
        const expectedLoved = npc.category === 'anchor' ? 3 : 2;
        expect(npc.gifts.loved).toHaveLength(expectedLoved);

        const perNpcAll = [...npc.gifts.loved, ...npc.gifts.liked, ...npc.gifts.disliked];
        expect(new Set(perNpcAll).size).toBe(perNpcAll.length);
        for (const itemId of perNpcAll) {
          expect(ITEMS[itemId], `Unknown item "${itemId}" on ${npc.id}`).toBeDefined();
        }

        for (const lovedId of npc.gifts.loved) {
          expect(globalLoved.has(lovedId), `Duplicate loved item "${lovedId}" on seed ${seed}`).toBe(
            false,
          );
          globalLoved.add(lovedId);
          totalLovedCount += 1;
        }

        expect(npc.giftHint.trim().length).toBeGreaterThan(0);
        const mentionsLovedItemName = npc.gifts.loved.some((id) =>
          npc.giftHint.includes(ITEMS[id].name),
        );
        expect(
          mentionsLovedItemName,
          `giftHint "${npc.giftHint}" does not reference any loved item name for ${npc.id}`,
        ).toBe(true);
      }

      expect(globalLoved.size).toBe(totalLovedCount);
      expect(totalLovedCount).toBe(4 * 3 + 8 * 2);
    }
  });

  it('gates the 8 new procedural villager quests behind minHearts while keeping anchor quests unchanged', () => {
    const proceduralConfigs: Array<{ npcId: string; requiredHearts: number }> = [
      { npcId: 'family_farmer', requiredHearts: 2 },
      { npcId: 'family_fisherman', requiredHearts: 2 },
      { npcId: 'family_blacksmith', requiredHearts: 2 },
      { npcId: 'family_alchemist', requiredHearts: 2 },
      { npcId: 'vagabond_1', requiredHearts: 2 },
      { npcId: 'vagabond_2', requiredHearts: 3 },
      { npcId: 'merchant_1', requiredHearts: 2 },
      { npcId: 'merchant_2', requiredHearts: 3 },
    ];

    for (const q of QUESTS) {
      for (const obj of q.objectives) {
        if (obj.type === 'collect') {
          expect(ITEMS[obj.targetId], `Invalid collect item "${obj.targetId}" in ${q.id}`).toBeDefined();
        } else if (obj.type === 'kill') {
          expect(MONSTERS[obj.targetId], `Invalid monster "${obj.targetId}" in ${q.id}`).toBeDefined();
        }
      }
      for (const rew of q.rewards.items ?? []) {
        expect(ITEMS[rew.itemId], `Invalid reward item "${rew.itemId}" in ${q.id}`).toBeDefined();
      }
    }

    const state = new GameState();
    state.reset('Beastmaster');

    // Existing anchor quests remain unlocked at 0 hearts
    for (const anchorId of ['farmer', 'fisherman', 'blacksmith', 'alchemist']) {
      const q = state.getNextQuestForNpc(anchorId);
      expect(q).toBeDefined();
      expect(q?.minHearts).toBeUndefined();
    }

    // Procedural quests stay locked at 0..minHearts-1 and unlock at minHearts
    for (const { npcId, requiredHearts } of proceduralConfigs) {
      const chain = getQuestsForNpc(npcId);
      expect(chain).toHaveLength(1);
      expect(chain[0].minHearts).toBe(requiredHearts);

      expect(state.getNextQuestForNpc(npcId)).toBeUndefined();
      expect(state.getNextQuestForNpc(npcId, 0)).toBeUndefined();
      expect(state.getNextQuestForNpc(npcId, requiredHearts - 1)).toBeUndefined();

      const unlocked = state.getNextQuestForNpc(npcId, requiredHearts);
      expect(unlocked?.id).toBe(chain[0].id);

      // Once accepted, remains accessible even if currentHearts defaults to 0
      expect(state.acceptQuest(chain[0].id)).toBe(true);
      expect(state.getNextQuestForNpc(npcId, 0)?.id).toBe(chain[0].id);
    }
  });

  it('tracks, resets, and save/load round-trips npcKnownGifts cleanly', () => {
    const state = new GameState();
    state.reset('Sorcerer');

    expect(state.getNpcKnownGifts('farmer')).toEqual({});
    state.recordNpcKnownGift('farmer', 'sunflower', 'loved');
    state.recordNpcKnownGift('farmer', 'berries', 'liked');
    state.recordNpcKnownGift('family_farmer', 'bone', 'disliked');

    expect(state.getNpcKnownGifts('farmer')).toEqual({
      sunflower: 'loved',
      berries: 'liked',
    });
    expect(state.getNpcKnownGifts('family_farmer')).toEqual({
      bone: 'disliked',
    });

    // Returned copy should not mutate internal state
    const copy = state.getNpcKnownGifts('farmer');
    copy.sunflower = 'disliked';
    expect(state.getNpcKnownGifts('farmer').sunflower).toBe('loved');

    state.save(0);

    const restored = new GameState();
    expect(restored.load(0)).toBe(true);
    expect(restored.getNpcKnownGifts('farmer')).toEqual({
      sunflower: 'loved',
      berries: 'liked',
    });
    expect(restored.getNpcKnownGifts('family_farmer')).toEqual({
      bone: 'disliked',
    });

    restored.reset('Gladiator');
    expect(restored.getNpcKnownGifts('farmer')).toEqual({});
    expect(restored.getNpcKnownGifts('family_farmer')).toEqual({});
  });
});
