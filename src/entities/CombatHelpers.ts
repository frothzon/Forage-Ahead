import Phaser from 'phaser';

export interface ActiveProjectile {
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  damage: number;
  fromPlayer: boolean;
  lifeMs: number;
  kind: 'arrow' | 'fire' | 'ice' | 'thunder' | 'necro' | 'enemy';
  pierce?: boolean;
}

export type FloatingTextStyle = 'default' | 'damage' | 'crit' | 'xp' | 'exhausted';

export function getWeaponSlashColor(itemId: string): number {
  if (itemId === 'sword_obsidian' || itemId === 'sword_wyrmheart') return 0xff6b3d;
  if (itemId === 'sword_sun') return 0xffe066;
  if (itemId === 'sword_astral') return 0xd28eff;
  if (itemId === 'sword_iron') return 0xdbe9ff;
  if (itemId.startsWith('sword')) return 0xfff0a8;
  if (itemId === 'pickaxe_crystal') return 0x7ce8ff;
  if (itemId === 'pickaxe_gold') return 0xffdf78;
  return 0xb5e2ff;
}

export function triggerHitStop(scene: Phaser.Scene, durationMs = 42, zoomPunch = 0.05): void {
  const cam = scene.cameras.main;
  if (zoomPunch > 0 && cam) {
    const baseZoom = cam.zoom;
    scene.tweens.add({
      targets: cam,
      zoom: baseZoom + zoomPunch,
      duration: Math.max(40, durationMs),
      yoyo: true,
      ease: 'Quad.Out',
    });
  }
  scene.time.timeScale = 0.18;
  scene.time.delayedCall(Math.max(12, Math.round(durationMs * 0.2)), () => {
    if (scene.time) scene.time.timeScale = 1;
  });
}

export function spawnFloatingText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color = '#ffffff',
  fontSize = '8px',
  style: FloatingTextStyle = 'default',
): void {
  const txt = scene.add
    .text(x, y, text, {
      fontSize,
      fontStyle: 'bold',
      color,
      stroke: '#0b1018',
      strokeThickness: style === 'crit' ? 3 : 2,
      resolution: 4,
    })
    .setOrigin(0.5)
    .setScale(style === 'crit' ? 2.1 : style === 'damage' ? 1.75 : style === 'xp' ? 1.4 : 1.45)
    .setDepth(9999);

  if (style === 'damage' || style === 'crit') {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const driftX = dir * Phaser.Math.Between(8, 15);
    const rot = dir * (style === 'crit' ? 10 : 6);
    scene.tweens.add({
      targets: txt,
      scale: style === 'crit' ? 1.15 : 0.98,
      angle: { from: -rot, to: rot },
      duration: 180,
      ease: 'Back.Out',
      yoyo: style === 'crit',
      repeat: style === 'crit' ? 1 : 0,
    });
    scene.tweens.add({
      targets: txt,
      x: x + driftX,
      y: y - (style === 'crit' ? 24 : 19),
      duration: 240,
      ease: 'Quad.Out',
      onComplete: () => {
        if (!txt.active) return;
        scene.tweens.add({
          targets: txt,
          y: txt.y - 6,
          alpha: 0,
          duration: 420,
          ease: 'Cubic.In',
          onComplete: () => txt.destroy(),
        });
      },
    });
    return;
  }

  if (style === 'xp') {
    const sway = Phaser.Math.Between(-6, 6);
    scene.tweens.add({
      targets: txt,
      scale: { from: 1.35, to: 1.02 },
      duration: 160,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.InOut',
    });
    scene.tweens.add({
      targets: txt,
      x: x + sway,
      y: y - 26,
      alpha: { from: 1, to: 0 },
      duration: 920,
      ease: 'Sine.Out',
      onComplete: () => txt.destroy(),
    });
    return;
  }

  if (style === 'exhausted') {
    scene.tweens.add({
      targets: txt,
      scale: 1,
      angle: { from: -4, to: 4 },
      duration: 220,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.InOut',
    });
    scene.tweens.add({
      targets: txt,
      y: y - 16,
      alpha: 0,
      duration: 1450,
      ease: 'Cubic.Out',
      onComplete: () => txt.destroy(),
    });
    return;
  }

  const driftX = Phaser.Math.Between(-7, 7);
  scene.tweens.add({
    targets: txt,
    scale: 1,
    duration: 140,
    ease: 'Back.Out',
  });
  scene.tweens.add({
    targets: txt,
    x: x + driftX,
    y: y - 18,
    alpha: 0,
    duration: 660,
    ease: 'Cubic.Out',
    onComplete: () => txt.destroy(),
  });
}

export function spawnBurstParticles(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  count = 6,
): void {
  for (let i = 0; i < count; i++) {
    const size = Phaser.Math.FloatBetween(2, 3.5);
    const p = scene.add.rectangle(x, y, size, size, color).setDepth(y + 12);
    const ang = Math.random() * Math.PI * 2;
    const spd = Phaser.Math.Between(14, 42);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(ang) * spd,
      y: y + Math.sin(ang) * spd - 6,
      scale: 0.2,
      angle: Phaser.Math.Between(-90, 90),
      alpha: 0,
      duration: Phaser.Math.Between(240, 440),
      ease: 'Quad.Out',
      onComplete: () => p.destroy(),
    });
  }
}

export function spawnArcParticles(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  count = 7,
  opts?: { speedMin?: number; speedMax?: number; lift?: number; size?: number; gravity?: number; duration?: number },
): void {
  const spdMin = opts?.speedMin ?? 14;
  const spdMax = opts?.speedMax ?? 36;
  const lift = opts?.lift ?? 14;
  const sz = opts?.size ?? 2.6;
  const grav = opts?.gravity ?? 12;
  const dur = opts?.duration ?? 420;

  for (let i = 0; i < count; i++) {
    const p = scene.add.rectangle(x, y, sz, sz, color).setDepth(y + 14);
    const ang = Math.random() * Math.PI * 2;
    const spd = Phaser.Math.Between(spdMin, spdMax);
    const dx = Math.cos(ang) * spd;
    const dy = Math.sin(ang) * spd * 0.65 - Phaser.Math.Between(Math.round(lift * 0.6), lift);
    scene.tweens.add({
      targets: p,
      x: x + dx,
      y: y + dy + grav,
      scale: 0.25,
      angle: Phaser.Math.Between(-160, 160),
      alpha: 0,
      duration: Phaser.Math.Between(Math.round(dur * 0.75), dur),
      ease: 'Quad.Out',
      onComplete: () => p.destroy(),
    });
  }
}

export function spawnDirectionalSparks(
  scene: Phaser.Scene,
  x: number,
  y: number,
  angle: number,
  color: number,
  count = 6,
  spread = 0.75,
): void {
  for (let i = 0; i < count; i++) {
    const a = angle + Phaser.Math.FloatBetween(-spread, spread);
    const spd = Phaser.Math.Between(16, 44);
    const p = scene.add.rectangle(x, y, 4, 1.6, color).setRotation(a).setDepth(y + 15);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(a) * spd,
      y: y + Math.sin(a) * spd,
      scaleX: 0.2,
      alpha: 0,
      duration: Phaser.Math.Between(160, 300),
      ease: 'Cubic.Out',
      onComplete: () => p.destroy(),
    });
  }
}

export function spawnShockwaveRing(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  maxRadius = 32,
  duration = 320,
): void {
  const ring = scene.add.circle(x, y, 4, color, 0).setStrokeStyle(2, color, 0.9).setDepth(y + 12);
  scene.tweens.add({
    targets: ring,
    scale: maxRadius / 4,
    alpha: 0,
    duration,
    ease: 'Cubic.Out',
    onComplete: () => ring.destroy(),
  });
}

export function spawnProjectileTrail(
  scene: Phaser.Scene,
  x: number,
  y: number,
  kind: ActiveProjectile['kind'],
): void {
  const cfg: Record<ActiveProjectile['kind'], { color: number; size: number; driftY: number }> = {
    arrow: { color: 0xe6edf5, size: 1.5, driftY: 0 },
    fire: { color: 0xff8a3d, size: 2.6, driftY: -5 },
    ice: { color: 0x8be4ff, size: 2.4, driftY: 2 },
    thunder: { color: 0xffe96b, size: 2.2, driftY: -2 },
    necro: { color: 0xb77cff, size: 2.5, driftY: -4 },
    enemy: { color: 0xff6b8b, size: 2.2, driftY: -2 },
  };
  const c = cfg[kind] ?? cfg.enemy;
  const p = scene.add
    .circle(x + Phaser.Math.Between(-2, 2), y + Phaser.Math.Between(-2, 2), c.size, c.color, 0.75)
    .setDepth(y + 8);
  scene.tweens.add({
    targets: p,
    y: p.y + c.driftY,
    scale: 0.15,
    alpha: 0,
    duration: 210,
    onComplete: () => p.destroy(),
  });
}

export function spawnDeathBurst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  enemyId: string,
  isBoss = false,
): void {
  const id = enemyId.toLowerCase();
  const color =
    id.includes('slime') ? 0x6ce67c :
    id.includes('skeleton') || id.includes('lich') || id.includes('mummy') ? 0xe8e0c8 :
    id.includes('ice') || id.includes('frost') ? 0x8ae2ff :
    id.includes('demon') || id.includes('imp') || id.includes('hell') || id.includes('red dragon') ? 0xff6a3d :
    id.includes('void') || id.includes('oni') || id.includes('black dragon') || id.includes('beholder') ? 0xc07dff :
    0xf2c166;

  spawnArcParticles(scene, x, y - 4, color, isBoss ? 24 : 10, {
    speedMin: 16,
    speedMax: isBoss ? 68 : 42,
    lift: isBoss ? 26 : 14,
    size: isBoss ? 3.8 : 2.6,
    duration: isBoss ? 640 : 420,
  });
  spawnShockwaveRing(scene, x, y - 4, color, isBoss ? 64 : 26, isBoss ? 480 : 280);

  // Rising soul wisp
  const wisp = scene.add.circle(x, y - 4, isBoss ? 5 : 3, 0xffffff, 0.85).setDepth(y + 20);
  scene.tweens.add({
    targets: wisp,
    y: y - (isBoss ? 36 : 22),
    scale: 0.2,
    alpha: 0,
    duration: isBoss ? 720 : 480,
    ease: 'Sine.Out',
    onComplete: () => wisp.destroy(),
  });
}

export function spawnSparklers(
  scene: Phaser.Scene,
  x: number,
  y: number,
  count = 16,
): void {
  const palette = [0xffe066, 0x7ef29d, 0x7ac7ff, 0xff8fab, 0xffffff];
  for (let i = 0; i < count; i++) {
    const col = palette[i % palette.length];
    const ang = (Math.PI * 2 * i) / count + Phaser.Math.FloatBetween(-0.2, 0.2);
    const spd = Phaser.Math.Between(22, 54);
    const star = scene.add.rectangle(x, y, 3, 3, col).setDepth(9995);
    scene.tweens.add({
      targets: star,
      x: x + Math.cos(ang) * spd,
      y: y + Math.sin(ang) * spd - 8,
      angle: 180,
      scale: 0.2,
      alpha: 0,
      duration: Phaser.Math.Between(360, 620),
      ease: 'Cubic.Out',
      onComplete: () => star.destroy(),
    });
  }
}

export function drawSlashArc(
  scene: Phaser.Scene,
  x: number,
  y: number,
  angle: number,
  range: number,
  color = 0xfff0a8,
): void {
  const gfx = scene.add.graphics().setDepth(y + 12);
  gfx.lineStyle(3.5, color, 0.9);
  gfx.beginPath();
  gfx.arc(x, y, range * 0.72, angle - 0.85, angle + 0.85, false);
  gfx.strokePath();
  gfx.lineStyle(1.5, 0xffffff, 0.95);
  gfx.beginPath();
  gfx.arc(x, y, range * 0.76, angle - 0.65, angle + 0.65, false);
  gfx.strokePath();
  scene.tweens.add({
    targets: gfx,
    alpha: 0,
    duration: 140,
    onComplete: () => gfx.destroy(),
  });
}
