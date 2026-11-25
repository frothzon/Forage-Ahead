export interface GridPoint {
  tx: number;
  ty: number;
}

const CARDINAL_DIRS: readonly (readonly [number, number])[] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

/**
 * Computes a shortest 4-connected tile path from (startTx, startTy) to (goalTx, goalTy).
 * Always allows stepping onto the exact goal tile even if isPassable(goal) is false (e.g. a bed tile).
 * Returns an array of tiles excluding the start tile and ending with the goal tile (or [] if unreachable).
 */
export function computeTilePath(
  startTx: number,
  startTy: number,
  goalTx: number,
  goalTy: number,
  isPassable: (tx: number, ty: number) => boolean,
  maxVisited = 800,
): GridPoint[] {
  if (startTx === goalTx && startTy === goalTy) {
    return [{ tx: goalTx, ty: goalTy }];
  }
  if (maxVisited <= 0) {
    return [];
  }

  const startKey = `${startTx},${startTy}`;
  const parentByKey = new Map<string, string | null>([[startKey, null]]);
  const pointByKey = new Map<string, GridPoint>([[startKey, { tx: startTx, ty: startTy }]]);
  const queue: string[] = [startKey];
  let head = 0;

  while (head < queue.length) {
    const curKey = queue[head++];
    const cur = pointByKey.get(curKey)!;

    for (const [dx, dy] of CARDINAL_DIRS) {
      const nx = cur.tx + dx;
      const ny = cur.ty + dy;
      const nextKey = `${nx},${ny}`;
      if (parentByKey.has(nextKey)) continue;

      const isGoal = nx === goalTx && ny === goalTy;
      if (!isGoal && !isPassable(nx, ny)) continue;

      const nextPoint: GridPoint = { tx: nx, ty: ny };
      parentByKey.set(nextKey, curKey);
      pointByKey.set(nextKey, nextPoint);

      if (isGoal) {
        const path: GridPoint[] = [];
        let traceKey: string | null = nextKey;
        while (traceKey !== null && traceKey !== startKey) {
          path.push(pointByKey.get(traceKey)!);
          traceKey = parentByKey.get(traceKey) ?? null;
        }
        path.reverse();
        return path;
      }

      if (parentByKey.size >= maxVisited) {
        return [];
      }
      queue.push(nextKey);
    }
  }

  return [];
}
