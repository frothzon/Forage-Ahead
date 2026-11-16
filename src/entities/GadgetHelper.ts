import Phaser from 'phaser';
import { gameState } from '../core/GameState';
import { SFX } from '../core/SoundFX';
import { ITEMS } from '../data/items';
import { spawnBurstParticles, spawnFloatingText } from './CombatHelpers';
import type { Enemy } from './Enemy';
import type { Player } from './Player';

export interface GadgetContext {
  scene: Phaser.Scene;
  player: Player;
  enemies: Enemy[];
  isWalkable: (wx: number, wy: number) => boolean;
  onDamageEnemy: (enemy: Enemy, dmg: number, dirX: number, dirY: number) => void;
  showToast: (msg: string) => void;
}

export function tryActivateGadget(ctx: GadgetContext, itemId: string, wx: number, wy: number): boolean {
  const def = ITEMS[itemId];
  if (!def || def.category !== 'gadget' || !def.gadgetEffect) return false;

  const rem = gameState.getGadgetRemainingMs(itemId);
  if (rem > 0) {
    ctx.showToast(`${def.name} cooling down (${(rem / 1000).toFixed(1)}s)`);
    return true;
  }

  const cost = def.energyCost ?? 12;
  if (gameState.energy < cost) {
    ctx.showToast('Not enough Energy!');
    return true;
  }

  if (!gameState.triggerGadgetCooldown(itemId)) return true;
  gameState.energy = Math.max(0, gameState.energy - cost);
  gameState.emit();

  const { scene, player } = ctx;
  const ang = Math.atan2(wy - player.y, wx - player.x);

  if (def.gadgetEffect === 'blink') {
    spawnBurstParticles(scene, player.x, player.y, 0x4fa8ff, 8);
    const maxDist = 88;
    let bestX = player.x;
    let bestY = player.y;
    for (let step = 8; step <= maxDist; step += 8) {
      const tx = player.x + Math.cos(ang) * step;
      const ty = player.y + Math.sin(ang) * step;
      if (ctx.isWalkable(tx, ty)) {
        bestX = tx;
        bestY = ty;
      } else {
        break;
      }
    }
    player.setPosition(bestX, bestY);
    player.invulnerableMs = Math.max(player.invulnerableMs, 550);
    spawnBurstParticles(scene, bestX, bestY, 0x9de0ff, 10);
    SFX.playPickup();
    return true;
  }

  if (def.gadgetEffect === 'ward') {
    player.invulnerableMs = Math.max(player.invulnerableMs, 3000);
    const ring = scene.add.circle(player.x, player.y, 14, 0xffd95a, 0.25).setStrokeStyle(2, 0xffe88a, 0.9);
    scene.tweens.add({
      targets: ring,
      radius: 64,
      alpha: 0,
      duration: 360,
      onComplete: () => ring.destroy(),
    });
    for (const e of ctx.enemies) {
      if (!e.active || e.isDead) continue;
      const dist = Math.hypot(e.x - player.x, e.y - player.y);
      if (dist <= 76) {
        const dx = (e.x - player.x) / (dist || 1);
        const dy = (e.y - player.y) / (dist || 1);
        ctx.onDamageEnemy(e, 14, dx, dy);
      }
    }
    spawnFloatingText(scene, player.x, player.y - 16, 'AEGIS SHIELD!', '#ffd95a');
    SFX.playCraft();
    return true;
  }

  if (def.gadgetEffect === 'frost_nova') {
    const ring = scene.add.circle(player.x, player.y, 16, 0x6cf0ff, 0.28).setStrokeStyle(2, 0xbef8ff, 0.95);
    scene.tweens.add({
      targets: ring,
      radius: 82,
      alpha: 0,
      duration: 420,
      onComplete: () => ring.destroy(),
    });
    spawnBurstParticles(scene, player.x, player.y, 0x6cf0ff, 14);
    for (const e of ctx.enemies) {
      if (!e.active || e.isDead) continue;
      const dist = Math.hypot(e.x - player.x, e.y - player.y);
      if (dist <= 86) {
        const dx = (e.x - player.x) / (dist || 1);
        const dy = (e.y - player.y) / (dist || 1);
        ctx.onDamageEnemy(e, 42, dx, dy);
      }
    }
    SFX.playLevelUp();
    return true;
  }

  return true;
}
