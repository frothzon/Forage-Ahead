import { formatCompactNumber } from '../core/FormatNumber';
import { gameState, type GameState } from '../core/GameState';
import { SFX } from '../core/SoundFX';
import {
  getMerchantDiscountPct,
  getMerchantMarketplaceStock,
  purchaseMerchantBulk,
  type MerchantMarketplaceItem,
} from '../data/merchantShop';
import { SPROUT_UI_CSS } from './SproutUiTheme';

export interface MerchantShopModalConfig {
  merchantId: string;
  merchantName: string;
  merchantTitle?: string;
  portraitKey?: string;
  hearts: number;
  secretClaimed: boolean;
  worldSeed: number;
  dayNumber: number;
  state?: GameState;
  onPurchase?: (itemName: string, qty: number, totalCost: number) => void;
  onBackToChat?: () => void;
  onClose?: () => void;
}

export interface BulkQuote {
  quantity: number;
  totalCost: number;
  canAfford: boolean;
  shortfall: number;
  soldOut: boolean;
}

interface TagPalette {
  bg: string;
  color: string;
  border: string;
}

const TAG_PALETTES: Record<string, TagPalette> = {
  supplies: { bg: '#2d6a36', color: '#e8ffec', border: '#1c4722' },
  provisions: { bg: '#9c4e18', color: '#fff5e6', border: '#66300b' },
  materials: { bg: '#465a6e', color: '#eef5fc', border: '#2a3846' },
  'rare find': { bg: '#6b3494', color: '#f7ebff', border: '#451e63' },
};

const DEFAULT_TAG_PALETTE: TagPalette = {
  bg: '#5c3a24',
  color: '#fff6e5',
  border: '#3b2316',
};

const DEFAULT_FEEDBACK = 'Select quantities to buy in bulk — stock refreshes each morning.';

/**
 * Computes a clamped bulk purchase quote for a marketplace item given
 * unit price, requested quantity, player coin balance, and remaining stock.
 */
export function computeBulkQuote(
  unitPrice: number,
  requestedQty: number,
  playerCoins: number,
  remainingStock: number,
): BulkQuote {
  const safeUnitPrice = Number.isFinite(unitPrice) ? Math.max(0, Math.floor(unitPrice)) : 0;
  const safeStock = Number.isFinite(remainingStock) ? Math.max(0, Math.floor(remainingStock)) : 0;
  const safeCoins = Number.isFinite(playerCoins) ? Math.max(0, Math.floor(playerCoins)) : 0;

  if (safeStock <= 0) {
    return {
      quantity: 0,
      totalCost: 0,
      canAfford: false,
      shortfall: 0,
      soldOut: true,
    };
  }

  const rawQty = Number.isFinite(requestedQty) ? Math.floor(requestedQty) : 1;
  const quantity = Math.max(1, Math.min(safeStock, rawQty));
  const totalCost = safeUnitPrice * quantity;
  const canAfford = safeCoins >= totalCost;
  const shortfall = canAfford ? 0 : totalCost - safeCoins;

  return {
    quantity,
    totalCost,
    canAfford,
    shortfall,
    soldOut: false,
  };
}

function getTagPalette(tag: string): TagPalette {
  return TAG_PALETTES[tag.trim().toLowerCase()] ?? DEFAULT_TAG_PALETTE;
}

function clampQtyForStock(qty: number, remainingStock: number): number {
  if (remainingStock <= 0) return 0;
  return Math.max(1, Math.min(remainingStock, Math.floor(qty)));
}

interface CardRefs {
  item: MerchantMarketplaceItem;
  key: string;
  card: HTMLElement;
  stockEl: HTMLElement;
  decBtn: HTMLButtonElement;
  qtyVal: HTMLElement;
  incBtn: HTMLButtonElement;
  quick1Btn: HTMLButtonElement;
  quick5Btn: HTMLButtonElement;
  maxBtn: HTMLButtonElement;
  totalEl: HTMLElement;
  buyBtn: HTMLButtonElement;
}

/**
 * Sprout-UI traveling merchant bulk marketplace modal controller.
 */
export class MerchantShopModalManager {
  private active = false;
  private cfg: MerchantShopModalConfig | null = null;
  private activeState: GameState = gameState;
  private items: MerchantMarketplaceItem[] = [];
  private cardRefs: CardRefs[] = [];
  private selectedQtyByItem = new Map<string, number>();
  private feedbackText = DEFAULT_FEEDBACK;
  private feedbackTone: 'neutral' | 'success' | 'error' = 'neutral';

  private overlay: HTMLElement | null = null;
  private goldValueEl: HTMLElement | null = null;
  private goldPillEl: HTMLElement | null = null;
  private gridEl: HTMLElement | null = null;
  private feedbackEl: HTMLElement | null = null;
  private keyHandler?: (e: KeyboardEvent) => void;
  private stylesInjected = false;

  public isActive(): boolean {
    return this.active;
  }

  private ensureStyles(): void {
    if (this.stylesInjected || typeof document === 'undefined') return;
    this.stylesInjected = true;

    if (
      !document.getElementById('forager-hud-styles') &&
      !document.getElementById('sprout-ui-base-styles')
    ) {
      const baseStyle = document.createElement('style');
      baseStyle.id = 'sprout-ui-base-styles';
      baseStyle.textContent = SPROUT_UI_CSS;
      document.head.appendChild(baseStyle);
    }

    if (document.getElementById('forage-merchant-shop-styles')) return;
    const style = document.createElement('style');
    style.id = 'forage-merchant-shop-styles';
    style.textContent = `
      .mshop-overlay {
        position: fixed;
        inset: 0;
        z-index: 9250;
        background: rgba(12, 8, 5, 0.62);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 12px;
        pointer-events: auto;
        user-select: none;
        box-sizing: border-box;
      }
      .mshop-window {
        width: min(820px, 96vw);
        max-height: min(600px, 90vh);
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px;
        overflow: hidden;
        box-sizing: border-box;
        font-family: 'SproutLandsUI', monospace, sans-serif;
        animation: modalSpringPop 140ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .mshop-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 7px 10px;
        flex-wrap: wrap;
        flex-shrink: 0;
      }
      .mshop-header-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        flex: 1;
      }
      .mshop-portrait-box {
        width: 56px;
        min-width: 56px;
        height: 64px;
        border-style: solid;
        border-image-source: url('assets/sprout_ui/frames/backdrop_c4.png');
        border-image-slice: 8 8 8 8 fill;
        border-image-width: 12px;
        border-width: 6px;
        image-rendering: pixelated;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        box-sizing: border-box;
      }
      .mshop-portrait-canvas {
        width: 38px;
        height: 57px;
        image-rendering: pixelated;
      }
      .mshop-title-col {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }
      .mshop-name-row {
        display: flex;
        align-items: center;
        gap: 7px;
        flex-wrap: wrap;
      }
      .mshop-merchant-name {
        font-family: 'SproutLandsDisplay', 'SproutLandsUI', monospace, sans-serif;
        font-size: 16px;
        font-weight: 800;
        color: #fff6e5;
        letter-spacing: 0.3px;
      }
      .mshop-hearts {
        display: inline-flex;
        align-items: center;
        gap: 1px;
        font-size: 12px;
        line-height: 1;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(20, 12, 7, 0.55);
        border: 1px solid rgba(255, 232, 196, 0.22);
      }
      .mshop-heart-full { color: #ff6b78; }
      .mshop-heart-empty { color: #9c7d63; }
      .mshop-discount-pill {
        font-size: 10px;
        font-weight: 800;
        color: #7ef29d;
        background: #1c4723;
        border: 1px solid #4da85c;
        border-radius: 4px;
        padding: 2px 7px;
        white-space: nowrap;
      }
      .mshop-subtitle {
        font-size: 11px;
        font-weight: 700;
        color: #f2d9b1;
      }
      .mshop-header-right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .mshop-gold-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        border-radius: 5px;
        background: rgba(24, 15, 8, 0.88);
        border: 1px solid #c99d45;
        color: #ffe066;
        font-size: 14px;
        font-weight: 800;
        box-shadow: inset 0 1px 0 rgba(255, 236, 179, 0.18);
        white-space: nowrap;
      }
      .mshop-close-x {
        padding: 2px 9px !important;
        font-size: 13px !important;
        font-weight: 800 !important;
        min-width: 30px;
      }
      .mshop-grid-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 2px 4px;
      }
      .mshop-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 9px;
        align-content: start;
      }
      @media (max-width: 640px) {
        .mshop-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      .mshop-card {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 6px;
        padding: 8px 10px;
        box-sizing: border-box;
        transition: filter 100ms ease, opacity 120ms ease;
      }
      .mshop-card.is-sold-out {
        opacity: 0.72;
        filter: grayscale(0.28);
      }
      .mshop-card-top {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .mshop-icon-frame {
        width: 40px;
        height: 40px;
        background: url('assets/sprout_ui/frames/backdrop_b3.png') no-repeat center / 100% 100%;
        image-rendering: pixelated;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .mshop-card-meta {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .mshop-card-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      .mshop-item-name {
        font-size: 13px;
        font-weight: 800;
        color: #3b2316;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mshop-tag-badge {
        font-size: 9px;
        font-weight: 800;
        padding: 1px 6px;
        border-radius: 4px;
        border: 1px solid transparent;
        text-shadow: none;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .mshop-stock-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        font-size: 11px;
        font-weight: 700;
      }
      .mshop-stock-pill {
        color: #5c3a24;
        font-weight: 700;
      }
      .mshop-sold-badge {
        background: #7c222b;
        color: #ffd8dc;
        border: 1px solid #3d0f14;
        border-radius: 4px;
        padding: 1px 6px;
        font-size: 10px;
        font-weight: 800;
        text-shadow: none;
      }
      .mshop-item-desc {
        font-size: 11px;
        color: #5c3a24;
        line-height: 1.3;
        min-height: 28px;
      }
      .mshop-controls-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        flex-wrap: wrap;
      }
      .mshop-unit-price {
        display: inline-flex;
        align-items: baseline;
        gap: 5px;
        font-size: 12px;
        font-weight: 800;
        color: #3b2316;
      }
      .mshop-base-price {
        font-size: 10px;
        color: #8c6a4d;
        font-weight: 700;
      }
      .mshop-bulk-bar {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        flex-wrap: wrap;
      }
      .mshop-qty-btn {
        padding: 1px 6px !important;
        font-size: 11px !important;
        min-width: 24px;
      }
      .mshop-qty-val {
        min-width: 22px;
        text-align: center;
        font-size: 12px;
        font-weight: 800;
        color: #3b2316;
        padding: 1px 4px;
        background: rgba(59, 35, 22, 0.12);
        border: 1px solid rgba(92, 58, 36, 0.35);
        border-radius: 4px;
      }
      .mshop-quick-btn {
        padding: 1px 6px !important;
        font-size: 10px !important;
      }
      .mshop-action-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding-top: 5px;
        border-top: 1px dashed rgba(92, 58, 36, 0.28);
      }
      .mshop-total-chip {
        font-size: 12px;
        font-weight: 800;
        padding: 3px 8px;
        border-radius: 4px;
        text-shadow: none;
        white-space: nowrap;
      }
      .mshop-total-chip.is-affordable {
        background: #1d3621;
        color: #7ef29d;
        border: 1px solid #459656;
      }
      .mshop-total-chip.is-unaffordable {
        background: #3d181e;
        color: #ff6b78;
        border: 1px solid #a83844;
      }
      .mshop-total-chip.is-sold-out {
        background: rgba(59, 35, 22, 0.14);
        color: #7a5438;
        border: 1px solid rgba(92, 58, 36, 0.28);
      }
      .mshop-buy-btn {
        padding: 2px 11px !important;
        font-size: 11px !important;
        font-weight: 800 !important;
        min-width: 92px;
      }
      .mshop-buy-btn.is-affordable {
        color: #194d20;
        box-shadow: 0 0 0 1px rgba(126, 242, 157, 0.45);
      }
      .mshop-buy-btn.is-unaffordable {
        color: #ff6b78 !important;
        opacity: 0.78 !important;
      }
      .mshop-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 7px 10px;
        flex-wrap: wrap;
        flex-shrink: 0;
      }
      .mshop-feedback {
        font-size: 12px;
        font-weight: 700;
        color: #f2d9b1;
        flex: 1;
        min-width: 180px;
      }
      .mshop-feedback.is-success { color: #7ef29d; }
      .mshop-feedback.is-error { color: #ff8fa0; }
      .mshop-footer-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
    `;
    document.head.appendChild(style);
  }

  public show(cfg: MerchantShopModalConfig): void {
    if (typeof document === 'undefined') return;
    this.close(false);
    this.ensureStyles();

    this.cfg = cfg;
    this.activeState = cfg.state ?? gameState;
    this.active = true;
    this.feedbackText = DEFAULT_FEEDBACK;
    this.feedbackTone = 'neutral';
    this.selectedQtyByItem.clear();

    this.items = getMerchantMarketplaceStock({
      merchantId: cfg.merchantId,
      worldSeed: cfg.worldSeed,
      dayNumber: cfg.dayNumber,
      hearts: cfg.hearts,
      secretClaimed: cfg.secretClaimed,
      state: this.activeState,
    });

    for (const item of this.items) {
      const key = this.getItemKey(item);
      this.selectedQtyByItem.set(key, item.remainingStock > 0 ? 1 : 0);
    }

    const root = document.getElementById('hud-root') ?? document.body;
    const overlay = document.createElement('div');
    overlay.className = 'mshop-overlay hud-interactive';
    overlay.dataset.role = 'merchant-shop-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        SFX.playUiClose();
        this.close(true);
      }
    });

    const panel = document.createElement('div');
    panel.className = 'hud-panel-wood mshop-window';
    panel.dataset.role = 'merchant-shop-window';
    panel.addEventListener('click', (e) => {
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    });

    panel.appendChild(this.buildHeader(cfg));

    const gridScroll = document.createElement('div');
    gridScroll.className = 'sl-scroll mshop-grid-scroll';
    const grid = document.createElement('div');
    grid.className = 'mshop-grid';
    grid.dataset.role = 'shop-grid';
    gridScroll.appendChild(grid);
    panel.appendChild(gridScroll);

    panel.appendChild(this.buildFooter(cfg));

    overlay.appendChild(panel);
    root.appendChild(overlay);

    this.overlay = overlay;
    this.gridEl = grid;
    this.buildGridCards();

    this.keyHandler = (e: KeyboardEvent) => {
      if (!this.active) return;
      if (e.code === 'Escape' || e.key === 'Escape') {
        e.preventDefault();
        SFX.playUiClose();
        this.close(true);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.keyHandler);
    }

    SFX.playUiOpen();
    this.renderDynamicContent();
  }

  private getItemKey(item: MerchantMarketplaceItem): string {
    return item.id || item.itemId;
  }

  private buildHeader(cfg: MerchantShopModalConfig): HTMLElement {
    const header = document.createElement('div');
    header.className = 'hud-panel-inset mshop-header';

    const left = document.createElement('div');
    left.className = 'mshop-header-left';

    if (cfg.portraitKey) {
      left.appendChild(this.buildPortraitFrame(cfg.portraitKey));
    }

    const titleCol = document.createElement('div');
    titleCol.className = 'mshop-title-col';

    const nameRow = document.createElement('div');
    nameRow.className = 'mshop-name-row';

    const nameEl = document.createElement('div');
    nameEl.className = 'mshop-merchant-name';
    nameEl.dataset.role = 'shop-merchant-name';
    nameEl.textContent = cfg.merchantName;
    nameRow.appendChild(nameEl);

    const heartsEl = document.createElement('div');
    heartsEl.className = 'mshop-hearts';
    heartsEl.dataset.role = 'shop-hearts';
    const filledHearts = Math.max(0, Math.min(5, Math.round(cfg.hearts)));
    for (let i = 0; i < 5; i += 1) {
      const span = document.createElement('span');
      const isFull = i < filledHearts;
      span.className = isFull ? 'mshop-heart-full' : 'mshop-heart-empty';
      span.textContent = isFull ? '♥' : '♡';
      heartsEl.appendChild(span);
    }
    heartsEl.setAttribute('aria-label', `${filledHearts} of 5 hearts`);
    nameRow.appendChild(heartsEl);

    const discountPct =
      this.items[0]?.discountPct ?? getMerchantDiscountPct(cfg.hearts, cfg.secretClaimed);
    if (discountPct > 0) {
      const discEl = document.createElement('span');
      discEl.className = 'mshop-discount-pill';
      discEl.dataset.role = 'shop-discount-pill';
      discEl.textContent = `-${discountPct}% Friend Discount`;
      nameRow.appendChild(discEl);
    }

    const subEl = document.createElement('div');
    subEl.className = 'mshop-subtitle';
    subEl.dataset.role = 'shop-subtitle';
    subEl.textContent = cfg.merchantTitle
      ? `${cfg.merchantTitle} • Traveling Marketplace`
      : 'Traveling Marketplace';

    titleCol.appendChild(nameRow);
    titleCol.appendChild(subEl);
    left.appendChild(titleCol);

    const right = document.createElement('div');
    right.className = 'mshop-header-right';

    const goldPill = document.createElement('div');
    goldPill.className = 'mshop-gold-pill';
    goldPill.dataset.role = 'shop-player-gold';

    const coinIcon = document.createElement('img');
    coinIcon.src = 'assets/sprout_ui/vitals/coin_sm_1.png';
    coinIcon.alt = 'Gold';
    coinIcon.className = 'px-icon';
    coinIcon.style.width = '16px';
    coinIcon.style.height = '16px';
    goldPill.appendChild(coinIcon);

    const goldVal = document.createElement('span');
    goldVal.dataset.role = 'shop-gold-value';
    goldPill.appendChild(goldVal);
    right.appendChild(goldPill);

    const closeX = document.createElement('button');
    closeX.type = 'button';
    closeX.className = 'hud-btn danger mshop-close-x';
    closeX.dataset.role = 'shop-close-x';
    closeX.textContent = '✕';
    closeX.setAttribute('aria-label', 'Close');
    closeX.setAttribute('title', 'Close [Esc]');
    closeX.onclick = () => {
      SFX.playUiClose();
      this.close(true);
    };
    right.appendChild(closeX);

    this.goldPillEl = goldPill;
    this.goldValueEl = goldVal;

    header.appendChild(left);
    header.appendChild(right);
    return header;
  }

  private buildPortraitFrame(portraitKey: string): HTMLElement {
    const portBox = document.createElement('div');
    portBox.className = 'mshop-portrait-box';

    const canvas = document.createElement('canvas');
    canvas.className = 'mshop-portrait-canvas';
    canvas.width = 48;
    canvas.height = 72;
    portBox.appendChild(canvas);

    if (typeof Image !== 'undefined') {
      const img = new Image();
      img.src = `assets/${portraitKey}.png`;
      img.onload = () => {
        const ctx = canvas.getContext?.('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        const fw = img.width >= 64 && img.height >= 96 ? Math.floor(img.width / 4) : img.width;
        const fh = img.width >= 64 && img.height >= 96 ? Math.floor(img.height / 4) : img.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, fw, fh, 0, 0, canvas.width, canvas.height);
      };
      img.onerror = () => {
        portBox.style.display = 'none';
      };
    }

    return portBox;
  }

  private buildFooter(cfg: MerchantShopModalConfig): HTMLElement {
    const footer = document.createElement('div');
    footer.className = 'hud-panel-inset mshop-footer';

    const feedbackEl = document.createElement('div');
    feedbackEl.className = 'mshop-feedback';
    feedbackEl.dataset.role = 'shop-feedback';
    footer.appendChild(feedbackEl);
    this.feedbackEl = feedbackEl;

    const actions = document.createElement('div');
    actions.className = 'mshop-footer-actions';

    if (cfg.onBackToChat) {
      const backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'hud-btn tan';
      backBtn.dataset.role = 'shop-back-to-chat';
      backBtn.textContent = 'Back to Chat';
      backBtn.onclick = () => {
        const cb = this.cfg?.onBackToChat;
        SFX.playUiClick();
        this.close(false);
        cb?.();
      };
      actions.appendChild(backBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'hud-btn';
    closeBtn.dataset.role = 'shop-close-btn';
    closeBtn.textContent = 'Close [Esc]';
    closeBtn.onclick = () => {
      SFX.playUiClose();
      this.close(true);
    };
    actions.appendChild(closeBtn);

    footer.appendChild(actions);
    return footer;
  }

  private buildGridCards(): void {
    if (!this.gridEl) return;
    this.gridEl.innerHTML = '';
    this.cardRefs = [];

    const frag = document.createDocumentFragment();
    for (const item of this.items) {
      const refs = this.createItemCard(item);
      this.cardRefs.push(refs);
      frag.appendChild(refs.card);
    }
    this.gridEl.appendChild(frag);
  }

  private renderDynamicContent(): void {
    if (!this.active || !this.cfg) return;

    const coins = Math.max(0, Math.floor(this.activeState.coins));
    if (this.goldValueEl) {
      this.goldValueEl.textContent = `${formatCompactNumber(coins)}g`;
    }
    if (this.goldPillEl) {
      this.goldPillEl.dataset.coins = String(coins);
      this.goldPillEl.setAttribute('title', `${coins} Gold Coins`);
    }

    if (this.feedbackEl) {
      this.feedbackEl.textContent = this.feedbackText;
      this.feedbackEl.className =
        this.feedbackTone === 'success'
          ? 'mshop-feedback is-success'
          : this.feedbackTone === 'error'
            ? 'mshop-feedback is-error'
            : 'mshop-feedback';
    }

    for (const refs of this.cardRefs) {
      this.updateItemCard(refs, coins);
    }
  }

  private createItemCard(item: MerchantMarketplaceItem): CardRefs {
    const key = this.getItemKey(item);
    const card = document.createElement('div');
    card.className = 'hud-dock-light mshop-card';
    card.dataset.shopItem = item.itemId;

    // Top section: icon + title/tag + stock
    const top = document.createElement('div');
    top.className = 'mshop-card-top';

    const iconFrame = document.createElement('div');
    iconFrame.className = 'mshop-icon-frame';
    if (item.iconPath) {
      const img = document.createElement('img');
      img.src = item.iconPath;
      img.alt = item.name;
      img.className = 'px-icon';
      img.style.width = '32px';
      img.style.height = '32px';
      img.style.imageRendering = 'pixelated';
      iconFrame.appendChild(img);
    }
    top.appendChild(iconFrame);

    const meta = document.createElement('div');
    meta.className = 'mshop-card-meta';

    const titleRow = document.createElement('div');
    titleRow.className = 'mshop-card-title-row';

    const nameEl = document.createElement('div');
    nameEl.className = 'mshop-item-name';
    nameEl.dataset.role = 'shop-item-name';
    nameEl.textContent = item.name;
    titleRow.appendChild(nameEl);

    const tagEl = document.createElement('span');
    tagEl.className = 'mshop-tag-badge';
    tagEl.dataset.role = 'shop-item-tag';
    const pal = getTagPalette(item.tag);
    tagEl.textContent = item.tag;
    tagEl.style.background = pal.bg;
    tagEl.style.color = pal.color;
    tagEl.style.borderColor = pal.border;
    titleRow.appendChild(tagEl);

    const stockRow = document.createElement('div');
    stockRow.className = 'mshop-stock-row';

    const stockEl = document.createElement('span');
    stockEl.dataset.role = 'shop-item-stock';
    stockRow.appendChild(stockEl);

    meta.appendChild(titleRow);
    meta.appendChild(stockRow);
    top.appendChild(meta);
    card.appendChild(top);

    // Description
    const descEl = document.createElement('div');
    descEl.className = 'mshop-item-desc';
    descEl.dataset.role = 'shop-item-desc';
    descEl.textContent = item.description;
    card.appendChild(descEl);

    // Unit price + bulk controls
    const controlsRow = document.createElement('div');
    controlsRow.className = 'mshop-controls-row';

    const unitPriceEl = document.createElement('div');
    unitPriceEl.className = 'mshop-unit-price';
    unitPriceEl.dataset.role = 'shop-unit-price';

    const finalPriceSpan = document.createElement('span');
    finalPriceSpan.textContent = `${item.unitPrice}g ea`;
    unitPriceEl.appendChild(finalPriceSpan);

    if (item.discountPct > 0 && item.baseUnitPrice > item.unitPrice) {
      const baseStrike = document.createElement('s');
      baseStrike.className = 'mshop-base-price';
      baseStrike.textContent = `${item.baseUnitPrice}g`;
      unitPriceEl.appendChild(baseStrike);
    }
    controlsRow.appendChild(unitPriceEl);

    const bulkBar = document.createElement('div');
    bulkBar.className = 'mshop-bulk-bar';

    const setQty = (nextQty: number) => {
      if (item.remainingStock <= 0) return;
      SFX.playUiClick();
      this.selectedQtyByItem.set(key, clampQtyForStock(nextQty, item.remainingStock));
      this.renderDynamicContent();
    };

    const decBtn = document.createElement('button');
    decBtn.type = 'button';
    decBtn.className = 'hud-btn mshop-qty-btn';
    decBtn.dataset.qtyDec = item.itemId;
    decBtn.textContent = '−';
    decBtn.onclick = () => setQty((this.selectedQtyByItem.get(key) ?? 1) - 1);

    const qtyVal = document.createElement('span');
    qtyVal.className = 'mshop-qty-val';
    qtyVal.dataset.qtyVal = item.itemId;

    const incBtn = document.createElement('button');
    incBtn.type = 'button';
    incBtn.className = 'hud-btn mshop-qty-btn';
    incBtn.dataset.qtyInc = item.itemId;
    incBtn.textContent = '+';
    incBtn.onclick = () => setQty((this.selectedQtyByItem.get(key) ?? 1) + 1);

    const quick1Btn = document.createElement('button');
    quick1Btn.type = 'button';
    quick1Btn.className = 'hud-btn mshop-quick-btn';
    quick1Btn.dataset.qtySet = '1';
    quick1Btn.textContent = '×1';
    quick1Btn.onclick = () => setQty(1);

    const quick5Btn = document.createElement('button');
    quick5Btn.type = 'button';
    quick5Btn.className = 'hud-btn mshop-quick-btn';
    quick5Btn.dataset.qtySet = '5';
    quick5Btn.textContent = '×5';
    quick5Btn.onclick = () => setQty(5);

    const maxBtn = document.createElement('button');
    maxBtn.type = 'button';
    maxBtn.className = 'hud-btn gold mshop-quick-btn';
    maxBtn.dataset.qtyMax = item.itemId;
    maxBtn.textContent = 'Max';
    maxBtn.onclick = () => setQty(item.remainingStock);

    bulkBar.appendChild(decBtn);
    bulkBar.appendChild(qtyVal);
    bulkBar.appendChild(incBtn);
    bulkBar.appendChild(quick1Btn);
    bulkBar.appendChild(quick5Btn);
    bulkBar.appendChild(maxBtn);
    controlsRow.appendChild(bulkBar);
    card.appendChild(controlsRow);

    // Total cost & Buy action
    const actionRow = document.createElement('div');
    actionRow.className = 'mshop-action-row';

    const totalEl = document.createElement('div');
    totalEl.dataset.role = 'shop-item-total';
    totalEl.dataset.totalCost = item.itemId;
    actionRow.appendChild(totalEl);

    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.dataset.buyItem = item.itemId;
    buyBtn.onclick = () => this.handlePurchase(item);
    actionRow.appendChild(buyBtn);
    card.appendChild(actionRow);

    return {
      item,
      key,
      card,
      stockEl,
      decBtn,
      qtyVal,
      incBtn,
      quick1Btn,
      quick5Btn,
      maxBtn,
      totalEl,
      buyBtn,
    };
  }

  private updateItemCard(refs: CardRefs, playerCoins: number): void {
    const { item, key } = refs;
    const currentQty = this.selectedQtyByItem.get(key) ?? (item.remainingStock > 0 ? 1 : 0);
    const quote = computeBulkQuote(item.unitPrice, currentQty, playerCoins, item.remainingStock);
    this.selectedQtyByItem.set(key, quote.soldOut ? 0 : quote.quantity);

    const affordableAttr = quote.canAfford && !quote.soldOut ? 'true' : 'false';
    const stateClass = quote.soldOut
      ? 'is-sold-out'
      : quote.canAfford
        ? 'is-affordable'
        : 'is-unaffordable';

    refs.card.className = `hud-dock-light mshop-card ${stateClass}`;
    refs.card.dataset.affordable = affordableAttr;
    refs.card.dataset.soldOut = quote.soldOut ? 'true' : 'false';

    if (quote.soldOut) {
      refs.stockEl.className = 'mshop-sold-badge';
      refs.stockEl.textContent = 'SOLD OUT';
    } else {
      refs.stockEl.className = 'mshop-stock-pill';
      refs.stockEl.textContent = `Stock: ${item.remainingStock}/${item.maxStock}`;
    }

    refs.qtyVal.textContent = String(quote.soldOut ? 0 : quote.quantity);
    refs.decBtn.disabled = quote.soldOut || quote.quantity <= 1;
    refs.incBtn.disabled = quote.soldOut || quote.quantity >= item.remainingStock;
    refs.quick1Btn.disabled = quote.soldOut;
    refs.quick5Btn.disabled = quote.soldOut;
    refs.maxBtn.disabled = quote.soldOut;

    refs.totalEl.className = `mshop-total-chip ${stateClass}`;
    refs.totalEl.dataset.affordable = affordableAttr;
    refs.totalEl.textContent = quote.soldOut ? 'Sold Out' : `Total: ${quote.totalCost}g`;

    refs.buyBtn.dataset.affordable = affordableAttr;
    if (quote.soldOut) {
      refs.buyBtn.className = 'hud-btn mshop-buy-btn is-sold-out';
      refs.buyBtn.textContent = 'Sold Out';
      refs.buyBtn.disabled = true;
    } else if (quote.canAfford) {
      refs.buyBtn.className = 'hud-btn primary mshop-buy-btn is-affordable';
      refs.buyBtn.textContent = `Buy ×${quote.quantity}`;
      refs.buyBtn.disabled = false;
    } else {
      refs.buyBtn.className = 'hud-btn danger mshop-buy-btn is-unaffordable';
      refs.buyBtn.textContent = `Need ${quote.shortfall}g`;
      refs.buyBtn.disabled = true;
    }
  }

  private handlePurchase(item: MerchantMarketplaceItem): void {
    if (!this.active || !this.cfg) return;

    const key = this.getItemKey(item);
    const requested = this.selectedQtyByItem.get(key) ?? 1;
    const quote = computeBulkQuote(
      item.unitPrice,
      requested,
      this.activeState.coins,
      item.remainingStock,
    );

    if (quote.soldOut || !quote.canAfford) {
      SFX.playUiError();
      this.feedbackTone = 'error';
      this.feedbackText = quote.soldOut
        ? `${item.name} is sold out for today.`
        : `Not enough gold for ${item.name} — need ${quote.shortfall}g more.`;
      this.renderDynamicContent();
      return;
    }

    const res = purchaseMerchantBulk(
      this.activeState,
      item,
      quote.quantity,
      this.cfg.merchantId,
      this.cfg.dayNumber,
    );

    if (res.ok) {
      item.remainingStock = Math.max(0, res.remainingStock);
      this.selectedQtyByItem.set(key, clampQtyForStock(quote.quantity, item.remainingStock));
      SFX.playCoin();
      this.feedbackTone = 'success';
      this.feedbackText = `Purchased ${res.quantityBought}× ${item.name} for ${res.totalCost}g!`;
      this.cfg.onPurchase?.(item.name, res.quantityBought, res.totalCost);
      this.renderDynamicContent();
      return;
    }

    SFX.playUiError();
    this.feedbackTone = 'error';
    if (res.reason === 'bag_full') {
      this.feedbackText = `Your bag is full! Make space before buying ${item.name}.`;
    } else if (res.reason === 'out_of_stock') {
      item.remainingStock = Math.max(0, res.remainingStock);
      this.selectedQtyByItem.set(key, clampQtyForStock(1, item.remainingStock));
      this.feedbackText = `${item.name} is sold out for today.`;
    } else if (res.reason === 'insufficient_coins') {
      this.feedbackText = `Not enough gold for ${item.name} — need ${quote.shortfall}g more.`;
    } else {
      this.feedbackText = `Could not purchase ${item.name}.`;
    }
    this.renderDynamicContent();
  }

  public close(invokeOnClose = true): void {
    if (this.keyHandler && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = undefined;
    }

    const cb = invokeOnClose ? this.cfg?.onClose : undefined;
    this.overlay?.remove();
    this.overlay = null;
    this.goldValueEl = null;
    this.goldPillEl = null;
    this.gridEl = null;
    this.feedbackEl = null;
    this.items = [];
    this.cardRefs = [];
    this.selectedQtyByItem.clear();
    this.feedbackText = DEFAULT_FEEDBACK;
    this.feedbackTone = 'neutral';
    this.cfg = null;
    this.active = false;
    cb?.();
  }
}

export const merchantShopModal = new MerchantShopModalManager();
