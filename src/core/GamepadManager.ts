import { settingsStore, type ControllerAction } from './GameSettings';
import { isMobileTouchDevice } from './Platform';

export interface GamepadButtonLike {
  pressed: boolean;
  value?: number;
}

export interface GamepadLike {
  id: string;
  connected: boolean;
  axes: ReadonlyArray<number>;
  buttons: ReadonlyArray<GamepadButtonLike>;
}

export const GAMEPAD_BUTTON_LABELS: Record<number, string> = {
  0: 'A / Cross',
  1: 'B / Circle',
  2: 'X / Square',
  3: 'Y / Triangle',
  4: 'LB / L1',
  5: 'RB / R1',
  6: 'LT / L2',
  7: 'RT / R2',
  8: 'Back / Share',
  9: 'Start / Options',
  10: 'L3',
  11: 'R3',
  12: 'D-Pad Up',
  13: 'D-Pad Down',
  14: 'D-Pad Left',
  15: 'D-Pad Right',
  16: 'Home',
};

export function formatGamepadButton(index: number): string {
  return GAMEPAD_BUTTON_LABELS[index] ?? `Button ${index}`;
}

export const CONTROLLER_ACTION_LABELS: Record<ControllerAction, string> = {
  primaryAction: 'Attack / Use Tool',
  dash: 'Dash / Dodge',
  interact: 'Interact / Talk',
  inventory: 'Character & Bag',
  craft: 'Craft & Build',
  quests: 'Quest Log',
  map: 'World Map',
  minimap: 'Toggle Minimap',
  hotbarPrev: 'Previous Hotbar Slot',
  hotbarNext: 'Next Hotbar Slot',
  menu: 'Settings / Back',
};

const DPAD_UP = 12;
const DPAD_DOWN = 13;
const DPAD_LEFT = 14;
const DPAD_RIGHT = 15;

function isButtonActive(btn: GamepadButtonLike | undefined): boolean {
  if (!btn) return false;
  return Boolean(btn.pressed || (typeof btn.value === 'number' && btn.value > 0.5));
}

export class GamepadManager {
  private connected = false;
  private connectedName: string | null = null;
  private currButtons: boolean[] = [];
  private justPressedButtons: boolean[] = [];
  private moveVec: { x: number; y: number } = { x: 0, y: 0 };

  private captureCallback: ((buttonIndex: number) => void) | null = null;
  private captureCancelCallback: (() => void) | null = null;
  private captureRafId: number | null = null;
  private suppressGameplayThisFrame = false;

  private readNavigatorGamepads(): ReadonlyArray<GamepadLike | null> {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return [];
    }
    try {
      const list = navigator.getGamepads();
      if (!list) return [];
      const out: Array<GamepadLike | null> = [];
      for (let i = 0; i < list.length; i++) {
        out.push(list[i] ?? null);
      }
      return out;
    } catch {
      return [];
    }
  }

  private resetInputState(): void {
    this.connected = false;
    this.connectedName = null;
    this.currButtons = [];
    this.justPressedButtons = [];
    this.moveVec = { x: 0, y: 0 };
  }

  public poll(gamepadsOverride?: ReadonlyArray<GamepadLike | null>): void {
    this.suppressGameplayThisFrame = false;

    if (isMobileTouchDevice()) {
      this.resetInputState();
      return;
    }

    const pads = gamepadsOverride ?? this.readNavigatorGamepads();
    let activePad: GamepadLike | null = null;
    for (let i = 0; i < pads.length; i++) {
      const candidate = pads[i];
      if (candidate && candidate.connected !== false) {
        activePad = candidate;
        break;
      }
    }

    if (!activePad) {
      this.resetInputState();
      return;
    }

    this.connected = true;
    this.connectedName = activePad.id || 'Controller';

    const prevButtons = this.currButtons;
    const btnCount = activePad.buttons?.length ?? 0;
    const nextButtons: boolean[] = new Array(btnCount);
    const nextJustPressed: boolean[] = new Array(btnCount);

    for (let i = 0; i < btnCount; i++) {
      const pressed = isButtonActive(activePad.buttons[i]);
      nextButtons[i] = pressed;
      nextJustPressed[i] = pressed && !prevButtons[i];
    }

    this.currButtons = nextButtons;
    this.justPressedButtons = nextJustPressed;

    // Capture mode intercepts the first newly-pressed button (rising edge) and suppresses gameplay actions this frame
    if (this.captureCallback) {
      for (let i = 0; i < nextJustPressed.length; i++) {
        if (nextJustPressed[i]) {
          const cb = this.captureCallback;
          this.stopCaptureLoop();
          this.captureCallback = null;
          this.captureCancelCallback = null;
          this.suppressGameplayThisFrame = true;
          this.moveVec = { x: 0, y: 0 };
          cb(i);
          return;
        }
      }
      this.moveVec = { x: 0, y: 0 };
      return;
    }

    const cfg = settingsStore.get().controller;
    if (!cfg.enabled) {
      this.moveVec = { x: 0, y: 0 };
      return;
    }

    // D-Pad buttons (12: Up, 13: Down, 14: Left, 15: Right)
    const dpadX = (nextButtons[DPAD_RIGHT] ? 1 : 0) - (nextButtons[DPAD_LEFT] ? 1 : 0);
    const dpadY = (nextButtons[DPAD_DOWN] ? 1 : 0) - (nextButtons[DPAD_UP] ? 1 : 0);

    if (dpadX !== 0 || dpadY !== 0) {
      const dMag = Math.hypot(dpadX, dpadY);
      this.moveVec = { x: dpadX / dMag, y: dpadY / dMag };
      return;
    }

    // Left stick axes [0, 1] with radial deadzone
    const rawX = activePad.axes?.[0] ?? 0;
    const rawY = activePad.axes?.[1] ?? 0;
    const mag = Math.hypot(rawX, rawY);
    const deadzone = cfg.deadzone;

    if (mag <= deadzone || !Number.isFinite(mag)) {
      this.moveVec = { x: 0, y: 0 };
    } else {
      const scaled = Math.min(1, (mag - deadzone) / Math.max(0.001, 1 - deadzone));
      this.moveVec = {
        x: (rawX / mag) * scaled,
        y: (rawY / mag) * scaled,
      };
    }
  }

  public isConnected(): boolean {
    if (isMobileTouchDevice()) return false;
    return this.connected;
  }

  public getConnectedName(): string | null {
    if (isMobileTouchDevice() || !this.connected) return null;
    return this.connectedName;
  }

  public getMoveVector(): { x: number; y: number } {
    if (
      isMobileTouchDevice() ||
      !settingsStore.get().controller.enabled ||
      this.suppressGameplayThisFrame ||
      this.captureCallback !== null
    ) {
      return { x: 0, y: 0 };
    }
    return { x: this.moveVec.x, y: this.moveVec.y };
  }

  public isDown(action: ControllerAction): boolean {
    if (
      isMobileTouchDevice() ||
      !settingsStore.get().controller.enabled ||
      this.suppressGameplayThisFrame ||
      this.captureCallback !== null
    ) {
      return false;
    }
    const idx = settingsStore.get().controller.bindings[action];
    return Boolean(this.currButtons[idx]);
  }

  public isJustPressed(action: ControllerAction): boolean {
    if (
      isMobileTouchDevice() ||
      !settingsStore.get().controller.enabled ||
      this.suppressGameplayThisFrame ||
      this.captureCallback !== null
    ) {
      return false;
    }
    const idx = settingsStore.get().controller.bindings[action];
    return Boolean(this.justPressedButtons[idx]);
  }

  public startCapture(onCaptured: (buttonIndex: number) => void, onCancel?: () => void): void {
    if (this.captureCallback) {
      this.cancelCapture();
    }
    this.captureCallback = onCaptured;
    this.captureCancelCallback = onCancel ?? null;
    this.startCaptureLoop();
  }

  public cancelCapture(): void {
    const cancelCb = this.captureCancelCallback;
    this.stopCaptureLoop();
    this.captureCallback = null;
    this.captureCancelCallback = null;
    cancelCb?.();
  }

  public isCapturing(): boolean {
    return this.captureCallback !== null;
  }

  private startCaptureLoop(): void {
    if (typeof requestAnimationFrame !== 'function') return;
    if (this.captureRafId !== null) return;
    const tick = () => {
      if (!this.isCapturing()) {
        this.captureRafId = null;
        return;
      }
      this.poll();
      if (this.isCapturing()) {
        this.captureRafId = requestAnimationFrame(tick);
      } else {
        this.captureRafId = null;
      }
    };
    this.captureRafId = requestAnimationFrame(tick);
  }

  private stopCaptureLoop(): void {
    if (this.captureRafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.captureRafId);
    }
    this.captureRafId = null;
  }
}

export const gamepadManager = new GamepadManager();
