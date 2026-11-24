export const COS_45_DEG = Math.SQRT1_2;
/** Default half-width of the player's cylinder cast from feet (16px total width). */
export const PLAYER_AIM_CYLINDER_RADIUS = 8;

export interface AimCandidate<T> {
  item: T;
  x: number;
  y: number;
  /** Higher priority wins regardless of distance (e.g. enemy > node/animal > interactable > npc). */
  priority: number;
  /** Optional collision radius of the candidate target. */
  radius?: number;
}

export interface AimMatch<T> {
  item: T;
  dist: number;
}

/**
 * Selects the highest-priority, closest candidate hit by a cylinder cast
 * (same width as the player, cast from feet along `(nx, ny)` up to `maxDist`)
 * or within the forward `minDot` cone (default cos(45 deg) ~= 0.7071).
 */
export function selectBestAimTarget<T>(
  px: number,
  py: number,
  nx: number,
  ny: number,
  maxDist: number,
  candidates: Iterable<AimCandidate<T>>,
  minDot = COS_45_DEG,
  cylinderRadius = PLAYER_AIM_CYLINDER_RADIUS,
): AimMatch<T> | null {
  const len = Math.hypot(nx, ny);
  if (len <= 1e-6) return null;
  const fx = nx / len;
  const fy = ny / len;

  let best: AimMatch<T> | null = null;
  let bestPriority = -Infinity;

  for (const c of candidates) {
    const dx = c.x - px;
    const dy = c.y - py;
    const dist = Math.hypot(dx, dy);
    const along = dx * fx + dy * fy;
    const perp = Math.abs(dx * -fy + dy * fx);
    const effRadius = cylinderRadius + (c.radius ?? 0);

    const inCylinder = along >= -Math.max(4, cylinderRadius * 0.5) && along <= maxDist && perp <= effRadius;
    const inCone = dist <= maxDist && (dist <= 1e-4 || along / dist >= minDot);
    if (!inCylinder && !inCone) continue;

    if (!best || c.priority > bestPriority || (c.priority === bestPriority && dist < best.dist)) {
      best = { item: c.item, dist };
      bestPriority = c.priority;
    }
  }

  return best;
}

export type CardinalFacing = 'up' | 'down' | 'left' | 'right';

const FACING_VECTORS: Record<CardinalFacing, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/**
 * Returns true when `(tx, ty)` lies within a forward directional cone (`dot >= minDot`)
 * of the actor at `(px, py)` facing `facing`. Always true if overlapping within 4px.
 */
export function isFacingTarget(
  px: number,
  py: number,
  facing: CardinalFacing,
  tx: number,
  ty: number,
  minDot = 0.35,
): boolean {
  const dx = tx - px;
  const dy = ty - py;
  const dist = Math.hypot(dx, dy);
  if (dist <= 4) return true;
  const [fx, fy] = FACING_VECTORS[facing];
  return (dx / dist) * fx + (dy / dist) * fy >= minDot;
}

/** Returns true when `itemId` identifies a sword weapon. */
export function isSwordItem(itemId: string | undefined | null): boolean {
  return Boolean(itemId && itemId.startsWith('sword'));
}

export interface SwordAutoTargetCandidate<T> {
  item: T;
  x: number;
  y: number;
  priority: number;
  radius?: number;
}

export interface SwordAutoTargetMatch<T> {
  item: T;
  x: number;
  y: number;
  dist: number;
  dirX: number | null;
  dirY: number | null;
  locked: boolean;
}

/**
 * Resolves 360-degree melee auto-targets for swords and maintains a target lock
 * until the locked target dies/leaves range, the player moves, or the lock is cleared.
 */
export class SwordAutoTargeter<T> {
  private lockedTarget: T | null = null;

  public getLockedTarget(): T | null {
    return this.lockedTarget;
  }

  public clear(): void {
    this.lockedTarget = null;
  }

  public onPlayerMoved(): void {
    this.lockedTarget = null;
  }

  public lock(target: T | null): void {
    this.lockedTarget = target;
  }

  public resolve(
    px: number,
    py: number,
    maxRange: number,
    candidates: Iterable<SwordAutoTargetCandidate<T>>,
    lockOnResolve = false,
  ): SwordAutoTargetMatch<T> | null {
    type Evaluated = { c: SwordAutoTargetCandidate<T>; dx: number; dy: number; dist: number };
    let lockedMatch: Evaluated | null = null;
    let best: Evaluated | null = null;

    for (const c of candidates) {
      const dx = c.x - px;
      const dy = c.y - py;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRange + (c.radius ?? 0)) continue;

      if (this.lockedTarget !== null && c.item === this.lockedTarget) {
        lockedMatch = { c, dx, dy, dist };
      }

      if (
        !best ||
        c.priority > best.c.priority ||
        (c.priority === best.c.priority && dist < best.dist)
      ) {
        best = { c, dx, dy, dist };
      }
    }

    if (lockedMatch) {
      return {
        item: lockedMatch.c.item,
        x: lockedMatch.c.x,
        y: lockedMatch.c.y,
        dist: lockedMatch.dist,
        dirX: lockedMatch.dist > 1e-4 ? lockedMatch.dx / lockedMatch.dist : null,
        dirY: lockedMatch.dist > 1e-4 ? lockedMatch.dy / lockedMatch.dist : null,
        locked: true,
      };
    }

    this.lockedTarget = null;
    if (!best) return null;

    if (lockOnResolve) {
      this.lockedTarget = best.c.item;
    }

    return {
      item: best.c.item,
      x: best.c.x,
      y: best.c.y,
      dist: best.dist,
      dirX: best.dist > 1e-4 ? best.dx / best.dist : null,
      dirY: best.dist > 1e-4 ? best.dy / best.dist : null,
      locked: lockOnResolve,
    };
  }
}
