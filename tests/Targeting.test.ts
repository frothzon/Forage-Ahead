import { describe, expect, it } from 'vitest';
import {
  isFacingTarget,
  isSwordItem,
  selectBestAimTarget,
  SwordAutoTargeter,
} from '../src/entities/targeting';

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

describe('isFacingTarget', () => {
  it('accepts targets in front or diagonally ahead and rejects side/behind targets', () => {
    expect(isFacingTarget(0, 0, 'right', 20, 0)).toBe(true);
    expect(isFacingTarget(0, 0, 'right', 20, 12)).toBe(true);
    expect(isFacingTarget(0, 0, 'up', 0, -24)).toBe(true);
    expect(isFacingTarget(0, 0, 'right', 0, 20)).toBe(false);
    expect(isFacingTarget(0, 0, 'right', -20, 0)).toBe(false);
    expect(isFacingTarget(0, 0, 'down', 0, -18)).toBe(false);
  });

  it('allows overlapping targets within 4px regardless of facing', () => {
    expect(isFacingTarget(10, 10, 'left', 12, 10)).toBe(true);
  });
});

describe('isSwordItem', () => {
  it('identifies sword items and rejects non-sword items', () => {
    expect(isSwordItem('sword')).toBe(true);
    expect(isSwordItem('sword_iron')).toBe(true);
    expect(isSwordItem('sword_sun')).toBe(true);
    expect(isSwordItem('sword_obsidian')).toBe(true);
    expect(isSwordItem('pickaxe')).toBe(false);
    expect(isSwordItem('bow')).toBe(false);
    expect(isSwordItem('')).toBe(false);
    expect(isSwordItem(undefined)).toBe(false);
  });
});

describe('SwordAutoTargeter', () => {
  it('picks the nearest enemy in 360-degree melee range including behind and to the side', () => {
    const targeter = new SwordAutoTargeter<{ id: string }>();
    const farFront = { id: 'farFront' };
    const side = { id: 'side' };
    const behind = { id: 'behind' };

    const match = targeter.resolve(0, 0, 46, [
      { item: farFront, x: 40, y: 0, priority: 3 },
      { item: side, x: 0, y: 28, priority: 3 },
      { item: behind, x: -18, y: 0, priority: 3 },
    ]);

    expect(match?.item).toBe(behind);
    expect(match?.dirX).toBeCloseTo(-1);
    expect(match?.dirY).toBeCloseTo(0);
    expect(match?.locked).toBe(false);
  });

  it('rejects enemies outside melee range', () => {
    const targeter = new SwordAutoTargeter<{ id: string }>();
    const tooFar = { id: 'tooFar' };
    const match = targeter.resolve(0, 0, 46, [{ item: tooFar, x: 47, y: 0, priority: 3 }]);
    expect(match).toBeNull();
  });

  it('stays locked on the locked target even when another enemy moves closer and updates aim vector', () => {
    const targeter = new SwordAutoTargeter<{ id: string }>();
    const first = { id: 'first' };
    const closer = { id: 'closer' };

    const initial = targeter.resolve(
      0,
      0,
      46,
      [
        { item: first, x: 20, y: 0, priority: 3 },
        { item: closer, x: 35, y: 0, priority: 3 },
      ],
      true,
    );
    expect(initial?.item).toBe(first);
    expect(initial?.locked).toBe(true);

    // Closer enemy moves to 10px while locked target moves to (0, -30)
    const next = targeter.resolve(0, 0, 46, [
      { item: first, x: 0, y: -30, priority: 3 },
      { item: closer, x: 10, y: 0, priority: 3 },
    ]);
    expect(next?.item).toBe(first);
    expect(next?.locked).toBe(true);
    expect(next?.dirX).toBeCloseTo(0);
    expect(next?.dirY).toBeCloseTo(-1);
  });

  it('retargets the nearest remaining enemy when the locked target leaves range or dies', () => {
    const targeter = new SwordAutoTargeter<{ id: string }>();
    const first = { id: 'first' };
    const second = { id: 'second' };

    targeter.lock(first);
    // Out of range
    const outOfRange = targeter.resolve(0, 0, 46, [
      { item: first, x: 60, y: 0, priority: 3 },
      { item: second, x: 25, y: 0, priority: 3 },
    ]);
    expect(outOfRange?.item).toBe(second);
    expect(outOfRange?.locked).toBe(false);

    // Removed from candidates (died)
    targeter.lock(first);
    const dead = targeter.resolve(0, 0, 46, [{ item: second, x: -20, y: 0, priority: 3 }]);
    expect(dead?.item).toBe(second);
    expect(dead?.locked).toBe(false);
  });

  it('clears the lock on onPlayerMoved so the nearest enemy in range is retargeted', () => {
    const targeter = new SwordAutoTargeter<{ id: string }>();
    const first = { id: 'first' };
    const closer = { id: 'closer' };

    targeter.lock(first);
    targeter.onPlayerMoved();

    const match = targeter.resolve(0, 0, 46, [
      { item: first, x: 35, y: 0, priority: 3 },
      { item: closer, x: 12, y: 0, priority: 3 },
    ]);
    expect(match?.item).toBe(closer);
    expect(match?.locked).toBe(false);
  });

  it('prioritizes enemies over closer animals when acquiring a new target', () => {
    const targeter = new SwordAutoTargeter<{ id: string }>();
    const animal = { id: 'animal' };
    const enemy = { id: 'enemy' };

    const match = targeter.resolve(0, 0, 46, [
      { item: animal, x: 8, y: 0, priority: 2 },
      { item: enemy, x: 38, y: 0, priority: 3 },
    ]);
    expect(match?.item).toBe(enemy);
  });
});
