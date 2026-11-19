import { describe, expect, it } from 'vitest';
import { selectBestAimTarget } from '../src/entities/targeting';

describe('selectBestAimTarget', () => {
  it('picks the closest target within 45 degrees of facing direction', () => {
    const match = selectBestAimTarget(0, 0, 1, 0, 50, [
      { item: 'far', x: 40, y: 10, priority: 2 },
      { item: 'near', x: 20, y: 5, priority: 2 },
      { item: 'outside_cone', x: 10, y: 20, priority: 2 }, // > 45 deg
      { item: 'behind', x: -10, y: 0, priority: 2 },
    ]);
    expect(match?.item).toBe('near');
  });

  it('rejects targets beyond maxDist or beyond 45 degrees', () => {
    const match = selectBestAimTarget(0, 0, 0, -1, 30, [
      { item: 'too_far', x: 0, y: -35, priority: 3 },
      { item: 'too_wide', x: 20, y: -15, priority: 3 }, // angle > 45 deg
    ]);
    expect(match).toBeNull();
  });

  it('prioritizes enemies over closer nodes and NPCs', () => {
    const match = selectBestAimTarget(0, 0, 1, 0, 50, [
      { item: 'npc', x: 8, y: 0, priority: 0 },
      { item: 'node', x: 14, y: 0, priority: 2 },
      { item: 'enemy', x: 35, y: 10, priority: 3 },
    ]);
    expect(match?.item).toBe('enemy');
  });

  it('treats NPCs as lowest priority', () => {
    const withNode = selectBestAimTarget(0, 0, 1, 0, 50, [
      { item: 'npc', x: 10, y: 0, priority: 0 },
      { item: 'node', x: 30, y: 0, priority: 2 },
    ]);
    expect(withNode?.item).toBe('node');

    const onlyNpc = selectBestAimTarget(0, 0, 1, 0, 50, [
      { item: 'npc', x: 10, y: 0, priority: 0 },
    ]);
    expect(onlyNpc?.item).toBe('npc');
  });

  it('eliminates the dead zone at the player feet using a player-width cylinder cast', () => {
    // Facing right (1, 0), target is 3px ahead and 7px to the side (outside 45deg cone, inside 8px cylinder radius)
    const sideFeet = selectBestAimTarget(0, 0, 1, 0, 40, [
      { item: 'feet_side', x: 3, y: 7, priority: 2 },
    ]);
    expect(sideFeet?.item).toBe('feet_side');

    // Target slightly overlapping player feet (-2px behind, 5px side) still connects
    const overlapFeet = selectBestAimTarget(0, 0, 0, 1, 40, [
      { item: 'feet_overlap', x: 5, y: -2, priority: 3 },
    ]);
    expect(overlapFeet?.item).toBe('feet_overlap');

    // Target clearly behind the player is still rejected
    const behind = selectBestAimTarget(0, 0, 1, 0, 40, [
      { item: 'behind_far', x: -10, y: 0, priority: 3 },
    ]);
    expect(behind).toBeNull();
  });
});
