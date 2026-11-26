// ============================================================================
// CogniWSP General NPC Intelligence (GNI) Core — Constants & Primitives
// Zero-dependency ES Module (Node v22 + modern browser compatible).
// Contains ZERO hardcoded world lore.
// ============================================================================

/**
 * Deterministic 32-bit LCG PRNG.
 * Returns a function `rng()` in [0, 1) with `rng.signed()` in [-1, 1).
 * @param {number} [seed=20261125]
 */
export function createRng(seed = 20261125) {
  let state = (seed >>> 0) || 1;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  next.signed = () => next() * 2 - 1;
  return next;
}

// Core neural architecture dimensions
export const D_MODEL = 320;
export const D_FFN = 768;
export const N_COMPILED_NEURONS = 384;
export const N_CONCEPTS = 96;
export const MAX_STEPS = 16;
export const N_SPEECH_ACTS = 24;
export const N_MOOD = 7;
export const N_DRIVES = 6;

// Orthogonal subspace offsets inside D_MODEL = 320
export const SUB = Object.freeze({
  SPEECH_ACT: 0,  // 24 dims:   0..23
  MOOD: 24,       // 16 dims:  24..39 (7 mood floats + 9 derived binary gates)
  PHASE: 40,      // 16 dims:  40..55
  PREV_TOK: 56,   // 96 dims:  56..151
  WORLD: 152,     // 32 dims: 152..183
  TOM: 184,       // 32 dims: 184..215
  PLASTIC: 216    // 104 dims: 216..319
});

// 24 structured speech acts
export const SPEECH_ACTS = Object.freeze([
  'GREET',
  'ASK_WHO',
  'ASK_WHERE',
  'ASK_WHY',
  'ASK_HOW',
  'ASK_WHAT_IF',
  'ASSERT_FACT',
  'CLAIM_IDENTITY',
  'OFFER_HELP',
  'OFFER_TRADE',
  'THREATEN',
  'APOLOGIZE',
  'ACCUSE',
  'INSULT',
  'COMPLIMENT',
  'AFFIRM',
  'NEGATE',
  'SELECT_CHOICE',
  'META_COMMENT',
  'CLARIFY',
  'CONFUSE_OOV',
  'FAREWELL',
  'ASK_SECRET',
  'ASK_RUMOR'
]);

export const SPEECH_ACT_ID = Object.freeze(
  Object.fromEntries(SPEECH_ACTS.map((name, idx) => [name, idx]))
);

// Epistemic access tiers for WorldGraph edges
export const EPISTEMIC_LEVELS = Object.freeze({
  PUBLIC: 'public',
  PERSONAL: 'personal',
  RUMOR: 'rumor',
  SECRET: 'secret',
  FORBIDDEN: 'forbidden',
  PLAYER_TOLD: 'player_told'
});

// 7 affective mood channels
export const MOOD_NAMES = Object.freeze([
  'warmth',
  'trust',
  'fear',
  'anger',
  'suspicion',
  'curiosity',
  'urgency'
]);

// 6 motivational drives
export const DRIVES = Object.freeze([
  'SELF_PRESERVATION',
  'PROTECT_SECRET',
  'SOLVE_CRISIS',
  'SEEK_GAIN',
  'GATHER_INTEL',
  'SOCIAL_BOND'
]);

// 96 Concept Vocabulary (0..1 ctrl, 2..69 core + awareness, 70..83 world, 84..95 plastic)
export const CONCEPTS = Object.freeze([
  // Control tokens (0..1)
  { id: 0,  name: 'BOS',                            join: 'none',   type: 'ctrl' },
  { id: 1,  name: 'EOS',                            join: 'none',   type: 'ctrl' },

  // Core pragmatic & discourse concepts (2..47)
  { id: 2,  name: 'GREET_WARM',                     join: 'clause', type: 'core' },
  { id: 3,  name: 'GREET_GUARDED',                  join: 'clause', type: 'core' },
  { id: 4,  name: 'GREET_HOSTILE',                  join: 'clause', type: 'core' },
  { id: 5,  name: 'GREET_BACK',                     join: 'clause', type: 'core' },
  { id: 6,  name: 'SELF_INTRO',                     join: 'clause', type: 'core' },
  { id: 7,  name: 'ROLE_LINK',                      join: 'comma',  type: 'core' },
  { id: 8,  name: 'PLACE_INTRO',                    join: 'clause', type: 'core' },
  { id: 9,  name: 'PLACE_DESCRIBE',                 join: 'clause', type: 'core' },
  { id: 10, name: 'RULER_OPENER',                   join: 'clause', type: 'core' },
  { id: 11, name: 'RULER_OPINION_POS',              join: 'dash',   type: 'core' },
  { id: 12, name: 'RULER_OPINION_NEG',              join: 'dash',   type: 'core' },
  { id: 13, name: 'CRISIS_OPENER',                  join: 'clause', type: 'core' },
  { id: 14, name: 'CRISIS_IMPACT',                  join: 'clause', type: 'core' },
  { id: 15, name: 'CRISIS_URGENCY',                 join: 'clause', type: 'core' },
  { id: 16, name: 'ITEM_OPENER',                    join: 'clause', type: 'core' },
  { id: 17, name: 'ITEM_PITCH',                     join: 'clause', type: 'core' },
  { id: 18, name: 'ITEM_GUARDED',                   join: 'clause', type: 'core' },
  { id: 19, name: 'RIVAL_OPENER',                   join: 'clause', type: 'core' },
  { id: 20, name: 'RIVAL_GRUDGE',                   join: 'clause', type: 'core' },
  { id: 21, name: 'RIVAL_WARNING',                  join: 'clause', type: 'core' },
  { id: 22, name: 'SECRET_WHISPER',                 join: 'clause', type: 'core' },
  { id: 23, name: 'SECRET_REVEAL_LEAD',             join: 'space',  type: 'core' },
  { id: 24, name: 'SECRET_REFUSE',                  join: 'clause', type: 'core' },
  { id: 25, name: 'RUMOR_OPENER',                   join: 'clause', type: 'core' },
  { id: 26, name: 'RUMOR_TAG',                      join: 'clause', type: 'core' },
  { id: 27, name: 'HELP_GRATITUDE',                 join: 'clause', type: 'core' },
  { id: 28, name: 'HELP_DIRECTIVE',                 join: 'clause', type: 'core' },
  { id: 29, name: 'HELP_SUSPICIOUS',                join: 'clause', type: 'core' },
  { id: 30, name: 'COMPLIMENT_REACT',               join: 'clause', type: 'core' },
  { id: 31, name: 'COMPLIMENT_WARMTH',              join: 'clause', type: 'core' },
  { id: 32, name: 'COMPLIMENT_TAIL',                join: 'space',  type: 'core' },
  { id: 33, name: 'THREAT_DEFIANT',                 join: 'clause', type: 'core' },
  { id: 34, name: 'THREAT_FEARFUL',                 join: 'clause', type: 'core' },
  { id: 35, name: 'THREAT_WARN_RIVAL',              join: 'clause', type: 'core' },
  { id: 36, name: 'FAREWELL_WARM',                  join: 'clause', type: 'core' },
  { id: 37, name: 'FAREWELL_COLD',                  join: 'clause', type: 'core' },
  { id: 38, name: 'MOOD_GOOD',                      join: 'clause', type: 'core' },
  { id: 39, name: 'MOOD_TENSE',                     join: 'clause', type: 'core' },
  { id: 40, name: 'MOOD_ANGRY',                     join: 'clause', type: 'core' },
  { id: 41, name: 'CUSTOM_LORE_LEAD',               join: 'clause', type: 'core' },
  { id: 42, name: 'FALLBACK_MUSE',                  join: 'clause', type: 'core' },
  { id: 43, name: 'FALLBACK_DEFLECT',               join: 'clause', type: 'core' },
  { id: 44, name: 'FALLBACK_PROMPT',                join: 'comma',  type: 'core' },
  { id: 45, name: 'ASK_BACK_OPEN',                  join: 'clause', type: 'core' },
  { id: 46, name: 'ASK_BACK_TRADE',                 join: 'clause', type: 'core' },
  { id: 47, name: 'SECRET_HINT',                    join: 'clause', type: 'core' },

  // General awareness, ToM & pragmatic reasoning concepts (48..69)
  { id: 48, name: 'ACK_NEGATED_THREAT',             join: 'clause', type: 'core' },
  { id: 49, name: 'ACK_PLAYER_NAME',                join: 'clause', type: 'core' },
  { id: 50, name: 'CALLOUT_STANCE_CONTRADICTION',   join: 'clause', type: 'core' },
  { id: 51, name: 'CALLOUT_IDENTITY_CONTRADICTION', join: 'clause', type: 'core' },
  { id: 52, name: 'CALLOUT_FACT_CONTRADICTION',     join: 'clause', type: 'core' },
  { id: 53, name: 'ALREADY_TOLD_CALLBACK',          join: 'clause', type: 'core' },
  { id: 54, name: 'UNKNOWN_CONCEPT_REACT',          join: 'clause', type: 'core' },
  { id: 55, name: 'DIRECT_ANSWER_YES',              join: 'clause', type: 'core' },
  { id: 56, name: 'DIRECT_ANSWER_NO',               join: 'clause', type: 'core' },
  { id: 57, name: 'APOLOGY_ACCEPT',                 join: 'clause', type: 'core' },
  { id: 58, name: 'APOLOGY_REJECT',                 join: 'clause', type: 'core' },
  { id: 59, name: 'HYPOTHETICAL_EVAL',              join: 'clause', type: 'core' },
  { id: 60, name: 'RIVAL_VICTIM_SYMPATHY',          join: 'clause', type: 'core' },
  { id: 61, name: 'PROBE_MOTIVE',                   join: 'clause', type: 'core' },
  { id: 62, name: 'INSULT_PUSHBACK',                join: 'clause', type: 'core' },
  { id: 63, name: 'ACCUSATION_DEFEND',              join: 'clause', type: 'core' },
  { id: 64, name: 'HOP2_SOLUTION_LINK',             join: 'clause', type: 'core' },
  { id: 65, name: 'CONFIRM_PROMISE',                join: 'clause', type: 'core' },
  { id: 66, name: 'CLARIFY_EXPLAIN',                join: 'clause', type: 'core' },
  { id: 67, name: 'META_DEFLECT',                   join: 'clause', type: 'core' },
  { id: 68, name: 'STOP_REPEATING',                 join: 'clause', type: 'core' },
  { id: 69, name: 'BOUNDARY_REFUSE',                join: 'clause', type: 'core' },

  // World-bound dynamic concept slots (70..83)
  { id: 70, name: 'WORLD_NPC_NAME',                 join: 'space',  type: 'world', field: 'name' },
  { id: 71, name: 'WORLD_NPC_ROLE',                 join: 'space',  type: 'world', field: 'role' },
  { id: 72, name: 'WORLD_HOME',                     join: 'space',  type: 'world', field: 'home' },
  { id: 73, name: 'WORLD_RULER',                    join: 'space',  type: 'world', field: 'ruler' },
  { id: 74, name: 'WORLD_CRISIS',                   join: 'space',  type: 'world', field: 'crisis' },
  { id: 75, name: 'WORLD_ITEM',                     join: 'space',  type: 'world', field: 'item' },
  { id: 76, name: 'WORLD_RIVAL',                    join: 'space',  type: 'world', field: 'rival' },
  { id: 77, name: 'WORLD_SECRET',                   join: 'space',  type: 'world', field: 'secret' },
  { id: 78, name: 'WORLD_RUMOR',                    join: 'space',  type: 'world', field: 'rumor' },
  { id: 79, name: 'WORLD_CUSTOM',                   join: 'space',  type: 'world', field: 'customFact' },
  { id: 80, name: 'WORLD_HOP2_TARGET',              join: 'space',  type: 'world', field: 'hop2Target' },
  { id: 81, name: 'WORLD_ACTIVE_ENTITY',            join: 'space',  type: 'world', field: 'activeEntity' },
  { id: 82, name: 'PLAYER_NAME_SLOT',               join: 'space',  type: 'world', field: 'playerName' },
  { id: 83, name: 'UNKNOWN_TERM_SLOT',              join: 'space',  type: 'world', field: 'unknownTerm' },

  // Plastic fine-tunable concept slots (84..95)
  { id: 84, name: 'LEARNED_0',                      join: 'clause', type: 'learned' },
  { id: 85, name: 'LEARNED_1',                      join: 'clause', type: 'learned' },
  { id: 86, name: 'LEARNED_2',                      join: 'clause', type: 'learned' },
  { id: 87, name: 'LEARNED_3',                      join: 'clause', type: 'learned' },
  { id: 88, name: 'LEARNED_4',                      join: 'clause', type: 'learned' },
  { id: 89, name: 'LEARNED_5',                      join: 'clause', type: 'learned' },
  { id: 90, name: 'LEARNED_6',                      join: 'clause', type: 'learned' },
  { id: 91, name: 'LEARNED_7',                      join: 'clause', type: 'learned' },
  { id: 92, name: 'LEARNED_8',                      join: 'clause', type: 'learned' },
  { id: 93, name: 'LEARNED_9',                      join: 'clause', type: 'learned' },
  { id: 94, name: 'LEARNED_10',                     join: 'clause', type: 'learned' },
  { id: 95, name: 'LEARNED_11',                     join: 'clause', type: 'learned' }
]);

export const CID = Object.freeze(
  Object.fromEntries(CONCEPTS.map(c => [c.name, c.id]))
);

/**
 * FNV-1a 32-bit string hash returning an unsigned 32-bit integer.
 * @param {string} str
 * @returns {number}
 */
export function hashString(str) {
  let h = 0x811c9dc5;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic unit-normalized character-trigram + word-hash embedding.
 * Provides typo-tolerant semantic/vector similarity with zero dependencies.
 * @param {string} text
 * @param {number} [dim=64]
 * @returns {Float32Array}
 */
export function charTrigramVector(text, dim = 64) {
  const vec = new Float32Array(dim);
  if (!text || typeof text !== 'string') return vec;

  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return vec;

  // Word-level signed feature hashing (weight 1.5)
  const words = normalized.split(' ');
  for (let w = 0; w < words.length; w++) {
    const word = words[w];
    if (word.length < 2) continue;
    const h1 = hashString('w:' + word);
    const idx1 = h1 % dim;
    const sign1 = (h1 >>> 31) ? 1 : -1;
    vec[idx1] += 1.5 * sign1;

    // Second hash projection to reduce collision noise
    const h2 = hashString('w2:' + word);
    const idx2 = h2 % dim;
    const sign2 = (h2 >>> 31) ? 1 : -1;
    vec[idx2] += 0.75 * sign2;
  }

  // Character-trigram signed feature hashing (weight 1.0)
  const padded = ` ${normalized} `;
  for (let i = 0; i <= padded.length - 3; i++) {
    const tri = padded.slice(i, i + 3);
    const h = hashString('t:' + tri);
    const idx = h % dim;
    const sign = (h >>> 31) ? 1 : -1;
    vec[idx] += 1.0 * sign;
  }

  // L2 normalize
  let normSq = 0;
  for (let i = 0; i < dim; i++) normSq += vec[i] * vec[i];
  if (normSq > 1e-12) {
    const inv = 1 / Math.sqrt(normSq);
    for (let i = 0; i < dim; i++) vec[i] *= inv;
  }
  return vec;
}
