import { generateWfcRoomGraph, type WfcRoomGraph } from './WfcRoomGraph';

export type HouseThemeId = 'farmer' | 'blacksmith' | 'alchemist' | 'fisherman';

export type HouseRoomRole = 'foyer' | 'workshop' | 'bedroom';

export interface HouseRoomPlan {
  id: number;
  gx: number;
  gy: number;
  mask: number;
  role: HouseRoomRole;
  title: string;
}

export interface HouseLayout {
  theme: HouseThemeId;
  houseName: string;
  npcName: string;
  npcSpriteKey: string;
  floorTint: number;
  wallTint: number;
  accentTint: number;
  graph: WfcRoomGraph;
  rooms: HouseRoomPlan[];
}

export interface HouseThemeSpec {
  theme: HouseThemeId;
  houseName: string;
  npcName: string;
  npcSpriteKey: string;
  seed: number;
  minRooms: number;
  maxRooms: number;
  floorTint: number;
  wallTint: number;
  accentTint: number;
  roomTitles: Record<HouseRoomRole, string>;
}

export const HOUSE_THEME_SPECS: Record<HouseThemeId, HouseThemeSpec> = {
  farmer: {
    theme: 'farmer',
    houseName: "Farmer's Cottage",
    npcName: 'Barnaby the Farmer',
    npcSpriteKey: 'npcs/Medieval Townsfolk pack (bonus)/Farmer_idle',
    seed: 104729,
    minRooms: 3,
    maxRooms: 3,
    floorTint: 0xd9b382,
    wallTint: 0x8f623d,
    accentTint: 0x76b852,
    roomTitles: {
      foyer: 'Mudroom Foyer',
      workshop: 'Harvest Pantry',
      bedroom: 'Cozy Loft',
    },
  },
  blacksmith: {
    theme: 'blacksmith',
    houseName: "Blacksmith's Forge-Home",
    npcName: 'Garrick the Blacksmith',
    npcSpriteKey: 'npcs/Medieval Townsfolk pack (bonus)/Blacksmith_idle',
    seed: 229417,
    minRooms: 2,
    maxRooms: 3,
    floorTint: 0x9b8c82,
    wallTint: 0x52453e,
    accentTint: 0xe67e22,
    roomTitles: {
      foyer: 'Hearth Hall',
      workshop: 'Armory Workshop',
      bedroom: 'Smith Quarters',
    },
  },
  alchemist: {
    theme: 'alchemist',
    houseName: "Alchemist's Apothecary",
    npcName: 'Lyra the Alchemist',
    npcSpriteKey: 'npcs/Medieval Townsfolk pack (bonus)/Alchemist_idle',
    seed: 357893,
    minRooms: 3,
    maxRooms: 3,
    floorTint: 0xb7a6c9,
    wallTint: 0x5d4973,
    accentTint: 0x9b59b6,
    roomTitles: {
      foyer: 'Potion Parlor',
      workshop: 'Brewing Study',
      bedroom: 'Herb Conservatory',
    },
  },
  fisherman: {
    theme: 'fisherman',
    houseName: "Fisherman's Boathouse",
    npcName: 'Captain Marlowe',
    npcSpriteKey: 'npcs/Medieval Townsfolk pack (bonus)/Fisherman_idle',
    seed: 481237,
    minRooms: 2,
    maxRooms: 2,
    floorTint: 0xb59c7a,
    wallTint: 0x526b7d,
    accentTint: 0x3fa9f5,
    roomTitles: {
      foyer: 'Tackle Entryway',
      workshop: 'Chart & Bunk Room',
      bedroom: 'Captain Berth',
    },
  },
};

/**
 * Generates a deterministic 2-3 room interior layout for an NPC house using the shared WFC engine.
 */
export function buildHouseLayout(theme: HouseThemeId): HouseLayout {
  const spec = HOUSE_THEME_SPECS[theme];
  const graph = generateWfcRoomGraph({
    gridWidth: 9,
    gridHeight: 9,
    minRooms: spec.minRooms,
    maxRooms: spec.maxRooms,
    branchChance: 0.35,
    seed: spec.seed,
  });

  const sortedByDepth = [...graph.rooms].sort((a, b) => a.depth - b.depth || a.id - b.id);
  const rooms: HouseRoomPlan[] = sortedByDepth.map((r, idx) => {
    const role: HouseRoomRole = idx === 0 ? 'foyer' : idx === 1 ? 'workshop' : 'bedroom';
    return {
      id: r.id,
      gx: r.gx,
      gy: r.gy,
      mask: r.mask,
      role,
      title: spec.roomTitles[role],
    };
  });

  return {
    theme,
    houseName: spec.houseName,
    npcName: spec.npcName,
    npcSpriteKey: spec.npcSpriteKey,
    floorTint: spec.floorTint,
    wallTint: spec.wallTint,
    accentTint: spec.accentTint,
    graph,
    rooms,
  };
}
