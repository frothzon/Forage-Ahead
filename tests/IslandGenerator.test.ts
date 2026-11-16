import { describe, it, expect } from 'vitest';
import { INNER_ISLAND_SIZE, generateIslandMask } from '../src/world/IslandGenerator';

describe('IslandGenerator', () => {
  it('generates odd-shaped contiguous islands across all 25 slots with 65-85% target fill rate', () => {
    const shapes = new Set<string>();
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        const res = generateIslandMask(gx, gy, 1337);
        expect(res.fillRate).toBeGreaterThanOrEqual(0.65);
        expect(res.fillRate).toBeLessThanOrEqual(0.85);
        expect(res.actualFillRatio).toBeGreaterThanOrEqual(0.4);

        // Verify 100% 4-connected contiguity via BFS
        let totalLand = 0;
        let firstLand: [number, number] | null = null;
        for (let y = 0; y < INNER_ISLAND_SIZE; y++) {
          for (let x = 0; x < INNER_ISLAND_SIZE; x++) {
            if (res.land[y][x]) {
              totalLand += 1;
              if (!firstLand) firstLand = [x, y];
            }
          }
        }
        expect(firstLand).not.toBeNull();
        const visited = new Set<string>();
        const q = [firstLand!];
        visited.add(`${firstLand![0]},${firstLand![1]}`);
        while (q.length > 0) {
          const [cx, cy] = q.shift()!;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (
              nx >= 0 &&
              ny >= 0 &&
              nx < INNER_ISLAND_SIZE &&
              ny < INNER_ISLAND_SIZE &&
              res.land[ny][nx] &&
              !visited.has(`${nx},${ny}`)
            ) {
              visited.add(`${nx},${ny}`);
              q.push([nx, ny]);
            }
          }
        }
        expect(visited.size).toBe(totalLand);

        shapes.add(res.land.map((r) => r.map((v) => (v ? '1' : '0')).join('')).join('|'));
      }
    }
    // Verify high diversity (all 25 islands have distinct silhouettes)
    expect(shapes.size).toBe(25);
  });
});
