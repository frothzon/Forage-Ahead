import Phaser from 'phaser';
import { Haptics } from '../core/Haptics';
import { fmtKeyPrompt } from '../core/Platform';
import { SFX } from '../core/SoundFX';
import { spawnArcParticles, spawnShockwaveRing, spawnSparklers } from './CombatHelpers';

export interface DungeonChestOptions {
  x: number;
  y: number;
  title: string;
  locked?: boolean;
}

export class DungeonChest {
  public readonly x: number;
  public readonly y: number;
  public readonly collisionRadius = 10;
  public opened = false;
  public locked: boolean;

  public sprite: Phaser.GameObjects.Sprite;
  public aura: Phaser.GameObjects.Ellipse;
  public label: Phaser.GameObjects.Text;
  private scene: Phaser.Scene;
  private title: string;
  private sparkleTimerMs = 0;
  private bobTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, opts: DungeonChestOptions) {
    this.scene = scene;
    this.x = opts.x;
    this.y = opts.y;
    this.title = opts.title;
    this.locked = Boolean(opts.locked);

    this.aura = scene.add
      .ellipse(this.x, this.y + 3, 22, 10, this.locked ? 0x8a99ad : 0xffd95a, this.locked ? 0.16 : 0.3)
      .setDepth(this.y - 2);
    scene.tweens.add({
      targets: this.aura,
      scaleX: 1.18,
      scaleY: 1.18,
      alpha: this.locked ? 0.1 : 0.42,
      duration: 950,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    this.sprite = scene.add.sprite(this.x, this.y, 'objects/Chest_big', 0).setDepth(this.y);
    if (this.locked) this.sprite.setTint(0x98a6b8);

    this.label = scene.add
      .text(
        this.x,
        this.y - 15,
        this.locked ? `${this.title} (Sealed)` : fmtKeyPrompt('E', this.title),
        {
          fontSize: '7px',
          fontStyle: 'bold',
          color: this.locked ? '#cfd8e3' : '#ffe066',
          stroke: '#000',
          strokeThickness: 2,
          resolution: 4,
        },
      )
      .setOrigin(0.5)
      .setDepth(7000);

    this.bobTween = scene.tweens.add({
      targets: this.label,
      y: this.y - 18,
      duration: 780,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  public unlock(nextTitle?: string): void {
    this.locked = false;
    if (nextTitle) this.title = nextTitle;
    this.sprite.clearTint();
    this.aura.setFillStyle(0xffd95a, 0.34);
    this.label.setText(fmtKeyPrompt('E', this.title)).setColor('#7ef29d');
    spawnShockwaveRing(this.scene, this.x, this.y, 0xffd95a, 24, 300);
  }

  public update(dtMs: number): void {
    if (this.opened || this.locked) return;
    this.sparkleTimerMs -= dtMs;
    if (this.sparkleTimerMs <= 0) {
      this.sparkleTimerMs = 520 + Math.random() * 380;
      const sx = this.x + (Math.random() - 0.5) * 14;
      const sy = this.y + (Math.random() - 0.5) * 6;
      const mote = this.scene.add.rectangle(sx, sy, 2, 2, 0xfff3a8, 0.95).setDepth(this.y + 5);
      this.scene.tweens.add({
        targets: mote,
        y: sy - 11,
        alpha: 0,
        duration: 540,
        ease: 'Quad.Out',
        onComplete: () => mote.destroy(),
      });
    }
  }

  public playOpenJuice(rewardIconKey?: string): void {
    if (this.opened) return;
    this.opened = true;
    this.bobTween?.stop();
    this.label.setVisible(false);
    this.aura.destroy();

    SFX.playChestOpen();
    Haptics.notifySuccess();

    // Squash -> spring lid-pop -> settle
    this.sprite.setScale(1.24, 0.76);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: 0.9,
      scaleY: 1.24,
      duration: 75,
      ease: 'Quad.Out',
      onComplete: () => {
        if (!this.sprite.active) return;
        this.sprite.play('prop_chest_big_open');
        this.scene.tweens.add({
          targets: this.sprite,
          scaleX: 1,
          scaleY: 1,
          duration: 180,
          ease: 'Back.easeOut',
        });
      },
    });

    spawnShockwaveRing(this.scene, this.x, this.y, 0xffe066, 36, 360);
    spawnSparklers(this.scene, this.x, this.y - 4, 20);
    spawnArcParticles(this.scene, this.x, this.y - 2, 0xffd95a, 10);

    if (rewardIconKey && this.scene.textures.exists(rewardIconKey)) {
      const halo = this.scene.add.circle(this.x, this.y - 8, 9, 0xffe066, 0.45).setDepth(7500);
      const icon = this.scene.add.image(this.x, this.y - 8, rewardIconKey).setDepth(7501);
      this.scene.tweens.add({
        targets: [halo, icon],
        y: this.y - 28,
        alpha: 0,
        duration: 850,
        ease: 'Cubic.Out',
        onComplete: () => {
          halo.destroy();
          icon.destroy();
        },
      });
    }
  }
}
