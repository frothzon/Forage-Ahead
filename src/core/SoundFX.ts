import { musicEngine, type MusicContext, type MusicSituation, type StingerId } from './MusicEngine';

export type NoiseColor = 'white' | 'pink' | 'brown';
export type RoomSpace = 'overworld' | 'dungeon';

interface ToneOpts {
  freqStart: number;
  freqEnd?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  delay?: number;
  jitter?: number;
  saturate?: boolean;
  reverb?: number;
}

interface FMOpts {
  carrierStart: number;
  carrierEnd?: number;
  modFreq: number;
  modIndex: number;
  duration: number;
  gain?: number;
  delay?: number;
  jitter?: number;
  reverb?: number;
}

interface NoiseOpts {
  color?: NoiseColor;
  duration: number;
  filterType?: BiquadFilterType;
  freqStart: number;
  freqEnd?: number;
  q?: number;
  gain?: number;
  attack?: number;
  delay?: number;
  jitter?: number;
  reverb?: number;
}

class SoundFXManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private shaperCurve: Float32Array<ArrayBuffer> | null = null;

  private noiseBuffers: Partial<Record<NoiseColor, AudioBuffer>> = {};
  private cooldowns = new Map<string, number>();
  private comboState = new Map<string, { step: number; lastMs: number }>();
  private pitchScale = 1;
  private roomSpace: RoomSpace = 'overworld';

  public muted = false;
  public masterVolume = 0.7;
  public musicEnabled = true;
  private musicTimer?: number;
  private readonly prefsKey = 'forage_ahead_audio_v1';

  constructor() {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(this.prefsKey);
        if (raw) {
          const p = JSON.parse(raw) as { muted?: boolean; masterVolume?: number; musicEnabled?: boolean };
          if (typeof p.muted === 'boolean') this.muted = p.muted;
          if (typeof p.masterVolume === 'number' && Number.isFinite(p.masterVolume)) {
            this.masterVolume = Math.max(0, Math.min(1, p.masterVolume));
          }
          if (typeof p.musicEnabled === 'boolean') this.musicEnabled = p.musicEnabled;
        }
      } catch {
        // Ignore malformed audio prefs
      }
    }
  }

  private savePrefs(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        this.prefsKey,
        JSON.stringify({ muted: this.muted, masterVolume: this.masterVolume, musicEnabled: this.musicEnabled }),
      );
    } catch {
      // Ignore storage quota errors
    }
  }

  private ensureGraph(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      const ctx = new Ctx();
      this.ctx = ctx;

      // Master -> Compressor -> Destination
      const master = ctx.createGain();
      master.gain.value = this.masterVolume;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-10, ctx.currentTime);
      comp.knee.setValueAtTime(12, ctx.currentTime);
      comp.ratio.setValueAtTime(6, ctx.currentTime);
      comp.attack.setValueAtTime(0.003, ctx.currentTime);
      comp.release.setValueAtTime(0.16, ctx.currentTime);

      const sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.9;

      // Lightweight algorithmic room/cavern reverb send (2-tap filtered feedback delay)
      const reverbSend = ctx.createGain();
      reverbSend.gain.value = this.roomSpace === 'dungeon' ? 0.28 : 0.14;

      const d1 = ctx.createDelay(0.5);
      d1.delayTime.value = 0.043;
      const d2 = ctx.createDelay(0.5);
      d2.delayTime.value = 0.079;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;

      const fb = ctx.createGain();
      fb.gain.value = 0.34;

      reverbSend.connect(d1);
      d1.connect(d2);
      d2.connect(lp);
      lp.connect(fb);
      fb.connect(d1);
      lp.connect(comp);

      sfxBus.connect(comp);
      comp.connect(master);
      master.connect(ctx.destination);

      this.masterGain = master;
      this.sfxBus = sfxBus;
      this.reverbSend = reverbSend;

      this.buildNoiseBuffers(ctx);
      this.buildSaturatorCurve();
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, this.ctx.currentTime, 0.015);
    }
    return this.ctx;
  }

  private buildNoiseBuffers(ctx: AudioContext): void {
    const len = ctx.sampleRate * 2;
    const white = ctx.createBuffer(1, len, ctx.sampleRate);
    const pink = ctx.createBuffer(1, len, ctx.sampleRate);
    const brown = ctx.createBuffer(1, len, ctx.sampleRate);

    const wData = white.getChannelData(0);
    const pData = pink.getChannelData(0);
    const bData = brown.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let lastOut = 0;

    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      wData[i] = w;

      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      pData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;

      lastOut = (lastOut + 0.02 * w) / 1.02;
      bData[i] = Math.max(-1, Math.min(1, lastOut * 3.5));
    }

    this.noiseBuffers.white = white;
    this.noiseBuffers.pink = pink;
    this.noiseBuffers.brown = brown;
  }

  private buildSaturatorCurve(): void {
    const samples = 256;
    const buf = new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT);
    const curve = new Float32Array(buf);
    const k = 3.2;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    this.shaperCurve = curve;
  }

  public canPlay(key: string, minGapMs = 30): boolean {
    if (this.muted || this.masterVolume <= 0.01) return false;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const last = this.cooldowns.get(key) ?? -Infinity;
    if (now - last < minGapMs) return false;
    this.cooldowns.set(key, now);
    return true;
  }

  public setRoomSpace(space: RoomSpace): void {
    this.roomSpace = space;
    if (this.ctx && this.reverbSend) {
      this.reverbSend.gain.setTargetAtTime(space === 'dungeon' ? 0.28 : 0.14, this.ctx.currentTime, 0.08);
    }
  }

  public setVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, this.ctx.currentTime, 0.02);
    }
    musicEngine.syncAudioSettings(this.musicEnabled, this.muted, this.masterVolume);
    this.savePrefs();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, this.ctx.currentTime, 0.02);
    }
    musicEngine.syncAudioSettings(this.musicEnabled, this.muted, this.masterVolume);
    this.savePrefs();
  }

  public setMusicEnabled(enabled: boolean, mode?: RoomSpace): void {
    this.musicEnabled = enabled;
    musicEngine.syncAudioSettings(this.musicEnabled, this.muted, this.masterVolume);
    if (enabled && mode) {
      musicEngine.setSituation(mode);
    }
    this.savePrefs();
  }

  public setMusicSituation(sit: MusicSituation): void {
    if (sit === 'dungeon' || sit === 'boss') this.setRoomSpace('dungeon');
    else if (sit === 'overworld' || sit === 'near_enemy') this.setRoomSpace('overworld');
    musicEngine.setSituation(sit);
    musicEngine.syncAudioSettings(this.musicEnabled, this.muted, this.masterVolume);
  }

  public setMusicContext(ctx: Partial<MusicContext>): void {
    musicEngine.setContext(ctx);
  }

  public playStinger(stinger: StingerId): void {
    musicEngine.playStinger(stinger);
  }

  public setMusicPaused(paused: boolean): void {
    musicEngine.setPaused(paused);
    musicEngine.syncAudioSettings(this.musicEnabled, this.muted, this.masterVolume);
  }

  public suspendAll(): void {
    this.setMusicPaused(true);
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  }

  public resumeAll(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.setMusicPaused(false);
  }

  public startAmbientMusic(mode: RoomSpace): void {
    this.setRoomSpace(mode);
    musicEngine.setSituation(mode);
    musicEngine.syncAudioSettings(this.musicEnabled, this.muted, this.masterVolume);
  }

  public stopAmbientMusic(): void {
    if (this.musicTimer) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = undefined;
    }
    musicEngine.stopScheduler();
  }

  private randFactor(jitter = 0): number {
    if (jitter <= 0) return 1;
    return 1 + (Math.random() * 2 - 1) * jitter;
  }

  public withPitchScale(scale: number, fn: () => void): void {
    const prev = this.pitchScale;
    this.pitchScale = Math.max(0.4, Math.min(2.5, scale));
    try {
      fn();
    } finally {
      this.pitchScale = prev;
    }
  }

  private getComboPitch(key: string, explicitStep?: number): number {
    const curve = [1.0, 1.12, 1.25, 1.33, 1.5];
    if (typeof explicitStep === 'number' && Number.isFinite(explicitStep)) {
      const idx = Math.max(0, Math.min(curve.length - 1, Math.floor(explicitStep)));
      return curve[idx];
    }
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const prev = this.comboState.get(key);
    const nextStep = prev && now - prev.lastMs <= 1200 ? Math.min(curve.length - 1, prev.step + 1) : 0;
    this.comboState.set(key, { step: nextStep, lastMs: now });
    return curve[nextStep];
  }

  private routeNode(node: AudioNode, reverbAmount = 0.2): void {
    if (!this.sfxBus) return;
    node.connect(this.sfxBus);
    if (reverbAmount > 0 && this.reverbSend && this.ctx) {
      const send = this.ctx.createGain();
      send.gain.value = reverbAmount;
      node.connect(send);
      send.connect(this.reverbSend);
    }
  }

  private playTone(opts: ToneOpts): void {
    const ctx = this.ensureGraph();
    if (!ctx || !this.sfxBus || this.masterVolume <= 0.01) return;

    const jit = this.randFactor(opts.jitter ?? 0) * this.pitchScale;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const dur = Math.max(0.015, opts.duration);
    const atk = Math.min(dur * 0.4, opts.attack ?? 0.005);
    const f0 = Math.max(20, opts.freqStart * jit);
    const f1 = Math.max(20, (opts.freqEnd ?? opts.freqStart) * jit);

    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = opts.type ?? 'triangle';
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) {
      osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    }

    const peak = Math.max(0.001, (opts.gain ?? 0.12) * this.randFactor(0.06));
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + atk);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    if (opts.saturate && this.shaperCurve) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.shaperCurve;
      osc.connect(shaper);
      shaper.connect(env);
    } else {
      osc.connect(env);
    }

    this.routeNode(env, opts.reverb ?? 0.18);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  private playFM(opts: FMOpts): void {
    const ctx = this.ensureGraph();
    if (!ctx || !this.sfxBus || this.masterVolume <= 0.01) return;

    const jit = this.randFactor(opts.jitter ?? 0) * this.pitchScale;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const dur = Math.max(0.02, opts.duration);
    const c0 = Math.max(20, opts.carrierStart * jit);
    const c1 = Math.max(20, (opts.carrierEnd ?? opts.carrierStart) * jit);

    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const env = ctx.createGain();

    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(c0, t0);
    if (c1 !== c0) {
      carrier.frequency.exponentialRampToValueAtTime(c1, t0 + dur);
    }

    mod.type = 'sine';
    mod.frequency.setValueAtTime(opts.modFreq * jit, t0);
    modGain.gain.setValueAtTime(opts.modIndex, t0);
    modGain.gain.exponentialRampToValueAtTime(0.01, t0 + dur * 0.7);

    const peak = Math.max(0.001, opts.gain ?? 0.1);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(env);

    this.routeNode(env, opts.reverb ?? 0.25);
    carrier.start(t0);
    mod.start(t0);
    carrier.stop(t0 + dur + 0.02);
    mod.stop(t0 + dur + 0.02);
    carrier.onended = () => {
      carrier.disconnect();
      mod.disconnect();
      modGain.disconnect();
      env.disconnect();
    };
  }

  private playNoise(opts: NoiseOpts): void {
    const ctx = this.ensureGraph();
    if (!ctx || !this.sfxBus || this.masterVolume <= 0.01) return;

    const buf = this.noiseBuffers[opts.color ?? 'pink'] ?? this.noiseBuffers.white;
    if (!buf) return;

    const jit = this.randFactor(opts.jitter ?? 0) * this.pitchScale;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const dur = Math.max(0.015, opts.duration);
    const atk = Math.min(dur * 0.35, opts.attack ?? 0.004);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType ?? 'bandpass';
    const f0 = Math.max(40, opts.freqStart * jit);
    const f1 = Math.max(40, (opts.freqEnd ?? opts.freqStart) * jit);
    filter.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) {
      filter.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    }
    filter.Q.value = opts.q ?? 1.5;

    const env = ctx.createGain();
    const peak = Math.max(0.001, (opts.gain ?? 0.14) * this.randFactor(0.08));
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + atk);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(filter);
    filter.connect(env);
    this.routeNode(env, opts.reverb ?? 0.16);

    const offset = Math.random() * Math.max(0.1, buf.duration - dur);
    src.start(t0, offset, dur + 0.01);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }

  // =========================================================================
  // FORAGING & WORLD INTERACTION
  // =========================================================================

  public playChop(comboStep?: number): void {
    if (!this.canPlay('chop', 45)) return;
    const pitch = this.getComboPitch('chop', comboStep);
    this.withPitchScale(pitch, () => {
      // Wood crack transient + hollow trunk thud
      this.playNoise({ color: 'white', duration: 0.028, filterType: 'highpass', freqStart: 1600, q: 1.0, gain: 0.14, jitter: 0.12 });
      this.playTone({ freqStart: 195, freqEnd: 78, duration: 0.085, type: 'triangle', gain: 0.14, jitter: 0.1, saturate: true });
      this.playNoise({ color: 'pink', duration: 0.06, filterType: 'bandpass', freqStart: 620, freqEnd: 280, q: 2.2, gain: 0.08, delay: 0.01 });
    });
  }

  public playMine(comboStep?: number): void {
    if (!this.canPlay('mine', 45)) return;
    const pitch = this.getComboPitch('mine', comboStep);
    this.withPitchScale(pitch, () => {
      // Metallic pickaxe clink + stone chip crumble
      this.playFM({ carrierStart: 1480, carrierEnd: 1320, modFreq: 2190, modIndex: 380, duration: 0.14, gain: 0.11, jitter: 0.09, reverb: 0.35 });
      this.playTone({ freqStart: 220, freqEnd: 95, duration: 0.055, type: 'triangle', gain: 0.08, jitter: 0.1 });
      this.playNoise({ color: 'pink', duration: 0.1, filterType: 'bandpass', freqStart: 950, freqEnd: 380, q: 1.6, gain: 0.11, delay: 0.018, jitter: 0.12 });
    });
  }

  public playBreakProp(kind: 'box' | 'pot' = 'box'): void {
    if (!this.canPlay('breakProp', 40)) return;
    if (kind === 'pot') {
      // Ceramic shatter
      this.playFM({ carrierStart: 1850, carrierEnd: 920, modFreq: 2630, modIndex: 420, duration: 0.09, gain: 0.11, jitter: 0.12 });
      this.playNoise({ color: 'white', duration: 0.13, filterType: 'highpass', freqStart: 2200, freqEnd: 1100, q: 1.2, gain: 0.14, jitter: 0.1 });
    } else {
      // Wooden crate splinter
      this.playTone({ freqStart: 155, freqEnd: 58, duration: 0.1, type: 'triangle', gain: 0.15, saturate: true, jitter: 0.1 });
      this.playNoise({ color: 'pink', duration: 0.12, filterType: 'bandpass', freqStart: 1200, freqEnd: 420, q: 1.8, gain: 0.16, jitter: 0.12 });
    }
  }

  // =========================================================================
  // COMBAT & MOVEMENT
  // =========================================================================

  public playSwing(): void {
    if (!this.canPlay('swing', 50)) return;
    // Airy blade whoosh
    this.playNoise({ color: 'pink', duration: 0.12, filterType: 'bandpass', freqStart: 1750, freqEnd: 420, q: 2.3, gain: 0.16, attack: 0.015, jitter: 0.1 });
    this.playTone({ freqStart: 260, freqEnd: 110, duration: 0.09, type: 'sine', gain: 0.05, jitter: 0.08 });
  }

  public playBowShoot(): void {
    if (!this.canPlay('bow', 50)) return;
    // Bowstring twang + arrow air zip
    this.playTone({ freqStart: 230, freqEnd: 115, duration: 0.09, type: 'triangle', gain: 0.11, jitter: 0.08 });
    this.playNoise({ color: 'white', duration: 0.09, filterType: 'bandpass', freqStart: 2800, freqEnd: 1200, q: 2.6, gain: 0.12, attack: 0.004, jitter: 0.1 });
  }

  public playHit(comboStep?: number): void {
    if (!this.canPlay('hit', 40)) return;
    const pitch = this.getComboPitch('hit', comboStep);
    this.withPitchScale(pitch, () => {
      // Crisp impact snap + saturated low punch
      this.playNoise({ color: 'white', duration: 0.032, filterType: 'bandpass', freqStart: 1900, freqEnd: 650, q: 1.4, gain: 0.14, jitter: 0.12 });
      this.playTone({ freqStart: 145, freqEnd: 42, duration: 0.11, type: 'triangle', gain: 0.18, saturate: true, jitter: 0.1 });
    });
  }

  public playPlayerHurt(): void {
    if (!this.canPlay('playerHurt', 120)) return;
    // Heavier low thud + brief warning tone
    this.playTone({ freqStart: 115, freqEnd: 38, duration: 0.16, type: 'sawtooth', gain: 0.16, saturate: true });
    this.playTone({ freqStart: 240, freqEnd: 155, duration: 0.13, type: 'triangle', gain: 0.11, delay: 0.015 });
    this.playNoise({ color: 'brown', duration: 0.12, filterType: 'lowpass', freqStart: 700, freqEnd: 180, gain: 0.15 });
  }

  public playEnemyDeath(): void {
    if (!this.canPlay('enemyDeath', 45)) return;
    // Soft pop + airy dissolve
    this.playTone({ freqStart: 320, freqEnd: 95, duration: 0.14, type: 'triangle', gain: 0.11, jitter: 0.1 });
    this.playNoise({ color: 'pink', duration: 0.16, filterType: 'bandpass', freqStart: 1400, freqEnd: 360, q: 1.8, gain: 0.1, delay: 0.02, reverb: 0.28 });
  }

  public playDash(): void {
    if (!this.canPlay('dash', 70)) return;
    // Snappy wind burst
    this.playNoise({ color: 'pink', duration: 0.14, filterType: 'bandpass', freqStart: 500, freqEnd: 1650, q: 1.9, gain: 0.15, attack: 0.012, jitter: 0.08 });
    this.playTone({ freqStart: 190, freqEnd: 360, duration: 0.1, type: 'sine', gain: 0.06, jitter: 0.06 });
  }

  public playCast(): void {
    if (!this.canPlay('cast', 55)) return;
    // Arcane shimmer: dual detuned tones + high crystalline sparkle
    this.playTone({ freqStart: 380, freqEnd: 760, duration: 0.16, type: 'sine', gain: 0.09, attack: 0.012, jitter: 0.07, reverb: 0.38 });
    this.playTone({ freqStart: 572, freqEnd: 1140, duration: 0.15, type: 'triangle', gain: 0.05, delay: 0.012, jitter: 0.07, reverb: 0.38 });
    this.playNoise({ color: 'white', duration: 0.14, filterType: 'bandpass', freqStart: 2200, freqEnd: 3800, q: 3.5, gain: 0.06, attack: 0.015, reverb: 0.35 });
  }

  public playExplosion(): void {
    if (!this.canPlay('explosion', 60)) return;
    // 3-layer boom: crack transient + sub-bass drop + brown noise rumble
    this.playNoise({ color: 'white', duration: 0.045, filterType: 'highpass', freqStart: 1100, gain: 0.22 });
    this.playTone({ freqStart: 105, freqEnd: 24, duration: 0.34, type: 'triangle', gain: 0.24, saturate: true });
    this.playNoise({ color: 'brown', duration: 0.48, filterType: 'lowpass', freqStart: 920, freqEnd: 110, q: 0.9, gain: 0.24, attack: 0.01, reverb: 0.4 });
  }

  // =========================================================================
  // LOOT, CRAFTING, FISHING & PROGRESSION
  // =========================================================================

  public playPickup(comboStep?: number): void {
    if (!this.canPlay('pickup', 35)) return;
    const pitch = this.getComboPitch('pickup', comboStep);
    this.withPitchScale(pitch, () => {
      this.playTone({ freqStart: 520, freqEnd: 790, duration: 0.075, type: 'sine', gain: 0.09, jitter: 0.08 });
      this.playTone({ freqStart: 1040, freqEnd: 1580, duration: 0.065, type: 'sine', gain: 0.04, delay: 0.018, jitter: 0.08, reverb: 0.28 });
    });
  }

  public playCoin(comboStep?: number): void {
    if (!this.canPlay('coin', 35)) return;
    const pitch = this.getComboPitch('coin', comboStep);
    this.withPitchScale(pitch, () => {
      // Crisp 2-note metallic coin clink (B5 -> E6)
      this.playFM({ carrierStart: 987.77, modFreq: 2469, modIndex: 180, duration: 0.09, gain: 0.09, jitter: 0.05, reverb: 0.3 });
      this.playFM({ carrierStart: 1318.5, modFreq: 3296, modIndex: 140, duration: 0.14, gain: 0.09, delay: 0.048, jitter: 0.05, reverb: 0.32 });
    });
  }

  public playCraft(): void {
    if (!this.canPlay('craft', 70)) return;
    // Anvil / workbench strike + warm completion chime
    this.playFM({ carrierStart: 880, modFreq: 1320, modIndex: 220, duration: 0.11, gain: 0.1, reverb: 0.3 });
    this.playTone({ freqStart: 170, freqEnd: 85, duration: 0.07, type: 'triangle', gain: 0.1, saturate: true });
    this.playTone({ freqStart: 523.25, freqEnd: 523.25, duration: 0.14, type: 'triangle', gain: 0.08, delay: 0.085, reverb: 0.35 });
    this.playTone({ freqStart: 659.25, freqEnd: 659.25, duration: 0.18, type: 'sine', gain: 0.08, delay: 0.14, reverb: 0.38 });
  }

  public playSwitch(): void {
    if (!this.canPlay('switch', 80)) return;
    // Stone sigil/lever activation
    this.playTone({ freqStart: 140, freqEnd: 210, duration: 0.12, type: 'triangle', gain: 0.14, saturate: true });
    this.playFM({ carrierStart: 620, modFreq: 930, modIndex: 120, duration: 0.16, gain: 0.08, delay: 0.04, reverb: 0.35 });
  }

  public playGateUnlock(): void {
    if (!this.canPlay('gateUnlock', 200)) return;
    // Stone rumble + ascending chime
    this.playNoise({ color: 'brown', duration: 0.42, filterType: 'lowpass', freqStart: 320, freqEnd: 110, gain: 0.18, reverb: 0.4 });
    [392, 493.88, 587.33, 783.99].forEach((n, i) => {
      this.playTone({ freqStart: n, duration: 0.24, type: 'triangle', gain: 0.09, delay: i * 0.07, reverb: 0.4 });
    });
  }

  public playChestOpen(): void {
    if (!this.canPlay('chestOpen', 150)) return;
    this.playTone({ freqStart: 180, freqEnd: 260, duration: 0.09, type: 'triangle', gain: 0.11 });
    [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => {
      this.playFM({ carrierStart: n, modFreq: n * 2, modIndex: 90, duration: 0.22, gain: 0.08, delay: 0.05 + i * 0.06, reverb: 0.38 });
    });
  }

  public playSecretJingle(): void {
    if (!this.canPlay('secretJingle', 350)) return;
    // Classic ascending discovery chime with gentle harmonic shimmer
    [587.33, 659.25, 783.99, 987.77, 1174.66].forEach((n, i) => {
      this.playTone({
        freqStart: n,
        duration: i === 4 ? 0.38 : 0.14,
        type: 'triangle',
        gain: 0.1,
        delay: i * 0.065,
        reverb: 0.45,
      });
      this.playFM({
        carrierStart: n * 2,
        modFreq: n * 3,
        modIndex: 45,
        duration: i === 4 ? 0.34 : 0.12,
        gain: 0.04,
        delay: i * 0.065,
        reverb: 0.45,
      });
    });
  }

  public playFishCast(): void {
    if (!this.canPlay('fishCast', 120)) return;
    // Line whip + water plop
    this.playNoise({ color: 'white', duration: 0.1, filterType: 'bandpass', freqStart: 2400, freqEnd: 900, q: 2.0, gain: 0.1 });
    this.playTone({ freqStart: 540, freqEnd: 220, duration: 0.11, type: 'sine', gain: 0.1, delay: 0.11, reverb: 0.25 });
    this.playTone({ freqStart: 280, freqEnd: 620, duration: 0.09, type: 'sine', gain: 0.07, delay: 0.16, reverb: 0.25 });
  }

  public playFishBite(): void {
    if (!this.canPlay('fishBite', 120)) return;
    this.playNoise({ color: 'pink', duration: 0.12, filterType: 'bandpass', freqStart: 1100, freqEnd: 500, q: 1.5, gain: 0.12 });
    this.playTone({ freqStart: 740, freqEnd: 980, duration: 0.11, type: 'triangle', gain: 0.1, delay: 0.02 });
  }

  public playFishCatch(): void {
    if (!this.canPlay('fishCatch', 150)) return;
    this.playNoise({ color: 'pink', duration: 0.18, filterType: 'bandpass', freqStart: 1400, freqEnd: 550, gain: 0.14 });
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((n, i) => {
      this.playTone({ freqStart: n, duration: 0.22, type: 'triangle', gain: 0.1, delay: 0.04 + i * 0.06, reverb: 0.38 });
      this.playFM({ carrierStart: n * 2, modFreq: n * 3, modIndex: 60, duration: 0.16, gain: 0.04, delay: 0.05 + i * 0.06, reverb: 0.4 });
    });
  }

  public playFishGo(): void {
    if (!this.canPlay('fishGo', 150)) return;
    [587.33, 880, 1174.66].forEach((n, i) => {
      this.playTone({ freqStart: n, duration: 0.14, type: 'triangle', gain: 0.1, delay: i * 0.045, reverb: 0.28 });
    });
  }

  public playFishTick(progress = 0.5): void {
    if (!this.canPlay('fishTick', 110)) return;
    const freq = 460 + Math.max(0, Math.min(1, progress)) * 520;
    this.playTone({ freqStart: freq, freqEnd: freq * 1.12, duration: 0.032, type: 'triangle', gain: 0.055, attack: 0.002, reverb: 0.08 });
  }

  public playFishFail(): void {
    if (!this.canPlay('fishFail', 150)) return;
    this.playNoise({ color: 'pink', duration: 0.14, filterType: 'lowpass', freqStart: 750, freqEnd: 250, gain: 0.1 });
    this.playTone({ freqStart: 310, freqEnd: 175, duration: 0.22, type: 'triangle', gain: 0.1, delay: 0.02, reverb: 0.25 });
  }

  public playUiClick(): void {
    if (!this.canPlay('uiClick', 30)) return;
    this.playTone({ freqStart: 640, freqEnd: 420, duration: 0.032, type: 'triangle', gain: 0.055, attack: 0.002, jitter: 0.05, reverb: 0.08 });
  }

  public playLevelUp(): void {
    if (!this.canPlay('levelUp', 200)) return;
    musicEngine.duck(0.25, 700, 600);
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => {
      const delay = i * 0.08;
      this.playTone({ freqStart: n, freqEnd: n * 1.01, duration: 0.24, type: 'triangle', gain: 0.1, delay, reverb: 0.38 });
      this.playTone({ freqStart: n * 2, duration: 0.2, type: 'sine', gain: 0.04, delay: delay + 0.01, reverb: 0.42 });
    });
  }

  public playQuestComplete(): void {
    if (!this.canPlay('questComplete', 200)) return;
    musicEngine.duck(0.28, 680, 580);
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((n, i) => {
      this.playTone({ freqStart: n, duration: 0.25, type: 'triangle', gain: 0.1, delay: i * 0.075, reverb: 0.38 });
      this.playFM({ carrierStart: n * 2, modFreq: n * 3, modIndex: 60, duration: 0.18, gain: 0.04, delay: i * 0.075, reverb: 0.42 });
    });
  }

  public playIslandUnlock(): void {
    if (!this.canPlay('islandUnlock', 250)) return;
    musicEngine.duck(0.22, 850, 700);
    this.playNoise({ color: 'pink', duration: 0.35, filterType: 'lowpass', freqStart: 450, freqEnd: 1200, gain: 0.11, attack: 0.05, reverb: 0.4 });
    [392, 493.88, 587.33, 783.99, 987.77].forEach((n, i) => {
      this.playTone({ freqStart: n, duration: 0.28, type: 'triangle', gain: 0.095, delay: i * 0.07, reverb: 0.42 });
    });
  }

  public playBossDefeat(): void {
    if (!this.canPlay('bossDefeat', 300)) return;
    musicEngine.duck(0.18, 1100, 850);
    this.playExplosion();
    [392, 493.88, 587.33, 783.99, 1046.5].forEach((n, i) => {
      const delay = 0.14 + i * 0.09;
      this.playTone({ freqStart: n, duration: 0.36, type: 'triangle', gain: 0.11, delay, reverb: 0.45 });
      this.playTone({ freqStart: n * 1.5, duration: 0.28, type: 'sine', gain: 0.045, delay: delay + 0.015, reverb: 0.45 });
    });
  }

  // =========================================================================
  // BUILDING, FARMING, CONSUMABLES, UI, DIALOGUE & REVEALS
  // =========================================================================

  public playBuildPlace(): void {
    if (!this.canPlay('buildPlace', 60)) return;
    this.playTone({ freqStart: 135, freqEnd: 65, duration: 0.11, type: 'triangle', gain: 0.16, saturate: true });
    this.playNoise({ color: 'pink', duration: 0.09, filterType: 'bandpass', freqStart: 800, freqEnd: 340, q: 1.5, gain: 0.12 });
    this.playTone({ freqStart: 280, freqEnd: 420, duration: 0.08, type: 'triangle', gain: 0.07, delay: 0.04 });
  }

  public playBuildDemolish(): void {
    if (!this.canPlay('buildDemolish', 60)) return;
    this.playTone({ freqStart: 160, freqEnd: 52, duration: 0.14, type: 'sawtooth', gain: 0.12, saturate: true });
    this.playNoise({ color: 'brown', duration: 0.16, filterType: 'lowpass', freqStart: 900, freqEnd: 200, gain: 0.15 });
  }

  public playPlantSeed(): void {
    if (!this.canPlay('plantSeed', 50)) return;
    this.playNoise({ color: 'pink', duration: 0.075, filterType: 'bandpass', freqStart: 1100, freqEnd: 500, q: 1.8, gain: 0.1, jitter: 0.12 });
    this.playTone({ freqStart: 360, freqEnd: 520, duration: 0.065, type: 'sine', gain: 0.07, delay: 0.02, jitter: 0.08 });
  }

  public playWaterSplash(): void {
    if (!this.canPlay('waterSplash', 60)) return;
    this.playNoise({ color: 'pink', duration: 0.14, filterType: 'bandpass', freqStart: 1400, freqEnd: 600, q: 1.4, gain: 0.11, jitter: 0.1 });
    this.playTone({ freqStart: 420, freqEnd: 680, duration: 0.07, type: 'sine', gain: 0.05, delay: 0.03 });
  }

  public playHarvestCrop(): void {
    if (!this.canPlay('harvestCrop', 45)) return;
    this.playNoise({ color: 'white', duration: 0.05, filterType: 'bandpass', freqStart: 2200, freqEnd: 1200, q: 1.5, gain: 0.08, jitter: 0.1 });
    this.playTone({ freqStart: 480, freqEnd: 760, duration: 0.08, type: 'triangle', gain: 0.09, jitter: 0.08 });
  }

  public playEat(): void {
    if (!this.canPlay('eat', 90)) return;
    this.playNoise({ color: 'pink', duration: 0.055, filterType: 'bandpass', freqStart: 1300, freqEnd: 700, q: 2.0, gain: 0.1, jitter: 0.12 });
    this.playNoise({ color: 'pink', duration: 0.055, filterType: 'bandpass', freqStart: 1450, freqEnd: 800, q: 2.0, gain: 0.09, delay: 0.075, jitter: 0.12 });
    this.playTone({ freqStart: 340, freqEnd: 520, duration: 0.09, type: 'sine', gain: 0.06, delay: 0.11 });
  }

  public playDrinkPotion(): void {
    if (!this.canPlay('drinkPotion', 90)) return;
    this.playTone({ freqStart: 320, freqEnd: 640, duration: 0.1, type: 'sine', gain: 0.08 });
    this.playTone({ freqStart: 540, freqEnd: 1080, duration: 0.14, type: 'sine', gain: 0.06, delay: 0.07, reverb: 0.35 });
    this.playNoise({ color: 'white', duration: 0.08, filterType: 'bandpass', freqStart: 2400, freqEnd: 3600, q: 3.0, gain: 0.04, delay: 0.08 });
  }

  public playHotbarSelect(): void {
    if (!this.canPlay('hotbar', 25)) return;
    this.playTone({ freqStart: 520, freqEnd: 680, duration: 0.032, type: 'sine', gain: 0.045, attack: 0.002, jitter: 0.04, reverb: 0.05 });
  }

  public playEquipGear(): void {
    if (!this.canPlay('equipGear', 60)) return;
    this.playFM({ carrierStart: 760, carrierEnd: 920, modFreq: 1520, modIndex: 140, duration: 0.09, gain: 0.08, reverb: 0.22 });
    this.playNoise({ color: 'pink', duration: 0.06, filterType: 'bandpass', freqStart: 1600, freqEnd: 900, gain: 0.07 });
  }

  public playUiOpen(): void {
    if (!this.canPlay('uiOpen', 50)) return;
    this.playTone({ freqStart: 380, freqEnd: 580, duration: 0.07, type: 'triangle', gain: 0.06, reverb: 0.15 });
  }

  public playUiClose(): void {
    if (!this.canPlay('uiClose', 50)) return;
    this.playTone({ freqStart: 520, freqEnd: 330, duration: 0.065, type: 'triangle', gain: 0.055, reverb: 0.12 });
  }

  public playUiError(): void {
    if (!this.canPlay('uiError', 90)) return;
    this.playTone({ freqStart: 210, freqEnd: 150, duration: 0.11, type: 'sawtooth', gain: 0.065 });
  }

  public playSkillUnlock(): void {
    if (!this.canPlay('skillUnlock', 100)) return;
    [523.25, 659.25, 987.77].forEach((n, i) => {
      this.playFM({ carrierStart: n, modFreq: n * 2, modIndex: 80, duration: 0.18, gain: 0.075, delay: i * 0.055, reverb: 0.36 });
    });
  }

  public playMarketTrade(): void {
    if (!this.canPlay('marketTrade', 60)) return;
    this.playCoin();
    this.playTone({ freqStart: 587.33, freqEnd: 880, duration: 0.1, type: 'triangle', gain: 0.07, delay: 0.05 });
  }

  public playPortalWarp(): void {
    if (!this.canPlay('portalWarp', 250)) return;
    this.playTone({ freqStart: 220, freqEnd: 880, duration: 0.38, type: 'sine', gain: 0.11, reverb: 0.48 });
    this.playNoise({ color: 'pink', duration: 0.38, filterType: 'bandpass', freqStart: 400, freqEnd: 2400, q: 2.5, gain: 0.12, reverb: 0.45 });
  }

  public playBossEnrage(): void {
    if (!this.canPlay('bossEnrage', 300)) return;
    this.playTone({ freqStart: 130, freqEnd: 52, duration: 0.45, type: 'sawtooth', gain: 0.18, saturate: true, reverb: 0.42 });
    this.playNoise({ color: 'brown', duration: 0.42, filterType: 'lowpass', freqStart: 1200, freqEnd: 240, gain: 0.2, reverb: 0.4 });
  }

  public playDialogueBlip(pitch = 1): void {
    if (!this.canPlay('dialogueBlip', 38)) return;
    const base = 360 * Math.max(0.6, Math.min(1.6, pitch));
    this.playTone({ freqStart: base, freqEnd: base * 1.08, duration: 0.036, type: 'triangle', gain: 0.045, attack: 0.003, jitter: 0.12, reverb: 0.08 });
  }

  public playRevealGrow(): void {
    if (!this.canPlay('revealGrow', 300)) return;
    this.playTone({ freqStart: 261.63, freqEnd: 523.25, duration: 0.55, type: 'sine', gain: 0.08, attack: 0.06, reverb: 0.4 });
    this.playNoise({ color: 'pink', duration: 0.5, filterType: 'bandpass', freqStart: 500, freqEnd: 2200, q: 2.0, gain: 0.06, attack: 0.08, reverb: 0.38 });
  }

  public playRevealBounce(): void {
    if (!this.canPlay('revealBounce', 250)) return;
    musicEngine.duck(0.3, 620, 520);
    // Bouncy pop + sparkling chime
    this.playTone({ freqStart: 320, freqEnd: 880, duration: 0.14, type: 'sine', gain: 0.14, attack: 0.004, reverb: 0.3 });
    this.playTone({ freqStart: 880, freqEnd: 620, duration: 0.12, type: 'triangle', gain: 0.1, delay: 0.09, reverb: 0.35 });
    [1046.5, 1318.5, 1567.98].forEach((n, i) => {
      this.playFM({ carrierStart: n, modFreq: n * 1.5, modIndex: 70, duration: 0.24, gain: 0.065, delay: 0.05 + i * 0.045, reverb: 0.42 });
    });
  }

  public playFootstep(surface: 'grass' | 'sand' | 'stone' | 'snow' = 'grass'): void {
    if (!this.canPlay('footstep', 220)) return;
    const freqMap: Record<string, number> = {
      grass: 680,
      sand: 1050,
      stone: 460,
      snow: 1350,
    };
    const freq = freqMap[surface] ?? 680;
    this.playNoise({
      color: surface === 'stone' ? 'brown' : 'pink',
      duration: 0.038,
      filterType: 'bandpass',
      freqStart: freq,
      freqEnd: freq * 0.55,
      q: 1.6,
      gain: 0.038,
      attack: 0.003,
      jitter: 0.15,
      reverb: 0.06,
    });
  }

  public playStoneCrack(): void {
    if (!this.canPlay('stoneCrack', 90)) return;
    this.playTone({ freqStart: 145, freqEnd: 55, duration: 0.14, type: 'triangle', gain: 0.12, saturate: true, reverb: 0.35 });
    this.playNoise({ color: 'white', duration: 0.09, filterType: 'bandpass', freqStart: 2200, freqEnd: 780, q: 2.2, gain: 0.14, reverb: 0.32 });
  }

  public playShatter(): void {
    if (!this.canPlay('shatter', 250)) return;
    this.playTone({ freqStart: 120, freqEnd: 34, duration: 0.38, type: 'sawtooth', gain: 0.18, saturate: true, reverb: 0.45 });
    this.playNoise({ color: 'brown', duration: 0.45, filterType: 'lowpass', freqStart: 2400, freqEnd: 220, gain: 0.24, reverb: 0.48 });
    [1318.5, 1046.5, 1567.98].forEach((f, i) => {
      this.playTone({ freqStart: f, freqEnd: f * 0.65, duration: 0.11, type: 'triangle', gain: 0.055, delay: i * 0.035, reverb: 0.38 });
    });
  }
}

export const SFX = new SoundFXManager();
