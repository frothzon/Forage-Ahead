import type { StructureType } from '../data/recipes';
import { buildHouseLayout, type HouseThemeId } from './HouseLayoutBuilder';
import { DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST } from './WfcRoomGraph';

export interface StampTilePlacement {
  lx: number;
  ly: number;
  type: StructureType;
  orientation?: 'horizontal' | 'vertical';
  locked?: boolean;
  isBedroomChest?: boolean;
}

export interface OutdoorBuildingStamp {
  theme: HouseThemeId;
  name: string;
  width: number;
  height: number;
  doorLx: number;
  doorLy: number;
  bedLx: number;
  bedLy: number;
  placements: StampTilePlacement[];
}

const ROOM_STEP_X = 5; // 4 interior tiles + 1 shared wall seam
const ROOM_STEP_Y = 4; // 3 interior tiles + 1 shared wall seam

/**
 * Builds a cohesive, multi-room outdoor house stamp from the shared WFC generator (`buildHouseLayout`),
 * using shared 1-tile walls between rooms, clean open archways, one exterior front door, and themed furniture.
 */
export function buildWfcOutdoorHouseStamp(theme: HouseThemeId): OutdoorBuildingStamp {
  const layout = buildHouseLayout(theme);
  const { minGx, maxGx, minGy, maxGy } = layout.graph.bounds;
  const width = (maxGx - minGx + 1) * ROOM_STEP_X + 1;
  const height = (maxGy - minGy + 1) * ROOM_STEP_Y + 1;

  const floorSet = new Set<string>();
  const wallSet = new Set<string>();
  const doorwayArchSet = new Set<string>();

  for (const r of layout.rooms) {
    const ox = (r.gx - minGx) * ROOM_STEP_X;
    const oy = (r.gy - minGy) * ROOM_STEP_Y;

    // 1. Floor across entire room footprint (including shared perimeter walls)
    for (let ly = 0; ly <= ROOM_STEP_Y; ly++) {
      for (let lx = 0; lx <= ROOM_STEP_X; lx++) {
        floorSet.add(`${ox + lx},${oy + ly}`);
      }
    }

    // 2. Perimeter walls around each room
    for (let ly = 0; ly <= ROOM_STEP_Y; ly++) {
      for (let lx = 0; lx <= ROOM_STEP_X; lx++) {
        const onPerim = lx === 0 || lx === ROOM_STEP_X || ly === 0 || ly === ROOM_STEP_Y;
        if (onPerim) {
          wallSet.add(`${ox + lx},${oy + ly}`);
        }
      }
    }

    // 3. Carve 1-tile open archways for WFC-connected neighbors
    const midX = ox + 2;
    const midY = oy + 2;
    if ((r.mask & DIR_NORTH) !== 0) doorwayArchSet.add(`${midX},${oy}`);
    if ((r.mask & DIR_SOUTH) !== 0) doorwayArchSet.add(`${midX},${oy + ROOM_STEP_Y}`);
    if ((r.mask & DIR_WEST) !== 0) doorwayArchSet.add(`${ox},${midY}`);
    if ((r.mask & DIR_EAST) !== 0) doorwayArchSet.add(`${ox + ROOM_STEP_X},${midY}`);
  }

  for (const arch of doorwayArchSet) {
    wallSet.delete(arch);
  }

  // 4. Pick exterior front door on the foyer's south wall (or bottom-most exterior wall)
  const foyer = layout.rooms.find((r) => r.role === 'foyer') ?? layout.rooms[0];
  let doorLx = (foyer.gx - minGx) * ROOM_STEP_X + 2;
  let doorLy = (foyer.gy - minGy) * ROOM_STEP_Y + ROOM_STEP_Y;

  // Ensure the chosen door is on a non-corner exterior south wall (floor above, no floor below, wall/floor left & right)
  const isValidSouthDoor = (wx: number, wy: number) =>
    floorSet.has(`${wx},${wy - 1}`) &&
    !floorSet.has(`${wx},${wy + 1}`) &&
    floorSet.has(`${wx - 1},${wy}`) &&
    floorSet.has(`${wx + 1},${wy}`);

  if (!isValidSouthDoor(doorLx, doorLy)) {
    for (const k of wallSet) {
      const [wx, wy] = k.split(',').map(Number);
      if (isValidSouthDoor(wx, wy)) {
        doorLx = wx;
        doorLy = wy;
        break;
      }
    }
  }
  wallSet.delete(`${doorLx},${doorLy}`);

  const isOutsideTile = (lx: number, ly: number) =>
    !floorSet.has(`${lx},${ly - 1}`) ||
    !floorSet.has(`${lx},${ly + 1}`) ||
    !floorSet.has(`${lx - 1},${ly}`) ||
    !floorSet.has(`${lx + 1},${ly}`) ||
    !floorSet.has(`${lx - 1},${ly - 1}`) ||
    !floorSet.has(`${lx + 1},${ly - 1}`) ||
    !floorSet.has(`${lx - 1},${ly + 1}`) ||
    !floorSet.has(`${lx + 1},${ly + 1}`);

  const explicitBedrooms = layout.rooms.filter((r) => r.role === 'bedroom');
  const bedroomRooms =
    explicitBedrooms.length > 0
      ? explicitBedrooms
      : layout.rooms.filter((r) => r.role !== 'foyer').slice(-1);
  const bedroomRoomIds = new Set(bedroomRooms.map((r) => r.id));
  const bedroomTileSet = new Set<string>();
  for (const r of bedroomRooms) {
    const ox = (r.gx - minGx) * ROOM_STEP_X;
    const oy = (r.gy - minGy) * ROOM_STEP_Y;
    for (let ly = 0; ly <= ROOM_STEP_Y; ly++) {
      for (let lx = 0; lx <= ROOM_STEP_X; lx++) {
        bedroomTileSet.add(`${ox + lx},${oy + ly}`);
      }
    }
  }

  const placements: StampTilePlacement[] = [];
  for (const k of floorSet) {
    const [lx, ly] = k.split(',').map(Number);
    // Don't place floor on outside walls or under the front door; DO place floor on inside walls
    if (k === `${doorLx},${doorLy}`) continue;
    if (wallSet.has(k) && isOutsideTile(lx, ly)) continue;
    placements.push({ lx, ly, type: 'house_floor' });
  }
  for (const k of wallSet) {
    const [lx, ly] = k.split(',').map(Number);
    placements.push({ lx, ly, type: 'house_wall' });
  }
  placements.push({ lx: doorLx, ly: doorLy, type: 'house_door', orientation: 'horizontal', locked: false });
  for (const arch of doorwayArchSet) {
    const [ax, ay] = arch.split(',').map(Number);
    const isVertical = wallSet.has(`${ax},${ay - 1}`) || wallSet.has(`${ax},${ay + 1}`);
    const orientation: 'horizontal' | 'vertical' = isVertical ? 'vertical' : 'horizontal';
    const touchesBedroom = bedroomTileSet.has(`${ax},${ay}`);
    placements.push({ lx: ax, ly: ay, type: 'house_door', orientation, locked: touchesBedroom });
  }

  // 5. Place themed furniture inside each WFC room's 4x3 interior without blocking any archway or door
  const occupied = new Set<string>([`${doorLx},${doorLy - 1}`]);
  for (const arch of doorwayArchSet) {
    const [ax, ay] = arch.split(',').map(Number);
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      occupied.add(`${ax + dx},${ay + dy}`);
    }
  }
  const addProp = (lx: number, ly: number, type: StructureType, inBedroom = false) => {
    const k = `${lx},${ly}`;
    if (occupied.has(k) || !floorSet.has(k) || wallSet.has(k)) return;
    occupied.add(k);
    const placement: StampTilePlacement = { lx, ly, type };
    if (type === 'chest' && inBedroom) {
      placement.isBedroomChest = true;
    }
    placements.push(placement);
  };

  for (const r of layout.rooms) {
    const ox = (r.gx - minGx) * ROOM_STEP_X;
    const oy = (r.gy - minGy) * ROOM_STEP_Y;
    const inBedroom = bedroomRoomIds.has(r.id);
    if (r.role === 'foyer') {
      addProp(ox + 2, oy + 2, 'furniture_rug', inBedroom);
      addProp(ox + 1, oy + 1, 'furniture_lamp', inBedroom);
      addProp(ox + ROOM_STEP_X - 1, oy + 1, 'furniture_table', inBedroom);
    } else if (r.role === 'workshop') {
      const station: StructureType =
        theme === 'blacksmith'
          ? 'anvil'
          : theme === 'alchemist'
            ? 'alchemy_lab'
            : theme === 'fisherman'
              ? 'water_well'
              : 'chest';
      addProp(ox + 1, oy + 1, station, inBedroom);
      addProp(
        ox + ROOM_STEP_X - 1,
        oy + 1,
        theme === 'blacksmith' ? 'furnace' : 'chest',
        inBedroom,
      );
      addProp(ox + 1, oy + ROOM_STEP_Y - 1, 'furniture_lamp', inBedroom);
      addProp(ox + 2, oy + 2, 'furniture_rug', inBedroom);
    } else {
      // bedroom
      addProp(ox + 1, oy + 1, 'furniture_bed', inBedroom);
      addProp(ox + ROOM_STEP_X - 1, oy + 1, 'furniture_lamp', inBedroom);
      addProp(ox + ROOM_STEP_X - 1, oy + ROOM_STEP_Y - 1, 'chest', inBedroom);
      addProp(ox + 2, oy + 2, 'furniture_rug', inBedroom);
    }
  }

  let bedPl = placements.find((p) => p.type === 'furniture_bed');
  if (!bedPl) {
    const roomsOrdered = [
      ...layout.rooms.filter((r) => r.role === 'bedroom'),
      ...layout.rooms.filter((r) => r.role !== 'bedroom'),
    ];
    outer: for (const r of roomsOrdered) {
      const ox = (r.gx - minGx) * ROOM_STEP_X;
      const oy = (r.gy - minGy) * ROOM_STEP_Y;
      for (let ly = oy + 1; ly < oy + ROOM_STEP_Y; ly++) {
        for (let lx = ox + 1; lx < ox + ROOM_STEP_X; lx++) {
          const k = `${lx},${ly}`;
          if (
            floorSet.has(k) &&
            !wallSet.has(k) &&
            !doorwayArchSet.has(k) &&
            k !== `${doorLx},${doorLy}` &&
            !occupied.has(k)
          ) {
            occupied.add(k);
            bedPl = { lx, ly, type: 'furniture_bed' };
            placements.push(bedPl);
            break outer;
          }
        }
      }
    }
  }

  return {
    theme,
    name: layout.houseName,
    width,
    height,
    doorLx,
    doorLy,
    bedLx: bedPl ? bedPl.lx : doorLx,
    bedLy: bedPl ? bedPl.ly : Math.max(1, doorLy - 2),
    placements,
  };
}

export const OUTDOOR_NPC_BUILDINGS: Record<HouseThemeId, OutdoorBuildingStamp> = {
  farmer: buildWfcOutdoorHouseStamp('farmer'),
  blacksmith: buildWfcOutdoorHouseStamp('blacksmith'),
  alchemist: buildWfcOutdoorHouseStamp('alchemist'),
  fisherman: buildWfcOutdoorHouseStamp('fisherman'),
};

/**
 * 3x3 autotiler for `sprout/house_walls` (5x3 = 15 frames).
 * Layout: 0=NW, 1=N, 2=NE / 5=W, 6=Floor, 7=E / 10=SW, 11=S, 12=SE, plus 8=interior divider.
 */
export function computeHouseWallFrame(
  hasN: boolean,
  hasS: boolean,
  hasW: boolean,
  hasE: boolean,
  hasFloorW = false,
  hasFloorE = false,
): number {
  if (!hasN && !hasW && hasS) return 0; // NW corner
  if (!hasN && !hasE && hasS) return 2; // NE corner
  if (!hasS && !hasW && hasN) return 10; // SW corner
  if (!hasS && !hasE && hasN) return 12; // SE corner
  if (hasN && hasS && !hasW && hasE) return 5; // W wall
  if (hasN && hasS && hasW && !hasE) return 7; // E wall
  if (hasN && hasS && !hasW && !hasE) {
    if (hasFloorW && !hasFloorE) return 7; // Right exterior vertical wall
    return 5; // Left exterior / divider vertical wall
  }
  if (!hasS && (hasW || hasE)) return 11; // S wall
  if (hasN && hasS && hasW && hasE) return 8; // Interior divider
  return 1; // N wall
}

/**
 * Roof tile selector for `sprout/house_roof` (7x5 = 35 frames):
 * Concave corners: 3 (SE), 4 (SW), 10 (NE), 11 (NW)
 * Left edge (!hasW): 7 (top), 14 (ridge), 21 (lower), 28 (bot edge)
 * Interior (hasW && hasE): 8 (top), 15 (ridge), 22 (lower), 29 (bot edge)
 * Right edge (!hasE): 9 (top), 16 (ridge), 23 (lower), 30 (bot edge)
 */
export function computeHouseRoofFrame(
  ty: number,
  minTy: number,
  maxTy: number,
  hasW = true,
  hasE = true,
  concaveCorner?: 'se' | 'sw' | 'ne' | 'nw',
): number {
  if (concaveCorner === 'se') return 3;
  if (concaveCorner === 'sw') return 4;
  if (concaveCorner === 'ne') return 10;
  if (concaveCorner === 'nw') return 11;

  const colOffset = !hasW ? -1 : !hasE ? 1 : 0;
  const ridgeTy = Math.max(minTy, Math.floor((minTy + maxTy) / 2) - 1);
  const base = ty === ridgeTy ? 15 : ty < ridgeTy ? 8 : 22;
  return base + colOffset;
}

/** Scalloped bottom eaves edge frame (`28` = left, `29` = middle, `30` = right) for south roof edges. */
export function computeHouseRoofEaveFrame(hasW = true, hasE = true): number {
  const colOffset = !hasW ? -1 : !hasE ? 1 : 0;
  return 29 + colOffset;
}

export interface WallCollisionBox {
  offsetX: number;
  offsetY: number;
  halfW: number;
  halfH: number;
}

/**
 * Returns a padded, tile-overlapping AABB for `house_wall` frames so adjacent
 * horizontal, vertical, and corner wall tiles have zero seams or diagonal gaps.
 */
export function computeWallCollisionBox(frame: number): WallCollisionBox {
  if (frame === 0 || frame === 10) {
    // NW / SW corners: flush with left wall (-2.5) and horizontal walls (y: -7..+7)
    return { offsetX: 3.25, offsetY: 0, halfW: 5.75, halfH: 7.0 };
  }
  if (frame === 2 || frame === 12) {
    // NE / SE corners: flush with right wall (+2.5) and horizontal walls (y: -7..+7)
    return { offsetX: -3.25, offsetY: 0, halfW: 5.75, halfH: 7.0 };
  }
  if (frame === 5) {
    return { offsetX: 3.0, offsetY: 0, halfW: 5.5, halfH: 9.5 };
  }
  if (frame === 7) {
    return { offsetX: -3.0, offsetY: 0, halfW: 5.5, halfH: 9.5 };
  }
  return { offsetX: 0, offsetY: 0, halfW: 9.0, halfH: 7.0 };
}

/**
 * Flood-fills contiguous house tiles (`"tx,ty"`) into separate building group IDs
 * so entering one building only fades that building's roof.
 */
export function groupConnectedHouseTiles(tiles: ReadonlySet<string>): Map<string, number> {
  const groupByTile = new Map<string, number>();
  let nextGroupId = 1;

  for (const startKey of tiles) {
    if (groupByTile.has(startKey)) continue;
    const gid = nextGroupId++;
    const queue: string[] = [startKey];
    groupByTile.set(startKey, gid);

    while (queue.length > 0) {
      const cur = queue.pop()!;
      const [tx, ty] = cur.split(',').map(Number);
      for (const [nx, ny] of [
        [tx + 1, ty],
        [tx - 1, ty],
        [tx, ty + 1],
        [tx, ty - 1],
      ]) {
        const nk = `${nx},${ny}`;
        if (tiles.has(nk) && !groupByTile.has(nk)) {
          groupByTile.set(nk, gid);
          queue.push(nk);
        }
      }
    }
  }

  return groupByTile;
}

/**
 * Returns true when a house tile is strictly interior (all 4 cardinal neighbors belong to the house),
 * excluding 100% of exterior perimeter walls and exterior front doors while keeping interior dividers & doors.
 */
export function hasAll4CardinalHouseNeighbors(
  houseTiles: ReadonlySet<string>,
  tx: number,
  ty: number,
): boolean {
  return (
    houseTiles.has(`${tx},${ty - 1}`) &&
    houseTiles.has(`${tx},${ty + 1}`) &&
    houseTiles.has(`${tx - 1},${ty}`) &&
    houseTiles.has(`${tx + 1},${ty}`)
  );
}
