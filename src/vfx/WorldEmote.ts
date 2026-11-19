import Phaser from 'phaser';

export type WorldEmoteKey =
  | 'portraits/Emote_alert'
  | 'portraits/Emote_angry'
  | 'portraits/Emote_laughing'
  | 'portraits/Emote_nervous'
  | 'portraits/Emote_question'
  | 'portraits/Emote_sleeping'
  | 'portraits/Emote_talking'
  | 'portraits/Emote_yes'
  | 'portraits/Emote_no';

/**
 * Pops a world-space emote bubble above a target (or at x, y) with a snappy
 * pop-in and gentle fade-out.
 */
export function showWorldEmote(
  scene: Phaser.Scene,
  x: number,
  y: number,
  emoteKey: WorldEmoteKey,
  opts?: { durationMs?: number; hearts?: boolean; scale?: number },
): void {
  const durationMs = opts?.durationMs ?? 1050;
  const scale = opts?.scale ?? 0.72;

  let obj: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
  if (scene.textures.exists(emoteKey)) {
    obj = scene.add.image(x, y, emoteKey, 0).setScale(0.2).setDepth(y + 40);
  } else {
    const fallback = emoteKey.includes('alert') ? '!' : emoteKey.includes('question') ? '?' : '♥';
    obj = scene.add
      .text(x, y, fallback, {
        fontFamily: 'SproutLandsDisplay, monospace',
        fontSize: '9px',
        color: '#ffe066',
        stroke: '#0b1018',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setScale(0.2)
      .setDepth(y + 40);
  }

  scene.tweens.add({
    targets: obj,
    scale,
    y: y - 5,
    duration: 160,
    ease: 'Back.Out',
    onComplete: () => {
      if (!obj.active) return;
      scene.tweens.add({
        targets: obj,
        y: y - 10,
        alpha: 0,
        delay: Math.max(120, durationMs - 340),
        duration: 240,
        ease: 'Quad.In',
        onComplete: () => obj.destroy(),
      });
    },
  });

  if (opts?.hearts) {
    for (let i = 0; i < 3; i++) {
      const hx = x + Phaser.Math.Between(-6, 6);
      const hy = y + 2;
      const heart = scene.add
        .circle(hx, hy, 1.8, 0xff6b8b, 0.95)
        .setDepth(y + 42);
      scene.tweens.add({
        targets: heart,
        y: hy - 14 - i * 3,
        x: hx + Phaser.Math.Between(-4, 4),
        alpha: 0,
        scale: 0.4,
        delay: i * 80,
        duration: 520,
        ease: 'Sine.Out',
        onComplete: () => heart.destroy(),
      });
    }
  }
}
