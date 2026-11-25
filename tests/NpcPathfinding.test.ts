import { describe, expect, it } from 'vitest';
import type { StructureType } from '../src/data/recipes';
import { OUTDOOR_NPC_BUILDINGS } from '../src/world/OutdoorBuildingStamps';
import { computeTilePath } from '../src/world/npcPathfinding';

const IMPASSABLE_HOUSE_TYPES = new Set<StructureType>([
  'house_wall',
  'chest',
  'furniture_table',
  'anvil',
  'furnace',
  'alchemy_lab',
  'water_well',
  'furniture_bed',
]);

describe('computeTilePath', () => {
  it('returns [goal] when start equals goal', () => {
    const path = computeTilePath(4, 7, 4, 7, () => false);
    expect(path).toEqual([{ tx: 4, ty: 7 }]);
  });

  it('navigates around a U-shaped wall to reach the goal', () => {
    // U-shaped wall blocking direct east path from (0,2) to (4,2)
    const walls = new Set<string>([
      '1,1', '2,1', '3,1',
      '3,2',
      '1,3', '2,3', '3,3',
    ]);
    const isPassable = (tx: number, ty: number) =>
      tx >= -2 && tx <= 6 && ty >= -2 && ty <= 6 && !walls.has(`${tx},${ty}`);

    const path = computeTilePath(0, 2, 4, 2, isPassable);
    expect(path.length).toBeGreaterThan(4);
    expect(path[path.length - 1]).toEqual({ tx: 4, ty: 2 });

    // Verify 4-connected steps, no start tile included, and no walls hit
    let prev = { tx: 0, ty: 2 };
    for (const step of path) {
      expect(walls.has(`${step.tx},${step.ty}`)).toBe(false);
      const manhattan = Math.abs(step.tx - prev.tx) + Math.abs(step.ty - prev.ty);
      expect(manhattan).toBe(1);
      prev = step;
    }
  });

  it('returns [] when target is unreachable or exceeds maxVisited', () => {
    const blocked = new Set<string>([
      '4,1', '4,3', '3,2', '5,2',
    ]);
    const path = computeTilePath(0, 2, 4, 2, (tx, ty) => !blocked.has(`${tx},${ty}`));
    expect(path).toEqual([]);

    const capped = computeTilePath(0, 0, 20, 0, () => true, 10);
    expect(capped).toEqual([]);
  });

  it('allows stepping onto an impassable goal tile such as a bed', () => {
    const path = computeTilePath(0, 0, 2, 0, (tx, ty) => !(tx === 2 && ty === 0));
    expect(path).toEqual([
      { tx: 1, ty: 0 },
      { tx: 2, ty: 0 },
    ]);
  });

  it('navigates into and back out of all 4 real NPC houses in OUTDOOR_NPC_BUILDINGS', () => {
    const themes = ['farmer', 'blacksmith', 'alchemist', 'fisherman'] as const;

    for (const theme of themes) {
      const stamp = OUTDOOR_NPC_BUILDINGS[theme];
      const wallTiles = new Set<string>();
      const impassableTiles = new Set<string>();

      for (const p of stamp.placements) {
        const key = `${p.lx},${p.ly}`;
        if (p.type === 'house_wall') {
          wallTiles.add(key);
        }
        if (IMPASSABLE_HOUSE_TYPES.has(p.type)) {
          impassableTiles.add(key);
        }
      }

      const isPassable = (tx: number, ty: number) => !impassableTiles.has(`${tx},${ty}`);

      const startTx = stamp.doorLx - 2;
      const startTy = stamp.doorLy + 1;

      const toBedPath = computeTilePath(
        startTx,
        startTy,
        stamp.bedLx,
        stamp.bedLy,
        isPassable,
      );

      expect(toBedPath.length).toBeGreaterThan(0);
      expect(toBedPath[toBedPath.length - 1]).toEqual({ tx: stamp.bedLx, ty: stamp.bedLy });
      expect(toBedPath.some((p) => wallTiles.has(`${p.tx},${p.ty}`))).toBe(false);
      expect(toBedPath.some((p) => p.tx === stamp.doorLx && p.ty === stamp.doorLy)).toBe(true);

      const toOutsidePath = computeTilePath(
        stamp.bedLx,
        stamp.bedLy,
        startTx,
        startTy,
        isPassable,
      );

      expect(toOutsidePath.length).toBeGreaterThan(0);
      expect(toOutsidePath[toOutsidePath.length - 1]).toEqual({ tx: startTx, ty: startTy });
      expect(toOutsidePath.some((p) => wallTiles.has(`${p.tx},${p.ty}`))).toBe(false);
      expect(toOutsidePath.some((p) => p.tx === stamp.doorLx && p.ty === stamp.doorLy)).toBe(true);
    }
  });
});
