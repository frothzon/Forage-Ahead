import { waitForQaReady, getSnapshot, qaCall } from '../helpers/gameHarness.mjs';

export const tests = [
  {
    id: 'android_touch_controls',
    title: 'Mobile touch viewport (landscape & portrait) and HUD bounds',
    category: 'Mobile',
    async run(ctx) {
      const landscape = { width: 844, height: 390 };
      const portrait = { width: 390, height: 844 };

      const session = await ctx.createSession({
        viewport: landscape,
        hasTouch: true,
        isMobile: true,
      });
      const { page } = session;

      await page.goto(`${ctx.baseUrl}/?qa=mobile_touch`, { waitUntil: 'domcontentloaded' });
      const canvasBox = await waitForQaReady(page);

      const hudRootVisible = await page.locator('#hud-root').isVisible();
      ctx.assert(hudRootVisible, '#hud-root is present and visible');

      ctx.assert(
        canvasBox.width >= 800 && canvasBox.height >= 350,
        `Landscape canvas fills viewport cleanly (${Math.round(canvasBox.width)}x${Math.round(canvasBox.height)})`,
      );

      // Verify touch controls & mobile HUD buttons are rendered and unclipped
      const touchCheck = await page.evaluate(({ vw, vh }) => {
        const touchRoot = document.querySelector('#hud-touch-controls');
        const joy = document.querySelector('#hud-touch-joy');
        const actBtn = document.querySelector('#hud-touch-act');
        const dashBtn = document.querySelector('#hud-touch-dash');

        const isDisplayed = (el) => {
          if (!el) return false;
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        };

        const isVisible = (el) => {
          if (!isDisplayed(el)) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };

        const clipped = [];
        const interactiveEls = document.querySelectorAll('#hud-root button, #hud-touch-joy');
        for (const el of interactiveEls) {
          if (!isVisible(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.left < -2 || r.top < -2 || r.right > vw + 2 || r.bottom > vh + 2) {
            clipped.push({
              id: el.id || el.textContent?.trim()?.slice(0, 24) || 'button',
              rect: { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) },
            });
          }
        }

        return {
          touchRootVisible: isDisplayed(touchRoot),
          joyVisible: isVisible(joy),
          actVisible: isVisible(actBtn),
          dashVisible: isVisible(dashBtn),
          clipped,
        };
      }, { vw: landscape.width, vh: landscape.height });

      ctx.assert(touchCheck.touchRootVisible, '#hud-touch-controls is rendered and visible');
      ctx.assert(touchCheck.joyVisible, 'Mobile touch joystick (#hud-touch-joy) is visible');
      ctx.assert(touchCheck.actVisible && touchCheck.dashVisible, 'Mobile action & dash buttons are visible');
      ctx.assert(
        touchCheck.clipped.length === 0,
        touchCheck.clipped.length === 0
          ? 'All visible HUD interactive controls fit within landscape viewport bounds'
          : `Clipped HUD controls: ${JSON.stringify(touchCheck.clipped)}`,
      );

      await session.captureScreenshot('06_mobile_landscape');

      // Open inventory modal to verify mobile modal scaling in video, then close
      await qaCall(page, 'openModal', 'inventory');
      await page.waitForTimeout(350);
      let snap = await getSnapshot(page);
      ctx.assert(snap?.activeModal === 'inventory', `Mobile inventory modal opened (${snap?.activeModal})`);
      await qaCall(page, 'closeModal');
      snap = await getSnapshot(page);
      ctx.assert(snap?.activeModal === 'none', `Mobile inventory modal closed (${snap?.activeModal})`);

      // Resize to portrait and verify Phaser RESIZE + HUD layout settle
      await page.setViewportSize(portrait);
      await page.waitForTimeout(500);

      const portraitBox = await page.locator('canvas').first().boundingBox();
      ctx.assert(
        Boolean(portraitBox && portraitBox.height > portraitBox.width),
        `Portrait canvas resized (${Math.round(portraitBox?.width ?? 0)}x${Math.round(portraitBox?.height ?? 0)})`,
      );

      await session.captureScreenshot('06_mobile_portrait');

      snap = await getSnapshot(page);
      if (snap) {
        ctx.setTelemetry(snap);
      }
    },
  },
];
