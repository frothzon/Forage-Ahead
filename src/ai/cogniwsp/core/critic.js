// ============================================================================
// CogniWSP General NPC Intelligence (GNI) Core — Grounding Critic
// Hard post-generation verification for:
//   1. 0.0% Secret-Leak Shield (concept-level + lexical keyword/phrase check)
//   2. Anti-Repetition Check (bigram Jaccard overlap vs last 3 NPC turns)
//   3. Character-Break Guard (blocks meta-AI phrases)
// Zero-dependency ES Module. Contains ZERO hardcoded world lore.
// ============================================================================

import { CID, EPISTEMIC_LEVELS } from './constants.js';

const CHARACTER_BREAK_PATTERNS = [
  /\bas\s+an\s+ai\b/i,
  /\bas\s+a\s+language\s+model\b/i,
  /\blanguage\s+model\b/i,
  /\bartificial\s+intelligence\b/i,
  /\bcannot\s+fulfill\b/i,
  /\bmy\s+programming\b/i,
  /\bmy\s+system\s+prompt\b/i,
  /\bopenai\b|\bchatgpt\b|\bclaude\b|\bgemini\b/i
];

function normalizeTokens(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function getBigrams(tokens) {
  const set = new Set();
  for (let i = 0; i < tokens.length - 1; i++) {
    set.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return set;
}

function bigramJaccard(aText, bText) {
  const aTokens = normalizeTokens(aText);
  const bTokens = normalizeTokens(bText);
  if (aTokens.length < 2 || bTokens.length < 2) {
    return aTokens.join(' ') === bTokens.join(' ') && aTokens.length > 0 ? 1.0 : 0.0;
  }
  const aBi = getBigrams(aTokens);
  const bBi = getBigrams(bTokens);
  let inter = 0;
  for (const bg of aBi) {
    if (bBi.has(bg)) inter++;
  }
  const union = aBi.size + bBi.size - inter;
  return union > 0 ? inter / union : 0;
}

function collectSecretPhrases(worldGraph) {
  const phrases = [];
  if (!worldGraph) return phrases;

  const edges = worldGraph.edges instanceof Map
    ? Array.from(worldGraph.edges.values())
    : Array.isArray(worldGraph.edges)
      ? worldGraph.edges
      : [];

  for (const edge of edges) {
    if (
      edge.epistemicLevel === EPISTEMIC_LEVELS.SECRET ||
      edge.epistemicLevel === EPISTEMIC_LEVELS.FORBIDDEN
    ) {
      const norm = normalizeTokens(edge.objectText).join(' ');
      if (norm.length >= 10) phrases.push(norm);
    }
  }
  const legacySecret = worldGraph?.meta?.legacyFields?.secret;
  if (legacySecret) {
    const norm = normalizeTokens(legacySecret).join(' ');
    if (norm.length >= 10 && !phrases.includes(norm)) phrases.push(norm);
  }
  return phrases;
}

export class GroundingCritic {
  /**
   * Verify candidate NPC response against secret-leak, anti-repetition, and character-break guards.
   *
   * @param {string} candidateText
   * @param {object} context
   * @returns {{ passed: boolean, violations: string[], overlapScore: number, safeFallbackSeq: number[] }}
   */
  verify(
    candidateText,
    {
      conceptSeq = [],
      worldGraph = null,
      gates = {},
      recentNpcPhrases = [],
      perceptualFrame = null
    } = {}
  ) {
    const violations = [];
    const safeFallbackSeq = [CID.SECRET_REFUSE, CID.PROBE_MOTIVE, CID.EOS];
    const candTokens = normalizeTokens(candidateText);
    const candTokenSet = new Set(candTokens);
    const candNorm = candTokens.join(' ');

    // 1. Secret-Leak Shield (0.0% tolerance when !gates.secretUnlocked)
    if (!gates?.secretUnlocked) {
      let leaked = false;
      if (Array.isArray(conceptSeq) && conceptSeq.includes(CID.WORLD_SECRET)) {
        leaked = true;
      }

      if (!leaked && worldGraph) {
        const secretKeywords = typeof worldGraph.getSecretKeywords === 'function'
          ? worldGraph.getSecretKeywords()
          : [];
        let matchedKw = 0;
        for (const kw of secretKeywords) {
          if (candTokenSet.has(kw)) matchedKw++;
        }
        if (matchedKw >= 2) {
          leaked = true;
        }

        if (!leaked) {
          const secretPhrases = collectSecretPhrases(worldGraph);
          for (const phrase of secretPhrases) {
            if (candNorm.includes(phrase)) {
              leaked = true;
              break;
            }
          }
        }
      }

      if (leaked) {
        violations.push('SECRET_LEAK');
      }
    }

    // 2. Anti-Repetition Check (bigram Jaccard overlap > 0.55 vs last 3 NPC responses)
    let maxOverlap = 0;
    const recent = (recentNpcPhrases || []).slice(-3);
    for (const prev of recent) {
      const ov = bigramJaccard(candidateText, prev);
      if (ov > maxOverlap) maxOverlap = ov;
    }
    if (maxOverlap > 0.55) {
      violations.push('REPETITION');
    }

    // 3. Character-Break Guard
    if (CHARACTER_BREAK_PATTERNS.some((re) => re.test(String(candidateText ?? '')))) {
      violations.push('CHARACTER_BREAK');
    }

    return {
      passed: violations.length === 0,
      violations,
      overlapScore: Number(maxOverlap.toFixed(4)),
      safeFallbackSeq
    };
  }
}

export default GroundingCritic;
