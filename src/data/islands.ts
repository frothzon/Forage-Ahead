import type { TerrainType } from '../world/AutoTiler';

export type BiomeKind = Exclude<TerrainType, 'water'>;

export type DungeonId = 'skull_crypt' | 'sunken_tomb' | 'frost_cavern' | 'infernal_sanctum' | 'void_spire';

export interface IslandNpcSpec {
  id: string;
  name: string;
  spriteKey: string;
  questTitle: string;
  requestItemId: string;
  requestCount: number;
  rewardCoins: number;
  rewardXp: number;
  rewardItemId?: string;
  rewardItemCount?: number;
}

export interface IslandSpec {
  gx: number; // 0..4
  gy: number; // 0..4
  name: string;
  biome: BiomeKind;
  baseCost: number;
  starterOwned?: boolean;
  shape: 'square' | 'cove' | 'cross' | 'twin';
  dungeonId?: DungeonId;
  npc?: IslandNpcSpec;
  monsterPool: string[];
  maxMonsters: number;
}

export const WORLD_GRID_SIZE = 5;
export const ISLAND_CELL_TILES = 28; // 24x24 inner + 2-tile water moat per side
export const WORLD_TILES = WORLD_GRID_SIZE * ISLAND_CELL_TILES; // 140x140 tiles
export const TILE_PX = 16;

export const ISLANDS: IslandSpec[] = [
  // Row 0 (North: Winter & Infernal Frontier)
  { gx: 0, gy: 0, name: 'Glacier Peak', biome: 'winter', baseCost: 260, shape: 'twin', monsterPool: ['Ice Golem', 'Redcap'], maxMonsters: 3 },
  { gx: 1, gy: 0, name: 'Frostwind Ridge', biome: 'winter', baseCost: 190, shape: 'square', monsterPool: ['Frost Salamander', 'Bheur Hag'], maxMonsters: 3 },
  {
    gx: 2,
    gy: 0,
    name: 'Frost Cavern Isle',
    biome: 'winter',
    baseCost: 220,
    shape: 'cove',
    dungeonId: 'frost_cavern',
    monsterPool: ['Ice Golem', 'Frost Salamander'],
    maxMonsters: 2,
  },
  { gx: 3, gy: 0, name: 'Cinder Crossing', biome: 'infernal', baseCost: 280, shape: 'cross', monsterPool: ['Imp', 'Hellhound'], maxMonsters: 3 },
  {
    gx: 4,
    gy: 0,
    name: 'Infernal Sanctum',
    biome: 'infernal',
    baseCost: 360,
    shape: 'square',
    dungeonId: 'infernal_sanctum',
    monsterPool: ['Demon', 'Gog'],
    maxMonsters: 3,
  },

  // Row 1
  { gx: 0, gy: 1, name: 'Frozen Fjord', biome: 'winter', baseCost: 140, shape: 'cove', monsterPool: ['Redcap', 'Frost Salamander'], maxMonsters: 2 },
  { gx: 1, gy: 1, name: 'Whispering Woods', biome: 'grass', baseCost: 65, shape: 'square', monsterPool: ['Slime', 'Goblin'], maxMonsters: 2 },
  {
    gx: 2,
    gy: 1,
    name: 'Meadow Homestead',
    biome: 'grass',
    baseCost: 45,
    shape: 'square',
    npc: {
      id: 'farmer',
      name: 'Farmer Bram',
      spriteKey: 'npcs/Medieval Townsfolk pack (bonus)/Farmer_idle',
      questTitle: 'Harvest Time',
      requestItemId: 'berries',
      requestCount: 10,
      rewardCoins: 65,
      rewardXp: 80,
      rewardItemId: 'carrot',
      rewardItemCount: 5,
    },
    monsterPool: ['Slime'],
    maxMonsters: 1,
  },
  { gx: 3, gy: 1, name: 'Ember Wastes', biome: 'infernal', baseCost: 195, shape: 'cove', monsterPool: ['Imp', 'Gog'], maxMonsters: 3 },
  { gx: 4, gy: 1, name: 'Sulfur Crag', biome: 'infernal', baseCost: 250, shape: 'twin', monsterPool: ['Hellhound', 'Demon'], maxMonsters: 3 },

  // Row 2 (Center Row)
  {
    gx: 0,
    gy: 2,
    name: 'Skull Crypt Isle',
    biome: 'graveyard',
    baseCost: 170,
    shape: 'cross',
    dungeonId: 'skull_crypt',
    monsterPool: ['Skeleton', 'Vampire'],
    maxMonsters: 3,
  },
  {
    gx: 1,
    gy: 2,
    name: 'Misty Graveyard',
    biome: 'graveyard',
    baseCost: 85,
    shape: 'cove',
    npc: {
      id: 'alchemist',
      name: 'Alchemist Vesper',
      spriteKey: 'npcs/Medieval Townsfolk pack (bonus)/Alchemist_idle',
      questTitle: 'Crypt Reagents',
      requestItemId: 'bone',
      requestCount: 6,
      rewardCoins: 95,
      rewardXp: 120,
      rewardItemId: 'potion_red',
      rewardItemCount: 3,
    },
    monsterPool: ['Skeleton', 'Bat'],
    maxMonsters: 3,
  },
  {
    gx: 2,
    gy: 2,
    name: 'Emerald Origin',
    biome: 'grass',
    baseCost: 0,
    starterOwned: true,
    shape: 'square',
    monsterPool: ['Slime'],
    maxMonsters: 1,
  },
  {
    gx: 3,
    gy: 2,
    name: 'Amber Steppe',
    biome: 'autumn',
    baseCost: 55,
    shape: 'square',
    npc: {
      id: 'blacksmith',
      name: 'Smith Garrick',
      spriteKey: 'npcs/Medieval Townsfolk pack (bonus)/Blacksmith_idle',
      questTitle: 'Forge Ignition',
      requestItemId: 'iron_ingot',
      requestCount: 4,
      rewardCoins: 85,
      rewardXp: 110,
      rewardItemId: 'gold_ore',
      rewardItemCount: 6,
    },
    monsterPool: ['Mummy', 'Goblin'],
    maxMonsters: 2,
  },
  {
    gx: 4,
    gy: 2,
    name: 'Sunken Tomb Isle',
    biome: 'autumn',
    baseCost: 185,
    shape: 'cove',
    dungeonId: 'sunken_tomb',
    monsterPool: ['Anubis Warrior', 'Djinn'],
    maxMonsters: 3,
  },

  // Row 3
  { gx: 0, gy: 3, name: 'Blighted Bog', biome: 'graveyard', baseCost: 145, shape: 'twin', monsterPool: ['Lizardfolk', 'Medusa'], maxMonsters: 3 },
  { gx: 1, gy: 3, name: 'Hollow Fen', biome: 'graveyard', baseCost: 105, shape: 'square', monsterPool: ['Slime', 'Lizardfolk'], maxMonsters: 2 },
  {
    gx: 2,
    gy: 3,
    name: 'Angler\'s Pier',
    biome: 'grass',
    baseCost: 40,
    shape: 'cove',
    npc: {
      id: 'fisherman',
      name: 'Old Barnaby',
      spriteKey: 'npcs/Medieval Townsfolk pack (bonus)/Fisherman_idle',
      questTitle: 'Catch of the Day',
      requestItemId: 'fish',
      requestCount: 5,
      rewardCoins: 70,
      rewardXp: 85,
      rewardItemId: 'cooked_fish',
      rewardItemCount: 3,
    },
    monsterPool: ['Slime'],
    maxMonsters: 1,
  },
  { gx: 3, gy: 3, name: 'Sunbleached Dunes', biome: 'autumn', baseCost: 95, shape: 'twin', monsterPool: ['Mummy', 'Anubis Warrior'], maxMonsters: 2 },
  { gx: 4, gy: 3, name: 'Dune Mirage', biome: 'autumn', baseCost: 155, shape: 'cross', monsterPool: ['Djinn', 'Orc'], maxMonsters: 3 },

  // Row 4 (South)
  { gx: 0, gy: 4, name: 'Dread Marsh', biome: 'graveyard', baseCost: 210, shape: 'square', monsterPool: ['Death Knight', 'Medusa'], maxMonsters: 3 },
  { gx: 1, gy: 4, name: 'Clover Cove', biome: 'grass', baseCost: 90, shape: 'cove', monsterPool: ['Goblin', 'Orc'], maxMonsters: 2 },
  { gx: 2, gy: 4, name: 'Seabreeze Atoll', biome: 'grass', baseCost: 75, shape: 'twin', monsterPool: ['Slime', 'Goblin'], maxMonsters: 2 },
  { gx: 3, gy: 4, name: 'Golden Canyon', biome: 'autumn', baseCost: 135, shape: 'square', monsterPool: ['Anubis Warrior', 'Mummy'], maxMonsters: 2 },
  { gx: 4, gy: 4, name: 'Scorched Oasis', biome: 'infernal', baseCost: 240, shape: 'cove', monsterPool: ['Demon', 'Hellhound'], maxMonsters: 3 },
];

export function getIslandAt(gx: number, gy: number): IslandSpec | undefined {
  return ISLANDS.find((i) => i.gx === gx && i.gy === gy);
}

export function getBiomeChapter(biome: BiomeKind): 1 | 2 | 3 | 4 {
  if (biome === 'grass') return 1;
  if (biome === 'autumn' || biome === 'graveyard') return 2;
  if (biome === 'winter') return 3;
  return 4;
}

export function getIslandRecommendedLevel(spec: IslandSpec): number {
  if (spec.biome === 'grass') return spec.starterOwned ? 1 : spec.baseCost >= 75 ? 3 : 2;
  if (spec.biome === 'autumn') return spec.dungeonId ? 10 : spec.baseCost >= 135 ? 8 : 5;
  if (spec.biome === 'graveyard') return spec.dungeonId ? 9 : spec.baseCost >= 145 ? 8 : 5;
  if (spec.biome === 'winter') return spec.dungeonId ? 15 : spec.baseCost >= 190 ? 13 : 11;
  return spec.dungeonId ? 20 : spec.baseCost >= 250 ? 18 : 15;
}

export interface StoryChapterMeta {
  chapter: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  title: string;
  subtitle: string;
  summary: string;
  unlockHint: string;
}

export const STORY_CHAPTERS: StoryChapterMeta[] = [
  {
    chapter: 1,
    title: 'Chapter 1: Castaway of Emerald Origin',
    subtitle: 'Grasslands • Recommended Power Lv. 1–4',
    summary: 'Shipwrecked with only a Rusty Shortsword, gather supplies, aid Farmer Bram & Old Barnaby, and reach Power Lv. 3.',
    unlockHint: 'Complete "Harvest Time" & "Catch of the Day" (or reach Power Lv. 3) to lift the Misty Barrier to Autumn & Graveyard.',
  },
  {
    chapter: 2,
    title: 'Chapter 2: Ashes & Tombs',
    subtitle: 'Autumn & Graveyard • Recommended Power Lv. 5–10',
    summary: 'Build the Alchemist Lab, aid Smith Garrick & Alchemist Vesper, and conquer Skull Crypt & Sunken Tomb.',
    unlockHint: 'Clear both Skull Crypt & Sunken Tomb to forge the Frostfire Compass and unlock Winter.',
  },
  {
    chapter: 3,
    title: 'Chapter 3: The Frozen Frontier',
    subtitle: 'Winter • Recommended Power Lv. 11–15',
    summary: 'Construct a Frostcrystal Kiln, forge glacial gear, and topple the Jotun Frost King in Frost Cavern.',
    unlockHint: 'Clear Frost Cavern to claim the Ember Seal and unlock Infernal islands.',
  },
  {
    chapter: 4,
    title: 'Chapter 4: Heart of the Inferno',
    subtitle: 'Infernal • Recommended Power Lv. 16–20',
    summary: 'Ignite the Infernal Forge, temper Obsidian Battlegear, and defeat Ignis, Crimson Wyrm in Infernal Sanctum.',
    unlockHint: 'Clear Infernal Sanctum to shatter the Void Seal and open the Endless Void Spire!',
  },
  {
    chapter: 5,
    title: 'Chapter 5: The Void Rift Opens',
    subtitle: 'Void Spire Floors 1–5 • Power Lv. 21–30',
    summary: 'Enter the Endless Void Spire on Emerald Origin. Battle Feywild & Yokai foes, gather Void Shards, and build a Void Altar.',
    unlockHint: 'Defeat Oni Shogun on Void Spire Floor 5 to unlock Floor 6+.',
  },
  {
    chapter: 6,
    title: 'Chapter 6: Wyrmling Awakening',
    subtitle: 'Void Spire Floors 6–10 • Power Lv. 31–40',
    summary: 'Hunt Astral Essences and hatch Owlbear & Wyrmling Eggs to forge Tier 5 Astral weapons.',
    unlockHint: 'Defeat the Emerald Wyrm on Void Spire Floor 10.',
  },
  {
    chapter: 7,
    title: 'Chapter 7: Fallen Celestials',
    subtitle: 'Void Spire Floors 11–15 • Power Lv. 41–50',
    summary: 'Face Oathbreaker Paladins, Beholders, and Storm Griffins to claim Abyssal Cores.',
    unlockHint: 'Defeat Arch-Seraph Solarius on Void Spire Floor 15.',
  },
  {
    chapter: 8,
    title: 'Chapter 8: The Ancient Black Dragon',
    subtitle: 'Void Spire Floors 16–20 • Power Lv. 51–60',
    summary: 'Fuse Celestial Scales & Monster Eggs into Lv.60 Mythic Gear, then slay Obsidian Sovereign Vaelkor on Floor 20!',
    unlockHint: 'Defeat the Ancient Black Dragon on Floor 20 and own all 25 islands for GRAND VICTORY!',
  },
];

/**
 * Returns true if a dungeon portal on island (gx, gy) is currently enterable
 * (owned, not story-locked, and for 'void_spire', 'infernal_sanctum' must be cleared).
 */
export function isDungeonPortalEnterable(
  dungeonId: DungeonId,
  gx: number,
  gy: number,
  ownedIslands: ReadonlySet<string>,
  clearedDungeons: ReadonlySet<DungeonId>,
  storyLocked = false,
): boolean {
  if (!ownedIslands.has(`${gx},${gy}`) || storyLocked) return false;
  if (dungeonId === 'void_spire') {
    return clearedDungeons.has('infernal_sanctum');
  }
  return true;
}
