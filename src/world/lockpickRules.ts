export interface LockpickPinConfig {
  speed: number;
  sweetSpotHalf: number;
}

export const LOCKPICK_PINS: LockpickPinConfig[] = [
  { speed: 1.15, sweetSpotHalf: 0.15 },
  { speed: 1.5, sweetSpotHalf: 0.13 },
  { speed: 1.85, sweetSpotHalf: 0.11 },
];

export const LOCKPICK_MAX_ATTEMPTS = 3;
export const LOCKPICK_SHEAR_LINE = 0.5;

const PIN_MIN_POS = 0.05;
const PIN_MAX_POS = 0.95;

export interface LockpickState {
  pinIndex: number;
  pinPos: number;
  pinDir: 1 | -1;
  setPins: boolean[];
  attemptsLeft: number;
  status: 'active' | 'unlocked' | 'failed';
}

export function createLockpickState(): LockpickState {
  return {
    pinIndex: 0,
    pinPos: 0.12,
    pinDir: 1,
    setPins: LOCKPICK_PINS.map(() => false),
    attemptsLeft: LOCKPICK_MAX_ATTEMPTS,
    status: 'active',
  };
}

export function stepLockpickPin(state: LockpickState, dtSec: number): LockpickState {
  if (state.status !== 'active') return state;
  const cfg = LOCKPICK_PINS[state.pinIndex];
  if (!cfg) return state;

  let pinPos = state.pinPos + state.pinDir * cfg.speed * Math.max(0, dtSec);
  let pinDir: 1 | -1 = state.pinDir;

  while (pinPos > PIN_MAX_POS || pinPos < PIN_MIN_POS) {
    if (pinPos > PIN_MAX_POS) {
      pinPos = PIN_MAX_POS - (pinPos - PIN_MAX_POS);
      pinDir = -1;
    } else if (pinPos < PIN_MIN_POS) {
      pinPos = PIN_MIN_POS + (PIN_MIN_POS - pinPos);
      pinDir = 1;
    }
  }

  return {
    ...state,
    pinPos,
    pinDir,
  };
}

export function isPinInSweetSpot(state: LockpickState): boolean {
  if (state.status !== 'active') return false;
  const cfg = LOCKPICK_PINS[state.pinIndex];
  if (!cfg) return false;
  return Math.abs(state.pinPos - LOCKPICK_SHEAR_LINE) <= cfg.sweetSpotHalf;
}

export function attemptLockpickPin(state: LockpickState): {
  state: LockpickState;
  hit: boolean;
  unlocked: boolean;
  failed: boolean;
} {
  if (state.status !== 'active') {
    return {
      state,
      hit: false,
      unlocked: state.status === 'unlocked',
      failed: state.status === 'failed',
    };
  }

  if (isPinInSweetSpot(state)) {
    const nextSetPins = [...state.setPins];
    nextSetPins[state.pinIndex] = true;

    if (state.pinIndex + 1 >= LOCKPICK_PINS.length) {
      return {
        state: {
          ...state,
          setPins: nextSetPins,
          status: 'unlocked',
        },
        hit: true,
        unlocked: true,
        failed: false,
      };
    }

    return {
      state: {
        ...state,
        pinIndex: state.pinIndex + 1,
        pinPos: 0.12,
        pinDir: 1,
        setPins: nextSetPins,
      },
      hit: true,
      unlocked: false,
      failed: false,
    };
  }

  const nextAttempts = state.attemptsLeft - 1;
  if (nextAttempts <= 0) {
    return {
      state: {
        ...state,
        attemptsLeft: 0,
        status: 'failed',
      },
      hit: false,
      unlocked: false,
      failed: true,
    };
  }

  return {
    state: {
      ...state,
      attemptsLeft: nextAttempts,
    },
    hit: false,
    unlocked: false,
    failed: false,
  };
}
