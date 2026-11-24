import {
  getSnapshot,
  pressKey,
  qaCall,
  waitForCanvasRender,
  waitForQaReady,
} from '../helpers/gameHarness.mjs';

export const tests = [
  {
    id: 'biome_weather_matrix',
    title: 'Biome teleportation, weather particles, and day/night lighting matrix',
    category: 'Overworld',
    async run(ctx) {
      const session = await ctx.createSession();
      const { page } = session;

      await page.goto(`${ctx.baseUrl}/?qa=biomes`, { waitUntil: 'domcontentloaded' });
      await waitForQaReady(page);

      // 1) Grassland noon (sunny)
      ctx.assert(await qaCall(page, 'teleportIsland', 2, 2), 'Teleported to Grassland (2, 2)');
      ctx.assert(await qaCall(page, 'setEnvironment', 0.35, 'sunny'), 'Set environment 0.35 sunny');
      await page.waitForTimeout(500);
      await session.captureScreenshot('03_grassland_noon');

      // 2) Desert sandstorm
      ctx.assert(await qaCall(page, 'teleportIsland', 3, 3), 'Teleported to Desert (3, 3)');
      ctx.assert(await qaCall(page, 'setEnvironment', 0.68, 'sandstorm'), 'Set environment 0.68 sandstorm');
      await page.waitForTimeout(600);
      await session.captureScreenshot('03_desert_sandstorm');

      // 3) Frostlands night + snow + bonfire
      ctx.assert(await qaCall(page, 'teleportIsland', 2, 0), 'Teleported to Frostlands (2, 0)');
      ctx.assert(await qaCall(page, 'setEnvironment', 0.88, 'snow'), 'Set environment 0.88 snow');
      ctx.assert(await qaCall(page, 'spawnEntity', 'building', 'bonfire', 1, 0), 'Spawned Frostlands bonfire');
      await page.waitForTimeout(600);
      await session.captureScreenshot('03_frost_night');

      // 4) Infernal Volcano dusk + cloudy + bonfire
      ctx.assert(await qaCall(page, 'teleportIsland', 4, 0), 'Teleported to Infernal Volcano (4, 0)');
      ctx.assert(await qaCall(page, 'setEnvironment', 0.68, 'cloudy'), 'Set environment 0.68 cloudy');
      ctx.assert(await qaCall(page, 'spawnEntity', 'building', 'bonfire', -1, 0), 'Spawned Volcano bonfire');
      await page.waitForTimeout(600);
      await session.captureScreenshot('03_infernal_dusk');

      const snap = await getSnapshot(page);
      ctx.assert(snap && snap.scene === 'OverworldScene', `Scene is OverworldScene (got ${snap?.scene})`);
      ctx.assert(snap.activeWeather === 'cloudy', `Weather updated to cloudy (got ${snap.activeWeather})`);
      ctx.assert(
        Math.abs((snap.timeOfDay ?? 0) - 0.68) < 0.05,
        `timeOfDay updated near 0.68 (got ${snap.timeOfDay})`,
      );
      ctx.setTelemetry(snap);
    },
  },
  {
    id: 'house_interior_and_test',
    title: 'House tileset test scene and HouseScene bed rest',
    category: 'Overworld',
    async run(ctx) {
      const session = await ctx.createSession();
      const { page } = session;

      await page.goto(`${ctx.baseUrl}/?test=houses`, { waitUntil: 'domcontentloaded' });
      await waitForQaReady(page);
      await waitForCanvasRender(page);

      await pressKey(page, 'KeyR');
      await page.waitForTimeout(350);
      await pressKey(page, 'KeyT');
      await page.waitForTimeout(350);
      await session.captureScreenshot('03_house_tileset_sheet');

      await page.goto(`${ctx.baseUrl}/?qa=house_entry`, { waitUntil: 'domcontentloaded' });
      await waitForQaReady(page);

      let snap = await getSnapshot(page);
      ctx.assert(snap && snap.scene === 'HouseScene', `Scene is HouseScene (got ${snap?.scene})`);

      ctx.assert(await qaCall(page, 'triggerAction', 'rest_at_bed'), 'Rested at bed in HouseScene');
      await page.waitForTimeout(400);

      snap = await getSnapshot(page);
      ctx.assert(
        snap && snap.hp === snap.maxHp && snap.energy === snap.maxEnergy,
        `Restored full HP (${snap?.hp}/${snap?.maxHp}) and Energy (${snap?.energy}/${snap?.maxEnergy})`,
      );
      await session.captureScreenshot('03_house_interior');
      ctx.setTelemetry(snap);
    },
  },
];
