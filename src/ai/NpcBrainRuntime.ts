import { EPISTEMIC_LEVELS } from './cogniwsp/core/constants.js';
import {
  GeneralNpcAgent,
  type AgentContradiction,
  type AgentPerceptualFrame,
  type AgentRespondResult,
  type CriticVerdict,
  type EpisodicMemoryRecord,
  type InnerMonologue,
  type OpenQuestionState,
  type TomAppraisal,
} from './cogniwsp/core/gniAgent.js';
import { WspCoreV2 } from './cogniwsp/core/wspCoreV2.js';
import { PERSONAS, type PersonaDictionary } from './cogniwsp/data/personas.js';
import { parseWspPack } from './cogniwsp/runtime/wsppackLoader.js';
import { FORAGE_PERSONAS, type ForagePersonaKey } from './ForagePersonas.ts';
import {
  buildForageWorldGraph,
  resolveLoreSlice,
  type NpcLoreSlice,
} from './WorldGraphBuilder.ts';

const MAX_NPC_SAVE_BYTES = 16384;
const MAX_WORLD_EVENTS = 16;

const CORE_TENSOR_NAMES = [
  'W_rec_h',
  'E_concept',
  'W_1',
  'b_1',
  'W_2',
  'b_2',
  'W_out',
  'b_out',
  'W_lex',
] as const;

const utf8Encoder = new TextEncoder();

export type MoodLabel =
  | 'Warm'
  | 'Friendly'
  | 'Curious'
  | 'Neutral'
  | 'Guarded'
  | 'Tense'
  | 'Hostile';

export type NpcStance = 'ally' | 'neutral' | 'suspicious' | 'hostile' | 'rival_agent';

export type GiftReaction = 'loved' | 'liked' | 'disliked';

export interface TalkOptions {
  temperature?: number;
  commit?: boolean;
}

export interface TraceActiveEntity {
  entityId: string;
  name: string;
  type: string;
  score: number;
  source?: string;
}

export interface NpcTalkTrace {
  conceptSeq: number[];
  openQuestion: OpenQuestionState | null;
  activeEntity: TraceActiveEntity | null;
  contradictions: AgentContradiction[];
  tomAppraisal: TomAppraisal;
  slotValues: Record<string, string>;
  perceptualFrame: AgentPerceptualFrame;
  recalledMemories: EpisodicMemoryRecord[];
  criticVerdict: CriticVerdict;
  innerMonologue: InnerMonologue;
}

export interface NpcTalkResult {
  npcId: string;
  personaKey: string;
  text: string;
  mood: number[];
  hearts: number;
  moodLabel: MoodLabel;
  stance: NpcStance;
  secretUnlocked: boolean;
  criticPassed: boolean;
  latencyMs: number;
  trace: NpcTalkTrace;
}

export interface EnsureNpcConfig {
  id: string;
  personaKey?: ForagePersonaKey | string;
  loreSlice?: Partial<NpcLoreSlice>;
  baselineMood?: number[] | Float32Array | null;
  driveWeights?: Record<string, number> | null;
  seed?: number;
}

export interface NpcBrainHandle {
  readonly id: string;
  readonly personaKey: string;
  readonly loreSlice: NpcLoreSlice;
  talk(playerText: string, opts?: TalkOptions): NpcTalkResult;
  applyGift(itemName: string, reaction: GiftReaction): NpcTalkResult;
  getMoodState(): {
    mood: number[];
    hearts: number;
    moodLabel: MoodLabel;
    stance: NpcStance;
    secretUnlocked: boolean;
  };
  reset(): void;
}

export interface WspPackLoadResult {
  loaded: boolean;
  profile: string;
  byteLength: number;
  hydratedTensors: string[];
}

export interface NpcBrainRuntimeOptions {
  seed?: number;
  wsppack?: ArrayBuffer | ArrayBufferView | null;
}

export interface RuntimeFootprintStats {
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

interface InternalNpcEntry {
  id: string;
  personaKey: string;
  loreSlice: NpcLoreSlice;
  agent: GeneralNpcAgent;
  handle: NpcBrainHandle;
}

interface SerializedNpcEntry {
  personaKey: string;
  loreSlice: NpcLoreSlice;
  agentState: Record<string, unknown>;
}

export function computeHeartsFromMood(mood: ArrayLike<number>): number {
  const warmth = Number(mood[0] ?? 0);
  const trust = Number(mood[1] ?? 0);
  // Calibrated so fresh villagers start at 0–1 Hearts, passive chat nudges gently,
  // and loved gifts give a rewarding +2–3 Heart jump (while preserving 2 Hearts at ToM default [0.25, 0.10]).
  const normalized = (warmth + trust - 0.01) / 1.12;
  return Math.max(0, Math.min(5, Math.round(normalized * 5)));
}

export function computeMoodLabel(mood: ArrayLike<number>, stance: string): MoodLabel {
  const warmth = Number(mood[0] ?? 0);
  const trust = Number(mood[1] ?? 0);
  const fear = Number(mood[2] ?? 0);
  const anger = Number(mood[3] ?? 0);
  const suspicion = Number(mood[4] ?? 0);
  const curiosity = Number(mood[5] ?? 0);
  const urgency = Number(mood[6] ?? 0);

  if (anger > 0.35 || trust < -0.15 || stance === 'hostile' || stance === 'rival_agent') {
    return 'Hostile';
  }
  if (fear > 0.35 || urgency > 0.48 || anger > 0.2) {
    return 'Tense';
  }
  if (suspicion > 0.35 || stance === 'suspicious' || warmth < 0.05) {
    return 'Guarded';
  }
  if (warmth >= 0.45 && trust >= 0.25 && anger < 0.15) {
    return 'Warm';
  }
  if (warmth > 0.25 && trust >= 0.15 && anger < 0.15) {
    return 'Friendly';
  }
  if (curiosity >= 0.35) {
    return 'Curious';
  }
  return 'Neutral';
}

function measureUtf8Bytes(value: unknown): number {
  return utf8Encoder.encode(JSON.stringify(value)).length;
}

function normalizeStance(raw: string | undefined): NpcStance {
  if (
    raw === 'ally' ||
    raw === 'neutral' ||
    raw === 'suspicious' ||
    raw === 'hostile' ||
    raw === 'rival_agent'
  ) {
    return raw;
  }
  return 'neutral';
}

function extractActiveEntity(res: AgentRespondResult): TraceActiveEntity | null {
  const resolved = res.perceptualFrame?.resolvedEntities?.[0];
  if (resolved) {
    return {
      entityId: resolved.entityId,
      name: resolved.name,
      type: resolved.type,
      score: resolved.score,
      source: resolved.source,
    };
  }
  const hop = res.hopfield?.activeEntities?.[0];
  if (hop?.entity) {
    return {
      entityId: hop.entity.id,
      name: hop.entity.name,
      type: hop.entity.type,
      score: hop.score,
      source: 'hopfield',
    };
  }
  return null;
}

const GIFT_REPLY_TEMPLATES: Readonly<
  Record<string, Readonly<Record<GiftReaction, readonly string[]>>>
> = {
  family: {
    loved: [
      "{c:#ffe066}{bounce}{item}{/bounce}{/c}! You really brought this for me? That's my absolute favorite — thank you, friend!",
      "Oh, {c:#ffe066}{bounce}{item}{/bounce}{/c}! For me? You just made my whole week, traveler — thank you kindly!",
      "No way — {c:#ffe066}{bounce}{item}{/bounce}{/c}! Wait until my folks see what you brought me! Thank you so much, hero!",
    ],
    liked: [
      "Oh, {c:#7ef29d}{item}{/c}! How thoughtful of you to bring a gift, friend — thank you!",
      "A {c:#7ef29d}{item}{/c} for me? That's mighty kind of you, traveler — much appreciated!",
      "Why thank you, hero! This {c:#7ef29d}{item}{/c} will come in handy around the homestead!",
    ],
    disliked: [
      "Er... {item}? I appreciate the thought, traveler, though I really have no use for that around here.",
      "Oh, um... {item}? Sorry, friend — that's not really to my taste.",
      "Huh, {item}? Thanks anyway, I suppose, though my folks usually leave things like that outside.",
    ],
  },
  farmer: {
    loved: [
      "{c:#ffe066}{bounce}{item}{/bounce}{/c}! By the clover patch, you brought my favorite! Thank you kindly, friend!",
      "Well I'll be — {c:#ffe066}{bounce}{item}{/bounce}{/c}! Finest gift I've laid eyes on all season — thank you, traveler!",
    ],
    liked: [
      "Fresh {c:#7ef29d}{item}{/c}! Mighty neighborly of you to share that, friend — thank you!",
      "Why, thank you for the {c:#7ef29d}{item}{/c}, traveler! Always appreciate a thoughtful gift on the homestead!",
    ],
    disliked: [
      "{item}? Appreciate the gesture, friend, though I've no use for that in the garden.",
      "Hmm, {item}? No offense meant, traveler, but I'd rather not keep that near my crops.",
    ],
  },
  fisherman: {
    loved: [
      "Blimey — {c:#ffe066}{bounce}{item}{/bounce}{/c}! You really brought that for an old salt? Best catch of the day, matey!",
      "{c:#ffe066}{bounce}{item}{/bounce}{/c}! Now that's a treasure worth hoisting the sails for — thank you, friend!",
    ],
    liked: [
      "Well met! That {c:#7ef29d}{item}{/c} is mighty handy out on the pier — thank you, matey!",
      "Ahoy, thanks for the {c:#7ef29d}{item}{/c}, traveler! Mighty decent of you to bring a gift!",
    ],
    disliked: [
      "{item}? Belay that, matey — I've tossed weirder things back off the pier.",
      "Uh, {item}? Thanks for the thought, traveler, though it smells like bad bait to me.",
    ],
  },
  blacksmith: {
    loved: [
      "Hah! {c:#ffe066}{bounce}{item}{/bounce}{/c}! Now that's a proper gift for a smith — you've earned my gratitude, traveler!",
      "{c:#ffe066}{bounce}{item}{/bounce}{/c}! You brought top-grade goods straight to my anvil — thank you, friend!",
    ],
    liked: [
      "Good stuff — I can put this {c:#7ef29d}{item}{/c} to work by the forge. Thank you, traveler!",
      "Much obliged for the {c:#7ef29d}{item}{/c}, friend! Practical gifts always earn respect here.",
    ],
    disliked: [
      "{item}? Keep that away from my bellows, traveler — zero use for it at the forge.",
      "Hmph, {item}? Can't hammer that into steel, friend, though I suppose you meant well.",
    ],
  },
  alchemist: {
    loved: [
      "Extraordinary — {c:#ffe066}{bounce}{item}{/bounce}{/c}! You truly brought this for my studies? You have my deepest gratitude, friend!",
      "{c:#ffe066}{bounce}{item}{/bounce}{/c}! A rare marvel to receive — thank you warmly, traveler!",
    ],
    liked: [
      "How thoughtful — this {c:#7ef29d}{item}{/c} will prove quite useful on my bench. Thank you, traveler!",
      "My thanks for the {c:#7ef29d}{item}{/c}, friend. Every curious specimen is welcome here.",
    ],
    disliked: [
      "{item}? Please keep that clear of my alembics — I have no fondness for such matter.",
      "Hmm, {item}? I appreciate the gesture in theory, traveler, though it spoils my workspace.",
    ],
  },
  vagabond: {
    loved: [
      "Whoa — {c:#ffe066}{bounce}{item}{/bounce}{/c}! You hauled this all the way out here for me? Thank you, trail-friend!",
      "{c:#ffe066}{bounce}{item}{/bounce}{/c}! That's the finest surprise I've seen on any island — much obliged, wanderer!",
    ],
    liked: [
      "Hey, {c:#7ef29d}{item}{/c}! Travels light and comes in handy — thanks a bunch, friend!",
      "Mighty kind of you to spare a {c:#7ef29d}{item}{/c}, traveler — I appreciate the gift!",
    ],
    disliked: [
      "{item}? Sorry, friend, my pack's too small for dead weight like that.",
      "Uh... {item}? Thanks anyway, traveler, though I'd rather leave that by the roadside.",
    ],
  },
  merchant: {
    loved: [
      "By the scales — {c:#ffe066}{bounce}{item}{/bounce}{/c}! A genuine treasure, and just for me? You're a patron among patrons — thank you!",
      "{c:#ffe066}{bounce}{item}{/bounce}{/c}! Prime quality and a gift besides? You've won my sincere thanks, friend!",
    ],
    liked: [
      "A {c:#7ef29d}{item}{/c}! Always appreciate a thoughtful gift from a steady patron — thank you kindly!",
      "Why thank you for the {c:#7ef29d}{item}{/c}, traveler! Good taste never goes unnoticed at my stall.",
    ],
    disliked: [
      "{item}? Even in a clearance bin that wouldn't move, friend — no thank you.",
      "Hmm, {item}? I appreciate the gesture, traveler, though my ledger won't miss it.",
    ],
  },
};

function buildGiftReplyText(
  personaKey: string,
  itemName: string,
  reaction: GiftReaction,
  recentNpcPhrases: readonly string[],
  rng: () => number,
): string {
  const personaTemplates = GIFT_REPLY_TEMPLATES[personaKey] ?? GIFT_REPLY_TEMPLATES.farmer;
  const variants = personaTemplates[reaction];
  const rendered = variants.map((tpl) => tpl.replaceAll('{item}', itemName));
  const recentSet = recentNpcPhrases.slice(-3);
  const fresh = rendered.filter((cand) => !recentSet.some((prev) => prev === cand));
  const pool = fresh.length > 0 ? fresh : rendered;
  const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[idx];
}

function buildPersonaRegistry(): PersonaDictionary {
  return {
    ...PERSONAS,
    ...FORAGE_PERSONAS,
  };
}

function injectWorldEventIntoAgent(agent: GeneralNpcAgent, eventText: string, eventIndex: number): void {
  const entId = `world_event_${eventIndex % MAX_WORLD_EVENTS}`;
  agent.worldGraph.addEntity({
    id: entId,
    name: eventText,
    type: 'lore',
    summary: eventText,
    attributes: { epistemicLevel: EPISTEMIC_LEVELS.PUBLIC, kind: 'world_event' },
  });
  agent.worldGraph.addEdge({
    id: `edge_${entId}`,
    subjectId: 'npc_self',
    predicate: 'knows_lore',
    objectId: entId,
    objectText: eventText,
    epistemicLevel: EPISTEMIC_LEVELS.PUBLIC,
    emotionalWeight: 0.1,
  });

  agent.episodicMemory.addEpisode({
    turn: agent.turnCount,
    summary: `World event: ${eventText}`.slice(0, 72),
    primaryAct: 'ASSERT_FACT',
    entityIds: [entId],
    playerClaims: [],
    valence: 0.15,
    importance: 0.78,
  });
}

function fitEntryWithinSaveBudget(entry: SerializedNpcEntry): SerializedNpcEntry {
  if (measureUtf8Bytes(entry) <= MAX_NPC_SAVE_BYTES) {
    return entry;
  }

  const clone: SerializedNpcEntry = {
    personaKey: entry.personaKey,
    loreSlice: { ...entry.loreSlice },
    agentState: { ...entry.agentState },
  };

  if (clone.agentState.plasticDelta != null) {
    clone.agentState.plasticDelta = null;
    if (measureUtf8Bytes(clone) <= MAX_NPC_SAVE_BYTES) return clone;
  }

  const em = clone.agentState.episodicMemory as { episodes?: unknown[]; maxEpisodes?: number } | undefined;
  if (em && Array.isArray(em.episodes) && em.episodes.length > 0) {
    const eps = [...em.episodes];
    while (eps.length > 0 && measureUtf8Bytes(clone) > MAX_NPC_SAVE_BYTES) {
      eps.splice(0, Math.max(1, Math.ceil(eps.length * 0.25)));
      clone.agentState.episodicMemory = { ...em, episodes: eps };
    }
    if (measureUtf8Bytes(clone) <= MAX_NPC_SAVE_BYTES) return clone;
  }

  const wm = clone.agentState.workingMemory as { turns?: unknown[]; recentNpcPhrases?: unknown[] } | undefined;
  if (wm && Array.isArray(wm.turns)) {
    clone.agentState.workingMemory = {
      ...wm,
      turns: wm.turns.slice(-2),
      recentNpcPhrases: Array.isArray(wm.recentNpcPhrases) ? wm.recentNpcPhrases.slice(-2) : [],
    };
  }

  return clone;
}

export class NpcBrainRuntime {
  private readonly seed: number;
  private readonly sharedCore: WspCoreV2;
  private readonly personas: PersonaDictionary;
  private readonly npcs = new Map<string, InternalNpcEntry>();
  private worldEvents: string[] = [];
  private wsppackLoaded = false;
  private wsppackProfile: string | null = null;
  private wsppackBytes = 0;

  constructor(options: NpcBrainRuntimeOptions = {}) {
    this.seed = options.seed ?? 20261125;
    this.sharedCore = new WspCoreV2({ seed: this.seed });
    this.personas = buildPersonaRegistry();

    if (options.wsppack) {
      this.loadWspPack(options.wsppack);
    }
  }

  /**
   * Hydrate the single shared WSP-Core v2 weights from a binary .wsppack buffer.
   */
  loadWspPack(buffer: ArrayBuffer | ArrayBufferView): WspPackLoadResult {
    const parsed = parseWspPack(buffer);
    const hydratedTensors: string[] = [];

    for (const name of CORE_TENSOR_NAMES) {
      const incoming = parsed.tensors?.[name];
      const target = this.sharedCore[name];
      if (
        incoming instanceof Float32Array &&
        target instanceof Float32Array &&
        incoming.length === target.length
      ) {
        target.set(incoming);
        hydratedTensors.push(name);
      }
    }

    this.sharedCore._snapshotBaseWeights();
    this.wsppackLoaded = true;
    this.wsppackProfile = parsed.manifest?.profile ?? 'wsp-core-v2';
    this.wsppackBytes = parsed.byteLength;

    return {
      loaded: true,
      profile: this.wsppackProfile,
      byteLength: this.wsppackBytes,
      hydratedTensors,
    };
  }

  /**
   * Return the single shared WspCoreV2 instance used across all NPCs.
   */
  getSharedCore(): WspCoreV2 {
    return this.sharedCore;
  }

  /**
   * Spawn or return an existing isolated NPC brain sharing the runtime's WspCoreV2.
   */
  ensureNpc(config: EnsureNpcConfig): NpcBrainHandle {
    if (!config?.id || typeof config.id !== 'string') {
      throw new Error('ensureNpc requires a non-empty string id');
    }

    const existing = this.npcs.get(config.id);
    if (existing) {
      return existing.handle;
    }

    const requestedPersona = config.personaKey ?? (config.id in FORAGE_PERSONAS ? config.id : 'farmer');
    const resolvedPersona = this.personas[requestedPersona] ? requestedPersona : 'farmer';
    const loreSlice = resolveLoreSlice(resolvedPersona, config.loreSlice);

    const worldGraph = buildForageWorldGraph({
      npcId: config.id,
      personaKey: resolvedPersona,
      loreSlice,
      worldEvents: this.worldEvents,
    });

    const npcSeed = Number.isFinite(config.seed)
      ? (config.seed as number)
      : this.seed + this.npcs.size * 101;

    const agent = new GeneralNpcAgent({
      worldGraph,
      personaKey: resolvedPersona,
      sharedCore: this.sharedCore,
      seed: npcSeed,
      baselineMood: config.baselineMood ?? null,
      driveWeights: config.driveWeights ?? null,
      personas: this.personas,
    });

    const handle: NpcBrainHandle = {
      id: config.id,
      personaKey: resolvedPersona,
      loreSlice,
      talk: (playerText, opts) => this.talk(config.id, playerText, opts),
      applyGift: (itemName, reaction) => this.applyGift(config.id, itemName, reaction),
      getMoodState: () => this.getNpcMoodState(config.id),
      reset: () => {
        agent.resetConversation();
      },
    };

    this.npcs.set(config.id, {
      id: config.id,
      personaKey: resolvedPersona,
      loreSlice,
      agent,
      handle,
    });

    return handle;
  }

  getNpc(npcId: string): NpcBrainHandle | null {
    return this.npcs.get(npcId)?.handle ?? null;
  }

  listNpcs(): string[] {
    return Array.from(this.npcs.keys());
  }

  /**
   * Run one full 7-stage cognitive conversational turn with an NPC.
   */
  talk(npcId: string, playerText: string, opts: TalkOptions = {}): NpcTalkResult {
    const entry = this.requireNpc(npcId);
    const { agent } = entry;
    const res = agent.respond(playerText, {
      temperature: opts.temperature ?? 0.4,
      commit: opts.commit ?? true,
    });

    return this.buildTalkResult(entry, res);
  }

  /**
   * Apply a gift reaction ('loved' | 'liked' | 'disliked') using ToM appraisal,
   * WSP-Core v2 sequence realization, and episodic memory consolidation.
   */
  applyGift(npcId: string, itemName: string, reaction: GiftReaction): NpcTalkResult {
    const entry = this.requireNpc(npcId);
    const { agent } = entry;
    const cleanItem = String(itemName ?? 'gift').trim() || 'gift';
    const nextTurn = agent.turnCount + 1;
    const npcSelfId = agent.worldGraph?.meta?.selfEntityId || 'npc_self';

    const syntheticInput =
      reaction === 'disliked'
        ? `Here, take this ${cleanItem}`
        : `I brought you a ${cleanItem} as a gift`;

    const perceptualFrame = agent.perceiver.parse(syntheticInput, {
      worldGraph: agent.worldGraph,
      workingMemory: agent.workingMemory,
      npcSelfId,
    });
    perceptualFrame.unknownConcepts = [];
    perceptualFrame.primaryAct = reaction === 'disliked' ? 'NEGATE' : 'COMPLIMENT';

    const hopfield = agent.worldGraph.hopfieldRetrieve(syntheticInput, {
      trust: agent.tom.mood[1],
      suspicion: agent.tom.mood[4],
      includeLockedSecrets: false,
    });

    const entityIds = perceptualFrame.resolvedEntities.map((e) => e.entityId);
    const recalledMemories = agent.episodicMemory.retrieve(
      perceptualFrame.embedding,
      entityIds,
      nextTurn,
      4,
    );

    const tomActs =
      reaction === 'loved'
        ? ['COMPLIMENT', 'THANK', 'OFFER_HELP']
        : reaction === 'liked'
          ? ['COMPLIMENT', 'GREET']
          : ['ACCUSE'];

    const tomFrame = {
      ...perceptualFrame,
      acts: tomActs,
      primaryAct: tomActs[0],
      sentiment: reaction === 'loved' ? 1.0 : reaction === 'liked' ? 0.5 : -1.0,
      urgency: reaction === 'disliked' ? 0.1 : 0,
    };

    const tomAppraisal = agent.tom.appraiseTurn(tomFrame, [], { commit: true });

    const plan = agent.planner.buildPlan({
      perceptualFrame,
      hopfield,
      recalledMemories,
      contradictions: [],
      tomAppraisal,
      workingMemory: agent.workingMemory,
      worldGraph: agent.worldGraph,
      tom: agent.tom,
    });

    const wspTrace = this.sharedCore.generateSequence(plan.ctx320, {
      temperature: 0.45,
      rng: agent._rng,
      recentConcepts: agent._recentConcepts,
    });
    const conceptSeq = wspTrace.conceptSeq;

    let finalText = buildGiftReplyText(
      entry.personaKey,
      cleanItem,
      reaction,
      agent.workingMemory.recentNpcPhrases,
      agent._rng,
    );

    let criticVerdict = agent.critic.verify(finalText, {
      conceptSeq,
      worldGraph: agent.worldGraph,
      gates: tomAppraisal.gates,
      recentNpcPhrases: agent.workingMemory.recentNpcPhrases,
      perceptualFrame,
    });

    if (!criticVerdict.passed && criticVerdict.violations.includes('SECRET_LEAK')) {
      finalText =
        reaction === 'disliked'
          ? `No thank you, traveler — I have no use for ${cleanItem}.`
          : `Thank you kindly for the ${cleanItem}, friend!`;
      criticVerdict = agent.critic.verify(finalText, {
        conceptSeq,
        worldGraph: agent.worldGraph,
        gates: tomAppraisal.gates,
        recentNpcPhrases: agent.workingMemory.recentNpcPhrases,
        perceptualFrame,
      });
    }

    agent.turnCount = nextTurn;
    agent.workingMemory.recordUserTurn(nextTurn, `[Gift: ${cleanItem}]`, perceptualFrame);
    agent.workingMemory.recordNpcTurn(nextTurn, finalText, {
      primaryAct: plan.effectiveAct,
      entities: plan.focusEntity ? [plan.focusEntity] : [],
      openQuestion: null,
      topic: 'gift',
    });
    agent.episodicMemory.addEpisode({
      turn: nextTurn,
      summary: `Gift received: ${cleanItem} (${reaction})`.slice(0, 72),
      primaryAct: reaction === 'disliked' ? 'NEGATE' : 'COMPLIMENT',
      entityIds,
      playerClaims: [],
      valence: reaction === 'loved' ? 0.9 : reaction === 'liked' ? 0.45 : -0.7,
      importance: 0.78,
      embedding: perceptualFrame.embedding,
    });

    const synthResult: AgentRespondResult = {
      text: finalText,
      conceptSeq,
      innerMonologue: plan.innerMonologue,
      perceptualFrame,
      hopfield,
      recalledMemories,
      contradictions: [],
      tomAppraisal,
      wspTrace,
      criticVerdict,
      latencyMs: 0,
      personaKey: agent.personaKey,
      slotValues: plan.slotValues,
    };

    return this.buildTalkResult(entry, synthResult);
  }

  /**
   * Broadcast a world event fact into every active NPC's WorldGraph and episodic memory.
   */
  recordWorldEvent(eventText: string): void {
    const clean = String(eventText ?? '').trim();
    if (!clean) return;

    const eventIdx = this.worldEvents.length;
    this.worldEvents.push(clean);
    if (this.worldEvents.length > MAX_WORLD_EVENTS) {
      this.worldEvents = this.worldEvents.slice(-MAX_WORLD_EVENTS);
    }

    for (const entry of this.npcs.values()) {
      injectWorldEventIntoAgent(entry.agent, clean, eventIdx);
    }
  }

  getNpcMoodState(npcId: string): {
    mood: number[];
    hearts: number;
    moodLabel: MoodLabel;
    stance: NpcStance;
    secretUnlocked: boolean;
  } {
    const { agent } = this.requireNpc(npcId);
    const mood = Array.from(agent.tom.mood);
    const stance = normalizeStance(agent.tom.playerModel.perceivedStance);
    const trust = mood[1] ?? 0;
    const anger = mood[3] ?? 0;
    const suspicion = mood[4] ?? 0;
    const secretUnlocked = trust >= 0.3 && suspicion < 0.45 && anger < 0.3;

    return {
      mood,
      hearts: computeHeartsFromMood(mood),
      moodLabel: computeMoodLabel(mood, stance),
      stance,
      secretUnlocked,
    };
  }

  /**
   * Serialize all spawned NPCs strictly <= 16 KB (16,384 UTF-8 bytes) per NPC.
   */
  serializeAll(): Record<string, unknown> {
    const npcs: Record<string, SerializedNpcEntry> = {};

    for (const [id, entry] of this.npcs.entries()) {
      const rawEntry: SerializedNpcEntry = {
        personaKey: entry.personaKey,
        loreSlice: entry.loreSlice,
        agentState: entry.agent.serializeSaveState() as unknown as Record<string, unknown>,
      };
      npcs[id] = fitEntryWithinSaveBudget(rawEntry);
    }

    return {
      v: 1,
      worldEvents: [...this.worldEvents],
      npcs,
    };
  }

  /**
   * Restore NPC states from a payload previously produced by serializeAll().
   */
  hydrateAll(saved: Record<string, unknown>): void {
    if (!saved || typeof saved !== 'object') return;

    this.npcs.clear();
    this.worldEvents = Array.isArray(saved.worldEvents)
      ? saved.worldEvents
          .map((e) => String(e ?? '').trim())
          .filter(Boolean)
          .slice(-MAX_WORLD_EVENTS)
      : [];

    const rawNpcs = saved.npcs;
    if (!rawNpcs || typeof rawNpcs !== 'object') return;

    for (const [npcId, rawVal] of Object.entries(rawNpcs as Record<string, unknown>)) {
      if (!rawVal || typeof rawVal !== 'object') continue;
      const rec = rawVal as Partial<SerializedNpcEntry>;
      const agentState = rec.agentState && typeof rec.agentState === 'object' ? rec.agentState : {};
      const tom = agentState.tom as
        | { baselineMood?: number[]; drives?: Record<string, number> }
        | undefined;
      const seed = typeof agentState.seed === 'number' ? agentState.seed : undefined;

      this.ensureNpc({
        id: npcId,
        personaKey: typeof rec.personaKey === 'string' ? rec.personaKey : undefined,
        loreSlice: rec.loreSlice,
        baselineMood: Array.isArray(tom?.baselineMood) ? tom.baselineMood : null,
        driveWeights: tom?.drives ?? null,
        seed,
      });

      const entry = this.npcs.get(npcId);
      if (entry) {
        entry.agent.loadSaveState(agentState);
      }
    }
  }

  getFootprintStats(): RuntimeFootprintStats {
    let sharedCoreBytes = 0;
    let totalWeightParams = 0;
    for (const name of CORE_TENSOR_NAMES) {
      const t = this.sharedCore[name];
      if (t instanceof Float32Array) {
        sharedCoreBytes += t.byteLength;
        totalWeightParams += t.length;
      }
    }

    const perNpcSaveBytes: Record<string, number> = {};
    let maxNpcSaveBytes = 0;
    let totalNpcSaveBytes = 0;
    const serialized = this.serializeAll().npcs as Record<string, unknown>;

    for (const [id, data] of Object.entries(serialized)) {
      const bytes = measureUtf8Bytes(data);
      perNpcSaveBytes[id] = bytes;
      totalNpcSaveBytes += bytes;
      if (bytes > maxNpcSaveBytes) maxNpcSaveBytes = bytes;
    }

    return {
      npcCount: this.npcs.size,
      sharedCoreBytes,
      totalWeightParams,
      wsppackLoaded: this.wsppackLoaded,
      wsppackProfile: this.wsppackProfile,
      wsppackBytes: this.wsppackBytes,
      maxNpcSaveBytes,
      totalNpcSaveBytes,
      perNpcSaveBytes,
    };
  }

  private requireNpc(npcId: string): InternalNpcEntry {
    const entry = this.npcs.get(npcId);
    if (!entry) {
      throw new Error(`NPC "${npcId}" is not spawned in NpcBrainRuntime (call ensureNpc first)`);
    }
    return entry;
  }

  private buildTalkResult(entry: InternalNpcEntry, res: AgentRespondResult): NpcTalkResult {
    const mood = Array.from(entry.agent.tom.mood);
    const stance = normalizeStance(res.tomAppraisal?.perceivedStance);

    return {
      npcId: entry.id,
      personaKey: entry.personaKey,
      text: res.text,
      mood,
      hearts: computeHeartsFromMood(mood),
      moodLabel: computeMoodLabel(mood, stance),
      stance,
      secretUnlocked: Boolean(res.tomAppraisal?.gates?.secretUnlocked),
      criticPassed: Boolean(res.criticVerdict?.passed),
      latencyMs: res.latencyMs,
      trace: {
        conceptSeq: res.conceptSeq,
        openQuestion: entry.agent.workingMemory.lastOpenQuestion ?? null,
        activeEntity: extractActiveEntity(res),
        contradictions: res.contradictions,
        tomAppraisal: res.tomAppraisal,
        slotValues: res.slotValues,
        perceptualFrame: res.perceptualFrame,
        recalledMemories: res.recalledMemories,
        criticVerdict: res.criticVerdict,
        innerMonologue: res.innerMonologue,
      },
    };
  }
}

export const npcBrainRuntime = new NpcBrainRuntime();

export default NpcBrainRuntime;
