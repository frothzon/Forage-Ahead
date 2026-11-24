import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import ffmpegPath from 'ffmpeg-static';
import {
  buildFilterGraph,
  inspectAudioFile,
  prepareAllMusic,
  processTrack,
} from '../scripts/prepare-music.mjs';

const execFileAsync = promisify(execFile);

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forage-music-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('MusicPipeline', () => {
  it('builds filter graphs for intro+loop baking, pure loop baking, and stingers', () => {
    const pureLoop = buildFilterGraph({
      totalDurationSec: 10,
      trimStartSec: 1,
      trimEndSec: 11,
      loopStartSec: 0,
      loopEndSec: null,
      crossfadeLoopSec: 1.5,
      stinger: false,
      gainDb: -2,
    });
    expect(pureLoop.crossfadeBaked).toBe(true);
    expect(pureLoop.filterComplex).toContain('atrim=start=1:end=11');
    expect(pureLoop.filterComplex).toContain('loudnorm=I=-16:TP=-1.0:LRA=11');
    expect(pureLoop.filterComplex).toContain('volume=-2dB');
    expect(pureLoop.filterComplex).toContain('acrossfade=d=1.5:c1=qsin:c2=qsin');
    expect(pureLoop.effectiveLoopStartSec).toBe(0);
    expect(pureLoop.effectiveLoopEndSec).toBeCloseTo(8.5, 2);

    const introLoop = buildFilterGraph({
      totalDurationSec: 20,
      loopStartSec: 4,
      loopEndSec: null,
      crossfadeLoopSec: 1.5,
      stinger: false,
    });
    expect(introLoop.crossfadeBaked).toBe(true);
    expect(introLoop.filterComplex).toContain('[intro][baked]concat=n=2:v=0:a=1[out]');
    expect(introLoop.effectiveLoopStartSec).toBe(4);
    expect(introLoop.effectiveLoopEndSec).toBeCloseTo(18.5, 2);

    const stinger = buildFilterGraph({
      totalDurationSec: 3.5,
      crossfadeLoopSec: 1.5,
      stinger: true,
      fadeInSec: 0.02,
      fadeOutSec: 0.15,
    });
    expect(stinger.crossfadeBaked).toBe(false);
    expect(stinger.filterComplex).not.toContain('acrossfade');
    expect(stinger.effectiveLoopEndSec).toBeNull();
  });

  it('extracts chorus, normalizes to -16 LUFS, bakes seamless loop, and outputs .ogg', async () => {
    const tmp = makeTempDir();
    const rawDir = path.join(tmp, 'raw');
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(rawDir, { recursive: true });

    const wavPath = path.join(rawDir, 'mus_test_theme.wav');
    await execFileAsync(ffmpegPath as string, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000:duration=4',
      '-ac',
      '2',
      wavPath,
    ]);

    const inspected = await inspectAudioFile(wavPath);
    expect(inspected.durationSec).toBeCloseTo(4, 1);
    expect(inspected.meanVolumeDb).not.toBeNull();

    const entry = await processTrack(
      'mus_test_theme',
      {
        bpm: 120,
        beatsPerBar: 4,
        stinger: false,
        trimStartSec: 0.5,
        trimEndSec: 3.5,
        loopStartSec: 0,
        loopEndSec: null,
        crossfadeLoopSec: 0.5,
        fadeInSec: 0.02,
        fadeOutSec: 0.02,
        gainDb: 0,
      },
      { rootDir: tmp, rawDir, outDir },
    );

    expect(entry).not.toBeNull();
    if (!entry) throw new Error('Expected processed track entry');
    expect(entry.id).toBe('mus_test_theme');
    expect(entry.url).toBe('assets/music/mus_test_theme.ogg');
    expect(entry.crossfadeBaked).toBe(true);
    // 3.0s trimmed minus 0.5s crossfade overlap => ~2.5s baked loop
    expect(entry.durationSec).toBeGreaterThan(2.2);
    expect(entry.durationSec).toBeLessThan(2.8);

    const oggPath = path.join(outDir, 'mus_test_theme.ogg');
    expect(fs.existsSync(oggPath)).toBe(true);
    expect(fs.statSync(oggPath).size).toBeGreaterThan(1000);
  }, 20000);

  it('skips missing raw tracks gracefully in prepareAllMusic', async () => {
    const tmp = makeTempDir();
    const rawDir = path.join(tmp, 'raw');
    const outDir = path.join(tmp, 'out');
    const configPath = path.join(tmp, 'tracks.json');
    const manifestPath = path.join(tmp, 'musicManifest.json');
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        tracks: {
          mus_missing_one: { bpm: 100, beatsPerBar: 4, stinger: false },
        },
      }),
    );

    const result = await prepareAllMusic({
      rootDir: tmp,
      configPath,
      rawDir,
      outDir,
      manifestPath,
    });

    expect(result.processed).toEqual([]);
    expect(result.skipped).toEqual(['mus_missing_one']);
    expect(fs.existsSync(manifestPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(written.version).toBe(1);
    expect(written.tracks).toEqual({});
  });

  it('copies passthrough .ogg tracks byte-for-byte without re-encoding', async () => {
    const tmp = makeTempDir();
    const rawDir = path.join(tmp, 'raw');
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(rawDir, { recursive: true });

    const rawOgg = path.join(rawDir, 'mus_stinger_test.ogg');
    await execFileAsync(ffmpegPath as string, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=523.25:sample_rate=48000:duration=1.5',
      '-c:a',
      'libvorbis',
      '-q:a',
      '5',
      rawOgg,
    ]);
    const rawBytes = fs.readFileSync(rawOgg);

    const entry = await processTrack(
      'mus_stinger_test',
      {
        bpm: 120,
        beatsPerBar: 4,
        stinger: true,
        passthrough: true,
      },
      { rootDir: tmp, rawDir, outDir },
    );

    expect(entry).not.toBeNull();
    if (!entry) throw new Error('Expected passthrough entry');
    expect(entry.stinger).toBe(true);
    expect(entry.crossfadeBaked).toBe(false);
    expect(entry.loopEndSec).toBeNull();
    expect(entry.durationSec).toBeGreaterThan(1.2);

    const outBytes = fs.readFileSync(path.join(outDir, 'mus_stinger_test.ogg'));
    expect(outBytes.equals(rawBytes)).toBe(true);
  }, 15000);
});
