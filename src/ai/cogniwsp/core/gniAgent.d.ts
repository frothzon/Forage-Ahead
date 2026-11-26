import type { RngFn } from './constants.js';
import type { LegacyWorldPreset, HopfieldRetrieveResult, WorldGraph } from './worldGraph.js';
import type { PlasticDelta, WspCoreV2, WspStepTrace } from './wspCoreV2.js';
import type { PersonaDictionary } from '../data/personas.js';

export interface OpenQuestionState {
  turn?: number;
  type: 'CHOICE' | 'YES_NO' | 'OPEN' | string;
  options?: string[];
  topic?: string;
}

export interface ResolvedEntity {
  entityId: string;
  name: string;
  type: string;
  source?: string;
  score: number;
}

export interface PlayerClaim {
  type: string;
  value: string;
  negated: boolean;
  raw?: string;
}

export interface AgentPerceptualFrame {
  rawText: string;
  normalizedText: string;
  speechActs: Array<{ act: string; score: number }>;
  primaryAct: string;
  secondaryAct: string | null;
  polarity: string;
  negatedActs: string[];
  agency: {
    actor: string;
    target: string;
    thirdPartyEntityId: string | null;
    relation: string;
  };
  resolvedEntities: ResolvedEntity[];
  unknownConcepts: string[];
  playerClaims: PlayerClaim[];
  affectiveSignals: {
    politeness: number;
    aggression: number;
    sincerity: number;
    urgency: number;
    curiosity: number;
    deceptionCue: number;
  };
  directAnswer: {
    isDirectAnswer: boolean;
    kind: string | null;
    choiceIndex: number | null;
    matchedOption: string | null;
  };
  promptInjectionAttempt: boolean;
  embedding: Float32Array;
}

export type HopfieldSummary = HopfieldRetrieveResult;

export interface EpisodicMemoryRecord {
  id: string;
  turn: number;
  summary: string;
  primaryAct: string;
  entityIds: string[];
  playerClaims: PlayerClaim[];
  valence: number;
  importance: number;
  embedding: Float32Array;
  recallCount: number;
  lastRecalledTurn: number;
  score?: number;
}

export interface AgentContradiction {
  type: 'IDENTITY_CONTRADICTION' | 'STANCE_CONTRADICTION' | 'FACT_CONTRADICTION' | string;
  severity: number;
  evidenceEpisodeId?: string;
  detail: string;
}

export interface TomGates {
  metBefore: number;
  secretUnlocked: number;
  isHostile: number;
  isWarm: number;
  isSuspicious: number;
  hasContradiction: number;
  hasUnknownConcept: number;
  hasUnrepairedTransgression: number;
  isFearful: number;
}

export interface PlayerModelSummary {
  playerName: string | null;
  claimedRole: string | null;
  perceivedStance: string;
  knownFactCount: number;
  knownTopicCount: number;
  promiseCount: number;
  transgressionCount: number;
  unrepairedTransgressionCount: number;
  suspectedLieCount: number;
  apologyCount: number;
  helpOfferCount: number;
}

export interface TomAppraisal {
  prevMood: Float32Array;
  nextMood: Float32Array;
  moodDeltas: Float32Array;
  gates: TomGates;
  activeGoal: string;
  perceivedStance: string;
  playerModelSummary: PlayerModelSummary;
}

export interface InnerMonologue {
  observation: string;
  memoryTriggered: string;
  feeling: string;
  activeGoal: string;
  tactic: string;
  summary: string;
}

export interface WspTrace {
  conceptSeq: number[];
  stepTraces: WspStepTrace[];
}

export interface CriticVerdict {
  passed: boolean;
  violations: string[];
  overlapScore: number;
  safeFallbackSeq: number[];
}

export interface AgentRespondResult {
  text: string;
  conceptSeq: number[];
  innerMonologue: InnerMonologue;
  perceptualFrame: AgentPerceptualFrame;
  hopfield: HopfieldSummary;
  recalledMemories: EpisodicMemoryRecord[];
  contradictions: AgentContradiction[];
  tomAppraisal: TomAppraisal;
  wspTrace: WspTrace;
  criticVerdict: CriticVerdict;
  latencyMs: number;
  personaKey: string;
  slotValues: Record<string, string>;
}

export interface NpcSaveState {
  v: number;
  personaKey: string;
  seed: number;
  worldId: string;
  turnCount: number;
  tom: Record<string, unknown>;
  workingMemory: Record<string, unknown>;
  episodicMemory: { maxEpisodes?: number; episodes?: unknown[] } & Record<string, unknown>;
  learnedPhrases: Record<string, string>;
  plasticDelta: PlasticDelta | null;
}

export interface GeneralNpcAgentOptions {
  worldPreset?: LegacyWorldPreset | null;
  worldGraph?: WorldGraph | null;
  personaKey?: string;
  sharedCore?: WspCoreV2 | null;
  seed?: number;
  baselineMood?: Float32Array | number[] | null;
  driveWeights?: Record<string, number> | null;
  personas?: PersonaDictionary;
}

export class GeneralNpcAgent {
  seed: number;
  _rng: RngFn;
  personas: PersonaDictionary;
  personaKey: string;
  worldGraph: WorldGraph;
  ownsCore: boolean;
  core: WspCoreV2;
  perceiver: {
    parse(
      rawText: string,
      opts?: { worldGraph?: WorldGraph | null; workingMemory?: unknown; npcSelfId?: string | null }
    ): AgentPerceptualFrame;
  };
  workingMemory: {
    turns: Array<{ turn: number; speaker: string; text: string; primaryAct: string; entityIds: string[] }>;
    salientEntities: Array<{ entityId: string; name: string; type: string; genderHint: string; lastTurn: number }>;
    lastOpenQuestion: OpenQuestionState | null;
    activeTopic: string | null;
    topicStreak: number;
    recentNpcPhrases: string[];
    recordUserTurn(turn: number, text: string, frame: AgentPerceptualFrame): void;
    recordNpcTurn(turn: number, text: string, meta?: Record<string, unknown>): void;
    toJSON(): Record<string, unknown>;
    fromJSON(data: unknown): unknown;
  };
  episodicMemory: {
    maxEpisodes: number;
    episodes: EpisodicMemoryRecord[];
    addEpisode(ep: {
      id?: string;
      turn: number;
      summary: string;
      primaryAct?: string;
      entityIds?: string[];
      playerClaims?: PlayerClaim[];
      valence?: number;
      importance?: number;
      embedding?: Float32Array;
    }): EpisodicMemoryRecord | null;
    retrieve(
      queryEmbedding: Float32Array | string,
      entityIds?: string[],
      currentTurn?: number,
      topK?: number
    ): EpisodicMemoryRecord[];
    detectContradictions(
      perceptualFrame: AgentPerceptualFrame,
      worldGraph?: WorldGraph | null,
      playerModel?: { playerName?: string | null; trust?: number } | null
    ): AgentContradiction[];
    toJSON(): Record<string, unknown>;
    fromJSON(data: unknown): unknown;
  };
  tom: {
    baselineMood: Float32Array;
    mood: Float32Array;
    turnCount: number;
    drives: Record<string, number>;
    activeGoal: string;
    playerModel: {
      playerName: string | null;
      claimedRole: string | null;
      perceivedStance: string;
      knownFacts: Set<string>;
      knownTopics: Map<string, number>;
      promisesMade: Array<{ turn: number; detail: string }>;
      transgressions: Array<{ turn: number; type: string; severity: number; detail: string; repaired: boolean }>;
      suspectedLies: Array<{ turn: number; detail: string }>;
      apologyCount: number;
      helpOfferCount: number;
    };
    appraiseTurn(
      perceptualFrame: Record<string, unknown>,
      contradictions?: AgentContradiction[],
      options?: { commit?: boolean }
    ): TomAppraisal;
    markFactDisclosed(factId: string | number, topic?: string | null): void;
    hasDisclosedFact(factId: string | number): boolean;
    getTopicCount(topic: string): number;
    getToMVector(): Float32Array;
    reset(): void;
    toJSON(): Record<string, unknown>;
    fromJSON(data: unknown): unknown;
  };
  planner: {
    buildPlan(args: {
      perceptualFrame: AgentPerceptualFrame;
      hopfield?: HopfieldSummary | null;
      recalledMemories?: EpisodicMemoryRecord[];
      contradictions?: AgentContradiction[];
      tomAppraisal: TomAppraisal;
      workingMemory?: unknown;
      worldGraph?: WorldGraph | null;
      tom?: unknown;
    }): {
      effectiveAct: string;
      focusTopic: string | null;
      focusEntity: { entityId: string; name: string; type: string } | null;
      ctx320: Float32Array;
      slotValues: Record<string, string>;
      innerMonologue: InnerMonologue;
      expectedOpenQuestion: OpenQuestionState | null;
      disclosedFacts: Array<{ factId: string; topic: string }>;
    };
  };
  realizer: {
    realize(
      conceptSeq: number[],
      opts?: {
        personaKey?: string;
        personas?: PersonaDictionary;
        slotValues?: Record<string, string>;
        learnedPhrases?: Record<string, string>;
        recentNpcPhrases?: string[];
        wLex?: Float32Array | null;
        temperature?: number;
        rng?: RngFn | null;
        avoidVariants?: Set<string> | null;
      }
    ): {
      text: string;
      chosenVariants: Array<{ conceptId: number; conceptName: string; variantIdx: number; text: string }>;
    };
  };
  critic: {
    verify(
      candidateText: string,
      context?: {
        conceptSeq?: number[];
        worldGraph?: WorldGraph | null;
        gates?: Partial<TomGates>;
        recentNpcPhrases?: string[];
        perceptualFrame?: AgentPerceptualFrame | null;
      }
    ): CriticVerdict;
  };
  turnCount: number;
  learnedPhrases: Record<string, string>;
  _recentConcepts: number[];

  constructor(options?: GeneralNpcAgentOptions);
  respond(rawText: string, opts?: { temperature?: number; commit?: boolean }): AgentRespondResult;
  setPersona(key: string): GeneralNpcAgent;
  setWorld(worldGraphOrPreset: WorldGraph | LegacyWorldPreset): GeneralNpcAgent;
  revoiceTurn(turnResult: AgentRespondResult, personaKey: string): AgentRespondResult;
  fineTune(
    examples: Array<{ ctx320?: Float32Array; prompt?: string; targetSeq: number[] }>,
    opts?: { epochs?: number; lr?: number; ewcLambda?: number }
  ): { loss: number; steps: number; drifts: Record<string, number> };
  resetConversation(): GeneralNpcAgent;
  resetWeights(): GeneralNpcAgent;
  serializeSaveState(): NpcSaveState;
  loadSaveState(state: Record<string, unknown> | null | undefined): GeneralNpcAgent;
}

export default GeneralNpcAgent;
