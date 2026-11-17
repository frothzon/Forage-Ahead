import { describe, it, expect } from 'vitest';
import {
  BIOME_TILESETS,
  STONE_ROAD_BLOCK,
  computeOverlayTile,
  computeTerrainTile,
  resolveBlockFrame,
  type OverlayType,
  type TerrainType,
} from '../src/world/AutoTiler';

describe('AutoTiler', () => {
  it('resolves outer 3x3 island corners, edges, and center correctly', () => {
    const grid: TerrainType[][] = [
      ['water', 'water', 'water', 'water', 'water'],
      ['water', 'grass', 'grass', 'grass', 'water'],
      ['water', 'grass', 'grass', 'grass', 'water'],
      ['water', 'grass', 'grass', 'grass', 'water'],
      ['water', 'water', 'water', 'water', 'water'],
    ];

    const b = BIOME_TILESETS.grass.block;
    expect(computeTerrainTile(grid, 0, 0)).toBeNull();
    expect(computeTerrainTile(grid, 1, 1)?.frame).toBe(b.tl);
    expect(computeTerrainTile(grid, 2, 1)?.frame).toBe(b.t);
    expect(computeTerrainTile(grid, 3, 1)?.frame).toBe(b.tr);
    expect(computeTerrainTile(grid, 1, 2)?.frame).toBe(b.l);
    expect(computeTerrainTile(grid, 2, 2)?.frame).toBe(b.c);
    expect(computeTerrainTile(grid, 3, 2)?.frame).toBe(b.r);
    expect(computeTerrainTile(grid, 1, 3)?.frame).toBe(b.bl);
    expect(computeTerrainTile(grid, 2, 3)?.frame).toBe(b.b);
    expect(computeTerrainTile(grid, 3, 3)?.frame).toBe(b.br);
  });

  it('applies biome-specific tilesets and tints for graveyard and infernal', () => {
    const grid: TerrainType[][] = [
      ['graveyard', 'graveyard'],
      ['infernal', 'infernal'],
    ];
    const gTile = computeTerrainTile(grid, 0, 0);
    const iTile = computeTerrainTile(grid, 0, 1);
    expect(gTile?.tilesetKey).toBe('tileset_coastlines');
    expect(gTile?.tint).toBeDefined();
    expect(iTile?.tilesetKey).toBe('tileset_autumn');
    expect(iTile?.tint).toBeDefined();
  });

  it('resolves 1-tile-wide horizontal and vertical stone road strips', () => {
    const overlays: OverlayType[][] = [
      ['none', 'road', 'none', 'none'],
      ['none', 'road', 'none', 'none'],
      ['none', 'road', 'road', 'road'],
    ];
    expect(computeOverlayTile(overlays, 1, 0)?.frame).toBe(STONE_ROAD_BLOCK.vTop);
    expect(computeOverlayTile(overlays, 1, 1)?.frame).toBe(STONE_ROAD_BLOCK.vMid);
    expect(computeOverlayTile(overlays, 2, 2)?.frame).toBe(STONE_ROAD_BLOCK.hMid);
    expect(computeOverlayTile(overlays, 3, 2)?.frame).toBe(STONE_ROAD_BLOCK.hRight);
    expect(resolveBlockFrame(STONE_ROAD_BLOCK, false, false, false, false)).toBe(
      STONE_ROAD_BLOCK.single,
    );
  });

  it('computes exact 4-bit bitmask frames (0..15) for hoed dirt overlays', () => {
    const overlays: OverlayType[][] = [
      ['none', 'dirt', 'none'],
      ['dirt', 'dirt', 'dirt'],
      ['none', 'dirt', 'none'],
    ];
    expect(computeOverlayTile(overlays, 1, 1)).toEqual({ tilesetKey: '_hoed_soil_16', frame: 15 });
    expect(computeOverlayTile(overlays, 1, 0)).toEqual({ tilesetKey: '_hoed_soil_16', frame: 4 });
    expect(computeOverlayTile(overlays, 2, 1)).toEqual({ tilesetKey: '_hoed_soil_16', frame: 8 });
    expect(computeOverlayTile([['dirt']], 0, 0)).toEqual({ tilesetKey: '_hoed_soil_16', frame: 0 });
  });
});
