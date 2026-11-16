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

function registerGridFrames(tex: Phaser.Textures.CanvasTexture, width: number, height: number): void {
  const cols = Math.floor(width / 16);
  const rows = Math.floor(height / 16);
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tex.add(idx++, 0, c * 16, r * 16, 16, 16);
    }
  }
}

function stripWaterFromTexture(
  scene: Phaser.Scene,
  srcKey: string,
  destKey: string,
  reflKey: string,
  regions: RectRegion[],
): void {
  const srcTex = scene.textures.get(srcKey);
  const srcImg = srcTex?.getSourceImage() as HTMLImageElement | HTMLCanvasElement | undefined;
  if (!srcImg || !srcImg.width || !srcImg.height) return;

  const w = srcImg.width;
  const h = srcImg.height;

  // Build cleaned tileset (baked static water stripped out)
  if (!scene.textures.exists(destKey)) {
    const cleanTex = scene.textures.createCanvas(destKey, w, h);
    if (!cleanTex) return;
    const ctx = cleanTex.getContext();
    ctx.drawImage(srcImg, 0, 0);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    for (const reg of regions) {
      const x0 = Math.max(0, reg.x);
      const y0 = Math.max(0, reg.y);
      const x1 = Math.min(w, reg.x + reg.w);
      const y1 = Math.min(h, reg.y + reg.h);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          if (data[i + 3] === 0) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (colorDist(r, g, b, 0x4f, 0xa4, 0xb8) <= 14) {
            data[i + 3] = 0;
          } else if (colorDist(r, g, b, 0x92, 0xe8, 0xc0) <= 14) {
            data[i + 3] = Math.min(data[i + 3], 115);
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    cleanTex.refresh();
  }

  // Build vertically flipped & softly fading reflection atlas matching the exact cutout silhouette
  if (!scene.textures.exists(reflKey)) {
    const cleanTex = scene.textures.get(destKey);
    const cleanCanvas = cleanTex.getSourceImage() as HTMLCanvasElement;
    const reflTex = scene.textures.createCanvas(reflKey, w, h);
    if (!reflTex) return;

    const cleanCtx = cleanCanvas.getContext('2d')!;
    const srcPixels = cleanCtx.getImageData(0, 0, w, h).data;
    const reflCtx = reflTex.getContext();
    const outImg = reflCtx.createImageData(w, h);
    const out = outImg.data;

    const cols = Math.floor(w / 16);
    const rows = Math.floor(h / 16);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const bx = col * 16;
        const by = row * 16;
        for (let ly = 0; ly < 16; ly++) {
          // Fade smoothly from 0.42 right under the rock base down to 0 by row 11 so no hard rectangle edge appears
          const fade = Math.pow(Math.max(0, 1 - ly / 11), 1.55) * 0.42;
          if (fade <= 0.01) continue;
          const srcLy = 15 - ly;
          for (let lx = 0; lx < 16; lx++) {
            const si = ((by + srcLy) * w + (bx + lx)) * 4;
            const a = srcPixels[si + 3];
            if (a === 0) continue;
            const di = ((by + ly) * w + (bx + lx)) * 4;
            // Cool water-tinted reflection
            out[di] = Math.round(srcPixels[si] * 0.55 + 0x26 * 0.45);
            out[di + 1] = Math.round(srcPixels[si + 1] * 0.65 + 0x6c * 0.35);
            out[di + 2] = Math.round(srcPixels[si + 2] * 0.72 + 0x8a * 0.28);
            out[di + 3] = Math.round(a * fade);
          }
        }
      }
    }

    reflCtx.putImageData(outImg, 0, 0);
    reflTex.refresh();
    registerGridFrames(reflTex, w, h);
  }
}

/**
 * Strips baked static water pixels from shoreline/coastline tiles and generates matching
 * vertically-flipped silhouette reflection atlases so ocean waves and reflections match land cutouts cleanly.
 */
export function ensureCleanTilesets(scene: Phaser.Scene): void {
  stripWaterFromTexture(scene, 'tileset_coastlines', 'tileset_coastlines_clean', 'tileset_coastlines_refl', [
    { x: 0, y: 0, w: 96, h: 176 },
  ]);
  stripWaterFromTexture(scene, 'tileset_autumn', 'tileset_autumn_clean', 'tileset_autumn_refl', [
    { x: 0, y: 128, w: 64, h: 64 },
  ]);
  stripWaterFromTexture(scene, 'tileset_winter', 'tileset_winter_clean', 'tileset_winter_refl', [
    { x: 0, y: 96, w: 96, h: 48 },
  ]);
}
