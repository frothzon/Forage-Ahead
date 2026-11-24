import {
  getSnapshot,
  holdKey,
  qaCall,
  waitForQaReady,
} from '../helpers/gameHarness.mjs';

export const tests = [
  {
    id: 'dungeon_room_and_boss',
    title: 'WFC dungeon combat, chest loot, and Void Dragon boss fight',
    category: 'Dungeons',
    async run(ctx) {
      const session = await ctx.createSession();
      const { page } = session;

      // 1) Skull Crypt WFC room combat & chest
      await page.goto(`${ctx.baseUrl}/?qa=dungeon_combat`, { waitUntil: 'domcontentloaded' });
      await waitForQaReady(page);

      let snap = await getSnapshot(page);
      ctx.assert(snap && snap.scene === 'DungeonScene', `Scene is DungeonScene (got ${snap?.scene})`);

      await holdKey(page, 'KeyW', 350);
      await qaCall(page, 'triggerAction', 'attack_nearby');
      await page.waitForTimeout(250);
      await qaCall(page, 'triggerAction', 'open_chest');
      await page.waitForTimeout(450);
      await session.captureScreenshot('04_dungeon_wfc_room');

      // 2) Void Spire floor 20 Void Dragon boss fight
      await page.goto(`${ctx.baseUrl}/?qa=void_dragon_boss`, { waitUntil: 'domcontentloaded' });
      await waitForQaReady(page);

      snap = await getSnapshot(page);
      ctx.assert(snap && snap.scene === 'DungeonScene', `Boss scene is DungeonScene (got ${snap?.scene})`);

      for (const itemId of ['thunder_rod', 'fire_rod', 'ice_rod']) {
        ctx.assert(
          await qaCall(page, 'triggerAction', 'fire_weapon', { itemId }),
          `Fired relic rod ${itemId} at Void Dragon`,
        );
        await page.waitForTimeout(450);
      }

      snap = await getSnapshot(page);
      await session.captureScreenshot('04_void_dragon_fight');
      ctx.setTelemetry(snap);
    },
  },
];
