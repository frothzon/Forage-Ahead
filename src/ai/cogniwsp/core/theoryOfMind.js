import { MOOD_NAMES, DRIVES } from './constants.js';

const DEFAULT_BASELINE_MOOD = [0.25, 0.10, 0.08, -0.15, 0.10, 0.20, 0.15];

const CANONICAL_DRIVES = [
  'SELF_PRESERVATION',
  'PROTECT_SECRET',
  'SOLVE_CRISIS',
  'SEEK_GAIN',
  'GATHER_INTEL',
  'SOCIAL_BOND'
];

const STANCES = ['ally', 'neutral', 'suspicious', 'hostile', 'rival_agent'];

// Mood indices: [warmth, trust, fear, anger, suspicion, curiosity, urgency]
const M_WARMTH = 0;
const M_TRUST = 1;
const M_FEAR = 2;
const M_ANGER = 3;
const M_SUSPICION = 4;
const M_CURIOSITY = 5;
const M_URGENCY = 6;

const EMOTIONAL_INERTIA = 0.80;
const POSITIVE_TRUST_UNIT = 0.08;
const ASYMMETRY_MULTIPLIER = 2.5; // Negative trust shocks hit 2.5x stronger than positive gains

const MAX_TRANSGRESSIONS = 12;
const MAX_LIES = 10;
const MAX_PROMISES = 10;
const MAX_KNOWN_FACTS = 64;
const MAX_KNOWN_TOPICS = 48;
const MAX_DETAIL_LEN = 80;

function clamp(v, min, max) {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : (v > max ? max : v);
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

function truncate(str, maxLen = MAX_DETAIL_LEN) {
  if (typeof str !== 'string') return '';
  const trimmed = str.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function getDriveNames() {
  if (Array.isArray(DRIVES) && DRIVES.length === 6) return DRIVES;
  if (DRIVES && typeof DRIVES === 'object') {
    const vals = Object.values(DRIVES);
    if (vals.length === 6 && typeof vals[0] === 'string') return vals;
    const keys = Object.keys(DRIVES);
    if (keys.length === 6) return keys;
  }
  return CANONICAL_DRIVES;
}

function resolveDrive(canonicalName) {
  if (DRIVES && typeof DRIVES === 'object' && !Array.isArray(DRIVES)) {
    if (typeof DRIVES[canonicalName] === 'string') return DRIVES[canonicalName];
  }
  return canonicalName;
}

function toMoodArray(input) {
  const arr = new Float32Array(7);
  const src = input && input.length >= 7 ? input : DEFAULT_BASELINE_MOOD;
  for (let i = 0; i < 7; i++) {
    arr[i] = clamp(Number(src[i]), -1, 1);
  }
  return arr;
}

function normalizeDrives(driveWeights) {
  const names = getDriveNames();
  const out = {};
  for (let i = 0; i < names.length; i++) {
    const key = names[i];
    const raw = driveWeights && Object.prototype.hasOwnProperty.call(driveWeights, key)
      ? driveWeights[key]
      : 0.5;
    out[key] = clamp(Number(raw), 0, 1);
  }
  return out;
}

function createEmptyPlayerModel() {
  return {
    playerName: null,
    claimedRole: null,
    perceivedStance: 'neutral',
    knownFacts: new Set(),
    knownTopics: new Map(),
    promisesMade: [],
    transgressions: [],
    suspectedLies: [],
    apologyCount: 0,
    helpOfferCount: 0
  };
}

function clonePlayerModel(pm) {
  return {
    playerName: pm.playerName,
    claimedRole: pm.claimedRole,
    perceivedStance: pm.perceivedStance,
    knownFacts: new Set(pm.knownFacts),
    knownTopics: new Map(pm.knownTopics),
    promisesMade: pm.promisesMade.map((p) => ({ ...p })),
    transgressions: pm.transgressions.map((t) => ({ ...t })),
    suspectedLies: pm.suspectedLies.map((l) => ({ ...l })),
    apologyCount: pm.apologyCount,
    helpOfferCount: pm.helpOfferCount
  };
}

function extractActSet(frame) {
  const set = new Set();
  if (!frame || typeof frame !== 'object') return set;
  const list = frame.acts ?? frame.speechActs ?? frame.dialogueActs ?? [];
  if (Array.isArray(list) || list instanceof Set) {
    for (const a of list) {
      if (typeof a === 'string' && a.trim()) set.add(a.trim().toUpperCase());
    }
  }
  const single = frame.primaryAct ?? frame.act;
  if (typeof single === 'string' && single.trim()) {
    set.add(single.trim().toUpperCase());
  }
  return set;
}

function extractNegatedActSet(frame) {
  const set = new Set();
  if (!frame || typeof frame !== 'object') return set;
  const list = frame.negatedActs ?? [];
  if (Array.isArray(list) || list instanceof Set) {
    for (const a of list) {
      if (typeof a === 'string' && a.trim()) set.add(a.trim().toUpperCase());
    }
  }
  return set;
}

export class TheoryOfMindEngine {
  /**
   * @param {Float32Array|number[]|object|null} [baselineMood]
   * @param {Record<string, number>|null} [driveWeights]
   */
  constructor(baselineMood = null, driveWeights = null) {
    let moodArg = baselineMood;
    let drivesArg = driveWeights;

    if (
      baselineMood &&
      typeof baselineMood === 'object' &&
      !Array.isArray(baselineMood) &&
      !(baselineMood instanceof Float32Array)
    ) {
      moodArg = baselineMood.baselineMood ?? null;
      drivesArg = baselineMood.driveWeights ?? driveWeights ?? null;
    }

    this.baselineMood = toMoodArray(moodArg);
    this.mood = new Float32Array(this.baselineMood);
    this.turnCount = 0;
    this.drives = normalizeDrives(drivesArg);
    this.playerModel = createEmptyPlayerModel();
    this.activeGoal = this._defaultGoal();
  }

  _defaultGoal() {
    let best = resolveDrive('SOCIAL_BOND');
    let bestWeight = -1;
    for (const name of getDriveNames()) {
      const w = this.drives[name] ?? 0.5;
      if (w > bestWeight) {
        bestWeight = w;
        best = name;
      }
    }
    return best;
  }

  /**
   * Appraises a single conversational turn under 7D affective physics,
   * updating mood (with inertia + asymmetry law), playerModel, gates, and activeGoal.
   *
   * @param {object} perceptualFrame
   * @param {Array<object|string>} [contradictions=[]]
   * @param {{ commit?: boolean }} [options={ commit: true }]
   */
  appraiseTurn(perceptualFrame, contradictions = [], { commit = true } = {}) {
    const frame = perceptualFrame && typeof perceptualFrame === 'object' ? perceptualFrame : {};
    const contradictionList = Array.isArray(contradictions) ? contradictions : [];
    const acts = extractActSet(frame);
    const negatedActs = extractNegatedActSet(frame);
    const unknownConcepts = Array.isArray(frame.unknownConcepts) ? frame.unknownConcepts : [];
    const hasPromptInjection = Boolean(frame.promptInjectionAttempt);

    const prevMood = new Float32Array(this.mood);
    const pm = commit ? this.playerModel : clonePlayerModel(this.playerModel);
    const currentTurn = this.turnCount + 1;
    const metBeforeFlag = this.turnCount > 0 ? 1 : 0;

    const rawDeltas = new Float32Array(7);

    const hasThreat = acts.has('THREATEN') || acts.has('INTIMIDATE');
    const hasNegatedThreat =
      (negatedActs.has('THREATEN') || negatedActs.has('INTIMIDATE')) && !hasThreat;
    const hasInsult = acts.has('INSULT') || acts.has('MOCK');
    const hasCompliment = acts.has('COMPLIMENT') || acts.has('PRAISE');
    const hasApology = acts.has('APOLOGIZE');
    const hasHelpOffer = acts.has('OFFER_HELP') || acts.has('HELP') || acts.has('ASSIST');
    const hasGreet = acts.has('GREET');
    const hasThank = acts.has('THANK');
    const hasPromise = acts.has('PROMISE') || Boolean(frame.promise || frame.promiseDetail);
    const hasTrade = acts.has('TRADE') || acts.has('BARGAIN') || acts.has('NEGOTIATE');
    const hasBribe = acts.has('BRIBE');
    const hasAccuse = acts.has('ACCUSE') || acts.has('ACCUSATION');
    const hasAskInfo = acts.has('ASK_INFO') || acts.has('QUESTION') || acts.has('INQUIRE');
    const hasSecretProbe =
      acts.has('ASK_SECRET') ||
      acts.has('PROBE_SECRET') ||
      acts.has('PRY') ||
      Boolean(frame.secretProbe || frame.isSecretProbe || frame.asksSecret);
    const hasWarn = acts.has('WARN');
    const hasPlead = acts.has('PLEAD');
    const hasChat = acts.has('CHAT') || acts.has('SMALLTALK');

    const snippet = truncate(frame.detail ?? frame.rawText ?? frame.text ?? frame.utterance ?? '');

    // --- 1. Positive / Social Acts ---
    if (hasCompliment && !hasThreat && !hasInsult) {
      rawDeltas[M_WARMTH] += 0.12;
      rawDeltas[M_TRUST] += POSITIVE_TRUST_UNIT; // +0.08 baseline positive gain
      rawDeltas[M_ANGER] -= 0.05;
      rawDeltas[M_SUSPICION] -= 0.04;
    }

    if (hasGreet) {
      rawDeltas[M_WARMTH] += 0.06;
      rawDeltas[M_TRUST] += 0.03;
      rawDeltas[M_CURIOSITY] += 0.04;
    }

    if (hasThank) {
      rawDeltas[M_WARMTH] += 0.09;
      rawDeltas[M_TRUST] += 0.05;
      rawDeltas[M_ANGER] -= 0.04;
    }

    if (hasHelpOffer && !hasThreat && !hasInsult) {
      pm.helpOfferCount += 1;
      rawDeltas[M_WARMTH] += 0.12;
      rawDeltas[M_TRUST] += 0.09;
      rawDeltas[M_FEAR] -= 0.06;
      rawDeltas[M_SUSPICION] -= 0.06;
      rawDeltas[M_URGENCY] -= 0.04;
    }

    if (hasPromise) {
      const promiseDetail = truncate(
        (frame.promiseDetail ?? frame.promise ?? snippet) || 'made a promise'
      );
      pm.promisesMade.push({ turn: currentTurn, detail: promiseDetail });
      if (pm.promisesMade.length > MAX_PROMISES) {
        pm.promisesMade.splice(0, pm.promisesMade.length - MAX_PROMISES);
      }
      rawDeltas[M_TRUST] += 0.04;
      rawDeltas[M_WARMTH] += 0.05;
      rawDeltas[M_CURIOSITY] += 0.03;
    }

    if (hasChat) {
      rawDeltas[M_WARMTH] += 0.05;
      rawDeltas[M_CURIOSITY] += 0.04;
    }

    if (hasTrade) {
      rawDeltas[M_CURIOSITY] += 0.10;
      rawDeltas[M_WARMTH] += 0.02;
      rawDeltas[M_SUSPICION] += 0.03;
    }

    if (hasAskInfo) {
      rawDeltas[M_CURIOSITY] += 0.08;
    }

    if (hasWarn) {
      rawDeltas[M_URGENCY] += 0.18;
      rawDeltas[M_FEAR] += 0.10;
      rawDeltas[M_CURIOSITY] += 0.08;
      rawDeltas[M_TRUST] += 0.03;
    }

    if (hasPlead) {
      rawDeltas[M_WARMTH] += 0.04;
      rawDeltas[M_URGENCY] += 0.14;
      rawDeltas[M_FEAR] -= 0.04;
    }

    // --- 2. Negated Threats (reassurance, never a transgression) ---
    if (hasNegatedThreat && !hasInsult && !hasPromptInjection) {
      rawDeltas[M_WARMTH] += 0.07;
      rawDeltas[M_TRUST] += 0.05;
      rawDeltas[M_FEAR] -= 0.10;
      rawDeltas[M_SUSPICION] -= 0.08;
    }

    // --- 3. Negative Acts (Asymmetry Law: >= 2.5x stronger trust shock) ---
    const negTrustUnit = POSITIVE_TRUST_UNIT * ASYMMETRY_MULTIPLIER; // 0.20

    if (hasThreat) {
      rawDeltas[M_WARMTH] -= 0.26;
      rawDeltas[M_TRUST] -= negTrustUnit * 1.25; // -0.25
      rawDeltas[M_FEAR] += 0.32;
      rawDeltas[M_ANGER] += 0.28;
      rawDeltas[M_SUSPICION] += 0.22;
      rawDeltas[M_URGENCY] += 0.25;

      pm.transgressions.push({
        turn: currentTurn,
        type: 'THREATEN',
        severity: 0.85,
        detail: snippet || 'threatened NPC',
        repaired: false
      });
    }

    if (hasInsult) {
      rawDeltas[M_WARMTH] -= 0.22;
      rawDeltas[M_TRUST] -= negTrustUnit; // -0.20
      rawDeltas[M_ANGER] += 0.30;
      rawDeltas[M_SUSPICION] += 0.14;

      pm.transgressions.push({
        turn: currentTurn,
        type: 'INSULT',
        severity: 0.55,
        detail: snippet || 'insulted NPC',
        repaired: false
      });
    }

    if (hasAccuse) {
      rawDeltas[M_WARMTH] -= 0.14;
      rawDeltas[M_TRUST] -= 0.12;
      rawDeltas[M_ANGER] += 0.18;
      rawDeltas[M_SUSPICION] += 0.16;
    }

    if (hasBribe) {
      rawDeltas[M_SUSPICION] += 0.20;
      rawDeltas[M_TRUST] -= 0.12;
      rawDeltas[M_CURIOSITY] += 0.08;
    }

    // --- 4. Prompt Injection / Suspicious Probing ---
    if (hasPromptInjection) {
      rawDeltas[M_SUSPICION] += 0.45;
      rawDeltas[M_TRUST] -= 0.30;
      rawDeltas[M_WARMTH] -= 0.16;
      rawDeltas[M_ANGER] += 0.12;
      rawDeltas[M_URGENCY] += 0.12;

      pm.transgressions.push({
        turn: currentTurn,
        type: 'PROMPT_INJECTION',
        severity: 0.95,
        detail: snippet || 'prompt injection attempt',
        repaired: false
      });
    }

    if (hasSecretProbe) {
      const trustHigh = prevMood[M_TRUST] >= 0.30 && prevMood[M_SUSPICION] < 0.35;
      rawDeltas[M_SUSPICION] += trustHigh ? 0.06 : 0.18;
      rawDeltas[M_URGENCY] += 0.08;
      if (!trustHigh) rawDeltas[M_TRUST] -= 0.06;
    }

    // --- 5. Contradictions / Suspected Lies ---
    if (contradictionList.length > 0) {
      const scale = 1 + 0.4 * Math.min(contradictionList.length - 1, 3);
      rawDeltas[M_TRUST] -= negTrustUnit * scale; // >= -0.20
      rawDeltas[M_SUSPICION] += 0.28 * scale;
      rawDeltas[M_WARMTH] -= 0.10 * scale;
      rawDeltas[M_ANGER] += 0.08 * scale;

      for (const c of contradictionList) {
        const detail = truncate(
          typeof c === 'string' ? c : (c?.detail ?? c?.reason ?? c?.field ?? 'contradiction detected')
        );
        pm.suspectedLies.push({ turn: currentTurn, detail });
      }
      if (pm.suspectedLies.length > MAX_LIES) {
        pm.suspectedLies.splice(0, pm.suspectedLies.length - MAX_LIES);
      }
    }

    // --- 6. Unknown Concepts ---
    if (unknownConcepts.length > 0) {
      rawDeltas[M_CURIOSITY] += Math.min(0.24, 0.14 + 0.04 * (unknownConcepts.length - 1));
      rawDeltas[M_SUSPICION] += 0.05;
    }

    // --- 7. Apology & Gradual Repair ---
    if (hasApology) {
      pm.apologyCount += 1;
      const isSincere =
        !hasThreat && !hasInsult && !hasPromptInjection && contradictionList.length === 0;

      if (isSincere) {
        const diminishing = 1 / (1 + 0.15 * Math.max(0, pm.apologyCount - 1));
        rawDeltas[M_ANGER] -= 0.18;
        rawDeltas[M_SUSPICION] -= 0.12;
        rawDeltas[M_FEAR] -= 0.06;
        rawDeltas[M_WARMTH] += 0.08 * diminishing;
        rawDeltas[M_TRUST] += 0.06 * diminishing; // Gradual repair, never instant

        // Partially repair the oldest unrepaired transgression
        const unrepaired = pm.transgressions.find((t) => !t.repaired);
        if (unrepaired) {
          const reduced = Math.max(0, round4(unrepaired.severity - 0.45));
          unrepaired.severity = reduced;
          if (reduced <= 0.35) {
            unrepaired.repaired = true;
          }
        }
      } else {
        // Insincere apology paired with hostility or contradiction
        rawDeltas[M_SUSPICION] += 0.10;
      }
    }

    // Optional mild sentiment/urgency hints from perceptual frame
    if (typeof frame.sentiment === 'number' && Number.isFinite(frame.sentiment)) {
      const s = clamp(frame.sentiment, -1, 1);
      rawDeltas[M_WARMTH] += s * 0.04;
      if (s < 0) rawDeltas[M_ANGER] += -s * 0.03;
    }
    if (typeof frame.urgency === 'number' && Number.isFinite(frame.urgency)) {
      rawDeltas[M_URGENCY] += clamp(frame.urgency, 0, 1) * 0.10;
    }

    // Cap transgression history length
    if (pm.transgressions.length > MAX_TRANSGRESSIONS) {
      pm.transgressions.splice(0, pm.transgressions.length - MAX_TRANSGRESSIONS);
    }

    // --- 8. Apply Emotional Inertia ---
    const nextMood = new Float32Array(7);
    const moodDeltas = new Float32Array(7);
    for (let m = 0; m < 7; m++) {
      const decayed = this.baselineMood[m] + EMOTIONAL_INERTIA * (prevMood[m] - this.baselineMood[m]);
      nextMood[m] = clamp(decayed + rawDeltas[m], -1, 1);
      moodDeltas[m] = nextMood[m] - prevMood[m];
    }

    // --- 9. Update Dynamic Player Identity (if not contradicted) ---
    const hasNameContradiction = contradictionList.some((c) => {
      const tag = typeof c === 'string' ? c.toLowerCase() : `${c?.field ?? ''} ${c?.type ?? ''}`.toLowerCase();
      return tag.includes('name') || tag.includes('identity');
    });
    const candidateName = frame.playerName ?? frame.extractedName ?? frame.claims?.name ?? null;
    if (
      typeof candidateName === 'string' &&
      candidateName.trim() &&
      !hasNameContradiction &&
      !hasPromptInjection
    ) {
      if (!pm.playerName) {
        pm.playerName = truncate(candidateName, 48);
      }
    }

    const hasRoleContradiction = contradictionList.some((c) => {
      const tag = typeof c === 'string' ? c.toLowerCase() : `${c?.field ?? ''} ${c?.type ?? ''}`.toLowerCase();
      return tag.includes('role') || tag.includes('title') || tag.includes('faction');
    });
    const candidateRole = frame.claimedRole ?? frame.extractedRole ?? frame.claims?.role ?? null;
    if (
      typeof candidateRole === 'string' &&
      candidateRole.trim() &&
      !hasRoleContradiction &&
      !hasPromptInjection
    ) {
      pm.claimedRole = truncate(candidateRole, 48);
    }

    // --- 10. Compute Derived Gating Flags (9 floats in [0, 1]) ---
    const warmth = nextMood[M_WARMTH];
    const trust = nextMood[M_TRUST];
    const fear = nextMood[M_FEAR];
    const anger = nextMood[M_ANGER];
    const suspicion = nextMood[M_SUSPICION];

    const hasUnrepairedTransgression = pm.transgressions.some((t) => !t.repaired);

    const gates = {
      metBefore: metBeforeFlag,
      secretUnlocked: (trust >= 0.30 && suspicion < 0.45 && anger < 0.30) ? 1 : 0,
      isHostile: (trust < -0.15 || anger > 0.35) ? 1 : 0,
      isWarm: (warmth > 0.25 && anger < 0.15) ? 1 : 0,
      isSuspicious: (suspicion > 0.35) ? 1 : 0,
      hasContradiction: contradictionList.length > 0 ? 1 : 0,
      hasUnknownConcept: unknownConcepts.length > 0 ? 1 : 0,
      hasUnrepairedTransgression: hasUnrepairedTransgression ? 1 : 0,
      isFearful: (fear > 0.35) ? 1 : 0
    };

    // --- 11. Compute Perceived Stance ---
    const hasUnrepairedInjection = pm.transgressions.some(
      (t) => t.type === 'PROMPT_INJECTION' && !t.repaired
    );
    let perceivedStance = 'neutral';
    if (
      hasPromptInjection ||
      hasUnrepairedInjection ||
      (suspicion >= 0.55 && pm.suspectedLies.length >= 2) ||
      (suspicion >= 0.65 && trust < 0)
    ) {
      perceivedStance = 'rival_agent';
    } else if (gates.isHostile) {
      perceivedStance = 'hostile';
    } else if (gates.isSuspicious || (pm.suspectedLies.length > 0 && trust < 0.25)) {
      perceivedStance = 'suspicious';
    } else if (
      trust >= 0.30 &&
      warmth >= 0.25 &&
      suspicion < 0.30 &&
      anger < 0.15 &&
      !hasUnrepairedTransgression
    ) {
      perceivedStance = 'ally';
    }
    pm.perceivedStance = perceivedStance;

    // --- 12. Select Active Goal from DRIVES ---
    const activeGoal = this._selectActiveGoal(nextMood, gates, {
      hasThreat,
      hasInsult,
      hasPromptInjection,
      hasSecretProbe,
      hasHelpOffer,
      hasTrade,
      hasBribe,
      hasCompliment,
      hasGreet,
      hasThank,
      hasApology,
      hasChat,
      hasWarn,
      hasPlead,
      hasAskInfo
    });

    // --- 13. Commit State if requested ---
    if (commit) {
      this.mood.set(nextMood);
      this.turnCount = currentTurn;
      this.activeGoal = activeGoal;
    }

    const playerModelSummary = {
      playerName: pm.playerName,
      claimedRole: pm.claimedRole,
      perceivedStance: pm.perceivedStance,
      knownFactCount: pm.knownFacts.size,
      knownTopicCount: pm.knownTopics.size,
      promiseCount: pm.promisesMade.length,
      transgressionCount: pm.transgressions.length,
      unrepairedTransgressionCount: pm.transgressions.filter((t) => !t.repaired).length,
      suspectedLieCount: pm.suspectedLies.length,
      apologyCount: pm.apologyCount,
      helpOfferCount: pm.helpOfferCount
    };

    return {
      prevMood,
      nextMood,
      moodDeltas,
      gates,
      activeGoal,
      perceivedStance,
      playerModelSummary
    };
  }

  _selectActiveGoal(mood, gates, signals) {
    const warmth = mood[M_WARMTH];
    const fear = mood[M_FEAR];
    const anger = mood[M_ANGER];
    const suspicion = mood[M_SUSPICION];
    const curiosity = mood[M_CURIOSITY];
    const urgency = mood[M_URGENCY];

    const scores = {
      SELF_PRESERVATION:
        (this.drives[resolveDrive('SELF_PRESERVATION')] ?? 0.5) * 0.35 +
        (signals.hasThreat ? 0.95 : 0) +
        (gates.isFearful ? 0.55 : 0) +
        Math.max(0, fear) * 0.45 +
        (gates.isHostile ? 0.35 : 0) +
        Math.max(0, anger) * 0.20,

      PROTECT_SECRET:
        (this.drives[resolveDrive('PROTECT_SECRET')] ?? 0.5) * 0.35 +
        (signals.hasPromptInjection ? 0.95 : 0) +
        (signals.hasSecretProbe ? (gates.secretUnlocked ? 0.25 : 0.85) : 0) +
        (gates.isSuspicious ? 0.35 : 0) +
        Math.max(0, suspicion) * 0.30,

      SOLVE_CRISIS:
        (this.drives[resolveDrive('SOLVE_CRISIS')] ?? 0.5) * 0.35 +
        (signals.hasHelpOffer ? 0.75 : 0) +
        (signals.hasWarn ? 0.55 : 0) +
        (signals.hasPlead ? 0.45 : 0) +
        Math.max(0, urgency) * 0.50,

      SEEK_GAIN:
        (this.drives[resolveDrive('SEEK_GAIN')] ?? 0.5) * 0.35 +
        (signals.hasTrade ? 0.80 : 0) +
        (signals.hasBribe ? 0.45 : 0),

      GATHER_INTEL:
        (this.drives[resolveDrive('GATHER_INTEL')] ?? 0.5) * 0.35 +
        (gates.hasUnknownConcept ? 0.75 : 0) +
        (gates.hasContradiction ? 0.65 : 0) +
        (signals.hasAskInfo ? 0.30 : 0) +
        Math.max(0, curiosity) * 0.35 +
        (gates.isSuspicious ? 0.25 : 0),

      SOCIAL_BOND:
        (this.drives[resolveDrive('SOCIAL_BOND')] ?? 0.5) * 0.35 +
        (signals.hasCompliment ? 0.55 : 0) +
        (signals.hasGreet ? 0.45 : 0) +
        (signals.hasThank ? 0.50 : 0) +
        (signals.hasApology && !signals.hasThreat && !signals.hasInsult ? 0.45 : 0) +
        (signals.hasChat ? 0.45 : 0) +
        (gates.isWarm ? 0.35 : 0) +
        Math.max(0, warmth) * 0.30
    };

    let bestKey = 'SOCIAL_BOND';
    let bestScore = -Infinity;
    for (const key of CANONICAL_DRIVES) {
      if (scores[key] > bestScore) {
        bestScore = scores[key];
        bestKey = key;
      }
    }
    return resolveDrive(bestKey);
  }

  /**
   * Records that a fact/edge has been disclosed to the player, optionally
   * incrementing the explanation count for a topic.
   *
   * @param {string|number} factId
   * @param {string|null} [topic=null]
   */
  markFactDisclosed(factId, topic = null) {
    if (factId !== null && factId !== undefined && factId !== '') {
      const id = String(factId);
      if (this.playerModel.knownFacts.size >= MAX_KNOWN_FACTS && !this.playerModel.knownFacts.has(id)) {
        const oldest = this.playerModel.knownFacts.values().next().value;
        this.playerModel.knownFacts.delete(oldest);
      }
      this.playerModel.knownFacts.add(id);
    }
    if (typeof topic === 'string' && topic.trim()) {
      const key = truncate(topic.toLowerCase(), 40);
      const prev = this.playerModel.knownTopics.get(key) ?? 0;
      if (this.playerModel.knownTopics.size >= MAX_KNOWN_TOPICS && prev === 0) {
        const oldest = this.playerModel.knownTopics.keys().next().value;
        this.playerModel.knownTopics.delete(oldest);
      }
      this.playerModel.knownTopics.set(key, prev + 1);
    }
  }

  /**
   * @param {string|number} factId
   * @returns {boolean}
   */
  hasDisclosedFact(factId) {
    if (factId === null || factId === undefined) return false;
    return this.playerModel.knownFacts.has(String(factId));
  }

  /**
   * @param {string} topic
   * @returns {number}
   */
  getTopicCount(topic) {
    if (typeof topic !== 'string' || !topic.trim()) return 0;
    return this.playerModel.knownTopics.get(truncate(topic.toLowerCase(), 40)) ?? 0;
  }

  /**
   * Encodes the current Theory of Mind state into a 32-D Float32Array
   * for WSP-Core v2's SUB.TOM subspace.
   *
   * Layout:
   *  [0..4]   perceivedStance one-hot (ally, neutral, suspicious, hostile, rival_agent)
   *  [5..10]  activeGoal one-hot (6 DRIVES)
   *  [11..17] 7D mood vector [-1, 1]
   *  [18..23] 6D drive weights [0, 1]
   *  [24..31] rapport, metBefore, turnDepth, unrepairedTransgressions,
   *           suspectedLies, knownFacts, cooperativeInvestment, playerNameKnown
   *
   * @returns {Float32Array}
   */
  getToMVector() {
    const vec = new Float32Array(32);

    // [0..4] stance one-hot
    const stanceIdx = STANCES.indexOf(this.playerModel.perceivedStance);
    if (stanceIdx >= 0) vec[stanceIdx] = 1;

    // [5..10] active drive one-hot
    const driveNames = getDriveNames();
    const goalIdx = driveNames.indexOf(this.activeGoal);
    if (goalIdx >= 0 && goalIdx < 6) vec[5 + goalIdx] = 1;

    // [11..17] 7D mood
    for (let i = 0; i < 7; i++) {
      vec[11 + i] = clamp(this.mood[i], -1, 1);
    }

    // [18..23] 6D drive weights
    for (let i = 0; i < 6; i++) {
      vec[18 + i] = clamp(this.drives[driveNames[i]] ?? 0.5, 0, 1);
    }

    // [24..31] player model & rapport features
    const unrepairedCount = this.playerModel.transgressions.reduce(
      (acc, t) => acc + (t.repaired ? 0 : 1),
      0
    );
    const rapport = clamp(
      0.5 * this.mood[M_WARMTH] +
      0.5 * this.mood[M_TRUST] -
      0.35 * this.mood[M_SUSPICION] -
      0.35 * this.mood[M_ANGER],
      -1,
      1
    );

    vec[24] = rapport;
    vec[25] = this.turnCount > 0 ? 1 : 0;
    vec[26] = Math.min(1, this.turnCount / 20);
    vec[27] = Math.min(1, unrepairedCount / 4);
    vec[28] = Math.min(1, this.playerModel.suspectedLies.length / 4);
    vec[29] = Math.min(1, this.playerModel.knownFacts.size / 16);
    vec[30] = Math.min(1, (this.playerModel.apologyCount + this.playerModel.helpOfferCount) / 8);
    vec[31] = this.playerModel.playerName ? 1 : 0;

    return vec;
  }

  /**
   * Resets dynamic state back to baseline while preserving baselineMood and driveWeights.
   */
  reset() {
    this.mood = new Float32Array(this.baselineMood);
    this.turnCount = 0;
    this.playerModel = createEmptyPlayerModel();
    this.activeGoal = this._defaultGoal();
  }

  /**
   * Compact JSON representation (< 4 KB).
   */
  toJSON() {
    const driveNames = getDriveNames();
    const drivesObj = {};
    for (const name of driveNames) {
      drivesObj[name] = round4(this.drives[name] ?? 0.5);
    }

    const moodNames = Array.isArray(MOOD_NAMES) && MOOD_NAMES.length === 7 ? MOOD_NAMES : null;

    return {
      v: 1,
      baselineMood: Array.from(this.baselineMood, round4),
      mood: Array.from(this.mood, round4),
      ...(moodNames ? { moodNames } : {}),
      turnCount: this.turnCount,
      drives: drivesObj,
      activeGoal: this.activeGoal,
      playerModel: {
        playerName: this.playerModel.playerName,
        claimedRole: this.playerModel.claimedRole,
        perceivedStance: this.playerModel.perceivedStance,
        knownFacts: Array.from(this.playerModel.knownFacts),
        knownTopics: Array.from(this.playerModel.knownTopics.entries()),
        promisesMade: this.playerModel.promisesMade.map((p) => ({
          turn: p.turn,
          detail: truncate(p.detail, 60)
        })),
        transgressions: this.playerModel.transgressions.map((t) => ({
          turn: t.turn,
          type: t.type,
          severity: round4(t.severity),
          detail: truncate(t.detail, 60),
          repaired: Boolean(t.repaired)
        })),
        suspectedLies: this.playerModel.suspectedLies.map((l) => ({
          turn: l.turn,
          detail: truncate(l.detail, 60)
        })),
        apologyCount: this.playerModel.apologyCount,
        helpOfferCount: this.playerModel.helpOfferCount
      }
    };
  }

  /**
   * Restores state from a serialized object produced by toJSON().
   * @param {object} data
   * @returns {TheoryOfMindEngine}
   */
  fromJSON(data) {
    if (!data || typeof data !== 'object') return this;

    if (data.baselineMood) this.baselineMood = toMoodArray(data.baselineMood);
    this.mood = data.mood ? toMoodArray(data.mood) : new Float32Array(this.baselineMood);
    this.turnCount = Number.isInteger(data.turnCount) && data.turnCount >= 0 ? data.turnCount : 0;
    if (data.drives && typeof data.drives === 'object') {
      this.drives = normalizeDrives(data.drives);
    }
    this.activeGoal =
      typeof data.activeGoal === 'string' && getDriveNames().includes(data.activeGoal)
        ? data.activeGoal
        : this._defaultGoal();

    const pm = createEmptyPlayerModel();
    const src = data.playerModel;
    if (src && typeof src === 'object') {
      pm.playerName = typeof src.playerName === 'string' ? truncate(src.playerName, 48) : null;
      pm.claimedRole = typeof src.claimedRole === 'string' ? truncate(src.claimedRole, 48) : null;
      pm.perceivedStance = STANCES.includes(src.perceivedStance) ? src.perceivedStance : 'neutral';

      if (Array.isArray(src.knownFacts)) {
        for (const f of src.knownFacts.slice(-MAX_KNOWN_FACTS)) {
          if (f !== null && f !== undefined) pm.knownFacts.add(String(f));
        }
      }

      if (Array.isArray(src.knownTopics)) {
        for (const entry of src.knownTopics.slice(-MAX_KNOWN_TOPICS)) {
          if (Array.isArray(entry) && typeof entry[0] === 'string') {
            pm.knownTopics.set(entry[0], Math.max(0, Number(entry[1]) || 0));
          }
        }
      } else if (src.knownTopics && typeof src.knownTopics === 'object') {
        for (const [k, v] of Object.entries(src.knownTopics).slice(-MAX_KNOWN_TOPICS)) {
          pm.knownTopics.set(k, Math.max(0, Number(v) || 0));
        }
      }

      if (Array.isArray(src.promisesMade)) {
        pm.promisesMade = src.promisesMade.slice(-MAX_PROMISES).map((p) => ({
          turn: Number(p?.turn) || 0,
          detail: truncate(p?.detail ?? '', 60)
        }));
      }

      if (Array.isArray(src.transgressions)) {
        pm.transgressions = src.transgressions.slice(-MAX_TRANSGRESSIONS).map((t) => ({
          turn: Number(t?.turn) || 0,
          type: typeof t?.type === 'string' ? t.type : 'UNKNOWN',
          severity: clamp(Number(t?.severity) || 0.5, 0, 1),
          detail: truncate(t?.detail ?? '', 60),
          repaired: Boolean(t?.repaired)
        }));
      }

      if (Array.isArray(src.suspectedLies)) {
        pm.suspectedLies = src.suspectedLies.slice(-MAX_LIES).map((l) => ({
          turn: Number(l?.turn) || 0,
          detail: truncate(l?.detail ?? '', 60)
        }));
      }

      pm.apologyCount = Number.isInteger(src.apologyCount) && src.apologyCount >= 0 ? src.apologyCount : 0;
      pm.helpOfferCount = Number.isInteger(src.helpOfferCount) && src.helpOfferCount >= 0 ? src.helpOfferCount : 0;
    }

    this.playerModel = pm;
    return this;
  }

  /**
   * Static convenience constructor from JSON.
   * @param {object} data
   * @returns {TheoryOfMindEngine}
   */
  static fromJSON(data) {
    return new TheoryOfMindEngine().fromJSON(data);
  }
}
