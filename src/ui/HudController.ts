import {
  ALL_EQUIP_SLOTS,
  BAG_COLS,
  BAG_SIZE,
  gameState,
  type CraftQueueJob,
  type EquipmentSlotKey,
  type InventoryFeedEvent,
} from '../core/GameState';

export type QueuedStationType =
  | 'furnace'
  | 'anvil'
  | 'bonfire'
  | 'alchemy_lab'
  | 'frost_kiln'
  | 'infernal_forge'
  | 'void_altar';

export interface StationQueueView {
  id: string;
  type: QueuedStationType;
  maxQueueSize: number;
  craftQueue: CraftQueueJob[];
}
import { SFX } from '../core/SoundFX';
import { dialogueBox } from './DialogueBox';
import { revealSequence } from './RevealSequence';
import { ITEMS, RARITY_COLOR } from '../data/items';
import { ISLANDS, STORY_CHAPTERS, WORLD_GRID_SIZE, getIslandAt, getIslandRecommendedLevel } from '../data/islands';
import { MONSTERS } from '../data/monsters';
import { IMPLEMENTED_FEATURES, OUTSTANDING_ITEMS } from '../data/projectProgress';
import { QUESTS, getQuestById } from '../data/quests';
import { RECIPES, type CraftingStation } from '../data/recipes';
import { PILLAR_META, SKILLS, type SkillPillar } from '../data/skills';

export type HudModal = 'none' | 'inventory' | 'craft' | 'skills' | 'quests' | 'map' | 'progress';

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

export interface MinimapSnapshot {
  worldTiles: number;
  playerTx: number;
  playerTy: number;
  terrainGrid: string[][];
  bridges: Array<{ tx: number; ty: number }>;
  buildings: Array<{ tx: number; ty: number }>;
  portals: Array<{ tx: number; ty: number }>;
  enemies: Array<{ tx: number; ty: number }>;
  waypoint?: { tx: number; ty: number; label: string };
}

type DragPayload =
  | { source: 'bag'; bagIdx: number; itemId: string }
  | { source: 'equip'; slot: EquipmentSlotKey; itemId: string }
  | { source: 'hotbar'; hotbarIdx: number; itemId: string };

type SelectedInspection =
  | { kind: 'bag'; bagIdx: number; itemId: string }
  | { kind: 'equip'; slot: EquipmentSlotKey; itemId: string }
  | null;

const EQUIP_SLOT_LABELS: Record<EquipmentSlotKey, string> = {
  weapon: 'Main Hand',
  tool: 'Tool',
  armor: 'Armor',
  trinket1: 'Trinket 1',
  trinket2: 'Trinket 2',
  trinket3: 'Trinket 3',
};

export class HudController {
  private root: HTMLElement;
  private chromeLayer!: HTMLElement;
  private modalLayer!: HTMLElement;
  private hotbarLayer!: HTMLElement;
  private feedLayer!: HTMLElement;
  private bannerLayer!: HTMLElement;
  private mobileBuildLayer!: HTMLElement;
  private mobileBuildDoneBtn?: HTMLButtonElement;
  private mobileBuildLabelEl?: HTMLElement;
  private tooltipEl!: HTMLElement;
  private questTrackerCollapsed = false;

  public activeModal: HudModal = 'none';
  private lastMenuTab: Exclude<HudModal, 'none'> = 'inventory';
  public activeStationTab: CraftingStation = 'build';
  public activeStationId: string | null = null;
  private selectedInspect: SelectedInspection = null;
  private moveSourceBagIdx: number | null = null;
  private dragPayload: DragPayload | null = null;

  private unsubChange?: () => void;
  private unsubVitals?: () => void;
  private unsubFeed?: () => void;
  private chromeBuilt = false;
  private minimapVisible = true;
  private minimapCanvas?: HTMLCanvasElement;
  private toastTimer?: number;
  private toastMsg = '';
  private timeLabelText = 'Day 1 • Sunny';
  private bossInfo: { name: string; hp: number; maxHp: number; portrait?: string } | null = null;
  private touchMoveVec = { x: 0, y: 0 };
  private touchEnabled =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
    window.innerWidth <= 1150;

  private callbacks: {
    onBuyIsland: (gx: number, gy: number) => void;
    onSelectBuild: (recipeId: string) => void;
    onUseHotbarItem: (itemId: string) => void;
    onSave: () => void;
    onExitToTitle?: () => void;
    onTouchAction?: () => void;
    onTouchInteract?: () => void;
    onTouchDash?: () => void;
    onTouchPlaceBuilding?: () => void;
    onTouchConfirmBuilding?: () => void;
    getStations?: (stationType: QueuedStationType) => StationQueueView[];
    getNearbyStations?: () => Set<CraftingStation>;
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
    onExitToTitle?: () => void;
    onTouchAction?: () => void;
    onTouchInteract?: () => void;
    onTouchDash?: () => void;
    onTouchPlaceBuilding?: () => void;
    onTouchConfirmBuilding?: () => void;
    getStations?: (stationType: QueuedStationType) => StationQueueView[];
    getNearbyStations?: () => Set<CraftingStation>;
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
    this.unsubFeed = gameState.onInventoryFeed((ev) => {
      this.updateVitalsInPlace();
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => this.updateVitalsInPlace());
    }
      this.pushInventoryFeed(ev);
    });
    this.render();
  }

  public isBlockingInput(): boolean {
    return this.activeModal !== 'none' || dialogueBox.isActive() || revealSequence.isActive();
  }

  private bindTouchControls(): void {
    const joy = this.chromeLayer.querySelector<HTMLElement>('#hud-touch-joy');
    const knob = this.chromeLayer.querySelector<HTMLElement>('#hud-touch-knob');
    const touchRoot = this.chromeLayer.querySelector<HTMLElement>('#hud-touch-controls');

    if (typeof window !== 'undefined') {
      window.addEventListener(
        'touchstart',
        () => {
          if (!this.touchEnabled) {
            this.touchEnabled = true;
            if (touchRoot) {
              touchRoot.style.display = this.activeModal === 'none' ? 'block' : 'none';
            }
          }
        },
        { once: true, passive: true },
      );
    }

    if (joy && knob) {
      let activeTouchId: number | null = null;
      const updateStick = (clientX: number, clientY: number) => {
        const rect = joy.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const maxR = 36;
        const dx = clientX - cx;
        const dy = clientY - cy;
        const dist = Math.hypot(dx, dy);
        const clamped = Math.min(maxR, dist);
        const ang = Math.atan2(dy, dx);
        const kx = Math.cos(ang) * clamped;
        const ky = Math.sin(ang) * clamped;
        knob.style.transform = `translate(${kx}px, ${ky}px)`;
        const normDist = clamped / maxR;
        if (normDist >= 0.15) {
          const mag = (normDist - 0.15) / 0.85;
          this.touchMoveVec = { x: Math.cos(ang) * mag, y: Math.sin(ang) * mag };
        } else {
          this.touchMoveVec = { x: 0, y: 0 };
        }
      };
      const resetStick = () => {
        activeTouchId = null;
        this.touchMoveVec = { x: 0, y: 0 };
        knob.style.transform = 'translate(0px, 0px)';
      };

      joy.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (activeTouchId === null && e.changedTouches.length > 0) {
          const t = e.changedTouches[0];
          activeTouchId = t.identifier;
          updateStick(t.clientX, t.clientY);
        }
      });
      joy.addEventListener('touchmove', (e) => {
        e.preventDefault();
        e.stopPropagation();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === activeTouchId) {
            updateStick(t.clientX, t.clientY);
          }
        }
      });
      const onEnd = (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeTouchId) {
            resetStick();
          }
        }
      };
      joy.addEventListener('touchend', onEnd);
      joy.addEventListener('touchcancel', onEnd);
    }

    const bindBtn = (id: string, fn?: () => void) => {
      const btn = this.chromeLayer.querySelector<HTMLElement>(id);
      if (!btn || !fn) return;
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
    };
    bindBtn('#hud-touch-act', this.callbacks.onTouchAction);
    bindBtn('#hud-touch-dash', this.callbacks.onTouchDash);
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
      SFX.playUiClose();
      SFX.setMusicPaused(false);
    } else {
      this.activeModal = modal;
      if (modal !== 'none') {
        this.lastMenuTab = modal;
        SFX.playUiOpen();
        SFX.setMusicPaused(true);
      } else {
        SFX.playUiClose();
        SFX.setMusicPaused(false);
      }
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

  public closeModal(): void {
    if (this.activeModal === 'none') return;
    this.activeModal = 'none';
    this.moveSourceBagIdx = null;
    SFX.playUiClose();
    SFX.setMusicPaused(false);
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

  public toggleMinimap(): void {
    this.minimapVisible = !this.minimapVisible;
    const body = this.chromeLayer.querySelector<HTMLElement>('#hud-minimap-body');
    const btn = this.chromeLayer.querySelector<HTMLElement>('#hud-minimap-toggle');
    if (body) body.style.display = this.minimapVisible ? 'block' : 'none';
    if (btn) btn.textContent = this.minimapVisible ? 'Hide' : 'Show';
  }

  public updateMinimap(data: MinimapSnapshot): void {
    if (!this.minimapVisible || !this.minimapCanvas) return;
    const ctx = this.minimapCanvas.getContext('2d');
    if (!ctx) return;
    const W = this.minimapCanvas.width;
    const H = this.minimapCanvas.height;

    // 1/2 world coverage centered directly on the player
    const viewTiles = Math.max(20, data.worldTiles / 2);
    const halfView = viewTiles / 2;
    const startTx = data.playerTx - halfView;
    const startTy = data.playerTy - halfView;
    const scale = W / viewTiles;

    ctx.fillStyle = '#183f59';
    ctx.fillRect(0, 0, W, H);

    const colMap: Record<string, string> = {
      grass: '#58b354',
      autumn: '#d6975c',
      winter: '#cce8f4',
      graveyard: '#736c8a',
      infernal: '#a8474c',
    };

    const yMin = Math.max(0, Math.floor(startTy));
    const yMax = Math.min(data.worldTiles - 1, Math.ceil(startTy + viewTiles));
    const xMin = Math.max(0, Math.floor(startTx));
    const xMax = Math.min(data.worldTiles - 1, Math.ceil(startTx + viewTiles));
    const tileDrawSz = Math.max(1.5, Math.ceil(scale));

    for (let y = yMin; y <= yMax; y++) {
      const row = data.terrainGrid[y];
      if (!row) continue;
      for (let x = xMin; x <= xMax; x++) {
        const t = row[x];
        if (t === 'water') continue;
        ctx.fillStyle = colMap[t] ?? '#58b354';
        ctx.fillRect(
          Math.floor((x - startTx) * scale),
          Math.floor((y - startTy) * scale),
          tileDrawSz,
          tileDrawSz,
        );
      }
    }

    const toMini = (tx: number, ty: number) => ({
      mx: (tx - startTx) * scale,
      my: (ty - startTy) * scale,
    });

    ctx.fillStyle = '#a36b3c';
    for (const br of data.bridges) {
      const { mx, my } = toMini(br.tx, br.ty);
      if (mx < -2 || my < -2 || mx > W + 2 || my > H + 2) continue;
      ctx.fillRect(Math.floor(mx), Math.floor(my), Math.max(2, tileDrawSz), Math.max(2, tileDrawSz));
    }

    ctx.fillStyle = '#ffe066';
    for (const b of data.buildings) {
      const { mx, my } = toMini(b.tx, b.ty);
      if (mx < -2 || my < -2 || mx > W + 2 || my > H + 2) continue;
      ctx.fillRect(Math.round(mx) - 1, Math.round(my) - 1, 2, 2);
    }

    ctx.fillStyle = '#c77dff';
    for (const p of data.portals) {
      const { mx, my } = toMini(p.tx, p.ty);
      if (mx < -2 || my < -2 || mx > W + 2 || my > H + 2) continue;
      ctx.fillRect(Math.round(mx) - 1, Math.round(my) - 1, 3, 3);
    }

    ctx.fillStyle = '#ff5e6c';
    for (const e of data.enemies) {
      const { mx, my } = toMini(e.tx, e.ty);
      if (mx < -2 || my < -2 || mx > W + 2 || my > H + 2) continue;
      ctx.fillRect(Math.round(mx) - 1, Math.round(my) - 1, 2, 2);
    }

    // Player pulse blip dead center on the minimap
    const cx = Math.round(W / 2);
    const cy = Math.round(H / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 2, cy - 2, 5, 5);
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(cx - 1, cy - 1, 3, 3);

    // Tracked quest waypoint (clamped to minimap edge if off-view)
    if (data.waypoint) {
      const raw = toMini(data.waypoint.tx, data.waypoint.ty);
      const wx = Math.max(5, Math.min(W - 5, raw.mx));
      const wy = Math.max(5, Math.min(H - 5, raw.my));
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffd242';
      ctx.fillRect(-3.5, -3.5, 7, 7);
      ctx.strokeStyle = '#0d1522';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-3.5, -3.5, 7, 7);
      ctx.restore();
    }
  }

  private setupLayers(): void {
    this.root.innerHTML = '';
    this.chromeLayer = document.createElement('div');
    this.bannerLayer = document.createElement('div');
    this.feedLayer = document.createElement('div');
    this.feedLayer.className = 'item-feed-stack';
    this.modalLayer = document.createElement('div');
    this.hotbarLayer = document.createElement('div');
    this.mobileBuildLayer = document.createElement('div');
    this.mobileBuildLayer.className = 'hud-panel hud-interactive';
    this.mobileBuildLayer.style.cssText =
      'position:absolute; display:none; padding:5px 8px; z-index:30; border-color:#ffe066; transform:translate(-50%, -100%); align-items:center; gap:6px; white-space:nowrap; box-shadow:0 4px 12px rgba(0,0,0,0.55);';
    this.mobileBuildLayer.innerHTML = `
      <span id="mobile-build-name" style="font-size:11px; font-weight:700; color:#ffe9a6; margin-right:2px;"></span>
      <button id="mobile-build-done" class="hud-btn primary" style="padding:4px 10px; font-size:12px;">Done</button>
      <button id="mobile-build-exit" class="hud-btn" style="padding:4px 9px; font-size:12px; border-color:#ff7a85; color:#ffb4bc;">Exit</button>
    `;
    this.mobileBuildDoneBtn = this.mobileBuildLayer.querySelector<HTMLButtonElement>('#mobile-build-done') ?? undefined;
    this.mobileBuildLabelEl = this.mobileBuildLayer.querySelector<HTMLElement>('#mobile-build-name') ?? undefined;
    const exitBtn = this.mobileBuildLayer.querySelector<HTMLButtonElement>('#mobile-build-exit');
    if (this.mobileBuildDoneBtn) {
      this.mobileBuildDoneBtn.onclick = () => {
        this.callbacks.onTouchConfirmBuilding?.();
      };
    }
    if (exitBtn) {
      exitBtn.onclick = () => {
        gameState.pendingBuildRecipeId = null;
        this.hideMobileBuildControls();
        this.renderBanners();
      };
    }

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.id = 'hud-item-tooltip';
    this.tooltipEl.className = 'hud-panel';
    this.tooltipEl.style.display = 'none';

    this.root.append(
      this.chromeLayer,
      this.bannerLayer,
      this.feedLayer,
      this.modalLayer,
      this.hotbarLayer,
      this.mobileBuildLayer,
      this.tooltipEl,
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
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 20px rgba(0,0,0,0.55);
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
        display: inline-flex;
        align-items: center;
        gap: 5px;
        transition: background 100ms ease, border-color 100ms ease, transform 80ms ease;
      }
      .hud-btn:active:not(:disabled) { transform: scale(0.97); }
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
      .hotbar-slot.active { border-color: #ffe066; box-shadow: 0 0 10px rgba(255,224,102,0.55); transform: translateY(-2px); }
      .hotbar-slot.drag-over { border-color: #7ae398; background: rgba(45, 92, 65, 0.7); }
      .hotbar-slot.rarity-uncommon:not(.active) { border-color: #469c60; }
      .hotbar-slot.rarity-rare:not(.active) { border-color: #3d7ec7; }
      .hotbar-slot.rarity-epic:not(.active) { border-color: #9353c9; box-shadow: inset 0 0 6px rgba(199,125,255,0.22); }
      .hotbar-slot.rarity-relic:not(.active) { border-color: #cfa430; box-shadow: inset 0 0 7px rgba(255,210,66,0.28); }
      .hotbar-eq {
        position: absolute;
        top: 2px;
        right: 2px;
        font-size: 7px;
        font-weight: 800;
        color: #8ef5a7;
        background: rgba(18, 44, 28, 0.9);
        border: 1px solid #4fa86c;
        border-radius: 2px;
        padding: 0 2px;
        line-height: 1.2;
        pointer-events: none;
      }
      #hud-item-tooltip {
        position: fixed;
        z-index: 60;
        pointer-events: none;
        padding: 8px 10px;
        max-width: 240px;
        font-size: 11px;
        line-height: 1.35;
      }
      @keyframes readyPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.55; }
      }
      .quest-ready-pill {
        font-size: 9px;
        color: #8ef5a7;
        font-weight: 700;
        animation: readyPulse 1.5s ease-in-out infinite;
      }
      @keyframes lowHpPulse {
        0%, 100% { opacity: 0.42; }
        50% { opacity: 0.85; }
      }
      #hud-low-hp-vignette {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 9;
        box-shadow: inset 0 0 75px rgba(220, 35, 55, 0.85);
        display: none;
        animation: lowHpPulse 1.1s ease-in-out infinite;
      }
      @media (max-width: 760px) {
        #hud-vitals-panel {
          top: max(6px, env(safe-area-inset-top)) !important;
          left: max(6px, env(safe-area-inset-left)) !important;
          padding: 5px 7px !important;
          gap: 6px !important;
        }
        #hud-vitals-panel .bar-track { width: 102px; height: 9px; }
        #hud-top-nav {
          top: max(6px, env(safe-area-inset-top)) !important;
          right: max(6px, env(safe-area-inset-right)) !important;
          gap: 4px !important;
        }
        #hud-top-nav .hud-btn { padding: 4px 7px; font-size: 11px; }
        .nav-key { display: none; }
        .hotbar-dock { bottom: max(6px, env(safe-area-inset-bottom)); gap: 4px; padding: 4px 5px; }
        .hotbar-slot { width: 38px; height: 38px; }
        #hud-minimap-wrap { bottom: max(6px, env(safe-area-inset-bottom)) !important; right: max(6px, env(safe-area-inset-right)) !important; }
      }
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

      /* Mobile / Touch Controls (hidden on desktop) */
      .touch-joy-base {
        position: absolute;
        left: 22px;
        bottom: 84px;
        width: 108px;
        height: 108px;
        border-radius: 50%;
        background: rgba(15, 25, 40, 0.52);
        border: 2px solid rgba(110, 155, 200, 0.55);
        touch-action: none;
        z-index: 26;
      }
      .touch-joy-knob {
        position: absolute;
        left: 34px;
        top: 34px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(255, 224, 102, 0.72);
        border: 2px solid #fff3c4;
        pointer-events: none;
      }
      .touch-actions-wrap {
        position: absolute;
        right: 132px;
        bottom: 84px;
        display: flex;
        gap: 10px;
        align-items: flex-end;
        z-index: 26;
      }
      .touch-act-btn {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: rgba(17, 29, 46, 0.72);
        border: 2px solid #6389b0;
        color: #f6eedc;
        font-size: 11px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        touch-action: none;
      }
      .touch-act-btn.primary {
        width: 64px;
        height: 64px;
        background: rgba(45, 92, 62, 0.8);
        border-color: #7ae398;
      }
      .touch-act-btn:active {
        transform: scale(0.93);
      }

      .nav-short { display: none; }
      @media (max-width: 1120px), (max-height: 540px) {
        .nav-full, .nav-key { display: none; }
        .nav-short { display: inline; }
        #hud-vitals-panel { padding: 4px 6px !important; gap: 6px !important; max-width: 245px; }
        #hud-vitals-panel img.px-icon[style*="42px"] { width: 28px !important; height: 28px !important; }
        #hud-vitals-panel .bar-track { width: 84px; height: 7px; }
        #hud-time-badge { font-size: 9px !important; padding: 0px 4px !important; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #hud-top-nav { max-width: calc(100vw - 265px) !important; gap: 4px !important; }
        #hud-top-nav .hud-btn { padding: 4px 7px; font-size: 10px; }
        #hud-minimap-canvas { width: 80px !important; height: 80px !important; }
        .touch-actions-wrap { right: 118px; bottom: 68px; gap: 7px; }
        .touch-act-btn { width: 46px; height: 46px; font-size: 10px; }
        .touch-act-btn.primary { width: 54px; height: 54px; }
        .touch-joy-base { left: 16px; bottom: 68px; width: 92px; height: 92px; }
        .touch-joy-knob { left: 28px; top: 28px; width: 36px; height: 36px; }
        .hotbar-dock { padding: 4px; gap: 3px; }
        .hotbar-slot { width: 38px; height: 38px; }
        .modal-box { width: 98vw; max-height: 94vh; }
        .ledger-window { width: 98vw; height: 94vh; max-height: 94vh; }
        .ledger-tabs { padding: 4px 8px; gap: 4px; flex-wrap: nowrap; overflow-x: auto; }
        .ledger-tabs .hud-btn { padding: 4px 7px; font-size: 11px; white-space: nowrap; }
        .ledger-body { -webkit-overflow-scrolling: touch; padding: 8px; }
        .diablo-grid { grid-template-columns: 185px 1fr !important; gap: 8px !important; }
        .inv-grid { grid-template-columns: repeat(6, minmax(0, 1fr)) !important; gap: 4px !important; }
        .inv-slot { width: 100%; height: 38px; }
      }
    `;
    document.head.appendChild(style);
  }

  public getTouchMoveVector(): { x: number; y: number } {
    return this.touchMoveVec;
  }

  public isTouchEnabled(): boolean {
    return this.touchEnabled;
  }

  public render(): void {
    this.renderChrome();
    this.renderBanners();
    this.renderModal();
    this.renderHotbar();
    const touchEl = this.chromeLayer?.querySelector<HTMLElement>('#hud-touch-controls');
    if (touchEl) {
      touchEl.style.display = this.touchEnabled && this.activeModal === 'none' ? 'block' : 'none';
    }
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
    const vignette = this.chromeLayer.querySelector<HTMLElement>('#hud-low-hp-vignette');
    if (vignette) {
      vignette.style.display = hpPct > 0 && hpPct <= 25 ? 'block' : 'none';
    }
    if (spBadge) {
      spBadge.style.display = gameState.skillPoints > 0 ? 'inline-block' : 'none';
      spBadge.textContent = `+${gameState.skillPoints} SP`;
    }

    const trackerEl = this.chromeLayer.querySelector<HTMLElement>('#hud-quest-tracker');
    const topNavEl = this.chromeLayer.querySelector<HTMLElement>('#hud-top-nav');
    const navBottom = topNavEl ? topNavEl.getBoundingClientRect().bottom : 44;
    if (trackerEl) {
      const tracked = gameState.getTrackedQuest();
      if (!tracked) {
        trackerEl.style.display = 'none';
        this.feedLayer.style.top = `${Math.max(54, navBottom + 8)}px`;
      } else {
        trackerEl.style.display = 'block';
        trackerEl.style.top = `${Math.max(52, navBottom + 6)}px`;
        const trackerRect = trackerEl.getBoundingClientRect();
        this.feedLayer.style.top = `${Math.max(56, trackerRect.bottom + 8)}px`;
        const ready = gameState.isQuestReadyToTurnIn(tracked.id);
        const objHtml = tracked.objectives
          .map((o) => {
            const cur = gameState.getObjectiveProgress(tracked.id, o);
            const done = cur >= o.count;
            return `<div style="display:flex; justify-content:space-between; gap:10px; color:${done ? '#8ef5a7' : '#d2e2f2'};"><span>${done ? '✓ ' : '• '}${o.label}</span><span>${cur}/${o.count}</span></div>`;
          })
          .join('');
        trackerEl.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; ${this.questTrackerCollapsed ? '' : 'margin-bottom:3px;'}">
            <span style="display:inline-flex; align-items:center; gap:5px; min-width:0;">
              <img src="assets/hud_icons/quest.png" class="px-icon" style="width:14px; height:14px;" />
              <strong style="color:#ffd242; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${tracked.title}</strong>
            </span>
            <span style="display:inline-flex; align-items:center; gap:4px;">
              ${ready ? `<span class="quest-ready-pill">READY</span>` : ''}
              <button class="hud-btn" data-quest-collapse="1" style="padding:0 5px; font-size:9px; line-height:1.4;">${this.questTrackerCollapsed ? '+' : '−'}</button>
            </span>
          </div>
          ${this.questTrackerCollapsed ? '' : `<div style="font-size:10px; display:flex; flex-direction:column; gap:2px;">${objHtml}</div>${tracked.waypoint ? `<div style="margin-top:3px; font-size:9px; color:#9db6cf; display:flex; align-items:center; gap:4px;"><img src="assets/hud_icons/compass.png" class="px-icon" style="width:11px; height:11px;" /><span>${ready ? `Return to ${tracked.npcName} at ` : ''}${tracked.waypoint.label}</span></div>` : ''}`}
        `;
        const colBtn = trackerEl.querySelector<HTMLElement>('[data-quest-collapse]');
        if (colBtn) {
          colBtn.onclick = (ev) => {
            ev.stopPropagation();
            this.questTrackerCollapsed = !this.questTrackerCollapsed;
            this.updateVitalsInPlace();
          };
        }
      }
    }
  }

  private renderChrome(): void {
    const portrait = `assets/portraits/${gameState.heroClass}/${gameState.heroClass}_frame.png`;

    if (!this.chromeBuilt) {
      this.chromeLayer.innerHTML = `
        <div id="hud-low-hp-vignette"></div>
        <div id="hud-vitals-panel" class="hud-panel hud-interactive" style="position:absolute; top:10px; left:10px; padding:7px 10px; display:flex; gap:10px; align-items:center;">
          <img src="${portrait}" class="px-icon" style="width:42px; height:42px;" />
          <div style="display:flex; flex-direction:column; gap:3px;">
            <div style="display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700;">
              <span id="hud-level-label"></span>
              <span style="color:#ffd95a; display:inline-flex; align-items:center; gap:3px;"><img src="assets/ui_icons/coin.png" class="px-icon" style="width:14px; height:14px;" /><span id="hud-coins-val"></span></span>
              <span id="hud-time-badge" style="background:#1c2d45; border:1px solid #486485; padding:1px 6px; border-radius:4px; font-size:10px; color:#b6dcff;">${this.timeLabelText}</span>
              <span id="hud-sp-badge" style="background:#7842a8; padding:1px 6px; border-radius:10px; font-size:10px; display:none;"></span>
            </div>
            <div style="display:flex; align-items:center; gap:5px; font-size:10px;">
              <img src="assets/hud_icons/heart.png" class="px-icon" style="width:13px; height:13px;" title="HP" />
              <div class="bar-track"><div id="hud-hp-fill" class="bar-fill" style="background:#e04f5f;"></div></div>
              <span id="hud-hp-text"></span>
            </div>
            <div style="display:flex; align-items:center; gap:5px; font-size:10px;">
              <img src="assets/hud_icons/energy.png" class="px-icon" style="width:13px; height:13px;" title="Energy" />
              <div class="bar-track"><div id="hud-en-fill" class="bar-fill" style="background:#48c768;"></div></div>
              <span id="hud-en-text"></span>
            </div>
            <div style="display:flex; align-items:center; gap:5px; font-size:10px;">
              <img src="assets/hud_icons/xp.png" class="px-icon" style="width:13px; height:13px;" title="XP" />
              <div class="bar-track" style="height:6px;"><div id="hud-xp-fill" class="bar-fill" style="background:#4fa8ff;"></div></div>
              <span id="hud-xp-text"></span>
            </div>
          </div>
        </div>

        <div id="hud-top-nav" class="hud-interactive" style="position:absolute; top:10px; right:10px; display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
          <button class="hud-btn gold" data-nav="menu" id="hud-menu-btn"><img src="assets/hud_icons/menu.png" class="px-icon" style="width:14px; height:14px;" /><span>Menu<span class="nav-key"> [I/Tab]</span></span></button>
          <button class="hud-btn primary" data-action="save" title="Save to File ${gameState.activeSlotIndex + 1}"><img src="assets/hud_icons/save.png" class="px-icon" style="width:14px; height:14px;" /><span>Save #${gameState.activeSlotIndex + 1}</span></button>
          <button class="hud-btn" data-action="files" id="hud-files-btn" style="${this.callbacks.onExitToTitle ? '' : 'display:none;'}" title="Save & Return to File Select">Files</button>
          <button class="hud-btn" data-action="music" id="hud-music-btn"><img src="assets/hud_icons/music_off.png" class="px-icon" style="width:14px; height:14px;" /><span>Music</span></button>
          <button class="hud-btn" data-action="mute" id="hud-mute-btn"><img src="assets/hud_icons/sfx_on.png" class="px-icon" style="width:14px; height:14px;" /><span>SFX</span></button>
        </div>

        <div id="hud-quest-tracker" class="hud-panel hud-interactive" style="position:absolute; top:54px; right:10px; width:215px; padding:7px 9px; display:none; z-index:14; cursor:pointer;" title="Click to open Quest Log [Q]"></div>

        <div id="hud-minimap-wrap" class="hud-panel hud-interactive" style="position:absolute; bottom:12px; right:12px; padding:5px 6px; z-index:25;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px;">
            <span style="font-size:10px; font-weight:700; color:#b6dcff;">Minimap [N]</span>
            <button class="hud-btn" id="hud-minimap-toggle" style="padding:1px 5px; font-size:9px;">Hide</button>
          </div>
          <div id="hud-minimap-body" style="display:block;">
            <canvas id="hud-minimap-canvas" width="108" height="108" style="display:block; border:1px solid #3c506b; border-radius:3px; image-rendering:pixelated;"></canvas>
          </div>
        </div>

        <div id="hud-touch-controls" style="display:${this.touchEnabled ? 'block' : 'none'};">
          <div id="hud-touch-joy" class="touch-joy-base hud-interactive">
            <div id="hud-touch-knob" class="touch-joy-knob"></div>
          </div>
          <div class="touch-actions-wrap hud-interactive">
            <button id="hud-touch-dash" class="touch-act-btn" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;"><img src="assets/hud_icons/dash.png" class="px-icon" style="width:20px; height:20px; pointer-events:none;" /><span style="font-size:9px;">DASH</span></button>
            <button id="hud-touch-act" class="touch-act-btn primary" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;"><img id="hud-touch-act-icon" src="assets/hud_icons/sword.png" class="px-icon" style="width:22px; height:22px; pointer-events:none;" /><span style="font-size:9px;">ACT</span></button>
          </div>
        </div>
      `;

      this.chromeLayer.querySelectorAll<HTMLElement>('[data-nav]').forEach((el) => {
        el.onclick = () => {
          SFX.playUiClick();
          const nav = el.dataset.nav;
          if (nav === 'menu') {
            this.toggleModal(this.activeModal === 'none' ? this.lastMenuTab : 'none');
          } else {
            this.toggleModal(nav as HudModal);
          }
        };
      });
      this.chromeLayer.querySelector<HTMLElement>('#hud-quest-tracker')?.addEventListener('click', () => {
        SFX.playUiClick();
        this.toggleModal('quests');
      });
      this.chromeLayer.querySelector<HTMLElement>('[data-action="save"]')!.onclick = () => this.callbacks.onSave();
      this.chromeLayer.querySelector<HTMLElement>('[data-action="files"]')?.addEventListener('click', () => {
        SFX.playUiClick();
        this.callbacks.onExitToTitle?.();
      });
      this.chromeLayer.querySelector<HTMLElement>('[data-action="music"]')!.onclick = () => {
        SFX.setMusicEnabled(!SFX.musicEnabled);
        this.renderChrome();
      };
      this.chromeLayer.querySelector<HTMLElement>('[data-action="mute"]')!.onclick = () => {
        SFX.setMuted(!SFX.muted);
        this.renderChrome();
      };
      this.minimapCanvas = this.chromeLayer.querySelector<HTMLCanvasElement>('#hud-minimap-canvas') ?? undefined;
      if (this.minimapCanvas) {
        this.minimapCanvas.style.cursor = 'pointer';
        this.minimapCanvas.title = 'Click to open Islands Map [M]';
        this.minimapCanvas.onclick = () => {
          SFX.playUiClick();
          this.toggleModal('map');
        };
      }
      // Hidden 7-tap QA debug unlock on level label
      let lvlTapCount = 0;
      let lvlTapTimer: number | undefined;
      this.chromeLayer.querySelector<HTMLElement>('#hud-level-label')?.addEventListener('click', () => {
        lvlTapCount += 1;
        if (lvlTapTimer) clearTimeout(lvlTapTimer);
        lvlTapTimer = window.setTimeout(() => {
          lvlTapCount = 0;
        }, 1800);
        if (lvlTapCount >= 7) {
          lvlTapCount = 0;
          gameState.toggleDebugMode();
          this.showToast(`QA Debug Mode: ${gameState.debugMode ? 'ON' : 'OFF'}`);
          this.render();
        }
      });
      this.chromeLayer.querySelector('#hud-minimap-toggle')?.addEventListener('click', () => {
        this.toggleMinimap();
      });
      this.bindTouchControls();
      this.chromeBuilt = true;
    }

    this.updateVitalsInPlace();
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => this.updateVitalsInPlace());
    }

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
    if (muteBtn) {
      muteBtn.innerHTML = `<img src="assets/hud_icons/${SFX.muted ? 'sfx_off' : 'sfx_on'}.png" class="px-icon" style="width:14px; height:14px;" /><span>${SFX.muted ? 'Muted' : 'SFX'}</span>`;
    }
    const musicBtn = this.chromeLayer.querySelector<HTMLElement>('#hud-music-btn');
    if (musicBtn) {
      musicBtn.innerHTML = `<img src="assets/hud_icons/${SFX.musicEnabled ? 'music_on' : 'music_off'}.png" class="px-icon" style="width:14px; height:14px;" /><span>${SFX.musicEnabled ? 'Music: On' : 'Music: Off'}</span>`;
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
      if (this.touchEnabled) {
        html += `
          <div class="hud-panel" style="position:absolute; bottom:78px; left:50%; transform:translateX(-50%); padding:5px 12px; font-size:11px; border-color:#ffe066; z-index:25; white-space:nowrap;">
            Placing: <strong>${rec?.name ?? ''}</strong> — Drag gizmo to position
          </div>
        `;
      } else {
        html += `
          <div class="hud-panel hud-interactive" style="position:absolute; bottom:78px; left:50%; transform:translateX(-50%); padding:6px 14px; font-size:12px; border-color:#ffe066; z-index:25; display:flex; align-items:center; gap:6px; flex-wrap:wrap; justify-content:center;">
            <span>Placing: <strong>${rec?.name ?? ''}</strong> — Left-click valid tile • Right-click or</span>
            <button class="hud-btn" data-action="cancel-build" style="padding:2px 6px;">Cancel [Esc]</button>
          </div>
        `;
      }
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
    const placeBtn = this.bannerLayer.querySelector<HTMLElement>('[data-action="place-ahead"]');
    if (placeBtn) {
      placeBtn.onclick = () => {
        this.callbacks.onTouchPlaceBuilding?.();
      };
    }
  }

  public updateMobileBuildControls(screenX: number, screenY: number, canPlace: boolean, label: string): void {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
    const clampedX = Math.max(84, Math.min(vw - 84, screenX));
    const clampedY = Math.max(46, Math.min(vh - 96, screenY));
    this.mobileBuildLayer.style.display = 'flex';
    this.mobileBuildLayer.style.left = `${Math.round(clampedX)}px`;
    this.mobileBuildLayer.style.top = `${Math.round(clampedY)}px`;
    if (this.mobileBuildLabelEl && this.mobileBuildLabelEl.textContent !== label) {
      this.mobileBuildLabelEl.textContent = label;
    }
    if (this.mobileBuildDoneBtn) {
      this.mobileBuildDoneBtn.style.opacity = canPlace ? '1' : '0.55';
      this.mobileBuildDoneBtn.style.borderColor = canPlace ? '#7ef29d' : '#ff7a85';
    }
  }

  public hideMobileBuildControls(): void {
    if (this.mobileBuildLayer) {
      this.mobileBuildLayer.style.display = 'none';
    }
  }

  private showItemTooltip(itemId: string, anchorEl: HTMLElement): void {
    const def = ITEMS[itemId];
    if (!def || !this.tooltipEl) return;
    const stats: string[] = [];
    if (def.stats?.attack) stats.push(`ATK +${def.stats.attack}`);
    if (def.stats?.gather) stats.push(`GTH +${def.stats.gather}`);
    if (def.stats?.armor) stats.push(`DEF +${def.stats.armor}`);
    if (def.stats?.critPct) stats.push(`CRIT +${def.stats.critPct}%`);
    if (def.stats?.speedPct) stats.push(`SPD +${def.stats.speedPct}%`);
    if (def.healHp) stats.push(`+${def.healHp} HP`);
    if (def.healEnergy) stats.push(`+${def.healEnergy} EN`);
    this.tooltipEl.innerHTML = `
      <div style="display:flex; align-items:center; gap:7px; margin-bottom:4px;">
        ${def.iconKey ? `<img src="assets/${def.iconKey}.png" class="px-icon" style="width:22px; height:22px;" />` : ''}
        <div>
          <div style="font-weight:700; color:${RARITY_COLOR[def.rarity]};">${def.name}</div>
          <div style="font-size:9px; text-transform:uppercase; color:#8ca8c4;">${def.rarity} ${def.category}</div>
        </div>
      </div>
      ${stats.length ? `<div style="color:#8ef5a7; font-size:10px; font-weight:600; margin-bottom:3px;">${stats.join(' • ')}</div>` : ''}
      <div style="color:#d2e2f2; font-size:10px;">${def.description}</div>
      ${def.sellValue > 0 ? `<div style="margin-top:4px; font-size:9px; color:#ffd95a;">Sell: ${def.sellValue}g</div>` : ''}
    `;
    this.tooltipEl.style.display = 'block';
    const rect = anchorEl.getBoundingClientRect();
    const tw = this.tooltipEl.offsetWidth || 200;
    const th = this.tooltipEl.offsetHeight || 80;
    const vw = window.innerWidth;
    const left = Math.max(8, Math.min(vw - tw - 8, rect.left + rect.width / 2 - tw / 2));
    const top = Math.max(8, rect.top - th - 8);
    this.tooltipEl.style.left = `${Math.round(left)}px`;
    this.tooltipEl.style.top = `${Math.round(top)}px`;
  }

  private hideItemTooltip(): void {
    if (this.tooltipEl) this.tooltipEl.style.display = 'none';
  }

  private renderHotbar(): void {
    const eqValues = new Set(Object.values(gameState.equipment).filter(Boolean));
    let html = `<div class="hotbar-dock hud-interactive">`;
    for (let i = 0; i < 9; i++) {
      const itemId = gameState.hotbar[i];
      const def = itemId ? ITEMS[itemId] : undefined;
      const count = itemId ? gameState.getItemCount(itemId) : 0;
      const active = gameState.selectedHotbarIndex === i;
      const showCount = def && !def.equipSlot && def.category !== 'gadget' && count > 0;
      const cdMs = def?.category === 'gadget' ? gameState.getGadgetRemainingMs(itemId) : 0;
      const isEq = Boolean(itemId && eqValues.has(itemId));
      const rarityCls = def ? `rarity-${def.rarity}` : '';
      html += `
        <div class="hotbar-slot ${rarityCls} ${active ? 'active' : ''}" data-hotbar="${i}" draggable="${itemId ? 'true' : 'false'}">
          <span style="position:absolute; top:2px; left:4px; font-size:9px; color:#8ca8c4;">${i + 1}</span>
          ${isEq ? `<span class="hotbar-eq">EQ</span>` : ''}
          ${
            def
              ? `${
                  def.iconKey
                    ? `<img src="assets/${def.iconKey}.png" class="px-icon" style="width:22px; height:22px; pointer-events:none; ${cdMs > 0 ? 'opacity:0.45;' : ''}" />`
                    : ''
                }
                 <span style="font-size:8px; margin-top:1px; max-width:42px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:${RARITY_COLOR[def.rarity]}; pointer-events:none;">${def.name.split(' ').pop()}</span>`
              : ''
          }
          ${cdMs > 0 ? `<span style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:#ffd242; text-shadow:0 1px 3px #000; pointer-events:none;">${(cdMs / 1000).toFixed(1)}s</span>` : ''}
          ${showCount ? `<span style="position:absolute; bottom:1px; right:3px; font-size:9px; color:#ffe066; font-weight:700; pointer-events:none;">${count}</span>` : ''}
        </div>
      `;
    }
    html += `</div>`;
    this.hotbarLayer.innerHTML = html;

    // Sync touch ACT button icon with selected hotbar item
    const selId = gameState.hotbar[gameState.selectedHotbarIndex];
    const selDef = selId ? ITEMS[selId] : undefined;
    const touchActIcon = this.chromeLayer?.querySelector<HTMLImageElement>('#hud-touch-act-icon');
    if (touchActIcon) {
      touchActIcon.src = selDef?.iconKey ? `assets/${selDef.iconKey}.png` : 'assets/hud_icons/sword.png';
    }

    this.hotbarLayer.querySelectorAll<HTMLElement>('[data-hotbar]').forEach((el) => {
      const idx = Number(el.dataset.hotbar);
      const itemId = gameState.hotbar[idx];
      let longPressTimer: number | null = null;
      el.onmouseenter = () => {
        if (itemId) this.showItemTooltip(itemId, el);
      };
      el.onmouseleave = () => this.hideItemTooltip();
      el.addEventListener(
        'touchstart',
        () => {
          if (!itemId) return;
          longPressTimer = window.setTimeout(() => this.showItemTooltip(itemId, el), 380);
        },
        { passive: true },
      );
      el.addEventListener(
        'touchend',
        () => {
          if (longPressTimer !== null) clearTimeout(longPressTimer);
          this.hideItemTooltip();
        },
        { passive: true },
      );
      el.onclick = () => {
        this.hideItemTooltip();
        if (gameState.selectedHotbarIndex !== idx) SFX.playHotbarSelect();
        gameState.selectedHotbarIndex = idx;
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

    const activeCount = Object.keys(gameState.activeQuests).length;
    const tabs: Array<{ id: HudModal; label: string }> = [
      { id: 'inventory', label: 'Character & Bag [I]' },
      { id: 'craft', label: 'Craft & Build [Tab]' },
      { id: 'skills', label: `Skills [K]${gameState.skillPoints > 0 ? ` (+${gameState.skillPoints})` : ''}` },
      { id: 'quests', label: `Quests [Q]${activeCount > 0 ? ` (${activeCount})` : ''}` },
      { id: 'map', label: `World Map [M] (${gameState.ownedIslands.size}/25)` },
      { id: 'progress', label: gameState.debugMode ? 'Progress & Debug [P]' : 'Progress [P]' },
    ];

    let bodyHtml = '';
    if (this.activeModal === 'inventory') bodyHtml = this.renderDiabloInventory();
    else if (this.activeModal === 'craft') bodyHtml = this.renderCraftTab();
    else if (this.activeModal === 'skills') bodyHtml = this.renderSkillsTab();
    else if (this.activeModal === 'quests') bodyHtml = this.renderQuestsTab();
    else if (this.activeModal === 'map') bodyHtml = this.renderMapTab();
    else if (this.activeModal === 'progress') bodyHtml = this.renderProgressTab();

    this.modalLayer.innerHTML = `
      <div class="modal-backdrop hud-interactive" data-action="close-backdrop">
        <div class="hud-panel ledger-window" onclick="event.stopPropagation()">
          <div style="display:flex; justify-content:space-between; align-items:flex-end; padding:10px 14px 0 14px; background:#09101b; border-bottom:2px solid #354c6b;">
            <div style="display:flex; gap:4px; flex-wrap:wrap; align-items:flex-end;">
              ${tabs
                .map((t) => {
                  const isActive = this.activeModal === t.id;
                  return `<button class="hud-btn" data-tab="${t.id}" style="border-radius:8px 8px 0 0; padding:7px 13px; border:1px solid ${isActive ? '#ffe066' : '#2a3d59'}; border-top:${isActive ? '3px solid #ffe066' : '1px solid #2a3d59'}; border-bottom:${isActive ? '2px solid #162236' : 'none'}; background:${isActive ? '#162236' : '#0d1624'}; color:${isActive ? '#ffe066' : '#8ba6c4'}; margin-bottom:${isActive ? '-2px' : '0'}; font-weight:${isActive ? '800' : '600'};">${t.label}</button>`;
                })
                .join('')}
            </div>
            <button class="hud-btn" data-action="close-modal" style="margin-bottom:8px;">Close [Esc]</button>
          </div>
          <div class="ledger-body" style="background:#162236;">${bodyHtml}</div>
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
    const equipSlotsHtml = ALL_EQUIP_SLOTS
      .map((slot) => {
        const eqId = gameState.equipment[slot];
        const eqInstId = gameState.equippedInstanceIds[slot];
        const def = eqId ? ITEMS[eqId] : undefined;
        const rarity = eqId ? gameState.getGearRarity(eqId, eqInstId) : 'common';
        const gearLv = eqId ? gameState.getGearLevel(eqId, eqInstId) : 0;
        const selected = this.selectedInspect?.kind === 'equip' && this.selectedInspect.slot === slot;
        return `
          <div class="equip-slot ${selected ? 'selected' : ''}" data-equip-slot="${slot}" draggable="${eqId ? 'true' : 'false'}">
            <div style="width:32px; height:32px; background:#0b121d; border:1px solid ${def ? RARITY_COLOR[rarity] : '#2e415c'}; border-radius:4px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${def?.iconKey ? `<img src="assets/${def.iconKey}.png" class="px-icon" style="width:24px; height:24px; pointer-events:none;" />` : `<span style="font-size:10px; color:#4f6885;">—</span>`}
            </div>
            <div style="min-width:0; flex:1;">
              <div style="font-size:9px; color:#8ba6c4; text-transform:uppercase;">${EQUIP_SLOT_LABELS[slot]}${gearLv > 0 ? ` • Lv.${gearLv}` : ''}</div>
              <div style="font-size:11px; font-weight:700; color:${def ? RARITY_COLOR[rarity] : '#637a94'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
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
            <div style="display:flex; justify-content:space-between;"><span>Power Level</span><strong style="color:#ffd242;">Lv.${gameState.getPowerLevel()}</strong></div>
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
          <div style="width:100%; display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <span style="font-size:12px; font-weight:700; color:#ffe596;">Inventory (${gameState.bagSlots.filter(Boolean).length}/${BAG_SIZE})</span>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:10px; color:#9db6cf;">Drag to move, equip, or drop onto Hotbar 1–9</span>
              <button class="hud-btn" data-action="sort-bag" style="padding:2px 8px; font-size:10px;">Sort Bag</button>
            </div>
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
    const bagSlot = bagIdx >= 0 ? gameState.bagSlots[bagIdx] : null;
    const instId =
      this.selectedInspect.kind === 'equip'
        ? gameState.equippedInstanceIds[this.selectedInspect.slot]
        : bagSlot?.instanceId;
    const inst = instId ? gameState.gearInstances[instId] : undefined;
    const rarity = gameState.getGearRarity(itemId, instId);
    const activeStats = def.stats ? gameState.getGearStats(itemId, instId) : undefined;
    const slotCount = bagIdx >= 0 ? bagSlot?.count ?? 0 : 1;
    const sellEach = Math.round(def.sellValue * (gameState.hasSkill('economy_barter') ? 1.5 : 1));

    const statsList = activeStats
      ? Object.entries(activeStats)
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
      const cmp = gameState.compareGearStats(itemId, instId);
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

    const canAssignHotbar = true;

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
        <div style="width:42px; height:42px; background:#152236; border:1.5px solid ${RARITY_COLOR[rarity]}; border-radius:5px; display:flex; align-items:center; justify-content:center;">
          ${def.iconKey ? `<img src="assets/${def.iconKey}.png" class="px-icon" style="width:32px; height:32px;" />` : ''}
        </div>
        <div>
          <div style="font-size:13px; font-weight:700; color:${RARITY_COLOR[rarity]};">${def.name}${inst?.reforgeCount ? ` +${inst.reforgeCount}` : ''}</div>
          <div style="font-size:10px; color:#9db6cf; text-transform:capitalize;">${rarity} ${def.category}${def.equipSlot ? ` • ${EQUIP_SLOT_LABELS[def.equipSlot === 'accessory' ? 'trinket1' : def.equipSlot]}` : ''}</div>
        </div>
      </div>

      <div style="font-size:11px; color:#c8daeb; margin-bottom:8px;">${def.description}</div>

      ${
        statsList || def.energyCost
          ? `<div style="display:flex; flex-direction:column; gap:2px; padding:6px; background:#131f30; border-radius:4px;">${statsList}${
              def.energyCost
                ? `<div style="display:flex; justify-content:space-between; font-size:11px;"><span>Energy Cost</span><strong style="color:#7ef59a;">${gameState.getRangedEnergyCost(itemId)} EN</strong></div>`
                : ''
            }</div>`
          : ''
      }
      ${compareHtml}
      ${hotbarAssignHtml}

      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
        ${
          isEquip
            ? `<button class="hud-btn" data-inspect-act="unequip">Unequip</button>`
            : `
              ${def.equipSlot ? `<button class="hud-btn primary" data-inspect-act="equip">Equip</button>` : ''}
              ${def.equipSlot && def.rarity !== 'relic' ? `<button class="hud-btn gold" data-inspect-act="reforge" title="Reroll & upgrade rarity (${35 + (inst?.reforgeCount ?? 0) * 20}g + 2 Iron Ingot)">Reforge (${35 + (inst?.reforgeCount ?? 0) * 20}g)</button>` : ''}
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
      this.activeStationTab !== 'bonfire' &&
      this.activeStationTab !== 'alchemy_lab' &&
      this.activeStationTab !== 'frost_kiln' &&
      this.activeStationTab !== 'infernal_forge' &&
      this.activeStationTab !== 'void_altar'
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

  private isQueuedStation(st: CraftingStation): st is QueuedStationType {
    return (
      st === 'furnace' ||
      st === 'anvil' ||
      st === 'bonfire' ||
      st === 'alchemy_lab' ||
      st === 'frost_kiln' ||
      st === 'infernal_forge' ||
      st === 'void_altar'
    );
  }

  private renderCraftTab(): string {
    const tabs: Array<{ id: CraftingStation; label: string }> = [
      { id: 'build', label: 'Build' },
      { id: 'hand', label: 'Hand' },
      { id: 'furnace', label: 'Furnace' },
      { id: 'anvil', label: 'Anvil' },
      { id: 'bonfire', label: 'Bonfire' },
      { id: 'alchemy_lab', label: 'Alchemy Lab' },
      { id: 'frost_kiln', label: 'Frost Kiln' },
      { id: 'infernal_forge', label: 'Infernal Forge' },
      { id: 'void_altar', label: 'Void Altar' },
    ];
    const isQueuedStation = this.isQueuedStation(this.activeStationTab);
    const nearby = this.callbacks.getNearbyStations?.();
    const inRange = !isQueuedStation || !nearby || nearby.has(this.activeStationTab);

    const stations = isQueuedStation
      ? (this.callbacks.getStations?.(this.activeStationTab as QueuedStationType) ?? [])
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
      } else if (!inRange) {
        queuePanelHtml = `
          <div class="hud-panel" style="padding:10px; margin-bottom:12px; background:#0d1522; border-color:#ff9b6a; font-size:12px;">
            Move closer to a <strong>${this.activeStationTab}</strong> (or press <strong>[E]</strong> beside it) to craft here.
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
          .map((t) => {
            const avail = !this.isQueuedStation(t.id) || !nearby || nearby.has(t.id);
            const isSel = this.activeStationTab === t.id;
            return `<button class="hud-btn ${isSel ? 'gold' : ''}" data-station="${t.id}" style="${avail ? '' : 'opacity:0.42; color:#708299; filter:grayscale(0.6);'}" title="${avail ? t.label : `${t.label} (Walk near structure to craft)`}">${t.label}${avail ? '' : ' 🔒'}</button>`;
          })
          .join('')}
      </div>
      ${queuePanelHtml}
      <div class="grid-2">
        ${list
          .map((r) => {
            const lockedByBlueprint = r.unlockMode === 'blueprint' && !gameState.unlockedBlueprints.has(r.id);
            const lockedBySkill = r.requiresSkill && !gameState.hasSkill(r.requiresSkill);
            const hasMats = gameState.canCraft(r);
            const canAction = isQueuedStation ? Boolean(selectedStation) && inRange && !queueFull && hasMats : hasMats;
            const isBuild = r.station === 'build';
            const ingsList = r.ingredients
              .map((ing) => {
                const req = gameState.getStructureCostCount(ing.itemId, ing.count, isBuild);
                const have = gameState.inventory[ing.itemId] ?? 0;
                const itemDef = ITEMS[ing.itemId];
                const ok = have >= req;
                const iconImg = itemDef?.iconKey
                  ? `<img src="assets/${itemDef.iconKey}.png" class="px-icon" style="width:12px; height:12px;" />`
                  : '';
                return `<span style="display:inline-flex; align-items:center; gap:3px; color:${ok ? '#8ef5a7' : '#ff8a93'};">${iconImg}${itemDef?.name ?? ing.itemId}: ${have}/${req} ${ok ? '✓' : ''}</span>`;
              });
            if (r.coinCost) {
              const haveCoins = gameState.coins;
              const ok = haveCoins >= r.coinCost;
              ingsList.push(`<span style="display:inline-flex; align-items:center; gap:3px; color:${ok ? '#ffd95a' : '#ff8a93'};"><img src="assets/ui_icons/coin.png" class="px-icon" style="width:12px; height:12px;" />${haveCoins.toLocaleString()}/${r.coinCost.toLocaleString()}g ${ok ? '✓' : ''}</span>`);
            }
            const ings = ingsList.join(' • ');
            const skillReqLabel = lockedBySkill
              ? `<div style="font-size:10px; color:#d09cff;">Requires Skill: ${SKILLS.find((s) => s.id === r.requiresSkill)?.name}</div>`
              : '';
            const bpReqLabel = lockedByBlueprint
              ? `<div style="font-size:10px; color:#ffd242;">🔒 Blueprint Locked — ${r.blueprintHint ?? 'Explore & defeat monsters to discover.'}</div>`
              : '';
            const timeSec = isQueuedStation ? (gameState.getCraftDurationMs(r) / 1000).toFixed(1) : null;
            const iconKey = r.iconKey ?? (r.outputItemId ? ITEMS[r.outputItemId]?.iconKey : undefined);
            const btnLabel = lockedByBlueprint
              ? 'Blueprint Locked'
              : isBuild
                ? 'Place Structure'
                : isQueuedStation
                  ? !inRange
                    ? 'Move Near Station'
                    : queueFull
                      ? 'Queue Full (5/5)'
                      : `Queue (${timeSec}s)`
                  : 'Craft';
            return `
              <div class="hud-panel" style="padding:10px; display:flex; flex-direction:column; justify-content:space-between; gap:6px; opacity:${lockedByBlueprint ? '0.68' : '1'}; border-color:${lockedByBlueprint ? '#4a3d28' : '#354c6b'};">
                <div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    ${iconKey ? `<img src="assets/${iconKey}.png" class="px-icon" style="width:24px; height:24px; ${lockedByBlueprint ? 'filter:grayscale(0.8);' : ''}" />` : ''}
                    <div style="font-weight:700; font-size:13px; flex:1; color:${lockedByBlueprint ? '#b8a888' : '#eef5ff'};">${r.name}</div>
                    ${timeSec ? `<span style="font-size:10px; color:#ffe596;">⏱ ${timeSec}s</span>` : ''}
                  </div>
                  <div style="font-size:11px; color:#b8cde0; margin:4px 0;">${r.description}</div>
                  ${lockedByBlueprint ? bpReqLabel : `<div style="font-size:11px;">${ings}</div>${skillReqLabel}`}
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
                            : `<button class="hud-btn ${can ? 'gold' : ''}" ${can ? '' : 'disabled'} data-skill="${s.id}" style="width:100%; padding:3px;">Unlock (${s.spCost ?? 1} SP${s.minLevel ? ` • Lv.${s.minLevel}+` : ''})</button>`
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
        const recLv = getIslandRecommendedLevel(spec);
        const storyLock = gameState.getIslandStoryLockReason(gx, gy);
        const canBuy = adj && !storyLock && gameState.coins >= cost;
        const lvColor = recLv - gameState.getPowerLevel() >= 3 ? '#ff7d87' : '#9db6cf';
        gridHtml += `
          <div class="hud-panel" style="padding:8px; background:${owned ? biomeColors[spec.biome] : 'rgba(15,24,38,0.85)'}; border-color:${owned ? '#a3f7b5' : storyLock ? '#5c3842' : adj ? '#ffe066' : '#2d4057'}; display:flex; flex-direction:column; justify-content:space-between; min-height:82px;" title="${storyLock ?? ''}">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; gap:4px;">
                <span style="font-size:11px; font-weight:700;">${spec.name}</span>
                <span style="font-size:9px; color:${owned ? '#e6ffea' : lvColor}; font-weight:700;">Lv.${recLv}</span>
              </div>
              <div style="font-size:10px; opacity:0.88; text-transform:capitalize;">${spec.biome}${spec.dungeonId ? ' • Dungeon' : ''}${spec.npc ? ' • NPC' : ''}</div>
            </div>
            ${
              owned
                ? `<span style="font-size:10px; font-weight:700; color:#e6ffea;">OWNED</span>`
                : storyLock
                  ? `<span style="font-size:9px; color:#ff9ba3;">🔒 Story Ch.${spec.biome === 'autumn' || spec.biome === 'graveyard' ? 2 : spec.biome === 'winter' ? 3 : 4} (${cost}g)</span>`
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

  private renderQuestsTab(): string {
    const activeIds = Object.keys(gameState.activeQuests);
    const activeHtml = activeIds.length
      ? activeIds
          .map((qId) => {
            const q = getQuestById(qId);
            if (!q) return '';
            const tracked = gameState.trackedQuestId === q.id;
            const ready = gameState.isQuestReadyToTurnIn(q.id);
            const objsHtml = q.objectives
              .map((o) => {
                const cur = gameState.getObjectiveProgress(q.id, o);
                const done = cur >= o.count;
                return `<div style="display:flex; justify-content:space-between; font-size:11px; color:${done ? '#8ef5a7' : '#d2e2f2'};"><span>${done ? '✓ ' : '• '}${o.label}</span><strong>${cur}/${o.count}</strong></div>`;
              })
              .join('');
            const rewardsText = [
              `${q.rewards.coins}g`,
              `${q.rewards.xp} XP`,
              ...(q.rewards.items ?? []).map((it) => `${it.count}x ${ITEMS[it.itemId]?.name ?? it.itemId}`),
            ].join(' • ');
            return `
              <div class="hud-panel" style="padding:10px; background:${tracked ? '#162840' : '#101a2a'}; border-color:${ready ? '#8ef5a7' : tracked ? '#ffd242' : '#354c6b'};">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px;">
                  <div>
                    <strong style="font-size:13px; color:#ffe596;">${q.title}</strong>
                    <span style="font-size:10px; color:#9db6cf; margin-left:6px;">(${q.npcName} • Step ${q.step})</span>
                  </div>
                  <button class="hud-btn ${tracked ? 'gold' : ''}" data-track-quest="${tracked ? '' : q.id}" style="padding:2px 8px; font-size:10px;">
                    ${tracked ? 'Tracking ✓' : 'Track'}
                  </button>
                </div>
                <div style="font-size:11px; color:#b8cbe0; margin-bottom:6px;">${q.description}</div>
                <div style="display:flex; flex-direction:column; gap:3px; margin-bottom:6px;">${objsHtml}</div>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:#9db6cf; border-top:1px solid #263954; padding-top:5px;">
                  <span>Rewards: <strong style="color:#ffd95a;">${rewardsText}</strong></span>
                  ${q.waypoint ? `<span>◆ ${ready ? `Return to ${q.npcName} (${q.waypoint.label})` : q.waypoint.label}</span>` : ''}
                </div>
              </div>
            `;
          })
          .join('')
      : `<div style="font-size:12px; color:#8ca8c4; padding:8px 0;">No active quests. Talk to Townsfolk NPCs (Farmer Bram, Old Barnaby, Smith Garrick, Alchemist Vesper) on nearby islands to begin!</div>`;

    const completedList = [...gameState.completedQuests]
      .map((id) => getQuestById(id))
      .filter((q): q is NonNullable<typeof q> => Boolean(q));

    const curChapter = gameState.getStoryChapter();
    const chMeta = STORY_CHAPTERS.find((c) => c.chapter === curChapter) ?? STORY_CHAPTERS[0];
    const storyBannerHtml = `
      <div class="hud-panel" style="padding:10px 12px; margin-bottom:12px; background:linear-gradient(135deg, #162742, #101b2e); border-color:#ffd242;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
          <strong style="font-size:13px; color:#ffd242;">${chMeta.title}</strong>
          <span style="font-size:10px; color:#8ef5a7; font-weight:700;">Your Power Lv.${gameState.getPowerLevel()} • ${chMeta.subtitle}</span>
        </div>
        <div style="font-size:11px; color:#d2e2f2; margin:4px 0;">${chMeta.summary}</div>
        <div style="font-size:10px; color:#ffe596;">Next Milestone: ${chMeta.unlockHint}</div>
      </div>
    `;

    return `
      ${storyBannerHtml}
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div style="font-size:13px; font-weight:700; color:#ffe596;">Active Quests (${activeIds.length})</div>
        <div style="font-size:11px; color:#8ef5a7;">Completed: ${gameState.completedQuests.size}/${QUESTS.length}</div>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;">${activeHtml}</div>
      ${
        completedList.length
          ? `<div style="font-size:12px; font-weight:700; color:#8ef5a7; margin-bottom:6px;">Completed Quests</div>
             <div class="grid-2">${completedList
               .map(
                 (q) =>
                   `<div class="hud-panel" style="padding:7px 9px; background:#0d1926; border-color:#2b4a3e; font-size:11px;">
                     <strong style="color:#8ef5a7;">✓ ${q.title}</strong>
                     <div style="font-size:10px; color:#8ca8c4;">${q.npcName} (Step ${q.step})</div>
                   </div>`,
               )
               .join('')}</div>`
          : ''
      }
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
      gameState.finalBossDefeated &&
      gameState.clearedDungeons.size >= 4 &&
      gameState.ownedIslands.size >= ISLANDS.length;

    const victoryBannerHtml = isGrandVictory
      ? `
        <div class="hud-panel" style="padding:10px 14px; margin-bottom:12px; background:linear-gradient(90deg, #2b4a2f, #4c3b14); border-color:#ffe066; text-align:center;">
          <strong style="color:#ffe596; font-size:14px;">GRAND VICTORY — ALL 25 ISLANDS, 4 DUNGEONS &amp; VOID SPIRE FINAL BOSS CONQUERED!</strong>
          <div style="font-size:11px; color:#e6ffea; margin-top:2px;">You have defeated the Ancient Black Dragon on Floor 20 of the Void Spire and mastered Forage Ahead!</div>
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
          <div><span style="color:#8ca8c4;">Dungeons / Quests:</span> <strong>${gameState.clearedDungeons.size}/4 • ${gameState.completedQuests.size}/${QUESTS.length}</strong></div>
          <div><span style="color:#8ca8c4;">Void Spire:</span> <strong style="color:#c77dff;">Floor ${gameState.voidSpireHighestFloor}</strong> • ${gameState.finalBossDefeated ? 'Final Boss Defeated' : 'Final Boss Alive'}</div>
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
      backdrop.onclick = () => this.closeModal();
    }
    const closeBtn = this.modalLayer.querySelector<HTMLElement>('[data-action="close-modal"]');
    if (closeBtn) {
      closeBtn.onclick = () => this.closeModal();
    }
    this.modalLayer.querySelectorAll<HTMLElement>('[data-tab]').forEach((el) => {
      el.onclick = () => {
        const tab = el.dataset.tab as HudModal;
        if (tab !== 'none') this.lastMenuTab = tab;
        SFX.playUiClick();
        this.activeModal = tab;
        this.render();
      };
    });

    const applyDropOnElement = (target: HTMLElement | null) => {
      if (!target || !this.dragPayload) return false;
      const bagTarget = target.closest<HTMLElement>('[data-bag-idx]');
      if (bagTarget) {
        const idx = Number(bagTarget.dataset.bagIdx);
        if (this.dragPayload.source === 'bag') {
          gameState.moveOrSwapBagSlot(this.dragPayload.bagIdx, idx);
          const landed = gameState.bagSlots[idx];
          this.selectedInspect = landed ? { kind: 'bag', bagIdx: idx, itemId: landed.itemId } : null;
        } else if (this.dragPayload.source === 'equip') {
          gameState.unequipToBag(this.dragPayload.slot, idx);
        }
        return true;
      }
      const equipTarget = target.closest<HTMLElement>('[data-equip-slot]');
      if (equipTarget && this.dragPayload.source === 'bag') {
        const eqSlot = equipTarget.dataset.equipSlot as EquipmentSlotKey;
        if (gameState.equipFromBag(this.dragPayload.bagIdx, eqSlot)) {
          SFX.playCraft();
          this.selectedInspect = { kind: 'equip', slot: eqSlot, itemId: this.dragPayload.itemId };
        } else {
          this.showToast(`That item cannot go in ${EQUIP_SLOT_LABELS[eqSlot]}!`);
        }
        return true;
      }
      const hbTarget = target.closest<HTMLElement>('[data-hotbar-idx]');
      if (hbTarget) {
        const hbIdx = Number(hbTarget.dataset.hotbarIdx);
        gameState.assignHotbarSlot(hbIdx, this.dragPayload.itemId);
        this.showToast(`Assigned ${ITEMS[this.dragPayload.itemId]?.name ?? this.dragPayload.itemId} to slot ${hbIdx + 1}`);
        return true;
      }
      return false;
    };

    const bindTouchLongPressDrag = (
      el: HTMLElement,
      getPayload: () => typeof this.dragPayload,
    ) => {
      let holdTimer: number | null = null;
      let startX = 0;
      let startY = 0;
      let dragging = false;
      let ghost: HTMLDivElement | null = null;
      let lastHovered: HTMLElement | null = null;

      const cleanup = () => {
        if (holdTimer !== null) {
          window.clearTimeout(holdTimer);
          holdTimer = null;
        }
        ghost?.remove();
        ghost = null;
        lastHovered?.classList.remove('drag-over');
        lastHovered = null;
        dragging = false;
      };

      el.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const payload = getPayload();
        if (!payload) return;
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        holdTimer = window.setTimeout(() => {
          holdTimer = null;
          dragging = true;
          this.dragPayload = payload;
          const def = ITEMS[payload.itemId];
          ghost = document.createElement('div');
          ghost.style.cssText = 'position:fixed; z-index:9999; pointer-events:none; width:40px; height:40px; border:2px solid #ffe066; border-radius:6px; background:rgba(16,26,40,0.92); display:flex; align-items:center; justify-content:center; transform:translate(-50%,-50%); box-shadow:0 4px 12px rgba(0,0,0,0.6);';
          if (def?.iconKey) {
            ghost.innerHTML = `<img src="assets/${def.iconKey}.png" class="px-icon" style="width:28px;height:28px;" />`;
          }
          ghost.style.left = `${startX}px`;
          ghost.style.top = `${startY}px`;
          document.body.appendChild(ghost);
          this.showToast(`Dragging ${def?.name ?? 'item'} — release on target slot`);
        }, 2000);
      }, { passive: true });

      el.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        if (!dragging) {
          if (holdTimer !== null && Math.hypot(t.clientX - startX, t.clientY - startY) > 12) {
            cleanup();
          }
          return;
        }
        e.preventDefault();
        if (ghost) {
          ghost.style.left = `${t.clientX}px`;
          ghost.style.top = `${t.clientY}px`;
        }
        const under = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
        const dropSlot = under?.closest<HTMLElement>('[data-bag-idx],[data-equip-slot],[data-hotbar-idx]') ?? null;
        if (lastHovered && lastHovered !== dropSlot) {
          lastHovered.classList.remove('drag-over');
        }
        lastHovered = dropSlot;
        lastHovered?.classList.add('drag-over');
      }, { passive: false });

      const onEnd = (e: TouchEvent) => {
        if (!dragging) {
          cleanup();
          return;
        }
        e.preventDefault();
        const t = e.changedTouches[0];
        const under = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
        applyDropOnElement(under);
        this.dragPayload = null;
        cleanup();
        this.render();
      };
      el.addEventListener('touchend', onEnd);
      el.addEventListener('touchcancel', () => {
        this.dragPayload = null;
        cleanup();
      });
    };

    // Inventory Bag Slot Clicks & Drag/Drop (Mouse + 2s Mobile Long-Press)
    this.modalLayer.querySelectorAll<HTMLElement>('[data-bag-idx]').forEach((el) => {
      const idx = Number(el.dataset.bagIdx);
      bindTouchLongPressDrag(el, () => {
        const slot = gameState.bagSlots[idx];
        return slot ? { source: 'bag', bagIdx: idx, itemId: slot.itemId } : null;
      });
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

    // Equipment Slot Clicks & Drag/Drop (Mouse + 2s Mobile Long-Press)
    this.modalLayer.querySelectorAll<HTMLElement>('[data-equip-slot]').forEach((el) => {
      const eqSlot = el.dataset.equipSlot as EquipmentSlotKey;
      bindTouchLongPressDrag(el, () => {
        const id = gameState.equipment[eqSlot];
        return id ? { source: 'equip', slot: eqSlot, itemId: id } : null;
      });
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

    const sortBagBtn = this.modalLayer.querySelector<HTMLElement>('[data-action="sort-bag"]');
    if (sortBagBtn) {
      sortBagBtn.onclick = () => {
        SFX.playUiClick();
        gameState.sortBag();
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
              if (eqSlot) {
                const resolved: EquipmentSlotKey =
                  eqSlot === 'accessory'
                    ? (['trinket1', 'trinket2', 'trinket3'] as EquipmentSlotKey[]).find(
                        (s) => gameState.equipment[s] === slot.itemId,
                      ) ?? 'trinket1'
                    : eqSlot;
                this.selectedInspect = { kind: 'equip', slot: resolved, itemId: slot.itemId };
              }
            }
          } else if (act === 'reforge') {
            const res = gameState.reforgeBagSlot(idx);
            if (res.ok && res.instance) {
              SFX.playLevelUp();
              this.showToast(`Reforged ${ITEMS[slot.itemId]?.name} (${res.instance.rarity.toUpperCase()} +${res.instance.reforgeCount})!`);
            } else {
              this.showToast(res.reason ?? 'Cannot reforge.');
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

    this.modalLayer.querySelectorAll<HTMLElement>('[data-track-quest]').forEach((el) => {
      el.onclick = () => {
        const qId = el.dataset.trackQuest || null;
        gameState.setTrackedQuest(qId);
        this.renderModal();
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
          this.closeModal();
          this.callbacks.onSelectBuild(id);
        } else if (this.isQueuedStation(rec.station)) {
          const nearby = this.callbacks.getNearbyStations?.();
          if (nearby && !nearby.has(rec.station)) {
            SFX.playUiError();
            this.showToast(`Move closer to a ${rec.station} to craft!`);
            return;
          }
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
          SFX.playSkillUnlock();
          const sk = SKILLS.find((s) => s.id === id);
          this.showToast(`Unlocked ${sk?.name ?? id}!`);
        } else {
          SFX.playUiError();
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
