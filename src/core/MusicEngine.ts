import musicManifestJson from '../data/musicManifest.json';
import { MusicAudioPlayer, type MusicManifest } from './MusicAudioPlayer';

const musicManifest = musicManifestJson as MusicManifest;

export type MusicSituation = 'title' | 'pause' | 'overworld' | 'near_enemy' | 'dungeon' | 'boss';

export interface MusicContext {
  biome?: string;
  dungeonId?: string;
  floor?: number;
  isFinalBoss?: boolean;
}

export type StingerId = 'dungeon_clear' | 'grand_victory' | 'defeat';

/**
 * Resolves the studio music manifest track ID for a given situation and gameplay context.
 */
export function resolveManifestTrackId(situation: MusicSituation, ctx: MusicContext): string {
  switch (situation) {
    case 'title':
      return 'mus_title_theme';
    case 'pause':
      return 'mus_pause';
    case 'near_enemy':
      return 'mus_near_enemy';
    case 'overworld':
      return `mus_overworld_${ctx.biome ?? 'grass'}`;
    case 'dungeon':
      if (ctx.dungeonId === 'void_spire' && (ctx.floor ?? 0) >= 11) {
        return 'mus_dungeon_void_deep';
      }
      return `mus_dungeon_${ctx.dungeonId ?? 'skull_crypt'}`;
    case 'boss':
      if (ctx.isFinalBoss || (ctx.dungeonId === 'void_spire' && (ctx.floor ?? 0) >= 20)) {
        return 'mus_boss_final';
      }
      return 'mus_boss_standard';
  }
}

/**
 * Coordinates studio `.ogg` soundtrack playback across game situations, contexts,
 * pause states, and stingers using `MusicAudioPlayer` and `musicManifest.json`.
 */
export class MusicEngine {
  private ctx: AudioContext | null = null;
  private situation: MusicSituation = 'title';
  private musicCtx: MusicContext = {};
  private audioPlayer = new MusicAudioPlayer();
  private paused = false;
  private enabled = false;
  private masterVolume = 0.7;
  private musicVolume = 1.0;
  private muted = false;

  public setContext(ctx: Partial<MusicContext>): void {
    this.musicCtx = { ...this.musicCtx, ...ctx };
    if (this.paused || !this.enabled || this.muted) return;

    const manifestId = resolveManifestTrackId(this.situation, this.musicCtx);
    const meta = musicManifest.tracks[manifestId];
    if (meta && this.audioPlayer.getActiveTrackId() !== meta.id) {
      this.transitionTo(this.situation, 1.4);
    }
  }

  public playStinger(stinger: StingerId): void {
    if (!this.enabled || this.muted) return;
    const meta =
      musicManifest.tracks[`mus_stinger_${stinger}`] ??
      musicManifest.tracks[`stinger_${stinger}`] ??
      musicManifest.tracks[stinger];
    if (!meta) return;

    const ctx = this.ensureContext();
    if (!ctx) return;
    void this.audioPlayer.playStinger(ctx, meta);
  }

  public syncAudioSettings(
    enabled: boolean,
    muted: boolean,
    masterVolume: number,
    musicVolume = 1.0,
  ): void {
    this.enabled = enabled;
    this.muted = muted;
    this.masterVolume = masterVolume;
    this.musicVolume = Math.max(0, Math.min(1, musicVolume));
    const target = !enabled || muted ? 0 : masterVolume * this.musicVolume * 0.28;
    this.audioPlayer.setVolume(target);
    if (!enabled || muted) {
      this.audioPlayer.stop(0.2);
    } else if (!this.audioPlayer.isPlaying() && typeof window !== 'undefined') {
      this.startCurrentTrack();
    }
  }

  public setSituation(sit: MusicSituation): void {
    if (this.situation === sit && this.audioPlayer.isPlaying()) return;
    this.situation = sit;
    if (!this.paused && this.enabled && !this.muted) {
      this.transitionTo(sit, sit === 'near_enemy' ? 0.55 : 1.4);
    }
  }

  public setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!this.enabled || this.muted) return;
    const targetSit = paused ? 'pause' : this.situation;
    this.transitionTo(targetSit, 0.55);
  }

  public duck(factor = 0.25, holdMs = 750, releaseMs = 650): void {
    if (!this.enabled || this.muted) return;
    this.audioPlayer.duck(factor, holdMs, releaseMs);
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
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

  private startCurrentTrack(): void {
    const sit = this.paused ? 'pause' : this.situation;
    this.transitionTo(sit, 0.8);
  }

  private transitionTo(sit: MusicSituation, fadeSec: number): void {
    const manifestId = resolveManifestTrackId(sit, this.musicCtx);
    const meta = musicManifest.tracks[manifestId];
    if (!meta) return;

    const ctx = this.ensureContext();
    if (!ctx) return;

    this.audioPlayer.setVolume(!this.enabled || this.muted ? 0 : this.masterVolume * this.musicVolume * 0.28);
    void this.audioPlayer.play(ctx, meta, {
      fadeSec,
      rememberPosition: sit === 'overworld',
    });
  }

  public suspend(): void {
    this.audioPlayer.suspend();
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend();
    }
  }

  public resume(): void {
    this.audioPlayer.resume();
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public stopScheduler(): void {
    this.audioPlayer.stop(0.2);
  }
}

export const musicEngine = new MusicEngine();
