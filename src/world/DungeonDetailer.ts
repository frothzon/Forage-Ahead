import { createSeededRng, DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST } from './WfcRoomGraph';
import type { DungeonRoomRole } from './DungeonLayoutBuilder';
import type { DungeonPropSpec, DungeonThemeVisuals } from '../data/dungeonTilesets';

export interface DetailedTile {
  lx: number;
  ly: number;
  frame: number;
  tint: number;
}

export interface DetailedPropPlacement {
  lx: number;
  ly: number;
  spec: DungeonPropSpec;
}

export interface DetailedPillarPlacement {
  lx: number;
  ly: number;
}

export interface RoomDetailPlan {
  floors: DetailedTile[];
  rugs: DetailedTile[];
  torches: Array<{ lx: number; ly: number }>;
  pillars: DetailedPillarPlacement[];
  props: DetailedPropPlacement[];
  /** Local `(lx, ly)` keys occupied by solid pillars or props. */
  blockedSet: Set<string>;
}

export interface DetailRoomOptions {
  roomW: number;
  roomH: number;
  mask: number;
  role: DungeonRoomRole;
  theme: DungeonThemeVisuals;
  seed: number;
  reservedTiles?: Array<{ lx: number; ly: number }>;
  propCount?: number;
}

/**
 * Generates rule-based + randomized room floor details, carpet runners, wall torches,
 * tactical pillars, and themed destructible props while guaranteeing doorway, center,
 * and puzzle safe zones remain unobstructed.
 */
export function detailDungeonRoom(opts: DetailRoomOptions): RoomDetailPlan {
  const { roomW, roomH, mask, role, theme, seed } = opts;
  const rng = createSeededRng(seed);

  // Build safe-zone set so pillars & destructibles never block doorways, center, or puzzles
  const safeSet = new Set<string>();
  const markSafeBox = (cx: number, cy: number, radius: number) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        safeSet.add(`${cx + dx},${cy + dy}`);
      }
    }
  };

  // Center 3x3 safe zone (chests, bosses, portals)
  markSafeBox(Math.floor(roomW / 2), Math.floor(roomH / 2), 1);

  // Doorway 3x3 clearance zones
  if ((mask & DIR_NORTH) !== 0) markSafeBox(Math.floor(roomW / 2), 1, 1);
  if ((mask & DIR_SOUTH) !== 0) markSafeBox(Math.floor(roomW / 2), roomH - 2, 1);
  if ((mask & DIR_WEST) !== 0) markSafeBox(1, Math.floor(roomH / 2), 1);
  if ((mask & DIR_EAST) !== 0) markSafeBox(roomW - 2, Math.floor(roomH / 2), 1);

  for (const r of opts.reservedTiles ?? []) {
    markSafeBox(r.lx, r.ly, 1);
  }

  // 1. Floor tiles (weighted base + subtle random variation)
  const floors: DetailedTile[] = [];
  for (let ly = 1; ly < roomH - 1; ly++) {
    for (let lx = 1; lx < roomW - 1; lx++) {
      const idx = Math.floor(rng() * theme.floorFrames.length);
      floors.push({
        lx,
        ly,
        frame: theme.floorFrames[idx],
        tint: theme.floorTint,
      });
    }
  }

  // 2. Role-driven decorative carpet runner
  const rugs: DetailedTile[] = [];
  if (role === 'boss' || role === 'miniboss' || role === 'treasure' || role === 'key_puzzle') {
    const midX = Math.floor(roomW / 2);
    const midY = Math.floor(roomH / 2);
    for (let ly = midY - 1; ly <= midY + 1; ly++) {
      for (let lx = midX - 2; lx <= midX + 1; lx++) {
        rugs.push({ lx, ly, frame: theme.rugFrame, tint: theme.rugTint });
      }
    }
  }

  // 3. Symmetric wall torches along North wall
  const torches: Array<{ lx: number; ly: number }> = [
    { lx: 2, ly: 1 },
    { lx: roomW - 3, ly: 1 },
  ];
  if (roomW >= 16) {
    torches.push({ lx: 2, ly: roomH - 2 }, { lx: roomW - 3, ly: roomH - 2 });
  }

  const blockedSet = new Set<string>();

  // 4. Tactical pillars in combat/miniboss/boss rooms (55% chance)
  const pillars: DetailedPillarPlacement[] = [];
  if ((role === 'combat' || role === 'miniboss' || role === 'boss') && rng() < 0.55) {
    const candidates: Array<[number, number]> = [
      [4, 3],
      [roomW - 5, 3],
      [4, roomH - 4],
      [roomW - 5, roomH - 4],
    ];
    for (const [lx, ly] of candidates) {
      const k = `${lx},${ly}`;
      if (!safeSet.has(k) && !blockedSet.has(k)) {
        pillars.push({ lx, ly });
        blockedSet.add(k);
      }
    }
  }

  // 5. Corner & edge destructible prop clusters
  const props: DetailedPropPlacement[] = [];
  const targetProps = opts.propCount ?? 4 + Math.floor(rng() * 3);
  const edgeCandidates: Array<[number, number]> = [
    [2, 3],
    [3, 2],
    [roomW - 3, 3],
    [roomW - 4, 2],
    [2, roomH - 4],
    [3, roomH - 3],
    [roomW - 3, roomH - 4],
    [roomW - 4, roomH - 3],
    [5, 2],
    [roomW - 6, 2],
    [5, roomH - 3],
    [roomW - 6, roomH - 3],
  ];
  // Shuffle deterministically
  for (let i = edgeCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [edgeCandidates[i], edgeCandidates[j]] = [edgeCandidates[j], edgeCandidates[i]];
  }
  for (const [lx, ly] of edgeCandidates) {
    if (props.length >= targetProps) break;
    const k = `${lx},${ly}`;
    if (safeSet.has(k) || blockedSet.has(k)) continue;
    const spec = theme.propPool[Math.floor(rng() * theme.propPool.length)];
    props.push({ lx, ly, spec });
    blockedSet.add(k);
  }

  return { floors, rugs, torches, pillars, props, blockedSet };
}
