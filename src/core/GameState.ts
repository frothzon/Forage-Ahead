import { ITEMS, type EquipSlot, type GearStats } from '../data/items';
import { ISLANDS, type DungeonId } from '../data/islands';
import { RECIPES, type RecipeDef, type StructureType } from '../data/recipes';
import { SKILLS } from '../data/skills';

export type HeroClassId = 'Beastmaster' | 'Gladiator' | 'Sorcerer' | 'Swashbuckler';

export const BAG_COLS = 6;
export const BAG_ROWS = 5;
export const BAG_SIZE = BAG_COLS * BAG_ROWS; // 30 slots

export interface BagSlot {
  itemId: string;
  count: number;
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
  ownedIslands: string[];
  clearedDungeons: DungeonId[];
  completedQuests: string[];
  bagSlots?: Array<BagSlot | null>;
  inventory?: Record<string, number>;
  equipment?: Record<EquipSlot, string | null>;
  hotbar: string[];
  selectedHotbarIndex: number;
  buildings: PlacedBuildingSave[];
  overlays: Array<{ tx: number; ty: number; type: 'dirt' | 'road' | 'bridge' }>;
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
  public ownedIslands = new Set<string>(['2,2']);
  public clearedDungeons = new Set<DungeonId>();
  public completedQuests = new Set<string>();

  public bagSlots: Array<BagSlot | null> = Array.from({ length: BAG_SIZE }, () => null);
  public equipment: Record<EquipSlot, string | null> = {
    weapon: 'sword',
    tool: 'pickaxe',
    armor: null,
    accessory: null,
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
    this.ownedIslands = new Set(['2,2']);
    this.clearedDungeons = new Set();
    this.completedQuests = new Set();

    this.equipment = {
      weapon: 'sword',
      tool: 'pickaxe',
      armor: null,
      accessory: null,
    };

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
    this.playerPos = undefined;
    this.hp = this.getMaxHp();
    this.energy = this.getMaxEnergy();
    this.emit();
  }

  public hasSkill(id: string): boolean {
    return this.unlockedSkills.has(id);
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
    for (const slot of ['weapon', 'tool', 'armor', 'accessory'] as EquipSlot[]) {
      const id = this.equipment[slot];
      if (!id) continue;
      const st = ITEMS[id]?.stats;
      if (!st) continue;
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

  public compareGearStats(candidateItemId: string): {
    slot: EquipSlot;
    equippedId: string | null;
    rows: StatComparisonRow[];
  } | null {
    const def = ITEMS[candidateItemId];
    if (!def?.equipSlot) return null;
    const slot = def.equipSlot;
    const equippedId = this.equipment[slot];
    const cand = def.stats ?? {};
    const eq = equippedId ? ITEMS[equippedId]?.stats ?? {} : {};

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
    let base = 100 + (this.level - 1) * 10 + this.getEquippedStats().maxHp;
    if (this.heroClass === 'Gladiator') base += 20;
    if (this.hasSkill('magic_vitality')) base += 40;
    return base;
  }

  public getMaxEnergy(): number {
    let base = 100 + (this.level - 1) * 5 + this.getEquippedStats().maxEnergy;
    if (this.hasSkill('foraging_magnet')) base += 40;
    return base;
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
    for (const slot of ['weapon', 'tool', 'armor', 'accessory'] as EquipSlot[]) {
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
      if ((def.category === 'food' || def.category === 'consumable') && !this.hotbar.includes(itemId)) {
        const emptyHb = this.hotbar.indexOf('');
        if (emptyHb !== -1) this.hotbar[emptyHb] = itemId;
      }
    } else {
      for (let i = 0; i < count; i++) {
        const emptyIdx = this.bagSlots.findIndex((s) => s === null);
        if (emptyIdx !== -1) {
          this.bagSlots[emptyIdx] = { itemId, count: 1 };
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

  public equipFromBag(bagIdx: number, targetSlot?: EquipSlot): boolean {
    const slotItem = this.bagSlots[bagIdx];
    if (!slotItem) return false;
    const def = ITEMS[slotItem.itemId];
    if (!def?.equipSlot) return false;
    if (targetSlot && def.equipSlot !== targetSlot) return false;

    const eqSlot = def.equipSlot;
    const prevEquipped = this.equipment[eqSlot];
    this.equipment[eqSlot] = slotItem.itemId;
    this.bagSlots[bagIdx] = prevEquipped ? { itemId: prevEquipped, count: 1 } : null;

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

  public unequipToBag(eqSlot: EquipSlot, toBagIdx?: number): boolean {
    const itemId = this.equipment[eqSlot];
    if (!itemId) return false;
    const dest =
      toBagIdx !== undefined && toBagIdx >= 0 && toBagIdx < BAG_SIZE && this.bagSlots[toBagIdx] === null
        ? toBagIdx
        : this.bagSlots.findIndex((s) => s === null);
    if (dest === -1) return false;
    this.bagSlots[dest] = { itemId, count: 1 };
    this.equipment[eqSlot] = null;
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

  public canCraft(recipe: RecipeDef): boolean {
    if (recipe.requiresSkill && !this.hasSkill(recipe.requiresSkill)) return false;
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
    return this.getEquippedStats().armor;
  }

  public getGatherDamage(activeToolId?: string): number {
    const eq = this.getEquippedStats();
    const activeDef = activeToolId ? ITEMS[activeToolId] : undefined;
    // Use equipped tool + accessory/armor gather bonus, or active hotbar tool if higher
    let base = Math.max(eq.gather, activeDef?.stats?.gather ?? 0);
    if (this.equipment.accessory) base += ITEMS[this.equipment.accessory]?.stats?.gather ?? 0;
    if (base <= 0) base = 10;
    if (this.heroClass === 'Beastmaster') base *= 1.15;
    if (this.hasSkill('foraging_gather')) base *= 1.25;
    return Math.round(base);
  }

  public getWeaponDamage(weaponId: string): number {
    const def = ITEMS[weaponId];
    const eq = this.getEquippedStats();
    let dmg = def?.stats?.attack ?? 12;
    // Add passive attack from armor & accessory
    if (this.equipment.armor) dmg += ITEMS[this.equipment.armor]?.stats?.attack ?? 0;
    if (this.equipment.accessory) dmg += ITEMS[this.equipment.accessory]?.stats?.attack ?? 0;
    if (def?.category === 'weapon' && def.id.startsWith('sword') && this.heroClass === 'Gladiator') {
      dmg *= 1.15;
    } else if (weaponId === 'bow' && this.heroClass === 'Swashbuckler') {
      dmg *= 1.15;
    } else if (def?.category === 'relic') {
      if (this.heroClass === 'Sorcerer') dmg *= 1.2;
      if (this.hasSkill('magic_archmage')) dmg *= 1.35;
    }
    if (this.hasSkill('magic_critical')) dmg *= 1.25;
    // Also factor equipped weapon bonus if player swings with a relic/sword equipped
    if (!def?.equipSlot && eq.attack > 0) dmg += Math.round(eq.attack * 0.25);
    return Math.round(dmg);
  }

  public getCritChance(): number {
    let chance = (this.heroClass === 'Swashbuckler' ? 12 : 5) + this.getEquippedStats().critPct;
    if (this.hasSkill('magic_critical')) chance += 20;
    return Math.min(0.85, chance / 100);
  }

  public getMoveSpeed(): number {
    let spd = this.heroClass === 'Swashbuckler' ? 102 : 92;
    const eqSpd = this.getEquippedStats().speedPct;
    spd *= 1 + eqSpd / 100;
    if (this.hasSkill('magic_swift')) spd *= 1.15;
    return Math.round(spd);
  }

  public getDashCooldownMs(): number {
    return this.hasSkill('magic_swift') ? 630 : 900;
  }

  public getPickupRadius(): number {
    return this.hasSkill('foraging_magnet') ? 76 : 38;
  }

  public save(): void {
    if (typeof localStorage === 'undefined') return;
    const data: SaveData = {
      version: 2,
      heroClass: this.heroClass,
      hp: this.hp,
      energy: this.energy,
      xp: this.xp,
      level: this.level,
      skillPoints: this.skillPoints,
      coins: this._coins,
      unlockedSkills: [...this.unlockedSkills],
      ownedIslands: [...this.ownedIslands],
      clearedDungeons: [...this.clearedDungeons],
      completedQuests: [...this.completedQuests],
      bagSlots: this.bagSlots,
      equipment: this.equipment,
      hotbar: [...this.hotbar],
      selectedHotbarIndex: this.selectedHotbarIndex,
      buildings: this.buildings,
      overlays: this.overlays,
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
      this.ownedIslands = new Set(data.ownedIslands);
      this.clearedDungeons = new Set(data.clearedDungeons);
      this.completedQuests = new Set(data.completedQuests);
      if (Array.isArray(data.bagSlots) && data.bagSlots.length === BAG_SIZE) {
        this.bagSlots = data.bagSlots;
      } else if (data.inventory) {
        this.inventory = data.inventory;
      }
      this.equipment = data.equipment ?? {
        weapon: 'sword',
        tool: 'pickaxe',
        armor: null,
        accessory: null,
      };
      this.hotbar = data.hotbar ?? ['pickaxe', 'sword', 'shovel', 'fishing_rod', 'berries', '', '', '', ''];
      this.selectedHotbarIndex = data.selectedHotbarIndex ?? 0;
      this.buildings = data.buildings ?? [];
      this.overlays = data.overlays ?? [];
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
