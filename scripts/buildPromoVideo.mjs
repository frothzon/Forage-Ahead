import ffmpegPath from 'ffmpeg-static';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, 'promo', 'raw_clips');
const OVERLAY_DIR = path.join(ROOT, 'promo', 'overlays');
const AUDIO_DIR = path.join(ROOT, 'promo', 'audio');
const STAGE_DIR = path.join(ROOT, 'promo', 'staged');
const OUT_DIR = path.join(ROOT, 'promo', 'output');

for (const d of [AUDIO_DIR, STAGE_DIR, OUT_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

const TRAILER_CLIPS = [
  { id: '01_mega_harvest_blast', recordSec: 4.2, dur: 3.5, xfade: 'fadewhite' },
  { id: '02_island_rise_cascade', recordSec: 4.2, dur: 3.5, xfade: 'fade' },
  { id: '03_hyper_factory_dusk', recordSec: 4.2, dur: 3.5, xfade: 'fade' },
  { id: '04_relic_storm_night', recordSec: 4.7, dur: 4.0, xfade: 'wipeleft' },
  { id: '05_biome_blitz_montage', recordSec: 4.7, dur: 4.0, xfade: 'fade' },
  { id: '06_gear_skills_powerup', recordSec: 3.7, dur: 3.0, xfade: 'fadewhite' },
  { id: '07_void_dragon_climax', recordSec: 5.6, dur: 5.0, xfade: 'fadeblack' },
  { id: '08_outro_cta', recordSec: 4.0, dur: 3.5, xfade: 'fade' },
];

function getMediaDurationSec(filePath) {
  const res = spawnSync(ffmpegPath, ['-i', filePath], { encoding: 'utf8' });
  const text = (res.stderr || '') + (res.stdout || '');
  const m = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

const AD_9X16_IDS = [
  '01_mega_harvest_blast',
  '02_island_rise_cascade',
  '04_relic_storm_night',
  '05_biome_blitz_montage',
  '07_void_dragon_climax',
  '08_outro_cta',
];

function runFfmpeg(args) {
  execFileSync(ffmpegPath, ['-y', ...args], { stdio: 'inherit' });
}

function generateSoundtrackWav(outPath, durationSec = 30) {
  const sr = 44100;
  const totalSamples = Math.floor(sr * durationSec);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  const bpm = 128;
  const sixteenth = 60 / bpm / 4;
  const overworldNotes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 349.23];
  const bossNotes = [220.0, 261.63, 311.13, 440.0, 349.23, 311.13, 293.66, 233.08];
  const cutTimes = [0, 3.35, 6.7, 10.05, 13.9, 17.75, 20.6, 25.45];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sr;
    const step = Math.floor(t / sixteenth);
    const stepT = t - step * sixteenth;
    const inBoss = t >= 20.6 && t < 25.45;
    const inOutro = t >= 25.45;

    const seq = inBoss ? bossNotes : overworldNotes;
    const noteHz = seq[step % seq.length] * (inOutro ? 1.25 : 1.0);
    const bassHz = (inBoss ? 110 : 130.81) * ((step >> 3) % 2 === 0 ? 1 : 1.122);

    // Chiptune pulse lead
    const leadEnv = Math.exp(-stepT * 14) * 0.16;
    const lead = ((t * noteHz) % 1 < 0.35 ? 1 : -1) * leadEnv;

    // Punchy triangle/saw bass
    const bassEnv = Math.exp(-(stepT % (sixteenth * 2)) * 9) * 0.22;
    const bass = Math.sin(2 * Math.PI * bassHz * t) * bassEnv;

    // Kick on every quarter beat (step % 4 === 0)
    let kick = 0;
    if (step % 4 === 0 && stepT < 0.11) {
      const kFreq = 140 * Math.exp(-stepT * 26) + 42;
      kick = Math.sin(2 * Math.PI * kFreq * stepT) * Math.exp(-stepT * 18) * 0.45;
    }

    // Snare/hat noise on offbeats
    let perc = 0;
    if (step % 4 === 2 && stepT < 0.08) {
      perc = (Math.sin(i * 12.9898) * 43758.5453 % 1) * Math.exp(-stepT * 32) * 0.16;
    }

    // Impact sub-boom at cut points
    let impact = 0;
    for (const ct of cutTimes) {
      const dt = t - ct;
      if (dt >= 0 && dt < 0.35) {
        impact += Math.sin(2 * Math.PI * (95 * Math.exp(-dt * 8) + 38) * dt) * Math.exp(-dt * 9) * 0.38;
      }
    }

    const fadeOut = t > durationSec - 0.8 ? Math.max(0, (durationSec - t) / 0.8) : 1;
    const mono = (lead + bass + kick + perc + impact) * fadeOut;
    left[i] = Math.max(-0.95, Math.min(0.95, mono + lead * 0.12));
    right[i] = Math.max(-0.95, Math.min(0.95, mono - lead * 0.12));
  }

  // Write 16-bit PCM Stereo WAV
  const dataSize = totalSamples * 4;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < totalSamples; i++) {
    buf.writeInt16LE(Math.round(left[i] * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(right[i] * 32767), 46 + i * 4);
  }
  fs.writeFileSync(outPath, buf);
}

function stageClip(clip, aspect) {
  const rawWebm = path.join(RAW_DIR, `${clip.id}.webm`);
  const overlayPng = path.join(OVERLAY_DIR, `${clip.id}.png`);
  const outMp4 = path.join(STAGE_DIR, `${clip.id}_${aspect}.mp4`);
  const actualRawDur = getMediaDurationSec(rawWebm);
  const trimStart = Math.max(0, Number((actualRawDur - clip.recordSec + 0.15).toFixed(3)));
  const maxAvail = Math.max(0.5, actualRawDur - trimStart);
  const targetDur = Math.min(aspect === '16x9' ? clip.dur : Math.min(2.6, clip.dur), maxAvail);

  if (aspect === '16x9') {
    const filter = [
      `[0:v]trim=start=${trimStart}:duration=${targetDur},setpts=PTS-STARTPTS,fps=60,scale=1920:1080:flags=neighbor,eq=contrast=1.06:saturation=1.14,unsharp=3:3:0.4[base]`,
      `[1:v]format=rgba,fade=t=in:st=0.05:d=0.18:alpha=1[ov]`,
      `[base][ov]overlay=0:H-245:shortest=1[v]`,
    ].join(';');
    runFfmpeg([
      '-i', rawWebm,
      '-loop', '1', '-t', String(targetDur), '-i', overlayPng,
      '-filter_complex', filter,
      '-map', '[v]',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', '-crf', '17',
      outMp4,
    ]);
  } else {
    // 9:16 vertical ad: blurred ambient background + crisp centered gameplay + top Sprout Lands hook banner
    const filter = [
      `[0:v]trim=start=${trimStart}:duration=${targetDur},setpts=PTS-STARTPTS,fps=60,eq=contrast=1.07:saturation=1.16[src]`,
      `[src]split=2[bgsrc][fgsrc]`,
      `[bgsrc]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=18:2,eq=brightness=-0.22[bg]`,
      `[fgsrc]crop=ih*0.75:ih:(iw-ih*0.75)/2:0,scale=1080:1440:flags=neighbor[fg]`,
      `[1:v]crop=1120:240:(iw-1120)/2:0,scale=1040:-1,format=rgba,fade=t=in:st=0.05:d=0.15:alpha=1[ov]`,
      `[bg][fg]overlay=0:260[comp1]`,
      `[comp1][ov]overlay=20:70:shortest=1[v]`,
    ].join(';');
    runFfmpeg([
      '-i', rawWebm,
      '-loop', '1', '-t', String(targetDur), '-i', overlayPng,
      '-filter_complex', filter,
      '-map', '[v]',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', '-crf', '18',
      outMp4,
    ]);
  }
  return outMp4;
}

function stitchWithTransitions(clips, aspect, audioPath, outFile) {
  const inputs = [];
  const durs = [];
  for (const c of clips) {
    const p = path.join(STAGE_DIR, `${c.id}_${aspect}.mp4`);
    inputs.push('-i', p);
    durs.push(getMediaDurationSec(p));
  }
  inputs.push('-i', audioPath);

  const fadeDur = 0.14;
  let filter = '';
  let prevLabel = '[0:v]';
  let offset = 0;

  for (let i = 0; i < clips.length - 1; i++) {
    offset += Math.max(0.2, durs[i] - fadeDur);
    const outLabel = i === clips.length - 2 ? '[vout]' : `[v${i + 1}]`;
    const tr = clips[i].xfade || 'fade';
    filter += `${prevLabel}[${i + 1}:v]xfade=transition=${tr}:duration=${fadeDur}:offset=${offset.toFixed(3)}${outLabel};`;
    prevLabel = outLabel;
  }

  const audioIdx = clips.length;
  filter += `[${audioIdx}:a]loudnorm=I=-14:TP=-1.5:LRA=11[aout]`;

  runFfmpeg([
    ...inputs,
    '-filter_complex', filter,
    '-map', '[vout]',
    '-map', '[aout]',
    '-shortest',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    outFile,
  ]);
}

function main() {
  const audio30 = path.join(AUDIO_DIR, 'promo_soundtrack_30s.wav');
  const audio16 = path.join(AUDIO_DIR, 'promo_soundtrack_16s.wav');
  console.log('1/4 Generating procedural chiptune & impact soundtrack...');
  generateSoundtrackWav(audio30, 30);
  generateSoundtrackWav(audio16, 16);

  console.log('2/4 Staging 16:9 & 9:16 clips with Sprout Lands 9-slice overlays...');
  for (const clip of TRAILER_CLIPS) {
    stageClip(clip, '16x9');
    if (AD_9X16_IDS.includes(clip.id)) {
      stageClip(clip, '9x16');
    }
  }

  console.log('3/4 Stitching 30s Landscape Trailer (1920x1080 @ 60fps)...');
  const out16x9 = path.join(OUT_DIR, 'forage_ahead_trailer_16x9.mp4');
  stitchWithTransitions(TRAILER_CLIPS, '16x9', audio30, out16x9);

  console.log('4/4 Stitching 15s Vertical Mobile Ad (1080x1920 @ 60fps)...');
  const adClips = TRAILER_CLIPS.filter((c) => AD_9X16_IDS.includes(c.id));
  const out9x16 = path.join(OUT_DIR, 'forage_ahead_ad_9x16.mp4');
  stitchWithTransitions(adClips, '9x16', audio16, out9x16);

  console.log(`\nPromo videos ready:\n- ${out16x9}\n- ${out9x16}`);
}

main();
