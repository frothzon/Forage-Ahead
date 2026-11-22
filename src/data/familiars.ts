import type { HeroClassId } from '../core/GameState';

export interface FamiliarSpec {
  heroClass: HeroClassId;
  baseId: string;
  apexId: string;
  baseName: string;
  apexName: string;
  role: string;
  /** 'fox' uses heroes/Fox/* multi-sheet animations; 'cuterpg' uses manifest.familiars 3x4 sheets. */
  spriteKind: 'fox' | 'cuterpg';
  scale: number;
  attackStyle: 'melee' | 'ranged';
  projectileKey: string;
  projectileTint: number;
  apexTint: number;
  baseIconPath: string;
  apexIconPath: string;
  baseIconKey: string;
  apexIconKey: string;
  accentColor: string;
}

export const FAMILIAR_TIER_0_BASELINE = {
  flatDamage: 2,
  weaponScale: 0.1,
  cooldownMs: 3200,
  detectRange: 56,
  followDist: 48,
} as const;

export const CLASS_FAMILIARS: Record<HeroClassId, FamiliarSpec> = {
  Beastmaster: {
    heroClass: 'Beastmaster',
    baseId: 'beastmaster_base',
    apexId: 'beastmaster_apex',
    baseName: 'Wild Fox',
    apexName: 'Kitsune Spirit',
    role: 'Foraging, Loot Logistics & Flanking',
    spriteKind: 'fox',
    scale: 0.8,
    attackStyle: 'melee',
    projectileKey: 'projectiles/FaerieBall',
    projectileTint: 0xffe066,
    apexTint: 0xffdf80,
    baseIconPath: 'assets/familiars/beastmaster_base_icon.png',
    apexIconPath: 'assets/familiars/beastmaster_base_icon.png',
    baseIconKey: 'familiars/beastmaster_base_icon',
    apexIconKey: 'familiars/beastmaster_base_icon',
    accentColor: '#7be089',
  },
  Gladiator: {
    heroClass: 'Gladiator',
    baseId: 'gladiator_base',
    apexId: 'gladiator_apex',
    baseName: 'Obsidian Golem',
    apexName: 'Solar Colossus',
    role: 'Frontline Bruiser, Taunt & Sustain',
    spriteKind: 'cuterpg',
    scale: 0.95,
    attackStyle: 'melee',
    projectileKey: 'projectiles/FaerieBall',
    projectileTint: 0xffb347,
    apexTint: 0xffffff,
    baseIconPath: 'assets/familiars/gladiator_base_icon.png',
    apexIconPath: 'assets/familiars/gladiator_apex_icon.png',
    baseIconKey: 'familiars/gladiator_base_icon',
    apexIconKey: 'familiars/gladiator_apex_icon',
    accentColor: '#f08c65',
  },
  Sorcerer: {
    heroClass: 'Sorcerer',
    baseId: 'sorcerer_base',
    apexId: 'sorcerer_apex',
    baseName: 'Aether Orb',
    apexName: 'Astral Sovereign',
    role: 'Arcane Conduit, Energy & Spell Echo',
    spriteKind: 'cuterpg',
    scale: 0.95,
    attackStyle: 'ranged',
    projectileKey: 'projectiles/FaerieBall',
    projectileTint: 0x8be9fd,
    apexTint: 0xffffff,
    baseIconPath: 'assets/familiars/sorcerer_base_icon.png',
    apexIconPath: 'assets/familiars/sorcerer_apex_icon.png',
    baseIconKey: 'familiars/sorcerer_base_icon',
    apexIconKey: 'familiars/sorcerer_apex_icon',
    accentColor: '#cc8aff',
  },
  Swashbuckler: {
    heroClass: 'Swashbuckler',
    baseId: 'swashbuckler_base',
    apexId: 'swashbuckler_apex',
    baseName: 'Gale Sprite',
    apexName: 'Gilded Tempest',
    role: 'Skirmisher, Crit Marking & Plunder',
    spriteKind: 'cuterpg',
    scale: 0.95,
    attackStyle: 'ranged',
    projectileKey: 'projectiles/FaerieBall',
    projectileTint: 0xa3f7b5,
    apexTint: 0xffffff,
    baseIconPath: 'assets/familiars/swashbuckler_base_icon.png',
    apexIconPath: 'assets/familiars/swashbuckler_apex_icon.png',
    baseIconKey: 'familiars/swashbuckler_base_icon',
    apexIconKey: 'familiars/swashbuckler_apex_icon',
    accentColor: '#7be0ff',
  },
};

export function getFamiliarSpecForClass(heroClass: HeroClassId): FamiliarSpec {
  return CLASS_FAMILIARS[heroClass] ?? CLASS_FAMILIARS.Beastmaster;
}
