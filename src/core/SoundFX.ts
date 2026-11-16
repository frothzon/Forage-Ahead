class SoundFXManager {
  private ctx: AudioContext | null = null;
  public muted = false;
  public masterVolume = 0.7;
  public musicEnabled = false;
  private musicTimer?: number;
  private musicStep = 0;
  private musicMode: 'overworld' | 'dungeon' = 'overworld';

  private ensureCtx(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public setVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
  }

  public setMusicEnabled(enabled: boolean, mode?: 'overworld' | 'dungeon'): void {
    this.musicEnabled = enabled;
    if (mode) this.musicMode = mode;
    if (enabled) {
      this.startAmbientMusic(this.musicMode);
    } else {
      this.stopAmbientMusic();
    }
  }

  public startAmbientMusic(mode: 'overworld' | 'dungeon'): void {
    this.musicMode = mode;
    if (!this.musicEnabled || typeof window === 'undefined') return;
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    const overworldNotes = [261.63, 293.66, 329.63, 392.0, 440.0, 392.0, 329.63, 293.66];
    const dungeonNotes = [196.0, 220.0, 233.08, 293.66, 261.63, 233.08, 220.0, 174.61];
    this.musicTimer = window.setInterval(() => {
      if (!this.musicEnabled || this.muted || this.masterVolume <= 0.01) return;
      const scale = this.musicMode === 'dungeon' ? dungeonNotes : overworldNotes;
      const freq = scale[this.musicStep % scale.length];
      this.musicStep += 1;
      this.tone(freq, freq * 1.005, 0.38, this.musicMode === 'dungeon' ? 'triangle' : 'sine', 0.025);
    }, 520);
  }

  public stopAmbientMusic(): void {
    if (this.musicTimer) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = undefined;
    }
  }

  private tone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType = 'triangle',
    gainVal = 0.08,
  ): void {
    const ctx = this.ensureCtx();
    if (!ctx || this.masterVolume <= 0.01) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    gain.gain.setValueAtTime(gainVal * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  playChop(): void {
    this.tone(180, 90, 0.08, 'square', 0.06);
  }
  playMine(): void {
    this.tone(520, 260, 0.09, 'triangle', 0.07);
  }
  playSwing(): void {
    this.tone(320, 140, 0.1, 'sawtooth', 0.05);
  }
  playHit(): void {
    this.tone(150, 55, 0.11, 'sawtooth', 0.09);
  }
  playPickup(): void {
    this.tone(580, 880, 0.07, 'sine', 0.06);
  }
  playCoin(): void {
    this.tone(920, 1380, 0.11, 'triangle', 0.07);
  }
  playDash(): void {
    this.tone(240, 480, 0.1, 'sine', 0.05);
  }
  playCast(): void {
    this.tone(420, 820, 0.14, 'sine', 0.06);
  }
  playExplosion(): void {
    this.tone(140, 32, 0.28, 'sawtooth', 0.12);
  }
  playCraft(): void {
    this.tone(440, 660, 0.12, 'triangle', 0.08);
    setTimeout(() => this.tone(660, 880, 0.14, 'triangle', 0.07), 70);
  }
  playLevelUp(): void {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => {
      setTimeout(() => this.tone(n, n * 1.03, 0.14, 'triangle', 0.08), i * 85);
    });
  }
}

export const SFX = new SoundFXManager();
