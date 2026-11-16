import type { OverlayType, TerrainType } from './AutoTiler';

export interface TiledLayerJson {
  name: string;
  type: 'tilelayer' | 'objectgroup';
  width?: number;
  height?: number;
  data?: number[];
  objects?: Array<{ name?: string; type?: string; x: number; y: number }>;
}

export interface TiledMapJson {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayerJson[];
}

export interface ImportedChunk {
  width: number;
  height: number;
  terrain: TerrainType[][];
  overlays: OverlayType[][];
  markers: Array<{ kind: string; tx: number; ty: number }>;
}

const GID_TO_TERRAIN: Record<number, TerrainType> = {
  0: 'water',
  1: 'grass',
  2: 'autumn',
  3: 'winter',
  4: 'graveyard',
  5: 'infernal',
};

const GID_TO_OVERLAY: Record<number, OverlayType> = {
  0: 'none',
  1: 'dirt',
  2: 'road',
  3: 'bridge',
};

/**
 * Parses a Tiled (.tmj / JSON) map into logical terrain, overlay, and marker grids
 * that feed directly into AutoTiler and OverworldScene.
 */
export function parseTiledJson(json: TiledMapJson): ImportedChunk {
  const { width, height, tilewidth, tileheight, layers } = json;
  const terrain: TerrainType[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => 'water' as TerrainType),
  );
  const overlays: OverlayType[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => 'none' as OverlayType),
  );
  const markers: Array<{ kind: string; tx: number; ty: number }> = [];

  for (const layer of layers) {
    if (layer.type === 'tilelayer' && Array.isArray(layer.data)) {
      const lname = layer.name.toLowerCase();
      for (let i = 0; i < layer.data.length && i < width * height; i++) {
        const y = Math.floor(i / width);
        const x = i % width;
        const gid = layer.data[i];
        if (lname.includes('overlay')) {
          overlays[y][x] = GID_TO_OVERLAY[gid] ?? 'none';
        } else {
          terrain[y][x] = GID_TO_TERRAIN[gid] ?? 'water';
        }
      }
    } else if (layer.type === 'objectgroup' && Array.isArray(layer.objects)) {
      for (const obj of layer.objects) {
        markers.push({
          kind: obj.type || obj.name || 'marker',
          tx: Math.floor(obj.x / (tilewidth || 16)),
          ty: Math.floor(obj.y / (tileheight || 16)),
        });
      }
    }
  }

  return { width, height, terrain, overlays, markers };
}
