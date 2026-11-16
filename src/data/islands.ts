import type { TerrainType } from '../world/AutoTiler';

export type BiomeKind = Exclude<TerrainType, 'water'>;

export type DungeonId = 'skull_crypt' | 'sunken_tomb' | 'frost_cavern' | 'infernal_sanctum';

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
