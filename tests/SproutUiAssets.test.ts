import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import manifest from '../src/data/assetManifest.json';

function decodePngRgba(buf: Buffer): { width: number; height: number; data: Uint8Array } {
  let offset = 8; // skip PNG signature
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idatChunks: Buffer[] = [];

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const payload = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = payload.readUInt32BE(0);
      height = payload.readUInt32BE(4);
      colorType = payload[9];
    } else if (type === 'IDAT') {
      idatChunks.push(payload);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }

  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 4;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const recon = new Uint8Array(height * stride);
  const out = new Uint8Array(width * height * 4);

  const paeth = (a: number, b: number, c: number): number => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    return pb <= pc ? b : c;
  };

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowIn = y * (stride + 1) + 1;
    const rowOut = y * stride;
    for (let x = 0; x < stride; x++) {
      const val = raw[rowIn + x];
      const a = x >= bpp ? recon[rowOut + x - bpp] : 0;
      const b = y > 0 ? recon[rowOut - stride + x] : 0;
      const c = y > 0 && x >= bpp ? recon[rowOut - stride + x - bpp] : 0;
      let r = val;
      if (filter === 1) r = (val + a) & 0xff;
      else if (filter === 2) r = (val + b) & 0xff;
      else if (filter === 3) r = (val + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) r = (val + paeth(a, b, c)) & 0xff;
      recon[rowOut + x] = r;
    }
    for (let px = 0; px < width; px++) {
      const si = rowOut + px * bpp;
      const di = (y * width + px) * 4;
      out[di] = recon[si];
      out[di + 1] = recon[si + 1];
      out[di + 2] = recon[si + 2];
      out[di + 3] = bpp === 4 ? recon[si + 3] : 255;
    }
  }
  return { width, height, data: out };
}

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

describe('Sprout Lands UI Pack asset integration', () => {
  it('registers and writes every 9-slice texture with valid non-overlapping insets', () => {
    const nineSlices = manifest.uiNineSlices as Record<
      string,
      { key: string; top: number; right: number; bottom: number; left: number }
    >;
    const images = manifest.images as Record<string, { path: string; width: number; height: number }>;

    expect(Object.keys(nineSlices).length).toBeGreaterThan(20);

    for (const [presetId, spec] of Object.entries(nineSlices)) {
      const img = images[spec.key];
      expect(img, `Missing manifest.images entry for 9-slice "${presetId}" (${spec.key})`).toBeDefined();
      const diskPath = path.join(PUBLIC_DIR, img.path);
      expect(fs.existsSync(diskPath), `Missing PNG on disk for "${presetId}": ${diskPath}`).toBe(true);
      expect(spec.left + spec.right, `Invalid horizontal insets for "${presetId}"`).toBeLessThan(img.width);
      expect(spec.top + spec.bottom, `Invalid vertical insets for "${presetId}"`).toBeLessThan(img.height);
    }
  });

  it('registers and writes every UI spritesheet', () => {
    const uiSheets = manifest.uiSpritesheets as Record<
      string,
      { key: string; frameWidth: number; frameHeight: number; frames: number }
    >;
    const images = manifest.images as Record<string, { path: string; width: number; height: number }>;

    expect(Object.keys(uiSheets).length).toBeGreaterThanOrEqual(3);

    for (const [key, sheet] of Object.entries(uiSheets)) {
      const img = images[sheet.key];
      expect(img, `Missing manifest.images entry for spritesheet "${key}"`).toBeDefined();
      expect(fs.existsSync(path.join(PUBLIC_DIR, img.path))).toBe(true);
      expect(img.width).toBeGreaterThanOrEqual(sheet.frameWidth * sheet.frames);
    }
  });

  it('extracts all 5 Sprout Lands pixel TTF fonts', () => {
    const fonts = [
      'pixelFont-1-5x4-sproutLands.ttf',
      'pixelFont-2-5x5-sproutLands.ttf',
      'pixelFont-3-7x5-sproutLands.ttf',
      'pixelFont-4-7x7-sproutLands.ttf',
      'pixelFont-7-8x14-sproutLands.ttf',
    ];
    for (const font of fonts) {
      expect(fs.existsSync(path.join(PUBLIC_DIR, 'assets', 'fonts', font))).toBe(true);
    }
  });

  it('registers tight scrollbar and slider control assets', () => {
    const images = manifest.images as Record<string, { path: string; width: number; height: number }>;
    const requiredKeys = [
      'sprout_ui/controls/scrollbar_v_track_thick',
      'sprout_ui/controls/scrollbar_v_thumb_dark',
      'sprout_ui/controls/scrollbar_v_thumb_med',
      'sprout_ui/controls/scrollbar_v_thumb_light',
      'sprout_ui/controls/slider_h_track_thick',
      'sprout_ui/controls/slider_h_thumb_light',
    ];
    for (const key of requiredKeys) {
      const img = images[key];
      expect(img, `Missing scrollbar/slider image "${key}"`).toBeDefined();
      expect(fs.existsSync(path.join(PUBLIC_DIR, img.path)), `Missing PNG for "${key}"`).toBe(true);
    }
  });

  it('has zero transparent outer padding and intact 4-sided borders on enclosed trays, dialog frame, and buttons', () => {
    const nineSlices = manifest.uiNineSlices as Record<
      string,
      { key: string; top: number; right: number; bottom: number; left: number }
    >;
    const images = manifest.images as Record<string, { path: string; width: number; height: number }>;
    const presetsToCheck = [
      'tray_light_enclosed',
      'tray_med_enclosed',
      'tray_dark_enclosed',
      'dialog_frame',
      'btn_rect_light_normal',
      'btn_rect_light_pressed',
      'btn_rect_tan_normal',
      'btn_rect_tan_pressed',
      'btn_rect_dark_normal',
      'btn_rect_dark_pressed',
      'btn_rect_white_normal',
      'btn_rect_white_pressed',
    ];

    for (const presetId of presetsToCheck) {
      const spec = nineSlices[presetId];
      expect(spec, `Missing 9-slice preset "${presetId}"`).toBeDefined();
      const diskPath = path.join(PUBLIC_DIR, images[spec.key].path);
      const png = decodePngRgba(fs.readFileSync(diskPath));
      const { width, height, data } = png;

      const rowHasOpaque = (y: number) => {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] > 0) return true;
        }
        return false;
      };
      const colHasOpaque = (x: number) => {
        for (let y = 0; y < height; y++) {
          if (data[(y * width + x) * 4 + 3] > 0) return true;
        }
        return false;
      };

      expect(rowHasOpaque(0), `${presetId} top edge has transparent outer row`).toBe(true);
      expect(rowHasOpaque(height - 1), `${presetId} bottom edge has transparent outer row`).toBe(true);
      expect(colHasOpaque(0), `${presetId} left edge has transparent outer column`).toBe(true);
      expect(colHasOpaque(width - 1), `${presetId} right edge has transparent outer column`).toBe(true);

      // Verify enclosed 4-sided mid-edge pixels are opaque (not open on one side)
      const midX = Math.floor(width / 2);
      const midY = Math.floor(height / 2);
      const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3];
      expect(alphaAt(midX, 0), `${presetId} missing top border at center`).toBeGreaterThan(0);
      expect(alphaAt(midX, height - 1), `${presetId} missing bottom border at center`).toBeGreaterThan(0);
      expect(alphaAt(0, midY), `${presetId} missing left border at center`).toBeGreaterThan(0);
      expect(alphaAt(width - 1, midY), `${presetId} missing right border at center`).toBeGreaterThan(0);
    }
  });
});
