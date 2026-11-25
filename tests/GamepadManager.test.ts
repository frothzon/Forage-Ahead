import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONTROLLER_ACTION_LABELS,
  GAMEPAD_BUTTON_LABELS,
  GamepadManager,
  formatGamepadButton,
  type GamepadLike,
} from '../src/core/GamepadManager';
import { ALL_CONTROLLER_ACTIONS, settingsStore } from '../src/core/GameSettings';

function makePad(opts: {
  id?: string;
  connected?: boolean;
  axes?: number[];
  pressed?: number[];
  buttonCount?: number;
} = {}): GamepadLike {
  const count = opts.buttonCount ?? 17;
  const pressedSet = new Set(opts.pressed ?? []);
  const buttons = Array.from({ length: count }, (_, idx) => ({
    pressed: pressedSet.has(idx),
    value: pressedSet.has(idx) ? 1 : 0,
  }));
  return {
    id: opts.id ?? 'Xbox Wireless Controller (STANDARD GAMEPAD)',
    connected: opts.connected ?? true,
    axes: opts.axes ?? [0, 0, 0, 0],
    buttons,
  };
}

describe('GamepadManager', () => {
  let gm: GamepadManager;

  beforeEach(() => {
    settingsStore.reset('controller', false);
    gm = new GamepadManager();
  });

  it('formats known standard gamepad buttons and falls back for unknown indices', () => {
    expect(formatGamepadButton(0)).toBe('A / Cross');
    expect(formatGamepadButton(1)).toBe('B / Circle');
    expect(formatGamepadButton(4)).toBe('LB / L1');
    expect(formatGamepadButton(9)).toBe('Start / Options');
    expect(formatGamepadButton(12)).toBe('D-Pad Up');
    expect(formatGamepadButton(16)).toBe('Home');
    expect(formatGamepadButton(22)).toBe('Button 22');
    expect(GAMEPAD_BUTTON_LABELS[7]).toBe('RT / R2');
    for (const action of ALL_CONTROLLER_ACTIONS) {
      expect(typeof CONTROLLER_ACTION_LABELS[action]).toBe('string');
      expect(CONTROLLER_ACTION_LABELS[action].length).toBeGreaterThan(0);
    }
  });

  it('tracks connection state safely when no gamepad or navigator is present', () => {
    gm.poll();
    expect(gm.isConnected()).toBe(false);
    expect(gm.getConnectedName()).toBeNull();
    expect(gm.getMoveVector()).toEqual({ x: 0, y: 0 });

    gm.poll([null, makePad({ id: 'DualSense Wireless Controller' })]);
    expect(gm.isConnected()).toBe(true);
    expect(gm.getConnectedName()).toBe('DualSense Wireless Controller');

    gm.poll([makePad({ connected: false })]);
    expect(gm.isConnected()).toBe(false);
    expect(gm.getConnectedName()).toBeNull();
  });

  it('applies radial deadzone filtering and D-Pad fallback in getMoveVector()', () => {
    settingsStore.update({ controller: { enabled: true, deadzone: 0.25 } }, false);

    // Inside deadzone -> zero vector
    gm.poll([makePad({ axes: [0.15, 0.15] })]); // mag ~0.212 <= 0.25
    expect(gm.getMoveVector()).toEqual({ x: 0, y: 0 });

    // Outside deadzone -> rescaled, unit-bounded direction
    gm.poll([makePad({ axes: [1, 0] })]);
    expect(gm.getMoveVector().x).toBeCloseTo(1, 5);
    expect(gm.getMoveVector().y).toBeCloseTo(0, 5);

    // Diagonal full tilt -> normalized magnitude <= 1
    gm.poll([makePad({ axes: [1, 1] })]);
    const diag = gm.getMoveVector();
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1, 5);
    expect(diag.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(diag.y).toBeCloseTo(Math.SQRT1_2, 5);

    // D-Pad fallback (12: Up, 15: Right) -> normalized diagonal
    gm.poll([makePad({ axes: [0, 0], pressed: [12, 15] })]);
    const dpad = gm.getMoveVector();
    expect(dpad.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(dpad.y).toBeCloseTo(-Math.SQRT1_2, 5);

    // Disabled controller -> always zero
    settingsStore.update({ controller: { enabled: false } }, false);
    gm.poll([makePad({ axes: [1, 0], pressed: [15] })]);
    expect(gm.getMoveVector()).toEqual({ x: 0, y: 0 });
  });

  it('detects isDown and isJustPressed edges and respects custom rebound buttons', () => {
    // Frame 1: idle
    gm.poll([makePad({ pressed: [] })]);
    expect(gm.isDown('primaryAction')).toBe(false);
    expect(gm.isJustPressed('primaryAction')).toBe(false);

    // Frame 2: default primaryAction (button 0) pressed -> rising edge
    gm.poll([makePad({ pressed: [0] })]);
    expect(gm.isDown('primaryAction')).toBe(true);
    expect(gm.isJustPressed('primaryAction')).toBe(true);

    // Frame 3: still held -> isDown true, isJustPressed false
    gm.poll([makePad({ pressed: [0] })]);
    expect(gm.isDown('primaryAction')).toBe(true);
    expect(gm.isJustPressed('primaryAction')).toBe(false);

    // Frame 4: released
    gm.poll([makePad({ pressed: [] })]);
    expect(gm.isDown('primaryAction')).toBe(false);
    expect(gm.isJustPressed('primaryAction')).toBe(false);

    // Rebind primaryAction to button 5 (RB / R1)
    settingsStore.update({ controller: { bindings: { primaryAction: 5 } } }, false);
    gm.poll([makePad({ pressed: [0] })]);
    expect(gm.isDown('primaryAction')).toBe(false);
    expect(gm.isJustPressed('primaryAction')).toBe(false);

    gm.poll([makePad({ pressed: [5] })]);
    expect(gm.isDown('primaryAction')).toBe(true);
    expect(gm.isJustPressed('primaryAction')).toBe(true);
  });

  it('captures rising-edge button presses in capture mode and suppresses gameplay actions on that frame', () => {
    // Hold button 0 before capture starts
    gm.poll([makePad({ pressed: [0] })]);

    const onCaptured = vi.fn();
    const onCancel = vi.fn();
    gm.startCapture(onCaptured, onCancel);
    expect(gm.isCapturing()).toBe(true);

    // Button 0 still held (no rising edge) -> does not trigger capture
    gm.poll([makePad({ pressed: [0] })]);
    expect(onCaptured).not.toHaveBeenCalled();
    expect(gm.isCapturing()).toBe(true);
    expect(gm.isDown('primaryAction')).toBe(false);

    // Button 2 (X / Square, default interact) newly pressed -> triggers capture and suppresses gameplay on this frame
    gm.poll([makePad({ pressed: [0, 2] })]);
    expect(onCaptured).toHaveBeenCalledTimes(1);
    expect(onCaptured).toHaveBeenCalledWith(2);
    expect(gm.isCapturing()).toBe(false);
    expect(gm.isJustPressed('interact')).toBe(false);
    expect(gm.isDown('interact')).toBe(false);
    expect(gm.getMoveVector()).toEqual({ x: 0, y: 0 });

    // Next frame: normal polling resumes
    gm.poll([makePad({ pressed: [2] })]);
    expect(gm.isDown('interact')).toBe(true);
    expect(gm.isJustPressed('interact')).toBe(false);

    // Cancel capture invokes onCancel
    gm.startCapture(onCaptured, onCancel);
    expect(gm.isCapturing()).toBe(true);
    gm.cancelCapture();
    expect(gm.isCapturing()).toBe(false);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
