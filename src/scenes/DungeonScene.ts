import Phaser from 'phaser';
import { gameState } from '../core/GameState';
import { SFX } from '../core/SoundFX';
import { ITEMS } from '../data/items';
import type { DungeonId } from '../data/islands';
import { TILE_PX } from '../data/islands';
import {
  drawSlashArc,
  spawnBurstParticles,
  spawnFloatingText,
  type ActiveProjectile,
} from '../entities/CombatHelpers';
import { Enemy } from '../entities/Enemy';
import { LootDrop } from '../entities/LootDrop';
import { Player } from '../entities/Player';
import { HudController } from '../ui/HudController';

interface DungeonConfig {
  id: DungeonId;
  title: string;
  floorTint: number;
  wallTint: number;
  minions: string[];
  bossId: string;
  relicId: string;
  chestLoot: Array<{ itemId: string; count: number }>;
}

const DUNGEON_CONFIGS: Record<DungeonId, DungeonConfig> = {
  skull_crypt: {
    id: 'skull_crypt',
    title: 'Skull Crypt',
    floorTint: 0x5c5570,
    wallTint: 0x2d293b,
    minions: ['Skeleton', 'Vampire'],
    bossId: 'Lich',
    relicId: 'necro_rod',
    chestLoot: [
      { itemId: 'bone', count: 5 },
      { itemId: 'potion_red', count: 2 },
    ],
  },
  sunken_tomb: {
    id: 'sunken_tomb',
    title: 'Sunken Tomb',
    floorTint: 0x997852,
    wallTint: 0x4f3b26,
    minions: ['Mummy', 'Anubis Warrior'],
    bossId: 'Purple Worm',
    relicId: 'thunder_rod',
    chestLoot: [
      { itemId: 'amber', count: 5 },
      { itemId: 'gold_ingot', count: 2 },
    ],
  },
  frost_cavern: {
    id: 'frost_cavern',
    title: 'Frost Cavern',
    floorTint: 0x6ba2bf,
    wallTint: 0x2e4e63,
    minions: ['Frost Salamander', 'Ice Golem'],
    bossId: 'Frost Giant',
    relicId: 'ice_rod',
    chestLoot: [
      { itemId: 'crystal', count: 5 },
      { itemId: 'potion_blue', count: 2 },
    ],
  },
  infernal_sanctum: {
    id: 'infernal_sanctum',
    title: 'Infernal Sanctum',
    floorTint: 0x7d3a3a,
    wallTint: 0x38171b,
    minions: ['Imp', 'Demon'],
    bossId: 'Adult Red Dragon',
    relicId: 'fire_rod',
    chestLoot: [
      { itemId: 'obsidian', count: 5 },
      { itemId: 'demon_horn', count: 4 },
    ],
  },
};

const ROOM_W = 32;
const ROOM_H = 16;

interface BreakableProp {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  kind: 'box' | 'pot';
  broken: boolean;
}

export class DungeonScene extends Phaser.Scene {
  private cfg!: DungeonConfig;
  private player!: Player;
  private hud!: HudController;
  private enemies: Enemy[] = [];
  private drops: LootDrop[] = [];
  private projectiles: ActiveProjectile[] = [];
  private breakables: BreakableProp[] = [];
  private boss: Enemy | null = null;
  private bossEnraged = false;
  private exitPortal!: { x: number; y: number };
  private treasureChest!: { x: number; y: number; spr: Phaser.GameObjects.Sprite; opened: boolean };
  private switches: Array<{ x: number; y: number; spr: Phaser.GameObjects.Image; active: boolean }> = [];
  private bossGateGroup?: Phaser.GameObjects.Group;
  private gateOpen = false;
  private relicSpawned = false;

  private keys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    UP: Phaser.Input.Keyboard.Key;
    DOWN: Phaser.Input.Keyboard.Key;
    LEFT: Phaser.Input.Keyboard.Key;
    RIGHT: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
    E: Phaser.Input.Keyboard.Key;
    I: Phaser.Input.Keyboard.Key;
    K: Phaser.Input.Keyboard.Key;
    P: Phaser.Input.Keyboard.Key;
    ESC: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super('DungeonScene');
  }

  init(data: { dungeonId?: DungeonId }): void {
    this.cfg = DUNGEON_CONFIGS[data?.dungeonId ?? 'skull_crypt'];
  }

  create(): void {
    this.enemies = [];
    this.drops = [];
    this.projectiles = [];
    this.breakables = [];
    this.switches = [];
    this.boss = null;
    this.bossEnraged = false;
    this.gateOpen = false;
    this.relicSpawned = false;

    this.buildRoom();
    this.player = new Player(this, 3 * TILE_PX + 8, (ROOM_H / 2) * TILE_PX);

    this.cameras.main.setBounds(0, 0, ROOM_W * TILE_PX, ROOM_H * TILE_PX);
    this.cameras.main.setZoom(3);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.roundPixels = true;

    this.hud = new HudController({
      onBuyIsland: () => {},
      onSelectBuild: () => {},
      onUseHotbarItem: (id) => this.tryConsumeItem(id),
      onSave: () => {
        gameState.save();
        this.hud.showToast('Saved!');
      },
      getWorldDebugStats: () => ({
        scene: `Dungeon: ${this.cfg.title}`,
        playerTx: Math.floor(this.player.x / TILE_PX),
        playerTy: Math.floor(this.player.y / TILE_PX),
        nodesCount: this.breakables.filter((b) => !b.broken).length,
        enemiesCount: this.enemies.filter((e) => e.active && !e.isDead).length,
        buildingsCount: 0,
        activeCraftJobs: 0,
        hasSavedData: gameState.hasSavedGame(),
      }),
      onDebugAction: (act) => {
        if (act === 'reset_run') {
          gameState.reset(gameState.heroClass);
          this.hud.setBossBar(null);
          this.hud.destroy();
          this.scene.start('OverworldScene');
        } else if (act === 'erase_save') {
          gameState.eraseAllSavedData();
          this.hud.setBossBar(null);
          this.hud.destroy();
          this.scene.start('TitleScene');
        }
      },
    });
    this.hud.showToast(`${this.cfg.title} — Break crates, loot the chest, and activate both sigils!`);
    if (SFX.musicEnabled) SFX.startAmbientMusic('dungeon');

    this.setupInput();
  }

  private buildRoom(): void {
    for (let y = 0; y < ROOM_H; y++) {
      for (let x = 0; x < ROOM_W; x++) {
        const isBorder = x === 0 || y === 0 || x === ROOM_W - 1 || y === ROOM_H - 1;
        const isRoom1Wall = x === 10 && (y < 6 || y > 9);
        const isBossWall = x === 20 && (y < 6 || y > 9);
        const isWall = isBorder || isRoom1Wall || isBossWall;
        const tile = this.add
          .image(x * TILE_PX + 8, y * TILE_PX + 8, 'tileset/Stone tile')
          .setTint(isWall ? this.cfg.wallTint : this.cfg.floorTint)
          .setDepth(0);
        if (isWall) {
          tile.setAlpha(0.95);
        }
      }
    }

    // Torches across 3 chambers
    for (const [tx, ty] of [
      [2, 2],
      [2, ROOM_H - 3],
      [9, 2],
      [9, ROOM_H - 3],
      [12, 2],
      [12, ROOM_H - 3],
      [19, 2],
      [19, ROOM_H - 3],
      [ROOM_W - 3, 2],
      [ROOM_W - 3, ROOM_H - 3],
    ]) {
      this.add.image(tx * TILE_PX + 8, ty * TILE_PX + 8, 'objects/Torch').setDepth(ty * TILE_PX + 8);
    }

    // Exit Portal (West Wall)
    this.exitPortal = { x: 2 * TILE_PX + 8, y: (ROOM_H / 2) * TILE_PX };
    this.add.image(this.exitPortal.x, this.exitPortal.y - 12, 'tileset/Door (open)').setDepth(5);
    this.add
      .text(this.exitPortal.x, this.exitPortal.y + 12, '[E] Exit', {
        fontSize: '7px',
        color: '#9ee6ff',
        stroke: '#000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(7000);

    // Room 1 Breakable Crates & Pots
    for (const [bx, by, kind] of [
      [4, 3, 'box'],
      [5, 3, 'pot'],
      [4, 12, 'pot'],
      [8, 4, 'box'],
      [8, 11, 'pot'],
    ] as Array<[number, number, 'box' | 'pot']>) {
      const px = bx * TILE_PX + 8;
      const py = by * TILE_PX + 8;
      const spr = this.add
        .image(px, py, kind === 'box' ? 'projectiles/Box' : 'projectiles/Pot')
        .setDepth(py);
      this.breakables.push({ sprite: spr, x: px, y: py, kind, broken: false });
    }

    // Room 2 Treasure Chest
    const cx = 15 * TILE_PX + 8;
    const cy = 8 * TILE_PX;
    const chestSpr = this.add.sprite(cx, cy, 'objects/Chest_big', 0).setDepth(cy);
    this.treasureChest = { x: cx, y: cy, spr: chestSpr, opened: false };

    // Room 2 Boss Gate Barrier (x = 20, y = 6..9)
    this.bossGateGroup = this.add.group();
    for (let gy = 6; gy <= 9; gy++) {
      const bar = this.add
        .image(20 * TILE_PX + 8, gy * TILE_PX + 8, 'tileset/Door (closed)')
        .setScale(0.5, 0.5)
        .setDepth(200);
      this.bossGateGroup.add(bar);
    }

    // 2 Floor Puzzle Sigils in Room 2
    for (const [sx, sy] of [
      [15, 4],
      [15, 11],
    ]) {
      const px = sx * TILE_PX + 8;
      const py = sy * TILE_PX + 8;
      const spr = this.add.image(px, py, 'ui_icons/sigil_off').setDepth(2);
      this.switches.push({ x: px, y: py, spr, active: false });
    }

    // Room 1 & Room 2 Minions
    this.enemies.push(new Enemy(this, this.cfg.minions[0], 7 * TILE_PX + 8, 7 * TILE_PX + 8));
    this.enemies.push(new Enemy(this, this.cfg.minions[1], 14 * TILE_PX + 8, 5 * TILE_PX + 8));
    this.enemies.push(new Enemy(this, this.cfg.minions[0], 17 * TILE_PX + 8, 10 * TILE_PX + 8));

    // Boss in Room 3 (East Arena)
    this.boss = new Enemy(this, this.cfg.bossId, 26 * TILE_PX + 8, 8 * TILE_PX);
    this.enemies.push(this.boss);
  }

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.keys = {
      W: kb.addKey('W'),
      A: kb.addKey('A'),
      S: kb.addKey('S'),
      D: kb.addKey('D'),
      UP: kb.addKey('UP'),
      DOWN: kb.addKey('DOWN'),
      LEFT: kb.addKey('LEFT'),
      RIGHT: kb.addKey('RIGHT'),
      SPACE: kb.addKey('SPACE'),
      E: kb.addKey('E'),
      I: kb.addKey('I'),
      K: kb.addKey('K'),
      P: kb.addKey('P'),
      ESC: kb.addKey('ESC'),
    };

    kb.on('keydown-I', () => this.hud.toggleModal('inventory'));
    kb.on('keydown-K', () => this.hud.toggleModal('skills'));
    kb.on('keydown-P', () => this.hud.toggleModal('progress'));
    kb.on('keydown-ESC', () => {
      if (this.hud.activeModal !== 'none') {
        this.hud.activeModal = 'none';
        this.hud.render();
      }
    });

    for (let i = 1; i <= 9; i++) {
      kb.on(`keydown-${i}`, () => {
        if (this.hud.isBlockingInput()) return;
        gameState.selectedHotbarIndex = i - 1;
        this.hud.render();
      });
    }

    this.input.on(
      'pointerdown',
      (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
        if (this.hud.isBlockingInput()) return;
        if (pointer.event && pointer.event.target !== this.game.canvas) return;
        if (currentlyOver && currentlyOver.length > 0) return;
        if (pointer.leftButtonDown()) {
          const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
          this.handleAttack(wp.x, wp.y);
        }
      },
    );
  }

  private tryConsumeItem(itemId: string): void {
    const def = ITEMS[itemId];
    if (!def || (!def.healHp && !def.healEnergy)) return;
    if ((gameState.inventory[itemId] ?? 0) <= 0) return;
    gameState.removeItem(itemId, 1);
    if (def.healHp) gameState.hp = Math.min(gameState.getMaxHp(), gameState.hp + def.healHp);
    if (def.healEnergy) gameState.energy = Math.min(gameState.getMaxEnergy(), gameState.energy + def.healEnergy);
    SFX.playPickup();
    gameState.emitVitals();
  }

  private shatterBreakable(bp: BreakableProp): void {
    if (bp.broken) return;
    bp.broken = true;
    bp.sprite.destroy();
    SFX.playChop();
    spawnBurstParticles(this, bp.x, bp.y, bp.kind === 'box' ? 0xb8763e : 0xa68976, 6);
    this.drops.push(new LootDrop(this, bp.x, bp.y, 'coin', Phaser.Math.Between(3, 8), true));
    if (Math.random() < 0.45) {
      this.drops.push(
        new LootDrop(this, bp.x, bp.y, Math.random() < 0.5 ? 'berries' : 'potion_red', 1, false),
      );
    }
  }

  private handleAttack(wx: number, wy: number): void {
    const itemId = gameState.hotbar[gameState.selectedHotbarIndex] || 'sword';
    const def = ITEMS[itemId];
    if (!def) return;
    if (def.healHp || def.healEnergy) {
      this.tryConsumeItem(itemId);
      return;
    }

    const dx = wx - this.player.x;
    const dy = wy - this.player.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    if (itemId === 'bow' || def.category === 'relic') {
      const enCost = gameState.getRangedEnergyCost(itemId);
      if (enCost > 0 && gameState.energy < enCost) {
        spawnFloatingText(this, this.player.x, this.player.y - 16, 'Low Energy!', '#ff8a93');
        return;
      }
      if (!this.player.startAction(itemId === 'bow' ? 'ranged' : 'cast', def.cooldownMs ?? 300, nx, ny, 160)) return;
      if (enCost > 0) {
        gameState.energy = Math.max(0, gameState.energy - enCost);
        gameState.emitVitals();
      }
      SFX.playCast();
      const texMap: Record<string, { tex: string; kind: ActiveProjectile['kind'] }> = {
        bow: { tex: 'projectiles/Arrow', kind: 'arrow' },
        necro_rod: { tex: 'monster_projectiles/DeathCoil', kind: 'necro' },
        thunder_rod: { tex: 'projectiles/LightningBolt', kind: 'thunder' },
        ice_rod: { tex: 'projectiles/IceShard', kind: 'ice' },
        fire_rod: { tex: 'projectiles/Fireball', kind: 'fire' },
      };
      const pInfo = texMap[itemId] ?? texMap.bow;
      const spr = this.add
        .image(this.player.x + nx * 8, this.player.y - 4 + ny * 8, pInfo.tex)
        .setRotation(Math.atan2(ny, nx))
        .setDepth(5000);
      this.projectiles.push({
        sprite: spr,
        vx: nx * 195,
        vy: ny * 195,
        damage: gameState.getWeaponDamage(itemId),
        fromPlayer: true,
        lifeMs: 1200,
        kind: pInfo.kind,
      });
      return;
    }

    if (!this.player.startAction('melee', def.cooldownMs ?? 260, nx, ny, 170)) return;
    const range = def.range ?? 40;
    drawSlashArc(this, this.player.x, this.player.y - 4, Math.atan2(ny, nx), range, 0xfff0a8);
    SFX.playSwing();

    const hitX = this.player.x + nx * (range * 0.55);
    const hitY = this.player.y + ny * (range * 0.55);
    const dmg = gameState.getWeaponDamage(itemId);

    for (const bp of this.breakables) {
      if (!bp.broken && Math.hypot(bp.x - hitX, bp.y - hitY) <= range * 0.72) {
        this.shatterBreakable(bp);
      }
    }

    for (const e of this.enemies) {
      if (e.active && !e.isDead && Math.hypot(e.x - hitX, e.y - hitY) <= range * 0.78) {
        this.damageEnemy(e, dmg, nx, ny);
      }
    }
  }

  private damageEnemy(enemy: Enemy, baseDmg: number, dirX: number, dirY: number): void {
    const crit = Math.random() < gameState.getCritChance(this.player.dodgeMomentumMs > 0 ? 15 : 0);
    const dmg = crit ? Math.round(baseDmg * 2) : baseDmg;
    SFX.playHit();
    spawnFloatingText(this, enemy.x, enemy.y - 16, crit ? `${dmg}!` : `${dmg}`, crit ? '#ffe066' : '#ffffff');
    spawnBurstParticles(this, enemy.x, enemy.y - 4, 0xff6b6b, 5);

    const killed = enemy.takeDamage(dmg, dirX, dirY, this.isWalkable);

    // Boss Enrage Phase 2 below 50% HP
    if (!killed && enemy === this.boss && !this.bossEnraged && enemy.hp <= enemy.maxHp * 0.5) {
      this.bossEnraged = true;
      this.cameras.main.shake(200, 0.008);
      enemy.sprite.setTint(0xff8a8a);
      this.hud.showToast(`${enemy.def.name} ENRAGED! Phase 2!`);
      const proj = enemy.def.projectileKey ?? 'monster_projectiles/FireballBig';
      for (let i = 0; i < 10; i++) {
        const ang = (Math.PI * 2 * i) / 10;
        const spr = this.add.image(enemy.x, enemy.y - 4, proj).setDepth(5000);
        this.projectiles.push({
          sprite: spr,
          vx: Math.cos(ang) * 115,
          vy: Math.sin(ang) * 115,
          damage: Math.round(enemy.def.damage * 1.15),
          fromPlayer: false,
          lifeMs: 2000,
          kind: 'enemy',
        });
      }
    }

    if (killed) {
      this.drops.push(
        new LootDrop(this, enemy.x, enemy.y, 'coin', Phaser.Math.Between(enemy.def.coins[0], enemy.def.coins[1]), true),
      );
      for (const d of enemy.def.drops) {
        if (Math.random() <= d.chance) {
          this.drops.push(new LootDrop(this, enemy.x, enemy.y, d.itemId, d.count, false));
        }
      }
      gameState.addXp(enemy.def.xp);

      if (enemy === this.boss && !this.relicSpawned) {
        this.relicSpawned = true;
        this.hud.setBossBar(null);
        gameState.clearedDungeons.add(this.cfg.id);
        gameState.addItem(this.cfg.relicId, 1);
        SFX.playLevelUp();
        this.hud.showToast(`BOSS DEFEATED! Unlocked ${ITEMS[this.cfg.relicId].name}!`);
        gameState.save();
      }
    }
  }

  private isWalkable = (wx: number, wy: number): boolean => {
    const tx = Math.floor(wx / TILE_PX);
    const ty = Math.floor(wy / TILE_PX);
    if (tx <= 0 || ty <= 0 || tx >= ROOM_W - 1 || ty >= ROOM_H - 1) return false;
    if (tx === 10 && (ty < 6 || ty > 9)) return false;
    if (tx === 20 && (ty < 6 || ty > 9)) return false;
    if (!this.gateOpen && tx === 20 && ty >= 6 && ty <= 9) return false;
    return true;
  };

  update(_time: number, dtMs: number): void {
    const dt = Math.min(dtMs, 50);

    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) {
      if (Math.hypot(this.exitPortal.x - this.player.x, this.exitPortal.y - this.player.y) <= 28) {
        this.hud.setBossBar(null);
        this.hud.destroy();
        this.scene.start('OverworldScene');
        return;
      }
      if (
        !this.treasureChest.opened &&
        Math.hypot(this.treasureChest.x - this.player.x, this.treasureChest.y - this.player.y) <= 28
      ) {
        this.treasureChest.opened = true;
        this.treasureChest.spr.play('prop_chest_big_open');
        SFX.playLevelUp();
        this.drops.push(new LootDrop(this, this.treasureChest.x, this.treasureChest.y + 10, 'coin', 45, true));
        for (const item of this.cfg.chestLoot) {
          this.drops.push(new LootDrop(this, this.treasureChest.x, this.treasureChest.y + 10, item.itemId, item.count, false));
        }
        this.hud.showToast('Opened Dungeon Treasure Chest!');
      }
    }

    if (!this.hud.isBlockingInput()) {
      const dir = new Phaser.Math.Vector2(
        (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0) -
          (this.keys.A.isDown || this.keys.LEFT.isDown ? 1 : 0),
        (this.keys.S.isDown || this.keys.DOWN.isDown ? 1 : 0) -
          (this.keys.W.isDown || this.keys.UP.isDown ? 1 : 0),
      );
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
        if (this.player.tryDash(dir)) {
          const dodged = this.enemies.some(
            (e) =>
              e.active &&
              !e.isDead &&
              (e.isWindingUp() || Math.hypot(e.x - this.player.x, e.y - this.player.y) <= 60),
          );
          if (dodged) {
            this.player.grantDodgeMomentum(2200);
            spawnFloatingText(this, this.player.x, this.player.y - 18, 'DODGE CRIT!', '#ffe57f', '8px');
          }
        }
      }
      this.player.updatePlayer(dt, dir, this.isWalkable);
    }

    // Check Floor Puzzle Sigils in Room 2
    if (!this.gateOpen) {
      for (const sw of this.switches) {
        if (!sw.active && Math.hypot(sw.x - this.player.x, sw.y - this.player.y) <= 13) {
          sw.active = true;
          sw.spr.setTexture('ui_icons/sigil_on');
          SFX.playCraft();
        }
      }
      if (this.switches.every((s) => s.active)) {
        this.gateOpen = true;
        this.bossGateGroup?.clear(true, true);
        SFX.playLevelUp();
        this.hud.showToast('Boss Gate Unsealed!');
      }
    }

    // Update Boss Bar if in Room 3
    if (this.boss && !this.boss.isDead && this.player.x > 20 * TILE_PX) {
      this.hud.setBossBar({
        name: this.bossEnraged ? `${this.boss.def.name} [ENRAGED]` : this.boss.def.name,
        hp: this.boss.hp,
        maxHp: this.boss.maxHp,
        portrait: this.boss.def.portraitKey,
      });
    }

    // Enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.active) {
        this.enemies.splice(i, 1);
        continue;
      }
      if (e === this.boss && !this.gateOpen) continue;

      e.updateEnemy(this.bossEnraged && e === this.boss ? dt * 1.35 : dt, this.player.x, this.player.y, this.isWalkable, {
        onMeleeHitPlayer: (dmg, dx, dy) => {
          if (this.player.takeDamage(dmg, dx, dy, this.isWalkable)) {
            spawnFloatingText(this, this.player.x, this.player.y - 14, `-${dmg}`, '#ff5e6c');
            if (gameState.hp <= 0) {
              gameState.hp = Math.round(gameState.getMaxHp() * 0.6);
              this.hud.setBossBar(null);
              this.hud.destroy();
              this.scene.start('OverworldScene');
            }
          }
        },
        onFireProjectile: (px, py, vx, vy, dmg, texKey) => {
          const spr = this.add.image(px, py, texKey).setDepth(5000);
          this.projectiles.push({
            sprite: spr,
            vx,
            vy,
            damage: dmg,
            fromPlayer: false,
            lifeMs: 2000,
            kind: 'enemy',
          });
        },
        onBossSummon: (sx, sy, mId) => {
          if (this.enemies.length < 7 && this.isWalkable(sx, sy)) {
            this.enemies.push(new Enemy(this, mId, sx, sy));
          }
        },
      });
    }

    // Projectiles
    const dtSec = dt / 1000;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.lifeMs -= dt;
      p.sprite.x += p.vx * dtSec;
      p.sprite.y += p.vy * dtSec;
      let hit = !this.isWalkable(p.sprite.x, p.sprite.y);

      if (!hit && p.fromPlayer) {
        for (const bp of this.breakables) {
          if (!bp.broken && Math.hypot(bp.x - p.sprite.x, bp.y - p.sprite.y) <= 10) {
            this.shatterBreakable(bp);
            hit = true;
            break;
          }
        }
        if (!hit) {
          for (const e of this.enemies) {
            if (e.active && !e.isDead && Math.hypot(e.x - p.sprite.x, e.y - p.sprite.y) <= 15) {
              const spd = Math.hypot(p.vx, p.vy) || 1;
              if (p.kind === 'ice') e.applySlow(2600);
              if (p.kind === 'necro') {
                gameState.hp = Math.min(gameState.getMaxHp(), gameState.hp + 4);
                gameState.emitVitals();
              }
              this.damageEnemy(e, p.damage, p.vx / spd, p.vy / spd);
              hit = true;
              break;
            }
          }
        }
      } else if (!hit && !p.fromPlayer) {
        if (Math.hypot(this.player.x - p.sprite.x, this.player.y - p.sprite.y) <= 10) {
          const spd = Math.hypot(p.vx, p.vy) || 1;
          if (this.player.takeDamage(p.damage, p.vx / spd, p.vy / spd, this.isWalkable)) {
            spawnFloatingText(this, this.player.x, this.player.y - 14, `-${p.damage}`, '#ff5e6c');
            if (gameState.hp <= 0) {
              gameState.hp = Math.round(gameState.getMaxHp() * 0.6);
              this.hud.setBossBar(null);
              this.hud.destroy();
              this.scene.start('OverworldScene');
              return;
            }
          }
          hit = true;
        }
      }

      if (hit || p.lifeMs <= 0) {
        p.sprite.destroy();
        this.projectiles.splice(i, 1);
      }
    }

    // Drops
    for (let i = this.drops.length - 1; i >= 0; i--) {
      if (this.drops[i].updateDrop(dt, this.player.x, this.player.y)) {
        this.drops.splice(i, 1);
      }
    }
  }
}
