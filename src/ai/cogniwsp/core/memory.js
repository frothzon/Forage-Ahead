import {
  SPEECH_ACTS,
  SPEECH_ACT_ID,
  EPISTEMIC_LEVELS,
  hashString,
  charTrigramVector,
} from './constants.js';

const EMBEDDING_DIM = 64;
const MAX_SERIALIZED_BYTES = 7800;

const MALE_PRONOUNS = new Set(['he', 'him', 'his', 'himself', 'the man', 'the guy']);
const FEMALE_PRONOUNS = new Set(['she', 'her', 'hers', 'herself', 'the woman', 'the lady']);
const PLACE_PRONOUNS = new Set(['there', 'here', 'this place', 'that place']);
const PLURAL_PRONOUNS = new Set(['they', 'them', 'their', 'theirs', 'themselves']);
const THING_PRONOUNS = new Set(['it', 'its', 'itself', 'that', 'this', 'that thing']);

const PERSON_TYPES = new Set([
  'person', 'npc', 'character', 'rival', 'ruler', 'leader', 'merchant',
  'ally', 'enemy', 'villager', 'guard', 'agent', 'human', 'figure',
]);
const PLACE_TYPES = new Set([
  'location', 'place', 'settlement', 'region', 'building', 'landmark',
  'room', 'area', 'town', 'city', 'village', 'district', 'zone', 'site',
]);
const GROUP_TYPES = new Set([
  'faction', 'group', 'organization', 'guild', 'clan', 'tribe',
  'order', 'council', 'crowd', 'army', 'people', 'party',
]);

function clamp01(v) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

function clampNeg1To1(v) {
  return Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
}

function computeEmbedding(text) {
  const str = String(text ?? '').toLowerCase().trim();
  if (typeof charTrigramVector === 'function') {
    const vec = charTrigramVector(str, EMBEDDING_DIM);
    if (vec instanceof Float32Array && vec.length === EMBEDDING_DIM) return vec;
    if (ArrayBuffer.isView(vec) || Array.isArray(vec)) {
      const out = new Float32Array(EMBEDDING_DIM);
      for (let i = 0; i < Math.min(EMBEDDING_DIM, vec.length); i++) out[i] = vec[i];
      return out;
    }
  }
  const out = new Float32Array(EMBEDDING_DIM);
  const padded = ` ${str} `;
  for (let i = 0; i <= padded.length - 3; i++) {
    const tri = padded.slice(i, i + 3);
    const h = typeof hashString === 'function' ? Math.abs(hashString(tri)) : tri.charCodeAt(0) * 31 + tri.charCodeAt(1) * 7 + tri.charCodeAt(2);
    out[h % EMBEDDING_DIM] += 1;
  }
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += out[i] * out[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBEDDING_DIM; i++) out[i] /= norm;
  return out;
}

function toFloat32Array(vec, fallbackText = '') {
  if (vec instanceof Float32Array && vec.length === EMBEDDING_DIM) return vec;
  if (ArrayBuffer.isView(vec) || Array.isArray(vec)) {
    const out = new Float32Array(EMBEDDING_DIM);
    for (let i = 0; i < Math.min(EMBEDDING_DIM, vec.length); i++) out[i] = Number(vec[i]) || 0;
    return out;
  }
  return computeEmbedding(fallbackText);
}

function cosineSimilarity(a, b) {
  if (!a || !b) return 0;
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

function extractGraphEntities(worldGraph) {
  if (!worldGraph) return [];
  let rawList = [];
  if (typeof worldGraph.getAllEntities === 'function') {
    rawList = worldGraph.getAllEntities();
  } else if (typeof worldGraph.getEntities === 'function') {
    rawList = worldGraph.getEntities();
  } else if (worldGraph.entities instanceof Map) {
    rawList = Array.from(worldGraph.entities.values());
  } else if (Array.isArray(worldGraph.entities)) {
    rawList = worldGraph.entities;
  } else if (worldGraph.entities && typeof worldGraph.entities === 'object') {
    rawList = Object.entries(worldGraph.entities).map(([k, v]) => ({ id: k, ...v }));
  } else if (worldGraph.nodes instanceof Map) {
    rawList = Array.from(worldGraph.nodes.values());
  } else if (Array.isArray(worldGraph.nodes)) {
    rawList = worldGraph.nodes;
  }
  return rawList.filter(Boolean).map((e) => ({
    entityId: String(e.entityId ?? e.id ?? e.name ?? ''),
    name: String(e.name ?? e.label ?? e.id ?? ''),
    aliases: Array.isArray(e.aliases) ? e.aliases.map(String) : [],
    type: String(e.type ?? e.kind ?? 'unknown').toLowerCase(),
    status: String(e.status ?? e.state ?? '').toLowerCase(),
    tags: Array.isArray(e.tags) ? e.tags.map((t) => String(t).toLowerCase()) : [],
  }));
}

function extractGraphEdges(worldGraph) {
  if (!worldGraph) return [];
  if (typeof worldGraph.getAllEdges === 'function') return worldGraph.getAllEdges();
  if (typeof worldGraph.getEdges === 'function') return worldGraph.getEdges();
  if (Array.isArray(worldGraph.edges)) return worldGraph.edges;
  if (worldGraph.edges instanceof Map) return Array.from(worldGraph.edges.values());
  if (Array.isArray(worldGraph.relations)) return worldGraph.relations;
  return [];
}

function isPublicOrPersonalEdge(edge) {
  const level = edge.epistemic ?? edge.epistemicLevel ?? edge.visibility;
  if (level === undefined || level === null) return true;
  const pubVal = EPISTEMIC_LEVELS?.PUBLIC ?? 'PUBLIC';
  const perVal = EPISTEMIC_LEVELS?.PERSONAL ?? 'PERSONAL';
  if (level === pubVal || level === perVal) return true;
  if (typeof level === 'string') {
    const up = level.toUpperCase();
    return up === 'PUBLIC' || up === 'PERSONAL';
  }
  return false;
}

export class WorkingMemory {
  constructor(options = {}) {
    this.maxTurns = options.maxTurns ?? 6;
    this.maxSalient = options.maxSalient ?? 8;
    this.maxRecentPhrases = options.maxRecentPhrases ?? 5;

    this.turns = [];
    this.salientEntities = [];
    this.lastOpenQuestion = null;
    this.activeTopic = null;
    this.topicStreak = 0;
    this.recentNpcPhrases = [];
  }

  pushSalientEntity(entity, turn = 0) {
    if (!entity) return;
    const entityId = String(entity.entityId ?? entity.id ?? '');
    if (!entityId) return;

    const entry = {
      entityId,
      name: String(entity.name ?? entityId),
      type: String(entity.type ?? 'unknown').toLowerCase(),
      genderHint: String(entity.genderHint ?? entity.gender ?? 'unknown').toLowerCase(),
      lastTurn: Number.isFinite(entity.lastTurn) ? entity.lastTurn : turn,
    };

    const existingIdx = this.salientEntities.findIndex((e) => e.entityId === entityId);
    if (existingIdx !== -1) {
      const prev = this.salientEntities[existingIdx];
      if (entry.genderHint === 'unknown' && prev.genderHint !== 'unknown') {
        entry.genderHint = prev.genderHint;
      }
      if (entry.type === 'unknown' && prev.type !== 'unknown') {
        entry.type = prev.type;
      }
      this.salientEntities.splice(existingIdx, 1);
    }

    this.salientEntities.unshift(entry);
    if (this.salientEntities.length > this.maxSalient) {
      this.salientEntities.length = this.maxSalient;
    }
  }

  recordUserTurn(turnOrObj, textArg, frameArg) {
    let turn;
    let text;
    let primaryAct;
    let entityIds;
    let resolvedEntities;
    let directAnswer;

    if (turnOrObj && typeof turnOrObj === 'object') {
      turn = turnOrObj.turn ?? this.turns.length + 1;
      text = String(turnOrObj.text ?? '');
      primaryAct = turnOrObj.primaryAct ?? 'UNKNOWN';
      resolvedEntities = Array.isArray(turnOrObj.resolvedEntities) ? turnOrObj.resolvedEntities : [];
      entityIds = Array.isArray(turnOrObj.entityIds)
        ? turnOrObj.entityIds
        : resolvedEntities.map((e) => e.entityId).filter(Boolean);
      directAnswer = turnOrObj.directAnswer ?? null;
    } else {
      turn = Number.isFinite(turnOrObj) ? turnOrObj : this.turns.length + 1;
      text = String(textArg ?? '');
      primaryAct = frameArg?.primaryAct ?? 'UNKNOWN';
      resolvedEntities = Array.isArray(frameArg?.resolvedEntities) ? frameArg.resolvedEntities : [];
      entityIds = resolvedEntities.map((e) => e.entityId).filter(Boolean);
      directAnswer = frameArg?.directAnswer ?? null;
    }

    this.turns.push({
      turn,
      speaker: 'user',
      text,
      primaryAct,
      entityIds: [...new Set(entityIds)],
    });
    if (this.turns.length > this.maxTurns) {
      this.turns.splice(0, this.turns.length - this.maxTurns);
    }

    for (let i = resolvedEntities.length - 1; i >= 0; i--) {
      this.pushSalientEntity(resolvedEntities[i], turn);
    }

    // Update active topic & streak
    const nextTopic = entityIds[0] ?? (primaryAct !== 'UNKNOWN' ? primaryAct : null);
    if (nextTopic) {
      if (this.activeTopic === nextTopic) {
        this.topicStreak += 1;
      } else {
        this.activeTopic = nextTopic;
        this.topicStreak = 1;
      }
    }

    if (directAnswer?.isDirectAnswer) {
      this.lastOpenQuestion = null;
    }
  }

  recordNpcTurn(turnOrObj, textArg, metaArg = {}) {
    let turn;
    let text;
    let primaryAct;
    let entityIds;
    let entities;
    let openQuestion;
    let topic;

    if (turnOrObj && typeof turnOrObj === 'object') {
      turn = turnOrObj.turn ?? this.turns.length + 1;
      text = String(turnOrObj.text ?? '');
      primaryAct = turnOrObj.primaryAct ?? 'RESPOND';
      entities = Array.isArray(turnOrObj.entities) ? turnOrObj.entities : [];
      entityIds = Array.isArray(turnOrObj.entityIds)
        ? turnOrObj.entityIds
        : entities.map((e) => e.entityId ?? e.id).filter(Boolean);
      openQuestion = turnOrObj.openQuestion ?? turnOrObj.lastOpenQuestion ?? undefined;
      topic = turnOrObj.topic ?? null;
    } else {
      turn = Number.isFinite(turnOrObj) ? turnOrObj : this.turns.length + 1;
      text = String(textArg ?? '');
      primaryAct = metaArg?.primaryAct ?? 'RESPOND';
      entities = Array.isArray(metaArg?.entities) ? metaArg.entities : [];
      entityIds = Array.isArray(metaArg?.entityIds)
        ? metaArg.entityIds
        : entities.map((e) => e.entityId ?? e.id).filter(Boolean);
      openQuestion = metaArg?.openQuestion ?? metaArg?.lastOpenQuestion ?? undefined;
      topic = metaArg?.topic ?? null;
    }

    this.turns.push({
      turn,
      speaker: 'npc',
      text,
      primaryAct,
      entityIds: [...new Set(entityIds)],
    });
    if (this.turns.length > this.maxTurns) {
      this.turns.splice(0, this.turns.length - this.maxTurns);
    }

    for (let i = entities.length - 1; i >= 0; i--) {
      this.pushSalientEntity(entities[i], turn);
    }

    if (text) {
      this.recentNpcPhrases.push(text);
      if (this.recentNpcPhrases.length > this.maxRecentPhrases) {
        this.recentNpcPhrases.splice(0, this.recentNpcPhrases.length - this.maxRecentPhrases);
      }
    }

    if (openQuestion !== undefined) {
      this.lastOpenQuestion = openQuestion ? { turn, ...openQuestion } : null;
    } else if (text.trim().endsWith('?')) {
      const isYesNo = /\b(?:do|does|did|will|would|can|could|are|is|have|want\s+to)\s+you\b[^?]*\?$/i.test(text);
      this.lastOpenQuestion = {
        turn,
        type: isYesNo ? 'YES_NO' : 'OPEN',
        topic: topic ?? this.activeTopic ?? undefined,
      };
    } else {
      this.lastOpenQuestion = null;
    }
  }

  resolvePronoun(pronoun) {
    if (!pronoun || this.salientEntities.length === 0) return null;
    const p = String(pronoun).toLowerCase().trim();

    if (MALE_PRONOUNS.has(p)) {
      return (
        this.salientEntities.find((e) => e.genderHint === 'male' || e.genderHint === 'm') ??
        this.salientEntities.find((e) => PERSON_TYPES.has(e.type) && e.genderHint !== 'female' && e.genderHint !== 'f') ??
        null
      );
    }

    if (FEMALE_PRONOUNS.has(p)) {
      return (
        this.salientEntities.find((e) => e.genderHint === 'female' || e.genderHint === 'f') ??
        this.salientEntities.find((e) => PERSON_TYPES.has(e.type) && e.genderHint !== 'male' && e.genderHint !== 'm') ??
        null
      );
    }

    if (PLACE_PRONOUNS.has(p)) {
      return this.salientEntities.find((e) => PLACE_TYPES.has(e.type)) ?? null;
    }

    if (PLURAL_PRONOUNS.has(p)) {
      return (
        this.salientEntities.find((e) => GROUP_TYPES.has(e.type) || e.genderHint === 'plural' || e.genderHint === 'neutral') ??
        this.salientEntities.find((e) => PERSON_TYPES.has(e.type)) ??
        this.salientEntities[0]
      );
    }

    if (THING_PRONOUNS.has(p)) {
      return (
        this.salientEntities.find((e) => !PERSON_TYPES.has(e.type)) ??
        this.salientEntities[0]
      );
    }

    return this.salientEntities[0] ?? null;
  }

  toJSON() {
    return {
      turns: this.turns.map((t) => ({ ...t, entityIds: [...t.entityIds] })),
      salientEntities: this.salientEntities.map((e) => ({ ...e })),
      lastOpenQuestion: this.lastOpenQuestion ? { ...this.lastOpenQuestion } : null,
      activeTopic: this.activeTopic,
      topicStreak: this.topicStreak,
      recentNpcPhrases: [...this.recentNpcPhrases],
    };
  }

  fromJSON(data) {
    if (!data || typeof data !== 'object') return this;
    this.turns = Array.isArray(data.turns) ? data.turns.slice(-this.maxTurns) : [];
    this.salientEntities = Array.isArray(data.salientEntities) ? data.salientEntities.slice(0, this.maxSalient) : [];
    this.lastOpenQuestion = data.lastOpenQuestion ? { ...data.lastOpenQuestion } : null;
    this.activeTopic = data.activeTopic ?? null;
    this.topicStreak = Number.isFinite(data.topicStreak) ? data.topicStreak : 0;
    this.recentNpcPhrases = Array.isArray(data.recentNpcPhrases)
      ? data.recentNpcPhrases.slice(-this.maxRecentPhrases)
      : [];
    return this;
  }

  static fromJSON(data) {
    return new WorkingMemory().fromJSON(data);
  }
}

export class EpisodicMemory {
  constructor(options = {}) {
    this.maxEpisodes = options.maxEpisodes ?? 128;
    this.episodes = [];
  }

  addEpisode(ep) {
    if (!ep || typeof ep !== 'object') return null;

    const turn = Number.isFinite(ep.turn) ? ep.turn : 0;
    const summary = String(ep.summary ?? '').trim();
    const id = ep.id ?? `ep_${turn}_${Math.abs(typeof hashString === 'function' ? hashString(`${turn}:${summary}:${this.episodes.length}`) : (turn * 31 + this.episodes.length)).toString(36)}`;

    const episode = {
      id: String(id),
      turn,
      summary,
      primaryAct: String(ep.primaryAct ?? 'UNKNOWN'),
      entityIds: Array.isArray(ep.entityIds) ? [...new Set(ep.entityIds.map(String))] : [],
      playerClaims: Array.isArray(ep.playerClaims) ? ep.playerClaims.map((c) => ({ ...c })) : [],
      valence: clampNeg1To1(ep.valence ?? 0),
      importance: clamp01(ep.importance ?? 0.5),
      embedding: toFloat32Array(ep.embedding, summary),
      recallCount: Number.isFinite(ep.recallCount) ? ep.recallCount : 0,
      lastRecalledTurn: Number.isFinite(ep.lastRecalledTurn) ? ep.lastRecalledTurn : turn,
    };

    if (this.episodes.length >= this.maxEpisodes) {
      this._evictOne(turn);
    }

    this.episodes.push(episode);
    return episode;
  }

  _evictOne(currentTurn) {
    if (this.episodes.length === 0) return;

    const hasEvictable = this.episodes.some((e) => e.importance < 0.85);
    let worstIdx = -1;
    let worstScore = Infinity;

    for (let i = 0; i < this.episodes.length; i++) {
      const ep = this.episodes[i];
      if (hasEvictable && ep.importance >= 0.85) continue;

      const age = Math.max(0, currentTurn - ep.turn);
      const decay = Math.exp(-age / 40);
      const score = ep.importance * (0.4 + 0.6 * decay);
      if (score < worstScore) {
        worstScore = score;
        worstIdx = i;
      }
    }

    if (worstIdx !== -1) {
      this.episodes.splice(worstIdx, 1);
    }
  }

  retrieve(queryEmbedding, entityIds = [], currentTurn = 0, topK = 4) {
    if (this.episodes.length === 0 || topK <= 0) return [];

    const qVec = typeof queryEmbedding === 'string'
      ? computeEmbedding(queryEmbedding)
      : toFloat32Array(queryEmbedding, '');
    const queryEntitySet = new Set(Array.isArray(entityIds) ? entityIds.map(String) : []);

    const scored = this.episodes.map((ep) => {
      const age = Math.max(0, currentTurn - ep.turn);
      const recency = Math.exp(-age / 20);
      const importance = clamp01(ep.importance);
      const cosineSim = Math.max(0, cosineSimilarity(qVec, ep.embedding));

      let entityOverlap = 0;
      if (queryEntitySet.size > 0 && ep.entityIds.length > 0) {
        let intersection = 0;
        for (const eid of ep.entityIds) {
          if (queryEntitySet.has(eid)) intersection++;
        }
        const union = queryEntitySet.size + ep.entityIds.length - intersection;
        entityOverlap = union > 0 ? intersection / union : 0;
      }

      const score =
        0.25 * recency +
        0.25 * importance +
        0.30 * cosineSim +
        0.20 * entityOverlap;

      return { ep, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, topK);

    return top.map(({ ep, score }) => {
      ep.recallCount += 1;
      ep.lastRecalledTurn = currentTurn;
      return {
        ...ep,
        score: Number(score.toFixed(4)),
      };
    });
  }

  detectContradictions(perceptualFrame, worldGraph = null, playerModel = null) {
    const contradictions = [];
    if (!perceptualFrame) return contradictions;

    const claims = Array.isArray(perceptualFrame.playerClaims) ? perceptualFrame.playerClaims : [];
    const normalized = String(perceptualFrame.normalizedText ?? '').toLowerCase();

    // 1. IDENTITY_CONTRADICTION
    const nameClaim = claims.find((c) => c.type === 'name' && !c.negated && c.value);
    if (nameClaim) {
      let knownName = playerModel?.playerName ?? null;
      let evidenceEpisodeId = undefined;

      for (const ep of this.episodes) {
        const pastName = ep.playerClaims?.find((c) => c.type === 'name' && !c.negated && c.value);
        if (pastName) {
          if (!knownName) knownName = pastName.value;
          if (pastName.value.toLowerCase() === String(knownName).toLowerCase()) {
            evidenceEpisodeId = ep.id;
            break;
          }
        }
      }

      if (knownName && nameClaim.value.toLowerCase() !== String(knownName).toLowerCase()) {
        contradictions.push({
          type: 'IDENTITY_CONTRADICTION',
          severity: 0.75,
          ...(evidenceEpisodeId ? { evidenceEpisodeId } : {}),
          detail: `Player previously identified as "${knownName}" but now claims to be "${nameClaim.value}".`,
        });
      }
    }

    // 2. STANCE_CONTRADICTION
    const friendlyOrIntimateActs = new Set(['COMPLIMENT', 'ASK_SECRET', 'OFFER_HELP']);
    const activeFriendlyAct =
      friendlyOrIntimateActs.has(perceptualFrame.primaryAct)
        ? perceptualFrame.primaryAct
        : (perceptualFrame.speechActs ?? []).find((s) => s.score >= 0.5 && friendlyOrIntimateActs.has(s.act))?.act ?? null;

    const trust = playerModel?.trust ?? playerModel?.relationship?.trust ?? 0;
    if (activeFriendlyAct && trust < 0.15) {
      // Find most recent high-salience THREATEN or INSULT transgression
      let transgression = null;
      for (let i = this.episodes.length - 1; i >= 0; i--) {
        const ep = this.episodes[i];
        if (
          (ep.primaryAct === 'THREATEN' || ep.primaryAct === 'INSULT') &&
          (ep.importance >= 0.5 || ep.valence <= -0.35)
        ) {
          transgression = ep;
          break;
        }
      }

      if (transgression) {
        contradictions.push({
          type: 'STANCE_CONTRADICTION',
          severity: 0.65,
          evidenceEpisodeId: transgression.id,
          detail: `Player used ${activeFriendlyAct} while trust is low (${Number(trust).toFixed(2)}) after prior ${transgression.primaryAct}.`,
        });
      }
    }

    // 3. FACT_CONTRADICTION
    if (worldGraph) {
      const entities = extractGraphEntities(worldGraph);
      const edges = extractGraphEdges(worldGraph).filter(isPublicOrPersonalEdge);
      const entityById = new Map(entities.map((e) => [e.entityId, e]));

      // Helper to check if an entity participates in any PUBLIC/PERSONAL edge
      const entityEdges = (entityId) =>
        edges.filter((e) =>
          String(e.subjectId ?? e.from ?? e.source ?? '') === entityId ||
          String(e.objectId ?? e.to ?? e.target ?? '') === entityId
        );

      const resolved = Array.isArray(perceptualFrame.resolvedEntities) ? perceptualFrame.resolvedEntities : [];

      // 3a. Existence denial: "there is no <X>" / "<X> doesn't exist"
      const negatedFactClaims = claims.filter((c) => c.type === 'fact' && c.negated);
      for (const claim of negatedFactClaims) {
        const valLower = claim.value.toLowerCase();
        for (const ent of entities) {
          const names = [ent.name.toLowerCase(), ent.type, ...ent.aliases.map((a) => a.toLowerCase())].filter(Boolean);
          const matchesEnt = names.some((n) => n.length >= 3 && (valLower.includes(n) || n.includes(valLower)));
          if (matchesEnt && entityEdges(ent.entityId).length > 0) {
            contradictions.push({
              type: 'FACT_CONTRADICTION',
              severity: 0.7,
              detail: `Player denies existence of "${ent.name}", contradicting established world knowledge.`,
            });
            break;
          }
        }
      }

      // 3b. Status & relation polarity contradictions on resolved entities
      for (const res of resolved) {
        const ent = entityById.get(res.entityId);
        if (!ent) continue;
        const relEdges = entityEdges(ent.entityId);
        if (relEdges.length === 0) continue;

        const escapedName = ent.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const mentionsDead = new RegExp(`\\b${escapedName}\\b[^.!?]{0,20}\\b(?:is\\s+dead|died|has\\s+died|was\\s+killed|is\\s+gone)\\b`, 'i').test(normalized);
        const mentionsAlive = new RegExp(`\\b${escapedName}\\b[^.!?]{0,20}\\b(?:is\\s+alive|still\\s+lives|survived)\\b`, 'i').test(normalized);
        const mentionsFriend = new RegExp(`\\b${escapedName}\\b[^.!?]{0,25}\\b(?:is\\s+(?:your|an?)\\s+(?:friend|ally)|is\\s+(?:friendly|harmless|peaceful)|means\\s+no\\s+harm)\\b`, 'i').test(normalized);
        const mentionsEnemy = new RegExp(`\\b${escapedName}\\b[^.!?]{0,25}\\b(?:is\\s+(?:your|an?)\\s+(?:enemy|rival|traitor)|betrayed\\s+you)\\b`, 'i').test(normalized);

        const edgeRels = relEdges.map((e) => String(e.relation ?? e.predicate ?? e.type ?? '').toLowerCase());
        const isDeadInGraph = ent.status === 'dead' || ent.tags.includes('dead') || edgeRels.some((r) => r.includes('dead') || r.includes('deceased') || r.includes('destroyed'));
        const isHostileInGraph =
          ['rival', 'enemy', 'threat', 'hostile', 'crisis'].includes(ent.type) ||
          edgeRels.some((r) => r.includes('rival') || r.includes('enemy') || r.includes('threat') || r.includes('hostile') || r.includes('oppos'));
        const isAllyInGraph =
          ['ally', 'friend'].includes(ent.type) ||
          edgeRels.some((r) => r.includes('ally') || r.includes('friend') || r.includes('loyal') || r.includes('trust') || r.includes('protects'));

        if (mentionsDead && !isDeadInGraph) {
          contradictions.push({
            type: 'FACT_CONTRADICTION',
            severity: 0.72,
            detail: `Player claims "${ent.name}" is dead, contradicting active world knowledge.`,
          });
        } else if (mentionsAlive && isDeadInGraph) {
          contradictions.push({
            type: 'FACT_CONTRADICTION',
            severity: 0.72,
            detail: `Player claims "${ent.name}" is alive, contradicting world knowledge that they are gone.`,
          });
        }

        if (mentionsFriend && isHostileInGraph) {
          contradictions.push({
            type: 'FACT_CONTRADICTION',
            severity: 0.75,
            detail: `Player claims "${ent.name}" is friendly/an ally, contradicting hostile relationship knowledge.`,
          });
        } else if (mentionsEnemy && isAllyInGraph && !isHostileInGraph) {
          contradictions.push({
            type: 'FACT_CONTRADICTION',
            severity: 0.7,
            detail: `Player claims "${ent.name}" is an enemy/traitor, contradicting allied relationship knowledge.`,
          });
        }
      }
    }

    return contradictions;
  }

  toJSON() {
    // Compact encoding: omit embeddings (deterministically recomputed from summary on fromJSON)
    // and trim low-priority fields to stay strictly under 8 KB even at maxEpisodes = 128.
    const encode = (eps, maxSummaryLen) =>
      eps.map((ep) => {
        const row = {
          i: ep.id,
          t: ep.turn,
          s: ep.summary.length > maxSummaryLen ? ep.summary.slice(0, maxSummaryLen) : ep.summary,
          a: ep.primaryAct,
          v: Math.round(ep.valence * 100) / 100,
          m: Math.round(ep.importance * 100) / 100,
        };
        if (ep.entityIds.length > 0) row.e = ep.entityIds.slice(0, 4);
        if (ep.playerClaims.length > 0) {
          row.c = ep.playerClaims.slice(0, 3).map((c) => ({
            t: c.type,
            v: String(c.value ?? '').slice(0, 32),
            ...(c.negated ? { n: 1 } : {}),
          }));
        }
        if (ep.recallCount > 0) row.r = ep.recallCount;
        if (ep.lastRecalledTurn !== ep.turn) row.l = ep.lastRecalledTurn;
        return row;
      });

    let summaryCap = 72;
    let payload = { maxEpisodes: this.maxEpisodes, episodes: encode(this.episodes, summaryCap) };
    let serialized = JSON.stringify(payload);

    if (serialized.length > MAX_SERIALIZED_BYTES) {
      summaryCap = 36;
      payload = { maxEpisodes: this.maxEpisodes, episodes: encode(this.episodes, summaryCap) };
      serialized = JSON.stringify(payload);
    }

    if (serialized.length > MAX_SERIALIZED_BYTES) {
      // Keep highest-importance & most-recent episodes within budget
      const ranked = [...this.episodes].sort((a, b) => (b.importance * 2 + b.turn * 0.01) - (a.importance * 2 + a.turn * 0.01));
      let keepCount = ranked.length;
      while (keepCount > 1 && serialized.length > MAX_SERIALIZED_BYTES) {
        keepCount = Math.floor(keepCount * 0.85);
        const subset = ranked.slice(0, keepCount).sort((a, b) => a.turn - b.turn);
        payload = { maxEpisodes: this.maxEpisodes, episodes: encode(subset, 28) };
        serialized = JSON.stringify(payload);
      }
    }

    return payload;
  }

  fromJSON(data) {
    if (!data || typeof data !== 'object') return this;
    if (Number.isFinite(data.maxEpisodes)) {
      this.maxEpisodes = data.maxEpisodes;
    }
    this.episodes = [];
    const list = Array.isArray(data.episodes) ? data.episodes : [];
    for (const row of list) {
      if (!row || typeof row !== 'object') continue;
      // Support both compact keys and verbose keys
      const summary = String(row.s ?? row.summary ?? '');
      const turn = Number.isFinite(row.t) ? row.t : (Number.isFinite(row.turn) ? row.turn : 0);
      const claims = Array.isArray(row.c)
        ? row.c.map((c) => ({ type: c.t, value: c.v, negated: Boolean(c.n), raw: '' }))
        : Array.isArray(row.playerClaims)
          ? row.playerClaims
          : [];

      this.episodes.push({
        id: String(row.i ?? row.id ?? `ep_${turn}_${this.episodes.length}`),
        turn,
        summary,
        primaryAct: String(row.a ?? row.primaryAct ?? 'UNKNOWN'),
        entityIds: Array.isArray(row.e) ? row.e.map(String) : Array.isArray(row.entityIds) ? row.entityIds.map(String) : [],
        playerClaims: claims,
        valence: clampNeg1To1(row.v ?? row.valence ?? 0),
        importance: clamp01(row.m ?? row.importance ?? 0.5),
        embedding: toFloat32Array(row.embedding, summary),
        recallCount: Number.isFinite(row.r) ? row.r : (Number.isFinite(row.recallCount) ? row.recallCount : 0),
        lastRecalledTurn: Number.isFinite(row.l) ? row.l : (Number.isFinite(row.lastRecalledTurn) ? row.lastRecalledTurn : turn),
      });
    }
    return this;
  }

  static fromJSON(data) {
    return new EpisodicMemory().fromJSON(data);
  }
}

export default { WorkingMemory, EpisodicMemory };
