import Phaser from 'phaser';
import { gameState } from '../core/GameState';
import { SFX } from '../core/SoundFX';
import { ISLAND_CELL_TILES, TILE_PX, type BiomeKind } from '../data/islands';
import type { StructureType } from '../data/recipes';
import {
  spawnBurstParticles,
  spawnFloatingText,
  spawnShockwaveRing,
  triggerHitStop,
  type ActiveProjectile,
} from '../entities/CombatHelpers';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { BuildingEntity } from '../world/BuildingEntity';
import type { LightingSystem } from '../world/LightingSystem';
import type { NodeKind, ResourceNode } from '../world/ResourceNode';
import type { WeatherSystem } from '../world/WeatherSystem';
import type { HudController } from '../ui/HudController';

export type PromoShotId =
  | '01_mega_harvest_blast'
  | '02_island_rise_cascade'
  | '03_hyper_factory_dusk'
  | '04_relic_storm_night'
  | '05_biome_blitz_montage'
  | '06_gear_skills_powerup'
  | '07_void_dragon_climax'
  | '08_outro_cta';

export interface PromoConfig {
  shotId: PromoShotId | null;
  hideHud: boolean;
}

const VALID_SHOTS = new Set<PromoShotId>([
  '01_mega_harvest_blast',
  '02_island_rise_cascade',
  '03_hyper_factory_dusk',
  '04_relic_storm_night',
  '05_biome_blitz_montage',
  '06_gear_skills_powerup',
  '07_void_dragon_climax',
  '08_outro_cta',
]);

export function markPromoReady(): void {
  if (typeof window !== 'undefined') {
    (window as unknown as { __PROMO_READY?: boolean }).__PROMO_READY = true;
  }
}

export function getPromoConfig(): PromoConfig {
  if (typeof window === 'undefined') return { shotId: null, hideHud: false };
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('promo') as PromoShotId | null;
  const shotId = raw && VALID_SHOTS.has(raw) ? raw : null;
  const hideHud = params.get('hideHud') === '1';
  return { shotId, hideHud };
}

export function getPromoBootTarget(): { scene: 'TitleScene' | 'OverworldScene' | 'DungeonScene'; data?: Record<string, unknown> } | null {
  const { shotId } = getPromoConfig();
  if (!shotId) return null;

  gameState.eraseAllSavedData();
  gameState.reset('Gladiator');
  gameState.coins = 50000;
  gameState.level = 18;
  gameState.skillPoints = 12;
  gameState.addItem('bomb', 40);
  gameState.addItem('pickaxe', 1);
  gameState.addItem('axe', 1);
  gameState.addItem('sword', 1);
  gameState.addItem('bow', 1);
  gameState.addItem('fire_rod', 1);
  gameState.addItem('thunder_rod', 1);
  gameState.addItem('ice_rod', 1);
  gameState.addItem('necro_rod', 1);
  gameState.addItem('steel_sword', 1);
  gameState.addItem('dragon_blade', 1);
  gameState.addItem('iron_armor', 1);
  gameState.addItem('crystal_ring', 1);
  gameState.addItem('boots_swift', 1);
  gameState.addItem('coal', 80);
  gameState.addItem('iron_ore', 80);
  gameState.addItem('gold_ore', 80);
  gameState.addItem('crystal', 80);
  gameState.addItem('wood', 120);
  gameState.hotbar = ['pickaxe', 'bomb', 'fire_rod', 'thunder_rod', 'ice_rod', 'bow', 'potion_red', ''];
  gameState.selectedHotbarIndex = 0;

  if (shotId === '08_outro_cta') {
    return { scene: 'TitleScene', data: { skipSplash: true, promoOutro: true } };
  }
  if (shotId === '07_void_dragon_climax') {
    gameState.debugUnlockAllRelics();
    gameState.debugUnlockAllSkills();
    gameState.hp = gameState.getMaxHp();
    gameState.energy = gameState.getMaxEnergy();
    return { scene: 'DungeonScene', data: { dungeonId: 'void_spire', floor: 20 } };
  }
  if (shotId === '06_gear_skills_powerup') {
    gameState.debugUnlockAllRelics();
  }
  return { scene: 'OverworldScene' };
}

export interface PromoOverworldBridge {
  scene: Phaser.Scene;
  player: Player;
  hud: HudController;
  lighting: LightingSystem;
  weather: WeatherSystem;
  nodes: ResourceNode[];
  enemies: Enemy[];
  buildings: BuildingEntity[];
  spawnNode: (tx: number, ty: number, kind: NodeKind, biome: BiomeKind) => ResourceNode;
  spawnEnemy: (monsterId: string, wx: number, wy: number) => Enemy;
  spawnBuilding: (type: StructureType, tx: number, ty: number) => BuildingEntity;
  detonateBombAt: (wx: number, wy: number) => void;
  fireWeaponAt: (itemId: string, wx: number, wy: number) => void;
  teleportIsland: (gx: number, gy: number) => void;
  buyIsland: (gx: number, gy: number) => void;
  setZoom: (zoom: number) => void;
  panCameraTo: (wx: number, wy: number) => void;
}

export interface PromoDungeonBridge {
  scene: Phaser.Scene;
  player: Player;
  boss: Enemy | null;
  enemies: Enemy[];
  hud: HudController;
  projectiles: ActiveProjectile[];
  damageEnemy: (enemy: Enemy, dmg: number, dirX: number, dirY: number) => void;
  fireWeaponAt: (itemId: string, wx: number, wy: number) => void;
  setZoom: (zoom: number) => void;
}

interface TimelineEvent {
  atMs: number;
  fired?: boolean;
  run: () => void;
}

export class PromoTimeline {
  private elapsedMs = 0;
  private events: TimelineEvent[] = [];
  private onTick?: (elapsedMs: number, deltaMs: number) => void;

  constructor(onTick?: (elapsedMs: number, deltaMs: number) => void) {
    this.onTick = onTick;
  }

  at(atMs: number, run: () => void): this {
    this.events.push({ atMs, run });
    return this;
  }

  update(deltaMs: number): void {
    this.elapsedMs += deltaMs;
    for (const ev of this.events) {
      if (!ev.fired && this.elapsedMs >= ev.atMs) {
        ev.fired = true;
        ev.run();
      }
    }
    this.onTick?.(this.elapsedMs, deltaMs);
  }
}

function getIslandCenterTile(gx: number, gy: number): { tx: number; ty: number; wx: number; wy: number } {
  const tx = gx * ISLAND_CELL_TILES + Math.floor(ISLAND_CELL_TILES / 2);
  const ty = gy * ISLAND_CELL_TILES + Math.floor(ISLAND_CELL_TILES / 2);
  return { tx, ty, wx: tx * TILE_PX + 8, wy: ty * TILE_PX + 8 };
}

export function createOverworldPromoTimeline(shotId: PromoShotId, api: PromoOverworldBridge): PromoTimeline {
  const { scene, player, hud, lighting, weather } = api;
  const { hideHud } = getPromoConfig();
  if (hideHud) {
    hud.setPromoChromeHidden(true);
  }

  const origin = getIslandCenterTile(2, 2);

  if (shotId === '01_mega_harvest_blast') {
    lighting.timeOfDay = 0.22; // Crisp golden morning
    weather.setDebugWeather('sunny');
    player.setPosition(origin.wx - 40, origin.wy);
    api.setZoom(3.1);

    // Pack a high-value cluster of crystals, gold veins, and trees right in front of the hero
    const kinds: NodeKind[] = ['crystal_vein', 'gold_vein', 'iron_vein', 'tree', 'rock'];
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -2; dx <= 4; dx++) {
        if (dx === -2 && dy === 0) continue;
        const kind = kinds[Math.abs(dx * 3 + dy * 5) % kinds.length];
        api.spawnNode(origin.tx + dx, origin.ty + dy, kind, 'grass');
      }
    }

    const tl = new PromoTimeline((elapsed) => {
      if (elapsed < 950) {
        player.x += 0.9;
      }
    });
    tl.at(250, () => {
      api.fireWeaponAt('pickaxe', player.x + 24, player.y);
      spawnBurstParticles(scene, player.x + 22, player.y, 0xffe066, 10);
    });
    tl.at(650, () => {
      gameState.selectedHotbarIndex = 1; // Bomb
      hud.render();
      spawnFloatingText(scene, player.x, player.y - 20, 'TRIPLE BOMB!', '#ffbe6b', '9px', 'crit');
      const b1 = scene.add.image(origin.wx - 8, origin.wy - 14, 'projectiles/Bomb').setScale(1.25).setDepth(5000);
      const b2 = scene.add.image(origin.wx + 16, origin.wy + 12, 'projectiles/Bomb').setScale(1.25).setDepth(5000);
      const b3 = scene.add.image(origin.wx + 32, origin.wy - 8, 'projectiles/Bomb').setScale(1.25).setDepth(5000);
      scene.tweens.add({ targets: [b1, b2, b3], scale: { from: 1.1, to: 1.55 }, duration: 150, yoyo: true, repeat: -1 });
      scene.time.delayedCall(650, () => {
        b1.destroy();
        api.detonateBombAt(origin.wx - 8, origin.wy - 14);
        api.setZoom(3.45);
      });
      scene.time.delayedCall(820, () => {
        b2.destroy();
        api.detonateBombAt(origin.wx + 16, origin.wy + 12);
      });
      scene.time.delayedCall(980, () => {
        b3.destroy();
        api.detonateBombAt(origin.wx + 32, origin.wy - 8);
        spawnShockwaveRing(scene, origin.wx + 14, origin.wy, 0xffe066, 110, 420);
        triggerHitStop(scene, 45, 0.25);
      });
    });
    return tl;
  }

  if (shotId === '02_island_rise_cascade') {
    lighting.timeOfDay = 0.34;
    weather.setDebugWeather('sunny');
    api.setZoom(2.15);

    const tl = new PromoTimeline();
    tl.at(120, () => {
      hud.toggleModal('map');
    });
    tl.at(950, () => {
      hud.closeModal();
      api.buyIsland(3, 2);
      const c1 = getIslandCenterTile(3, 2);
      api.panCameraTo(c1.wx, c1.wy);
      spawnShockwaveRing(scene, c1.wx, c1.wy, 0x7ef29d, 140, 620);
    });
    tl.at(2150, () => {
      api.buyIsland(2, 1);
      const c2 = getIslandCenterTile(2, 1);
      api.panCameraTo(c2.wx, c2.wy);
      spawnShockwaveRing(scene, c2.wx, c2.wy, 0xffe066, 140, 620);
    });
    return tl;
  }

  if (shotId === '03_hyper_factory_dusk') {
    lighting.timeOfDay = 0.69; // Golden dusk with dynamic torchlight!
    weather.setDebugWeather('sunny');
    player.setPosition(origin.wx, origin.wy);
    api.setZoom(2.9);

    const layout: Array<{ type: StructureType; dx: number; dy: number }> = [
      { type: 'bonfire', dx: -4, dy: -2 },
      { type: 'bonfire', dx: 4, dy: -2 },
      { type: 'bonfire', dx: -4, dy: 2 },
      { type: 'bonfire', dx: 4, dy: 2 },
      { type: 'furnace', dx: -3, dy: -1 },
      { type: 'furnace', dx: -1, dy: -1 },
      { type: 'anvil', dx: 1, dy: -1 },
      { type: 'anvil', dx: 3, dy: -1 },
      { type: 'alchemy_lab', dx: -3, dy: 1 },
      { type: 'frost_kiln', dx: -1, dy: 1 },
      { type: 'infernal_forge', dx: 2, dy: 1 },
      { type: 'void_altar', dx: 4, dy: 1 },
    ];
    for (const item of layout) {
      const b = api.spawnBuilding(item.type, origin.tx + item.dx, origin.ty + item.dy);
      b.enqueueCraft('iron_ingot');
    }

    const tl = new PromoTimeline((elapsed) => {
      // Smooth cinematic glide across the glowing base
      api.panCameraTo(origin.wx + Math.sin(elapsed * 0.0014) * 58, origin.wy + Math.cos(elapsed * 0.0011) * 18);
    });
    for (let i = 0; i < 6; i++) {
      tl.at(450 + i * 420, () => {
        const b = api.buildings[i % api.buildings.length];
        if (!b) return;
        SFX.playCraft();
        spawnBurstParticles(scene, b.x, b.y - 6, 0xffe066, 10);
        spawnFloatingText(scene, b.x, b.y - 16, '+1 GOLD INGOT', '#ffe596', '8px', 'xp');
      });
    }
    return tl;
  }

  if (shotId === '04_relic_storm_night') {
    lighting.timeOfDay = 0.88; // Night + dynamic spell glow
    weather.setDebugWeather('rain');
    player.setPosition(origin.wx, origin.wy);
    api.setZoom(3.15);

    const monsters = ['Skeleton', 'Slime', 'Vampire', 'Zombie', 'Goblin'];
    for (let i = 0; i < 20; i++) {
      const ang = (Math.PI * 2 * i) / 20;
      const dist = 64 + (i % 3) * 28;
      api.spawnEnemy(monsters[i % monsters.length], origin.wx + Math.cos(ang) * dist, origin.wy + Math.sin(ang) * dist);
    }

    const weapons = ['thunder_rod', 'fire_rod', 'ice_rod', 'bow'];
    let step = 0;
    const tl = new PromoTimeline((elapsed) => {
      if (elapsed % 160 < 20) {
        const w = weapons[step % weapons.length];
        const ang = step * 0.85;
        step++;
        api.fireWeaponAt(w, player.x + Math.cos(ang) * 90, player.y + Math.sin(ang) * 90);
        gameState.energy = gameState.getMaxEnergy();
      }
    });
    tl.at(1200, () => {
      spawnShockwaveRing(scene, player.x, player.y, 0x7ef5ff, 95, 360);
      api.setZoom(3.4);
    });
    return tl;
  }

  if (shotId === '05_biome_blitz_montage') {
    api.setZoom(3.0);
    const tl = new PromoTimeline();

    // 1. Desert Sandstorm
    tl.at(0, () => {
      api.teleportIsland(3, 3);
      lighting.timeOfDay = 0.42;
      weather.setDebugWeather('sandstorm');
      const c = getIslandCenterTile(3, 3);
      for (let i = 0; i < 6; i++) api.spawnEnemy('Mummy', c.wx + (i - 3) * 22, c.wy + 20);
      api.fireWeaponAt('fire_rod', c.wx + 50, c.wy + 10);
    });
    // 2. Frost Cavern Snowfall
    tl.at(1000, () => {
      api.teleportIsland(2, 0);
      lighting.timeOfDay = 0.3;
      weather.setDebugWeather('snow');
      const c = getIslandCenterTile(2, 0);
      for (let i = 0; i < 6; i++) api.spawnEnemy('Ice Golem', c.wx + (i - 3) * 24, c.wy - 22);
      api.fireWeaponAt('ice_rod', c.wx - 40, c.wy - 15);
    });
    // 3. Sunken Tomb Rain
    tl.at(2000, () => {
      api.teleportIsland(4, 2);
      lighting.timeOfDay = 0.72;
      weather.setDebugWeather('rain');
      const c = getIslandCenterTile(4, 2);
      for (let i = 0; i < 6; i++) api.spawnEnemy('Anubis Warrior', c.wx + (i - 3) * 20, c.wy + 18);
      api.fireWeaponAt('thunder_rod', c.wx + 40, c.wy + 18);
    });
    // 4. Infernal Volcano
    tl.at(3000, () => {
      api.teleportIsland(4, 0);
      lighting.timeOfDay = 0.85;
      weather.setDebugWeather('sunny');
      const c = getIslandCenterTile(4, 0);
      for (let i = 0; i < 6; i++) api.spawnEnemy('Demon', c.wx + (i - 3) * 20, c.wy);
      api.detonateBombAt(c.wx + 18, c.wy);
      spawnShockwaveRing(scene, c.wx, c.wy, 0xff7b47, 90, 380);
    });
    return tl;
  }

  if (shotId === '06_gear_skills_powerup') {
    lighting.timeOfDay = 0.35;
    weather.setDebugWeather('sunny');
    api.setZoom(3.2);
    const tl = new PromoTimeline();
    tl.at(100, () => hud.toggleModal('inventory'));
    tl.at(900, () => hud.toggleModal('skills'));
    tl.at(1350, () => {
      gameState.unlockSkill('combat_fury');
      SFX.playSkillUnlock();
      hud.render();
    });
    tl.at(1750, () => {
      gameState.unlockSkill('magic_archmage');
      SFX.playSkillUnlock();
      hud.render();
    });
    tl.at(2150, () => {
      hud.closeModal();
      SFX.playLevelUp();
      spawnShockwaveRing(scene, player.x, player.y, 0xffe066, 110, 480);
      spawnBurstParticles(scene, player.x, player.y - 8, 0xffe066, 22);
      spawnFloatingText(scene, player.x, player.y - 24, 'LEVEL UP!', '#ffe066', '11px', 'crit');
    });
    return tl;
  }

  return new PromoTimeline();
}

export function createDungeonPromoTimeline(api: PromoDungeonBridge): PromoTimeline {
  const { scene, player, boss, hud } = api;
  const { hideHud } = getPromoConfig();
  if (hideHud) {
    hud.setPromoChromeHidden(true);
  }
  api.setZoom(3.25);

  const tl = new PromoTimeline((elapsed) => {
    if (elapsed > 300 && elapsed < 1900 && boss && !boss.isDead) {
      // Circle-strafe hero toward boss
      player.x += 0.75;
      player.y += Math.sin(elapsed * 0.008) * 0.9;
    }
  });

  // Fire initial Thunder/Fire barrage into boss
  tl.at(350, () => {
    if (boss) api.fireWeaponAt('thunder_rod', boss.x, boss.y);
  });
  tl.at(700, () => {
    if (boss) api.fireWeaponAt('fire_rod', boss.x, boss.y);
  });

  // Boss unleashes dramatic 360-degree bullet-hell fireball spiral
  tl.at(1150, () => {
    if (!boss || boss.isDead) return;
    SFX.playBossEnrage();
    spawnShockwaveRing(scene, boss.x, boss.y - 6, 0xff5e6c, 75, 420);
    scene.cameras.main.shake(220, 0.01);
    for (let i = 0; i < 16; i++) {
      const ang = (Math.PI * 2 * i) / 16;
      const spr = scene.add.image(boss.x, boss.y - 4, 'monster_projectiles/FireballBig').setRotation(ang).setDepth(5000);
      api.projectiles.push({
        sprite: spr,
        vx: Math.cos(ang) * 95,
        vy: Math.sin(ang) * 95,
        damage: 12,
        fromPlayer: false,
        lifeMs: 2500,
        kind: 'enemy',
      });
    }
    api.setZoom(3.75);
  });

  // Bullet-time 0.35x slow-mo dodge + fatal Dragon Blade finisher!
  tl.at(1650, () => {
    scene.time.timeScale = 0.35;
    scene.tweens.timeScale = 0.35;
    spawnFloatingText(scene, player.x, player.y - 22, 'FINISHER!', '#ffe066', '10px', 'crit');
  });

  tl.at(2400, () => {
    scene.time.timeScale = 1.0;
    scene.tweens.timeScale = 1.0;
    if (boss && !boss.isDead) {
      api.damageEnemy(boss, boss.hp + 999, 1, 0);
      spawnShockwaveRing(scene, boss.x, boss.y, 0xffe066, 140, 560);
      scene.cameras.main.flash(240, 255, 240, 180);
      scene.cameras.main.shake(340, 0.014);
    }
  });

  return tl;
}
