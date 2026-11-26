import { beforeEach, describe, expect, it } from 'vitest';
import { NpcBrainRuntime } from '../src/ai/NpcBrainRuntime';
import { GameState } from '../src/core/GameState';
import { type DungeonId } from '../src/data/islands';
import { ITEMS } from '../src/data/items';
import { MONSTERS } from '../src/data/monsters';
import { buildAnchorNpcProfiles, generateProceduralTown } from '../src/data/proceduralNpcs';
import { QUESTS, getQuestById, getQuestsForNpc } from '../src/data/quests';
import { RECIPES } from '../src/data/recipes';
import { parseRichDialogue } from '../src/ui/DialogueBox';

const VALID_DUNGEON_IDS = new Set<DungeonId>([
  'skull_crypt',
  'sunken_tomb',
  'frost_cavern',
  'infernal_sanctum',
  'void_spire',
]);

const VALID_BUILD_STRUCTURES = new Set(
  RECIPES.map((r) => r.structureType).filter((s): s is NonNullable<typeof s> => Boolean(s)),
);

const VALID_RECIPE_IDS = new Set(RECIPES.map((r) => r.id));

const NEW_LATE_GAME_QUEST_IDS = [
  'farmer_4',
  'farmer_5',
  'farmer_6',
  'fisherman_4',
  'fisherman_5',
  'fisherman_6',
  'blacksmith_4',
  'blacksmith_5',
  'blacksmith_6',
  'alchemist_4',
  'alchemist_5',
  'alchemist_6',
] as const;

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

describe('Track 2 Pacing: 32 Quests & Mid/Late-Game Progression', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = createMemoryStorage();
  });

  it('has 32 total quests with valid IDs, prerequisites, objectives, and item rewards', () => {
    expect(QUESTS).toHaveLength(32);
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(32);

    for (const q of QUESTS) {
      if (q.prereqQuestId) {
        const prereq = getQuestById(q.prereqQuestId);
        expect(prereq, `Missing prereqQuestId "${q.prereqQuestId}" on ${q.id}`).toBeDefined();
        expect(prereq!.npcId).toBe(q.npcId);
        expect(prereq!.step).toBeLessThan(q.step);
      }

      expect(q.objectives.length).toBeGreaterThan(0);
      for (const obj of q.objectives) {
        expect(obj.count).toBeGreaterThan(0);
        if (obj.type === 'collect') {
          expect(ITEMS[obj.targetId], `Invalid collect item "${obj.targetId}" in ${q.id}`).toBeDefined();
        } else if (obj.type === 'kill') {
          expect(MONSTERS[obj.targetId], `Invalid monster "${obj.targetId}" in ${q.id}`).toBeDefined();
        } else if (obj.type === 'craft') {
          expect(VALID_RECIPE_IDS.has(obj.targetId), `Invalid recipe "${obj.targetId}" in ${q.id}`).toBe(true);
        } else if (obj.type === 'build') {
          const validCropOrStruct =
            VALID_BUILD_STRUCTURES.has(obj.targetId as never) ||
            obj.targetId.startsWith('crop_');
          expect(validCropOrStruct, `Invalid build target "${obj.targetId}" in ${q.id}`).toBe(true);
        } else if (obj.type === 'clear_dungeon') {
          expect(
            VALID_DUNGEON_IDS.has(obj.targetId as DungeonId),
            `Invalid dungeon "${obj.targetId}" in ${q.id}`,
          ).toBe(true);
        }
      }

      for (const rew of q.rewards.items ?? []) {
        expect(ITEMS[rew.itemId], `Invalid reward item "${rew.itemId}" in ${q.id}`).toBeDefined();
        expect(rew.count).toBeGreaterThan(0);
      }

      for (const line of [...q.offerDialogue, ...q.progressDialogue, ...q.completeDialogue]) {
        expect(parseRichDialogue(line).length).toBeGreaterThan(0);
      }
    }
  });

  it('chains steps 1->6 cleanly across all 4 anchor NPCs and matches late-game XP/Gold budgets', () => {
    for (const anchorId of ['farmer', 'fisherman', 'blacksmith', 'alchemist'] as const) {
      const chain = getQuestsForNpc(anchorId);
      expect(chain.map((q) => q.step)).toEqual([1, 2, 3, 4, 5, 6]);
      for (let i = 1; i < chain.length; i += 1) {
        expect(chain[i].prereqQuestId).toBe(chain[i - 1].id);
      }
    }

    let totalNewXp = 0;
    let totalNewCoins = 0;
    for (const id of NEW_LATE_GAME_QUEST_IDS) {
      const q = getQuestById(id);
      expect(q, `Missing late-game quest ${id}`).toBeDefined();
      totalNewXp += q!.rewards.xp;
      totalNewCoins += q!.rewards.coins;
    }

    expect(totalNewXp).toBeGreaterThanOrEqual(24000);
    expect(totalNewXp).toBeLessThanOrEqual(32000);
    expect(totalNewCoins).toBeGreaterThanOrEqual(14000);
    expect(totalNewCoins).toBeLessThanOrEqual(20000);

    // Verify GameState unlocks step 4 after step 3 is completed
    const gs = new GameState();
    gs.reset('Beastmaster');
    gs.completedQuests.add('farmer_1');
    gs.completedQuests.add('farmer_2');
    gs.completedQuests.add('farmer_3');
    expect(gs.getNextQuestForNpc('farmer')?.id).toBe('farmer_4');
    expect(gs.acceptQuest('farmer_4')).toBe(true);
    expect(gs.acceptQuest('farmer_5')).toBe(false);
  });
});

describe('Track 2 Pacing: Villager Friendship & Gift Progression', () => {
  it('spawns all 12 villagers at <= 1 Heart (warm anchors/family at 1, gruff/drifters/merchants at 0)', () => {
    for (const worldSeed of [42, 1337, 2026, 987654]) {
      const runtime = new NpcBrainRuntime({ seed: worldSeed });
      const cast = [...buildAnchorNpcProfiles(worldSeed), ...generateProceduralTown(worldSeed)];
      expect(cast).toHaveLength(12);

      for (const profile of cast) {
        expect(profile.baselineMood).toHaveLength(7);
        const handle = runtime.ensureNpc({
          id: profile.id,
          personaKey: profile.personaKey,
          loreSlice: {
            id: profile.id,
            name: profile.name,
            label: `${profile.lore.home} (${profile.name})`,
            ...profile.lore,
          },
          baselineMood: profile.baselineMood,
          driveWeights: profile.driveWeights,
          seed: profile.seed,
        });

        const initial = handle.getMoodState();
        expect(initial.hearts, `${profile.id} (seed ${worldSeed})`).toBeLessThanOrEqual(1);
        expect(initial.hearts, `${profile.id} (seed ${worldSeed})`).toBeGreaterThanOrEqual(0);
        expect(initial.secretUnlocked).toBe(false);

        if (profile.id === 'farmer' || profile.id === 'fisherman' || profile.category === 'family') {
          expect(initial.hearts, `${profile.id} should start at 1 Heart`).toBe(1);
        } else {
          expect(initial.hearts, `${profile.id} should start at 0 Hearts`).toBe(0);
        }
      }
    }
  });

  it('grows hearts gently on passive chat while loved gifts drive strong friendship gains', () => {
    const worldSeed = 2026;
    const runtime = new NpcBrainRuntime({ seed: worldSeed });
    const cast = [...buildAnchorNpcProfiles(worldSeed), ...generateProceduralTown(worldSeed)];

    for (const profile of cast) {
      const handle = runtime.ensureNpc({
        id: profile.id,
        personaKey: profile.personaKey,
        baselineMood: profile.baselineMood,
        driveWeights: profile.driveWeights,
        seed: profile.seed,
      });

      const before = handle.getMoodState();

      // Passive lore/info chat stays gentle (never rockets straight to 3+ Hearts)
      handle.talk('Hello there');
      const afterChat1 = handle.talk('Have you heard any rumors lately?');
      const afterChat2 = handle.talk('What is life like around here?');
      expect(afterChat1.hearts).toBeLessThanOrEqual(2);
      expect(afterChat2.hearts).toBeLessThanOrEqual(2);

      // Gifting a loved item clearly advances friendship toward 3-5 Hearts
      const lovedItemName = ITEMS[profile.gifts.loved[0]]?.name ?? profile.gifts.loved[0];
      const afterGift = handle.applyGift(lovedItemName, 'loved');
      expect(afterGift.hearts).toBeGreaterThan(before.hearts);
      expect(afterGift.hearts).toBeGreaterThanOrEqual(3);
      expect(afterGift.mood[0]).toBeGreaterThan(before.mood[0]);
      expect(afterGift.mood[1]).toBeGreaterThan(before.mood[1]);
    }
  });
});
