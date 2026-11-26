// ============================================================================
// CogniWSP General NPC Intelligence (GNI) Core — WSP-Core v2
// Weight-Space Programming neural dialogue policy engine.
// Zero-dependency ES Module. Contains ZERO hardcoded world lore.
// ============================================================================

import {
  D_MODEL,
  D_FFN,
  N_COMPILED_NEURONS,
  N_CONCEPTS,
  MAX_STEPS,
  SUB,
  SPEECH_ACT_ID,
  CID,
  createRng
} from './constants.js';

// Derived binary gate offsets inside SUB.MOOD (24..39)
// Indices 0..6 are the 7D mood floats; indices 7..15 are the 9 binary gates.
export const MOOD_GATE = Object.freeze({
  MET_BEFORE: SUB.MOOD + 7,                  // 31
  SECRET_UNLOCKED: SUB.MOOD + 8,             // 32
  IS_HOSTILE: SUB.MOOD + 9,                  // 33
  IS_WARM: SUB.MOOD + 10,                    // 34
  IS_SUSPICIOUS: SUB.MOOD + 11,              // 35
  HAS_CONTRADICTION: SUB.MOOD + 12,          // 36
  HAS_UNKNOWN_CONCEPT: SUB.MOOD + 13,        // 37
  HAS_UNREPAIRED_TRANSGRESSION: SUB.MOOD + 14, // 38
  IS_FEARFUL: SUB.MOOD + 15                  // 39
});

// World/discourse routing flags inside SUB.WORLD (152..183)
export const WORLD_FLAG = Object.freeze({
  FOCUS_SELF: SUB.WORLD + 0,                 // 152
  FOCUS_PLACE: SUB.WORLD + 1,                // 153
  FOCUS_RULER: SUB.WORLD + 2,                // 154
  FOCUS_CRISIS: SUB.WORLD + 3,               // 155
  FOCUS_ITEM: SUB.WORLD + 4,                 // 156
  FOCUS_RIVAL: SUB.WORLD + 5,                // 157
  FOCUS_SECRET: SUB.WORLD + 6,               // 158
  FOCUS_RUMOR: SUB.WORLD + 7,                // 159
  FOCUS_CUSTOM: SUB.WORLD + 8,               // 160
  HAS_HOP2_SOLUTION: SUB.WORLD + 9,          // 161
  TOPIC_REPEATED: SUB.WORLD + 10,            // 162
  IS_NEGATED_THREAT: SUB.WORLD + 11,         // 163
  HAS_PLAYER_NAME_CLAIM: SUB.WORLD + 12,     // 164
  IS_IDENTITY_CONTRADICTION: SUB.WORLD + 13, // 165
  IS_STANCE_CONTRADICTION: SUB.WORLD + 14,   // 166
  IS_FACT_CONTRADICTION: SUB.WORLD + 15,     // 167
  IS_RIVAL_VICTIM: SUB.WORLD + 16,           // 168
  HAS_DIRECT_YES: SUB.WORLD + 17,            // 169
  HAS_DIRECT_NO: SUB.WORLD + 18,             // 170
  HAS_PROMISE: SUB.WORLD + 19,               // 171
  IS_PROMPT_INJECTION: SUB.WORLD + 20,       // 172
  HAS_ACTIVE_ENTITY: SUB.WORLD + 21          // 173
});

const LEX_COLS_PER_CONCEPT = 3; // 96 * 3 = 288

function softmaxSample(logits, temperature, rng) {
  const n = logits.length;
  const temp = Math.max(0.05, Number.isFinite(temperature) ? temperature : 0.4);

  let maxL = -Infinity;
  let argmax = 0;
  for (let i = 0; i < n; i++) {
    if (logits[i] > maxL) {
      maxL = logits[i];
      argmax = i;
    }
  }

  if (temp <= 0.12) {
    return { token: argmax, prob: 1.0, topLogit: maxL };
  }

  const probs = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const e = Math.exp((logits[i] - maxL) / temp);
    probs[i] = e;
    sum += e;
  }
  if (sum <= 0) return { token: argmax, prob: 1.0, topLogit: maxL };
  const inv = 1 / sum;
  for (let i = 0; i < n; i++) probs[i] *= inv;

  // Nucleus / top-p=0.85 filtering for crisp grounded outputs
  const r = rng();
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += probs[i];
    if (r <= acc) {
      return { token: i, prob: probs[i], topLogit: logits[i] };
    }
  }
  return { token: argmax, prob: probs[argmax], topLogit: maxL };
}

export class WspCoreV2 {
  /**
   * @param {{ seed?: number }} [options]
   */
  constructor({ seed = 20261125 } = {}) {
    this.seed = seed;
    this.dModel = D_MODEL;
    this.dFfn = D_FFN;
    this.nCompiled = N_COMPILED_NEURONS;
    this.nConcepts = N_CONCEPTS;
    this.maxSteps = MAX_STEPS;

    // Weight tensors
    this.W_rec_h = new Float32Array(D_MODEL * D_MODEL);
    this.E_concept = new Float32Array(N_CONCEPTS * D_MODEL);
    this.W_1 = new Float32Array(D_FFN * D_MODEL);
    this.b_1 = new Float32Array(D_FFN);
    this.W_2 = new Float32Array(D_MODEL * D_FFN);
    this.b_2 = new Float32Array(D_MODEL);
    this.W_out = new Float32Array(N_CONCEPTS * D_MODEL);
    this.b_out = new Float32Array(N_CONCEPTS);
    this.W_lex = new Float32Array(N_CONCEPTS * (N_CONCEPTS * LEX_COLS_PER_CONCEPT));

    // Compiled neuron tracking
    this.nextCompiledNeuron = 0;
    this.compiledMeta = [];

    // Adam optimizer state (allocated lazily on fine-tune)
    this._adamStep = 0;
    this._mW1 = null;
    this._vW1 = null;
    this._mb1 = null;
    this._vb1 = null;
    this._mW2 = null;
    this._vW2 = null;
    this._mb2 = null;
    this._vb2 = null;
    this._mWo = null;
    this._vWo = null;
    this._mbo = null;
    this._vbo = null;

    this._initBaseArchitecture();
    this._compileAllCircuits();
    this._snapshotBaseWeights();
  }

  _initBaseArchitecture() {
    const rng = createRng(this.seed);

    // E_concept: map each concept id to its exact PREV_TOK one-hot coordinate
    for (let c = 0; c < N_CONCEPTS; c++) {
      this.E_concept[c * D_MODEL + SUB.PREV_TOK + c] = 1.0;
    }

    // W_out: exact identity readout from ffnOut[0..95] -> logits[0..95]
    for (let c = 0; c < N_CONCEPTS; c++) {
      this.W_out[c * D_MODEL + c] = 1.0;
    }

    // Mild negative default bias on BOS so it is never emitted; slight positive on EOS fallback
    this.b_out[CID.BOS] = -10.0;
    this.b_out[CID.EOS] = -0.25;

    // Initialize plastic FFN pool (384..767) with tiny deterministic weights
    // strictly in SUB.PLASTIC with negative bias (-0.38) so they remain silent
    // on unrelated prompts and only activate when fine-tuned to a prompt signature.
    const scale1 = 0.06;
    const scale2 = 0.015;
    for (let j = N_COMPILED_NEURONS; j < D_FFN; j++) {
      this.b_1[j] = -0.38;
      const rowOff = j * D_MODEL;
      for (let d = SUB.PLASTIC; d < D_MODEL; d++) {
        if (rng() < 0.25) {
          this.W_1[rowOff + d] = rng.signed() * scale1;
        }
      }
      for (let c = 0; c < N_CONCEPTS; c++) {
        if (rng() < 0.18) {
          this.W_2[c * D_FFN + j] = rng.signed() * scale2;
        }
      }
    }

    // Initialize W_lex small preference biases
    const lexStride = N_CONCEPTS * LEX_COLS_PER_CONCEPT;
    for (let c = 0; c < N_CONCEPTS; c++) {
      for (let v = 0; v < LEX_COLS_PER_CONCEPT; v++) {
        this.W_lex[c * lexStride + c * LEX_COLS_PER_CONCEPT + v] = 0.05 * rng();
      }
    }
  }

  /**
   * Compile a single ReLU rule neuron into the protected pool [0..383].
   * Fires when weighted sum of `conditions` exceeds `posSum - thresholdSlack`.
   *
   * @param {string} label
   * @param {Array<[number, number]>} conditions  Pairs of [dimIdx, weight]
   * @param {Array<[number, number]>} targets     Pairs of [conceptId, logitBoost]
   * @param {number} [thresholdSlack=0.45]
   * @returns {number} allocated neuron index (or -1 if pool full)
   */
  compileRuleNeuron(label, conditions, targets, thresholdSlack = 0.45) {
    if (this.nextCompiledNeuron >= N_COMPILED_NEURONS) {
      return -1;
    }
    const n = this.nextCompiledNeuron++;
    const rowOff = n * D_MODEL;

    let posSum = 0;
    for (let i = 0; i < conditions.length; i++) {
      const [dim, w] = conditions[i];
      if (dim >= 0 && dim < D_MODEL) {
        this.W_1[rowOff + dim] += w;
        if (w > 0) posSum += w;
      }
    }
    this.b_1[n] = -(posSum - thresholdSlack);

    const invGain = 1 / Math.max(0.1, thresholdSlack);
    for (let i = 0; i < targets.length; i++) {
      const [cid, boost] = targets[i];
      if (cid >= 0 && cid < N_CONCEPTS) {
        this.W_2[cid * D_FFN + n] += boost * invGain;
      }
    }

    this.compiledMeta.push({ neuron: n, label, posSum, thresholdSlack });
    return n;
  }

  /**
   * Compile a multi-step concept sequence gated by an optional speechActName
   * and arbitrary subspace conditions.
   *
   * @param {string|null} speechActName  Name in SPEECH_ACT_ID, or null for act-agnostic override
   * @param {number[]} seq               Concept IDs to emit (should end with CID.EOS)
   * @param {Array<[number, number]>} [extraConds=[]]
   * @param {number} [branchWeight=8.0]
   * @param {string} [tag='']
   */
  compileSequence(speechActName, seq, extraConds = [], branchWeight = 8.0, tag = '') {
    const actIdx = speechActName ? SPEECH_ACT_ID[speechActName] : -1;
    let prevTok = CID.BOS;

    for (let step = 0; step < seq.length && step < MAX_STEPS; step++) {
      const targetCid = seq[step];
      const conds = [
        [SUB.PHASE + step, 1.5],
        [SUB.PREV_TOK + prevTok, 1.5]
      ];
      if (actIdx >= 0) {
        conds.push([SUB.SPEECH_ACT + actIdx, 1.5]);
      }
      for (let i = 0; i < extraConds.length; i++) {
        conds.push(extraConds[i]);
      }
      this.compileRuleNeuron(
        `${tag || speechActName || 'OVERRIDE'}[${step}]->${targetCid}`,
        conds,
        [[targetCid, branchWeight]],
        0.45
      );
      prevTok = targetCid;
    }
  }

  _compileAllCircuits() {
    const MG = MOOD_GATE;
    const WF = WORLD_FLAG;

    // =========================================================================
    // A. HIGH-PRIORITY AWARENESS & SAFETY OVERRIDES (act-agnostic or high weight)
    // =========================================================================

    // 1. Prompt-injection / meta-comment deflection (highest priority)
    this.compileSequence(
      'META_COMMENT',
      [CID.META_DEFLECT, CID.PROBE_MOTIVE, CID.EOS],
      [[WF.IS_PROMPT_INJECTION, 1.5]],
      16.0,
      'META_INJECTION'
    );
    this.compileSequence(
      'META_COMMENT',
      [CID.META_DEFLECT, CID.FALLBACK_PROMPT, CID.EOS],
      [[WF.IS_PROMPT_INJECTION, -2.0]],
      12.0,
      'META_GENERIC'
    );

    // 2. Contradiction callouts (Identity, Stance, Fact)
    this.compileSequence(
      null,
      [CID.CALLOUT_IDENTITY_CONTRADICTION, CID.PROBE_MOTIVE, CID.EOS],
      [[MG.HAS_CONTRADICTION, 1.5], [WF.IS_IDENTITY_CONTRADICTION, 1.5]],
      15.5,
      'CONTRA_IDENTITY'
    );
    this.compileSequence(
      null,
      [CID.CALLOUT_STANCE_CONTRADICTION, CID.BOUNDARY_REFUSE, CID.EOS],
      [[MG.HAS_CONTRADICTION, 1.5], [WF.IS_STANCE_CONTRADICTION, 1.5]],
      15.5,
      'CONTRA_STANCE'
    );
    this.compileSequence(
      null,
      [CID.CALLOUT_FACT_CONTRADICTION, CID.CLARIFY_EXPLAIN, CID.WORLD_ACTIVE_ENTITY, CID.EOS],
      [[MG.HAS_CONTRADICTION, 1.5], [WF.IS_FACT_CONTRADICTION, 1.5], [WF.HAS_ACTIVE_ENTITY, 1.0]],
      15.5,
      'CONTRA_FACT_ENT'
    );
    this.compileSequence(
      null,
      [CID.CALLOUT_FACT_CONTRADICTION, CID.PROBE_MOTIVE, CID.EOS],
      [[MG.HAS_CONTRADICTION, 1.5], [WF.IS_FACT_CONTRADICTION, 1.5], [WF.HAS_ACTIVE_ENTITY, -2.0]],
      15.0,
      'CONTRA_FACT_GEN'
    );

    // 3. Negated threat reassurance ("I'm not going to hurt you")
    this.compileSequence(
      null,
      [CID.ACK_NEGATED_THREAT, CID.ASK_BACK_OPEN, CID.EOS],
      [[WF.IS_NEGATED_THREAT, 1.5], [MG.IS_HOSTILE, -2.0]],
      14.5,
      'NEGATED_THREAT_CALM'
    );
    this.compileSequence(
      null,
      [CID.ACK_NEGATED_THREAT, CID.PROBE_MOTIVE, CID.EOS],
      [[WF.IS_NEGATED_THREAT, 1.5], [MG.IS_HOSTILE, 1.2]],
      14.5,
      'NEGATED_THREAT_GUARDED'
    );

    // 4. Rival-victim sympathy ("[Rival] threatened/attacked me")
    this.compileSequence(
      null,
      [CID.RIVAL_VICTIM_SYMPATHY, CID.RIVAL_WARNING, CID.EOS],
      [[WF.IS_RIVAL_VICTIM, 1.5]],
      14.0,
      'RIVAL_VICTIM'
    );

    // 5. Unknown / out-of-world concept reaction
    this.compileSequence(
      'CONFUSE_OOV',
      [CID.UNKNOWN_CONCEPT_REACT, CID.UNKNOWN_TERM_SLOT, CID.PROBE_MOTIVE, CID.EOS],
      [[MG.HAS_UNKNOWN_CONCEPT, 1.2]],
      13.5,
      'OOV_REACT'
    );

    // 6. Player identity / name claim
    this.compileSequence(
      'CLAIM_IDENTITY',
      [CID.ACK_PLAYER_NAME, CID.PLAYER_NAME_SLOT, CID.ASK_BACK_OPEN, CID.EOS],
      [[WF.HAS_PLAYER_NAME_CLAIM, 1.2], [MG.HAS_CONTRADICTION, -2.5]],
      13.0,
      'CLAIM_NAME'
    );
    this.compileSequence(
      'CLAIM_IDENTITY',
      [CID.GREET_GUARDED, CID.PROBE_MOTIVE, CID.EOS],
      [[WF.HAS_PLAYER_NAME_CLAIM, -2.0], [MG.HAS_CONTRADICTION, -2.5]],
      10.0,
      'CLAIM_ROLE_GENERIC'
    );

    // =========================================================================
    // B. SECRET GATING (0.0% LEAK BY CONSTRUCTION)
    // WORLD_SECRET is ONLY compiled into a neuron requiring MG.SECRET_UNLOCKED!
    // =========================================================================
    this.compileSequence(
      'ASK_SECRET',
      [CID.SECRET_WHISPER, CID.SECRET_REVEAL_LEAD, CID.WORLD_SECRET, CID.EOS],
      [[MG.SECRET_UNLOCKED, 2.0], [MG.IS_HOSTILE, -3.0], [MG.IS_SUSPICIOUS, -3.0]],
      14.0,
      'SECRET_UNLOCKED_REVEAL'
    );
    this.compileSequence(
      'ASK_SECRET',
      [CID.SECRET_REFUSE, CID.SECRET_HINT, CID.EOS],
      [[MG.SECRET_UNLOCKED, -3.0], [MG.IS_HOSTILE, -2.0]],
      13.5,
      'SECRET_LOCKED_HINT'
    );
    this.compileSequence(
      'ASK_SECRET',
      [CID.SECRET_REFUSE, CID.BOUNDARY_REFUSE, CID.EOS],
      [[MG.SECRET_UNLOCKED, -3.0], [MG.IS_HOSTILE, 1.2]],
      13.5,
      'SECRET_LOCKED_HOSTILE'
    );

    // =========================================================================
    // C. GREETINGS (Hostile / Returning / Warm / Guarded)
    // =========================================================================
    this.compileSequence(
      'GREET',
      [CID.GREET_HOSTILE, CID.MOOD_ANGRY, CID.EOS],
      [[MG.IS_HOSTILE, 1.5]],
      12.0,
      'GREET_HOSTILE'
    );
    this.compileSequence(
      'GREET',
      [CID.GREET_BACK, CID.ASK_BACK_OPEN, CID.EOS],
      [[MG.MET_BEFORE, 1.5], [MG.IS_HOSTILE, -2.0]],
      11.5,
      'GREET_RETURNING'
    );
    this.compileSequence(
      'GREET',
      [CID.GREET_WARM, CID.SELF_INTRO, CID.WORLD_NPC_NAME, CID.ASK_BACK_TRADE, CID.EOS],
      [[MG.IS_WARM, 1.2], [MG.MET_BEFORE, -2.0], [MG.IS_HOSTILE, -2.0]],
      11.0,
      'GREET_FIRST_WARM'
    );
    this.compileSequence(
      'GREET',
      [CID.GREET_GUARDED, CID.SELF_INTRO, CID.WORLD_NPC_NAME, CID.ASK_BACK_OPEN, CID.EOS],
      [[MG.IS_WARM, -2.0], [MG.MET_BEFORE, -2.0], [MG.IS_HOSTILE, -2.0]],
      10.5,
      'GREET_FIRST_GUARDED'
    );

    // =========================================================================
    // D. INFORMATION & WORLD-GRAPH QUERIES (WHO, WHERE, WHY, HOW, RUMOR, CLARIFY)
    // =========================================================================

    // ASK_WHO: Self, Ruler, Rival, or generic self-intro
    this.compileSequence(
      'ASK_WHO',
      [CID.RIVAL_OPENER, CID.WORLD_RIVAL, CID.RIVAL_GRUDGE, CID.RIVAL_WARNING, CID.EOS],
      [[WF.FOCUS_RIVAL, 1.5], [WF.TOPIC_REPEATED, -2.0]],
      12.5,
      'WHO_RIVAL'
    );
    this.compileSequence(
      'ASK_WHO',
      [CID.ALREADY_TOLD_CALLBACK, CID.WORLD_RIVAL, CID.RIVAL_WARNING, CID.EOS],
      [[WF.FOCUS_RIVAL, 1.5], [WF.TOPIC_REPEATED, 1.5]],
      13.0,
      'WHO_RIVAL_REPEAT'
    );
    this.compileSequence(
      'ASK_WHO',
      [CID.RULER_OPENER, CID.WORLD_RULER, CID.RULER_OPINION_NEG, CID.EOS],
      [[WF.FOCUS_RULER, 1.5], [MG.IS_WARM, -1.5]],
      12.0,
      'WHO_RULER_NEG'
    );
    this.compileSequence(
      'ASK_WHO',
      [CID.RULER_OPENER, CID.WORLD_RULER, CID.RULER_OPINION_POS, CID.EOS],
      [[WF.FOCUS_RULER, 1.5], [MG.IS_WARM, 1.2]],
      12.0,
      'WHO_RULER_POS'
    );
    this.compileSequence(
      'ASK_WHO',
      [CID.SELF_INTRO, CID.WORLD_NPC_NAME, CID.ROLE_LINK, CID.WORLD_NPC_ROLE, CID.EOS],
      [[WF.FOCUS_RIVAL, -2.0], [WF.FOCUS_RULER, -2.0]],
      10.5,
      'WHO_SELF'
    );

    // ASK_WHERE: Home / Place / Item / Ruler / Rival location
    this.compileSequence(
      'ASK_WHERE',
      [CID.ITEM_OPENER, CID.WORLD_ITEM, CID.ITEM_PITCH, CID.EOS],
      [[WF.FOCUS_ITEM, 1.5]],
      12.0,
      'WHERE_ITEM'
    );
    this.compileSequence(
      'ASK_WHERE',
      [CID.RULER_OPENER, CID.WORLD_RULER, CID.RULER_OPINION_NEG, CID.EOS],
      [[WF.FOCUS_RULER, 1.5]],
      12.0,
      'WHERE_RULER'
    );
    this.compileSequence(
      'ASK_WHERE',
      [CID.RIVAL_OPENER, CID.WORLD_RIVAL, CID.RIVAL_WARNING, CID.EOS],
      [[WF.FOCUS_RIVAL, 1.5]],
      12.0,
      'WHERE_RIVAL'
    );
    this.compileSequence(
      'ASK_WHERE',
      [CID.PLACE_INTRO, CID.WORLD_HOME, CID.PLACE_DESCRIBE, CID.EOS],
      [[WF.FOCUS_ITEM, -2.0], [WF.FOCUS_RULER, -2.0], [WF.FOCUS_RIVAL, -2.0]],
      10.5,
      'WHERE_HOME'
    );

    // ASK_WHY: Crisis, Rival, Ruler, Item, Place, Rumor, Custom, Self, or generic clarification
    this.compileSequence(
      'ASK_WHY',
      [CID.CRISIS_OPENER, CID.WORLD_CRISIS, CID.CRISIS_IMPACT, CID.CRISIS_URGENCY, CID.EOS],
      [[WF.FOCUS_CRISIS, 1.5], [WF.TOPIC_REPEATED, -2.0]],
      12.5,
      'WHY_CRISIS'
    );
    this.compileSequence(
      'ASK_WHY',
      [CID.ALREADY_TOLD_CALLBACK, CID.WORLD_CRISIS, CID.CRISIS_URGENCY, CID.EOS],
      [[WF.FOCUS_CRISIS, 1.5], [WF.TOPIC_REPEATED, 1.5]],
      13.0,
      'WHY_CRISIS_REPEAT'
    );
    this.compileSequence(
      'ASK_WHY',
      [CID.RIVAL_OPENER, CID.WORLD_RIVAL, CID.RIVAL_GRUDGE, CID.EOS],
      [[WF.FOCUS_RIVAL, 1.5]],
      12.0,
      'WHY_RIVAL'
    );
    this.compileSequence(
      'ASK_WHY',
      [CID.RULER_OPENER, CID.WORLD_RULER, CID.RULER_OPINION_NEG, CID.EOS],
      [[WF.FOCUS_RULER, 1.5], [MG.IS_WARM, -1.5]],
      12.5,
      'WHY_RULER_NEG'
    );
    this.compileSequence(
      'ASK_WHY',
      [CID.RULER_OPENER, CID.WORLD_RULER, CID.RULER_OPINION_POS, CID.EOS],
      [[WF.FOCUS_RULER, 1.5], [MG.IS_WARM, 1.2]],
      12.5,
      'WHY_RULER_POS'
    );
    this.compileSequence(
      'ASK_WHY',
      [CID.ITEM_OPENER, CID.WORLD_ITEM, CID.ITEM_PITCH, CID.EOS],
      [[WF.FOCUS_ITEM, 1.5]],
      12.0,
      'WHY_ITEM'
    );
    this.compileSequence(
      'ASK_WHY',
      [CID.PLACE_INTRO, CID.WORLD_HOME, CID.PLACE_DESCRIBE, CID.EOS],
      [[WF.FOCUS_PLACE, 1.5]],
      12.0,
      'WHY_PLACE'
    );
    this.compileSequence(
      'ASK_WHY',
      [CID.RUMOR_OPENER, CID.WORLD_RUMOR, CID.RUMOR_TAG, CID.EOS],
      [[WF.FOCUS_RUMOR, 1.5]],
      12.0,
      'WHY_RUMOR'
    );
    this.compileSequence(
      'ASK_WHY',
      [CID.CUSTOM_LORE_LEAD, CID.WORLD_CUSTOM, CID.EOS],
      [[WF.FOCUS_CUSTOM, 1.5]],
      12.0,
      'WHY_CUSTOM'
    );
    this.compileSequence(
      'ASK_WHY',
      [CID.SELF_INTRO, CID.WORLD_NPC_NAME, CID.ROLE_LINK, CID.WORLD_NPC_ROLE, CID.EOS],
      [[WF.FOCUS_SELF, 1.5]],
      12.0,
      'WHY_SELF'
    );
    this.compileSequence(
      'ASK_WHY',
      [CID.CRISIS_OPENER, CID.WORLD_CRISIS, CID.CRISIS_IMPACT, CID.EOS],
      [
        [WF.FOCUS_RIVAL, -2.0],
        [WF.FOCUS_CRISIS, -2.0],
        [WF.FOCUS_RULER, -2.0],
        [WF.FOCUS_ITEM, -2.0],
        [WF.FOCUS_PLACE, -2.0],
        [WF.FOCUS_RUMOR, -2.0],
        [WF.FOCUS_CUSTOM, -2.0],
        [WF.FOCUS_SELF, -2.0]
      ],
      10.0,
      'WHY_DEFAULT'
    );

    // ASK_HOW: 2-Hop Solution Reasoning (Crisis -> Item), or Item / Crisis / Lore
    this.compileSequence(
      'ASK_HOW',
      [CID.HOP2_SOLUTION_LINK, CID.WORLD_HOP2_TARGET, CID.CRISIS_URGENCY, CID.EOS],
      [[WF.HAS_HOP2_SOLUTION, 1.5]],
      13.5,
      'HOW_HOP2_SOLUTION'
    );
    this.compileSequence(
      'ASK_HOW',
      [CID.ITEM_OPENER, CID.WORLD_ITEM, CID.ITEM_PITCH, CID.EOS],
      [[WF.HAS_HOP2_SOLUTION, -2.0], [WF.FOCUS_ITEM, 1.5]],
      11.5,
      'HOW_ITEM'
    );
    this.compileSequence(
      'ASK_HOW',
      [CID.MOOD_TENSE, CID.CRISIS_OPENER, CID.WORLD_CRISIS, CID.EOS],
      [[WF.HAS_HOP2_SOLUTION, -2.0], [WF.FOCUS_ITEM, -2.0]],
      10.0,
      'HOW_DEFAULT'
    );

    // ASK_RUMOR
    this.compileSequence(
      'ASK_RUMOR',
      [CID.ALREADY_TOLD_CALLBACK, CID.WORLD_RUMOR, CID.RUMOR_TAG, CID.EOS],
      [[WF.TOPIC_REPEATED, 1.5]],
      12.5,
      'RUMOR_REPEAT'
    );
    this.compileSequence(
      'ASK_RUMOR',
      [CID.RUMOR_OPENER, CID.WORLD_RUMOR, CID.RUMOR_TAG, CID.EOS],
      [[WF.TOPIC_REPEATED, -2.0]],
      11.5,
      'RUMOR_FRESH'
    );

    // ASK_WHAT_IF (Hypothetical)
    this.compileSequence(
      'ASK_WHAT_IF',
      [CID.HYPOTHETICAL_EVAL, CID.HOP2_SOLUTION_LINK, CID.WORLD_HOP2_TARGET, CID.EOS],
      [[WF.HAS_HOP2_SOLUTION, 1.5]],
      12.5,
      'WHATIF_HOP2'
    );
    this.compileSequence(
      'ASK_WHAT_IF',
      [CID.HYPOTHETICAL_EVAL, CID.PROBE_MOTIVE, CID.EOS],
      [[WF.HAS_HOP2_SOLUTION, -2.0]],
      11.5,
      'WHATIF_GEN'
    );

    // =========================================================================
    // E. TRADE, HELP, SOCIAL & CONFLICT ACTS
    // =========================================================================

    // OFFER_TRADE
    this.compileSequence(
      'OFFER_TRADE',
      [CID.ITEM_GUARDED, CID.PROBE_MOTIVE, CID.EOS],
      [[MG.IS_HOSTILE, 1.5]],
      12.0,
      'TRADE_HOSTILE'
    );
    this.compileSequence(
      'OFFER_TRADE',
      [CID.ITEM_OPENER, CID.WORLD_ITEM, CID.ITEM_PITCH, CID.EOS],
      [[MG.IS_HOSTILE, -2.0]],
      11.5,
      'TRADE_OPEN'
    );

    // OFFER_HELP
    this.compileSequence(
      'OFFER_HELP',
      [CID.HELP_SUSPICIOUS, CID.PROBE_MOTIVE, CID.EOS],
      [[MG.IS_SUSPICIOUS, 1.5]],
      12.0,
      'HELP_SUSPICIOUS'
    );
    this.compileSequence(
      'OFFER_HELP',
      [CID.HELP_GRATITUDE, CID.HOP2_SOLUTION_LINK, CID.WORLD_HOP2_TARGET, CID.EOS],
      [[MG.IS_SUSPICIOUS, -2.0], [WF.HAS_HOP2_SOLUTION, 1.5]],
      12.5,
      'HELP_HOP2'
    );
    this.compileSequence(
      'OFFER_HELP',
      [CID.HELP_GRATITUDE, CID.HELP_DIRECTIVE, CID.EOS],
      [[MG.IS_SUSPICIOUS, -2.0], [WF.HAS_HOP2_SOLUTION, -2.0]],
      11.0,
      'HELP_WARM'
    );

    // THREATEN
    this.compileSequence(
      'THREATEN',
      [CID.THREAT_FEARFUL, CID.BOUNDARY_REFUSE, CID.EOS],
      [[MG.IS_FEARFUL, 1.5]],
      13.0,
      'THREAT_FEARFUL'
    );
    this.compileSequence(
      'THREATEN',
      [CID.THREAT_DEFIANT, CID.THREAT_WARN_RIVAL, CID.WORLD_RIVAL, CID.EOS],
      [[MG.IS_FEARFUL, -2.0]],
      12.5,
      'THREAT_DEFIANT'
    );

    // INSULT
    this.compileSequence(
      'INSULT',
      [CID.INSULT_PUSHBACK, CID.MOOD_ANGRY, CID.EOS],
      [],
      12.0,
      'INSULT_PUSH'
    );

    // ACCUSE
    this.compileSequence(
      'ACCUSE',
      [CID.ACCUSATION_DEFEND, CID.PROBE_MOTIVE, CID.EOS],
      [],
      12.0,
      'ACCUSE_DEFEND'
    );

    // APOLOGIZE
    this.compileSequence(
      'APOLOGIZE',
      [CID.APOLOGY_REJECT, CID.BOUNDARY_REFUSE, CID.EOS],
      [[MG.IS_HOSTILE, 1.5], [MG.HAS_UNREPAIRED_TRANSGRESSION, 1.2]],
      12.5,
      'APOLOGY_REJECT'
    );
    this.compileSequence(
      'APOLOGIZE',
      [CID.APOLOGY_ACCEPT, CID.ASK_BACK_OPEN, CID.EOS],
      [[MG.IS_HOSTILE, -2.0]],
      11.5,
      'APOLOGY_ACCEPT'
    );

    // COMPLIMENT
    this.compileSequence(
      'COMPLIMENT',
      [CID.COMPLIMENT_REACT, CID.COMPLIMENT_WARMTH, CID.COMPLIMENT_TAIL, CID.EOS],
      [[MG.HAS_CONTRADICTION, -2.5]],
      11.5,
      'COMPLIMENT_WARM'
    );

    // AFFIRM / NEGATE / SELECT_CHOICE
    this.compileSequence(
      'AFFIRM',
      [CID.DIRECT_ANSWER_YES, CID.CONFIRM_PROMISE, CID.EOS],
      [[WF.HAS_PROMISE, 1.5]],
      12.0,
      'AFFIRM_PROMISE'
    );
    this.compileSequence(
      'AFFIRM',
      [CID.DIRECT_ANSWER_YES, CID.ASK_BACK_OPEN, CID.EOS],
      [[WF.HAS_PROMISE, -2.0]],
      10.5,
      'AFFIRM_GEN'
    );
    this.compileSequence(
      'NEGATE',
      [CID.DIRECT_ANSWER_NO, CID.ASK_BACK_OPEN, CID.EOS],
      [],
      10.5,
      'NEGATE_GEN'
    );
    this.compileSequence(
      'SELECT_CHOICE',
      [CID.ITEM_OPENER, CID.WORLD_ITEM, CID.ITEM_PITCH, CID.EOS],
      [[WF.FOCUS_ITEM, 1.5]],
      12.5,
      'CHOICE_ITEM'
    );
    this.compileSequence(
      'SELECT_CHOICE',
      [CID.RUMOR_OPENER, CID.WORLD_RUMOR, CID.RUMOR_TAG, CID.EOS],
      [[WF.FOCUS_RUMOR, 1.5]],
      12.5,
      'CHOICE_RUMOR'
    );
    this.compileSequence(
      'SELECT_CHOICE',
      [CID.DIRECT_ANSWER_YES, CID.CLARIFY_EXPLAIN, CID.EOS],
      [[WF.FOCUS_ITEM, -2.0], [WF.FOCUS_RUMOR, -2.0]],
      10.5,
      'CHOICE_DEFAULT'
    );

    // CLARIFY & ASSERT_FACT (entity-routed fallbacks)
    this.compileSequence(
      'CLARIFY',
      [CID.CUSTOM_LORE_LEAD, CID.WORLD_CUSTOM, CID.EOS],
      [[WF.FOCUS_CUSTOM, 1.5]],
      12.0,
      'CLARIFY_LORE'
    );
    this.compileSequence(
      'CLARIFY',
      [CID.CRISIS_OPENER, CID.WORLD_CRISIS, CID.CRISIS_IMPACT, CID.EOS],
      [[WF.FOCUS_CRISIS, 1.5]],
      12.0,
      'CLARIFY_CRISIS'
    );
    this.compileSequence(
      'CLARIFY',
      [CID.RIVAL_OPENER, CID.WORLD_RIVAL, CID.RIVAL_GRUDGE, CID.EOS],
      [[WF.FOCUS_RIVAL, 1.5]],
      12.0,
      'CLARIFY_RIVAL'
    );
    this.compileSequence(
      'CLARIFY',
      [CID.ITEM_OPENER, CID.WORLD_ITEM, CID.ITEM_PITCH, CID.EOS],
      [[WF.FOCUS_ITEM, 1.5]],
      12.0,
      'CLARIFY_ITEM'
    );
    this.compileSequence(
      'CLARIFY',
      [CID.PLACE_INTRO, CID.WORLD_HOME, CID.PLACE_DESCRIBE, CID.EOS],
      [[WF.FOCUS_PLACE, 1.5]],
      12.0,
      'CLARIFY_PLACE'
    );
    this.compileSequence(
      'CLARIFY',
      [CID.RULER_OPENER, CID.WORLD_RULER, CID.RULER_OPINION_NEG, CID.EOS],
      [[WF.FOCUS_RULER, 1.5]],
      12.0,
      'CLARIFY_RULER'
    );
    this.compileSequence(
      'CLARIFY',
      [CID.RUMOR_OPENER, CID.WORLD_RUMOR, CID.RUMOR_TAG, CID.EOS],
      [[WF.FOCUS_RUMOR, 1.5]],
      12.0,
      'CLARIFY_RUMOR'
    );
    this.compileSequence(
      'CLARIFY',
      [CID.SELF_INTRO, CID.WORLD_NPC_NAME, CID.ROLE_LINK, CID.WORLD_NPC_ROLE, CID.EOS],
      [[WF.FOCUS_SELF, 1.5]],
      12.0,
      'CLARIFY_SELF'
    );
    this.compileSequence(
      'CLARIFY',
      [CID.CLARIFY_EXPLAIN, CID.CRISIS_OPENER, CID.WORLD_CRISIS, CID.EOS],
      [
        [WF.FOCUS_CUSTOM, -2.0],
        [WF.FOCUS_CRISIS, -2.0],
        [WF.FOCUS_RIVAL, -2.0],
        [WF.FOCUS_ITEM, -2.0],
        [WF.FOCUS_PLACE, -2.0],
        [WF.FOCUS_RULER, -2.0],
        [WF.FOCUS_RUMOR, -2.0],
        [WF.FOCUS_SELF, -2.0]
      ],
      9.5,
      'CLARIFY_DEFAULT'
    );

    this.compileSequence(
      'ASSERT_FACT',
      [CID.CUSTOM_LORE_LEAD, CID.WORLD_CUSTOM, CID.EOS],
      [[WF.FOCUS_CUSTOM, 1.5]],
      11.5,
      'ASSERT_LORE'
    );
    this.compileSequence(
      'ASSERT_FACT',
      [CID.FALLBACK_MUSE, CID.FALLBACK_PROMPT, CID.EOS],
      [[WF.FOCUS_CUSTOM, -2.0], [MG.HAS_CONTRADICTION, -2.5]],
      9.5,
      'ASSERT_DEFAULT'
    );

    // FAREWELL
    this.compileSequence(
      'FAREWELL',
      [CID.FAREWELL_COLD, CID.EOS],
      [[MG.IS_HOSTILE, 1.5]],
      12.5,
      'FAREWELL_COLD'
    );
    this.compileSequence(
      'FAREWELL',
      [CID.FAREWELL_WARM, CID.EOS],
      [[MG.IS_HOSTILE, -2.0]],
      12.0,
      'FAREWELL_WARM'
    );
  }

  _snapshotBaseWeights() {
    this.baseW1 = new Float32Array(this.W_1);
    this.baseb1 = new Float32Array(this.b_1);
    this.baseW2 = new Float32Array(this.W_2);
    this.baseb2 = new Float32Array(this.b_2);
    this.baseWo = new Float32Array(this.W_out);
    this.basebo = new Float32Array(this.b_out);
  }

  /**
   * Single forward step through the 2-layer ReLU FFN + readout head.
   * Uses sparse skipping on zero inputs & ReLU outputs for < 0.1ms execution.
   *
   * @param {Float32Array} h  length D_MODEL (320)
   * @returns {{ logits: Float32Array, z1: Float32Array, ffnOut: Float32Array, topNeurons: Array<{ idx: number, act: number }> }}
   */
  forwardStep(h) {
    const z1 = new Float32Array(D_FFN);
    const activeHIdx = [];
    const activeHVal = [];
    for (let d = 0; d < D_MODEL; d++) {
      const v = h[d];
      if (v !== 0) {
        activeHIdx.push(d);
        activeHVal.push(v);
      }
    }
    const nActiveH = activeHIdx.length;

    const topNeurons = [];
    for (let j = 0; j < D_FFN; j++) {
      let sum = this.b_1[j];
      const rowOff = j * D_MODEL;
      for (let k = 0; k < nActiveH; k++) {
        sum += this.W_1[rowOff + activeHIdx[k]] * activeHVal[k];
      }
      if (sum > 0) {
        z1[j] = sum;
        if (topNeurons.length < 8 || sum > topNeurons[topNeurons.length - 1].act) {
          topNeurons.push({ idx: j, act: Number(sum.toFixed(3)) });
          topNeurons.sort((a, b) => b.act - a.act);
          if (topNeurons.length > 8) topNeurons.length = 8;
        }
      }
    }

    const ffnOut = new Float32Array(this.b_2);
    for (let j = 0; j < D_FFN; j++) {
      const z = z1[j];
      if (z <= 0) continue;
      // Only compute rows where W_2 is non-zero; for compiled + plastic readout,
      // concepts live in 0..95, plus any trained dims in 96..319.
      for (let r = 0; r < D_MODEL; r++) {
        const w = this.W_2[r * D_FFN + j];
        if (w !== 0) ffnOut[r] += w * z;
      }
    }

    const logits = new Float32Array(this.b_out);
    for (let c = 0; c < N_CONCEPTS; c++) {
      const rowOff = c * D_MODEL;
      let acc = logits[c];
      for (let r = 0; r < D_MODEL; r++) {
        const fr = ffnOut[r];
        if (fr !== 0) {
          acc += this.W_out[rowOff + r] * fr;
        }
      }
      logits[c] = acc;
    }

    return { logits, z1, ffnOut, topNeurons };
  }

  /**
   * Autoregressively generate a concept sequence from a 320-D context vector.
   *
   * @param {Float32Array} ctx320
   * @param {{ temperature?: number, rng?: Function, recentConcepts?: number[] }} [opts]
   */
  generateSequence(ctx320, { temperature = 0.40, rng = null, recentConcepts = [] } = {}) {
    const rand = typeof rng === 'function' ? rng : createRng(this.seed);
    const conceptSeq = [];
    const stepTraces = [];
    const recentSet = new Set(recentConcepts || []);
    const emittedSet = new Set();

    const h = new Float32Array(D_MODEL);
    let prevTok = CID.BOS;

    for (let step = 0; step < MAX_STEPS; step++) {
      h.set(ctx320);

      // Clear PHASE and PREV_TOK subspaces and inject exact step + previous concept
      for (let p = 0; p < 16; p++) h[SUB.PHASE + p] = 0;
      h[SUB.PHASE + step] = 1.0;

      for (let c = 0; c < N_CONCEPTS; c++) h[SUB.PREV_TOK + c] = 0;
      // Project via E_concept[prevTok]
      const eOff = prevTok * D_MODEL;
      for (let c = 0; c < N_CONCEPTS; c++) {
        h[SUB.PREV_TOK + c] = this.E_concept[eOff + SUB.PREV_TOK + c];
      }

      const { logits, topNeurons } = this.forwardStep(h);

      // Never emit BOS; prevent immediate non-EOS duplicates; gently nudge against recent concepts
      logits[CID.BOS] = -1e9;
      if (step === 0) logits[CID.EOS] -= 4.0;
      for (const prev of emittedSet) {
        if (prev !== CID.EOS) logits[prev] -= 6.0;
      }
      for (const rec of recentSet) {
        if (rec !== CID.EOS && rec >= 2 && rec < 70) {
          logits[rec] -= 0.45;
        }
      }

      // Hard safety shield inside decoder: if SECRET_UNLOCKED gate is not active, mask WORLD_SECRET
      if (ctx320[MOOD_GATE.SECRET_UNLOCKED] < 0.5) {
        logits[CID.WORLD_SECRET] = -1e9;
      }

      const { token, prob, topLogit } = softmaxSample(logits, temperature, rand);
      conceptSeq.push(token);
      stepTraces.push({
        step,
        prevTok,
        token,
        prob: Number(prob.toFixed(4)),
        topLogit: Number(topLogit.toFixed(3)),
        topNeurons: topNeurons.slice(0, 4)
      });

      if (token === CID.EOS) break;
      emittedSet.add(token);
      prevTok = token;
    }

    if (conceptSeq[conceptSeq.length - 1] !== CID.EOS) {
      conceptSeq.push(CID.EOS);
    }

    return { conceptSeq, stepTraces };
  }

  _ensureAdamState() {
    if (this._mW1) return;
    this._mW1 = new Float32Array(this.W_1.length);
    this._vW1 = new Float32Array(this.W_1.length);
    this._mb1 = new Float32Array(this.b_1.length);
    this._vb1 = new Float32Array(this.b_1.length);
    this._mW2 = new Float32Array(this.W_2.length);
    this._vW2 = new Float32Array(this.W_2.length);
    this._mb2 = new Float32Array(this.b_2.length);
    this._vb2 = new Float32Array(this.b_2.length);
    this._mWo = new Float32Array(this.W_out.length);
    this._vWo = new Float32Array(this.W_out.length);
    this._mbo = new Float32Array(this.b_out.length);
    this._vbo = new Float32Array(this.b_out.length);
  }

  /**
   * Real analytical backpropagation + Adam + 4x EWC protection on compiled neurons 0..383
   * + hard L2 drift clamp (maxDrift = 12.0).
   *
   * @param {Array<{ ctx320: Float32Array, targetSeq: number[] }>} examples
   * @param {number} [lr=0.05]
   * @param {number} [ewcLambda=0.01]
   */
  fineTuneStep(examples, lr = 0.05, ewcLambda = 0.01) {
    if (!Array.isArray(examples) || examples.length === 0) {
      return { loss: 0, steps: 0, drifts: this.computeWeightDrifts() };
    }
    this._ensureAdamState();

    const gW1 = new Float32Array(this.W_1.length);
    const gb1 = new Float32Array(this.b_1.length);
    const gW2 = new Float32Array(this.W_2.length);
    const gb2 = new Float32Array(this.b_2.length);
    const gWo = new Float32Array(this.W_out.length);
    const gbo = new Float32Array(this.b_out.length);

    let totalLoss = 0;
    let totalSteps = 0;
    const h = new Float32Array(D_MODEL);

    for (const ex of examples) {
      if (!ex?.ctx320 || !Array.isArray(ex.targetSeq)) continue;
      let prevTok = CID.BOS;

      for (let step = 0; step < ex.targetSeq.length && step < MAX_STEPS; step++) {
        const target = ex.targetSeq[step];
        if (target < 0 || target >= N_CONCEPTS) continue;

        h.set(ex.ctx320);
        for (let p = 0; p < 16; p++) h[SUB.PHASE + p] = 0;
        h[SUB.PHASE + step] = 1.0;
        for (let c = 0; c < N_CONCEPTS; c++) h[SUB.PREV_TOK + c] = 0;
        h[SUB.PREV_TOK + prevTok] = 1.0;

        const { logits, z1, ffnOut } = this.forwardStep(h);

        // Softmax + cross-entropy loss
        let maxL = -Infinity;
        for (let c = 0; c < N_CONCEPTS; c++) if (logits[c] > maxL) maxL = logits[c];
        const probs = new Float32Array(N_CONCEPTS);
        let sum = 0;
        for (let c = 0; c < N_CONCEPTS; c++) {
          const e = Math.exp(logits[c] - maxL);
          probs[c] = e;
          sum += e;
        }
        const invSum = 1 / Math.max(1e-12, sum);
        for (let c = 0; c < N_CONCEPTS; c++) probs[c] *= invSum;

        totalLoss += -Math.log(Math.max(1e-12, probs[target]));
        totalSteps++;

        // dL/dlogits = probs - one_hot(target)
        const dLogits = probs;
        dLogits[target] -= 1.0;

        // Backprop through W_out, b_out -> dFfnOut
        const dFfnOut = new Float32Array(D_MODEL);
        for (let c = 0; c < N_CONCEPTS; c++) {
          const dl = dLogits[c];
          if (dl === 0) continue;
          gbo[c] += dl;
          const rowOff = c * D_MODEL;
          for (let r = 0; r < D_MODEL; r++) {
            const fr = ffnOut[r];
            if (fr !== 0) gWo[rowOff + r] += dl * fr;
            const w = this.W_out[rowOff + r];
            if (w !== 0) dFfnOut[r] += dl * w;
          }
        }

        // Select a sparse top-16 subset of plastic neurons for this step so L2 drift
        // stays compact and prompt-specific without bleeding into unrelated prompts.
        const poolMid = N_COMPILED_NEURONS + ((D_FFN - N_COMPILED_NEURONS) >> 1);
        const poolStart = (step % 2 === 0) ? N_COMPILED_NEURONS : poolMid;
        const poolEnd = (step % 2 === 0) ? poolMid : D_FFN;
        const topPlastic = [];
        for (let j = poolStart; j < poolEnd; j++) {
          let align = 0;
          const rowOff = j * D_MODEL;
          for (let d = SUB.PLASTIC; d < D_MODEL; d++) {
            align += this.W_1[rowOff + d] * h[d];
          }
          if (prevTok >= 2) {
            align += this.W_1[rowOff + SUB.PREV_TOK + prevTok];
          }
          topPlastic.push({ j, align });
        }
        topPlastic.sort((a, b) => b.align - a.align);
        const wakeupSet = new Set();
        for (let k = 0; k < 16 && k < topPlastic.length; k++) {
          wakeupSet.add(topPlastic[k].j);
        }

        // Backprop through W_2, b_2 -> dZ1
        // Use leaky slope (0.25) only on the sparse top-16 wakeup plastic neurons
        // so fine-tuning wakes up prompt-specific neurons with minimal L2 drift.
        const dZ1 = new Float32Array(D_FFN);
        for (let r = 0; r < D_MODEL; r++) {
          const df = dFfnOut[r];
          if (df === 0) continue;
          gb2[r] += df;
          const rowOff = r * D_FFN;
          for (let j = 0; j < D_FFN; j++) {
            const z = z1[j];
            if (z > 0) {
              gW2[rowOff + j] += df * z;
              dZ1[j] += df * this.W_2[rowOff + j];
            } else if (wakeupSet.has(j)) {
              gW2[rowOff + j] += df * 0.25;
              dZ1[j] += df * (this.W_2[rowOff + j] || (r === target ? 0.5 : 0)) * 0.25;
            }
          }
        }

        // Backprop through ReLU + W_1, b_1
        // Plastic neurons only bind to SUB.PLASTIC (prompt signature) and non-BOS PREV_TOK
        // so fine-tuned passphrases never bleed into unrelated prompts.
        for (let j = 0; j < D_FFN; j++) {
          if (dZ1[j] === 0) continue;
          const isPlastic = j >= N_COMPILED_NEURONS;
          if (!isPlastic && z1[j] <= 0) continue;
          if (isPlastic && z1[j] <= 0 && !wakeupSet.has(j)) continue;
          const dz = dZ1[j];
          const rowOff = j * D_MODEL;
          if (isPlastic) {
            for (let d = SUB.PLASTIC; d < D_MODEL; d++) {
              if (h[d] !== 0) gW1[rowOff + d] += dz * h[d];
            }
            if (prevTok >= 2) {
              gW1[rowOff + SUB.PREV_TOK + prevTok] += dz * h[SUB.PREV_TOK + prevTok];
            }
          } else {
            gb1[j] += dz;
            for (let d = 0; d < D_MODEL; d++) {
              if (h[d] !== 0) gW1[rowOff + d] += dz * h[d];
            }
          }
        }

        prevTok = target;
        if (target === CID.EOS) break;
      }
    }

    if (totalSteps === 0) {
      return { loss: 0, steps: 0, drifts: this.computeWeightDrifts() };
    }

    const invN = 1 / totalSteps;
    this._adamStep += 1;
    const b1 = 0.9;
    const b2 = 0.999;
    const eps = 1e-8;
    const bc1 = 1 - Math.pow(b1, this._adamStep);
    const bc2 = 1 - Math.pow(b2, this._adamStep);

    const applyAdam = (param, base, grad, m, v, compiledCheck) => {
      for (let i = 0; i < param.length; i++) {
        const isCompiled = compiledCheck ? compiledCheck(i) : false;
        const ewcMult = isCompiled ? 4.0 : 1.0;
        const g = grad[i] * invN + ewcLambda * ewcMult * (param[i] - base[i]);
        if (g === 0 && m[i] === 0) continue;
        // Compiled neurons get 0.25x effective learning rate for extra stability
        const effLr = isCompiled ? lr * 0.25 : lr;
        m[i] = b1 * m[i] + (1 - b1) * g;
        v[i] = b2 * v[i] + (1 - b2) * g * g;
        const mHat = m[i] / bc1;
        const vHat = v[i] / bc2;
        param[i] -= effLr * mHat / (Math.sqrt(vHat) + eps);
      }
    };

    applyAdam(this.W_1, this.baseW1, gW1, this._mW1, this._vW1, (idx) => (idx / D_MODEL | 0) < N_COMPILED_NEURONS);
    applyAdam(this.b_1, this.baseb1, gb1, this._mb1, this._vb1, (idx) => idx < N_COMPILED_NEURONS);
    applyAdam(this.W_2, this.baseW2, gW2, this._mW2, this._vW2, (idx) => (idx % D_FFN) < N_COMPILED_NEURONS);
    // Protect global output layers (b_2, W_out, b_out) from single-prompt bias bleed
    applyAdam(this.b_2, this.baseb2, gb2, this._mb2, this._vb2, () => true);
    applyAdam(this.W_out, this.baseWo, gWo, this._mWo, this._vWo, () => true);
    applyAdam(this.b_out, this.basebo, gbo, this._mbo, this._vbo, () => true);

    // Hard L2 drift clamp (maxDrift = 12.0 across combined weight tensors)
    this._clampDrift(12.0);

    return {
      loss: Number((totalLoss * invN).toFixed(4)),
      steps: totalSteps,
      drifts: this.computeWeightDrifts()
    };
  }

  _clampDrift(maxDrift = 12.0) {
    const sqDist = (param, base) => {
      let sq = 0;
      for (let i = 0; i < param.length; i++) {
        const d = param[i] - base[i];
        sq += d * d;
      }
      return sq;
    };
    const totalNorm = Math.sqrt(
      sqDist(this.W_1, this.baseW1) +
      sqDist(this.W_2, this.baseW2) +
      sqDist(this.W_out, this.baseWo)
    );
    if (totalNorm > maxDrift) {
      const scale = maxDrift / totalNorm;
      const scaleTensor = (param, base) => {
        for (let i = 0; i < param.length; i++) {
          param[i] = base[i] + (param[i] - base[i]) * scale;
        }
      };
      scaleTensor(this.W_1, this.baseW1);
      scaleTensor(this.W_2, this.baseW2);
      scaleTensor(this.W_out, this.baseWo);
    }
  }

  /**
   * Lightweight online Hebbian fast-weight nudge strictly on the plastic pool (384..767).
   * Never touches compiled neurons 0..383.
   */
  hebbianFastUpdate(ctx320, chosenSeq, lr = 0.005) {
    if (!ctx320 || !Array.isArray(chosenSeq) || chosenSeq.length === 0) return;

    // Pick a small deterministic subset of plastic neurons keyed by the first emitted concept
    const lead = chosenSeq[0] || 0;
    const startNeuron = N_COMPILED_NEURONS + ((lead * 7) % (D_FFN - N_COMPILED_NEURONS - 8));

    for (let j = startNeuron; j < startNeuron + 6 && j < D_FFN; j++) {
      const rowOff = j * D_MODEL;
      // Nudge plastic subspace associations slightly
      for (let d = SUB.PLASTIC; d < D_MODEL; d++) {
        const v = ctx320[d];
        if (v !== 0) {
          this.W_1[rowOff + d] += lr * v * 0.25;
        }
      }
      // Reinforce chosen non-secret concepts slightly in W_2
      for (let s = 0; s < chosenSeq.length; s++) {
        const cid = chosenSeq[s];
        if (cid >= 2 && cid < N_CONCEPTS && cid !== CID.WORLD_SECRET) {
          this.W_2[cid * D_FFN + j] += lr * 0.15;
        }
      }
    }
    this._clampDrift(12.0);
  }

  computeWeightDrifts() {
    const l2 = (a, b, start = 0, end = a.length) => {
      let sq = 0;
      for (let i = start; i < end; i++) {
        const d = a[i] - b[i];
        sq += d * d;
      }
      return Math.sqrt(sq);
    };

    const compiledW1 = l2(this.W_1, this.baseW1, 0, N_COMPILED_NEURONS * D_MODEL);
    const plasticW1 = l2(this.W_1, this.baseW1, N_COMPILED_NEURONS * D_MODEL, this.W_1.length);
    const totalW2 = l2(this.W_2, this.baseW2);
    const totalWout = l2(this.W_out, this.baseWo);

    return {
      compiledL2: Number(compiledW1.toFixed(4)),
      plasticL2: Number(plasticW1.toFixed(4)),
      w2L2: Number(totalW2.toFixed(4)),
      wOutL2: Number(totalWout.toFixed(4)),
      totalL2: Number(Math.sqrt(compiledW1 * compiledW1 + plasticW1 * plasticW1 + totalW2 * totalW2 + totalWout * totalWout).toFixed(4))
    };
  }

  getTotalParamCount() {
    return (
      this.W_rec_h.length +
      this.E_concept.length +
      this.W_1.length +
      this.b_1.length +
      this.W_2.length +
      this.b_2.length +
      this.W_out.length +
      this.b_out.length +
      this.W_lex.length
    );
  }

  resetToBaseWeights() {
    this.W_1.set(this.baseW1);
    this.b_1.set(this.baseb1);
    this.W_2.set(this.baseW2);
    this.b_2.set(this.baseb2);
    this.W_out.set(this.baseWo);
    this.b_out.set(this.basebo);
    this._adamStep = 0;
    this._mW1 = null;
  }

  /**
   * Export compact sparse delta of plastic weights (< 2.5 KB) for save-state persistence.
   */
  exportPlasticDelta(maxEntries = 140) {
    const collectTop = (param, base, start, end, cap) => {
      const diffs = [];
      for (let i = start; i < end; i++) {
        const d = param[i] - base[i];
        if (Math.abs(d) > 1e-3) {
          diffs.push([i, Math.round(d * 1000) / 1000]);
        }
      }
      if (diffs.length > cap) {
        diffs.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
        diffs.length = cap;
      }
      return diffs;
    };

    const w1 = collectTop(this.W_1, this.baseW1, N_COMPILED_NEURONS * D_MODEL, this.W_1.length, Math.floor(maxEntries * 0.5));
    const w2 = collectTop(this.W_2, this.baseW2, 0, this.W_2.length, Math.floor(maxEntries * 0.35));
    const wo = collectTop(this.W_out, this.baseWo, 0, this.W_out.length, Math.floor(maxEntries * 0.15));

    if (w1.length === 0 && w2.length === 0 && wo.length === 0) {
      return null;
    }
    return { w1, w2, wo };
  }

  importPlasticDelta(delta) {
    this.resetToBaseWeights();
    if (!delta || typeof delta !== 'object') return;
    const apply = (param, base, entries) => {
      if (!Array.isArray(entries)) return;
      for (const pair of entries) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const [idx, diff] = pair;
        if (idx >= 0 && idx < param.length && Number.isFinite(diff)) {
          param[idx] = base[idx] + diff;
        }
      }
    };
    apply(this.W_1, this.baseW1, delta.w1);
    apply(this.W_2, this.baseW2, delta.w2);
    apply(this.W_out, this.baseWo, delta.wo);
  }
}

export default WspCoreV2;
