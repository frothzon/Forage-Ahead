export type EpistemicLevel =
  | 'public'
  | 'personal'
  | 'rumor'
  | 'secret'
  | 'forbidden'
  | 'player_told';

export interface LegacyWorldPreset {
  id?: string;
  label?: string;
  avatar?: string;
  name?: string;
  role?: string;
  home?: string;
  ruler?: string;
  crisis?: string;
  item?: string;
  rival?: string;
  secret?: string;
  rumor?: string;
  customFact?: string;
}

export interface WorldGraphMeta {
  id: string;
  label: string;
  avatar: string;
  selfEntityId: string;
  legacyFields?: {
    name: string;
    role: string;
    home: string;
    ruler: string;
    crisis: string;
    item: string;
    rival: string;
    secret: string;
    rumor: string;
    customFact: string;
  };
  [key: string]: unknown;
}

export interface WorldGraphEntityInput {
  id: string;
  name?: string;
  aliases?: string[];
  type?: string;
  summary?: string;
  attributes?: Record<string, unknown>;
  embedding?: Float32Array | number[];
}

export interface WorldGraphEntity {
  id: string;
  name: string;
  aliases: string[];
  type: string;
  summary: string;
  attributes: Record<string, unknown>;
  embedding: Float32Array;
}

export interface WorldGraphEdgeInput {
  id?: string;
  subjectId: string;
  predicate: string;
  objectId?: string | null;
  objectText?: string;
  epistemicLevel?: EpistemicLevel | string;
  trustThreshold?: number;
  maxSuspicion?: number;
  emotionalWeight?: number;
  embedding?: Float32Array | number[];
}

export interface WorldGraphEdge {
  id: string;
  subjectId: string;
  predicate: string;
  objectId: string | null;
  objectText: string;
  epistemicLevel: EpistemicLevel | string;
  trustThreshold: number;
  maxSuspicion: number;
  emotionalWeight: number;
  embedding: Float32Array;
}

export interface HopfieldRetrieveOptions {
  beta?: number;
  alpha?: number;
  topK?: number;
  trust?: number;
  suspicion?: number;
  includeLockedSecrets?: boolean;
}

export interface HopfieldRankedItem {
  kind: 'entity' | 'edge';
  id: string;
  item: WorldGraphEntity | WorldGraphEdge;
  score: number;
  attention: number;
}

export interface HopfieldEdgeScore {
  edge: WorldGraphEdge;
  hop1Attention: number;
  hop2Attention: number;
  score: number;
}

export interface HopfieldEntityScore {
  entity: WorldGraphEntity;
  hop1Attention: number;
  hop2Attention: number;
  score: number;
}

export interface HopfieldRetrieveResult {
  hop1: HopfieldRankedItem[];
  hop2: HopfieldRankedItem[];
  authorizedEdges: HopfieldEdgeScore[];
  lockedSecretEdges: HopfieldEdgeScore[];
  activeEntities: HopfieldEntityScore[];
}

export interface SerializedWorldGraph {
  meta: WorldGraphMeta;
  entities: Array<Omit<WorldGraphEntity, 'embedding'> & { embedding: number[] }>;
  edges: Array<Omit<WorldGraphEdge, 'embedding'> & { embedding: number[] }>;
}

export class WorldGraph {
  meta: WorldGraphMeta;
  entities: Map<string, WorldGraphEntity>;
  edges: Map<string, WorldGraphEdge>;

  constructor(meta?: Partial<WorldGraphMeta>);
  addEntity(entity: WorldGraphEntityInput): WorldGraphEntity;
  addEdge(edge: WorldGraphEdgeInput): WorldGraphEdge;
  static fromLegacyPreset(preset: LegacyWorldPreset): WorldGraph;
  isEdgeAuthorized(edge: WorldGraphEdge, trust?: number, suspicion?: number): boolean;
  matchEntities(text: string): Array<{ entity: WorldGraphEntity; score: number; matchedSpan: string }>;
  hopfieldRetrieve(
    queryTextOrVec: string | Float32Array | number[],
    opts?: HopfieldRetrieveOptions
  ): HopfieldRetrieveResult;
  getSecretKeywords(): string[];
  toJSON(): SerializedWorldGraph;
  static fromJSON(obj: unknown): WorldGraph;
}
