import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'qa-artifacts');

export const E2E_CONFIG = {
  rootDir: ROOT_DIR,
  distDir: path.join(ROOT_DIR, 'dist'),
  specsDir: path.join(ROOT_DIR, 'tests', 'e2e', 'specs'),
  port: 4173,
  host: '127.0.0.1',
  baseUrl: 'http://127.0.0.1:4173',
  workers: 1,
  defaultViewport: { width: 1280, height: 720 },
  artifactsDir: ARTIFACTS_DIR,
  screenshotsDir: path.join(ARTIFACTS_DIR, 'screenshots'),
  videosDir: path.join(ARTIFACTS_DIR, 'videos'),
  tempVideosDir: path.join(ARTIFACTS_DIR, '_tmp_videos'),
  reportPath: path.join(ARTIFACTS_DIR, 'report.html'),
  summaryPath: path.join(ARTIFACTS_DIR, 'summary.json'),
  launchArgs: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
  ],
  defaultTimeoutMs: 45000,
};
