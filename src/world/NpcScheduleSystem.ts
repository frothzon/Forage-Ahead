import { getIslandAt } from '../data/islands';
import type { DayPeriod, ProceduralNpcProfile } from '../data/proceduralNpcs';

export interface ScheduleResolveOptions {
  dayNumber: number;
  period: DayPeriod;
  isRaining: boolean;
  unlockedIslands: Array<{ gx: number; gy: number }>;
}

export interface ResolvedNpcScheduleTarget {
  targetGx: number;
  targetGy: number;
  offsetTx: number;
  offsetTy: number;
  activity: string;
  wantsSleep: boolean;
  wantsShelter: boolean;
}

export interface GossipCandidate {
  id: string;
  x: number;
  y: number;
  sleeping: boolean;
}

/**
 * Resolves the coarse Stardew-style day period from LightingSystem nightFactor
 * and optional normalized dayProgress01 ([0, 1)).
 *
 * LightingSystem reference:
 *   0.00..0.24 Dawn/Morning, 0.24..0.60 Midday, 0.60..0.74 Dusk/Evening, 0.74..1.00 Night.
 * OverworldScene considers nightFactor >= 0.45 to be night-time sleep hours.
 */
export function getDayPeriod(nightFactor: number, dayProgress01?: number): DayPeriod {
  if (dayProgress01 !== undefined && Number.isFinite(dayProgress01)) {
    const t =
      dayProgress01 < 0
        ? ((dayProgress01 % 1) + 1) % 1
        : dayProgress01 > 1
          ? dayProgress01 % 1
          : dayProgress01;

    if (nightFactor >= 0.45 || t >= 0.74) {
      return 'night';
    }
    if (t < 0.3) {
      return 'morning';
    }
    if (t < 0.6) {
      return 'midday';
    }
    return 'evening';
  }

  if (nightFactor >= 0.45) return 'night';
  if (nightFactor >= 0.15) return 'evening';
  if (nightFactor > 0.02) return 'morning';
  return 'midday';
}

function positiveMod(value: number, length: number): number {
  return ((value % length) + length) % length;
}

function getMerchantRotationOffset(profile: ProceduralNpcProfile): number {
  if (profile.id === 'merchant_1') return 0;
  if (profile.id === 'merchant_2') return 1;
  const match = /(\d+)$/.exec(profile.id);
  if (match) return Math.max(0, Number(match[1]) - 1);
  return 0;
}

function getVagabondRotationOffset(profile: ProceduralNpcProfile): number {
  if (profile.id === 'vagabond_1') return 0;
  if (profile.id === 'vagabond_2') return 1;
  const match = /(\d+)$/.exec(profile.id);
  if (match) return Math.max(0, Number(match[1]) - 1);
  return 0;
}

function selectVagabondIslandPool(
  unlockedIslands: Array<{ gx: number; gy: number }>,
): Array<{ gx: number; gy: number }> {
  if (unlockedIslands.length === 0) return [];

  const frontierTier: Array<{ gx: number; gy: number }> = [];
  const outerTier: Array<{ gx: number; gy: number }> = [];

  for (const coord of unlockedIslands) {
    const spec = getIslandAt(coord.gx, coord.gy);
    if (!spec) continue;
    if (spec.biome === 'winter' || spec.biome === 'infernal') {
      frontierTier.push(coord);
    }
    if (!spec.starterOwned) {
      outerTier.push(coord);
    }
  }

  if (frontierTier.length >= 2) {
    return frontierTier;
  }
  if (frontierTier.length === 1 && outerTier.length >= 2) {
    return outerTier;
  }
  if (outerTier.length >= 2) {
    return outerTier;
  }
  return unlockedIslands;
}

/**
 * Resolves a villager's active island, tile offset, activity, and shelter/sleep state
 * for the current day, time period, weather, and unlocked islands.
 */
export function resolveNpcScheduleTarget(
  profile: ProceduralNpcProfile,
  opts: ScheduleResolveOptions,
): ResolvedNpcScheduleTarget {
  const block =
    profile.schedule.find((b) => b.period === opts.period) ??
    profile.schedule[0] ?? {
      period: opts.period,
      activity: 'Idling near camp',
      offsetTx: 0,
      offsetTy: 0,
      indoorOnRain: true,
    };

  let targetGx = profile.homeIslandGx;
  let targetGy = profile.homeIslandGy;

  const dayInt = Math.floor(opts.dayNumber);
  const unlocked = opts.unlockedIslands;

  if (profile.category === 'merchant' && unlocked.length > 0) {
    const rotOffset = unlocked.length > 1 ? getMerchantRotationOffset(profile) : 0;
    const idx = positiveMod(dayInt + rotOffset, unlocked.length);
    targetGx = unlocked[idx].gx;
    targetGy = unlocked[idx].gy;
  } else if (profile.category === 'vagabond' && unlocked.length > 0) {
    const pool = selectVagabondIslandPool(unlocked);
    const twoDayStep = Math.floor(Math.max(0, dayInt - 1) / 2);
    const rotOffset = pool.length > 1 ? getVagabondRotationOffset(profile) : 0;
    const idx = positiveMod(twoDayStep + rotOffset, pool.length);
    targetGx = pool[idx].gx;
    targetGy = pool[idx].gy;
  }

  const wantsSleep = opts.period === 'night';
  const wantsShelter = wantsSleep || (opts.isRaining && block.indoorOnRain !== false);

  const offsetTx = wantsShelter ? 0 : block.offsetTx;
  const offsetTy = wantsShelter ? 0 : block.offsetTy;

  let activity = block.activity;
  if (!wantsSleep && opts.isRaining && wantsShelter) {
    activity = `Sheltering from rain (${block.activity})`;
  }

  return {
    targetGx,
    targetGy,
    offsetTx,
    offsetTy,
    activity,
    wantsSleep,
    wantsShelter,
  };
}

/**
 * Detects unordered pairs of awake villagers standing within maxDistPx of one another
 * so they can swap town gossip and rumors.
 */
export function findGossipPairs(
  positions: GossipCandidate[],
  maxDistPx = 48,
): Array<[string, string]> {
  if (maxDistPx < 0) return [];

  const awake = positions.filter(
    (p) => !p.sleeping && Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  const pairs: Array<[string, string]> = [];

  for (let i = 0; i < awake.length; i++) {
    const a = awake[i];
    for (let j = i + 1; j < awake.length; j++) {
      const b = awake[j];
      if (a.id === b.id) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) <= maxDistPx) {
        pairs.push([a.id, b.id]);
      }
    }
  }

  return pairs;
}

export const MIN_NPC_PERSONAL_SPACE_PX = 48;
export const ANCHOR_QUEST_GIVER_BUFFER_PX = 64;

export interface NpcSpacePeer {
  id: string;
  x: number;
  y: number;
  isAnchor?: boolean;
  sleeping?: boolean;
}

export interface NpcSeparationResult {
  dx: number; // normalized steering direction away from crowded peers (0 if not crowded)
  dy: number;
  crowded: boolean; // true if within required personal space of >= 1 awake peer
  nearestDist: number;
}

export interface WanderingAssignment {
  profileId: string;
  targetGx: number;
  targetGy: number;
  schedule: ResolvedNpcScheduleTarget;
}

function islandCoordKey(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

function hasAnchorQuestGiver(gx: number, gy: number): boolean {
  return Boolean(getIslandAt(gx, gy)?.npc);
}

/**
 * Coordinates wandering NPCs (merchants & vagabonds) across unlocked islands so at most
 * one wanderer visits any unlocked island on a given day. When fewer islands are unlocked
 * than total wanderers, rotates through an interleaved merchant/vagabond roster by dayNumber.
 */
export function assignWanderingNpcsToIslands(
  profiles: ProceduralNpcProfile[],
  opts: ScheduleResolveOptions,
): Map<string, WanderingAssignment> {
  const assignments = new Map<string, WanderingAssignment>();

  const uniqueUnlocked: Array<{ gx: number; gy: number }> = [];
  const unlockedKeys = new Set<string>();
  for (const island of opts.unlockedIslands) {
    const key = islandCoordKey(island.gx, island.gy);
    if (!unlockedKeys.has(key)) {
      unlockedKeys.add(key);
      uniqueUnlocked.push({ gx: island.gx, gy: island.gy });
    }
  }
  if (uniqueUnlocked.length === 0) return assignments;

  const wanderers = profiles.filter(
    (p) => p.category === 'merchant' || p.category === 'vagabond',
  );
  if (wanderers.length === 0) return assignments;

  const merchants = wanderers
    .filter((p) => p.category === 'merchant')
    .sort((a, b) => getMerchantRotationOffset(a) - getMerchantRotationOffset(b));
  const vagabonds = wanderers
    .filter((p) => p.category === 'vagabond')
    .sort((a, b) => getVagabondRotationOffset(a) - getVagabondRotationOffset(b));

  const ordered: ProceduralNpcProfile[] = [];
  const maxGroupLen = Math.max(merchants.length, vagabonds.length);
  for (let i = 0; i < maxGroupLen; i++) {
    if (i < merchants.length) ordered.push(merchants[i]);
    if (i < vagabonds.length) ordered.push(vagabonds[i]);
  }

  const dayInt = Number.isFinite(opts.dayNumber) ? Math.floor(opts.dayNumber) : 1;
  const startIdx = positiveMod(dayInt - 1, ordered.length);
  const rotated = [...ordered.slice(startIdx), ...ordered.slice(0, startIdx)];
  const selected = rotated.slice(0, Math.min(uniqueUnlocked.length, rotated.length));

  const occupiedIslandKeys = new Set<string>();

  for (const profile of selected) {
    const baseSchedule = resolveNpcScheduleTarget(profile, opts);
    const baseKey = islandCoordKey(baseSchedule.targetGx, baseSchedule.targetGy);

    const freeIslands = uniqueUnlocked.filter(
      (island) => !occupiedIslandKeys.has(islandCoordKey(island.gx, island.gy)),
    );
    const freeNonAnchorIslands = freeIslands.filter(
      (island) => !hasAnchorQuestGiver(island.gx, island.gy),
    );

    let assignedGx = baseSchedule.targetGx;
    let assignedGy = baseSchedule.targetGy;

    const baseIsUnlockedAndFree =
      unlockedKeys.has(baseKey) && !occupiedIslandKeys.has(baseKey);
    const baseIsNonAnchor = !hasAnchorQuestGiver(
      baseSchedule.targetGx,
      baseSchedule.targetGy,
    );

    if (
      !baseIsUnlockedAndFree ||
      (!baseIsNonAnchor && freeNonAnchorIslands.length > 0)
    ) {
      const candidatePool =
        freeNonAnchorIslands.length > 0 ? freeNonAnchorIslands : freeIslands;
      const preferredPool =
        profile.category === 'vagabond'
          ? selectVagabondIslandPool(candidatePool)
          : candidatePool;

      const rotStep =
        profile.category === 'vagabond'
          ? Math.floor(Math.max(0, dayInt - 1) / 2) +
            getVagabondRotationOffset(profile)
          : dayInt + getMerchantRotationOffset(profile);

      const chosen = preferredPool[positiveMod(rotStep, preferredPool.length)];
      assignedGx = chosen.gx;
      assignedGy = chosen.gy;
    }

    occupiedIslandKeys.add(islandCoordKey(assignedGx, assignedGy));
    assignments.set(profile.id, {
      profileId: profile.id,
      targetGx: assignedGx,
      targetGy: assignedGy,
      schedule: {
        ...baseSchedule,
        targetGx: assignedGx,
        targetGy: assignedGy,
      },
    });
  }

  return assignments;
}

/**
 * Returns the minimum required separation distance in pixels for an NPC peer.
 */
export function getRequiredNpcSeparationPx(
  peer: Pick<NpcSpacePeer, 'isAnchor'>,
): number {
  return peer.isAnchor
    ? ANCHOR_QUEST_GIVER_BUFFER_PX
    : MIN_NPC_PERSONAL_SPACE_PX;
}

/**
 * Checks whether a candidate (x, y) spot respects personal space around all awake peers.
 */
export function isSpotRespectingNpcSpace(
  x: number,
  y: number,
  selfId: string | undefined,
  peers: NpcSpacePeer[],
  minSpacePx = MIN_NPC_PERSONAL_SPACE_PX,
  anchorBufferPx = ANCHOR_QUEST_GIVER_BUFFER_PX,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

  for (const peer of peers) {
    if (peer.sleeping) continue;
    if (selfId !== undefined && peer.id === selfId) continue;
    if (!Number.isFinite(peer.x) || !Number.isFinite(peer.y)) continue;

    const reqDist = peer.isAnchor ? anchorBufferPx : minSpacePx;
    if (Math.hypot(x - peer.x, y - peer.y) < reqDist) {
      return false;
    }
  }

  return true;
}

/**
 * Computes a normalized separation steering vector pushing an NPC away from
 * any awake peers violating personal-space or anchor-buffer distances.
 */
export function computeNpcSeparationVector(
  self: { id: string; x: number; y: number },
  peers: NpcSpacePeer[],
  minSpacePx = MIN_NPC_PERSONAL_SPACE_PX,
  anchorBufferPx = ANCHOR_QUEST_GIVER_BUFFER_PX,
): NpcSeparationResult {
  if (!Number.isFinite(self.x) || !Number.isFinite(self.y)) {
    return { dx: 0, dy: 0, crowded: false, nearestDist: Infinity };
  }

  let pushX = 0;
  let pushY = 0;
  let crowded = false;
  let nearestDist = Infinity;

  for (const peer of peers) {
    if (peer.sleeping) continue;
    if (peer.id === self.id) continue;
    if (!Number.isFinite(peer.x) || !Number.isFinite(peer.y)) continue;

    const vx = self.x - peer.x;
    const vy = self.y - peer.y;
    const dist = Math.hypot(vx, vy);
    if (dist < nearestDist) {
      nearestDist = dist;
    }

    const reqDist = peer.isAnchor ? anchorBufferPx : minSpacePx;
    if (reqDist > 0 && dist < reqDist) {
      crowded = true;
      const weight = (reqDist - dist) / reqDist;
      if (dist < 0.001) {
        pushX += weight;
      } else {
        pushX += (vx / dist) * weight;
        pushY += (vy / dist) * weight;
      }
    }
  }

  if (!crowded) {
    return { dx: 0, dy: 0, crowded: false, nearestDist };
  }

  const mag = Math.hypot(pushX, pushY);
  if (mag > 1e-6) {
    return {
      dx: pushX / mag,
      dy: pushY / mag,
      crowded: true,
      nearestDist,
    };
  }

  return {
    dx: 1,
    dy: 0,
    crowded: true,
    nearestDist,
  };
}
