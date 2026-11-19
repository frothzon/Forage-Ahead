import type { SFX } from '../core/SoundFX';

export type SfxKey = {
  [K in keyof typeof SFX]: (typeof SFX)[K] extends (...args: never[]) => unknown ? K : never;
}[keyof typeof SFX];

export type EffectStep =
  | {
      type: 'particles';
      delayMs: number;
      texture: string | string[];
      count: number;
      speed: [number, number];
      lifespan: [number, number];
      gravityY?: number;
      scale?: [number, number];
      tint?: number;
      blendMode?: 'NORMAL' | 'ADD';
      bounce?: boolean;
      riseOnly?: boolean;
    }
  | { type: 'sound'; delayMs: number; sfx: SfxKey; pitchScale?: number }
  | {
      type: 'ring';
      delayMs: number;
      radiusStart: number;
      radiusEnd: number;
      color: number;
      durationMs: number;
      lineWidth?: number;
    }
  | {
      type: 'flashLight';
      delayMs: number;
      color: number;
      radius: number;
      intensity: number;
      durationMs: number;
    }
  | { type: 'shake'; delayMs: number; trauma: number }
  | { type: 'hitstop'; delayMs: number; durationMs: number };

export interface EffectSequenceDef {
  id: string;
  steps: EffectStep[];
}

const NODE_BREAK_WOOD: EffectSequenceDef = {
  id: 'node_break_wood',
  steps: [
    {
      type: 'particles',
      delayMs: 0,
      texture: ['extras/Particle_dust_1', 'extras/Particle_dust_2'],
      count: 6,
      speed: [24, 52],
      lifespan: [140, 220],
      scale: [0.9, 0.2],
      tint: 0xfff4d2,
      blendMode: 'ADD',
    },
    { type: 'sound', delayMs: 0, sfx: 'playChop' },
    { type: 'shake', delayMs: 0, trauma: 0.16 },
    {
      type: 'particles',
      delayMs: 40,
      texture: ['extras/Wood_particle1', 'extras/Wood_particle2'],
      count: 8,
      speed: [28, 66],
      lifespan: [360, 540],
      gravityY: 165,
      scale: [1.0, 0.75],
      bounce: true,
    },
    {
      type: 'particles',
      delayMs: 90,
      texture: ['extras/Particle_dust_1', 'extras/Particle_dust_2', 'extras/Particle_dust_3', 'extras/Particle_dust_4'],
      count: 7,
      speed: [10, 26],
      lifespan: [320, 480],
      gravityY: -36,
      scale: [0.7, 1.25],
      tint: 0xd8c8a8,
      riseOnly: true,
    },
    { type: 'sound', delayMs: 90, sfx: 'playBreakProp' },
  ],
};

const NODE_BREAK_ORE: EffectSequenceDef = {
  id: 'node_break_ore',
  steps: [
    {
      type: 'particles',
      delayMs: 0,
      texture: ['extras/Particle_dust_1', 'extras/Particle_dust_2'],
      count: 7,
      speed: [30, 62],
      lifespan: [130, 210],
      scale: [0.95, 0.2],
      tint: 0xffffff,
      blendMode: 'ADD',
    },
    { type: 'sound', delayMs: 0, sfx: 'playMine' },
    { type: 'shake', delayMs: 0, trauma: 0.18 },
    {
      type: 'particles',
      delayMs: 40,
      texture: ['extras/Rock_particle1', 'extras/Rock_particle2'],
      count: 9,
      speed: [32, 72],
      lifespan: [380, 560],
      gravityY: 185,
      scale: [1.05, 0.7],
      bounce: true,
    },
    {
      type: 'particles',
      delayMs: 90,
      texture: ['extras/Particle_dust_1', 'extras/Particle_dust_2', 'extras/Particle_dust_3', 'extras/Particle_dust_4'],
      count: 7,
      speed: [10, 28],
      lifespan: [320, 480],
      gravityY: -32,
      scale: [0.75, 1.3],
      tint: 0xbac4d4,
      riseOnly: true,
    },
    { type: 'sound', delayMs: 90, sfx: 'playBreakProp' },
  ],
};

export const EFFECT_SEQUENCES: Record<string, EffectSequenceDef> = {
  node_break_wood: NODE_BREAK_WOOD,
  node_break_ore: NODE_BREAK_ORE,
  ore_shatter: { ...NODE_BREAK_ORE, id: 'ore_shatter' },

  crit_strike: {
    id: 'crit_strike',
    steps: [
      { type: 'hitstop', delayMs: 0, durationMs: 45 },
      { type: 'sound', delayMs: 0, sfx: 'playHit', pitchScale: 1.15 },
      {
        type: 'particles',
        delayMs: 0,
        texture: ['extras/Particle_dust_1', 'extras/Particle_dust_2'],
        count: 8,
        speed: [42, 84],
        lifespan: [140, 240],
        scale: [1.1, 0.2],
        tint: 0xffe066,
        blendMode: 'ADD',
      },
      { type: 'flashLight', delayMs: 0, color: 0xffe066, radius: 28, intensity: 1.2, durationMs: 140 },
      { type: 'ring', delayMs: 30, radiusStart: 4, radiusEnd: 26, color: 0xffe066, durationMs: 220, lineWidth: 2 },
      { type: 'shake', delayMs: 30, trauma: 0.28 },
      {
        type: 'particles',
        delayMs: 80,
        texture: ['extras/Particle_dust_3', 'extras/Particle_dust_4'],
        count: 6,
        speed: [14, 34],
        lifespan: [260, 420],
        gravityY: -42,
        scale: [0.85, 0.15],
        tint: 0xffa63d,
        blendMode: 'ADD',
        riseOnly: true,
      },
    ],
  },

  island_unlock: {
    id: 'island_unlock',
    steps: [
      { type: 'sound', delayMs: 0, sfx: 'playIslandUnlock' },
      { type: 'ring', delayMs: 0, radiusStart: 12, radiusEnd: 88, color: 0x7ce8ff, durationMs: 480, lineWidth: 2.5 },
      { type: 'shake', delayMs: 0, trauma: 0.25 },
      {
        type: 'particles',
        delayMs: 180,
        texture: ['extras/Particle_dust_1', 'extras/Particle_dust_2'],
        count: 14,
        speed: [22, 54],
        lifespan: [420, 660],
        gravityY: -75,
        scale: [1.05, 0.25],
        tint: 0xffe066,
        blendMode: 'ADD',
        riseOnly: true,
      },
      { type: 'flashLight', delayMs: 180, color: 0xffe066, radius: 58, intensity: 1.1, durationMs: 360 },
      {
        type: 'particles',
        delayMs: 420,
        texture: ['extras/Leaf_particle1', 'extras/Leaf_particle2', 'extras/Leaf_particle3'],
        count: 16,
        speed: [32, 78],
        lifespan: [550, 860],
        gravityY: 65,
        scale: [1.0, 0.7],
      },
    ],
  },

  boss_defeat: {
    id: 'boss_defeat',
    steps: [
      { type: 'sound', delayMs: 0, sfx: 'playExplosion', pitchScale: 0.9 },
      { type: 'flashLight', delayMs: 0, color: 0xff9f43, radius: 34, intensity: 1.2, durationMs: 160 },
      { type: 'shake', delayMs: 0, trauma: 0.3 },
      {
        type: 'particles',
        delayMs: 0,
        texture: ['extras/Particle_dust_1', 'extras/Particle_dust_2'],
        count: 8,
        speed: [28, 64],
        lifespan: [220, 360],
        scale: [1.1, 0.25],
        tint: 0xff9f43,
        blendMode: 'ADD',
      },
      { type: 'sound', delayMs: 140, sfx: 'playExplosion', pitchScale: 1.0 },
      { type: 'flashLight', delayMs: 140, color: 0xff6b6b, radius: 40, intensity: 1.3, durationMs: 170 },
      { type: 'shake', delayMs: 140, trauma: 0.35 },
      { type: 'sound', delayMs: 280, sfx: 'playExplosion', pitchScale: 1.1 },
      { type: 'flashLight', delayMs: 280, color: 0xffe066, radius: 46, intensity: 1.4, durationMs: 180 },
      { type: 'shake', delayMs: 280, trauma: 0.42 },
      { type: 'sound', delayMs: 420, sfx: 'playExplosion', pitchScale: 1.25 },
      { type: 'flashLight', delayMs: 420, color: 0xffffff, radius: 54, intensity: 1.5, durationMs: 200 },
      { type: 'shake', delayMs: 420, trauma: 0.5 },
      { type: 'hitstop', delayMs: 550, durationMs: 70 },
      { type: 'ring', delayMs: 550, radiusStart: 8, radiusEnd: 92, color: 0xffe066, durationMs: 520, lineWidth: 3 },
      { type: 'sound', delayMs: 550, sfx: 'playBossDefeat' },
      { type: 'shake', delayMs: 550, trauma: 0.72 },
      {
        type: 'particles',
        delayMs: 550,
        texture: ['extras/Particle_dust_1', 'extras/Particle_dust_2', 'extras/Particle_dust_3'],
        count: 20,
        speed: [40, 105],
        lifespan: [440, 740],
        gravityY: 60,
        scale: [1.3, 0.2],
        tint: 0xffe066,
        blendMode: 'ADD',
      },
    ],
  },

  forge_complete: {
    id: 'forge_complete',
    steps: [
      { type: 'sound', delayMs: 0, sfx: 'playCraft' },
      { type: 'flashLight', delayMs: 0, color: 0xffb84d, radius: 38, intensity: 1.2, durationMs: 280 },
      { type: 'ring', delayMs: 20, radiusStart: 4, radiusEnd: 30, color: 0xffd275, durationMs: 300, lineWidth: 2 },
      {
        type: 'particles',
        delayMs: 0,
        texture: ['extras/Particle_dust_1', 'extras/Particle_dust_2'],
        count: 12,
        speed: [18, 48],
        lifespan: [360, 620],
        gravityY: -80,
        scale: [1.0, 0.15],
        tint: 0xffe066,
        blendMode: 'ADD',
        riseOnly: true,
      },
    ],
  },

  level_up: {
    id: 'level_up',
    steps: [
      { type: 'sound', delayMs: 0, sfx: 'playLevelUp' },
      { type: 'flashLight', delayMs: 0, color: 0xffe066, radius: 46, intensity: 1.35, durationMs: 360 },
      { type: 'ring', delayMs: 0, radiusStart: 6, radiusEnd: 42, color: 0xffe066, durationMs: 420, lineWidth: 2.5 },
      {
        type: 'particles',
        delayMs: 40,
        texture: ['extras/Particle_dust_1', 'extras/Particle_dust_2', 'extras/Particle_dust_3'],
        count: 16,
        speed: [22, 58],
        lifespan: [420, 720],
        gravityY: -90,
        scale: [1.1, 0.2],
        tint: 0xffe066,
        blendMode: 'ADD',
        riseOnly: true,
      },
    ],
  },
};
