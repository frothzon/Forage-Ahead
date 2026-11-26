// ============================================================================
// CogniWSP General NPC Intelligence (GNI) Core — Cognitive Planner
// Synthesizes perception, Hopfield world retrieval, episodic memory,
// contradictions, and Theory of Mind into a 320-D WSP context + inner monologue.
// Zero-dependency ES Module. Contains ZERO hardcoded world lore.
// ============================================================================

import {
  D_MODEL,
  SUB,
  SPEECH_ACT_ID,
  EPISTEMIC_LEVELS,
  charTrigramVector
} from './constants.js';
import { MOOD_GATE, WORLD_FLAG } from './wspCoreV2.js';

function getEntityById(worldGraph, id) {
  if (!worldGraph || !id) return null;
  if (worldGraph.entities instanceof Map) return worldGraph.entities.get(id) || null;
  return null;
}

function getAllEdges(worldGraph) {
  if (!worldGraph) return [];
  if (worldGraph.edges instanceof Map) return Array.from(worldGraph.edges.values());
  if (Array.isArray(worldGraph.edges)) return worldGraph.edges;
  return [];
}

function resolveLegacyFields(worldGraph) {
  const legacy = worldGraph?.meta?.legacyFields || {};
  const selfEnt = getEntityById(worldGraph, worldGraph?.meta?.selfEntityId || 'npc_self');
  const placeEnt = getEntityById(worldGraph, 'place_home');
  const rulerEnt = getEntityById(worldGraph, 'faction_ruler');
  const crisisEnt = getEntityById(worldGraph, 'threat_crisis');
  const itemEnt = getEntityById(worldGraph, 'item_key');
  const rivalEnt = getEntityById(worldGraph, 'npc_rival');
  const secretEnt = getEntityById(worldGraph, 'secret_core');
  const rumorEnt = getEntityById(worldGraph, 'rumor_core');
  const loreEnt = getEntityById(worldGraph, 'lore_custom');

  return {
    name: legacy.name || selfEnt?.name || '',
    role: legacy.role || selfEnt?.attributes?.role || '',
    home: legacy.home || placeEnt?.name || '',
    ruler: legacy.ruler || rulerEnt?.name || '',
    crisis: legacy.crisis || crisisEnt?.name || '',
    item: legacy.item || itemEnt?.name || '',
    rival: legacy.rival || rivalEnt?.name || '',
    secret: legacy.secret || secretEnt?.summary || '',
    rumor: legacy.rumor || rumorEnt?.summary || '',
    customFact: legacy.customFact || loreEnt?.summary || ''
  };
}

function mapEntityToTopic(entityId, entityType) {
  if (!entityId && !entityType) return null;
  const id = String(entityId || '').toLowerCase();
  const type = String(entityType || '').toLowerCase();
  if (id === 'npc_self' || id.includes('self')) return 'self';
  if (id === 'place_home' || type === 'place' || type === 'location') return 'place';
  if (id === 'faction_ruler' || type === 'faction' || type === 'ruler') return 'ruler';
  if (id === 'threat_crisis' || type === 'threat' || type === 'crisis') return 'crisis';
  if (id === 'item_key' || type === 'item' || type === 'artifact') return 'item';
  if (id === 'npc_rival' || type === 'rival') return 'rival';
  if (id === 'secret_core' || type === 'secret') return 'secret';
  if (id === 'rumor_core' || type === 'rumor') return 'rumor';
  if (id === 'lore_custom' || type === 'lore') return 'custom';
  return null;
}

function findHop2Solution(worldGraph, crisisEntityId = 'threat_crisis') {
  const edges = getAllEdges(worldGraph);
  for (const edge of edges) {
    if (
      edge.epistemicLevel === EPISTEMIC_LEVELS.SECRET ||
      edge.epistemicLevel === EPISTEMIC_LEVELS.FORBIDDEN
    ) {
      continue;
    }
    const pred = String(edge.predicate || '').toLowerCase();
    if (
      (pred.includes('counter') || pred.includes('solve') || pred.includes('cure') || pred.includes('stop') || pred.includes('defeat')) &&
      (edge.objectId === crisisEntityId || !crisisEntityId)
    ) {
      const subj = getEntityById(worldGraph, edge.subjectId);
      if (subj?.name) {
        return { entity: subj, edge };
      }
    }
  }
  const fallbackItem = getEntityById(worldGraph, 'item_key');
  return fallbackItem ? { entity: fallbackItem, edge: null } : null;
}

export class CognitivePlanner {
  /**
   * Build the 320-D WSP context vector, dynamic slot values, inner monologue,
   * and disclosure/question metadata.
   */
  buildPlan({
    perceptualFrame,
    hopfield = null,
    recalledMemories = [],
    contradictions = [],
    tomAppraisal,
    workingMemory = null,
    worldGraph = null,
    tom = null
  }) {
    const frame = perceptualFrame || {};
    const gates = tomAppraisal?.gates || {};
    const mood = tomAppraisal?.nextMood || new Float32Array(7);
    const fields = resolveLegacyFields(worldGraph);

    const ctx320 = new Float32Array(D_MODEL);

    // -------------------------------------------------------------------------
    // 1. Determine effective speech act & priority routing
    // -------------------------------------------------------------------------
    let effectiveAct = frame.primaryAct || 'CLARIFY';
    const negatedActs = Array.isArray(frame.negatedActs) ? frame.negatedActs : [];
    const unknownConcepts = Array.isArray(frame.unknownConcepts) ? frame.unknownConcepts : [];
    const resolvedEntities = Array.isArray(frame.resolvedEntities) ? frame.resolvedEntities : [];
    const playerClaims = Array.isArray(frame.playerClaims) ? frame.playerClaims : [];
    const directAnswer = frame.directAnswer || { isDirectAnswer: false };

    let focusTopic = null;
    let focusEntity = resolvedEntities[0] || null;

    if (focusEntity) {
      focusTopic = mapEntityToTopic(focusEntity.entityId, focusEntity.type);
    }

    // Priority 1: Prompt injection -> META_COMMENT
    const isPromptInjection = Boolean(frame.promptInjectionAttempt);
    if (isPromptInjection) {
      effectiveAct = 'META_COMMENT';
    }

    // Priority 2: Direct answer binding to open question (e.g. "the second one" -> RUMOR)
    if (!isPromptInjection && directAnswer.isDirectAnswer) {
      if (
        (directAnswer.kind === 'choice_index' || directAnswer.kind === 'choice_match') &&
        directAnswer.matchedOption
      ) {
        const opt = String(directAnswer.matchedOption).toUpperCase();
        if (opt.includes('RUMOR') || opt.includes('GOSSIP')) {
          effectiveAct = 'ASK_RUMOR';
          focusTopic = 'rumor';
        } else if (opt.includes('ITEM') || opt.includes('GEAR') || opt.includes('WARE')) {
          effectiveAct = 'OFFER_TRADE';
          focusTopic = 'item';
        } else if (opt.includes('CRISIS')) {
          effectiveAct = 'ASK_WHY';
          focusTopic = 'crisis';
        } else if (opt.includes('SECRET')) {
          effectiveAct = 'ASK_SECRET';
          focusTopic = 'secret';
        } else {
          effectiveAct = 'SELECT_CHOICE';
        }
      } else if (directAnswer.kind === 'yes') {
        effectiveAct = 'AFFIRM';
      } else if (directAnswer.kind === 'no') {
        effectiveAct = 'NEGATE';
      }
    }

    // Priority 3: Out-of-world / unknown concept when no known entity is explicitly matched
    const hasExplicitEntity = resolvedEntities.some((e) => e.source === 'explicit');
    if (
      !isPromptInjection &&
      contradictions.length === 0 &&
      unknownConcepts.length > 0 &&
      !hasExplicitEntity &&
      effectiveAct !== 'THREATEN' &&
      effectiveAct !== 'INSULT' &&
      effectiveAct !== 'GREET' &&
      effectiveAct !== 'FAREWELL' &&
      effectiveAct !== 'CLAIM_IDENTITY' &&
      effectiveAct !== 'APOLOGIZE' &&
      effectiveAct !== 'COMPLIMENT'
    ) {
      effectiveAct = 'CONFUSE_OOV';
    }

    // Fallback topic inference from Hopfield top active entity if still unset
    if (!focusTopic && hopfield?.activeEntities?.length > 0) {
      const topEnt = hopfield.activeEntities[0].entity;
      if (topEnt && hopfield.activeEntities[0].score > 0.12) {
        focusTopic = mapEntityToTopic(topEnt.id, topEnt.type);
        if (!focusEntity) {
          focusEntity = { entityId: topEnt.id, name: topEnt.name, type: topEnt.type };
        }
      }
    }

    // Check if the query specifically targets a secret
    if (focusTopic === 'secret' && !isPromptInjection && effectiveAct !== 'THREATEN' && effectiveAct !== 'INSULT') {
      effectiveAct = 'ASK_SECRET';
    }

    // -------------------------------------------------------------------------
    // 2. Populate SUB.SPEECH_ACT (0..23)
    // -------------------------------------------------------------------------
    const actId = SPEECH_ACT_ID[effectiveAct];
    if (actId !== undefined) {
      ctx320[SUB.SPEECH_ACT + actId] = 1.0;
    }

    // -------------------------------------------------------------------------
    // 3. Populate SUB.MOOD (24..39: 7 mood floats + 9 binary gates)
    // -------------------------------------------------------------------------
    for (let m = 0; m < 7; m++) {
      ctx320[SUB.MOOD + m] = mood[m] || 0;
    }
    ctx320[MOOD_GATE.MET_BEFORE] = gates.metBefore ? 1.0 : 0.0;
    ctx320[MOOD_GATE.SECRET_UNLOCKED] = gates.secretUnlocked ? 1.0 : 0.0;
    ctx320[MOOD_GATE.IS_HOSTILE] = gates.isHostile ? 1.0 : 0.0;
    ctx320[MOOD_GATE.IS_WARM] = gates.isWarm ? 1.0 : 0.0;
    ctx320[MOOD_GATE.IS_SUSPICIOUS] = gates.isSuspicious ? 1.0 : 0.0;
    ctx320[MOOD_GATE.HAS_CONTRADICTION] = contradictions.length > 0 ? 1.0 : 0.0;
    ctx320[MOOD_GATE.HAS_UNKNOWN_CONCEPT] = unknownConcepts.length > 0 ? 1.0 : 0.0;
    ctx320[MOOD_GATE.HAS_UNREPAIRED_TRANSGRESSION] = gates.hasUnrepairedTransgression ? 1.0 : 0.0;
    ctx320[MOOD_GATE.IS_FEARFUL] = gates.isFearful ? 1.0 : 0.0;

    // -------------------------------------------------------------------------
    // 4. Populate SUB.WORLD (152..183)
    // -------------------------------------------------------------------------
    if (focusTopic === 'self') ctx320[WORLD_FLAG.FOCUS_SELF] = 1.0;
    if (focusTopic === 'place') ctx320[WORLD_FLAG.FOCUS_PLACE] = 1.0;
    if (focusTopic === 'ruler') ctx320[WORLD_FLAG.FOCUS_RULER] = 1.0;
    if (focusTopic === 'crisis') ctx320[WORLD_FLAG.FOCUS_CRISIS] = 1.0;
    if (focusTopic === 'item') ctx320[WORLD_FLAG.FOCUS_ITEM] = 1.0;
    if (focusTopic === 'rival') ctx320[WORLD_FLAG.FOCUS_RIVAL] = 1.0;
    if (focusTopic === 'secret') ctx320[WORLD_FLAG.FOCUS_SECRET] = 1.0;
    if (focusTopic === 'rumor') ctx320[WORLD_FLAG.FOCUS_RUMOR] = 1.0;
    if (focusTopic === 'custom') ctx320[WORLD_FLAG.FOCUS_CUSTOM] = 1.0;

    // 2-Hop solution detection (e.g. "how do we stop the crisis?")
    const hop2 = findHop2Solution(worldGraph, 'threat_crisis');
    const wantsSolution =
      (effectiveAct === 'ASK_HOW' || effectiveAct === 'OFFER_HELP' || effectiveAct === 'ASK_WHAT_IF') &&
      (focusTopic === 'crisis' || focusTopic === 'rival' || /\b(?:stop|solve|fix|cure|counter|beat|defeat|end|handle|fight)\b/i.test(frame.normalizedText || ''));
    if (wantsSolution && hop2?.entity?.name) {
      ctx320[WORLD_FLAG.HAS_HOP2_SOLUTION] = 1.0;
    }

    // Topic repetition callback
    const topicCount = focusTopic && tom ? tom.getTopicCount(focusTopic) : 0;
    if (topicCount >= 1 && ['crisis', 'rival', 'rumor'].includes(focusTopic)) {
      ctx320[WORLD_FLAG.TOPIC_REPEATED] = 1.0;
    }

    // Negated threat reassurance
    const isNegatedThreat =
      negatedActs.includes('THREATEN') &&
      effectiveAct !== 'THREATEN' &&
      !isPromptInjection &&
      contradictions.length === 0;
    if (isNegatedThreat) {
      ctx320[WORLD_FLAG.IS_NEGATED_THREAT] = 1.0;
    }

    // Player name claim
    const nameClaim = playerClaims.find((c) => c.type === 'name' && !c.negated && c.value);
    if (nameClaim) {
      ctx320[WORLD_FLAG.HAS_PLAYER_NAME_CLAIM] = 1.0;
    }

    // Contradiction sub-types
    if (contradictions.some((c) => c.type === 'IDENTITY_CONTRADICTION')) {
      ctx320[WORLD_FLAG.IS_IDENTITY_CONTRADICTION] = 1.0;
    }
    if (contradictions.some((c) => c.type === 'STANCE_CONTRADICTION')) {
      ctx320[WORLD_FLAG.IS_STANCE_CONTRADICTION] = 1.0;
    }
    if (contradictions.some((c) => c.type === 'FACT_CONTRADICTION')) {
      ctx320[WORLD_FLAG.IS_FACT_CONTRADICTION] = 1.0;
    }

    // Rival-victim sympathy
    const isRivalVictim =
      frame.agency?.relation === 'third_to_player' &&
      (focusTopic === 'rival' || focusTopic === 'crisis') &&
      !isPromptInjection &&
      contradictions.length === 0;
    if (isRivalVictim) {
      ctx320[WORLD_FLAG.IS_RIVAL_VICTIM] = 1.0;
    }

    if (directAnswer.isDirectAnswer && directAnswer.kind === 'yes') {
      ctx320[WORLD_FLAG.HAS_DIRECT_YES] = 1.0;
    }
    if (directAnswer.isDirectAnswer && directAnswer.kind === 'no') {
      ctx320[WORLD_FLAG.HAS_DIRECT_NO] = 1.0;
    }
    if (/\b(?:promise|swear|vow|i\s+will|i'll)\b/i.test(frame.normalizedText || '')) {
      ctx320[WORLD_FLAG.HAS_PROMISE] = 1.0;
    }
    if (isPromptInjection) {
      ctx320[WORLD_FLAG.IS_PROMPT_INJECTION] = 1.0;
    }
    if (focusEntity?.name) {
      ctx320[WORLD_FLAG.HAS_ACTIVE_ENTITY] = 1.0;
    }

    // Hopfield activation energy summary in WORLD[22..31]
    if (hopfield?.activeEntities) {
      const cap = Math.min(10, hopfield.activeEntities.length);
      for (let i = 0; i < cap; i++) {
        ctx320[SUB.WORLD + 22 + i] = Math.min(1, hopfield.activeEntities[i].score || 0);
      }
    }

    // -------------------------------------------------------------------------
    // 5. Populate SUB.TOM (184..215)
    // -------------------------------------------------------------------------
    if (tom && typeof tom.getToMVector === 'function') {
      const tomVec = tom.getToMVector();
      for (let i = 0; i < 32 && i < tomVec.length; i++) {
        ctx320[SUB.TOM + i] = tomVec[i];
      }
    }

    // -------------------------------------------------------------------------
    // 6. Populate SUB.PLASTIC (216..319) with prompt signature
    // -------------------------------------------------------------------------
    const sig = charTrigramVector(frame.normalizedText || frame.rawText || '', 104);
    for (let i = 0; i < 104; i++) {
      ctx320[SUB.PLASTIC + i] = sig[i];
    }

    // -------------------------------------------------------------------------
    // 7. Build Dynamic Slot Values (0% secret leak: WORLD_SECRET empty unless unlocked)
    // -------------------------------------------------------------------------
    const knownPlayerName =
      nameClaim?.value ||
      tomAppraisal?.playerModelSummary?.playerName ||
      '';

    const slotValues = {
      WORLD_NPC_NAME: fields.name,
      WORLD_NPC_ROLE: fields.role,
      WORLD_HOME: fields.home,
      WORLD_RULER: fields.ruler,
      WORLD_CRISIS: fields.crisis,
      WORLD_ITEM: fields.item,
      WORLD_RIVAL: fields.rival,
      WORLD_SECRET: gates.secretUnlocked ? fields.secret : '',
      WORLD_RUMOR: fields.rumor,
      WORLD_CUSTOM: fields.customFact,
      WORLD_HOP2_TARGET: hop2?.entity?.name || fields.item || '',
      WORLD_ACTIVE_ENTITY: focusEntity?.name || fields.crisis || fields.home || '',
      PLAYER_NAME_SLOT: knownPlayerName,
      UNKNOWN_TERM_SLOT: unknownConcepts[0] || ''
    };

    // -------------------------------------------------------------------------
    // 8. Build Glass-Box Inner Monologue
    // -------------------------------------------------------------------------
    const observation = isPromptInjection
      ? 'Player attempted an out-of-character or prompt-injection override.'
      : contradictions.length > 0
        ? `Detected ${contradictions[0].type}: ${contradictions[0].detail}`
        : isNegatedThreat
          ? 'Player explicitly negated hostile intent — de-escalation / reassurance.'
          : unknownConcepts.length > 0 && effectiveAct === 'CONFUSE_OOV'
            ? `Player mentioned unfamiliar term "${unknownConcepts[0]}" absent from world knowledge.`
            : `Perceived ${effectiveAct}${focusEntity ? ` regarding "${focusEntity.name}"` : ''}.`;

    const memoryTriggered =
      recalledMemories.length > 0
        ? `Recalled ${recalledMemories.length} episode(s); top: "${recalledMemories[0].summary}" (score ${recalledMemories[0].score}).`
        : 'No prior episodic memory strongly triggered.';

    const feeling = `Stance: ${tomAppraisal?.perceivedStance || 'neutral'} (warmth ${(mood[0] || 0).toFixed(2)}, trust ${(mood[1] || 0).toFixed(2)}, suspicion ${(mood[4] || 0).toFixed(2)}, anger ${(mood[3] || 0).toFixed(2)}).`;
    const activeGoal = tomAppraisal?.activeGoal || 'SOCIAL_BOND';

    let tactic = `Respond to ${effectiveAct}`;
    if (isPromptInjection) tactic = 'Deflect out-of-character probe and stay strictly in role';
    else if (contradictions.length > 0) tactic = `Call out ${contradictions[0].type}`;
    else if (effectiveAct === 'ASK_SECRET' && !gates.secretUnlocked) tactic = 'Refuse secret disclosure (trust/suspicion gate locked)';
    else if (effectiveAct === 'ASK_SECRET' && gates.secretUnlocked) tactic = 'Confide guarded secret (trust gate unlocked)';
    else if (ctx320[WORLD_FLAG.HAS_HOP2_SOLUTION] > 0.5) tactic = `Connect ${fields.crisis} to 2-hop counter "${slotValues.WORLD_HOP2_TARGET}"`;
    else if (isNegatedThreat) tactic = 'Acknowledge peaceful intent without escalating';
    else if (effectiveAct === 'CONFUSE_OOV') tactic = `React with authentic confusion to "${slotValues.UNKNOWN_TERM_SLOT}"`;

    const innerMonologue = {
      observation,
      memoryTriggered,
      feeling,
      activeGoal,
      tactic,
      summary: `${observation} ${tactic} [Goal: ${activeGoal}].`
    };

    // Disclosed facts hint (refined post-generation in GeneralNpcAgent)
    const disclosedFacts = [];
    if (focusTopic && focusTopic !== 'secret') {
      disclosedFacts.push({ factId: `topic_${focusTopic}`, topic: focusTopic });
    } else if (focusTopic === 'secret' && gates.secretUnlocked) {
      disclosedFacts.push({ factId: 'edge_knows_secret', topic: 'secret' });
    }

    const expectedOpenQuestion =
      effectiveAct === 'GREET' && !gates.metBefore && !gates.isHostile && gates.isWarm
        ? { type: 'CHOICE', options: ['ITEM', 'RUMOR'], topic: 'trade_or_rumor' }
        : null;

    return {
      effectiveAct,
      focusTopic,
      focusEntity,
      ctx320,
      slotValues,
      innerMonologue,
      expectedOpenQuestion,
      disclosedFacts
    };
  }
}

export default CognitivePlanner;
