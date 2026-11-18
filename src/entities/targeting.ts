export const COS_45_DEG = Math.SQRT1_2;

export interface AimCandidate<T> {
  item: T;
  x: number;
  y: number;
  /** Higher priority wins regardless of distance (e.g. enemy > node/animal > interactable > npc). */
  priority: number;
}

export interface AimMatch<T> {
  item: T;
  dist: number;
}

/**
 * Selects the highest-priority, closest candidate within `maxDist` and within
 * `minDot` (default cos(45 deg) ~= 0.7071) of the facing/aim direction (nx, ny).
 */
export function selectBestAimTarget<T>(
  px: number,
  py: number,
  nx: number,
  ny: number,
  maxDist: number,
  candidates: Iterable<AimCandidate<T>>,
  minDot = COS_45_DEG,
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
    if (dist > maxDist) continue;
    if (dist > 1e-4) {
      const dot = (dx * fx + dy * fy) / dist;
      if (dot < minDot) continue;
    }
    if (!best || c.priority > bestPriority || (c.priority === bestPriority && dist < best.dist)) {
      best = { item: c.item, dist };
      bestPriority = c.priority;
    }
  }

  return best;
}
