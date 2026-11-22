import {
  ALL_EQUIP_SLOTS,
  BAG_COLS,
  BAG_SIZE,
  gameState,
  type CraftQueueJob,
  type EquipmentSlotKey,
  type InventoryFeedEvent,
} from '../core/GameState';
import { Haptics } from '../core/Haptics';
import { formatCompactNumber } from '../core/FormatNumber';
import { fmtKeySuffix, isMobileTouchDevice } from '../core/Platform';

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
import { transitionManager } from '../core/TransitionManager';
import { dialogueBox } from './DialogueBox';
import { revealSequence } from './RevealSequence';
import { SPROUT_UI_CSS } from './SproutUiTheme';
import { ITEMS, RARITY_COLOR } from '../data/items';
import {
  ISLANDS,
  ISLAND_CELL_TILES,
  STORY_CHAPTERS,
  TILE_PX,
  WORLD_GRID_SIZE,
  getIslandAt,
  getIslandRecommendedLevel,
} from '../data/islands';
import { MONSTERS } from '../data/monsters';
import { IMPLEMENTED_FEATURES, OUTSTANDING_ITEMS } from '../data/projectProgress';
import { QUESTS, getQuestById } from '../data/quests';
import { RECIPES, type CraftingStation } from '../data/recipes';
import { PILLAR_META, SKILLS, type SkillPillar } from '../data/skills';
import { getFamiliarSpecForClass } from '../data/familiars';

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

export interface DungeonHudState {
  title: string;
  roomLabel: string;
  smallKeys: number;
  hasBossKey: boolean;
  currentRoomId: number;
  discoveredRoomIds: number[];
  rooms: Array<{ id: number; gx: number; gy: number; role: string }>;
  bounds: { minGx: number; maxGx: number; minGy: number; maxGy: number };
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
  private promoChromeHidden = false;

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
  private minimapVisible = false;
  private minimapCanvas?: HTMLCanvasElement;
  private minimapZoom = 1;
  private lastMinimapSnapshot: MinimapSnapshot | null = null;
  private wasModalOpen = false;
  private lastModalTab: HudModal = 'none';
  private toastTimer?: number;
  private toastMsg = '';
  private timeLabelText = 'Day 1 • Sunny';
  private bossInfo: { name: string; hp: number; maxHp: number; portrait?: string } | null = null;
  private portraitMoodOverride: 'happy' | 'angry' | null = null;
  private portraitMoodTimer?: number;
  private isSleepingMood = false;
  private sleepTimer?: number;
  private lastHpSeen = gameState.hp;
  private lastLevelSeen = gameState.level;
  private lastHotbarPopIdx = -1;
  private envVignetteMode: 'none' | 'frost' | 'infernal' = 'none';
  private touchMoveVec = { x: 0, y: 0 };
  private touchActionHint: string | null = null;
  private touchEnabled = isMobileTouchDevice();

  private callbacks: {
    onBuyIsland: (gx: number, gy: number) => void;
    onSelectBuild: (recipeId: string) => void;
    onUseHotbarItem: (itemId: string) => void;
    onSave: () => void;
    onExitToTitle?: () => void;
    onTouchAction?: () => void;
    onTouchActionHold?: (holding: boolean) => void;
    onTouchInteract?: () => void;
    onTouchDash?: () => void;
    onTouchPlaceBuilding?: () => void;
    onTouchConfirmBuilding?: () => void;
    getStations?: (stationType: QueuedStationType) => StationQueueView[];
    getNearbyStations?: () => Set<CraftingStation>;
    onEnqueueCraft?: (stationId: string, recipeId: string) => boolean;
    onCancelCraft?: (stationId: string, queueIdx: number) => boolean;
    onStokeStation?: (stationId: string) => boolean;
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
    onTouchActionHold?: (holding: boolean) => void;
    onTouchInteract?: () => void;
    onTouchDash?: () => void;
    onTouchPlaceBuilding?: () => void;
    onTouchConfirmBuilding?: () => void;
    getStations?: (stationType: QueuedStationType) => StationQueueView[];
    getNearbyStations?: () => Set<CraftingStation>;
    onEnqueueCraft?: (stationId: string, recipeId: string) => boolean;
    onCancelCraft?: (stationId: string, queueIdx: number) => boolean;
    onStokeStation?: (stationId: string) => boolean;
    getWorldDebugStats?: () => WorldDebugStats;
    onDebugAction?: (action: string, payload?: string) => void;
  }) {
    this.callbacks = callbacks;
    const el = document.getElementById('hud-root');
    if (!el) throw new Error('#hud-root missing');
    this.root = el;
    this.injectStyles();
    this.setupLayers();
    this.applyResponsiveHudScale();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.handleResize);
      window.addEventListener('orientationchange', this.handleResize);
    }

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
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this.onActivityHandler, { passive: true });
      window.addEventListener('keydown', this.onActivityHandler, { passive: true });
      this.onActivityHandler();
    }
  }

  private hudScale = 1;

  private handleResize = (): void => {
    this.applyResponsiveHudScale();
  };

  private applyResponsiveHudScale(): void {
    if (typeof window === 'undefined' || !this.root) return;
    const parentRect = this.root.parentElement?.getBoundingClientRect();
    const vw = Math.max(320, parentRect?.width || window.innerWidth);
    const vh = Math.max(200, parentRect?.height || window.innerHeight);
    const scale = vw < 1150 || vh < 540 ? Math.min(1, vw / 1150, vh / 540) : 1;
    this.hudScale = scale;
    if (scale < 0.999) {
      this.root.style.inset = 'auto';
      this.root.style.top = '0';
      this.root.style.left = '0';
      this.root.style.right = 'auto';
      this.root.style.bottom = 'auto';
      this.root.style.width = `${Math.ceil(vw / scale) + 1}px`;
      this.root.style.height = `${Math.ceil(vh / scale) + 1}px`;
      this.root.style.transformOrigin = '0 0';
      this.root.style.transform = `scale(${scale})`;
    } else {
      this.root.style.inset = '0';
      this.root.style.top = '';
      this.root.style.left = '';
      this.root.style.right = '';
      this.root.style.bottom = '';
      this.root.style.width = '';
      this.root.style.height = '';
      this.root.style.transformOrigin = '';
      this.root.style.transform = '';
    }
  }

  public isBlockingInput(): boolean {
    return transitionManager.isActive || this.activeModal !== 'none' || dialogueBox.isActive() || revealSequence.isActive();
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
        const s = this.hudScale || 1;
        const rect = joy.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const maxR = Math.max(36, Math.round((rect.width / s) * 0.38));
        const dx = (clientX - cx) / s;
        const dy = (clientY - cy) / s;
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

    const actBtn = this.chromeLayer.querySelector<HTMLElement>('#hud-touch-act');
    if (actBtn && this.callbacks.onTouchActionHold) {
      const setHold = (h: boolean, e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.callbacks.onTouchActionHold?.(h);
      };
      actBtn.addEventListener('touchstart', (e) => setHold(true, e));
      actBtn.addEventListener('touchend', (e) => setHold(false, e));
      actBtn.addEventListener('touchcancel', (e) => setHold(false, e));
      actBtn.addEventListener('mousedown', (e) => setHold(true, e));
      actBtn.addEventListener('mouseup', (e) => setHold(false, e));
      actBtn.addEventListener('mouseleave', () => this.callbacks.onTouchActionHold?.(false));
    }
  }

  public setFishingMode(active: boolean): void {
    const actBtn = this.chromeLayer?.querySelector<HTMLElement>('#hud-touch-act');
    if (!actBtn) return;
    const lbl = actBtn.querySelector<HTMLElement>('span');
    if (lbl) lbl.textContent = active ? 'REEL' : 'ACT';
    actBtn.style.filter = active ? 'drop-shadow(0 0 8px #7ce8ff)' : 'none';
  }

  private onActivityHandler = () => {
    const wasSleeping = this.isSleepingMood;
    this.isSleepingMood = false;
    if (this.sleepTimer !== undefined) window.clearTimeout(this.sleepTimer);
    this.sleepTimer = window.setTimeout(() => {
      this.isSleepingMood = true;
      this.syncPortrait();
    }, 20000);
    if (wasSleeping) this.syncPortrait();
  };

  public triggerPortraitMood(mood: 'happy' | 'angry', durationMs = 1500): void {
    this.portraitMoodOverride = mood;
    if (this.portraitMoodTimer !== undefined) window.clearTimeout(this.portraitMoodTimer);
    this.syncPortrait();
    this.portraitMoodTimer = window.setTimeout(() => {
      this.portraitMoodOverride = null;
      this.syncPortrait();
    }, durationMs);
  }

  private syncPortrait(): void {
    const img = this.chromeLayer?.querySelector<HTMLImageElement>('#hud-hero-portrait');
    if (!img) return;
    const hpPct = (gameState.hp / Math.max(1, gameState.getMaxHp())) * 100;
    let mood: string | null = this.portraitMoodOverride;
    if (!mood) {
      if (hpPct > 0 && hpPct < 25) mood = 'nervous';
      else if (this.isSleepingMood) mood = 'sleeping';
    }
    const suffix = mood ? ` (${mood})` : '';
    const nextSrc = `assets/portraits/${gameState.heroClass}/${gameState.heroClass}_frame${suffix}.png`;
    if (!img.src.endsWith(nextSrc)) {
      img.src = nextSrc;
    }
  }

  public pulseDamageVignette(): void {
    const el = this.chromeLayer?.querySelector<HTMLElement>('#hud-damage-vignette');
    if (!el) return;
    el.style.opacity = '1';
    window.setTimeout(() => {
      if (el.isConnected) el.style.opacity = '0';
    }, 220);
  }

  public setEnvironmentVignette(mode: 'none' | 'frost' | 'infernal'): void {
    if (this.envVignetteMode === mode) return;
    this.envVignetteMode = mode;
    const el = this.chromeLayer?.querySelector<HTMLElement>('#hud-env-vignette');
    if (!el) return;
    el.className = mode === 'none' ? '' : mode;
  }

  public destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleResize);
      window.removeEventListener('orientationchange', this.handleResize);
    }
    if (this.toastTimer) {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = undefined;
    }
    dialogueBox.close(false);
    revealSequence.forceClose();
    this.unsubChange?.();
    this.unsubVitals?.();
    this.unsubFeed?.();
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.onActivityHandler);
      window.removeEventListener('keydown', this.onActivityHandler);
      if (this.sleepTimer !== undefined) window.clearTimeout(this.sleepTimer);
      if (this.portraitMoodTimer !== undefined) window.clearTimeout(this.portraitMoodTimer);
    }
    this.chromeBuilt = false;
    this.root.innerHTML = '';
  }

  public toggleModal(modal: HudModal, station?: CraftingStation, stationId?: string): void {
    if (modal !== 'none' && !gameState.isMenuTabUnlocked(modal)) return;
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

  public setPromoChromeHidden(hidden: boolean): void {
    this.promoChromeHidden = hidden;
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

  public showCraftPopPopup(
    anchorRect: DOMRect | { left: number; top: number; width: number; height: number },
    itemName: string,
    iconKey?: string,
    count = 1,
    suffix?: string,
  ): void {
    const cx = anchorRect.width > 0 ? anchorRect.left + anchorRect.width / 2 : window.innerWidth / 2;
    const cy = anchorRect.height > 0 ? anchorRect.top - 4 : window.innerHeight * 0.42;

    const popup = document.createElement('div');
    popup.className = 'craft-pop-fx';
    popup.style.left = `${Math.round(cx)}px`;
    popup.style.top = `${Math.round(cy)}px`;

    if (iconKey) {
      const img = document.createElement('img');
      img.src = `assets/${iconKey}.png`;
      img.className = 'px-icon';
      img.style.width = '22px';
      img.style.height = '22px';
      popup.appendChild(img);
    }

    const plus = document.createElement('span');
    plus.className = 'craft-pop-plus';
    plus.textContent = `+${count}`;
    popup.appendChild(plus);

    const label = document.createElement('span');
    label.textContent = suffix ? `${itemName} (${suffix})` : itemName;
    popup.appendChild(label);

    this.root.appendChild(popup);
    window.setTimeout(() => popup.remove(), 1200);

    const sparkOffsets = [
      { sx: -28, sy: -26 },
      { sx: 28, sy: -24 },
      { sx: -36, sy: -4 },
      { sx: 36, sy: -6 },
      { sx: 0, sy: -34 },
    ];
    for (const sp of sparkOffsets) {
      const spark = document.createElement('span');
      spark.className = 'craft-pop-spark';
      spark.textContent = '✦';
      spark.style.left = `${Math.round(cx)}px`;
      spark.style.top = `${Math.round(cy - 6)}px`;
      spark.style.setProperty('--sx', `${sp.sx}px`);
      spark.style.setProperty('--sy', `${sp.sy}px`);
      this.root.appendChild(spark);
      window.setTimeout(() => spark.remove(), 650);
    }
  }

  public setBossBar(boss: { name: string; hp: number; maxHp: number; portrait?: string } | null): void {
    this.bossInfo = boss;
    this.renderBanners();
  }

  public setTimeLabel(label: string): void {
    this.timeLabelText = label;
    const el = this.chromeLayer.querySelector<HTMLElement>('#hud-time-badge');
    if (el) el.textContent = label;
    const weatherIcon = this.chromeLayer.querySelector<HTMLImageElement>('#hud-weather-icon');
    if (weatherIcon) {
      const lower = label.toLowerCase();
      const isNight = lower.includes('night');
      const isDusk = lower.includes('dusk') || lower.includes('dawn');
      let iconName = isNight ? 'night_clear' : isDusk ? 'dusk_clear' : 'day_sunny';
      if (lower.includes('snow') || lower.includes('blizzard')) {
        iconName = lower.includes('blizzard') ? 'day_blizzard' : 'day_snow';
      } else if (lower.includes('rain') || lower.includes('storm')) {
        iconName = isNight ? 'night_rain' : isDusk ? 'dusk_rain' : 'day_rain';
      } else if (lower.includes('cloud')) {
        iconName = isNight ? 'night_cloudy' : isDusk ? 'dusk_cloudy' : 'day_partly_cloudy';
      } else if (lower.includes('sand')) {
        iconName = 'dusk_hot_sun';
      }
      weatherIcon.src = `assets/sprout_ui/weather/icon_sm_${iconName}.png`;
    }
  }

  public toggleMinimap(): void {
    this.minimapVisible = !this.minimapVisible;
    const wrap = this.chromeLayer.querySelector<HTMLElement>('#hud-minimap-wrap');
    const body = this.chromeLayer.querySelector<HTMLElement>('#hud-minimap-body');
    const btn = this.chromeLayer.querySelector<HTMLElement>('#hud-minimap-toggle');
    const zoomControls = this.chromeLayer.querySelector<HTMLElement>('#hud-minimap-zoom-controls');
    if (wrap) wrap.classList.toggle('minimap-collapsed', !this.minimapVisible);
    if (body) body.style.display = this.minimapVisible ? 'block' : 'none';
    if (zoomControls) zoomControls.style.display = this.minimapVisible ? 'inline-flex' : 'none';
    if (btn) btn.textContent = this.minimapVisible ? 'Hide' : this.isTouchDevice() ? 'MAP' : 'Show';
    if (this.minimapVisible && this.lastMinimapSnapshot) {
      this.updateMinimap(this.lastMinimapSnapshot);
    }
  }

  public adjustMinimapZoom(delta: number): void {
    const next = Math.max(0.5, Math.min(3.0, Math.round((this.minimapZoom + delta) * 100) / 100));
    if (next === this.minimapZoom) return;
    this.minimapZoom = next;
    const label = this.chromeLayer.querySelector<HTMLElement>('#hud-minimap-zoom-label');
    if (label) label.textContent = `${this.minimapZoom.toFixed(2).replace(/\.?0+$/, '')}x`;
    if (this.lastMinimapSnapshot) {
      this.updateMinimap(this.lastMinimapSnapshot);
    }
  }

  private getDynamicMinimapSize(): number {
    const s = this.hudScale || 1;
    const vw = (typeof window !== 'undefined' ? window.innerWidth : 1280) / s;
    const vh = (typeof window !== 'undefined' ? window.innerHeight : 720) / s;
    const vitals = this.chromeLayer?.querySelector<HTMLElement>('#hud-vitals-panel');
    const nav = this.chromeLayer?.querySelector<HTMLElement>('#hud-top-nav');
    let maxGapW = vw * 0.34;
    if (vitals && nav) {
      const vRect = vitals.getBoundingClientRect();
      const nRect = nav.getBoundingClientRect();
      const gapPx = (nRect.left - vRect.right) / s - 28;
      if (gapPx > 60) maxGapW = gapPx;
    }
    const idealH = vh * 0.30;
    return Math.round(Math.max(116, Math.min(260, maxGapW, idealH)));
  }

  public updateMinimap(data: MinimapSnapshot): void {
    this.lastMinimapSnapshot = data;
    if (!this.minimapVisible || !this.minimapCanvas) return;
    const targetSize = this.getDynamicMinimapSize();
    if (this.minimapCanvas.width !== targetSize || this.minimapCanvas.height !== targetSize) {
      this.minimapCanvas.width = targetSize;
      this.minimapCanvas.height = targetSize;
      this.minimapCanvas.style.width = `${targetSize}px`;
      this.minimapCanvas.style.height = `${targetSize}px`;
    }
    const ctx = this.minimapCanvas.getContext('2d');
    if (!ctx) return;
    const W = this.minimapCanvas.width;
    const H = this.minimapCanvas.height;

    // Coverage centered on player, scaled by minimapZoom (0.5x = full world, 3x = close-up)
    const viewTiles = Math.max(10, Math.min(data.worldTiles, (data.worldTiles / 2) / this.minimapZoom));
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
    this.root.addEventListener('touchstart', stopCanvasLeak, { passive: true });
    this.root.addEventListener('contextmenu', (e) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('.hud-interactive')) e.preventDefault();
    });
  }

  /**
   * Binds an independent multi-touch tap (scoped by touch identifier so it works
   * concurrently while another finger holds the virtual joystick) plus deduplicated click.
   */
  private bindMultiTouchTap(el: HTMLElement | null | undefined, onTap: () => void): void {
    if (!el) return;
    let activeTouchId: number | null = null;
    let lastTouchTapMs = 0;

    el.addEventListener(
      'touchstart',
      (e) => {
        if (activeTouchId !== null || e.changedTouches.length === 0) return;
        activeTouchId = e.changedTouches[0].identifier;
        e.stopPropagation();
      },
      { passive: true },
    );

    el.addEventListener('touchend', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === activeTouchId) {
          activeTouchId = null;
          const r = el.getBoundingClientRect();
          if (t.clientX >= r.left - 8 && t.clientX <= r.right + 8 && t.clientY >= r.top - 8 && t.clientY <= r.bottom + 8) {
            e.preventDefault();
            e.stopPropagation();
            lastTouchTapMs = performance.now();
            onTap();
          }
          break;
        }
      }
    });

    el.addEventListener('touchcancel', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          activeTouchId = null;
          break;
        }
      }
    });

    el.onclick = () => {
      if (performance.now() - lastTouchTapMs < 400) return;
      onTap();
    };
  }

  public attachAlertBadge(btn: HTMLElement | null | undefined, active: boolean): void {
    if (!btn) return;
    let badge = btn.querySelector<HTMLElement>('.hud-alert-badge');
    if (active) {
      if (getComputedStyle(btn).position === 'static') {
        btn.style.position = 'relative';
      }
      btn.style.overflow = 'visible';
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'hud-alert-badge';
        badge.textContent = '!';
        btn.appendChild(badge);
      }
    } else if (badge) {
      badge.remove();
    }
  }

  public triggerButtonAlert(alertKey: string, buttonId = 'menu'): void {
    gameState.triggerAlert(alertKey, buttonId);
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
    const diffColor = isAdd ? '#216b2b' : '#9e2a35';
    const iconHtml = ev.iconKey
      ? `<img src="assets/${ev.iconKey}.png" class="px-icon" style="width:16px; height:16px;" />`
      : '';

    row.innerHTML = `
      ${iconHtml}
      <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#3b2316;">${ev.name}</span>
      <span style="color:${diffColor}; font-weight:800;">${sign}</span>
      <span style="color:#7a5438; font-size:10px;">(${ev.total})</span>
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
      ${SPROUT_UI_CSS}
      .hotbar-dock {
        position: absolute;
        bottom: 6px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 5px;
        z-index: 35;
        padding: 3px 6px;
        border-style: solid;
        border-image-source: url('assets/sprout_ui/docks/tray_dark_enclosed.png');
        border-image-slice: 5 5 7 5 fill;
        border-image-width: 10px 10px 14px 10px;
        border-width: 6px 8px 10px 8px;
        image-rendering: pixelated;
        box-shadow: 0 6px 18px rgba(16, 10, 4, 0.55);
      }
      .hotbar-slot {
        width: 48px;
        height: 48px;
        background: url('assets/sprout_ui/slots/slot_oct_med.png') no-repeat center / 100% 100%;
        image-rendering: pixelated;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        position: relative;
        cursor: url('/assets/sprout_ui/cursors/cursor_catpaw_pointing_2x.png') 8 4, pointer;
        font-size: 10px;
        transition: transform 80ms ease, filter 80ms ease;
      }
      .hotbar-slot:hover { filter: brightness(1.06); transform: translateY(-2px); }
      .hotbar-slot.active {
        background-image: url('assets/sprout_ui/slots/slot_oct_light.png');
        transform: translateY(-3px);
      }
      .hotbar-slot.active.pop { animation: hotbarPop 160ms ease-out; }
      .hotbar-slot.drag-over { filter: brightness(1.18) drop-shadow(0 0 6px #7ae398); }
      .hotbar-slot.rarity-uncommon:not(.active) { filter: drop-shadow(0 0 3px #469c60); }
      .hotbar-slot.rarity-rare:not(.active) { filter: drop-shadow(0 0 3px #3d7ec7); }
      .hotbar-slot.rarity-epic:not(.active) { filter: drop-shadow(0 0 4px #9353c9); }
      .hotbar-slot.rarity-relic:not(.active) { filter: drop-shadow(0 0 5px #cfa430); }
      .hotbar-slot.rarity-rare,
      .hotbar-slot.rarity-epic,
      .hotbar-slot.rarity-relic,
      .inv-slot.rarity-rare,
      .inv-slot.rarity-epic,
      .inv-slot.rarity-relic {
        overflow: hidden;
      }
      .hotbar-slot.rarity-rare::after,
      .hotbar-slot.rarity-epic::after,
      .hotbar-slot.rarity-relic::after,
      .inv-slot.rarity-rare::after,
      .inv-slot.rarity-epic::after,
      .inv-slot.rarity-relic::after {
        content: '';
        position: absolute;
        inset: -30% -60%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
        pointer-events: none;
        animation: raritySheen 3.6s ease-in-out infinite;
      }
      .cd-wipe {
        position: absolute;
        inset: 3px;
        border-radius: 4px;
        pointer-events: none;
        z-index: 2;
      }
      #hud-damage-vignette {
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: 0;
        background: radial-gradient(circle at center, transparent 52%, rgba(210, 28, 42, 0.58) 100%);
        transition: opacity 160ms ease-out;
        z-index: 19;
      }
      #hud-env-vignette {
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: 0;
        transition: opacity 420ms ease;
        z-index: 18;
      }
      #hud-env-vignette.frost {
        opacity: 1;
        background: radial-gradient(circle at center, transparent 58%, rgba(120, 205, 255, 0.32) 100%);
      }
      #hud-env-vignette.infernal {
        opacity: 1;
        background: radial-gradient(circle at center, transparent 58%, rgba(255, 95, 36, 0.28) 100%);
      }
      .slot-corner {
        position: absolute;
        width: 10px;
        height: 10px;
        image-rendering: pixelated;
        pointer-events: none;
        z-index: 3;
      }
      .slot-corner.tl { top: -3px; left: -3px; }
      .slot-corner.tr { top: -3px; right: -3px; }
      .slot-corner.bl { bottom: -3px; left: -3px; }
      .slot-corner.br { bottom: -3px; right: -3px; }
      .hotbar-eq {
        position: absolute;
        top: 2px;
        right: 3px;
        font-size: 7px;
        font-weight: 800;
        color: #fff6e5;
        background: url('assets/sprout_ui/buttons/round_sm_green_normal.png') no-repeat center / 100% 100%;
        padding: 1px 3px;
        line-height: 1.1;
        pointer-events: none;
        z-index: 2;
      }
      .hotbar-slot-num,
      .hotbar-slot-count {
        position: absolute;
        font-family: 'SproutLandsUI', monospace;
        font-size: 10px;
        font-weight: 800;
        color: #fff8e7;
        text-shadow: 1px 0 0 #23140d, -1px 0 0 #23140d, 0 1px 0 #23140d, 0 -1px 0 #23140d;
        pointer-events: none;
        line-height: 1;
        z-index: 2;
        -webkit-font-smoothing: none;
        font-smooth: never;
      }
      .hotbar-slot-num { top: 3px; left: 4px; }
      .hotbar-slot-count { bottom: 3px; right: 4px; }
      #hud-item-tooltip {
        position: fixed;
        z-index: 60;
        pointer-events: none;
        padding: 8px 10px;
        max-width: 245px;
        font-size: 11px;
        line-height: 1.35;
        border-style: solid;
        border-image-source: url('assets/sprout_ui/dialogue/dialog_box_frame.png');
        border-image-slice: 4 4 6 4 fill;
        border-image-width: 8px 8px 12px 8px;
        border-width: 6px 8px 10px 8px;
        color: #fff6e5;
        text-shadow: -1px -1px 0 #1b1109, 1px -1px 0 #1b1109, -1px 1px 0 #1b1109, 1px 1px 0 #1b1109, 0 1px 2px rgba(0, 0, 0, 0.7);
        image-rendering: pixelated;
        box-shadow: 0 6px 18px rgba(16, 10, 4, 0.55);
      }
      @keyframes readyPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.55; }
      }
      @keyframes hudAlertPulse {
        0%, 100% {
          transform: scale(1);
          box-shadow: 0 0 6px 1px rgba(255, 210, 66, 0.85), 0 1px 3px rgba(0, 0, 0, 0.7);
        }
        50% {
          transform: scale(1.2);
          box-shadow: 0 0 14px 4px rgba(255, 196, 36, 1), 0 1px 4px rgba(0, 0, 0, 0.8);
        }
      }
      .hud-alert-badge {
        position: absolute;
        top: -8px;
        right: -8px;
        min-width: 17px;
        height: 17px;
        padding: 0 4px;
        border-radius: 999px;
        background: radial-gradient(circle at 35% 30%, #fff3a1 0%, #ffbe2e 55%, #e87a14 100%);
        border: 2px solid #3b2316;
        color: #3b2316;
        font-family: 'SproutLandsUI', monospace;
        font-size: 11px;
        font-weight: 900;
        line-height: 13px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        z-index: 12;
        animation: hudAlertPulse 1.1s ease-in-out infinite;
      }
      .quest-ready-pill {
        font-size: 9px;
        color: #216b2b;
        font-weight: 800;
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
          padding: 4px 6px !important;
          gap: 6px !important;
        }
        #hud-vitals-panel .bar-track { width: 102px; height: 13px; }
        #hud-top-nav {
          top: max(6px, env(safe-area-inset-top)) !important;
          right: max(6px, env(safe-area-inset-right)) !important;
          gap: 4px !important;
        }
        #hud-top-nav .hud-btn { padding: 2px 6px; font-size: 11px; }
        .nav-key { display: none; }
        .hotbar-dock { bottom: max(6px, env(safe-area-inset-bottom)); gap: 4px; padding: 4px 5px; }
        .hotbar-slot { width: 48px; height: 48px; }
        #hud-minimap-wrap {
          top: max(6px, env(safe-area-inset-top)) !important;
          bottom: auto !important;
          left: 50% !important;
          right: auto !important;
          transform: translateX(-50%);
        }
      }
      .modal-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(18, 11, 6, 0.72);
        display: flex;
        align-items: stretch;
        justify-content: stretch;
        padding: max(6px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(62px, calc(env(safe-area-inset-bottom) + 58px)) max(8px, env(safe-area-inset-left));
        z-index: 25;
      }
      .ledger-window {
        position: relative;
        width: 100%;
        height: 100%;
        max-height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .ledger-window.modal-enter {
        animation: modalSpringPop 130ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .ledger-tabs {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        padding: 4px 42px 0 8px;
        gap: 8px;
        flex-wrap: nowrap;
        flex-shrink: 0;
        min-width: 0;
      }
      .ledger-tab-strip {
        display: flex;
        flex-wrap: nowrap;
        align-items: flex-end;
        gap: 4px;
        min-width: 0;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .ledger-tab-strip::-webkit-scrollbar {
        display: none;
      }
      .ledger-tab-btn {
        border-style: solid;
        border-image-source: url('assets/sprout_ui/docks/dock_bar_dark_sm.png');
        border-image-slice: 4 4 0 4 fill;
        border-image-width: 8px 8px 0 8px;
        border-width: 5px 8px 3px 8px;
        background: transparent;
        color: #f2d9b1;
        font-family: 'SproutLandsUI', monospace, sans-serif;
        text-shadow: -1px -1px 0 #1b1109, 1px -1px 0 #1b1109, -1px 1px 0 #1b1109, 1px 1px 0 #1b1109;
        padding: 2px 10px 4px 10px;
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
        flex-shrink: 0;
        cursor: url('/assets/sprout_ui/cursors/cursor_catpaw_pointing_2x.png') 8 4, pointer;
        image-rendering: pixelated;
        -webkit-font-smoothing: none;
        font-smooth: never;
      }
      .ledger-tab-btn.active {
        border-image-source: url('assets/sprout_ui/docks/dock_bar_light_sm.png');
        color: #82eb6a;
        font-weight: 800;
        transform: translateY(2px);
      }
      .ledger-tab-btn.active.tab-jiggle {
        animation: tabSoftJiggle 140ms ease-out;
      }
      .craft-queue-slot {
        height: 54px;
        border-style: solid;
        border-image-slice: 5 fill;
        border-image-width: 10px;
        border-width: 5px;
        background: transparent;
        text-shadow: 0 1px 0 rgba(255, 246, 229, 0.72);
        image-rendering: pixelated;
        box-sizing: border-box;
      }
      .craft-queue-slot.empty {
        border-image-source: url('assets/sprout_ui/slots/slot_oct_dark.png');
      }
      .craft-queue-slot.queued {
        border-image-source: url('assets/sprout_ui/slots/slot_oct_med.png');
      }
      .craft-queue-slot.active {
        border-image-source: url('assets/sprout_ui/slots/slot_oct_light.png');
      }
      .modal-close-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 26px;
        height: 26px;
        z-index: 6;
        background-image: url('assets/sprout_ui/buttons/ic_btn_close_normal.png');
      }
      .modal-close-btn:active:not(:disabled) {
        background-image: url('assets/sprout_ui/buttons/ic_btn_close_pressed.png');
      }
      .modal-status-bar {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-family: 'SproutLandsUI', 'SproutLandsDisplay', monospace;
        font-size: 14px;
        font-weight: 700;
        line-height: 1.1;
        color: #fff6e5;
        text-shadow: -1px -1px 0 #1b1109, 1px -1px 0 #1b1109, -1px 1px 0 #1b1109, 1px 1px 0 #1b1109;
        background: rgba(36, 20, 12, 0.72);
        border: 1px solid #1b1109;
        box-shadow: inset 0 1px 0 rgba(255, 240, 200, 0.22);
        padding: 3px 8px;
        border-radius: 4px;
        white-space: nowrap;
        -webkit-font-smoothing: none;
        font-smooth: never;
      }
      .ledger-body {
        padding: 10px 12px;
        overflow-y: auto;
        overflow-x: hidden;
        flex: 1;
        min-height: 0;
        color: #3b2316;
      }
      .diablo-layout {
        display: grid;
        grid-template-columns: minmax(275px, 1.05fr) minmax(320px, 1.25fr) minmax(290px, 1.05fr);
        gap: 12px;
        align-items: stretch;
        height: 100%;
        min-height: 0;
      }
      .equip-grid-2x3 {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 5px;
      }
      .bag-grid {
        display: grid;
        grid-template-columns: repeat(${BAG_COLS}, clamp(40px, 6.2vh, 56px));
        gap: 5px;
        justify-content: center;
        align-content: start;
        padding: 8px 10px 12px 10px;
        overflow-y: auto;
        overflow-x: hidden;
        max-height: 100%;
        width: 100%;
      }
      .inv-slot {
        width: clamp(40px, 6.2vh, 56px);
        height: clamp(40px, 6.2vh, 56px);
        background: url('assets/sprout_ui/slots/slot_round_light.png') no-repeat center / 100% 100%;
        image-rendering: pixelated;
        color: #3b2316;
        text-shadow: none;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        cursor: url('/assets/sprout_ui/cursors/cursor_catpaw_pointing_2x.png') 8 4, pointer;
      }
      .inv-slot:hover { background-image: url('assets/sprout_ui/slots/slot_round_med.png'); }
      .inv-slot.selected { filter: brightness(1.08); }
      .inv-slot.move-source { filter: drop-shadow(0 0 6px #6ee88a); }
      .inv-slot.drag-over { filter: brightness(1.18) drop-shadow(0 0 6px #7ae398); }
      .equip-slot {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 6px;
        border-style: solid;
        border-image-source: url('assets/sprout_ui/docks/tray_light_enclosed.png');
        border-image-slice: 5 5 7 5 fill;
        border-image-width: 8px 8px 10px 8px;
        border-width: 4px 6px 6px 6px;
        color: #3b2316;
        text-shadow: 0 1px 0 rgba(255, 246, 229, 0.72);
        image-rendering: pixelated;
        cursor: url('/assets/sprout_ui/cursors/cursor_catpaw_pointing_2x.png') 8 4, pointer;
      }
      .equip-slot:hover { filter: brightness(1.05); }
      .equip-slot.selected { filter: drop-shadow(0 0 4px #ffe066) brightness(1.06); }
      .equip-slot.drag-over { filter: drop-shadow(0 0 6px #7ae398); }
      .grid-2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(225px, 1fr)); gap: 8px; }

      /* Right-side ascending stacking item notification feed */
      .item-feed-stack {
        position: absolute;
        top: 68px;
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
        padding: 3px 8px;
        border-style: solid;
        border-image-source: url('assets/sprout_ui/docks/tray_light_enclosed.png');
        border-image-slice: 5 5 7 5 fill;
        border-image-width: 8px 8px 10px 8px;
        border-width: 4px 6px 6px 6px;
        color: #3b2316;
        font-size: 11px;
        font-weight: 700;
        image-rendering: pixelated;
        box-shadow: 0 3px 10px rgba(16,10,4,0.35);
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
        background: url('assets/sprout_ui/buttons/round_md_brown_pressed.png') no-repeat center / 100% 100%;
        opacity: 0.78;
        image-rendering: pixelated;
        touch-action: none;
        z-index: 26;
      }
      .touch-joy-knob {
        position: absolute;
        left: 34px;
        top: 34px;
        width: 40px;
        height: 40px;
        background: url('assets/sprout_ui/buttons/round_md_yellow_normal.png') no-repeat center / 100% 100%;
        image-rendering: pixelated;
        pointer-events: none;
      }
      .touch-actions-wrap {
        position: absolute;
        right: 132px;
        bottom: 84px;
        display: flex;
        gap: 10px;
        align-items: flex-end;
        z-index: 45;
      }
      .touch-act-btn {
        width: 56px;
        height: 56px;
        border: none;
        border-radius: 50%;
        background: url('assets/sprout_ui/buttons/round_md_blue_normal.png') no-repeat center / 100% 100%;
        image-rendering: pixelated;
        color: #fff6e5;
        text-shadow: -1px -1px 0 #1b1109, 1px -1px 0 #1b1109, -1px 1px 0 #1b1109, 1px 1px 0 #1b1109, 0 1px 2px #000;
        font-size: 11px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        touch-action: none;
        transition: filter 0.14s ease, transform 0.12s ease;
      }
      .touch-act-btn:active {
        background-image: url('assets/sprout_ui/buttons/round_md_blue_pressed.png');
        transform: scale(0.95);
      }
      .touch-act-btn.primary {
        width: 64px;
        height: 64px;
        background-image: url('assets/sprout_ui/buttons/round_md_green_normal.png');
      }
      .touch-act-btn.primary:active {
        background-image: url('assets/sprout_ui/buttons/round_md_green_pressed.png');
      }

      .nav-short { display: none; }
      @media (max-width: 1120px), (max-height: 540px) {
        .nav-full, .nav-key { display: none; }
        .nav-short { display: inline; }
        #hud-vitals-panel { padding: 4px 7px !important; gap: 6px !important; max-width: none !important; }
        #hud-vitals-panel .bar-track { width: 108px; height: 12px; }
        #hud-time-badge { font-size: 10px !important; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #hud-top-nav { max-width: none !important; gap: 5px !important; }
        #hud-top-nav .hud-btn { padding: 2px 7px; font-size: 11px; }
        #hud-minimap-wrap {
          top: max(6px, env(safe-area-inset-top)) !important;
          bottom: auto !important;
          left: 50% !important;
          right: auto !important;
          transform: translateX(-50%);
        }
        #hud-minimap-wrap.minimap-collapsed {
          border: none !important;
          border-image: none !important;
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        #hud-minimap-wrap.minimap-collapsed #hud-minimap-header { margin-bottom: 0 !important; }
        #hud-minimap-wrap.minimap-collapsed #hud-minimap-title { display: none !important; }
        #hud-minimap-wrap.minimap-collapsed #hud-minimap-toggle { padding: 4px 12px !important; font-size: 12px !important; }
        .touch-actions-wrap { right: 24px; bottom: 28px; gap: 15px; }
        .touch-act-btn { width: 115px; height: 115px; font-size: 16px; }
        .touch-act-btn img { width: 45px !important; height: 45px !important; }
        .touch-act-btn span { font-size: 15px !important; }
        .touch-act-btn.primary { width: 135px; height: 135px; font-size: 16px; }
        .touch-act-btn.primary img { width: 50px !important; height: 50px !important; }
        .touch-joy-base { left: 24px; bottom: 28px; width: 230px; height: 230px; }
        .touch-joy-knob { left: 70px; top: 70px; width: 90px; height: 90px; }
        .hotbar-dock { padding: 4px 5px; gap: 4px; }
        .hotbar-slot { width: 48px; height: 48px; }
        .modal-backdrop { padding-bottom: max(80px, calc(env(safe-area-inset-bottom) + 76px)); }
        .modal-box { width: 98vw; max-height: 94vh; }
        .ledger-window { width: 100%; height: 100%; max-height: 100%; }
        .ledger-tabs { padding: 4px 40px 0 6px; gap: 4px; flex-wrap: nowrap; }
        .ledger-tab-btn { padding: 2px 6px 4px 6px; font-size: 11px; }
        .modal-status-bar { font-size: 14px; gap: 6px; padding: 2px 7px; }
        .ledger-tabs .hud-btn { padding: 2px 6px; font-size: 11px; white-space: nowrap; }
        .ledger-body { -webkit-overflow-scrolling: touch; padding: 8px 10px; }
        .diablo-layout { grid-template-columns: minmax(260px, 1fr) minmax(310px, 1.15fr) minmax(260px, 1fr); gap: 10px; }
        .bag-grid { grid-template-columns: repeat(${BAG_COLS}, 42px); gap: 5px; padding: 8px 8px 12px 8px; overflow: hidden; }
        .inv-slot { width: 42px; height: 42px; }
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

  private isTouchDevice(): boolean {
    return this.touchEnabled || isMobileTouchDevice();
  }

  public setDungeonHud(state: DungeonHudState | null): void {
    const el = this.chromeLayer?.querySelector<HTMLElement>('#hud-dungeon-panel');
    if (!el) return;
    if (!state) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    const discovered = new Set(state.discoveredRoomIds);
    const cols = state.bounds.maxGx - state.bounds.minGx + 1;
    const rows = state.bounds.maxGy - state.bounds.minGy + 1;
    const byCoord = new Map(state.rooms.map((r) => [`${r.gx},${r.gy}`, r]));
    let gridHtml = '';
    for (let gy = state.bounds.minGy; gy <= state.bounds.maxGy; gy++) {
      for (let gx = state.bounds.minGx; gx <= state.bounds.maxGx; gx++) {
        const rm = byCoord.get(`${gx},${gy}`);
        if (!rm || (!discovered.has(rm.id) && rm.role !== 'boss')) {
          gridHtml += `<div style="width:12px; height:10px;"></div>`;
          continue;
        }
        const isCur = rm.id === state.currentRoomId;
        const isBoss = rm.role === 'boss';
        const isMini = rm.role === 'miniboss';
        const bg = isCur
          ? '#ffe066'
          : isBoss
            ? '#7c2b3c'
            : isMini
              ? '#8c5a2b'
              : '#5c4a3a';
        const border = isCur ? '1px solid #1b1109' : '1px solid rgba(27,17,9,0.75)';
        const mark = isBoss ? '💀' : isMini ? '⚔' : '';
        gridHtml += `<div style="width:12px; height:10px; background:${bg}; border:${border}; border-radius:2px; font-size:7px; line-height:9px; text-align:center; opacity:${discovered.has(rm.id) ? 1 : 0.45};">${mark}</div>`;
      }
    }
    el.innerHTML = `
      <div style="font-size:10px; font-weight:800; color:#3b2316; margin-bottom:3px;">${state.roomLabel}</div>
      <div style="display:flex; align-items:center; gap:8px; font-size:10px; font-weight:800; color:#3b2316; margin-bottom:4px;">
        <span>🔑 ${state.smallKeys}</span>
        <span style="color:${state.hasBossKey ? '#216b2b' : '#7a5438'};">${state.hasBossKey ? '🗝️ Boss Key ✓' : '🗝️ Boss Key —'}</span>
      </div>
      <div style="display:grid; grid-template-columns:repeat(${cols}, 12px); grid-template-rows:repeat(${rows}, 10px); gap:2px;">
        ${gridHtml}
      </div>
    `;
  }

  public setTouchActionHint(label: string | null): void {
    if (!this.touchEnabled || !this.chromeBuilt) return;
    if (this.touchActionHint === label) return;
    this.touchActionHint = label;
    const btn = this.chromeLayer.querySelector<HTMLElement>('#hud-touch-act');
    const lblEl = this.chromeLayer.querySelector<HTMLElement>('#hud-touch-act-label');
    if (lblEl) lblEl.textContent = label ?? 'ACT';
    if (btn) {
      btn.classList.toggle('touch-act-btn--active', Boolean(label));
      btn.style.boxShadow = '';
      btn.style.filter = label
        ? 'drop-shadow(1.5px 0 0 #ffe066) drop-shadow(-1.5px 0 0 #ffe066) drop-shadow(0 1.5px 0 #ffe066) drop-shadow(0 -1.5px 0 #ffe066) drop-shadow(0 0 10px rgba(255, 224, 102, 0.9))'
        : '';
      btn.style.transform = label ? 'scale(1.06)' : '';
    }
  }

  private applyMobileTextOutlines(container: HTMLElement): void {
    if (!this.isTouchDevice() && this.hudScale >= 0.999) return;
    const skipSelector = '.hotbar-slot-num, .hotbar-slot-count, .hud-btn, .ledger-tab-btn, .touch-act-btn';
    const els = container.querySelectorAll<HTMLElement>('*');
    els.forEach((el) => {
      if (el.closest(skipSelector) || el.style.textShadow) return;
      let hasText = false;
      for (let i = 0; i < el.childNodes.length; i++) {
        const n = el.childNodes[i];
        if (n.nodeType === 3 && (n.textContent?.trim().length ?? 0) > 0) {
          hasText = true;
          break;
        }
      }
      if (!hasText) return;
      const m = getComputedStyle(el).color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return;
      const r = Number(m[1]);
      const g = Number(m[2]);
      const b = Number(m[3]);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const mixTarget = lum < 0.45 ? 255 : 0;
      const or = Math.round((r + mixTarget) / 2);
      const og = Math.round((g + mixTarget) / 2);
      const ob = Math.round((b + mixTarget) / 2);
      const oc = `rgb(${or}, ${og}, ${ob})`;
      el.style.textShadow = `0.75px 0 0 ${oc}, -0.75px 0 0 ${oc}, 0 0.75px 0 ${oc}, 0 -0.75px 0 ${oc}`;
    });
  }

  public render(): void {
    this.renderChrome();
    this.renderBanners();
    this.renderModal();
    this.renderHotbar();
    this.applyMobileTextOutlines(this.root);
    const modalOpen = this.activeModal !== 'none';
    const hideChrome = modalOpen || this.promoChromeHidden;
    if (this.chromeLayer) this.chromeLayer.style.display = hideChrome ? 'none' : 'block';
    if (this.feedLayer) this.feedLayer.style.display = hideChrome ? 'none' : 'flex';
    if (this.hotbarLayer) this.hotbarLayer.style.display = this.promoChromeHidden && !modalOpen ? 'none' : 'block';
    const touchEl = this.chromeLayer?.querySelector<HTMLElement>('#hud-touch-controls');
    if (touchEl) {
      touchEl.style.display = this.touchEnabled && !modalOpen ? 'block' : 'none';
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
    const hpGhost = this.chromeLayer.querySelector<HTMLElement>('#hud-hp-ghost');
    const hpText = this.chromeLayer.querySelector<HTMLElement>('#hud-hp-text');
    const enFill = this.chromeLayer.querySelector<HTMLElement>('#hud-en-fill');
    const enGhost = this.chromeLayer.querySelector<HTMLElement>('#hud-en-ghost');
    const enText = this.chromeLayer.querySelector<HTMLElement>('#hud-en-text');
    const xpFill = this.chromeLayer.querySelector<HTMLElement>('#hud-xp-fill');
    const xpText = this.chromeLayer.querySelector<HTMLElement>('#hud-xp-text');
    const lvlEl = this.chromeLayer.querySelector<HTMLElement>('#hud-level-label');
    const coinsEl = this.chromeLayer.querySelector<HTMLElement>('#hud-coins-val');
    const spBadge = this.chromeLayer.querySelector<HTMLElement>('#hud-sp-badge');

    const hpDamaged = gameState.hp < this.lastHpSeen;
    const hpHealed = gameState.hp > this.lastHpSeen;
    if (hpDamaged) {
      this.pulseDamageVignette();
      this.triggerPortraitMood('angry', 1500);
      Haptics.impactHeavy();
    }
    this.lastHpSeen = gameState.hp;

    if (gameState.level > this.lastLevelSeen) {
      this.lastLevelSeen = gameState.level;
      this.triggerPortraitMood('happy', 2500);
      Haptics.notifySuccess();
    }

    if (hpFill) {
      hpFill.style.width = `${hpPct}%`;
      hpFill.classList.toggle('hp-low-pulse', hpPct > 0 && hpPct <= 25);
      if (hpDamaged) {
        hpFill.classList.remove('hp-hit-flash', 'hp-heal-pulse');
        void hpFill.offsetWidth;
        hpFill.classList.add('hp-hit-flash');
      } else if (hpHealed) {
        hpFill.classList.remove('hp-heal-pulse', 'hp-hit-flash');
        void hpFill.offsetWidth;
        hpFill.classList.add('hp-heal-pulse');
      }
    }
    const hpTrack = hpFill?.parentElement;
    if (hpTrack && hpDamaged) {
      hpTrack.classList.remove('bar-hit');
      void hpTrack.offsetWidth;
      hpTrack.classList.add('bar-hit');
    }
    if (hpGhost) hpGhost.style.width = `${hpPct}%`;
    if (hpText) hpText.textContent = `${Math.ceil(gameState.hp)}/${maxHp}`;
    const hpHeart = this.chromeLayer.querySelector<HTMLImageElement>('#hud-hp-heart');
    if (hpHeart) {
      const hState = hpPct <= 0 ? 'empty' : hpPct < 50 ? 'half' : 'full';
      hpHeart.src = `assets/sprout_ui/vitals/heart_wood_${hState}.png`;
      hpHeart.classList.toggle('heart-low-pulse', hpPct > 0 && hpPct <= 25);
    }
    if (enFill) enFill.style.width = `${enPct}%`;
    if (enGhost) enGhost.style.width = `${enPct}%`;
    this.syncPortrait();
    if (enText) enText.textContent = `${Math.ceil(gameState.energy)}/${maxEn}`;
    if (xpFill) xpFill.style.width = `${xpPct}%`;
    if (xpText) xpText.textContent = `${gameState.xp}/${nextXp}`;
    if (lvlEl) lvlEl.textContent = `Lv.${gameState.level} ${gameState.heroClass}`;
    if (coinsEl) coinsEl.textContent = `${formatCompactNumber(gameState.coins)}g`;
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
            const icon = done
              ? `<img src="assets/sprout_ui/marks/check_sm_dark_normal.png" class="px-icon" style="width:11px; height:11px; margin-right:3px;" />`
              : '• ';
            return `<div style="display:flex; justify-content:space-between; gap:10px; color:${done ? '#216b2b' : '#3b2316'}; font-weight:${done ? '700' : '600'};"><span style="display:inline-flex; align-items:center;">${icon}${o.label}</span><span>${cur}/${o.count}</span></div>`;
          })
          .join('');
        trackerEl.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; ${this.questTrackerCollapsed ? '' : 'margin-bottom:3px;'}">
            <span style="display:inline-flex; align-items:center; gap:5px; min-width:0;">
              <img src="assets/hud_icons/quest.png" class="px-icon" style="width:14px; height:14px;" />
              <strong style="color:#3b2316; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${tracked.title}</strong>
            </span>
            <span style="display:inline-flex; align-items:center; gap:4px;">
              ${ready ? `<span class="quest-ready-pill">READY</span>` : ''}
              <button class="sl-icon-btn" data-quest-collapse="1" style="width:18px; height:18px; background-image:url('assets/sprout_ui/buttons/${this.questTrackerCollapsed ? 'ic_btn_plus_normal' : 'ic_btn_minus_normal'}.png');" title="${this.questTrackerCollapsed ? 'Expand' : 'Collapse'}"></button>
            </span>
          </div>
          ${this.questTrackerCollapsed ? '' : `<div style="font-size:10px; display:flex; flex-direction:column; gap:2px;">${objHtml}</div>${tracked.waypoint ? `<div style="margin-top:3px; font-size:9px; color:#5c3a24; display:flex; align-items:center; gap:4px;"><img src="assets/hud_icons/compass.png" class="px-icon" style="width:11px; height:11px;" /><span>${ready ? `Return to ${tracked.npcName} at ` : ''}${tracked.waypoint.label}</span></div>` : ''}`}
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
    this.applyMobileTextOutlines(this.chromeLayer);
  }

  private renderChrome(): void {
    const portrait = `assets/portraits/${gameState.heroClass}/${gameState.heroClass}_frame.png`;

    const showKeys = !this.isTouchDevice();

    if (!this.chromeBuilt) {
      this.chromeLayer.innerHTML = `
        <div id="hud-env-vignette" class="${this.envVignetteMode === 'none' ? '' : this.envVignetteMode}"></div>
        <div id="hud-damage-vignette"></div>
        <div id="hud-low-hp-vignette"></div>
        <div id="hud-vitals-panel" class="hud-panel hud-interactive" style="position:absolute; top:10px; left:10px; padding:5px 8px; display:flex; gap:9px; align-items:center;">
          <div class="sl-frame-wood" style="width:54px; height:54px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            <img id="hud-hero-portrait" src="${portrait}" class="px-icon" style="width:38px; height:38px;" />
          </div>
          <div class="sl-pixel-text" style="display:flex; flex-direction:column; gap:2px;">
            <div style="display:flex; align-items:center; gap:7px; font-size:14px; font-weight:800; color:#3b2316;">
              <span id="hud-level-label"></span>
              <span style="color:#fff6e5; text-shadow:-1px -1px 0 #1b1109, 1px -1px 0 #1b1109, -1px 1px 0 #1b1109, 1px 1px 0 #1b1109; background:url('assets/sprout_ui/frames/coin_plate_md.png') no-repeat center / 100% 100%; padding:1px 8px 2px 6px; display:inline-flex; align-items:center; gap:4px; font-size:14px;"><img src="assets/sprout_ui/vitals/coin_sm_1.png" class="px-icon" style="width:12px; height:12px;" /><span id="hud-coins-val"></span></span>
              <span id="hud-sp-badge" style="background:url('assets/sprout_ui/buttons/round_sm_green_normal.png') no-repeat center / 100% 100%; color:#fff6e5; text-shadow:-1px -1px 0 #1b1109, 1px -1px 0 #1b1109, -1px 1px 0 #1b1109, 1px 1px 0 #1b1109; padding:1px 7px; font-size:14px; display:none;"></span>
            </div>
            <div style="display:flex; align-items:center; gap:5px; font-size:14px; font-weight:700; color:#3b2316;">
              <img id="hud-hp-heart" src="assets/sprout_ui/vitals/heart_wood_full.png" class="px-icon" style="width:16px; height:16px;" title="HP" />
              <div class="bar-track"><div id="hud-hp-ghost" class="bar-ghost"></div><div id="hud-hp-fill" class="bar-fill hp"></div></div>
              <span id="hud-hp-text"></span>
            </div>
            <div style="display:flex; align-items:center; gap:5px; font-size:14px; font-weight:700; color:#3b2316;">
              <img src="assets/sprout_ui/icons/brown_outline_tan/sprout_2.png" class="px-icon" style="width:16px; height:16px;" title="Energy" />
              <div class="bar-track"><div id="hud-en-ghost" class="bar-ghost"></div><div id="hud-en-fill" class="bar-fill en"></div></div>
              <span id="hud-en-text"></span>
            </div>
            <div style="display:flex; align-items:center; gap:5px; font-size:14px; font-weight:700; color:#3b2316;">
              <img src="assets/sprout_ui/vitals/star_wood_full.png" class="px-icon" style="width:15px; height:15px;" title="XP" />
              <div class="bar-track" style="height:12px;"><div id="hud-xp-fill" class="bar-fill xp"></div></div>
              <span id="hud-xp-text"></span>
            </div>
            <div style="display:flex; align-items:center; gap:5px; margin-top:1px;">
              <img id="hud-weather-icon" src="assets/sprout_ui/weather/icon_sm_day_sunny.png" class="px-icon" style="width:16px; height:16px;" />
              <span id="hud-time-badge" style="font-size:10px; font-weight:700; color:#5c3a24;">${this.timeLabelText}</span>
            </div>
          </div>
        </div>

        <div id="hud-top-nav" class="hud-interactive" style="position:absolute; top:10px; right:10px; display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; align-items:center;">
          <button class="hud-btn gold" data-nav="menu" id="hud-menu-btn"><img src="assets/hud_icons/menu.png" class="px-icon" style="width:14px; height:14px;" /><span>Menu${showKeys ? '<span class="nav-key"> [I/Tab]</span>' : ''}</span></button>
          <button class="hud-btn tan" data-action="save" title="Save to File ${gameState.activeSlotIndex + 1}"><img src="assets/hud_icons/save.png" class="px-icon" style="width:14px; height:14px;" /><span>Save #${gameState.activeSlotIndex + 1}</span></button>
          <button class="hud-btn" data-action="files" id="hud-files-btn" style="${this.callbacks.onExitToTitle ? '' : 'display:none;'}" title="Save & Return to File Select"><img src="assets/sprout_ui/icons/brown_outline_dark/logout.png" class="px-icon" style="width:14px; height:14px;" /><span>Files</span></button>
          <button class="sl-icon-btn" data-action="music" id="hud-music-btn" title="Toggle Music" style="background-image:url('assets/sprout_ui/buttons/ic_btn_music_off_normal.png');"></button>
          <button class="sl-icon-btn" data-action="mute" id="hud-mute-btn" title="Toggle SFX" style="background-image:url('assets/sprout_ui/buttons/ic_btn_sfx_on_normal.png');"></button>
        </div>

        <div id="hud-quest-tracker" class="hud-panel hud-interactive" style="position:absolute; top:54px; right:10px; width:222px; padding:5px 8px; display:none; z-index:14; cursor:pointer;" title="Click to open Quest Log [Q]"></div>

        <div id="hud-dungeon-panel" class="hud-panel" style="position:absolute; top:104px; left:10px; padding:5px 8px; display:none; z-index:14;"></div>

        <div id="hud-minimap-wrap" class="sl-frame-big hud-interactive minimap-collapsed" style="position:absolute; top:max(8px, env(safe-area-inset-top)); left:50%; transform:translateX(-50%); padding:4px; z-index:25;">
          <div id="hud-minimap-header" style="display:flex; justify-content:space-between; align-items:center; gap:5px; margin-bottom:3px;">
            <span id="hud-minimap-title" style="font-size:10px; font-weight:800; color:#3b2316;">${fmtKeySuffix('Map', 'N')}</span>
            <span id="hud-minimap-zoom-controls" style="display:none; align-items:center; gap:3px;">
              <button class="hud-btn" id="hud-minimap-zoom-out" title="Zoom Out" style="padding:0px 5px; font-size:10px; font-weight:900; line-height:1.1;">-</button>
              <span id="hud-minimap-zoom-label" style="font-size:9px; font-weight:800; color:#3b2316; min-width:22px; text-align:center;">1x</span>
              <button class="hud-btn" id="hud-minimap-zoom-in" title="Zoom In" style="padding:0px 5px; font-size:10px; font-weight:900; line-height:1.1;">+</button>
            </span>
            <button class="hud-btn" id="hud-minimap-toggle" style="padding:0px 5px; font-size:9px;">${this.isTouchDevice() ? 'MAP' : 'Show'}</button>
          </div>
          <div id="hud-minimap-body" style="display:none;">
            <canvas id="hud-minimap-canvas" width="160" height="160" style="display:block; border:2px solid #5c3a24; border-radius:2px; image-rendering:pixelated;"></canvas>
          </div>
        </div>

        <div id="hud-touch-controls" style="display:${this.touchEnabled ? 'block' : 'none'};">
          <div id="hud-touch-joy" class="touch-joy-base hud-interactive">
            <div id="hud-touch-knob" class="touch-joy-knob"></div>
          </div>
          <div class="touch-actions-wrap hud-interactive">
            <button id="hud-touch-dash" class="touch-act-btn" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px;"><img src="assets/hud_icons/dash.png" class="px-icon" style="width:36px; height:36px; pointer-events:none;" /><span style="font-size:13px;">DASH</span></button>
            <button id="hud-touch-act" class="touch-act-btn primary" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px;"><img id="hud-touch-act-icon" src="assets/hud_icons/sword.png" class="px-icon" style="width:40px; height:40px; pointer-events:none;" /><span id="hud-touch-act-label" style="font-size:13px;">ACT</span></button>
          </div>
        </div>
      `;

      this.chromeLayer.querySelectorAll<HTMLElement>('[data-nav]').forEach((el) => {
        this.bindMultiTouchTap(el, () => {
          SFX.playUiClick();
          const nav = el.dataset.nav;
          if (nav === 'menu') {
            gameState.clearButtonAlerts('menu');
            const firstUnlocked = (['inventory', 'craft', 'skills', 'quests', 'map', 'progress'] as const).find(
              (t) => gameState.isMenuTabUnlocked(t),
            );
            const targetTab = gameState.isMenuTabUnlocked(this.lastMenuTab)
              ? this.lastMenuTab
              : (firstUnlocked ?? 'inventory');
            this.toggleModal(this.activeModal === 'none' ? targetTab : 'none');
          } else {
            if (nav) gameState.clearButtonAlerts(nav);
            this.toggleModal(nav as HudModal);
          }
        });
      });
      this.bindMultiTouchTap(this.chromeLayer.querySelector<HTMLElement>('#hud-quest-tracker'), () => {
        SFX.playUiClick();
        this.toggleModal('quests');
      });
      this.bindMultiTouchTap(this.chromeLayer.querySelector<HTMLElement>('[data-action="save"]'), () =>
        this.callbacks.onSave(),
      );
      this.bindMultiTouchTap(this.chromeLayer.querySelector<HTMLElement>('[data-action="files"]'), () => {
        SFX.playUiClick();
        this.callbacks.onExitToTitle?.();
      });
      this.bindMultiTouchTap(this.chromeLayer.querySelector<HTMLElement>('[data-action="music"]'), () => {
        SFX.setMusicEnabled(!SFX.musicEnabled);
        this.renderChrome();
      });
      this.bindMultiTouchTap(this.chromeLayer.querySelector<HTMLElement>('[data-action="mute"]'), () => {
        SFX.setMuted(!SFX.muted);
        this.renderChrome();
      });
      this.minimapCanvas = this.chromeLayer.querySelector<HTMLCanvasElement>('#hud-minimap-canvas') ?? undefined;
      if (this.minimapCanvas) {
        this.minimapCanvas.style.cursor = 'pointer';
        this.minimapCanvas.title = 'Click to open Islands Map [M]';
        this.bindMultiTouchTap(this.minimapCanvas, () => {
          SFX.playUiClick();
          this.toggleModal('map');
        });
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
      this.bindMultiTouchTap(this.chromeLayer.querySelector<HTMLElement>('#hud-minimap-toggle'), () => {
        this.toggleMinimap();
      });
      this.bindMultiTouchTap(this.chromeLayer.querySelector<HTMLElement>('#hud-minimap-zoom-in'), () => {
        SFX.playUiClick();
        this.adjustMinimapZoom(0.25);
      });
      this.bindMultiTouchTap(this.chromeLayer.querySelector<HTMLElement>('#hud-minimap-zoom-out'), () => {
        SFX.playUiClick();
        this.adjustMinimapZoom(-0.25);
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
        el.textContent = `${fmtKeySuffix('Skills', 'K')}${gameState.skillPoints > 0 ? ` (${gameState.skillPoints})` : ''}`;
      } else if (nav === 'map') {
        el.textContent = `${fmtKeySuffix('Islands', 'M')} (${gameState.ownedIslands.size}/25)`;
      } else if (nav === 'progress') {
        el.textContent = fmtKeySuffix(gameState.debugMode ? 'Progress & Debug' : 'Progress', 'P');
      }
    });
    const menuBtn = this.chromeLayer.querySelector<HTMLElement>('#hud-menu-btn');
    if (menuBtn) {
      const anyTabUnlocked =
        gameState.tutorialCompleted || gameState.debugMode || gameState.unlockedMenuTabs.size > 0;
      menuBtn.style.display = anyTabUnlocked ? '' : 'none';
    }
    this.attachAlertBadge(menuBtn, gameState.hasAlertForButton('menu'));
    const minimapWrap = this.chromeLayer.querySelector<HTMLElement>('#hud-minimap-wrap');
    if (minimapWrap) {
      minimapWrap.style.display = gameState.isMenuTabUnlocked('map') ? '' : 'none';
    }
    const muteBtn = this.chromeLayer.querySelector<HTMLElement>('#hud-mute-btn');
    if (muteBtn) {
      muteBtn.style.backgroundImage = `url('assets/sprout_ui/buttons/${SFX.muted ? 'ic_btn_sfx_off_pressed' : 'ic_btn_sfx_on_normal'}.png')`;
      muteBtn.title = SFX.muted ? 'SFX: Muted (Click to Unmute)' : 'SFX: On (Click to Mute)';
    }
    const musicBtn = this.chromeLayer.querySelector<HTMLElement>('#hud-music-btn');
    if (musicBtn) {
      musicBtn.style.backgroundImage = `url('assets/sprout_ui/buttons/${SFX.musicEnabled ? 'ic_btn_music_double_normal' : 'ic_btn_music_off_pressed'}.png')`;
      musicBtn.title = SFX.musicEnabled ? 'Music: On (Click to Disable)' : 'Music: Off (Click to Enable)';
    }
  }

  private renderBanners(): void {
    let html = '';
    if (this.bossInfo) {
      const bpct = Math.max(0, Math.min(100, (this.bossInfo.hp / this.bossInfo.maxHp) * 100));
      html += `
        <div class="hud-panel" style="position:absolute; top:14px; left:50%; transform:translateX(-50%); padding:5px 12px; display:flex; align-items:center; gap:10px; z-index:16;">
          ${this.bossInfo.portrait ? `<div class="sl-frame-wood-dark" style="width:46px; height:46px; display:flex; align-items:center; justify-content:center;"><img src="assets/${this.bossInfo.portrait}.png" class="px-icon" style="width:32px; height:32px;" /></div>` : ''}
          <div>
            <div style="font-size:12px; font-weight:800; color:#9e2a35; margin-bottom:3px; display:flex; align-items:center; gap:5px;"><img src="assets/sprout_ui/icons/brown_outline_dark/skull.png" class="px-icon" style="width:14px; height:14px;" /><span>BOSS: ${this.bossInfo.name}</span></div>
            <div class="bar-track" style="width:230px; height:16px;"><div class="bar-fill hp" style="width:${bpct}%;"></div></div>
          </div>
        </div>
      `;
    }

    if (gameState.pendingBuildRecipeId) {
      const rec = RECIPES.find((r) => r.id === gameState.pendingBuildRecipeId);
      if (this.touchEnabled) {
        html += `
          <div class="hud-dock-light" style="position:absolute; bottom:88px; left:50%; transform:translateX(-50%); padding:4px 12px; font-size:11px; z-index:25; white-space:nowrap;">
            Placing: <strong>${rec?.name ?? ''}</strong> — Drag gizmo to position
          </div>
        `;
      } else {
        html += `
          <div class="hud-dock-light hud-interactive" style="position:absolute; bottom:78px; left:50%; transform:translateX(-50%); padding:4px 12px; font-size:12px; z-index:25; display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:center;">
            <span>Placing: <strong>${rec?.name ?? ''}</strong> — Left-click valid tile • Right-click or</span>
            <button class="hud-btn" data-action="cancel-build" style="padding:1px 6px;">Cancel [Esc]</button>
          </div>
        `;
      }
    }

    if (this.toastMsg) {
      html += `
        <div class="hud-dock-light" style="position:absolute; top:92px; left:50%; transform:translateX(-50%); padding:5px 14px; font-size:12px; font-weight:700; color:#3b2316; z-index:16;">
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
    const s = this.hudScale || 1;
    const rect = anchorEl.getBoundingClientRect();
    const tw = this.tooltipEl.offsetWidth || 200;
    const th = this.tooltipEl.offsetHeight || 80;
    const vw = window.innerWidth / s;
    const left = Math.max(8, Math.min(vw - tw - 8, (rect.left + rect.width / 2) / s - tw / 2));
    const top = Math.max(8, rect.top / s - th - 8);
    this.tooltipEl.style.left = `${Math.round(left)}px`;
    this.tooltipEl.style.top = `${Math.round(top)}px`;
  }

  private hideItemTooltip(): void {
    if (this.tooltipEl) this.tooltipEl.style.display = 'none';
  }

  private renderHotbar(): void {
    const eqValues = new Set(Object.values(gameState.equipment).filter(Boolean));
    const shouldPop = this.lastHotbarPopIdx !== gameState.selectedHotbarIndex;
    this.lastHotbarPopIdx = gameState.selectedHotbarIndex;
    let html = `<div class="hotbar-dock hud-interactive">`;
    for (let i = 0; i < 9; i++) {
      const itemId = gameState.hotbar[i];
      const def = itemId ? ITEMS[itemId] : undefined;
      const count = itemId ? gameState.getItemCount(itemId) : 0;
      const active = gameState.selectedHotbarIndex === i;
      const isStackable = Boolean(def && !def.equipSlot && def.category !== 'gadget');
      const showCount = isStackable;
      const isDepleted = isStackable && count <= 0;
      const cdMs = def?.category === 'gadget' ? gameState.getGadgetRemainingMs(itemId) : 0;
      const cdTotal = 5000;
      const cdPct = cdMs > 0 ? Math.min(100, Math.round((cdMs / Math.max(1, cdTotal)) * 100)) : 0;
      const isEq = Boolean(itemId && eqValues.has(itemId));
      const rarityCls = def ? `rarity-${def.rarity}` : '';
      html += `
        <div class="hotbar-slot ${rarityCls} ${active ? 'active' : ''} ${active && shouldPop ? 'pop' : ''}" data-hotbar="${i}" draggable="${itemId ? 'true' : 'false'}">
          ${active ? `<img src="assets/sprout_ui/selectors/selector_c_tl.png" class="slot-corner tl" /><img src="assets/sprout_ui/selectors/selector_c_tr.png" class="slot-corner tr" /><img src="assets/sprout_ui/selectors/selector_c_bl.png" class="slot-corner bl" /><img src="assets/sprout_ui/selectors/selector_c_br.png" class="slot-corner br" />` : ''}
          <span class="hotbar-slot-num">${i + 1}</span>
          ${isEq ? `<span class="hotbar-eq">EQ</span>` : ''}
          ${
            def
              ? `${
                  def.iconKey
                    ? `<img src="assets/${def.iconKey}.png" class="px-icon" style="width:22px; height:22px; pointer-events:none; ${cdMs > 0 ? 'opacity:0.45;' : ''}${isDepleted ? 'filter:grayscale(1); opacity:0.42;' : ''}" />`
                    : ''
                }
                 <span style="font-size:8px; margin-top:1px; max-width:42px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:${isDepleted ? '#7a685b' : '#3b2316'}; ${isDepleted ? 'opacity:0.65;' : ''} font-weight:800; pointer-events:none;">${def.name.split(' ').pop()}</span>`
              : ''
          }
          ${cdMs > 0 ? `<div class="cd-wipe" style="background:conic-gradient(rgba(16,12,8,0.62) ${cdPct * 3.6}deg, transparent 0deg);"></div><span style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:#ffd242; text-shadow:0 1px 3px #000; pointer-events:none; z-index:3;">${(cdMs / 1000).toFixed(1)}s</span>` : ''}
          ${showCount ? `<span style="position:absolute; top:1px; right:2px; font-size:12px; line-height:1.05; padding:0 3px; border-radius:3px; background:rgba(22,13,8,0.88); border:1px solid ${isDepleted ? 'rgba(200,110,110,0.45)' : 'rgba(255,224,160,0.35)'}; color:${isDepleted ? '#c8b8ad' : '#fff6e5'}; font-weight:800; text-shadow:0 1px 1px #000; pointer-events:none; z-index:3;">${formatCompactNumber(count)}</span>` : ''}
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
      let activeTouchId: number | null = null;
      let longPressed = false;
      let lastTouchTapMs = 0;

      const selectSlot = () => {
        Haptics.impactLight();
        if (gameState.selectedHotbarIndex !== idx) SFX.playHotbarSelect();
        gameState.selectedHotbarIndex = idx;
        this.renderHotbar();
        if (itemId && this.isTouchDevice()) {
          const freshSlot = this.hotbarLayer.querySelector<HTMLElement>(`[data-hotbar="${idx}"]`);
          if (freshSlot) {
            this.showItemTooltip(itemId, freshSlot);
            window.setTimeout(() => this.hideItemTooltip(), 1600);
          }
        } else {
          this.hideItemTooltip();
        }
      };

      el.onmouseenter = () => {
        if (itemId) this.showItemTooltip(itemId, el);
      };
      el.onmouseleave = () => this.hideItemTooltip();
      el.addEventListener(
        'touchstart',
        (e) => {
          if (activeTouchId !== null || e.changedTouches.length === 0) return;
          activeTouchId = e.changedTouches[0].identifier;
          longPressed = false;
          e.stopPropagation();
          if (itemId) {
            longPressTimer = window.setTimeout(() => {
              longPressed = true;
              this.showItemTooltip(itemId, el);
            }, 380);
          }
        },
        { passive: true },
      );
      el.addEventListener('touchend', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === activeTouchId) {
            activeTouchId = null;
            if (longPressTimer !== null) {
              clearTimeout(longPressTimer);
              longPressTimer = null;
            }
            if (!longPressed) {
              const r = el.getBoundingClientRect();
              if (t.clientX >= r.left - 4 && t.clientX <= r.right + 4 && t.clientY >= r.top - 4 && t.clientY <= r.bottom + 4) {
                e.preventDefault();
                e.stopPropagation();
                lastTouchTapMs = performance.now();
                selectSlot();
              }
            } else {
              this.hideItemTooltip();
            }
            break;
          }
        }
      });
      el.addEventListener('touchcancel', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeTouchId) {
            activeTouchId = null;
            if (longPressTimer !== null) {
              clearTimeout(longPressTimer);
              longPressTimer = null;
            }
            this.hideItemTooltip();
            break;
          }
        }
      });
      el.onclick = () => {
        if (performance.now() - lastTouchTapMs < 400) return;
        selectSlot();
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
      this.wasModalOpen = false;
      this.lastModalTab = 'none';
      this.modalLayer.innerHTML = '';
      return;
    }

    const justOpened = !this.wasModalOpen;
    const tabChanged = this.wasModalOpen && this.lastModalTab !== this.activeModal;
    this.wasModalOpen = true;
    this.lastModalTab = this.activeModal;

    const showKeys = !this.isTouchDevice();
    const activeCount = Object.keys(gameState.activeQuests).length;
    const tabs: Array<{ id: HudModal; label: string }> = [
      { id: 'inventory' as const, label: `Character${showKeys ? ' [I]' : ''}` },
      { id: 'craft' as const, label: `Craft${showKeys ? ' [Tab]' : ''}` },
      { id: 'skills' as const, label: `Skills${showKeys ? ' [K]' : ''}${gameState.skillPoints > 0 ? ` (+${gameState.skillPoints})` : ''}` },
      { id: 'quests' as const, label: `Quests${showKeys ? ' [Q]' : ''}${activeCount > 0 ? ` (${activeCount})` : ''}` },
      { id: 'map' as const, label: `Map${showKeys ? ' [M]' : ''} (${gameState.ownedIslands.size}/25)` },
      { id: 'progress' as const, label: `${gameState.debugMode ? 'Progress & Debug' : 'Progress'}${showKeys ? ' [P]' : ''}` },
    ].filter((t) => gameState.isMenuTabUnlocked(t.id));

    let bodyHtml = '';
    if (this.activeModal === 'inventory') bodyHtml = this.renderDiabloInventory();
    else if (this.activeModal === 'craft') bodyHtml = this.renderCraftTab();
    else if (this.activeModal === 'skills') bodyHtml = this.renderSkillsTab();
    else if (this.activeModal === 'quests') bodyHtml = this.renderQuestsTab();
    else if (this.activeModal === 'map') bodyHtml = this.renderMapTab();
    else if (this.activeModal === 'progress') bodyHtml = this.renderProgressTab();

    const maxHp = gameState.getMaxHp();
    const maxEn = gameState.getMaxEnergy();
    this.modalLayer.innerHTML = `
      <div class="modal-backdrop hud-interactive" data-action="close-backdrop">
        <div class="hud-panel-wood ledger-window ${justOpened ? 'modal-enter' : ''}" onclick="event.stopPropagation()">
          <button class="sl-icon-btn modal-close-btn" data-action="close-modal" title="${showKeys ? 'Close [Esc]' : 'Close'}"></button>
          <div class="hud-panel-inset ledger-tabs">
            <div class="ledger-tab-strip">
              ${tabs
                .map((t) => {
                  const isActive = this.activeModal === t.id;
                  return `<button class="ledger-tab-btn ${isActive ? `active${tabChanged ? ' tab-jiggle' : ''}` : ''}" data-tab="${t.id}">${t.label}</button>`;
                })
                .join('')}
            </div>
            <div style="display:flex; align-items:center; gap:6px; padding-bottom:4px; flex-shrink:0;">
              <span class="modal-status-bar">
                <span style="color:#ffe066;">LV.${gameState.level} ${gameState.heroClass.toUpperCase()}</span>
                <span>♥ ${Math.ceil(gameState.hp)}/${maxHp}</span>
                <span>⚡ ${Math.ceil(gameState.energy)}/${maxEn}</span>
                <span style="color:#ffd95a; display:inline-flex; align-items:center; gap:3px;"><img src="assets/sprout_ui/vitals/coin_sm_1.png" class="px-icon" style="width:12px; height:12px;" />${formatCompactNumber(gameState.coins)}g</span>
                ${gameState.skillPoints > 0 ? `<span style="color:#8ef5a7;">+${gameState.skillPoints} SP</span>` : ''}
              </span>
              <button class="hud-btn tan" data-modal-action="save" style="padding:1px 7px; font-size:11px;"><img src="assets/hud_icons/save.png" class="px-icon" style="width:12px; height:12px;" />Save</button>
              <button class="sl-icon-btn" data-modal-action="music" title="Toggle Music" style="width:26px; height:26px; background-image:url('assets/sprout_ui/buttons/${SFX.musicEnabled ? 'ic_btn_music_double_normal' : 'ic_btn_music_off_pressed'}.png');"></button>
              <button class="sl-icon-btn" data-modal-action="mute" title="Toggle SFX" style="width:26px; height:26px; background-image:url('assets/sprout_ui/buttons/${SFX.muted ? 'ic_btn_sfx_off_pressed' : 'ic_btn_sfx_on_normal'}.png');"></button>
            </div>
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
    const equipSlotsHtml = ALL_EQUIP_SLOTS
      .map((slot) => {
        const eqId = gameState.equipment[slot];
        const eqInstId = gameState.equippedInstanceIds[slot];
        const def = eqId ? ITEMS[eqId] : undefined;
        const gearLv = eqId ? gameState.getGearLevel(eqId, eqInstId) : 0;
        const selected = this.selectedInspect?.kind === 'equip' && this.selectedInspect.slot === slot;
        return `
          <div class="equip-slot ${selected ? 'selected' : ''}" data-equip-slot="${slot}" draggable="${eqId ? 'true' : 'false'}">
            <div style="width:28px; height:28px; background:url('assets/sprout_ui/frames/backdrop_b3.png') no-repeat center / 100% 100%; image-rendering:pixelated; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${def?.iconKey ? `<img src="assets/${def.iconKey}.png" class="px-icon" style="width:20px; height:20px; pointer-events:none;" />` : `<span style="font-size:10px; color:#5c3a24;">—</span>`}
            </div>
            <div style="min-width:0; flex:1;">
              <div style="font-size:9px; color:#5c3a24; font-weight:700; text-transform:uppercase;">${EQUIP_SLOT_LABELS[slot]}${gearLv > 0 ? ` • Lv.${gearLv}` : ''}</div>
              <div style="font-size:11px; font-weight:800; color:${def ? '#3b2316' : '#7a5438'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
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
             title="${def ? `${def.name} — Drag to move, equip, or assign to Hotbar 1-9` : 'Empty Slot'}">
          ${isSelected ? `<img src="assets/sprout_ui/selectors/selector_c_tl.png" class="slot-corner tl" /><img src="assets/sprout_ui/selectors/selector_c_tr.png" class="slot-corner tr" /><img src="assets/sprout_ui/selectors/selector_c_bl.png" class="slot-corner bl" /><img src="assets/sprout_ui/selectors/selector_c_br.png" class="slot-corner br" />` : ''}
          ${def?.iconKey ? `<img src="assets/${def.iconKey}.png" class="px-icon" style="width:26px; height:26px; pointer-events:none;" />` : ''}
          ${slot && slot.count > 1 ? `<span style="position:absolute; bottom:2px; right:4px; font-size:10px; font-weight:800; color:#fff6e5; text-shadow:-1px -1px 0 #1b1109, 1px -1px 0 #1b1109, -1px 1px 0 #1b1109, 1px 1px 0 #1b1109; pointer-events:none;">${formatCompactNumber(slot.count)}</span>` : ''}
          ${def?.equipSlot ? `<span style="position:absolute; top:2px; left:4px; font-size:8px; font-weight:800; color:#216b2b; pointer-events:none;">E</span>` : ''}
        </div>
      `;
    }

    // Right: Item Inspector + Comparison
    const inspectorHtml = this.renderItemInspector();

    return `
      <div class="diablo-layout">
        <!-- LEFT: EQUIPMENT 2x3 & STATS 2x4 -->
        <div style="display:flex; flex-direction:column; gap:5px; min-height:0;">
          <div style="font-size:12px; font-weight:800; color:#3b2316;">Equipment Slots</div>
          <div class="equip-grid-2x3">${equipSlotsHtml}</div>
          <div class="hud-panel-inset" style="padding:6px 9px; font-size:11px; flex:1; display:flex; flex-direction:column; justify-content:center; gap:4px;">
            <div style="font-weight:800; color:#ffe066;">Character Stats</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px 10px;">
              <div style="display:flex; justify-content:space-between;"><span>Power Lv</span><strong style="color:#ffd242;">${gameState.getPowerLevel()}</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Attack</span><strong style="color:#ff9b85;">${atkTotal}</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Gather</span><strong style="color:#8ef5a7;">${gatherTotal}</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Armor</span><strong style="color:#8cc8ff;">${eqStats.armor}</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Crit</span><strong style="color:#ffe066;">${critPct}%</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Speed</span><strong>${speed}</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Max HP/EN</span><strong>${gameState.getMaxHp()}/${gameState.getMaxEnergy()}</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Dungeons</span><strong style="color:#d4a3ff;">${gameState.clearedDungeons.size}/4</strong></div>
            </div>
          </div>
        </div>

        <!-- CENTER: INVENTORY GRID -->
        <div style="display:flex; flex-direction:column; gap:6px; align-items:center; justify-content:flex-start; min-height:0; height:100%;">
          <div style="width:100%; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-shrink:0;">
            <span style="font-size:12px; font-weight:800; color:#3b2316;">Inventory (${gameState.bagSlots.filter(Boolean).length}/${BAG_SIZE})</span>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:10px; color:#5c3a24; white-space:nowrap;">Drag to move, equip, or Hotbar 1–9</span>
              <button class="hud-btn" data-action="sort-bag" style="padding:1px 7px; font-size:10px; white-space:nowrap;">Sort Bag</button>
            </div>
          </div>
          <div class="bag-grid hud-panel-inset sl-scroll">${bagHtml}</div>
          ${
            this.moveSourceBagIdx !== null
              ? `<div style="font-size:11px; color:#216b2b; font-weight:700;">Click any destination slot to move/swap • <button class="hud-btn" data-action="cancel-move" style="padding:1px 6px; font-size:10px;">Cancel</button></div>`
              : ''
          }
        </div>

        <!-- RIGHT: INSPECTOR & COMPARISON -->
        <div class="hud-panel-inset sl-scroll" style="padding:10px; overflow-y:auto; min-height:0;">
          ${inspectorHtml}
        </div>
      </div>
    `;
  }

  private renderItemInspector(): string {
    if (!this.selectedInspect) {
      const heroClass = gameState.heroClass;
      const portrait = `assets/portraits/${heroClass}/${heroClass}_frame.png`;
      const eqStats = gameState.getEquippedStats();
      const statRows = [
        { label: 'Bonus Attack', val: `+${eqStats.attack}`, color: '#ff9b85' },
        { label: 'Bonus Gather', val: `+${eqStats.gather}`, color: '#8ef5a7' },
        { label: 'Total Armor', val: `${eqStats.armor}`, color: '#8cc8ff' },
        { label: 'Crit Bonus', val: `+${eqStats.critPct}%`, color: '#ffe066' },
        { label: 'Speed Bonus', val: `+${eqStats.speedPct}%`, color: '#e6f2ff' },
        { label: 'Gear Max HP', val: `+${eqStats.maxHp}`, color: '#ff8a93' },
        { label: 'Gear Max EN', val: `+${eqStats.maxEnergy}`, color: '#8ef5a7' },
      ];
      return `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="sl-frame-wood" style="width:54px; height:54px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              <img src="${portrait}" class="px-icon" style="width:38px; height:38px;" />
            </div>
            <div>
              <div class="sl-pixel-text" style="font-size:14px; font-weight:800; color:#ffe066;">LV.${gameState.level} ${heroClass.toUpperCase()}</div>
              <div style="font-size:11px; color:#c8daeb;">Power Level: <strong style="color:#ffd242;">${gameState.getPowerLevel()}</strong></div>
            </div>
          </div>
          <div style="padding:7px 9px; background:#131f30; border-radius:4px; display:flex; flex-direction:column; gap:4px;">
            <div style="font-size:11px; font-weight:800; color:#ffe066; margin-bottom:2px;">Equipped Gear Bonuses</div>
            ${statRows
              .map(
                (r) =>
                  `<div style="display:flex; justify-content:space-between; font-size:11px;"><span style="color:#c8daeb;">${r.label}</span><strong style="color:${r.color};">${r.val}</strong></div>`,
              )
              .join('')}
          </div>
          <div style="color:#9db6cf; font-size:11px; line-height:1.35;">
            Select any bag or equipment slot to inspect item stats, compare upgrades, equip, or assign to Hotbar 1–9.
          </div>
        </div>
      `;
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
                  ? `<button class="hud-btn gold" data-inspect-act="sell1">Sell 1 (+${formatCompactNumber(sellEach)}g)</button>`
                  : ''
              }
              ${
                def.sellValue > 0 && slotCount > 1
                  ? `<button class="hud-btn gold" data-inspect-act="sellall">Sell ${formatCompactNumber(slotCount)} (+${formatCompactNumber(sellEach * slotCount)}g)</button>`
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
              <div class="craft-queue-slot empty" style="display:flex; align-items:center; justify-content:center; font-size:10px; color:#f2d9b1;">
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
            <div class="craft-queue-slot ${isActive ? 'active' : 'queued'}" style="padding:3px 6px; display:flex; flex-direction:column; justify-content:space-between; position:relative; color:#3b2316;">
              <div style="display:flex; align-items:center; gap:5px;">
                ${outDef?.iconKey ? `<img src="assets/${outDef.iconKey}.png" class="px-icon" style="width:18px; height:18px;" />` : ''}
                <span style="font-size:10px; font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${outDef?.name ?? job.outputItemId}${job.outputCount > 1 ? ` x${job.outputCount}` : ''}</span>
                <button class="sl-icon-btn" data-cancel-queue="${i}" title="Remove & refund ingredients" style="width:14px; height:14px; background-image:url('assets/sprout_ui/marks/x_sm_dark_normal.png');"></button>
              </div>
              ${
                isActive
                  ? `<div style="display:flex; align-items:center; gap:5px;">
                      <div class="bar-track" style="flex:1; height:12px;"><div id="hud-queue-fill-0" class="bar-fill en" style="width:${pct}%;"></div></div>
                      <span id="hud-queue-time-0" style="font-size:9px; font-weight:800; color:#3b2316; min-width:26px; text-align:right;">${Math.max(0.1, job.remainingMs / 1000).toFixed(1)}s</span>
                    </div>`
                  : `<div style="font-size:9px; font-weight:700; color:#5c3a24;">Queued (${(job.totalMs / 1000).toFixed(1)}s)</div>`
              }
            </div>
          `;
        }).join('');

        queuePanelHtml = `
          <div class="hud-panel-inset" style="padding:8px; display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:4px;">
              <div style="font-size:11px; font-weight:800; color:#ffe596;">
                Queue (${selectedStation.craftQueue.length}/${selectedStation.maxQueueSize})
              </div>
              <div style="display:flex; gap:4px; align-items:center;">
                ${selectedStation.craftQueue.length > 0 ? `<button class="hud-btn gold" data-stoke-station="${selectedStation.id}" style="padding:1px 6px; font-size:10px;" title="Stoke/Hammer station for a +25% craft speed burst!">⚡ Stoke</button>` : ''}
                ${stationPicker}
              </div>
            </div>
            <div style="font-size:9px; color:#f2d9b1;">Finished items drop in front of station</div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${slotsHtml}
            </div>
          </div>
        `;
      }
    }

    const list = RECIPES.filter((r) => r.station === this.activeStationTab);

    return `
      <div style="display:flex; flex-direction:column; gap:8px; height:100%; min-height:0;">
        <div style="display:flex; gap:5px; flex-wrap:wrap;">
          ${tabs
            .map((t) => {
              const avail = !this.isQueuedStation(t.id) || !nearby || nearby.has(t.id);
              const isSel = this.activeStationTab === t.id;
              return `<button class="hud-btn ${isSel ? 'gold' : ''}" data-station="${t.id}" style="padding:2px 8px; font-size:11px; ${avail ? '' : 'opacity:0.45; filter:grayscale(0.6);'}" title="${avail ? t.label : `${t.label} (Walk near structure to craft)`}">${t.label}${avail ? '' : ' 🔒'}</button>`;
            })
            .join('')}
        </div>
        <div style="flex:1; min-height:0; display:grid; grid-template-columns:${isQueuedStation ? '1fr 250px' : '1fr'}; gap:10px; align-items:start;">
          <div class="sl-scroll" style="height:100%; overflow-y:auto; display:grid; grid-template-columns:repeat(auto-fill, minmax(225px, 1fr)); gap:7px; align-content:start;">
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
                    return `<span style="display:inline-flex; align-items:center; gap:2px; color:${ok ? '#216b2b' : '#9e2a35'};">${iconImg}${itemDef?.name ?? ing.itemId}: ${formatCompactNumber(have)}/${formatCompactNumber(req)}</span>`;
                  });
                if (r.coinCost) {
                  const haveCoins = gameState.coins;
                  const ok = haveCoins >= r.coinCost;
                  ingsList.push(`<span style="display:inline-flex; align-items:center; gap:2px; color:${ok ? '#8f5616' : '#9e2a35'};"><img src="assets/sprout_ui/vitals/coin_sm_1.png" class="px-icon" style="width:12px; height:12px;" />${formatCompactNumber(haveCoins)}/${formatCompactNumber(r.coinCost)}g</span>`);
                }
                const ings = ingsList.join(' • ');
                const skillReqLabel = lockedBySkill
                  ? `<div style="font-size:9px; color:#6b2d8f;">Skill: ${SKILLS.find((s) => s.id === r.requiresSkill)?.name}</div>`
                  : '';
                const bpReqLabel = lockedByBlueprint
                  ? `<div style="font-size:9px; color:#ffe066;">🔒 ${r.blueprintHint ?? 'Blueprint Locked'}</div>`
                  : '';
                const timeSec = isQueuedStation ? (gameState.getCraftDurationMs(r) / 1000).toFixed(1) : null;
                const iconKey = r.iconKey ?? (r.outputItemId ? ITEMS[r.outputItemId]?.iconKey : undefined);
                const btnLabel = lockedByBlueprint
                  ? 'Locked'
                  : isBuild
                    ? 'Place'
                    : isQueuedStation
                      ? !inRange
                        ? 'Near'
                        : queueFull
                          ? 'Full'
                          : `${timeSec}s`
                      : 'Craft';
                return `
                  <div class="${lockedByBlueprint ? 'hud-panel-inset' : 'hud-dock-light'}" style="padding:5px 8px; display:flex; flex-direction:column; justify-content:space-between; gap:4px; opacity:${lockedByBlueprint ? '0.82' : '1'};">
                    <div style="display:flex; align-items:center; gap:6px;">
                      ${iconKey ? `<div style="width:26px; height:26px; background:url('assets/sprout_ui/frames/backdrop_b3.png') no-repeat center / 100% 100%; image-rendering:pixelated; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><img src="assets/${iconKey}.png" class="px-icon" style="width:18px; height:18px; ${lockedByBlueprint ? 'filter:grayscale(0.8);' : ''}" /></div>` : ''}
                      <div style="font-weight:800; font-size:11px; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:${lockedByBlueprint ? '#f2d9b1' : '#3b2316'};" title="${r.name}: ${r.description}">${r.name}</div>
                      <button class="hud-btn ${canAction ? 'primary' : ''}" ${canAction ? '' : 'disabled'} data-craft="${r.id}" style="padding:1px 7px; font-size:10px; flex-shrink:0;">
                        ${btnLabel}
                      </button>
                    </div>
                    <div style="font-size:10px; color:${lockedByBlueprint ? '#e6d2b5' : '#5c3a24'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.description}</div>
                    ${lockedByBlueprint ? bpReqLabel : `<div style="font-size:10px; font-weight:700; display:flex; flex-wrap:wrap; gap:4px;">${ings}</div>${skillReqLabel}`}
                  </div>
                `;
              })
              .join('')}
          </div>
          ${isQueuedStation ? `<div>${queuePanelHtml}</div>` : ''}
        </div>
      </div>
    `;
  }

  private renderSkillsTab(): string {
    const pillars: SkillPillar[] = ['foraging', 'industry', 'economy', 'magic', 'familiar'];
    const famSpec = getFamiliarSpecForClass(gameState.heroClass);
    const famTier = gameState.getFamiliarTier();
    const famIsApex = famTier >= 12;
    const famIconPath = famIsApex ? famSpec.apexIconPath : famSpec.baseIconPath;
    const famName = famIsApex ? famSpec.apexName : famSpec.baseName;

    return `
      <div style="display:flex; flex-direction:column; gap:6px; height:100%; min-height:0;">
        <div style="font-size:12px; color:#3b2316; font-weight:800;">Available Skill Points: ${gameState.skillPoints}</div>
        <div style="flex:1; min-height:0; display:grid; grid-template-columns:repeat(5, 1fr); gap:6px;">
          ${pillars
            .map((p) => {
              const meta = PILLAR_META[p];
              const pSkills = SKILLS.filter(
                (s) => s.pillar === p && (!s.heroClass || s.heroClass === gameState.heroClass),
              );
              const headerHtml =
                p === 'familiar'
                  ? `<div style="display:flex; align-items:center; justify-content:center; gap:5px; padding:3px 4px; background:${meta.color}; color:#fff6e5; border:2px solid #4a2e1b; border-radius:4px; font-size:11px; font-weight:800;">
                      <img src="${famIconPath}" class="px-icon" style="width:16px; height:16px; image-rendering:pixelated;" />
                      <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${famName} (T${famTier})</span>
                    </div>`
                  : `<div style="text-align:center; font-weight:800; padding:4px; background:${meta.color}; color:#fff6e5; border:2px solid #4a2e1b; border-radius:4px; font-size:12px;">${meta.label}</div>`;
              return `
                <div class="sl-scroll" style="display:grid; grid-template-rows:auto repeat(${pSkills.length}, 1fr); gap:5px; min-height:0; overflow-y:auto; padding-right:3px;">
                  ${headerHtml}
                  ${pSkills
                    .map((s) => {
                      const unlocked = gameState.hasSkill(s.id);
                      const can = gameState.canUnlockSkill(s.id);
                      return `
                        <div class="${unlocked || can ? 'hud-dock-light' : 'hud-panel-inset'}" style="padding:5px 7px; display:flex; flex-direction:column; justify-content:space-between; opacity:${unlocked || can ? 1 : 0.78};">
                          <div style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
                            <div style="font-size:11px; font-weight:800; color:${unlocked ? '#216b2b' : can ? '#3b2316' : '#f2d9b1'};">T${s.tier}: ${s.name}</div>
                            <img src="assets/sprout_ui/vitals/${unlocked ? 'star_wood_full' : 'star_wood_empty'}.png" class="px-icon" style="width:14px; height:14px;" />
                          </div>
                          <div style="font-size:10px; color:${unlocked || can ? '#5c3a24' : '#e6d2b5'}; line-height:1.25;">${s.description}</div>
                          ${
                            unlocked
                              ? `<span style="font-size:9px; color:#216b2b; font-weight:800;">✓ UNLOCKED</span>`
                              : `<button class="hud-btn ${can ? 'gold' : ''}" ${can ? '' : 'disabled'} data-skill="${s.id}" style="width:100%; padding:1px 4px; font-size:10px;">Unlock (${s.spCost ?? 1} SP${s.minLevel ? ` • Lv.${s.minLevel}+` : ''})</button>`
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
    const worldStats = this.callbacks.getWorldDebugStats?.();
    const ptx = worldStats?.playerTx ?? Math.floor((gameState.playerPos?.x ?? 0) / TILE_PX);
    const pty = worldStats?.playerTy ?? Math.floor((gameState.playerPos?.y ?? 0) / TILE_PX);
    const curGx = Math.max(0, Math.min(WORLD_GRID_SIZE - 1, Math.floor(ptx / ISLAND_CELL_TILES)));
    const curGy = Math.max(0, Math.min(WORLD_GRID_SIZE - 1, Math.floor(pty / ISLAND_CELL_TILES)));
    const curSpec = getIslandAt(curGx, curGy);

    let gridHtml = `<div style="display:grid; grid-template-columns:repeat(${WORLD_GRID_SIZE}, 1fr); grid-template-rows:repeat(${WORLD_GRID_SIZE}, 1fr); gap:6px; height:100%; min-height:0;">`;
    for (let gy = 0; gy < WORLD_GRID_SIZE; gy++) {
      for (let gx = 0; gx < WORLD_GRID_SIZE; gx++) {
        const spec = getIslandAt(gx, gy);
        if (!spec) continue;
        const isCurrentRegion = gx === curGx && gy === curGy;
        const owned = gameState.ownedIslands.has(`${gx},${gy}`);
        const adj = gameState.isIslandAdjacentToOwned(gx, gy);
        const cost = gameState.getIslandCost(gx, gy);
        const recLv = getIslandRecommendedLevel(spec);
        const storyLock = gameState.getIslandStoryLockReason(gx, gy);
        const canBuy = adj && !storyLock && gameState.coins >= cost;
        const lvColor = recLv - gameState.getPowerLevel() >= 3 ? '#ff8a93' : '#d2e2f2';
        const clearedDung = spec.dungeonId && gameState.clearedDungeons.has(spec.dungeonId);
        const dungTag = spec.dungeonId ? (clearedDung ? ' • ✓ Dungeon' : ' • 💀 Dungeon') : '';
        const npcTag = spec.npc ? ` • 🏠 ${spec.npc.name.split(' ').pop()}` : '';
        const highlightStyle = isCurrentRegion
          ? 'box-shadow:0 0 0 2px #ffe066, 0 0 12px rgba(255,224,102,0.85); border:1.5px solid #ffe066; position:relative;'
          : '';
        gridHtml += `
          <div class="hud-panel-inset" style="padding:5px 7px; background:${owned ? biomeColors[spec.biome] : 'rgba(30,20,14,0.85)'}; display:flex; flex-direction:column; justify-content:space-between; min-height:0; ${highlightStyle}" title="${storyLock ?? ''}">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; gap:4px;">
                <span style="font-size:11px; font-weight:800; color:#fff6e5; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${isCurrentRegion ? '📍 ' : ''}${spec.name}</span>
                <span style="font-size:9px; color:${owned ? '#e6ffea' : lvColor}; font-weight:700;">Lv.${recLv}</span>
              </div>
              <div style="font-size:9px; color:#f2d9b1; text-transform:capitalize; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${spec.biome}${dungTag}${npcTag}</div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; gap:4px;">
              ${
                owned
                  ? `<span style="font-size:9px; font-weight:800; color:#a3f7b5;">✓ OWNED</span>`
                  : storyLock
                    ? `<span style="font-size:9px; color:#ff9ba3;">🔒 Ch.${spec.biome === 'autumn' || spec.biome === 'graveyard' ? 2 : spec.biome === 'winter' ? 3 : 4} (${formatCompactNumber(cost)}g)</span>`
                    : adj
                      ? `<button class="hud-btn ${canBuy ? 'gold' : ''}" ${canBuy ? '' : 'disabled'} data-buy-island="${gx},${gy}" style="padding:1px 6px; font-size:10px;">Buy ${formatCompactNumber(cost)}g</button>`
                      : `<span style="font-size:9px; color:#b8a088;">Locked (${formatCompactNumber(cost)}g)</span>`
              }
              ${isCurrentRegion ? `<span style="font-size:8px; font-weight:800; color:#1b1109; background:#ffe066; padding:0 4px; border-radius:3px;">YOU</span>` : ''}
            </div>
          </div>
        `;
      }
    }
    gridHtml += `</div>`;
    return `
      <div style="display:grid; grid-template-columns:1fr 240px; gap:10px; height:100%; min-height:0;">
        ${gridHtml}
        <div class="hud-panel-inset" style="padding:10px; display:flex; flex-direction:column; gap:8px; font-size:11px;">
          <div style="font-size:13px; font-weight:800; color:#ffe596;">Archipelago Map</div>
          <div style="padding:5px 7px; background:rgba(255,224,102,0.14); border:1px solid #ffe066; border-radius:4px; font-size:10px; color:#fff6e5;">
            <div><strong style="color:#ffe066;">📍 You Are Here:</strong></div>
            <div style="font-weight:800; margin-top:1px;">${curSpec?.name ?? 'Unknown'} (${curGx + 1}, ${curGy + 1})</div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span>Owned: <strong>${gameState.ownedIslands.size}/${ISLANDS.length}</strong></span>
            <span>•</span>
            <img src="assets/sprout_ui/vitals/coin_sm_1.png" class="px-icon" style="width:13px; height:13px;" />
            <strong style="color:#ffd95a;">${formatCompactNumber(gameState.coins)}g</strong>
          </div>
          <div style="border-top:1px solid rgba(255,255,255,0.15); padding-top:6px; font-size:10px; color:#f2d9b1; line-height:1.4;">
            <div><strong style="color:#ffe066;">Expansion:</strong> Buy islands adjacent to your territory.</div>
            <div style="margin-top:4px;"><strong style="color:#8ef5a7;">Story Chapters:</strong></div>
            <div>• Ch.2: Autumn &amp; Graveyard</div>
            <div>• Ch.3: Winter Frontier</div>
            <div>• Ch.4: Infernal Rim</div>
          </div>
        </div>
      </div>
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
              <div class="${tracked ? 'hud-dock-light' : 'hud-panel-inset'}" style="padding:8px 10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px;">
                  <div>
                    <strong style="font-size:13px; color:${tracked ? '#3b2316' : '#ffe596'};">${q.title}</strong>
                    <span style="font-size:10px; color:${tracked ? '#5c3a24' : '#f2d9b1'}; margin-left:6px;">(${q.npcName} • Step ${q.step})</span>
                  </div>
                  <button class="hud-btn ${tracked ? 'gold' : ''}" data-track-quest="${tracked ? '' : q.id}" style="padding:2px 8px; font-size:10px;">
                    ${tracked ? 'Tracking ✓' : 'Track'}
                  </button>
                </div>
                <div style="font-size:11px; color:${tracked ? '#5c3a24' : '#e6d2b5'}; margin-bottom:6px;">${q.description}</div>
                <div style="display:flex; flex-direction:column; gap:3px; margin-bottom:6px;">${objsHtml}</div>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:${tracked ? '#5c3a24' : '#f2d9b1'}; border-top:1px solid rgba(92,58,36,0.35); padding-top:5px;">
                  <span>Rewards: <strong style="color:${tracked ? '#8f5616' : '#ffd95a'};">${rewardsText}</strong></span>
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
      <div class="hud-panel-inset" style="padding:7px 12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
          <strong style="font-size:13px; color:#ffd242;">${chMeta.title}</strong>
          <span style="font-size:10px; color:#8ef5a7; font-weight:700;">Power Lv.${gameState.getPowerLevel()} • ${chMeta.subtitle}</span>
        </div>
        <div style="font-size:11px; color:#fff6e5; margin:2px 0;">${chMeta.summary} <span style="color:#ffe596;">(Next: ${chMeta.unlockHint})</span></div>
      </div>
    `;

    return `
      <div style="display:flex; flex-direction:column; gap:8px; height:100%; min-height:0;">
        ${storyBannerHtml}
        <div style="flex:1; min-height:0; display:grid; grid-template-columns:1.35fr 1fr; gap:10px;">
          <div class="sl-scroll" style="overflow-y:auto; display:flex; flex-direction:column; gap:6px;">
            <div style="font-size:12px; font-weight:800; color:#3b2316;">Active Quests (${activeIds.length})</div>
            <div style="display:flex; flex-direction:column; gap:6px;">${activeHtml}</div>
          </div>
          <div class="hud-panel-inset sl-scroll" style="padding:8px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">
            <div style="font-size:12px; font-weight:800; color:#8ef5a7;">Completed Quests (${gameState.completedQuests.size}/${QUESTS.length})</div>
            ${
              completedList.length
                ? `<div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">${completedList
                    .map(
                      (q) =>
                        `<div style="padding:5px 7px; background:rgba(20,40,28,0.55); border:1px solid #4fa86c; border-radius:4px; font-size:10px;">
                           <strong style="color:#8ef5a7;">✓ ${q.title}</strong>
                           <div style="font-size:9px; color:#f2d9b1;">${q.npcName} (Step ${q.step})</div>
                         </div>`,
                    )
                    .join('')}</div>`
                : `<div style="font-size:11px; color:#f2d9b1;">No completed quests yet.</div>`
            }
          </div>
        </div>
      </div>
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
        <div class="hud-panel-inset" style="padding:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <strong style="color:#ffbe6b; font-size:12px;">Debug Mode — Testing & Cheat Controls</strong>
            <button class="hud-btn" data-dbg="toggle_mode" style="padding:2px 8px; font-size:10px;">Debug: ON (Turn Off)</button>
          </div>
          <div style="display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; gap:5px; flex-wrap:wrap;">
              <button class="hud-btn primary" data-dbg="add_resources">+50 Mats & +500g</button>
              <button class="hud-btn primary" data-dbg="add_consumables">+10 Food/Potions</button>
              <button class="hud-btn gold" data-dbg="add_coins">+1,000 Coins</button>
              <button class="hud-btn" data-dbg="full_heal">Full Heal</button>
            </div>
            <div style="display:flex; gap:5px; flex-wrap:wrap; align-items:center;">
              <button class="hud-btn gold" data-dbg="add_level_1">+1 Lv</button>
              <button class="hud-btn gold" data-dbg="add_level_5">+5 Lv</button>
              <button class="hud-btn" data-dbg="unlock_all_skills">Unlock 20 Skills</button>
              <button class="hud-btn" data-dbg="unlock_relics">Unlock Relics/Bow</button>
              <button class="hud-btn" data-dbg="unlock_all_islands">Unlock 25 Islands</button>
              <button class="hud-btn" data-dbg="clear_dungeons">Clear 4 Dungeons</button>
            </div>
            <div style="display:flex; gap:4px; flex-wrap:wrap; align-items:center;">
              <span style="font-size:10px; color:#f2d9b1;">Teleport:</span>
              <button class="hud-btn" data-teleport="2,2" style="padding:2px 6px; font-size:10px;">Origin</button>
              <button class="hud-btn" data-teleport="3,3" style="padding:2px 6px; font-size:10px;">Desert</button>
              <button class="hud-btn" data-teleport="0,2" style="padding:2px 6px; font-size:10px;">Skull Crypt</button>
              <button class="hud-btn" data-teleport="4,2" style="padding:2px 6px; font-size:10px;">Sunken Tomb</button>
              <button class="hud-btn" data-teleport="2,0" style="padding:2px 6px; font-size:10px;">Frost</button>
              <button class="hud-btn" data-teleport="4,0" style="padding:2px 6px; font-size:10px;">Infernal</button>
            </div>
            <div style="display:flex; gap:4px; flex-wrap:wrap; align-items:center;">
              <span style="font-size:10px; color:#f2d9b1;">Time:</span>
              <button class="hud-btn" data-dbg-time="0.08" style="padding:2px 6px; font-size:10px;">Dawn</button>
              <button class="hud-btn" data-dbg-time="0.35" style="padding:2px 6px; font-size:10px;">Noon</button>
              <button class="hud-btn" data-dbg-time="0.68" style="padding:2px 6px; font-size:10px;">Dusk</button>
              <button class="hud-btn" data-dbg-time="0.88" style="padding:2px 6px; font-size:10px;">Night</button>
              <button class="hud-btn gold" data-dbg="next_day" style="padding:2px 6px; font-size:10px;">Next Day</button>
            </div>
            <div style="display:flex; gap:4px; flex-wrap:wrap; align-items:center;">
              <span style="font-size:10px; color:#f2d9b1;">Weather:</span>
              <button class="hud-btn" data-dbg-weather="auto" style="padding:2px 6px; font-size:10px;">Auto</button>
              <button class="hud-btn" data-dbg-weather="sunny" style="padding:2px 6px; font-size:10px;">Sunny</button>
              <button class="hud-btn" data-dbg-weather="cloudy" style="padding:2px 6px; font-size:10px;">Cloudy</button>
              <button class="hud-btn" data-dbg-weather="rain" style="padding:2px 6px; font-size:10px;">Rain</button>
              <button class="hud-btn" data-dbg-weather="snow" style="padding:2px 6px; font-size:10px;">Snow</button>
              <button class="hud-btn" data-dbg-weather="sandstorm" style="padding:2px 6px; font-size:10px;">Sand</button>
            </div>
            <div style="display:flex; gap:5px; flex-wrap:wrap; align-items:center; padding-top:4px; border-top:1px solid rgba(255,255,255,0.12);">
              <span style="font-size:10px; color:#f2d9b1;">Spawn:</span>
              <select id="dbg-item-select" style="background:#1c120c; color:#f6eedc; border:1px solid #6b4e35; border-radius:4px; padding:2px 5px; font-size:10px; max-width:160px;">
                ${itemOptions}
              </select>
              <input id="dbg-item-qty" type="number" value="5" min="1" max="999" style="width:46px; background:#1c120c; color:#f6eedc; border:1px solid #6b4e35; border-radius:4px; padding:2px 5px; font-size:10px;" />
              <button class="hud-btn primary" data-dbg="spawn_item" style="padding:2px 7px; font-size:10px;">Grant</button>
              <div style="flex:1;"></div>
              <button class="hud-btn danger" data-dbg="reset_run" title="Resets current run to Level 1 New Adventure" style="padding:2px 7px; font-size:10px;">Reset Run</button>
              <button class="hud-btn danger" data-dbg="erase_save" title="Deletes all localStorage/sessionStorage saves and restarts" style="padding:2px 7px; font-size:10px;">Erase Save</button>
            </div>
          </div>
        </div>
      `
      : `
        <div class="hud-panel-inset" style="padding:8px 10px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:#f2d9b1;">Debug Mode is currently OFF.</span>
          <button class="sl-icon-btn" data-dbg="toggle_mode" title="Enable Debug Mode" style="width:44px; height:28px; background-image:url('assets/sprout_ui/controls/toggle_brown_state_1.png');"></button>
        </div>
      `;

    const isGrandVictory =
      gameState.finalBossDefeated &&
      gameState.clearedDungeons.size >= 4 &&
      gameState.ownedIslands.size >= ISLANDS.length;

    const victoryBannerHtml = isGrandVictory
      ? `
        <div class="hud-panel" style="padding:7px 12px; margin-bottom:8px; background:linear-gradient(90deg, #2b4a2f, #4c3b14); text-align:center; flex-shrink:0;">
          <strong style="color:#ffe596; font-size:13px;">GRAND VICTORY — ALL 25 ISLANDS, 4 DUNGEONS &amp; VOID SPIRE FINAL BOSS CONQUERED!</strong>
          <div style="font-size:10px; color:#e6ffea; margin-top:2px;">You have defeated the Ancient Black Dragon on Floor 20 of the Void Spire and mastered Forage Ahead!</div>
        </div>
      `
      : '';

    return `
      <div style="display:flex; flex-direction:column; height:100%; min-height:0; gap:8px;">
        ${victoryBannerHtml}
        <!-- COMPACT LIVE TELEMETRY BAR -->
        <div class="hud-panel-inset" style="padding:8px 10px; flex-shrink:0;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:8px;">
            <div style="font-size:12px; font-weight:700; color:#ffe596;">Command Center — Live Game State</div>
            <div style="display:flex; align-items:center; gap:8px; font-size:11px;">
              <span style="color:#f2d9b1;">Volume:</span>
              <input id="hud-vol-slider" class="sl-range" type="range" min="0" max="100" value="${Math.round(SFX.masterVolume * 100)}" style="width:92px;" />
              <span id="hud-vol-label">${Math.round(SFX.masterVolume * 100)}%</span>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:repeat(6, minmax(0, 1fr)); gap:6px; font-size:10px;">
            <div><span style="color:#d6b88c;">Hero:</span> <strong>${gameState.heroClass} Lv.${gameState.level}</strong></div>
            <div><span style="color:#d6b88c;">Vitals:</span> <strong>${Math.ceil(gameState.hp)}/${gameState.getMaxHp()} HP • ${Math.ceil(gameState.energy)}/${gameState.getMaxEnergy()} EN</strong></div>
            <div><span style="color:#d6b88c;">Coins/SP:</span> <strong style="color:#ffd95a;">${gameState.coins}g • ${gameState.skillPoints} SP</strong></div>
            <div><span style="color:#d6b88c;">Bag/Relics:</span> <strong>${bagUsed}/${BAG_SIZE} • ${relicsUnlocked}/4</strong></div>
            <div><span style="color:#d6b88c;">World:</span> <strong>${gameState.ownedIslands.size}/${ISLANDS.length} Isl • ${gameState.unlockedSkills.size}/${SKILLS.length} Sk</strong></div>
            <div><span style="color:#d6b88c;">Void Spire:</span> <strong style="color:#e0b0ff;">Fl.${gameState.voidSpireHighestFloor}</strong> • ${gameState.clearedDungeons.size}/4 Dung</div>
          </div>
          <div style="margin-top:4px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.12); display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; font-size:10px; color:#d6b88c;">
            <span>Content: <strong>${Object.keys(ITEMS).length}</strong> Items • <strong>${RECIPES.length}</strong> Recipes • <strong>${Object.keys(MONSTERS).length}</strong> Monsters • <strong>${QUESTS.length}</strong> Quests</span>
            <span>Save: <strong style="color:${worldStats?.hasSavedData ? '#8ef5a7' : '#f2d9b1'};">${worldStats?.hasSavedData ? 'Saved' : 'Clean'}</strong>${worldStats ? ` • Pos (${worldStats.playerTx},${worldStats.playerTy}) • Nodes ${worldStats.nodesCount} • Enemies ${worldStats.enemiesCount} • Bldgs ${worldStats.buildingsCount} (${worldStats.activeCraftJobs} jobs)` : ''}</span>
          </div>
        </div>

        <!-- 2-COLUMN SPLIT: DEBUG & ROADMAP | IMPLEMENTED SYSTEMS -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; flex:1; min-height:0;">
          <div class="sl-scroll" style="display:flex; flex-direction:column; gap:8px; padding-right:4px;">
            ${debugPanelHtml}
            <div style="font-size:12px; font-weight:700; color:#ffe596;">Outstanding Roadmap (${OUTSTANDING_ITEMS.length})</div>
            <div style="display:flex; flex-direction:column; gap:5px;">
              ${
                OUTSTANDING_ITEMS.length === 0
                  ? `<div class="hud-panel-inset" style="padding:8px 10px; font-size:11px; color:#a3f7b5;">All planned roadmap items are complete and verified!</div>`
                  : OUTSTANDING_ITEMS.map((item) => {
                      const prioColor =
                        item.priority === 'High' ? '#ff8a93' : item.priority === 'Medium' ? '#ffe066' : '#8cc8ff';
                      return `
                        <div class="hud-panel-inset" style="padding:7px 9px; display:flex; align-items:flex-start; gap:8px;">
                          <span style="font-size:9px; font-weight:700; color:${prioColor}; border:1px solid ${prioColor}; padding:1px 5px; border-radius:4px; min-width:48px; text-align:center;">${item.priority}</span>
                          <div>
                            <div style="font-size:11px; font-weight:700;">${item.title}</div>
                            <div style="font-size:10px; color:#e6d5b8;">${item.details}</div>
                          </div>
                        </div>
                      `;
                    }).join('')
              }
            </div>
          </div>

          <div class="sl-scroll" style="padding-right:4px;">
            <div style="font-size:12px; font-weight:700; color:#8ef5a7; margin-bottom:6px;">Implemented Features Breakdown (${IMPLEMENTED_FEATURES.length} Systems)</div>
            <div class="grid-2" style="gap:6px;">
              ${IMPLEMENTED_FEATURES.map(
                (f) => `
                <div class="hud-panel-inset" style="padding:7px 9px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:2px;">
                    <span style="font-size:9px; color:#8ef5a7; text-transform:uppercase; font-weight:700;">${f.category}</span>
                    <span style="font-size:8px; background:#235439; color:#a3f7b5; padding:1px 5px; border-radius:6px; font-weight:700;">${f.status}</span>
                  </div>
                  <div style="font-size:11px; font-weight:700; margin-bottom:2px;">${f.title}</div>
                  <div style="font-size:10px; color:#e6d5b8;">${f.details}</div>
                </div>
              `,
              ).join('')}
            </div>
          </div>
        </div>
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
    this.modalLayer.querySelector<HTMLElement>('[data-modal-action="save"]')?.addEventListener('click', () => {
      this.callbacks.onSave();
    });
    this.modalLayer.querySelector<HTMLElement>('[data-modal-action="music"]')?.addEventListener('click', () => {
      SFX.setMusicEnabled(!SFX.musicEnabled);
      this.render();
    });
    this.modalLayer.querySelector<HTMLElement>('[data-modal-action="mute"]')?.addEventListener('click', () => {
      SFX.setMuted(!SFX.muted);
      this.render();
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
      const hbTarget = target.closest<HTMLElement>('[data-hotbar]');
      if (hbTarget) {
        const hbIdx = Number(hbTarget.dataset.hotbar);
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
        }, 260);
      }, { passive: true });

      el.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        if (!dragging) {
          if (holdTimer !== null && Math.hypot(t.clientX - startX, t.clientY - startY) > 14) {
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
        const dropSlot = under?.closest<HTMLElement>('[data-bag-idx],[data-equip-slot],[data-hotbar]') ?? null;
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
            if (!gameState.bagSlots[idx]) this.selectedInspect = null;
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

    this.modalLayer.querySelectorAll<HTMLElement>('[data-stoke-station]').forEach((el) => {
      el.onclick = () => {
        const stId = el.dataset.stokeStation!;
        if (this.callbacks.onStokeStation?.(stId)) {
          this.updateCraftQueueInPlace();
        }
      };
    });

    this.modalLayer.querySelectorAll<HTMLElement>('[data-craft]').forEach((el) => {
      el.onclick = () => {
        const id = el.dataset.craft!;
        const rec = RECIPES.find((r) => r.id === id);
        if (!rec) return;
        const btnRect = el.getBoundingClientRect();
        const iconKey = rec.iconKey ?? (rec.outputItemId ? ITEMS[rec.outputItemId]?.iconKey : undefined);
        const outCount = rec.outputCount ?? 1;
        if (rec.station === 'build') {
          this.showCraftPopPopup(btnRect, rec.name, iconKey, 1);
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
            this.showCraftPopPopup(btnRect, rec.name, iconKey, outCount, 'Queued');
            this.renderModal();
          }
        } else if (gameState.craftRecipe(id)) {
          SFX.playCraft();
          this.showCraftPopPopup(btnRect, rec.name, iconKey, outCount);
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
