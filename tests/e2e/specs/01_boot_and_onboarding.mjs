import {
  getSnapshot,
  holdKey,
  qaCall,
  waitForQaReady,
} from '../helpers/gameHarness.mjs';

export const tests = [
  {
    id: 'boot_title_to_tutorial',
    title: 'Title boot, hero class cycling, and tutorial entry',
    category: 'Overworld',
    async run(ctx) {
      const session = await ctx.createSession();
      const { page } = session;

      await page.goto(`${ctx.baseUrl}/?qa=title`, { waitUntil: 'domcontentloaded' });
      const box = await waitForQaReady(page);
      ctx.assert(box.width > 200 && box.height > 200, `Canvas size ${Math.round(box.width)}x${Math.round(box.height)} > 200x200`);

      await session.captureScreenshot('01_title_screen');

      const heroCycle = ['Beastmaster', 'Gladiator', 'Sorcerer', 'Swashbuckler', 'Beastmaster'];
      for (const heroClass of heroCycle) {
        const ok = await qaCall(page, 'triggerAction', 'select_hero', { heroClass });
        ctx.assert(ok === true, `Selected hero class ${heroClass}`);
        await page.waitForTimeout(250);
      }

      const started = await qaCall(page, 'triggerAction', 'start_tutorial');
      ctx.assert(started === true, 'Triggered start_tutorial from TitleScene');

      await page.waitForFunction(
        () => window.__QA_READY === true && window.__QA_API__?.getStateSnapshot?.()?.scene === 'TutorialDungeonScene',
        null,
        { timeout: 15000 },
      );
      await waitForQaReady(page, 15000);

      let snap = await getSnapshot(page);
      ctx.assert(snap && snap.scene === 'TutorialDungeonScene', `Scene transitioned to ${snap?.scene}`);
      ctx.assert(snap.tutorialCompleted === false, `tutorialCompleted is false (got ${snap.tutorialCompleted})`);
      ctx.assert(
        Array.isArray(snap.hotbar) && snap.hotbar.includes('berries'),
        `Hotbar contains berries (slot 5 = ${snap.hotbar?.[4] ?? 'empty'})`,
      );
      ctx.logAssertion(`Tutorial hotbar: ${JSON.stringify(snap.hotbar)}`);

      await holdKey(page, 'KeyD', 450);
      snap = await getSnapshot(page);
      await session.captureScreenshot('01_tutorial_start');
      ctx.setTelemetry(snap);
    },
  },
];
