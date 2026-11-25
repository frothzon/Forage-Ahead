import {
  createSeededRng,
  DIR_EAST,
  DIR_NORTH,
  DIR_SOUTH,
  DIR_WEST,
  generateWfcRoomGraph,
  type WfcRoomEdge,
  type WfcRoomGraph,
  type WfcRoomNode,
} from './WfcRoomGraph';

export type DungeonRoomRole =
  | 'start'
  | 'combat'
  | 'puzzle'
  | 'key_puzzle'
  | 'key_combat'
  | 'miniboss'
  | 'treasure'
  | 'boss';

export type ExitWallDir = 'north' | 'south' | 'west' | 'east';

export const ALL_PUZZLE_KINDS = [
  'sigils',
  'braziers',
  'ambush',
  'ordered_sigils',
  'timed_plates',
  'mirror_plates',
  'memory_runes',
  'safe_path',
  'push_block_single',
  'push_block_twin',
  'ice_slide_block',
  'bridge_lever',
  'bomb_rubble',
  'brazier_chain',
  'frost_vents',
  'lightning_pylons',
  'shadow_lanterns',
  'powder_keg_chain',
  'crystal_totems',
  'bullseye_targets',
  'sentinel_statue',
  'lockpick_vault',
  'spike_gauntlet',
] as const;

export type DungeonPuzzleKind = (typeof ALL_PUZZLE_KINDS)[number];

export type DungeonDoorLock = 'open' | 'small_key' | 'boss_key' | 'combat_seal';

export interface DungeonRoomPlan {
  id: number;
  gx: number;
  gy: number;
  mask: number;
  depth: number;
  role: DungeonRoomRole;
  exitWall?: ExitWallDir;
  puzzleKind?: DungeonPuzzleKind;
  grantsSmallKey: boolean;
  grantsBossKey: boolean;
  hasTreasureChest: boolean;
  lockOnClear: boolean;
  enemyCount: number;
  breakableCount: number;
}

export interface DungeonDoorPlan {
  a: number;
  b: number;
  dirFromA: WfcRoomEdge['dirFromA'];
  dirFromB: WfcRoomEdge['dirFromB'];
  lock: DungeonDoorLock;
}

export interface DungeonLayout {
  seed: number;
  graph: WfcRoomGraph;
  rooms: DungeonRoomPlan[];
  doors: DungeonDoorPlan[];
  startRoomId: number;
  bossRoomId: number;
  minibossRoomId: number;
}

function collectSubtree(rooms: WfcRoomNode[], rootId: number): Set<number> {
  const res = new Set<number>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (res.has(id)) continue;
    res.add(id);
    for (const c of rooms[id].childrenIds) stack.push(c);
  }
  return res;
}

function getPathToRoot(rooms: WfcRoomNode[], targetId: number): number[] {
  const path: number[] = [];
  let cur: number | null = targetId;
  while (cur !== null) {
    path.push(cur);
    cur = rooms[cur].parentId;
  }
  return path.reverse();
}

const EXIT_WALL_TO_BIT: Record<ExitWallDir, number> = {
  north: DIR_NORTH,
  south: DIR_SOUTH,
  west: DIR_WEST,
  east: DIR_EAST,
};

/**
 * Picks the first closed cardinal wall on the start room for the Exit Door
 * in priority order: north, south, west, east.
 */
export function pickStartExitWall(mask: number): ExitWallDir {
  if ((mask & DIR_NORTH) === 0) return 'north';
  if ((mask & DIR_SOUTH) === 0) return 'south';
  if ((mask & DIR_WEST) === 0) return 'west';
  if ((mask & DIR_EAST) === 0) return 'east';
  throw new Error(`Start room has all 4 cardinal exits open (mask=${mask}); no solid wall for Exit Door.`);
}

/**
 * Simulates traversing the dungeon from `startRoomId` with key collection to prove
 * every room (including `bossRoomId`) is reachable without soft-locking, and verifies
 * that the start room has a valid `exitWall` on a closed wall.
 */
export function verifyDungeonSolvable(layout: DungeonLayout): boolean {
  const roomById = new Map(layout.rooms.map((r) => [r.id, r]));
  const startRoom = roomById.get(layout.startRoomId);
  if (!startRoom || startRoom.role !== 'start' || !startRoom.exitWall) {
    return false;
  }
  const exitWallBit = EXIT_WALL_TO_BIT[startRoom.exitWall];
  if ((startRoom.mask & exitWallBit) !== 0) {
    return false;
  }

  const adj = new Map<number, Array<{ to: number; lock: DungeonDoorLock }>>();
  for (const r of layout.rooms) adj.set(r.id, []);
  for (const d of layout.doors) {
    adj.get(d.a)?.push({ to: d.b, lock: d.lock });
    adj.get(d.b)?.push({ to: d.a, lock: d.lock });
  }

  const visited = new Set<number>([layout.startRoomId]);
  const openedSmallDoors = new Set<string>();
  let smallKeys = 0;
  let hasBossKey = false;
  let progress = true;

  while (progress) {
    progress = false;
    for (const rid of [...visited]) {
      const room = roomById.get(rid);
      if (!room) continue;
      for (const edge of adj.get(rid) ?? []) {
        if (visited.has(edge.to)) continue;
        const doorKey = rid < edge.to ? `${rid}-${edge.to}` : `${edge.to}-${rid}`;
        let canPass = false;
        if (edge.lock === 'open' || edge.lock === 'combat_seal') {
          canPass = true;
        } else if (edge.lock === 'boss_key') {
          canPass = hasBossKey;
        } else if (edge.lock === 'small_key') {
          if (openedSmallDoors.has(doorKey)) {
            canPass = true;
          } else if (smallKeys > 0) {
            smallKeys -= 1;
            openedSmallDoors.add(doorKey);
            canPass = true;
          }
        }
        if (canPass) {
          visited.add(edge.to);
          const nextRoom = roomById.get(edge.to);
          if (nextRoom?.grantsSmallKey) smallKeys += 1;
          if (nextRoom?.grantsBossKey) hasBossKey = true;
          progress = true;
        }
      }
    }
  }

  return visited.size === layout.rooms.length && visited.has(layout.bossRoomId);
}

/** Backwards-compatible alias for `verifyDungeonSolvable`. */
export function isDungeonLayoutSolvable(layout: DungeonLayout): boolean {
  return verifyDungeonSolvable(layout);
}

/**
 * Builds a Zelda-style 7-10 room procedural dungeon layout with keys, locked doors,
 * combat ambush lock-ins, prefab puzzles, a miniboss, and a boss room behind a Boss Door.
 */
export function buildDungeonLayout(seed = Date.now(), minRooms = 7, maxRooms = 10): DungeonLayout {
  const graph = generateWfcRoomGraph({
    gridWidth: 15,
    gridHeight: 15,
    minRooms,
    maxRooms,
    branchChance: 0.35,
    seed,
  });
  const rng = createSeededRng(graph.seed ^ 0x9e3779b9);

  // 1. Boss room = farthest room from start (prefer leaf)
  let bossNode = graph.rooms[0];
  for (const r of graph.rooms) {
    if (r.id === 0) continue;
    const betterDepth = r.depth > bossNode.depth;
    const tieLeaf = r.depth === bossNode.depth && r.isLeaf && !bossNode.isLeaf;
    if (betterDepth || tieLeaf) bossNode = r;
  }

  const bossPath = getPathToRoot(graph.rooms, bossNode.id);
  const bossPathSet = new Set(bossPath);

  // 2. Miniboss room = deepest non-start, non-boss node (prefer off-boss-path branch or pre-boss room)
  const minibossCandidates = graph.rooms.filter(
    (r) => r.id !== 0 && r.id !== bossNode.id && !bossPathSet.has(r.id),
  );
  minibossCandidates.sort((a, b) => b.depth - a.depth);
  const minibossNode =
    minibossCandidates[0] ??
    graph.rooms.find((r) => r.id === bossNode.parentId && r.id !== 0) ??
    graph.rooms[1];

  // 3. Door locks: Boss Door before bossNode; optional Small Key door before a deep subtree
  const doors: DungeonDoorPlan[] = graph.edges.map((e) => {
    const isBossEdge =
      (e.a === bossNode.parentId && e.b === bossNode.id) ||
      (e.b === bossNode.parentId && e.a === bossNode.id);
    return {
      a: e.a,
      b: e.b,
      dirFromA: e.dirFromA,
      dirFromB: e.dirFromB,
      lock: isBossEdge ? 'boss_key' : 'open',
    };
  });

  // Pick 1 small_key door on an edge leading into miniboss (or a mid-depth branch) if another
  // reachable room before that edge can hold the Small Key.
  let smallKeyRoomId: number | null = null;
  if (minibossNode.parentId !== null && minibossNode.id !== bossNode.parentId) {
    const mbSubtree = collectSubtree(graph.rooms, minibossNode.id);
    const validKeyHolders = graph.rooms.filter(
      (r) => r.id !== 0 && r.id !== bossNode.id && !mbSubtree.has(r.id),
    );
    if (validKeyHolders.length > 0) {
      // Prefer a leaf outside the miniboss subtree
      validKeyHolders.sort((a, b) => Number(b.isLeaf) - Number(a.isLeaf) || b.depth - a.depth);
      smallKeyRoomId = validKeyHolders[0].id;
      for (const d of doors) {
        const isMbEntry =
          (d.a === minibossNode.parentId && d.b === minibossNode.id) ||
          (d.b === minibossNode.parentId && d.a === minibossNode.id);
        if (isMbEntry) {
          d.lock = 'small_key';
          break;
        }
      }
    }
  }

  // Fallback: if small_key wasn't placed on miniboss, place it on the boss-adjacent parent edge if safe
  if (smallKeyRoomId === null && bossPath.length >= 3) {
    const gateChild = bossPath[bossPath.length - 2];
    const gateParent = bossPath[bossPath.length - 3];
    const gatedSubtree = collectSubtree(graph.rooms, gateChild);
    if (!gatedSubtree.has(minibossNode.id)) {
      const holders = graph.rooms.filter(
        (r) => r.id !== 0 && r.id !== bossNode.id && !gatedSubtree.has(r.id),
      );
      if (holders.length > 0) {
        holders.sort((a, b) => Number(b.isLeaf) - Number(a.isLeaf) || b.depth - a.depth);
        smallKeyRoomId = holders[0].id;
        for (const d of doors) {
          const match = (d.a === gateParent && d.b === gateChild) || (d.b === gateParent && d.a === gateChild);
          if (match && d.lock === 'open') {
            d.lock = 'small_key';
            break;
          }
        }
      }
    }
  }

  // 4. Assign room roles & prefab puzzles (deterministically shuffle all 23 puzzle kinds)
  const puzzleDeck: DungeonPuzzleKind[] = [...ALL_PUZZLE_KINDS];
  for (let i = puzzleDeck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [puzzleDeck[i], puzzleDeck[j]] = [puzzleDeck[j], puzzleDeck[i]];
  }
  let puzzleIdx = 0;
  const nextPuzzleKind = (): DungeonPuzzleKind => puzzleDeck[puzzleIdx++ % puzzleDeck.length];
  let assignedPuzzle = false;
  let assignedTreasure = false;

  const rooms: DungeonRoomPlan[] = graph.rooms.map((r) => {
    if (r.id === 0) {
      return {
        id: r.id,
        gx: r.gx,
        gy: r.gy,
        mask: r.mask,
        depth: r.depth,
        role: 'start',
        exitWall: pickStartExitWall(r.mask),
        grantsSmallKey: false,
        grantsBossKey: false,
        hasTreasureChest: false,
        lockOnClear: false,
        enemyCount: 0,
        breakableCount: 4,
      };
    }
    if (r.id === bossNode.id) {
      return {
        id: r.id,
        gx: r.gx,
        gy: r.gy,
        mask: r.mask,
        depth: r.depth,
        role: 'boss',
        grantsSmallKey: false,
        grantsBossKey: false,
        hasTreasureChest: false,
        lockOnClear: true,
        enemyCount: 1,
        breakableCount: 4,
      };
    }
    if (r.id === minibossNode.id) {
      return {
        id: r.id,
        gx: r.gx,
        gy: r.gy,
        mask: r.mask,
        depth: r.depth,
        role: 'miniboss',
        grantsSmallKey: false,
        grantsBossKey: true,
        hasTreasureChest: true,
        lockOnClear: true,
        enemyCount: 3,
        breakableCount: 4,
      };
    }
    if (r.id === smallKeyRoomId) {
      const usePuzzle = rng() < 0.6;
      const pk = usePuzzle ? nextPuzzleKind() : undefined;
      if (usePuzzle) assignedPuzzle = true;
      return {
        id: r.id,
        gx: r.gx,
        gy: r.gy,
        mask: r.mask,
        depth: r.depth,
        role: usePuzzle ? 'key_puzzle' : 'key_combat',
        puzzleKind: pk,
        grantsSmallKey: true,
        grantsBossKey: false,
        hasTreasureChest: true,
        lockOnClear: !usePuzzle || pk === 'ambush',
        enemyCount: usePuzzle && pk !== 'ambush' ? 1 : 3,
        breakableCount: 4,
      };
    }

    if (!assignedPuzzle) {
      assignedPuzzle = true;
      const pk = nextPuzzleKind();
      return {
        id: r.id,
        gx: r.gx,
        gy: r.gy,
        mask: r.mask,
        depth: r.depth,
        role: 'puzzle',
        puzzleKind: pk,
        grantsSmallKey: false,
        grantsBossKey: false,
        hasTreasureChest: true,
        lockOnClear: pk === 'ambush',
        enemyCount: pk === 'ambush' ? 3 : 1,
        breakableCount: 5,
      };
    }

    if (r.isLeaf && !assignedTreasure) {
      assignedTreasure = true;
      return {
        id: r.id,
        gx: r.gx,
        gy: r.gy,
        mask: r.mask,
        depth: r.depth,
        role: 'treasure',
        grantsSmallKey: false,
        grantsBossKey: false,
        hasTreasureChest: true,
        lockOnClear: false,
        enemyCount: 1,
        breakableCount: 6,
      };
    }

    const isBonusPuzzle = rng() < 0.45;
    const pk = isBonusPuzzle ? nextPuzzleKind() : undefined;
    return {
      id: r.id,
      gx: r.gx,
      gy: r.gy,
      mask: r.mask,
      depth: r.depth,
      role: isBonusPuzzle ? 'puzzle' : 'combat',
      puzzleKind: pk,
      grantsSmallKey: false,
      grantsBossKey: false,
      hasTreasureChest: isBonusPuzzle && pk !== 'ambush',
      lockOnClear: pk === 'ambush',
      enemyCount: isBonusPuzzle && pk !== 'ambush' ? 1 : 2 + Math.floor(rng() * 2),
      breakableCount: 3 + Math.floor(rng() * 3),
    };
  });

  const layout: DungeonLayout = {
    seed: graph.seed,
    graph,
    rooms,
    doors,
    startRoomId: 0,
    bossRoomId: bossNode.id,
    minibossRoomId: minibossNode.id,
  };

  if (!verifyDungeonSolvable(layout)) {
    throw new Error(`Generated unsolvable dungeon layout for seed ${graph.seed}`);
  }

  return layout;
}
