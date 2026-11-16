import { describe, expect, it } from 'vitest';
import { gameState } from '../src/core/GameState';
import { ITEMS } from '../src/data/items';
import { HALF_ISLAND_AGGRO_PX, MONSTERS } from '../src/data/monsters';
import { applySafeKnockback } from '../src/entities/knockback';
import { periodicPerlinFbm2D, rollWeatherForBiome, rollWindForDay } from '../src/world/weatherRules';

describe('WeatherSystem biome & wind rules', () => {
  it('rolls only biome-appropriate weather across days', () => {
    for (let day = 1; day <= 40; day++) {
      expect(['sunny', 'cloudy', 'rain']).toContain(rollWeatherForBiome('grass', day));
      expect(['snow', 'cloudy', 'sunny']).toContain(rollWeatherForBiome('winter', day));
      expect(['sunny', 'cloudy', 'sandstorm']).toContain(rollWeatherForBiome('autumn', day));
      expect(['cloudy', 'rain', 'sunny']).toContain(rollWeatherForBiome('graveyard', day));
      expect(['cloudy', 'sunny', 'sandstorm']).toContain(rollWeatherForBiome('infernal', day));
    }
  });

  it('changes wind strength and direction across days', () => {
    const winds = Array.from({ length: 10 }, (_, idx) => rollWindForDay(idx + 1));
    const uniqueAngles = new Set(winds.map((w) => w.angle.toFixed(3)));
    const uniqueStrengths = new Set(winds.map((w) => w.strength.toFixed(2)));
    expect(uniqueAngles.size).toBeGreaterThan(5);
    expect(uniqueStrengths.size).toBeGreaterThan(5);
    for (const w of winds) {
      expect(w.strength).toBeGreaterThanOrEqual(0.45);
      expect(w.strength).toBeLessThanOrEqual(1.9);
      expect(Math.hypot(w.dirX, w.dirY)).toBeCloseTo(1, 5);
    }
  });

  it('produces tileable Perlin FBM cloud shadow values that wrap seamlessly', () => {
    for (let k = 0; k < 10; k++) {
      const t = k / 10;
      expect(periodicPerlinFbm2D(0, t, 4, 73)).toBeCloseTo(periodicPerlinFbm2D(1, t, 4, 73), 6);
      expect(periodicPerlinFbm2D(t, 0, 4, 73)).toBeCloseTo(periodicPerlinFbm2D(t, 1, 4, 73), 6);
    }
  });
});

describe('applySafeKnockback', () => {
  it('prevents player or monster knockback from pushing into water or obstacles', () => {
    // Walkable box: x in [100, 140], y in [100, 140]; outside is water/obstacle
    const isWalkable = (x: number, y: number) => x >= 100 && x <= 140 && y >= 100 && y <= 140;

    // Entity standing near right water shoreline at x=134 (pad=4 leaves max x=136 inside safe box)
    const entity = { x: 134, y: 120 };
    applySafeKnockback(entity, 1, 0, 12, isWalkable, 4);
    expect(entity.x).toBeLessThanOrEqual(136);
    expect(isWalkable(entity.x, entity.y)).toBe(true);
    expect(isWalkable(entity.x + 4, entity.y)).toBe(true);

    // Diagonal knockback near top shoreline slides safely along X without crossing top boundary
    const corner = { x: 120, y: 105 };
    applySafeKnockback(corner, 0.7, -0.7, 10, isWalkable, 4);
    expect(corner.y).toBeGreaterThanOrEqual(104);
    expect(corner.x).toBeGreaterThan(120);
    expect(isWalkable(corner.x, corner.y)).toBe(true);
  });
});

describe('Half-island monster aggro & ranged energy costs', () => {
  it('caps all non-boss monsters at HALF_ISLAND_AGGRO_PX', () => {
    for (const m of Object.values(MONSTERS)) {
      if (!m.isBoss) {
        expect(m.aggroRange).toBeLessThanOrEqual(HALF_ISLAND_AGGRO_PX);
      }
    }
  });

  it('requires positive EN for bow and all relic rods and respects magic_archmage discount', () => {
    gameState.reset('Sorcerer');
    for (const id of ['bow', 'necro_rod', 'thunder_rod', 'ice_rod', 'fire_rod']) {
      expect(ITEMS[id].energyCost).toBeGreaterThan(0);
      expect(gameState.getRangedEnergyCost(id)).toBeGreaterThan(0);
    }
    const baseFire = gameState.getRangedEnergyCost('fire_rod');
    gameState.unlockedSkills.add('magic_archmage');
    expect(gameState.getRangedEnergyCost('fire_rod')).toBeLessThan(baseFire);
  });
});
