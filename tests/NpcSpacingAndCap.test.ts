import { describe, expect, it } from 'vitest';
import { getIslandAt } from '../src/data/islands';
import {
  buildAnchorNpcProfiles,
  generateProceduralTown,
} from '../src/data/proceduralNpcs';
import {
  ANCHOR_QUEST_GIVER_BUFFER_PX,
  MIN_NPC_PERSONAL_SPACE_PX,
  assignWanderingNpcsToIslands,
  computeNpcSeparationVector,
  getRequiredNpcSeparationPx,
  isSpotRespectingNpcSpace,
} from '../src/world/NpcScheduleSystem';

describe('Wandering NPC Island Cap & Coordinator (assignWanderingNpcsToIslands)', () => {
  const fullCast = [
    ...buildAnchorNpcProfiles(2026),
    ...generateProceduralTown(2026),
  ];

  it('caps wandering NPCs to exactly 1 on 1 unlocked island (2,2) and rotates merchants & vagabonds across days 1-4', () => {
    const oneIsland = [{ gx: 2, gy: 2 }];
    const visitedIds: string[] = [];
    const visitedCategories: string[] = [];

    for (let day = 1; day <= 4; day++) {
      const result = assignWanderingNpcsToIslands(fullCast, {
        dayNumber: day,
        period: 'midday',
        isRaining: false,
        unlockedIslands: oneIsland,
      });

      expect(result.size).toBe(1);
      const [entry] = Array.from(result.values());
      expect(entry.targetGx).toBe(2);
      expect(entry.targetGy).toBe(2);
      expect(entry.schedule.targetGx).toBe(2);
      expect(entry.schedule.targetGy).toBe(2);

      const profile = fullCast.find((p) => p.id === entry.profileId)!;
      expect(['merchant', 'vagabond']).toContain(profile.category);
      visitedIds.push(entry.profileId);
      visitedCategories.push(profile.category);
    }

    expect(visitedIds).toEqual([
      'merchant_1',
      'vagabond_1',
      'merchant_2',
      'vagabond_2',
    ]);
    expect(visitedCategories).toEqual([
      'merchant',
      'vagabond',
      'merchant',
      'vagabond',
    ]);

    // Day 5 wraps back to merchant_1
    const day5 = assignWanderingNpcsToIslands(fullCast, {
      dayNumber: 5,
      period: 'morning',
      isRaining: false,
      unlockedIslands: oneIsland,
    });
    expect(day5.size).toBe(1);
    expect(day5.has('merchant_1')).toBe(true);
  });

  it('caps at most 1 wanderer per unlocked island and never assigns duplicate coordinates for 2, 3, 4, and 8 islands', () => {
    const twoIslands = [
      { gx: 2, gy: 2 }, // non-anchor
      { gx: 2, gy: 1 }, // anchor (farmer)
    ];
    const threeIslands = [
      { gx: 2, gy: 2 }, // non-anchor
      { gx: 1, gy: 1 }, // non-anchor
      { gx: 2, gy: 1 }, // anchor (farmer)
    ];
    const fourIslands = [
      { gx: 2, gy: 2 }, // non-anchor
      { gx: 2, gy: 1 }, // anchor (farmer)
      { gx: 2, gy: 3 }, // anchor (fisherman)
      { gx: 3, gy: 2 }, // anchor (blacksmith)
    ];
    const eightIslands = [
      { gx: 2, gy: 2 }, // non-anchor
      { gx: 2, gy: 1 }, // anchor (farmer)
      { gx: 2, gy: 3 }, // anchor (fisherman)
      { gx: 3, gy: 2 }, // anchor (blacksmith)
      { gx: 1, gy: 1 }, // non-anchor
      { gx: 0, gy: 0 }, // non-anchor
      { gx: 4, gy: 0 }, // non-anchor
      { gx: 3, gy: 3 }, // non-anchor
    ];

    for (const unlocked of [twoIslands, threeIslands, fourIslands, eightIslands]) {
      const unlockedKeys = new Set(unlocked.map((i) => `${i.gx},${i.gy}`));

      for (let day = 1; day <= 6; day++) {
        const result = assignWanderingNpcsToIslands(fullCast, {
          dayNumber: day,
          period: 'midday',
          isRaining: false,
          unlockedIslands: unlocked,
        });

        expect(result.size).toBe(Math.min(unlocked.length, 4));
        const assignedKeys = new Set<string>();

        for (const assignment of result.values()) {
          const key = `${assignment.targetGx},${assignment.targetGy}`;
          expect(unlockedKeys.has(key)).toBe(true);
          expect(assignment.schedule.targetGx).toBe(assignment.targetGx);
          expect(assignment.schedule.targetGy).toBe(assignment.targetGy);
          expect(assignedKeys.has(key)).toBe(false);
          assignedKeys.add(key);

          const profile = fullCast.find((p) => p.id === assignment.profileId)!;
          expect(['merchant', 'vagabond']).toContain(profile.category);
        }
      }
    }
  });

  it('prefers non-anchor islands over anchor quest-giver islands when non-anchor options are available', () => {
    // 8 islands: 5 non-anchor, 3 anchor -> all 4 wanderers should stay off anchor islands
    const eightIslands = [
      { gx: 2, gy: 2 }, // non-anchor
      { gx: 2, gy: 1 }, // anchor (farmer)
      { gx: 2, gy: 3 }, // anchor (fisherman)
      { gx: 3, gy: 2 }, // anchor (blacksmith)
      { gx: 1, gy: 1 }, // non-anchor
      { gx: 0, gy: 0 }, // non-anchor
      { gx: 4, gy: 0 }, // non-anchor
      { gx: 3, gy: 3 }, // non-anchor
    ];

    for (let day = 1; day <= 8; day++) {
      const result = assignWanderingNpcsToIslands(fullCast, {
        dayNumber: day,
        period: 'morning',
        isRaining: false,
        unlockedIslands: eightIslands,
      });

      expect(result.size).toBe(4);
      for (const assignment of result.values()) {
        const spec = getIslandAt(assignment.targetGx, assignment.targetGy);
        expect(spec?.npc).toBeUndefined();
      }
    }

    // With 2 non-anchor islands + 2 anchor islands and only 2 wanderers, both pick non-anchor islands
    const subsetWanderers = fullCast.filter(
      (p) => p.id === 'merchant_1' || p.id === 'vagabond_1',
    );
    const mixedFour = [
      { gx: 2, gy: 1 }, // anchor
      { gx: 2, gy: 3 }, // anchor
      { gx: 2, gy: 2 }, // non-anchor
      { gx: 1, gy: 1 }, // non-anchor
    ];

    for (let day = 1; day <= 4; day++) {
      const result = assignWanderingNpcsToIslands(subsetWanderers, {
        dayNumber: day,
        period: 'midday',
        isRaining: false,
        unlockedIslands: mixedFour,
      });

      expect(result.size).toBe(2);
      for (const assignment of result.values()) {
        const spec = getIslandAt(assignment.targetGx, assignment.targetGy);
        expect(spec?.npc).toBeUndefined();
      }
    }
  });

  it('handles empty or duplicate unlockedIslands gracefully without exceeding unique island count', () => {
    const empty = assignWanderingNpcsToIslands(fullCast, {
      dayNumber: 1,
      period: 'midday',
      isRaining: false,
      unlockedIslands: [],
    });
    expect(empty.size).toBe(0);

    const duplicated = assignWanderingNpcsToIslands(fullCast, {
      dayNumber: 1,
      period: 'midday',
      isRaining: true,
      unlockedIslands: [
        { gx: 2, gy: 2 },
        { gx: 2, gy: 2 },
      ],
    });
    expect(duplicated.size).toBe(1);
    const [only] = Array.from(duplicated.values());
    expect(only.schedule.wantsShelter).toBe(true);
    expect(only.targetGx).toBe(2);
    expect(only.targetGy).toBe(2);
  });
});

describe('NPC Personal Space & Live Separation Steering Helpers', () => {
  it('exposes expected separation constants and anchor vs regular thresholds', () => {
    expect(MIN_NPC_PERSONAL_SPACE_PX).toBe(48);
    expect(ANCHOR_QUEST_GIVER_BUFFER_PX).toBe(64);
    expect(getRequiredNpcSeparationPx({ isAnchor: false })).toBe(48);
    expect(getRequiredNpcSeparationPx({})).toBe(48);
    expect(getRequiredNpcSeparationPx({ isAnchor: true })).toBe(64);
  });

  it('isSpotRespectingNpcSpace rejects spots < 48px from regular NPCs and < 64px from anchors, ignoring self and sleeping peers', () => {
    const peers = [
      { id: 'farmer', x: 100, y: 100, isAnchor: true, sleeping: false },
      { id: 'family_farmer', x: 300, y: 100, isAnchor: false, sleeping: false },
      { id: 'sleeping_npc', x: 500, y: 100, isAnchor: true, sleeping: true },
    ];

    // Anchor at (100, 100): < 64px rejected, >= 64px accepted
    expect(isSpotRespectingNpcSpace(150, 100, 'merchant_1', peers)).toBe(false); // 50px < 64px
    expect(isSpotRespectingNpcSpace(163.9, 100, 'merchant_1', peers)).toBe(false);
    expect(isSpotRespectingNpcSpace(164, 100, 'merchant_1', peers)).toBe(true); // exact 64px boundary

    // Regular peer at (300, 100): < 48px rejected, >= 48px accepted
    expect(isSpotRespectingNpcSpace(347, 100, 'merchant_1', peers)).toBe(false);
    expect(isSpotRespectingNpcSpace(348, 100, 'merchant_1', peers)).toBe(true);

    // Sleeping peer ignored even at 0px
    expect(isSpotRespectingNpcSpace(500, 100, 'merchant_1', peers)).toBe(true);

    // Self ignored even at 0px
    expect(isSpotRespectingNpcSpace(100, 100, 'farmer', peers)).toBe(true);
    expect(isSpotRespectingNpcSpace(300, 100, 'family_farmer', peers)).toBe(true);
  });

  it('computeNpcSeparationVector returns uncrowded outside buffers and unit steering away when inside buffer', () => {
    const peers = [
      { id: 'farmer', x: 100, y: 100, isAnchor: true, sleeping: false },
      { id: 'family_farmer', x: 300, y: 100, isAnchor: false, sleeping: false },
      { id: 'sleeping_peer', x: 100, y: 100, isAnchor: false, sleeping: true },
    ];

    // Outside anchor buffer (70px >= 64px)
    const outside = computeNpcSeparationVector(
      { id: 'merchant_1', x: 170, y: 100 },
      peers,
    );
    expect(outside.crowded).toBe(false);
    expect(outside.dx).toBe(0);
    expect(outside.dy).toBe(0);
    expect(outside.nearestDist).toBeCloseTo(70, 5);

    // Inside anchor buffer (52px < 64px, even though > 48px regular space)
    const insideAnchor = computeNpcSeparationVector(
      { id: 'merchant_1', x: 152, y: 100 },
      peers,
    );
    expect(insideAnchor.crowded).toBe(true);
    expect(insideAnchor.dx).toBeCloseTo(1, 5);
    expect(insideAnchor.dy).toBeCloseTo(0, 5);
    expect(Math.hypot(insideAnchor.dx, insideAnchor.dy)).toBeCloseTo(1, 5);
    expect(insideAnchor.nearestDist).toBeCloseTo(52, 5);

    // Outside regular peer buffer at 52px (>= 48px)
    const outsideRegular = computeNpcSeparationVector(
      { id: 'merchant_1', x: 352, y: 100 },
      peers,
    );
    expect(outsideRegular.crowded).toBe(false);
    expect(outsideRegular.dx).toBe(0);
    expect(outsideRegular.dy).toBe(0);
    expect(outsideRegular.nearestDist).toBeCloseTo(52, 5);

    // Inside regular peer buffer diagonally
    const insideRegular = computeNpcSeparationVector(
      { id: 'merchant_1', x: 280, y: 120 },
      peers,
    );
    expect(insideRegular.crowded).toBe(true);
    expect(Math.hypot(insideRegular.dx, insideRegular.dy)).toBeCloseTo(1, 5);
    expect(insideRegular.dx).toBeLessThan(0);
    expect(insideRegular.dy).toBeGreaterThan(0);
    expect(insideRegular.dx).toBeCloseTo(-Math.SQRT1_2, 5);
    expect(insideRegular.dy).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('computeNpcSeparationVector handles zero-distance overlap and no-awake-peers safely', () => {
    const overlap = computeNpcSeparationVector(
      { id: 'merchant_1', x: 100, y: 100 },
      [{ id: 'farmer', x: 100, y: 100, isAnchor: true }],
    );
    expect(overlap.crowded).toBe(true);
    expect(overlap.dx).toBe(1);
    expect(overlap.dy).toBe(0);
    expect(Math.hypot(overlap.dx, overlap.dy)).toBeCloseTo(1, 5);
    expect(overlap.nearestDist).toBe(0);

    const alone = computeNpcSeparationVector(
      { id: 'merchant_1', x: 100, y: 100 },
      [
        { id: 'merchant_1', x: 100, y: 100 },
        { id: 'sleeper', x: 105, y: 100, sleeping: true },
      ],
    );
    expect(alone.crowded).toBe(false);
    expect(alone.dx).toBe(0);
    expect(alone.dy).toBe(0);
    expect(alone.nearestDist).toBe(Infinity);
  });
});
