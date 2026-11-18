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
});
