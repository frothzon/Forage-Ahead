export interface RngFn {
  (): number;
  signed(): number;
}

export function createRng(seed?: number): RngFn;

export const D_MODEL: 320;
export const D_FFN: 768;
export const N_COMPILED_NEURONS: 384;
export const N_CONCEPTS: 96;
export const MAX_STEPS: 16;
export const N_SPEECH_ACTS: 24;
export const N_MOOD: 7;
export const N_DRIVES: 6;

export const SUB: Readonly<{
  SPEECH_ACT: number;
  MOOD: number;
  PHASE: number;
  PREV_TOK: number;
  WORLD: number;
  TOM: number;
  PLASTIC: number;
}>;

export const SPEECH_ACTS: readonly string[];
export const SPEECH_ACT_ID: Readonly<Record<string, number>>;

export const EPISTEMIC_LEVELS: Readonly<{
  PUBLIC: 'public';
  PERSONAL: 'personal';
  RUMOR: 'rumor';
  SECRET: 'secret';
  FORBIDDEN: 'forbidden';
  PLAYER_TOLD: 'player_told';
}>;

export const MOOD_NAMES: readonly [
  'warmth',
  'trust',
  'fear',
  'anger',
  'suspicion',
  'curiosity',
  'urgency'
];

export const DRIVES: readonly [
  'SELF_PRESERVATION',
  'PROTECT_SECRET',
  'SOLVE_CRISIS',
  'SEEK_GAIN',
  'GATHER_INTEL',
  'SOCIAL_BOND'
];

export interface ConceptDefinition {
  id: number;
  name: string;
  join: 'none' | 'clause' | 'comma' | 'dash' | 'space';
  type: 'ctrl' | 'core' | 'world' | 'learned';
  field?: string;
}

export const CONCEPTS: readonly ConceptDefinition[];
export const CID: Readonly<Record<string, number>>;

export function hashString(str: string): number;
export function charTrigramVector(text: string, dim?: number): Float32Array;
