export type BombKind = 'bomb' | 'bomb_fire' | 'bomb_frost' | 'bomb_void';

export interface BombSpec {
  id: BombKind;
  fuseMs: number;
  radius: number;
  damage: number;
  tint: number;
  ignitesBraziers: boolean;
  quenchesVents: boolean;
  slowsMs: number;
  clusterCount: number;
}

export const BOMB_SPECS: Record<BombKind, BombSpec> = {
  bomb: {
    id: 'bomb',
    fuseMs: 1100,
    radius: 56,
    damage: 45,
    tint: 0xffaa44,
    ignitesBraziers: false,
    quenchesVents: false,
    slowsMs: 0,
    clusterCount: 0,
  },
  bomb_fire: {
    id: 'bomb_fire',
    fuseMs: 1000,
    radius: 58,
    damage: 55,
    tint: 0xff6333,
    ignitesBraziers: true,
    quenchesVents: false,
    slowsMs: 0,
    clusterCount: 0,
  },
  bomb_frost: {
    id: 'bomb_frost',
    fuseMs: 1000,
    radius: 60,
    damage: 40,
    tint: 0x6ce5ff,
    ignitesBraziers: false,
    quenchesVents: true,
    slowsMs: 3500,
    clusterCount: 0,
  },
  bomb_void: {
    id: 'bomb_void',
    fuseMs: 1200,
    radius: 68,
    damage: 120,
    tint: 0xc77dff,
    ignitesBraziers: true,
    quenchesVents: false,
    slowsMs: 0,
    clusterCount: 3,
  },
};

export function isBombItem(itemId: string): itemId is BombKind {
  return Object.prototype.hasOwnProperty.call(BOMB_SPECS, itemId);
}

export function getBombSpec(itemId: string): BombSpec {
  return isBombItem(itemId) ? BOMB_SPECS[itemId] : BOMB_SPECS.bomb;
}
