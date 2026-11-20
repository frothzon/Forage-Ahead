export type DungeonThemeKey =
  | 'tutorial'
  | 'skull_crypt'
  | 'sunken_tomb'
  | 'frost_cavern'
  | 'infernal_sanctum'
  | 'void_spire';

export type DungeonPropKind = 'crate' | 'barrel' | 'urn' | 'crystal' | 'stalagmite' | 'bone_pile';

export interface PropDropEntry {
  itemId: string;
  count: [number, number];
  chance: number;
  isCoin?: boolean;
}

export interface DungeonPropSpec {
  kind: DungeonPropKind;
  sheet: 'cuterpg/dungeon' | 'cuterpg/grotto';
  frame: number;
  tint: number;
  hp: number;
  particleColor: number;
  breakKind: 'box' | 'pot';
  drops: PropDropEntry[];
}

export interface DungeonThemeVisuals {
  key: DungeonThemeKey;
  sheet: 'cuterpg/dungeon' | 'cuterpg/grotto';
  floorFrames: number[];
  floorTint: number;
  wallTopFrame: number;
  wallFrontFrame: number;
  wallVoidFrame: number;
  wallTint: number;
  rugFrame: number;
  rugTint: number;
  pillarTopFrame: number;
  pillarBaseFrame: number;
  pillarTint: number;
  torchSheet: 'cuterpg/dungeon_anim' | 'cuterpg/grotto';
  torchFrame: number;
  propPool: DungeonPropSpec[];
}

const dFrame = (col: number, row: number) => row * 32 + col;
const gFrame = (col: number, row: number) => row * 32 + col;
const daFrame = (col: number, row: number) => row * 12 + col;

const CRATE_SPEC = (tint = 0xffffff): DungeonPropSpec => ({
  kind: 'crate',
  sheet: 'cuterpg/dungeon',
  frame: dFrame(16, 6),
  tint,
  hp: 1,
  particleColor: 0xb8763e,
  breakKind: 'box',
  drops: [
    { itemId: 'coin', count: [2, 6], chance: 0.75, isCoin: true },
    { itemId: 'wood', count: [1, 3], chance: 0.55 },
    { itemId: 'berries', count: [1, 2], chance: 0.25 },
    { itemId: 'potion_red', count: [1, 1], chance: 0.14 },
  ],
});

const BARREL_SPEC = (tint = 0xffffff): DungeonPropSpec => ({
  kind: 'barrel',
  sheet: 'cuterpg/dungeon',
  frame: dFrame(18, 6),
  tint,
  hp: 1,
  particleColor: 0xa66938,
  breakKind: 'box',
  drops: [
    { itemId: 'coin', count: [2, 7], chance: 0.75, isCoin: true },
    { itemId: 'wood', count: [1, 2], chance: 0.45 },
    { itemId: 'potion_blue', count: [1, 1], chance: 0.16 },
    { itemId: 'berries', count: [1, 2], chance: 0.22 },
  ],
});

const URN_SPEC = (tint = 0xd9b382): DungeonPropSpec => ({
  kind: 'urn',
  sheet: 'cuterpg/dungeon',
  frame: dFrame(19, 8),
  tint,
  hp: 1,
  particleColor: 0xc9886b,
  breakKind: 'pot',
  drops: [
    { itemId: 'coin', count: [3, 8], chance: 0.8, isCoin: true },
    { itemId: 'stone', count: [1, 2], chance: 0.4 },
    { itemId: 'amber', count: [1, 1], chance: 0.2 },
    { itemId: 'potion_red', count: [1, 1], chance: 0.15 },
  ],
});

const BONE_PILE_SPEC = (tint = 0xe8e0d5): DungeonPropSpec => ({
  kind: 'bone_pile',
  sheet: 'cuterpg/dungeon',
  frame: dFrame(1, 12),
  tint,
  hp: 1,
  particleColor: 0xe6dec8,
  breakKind: 'pot',
  drops: [
    { itemId: 'bone', count: [1, 2], chance: 0.7 },
    { itemId: 'coin', count: [2, 5], chance: 0.6, isCoin: true },
    { itemId: 'coal', count: [1, 1], chance: 0.25 },
  ],
});

const CRYSTAL_SPEC = (tint = 0x9ee6ff): DungeonPropSpec => ({
  kind: 'crystal',
  sheet: 'cuterpg/grotto',
  frame: gFrame(27, 1),
  tint,
  hp: 2,
  particleColor: 0x7ae8ff,
  breakKind: 'pot',
  drops: [
    { itemId: 'crystal', count: [1, 2], chance: 0.6 },
    { itemId: 'stone', count: [1, 3], chance: 0.5 },
    { itemId: 'coin', count: [3, 8], chance: 0.6, isCoin: true },
  ],
});

const OBSIDIAN_ROCK_SPEC = (): DungeonPropSpec => ({
  kind: 'stalagmite',
  sheet: 'cuterpg/grotto',
  frame: gFrame(22, 1),
  tint: 0xff9e7a,
  hp: 2,
  particleColor: 0xff6b4a,
  breakKind: 'pot',
  drops: [
    { itemId: 'obsidian', count: [1, 2], chance: 0.55 },
    { itemId: 'iron_ore', count: [1, 2], chance: 0.4 },
    { itemId: 'coal', count: [1, 2], chance: 0.35 },
    { itemId: 'coin', count: [4, 10], chance: 0.65, isCoin: true },
  ],
});

export const DUNGEON_THEME_VISUALS: Record<DungeonThemeKey, DungeonThemeVisuals> = {
  tutorial: {
    key: 'tutorial',
    sheet: 'cuterpg/dungeon',
    floorFrames: [dFrame(0, 1), dFrame(0, 1), dFrame(0, 1), dFrame(1, 1), dFrame(2, 1), dFrame(0, 2)],
    floorTint: 0xffffff,
    wallTopFrame: dFrame(4, 0),
    wallFrontFrame: dFrame(4, 3),
    wallVoidFrame: dFrame(9, 1),
    wallTint: 0xffffff,
    rugFrame: dFrame(17, 1),
    rugTint: 0xd96b6b,
    pillarTopFrame: dFrame(6, 10),
    pillarBaseFrame: dFrame(6, 11),
    pillarTint: 0xffffff,
    torchSheet: 'cuterpg/dungeon_anim',
    torchFrame: daFrame(6, 0),
    propPool: [CRATE_SPEC(), BARREL_SPEC()],
  },
  skull_crypt: {
    key: 'skull_crypt',
    sheet: 'cuterpg/dungeon',
    floorFrames: [dFrame(0, 6), dFrame(0, 6), dFrame(0, 6), dFrame(1, 6), dFrame(2, 6), dFrame(0, 7)],
    floorTint: 0xcfc8e0,
    wallTopFrame: dFrame(4, 5),
    wallFrontFrame: dFrame(4, 8),
    wallVoidFrame: dFrame(9, 6),
    wallTint: 0xcfc8e0,
    rugFrame: dFrame(17, 1),
    rugTint: 0x9b6bd9,
    pillarTopFrame: dFrame(6, 10),
    pillarBaseFrame: dFrame(6, 11),
    pillarTint: 0xb0a8c8,
    torchSheet: 'cuterpg/dungeon_anim',
    torchFrame: daFrame(9, 0),
    propPool: [CRATE_SPEC(0xd0c8e0), BONE_PILE_SPEC(), URN_SPEC(0xb8b0c8)],
  },
  sunken_tomb: {
    key: 'sunken_tomb',
    sheet: 'cuterpg/dungeon',
    floorFrames: [dFrame(0, 1), dFrame(0, 1), dFrame(1, 1), dFrame(2, 1), dFrame(1, 2)],
    floorTint: 0xebd1a7,
    wallTopFrame: dFrame(4, 0),
    wallFrontFrame: dFrame(4, 3),
    wallVoidFrame: dFrame(9, 1),
    wallTint: 0xd9b882,
    rugFrame: dFrame(21, 1),
    rugTint: 0xf2c96b,
    pillarTopFrame: dFrame(6, 10),
    pillarBaseFrame: dFrame(6, 11),
    pillarTint: 0xe2c48c,
    torchSheet: 'cuterpg/dungeon_anim',
    torchFrame: daFrame(6, 0),
    propPool: [URN_SPEC(0xebcf94), BARREL_SPEC(0xe0c492), BONE_PILE_SPEC(0xebdec0)],
  },
  frost_cavern: {
    key: 'frost_cavern',
    sheet: 'cuterpg/grotto',
    floorFrames: [gFrame(2, 1), gFrame(2, 1), gFrame(2, 1), gFrame(1, 0), gFrame(4, 0)],
    floorTint: 0x9fd8f5,
    wallTopFrame: gFrame(10, 0),
    wallFrontFrame: gFrame(10, 3),
    wallVoidFrame: gFrame(10, 5),
    wallTint: 0x8bc8eb,
    rugFrame: gFrame(1, 0),
    rugTint: 0xbef2ff,
    pillarTopFrame: gFrame(7, 4),
    pillarBaseFrame: gFrame(7, 5),
    pillarTint: 0xaee6ff,
    torchSheet: 'cuterpg/dungeon_anim',
    torchFrame: daFrame(6, 0),
    propPool: [CRYSTAL_SPEC(0xb0f0ff), CRATE_SPEC(0xb2d8e8), BARREL_SPEC(0xa6cee0)],
  },
  infernal_sanctum: {
    key: 'infernal_sanctum',
    sheet: 'cuterpg/grotto',
    floorFrames: [gFrame(2, 1), gFrame(2, 1), gFrame(2, 1), gFrame(4, 0), gFrame(5, 0)],
    floorTint: 0xc97b70,
    wallTopFrame: gFrame(10, 0),
    wallFrontFrame: gFrame(10, 3),
    wallVoidFrame: gFrame(10, 5),
    wallTint: 0xa6544c,
    rugFrame: gFrame(16, 10),
    rugTint: 0xff8a5c,
    pillarTopFrame: gFrame(8, 4),
    pillarBaseFrame: gFrame(8, 5),
    pillarTint: 0xbf685c,
    torchSheet: 'cuterpg/grotto',
    torchFrame: gFrame(26, 10),
    propPool: [OBSIDIAN_ROCK_SPEC(), URN_SPEC(0xc96c5c), CRATE_SPEC(0xb5685a)],
  },
  void_spire: {
    key: 'void_spire',
    sheet: 'cuterpg/dungeon',
    floorFrames: [dFrame(0, 6), dFrame(0, 6), dFrame(1, 6), dFrame(1, 7), dFrame(2, 7)],
    floorTint: 0xb59ee6,
    wallTopFrame: dFrame(4, 5),
    wallFrontFrame: dFrame(4, 8),
    wallVoidFrame: dFrame(9, 6),
    wallTint: 0x8b70c4,
    rugFrame: dFrame(17, 1),
    rugTint: 0xc07dff,
    pillarTopFrame: dFrame(6, 10),
    pillarBaseFrame: dFrame(6, 11),
    pillarTint: 0xa488e0,
    torchSheet: 'cuterpg/dungeon_anim',
    torchFrame: daFrame(9, 0),
    propPool: [CRATE_SPEC(0xb39ce0), URN_SPEC(0xa88cd9), CRYSTAL_SPEC(0xd09eff)],
  },
};
