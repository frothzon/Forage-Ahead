import { waitForQaReady, pressKey, getSnapshot, qaCall } from '../helpers/gameHarness.mjs';

export const tests = [
  {
    id: 'hud_modals_and_fishing',
    title: 'HUD modals (Inventory, Craft, Skills, World Map) & Fishing Minigame',
    category: 'UI',
    async run(ctx) {
      const session = await ctx.createSession();
      const { page } = session;

      await page.goto(`${ctx.baseUrl}/?qa=ui_modals`, { waitUntil: 'domcontentloaded' });
      await waitForQaReady(page);

      // 1. Inventory modal: open, assert, close via Escape
      await qaCall(page, 'openModal', 'inventory');
      let snap = await getSnapshot(page);
      ctx.assert(snap?.activeModal === 'inventory', `Expected activeModal === 'inventory', got '${snap?.activeModal}'`);
      await page.waitForTimeout(300);
      await pressKey(page, 'Escape');
      await page.waitForTimeout(150);
      snap = await getSnapshot(page);
      ctx.assert(snap?.activeModal === 'none', `Expected inventory modal closed via Escape, got '${snap?.activeModal}'`);

      // 2. Craft modal: open, assert, close
      await qaCall(page, 'openModal', 'craft');
      snap = await getSnapshot(page);
      ctx.assert(snap?.activeModal === 'craft', `Expected activeModal === 'craft', got '${snap?.activeModal}'`);
      await page.waitForTimeout(300);
      await qaCall(page, 'closeModal');
      snap = await getSnapshot(page);
      ctx.assert(snap?.activeModal === 'none', `Expected craft modal closed, got '${snap?.activeModal}'`);

      // 3. Skills modal: open, unlock first skill, capture screenshot, close
      await qaCall(page, 'openModal', 'skills');
      snap = await getSnapshot(page);
      ctx.assert(snap?.activeModal === 'skills', `Expected activeModal === 'skills', got '${snap?.activeModal}'`);
      const unlocked = await qaCall(page, 'triggerAction', 'unlock_first_skill');
      ctx.assert(unlocked === true, 'Unlocked first available skill via triggerAction');
      await page.waitForTimeout(350);
      await session.captureScreenshot('05_modal_skills');
      await qaCall(page, 'closeModal');
      snap = await getSnapshot(page);
      ctx.assert(snap?.activeModal === 'none', `Expected skills modal closed, got '${snap?.activeModal}'`);

      // 4. World map modal: open, buy adjacent island, assert count increased, capture screenshot, close
      await qaCall(page, 'openModal', 'map');
      snap = await getSnapshot(page);
      ctx.assert(snap?.activeModal === 'map', `Expected activeModal === 'map', got '${snap?.activeModal}'`);
      const islandsBefore = snap?.ownedIslandsCount ?? 0;
      const bought = await qaCall(page, 'triggerAction', 'buy_adjacent_island');
      ctx.assert(bought === true, 'Purchased adjacent island via triggerAction');
      await page.waitForTimeout(400);
      snap = await getSnapshot(page);
      const islandsAfter = snap?.ownedIslandsCount ?? 0;
      ctx.assert(
        islandsAfter > islandsBefore,
        `Owned islands increased after purchase (${islandsBefore} -> ${islandsAfter})`,
      );
      await session.captureScreenshot('05_modal_world_map');
      await qaCall(page, 'closeModal');

      // 5. Fishing minigame: start, verify #fish-bar visible, hold Space 600ms + release 300ms, capture screenshot
      const fishingStarted = await qaCall(page, 'triggerAction', 'start_fishing');
      ctx.assert(fishingStarted === true, 'Started fishing minigame via triggerAction');
      await page.waitForTimeout(300);

      const fishBarVisible = await page.locator('#fish-bar').isVisible();
      ctx.assert(fishBarVisible, '#fish-bar is visible in fishing minigame overlay');

      await page.keyboard.down('Space');
      await page.waitForTimeout(600);
      await page.keyboard.up('Space');
      await page.waitForTimeout(300);

      await session.captureScreenshot('05_fishing_minigame');

      snap = await getSnapshot(page);
      if (snap) {
        ctx.setTelemetry(snap);
      }
    },
  },
];
