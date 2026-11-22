export const STUCK_FEAR_TIMEOUT_MS = 5000;
export const STUCK_MIN_PROGRESS_PX = 5;
export const FEAR_DURATION_MS = 3500;

export interface StuckFearState {
  anchorX: number;
  anchorY: number;
  stuckTimerMs: number;
  fearTimerMs: number;
}

export function createStuckFearState(x = 0, y = 0): StuckFearState {
  return {
    anchorX: x,
    anchorY: y,
    stuckTimerMs: 0,
    fearTimerMs: 0,
  };
}

/**
 * Updates stuck tracking while an enemy is chasing outside its attack range.
 * Returns true on the exact tick the enemy enters Fear mode (<= 5px progress over 5000ms).
 */
export function updateStuckFearTracker(
  state: StuckFearState,
  x: number,
  y: number,
  dtMs: number,
  isChasingOutOfRange: boolean,
): boolean {
  if (!isChasingOutOfRange) {
    state.stuckTimerMs = 0;
    state.anchorX = x;
    state.anchorY = y;
    return false;
  }

  if (state.stuckTimerMs === 0) {
    state.anchorX = x;
    state.anchorY = y;
  }
  state.stuckTimerMs += dtMs;

  const progress = Math.hypot(x - state.anchorX, y - state.anchorY);
  if (progress > STUCK_MIN_PROGRESS_PX) {
    state.anchorX = x;
    state.anchorY = y;
    state.stuckTimerMs = 0;
    return false;
  }

  if (state.stuckTimerMs >= STUCK_FEAR_TIMEOUT_MS) {
    state.stuckTimerMs = 0;
    state.fearTimerMs = FEAR_DURATION_MS;
    state.anchorX = x;
    state.anchorY = y;
    return true;
  }

  return false;
}
