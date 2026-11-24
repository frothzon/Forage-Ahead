import { gameState, type HeroClassId } from '../core/GameState';
import type { DungeonId } from '../data/islands';
import type { HouseThemeId } from '../world/HouseLayoutBuilder';
import type { WeatherKind } from '../world/WeatherSystem';

export type QaScenarioId =
  | 'title'
  | 'tutorial'
  | 'forage_combat'
  | 'base_building'
  | 'biomes'
  | 'house_entry'
  | 'house_test'
  | 'dungeon_combat'
  | 'void_dragon_boss'
  | 'ui_modals'
  | 'mobile_touch';

export type QaPresetId = 'starter' | 'midgame' | 'endgame';

export interface QaConfig {
  scenarioId: QaScenarioId | null;
  heroClass: HeroClassId;
  seed: number;
  testHouses: boolean;
}

export interface QaStateSnapshot {
  scene: string;
  heroClass: string;
  level: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  coins: number;
  ownedIslandsCount: number;
  clearedDungeons: string[];
  activeModal: string;
  activeWeather: string;
  timeOfDay: number;
  playerPos: { x: number; y: number };
  tutorialCompleted: boolean;
  hotbar: string[];
  inventory: Record<string, number>;
}

export interface QaApi {
  getStateSnapshot: () => QaStateSnapshot;
  teleportIsland: (gx: number, gy: number) => boolean;
  setEnvironment: (timeOfDay: number, weatherKind?: WeatherKind | 'auto') => boolean;
  grantPreset: (preset: QaPresetId) => void;
  spawnEntity: (
    kind: 'enemy' | 'building' | 'crop' | 'node',
    id: string,
    offsetTilesX: number,
    offsetTilesY: number,
  ) => boolean;
  enterDungeon: (dungeonId: string, floor?: number) => boolean;
  enterHouse: (theme?: HouseThemeId) => boolean;
  openModal: (modal: string) => boolean;
  closeModal: () => boolean;
  triggerAction: (action: string, payload?: Record<string, unknown>) => boolean;
}

const VALID_SCENARIOS = new Set<QaScenarioId>([
  'title',
  'tutorial',
  'forage_combat',
  'base_building',
  'biomes',
  'house_entry',
  'house_test',
  'dungeon_combat',
  'void_dragon_boss',
  'ui_modals',
  'mobile_touch',
]);

const VALID_HEROES = new Set<HeroClassId>([
  'Beastmaster',
  'Gladiator',
  'Sorcerer',
  'Swashbuckler',
]);

export function getQaConfig(): QaConfig {
  if (typeof window === 'undefined') {
    return { scenarioId: null, heroClass: 'Beastmaster', seed: 1337, testHouses: false };
  }
  const params = new URLSearchParams(window.location.search);
  const rawScenario = params.get('qa') as QaScenarioId | null;
  const scenarioId = rawScenario && VALID_SCENARIOS.has(rawScenario) ? rawScenario : null;

  const rawHero = params.get('hero') as HeroClassId | null;
  const heroClass: HeroClassId = rawHero && VALID_HEROES.has(rawHero) ? rawHero : 'Beastmaster';

  const rawSeed = Number(params.get('seed'));
  const seed = Number.isFinite(rawSeed) && params.get('seed') !== null ? rawSeed : 1337;

  const testHouses = params.get('test') === 'houses';
  return { scenarioId, heroClass, seed, testHouses };
}

export function isQaMode(): boolean {
  const cfg = getQaConfig();
  return Boolean(cfg.scenarioId || cfg.testHouses);
}

export function markQaReady(): void {
  if (typeof window !== 'undefined' && isQaMode()) {
    (window as unknown as { __QA_READY?: boolean }).__QA_READY = true;
  }
}

export function resetQaReady(): void {
  if (typeof window !== 'undefined') {
    (window as unknown as { __QA_READY?: boolean }).__QA_READY = false;
  }
}

export function applyPresetToGameState(preset: QaPresetId): void {
  if (preset === 'starter') {
    const starterItems: Array<[string, number]> = [
      ['pickaxe', 1],
      ['axe', 1],
      ['sword', 1],
      ['shovel', 1],
      ['hoe', 1],
      ['watering_can', 1],
      ['fishing_rod', 1],
      ['wood', 20],
      ['stone', 15],
      ['berries', 5],
      ['potion_red', 3],
    ];
    for (const [id, qty] of starterItems) {
      if ((gameState.inventory[id] ?? 0) < qty) {
        gameState.addItem(id, qty - (gameState.inventory[id] ?? 0));
      }
    }
    if (!gameState.equipment.tool) gameState.equipment.tool = 'pickaxe';
    if (!gameState.equipment.weapon) gameState.equipment.weapon = 'sword';
    gameState.hotbar = ['pickaxe', 'sword', 'axe', 'hoe', 'watering_can', 'fishing_rod', 'potion_red', ''];
    gameState.selectedHotbarIndex = 0;
    gameState.hp = gameState.getMaxHp();
    gameState.energy = gameState.getMaxEnergy();
    return;
  }

  if (preset === 'midgame') {
    applyPresetToGameState('starter');
    gameState.debugAddResourcesPreset();
    gameState.debugAddConsumablesPreset();
    gameState.debugAddLevels(5);
    const midItems: Array<[string, number]> = [
      ['steel_sword', 1],
      ['bow', 1],
      ['fire_rod', 1],
      ['iron_armor', 1],
      ['boots_swift', 1],
      ['bomb', 15],
    ];
    for (const [id, qty] of midItems) {
      if ((gameState.inventory[id] ?? 0) < qty) {
        gameState.addItem(id, qty - (gameState.inventory[id] ?? 0));
      }
    }
    gameState.coins = Math.max(gameState.coins, 2500);
    gameState.skillPoints = Math.max(gameState.skillPoints, 5);
    gameState.hotbar = ['pickaxe', 'steel_sword', 'bow', 'fire_rod', 'bomb', 'hoe', 'watering_can', 'potion_red'];
    gameState.hp = gameState.getMaxHp();
    gameState.energy = gameState.getMaxEnergy();
    return;
  }

  // endgame
  applyPresetToGameState('midgame');
  gameState.debugAddLevels(12);
  gameState.debugUnlockAllSkills();
  gameState.debugUnlockAllRelics();
  const endItems: Array<[string, number]> = [
    ['dragon_blade', 1],
    ['crystal_ring', 1],
    ['bomb', 30],
    ['potion_red', 15],
  ];
  for (const [id, qty] of endItems) {
    if ((gameState.inventory[id] ?? 0) < qty) {
      gameState.addItem(id, qty - (gameState.inventory[id] ?? 0));
    }
  }
  gameState.coins = Math.max(gameState.coins, 50000);
  gameState.hotbar = ['pickaxe', 'dragon_blade', 'fire_rod', 'thunder_rod', 'ice_rod', 'bow', 'bomb', 'potion_red'];
  gameState.hp = gameState.getMaxHp();
  gameState.energy = gameState.getMaxEnergy();
}

export function buildBaseSnapshot(sceneName: string, overrides?: Partial<QaStateSnapshot>): QaStateSnapshot {
  return {
    scene: sceneName,
    heroClass: gameState.heroClass,
    level: gameState.level,
    hp: gameState.hp,
    maxHp: gameState.getMaxHp(),
    energy: gameState.energy,
    maxEnergy: gameState.getMaxEnergy(),
    coins: gameState.coins,
    ownedIslandsCount: gameState.ownedIslands.size,
    clearedDungeons: Array.from(gameState.clearedDungeons),
    activeModal: 'none',
    activeWeather: 'clear',
    timeOfDay: 0.5,
    playerPos: { x: 0, y: 0 },
    tutorialCompleted: gameState.tutorialCompleted,
    hotbar: [...gameState.hotbar],
    inventory: { ...gameState.inventory },
    ...overrides,
  };
}

export function registerQaApi(api: Partial<QaApi>): void {
  if (typeof window === 'undefined' || !isQaMode()) return;

  const fullApi: QaApi = {
    getStateSnapshot: () => buildBaseSnapshot('UnknownScene'),
    teleportIsland: () => false,
    setEnvironment: () => false,
    grantPreset: (preset) => applyPresetToGameState(preset),
    spawnEntity: () => false,
    enterDungeon: () => false,
    enterHouse: () => false,
    openModal: () => false,
    closeModal: () => false,
    triggerAction: () => false,
    ...api,
  };

  (window as unknown as { __QA_API__?: QaApi }).__QA_API__ = fullApi;
}

export interface QaBootTarget {
  scene:
    | 'TitleScene'
    | 'TutorialDungeonScene'
    | 'OverworldScene'
    | 'DungeonScene'
    | 'HouseScene'
    | 'HouseTestScene';
  data?: Record<string, unknown>;
}

export function getQaBootTarget(): QaBootTarget | null {
  const { scenarioId, heroClass } = getQaConfig();
  if (!scenarioId) return null;

  resetQaReady();
  gameState.eraseAllSavedData();
  gameState.reset(heroClass);

  switch (scenarioId) {
    case 'title':
      return { scene: 'TitleScene', data: { skipSplash: true } };

    case 'tutorial':
      gameState.startNewGameWithTutorial(heroClass);
      return { scene: 'TutorialDungeonScene' };

    case 'forage_combat':
      gameState.tutorialCompleted = true;
      applyPresetToGameState('midgame');
      return { scene: 'OverworldScene' };

    case 'base_building':
      gameState.tutorialCompleted = true;
      applyPresetToGameState('midgame');
      gameState.addItem('wood', 120);
      gameState.addItem('stone', 120);
      gameState.addItem('iron_ore', 40);
      gameState.addItem('coal', 40);
      return { scene: 'OverworldScene' };

    case 'biomes':
      gameState.tutorialCompleted = true;
      applyPresetToGameState('midgame');
      gameState.ownedIslands.add('3,2');
      gameState.ownedIslands.add('2,3');
      gameState.ownedIslands.add('1,2');
      gameState.ownedIslands.add('2,1');
      return { scene: 'OverworldScene' };

    case 'house_entry':
      gameState.tutorialCompleted = true;
      applyPresetToGameState('starter');
      gameState.hp = Math.max(10, Math.floor(gameState.getMaxHp() * 0.5));
      gameState.energy = Math.max(10, Math.floor(gameState.getMaxEnergy() * 0.5));
      return { scene: 'HouseScene', data: { theme: 'farmer' satisfies HouseThemeId } };

    case 'house_test':
      return { scene: 'HouseTestScene' };

    case 'dungeon_combat':
      gameState.tutorialCompleted = true;
      applyPresetToGameState('midgame');
      return { scene: 'DungeonScene', data: { dungeonId: 'skull_crypt' satisfies DungeonId, floor: 1 } };

    case 'void_dragon_boss':
      gameState.tutorialCompleted = true;
      applyPresetToGameState('endgame');
      return { scene: 'DungeonScene', data: { dungeonId: 'void_spire' satisfies DungeonId, floor: 20 } };

    case 'ui_modals':
      gameState.tutorialCompleted = true;
      applyPresetToGameState('midgame');
      gameState.coins = 5000;
      gameState.skillPoints = 6;
      return { scene: 'OverworldScene' };

    case 'mobile_touch':
      gameState.tutorialCompleted = true;
      applyPresetToGameState('starter');
      return { scene: 'OverworldScene' };

    default:
      return null;
  }
}
