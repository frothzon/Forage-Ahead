import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Renderer: {
      WebGL: {
        Pipelines: {
          MultiPipeline: class MultiPipeline {},
        },
        WebGLRenderer: class WebGLRenderer {},
      },
    },
    Math: {
      Linear: (a: number, b: number, t: number) => a + (b - a) * t,
    },
  },
}));

import { settingsStore } from '../src/core/GameSettings';
import { CameraRig, getScreenShakeScale } from '../src/vfx/CameraRig';
import { isWindSwayEnabled, setWindSwayEnabled } from '../src/world/WindShader';

describe('GraphicsSettings wiring', () => {
  beforeEach(() => {
    settingsStore.reset('graphics', false);
  });

  it('tracks wind sway state via setters and reacts to settingsStore updates', () => {
    expect(isWindSwayEnabled()).toBe(settingsStore.get().graphics.windSway);

    setWindSwayEnabled(false);
    expect(isWindSwayEnabled()).toBe(false);

    setWindSwayEnabled(true);
    expect(isWindSwayEnabled()).toBe(true);

    settingsStore.update({ graphics: { windSway: false } }, false);
    expect(isWindSwayEnabled()).toBe(false);

    settingsStore.update({ graphics: { windSway: true } }, false);
    expect(isWindSwayEnabled()).toBe(true);
  });

  it('maps screenShake levels to expected scale factors', () => {
    expect(getScreenShakeScale('off')).toBe(0);
    expect(getScreenShakeScale('reduced')).toBe(0.4);
    expect(getScreenShakeScale('full')).toBe(1.0);

    settingsStore.update({ graphics: { screenShake: 'off' } }, false);
    expect(getScreenShakeScale()).toBe(0);

    settingsStore.update({ graphics: { screenShake: 'reduced' } }, false);
    expect(getScreenShakeScale()).toBe(0.4);

    settingsStore.update({ graphics: { screenShake: 'full' } }, false);
    expect(getScreenShakeScale()).toBe(1.0);
  });

  it('scales CameraRig.addTrauma according to screenShake setting', () => {
    const mockScene = {} as unknown as Phaser.Scene;

    settingsStore.update({ graphics: { screenShake: 'off' } }, false);
    const rigOff = new CameraRig(mockScene);
    rigOff.addTrauma(0.5);
    expect(rigOff.getTrauma()).toBe(0);

    settingsStore.update({ graphics: { screenShake: 'reduced' } }, false);
    const rigReduced = new CameraRig(mockScene);
    rigReduced.addTrauma(0.5);
    expect(rigReduced.getTrauma()).toBeCloseTo(0.2, 6);

    settingsStore.update({ graphics: { screenShake: 'full' } }, false);
    const rigFull = new CameraRig(mockScene);
    rigFull.addTrauma(0.5);
    expect(rigFull.getTrauma()).toBeCloseTo(0.5, 6);
  });
});
