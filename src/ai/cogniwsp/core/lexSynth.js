// ============================================================================
// CogniWSP General NPC Intelligence (GNI) Core — LexSynth Realizer
// Converts concept token sequences into persona-voiced natural language
// with anti-repetition variant selection and grammatical clause joining.
// Zero-dependency ES Module. Contains ZERO hardcoded world lore.
// ============================================================================

import { CONCEPTS, CID, N_CONCEPTS, createRng } from './constants.js';

const LEX_COLS_PER_CONCEPT = 3;

function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function substitutePlaceholders(template, slotValues = {}) {
  if (!template || !template.includes('{')) return template;
  const map = {
    name: slotValues.WORLD_NPC_NAME || '',
    role: slotValues.WORLD_NPC_ROLE || '',
    home: slotValues.WORLD_HOME || '',
    ruler: slotValues.WORLD_RULER || '',
    crisis: slotValues.WORLD_CRISIS || '',
    item: slotValues.WORLD_ITEM || '',
    rival: slotValues.WORLD_RIVAL || '',
    secret: slotValues.WORLD_SECRET || '',
    rumor: slotValues.WORLD_RUMOR || '',
    custom: slotValues.WORLD_CUSTOM || '',
    hop2: slotValues.WORLD_HOP2_TARGET || '',
    entity: slotValues.WORLD_ACTIVE_ENTITY || '',
    player: slotValues.PLAYER_NAME_SLOT || '',
    unknown: slotValues.UNKNOWN_TERM_SLOT || ''
  };
  return template.replace(/\{([a-z0-9_]+)\}/gi, (match, key) => {
    const val = map[key.toLowerCase()];
    return val !== undefined && val !== '' ? val : match;
  });
}

function normalizeForMatch(str) {
  return String(str ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function chooseVariant(variants, conceptId, { recentNorms, avoidSet, wLex, temperature, rng }) {
  if (variants.length === 1) return { idx: 0, text: variants[0] };

  const scores = new Float32Array(variants.length);
  const lexStride = N_CONCEPTS * LEX_COLS_PER_CONCEPT;

  for (let i = 0; i < variants.length; i++) {
    let score = 0;
    if (wLex && i < LEX_COLS_PER_CONCEPT) {
      const idx = conceptId * lexStride + conceptId * LEX_COLS_PER_CONCEPT + i;
      if (idx >= 0 && idx < wLex.length) score += wLex[idx];
    }

    const vNorm = normalizeForMatch(variants[i]);
    if (avoidSet && avoidSet.has(`${conceptId}:${i}`)) {
      score -= 4.0;
    }
    if (vNorm.length >= 6) {
      for (let r = 0; r < recentNorms.length; r++) {
        if (recentNorms[r].includes(vNorm)) {
          // Stronger penalty for most recent NPC turn
          score -= (recentNorms.length - r) * 2.5;
        }
      }
    }
    scores[i] = score;
  }

  const temp = Math.max(0.05, Number.isFinite(temperature) ? temperature : 0.4);
  if (temp <= 0.15) {
    let best = 0;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] > scores[best]) best = i;
    }
    return { idx: best, text: variants[best] };
  }

  let maxS = -Infinity;
  for (let i = 0; i < scores.length; i++) if (scores[i] > maxS) maxS = scores[i];

  const probs = new Float32Array(scores.length);
  let sum = 0;
  for (let i = 0; i < scores.length; i++) {
    const e = Math.exp((scores[i] - maxS) / temp);
    probs[i] = e;
    sum += e;
  }
  const r = rng() * sum;
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (r <= acc) return { idx: i, text: variants[i] };
  }
  return { idx: 0, text: variants[0] };
}

function joinSegment(current, next, joinType) {
  const piece = next.trim();
  if (!piece) return current;
  if (!current) return capitalizeFirst(piece);

  const trimmed = current.trimEnd();
  const lastChar = trimmed.charAt(trimmed.length - 1);

  if (joinType === 'space') {
    // Space-joined slots (names, items, unknown terms, etc.)
    if (lastChar === ',' || lastChar === ':' || lastChar === '—' || lastChar === '-') {
      return `${trimmed} ${piece}`;
    }
    if (lastChar === '.' || lastChar === '!' || lastChar === '?') {
      return `${trimmed} ${capitalizeFirst(piece)}`;
    }
    return `${trimmed} ${piece}`;
  }

  if (joinType === 'comma') {
    const base = /[,:;—\-]$/.test(trimmed) ? trimmed.slice(0, -1).trimEnd() : trimmed;
    if (/[.!?]$/.test(base)) {
      return `${base} ${capitalizeFirst(piece)}`;
    }
    return `${base}, ${piece}`;
  }

  if (joinType === 'dash') {
    const base = /[,:;—\-]$/.test(trimmed) ? trimmed.slice(0, -1).trimEnd() : trimmed;
    if (/[.!?]$/.test(base)) {
      return `${base} ${capitalizeFirst(piece)}`;
    }
    return `${base} — ${piece}`;
  }

  // Default: 'clause'
  if (lastChar === '.' || lastChar === '!' || lastChar === '?') {
    return `${trimmed} ${capitalizeFirst(piece)}`;
  }
  if (lastChar === ':' || lastChar === '—' || lastChar === ',') {
    return `${trimmed} ${piece}`;
  }
  return `${trimmed}. ${capitalizeFirst(piece)}`;
}

function finalizeText(raw) {
  let out = raw
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/([,:;—\-])\./g, '.')
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\./g, '.')
    .trim();

  if (!out) return '...';
  out = capitalizeFirst(out);
  if (!/[.!?]$/.test(out)) {
    // Preserve question if the final clause clearly starts with a question word
    const lastSentence = out.split(/[.!?]\s+/).pop() || out;
    if (/^(?:who|what|where|why|how|which|whose|whom|are|is|do|does|did|can|could|would|will|shall)\b/i.test(lastSentence.trim())) {
      out += '?';
    } else {
      out += '.';
    }
  }
  return out;
}

export class LexSynthRealizer {
  /**
   * Realize a sequence of concept IDs into persona-voiced surface text.
   *
   * @param {number[]} conceptSeq
   * @param {object} opts
   * @returns {{ text: string, chosenVariants: Array<{ conceptId: number, conceptName: string, variantIdx: number, text: string }> }}
   */
  realize(
    conceptSeq,
    {
      personaKey = 'tavern',
      personas = {},
      slotValues = {},
      learnedPhrases = {},
      recentNpcPhrases = [],
      wLex = null,
      temperature = 0.40,
      rng = null,
      avoidVariants = null
    } = {}
  ) {
    const rand = typeof rng === 'function' ? rng : createRng(20261125);
    const persona = personas[personaKey] || personas.tavern || Object.values(personas)[0] || { lexicon: {} };
    const lexicon = persona.lexicon || {};
    const recentNorms = (recentNpcPhrases || []).slice(-3).map(normalizeForMatch);
    const avoidSet = avoidVariants instanceof Set ? avoidVariants : null;

    let acc = '';
    const chosenVariants = [];

    for (let i = 0; i < conceptSeq.length; i++) {
      const cid = conceptSeq[i];
      if (cid === CID.BOS || cid === CID.EOS) continue;
      const def = CONCEPTS[cid];
      if (!def) continue;

      let segment = '';
      let variantIdx = 0;

      if (def.type === 'world') {
        const val = slotValues[def.name];
        if (!val || typeof val !== 'string' || !val.trim()) continue;
        segment = val.trim();
      } else if (def.type === 'learned') {
        const val = learnedPhrases?.[def.name];
        if (!val || typeof val !== 'string' || !val.trim()) continue;
        segment = substitutePlaceholders(val.trim(), slotValues);
      } else if (def.type === 'core') {
        const entry = lexicon[def.name];
        if (!entry) continue;
        const variants = String(entry)
          .split('|')
          .map((v) => v.trim())
          .filter(Boolean);
        if (variants.length === 0) continue;

        const picked = chooseVariant(variants, cid, {
          recentNorms,
          avoidSet,
          wLex,
          temperature,
          rng: rand
        });
        variantIdx = picked.idx;
        segment = substitutePlaceholders(picked.text, slotValues);
      }

      if (!segment) continue;

      chosenVariants.push({
        conceptId: cid,
        conceptName: def.name,
        variantIdx,
        text: segment
      });

      acc = joinSegment(acc, segment, def.join || 'clause');
    }

    const text = finalizeText(acc);
    return { text, chosenVariants };
  }
}

export default LexSynthRealizer;
