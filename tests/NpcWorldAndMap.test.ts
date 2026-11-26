import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class Scene {},
    BlendModes: { ADD: 1, MULTIPLY: 2 },
    GameObjects: {
      Container: class Container {},
    },
    Renderer: {
      WebGL: {
        Pipelines: {
          MultiPipeline: class MultiPipeline {},
          PostFXPipeline: class PostFXPipeline {},
        },
        WebGLRenderer: class WebGLRenderer {},
      },
    },
    Math: {
      Vector2: class Vector2 {
        public x = 0;
        public y = 0;
        constructor(x = 0, y = 0) {
          this.x = x;
          this.y = y;
        }
      },
      Clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)),
      Between: (min: number) => min,
      Linear: (a: number, b: number, t: number) => a + (b - a) * t,
    },
  },
}));

import { gameState } from '../src/core/GameState';
import { findOffCameraSpawnTile } from '../src/scenes/OverworldScene';
import {
  HudController,
  buildMapIslandNpcPinsHtml,
  buildTownsfolkRosterHtml,
  getMapNpcPinsForIsland,
  groupNpcMarkersByIsland,
  type MapNpcMarker,
  type NpcKnownGiftsMap,
} from '../src/ui/HudController';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

class MiniClassList {
  private tokens = new Set<string>();
  add(...items: string[]): void {
    items.forEach((i) => this.tokens.add(i));
  }
  remove(...items: string[]): void {
    items.forEach((i) => this.tokens.delete(i));
  }
  contains(item: string): boolean {
    return this.tokens.has(item);
  }
}

class MiniElement {
  public tagName: string;
  public id = '';
  public className = '';
  public style: Record<string, string> = {};
  public dataset: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  public children: MiniElement[] = [];
  public parentElement: MiniElement | null = null;
  public classList = new MiniClassList();
  public innerHTML = '';
  public textContent = '';
  public onclick: ((e?: unknown) => void) | null = null;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  appendChild<T extends MiniElement>(child: T): T {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...nodes: MiniElement[]): void {
    for (const n of nodes) {
      this.appendChild(n);
    }
  }

  remove(): void {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
    this.parentElement = null;
  }

  setAttribute(name: string, val: string): void {
    this.attributes[name] = val;
  }

  addEventListener(): void {}
  removeEventListener(): void {}

  getBoundingClientRect() {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  querySelectorAll(): MiniElement[] {
    return [];
  }

  querySelector(): MiniElement | null {
    return null;
  }
}

function installHudDomHarness(): {
  hudRoot: MiniElement;
  cleanup: () => void;
} {
  const prevDoc = (globalThis as Record<string, unknown>).document;
  const prevWin = (globalThis as Record<string, unknown>).window;
  const prevRaf = (globalThis as Record<string, unknown>).requestAnimationFrame;

  const head = new MiniElement('head');
  const body = new MiniElement('body');
  const hudRoot = new MiniElement('div');
  hudRoot.id = 'hud-root';
  body.appendChild(hudRoot);

  const findById = (root: MiniElement, id: string): MiniElement | null => {
    if (root.id === id) return root;
    for (const c of root.children) {
      const found = findById(c, id);
      if (found) return found;
    }
    return null;
  };

  const doc = {
    head,
    body,
    createElement: (tag: string) => new MiniElement(tag),
    getElementById: (id: string) => findById(body, id),
    querySelectorAll: () => [],
  };

  const win = {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
  };

  (globalThis as Record<string, unknown>).document = doc;
  (globalThis as Record<string, unknown>).window = win;
  (globalThis as Record<string, unknown>).requestAnimationFrame = () => 1;

  return {
    hudRoot,
    cleanup: () => {
      (globalThis as Record<string, unknown>).document = prevDoc;
      (globalThis as Record<string, unknown>).window = prevWin;
      (globalThis as Record<string, unknown>).requestAnimationFrame = prevRaf;
    },
  };
}

describe('findOffCameraSpawnTile', () => {
  const viewRect = { left: 160, right: 480, top: 160, bottom: 400 }; // tile 10..30 x 10..25

  it('always picks an off-camera tile outside expanded viewRect when one exists', () => {
    const candidates = [
      { tx: 15, ty: 15 }, // clearly inside camera
      { tx: 31, ty: 15 }, // outside viewRect (480) at 504px, but INSIDE marginPx=48 (<= 528)!
      { tx: 34, ty: 15 }, // outside expanded viewRect (552px > 528px)
      { tx: 50, ty: 15 }, // farther outside expanded viewRect
    ];

    const picked = findOffCameraSpawnTile(candidates, viewRect, 16, 48);
    expect(picked).toEqual({ tx: 34, ty: 15 });
    const wx = (picked.tx + 0.5) * 16;
    const wy = (picked.ty + 0.5) * 16;
    const outside =
      wx < viewRect.left - 48 ||
      wx > viewRect.right + 48 ||
      wy < viewRect.top - 48 ||
      wy > viewRect.bottom + 48;
    expect(outside).toBe(true);
  });

  it('prefers the closest off-camera tile to targetTile when targetTile is provided', () => {
    const candidates = [
      { tx: 18, ty: 18 }, // on-camera
      { tx: 2, ty: 15 }, // off-camera left (wx = 40 < 112)
      { tx: 34, ty: 15 }, // off-camera right (wx = 552 > 528)
    ];

    const pickedNearRight = findOffCameraSpawnTile(candidates, viewRect, 16, 48, {
      tx: 32,
      ty: 15,
    });
    expect(pickedNearRight).toEqual({ tx: 34, ty: 15 });

    const pickedNearLeft = findOffCameraSpawnTile(candidates, viewRect, 16, 48, {
      tx: 4,
      ty: 15,
    });
    expect(pickedNearLeft).toEqual({ tx: 2, ty: 15 });
  });

  it('falls back to the candidate farthest from viewport center when all candidates are visible', () => {
    // Viewport center is (320, 280) => tile (20, 17.5)
    const strictlyVisible = [
      { tx: 20, ty: 17 },
      { tx: 24, ty: 18 },
      { tx: 10, ty: 10 }, // center (168, 168) -> dist from (320,280) = hypot(-152,-112) ≈ 188.8px
    ];

    expect(findOffCameraSpawnTile(strictlyVisible, viewRect, 16, 48)).toEqual({ tx: 10, ty: 10 });

    const allInExpandedMargin = [
      { tx: 20, ty: 17 },
      { tx: 11, ty: 11 }, // center (184, 184) -> dist ≈ 166.4px
      { tx: 32, ty: 18 }, // center (520, 296) -> still inside expanded right=528, dist ≈ 200.6px
    ];

    expect(findOffCameraSpawnTile(allInExpandedMargin, viewRect, 16, 48)).toEqual({
      tx: 32,
      ty: 18,
    });
  });

  it('handles empty candidate lists safely', () => {
    expect(findOffCameraSpawnTile([], viewRect, 16, 48)).toEqual({ tx: 0, ty: 0 });
    expect(findOffCameraSpawnTile([], viewRect, 16, 48, { tx: 9, ty: 12 })).toEqual({
      tx: 9,
      ty: 12,
    });
  });
});

describe('HudController map NPC markers & friendship roster helpers', () => {
  const sampleMarkers: MapNpcMarker[] = [
    {
      id: 'farmer',
      name: 'Farmer Bram',
      title: 'Homestead Grower',
      category: 'anchor',
      gx: 2,
      gy: 1,
      hearts: 3,
      moodLabel: 'Warm',
      hasQuestOffer: true,
      hasQuestTurnIn: false,
    },
    {
      id: 'family_farmer',
      name: 'Pip',
      title: 'Sprout Tender',
      category: 'family',
      gx: 2,
      gy: 1,
      hearts: 4,
      moodLabel: 'Friendly',
      hasQuestOffer: false,
      hasQuestTurnIn: true,
    },
    {
      id: 'family_fisherman',
      name: 'Maren',
      title: 'Harbor Cook',
      category: 'family',
      gx: 2,
      gy: 3,
      hearts: 1,
      moodLabel: 'Neutral',
      hasQuestOffer: false,
      hasQuestTurnIn: false,
    },
    {
      id: 'merchant_1',
      name: 'Alden',
      title: 'Guild Factor',
      category: 'merchant',
      gx: 2,
      gy: 2,
      hearts: 2,
      moodLabel: 'Curious',
      hasQuestOffer: false,
      hasQuestTurnIn: false,
    },
    {
      id: 'vagabond_1',
      name: 'Kestrel',
      title: 'Frostline Scout',
      category: 'vagabond',
      gx: 2,
      gy: 2,
      hearts: 5,
      moodLabel: 'Warm',
      hasQuestOffer: true,
      hasQuestTurnIn: false,
    },
  ];

  it('groups markers by island and filters important pins with badges', () => {
    const grouped = groupNpcMarkersByIsland(sampleMarkers);
    expect(grouped.get('2,1')?.map((m) => m.id)).toEqual(['farmer', 'family_farmer']);
    expect(grouped.get('2,2')?.map((m) => m.id)).toEqual(['merchant_1', 'vagabond_1']);
    expect(grouped.get('2,3')?.map((m) => m.id)).toEqual(['family_fisherman']);

    // Family NPCs without a quest are omitted from compact map island pins; family with quest IS shown
    const pierPins = getMapNpcPinsForIsland(grouped.get('2,3') ?? []);
    expect(pierPins).toEqual([]);

    const homesteadHtml = buildMapIslandNpcPinsHtml(grouped.get('2,1') ?? []);
    expect(homesteadHtml).toContain('🏠 Farmer Bram');
    expect(homesteadHtml).toContain('>!<');
    expect(homesteadHtml).toContain('👤 Pip');
    expect(homesteadHtml).toContain('>?<');

    const originHtml = buildMapIslandNpcPinsHtml(grouped.get('2,2') ?? []);
    expect(originHtml).toContain('🛒 Alden');
    expect(originHtml).toContain('🧭 Kestrel');
    expect(originHtml).toContain('>!<');
  });

  it('renders Townsfolk & Friendships roster cards with hearts, mood pills, island names, and known gifts', () => {
    const html = buildTownsfolkRosterHtml(sampleMarkers, (npcId): NpcKnownGiftsMap => {
      if (npcId === 'farmer') {
        return {
          sunflower: 'loved',
          berries: 'liked',
          bone: 'disliked',
        };
      }
      return {};
    });

    expect(html).toContain('Farmer Bram');
    expect(html).toContain('Homestead Grower');
    expect(html).toContain('Meadow Homestead');
    expect(html).toContain('♥♥♥');
    expect(html).toContain('(3/5)');
    expect(html).toContain('Warm');
    expect(html).toContain('Golden Sunflower');
    expect(html).toContain('Wild Berries');
    expect(html).toContain('Ancient Bone');

    expect(html).toContain('Alden');
    expect(html).toContain('Emerald Origin');
    expect(html).toContain('Kestrel');
    expect(html).toContain('♥♥♥♥♥');
    expect(html).toContain('Gifts: none discovered yet');

    expect(buildTownsfolkRosterHtml([])).toContain('No townsfolk discovered yet.');
  });

  describe('HudController live modal rendering', () => {
    let dom: ReturnType<typeof installHudDomHarness>;
    let hud: HudController | null = null;

    beforeEach(() => {
      (globalThis as unknown as { localStorage: Storage }).localStorage = createMemoryStorage();
      gameState.reset('Beastmaster');
      gameState.ownedIslands.add('2,1');
      dom = installHudDomHarness();
    });

    afterEach(() => {
      hud?.destroy();
      hud = null;
      dom.cleanup();
      vi.restoreAllMocks();
    });

    it('renders map NPC pins + legend in Map tab and Townsfolk & Friendships roster in Progress tab', () => {
      vi.spyOn(gameState, 'getNpcKnownGifts').mockImplementation((npcId): NpcKnownGiftsMap => {
        if (npcId === 'farmer') {
          return { sunflower: 'loved', bone: 'disliked' };
        }
        return {};
      });

      hud = new HudController({
        onBuyIsland: () => {},
        onSelectBuild: () => {},
        onUseHotbarItem: () => {},
        onSave: () => {},
        getMapNpcMarkers: () => sampleMarkers,
      });

      hud.toggleModal('map');
      const mapHtml = dom.hudRoot.children.map((c) => c.innerHTML).join('\n');
      expect(mapHtml).toContain('🏠 Townsfolk');
      expect(mapHtml).toContain('🛒 Traveling Merchant');
      expect(mapHtml).toContain('🧭 Vagabond');
      expect(mapHtml).toContain('Farmer Bram');
      expect(mapHtml).toContain('🛒 Alden');
      expect(mapHtml).toContain('🧭 Kestrel');
      expect(mapHtml).toContain('👤 Pip');
      expect(mapHtml).not.toContain('data-map-npc="family_fisherman"');

      hud.toggleModal('progress');
      const progressHtml = dom.hudRoot.children.map((c) => c.innerHTML).join('\n');
      expect(progressHtml).toContain('Townsfolk &amp; Friendships (5)');
      expect(progressHtml).toContain('Farmer Bram');
      expect(progressHtml).toContain('Meadow Homestead');
      expect(progressHtml).toContain('Golden Sunflower');
      expect(progressHtml).toContain('Ancient Bone');
      expect(progressHtml).toContain('Maren');
    });
  });
});
