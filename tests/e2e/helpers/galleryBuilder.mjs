import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { E2E_CONFIG } from '../playwright.config.mjs';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDuration(ms) {
  const num = Number(ms) || 0;
  if (num < 1000) return `${Math.round(num)}ms`;
  return `${(num / 1000).toFixed(2)}s`;
}

function getGitCommitShort() {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: E2E_CONFIG.rootDir,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

function renderTelemetryPills(telemetry) {
  if (!telemetry || typeof telemetry !== 'object') {
    return '<span class="pill pill-muted">no telemetry</span>';
  }
  const pills = [];
  if (telemetry.scene) pills.push(`<span class="pill">scene: <b>${escapeHtml(telemetry.scene)}</b></span>`);
  if (telemetry.heroClass) pills.push(`<span class="pill">hero: <b>${escapeHtml(telemetry.heroClass)}</b></span>`);
  if (telemetry.level !== undefined && telemetry.level !== null) {
    pills.push(`<span class="pill">lv: <b>${escapeHtml(telemetry.level)}</b></span>`);
  }
  if (telemetry.hp !== undefined && telemetry.maxHp !== undefined) {
    pills.push(`<span class="pill">hp: <b>${escapeHtml(telemetry.hp)}/${escapeHtml(telemetry.maxHp)}</b></span>`);
  }
  if (telemetry.coins !== undefined && telemetry.coins !== null) {
    pills.push(`<span class="pill">coins: <b>${escapeHtml(telemetry.coins)}</b></span>`);
  }
  if (pills.length === 0) {
    return '<span class="pill pill-muted">telemetry empty</span>';
  }
  return pills.join('\n');
}

function renderCard(result) {
  const isPass = result.status === 'pass';
  const statusClass = isPass ? 'pass' : 'fail';
  const category = result.category || 'General';
  const screenshots = Array.isArray(result.screenshots) ? result.screenshots : [];
  const assertions = Array.isArray(result.assertions) ? result.assertions : [];
  const errors = Array.isArray(result.errors) ? result.errors : [];

  const videoHtml = result.video
    ? `<div class="media-video">
        <div class="media-label">Session Recording</div>
        <video controls loop muted autoplay playsinline preload="metadata" src="${escapeHtml(result.video)}"></video>
      </div>`
    : `<div class="media-video media-empty">No video recorded</div>`;

  const thumbsHtml =
    screenshots.length > 0
      ? screenshots
          .map((shot, idx) => {
            const shotPath = typeof shot === 'string' ? shot : shot.path;
            const shotLabel = typeof shot === 'string' ? `Keyframe ${idx + 1}` : shot.label || `Keyframe ${idx + 1}`;
            return `<button type="button" class="thumb-btn" data-lightbox-src="${escapeHtml(shotPath)}" data-lightbox-caption="${escapeHtml(result.title)} — ${escapeHtml(shotLabel)}">
              <img src="${escapeHtml(shotPath)}" alt="${escapeHtml(shotLabel)}" loading="lazy" />
              <span class="thumb-caption">${escapeHtml(shotLabel)}</span>
            </button>`;
          })
          .join('\n')
      : '<div class="media-empty">No screenshots captured</div>';

  const assertionsHtml =
    assertions.length > 0
      ? `<ul class="assertion-list">${assertions
          .map((a) => `<li><span class="check">&#10003;</span> ${escapeHtml(a)}</li>`)
          .join('')}</ul>`
      : '<p class="muted-note">No explicit assertions logged.</p>';

  const errorParts = [];
  if (result.failureMessage) errorParts.push(result.failureMessage);
  for (const err of errors) errorParts.push(err);

  const errorsHtml =
    errorParts.length > 0
      ? `<div class="card-errors">
          <div class="error-title">Errors / Failure Details</div>
          <pre>${escapeHtml(errorParts.join('\n\n'))}</pre>
        </div>`
      : '';

  return `<article class="card card-${statusClass}" data-status="${statusClass}" data-category="${escapeHtml(category)}">
    <header class="card-header">
      <div class="card-title-row">
        <span class="badge badge-${statusClass}">${isPass ? 'PASS' : 'FAIL'}</span>
        <span class="category-tag">${escapeHtml(category)}</span>
        <h2 class="card-title">${escapeHtml(result.title || result.id)}</h2>
      </div>
      <div class="card-meta">
        <span class="test-id">${escapeHtml(result.id)}</span>
        <span class="duration">${formatDuration(result.durationMs)}</span>
      </div>
    </header>

    <div class="telemetry-row">
      ${renderTelemetryPills(result.telemetry)}
    </div>

    <div class="media-grid">
      ${videoHtml}
      <div class="media-shots">
        <div class="media-label">Keyframes (${screenshots.length})</div>
        <div class="thumbs-grid">
          ${thumbsHtml}
        </div>
      </div>
    </div>

    <div class="card-details">
      <div class="detail-label">Assertions</div>
      ${assertionsHtml}
      ${errorsHtml}
    </div>
  </article>`;
}

/**
 * Writes `qa-artifacts/summary.json` and `qa-artifacts/report.html`.
 * @param {object} runSummary
 */
export function buildGalleryReport(runSummary) {
  fs.mkdirSync(E2E_CONFIG.artifactsDir, { recursive: true });

  const commit = runSummary.commit || getGitCommitShort();
  const timestamp = runSummary.timestamp || new Date().toISOString();
  const results = Array.isArray(runSummary.results) ? runSummary.results : [];
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status !== 'pass').length;
  const totalDurationMs = runSummary.totalDurationMs ?? results.reduce((acc, r) => acc + (r.durationMs || 0), 0);

  const summaryPayload = {
    timestamp,
    commit,
    total: results.length,
    passed,
    failed,
    totalDurationMs,
    results,
  };

  fs.writeFileSync(E2E_CONFIG.summaryPath, JSON.stringify(summaryPayload, null, 2), 'utf-8');

  const allErrors = [];
  for (const r of results) {
    if (r.failureMessage) {
      allErrors.push(`[${r.id}] ${r.failureMessage}`);
    }
    if (Array.isArray(r.errors)) {
      for (const e of r.errors) {
        allErrors.push(`[${r.id}] ${e}`);
      }
    }
  }

  const globalErrorSection =
    allErrors.length > 0
      ? `<details class="global-errors" open>
          <summary>Error Log (${allErrors.length} item${allErrors.length === 1 ? '' : 's'})</summary>
          <pre>${escapeHtml(allErrors.join('\n\n'))}</pre>
        </details>`
      : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Forage-Ahead QA Visual Review Gallery</title>
  <style>
    :root {
      --bg: #0d1117;
      --surface: #161b22;
      --surface-2: #1f2630;
      --border: #30363d;
      --text: #e6edf3;
      --muted: #8b949e;
      --pass: #2ea043;
      --pass-bg: rgba(46, 160, 67, 0.16);
      --fail: #f85149;
      --fail-bg: rgba(248, 81, 73, 0.16);
      --accent: #58a6ff;
      --gold: #d29922;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px 20px 64px;
    }
    .header {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 18px;
    }
    .header-top {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .header h1 {
      margin: 0;
      font-size: 1.45rem;
      letter-spacing: 0.2px;
    }
    .header-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      color: var(--muted);
      font-size: 0.875rem;
      margin-top: 8px;
    }
    .header-meta code {
      background: var(--surface-2);
      padding: 2px 6px;
      border-radius: 6px;
      color: var(--accent);
    }
    .stats {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .stat-box {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 14px;
      font-size: 0.9rem;
      font-weight: 600;
    }
    .stat-pass { color: #3fb950; border-color: rgba(63, 185, 80, 0.4); }
    .stat-fail { color: #ff7b72; border-color: rgba(248, 81, 73, 0.4); }
    .global-errors {
      margin-top: 16px;
      background: var(--fail-bg);
      border: 1px solid rgba(248, 81, 73, 0.45);
      border-radius: 8px;
      padding: 10px 14px;
    }
    .global-errors summary {
      cursor: pointer;
      font-weight: 600;
      color: #ff7b72;
    }
    .global-errors pre, .card-errors pre {
      margin: 10px 0 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 0.82rem;
      color: #ffdcd7;
      background: rgba(0, 0, 0, 0.3);
      padding: 10px;
      border-radius: 6px;
    }
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 20px;
    }
    .filter-btn {
      background: var(--surface);
      color: var(--muted);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 7px 15px;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .filter-btn:hover { color: var(--text); border-color: var(--accent); }
    .filter-btn.active {
      background: var(--accent);
      color: #0d1117;
      border-color: var(--accent);
    }
    .cards {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
    }
    .card-fail { border-color: rgba(248, 81, 73, 0.55); }
    .card.hidden { display: none; }
    .card-header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }
    .card-title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }
    .card-title {
      margin: 0;
      font-size: 1.12rem;
    }
    .badge {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 3px 9px;
      border-radius: 6px;
      letter-spacing: 0.5px;
    }
    .badge-pass { background: var(--pass-bg); color: #3fb950; border: 1px solid rgba(63, 185, 80, 0.4); }
    .badge-fail { background: var(--fail-bg); color: #ff7b72; border: 1px solid rgba(248, 81, 73, 0.4); }
    .category-tag {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 3px 9px;
      border-radius: 999px;
      background: rgba(88, 166, 255, 0.14);
      color: var(--accent);
      border: 1px solid rgba(88, 166, 255, 0.3);
    }
    .card-meta {
      display: flex;
      gap: 12px;
      color: var(--muted);
      font-size: 0.85rem;
    }
    .telemetry-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 14px;
    }
    .pill {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 3px 9px;
      font-size: 0.8rem;
      color: var(--muted);
    }
    .pill b { color: var(--text); }
    .pill-muted { opacity: 0.7; }
    .media-grid {
      display: grid;
      grid-template-columns: minmax(280px, 1.1fr) minmax(280px, 1.3fr);
      gap: 16px;
      align-items: start;
    }
    @media (max-width: 900px) {
      .media-grid { grid-template-columns: 1fr; }
    }
    .media-label, .detail-label {
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--muted);
      margin-bottom: 6px;
      font-weight: 600;
    }
    .media-video video {
      width: 100%;
      max-height: 360px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: #000;
    }
    .media-empty {
      padding: 20px;
      border: 1px dashed var(--border);
      border-radius: 8px;
      color: var(--muted);
      font-size: 0.85rem;
      text-align: center;
    }
    .thumbs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 10px;
    }
    .thumb-btn {
      display: flex;
      flex-direction: column;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0;
      overflow: hidden;
      cursor: pointer;
      text-align: left;
      transition: transform 0.12s ease, border-color 0.12s ease;
    }
    .thumb-btn:hover {
      transform: translateY(-2px);
      border-color: var(--accent);
    }
    .thumb-btn img {
      width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      display: block;
      background: #000;
    }
    .thumb-caption {
      padding: 6px 8px;
      font-size: 0.78rem;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card-details {
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
    }
    .assertion-list {
      margin: 0;
      padding-left: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.86rem;
    }
    .check { color: #3fb950; font-weight: 700; margin-right: 6px; }
    .muted-note { color: var(--muted); font-size: 0.85rem; margin: 0; }
    .card-errors {
      margin-top: 12px;
      background: var(--fail-bg);
      border: 1px solid rgba(248, 81, 73, 0.45);
      border-radius: 8px;
      padding: 10px 12px;
    }
    .error-title { color: #ff7b72; font-weight: 600; font-size: 0.85rem; }
    .lightbox {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.88);
      display: none;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      padding: 24px;
      z-index: 9999;
    }
    .lightbox.open { display: flex; }
    .lightbox img {
      max-width: 95vw;
      max-height: 82vh;
      border-radius: 8px;
      border: 1px solid var(--border);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.75);
    }
    .lightbox-bar {
      margin-top: 12px;
      display: flex;
      align-items: center;
      gap: 16px;
      color: var(--text);
      font-size: 0.92rem;
    }
    .lightbox-close {
      background: var(--surface-2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 12px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="container">
    <section class="header">
      <div class="header-top">
        <div>
          <h1>Forage-Ahead — Playwright QA Visual Review</h1>
          <div class="header-meta">
            <span>Timestamp: <code>${escapeHtml(timestamp)}</code></span>
            <span>Commit: <code>${escapeHtml(commit)}</code></span>
            <span>Duration: <code>${formatDuration(totalDurationMs)}</code></span>
          </div>
        </div>
        <div class="stats">
          <div class="stat-box">Total: ${results.length}</div>
          <div class="stat-box stat-pass">Passed: ${passed}</div>
          <div class="stat-box stat-fail">Failed: ${failed}</div>
        </div>
      </div>
      ${globalErrorSection}
    </section>

    <nav class="filter-bar" aria-label="Filter scenarios">
      <button type="button" class="filter-btn active" data-filter="All">All</button>
      <button type="button" class="filter-btn" data-filter="Failed">Failed</button>
      <button type="button" class="filter-btn" data-filter="Overworld">Overworld</button>
      <button type="button" class="filter-btn" data-filter="Dungeons">Dungeons</button>
      <button type="button" class="filter-btn" data-filter="UI">UI</button>
      <button type="button" class="filter-btn" data-filter="Mobile">Mobile</button>
    </nav>

    <main class="cards">
      ${results.map(renderCard).join('\n')}
    </main>
  </div>

  <div class="lightbox" id="lightbox" role="dialog" aria-modal="true">
    <img id="lightbox-img" src="" alt="" />
    <div class="lightbox-bar">
      <span id="lightbox-caption"></span>
      <button type="button" class="lightbox-close" id="lightbox-close">Close (Esc)</button>
    </div>
  </div>

  <script>
    (function () {
      const buttons = document.querySelectorAll('.filter-btn');
      const cards = document.querySelectorAll('.card');

      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          buttons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          const filter = btn.dataset.filter;
          cards.forEach((card) => {
            if (filter === 'All') {
              card.classList.remove('hidden');
            } else if (filter === 'Failed') {
              card.classList.toggle('hidden', card.dataset.status !== 'fail');
            } else {
              const cat = (card.dataset.category || '').toLowerCase();
              card.classList.toggle('hidden', cat !== filter.toLowerCase());
            }
          });
        });
      });

      const lightbox = document.getElementById('lightbox');
      const lbImg = document.getElementById('lightbox-img');
      const lbCap = document.getElementById('lightbox-caption');
      const lbClose = document.getElementById('lightbox-close');

      document.querySelectorAll('.thumb-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          lbImg.src = btn.dataset.lightboxSrc;
          lbCap.textContent = btn.dataset.lightboxCaption || '';
          lightbox.classList.add('open');
        });
      });

      function closeLightbox() {
        lightbox.classList.remove('open');
        lbImg.src = '';
      }

      lbClose.addEventListener('click', closeLightbox);
      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLightbox();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightbox.classList.contains('open')) {
          closeLightbox();
        }
      });
    })();
  </script>
</body>
</html>
`;

  fs.writeFileSync(E2E_CONFIG.reportPath, html, 'utf-8');
  return {
    summaryPath: E2E_CONFIG.summaryPath,
    reportPath: E2E_CONFIG.reportPath,
    passed,
    failed,
    total: results.length,
  };
}
