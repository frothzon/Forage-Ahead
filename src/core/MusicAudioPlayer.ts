export interface MusicTrackMeta {
  id: string;
  url: string;
  durationSec: number;
  loopStartSec: number;
  loopEndSec: number | null;
  bpm: number;
  beatsPerBar: number;
  stinger: boolean;
  crossfadeBaked?: boolean;
}

export interface MusicManifest {
  version: number;
  generatedAt: string;
  tracks: Record<string, MusicTrackMeta>;
}

export type QuantizeMode = 'immediate' | 'beat' | 'bar';

/**
 * Builds an equal-power fade-in curve (`sin(t * PI/2)`) so crossfades
 * maintain constant perceived loudness without a -3 dB midpoint dip.
 */
export function buildEqualPowerFadeIn(steps = 64): Float32Array<ArrayBuffer> {
  const n = Math.max(2, Math.floor(steps));
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    curve[i] = Math.sin(t * Math.PI * 0.5);
  }
  return curve;
}

/**
 * Builds an equal-power fade-out curve (`cos(t * PI/2)`) paired with
 * `buildEqualPowerFadeIn` so `in[i]^2 + out[i]^2 === 1.0`.
 */
export function buildEqualPowerFadeOut(steps = 64): Float32Array<ArrayBuffer> {
  const n = Math.max(2, Math.floor(steps));
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    curve[i] = Math.cos(t * Math.PI * 0.5);
  }
  return curve;
}

/**
 * Computes the next Web Audio timestamp aligned to the active track's beat or bar grid.
 */
export function computeNextQuantizedTime(
  nowSec: number,
  trackStartSec: number,
  bpm: number,
  beatsPerBar: number,
  mode: QuantizeMode,
): number {
  if (mode === 'immediate' || bpm <= 0 || beatsPerBar <= 0) {
    return nowSec;
  }
  const elapsed = nowSec - trackStartSec;
  if (elapsed <= 0) {
    return nowSec;
  }
  const beatSec = 60 / bpm;
  const gridSec = mode === 'bar' ? beatSec * beatsPerBar : beatSec;
  const steps = Math.ceil(elapsed / gridSec - 1e-6);
  return trackStartSec + steps * gridSec;
}

interface ActivePlayback {
  source: AudioBufferSourceNode;
  fadeGain: GainNode;
  meta: MusicTrackMeta;
  startedAtCtx: number;
  startOffset: number;
  bufferDuration: number;
}

/**
 * Studio-grade Web Audio AudioBuffer music player featuring equal-power crossfades,
 * deduplicated buffer caching, sample-accurate gapless looping, resume-position memory,
 * and auto-ducking stingers.
 */
export class MusicAudioPlayer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private duckGain: GainNode | null = null;

  private bufferCache = new Map<string, AudioBuffer>();
  private inFlightFetches = new Map<string, Promise<AudioBuffer | null>>();
  private positionMemory = new Map<string, number>();

  private active: ActivePlayback | null = null;
  private playToken = 0;
  private volume = 0.28;
  private duckTimer?: number;
  private stingerSource: AudioBufferSourceNode | null = null;

  private readonly fadeInCurve = buildEqualPowerFadeIn(64);
  private readonly fadeOutCurve = buildEqualPowerFadeOut(64);

  private ensureGraph(ctx: AudioContext): { master: GainNode; duck: GainNode } {
    if (this.ctx !== ctx || !this.masterGain || !this.duckGain) {
      this.ctx = ctx;
      const duck = ctx.createGain();
      duck.gain.value = 1;

      const master = ctx.createGain();
      master.gain.value = this.volume;

      duck.connect(master);
      master.connect(ctx.destination);

      this.duckGain = duck;
      this.masterGain = master;
    }
    return { master: this.masterGain, duck: this.duckGain };
  }

  public isPlaying(): boolean {
    return this.active !== null;
  }

  public getActiveTrackId(): string | null {
    return this.active?.meta.id ?? null;
  }

  public getActiveStartTime(): number {
    return this.active?.startedAtCtx ?? 0;
  }

  /**
   * Fetches and decodes an audio file, caching decoded AudioBuffers and
   * deduplicating concurrent requests for the same URL.
   */
  public async loadBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
    const cached = this.bufferCache.get(url);
    if (cached) return cached;

    const existing = this.inFlightFetches.get(url);
    if (existing) return existing;

    const promise = (async (): Promise<AudioBuffer | null> => {
      try {
        if (typeof fetch !== 'function') return null;
        const res = await fetch(url);
        if (!res.ok) return null;
        const ab = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(ab);
        this.bufferCache.set(url, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        this.inFlightFetches.delete(url);
      }
    })();

    this.inFlightFetches.set(url, promise);
    return promise;
  }

  private saveCurrentPosition(): void {
    if (!this.active || !this.ctx || this.active.meta.stinger) return;
    const { meta, startedAtCtx, startOffset, bufferDuration } = this.active;
    const elapsed = Math.max(0, this.ctx.currentTime - startedAtCtx);
    const raw = startOffset + elapsed;
    const loopStart = Math.max(0, meta.loopStartSec);
    const loopEnd =
      meta.loopEndSec !== null && meta.loopEndSec > loopStart
        ? Math.min(meta.loopEndSec, bufferDuration)
        : bufferDuration;

    let pos = raw;
    if (loopEnd > loopStart && raw >= loopEnd) {
      pos = loopStart + ((raw - loopStart) % (loopEnd - loopStart));
    } else if (bufferDuration > 0) {
      pos = Math.min(raw, Math.max(0, bufferDuration - 0.05));
    }
    this.positionMemory.set(meta.id, pos);
  }

  public clearPosition(trackId?: string): void {
    if (trackId) this.positionMemory.delete(trackId);
    else this.positionMemory.clear();
  }

  /**
   * Crossfades to the given track using equal-power curves and sample-accurate looping.
   * Returns false if the audio buffer could not be loaded (caller should fall back to synth).
   */
  public async play(
    ctx: AudioContext,
    meta: MusicTrackMeta,
    options: { fadeSec?: number; rememberPosition?: boolean; quantize?: QuantizeMode } = {},
  ): Promise<boolean> {
    const token = ++this.playToken;
    const { duck } = this.ensureGraph(ctx);

    const buffer = await this.loadBuffer(ctx, meta.url);
    if (!buffer || token !== this.playToken) {
      return false;
    }

    const fadeSec = Math.max(0.02, options.fadeSec ?? 0.8);
    const now = ctx.currentTime;
    const startTime =
      this.active && options.quantize && options.quantize !== 'immediate'
        ? computeNextQuantizedTime(
            now,
            this.active.startedAtCtx,
            this.active.meta.bpm,
            this.active.meta.beatsPerBar,
            options.quantize,
          )
        : now;

    // Fade out previous track if active
    if (this.active) {
      this.saveCurrentPosition();
      const prev = this.active;
      this.active = null;
      try {
        prev.fadeGain.gain.cancelScheduledValues(startTime);
        prev.fadeGain.gain.setValueAtTime(Math.max(0.0001, prev.fadeGain.gain.value), startTime);
        prev.fadeGain.gain.setValueCurveAtTime(this.fadeOutCurve, startTime, fadeSec);
        prev.source.stop(startTime + fadeSec + 0.03);
        prev.source.onended = () => {
          try {
            prev.source.disconnect();
            prev.fadeGain.disconnect();
          } catch {
            // ignore disconnect errors
          }
        };
      } catch {
        try {
          prev.source.stop();
        } catch {
          // ignore
        }
      }
    }

    // Prepare new source
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = !meta.stinger;
    const loopStart = Math.max(0, meta.loopStartSec);
    const loopEnd =
      meta.loopEndSec !== null && meta.loopEndSec > loopStart
        ? Math.min(meta.loopEndSec, buffer.duration)
        : buffer.duration;
    if (!meta.stinger) {
      source.loopStart = loopStart;
      source.loopEnd = loopEnd;
    }

    const fadeGain = ctx.createGain();
    fadeGain.gain.setValueAtTime(0, startTime);
    fadeGain.gain.setValueCurveAtTime(this.fadeInCurve, startTime, fadeSec);

    source.connect(fadeGain);
    fadeGain.connect(duck);

    let offset = 0;
    if (options.rememberPosition && !meta.stinger) {
      const remembered = this.positionMemory.get(meta.id) ?? 0;
      const maxOffset = Math.max(0, loopEnd - 0.05);
      offset = Math.max(0, Math.min(remembered, maxOffset));
    }

    source.start(startTime, offset);
    this.active = {
      source,
      fadeGain,
      meta,
      startedAtCtx: startTime,
      startOffset: offset,
      bufferDuration: buffer.duration,
    };

    if (meta.stinger) {
      source.onended = () => {
        if (this.active?.source === source) {
          this.active = null;
        }
      };
    }

    return true;
  }

  /**
   * Plays a one-shot stinger at full clarity while smoothly ducking active BGM,
   * then restores BGM once the stinger completes.
   */
  public async playStinger(
    ctx: AudioContext,
    meta: MusicTrackMeta,
    onDuck?: () => void,
    onRestore?: () => void,
  ): Promise<boolean> {
    this.ensureGraph(ctx);
    const buffer = await this.loadBuffer(ctx, meta.url);
    if (!buffer) return false;

    if (this.stingerSource) {
      try {
        this.stingerSource.stop();
      } catch {
        // ignore
      }
      this.stingerSource = null;
    }

    const holdMs = Math.max(400, Math.round(buffer.duration * 1000));
    onDuck?.();
    this.duck(0.22, holdMs, 600);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = false;

    const stingerGain = ctx.createGain();
    stingerGain.gain.value = Math.max(0.0001, this.volume * 1.15);

    src.connect(stingerGain);
    stingerGain.connect(ctx.destination);
    this.stingerSource = src;

    let restored = false;
    const finish = () => {
      if (restored) return;
      restored = true;
      if (this.stingerSource === src) {
        this.stingerSource = null;
      }
      try {
        src.disconnect();
        stingerGain.disconnect();
      } catch {
        // ignore
      }
      onRestore?.();
    };

    src.onended = finish;
    src.start(ctx.currentTime);
    return true;
  }

  public stop(fadeSec = 0.3): void {
    this.playToken++;
    if (!this.active) return;
    this.saveCurrentPosition();
    const prev = this.active;
    this.active = null;

    if (!this.ctx || fadeSec <= 0.01) {
      try {
        prev.source.stop();
        prev.source.disconnect();
        prev.fadeGain.disconnect();
      } catch {
        // ignore
      }
      return;
    }

    const now = this.ctx.currentTime;
    try {
      prev.fadeGain.gain.cancelScheduledValues(now);
      prev.fadeGain.gain.setValueAtTime(Math.max(0.0001, prev.fadeGain.gain.value), now);
      prev.fadeGain.gain.setValueCurveAtTime(this.fadeOutCurve, now, fadeSec);
      prev.source.stop(now + fadeSec + 0.03);
      prev.source.onended = () => {
        try {
          prev.source.disconnect();
          prev.fadeGain.disconnect();
        } catch {
          // ignore
        }
      };
    } catch {
      try {
        prev.source.stop();
      } catch {
        // ignore
      }
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, vol);
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.08);
    }
  }

  public duck(factor = 0.25, holdMs = 750, releaseMs = 650): void {
    if (!this.ctx || !this.duckGain) return;
    const clamped = Math.max(0, Math.min(1, factor));
    const now = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(now);
    this.duckGain.gain.setTargetAtTime(clamped, now, 0.025);

    if (this.duckTimer !== undefined && typeof window !== 'undefined') {
      window.clearTimeout(this.duckTimer);
    }
    if (typeof window !== 'undefined') {
      this.duckTimer = window.setTimeout(() => {
        this.duckTimer = undefined;
        if (!this.ctx || !this.duckGain) return;
        this.duckGain.gain.setTargetAtTime(1, this.ctx.currentTime, Math.max(0.05, releaseMs / 3000));
      }, Math.max(50, holdMs));
    }
  }

  public suspend(): void {
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend();
    }
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }
}
