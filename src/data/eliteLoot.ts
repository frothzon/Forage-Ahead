import { ITEMS, type ItemDef } from './items';
import type { MonsterDef } from './monsters';

export const ELITE_SPAWN_CHANCE = 0.03; // 3% (within 1-5% range)
export const ELITE_GEAR_DROP_CHANCE = 0.18; // 18% (within 15-20% range)
export const ELITE_HP_MULT = 2.75;
export const ELITE_DMG_MULT = 1.6;
export const ELITE_SPEED_MULT = 1.2;
export const ELITE_REWARD_MULT = 3;
export const ELITE_SCALE_MULT = 1.28;

export interface EliteScaledStats {
  maxHp: number;
  damage: number;
  speed: number;
  xp: number;
  coins: [number, number];
}

export function computeEliteStats(def: MonsterDef): EliteScaledStats {
  return {
    maxHp: Math.round(def.maxHp * ELITE_HP_MULT),
    damage: Math.round(def.damage * ELITE_DMG_MULT),
    speed: Math.round(def.speed * ELITE_SPEED_MULT),
    xp: Math.round(def.xp * ELITE_REWARD_MULT),
    coins: [
      Math.round(def.coins[0] * ELITE_REWARD_MULT),
      Math.round(def.coins[1] * ELITE_REWARD_MULT),
    ],
  };
}

function getEligibleEliteGear(monsterLevel: number): ItemDef[] {
  const allGear = Object.values(ITEMS).filter(
    (it) =>
      (it.equipSlot === 'weapon' || it.equipSlot === 'armor' || it.equipSlot === 'accessory') &&
      it.rarity !== 'relic',
  );
  const tiered = allGear.filter((it) => {
    const req = it.gearLevel ?? it.requiredLevel ?? 1;
    return req <= monsterLevel + 4 && req >= Math.max(1, monsterLevel - 6);
  });
  return tiered.length > 0 ? tiered : allGear;
}

function getEligibleRareItems(): ItemDef[] {
  return Object.values(ITEMS).filter(
    (it) =>
      !it.equipSlot &&
      it.category !== 'relic' &&
      (it.rarity === 'rare' || it.rarity === 'epic' || it.rarity === 'uncommon'),
  );
}

/**
 * Roll bonus loot for an Elite monster kill:
 * - 18% chance to drop an equippable gear piece scaled to monster level
 * - 1-2 rare/uncommon materials or consumables
 */
export function rollEliteDrops(
  monsterLevel: number,
  rng: () => number = Math.random,
): Array<{ itemId: string; count: number }> {
  const out: Array<{ itemId: string; count: number }> = [];

  if (rng() < ELITE_GEAR_DROP_CHANCE) {
    const gearPool = getEligibleEliteGear(monsterLevel);
    if (gearPool.length > 0) {
      const picked = gearPool[Math.floor(rng() * gearPool.length) % gearPool.length];
      out.push({ itemId: picked.id, count: 1 });
    }
  }

  const rarePool = getEligibleRareItems();
  if (rarePool.length > 0) {
    const rolls = rng() < 0.45 ? 2 : 1;
    for (let i = 0; i < rolls; i++) {
      const picked = rarePool[Math.floor(rng() * rarePool.length) % rarePool.length];
      out.push({ itemId: picked.id, count: 1 });
    }
  }

  return out;
}
