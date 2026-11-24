import { describe, expect, it } from 'vitest';
import { computeResponsiveZoom } from '../src/core/ViewportScaler';
import { clampMobileBuildControlPos } from '../src/ui/HudController';

describe('ViewportScaler.computeResponsiveZoom', () => {
  const WORLD_PX = 2240; // WORLD_TILES (140) * TILE_PX (16)

  it.each([
    { label: '720p', vw: 1280, vh: 720 },
    { label: '1080p', vw: 1920, vh: 1080 },
    { label: '1440p', vw: 2560, vh: 1440 },
    { label: '4K UHD', vw: 3840, vh: 2160 },
    { label: 'Ultrawide 21:9', vw: 3440, vh: 1440 },
    { label: 'Mobile Portrait', vw: 390, vh: 844 },
  ])('never shows out-of-bounds world space at $label ($vwx$vh)', ({ vw, vh }) => {
    const zoom = computeResponsiveZoom(vw, vh, {
      worldWidthPx: WORLD_PX,
      worldHeightPx: WORLD_PX,
    });

    expect(zoom).toBeGreaterThan(0);
    expect(vw / zoom).toBeLessThanOrEqual(WORLD_PX + 1e-6);
    expect(vh / zoom).toBeLessThanOrEqual(WORLD_PX + 1e-6);
  });

  it('clamps to minZoom floor when viewport fits comfortably inside world bounds', () => {
    const zoom = computeResponsiveZoom(1280, 720, {
      worldWidthPx: WORLD_PX,
      worldHeightPx: WORLD_PX,
      minZoom: 1.65,
    });
    expect(zoom).toBeCloseTo(1.65, 4);
  });

  it('scales zoom up proportionally on high-res 4K displays while keeping room bounds safe', () => {
    const smallRoomZoom = computeResponsiveZoom(3840, 2160, {
      worldWidthPx: 896,
      worldHeightPx: 640,
    });
    expect(3840 / smallRoomZoom).toBeLessThanOrEqual(896 + 1e-6);
    expect(2160 / smallRoomZoom).toBeLessThanOrEqual(640 + 1e-6);
    expect(smallRoomZoom).toBeGreaterThanOrEqual(3840 / 896);
  });
});

describe('clampMobileBuildControlPos', () => {
  const vw = 844;
  const vh = 390;
  const boxWidth = 220;
  const boxHeight = 40;
  // halfW = 110, edgePadX = 28 => minX = 138, maxX = 844 - 110 - 28 = 706
  // boxH = 40, topPad = 76, bottomPad = 128 => minY = 116, maxY = 390 - 128 = 262

  it('passes through coordinates comfortably inside safe bounds', () => {
    expect(clampMobileBuildControlPos(420, 200, vw, vh, boxWidth, boxHeight)).toEqual({
      x: 420,
      y: 200,
    });
  });

  it('clamps left, right, top, and bottom edges with safe padding', () => {
    expect(clampMobileBuildControlPos(10, 200, vw, vh, boxWidth, boxHeight)).toEqual({
      x: 138,
      y: 200,
    });
    expect(clampMobileBuildControlPos(830, 200, vw, vh, boxWidth, boxHeight)).toEqual({
      x: 706,
      y: 200,
    });
    expect(clampMobileBuildControlPos(420, 20, vw, vh, boxWidth, boxHeight)).toEqual({
      x: 420,
      y: 116,
    });
    expect(clampMobileBuildControlPos(420, 380, vw, vh, boxWidth, boxHeight)).toEqual({
      x: 420,
      y: 262,
    });
  });
});
