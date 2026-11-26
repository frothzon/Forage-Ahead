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

import { GameState, gameState, type HeroClassId } from '../src/core/GameState';
import {
  COMBAT_XP_MULT,
  getCraftXpReward,
  getVoidSpireXpMultiplier,
} from '../src/data/economy';
import { getSkillsForClass } from '../src/data/skills';
import { HudController } from '../src/ui/HudController';

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

describe('Pacing stat hooks, XP scaling & Progress UI', () => {
  describe('HudController Progress tab class-filtered skill cap', () => {
    let dom: ReturnType<typeof installHudDomHarness>;
    let hud: HudController | null = null;

    beforeEach(() => {
      (globalThis as unknown as { localStorage: Storage }).localStorage = createMemoryStorage();
      gameState.reset('Beastmaster');
      dom = installHudDomHarness();
    });

    afterEach(() => {
      hud?.destroy();
      hud = null;
      dom.cleanup();
      vi.restoreAllMocks();
    });

    it('displays class-filtered Skills Unlocked (/ 48) instead of global (/ 84)', () => {
      hud = new HudController({
        onBuyIsland: () => {},
        onSelectBuild: () => {},
        onUseHotbarItem: () => {},
        onSave: () => {},
      });

      const classes: HeroClassId[] = ['Beastmaster', 'Gladiator', 'Sorcerer', 'Swashbuckler'];
      for (const heroClass of classes) {
        gameState.reset(heroClass);
        const classSkills = getSkillsForClass(heroClass);
        expect(classSkills).toHaveLength(48);

        hud.toggleModal('progress');
        const initialHtml = dom.hudRoot.children.map((c) => c.innerHTML).join('\n');
        expect(initialHtml).toContain('Skills Unlocked');
        expect(initialHtml).toContain('0 / 48 (0%)');
        expect(initialHtml).not.toContain('/ 84');

        // Unlock one neutral skill and one class-specific skill
        gameState.skillPoints = 2;
        expect(gameState.unlockSkill('foraging_gather')).toBe(true);
        const classSpecific = classSkills.find((s) => s.heroClass === heroClass && !s.requires)!;
        expect(gameState.unlockSkill(classSpecific.id)).toBe(true);

        // Switch away and back to re-render progress tab cleanly
        hud.toggleModal('progress');
        hud.toggleModal('progress');
        const updatedHtml = dom.hudRoot.children.map((c) => c.innerHTML).join('\n');
        expect(updatedHtml).toContain('2 / 48 (4%)');
        expect(updatedHtml).not.toContain('/ 84');
        hud.closeModal();
      }
    });

    it('renders Expedition Records values recorded via GameState.recordStat', () => {
      gameState.recordStat('fishCaught', 4);
      gameState.recordStat('itemsCrafted', 7);
      gameState.recordStat('structuresBuilt', 3);

      hud = new HudController({
        onBuyIsland: () => {},
        onSelectBuild: () => {},
        onUseHotbarItem: () => {},
        onSave: () => {},
      });
      hud.toggleModal('progress');

      const progressHtml = dom.hudRoot.children.map((c) => c.innerHTML).join('\n');
      expect(progressHtml).toMatch(/Fish Caught<\/span>\s*<strong[^>]*>4<\/strong>/);
      expect(progressHtml).toMatch(/Items Crafted<\/span>\s*<strong[^>]*>7<\/strong>/);
      expect(progressHtml).toMatch(/Structures Built<\/span>\s*<strong[^>]*>3<\/strong>/);
    });
  });

  describe('Economy XP multipliers & crafting XP scaling', () => {
    it('exports simulation-calibrated COMBAT_XP_MULT (1.20x)', () => {
      expect(COMBAT_XP_MULT).toBe(1.2);
    });

    it('scales Void Spire XP multiplier smoothly across floors 1..20 up to 1.50x', () => {
      expect(getVoidSpireXpMultiplier(-3)).toBe(1);
      expect(getVoidSpireXpMultiplier(0)).toBe(1);
      expect(getVoidSpireXpMultiplier(1)).toBeCloseTo(1.025, 6);
      expect(getVoidSpireXpMultiplier(10)).toBeCloseTo(1.25, 6);
      expect(getVoidSpireXpMultiplier(20)).toBeCloseTo(1.5, 6);

      let prev = getVoidSpireXpMultiplier(0);
      for (let floor = 1; floor <= 20; floor++) {
        const mult = getVoidSpireXpMultiplier(floor);
        expect(mult).toBeGreaterThan(prev);
        expect(mult).toBeLessThanOrEqual(1.5);
        prev = mult;
      }
    });

    it('scales craft XP rewards monotonically within [12, 28]', () => {
      const inputs = [0, 1, 2, 3, 4, 6, 10, 20, 50, 500];
      let prev = -Infinity;
      for (const total of inputs) {
        const xp = getCraftXpReward(total);
        expect(xp).toBeGreaterThanOrEqual(12);
        expect(xp).toBeLessThanOrEqual(28);
        expect(xp).toBeGreaterThanOrEqual(prev);
        prev = xp;
      }
    });
  });

  describe('GameState.recordStat Expedition Record hooks', () => {
    it('increments itemsCrafted, structuresBuilt, and fishCaught accurately and ignores invalid amounts', () => {
      (globalThis as unknown as { localStorage: Storage }).localStorage = createMemoryStorage();
      const gs = new GameState();
      gs.reset('Swashbuckler');

      expect(gs.stats.itemsCrafted).toBe(0);
      expect(gs.stats.structuresBuilt).toBe(0);
      expect(gs.stats.fishCaught).toBe(0);

      gs.recordStat('itemsCrafted', 1);
      gs.recordStat('itemsCrafted', 4);
      gs.recordStat('structuresBuilt', 1);
      gs.recordStat('structuresBuilt', 2);
      gs.recordStat('fishCaught', 1);
      gs.recordStat('fishCaught', 5);

      // Invalid / non-positive values must be ignored
      gs.recordStat('itemsCrafted', 0);
      gs.recordStat('structuresBuilt', -3);
      gs.recordStat('fishCaught', Number.NaN);
      gs.recordStat('fishCaught', Number.POSITIVE_INFINITY);

      expect(gs.stats.itemsCrafted).toBe(5);
      expect(gs.stats.structuresBuilt).toBe(3);
      expect(gs.stats.fishCaught).toBe(6);
    });
  });
});
