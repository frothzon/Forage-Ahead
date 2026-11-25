export const SOIL_WET_DRY_MS = 45_000;
export const SOIL_WET_FADE_IN_MS = 650;
export const SOIL_WET_FADE_OUT_MS = 1800;

export interface TargetSoilWetnessParams {
  isRaining: boolean;
  hasCrop: boolean;
  cropStageWatered: boolean;
  msSinceWatered: number;
  dryDurationMs?: number;
}

/**
 * Computes the target wetness (`0` = dry, `1` = saturated) for a tilled soil tile.
 * Rain keeps all tilled soil wet; planted crops keep soil wet while their current
 * stage is watered; bare soil stays wet for `dryDurationMs` after watering.
 */
export function computeTargetSoilWetness(params: TargetSoilWetnessParams): number {
  if (params.isRaining) return 1;
  if (params.hasCrop) return params.cropStageWatered ? 1 : 0;
  const duration = params.dryDurationMs ?? SOIL_WET_DRY_MS;
  return params.msSinceWatered >= 0 && params.msSinceWatered < duration ? 1 : 0;
}

/**
 * Smoothly steps soil wetness toward `target` over `dtMs`, clamped to `[0, 1]`.
 */
export function stepSoilWetness(current: number, target: number, dtMs: number): number {
  const c = Math.max(0, Math.min(1, current));
  const t = Math.max(0, Math.min(1, target));
  const dt = Math.max(0, dtMs);
  if (t > c) {
    return Math.min(t, c + dt / SOIL_WET_FADE_IN_MS);
  }
  if (t < c) {
    return Math.max(t, c - dt / SOIL_WET_FADE_OUT_MS);
  }
  return c;
}

/**
 * Computes the sprite tint for a tilled soil tile from dry (`0xffffff`) to
 * dark damp soil (`0x6b564a`).
 */
export function computeWetSoilTint(wetness: number): number {
  const w = Math.max(0, Math.min(1, wetness));
  const r = Math.round(255 + (107 - 255) * w);
  const g = Math.round(255 + (86 - 255) * w);
  const b = Math.round(255 + (74 - 255) * w);
  return (r << 16) | (g << 8) | b;
}
