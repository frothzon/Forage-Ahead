import type { DungeonId } from './islands';

export type QuestObjectiveType = 'collect' | 'kill' | 'craft' | 'build' | 'clear_dungeon';

export interface QuestObjective {
  id: string;
  type: QuestObjectiveType;
  targetId: string;
  count: number;
  label: string;
}

export interface QuestWaypoint {
  gx: number;
  gy: number;
  label: string;
}

export interface QuestDef {
  id: string;
  npcId: string;
  npcName: string;
  step: number;
  title: string;
  description: string;
  prereqQuestId?: string;
  objectives: QuestObjective[];
  waypoint?: QuestWaypoint;
  rewards: {
    coins: number;
    xp: number;
    items?: Array<{ itemId: string; count: number }>;
  };
}

export const QUESTS: QuestDef[] = [
  // FARMER BRAM (Meadow Homestead: 2,1)
  {
    id: 'farmer_1',
    npcId: 'farmer',
    npcName: 'Farmer Bram',
    step: 1,
    title: 'Harvest Time',
    description: 'Gather Wild Berries for Meadow Homestead and return to Farmer Bram.',
    objectives: [{ id: 'berries', type: 'collect', targetId: 'berries', count: 10, label: 'Wild Berries' }],
    waypoint: { gx: 2, gy: 1, label: 'Meadow Homestead' },
    rewards: { coins: 65, xp: 80, items: [{ itemId: 'carrot', count: 5 }] },
  },
  {
    id: 'farmer_2',
    npcId: 'farmer',
    npcName: 'Farmer Bram',
    step: 2,
    title: 'Sowing the Land',
    description: 'Craft a Farmer Hoe and plant 2 Carrot Plots on your homestead.',
    prereqQuestId: 'farmer_1',
    objectives: [
      { id: 'hoe', type: 'craft', targetId: 'craft_hoe', count: 1, label: 'Craft Farmer Hoe' },
      { id: 'carrots', type: 'build', targetId: 'crop_carrot', count: 2, label: 'Plant Carrot Plots' },
    ],
    waypoint: { gx: 2, gy: 1, label: 'Meadow Homestead' },
    rewards: { coins: 110, xp: 140, items: [{ itemId: 'sunflower', count: 3 }] },
  },
  {
    id: 'farmer_3',
    npcId: 'farmer',
    npcName: 'Farmer Bram',
    step: 3,
    title: 'Golden Fields',
    description: 'Drive off Goblin Raiders and bring 4 Sunflowers to Farmer Bram.',
    prereqQuestId: 'farmer_2',
    objectives: [
      { id: 'goblins', type: 'kill', targetId: 'Goblin', count: 4, label: 'Slay Goblin Raiders' },
      { id: 'sunflowers', type: 'collect', targetId: 'sunflower', count: 4, label: 'Sunflowers' },
    ],
    waypoint: { gx: 1, gy: 1, label: 'Whispering Woods' },
    rewards: { coins: 175, xp: 220, items: [{ itemId: 'potion_red', count: 2 }] },
  },

  // OLD BARNABY (Angler's Pier: 2,3)
  {
    id: 'fisherman_1',
    npcId: 'fisherman',
    npcName: 'Old Barnaby',
    step: 1,
    title: 'Catch of the Day',
    description: 'Reel in 5 Fresh Fish from the ocean and bring them to Old Barnaby.',
    objectives: [{ id: 'fish', type: 'collect', targetId: 'fish', count: 5, label: 'Fresh Fish' }],
    waypoint: { gx: 2, gy: 3, label: "Angler's Pier" },
    rewards: { coins: 70, xp: 85, items: [{ itemId: 'cooked_fish', count: 3 }] },
  },
  {
    id: 'fisherman_2',
    npcId: 'fisherman',
    npcName: 'Old Barnaby',
    step: 2,
    title: 'Passive Nets',
    description: 'Build a Fish Trap on water and cook 3 Grilled Fish at a Bonfire.',
    prereqQuestId: 'fisherman_1',
    objectives: [
      { id: 'trap', type: 'build', targetId: 'fish_trap', count: 1, label: 'Build Fish Trap' },
      { id: 'cook', type: 'craft', targetId: 'cook_fish', count: 3, label: 'Cook Grilled Fish' },
    ],
    waypoint: { gx: 2, gy: 3, label: "Angler's Pier" },
    rewards: { coins: 120, xp: 150, items: [{ itemId: 'iron_ore', count: 6 }] },
  },
  {
    id: 'fisherman_3',
    npcId: 'fisherman',
    npcName: 'Old Barnaby',
    step: 3,
    title: 'Tides of the Bog',
    description: 'Thin out the Bog Lizardfolk threatening the southern waters.',
    prereqQuestId: 'fisherman_2',
    objectives: [
      { id: 'lizard', type: 'kill', targetId: 'Lizardfolk', count: 4, label: 'Slay Bog Lizardfolk' },
    ],
    waypoint: { gx: 1, gy: 3, label: 'Hollow Fen' },
    rewards: { coins: 185, xp: 230, items: [{ itemId: 'potion_blue', count: 2 }] },
  },

  // SMITH GARRICK (Amber Steppe: 3,2)
  {
    id: 'blacksmith_1',
    npcId: 'blacksmith',
    npcName: 'Smith Garrick',
    step: 1,
    title: 'Forge Ignition',
    description: 'Smelt 4 Iron Ingots in a Furnace and deliver them to Smith Garrick.',
    objectives: [{ id: 'iron', type: 'collect', targetId: 'iron_ingot', count: 4, label: 'Iron Ingots' }],
    waypoint: { gx: 3, gy: 2, label: 'Amber Steppe' },
    rewards: { coins: 85, xp: 110, items: [{ itemId: 'gold_ore', count: 6 }] },
  },
  {
    id: 'blacksmith_2',
    npcId: 'blacksmith',
    npcName: 'Smith Garrick',
    step: 2,
    title: 'Steel & Sinew',
    description: 'Forge an Iron Broadsword at the Anvil and defeat 4 Sand Mummies.',
    prereqQuestId: 'blacksmith_1',
    objectives: [
      { id: 'sword', type: 'craft', targetId: 'upgrade_sword_2', count: 1, label: 'Forge Iron Broadsword' },
      { id: 'mummy', type: 'kill', targetId: 'Mummy', count: 4, label: 'Slay Sand Mummies' },
    ],
    waypoint: { gx: 3, gy: 3, label: 'Sunbleached Dunes' },
    rewards: { coins: 150, xp: 190, items: [{ itemId: 'amber', count: 4 }] },
  },
  {
    id: 'blacksmith_3',
    npcId: 'blacksmith',
    npcName: 'Smith Garrick',
    step: 3,
    title: 'Sunken Relics',
    description: 'Conquer the Sunken Tomb in the eastern dunes and defeat its Leviathan.',
    prereqQuestId: 'blacksmith_2',
    objectives: [
      { id: 'tomb', type: 'clear_dungeon', targetId: 'sunken_tomb' satisfies DungeonId, count: 1, label: 'Clear Sunken Tomb' },
    ],
    waypoint: { gx: 4, gy: 2, label: 'Sunken Tomb Isle' },
    rewards: { coins: 260, xp: 350, items: [{ itemId: 'gold_ingot', count: 4 }] },
  },

  // ALCHEMIST VESPER (Misty Graveyard: 1,2)
  {
    id: 'alchemist_1',
    npcId: 'alchemist',
    npcName: 'Alchemist Vesper',
    step: 1,
    title: 'Crypt Reagents',
    description: 'Collect 6 Ancient Bones from skeletons or dig spots for Vesper.',
    objectives: [{ id: 'bone', type: 'collect', targetId: 'bone', count: 6, label: 'Ancient Bones' }],
    waypoint: { gx: 1, gy: 2, label: 'Misty Graveyard' },
    rewards: { coins: 95, xp: 120, items: [{ itemId: 'potion_red', count: 3 }] },
  },
  {
    id: 'alchemist_2',
    npcId: 'alchemist',
    npcName: 'Alchemist Vesper',
    step: 2,
    title: 'Graveyard Cleansing',
    description: 'Slay 5 Crypt Skeletons and 3 Dusk Bats in the graveyard.',
    prereqQuestId: 'alchemist_1',
    objectives: [
      { id: 'skel', type: 'kill', targetId: 'Skeleton', count: 5, label: 'Slay Crypt Skeletons' },
      { id: 'bat', type: 'kill', targetId: 'Bat', count: 3, label: 'Slay Dusk Bats' },
    ],
    waypoint: { gx: 1, gy: 2, label: 'Misty Graveyard' },
    rewards: { coins: 165, xp: 210, items: [{ itemId: 'crystal', count: 4 }] },
  },
  {
    id: 'alchemist_3',
    npcId: 'alchemist',
    npcName: 'Alchemist Vesper',
    step: 3,
    title: "Lich's Demise",
    description: 'Enter the Skull Crypt and defeat Arch-Lich Malakor.',
    prereqQuestId: 'alchemist_2',
    objectives: [
      { id: 'crypt', type: 'clear_dungeon', targetId: 'skull_crypt' satisfies DungeonId, count: 1, label: 'Clear Skull Crypt' },
    ],
    waypoint: { gx: 0, gy: 2, label: 'Skull Crypt Isle' },
    rewards: { coins: 280, xp: 380, items: [{ itemId: 'obsidian', count: 4 }] },
  },
];

export function getQuestById(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id);
}

export function getQuestsForNpc(npcId: string): QuestDef[] {
  return QUESTS.filter((q) => q.npcId === npcId).sort((a, b) => a.step - b.step);
}
