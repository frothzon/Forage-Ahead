import { describe, expect, it } from 'vitest';
import assetManifest from '../src/data/assetManifest.json';
import { ISLANDS, getIslandAt } from '../src/data/islands';
import { ITEMS } from '../src/data/items';
import {
  buildAnchorNpcProfiles,
  evaluateGiftReaction,
  generateProceduralTown,
  type ProceduralNpcProfile,
} from '../src/data/proceduralNpcs';
import {
  findGossipPairs,
  getDayPeriod,
  resolveNpcScheduleTarget,
} from '../src/world/NpcScheduleSystem';

const manifestImages = assetManifest.images as Record<string, { path: string }>;

function assertValidProfileAssetsAndItems(npc: ProceduralNpcProfile): void {
  expect(manifestImages[npc.spriteKey]).toBeDefined();
  expect(npc.gifts.loved.length).toBeGreaterThan(0);
  expect(npc.gifts.liked.length).toBeGreaterThan(0);
  expect(npc.gifts.disliked.length).toBeGreaterThan(0);

  const allGiftIds = [...npc.gifts.loved, ...npc.gifts.liked, ...npc.gifts.disliked];
  for (const itemId of allGiftIds) {
    expect(ITEMS[itemId], `Unknown gift item "${itemId}" on ${npc.id}`).toBeDefined();
  }

  // Gift preference tiers must be disjoint for a given NPC
  expect(new Set(allGiftIds).size).toBe(allGiftIds.length);

  if (npc.secretReward.kind === 'item') {
    expect(npc.secretReward.itemId).toBeDefined();
    expect(
      ITEMS[npc.secretReward.itemId!],
      `Unknown secretReward item "${npc.secretReward.itemId}" on ${npc.id}`,
    ).toBeDefined();
  }

  expect(npc.schedule.map((b) => b.period).sort()).toEqual([
    'evening',
    'midday',
    'morning',
    'night',
  ]);
}

describe('Procedural Villager Generator (proceduralNpcs)', () => {
  it('builds all 4 anchor NPC profiles matching ISLANDS coordinates and sprites', () => {
    const anchors = buildAnchorNpcProfiles(1337);
    expect(anchors).toHaveLength(4);
    expect(anchors.map((a) => a.id)).toEqual(['farmer', 'fisherman', 'blacksmith', 'alchemist']);

    for (const anchor of anchors) {
      expect(anchor.category).toBe('anchor');
      const island = getIslandAt(anchor.homeIslandGx, anchor.homeIslandGy);
      expect(island?.npc?.id).toBe(anchor.id);
      expect(island?.npc?.name).toBe(anchor.name);
      expect(island?.npc?.spriteKey).toBe(anchor.spriteKey);
      assertValidProfileAssetsAndItems(anchor);
    }
  });

  it('generates 4 family members, 2 vagabonds, and 2 traveling merchants with valid assets', () => {
    const anchors = buildAnchorNpcProfiles(4242);
    const town = generateProceduralTown(4242);

    const family = town.filter((n) => n.category === 'family');
    const vagabonds = town.filter((n) => n.category === 'vagabond');
    const merchants = town.filter((n) => n.category === 'merchant');

    expect(town).toHaveLength(8);
    expect(family).toHaveLength(4);
    expect(vagabonds).toHaveLength(2);
    expect(merchants).toHaveLength(2);

    // Unique IDs and unique names across anchors + procedural town
    const allNpcs = [...anchors, ...town];
    expect(new Set(allNpcs.map((n) => n.id)).size).toBe(allNpcs.length);
    expect(new Set(allNpcs.map((n) => n.name)).size).toBe(allNpcs.length);

    for (const npc of town) {
      assertValidProfileAssetsAndItems(npc);
    }

    // Family members bind 1-to-1 to valid anchor NPCs on their anchor's island
    const anchorById = new Map(anchors.map((a) => [a.id, a]));
    const boundAnchors = new Set<string>();
    for (const fam of family) {
      expect(fam.anchorNpcId).toBeDefined();
      const anchor = anchorById.get(fam.anchorNpcId!);
      expect(anchor).toBeDefined();
      expect(fam.homeIslandGx).toBe(anchor!.homeIslandGx);
      expect(fam.homeIslandGy).toBe(anchor!.homeIslandGy);
      expect(fam.relationLabel).toBeTruthy();
      boundAnchors.add(fam.anchorNpcId!);
    }
    expect(boundAnchors.size).toBe(4);
    expect(new Set(family.map((f) => f.spriteKey))).toEqual(
      new Set([
        'npcs/Medieval Townsfolk pack (bonus)/Kid01_idle',
        'npcs/Medieval Townsfolk pack (bonus)/Barmaid_idle',
        'npcs/Medieval Townsfolk pack (bonus)/Bartender_idle',
        'npcs/Medieval Townsfolk pack (bonus)/Kid02_idle',
      ]),
    );

    // Vagabonds use Bartender/Barmaid sprites with distinct tints & Winter/Infernal rumors
    expect(vagabonds[0].spriteKey).toBe('npcs/Medieval Townsfolk pack (bonus)/Bartender_idle');
    expect(vagabonds[1].spriteKey).toBe('npcs/Medieval Townsfolk pack (bonus)/Barmaid_idle');
    expect(vagabonds[0].tint).toBeDefined();
    expect(vagabonds[1].tint).toBeDefined();
    expect(vagabonds[0].tint).not.toBe(vagabonds[1].tint);
    for (const v of vagabonds) {
      expect(v.lore.rumor).toMatch(
        /Glacier Peak|Frostwind Ridge|Frost Cavern|Frozen Fjord|Cinder Crossing|Infernal Sanctum|Ember Wastes|Sulfur Crag|Scorched Oasis/,
      );
    }

    // Merchants use Merchant_idle with distinct tints and coin/item/discount perks
    expect(merchants[0].spriteKey).toBe('npcs/Medieval Townsfolk pack (bonus)/Merchant_idle');
    expect(merchants[1].spriteKey).toBe('npcs/Medieval Townsfolk pack (bonus)/Merchant_idle');
    expect(merchants[0].tint).toBeDefined();
    expect(merchants[1].tint).toBeDefined();
    expect(merchants[0].tint).not.toBe(merchants[1].tint);
    for (const m of merchants) {
      expect(['coins', 'item', 'discount']).toContain(m.secretReward.kind);
    }
  });

  it('is deterministic for identical seeds and varies names, traits, and gifts across seeds', () => {
    for (const seed of [0, 1, 777, -42, 987654]) {
      expect(buildAnchorNpcProfiles(seed)).toEqual(buildAnchorNpcProfiles(seed));
      expect(generateProceduralTown(seed)).toEqual(generateProceduralTown(seed));
    }

    const seeds = [101, 202, 303, 404, 505];
    const towns = seeds.map((s) => generateProceduralTown(s));

    // Across multiple seeds, procedural names, moods/drives, and gifts must diverge
    const nameSignatures = new Set(towns.map((t) => t.map((n) => n.name).join('|')));
    const traitSignatures = new Set(
      towns.map((t) => t.map((n) => `${n.voicePitch}:${n.baselineMood.join(',')}`).join('|')),
    );
    const giftSignatures = new Set(
      towns.map((t) => t.map((n) => n.gifts.loved.join(',')).join('|')),
    );

    expect(nameSignatures.size).toBeGreaterThan(3);
    expect(traitSignatures.size).toBeGreaterThan(3);
    expect(giftSignatures.size).toBeGreaterThan(3);
  });

  it('validates all gift item IDs across many seeds and evaluates gift reactions accurately', () => {
    for (let s = 0; s < 12; s++) {
      const cast = [...buildAnchorNpcProfiles(s * 17), ...generateProceduralTown(s * 17)];
      for (const npc of cast) {
        assertValidProfileAssetsAndItems(npc);
      }
    }

    const town = generateProceduralTown(2026);
    const target = town[0];
    expect(evaluateGiftReaction(target, target.gifts.loved[0])).toBe('loved');
    expect(evaluateGiftReaction(target, target.gifts.liked[0])).toBe('liked');
    expect(evaluateGiftReaction(target, target.gifts.disliked[0])).toBe('disliked');
    expect(evaluateGiftReaction(target, 'nonexistent_garbage_item')).toBe('disliked');
  });
});

describe('Stardew-style NpcScheduleSystem', () => {
  const unlockedIslands = [
    { gx: 2, gy: 2 }, // Emerald Origin (starter)
    { gx: 2, gy: 1 }, // Meadow Homestead
    { gx: 2, gy: 3 }, // Angler's Pier
    { gx: 3, gy: 2 }, // Amber Steppe
    { gx: 0, gy: 0 }, // Glacier Peak (winter frontier)
    { gx: 4, gy: 0 }, // Infernal Sanctum (infernal frontier)
  ];

  it('maps nightFactor and dayProgress01 into day periods consistently', () => {
    expect(getDayPeriod(0.05)).toBe('morning');
    expect(getDayPeriod(0)).toBe('midday');
    expect(getDayPeriod(0.25)).toBe('evening');
    expect(getDayPeriod(0.6)).toBe('night');

    expect(getDayPeriod(0.1, 0.15)).toBe('morning');
    expect(getDayPeriod(0, 0.42)).toBe('midday');
    expect(getDayPeriod(0.2, 0.66)).toBe('evening');
    expect(getDayPeriod(0.8, 0.9)).toBe('night');
    expect(getDayPeriod(0.5, 0.45)).toBe('night');
  });

  it('rotates traveling merchants across unlockedIslands each day and sleeps at night', () => {
    const town = generateProceduralTown(1234);
    const merchant1 = town.find((n) => n.id === 'merchant_1')!;
    const merchant2 = town.find((n) => n.id === 'merchant_2')!;

    const visited1 = new Set<string>();
    const visited2 = new Set<string>();
    for (let day = 0; day < unlockedIslands.length; day++) {
      const r1 = resolveNpcScheduleTarget(merchant1, {
        dayNumber: day,
        period: 'midday',
        isRaining: false,
        unlockedIslands,
      });
      const expected = unlockedIslands[day % unlockedIslands.length];
      expect(r1.targetGx).toBe(expected.gx);
      expect(r1.targetGy).toBe(expected.gy);
      expect(r1.wantsSleep).toBe(false);
      expect(r1.wantsShelter).toBe(false);
      visited1.add(`${r1.targetGx},${r1.targetGy}`);

      const r2 = resolveNpcScheduleTarget(merchant2, {
        dayNumber: day,
        period: 'midday',
        isRaining: false,
        unlockedIslands,
      });
      visited2.add(`${r2.targetGx},${r2.targetGy}`);
      expect(`${r1.targetGx},${r1.targetGy}`).not.toBe(`${r2.targetGx},${r2.targetGy}`);
    }

    expect(visited1.size).toBe(unlockedIslands.length);
    expect(visited2.size).toBe(unlockedIslands.length);

    const nightRes = resolveNpcScheduleTarget(merchant1, {
      dayNumber: 2,
      period: 'night',
      isRaining: false,
      unlockedIslands,
    });
    expect(nightRes.wantsSleep).toBe(true);
    expect(nightRes.wantsShelter).toBe(true);
    expect(nightRes.offsetTx).toBe(0);
    expect(nightRes.offsetTy).toBe(0);
  });

  it('drifts vagabonds across frontier/unlocked islands every 2 days', () => {
    const town = generateProceduralTown(5678);
    const vagabond = town.find((n) => n.category === 'vagabond')!;

    const d1 = resolveNpcScheduleTarget(vagabond, {
      dayNumber: 1,
      period: 'midday',
      isRaining: false,
      unlockedIslands,
    });
    const d2 = resolveNpcScheduleTarget(vagabond, {
      dayNumber: 2,
      period: 'midday',
      isRaining: false,
      unlockedIslands,
    });
    const d3 = resolveNpcScheduleTarget(vagabond, {
      dayNumber: 3,
      period: 'midday',
      isRaining: false,
      unlockedIslands,
    });
    const d4 = resolveNpcScheduleTarget(vagabond, {
      dayNumber: 4,
      period: 'midday',
      isRaining: false,
      unlockedIslands,
    });

    // Same island on days 1 & 2, shifts on day 3 & stays on day 4
    expect(`${d1.targetGx},${d1.targetGy}`).toBe(`${d2.targetGx},${d2.targetGy}`);
    expect(`${d3.targetGx},${d3.targetGy}`).toBe(`${d4.targetGx},${d4.targetGy}`);
    expect(`${d1.targetGx},${d1.targetGy}`).not.toBe(`${d3.targetGx},${d3.targetGy}`);

    // Both chosen destinations should be frontier (winter/infernal) islands when multiple are unlocked
    const island1 = getIslandAt(d1.targetGx, d1.targetGy)!;
    const island3 = getIslandAt(d3.targetGx, d3.targetGy)!;
    expect(['winter', 'infernal']).toContain(island1.biome);
    expect(['winter', 'infernal']).toContain(island3.biome);
    expect(ISLANDS.some((i) => i.gx === d1.targetGx && i.gy === d1.targetGy)).toBe(true);
  });

  it('activates rain shelter override pulling outdoor villagers back to home/shelter', () => {
    const anchors = buildAnchorNpcProfiles(99);
    const town = generateProceduralTown(99);
    const villager = town.find((n) => n.category === 'family')!;

    for (const npc of [anchors[0], villager]) {
      const sunny = resolveNpcScheduleTarget(npc, {
        dayNumber: 1,
        period: 'morning',
        isRaining: false,
        unlockedIslands,
      });
      const rainy = resolveNpcScheduleTarget(npc, {
        dayNumber: 1,
        period: 'morning',
        isRaining: true,
        unlockedIslands,
      });

      expect(sunny.wantsShelter).toBe(false);
      expect(sunny.wantsSleep).toBe(false);
      expect(Math.hypot(sunny.offsetTx, sunny.offsetTy)).toBeGreaterThan(0);

      expect(rainy.wantsShelter).toBe(true);
      expect(rainy.wantsSleep).toBe(false);
      expect(rainy.offsetTx).toBe(0);
      expect(rainy.offsetTy).toBe(0);
      expect(Math.hypot(rainy.offsetTx, rainy.offsetTy)).toBeLessThan(
        Math.hypot(sunny.offsetTx, sunny.offsetTy),
      );
    }
  });

  it('detects gossip pairs among nearby awake NPCs and excludes distant or sleeping ones', () => {
    const pairs = findGossipPairs(
      [
        { id: 'farmer', x: 100, y: 100, sleeping: false },
        { id: 'family_farmer', x: 124, y: 110, sleeping: false }, // dist ~26px <= 48px
        { id: 'merchant_1', x: 148, y: 100, sleeping: false }, // dist 48px from farmer, ~26px from family_farmer
        { id: 'fisherman', x: 108, y: 104, sleeping: true }, // sleeping -> excluded
        { id: 'alchemist', x: 400, y: 400, sleeping: false }, // too far
      ],
      48,
    );

    expect(pairs).toEqual([
      ['farmer', 'family_farmer'],
      ['farmer', 'merchant_1'],
      ['family_farmer', 'merchant_1'],
    ]);

    expect(
      findGossipPairs(
        [
          { id: 'a', x: 0, y: 0, sleeping: false },
          { id: 'b', x: 30, y: 0, sleeping: false },
        ],
        20,
      ),
    ).toEqual([]);
  });
});
