import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import manifest from '../src/data/assetManifest.json';
import { CLASS_FAMILIARS, FAMILIAR_TIER_0_BASELINE } from '../src/data/familiars';
import { SKILLS } from '../src/data/skills';
import { gameState, type HeroClassId } from '../src/core/GameState';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const HERO_CLASSES: HeroClassId[] = ['Beastmaster', 'Gladiator', 'Sorcerer', 'Swashbuckler'];

describe('Class-Specific Familiar System', () => {
  beforeEach(() => {
    gameState.reset('Beastmaster');
  });

  it('extracts and registers all CuteRPG familiar spritesheets and UI icons', () => {
    const familiars = manifest.familiars as Record<
      string,
      {
        key: string;
        iconKey: string;
        frameWidth: number;
        frameHeight: number;
        cols: number;
        rows: number;
        feetOffset: number;
        rowOrder: Record<string, number>;
      }
    >;
    const images = manifest.images as Record<string, { path: string; width: number; height: number }>;

    const expectedIds = [
      'gladiator_base',
      'gladiator_apex',
      'sorcerer_base',
      'sorcerer_apex',
      'swashbuckler_base',
      'swashbuckler_apex',
    ];

    for (const id of expectedIds) {
      const spec = familiars[id];
      expect(spec, `Missing manifest.familiars entry for ${id}`).toBeDefined();
      expect(spec.cols).toBe(3);
      expect(spec.rows).toBe(4);
      expect(spec.rowOrder).toEqual({ down: 0, left: 1, right: 2, up: 3 });

      const sheetImg = images[spec.key];
      const iconImg = images[spec.iconKey];
      expect(sheetImg).toBeDefined();
      expect(iconImg).toBeDefined();
      expect(sheetImg.width).toBe(spec.frameWidth * 3);
      expect(sheetImg.height).toBe(spec.frameHeight * 4);
      expect(iconImg.width).toBe(spec.frameWidth);
      expect(iconImg.height).toBe(spec.frameHeight);
      expect(fs.existsSync(path.join(PUBLIC_DIR, sheetImg.path))).toBe(true);
      expect(fs.existsSync(path.join(PUBLIC_DIR, iconImg.path))).toBe(true);
    }

    expect(images['familiars/beastmaster_base_icon']).toBeDefined();
    expect(fs.existsSync(path.join(PUBLIC_DIR, images['familiars/beastmaster_base_icon'].path))).toBe(true);
  });

  it('defines 12-tier familiar skill trees (22 SP total) for all 4 classes', () => {
    const famSkills = SKILLS.filter((s) => s.pillar === 'familiar');
    expect(famSkills).toHaveLength(48);

    for (const cls of HERO_CLASSES) {
      const clsSkills = famSkills.filter((s) => s.heroClass === cls).sort((a, b) => a.tier - b.tier);
      expect(clsSkills).toHaveLength(12);
      expect(clsSkills.map((s) => s.tier)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      expect(clsSkills[0].minLevel).toBe(1);
      expect(clsSkills[11].minLevel).toBe(60);

      const totalSp = clsSkills.reduce((sum, s) => sum + (s.spCost ?? 1), 0);
      expect(totalSp).toBe(23);

      for (let i = 1; i < clsSkills.length; i++) {
        expect(clsSkills[i].requires).toBe(clsSkills[i - 1].id);
      }
      expect(CLASS_FAMILIARS[cls]).toBeDefined();
    }
  });

  it('starts every class at Tier 0 baseline and gates cross-class familiar skills', () => {
    for (const cls of HERO_CLASSES) {
      gameState.reset(cls);
      const prof = gameState.getFamiliarCombatProfile();
      expect(prof.tier).toBe(0);
      expect(prof.isApex).toBe(false);
      expect(prof.cooldownMs).toBe(FAMILIAR_TIER_0_BASELINE.cooldownMs);
      expect(prof.detectRange).toBe(FAMILIAR_TIER_0_BASELINE.detectRange);
      expect(prof.followDist).toBe(FAMILIAR_TIER_0_BASELINE.followDist);
    }

    gameState.reset('Gladiator');
    gameState.skillPoints = 5;
    expect(gameState.canUnlockSkill('fam_gl_t1')).toBe(true);
    expect(gameState.canUnlockSkill('fam_bm_t1')).toBe(false);
    expect(gameState.canUnlockSkill('fam_so_t1')).toBe(false);
    expect(gameState.canUnlockSkill('fam_sw_t1')).toBe(false);
  });

  it('applies passive familiar stat auras and T12 Apex evolution', () => {
    // Gladiator: Armor + Max HP + T12 Apex
    gameState.reset('Gladiator');
    const baseHp = gameState.getMaxHp();
    const baseArmor = gameState.getArmorDefense();
    gameState.level = 60;
    gameState.skillPoints = 23;
    for (let t = 1; t <= 12; t++) {
      expect(gameState.unlockSkill(`fam_gl_t${t}`)).toBe(true);
    }
    expect(gameState.getArmorDefense()).toBe(baseArmor + 18); // +2 +4 +12
    expect(gameState.getMaxHp()).toBe(Math.round((baseHp + (60 - 1) * 12 + 25 + 60) * 1.2));
    expect(gameState.getFamiliarCombatProfile().isApex).toBe(true);
    expect(gameState.getFamiliarCombatProfile().tier).toBe(12);

    // Sorcerer: Max Energy + Ranged Cost Reduction + Energy Regen
    gameState.reset('Sorcerer');
    const baseEnergy = gameState.getMaxEnergy();
    const baseRodCost = gameState.getRangedEnergyCost('fire_rod');
    gameState.level = 60;
    gameState.skillPoints = 23;
    for (let t = 1; t <= 12; t++) {
      expect(gameState.unlockSkill(`fam_so_t${t}`)).toBe(true);
    }
    expect(gameState.getMaxEnergy()).toBe(baseEnergy + (60 - 1) * 6 + 15 + 40 + 80);
    expect(gameState.getRangedEnergyCost('fire_rod')).toBeLessThan(baseRodCost);
    expect(gameState.getFamiliarEnergyRegenPerSec()).toBe(8);
  });

  it('grants enough SP by Level 60 (69 SP) to purchase every skill in all 5 pillars for every class', () => {
    for (const cls of HERO_CLASSES) {
      gameState.reset(cls);
      gameState.debugAddLevels(59); // Lv. 1 -> Lv. 60
      expect(gameState.level).toBe(60);
      expect(gameState.skillPoints).toBe(69);

      const classSkills = SKILLS.filter((s) => !s.heroClass || s.heroClass === cls).sort((a, b) => a.tier - b.tier);
      const totalCost = classSkills.reduce((sum, s) => sum + (s.spCost ?? 1), 0);
      expect(totalCost).toBe(69);

      for (const s of classSkills) {
        expect(gameState.unlockSkill(s.id), `Failed to unlock ${s.id} for ${cls}`).toBe(true);
      }
      expect(gameState.skillPoints).toBe(0);
    }
  });
});
