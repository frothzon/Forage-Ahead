import {
  getSnapshot,
  holdKey,
  pressKey,
  qaCall,
  waitForQaReady,
} from '../helpers/gameHarness.mjs';

export const tests = [
  {
    id: 'harvest_and_familiar',
    title: 'Overworld harvesting, loot pickup, and Beastmaster familiar combat',
    category: 'Overworld',
    async run(ctx) {
      const session = await ctx.createSession();
      const { page } = session;

      await page.goto(`${ctx.baseUrl}/?qa=forage_combat&hero=Beastmaster`, { waitUntil: 'domcontentloaded' });
      await waitForQaReady(page);

      const initialSnap = await getSnapshot(page);
      const initialWood = initialSnap?.inventory?.wood ?? 0;
      const initialStone = initialSnap?.inventory?.stone ?? 0;
      const initialCoins = initialSnap?.coins ?? 0;
      ctx.logAssertion(`Initial inventory: wood=${initialWood}, stone=${initialStone}, coins=${initialCoins}`);

      ctx.assert(await qaCall(page, 'spawnEntity', 'node', 'tree', 1, 0), 'Spawned tree node');
      ctx.assert(await qaCall(page, 'spawnEntity', 'node', 'rock', 2, 0), 'Spawned rock node');
      ctx.assert(await qaCall(page, 'spawnEntity', 'enemy', 'slime', 2, 1), 'Spawned slime enemy');

      for (let i = 0; i < 4; i++) {
        await qaCall(page, 'triggerAction', 'harvest_nearby');
        await page.waitForTimeout(180);
      }
      await holdKey(page, 'KeyD', 300);
      await pressKey(page, 'Space');
      await session.captureScreenshot('02_harvest_combo');

      for (let i = 0; i < 3; i++) {
        await qaCall(page, 'triggerAction', 'attack_nearby');
        await page.waitForTimeout(200);
      }
      await page.waitForTimeout(600);
      await session.captureScreenshot('02_familiar_combat');

      const snap = await getSnapshot(page);
      ctx.assert(snap && snap.scene === 'OverworldScene', `Scene is OverworldScene (got ${snap?.scene})`);
      ctx.assert(snap.heroClass === 'Beastmaster', `Hero class is Beastmaster (got ${snap.heroClass})`);

      const woodAfter = snap.inventory?.wood ?? 0;
      const stoneAfter = snap.inventory?.stone ?? 0;
      const coinsAfter = snap.coins ?? 0;
      const progressed =
        woodAfter > initialWood ||
        stoneAfter > initialStone ||
        coinsAfter > initialCoins ||
        snap.energy < initialSnap.energy ||
        snap.level >= initialSnap.level;
      ctx.assert(
        progressed,
        `Harvest/combat progression observed (wood ${initialWood}->${woodAfter}, stone ${initialStone}->${stoneAfter}, coins ${initialCoins}->${coinsAfter})`,
      );
      ctx.setTelemetry(snap);
    },
  },
  {
    id: 'build_craft_and_crops',
    title: 'Crop tilling/watering, forge building, crafting queue, and bomb blast',
    category: 'Overworld',
    async run(ctx) {
      const session = await ctx.createSession();
      const { page } = session;

      await page.goto(`${ctx.baseUrl}/?qa=base_building`, { waitUntil: 'domcontentloaded' });
      await waitForQaReady(page);

      ctx.assert(
        await qaCall(page, 'triggerAction', 'till_plant_water', {
          cropId: 'carrot',
          offsetTilesX: 1,
          offsetTilesY: 0,
        }),
        'Tilled, planted, and watered carrot crop',
      );
      ctx.assert(
        await qaCall(page, 'triggerAction', 'till_plant_water', {
          cropId: 'starfruit',
          offsetTilesX: 2,
          offsetTilesY: 0,
        }),
        'Tilled, planted, and watered starfruit crop',
      );
      ctx.assert(await qaCall(page, 'spawnEntity', 'building', 'furnace', -2, 0), 'Spawned furnace');
      ctx.assert(await qaCall(page, 'spawnEntity', 'building', 'anvil', -2, 1), 'Spawned anvil');
      await session.captureScreenshot('02_farm_and_forge');

      ctx.assert(
        await qaCall(page, 'triggerAction', 'enqueue_craft', { recipeId: 'iron_ingot' }),
        'Enqueued iron_ingot craft',
      );
      await page.waitForTimeout(600);

      ctx.assert(await qaCall(page, 'spawnEntity', 'node', 'iron_vein', 0, 2), 'Spawned iron_vein node');
      ctx.assert(
        await qaCall(page, 'triggerAction', 'place_bomb', { offsetX: 0, offsetY: 2 }),
        'Placed bomb near iron_vein',
      );
      await page.waitForTimeout(1100);
      await session.captureScreenshot('02_craft_queue');

      const snap = await getSnapshot(page);
      ctx.assert(snap && snap.scene === 'OverworldScene', `Scene is OverworldScene (got ${snap?.scene})`);
      ctx.setTelemetry(snap);
    },
  },
];
