export type SkillPillar = 'foraging' | 'industry' | 'economy' | 'magic';

export interface SkillDef {
  id: string;
  name: string;
  pillar: SkillPillar;
  tier: 1 | 2 | 3 | 4 | 5;
  description: string;
  requires?: string;
}

export const PILLAR_META: Record<SkillPillar, { label: string; color: string; accent: string }> = {
  foraging: { label: 'Foraging', color: '#3b8c52', accent: '#7be089' },
  industry: { label: 'Industry', color: '#a86532', accent: '#f0b265' },
  economy: { label: 'Economy', color: '#b58d22', accent: '#ffe169' },
  magic: { label: 'Magic & Combat', color: '#7842a8', accent: '#cc8aff' },
};

export const SKILLS: SkillDef[] = [
  // FORAGING
  {
    id: 'foraging_gather',
    name: 'Nimble Hands',
    pillar: 'foraging',
    tier: 1,
    description: '+25% gather damage to trees, rocks, and ore nodes.',
  },
  {
    id: 'foraging_bounty',
    name: 'Bountiful Harvest',
    pillar: 'foraging',
    tier: 2,
    requires: 'foraging_gather',
    description: '+35% chance for bonus resource drops when harvesting.',
  },
  {
    id: 'foraging_farming',
    name: 'Green Thumb',
    pillar: 'foraging',
    tier: 3,
    requires: 'foraging_bounty',
    description: 'Crops grow 2x faster and yield double berries & carrots.',
  },
  {
    id: 'foraging_fishing',
    name: 'Master Angler',
    pillar: 'foraging',
    tier: 4,
    requires: 'foraging_farming',
    description: 'Fishing & Fish Traps also catch Coal, Ore, and Gold Coins.',
  },
  {
    id: 'foraging_magnet',
    name: 'Nature Magnetism',
    pillar: 'foraging',
    tier: 5,
    requires: 'foraging_fishing',
    description: 'Doubles item pickup radius and increases max Energy by +40.',
  },

  // INDUSTRY
  {
    id: 'industry_smelt',
    name: 'Bellows Mastery',
    pillar: 'industry',
    tier: 1,
    description: 'Unlocks Furnace & Anvil crafting speed +40%.',
  },
  {
    id: 'industry_masonry',
    name: 'Stonecraft',
    pillar: 'industry',
    tier: 2,
    requires: 'industry_smelt',
    description: 'Structures & Bridges cost 25% fewer Wood and Stone.',
  },
  {
    id: 'industry_mining_rod',
    name: 'Automation',
    pillar: 'industry',
    tier: 3,
    requires: 'industry_masonry',
    description: 'Unlocks Mining Rods that automatically harvest nearby nodes.',
  },
  {
    id: 'industry_prospecting',
    name: 'Deep Veins',
    pillar: 'industry',
    tier: 4,
    requires: 'industry_mining_rod',
    description: 'Rocks & Ores drop extra Coal, Iron, Gold, and Crystals.',
  },
  {
    id: 'industry_overclock',
    name: 'Industrial Surge',
    pillar: 'industry',
    tier: 5,
    requires: 'industry_prospecting',
    description: 'Mining Rods & Fish Traps operate 2x faster.',
  },

  // ECONOMY
  {
    id: 'economy_coinage',
    name: 'Treasure Hunter',
    pillar: 'economy',
    tier: 1,
    description: 'Monsters and Dig Spots drop +40% more Gold Coins.',
  },
  {
    id: 'economy_barter',
    name: 'Merchant Guild',
    pillar: 'economy',
    tier: 2,
    requires: 'economy_coinage',
    description: 'Selling items from inventory grants +50% more Coins.',
  },
  {
    id: 'economy_optics',
    name: 'Optics',
    pillar: 'economy',
    tier: 3,
    requires: 'economy_barter',
    description: 'Unlocks Lighthouses: +50% overlapping drop multiplier in radius!',
  },
  {
    id: 'economy_land_baron',
    name: 'Land Charter',
    pillar: 'economy',
    tier: 4,
    requires: 'economy_optics',
    description: 'Reduces all unowned Island purchase costs by 25%.',
  },
  {
    id: 'economy_golden_touch',
    name: 'Golden Touch',
    pillar: 'economy',
    tier: 5,
    requires: 'economy_land_baron',
    description: 'Every harvested node has a 25% chance to drop Gold Coins.',
  },

  // MAGIC & COMBAT
  {
    id: 'magic_swift',
    name: 'Battle Reflexes',
    pillar: 'magic',
    tier: 1,
    description: '+15% movement speed and -30% Dash cooldown.',
  },
  {
    id: 'magic_alchemy',
    name: 'Alchemy',
    pillar: 'magic',
    tier: 2,
    requires: 'magic_swift',
    description: 'Unlocks Alchemist Bombs & Crimson/Azure Potions.',
  },
  {
    id: 'magic_critical',
    name: 'Arcane Edge',
    pillar: 'magic',
    tier: 3,
    requires: 'magic_alchemy',
    description: '+25% weapon & rod damage and 20% Critical Hit chance (2x dmg).',
  },
  {
    id: 'magic_vitality',
    name: 'Heroic Resolve',
    pillar: 'magic',
    tier: 4,
    requires: 'magic_critical',
    description: '+40 Max HP and passive HP/Energy regeneration out of combat.',
  },
  {
    id: 'magic_archmage',
    name: 'Relic Resonance',
    pillar: 'magic',
    tier: 5,
    requires: 'magic_vitality',
    description: 'Bow & Dungeon Relic Rods fire 30% faster and deal +35% damage.',
  },
];
