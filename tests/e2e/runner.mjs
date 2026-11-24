import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { E2E_CONFIG } from './playwright.config.mjs';
import { startDistServer, createQaSession, getSnapshot } from './helpers/gameHarness.mjs';
import { buildGalleryReport } from './helpers/galleryBuilder.mjs';

function parseCliArgs(argv) {
  const opts = {
    headed: false,
    workers: E2E_CONFIG.workers,
    filter: '',
    skipServer: false,
  };

  for (const arg of argv) {
    if (arg === '--headed') {
      opts.headed = true;
    } else if (arg === '--skip-server') {
      opts.skipServer = true;
    } else if (arg.startsWith('--workers=')) {
      const n = Number.parseInt(arg.slice('--workers='.length), 10);
      if (Number.isFinite(n) && n >= 1) {
        opts.workers = n;
      }
    } else if (arg.startsWith('--filter=')) {
      opts.filter = arg.slice('--filter='.length).trim().toLowerCase();
    }
  }
  return opts;
}

function resetArtifactDirs() {
  for (const dir of [E2E_CONFIG.screenshotsDir, E2E_CONFIG.videosDir, E2E_CONFIG.tempVideosDir]) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function discoverTests(filter) {
  if (!fs.existsSync(E2E_CONFIG.specsDir)) {
    return [];
  }
  const files = fs
    .readdirSync(E2E_CONFIG.specsDir)
    .filter((f) => f.endsWith('.mjs'))
    .sort((a, b) => a.localeCompare(b));

  const allTests = [];
  for (const file of files) {
    const modUrl = pathToFileURL(path.join(E2E_CONFIG.specsDir, file)).href;
    const mod = await import(modUrl);
    if (!Array.isArray(mod.tests)) {
      throw new Error(`Spec file ${file} must export 'export const tests = [...]'`);
    }
    for (const t of mod.tests) {
      if (!t || typeof t.id !== 'string' || typeof t.run !== 'function') {
        throw new Error(`Invalid test entry in ${file}: each test requires { id, title, category, run }`);
      }
      if (filter) {
        const hay = `${t.id} ${t.title || ''} ${t.category || ''}`.toLowerCase();
        if (!hay.includes(filter)) continue;
      }
      allTests.push({
        id: t.id,
        title: t.title || t.id,
        category: t.category || 'General',
        run: t.run,
        file,
      });
    }
  }
  return allTests;
}

async function executeSingleTest(test, browser) {
  const startMs = Date.now();
  const assertions = [];
  const sessions = [];
  let telemetry = null;
  let status = 'pass';
  let failureMessage = '';

  const ctx = {
    browser,
    baseUrl: E2E_CONFIG.baseUrl,
    config: E2E_CONFIG,
    testId: test.id,
    async createSession(sessionOpts = {}) {
      const session = await createQaSession(browser, {
        testId: test.id,
        ...sessionOpts,
      });
      sessions.push(session);
      return session;
    },
    logAssertion(message) {
      assertions.push(String(message));
    },
    assert(condition, message) {
      if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
      }
      assertions.push(String(message));
    },
    setTelemetry(snapshot) {
      telemetry = snapshot;
    },
  };

  try {
    await test.run(ctx);
    for (const session of sessions) {
      session.assertNoErrors();
    }
  } catch (err) {
    status = 'fail';
    failureMessage = err?.stack || err?.message || String(err);
  } finally {
    if (!telemetry) {
      for (const session of sessions) {
        if (!session.page.isClosed()) {
          try {
            const snap = await getSnapshot(session.page);
            if (snap) {
              telemetry = snap;
              break;
            }
          } catch {
            // Ignore snapshot read errors during teardown
          }
        }
      }
    }
  }

  let video = null;
  const screenshots = [];
  const errors = [];

  for (const session of sessions) {
    const vidPath = await session.finalizeVideo();
    if (vidPath && !video) {
      video = vidPath;
    }
    screenshots.push(...session.screenshots);
    errors.push(...session.errors);
  }

  if (errors.length > 0 && status === 'pass') {
    status = 'fail';
    failureMessage = `Captured ${errors.length} runtime/console error(s).`;
  }

  return {
    id: test.id,
    title: test.title,
    category: test.category,
    status,
    durationMs: Date.now() - startMs,
    screenshots,
    video,
    telemetry,
    assertions,
    errors,
    failureMessage,
  };
}

async function runWithPool(tests, browser, concurrency) {
  const results = new Array(tests.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const idx = nextIndex++;
      if (idx >= tests.length) break;
      const test = tests[idx];
      console.log(`[START] ${test.id} (${test.category}) — ${test.title}`);
      const res = await executeSingleTest(test, browser);
      results[idx] = res;
      const tag = res.status === 'pass' ? 'PASS' : 'FAIL';
      console.log(`[${tag}]  ${test.id} (${(res.durationMs / 1000).toFixed(2)}s)`);
      if (res.status === 'fail' && res.failureMessage) {
        console.error(`        -> ${res.failureMessage.split('\n')[0]}`);
      }
    }
  }

  const workerCount = Math.min(concurrency, Math.max(1, tests.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function printSummaryTable(results, totalDurationMs) {
  console.log('\n==================== E2E QA SUMMARY ====================');
  for (const r of results) {
    const badge = r.status === 'pass' ? 'PASS' : 'FAIL';
    const dur = `${(r.durationMs / 1000).toFixed(2)}s`.padStart(7);
    console.log(`${badge.padEnd(5)} ${dur}  [${r.category}] ${r.id} — ${r.title}`);
  }
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.length - passed;
  console.log('--------------------------------------------------------');
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Runtime: ${(totalDurationMs / 1000).toFixed(2)}s`);
  console.log(`Visual Review Gallery: ${E2E_CONFIG.reportPath}`);
  console.log('========================================================\n');
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  resetArtifactDirs();

  const tests = await discoverTests(opts.filter);
  if (tests.length === 0) {
    console.log('No E2E specs matched. Writing empty gallery report.');
    buildGalleryReport({ results: [], totalDurationMs: 0 });
    fs.rmSync(E2E_CONFIG.tempVideosDir, { recursive: true, force: true });
    process.exit(0);
  }

  if (!opts.skipServer && !fs.existsSync(E2E_CONFIG.distDir)) {
    throw new Error(`dist/ directory not found at ${E2E_CONFIG.distDir}. Run 'npm.cmd run build' first.`);
  }

  let server = null;
  let browser = null;
  const suiteStartMs = Date.now();

  try {
    if (!opts.skipServer) {
      server = await startDistServer(E2E_CONFIG.port);
      console.log(`Serving dist/ at ${E2E_CONFIG.baseUrl}`);
    }

    browser = await chromium.launch({
      headless: !opts.headed,
      args: E2E_CONFIG.launchArgs,
    });

    const results = await runWithPool(tests, browser, opts.workers);
    const totalDurationMs = Date.now() - suiteStartMs;

    buildGalleryReport({ results, totalDurationMs });
    printSummaryTable(results, totalDurationMs);

    const anyFailed = results.some((r) => r.status !== 'pass');
    process.exitCode = anyFailed ? 1 : 0;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()));
    }
    fs.rmSync(E2E_CONFIG.tempVideosDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[E2E Runner Fatal Error]', err);
  process.exit(1);
});
