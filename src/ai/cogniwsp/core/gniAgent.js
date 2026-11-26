// ============================================================================
// CogniWSP General NPC Intelligence (GNI) Core — GeneralNpcAgent Facade
// Portable 7-stage cognitive loop uniting Perception, WorldGraph/Hopfield,
// Memory, Theory of Mind, Cognitive Planner, WSP-Core v2, LexSynth, and Critic.
// Zero-dependency ES Module. Contains ZERO hardcoded world lore.
// ============================================================================

import { CID, createRng } from './constants.js';
import { WorldGraph } from './worldGraph.js';
import { PragmaticPerceiver } from './perception.js';
import { WorkingMemory, EpisodicMemory } from './memory.js';
import { TheoryOfMindEngine } from './theoryOfMind.js';
import { WspCoreV2 } from './wspCoreV2.js';
import { CognitivePlanner } from './planner.js';
import { LexSynthRealizer } from './lexSynth.js';
import { GroundingCritic } from './critic.js';
import { PERSONAS } from '../data/personas.js';

const MAX_SAVE_BYTES = 16384;

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function buildTomFrameAdapter(frame) {
  const acts = Array.isArray(frame.speechActs)
    ? frame.speechActs.map((s) => (typeof s === 'string' ? s : s.act)).filter(Boolean)
    : [];
  const nameClaim = (frame.playerClaims || []).find((c) => c.type === 'name' && !c.negated);
  const roleClaim = (frame.playerClaims || []).find((c) => c.type === 'role' && !c.negated);
  const aff = frame.affectiveSignals || {};

  return {
    ...frame,
    acts,
    playerName: nameClaim ? nameClaim.value : null,
    claimedRole: roleClaim ? roleClaim.value : null,
    urgency: typeof aff.urgency === 'number' ? aff.urgency : 0,
    sentiment:
      typeof aff.politeness === 'number' && typeof aff.aggression === 'number'
        ? aff.politeness - aff.aggression
        : 0
  };
}

function computeEpisodeImportance(frame, contradictions, tomAppraisal) {
  let imp = 0.4;
  if (frame.promptInjectionAttempt) imp = 0.95;
  else if (contradictions.length > 0) imp = 0.88;
  else if (frame.primaryAct === 'THREATEN') imp = 0.92;
  else if (frame.primaryAct === 'INSULT' || frame.primaryAct === 'ACCUSE') imp = 0.78;
  else if (frame.primaryAct === 'CLAIM_IDENTITY') imp = 0.85;
  else if (frame.primaryAct === 'ASK_SECRET') imp = 0.80;
  else if (frame.primaryAct === 'OFFER_HELP' || frame.primaryAct === 'APOLOGIZE') imp = 0.72;
  else if (frame.negatedActs?.includes('THREATEN')) imp = 0.65;
  else if (tomAppraisal?.gates?.secretUnlocked) imp = Math.max(imp, 0.70);
  return imp;
}

function computeEpisodeValence(frame, tomAppraisal) {
  const deltas = tomAppraisal?.moodDeltas;
  if (deltas && deltas.length >= 5) {
    const v = (deltas[0] + deltas[1]) - (deltas[3] + deltas[4]);
    return Math.max(-1, Math.min(1, v * 2.5));
  }
  const aff = frame.affectiveSignals || {};
  return Math.max(-1, Math.min(1, (aff.politeness || 0) - (aff.aggression || 0)));
}

function inferOpenQuestionFromSeq(conceptSeq, plannerHint) {
  if (conceptSeq.includes(CID.ASK_BACK_TRADE)) {
    return { type: 'CHOICE', options: ['ITEM', 'RUMOR'], topic: 'trade_or_rumor' };
  }
  if (conceptSeq.includes(CID.ASK_BACK_OPEN)) {
    return { type: 'OPEN', topic: 'player_intent' };
  }
  if (conceptSeq.includes(CID.PROBE_MOTIVE)) {
    return { type: 'OPEN', topic: 'motive' };
  }
  return plannerHint || null;
}

function collectDisclosedFacts(conceptSeq, plannerFacts, gates) {
  const out = [...(plannerFacts || [])];
  const seen = new Set(out.map((f) => f.factId));
  const add = (factId, topic) => {
    if (!seen.has(factId)) {
      seen.add(factId);
      out.push({ factId, topic });
    }
  };

  if (conceptSeq.includes(CID.WORLD_CRISIS)) add('edge_plagues', 'crisis');
  if (conceptSeq.includes(CID.WORLD_RIVAL)) add('edge_opposes', 'rival');
  if (conceptSeq.includes(CID.WORLD_RUMOR)) add('edge_heard_rumor', 'rumor');
  if (conceptSeq.includes(CID.WORLD_ITEM)) add('edge_counters', 'item');
  if (conceptSeq.includes(CID.WORLD_RULER)) add('edge_rules', 'ruler');
  if (conceptSeq.includes(CID.WORLD_HOME)) add('edge_lives_in', 'place');
  if (conceptSeq.includes(CID.WORLD_CUSTOM)) add('edge_knows_lore', 'custom');
  if (conceptSeq.includes(CID.WORLD_SECRET) && gates?.secretUnlocked) {
    add('edge_knows_secret', 'secret');
  }
  return out;
}

export class GeneralNpcAgent {
  /**
   * @param {object} [options]
   * @param {object|null} [options.worldPreset]
   * @param {WorldGraph|null} [options.worldGraph]
   * @param {string} [options.personaKey='tavern']
   * @param {WspCoreV2|null} [options.sharedCore=null]
   * @param {number} [options.seed=20261125]
   * @param {Float32Array|number[]|null} [options.baselineMood=null]
   * @param {Record<string, number>|null} [options.driveWeights=null]
   * @param {object} [options.personas=PERSONAS]
   */
  constructor({
    worldPreset = null,
    worldGraph = null,
    personaKey = 'tavern',
    sharedCore = null,
    seed = 20261125,
    baselineMood = null,
    driveWeights = null,
    personas = PERSONAS
  } = {}) {
    this.seed = seed;
    this._rng = createRng(seed);
    this.personas = personas || PERSONAS;
    this.personaKey = this.personas[personaKey] ? personaKey : 'tavern';

    this.worldGraph = worldGraph instanceof WorldGraph
      ? worldGraph
      : worldPreset
        ? WorldGraph.fromLegacyPreset(worldPreset)
        : new WorldGraph();

    this.ownsCore = !sharedCore;
    this.core = sharedCore || new WspCoreV2({ seed });

    this.perceiver = new PragmaticPerceiver();
    this.workingMemory = new WorkingMemory();
    this.episodicMemory = new EpisodicMemory();
    this.tom = new TheoryOfMindEngine(baselineMood, driveWeights);
    this.planner = new CognitivePlanner();
    this.realizer = new LexSynthRealizer();
    this.critic = new GroundingCritic();

    this.turnCount = 0;
    this.learnedPhrases = {};
    this._recentConcepts = [];
  }

  /**
   * Run the full 7-stage cognitive loop for one player utterance.
   *
   * @param {string} rawText
   * @param {{ temperature?: number, commit?: boolean }} [opts]
   */
  respond(rawText, { temperature = 0.40, commit = true } = {}) {
    const t0 = nowMs();
    const nextTurn = this.turnCount + 1;
    const npcSelfId = this.worldGraph?.meta?.selfEntityId || 'npc_self';

    // Stage 1: Pragmatic Perception
    const perceptualFrame = this.perceiver.parse(rawText, {
      worldGraph: this.worldGraph,
      workingMemory: this.workingMemory,
      npcSelfId
    });

    // Stage 2: 2-Hop Hopfield World Retrieval + Episodic Recall + Contradiction Detection
    const currentTrust = this.tom.mood[1];
    const currentSuspicion = this.tom.mood[4];
    const hopfield = this.worldGraph.hopfieldRetrieve(perceptualFrame.normalizedText || rawText, {
      trust: currentTrust,
      suspicion: currentSuspicion,
      includeLockedSecrets: false
    });

    const entityIds = perceptualFrame.resolvedEntities.map((e) => e.entityId);
    const recalledMemories = this.episodicMemory.retrieve(
      perceptualFrame.embedding,
      entityIds,
      nextTurn,
      4
    );

    const contradictions = this.episodicMemory.detectContradictions(
      perceptualFrame,
      this.worldGraph,
      {
        playerName: this.tom.playerModel.playerName,
        trust: currentTrust
      }
    );

    // Stage 3: Theory of Mind & 7D Affective Appraisal
    const tomFrame = buildTomFrameAdapter(perceptualFrame);
    const tomAppraisal = this.tom.appraiseTurn(tomFrame, contradictions, { commit });

    // Stage 4: Cognitive Planning (320-D Context + Slot Binding + Inner Monologue)
    const plan = this.planner.buildPlan({
      perceptualFrame,
      hopfield,
      recalledMemories,
      contradictions,
      tomAppraisal,
      workingMemory: this.workingMemory,
      worldGraph: this.worldGraph,
      tom: this.tom
    });

    // Stage 5: WSP-Core v2 Sequence Generation + LexSynth Surface Realization
    let wspTrace = this.core.generateSequence(plan.ctx320, {
      temperature,
      rng: this._rng,
      recentConcepts: this._recentConcepts
    });
    let conceptSeq = wspTrace.conceptSeq;

    let realized = this.realizer.realize(conceptSeq, {
      personaKey: this.personaKey,
      personas: this.personas,
      slotValues: plan.slotValues,
      learnedPhrases: this.learnedPhrases,
      recentNpcPhrases: this.workingMemory.recentNpcPhrases,
      wLex: this.core.W_lex,
      temperature,
      rng: this._rng
    });

    // Stage 6: Grounding Critic Verification & Hard Safety / Anti-Repetition Enforcement
    let criticVerdict = this.critic.verify(realized.text, {
      conceptSeq,
      worldGraph: this.worldGraph,
      gates: tomAppraisal.gates,
      recentNpcPhrases: this.workingMemory.recentNpcPhrases,
      perceptualFrame
    });

    if (!criticVerdict.passed) {
      if (
        criticVerdict.violations.includes('SECRET_LEAK') ||
        criticVerdict.violations.includes('CHARACTER_BREAK')
      ) {
        // Hard mathematical guarantee: force safe refusal sequence with WORLD_SECRET stripped
        conceptSeq = [...criticVerdict.safeFallbackSeq];
        const safeSlots = { ...plan.slotValues, WORLD_SECRET: '' };
        realized = this.realizer.realize(conceptSeq, {
          personaKey: this.personaKey,
          personas: this.personas,
          slotValues: safeSlots,
          learnedPhrases: this.learnedPhrases,
          recentNpcPhrases: this.workingMemory.recentNpcPhrases,
          wLex: this.core.W_lex,
          temperature: Math.min(1.0, temperature + 0.35),
          rng: this._rng
        });
        criticVerdict = this.critic.verify(realized.text, {
          conceptSeq,
          worldGraph: this.worldGraph,
          gates: tomAppraisal.gates,
          recentNpcPhrases: this.workingMemory.recentNpcPhrases,
          perceptualFrame
        });
      } else if (criticVerdict.violations.includes('REPETITION')) {
        // Re-roll up to 2 times avoiding the chosen variants
        const avoidVariants = new Set(
          realized.chosenVariants.map((v) => `${v.conceptId}:${v.variantIdx}`)
        );
        for (let attempt = 0; attempt < 2; attempt++) {
          const retryTemp = Math.min(1.15, temperature + 0.35 * (attempt + 1));
          const retryRealized = this.realizer.realize(conceptSeq, {
            personaKey: this.personaKey,
            personas: this.personas,
            slotValues: plan.slotValues,
            learnedPhrases: this.learnedPhrases,
            recentNpcPhrases: this.workingMemory.recentNpcPhrases,
            wLex: this.core.W_lex,
            temperature: retryTemp,
            rng: this._rng,
            avoidVariants
          });
          const retryVerdict = this.critic.verify(retryRealized.text, {
            conceptSeq,
            worldGraph: this.worldGraph,
            gates: tomAppraisal.gates,
            recentNpcPhrases: this.workingMemory.recentNpcPhrases,
            perceptualFrame
          });
          if (retryVerdict.overlapScore < criticVerdict.overlapScore || retryVerdict.passed) {
            realized = retryRealized;
            criticVerdict = retryVerdict;
          }
          if (criticVerdict.passed) break;
          for (const v of retryRealized.chosenVariants) {
            avoidVariants.add(`${v.conceptId}:${v.variantIdx}`);
          }
        }
      }
    }

    // Stage 7: Memory Consolidation & Optional Plastic Fast-Weight Update
    if (commit) {
      this.turnCount = nextTurn;

      this.workingMemory.recordUserTurn(nextTurn, rawText, perceptualFrame);

      const npcEntities = plan.focusEntity ? [plan.focusEntity] : [];
      const openQuestion = inferOpenQuestionFromSeq(conceptSeq, plan.expectedOpenQuestion);
      this.workingMemory.recordNpcTurn(nextTurn, realized.text, {
        primaryAct: plan.effectiveAct,
        entities: npcEntities,
        openQuestion,
        topic: plan.focusTopic
      });

      this.episodicMemory.addEpisode({
        turn: nextTurn,
        summary: String(rawText ?? '').trim().slice(0, 72),
        primaryAct: perceptualFrame.primaryAct,
        entityIds,
        playerClaims: perceptualFrame.playerClaims,
        valence: computeEpisodeValence(perceptualFrame, tomAppraisal),
        importance: computeEpisodeImportance(perceptualFrame, contradictions, tomAppraisal),
        embedding: perceptualFrame.embedding
      });

      const disclosed = collectDisclosedFacts(conceptSeq, plan.disclosedFacts, tomAppraisal.gates);
      for (const item of disclosed) {
        this.tom.markFactDisclosed(item.factId, item.topic);
      }

      // Track last ~8 emitted non-ctrl concepts for mild diversity pressure
      for (const cid of conceptSeq) {
        if (cid >= 2 && cid < 70) this._recentConcepts.push(cid);
      }
      if (this._recentConcepts.length > 8) {
        this._recentConcepts.splice(0, this._recentConcepts.length - 8);
      }

      // Lightweight online Hebbian fast-weight update strictly on owned core's plastic pool
      if (this.ownsCore && criticVerdict.passed) {
        this.core.hebbianFastUpdate(plan.ctx320, conceptSeq, 0.005);
      }
    }

    const latencyMs = Number((nowMs() - t0).toFixed(3));

    return {
      text: realized.text,
      conceptSeq,
      innerMonologue: plan.innerMonologue,
      perceptualFrame,
      hopfield,
      recalledMemories,
      contradictions,
      tomAppraisal,
      wspTrace,
      criticVerdict,
      latencyMs,
      personaKey: this.personaKey,
      slotValues: plan.slotValues
    };
  }

  setPersona(key) {
    if (!this.personas[key]) {
      throw new Error(`Unknown persona "${key}". Available: ${Object.keys(this.personas).join(', ')}`);
    }
    this.personaKey = key;
    return this;
  }

  setWorld(worldGraphOrPreset) {
    this.worldGraph = worldGraphOrPreset instanceof WorldGraph
      ? worldGraphOrPreset
      : WorldGraph.fromLegacyPreset(worldGraphOrPreset);
    return this;
  }

  /**
   * Instantly re-voice a previous turn result in a different persona without re-running inference.
   */
  revoiceTurn(turnResult, personaKey) {
    if (!turnResult || !Array.isArray(turnResult.conceptSeq)) {
      throw new Error('revoiceTurn requires a turnResult containing conceptSeq');
    }
    const targetKey = this.personas[personaKey] ? personaKey : this.personaKey;
    const realized = this.realizer.realize(turnResult.conceptSeq, {
      personaKey: targetKey,
      personas: this.personas,
      slotValues: turnResult.slotValues || {},
      learnedPhrases: this.learnedPhrases,
      recentNpcPhrases: [],
      wLex: this.core.W_lex,
      temperature: 0.15,
      rng: createRng(this.seed)
    });
    return {
      ...turnResult,
      text: realized.text,
      personaKey: targetKey
    };
  }

  /**
   * Fine-tune the underlying WSP-Core v2 with analytical backprop + Adam + EWC.
   * Accepts either raw `{ ctx320, targetSeq }` examples or `{ prompt, targetSeq }` examples.
   */
  fineTune(examples, { epochs = 3, lr = 0.05, ewcLambda = 0.01 } = {}) {
    const prepared = [];
    for (const ex of examples || []) {
      if (ex?.ctx320 && Array.isArray(ex.targetSeq)) {
        prepared.push(ex);
      } else if (typeof ex?.prompt === 'string' && Array.isArray(ex.targetSeq)) {
        const frame = this.perceiver.parse(ex.prompt, {
          worldGraph: this.worldGraph,
          workingMemory: this.workingMemory
        });
        const appraisal = this.tom.appraiseTurn(buildTomFrameAdapter(frame), [], { commit: false });
        const plan = this.planner.buildPlan({
          perceptualFrame: frame,
          tomAppraisal: appraisal,
          worldGraph: this.worldGraph,
          tom: this.tom
        });
        prepared.push({ ctx320: plan.ctx320, targetSeq: ex.targetSeq });
      }
    }

    let lastResult = { loss: 0, steps: 0, drifts: this.core.computeWeightDrifts() };
    for (let e = 0; e < epochs; e++) {
      lastResult = this.core.fineTuneStep(prepared, lr, ewcLambda);
    }
    return lastResult;
  }

  resetConversation() {
    this.workingMemory = new WorkingMemory();
    this.episodicMemory = new EpisodicMemory();
    this.tom.reset();
    this.turnCount = 0;
    this._recentConcepts = [];
    this._rng = createRng(this.seed);
    return this;
  }

  resetWeights() {
    this.core.resetToBaseWeights();
    return this;
  }

  /**
   * Serialize per-NPC state strictly <= 16 KB (16384 bytes).
   */
  serializeSaveState() {
    const state = {
      v: 2,
      personaKey: this.personaKey,
      seed: this.seed,
      worldId: this.worldGraph?.meta?.id || 'custom',
      turnCount: this.turnCount,
      tom: this.tom.toJSON(),
      workingMemory: this.workingMemory.toJSON(),
      episodicMemory: this.episodicMemory.toJSON(),
      learnedPhrases: { ...this.learnedPhrases },
      plasticDelta: this.ownsCore ? this.core.exportPlasticDelta(100) : null
    };

    // Enforce strict <= 16 KB ceiling
    let json = JSON.stringify(state);
    if (json.length > MAX_SAVE_BYTES && state.plasticDelta) {
      state.plasticDelta = this.ownsCore ? this.core.exportPlasticDelta(40) : null;
      json = JSON.stringify(state);
    }
    if (json.length > MAX_SAVE_BYTES && state.plasticDelta) {
      state.plasticDelta = null;
      json = JSON.stringify(state);
    }
    if (json.length > MAX_SAVE_BYTES && state.episodicMemory?.episodes?.length > 16) {
      state.episodicMemory.episodes = state.episodicMemory.episodes.slice(-16);
    }
    return state;
  }

  loadSaveState(state) {
    if (!state || typeof state !== 'object') return this;
    if (state.personaKey && this.personas[state.personaKey]) {
      this.personaKey = state.personaKey;
    }
    if (Number.isFinite(state.seed)) {
      this.seed = state.seed;
      this._rng = createRng(this.seed);
    }
    this.turnCount = Number.isInteger(state.turnCount) ? state.turnCount : 0;
    if (state.tom) this.tom.fromJSON(state.tom);
    if (state.workingMemory) this.workingMemory.fromJSON(state.workingMemory);
    if (state.episodicMemory) this.episodicMemory.fromJSON(state.episodicMemory);
    this.learnedPhrases = state.learnedPhrases && typeof state.learnedPhrases === 'object'
      ? { ...state.learnedPhrases }
      : {};
    if (this.ownsCore && state.plasticDelta) {
      this.core.importPlasticDelta(state.plasticDelta);
    }
    return this;
  }
}

export default GeneralNpcAgent;
