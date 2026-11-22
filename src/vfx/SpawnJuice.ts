import Phaser from 'phaser';

export type SpawnJuiceTarget = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Transform;

export const SPAWN_GROW_DURATION_MS = 1000;

/**
 * Plays a 1-second scale-up from 0 -> full scale followed by a damped jello jiggle.
 */
export function playSpawnGrowAndJello(
  scene: Phaser.Scene | undefined,
  target: SpawnJuiceTarget | null | undefined,
  baseScaleX = 1,
  baseScaleY = baseScaleX,
  onDone?: () => void
): void {
  if (!scene || !target || !scene.tweens) {
    onDone?.();
    return;
  }

  scene.tweens.killTweensOf(target);
  target.setScale(0, 0);

  scene.tweens.add({
    targets: target,
    scaleX: baseScaleX,
    scaleY: baseScaleY,
    duration: SPAWN_GROW_DURATION_MS,
    ease: 'Sine.easeOut',
    onComplete: () => {
      if (!target.scene || !target.active) {
        onDone?.();
        return;
      }
      scene.tweens.add({
        targets: target,
        scaleX: baseScaleX * 1.18,
        scaleY: baseScaleY * 0.84,
        duration: 110,
        ease: 'Sine.easeOut',
        onComplete: () => {
          if (!target.scene || !target.active) {
            onDone?.();
            return;
          }
          scene.tweens.add({
            targets: target,
            scaleX: baseScaleX * 0.9,
            scaleY: baseScaleY * 1.12,
            duration: 120,
            ease: 'Sine.easeInOut',
            onComplete: () => {
              if (!target.scene || !target.active) {
                onDone?.();
                return;
              }
              scene.tweens.add({
                targets: target,
                scaleX: baseScaleX,
                scaleY: baseScaleY,
                duration: 130,
                ease: 'Back.easeOut',
                onComplete: () => {
                  onDone?.();
                },
              });
            },
          });
        },
      });
    },
  });
}
