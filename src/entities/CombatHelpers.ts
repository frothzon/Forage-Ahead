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

export function spawnFloatingText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color = '#ffffff',
  fontSize = '8px',
): void {
  const txt = scene.add
    .text(x, y, text, {
      fontSize,
      fontStyle: 'bold',
      color,
      stroke: '#0b1018',
      strokeThickness: 2,
    })
    .setOrigin(0.5)
    .setDepth(9999);

  scene.tweens.add({
    targets: txt,
    y: y - 16,
    alpha: 0,
    duration: 620,
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
    const p = scene.add.rectangle(x, y, 2.5, 2.5, color).setDepth(y + 10);
    const ang = Math.random() * Math.PI * 2;
    const spd = Phaser.Math.Between(14, 38);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(ang) * spd,
      y: y + Math.sin(ang) * spd - 4,
      alpha: 0,
      duration: Phaser.Math.Between(240, 420),
      onComplete: () => p.destroy(),
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
  gfx.lineStyle(3, color, 0.85);
  gfx.beginPath();
  gfx.arc(x, y, range * 0.72, angle - 0.85, angle + 0.85, false);
  gfx.strokePath();
  scene.tweens.add({
    targets: gfx,
    alpha: 0,
    duration: 140,
    onComplete: () => gfx.destroy(),
  });
}
