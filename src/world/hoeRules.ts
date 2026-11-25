export type HoeTileReason =
  | 'out_of_bounds'
  | 'not_land'
  | 'already_fertile'
  | 'blocked_overlay'
  | 'blocked_entity';

export type HoeTileEvaluation = {
  valid: boolean;
  reason?: HoeTileReason;
};

/** Evaluates whether a world tile can be tilled into fertile dirt with a hoe. */
export function evaluateHoeTile(params: {
  tx: number;
  ty: number;
  worldTiles: number;
  isLandTile: boolean;
  overlay: string | undefined;
  hasBuilding: boolean;
  hasNode: boolean;
}): HoeTileEvaluation {
  const { tx, ty, worldTiles, isLandTile, overlay, hasBuilding, hasNode } = params;
  if (tx < 0 || ty < 0 || tx >= worldTiles || ty >= worldTiles) {
    return { valid: false, reason: 'out_of_bounds' };
  }
  if (!isLandTile) {
    return { valid: false, reason: 'not_land' };
  }
  if (overlay === 'dirt') {
    return { valid: false, reason: 'already_fertile' };
  }
  if (overlay && overlay !== 'none') {
    return { valid: false, reason: 'blocked_overlay' };
  }
  if (hasBuilding || hasNode) {
    return { valid: false, reason: 'blocked_entity' };
  }
  return { valid: true };
}
