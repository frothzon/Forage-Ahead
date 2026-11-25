import { describe, expect, it } from 'vitest';
import {
  LOCKPICK_MAX_ATTEMPTS,
  LOCKPICK_PINS,
  LOCKPICK_SHEAR_LINE,
  attemptLockpickPin,
  createLockpickState,
  isPinInSweetSpot,
  stepLockpickPin,
} from '../src/world/lockpickRules';
import { OUTDOOR_NPC_BUILDINGS } from '../src/world/OutdoorBuildingStamps';

describe('lockpickRules', () => {
  it('initializes with default active state', () => {
    const state = createLockpickState();
    expect(state.pinIndex).toBe(0);
    expect(state.pinPos).toBe(0.12);
    expect(state.pinDir).toBe(1);
    expect(state.setPins).toEqual(LOCKPICK_PINS.map(() => false));
    expect(state.attemptsLeft).toBe(LOCKPICK_MAX_ATTEMPTS);
    expect(state.status).toBe('active');
  });

  it('oscillates pinPos and bounces cleanly between 0.05 and 0.95', () => {
    let state = createLockpickState();
    // Advance toward upper bound 0.95
    state = stepLockpickPin(state, 0.7); // 0.12 + 1.15 * 0.7 = 0.925
    expect(state.pinPos).toBeCloseTo(0.925, 5);
    expect(state.pinDir).toBe(1);

    // Overshoot 0.95 and bounce back with pinDir = -1
    state = stepLockpickPin(state, 0.1); // 0.925 + 0.115 = 1.04 -> 0.95 - 0.09 = 0.86
    expect(state.pinPos).toBeCloseTo(0.86, 5);
    expect(state.pinDir).toBe(-1);

    // Move down past 0.05 and bounce back with pinDir = 1
    state = stepLockpickPin(state, 0.8); // 0.86 - 0.92 = -0.06 -> 0.05 + 0.11 = 0.16
    expect(state.pinPos).toBeCloseTo(0.16, 5);
    expect(state.pinDir).toBe(1);
    expect(state.pinPos).toBeGreaterThanOrEqual(0.05);
    expect(state.pinPos).toBeLessThanOrEqual(0.95);
  });

  it('detects sweet spot around shear line according to current pin config', () => {
    const base = createLockpickState();
    const half0 = LOCKPICK_PINS[0].sweetSpotHalf;
    expect(isPinInSweetSpot({ ...base, pinPos: LOCKPICK_SHEAR_LINE })).toBe(true);
    expect(isPinInSweetSpot({ ...base, pinPos: LOCKPICK_SHEAR_LINE + half0 - 0.001 })).toBe(true);
    expect(isPinInSweetSpot({ ...base, pinPos: LOCKPICK_SHEAR_LINE + half0 + 0.01 })).toBe(false);
    expect(isPinInSweetSpot({ ...base, status: 'unlocked', pinPos: LOCKPICK_SHEAR_LINE })).toBe(false);
  });

  it('unlocks after hitting all 3 pins in the sweet spot', () => {
    let state = createLockpickState();
    for (let i = 0; i < LOCKPICK_PINS.length; i++) {
      state = { ...state, pinPos: LOCKPICK_SHEAR_LINE };
      const res = attemptLockpickPin(state);
      state = res.state;
      expect(res.hit).toBe(true);
      expect(res.failed).toBe(false);
      if (i < LOCKPICK_PINS.length - 1) {
        expect(res.unlocked).toBe(false);
        expect(state.pinIndex).toBe(i + 1);
        expect(state.pinPos).toBe(0.12);
        expect(state.pinDir).toBe(1);
        expect(state.setPins[i]).toBe(true);
      } else {
        expect(res.unlocked).toBe(true);
        expect(state.status).toBe('unlocked');
        expect(state.setPins.every(Boolean)).toBe(true);
      }
    }
  });

  it('fails after 3 misses', () => {
    let state = { ...createLockpickState(), pinPos: 0.1 };
    for (let i = 1; i <= LOCKPICK_MAX_ATTEMPTS; i++) {
      const res = attemptLockpickPin(state);
      state = res.state;
      expect(res.hit).toBe(false);
      expect(res.unlocked).toBe(false);
      if (i < LOCKPICK_MAX_ATTEMPTS) {
        expect(res.failed).toBe(false);
        expect(state.attemptsLeft).toBe(LOCKPICK_MAX_ATTEMPTS - i);
        expect(state.status).toBe('active');
      } else {
        expect(res.failed).toBe(true);
        expect(state.attemptsLeft).toBe(0);
        expect(state.status).toBe('failed');
      }
    }
  });
});

describe('NPC House Stamps door & bedroom chest metadata', () => {
  const themes = ['farmer', 'blacksmith', 'alchemist', 'fisherman'] as const;

  it('gives every NPC house a horizontal unlocked front door, at least one locked bedroom door, vertical orientation for N/S-walled archways, and at least one bedroom chest', () => {
    for (const theme of themes) {
      const stamp = OUTDOOR_NPC_BUILDINGS[theme];
      const doors = stamp.placements.filter((p) => p.type === 'house_door');
      const wallSet = new Set(
        stamp.placements.filter((p) => p.type === 'house_wall').map((p) => `${p.lx},${p.ly}`),
      );

      const frontDoor = doors.find((d) => d.lx === stamp.doorLx && d.ly === stamp.doorLy);
      expect(frontDoor).toBeDefined();
      expect(frontDoor?.locked).toBe(false);
      expect(frontDoor?.orientation).toBe('horizontal');

      const lockedDoors = doors.filter((d) => d.locked === true);
      expect(lockedDoors.length).toBeGreaterThanOrEqual(1);

      for (const door of doors) {
        if (door.lx === stamp.doorLx && door.ly === stamp.doorLy) continue;
        const flankedNS =
          wallSet.has(`${door.lx},${door.ly - 1}`) || wallSet.has(`${door.lx},${door.ly + 1}`);
        if (flankedNS) {
          expect(door.orientation).toBe('vertical');
        } else {
          expect(door.orientation).toBe('horizontal');
        }
      }

      const bedroomChests = stamp.placements.filter(
        (p) => p.type === 'chest' && p.isBedroomChest === true,
      );
      expect(bedroomChests.length).toBeGreaterThanOrEqual(1);
    }
  });
});
