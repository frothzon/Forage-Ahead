import { ISLANDS, type IslandSpec } from './islands';
import { ITEMS } from './items';

export type NpcCategory = 'anchor' | 'family' | 'vagabond' | 'merchant';
export type DayPeriod = 'morning' | 'midday' | 'evening' | 'night';
export type NpcPersonaKey =
  | 'farmer'
  | 'fisherman'
  | 'blacksmith'
  | 'alchemist'
  | 'family'
  | 'vagabond'
  | 'merchant';

export interface GiftPreference {
  loved: string[];
  liked: string[];
  disliked: string[];
}

export interface NpcScheduleBlock {
  period: DayPeriod;
  activity: string;
  offsetTx: number;
  offsetTy: number;
  indoorOnRain?: boolean;
}

export interface NpcLore {
  role: string;
  home: string;
  ruler: string;
  crisis: string;
  item: string;
  rival: string;
  secret: string;
  rumor: string;
  customFact: string;
}

export interface NpcSecretReward {
  kind: 'coins' | 'item' | 'discount';
  amount?: number;
  itemId?: string;
  description: string;
}

export interface ProceduralNpcProfile {
  id: string;
  name: string;
  title: string;
  category: NpcCategory;
  spriteKey: string;
  personaKey: NpcPersonaKey;
  homeIslandGx: number;
  homeIslandGy: number;
  anchorNpcId?: string;
  relationLabel?: string;
  tint?: number;
  voicePitch: number;
  baselineMood: number[];
  driveWeights: Record<string, number>;
  gifts: GiftPreference;
  giftHint: string;
  lore: NpcLore;
  secretReward: NpcSecretReward;
  schedule: NpcScheduleBlock[];
  seed: number;
}

const SPRITE_BASE = 'npcs/Medieval Townsfolk pack (bonus)';

const SPRITES = {
  farmer: `${SPRITE_BASE}/Farmer_idle`,
  fisherman: `${SPRITE_BASE}/Fisherman_idle`,
  blacksmith: `${SPRITE_BASE}/Blacksmith_idle`,
  alchemist: `${SPRITE_BASE}/Alchemist_idle`,
  kid01: `${SPRITE_BASE}/Kid01_idle`,
  kid02: `${SPRITE_BASE}/Kid02_idle`,
  barmaid: `${SPRITE_BASE}/Barmaid_idle`,
  bartender: `${SPRITE_BASE}/Bartender_idle`,
  merchant: `${SPRITE_BASE}/Merchant_idle`,
} as const;

type Rng = () => number;

function hashSeedParts(...parts: Array<string | number>): number {
  let h = 2166136261 >>> 0;
  for (const part of parts) {
    const str = String(part);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 0xff;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function createRng(seed: number): Rng {
  let t = seed >>> 0 || 0x9e3779b9;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randFloat(rng: Rng, min: number, max: number, decimals = 2): number {
  const val = min + rng() * (max - min);
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

function randInt(rng: Rng, min: number, maxInclusive: number): number {
  return min + Math.floor(rng() * (maxInclusive - min + 1));
}

function pickOne<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}

function pickUniqueName(rng: Rng, pool: readonly string[], usedNames: Set<string>): string {
  const available = pool.filter((n) => !usedNames.has(n));
  const chosen = available.length > 0 ? pickOne(rng, available) : `${pickOne(rng, pool)} II`;
  usedNames.add(chosen);
  return chosen;
}

function shuffleWithRng<T>(rng: Rng, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function filterValidItems(ids: readonly string[]): string[] {
  return ids.filter((id) => Boolean(ITEMS[id]));
}

const GLOBAL_LOVED_FALLBACK = [
  'berries',
  'carrot',
  'corn',
  'wheat',
  'tomato',
  'cucumber',
  'pumpkin',
  'pink_rose',
  'blue_tulip',
  'sweet_carrot',
  'cauliflower',
  'eggplant',
  'cabbage',
  'radish',
  'beet',
  'starfruit_tart',
  'veggie_medley',
  'monster_omelet',
  'egg_slime',
  'egg_bat',
  'egg_mummy',
  'egg_salamander',
  'egg_hellhound',
  'fish',
  'dune_catfish',
  'cooked_meat',
  'iron_ore',
  'gold_ore',
  'coal',
  'amber',
  'potion_red',
  'bone',
  'demon_horn',
  'seed_sunflower',
  'seed_starfruit',
  'seed_pink_rose',
] as const;

function buildDisjointGiftPreference(
  rng: Rng,
  lovedPool: readonly string[],
  likedPool: readonly string[],
  dislikedPool: readonly string[],
  claimedLoved: Set<string>,
  lovedCount = 2,
  likedCount = 4,
  dislikedCount = 3,
): GiftPreference {
  const used = new Set<string>();
  const lovedCandidates = shuffleWithRng(rng, filterValidItems(lovedPool)).filter(
    (id) => !claimedLoved.has(id) && !used.has(id),
  );
  const loved = lovedCandidates.slice(0, lovedCount);
  if (loved.length < lovedCount) {
    const fallback = shuffleWithRng(rng, filterValidItems(GLOBAL_LOVED_FALLBACK)).filter(
      (id) => !claimedLoved.has(id) && !used.has(id) && !loved.includes(id),
    );
    for (const id of fallback) {
      if (loved.length >= lovedCount) break;
      loved.push(id);
    }
  }
  for (const id of loved) {
    used.add(id);
    claimedLoved.add(id);
  }
  const take = (pool: readonly string[], count: number): string[] => {
    const valid = shuffleWithRng(rng, filterValidItems(pool)).filter((id) => !used.has(id));
    const picked = valid.slice(0, count);
    for (const id of picked) used.add(id);
    return picked;
  };
  return {
    loved,
    liked: take(likedPool, likedCount),
    disliked: take(dislikedPool, dislikedCount),
  };
}

function buildGiftHint(rng: Rng, category: NpcCategory, lovedIds: readonly string[]): string {
  const targetId = lovedIds[0] ?? 'berries';
  const itemName = ITEMS[targetId]?.name ?? targetId;
  if (category === 'family') {
    return pickOne(rng, [
      `If you ever find a crisp ${itemName}, I'd be over the moon!`,
      `Between chores, nothing brightens my day quite like a ${itemName}.`,
      `I secretly hope someone brings me a ${itemName} sometime soon!`,
    ]);
  }
  if (category === 'vagabond') {
    return pickOne(rng, [
      `Out on the frontier, a wanderer dreams of coming across a ${itemName}.`,
      `If you happen to pack a spare ${itemName} on your travels, I sure wouldn't say no.`,
      `Share a ${itemName} by the campfire and you'll have a friend for life.`,
    ]);
  }
  return pickOne(rng, [
    `I appraise goods all day, yet I still have a soft spot for a fine ${itemName}.`,
    `If your pack happens to hold a ${itemName}, you'd earn my highest favor.`,
    `Caravan secret: nothing wins my heart quicker than a quality ${itemName}.`,
  ]);
}

function findAnchorIsland(npcId: string, fallbackGx: number, fallbackGy: number): IslandSpec | undefined {
  return ISLANDS.find((island) => island.npc?.id === npcId) ?? ISLANDS.find((i) => i.gx === fallbackGx && i.gy === fallbackGy);
}

function clampMoodVec(values: number[]): number[] {
  return values.map((v) => Math.max(-1, Math.min(1, Math.round(v * 100) / 100)));
}

function buildVariedDrives(
  rng: Rng,
  base: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(base)) {
    const jitter = (rng() - 0.5) * 0.16;
    out[k] = Math.max(0.1, Math.min(1, Math.round((v + jitter) * 100) / 100));
  }
  return out;
}

function buildVariedMood(rng: Rng, base: readonly number[]): number[] {
  return clampMoodVec(
    base.map((v, idx) => {
      // Keep warmth/trust (0..1) tightly bounded so fresh hearts never drift above 0/1 across seeds.
      const span = idx < 2 ? 0.04 : 0.1;
      return v + (rng() - 0.5) * span;
    }),
  );
}

export function buildAnchorNpcProfiles(worldSeed: number): ProceduralNpcProfile[] {
  const farmerIsland = findAnchorIsland('farmer', 2, 1);
  const fishermanIsland = findAnchorIsland('fisherman', 2, 3);
  const blacksmithIsland = findAnchorIsland('blacksmith', 3, 2);
  const alchemistIsland = findAnchorIsland('alchemist', 1, 2);

  return [
    {
      id: 'farmer',
      name: farmerIsland?.npc?.name ?? 'Farmer Bram',
      title: 'Homestead Grower',
      category: 'anchor',
      spriteKey: farmerIsland?.npc?.spriteKey ?? SPRITES.farmer,
      personaKey: 'farmer',
      homeIslandGx: farmerIsland?.gx ?? 2,
      homeIslandGy: farmerIsland?.gy ?? 1,
      voicePitch: 0.92,
      baselineMood: [0.16, 0.08, 0.04, -0.16, 0.06, 0.26, 0.12],
      driveWeights: {
        work: 0.9,
        socialize: 0.75,
        wander: 0.35,
        curiosity: 0.45,
        trade: 0.5,
        rest: 0.7,
      },
      gifts: {
        loved: ['sunflower', 'pumpkin_soup', 'starfruit'],
        liked: ['berries', 'carrot', 'corn', 'wheat'],
        disliked: ['bone', 'slime_gel', 'demon_horn'],
      },
      giftHint: `Nothing brightens a long day in the fields like a fresh ${ITEMS.sunflower?.name ?? 'Golden Sunflower'}!`,
      lore: {
        role: 'Tends the fertile fields and berry groves of Meadow Homestead.',
        home: 'Meadow Homestead',
        ruler: 'No king rules these scattered isles—only the Lighthouse Guild and shared homestead oaths.',
        crisis: 'Goblin Raiders trampling Whispering Woods',
        item: 'Wild Berries and Golden Sunflowers',
        rival: 'Old Barnaby',
        secret: 'Keeps an heirloom pouch of rare seeds tucked beneath the northern cellar floorboards.',
        rumor: 'strange frost crystals drifting south from Frostwind Ridge',
        customFact: 'Saw your ship break apart on the southern reef before dragging driftwood ashore.',
      },
      secretReward: {
        kind: 'item',
        itemId: 'seed_starfruit',
        amount: 2,
        description: 'Farmer Bram gifts 2 rare Starfruit Seeds from his private seed chest.',
      },
      schedule: [
        { period: 'morning', activity: 'Watering meadow crops', offsetTx: 2, offsetTy: 1, indoorOnRain: true },
        { period: 'midday', activity: 'Tending homestead garden plots', offsetTx: -2, offsetTy: 2, indoorOnRain: true },
        { period: 'evening', activity: 'Sorting berry crates on the porch', offsetTx: 1, offsetTy: 2, indoorOnRain: true },
        { period: 'night', activity: 'Sleeping in Meadow Homestead cottage', offsetTx: 0, offsetTy: 0, indoorOnRain: true },
      ],
      seed: hashSeedParts(worldSeed, 'anchor', 'farmer'),
    },
    {
      id: 'fisherman',
      name: fishermanIsland?.npc?.name ?? 'Old Barnaby',
      title: 'Master Angler',
      category: 'anchor',
      spriteKey: fishermanIsland?.npc?.spriteKey ?? SPRITES.fisherman,
      personaKey: 'fisherman',
      homeIslandGx: fishermanIsland?.gx ?? 2,
      homeIslandGy: fishermanIsland?.gy ?? 3,
      voicePitch: 0.85,
      baselineMood: [0.14, 0.07, 0.05, -0.15, 0.08, 0.3, 0.1],
      driveWeights: {
        work: 0.78,
        socialize: 0.68,
        wander: 0.55,
        curiosity: 0.6,
        trade: 0.45,
        rest: 0.75,
      },
      gifts: {
        loved: ['cooked_fish', 'frost_salmon', 'ember_koi'],
        liked: ['fish', 'dune_catfish', 'wood', 'cooked_meat'],
        disliked: ['bone', 'slime_gel', 'coal'],
      },
      giftHint: `Between you and me, I can never resist a plate of ${ITEMS.cooked_fish?.name ?? 'Grilled Fish'} after hauling nets.`,
      lore: {
        role: "Casts nets off Angler's Pier and teaches castaways how to read the tides.",
        home: "Angler's Pier",
        ruler: 'Answers only to the shifting tide, lighthouse beacons, and old mariner law.',
        crisis: 'Bog Lizardfolk creeping out of Hollow Fen',
        item: 'Fresh Fish and shoreline Fish Traps',
        rival: 'Farmer Bram',
        secret: 'Knows where sunken crates drift ashore along Seabreeze Atoll after gale winds.',
        rumor: 'Dune Catfish schooling near the eastern oasis coves',
        customFact: 'Can predict an incoming rain squall purely from the scent of sea kelp.',
      },
      secretReward: {
        kind: 'item',
        itemId: 'frost_salmon',
        amount: 2,
        description: 'Old Barnaby shares 2 prized Frost Salmon from his salted icebox.',
      },
      schedule: [
        { period: 'morning', activity: 'Casting lines off the southern pier', offsetTx: 0, offsetTy: 3, indoorOnRain: true },
        { period: 'midday', activity: 'Mending shoreline fish traps', offsetTx: 2, offsetTy: 2, indoorOnRain: true },
        { period: 'evening', activity: 'Smoking the evening catch by the dock', offsetTx: -2, offsetTy: 1, indoorOnRain: true },
        { period: 'night', activity: "Sleeping in Angler's Pier cabin", offsetTx: 0, offsetTy: 0, indoorOnRain: true },
      ],
      seed: hashSeedParts(worldSeed, 'anchor', 'fisherman'),
    },
    {
      id: 'blacksmith',
      name: blacksmithIsland?.npc?.name ?? 'Smith Garrick',
      title: 'Master Forgesmith',
      category: 'anchor',
      spriteKey: blacksmithIsland?.npc?.spriteKey ?? SPRITES.blacksmith,
      personaKey: 'blacksmith',
      homeIslandGx: blacksmithIsland?.gx ?? 3,
      homeIslandGy: blacksmithIsland?.gy ?? 2,
      voicePitch: 0.78,
      baselineMood: [0.02, 0.04, 0.02, -0.06, 0.16, 0.22, 0.14],
      driveWeights: {
        work: 0.95,
        socialize: 0.52,
        wander: 0.3,
        curiosity: 0.5,
        trade: 0.72,
        rest: 0.62,
      },
      gifts: {
        loved: ['gold_ingot', 'obsidian', 'iron_ingot'],
        liked: ['iron_ore', 'gold_ore', 'coal', 'amber'],
        disliked: ['slime_gel', 'berries', 'blue_tulip'],
      },
      giftHint: `Bring me a gleaming ${ITEMS.gold_ingot?.name ?? 'Gold Ingot'} sometime and watch my hammer sing!`,
      lore: {
        role: 'Hammers steel blades, pickaxes, and hauberks over roaring bellows.',
        home: 'Amber Steppe',
        ruler: 'Respects craft and nerve above crowns—especially explorers brave enough for Sunken Tomb.',
        crisis: 'Sand Mummies prowling Sunbleached Dunes',
        item: 'Iron Ingots and the Thunder Rod',
        rival: 'Alchemist Vesper',
        secret: 'Once tempered an edge using volcanic Obsidian and a sliver of Desert Scale.',
        rumor: 'the Leviathan guarding a lightning relic inside Sunken Tomb',
        customFact: 'Keeps a quenching trough cooled with snowmelt hauled south by caravan.',
      },
      secretReward: {
        kind: 'item',
        itemId: 'gold_ore',
        amount: 4,
        description: 'Smith Garrick opens his slag-free ore bin and gifts 4 Gold Ore.',
      },
      schedule: [
        { period: 'morning', activity: 'Stoking the forge furnace', offsetTx: -2, offsetTy: 1, indoorOnRain: true },
        { period: 'midday', activity: 'Hammering ingots at the anvil', offsetTx: 2, offsetTy: 1, indoorOnRain: true },
        { period: 'evening', activity: 'Cooling tempered blades outside', offsetTx: 1, offsetTy: 3, indoorOnRain: true },
        { period: 'night', activity: 'Sleeping beside the banked forge', offsetTx: 0, offsetTy: 0, indoorOnRain: true },
      ],
      seed: hashSeedParts(worldSeed, 'anchor', 'blacksmith'),
    },
    {
      id: 'alchemist',
      name: alchemistIsland?.npc?.name ?? 'Alchemist Vesper',
      title: 'Arcane Brewer',
      category: 'anchor',
      spriteKey: alchemistIsland?.npc?.spriteKey ?? SPRITES.alchemist,
      personaKey: 'alchemist',
      homeIslandGx: alchemistIsland?.gx ?? 1,
      homeIslandGy: alchemistIsland?.gy ?? 2,
      voicePitch: 1.15,
      baselineMood: [-0.01, 0.04, 0.06, -0.08, 0.22, 0.42, 0.16],
      driveWeights: {
        work: 0.88,
        socialize: 0.42,
        wander: 0.4,
        curiosity: 0.94,
        trade: 0.6,
        rest: 0.58,
      },
      gifts: {
        loved: ['crystal', 'ghost_eel', 'potion_blue'],
        liked: ['bone', 'slime_gel', 'potion_red', 'amber'],
        disliked: ['wood', 'raw_meat', 'corn'],
      },
      giftHint: `If you happen upon a pure ${ITEMS.crystal?.name ?? 'Frost Crystal'}, my cauldron would thank you kindly.`,
      lore: {
        role: 'Distills Crimson Potions, Azure Tonics, and arcane reagents from fog-drenched relics.',
        home: 'Misty Graveyard',
        ruler: 'Studies elder sigils left behind before the Void Seal fractured the archipelago.',
        crisis: 'Crypt Skeletons swarming from Skull Crypt',
        item: 'Frost Crystals and Crimson Potions',
        rival: 'Smith Garrick',
        secret: 'Tracks Void Spire harmonics echoing beneath Emerald Origin from her cauldron.',
        rumor: 'Arch-Lich Malakor clutching the Necro Rod in Skull Crypt',
        customFact: 'Sleeps lightly because bottled Ghost Eels shimmer before every storm.',
      },
      secretReward: {
        kind: 'item',
        itemId: 'potion_red',
        amount: 2,
        description: 'Alchemist Vesper unseals a velvet satchel and offers 2 Crimson Potions.',
      },
      schedule: [
        { period: 'morning', activity: 'Gathering dew-soaked herbs in the mist', offsetTx: -2, offsetTy: 2, indoorOnRain: true },
        { period: 'midday', activity: 'Simmering reagents in the cauldron', offsetTx: 2, offsetTy: 1, indoorOnRain: true },
        { period: 'evening', activity: 'Charting crypt sigils by lantern light', offsetTx: 0, offsetTy: 2, indoorOnRain: true },
        { period: 'night', activity: 'Sleeping inside the Alchemist cottage', offsetTx: 0, offsetTy: 0, indoorOnRain: true },
      ],
      seed: hashSeedParts(worldSeed, 'anchor', 'alchemist'),
    },
  ];
}

interface FamilyBlueprint {
  id: string;
  anchorNpcId: 'farmer' | 'fisherman' | 'blacksmith' | 'alchemist';
  spriteKey: string;
  names: readonly string[];
  titles: readonly string[];
  relations: readonly string[];
  tints: readonly number[];
  pitchRange: readonly [number, number];
  baseMood: readonly number[];
  baseDrives: Record<string, number>;
  lovedPool: readonly string[];
  likedPool: readonly string[];
  dislikedPool: readonly string[];
  roles: readonly string[];
  rivals: readonly string[];
  secrets: readonly string[];
  rumors: readonly string[];
  customFacts: readonly string[];
  secretRewards: readonly NpcSecretReward[];
  morningActs: readonly string[];
  middayActs: readonly string[];
  eveningActs: readonly string[];
}

const FAMILY_BLUEPRINTS: readonly FamilyBlueprint[] = [
  {
    id: 'family_farmer',
    anchorNpcId: 'farmer',
    spriteKey: SPRITES.kid01,
    names: ['Pip', 'Clover', 'Milo', 'Wren', 'Bramble', 'Daisy', 'Tilly', 'Rowan'],
    titles: ['Sprout Tender', 'Berry Scout', 'Meadow Helper', 'Seed Keeper'],
    relations: ["Bram's Kid", "Bram's Young Sprout", "Bram's Grandchild", "Bram's Little Helper"],
    tints: [0xffffff, 0xffe8c2, 0xdcf7d4, 0xffd9e2, 0xfff3b8],
    pitchRange: [1.18, 1.34],
    baseMood: [0.17, 0.08, 0.04, -0.16, 0.04, 0.36, 0.1],
    baseDrives: { work: 0.55, socialize: 0.88, wander: 0.72, curiosity: 0.82, trade: 0.35, rest: 0.68 },
    lovedPool: ['berries', 'pink_rose', 'sweet_carrot', 'seed_sunflower'],
    likedPool: ['carrot', 'corn', 'tomato', 'cucumber', 'wheat', 'pumpkin'],
    dislikedPool: ['bone', 'demon_horn', 'coal', 'slime_gel', 'raw_meat'],
    roles: [
      'Helps Farmer Bram chase birds off the berry rows and sort freshly picked seeds.',
      'Collects colorful wildflowers and counts earthworms in the tilled carrot beds.',
      'Carries the wooden watering pail across Meadow Homestead every sunrise.',
    ],
    rivals: [
      "Barnaby's slimy fish crates",
      "Garrick's noisy forge sparks",
    ],
    secrets: [
      'Hides shiny beetles and spare berry seeds inside a hollow log near the cottage.',
      'Watched a golden Firefly lead them toward a buried seed satchel last harvest moon.',
    ],
    rumors: [
      'giant Starfruit glowing inside northern vaults',
      'a goblin dropping brass buttons in Whispering Woods',
    ],
    customFacts: [
      'Knows every berry bush on Meadow Homestead by how sweet its blossoms smell.',
      'Can whistle the exact tune of the morning wind chimes.',
    ],
    secretRewards: [
      { kind: 'item', itemId: 'seed_pink_rose', amount: 2, description: 'Shares 2 hidden Blush Rose Seeds from a pocket pouch.' },
      { kind: 'item', itemId: 'sunflower', amount: 3, description: 'Presents 3 sun-warmed Golden Sunflowers.' },
      { kind: 'coins', amount: 45, description: 'Hands over a jar of 45 saved-up copper & gold coins.' },
    ],
    morningActs: ['Chasing butterflies near the berry bushes', 'Counting morning sprouts in the soil', 'Gathering dewdrops along the hedge'],
    middayActs: ['Carrying water to carrot plots', 'Sketching crop rows in the dirt', 'Tossing crumbs to meadow hens'],
    eveningActs: ['Watching fireflies rise over the fence', 'Washing muddy boots by the porch', 'Listening to Bram’s harvest tales'],
  },
  {
    id: 'family_fisherman',
    anchorNpcId: 'fisherman',
    spriteKey: SPRITES.barmaid,
    names: ['Maren', 'Coral', 'Nora', 'Tessa', 'Briny', 'Sybil', 'Freya', 'Lydia'],
    titles: ['Harbor Cook', 'Tide Watcher', 'Net Weaver', 'Pier Keeper'],
    relations: ["Barnaby's Niece", "Barnaby's Harbor Kin", "Barnaby's Granddaughter", "Barnaby's First Mate"],
    tints: [0xffffff, 0xcceeff, 0xffe4c4, 0xd8f5e8, 0xe8d9ff],
    pitchRange: [1.05, 1.18],
    baseMood: [0.15, 0.07, 0.05, -0.14, 0.06, 0.3, 0.1],
    baseDrives: { work: 0.76, socialize: 0.84, wander: 0.54, curiosity: 0.64, trade: 0.68, rest: 0.7 },
    lovedPool: ['dune_catfish', 'fish', 'veggie_medley', 'cabbage'],
    likedPool: ['tomato', 'cucumber', 'pink_rose', 'cooked_fish', 'frost_salmon', 'carrot'],
    dislikedPool: ['bone', 'slime_gel', 'demon_horn', 'coal', 'stone'],
    roles: [
      'Weaves hemp fishing nets and simmers savory fish chowder at Angler’s Pier.',
      'Tracks tide tables and buys fresh herbs for Barnaby’s smoked fillets.',
      'Keeps the harbor lanterns lit so stray skiffs can spot the cove at dusk.',
    ],
    rivals: [
      "Vesper's complaints about sea salt",
      "Meadow Homestead's overland cooks",
    ],
    secrets: [
      'Salts away rare sea-caught Frost Salmon recipes passed down from sunken ports.',
      'Found an engraved lighthouse compass washed beneath the western dock pilings.',
    ],
    rumors: [
      'Ember Koi leaping near Scorched Oasis',
      'Bog Lizardfolk hoarding pearls in Hollow Fen',
    ],
    customFacts: [
      'Ties twelve kinds of mariner knots without looking down from the horizon.',
      'Always leaves a bowl of fish scraps out for passing gulls.',
    ],
    secretRewards: [
      { kind: 'item', itemId: 'cooked_fish', amount: 3, description: 'Packs 3 seasoned Grilled Fish fillets for your journey.' },
      { kind: 'item', itemId: 'blue_tulip', amount: 2, description: 'Gifts 2 sea-breeze Azure Tulips pressed in parchment.' },
      { kind: 'coins', amount: 65, description: 'Shares 65 coins from the pier’s salted-catch jar.' },
    ],
    morningActs: ['Untangling salt-stiff fishing nets', 'Airing sea-blankets beside the pier', 'Checking shoreline traps at low tide'],
    middayActs: ['Simmering harbor fish stew', 'Polishing brass pier lanterns', 'Trading bait stories near the dock'],
    eveningActs: ['Watching crimson sunsets over the cove', 'Coiling mooring ropes before nightfall', 'Sweeping sea shells off the steps'],
  },
  {
    id: 'family_blacksmith',
    anchorNpcId: 'blacksmith',
    spriteKey: SPRITES.bartender,
    names: ['Torin', 'Gareth', 'Kael', 'Dorian', 'Ronan', 'Gideon', 'Hal', 'Cyrus'],
    titles: ['Forge Apprentice', 'Bellows Keeper', 'Ore Assayer', 'Anvil Mate'],
    relations: ["Garrick's Brother", "Garrick's Apprentice", "Garrick's Cousin", "Garrick's Forge Kin"],
    tints: [0xffffff, 0xffd2a8, 0xd8d8e6, 0xffe0b5, 0xe8c4b8],
    pitchRange: [0.8, 0.94],
    baseMood: [0.12, 0.06, 0.04, -0.1, 0.1, 0.26, 0.12],
    baseDrives: { work: 0.86, socialize: 0.72, wander: 0.42, curiosity: 0.54, trade: 0.74, rest: 0.64 },
    lovedPool: ['cooked_meat', 'iron_ore', 'coal', 'beet'],
    likedPool: ['gold_ore', 'radish', 'monster_omelet', 'pumpkin_soup', 'amber', 'wood'],
    dislikedPool: ['slime_gel', 'berries', 'blue_tulip', 'raw_meat', 'seed_berries'],
    roles: [
      'Keeps Garrick’s furnace stoked with coal and grades every incoming crate of iron ore.',
      'Drafts tool blueprints and tests newly balanced pickaxe handles in Amber Steppe.',
      'Brews spiced cider and hauls heavy ingot molds from the quenching barrel.',
    ],
    rivals: [
      'Smith Garrick and his forge wagers',
      'Bog Lizardfolk raiding southern bellows',
    ],
    secrets: [
      'Keeps a small hoard of unblemished Desert Scale hidden behind the brick chimney.',
      'Practiced engraving runes on spare copper rings late after Garrick turns in.',
    ],
    rumors: [
      'Anubis Warriors patrolling Sunken Tomb Isle',
      'Frost Crystals from Frozen Fjord tempering obsidian',
    ],
    customFacts: [
      'Can judge furnace heat within twenty degrees by the color of the sparks.',
      'Wears leather gauntlets patched six times with desert hide.',
    ],
    secretRewards: [
      { kind: 'item', itemId: 'iron_ingot', amount: 3, description: 'Sneaks 3 freshly quenched Iron Ingots from the reserve rack.' },
      { kind: 'item', itemId: 'amber', amount: 2, description: 'Offers 2 polished Desert Scales kept in an oilcloth wrap.' },
      { kind: 'coins', amount: 85, description: 'Pays out 85 coins from spare metalwork commissions.' },
    ],
    morningActs: ['Hauling coal sacks beside the furnace', 'Splitting kindling for the morning heat', 'Sorting ore nuggets by weight'],
    middayActs: ['Pumping the heavy leather bellows', 'Honing copper rivets at the bench', 'Testing anvil tongs on hot iron'],
    eveningActs: ['Sharing roasted meat outside the smithy', 'Banking hot coals for dawn', 'Listening to desert wind chime across the steppe'],
  },
  {
    id: 'family_alchemist',
    anchorNpcId: 'alchemist',
    spriteKey: SPRITES.kid02,
    names: ['Lyra', 'Nyx', 'Vivi', 'Sable', 'Orin', 'Fenn', 'Iris', 'Caspian'],
    titles: ['Potion Ward', 'Vial Sorter', 'Mist Watcher', 'Rune Acolyte'],
    relations: ["Vesper's Ward", "Vesper's Apprentice", "Vesper's Foster Kin", "Vesper's Acolyte"],
    tints: [0xffffff, 0xd9ccff, 0xc7f2ff, 0xf2d4ff, 0xd8f0d8],
    pitchRange: [1.14, 1.28],
    baseMood: [0.1, 0.07, 0.06, -0.12, 0.14, 0.42, 0.12],
    baseDrives: { work: 0.72, socialize: 0.58, wander: 0.48, curiosity: 0.96, trade: 0.45, rest: 0.62 },
    lovedPool: ['blue_tulip', 'egg_bat', 'egg_slime', 'potion_red'],
    likedPool: ['bone', 'slime_gel', 'ghost_eel', 'amber', 'crystal', 'potion_blue'],
    dislikedPool: ['raw_meat', 'wood', 'stone', 'corn', 'cabbage'],
    roles: [
      'Labels crystal phials and presses fog-kissed bog blossoms for Alchemist Vesper.',
      'Watches the glowing cemetery lanterns and keeps Dusk Bats out of the reagent shelves.',
      'Copies sigil charts in neat ink while Vesper tends the simmering cauldron.',
    ],
    rivals: [
      'noisy smiths in Amber Steppe',
      'pesky meadow beetles in herb bundles',
    ],
    secrets: [
      'Memorized an unpublished tonic formula combining Azure Tonic drops with Frost Crystal dust.',
      'Saw violet light seep through the stones beneath Emerald Origin’s sealed spire.',
    ],
    rumors: [
      'Frost Salamanders thawing runes in Frost Cavern Isle',
      'Skull Crypt bones rattling under blood moons',
    ],
    customFacts: [
      'Knows every potion bottle purely by the pitch of its glass chime.',
      'Carries chalk in both pockets for sketching protective circles.',
    ],
    secretRewards: [
      { kind: 'item', itemId: 'potion_blue', amount: 2, description: 'Shares 2 shimmering Azure Tonics bottled at midnight.' },
      { kind: 'item', itemId: 'crystal', amount: 2, description: 'Uncaps a velvet tube containing 2 Frost Crystals.' },
      { kind: 'coins', amount: 75, description: 'Offers 75 coins earned selling spare ink vials.' },
    ],
    morningActs: ['Collecting bog-dew along the headstones', 'Labeling glass reagent phials', 'Sweeping bone dust off the stone path'],
    middayActs: ['Grinding slime jelly in a mortar', 'Pressing Azure Tulips in a leather tome', 'Stirring a copper alembic'],
    eveningActs: ['Lighting willow lanterns around the yard', 'Tracing starlight constellations in the fog', 'Reading Vesper’s spellbook on the stoop'],
  },
];

const VAGABOND_CONFIGS = [
  {
    id: 'vagabond_1',
    spriteKey: SPRITES.bartender,
    names: ['Kestrel', 'Thorne', 'Soren', 'Drifter Vance', 'Alder', 'Corvus', 'Joren', 'Flint'],
    titles: ['Frostline Scout', 'Frontier Wayfarer', 'Ashen Drifter', 'Storm Tracker'],
    tints: [0x9fb8d8, 0xb8d4b0, 0xd9b38c, 0xc2b2e0, 0x9fd0c7],
    pitchRange: [0.82, 0.96] as const,
  },
  {
    id: 'vagabond_2',
    spriteKey: SPRITES.barmaid,
    names: ['Sera', 'Riven', 'Kaelith', 'Vespera', 'Astrid', 'Tamsin', 'Maia', 'Zora'],
    titles: ['Cinder Pilgrim', 'Mist Wanderer', 'Horizon Nomad', 'Tide Drifter'],
    tints: [0xe6a8a8, 0x99d9ea, 0xe8c87e, 0xd4a6e8, 0xa8d8b0],
    pitchRange: [1.02, 1.16] as const,
  },
] as const;

const VAGABOND_RUMORS = [
  'freezing gales around Glacier Peak and Frostwind Ridge',
  'Ice Golems guarding Frost Crystal inside Frost Cavern Isle',
  'Hellhounds prowling ash clouds across Cinder Crossing and Ember Wastes',
  'Obsidian veins beside Ignis inside Infernal Sanctum',
  'Bheur Hags brewing sleet storms atop Frostwind Ridge',
  'Ember Koi swimming near Sulfur Crag and Scorched Oasis',
] as const;

const VAGABOND_SECRETS = [
  'Mapped a sheltered leeward cove between Frozen Fjord and Glacier Peak where winter storms slacken.',
  'Traded salt pork to a desert nomad for sketches of the ember seals binding Infernal Sanctum.',
  'Found a cracked void-glass shard washed down from Sulfur Crag long before the northern fog lifted.',
  'Knows how Hellhounds telegraph their pounce before flame erupts across Cinder Crossing.',
] as const;

const VAGABOND_CRISES = [
  'Northern gales sweeping out of Frozen Fjord and Frostwind Ridge',
  'Infernal sparks drifting off Ember Wastes and Cinder Crossing',
  'Ice Golems and Demon patrols pushing near inner reefs',
] as const;

const MERCHANT_CONFIGS = [
  {
    id: 'merchant_1',
    names: ['Alden', 'Oakhaven', 'Cassian', 'Gideon', 'Leopold', 'Quentin', 'Mercer', 'Alistair'],
    titles: ['Guild Factor', 'Voyage Peddler', 'Spice & Ore Broker', 'Caravan Quartermaster'],
    tints: [0xffe094, 0x9ad4ff, 0xa8f0c6, 0xffc299, 0xd7c4ff],
    pitchRange: [0.9, 1.05] as const,
  },
  {
    id: 'merchant_2',
    names: ['Selene', 'Marigold', 'Isolde', 'Beatrix', 'Yara', 'Clarissa', 'Sabine', 'Delia'],
    titles: ['Relic Appraiser', 'Sailing Purveyor', 'Tidewater Merchant', 'Rare Goods Hawker'],
    tints: [0xffb3d1, 0x8ae6d9, 0xe6b8ff, 0xffcf87, 0xb8c8ff],
    pitchRange: [1.04, 1.18] as const,
  },
] as const;

const MERCHANT_PERK_REWARDS: readonly NpcSecretReward[] = [
  { kind: 'discount', amount: 20, description: 'Grants a 20% trusted-patron discount across traveling caravan wares.' },
  { kind: 'discount', amount: 15, description: 'Extends a 15% Guild friend discount on exotic seeds and supplies.' },
  { kind: 'coins', amount: 140, description: 'Pays out a 140-coin caravan dividend for loyal trade patronage.' },
  { kind: 'coins', amount: 110, description: 'Shares 110 coins from high-margin archipelago spice profits.' },
  { kind: 'item', itemId: 'trinket_swift', amount: 1, description: 'Gifts a Windrunner Charm from the locked captain’s strongbox.' },
  { kind: 'item', itemId: 'ring_copper', amount: 1, description: 'Presents a polished Scout Ring reserved for favored buyers.' },
  { kind: 'item', itemId: 'gold_ingot', amount: 2, description: 'Unlocks 2 stamped Gold Ingots from the traveling vault.' },
  { kind: 'item', itemId: 'starfruit_tart', amount: 2, description: 'Offers 2 deluxe Starfruit Tarts from private galley stores.' },
];

export function generateProceduralTown(worldSeed: number): ProceduralNpcProfile[] {
  const anchors = buildAnchorNpcProfiles(worldSeed);
  const anchorById = new Map(anchors.map((a) => [a.id, a]));
  const usedNames = new Set<string>(anchors.map((a) => a.name));
  const claimedLoved = new Set<string>();
  for (const anchor of anchors) {
    for (const itemId of anchor.gifts.loved) {
      claimedLoved.add(itemId);
    }
  }
  const town: ProceduralNpcProfile[] = [];

  // 1. 4 Family Members (one per anchor NPC on their anchor's island)
  for (const bp of FAMILY_BLUEPRINTS) {
    const anchor = anchorById.get(bp.anchorNpcId)!;
    const npcSeed = hashSeedParts(worldSeed, 'family', bp.anchorNpcId);
    const rng = createRng(npcSeed);

    const name = pickUniqueName(rng, bp.names, usedNames);
    const title = pickOne(rng, bp.titles);
    const relationLabel = pickOne(rng, bp.relations);
    const tint = pickOne(rng, bp.tints);
    const voicePitch = randFloat(rng, bp.pitchRange[0], bp.pitchRange[1], 2);
    const baselineMood = buildVariedMood(rng, bp.baseMood);
    const driveWeights = buildVariedDrives(rng, bp.baseDrives);
    const gifts = buildDisjointGiftPreference(
      rng,
      bp.lovedPool,
      bp.likedPool,
      bp.dislikedPool,
      claimedLoved,
      2,
      4,
      3,
    );
    const giftHint = buildGiftHint(rng, 'family', gifts.loved);
    const secretReward = pickOne(rng, bp.secretRewards);

    const morningOffsetX = randInt(rng, -3, 3) || 1;
    const morningOffsetY = randInt(rng, 1, 3);
    const middayOffsetX = randInt(rng, -3, 3) || -2;
    const middayOffsetY = randInt(rng, -2, 3);
    const eveningOffsetX = randInt(rng, -2, 2);
    const eveningOffsetY = randInt(rng, 1, 3);

    town.push({
      id: bp.id,
      name,
      title,
      category: 'family',
      spriteKey: bp.spriteKey,
      personaKey: 'family',
      homeIslandGx: anchor.homeIslandGx,
      homeIslandGy: anchor.homeIslandGy,
      anchorNpcId: anchor.id,
      relationLabel,
      tint,
      voicePitch,
      baselineMood,
      driveWeights,
      gifts,
      giftHint,
      lore: {
        role: pickOne(rng, bp.roles),
        home: anchor.lore.home,
        ruler: anchor.lore.ruler,
        crisis: anchor.lore.crisis,
        item: anchor.lore.item,
        rival: pickOne(rng, bp.rivals),
        secret: pickOne(rng, bp.secrets),
        rumor: pickOne(rng, bp.rumors),
        customFact: pickOne(rng, bp.customFacts),
      },
      secretReward,
      schedule: [
        {
          period: 'morning',
          activity: pickOne(rng, bp.morningActs),
          offsetTx: morningOffsetX,
          offsetTy: morningOffsetY,
          indoorOnRain: true,
        },
        {
          period: 'midday',
          activity: pickOne(rng, bp.middayActs),
          offsetTx: middayOffsetX,
          offsetTy: middayOffsetY,
          indoorOnRain: true,
        },
        {
          period: 'evening',
          activity: pickOne(rng, bp.eveningActs),
          offsetTx: eveningOffsetX,
          offsetTy: eveningOffsetY,
          indoorOnRain: true,
        },
        {
          period: 'night',
          activity: `Sleeping inside ${anchor.name}'s cottage`,
          offsetTx: 0,
          offsetTy: 0,
          indoorOnRain: true,
        },
      ],
      seed: npcSeed,
    });
  }

  // 2. 2 Vagabonds (wandering drifters carrying Winter/Infernal frontier rumors)
  const vagabondHomeChoices: Array<{ gx: number; gy: number; label: string }> = [
    { gx: 2, gy: 2, label: 'Emerald Origin' },
    { gx: 1, gy: 1, label: 'Whispering Woods' },
    { gx: 3, gy: 2, label: 'Amber Steppe' },
    { gx: 2, gy: 3, label: "Angler's Pier" },
  ];
  const usedVagabondTints = new Set<number>();

  for (let i = 0; i < VAGABOND_CONFIGS.length; i++) {
    const cfg = VAGABOND_CONFIGS[i];
    const npcSeed = hashSeedParts(worldSeed, 'vagabond', i);
    const rng = createRng(npcSeed);

    const name = pickUniqueName(rng, cfg.names, usedNames);
    const title = pickOne(rng, cfg.titles);
    const availableTints = cfg.tints.filter((t) => !usedVagabondTints.has(t));
    const tint = pickOne(rng, availableTints.length > 0 ? availableTints : cfg.tints);
    usedVagabondTints.add(tint);

    const home = vagabondHomeChoices[(i + Math.floor(rng() * vagabondHomeChoices.length)) % vagabondHomeChoices.length];
    const voicePitch = randFloat(rng, cfg.pitchRange[0], cfg.pitchRange[1], 2);
    const baselineMood = buildVariedMood(rng, [-0.02, 0.04, 0.08, -0.1, 0.2, 0.42, 0.18]);
    const driveWeights = buildVariedDrives(rng, {
      work: 0.45,
      socialize: 0.65,
      wander: 0.96,
      curiosity: 0.88,
      trade: 0.5,
      rest: 0.58,
    });
    const vagabondLovedPool =
      i === 0
        ? ['egg_salamander', 'monster_omelet', 'carrot', 'corn']
        : ['demon_horn', 'egg_mummy', 'egg_hellhound', 'eggplant'];
    const gifts = buildDisjointGiftPreference(
      rng,
      vagabondLovedPool,
      ['cooked_fish', 'potion_blue', 'pumpkin_soup', 'amber', 'crystal', 'berries'],
      ['slime_gel', 'stone', 'wood', 'raw_meat', 'wheat'],
      claimedLoved,
      2,
      4,
      3,
    );
    const giftHint = buildGiftHint(rng, 'vagabond', gifts.loved);

    const rewardPool: NpcSecretReward[] = [
      { kind: 'item', itemId: 'crystal', amount: 2, description: 'Unwraps 2 salvaged Frost Crystals smuggled out of Frozen Fjord.' },
      { kind: 'item', itemId: 'potion_red', amount: 2, description: 'Shares 2 emergency Crimson Potions saved from frontier camps.' },
      { kind: 'item', itemId: 'obsidian', amount: 1, description: 'Hands over a jagged shard of Infernal Obsidian.' },
      { kind: 'coins', amount: 95, description: 'Splits 95 coins recovered from a washed-up frontier chest.' },
    ];

    town.push({
      id: cfg.id,
      name,
      title,
      category: 'vagabond',
      spriteKey: cfg.spriteKey,
      personaKey: 'vagabond',
      homeIslandGx: home.gx,
      homeIslandGy: home.gy,
      tint,
      voicePitch,
      baselineMood,
      driveWeights,
      gifts,
      giftHint,
      lore: {
        role: 'Drifts between unlocked frontier islands every two days, trading survival tips and border rumors.',
        home: home.label,
        ruler: 'The outer seas bow to no governor—only to frost squalls, magma vents, and lighthouse beacons.',
        crisis: pickOne(rng, VAGABOND_CRISES),
        item: 'Frost Crystals and Obsidian shards',
        rival: 'pompous Guild merchants',
        secret: pickOne(rng, VAGABOND_SECRETS),
        rumor: pickOne(rng, VAGABOND_RUMORS),
        customFact: 'Carries a salt-stained chart marking Glacier Peak, Frost Cavern Isle, and Infernal Sanctum.',
      },
      secretReward: pickOne(rng, rewardPool),
      schedule: [
        {
          period: 'morning',
          activity: 'Surveying distant reefs from the shoreline',
          offsetTx: randInt(rng, -4, -1),
          offsetTy: randInt(rng, -3, 2),
          indoorOnRain: true,
        },
        {
          period: 'midday',
          activity: 'Sharing frontier rumors by the campfire',
          offsetTx: randInt(rng, 1, 4),
          offsetTy: randInt(rng, -2, 3),
          indoorOnRain: true,
        },
        {
          period: 'evening',
          activity: 'Checking wind direction by the lantern post',
          offsetTx: randInt(rng, -3, 3) || 2,
          offsetTy: randInt(rng, 1, 4),
          indoorOnRain: true,
        },
        {
          period: 'night',
          activity: 'Sleeping beneath a weatherproof camp tarp',
          offsetTx: 0,
          offsetTy: 0,
          indoorOnRain: true,
        },
      ],
      seed: npcSeed,
    });
  }

  // 3. 2 Traveling Salespeople (Merchant_idle with distinct tints, rotating islands daily)
  const usedMerchantTints = new Set<number>();

  for (let i = 0; i < MERCHANT_CONFIGS.length; i++) {
    const cfg = MERCHANT_CONFIGS[i];
    const npcSeed = hashSeedParts(worldSeed, 'merchant', i);
    const rng = createRng(npcSeed);

    const name = pickUniqueName(rng, cfg.names, usedNames);
    const title = pickOne(rng, cfg.titles);
    const availableTints = cfg.tints.filter((t) => !usedMerchantTints.has(t));
    const tint = pickOne(rng, availableTints.length > 0 ? availableTints : cfg.tints);
    usedMerchantTints.add(tint);

    const homeGx = 2;
    const homeGy = i === 0 ? 2 : 1;
    const voicePitch = randFloat(rng, cfg.pitchRange[0], cfg.pitchRange[1], 2);
    const baselineMood = buildVariedMood(rng, [0.02, 0.05, 0.04, -0.12, 0.12, 0.38, 0.12]);
    const driveWeights = buildVariedDrives(rng, {
      work: 0.82,
      socialize: 0.84,
      wander: 0.78,
      curiosity: 0.62,
      trade: 0.98,
      rest: 0.56,
    });
    const merchantLovedPool =
      i === 0
        ? ['gold_ore', 'amber', 'pumpkin', 'seed_starfruit']
        : ['starfruit_tart', 'bone', 'cauliflower', 'seed_pink_rose'];
    const gifts = buildDisjointGiftPreference(
      rng,
      merchantLovedPool,
      ['sunflower', 'pink_rose', 'blue_tulip', 'iron_ingot', 'gold_ingot', 'crystal'],
      ['slime_gel', 'raw_meat', 'stone', 'wood', 'coal'],
      claimedLoved,
      2,
      4,
      3,
    );
    const giftHint = buildGiftHint(rng, 'merchant', gifts.loved);

    const secretReward = pickOne(rng, MERCHANT_PERK_REWARDS);
    const merchantRoles = [
      'Sails a nimble trade skiff across every unlocked island, rotating ports each sunrise.',
      'Appraises rare forage, dungeon relics, and artisan crops for trustworthy castaways.',
    ];
    const merchantRumors = [
      'top prices on Starfruit Tarts and Frost Salmon',
      'Void Shards from Emerald Origin fetching Guild gold',
      'Amber Steppe caravans stocking Gold Ore',
    ];

    town.push({
      id: cfg.id,
      name,
      title,
      category: 'merchant',
      spriteKey: SPRITES.merchant,
      personaKey: 'merchant',
      homeIslandGx: homeGx,
      homeIslandGy: homeGy,
      tint,
      voicePitch,
      baselineMood,
      driveWeights,
      gifts,
      giftHint,
      lore: {
        role: pickOne(rng, merchantRoles),
        home: 'the rotating trade routes',
        ruler: 'Operates under Lighthouse Guild trade charters accepted on every settled dock.',
        crisis: 'sea monsters driving up shipping premiums',
        item: 'exotic seeds and Gold Ingots',
        rival: 'rival Guild caravan brokers',
        secret: 'Tracks trusted customers in a waxed ledger—unlocking special discounts or strongbox perks.',
        rumor: pickOne(rng, merchantRumors),
        customFact: 'Weights every gold coin by ear against a brass tuning fork.',
      },
      secretReward,
      schedule: [
        {
          period: 'morning',
          activity: 'Unloading caravan crates at the landing',
          offsetTx: randInt(rng, -3, -1),
          offsetTy: randInt(rng, 1, 3),
          indoorOnRain: true,
        },
        {
          period: 'midday',
          activity: 'Setting up the traveling market stall',
          offsetTx: randInt(rng, 1, 3),
          offsetTy: randInt(rng, -2, 2),
          indoorOnRain: true,
        },
        {
          period: 'evening',
          activity: 'Tallying coin ledgers by caravan lantern',
          offsetTx: randInt(rng, -2, 2) || -1,
          offsetTy: randInt(rng, 1, 3),
          indoorOnRain: true,
        },
        {
          period: 'night',
          activity: 'Resting inside the anchored trade wagon',
          offsetTx: 0,
          offsetTy: 0,
          indoorOnRain: true,
        },
      ],
      seed: npcSeed,
    });
  }

  return town;
}

export function evaluateGiftReaction(
  profile: ProceduralNpcProfile,
  itemId: string,
): 'loved' | 'liked' | 'disliked' {
  if (profile.gifts.loved.includes(itemId)) return 'loved';
  if (profile.gifts.liked.includes(itemId)) return 'liked';
  if (profile.gifts.disliked.includes(itemId)) return 'disliked';

  const def = ITEMS[itemId];
  if (def && (def.category === 'food' || def.rarity === 'rare' || def.rarity === 'epic' || def.rarity === 'relic')) {
    return 'liked';
  }
  return 'disliked';
}
