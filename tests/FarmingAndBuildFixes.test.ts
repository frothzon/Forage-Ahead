import { describe, expect, it, beforeEach } from 'vitest';
import { ITEMS } from '../src/data/items';
import { RECIPES } from '../src/data/recipes';
import { getMaxHarvestsForCrop, SPROUT_CROPS } from '../src/data/sproutCrops';
import { gameState } from '../src/core/GameState';
import { computeOverlayTile, type OverlayType } from '../src/world/AutoTiler';
import { evaluateHoeTile } from '../src/world/hoeRules';

describe('Farming overhaul & build fixes', () => {
  beforeEach(() => {
    gameState.reset('Beastmaster');
  });

  it('gives root crops 1 max harvest and multi-harvest crops > 1', () => {
    expect(getMaxHarvestsForCrop('crop_carrot')).toBe(1);
    expect(getMaxHarvestsForCrop('crop_sweet_carrot')).toBe(1);
    expect(getMaxHarvestsForCrop('crop_radish')).toBe(1);
    expect(getMaxHarvestsForCrop('crop_beet')).toBe(1);

    expect(getMaxHarvestsForCrop('crop_berries')).toBeGreaterThan(1);
    expect(getMaxHarvestsForCrop('crop_corn')).toBeGreaterThan(1);
    expect(getMaxHarvestsForCrop('crop_tomato')).toBeGreaterThan(1);

    const roots = SPROUT_CROPS.filter((c) => c.isRootCrop);
    expect(roots.map((r) => r.id).sort()).toEqual(['beet', 'radish', 'sweet_carrot']);
    for (const r of roots) {
      expect(r.maxHarvests).toBe(1);
    }
  });

  it('crafts seed items into inventory and hotbar with plantStructureType', () => {
    gameState.addItem('berries', 10);
    gameState.addItem('wood', 10);

    const carrotRecipe = RECIPES.find((r) => r.id === 'build_crop_carrot');
    expect(carrotRecipe).toBeDefined();
    expect(carrotRecipe?.station).toBe('hand');
    expect(carrotRecipe?.outputItemId).toBe('seed_carrot');

    expect(gameState.craftRecipe('build_crop_carrot')).toBe(true);
    expect(gameState.getItemCount('seed_carrot')).toBe(1);
    expect(gameState.hotbar.includes('seed_carrot')).toBe(true);
    expect(ITEMS.seed_carrot?.plantStructureType).toBe('crop_carrot');

    const cornRecipe = RECIPES.find((r) => r.id === 'build_crop_corn');
    expect(cornRecipe?.outputItemId).toBe('seed_corn');
    expect(ITEMS.seed_corn?.plantStructureType).toBe('crop_corn');
  });

  it('autotiles neighboring dirt tiles cleanly when soil disappears', () => {
    const grid: OverlayType[][] = [
      ['none', 'none', 'none', 'none'],
      ['none', 'dirt', 'dirt', 'none'],
      ['none', 'none', 'none', 'none'],
    ];
    const connectedLeft = computeOverlayTile(grid, 1, 1);
    expect(connectedLeft?.tilesetKey).toBe('sprout_tilled_dirt');

    // Right dirt tile decays back to 'none'
    grid[1][2] = 'none';
    expect(computeOverlayTile(grid, 2, 1)).toBeNull();
    const isolatedLeft = computeOverlayTile(grid, 1, 1);
    expect(isolatedLeft?.tilesetKey).toBe('sprout_tilled_dirt');
    expect(isolatedLeft?.frame).not.toBe(connectedLeft?.frame);
  });

  it('evaluates hoe fertile-soil target tiles accurately', () => {
    const base = {
      tx: 10,
      ty: 12,
      worldTiles: 40,
      isLandTile: true,
      overlay: 'none',
      hasBuilding: false,
      hasNode: false,
    };

    expect(evaluateHoeTile(base)).toEqual({ valid: true });
    expect(evaluateHoeTile({ ...base, overlay: undefined })).toEqual({ valid: true });
    expect(evaluateHoeTile({ ...base, overlay: 'dirt' })).toEqual({
      valid: false,
      reason: 'already_fertile',
    });
    expect(evaluateHoeTile({ ...base, overlay: 'road' })).toEqual({
      valid: false,
      reason: 'blocked_overlay',
    });
    expect(evaluateHoeTile({ ...base, overlay: 'bridge' })).toEqual({
      valid: false,
      reason: 'blocked_overlay',
    });
    expect(evaluateHoeTile({ ...base, isLandTile: false })).toEqual({
      valid: false,
      reason: 'not_land',
    });
    expect(evaluateHoeTile({ ...base, hasBuilding: true })).toEqual({
      valid: false,
      reason: 'blocked_entity',
    });
    expect(evaluateHoeTile({ ...base, hasNode: true })).toEqual({
      valid: false,
      reason: 'blocked_entity',
    });
    expect(evaluateHoeTile({ ...base, tx: -1 })).toEqual({
      valid: false,
      reason: 'out_of_bounds',
    });
    expect(evaluateHoeTile({ ...base, ty: 40 })).toEqual({
      valid: false,
      reason: 'out_of_bounds',
    });
  });
});
