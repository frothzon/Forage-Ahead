export const INNER_ISLAND_SIZE = 24; // inside a 28x28 cell (2-tile water margin on each side)

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GeneratedIslandMask {
  fillRate: number;
  actualFillRatio: number;
  holesCarved: number;
  land: boolean[][]; // [INNER_ISLAND_SIZE][INNER_ISLAND_SIZE]
}

/**
 * Generates an odd-shaped, contiguous 24x24 island landmass:
 * 1. Picks a per-island fill rate between 65% and 85%.
 * 2. Seeds a central core and randomly fills remaining cells at fillRate.
 * 3. Carves 0-4 random cutout holes (width & height <= 25% of island dimensions) before smoothing.
 * 4. Runs cellular-automata smoothing passes to eliminate isolated/spiky cells.
 * 5. Runs BFS flood-fill from the center so the entire island is 100% contiguous.
 * 6. Pads thin 1-tile bridges/diagonal pinches so 3x3 coastline auto-tiles stay seamless.
 */
export function generateIslandMask(gx: number, gy: number, worldSeed = 1337): GeneratedIslandMask {
  const seed = (worldSeed * 73856093) ^ ((gx + 11) * 19349663) ^ ((gy + 29) * 83492791);
  const rng = mulberry32(seed);
  const fillRate = 0.65 + rng() * 0.2; // 65% - 85%

  let grid: boolean[][] = Array.from({ length: INNER_ISLAND_SIZE }, () =>
    Array.from({ length: INNER_ISLAND_SIZE }, () => false),
  );

  const mid = (INNER_ISLAND_SIZE - 1) / 2;
  const half = INNER_ISLAND_SIZE / 2;
  const maxRadius = Math.SQRT2 * (INNER_ISLAND_SIZE * 0.46);

  // 1. Seed random fill + guaranteed center core (4x4 for 12, 6x6 for 24)
  for (let y = 0; y < INNER_ISLAND_SIZE; y++) {
    for (let x = 0; x < INNER_ISLAND_SIZE; x++) {
      const inCore = Math.abs(x - mid) <= 3 && Math.abs(y - mid) <= 3;
      if (inCore) {
        grid[y][x] = true;
      } else {
        // Slight radial bias so edges feel like natural coastlines while keeping odd shapes
        const distFromCenter = Math.hypot(x - mid, y - mid) / maxRadius;
        const prob = Math.max(0.22, Math.min(0.95, fillRate + (0.42 - distFromCenter) * 0.26));
        grid[y][x] = rng() < prob;
      }
    }
  }

  // Carve 0-4 random cutout holes (each <= 25% width and <= 25% height) BEFORE smoothing
  const maxHoleW = Math.max(1, Math.floor(INNER_ISLAND_SIZE * 0.25));
  const maxHoleH = Math.max(1, Math.floor(INNER_ISLAND_SIZE * 0.25));
  const holeCount = Math.floor(rng() * 5); // 0..4 inclusive
  for (let h = 0; h < holeCount; h++) {
    const holeW = 1 + Math.floor(rng() * maxHoleW);
    const holeH = 1 + Math.floor(rng() * maxHoleH);
    const hx = Math.floor(rng() * (INNER_ISLAND_SIZE - holeW + 1));
    const hy = Math.floor(rng() * (INNER_ISLAND_SIZE - holeH + 1));
    for (let y = hy; y < hy + holeH; y++) {
      for (let x = hx; x < hx + holeW; x++) {
        // Keep tiny 2x2 spawn pin intact
        if (Math.abs(x - mid) <= 1 && Math.abs(y - mid) <= 1) continue;
        grid[y][x] = false;
      }
    }
  }

  const countNeighbors8 = (g: boolean[][], x: number, y: number): number => {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < INNER_ISLAND_SIZE && ny < INNER_ISLAND_SIZE && g[ny][nx]) {
          n += 1;
        }
      }
    }
    return n;
  };

  // 2. Cellular automata smoothing passes (3 passes)
  for (let pass = 0; pass < 3; pass++) {
    const next = grid.map((row) => [...row]);
    for (let y = 0; y < INNER_ISLAND_SIZE; y++) {
      for (let x = 0; x < INNER_ISLAND_SIZE; x++) {
        if (Math.abs(x - mid) <= 1.5 && Math.abs(y - mid) <= 1.5) {
          next[y][x] = true;
          continue;
        }
        const n8 = countNeighbors8(grid, x, y);
        if (grid[y][x]) {
          next[y][x] = n8 >= 3;
        } else {
          next[y][x] = n8 >= 5;
        }
      }
    }
    grid = next;
  }

  // 3. Remove diagonal checkerboards & thin 1-tile spikes so 3x3 auto-tiles never leave seams
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < INNER_ISLAND_SIZE - 1; y++) {
      for (let x = 0; x < INNER_ISLAND_SIZE - 1; x++) {
        const a = grid[y][x];
        const b = grid[y][x + 1];
        const c = grid[y + 1][x];
        const d = grid[y + 1][x + 1];
        if (a && d && !b && !c) grid[y][x + 1] = true;
        if (b && c && !a && !d) grid[y][x] = true;
      }
    }
    const pruned = grid.map((row) => [...row]);
    for (let y = 0; y < INNER_ISLAND_SIZE; y++) {
      for (let x = 0; x < INNER_ISLAND_SIZE; x++) {
        if (!grid[y][x]) continue;
        const ortho =
          (y > 0 && grid[y - 1][x] ? 1 : 0) +
          (y < INNER_ISLAND_SIZE - 1 && grid[y + 1][x] ? 1 : 0) +
          (x > 0 && grid[y][x - 1] ? 1 : 0) +
          (x < INNER_ISLAND_SIZE - 1 && grid[y][x + 1] ? 1 : 0);
        if (ortho <= 1) pruned[y][x] = false;
      }
    }
    grid = pruned;
  }

  // 4. BFS Flood-fill from center to guarantee 100% contiguous landmass (no orphan cells)
  const visited: boolean[][] = Array.from({ length: INNER_ISLAND_SIZE }, () =>
    Array.from({ length: INNER_ISLAND_SIZE }, () => false),
  );
  const sx = half - 1;
  const sy = half - 1;
  const queue: Array<[number, number]> = [[sx, sy]];
  grid[sy][sx] = true;
  visited[sy][sx] = true;

  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
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
        grid[ny][nx] &&
        !visited[ny][nx]
      ) {
        visited[ny][nx] = true;
        queue.push([nx, ny]);
      }
    }
  }

  let landCount = 0;
  for (let y = 0; y < INNER_ISLAND_SIZE; y++) {
    for (let x = 0; x < INNER_ISLAND_SIZE; x++) {
      if (!visited[y][x]) grid[y][x] = false;
      if (grid[y][x]) landCount += 1;
    }
  }

  return {
    fillRate,
    actualFillRatio: landCount / (INNER_ISLAND_SIZE * INNER_ISLAND_SIZE),
    holesCarved: holeCount,
    land: grid,
  };
}
