import { describe, expect, it } from 'vitest';
import { EFFECT_SEQUENCES } from '../src/data/effectSequences';
import { Haptics } from '../src/core/Haptics';
import { MusicEngine } from '../src/core/MusicEngine';
import { SFX } from '../src/core/SoundFX';

describe('EffectSequences & Audio/Haptics Feel', () => {
  it('defines all high-impact effect sequences with valid steps', () => {
    const required = [
      'node_break_wood',
      'node_break_ore',
      'ore_shatter',
      'crit_strike',
      'island_unlock',
      'boss_defeat',
      'forge_complete',
      'level_up',
    ];
    for (const id of required) {
      const seq = EFFECT_SEQUENCES[id];
      expect(seq, `Missing sequence "${id}"`).toBeDefined();
      expect(seq.steps.length).toBeGreaterThan(0);
    }
  });

  it('supports SoundFX pitch scaling and combo parameters safely', () => {
    SFX.muted = true;
    expect(() => {
      SFX.withPitchScale(1.25, () => {
        SFX.playHit(0);
        SFX.playChop(2);
        SFX.playMine(3);
        SFX.playPickup(4);
        SFX.playCoin(1);
      });
    }).not.toThrow();
  });

  it('exposes MusicEngine.duck without throwing when audio context is uninitialized', () => {
    const engine = new MusicEngine();
    expect(() => engine.duck(0.25, 600, 500)).not.toThrow();
  });

  it('provides safe no-op Haptics fallback on desktop/headless environments', () => {
    Haptics.setEnabled(true);
    expect(() => {
      Haptics.impactLight();
      Haptics.impactMedium();
      Haptics.impactHeavy();
      Haptics.notifySuccess();
    }).not.toThrow();
  });
});
