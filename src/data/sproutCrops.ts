export interface SproutCropDef {
  id: string;
  structureType:
    | 'crop_corn'
    | 'crop_sweet_carrot'
    | 'crop_cauliflower'
    | 'crop_tomato'
    | 'crop_eggplant'
    | 'crop_blue_tulip'
    | 'crop_cabbage'
    | 'crop_wheat'
    | 'crop_pumpkin'
    | 'crop_radish'
    | 'crop_pink_rose'
    | 'crop_beet'
    | 'crop_starfruit'
    | 'crop_cucumber';
  name: string;
  plantRow: number; // row in sprout/farming_plants (5 cols per row)
  maxStage: number; // 4 for corn, 3 for others
  iconKey: string;
  sellValue: number;
  healHp: number;
  healEnergy: number;
  description: string;
}

export const SPROUT_CROPS: SproutCropDef[] = [
  {
    id: 'corn',
    structureType: 'crop_corn',
    name: 'Sweet Corn',
    plantRow: 0,
    maxStage: 4,
    iconKey: 'sprout_icons/corn',
    sellValue: 8,
    healHp: 12,
    healEnergy: 22,
    description: 'Golden cob grown on the homestead. +12 HP, +22 EN.',
  },
  {
    id: 'sweet_carrot',
    structureType: 'crop_sweet_carrot',
    name: 'Heirloom Carrot',
    plantRow: 1,
    maxStage: 3,
    iconKey: 'sprout_icons/carrot_sl',
    sellValue: 9,
    healHp: 14,
    healEnergy: 24,
    description: 'Sweet heirloom root vegetable. +14 HP, +24 EN.',
  },
  {
    id: 'cauliflower',
    structureType: 'crop_cauliflower',
    name: 'Cauliflower',
    plantRow: 2,
    maxStage: 3,
    iconKey: 'sprout_icons/cauliflower',
    sellValue: 14,
    healHp: 22,
    healEnergy: 28,
    description: 'Plump white florets prized by cooks. +22 HP, +28 EN.',
  },
  {
    id: 'tomato',
    structureType: 'crop_tomato',
    name: 'Vine Tomato',
    plantRow: 3,
    maxStage: 3,
    iconKey: 'sprout_icons/tomato',
    sellValue: 10,
    healHp: 16,
    healEnergy: 20,
    description: 'Juicy red tomato. Great raw or in stews. +16 HP, +20 EN.',
  },
  {
    id: 'eggplant',
    structureType: 'crop_eggplant',
    name: 'Eggplant',
    plantRow: 4,
    maxStage: 3,
    iconKey: 'sprout_icons/eggplant',
    sellValue: 13,
    healHp: 18,
    healEnergy: 26,
    description: 'Glossy purple harvest. +18 HP, +26 EN.',
  },
  {
    id: 'blue_tulip',
    structureType: 'crop_blue_tulip',
    name: 'Azure Tulip',
    plantRow: 5,
    maxStage: 3,
    iconKey: 'sprout_icons/blue_tulip',
    sellValue: 16,
    healHp: 8,
    healEnergy: 35,
    description: 'Soothing blue blossom that restores +35 Energy.',
  },
  {
    id: 'cabbage',
    structureType: 'crop_cabbage',
    name: 'Crisp Cabbage',
    plantRow: 6,
    maxStage: 3,
    iconKey: 'sprout_icons/cabbage',
    sellValue: 11,
    healHp: 20,
    healEnergy: 18,
    description: 'Leafy green head. +20 HP, +18 EN.',
  },
  {
    id: 'wheat',
    structureType: 'crop_wheat',
    name: 'Golden Wheat',
    plantRow: 7,
    maxStage: 3,
    iconKey: 'sprout_icons/wheat',
    sellValue: 7,
    healHp: 6,
    healEnergy: 16,
    description: 'Staple grain used for baking bread at a Bonfire.',
  },
  {
    id: 'pumpkin',
    structureType: 'crop_pumpkin',
    name: 'Harvest Pumpkin',
    plantRow: 8,
    maxStage: 3,
    iconKey: 'sprout_icons/pumpkin',
    sellValue: 22,
    healHp: 28,
    healEnergy: 32,
    description: 'Heavy autumn gourd. Sells well or cooks into Pumpkin Soup.',
  },
  {
    id: 'radish',
    structureType: 'crop_radish',
    name: 'White Radish',
    plantRow: 9,
    maxStage: 3,
    iconKey: 'sprout_icons/radish',
    sellValue: 10,
    healHp: 14,
    healEnergy: 22,
    description: 'Peppery crisp root. +14 HP, +22 EN.',
  },
  {
    id: 'pink_rose',
    structureType: 'crop_pink_rose',
    name: 'Blush Rose',
    plantRow: 10,
    maxStage: 3,
    iconKey: 'sprout_icons/pink_rose',
    sellValue: 20,
    healHp: 26,
    healEnergy: 26,
    description: 'Fragrant homestead flower. +26 HP, +26 EN.',
  },
  {
    id: 'beet',
    structureType: 'crop_beet',
    name: 'Sugar Beet',
    plantRow: 11,
    maxStage: 3,
    iconKey: 'sprout_icons/beet',
    sellValue: 12,
    healHp: 18,
    healEnergy: 24,
    description: 'Sweet purple root. +18 HP, +24 EN.',
  },
  {
    id: 'starfruit',
    structureType: 'crop_starfruit',
    name: 'Starfruit',
    plantRow: 12,
    maxStage: 3,
    iconKey: 'sprout_icons/starfruit',
    sellValue: 34,
    healHp: 45,
    healEnergy: 50,
    description: 'Rare celestial crop! +45 HP, +50 EN or 34g sell.',
  },
  {
    id: 'cucumber',
    structureType: 'crop_cucumber',
    name: 'Garden Cucumber',
    plantRow: 13,
    maxStage: 3,
    iconKey: 'sprout_icons/cucumber',
    sellValue: 9,
    healHp: 15,
    healEnergy: 20,
    description: 'Refreshing green vine crop. +15 HP, +20 EN.',
  },
];

export const SPROUT_CROP_BY_STRUCTURE = Object.fromEntries(
  SPROUT_CROPS.map((c) => [c.structureType, c]),
) as Record<SproutCropDef['structureType'], SproutCropDef>;
