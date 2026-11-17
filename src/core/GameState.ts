import { ITEMS, type EquipSlot, type GearStats, type ItemRarity } from '../data/items';
import { ISLANDS, STORY_CHAPTERS, getBiomeChapter, type DungeonId } from '../data/islands';
import { getQuestById, getQuestsForNpc, type QuestDef, type QuestObjective } from '../data/quests';
import { RECIPES, type RecipeDef, type StructureType } from '../data/recipes';
import { SKILLS } from '../data/skills';

export type HeroClassId = 'Beastmaster' | 'Gladiator' | 'Sorcerer' | 'Swashbuckler';
export type EquipmentSlotKey = 'weapon' | 'tool' | 'armor' | 'trinket1' | 'trinket2' | 'trinket3';

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
  playerPos?: { x: number; y: number };
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
  public debugMode = true;
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
    this.playerPos = undefined;
    this.hp = this.getMaxHp();
    this.energy = this.getMaxEnergy();
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
    const coinCost = 35 + refCount * 20;
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
    return base;
  }

  public getMaxEnergy(): number {
    let base = 60 + (this.level - 1) * 6 + this.getEquippedStats().maxEnergy;
    if (this.hasSkill('foraging_magnet')) base += 40;
    if (this.hasSkill('foraging_apex_harvest')) base += 30;
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
    return Math.round(45 + this.level * 30 + this.level * this.level * 4);
  }

  public addXp(amount: number): boolean {
    this.xp += amount;
    let leveled = false;
    while (this.xp >= this.getXpForNextLevel()) {
      this.xp -= this.getXpForNextLevel();
      this.level += 1;
      this.skillPoints += 1;
      this.hp = this.getMaxHp();
      this.energy = this.getMaxEnergy();
      leveled = true;
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
    this.emit();
    return true;
  }

  public canCraft(recipe: RecipeDef): boolean {
    if (!this.isRecipeUnlocked(recipe)) return false;
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
    const isBuild = recipe.station === 'build';
    for (const ing of recipe.ingredients) {
      const needed = this.getStructureCostCount(ing.itemId, ing.count, isBuild);
      this.removeItem(ing.itemId, needed);
    }
    return true;
  }

  public refundIngredients(recipe: RecipeDef): void {
    const isBuild = recipe.station === 'build';
    for (const ing of recipe.ingredients) {
      const count = this.getStructureCostCount(ing.itemId, ing.count, isBuild);
      this.addItem(ing.itemId, count);
    }
  }

  public canUnlockSkill(skillId: string): boolean {
    if (this.skillPoints <= 0 || this.unlockedSkills.has(skillId)) return false;
    const def = SKILLS.find((s) => s.id === skillId);
    if (!def) return false;
    if (def.requires && !this.unlockedSkills.has(def.requires)) return false;
    return true;
  }

  public unlockSkill(skillId: string): boolean {
    if (!this.canUnlockSkill(skillId)) return false;
    this.skillPoints -= 1;
    this.unlockedSkills.add(skillId);
    this.hp = Math.min(this.getMaxHp(), this.hp + 15);
    this.energy = this.getMaxEnergy();
    this.emit();
    return true;
  }

  public getIslandCost(gx: number, gy: number): number {
    const spec = ISLANDS.find((i) => i.gx === gx && i.gy === gy);
    if (!spec) return 9999;
    const ownedCount = Math.max(0, this.ownedIslands.size - 1);
    let cost = spec.baseCost + ownedCount * 15;
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
    return Math.round(base);
  }

  public getWeaponDamage(weaponId: string): number {
    const def = ITEMS[weaponId];
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
    if (def?.category === 'relic' && this.hasSkill('magic_archmage')) {
      return Math.max(1, Math.round(base * 0.75));
    }
    return base;
  }

  public getCritChance(extraPct = 0): number {
    let chance = (this.heroClass === 'Swashbuckler' ? 12 : 5) + this.getEquippedStats().critPct + extraPct;
    if (this.hasSkill('magic_critical')) chance += 20;
    if (this.hasSkill('magic_astral_surge')) chance += 15;
    return Math.min(0.85, chance / 100);
  }

  public getMoveSpeed(): number {
    let spd = this.heroClass === 'Swashbuckler' ? 84 : 76;
    const eqSpd = this.getEquippedStats().speedPct;
    spd *= 1 + eqSpd / 100;
    if (this.hasSkill('magic_swift')) spd *= 1.15;
    return Math.round(spd);
  }

  public getDashCooldownMs(): number {
    return this.hasSkill('magic_swift') ? 630 : 900;
  }

  public getPickupRadius(): number {
    let r = this.hasSkill('foraging_magnet') ? 76 : 38;
    if (this.hasTrinketEffect('pickup_magnet')) r += 26;
    return r;
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

  public save(): void {
    if (typeof localStorage === 'undefined') return;
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
      playerPos: this.playerPos,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }

  public hasSavedGame(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(SAVE_KEY) !== null;
  }

  public load(): boolean {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw) as SaveData;
      this.heroClass = data.heroClass;
      this.hp = data.hp;
      this.energy = data.energy;
      this.xp = data.xp;
      this.level = data.level;
      this.skillPoints = data.skillPoints;
      this._coins = data.coins ?? 25;
      this.unlockedSkills = new Set(data.unlockedSkills);
      this.unlockedBlueprints = new Set(data.unlockedBlueprints ?? []);
      this.ownedIslands = new Set(data.ownedIslands);
      this.clearedDungeons = new Set(data.clearedDungeons);
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
        weapon: loadedEq.weapon ?? 'sword',
        tool: loadedEq.tool ?? 'pickaxe',
        armor: loadedEq.armor ?? null,
        trinket1: loadedEq.trinket1 ?? loadedEq.accessory ?? null,
        trinket2: loadedEq.trinket2 ?? null,
        trinket3: loadedEq.trinket3 ?? null,
      };
      this.gearInstances = data.gearInstances ?? {};
      this.equippedInstanceIds = data.equippedInstanceIds ?? {};
      this.hotbar = data.hotbar ?? ['pickaxe', 'sword', 'shovel', 'fishing_rod', 'berries', '', '', '', ''];
      this.selectedHotbarIndex = data.selectedHotbarIndex ?? 0;
      this.buildings = data.buildings ?? [];
      this.overlays = data.overlays ?? [];
      this.savedNodes = data.savedNodes;
      this.savedDrops = data.savedDrops;
      this.ranchCreatures = data.ranchCreatures ?? [];
      this.voidSpireHighestFloor = data.voidSpireHighestFloor ?? 0;
      this.finalBossDefeated = data.finalBossDefeated ?? false;
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
      this.level += 1;
      this.skillPoints += 1;
    }
    this.xp = 0;
    this.hp = this.getMaxHp();
    this.energy = this.getMaxEnergy();
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
