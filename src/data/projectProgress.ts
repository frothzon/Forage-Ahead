export interface FeatureCatalogEntry {
  category: string;
  title: string;
  details: string;
  status: 'Complete' | 'Partial';
}

export interface OutstandingTaskEntry {
  priority: 'High' | 'Medium' | 'Low';
  title: string;
  details: string;
}

export const IMPLEMENTED_FEATURES: FeatureCatalogEntry[] = [
  {
    category: 'World & Auto-Tiling',
    title: '5×5 Multi-Biome Island Grid, Auto-Tiler & Tiled Importer',
    details:
      '25 purchasable islands across Grass, Autumn/Desert, Graveyard, Winter, and Infernal biomes with 8-neighbor coastline auto-tiling, stone roads, wooden bridges, and Tiled (.tmj) JSON parser.',
    status: 'Complete',
  },
  {
    category: 'Heroes & Combat',
    title: '4 Playable Classes, Companion & 4-Dir Animations',
    details:
      'Beastmaster, Gladiator, Sorcerer, and Swashbuckler (plus Fox companion) with directional idle, walk, dash, melee, mining, shovelling, fishing, hoeing, watering, ranged, and cast animations.',
    status: 'Complete',
  },
  {
    category: 'Monsters & Dungeons',
    title: '24 Monsters, 3-Room Dungeons, Breakables, Chests & Boss Phases',
    details:
      'Skull Crypt, Sunken Tomb, Frost Cavern, and Infernal Sanctum feature 3-chamber layouts with breakable boxes/pots, floor sigil puzzles, treasure chests, and <50% HP enraged Boss Phase 2.',
    status: 'Complete',
  },
  {
    category: 'Inventory & Gear',
    title: 'Diablo-Style 3-Pane Inventory, Equipment & Stat Diffs',
    details:
      '30-slot draggable bag grid, 4 paperdoll equipment slots (Main Hand, Tool, Armor, Accessory), color-coded gear stat comparison, and 1–9 hotbar assignment.',
    status: 'Complete',
  },
  {
    category: 'Crafting & Farming',
    title: '12 Structures, 5-Slot Crafting Queues & Hoe/Watering Loop',
    details:
      'Furnace, Anvil, and Bonfire feature 5-slot timed crafting queues with cancel/refund, bobbing glowing previews, and ground drops; plus Mining Rods, Fish Traps, Lighthouses, Tilled Dirt, Watering Can, and Berry/Carrot/Sunflower crops.',
    status: 'Complete',
  },
  {
    category: 'Progression & Audio',
    title: '20-Skill Tree, 4 NPC Quests, Ambient Music & Grand Victory',
    details:
      '4-pillar Skill Tree, Townsfolk fetch quests, WebAudio SFX + procedural ambient music with volume slider, and Grand Victory completion banner.',
    status: 'Complete',
  },
  {
    category: 'UI & Persistence',
    title: 'Unified Ledger, Item Feed Stack & Full World Save/Load',
    details:
      'Non-blinking in-place HUD updates, isolated UI/canvas click handling, right-side ascending stacking item delta feed, and persistent saving for islands, buildings, queues, nodes, crops, and drops.',
    status: 'Complete',
  },
  {
    category: 'Atmosphere & World VFX',
    title: 'Dynamic Weather, Daily Wind Shader, Ocean Waves & Lighting',
    details:
      'Biome-specific weather (sunny, rain, snow, Perlin-noise cloud ground shadows, desert haze & sandstorms), daily changing wind driving foliage/trees and wind-aligned ocean waves/caustics/reflections, fishing splash particles, smooth circular player glow, and tower-anchored soft-falloff spotlights.',
    status: 'Complete',
  },
  {
    category: 'Testing & Debug',
    title: 'Debug Command Center, Reset/Erase & Unit Tests',
    details:
      'LocalStorage persistence, Debug Mode cheats (resources, levels, skills, island unlocks, biome teleports, weather/time/wind controls, reset/erase), plus Vitest tests for AutoTiler, IslandGenerator, TiledImporter, Progression, Weather, and Knockback safety.',
    status: 'Complete',
  },
];

export const OUTSTANDING_ITEMS: OutstandingTaskEntry[] = [];
