export type TerrainType =
  | 'water'
  | 'grass'
  | 'autumn'
  | 'winter'
  | 'graveyard'
  | 'infernal';

export type OverlayType = 'none' | 'dirt' | 'road' | 'bridge';

export interface TileBlock3x3 {
  cols: number; // sheet width in tiles
  tl: number;
  t: number;
  tr: number;
  l: number;
  c: number;
  r: number;
  bl: number;
  b: number;
  br: number;
  // Optional inner water corners (used when land surrounds a water tile, or cliff corners)
  innerNw?: number;
  innerNe?: number;
  innerSw?: number;
  innerSe?: number;
  // Optional 1-tile-wide strip caps (e.g. Roads_stone)
  vTop?: number;
  vMid?: number;
  vBot?: number;
  hLeft?: number;
  hMid?: number;
  hRight?: number;
  single?: number;
}

export interface TilePlacement {
  tilesetKey: string;
  frame: number;
  tint?: number;
  cliffFrame?: number;
}

const idx = (cols: number, c: number, r: number): number => r * cols + c;

/**
 * Exact 16x16 grid indices verified from Franuka's extracted PNG tilesets.
 */
export const BIOME_TILESETS: Record<
  Exclude<TerrainType, 'water'>,
  { tilesetKey: string; tint?: number; waterFrame: number; block: TileBlock3x3; cliffBelowFrames?: [number, number, number] }
> = {
  grass: {
    tilesetKey: 'tileset_coastlines',
    waterFrame: idx(16, 3, 6),
    block: {
      cols: 6,
      tl: idx(6, 0, 0),
      t: idx(6, 1, 0),
      tr: idx(6, 2, 0),
      l: idx(6, 0, 1),
      c: idx(6, 1, 1),
      r: idx(6, 2, 1),
      bl: idx(6, 0, 2),
      b: idx(6, 1, 2),
      br: idx(6, 2, 2),
      innerSe: idx(6, 3, 0),
      innerSw: idx(6, 5, 0),
      innerNe: idx(6, 3, 2),
      innerNw: idx(6, 5, 2),
    },
  },
  autumn: {
    tilesetKey: 'tileset_autumn',
    waterFrame: idx(16, 3, 8),
    block: {
      cols: 16,
      tl: idx(16, 0, 9),
      t: idx(16, 1, 9),
      tr: idx(16, 2, 9),
      l: idx(16, 0, 10),
      c: idx(16, 1, 10),
      r: idx(16, 2, 10),
      bl: idx(16, 0, 11),
      b: idx(16, 1, 11),
      br: idx(16, 2, 11),
    },
  },
  winter: {
    tilesetKey: 'tileset_winter',
    waterFrame: idx(16, 4, 7),
    block: {
      cols: 16,
      tl: idx(16, 0, 6),
      t: idx(16, 1, 6),
      tr: idx(16, 2, 6),
      l: idx(16, 0, 7),
      c: idx(16, 1, 7),
      r: idx(16, 2, 7),
      bl: idx(16, 0, 8),
      b: idx(16, 1, 8),
      br: idx(16, 2, 8),
      innerNw: idx(16, 5, 8),
      innerNe: idx(16, 3, 8),
      innerSw: idx(16, 5, 6),
      innerSe: idx(16, 3, 6),
    },
  },
  graveyard: {
    tilesetKey: 'tileset_coastlines',
    tint: 0x8d88a8,
    waterFrame: idx(16, 3, 6),
    block: {
      cols: 6,
      tl: idx(6, 0, 0),
      t: idx(6, 1, 0),
      tr: idx(6, 2, 0),
      l: idx(6, 0, 1),
      c: idx(6, 1, 1),
      r: idx(6, 2, 1),
      bl: idx(6, 0, 2),
      b: idx(6, 1, 2),
      br: idx(6, 2, 2),
      innerSe: idx(6, 3, 0),
      innerSw: idx(6, 5, 0),
      innerNe: idx(6, 3, 2),
      innerNw: idx(6, 5, 2),
    },
  },
  infernal: {
    tilesetKey: 'tileset_autumn',
    tint: 0xb25b68,
    waterFrame: idx(16, 3, 8),
    block: {
      cols: 16,
      tl: idx(16, 0, 9),
      t: idx(16, 1, 9),
      tr: idx(16, 2, 9),
      l: idx(16, 0, 10),
      c: idx(16, 1, 10),
      r: idx(16, 2, 10),
      bl: idx(16, 0, 11),
      b: idx(16, 1, 11),
      br: idx(16, 2, 11),
    },
  },
};

export const DIRT_BLOCK: TileBlock3x3 = {
  cols: 6,
  tl: idx(6, 0, 0),
  t: idx(6, 1, 0),
  tr: idx(6, 2, 0),
  l: idx(6, 0, 1),
  c: idx(6, 1, 1),
  r: idx(6, 2, 1),
  bl: idx(6, 0, 2),
  b: idx(6, 1, 2),
  br: idx(6, 2, 2),
  single: idx(6, 4, 0),
};

export const STONE_ROAD_BLOCK: TileBlock3x3 = {
  cols: 7,
  tl: idx(7, 0, 0),
  t: idx(7, 1, 0),
  tr: idx(7, 2, 0),
  l: idx(7, 0, 1),
  c: idx(7, 1, 1),
  r: idx(7, 2, 1),
  bl: idx(7, 0, 2),
  b: idx(7, 1, 2),
  br: idx(7, 2, 2),
  vTop: idx(7, 3, 0),
  vMid: idx(7, 3, 1),
  vBot: idx(7, 3, 2),
  hLeft: idx(7, 4, 0),
  hMid: idx(7, 5, 0),
  hRight: idx(7, 6, 0),
  single: idx(7, 4, 1),
};

/**
 * Resolves a 3x3 + strip-capable auto-tile frame from 4 cardinal connectedness flags.
 */
export function resolveBlockFrame(
  block: TileBlock3x3,
  hasN: boolean,
  hasE: boolean,
  hasS: boolean,
  hasW: boolean,
): number {
  // 1-tile wide strips & isolated single tiles (for roads/bridges/narrow paths)
  if (!hasN && !hasS && !hasE && !hasW && block.single !== undefined) {
    return block.single;
  }
  if (!hasN && !hasS && (hasE || hasW)) {
    if (hasE && !hasW && block.hLeft !== undefined) return block.hLeft;
    if (hasW && !hasE && block.hRight !== undefined) return block.hRight;
    if (hasE && hasW && block.hMid !== undefined) return block.hMid;
  }
  if (!hasE && !hasW && (hasN || hasS)) {
    if (hasS && !hasN && block.vTop !== undefined) return block.vTop;
    if (hasN && !hasS && block.vBot !== undefined) return block.vBot;
    if (hasN && hasS && block.vMid !== undefined) return block.vMid;
  }

  // Standard 9-slice outer coastline / patch mapping
  if (!hasN && !hasW) return block.tl;
  if (!hasN && !hasE) return block.tr;
  if (!hasS && !hasW) return block.bl;
  if (!hasS && !hasE) return block.br;
  if (!hasN) return block.t;
  if (!hasS) return block.b;
  if (!hasW) return block.l;
  if (!hasE) return block.r;
  return block.c;
}

export function isLand(t: TerrainType | undefined): boolean {
  return t !== undefined && t !== 'water';
}

/**
 * Computes the auto-tiled terrain frame for coordinate (x, y) in a 2D terrain grid.
 * Adjacent land tiles of the same biome (or any land tile) connect seamlessly.
 */
export function computeTerrainTile(
  grid: TerrainType[][],
  x: number,
  y: number,
): TilePlacement | null {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  if (y < 0 || y >= height || x < 0 || x >= width) return null;

  const current = grid[y][x];
  if (current === 'water') {
    return null;
  }

  const spec = BIOME_TILESETS[current];
  const sameOrLand = (nx: number, ny: number): boolean => {
    if (ny < 0 || ny >= height || nx < 0 || nx >= width) return false;
    return isLand(grid[ny][nx]);
  };

  const hasN = sameOrLand(x, y - 1);
  const hasE = sameOrLand(x + 1, y);
  const hasS = sameOrLand(x, y + 1);
  const hasW = sameOrLand(x - 1, y);

  let frame = resolveBlockFrame(spec.block, hasN, hasE, hasS, hasW);

  // Inner corner support when all 4 cardinal neighbors are land, but one diagonal is water
  if (hasN && hasE && hasS && hasW) {
    if (!sameOrLand(x - 1, y - 1) && spec.block.innerNw !== undefined) {
      frame = spec.block.innerNw;
    } else if (!sameOrLand(x + 1, y - 1) && spec.block.innerNe !== undefined) {
      frame = spec.block.innerNe;
    } else if (!sameOrLand(x - 1, y + 1) && spec.block.innerSw !== undefined) {
      frame = spec.block.innerSw;
    } else if (!sameOrLand(x + 1, y + 1) && spec.block.innerSe !== undefined) {
      frame = spec.block.innerSe;
    }
  }

  return {
    tilesetKey: spec.tilesetKey,
    frame,
    tint: spec.tint,
  };
}

/**
 * Computes the auto-tiled overlay frame for dirt patches or stone roads.
 */
export function computeOverlayTile(
  overlays: OverlayType[][],
  x: number,
  y: number,
): { tilesetKey: string; frame: number } | null {
  const height = overlays.length;
  const width = overlays[0]?.length ?? 0;
  if (y < 0 || y >= height || x < 0 || x >= width) return null;

  const current = overlays[y][x];
  if (current === 'none' || current === 'bridge') return null;

  const match = (nx: number, ny: number): boolean =>
    ny >= 0 && ny < height && nx >= 0 && nx < width && overlays[ny][nx] === current;

  const hasN = match(x, y - 1);
  const hasE = match(x + 1, y);
  const hasS = match(x, y + 1);
  const hasW = match(x - 1, y);

  if (current === 'dirt') {
    const mask = (hasN ? 1 : 0) | (hasE ? 2 : 0) | (hasS ? 4 : 0) | (hasW ? 8 : 0);
    return {
      tilesetKey: '_hoed_soil_16',
      frame: mask,
    };
  }
  return {
    tilesetKey: 'tileset_roads_stone',
    frame: resolveBlockFrame(STONE_ROAD_BLOCK, hasN, hasE, hasS, hasW),
  };
}
