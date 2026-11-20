/** 4-bit doorway bitmask matching create_dungeon.txt: 1=East, 2=North, 4=West, 8=South. */
export const DIR_EAST = 1;
export const DIR_NORTH = 2;
export const DIR_WEST = 4;
export const DIR_SOUTH = 8;

export type CardinalDirBit = typeof DIR_EAST | typeof DIR_NORTH | typeof DIR_WEST | typeof DIR_SOUTH;

export const ALL_DIR_BITS: readonly CardinalDirBit[] = [DIR_EAST, DIR_NORTH, DIR_WEST, DIR_SOUTH];

export const DIR_DELTA: Record<CardinalDirBit, { dx: number; dy: number; opp: CardinalDirBit }> = {
  [DIR_EAST]: { dx: 1, dy: 0, opp: DIR_WEST },
  [DIR_NORTH]: { dx: 0, dy: -1, opp: DIR_EAST /* fixed below */ },
  [DIR_WEST]: { dx: -1, dy: 0, opp: DIR_EAST },
  [DIR_SOUTH]: { dx: 0, dy: 1, opp: DIR_NORTH },
};
// Ensure exact opposite bitmapping
DIR_DELTA[DIR_NORTH].opp = DIR_SOUTH;

export interface WfcRoomNode {
  id: number;
  gx: number;
  gy: number;
  mask: number;
  depth: number;
  parentId: number | null;
  childrenIds: number[];
  neighbors: number[];
  isLeaf: boolean;
}

export interface WfcRoomEdge {
  a: number;
  b: number;
  dirFromA: CardinalDirBit;
  dirFromB: CardinalDirBit;
}

export interface WfcRoomGraph {
  seed: number;
  gridWidth: number;
  gridHeight: number;
  grid: number[][];
  startId: number;
  rooms: WfcRoomNode[];
  edges: WfcRoomEdge[];
  bounds: { minGx: number; maxGx: number; minGy: number; maxGy: number };
}

export interface WfcGenerateOptions {
  gridWidth?: number;
  gridHeight?: number;
  minRooms: number;
  maxRooms: number;
  branchChance?: number;
  seed?: number;
}

export function createSeededRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VIRGIN = 16;

function runSingleWfcAttempt(
  gridW: number,
  gridH: number,
  minRooms: number,
  maxRooms: number,
  branchChance: number,
  rng: () => number,
): number[][] {
  const grid: number[][] = Array.from({ length: gridH }, () => Array(gridW).fill(0));
  for (let y = 1; y < gridH - 1; y++) {
    for (let x = 1; x < gridW - 1; x++) {
      grid[y][x] = VIRGIN;
    }
  }

  const pickRandomBit = (choices: CardinalDirBit[]): CardinalDirBit => {
    const idx = Math.floor(rng() * choices.length);
    return choices[Math.min(choices.length - 1, idx)];
  };

  const getVirginNeighbors = (gx: number, gy: number): CardinalDirBit[] => {
    const out: CardinalDirBit[] = [];
    for (const bit of ALL_DIR_BITS) {
      const { dx, dy } = DIR_DELTA[bit];
      if (grid[gy + dy]?.[gx + dx] === VIRGIN) out.push(bit);
    }
    return out;
  };

  const getNeighborForcedMask = (gx: number, gy: number): number => {
    let val = 0;
    for (const bit of ALL_DIR_BITS) {
      const { dx, dy, opp } = DIR_DELTA[bit];
      const nVal = grid[gy + dy]?.[gx + dx] ?? 0;
      if (nVal !== VIRGIN && (nVal & opp) > 0) {
        val |= bit;
      }
    }
    return val;
  };

  const frontier: Array<[number, number]> = [];
  let totalReserved = 1;
  const enqueueNeighbors = (gx: number, gy: number): void => {
    const val = grid[gy][gx];
    for (const bit of ALL_DIR_BITS) {
      if ((val & bit) === 0) continue;
      const nx = gx + DIR_DELTA[bit].dx;
      const ny = gy + DIR_DELTA[bit].dy;
      if (grid[ny]?.[nx] === VIRGIN) {
        grid[ny][nx] = 0; // Claimed into frontier
        frontier.push([nx, ny]);
        totalReserved++;
      }
    }
  };

  const startX = gridW >> 1;
  const startY = gridH >> 1;
  // Seed center with 1 exit (or 2 if minRooms >= 6 to encourage branching)
  const firstBit = pickRandomBit([...ALL_DIR_BITS]);
  grid[startY][startX] = firstBit;
  if (minRooms >= 6 && rng() < 0.65) {
    const rem = ALL_DIR_BITS.filter((b) => b !== firstBit);
    grid[startY][startX] |= pickRandomBit(rem);
  }
  enqueueNeighbors(startX, startY);

  for (let b = 0; b < frontier.length; b++) {
    const [cx, cy] = frontier[b];
    if (grid[cy][cx] !== 0) continue;

    const forced = getNeighborForcedMask(cx, cy);
    let newRoom = forced;
    if (totalReserved < maxRooms) {
      const virginDirs = getVirginNeighbors(cx, cy);
      if (virginDirs.length > 0) {
        const mustExpand = totalReserved < minRooms;
        if (mustExpand || rng() < 0.85) {
          newRoom |= pickRandomBit(virginDirs);
          grid[cy][cx] = newRoom;
          enqueueNeighbors(cx, cy);

          if (totalReserved < maxRooms && (totalReserved < minRooms || rng() < branchChance)) {
            const moreVirgin = getVirginNeighbors(cx, cy);
            if (moreVirgin.length > 0) {
              newRoom |= pickRandomBit(moreVirgin);
              grid[cy][cx] = newRoom;
              enqueueNeighbors(cx, cy);
            }
          }
        }
      }
    }
    grid[cy][cx] = newRoom | getNeighborForcedMask(cx, cy);
  }

  // Enforce symmetric doors in case a late branch opened toward an already-collapsed room
  for (let y = 1; y < gridH - 1; y++) {
    for (let x = 1; x < gridW - 1; x++) {
      const v = grid[y][x];
      if (v <= 0 || v === VIRGIN) continue;
      let clean = 0;
      for (const bit of ALL_DIR_BITS) {
        if ((v & bit) === 0) continue;
        const { dx, dy, opp } = DIR_DELTA[bit];
        const nv = grid[y + dy]?.[x + dx] ?? 0;
        if (nv > 0 && nv !== VIRGIN && (nv & opp) > 0) {
          clean |= bit;
        }
      }
      grid[y][x] = clean;
    }
  }

  return grid;
}

/**
 * Generates a connected 4-bit WFC room graph with guaranteed room count in `[minRooms, maxRooms]`,
 * symmetric doorways, and BFS tree/depth metadata.
 */
export function generateWfcRoomGraph(options: WfcGenerateOptions): WfcRoomGraph {
  const minRooms = Math.max(1, options.minRooms);
  const maxRooms = Math.max(minRooms, options.maxRooms);
  const gridWidth = options.gridWidth ?? Math.max(11, maxRooms * 2 + 3);
  const gridHeight = options.gridHeight ?? Math.max(11, maxRooms * 2 + 3);
  const branchChance = options.branchChance ?? 0.25;
  const baseSeed = options.seed ?? Date.now();

  for (let attempt = 0; attempt < 96; attempt++) {
    const attemptSeed = (baseSeed + attempt * 7919) >>> 0;
    const rng = createSeededRng(attemptSeed);
    const grid = runSingleWfcAttempt(gridWidth, gridHeight, minRooms, maxRooms, branchChance, rng);

    const startX = gridWidth >> 1;
    const startY = gridHeight >> 1;
    if (grid[startY][startX] <= 0 || grid[startY][startX] >= VIRGIN) continue;

    // Collect connected component from start via BFS
    const coordToId = new Map<string, number>();
    const rooms: WfcRoomNode[] = [];
    const queue: number[] = [];

    const startNode: WfcRoomNode = {
      id: 0,
      gx: startX,
      gy: startY,
      mask: grid[startY][startX],
      depth: 0,
      parentId: null,
      childrenIds: [],
      neighbors: [],
      isLeaf: false,
    };
    coordToId.set(`${startX},${startY}`, 0);
    rooms.push(startNode);
    queue.push(0);

    for (let qi = 0; qi < queue.length; qi++) {
      const cur = rooms[queue[qi]];
      for (const bit of ALL_DIR_BITS) {
        if ((cur.mask & bit) === 0) continue;
        const nx = cur.gx + DIR_DELTA[bit].dx;
        const ny = cur.gy + DIR_DELTA[bit].dy;
        const nMask = grid[ny]?.[nx] ?? 0;
        if (nMask <= 0 || nMask >= VIRGIN) continue;
        const key = `${nx},${ny}`;
        let nid = coordToId.get(key);
        if (nid === undefined) {
          nid = rooms.length;
          coordToId.set(key, nid);
          const node: WfcRoomNode = {
            id: nid,
            gx: nx,
            gy: ny,
            mask: nMask,
            depth: cur.depth + 1,
            parentId: cur.id,
            childrenIds: [],
            neighbors: [],
            isLeaf: false,
          };
          rooms.push(node);
          cur.childrenIds.push(nid);
          queue.push(nid);
        }
        if (!cur.neighbors.includes(nid)) cur.neighbors.push(nid);
      }
    }

    if (rooms.length < minRooms || rooms.length > maxRooms) continue;

    // Build deduplicated edge list & bounds
    const edges: WfcRoomEdge[] = [];
    const seenEdges = new Set<string>();
    let minGx = Infinity;
    let maxGx = -Infinity;
    let minGy = Infinity;
    let maxGy = -Infinity;

    for (const r of rooms) {
      r.isLeaf = r.id !== 0 && r.neighbors.length <= 1;
      minGx = Math.min(minGx, r.gx);
      maxGx = Math.max(maxGx, r.gx);
      minGy = Math.min(minGy, r.gy);
      maxGy = Math.max(maxGy, r.gy);
      for (const bit of ALL_DIR_BITS) {
        if ((r.mask & bit) === 0) continue;
        const nx = r.gx + DIR_DELTA[bit].dx;
        const ny = r.gy + DIR_DELTA[bit].dy;
        const nid = coordToId.get(`${nx},${ny}`);
        if (nid === undefined) continue;
        const edgeKey = r.id < nid ? `${r.id}-${nid}` : `${nid}-${r.id}`;
        if (!seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey);
          edges.push({
            a: r.id,
            b: nid,
            dirFromA: bit,
            dirFromB: DIR_DELTA[bit].opp,
          });
        }
      }
    }

    return {
      seed: attemptSeed,
      gridWidth,
      gridHeight,
      grid,
      startId: 0,
      rooms,
      edges,
      bounds: { minGx, maxGx, minGy, maxGy },
    };
  }

  throw new Error(`Failed to generate WFC room graph (${minRooms}..${maxRooms} rooms) after 96 attempts`);
}
