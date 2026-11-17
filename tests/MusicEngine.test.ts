import { describe, expect, it } from 'vitest';
import { MUSIC_TRACKS, midiToFreq, musicEngine, parseNoteToken } from '../src/core/MusicEngine';

describe('MusicEngine', () => {
  it('has 9 tracks and every track is at least 60 seconds long', () => {
    const tracks = Object.values(MUSIC_TRACKS);
    expect(tracks.length).toBe(9);
    for (const t of tracks) {
      expect(t.durationSec, `${t.id} should be >= 60s`).toBeGreaterThanOrEqual(60);
      expect(t.steps.length).toBeGreaterThan(0);
    }
  });

  it('parses MIDI note tokens and converts frequencies accurately', () => {
    expect(parseNoteToken('A4')).toBe(69);
    expect(midiToFreq(69)).toBeCloseTo(440, 4);
    expect(parseNoteToken('C4')).toBe(60);
    expect(parseNoteToken('--')).toBe(-1);
    expect(parseNoteToken('.')).toBeNull();
  });

  it('rotates overworld tracks excluding the current track', () => {
    for (let i = 0; i < 10; i++) {
      const next = musicEngine.getTrackForSituation('overworld', 'mus_overworld_1');
      expect(next).not.toBe('mus_overworld_1');
      expect(next.startsWith('mus_overworld_')).toBe(true);
    }
  });

  it('handles situation and pause transitions safely without AudioContext', () => {
    musicEngine.setSituation('title');
    musicEngine.setSituation('overworld');
    musicEngine.setSituation('near_enemy');
    musicEngine.setPaused(true);
    musicEngine.setPaused(false);
    musicEngine.setSituation('dungeon');
    musicEngine.setSituation('boss');
    musicEngine.syncAudioSettings(true, false, 0.7);
    musicEngine.stopScheduler();
  });
});
