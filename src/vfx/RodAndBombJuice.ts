import Phaser from 'phaser';
import type { BombKind } from '../world/bombRules';

export type RodVfxKind = 'thunder' | 'fire' | 'ice' | 'necro' | 'void';

interface RodPalette {
  primary: number;
  secondary: number;
  flash: number;
}

interface TransientLight {
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
  durationMs: number;
  remainingMs: number;
}

const ROD_PALETTES: Record<RodVfxKind, RodPalette> = {
  thunder: { primary: 0x6ce5ff, secondary: 0xffe066, flash: 0xe8fcff },
  fire: { primary: 0xff6b35, secondary: 0xffd166, flash: 0xfff0b3 },
  ice: { primary: 0x6ce5ff, secondary: 0xffffff, flash: 0xe6fbff },
  necro: { primary: 0xa855f7, secondary: 0x55efc4, flash: 0xe9d5ff },
  void: { primary: 0x4f46e5, secondary: 0xe879f9, flash: 0xf5d0fe },
};

const ROD_GLOW_COLORS: Record<RodVfxKind, number> = {
  fire: 0xff6a1a,
  ice: 0x6ce5ff,
  necro: 0x66ffb2,
  void: 0xd67aff,
  thunder: 0x7ce8ff,
};

const ROD_IMPACT_LIGHT_RADIUS: Record<RodVfxKind, number> = {
  fire: 85,
  ice: 75,
  necro: 70,
  void: 90,
  thunder: 90,
};

const GLOW_ORB_TEXTURE_KEY = 'vfx_additive_glow_orb';
const GLOW_ORB_SIZE = 64;
const MAX_TRANSIENT_LIGHTS_PER_SCENE = 96;

const VFX_DEPTH = 6200;
const SCORCH_DEPTH = 4;

const sceneTransientLights = new WeakMap<Phaser.Scene, TransientLight[]>();

/**
 * Computes chain-lightning secondary bounce damage (15% of primary, min 1).
 */
export function computeChainLightningDamage(primaryDmg: number): number {
  return Math.max(1, Math.round(primaryDmg * 0.15));
}

function canSpawnVfx(scene: Phaser.Scene | undefined): scene is Phaser.Scene {
  return Boolean(scene && scene.add && scene.tweens);
}

/**
 * Lazily generates the shared 64x64 soft radial gradient texture used for additive glow blooms.
 */
function ensureGlowOrbTexture(scene: Phaser.Scene): boolean {
  if (!scene.textures) return false;
  if (scene.textures.exists(GLOW_ORB_TEXTURE_KEY)) return true;

  const tex = scene.textures.createCanvas(GLOW_ORB_TEXTURE_KEY, GLOW_ORB_SIZE, GLOW_ORB_SIZE);
  if (!tex) return false;

  const ctx = tex.getContext();
  const half = GLOW_ORB_SIZE / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.68)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GLOW_ORB_SIZE, GLOW_ORB_SIZE);
  tex.refresh();
  return true;
}

/**
 * Spawns a transient additive radial glow orb that fades out and destroys itself.
 */
function spawnGlowOrb(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tint: number,
  displayDiameter: number,
  startAlpha: number,
  durationMs: number,
  depth = VFX_DEPTH,
  endScaleFactor = 1.15,
  ease = 'Quad.Out',
): Phaser.GameObjects.Image | null {
  if (!ensureGlowOrbTexture(scene)) return null;

  const baseScale = displayDiameter / GLOW_ORB_SIZE;
  const orb = scene.add
    .image(x, y, GLOW_ORB_TEXTURE_KEY)
    .setDepth(depth)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(tint)
    .setScale(baseScale)
    .setAlpha(startAlpha);

  scene.tweens.add({
    targets: orb,
    scale: baseScale * endScaleFactor,
    alpha: 0,
    duration: durationMs,
    ease,
    onComplete: () => orb.destroy(),
  });

  return orb;
}

/**
 * Attaches an additive radial glow aura behind a rod projectile sprite and enables
 * additive self-illumination on incandescent projectile types (`fire`, `thunder`, `void`).
 */
export function attachProjectileGlow(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Image,
  kind: RodVfxKind,
): Phaser.GameObjects.Image {
  ensureGlowOrbTexture(scene);
  const glowColor = ROD_GLOW_COLORS[kind];
  const scale = kind === 'fire' || kind === 'void' ? 0.95 : 0.78;
  const glow = scene.add
    .image(sprite.x, sprite.y, GLOW_ORB_TEXTURE_KEY)
    .setDepth(sprite.depth - 1)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(glowColor)
    .setScale(scale)
    .setAlpha(0.72);

  if (kind === 'fire' || kind === 'thunder' || kind === 'void') {
    sprite.setBlendMode(Phaser.BlendModes.ADD);
  }

  return glow;
}

/**
 * Registers a short-lived fading dynamic light in the scene's transient light pool.
 */
export function pushTransientLight(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  color: number,
  intensity: number,
  durationMs: number,
): void {
  if (!scene || durationMs <= 0 || intensity <= 0 || radius <= 0) return;

  let pool = sceneTransientLights.get(scene);
  if (!pool) {
    pool = [];
    sceneTransientLights.set(scene, pool);
  }

  if (pool.length >= MAX_TRANSIENT_LIGHTS_PER_SCENE) {
    pool.shift();
  }

  pool.push({
    x,
    y,
    radius,
    color,
    intensity,
    durationMs,
    remainingMs: durationMs,
  });
}

/**
 * Advances all transient dynamic lights for `scene`, pruning expired entries and pushing
 * active fading lights into `out` for consumption by the lighting pass.
 */
export function sampleTransientLights(
  scene: Phaser.Scene,
  dtMs: number,
  out: Array<{ x: number; y: number; radius: number; color: number; intensity: number }>,
): void {
  const pool = sceneTransientLights.get(scene);
  if (!pool || pool.length === 0) return;

  const step = Math.max(0, dtMs);
  for (let i = pool.length - 1; i >= 0; i--) {
    const light = pool[i];
    light.remainingMs -= step;
    if (light.remainingMs <= 0) {
      pool.splice(i, 1);
      continue;
    }

    const fade = light.remainingMs / light.durationMs;
    out.push({
      x: light.x,
      y: light.y,
      radius: light.radius,
      color: light.color,
      intensity: light.intensity * fade,
    });
  }
}

/**
 * Spawns a simple expanding shockwave ring that scales up and fades out.
 */
function spawnRing(
  scene: Phaser.Scene,
  x: number,
  y: number,
  startRadius: number,
  targetRadius: number,
  strokeColor: number,
  strokeWidth: number,
  durationMs: number,
  fillColor = strokeColor,
  fillAlpha = 0.16,
  depth = VFX_DEPTH,
): void {
  const safeStart = Math.max(1, startRadius);
  const ring = scene.add
    .circle(x, y, safeStart, fillColor, fillAlpha)
    .setStrokeStyle(strokeWidth, strokeColor, 0.95)
    .setDepth(depth)
    .setBlendMode(Phaser.BlendModes.ADD);

  scene.tweens.add({
    targets: ring,
    scale: targetRadius / safeStart,
    alpha: 0,
    duration: durationMs,
    ease: 'Cubic.Out',
    onComplete: () => ring.destroy(),
  });
}

/**
 * Spawns a radial burst of circular particles with optional vertical gravity drift.
 */
function spawnRadialBurst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  count: number,
  colors: readonly number[],
  opts: {
    minDist: number;
    maxDist: number;
    minRadius: number;
    maxRadius: number;
    durationMs: number;
    gravityY?: number;
    riseY?: number;
    endScale?: number;
    ease?: string;
    depth?: number;
    blendMode?: Phaser.BlendModes | number;
  },
): void {
  const depth = opts.depth ?? VFX_DEPTH;
  const gravityY = opts.gravityY ?? 0;
  const riseY = opts.riseY ?? 0;
  const endScale = opts.endScale ?? 0.25;
  const blendMode = opts.blendMode ?? Phaser.BlendModes.ADD;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Phaser.Math.FloatBetween(-0.26, 0.26);
    const dist = Phaser.Math.FloatBetween(opts.minDist, opts.maxDist);
    const color = colors[i % colors.length];
    const radius = Phaser.Math.FloatBetween(opts.minRadius, opts.maxRadius);
    const px = x + Math.cos(angle) * 2;
    const py = y + Math.sin(angle) * 2;
    const particle = scene.add
      .circle(px, py, radius, color, 0.95)
      .setDepth(depth)
      .setBlendMode(blendMode);

    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - riseY;
    const dur = opts.durationMs + Phaser.Math.Between(-35, 55);

    if (gravityY !== 0) {
      const state = { t: 0 };
      scene.tweens.add({
        targets: state,
        t: 1,
        duration: dur,
        ease: 'Linear',
        onUpdate: () => {
          if (!particle.active) return;
          const easeT = 1 - Math.pow(1 - state.t, 2);
          particle.x = px + dx * easeT;
          particle.y = py + dy * easeT + 0.5 * gravityY * state.t * state.t;
          particle.alpha = 1 - Math.pow(state.t, 1.4);
          particle.setScale(1 - (1 - endScale) * state.t);
        },
        onComplete: () => particle.destroy(),
      });
    } else {
      scene.tweens.add({
        targets: particle,
        x: px + dx,
        y: py + dy,
        scale: endScale,
        alpha: 0,
        duration: dur,
        ease: opts.ease ?? 'Quad.Out',
        onComplete: () => particle.destroy(),
      });
    }
  }
}

/**
 * Draws a crackling 4-layer additive neon-sign lightning arc with side-fork branches,
 * glowing endpoint/midpoint blooms, impact flash, and a transient dynamic light pulse.
 */
export function drawLightningArc(
  scene: Phaser.Scene,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts?: { color?: number; coreColor?: number; width?: number; durationMs?: number; branches?: number },
): void {
  if (!canSpawnVfx(scene)) return;

  const color = opts?.color ?? 0x6ce5ff;
  const coreColor = opts?.coreColor ?? 0xffffff;
  const width = opts?.width ?? 2.2;
  const durationMs = opts?.durationMs ?? 220;
  const branchCount = opts?.branches ?? 2;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const nx = dist > 0.001 ? -dy / dist : 0;
  const ny = dist > 0.001 ? dx / dist : -1;

  const segments = Phaser.Math.Clamp(Math.round(dist / 22) + 4, 6, 10);
  const points: Array<{ x: number; y: number }> = [{ x: x1, y: y1 }];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const jitterMag = Phaser.Math.FloatBetween(6, 10) * (Math.random() < 0.5 ? -1 : 1);
    points.push({
      x: x1 + dx * t + nx * jitterMag,
      y: y1 + dy * t + ny * jitterMag,
    });
  }
  points.push({ x: x2, y: y2 });

  const branches: Array<Array<{ x: number; y: number }>> = [];
  for (let b = 0; b < branchCount; b++) {
    const startIdx = Phaser.Math.Between(1, Math.max(1, points.length - 2));
    const origin = points[startIdx];
    const baseAngle = Math.atan2(dy, dx) + Phaser.Math.FloatBetween(0.45, 1.05) * (b % 2 === 0 ? 1 : -1);
    const branchLen = Phaser.Math.FloatBetween(12, 24);
    const midX = origin.x + Math.cos(baseAngle) * (branchLen * 0.55) + Phaser.Math.FloatBetween(-3, 3);
    const midY = origin.y + Math.sin(baseAngle) * (branchLen * 0.55) + Phaser.Math.FloatBetween(-3, 3);
    const tipX = origin.x + Math.cos(baseAngle + Phaser.Math.FloatBetween(-0.35, 0.35)) * branchLen;
    const tipY = origin.y + Math.sin(baseAngle + Phaser.Math.FloatBetween(-0.35, 0.35)) * branchLen;
    branches.push([origin, { x: midX, y: midY }, { x: tipX, y: tipY }]);
  }

  const gfx = scene.add.graphics().setDepth(VFX_DEPTH).setBlendMode(Phaser.BlendModes.ADD);

  const strokeChain = (pts: Array<{ x: number; y: number }>): void => {
    gfx.beginPath();
    gfx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      gfx.lineTo(pts[i].x, pts[i].y);
    }
    gfx.strokePath();
  };

  // 4 stacked additive neon-sign layers: outer bloom, mid glow, hot electric jacket, pure-white core
  const neonLayers: Array<{ mainW: number; branchW: number; stroke: number; mainA: number; branchA: number }> = [
    { mainW: width * 6.5, branchW: width * 4.2, stroke: color, mainA: 0.24, branchA: 0.18 },
    { mainW: width * 3.6, branchW: width * 2.3, stroke: color, mainA: 0.52, branchA: 0.40 },
    { mainW: width * 1.8, branchW: width * 1.15, stroke: 0xc8faff, mainA: 0.90, branchA: 0.78 },
    { mainW: width * 0.95, branchW: width * 0.6, stroke: coreColor, mainA: 1.0, branchA: 0.92 },
  ];

  for (const layer of neonLayers) {
    gfx.lineStyle(layer.mainW, layer.stroke, layer.mainA);
    strokeChain(points);
    for (const br of branches) {
      gfx.lineStyle(layer.branchW, layer.stroke, layer.branchA);
      strokeChain(br);
    }
  }

  const midPt = points[Math.floor(points.length / 2)] ?? { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  const orbSpecs = [
    { x: x1, y: y1, size: 30 + width * 4, alpha: 0.75 },
    { x: midPt.x, y: midPt.y, size: 36 + width * 5, alpha: 0.7 },
    { x: x2, y: y2, size: 42 + width * 6, alpha: 0.9 },
  ];
  const glowOrbs: Array<{ orb: Phaser.GameObjects.Image; baseScale: number; baseAlpha: number }> = [];
  if (ensureGlowOrbTexture(scene)) {
    for (const spec of orbSpecs) {
      const baseScale = spec.size / GLOW_ORB_SIZE;
      const orb = scene.add
        .image(spec.x, spec.y, GLOW_ORB_TEXTURE_KEY)
        .setDepth(VFX_DEPTH - 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(color)
        .setScale(baseScale)
        .setAlpha(spec.alpha);
      glowOrbs.push({ orb, baseScale, baseAlpha: spec.alpha });
    }
  }

  const flickerState = { t: 0 };
  scene.tweens.add({
    targets: flickerState,
    t: 1,
    duration: durationMs,
    ease: 'Linear',
    onUpdate: () => {
      const t = flickerState.t;
      const flicker = 0.65 + 0.35 * Math.sin(t * Math.PI * 9);
      const fade = (1 - t) * flicker;
      if (gfx.active) gfx.setAlpha(fade);
      for (const entry of glowOrbs) {
        if (!entry.orb.active) continue;
        entry.orb.setAlpha(entry.baseAlpha * fade);
        entry.orb.setScale(entry.baseScale * (1 + 0.22 * t));
      }
    },
    onComplete: () => {
      gfx.destroy();
      for (const entry of glowOrbs) {
        entry.orb.destroy();
      }
    },
  });

  // Additive impact node flash at destination
  const nodeFlash = scene.add
    .circle(x2, y2, 4.5, coreColor, 0.95)
    .setStrokeStyle(1.5, color, 0.95)
    .setDepth(VFX_DEPTH + 1)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: nodeFlash,
    scale: 2.3,
    alpha: 0,
    duration: Math.min(160, durationMs),
    ease: 'Quad.Out',
    onComplete: () => nodeFlash.destroy(),
  });

  pushTransientLight(scene, (x1 + x2) / 2, (y1 + y2) / 2, 95, color, 1.0, durationMs);
}

/**
 * Spawns an elemental cast flash, additive radial bloom, and directional sparks from the rod muzzle.
 */
export function spawnRodMuzzleJuice(
  scene: Phaser.Scene,
  x: number,
  y: number,
  kind: RodVfxKind,
  angleRad: number,
): void {
  if (!canSpawnVfx(scene)) return;

  const palette = ROD_PALETTES[kind];
  const glowColor = ROD_GLOW_COLORS[kind];

  spawnGlowOrb(scene, x, y, glowColor, 38, 0.82, 165, VFX_DEPTH - 1, 1.25);

  const flash = scene.add
    .circle(x, y, 5.5, palette.flash, 0.95)
    .setStrokeStyle(1.6, palette.primary, 0.9)
    .setDepth(VFX_DEPTH)
    .setBlendMode(Phaser.BlendModes.ADD);

  scene.tweens.add({
    targets: flash,
    scale: 2.3,
    alpha: 0,
    duration: 150,
    ease: 'Cubic.Out',
    onComplete: () => flash.destroy(),
  });

  const sparkCount = Phaser.Math.Between(6, 8);
  const colors = [palette.primary, palette.secondary, palette.flash];
  for (let i = 0; i < sparkCount; i++) {
    const spread = Phaser.Math.FloatBetween(-0.55, 0.55);
    const dir = angleRad + spread;
    const dist = Phaser.Math.FloatBetween(12, 26);
    const spark = scene.add
      .circle(x, y, Phaser.Math.FloatBetween(1.4, 2.5), colors[i % colors.length], 0.95)
      .setDepth(VFX_DEPTH + 1)
      .setBlendMode(Phaser.BlendModes.ADD);

    scene.tweens.add({
      targets: spark,
      x: x + Math.cos(dir) * dist,
      y: y + Math.sin(dir) * dist,
      scale: 0.2,
      alpha: 0,
      duration: Phaser.Math.Between(120, 195),
      ease: 'Quad.Out',
      onComplete: () => spark.destroy(),
    });
  }
}

/**
 * Spawns a fast-fading elemental trail particle behind an active rod bolt/beam.
 */
export function spawnRodTrailParticle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  kind: RodVfxKind,
): void {
  if (!canSpawnVfx(scene)) return;

  const jx = x + Phaser.Math.FloatBetween(-2.5, 2.5);
  const jy = y + Phaser.Math.FloatBetween(-2.5, 2.5);

  switch (kind) {
    case 'fire': {
      const emberColor = Math.random() < 0.5 ? 0xff6b35 : 0xffd166;
      const ember = scene.add
        .circle(jx, jy, Phaser.Math.FloatBetween(1.6, 2.6), emberColor, 0.92)
        .setDepth(VFX_DEPTH - 2)
        .setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: ember,
        y: jy - Phaser.Math.FloatBetween(4, 9),
        x: jx + Phaser.Math.FloatBetween(-3, 3),
        scale: 0.25,
        alpha: 0,
        duration: 180,
        ease: 'Quad.Out',
        onComplete: () => ember.destroy(),
      });
      // Keep dark smoke on NORMAL blend to contrast with additive fire
      const smoke = scene.add.circle(jx, jy, Phaser.Math.FloatBetween(2.2, 3.4), 0x3b2d2a, 0.42).setDepth(VFX_DEPTH - 3);
      scene.tweens.add({
        targets: smoke,
        y: jy - Phaser.Math.FloatBetween(6, 12),
        scale: 1.65,
        alpha: 0,
        duration: 240,
        ease: 'Sine.Out',
        onComplete: () => smoke.destroy(),
      });
      break;
    }
    case 'ice': {
      const color = Math.random() < 0.55 ? 0xc8f6ff : 0xffffff;
      const diamond = scene.add
        .rectangle(jx, jy, 3.6, 3.6, color, 0.9)
        .setRotation(Math.PI / 4)
        .setDepth(VFX_DEPTH - 2)
        .setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: diamond,
        x: jx + Phaser.Math.FloatBetween(-4, 4),
        y: jy + Phaser.Math.FloatBetween(-3, 5),
        rotation: diamond.rotation + 0.9,
        scale: 0.2,
        alpha: 0,
        duration: 210,
        ease: 'Quad.Out',
        onComplete: () => diamond.destroy(),
      });
      break;
    }
    case 'necro': {
      const color = Math.random() < 0.5 ? 0xa855f7 : 0x55efc4;
      const wisp = scene.add
        .circle(jx, jy, Phaser.Math.FloatBetween(1.8, 3.0), color, 0.85)
        .setDepth(VFX_DEPTH - 2)
        .setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: wisp,
        x: jx + Phaser.Math.FloatBetween(-5, 5),
        y: jy - Phaser.Math.FloatBetween(3, 8),
        scale: 0.3,
        alpha: 0,
        duration: 230,
        ease: 'Sine.Out',
        onComplete: () => wisp.destroy(),
      });
      break;
    }
    case 'void': {
      const color = Math.random() < 0.5 ? 0x4f46e5 : 0xe879f9;
      const orb = scene.add
        .circle(jx, jy, Phaser.Math.FloatBetween(2.0, 3.2), color, 0.88)
        .setDepth(VFX_DEPTH - 2)
        .setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: orb,
        x: x + Phaser.Math.FloatBetween(-3, 3),
        y: y + Phaser.Math.FloatBetween(-3, 3),
        scale: 0.1,
        alpha: 0,
        duration: 200,
        ease: 'Cubic.In',
        onComplete: () => orb.destroy(),
      });
      break;
    }
    case 'thunder': {
      const color = Math.random() < 0.65 ? 0x6ce5ff : 0xffe066;
      const spark = scene.add
        .circle(jx, jy, Phaser.Math.FloatBetween(1.3, 2.3), color, 0.95)
        .setDepth(VFX_DEPTH - 1)
        .setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: spark,
        x: jx + Phaser.Math.FloatBetween(-6, 6),
        y: jy + Phaser.Math.FloatBetween(-6, 6),
        scale: 0.15,
        alpha: 0,
        duration: 140,
        ease: 'Quad.Out',
        onComplete: () => spark.destroy(),
      });
      break;
    }
  }
}

/**
 * Spawns elemental rod impact VFX, including additive radial blooms, transient night lighting,
 * scorch marks, frost novas, void implosions, and necro soul-leech orbs arcing back to the player.
 */
export function spawnRodImpactJuice(
  scene: Phaser.Scene,
  x: number,
  y: number,
  kind: RodVfxKind,
  playerPos?: { x: number; y: number },
): void {
  if (!canSpawnVfx(scene)) return;

  const glowColor = ROD_GLOW_COLORS[kind];
  const lightRadius = ROD_IMPACT_LIGHT_RADIUS[kind];
  spawnGlowOrb(scene, x, y, glowColor, lightRadius * 1.15, 0.85, 250, VFX_DEPTH - 1, 1.2);
  pushTransientLight(scene, x, y, lightRadius, glowColor, 0.95, 260);

  switch (kind) {
    case 'fire': {
      spawnRing(scene, x, y, 6, 38, 0xff6b35, 2.2, 240, 0xffd166, 0.28);
      spawnRadialBurst(scene, x, y, 14, [0xff6b35, 0xff9f1c, 0xffd166], {
        minDist: 10,
        maxDist: 32,
        minRadius: 1.8,
        maxRadius: 3.4,
        durationMs: 280,
        riseY: 12,
      });
      // Keep dark scorch decal on NORMAL blend
      const scorch = scene.add.ellipse(x, y + 2, 28, 16, 0x1a1412, 0.35).setDepth(SCORCH_DEPTH);
      scene.tweens.add({
        targets: scorch,
        alpha: 0,
        duration: 3500,
        ease: 'Quad.In',
        onComplete: () => scorch.destroy(),
      });
      break;
    }
    case 'ice': {
      spawnRing(scene, x, y, 6, 44, 0x6ce5ff, 2.2, 260, 0xc8f6ff, 0.24);
      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 * i) / 12 + Phaser.Math.FloatBetween(-0.18, 0.18);
        const dist = Phaser.Math.FloatBetween(14, 38);
        const color = i % 2 === 0 ? 0xc8f6ff : 0x6ce5ff;
        const shard = scene.add
          .rectangle(x, y, Phaser.Math.FloatBetween(4.5, 7), Phaser.Math.FloatBetween(1.8, 2.8), color, 0.95)
          .setRotation(angle)
          .setDepth(VFX_DEPTH + 1)
          .setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({
          targets: shard,
          x: x + Math.cos(angle) * dist,
          y: y + Math.sin(angle) * dist,
          scaleX: 0.4,
          scaleY: 0.4,
          alpha: 0,
          duration: 280,
          ease: 'Cubic.Out',
          onComplete: () => shard.destroy(),
        });
      }
      break;
    }
    case 'necro': {
      spawnRing(scene, x, y, 5, 28, 0xa855f7, 2, 240, 0x55efc4, 0.2);
      spawnRadialBurst(scene, x, y, 10, [0xa855f7, 0xc084fc, 0x55efc4], {
        minDist: 8,
        maxDist: 22,
        minRadius: 1.6,
        maxRadius: 2.8,
        durationMs: 250,
        riseY: 6,
      });

      if (playerPos) {
        const destX = playerPos.x;
        const destY = playerPos.y - 6;
        const soulHalo = scene.add
          .circle(x, y, 6, 0x55efc4, 0.4)
          .setDepth(VFX_DEPTH)
          .setBlendMode(Phaser.BlendModes.ADD);
        const soulOrb = scene.add
          .circle(x, y, 3.4, 0x55efc4, 1)
          .setStrokeStyle(1.2, 0xffffff, 0.9)
          .setDepth(VFX_DEPTH + 1)
          .setBlendMode(Phaser.BlendModes.ADD);

        const arcHeight = Math.max(14, Math.min(34, Math.hypot(destX - x, destY - y) * 0.28));
        const arcState = { t: 0 };
        scene.tweens.add({
          targets: arcState,
          t: 1,
          duration: 320,
          ease: 'Sine.InOut',
          onUpdate: () => {
            const t = arcState.t;
            const curX = Phaser.Math.Linear(x, destX, t);
            const curY = Phaser.Math.Linear(y, destY, t) - Math.sin(t * Math.PI) * arcHeight;
            if (soulOrb.active) soulOrb.setPosition(curX, curY);
            if (soulHalo.active) soulHalo.setPosition(curX, curY);
          },
          onComplete: () => {
            soulOrb.destroy();
            soulHalo.destroy();
            if (canSpawnVfx(scene)) {
              spawnRing(scene, destX, destY, 4, 18, 0x55efc4, 1.8, 210, 0x55efc4, 0.25);
            }
          },
        });
      }
      break;
    }
    case 'void': {
      // Imploding gravity ring (shrinks from 34px down to a point)
      const gravityRing = scene.add
        .circle(x, y, 34, 0x4f46e5, 0.16)
        .setStrokeStyle(2.4, 0xe879f9, 0.95)
        .setDepth(VFX_DEPTH)
        .setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: gravityRing,
        scale: 0.12,
        alpha: 0,
        duration: 240,
        ease: 'Cubic.In',
        onComplete: () => gravityRing.destroy(),
      });

      const core = scene.add
        .circle(x, y, 6, 0x4f46e5, 0.9)
        .setStrokeStyle(1.5, 0xe879f9, 0.95)
        .setDepth(VFX_DEPTH + 1)
        .setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: core,
        scale: 1.7,
        alpha: 0,
        duration: 220,
        ease: 'Quad.Out',
        onComplete: () => core.destroy(),
      });

      spawnRadialBurst(scene, x, y, 14, [0xe879f9, 0x818cf8, 0x4f46e5], {
        minDist: 10,
        maxDist: 30,
        minRadius: 1.6,
        maxRadius: 3.0,
        durationMs: 250,
      });
      break;
    }
    case 'thunder': {
      const flash = scene.add
        .circle(x, y, 7, 0xffffff, 0.95)
        .setStrokeStyle(2, 0x6ce5ff, 0.95)
        .setDepth(VFX_DEPTH + 1)
        .setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: flash,
        scale: 2.2,
        alpha: 0,
        duration: 160,
        ease: 'Quad.Out',
        onComplete: () => flash.destroy(),
      });
      spawnRadialBurst(scene, x, y, 10, [0x6ce5ff, 0xffffff, 0xffe066], {
        minDist: 10,
        maxDist: 28,
        minRadius: 1.4,
        maxRadius: 2.5,
        durationMs: 200,
      });
      break;
    }
  }
}

/**
 * Spits 2-3 bright sizzling additive sparks and a pulsing glow dot from a bomb's wick.
 */
export function spawnFuseSparks(scene: Phaser.Scene, x: number, y: number, tint: number): void {
  if (!canSpawnVfx(scene)) return;

  const wickX = x;
  const wickY = y - 6;

  // Tiny pulsing additive glow dot on the sizzling wick
  spawnGlowOrb(scene, wickX, wickY, tint, 18, 0.72, 160, VFX_DEPTH - 1, 1.35);

  const count = Phaser.Math.Between(2, 3);
  for (let i = 0; i < count; i++) {
    const color = i === 0 ? 0xfff2a6 : tint;
    const spark = scene.add
      .circle(wickX, wickY, Phaser.Math.FloatBetween(1.2, 2.0), color, 0.98)
      .setDepth(VFX_DEPTH)
      .setBlendMode(Phaser.BlendModes.ADD);
    const vx = Phaser.Math.FloatBetween(-13, 13);
    const vy = Phaser.Math.FloatBetween(-16, -7);
    const state = { t: 0 };

    scene.tweens.add({
      targets: state,
      t: 1,
      duration: 220,
      ease: 'Linear',
      onUpdate: () => {
        if (!spark.active) return;
        const t = state.t;
        spark.x = wickX + vx * t;
        spark.y = wickY + vy * t + 26 * t * t;
        spark.alpha = 1 - t;
        spark.setScale(1 - 0.7 * t);
      },
      onComplete: () => spark.destroy(),
    });
  }
}

/**
 * Plays a full multi-layered incandescent bomb explosion with trauma shake, additive bloom,
 * double shockwaves, flash core, 36-42 particles + elemental flair, dark contrasting smoke,
 * a fading ground scorch crater, and a high-intensity transient night light.
 */
export function spawnMaxBombExplosionJuice(
  scene: Phaser.Scene,
  bx: number,
  by: number,
  radius: number,
  tint: number,
  kind: BombKind,
  cameraRig?: { addTrauma: (amount: number) => void },
): void {
  cameraRig?.addTrauma(kind === 'bomb_void' ? 0.85 : 0.65);

  if (!canSpawnVfx(scene)) return;

  // Ground scorch crater (NORMAL blend)
  const scorch = scene.add
    .ellipse(bx, by + 3, radius * 1.15, radius * 0.68, 0x161210, 0.42)
    .setDepth(SCORCH_DEPTH);
  scene.tweens.add({
    targets: scorch,
    alpha: 0,
    duration: 6000,
    ease: 'Quad.In',
    onComplete: () => scorch.destroy(),
  });

  // Huge additive radial explosion light bloom + blinding white inner core bloom
  spawnGlowOrb(scene, bx, by, tint, radius * 3.2, 0.95, 440, VFX_DEPTH, 1.12, 'Cubic.Out');
  spawnGlowOrb(scene, bx, by, 0xffffff, radius * 1.6, 1.0, 220, VFX_DEPTH + 2, 1.08, 'Quad.Out');
  pushTransientLight(scene, bx, by, radius * 2.6, tint, 1.35, 480);

  // Brief additive white-gold flash core
  const coreRadius = Math.max(8, radius * 0.75);
  const flashCore = scene.add
    .circle(bx, by, coreRadius * 0.45, 0xfff5c0, 0.96)
    .setDepth(VFX_DEPTH + 2)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: flashCore,
    scale: 1 / 0.45,
    alpha: 0,
    duration: 180,
    ease: 'Quad.Out',
    onComplete: () => flashCore.destroy(),
  });

  // Double expanding additive shockwaves: inner white-gold + outer tinted ring
  const outerTarget = radius * 1.15;
  spawnRing(scene, bx, by, 8, outerTarget * 0.85, 0xfff2a6, 2.6, 260, 0xfff2a6, 0.14, VFX_DEPTH + 1);
  spawnRing(scene, bx, by, 10, outerTarget, tint, 3.0, 320, tint, 0.12, VFX_DEPTH);

  // 14 bright fiery/elemental burst droplets racing outward (ADD)
  const dropletColors =
    kind === 'bomb_frost'
      ? [0xc8f6ff, 0x6ce5ff, tint]
      : kind === 'bomb_void'
        ? [0xc77dff, 0xe879f9, 0x6366f1]
        : [0xfff2a6, 0xff9f1c, tint];
  spawnRadialBurst(scene, bx, by, 14, dropletColors, {
    minDist: radius * 0.4,
    maxDist: radius * 1.05,
    minRadius: 2.4,
    maxRadius: 4.4,
    durationMs: 310,
    endScale: 0.2,
    depth: VFX_DEPTH + 1,
  });

  // 12 glowing sparks flying fast with slight gravity drop (ADD)
  spawnRadialBurst(scene, bx, by, 12, [0xfff2a6, tint, 0xffffff], {
    minDist: radius * 0.55,
    maxDist: radius * 1.25,
    minRadius: 1.4,
    maxRadius: 2.3,
    durationMs: 360,
    gravityY: 28,
    endScale: 0.15,
    depth: VFX_DEPTH + 2,
  });

  // 10 dark billowing smoke puffs rising & expanding slowly (NORMAL blend for dramatic contrast)
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI * 2 * i) / 10 + Phaser.Math.FloatBetween(-0.25, 0.25);
    const dist = Phaser.Math.FloatBetween(radius * 0.15, radius * 0.65);
    const sx = bx + Math.cos(angle) * 4;
    const sy = by + Math.sin(angle) * 4;
    const smoke = scene.add
      .circle(sx, sy, Phaser.Math.FloatBetween(4.5, 7.5), 0x2e2624, 0.58)
      .setDepth(VFX_DEPTH - 1);

    scene.tweens.add({
      targets: smoke,
      x: sx + Math.cos(angle) * dist,
      y: sy + Math.sin(angle) * dist - Phaser.Math.FloatBetween(10, 20),
      scale: Phaser.Math.FloatBetween(1.6, 2.2),
      alpha: 0,
      duration: 550 + Phaser.Math.Between(-50, 70),
      ease: 'Sine.Out',
      onComplete: () => smoke.destroy(),
    });
  }

  // Element-specific additive flair (6 extra particles -> 42 total for elemental bombs, 36 for standard)
  if (kind === 'bomb_frost') {
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6 + Phaser.Math.FloatBetween(-0.2, 0.2);
      const dist = Phaser.Math.FloatBetween(radius * 0.45, radius * 1.0);
      const shard = scene.add
        .rectangle(bx, by, 7, 2.6, i % 2 === 0 ? 0xc8f6ff : 0x6ce5ff, 0.95)
        .setRotation(angle)
        .setDepth(VFX_DEPTH + 2)
        .setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: shard,
        x: bx + Math.cos(angle) * dist,
        y: by + Math.sin(angle) * dist,
        scaleX: 0.4,
        scaleY: 0.4,
        alpha: 0,
        duration: 340,
        ease: 'Cubic.Out',
        onComplete: () => shard.destroy(),
      });
    }
  } else if (kind === 'bomb_fire') {
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6 + Phaser.Math.FloatBetween(-0.22, 0.22);
      const dist = Phaser.Math.FloatBetween(radius * 0.3, radius * 0.8);
      const tongue = scene.add
        .ellipse(bx, by, 6, 3.2, i % 2 === 0 ? 0xff6333 : 0xffd166, 0.95)
        .setRotation(angle)
        .setDepth(VFX_DEPTH + 2)
        .setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: tongue,
        x: bx + Math.cos(angle) * dist,
        y: by + Math.sin(angle) * dist - 14,
        scaleX: 0.35,
        scaleY: 0.35,
        alpha: 0,
        duration: 380,
        ease: 'Quad.Out',
        onComplete: () => tongue.destroy(),
      });
    }
  } else if (kind === 'bomb_void') {
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6 + Phaser.Math.FloatBetween(-0.2, 0.2);
      const dist = Phaser.Math.FloatBetween(radius * 0.35, radius * 0.95);
      const rift = scene.add
        .rectangle(bx, by, 8, 2.2, i % 2 === 0 ? 0xc77dff : 0x4f46e5, 0.95)
        .setRotation(angle + Math.PI / 2)
        .setDepth(VFX_DEPTH + 2)
        .setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: rift,
        x: bx + Math.cos(angle) * dist,
        y: by + Math.sin(angle) * dist,
        rotation: rift.rotation + 1.2,
        scaleX: 0.3,
        scaleY: 0.3,
        alpha: 0,
        duration: 390,
        ease: 'Cubic.Out',
        onComplete: () => rift.destroy(),
      });
    }
  }
}
