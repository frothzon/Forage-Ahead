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
  minHearts?: number;
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
  {
    id: 'farmer_4',
    npcId: 'farmer',
    npcName: 'Farmer Bram',
    step: 4,
    title: 'Dune Harvest',
    description: 'Grow or gather 4 Harvest Pumpkins and slay 5 Sand Mummies in the eastern dunes.',
    prereqQuestId: 'farmer_3',
    voicePitch: 0.92,
    offerDialogue: [
      'Word from the caravan says {c:#ffbe76}Sunbleached Dunes{/c} grow the heartiest autumn gourds—if you can survive the tombs!',
      'Bring me {c:#ff9f43}4 Harvest Pumpkins{/c} and clear out {c:#ff6b6b}5 Sand Mummies{/c} prowling the sands.',
    ],
    progressDialogue: [
      'Plant {c:#ff9f43}Pumpkin Seeds{/c} on tilled soil and hunt {c:#ff6b6b}Sand Mummies{/c} across {c:#ffbe76}Sunbleached Dunes{/c}.',
    ],
    completeDialogue: [
      '{bounce}{c:#ffe066}Rich harvest and safer sands!{/c}{/bounce} Take these rare {c:#6ce5ff}Starfruit Seeds{/c} for your homestead.',
    ],
    objectives: [
      { id: 'pumpkins', type: 'collect', targetId: 'pumpkin', count: 4, label: 'Harvest Pumpkins' },
      { id: 'mummies', type: 'kill', targetId: 'Mummy', count: 5, label: 'Slay Sand Mummies' },
    ],
    waypoint: { gx: 3, gy: 3, label: 'Sunbleached Dunes' },
    rewards: { coins: 800, xp: 1200, items: [{ itemId: 'seed_starfruit', count: 2 }] },
  },
  {
    id: 'farmer_5',
    npcId: 'farmer',
    npcName: 'Farmer Bram',
    step: 5,
    title: 'Ember Rations',
    description: 'Bake 2 Starfruit Tarts and drive back 5 Hellhounds in Ember Wastes.',
    prereqQuestId: 'farmer_4',
    voicePitch: 0.92,
    offerDialogue: [
      'The northern frontier scouts need provisions that will not spoil near volcanic vents, and {c:#ff6b6b}{jiggle}Hellhounds{/jiggle}{/c} are stalking the crossings!',
      'Bake {c:#6ce5ff}2 Starfruit Tarts{/c} at a Bonfire and slay {c:#ff6b6b}5 Hellhounds{/c} in {c:#ff7b54}Ember Wastes{/c}.',
    ],
    progressDialogue: [
      'Combine {c:#6ce5ff}Starfruit{/c} and {c:#ffe066}Golden Wheat{/c} at a Bonfire for tarts, then thin the {c:#ff6b6b}Hellhound{/c} packs.',
    ],
    completeDialogue: [
      '{bounce}{c:#7ef29d}Hearty fare fit for cinder trails!{/c}{/bounce} Keep these {c:#ff6b6b}Crimson Potions{/c} and gold for the trials ahead.',
    ],
    objectives: [
      { id: 'tarts', type: 'collect', targetId: 'starfruit_tart', count: 2, label: 'Starfruit Tarts' },
      { id: 'hellhounds', type: 'kill', targetId: 'Hellhound', count: 5, label: 'Slay Hellhounds' },
    ],
    waypoint: { gx: 3, gy: 1, label: 'Ember Wastes' },
    rewards: { coins: 1300, xp: 2200, items: [{ itemId: 'potion_red', count: 4 }] },
  },
  {
    id: 'farmer_6',
    npcId: 'farmer',
    npcName: 'Farmer Bram',
    step: 6,
    title: 'Spire Sanctuary',
    description: 'Cull 4 Feral Owlbears and 4 Displacer Beasts inside the Void Spire and gather 8 Golden Sunflowers.',
    prereqQuestId: 'farmer_5',
    voicePitch: 0.92,
    offerDialogue: [
      'The {c:#c07dff}Void Spire{/c} beneath Emerald Origin has stirred up fierce beasts—{c:#ff6b6b}{jiggle}Feral Owlbears{/jiggle}{/c} and {c:#c07dff}Displacer Beasts{/c}!',
      'Thin out {c:#ff6b6b}4 Owlbears{/c} and {c:#c07dff}4 Displacer Beasts{/c} on the early Spire floors, and bring {c:#ffe066}8 Golden Sunflowers{/c} to brighten our valley.',
    ],
    progressDialogue: [
      'Enter the {c:#c07dff}Void Spire{/c} on Emerald Origin (Floors 1–5) for Owlbears and Displacer Beasts, and harvest {c:#ffe066}8 Sunflowers{/c}.',
    ],
    completeDialogue: [
      '{bounce}{c:#ffe066}Even the Void bends before a true homesteader!{/c}{/bounce} Take these Void Shards and my deepest gratitude, friend.',
    ],
    objectives: [
      { id: 'owlbears', type: 'kill', targetId: 'Owlbear', count: 4, label: 'Slay Feral Owlbears' },
      { id: 'displacers', type: 'kill', targetId: 'Displacer Beast', count: 4, label: 'Slay Displacer Beasts' },
      { id: 'sunflowers', type: 'collect', targetId: 'sunflower', count: 8, label: 'Golden Sunflowers' },
    ],
    waypoint: { gx: 2, gy: 2, label: 'Emerald Origin' },
    rewards: { coins: 1800, xp: 3000, items: [{ itemId: 'void_shard', count: 2 }] },
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
  {
    id: 'fisherman_4',
    npcId: 'fisherman',
    npcName: 'Old Barnaby',
    step: 4,
    title: 'Glacial Catch',
    description: 'Reel in 4 Frost Salmon from Winter shores and defeat 5 Frost Salamanders.',
    prereqQuestId: 'fisherman_3',
    voicePitch: 0.85,
    offerDialogue: [
      'Now that the northern ice lanes are open, prized {c:#8ae6ff}{bounce}Frost Salmon{/bounce}{/c} are running off the winter coves!',
      'Land {c:#8ae6ff}4 Frost Salmon{/c} and drive back {c:#ff6b6b}5 Frost Salamanders{/c} around {c:#8ae6ff}Frostwind Ridge{/c}.',
    ],
    progressDialogue: [
      'Cast along {c:#8ae6ff}Winter{/c} shorelines for {c:#8ae6ff}Frost Salmon{/c} and keep warm while fighting {c:#ff6b6b}Frost Salamanders{/c}!',
    ],
    completeDialogue: [
      '{bounce}{c:#8ae6ff}Crisp, silver-scaled beauties!{/c}{/bounce} Here is a chest of harbor coin and Azure Tonics for your pack.',
    ],
    objectives: [
      { id: 'frost_salmon', type: 'collect', targetId: 'frost_salmon', count: 4, label: 'Frost Salmon' },
      { id: 'salamanders', type: 'kill', targetId: 'Frost Salamander', count: 5, label: 'Slay Frost Salamanders' },
    ],
    waypoint: { gx: 1, gy: 0, label: 'Frostwind Ridge' },
    rewards: { coins: 900, xp: 1500, items: [{ itemId: 'potion_blue', count: 3 }] },
  },
  {
    id: 'fisherman_5',
    npcId: 'fisherman',
    npcName: 'Old Barnaby',
    step: 5,
    title: 'Cinder Waters',
    description: 'Catch 3 Ember Koi near Infernal waters and defeat 5 Flame Demons.',
    prereqQuestId: 'fisherman_4',
    voicePitch: 0.85,
    offerDialogue: [
      'Only a salt with iron nerves casts into boiling surf! Off {c:#ff7b54}Scorched Oasis{/c}, radiant {c:#ff7b54}{roll}Ember Koi{/roll}{/c} swim beneath ash clouds.',
      'Hook {c:#ff7b54}3 Ember Koi{/c} and banish {c:#ff6b6b}5 Flame Demons{/c} guarding those volcanic shoals.',
    ],
    progressDialogue: [
      'Fish the Infernal waters around {c:#ff7b54}Scorched Oasis{/c} for {c:#ff7b54}3 Ember Koi{/c} and slay {c:#ff6b6b}5 Flame Demons{/c}.',
    ],
    completeDialogue: [
      '{bounce}{c:#ffe066}Ha! Scales glowing like forge coals!{/c}{/bounce} Take these Gold Ingots from an old shipwreck salvage.',
    ],
    objectives: [
      { id: 'ember_koi', type: 'collect', targetId: 'ember_koi', count: 3, label: 'Ember Koi' },
      { id: 'demons', type: 'kill', targetId: 'Demon', count: 5, label: 'Slay Flame Demons' },
    ],
    waypoint: { gx: 4, gy: 4, label: 'Scorched Oasis' },
    rewards: { coins: 1400, xp: 2400, items: [{ itemId: 'gold_ingot', count: 5 }] },
  },
  {
    id: 'fisherman_6',
    npcId: 'fisherman',
    npcName: 'Old Barnaby',
    step: 6,
    title: 'Emerald Wyrm Hunt',
    description: 'Reach Void Spire Floor 10 and defeat the Emerald Wyrm.',
    prereqQuestId: 'fisherman_5',
    voicePitch: 0.85,
    offerDialogue: [
      'Deep on {c:#7ef29d}Floor 10 of the Void Spire{/c}, a winged terror—the {c:#7ef29d}{jiggle}Emerald Wyrm{/jiggle}{/c}—calls down storms that rattle every mooring post!',
      'Descend to Floor 10 and slay the {c:#7ef29d}Young Green Dragon{/c} so our skies and seas stay calm.',
    ],
    progressDialogue: [
      'Climb down to {c:#c07dff}Void Spire Floor 10{/c} on Emerald Origin and bring down the {c:#7ef29d}Emerald Wyrm{/c}.',
    ],
    completeDialogue: [
      '{bounce}{c:#ffe066}The winds are gentle across every cove!{/c}{/bounce} You are the greatest mariner these isles have ever seen!',
    ],
    objectives: [
      { id: 'green_dragon', type: 'kill', targetId: 'Young Green Dragon', count: 1, label: 'Defeat Emerald Wyrm (Fl.10)' },
    ],
    waypoint: { gx: 2, gy: 2, label: 'Emerald Origin' },
    rewards: { coins: 2000, xp: 3200, items: [{ itemId: 'astral_essence', count: 2 }] },
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
  {
    id: 'blacksmith_4',
    npcId: 'blacksmith',
    npcName: 'Smith Garrick',
    step: 4,
    title: 'Tomb-Forged Steel',
    description: 'Prove mastery of Sunken Tomb and defeat 4 Anubis Guardians in the desert ruins.',
    prereqQuestId: 'blacksmith_3',
    voicePitch: 0.78,
    offerDialogue: [
      'Clearing the {c:#ffbe76}Sunken Tomb{/c} once is fine work, yet {c:#ff6b6b}Anubis Guardians{/c} still patrol the outer obelisks guarding ancient bronze alloys!',
      'Ensure {c:#ffe066}Sunken Tomb{/c} is conquered and strike down {c:#ff6b6b}4 Anubis Guardians{/c} so my desert steel stays unmatched.',
    ],
    progressDialogue: [
      'Hunt {c:#ff6b6b}Anubis Guardians{/c} on {c:#ffbe76}Sunken Tomb Isle{/c} or {c:#ffbe76}Sunbleached Dunes{/c} and verify the Tomb is cleared.',
    ],
    completeDialogue: [
      '{bounce}{c:#ffe066}Pure temple-tempered mettle!{/c}{/bounce} Take these Gold Ingots and steel yourself for the frozen north.',
    ],
    objectives: [
      { id: 'tomb_mastery', type: 'clear_dungeon', targetId: 'sunken_tomb' satisfies DungeonId, count: 1, label: 'Clear Sunken Tomb' },
      { id: 'anubis', type: 'kill', targetId: 'Anubis Warrior', count: 4, label: 'Slay Anubis Guardians' },
    ],
    waypoint: { gx: 4, gy: 2, label: 'Sunken Tomb Isle' },
    rewards: { coins: 950, xp: 1400, items: [{ itemId: 'gold_ingot', count: 4 }] },
  },
  {
    id: 'blacksmith_5',
    npcId: 'blacksmith',
    npcName: 'Smith Garrick',
    step: 5,
    title: 'Crown of the Frost King',
    description: 'Conquer Frost Cavern in the northern glaciers and defeat the Jotun Frost King.',
    prereqQuestId: 'blacksmith_4',
    voicePitch: 0.78,
    offerDialogue: [
      'Inside {c:#6ce5ff}Frost Cavern{/c}, the {c:#6ce5ff}{jiggle}Jotun Frost King{/jiggle}{/c} hoards glacial cores cold enough to quench dragonsteel!',
      'Breach {c:#6ce5ff}Frost Cavern{/c}, topple the Frost King, and claim the {c:#6ce5ff}{roll}Ice Rod{/roll}{/c}.',
    ],
    progressDialogue: [
      'Bring Fire Bombs or blazing heat into {c:#6ce5ff}Frost Cavern Isle{/c} and shatter the Jotun Frost King!',
    ],
    completeDialogue: [
      '{bounce}{c:#6ce5ff}By the roaring bellows—you felled the Frost King!{/c}{/bounce} Take these Frost Crystals for your kiln.',
    ],
    objectives: [
      { id: 'frost_cavern', type: 'clear_dungeon', targetId: 'frost_cavern' satisfies DungeonId, count: 1, label: 'Clear Frost Cavern' },
    ],
    waypoint: { gx: 2, gy: 0, label: 'Frost Cavern Isle' },
    rewards: { coins: 1450, xp: 2300, items: [{ itemId: 'crystal', count: 8 }] },
  },
  {
    id: 'blacksmith_6',
    npcId: 'blacksmith',
    npcName: 'Smith Garrick',
    step: 6,
    title: 'Crucible of Ignis',
    description: 'Clear Infernal Sanctum and defeat Ignis, Crimson Wyrm.',
    prereqQuestId: 'blacksmith_5',
    voicePitch: 0.78,
    offerDialogue: [
      'The ultimate test of a warrior’s edge lies inside {c:#ff6f3c}Infernal Sanctum{/c}, where {c:#ff6b6b}{jiggle}Ignis, Crimson Wyrm{/jiggle}{/c} slumbers over molten Obsidian.',
      'Conquer {c:#ff6f3c}Infernal Sanctum{/c} and claim the {c:#ff6f3c}{roll}Fire Rod{/roll}{/c} to shatter the Void Seal!',
    ],
    progressDialogue: [
      'Quench the vents inside {c:#ff6f3c}Infernal Sanctum{/c}, keep potions handy, and slay {c:#ff6b6b}Ignis{/c}!',
    ],
    completeDialogue: [
      '{bounce}{c:#ffe066}A Wyrmslayer stands before my anvil!{/c}{/bounce} Use this volcanic Obsidian to forge mythic arms for the Void Spire!',
    ],
    objectives: [
      { id: 'infernal_sanctum', type: 'clear_dungeon', targetId: 'infernal_sanctum' satisfies DungeonId, count: 1, label: 'Clear Infernal Sanctum' },
    ],
    waypoint: { gx: 4, gy: 0, label: 'Infernal Sanctum' },
    rewards: { coins: 1900, xp: 3100, items: [{ itemId: 'obsidian', count: 8 }] },
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
  {
    id: 'alchemist_4',
    npcId: 'alchemist',
    npcName: 'Alchemist Vesper',
    step: 4,
    title: 'Frostfire Distillation',
    description: 'Collect 10 Frost Crystals and 8 Obsidian for Vesper’s Void Spire harmonics.',
    prereqQuestId: 'alchemist_3',
    voicePitch: 1.15,
    offerDialogue: [
      'My cauldron is resonating with the rift beneath Emerald Origin! To stabilize an elixir of {c:#c07dff}{roll}pure duality{/roll}{/c}, fire and ice must meet.',
      'Bring me {c:#6ce5ff}10 Frost Crystals{/c} from Winter veins and {c:#a34de0}8 Obsidian{/c} from Infernal crags.',
    ],
    progressDialogue: [
      'Mine {c:#6ce5ff}Frost Crystals{/c} in Winter islands and {c:#a34de0}Obsidian{/c} in Infernal lands—{c:#6ce5ff}10{/c} and {c:#a34de0}8{/c} respectively.',
    ],
    completeDialogue: [
      '{roll}{c:#c07dff}Sublime equilibrium!{/c}{/roll} Look how the violet steam parts—take these potions and gold for the Spire.',
    ],
    objectives: [
      { id: 'crystals', type: 'collect', targetId: 'crystal', count: 10, label: 'Frost Crystals' },
      { id: 'obsidian', type: 'collect', targetId: 'obsidian', count: 8, label: 'Obsidian' },
    ],
    waypoint: { gx: 2, gy: 0, label: 'Frost Cavern Isle' },
    rewards: {
      coins: 1000,
      xp: 1600,
      items: [
        { itemId: 'potion_red', count: 3 },
        { itemId: 'potion_blue', count: 3 },
      ],
    },
  },
  {
    id: 'alchemist_5',
    npcId: 'alchemist',
    npcName: 'Alchemist Vesper',
    step: 5,
    title: 'Spire Warlord',
    description: 'Reach Void Spire Floor 5 and defeat Oni Shogun.',
    prereqQuestId: 'alchemist_4',
    voicePitch: 1.15,
    offerDialogue: [
      'The upper seal of the {c:#c07dff}Void Spire{/c} is guarded by a brutal warlord—{c:#ff6b6b}{jiggle}Oni Shogun{/jiggle}{/c} on Floor 5!',
      'Enter the Void Spire, break his guard on {c:#ffe066}Floor 5{/c}, and prove you are ready for the abyssal depths.',
    ],
    progressDialogue: [
      'Clear Infernal Sanctum to open the {c:#c07dff}Void Spire{/c} on Emerald Origin, then vanquish {c:#ff6b6b}Oni Shogun{/c} on Floor 5!',
    ],
    completeDialogue: [
      '{bounce}{c:#7ef29d}Magnificent!{/c}{/bounce} Even the Shogun’s demonic armor could not withstand your resolve. Take this Abyssal Core!',
    ],
    objectives: [
      { id: 'oni', type: 'kill', targetId: 'Oni', count: 1, label: 'Defeat Oni Shogun (Spire Fl.5)' },
    ],
    waypoint: { gx: 2, gy: 2, label: 'Emerald Origin' },
    rewards: { coins: 1400, xp: 2300, items: [{ itemId: 'abyssal_core', count: 1 }] },
  },
  {
    id: 'alchemist_6',
    npcId: 'alchemist',
    npcName: 'Alchemist Vesper',
    step: 6,
    title: 'Shatter the Void Sovereign',
    description: 'Reach Void Spire Floor 20 and slay Obsidian Sovereign, Vaelkor (Ancient Black Dragon).',
    prereqQuestId: 'alchemist_5',
    voicePitch: 1.15,
    offerDialogue: [
      'At the nadir of the {c:#c07dff}Void Spire—Floor 20{/c}—waits the ancient architect of the storm: {c:#ff6b6b}{jiggle}Obsidian Sovereign Vaelkor{/jiggle}{/c}!',
      'Forge your finest Void Altar gear, descend to Floor 20, and slay the {c:#c07dff}{roll}Ancient Black Dragon{/roll}{/c} once and for all!',
    ],
    progressDialogue: [
      'Equip mythic Lv.60 gear at your {c:#c07dff}Void Altar{/c} before challenging {c:#ff6b6b}Obsidian Sovereign Vaelkor{/c} on Floor 20!',
    ],
    completeDialogue: [
      '{bounce}{c:#ffe066}The Void Spire falls silent at last!{/c}{/bounce} Every star above the archipelago shines brighter for your triumph, hero!',
    ],
    objectives: [
      { id: 'vaelkor', type: 'kill', targetId: 'Ancient Black Dragon', count: 1, label: 'Slay Ancient Black Dragon (Fl.20)' },
    ],
    waypoint: { gx: 2, gy: 2, label: 'Emerald Origin' },
    rewards: { coins: 2500, xp: 4000, items: [{ itemId: 'celestial_scale', count: 2 }] },
  },

  // FRIENDSHIP-GATED PROCEDURAL VILLAGER QUESTS (minHearts: 2 or 3)
  {
    id: 'family_farmer_1',
    npcId: 'family_farmer',
    npcName: "Bram's Kin",
    step: 1,
    minHearts: 2,
    title: 'Meadow Pantry Surprise',
    description: 'Gather 8 Wild Berries and 4 Crisp Carrots for a secret homestead supper.',
    voicePitch: 1.24,
    offerDialogue: [
      'Since we are real friends now, can you keep a secret? I want to cook {c:#ffe066}Farmer Bram{/c} a surprise feast!',
      'Bring me {c:#ff8fab}8 Wild Berries{/c} and {c:#ff9f43}4 Crisp Carrots{/c} so I can bake a proper meadow tart.',
    ],
    progressDialogue: [
      'Still rounding up {c:#ff8fab}8 Wild Berries{/c} and {c:#ff9f43}4 Crisp Carrots{/c}? Check the hedgerows and carrot plots!',
    ],
    completeDialogue: [
      '{bounce}{c:#7ef29d}Yum! Just look at those colors!{/c}{/bounce} Bram is going to smile from ear to ear. Take this warm soup!',
    ],
    objectives: [
      { id: 'berries', type: 'collect', targetId: 'berries', count: 8, label: 'Wild Berries' },
      { id: 'carrot', type: 'collect', targetId: 'carrot', count: 4, label: 'Crisp Carrots' },
    ],
    waypoint: { gx: 2, gy: 1, label: 'Meadow Homestead' },
    rewards: { coins: 90, xp: 110, items: [{ itemId: 'pumpkin_soup', count: 2 }] },
  },
  {
    id: 'family_fisherman_1',
    npcId: 'family_fisherman',
    npcName: "Barnaby's Kin",
    step: 1,
    minHearts: 2,
    title: 'Harbor Smokehouse Stock',
    description: 'Bring 6 Fresh Fish and 10 Wood to help stock the pier smokehouse.',
    voicePitch: 1.1,
    offerDialogue: [
      'A trusted friend like you knows how hungry a harbor crew gets! Our smokehouse racks are running low.',
      'Haul in {c:#7ac7ff}6 Fresh Fish{/c} and chop {c:#c99b6b}10 Wood{/c} for smoking embers, and I will split the catch with you.',
    ],
    progressDialogue: [
      'We still need {c:#7ac7ff}6 Fresh Fish{/c} and {c:#c99b6b}10 Wood{/c} down at {c:#7ac7ff}Angler’s Pier{/c}.',
    ],
    completeDialogue: [
      '{bounce}{c:#7ac7ff}Now that smells like home!{/c}{/bounce} Here—take these prized {c:#e6b86e}Dune Catfish{/c} and gold from the pier jar.',
    ],
    objectives: [
      { id: 'fish', type: 'collect', targetId: 'fish', count: 6, label: 'Fresh Fish' },
      { id: 'wood', type: 'collect', targetId: 'wood', count: 10, label: 'Wood' },
    ],
    waypoint: { gx: 2, gy: 3, label: "Angler's Pier" },
    rewards: { coins: 95, xp: 120, items: [{ itemId: 'dune_catfish', count: 2 }] },
  },
  {
    id: 'family_blacksmith_1',
    npcId: 'family_blacksmith',
    npcName: "Garrick's Kin",
    step: 1,
    minHearts: 2,
    title: 'Apprentice Heat',
    description: 'Deliver 8 Iron Ore and 6 Coal to stoke the smithy side-hearth.',
    voicePitch: 0.88,
    offerDialogue: [
      'Garrick keeps the main anvil busy all day, so I only get forge time after sundown—if I have spare ore!',
      'Bring a friend {c:#9ec5ff}8 Iron Ore{/c} and {c:#cfd8e3}6 Coal{/c}, and I will trade you finished {c:#9ec5ff}Iron Ingots{/c}!',
    ],
    progressDialogue: [
      'Dark ore veins and coal seams yield plenty of {c:#9ec5ff}Iron Ore{/c} and {c:#cfd8e3}Coal{/c}. Come back when your pack is heavy!',
    ],
    completeDialogue: [
      '{bounce}Clean ore and dry coal—just what I needed!{/bounce} Here are {c:#9ec5ff}3 Iron Ingots{/c} quenched straight from my mold.',
    ],
    objectives: [
      { id: 'iron_ore', type: 'collect', targetId: 'iron_ore', count: 8, label: 'Iron Ore' },
      { id: 'coal', type: 'collect', targetId: 'coal', count: 6, label: 'Coal' },
    ],
    waypoint: { gx: 3, gy: 2, label: 'Amber Steppe' },
    rewards: { coins: 120, xp: 150, items: [{ itemId: 'iron_ingot', count: 3 }] },
  },
  {
    id: 'family_alchemist_1',
    npcId: 'family_alchemist',
    npcName: "Vesper's Ward",
    step: 1,
    minHearts: 2,
    title: 'Gel & Amber Distillate',
    description: 'Collect 6 Slime Cubes and 3 Desert Scales for evening reagent trials.',
    voicePitch: 1.2,
    offerDialogue: [
      'Vesper trusts me to stabilize the night cauldrons now, and you are one of the few people I trust to source clean reagents!',
      'Could you bring me {c:#5fe078}6 Slime Cubes{/c} and {c:#ffbe76}3 Desert Scales{/c}?',
    ],
    progressDialogue: [
      'Slimes drop {c:#5fe078}Slime Cubes{/c}, and desert Mummies carry {c:#ffbe76}Desert Scales{/c}. Handle them gently!',
    ],
    completeDialogue: [
      '{roll}{c:#c07dff}Fascinating luminescence!{/c}{/roll} Take these {c:#3b9eff}Azure Tonics{/c} from my first successful batch.',
    ],
    objectives: [
      { id: 'slime_gel', type: 'collect', targetId: 'slime_gel', count: 6, label: 'Slime Cubes' },
      { id: 'amber', type: 'collect', targetId: 'amber', count: 3, label: 'Desert Scales' },
    ],
    waypoint: { gx: 1, gy: 2, label: 'Misty Graveyard' },
    rewards: { coins: 130, xp: 165, items: [{ itemId: 'potion_blue', count: 2 }] },
  },
  {
    id: 'vagabond_1_1',
    npcId: 'vagabond_1',
    npcName: 'Frostline Scout',
    step: 1,
    minHearts: 2,
    title: 'Campfire Provisions',
    description: 'Gather 12 Wood and 3 Seared Steaks to keep a frontier scout warm.',
    voicePitch: 0.9,
    offerDialogue: [
      'Most islanders stay near their hearths, but you have the grit of a real pathfinder.',
      'Help me resupply before the frost squalls roll in: {c:#c99b6b}12 Wood{/c} and {c:#ff9f43}3 Seared Steaks{/c} will keep me moving.',
    ],
    progressDialogue: [
      'Grill {c:#ff9f43}Raw Meat{/c} over a Bonfire for {c:#ff9f43}Seared Steaks{/c}, and pack {c:#c99b6b}12 Wood{/c} for dry campfires.',
    ],
    completeDialogue: [
      '{bounce}{c:#7ef29d}Solid rations, traveler!{/c}{/bounce} Take these chilled {c:#8ae6ff}Frost Salmon{/c} I traded off a northern skiff.',
    ],
    objectives: [
      { id: 'wood', type: 'collect', targetId: 'wood', count: 12, label: 'Wood' },
      { id: 'cooked_meat', type: 'collect', targetId: 'cooked_meat', count: 3, label: 'Seared Steaks' },
    ],
    waypoint: { gx: 2, gy: 2, label: 'Emerald Origin' },
    rewards: { coins: 135, xp: 175, items: [{ itemId: 'frost_salmon', count: 2 }] },
  },
  {
    id: 'vagabond_2_1',
    npcId: 'vagabond_2',
    npcName: 'Cinder Pilgrim',
    step: 1,
    minHearts: 3,
    title: 'Frost & Ember Patrol',
    description: 'Slay 4 Hellhounds and bring 4 Frost Crystals to stabilize frontier shrines.',
    voicePitch: 1.08,
    offerDialogue: [
      'You have earned my deepest trust, friend. The outer wastes are restless—{c:#ff6b6b}{jiggle}Hellhounds{/jiggle}{/c} are stalking the crossings!',
      'Cull {c:#ff6b6b}4 Hellhounds{/c} and gather {c:#6ce5ff}4 Frost Crystals{/c} so I can ward our campfires against ember storms.',
    ],
    progressDialogue: [
      'Watch their leap in {c:#ff7b54}Ember Wastes{/c}! {c:#ff6b6b}4 Hellhounds{/c} and {c:#6ce5ff}4 Frost Crystals{/c} should calm the ridge.',
    ],
    completeDialogue: [
      '{bounce}{c:#ffe066}Remarkable nerve!{/c}{/bounce} Keep this volcanic {c:#a34de0}Obsidian{/c} and gold for the road ahead.',
    ],
    objectives: [
      { id: 'hellhound', type: 'kill', targetId: 'Hellhound', count: 4, label: 'Slay Hellhounds' },
      { id: 'crystal', type: 'collect', targetId: 'crystal', count: 4, label: 'Frost Crystals' },
    ],
    waypoint: { gx: 3, gy: 1, label: 'Ember Wastes' },
    rewards: { coins: 220, xp: 280, items: [{ itemId: 'obsidian', count: 3 }] },
  },
  {
    id: 'merchant_1_1',
    npcId: 'merchant_1',
    npcName: 'Guild Factor',
    step: 1,
    minHearts: 2,
    title: 'Caravan Hull Repairs',
    description: 'Supply 15 Wood and 6 Iron Ore to reinforce the Guild trade skiff.',
    voicePitch: 0.96,
    offerDialogue: [
      'Between trusted partners—a reef scrape rattled my skiff ribs last voyage, and Guild dock fees are daylight robbery!',
      'Bring me {c:#c99b6b}15 Wood{/c} and {c:#9ec5ff}6 Iron Ore{/c}, and I will pay top coin plus a pouch of {c:#ffe066}Gold Ore{/c}.',
    ],
    progressDialogue: [
      'Fifteen planks of {c:#c99b6b}Wood{/c} and {c:#9ec5ff}6 Iron Ore{/c} for rivets—catch me at whichever dock I am moored at!',
    ],
    completeDialogue: [
      '{bounce}{c:#ffe066}True Guild craftsmanship!{/c}{/bounce} My skiff will ride the swells smoother than ever. Here is your cut!',
    ],
    objectives: [
      { id: 'wood', type: 'collect', targetId: 'wood', count: 15, label: 'Wood' },
      { id: 'iron_ore', type: 'collect', targetId: 'iron_ore', count: 6, label: 'Iron Ore' },
    ],
    waypoint: { gx: 2, gy: 2, label: 'Emerald Origin' },
    rewards: { coins: 160, xp: 185, items: [{ itemId: 'gold_ore', count: 3 }] },
  },
  {
    id: 'merchant_2_1',
    npcId: 'merchant_2',
    npcName: 'Relic Appraiser',
    step: 1,
    minHearts: 3,
    title: 'Patron Ledger Order',
    description: 'Deliver 6 Gold Ore and 4 Desert Scales for a private Guild auction.',
    voicePitch: 1.1,
    offerDialogue: [
      'I only offer private commissions to patrons I truly trust. A collector on the mainland is bidding high for gilded desert relics!',
      'Source {c:#ffe066}6 Gold Ore{/c} and {c:#ffbe76}4 Desert Scales{/c} for my manifest, and the commission bonus is yours.',
    ],
    progressDialogue: [
      'Still filling the manifest? {c:#ffe066}6 Gold Ore{/c} and {c:#ffbe76}4 Desert Scales{/c}—every glint counts!',
    ],
    completeDialogue: [
      '{bounce}{c:#ffe066}Immaculate grade!{/c}{/bounce} Take these {c:#6ce5ff}Starfruit Tarts{/c} and a handsome 250-coin payout.',
    ],
    objectives: [
      { id: 'gold_ore', type: 'collect', targetId: 'gold_ore', count: 6, label: 'Gold Ore' },
      { id: 'amber', type: 'collect', targetId: 'amber', count: 4, label: 'Desert Scales' },
    ],
    waypoint: { gx: 2, gy: 1, label: 'Meadow Homestead' },
    rewards: { coins: 250, xp: 300, items: [{ itemId: 'starfruit_tart', count: 2 }] },
  },
];

export function getQuestById(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id);
}

export function getQuestsForNpc(npcId: string): QuestDef[] {
  return QUESTS.filter((q) => q.npcId === npcId).sort((a, b) => a.step - b.step);
}
