import Phaser from 'phaser';
import { ITEMS } from '../data/items';
import { gameState } from '../core/GameState';
import { SFX } from '../core/SoundFX';

export class LootDrop extends Phaser.GameObjects.Container {
  public readonly itemId: string;
  public readonly isCoin: boolean;
  public qty: number;
  private iconObj: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  private badgeText?: Phaser.GameObjects.Text;
  private ageMs = 0;
  private vy = -38;
  private vx = 0;
  private zHeight = 2;
  private collected = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    itemId: string,
    count: number,
    isCoin = false,
  ) {
    super(scene, x, y);
    this.itemId = itemId;
    this.qty = count;
    this.isCoin = isCoin;
    this.vx = Phaser.Math.Between(-28, 28);

    const shadow = scene.add.ellipse(0, 4, 8, 4, 0x000000, 0.35);
    this.add(shadow);

    const def = ITEMS[itemId];
    const texKey = isCoin ? 'ui_icons/coin' : def?.iconKey;
    if (texKey && scene.textures.exists(texKey)) {
      this.iconObj = scene.add.image(0, -1, texKey).setScale(0.75);
    } else {
      const hex = isCoin ? 0xffd54f : Phaser.Display.Color.HexStringToColor(def?.color ?? '#ffffff').color;
      this.iconObj = scene.add.circle(0, -1, isCoin ? 3.5 : 4, hex).setStrokeStyle(1, 0x1b1f27);
    }
    this.add(this.iconObj);

    if (count > 1) {
      this.ensureBadge(count);
    }

    this.setDepth(y);
    scene.add.existing(this);
  }

  private ensureBadge(count: number): void {
    if (this.badgeText) {
      this.badgeText.setText(`${count}`);
      return;
    }
    this.badgeText = this.scene.add
      .text(3, -7, `${count}`, {
        fontSize: '7px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
        resolution: 4,
      })
      .setOrigin(0, 0.5);
    this.add(this.badgeText);
  }

  public addCount(amount: number): void {
    if (this.collected || amount <= 0) return;
    this.qty += amount;
    if (this.qty > 1) {
      this.ensureBadge(this.qty);
    }
    this.scene.tweens.add({
      targets: this,
      scale: { from: 1.28, to: 1 },
      duration: 140,
      ease: 'Back.Out',
    });
  }

  public updateDrop(dtMs: number, playerX: number, playerY: number): boolean {
    if (this.collected) return true;
    this.ageMs += dtMs;
    const dt = dtMs / 1000;

    // Short pop-out bounce on spawn
    if (this.ageMs < 380) {
      this.x += this.vx * dt;
      this.zHeight += -this.vy * dt * 0.5;
      this.vy += 180 * dt;
      if (this.zHeight < 0) this.zHeight = 0;
      this.iconObj.y = -1 - this.zHeight * 0.4;
      return false;
    }

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);
    const magnetRange = gameState.getPickupRadius();

    if (dist < magnetRange && dist > 1) {
      const pull = 165 * dt;
      this.x += (dx / dist) * pull;
      this.y += (dy / dist) * pull;
      this.setDepth(this.y);
    }

    if (dist < 13) {
      this.collected = true;
      if (this.isCoin) {
        gameState.coins += this.qty;
        SFX.playCoin();
        gameState.emit();
      } else {
        gameState.addItem(this.itemId, this.qty);
        SFX.playPickup();
      }
      this.destroy();
      return true;
    }

    // Gentle hover bob
    this.iconObj.y = -2 + Math.sin(this.ageMs * 0.006) * 1.4;
    return false;
  }
}
