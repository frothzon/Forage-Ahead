import { describe, expect, it } from 'vitest';
import { buildDungeonLayout, isDungeonLayoutSolvable } from '../src/world/DungeonLayoutBuilder';
import { buildHouseLayout, HOUSE_THEME_SPECS, type HouseThemeId } from '../src/world/HouseLayoutBuilder';
import { ALL_DIR_BITS, DIR_DELTA, generateWfcRoomGraph } from '../src/world/WfcRoomGraph';

describe('WfcRoomGraph', () => {
  it('generates 7-10 room connected graphs with symmetric doorways across 100 seeds', () => {
    for (let s = 1; s <= 100; s++) {
      const g = generateWfcRoomGraph({ minRooms: 7, maxRooms: 10, branchChance: 0.35, seed: s * 97 });
      expect(g.rooms.length).toBeGreaterThanOrEqual(7);
      expect(g.rooms.length).toBeLessThanOrEqual(10);

      const byCoord = new Map(g.rooms.map((r) => [`${r.gx},${r.gy}`, r]));
      for (const r of g.rooms) {
        for (const bit of ALL_DIR_BITS) {
          if ((r.mask & bit) === 0) continue;
          const { dx, dy, opp } = DIR_DELTA[bit];
          const nb = byCoord.get(`${r.gx + dx},${r.gy + dy}`);
          expect(nb).toBeDefined();
          expect((nb!.mask & opp) > 0).toBe(true);
        }
      }
    }
  });
});

describe('DungeonLayoutBuilder', () => {
  it('builds solvable 7-10 room Zelda-style dungeons with boss, miniboss, and puzzles across 100 seeds', () => {
    for (let s = 1; s <= 100; s++) {
      const layout = buildDungeonLayout(s * 131, 7, 10);
      expect(layout.rooms.length).toBeGreaterThanOrEqual(7);
      expect(layout.rooms.length).toBeLessThanOrEqual(10);
      expect(layout.rooms.some((r) => r.role === 'start')).toBe(true);
      expect(layout.rooms.some((r) => r.role === 'boss')).toBe(true);
      expect(layout.rooms.some((r) => r.role === 'miniboss')).toBe(true);
      expect(layout.rooms.some((r) => r.puzzleKind !== undefined)).toBe(true);
      expect(layout.doors.some((d) => d.lock === 'boss_key')).toBe(true);
      expect(isDungeonLayoutSolvable(layout)).toBe(true);
    }
  });
});

describe('HouseLayoutBuilder', () => {
  it('builds 2-3 room layouts for all 4 NPC house themes', () => {
    const themes = Object.keys(HOUSE_THEME_SPECS) as HouseThemeId[];
    expect(themes).toHaveLength(4);
    for (const t of themes) {
      const h = buildHouseLayout(t);
      expect(h.rooms.length).toBeGreaterThanOrEqual(2);
      expect(h.rooms.length).toBeLessThanOrEqual(3);
      expect(h.rooms[0].role).toBe('foyer');
    }
  });
});
