import { describe, expect, it } from 'vitest';
import {
  ALL_PUZZLE_KINDS,
  buildDungeonLayout,
  verifyDungeonSolvable,
  type DungeonPuzzleKind,
  type ExitWallDir,
} from '../src/world/DungeonLayoutBuilder';
import { DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST } from '../src/world/WfcRoomGraph';
import { detailDungeonRoom } from '../src/world/DungeonDetailer';
import { DUNGEON_THEME_VISUALS } from '../src/data/dungeonTilesets';

const EXIT_WALL_TO_BIT: Record<ExitWallDir, number> = {
  north: DIR_NORTH,
  south: DIR_SOUTH,
  west: DIR_WEST,
  east: DIR_EAST,
};

describe('DungeonSolvabilityHarness (320 seeded dungeons)', () => {
  it('builds 320 deterministic, solvable dungeons across room counts 7..10 with solid start exit walls and all 23 puzzle kinds', () => {
    const seenPuzzles = new Set<DungeonPuzzleKind>();
    const theme = Object.values(DUNGEON_THEME_VISUALS)[0];

    for (let seed = 1000; seed <= 1319; seed++) {
      const targetRooms = 7 + ((seed - 1000) % 4);
      const layout = buildDungeonLayout(seed, targetRooms, targetRooms);

      expect(layout.rooms.length).toBe(targetRooms);
      expect(verifyDungeonSolvable(layout)).toBe(true);

      const startRoom = layout.rooms.find((r) => r.role === 'start');
      expect(startRoom).toBeDefined();
      expect(startRoom!.exitWall).toBeDefined();
      const exitBit = EXIT_WALL_TO_BIT[startRoom!.exitWall!];
      expect((startRoom!.mask & exitBit) === 0).toBe(true);

      // Verify determinism
      const repeat = buildDungeonLayout(seed, targetRooms, targetRooms);
      expect(repeat).toEqual(layout);

      // Verify start room detailing keeps Exit Door tile unobstructed
      const detail = detailDungeonRoom({
        roomW: 16,
        roomH: 12,
        mask: startRoom!.mask,
        role: startRoom!.role,
        exitWall: startRoom!.exitWall,
        theme,
        seed: layout.seed + startRoom!.id * 997,
        propCount: startRoom!.breakableCount,
      });
      const exitTile =
        startRoom!.exitWall === 'north'
          ? '8,1'
          : startRoom!.exitWall === 'south'
            ? '8,10'
            : startRoom!.exitWall === 'west'
              ? '1,6'
              : '14,6';
      expect(detail.blockedSet.has(exitTile)).toBe(false);

      for (const room of layout.rooms) {
        if (room.puzzleKind) {
          seenPuzzles.add(room.puzzleKind);
        }
      }
    }

    for (const kind of ALL_PUZZLE_KINDS) {
      expect(seenPuzzles.has(kind)).toBe(true);
    }
    expect(seenPuzzles.size).toBe(ALL_PUZZLE_KINDS.length);
  });
});
