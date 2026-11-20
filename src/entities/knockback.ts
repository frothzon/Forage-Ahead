/**
 * Moves `entity` up to `distance` pixels along `(knockX, knockY)` in small sub-steps,
 * guaranteeing it never enters water or becomes trapped inside solid obstacles.
 */
export function applySafeKnockback(
  entity: { x: number; y: number },
  knockX: number,
  knockY: number,
  distance: number,
  isWalkable?: (nx: number, ny: number) => boolean,
  pad = 4,
): void {
  const len = Math.hypot(knockX, knockY);
  if (len < 0.001 || distance <= 0) return;

  const dirX = knockX / len;
  const dirY = knockY / len;

  const isSpotSafe = (nx: number, ny: number): boolean => {
    if (!isWalkable) return true;
    return (
      isWalkable(nx, ny) &&
      isWalkable(nx + pad, ny) &&
      isWalkable(nx - pad, ny) &&
      isWalkable(nx, ny + pad) &&
      isWalkable(nx, ny - pad) &&
      isWalkable(nx + pad, ny + pad) &&
      isWalkable(nx - pad, ny + pad) &&
      isWalkable(nx + pad, ny - pad) &&
      isWalkable(nx - pad, ny - pad)
    );
  };

  if (!isWalkable) {
    entity.x += dirX * distance;
    entity.y += dirY * distance;
    return;
  }

  // If already slightly clipping, don't push deeper; allow moving only into clean walkable space
  const stepSize = 2;
  const steps = Math.ceil(distance / stepSize);
  for (let i = 0; i < steps; i++) {
    const step = i === steps - 1 ? distance - i * stepSize : stepSize;
    if (step <= 0) break;
    const dx = dirX * step;
    const dy = dirY * step;
    const nx = entity.x + dx;
    const ny = entity.y + dy;

    if (isSpotSafe(nx, ny)) {
      entity.x = nx;
      entity.y = ny;
    } else if (Math.abs(dx) > 0.01 && isSpotSafe(nx, entity.y)) {
      entity.x = nx;
    } else if (Math.abs(dy) > 0.01 && isSpotSafe(entity.x, ny)) {
      entity.y = ny;
    } else {
      break;
    }
  }
}
