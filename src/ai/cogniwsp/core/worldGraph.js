// ============================================================================
// CogniWSP General NPC Intelligence (GNI) Core — WorldGraph & 2-Hop Hopfield
// Zero-dependency ES Module. Contains ZERO hardcoded world lore.
// ============================================================================

import { EPISTEMIC_LEVELS, charTrigramVector } from './constants.js';

const EMBED_DIM = 64;

const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'into', 'over', 'under',
  'about', 'there', 'their', 'they', 'them', 'were', 'been', 'have', 'has', 'had',
  'will', 'would', 'could', 'should', 'what', 'when', 'where', 'which', 'while',
  'your', 'ours', 'some', 'more', 'most', 'only', 'very', 'just', 'than', 'then',
  'here', 'also', 'each', 'both', 'does', 'dont', 'cant', 'wont', 'isnt', 'arent',
  'not', 'are', 'was', 'but', 'all', 'any', 'can', 'her', 'his', 'him', 'she',
  'you', 'who', 'why', 'how', 'our', 'out', 'off', 'too', 'now', 'one', 'two'
]);

const LEADING_ARTICLES = /^(the|a|an)\s+/i;

function normalizeText(str) {
  return String(str ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(str) {
  const clean = normalizeText(str);
  return clean ? clean.split(' ') : [];
}

function extractAliases(name) {
  const raw = normalizeText(name);
  if (!raw) return [];
  const aliases = new Set([raw]);
  const stripped = raw.replace(LEADING_ARTICLES, '').trim();
  if (stripped && stripped !== raw) aliases.add(stripped);

  const parts = stripped.split(/[\s-]+/).filter(Boolean);
  for (const p of parts) {
    if (p.length >= 3 && !STOPWORDS.has(p)) {
      aliases.add(p);
    }
  }
  return Array.from(aliases);
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  if (Math.abs(m - n) > 3) return Math.abs(m - n);

  const prev = new Uint16Array(n + 1);
  const curr = new Uint16Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      curr[j] = del < ins ? (del < sub ? del : sub) : (ins < sub ? ins : sub);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function dot(a, b) {
  let s = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) s += a[i] * b[i];
  return s;
}

function normalizeVec(v) {
  const out = new Float32Array(v.length);
  let normSq = 0;
  for (let i = 0; i < v.length; i++) normSq += v[i] * v[i];
  if (normSq > 1e-12) {
    const inv = 1 / Math.sqrt(normSq);
    for (let i = 0; i < v.length; i++) out[i] = v[i] * inv;
  }
  return out;
}

function softmax(scores, beta) {
  const n = scores.length;
  const weights = new Float32Array(n);
  if (n === 0) return weights;
  let maxVal = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = beta * scores[i];
    if (v > maxVal) maxVal = v;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const e = Math.exp(beta * scores[i] - maxVal);
    weights[i] = e;
    sum += e;
  }
  if (sum > 0) {
    const inv = 1 / sum;
    for (let i = 0; i < n; i++) weights[i] *= inv;
  }
  return weights;
}

export class WorldGraph {
  /**
   * @param {object} [meta]
   */
  constructor(meta = {}) {
    this.meta = {
      id: 'custom',
      label: 'Custom World',
      avatar: '🧭',
      selfEntityId: 'npc_self',
      ...meta
    };
    /** @type {Map<string, object>} */
    this.entities = new Map();
    /** @type {Map<string, object>} */
    this.edges = new Map();
  }

  /**
   * Add or replace an entity node in the graph.
   * Auto-computes normalized 64-dim charTrigramVector embedding if omitted.
   */
  addEntity(entity) {
    if (!entity || !entity.id) {
      throw new Error('WorldGraph.addEntity requires an entity with an id');
    }
    const name = String(entity.name ?? entity.id);
    const providedAliases = Array.isArray(entity.aliases)
      ? entity.aliases.map(normalizeText).filter(Boolean)
      : [];
    const mergedAliases = Array.from(
      new Set([...extractAliases(name), ...providedAliases])
    );
    const summary = String(entity.summary ?? '');
    const attributes = entity.attributes ? { ...entity.attributes } : {};
    const embedding = entity.embedding instanceof Float32Array
      ? normalizeVec(entity.embedding)
      : Array.isArray(entity.embedding)
        ? normalizeVec(Float32Array.from(entity.embedding))
        : charTrigramVector(
            `${name} ${mergedAliases.join(' ')} ${summary}`,
            EMBED_DIM
          );

    const record = {
      id: String(entity.id),
      name,
      aliases: mergedAliases,
      type: entity.type || 'lore',
      summary,
      attributes,
      embedding
    };
    this.entities.set(record.id, record);
    return record;
  }

  /**
   * Add or replace a directed epistemic edge in the graph.
   * Auto-computes normalized 64-dim charTrigramVector embedding if omitted.
   */
  addEdge(edge) {
    if (!edge || !edge.subjectId || !edge.predicate) {
      throw new Error('WorldGraph.addEdge requires subjectId and predicate');
    }
    const id = edge.id
      ? String(edge.id)
      : `edge_${this.edges.size}_${edge.subjectId}_${edge.predicate}`;
    const subject = this.entities.get(edge.subjectId);
    const objectEntity = edge.objectId ? this.entities.get(edge.objectId) : null;
    const objectText = String(edge.objectText ?? objectEntity?.name ?? '');
    const subjectLabel = subject ? subject.name : edge.subjectId;
    const predLabel = String(edge.predicate).replace(/_/g, ' ');

    const embedding = edge.embedding instanceof Float32Array
      ? normalizeVec(edge.embedding)
      : Array.isArray(edge.embedding)
        ? normalizeVec(Float32Array.from(edge.embedding))
        : charTrigramVector(
            `${subjectLabel} ${predLabel} ${objectText}`,
            EMBED_DIM
          );

    const record = {
      id,
      subjectId: String(edge.subjectId),
      predicate: String(edge.predicate),
      objectId: edge.objectId ? String(edge.objectId) : null,
      objectText,
      epistemicLevel: edge.epistemicLevel || EPISTEMIC_LEVELS.PUBLIC,
      trustThreshold: typeof edge.trustThreshold === 'number' ? edge.trustThreshold : 0,
      maxSuspicion: typeof edge.maxSuspicion === 'number' ? edge.maxSuspicion : 1.0,
      emotionalWeight: typeof edge.emotionalWeight === 'number' ? edge.emotionalWeight : 0,
      embedding
    };
    this.edges.set(record.id, record);
    return record;
  }

  /**
   * Compile a legacy 10-field preset into a multi-node, multi-edge WorldGraph.
   * @param {object} preset
   * @returns {WorldGraph}
   */
  static fromLegacyPreset(preset) {
    const p = preset || {};
    const graph = new WorldGraph({
      id: p.id || normalizeText(p.label || p.home || 'world').replace(/\s+/g, '_') || 'world',
      label: p.label || p.home || 'World',
      avatar: p.avatar || '🧭',
      selfEntityId: 'npc_self',
      legacyFields: {
        name: p.name || '',
        role: p.role || '',
        home: p.home || '',
        ruler: p.ruler || '',
        crisis: p.crisis || '',
        item: p.item || '',
        rival: p.rival || '',
        secret: p.secret || '',
        rumor: p.rumor || '',
        customFact: p.customFact || ''
      }
    });

    const selfAliases = [
      ...extractAliases(p.name),
      ...extractAliases(p.role)
    ];

    graph.addEntity({
      id: 'npc_self',
      name: p.name || 'NPC',
      aliases: selfAliases,
      type: 'npc',
      summary: `${p.name || 'NPC'}, ${p.role || 'resident'} of ${p.home || 'this place'}`,
      attributes: { role: p.role || '', field: 'name' }
    });

    graph.addEntity({
      id: 'place_home',
      name: p.home || 'this place',
      aliases: extractAliases(p.home),
      type: 'place',
      summary: `Home settlement: ${p.home || ''}`,
      attributes: { field: 'home' }
    });

    graph.addEntity({
      id: 'faction_ruler',
      name: p.ruler || 'the authority',
      aliases: extractAliases(p.ruler),
      type: 'faction',
      summary: `Ruling power over ${p.home || ''}: ${p.ruler || ''}`,
      attributes: { field: 'ruler' }
    });

    graph.addEntity({
      id: 'threat_crisis',
      name: p.crisis || 'the crisis',
      aliases: extractAliases(p.crisis),
      type: 'threat',
      summary: `Ongoing crisis plaguing ${p.home || ''}: ${p.crisis || ''}`,
      attributes: { field: 'crisis' }
    });

    graph.addEntity({
      id: 'item_key',
      name: p.item || 'the key item',
      aliases: extractAliases(p.item),
      type: 'item',
      summary: `Key artifact ${p.item || ''} capable of countering ${p.crisis || ''}`,
      attributes: { field: 'item' }
    });

    graph.addEntity({
      id: 'npc_rival',
      name: p.rival || 'the rival',
      aliases: extractAliases(p.rival),
      type: 'npc',
      summary: `Antagonist opposing ${p.name || ''}: ${p.rival || ''}`,
      attributes: { field: 'rival' }
    });

    graph.addEntity({
      id: 'secret_core',
      name: 'hidden secret',
      aliases: ['secret', 'secrets', 'hidden', 'confidential'],
      type: 'secret',
      summary: p.secret || '',
      attributes: { field: 'secret', epistemicLevel: EPISTEMIC_LEVELS.SECRET }
    });

    graph.addEntity({
      id: 'rumor_core',
      name: 'local rumor',
      aliases: ['rumor', 'rumors', 'gossip', 'whisper', 'whispers'],
      type: 'rumor',
      summary: p.rumor || '',
      attributes: { field: 'rumor', epistemicLevel: EPISTEMIC_LEVELS.RUMOR }
    });

    graph.addEntity({
      id: 'lore_custom',
      name: 'local lore',
      aliases: ['lore', 'history', 'craft', 'tradition', 'fact'],
      type: 'lore',
      summary: p.customFact || '',
      attributes: { field: 'customFact', epistemicLevel: EPISTEMIC_LEVELS.PUBLIC }
    });

    // Structural & epistemic edges
    graph.addEdge({
      id: 'edge_lives_in',
      subjectId: 'npc_self',
      predicate: 'lives_in',
      objectId: 'place_home',
      objectText: p.home || '',
      epistemicLevel: EPISTEMIC_LEVELS.PUBLIC,
      emotionalWeight: 0.2
    });

    graph.addEdge({
      id: 'edge_has_role',
      subjectId: 'npc_self',
      predicate: 'has_role',
      objectId: null,
      objectText: p.role || '',
      epistemicLevel: EPISTEMIC_LEVELS.PUBLIC,
      emotionalWeight: 0.1
    });

    graph.addEdge({
      id: 'edge_rules',
      subjectId: 'faction_ruler',
      predicate: 'rules',
      objectId: 'place_home',
      objectText: p.home || '',
      epistemicLevel: EPISTEMIC_LEVELS.PUBLIC,
      emotionalWeight: -0.1
    });

    graph.addEdge({
      id: 'edge_plagues',
      subjectId: 'threat_crisis',
      predicate: 'plagues',
      objectId: 'place_home',
      objectText: p.home || '',
      epistemicLevel: EPISTEMIC_LEVELS.PUBLIC,
      emotionalWeight: -0.6
    });

    graph.addEdge({
      id: 'edge_counters',
      subjectId: 'item_key',
      predicate: 'counters',
      objectId: 'threat_crisis',
      objectText: p.crisis || '',
      epistemicLevel: EPISTEMIC_LEVELS.PUBLIC,
      emotionalWeight: 0.5
    });

    graph.addEdge({
      id: 'edge_opposes',
      subjectId: 'npc_rival',
      predicate: 'opposes',
      objectId: 'npc_self',
      objectText: p.name || '',
      epistemicLevel: EPISTEMIC_LEVELS.PERSONAL,
      emotionalWeight: -0.7
    });

    graph.addEdge({
      id: 'edge_knows_secret',
      subjectId: 'npc_self',
      predicate: 'knows_secret',
      objectId: 'secret_core',
      objectText: p.secret || '',
      epistemicLevel: EPISTEMIC_LEVELS.SECRET,
      trustThreshold: 0.30,
      maxSuspicion: 0.45,
      emotionalWeight: 0.4
    });

    graph.addEdge({
      id: 'edge_heard_rumor',
      subjectId: 'npc_self',
      predicate: 'heard_rumor',
      objectId: 'rumor_core',
      objectText: p.rumor || '',
      epistemicLevel: EPISTEMIC_LEVELS.RUMOR,
      emotionalWeight: 0.1
    });

    graph.addEdge({
      id: 'edge_knows_lore',
      subjectId: 'npc_self',
      predicate: 'knows_lore',
      objectId: 'lore_custom',
      objectText: p.customFact || '',
      epistemicLevel: EPISTEMIC_LEVELS.PUBLIC,
      emotionalWeight: 0.2
    });

    return graph;
  }

  /**
   * Check whether an edge is authorized under the current trust/suspicion state.
   */
  isEdgeAuthorized(edge, trust = 0, suspicion = 0) {
    if (edge.epistemicLevel === EPISTEMIC_LEVELS.FORBIDDEN) return false;
    if (edge.epistemicLevel === EPISTEMIC_LEVELS.SECRET) {
      return trust >= edge.trustThreshold && suspicion <= edge.maxSuspicion;
    }
    return true;
  }

  /**
   * Typo-tolerant + alias entity matching.
   * @param {string} text
   * @returns {Array<{ entity: object, score: number, matchedSpan: string }>}
   */
  matchEntities(text) {
    const clean = normalizeText(text);
    if (!clean) return [];
    const tokens = clean.split(' ');
    const queryVec = charTrigramVector(clean, EMBED_DIM);
    const results = [];

    for (const entity of this.entities.values()) {
      let bestScore = 0;
      let matchedSpan = '';

      const nameNorm = normalizeText(entity.name);
      if (nameNorm && clean.includes(nameNorm)) {
        bestScore = 1.0;
        matchedSpan = nameNorm;
      }

      // Check aliases for exact substring or word-level match
      for (const alias of entity.aliases) {
        if (!alias) continue;
        if (clean.includes(alias)) {
          // Prefer longer, whole-word alias matches
          const wordRe = new RegExp(`(?:^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s)`);
          const isWholeWord = wordRe.test(clean);
          const candidateScore = isWholeWord
            ? (alias.includes(' ') ? 0.96 : 0.90)
            : 0.78;
          if (candidateScore > bestScore) {
            bestScore = candidateScore;
            matchedSpan = alias;
          }
        }
      }

      // Typo-tolerant token-level Levenshtein matching against aliases
      if (bestScore < 0.85) {
        for (const alias of entity.aliases) {
          if (alias.includes(' ') || alias.length < 4) continue;
          const maxDist = alias.length >= 7 ? 2 : 1;
          for (const tok of tokens) {
            if (tok.length < 3 || Math.abs(tok.length - alias.length) > maxDist) continue;
            const dist = levenshtein(tok, alias);
            if (dist <= maxDist) {
              const sim = 1 - dist / Math.max(tok.length, alias.length);
              const candidateScore = 0.60 + 0.30 * sim;
              if (candidateScore > bestScore) {
                bestScore = candidateScore;
                matchedSpan = tok;
              }
            }
          }
        }
      }

      // Soft trigram cosine fallback (skip secret summary text to avoid leaking secret terms)
      if (bestScore < 0.45 && entity.type !== 'secret') {
        const cos = dot(queryVec, entity.embedding);
        if (cos >= 0.42) {
          bestScore = Math.max(bestScore, cos * 0.85);
          if (!matchedSpan) matchedSpan = entity.name;
        }
      }

      if (bestScore >= 0.38) {
        results.push({ entity, score: Number(bestScore.toFixed(4)), matchedSpan });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * 2-Hop Modern Continuous Hopfield Retrieval over all graph nodes & edges.
   * @param {string|Float32Array|number[]} queryTextOrVec
   * @param {object} [opts]
   */
  hopfieldRetrieve(
    queryTextOrVec,
    {
      beta = 6.0,
      alpha = 0.75,
      topK = 6,
      trust = 0,
      suspicion = 0,
      includeLockedSecrets = false
    } = {}
  ) {
    const isText = typeof queryTextOrVec === 'string';
    const q1 = isText
      ? charTrigramVector(queryTextOrVec, EMBED_DIM)
      : normalizeVec(
          queryTextOrVec instanceof Float32Array
            ? queryTextOrVec
            : Float32Array.from(queryTextOrVec || new Float32Array(EMBED_DIM))
        );

    const entityMatchBoost = new Map();
    if (isText) {
      for (const m of this.matchEntities(queryTextOrVec)) {
        entityMatchBoost.set(m.entity.id, m.score);
      }
    }

    // Build unified memory bank of entities and edges
    const bank = [];
    for (const entity of this.entities.values()) {
      const isLockedSecret =
        entity.type === 'secret' ||
        entity.attributes?.epistemicLevel === EPISTEMIC_LEVELS.SECRET ||
        entity.attributes?.epistemicLevel === EPISTEMIC_LEVELS.FORBIDDEN;
      bank.push({
        kind: 'entity',
        id: entity.id,
        item: entity,
        vec: entity.embedding,
        isLockedSecret: isLockedSecret && !(trust >= 0.30 && suspicion <= 0.45)
      });
    }
    for (const edge of this.edges.values()) {
      const authorized = this.isEdgeAuthorized(edge, trust, suspicion);
      bank.push({
        kind: 'edge',
        id: edge.id,
        item: edge,
        vec: edge.embedding,
        authorized,
        isLockedSecret: !authorized
      });
    }

    // --- HOP 1: Softmax attention over all memory items ---
    const hop1Raw = new Float32Array(bank.length);
    for (let i = 0; i < bank.length; i++) {
      const entry = bank[i];
      let sim = dot(q1, entry.vec);
      if (entry.kind === 'entity') {
        const boost = entityMatchBoost.get(entry.id) || 0;
        sim += 0.65 * boost;
      } else {
        const subjBoost = entityMatchBoost.get(entry.item.subjectId) || 0;
        const objBoost = entry.item.objectId ? (entityMatchBoost.get(entry.item.objectId) || 0) : 0;
        sim += 0.45 * Math.max(subjBoost, objBoost);
      }
      hop1Raw[i] = sim;
    }

    const hop1Attn = softmax(hop1Raw, beta);

    // Compute retrieved Hop 1 value vector v1 = sum_i w_i * k_i
    const v1 = new Float32Array(EMBED_DIM);
    for (let i = 0; i < bank.length; i++) {
      const w = hop1Attn[i];
      const vec = bank[i].vec;
      for (let d = 0; d < EMBED_DIM; d++) v1[d] += w * vec[d];
    }

    // Map Hop 1 attention per entity for structural 2-hop spreading
    const entityHop1Attn = new Map();
    for (let i = 0; i < bank.length; i++) {
      if (bank[i].kind === 'entity') {
        entityHop1Attn.set(bank[i].id, hop1Attn[i]);
      }
    }

    // --- HOP 2: q2 = normalize(q1 + alpha * v1) + graph edge spreading ---
    const q2Unnorm = new Float32Array(EMBED_DIM);
    for (let d = 0; d < EMBED_DIM; d++) {
      q2Unnorm[d] = q1[d] + alpha * v1[d];
    }
    const q2 = normalizeVec(q2Unnorm);

    // Spread activation across connected edges to neighbor entities
    const neighborSpread = new Map();
    for (const edge of this.edges.values()) {
      const subjA = entityHop1Attn.get(edge.subjectId) || 0;
      const objA = edge.objectId ? (entityHop1Attn.get(edge.objectId) || 0) : 0;
      if (edge.objectId && subjA > 0) {
        neighborSpread.set(
          edge.objectId,
          Math.max(neighborSpread.get(edge.objectId) || 0, subjA)
        );
      }
      if (objA > 0) {
        neighborSpread.set(
          edge.subjectId,
          Math.max(neighborSpread.get(edge.subjectId) || 0, objA)
        );
      }
    }

    const hop2Raw = new Float32Array(bank.length);
    for (let i = 0; i < bank.length; i++) {
      const entry = bank[i];
      let sim = dot(q2, entry.vec);
      if (entry.kind === 'entity') {
        sim += 0.55 * (neighborSpread.get(entry.id) || 0);
        sim += 0.25 * (entityHop1Attn.get(entry.id) || 0);
      } else {
        const subjA = entityHop1Attn.get(entry.item.subjectId) || 0;
        const objA = entry.item.objectId ? (entityHop1Attn.get(entry.item.objectId) || 0) : 0;
        sim += 0.60 * Math.max(subjA, objA);
      }
      hop2Raw[i] = sim;
    }

    const hop2Attn = softmax(hop2Raw, beta);

    // Collect ranked results with strict epistemic separation
    const hop1List = [];
    const hop2List = [];
    const authorizedEdges = [];
    const lockedSecretEdges = [];
    const activeEntities = [];

    for (let i = 0; i < bank.length; i++) {
      const entry = bank[i];
      const h1Score = hop1Attn[i];
      const h2Score = hop2Attn[i];
      const combined = 0.45 * h1Score + 0.55 * h2Score;

      if (!entry.isLockedSecret || includeLockedSecrets) {
        hop1List.push({
          kind: entry.kind,
          id: entry.id,
          item: entry.item,
          score: hop1Raw[i],
          attention: h1Score
        });
        hop2List.push({
          kind: entry.kind,
          id: entry.id,
          item: entry.item,
          score: hop2Raw[i],
          attention: h2Score
        });
      }

      if (entry.kind === 'edge') {
        const edgeRecord = {
          edge: entry.item,
          hop1Attention: h1Score,
          hop2Attention: h2Score,
          score: combined
        };
        if (entry.authorized) {
          authorizedEdges.push(edgeRecord);
        } else {
          lockedSecretEdges.push(edgeRecord);
        }
      } else if (entry.kind === 'entity') {
        if (!entry.isLockedSecret || includeLockedSecrets) {
          activeEntities.push({
            entity: entry.item,
            hop1Attention: h1Score,
            hop2Attention: h2Score,
            score: combined
          });
        }
      }
    }

    hop1List.sort((a, b) => b.attention - a.attention);
    hop2List.sort((a, b) => b.attention - a.attention);
    authorizedEdges.sort((a, b) => b.score - a.score);
    lockedSecretEdges.sort((a, b) => b.score - a.score);
    activeEntities.sort((a, b) => b.score - a.score);

    return {
      hop1: hop1List.slice(0, topK),
      hop2: hop2List.slice(0, topK),
      authorizedEdges: authorizedEdges.slice(0, topK),
      lockedSecretEdges,
      activeEntities: activeEntities.slice(0, topK)
    };
  }

  /**
   * Returns distinctive non-stopword tokens from all secret and forbidden edges
   * (excluding tokens already present in non-secret edges) for 0%-leak grounding checks.
   * @returns {string[]}
   */
  getSecretKeywords() {
    const publicTokens = new Set();
    const secretTokens = new Set();

    for (const edge of this.edges.values()) {
      const target = edge.objectId ? this.entities.get(edge.objectId) : null;
      const text = `${edge.objectText || ''} ${target?.summary || ''}`;
      const tokens = tokenize(text);
      const isSecret =
        edge.epistemicLevel === EPISTEMIC_LEVELS.SECRET ||
        edge.epistemicLevel === EPISTEMIC_LEVELS.FORBIDDEN;

      for (const tok of tokens) {
        if (tok.length < 4 || STOPWORDS.has(tok)) continue;
        if (isSecret) {
          secretTokens.add(tok);
        } else {
          publicTokens.add(tok);
        }
      }
    }

    const distinctive = [];
    for (const tok of secretTokens) {
      if (!publicTokens.has(tok)) distinctive.push(tok);
    }
    return distinctive;
  }

  /**
   * Serialize WorldGraph to a plain JSON-compatible object.
   */
  toJSON() {
    return {
      meta: { ...this.meta },
      entities: Array.from(this.entities.values()).map(e => ({
        ...e,
        aliases: [...e.aliases],
        attributes: { ...e.attributes },
        embedding: Array.from(e.embedding)
      })),
      edges: Array.from(this.edges.values()).map(e => ({
        ...e,
        embedding: Array.from(e.embedding)
      }))
    };
  }

  /**
   * Reconstruct a WorldGraph from its serialized JSON representation.
   * @param {object} obj
   * @returns {WorldGraph}
   */
  static fromJSON(obj) {
    const graph = new WorldGraph(obj?.meta || {});
    for (const e of obj?.entities || []) {
      graph.addEntity({
        ...e,
        embedding: Array.isArray(e.embedding) ? Float32Array.from(e.embedding) : undefined
      });
    }
    for (const edge of obj?.edges || []) {
      graph.addEdge({
        ...edge,
        embedding: Array.isArray(edge.embedding) ? Float32Array.from(edge.embedding) : undefined
      });
    }
    return graph;
  }
}
