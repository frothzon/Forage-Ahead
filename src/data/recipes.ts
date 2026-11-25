import { SPROUT_CROPS, type SproutCropDef } from './sproutCrops';
import { ITEMS } from './items';
import { gearCoinCost } from './economy';

export type CraftingStation =
  | 'hand'
  | 'furnace'
  | 'anvil'
  | 'bonfire'
  | 'alchemy_lab'
  | 'frost_kiln'
  | 'infernal_forge'
  | 'void_altar'
  | 'build';

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
  | 'alchemy_lab'
  | 'frost_kiln'
  | 'infernal_forge'
  | 'void_altar'
  | 'lighthouse'
  | 'mining_rod'
  | 'fish_trap'
  | 'chest'
  | 'nest'
  | 'fence'
  | 'fence_gate'
  | 'house_floor'
  | 'house_wall'
  | 'house_door'
  | 'furniture_bed'
  | 'furniture_lamp'
  | 'furniture_table'
  | 'furniture_rug'
  | 'water_well'
  | 'crop_berries'
  | 'crop_carrot'
  | 'crop_sunflower'
  | SproutCropDef['structureType'];

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
  unlockMode?: 'starter' | 'skill' | 'blueprint';
  blueprintHint?: string;
  iconKey?: string;
  craftTimeMs?: number;
  coinCost?: number;
}

const TILE_OR_CROP_BUILD_IDS = new Set([
  'build_bridge',
  'build_road_stone',
  'build_fence',
  'build_fence_gate',
  'build_house_floor',
  'build_house_wall',
  'build_house_door',
  'build_furniture_bed',
  'build_furniture_lamp',
  'build_furniture_table',
  'build_furniture_rug',
  'build_crop_berries',
  'build_crop_carrot',
  'build_crop_sunflower',
]);

const VOID_ALTAR_SINKS: Record<string, Ingredient[]> = {
  craft_sword_astral: [
    { itemId: 'gold_ingot', count: 120 },
    { itemId: 'crystal', count: 150 },
  ],
  craft_pickaxe_celestial: [
    { itemId: 'crystal', count: 250 },
    { itemId: 'obsidian', count: 200 },
  ],
  craft_sword_wyrmheart: [
    { itemId: 'gold_ingot', count: 350 },
    { itemId: 'obsidian', count: 300 },
  ],
  craft_armor_voidwalker: [
    { itemId: 'crystal', count: 350 },
    { itemId: 'obsidian', count: 300 },
  ],
  craft_trinket_chrono: [
    { itemId: 'gold_ingot', count: 200 },
    { itemId: 'crystal', count: 200 },
  ],
  craft_trinket_abyssal: [
    { itemId: 'obsidian', count: 250 },
    { itemId: 'gold_ingot', count: 250 },
  ],
  craft_gadget_meteor: [
    { itemId: 'obsidian', count: 180 },
    { itemId: 'crystal', count: 180 },
  ],
};

const UNSCALED_RECIPE_IDS = new Set([
  'smelt_coal',
  'smelt_iron',
  'smelt_gold',
  'cook_fish',
  'cook_meat',
  'cook_omelet',
  'cook_pumpkin_soup',
  'cook_veggie_medley',
  'cook_starfruit_tart',
  'craft_potion_red',
  'craft_potion_blue',
  'craft_elixir_egg',
  'craft_bomb',
  'craft_bomb_fire',
  'craft_bomb_frost',
  'craft_bomb_void',
]);

const MONSTER_DROP_IDS = new Set(['slime_gel', 'bone', 'amber', 'demon_horn']);

function getRecipeMaterialMultiplier(r: RecipeDef): number {
  if (UNSCALED_RECIPE_IDS.has(r.id)) return 1;
  if (r.id === 'build_frost_kiln' || r.station === 'frost_kiln') return 8;
  if (r.id === 'build_infernal_forge' || r.station === 'infernal_forge') return 12;
  if (r.id === 'build_void_altar') return 10;
  if (r.station === 'void_altar') return 2;
  if (TILE_OR_CROP_BUILD_IDS.has(r.id) || r.id.startsWith('build_crop_')) return 2;
  return 5;
}

function scaleRecipe(r: RecipeDef): RecipeDef {
  const mult = getRecipeMaterialMultiplier(r);
  const scaledIngredients = r.ingredients.map((ing) => {
    const ingMult = MONSTER_DROP_IDS.has(ing.itemId) ? Math.min(mult, 3) : mult;
    return {
      itemId: ing.itemId,
      count: Math.max(1, Math.round(ing.count * ingMult)),
    };
  });
  const extraSinks = VOID_ALTAR_SINKS[r.id];
  if (extraSinks) {
    scaledIngredients.push(...extraSinks);
  }
  const outDef = r.outputItemId ? ITEMS[r.outputItemId] : undefined;
  const coinCost =
    outDef && outDef.equipSlot && (outDef.requiredLevel ?? 1) >= 2
      ? gearCoinCost(outDef.requiredLevel ?? 1)
      : r.coinCost;
  return {
    ...r,
    ingredients: scaledIngredients,
    ...(coinCost ? { coinCost } : {}),
  };
}

const BASE_RECIPES: RecipeDef[] = [
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
    id: 'build_alchemy_lab',
    name: 'Alchemist Lab',
    station: 'build',
    description: 'Tier 2 Biome Station: brews Potions, Bombs, and early Trinkets.',
    ingredients: [
      { itemId: 'stone', count: 10 },
      { itemId: 'iron_ingot', count: 4 },
      { itemId: 'bone', count: 4 },
    ],
    structureType: 'alchemy_lab',
    iconKey: 'objects/Barrel',
  },
  {
    id: 'build_frost_kiln',
    name: 'Frostcrystal Kiln',
    station: 'build',
    description: 'Tier 3 Biome Station: forges Frostcrystal Plate & Void Pickaxe.',
    ingredients: [
      { itemId: 'stone', count: 14 },
      { itemId: 'gold_ingot', count: 4 },
      { itemId: 'crystal', count: 6 },
    ],
    structureType: 'frost_kiln',
    iconKey: 'ui_icons/furnace',
  },
  {
    id: 'build_infernal_forge',
    name: 'Infernal Forge',
    station: 'build',
    description: 'Tier 4 Biome Station: smites Obsidian Battlegear & Dragonheart.',
    ingredients: [
      { itemId: 'obsidian', count: 6 },
      { itemId: 'gold_ingot', count: 6 },
      { itemId: 'demon_horn', count: 4 },
    ],
    structureType: 'infernal_forge',
    iconKey: 'objects/Anvil',
  },
  {
    id: 'build_void_altar',
    name: 'Void Altar',
    station: 'build',
    description: 'Tier 5 Endgame Station: fuses Void Spire drops & Monster Eggs into Lv.60 gear!',
    ingredients: [
      { itemId: 'obsidian', count: 8 },
      { itemId: 'crystal', count: 8 },
      { itemId: 'void_shard', count: 2 },
    ],
    structureType: 'void_altar',
    iconKey: 'ui_icons/necro_rod',
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
    id: 'build_nest',
    name: 'Monster Nest',
    station: 'build',
    description: 'Place an Egg on a Nest [E] to hatch a friendly homestead creature.',
    ingredients: [
      { itemId: 'wood', count: 6 },
      { itemId: 'berries', count: 2 },
    ],
    structureType: 'nest',
    iconKey: 'tileset/Wooden logs',
  },
  {
    id: 'build_fence',
    name: 'Homestead Fence',
    station: 'build',
    description: 'Solid fence to keep wandering ranch creatures safely enclosed.',
    ingredients: [{ itemId: 'wood', count: 2 }],
    structureType: 'fence',
    iconKey: 'objects/Fences (stone)',
  },
  {
    id: 'build_fence_gate',
    name: 'Fence Gate',
    station: 'build',
    description: 'Toggleable gate [E] so you can walk in & out of ranch pens.',
    ingredients: [{ itemId: 'wood', count: 3 }],
    structureType: 'fence_gate',
    iconKey: 'sprout_icons/fence_gate',
  },
  {
    id: 'build_house_floor',
    name: 'House Floor',
    station: 'build',
    description: 'Walkable wood plank floor. Automatically forms a fadeable roof!',
    ingredients: [{ itemId: 'wood', count: 2 }],
    structureType: 'house_floor',
    iconKey: 'sprout_icons/house_floor',
  },
  {
    id: 'build_house_wall',
    name: 'House Wall',
    station: 'build',
    description: 'Blocked-out wooden house wall. Enclose floors to build a home!',
    ingredients: [{ itemId: 'wood', count: 3 }],
    structureType: 'house_wall',
    iconKey: 'sprout_icons/house_wall',
  },
  {
    id: 'build_house_door',
    name: 'House Door',
    station: 'build',
    description: 'Swinging door [E] for entering your blocked-out overworld house.',
    ingredients: [{ itemId: 'wood', count: 4 }],
    structureType: 'house_door',
    iconKey: 'sprout_icons/house_door',
  },
  {
    id: 'build_furniture_bed',
    name: 'Cozy Bed',
    station: 'build',
    description: 'Place inside your house & press [E] to rest (full HP & Energy).',
    ingredients: [
      { itemId: 'wood', count: 6 },
      { itemId: 'berries', count: 2 },
    ],
    structureType: 'furniture_bed',
    iconKey: 'sprout_icons/bed',
  },
  {
    id: 'build_furniture_lamp',
    name: 'Warm Lamp',
    station: 'build',
    description: 'Glowing interior lamp that lights up your house at night.',
    ingredients: [
      { itemId: 'wood', count: 2 },
      { itemId: 'coal', count: 1 },
    ],
    structureType: 'furniture_lamp',
    iconKey: 'sprout_icons/lamp',
  },
  {
    id: 'build_furniture_table',
    name: 'Wooden Table',
    station: 'build',
    description: 'Sturdy homestead table for furnishing your house.',
    ingredients: [{ itemId: 'wood', count: 4 }],
    structureType: 'furniture_table',
    iconKey: 'sprout_icons/table',
  },
  {
    id: 'build_furniture_rug',
    name: 'Woven Rug',
    station: 'build',
    description: 'Walkable decorative rug for house interiors.',
    ingredients: [
      { itemId: 'wood', count: 2 },
      { itemId: 'berries', count: 1 },
    ],
    structureType: 'furniture_rug',
    iconKey: 'sprout_icons/rug',
  },
  {
    id: 'build_water_well',
    name: 'Water Well',
    station: 'build',
    description: 'Interact [E] to restore +30 EN and water nearby crops!',
    ingredients: [
      { itemId: 'stone', count: 8 },
      { itemId: 'wood', count: 4 },
    ],
    structureType: 'water_well',
    iconKey: 'sprout/water_well',
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
      { itemId: 'amber', count: 2 },
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
    name: 'Berry Seeds',
    station: 'hand',
    description: 'Crafts Berry Seeds into inventory. Plant on tilled soil!',
    ingredients: [{ itemId: 'berries', count: 3 }],
    outputItemId: 'seed_berries',
    outputCount: 1,
    iconKey: 'ui_icons/berries',
  },
  {
    id: 'build_crop_carrot',
    name: 'Carrot Seeds',
    station: 'hand',
    description: 'Crafts Carrot Seeds into inventory. Plant on tilled soil!',
    ingredients: [
      { itemId: 'berries', count: 2 },
      { itemId: 'wood', count: 2 },
    ],
    outputItemId: 'seed_carrot',
    outputCount: 1,
    iconKey: 'ui_icons/carrot',
  },
  {
    id: 'build_crop_sunflower',
    name: 'Sunflower Seeds',
    station: 'hand',
    description: 'Crafts Sunflower Seeds into inventory. Plant on tilled soil!',
    ingredients: [
      { itemId: 'carrot', count: 2 },
      { itemId: 'gold_ore', count: 1 },
    ],
    outputItemId: 'seed_sunflower',
    outputCount: 1,
    iconKey: 'ui_icons/sunflower',
  },

  // HAND / ALCHEMY CRAFTING
  {
    id: 'craft_hoe',
    name: 'Farmer Hoe',
    station: 'hand',
    description: 'Till land into fertile Dirt for faster crop growth.',
    ingredients: [
      { itemId: 'wood', count: 4 },
      { itemId: 'stone', count: 2 },
    ],
    outputItemId: 'hoe',
    outputCount: 1,
    iconKey: 'ui_icons/hoe',
  },
  {
    id: 'craft_watering_can',
    name: 'Watering Can',
    station: 'hand',
    description: 'Water crops to speed up harvests.',
    ingredients: [
      { itemId: 'iron_ingot', count: 2 },
      { itemId: 'wood', count: 2 },
    ],
    outputItemId: 'watering_can',
    outputCount: 1,
    iconKey: 'ui_icons/watering_can',
  },
  {
    id: 'craft_salvage_hammer',
    name: 'Salvage Hammer',
    station: 'hand',
    description: 'Break down crafted buildings, bridges & roads for 50% resources.',
    ingredients: [
      { itemId: 'wood', count: 2 },
      { itemId: 'stone', count: 1 },
    ],
    outputItemId: 'salvage_hammer',
    outputCount: 1,
    iconKey: 'ui_icons/pickaxe',
  },
  {
    id: 'craft_bomb',
    name: 'Alchemist Bomb (x2)',
    station: 'alchemy_lab',
    description: 'Explosive blast for clearing nodes or damaging monsters.',
    ingredients: [
      { itemId: 'coal', count: 2 },
      { itemId: 'iron_ingot', count: 1 },
      { itemId: 'slime_gel', count: 1 },
    ],
    outputItemId: 'bomb',
    outputCount: 2,
    requiresSkill: 'magic_alchemy',
    craftTimeMs: 20000,
  },
  {
    id: 'craft_bomb_fire',
    name: 'Fire Bomb (x2)',
    station: 'alchemy_lab',
    description: 'Ignites dungeon braziers and sears monsters for 55 AoE damage.',
    ingredients: [
      { itemId: 'coal', count: 2 },
      { itemId: 'amber', count: 1 },
      { itemId: 'slime_gel', count: 1 },
    ],
    outputItemId: 'bomb_fire',
    outputCount: 2,
    requiresSkill: 'magic_alchemy',
    iconKey: 'projectiles/Bomb',
    craftTimeMs: 20000,
  },
  {
    id: 'craft_bomb_frost',
    name: 'Frost Bomb (x2)',
    station: 'frost_kiln',
    description: 'Quenches flame vents and slows enemies for 3.5s (40 AoE damage).',
    ingredients: [
      { itemId: 'coal', count: 2 },
      { itemId: 'crystal', count: 2 },
      { itemId: 'iron_ingot', count: 1 },
    ],
    outputItemId: 'bomb_frost',
    outputCount: 2,
    iconKey: 'projectiles/Bomb',
    craftTimeMs: 22000,
  },
  {
    id: 'craft_bomb_void',
    name: 'Void Cluster Bomb (x2)',
    station: 'void_altar',
    description: 'Deals 120 AoE damage, ignites braziers, and splits into 3 void clusters.',
    ingredients: [
      { itemId: 'obsidian', count: 2 },
      { itemId: 'crystal', count: 2 },
      { itemId: 'void_shard', count: 1 },
    ],
    outputItemId: 'bomb_void',
    outputCount: 2,
    iconKey: 'projectiles/Bomb',
    craftTimeMs: 25000,
  },
  {
    id: 'craft_potion_red',
    name: 'Crimson Potion',
    station: 'alchemy_lab',
    description: 'Restores +65 HP instantly.',
    ingredients: [
      { itemId: 'berries', count: 4 },
      { itemId: 'slime_gel', count: 2 },
    ],
    outputItemId: 'potion_red',
    outputCount: 1,
    requiresSkill: 'magic_alchemy',
    craftTimeMs: 18000,
  },
  {
    id: 'craft_potion_blue',
    name: 'Azure Tonic',
    station: 'alchemy_lab',
    description: 'Restores +80 Energy instantly.',
    ingredients: [
      { itemId: 'carrot', count: 2 },
      { itemId: 'crystal', count: 1 },
    ],
    outputItemId: 'potion_blue',
    outputCount: 1,
    requiresSkill: 'magic_alchemy',
    craftTimeMs: 22000,
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
    craftTimeMs: 15000,
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
    craftTimeMs: 24000,
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
    unlockMode: 'blueprint',
    blueprintHint: 'Mine Gold Ore nodes or defeat Autumn/Desert monsters.',
    craftTimeMs: 35000,
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
    craftTimeMs: 12000,
  },
  {
    id: 'cook_meat',
    name: 'Seared Steak',
    station: 'bonfire',
    description: 'Grill Raw Meat over a Bonfire for +45 HP and +35 Energy.',
    ingredients: [
      { itemId: 'raw_meat', count: 1 },
      { itemId: 'wood', count: 1 },
    ],
    outputItemId: 'cooked_meat',
    outputCount: 1,
    craftTimeMs: 12000,
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
    craftTimeMs: 30000,
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
    station: 'alchemy_lab',
    description: '+12% Move Speed, +8% Crit, +15 Max Energy.',
    ingredients: [
      { itemId: 'iron_ingot', count: 3 },
      { itemId: 'amber', count: 2 },
    ],
    outputItemId: 'ring_copper',
    outputCount: 1,
    unlockMode: 'blueprint',
    blueprintHint: 'Drops from Autumn/Desert monsters or chests.',
    iconKey: 'ui_icons/ring_copper',
    craftTimeMs: 30000,
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
    unlockMode: 'blueprint',
    blueprintHint: 'Mine Iron Ore or defeat Goblin Raiders.',
    iconKey: 'ui_icons/armor_iron',
    craftTimeMs: 35000,
  },
  {
    id: 'craft_charm_miner',
    name: 'Prospector Charm',
    station: 'alchemy_lab',
    description: '+14 Gather Power, +30 Max Energy, +3 Armor.',
    ingredients: [
      { itemId: 'gold_ingot', count: 4 },
      { itemId: 'crystal', count: 3 },
    ],
    outputItemId: 'charm_miner',
    outputCount: 1,
    unlockMode: 'blueprint',
    blueprintHint: 'Caught while Fishing or mined from Crystal nodes.',
    iconKey: 'ui_icons/charm_miner',
    craftTimeMs: 40000,
  },
  {
    id: 'craft_armor_frost',
    name: 'Frostcrystal Plate',
    station: 'frost_kiln',
    description: '+16 Armor, +75 Max HP, +30 Max Energy, +5% Crit.',
    ingredients: [
      { itemId: 'iron_ingot', count: 6 },
      { itemId: 'crystal', count: 8 },
    ],
    outputItemId: 'armor_frost',
    outputCount: 1,
    unlockMode: 'blueprint',
    blueprintHint: 'Drops from Winter monsters or Frost Cavern.',
    iconKey: 'ui_icons/armor_frost',
    craftTimeMs: 60000,
  },
  {
    id: 'craft_armor_obsidian',
    name: 'Obsidian Battlegear',
    station: 'infernal_forge',
    description: '+24 Armor, +110 Max HP, +12 Attack, +8% Crit.',
    ingredients: [
      { itemId: 'obsidian', count: 8 },
      { itemId: 'demon_horn', count: 4 },
      { itemId: 'gold_ingot', count: 4 },
    ],
    outputItemId: 'armor_obsidian',
    outputCount: 1,
    unlockMode: 'blueprint',
    blueprintHint: 'Drops from Infernal monsters or Infernal Sanctum.',
    iconKey: 'ui_icons/armor_obsidian',
    craftTimeMs: 90000,
  },
  {
    id: 'craft_amulet_dragon',
    name: 'Dragonheart Amulet',
    station: 'infernal_forge',
    description: '+16 Attack, +14% Crit, +50 Max HP, +6 Armor.',
    ingredients: [
      { itemId: 'gold_ingot', count: 6 },
      { itemId: 'demon_horn', count: 5 },
      { itemId: 'obsidian', count: 4 },
    ],
    outputItemId: 'amulet_dragon',
    outputCount: 1,
    unlockMode: 'blueprint',
    blueprintHint: 'Drops from Ignis, Crimson Wyrm or Flame Demons.',
    iconKey: 'ui_icons/amulet_dragon',
    craftTimeMs: 90000,
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
    craftTimeMs: 30000,
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
    unlockMode: 'blueprint',
    blueprintHint: 'Mine Gold Ore or clear Sunken Tomb.',
    iconKey: 'ui_icons/pickaxe_gold',
    craftTimeMs: 45000,
  },
  {
    id: 'upgrade_pick_4',
    name: 'Crystal Void Pickaxe',
    station: 'frost_kiln',
    description: '48 Gather Power, 30 Attack, +10% Crit, +5% Speed.',
    ingredients: [
      { itemId: 'gold_ingot', count: 8 },
      { itemId: 'crystal', count: 8 },
      { itemId: 'obsidian', count: 4 },
    ],
    outputItemId: 'pickaxe_crystal',
    outputCount: 1,
    unlockMode: 'blueprint',
    blueprintHint: 'Mine Frost Crystals or clear Frost Cavern.',
    iconKey: 'ui_icons/pickaxe_crystal',
    craftTimeMs: 70000,
  },
  {
    id: 'upgrade_sword_2',
    name: 'Iron Broadsword',
    station: 'anvil',
    description: '15 Attack, +6% Crit, +2 Armor.',
    ingredients: [
      { itemId: 'iron_ingot', count: 6 },
      { itemId: 'slime_gel', count: 4 },
    ],
    outputItemId: 'sword_iron',
    outputCount: 1,
    iconKey: 'ui_icons/sword',
    craftTimeMs: 30000,
  },
  {
    id: 'upgrade_sword_3',
    name: 'Sunforged Blade',
    station: 'anvil',
    description: '26 Attack, +12% Crit, +6% Speed.',
    ingredients: [
      { itemId: 'gold_ingot', count: 6 },
      { itemId: 'amber', count: 5 },
      { itemId: 'bone', count: 5 },
    ],
    outputItemId: 'sword_sun',
    outputCount: 1,
    unlockMode: 'blueprint',
    blueprintHint: 'Defeat Anubis Guardians or clear Sunken Tomb.',
    iconKey: 'ui_icons/sword_gold',
    craftTimeMs: 45000,
  },
  {
    id: 'upgrade_sword_4',
    name: 'Obsidian Greatsword',
    station: 'infernal_forge',
    description: '58 Attack, +18% Crit, +35 Max HP.',
    ingredients: [
      { itemId: 'obsidian', count: 8 },
      { itemId: 'demon_horn', count: 4 },
      { itemId: 'crystal', count: 6 },
    ],
    outputItemId: 'sword_obsidian',
    outputCount: 1,
    unlockMode: 'blueprint',
    blueprintHint: 'Defeat Flame Demons or clear Infernal Sanctum.',
    iconKey: 'ui_icons/sword_obsidian',
    craftTimeMs: 90000,
  },
  {
    id: 'craft_trinket_regen',
    name: 'Vitality Band',
    station: 'alchemy_lab',
    description: 'Trinket: +25 Max HP, +2 Armor, and passive HP regen.',
    ingredients: [
      { itemId: 'iron_ingot', count: 3 },
      { itemId: 'berries', count: 6 },
      { itemId: 'slime_gel', count: 3 },
    ],
    outputItemId: 'trinket_regen',
    outputCount: 1,
    iconKey: 'ui_icons/ring_copper',
    craftTimeMs: 30000,
  },
  {
    id: 'craft_trinket_swift',
    name: 'Windrunner Charm',
    station: 'anvil',
    description: 'Trinket: +15% Speed, +20 Max EN, wider pickup.',
    ingredients: [
      { itemId: 'gold_ingot', count: 3 },
      { itemId: 'amber', count: 4 },
    ],
    outputItemId: 'trinket_swift',
    outputCount: 1,
    iconKey: 'ui_icons/charm_miner',
    craftTimeMs: 35000,
  },
  {
    id: 'craft_trinket_crit',
    name: 'Ember Spark',
    station: 'infernal_forge',
    description: 'Trinket: +10 Attack, +12% Crit Chance.',
    ingredients: [
      { itemId: 'obsidian', count: 4 },
      { itemId: 'demon_horn', count: 3 },
    ],
    outputItemId: 'trinket_crit',
    outputCount: 1,
    iconKey: 'ui_icons/amulet_dragon',
    craftTimeMs: 75000,
  },
  {
    id: 'craft_gadget_blink',
    name: 'Blink Stone',
    station: 'alchemy_lab',
    description: 'Cooldown Gadget: Teleport toward cursor (6s CD).',
    ingredients: [
      { itemId: 'crystal', count: 3 },
      { itemId: 'amber', count: 3 },
      { itemId: 'iron_ingot', count: 2 },
    ],
    outputItemId: 'gadget_blink',
    outputCount: 1,
    iconKey: 'ui_icons/thunder_rod',
    craftTimeMs: 45000,
  },
  {
    id: 'craft_gadget_ward',
    name: 'Aegis Ward',
    station: 'frost_kiln',
    description: 'Cooldown Gadget: Knockback pulse + 3s shield (12s CD).',
    ingredients: [
      { itemId: 'iron_ingot', count: 6 },
      { itemId: 'crystal', count: 4 },
    ],
    outputItemId: 'gadget_ward',
    outputCount: 1,
    iconKey: 'ui_icons/armor_iron',
    craftTimeMs: 50000,
  },
  {
    id: 'craft_gadget_nova',
    name: 'Frost Nova Totem',
    station: 'frost_kiln',
    description: 'Cooldown Gadget: 42 AoE Frost damage + knockback (10s CD).',
    ingredients: [
      { itemId: 'gold_ingot', count: 4 },
      { itemId: 'crystal', count: 6 },
    ],
    outputItemId: 'gadget_nova',
    outputCount: 1,
    iconKey: 'ui_icons/ice_rod',
    craftTimeMs: 55000,
  },
  {
    id: 'cook_omelet',
    name: 'Monster Omelet',
    station: 'bonfire',
    description: 'Cook a Slime Egg with Berries for +60 HP & +60 Energy.',
    ingredients: [
      { itemId: 'egg_slime', count: 1 },
      { itemId: 'berries', count: 2 },
    ],
    outputItemId: 'monster_omelet',
    outputCount: 1,
    iconKey: 'ui_icons/cooked_fish',
    craftTimeMs: 15000,
  },
  {
    id: 'craft_elixir_egg',
    name: 'Crimson Potion (Egg Brew)',
    station: 'alchemy_lab',
    description: 'Brew a Bat or Sandling Egg into 2 Crimson Potions.',
    ingredients: [
      { itemId: 'egg_bat', count: 1 },
      { itemId: 'berries', count: 2 },
    ],
    outputItemId: 'potion_red',
    outputCount: 2,
    iconKey: 'ui_icons/potion_red',
    craftTimeMs: 20000,
  },
  {
    id: 'cook_pumpkin_soup',
    name: 'Pumpkin Soup',
    station: 'bonfire',
    description: 'Hearty soup restoring +75 HP and +65 Energy.',
    ingredients: [
      { itemId: 'pumpkin', count: 1 },
      { itemId: 'wood', count: 1 },
    ],
    outputItemId: 'pumpkin_soup',
    outputCount: 1,
    iconKey: 'sprout_icons/pumpkin',
    craftTimeMs: 15000,
  },
  {
    id: 'cook_veggie_medley',
    name: 'Homestead Medley',
    station: 'bonfire',
    description: 'Cook Corn, Tomato & Cauliflower for +85 HP & +80 Energy.',
    ingredients: [
      { itemId: 'corn', count: 1 },
      { itemId: 'tomato', count: 1 },
      { itemId: 'cauliflower', count: 1 },
    ],
    outputItemId: 'veggie_medley',
    outputCount: 1,
    iconKey: 'sprout_icons/cauliflower',
    craftTimeMs: 18000,
  },
  {
    id: 'cook_starfruit_tart',
    name: 'Starfruit Tart',
    station: 'bonfire',
    description: 'Bake Starfruit & Wheat for +120 HP & +120 Energy.',
    ingredients: [
      { itemId: 'starfruit', count: 1 },
      { itemId: 'wheat', count: 2 },
    ],
    outputItemId: 'starfruit_tart',
    outputCount: 1,
    iconKey: 'sprout_icons/starfruit',
    craftTimeMs: 20000,
  },
  ...SPROUT_CROPS.map((c) => ({
    id: `build_${c.structureType}`,
    name: `${c.name} Seeds`,
    station: 'hand' as const,
    description: `${c.description} Craft seeds & plant on Tilled Soil!`,
    ingredients: [
      { itemId: 'wood', count: 1 },
      { itemId: 'berries', count: 1 },
    ],
    outputItemId: `seed_${c.id}`,
    outputCount: 1,
    iconKey: c.iconKey,
  })),

  // VOID ALTAR (Tier 5 Endgame: Rare Endless Drops + Monster Eggs)
  {
    id: 'craft_sword_astral',
    name: 'Astral Reaver (Lv.35)',
    station: 'void_altar',
    description: '145 ATK, +20% Crit, +10% Speed. Fuses Void Shards & Owlbear Egg.',
    ingredients: [
      { itemId: 'void_shard', count: 4 },
      { itemId: 'astral_essence', count: 2 },
      { itemId: 'egg_owlbear', count: 1 },
    ],
    outputItemId: 'sword_astral',
    outputCount: 1,
    iconKey: 'ui_icons/sword_gold',
    craftTimeMs: 110000,
  },
  {
    id: 'craft_pickaxe_celestial',
    name: 'Celestial Pickaxe (Lv.52)',
    station: 'void_altar',
    description: '140 Gather, 95 ATK. Fuses Astral Essence, Abyssal Core & Salamander Egg.',
    ingredients: [
      { itemId: 'astral_essence', count: 4 },
      { itemId: 'abyssal_core', count: 2 },
      { itemId: 'egg_salamander', count: 1 },
    ],
    outputItemId: 'pickaxe_celestial',
    outputCount: 1,
    iconKey: 'ui_icons/pickaxe_crystal',
    craftTimeMs: 120000,
  },
  {
    id: 'craft_sword_wyrmheart',
    name: 'Wyrmheart Greatsword (Lv.60)',
    station: 'void_altar',
    description: '310 ATK, +26% Crit, +150 HP. Fuses Celestial Scales & Wyrmling/Hellhound Eggs!',
    ingredients: [
      { itemId: 'celestial_scale', count: 3 },
      { itemId: 'abyssal_core', count: 3 },
      { itemId: 'egg_wyrmling', count: 1 },
      { itemId: 'egg_hellhound', count: 1 },
    ],
    outputItemId: 'sword_wyrmheart',
    outputCount: 1,
    iconKey: 'ui_icons/sword_obsidian',
    craftTimeMs: 150000,
  },
  {
    id: 'craft_armor_voidwalker',
    name: 'Voidwalker Battlegear (Lv.60)',
    station: 'void_altar',
    description: '+65 Armor, +420 HP, +45 ATK. Fuses Abyssal Cores & Oni/Griffin Eggs!',
    ingredients: [
      { itemId: 'abyssal_core', count: 3 },
      { itemId: 'celestial_scale', count: 2 },
      { itemId: 'egg_oni', count: 1 },
      { itemId: 'egg_griffin', count: 1 },
    ],
    outputItemId: 'armor_voidwalker',
    outputCount: 1,
    iconKey: 'ui_icons/armor_obsidian',
    craftTimeMs: 150000,
  },
  {
    id: 'craft_trinket_chrono',
    name: 'Chrono Band (Lv.45)',
    station: 'void_altar',
    description: 'Trinket: +22% Speed, +15% Crit, +60 Max EN.',
    ingredients: [
      { itemId: 'void_shard', count: 5 },
      { itemId: 'astral_essence', count: 3 },
      { itemId: 'egg_bat', count: 1 },
    ],
    outputItemId: 'trinket_chrono',
    outputCount: 1,
    iconKey: 'ui_icons/ring_copper',
    craftTimeMs: 100000,
  },
  {
    id: 'craft_trinket_abyssal',
    name: 'Abyssal Heart (Lv.58)',
    station: 'void_altar',
    description: 'Trinket: +55 ATK, +180 HP, +18 Armor, +18% Crit.',
    ingredients: [
      { itemId: 'abyssal_core', count: 3 },
      { itemId: 'celestial_scale', count: 2 },
      { itemId: 'egg_mummy', count: 1 },
    ],
    outputItemId: 'trinket_abyssal',
    outputCount: 1,
    iconKey: 'ui_icons/amulet_dragon',
    craftTimeMs: 135000,
  },
  {
    id: 'craft_gadget_meteor',
    name: 'Meteor Totem',
    station: 'void_altar',
    description: 'Cooldown Gadget: 220 AoE Meteor blast (9s CD).',
    ingredients: [
      { itemId: 'astral_essence', count: 3 },
      { itemId: 'void_shard', count: 4 },
      { itemId: 'egg_hellhound', count: 1 },
    ],
    outputItemId: 'gadget_meteor',
    outputCount: 1,
    iconKey: 'ui_icons/fire_rod',
    craftTimeMs: 110000,
  },
];

export const RECIPES: RecipeDef[] = BASE_RECIPES.map(scaleRecipe);
