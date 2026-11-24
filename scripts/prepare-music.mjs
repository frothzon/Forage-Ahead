import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

const SUPPORTED_EXTS = ['wav', 'flac', 'ogg', 'mp3', 'm4a'];

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function parseTimestampToSec(ts) {
  const parts = ts.split(':').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return 0;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

/**
 * Runs ffmpeg and returns combined stderr/stdout (ffmpeg writes media info to stderr).
 */
async function runFfmpeg(args, ffmpegBin = ffmpegPath) {
  if (!ffmpegBin) {
    throw new Error('ffmpeg-static binary path is not available');
  }
  const { stdout, stderr } = await execFileAsync(ffmpegBin, args, {
    maxBuffer: 16 * 1024 * 1024,
  });
  return { stdout, stderr };
}

/**
 * Probes an audio file using ffmpeg (no ffprobe required) and returns duration + volume stats.
 */
export async function inspectAudioFile(filePath, ffmpegBin = ffmpegPath) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Audio file not found: ${absPath}`);
  }

  const { stderr } = await runFfmpeg(
    ['-hide_banner', '-i', absPath, '-af', 'volumedetect', '-f', 'null', '-'],
    ffmpegBin,
  );

  const durMatch = stderr.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/);
  const timeMatches = [...stderr.matchAll(/time=(\d+:\d+:\d+(?:\.\d+)?)/g)];
  const lastTimeMatch = timeMatches.length > 0 ? timeMatches[timeMatches.length - 1] : null;

  const durationSec = durMatch
    ? parseTimestampToSec(durMatch[1])
    : lastTimeMatch
      ? parseTimestampToSec(lastTimeMatch[1])
      : 0;

  const meanMatch = stderr.match(/mean_volume:\s*([-\d.]+)\s*dB/);
  const maxMatch = stderr.match(/max_volume:\s*([-\d.]+)\s*dB/);

  const meanVolumeDb = meanMatch ? Number(meanMatch[1]) : null;
  const maxVolumeDb = maxMatch ? Number(maxMatch[1]) : null;

  const suggested =
    durationSec >= 45
      ? {
          trimStartSec: round3(durationSec * 0.25),
          trimEndSec: round3(durationSec * 0.75),
          loopStartSec: 0,
          crossfadeLoopSec: 1.5,
        }
      : {
          trimStartSec: null,
          trimEndSec: null,
          loopStartSec: 0,
          crossfadeLoopSec: durationSec > 6 ? 1.5 : 0,
        };

  return {
    filePath: absPath,
    durationSec: round3(durationSec),
    meanVolumeDb,
    maxVolumeDb,
    suggested,
  };
}

/**
 * Builds the ffmpeg -filter_complex graph for trimming, -16 LUFS mastering,
 * optional gain, and tail-into-head equal-power seamless loop baking.
 */
export function buildFilterGraph(options) {
  const {
    totalDurationSec,
    trimStartSec = null,
    trimEndSec = null,
    loopStartSec = 0,
    loopEndSec = null,
    crossfadeLoopSec = 0,
    stinger = false,
    fadeInSec = 0.02,
    fadeOutSec = 0.02,
    gainDb = 0,
  } = options;

  const baseFilters = [];

  if (trimStartSec != null || trimEndSec != null) {
    const trimParts = [];
    if (trimStartSec != null) trimParts.push(`start=${trimStartSec}`);
    if (trimEndSec != null) trimParts.push(`end=${trimEndSec}`);
    baseFilters.push(`atrim=${trimParts.join(':')}`, 'asetpts=PTS-STARTPTS');
  }

  baseFilters.push(
    'aresample=48000',
    'aformat=sample_rates=48000:channel_layouts=stereo',
    'loudnorm=I=-16:TP=-1.0:LRA=11',
  );

  if (gainDb && gainDb !== 0) {
    baseFilters.push(`volume=${gainDb}dB`);
  }

  const loopStart = Math.max(0, loopStartSec ?? 0);
  const loopEnd =
    loopEndSec != null && Number.isFinite(loopEndSec)
      ? Math.min(loopEndSec, totalDurationSec)
      : totalDurationSec;
  const loopLen = loopEnd - loopStart;
  const canBakeCrossfade =
    !stinger &&
    crossfadeLoopSec > 0 &&
    Number.isFinite(loopLen) &&
    loopLen > crossfadeLoopSec * 2.2;

  const chains = [`[0:a]${baseFilters.join(',')}[norm]`];

  if (canBakeCrossfade) {
    const d = crossfadeLoopSec;
    const tailStart = round3(loopEnd - d);
    const hasIntro = loopStart > 0.01;

    if (hasIntro) {
      chains.push('[norm]asplit=3[n_intro][n_tail][n_main]');
      const introFade = fadeInSec > 0 ? `,afade=t=in:st=0:d=${fadeInSec}` : '';
      chains.push(`[n_intro]atrim=start=0:end=${loopStart},asetpts=PTS-STARTPTS${introFade}[intro]`);
      chains.push(`[n_tail]atrim=start=${tailStart}:end=${round3(loopEnd)},asetpts=PTS-STARTPTS[tail]`);
      chains.push(`[n_main]atrim=start=${loopStart}:end=${tailStart},asetpts=PTS-STARTPTS[main]`);
      chains.push(`[tail][main]acrossfade=d=${d}:c1=qsin:c2=qsin[baked]`);
      chains.push('[intro][baked]concat=n=2:v=0:a=1[out]');
    } else {
      chains.push('[norm]asplit=2[n_tail][n_main]');
      chains.push(`[n_tail]atrim=start=${tailStart}:end=${round3(loopEnd)},asetpts=PTS-STARTPTS[tail]`);
      chains.push(`[n_main]atrim=start=0:end=${tailStart},asetpts=PTS-STARTPTS[main]`);
      chains.push(`[tail][main]acrossfade=d=${d}:c1=qsin:c2=qsin[out]`);
    }

    return {
      filterComplex: chains.join(';'),
      outputLabel: 'out',
      crossfadeBaked: true,
      effectiveLoopStartSec: round3(loopStart),
      effectiveLoopEndSec: round3(loopEnd - d),
    };
  }

  const tailFilters = [];
  if (fadeInSec > 0) {
    tailFilters.push(`afade=t=in:st=0:d=${fadeInSec}`);
  }
  if (fadeOutSec > 0) {
    tailFilters.push('areverse', `afade=t=in:st=0:d=${fadeOutSec}`, 'areverse');
  }

  if (tailFilters.length > 0) {
    chains.push(`[norm]${tailFilters.join(',')}[out]`);
  } else {
    chains.push('[norm]acopy[out]');
  }

  return {
    filterComplex: chains.join(';'),
    outputLabel: 'out',
    crossfadeBaked: false,
    effectiveLoopStartSec: stinger ? 0 : round3(loopStart),
    effectiveLoopEndSec: stinger ? null : loopEndSec != null ? round3(loopEndSec) : null,
  };
}

/**
 * Resolves the raw audio source path for a trackId, or returns null if none is present.
 */
export function resolveRawSourcePath(trackId, trackConfig, { rootDir, rawDir }) {
  if (trackConfig?.source) {
    const fromRoot = path.resolve(rootDir, trackConfig.source);
    if (fs.existsSync(fromRoot)) return fromRoot;
    const fromRaw = path.resolve(rawDir, trackConfig.source);
    if (fs.existsSync(fromRaw)) return fromRaw;
    return null;
  }

  for (const ext of SUPPORTED_EXTS) {
    const candidate = path.join(rawDir, `${trackId}.${ext}`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Processes a single track from raw audio to mastered .ogg and returns its manifest entry,
 * or null if no raw source file exists.
 */
export async function processTrack(trackId, trackConfig, options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const rawDir = options.rawDir ?? path.join(rootDir, 'music', 'raw');
  const outDir = options.outDir ?? path.join(rootDir, 'public', 'assets', 'music');
  const ffmpegBin = options.ffmpegBin ?? ffmpegPath;

  const sourcePath = resolveRawSourcePath(trackId, trackConfig, { rootDir, rawDir });
  if (!sourcePath) {
    return null;
  }

  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${trackId}.ogg`);
  const stinger = Boolean(trackConfig.stinger);

  if (trackConfig.passthrough && path.extname(sourcePath).toLowerCase() === '.ogg') {
    fs.copyFileSync(sourcePath, outPath);
    const outInfo = await inspectAudioFile(outPath, ffmpegBin);
    return {
      id: trackId,
      url: `assets/music/${trackId}.ogg`,
      durationSec: outInfo.durationSec,
      loopStartSec: stinger ? 0 : (trackConfig.loopStartSec ?? 0),
      loopEndSec: stinger ? null : (trackConfig.loopEndSec ?? outInfo.durationSec),
      bpm: trackConfig.bpm ?? 120,
      beatsPerBar: trackConfig.beatsPerBar ?? 4,
      stinger,
      crossfadeBaked: false,
    };
  }

  const inputInfo = await inspectAudioFile(sourcePath, ffmpegBin);
  const trimStart = trackConfig.trimStartSec ?? 0;
  const trimEnd = trackConfig.trimEndSec ?? inputInfo.durationSec;
  const trimmedDurationSec = Math.max(0.05, trimEnd - trimStart);

  const graph = buildFilterGraph({
    totalDurationSec: trimmedDurationSec,
    trimStartSec: trackConfig.trimStartSec ?? null,
    trimEndSec: trackConfig.trimEndSec ?? null,
    loopStartSec: trackConfig.loopStartSec ?? 0,
    loopEndSec: trackConfig.loopEndSec ?? null,
    crossfadeLoopSec: trackConfig.crossfadeLoopSec ?? 0,
    stinger,
    fadeInSec: trackConfig.fadeInSec ?? 0.02,
    fadeOutSec: trackConfig.fadeOutSec ?? 0.02,
    gainDb: trackConfig.gainDb ?? 0,
  });

  await runFfmpeg(
    [
      '-y',
      '-hide_banner',
      '-i',
      sourcePath,
      '-filter_complex',
      graph.filterComplex,
      '-map',
      `[${graph.outputLabel}]`,
      '-c:a',
      'libvorbis',
      '-q:a',
      '7',
      '-ar',
      '48000',
      '-ac',
      '2',
      outPath,
    ],
    ffmpegBin,
  );

  const outInfo = await inspectAudioFile(outPath, ffmpegBin);

  return {
    id: trackId,
    url: `assets/music/${trackId}.ogg`,
    durationSec: outInfo.durationSec,
    loopStartSec: graph.effectiveLoopStartSec,
    loopEndSec: stinger ? null : (graph.effectiveLoopEndSec ?? outInfo.durationSec),
    bpm: trackConfig.bpm ?? 120,
    beatsPerBar: trackConfig.beatsPerBar ?? 4,
    stinger,
    crossfadeBaked: graph.crossfadeBaked,
  };
}

/**
 * Processes all (or a single filtered) tracks from music/tracks.json and writes src/data/musicManifest.json.
 */
export async function prepareAllMusic(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const configPath = options.configPath ?? path.join(rootDir, 'music', 'tracks.json');
  const rawDir = options.rawDir ?? path.join(rootDir, 'music', 'raw');
  const outDir = options.outDir ?? path.join(rootDir, 'public', 'assets', 'music');
  const manifestPath =
    options.manifestPath ?? path.join(rootDir, 'src', 'data', 'musicManifest.json');
  const ffmpegBin = options.ffmpegBin ?? ffmpegPath;
  const onlyTrack = options.onlyTrack ?? null;

  const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const tracksConfig = rawConfig.tracks ?? {};

  let existingTracks = {};
  if (onlyTrack && fs.existsSync(manifestPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      existingTracks = existing.tracks ?? {};
    } catch {
      existingTracks = {};
    }
  }

  const manifestTracks = onlyTrack ? { ...existingTracks } : {};
  const processed = [];
  const skipped = [];

  for (const [trackId, trackCfg] of Object.entries(tracksConfig)) {
    if (onlyTrack && trackId !== onlyTrack) continue;

    const entry = await processTrack(trackId, trackCfg, {
      rootDir,
      rawDir,
      outDir,
      ffmpegBin,
    });

    if (entry) {
      manifestTracks[trackId] = entry;
      processed.push(trackId);
    } else {
      if (onlyTrack) delete manifestTracks[trackId];
      skipped.push(trackId);
    }
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    tracks: manifestTracks,
  };

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return { manifest, processed, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  const inspectIdx = args.indexOf('--inspect');
  if (inspectIdx !== -1) {
    const targetPath = args[inspectIdx + 1];
    if (!targetPath) {
      console.error('Usage: node scripts/prepare-music.mjs --inspect <path>');
      process.exit(1);
    }
    const info = await inspectAudioFile(targetPath);
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  const trackIdx = args.indexOf('--track');
  const onlyTrack = trackIdx !== -1 ? args[trackIdx + 1] : null;
  if (trackIdx !== -1 && !onlyTrack) {
    console.error('Usage: node scripts/prepare-music.mjs --track <trackId>');
    process.exit(1);
  }

  const { processed, skipped } = await prepareAllMusic({ onlyTrack });
  console.log(
    `[prepare-music] Processed ${processed.length} track(s), skipped ${skipped.length} missing raw track(s).`,
  );
}

const isEntrypoint =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) {
  main().catch((err) => {
    console.error('[prepare-music] Failed:', err);
    process.exit(1);
  });
}
