export type CraftingStation = 'hand' | 'furnace' | 'anvil' | 'bonfire' | 'build';

export interface Ingredient {
  itemId: string;
  count: number;
}

export type StructureType =
  | 'bridge'
  | 'road_stone'
  | 'furnace'
  | 'anvil'
  | 'bonfire'
  | 'lighthouse'
  | 'mining_rod'
  | 'fish_trap'
  | 'chest'
  | 'crop_berries'
  | 'crop_carrot';

export interface RecipeDef {
  id: string;
  name: string;
  station: CraftingStation;
  description: string;
  ingredients: Ingredient[];
  outputItemId?: string;
  outputCount?: number;
  upgradeTool?: 'pickaxe' | 'sword' | 'bow';
  nextTier?: number;
  structureType?: StructureType;
  requiresSkill?: string;
  iconKey?: string;
  craftTimeMs?: number;
}

export const RECIPES: RecipeDef[] = [
  // BUILDABLE STRUCTURES
  {
    id: 'build_bridge',
    name: 'Wooden Bridge',
    station: 'build',
    description: 'Place on water tiles to cross between islands.',
    ingredients: [{ itemId: 'wood', count: 4 }],
    structureType: 'bridge',
    iconKey: 'ui_icons/bridge',
  },
  {
    id: 'build_road_stone',
    name: 'Stone Road',
    station: 'build',
    description: 'Auto-tiling cobblestone path (+15% walk speed).',
    ingredients: [{ itemId: 'stone', count: 2 }],
    structureType: 'road_stone',
    iconKey: 'tileset/Stone tile',
  },
  {
    id: 'build_furnace',
    name: 'Furnace',
    station: 'build',
    description: 'Smelts Iron & Gold Ore into Ingots and mints Coins.',
    ingredients: [
      { itemId: 'stone', count: 10 },
      { itemId: 'coal', count: 2 },
    ],
    structureType: 'furnace',
    iconKey: 'ui_icons/furnace',
  },
  {
    id: 'build_anvil',
    name: 'Blacksmith Anvil',
    station: 'build',
    description: 'Upgrades Pickaxe, Sword, and crafts Hunter Bow.',
    ingredients: [
      { itemId: 'stone', count: 8 },
      { itemId: 'iron_ingot', count: 4 },
    ],
    structureType: 'anvil',
    iconKey: 'objects/Anvil',
  },
  {
    id: 'build_bonfire',
    name: 'Bonfire',
    station: 'build',
    description: 'Cooks Fresh Fish into Grilled Fish & warms nearby area.',
    ingredients: [
      { itemId: 'wood', count: 6 },
      { itemId: 'stone', count: 4 },
    ],
    structureType: 'bonfire',
    iconKey: 'objects/Torch',
  },
  {
    id: 'build_chest',
    name: 'Treasure Chest',
    station: 'build',
    description: 'Decorative storage marker that grants +10% nearby XP.',
    ingredients: [
      { itemId: 'wood', count: 8 },
      { itemId: 'iron_ingot', count: 2 },
    ],
    structureType: 'chest',
    iconKey: 'objects/Crate',
  },
  {
    id: 'build_fish_trap',
    name: 'Fish Trap',
    station: 'build',
    description: 'Place on water to periodically catch Fresh Fish.',
    ingredients: [
      { itemId: 'wood', count: 8 },
      { itemId: 'berries', count: 4 },
    ],
    structureType: 'fish_trap',
    iconKey: 'objects/Barrel_water',
  },
  {
    id: 'build_mining_rod',
    name: 'Mining Rod',
    station: 'build',
    description: 'Automatically harvests trees, rocks, and ores within 5 tiles!',
    ingredients: [
      { itemId: 'iron_ingot', count: 6 },
      { itemId: 'gold_ingot', count: 2 },
      { itemId: 'crystal', count: 2 },
    ],
    structureType: 'mining_rod',
    requiresSkill: 'industry_mining_rod',
    iconKey: 'ui_icons/mining_rod',
  },
  {
    id: 'build_lighthouse',
    name: 'Lighthouse',
    station: 'build',
    description: 'Multiplies ALL resource & coin drops by +50% within 6 tiles (stacks!).',
    ingredients: [
      { itemId: 'stone', count: 16 },
      { itemId: 'gold_ingot', count: 4 },
      { itemId: 'amber', count: 2 },
    ],
    structureType: 'lighthouse',
    requiresSkill: 'economy_optics',
    iconKey: 'ui_icons/lighthouse',
  },
  {
    id: 'build_crop_berries',
    name: 'Plant Berry Bush',
    station: 'build',
    description: 'Plant on land for renewable Wild Berries.',
    ingredients: [{ itemId: 'berries', count: 3 }],
    structureType: 'crop_berries',
    iconKey: 'ui_icons/berries',
  },
  {
    id: 'build_crop_carrot',
    name: 'Plant Carrot Plot',
    station: 'build',
    description: 'Plant on land for high-energy Crisp Carrots.',
    ingredients: [
      { itemId: 'berries', count: 2 },
      { itemId: 'wood', count: 2 },
    ],
    structureType: 'crop_carrot',
    iconKey: 'ui_icons/carrot',
  },

  // HAND / ALCHEMY CRAFTING
  {
    id: 'craft_bomb',
    name: 'Alchemist Bomb (x2)',
    station: 'hand',
    description: 'Explosive blast for clearing nodes or damaging monsters.',
    ingredients: [
      { itemId: 'coal', count: 2 },
      { itemId: 'iron_ingot', count: 1 },
      { itemId: 'slime_gel', count: 1 },
    ],
    outputItemId: 'bomb',
    outputCount: 2,
    requiresSkill: 'magic_alchemy',
  },
  {
    id: 'craft_potion_red',
    name: 'Crimson Potion',
    station: 'hand',
    description: 'Restores +65 HP instantly.',
    ingredients: [
      { itemId: 'berries', count: 4 },
      { itemId: 'slime_gel', count: 2 },
    ],
    outputItemId: 'potion_red',
    outputCount: 1,
    requiresSkill: 'magic_alchemy',
  },
  {
    id: 'craft_potion_blue',
    name: 'Azure Tonic',
    station: 'hand',
    description: 'Restores +80 Energy instantly.',
    ingredients: [
      { itemId: 'carrot', count: 2 },
      { itemId: 'crystal', count: 1 },
    ],
    outputItemId: 'potion_blue',
    outputCount: 1,
    requiresSkill: 'magic_alchemy',
  },

  // FURNACE
  {
    id: 'smelt_coal',
    name: 'Charcoal (x2)',
    station: 'furnace',
    description: 'Burn Wood into Coal.',
    ingredients: [{ itemId: 'wood', count: 4 }],
    outputItemId: 'coal',
    outputCount: 2,
    craftTimeMs: 2500,
  },
  {
    id: 'smelt_iron',
    name: 'Iron Ingot',
    station: 'furnace',
    description: 'Smelt Iron Ore with Coal.',
    ingredients: [
      { itemId: 'iron_ore', count: 2 },
      { itemId: 'coal', count: 1 },
    ],
    outputItemId: 'iron_ingot',
    outputCount: 1,
    craftTimeMs: 3500,
  },
  {
    id: 'smelt_gold',
    name: 'Gold Ingot',
    station: 'furnace',
    description: 'Smelt Gold Ore with Coal.',
    ingredients: [
      { itemId: 'gold_ore', count: 2 },
      { itemId: 'coal', count: 1 },
    ],
    outputItemId: 'gold_ingot',
    outputCount: 1,
    craftTimeMs: 4500,
  },

  // BONFIRE
  {
    id: 'cook_fish',
    name: 'Grilled Fish',
    station: 'bonfire',
    description: 'Cook Fresh Fish for +40 HP and +45 Energy.',
    ingredients: [
      { itemId: 'fish', count: 1 },
      { itemId: 'wood', count: 1 },
    ],
    outputItemId: 'cooked_fish',
    outputCount: 1,
    craftTimeMs: 2500,
  },

  // ANVIL TOOL, WEAPON & ARMOR CRAFTING
  {
    id: 'craft_bow',
    name: 'Hunter Bow',
    station: 'anvil',
    description: 'Unlock ranged Arrow attacks.',
    ingredients: [
      { itemId: 'wood', count: 12 },
      { itemId: 'iron_ingot', count: 4 },
    ],
    outputItemId: 'bow',
    outputCount: 1,
    iconKey: 'ui_icons/bow',
    craftTimeMs: 4500,
  },
  {
    id: 'craft_armor_leather',
    name: 'Forager Leather Vest',
    station: 'hand',
    description: '+4 Armor, +20 Max HP, +15 Max Energy, +5% Speed.',
    ingredients: [
      { itemId: 'wood', count: 6 },
      { itemId: 'slime_gel', count: 4 },
      { itemId: 'berries', count: 4 },
    ],
    outputItemId: 'armor_leather',
    outputCount: 1,
    iconKey: 'ui_icons/armor_leather',
  },
  {
    id: 'craft_ring_copper',
    name: 'Scout Ring',
    station: 'anvil',
    description: '+12% Move Speed, +8% Crit, +15 Max Energy.',
    ingredients: [
      { itemId: 'iron_ingot', count: 3 },
      { itemId: 'amber', count: 2 },
    ],
    outputItemId: 'ring_copper',
    outputCount: 1,
    iconKey: 'ui_icons/ring_copper',
    craftTimeMs: 4500,
  },
  {
    id: 'craft_armor_iron',
    name: 'Iron Hauberk',
    station: 'anvil',
    description: '+10 Armor, +45 Max HP.',
    ingredients: [
      { itemId: 'iron_ingot', count: 8 },
      { itemId: 'coal', count: 4 },
    ],
    outputItemId: 'armor_iron',
    outputCount: 1,
    iconKey: 'ui_icons/armor_iron',
    craftTimeMs: 5000,
  },
  {
    id: 'craft_charm_miner',
    name: 'Prospector Charm',
    station: 'anvil',
    description: '+14 Gather Power, +30 Max Energy, +3 Armor.',
    ingredients: [
      { itemId: 'gold_ingot', count: 4 },
      { itemId: 'crystal', count: 3 },
    ],
    outputItemId: 'charm_miner',
    outputCount: 1,
    iconKey: 'ui_icons/charm_miner',
    craftTimeMs: 5500,
  },
  {
    id: 'craft_armor_frost',
    name: 'Frostcrystal Plate',
    station: 'anvil',
    description: '+16 Armor, +75 Max HP, +30 Max Energy, +5% Crit.',
    ingredients: [
      { itemId: 'iron_ingot', count: 6 },
      { itemId: 'crystal', count: 8 },
    ],
    outputItemId: 'armor_frost',
    outputCount: 1,
    iconKey: 'ui_icons/armor_frost',
    craftTimeMs: 6500,
  },
  {
    id: 'craft_armor_obsidian',
    name: 'Obsidian Battlegear',
    station: 'anvil',
    description: '+24 Armor, +110 Max HP, +12 Attack, +8% Crit.',
    ingredients: [
      { itemId: 'obsidian', count: 8 },
      { itemId: 'demon_horn', count: 4 },
      { itemId: 'gold_ingot', count: 4 },
    ],
    outputItemId: 'armor_obsidian',
    outputCount: 1,
    iconKey: 'ui_icons/armor_obsidian',
    craftTimeMs: 7500,
  },
  {
    id: 'craft_amulet_dragon',
    name: 'Dragonheart Amulet',
    station: 'anvil',
    description: '+16 Attack, +14% Crit, +50 Max HP, +6 Armor.',
    ingredients: [
      { itemId: 'gold_ingot', count: 6 },
      { itemId: 'demon_horn', count: 5 },
      { itemId: 'obsidian', count: 4 },
    ],
    outputItemId: 'amulet_dragon',
    outputCount: 1,
    iconKey: 'ui_icons/amulet_dragon',
    craftTimeMs: 7500,
  },
  {
    id: 'upgrade_pick_2',
    name: 'Iron Pickaxe',
    station: 'anvil',
    description: '20 Gather Power, 16 Attack. Craftable gear item!',
    ingredients: [
      { itemId: 'wood', count: 8 },
      { itemId: 'iron_ingot', count: 5 },
    ],
    outputItemId: 'pickaxe_iron',
    outputCount: 1,
    iconKey: 'ui_icons/pickaxe',
    craftTimeMs: 4500,
  },
  {
    id: 'upgrade_pick_3',
    name: 'Golden Pickaxe',
    station: 'anvil',
    description: '32 Gather Power, 22 Attack, +5% Crit.',
    ingredients: [
      { itemId: 'iron_ingot', count: 6 },
      { itemId: 'gold_ingot', count: 6 },
    ],
    outputItemId: 'pickaxe_gold',
    outputCount: 1,
    iconKey: 'ui_icons/pickaxe_gold',
    craftTimeMs: 6000,
  },
  {
    id: 'upgrade_pick_4',
    name: 'Crystal Void Pickaxe',
    station: 'anvil',
    description: '48 Gather Power, 30 Attack, +10% Crit, +5% Speed.',
    ingredients: [
      { itemId: 'gold_ingot', count: 8 },
      { itemId: 'crystal', count: 8 },
      { itemId: 'obsidian', count: 4 },
    ],
    outputItemId: 'pickaxe_crystal',
    outputCount: 1,
    iconKey: 'ui_icons/pickaxe_crystal',
    craftTimeMs: 7500,
  },
  {
    id: 'upgrade_sword_2',
    name: 'Iron Broadsword',
    station: 'anvil',
    description: '34 Attack, +7% Crit, +2 Armor.',
    ingredients: [
      { itemId: 'iron_ingot', count: 6 },
      { itemId: 'slime_gel', count: 4 },
    ],
    outputItemId: 'sword_iron',
    outputCount: 1,
    iconKey: 'ui_icons/sword',
    craftTimeMs: 4500,
  },
  {
    id: 'upgrade_sword_3',
    name: 'Sunforged Blade',
    station: 'anvil',
    description: '50 Attack, +12% Crit, +6% Speed.',
    ingredients: [
      { itemId: 'gold_ingot', count: 6 },
      { itemId: 'amber', count: 5 },
      { itemId: 'bone', count: 5 },
    ],
    outputItemId: 'sword_sun',
    outputCount: 1,
    iconKey: 'ui_icons/sword_gold',
    craftTimeMs: 6000,
  },
  {
    id: 'upgrade_sword_4',
    name: 'Obsidian Greatsword',
    station: 'anvil',
    description: '74 Attack, +18% Crit, +20 Max HP.',
    ingredients: [
      { itemId: 'obsidian', count: 8 },
      { itemId: 'demon_horn', count: 4 },
      { itemId: 'crystal', count: 6 },
    ],
    outputItemId: 'sword_obsidian',
    outputCount: 1,
    iconKey: 'ui_icons/sword_obsidian',
    craftTimeMs: 7500,
  },
];
