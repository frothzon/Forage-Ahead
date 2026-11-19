import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, 'promo', 'raw_clips');
const OVERLAY_DIR = path.join(ROOT, 'promo', 'overlays');
fs.mkdirSync(RAW_DIR, { recursive: true });
fs.mkdirSync(OVERLAY_DIR, { recursive: true });

const SHOTS = [
  { id: '01_mega_harvest_blast', recordMs: 4200, hideHud: true, banner: 'SMASH. FORAGE. GROW RICH.', sub: 'Chain-Reaction Harvesting & Mining' },
  { id: '02_island_rise_cascade', recordMs: 4200, hideHud: false, banner: 'EXPAND ACROSS 25 ISLANDS', sub: 'Unlock New Biomes, Dungeons & Secrets' },
  { id: '03_hyper_factory_dusk', recordMs: 4200, hideHud: true, banner: 'BUILD AN AUTOMATED EMPIRE', sub: 'Furnaces, Anvils, Windmills & Dynamic Lighting' },
  { id: '04_relic_storm_night', recordMs: 4700, hideHud: true, banner: 'WIELD ELEMENTAL RELICS', sub: 'Lightning, Fire, Ice & Multi-Shot Combat' },
  { id: '05_biome_blitz_montage', recordMs: 4700, hideHud: true, banner: 'CONQUER 4 DEADLY BIOMES', sub: 'Sandstorms, Blizzards, Sunken Tombs & Volcanoes' },
  { id: '06_gear_skills_powerup', recordMs: 3700, hideHud: false, banner: '4 HEROES • 20+ SKILLS', sub: 'Deep RPG Progression & Legendary Gear' },
  { id: '07_void_dragon_climax', recordMs: 5600, hideHud: true, banner: 'DEFEAT THE ANCIENT DRAGON', sub: '20-Floor Void Spire Boss Rush' },
  { id: '08_outro_cta', recordMs: 4000, hideHud: true, banner: 'PLAY FREE ON ANDROID', sub: 'Forage Ahead — Available on Google Play' },
];

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};

function startDistServer(port = 4173) {
  const distDir = path.join(ROOT, 'dist');
  const srv = http.createServer((req, res) => {
    const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const filePath = path.join(distDir, rawPath === '/' ? 'index.html' : rawPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => srv.listen(port, '127.0.0.1', () => resolve(srv)));
}

async function renderSproutBannerPng(page, shot, fontB64, trayB64) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          @font-face {
            font-family: 'SproutLandsDisplay';
            src: url('data:font/ttf;base64,${fontB64}') format('truetype');
          }
          body {
            margin: 0;
            width: 1920px;
            height: 240px;
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          .banner {
            padding: 18px 46px 22px 46px;
            background: #9c6b43;
            border-style: solid;
            border-width: 16px 16px 20px 16px;
            border-image-source: url('data:image/png;base64,${trayB64}');
            border-image-slice: 8 8 10 8 fill;
            border-image-width: 16px 16px 20px 16px;
            image-rendering: pixelated;
            text-align: center;
            box-shadow: 0 12px 32px rgba(0,0,0,0.65);
          }
          .title {
            font-family: 'SproutLandsDisplay', monospace;
            font-size: 40px;
            font-weight: 700;
            color: #ffe596;
            letter-spacing: 2px;
            text-shadow: 3px 3px 0 #2a180e, -2px -2px 0 #2a180e;
          }
          .sub {
            margin-top: 6px;
            font-family: 'SproutLandsDisplay', monospace;
            font-size: 20px;
            color: #fff6e0;
            text-shadow: 2px 2px 0 #2a180e;
          }
        </style>
      </head>
      <body>
        <div class="banner">
          <div class="title">${shot.banner}</div>
          <div class="sub">${shot.sub}</div>
        </div>
      </body>
    </html>
  `;
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(150);
  await page.screenshot({
    path: path.join(OVERLAY_DIR, `${shot.id}.png`),
    omitBackground: true,
  });
}

async function main() {
  const srv = await startDistServer(4173);

  try {
    const browser = await chromium.launch({
      headless: true,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
    });

    // 1. Render pixel-perfect Sprout Lands 9-slice caption overlays
    const fontB64 = fs.readFileSync(path.join(ROOT, 'public', 'assets', 'fonts', 'pixelFont-7-8x14-sproutLands.ttf')).toString('base64');
    const trayB64 = fs.readFileSync(path.join(ROOT, 'public', 'assets', 'sprout_ui', 'docks', 'tray_light_enclosed.png')).toString('base64');
    const overlayCtx = await browser.newContext({
      viewport: { width: 1920, height: 240 },
      deviceScaleFactor: 1,
    });
    const overlayPage = await overlayCtx.newPage();
    for (const shot of SHOTS) {
      await renderSproutBannerPng(overlayPage, shot, fontB64, trayB64);
    }
    await overlayCtx.close();
    console.log(`Rendered ${SHOTS.length} Sprout Lands overlay banners.`);

    // 2. Capture 1920x1080 gameplay shots (wait for __PROMO_READY before timing action)
    const timings = {};
    for (const shot of SHOTS) {
      const tempVideoDir = path.join(RAW_DIR, '_tmp_' + shot.id);
      fs.mkdirSync(tempVideoDir, { recursive: true });
      const ctx = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        recordVideo: { dir: tempVideoDir, size: { width: 1920, height: 1080 } },
      });
      const page = await ctx.newPage();
      page.on('pageerror', (err) => console.error(`[${shot.id} pageerror]`, err.message));
      const url = `http://127.0.0.1:4173/?promo=${shot.id}${shot.hideHud ? '&hideHud=1' : ''}`;
      console.log(`Recording ${shot.id} -> ${url}`);
      const tStart = Date.now();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__PROMO_READY === true, { timeout: 60000 });
      const loadSec = (Date.now() - tStart) / 1000;
      timings[shot.id] = Number((loadSec + 0.12).toFixed(3));
      console.log(`  Scene ready in ${loadSec.toFixed(2)}s; capturing ${shot.recordMs}ms of action...`);
      await page.waitForTimeout(shot.recordMs);

      const video = page.video();
      await ctx.close();
      if (video) {
        const srcPath = await video.path();
        const destPath = path.join(RAW_DIR, `${shot.id}.webm`);
        fs.copyFileSync(srcPath, destPath);
      }
      fs.rmSync(tempVideoDir, { recursive: true, force: true });
    }
    fs.writeFileSync(path.join(RAW_DIR, 'timings.json'), JSON.stringify(timings, null, 2));

    await browser.close();
    console.log('All promo shots captured successfully!');
  } finally {
    srv.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
