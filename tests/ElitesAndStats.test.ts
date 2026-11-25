import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/GameState';
import {
  ELITE_GEAR_DROP_CHANCE,
  ELITE_SPAWN_CHANCE,
  computeEliteStats,
  rollEliteDrops,
} from '../src/data/eliteLoot';
import { ITEMS } from '../src/data/items';
import { MONSTERS } from '../src/data/monsters';

describe('Elites & Game Stats', () => {
  it('uses configured Elite spawn (1-5%) and gear drop (15-20%) rates', () => {
    expect(ELITE_SPAWN_CHANCE).toBeGreaterThanOrEqual(0.01);
    expect(ELITE_SPAWN_CHANCE).toBeLessThanOrEqual(0.05);
    expect(ELITE_GEAR_DROP_CHANCE).toBeGreaterThanOrEqual(0.15);
    expect(ELITE_GEAR_DROP_CHANCE).toBeLessThanOrEqual(0.2);
  });

  it('scales Elite stats above base monster stats', () => {
    const slime = MONSTERS.Slime;
    const elite = computeEliteStats(slime);
    expect(elite.maxHp).toBeGreaterThan(slime.maxHp * 2);
    expect(elite.damage).toBeGreaterThan(slime.damage);
    expect(elite.speed).toBeGreaterThan(slime.speed);
    expect(elite.xp).toBeGreaterThan(slime.xp);
    expect(elite.coins[0]).toBeGreaterThan(slime.coins[0]);
    expect(elite.coins[1]).toBeGreaterThan(slime.coins[1]);
  });

  it('rolls Elite gear drops when rng < ELITE_GEAR_DROP_CHANCE and valid rare items', () => {
    // Force gear roll (0.05 < 0.18) and 2 rare rolls
    const seqWithGear = [0.05, 0.1, 0.2, 0.3, 0.4];
    let idx = 0;
    const dropsWithGear = rollEliteDrops(5, () => seqWithGear[idx++ % seqWithGear.length]);
    expect(dropsWithGear.length).toBeGreaterThanOrEqual(2);
    expect(dropsWithGear.some((d) => Boolean(ITEMS[d.itemId]?.equipSlot))).toBe(true);
    for (const d of dropsWithGear) {
      expect(ITEMS[d.itemId]).toBeDefined();
      expect(d.count).toBeGreaterThan(0);
    }

    // Force no gear roll (0.95 >= 0.18)
    const seqNoGear = [0.95, 0.9, 0.5];
    let idx2 = 0;
    const dropsNoGear = rollEliteDrops(5, () => seqNoGear[idx2++ % seqNoGear.length]);
    expect(dropsNoGear.some((d) => Boolean(ITEMS[d.itemId]?.equipSlot))).toBe(false);
    expect(dropsNoGear.length).toBeGreaterThanOrEqual(1);
  });

  it('tracks monster kills, elites, bosses, and completion percentage in GameState', () => {
    const gs = new GameState();
    gs.reset('Beastmaster');
    const basePct = gs.getCompletionPercent();
    expect(basePct).toBeGreaterThanOrEqual(0);
    expect(basePct).toBeLessThan(100);

    gs.recordMonsterKill('Slime');
    gs.recordMonsterKill('Slime', { isElite: true });
    gs.recordMonsterKill('Lich', { isBoss: true });
    gs.recordDamageDealt(420);
    gs.recordStat('resourcesGathered', 7);
    gs.recordStat('fishCaught', 3);
    gs.addPlayTime(65000);

    expect(gs.stats.totalKills).toBe(3);
    expect(gs.stats.killsByMonster.Slime).toBe(2);
    expect(gs.stats.killsByMonster.Lich).toBe(1);
    expect(gs.stats.elitesKilled).toBe(1);
    expect(gs.stats.bossesKilled).toBe(1);
    expect(gs.stats.damageDealt).toBe(420);
    expect(gs.stats.resourcesGathered).toBe(7);
    expect(gs.stats.fishCaught).toBe(3);
    expect(gs.stats.playTimeMs).toBe(65000);

    gs.clearedDungeons.add('skull_crypt');
    gs.finalBossDefeated = true;
    const afterPct = gs.getCompletionPercent();
    expect(afterPct).toBeGreaterThan(basePct);
    expect(afterPct).toBeLessThanOrEqual(100);
  });
});
