import { describe, expect, it } from 'vitest';
import { DUNGEON_THEME_VISUALS, type DungeonThemeKey } from '../src/data/dungeonTilesets';
import { detailDungeonRoom } from '../src/world/DungeonDetailer';
import { DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST } from '../src/world/WfcRoomGraph';

describe('DungeonDetailer', () => {
  it('places floor details, rugs, pillars, and props without blocking doorways or center across 50 seeds', () => {
    const themes = Object.keys(DUNGEON_THEME_VISUALS) as DungeonThemeKey[];
    for (let s = 1; s <= 50; s++) {
      const theme = DUNGEON_THEME_VISUALS[themes[s % themes.length]];
      const plan = detailDungeonRoom({
        roomW: 16,
        roomH: 12,
        mask: DIR_NORTH | DIR_SOUTH | DIR_EAST | DIR_WEST,
        role: s % 2 === 0 ? 'combat' : 'key_puzzle',
        theme,
        seed: s * 409,
        reservedTiles: [{ lx: 4, ly: 4 }],
      });

      expect(plan.floors.length).toBe(14 * 10);
      expect(plan.props.length).toBeGreaterThanOrEqual(3);
      // Center 3x3 (7..9, 5..7) and doorways must never be blocked
      expect(plan.blockedSet.has('8,6')).toBe(false);
      expect(plan.blockedSet.has('8,1')).toBe(false);
      expect(plan.blockedSet.has('8,10')).toBe(false);
      expect(plan.blockedSet.has('1,6')).toBe(false);
      expect(plan.blockedSet.has('14,6')).toBe(false);
      expect(plan.blockedSet.has('4,4')).toBe(false);
    }
  });
});
