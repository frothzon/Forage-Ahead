import { EPISTEMIC_LEVELS } from './cogniwsp/core/constants.js';
import { WorldGraph } from './cogniwsp/core/worldGraph.js';
import type { ForagePersonaKey } from './ForagePersonas.js';
import { ISLANDS, type IslandSpec } from '../data/islands.ts';
import { ITEMS, type ItemDef } from '../data/items.ts';
import { MONSTERS, type MonsterDef } from '../data/monsters.ts';

export interface NpcLoreSlice {
  id?: string;
  label?: string;
  avatar?: string;
  name: string;
  role: string;
  home: string;
  ruler: string;
  crisis: string;
  item: string;
  rival: string;
  secret: string;
  rumor: string;
  customFact: string;
}

export interface BuildForageWorldGraphOptions {
  npcId?: string;
  personaKey?: ForagePersonaKey | string;
  loreSlice?: Partial<NpcLoreSlice>;
  includeAllIslands?: boolean;
  includeMonsters?: boolean;
  includeItems?: boolean;
  worldEvents?: string[];
}

export const DEFAULT_NPC_LORE_SLICES: Readonly<Record<ForagePersonaKey, NpcLoreSlice>> = Object.freeze({
  farmer: {
    id: 'farmer',
    label: 'Meadow Homestead (Farmer Bram)',
    avatar: '🌾',
    name: 'Farmer Bram',
    role: 'homesteader and crop-tender',
    home: 'Meadow Homestead',
    ruler: 'the Emerald Origin Charter',
    crisis: 'Goblin Raiders trampling the wildflower groves',
    item: 'Farmer Hoe',
    rival: 'the Whispering Woods Goblins',
    secret: 'Farmer Bram keeps a hidden cellar latch beneath the cider barrel storing heirloom seeds',
    rumor: 'Emerald Slimes bounce twice as high whenever a harvest moon shines over the berry bushes',
    customFact: 'tilled dirt lets Crisp Carrots and Golden Sunflowers grow half again as fast',
  },
  fisherman: {
    id: 'fisherman',
    label: "Angler's Pier (Old Barnaby)",
    avatar: '🎣',
    name: 'Old Barnaby',
    role: 'master angler and pier-watcher',
    home: "Angler's Pier",
    ruler: 'the Emerald Origin Charter',
    crisis: 'Bog Lizardfolk fouling the southern fishing grounds',
    item: 'Fishing Rod',
    rival: 'the Hollow Fen Lizardfolk',
    secret: 'Old Barnaby sank a brass sea-lockbox under the third south pier piling years ago',
    rumor: 'Ghost Eels near Misty Graveyard glow bright violet right before a midnight squall',
    customFact: 'placing a Fish Trap in shallow shoreline waves reels in Fresh Fish while you explore',
  },
  blacksmith: {
    id: 'blacksmith',
    label: 'Amber Steppe (Smith Garrick)',
    avatar: '⚒️',
    name: 'Smith Garrick',
    role: 'master blacksmith and armorer',
    home: 'Amber Steppe',
    ruler: 'the Steppe Guild',
    crisis: 'Sandspire Leviathan stirring beneath Sunken Tomb Isle',
    item: 'Iron Broadsword',
    rival: 'the Sandspire Leviathan',
    secret: 'Smith Garrick cracked his grandfather anvil forging contraband obsidian wedges in secret',
    rumor: 'Sunforged Blades hum softly whenever Desert Scale is carried close to the hilt',
    customFact: 'feeding Coal and Iron Ore into a roaring Furnace turns out sturdy Iron Ingots cleanly',
  },
  alchemist: {
    id: 'alchemist',
    label: 'Misty Graveyard (Alchemist Vesper)',
    avatar: '🧪',
    name: 'Alchemist Vesper',
    role: 'mystic alchemist and reagent-brewer',
    home: 'Misty Graveyard',
    ruler: 'the Arcane Conclave',
    crisis: 'Arch-Lich Malakor commanding the undead inside Skull Crypt',
    item: 'Necro Rod',
    rival: 'Arch-Lich Malakor',
    secret: 'Alchemist Vesper sealed a whispering phial of moonlit ectoplasm behind the crypt altar',
    rumor: 'Dusk Bats carry rare eggs overhead whenever the graveyard mist turns lavender',
    customFact: 'grinding Ancient Bone with Frost Crystal stabilizes volatile healing draughts',
  },
  family: {
    id: 'family',
    label: 'Emerald Origin (Aunt Rowan)',
    avatar: '🏡',
    name: 'Aunt Rowan',
    role: 'hearth-keeper and homestead kin',
    home: 'Emerald Origin',
    ruler: 'the Emerald Origin Charter',
    crisis: 'the Misty Barrier keeping the outer islands apart',
    item: 'Pumpkin Soup',
    rival: 'Night Stalker',
    secret: 'Aunt Rowan hid an old castaway sea-compass wrapped in flannel inside the hearthstone niche',
    rumor: 'planting a Golden Sunflower beside your front door brings good fortune to returning sailors',
    customFact: 'a warm bowl of Pumpkin Soup mends battered stamina faster than a whole night indoors',
  },
  vagabond: {
    id: 'vagabond',
    label: 'Clover Cove (Drifter Flint)',
    avatar: '🧭',
    name: 'Drifter Flint',
    role: 'wandering pathfinder and reef-scout',
    home: 'Clover Cove',
    ruler: 'the Free Ferrymen',
    crisis: 'Orc Bruisers blocking the southern island crossings',
    item: 'Explorer Shovel',
    rival: 'the Clover Cove Orc Bruisers',
    secret: 'Drifter Flint mapped an unguarded smuggler cove tucked behind the northern cliff rocks',
    rumor: 'Blink Stones let nimble scouts skip straight past dungeon darts without taking a scratch',
    customFact: 'digging sparkling earth mounds with an Explorer Shovel turns up Ancient Bone, Coal, and coins',
  },
  merchant: {
    id: 'merchant',
    label: 'Seabreeze Atoll (Peddler Pip)',
    avatar: '🪙',
    name: 'Peddler Pip',
    role: 'traveling merchant and market appraiser',
    home: 'Seabreeze Atoll',
    ruler: 'the Archipelago Trade Ring',
    crisis: 'supply routes choked by Goblin Raiders and bog fog',
    item: 'Prospector Charm',
    rival: 'Goblin Raider',
    secret: 'Peddler Pip keeps a double-bottomed spice crate stuffed with uncut sapphire pebbles',
    rumor: 'Starfruit Tarts fetch surging gold coins whenever desert caravans reach the piers',
    customFact: 'selling too much of a single resource floods the stall, while varied goods hold high demand',
  },
});

const COUNTER_LINKS: ReadonlyArray<readonly [string, string, string]> = [
  ['necro_rod', 'Lich', 'counters Arch-Lich Malakor inside Skull Crypt'],
  ['thunder_rod', 'Purple Worm', 'counters Sandspire Leviathan inside Sunken Tomb'],
  ['ice_rod', 'Frost Giant', 'counters Jotun Frost King inside Frost Cavern'],
  ['fire_rod', 'Adult Red Dragon', 'counters Ignis, Crimson Wyrm inside Infernal Sanctum'],
  ['void_rod', 'Ancient Black Dragon', 'counters Obsidian Sovereign, Vaelkor in the Void Spire'],
  ['sword_wyrmheart', 'Ancient Black Dragon', 'counters Obsidian Sovereign, Vaelkor in the Void Spire'],
  ['sword_astral', 'Owlbear', 'counters Feral Owlbear in the Void Spire'],
  ['sword_iron', 'Mummy', 'counters Sand Mummy across the Autumn dunes'],
  ['sword_sun', 'Anubis Warrior', 'counters Anubis Guardian in the desert ruins'],
  ['sword_obsidian', 'Demon', 'counters Flame Demon on Infernal islands'],
  ['bomb_fire', 'Ice Golem', 'counters Ice Golem on Frost islands'],
  ['bomb_frost', 'Hellhound', 'counters Hellhound on Infernal islands'],
  ['potion_red', 'Skeleton', 'counters Crypt Skeleton attrition'],
  ['fishing_rod', 'Lizardfolk', 'counters Bog Lizardfolk along southern shores'],
  ['pickaxe_crystal', 'Gog', 'counters Infernal Gog armor and obsidian veins'],
];

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'custom';
}

export function resolveLoreSlice(
  personaKey?: ForagePersonaKey | string,
  partial?: Partial<NpcLoreSlice>,
): NpcLoreSlice {
  const fallbackKey: ForagePersonaKey =
    personaKey && personaKey in DEFAULT_NPC_LORE_SLICES
      ? (personaKey as ForagePersonaKey)
      : 'farmer';
  const base = DEFAULT_NPC_LORE_SLICES[fallbackKey];
  return {
    ...base,
    ...partial,
    name: partial?.name ?? base.name,
    role: partial?.role ?? base.role,
    home: partial?.home ?? base.home,
    ruler: partial?.ruler ?? base.ruler,
    crisis: partial?.crisis ?? base.crisis,
    item: partial?.item ?? base.item,
    rival: partial?.rival ?? base.rival,
    secret: partial?.secret ?? base.secret,
    rumor: partial?.rumor ?? base.rumor,
    customFact: partial?.customFact ?? base.customFact,
  };
}

function addIslandNodes(
  graph: WorldGraph,
  loreSlice: NpcLoreSlice,
): { islandIdByName: Map<string, string>; islandIdByCoord: Map<string, string> } {
  const islandIdByName = new Map<string, string>();
  const islandIdByCoord = new Map<string, string>();
  const homeNorm = normalizeKey(loreSlice.home);
  const selfNorm = normalizeKey(loreSlice.name);

  for (const isl of ISLANDS as readonly IslandSpec[]) {
    const islNorm = normalizeKey(isl.name);
    const id = islNorm === homeNorm ? 'place_home' : `island_${isl.gx}_${isl.gy}`;
    islandIdByName.set(islNorm, id);
    islandIdByCoord.set(`${isl.gx},${isl.gy}`, id);

    if (id !== 'place_home') {
      const aliases: string[] = [];
      if (isl.dungeonId) {
        aliases.push(isl.dungeonId.replace(/_/g, ' '));
      }
      graph.addEntity({
        id,
        name: isl.name,
        aliases,
        type: 'place',
        summary: `${isl.name} (${isl.biome} biome, grid ${isl.gx},${isl.gy}, cost ${isl.baseCost}g)`,
        attributes: {
          gx: isl.gx,
          gy: isl.gy,
          biome: isl.biome,
          baseCost: isl.baseCost,
          shape: isl.shape,
          dungeonId: isl.dungeonId ?? null,
        },
      });
    }

    if (isl.npc && normalizeKey(isl.npc.name) !== selfNorm) {
      const residentId = `resident_${slugId(isl.npc.id)}`;
      graph.addEntity({
        id: residentId,
        name: isl.npc.name,
        aliases: [isl.npc.id],
        type: 'ally',
        summary: `${isl.npc.name} of ${isl.name} (${isl.npc.questTitle})`,
        attributes: {
          npcId: isl.npc.id,
          questTitle: isl.npc.questTitle,
          requestItemId: isl.npc.requestItemId,
        },
      });
      graph.addEdge({
        id: `edge_resident_${isl.npc.id}_lives`,
        subjectId: residentId,
        predicate: 'lives_in',
        objectId: id,
        objectText: isl.name,
        epistemicLevel: EPISTEMIC_LEVELS.PUBLIC,
        emotionalWeight: 0.2,
      });
    }
  }

  return { islandIdByName, islandIdByCoord };
}

function addMonsterNodes(
  graph: WorldGraph,
  loreSlice: NpcLoreSlice,
  islandIdByCoord: Map<string, string>,
): Map<string, string> {
  const monsterIdByKey = new Map<string, string>();
  const crisisNorm = normalizeKey(loreSlice.crisis);
  const rivalNorm = normalizeKey(loreSlice.rival);

  for (const [key, def] of Object.entries(MONSTERS as Record<string, MonsterDef>)) {
    const keyNorm = normalizeKey(key);
    const nameNorm = normalizeKey(def.name);

    let nodeId = `monster_${slugId(key)}`;
    if (nameNorm === rivalNorm || keyNorm === rivalNorm) {
      nodeId = 'npc_rival';
    } else if (nameNorm === crisisNorm || keyNorm === crisisNorm) {
      nodeId = 'threat_crisis';
    } else {
      const aliases = keyNorm !== nameNorm ? [key] : [];
      graph.addEntity({
        id: nodeId,
        name: def.name,
        aliases,
        type: 'threat',
        summary: `${def.name} (Lv.${def.level}${def.isBoss ? ' Boss' : ''}, ${def.maxHp} HP)`,
        attributes: {
          monsterKey: key,
          level: def.level,
          isBoss: Boolean(def.isBoss),
          ai: def.ai,
        },
      });
    }

    monsterIdByKey.set(key, nodeId);
  }

  // Connect monsters to the islands they inhabit
  for (const isl of ISLANDS) {
    const islandId = islandIdByCoord.get(`${isl.gx},${isl.gy}`);
    if (!islandId) continue;
    for (const mKey of isl.monsterPool) {
      const mId = monsterIdByKey.get(mKey);
      if (!mId) continue;
      graph.addEdge({
        id: `edge_inhabits_${slugId(mKey)}_${isl.gx}_${isl.gy}`,
        subjectId: mId,
        predicate: 'inhabits',
        objectId: islandId,
        objectText: isl.name,
        epistemicLevel: EPISTEMIC_LEVELS.PUBLIC,
        emotionalWeight: -0.25,
      });
    }
  }

  return monsterIdByKey;
}

function addItemNodesAndEdges(
  graph: WorldGraph,
  loreSlice: NpcLoreSlice,
  monsterIdByKey: Map<string, string>,
): Map<string, string> {
  const itemIdByKey = new Map<string, string>();
  const loreItemNorm = normalizeKey(loreSlice.item);

  for (const [key, item] of Object.entries(ITEMS as Record<string, ItemDef>)) {
    const nameNorm = normalizeKey(item.name);
    let nodeId = `item_${slugId(key)}`;
    if (nameNorm === loreItemNorm) {
      nodeId = 'item_key';
    } else {
      const aliases = key.includes('_') ? [key.replace(/_/g, ' ')] : [];
      graph.addEntity({
        id: nodeId,
        name: item.name,
        aliases,
        type: 'item',
        summary: `${item.name} (${item.category}, ${item.rarity}): ${item.description}`,
        attributes: {
          itemId: key,
          category: item.category,
          rarity: item.rarity,
          sellValue: item.sellValue,
        },
      });
    }
    itemIdByKey.set(key, nodeId);
  }

  // Monster drop edges
  for (const [mKey, def] of Object.entries(MONSTERS)) {
    const mNodeId = monsterIdByKey.get(mKey);
    if (!mNodeId) continue;
    for (const drop of def.drops) {
      const iNodeId = itemIdByKey.get(drop.itemId);
      if (!iNodeId) continue;
      const itemDef = ITEMS[drop.itemId];
      graph.addEdge({
        id: `edge_drop_${slugId(mKey)}_${slugId(drop.itemId)}`,
        subjectId: mNodeId,
        predicate: 'drops',
        objectId: iNodeId,
        objectText: itemDef?.name ?? drop.itemId,
        epistemicLevel: EPISTEMIC_LEVELS.PUBLIC,
        emotionalWeight: 0.15,
      });
    }
  }

  // Extra 2-hop counters edges connecting Forage items to Forage monsters/bosses
  for (const [itemKey, monsterKey, note] of COUNTER_LINKS) {
    const iNodeId = itemIdByKey.get(itemKey);
    const mNodeId = monsterIdByKey.get(monsterKey);
    if (!iNodeId || !mNodeId) continue;
    const monsterName = MONSTERS[monsterKey]?.name ?? monsterKey;
    graph.addEdge({
      id: `edge_counter_${slugId(itemKey)}_${slugId(monsterKey)}`,
      subjectId: iNodeId,
      predicate: 'counters',
      objectId: mNodeId,
      objectText: `${monsterName} (${note})`,
      epistemicLevel: EPISTEMIC_LEVELS.PUBLIC,
      emotionalWeight: 0.45,
    });
  }

  return itemIdByKey;
}

/**
 * Build a CogniWSP WorldGraph populated with an NPC's personal lore slice
 * alongside Forage-Ahead's islands, monsters, items, and 2-hop counters edges.
 */
export function buildForageWorldGraph(options: BuildForageWorldGraphOptions = {}): WorldGraph {
  const loreSlice = resolveLoreSlice(options.personaKey, options.loreSlice);
  const presetId = options.npcId
    ? `forage_${slugId(options.npcId)}`
    : loreSlice.id ?? `forage_${slugId(loreSlice.name)}`;

  const graph = WorldGraph.fromLegacyPreset({
    id: presetId,
    label: loreSlice.label ?? `${loreSlice.name} — ${loreSlice.home}`,
    avatar: loreSlice.avatar ?? '🧭',
    name: loreSlice.name,
    role: loreSlice.role,
    home: loreSlice.home,
    ruler: loreSlice.ruler,
    crisis: loreSlice.crisis,
    item: loreSlice.item,
    rival: loreSlice.rival,
    secret: loreSlice.secret,
    rumor: loreSlice.rumor,
    customFact: loreSlice.customFact,
  });

  const includeAllIslands = options.includeAllIslands !== false;
  const includeMonsters = options.includeMonsters !== false;
  const includeItems = options.includeItems !== false;

  let islandIdByCoord = new Map<string, string>();
  if (includeAllIslands) {
    ({ islandIdByCoord } = addIslandNodes(graph, loreSlice));
  }

  let monsterIdByKey = new Map<string, string>();
  if (includeMonsters) {
    monsterIdByKey = addMonsterNodes(graph, loreSlice, islandIdByCoord);
  }

  if (includeItems) {
    addItemNodesAndEdges(graph, loreSlice, monsterIdByKey);
  }

  if (Array.isArray(options.worldEvents)) {
    options.worldEvents.forEach((rawEvent, idx) => {
      const clean = String(rawEvent ?? '').trim();
      if (!clean) return;
      const entId = `world_event_${idx}`;
      graph.addEntity({
        id: entId,
        name: clean,
        type: 'lore',
        summary: clean,
        attributes: { epistemicLevel: EPISTEMIC_LEVELS.PUBLIC, kind: 'world_event' },
      });
      graph.addEdge({
        id: `edge_world_event_${idx}`,
        subjectId: 'npc_self',
        predicate: 'knows_lore',
        objectId: entId,
        objectText: clean,
        epistemicLevel: EPISTEMIC_LEVELS.PUBLIC,
        emotionalWeight: 0.1,
      });
    });
  }

  return graph;
}

export default buildForageWorldGraph;
