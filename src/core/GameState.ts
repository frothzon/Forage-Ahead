import { ITEMS, type EquipSlot, type GearStats, type ItemRarity } from '../data/items';
import { gearCoinCost, scaledIslandCost } from '../data/economy';
import { ISLANDS, STORY_CHAPTERS, getBiomeChapter, type DungeonId } from '../data/islands';
import { getQuestById, getQuestsForNpc, type QuestDef, type QuestObjective } from '../data/quests';
import { RECIPES, type RecipeDef, type StructureType } from '../data/recipes';
import { SKILLS } from '../data/skills';

export type HeroClassId = 'Beastmaster' | 'Gladiator' | 'Sorcerer' | 'Swashbuckler';
export type EquipmentSlotKey = 'weapon' | 'tool' | 'armor' | 'trinket1' | 'trinket2' | 'trinket3';
export type MenuTabId = 'inventory' | 'craft' | 'skills' | 'quests' | 'map' | 'progress';
export const ALL_MENU_TABS: MenuTabId[] = ['inventory', 'craft', 'skills', 'quests', 'map', 'progress'];

export const ALL_EQUIP_SLOTS: EquipmentSlotKey[] = ['weapon', 'tool', 'armor', 'trinket1', 'trinket2', 'trinket3'];
export const TRINKET_SLOTS: EquipmentSlotKey[] = ['trinket1', 'trinket2', 'trinket3'];

export const BAG_COLS = 6;
export const BAG_ROWS = 5;
export const BAG_SIZE = BAG_COLS * BAG_ROWS; // 30 slots

export interface GearInstance {
  id: string;
  itemId: string;
  rarity: ItemRarity;
  stats: GearStats;
  reforgeCount: number;
}

export interface BagSlot {
  itemId: string;
  count: number;
  instanceId?: string;
}

export interface InventoryFeedEvent {
  id: string;
  itemId: string;
  name: string;
  iconKey?: string;
  delta: number;
  total: number;
}

export interface CraftQueueJob {
  recipeId: string;
  outputItemId: string;
  outputCount: number;
  totalMs: number;
  remainingMs: number;
}

export interface PlacedBuildingSave {
  id: string;
  type: StructureType;
  tx: number;
  ty: number;
  craftQueue?: CraftQueueJob[];
  cropStage?: number;
  stageWatered?: boolean;
  wateredCount?: number;
  harvestsLeft?: number;
  withered?: boolean;
}

export interface SavedNodeData {
  tx: number;
  ty: number;
  kind: string;
  biome: string;
  hp: number;
}

export interface SavedDropData {
  x: number;
  y: number;
  itemId: string;
  qty: number;
  isCoin: boolean;
}

export interface RanchCreatureSave {
  id: string;
  speciesId: string;
  x: number;
  y: number;
  happiness: number; // 0..100
  layTimerMs: number;
  readyEggs: number;
  lastPetAt: number;
}

export interface SaveData {
  version: number;
  heroClass: HeroClassId;
  hp: number;
  energy: number;
  xp: number;
  level: number;
  skillPoints: number;
  coins: number;
  unlockedSkills: string[];
  unlockedBlueprints?: string[];
  ownedIslands: string[];
  clearedDungeons: DungeonId[];
  completedQuests: string[];
  activeQuests?: Record<string, Record<string, number>>;
  trackedQuestId?: string | null;
  bagSlots?: Array<BagSlot | null>;
  inventory?: Record<string, number>;
  equipment?: Partial<Record<EquipmentSlotKey | 'accessory', string | null>>;
  gearInstances?: Record<string, GearInstance>;
  equippedInstanceIds?: Partial<Record<EquipmentSlotKey, string>>;
  hotbar: string[];
  selectedHotbarIndex: number;
  buildings: PlacedBuildingSave[];
  overlays: Array<{ tx: number; ty: number; type: 'dirt' | 'road' | 'bridge' }>;
  savedNodes?: SavedNodeData[];
  savedDrops?: SavedDropData[];
  ranchCreatures?: RanchCreatureSave[];
  voidSpireHighestFloor?: number;
  finalBossDefeated?: boolean;
  seenMilestones?: string[];
  activeAlerts?: Record<string, string>;
  tutorialCompleted?: boolean;
  unlockedMenuTabs?: MenuTabId[];
  savedAt?: number;
  playerPos?: { x: number; y: number };
}

export type SaveSlotIndex = 0 | 1 | 2;
export const SAVE_SLOT_COUNT = 3;

export interface SaveSlotSummary {
  heroClass: HeroClassId;
  level: number;
  hp: number;
  maxHp: number;
  coins: number;
  islands: number;
  dungeonsCleared: number;
  voidSpireFloor: number;
  savedAt?: number;
}

const SAVE_KEY = 'isles_of_foraging_save_v2';
const LEGACY_SAVE_KEYS = ['isles_of_foraging_save_v1', SAVE_KEY];

export interface StatComparisonRow {
  key: keyof GearStats;
  label: string;
  candidateVal: number;
  equippedVal: number;
  diff: number;
  suffix: string;
}

export class GameState {
  public debugMode =
    typeof import.meta !== 'undefined' &&
    Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  public activeSlotIndex: SaveSlotIndex = 0;
  public heroClass: HeroClassId = 'Beastmaster';
  public hp = 100;
  public energy = 100;
  public xp = 0;
  public level = 1;
  public skillPoints = 0;
  private _coins = 25;

  public unlockedSkills = new Set<string>();
  public unlockedBlueprints = new Set<string>();
  public ownedIslands = new Set<string>(['2,2']);
  public clearedDungeons = new Set<DungeonId>();
  public completedQuests = new Set<string>();
  public activeQuests: Record<string, Record<string, number>> = {};
  public trackedQuestId: string | null = null;

  public bagSlots: Array<BagSlot | null> = Array.from({ length: BAG_SIZE }, () => null);
  public gearInstances: Record<string, GearInstance> = {};
  public equippedInstanceIds: Partial<Record<EquipmentSlotKey, string>> = {};
  public gadgetCooldowns: Record<string, number> = {};
  public equipment: Record<EquipmentSlotKey, string | null> = {
    weapon: 'sword',
    tool: 'pickaxe',
    armor: null,
    trinket1: null,
    trinket2: null,
    trinket3: null,
  };
  public hotbar: string[] = [
    'pickaxe',
    'sword',
    'shovel',
    'fishing_rod',
    'berries',
    '',
    '',
    '',
    '',
  ];
  public selectedHotbarIndex = 0;
  public pendingBuildRecipeId: string | null = null;

  public buildings: PlacedBuildingSave[] = [];
  public overlays: Array<{ tx: number; ty: number; type: 'dirt' | 'road' | 'bridge' }> = [];
  public savedNodes?: SavedNodeData[];
  public savedDrops?: SavedDropData[];
  public ranchCreatures: RanchCreatureSave[] = [];
  public voidSpireHighestFloor = 0;
  public finalBossDefeated = false;
  public seenMilestones = new Set<string>();
  public activeAlerts = new Map<string, string>();
  public tutorialCompleted = true;
  public unlockedMenuTabs = new Set<MenuTabId>(ALL_MENU_TABS);
  public playerPos?: { x: number; y: number };

  private listeners: Array<() => void> = [];
  private vitalsListeners: Array<() => void> = [];
  private feedListeners: Array<(ev: InventoryFeedEvent) => void> = [];
  private feedSeq = 0;

  public get coins(): number {
    return this._coins;
  }

  public set coins(val: number) {
    const prev = this._coins;
    this._coins = Math.max(0, val);
    const delta = this._coins - prev;
    if (delta !== 0) {
      this.emitFeed('coin', 'Gold Coins', 'ui_icons/coin', delta, this._coins);
    }
  }

  /** Derived aggregate map of items currently in the bag for quick lookups & recipes. */
  public get inventory(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const slot of this.bagSlots) {
      if (slot && slot.count > 0) {
        out[slot.itemId] = (out[slot.itemId] ?? 0) + slot.count;
      }
    }
    return out;
  }

  public set inventory(map: Record<string, number>) {
    this.bagSlots = Array.from({ length: BAG_SIZE }, () => null);
    let idx = 0;
    for (const [itemId, count] of Object.entries(map)) {
      if (count > 0 && idx < BAG_SIZE) {
        this.bagSlots[idx++] = { itemId, count };
      }
    }
  }

  public onChange(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  public onVitalsChange(fn: () => void): () => void {
    this.vitalsListeners.push(fn);
    return () => {
      this.vitalsListeners = this.vitalsListeners.filter((l) => l !== fn);
    };
  }

  public onInventoryFeed(fn: (ev: InventoryFeedEvent) => void): () => void {
    this.feedListeners.push(fn);
    return () => {
      this.feedListeners = this.feedListeners.filter((l) => l !== fn);
    };
  }

  public emit(): void {
    for (const fn of this.listeners) fn();
  }

  public emitVitals(): void {
    for (const fn of this.vitalsListeners) fn();
  }

  private emitFeed(
    itemId: string,
    name: string,
    iconKey: string | undefined,
    delta: number,
    total: number,
  ): void {
    this.feedSeq += 1;
    const ev: InventoryFeedEvent = {
      id: `feed_${this.feedSeq}`,
      itemId,
      name,
      iconKey,
      delta,
      total,
    };
    for (const fn of this.feedListeners) fn(ev);
  }

  public reset(heroClass: HeroClassId): void {
    this.heroClass = heroClass;
    this.level = 1;
    this.xp = 0;
    this.skillPoints = 0;
    this._coins = 25;
    this.unlockedSkills = new Set();
    this.unlockedBlueprints = new Set();
    this.ownedIslands = new Set(['2,2']);
    this.clearedDungeons = new Set();
    this.completedQuests = new Set();
    this.activeQuests = {};
    this.trackedQuestId = null;

    this.equipment = {
      weapon: 'sword',
      tool: 'pickaxe',
      armor: null,
      trinket1: null,
      trinket2: null,
      trinket3: null,
    };
    this.gearInstances = {};
    this.equippedInstanceIds = {};
    this.gadgetCooldowns = {};

    this.bagSlots = Array.from({ length: BAG_SIZE }, () => null);
    this.bagSlots[0] = { itemId: 'shovel', count: 1 };
    this.bagSlots[1] = { itemId: 'fishing_rod', count: 1 };
    this.bagSlots[2] = { itemId: 'wood', count: 6 };
    this.bagSlots[3] = { itemId: 'stone', count: 4 };
    this.bagSlots[4] = { itemId: 'berries', count: 4 };

    this.hotbar = ['pickaxe', 'sword', 'shovel', 'fishing_rod', 'berries', '', '', '', ''];
    this.selectedHotbarIndex = 0;
    this.pendingBuildRecipeId = null;
    this.buildings = [];
    this.overlays = [];
    this.savedNodes = undefined;
    this.savedDrops = undefined;
    this.ranchCreatures = [];
    this.voidSpireHighestFloor = 0;
    this.finalBossDefeated = false;
    this.seenMilestones = new Set();
    this.activeAlerts = new Map();
    this.tutorialCompleted = true;
    this.unlockedMenuTabs = new Set<MenuTabId>(ALL_MENU_TABS);
    this.playerPos = undefined;
    this.hp = this.getMaxHp();
    this.energy = this.getMaxEnergy();
    this.emit();
  }

  public startNewGameWithTutorial(heroClass: HeroClassId): void {
    this.reset(heroClass);
    this.tutorialCompleted = false;
    this.unlockedMenuTabs = new Set<MenuTabId>();
    this.equipment.weapon = null;
    this.equipment.tool = null;
    this.bagSlots = Array.from({ length: BAG_SIZE }, () => null);
    this.bagSlots[0] = { itemId: 'berries', count: 4 };
    this.hotbar = ['', '', '', '', 'berries', '', '', '', ''];
    this.selectedHotbarIndex = 4;
    this.emit();
  }

  public grantStarterTool(itemId: string, preferredSlot: number, equipSlot?: 'tool' | 'weapon'): void {
    if (!this.isGearOwned(itemId) && (this.inventory[itemId] ?? 0) <= 0) {
      this.addItem(itemId, 1);
    }
    const existingIdx = this.hotbar.indexOf(itemId);
    if (existingIdx !== -1) {
      this.selectedHotbarIndex = existingIdx;
    } else {
      const occupant = this.hotbar[preferredSlot];
      if (occupant && occupant !== itemId) {
        const freeIdx = this.hotbar.findIndex((s) => s === '');
        if (freeIdx !== -1) this.hotbar[freeIdx] = occupant;
      }
      this.hotbar[preferredSlot] = itemId;
      this.selectedHotbarIndex = preferredSlot;
    }
    if (equipSlot) this.equipment[equipSlot] = itemId;
    this.emit();
  }

  public isMenuTabUnlocked(tab: MenuTabId): boolean {
    return this.tutorialCompleted || this.debugMode || this.unlockedMenuTabs.has(tab);
  }

  public unlockMenuTab(...tabs: MenuTabId[]): void {
    let added = false;
    for (const t of tabs) {
      if (!this.unlockedMenuTabs.has(t)) {
        this.unlockedMenuTabs.add(t);
        added = true;
      }
    }
    if (added) {
      this.triggerAlert('menu_unlock', 'menu');
      this.emit();
    }
  }

  public completeTutorial(): void {
    this.tutorialCompleted = true;
    for (const t of ALL_MENU_TABS) this.unlockedMenuTabs.add(t);
    this.emit();
  }

  public hasSkill(id: string): boolean {
    return this.unlockedSkills.has(id);
  }

  public getGearStats(itemId: string, instanceId?: string): GearStats {
    if (instanceId && this.gearInstances[instanceId]) {
      return this.gearInstances[instanceId].stats;
    }
    return ITEMS[itemId]?.stats ?? {};
  }

  public getGearRarity(itemId: string, instanceId?: string): ItemRarity {
    if (instanceId && this.gearInstances[instanceId]) {
      return this.gearInstances[instanceId].rarity;
    }
    return ITEMS[itemId]?.rarity ?? 'common';
  }

  public hasTrinketEffect(effect: NonNullable<typeof ITEMS[string]['trinketEffect']>): boolean {
    return TRINKET_SLOTS.some((slot) => {
      const id = this.equipment[slot];
      return id ? ITEMS[id]?.trinketEffect === effect : false;
    });
  }

  public getGadgetRemainingMs(itemId: string): number {
    const until = this.gadgetCooldowns[itemId] ?? 0;
    return Math.max(0, until - Date.now());
  }

  public triggerGadgetCooldown(itemId: string): boolean {
    const def = ITEMS[itemId];
    if (!def || def.category !== 'gadget') return false;
    if (this.getGadgetRemainingMs(itemId) > 0) return false;
    this.gadgetCooldowns[itemId] = Date.now() + (def.cooldownMs ?? 8000);
    return true;
  }

  public rollGearInstance(itemId: string, minRarity?: ItemRarity): GearInstance | null {
    const def = ITEMS[itemId];
    if (!def?.equipSlot || !def.stats) return null;
    const order: ItemRarity[] = ['common', 'uncommon', 'rare', 'epic'];
    let rarity: ItemRarity = def.rarity === 'relic' ? 'relic' : 'common';
    if (rarity !== 'relic') {
      const r = Math.random();
      if (r < 0.05) rarity = 'epic';
      else if (r < 0.2) rarity = 'rare';
      else if (r < 0.5) rarity = 'uncommon';
      else rarity = 'common';
      if (minRarity && minRarity !== 'relic') {
        const minIdx = order.indexOf(minRarity);
        const curIdx = order.indexOf(rarity);
        if (curIdx < minIdx) rarity = minRarity;
      }
    }
    const multMap: Record<ItemRarity, number> = {
      common: 1,
      uncommon: 1.15,
      rare: 1.32,
      epic: 1.55,
      relic: 1,
    };
    const mult = multMap[rarity];
    const scaled: GearStats = {};
    for (const [k, v] of Object.entries(def.stats) as Array<[keyof GearStats, number | undefined]>) {
      if (v !== undefined && v !== 0) {
        scaled[k] = Math.max(1, Math.round(v * mult));
      }
    }
    // Bonus affix on rare/epic
    if (rarity === 'rare' || rarity === 'epic') {
      const bonusVal = rarity === 'epic' ? 5 : 3;
      const affixes: Array<keyof GearStats> = ['critPct', 'speedPct', 'maxHp', 'attack'];
      const pick = affixes[Math.floor(Math.random() * affixes.length)];
      scaled[pick] = (scaled[pick] ?? 0) + (pick === 'maxHp' ? bonusVal * 4 : bonusVal);
    }
    const id = `gear_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const inst: GearInstance = { id, itemId, rarity, stats: scaled, reforgeCount: 0 };
    this.gearInstances[id] = inst;
    return inst;
  }

  public reforgeBagSlot(bagIdx: number): { ok: boolean; reason?: string; instance?: GearInstance } {
    const slot = this.bagSlots[bagIdx];
    if (!slot) return { ok: false, reason: 'Empty slot.' };
    const def = ITEMS[slot.itemId];
    if (!def?.equipSlot || def.rarity === 'relic') {
      return { ok: false, reason: 'Only craftable gear can be reforged.' };
    }
    const existing = slot.instanceId ? this.gearInstances[slot.instanceId] : undefined;
    const refCount = existing?.reforgeCount ?? 0;
    const baseReforge = (def.requiredLevel ?? 1) >= 2 ? Math.round(gearCoinCost(def.requiredLevel ?? 1) * 0.5) : 35;
    const coinCost = baseReforge + refCount * 20;
    if (this._coins < coinCost) return { ok: false, reason: `Need ${coinCost}g to reforge.` };
    if ((this.inventory.iron_ingot ?? 0) < 2) return { ok: false, reason: 'Need 2 Iron Ingots.' };

    this.coins = this._coins - coinCost;
    this.removeItem('iron_ingot', 2);

    const order: ItemRarity[] = ['common', 'uncommon', 'rare', 'epic'];
    const curRarity = existing?.rarity ?? def.rarity;
    const nextIdx = Math.min(order.length - 1, Math.max(1, order.indexOf(curRarity) + 1));
    const rolled = this.rollGearInstance(slot.itemId, order[nextIdx]);
    if (!rolled) return { ok: false, reason: 'Reforge failed.' };
    rolled.reforgeCount = refCount + 1;
    slot.instanceId = rolled.id;
    this.addXp(12);
    this.emit();
    return { ok: true, instance: rolled };
  }

  public getEquippedStats(): Required<GearStats> {
    const totals: Required<GearStats> = {
      attack: 0,
      gather: 0,
      armor: 0,
      critPct: 0,
      speedPct: 0,
      maxHp: 0,
      maxEnergy: 0,
    };
    for (const slot of ALL_EQUIP_SLOTS) {
      const id = this.equipment[slot];
      if (!id) continue;
      const st = this.getGearStats(id, this.equippedInstanceIds[slot]);
      totals.attack += st.attack ?? 0;
      totals.gather += st.gather ?? 0;
      totals.armor += st.armor ?? 0;
      totals.critPct += st.critPct ?? 0;
      totals.speedPct += st.speedPct ?? 0;
      totals.maxHp += st.maxHp ?? 0;
      totals.maxEnergy += st.maxEnergy ?? 0;
    }
    return totals;
  }

  public compareGearStats(
    candidateItemId: string,
    candidateInstanceId?: string,
    targetTrinketSlot?: EquipmentSlotKey,
  ): {
    slot: EquipmentSlotKey;
    equippedId: string | null;
    rows: StatComparisonRow[];
  } | null {
    const def = ITEMS[candidateItemId];
    if (!def?.equipSlot) return null;
    const slot: EquipmentSlotKey =
      def.equipSlot === 'accessory'
        ? targetTrinketSlot ?? TRINKET_SLOTS.find((s) => !this.equipment[s]) ?? 'trinket1'
        : def.equipSlot;
    const equippedId = this.equipment[slot];
    const cand = this.getGearStats(candidateItemId, candidateInstanceId);
    const eq = equippedId ? this.getGearStats(equippedId, this.equippedInstanceIds[slot]) : {};

    const keys: Array<{ key: keyof GearStats; label: string; suffix: string }> = [
      { key: 'attack', label: 'Attack', suffix: '' },
      { key: 'gather', label: 'Gather', suffix: '' },
      { key: 'armor', label: 'Armor', suffix: '' },
      { key: 'critPct', label: 'Crit', suffix: '%' },
      { key: 'speedPct', label: 'Speed', suffix: '%' },
      { key: 'maxHp', label: 'Max HP', suffix: '' },
      { key: 'maxEnergy', label: 'Max EN', suffix: '' },
    ];

    const rows: StatComparisonRow[] = [];
    for (const k of keys) {
      const cv = cand[k.key] ?? 0;
      const ev = eq[k.key] ?? 0;
      if (cv === 0 && ev === 0) continue;
      rows.push({
        key: k.key,
        label: k.label,
        candidateVal: cv,
        equippedVal: ev,
        diff: cv - ev,
        suffix: k.suffix,
      });
    }
    return { slot, equippedId, rows };
  }

  public getMaxHp(): number {
    let base = 60 + (this.level - 1) * 12 + this.getEquippedStats().maxHp;
    if (this.heroClass === 'Gladiator') base += 20;
    if (this.hasSkill('magic_vitality')) base += 40;
    if (this.hasSkill('magic_void_resilience')) base += 120;
    if (this.hasSkill('fam_gl_t4')) base += 25;
    if (this.hasSkill('fam_gl_t9')) base += 60;
    if (this.hasSkill('fam_gl_t12')) base = Math.round(base * 1.2);
    return base;
  }

  public getMaxEnergy(): number {
    let base = 60 + (this.level - 1) * 6 + this.getEquippedStats().maxEnergy;
    if (this.hasSkill('foraging_magnet')) base += 40;
    if (this.hasSkill('foraging_apex_harvest')) base += 30;
    if (this.hasSkill('fam_so_t2')) base += 15;
    if (this.hasSkill('fam_so_t6')) base += 40;
    if (this.hasSkill('fam_so_t12')) base += 80;
    return base;
  }

  public getGearLevel(itemId: string, instanceId?: string): number {
    const baseLv = ITEMS[itemId]?.gearLevel ?? 1;
    const refBonus = instanceId ? this.gearInstances[instanceId]?.reforgeCount ?? 0 : 0;
    return baseLv + refBonus;
  }

  public getPowerLevel(): number {
    const equippedLevels: number[] = [];
    for (const slot of ALL_EQUIP_SLOTS) {
      const id = this.equipment[slot];
      if (id) equippedLevels.push(this.getGearLevel(id, this.equippedInstanceIds[slot]));
    }
    const avgGear =
      equippedLevels.length > 0
        ? equippedLevels.reduce((a, b) => a + b, 0) / equippedLevels.length
        : 1;
    return Math.max(1, Math.round((this.level + avgGear) / 2));
  }

  public getDamageScaleVsEnemy(enemyLevel: number): { dealMult: number; takeMult: number } {
    const diff = enemyLevel - this.getPowerLevel();
    if (diff < 3) return { dealMult: 1, takeMult: 1 };
    const extra = diff - 2;
    return {
      dealMult: Math.max(0.35, 1 - extra * 0.12),
      takeMult: 1 + Math.min(0.8, extra * 0.15),
    };
  }

  public getStoryChapter(): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 {
    if (this.voidSpireHighestFloor >= 15) return 8;
    if (this.voidSpireHighestFloor >= 10) return 7;
    if (this.voidSpireHighestFloor >= 5) return 6;
    if (this.clearedDungeons.has('infernal_sanctum')) return 5;
    if (this.clearedDungeons.has('frost_cavern')) return 4;
    if (this.clearedDungeons.has('skull_crypt') && this.clearedDungeons.has('sunken_tomb')) return 3;
    if ((this.completedQuests.has('farmer_1') && this.completedQuests.has('fisherman_1')) || this.getPowerLevel() >= 3) {
      return 2;
    }
    return 1;
  }

  public getIslandStoryLockReason(gx: number, gy: number): string | null {
    const spec = ISLANDS.find((i) => i.gx === gx && i.gy === gy);
    if (!spec) return 'Unknown island.';
    const reqChapter = getBiomeChapter(spec.biome);
    const curChapter = this.getStoryChapter();
    if (reqChapter <= curChapter) return null;
    const prevMeta = STORY_CHAPTERS.find((c) => c.chapter === reqChapter - 1);
    return prevMeta?.unlockHint ?? `Advance to Story Chapter ${reqChapter} to unlock.`;
  }

  public getXpForNextLevel(): number {
    return Math.round(100 + this.level * 50 + this.level * this.level * 4);
  }

  public triggerAlert(alertKey: string, buttonId = 'menu'): void {
    this.activeAlerts.set(alertKey, buttonId);
    this.emit();
  }

  public triggerMilestoneAlert(milestoneKey: string, buttonId = 'menu'): boolean {
    if (this.seenMilestones.has(milestoneKey)) return false;
    this.seenMilestones.add(milestoneKey);
    this.activeAlerts.set(milestoneKey, buttonId);
    this.emit();
    return true;
  }

  public hasAlertForButton(buttonId: string): boolean {
    for (const target of this.activeAlerts.values()) {
      if (target === buttonId) return true;
    }
    return false;
  }

  public clearButtonAlerts(buttonId: string): void {
    let changed = false;
    for (const [k, target] of this.activeAlerts.entries()) {
      if (target === buttonId) {
        this.activeAlerts.delete(k);
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  public clearAlert(alertKey: string): void {
    if (this.activeAlerts.delete(alertKey)) {
      this.emit();
    }
  }

  private applyLevelUp(): void {
    this.level += 1;
    // +1 SP per level, plus +1 milestone SP every 6 levels up to Lv. 60 (59 + 10 = 69 SP total, matching full 5-pillar tree cost)
    this.skillPoints += 1 + (this.level <= 60 && this.level % 6 === 0 ? 1 : 0);
    this.hp = this.getMaxHp();
    this.energy = this.getMaxEnergy();
  }

  public addXp(amount: number): boolean {
    this.xp += amount;
    let leveled = false;
    while (this.xp >= this.getXpForNextLevel()) {
      this.xp -= this.getXpForNextLevel();
      this.applyLevelUp();
      leveled = true;
    }
    if (leveled && this.skillPoints > 0) {
      this.triggerMilestoneAlert('first_skill_point', 'menu');
    }
    this.emit();
    return leveled;
  }

  public getItemCount(itemId: string): number {
    let total = 0;
    for (const s of this.bagSlots) {
      if (s && s.itemId === itemId) total += s.count;
    }
    for (const slot of ALL_EQUIP_SLOTS) {
      if (this.equipment[slot] === itemId) total += 1;
    }
    return total;
  }

  public isGearOwned(itemId: string): boolean {
    return this.getItemCount(itemId) > 0;
  }

  public addItem(itemId: string, count = 1): void {
    if (count <= 0) return;
    const def = ITEMS[itemId];
    if (!def) return;

    const stackable = !def.equipSlot;
    if (stackable) {
      const existing = this.bagSlots.find((s) => s && s.itemId === itemId);
      if (existing) {
        existing.count += count;
      } else {
        const emptyIdx = this.bagSlots.findIndex((s) => s === null);
        if (emptyIdx !== -1) {
          this.bagSlots[emptyIdx] = { itemId, count };
        }
      }
      if ((def.category === 'food' || def.category === 'consumable' || def.category === 'gadget') && !this.hotbar.includes(itemId)) {
        const emptyHb = this.hotbar.indexOf('');
        if (emptyHb !== -1) this.hotbar[emptyHb] = itemId;
      }
    } else {
      for (let i = 0; i < count; i++) {
        const emptyIdx = this.bagSlots.findIndex((s) => s === null);
        if (emptyIdx !== -1) {
          const inst = def.rarity !== 'relic' ? this.rollGearInstance(itemId) : null;
          this.bagSlots[emptyIdx] = inst ? { itemId, count: 1, instanceId: inst.id } : { itemId, count: 1 };
        }
      }
      if ((def.equipSlot === 'weapon' || def.equipSlot === 'tool') && !this.hotbar.includes(itemId)) {
        const emptyHb = this.hotbar.indexOf('');
        if (emptyHb !== -1) this.hotbar[emptyHb] = itemId;
      }
    }

    this.emitFeed(itemId, def.name, def.iconKey, count, this.getItemCount(itemId));
    this.emit();
  }

  public removeItem(itemId: string, count: number): boolean {
    if ((this.inventory[itemId] ?? 0) < count) return false;
    let remaining = count;
    for (let i = 0; i < this.bagSlots.length && remaining > 0; i++) {
      const slot = this.bagSlots[i];
      if (!slot || slot.itemId !== itemId) continue;
      const take = Math.min(slot.count, remaining);
      slot.count -= take;
      remaining -= take;
      if (slot.count <= 0) {
        this.bagSlots[i] = null;
      }
    }
    if (this.getItemCount(itemId) <= 0) {
      for (let i = 0; i < this.hotbar.length; i++) {
        if (this.hotbar[i] === itemId) {
          this.hotbar[i] = '';
        }
      }
    }
    const def = ITEMS[itemId];
    this.emitFeed(itemId, def?.name ?? itemId, def?.iconKey, -count, this.getItemCount(itemId));
    this.emit();
    return true;
  }

  public moveOrSwapBagSlot(fromIdx: number, toIdx: number): void {
    if (fromIdx === toIdx) return;
    if (fromIdx < 0 || fromIdx >= BAG_SIZE || toIdx < 0 || toIdx >= BAG_SIZE) return;
    const from = this.bagSlots[fromIdx];
    const to = this.bagSlots[toIdx];
    if (!from) return;

    const fromDef = ITEMS[from.itemId];
    if (to && to.itemId === from.itemId && !fromDef?.equipSlot) {
      to.count += from.count;
      this.bagSlots[fromIdx] = null;
    } else {
      this.bagSlots[toIdx] = from;
      this.bagSlots[fromIdx] = to;
    }
    this.emit();
  }

  public equipFromBag(bagIdx: number, targetSlot?: EquipSlot | EquipmentSlotKey): boolean {
    const slotItem = this.bagSlots[bagIdx];
    if (!slotItem) return false;
    const def = ITEMS[slotItem.itemId];
    if (!def?.equipSlot) return false;

    let eqSlot: EquipmentSlotKey;
    if (def.equipSlot === 'accessory') {
      if (targetSlot && TRINKET_SLOTS.includes(targetSlot as EquipmentSlotKey)) {
        eqSlot = targetSlot as EquipmentSlotKey;
      } else if (!targetSlot || targetSlot === 'accessory') {
        eqSlot = TRINKET_SLOTS.find((s) => !this.equipment[s]) ?? 'trinket1';
      } else {
        return false;
      }
    } else {
      if (targetSlot && def.equipSlot !== targetSlot) return false;
      eqSlot = def.equipSlot;
    }

    const prevEquipped = this.equipment[eqSlot];
    const prevInstId = this.equippedInstanceIds[eqSlot];
    this.equipment[eqSlot] = slotItem.itemId;
    if (slotItem.instanceId) {
      this.equippedInstanceIds[eqSlot] = slotItem.instanceId;
    } else {
      delete this.equippedInstanceIds[eqSlot];
    }
    this.bagSlots[bagIdx] = prevEquipped
      ? prevInstId
        ? { itemId: prevEquipped, count: 1, instanceId: prevInstId }
        : { itemId: prevEquipped, count: 1 }
      : null;

    // Auto-update hotbar slot if previous weapon/tool was on hotbar
    if (eqSlot === 'weapon' || eqSlot === 'tool') {
      if (prevEquipped && this.hotbar.includes(prevEquipped)) {
        const hbIdx = this.hotbar.indexOf(prevEquipped);
        this.hotbar[hbIdx] = slotItem.itemId;
      } else if (!this.hotbar.includes(slotItem.itemId)) {
        const emptyHb = this.hotbar.indexOf('');
        if (emptyHb !== -1) this.hotbar[emptyHb] = slotItem.itemId;
      }
    }

    this.hp = Math.min(this.hp, this.getMaxHp());
    this.energy = Math.min(this.energy, this.getMaxEnergy());
    this.emit();
    return true;
  }

  public unequipToBag(eqSlot: EquipmentSlotKey, toBagIdx?: number): boolean {
    const itemId = this.equipment[eqSlot];
    if (!itemId) return false;
    const dest =
      toBagIdx !== undefined && toBagIdx >= 0 && toBagIdx < BAG_SIZE && this.bagSlots[toBagIdx] === null
        ? toBagIdx
        : this.bagSlots.findIndex((s) => s === null);
    if (dest === -1) return false;
    const instId = this.equippedInstanceIds[eqSlot];
    this.bagSlots[dest] = instId ? { itemId, count: 1, instanceId: instId } : { itemId, count: 1 };
    this.equipment[eqSlot] = null;
    delete this.equippedInstanceIds[eqSlot];
    this.hp = Math.min(this.hp, this.getMaxHp());
    this.energy = Math.min(this.energy, this.getMaxEnergy());
    this.emit();
    return true;
  }

  public assignHotbarSlot(hotbarIdx: number, itemId: string): void {
    if (hotbarIdx < 0 || hotbarIdx >= 9) return;
    // Remove duplicates if already placed elsewhere on hotbar
    for (let i = 0; i < this.hotbar.length; i++) {
      if (this.hotbar[i] === itemId) this.hotbar[i] = '';
    }
    this.hotbar[hotbarIdx] = itemId;
    this.emit();
  }

  public clearHotbarSlot(hotbarIdx: number): void {
    if (hotbarIdx < 0 || hotbarIdx >= 9) return;
    this.hotbar[hotbarIdx] = '';
    this.emit();
  }

  public getStructureCostCount(itemId: string, rawCount: number, isBuild: boolean): number {
    if (!isBuild) return rawCount;
    if (this.hasSkill('industry_masonry') && (itemId === 'wood' || itemId === 'stone')) {
      return Math.max(1, Math.floor(rawCount * 0.75));
    }
    return rawCount;
  }

  public isRecipeUnlocked(recipe: RecipeDef): boolean {
    if (recipe.unlockMode === 'blueprint' && !this.unlockedBlueprints.has(recipe.id)) {
      return false;
    }
    if (recipe.requiresSkill && !this.hasSkill(recipe.requiresSkill)) {
      return false;
    }
    return true;
  }

  public unlockBlueprint(recipeId: string): boolean {
    if (this.unlockedBlueprints.has(recipeId)) return false;
    const rec = RECIPES.find((r) => r.id === recipeId);
    if (!rec || rec.unlockMode !== 'blueprint') return false;
    this.unlockedBlueprints.add(recipeId);
    this.emitFeed('blueprint', `Blueprint: ${rec.name}`, rec.iconKey ?? 'ui_icons/scroll', 1, this.unlockedBlueprints.size);
    this.triggerMilestoneAlert('first_blueprint', 'menu');
    this.emit();
    return true;
  }

  public canCraft(recipe: RecipeDef): boolean {
    if (!this.isRecipeUnlocked(recipe)) return false;
    if ((recipe.coinCost ?? 0) > this._coins) return false;
    const isBuild = recipe.station === 'build';
    return recipe.ingredients.every(
      (ing) => (this.inventory[ing.itemId] ?? 0) >= this.getStructureCostCount(ing.itemId, ing.count, isBuild),
    );
  }

  public craftRecipe(recipeId: string): boolean {
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (!recipe || !this.canCraft(recipe)) return false;
    this.consumeIngredients(recipe);
    if (recipe.outputItemId) {
      this.addItem(recipe.outputItemId, recipe.outputCount ?? 1);
    }
    this.recordQuestProgress('craft', recipeId, 1);
    this.addXp(8);
    this.emit();
    return true;
  }

  public getCraftDurationMs(recipe: RecipeDef): number {
    const base = recipe.craftTimeMs ?? 3000;
    return this.hasSkill('industry_smelt') ? Math.round(base / 1.4) : base;
  }

  public consumeIngredients(recipe: RecipeDef): boolean {
    if (!this.canCraft(recipe)) return false;
    if (recipe.coinCost) {
      this.coins = this._coins - recipe.coinCost;
    }
    const isBuild = recipe.station === 'build';
    for (const ing of recipe.ingredients) {
      const needed = this.getStructureCostCount(ing.itemId, ing.count, isBuild);
      this.removeItem(ing.itemId, needed);
    }
    return true;
  }

  public refundIngredients(recipe: RecipeDef): void {
    if (recipe.coinCost) {
      this.coins = this._coins + recipe.coinCost;
    }
    const isBuild = recipe.station === 'build';
    for (const ing of recipe.ingredients) {
      const count = this.getStructureCostCount(ing.itemId, ing.count, isBuild);
      this.addItem(ing.itemId, count);
    }
  }

  public canUnlockSkill(skillId: string): boolean {
    if (this.unlockedSkills.has(skillId)) return false;
    const def = SKILLS.find((s) => s.id === skillId);
    if (!def) return false;
    if (def.heroClass && def.heroClass !== this.heroClass) return false;
    if (this.skillPoints < (def.spCost ?? 1)) return false;
    if (this.level < (def.minLevel ?? 1)) return false;
    if (def.requires && !this.unlockedSkills.has(def.requires)) return false;
    return true;
  }

  public unlockSkill(skillId: string): boolean {
    if (!this.canUnlockSkill(skillId)) return false;
    const def = SKILLS.find((s) => s.id === skillId)!;
    this.skillPoints -= def.spCost ?? 1;
    this.unlockedSkills.add(skillId);
    this.hp = Math.min(this.getMaxHp(), this.hp + 15);
    this.energy = this.getMaxEnergy();
    this.emit();
    return true;
  }

  public getBeaconScale(): number {
    if (this.hasSkill('economy_beacon_4')) return 10;
    if (this.hasSkill('economy_beacon_3')) return 7;
    if (this.hasSkill('economy_beacon_2')) return 4.5;
    if (this.hasSkill('economy_beacon_1')) return 2.5;
    return 1;
  }

  public getLighthouseRadius(): number {
    if (this.hasSkill('economy_beacon_4')) return 160;
    if (this.hasSkill('economy_beacon_3')) return 144;
    if (this.hasSkill('economy_beacon_2')) return 128;
    if (this.hasSkill('economy_beacon_1')) return 112;
    return 96;
  }

  public getIslandCost(gx: number, gy: number): number {
    const spec = ISLANDS.find((i) => i.gx === gx && i.gy === gy);
    if (!spec) return 9999;
    const ownedCount = Math.max(0, this.ownedIslands.size - 1);
    let cost = scaledIslandCost(spec.baseCost, ownedCount);
    if (this.hasSkill('economy_land_baron')) {
      cost = Math.max(10, Math.round(cost * 0.75));
    }
    return cost;
  }

  public isIslandAdjacentToOwned(gx: number, gy: number): boolean {
    if (this.ownedIslands.has(`${gx},${gy}`)) return false;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    return dirs.some(([dx, dy]) => this.ownedIslands.has(`${gx + dx},${gy + dy}`));
  }

  public buyIsland(gx: number, gy: number): boolean {
    const key = `${gx},${gy}`;
    if (this.ownedIslands.has(key)) return false;
    if (!this.isIslandAdjacentToOwned(gx, gy)) return false;
    if (this.getIslandStoryLockReason(gx, gy)) return false;
    const cost = this.getIslandCost(gx, gy);
    if (this._coins < cost) return false;
    this.coins = this._coins - cost;
    this.ownedIslands.add(key);
    this.addXp(40);
    this.emit();
    return true;
  }

  public sellItem(itemId: string, count = 1): number {
    const def = ITEMS[itemId];
    if (!def || def.sellValue <= 0) return 0;
    const have = this.inventory[itemId] ?? 0;
    const qty = Math.min(have, count);
    if (qty <= 0) return 0;
    this.removeItem(itemId, qty);
    const mult = this.hasSkill('economy_barter') ? 1.5 : 1;
    const earned = Math.round(def.sellValue * qty * mult);
    this.coins = this._coins + earned;
    this.emit();
    return earned;
  }

  public getArmorDefense(): number {
    let armor = this.getEquippedStats().armor;
    if (this.hasSkill('magic_void_resilience')) armor += 15;
    if (this.hasSkill('fam_gl_t1')) armor += 2;
    if (this.hasSkill('fam_gl_t4')) armor += 4;
    if (this.hasSkill('fam_gl_t9')) armor += 12;
    return armor;
  }

  public getGatherDamage(activeToolId?: string): number {
    const eq = this.getEquippedStats();
    const activeDef = activeToolId ? ITEMS[activeToolId] : undefined;
    // Use equipped tool + trinket/armor gather bonus, or active hotbar tool if higher
    let base = Math.max(eq.gather, activeDef?.stats?.gather ?? 0);
    if (base <= 0) base = 10;
    if (this.heroClass === 'Beastmaster') base *= 1.15;
    if (this.hasSkill('foraging_gather')) base *= 1.25;
    if (this.hasSkill('foraging_apex_harvest')) base *= 1.4;
    if (this.hasSkill('fam_bm_t12')) base *= 1.15;
    return Math.round(base);
  }

  public getWeaponDamage(weaponId: string): number {
    const def = ITEMS[weaponId];
    if (def?.category === 'tool') return 1;
    const eq = this.getEquippedStats();
    const weaponInstId = this.equipment.weapon === weaponId ? this.equippedInstanceIds.weapon : undefined;
    let dmg = this.getGearStats(weaponId, weaponInstId).attack ?? 12;
    // Add passive attack from armor & trinkets
    if (this.equipment.armor) dmg += this.getGearStats(this.equipment.armor, this.equippedInstanceIds.armor).attack ?? 0;
    for (const ts of TRINKET_SLOTS) {
      const tid = this.equipment[ts];
      if (tid) dmg += this.getGearStats(tid, this.equippedInstanceIds[ts]).attack ?? 0;
    }
    if (def?.category === 'weapon' && def.id.startsWith('sword') && this.heroClass === 'Gladiator') {
      dmg *= 1.15;
    } else if (weaponId === 'bow' && this.heroClass === 'Swashbuckler') {
      dmg *= 1.15;
    } else if (def?.category === 'relic') {
      if (this.heroClass === 'Sorcerer') dmg *= 1.2;
      if (this.hasSkill('magic_archmage')) dmg *= 1.35;
      if (this.hasSkill('fam_so_t9') && this.energy >= this.getMaxEnergy() * 0.5) dmg *= 1.12;
    }
    if (def?.category === 'weapon' && def.id.startsWith('sword') && this.hasSkill('fam_gl_t10')) {
      dmg *= 1.15;
    }
    if (this.hasSkill('magic_critical')) dmg *= 1.25;
    if (this.hasSkill('magic_astral_surge')) dmg *= 1.25;
    // Also factor equipped weapon bonus if player swings with a relic/sword equipped
    if (!def?.equipSlot && eq.attack > 0) dmg += Math.round(eq.attack * 0.25);
    return Math.round(dmg);
  }

  public getRangedEnergyCost(itemId: string): number {
    const def = ITEMS[itemId];
    const base = def?.energyCost ?? 0;
    if (base <= 0) return 0;
    let mult = 1;
    if (def?.category === 'relic' && this.hasSkill('magic_archmage')) {
      mult *= 0.75;
    }
    if ((def?.category === 'relic' || def?.category === 'gadget') && this.hasSkill('fam_so_t3')) {
      mult *= 0.9;
    }
    if (def?.category === 'relic' && this.hasSkill('fam_so_t9')) {
      mult *= 0.8333; // ~25% total reduction with fam_so_t3 (0.9 * 0.8333 = 0.75)
    }
    return mult < 1 ? Math.max(1, Math.round(base * mult)) : base;
  }

  public getRawCritPct(extraPct = 0): number {
    let chance = (this.heroClass === 'Swashbuckler' ? 12 : 5) + this.getEquippedStats().critPct + extraPct;
    if (this.hasSkill('magic_critical')) chance += 20;
    if (this.hasSkill('magic_astral_surge')) chance += 15;
    return chance;
  }

  public getCritChance(extraPct = 0): number {
    const cap = this.hasSkill('fam_sw_t11') ? 0.95 : 0.85;
    return Math.min(cap, this.getRawCritPct(extraPct) / 100);
  }

  public getCritDamageMultiplier(isTargetMarked = false): number {
    let mult = 2.0;
    if (isTargetMarked && this.hasSkill('fam_sw_t7')) mult += 0.2;
    if (this.hasSkill('fam_sw_t11')) {
      const raw = this.getRawCritPct();
      if (raw > 80) mult += ((raw - 80) * 1.5) / 100;
    }
    return mult;
  }

  public getMoveSpeed(): number {
    let spd = this.heroClass === 'Swashbuckler' ? 84 : 76;
    const eqSpd = this.getEquippedStats().speedPct;
    spd *= 1 + eqSpd / 100;
    if (this.hasSkill('magic_swift')) spd *= 1.15;
    if (this.hasSkill('fam_bm_t12')) spd *= 1.15;
    if (this.hasSkill('fam_sw_t12')) spd *= 1.14;
    else if (this.hasSkill('fam_sw_t5')) spd *= 1.08;
    else if (this.hasSkill('fam_sw_t1')) spd *= 1.04;
    return Math.round(spd);
  }

  public getDashCooldownMs(): number {
    let cd = this.hasSkill('magic_swift') ? 630 : 900;
    if (this.hasSkill('fam_sw_t12')) cd = Math.round(cd * 0.75);
    else if (this.hasSkill('fam_sw_t5')) cd = Math.round(cd * 0.85);
    return cd;
  }

  public getPickupRadius(): number {
    let r = this.hasSkill('foraging_magnet') ? 76 : 38;
    if (this.hasTrinketEffect('pickup_magnet')) r += 26;
    return r;
  }

  public getFamiliarTier(): number {
    let highest = 0;
    for (const s of SKILLS) {
      if (s.pillar === 'familiar' && s.heroClass === this.heroClass && this.hasSkill(s.id)) {
        if (s.tier > highest) highest = s.tier;
      }
    }
    return highest;
  }

  public getFamiliarEnergyRegenPerSec(): number {
    if (this.hasSkill('fam_so_t12')) return 8;
    if (this.hasSkill('fam_so_t6')) return 4;
    if (this.hasSkill('fam_so_t2')) return 2;
    return 0;
  }

  public getFamiliarCombatProfile(): {
    tier: number;
    isApex: boolean;
    damage: number;
    cooldownMs: number;
    detectRange: number;
    followDist: number;
    attackStyle: 'melee' | 'ranged';
    projectileCount: number;
    pierceCount: number;
    canCrit: boolean;
    knockback: number;
  } {
    const tier = this.getFamiliarTier();
    const isApex = tier >= 12;
    const eqWeaponId = this.equipment.weapon || 'sword_wood';
    const baseWeaponAtk = Math.max(10, this.getWeaponDamage(eqWeaponId));

    // Tier 0 baseline: intentionally weak & close-leashed
    if (tier === 0) {
      return {
        tier: 0,
        isApex: false,
        damage: Math.max(2, Math.round(baseWeaponAtk * 0.1)),
        cooldownMs: 3200,
        detectRange: 56,
        followDist: 48,
        attackStyle: 'melee',
        projectileCount: 1,
        pierceCount: 0,
        canCrit: false,
        knockback: 0,
      };
    }

    if (this.heroClass === 'Beastmaster') {
      const scale = isApex ? 1.0 : this.hasSkill('fam_bm_t6') ? 0.6 : this.hasSkill('fam_bm_t3') ? 0.35 : 0.2;
      const cd = isApex ? 1100 : this.hasSkill('fam_bm_t8') ? 1500 : this.hasSkill('fam_bm_t3') ? 2000 : 2800;
      return {
        tier,
        isApex,
        damage: Math.max(3, Math.round(baseWeaponAtk * scale)),
        cooldownMs: cd,
        detectRange: 96,
        followDist: 48,
        attackStyle: 'melee',
        projectileCount: 1,
        pierceCount: 0,
        canCrit: this.hasSkill('fam_bm_t6'),
        knockback: 0,
      };
    }

    if (this.heroClass === 'Gladiator') {
      const scale = isApex ? 1.25 : this.hasSkill('fam_gl_t9') ? 0.9 : this.hasSkill('fam_gl_t6') ? 0.65 : this.hasSkill('fam_gl_t2') ? 0.3 : 0.15;
      const cd = isApex ? 1400 : this.hasSkill('fam_gl_t9') ? 1600 : this.hasSkill('fam_gl_t2') ? 2200 : 2800;
      return {
        tier,
        isApex,
        damage: Math.max(3, Math.round(baseWeaponAtk * scale)),
        cooldownMs: cd,
        detectRange: 88,
        followDist: 44,
        attackStyle: 'melee',
        projectileCount: 1,
        pierceCount: 0,
        canCrit: false,
        knockback: this.hasSkill('fam_gl_t2') ? 14 : 0,
      };
    }

    if (this.heroClass === 'Sorcerer') {
      const scale = isApex ? 0.9 : this.hasSkill('fam_so_t10') ? 0.7 : this.hasSkill('fam_so_t4') ? 0.45 : 0.25;
      const cd = isApex ? 1200 : this.hasSkill('fam_so_t10') ? 1500 : this.hasSkill('fam_so_t4') ? 2000 : 2600;
      const elemMult = this.hasSkill('fam_so_t7') ? 1.2 : 1.0;
      return {
        tier,
        isApex,
        damage: Math.max(3, Math.round(baseWeaponAtk * scale * elemMult)),
        cooldownMs: cd,
        detectRange: 120,
        followDist: 48,
        attackStyle: 'ranged',
        projectileCount: isApex ? 3 : this.hasSkill('fam_so_t10') ? 2 : 1,
        pierceCount: isApex ? 2 : 0,
        canCrit: this.hasSkill('fam_so_t11'),
        knockback: 0,
      };
    }

    // Swashbuckler
    const scale = isApex ? 0.95 : this.hasSkill('fam_sw_t8') ? 0.65 : this.hasSkill('fam_sw_t2') ? 0.25 : 0.15;
    const cd = isApex ? 1100 : this.hasSkill('fam_sw_t8') ? 1700 : this.hasSkill('fam_sw_t2') ? 2300 : 2900;
    return {
      tier,
      isApex,
      damage: Math.max(3, Math.round(baseWeaponAtk * scale)),
      cooldownMs: cd,
      detectRange: 128,
      followDist: 48,
      attackStyle: this.hasSkill('fam_sw_t2') ? 'ranged' : 'melee',
      projectileCount: isApex ? 3 : 1,
      pierceCount: isApex || this.hasSkill('fam_sw_t8') ? 2 : 0,
      canCrit: false,
      knockback: 0,
    };
  }

  // --- Quest System ---

  public getNextQuestForNpc(npcId: string): QuestDef | undefined {
    const chain = getQuestsForNpc(npcId);
    for (const q of chain) {
      if (this.completedQuests.has(q.id)) continue;
      if (q.prereqQuestId && !this.completedQuests.has(q.prereqQuestId)) continue;
      return q;
    }
    return undefined;
  }

  public isQuestActive(questId: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.activeQuests, questId);
  }

  public acceptQuest(questId: string): boolean {
    const def = getQuestById(questId);
    if (!def || this.completedQuests.has(questId) || this.isQuestActive(questId)) return false;
    if (def.prereqQuestId && !this.completedQuests.has(def.prereqQuestId)) return false;
    this.activeQuests[questId] = {};
    if (!this.trackedQuestId) {
      this.trackedQuestId = questId;
    }
    this.emit();
    return true;
  }

  public setTrackedQuest(questId: string | null): void {
    if (questId && !this.isQuestActive(questId)) return;
    this.trackedQuestId = questId;
    this.emit();
  }

  public getTrackedQuest(): QuestDef | undefined {
    if (!this.trackedQuestId || !this.isQuestActive(this.trackedQuestId)) return undefined;
    return getQuestById(this.trackedQuestId);
  }

  public getObjectiveProgress(questId: string, obj: QuestObjective): number {
    if (obj.type === 'collect') {
      return Math.min(obj.count, this.inventory[obj.targetId] ?? 0);
    }
    if (obj.type === 'clear_dungeon') {
      return this.clearedDungeons.has(obj.targetId as DungeonId) ? 1 : 0;
    }
    return Math.min(obj.count, this.activeQuests[questId]?.[obj.id] ?? 0);
  }

  public isQuestReadyToTurnIn(questId: string): boolean {
    const def = getQuestById(questId);
    if (!def || !this.isQuestActive(questId)) return false;
    return def.objectives.every((obj) => this.getObjectiveProgress(questId, obj) >= obj.count);
  }

  public recordQuestProgress(type: 'kill' | 'craft' | 'build', targetId: string, amount = 1): void {
    let changed = false;
    for (const questId of Object.keys(this.activeQuests)) {
      const def = getQuestById(questId);
      if (!def) continue;
      for (const obj of def.objectives) {
        if (obj.type === type && obj.targetId === targetId) {
          const prev = this.activeQuests[questId][obj.id] ?? 0;
          const next = Math.min(obj.count, prev + amount);
          if (next !== prev) {
            this.activeQuests[questId][obj.id] = next;
            changed = true;
          }
        }
      }
    }
    if (changed) this.emit();
  }

  public completeQuest(questId: string): QuestDef | null {
    const def = getQuestById(questId);
    if (!def || !this.isQuestReadyToTurnIn(questId)) return null;
    for (const obj of def.objectives) {
      if (obj.type === 'collect') {
        this.removeItem(obj.targetId, obj.count);
      }
    }
    delete this.activeQuests[questId];
    this.completedQuests.add(questId);
    this.coins += def.rewards.coins;
    if (def.rewards.items) {
      for (const it of def.rewards.items) {
        this.addItem(it.itemId, it.count);
      }
    }
    this.addXp(def.rewards.xp);
    if (this.trackedQuestId === questId) {
      const nextActive = Object.keys(this.activeQuests)[0] ?? null;
      this.trackedQuestId = nextActive;
    }
    this.emit();
    return def;
  }

  public addRanchCreature(speciesId: string, x: number, y: number, layIntervalMs: number): RanchCreatureSave {
    const rec: RanchCreatureSave = {
      id: `ranch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      speciesId,
      x,
      y,
      happiness: 65,
      layTimerMs: layIntervalMs,
      readyEggs: 0,
      lastPetAt: 0,
    };
    this.ranchCreatures.push(rec);
    this.emit();
    return rec;
  }

  public petRanchCreature(id: string, nowMs = Date.now()): { petted: boolean; happiness: number; eggsCollected: number } {
    const c = this.ranchCreatures.find((r) => r.id === id);
    if (!c) return { petted: false, happiness: 0, eggsCollected: 0 };
    const eggsCollected = c.readyEggs;
    c.readyEggs = 0;
    let petted = false;
    if (nowMs - c.lastPetAt >= 6000) {
      c.happiness = Math.min(100, c.happiness + 20);
      c.lastPetAt = nowMs;
      petted = true;
    }
    this.emit();
    return { petted, happiness: c.happiness, eggsCollected };
  }

  private getSlotKey(slot: SaveSlotIndex = this.activeSlotIndex): string {
    return `${SAVE_KEY}_slot_${slot}`;
  }

  public setActiveSlot(slot: SaveSlotIndex): void {
    this.activeSlotIndex = slot;
  }

  private migrateLegacySaveIfNeeded(): void {
    if (typeof localStorage === 'undefined') return;
    const slot0Key = this.getSlotKey(0);
    if (localStorage.getItem(slot0Key) !== null) return;
    for (const legacyKey of [SAVE_KEY, 'isles_of_foraging_save_v1']) {
      const raw = localStorage.getItem(legacyKey);
      if (raw) {
        localStorage.setItem(slot0Key, raw);
        localStorage.removeItem(legacyKey);
        break;
      }
    }
  }

  public save(slot: SaveSlotIndex = this.activeSlotIndex): void {
    if (typeof localStorage === 'undefined') return;
    this.activeSlotIndex = slot;
    const data: SaveData = {
      version: 3,
      heroClass: this.heroClass,
      hp: this.hp,
      energy: this.energy,
      xp: this.xp,
      level: this.level,
      skillPoints: this.skillPoints,
      coins: this._coins,
      unlockedSkills: [...this.unlockedSkills],
      unlockedBlueprints: [...this.unlockedBlueprints],
      ownedIslands: [...this.ownedIslands],
      clearedDungeons: [...this.clearedDungeons],
      completedQuests: [...this.completedQuests],
      activeQuests: this.activeQuests,
      trackedQuestId: this.trackedQuestId,
      bagSlots: this.bagSlots,
      equipment: this.equipment,
      gearInstances: this.gearInstances,
      equippedInstanceIds: this.equippedInstanceIds,
      hotbar: [...this.hotbar],
      selectedHotbarIndex: this.selectedHotbarIndex,
      buildings: this.buildings,
      overlays: this.overlays,
      savedNodes: this.savedNodes,
      savedDrops: this.savedDrops,
      ranchCreatures: this.ranchCreatures,
      voidSpireHighestFloor: this.voidSpireHighestFloor,
      finalBossDefeated: this.finalBossDefeated,
      seenMilestones: [...this.seenMilestones],
      activeAlerts: Object.fromEntries(this.activeAlerts.entries()),
      tutorialCompleted: this.tutorialCompleted,
      unlockedMenuTabs: [...this.unlockedMenuTabs],
      savedAt: Date.now(),
      playerPos: this.playerPos,
    };
    const key = this.getSlotKey(slot);
    const serialized = JSON.stringify(data);
    try {
      const prev = localStorage.getItem(key);
      if (prev) {
        localStorage.setItem(`${key}_backup`, prev);
      }
      localStorage.setItem(`${key}_tmp`, serialized);
      localStorage.setItem(key, serialized);
      localStorage.removeItem(`${key}_tmp`);
    } catch {
      try {
        localStorage.removeItem(`${key}_tmp`);
        localStorage.removeItem(`${key}_backup`);
        localStorage.setItem(key, serialized);
      } catch {
        // Ignore storage quota errors so saving never freezes gameplay
      }
    }
  }

  public hasSavedGame(slot: SaveSlotIndex = this.activeSlotIndex): boolean {
    if (typeof localStorage === 'undefined') return false;
    this.migrateLegacySaveIfNeeded();
    const key = this.getSlotKey(slot);
    return localStorage.getItem(key) !== null || localStorage.getItem(`${key}_backup`) !== null;
  }

  public hasAnySavedGame(): boolean {
    return ([0, 1, 2] as SaveSlotIndex[]).some((s) => this.hasSavedGame(s));
  }

  public deleteSlot(slot: SaveSlotIndex): void {
    if (typeof localStorage === 'undefined') return;
    const key = this.getSlotKey(slot);
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}_backup`);
    localStorage.removeItem(`${key}_tmp`);
  }

  public copySlot(fromSlot: SaveSlotIndex, toSlot: SaveSlotIndex): boolean {
    if (typeof localStorage === 'undefined' || fromSlot === toSlot) return false;
    this.migrateLegacySaveIfNeeded();
    const srcKey = this.getSlotKey(fromSlot);
    const raw = localStorage.getItem(srcKey) ?? localStorage.getItem(`${srcKey}_backup`);
    if (!raw) return false;
    const dstKey = this.getSlotKey(toSlot);
    localStorage.setItem(dstKey, raw);
    localStorage.removeItem(`${dstKey}_backup`);
    return true;
  }

  public peekSaveSummary(slot: SaveSlotIndex = this.activeSlotIndex): SaveSlotSummary | null {
    if (typeof localStorage === 'undefined') return null;
    this.migrateLegacySaveIfNeeded();
    const key = this.getSlotKey(slot);
    const raw = localStorage.getItem(key) ?? localStorage.getItem(`${key}_backup`);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw) as Partial<SaveData>;
      if (!data || typeof data.heroClass !== 'string') return null;
      const lvl = typeof data.level === 'number' && data.level >= 1 ? data.level : 1;
      const baseMaxHp = 100 + (lvl - 1) * 10 + (data.heroClass === 'Gladiator' ? 20 : 0);
      return {
        heroClass: data.heroClass,
        level: lvl,
        hp: typeof data.hp === 'number' && Number.isFinite(data.hp) ? Math.round(data.hp) : baseMaxHp,
        maxHp: baseMaxHp,
        coins: typeof data.coins === 'number' && Number.isFinite(data.coins) ? data.coins : 0,
        islands: Array.isArray(data.ownedIslands) ? data.ownedIslands.length : 1,
        dungeonsCleared: Array.isArray(data.clearedDungeons) ? data.clearedDungeons.length : 0,
        voidSpireFloor: typeof data.voidSpireHighestFloor === 'number' ? data.voidSpireHighestFloor : 0,
        savedAt: typeof data.savedAt === 'number' ? data.savedAt : undefined,
      };
    } catch {
      return null;
    }
  }

  public sortBag(): void {
    const merged = new Map<string, { itemId: string; count: number; instanceId?: string }>();
    const uniques: Array<{ itemId: string; count: number; instanceId?: string }> = [];
    for (const s of this.bagSlots) {
      if (!s || s.count <= 0) continue;
      if (s.instanceId) {
        uniques.push({ ...s });
      } else {
        const cur = merged.get(s.itemId);
        if (cur) cur.count += s.count;
        else merged.set(s.itemId, { ...s });
      }
    }
    const rarityRank: Record<string, number> = { relic: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
    const catRank: Record<string, number> = {
      weapon: 0,
      tool: 1,
      armor: 2,
      accessory: 3,
      relic: 4,
      gadget: 5,
      food: 6,
      consumable: 7,
      material: 8,
    };
    const combined = [...uniques, ...merged.values()].sort((a, b) => {
      const da = ITEMS[a.itemId];
      const db = ITEMS[b.itemId];
      const ca = catRank[da?.category ?? 'material'] ?? 9;
      const cb = catRank[db?.category ?? 'material'] ?? 9;
      if (ca !== cb) return ca - cb;
      const ra = rarityRank[da?.rarity ?? 'common'] ?? 9;
      const rb = rarityRank[db?.rarity ?? 'common'] ?? 9;
      if (ra !== rb) return ra - rb;
      return (da?.name ?? a.itemId).localeCompare(db?.name ?? b.itemId);
    });
    this.bagSlots = Array.from({ length: BAG_SIZE }, (_, i) => combined[i] ?? null);
    this.emit();
  }

  public load(slot: SaveSlotIndex = this.activeSlotIndex): boolean {
    if (typeof localStorage === 'undefined') return false;
    this.migrateLegacySaveIfNeeded();
    this.activeSlotIndex = slot;
    const key = this.getSlotKey(slot);
    const primary = localStorage.getItem(key);
    if (primary && this.tryApplySave(primary)) return true;
    const backup = localStorage.getItem(`${key}_backup`);
    if (backup && this.tryApplySave(backup)) {
      localStorage.setItem(key, backup);
      return true;
    }
    return false;
  }

  private tryApplySave(raw: string): boolean {
    try {
      const data = JSON.parse(raw) as Partial<SaveData>;
      if (!data || typeof data !== 'object' || typeof data.heroClass !== 'string') {
        return false;
      }
      this.heroClass = data.heroClass;
      this.hp = typeof data.hp === 'number' && Number.isFinite(data.hp) ? data.hp : 100;
      this.energy = typeof data.energy === 'number' && Number.isFinite(data.energy) ? data.energy : 100;
      this.xp = typeof data.xp === 'number' && Number.isFinite(data.xp) ? data.xp : 0;
      this.level = typeof data.level === 'number' && data.level >= 1 ? data.level : 1;
      this.skillPoints = typeof data.skillPoints === 'number' && data.skillPoints >= 0 ? data.skillPoints : 0;
      this._coins = typeof data.coins === 'number' && Number.isFinite(data.coins) ? data.coins : 25;
      this.unlockedSkills = new Set(Array.isArray(data.unlockedSkills) ? data.unlockedSkills : []);
      this.unlockedBlueprints = new Set(Array.isArray(data.unlockedBlueprints) ? data.unlockedBlueprints : []);
      this.ownedIslands = new Set(Array.isArray(data.ownedIslands) && data.ownedIslands.length ? data.ownedIslands : ['2,2']);
      this.clearedDungeons = new Set(Array.isArray(data.clearedDungeons) ? data.clearedDungeons : []);
      const legacyMap: Record<string, string> = {
        farmer: 'farmer_1',
        fisherman: 'fisherman_1',
        blacksmith: 'blacksmith_1',
        alchemist: 'alchemist_1',
      };
      this.completedQuests = new Set(
        (data.completedQuests ?? []).map((id) => legacyMap[id] ?? id),
      );
      this.activeQuests = data.activeQuests ?? {};
      this.trackedQuestId = data.trackedQuestId ?? null;
      if (Array.isArray(data.bagSlots) && data.bagSlots.length === BAG_SIZE) {
        this.bagSlots = data.bagSlots;
      } else if (data.inventory) {
        this.inventory = data.inventory;
      }
      const loadedEq = data.equipment ?? {};
      this.equipment = {
        weapon: loadedEq.weapon === undefined ? 'sword' : loadedEq.weapon,
        tool: loadedEq.tool === undefined ? 'pickaxe' : loadedEq.tool,
        armor: loadedEq.armor ?? null,
        trinket1: loadedEq.trinket1 ?? loadedEq.accessory ?? null,
        trinket2: loadedEq.trinket2 ?? null,
        trinket3: loadedEq.trinket3 ?? null,
      };
      this.gearInstances = data.gearInstances ?? {};
      this.equippedInstanceIds = data.equippedInstanceIds ?? {};
      this.hotbar = Array.isArray(data.hotbar)
        ? data.hotbar
        : ['pickaxe', 'sword', 'shovel', 'fishing_rod', 'berries', '', '', '', ''];
      this.selectedHotbarIndex = typeof data.selectedHotbarIndex === 'number' ? data.selectedHotbarIndex : 0;
      this.buildings = Array.isArray(data.buildings) ? data.buildings : [];
      this.overlays = Array.isArray(data.overlays) ? data.overlays : [];
      this.savedNodes = data.savedNodes;
      this.savedDrops = data.savedDrops;
      this.ranchCreatures = Array.isArray(data.ranchCreatures) ? data.ranchCreatures : [];
      this.voidSpireHighestFloor = data.voidSpireHighestFloor ?? 0;
      this.finalBossDefeated = data.finalBossDefeated ?? false;
      this.seenMilestones = new Set(Array.isArray(data.seenMilestones) ? data.seenMilestones : []);
      this.activeAlerts = new Map(
        data.activeAlerts && typeof data.activeAlerts === 'object' ? Object.entries(data.activeAlerts) : [],
      );
      this.tutorialCompleted = data.tutorialCompleted ?? true;
      this.unlockedMenuTabs = new Set<MenuTabId>(
        Array.isArray(data.unlockedMenuTabs)
          ? data.unlockedMenuTabs
          : this.tutorialCompleted
            ? ALL_MENU_TABS
            : [],
      );
      this.playerPos = data.playerPos;
      this.emit();
      return true;
    } catch {
      return false;
    }
  }

  // --- Debug Mode & Reset / Erase Helpers ---

  public toggleDebugMode(): void {
    this.debugMode = !this.debugMode;
    this.emit();
  }

  public debugAddResourcesPreset(): void {
    const mats = [
      'wood',
      'stone',
      'coal',
      'iron_ore',
      'gold_ore',
      'crystal',
      'obsidian',
      'iron_ingot',
      'gold_ingot',
      'slime_gel',
      'bone',
      'amber',
      'demon_horn',
    ];
    for (const id of mats) {
      this.addItem(id, 50);
    }
    this.coins = this._coins + 500;
    this.emit();
  }

  public debugAddConsumablesPreset(): void {
    for (const id of ['berries', 'carrot', 'fish', 'cooked_fish', 'potion_red', 'potion_blue', 'bomb']) {
      this.addItem(id, 10);
    }
  }

  public debugAddLevels(count: number): void {
    for (let i = 0; i < count; i++) {
      this.applyLevelUp();
    }
    this.xp = 0;
    this.emit();
  }

  public debugUnlockAllSkills(): void {
    for (const sk of SKILLS) {
      this.unlockedSkills.add(sk.id);
    }
    this.hp = this.getMaxHp();
    this.energy = this.getMaxEnergy();
    this.emit();
  }

  public debugUnlockAllRelics(): void {
    for (const id of ['bow', 'necro_rod', 'thunder_rod', 'ice_rod', 'fire_rod']) {
      if (!this.isGearOwned(id)) {
        this.addItem(id, 1);
      }
    }
  }

  public eraseAllSavedData(): void {
    if (typeof localStorage !== 'undefined') {
      for (const k of LEGACY_SAVE_KEYS) {
        localStorage.removeItem(k);
      }
      localStorage.clear();
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
    this.reset(this.heroClass);
  }
}

export const gameState = new GameState();
