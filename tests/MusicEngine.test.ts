import { describe, expect, it } from 'vitest';
import musicManifestJson from '../src/data/musicManifest.json';
import {
  buildEqualPowerFadeIn,
  buildEqualPowerFadeOut,
  computeNextQuantizedTime,
  type MusicManifest,
} from '../src/core/MusicAudioPlayer';
import {
  musicEngine,
  resolveManifestTrackId,
} from '../src/core/MusicEngine';

const musicManifest = musicManifestJson as MusicManifest;

describe('MusicEngine', () => {
  it('has all 19 studio tracks in musicManifest.json with valid url and durationSec > 0', () => {
    const tracks = Object.values(musicManifest.tracks);
    expect(tracks.length).toBe(19);
    for (const t of tracks) {
      expect(t.url, `${t.id} should have a valid .ogg url`).toMatch(/^assets\/music\/.+\.ogg$/);
      expect(t.durationSec, `${t.id} should have durationSec > 0`).toBeGreaterThan(0);
    }
  });

  it('handles situation, context, pause, stinger, and lifecycle transitions safely without AudioContext', () => {
    musicEngine.syncAudioSettings(true, false, 0.7);
    musicEngine.setSituation('title');
    musicEngine.setContext({ biome: 'grass' });
    musicEngine.setSituation('overworld');
    musicEngine.setContext({ biome: 'autumn' });
    musicEngine.setSituation('near_enemy');
    musicEngine.setPaused(true);
    musicEngine.setPaused(false);
    musicEngine.setContext({ dungeonId: 'skull_crypt', floor: 1 });
    musicEngine.setSituation('dungeon');
    musicEngine.setSituation('boss');
    musicEngine.playStinger('dungeon_clear');
    musicEngine.suspend();
    musicEngine.resume();
    musicEngine.stopScheduler();
  });

  it('builds equal-power fade curves with constant power (in^2 + out^2 === 1)', () => {
    const fadeIn = buildEqualPowerFadeIn(64);
    const fadeOut = buildEqualPowerFadeOut(64);
    expect(fadeIn.length).toBe(64);
    expect(fadeOut.length).toBe(64);
    expect(fadeIn[0]).toBeCloseTo(0, 5);
    expect(fadeIn[63]).toBeCloseTo(1, 5);
    expect(fadeOut[0]).toBeCloseTo(1, 5);
    expect(fadeOut[63]).toBeCloseTo(0, 5);
    for (let i = 0; i < 64; i++) {
      const power = fadeIn[i] * fadeIn[i] + fadeOut[i] * fadeOut[i];
      expect(power).toBeCloseTo(1.0, 5);
    }
  });

  it('computes beat and bar quantized transition timestamps accurately', () => {
    // 120 BPM => 0.5s per beat, 4 beats per bar => 2.0s per bar
    expect(computeNextQuantizedTime(10.3, 10.0, 120, 4, 'immediate')).toBeCloseTo(10.3, 5);
    expect(computeNextQuantizedTime(10.3, 10.0, 120, 4, 'beat')).toBeCloseTo(10.5, 5);
    expect(computeNextQuantizedTime(10.6, 10.0, 120, 4, 'beat')).toBeCloseTo(11.0, 5);
    expect(computeNextQuantizedTime(10.3, 10.0, 120, 4, 'bar')).toBeCloseTo(12.0, 5);
    expect(computeNextQuantizedTime(12.1, 10.0, 120, 4, 'bar')).toBeCloseTo(14.0, 5);
  });

  it('resolves manifest track IDs across biomes, dungeons, void spire floors, bosses, and states', () => {
    expect(resolveManifestTrackId('title', {})).toBe('mus_title_theme');
    expect(resolveManifestTrackId('pause', {})).toBe('mus_pause');
    expect(resolveManifestTrackId('near_enemy', {})).toBe('mus_near_enemy');

    for (const biome of ['grass', 'autumn', 'graveyard', 'winter', 'infernal']) {
      expect(resolveManifestTrackId('overworld', { biome })).toBe(`mus_overworld_${biome}`);
    }

    for (const dungeonId of ['skull_crypt', 'sunken_tomb', 'frost_cavern', 'infernal_sanctum']) {
      expect(resolveManifestTrackId('dungeon', { dungeonId, floor: 1 })).toBe(`mus_dungeon_${dungeonId}`);
    }

    expect(resolveManifestTrackId('dungeon', { dungeonId: 'void_spire', floor: 1 })).toBe('mus_dungeon_void_spire');
    expect(resolveManifestTrackId('dungeon', { dungeonId: 'void_spire', floor: 10 })).toBe('mus_dungeon_void_spire');
    expect(resolveManifestTrackId('dungeon', { dungeonId: 'void_spire', floor: 11 })).toBe('mus_dungeon_void_deep');
    expect(resolveManifestTrackId('dungeon', { dungeonId: 'void_spire', floor: 20 })).toBe('mus_dungeon_void_deep');

    expect(resolveManifestTrackId('boss', { dungeonId: 'skull_crypt', floor: 1 })).toBe('mus_boss_standard');
    expect(resolveManifestTrackId('boss', { dungeonId: 'void_spire', floor: 15 })).toBe('mus_boss_standard');
    expect(resolveManifestTrackId('boss', { dungeonId: 'void_spire', floor: 20 })).toBe('mus_boss_final');
    expect(resolveManifestTrackId('boss', { isFinalBoss: true })).toBe('mus_boss_final');
  });
});
