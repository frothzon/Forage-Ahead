import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_MENU_TABS, GameState, gameState } from '../src/core/GameState';
import {
  getBestiaryCatalog,
  getBestiaryMasteryTier,
  getBestiaryMeta,
  getBestiaryTotals,
} from '../src/data/bestiary';
import { MONSTERS } from '../src/data/monsters';
import { buildBestiarySpriteFrameHtml } from '../src/ui/HudController';

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

describe('Bestiary system (data, state & persistence)', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = createMemoryStorage();
    gameState.reset('Beastmaster');
  });

  it('registers bestiary menu tab right after map and before progress', () => {
    const mapIdx = ALL_MENU_TABS.indexOf('map');
    const bestiaryIdx = ALL_MENU_TABS.indexOf('bestiary');
    const progressIdx = ALL_MENU_TABS.indexOf('progress');
    expect(mapIdx).toBeGreaterThanOrEqual(0);
    expect(bestiaryIdx).toBe(mapIdx + 1);
    expect(progressIdx).toBe(bestiaryIdx + 1);
  });

  it('starts completely blank on reset()', () => {
    const gs = new GameState();
    gs.recordMonsterEncounter('Slime');
    expect(gs.getDiscoveredBestiaryIds()).toHaveLength(1);

    gs.reset('Gladiator');
    expect(gs.bestiary).toEqual({});
    expect(gs.getDiscoveredBestiaryIds()).toEqual([]);
    expect(gs.hasUnreadBestiaryEntries()).toBe(false);
    expect(gs.getBestiaryEntry('Slime')).toBeUndefined();
    expect(gameState.bestiary).toEqual({});
  });

  it('tracks first discovery, encounter counts, elite encounters, and unread flags', () => {
    const gs = new GameState();
    gs.reset('Sorcerer');

    const first = gs.recordMonsterEncounter('Slime');
    expect(first).toEqual({ isFirstDiscovery: true });
    expect(gs.hasUnreadBestiaryEntries()).toBe(true);
    expect(gs.getDiscoveredBestiaryIds()).toEqual(['Slime']);

    const entry1 = gs.getBestiaryEntry('Slime');
    expect(entry1).toBeDefined();
    expect(entry1?.encounters).toBe(1);
    expect(entry1?.kills).toBe(0);
    expect(entry1?.eliteEncounters).toBe(0);
    expect(entry1?.eliteKills).toBe(0);
    expect(entry1?.isNew).toBe(true);
    expect(entry1?.firstSeenAt).toBeGreaterThan(0);

    const second = gs.recordMonsterEncounter('Slime', { isElite: true });
    expect(second).toEqual({ isFirstDiscovery: false });
    expect(gs.getBestiaryEntry('Slime')?.encounters).toBe(2);
    expect(gs.getBestiaryEntry('Slime')?.eliteEncounters).toBe(1);

    const bossDiscovery = gs.recordMonsterEncounter('Lich', { isBoss: true });
    expect(bossDiscovery).toEqual({ isFirstDiscovery: true });
    expect(gs.getDiscoveredBestiaryIds()).toEqual(['Slime', 'Lich']);

    gs.markBestiaryEntrySeen('Slime');
    expect(gs.getBestiaryEntry('Slime')?.isNew).toBe(false);
    expect(gs.hasUnreadBestiaryEntries()).toBe(true);

    gs.markBestiaryEntrySeen('Lich');
    expect(gs.getBestiaryEntry('Lich')?.isNew).toBe(false);
    expect(gs.hasUnreadBestiaryEntries()).toBe(false);
  });

  it('syncs recordMonsterKill with bestiary kills, eliteKills, and encounters >= kills', () => {
    const gs = new GameState();
    gs.reset('Swashbuckler');
    const basePct = gs.getCompletionPercent();

    // Direct kill without prior encounter still creates entry and preserves encounters >= kills
    gs.recordMonsterKill('Goblin');
    gs.recordMonsterKill('Goblin', { isElite: true });
    const goblin = gs.getBestiaryEntry('Goblin');
    expect(goblin).toBeDefined();
    expect(goblin?.kills).toBe(2);
    expect(goblin?.eliteKills).toBe(1);
    expect(goblin?.encounters).toBeGreaterThanOrEqual(2);
    expect(goblin?.eliteEncounters).toBeGreaterThanOrEqual(1);
    expect(gs.getCompletionPercent()).toBeGreaterThan(basePct);

    // Encountered once, then killed 3 times -> encounters scales up to stay >= kills
    gs.recordMonsterEncounter('Skeleton');
    gs.recordMonsterKill('Skeleton');
    gs.recordMonsterKill('Skeleton');
    gs.recordMonsterKill('Skeleton');
    const skel = gs.getBestiaryEntry('Skeleton');
    expect(skel?.kills).toBe(3);
    expect(skel?.encounters).toBe(3);
  });

  it('round-trips bestiary state across save() / load() and backfills legacy killsByMonster saves', () => {
    const gs = new GameState();
    gs.reset('Gladiator');
    gs.recordMonsterEncounter('Slime');
    gs.recordMonsterKill('Slime', { isElite: true });
    gs.markBestiaryEntrySeen('Slime');
    gs.recordMonsterEncounter('Lich', { isBoss: true });
    const savedSlimeSeenAt = gs.getBestiaryEntry('Slime')!.firstSeenAt;
    gs.save(0);

    const restored = new GameState();
    expect(restored.load(0)).toBe(true);
    expect(restored.getBestiaryEntry('Slime')).toEqual({
      encounters: 1,
      kills: 1,
      eliteEncounters: 1,
      eliteKills: 1,
      firstSeenAt: savedSlimeSeenAt,
      isNew: false,
    });
    expect(restored.getBestiaryEntry('Lich')?.isNew).toBe(true);
    expect(restored.hasUnreadBestiaryEntries()).toBe(true);

    // Legacy save lacking `bestiary` backfills from `stats.killsByMonster`
    const legacySavedAt = 1700000000000;
    localStorage.setItem(
      'isles_of_foraging_save_v2_slot_1',
      JSON.stringify({
        version: 2,
        heroClass: 'Sorcerer',
        savedAt: legacySavedAt,
        stats: {
          killsByMonster: {
            Slime: 7,
            Mummy: 3,
            Bat: 0,
          },
          elitesKilled: 1,
          bossesKilled: 0,
          totalKills: 10,
          resourcesGathered: 0,
          fishCaught: 0,
          itemsCrafted: 0,
          structuresBuilt: 0,
          deaths: 0,
          damageDealt: 0,
          playTimeMs: 0,
        },
      }),
    );

    const legacyLoaded = new GameState();
    expect(legacyLoaded.load(1)).toBe(true);
    expect(legacyLoaded.getBestiaryEntry('Slime')).toEqual({
      encounters: 7,
      kills: 7,
      eliteEncounters: 0,
      eliteKills: 0,
      firstSeenAt: legacySavedAt,
      isNew: false,
    });
    expect(legacyLoaded.getBestiaryEntry('Mummy')).toEqual({
      encounters: 3,
      kills: 3,
      eliteEncounters: 0,
      eliteKills: 0,
      firstSeenAt: legacySavedAt,
      isNew: false,
    });
    expect(legacyLoaded.getBestiaryEntry('Bat')).toBeUndefined();
    expect(legacyLoaded.hasUnreadBestiaryEntries()).toBe(false);
  });

  it('provides full catalog, totals, habitats, behavior labels, mastery tiers, and real sprite paths for all MONSTERS', () => {
    const monsterIds = Object.keys(MONSTERS);
    const catalog = getBestiaryCatalog();
    const totals = getBestiaryTotals();

    expect(catalog).toHaveLength(monsterIds.length);
    expect(totals.total).toBe(monsterIds.length);
    expect(totals.monsters + totals.bosses).toBe(totals.total);
    expect(totals.bosses).toBe(Object.values(MONSTERS).filter((m) => Boolean(m.isBoss)).length);

    const publicDir = path.resolve(process.cwd(), 'public');
    for (const id of monsterIds) {
      const meta = getBestiaryMeta(id);
      expect(meta, `Missing bestiary meta for ${id}`).toBeDefined();
      expect(meta!.id).toBe(id);
      expect(meta!.name).toBe(MONSTERS[id].name);
      expect(meta!.category).toBe(MONSTERS[id].isBoss ? 'boss' : 'monster');
      expect(meta!.habitats.length).toBeGreaterThan(0);
      expect(meta!.habitats).not.toContain('Uncharted Wilds');
      expect(meta!.behaviorLabel.length).toBeGreaterThan(0);
      expect(meta!.fieldNote.length).toBeGreaterThan(0);
      expect(meta!.spritePath.startsWith('assets/')).toBe(true);
      expect(
        fs.existsSync(path.join(publicDir, meta!.spritePath)),
        `Sprite file missing on disk for ${id}: ${meta!.spritePath}`,
      ).toBe(true);
    }

    expect(getBestiaryMeta('Lich')?.habitats).toContain('Skull Crypt');
    expect(getBestiaryMeta('Purple Worm')?.habitats).toContain('Sunken Tomb');
    expect(getBestiaryMeta('Frost Giant')?.habitats).toContain('Frost Cavern');
    expect(getBestiaryMeta('Adult Red Dragon')?.habitats).toContain('Infernal Sanctum');
    expect(getBestiaryMeta('Oni')?.habitats).toContain('Void Spire');
    expect(getBestiaryMeta('Ancient Black Dragon')?.habitats).toContain('Void Spire');
    expect(getBestiaryMeta('Slime')?.behaviorLabel).toBe('Leaping Ambush');
    expect(getBestiaryMeta('Djinn')?.behaviorLabel).toBe('Ranged Caster');
    expect(getBestiaryMeta('Goblin')?.behaviorLabel).toBe('Relentless Pursuer');
    expect(getBestiaryMeta('Lich')?.behaviorLabel).toBe('Summoner Boss');
    expect(getBestiaryMeta('Purple Worm')?.behaviorLabel).toBe('Charging Titan');
    expect(getBestiaryMeta('NonExistentMonster')).toBeUndefined();

    expect(getBestiaryMasteryTier(0)).toEqual({ label: 'Sighted', color: '#a8b8d0' });
    expect(getBestiaryMasteryTier(1)).toEqual({ label: 'Tracked', color: '#7ef29d' });
    expect(getBestiaryMasteryTier(4)).toEqual({ label: 'Tracked', color: '#7ef29d' });
    expect(getBestiaryMasteryTier(5)).toEqual({ label: 'Hunter', color: '#ffe066' });
    expect(getBestiaryMasteryTier(19)).toEqual({ label: 'Hunter', color: '#ffe066' });
    expect(getBestiaryMasteryTier(20)).toEqual({ label: 'Slayer', color: '#ff9f43' });
    expect(getBestiaryMasteryTier(99)).toEqual({ label: 'Slayer', color: '#ff9f43' });
  });

  it('populates single-frame spriteFrame dimensions for all creatures and multi-frame sheets', () => {
    const catalog = getBestiaryCatalog();
    expect(catalog.length).toBe(Object.keys(MONSTERS).length);

    for (const meta of catalog) {
      const { frameWidth, frameHeight, sheetWidth, sheetHeight, cols, rows } = meta.spriteFrame;
      expect(Number.isInteger(frameWidth), `${meta.id} frameWidth integer`).toBe(true);
      expect(Number.isInteger(frameHeight), `${meta.id} frameHeight integer`).toBe(true);
      expect(Number.isInteger(sheetWidth), `${meta.id} sheetWidth integer`).toBe(true);
      expect(Number.isInteger(sheetHeight), `${meta.id} sheetHeight integer`).toBe(true);
      expect(Number.isInteger(cols), `${meta.id} cols integer`).toBe(true);
      expect(Number.isInteger(rows), `${meta.id} rows integer`).toBe(true);

      expect(frameWidth, `${meta.id} frameWidth > 0`).toBeGreaterThan(0);
      expect(frameHeight, `${meta.id} frameHeight > 0`).toBeGreaterThan(0);
      expect(sheetWidth, `${meta.id} sheetWidth >= frameWidth`).toBeGreaterThanOrEqual(frameWidth);
      expect(sheetHeight, `${meta.id} sheetHeight >= frameHeight`).toBeGreaterThanOrEqual(frameHeight);
      expect(cols, `${meta.id} cols >= 1`).toBeGreaterThanOrEqual(1);
      expect(rows, `${meta.id} rows >= 1`).toBeGreaterThanOrEqual(1);
      expect(sheetWidth, `${meta.id} sheetWidth === frameWidth * cols`).toBe(frameWidth * cols);
      expect(sheetHeight, `${meta.id} sheetHeight === frameHeight * rows`).toBe(frameHeight * rows);
    }

    for (const id of ['Slime', 'Goblin', 'Orc', 'Lich', 'Adult Red Dragon', 'Ancient Black Dragon']) {
      const meta = getBestiaryMeta(id);
      expect(meta, `Missing ${id}`).toBeDefined();
      const { frameWidth, frameHeight, sheetWidth, sheetHeight, cols, rows } = meta!.spriteFrame;
      expect(frameWidth < sheetWidth || frameHeight < sheetHeight).toBe(true);
      expect(cols).toBeGreaterThan(1);
      expect(rows).toBeGreaterThan(1);
    }

    // Defensive clone check on getBestiaryCatalog()
    const slimeCopy = catalog.find((m) => m.id === 'Slime')!;
    slimeCopy.spriteFrame.frameWidth = 9999;
    expect(getBestiaryMeta('Slime')?.spriteFrame.frameWidth).toBe(48);
  });

  it('renders single downward-facing sprite frame markup without leaking full spritesheet', () => {
    const slime = getBestiaryMeta('Slime')!;
    const orc = getBestiaryMeta('Orc')!;
    const redDragon = getBestiaryMeta('Adult Red Dragon')!;
    const serpentFly = getBestiaryMeta('Serpent Fly')!;

    const slimeThumb = buildBestiarySpriteFrameHtml(slime, 32);
    expect(slimeThumb).toContain('class="bestiary-sprite-frame"');
    expect(slimeThumb).not.toContain('<img');
    expect(slimeThumb).toContain(`aria-label="${slime.name}"`);
    expect(slimeThumb).toContain(`background-image:url('${slime.spritePath}')`);
    expect(slimeThumb).toContain('background-position:0px 0px');
    expect(slimeThumb).toContain('background-repeat:no-repeat');
    expect(slimeThumb).toContain('width:32px; height:32px;');
    expect(slimeThumb).toContain('background-size:128px 128px;');
    expect(slimeThumb).toContain('image-rendering:pixelated');

    const orcDetail = buildBestiarySpriteFrameHtml(orc, 54);
    expect(orcDetail).toContain('width:46px; height:54px;');
    expect(orcDetail).toContain('background-size:184px 216px;');

    const dragonDetail = buildBestiarySpriteFrameHtml(redDragon, 54);
    expect(dragonDetail).toContain('width:54px; height:46px;');
    expect(dragonDetail).toContain('background-size:216px 184px;');
    expect(dragonDetail).toContain('AdultRedDragon_idle.png');

    const flyThumb = buildBestiarySpriteFrameHtml(serpentFly, 32);
    expect(flyThumb).toContain(`background-image:url('${serpentFly.spritePath}')`);
  });

  it('dispatches forage:bestiary-discovery only on first discovery via Enemy encounter hook', async () => {
    vi.doMock('phaser', () => ({
      default: {
        GameObjects: {
          Container: class {},
        },
        Math: {
          Vector2: class {
            public x = 0;
            public y = 0;
            constructor(x = 0, y = 0) {
              this.x = x;
              this.y = y;
            }
            set(x: number, y: number) {
              this.x = x;
              this.y = y;
              return this;
            }
            lengthSq() {
              return this.x * this.x + this.y * this.y;
            }
            negate() {
              this.x = -this.x;
              this.y = -this.y;
              return this;
            }
          },
          Between: (min: number) => min,
        },
      },
    }));

    const dispatched: Array<CustomEvent> = [];
    const origWindow = (globalThis as { window?: unknown }).window;
    (globalThis as unknown as { window: { dispatchEvent: (ev: Event) => boolean } }).window = {
      dispatchEvent: vi.fn((ev: Event) => {
        dispatched.push(ev as CustomEvent);
        return true;
      }),
    };

    try {
      const { Enemy } = await import('../src/entities/Enemy');
      const fakeEnemy = {
        encounterRecorded: false,
        def: MONSTERS.Slime,
        isElite: true,
        recordEncounterIfNeeded: Enemy.prototype.recordEncounterIfNeeded,
      };

      fakeEnemy.recordEncounterIfNeeded();
      fakeEnemy.recordEncounterIfNeeded();

      expect(dispatched).toHaveLength(1);
      expect(dispatched[0].type).toBe('forage:bestiary-discovery');
      expect(dispatched[0].detail).toEqual({
        monsterId: 'Slime',
        name: 'Emerald Slime',
        isBoss: false,
        isElite: true,
      });
      expect(gameState.getBestiaryEntry('Slime')?.encounters).toBe(1);
      expect(gameState.getBestiaryEntry('Slime')?.eliteEncounters).toBe(1);

      // A second Slime instance increments encounters without re-dispatching discovery event
      const secondSlime = {
        encounterRecorded: false,
        def: MONSTERS.Slime,
        isElite: false,
        recordEncounterIfNeeded: Enemy.prototype.recordEncounterIfNeeded,
      };
      secondSlime.recordEncounterIfNeeded();
      expect(dispatched).toHaveLength(1);
      expect(gameState.getBestiaryEntry('Slime')?.encounters).toBe(2);
    } finally {
      vi.doUnmock('phaser');
      if (origWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as unknown as { window: unknown }).window = origWindow;
      }
    }
  });
});
