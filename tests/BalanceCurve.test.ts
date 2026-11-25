import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/data/items';
import { MONSTERS } from '../src/data/monsters';
import { RECIPES } from '../src/data/recipes';
import { BOMB_SPECS, getBombSpec, isBombItem, type BombKind } from '../src/world/bombRules';

describe('Bomb rules & variants', () => {
  it('exposes exact specs for all four bomb variants and helper lookups', () => {
    expect(BOMB_SPECS.bomb).toEqual({
      id: 'bomb',
      fuseMs: 1100,
      radius: 56,
      damage: 45,
      tint: 0xffaa44,
      ignitesBraziers: false,
      quenchesVents: false,
      slowsMs: 0,
      clusterCount: 0,
    });
    expect(BOMB_SPECS.bomb_fire).toEqual({
      id: 'bomb_fire',
      fuseMs: 1000,
      radius: 58,
      damage: 55,
      tint: 0xff6333,
      ignitesBraziers: true,
      quenchesVents: false,
      slowsMs: 0,
      clusterCount: 0,
    });
    expect(BOMB_SPECS.bomb_frost).toEqual({
      id: 'bomb_frost',
      fuseMs: 1000,
      radius: 60,
      damage: 40,
      tint: 0x6ce5ff,
      ignitesBraziers: false,
      quenchesVents: true,
      slowsMs: 3500,
      clusterCount: 0,
    });
    expect(BOMB_SPECS.bomb_void).toEqual({
      id: 'bomb_void',
      fuseMs: 1200,
      radius: 68,
      damage: 120,
      tint: 0xc77dff,
      ignitesBraziers: true,
      quenchesVents: false,
      slowsMs: 0,
      clusterCount: 3,
    });

    const kinds: BombKind[] = ['bomb', 'bomb_fire', 'bomb_frost', 'bomb_void'];
    for (const kind of kinds) {
      expect(isBombItem(kind)).toBe(true);
      expect(getBombSpec(kind)).toEqual(BOMB_SPECS[kind]);
      const item = ITEMS[kind];
      expect(item).toBeDefined();
      expect(item.category).toBe('consumable');
      expect(item.iconKey).toBe('projectiles/Bomb');
    }

    expect(isBombItem('sword')).toBe(false);
    expect(isBombItem('potion_red')).toBe(false);
    expect(isBombItem('toString')).toBe(false);
    expect(getBombSpec('unknown_item')).toEqual(BOMB_SPECS.bomb);
    expect(getBombSpec('toString')).toEqual(BOMB_SPECS.bomb);
  });

  it('provides craftable x2 recipes for fire, frost, and void bombs at their tier stations', () => {
    const expected = [
      { id: 'craft_bomb_fire', station: 'alchemy_lab', outputItemId: 'bomb_fire' },
      { id: 'craft_bomb_frost', station: 'frost_kiln', outputItemId: 'bomb_frost' },
      { id: 'craft_bomb_void', station: 'void_altar', outputItemId: 'bomb_void' },
    ] as const;

    for (const spec of expected) {
      const rec = RECIPES.find((r) => r.id === spec.id);
      expect(rec).toBeDefined();
      expect(rec!.station).toBe(spec.station);
      expect(rec!.outputItemId).toBe(spec.outputItemId);
      expect(rec!.outputCount).toBe(2);
      expect(rec!.ingredients.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('Lv 1-60 weapon & monster balance curve', () => {
  it('keeps sword and relic attack curves strictly monotonic and balanced', () => {
    const swordCurve = [
      ITEMS.sword.stats!.attack!,
      ITEMS.sword_iron.stats!.attack!,
      ITEMS.sword_sun.stats!.attack!,
      ITEMS.sword_obsidian.stats!.attack!,
      ITEMS.sword_astral.stats!.attack!,
      ITEMS.sword_wyrmheart.stats!.attack!,
    ];
    expect(swordCurve).toEqual([8, 15, 26, 58, 145, 310]);
    for (let i = 1; i < swordCurve.length; i++) {
      expect(swordCurve[i]).toBeGreaterThan(swordCurve[i - 1]);
    }

    const relicCurve = [
      ITEMS.necro_rod.stats!.attack!,
      ITEMS.thunder_rod.stats!.attack!,
      ITEMS.ice_rod.stats!.attack!,
      ITEMS.fire_rod.stats!.attack!,
      ITEMS.void_rod.stats!.attack!,
    ];
    expect(relicCurve).toEqual([28, 34, 48, 72, 240]);
    for (let i = 1; i < relicCurve.length; i++) {
      expect(relicCurve[i]).toBeGreaterThan(relicCurve[i - 1]);
    }

    expect(ITEMS.bow.stats!.attack).toBe(14);
  });

  it('prevents Sunforged Blade from one-shotting Lv 5+ / Skull Crypt monsters and keeps starter mobs welcoming', () => {
    expect(MONSTERS.Slime.maxHp).toBe(32);
    expect(MONSTERS.Goblin.maxHp).toBe(48);

    const sunAtk = ITEMS.sword_sun.stats!.attack!;
    for (const monster of Object.values(MONSTERS)) {
      if (monster.level >= 5) {
        expect(monster.maxHp).toBeGreaterThan(sunAtk * 2);
      }
    }
  });

  it('maintains healthy on-tier hits-to-kill across Lv 1, 6, 10, 20, 35, and 50', () => {
    const regularTierChecks: Array<{ weaponId: string; monsterIds: string[] }> = [
      { weaponId: 'sword', monsterIds: ['Slime', 'Goblin'] },
      { weaponId: 'sword_iron', monsterIds: ['Bat', 'Skeleton', 'Mummy', 'Lizardfolk', 'Orc'] },
      {
        weaponId: 'sword_sun',
        monsterIds: ['Anubis Warrior', 'Djinn', 'Vampire', 'Medusa', 'Death Knight', 'Frost Salamander', 'Redcap'],
      },
      { weaponId: 'sword_obsidian', monsterIds: ['Imp', 'Gog', 'Hellhound', 'Demon'] },
      { weaponId: 'sword_astral', monsterIds: ['Samurai', 'Wolf Rider', 'Bulette', 'Ogre', 'Cyclops'] },
      { weaponId: 'void_rod', monsterIds: ['Griffin', 'Beholder', 'Efreet', 'Elder Snail', 'Fiddle Dog'] },
    ];

    for (const { weaponId, monsterIds } of regularTierChecks) {
      const atk = ITEMS[weaponId].stats!.attack!;
      for (const mId of monsterIds) {
        const hits = MONSTERS[mId].maxHp / atk;
        expect(hits).toBeGreaterThanOrEqual(2.5);
        expect(hits).toBeLessThanOrEqual(9.0);
      }
    }

    const bossTierChecks: Array<{ weaponId: string; bossId: string }> = [
      { weaponId: 'sword_sun', bossId: 'Lich' },
      { weaponId: 'sword_sun', bossId: 'Purple Worm' },
      { weaponId: 'ice_rod', bossId: 'Frost Giant' },
      { weaponId: 'sword_obsidian', bossId: 'Adult Red Dragon' },
      { weaponId: 'sword_obsidian', bossId: 'Oni' },
      { weaponId: 'sword_astral', bossId: 'Young Green Dragon' },
      { weaponId: 'void_rod', bossId: 'Planetar' },
      { weaponId: 'sword_wyrmheart', bossId: 'Ancient Black Dragon' },
    ];

    for (const { weaponId, bossId } of bossTierChecks) {
      const atk = ITEMS[weaponId].stats!.attack!;
      const hits = MONSTERS[bossId].maxHp / atk;
      expect(hits).toBeGreaterThanOrEqual(12);
      expect(hits).toBeLessThanOrEqual(45);
    }
  });
});
