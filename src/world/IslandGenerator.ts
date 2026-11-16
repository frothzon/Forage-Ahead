export const INNER_ISLAND_SIZE = 12; // inside a 14x14 cell (1-tile water margin on each side)

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
  land: boolean[][]; // [12][12]
}

/**
 * Generates an odd-shaped, contiguous 12x12 island landmass:
 * 1. Picks a per-island fill rate between 65% and 85%.
 * 2. Seeds a 3x3 center core and randomly fills remaining cells at fillRate.
 * 3. Runs cellular-automata smoothing passes to eliminate isolated/spiky cells.
 * 4. Runs BFS flood-fill from the center so the entire island is 100% contiguous.
 * 5. Pads thin 1-tile bridges/diagonal pinches so 3x3 coastline auto-tiles stay seamless.
 */
export function generateIslandMask(gx: number, gy: number, worldSeed = 1337): GeneratedIslandMask {
  const seed = (worldSeed * 73856093) ^ ((gx + 11) * 19349663) ^ ((gy + 29) * 83492791);
  const rng = mulberry32(seed);
  const fillRate = 0.65 + rng() * 0.2; // 65% - 85%

  let grid: boolean[][] = Array.from({ length: INNER_ISLAND_SIZE }, () =>
    Array.from({ length: INNER_ISLAND_SIZE }, () => false),
  );

  // 1. Seed random fill + guaranteed 4x4 core near center (4..7)
  for (let y = 0; y < INNER_ISLAND_SIZE; y++) {
    for (let x = 0; x < INNER_ISLAND_SIZE; x++) {
      const inCore = x >= 4 && x <= 7 && y >= 4 && y <= 7;
      if (inCore) {
        grid[y][x] = true;
      } else {
        // Slight radial bias so edges feel like natural coastlines while keeping odd shapes
        const distFromCenter = Math.hypot(x - 5.5, y - 5.5) / 7.8;
        const prob = Math.max(0.25, Math.min(0.95, fillRate + (0.4 - distFromCenter) * 0.25));
        grid[y][x] = rng() < prob;
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
        if (x >= 5 && x <= 6 && y >= 5 && y <= 6) {
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
    // Fix diagonal pinches: [1,0 / 0,1] or [0,1 / 1,0]
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
    // Prune 1-tile spurs with <= 1 orthogonal neighbor
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

  // 4. BFS Flood-fill from center (5, 5) to guarantee 100% contiguous landmass (no orphan cells)
  const visited: boolean[][] = Array.from({ length: INNER_ISLAND_SIZE }, () =>
    Array.from({ length: INNER_ISLAND_SIZE }, () => false),
  );
  const queue: Array<[number, number]> = [[5, 5]];
  grid[5][5] = true;
  visited[5][5] = true;

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
    land: grid,
  };
}
