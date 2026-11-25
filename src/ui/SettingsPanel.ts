import {
  ALL_CONTROLLER_ACTIONS,
  rebindControllerAction,
  settingsStore,
  type ControllerAction,
  type FpsLimit,
  type GraphicsPreset,
  type ScreenShakeLevel,
  type SpeechBubbleSpeed,
  type WeatherDetail,
} from '../core/GameSettings';
import { gameState } from '../core/GameState';
import {
  CONTROLLER_ACTION_LABELS,
  formatGamepadButton,
  gamepadManager,
} from '../core/GamepadManager';
import { isMobileTouchDevice } from '../core/Platform';
import { SFX } from '../core/SoundFX';
import { getDialogueMsPerChar } from './DialogueBox';
import { SPROUT_UI_CSS } from './SproutUiTheme';

const PREVIEW_SAMPLE_TEXT = 'Welcome back, adventurer! The islands await your pickaxe.';

export interface SettingsPanelBindOptions {
  onRerender: () => void;
  onCapturingChange: (action: ControllerAction | null) => void;
  saveActiveSlot: boolean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function ensureSettingsPanelStyles(): void {
  if (typeof document === 'undefined') return;

  if (
    !document.getElementById('forager-hud-styles') &&
    !document.getElementById('sprout-ui-base-styles')
  ) {
    const baseStyle = document.createElement('style');
    baseStyle.id = 'sprout-ui-base-styles';
    baseStyle.textContent = SPROUT_UI_CSS;
    document.head.appendChild(baseStyle);
  }

  if (document.getElementById('forage-settings-panel-styles')) return;
  const style = document.createElement('style');
  style.id = 'forage-settings-panel-styles';
  style.textContent = `
    @keyframes settingsCapturePulse {
      0%, 100% { filter: brightness(1); box-shadow: 0 0 0 0 rgba(255, 224, 102, 0.45); }
      50% { filter: brightness(1.16); box-shadow: 0 0 10px 2px rgba(255, 224, 102, 0.7); }
    }
    .settings-panel-root {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      gap: 10px;
      font-family: 'SproutLandsUI', monospace, sans-serif;
    }
    .settings-scroll-area {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding-right: 4px;
    }
    .settings-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 10px;
      align-items: start;
    }
    .settings-card {
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .settings-card-title {
      font-family: 'SproutLandsDisplay', 'SproutLandsUI', monospace;
      font-size: 13px;
      font-weight: 800;
      color: #ffe596;
      letter-spacing: 0.3px;
      border-bottom: 1px solid rgba(255, 229, 150, 0.22);
      padding-bottom: 4px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .settings-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 11px;
      color: #f2d9b1;
    }
    .settings-row-label {
      font-weight: 700;
      color: #f2d9b1;
      min-width: 112px;
    }
    .settings-slider-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 140px;
      justify-content: flex-end;
    }
    .settings-slider-wrap input.sl-range {
      flex: 1;
      max-width: 160px;
      min-width: 90px;
    }
    .settings-val-badge {
      min-width: 38px;
      text-align: right;
      font-weight: 800;
      color: #ffd95a;
      font-size: 11px;
    }
    .settings-seg-group {
      display: inline-flex;
      gap: 4px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .settings-seg-btn {
      padding: 2px 8px !important;
      font-size: 11px !important;
      min-width: 44px;
    }
    .settings-preview-box {
      background: #f5e6c8;
      color: #3b2316;
      text-shadow: none;
      border: 2px solid #5c3a24;
      border-radius: 6px;
      padding: 8px 10px;
      min-height: 46px;
      font-size: 12px;
      line-height: 1.45;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .settings-preview-text {
      flex: 1;
      min-width: 0;
      word-break: break-word;
    }
    .settings-gamepad-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 9px;
      border-radius: 6px;
      background: rgba(24, 14, 8, 0.55);
      border: 1px solid rgba(255, 229, 150, 0.2);
      font-size: 11px;
      font-weight: 700;
    }
    .settings-binding-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-height: 240px;
      overflow-y: auto;
      padding-right: 4px;
    }
    .settings-binding-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 3px 6px;
      border-radius: 4px;
      background: rgba(24, 14, 8, 0.35);
      font-size: 11px;
    }
    .settings-binding-badge {
      padding: 2px 7px;
      border-radius: 4px;
      background: #3b2316;
      border: 1px solid #8a6443;
      color: #ffe596;
      font-size: 10px;
      font-weight: 800;
      min-width: 82px;
      text-align: center;
    }
    .settings-capturing-btn {
      animation: settingsCapturePulse 0.9s ease-in-out infinite;
    }
    .settings-footer {
      flex-shrink: 0;
      padding: 8px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      font-size: 11px;
      color: #d6b88c;
    }
  `;
  document.head.appendChild(style);
}

function renderToggleButton(
  attrName: string,
  attrVal: string,
  isOn: boolean,
  onLabel = 'On',
  offLabel = 'Off',
): string {
  const cls = isOn ? 'hud-btn primary settings-seg-btn' : 'hud-btn settings-seg-btn';
  return `<button type="button" class="${cls}" data-${attrName}="${attrVal}">${isOn ? onLabel : offLabel}</button>`;
}

function renderSegmented<T extends string | number>(
  dataAttr: string,
  current: T,
  options: ReadonlyArray<{ value: T; label: string; activeClass?: string }>,
): string {
  return `<div class="settings-seg-group">${options
    .map((opt) => {
      const active = opt.value === current;
      const cls = active
        ? `hud-btn ${opt.activeClass ?? 'primary'} settings-seg-btn`
        : 'hud-btn settings-seg-btn';
      return `<button type="button" class="${cls}" data-${dataAttr}="${String(opt.value)}">${opt.label}</button>`;
    })
    .join('')}</div>`;
}

function getGamepadStatusInfo(): { connected: boolean; text: string; color: string } {
  gamepadManager.poll();
  const connected = gamepadManager.isConnected();
  const name = gamepadManager.getConnectedName();
  if (connected && name) {
    return {
      connected: true,
      text: `Connected: ${name}`,
      color: '#8ef5a7',
    };
  }
  return {
    connected: false,
    text: 'No controller detected — press any button',
    color: '#d6b88c',
  };
}

export function renderSettingsPanelHtml(capturingAction: ControllerAction | null): string {
  const s = settingsStore.get();
  const isMobile = isMobileTouchDevice();

  const masterPct = Math.round(s.audio.masterVolume * 100);
  const musicPct = Math.round(s.audio.musicVolume * 100);
  const sfxPct = Math.round(s.audio.sfxVolume * 100);
  const deadzonePct = Math.round(s.controller.deadzone * 100);

  const presetButtons: Array<{ value: GraphicsPreset; label: string }> = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'custom', label: 'Custom' },
  ];

  const audioHtml = `
    <div class="hud-panel-inset settings-card">
      <div class="settings-card-title">
        <span>Audio Settings</span>
        <button type="button" class="hud-btn gold settings-seg-btn" data-settings-action="test-sfx">Test SFX</button>
      </div>
      <div class="settings-row">
        <label class="settings-row-label" for="settings-master-vol">Master Volume</label>
        <div class="settings-slider-wrap">
          <input id="settings-master-vol" class="sl-range" type="range" min="0" max="100" step="1" value="${masterPct}" />
          <span id="settings-master-vol-label" class="settings-val-badge">${masterPct}%</span>
        </div>
      </div>
      <div class="settings-row">
        <label class="settings-row-label" for="settings-music-vol">Music Volume</label>
        <div class="settings-slider-wrap">
          <input id="settings-music-vol" class="sl-range" type="range" min="0" max="100" step="1" value="${musicPct}" />
          <span id="settings-music-vol-label" class="settings-val-badge">${musicPct}%</span>
        </div>
      </div>
      <div class="settings-row">
        <label class="settings-row-label" for="settings-sfx-vol">Effect (SFX) Volume</label>
        <div class="settings-slider-wrap">
          <input id="settings-sfx-vol" class="sl-range" type="range" min="0" max="100" step="1" value="${sfxPct}" />
          <span id="settings-sfx-vol-label" class="settings-val-badge">${sfxPct}%</span>
        </div>
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Music</span>
        ${renderToggleButton('settings-audio-toggle', 'musicEnabled', s.audio.musicEnabled, 'On', 'Off')}
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Mute All Audio</span>
        <button type="button" class="hud-btn ${s.audio.muted ? 'danger' : 'primary'} settings-seg-btn" data-settings-audio-toggle="muted">${s.audio.muted ? 'Muted' : 'Active'}</button>
      </div>
    </div>
  `;

  const graphicsHtml = `
    <div class="hud-panel-inset settings-card">
      <div class="settings-card-title">
        <span>Graphics Settings</span>
        <span style="font-size:10px; color:#d6b88c; font-weight:700;">Preset: ${s.graphics.preset.toUpperCase()}</span>
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Quality Preset</span>
        <div class="settings-seg-group">
          ${presetButtons
            .map((p) => {
              const active = s.graphics.preset === p.value;
              const isCustom = p.value === 'custom';
              const cls = active
                ? `hud-btn ${isCustom ? 'gold' : 'primary'} settings-seg-btn`
                : 'hud-btn settings-seg-btn';
              return `<button type="button" class="${cls}" data-settings-preset="${p.value}" ${isCustom ? 'disabled' : ''}>${p.label}</button>`;
            })
            .join('')}
        </div>
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Dynamic Lighting</span>
        ${renderToggleButton('settings-gfx-toggle', 'dynamicLighting', s.graphics.dynamicLighting)}
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Weather &amp; Clouds</span>
        ${renderSegmented<WeatherDetail>('settings-weather', s.graphics.weatherEffects, [
          { value: 'off', label: 'Off' },
          { value: 'reduced', label: 'Reduced' },
          { value: 'full', label: 'Full' },
        ])}
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Foliage Wind Sway</span>
        ${renderToggleButton('settings-gfx-toggle', 'windSway', s.graphics.windSway)}
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Ambient Critters &amp; Dust</span>
        ${renderToggleButton('settings-gfx-toggle', 'ambientParticles', s.graphics.ambientParticles)}
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Screen Shake &amp; Juice</span>
        ${renderSegmented<ScreenShakeLevel>('settings-shake', s.graphics.screenShake, [
          { value: 'off', label: 'Off' },
          { value: 'reduced', label: 'Reduced' },
          { value: 'full', label: 'Full' },
        ])}
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Pixel Rounding</span>
        ${renderToggleButton('settings-gfx-toggle', 'roundPixels', s.graphics.roundPixels)}
      </div>
      <div class="settings-row">
        <span class="settings-row-label">FPS Cap</span>
        ${renderSegmented<FpsLimit>('settings-fps', s.graphics.fpsLimit, [
          { value: 30, label: '30' },
          { value: 60, label: '60' },
          { value: 0, label: 'Uncapped' },
        ])}
      </div>
    </div>
  `;

  const dialogueHtml = `
    <div class="hud-panel-inset settings-card">
      <div class="settings-card-title">
        <span>Speech Bubble Speed</span>
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Text Speed</span>
        ${renderSegmented<SpeechBubbleSpeed>('settings-dialogue-speed', s.dialogue.speed, [
          { value: 'slow', label: 'Slow' },
          { value: 'normal', label: 'Normal' },
          { value: 'fast', label: 'Fast' },
          { value: 'instant', label: 'Instant' },
        ])}
      </div>
      <div class="settings-preview-box">
        <div id="settings-dialogue-preview" class="settings-preview-text">${escapeHtml(PREVIEW_SAMPLE_TEXT)}</div>
        <button type="button" class="hud-btn tan settings-seg-btn" data-settings-action="replay-dialogue" style="flex-shrink:0;">Replay</button>
      </div>
    </div>
  `;

  let controllerHtml = '';
  if (!isMobile) {
    const status = getGamepadStatusInfo();
    const bindingRows = ALL_CONTROLLER_ACTIONS.map((action) => {
      const isCapturing = capturingAction === action;
      const btnLabel = formatGamepadButton(s.controller.bindings[action]);
      return `
        <div class="settings-binding-row">
          <span style="color:#f2d9b1; font-weight:700; flex:1;">${escapeHtml(CONTROLLER_ACTION_LABELS[action])}</span>
          <span class="settings-binding-badge">${escapeHtml(btnLabel)}</span>
          <button
            type="button"
            class="hud-btn ${isCapturing ? 'gold settings-capturing-btn' : 'tan'} settings-seg-btn"
            data-settings-rebind="${action}"
            ${isCapturing ? 'data-settings-rebind-capturing="true"' : ''}
          >${isCapturing ? 'Press button… [Esc]' : 'Rebind'}</button>
        </div>
      `;
    }).join('');

    controllerHtml = `
      <div class="hud-panel-inset settings-card">
        <div class="settings-card-title">
          <span>Controller Mapping</span>
          <button type="button" class="hud-btn tan settings-seg-btn" data-settings-reset="controller">Reset Controller Defaults</button>
        </div>
        <div id="settings-gamepad-status" class="settings-gamepad-pill" style="color:${status.color};">
          <span>●</span>
          <span id="settings-gamepad-status-text">${escapeHtml(status.text)}</span>
        </div>
        <div class="settings-row">
          <span class="settings-row-label">Controller Enabled</span>
          ${renderToggleButton('settings-ctrl-toggle', 'enabled', s.controller.enabled)}
        </div>
        <div class="settings-row">
          <label class="settings-row-label" for="settings-deadzone">Stick Deadzone</label>
          <div class="settings-slider-wrap">
            <input id="settings-deadzone" class="sl-range" type="range" min="10" max="45" step="1" value="${deadzonePct}" />
            <span id="settings-deadzone-label" class="settings-val-badge">${deadzonePct}%</span>
          </div>
        </div>
        <div class="settings-binding-list sl-scroll">
          ${bindingRows}
        </div>
      </div>
    `;
  }

  return `
    <div class="settings-panel-root">
      <div class="settings-scroll-area sl-scroll">
        <div class="settings-grid">
          ${audioHtml}
          ${graphicsHtml}
          ${dialogueHtml}
          ${controllerHtml}
        </div>
      </div>
      <div class="hud-panel-inset settings-footer">
        <span>Settings are saved automatically with your game data.</span>
        <button type="button" class="hud-btn danger settings-seg-btn" data-settings-reset="all">Reset All to Defaults</button>
      </div>
    </div>
  `;
}

export function bindSettingsPanelEvents(
  container: HTMLElement,
  opts: SettingsPanelBindOptions,
): () => void {
  ensureSettingsPanelStyles();

  const { onRerender, onCapturingChange, saveActiveSlot } = opts;
  let disposed = false;
  let previewRafId: number | null = null;
  let statusIntervalId: number | null = null;

  const stopPreviewAnim = (): void => {
    if (previewRafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(previewRafId);
    }
    previewRafId = null;
  };

  const runDialoguePreview = (): void => {
    stopPreviewAnim();
    const previewEl = container.querySelector<HTMLElement>('#settings-dialogue-preview');
    if (!previewEl) return;

    const speed = settingsStore.get().dialogue.speed;
    const msPerChar = getDialogueMsPerChar(speed);
    if (speed === 'instant' || msPerChar <= 0 || typeof requestAnimationFrame !== 'function') {
      previewEl.textContent = PREVIEW_SAMPLE_TEXT;
      return;
    }

    const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    previewEl.textContent = '';

    const tick = (now: number) => {
      if (disposed) {
        previewRafId = null;
        return;
      }
      const elapsed = Math.max(0, now - startMs);
      const count = Math.min(PREVIEW_SAMPLE_TEXT.length, Math.floor(elapsed / msPerChar) + 1);
      previewEl.textContent = PREVIEW_SAMPLE_TEXT.slice(0, count);
      if (count < PREVIEW_SAMPLE_TEXT.length) {
        previewRafId = requestAnimationFrame(tick);
      } else {
        previewRafId = null;
      }
    };
    previewRafId = requestAnimationFrame(tick);
  };

  // Start preview animation on mount
  runDialoguePreview();

  // Audio sliders (live update without full re-render on input; persist on change)
  const bindAudioSlider = (
    inputSelector: string,
    labelSelector: string,
    field: 'masterVolume' | 'musicVolume' | 'sfxVolume',
  ): void => {
    const input = container.querySelector<HTMLInputElement>(inputSelector);
    const label = container.querySelector<HTMLElement>(labelSelector);
    if (!input) return;

    input.addEventListener('input', () => {
      const pct = Math.max(0, Math.min(100, Math.round(Number(input.value))));
      if (label) label.textContent = `${pct}%`;
      settingsStore.update({ audio: { [field]: pct / 100 } }, false);
    });

    input.addEventListener('change', () => {
      const pct = Math.max(0, Math.min(100, Math.round(Number(input.value))));
      if (label) label.textContent = `${pct}%`;
      gameState.updateSettings({ audio: { [field]: pct / 100 } }, saveActiveSlot);
    });
  };

  bindAudioSlider('#settings-master-vol', '#settings-master-vol-label', 'masterVolume');
  bindAudioSlider('#settings-music-vol', '#settings-music-vol-label', 'musicVolume');
  bindAudioSlider('#settings-sfx-vol', '#settings-sfx-vol-label', 'sfxVolume');

  // Audio toggles
  container.querySelectorAll<HTMLElement>('[data-settings-audio-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.settingsAudioToggle as 'musicEnabled' | 'muted' | undefined;
      if (!field) return;
      const cur = settingsStore.get().audio[field];
      gameState.updateSettings({ audio: { [field]: !cur } }, saveActiveSlot);
      SFX.playUiClick();
      onRerender();
    });
  });

  // Test SFX
  container
    .querySelector<HTMLElement>('[data-settings-action="test-sfx"]')
    ?.addEventListener('click', () => {
      SFX.playCoin();
    });

  // Graphics presets
  container.querySelectorAll<HTMLElement>('[data-settings-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.settingsPreset as GraphicsPreset | undefined;
      if (!preset || preset === 'custom') return;
      SFX.playUiClick();
      gameState.updateSettings({ graphics: { preset } }, saveActiveSlot);
      onRerender();
    });
  });

  // Graphics boolean toggles
  container.querySelectorAll<HTMLElement>('[data-settings-gfx-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.settingsGfxToggle as
        | 'dynamicLighting'
        | 'windSway'
        | 'ambientParticles'
        | 'roundPixels'
        | undefined;
      if (!field) return;
      SFX.playUiClick();
      const cur = settingsStore.get().graphics[field];
      gameState.updateSettings({ graphics: { [field]: !cur } }, saveActiveSlot);
      onRerender();
    });
  });

  // Weather & Cloud Shadows
  container.querySelectorAll<HTMLElement>('[data-settings-weather]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.settingsWeather as WeatherDetail | undefined;
      if (!val) return;
      SFX.playUiClick();
      gameState.updateSettings({ graphics: { weatherEffects: val } }, saveActiveSlot);
      onRerender();
    });
  });

  // Screen Shake
  container.querySelectorAll<HTMLElement>('[data-settings-shake]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.settingsShake as ScreenShakeLevel | undefined;
      if (!val) return;
      SFX.playUiClick();
      gameState.updateSettings({ graphics: { screenShake: val } }, saveActiveSlot);
      onRerender();
    });
  });

  // FPS Cap
  container.querySelectorAll<HTMLElement>('[data-settings-fps]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const parsed = Number(btn.dataset.settingsFps);
      if (parsed !== 0 && parsed !== 30 && parsed !== 60) return;
      SFX.playUiClick();
      gameState.updateSettings({ graphics: { fpsLimit: parsed as FpsLimit } }, saveActiveSlot);
      onRerender();
    });
  });

  // Dialogue Speed
  container.querySelectorAll<HTMLElement>('[data-settings-dialogue-speed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const speed = btn.dataset.settingsDialogueSpeed as SpeechBubbleSpeed | undefined;
      if (!speed) return;
      SFX.playUiClick();
      gameState.updateSettings({ dialogue: { speed } }, saveActiveSlot);
      onRerender();
    });
  });

  // Dialogue Replay
  container
    .querySelector<HTMLElement>('[data-settings-action="replay-dialogue"]')
    ?.addEventListener('click', () => {
      SFX.playUiClick();
      runDialoguePreview();
    });

  // Controller section (Desktop only)
  if (!isMobileTouchDevice()) {
    const statusWrap = container.querySelector<HTMLElement>('#settings-gamepad-status');
    const statusText = container.querySelector<HTMLElement>('#settings-gamepad-status-text');

    if (typeof window !== 'undefined' && statusWrap && statusText) {
      statusIntervalId = window.setInterval(() => {
        if (disposed) return;
        const info = getGamepadStatusInfo();
        statusWrap.style.color = info.color;
        statusText.textContent = info.text;
      }, 500);
    }

    container.querySelectorAll<HTMLElement>('[data-settings-ctrl-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.settingsCtrlToggle as 'enabled' | undefined;
        if (field !== 'enabled') return;
        SFX.playUiClick();
        const cur = settingsStore.get().controller.enabled;
        gameState.updateSettings({ controller: { enabled: !cur } }, saveActiveSlot);
        onRerender();
      });
    });

    const dzInput = container.querySelector<HTMLInputElement>('#settings-deadzone');
    const dzLabel = container.querySelector<HTMLElement>('#settings-deadzone-label');
    if (dzInput) {
      dzInput.addEventListener('input', () => {
        const pct = Math.max(10, Math.min(45, Math.round(Number(dzInput.value))));
        if (dzLabel) dzLabel.textContent = `${pct}%`;
        settingsStore.update({ controller: { deadzone: pct / 100 } }, false);
      });
      dzInput.addEventListener('change', () => {
        const pct = Math.max(10, Math.min(45, Math.round(Number(dzInput.value))));
        if (dzLabel) dzLabel.textContent = `${pct}%`;
        gameState.updateSettings({ controller: { deadzone: pct / 100 } }, saveActiveSlot);
      });
    }

    container.querySelectorAll<HTMLElement>('[data-settings-rebind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.settingsRebind as ControllerAction | undefined;
        if (!action) return;
        SFX.playUiClick();

        if (btn.dataset.settingsRebindCapturing === 'true') {
          gamepadManager.cancelCapture();
          onCapturingChange(null);
          onRerender();
          return;
        }

        onCapturingChange(action);
        onRerender();

        gamepadManager.startCapture((btnIdx) => {
          const next = rebindControllerAction(
            gameState.settings.controller.bindings,
            action,
            btnIdx,
          );
          onCapturingChange(null);
          gameState.updateSettings({ controller: { bindings: next } }, saveActiveSlot);
          SFX.playUiClick();
          onRerender();
        });
      });
    });
  }

  // Reset buttons
  container.querySelectorAll<HTMLElement>('[data-settings-reset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.settingsReset;
      SFX.playUiClick();
      gamepadManager.cancelCapture();
      onCapturingChange(null);
      if (target === 'controller') {
        gameState.resetSettings('controller', saveActiveSlot);
      } else {
        gameState.resetSettings(undefined, saveActiveSlot);
      }
      onRerender();
    });
  });

  // Escape key handler to cancel active gamepad capture without closing the modal
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && gamepadManager.isCapturing()) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      gamepadManager.cancelCapture();
      SFX.playUiClick();
      onCapturingChange(null);
      onRerender();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown, true);
  }

  return () => {
    disposed = true;
    stopPreviewAnim();
    if (statusIntervalId !== null && typeof window !== 'undefined') {
      window.clearInterval(statusIntervalId);
      statusIntervalId = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', onKeyDown, true);
    }
    if (gamepadManager.isCapturing()) {
      gamepadManager.cancelCapture();
    }
  };
}
