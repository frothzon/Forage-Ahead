import Phaser from 'phaser';

interface RectRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
}

function stripWaterFromTexture(
  scene: Phaser.Scene,
  srcKey: string,
  destKey: string,
  regions: RectRegion[],
): void {
  if (scene.textures.exists(destKey)) return;
  const srcTex = scene.textures.get(srcKey);
  const srcImg = srcTex?.getSourceImage() as HTMLImageElement | HTMLCanvasElement | undefined;
  if (!srcImg || !srcImg.width || !srcImg.height) return;

  const canvasTex = scene.textures.createCanvas(destKey, srcImg.width, srcImg.height);
  if (!canvasTex) return;
  const ctx = canvasTex.getContext();
  ctx.drawImage(srcImg, 0, 0);

  const imgData = ctx.getImageData(0, 0, srcImg.width, srcImg.height);
  const data = imgData.data;

  // Franuka baked water (#4fa4b8) and shoreline foam trim (#92e8c0)
  for (const reg of regions) {
    const x0 = Math.max(0, reg.x);
    const y0 = Math.max(0, reg.y);
    const x1 = Math.min(srcImg.width, reg.x + reg.w);
    const y1 = Math.min(srcImg.height, reg.y + reg.h);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * srcImg.width + x) * 4;
        if (data[i + 3] === 0) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Flat baked water -> transparent so animated world ocean shows cleanly up to rock/land edge
        if (colorDist(r, g, b, 0x4f, 0xa4, 0xb8) <= 14) {
          data[i + 3] = 0;
        } else if (colorDist(r, g, b, 0x92, 0xe8, 0xc0) <= 14) {
          // Soften foam fringe so it blends gracefully into ocean caustics & waves
          data[i + 3] = Math.min(data[i + 3], 115);
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  canvasTex.refresh();
}

/**
 * Strips baked static water pixels from shoreline/coastline tiles so the dynamic
 * animated OceanSystem waves, caustics, and reflections meet land edges cleanly without overlap.
 */
export function ensureCleanTilesets(scene: Phaser.Scene): void {
  stripWaterFromTexture(scene, 'tileset_coastlines', 'tileset_coastlines_clean', [
    { x: 0, y: 0, w: 96, h: 176 },
  ]);
  stripWaterFromTexture(scene, 'tileset_autumn', 'tileset_autumn_clean', [
    // Rows 9..11, Cols 0..2 coastline block (plus 3,8 water tile)
    { x: 0, y: 128, w: 64, h: 64 },
  ]);
  stripWaterFromTexture(scene, 'tileset_winter', 'tileset_winter_clean', [
    // Rows 6..8, Cols 0..5 winter coastline + inner water corners
    { x: 0, y: 96, w: 96, h: 48 },
  ]);
}
