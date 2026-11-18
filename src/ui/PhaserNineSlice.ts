import Phaser from 'phaser';
import manifest from '../data/assetManifest.json';

export type NineSlicePresetId = keyof typeof manifest.uiNineSlices;

export function addSproutNineSlice(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  preset: NineSlicePresetId,
  scale = 2,
): Phaser.GameObjects.NineSlice {
  const spec = manifest.uiNineSlices[preset];
  const ns = scene.add.nineslice(
    x,
    y,
    spec.key,
    undefined,
    Math.max(spec.left + spec.right + 4, Math.round(width / scale)),
    Math.max(spec.top + spec.bottom + 4, Math.round(height / scale)),
    spec.left,
    spec.right,
    spec.top,
    spec.bottom,
  );
  ns.setScale(scale);
  return ns;
}

export interface SproutButtonOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  variant?: 'wide' | 'light' | 'tan' | 'dark' | 'white';
  fontSize?: string;
  textColor?: string;
  iconKey?: string;
  scale?: number;
  onClick: () => void;
}

export interface SproutButtonHandle {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.NineSlice;
  text: Phaser.GameObjects.Text;
  setLabel: (label: string) => void;
}

export function createSproutButton(scene: Phaser.Scene, opts: SproutButtonOptions): SproutButtonHandle {
  const variant = opts.variant ?? 'light';
  const scale = opts.scale ?? 2;
  const normalPreset: NineSlicePresetId =
    variant === 'wide'
      ? 'btn_wide_normal'
      : (`btn_rect_${variant}_normal` as NineSlicePresetId);
  const pressedPreset: NineSlicePresetId =
    variant === 'wide'
      ? 'btn_wide_pressed'
      : (`btn_rect_${variant}_pressed` as NineSlicePresetId);

  const normalSpec = manifest.uiNineSlices[normalPreset];
  const pressedSpec = manifest.uiNineSlices[pressedPreset];

  const container = scene.add.container(opts.x, opts.y);
  const bg = addSproutNineSlice(scene, 0, 0, opts.width, opts.height, normalPreset, scale);
  bg.setInteractive({ useHandCursor: true });

  const defaultColor = variant === 'dark' ? '#fff6e5' : '#3b2316';
  const text = scene.add
    .text(opts.iconKey ? 8 : 0, -1, opts.label, {
      fontFamily: 'SproutLandsUI, monospace, sans-serif',
      fontSize: opts.fontSize ?? '12px',
      fontStyle: 'bold',
      color: opts.textColor ?? defaultColor,
    })
    .setOrigin(0.5);

  const children: Phaser.GameObjects.GameObject[] = [bg, text];
  let icon: Phaser.GameObjects.Image | undefined;
  if (opts.iconKey && scene.textures.exists(opts.iconKey)) {
    icon = scene.add.image(-opts.width / 2 + 16, -1, opts.iconKey).setScale(1.1);
    children.push(icon);
  }
  container.add(children);

  let isDown = false;
  const setPressed = (pressed: boolean) => {
    const spec = pressed ? pressedSpec : normalSpec;
    if (scene.textures.exists(spec.key)) {
      bg.setTexture(spec.key);
    }
    text.y = pressed ? 1 : -1;
    if (icon) icon.y = pressed ? 1 : -1;
  };

  bg.on('pointerover', () => {
    bg.setTint(0xfff4d6);
  });
  bg.on('pointerout', () => {
    bg.clearTint();
    if (isDown) {
      isDown = false;
      setPressed(false);
    }
  });
  bg.on('pointerdown', () => {
    isDown = true;
    setPressed(true);
  });
  bg.on('pointerup', () => {
    if (!isDown) return;
    isDown = false;
    setPressed(false);
    opts.onClick();
  });

  return {
    container,
    bg,
    text,
    setLabel: (lbl: string) => text.setText(lbl),
  };
}
