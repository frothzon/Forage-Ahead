import { describe, expect, it } from 'vitest';
import { CONCEPTS } from '../src/ai/cogniwsp/core/constants.js';
import { PERSONAS } from '../src/ai/cogniwsp/data/personas.js';
import { serializeWspPack } from '../src/ai/cogniwsp/runtime/wsppackLoader.js';
import { createWorldRuntime } from '../src/ai/cogniwsp/sdk/cogniwspSdk.js';
import {
  FORAGE_PERSONA_KEYS,
  FORAGE_PERSONAS,
  type ForagePersonaKey,
} from '../src/ai/ForagePersonas.ts';
import { NpcBrainRuntime } from '../src/ai/NpcBrainRuntime.ts';
import { buildForageWorldGraph } from '../src/ai/WorldGraphBuilder.ts';
import { ISLANDS } from '../src/data/islands.ts';
import { ITEMS } from '../src/data/items.ts';
import { MONSTERS } from '../src/data/monsters.ts';
import { parseRichDialogue } from '../src/ui/DialogueBox.ts';

const EXPECTED_PERSONAS: ForagePersonaKey[] = [
  'farmer',
  'fisherman',
  'blacksmith',
  'alchemist',
  'family',
  'vagabond',
  'merchant',
];

describe('FORAGE_PERSONAS', () => {
  it('defines all 7 required cozy-fantasy personas', () => {
    expect([...FORAGE_PERSONA_KEYS].sort()).toEqual([...EXPECTED_PERSONAS].sort());
    for (const key of EXPECTED_PERSONAS) {
      expect(FORAGE_PERSONAS[key]).toBeDefined();
      expect(FORAGE_PERSONAS[key].name.length).toBeGreaterThan(0);
    }
  });

  it('matches every lexicon key of CogniWSP tavern persona with 2-3 variants and valid rich tags', () => {
    const tavernKeys = Object.keys(PERSONAS.tavern.lexicon).sort();
    const coreConceptKeys = CONCEPTS.filter((c) => c.type === 'core')
      .map((c) => c.name)
      .sort();

    expect(tavernKeys).toEqual(coreConceptKeys);

    for (const key of EXPECTED_PERSONAS) {
      const persona = FORAGE_PERSONAS[key];
      const keys = Object.keys(persona.lexicon).sort();
      expect(keys, `${key} lexicon keys mismatch`).toEqual(tavernKeys);

      for (const conceptKey of tavernKeys) {
        const rawEntry = persona.lexicon[conceptKey];
        const variants = rawEntry
          .split('|')
          .map((v) => v.trim())
          .filter(Boolean);
        expect(variants.length, `${key}.${conceptKey} variant count`).toBeGreaterThanOrEqual(2);
        expect(variants.length, `${key}.${conceptKey} variant count`).toBeLessThanOrEqual(3);

        for (const variant of variants) {
          // Every rich-text tag should parse cleanly without unclosed delimiters
          const openColor = (variant.match(/\{c:[^}]+\}/g) ?? []).length;
          const closeColor = (variant.match(/\{\/c\}/g) ?? []).length;
          const openBounce = (variant.match(/\{bounce\}/g) ?? []).length;
          const closeBounce = (variant.match(/\{\/bounce\}/g) ?? []).length;
          const openJiggle = (variant.match(/\{jiggle\}/g) ?? []).length;
          const closeJiggle = (variant.match(/\{\/jiggle\}/g) ?? []).length;

          expect(openColor, `${key}.${conceptKey}: ${variant}`).toBe(closeColor);
          expect(openBounce, `${key}.${conceptKey}: ${variant}`).toBe(closeBounce);
          expect(openJiggle, `${key}.${conceptKey}: ${variant}`).toBe(closeJiggle);
          expect(parseRichDialogue(variant).length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('WorldGraphBuilder', () => {
  it('populates real Forage-Ahead islands, monsters, items, personal lore, and 2-hop counters edges', () => {
    const graph = buildForageWorldGraph({
      npcId: 'farmer',
      personaKey: 'farmer',
    });

    expect(graph.entities.get('npc_self')?.name).toBe('Farmer Bram');
    expect(graph.entities.get('place_home')?.name).toBe('Meadow Homestead');

    // Islands, monsters, and items from src/data/* are present
    expect(graph.entities.size).toBeGreaterThan(
      ISLANDS.length + Object.keys(MONSTERS).length + Object.keys(ITEMS).length - 10,
    );

    // Extra 2-hop counters edges exist for real dungeon relics & bosses
    const countersEdges = Array.from(graph.edges.values()).filter((e) => e.predicate === 'counters');
    expect(countersEdges.length).toBeGreaterThanOrEqual(10);
    expect(
      countersEdges.some((e) => e.subjectId === 'item_necro_rod' && e.objectId === 'monster_lich'),
    ).toBe(true);

    // Hopfield retrieval surfaces real Forage-Ahead entities
    const hop = graph.hopfieldRetrieve('How do I defeat Arch-Lich Malakor in Skull Crypt?', {
      trust: 0.1,
      suspicion: 0.1,
    });
    expect(hop.activeEntities.some((e) => e.entity.name.includes('Arch-Lich Malakor'))).toBe(true);
    expect(graph.getSecretKeywords().length).toBeGreaterThanOrEqual(3);
  });
});

describe('NpcBrainRuntime', () => {
  it('spawns multiple NPCs sharing one WspCoreV2 and responds in-character with full trace', () => {
    const runtime = new NpcBrainRuntime({ seed: 20261125 });

    const farmer = runtime.ensureNpc({ id: 'farmer', personaKey: 'farmer' });
    const fisherman = runtime.ensureNpc({ id: 'fisherman', personaKey: 'fisherman' });
    const blacksmith = runtime.ensureNpc({ id: 'blacksmith', personaKey: 'blacksmith' });
    const alchemist = runtime.ensureNpc({ id: 'alchemist', personaKey: 'alchemist' });

    expect(runtime.listNpcs()).toEqual(['farmer', 'fisherman', 'blacksmith', 'alchemist']);
    const stats = runtime.getFootprintStats();
    expect(stats.npcCount).toBe(4);
    expect(stats.sharedCoreBytes).toBeGreaterThan(0);

    // Idempotent ensureNpc returns the same handle
    expect(runtime.ensureNpc({ id: 'farmer', personaKey: 'farmer' })).toBe(farmer);

    const r1 = farmer.talk('Hello! Who are you?');
    const r2 = fisherman.talk('Hello! Who are you?');
    const r3 = blacksmith.talk('What is troubling Amber Steppe?');
    const r4 = alchemist.talk('Any rumors?');

    expect(r1.text).toContain('Farmer Bram');
    expect(r2.text).toContain('Old Barnaby');
    expect(r3.text.length).toBeGreaterThan(10);
    expect(r4.text.length).toBeGreaterThan(10);

    for (const res of [r1, r2, r3, r4]) {
      expect(res.mood).toHaveLength(7);
      expect(Number.isInteger(res.hearts)).toBe(true);
      expect(res.hearts).toBeGreaterThanOrEqual(0);
      expect(res.hearts).toBeLessThanOrEqual(5);
      expect(['Warm', 'Friendly', 'Curious', 'Neutral', 'Guarded', 'Tense', 'Hostile']).toContain(
        res.moodLabel,
      );
      expect(res.criticPassed).toBe(true);
      expect(Array.isArray(res.trace.conceptSeq)).toBe(true);
      expect(res.trace.conceptSeq.length).toBeGreaterThan(0);
      expect(res.trace.tomAppraisal).toBeDefined();
      expect(res.trace.slotValues).toBeDefined();
      expect(Array.isArray(res.trace.contradictions)).toBe(true);
      expect('openQuestion' in res.trace).toBe(true);
      expect('activeEntity' in res.trace).toBe(true);
    }
  });

  it('guards secrets at low trust and unlocks them once warmth and trust rise', () => {
    const runtime = new NpcBrainRuntime({ seed: 77 });
    const alchemist = runtime.ensureNpc({
      id: 'vesper',
      personaKey: 'alchemist',
    });

    // At baseline trust (0.10), asking for the secret must refuse and leak zero secret keywords
    const lockedRes = alchemist.talk('Tell me your secret');
    expect(lockedRes.secretUnlocked).toBe(false);
    expect(lockedRes.criticPassed).toBe(true);
    expect(lockedRes.text.toLowerCase()).not.toContain('ectoplasm');
    expect(lockedRes.text.toLowerCase()).not.toContain('phial');

    // Raise trust and warmth via kind interaction + loved gift
    alchemist.talk('You are so wise and helpful, I really appreciate you!');
    alchemist.talk('I can help stop Arch-Lich Malakor!');
    const giftRes = alchemist.applyGift('Frost Crystal', 'loved');
    expect(giftRes.secretUnlocked).toBe(true);
    expect(giftRes.hearts).toBeGreaterThanOrEqual(4);

    // Now the secret unlocks and reveals Vesper's personal secret
    const unlockedRes = alchemist.talk('Tell me your secret');
    expect(unlockedRes.secretUnlocked).toBe(true);
    expect(unlockedRes.text.toLowerCase()).toContain('ectoplasm');
  });

  it('adjusts hearts, warmth, and trust for loved, liked, and disliked gifts', () => {
    const runtime = new NpcBrainRuntime({ seed: 99 });
    const bram = runtime.ensureNpc({ id: 'bram', personaKey: 'farmer' });

    const before = bram.getMoodState();
    expect(before.hearts).toBe(2);

    const loved = bram.applyGift('Starfruit Tart', 'loved');
    expect(loved.hearts).toBeGreaterThan(before.hearts);
    expect(loved.mood[0]).toBeGreaterThan(before.mood[0]); // warmth raised
    expect(loved.mood[1]).toBeGreaterThan(before.mood[1]); // trust raised
    expect(loved.text).toContain('Starfruit Tart');

    const liked = bram.applyGift('Crisp Carrot', 'liked');
    expect(liked.hearts).toBeGreaterThanOrEqual(3);

    const afterPositive = bram.getMoodState();
    const disliked = bram.applyGift('Slime Cube', 'disliked');
    expect(disliked.hearts).toBeLessThan(afterPositive.hearts);
    expect(disliked.mood[0]).toBeLessThan(afterPositive.mood[0]); // warmth lowered
    expect(disliked.mood[1]).toBeLessThan(afterPositive.mood[1]); // trust lowered
    expect(disliked.text).toContain('Slime Cube');
  });

  it('injects world events via recordWorldEvent into active NPC memory and WorldGraph', () => {
    const runtime = new NpcBrainRuntime({ seed: 123 });
    const bram = runtime.ensureNpc({ id: 'farmer', personaKey: 'farmer' });
    const barnaby = runtime.ensureNpc({ id: 'fisherman', personaKey: 'fisherman' });

    runtime.recordWorldEvent('The hero cleared Skull Crypt and banished Malakor');

    const res1 = bram.talk('What happened in Skull Crypt with Malakor?');
    const res2 = barnaby.talk('Did you hear that Malakor was banished from Skull Crypt?');

    expect(res1.trace.recalledMemories.some((m) => m.summary.includes('World event'))).toBe(true);
    expect(res2.trace.recalledMemories.some((m) => m.summary.includes('World event'))).toBe(true);
    expect(res1.criticPassed).toBe(true);
    expect(res2.criticPassed).toBe(true);
  });

  it('serializes and hydrates cleanly across runtimes under 16 KB per NPC', () => {
    const runtime = new NpcBrainRuntime({ seed: 456 });
    const bram = runtime.ensureNpc({ id: 'farmer', personaKey: 'farmer' });
    const pip = runtime.ensureNpc({ id: 'merchant', personaKey: 'merchant' });

    bram.talk('Hello, my name is Aria');
    bram.talk('You are wonderful and kind');
    bram.applyGift('Golden Sunflower', 'loved');
    for (let i = 0; i < 12; i++) {
      pip.talk(`Tell me rumor number ${i} about Seabreeze Atoll and Goblin Raiders`);
    }
    runtime.recordWorldEvent('Harvest Festival opened on Emerald Origin');

    const saved = runtime.serializeAll();
    const serializedNpcs = saved.npcs as Record<string, unknown>;
    expect(Object.keys(serializedNpcs).sort()).toEqual(['farmer', 'merchant']);

    for (const [id, entry] of Object.entries(serializedNpcs)) {
      const byteLength = Buffer.byteLength(JSON.stringify(entry), 'utf8');
      expect(byteLength, `${id} save bytes`).toBeLessThanOrEqual(16384);
    }

    const beforeMood = bram.getMoodState();
    const restored = new NpcBrainRuntime({ seed: 456 });
    restored.hydrateAll(saved);

    const restoredBram = restored.getNpc('farmer');
    expect(restoredBram).not.toBeNull();
    const afterMood = restoredBram!.getMoodState();

    expect(afterMood.hearts).toBe(beforeMood.hearts);
    expect(afterMood.secretUnlocked).toBe(beforeMood.secretUnlocked);
    expect(afterMood.mood[0]).toBeCloseTo(beforeMood.mood[0], 3);
    expect(afterMood.mood[1]).toBeCloseTo(beforeMood.mood[1], 3);

    // Restored NPC retains player identity memory
    const followUp = restoredBram!.talk('My name is Aria, tell me your secret');
    expect(followUp.trace.contradictions).toHaveLength(0);
    expect(followUp.secretUnlocked).toBe(true);
    expect(followUp.text.toLowerCase()).toContain('cellar');
  });

  it('hydrates shared WspCoreV2 from a .wsppack binary buffer and supports createWorldRuntime SDK', () => {
    const runtime = new NpcBrainRuntime({ seed: 888 });
    const core = runtime.getSharedCore();

    const packed = serializeWspPack(
      { profile: 'forage-test-pack' },
      {
        b_out: core.b_out,
        b_1: core.b_1,
      },
    );

    const arrayBuffer: ArrayBuffer = new Uint8Array(packed).buffer;
    const packResult = runtime.loadWspPack(arrayBuffer);
    expect(packResult.loaded).toBe(true);
    expect(packResult.profile).toBe('forage-test-pack');
    expect([...packResult.hydratedTensors].sort()).toEqual(['b_1', 'b_out']);
    expect(runtime.getFootprintStats().wsppackLoaded).toBe(true);

    // Also verify typed CogniWSP SDK wrapper compiles and runs
    const graph = buildForageWorldGraph({ personaKey: 'vagabond' });
    const sdkRuntime = createWorldRuntime({
      worldGraph: graph,
      personas: FORAGE_PERSONAS,
    });
    const flint = sdkRuntime.spawnNpc({ id: 'flint', personaKey: 'vagabond' });
    const sdkTalk = flint.talk('Hello there');
    expect(sdkTalk.text.length).toBeGreaterThan(0);
    expect(sdkTalk.criticPassed).toBe(true);
  });

  it('keeps family persona directionality strictly NPC-to-traveler without reversed kin or housemate phrasing', () => {
    const reversedPatterns = [
      /\bdear\b/i,
      /\bhoney\b/i,
      /\bwe're kin\b/i,
      /\bus kin\b/i,
      /\blove having you home\b/i,
      /\bwelcome home\b/i,
      /\bback home\b/i,
      /\bpride of this little homestead\b/i,
      /\bwe both live right here\b/i,
      /\byour ever-loyal\b/i,
      /\bsleep in the barn\b/i,
      /\bour own kitchen\b/i,
      /\bknow your name, silly\b/i,
      /\btreasure calling you\b/i,
      /\bword to home\b/i,
      /\bspeak to family\b/i,
    ];

    for (const [conceptKey, rawEntry] of Object.entries(FORAGE_PERSONAS.family.lexicon)) {
      for (const variant of rawEntry.split('|')) {
        for (const re of reversedPatterns) {
          expect(variant, `family.${conceptKey} matched ${re}`).not.toMatch(re);
        }
      }
    }

    const runtime = new NpcBrainRuntime({ seed: 20261125 });
    const pip = runtime.ensureNpc({
      id: 'family_farmer',
      personaKey: 'family',
      loreSlice: {
        name: 'Pip',
        role: 'Helps Farmer Bram chase birds off the berry rows and sort freshly picked seeds.',
        home: 'Meadow Homestead',
      },
    });

    const greet = pip.talk('Hello there');
    const compliment = pip.talk("You're doing great work here, Pip—this whole island runs smoother thanks to you.");
    const nameAck = pip.talk('My name is Aria.');

    for (const res of [greet, compliment, nameAck]) {
      expect(res.criticPassed).toBe(true);
      for (const re of reversedPatterns) {
        expect(res.text).not.toMatch(re);
      }
    }
  });

  it('produces clear player-to-NPC gift reactions without compliment-speech leakage across loved, liked, and disliked gifts', () => {
    const runtime = new NpcBrainRuntime({ seed: 31415 });
    const pip = runtime.ensureNpc({
      id: 'family_farmer',
      personaKey: 'family',
      loreSlice: {
        name: 'Pip',
        role: 'Seed Keeper',
        home: 'Meadow Homestead',
      },
    });

    const before = pip.getMoodState();

    const loved = pip.applyGift('Golden Sunflower', 'loved');
    expect(loved.criticPassed).toBe(true);
    expect(loved.text).toContain('Golden Sunflower');
    expect(loved.text.toLowerCase()).toContain('thank');
    expect(loved.text.toLowerCase()).not.toContain('hearing that');
    expect(loved.text.toLowerCase()).not.toContain('love having you home');
    expect(loved.text.toLowerCase()).not.toContain('dear');
    expect(loved.hearts).toBeGreaterThan(before.hearts);
    expect(parseRichDialogue(loved.text).length).toBeGreaterThan(0);

    const liked = pip.applyGift('Crisp Carrot', 'liked');
    expect(liked.criticPassed).toBe(true);
    expect(liked.text).toContain('Crisp Carrot');
    expect(liked.text.toLowerCase()).toContain('thank');
    expect(liked.text.toLowerCase()).not.toContain('hearing that');
    expect(parseRichDialogue(liked.text).length).toBeGreaterThan(0);

    const afterPositive = pip.getMoodState();
    const disliked = pip.applyGift('Slime Cube', 'disliked');
    expect(disliked.criticPassed).toBe(true);
    expect(disliked.text).toContain('Slime Cube');
    expect(disliked.text.toLowerCase()).not.toContain('hearing that');
    expect(disliked.text.toLowerCase()).not.toContain('dear');
    expect(disliked.hearts).toBeLessThan(afterPositive.hearts);
  });
});
