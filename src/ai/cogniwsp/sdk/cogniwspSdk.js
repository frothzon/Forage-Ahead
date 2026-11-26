// ============================================================================
// CogniWSP Embeddable Game SDK
// Game-engine-ready runtime holding ONE shared read-only WspCoreV2 across
// any number of isolated NPCs, with optional .wsppack binary weight loading.
// Zero-dependency ES Module (Node v22 + Browser compatible).
// ============================================================================

import { WspCoreV2 } from '../core/wspCoreV2.js';
import { WorldGraph } from '../core/worldGraph.js';
import { GeneralNpcAgent } from '../core/gniAgent.js';
import { PERSONAS } from '../data/personas.js';
import { parseWspPack } from '../runtime/wsppackLoader.js';

const MAX_SAVE_BYTES = 16384;

const CORE_TENSOR_NAMES = [
  'W_rec_h',
  'E_concept',
  'W_1',
  'b_1',
  'W_2',
  'b_2',
  'W_out',
  'b_out',
  'W_lex'
];

function hydrateCoreFromWspPack(core, parsedPack) {
  const tensors = parsedPack?.tensors;
  if (!tensors || typeof tensors !== 'object') return;
  for (const name of CORE_TENSOR_NAMES) {
    const t = tensors[name];
    if (t instanceof Float32Array && core[name] instanceof Float32Array && t.length === core[name].length) {
      core[name].set(t);
    }
  }
}

function estimateCoreBytes(core) {
  let bytes = 0;
  for (const name of CORE_TENSOR_NAMES) {
    if (core[name] instanceof Float32Array) {
      bytes += core[name].byteLength;
    }
  }
  return bytes;
}

function countCoreParams(core) {
  let params = 0;
  for (const name of CORE_TENSOR_NAMES) {
    if (core[name] instanceof Float32Array) {
      params += core[name].length;
    }
  }
  return params;
}

function createNpcHandle(id, agent) {
  return {
    id,

    /**
     * Advance one conversational turn with this NPC.
     *
     * @param {string} playerText
     * @param {{ temperature?: number }} [opts]
     */
    talk(playerText, { temperature = 0.40 } = {}) {
      const res = agent.respond(playerText, { temperature, commit: true });
      return {
        text: res.text,
        mood: Array.from(agent.tom.mood),
        stance: res.tomAppraisal?.perceivedStance || 'neutral',
        innerMonologue: res.innerMonologue,
        criticPassed: Boolean(res.criticVerdict?.passed),
        latencyMs: res.latencyMs,
        trace: {
          conceptSeq: res.conceptSeq,
          perceptualFrame: res.perceptualFrame,
          hopfield: res.hopfield,
          recalledMemories: res.recalledMemories,
          contradictions: res.contradictions,
          tomAppraisal: res.tomAppraisal,
          wspTrace: res.wspTrace,
          criticVerdict: res.criticVerdict,
          slotValues: res.slotValues
        }
      };
    },

    setPersona(key) {
      agent.setPersona(key);
      return this;
    },

    /**
     * Export compact <= 16 KB JSON-serializable state for this NPC.
     */
    save() {
      const state = agent.serializeSaveState();
      state.npcId = id;
      if (JSON.stringify(state).length > MAX_SAVE_BYTES) {
        delete state.npcId;
      }
      return state;
    },

    load(state) {
      agent.loadSaveState(state);
      return this;
    },

    reset() {
      agent.resetConversation();
      return this;
    }
  };
}

/**
 * Create an embeddable CogniWSP world runtime sharing one read-only WspCoreV2
 * across any number of spawned NPCs.
 *
 * @param {object} [options]
 * @param {object|null} [options.worldPreset=null]
 * @param {WorldGraph|null} [options.worldGraph=null]
 * @param {ArrayBuffer|ArrayBufferView|object|null} [options.wsppack=null]
 * @param {number} [options.seed=20261125]
 * @param {object} [options.personas=PERSONAS]
 */
export function createWorldRuntime({
  worldPreset = null,
  worldGraph = null,
  wsppack = null,
  seed = 20261125,
  personas = PERSONAS
} = {}) {
  const graph = worldGraph instanceof WorldGraph
    ? worldGraph
    : worldPreset
      ? WorldGraph.fromLegacyPreset(worldPreset)
      : new WorldGraph();

  let parsedPack = null;
  if (wsppack) {
    if (wsppack instanceof ArrayBuffer || ArrayBuffer.isView(wsppack)) {
      parsedPack = parseWspPack(wsppack);
    } else if (typeof wsppack === 'object' && wsppack.manifest) {
      parsedPack = wsppack;
    } else {
      throw new TypeError('wsppack must be an ArrayBuffer, ArrayBufferView, or parsed wsppack object');
    }
  }

  const sharedCore = new WspCoreV2({ seed });
  if (parsedPack) {
    hydrateCoreFromWspPack(sharedCore, parsedPack);
  }

  const npcs = new Map();

  return {
    spawnNpc({
      id,
      personaKey = 'tavern',
      baselineMood = null,
      driveWeights = null,
      seed: npcSeed
    } = {}) {
      if (!id || typeof id !== 'string') {
        throw new Error('spawnNpc requires a non-empty string id');
      }
      if (npcs.has(id)) {
        throw new Error(`NPC "${id}" already exists in this runtime`);
      }

      const agent = new GeneralNpcAgent({
        worldGraph: graph,
        personaKey,
        sharedCore,
        seed: Number.isFinite(npcSeed) ? npcSeed : seed + npcs.size * 101,
        baselineMood,
        driveWeights,
        personas
      });

      const handle = createNpcHandle(id, agent);
      npcs.set(id, { agent, handle });
      return handle;
    },

    getNpc(id) {
      return npcs.get(id)?.handle || null;
    },

    listNpcs() {
      return Array.from(npcs.keys());
    },

    exportWorldGraph() {
      return graph.toJSON();
    },

    getFootprintStats() {
      const saveSizes = {};
      let maxSaveBytes = 0;
      let totalSaveBytes = 0;

      for (const [id, entry] of npcs.entries()) {
        const bytes = JSON.stringify(entry.handle.save()).length;
        saveSizes[id] = bytes;
        totalSaveBytes += bytes;
        if (bytes > maxSaveBytes) maxSaveBytes = bytes;
      }

      return {
        npcCount: npcs.size,
        sharedCoreBytes: estimateCoreBytes(sharedCore),
        totalWeightParams: countCoreParams(sharedCore),
        wsppackLoaded: Boolean(parsedPack),
        wsppackProfile: parsedPack?.manifest?.profile || null,
        wsppackBytes: parsedPack?.byteLength || 0,
        maxNpcSaveBytes: maxSaveBytes,
        totalNpcSaveBytes: totalSaveBytes,
        perNpcSaveBytes: saveSizes
      };
    }
  };
}

export default { createWorldRuntime };
