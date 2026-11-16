import type { BiomeKind } from '../data/islands';

export type WeatherKind = 'sunny' | 'cloudy' | 'rain' | 'snow' | 'sandstorm';

export interface WindState {
  angle: number;
  dirX: number;
  dirY: number;
  /** 0.45 (calm) .. 1.90 (strong gale) — scales foliage sway & ocean waves */
  strength: number;
  compass: string;
}

export const WEATHER_LABELS: Record<WeatherKind, string> = {
  sunny: 'Sunny',
  cloudy: 'Cloudy',
  rain: 'Rain',
  snow: 'Snow',
  sandstorm: 'Sandstorm',
};

function hashSeed(n: number): number {
  let x = (Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0) || 1;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function getCompassLabel(angle: number): string {
  const dirs = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  const norm = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const idx = Math.round(norm / (Math.PI / 4)) % 8;
  return dirs[idx];
}

export function rollWindForDay(dayNumber: number, overrideStrength?: number): WindState {
  const r1 = hashSeed(dayNumber * 131 + 17);
  const r2 = hashSeed(dayNumber * 257 + 91);
  const angle = r1 * Math.PI * 2;
  const strength = overrideStrength ?? Number((0.45 + r2 * 1.4).toFixed(2));
  return {
    angle,
    dirX: Math.cos(angle),
    dirY: Math.sin(angle),
    strength,
    compass: getCompassLabel(angle),
  };
}

function fadeQuintic(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function gradDot(ix: number, iy: number, dx: number, dy: number, seed: number): number {
  const h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) >>> 0;
  const ang = (((h ^ (h >>> 13)) >>> 0) / 4294967296) * Math.PI * 2;
  return Math.cos(ang) * dx + Math.sin(ang) * dy;
}

/**
 * Tileable (toroidal) 2D gradient Perlin noise over `[0, period)`.
 */
export function periodicPerlin2D(x: number, y: number, period: number, seed = 42): number {
  const wx = ((x % period) + period) % period;
  const wy = ((y % period) + period) % period;
  const x0 = Math.floor(wx);
  const y0 = Math.floor(wy);
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const fx = wx - x0;
  const fy = wy - y0;
  const u = fadeQuintic(fx);
  const v = fadeQuintic(fy);

  const n00 = gradDot(x0, y0, fx, fy, seed);
  const n10 = gradDot(x1, y0, fx - 1, fy, seed);
  const n01 = gradDot(x0, y1, fx, fy - 1, seed);
  const n11 = gradDot(x1, y1, fx - 1, fy - 1, seed);

  const nx0 = n00 + (n10 - n00) * u;
  const nx1 = n01 + (n11 - n01) * u;
  return nx0 + (nx1 - nx0) * v;
}

/**
 * Multi-octave periodic 2D Perlin FBM returning ~[-0.7, 0.7] normalized cleanly around 0.
 */
export function periodicPerlinFbm2D(uNorm: number, vNorm: number, basePeriod = 4, seed = 42): number {
  const o1 = periodicPerlin2D(uNorm * basePeriod, vNorm * basePeriod, basePeriod, seed);
  const o2 = periodicPerlin2D(uNorm * basePeriod * 2, vNorm * basePeriod * 2, basePeriod * 2, seed + 17);
  const o3 = periodicPerlin2D(uNorm * basePeriod * 4, vNorm * basePeriod * 4, basePeriod * 4, seed + 53);
  return o1 * 0.58 + o2 * 0.29 + o3 * 0.13;
}

export function rollWeatherForBiome(biome: BiomeKind, dayNumber: number): WeatherKind {
  const r = hashSeed(dayNumber * 409 + biome.charCodeAt(0) * 37);
  switch (biome) {
    case 'winter':
      if (r < 0.56) return 'snow';
      if (r < 0.84) return 'cloudy';
      return 'sunny';
    case 'autumn':
      if (r < 0.48) return 'sunny';
      if (r < 0.78) return 'cloudy';
      return 'sandstorm';
    case 'graveyard':
      if (r < 0.52) return 'cloudy';
      if (r < 0.88) return 'rain';
      return 'sunny';
    case 'infernal':
      if (r < 0.45) return 'cloudy';
      if (r < 0.72) return 'sandstorm';
      return 'sunny';
    case 'grass':
    default:
      if (r < 0.42) return 'sunny';
      if (r < 0.72) return 'cloudy';
      return 'rain';
  }
}
