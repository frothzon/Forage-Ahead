export type GraphicsPreset = 'low' | 'medium' | 'high' | 'custom';
export type WeatherDetail = 'off' | 'reduced' | 'full';
export type ScreenShakeLevel = 'off' | 'reduced' | 'full';
export type SpeechBubbleSpeed = 'slow' | 'normal' | 'fast' | 'instant';
export type FpsLimit = 0 | 30 | 60;
export type SettingsSection = 'audio' | 'graphics' | 'dialogue' | 'controller';

export type ControllerAction =
  | 'primaryAction'
  | 'dash'
  | 'interact'
  | 'inventory'
  | 'craft'
  | 'quests'
  | 'map'
  | 'minimap'
  | 'hotbarPrev'
  | 'hotbarNext'
  | 'menu';

export const ALL_CONTROLLER_ACTIONS: readonly ControllerAction[] = [
  'primaryAction',
  'dash',
  'interact',
  'inventory',
  'craft',
  'quests',
  'map',
  'minimap',
  'hotbarPrev',
  'hotbarNext',
  'menu',
] as const;

export interface AudioSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  musicEnabled: boolean;
}

export interface GraphicsSettings {
  preset: GraphicsPreset;
  dynamicLighting: boolean;
  weatherEffects: WeatherDetail;
  windSway: boolean;
  ambientParticles: boolean;
  screenShake: ScreenShakeLevel;
  roundPixels: boolean;
  fpsLimit: FpsLimit;
}

export interface DialogueSettings {
  speed: SpeechBubbleSpeed;
}

export interface ControllerSettings {
  enabled: boolean;
  deadzone: number;
  bindings: Record<ControllerAction, number>;
}

export interface GameSettingsData {
  audio: AudioSettings;
  graphics: GraphicsSettings;
  dialogue: DialogueSettings;
  controller: ControllerSettings;
}

export interface GameSettingsPatch {
  audio?: Partial<AudioSettings>;
  graphics?: Partial<GraphicsSettings>;
  dialogue?: Partial<DialogueSettings>;
  controller?: Omit<Partial<ControllerSettings>, 'bindings'> & {
    bindings?: Partial<Record<ControllerAction, number>>;
  };
}

export const SETTINGS_CACHE_KEY = 'forage_ahead_settings_v1';
export const LEGACY_AUDIO_PREFS_KEY = 'forage_ahead_audio_v1';

export const DEFAULT_CONTROLLER_BINDINGS: Record<ControllerAction, number> = {
  primaryAction: 0,
  dash: 1,
  interact: 2,
  inventory: 3,
  hotbarPrev: 4,
  hotbarNext: 5,
  map: 6,
  quests: 7,
  craft: 8,
  menu: 9,
  minimap: 10,
};

export const GRAPHICS_PRESETS: Record<
  Exclude<GraphicsPreset, 'custom'>,
  Omit<GraphicsSettings, 'preset'>
> = {
  low: {
    dynamicLighting: false,
    weatherEffects: 'off',
    windSway: false,
    ambientParticles: false,
    screenShake: 'reduced',
    roundPixels: false,
    fpsLimit: 30,
  },
  medium: {
    dynamicLighting: true,
    weatherEffects: 'reduced',
    windSway: true,
    ambientParticles: false,
    screenShake: 'full',
    roundPixels: false,
    fpsLimit: 60,
  },
  high: {
    dynamicLighting: true,
    weatherEffects: 'full',
    windSway: true,
    ambientParticles: true,
    screenShake: 'full',
    roundPixels: false,
    fpsLimit: 60,
  },
};

const VALID_WEATHER: readonly WeatherDetail[] = ['off', 'reduced', 'full'];
const VALID_SHAKE: readonly ScreenShakeLevel[] = ['off', 'reduced', 'full'];
const VALID_SPEECH_SPEED: readonly SpeechBubbleSpeed[] = ['slow', 'normal', 'fast', 'instant'];
const VALID_FPS_LIMIT: readonly FpsLimit[] = [0, 30, 60];
const NAMED_PRESETS: readonly Exclude<GraphicsPreset, 'custom'>[] = ['low', 'medium', 'high'];

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function clampFinite(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return clamp(val, min, max);
}

function clampButtonIndex(val: unknown, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return clamp(Math.round(val), 0, 24);
}

function isNamedGraphicsPreset(val: unknown): val is Exclude<GraphicsPreset, 'custom'> {
  return val === 'low' || val === 'medium' || val === 'high';
}

function detectMobileDevice(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string') {
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
      return true;
    }
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      if (window.matchMedia('(pointer: coarse)').matches) {
        return true;
      }
    } catch {
      // Ignore matchMedia errors in restricted environments
    }
  }
  return false;
}

export function createDefaultSettings(mobile?: boolean): GameSettingsData {
  const isMobile = mobile ?? detectMobileDevice();
  const preset: Exclude<GraphicsPreset, 'custom'> = isMobile ? 'medium' : 'high';
  return {
    audio: {
      masterVolume: 0.7,
      musicVolume: 1.0,
      sfxVolume: 1.0,
      muted: false,
      musicEnabled: true,
    },
    graphics: {
      preset,
      ...GRAPHICS_PRESETS[preset],
    },
    dialogue: {
      speed: 'normal',
    },
    controller: {
      enabled: true,
      deadzone: 0.22,
      bindings: { ...DEFAULT_CONTROLLER_BINDINGS },
    },
  };
}

export function cloneSettings(s: GameSettingsData): GameSettingsData {
  return {
    audio: { ...s.audio },
    graphics: { ...s.graphics },
    dialogue: { ...s.dialogue },
    controller: {
      enabled: s.controller.enabled,
      deadzone: s.controller.deadzone,
      bindings: { ...s.controller.bindings },
    },
  };
}

export function applyGraphicsPreset(
  current: GraphicsSettings,
  preset: Exclude<GraphicsPreset, 'custom'>,
): GraphicsSettings {
  return {
    ...current,
    preset,
    ...GRAPHICS_PRESETS[preset],
  };
}

export function detectGraphicsPreset(g: Omit<GraphicsSettings, 'preset'>): GraphicsPreset {
  for (const name of NAMED_PRESETS) {
    const p = GRAPHICS_PRESETS[name];
    if (
      g.dynamicLighting === p.dynamicLighting &&
      g.weatherEffects === p.weatherEffects &&
      g.windSway === p.windSway &&
      g.ambientParticles === p.ambientParticles &&
      g.screenShake === p.screenShake &&
      g.roundPixels === p.roundPixels &&
      g.fpsLimit === p.fpsLimit
    ) {
      return name;
    }
  }
  return 'custom';
}

export function sanitizeSettings(raw: unknown, mobile?: boolean): GameSettingsData {
  const defaults = createDefaultSettings(mobile);
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const obj = raw as Record<string, unknown>;

  // Audio
  const rawAudio =
    obj.audio && typeof obj.audio === 'object' ? (obj.audio as Record<string, unknown>) : {};
  const audio: AudioSettings = {
    masterVolume: clampFinite(rawAudio.masterVolume, 0, 1, defaults.audio.masterVolume),
    musicVolume: clampFinite(rawAudio.musicVolume, 0, 1, defaults.audio.musicVolume),
    sfxVolume: clampFinite(rawAudio.sfxVolume, 0, 1, defaults.audio.sfxVolume),
    muted: typeof rawAudio.muted === 'boolean' ? rawAudio.muted : defaults.audio.muted,
    musicEnabled:
      typeof rawAudio.musicEnabled === 'boolean'
        ? rawAudio.musicEnabled
        : defaults.audio.musicEnabled,
  };

  // Graphics
  const rawGraphics =
    obj.graphics && typeof obj.graphics === 'object'
      ? (obj.graphics as Record<string, unknown>)
      : {};
  const graphicsBase: Omit<GraphicsSettings, 'preset'> = isNamedGraphicsPreset(rawGraphics.preset)
    ? GRAPHICS_PRESETS[rawGraphics.preset]
    : defaults.graphics;

  const graphicsFields: Omit<GraphicsSettings, 'preset'> = {
    dynamicLighting:
      typeof rawGraphics.dynamicLighting === 'boolean'
        ? rawGraphics.dynamicLighting
        : graphicsBase.dynamicLighting,
    weatherEffects: VALID_WEATHER.includes(rawGraphics.weatherEffects as WeatherDetail)
      ? (rawGraphics.weatherEffects as WeatherDetail)
      : graphicsBase.weatherEffects,
    windSway:
      typeof rawGraphics.windSway === 'boolean' ? rawGraphics.windSway : graphicsBase.windSway,
    ambientParticles:
      typeof rawGraphics.ambientParticles === 'boolean'
        ? rawGraphics.ambientParticles
        : graphicsBase.ambientParticles,
    screenShake: VALID_SHAKE.includes(rawGraphics.screenShake as ScreenShakeLevel)
      ? (rawGraphics.screenShake as ScreenShakeLevel)
      : graphicsBase.screenShake,
    roundPixels:
      typeof rawGraphics.roundPixels === 'boolean'
        ? rawGraphics.roundPixels
        : graphicsBase.roundPixels,
    fpsLimit: VALID_FPS_LIMIT.includes(rawGraphics.fpsLimit as FpsLimit)
      ? (rawGraphics.fpsLimit as FpsLimit)
      : graphicsBase.fpsLimit,
  };
  const graphics: GraphicsSettings = {
    preset: detectGraphicsPreset(graphicsFields),
    ...graphicsFields,
  };

  // Dialogue
  const rawDialogue =
    obj.dialogue && typeof obj.dialogue === 'object'
      ? (obj.dialogue as Record<string, unknown>)
      : {};
  const dialogue: DialogueSettings = {
    speed: VALID_SPEECH_SPEED.includes(rawDialogue.speed as SpeechBubbleSpeed)
      ? (rawDialogue.speed as SpeechBubbleSpeed)
      : defaults.dialogue.speed,
  };

  // Controller
  const rawController =
    obj.controller && typeof obj.controller === 'object'
      ? (obj.controller as Record<string, unknown>)
      : {};
  const rawBindings =
    rawController.bindings && typeof rawController.bindings === 'object'
      ? (rawController.bindings as Record<string, unknown>)
      : {};
  const bindings = { ...DEFAULT_CONTROLLER_BINDINGS };
  for (const action of ALL_CONTROLLER_ACTIONS) {
    bindings[action] = clampButtonIndex(rawBindings[action], DEFAULT_CONTROLLER_BINDINGS[action]);
  }
  const controller: ControllerSettings = {
    enabled:
      typeof rawController.enabled === 'boolean'
        ? rawController.enabled
        : defaults.controller.enabled,
    deadzone: clampFinite(rawController.deadzone, 0.1, 0.45, defaults.controller.deadzone),
    bindings,
  };

  return {
    audio,
    graphics,
    dialogue,
    controller,
  };
}

export function rebindControllerAction(
  bindings: Record<ControllerAction, number>,
  action: ControllerAction,
  buttonIndex: number,
): Record<ControllerAction, number> {
  const next: Record<ControllerAction, number> = { ...bindings };
  if (typeof buttonIndex !== 'number' || !Number.isFinite(buttonIndex)) {
    return next;
  }
  const targetButton = clamp(Math.round(buttonIndex), 0, 24);
  const prevButton = next[action];
  if (prevButton === targetButton) {
    return next;
  }
  for (const other of ALL_CONTROLLER_ACTIONS) {
    if (other !== action && next[other] === targetButton) {
      next[other] = prevButton;
      break;
    }
  }
  next[action] = targetButton;
  return next;
}

export function loadCachedSettings(mobile?: boolean): GameSettingsData {
  if (typeof localStorage === 'undefined') {
    return createDefaultSettings(mobile);
  }
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (raw) {
      return sanitizeSettings(JSON.parse(raw), mobile);
    }
  } catch {
    // Fall through to legacy migration or defaults
  }

  try {
    const legacyRaw = localStorage.getItem(LEGACY_AUDIO_PREFS_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        return sanitizeSettings(
          {
            audio: {
              muted: parsed.muted,
              masterVolume: parsed.masterVolume,
              musicEnabled: parsed.musicEnabled,
            },
          },
          mobile,
        );
      }
    }
  } catch {
    // Ignore malformed legacy audio prefs
  }

  return createDefaultSettings(mobile);
}

export function saveCachedSettings(s: GameSettingsData): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(s));
  } catch {
    // Ignore storage quota errors
  }
}

export class SettingsStore {
  private current: GameSettingsData;
  private listeners: Array<(settings: GameSettingsData) => void> = [];

  constructor() {
    this.current = loadCachedSettings();
  }

  public get(): GameSettingsData {
    return this.current;
  }

  public set(next: GameSettingsData, persistCache = true): void {
    this.current = sanitizeSettings(next);
    if (persistCache) {
      saveCachedSettings(this.current);
    }
    this.emit();
  }

  public update(patch: GameSettingsPatch, persistCache = true): GameSettingsData {
    const nextAudio: AudioSettings = {
      ...this.current.audio,
      ...(patch.audio ?? {}),
    };

    let nextGraphics: GraphicsSettings = { ...this.current.graphics };
    if (patch.graphics) {
      const { preset: patchPreset, ...restGraphics } = patch.graphics;
      if (isNamedGraphicsPreset(patchPreset)) {
        nextGraphics = applyGraphicsPreset(nextGraphics, patchPreset);
      }
      nextGraphics = {
        ...nextGraphics,
        ...restGraphics,
      };
      nextGraphics.preset = detectGraphicsPreset(nextGraphics);
    }

    const nextDialogue: DialogueSettings = {
      ...this.current.dialogue,
      ...(patch.dialogue ?? {}),
    };

    const nextController: ControllerSettings = {
      enabled: patch.controller?.enabled ?? this.current.controller.enabled,
      deadzone: patch.controller?.deadzone ?? this.current.controller.deadzone,
      bindings: {
        ...this.current.controller.bindings,
        ...(patch.controller?.bindings ?? {}),
      },
    };

    this.current = sanitizeSettings({
      audio: nextAudio,
      graphics: nextGraphics,
      dialogue: nextDialogue,
      controller: nextController,
    });

    if (persistCache) {
      saveCachedSettings(this.current);
    }
    this.emit();
    return this.current;
  }

  public reset(section?: SettingsSection, persistCache = true): GameSettingsData {
    const defaults = createDefaultSettings();
    if (!section) {
      this.current = defaults;
    } else {
      const next = cloneSettings(this.current);
      if (section === 'audio') next.audio = defaults.audio;
      else if (section === 'graphics') next.graphics = defaults.graphics;
      else if (section === 'dialogue') next.dialogue = defaults.dialogue;
      else if (section === 'controller') next.controller = defaults.controller;
      this.current = next;
    }
    if (persistCache) {
      saveCachedSettings(this.current);
    }
    this.emit();
    return this.current;
  }

  public onChange(fn: (settings: GameSettingsData) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  public reloadFromCache(): GameSettingsData {
    this.current = loadCachedSettings();
    this.emit();
    return this.current;
  }

  private emit(): void {
    const snapshot = this.current;
    for (const fn of [...this.listeners]) {
      fn(snapshot);
    }
  }
}

export const settingsStore = new SettingsStore();

export function onSettingsChange(fn: (settings: GameSettingsData) => void): () => void {
  return settingsStore.onChange(fn);
}
