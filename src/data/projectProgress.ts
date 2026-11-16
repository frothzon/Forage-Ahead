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
    title: '5×5 Multi-Biome Island Grid & Auto-Tiler',
    details:
      '25 purchasable islands across Grass, Autumn/Desert, Graveyard, Winter, and Infernal biomes with 8-neighbor coastline auto-tiling, stone roads, and wooden bridges.',
    status: 'Complete',
  },
  {
    category: 'Heroes & Combat',
    title: '4 Playable Classes, Companion & 4-Dir Animations',
    details:
      'Beastmaster, Gladiator, Sorcerer, and Swashbuckler (plus Fox companion) with directional idle, walk, dash, melee, mining, shovelling, fishing, ranged, and cast animations.',
    status: 'Complete',
  },
  {
    category: 'Monsters & Bosses',
    title: '24 Biome Monsters & 4 Instanced Boss Dungeons',
    details:
      'Skull Crypt (Lich → Necro Rod), Sunken Tomb (Purple Worm → Thunder Rod), Frost Cavern (Frost Giant → Ice Rod), and Infernal Sanctum (Adult Red Dragon → Fire Rod) with floor sigil puzzles.',
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
    category: 'Crafting & Automation',
    title: '11 Buildable Structures & 5-Slot Crafting Queues',
    details:
      'Furnace, Anvil, and Bonfire feature 5-slot timed crafting queues with cancel/refund, bobbing glowing previews, and ground drops; plus Mining Rods, Fish Traps, Lighthouses (+50% stacking multiplier), and Crops.',
    status: 'Complete',
  },
  {
    category: 'Progression & Quests',
    title: '20-Skill 4-Pillar Tree & 4 Townsfolk NPC Quests',
    details:
      'Foraging, Industry, Economy, and Magic & Combat skill pillars, plus Farmer, Fisherman, Blacksmith, and Alchemist fetch quests.',
    status: 'Complete',
  },
  {
    category: 'UI & Feedback',
    title: 'Unified Ledger, Item Feed Stack & Pixel-Art Icons',
    details:
      'Non-blinking in-place HUD updates, isolated UI/canvas click handling, right-side ascending stacking item delta feed, and pixel-art icons across all items and structures.',
    status: 'Complete',
  },
  {
    category: 'Testing & Debug',
    title: 'Debug Command Center, Save/Load & Unit Tests',
    details:
      'LocalStorage persistence, Debug Mode cheats (resources, levels, skills, island unlocks, biome teleports, reset/erase), plus Vitest tests for AutoTiler and Progression.',
    status: 'Complete',
  },
];

export const OUTSTANDING_ITEMS: OutstandingTaskEntry[] = [
  {
    priority: 'High',
    title: 'Dungeon Treasure Chests, Multi-Room Layouts & Boss Phases',
    details:
      'Expand the 4 instanced dungeons from 2-chamber sigil arenas into multi-room layouts with breakable pots/boxes, locked doors, chest loot tables, and multi-phase boss patterns.',
  },
  {
    priority: 'High',
    title: 'Persistent World Nodes, Crops & Ground Drops Across Save/Load',
    details:
      'Currently buildings, overlays, bag, equipment, quests, and islands save to localStorage; resource nodes, crop growth stage, and uncollected ground drops regenerate on reload.',
  },
  {
    priority: 'Medium',
    title: 'Hoe & Watering Can Farming Loop + Sunflower/Pumpkin Crops',
    details:
      'Activate the unused hero hoeing/watering animations and Crops (sunflower) spritesheet for tilled soil hydration and faster crop cycles.',
  },
  {
    priority: 'Medium',
    title: 'Audio Settings, Ambient Music & Biome SFX Variety',
    details:
      'Add volume sliders and optional background chiptune/ambient loops per biome and dungeon alongside the WebAudio SFX synthesizer.',
  },
  {
    priority: 'Low',
    title: 'Dedicated Game Over / Victory Summary & Tiled (.tmj) Map Loader',
    details:
      'Add a celebratory completion banner when all 4 dungeons & 25 islands are conquered, plus optional Tiled JSON map import for custom landmark islands.',
  },
];
