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
  if (itemId === 'sword_obsidian' || itemId === 'sword_wyrmheart') return 0xc84bff;
  if (itemId === 'sword_gold' || itemId === 'sword_sun') return 0xffe066;
  if (itemId === 'sword_astral') return 0x6ce5ff;
  if (itemId === 'sword_iron' || itemId === 'sword') return 0xe8f1ff;
  if (itemId.startsWith('sword')) return 0xe8f1ff;
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
  const isCrit = style === 'crit';
  const displayText = isCrit && !text.endsWith('!') ? `${text}!` : text;
  const fontFamily = isCrit ? 'SproutLandsDisplay, monospace' : 'SproutLandsCompact, monospace';
  const baseScale = isCrit ? 1.4 : style === 'damage' ? 1.0 : style === 'xp' ? 0.92 : 0.95;

  const txt = scene.add
    .text(x, y, displayText, {
      fontFamily,
      fontSize: isCrit ? '11px' : fontSize,
      fontStyle: 'bold',
      color: isCrit ? '#ffffff' : color,
      stroke: '#0b1018',
      strokeThickness: isCrit ? 3.5 : 2.5,
      resolution: 4,
    })
    .setOrigin(0.5)
    .setScale(baseScale * 1.25)
    .setDepth(9999);

  if (style === 'damage' || isCrit) {
    if (isCrit) {
      // Brief gold-to-white flash
      scene.time.delayedCall(65, () => {
        if (txt.active) txt.setColor('#ffe066');
      });
      scene.time.delayedCall(145, () => {
        if (txt.active) txt.setColor(color === '#ffffff' ? '#ffe066' : color);
      });
    }

    // Ballistic arc: initial upward + horizontal velocity with gravity
    const dir = Math.random() < 0.5 ? -1 : 1;
    const vx = dir * Phaser.Math.FloatBetween(18, 34);
    let vy = isCrit ? -68 : -54;
    const gravity = 190;
    const startX = x;
    const startY = y;
    const dur = isCrit ? 640 : 520;
    let prevT = 0;

    scene.tweens.add({
      targets: txt,
      scale: baseScale,
      duration: 130,
      ease: 'Back.Out',
    });

    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: dur,
      onUpdate: (tw) => {
        if (!txt.active) return;
        const t = tw.getValue() ?? 0;
        const dt = ((t - prevT) * dur) / 1000;
        prevT = t;
        vy += gravity * dt;
        txt.x = startX + vx * (t * (dur / 1000));
        txt.y += vy * dt;
        if (txt.y > startY + 8) txt.y = startY + 8;
        if (t > 0.65) {
          txt.alpha = Math.max(0, 1 - (t - 0.65) / 0.35);
        }
      },
      onComplete: () => {
        if (txt.active) txt.destroy();
      },
    });
    return;
  }

  if (style === 'xp') {
    const slotIdx = allocPopupSlot(scene);
    const baseY = y - slotIdx * 10;
    txt.setPosition(x, baseY);
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
      y: baseY - 24,
      alpha: { from: 1, to: 0 },
      duration: 920,
      ease: 'Sine.Out',
      onComplete: () => {
        releasePopupSlot(scene, slotIdx);
        txt.destroy();
      },
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

interface RollingHarvestEntry {
  txt: Phaser.GameObjects.Text;
  total: number;
  label: string;
  slotIdx: number;
  fadeTimer?: Phaser.Time.TimerEvent;
}

const rollingHarvestMap = new WeakMap<Phaser.Scene, Map<string, RollingHarvestEntry>>();
const popupSlotsMap = new WeakMap<Phaser.Scene, Set<number>>();

function allocPopupSlot(scene: Phaser.Scene): number {
  let used = popupSlotsMap.get(scene);
  if (!used) {
    used = new Set<number>();
    popupSlotsMap.set(scene, used);
  }
  let idx = 0;
  while (used.has(idx) && idx < 12) idx++;
  used.add(idx);
  return idx;
}

function releasePopupSlot(scene: Phaser.Scene, idx: number): void {
  popupSlotsMap.get(scene)?.delete(idx);
}

export function spawnRollingHarvestText(
  scene: Phaser.Scene,
  key: string,
  x: number,
  y: number,
  label: string,
  amount = 1,
  color = '#a6ffbe',
): void {
  let map = rollingHarvestMap.get(scene);
  if (!map) {
    map = new Map();
    rollingHarvestMap.set(scene, map);
  }

  const existing = map.get(key);
  if (existing && existing.txt.active) {
    existing.total += amount;
    existing.txt.setText(`+${existing.total} ${existing.label}`);
    existing.txt.setPosition(x, y - existing.slotIdx * 10);
    existing.txt.setAlpha(1);
    existing.fadeTimer?.remove(false);
    scene.tweens.killTweensOf(existing.txt);
    existing.txt.setScale(1.32);
    scene.tweens.add({
      targets: existing.txt,
      scale: 1,
      duration: 130,
      ease: 'Back.Out',
    });
    existing.fadeTimer = scene.time.delayedCall(1200, () => {
      if (!existing.txt.active) {
        releasePopupSlot(scene, existing.slotIdx);
        map?.delete(key);
        return;
      }
      scene.tweens.add({
        targets: existing.txt,
        y: existing.txt.y - 12,
        alpha: 0,
        duration: 360,
        onComplete: () => {
          releasePopupSlot(scene, existing.slotIdx);
          if (existing.txt.active) existing.txt.destroy();
          map?.delete(key);
        },
      });
    });
    return;
  }

  const slotIdx = allocPopupSlot(scene);
  const stackY = y - slotIdx * 10;

  const txt = scene.add
    .text(x, stackY, `+${amount} ${label}`, {
      fontFamily: 'SproutLandsCompact, monospace',
      fontSize: '8px',
      fontStyle: 'bold',
      color,
      stroke: '#0b1018',
      strokeThickness: 2.5,
      resolution: 4,
    })
    .setOrigin(0.5)
    .setScale(1.25)
    .setDepth(9999);

  scene.tweens.add({
    targets: txt,
    scale: 1,
    duration: 120,
    ease: 'Back.Out',
  });

  const entry: RollingHarvestEntry = { txt, total: amount, label, slotIdx };
  entry.fadeTimer = scene.time.delayedCall(1200, () => {
    if (!txt.active) {
      releasePopupSlot(scene, slotIdx);
      map?.delete(key);
      return;
    }
    scene.tweens.add({
      targets: txt,
      y: txt.y - 12,
      alpha: 0,
      duration: 360,
      onComplete: () => {
        releasePopupSlot(scene, slotIdx);
        if (txt.active) txt.destroy();
        map?.delete(key);
      },
    });
  });
  map.set(key, entry);
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

export function spawnProjectileImpact(
  scene: Phaser.Scene,
  x: number,
  y: number,
  kind: ActiveProjectile['kind'],
): void {
  const texMap: Record<ActiveProjectile['kind'], string> = {
    arrow: 'projectiles/Arrow_impact',
    fire: 'projectiles/Fireball_impact',
    ice: 'projectiles/IceShard_impact',
    thunder: 'projectiles/LightningBolt_impact',
    necro: 'projectiles/MagicMissile_impact',
    enemy: 'projectiles/MagicMissile_impact',
  };
  const key = texMap[kind] ?? 'projectiles/MagicMissile_impact';
  if (scene.textures.exists(key)) {
    const img = scene.add.image(x, y, key).setDepth(y + 18).setScale(0.9);
    scene.tweens.add({
      targets: img,
      scale: 1.25,
      alpha: 0,
      duration: 190,
      ease: 'Quad.Out',
      onComplete: () => img.destroy(),
    });
  } else {
    spawnShockwaveRing(scene, x, y, 0xffffff, 14, 180);
  }
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
  const rOuter = range * 0.78;
  const rInner = range * 0.56;
  const startA = angle - 0.95;
  const endA = angle + 0.95;

  // 3-frame tapered crescent smear
  const renderFrame = (frame: number) => {
    if (!gfx.active) return;
    gfx.clear();
    const alpha = frame === 0 ? 0.92 : frame === 1 ? 0.68 : 0.35;
    const sweepStart = startA + frame * 0.25;
    const steps = 10;
    gfx.fillStyle(color, alpha);
    gfx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = Phaser.Math.Linear(sweepStart, endA, t);
      const px = x + Math.cos(a) * rOuter;
      const py = y + Math.sin(a) * rOuter;
      if (i === 0) gfx.moveTo(px, py);
      else gfx.lineTo(px, py);
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const a = Phaser.Math.Linear(sweepStart, endA, t);
      const taper = Math.sin(t * Math.PI);
      const r = Phaser.Math.Linear(rOuter, rInner, taper);
      gfx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    gfx.closePath();
    gfx.fillPath();

    if (frame < 2) {
      gfx.lineStyle(1.5, 0xffffff, alpha);
      gfx.beginPath();
      gfx.arc(x, y, rOuter * 0.98, sweepStart + 0.15, endA - 0.1, false);
      gfx.strokePath();
    }
  };

  renderFrame(0);
  scene.time.delayedCall(45, () => renderFrame(1));
  scene.time.delayedCall(90, () => renderFrame(2));
  scene.time.delayedCall(135, () => {
    if (gfx.active) gfx.destroy();
  });
}

/**
 * Shakes stone block barriers, turns them into rising dust puffs + stone debris, and destroys them.
 */
export function crumbleStoneBlocks(
  scene: Phaser.Scene,
  sprites: Phaser.GameObjects.Image[],
  dustColor = 0xc9c2b8,
): void {
  for (let i = 0; i < sprites.length; i++) {
    const spr = sprites[i];
    if (!spr.active) continue;
    const bx = spr.x;
    const by = spr.y;
    scene.tweens.add({
      targets: spr,
      x: bx + (i % 2 === 0 ? 1.5 : -1.5),
      scaleX: 1.08,
      scaleY: 0.9,
      duration: 55,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        if (spr.active) spr.destroy();
        spawnArcParticles(scene, bx, by, dustColor, 7);
        for (let p = 0; p < 3; p++) {
          const puff = scene.add
            .circle(bx + (Math.random() - 0.5) * 10, by + (Math.random() - 0.5) * 6, 4 + Math.random() * 3, dustColor, 0.72)
            .setDepth(6500);
          scene.tweens.add({
            targets: puff,
            y: puff.y - 10 - Math.random() * 6,
            scale: 1.55,
            alpha: 0,
            duration: 420,
            ease: 'Quad.Out',
            onComplete: () => puff.destroy(),
          });
        }
      },
    });
  }
}
