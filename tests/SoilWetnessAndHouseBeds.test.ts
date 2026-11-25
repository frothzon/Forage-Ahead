import { describe, expect, it } from 'vitest';
import {
  SOIL_WET_DRY_MS,
  SOIL_WET_FADE_IN_MS,
  SOIL_WET_FADE_OUT_MS,
  computeTargetSoilWetness,
  computeWetSoilTint,
  stepSoilWetness,
} from '../src/world/soilWetness';
import { OUTDOOR_NPC_BUILDINGS } from '../src/world/OutdoorBuildingStamps';

describe('soilWetness', () => {
  it('computes target wetness for rain, watered/unwatered crops, and bare soil', () => {
    expect(
      computeTargetSoilWetness({
        isRaining: true,
        hasCrop: false,
        cropStageWatered: false,
        msSinceWatered: Number.POSITIVE_INFINITY,
      }),
    ).toBe(1);

    expect(
      computeTargetSoilWetness({
        isRaining: false,
        hasCrop: true,
        cropStageWatered: true,
        msSinceWatered: SOIL_WET_DRY_MS * 10,
      }),
    ).toBe(1);

    expect(
      computeTargetSoilWetness({
        isRaining: false,
        hasCrop: true,
        cropStageWatered: false,
        msSinceWatered: 0,
      }),
    ).toBe(0);

    expect(
      computeTargetSoilWetness({
        isRaining: false,
        hasCrop: false,
        cropStageWatered: false,
        msSinceWatered: 0,
      }),
    ).toBe(1);

    expect(
      computeTargetSoilWetness({
        isRaining: false,
        hasCrop: false,
        cropStageWatered: false,
        msSinceWatered: SOIL_WET_DRY_MS - 1,
      }),
    ).toBe(1);

    expect(
      computeTargetSoilWetness({
        isRaining: false,
        hasCrop: false,
        cropStageWatered: false,
        msSinceWatered: SOIL_WET_DRY_MS,
      }),
    ).toBe(0);

    expect(
      computeTargetSoilWetness({
        isRaining: false,
        hasCrop: false,
        cropStageWatered: false,
        msSinceWatered: -10,
      }),
    ).toBe(0);
  });

  it('smoothly fades wetness in and out and clamps to [0, 1]', () => {
    const midIn = stepSoilWetness(0, 1, SOIL_WET_FADE_IN_MS / 2);
    expect(midIn).toBeCloseTo(0.5, 5);

    const fullIn = stepSoilWetness(midIn, 1, SOIL_WET_FADE_IN_MS);
    expect(fullIn).toBe(1);

    const midOut = stepSoilWetness(1, 0, SOIL_WET_FADE_OUT_MS / 2);
    expect(midOut).toBeCloseTo(0.5, 5);

    const fullOut = stepSoilWetness(midOut, 0, SOIL_WET_FADE_OUT_MS);
    expect(fullOut).toBe(0);

    // Clamping behavior for out-of-range inputs or large dt
    expect(stepSoilWetness(-0.5, 1, 0)).toBe(0);
    expect(stepSoilWetness(1.5, 0, 0)).toBe(1);
    expect(stepSoilWetness(0.5, 2, 10_000)).toBe(1);
    expect(stepSoilWetness(0.5, -2, 10_000)).toBe(0);
    expect(stepSoilWetness(0.4, 0.9, -100)).toBe(0.4);
  });

  it('interpolates wet soil tint between dry white and dark damp soil', () => {
    expect(computeWetSoilTint(0)).toBe(0xffffff);
    expect(computeWetSoilTint(1)).toBe(0x6b564a);
    expect(computeWetSoilTint(-1)).toBe(0xffffff);
    expect(computeWetSoilTint(2)).toBe(0x6b564a);

    const mid = computeWetSoilTint(0.5);
    const rMid = (mid >> 16) & 0xff;
    const gMid = (mid >> 8) & 0xff;
    const bMid = mid & 0xff;
    expect(rMid).toBeGreaterThan(0x6b);
    expect(rMid).toBeLessThan(0xff);
    expect(gMid).toBeGreaterThan(0x56);
    expect(gMid).toBeLessThan(0xff);
    expect(bMid).toBeGreaterThan(0x4a);
    expect(bMid).toBeLessThan(0xff);
  });
});

describe('OUTDOOR_NPC_BUILDINGS bed placement', () => {
  it('guarantees every NPC house has a bed matching (bedLx, bedLy) not on the front door', () => {
    const themes = ['farmer', 'blacksmith', 'alchemist', 'fisherman'] as const;
    for (const theme of themes) {
      const stamp = OUTDOOR_NPC_BUILDINGS[theme];
      const beds = stamp.placements.filter((p) => p.type === 'furniture_bed');
      expect(beds.length).toBeGreaterThanOrEqual(1);
      expect(
        beds.some((b) => b.lx === stamp.bedLx && b.ly === stamp.bedLy),
      ).toBe(true);
      for (const bed of beds) {
        expect(bed.lx === stamp.doorLx && bed.ly === stamp.doorLy).toBe(false);
      }
    }
  });
});
