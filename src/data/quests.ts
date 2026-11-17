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
  voicePitch?: number;
  offerDialogue: string[];
  progressDialogue: string[];
  completeDialogue: string[];
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
    voicePitch: 0.92,
    offerDialogue: [
      'Well met, castaway! I saw your ship break apart on the southern reef. Glad the sea spared you!',
      'My pantry is running bare. If you can forage {c:#ff8fab}{bounce}10 Wild Berries{/bounce}{/c} from the bushes, I will gladly pay you in {c:#ffe066}Gold & Carrots{/c}!',
    ],
    progressDialogue: [
      'Still out foraging? Look for bright {c:#ff8fab}Berry Bushes{/c} across the grasslands—{c:#ffe066}10 Wild Berries{/c} should do the trick.',
    ],
    completeDialogue: [
      '{bounce}{c:#7ef29d}Splendid harvest!{/c}{/bounce} These berries will keep Meadow Homestead fed for a week. Take these coins and crisp carrots!',
    ],
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
    voicePitch: 0.92,
    offerDialogue: [
      'Foraging alone will not sustain a growing island! It is time you learned to {c:#7ef29d}{roll}till the soil{/roll}{/c}.',
      'Craft a {c:#ffe066}Farmer Hoe{/c} and plant {c:#ff9f43}2 Carrot Plots{/c} using the Build Menu. Watch them sprout!',
    ],
    progressDialogue: [
      'Open the Craft menu for a {c:#ffe066}Farmer Hoe{/c}, then place {c:#ff9f43}2 Carrot Plots{/c} on open grass.',
    ],
    completeDialogue: [
      '{bounce}Look at those tidy rows!{/bounce} You have the makings of a true homesteader. Here are some {c:#ffe066}Sunflowers{/c} for your fields!',
    ],
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
    voicePitch: 0.92,
    offerDialogue: [
      'Trouble in {c:#7ef29d}Whispering Woods{/c}! {c:#ff6b6b}{jiggle}Goblin Raiders{/jiggle}{/c} have been trampling the wildflower groves!',
      'Drive off {c:#ff6b6b}4 Goblins{/c} and bring me {c:#ffe066}4 Sunflowers{/c} so we can restore the meadow.',
    ],
    progressDialogue: [
      'Watch your footing in {c:#7ef29d}Whispering Woods{/c}. Those {c:#ff6b6b}Goblins{/c} strike fast, so keep your shield and potions ready!',
    ],
    completeDialogue: [
      'The meadow is safe and shining gold again! {c:#7ef29d}{bounce}You are a true guardian of the Isles!{/bounce}{/c}',
    ],
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
    voicePitch: 0.85,
    offerDialogue: [
      'Ahoy, young sailor! The tide is singing today, and the fish are biting near {c:#7ac7ff}{roll}rippling water spots{/roll}{/c}!',
      'Cast your line and reel in {c:#7ac7ff}{bounce}5 Fresh Fish{/bounce}{/c} for me, and I will share my best recipes.',
    ],
    progressDialogue: [
      'Keep your eye on the {c:#7ac7ff}bobber{/c}! Hold Space or Click to keep the green bar behind the fish.',
    ],
    completeDialogue: [
      '{bounce}{c:#ffe066}Ha! Fine catch!{/c}{/bounce} Nothing beats sea-salted fish fresh off the pier. Take these grilled fillets!',
    ],
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
    voicePitch: 0.85,
    offerDialogue: [
      'A smart angler lets the ocean work while they explore! Build a {c:#7ac7ff}Fish Trap{/c} right along the shoreline.',
      'Then roast {c:#ff9f43}3 Grilled Fish{/c} over a {c:#ffe066}Bonfire{/c} to keep your belly full on long voyages.',
    ],
    progressDialogue: [
      'Place a {c:#7ac7ff}Fish Trap{/c} on shallow water via the Build menu, and grill {c:#ff9f43}3 Fish{/c} at a Bonfire.',
    ],
    completeDialogue: [
      'Now your nets catch dinner while you swing your sword! Take this {c:#9ec5ff}Iron Ore{/c} I dredged up.',
    ],
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
    voicePitch: 0.85,
    offerDialogue: [
      'Dark scales have been spotted creeping out of {c:#a685e2}Hollow Fen{/c}... {c:#ff6b6b}{jiggle}Bog Lizardfolk{/jiggle}{/c}!',
      'Drive back {c:#ff6b6b}4 Lizardfolk{/c} before they foul the southern fishing grounds.',
    ],
    progressDialogue: [
      'Be wary in {c:#a685e2}Hollow Fen{/c}—those {c:#ff6b6b}Lizardfolk{/c} hit much harder than meadow slimes!',
    ],
    completeDialogue: [
      'Calm waters once again! {c:#7ac7ff}{bounce}Fair winds and full nets to you, friend!{/bounce}{/c}',
    ],
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
    voicePitch: 0.78,
    offerDialogue: [
      'Hah! Good timing—my bellows are roaring and my anvil is hungry for {c:#9ec5ff}hot steel{/c}!',
      'Smelt {c:#ffe066}4 Iron Ingots{/c} in a Furnace and bring them here. I will trade you rare {c:#ffe066}{bounce}Gold Ore{/bounce}{/c}!',
    ],
    progressDialogue: [
      'Mine Iron Ore from dark boulders, then feed it into a {c:#ff9f43}Furnace{/c} with Coal or Wood.',
    ],
    completeDialogue: [
      '{bounce}Fine, clean ingots!{/bounce} Not a slag bubble in sight. Here is your {c:#ffe066}Gold Ore{/c}, smith!',
    ],
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
    voicePitch: 0.78,
    offerDialogue: [
      'That rusty blade will shatter in the eastern dunes! Hammer yourself an {c:#9ec5ff}{roll}Iron Broadsword{/roll}{/c} at the Anvil.',
      'Then test its edge against {c:#ff6b6b}4 Sand Mummies{/c} prowling {c:#ffbe76}Sunbleached Dunes{/c}!',
    ],
    progressDialogue: [
      'Forge the {c:#9ec5ff}Iron Broadsword{/c} at an Anvil, then head south-east to test it on {c:#ff6b6b}Sand Mummies{/c}.',
    ],
    completeDialogue: [
      'Haha! Nothing rings sweeter than steel cutting ancient linen! Take this {c:#ffbe76}Amber{/c} for your trouble.',
    ],
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
    voicePitch: 0.78,
    offerDialogue: [
      'Deep beneath {c:#ffbe76}Sunken Tomb Isle{/c}, a monstrous {c:#c07dff}{jiggle}Purple Worm{/jiggle}{/c} guards a lost storm relic!',
      'Descend into the {c:#ffe066}Sunken Tomb{/c}, activate the floor sigils, and claim the {c:#7ac7ff}{roll}Thunder Rod{/roll}{/c}!',
    ],
    progressDialogue: [
      'Step on both glowing sigils inside {c:#ffbe76}Sunken Tomb{/c} to unseal the boss chamber. Stay light on your feet!',
    ],
    completeDialogue: [
      '{bounce}{c:#ffe066}By the Great Anvil, you felled the Leviathan!{/c}{/bounce} With this victory, the frozen north awaits!',
    ],
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
    voicePitch: 1.15,
    offerDialogue: [
      'Hush... do you hear the {c:#c07dff}{roll}arcane hum{/roll}{/c} beneath the fog? My cauldron needs marrow-dust!',
      'Bring me {c:#e8e0c8}6 Ancient Bones{/c} from the graveyard, and I will brew {c:#ff6b6b}Healing Potions{/c} for you.',
    ],
    progressDialogue: [
      'Skeletons drop {c:#e8e0c8}Ancient Bones{/c}, and you can also dig up relics from suspicious mounds.',
    ],
    completeDialogue: [
      '{roll}{c:#c07dff}Exquisite!{/c}{/roll} Pure calcium and lingering necromantic spark. Drink these crimson vials wisely!',
    ],
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
    voicePitch: 1.15,
    offerDialogue: [
      'The fog grows thicker! {c:#ff6b6b}{jiggle}Crypt Skeletons{/jiggle}{/c} and screeching {c:#c07dff}Dusk Bats{/c} are swarming my lab!',
      'Purge {c:#ff6b6b}5 Skeletons{/c} and {c:#c07dff}3 Bats{/c} so I can finish transmuting the Frostfire Compass.',
    ],
    progressDialogue: [
      'Use {c:#ffe066}[Space]{/c} to dash through enemy volleys and trigger a {c:#7ef29d}Dodge Crit{/c}!',
    ],
    completeDialogue: [
      'Silence returns to the headstones. Take these {c:#7ac7ff}{bounce}Frost Crystals{/bounce}{/c}—you will need them soon!',
    ],
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
    voicePitch: 1.15,
    offerDialogue: [
      'At last, the seal is cracked! Inside {c:#c07dff}Skull Crypt{/c}, {c:#ff6b6b}{jiggle}Arch-Lich Malakor{/jiggle}{/c} commands the undead.',
      'Banish the Lich and seize his {c:#c07dff}{roll}Necro Rod{/roll}{/c}. Only then will the northern mist yield!',
    ],
    progressDialogue: [
      'Malakor grows {c:#ff6b6b}{jiggle}enraged{/jiggle}{/c} at half health! Keep moving and strike between his shadow volleys.',
    ],
    completeDialogue: [
      '{bounce}{c:#7ef29d}Incredible!{/c}{/bounce} The Lich is undone, and the {c:#c07dff}Necro Rod{/c} answers to you now!',
    ],
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
