import {
  BAG_COLS,
  BAG_SIZE,
  gameState,
  type CraftQueueJob,
  type InventoryFeedEvent,
} from '../core/GameState';

export interface StationQueueView {
  id: string;
  type: 'furnace' | 'anvil' | 'bonfire';
  maxQueueSize: number;
  craftQueue: CraftQueueJob[];
}
import { SFX } from '../core/SoundFX';
import { ITEMS, RARITY_COLOR, type EquipSlot } from '../data/items';
import { ISLANDS, WORLD_GRID_SIZE, getIslandAt } from '../data/islands';
import { MONSTERS } from '../data/monsters';
import { IMPLEMENTED_FEATURES, OUTSTANDING_ITEMS } from '../data/projectProgress';
import { RECIPES, type CraftingStation } from '../data/recipes';
import { PILLAR_META, SKILLS, type SkillPillar } from '../data/skills';

export type HudModal = 'none' | 'inventory' | 'craft' | 'skills' | 'map' | 'progress';

export interface WorldDebugStats {
  scene: string;
  playerTx: number;
  playerTy: number;
  nodesCount: number;
  enemiesCount: number;
  buildingsCount: number;
  activeCraftJobs: number;
  hasSavedData: boolean;
}

type DragPayload =
  | { source: 'bag'; bagIdx: number; itemId: string }
  | { source: 'equip'; slot: EquipSlot; itemId: string }
  | { source: 'hotbar'; hotbarIdx: number; itemId: string };

type SelectedInspection =
  | { kind: 'bag'; bagIdx: number; itemId: string }
  | { kind: 'equip'; slot: EquipSlot; itemId: string }
  | null;

const EQUIP_SLOT_LABELS: Record<EquipSlot, string> = {
  weapon: 'Main Hand',
  tool: 'Tool',
  armor: 'Armor',
  accessory: 'Accessory',
};

export class HudController {
  private root: HTMLElement;
  private chromeLayer!: HTMLElement;
  private modalLayer!: HTMLElement;
  private hotbarLayer!: HTMLElement;
  private feedLayer!: HTMLElement;
  private bannerLayer!: HTMLElement;

  public activeModal: HudModal = 'none';
  public activeStationTab: CraftingStation = 'build';
  public activeStationId: string | null = null;
  private selectedInspect: SelectedInspection = null;
  private moveSourceBagIdx: number | null = null;
  private dragPayload: DragPayload | null = null;

  private unsubChange?: () => void;
  private unsubVitals?: () => void;
  private unsubFeed?: () => void;
  private chromeBuilt = false;
  private toastTimer?: number;
  private toastMsg = '';
  private timeLabelText = 'Day 13:40';
  private bossInfo: { name: string; hp: number; maxHp: number; portrait?: string } | null = null;

  private callbacks: {
    onBuyIsland: (gx: number, gy: number) => void;
    onSelectBuild: (recipeId: string) => void;
    onUseHotbarItem: (itemId: string) => void;
    onSave: () => void;
    getStations?: (stationType: 'furnace' | 'anvil' | 'bonfire') => StationQueueView[];
    onEnqueueCraft?: (stationId: string, recipeId: string) => boolean;
    onCancelCraft?: (stationId: string, queueIdx: number) => boolean;
    getWorldDebugStats?: () => WorldDebugStats;
    onDebugAction?: (action: string, payload?: string) => void;
  };

  constructor(callbacks: {
    onBuyIsland: (gx: number, gy: number) => void;
    onSelectBuild: (recipeId: string) => void;
    onUseHotbarItem: (itemId: string) => void;
    onSave: () => void;
    getStations?: (stationType: 'furnace' | 'anvil' | 'bonfire') => StationQueueView[];
    onEnqueueCraft?: (stationId: string, recipeId: string) => boolean;
    onCancelCraft?: (stationId: string, queueIdx: number) => boolean;
    getWorldDebugStats?: () => WorldDebugStats;
    onDebugAction?: (action: string, payload?: string) => void;
  }) {
    this.callbacks = callbacks;
    const el = document.getElementById('hud-root');
    if (!el) throw new Error('#hud-root missing');
    this.root = el;
    this.injectStyles();
    this.setupLayers();

    this.unsubChange = gameState.onChange(() => this.render());
    this.unsubVitals = gameState.onVitalsChange(() => this.updateVitalsInPlace());
    this.unsubFeed = gameState.onInventoryFeed((ev) => this.pushInventoryFeed(ev));
    this.render();
  }

  public isBlockingInput(): boolean {
    return this.activeModal !== 'none';
  }

  public destroy(): void {
    this.unsubChange?.();
    this.unsubVitals?.();
    this.unsubFeed?.();
    this.chromeBuilt = false;
    this.root.innerHTML = '';
  }

  public toggleModal(modal: HudModal, station?: CraftingStation, stationId?: string): void {
    if (station) this.activeStationTab = station;
    if (stationId) this.activeStationId = stationId;
    else if (station) this.activeStationId = null;

    if (this.activeModal === modal && !station) {
      this.activeModal = 'none';
    } else {
      this.activeModal = modal;
    }
    this.moveSourceBagIdx = null;
    if (this.activeModal === 'inventory' && !this.selectedInspect) {
      const firstBag = gameState.bagSlots.findIndex((s) => s !== null);
      if (firstBag !== -1) {
        this.selectedInspect = { kind: 'bag', bagIdx: firstBag, itemId: gameState.bagSlots[firstBag]!.itemId };
      } else if (gameState.equipment.weapon) {
        this.selectedInspect = { kind: 'equip', slot: 'weapon', itemId: gameState.equipment.weapon };
      }
    }
    this.render();
  }

  public showToast(msg: string): void {
    this.toastMsg = msg;
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastMsg = '';
      this.renderBanners();
    }, 2500);
    this.renderBanners();
  }

  public setBossBar(boss: { name: string; hp: number; maxHp: number; portrait?: string } | null): void {
    this.bossInfo = boss;
    this.renderBanners();
  }

  public setTimeLabel(label: string): void {
    this.timeLabelText = label;
    const el = this.chromeLayer.querySelector<HTMLElement>('#hud-time-badge');
    if (el) el.textContent = label;
  }

  private setupLayers(): void {
    this.root.innerHTML = '';
    this.chromeLayer = document.createElement('div');
    this.bannerLayer = document.createElement('div');
    this.feedLayer = document.createElement('div');
    this.feedLayer.className = 'item-feed-stack';
    this.modalLayer = document.createElement('div');
    this.hotbarLayer = document.createElement('div');

    this.root.append(
      this.chromeLayer,
      this.bannerLayer,
      this.feedLayer,
      this.modalLayer,
      this.hotbarLayer,
    );

    // Prevent clicks on ANY interactive HUD layer from reaching the Phaser canvas
    const stopCanvasLeak = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('.hud-interactive')) {
        e.stopPropagation();
      }
    };
    this.root.addEventListener('pointerdown', stopCanvasLeak);
    this.root.addEventListener('mousedown', stopCanvasLeak);
    this.root.addEventListener('contextmenu', (e) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('.hud-interactive')) e.preventDefault();
    });
  }

  private pushInventoryFeed(ev: InventoryFeedEvent): void {
    if (!this.feedLayer) return;

    // Ascending vertical order: oldest at top, newest appended to bottom.
    // Push off oldest from the top if more than 6 entries are visible.
    while (this.feedLayer.children.length >= 6) {
      const oldest = this.feedLayer.firstElementChild as HTMLElement | null;
      if (!oldest) break;
      oldest.remove();
    }

    const row = document.createElement('div');
    row.className = 'item-feed-row';
    const isAdd = ev.delta > 0;
    const sign = isAdd ? `+${ev.delta}` : `${ev.delta}`;
    const diffColor = isAdd ? '#6ee88a' : '#ff6b78';
    const iconHtml = ev.iconKey
      ? `<img src="assets/${ev.iconKey}.png" class="px-icon" style="width:16px; height:16px;" />`
      : '';

    row.innerHTML = `
      ${iconHtml}
      <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${ev.name}</span>
      <span style="color:${diffColor}; font-weight:700;">${sign}</span>
      <span style="color:#9db6cf; font-size:10px;">(${ev.total})</span>
    `;
    this.feedLayer.appendChild(row);

    // Trigger entry slide-in
    requestAnimationFrame(() => row.classList.add('show'));

    // Expire & fade out smoothly
    window.setTimeout(() => {
      row.classList.remove('show');
      row.classList.add('fade-out');
      window.setTimeout(() => row.remove(), 360);
    }, 3000);
  }

  private injectStyles(): void {
    if (document.getElementById('forager-hud-styles')) return;
    const style = document.createElement('style');
    style.id = 'forager-hud-styles';
    style.textContent = `
      .px-icon { image-rendering: pixelated; object-fit: contain; flex-shrink: 0; }
      .hud-panel {
        background: rgba(14, 22, 35, 0.94);
        border: 2px solid #486485;
        border-radius: 6px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.55);
        color: #f6eedc;
      }
      .hud-btn {
        background: #22344d;
        border: 1.5px solid #58789c;
        color: #f6eedc;
        border-radius: 4px;
        padding: 5px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background 100ms ease, border-color 100ms ease;
      }
      .hud-btn:hover:not(:disabled) { background: #30496b; border-color: #8bb4e0; }
      .hud-btn:disabled { opacity: 0.42; cursor: not-allowed; }
      .hud-btn.primary { background: #327a4a; border-color: #7ae398; }
      .hud-btn.primary:hover:not(:disabled) { background: #3e965b; }
      .hud-btn.gold { background: #8f6b1e; border-color: #ffe066; }
      .hud-btn.danger { background: #7a2e38; border-color: #ff7d8a; }
      .bar-track {
        width: 148px;
        height: 11px;
        background: #0c131f;
        border: 1px solid #3c506b;
        border-radius: 3px;
        overflow: hidden;
      }
      .bar-fill { height: 100%; transition: width 120ms ease; }
      .hotbar-dock {
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 6px;
        z-index: 30;
        padding: 5px 7px;
        background: rgba(11, 18, 29, 0.85);
        border: 2px solid #3e5775;
        border-radius: 8px;
      }
      .hotbar-slot {
        width: 46px;
        height: 46px;
        background: rgba(20, 32, 49, 0.96);
        border: 2px solid #486485;
        border-radius: 5px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        position: relative;
        cursor: pointer;
        font-size: 10px;
        transition: transform 80ms ease, border-color 80ms ease;
      }
      .hotbar-slot.active { border-color: #ffe066; box-shadow: 0 0 10px rgba(255,224,102,0.5); transform: translateY(-2px); }
      .hotbar-slot.drag-over { border-color: #7ae398; background: rgba(45, 92, 65, 0.7); }
      .modal-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(6, 10, 18, 0.72);
        display: flex;
        align-items: center;
        justify-content: center;
        padding-bottom: 58px;
        z-index: 20;
      }
      .ledger-window {
        width: min(960px, 95vw);
        max-height: 78vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .ledger-body {
        padding: 14px;
        overflow-y: auto;
        flex: 1;
      }
      .diablo-layout {
        display: grid;
        grid-template-columns: 225px 1fr 270px;
        gap: 12px;
        align-items: start;
      }
      .bag-grid {
        display: grid;
        grid-template-columns: repeat(${BAG_COLS}, 46px);
        gap: 5px;
        justify-content: center;
        padding: 8px;
        background: #0b121d;
        border: 2px inset #2b3e57;
        border-radius: 6px;
      }
      .inv-slot {
        width: 46px;
        height: 46px;
        background: #172336;
        border: 1.5px solid #3c5370;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        cursor: pointer;
      }
      .inv-slot:hover { border-color: #93b8e0; background: #1e2e47; }
      .inv-slot.selected { border-color: #ffe066; box-shadow: inset 0 0 8px rgba(255,224,102,0.35); }
      .inv-slot.move-source { border-color: #6ee88a; box-shadow: 0 0 8px rgba(110,232,138,0.5); }
      .inv-slot.drag-over { border-color: #7ae398; background: #223f35; }
      .equip-slot {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        background: #131f30;
        border: 1.5px solid #3c5370;
        border-radius: 5px;
        cursor: pointer;
      }
      .equip-slot:hover { border-color: #93b8e0; }
      .equip-slot.selected { border-color: #ffe066; }
      .equip-slot.drag-over { border-color: #7ae398; background: #1d3c32; }
      .grid-2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }

      /* Right-side ascending stacking item notification feed */
      .item-feed-stack {
        position: absolute;
        top: 56px;
        right: 12px;
        width: 240px;
        display: flex;
        flex-direction: column;
        gap: 5px;
        pointer-events: none;
        z-index: 15;
      }
      .item-feed-row {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 5px 9px;
        background: rgba(13, 21, 34, 0.88);
        border: 1.5px solid #415d7d;
        border-radius: 5px;
        font-size: 11px;
        box-shadow: 0 3px 10px rgba(0,0,0,0.45);
        opacity: 0;
        transform: translateX(16px);
        transition: opacity 220ms ease, transform 220ms ease;
      }
      .item-feed-row.show {
        opacity: 1;
        transform: translateX(0);
      }
      .item-feed-row.fade-out {
        opacity: 0;
        transform: translateY(-8px);
        transition: opacity 340ms ease, transform 340ms ease;
      }
    `;
    document.head.appendChild(style);
  }

  public render(): void {
    this.renderChrome();
    this.renderBanners();
    this.renderModal();
    this.renderHotbar();
  }

  private updateVitalsInPlace(): void {
    if (!this.chromeBuilt) return;
    const maxHp = gameState.getMaxHp();
    const maxEn = gameState.getMaxEnergy();
    const nextXp = gameState.getXpForNextLevel();
    const hpPct = Math.max(0, Math.min(100, (gameState.hp / maxHp) * 100));
    const enPct = Math.max(0, Math.min(100, (gameState.energy / maxEn) * 100));
    const xpPct = Math.max(0, Math.min(100, (gameState.xp / nextXp) * 100));

    const hpFill = this.chromeLayer.querySelector<HTMLElement>('#hud-hp-fill');
    const hpText = this.chromeLayer.querySelector<HTMLElement>('#hud-hp-text');
    const enFill = this.chromeLayer.querySelector<HTMLElement>('#hud-en-fill');
    const enText = this.chromeLayer.querySelector<HTMLElement>('#hud-en-text');
    const xpFill = this.chromeLayer.querySelector<HTMLElement>('#hud-xp-fill');
    const xpText = this.chromeLayer.querySelector<HTMLElement>('#hud-xp-text');
    const lvlEl = this.chromeLayer.querySelector<HTMLElement>('#hud-level-label');
    const coinsEl = this.chromeLayer.querySelector<HTMLElement>('#hud-coins-val');
    const spBadge = this.chromeLayer.querySelector<HTMLElement>('#hud-sp-badge');

    if (hpFill) hpFill.style.width = `${hpPct}%`;
    if (hpText) hpText.textContent = `${Math.ceil(gameState.hp)}/${maxHp}`;
    if (enFill) enFill.style.width = `${enPct}%`;
    if (enText) enText.textContent = `${Math.ceil(gameState.energy)}/${maxEn}`;
    if (xpFill) xpFill.style.width = `${xpPct}%`;
    if (xpText) xpText.textContent = `${gameState.xp}/${nextXp}`;
    if (lvlEl) lvlEl.textContent = `Lv.${gameState.level} ${gameState.heroClass}`;
    if (coinsEl) coinsEl.textContent = `${gameState.coins}g`;
    if (spBadge) {
      spBadge.style.display = gameState.skillPoints > 0 ? 'inline-block' : 'none';
      spBadge.textContent = `+${gameState.skillPoints} SP`;
    }
  }

  private renderChrome(): void {
    const portrait = `assets/portraits/${gameState.heroClass}/${gameState.heroClass}_frame.png`;

    if (!this.chromeBuilt) {
      this.chromeLayer.innerHTML = `
        <div class="hud-panel hud-interactive" style="position:absolute; top:10px; left:10px; padding:7px 10px; display:flex; gap:10px; align-items:center;">
          <img src="${portrait}" class="px-icon" style="width:42px; height:42px;" />
          <div style="display:flex; flex-direction:column; gap:3px;">
            <div style="display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700;">
              <span id="hud-level-label"></span>
              <span style="color:#ffd95a; display:inline-flex; align-items:center; gap:3px;"><img src="assets/ui_icons/coin.png" class="px-icon" style="width:14px; height:14px;" /><span id="hud-coins-val"></span></span>
              <span id="hud-time-badge" style="background:#1c2d45; border:1px solid #486485; padding:1px 6px; border-radius:4px; font-size:10px; color:#b6dcff;">${this.timeLabelText}</span>
              <span id="hud-sp-badge" style="background:#7842a8; padding:1px 6px; border-radius:10px; font-size:10px; display:none;"></span>
            </div>
            <div style="display:flex; align-items:center; gap:5px; font-size:10px;">
              <span style="width:18px; color:#ff7d87;">HP</span>
              <div class="bar-track"><div id="hud-hp-fill" class="bar-fill" style="background:#e04f5f;"></div></div>
              <span id="hud-hp-text"></span>
            </div>
            <div style="display:flex; align-items:center; gap:5px; font-size:10px;">
              <span style="width:18px; color:#7de38b;">EN</span>
              <div class="bar-track"><div id="hud-en-fill" class="bar-fill" style="background:#48c768;"></div></div>
              <span id="hud-en-text"></span>
            </div>
            <div style="display:flex; align-items:center; gap:5px; font-size:10px;">
              <span style="width:18px; color:#8ec8ff;">XP</span>
              <div class="bar-track" style="height:6px;"><div id="hud-xp-fill" class="bar-fill" style="background:#4fa8ff;"></div></div>
              <span id="hud-xp-text"></span>
            </div>
          </div>
        </div>

        <div class="hud-interactive" style="position:absolute; top:10px; right:10px; display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
          <button class="hud-btn" data-nav="inventory">Character & Bag [I]</button>
          <button class="hud-btn" data-nav="craft">Craft & Build [Tab]</button>
          <button class="hud-btn" data-nav="skills" id="hud-skills-btn">Skills [K]</button>
          <button class="hud-btn" data-nav="map" id="hud-map-btn">Islands [M]</button>
          <button class="hud-btn" data-nav="progress" id="hud-progress-btn">Progress & Debug [P]</button>
          <button class="hud-btn primary" data-action="save">Save</button>
          <button class="hud-btn" data-action="music" id="hud-music-btn">Music: Off</button>
          <button class="hud-btn" data-action="mute" id="hud-mute-btn">SFX</button>
        </div>
      `;

      this.chromeLayer.querySelectorAll<HTMLElement>('[data-nav]').forEach((el) => {
        el.onclick = () => this.toggleModal(el.dataset.nav as HudModal);
      });
      this.chromeLayer.querySelector<HTMLElement>('[data-action="save"]')!.onclick = () => this.callbacks.onSave();
      this.chromeLayer.querySelector<HTMLElement>('[data-action="music"]')!.onclick = () => {
        SFX.setMusicEnabled(!SFX.musicEnabled);
        this.renderChrome();
      };
      this.chromeLayer.querySelector<HTMLElement>('[data-action="mute"]')!.onclick = () => {
        SFX.muted = !SFX.muted;
        this.renderChrome();
      };
      this.chromeBuilt = true;
    }

    this.updateVitalsInPlace();

    this.chromeLayer.querySelectorAll<HTMLElement>('[data-nav]').forEach((el) => {
      const nav = el.dataset.nav as HudModal;
      el.classList.toggle('gold', this.activeModal === nav);
      if (nav === 'skills') {
        el.classList.toggle('primary', this.activeModal !== 'skills' && gameState.skillPoints > 0);
        el.textContent = `Skills [K]${gameState.skillPoints > 0 ? ` (${gameState.skillPoints})` : ''}`;
      } else if (nav === 'map') {
        el.textContent = `Islands [M] (${gameState.ownedIslands.size}/25)`;
      } else if (nav === 'progress') {
        el.textContent = gameState.debugMode ? 'Progress & Debug [P]' : 'Progress [P]';
      }
    });
    const muteBtn = this.chromeLayer.querySelector<HTMLElement>('#hud-mute-btn');
    if (muteBtn) muteBtn.textContent = SFX.muted ? 'Unmute' : 'SFX';
    const musicBtn = this.chromeLayer.querySelector<HTMLElement>('#hud-music-btn');
    if (musicBtn) {
      musicBtn.textContent = SFX.musicEnabled ? 'Music: On' : 'Music: Off';
      musicBtn.classList.toggle('primary', SFX.musicEnabled);
    }
  }

  private renderBanners(): void {
    let html = '';
    if (this.bossInfo) {
      const bpct = Math.max(0, Math.min(100, (this.bossInfo.hp / this.bossInfo.maxHp) * 100));
      html += `
        <div class="hud-panel" style="position:absolute; top:14px; left:50%; transform:translateX(-50%); padding:6px 14px; display:flex; align-items:center; gap:10px; z-index:16;">
          ${this.bossInfo.portrait ? `<img src="assets/${this.bossInfo.portrait}.png" class="px-icon" style="width:36px; height:36px;" />` : ''}
          <div>
            <div style="font-size:12px; font-weight:700; color:#ff9ea8; margin-bottom:3px;">BOSS: ${this.bossInfo.name}</div>
            <div class="bar-track" style="width:230px; height:12px;"><div class="bar-fill" style="width:${bpct}%; background:#ff4757;"></div></div>
          </div>
        </div>
      `;
    }

    if (gameState.pendingBuildRecipeId) {
      const rec = RECIPES.find((r) => r.id === gameState.pendingBuildRecipeId);
      html += `
        <div class="hud-panel hud-interactive" style="position:absolute; bottom:78px; left:50%; transform:translateX(-50%); padding:6px 14px; font-size:12px; border-color:#ffe066; z-index:25;">
          Placing: <strong>${rec?.name ?? ''}</strong> — Left-click valid tile • Right-click or <button class="hud-btn" data-action="cancel-build" style="padding:2px 6px; margin-left:4px;">Cancel [Esc]</button>
        </div>
      `;
    }

    if (this.toastMsg) {
      html += `
        <div class="hud-panel" style="position:absolute; top:92px; left:50%; transform:translateX(-50%); padding:6px 14px; font-size:12px; border-color:#8ef5a7; color:#eafff0; z-index:16;">
          ${this.toastMsg}
        </div>
      `;
    }

    this.bannerLayer.innerHTML = html;
    const cancelBtn = this.bannerLayer.querySelector<HTMLElement>('[data-action="cancel-build"]');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        gameState.pendingBuildRecipeId = null;
        this.renderBanners();
      };
    }
  }

  private renderHotbar(): void {
    let html = `<div class="hotbar-dock hud-interactive">`;
    for (let i = 0; i < 9; i++) {
      const itemId = gameState.hotbar[i];
      const def = itemId ? ITEMS[itemId] : undefined;
      const count = itemId ? gameState.getItemCount(itemId) : 0;
      const active = gameState.selectedHotbarIndex === i;
      const showCount = def && !def.equipSlot && count > 0;
      html += `
        <div class="hotbar-slot ${active ? 'active' : ''}" data-hotbar="${i}" draggable="${itemId ? 'true' : 'false'}" title="${def ? `${def.name} (Right-click to clear)` : `Slot ${i + 1}: Drag item from bag to assign`}">
          <span style="position:absolute; top:2px; left:4px; font-size:9px; color:#8ca8c4;">${i + 1}</span>
          ${
            def
              ? `${
                  def.iconKey
                    ? `<img src="assets/${def.iconKey}.png" class="px-icon" style="width:22px; height:22px; pointer-events:none;" />`
                    : ''
                }
                 <span style="font-size:8px; margin-top:1px; max-width:42px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:${RARITY_COLOR[def.rarity]}; pointer-events:none;">${def.name.split(' ').pop()}</span>`
              : ''
          }
          ${showCount ? `<span style="position:absolute; bottom:1px; right:3px; font-size:9px; color:#ffe066; font-weight:700; pointer-events:none;">${count}</span>` : ''}
        </div>
      `;
    }
    html += `</div>`;
    this.hotbarLayer.innerHTML = html;

    this.hotbarLayer.querySelectorAll<HTMLElement>('[data-hotbar]').forEach((el) => {
      const idx = Number(el.dataset.hotbar);
      el.onclick = () => {
        gameState.selectedHotbarIndex = idx;
        const itemId = gameState.hotbar[idx];
        if (itemId && this.activeModal === 'none') {
          this.callbacks.onUseHotbarItem(itemId);
        }
        this.renderHotbar();
      };
      el.oncontextmenu = (e) => {
        e.preventDefault();
        gameState.clearHotbarSlot(idx);
      };
      el.ondragstart = () => {
        const itemId = gameState.hotbar[idx];
        if (!itemId) return;
        this.dragPayload = { source: 'hotbar', hotbarIdx: idx, itemId };
      };
      el.ondragover = (e) => {
        e.preventDefault();
        el.classList.add('drag-over');
      };
      el.ondragleave = () => el.classList.remove('drag-over');
      el.ondrop = (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        if (!this.dragPayload) return;
        if (this.dragPayload.source === 'hotbar') {
          const prev = gameState.hotbar[idx];
          gameState.hotbar[idx] = this.dragPayload.itemId;
          gameState.hotbar[this.dragPayload.hotbarIdx] = prev;
          gameState.emit();
        } else {
          gameState.assignHotbarSlot(idx, this.dragPayload.itemId);
        }
        this.dragPayload = null;
      };
    });
  }

  private renderModal(): void {
    if (this.activeModal === 'none') {
      this.modalLayer.innerHTML = '';
      return;
    }

    const tabs: Array<{ id: HudModal; label: string }> = [
      { id: 'inventory', label: 'Character & Bag [I]' },
      { id: 'craft', label: 'Craft & Build [Tab]' },
      { id: 'skills', label: `Skills [K]${gameState.skillPoints > 0 ? ` (+${gameState.skillPoints})` : ''}` },
      { id: 'map', label: `World Map [M] (${gameState.ownedIslands.size}/25)` },
      { id: 'progress', label: gameState.debugMode ? 'Progress & Debug [P]' : 'Progress [P]' },
    ];

    let bodyHtml = '';
    if (this.activeModal === 'inventory') bodyHtml = this.renderDiabloInventory();
    else if (this.activeModal === 'craft') bodyHtml = this.renderCraftTab();
    else if (this.activeModal === 'skills') bodyHtml = this.renderSkillsTab();
    else if (this.activeModal === 'map') bodyHtml = this.renderMapTab();
    else if (this.activeModal === 'progress') bodyHtml = this.renderProgressTab();

    this.modalLayer.innerHTML = `
      <div class="modal-backdrop hud-interactive" data-action="close-backdrop">
        <div class="hud-panel ledger-window" onclick="event.stopPropagation()">
          <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#0d1624; border-bottom:2px solid #354c6b;">
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              ${tabs
                .map(
                  (t) =>
                    `<button class="hud-btn ${this.activeModal === t.id ? 'gold' : ''}" data-tab="${t.id}">${t.label}</button>`,
                )
                .join('')}
            </div>
            <button class="hud-btn" data-action="close-modal">Close [Esc]</button>
          </div>
          <div class="ledger-body">${bodyHtml}</div>
        </div>
      </div>
    `;

    this.bindModalEvents();
  }

  private renderDiabloInventory(): string {
    const eqStats = gameState.getEquippedStats();
    const activeWeaponId = gameState.equipment.weapon ?? 'sword';
    const activeToolId = gameState.equipment.tool ?? 'pickaxe';
    const atkTotal = gameState.getWeaponDamage(activeWeaponId);
    const gatherTotal = gameState.getGatherDamage(activeToolId);
    const critPct = Math.round(gameState.getCritChance() * 100);
    const speed = gameState.getMoveSpeed();

    // Left: Equipment Paperdoll + Live Stats
    const equipSlotsHtml = (['weapon', 'tool', 'armor', 'accessory'] as EquipSlot[])
      .map((slot) => {
        const eqId = gameState.equipment[slot];
        const def = eqId ? ITEMS[eqId] : undefined;
        const selected = this.selectedInspect?.kind === 'equip' && this.selectedInspect.slot === slot;
        return `
          <div class="equip-slot ${selected ? 'selected' : ''}" data-equip-slot="${slot}" draggable="${eqId ? 'true' : 'false'}">
            <div style="width:32px; height:32px; background:#0b121d; border:1px solid #2e415c; border-radius:4px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${def?.iconKey ? `<img src="assets/${def.iconKey}.png" class="px-icon" style="width:24px; height:24px; pointer-events:none;" />` : `<span style="font-size:10px; color:#4f6885;">—</span>`}
            </div>
            <div style="min-width:0; flex:1;">
              <div style="font-size:9px; color:#8ba6c4; text-transform:uppercase;">${EQUIP_SLOT_LABELS[slot]}</div>
              <div style="font-size:11px; font-weight:700; color:${def ? RARITY_COLOR[def.rarity] : '#637a94'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${def ? def.name : 'Empty'}
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    // Center: 6x5 Bag Grid
    let bagHtml = '';
    for (let i = 0; i < BAG_SIZE; i++) {
      const slot = gameState.bagSlots[i];
      const def = slot ? ITEMS[slot.itemId] : undefined;
      const isSelected = this.selectedInspect?.kind === 'bag' && this.selectedInspect.bagIdx === i;
      const isMoveSrc = this.moveSourceBagIdx === i;
      bagHtml += `
        <div class="inv-slot ${isSelected ? 'selected' : ''} ${isMoveSrc ? 'move-source' : ''}"
             data-bag-idx="${i}"
             draggable="${slot ? 'true' : 'false'}"
             style="${def ? `border-color:${isSelected ? '#ffe066' : RARITY_COLOR[def.rarity]}55;` : ''}"
             title="${def ? `${def.name} — Drag to move, equip, or assign to Hotbar 1-9` : 'Empty Slot'}">
          ${def?.iconKey ? `<img src="assets/${def.iconKey}.png" class="px-icon" style="width:26px; height:26px; pointer-events:none;" />` : ''}
          ${slot && slot.count > 1 ? `<span style="position:absolute; bottom:1px; right:3px; font-size:10px; font-weight:700; color:#ffe066; text-shadow:0 1px 2px #000; pointer-events:none;">${slot.count}</span>` : ''}
          ${def?.equipSlot ? `<span style="position:absolute; top:1px; left:3px; font-size:8px; color:${RARITY_COLOR[def.rarity]}; pointer-events:none;">E</span>` : ''}
        </div>
      `;
    }

    // Right: Item Inspector + Comparison
    const inspectorHtml = this.renderItemInspector();

    return `
      <div class="diablo-layout">
        <!-- LEFT: EQUIPMENT & STATS -->
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="font-size:12px; font-weight:700; color:#ffe596;">Equipment Slots</div>
          ${equipSlotsHtml}
          <div class="hud-panel" style="padding:8px; background:#0d1522; font-size:11px; display:flex; flex-direction:column; gap:3px;">
            <div style="font-weight:700; color:#9ec6eb; margin-bottom:2px;">Character Stats</div>
            <div style="display:flex; justify-content:space-between;"><span>Attack Power</span><strong style="color:#ff9b85;">${atkTotal}</strong></div>
            <div style="display:flex; justify-content:space-between;"><span>Gather Power</span><strong style="color:#8ef5a7;">${gatherTotal}</strong></div>
            <div style="display:flex; justify-content:space-between;"><span>Armor Defense</span><strong style="color:#8cc8ff;">${eqStats.armor}</strong></div>
            <div style="display:flex; justify-content:space-between;"><span>Crit Chance</span><strong style="color:#ffe066;">${critPct}%</strong></div>
            <div style="display:flex; justify-content:space-between;"><span>Move Speed</span><strong>${speed}</strong></div>
            <div style="display:flex; justify-content:space-between;"><span>Dungeons</span><strong style="color:#d4a3ff;">${gameState.clearedDungeons.size}/4</strong></div>
          </div>
        </div>

        <!-- CENTER: INVENTORY GRID -->
        <div style="display:flex; flex-direction:column; gap:8px; align-items:center;">
          <div style="width:100%; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:12px; font-weight:700; color:#ffe596;">Inventory (${gameState.bagSlots.filter(Boolean).length}/${BAG_SIZE})</span>
            <span style="font-size:10px; color:#9db6cf;">Drag to move, equip, or drop onto Hotbar 1–9</span>
          </div>
          <div class="bag-grid">${bagHtml}</div>
          ${
            this.moveSourceBagIdx !== null
              ? `<div style="font-size:11px; color:#6ee88a;">Click any destination slot to move/swap • <button class="hud-btn" data-action="cancel-move" style="padding:1px 6px; font-size:10px;">Cancel</button></div>`
              : ''
          }
        </div>

        <!-- RIGHT: INSPECTOR & COMPARISON -->
        <div class="hud-panel" style="padding:10px; background:#0d1522; min-height:290px;">
          ${inspectorHtml}
        </div>
      </div>
    `;
  }

  private renderItemInspector(): string {
    if (!this.selectedInspect) {
      return `<div style="color:#7892ad; font-size:12px; padding:12px 0;">Select any item or equipped gear to inspect stats, compare upgrades, equip, or assign to Hotbar 1–9.</div>`;
    }

    const itemId = this.selectedInspect.itemId;
    const def = ITEMS[itemId];
    if (!def) return '';

    const isEquip = this.selectedInspect.kind === 'equip';
    const bagIdx = this.selectedInspect.kind === 'bag' ? this.selectedInspect.bagIdx : -1;
    const slotCount = bagIdx >= 0 ? gameState.bagSlots[bagIdx]?.count ?? 0 : 1;
    const sellEach = Math.round(def.sellValue * (gameState.hasSkill('economy_barter') ? 1.5 : 1));

    const statsList = def.stats
      ? Object.entries(def.stats)
          .filter(([, v]) => v !== undefined && v !== 0)
          .map(([k, v]) => {
            const labels: Record<string, string> = {
              attack: 'Attack Power',
              gather: 'Gather Power',
              armor: 'Armor',
              critPct: 'Crit Chance',
              speedPct: 'Move Speed',
              maxHp: 'Max HP',
              maxEnergy: 'Max Energy',
            };
            const suffix = k.endsWith('Pct') ? '%' : '';
            return `<div style="display:flex; justify-content:space-between; font-size:11px;"><span>${labels[k] ?? k}</span><strong style="color:#e6f2ff;">+${v}${suffix}</strong></div>`;
          })
          .join('')
      : '';

    // Diablo Stat Comparison when inspecting bag gear against equipped gear
    let compareHtml = '';
    if (!isEquip && def.equipSlot) {
      const cmp = gameState.compareGearStats(itemId);
      if (cmp) {
        const eqName = cmp.equippedId ? ITEMS[cmp.equippedId]?.name ?? 'Equipped' : 'Nothing Equipped';
        compareHtml = `
          <div style="margin-top:8px; padding-top:8px; border-top:1px solid #2b3f59;">
            <div style="font-size:10px; color:#9db6cf; margin-bottom:4px;">Compared to ${EQUIP_SLOT_LABELS[cmp.slot]} (<strong>${eqName}</strong>):</div>
            ${cmp.rows
              .map((r) => {
                const color = r.diff > 0 ? '#6ee88a' : r.diff < 0 ? '#ff6b78' : '#8b9eb3';
                const sign = r.diff > 0 ? `+${r.diff}` : `${r.diff}`;
                return `<div style="display:flex; justify-content:space-between; font-size:11px;"><span>${r.label}</span><span style="color:${color}; font-weight:700;">${sign}${r.suffix}</span></div>`;
              })
              .join('')}
          </div>
        `;
      }
    }

    const canAssignHotbar =
      def.category === 'tool' ||
      def.category === 'weapon' ||
      def.category === 'relic' ||
      def.category === 'food' ||
      def.category === 'consumable';

    const hotbarAssignHtml = canAssignHotbar
      ? `
        <div style="margin-top:8px; padding-top:8px; border-top:1px solid #2b3f59;">
          <div style="font-size:10px; color:#9db6cf; margin-bottom:4px;">Assign to Hotbar Slot:</div>
          <div style="display:flex; gap:3px; flex-wrap:wrap;">
            ${[0, 1, 2, 3, 4, 5, 6, 7, 8]
              .map(
                (i) =>
                  `<button class="hud-btn ${gameState.hotbar[i] === itemId ? 'gold' : ''}" data-assign-hb="${i}" style="padding:2px 6px; font-size:10px;">${i + 1}</button>`,
              )
              .join('')}
          </div>
        </div>
      `
      : '';

    return `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <div style="width:42px; height:42px; background:#152236; border:1.5px solid ${RARITY_COLOR[def.rarity]}; border-radius:5px; display:flex; align-items:center; justify-content:center;">
          ${def.iconKey ? `<img src="assets/${def.iconKey}.png" class="px-icon" style="width:32px; height:32px;" />` : ''}
        </div>
        <div>
          <div style="font-size:13px; font-weight:700; color:${RARITY_COLOR[def.rarity]};">${def.name}</div>
          <div style="font-size:10px; color:#9db6cf; text-transform:capitalize;">${def.rarity} ${def.category}${def.equipSlot ? ` • ${EQUIP_SLOT_LABELS[def.equipSlot]}` : ''}</div>
        </div>
      </div>

      <div style="font-size:11px; color:#c8daeb; margin-bottom:8px;">${def.description}</div>

      ${statsList ? `<div style="display:flex; flex-direction:column; gap:2px; padding:6px; background:#131f30; border-radius:4px;">${statsList}</div>` : ''}
      ${compareHtml}
      ${hotbarAssignHtml}

      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
        ${
          isEquip
            ? `<button class="hud-btn" data-inspect-act="unequip">Unequip</button>`
            : `
              ${def.equipSlot ? `<button class="hud-btn primary" data-inspect-act="equip">Equip</button>` : ''}
              ${def.healHp || def.healEnergy ? `<button class="hud-btn primary" data-inspect-act="use">Use</button>` : ''}
              <button class="hud-btn" data-inspect-act="move">Move Slot</button>
              ${
                def.sellValue > 0 && slotCount > 0
                  ? `<button class="hud-btn gold" data-inspect-act="sell1">Sell 1 (+${sellEach}g)</button>`
                  : ''
              }
              ${
                def.sellValue > 0 && slotCount > 1
                  ? `<button class="hud-btn gold" data-inspect-act="sellall">Sell ${slotCount} (+${sellEach * slotCount}g)</button>`
                  : ''
              }
            `
        }
      </div>
    `;
  }

  private getSelectedStation(): StationQueueView | null {
    if (
      this.activeStationTab !== 'furnace' &&
      this.activeStationTab !== 'anvil' &&
      this.activeStationTab !== 'bonfire'
    ) {
      return null;
    }
    const stations = this.callbacks.getStations?.(this.activeStationTab) ?? [];
    if (stations.length === 0) return null;
    const matched = this.activeStationId ? stations.find((s) => s.id === this.activeStationId) : undefined;
    const picked = matched ?? stations[0];
    this.activeStationId = picked.id;
    return picked;
  }

  public updateCraftQueueInPlace(): void {
    if (this.activeModal !== 'craft') return;
    const st = this.getSelectedStation();
    if (!st || st.craftQueue.length === 0) return;
    const job = st.craftQueue[0];
    const pct = Math.max(0, Math.min(100, ((job.totalMs - job.remainingMs) / job.totalMs) * 100));
    const fill = this.modalLayer.querySelector<HTMLElement>('#hud-queue-fill-0');
    const timeEl = this.modalLayer.querySelector<HTMLElement>('#hud-queue-time-0');
    if (fill) fill.style.width = `${pct}%`;
    if (timeEl) timeEl.textContent = `${Math.max(0.1, job.remainingMs / 1000).toFixed(1)}s`;
  }

  private renderCraftTab(): string {
    const tabs: Array<{ id: CraftingStation; label: string }> = [
      { id: 'build', label: 'Build Structures' },
      { id: 'hand', label: 'Hand & Alchemy' },
      { id: 'furnace', label: 'Furnace' },
      { id: 'anvil', label: 'Anvil Gear & Tools' },
      { id: 'bonfire', label: 'Bonfire Cooking' },
    ];
    const isQueuedStation =
      this.activeStationTab === 'furnace' ||
      this.activeStationTab === 'anvil' ||
      this.activeStationTab === 'bonfire';

    const stations = isQueuedStation
      ? (this.callbacks.getStations?.(this.activeStationTab as 'furnace' | 'anvil' | 'bonfire') ?? [])
      : [];
    const selectedStation = isQueuedStation ? this.getSelectedStation() : null;
    const queueFull = selectedStation
      ? selectedStation.craftQueue.length >= selectedStation.maxQueueSize
      : false;

    let queuePanelHtml = '';
    if (isQueuedStation) {
      if (!selectedStation) {
        queuePanelHtml = `
          <div class="hud-panel" style="padding:10px; margin-bottom:12px; background:#0d1522; border-color:#ff9b6a; font-size:12px;">
            No <strong>${this.activeStationTab}</strong> placed yet! Build one from <strong>Build Structures</strong> to queue recipes here.
          </div>
        `;
      } else {
        const stationPicker =
          stations.length > 1
            ? `<div style="display:flex; gap:4px; align-items:center;">
                <span style="font-size:10px; color:#9db6cf;">Station:</span>
                ${stations
                  .map(
                    (s, i) =>
                      `<button class="hud-btn ${s.id === selectedStation.id ? 'gold' : ''}" data-pick-station="${s.id}" style="padding:2px 6px; font-size:10px;">#${i + 1}</button>`,
                  )
                  .join('')}
              </div>`
            : '';

        const slotsHtml = Array.from({ length: selectedStation.maxQueueSize }, (_, i) => {
          const job = selectedStation.craftQueue[i];
          if (!job) {
            return `
              <div style="height:54px; background:#0b121d; border:1.5px dashed #324863; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#556f8c;">
                Slot ${i + 1}
              </div>
            `;
          }
          const outDef = ITEMS[job.outputItemId];
          const isActive = i === 0;
          const pct = isActive
            ? Math.max(0, Math.min(100, ((job.totalMs - job.remainingMs) / job.totalMs) * 100))
            : 0;
          return `
            <div style="height:54px; background:${isActive ? '#182b42' : '#121e2e'}; border:1.5px solid ${isActive ? '#ffe066' : '#415d7d'}; border-radius:5px; padding:4px 6px; display:flex; flex-direction:column; justify-content:space-between; position:relative;">
              <div style="display:flex; align-items:center; gap:5px;">
                ${outDef?.iconKey ? `<img src="assets/${outDef.iconKey}.png" class="px-icon" style="width:18px; height:18px;" />` : ''}
                <span style="font-size:10px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${outDef?.name ?? job.outputItemId}${job.outputCount > 1 ? ` x${job.outputCount}` : ''}</span>
                <button class="hud-btn danger" data-cancel-queue="${i}" title="Remove & refund ingredients" style="padding:0px 5px; font-size:10px; line-height:14px;">×</button>
              </div>
              ${
                isActive
                  ? `<div style="display:flex; align-items:center; gap:5px;">
                      <div class="bar-track" style="flex:1; height:6px;"><div id="hud-queue-fill-0" class="bar-fill" style="width:${pct}%; background:#7ae398;"></div></div>
                      <span id="hud-queue-time-0" style="font-size:9px; color:#ffe596; min-width:26px; text-align:right;">${Math.max(0.1, job.remainingMs / 1000).toFixed(1)}s</span>
                    </div>`
                  : `<div style="font-size:9px; color:#8ca8c4;">Queued (${(job.totalMs / 1000).toFixed(1)}s)</div>`
              }
            </div>
          `;
        }).join('');

        queuePanelHtml = `
          <div class="hud-panel" style="padding:10px; margin-bottom:12px; background:#0d1522;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:7px;">
              <div style="font-size:12px; font-weight:700; color:#ffe596;">
                Crafting Queue (${selectedStation.craftQueue.length}/${selectedStation.maxQueueSize})
                <span style="font-size:10px; font-weight:400; color:#9db6cf; margin-left:6px;">Finished items drop in front of the structure</span>
              </div>
              ${stationPicker}
            </div>
            <div style="display:grid; grid-template-columns:repeat(${selectedStation.maxQueueSize}, 1fr); gap:6px;">
              ${slotsHtml}
            </div>
          </div>
        `;
      }
    }

    const list = RECIPES.filter((r) => r.station === this.activeStationTab);

    return `
      <div style="display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap;">
        ${tabs
          .map(
            (t) =>
              `<button class="hud-btn ${this.activeStationTab === t.id ? 'gold' : ''}" data-station="${t.id}">${t.label}</button>`,
          )
          .join('')}
      </div>
      ${queuePanelHtml}
      <div class="grid-2">
        ${list
          .map((r) => {
            const lockedBySkill = r.requiresSkill && !gameState.hasSkill(r.requiresSkill);
            const hasMats = gameState.canCraft(r);
            const canAction = isQueuedStation ? Boolean(selectedStation) && !queueFull && hasMats : hasMats;
            const isBuild = r.station === 'build';
            const ings = r.ingredients
              .map((ing) => {
                const req = gameState.getStructureCostCount(ing.itemId, ing.count, isBuild);
                const have = gameState.inventory[ing.itemId] ?? 0;
                return `<span style="color:${have >= req ? '#8ef5a7' : '#ff8a93'};">${ITEMS[ing.itemId]?.name ?? ing.itemId}: ${have}/${req}</span>`;
              })
              .join(' • ');
            const skillReqLabel = lockedBySkill
              ? `<div style="font-size:10px; color:#d09cff;">Requires Skill: ${SKILLS.find((s) => s.id === r.requiresSkill)?.name}</div>`
              : '';
            const timeSec = isQueuedStation ? (gameState.getCraftDurationMs(r) / 1000).toFixed(1) : null;
            const iconKey = r.iconKey ?? (r.outputItemId ? ITEMS[r.outputItemId]?.iconKey : undefined);
            const btnLabel = isBuild
              ? 'Place Structure'
              : isQueuedStation
                ? queueFull
                  ? 'Queue Full (5/5)'
                  : `Queue (${timeSec}s)`
                : 'Craft';
            return `
              <div class="hud-panel" style="padding:10px; display:flex; flex-direction:column; justify-content:space-between; gap:6px;">
                <div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    ${iconKey ? `<img src="assets/${iconKey}.png" class="px-icon" style="width:24px; height:24px;" />` : ''}
                    <div style="font-weight:700; font-size:13px; flex:1;">${r.name}</div>
                    ${timeSec ? `<span style="font-size:10px; color:#ffe596;">⏱ ${timeSec}s</span>` : ''}
                  </div>
                  <div style="font-size:11px; color:#b8cde0; margin:4px 0;">${r.description}</div>
                  <div style="font-size:11px;">${ings}</div>
                  ${skillReqLabel}
                </div>
                <button class="hud-btn ${canAction ? 'primary' : ''}" ${canAction ? '' : 'disabled'} data-craft="${r.id}">
                  ${btnLabel}
                </button>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  }

  private renderSkillsTab(): string {
    const pillars: SkillPillar[] = ['foraging', 'industry', 'economy', 'magic'];
    return `
      <div style="font-size:12px; color:#ffe596; font-weight:700; margin-bottom:10px;">Available Skill Points: ${gameState.skillPoints}</div>
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px;">
        ${pillars
          .map((p) => {
            const meta = PILLAR_META[p];
            const pSkills = SKILLS.filter((s) => s.pillar === p);
            return `
              <div style="display:flex; flex-direction:column; gap:8px;">
                <div style="text-align:center; font-weight:700; padding:4px; background:${meta.color}; border-radius:4px; font-size:12px;">${meta.label}</div>
                ${pSkills
                  .map((s) => {
                    const unlocked = gameState.hasSkill(s.id);
                    const can = gameState.canUnlockSkill(s.id);
                    return `
                      <div class="hud-panel" style="padding:8px; border-color:${unlocked ? meta.accent : can ? '#ffe066' : '#354860'}; opacity:${unlocked || can ? 1 : 0.65};">
                        <div style="font-size:12px; font-weight:700; color:${unlocked ? meta.accent : '#fff'};">T${s.tier}: ${s.name}</div>
                        <div style="font-size:10px; color:#c5d8ea; margin:4px 0;">${s.description}</div>
                        ${
                          unlocked
                            ? `<span style="font-size:10px; color:#8ef5a7; font-weight:700;">UNLOCKED</span>`
                            : `<button class="hud-btn ${can ? 'gold' : ''}" ${can ? '' : 'disabled'} data-skill="${s.id}" style="width:100%; padding:3px;">Unlock (1 SP)</button>`
                        }
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  }

  private renderMapTab(): string {
    const biomeColors: Record<string, string> = {
      grass: '#3f8a4d',
      autumn: '#b86832',
      graveyard: '#544e6e',
      winter: '#5fa8c4',
      infernal: '#8c313b',
    };
    let gridHtml = `<div style="display:grid; grid-template-columns:repeat(${WORLD_GRID_SIZE}, 1fr); gap:8px;">`;
    for (let gy = 0; gy < WORLD_GRID_SIZE; gy++) {
      for (let gx = 0; gx < WORLD_GRID_SIZE; gx++) {
        const spec = getIslandAt(gx, gy);
        if (!spec) continue;
        const owned = gameState.ownedIslands.has(`${gx},${gy}`);
        const adj = gameState.isIslandAdjacentToOwned(gx, gy);
        const cost = gameState.getIslandCost(gx, gy);
        const canBuy = adj && gameState.coins >= cost;
        gridHtml += `
          <div class="hud-panel" style="padding:8px; background:${owned ? biomeColors[spec.biome] : 'rgba(15,24,38,0.85)'}; border-color:${owned ? '#a3f7b5' : adj ? '#ffe066' : '#2d4057'}; display:flex; flex-direction:column; justify-content:space-between; min-height:78px;">
            <div>
              <div style="font-size:11px; font-weight:700;">${spec.name}</div>
              <div style="font-size:10px; opacity:0.88; text-transform:capitalize;">${spec.biome}${spec.dungeonId ? ' • Dungeon' : ''}${spec.npc ? ' • NPC' : ''}</div>
            </div>
            ${
              owned
                ? `<span style="font-size:10px; font-weight:700; color:#e6ffea;">OWNED</span>`
                : adj
                  ? `<button class="hud-btn ${canBuy ? 'gold' : ''}" ${canBuy ? '' : 'disabled'} data-buy-island="${gx},${gy}" style="padding:3px 6px; font-size:11px;">Buy ${cost}g</button>`
                  : `<span style="font-size:10px; color:#7792ad;">Locked (${cost}g)</span>`
            }
          </div>
        `;
      }
    }
    gridHtml += `</div>`;
    return `
      <div style="font-size:12px; color:#ffe596; margin-bottom:8px;">Owned Islands: ${gameState.ownedIslands.size}/${ISLANDS.length} • Coins: ${gameState.coins}g</div>
      ${gridHtml}
    `;
  }

  private renderProgressTab(): string {
    const worldStats = this.callbacks.getWorldDebugStats?.();
    const itemOptions = Object.values(ITEMS)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((it) => `<option value="${it.id}">${it.name} (${it.category})</option>`)
      .join('');
    const bagUsed = gameState.bagSlots.filter(Boolean).length;
    const relicsUnlocked = ['necro_rod', 'thunder_rod', 'ice_rod', 'fire_rod'].filter((id) =>
      gameState.isGearOwned(id),
    ).length;

    const debugPanelHtml = gameState.debugMode
      ? `
        <div class="hud-panel" style="padding:10px; margin-bottom:12px; background:#141b2e; border-color:#d98a3c;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <strong style="color:#ffbe6b; font-size:13px;">Debug Mode — Testing & Cheat Controls</strong>
            <button class="hud-btn" data-dbg="toggle_mode" style="padding:2px 8px; font-size:11px;">Debug: ON (Turn Off)</button>
          </div>
          <div style="display:flex; flex-direction:column; gap:7px;">
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="hud-btn primary" data-dbg="add_resources">+50 All Materials & +500g</button>
              <button class="hud-btn primary" data-dbg="add_consumables">+10 Food, Potions & Bombs</button>
              <button class="hud-btn gold" data-dbg="add_coins">+1,000 Coins</button>
              <button class="hud-btn" data-dbg="full_heal">Full Heal HP & Energy</button>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
              <button class="hud-btn gold" data-dbg="add_level_1">+1 Level (+1 SP)</button>
              <button class="hud-btn gold" data-dbg="add_level_5">+5 Levels (+5 SP)</button>
              <button class="hud-btn" data-dbg="unlock_all_skills">Unlock All 20 Skills</button>
              <button class="hud-btn" data-dbg="unlock_relics">Unlock All Relic Rods & Bow</button>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
              <button class="hud-btn" data-dbg="unlock_all_islands">Unlock All 25 Islands</button>
              <button class="hud-btn" data-dbg="clear_dungeons">Mark All 4 Dungeons Cleared</button>
              <span style="font-size:11px; color:#9db6cf; margin-left:4px;">Teleport:</span>
              <button class="hud-btn" data-teleport="2,2" style="padding:3px 7px; font-size:11px;">Origin</button>
              <button class="hud-btn" data-teleport="3,3" style="padding:3px 7px; font-size:11px;">Desert</button>
              <button class="hud-btn" data-teleport="0,2" style="padding:3px 7px; font-size:11px;">Skull Crypt</button>
              <button class="hud-btn" data-teleport="4,2" style="padding:3px 7px; font-size:11px;">Sunken Tomb</button>
              <button class="hud-btn" data-teleport="2,0" style="padding:3px 7px; font-size:11px;">Frost Cavern</button>
              <button class="hud-btn" data-teleport="4,0" style="padding:3px 7px; font-size:11px;">Infernal</button>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
              <span style="font-size:11px; color:#9db6cf;">Time:</span>
              <button class="hud-btn" data-dbg-time="0.08" style="padding:3px 7px; font-size:11px;">Dawn</button>
              <button class="hud-btn" data-dbg-time="0.35" style="padding:3px 7px; font-size:11px;">Noon</button>
              <button class="hud-btn" data-dbg-time="0.68" style="padding:3px 7px; font-size:11px;">Dusk</button>
              <button class="hud-btn" data-dbg-time="0.88" style="padding:3px 7px; font-size:11px;">Night</button>
              <button class="hud-btn gold" data-dbg="next_day" style="padding:3px 7px; font-size:11px;">Next Day (Roll Wind)</button>
              <span style="font-size:11px; color:#9db6cf; margin-left:4px;">Weather:</span>
              <button class="hud-btn" data-dbg-weather="auto" style="padding:3px 7px; font-size:11px;">Auto</button>
              <button class="hud-btn" data-dbg-weather="sunny" style="padding:3px 7px; font-size:11px;">Sunny</button>
              <button class="hud-btn" data-dbg-weather="cloudy" style="padding:3px 7px; font-size:11px;">Cloudy</button>
              <button class="hud-btn" data-dbg-weather="rain" style="padding:3px 7px; font-size:11px;">Rain</button>
              <button class="hud-btn" data-dbg-weather="snow" style="padding:3px 7px; font-size:11px;">Snow</button>
              <button class="hud-btn" data-dbg-weather="sandstorm" style="padding:3px 7px; font-size:11px;">Sandstorm</button>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; padding-top:4px; border-top:1px solid #2b3c54;">
              <span style="font-size:11px; color:#c8daeb;">Spawn Item:</span>
              <select id="dbg-item-select" style="background:#0c1420; color:#f6eedc; border:1px solid #486485; border-radius:4px; padding:3px 6px; font-size:11px;">
                ${itemOptions}
              </select>
              <input id="dbg-item-qty" type="number" value="5" min="1" max="999" style="width:54px; background:#0c1420; color:#f6eedc; border:1px solid #486485; border-radius:4px; padding:3px 6px; font-size:11px;" />
              <button class="hud-btn primary" data-dbg="spawn_item">Grant Item</button>
              <div style="flex:1;"></div>
              <button class="hud-btn danger" data-dbg="reset_run" title="Resets current run to Level 1 New Adventure">Reset Run</button>
              <button class="hud-btn danger" data-dbg="erase_save" title="Deletes all localStorage/sessionStorage saves and restarts">Erase Saved & Cached Data</button>
            </div>
          </div>
        </div>
      `
      : `
        <div class="hud-panel" style="padding:8px 10px; margin-bottom:12px; background:#0d1522; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:12px; color:#9db6cf;">Debug Mode is currently OFF.</span>
          <button class="hud-btn gold" data-dbg="toggle_mode" style="padding:3px 9px; font-size:11px;">Enable Debug Mode</button>
        </div>
      `;

    const isGrandVictory =
      gameState.clearedDungeons.size >= 4 && gameState.ownedIslands.size >= ISLANDS.length;

    const victoryBannerHtml = isGrandVictory
      ? `
        <div class="hud-panel" style="padding:10px 14px; margin-bottom:12px; background:linear-gradient(90deg, #2b4a2f, #4c3b14); border-color:#ffe066; text-align:center;">
          <strong style="color:#ffe596; font-size:14px;">GRAND VICTORY — ALL 25 ISLANDS & 4 BOSS DUNGEONS CONQUERED!</strong>
          <div style="font-size:11px; color:#e6ffea; margin-top:2px;">You have mastered the Isles of Foraging and claimed all 4 Elemental Relic Rods.</div>
        </div>
      `
      : '';

    return `
      ${victoryBannerHtml}
      <!-- LIVE COMMAND CENTER TELEMETRY -->
      <div class="hud-panel" style="padding:10px; margin-bottom:12px; background:#0d1522;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:7px; flex-wrap:wrap; gap:8px;">
          <div style="font-size:13px; font-weight:700; color:#ffe596;">Command Center — Live Game State</div>
          <div style="display:flex; align-items:center; gap:8px; font-size:11px;">
            <span style="color:#9db6cf;">Volume:</span>
            <input id="hud-vol-slider" type="range" min="0" max="100" value="${Math.round(SFX.masterVolume * 100)}" style="width:84px; accent-color:#ffe066;" />
            <span id="hud-vol-label">${Math.round(SFX.masterVolume * 100)}%</span>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; font-size:11px;">
          <div><span style="color:#8ca8c4;">Hero:</span> <strong>${gameState.heroClass} Lv.${gameState.level}</strong></div>
          <div><span style="color:#8ca8c4;">HP / EN:</span> <strong>${Math.ceil(gameState.hp)}/${gameState.getMaxHp()} • ${Math.ceil(gameState.energy)}/${gameState.getMaxEnergy()}</strong></div>
          <div><span style="color:#8ca8c4;">Coins / SP:</span> <strong style="color:#ffd95a;">${gameState.coins}g • ${gameState.skillPoints} SP</strong></div>
          <div><span style="color:#8ca8c4;">Bag / Relics:</span> <strong>${bagUsed}/${BAG_SIZE} • ${relicsUnlocked}/4 Relics</strong></div>
          <div><span style="color:#8ca8c4;">Islands:</span> <strong>${gameState.ownedIslands.size}/${ISLANDS.length}</strong></div>
          <div><span style="color:#8ca8c4;">Skills:</span> <strong>${gameState.unlockedSkills.size}/${SKILLS.length}</strong></div>
          <div><span style="color:#8ca8c4;">Dungeons / Quests:</span> <strong>${gameState.clearedDungeons.size}/4 • ${gameState.completedQuests.size}/4</strong></div>
          <div><span style="color:#8ca8c4;">Saved Cache:</span> <strong style="color:${worldStats?.hasSavedData ? '#8ef5a7' : '#9db6cf'};">${worldStats?.hasSavedData ? 'Saved in LocalStorage' : 'Clean / None'}</strong></div>
          ${
            worldStats
              ? `<div><span style="color:#8ca8c4;">Position:</span> <strong>(${worldStats.playerTx}, ${worldStats.playerTy})</strong></div>
                 <div><span style="color:#8ca8c4;">World Nodes:</span> <strong>${worldStats.nodesCount}</strong></div>
                 <div><span style="color:#8ca8c4;">Active Enemies:</span> <strong>${worldStats.enemiesCount}</strong></div>
                 <div><span style="color:#8ca8c4;">Buildings / Queued:</span> <strong>${worldStats.buildingsCount} • ${worldStats.activeCraftJobs} jobs</strong></div>`
              : ''
          }
        </div>
        <div style="margin-top:6px; padding-top:6px; border-top:1px solid #22344d; font-size:10px; color:#8ca8c4;">
          Content Registry: <strong>${Object.keys(ITEMS).length}</strong> Items & Gear • <strong>${RECIPES.length}</strong> Recipes • <strong>${Object.keys(MONSTERS).length}</strong> Monsters & Bosses • <strong>${ISLANDS.length}</strong> Islands • <strong>${SKILLS.length}</strong> Skills
        </div>
      </div>

      ${debugPanelHtml}

      <!-- IMPLEMENTED FEATURES BREAKDOWN -->
      <div style="font-size:13px; font-weight:700; color:#8ef5a7; margin-bottom:6px;">Implemented Features Breakdown (${IMPLEMENTED_FEATURES.length} Systems)</div>
      <div class="grid-2" style="margin-bottom:14px;">
        ${IMPLEMENTED_FEATURES.map(
          (f) => `
          <div class="hud-panel" style="padding:8px 10px; background:#0f1a29; border-color:#365e4c;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:3px;">
              <span style="font-size:10px; color:#7de38b; text-transform:uppercase; font-weight:700;">${f.category}</span>
              <span style="font-size:9px; background:#235439; color:#a3f7b5; padding:1px 6px; border-radius:8px; font-weight:700;">${f.status}</span>
            </div>
            <div style="font-size:12px; font-weight:700; margin-bottom:2px;">${f.title}</div>
            <div style="font-size:10px; color:#b8cde0;">${f.details}</div>
          </div>
        `,
        ).join('')}
      </div>

      <!-- NEXT / OUTSTANDING ITEMS -->
      <div style="font-size:13px; font-weight:700; color:#ffe596; margin-bottom:6px;">Next / Outstanding Items To Complete (${OUTSTANDING_ITEMS.length})</div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        ${
          OUTSTANDING_ITEMS.length === 0
            ? `<div class="hud-panel" style="padding:10px; background:#0f1f19; border-color:#4ba872; font-size:12px; color:#a3f7b5;">All planned roadmap items are complete and verified!</div>`
            : OUTSTANDING_ITEMS.map((item) => {
                const prioColor =
                  item.priority === 'High' ? '#ff8a93' : item.priority === 'Medium' ? '#ffe066' : '#8cc8ff';
                return `
                  <div class="hud-panel" style="padding:8px 10px; background:#0d1522; border-color:#3a4d66; display:flex; align-items:flex-start; gap:10px;">
                    <span style="font-size:10px; font-weight:700; color:${prioColor}; border:1px solid ${prioColor}; padding:1px 6px; border-radius:4px; min-width:54px; text-align:center;">${item.priority}</span>
                    <div>
                      <div style="font-size:12px; font-weight:700;">${item.title}</div>
                      <div style="font-size:10px; color:#b8cde0;">${item.details}</div>
                    </div>
                  </div>
                `;
              }).join('')
        }
      </div>
    `;
  }

  private bindModalEvents(): void {
    const backdrop = this.modalLayer.querySelector<HTMLElement>('[data-action="close-backdrop"]');
    if (backdrop) {
      backdrop.onclick = () => {
        this.activeModal = 'none';
        this.render();
      };
    }
    const closeBtn = this.modalLayer.querySelector<HTMLElement>('[data-action="close-modal"]');
    if (closeBtn) {
      closeBtn.onclick = () => {
        this.activeModal = 'none';
        this.render();
      };
    }
    this.modalLayer.querySelectorAll<HTMLElement>('[data-tab]').forEach((el) => {
      el.onclick = () => {
        this.activeModal = el.dataset.tab as HudModal;
        this.render();
      };
    });

    // Inventory Bag Slot Clicks & Drag/Drop
    this.modalLayer.querySelectorAll<HTMLElement>('[data-bag-idx]').forEach((el) => {
      const idx = Number(el.dataset.bagIdx);
      el.onclick = () => {
        if (this.moveSourceBagIdx !== null) {
          const src = this.moveSourceBagIdx;
          this.moveSourceBagIdx = null;
          gameState.moveOrSwapBagSlot(src, idx);
          const moved = gameState.bagSlots[idx];
          this.selectedInspect = moved ? { kind: 'bag', bagIdx: idx, itemId: moved.itemId } : null;
          this.render();
          return;
        }
        const slot = gameState.bagSlots[idx];
        this.selectedInspect = slot ? { kind: 'bag', bagIdx: idx, itemId: slot.itemId } : null;
        this.render();
      };
      el.ondblclick = () => {
        const slot = gameState.bagSlots[idx];
        if (!slot) return;
        const def = ITEMS[slot.itemId];
        if (def?.equipSlot) {
          gameState.equipFromBag(idx);
          SFX.playCraft();
        } else if (def?.healHp || def?.healEnergy) {
          this.callbacks.onUseHotbarItem(slot.itemId);
        }
      };
      el.ondragstart = () => {
        const slot = gameState.bagSlots[idx];
        if (!slot) return;
        this.dragPayload = { source: 'bag', bagIdx: idx, itemId: slot.itemId };
      };
      el.ondragover = (e) => {
        e.preventDefault();
        el.classList.add('drag-over');
      };
      el.ondragleave = () => el.classList.remove('drag-over');
      el.ondrop = (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        if (!this.dragPayload) return;
        if (this.dragPayload.source === 'bag') {
          gameState.moveOrSwapBagSlot(this.dragPayload.bagIdx, idx);
          const landed = gameState.bagSlots[idx];
          this.selectedInspect = landed ? { kind: 'bag', bagIdx: idx, itemId: landed.itemId } : null;
        } else if (this.dragPayload.source === 'equip') {
          gameState.unequipToBag(this.dragPayload.slot, idx);
        }
        this.dragPayload = null;
        this.render();
      };
    });

    // Equipment Slot Clicks & Drag/Drop
    this.modalLayer.querySelectorAll<HTMLElement>('[data-equip-slot]').forEach((el) => {
      const eqSlot = el.dataset.equipSlot as EquipSlot;
      el.onclick = () => {
        const id = gameState.equipment[eqSlot];
        this.selectedInspect = id ? { kind: 'equip', slot: eqSlot, itemId: id } : null;
        this.render();
      };
      el.ondragstart = () => {
        const id = gameState.equipment[eqSlot];
        if (!id) return;
        this.dragPayload = { source: 'equip', slot: eqSlot, itemId: id };
      };
      el.ondragover = (e) => {
        e.preventDefault();
        el.classList.add('drag-over');
      };
      el.ondragleave = () => el.classList.remove('drag-over');
      el.ondrop = (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        if (this.dragPayload?.source === 'bag') {
          if (gameState.equipFromBag(this.dragPayload.bagIdx, eqSlot)) {
            SFX.playCraft();
            this.selectedInspect = { kind: 'equip', slot: eqSlot, itemId: this.dragPayload.itemId };
          } else {
            this.showToast(`That item cannot go in ${EQUIP_SLOT_LABELS[eqSlot]}!`);
          }
        }
        this.dragPayload = null;
        this.render();
      };
    });

    const cancelMove = this.modalLayer.querySelector<HTMLElement>('[data-action="cancel-move"]');
    if (cancelMove) {
      cancelMove.onclick = () => {
        this.moveSourceBagIdx = null;
        this.render();
      };
    }

    // Inspector Actions
    this.modalLayer.querySelectorAll<HTMLElement>('[data-assign-hb]').forEach((el) => {
      el.onclick = () => {
        if (!this.selectedInspect) return;
        const hbIdx = Number(el.dataset.assignHb);
        gameState.assignHotbarSlot(hbIdx, this.selectedInspect.itemId);
        SFX.playPickup();
      };
    });

    this.modalLayer.querySelectorAll<HTMLElement>('[data-inspect-act]').forEach((el) => {
      el.onclick = () => {
        const act = el.dataset.inspectAct;
        if (!this.selectedInspect) return;
        if (act === 'unequip' && this.selectedInspect.kind === 'equip') {
          const slot = this.selectedInspect.slot;
          if (gameState.unequipToBag(slot)) {
            this.selectedInspect = null;
          } else {
            this.showToast('Inventory is full!');
          }
        } else if (this.selectedInspect.kind === 'bag') {
          const idx = this.selectedInspect.bagIdx;
          const slot = gameState.bagSlots[idx];
          if (!slot) return;
          if (act === 'equip') {
            if (gameState.equipFromBag(idx)) {
              SFX.playCraft();
              const eqSlot = ITEMS[slot.itemId]?.equipSlot;
              if (eqSlot) this.selectedInspect = { kind: 'equip', slot: eqSlot, itemId: slot.itemId };
            }
          } else if (act === 'use') {
            this.callbacks.onUseHotbarItem(slot.itemId);
          } else if (act === 'move') {
            this.moveSourceBagIdx = idx;
            this.render();
          } else if (act === 'sell1') {
            const earned = gameState.sellItem(slot.itemId, 1);
            if (earned > 0) SFX.playCoin();
          } else if (act === 'sellall') {
            const earned = gameState.sellItem(slot.itemId, slot.count);
            if (earned > 0) SFX.playCoin();
            this.selectedInspect = null;
          }
        }
        this.render();
      };
    });

    // Craft / Skills / Map events
    this.modalLayer.querySelectorAll<HTMLElement>('[data-station]').forEach((el) => {
      el.onclick = () => {
        this.activeStationTab = el.dataset.station as CraftingStation;
        this.activeStationId = null;
        this.renderModal();
      };
    });

    this.modalLayer.querySelectorAll<HTMLElement>('[data-pick-station]').forEach((el) => {
      el.onclick = () => {
        this.activeStationId = el.dataset.pickStation!;
        this.renderModal();
      };
    });

    this.modalLayer.querySelectorAll<HTMLElement>('[data-cancel-queue]').forEach((el) => {
      el.onclick = () => {
        const idx = Number(el.dataset.cancelQueue);
        if (this.activeStationId && this.callbacks.onCancelCraft?.(this.activeStationId, idx)) {
          this.renderModal();
        }
      };
    });

    this.modalLayer.querySelectorAll<HTMLElement>('[data-craft]').forEach((el) => {
      el.onclick = () => {
        const id = el.dataset.craft!;
        const rec = RECIPES.find((r) => r.id === id);
        if (!rec) return;
        if (rec.station === 'build') {
          gameState.pendingBuildRecipeId = id;
          this.activeModal = 'none';
          this.callbacks.onSelectBuild(id);
          this.render();
        } else if (rec.station === 'furnace' || rec.station === 'anvil' || rec.station === 'bonfire') {
          const st = this.getSelectedStation();
          if (st && this.callbacks.onEnqueueCraft?.(st.id, id)) {
            this.renderModal();
          }
        } else if (gameState.craftRecipe(id)) {
          SFX.playCraft();
          this.showToast(`Crafted ${rec.name}!`);
        }
      };
    });

    this.modalLayer.querySelectorAll<HTMLElement>('[data-skill]').forEach((el) => {
      el.onclick = () => {
        const id = el.dataset.skill!;
        if (gameState.unlockSkill(id)) {
          SFX.playLevelUp();
          const sk = SKILLS.find((s) => s.id === id);
          this.showToast(`Unlocked ${sk?.name ?? id}!`);
        }
      };
    });

    this.modalLayer.querySelectorAll<HTMLElement>('[data-buy-island]').forEach((el) => {
      el.onclick = () => {
        const [gx, gy] = el.dataset.buyIsland!.split(',').map(Number);
        this.callbacks.onBuyIsland(gx, gy);
      };
    });

    const volSlider = this.modalLayer.querySelector<HTMLInputElement>('#hud-vol-slider');
    if (volSlider) {
      volSlider.oninput = () => {
        const pct = Number(volSlider.value);
        SFX.setVolume(pct / 100);
        const lbl = this.modalLayer.querySelector<HTMLElement>('#hud-vol-label');
        if (lbl) lbl.textContent = `${pct}%`;
      };
    }

    this.modalLayer.querySelectorAll<HTMLElement>('[data-teleport]').forEach((el) => {
      el.onclick = () => {
        this.callbacks.onDebugAction?.('teleport_island', el.dataset.teleport);
      };
    });

    this.modalLayer.querySelectorAll<HTMLElement>('[data-dbg-time]').forEach((el) => {
      el.onclick = () => {
        this.callbacks.onDebugAction?.('set_time', el.dataset.dbgTime);
      };
    });

    this.modalLayer.querySelectorAll<HTMLElement>('[data-dbg-weather]').forEach((el) => {
      el.onclick = () => {
        this.callbacks.onDebugAction?.('set_weather', el.dataset.dbgWeather);
      };
    });

    this.modalLayer.querySelectorAll<HTMLElement>('[data-dbg]').forEach((el) => {
      el.onclick = () => {
        const act = el.dataset.dbg!;
        if (act === 'toggle_mode') {
          gameState.toggleDebugMode();
        } else if (act === 'add_resources') {
          gameState.debugAddResourcesPreset();
          SFX.playCraft();
          this.showToast('Debug: Added +50 Materials & +500g!');
        } else if (act === 'add_consumables') {
          gameState.debugAddConsumablesPreset();
          SFX.playPickup();
          this.showToast('Debug: Added +10 Consumables & Bombs!');
        } else if (act === 'add_coins') {
          gameState.coins += 1000;
          gameState.emit();
          SFX.playCoin();
        } else if (act === 'full_heal') {
          gameState.hp = gameState.getMaxHp();
          gameState.energy = gameState.getMaxEnergy();
          gameState.emit();
          SFX.playPickup();
        } else if (act === 'add_level_1') {
          gameState.debugAddLevels(1);
          SFX.playLevelUp();
        } else if (act === 'add_level_5') {
          gameState.debugAddLevels(5);
          SFX.playLevelUp();
        } else if (act === 'unlock_all_skills') {
          gameState.debugUnlockAllSkills();
          SFX.playLevelUp();
          this.showToast('Debug: All 20 Skills Unlocked!');
        } else if (act === 'unlock_relics') {
          gameState.debugUnlockAllRelics();
          SFX.playLevelUp();
          this.showToast('Debug: All Relic Rods & Bow Unlocked!');
        } else if (act === 'spawn_item') {
          const sel = this.modalLayer.querySelector<HTMLSelectElement>('#dbg-item-select');
          const qtyEl = this.modalLayer.querySelector<HTMLInputElement>('#dbg-item-qty');
          const itemId = sel?.value;
          const qty = Math.max(1, Math.min(999, Number(qtyEl?.value ?? 1)));
          if (itemId) {
            gameState.addItem(itemId, qty);
            SFX.playPickup();
          }
        } else {
          this.callbacks.onDebugAction?.(act);
        }
      };
    });
  }
}
