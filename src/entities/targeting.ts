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
