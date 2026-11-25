import { afterEach, describe, expect, it, vi } from 'vitest';
import { settingsStore } from '../src/core/GameSettings';
import { MusicAudioPlayer } from '../src/core/MusicAudioPlayer';
import { MusicEngine, musicEngine } from '../src/core/MusicEngine';
import { SFX } from '../src/core/SoundFX';
import {
  DIALOGUE_BLIP_GAP_MS,
  DIALOGUE_SPEED_MS,
  getDialogueMsPerChar,
} from '../src/ui/DialogueBox';

describe('Audio & Dialogue Settings Integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    settingsStore.reset();
  });

  describe('SoundFXManager volume controls and settingsStore sync', () => {
    it('clamps masterVolume, musicVolume, and sfxVolume between 0 and 1', () => {
      SFX.setVolume(2.5);
      expect(SFX.masterVolume).toBe(1);
      SFX.setVolume(-0.3);
      expect(SFX.masterVolume).toBe(0);

      SFX.setMusicVolume(1.8);
      expect(SFX.musicVolume).toBe(1);
      SFX.setMusicVolume(-1);
      expect(SFX.musicVolume).toBe(0);

      SFX.setSfxVolume(1.4);
      expect(SFX.sfxVolume).toBe(1);
      SFX.setSfxVolume(-0.2);
      expect(SFX.sfxVolume).toBe(0);
    });

    it('returns false from canPlay when sfxVolume is 0 (or <= 0.01)', () => {
      SFX.setMuted(false);
      SFX.setVolume(0.8);
      SFX.setSfxVolume(0);
      expect(SFX.canPlay('sfx_zero_test', 0)).toBe(false);

      SFX.setSfxVolume(0.01);
      expect(SFX.canPlay('sfx_threshold_test', 0)).toBe(false);

      SFX.setSfxVolume(0.5);
      expect(SFX.canPlay('sfx_restored_test', 0)).toBe(true);
    });

    it('syncs SFX setters into settingsStore and reacts to settingsStore updates without recursion', () => {
      SFX.setVolume(0.6);
      SFX.setMusicVolume(0.45);
      SFX.setSfxVolume(0.85);
      SFX.setMuted(true);
      SFX.setMusicEnabled(false);

      const stored = settingsStore.get().audio;
      expect(stored.masterVolume).toBeCloseTo(0.6, 5);
      expect(stored.musicVolume).toBeCloseTo(0.45, 5);
      expect(stored.sfxVolume).toBeCloseTo(0.85, 5);
      expect(stored.muted).toBe(true);
      expect(stored.musicEnabled).toBe(false);

      settingsStore.update({
        audio: {
          masterVolume: 0.9,
          musicVolume: 0.3,
          sfxVolume: 0.25,
          muted: false,
          musicEnabled: true,
        },
      });

      expect(SFX.masterVolume).toBeCloseTo(0.9, 5);
      expect(SFX.musicVolume).toBeCloseTo(0.3, 5);
      expect(SFX.sfxVolume).toBeCloseTo(0.25, 5);
      expect(SFX.muted).toBe(false);
      expect(SFX.musicEnabled).toBe(true);
    });
  });

  describe('MusicEngine.syncAudioSettings', () => {
    it('supports 3-argument backward-compatible calls (defaulting musicVolume to 1.0)', () => {
      const setVolSpy = vi.spyOn(MusicAudioPlayer.prototype, 'setVolume');
      const engine = new MusicEngine();

      engine.syncAudioSettings(true, false, 0.7);
      expect(setVolSpy).toHaveBeenLastCalledWith(expect.closeTo(0.7 * 0.28, 5));

      // Also ensure singleton accepts 3 args cleanly
      musicEngine.syncAudioSettings(true, false, 0.5);
      expect(setVolSpy).toHaveBeenLastCalledWith(expect.closeTo(0.5 * 0.28, 5));
    });

    it('applies 4th musicVolume argument, clamps it, and zeros output when muted or disabled', () => {
      const setVolSpy = vi.spyOn(MusicAudioPlayer.prototype, 'setVolume');
      const engine = new MusicEngine();

      engine.syncAudioSettings(true, false, 0.8, 0.5);
      expect(setVolSpy).toHaveBeenLastCalledWith(expect.closeTo(0.8 * 0.5 * 0.28, 5));

      engine.syncAudioSettings(true, false, 0.8, 1.8);
      expect(setVolSpy).toHaveBeenLastCalledWith(expect.closeTo(0.8 * 1.0 * 0.28, 5));

      engine.syncAudioSettings(true, false, 0.8, -0.5);
      expect(setVolSpy).toHaveBeenLastCalledWith(0);

      engine.syncAudioSettings(true, true, 0.8, 0.9);
      expect(setVolSpy).toHaveBeenLastCalledWith(0);

      engine.syncAudioSettings(false, false, 0.8, 0.9);
      expect(setVolSpy).toHaveBeenLastCalledWith(0);
    });
  });

  describe('Dialogue speed constants and settingsStore integration', () => {
    it('exports expected DIALOGUE_SPEED_MS and DIALOGUE_BLIP_GAP_MS tables', () => {
      expect(DIALOGUE_SPEED_MS).toEqual({
        slow: 34,
        normal: 18,
        fast: 8,
        instant: 0,
      });
      expect(DIALOGUE_BLIP_GAP_MS).toEqual({
        slow: 95,
        normal: 65,
        fast: 48,
        instant: 0,
      });
    });

    it('returns ms-per-char reacting to settingsStore dialogue.speed updates', () => {
      expect(getDialogueMsPerChar()).toBe(18);

      settingsStore.update({ dialogue: { speed: 'slow' } });
      expect(getDialogueMsPerChar()).toBe(34);

      settingsStore.update({ dialogue: { speed: 'fast' } });
      expect(getDialogueMsPerChar()).toBe(8);

      settingsStore.update({ dialogue: { speed: 'instant' } });
      expect(getDialogueMsPerChar()).toBe(0);

      // Explicit override still works regardless of store value
      expect(getDialogueMsPerChar('normal')).toBe(18);
    });
  });
});
