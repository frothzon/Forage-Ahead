import manifest from './assetManifest.json';
import { ISLANDS } from './islands';
import { MONSTERS, type MonsterAI, type MonsterDef } from './monsters';

export type BestiaryCategory = 'monster' | 'boss';

export interface BestiarySpriteFrame {
  frameWidth: number;
  frameHeight: number;
  sheetWidth: number;
  sheetHeight: number;
  cols: number;
  rows: number;
}

export interface BestiaryMeta {
  id: string;
  name: string;
  category: BestiaryCategory;
  level: number;
  maxHp: number;
  damage: number;
  speed: number;
  xp: number;
  coins: [number, number];
  behaviorLabel: string;
  habitats: string[];
  fieldNote: string;
  spritePath: string; // relative path under assets/ e.g. 'assets/monsters/...' or portrait path
  spriteFrame: BestiarySpriteFrame;
  drops: Array<{ itemId: string; chance: number; count: number }>;
}

export interface BestiaryTotals {
  total: number;
  monsters: number;
  bosses: number;
}

const BEHAVIOR_LABELS: Record<MonsterAI, string> = {
  hopper: 'Leaping Ambush',
  ranged: 'Ranged Caster',
  chase: 'Relentless Pursuer',
  boss_summoner: 'Summoner Boss',
  boss_charge: 'Charging Titan',
};

const DUNGEON_HABITATS: Array<{ name: string; monsterIds: string[] }> = [
  { name: 'Skull Crypt', monsterIds: ['Skeleton', 'Vampire', 'Lich'] },
  { name: 'Sunken Tomb', monsterIds: ['Mummy', 'Anubis Warrior', 'Purple Worm'] },
  { name: 'Frost Cavern', monsterIds: ['Frost Salamander', 'Ice Golem', 'Frost Giant'] },
  { name: 'Infernal Sanctum', monsterIds: ['Imp', 'Demon', 'Adult Red Dragon'] },
  {
    name: 'Void Spire',
    monsterIds: [
      'Pixie',
      'Dryad',
      'Satyr',
      'Displacer Beast',
      'Owlbear',
      'Kappa',
      'Tengu',
      'Ronin',
      'Oni',
      'Samurai',
      'Serpent Fly',
      'Bulette',
      'Wolf Rider',
      'Ogre',
      'Cyclops',
      'Blue Wyrmling',
      'Young Green Dragon',
      'Faerie Dragon',
      'Peasant',
      'Wizard',
      'Paladin',
      'Griffin',
      'Beholder',
      'Planetar',
      'Efreet',
      'Elder Snail',
      'Fiddle Dog',
      'Blemmyae',
      'Rabbit Soldier',
      'Manticore Bishop',
      'Ancient Black Dragon',
    ],
  },
];

const FIELD_NOTES: Record<string, string> = {
  Slime: 'Gelatinous meadow ooze that bounds toward prey in sudden leaps and drops Slime Gel.',
  Goblin: 'Nimble forest scavenger armed with crude blades and pilfered camp rations.',
  Orc: 'Heavily muscled raider hauling iron ore and coal across contested frontier islands.',
  Mummy: 'Bandaged guardian of sun-baked ruins whose desiccated wrappings conceal ancient Amber.',
  'Anubis Warrior': 'Jackal-headed tomb sentinel wielding gilded blades to defend buried vaults.',
  Djinn: 'Bound sandstorm spirit that hurls arcane energy orbs from afar before closing in.',
  Skeleton: 'Animated ossuary guard raised by dark necromancy to patrol misty graveyards and crypts.',
  Bat: 'Swift nocturnal flyer that swoops from shadowed gravestones at startling speed.',
  Vampire: 'Aristocratic blood-drinker lurking in cursed crypts, often carrying crimson elixirs.',
  'Death Knight': 'Armored revenant forged in dread marshes whose heavy strikes cleave through shields.',
  Lizardfolk: 'Marshland hunter that stalks misty wetlands and hurls barbed spears from range.',
  Medusa: 'Serpentine curse-weaver firing venom-tipped arrows across sunken mireland.',
  'Ice Golem': 'Slow-marching glacier construct of living permafrost packed around a dense Crystal core.',
  'Frost Salamander': 'Nimble arctic drake whose frozen scales shimmer over alpine ridges and glacial caves.',
  'Bheur Hag': 'Wintry crone of the high ridges who channels biting frostbolts and hoards mana draughts.',
  Redcap: 'Fierce winter sprite that dashes through snowdrifts to ambush frostbitten explorers.',
  Imp: 'Cackling brimstone fiend darting over volcanic slag at blistering speed.',
  Gog: 'Volatile cinder caster lobbing searing fireballs across obsidian battlements.',
  Hellhound: 'Fleet-footed infernal predator whose blazing fangs guard volcanic crossings.',
  Demon: 'Towering abyssal brute clad in scorched hide and tempered by volcanic magma.',
  Lich: 'Sovereign necromancer of Skull Crypt who summons skeletal thralls and Death Coils.',
  'Purple Worm': 'Colossal subterranean horror beneath Sunken Tomb that charges through ancient sandstone.',
  'Frost Giant': 'Titanic monarch of Frost Cavern whose charging slams scatter shards of permafrost.',
  'Adult Red Dragon': 'Infernal dragon lord of Infernal Sanctum commanding firestorms and summoned imps.',
  Pixie: 'Mischievous Void Spire spirit on Floors 1–5 that darts rapidly while casting arcane bolts.',
  Dryad: 'Corrupted grove warden of Void Spire Floors 1–5 channeling eldritch forest energy.',
  Satyr: 'Fleet-hooved fey duelist haunting Void Spire Floors 1–5 with relentless melee rushes.',
  'Displacer Beast': 'Six-legged void panther from Floors 1–5 that closes distance in an eye-blurring sprint.',
  Owlbear: 'Ferocious feathered apex beast of Void Spire Floors 1–5 guarding coveted Owlbear Eggs.',
  Kappa: 'Amphibious yokai ambusher on Void Spire Floors 1–5 that springs unpredictably at intruders.',
  Tengu: 'Winged yokai marksman of Void Spire Floors 1–5 raining razor spears from afar.',
  Ronin: 'Wandering void-touched swordsman patrolling Void Spire Floors 1–5 with lethal discipline.',
  Oni: 'Horned warlord of Void Spire Floor 5 whose blazing charges cleave through unprepared heroes.',
  Samurai: 'Disciplined astral blademaster guarding Void Spire Floors 6–10 in shadow-forged armor.',
  'Serpent Fly': 'Hyper-agile winged horror buzzing through Void Spire Floors 6–10 at blinding speed.',
  Bulette: 'Armored landshark stalking Void Spire Floors 6–10 with crushing jaws and thick plating.',
  'Wolf Rider': 'Swift mounted skirmisher racing across Void Spire Floors 6–10 atop a feral dire wolf.',
  Ogre: 'Hulking void brute of Floors 6–10 whose heavy club swings demand swift dodging.',
  Cyclops: 'One-eyed colossus prowling Void Spire Floors 6–10 with earth-shaking melee might.',
  'Blue Wyrmling': 'Young azure drake on Void Spire Floors 6–10 firing frostbolts and guarding Wyrmling Eggs.',
  'Faerie Dragon': 'Iridescent trickster dragon flitting across Void Spire Floors 11–15 with mana blasts.',
  'Young Green Dragon': 'Sovereign drake of Void Spire Floor 10 weaving arcane barrages and summoned guardians.',
  Peasant: 'Once-mortal vanguard consumed by the Void on Floors 11–15, striking with tireless fury.',
  Wizard: 'Astral spellcaster of Void Spire Floors 11–15 unleashing concentrated coils of shadow.',
  Paladin: 'Fallen crusader patrolling Void Spire Floors 11–15 in cursed plate of immense durability.',
  Griffin: 'Tempest-winged predator of Void Spire Floors 11–15 that fiercely protects Griffin Eggs.',
  Beholder: 'Floating many-eyed aberration in Void Spire Floors 11–15 firing relentless void beams.',
  Planetar: 'Fallen celestial arbiter of Void Spire Floor 15 commanding radiant volleys and thralls.',
  Efreet: 'Ancient flame genie of Void Spire Floors 16–20 conjuring searing firestorms from afar.',
  'Elder Snail': 'Deceptively resilient shellback on Void Spire Floors 16–20 boasting immense vitality.',
  'Fiddle Dog': 'Reality-warped hound racing through Void Spire Floors 16–20 at ferocious speed.',
  Blemmyae: 'Headless war-titan inhabiting Void Spire Floors 16–20 with devastating close-quarters might.',
  'Rabbit Soldier': 'Swift armored sentinel of the deepest Spire floors, striking faster than the eye can track.',
  'Manticore Bishop': 'High priest of the abyss on Void Spire Floors 16–20 unleashing deadly shadow curses.',
  'Ancient Black Dragon': 'Apex wyrm of Void Spire Floor 20 whose defeat breaks the Obsidian Sovereign’s hold.',
};

type ManifestImageEntry = { path: string; width: number; height: number };
type ManifestMonsterAnim = {
  key: string;
  frameWidth?: number;
  frameHeight?: number;
  cols?: number;
  rows?: number;
};
type ManifestMonsterEntry = {
  frameWidth?: number;
  frameHeight?: number;
  anims?: Record<string, ManifestMonsterAnim>;
};

const manifestImages = manifest.images as Record<string, ManifestImageEntry>;
const manifestMonsters = manifest.monsters as Record<string, ManifestMonsterEntry>;

function buildHabitatMap(): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  const addHabitat = (monsterId: string, habitat: string) => {
    let set = map.get(monsterId);
    if (!set) {
      set = new Set<string>();
      map.set(monsterId, set);
    }
    set.add(habitat);
  };

  for (const island of ISLANDS) {
    for (const monsterId of island.monsterPool) {
      addHabitat(monsterId, island.name);
    }
  }
  for (const dungeon of DUNGEON_HABITATS) {
    for (const monsterId of dungeon.monsterIds) {
      addHabitat(monsterId, dungeon.name);
    }
  }

  const out = new Map<string, string[]>();
  for (const [id, set] of map.entries()) {
    out.set(id, Array.from(set));
  }
  return out;
}

function resolveSpriteInfo(def: MonsterDef): {
  spritePath: string;
  spriteFrame: BestiarySpriteFrame;
} {
  const mSpec = manifestMonsters[def.id];
  const idleAnim = mSpec?.anims?.idle ?? Object.values(mSpec?.anims ?? {})[0];
  const idleImg = idleAnim?.key ? manifestImages[idleAnim.key] : undefined;
  // Prefer the idle spritesheet so Row 0 Col 0 shows the true downward-facing creature frame.
  if (idleAnim && idleImg?.path) {
    const cols = Math.max(1, Math.round(idleAnim.cols ?? 1));
    const rows = Math.max(1, Math.round(idleAnim.rows ?? 1));
    const sheetWidth = Math.max(1, Math.round(idleImg.width));
    const sheetHeight = Math.max(1, Math.round(idleImg.height));
    const frameWidth = Math.max(
      1,
      Math.round(idleAnim.frameWidth ?? mSpec?.frameWidth ?? Math.floor(sheetWidth / cols)),
    );
    const frameHeight = Math.max(
      1,
      Math.round(idleAnim.frameHeight ?? mSpec?.frameHeight ?? Math.floor(sheetHeight / rows)),
    );
    return {
      spritePath: idleImg.path,
      spriteFrame: { frameWidth, frameHeight, sheetWidth, sheetHeight, cols, rows },
    };
  }

  if (def.portraitKey && manifestImages[def.portraitKey]?.path) {
    const portraitImg = manifestImages[def.portraitKey];
    const width = Math.max(1, Math.round(portraitImg.width));
    const height = Math.max(1, Math.round(portraitImg.height));
    return {
      spritePath: portraitImg.path,
      spriteFrame: {
        frameWidth: width,
        frameHeight: height,
        sheetWidth: width,
        sheetHeight: height,
        cols: 1,
        rows: 1,
      },
    };
  }

  const fallbackImg = manifestImages['monsters/Slime/Slime_idle'];
  return {
    spritePath: fallbackImg?.path ?? 'assets/monsters/Slime/Slime_idle.png',
    spriteFrame: {
      frameWidth: 48,
      frameHeight: 48,
      sheetWidth: fallbackImg?.width ?? 192,
      sheetHeight: fallbackImg?.height ?? 192,
      cols: 4,
      rows: 4,
    },
  };
}

const HABITAT_MAP = buildHabitatMap();

const BESTIARY_CATALOG: BestiaryMeta[] = Object.values(MONSTERS)
  .map((def): BestiaryMeta => {
    const category: BestiaryCategory = def.isBoss ? 'boss' : 'monster';
    const habitats = HABITAT_MAP.get(def.id);
    const behaviorLabel = BEHAVIOR_LABELS[def.ai] ?? 'Relentless Pursuer';
    const { spritePath, spriteFrame } = resolveSpriteInfo(def);
    return {
      id: def.id,
      name: def.name,
      category,
      level: def.level,
      maxHp: def.maxHp,
      damage: def.damage,
      speed: def.speed,
      xp: def.xp,
      coins: [def.coins[0], def.coins[1]],
      behaviorLabel,
      habitats: habitats && habitats.length > 0 ? [...habitats] : ['Uncharted Wilds'],
      fieldNote:
        FIELD_NOTES[def.id] ??
        `${def.name} is a Level ${def.level} ${behaviorLabel.toLowerCase()} threat.`,
      spritePath,
      spriteFrame,
      drops: def.drops.map((d) => ({ ...d })),
    };
  })
  .sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    if (a.category !== b.category) return a.category === 'monster' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

const BESTIARY_BY_ID = new Map<string, BestiaryMeta>(
  BESTIARY_CATALOG.map((entry) => [entry.id, entry]),
);

const BESTIARY_TOTALS: BestiaryTotals = {
  total: BESTIARY_CATALOG.length,
  monsters: BESTIARY_CATALOG.filter((e) => e.category === 'monster').length,
  bosses: BESTIARY_CATALOG.filter((e) => e.category === 'boss').length,
};

export function getBestiaryMeta(monsterId: string): BestiaryMeta | undefined {
  return BESTIARY_BY_ID.get(monsterId);
}

export function getBestiaryCatalog(): BestiaryMeta[] {
  return BESTIARY_CATALOG.map((entry) => ({
    ...entry,
    coins: [entry.coins[0], entry.coins[1]],
    habitats: [...entry.habitats],
    spriteFrame: { ...entry.spriteFrame },
    drops: entry.drops.map((d) => ({ ...d })),
  }));
}

export function getBestiaryTotals(): BestiaryTotals {
  return { ...BESTIARY_TOTALS };
}

export function getBestiaryMasteryTier(kills: number): { label: string; color: string } {
  const safeKills = Number.isFinite(kills) ? Math.max(0, Math.floor(kills)) : 0;
  if (safeKills === 0) return { label: 'Sighted', color: '#a8b8d0' };
  if (safeKills <= 4) return { label: 'Tracked', color: '#7ef29d' };
  if (safeKills <= 19) return { label: 'Hunter', color: '#ffe066' };
  return { label: 'Slayer', color: '#ff9f43' };
}
