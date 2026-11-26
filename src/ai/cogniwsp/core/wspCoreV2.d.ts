export const MOOD_GATE: Readonly<{
  MET_BEFORE: number;
  SECRET_UNLOCKED: number;
  IS_HOSTILE: number;
  IS_WARM: number;
  IS_SUSPICIOUS: number;
  HAS_CONTRADICTION: number;
  HAS_UNKNOWN_CONCEPT: number;
  HAS_UNREPAIRED_TRANSGRESSION: number;
  IS_FEARFUL: number;
}>;

export const WORLD_FLAG: Readonly<{
  FOCUS_SELF: number;
  FOCUS_PLACE: number;
  FOCUS_RULER: number;
  FOCUS_CRISIS: number;
  FOCUS_ITEM: number;
  FOCUS_RIVAL: number;
  FOCUS_SECRET: number;
  FOCUS_RUMOR: number;
  FOCUS_CUSTOM: number;
  HAS_HOP2_SOLUTION: number;
  TOPIC_REPEATED: number;
  IS_NEGATED_THREAT: number;
  HAS_PLAYER_NAME_CLAIM: number;
  IS_IDENTITY_CONTRADICTION: number;
  IS_STANCE_CONTRADICTION: number;
  IS_FACT_CONTRADICTION: number;
  IS_RIVAL_VICTIM: number;
  HAS_DIRECT_YES: number;
  HAS_DIRECT_NO: number;
  HAS_PROMISE: number;
  IS_PROMPT_INJECTION: number;
  HAS_ACTIVE_ENTITY: number;
}>;

export interface WspStepTrace {
  step: number;
  prevTok: number;
  token: number;
  prob: number;
  topLogit: number;
  topNeurons: Array<{ idx: number; act: number }>;
}

export interface WeightDrifts {
  compiledL2: number;
  plasticL2: number;
  w2L2: number;
  wOutL2: number;
  totalL2: number;
}

export interface PlasticDelta {
  w1: Array<[number, number]>;
  w2: Array<[number, number]>;
  wo: Array<[number, number]>;
}

export class WspCoreV2 {
  seed: number;
  dModel: number;
  dFfn: number;
  nCompiled: number;
  nConcepts: number;
  maxSteps: number;

  W_rec_h: Float32Array;
  E_concept: Float32Array;
  W_1: Float32Array;
  b_1: Float32Array;
  W_2: Float32Array;
  b_2: Float32Array;
  W_out: Float32Array;
  b_out: Float32Array;
  W_lex: Float32Array;

  nextCompiledNeuron: number;
  compiledMeta: Array<{ neuron: number; label: string; posSum: number; thresholdSlack: number }>;

  [key: string]: unknown;

  constructor(options?: { seed?: number });
  _snapshotBaseWeights(): void;
  compileRuleNeuron(
    label: string,
    conditions: Array<[number, number]>,
    targets: Array<[number, number]>,
    thresholdSlack?: number
  ): number;
  compileSequence(
    speechActName: string | null,
    seq: number[],
    extraConds?: Array<[number, number]>,
    branchWeight?: number,
    tag?: string
  ): void;
  forwardStep(h: Float32Array): {
    logits: Float32Array;
    z1: Float32Array;
    ffnOut: Float32Array;
    topNeurons: Array<{ idx: number; act: number }>;
  };
  generateSequence(
    ctx320: Float32Array,
    opts?: { temperature?: number; rng?: () => number; recentConcepts?: number[] }
  ): { conceptSeq: number[]; stepTraces: WspStepTrace[] };
  fineTuneStep(
    examples: Array<{ ctx320: Float32Array; targetSeq: number[] }>,
    lr?: number,
    ewcLambda?: number
  ): { loss: number; steps: number; drifts: WeightDrifts };
  hebbianFastUpdate(ctx320: Float32Array, chosenSeq: number[], lr?: number): void;
  computeWeightDrifts(): WeightDrifts;
  getTotalParamCount(): number;
  resetToBaseWeights(): void;
  exportPlasticDelta(maxEntries?: number): PlasticDelta | null;
  importPlasticDelta(delta: PlasticDelta | null): void;
}

export default WspCoreV2;
