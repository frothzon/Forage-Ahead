import type { LegacyWorldPreset, SerializedWorldGraph, WorldGraph } from '../core/worldGraph.js';
import type { PersonaDictionary } from '../data/personas.js';
import type { ParsedWspPack } from '../runtime/wsppackLoader.js';
import type {
  AgentContradiction,
  AgentPerceptualFrame,
  CriticVerdict,
  EpisodicMemoryRecord,
  HopfieldSummary,
  InnerMonologue,
  NpcSaveState,
  TomAppraisal,
  WspTrace
} from '../core/gniAgent.js';

export type NpcStance = 'ally' | 'neutral' | 'suspicious' | 'hostile' | 'rival_agent';

export interface SdkTalkResult {
  text: string;
  mood: number[];
  stance: NpcStance | string;
  innerMonologue: InnerMonologue;
  criticPassed: boolean;
  latencyMs: number;
  trace: {
    conceptSeq: number[];
    perceptualFrame: AgentPerceptualFrame;
    hopfield: HopfieldSummary;
    recalledMemories: EpisodicMemoryRecord[];
    contradictions: AgentContradiction[];
    tomAppraisal: TomAppraisal;
    wspTrace: WspTrace;
    criticVerdict: CriticVerdict;
    slotValues: Record<string, string>;
  };
}

export interface SdkNpcHandle {
  readonly id: string;
  talk(playerText: string, opts?: { temperature?: number }): SdkTalkResult;
  setPersona(key: string): SdkNpcHandle;
  save(): NpcSaveState & { npcId?: string };
  load(state: Record<string, unknown>): SdkNpcHandle;
  reset(): SdkNpcHandle;
}

export interface SpawnNpcOptions {
  id: string;
  personaKey?: string;
  baselineMood?: Float32Array | number[] | null;
  driveWeights?: Record<string, number> | null;
  seed?: number;
}

export interface WorldRuntimeFootprintStats {
  npcCount: number;
  sharedCoreBytes: number;
  totalWeightParams: number;
  wsppackLoaded: boolean;
  wsppackProfile: string | null;
  wsppackBytes: number;
  maxNpcSaveBytes: number;
  totalNpcSaveBytes: number;
  perNpcSaveBytes: Record<string, number>;
}

export interface WorldRuntime {
  spawnNpc(options: SpawnNpcOptions): SdkNpcHandle;
  getNpc(id: string): SdkNpcHandle | null;
  listNpcs(): string[];
  exportWorldGraph(): SerializedWorldGraph;
  getFootprintStats(): WorldRuntimeFootprintStats;
}

export interface CreateWorldRuntimeOptions {
  worldPreset?: LegacyWorldPreset | null;
  worldGraph?: WorldGraph | null;
  wsppack?: ArrayBuffer | ArrayBufferView | ParsedWspPack | null;
  seed?: number;
  personas?: PersonaDictionary;
}

export function createWorldRuntime(options?: CreateWorldRuntimeOptions): WorldRuntime;

declare const cogniwspSdk: {
  createWorldRuntime: typeof createWorldRuntime;
};

export default cogniwspSdk;
