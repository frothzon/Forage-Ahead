import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALL_CONTROLLER_ACTIONS,
  DEFAULT_CONTROLLER_BINDINGS,
  GRAPHICS_PRESETS,
  LEGACY_AUDIO_PREFS_KEY,
  SETTINGS_CACHE_KEY,
  applyGraphicsPreset,
  cloneSettings,
  createDefaultSettings,
  detectGraphicsPreset,
  loadCachedSettings,
  onSettingsChange,
  rebindControllerAction,
  sanitizeSettings,
  saveCachedSettings,
  settingsStore,
} from '../src/core/GameSettings';
import { ALL_MENU_TABS, GameState } from '../src/core/GameState';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

describe('GameSettings data model & persistence', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = createMemoryStorage();
    settingsStore.reset(undefined, false);
  });

  it('creates expected desktop and mobile defaults and deep-clones cleanly', () => {
    const desktop = createDefaultSettings(false);
    expect(desktop.audio).toEqual({
      masterVolume: 0.7,
      musicVolume: 1.0,
      sfxVolume: 1.0,
      muted: false,
      musicEnabled: true,
    });
    expect(desktop.graphics).toEqual({
      preset: 'high',
      ...GRAPHICS_PRESETS.high,
    });
    expect(desktop.dialogue).toEqual({ speed: 'normal' });
    expect(desktop.controller).toEqual({
      enabled: true,
      deadzone: 0.22,
      bindings: DEFAULT_CONTROLLER_BINDINGS,
    });

    const mobile = createDefaultSettings(true);
    expect(mobile.graphics).toEqual({
      preset: 'medium',
      ...GRAPHICS_PRESETS.medium,
    });

    const cloned = cloneSettings(desktop);
    cloned.audio.masterVolume = 0.1;
    cloned.controller.bindings.dash = 15;
    expect(desktop.audio.masterVolume).toBe(0.7);
    expect(desktop.controller.bindings.dash).toBe(DEFAULT_CONTROLLER_BINDINGS.dash);
  });

  it('sanitizes malformed data, clamps numbers, and fills missing fields', () => {
    expect(sanitizeSettings(null, false)).toEqual(createDefaultSettings(false));
    expect(sanitizeSettings('invalid', false)).toEqual(createDefaultSettings(false));

    const sanitized = sanitizeSettings(
      {
        audio: {
          masterVolume: 5.5,
          musicVolume: -0.4,
          sfxVolume: Number.NaN,
          muted: 'yes',
          musicEnabled: false,
        },
        graphics: {
          preset: 'ultra',
          dynamicLighting: 'nope',
          weatherEffects: 'blizzard',
          windSway: false,
          ambientParticles: true,
          screenShake: 'extreme',
          roundPixels: true,
          fpsLimit: 144,
        },
        dialogue: {
          speed: 'warp',
        },
        controller: {
          enabled: false,
          deadzone: 0.99,
          bindings: {
            primaryAction: -4,
            dash: 99,
            interact: 3.7,
            menu: Number.POSITIVE_INFINITY,
          },
        },
      },
      false,
    );

    expect(sanitized.audio).toEqual({
      masterVolume: 1,
      musicVolume: 0,
      sfxVolume: 1.0,
      muted: false,
      musicEnabled: false,
    });
    expect(sanitized.graphics).toEqual({
      preset: 'custom',
      dynamicLighting: true,
      weatherEffects: 'full',
      windSway: false,
      ambientParticles: true,
      screenShake: 'full',
      roundPixels: true,
      fpsLimit: 60,
    });
    expect(sanitized.dialogue.speed).toBe('normal');
    expect(sanitized.controller.enabled).toBe(false);
    expect(sanitized.controller.deadzone).toBe(0.45);
    expect(sanitized.controller.bindings.primaryAction).toBe(0);
    expect(sanitized.controller.bindings.dash).toBe(24);
    expect(sanitized.controller.bindings.interact).toBe(4);
    expect(sanitized.controller.bindings.menu).toBe(DEFAULT_CONTROLLER_BINDINGS.menu);

    // Deadzone lower clamp
    const lowDeadzone = sanitizeSettings({ controller: { deadzone: 0.01 } }, false);
    expect(lowDeadzone.controller.deadzone).toBe(0.1);
  });

  it('applies graphics presets and automatically detects custom vs named presets', () => {
    const start = createDefaultSettings(false).graphics;
    expect(detectGraphicsPreset(start)).toBe('high');

    const low = applyGraphicsPreset(start, 'low');
    expect(low).toEqual({ preset: 'low', ...GRAPHICS_PRESETS.low });
    expect(detectGraphicsPreset(low)).toBe('low');

    const medium = applyGraphicsPreset(low, 'medium');
    expect(medium).toEqual({ preset: 'medium', ...GRAPHICS_PRESETS.medium });
    expect(detectGraphicsPreset(medium)).toBe('medium');

    const custom = { ...medium, roundPixels: true };
    expect(detectGraphicsPreset(custom)).toBe('custom');

    // Via settingsStore.update()
    settingsStore.update({ graphics: { preset: 'low' } });
    expect(settingsStore.get().graphics).toEqual({ preset: 'low', ...GRAPHICS_PRESETS.low });

    settingsStore.update({ graphics: { windSway: true } });
    expect(settingsStore.get().graphics.preset).toBe('custom');
    expect(settingsStore.get().graphics.windSway).toBe(true);

    // Restoring matching field brings it back to 'low'
    settingsStore.update({ graphics: { windSway: false } });
    expect(settingsStore.get().graphics.preset).toBe('low');
  });

  it('rebinds controller actions and swaps cleanly on conflicts', () => {
    const initial = { ...DEFAULT_CONTROLLER_BINDINGS };
    // primaryAction is 0, dash is 1 -> binding primaryAction to 1 swaps dash to 0
    const swapped = rebindControllerAction(initial, 'primaryAction', 1);
    expect(swapped.primaryAction).toBe(1);
    expect(swapped.dash).toBe(0);
    // Original object is not mutated
    expect(initial.primaryAction).toBe(0);
    expect(initial.dash).toBe(1);

    // Binding to an unused button updates only that action
    const unused = rebindControllerAction(swapped, 'minimap', 14);
    expect(unused.minimap).toBe(14);
    expect(unused.primaryAction).toBe(1);

    // All actions remain defined and clamped to 0..24
    const clamped = rebindControllerAction(unused, 'craft', 40);
    expect(clamped.craft).toBe(24);
    expect(Object.keys(clamped).sort()).toEqual([...ALL_CONTROLLER_ACTIONS].sort());
  });

  it('migrates legacy forage_ahead_audio_v1 when no settings cache exists', () => {
    localStorage.setItem(
      LEGACY_AUDIO_PREFS_KEY,
      JSON.stringify({
        muted: true,
        masterVolume: 0.35,
        musicEnabled: false,
      }),
    );

    const loaded = loadCachedSettings(false);
    expect(loaded.audio.muted).toBe(true);
    expect(loaded.audio.masterVolume).toBeCloseTo(0.35, 5);
    expect(loaded.audio.musicEnabled).toBe(false);
    expect(loaded.audio.musicVolume).toBe(1.0);
    expect(loaded.audio.sfxVolume).toBe(1.0);

    // Once SETTINGS_CACHE_KEY exists, it takes precedence over legacy audio key
    const updated = cloneSettings(loaded);
    updated.audio.muted = false;
    updated.audio.masterVolume = 0.85;
    updated.dialogue.speed = 'fast';
    saveCachedSettings(updated);

    const reloaded = loadCachedSettings(false);
    expect(reloaded.audio.muted).toBe(false);
    expect(reloaded.audio.masterVolume).toBeCloseTo(0.85, 5);
    expect(reloaded.dialogue.speed).toBe('fast');
    expect(localStorage.getItem(SETTINGS_CACHE_KEY)).not.toBeNull();
  });

  it('handles missing localStorage safely without throwing', () => {
    const prevStorage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    (globalThis as unknown as { localStorage?: Storage }).localStorage = undefined;
    try {
      const defaults = loadCachedSettings(false);
      expect(defaults).toEqual(createDefaultSettings(false));
      expect(() => saveCachedSettings(defaults)).not.toThrow();
    } finally {
      (globalThis as unknown as { localStorage?: Storage }).localStorage = prevStorage;
    }
  });

  it('notifies subscribers via onSettingsChange and supports section resets', () => {
    const spy = vi.fn();
    const unsub = onSettingsChange(spy);

    settingsStore.update({ audio: { sfxVolume: 0.4 }, dialogue: { speed: 'instant' } });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(settingsStore.get().audio.sfxVolume).toBeCloseTo(0.4, 5);
    expect(settingsStore.get().dialogue.speed).toBe('instant');

    settingsStore.reset('audio');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(settingsStore.get().audio.sfxVolume).toBe(1.0);
    expect(settingsStore.get().dialogue.speed).toBe('instant');

    unsub();
    settingsStore.reset();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(settingsStore.get().dialogue.speed).toBe('normal');
  });

  it('round-trips settings through GameState.save() and GameState.load()', () => {
    const gs = new GameState();
    gs.reset('Gladiator');
    gs.save(0);

    gs.updateSettings({
      audio: { masterVolume: 0.42, musicVolume: 0.55, muted: true },
      graphics: { preset: 'low' },
      dialogue: { speed: 'fast' },
      controller: {
        enabled: false,
        deadzone: 0.3,
        bindings: rebindControllerAction(DEFAULT_CONTROLLER_BINDINGS, 'dash', 0),
      },
    });

    // Mutate live settings in memory & save a different slot 1
    const gs2 = new GameState();
    gs2.setActiveSlot(1);
    gs2.reset('Sorcerer');
    gs2.updateSettings({
      audio: { masterVolume: 0.9, muted: false },
      graphics: { preset: 'high' },
      dialogue: { speed: 'slow' },
    });
    gs2.save(1);

    // Loading slot 0 restores slot 0's saved settings into live settingsStore
    const listener = vi.fn();
    const unsub = onSettingsChange(listener);
    const restored = new GameState();
    expect(restored.load(0)).toBe(true);
    unsub();

    expect(listener).toHaveBeenCalled();
    expect(restored.settings.audio.masterVolume).toBeCloseTo(0.42, 5);
    expect(restored.settings.audio.musicVolume).toBeCloseTo(0.55, 5);
    expect(restored.settings.audio.muted).toBe(true);
    expect(restored.settings.graphics).toEqual({ preset: 'low', ...GRAPHICS_PRESETS.low });
    expect(restored.settings.dialogue.speed).toBe('fast');
    expect(restored.settings.controller.enabled).toBe(false);
    expect(restored.settings.controller.deadzone).toBeCloseTo(0.3, 5);
    expect(restored.settings.controller.bindings.dash).toBe(0);
    expect(restored.settings.controller.bindings.primaryAction).toBe(1);
  });

  it('always unlocks the settings menu tab even when tutorial is incomplete', () => {
    expect(ALL_MENU_TABS).toContain('settings');

    const gs = new GameState();
    gs.debugMode = false;
    gs.startNewGameWithTutorial('Beastmaster');

    expect(gs.tutorialCompleted).toBe(false);
    expect(gs.unlockedMenuTabs.size).toBe(0);
    expect(gs.isMenuTabUnlocked('inventory')).toBe(false);
    expect(gs.isMenuTabUnlocked('craft')).toBe(false);
    expect(gs.isMenuTabUnlocked('settings')).toBe(true);
  });
});
