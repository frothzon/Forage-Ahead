class SoundFXManager {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureCtx(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private tone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType = 'triangle',
    gainVal = 0.08,
  ): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    gain.gain.setValueAtTime(gainVal, now);
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
