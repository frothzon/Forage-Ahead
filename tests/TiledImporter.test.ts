import { describe, it, expect } from 'vitest';
import { parseTiledJson, type TiledMapJson } from '../src/world/TiledImporter';

describe('TiledImporter', () => {
  it('parses Tiled JSON terrain, overlay, and object marker layers', () => {
    const sample: TiledMapJson = {
      width: 3,
      height: 3,
      tilewidth: 16,
      tileheight: 16,
      layers: [
        {
          name: 'terrain',
          type: 'tilelayer',
          data: [
            0, 1, 0,
            1, 2, 1,
            0, 3, 0,
          ],
        },
        {
          name: 'overlays',
          type: 'tilelayer',
          data: [
            0, 2, 0,
            1, 2, 1,
            0, 3, 0,
          ],
        },
        {
          name: 'spawns',
          type: 'objectgroup',
          objects: [{ name: 'boss_portal', type: 'dungeon', x: 32, y: 16 }],
        },
      ],
    };

    const parsed = parseTiledJson(sample);
    expect(parsed.terrain[0][0]).toBe('water');
    expect(parsed.terrain[0][1]).toBe('grass');
    expect(parsed.terrain[1][1]).toBe('autumn');
    expect(parsed.terrain[2][1]).toBe('winter');
    expect(parsed.overlays[1][0]).toBe('dirt');
    expect(parsed.overlays[1][1]).toBe('road');
    expect(parsed.overlays[2][1]).toBe('bridge');
    expect(parsed.markers).toEqual([{ kind: 'dungeon', tx: 2, ty: 1 }]);
  });
});
