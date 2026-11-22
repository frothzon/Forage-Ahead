import { describe, expect, it } from 'vitest';
import {
  OUTDOOR_NPC_BUILDINGS,
  computeHouseRoofEaveFrame,
  computeHouseRoofFrame,
  computeHouseWallFrame,
  computeWallCollisionBox,
  groupConnectedHouseTiles,
  hasAll4CardinalHouseNeighbors,
} from '../src/world/OutdoorBuildingStamps';

describe('OutdoorBuildingStamps', () => {
  it('defines valid outdoor tile-built stamps for all 4 NPC buildings', () => {
    const themes = ['farmer', 'blacksmith', 'alchemist', 'fisherman'] as const;
    for (const theme of themes) {
      const stamp = OUTDOOR_NPC_BUILDINGS[theme];
      expect(stamp.width).toBeGreaterThanOrEqual(4);
      expect(stamp.height).toBeGreaterThanOrEqual(4);

      const floors = stamp.placements.filter((p) => p.type === 'house_floor');
      const doors = stamp.placements.filter((p) => p.type === 'house_door');
      const walls = stamp.placements.filter((p) => p.type === 'house_wall');

      expect(floors.length).toBeGreaterThanOrEqual(8);
      expect(doors.length).toBeGreaterThanOrEqual(2);
      expect(walls.length).toBeGreaterThanOrEqual(8);
      // Floor must never be placed on outside perimeter walls
      const minX = Math.min(...walls.map((w) => w.lx));
      const maxX = Math.max(...walls.map((w) => w.lx));
      const minY = Math.min(...walls.map((w) => w.ly));
      const maxY = Math.max(...walls.map((w) => w.ly));
      const outsideWallKeys = new Set(
        walls
          .filter((w) => w.lx === minX || w.lx === maxX || w.ly === minY || w.ly === maxY)
          .map((w) => `${w.lx},${w.ly}`),
      );
      expect(floors.some((f) => outsideWallKeys.has(`${f.lx},${f.ly}`))).toBe(false);

      // Verify every room interior and interactive prop is reachable via BFS from the front door
      const solidSet = new Set(
        stamp.placements
          .filter(
            (p) =>
              p.type === 'house_wall' ||
              p.type === 'chest' ||
              p.type === 'furniture_bed' ||
              p.type === 'furniture_table' ||
              p.type === 'furnace' ||
              p.type === 'anvil' ||
              p.type === 'alchemy_lab' ||
              p.type === 'water_well',
          )
          .map((p) => `${p.lx},${p.ly}`),
      );
      const walkableFloors = new Set(
        floors.map((f) => `${f.lx},${f.ly}`).filter((k) => !solidSet.has(k)),
      );
      const startKey = `${stamp.doorLx},${stamp.doorLy}`;
      walkableFloors.add(startKey);
      const visited = new Set<string>([startKey]);
      const queue = [startKey];
      while (queue.length > 0) {
        const cur = queue.pop()!;
        const [cx, cy] = cur.split(',').map(Number);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nk = `${cx + dx},${cy + dy}`;
          if (walkableFloors.has(nk) && !visited.has(nk)) {
            visited.add(nk);
            queue.push(nk);
          }
        }
      }
      // Every interactive prop must be adjacent to a reachable walkable floor tile
      const props = stamp.placements.filter(
        (p) =>
          p.type === 'chest' ||
          p.type === 'furniture_bed' ||
          p.type === 'furnace' ||
          p.type === 'anvil' ||
          p.type === 'alchemy_lab' ||
          p.type === 'water_well',
      );
      expect(props.length).toBeGreaterThanOrEqual(1);
      for (const pr of props) {
        const adjReachable = [
          `${pr.lx + 1},${pr.ly}`,
          `${pr.lx - 1},${pr.ly}`,
          `${pr.lx},${pr.ly + 1}`,
          `${pr.lx},${pr.ly - 1}`,
        ].some((k) => visited.has(k));
        expect(adjReachable).toBe(true);
      }
    }
  });

  it('computes valid in-bounds wall and roof autotile frames', () => {
    for (let mask = 0; mask < 16; mask++) {
      const hasN = (mask & 1) !== 0;
      const hasS = (mask & 2) !== 0;
      const hasW = (mask & 4) !== 0;
      const hasE = (mask & 8) !== 0;
      const wallFrame = computeHouseWallFrame(hasN, hasS, hasW, hasE);
      expect(wallFrame).toBeGreaterThanOrEqual(0);
      expect(wallFrame).toBeLessThan(15);
    }
    // Roof split on 0..8: ridgeTy = floor((0+8)/2) - 1 = 3; top=8, ridge=15, lower=22; eaves=28/29/30
    expect(computeHouseRoofFrame(0, 0, 8)).toBe(8);
    expect(computeHouseRoofFrame(2, 0, 8)).toBe(8);
    expect(computeHouseRoofFrame(3, 0, 8)).toBe(15);
    expect(computeHouseRoofFrame(4, 0, 8)).toBe(22);
    expect(computeHouseRoofFrame(7, 0, 8)).toBe(22);
    expect(computeHouseRoofFrame(0, 0, 8, false, true)).toBe(7);
    expect(computeHouseRoofFrame(3, 0, 8, false, true)).toBe(14);
    expect(computeHouseRoofFrame(4, 0, 8, false, true)).toBe(21);
    expect(computeHouseRoofFrame(0, 0, 8, true, false)).toBe(9);
    expect(computeHouseRoofFrame(3, 0, 8, true, false)).toBe(16);
    expect(computeHouseRoofFrame(4, 0, 8, true, false)).toBe(23);
    expect(computeHouseRoofEaveFrame(false, true)).toBe(28);
    expect(computeHouseRoofEaveFrame(true, true)).toBe(29);
    expect(computeHouseRoofEaveFrame(true, false)).toBe(30);
  });

  it('groups connected house tiles into distinct building IDs for per-building roof fading', () => {
    const tiles = new Set([
      // Building A (2x2)
      '10,10',
      '11,10',
      '10,11',
      '11,11',
      // Building B (separate)
      '20,10',
      '21,10',
    ]);
    const groups = groupConnectedHouseTiles(tiles);
    expect(groups.get('10,10')).toBe(groups.get('11,11'));
    expect(groups.get('20,10')).toBe(groups.get('21,10'));
    expect(groups.get('10,10')).not.toBe(groups.get('20,10'));
  });

  it('produces watertight overlapping wall collision boxes with zero seams across corners and walls', () => {
    const nw = computeWallCollisionBox(0);
    const nWall = computeWallCollisionBox(1);
    const wWall = computeWallCollisionBox(5);
    const eWall = computeWallCollisionBox(7);

    // Adjacent horizontal wall & NW corner must overlap across the x = 8 tile boundary
    const nwRight = nw.offsetX + nw.halfW;
    const nLeft = 16 + nWall.offsetX - nWall.halfW;
    expect(nwRight).toBeGreaterThan(nLeft);

    // Adjacent vertical wall & NW corner must overlap across the y = 8 tile boundary
    const nwBottom = nw.offsetY + nw.halfH;
    const wTop = 16 + wWall.offsetY - wWall.halfH;
    expect(nwBottom).toBeGreaterThan(wTop);

    // Left (5) and right (7) vertical walls must be at least 11px thick so 7px probes cannot jump across
    expect(wWall.halfW * 2).toBeGreaterThanOrEqual(11);
    expect(eWall.halfW * 2).toBeGreaterThanOrEqual(11);

    // Corners must be flush with adjacent wall edges (zero outward snagging)
    const ne = computeWallCollisionBox(2);
    expect(nw.offsetX - nw.halfW).toBe(wWall.offsetX - wWall.halfW);
    expect(ne.offsetX + ne.halfW).toBe(eWall.offsetX + eWall.halfW);
    expect(nw.halfH).toBe(nWall.halfH);
    expect(ne.halfH).toBe(nWall.halfH);
  });

  it('classifies strictly interior house tiles via 4 cardinal neighbors while excluding all exterior walls', () => {
    const tiles = new Set<string>();
    for (let y = 0; y <= 4; y++) {
      for (let x = 0; x <= 4; x++) {
        tiles.add(`${x},${y}`);
      }
    }
    // Exterior perimeter walls & corners must all return false
    expect(hasAll4CardinalHouseNeighbors(tiles, 0, 0)).toBe(false);
    expect(hasAll4CardinalHouseNeighbors(tiles, 2, 0)).toBe(false);
    expect(hasAll4CardinalHouseNeighbors(tiles, 0, 2)).toBe(false);
    expect(hasAll4CardinalHouseNeighbors(tiles, 4, 2)).toBe(false);
    expect(hasAll4CardinalHouseNeighbors(tiles, 2, 4)).toBe(false);

    // Interior floors & interior dividers must return true
    expect(hasAll4CardinalHouseNeighbors(tiles, 1, 1)).toBe(true);
    expect(hasAll4CardinalHouseNeighbors(tiles, 2, 2)).toBe(true);
    expect(hasAll4CardinalHouseNeighbors(tiles, 3, 3)).toBe(true);
  });
});
