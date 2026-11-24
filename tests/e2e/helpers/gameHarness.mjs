import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { E2E_CONFIG } from '../playwright.config.mjs';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

/**
 * Starts a static HTTP server serving `dist/` on 127.0.0.1:<port>.
 * @param {number} [port]
 * @returns {Promise<http.Server>}
 */
export function startDistServer(port = E2E_CONFIG.port) {
  const distDir = path.resolve(E2E_CONFIG.distDir);
  const srv = http.createServer((req, res) => {
    try {
      const rawUrl = (req.url || '/').split('?')[0];
      const decoded = decodeURIComponent(rawUrl);
      const relPath = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
      const filePath = path.resolve(distDir, relPath);

      if (!filePath.startsWith(distDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });

  return new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(port, E2E_CONFIG.host, () => resolve(srv));
  });
}

function sanitizeFileSegment(value) {
  return String(value || 'shot')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'shot';
}

function isHarmlessConsoleError(text) {
  const lower = text.toLowerCase();
  if (lower.includes('favicon.ico') && (lower.includes('404') || lower.includes('failed to load resource'))) {
    return true;
  }
  return false;
}

/**
 * Creates an isolated Playwright BrowserContext + Page with video recording,
 * automatic pageerror/console.error traps, and screenshot/video helpers.
 * @param {import('playwright').Browser} browser
 * @param {object} options
 * @param {string} options.testId
 * @param {{ width: number, height: number }} [options.viewport]
 * @param {boolean} [options.hasTouch]
 * @param {boolean} [options.isMobile]
 * @param {string} [options.userAgent]
 */
export async function createQaSession(browser, options = {}) {
  const testId = sanitizeFileSegment(options.testId || `qa_${Date.now()}`);
  const viewport = options.viewport || E2E_CONFIG.defaultViewport;
  const tempVideoDir = path.join(E2E_CONFIG.tempVideosDir, testId);
  fs.mkdirSync(tempVideoDir, { recursive: true });
  fs.mkdirSync(E2E_CONFIG.screenshotsDir, { recursive: true });
  fs.mkdirSync(E2E_CONFIG.videosDir, { recursive: true });

  const contextOptions = {
    viewport,
    recordVideo: {
      dir: tempVideoDir,
      size: viewport,
    },
  };
  if (typeof options.hasTouch === 'boolean') contextOptions.hasTouch = options.hasTouch;
  if (typeof options.isMobile === 'boolean') contextOptions.isMobile = options.isMobile;
  if (typeof options.userAgent === 'string' && options.userAgent.length > 0) {
    contextOptions.userAgent = options.userAgent;
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.setDefaultTimeout(E2E_CONFIG.defaultTimeoutMs);

  const errors = [];
  const screenshots = [];
  let finalized = false;
  let savedVideoRelPath = null;

  page.on('pageerror', (err) => {
    errors.push(`[pageerror] ${err?.message || String(err)}`);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!isHarmlessConsoleError(text)) {
        errors.push(`[console.error] ${text}`);
      }
    }
  });

  function assertNoErrors() {
    if (errors.length > 0) {
      throw new Error(`Captured ${errors.length} runtime/console error(s):\n${errors.join('\n')}`);
    }
  }

  async function captureScreenshot(name, settleMs = 250) {
    if (settleMs > 0) {
      await page.waitForTimeout(settleMs);
    }
    const safeName = sanitizeFileSegment(name);
    const fileName = safeName.startsWith(`${testId}__`) ? `${safeName}.png` : `${testId}__${safeName}.png`;
    const absPath = path.join(E2E_CONFIG.screenshotsDir, fileName);
    await page.screenshot({ path: absPath });
    const relPath = `screenshots/${fileName}`;
    screenshots.push({ label: String(name), path: relPath });
    return relPath;
  }

  async function finalizeVideo() {
    if (finalized) return savedVideoRelPath;
    finalized = true;

    const video = page.video();
    try {
      if (!page.isClosed()) {
        await page.close();
      }
    } catch {
      // Ignore close errors during teardown
    }
    try {
      await context.close();
    } catch {
      // Ignore close errors during teardown
    }

    let videoSrcPath = null;
    if (video) {
      try {
        videoSrcPath = await video.path();
      } catch {
        videoSrcPath = null;
      }
    }

    if (!videoSrcPath || !fs.existsSync(videoSrcPath)) {
      if (fs.existsSync(tempVideoDir)) {
        const files = fs.readdirSync(tempVideoDir).filter((f) => f.endsWith('.webm'));
        if (files.length > 0) {
          videoSrcPath = path.join(tempVideoDir, files[0]);
        }
      }
    }

    if (videoSrcPath && fs.existsSync(videoSrcPath)) {
      const destPath = path.join(E2E_CONFIG.videosDir, `${testId}.webm`);
      fs.copyFileSync(videoSrcPath, destPath);
      savedVideoRelPath = `videos/${testId}.webm`;
    }

    try {
      fs.rmSync(tempVideoDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }

    return savedVideoRelPath;
  }

  return {
    context,
    page,
    errors,
    screenshots,
    assertNoErrors,
    captureScreenshot,
    finalizeVideo,
  };
}

/**
 * Waits for `window.__QA_READY === true` and verifies `<canvas>` has a non-zero bounding box.
 * @param {import('playwright').Page} page
 * @param {number} [timeoutMs]
 */
export async function waitForQaReady(page, timeoutMs = 45000) {
  await page.waitForFunction(() => window.__QA_READY === true, null, { timeout: timeoutMs });
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: timeoutMs });
  const box = await canvas.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) {
    throw new Error(`Expected visible <canvas> with non-zero bounding box, got: ${JSON.stringify(box)}`);
  }
  return box;
}

/**
 * For non-`?qa=` pages (such as `/` clean boot), waits for `<canvas>` to be visible
 * with non-zero size and at least two rendered animation frames.
 * @param {import('playwright').Page} page
 * @param {number} [timeoutMs]
 */
export async function waitForCanvasRender(page, timeoutMs = 20000) {
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: timeoutMs });
  await page.waitForFunction(() => {
    const el = document.querySelector('canvas');
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return el.width > 0 && el.height > 0 && rect.width > 0 && rect.height > 0;
  }, null, { timeout: timeoutMs });

  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );

  const box = await canvas.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) {
    throw new Error(`Canvas bounding box is invalid after render: ${JSON.stringify(box)}`);
  }
  const shotBuf = await canvas.screenshot();
  if (!shotBuf || shotBuf.length < 100) {
    throw new Error('Canvas screenshot buffer appears empty.');
  }
  return box;
}

/**
 * Holds a keyboard key down for `ms` milliseconds then releases it.
 * @param {import('playwright').Page} page
 * @param {string} key
 * @param {number} [ms]
 */
export async function holdKey(page, key, ms = 400) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/**
 * Presses a keyboard key with a specified hold delay.
 * @param {import('playwright').Page} page
 * @param {string} key
 * @param {number} [delayMs]
 */
export async function pressKey(page, key, delayMs = 60) {
  await page.keyboard.press(key, { delay: delayMs });
}

/**
 * Reads `window.__QA_API__?.getStateSnapshot?.()` from the page.
 * @param {import('playwright').Page} page
 */
export async function getSnapshot(page) {
  return page.evaluate(() => window.__QA_API__?.getStateSnapshot?.() ?? null);
}

/**
 * Safely invokes `window.__QA_API__[method](...args)` on the page.
 * Throws a descriptive error if `__QA_API__` or the method is missing.
 * @param {import('playwright').Page} page
 * @param {string} method
 * @param {...any} args
 */
export async function qaCall(page, method, ...args) {
  return page.evaluate(
    ({ fnName, fnArgs }) => {
      const api = window.__QA_API__;
      if (!api) {
        throw new Error(`window.__QA_API__ is not defined (cannot call "${fnName}"). Did you boot with ?qa=... ?`);
      }
      const fn = api[fnName];
      if (typeof fn !== 'function') {
        const available = Object.keys(api).join(', ');
        throw new Error(`window.__QA_API__.${fnName} is not a function. Available methods: [${available}]`);
      }
      return fn(...fnArgs);
    },
    { fnName: method, fnArgs: args },
  );
}
