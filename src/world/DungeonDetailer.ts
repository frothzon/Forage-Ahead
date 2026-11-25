import { createSeededRng, DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST } from './WfcRoomGraph';
import type { DungeonRoomRole, ExitWallDir } from './DungeonLayoutBuilder';
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

export interface DetailedDecal {
  lx: number;
  ly: number;
  kind: 'crack' | 'moss' | 'scorch' | 'frost' | 'bone';
  color: number;
  alpha: number;
  size: number;
}

export interface RoomDetailPlan {
  floors: DetailedTile[];
  rugs: DetailedTile[];
  torches: Array<{ lx: number; ly: number }>;
  pillars: DetailedPillarPlacement[];
  props: DetailedPropPlacement[];
  decals: DetailedDecal[];
  /** Local `(lx, ly)` keys occupied by solid pillars or props. */
  blockedSet: Set<string>;
}

export interface DetailRoomOptions {
  roomW: number;
  roomH: number;
  mask: number;
  role: DungeonRoomRole;
  exitWall?: ExitWallDir;
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
  const midX = Math.floor(roomW / 2);
  const midY = Math.floor(roomH / 2);
  if ((mask & DIR_NORTH) !== 0) markSafeBox(midX, 1, 1);
  if ((mask & DIR_SOUTH) !== 0) markSafeBox(midX, roomH - 2, 1);
  if ((mask & DIR_WEST) !== 0) markSafeBox(1, midY, 1);
  if ((mask & DIR_EAST) !== 0) markSafeBox(roomW - 2, midY, 1);

  // Reserve Exit Door clearance on the start room (explicit exitWall and/or all closed walls)
  if (opts.exitWall === 'north' || role === 'start') markSafeBox(midX, 1, 1);
  if (opts.exitWall === 'south' || role === 'start') markSafeBox(midX, roomH - 2, 1);
  if (opts.exitWall === 'west' || role === 'start') markSafeBox(1, midY, 1);
  if (opts.exitWall === 'east' || role === 'start') markSafeBox(roomW - 2, midY, 1);

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

  // 4. Tactical pillars in combat/miniboss/boss rooms (varied silhouette patterns)
  const pillars: DetailedPillarPlacement[] = [];
  if ((role === 'combat' || role === 'miniboss' || role === 'boss') && rng() < 0.65) {
    const midX = Math.floor(roomW / 2);
    const midY = Math.floor(roomH / 2);
    const pattern = Math.floor(rng() * 3);
    const candidates: Array<[number, number]> =
      pattern === 0
        ? [
            [4, 3],
            [roomW - 5, 3],
            [4, roomH - 4],
            [roomW - 5, roomH - 4],
          ]
        : pattern === 1
          ? [
              [4, midY],
              [roomW - 5, midY],
            ]
          : [
              [midX - 3, 3],
              [midX + 2, 3],
              [midX - 3, roomH - 4],
              [midX + 2, roomH - 4],
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

  // 6. Non-colliding environmental storytelling floor decals (wear, moss, frost, scorch)
  const decals: DetailedDecal[] = [];
  const themeDecalKind: DetailedDecal['kind'] =
    theme.key === 'frost_cavern'
      ? 'frost'
      : theme.key === 'infernal_sanctum'
        ? 'scorch'
        : theme.key === 'skull_crypt'
          ? 'bone'
          : theme.key === 'sunken_tomb'
            ? 'moss'
            : 'crack';
  const decalColorMap: Record<DetailedDecal['kind'], number> = {
    crack: 0x1e1a24,
    moss: 0x2c4a34,
    scorch: 0x2a1410,
    frost: 0xc2f0ff,
    bone: 0xd8d0c0,
  };
  const decalCount = 6 + Math.floor(rng() * 5);
  for (let i = 0; i < decalCount; i++) {
    const lx = 1 + Math.floor(rng() * (roomW - 2));
    const ly = 1 + Math.floor(rng() * (roomH - 2));
    const kind = rng() < 0.65 ? themeDecalKind : 'crack';
    decals.push({
      lx,
      ly,
      kind,
      color: decalColorMap[kind],
      alpha: kind === 'frost' ? 0.22 : 0.28,
      size: 4 + Math.floor(rng() * 5),
    });
  }

  return { floors, rugs, torches, pillars, props, decals, blockedSet };
}
