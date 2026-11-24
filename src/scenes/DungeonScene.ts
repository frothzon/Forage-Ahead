import Phaser from 'phaser';
import { gameState } from '../core/GameState';
import { computeResponsiveZoom } from '../core/ViewportScaler';
import { fmtKeyPrompt } from '../core/Platform';
import { SFX } from '../core/SoundFX';
import { startSceneAndWaitCreate, transitionManager } from '../core/TransitionManager';
import {
  buildDungeonLayout,
  type DungeonLayout,
  type DungeonRoomPlan,
} from '../world/DungeonLayoutBuilder';
import { DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST } from '../world/WfcRoomGraph';
import { ITEMS } from '../data/items';
import { DUNGEON_THEME_VISUALS } from '../data/dungeonTilesets';
import { tryActivateGadget } from '../entities/GadgetHelper';
import { getBlueprintsForMonster, tryUnlockBlueprintFromPool } from '../data/blueprints';
import type { DungeonId } from '../data/islands';
import { TILE_PX } from '../data/islands';
import {
  crumbleStoneBlocks,
  drawSlashArc,
  getWeaponSlashColor,
  spawnBurstParticles,
  spawnDeathBurst,
  spawnDirectionalSparks,
  spawnFloatingText,
  spawnProjectileImpact,
  spawnShockwaveRing,
  spawnSparklers,
  type ActiveProjectile,
} from '../entities/CombatHelpers';
import { DungeonChest } from '../entities/DungeonChest';
import { DungeonProp } from '../entities/DungeonProp';
import { CameraRig } from '../vfx/CameraRig';
import { DungeonAtmosphere } from '../vfx/DungeonAtmosphere';
import { EffectSequencer } from '../vfx/EffectSequencer';
import { detailDungeonRoom } from '../world/DungeonDetailer';
import { LightingSystem, type PointLightSource } from '../world/LightingSystem';
import { Enemy } from '../entities/Enemy';
import { LootDrop } from '../entities/LootDrop';
import { FamiliarCompanion, Player } from '../entities/Player';
import {
  isSwordItem,
  selectBestAimTarget,
  SwordAutoTargeter,
  type AimCandidate,
  type SwordAutoTargetCandidate,
} from '../entities/targeting';
import { HudController } from '../ui/HudController';
import { revealSequence } from '../ui/RevealSequence';
import { createDungeonPromoTimeline, getPromoConfig, markPromoReady, type PromoTimeline } from '../promo/PromoDirector';
import { buildBaseSnapshot, getQaConfig, isQaMode, markQaReady, registerQaApi } from '../qa/QaDirector';

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
  void_spire: {
    id: 'void_spire',
    title: 'Void Spire',
    floorTint: 0x3b2859,
    wallTint: 0x1b122b,
    minions: ['Pixie', 'Owlbear'],
    bossId: 'Oni',
    relicId: 'void_rod',
    chestLoot: [
      { itemId: 'void_shard', count: 2 },
      { itemId: 'astral_essence', count: 1 },
    ],
  },
};

const ROOM_W = 32;
const ROOM_H = 16;
const WFC_ROOM_W = 16;
const WFC_ROOM_H = 12;

interface WfcDoorRuntime {
  a: number;
  b: number;
  lock: 'open' | 'small_key' | 'boss_key' | 'combat_seal';
  baseLock: 'open' | 'small_key' | 'boss_key';
  opened: boolean;
  tiles: Array<{ tx: number; ty: number }>;
  sprites: Phaser.GameObjects.Image[];
  x: number;
  y: number;
}

interface WfcChestRuntime {
  chest: DungeonChest;
  grantsSmallKey: boolean;
  grantsBossKey: boolean;
}

interface WfcBrazierRuntime {
  x: number;
  y: number;
  spr: Phaser.GameObjects.Image;
  lit: boolean;
}

interface WfcRoomRuntime {
  plan: DungeonRoomPlan;
  ox: number;
  oy: number;
  cx: number;
  cy: number;
  cleared: boolean;
  ambushTriggered: boolean;
  puzzleSolved: boolean;
  enemies: Enemy[];
  chest?: WfcChestRuntime;
  sigils: Array<{ x: number; y: number; spr: Phaser.GameObjects.Image; active: boolean }>;
  braziers: WfcBrazierRuntime[];
  fogOverlay?: Phaser.GameObjects.Rectangle;
}

export class DungeonScene extends Phaser.Scene {
  private cfg!: DungeonConfig;
  private voidFloor = 1;
  private nextFloorPortal?: Phaser.GameObjects.Container;
  private player!: Player;
  private fox?: FamiliarCompanion;
  private hud!: HudController;
  private cameraRig!: CameraRig;
  private fx!: EffectSequencer;
  private lighting!: LightingSystem;
  private atmosphere!: DungeonAtmosphere;
  private torchLights: PointLightSource[] = [];
  private torchPositions: Array<{ x: number; y: number }> = [];
  private torchEmberTimerMs = 0;
  private enemies: Enemy[] = [];
  private drops: LootDrop[] = [];
  private projectiles: ActiveProjectile[] = [];
  private breakables: DungeonProp[] = [];
  private pillarObstacles: Array<{ x: number; y: number }> = [];
  private boss: Enemy | null = null;
  private bossEnraged = false;
  private exitPortal!: { x: number; y: number; sprX: number; sprY: number; glow: Phaser.GameObjects.Ellipse };
  private treasureChest!: { x: number; y: number; spr: Phaser.GameObjects.Sprite; opened: boolean };
  private switches: Array<{ x: number; y: number; spr: Phaser.GameObjects.Image; active: boolean }> = [];
  private bossGateGroup?: Phaser.GameObjects.Group;
  private gateOpen = false;
  private relicSpawned = false;
  private promoTimeline: PromoTimeline | null = null;
  private swordTargeter = new SwordAutoTargeter<Enemy>();
  private targetIndicator?: Phaser.GameObjects.Arc;

  // Multi-room WFC dungeon state (null for Void Spire)
  private wfcLayout: DungeonLayout | null = null;
  private worldTilesW = ROOM_W;
  private worldTilesH = ROOM_H;
  private solidGrid: boolean[][] = [];
  private wfcRooms = new Map<number, WfcRoomRuntime>();
  private wfcDoors: WfcDoorRuntime[] = [];
  private discoveredRooms = new Set<number>();
  private currentRoomId = 0;
  private smallKeys = 0;
  private hasBossKey = false;
  private returnPortal?: { x: number; y: number };

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

  init(data: { dungeonId?: DungeonId; floor?: number }): void {
    const id = data?.dungeonId ?? 'skull_crypt';
    this.voidFloor = Math.max(1, data?.floor ?? 1);
    const base = DUNGEON_CONFIGS[id];
    if (id !== 'void_spire') {
      this.cfg = base;
      return;
    }
    const f = this.voidFloor;
    const minions =
      f <= 5
        ? ['Pixie', 'Dryad', 'Satyr', 'Displacer Beast', 'Owlbear', 'Kappa', 'Tengu', 'Ronin']
        : f <= 10
          ? ['Samurai', 'Serpent Fly', 'Bulette', 'Wolf Rider', 'Ogre', 'Cyclops', 'Blue Wyrmling']
          : f <= 15
            ? ['Faerie Dragon', 'Peasant', 'Wizard', 'Paladin', 'Griffin', 'Beholder']
            : ['Efreet', 'Elder Snail', 'Fiddle Dog', 'Blemmyae', 'Rabbit Soldier', 'Manticore Bishop'];
    const bossId =
      f >= 20
        ? 'Ancient Black Dragon'
        : f >= 15
          ? 'Planetar'
          : f >= 10
            ? 'Young Green Dragon'
            : f >= 5
              ? 'Oni'
              : 'Owlbear';
    this.cfg = {
      ...base,
      title: `Void Spire • Floor ${f} (Lv.${20 + f * 2})`,
      minions,
      bossId,
    };
  }

  create(): void {
    this.enemies = [];
    this.drops = [];
    this.projectiles = [];
    this.breakables = [];
    this.pillarObstacles = [];
    this.switches = [];
    this.boss = null;
    this.nextFloorPortal = undefined;
    this.bossEnraged = false;
    this.bossGateGroup = undefined;
    this.gateOpen = false;
    this.relicSpawned = false;
    this.wfcLayout = null;
    this.solidGrid = [];
    this.wfcRooms.clear();
    this.wfcDoors = [];
    this.discoveredRooms.clear();
    this.currentRoomId = 0;
    this.smallKeys = 0;
    this.hasBossKey = false;
    this.returnPortal = undefined;
    this.torchLights = [];
    this.torchPositions = [];
    this.torchEmberTimerMs = 0;
    this.swordTargeter.clear();

    if (this.cfg.id === 'void_spire') {
      this.worldTilesW = ROOM_W;
      this.worldTilesH = ROOM_H;
      this.buildRoom();
      this.player = new Player(this, 3 * TILE_PX + 8, (ROOM_H / 2) * TILE_PX);
    } else {
      this.buildWfcDungeon();
      const startRm = this.wfcRooms.get(this.wfcLayout!.startRoomId)!;
      this.player = new Player(this, startRm.cx, startRm.cy + 16);
    }
    this.lighting = new LightingSystem(this);
    this.lighting.timeOfDay = 0.88;
    this.lighting.paused = true;
    this.atmosphere = new DungeonAtmosphere(this, 0xe8dec8, 34);
    if (gameState.heroClass === 'Beastmaster') {
      this.fox = new FamiliarCompanion(this, this.player.x - 14, this.player.y + 6);
    }

    const roomW = this.worldTilesW * TILE_PX;
    const roomH = this.worldTilesH * TILE_PX;
    this.cameras.main.setBounds(0, 0, roomW, roomH);
    this.cameras.main.setZoom(
      computeResponsiveZoom(this.scale.width, this.scale.height, {
        worldWidthPx: roomW,
        worldHeightPx: roomH,
        minZoom: 3,
      }),
    );
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.roundPixels = false;
    this.cameraRig = new CameraRig(this, { maxLookAheadPx: 12 });
    this.fx = new EffectSequencer(this, {
      cameraRig: this.cameraRig,
      onHitstop: (ms) => this.player.applyHitstop(ms),
    });

    this.targetIndicator = this.add
      .circle(0, 0, 9, 0xff6b6b, 0.14)
      .setStrokeStyle(1.4, 0xff6b6b, 0.9)
      .setDepth(1)
      .setVisible(false);
    this.tweens.add({
      targets: this.targetIndicator,
      scale: { from: 0.75, to: 1.0 },
      duration: 1000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    const onResize = (gameSize: Phaser.Structs.Size) => {
      this.cameras.main.setSize(gameSize.width, gameSize.height);
      this.cameras.main.setZoom(
        computeResponsiveZoom(gameSize.width, gameSize.height, {
          worldWidthPx: roomW,
          worldHeightPx: roomH,
          minZoom: 3,
        }),
      );
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
    });

    this.hud = new HudController({
      onBuyIsland: () => {},
      onSelectBuild: () => {},
      onUseHotbarItem: (id) => this.tryConsumeItem(id),
      onSave: () => {
        gameState.save();
        this.hud.showToast('Saved!');
      },
      onTouchAction: () => {
        if (this.hud.isBlockingInput()) return;
        if (this.tryInteractPortal()) return;
        const f = this.player.facing;
        const dx = f === 'left' ? -28 : f === 'right' ? 28 : 0;
        const dy = f === 'up' ? -28 : f === 'down' ? 28 : 0;
        this.handleAttack(this.player.x + dx, this.player.y + dy);
      },
      onTouchDash: () => {
        if (this.hud.isBlockingInput()) return;
        const tv = this.hud.getTouchMoveVector();
        this.player.tryDash(new Phaser.Math.Vector2(tv.x, tv.y));
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
          this.transitionToOverworld();
        } else if (act === 'erase_save') {
          if (transitionManager.isActive) return;
          gameState.eraseAllSavedData();
          SFX.playPortalWarp();
          void transitionManager.transitionTo({
            onMidpoint: async () => {
              this.hud.setBossBar(null);
              this.hud.destroy();
              SFX.setMusicSituation('title');
              await startSceneAndWaitCreate(this, 'TitleScene');
            },
          });
        }
      },
    });
    this.hud.showToast(
      this.wfcLayout
        ? `${this.cfg.title} (${(this.wfcLayout as DungeonLayout).rooms.length} Rooms) — Find keys, defeat the Miniboss, and slay the Boss!`
        : `${this.cfg.title} — Break crates, loot the chest, and activate both sigils!`,
    );
    this.syncDungeonHud();
    SFX.setMusicPaused(false);
    SFX.setMusicContext({
      dungeonId: this.cfg.id,
      floor: this.voidFloor,
      isFinalBoss: this.cfg.id === 'void_spire' && this.voidFloor >= 20,
    });
    SFX.setMusicSituation('dungeon');

    this.setupInput();

    const promo = getPromoConfig();
    if (promo.shotId === '07_void_dragon_climax') {
      this.gateOpen = true;
      (this.bossGateGroup as Phaser.GameObjects.Group | undefined)?.clear(true, true);
      this.player.setPosition(22 * TILE_PX + 8, (ROOM_H / 2) * TILE_PX);
      this.cameras.main.centerOn(this.player.x + 36, this.player.y);
      this.promoTimeline = createDungeonPromoTimeline({
        scene: this,
        player: this.player,
        boss: this.boss,
        enemies: this.enemies,
        hud: this.hud,
        projectiles: this.projectiles,
        damageEnemy: (enemy, dmg, dirX, dirY) => this.damageEnemy(enemy, dmg, dirX, dirY),
        fireWeaponAt: (itemId, wx, wy) => {
          const idx = gameState.hotbar.indexOf(itemId);
          if (idx !== -1) gameState.selectedHotbarIndex = idx;
          else gameState.hotbar[0] = itemId;
          gameState.selectedHotbarIndex = idx !== -1 ? idx : 0;
          this.handleAttack(wx, wy);
        },
        setZoom: (zoom) => this.cameras.main.setZoom(zoom),
      });
      markPromoReady();
    }

    if (isQaMode()) {
      const qaCfg = getQaConfig();
      if (qaCfg.scenarioId === 'void_dragon_boss') {
        this.gateOpen = true;
        (this.bossGateGroup as Phaser.GameObjects.Group | undefined)?.clear(true, true);
        this.player.setPosition(22 * TILE_PX + 8, (ROOM_H / 2) * TILE_PX);
        this.cameras.main.centerOn(this.player.x + 36, this.player.y);
      }

      registerQaApi({
        getStateSnapshot: () =>
          buildBaseSnapshot('DungeonScene', {
            activeModal: this.hud?.activeModal ?? 'none',
            playerPos: { x: Math.round(this.player.x), y: Math.round(this.player.y) },
          }),
        spawnEntity: (kind, id, offsetTilesX, offsetTilesY) => {
          if (kind !== 'enemy') return false;
          const wx = this.player.x + offsetTilesX * TILE_PX;
          const wy = this.player.y + offsetTilesY * TILE_PX;
          const e = new Enemy(this, id, wx, wy);
          this.enemies.push(e);
          return true;
        },
        openModal: (modal) => {
          this.hud.toggleModal(modal as never);
          return true;
        },
        closeModal: () => {
          this.hud.closeModal();
          return true;
        },
        triggerAction: (action, payload) => {
          if (action === 'attack_nearby' || action === 'fire_weapon') {
            const itemId = payload?.itemId as string | undefined;
            if (itemId) {
              const idx = gameState.hotbar.indexOf(itemId);
              if (idx !== -1) gameState.selectedHotbarIndex = idx;
              else {
                gameState.hotbar[0] = itemId;
                gameState.selectedHotbarIndex = 0;
              }
            }
            const target =
              (this.boss && this.boss.active ? this.boss : null) ??
              this.enemies
                .filter((e) => e.active)
                .sort(
                  (a, b) =>
                    Math.hypot(a.x - this.player.x, a.y - this.player.y) -
                    Math.hypot(b.x - this.player.x, b.y - this.player.y),
                )[0];
            const wx = target ? target.x : this.player.x + 28;
            const wy = target ? target.y : this.player.y;
            this.handleAttack(wx, wy);
            return true;
          }
          if (action === 'open_chest') {
            for (const rm of this.wfcRooms.values()) {
              if (rm.chest && !rm.chest.chest.opened) {
                rm.puzzleSolved = true;
                rm.chest.chest.locked = false;
                this.player.setPosition(rm.chest.chest.x, rm.chest.chest.y + 12);
                return this.tryInteractPortal();
              }
            }
            return false;
          }
          return false;
        },
      });
      markQaReady();
    }
  }

  private buildRoom(): void {
    const pad = 10;
    for (let y = -pad; y < ROOM_H + pad; y++) {
      for (let x = -pad; x < ROOM_W + pad; x++) {
        const outside = x < 0 || y < 0 || x >= ROOM_W || y >= ROOM_H;
        const isBorder = outside || x === 0 || y === 0 || x === ROOM_W - 1 || y === ROOM_H - 1;
        const isRoom1Wall = !outside && x === 10 && (y < 6 || y > 9);
        const isBossWall = !outside && x === 20 && (y < 6 || y > 9);
        const isWall = isBorder || isRoom1Wall || isBossWall;
        const tile = this.add
          .image(x * TILE_PX + 8, y * TILE_PX + 8, 'tileset/Stone tile')
          .setTint(isWall ? this.cfg.wallTint : this.cfg.floorTint)
          .setDepth(0);
        if (isWall) {
          tile.setAlpha(outside ? 0.8 : 0.95);
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

    // Exit Portal on North Wall (south-facing wall)
    const vsEx = 3 * TILE_PX + 8;
    const vsWallY = 8;
    const vsGlow = this.add.ellipse(vsEx, vsWallY, 24, 16, 0x7ef29d, 0.24).setDepth(vsWallY + 1);
    this.add
      .image(vsEx, TILE_PX, 'tileset/Door (open)')
      .setOrigin(0.5, 0.94)
      .setScale(0.82)
      .setDepth(vsWallY + 2);
    this.exitPortal = { x: vsEx, y: 1.2 * TILE_PX, sprX: vsEx, sprY: vsWallY, glow: vsGlow };
    this.add
      .text(vsEx, 1.55 * TILE_PX, fmtKeyPrompt('E', 'Exit'), {
        fontSize: '7px',
        fontStyle: 'bold',
        color: '#9ee6ff',
        stroke: '#000',
        strokeThickness: 2,
        resolution: 4,
      })
      .setOrigin(0.5)
      .setDepth(7000);

    // Room 1 Breakable Props (Void Spire)
    const vsVis = DUNGEON_THEME_VISUALS.void_spire;
    for (const [bx, by] of [
      [4, 3],
      [5, 3],
      [4, 12],
      [8, 4],
      [8, 11],
    ]) {
      const px = bx * TILE_PX + 8;
      const py = by * TILE_PX + 8;
      this.breakables.push(new DungeonProp(this, px, py, vsVis.propPool[bx % vsVis.propPool.length]));
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

  private buildWfcDungeon(): void {
    const layout = buildDungeonLayout(Date.now(), 7, 10);
    this.wfcLayout = layout;
    const { minGx, maxGx, minGy, maxGy } = layout.graph.bounds;
    this.worldTilesW = (maxGx - minGx + 1) * WFC_ROOM_W;
    this.worldTilesH = (maxGy - minGy + 1) * WFC_ROOM_H;
    this.solidGrid = Array.from({ length: this.worldTilesH }, () => Array(this.worldTilesW).fill(true));

    // Carve room interiors and doorway passages
    const doorMidX = [7, 8];
    const doorMidY = [5, 6];
    const hasDoorAt = new Map<string, 'open' | 'small_key' | 'boss_key'>();
    for (const d of layout.doors) {
      const k1 = d.a < d.b ? `${d.a}-${d.b}` : `${d.b}-${d.a}`;
      hasDoorAt.set(k1, d.lock === 'combat_seal' ? 'open' : d.lock);
    }

    for (const r of layout.rooms) {
      const ox = (r.gx - minGx) * WFC_ROOM_W;
      const oy = (r.gy - minGy) * WFC_ROOM_H;

      for (let ly = 1; ly < WFC_ROOM_H - 1; ly++) {
        for (let lx = 1; lx < WFC_ROOM_W - 1; lx++) {
          this.solidGrid[oy + ly][ox + lx] = false;
        }
      }
      if ((r.mask & DIR_EAST) !== 0) {
        for (const ly of doorMidY) this.solidGrid[oy + ly][ox + WFC_ROOM_W - 1] = false;
      }
      if ((r.mask & DIR_WEST) !== 0) {
        for (const ly of doorMidY) this.solidGrid[oy + ly][ox] = false;
      }
      if ((r.mask & DIR_NORTH) !== 0) {
        for (const lx of doorMidX) this.solidGrid[oy][ox + lx] = false;
      }
      if ((r.mask & DIR_SOUTH) !== 0) {
        for (const lx of doorMidX) this.solidGrid[oy + WFC_ROOM_H - 1][ox + lx] = false;
      }
    }

    const activeTileSet = new Set<string>();
    for (const r of layout.rooms) {
      const ox = (r.gx - minGx) * WFC_ROOM_W;
      const oy = (r.gy - minGy) * WFC_ROOM_H;
      for (let ly = 0; ly < WFC_ROOM_H; ly++) {
        for (let lx = 0; lx < WFC_ROOM_W; lx++) {
          activeTileSet.add(`${ox + lx},${oy + ly}`);
        }
      }
    }

    const vis = DUNGEON_THEME_VISUALS[this.cfg.id];
    // Render autotiled walls, wall-base drop shadows, & floor tiles only for active WFC room cells
    for (let ty = 0; ty < this.worldTilesH; ty++) {
      for (let tx = 0; tx < this.worldTilesW; tx++) {
        if (!activeTileSet.has(`${tx},${ty}`)) continue;
        const isWall = this.solidGrid[ty][tx];
        const px = tx * TILE_PX + 8;
        const py = ty * TILE_PX + 8;
        if (isWall) {
          const belowFloor = ty + 1 < this.worldTilesH && !this.solidGrid[ty + 1][tx];
          const aboveFloor = ty - 1 >= 0 && !this.solidGrid[ty - 1][tx];
          const frame = belowFloor ? vis.wallFrontFrame : aboveFloor ? vis.wallTopFrame : vis.wallVoidFrame;
          this.add
            .image(px, py, vis.sheet, frame)
            .setTint(vis.wallTint)
            .setDepth(belowFloor ? 0 : ty * TILE_PX + 15);
        } else {
          this.add
            .image(px, py, vis.sheet, vis.floorFrames[0])
            .setTint(vis.floorTint)
            .setDepth(0);
          // Wall-base drop shadow on floors directly south of a solid wall
          if (ty - 1 >= 0 && this.solidGrid[ty - 1][tx]) {
            this.add.rectangle(px, ty * TILE_PX + 2.5, TILE_PX, 5, 0x05040a, 0.36).setDepth(0.5);
          }
          // Subtle side-wall bevel shadow on floors adjacent to left/right walls
          if (tx - 1 >= 0 && this.solidGrid[ty][tx - 1]) {
            this.add.rectangle(tx * TILE_PX + 1.5, py, 3, TILE_PX, 0x05040a, 0.18).setDepth(0.5);
          }
          if (tx + 1 < this.worldTilesW && this.solidGrid[ty][tx + 1]) {
            this.add.rectangle(tx * TILE_PX + TILE_PX - 1.5, py, 3, TILE_PX, 0x05040a, 0.18).setDepth(0.5);
          }
        }
      }
    }

    // Populate each room using DungeonDetailer
    const roomById = new Map(layout.rooms.map((r) => [r.id, r]));
    for (const r of layout.rooms) {
      const ox = (r.gx - minGx) * WFC_ROOM_W;
      const oy = (r.gy - minGy) * WFC_ROOM_H;
      const cx = (ox + WFC_ROOM_W / 2) * TILE_PX;
      const cy = (oy + WFC_ROOM_H / 2) * TILE_PX;

      const reserved: Array<{ lx: number; ly: number }> = [];
      if (r.puzzleKind === 'sigils') {
        reserved.push({ lx: 4, ly: 4 }, { lx: WFC_ROOM_W - 5, ly: 4 }, { lx: Math.floor(WFC_ROOM_W / 2), ly: WFC_ROOM_H - 4 });
      } else if (r.puzzleKind === 'braziers') {
        reserved.push({ lx: 4, ly: 3 }, { lx: WFC_ROOM_W - 5, ly: 3 }, { lx: Math.floor(WFC_ROOM_W / 2), ly: WFC_ROOM_H - 4 });
      }

      const detail = detailDungeonRoom({
        roomW: WFC_ROOM_W,
        roomH: WFC_ROOM_H,
        mask: r.mask,
        role: r.role,
        theme: vis,
        seed: layout.seed + r.id * 997,
        reservedTiles: reserved,
        propCount: r.breakableCount,
      });

      for (const f of detail.floors) {
        if (f.frame !== vis.floorFrames[0]) {
          this.add
            .image((ox + f.lx) * TILE_PX + 8, (oy + f.ly) * TILE_PX + 8, vis.sheet, f.frame)
            .setTint(f.tint)
            .setDepth(0);
        }
      }
      for (const dc of detail.decals) {
        const dx = (ox + dc.lx) * TILE_PX + 8;
        const dy = (oy + dc.ly) * TILE_PX + 8;
        if (dc.kind === 'crack' || dc.kind === 'bone') {
          this.add.rectangle(dx, dy, dc.size, 1.5, dc.color, dc.alpha).setAngle((dc.lx * 37 + dc.ly * 19) % 180).setDepth(0.6);
        } else {
          this.add.circle(dx, dy, dc.size * 0.55, dc.color, dc.alpha).setDepth(0.6);
        }
      }
      for (const rg of detail.rugs) {
        this.add
          .image((ox + rg.lx) * TILE_PX + 8, (oy + rg.ly) * TILE_PX + 8, vis.sheet, rg.frame)
          .setTint(rg.tint)
          .setAlpha(0.85)
          .setDepth(1);
      }
      for (const t of detail.torches) {
        const txPx = (ox + t.lx) * TILE_PX + 8;
        const tyPx = (oy + t.ly) * TILE_PX + 8;
        this.add
          .image(txPx, tyPx, vis.torchSheet, vis.torchFrame)
          .setDepth(tyPx);
        this.torchPositions.push({ x: txPx, y: tyPx - 3 });
        this.torchLights.push({ x: txPx, y: tyPx, radius: 44, color: 0xffb85c, intensity: 1, flicker: true });
      }
      for (const pil of detail.pillars) {
        const px = (ox + pil.lx) * TILE_PX + 8;
        const py = (oy + pil.ly) * TILE_PX + 8;
        this.add.image(px, py - 8, vis.sheet, vis.pillarTopFrame).setTint(vis.pillarTint).setDepth(py);
        this.add.image(px, py, vis.sheet, vis.pillarBaseFrame).setTint(vis.pillarTint).setDepth(py);
        this.pillarObstacles.push({ x: px, y: py });
      }
      for (const p of detail.props) {
        const px = (ox + p.lx) * TILE_PX + 8;
        const py = (oy + p.ly) * TILE_PX + 8;
        this.breakables.push(new DungeonProp(this, px, py, p.spec));
      }

      const fogOverlay =
        r.role === 'start'
          ? undefined
          : this.add
              .rectangle(
                ox * TILE_PX + (WFC_ROOM_W * TILE_PX) / 2,
                oy * TILE_PX + (WFC_ROOM_H * TILE_PX) / 2,
                WFC_ROOM_W * TILE_PX,
                WFC_ROOM_H * TILE_PX,
                0x07060d,
                0.94,
              )
              .setDepth(8500);

      const rt: WfcRoomRuntime = {
        plan: r,
        ox,
        oy,
        cx,
        cy,
        cleared: r.role === 'start' || r.enemyCount === 0,
        ambushTriggered: false,
        puzzleSolved: r.puzzleKind === undefined,
        enemies: [],
        sigils: [],
        braziers: [],
        fogOverlay,
      };

      if (r.role === 'start') {
        const wallX = (ox + Math.floor(WFC_ROOM_W / 2)) * TILE_PX;
        const wallY = oy * TILE_PX + 8;
        const glow = this.add.ellipse(wallX, wallY, 24, 16, 0x7ef29d, 0.24).setDepth(wallY + 1);
        this.exitPortal = { x: wallX, y: (oy + 1.2) * TILE_PX, sprX: wallX, sprY: wallY, glow };
        this.add
          .image(wallX, (oy + 1) * TILE_PX, 'tileset/Door (open)')
          .setOrigin(0.5, 0.94)
          .setScale(0.82)
          .setDepth(wallY + 2);
        this.add
          .text(this.exitPortal.x, (oy + 1.55) * TILE_PX, fmtKeyPrompt('E', 'Exit'), {
            fontSize: '7px',
            fontStyle: 'bold',
            color: '#9ee6ff',
            stroke: '#000',
            strokeThickness: 2,
            resolution: 4,
          })
          .setOrigin(0.5)
          .setDepth(7000);
        this.discoveredRooms.add(r.id);
        this.currentRoomId = r.id;
      }

      // Prefab puzzle setups
      if (r.puzzleKind === 'sigils') {
        for (const [lx, ly] of [
          [4, 4],
          [WFC_ROOM_W - 5, 4],
          [WFC_ROOM_W / 2, WFC_ROOM_H - 4],
        ]) {
          const px = (ox + lx) * TILE_PX + 8;
          const py = (oy + ly) * TILE_PX + 8;
          const spr = this.add.image(px, py, 'ui_icons/sigil_off').setDepth(2);
          rt.sigils.push({ x: px, y: py, spr, active: false });
        }
      } else if (r.puzzleKind === 'braziers') {
        for (const [lx, ly] of [
          [4, 3],
          [WFC_ROOM_W - 5, 3],
          [WFC_ROOM_W / 2, WFC_ROOM_H - 4],
        ]) {
          const px = (ox + lx) * TILE_PX + 8;
          const py = (oy + ly) * TILE_PX + 8;
          const spr = this.add.image(px, py, 'extras/Bonfire', 0).setTint(0x4a5568).setAlpha(0.75).setDepth(py);
          rt.braziers.push({ x: px, y: py, spr, lit: false });
        }
      }

      if (r.hasTreasureChest) {
        const isSealed = !rt.puzzleSolved;
        const title = r.grantsSmallKey ? 'Key Chest' : 'Treasure';
        rt.chest = {
          chest: new DungeonChest(this, { x: cx, y: cy, title, locked: isSealed }),
          grantsSmallKey: r.grantsSmallKey,
          grantsBossKey: r.grantsBossKey && r.role !== 'miniboss',
        };
      }

      // Enemies
      if (r.role === 'boss') {
        this.boss = new Enemy(this, this.cfg.bossId, cx, cy);
        this.enemies.push(this.boss);
        rt.enemies.push(this.boss);
      } else if (r.role === 'miniboss') {
        const mb = new Enemy(this, this.cfg.minions[1] ?? this.cfg.minions[0], cx, cy);
        mb.maxHp = Math.round(mb.maxHp * 2.1);
        mb.hp = mb.maxHp;
        mb.sprite.setScale(1.35);
        this.enemies.push(mb);
        rt.enemies.push(mb);
        for (let i = 0; i < 2; i++) {
          const ex = cx + (i === 0 ? -36 : 36);
          const esc = new Enemy(this, this.cfg.minions[0], ex, cy + 16);
          this.enemies.push(esc);
          rt.enemies.push(esc);
        }
      } else if (r.enemyCount > 0) {
        const offsets: Array<[number, number]> = [
          [-32, -16],
          [32, 16],
          [0, 24],
        ];
        for (let i = 0; i < r.enemyCount; i++) {
          const [dx, dy] = offsets[i % offsets.length];
          const mId = this.cfg.minions[i % this.cfg.minions.length];
          const en = new Enemy(this, mId, cx + dx, cy + dy);
          this.enemies.push(en);
          rt.enemies.push(en);
        }
      }

      this.wfcRooms.set(r.id, rt);
    }

    // Build doors between connected rooms
    for (const d of layout.doors) {
      const ra = roomById.get(d.a)!;
      const oax = (ra.gx - minGx) * WFC_ROOM_W;
      const oay = (ra.gy - minGy) * WFC_ROOM_H;

      const tiles: Array<{ tx: number; ty: number }> = [];
      if (d.dirFromA === DIR_EAST) {
        tiles.push({ tx: oax + WFC_ROOM_W - 1, ty: oay + 5 }, { tx: oax + WFC_ROOM_W - 1, ty: oay + 6 });
        tiles.push({ tx: oax + WFC_ROOM_W, ty: oay + 5 }, { tx: oax + WFC_ROOM_W, ty: oay + 6 });
      } else if (d.dirFromA === DIR_WEST) {
        tiles.push({ tx: oax, ty: oay + 5 }, { tx: oax, ty: oay + 6 });
        tiles.push({ tx: oax - 1, ty: oay + 5 }, { tx: oax - 1, ty: oay + 6 });
      } else if (d.dirFromA === DIR_SOUTH) {
        tiles.push({ tx: oax + 7, ty: oay + WFC_ROOM_H - 1 }, { tx: oax + 8, ty: oay + WFC_ROOM_H - 1 });
        tiles.push({ tx: oax + 7, ty: oay + WFC_ROOM_H }, { tx: oax + 8, ty: oay + WFC_ROOM_H });
      } else if (d.dirFromA === DIR_NORTH) {
        tiles.push({ tx: oax + 7, ty: oay }, { tx: oax + 8, ty: oay });
        tiles.push({ tx: oax + 7, ty: oay - 1 }, { tx: oax + 8, ty: oay - 1 });
      }

      const avgX = tiles.reduce((acc, t) => acc + t.tx * TILE_PX + 8, 0) / Math.max(1, tiles.length);
      const avgY = tiles.reduce((acc, t) => acc + t.ty * TILE_PX + 8, 0) / Math.max(1, tiles.length);
      const baseLock = d.lock === 'combat_seal' ? 'open' : d.lock;
      const doorObj: WfcDoorRuntime = {
        a: d.a,
        b: d.b,
        lock: baseLock,
        baseLock,
        opened: baseLock === 'open',
        tiles,
        sprites: [],
        x: avgX,
        y: avgY,
      };
      if (!doorObj.opened && baseLock !== 'open') {
        this.applyDoorLockVisuals(doorObj, baseLock);
      }
      this.wfcDoors.push(doorObj);
    }

    // Keep unused treasureChest sentinel initialized off-map for Void Spire compatibility
    this.treasureChest = { x: -9999, y: -9999, spr: this.add.sprite(-9999, -9999, 'objects/Chest_big', 0).setVisible(false), opened: true };
  }

  private applyDoorLockVisuals(door: WfcDoorRuntime, lockType: 'small_key' | 'boss_key' | 'combat_seal'): void {
    for (const s of door.sprites) s.destroy();
    door.sprites = [];
    door.opened = false;
    door.lock = lockType;
    const tint = lockType === 'boss_key' ? 0xd875ff : lockType === 'small_key' ? 0xffd95a : 0x9aa5b4;
    const stoneBlockFrame = 11 * 32 + 6;
    for (const t of door.tiles) {
      this.solidGrid[t.ty][t.tx] = true;
      const spr = this.add
        .image(t.tx * TILE_PX + 8, t.ty * TILE_PX + 8, 'cuterpg/dungeon', stoneBlockFrame)
        .setTint(tint)
        .setDepth(t.ty * TILE_PX + 8);
      door.sprites.push(spr);
    }
  }

  private openWfcDoor(door: WfcDoorRuntime, permanent = true): void {
    crumbleStoneBlocks(this, door.sprites, door.lock === 'boss_key' ? 0xd875ff : door.lock === 'small_key' ? 0xffd95a : 0xc9c2b8);
    door.sprites = [];
    door.opened = true;
    door.lock = 'open';
    if (permanent) door.baseLock = 'open';
    for (const t of door.tiles) {
      this.solidGrid[t.ty][t.tx] = false;
    }
  }

  private syncDungeonHud(): void {
    if (!this.wfcLayout) {
      this.hud.setDungeonHud(null);
      return;
    }
    const rm = this.wfcRooms.get(this.currentRoomId);
    const roleNames: Record<DungeonRoomPlan['role'], string> = {
      start: 'Entrance Hall',
      combat: 'Monster Chamber',
      puzzle: rm?.plan.puzzleKind === 'ambush' ? 'Ambush Trap' : 'Puzzle Chamber',
      key_puzzle: 'Key Vault (Puzzle)',
      key_combat: 'Key Vault',
      miniboss: 'Miniboss Arena',
      treasure: 'Treasure Vault',
      boss: 'Boss Lair',
    };
    this.hud.setDungeonHud({
      title: this.cfg.title,
      roomLabel: rm ? roleNames[rm.plan.role] : this.cfg.title,
      smallKeys: this.smallKeys,
      hasBossKey: this.hasBossKey,
      currentRoomId: this.currentRoomId,
      discoveredRoomIds: [...this.discoveredRooms],
      rooms: this.wfcLayout.rooms.map((r) => ({ id: r.id, gx: r.gx, gy: r.gy, role: r.role })),
      bounds: this.wfcLayout.graph.bounds,
    });
  }

  private setupInput(): void {
    this.input.addPointer(2);
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
        this.hud.closeModal();
      }
    });

    kb.on('keydown', (event: KeyboardEvent) => {
      if (event.key < '1' || event.key > '9') return;
      if (this.hud.isBlockingInput()) return;
      const idx = Number(event.key) - 1;
      if (gameState.selectedHotbarIndex !== idx) SFX.playHotbarSelect();
      gameState.selectedHotbarIndex = idx;
      this.hud.render();
    });

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
    if (itemId.startsWith('potion')) SFX.playDrinkPotion();
    else SFX.playEat();
    spawnBurstParticles(this, this.player.x, this.player.y - 6, 0x7ef59a, 6);
    gameState.emitVitals();
  }

  private spawnDrop(x: number, y: number, itemId: string, count: number, isCoin: boolean): void {
    const existing = this.drops.find(
      (d) => d.active && d.isCoin === isCoin && d.itemId === itemId && Math.hypot(d.x - x, d.y - y) <= 28,
    );
    if (existing) {
      existing.addCount(count);
      return;
    }
    this.drops.push(new LootDrop(this, x, y, itemId, count, isCoin));
  }

  private shatterBreakable(bp: DungeonProp, dirX = 0, dirY = 0): void {
    if (!bp.hit(1, dirX, dirY)) return;
    for (const d of bp.spec.drops) {
      if (Math.random() <= d.chance) {
        const count = Phaser.Math.Between(d.count[0], d.count[1]);
        this.spawnDrop(bp.x, bp.y, d.itemId, count, Boolean(d.isCoin));
      }
    }
  }

  private transitionToOverworld(): void {
    if (transitionManager.isActive) return;
    SFX.playPortalWarp();
    void transitionManager.transitionTo({
      onMidpoint: async () => {
        this.hud.setBossBar(null);
        this.hud.destroy();
        SFX.setMusicSituation('overworld');
        await startSceneAndWaitCreate(this, 'OverworldScene');
      },
    });
  }

  private tryInteractPortal(): boolean {
    if (this.nextFloorPortal && Math.hypot(this.nextFloorPortal.x - this.player.x, this.nextFloorPortal.y - this.player.y) <= 28) {
      if (transitionManager.isActive) return true;
      SFX.playPortalWarp();
      const nextFloor = this.voidFloor + 1;
      void transitionManager.transitionTo({
        onMidpoint: async () => {
          this.hud.setBossBar(null);
          this.hud.destroy();
          SFX.setMusicSituation('dungeon');
          await startSceneAndWaitCreate(this, 'DungeonScene', { dungeonId: 'void_spire', floor: nextFloor });
        },
      });
      return true;
    }
    if (this.returnPortal && Math.hypot(this.returnPortal.x - this.player.x, this.returnPortal.y - this.player.y) <= 28) {
      this.transitionToOverworld();
      return true;
    }
    if (Math.hypot(this.exitPortal.x - this.player.x, this.exitPortal.y - this.player.y) <= 28) {
      this.transitionToOverworld();
      return true;
    }
    // Check WFC doors
    for (const door of this.wfcDoors) {
      if (door.opened) continue;
      if (Math.hypot(door.x - this.player.x, door.y - this.player.y) <= 26) {
        if (door.lock === 'small_key') {
          if (this.smallKeys > 0) {
            this.smallKeys -= 1;
            this.openWfcDoor(door, true);
            SFX.playGateUnlock();
            spawnShockwaveRing(this, door.x, door.y, 0xffd95a, 34, 340);
            this.hud.showToast('Unlocked Door with Small Key!');
            this.syncDungeonHud();
          } else {
            this.hud.showToast('Locked — Find a Small Key!');
          }
          return true;
        }
        if (door.lock === 'boss_key') {
          if (this.hasBossKey) {
            this.openWfcDoor(door, true);
            SFX.playGateUnlock();
            this.cameraRig.addTrauma(0.28);
            spawnShockwaveRing(this, door.x, door.y, 0xd875ff, 44, 400);
            this.hud.showToast('Boss Door Unsealed!');
          } else {
            this.hud.showToast('Boss Door — Defeat the Miniboss for the Boss Key!');
          }
          return true;
        }
        if (door.lock === 'combat_seal') {
          this.hud.showToast('Room Sealed — Defeat all enemies to unlock!');
          return true;
        }
      }
    }
    // Check WFC room chests & braziers
    if (this.wfcLayout) {
      for (const rm of this.wfcRooms.values()) {
        if (rm.chest && !rm.chest.chest.opened && Math.hypot(rm.chest.chest.x - this.player.x, rm.chest.chest.y - this.player.y) <= 28) {
          const ch = rm.chest.chest;
          if (ch.locked || !rm.puzzleSolved) {
            this.hud.showToast('Chest Sealed — Solve the room puzzle first!');
            return true;
          }
          ch.playOpenJuice();
          this.cameraRig.zoomPunch(0.035, 110);
          this.spawnDrop(ch.x, ch.y + 10, 'coin', 30, true);
          for (const item of this.cfg.chestLoot) {
            this.spawnDrop(ch.x, ch.y + 10, item.itemId, 1, false);
          }
          if (rm.chest.grantsSmallKey) {
            rm.chest.grantsSmallKey = false;
            this.smallKeys += 1;
            SFX.playPickup();
            spawnFloatingText(this, ch.x, ch.y - 14, '+1 Small Key!', '#ffd95a', '9px');
            this.hud.showToast('Found a Small Key!');
            this.syncDungeonHud();
          } else {
            this.hud.showToast('Opened Dungeon Chest!');
          }
          return true;
        }
        for (const bz of rm.braziers) {
          if (!bz.lit && Math.hypot(bz.x - this.player.x, bz.y - this.player.y) <= 26) {
            this.igniteBrazier(rm, bz);
            return true;
          }
        }
      }
    }
    if (
      !this.treasureChest.opened &&
      Math.hypot(this.treasureChest.x - this.player.x, this.treasureChest.y - this.player.y) <= 28
    ) {
      this.treasureChest.opened = true;
      this.treasureChest.spr.play('prop_chest_big_open');
      SFX.playChestOpen();
      spawnSparklers(this, this.treasureChest.x, this.treasureChest.y - 4, 16);
      this.spawnDrop(this.treasureChest.x, this.treasureChest.y + 10, 'coin', 45, true);
      for (const item of this.cfg.chestLoot) {
        this.spawnDrop(this.treasureChest.x, this.treasureChest.y + 10, item.itemId, item.count, false);
      }
      this.hud.showToast('Opened Dungeon Treasure Chest!');
      return true;
    }
    return false;
  }

  private getSwordCombatCandidates(): Array<SwordAutoTargetCandidate<Enemy>> {
    const candidates: Array<SwordAutoTargetCandidate<Enemy>> = [];
    for (const e of this.enemies) {
      if (e.active && !e.isDead && !(e === this.boss && !this.gateOpen)) {
        candidates.push({ item: e, x: e.x, y: e.y, priority: 3 });
      }
    }
    return candidates;
  }

  private handleAttack(wx: number, wy: number): void {
    const itemId = gameState.hotbar[gameState.selectedHotbarIndex] || 'sword';
    const def = ITEMS[itemId];
    const swordAuto =
      def && isSwordItem(itemId)
        ? this.swordTargeter.resolve(
            this.player.x,
            this.player.y,
            (def.range ?? 40) + 10,
            this.getSwordCombatCandidates(),
            false,
          )
        : null;
    if (!swordAuto && this.tryInteractPortal()) return;
    if (!def) return;
    const dx = wx - this.player.x;
    const dy = wy - this.player.y;

    if (def.healHp || def.healEnergy) {
      if ((gameState.inventory[itemId] ?? 0) <= 0) return;
      if (!this.player.startAction('melee', 260, dx, dy, 180)) return;
      this.tryConsumeItem(itemId);
      return;
    }

    if (def.category === 'gadget') {
      tryActivateGadget(
        {
          scene: this,
          player: this.player,
          enemies: this.enemies,
          isWalkable: (x, y) => this.isWalkable(x, y),
          onDamageEnemy: (e, dmg, dx, dy) => this.damageEnemy(e, dmg, dx, dy),
          showToast: (m) => this.hud.showToast(m),
        },
        itemId,
        wx,
        wy,
      );
      return;
    }

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
      if (itemId === 'bow') SFX.playBowShoot();
      else SFX.playCast();
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

    const range = def.range ?? 40;
    if (swordAuto) {
      const aimNx = swordAuto.dirX ?? nx;
      const aimNy = swordAuto.dirY ?? ny;
      if (!this.player.startAction('melee', def.cooldownMs ?? 260, aimNx, aimNy, 170)) return;
      this.swordTargeter.lock(swordAuto.item);
      drawSlashArc(this, this.player.x, this.player.y - 4, Math.atan2(aimNy, aimNx), range, getWeaponSlashColor(itemId));
      SFX.playSwing();
      for (const rm of this.wfcRooms.values()) {
        for (const bz of rm.braziers) {
          if (!bz.lit && Math.hypot(bz.x - this.player.x, bz.y - this.player.y) <= range + 10) {
            this.igniteBrazier(rm, bz);
          }
        }
      }
      this.damageEnemy(swordAuto.item, gameState.getWeaponDamage(itemId), aimNx, aimNy);
      return;
    }

    if (!this.player.startAction('melee', def.cooldownMs ?? 260, nx, ny, 170)) return;
    drawSlashArc(this, this.player.x, this.player.y - 4, Math.atan2(ny, nx), range, getWeaponSlashColor(itemId));
    SFX.playSwing();

    const dmg = gameState.getWeaponDamage(itemId);
    type DngTarget = { kind: 'enemy'; enemy: Enemy } | { kind: 'breakable'; bp: DungeonProp };
    const candidates: Array<AimCandidate<DngTarget>> = [];
    for (const e of this.enemies) {
      if (e.active && !e.isDead) {
        candidates.push({ item: { kind: 'enemy', enemy: e }, x: e.x, y: e.y, priority: 3 });
      }
    }
    for (const bp of this.breakables) {
      if (!bp.broken) {
        candidates.push({ item: { kind: 'breakable', bp }, x: bp.x, y: bp.y, priority: 2 });
      }
    }
    const aimed = selectBestAimTarget(this.player.x, this.player.y, nx, ny, range + 10, candidates);
    // Also ignite any unlit brazier within melee swing range
    for (const rm of this.wfcRooms.values()) {
      for (const bz of rm.braziers) {
        if (!bz.lit && Math.hypot(bz.x - this.player.x, bz.y - this.player.y) <= range + 10) {
          this.igniteBrazier(rm, bz);
        }
      }
    }
    if (aimed?.item.kind === 'breakable') {
      this.shatterBreakable(aimed.item.bp, nx, ny);
    } else if (aimed?.item.kind === 'enemy') {
      if (!itemId.startsWith('sword')) {
        if (SFX.canPlay('needSwordHint', 750)) {
          spawnFloatingText(this, aimed.item.enemy.x, aimed.item.enemy.y - 16, 'Use Sword!', '#ffbe76');
        }
      } else {
        this.damageEnemy(aimed.item.enemy, dmg, nx, ny);
      }
    }
  }

  private damageEnemy(enemy: Enemy, baseDmg: number, dirX: number, dirY: number): void {
    const crit = Math.random() < gameState.getCritChance(this.player.dodgeMomentumMs > 0 ? 15 : 0);
    const scale = gameState.getDamageScaleVsEnemy(enemy.def.level);
    const rawDmg = crit ? Math.round(baseDmg * 2) : baseDmg;
    const dmg = Math.max(1, Math.round(rawDmg * scale.dealMult));
    this.cameraRig.kick(dirX, dirY, crit ? 3.5 : 2.2, 80);
    if (crit) {
      this.fx.play('crit_strike', { x: enemy.x, y: enemy.y - 4 });
      this.hud.triggerPortraitMood('angry', 1500);
    } else {
      SFX.playHit();
      this.cameraRig.addTrauma(0.14);
    }
    spawnDirectionalSparks(this, enemy.x, enemy.y - 4, Math.atan2(dirY, dirX), crit ? 0xffe066 : 0xffffff, crit ? 9 : 5);
    spawnFloatingText(
      this,
      enemy.x,
      enemy.y - 16,
      crit ? `${dmg}!` : `${dmg}`,
      crit ? '#ffe066' : '#ffffff',
      crit ? '10px' : '8px',
      crit ? 'crit' : 'damage',
    );
    spawnBurstParticles(this, enemy.x, enemy.y - 4, 0xff6b6b, crit ? 8 : 5);

    const killed = enemy.takeDamage(dmg, dirX, dirY, this.isWalkable);
    const stopMs = killed ? 70 : crit ? 55 : 35;
    this.player.applyHitstop(stopMs);
    if (!killed) enemy.applyHitstop(stopMs);

    // Boss Enrage Phase 2 below 50% HP
    if (!killed && enemy === this.boss && !this.bossEnraged && enemy.hp <= enemy.maxHp * 0.5) {
      this.bossEnraged = true;
      SFX.playBossEnrage();
      spawnShockwaveRing(this, enemy.x, enemy.y - 4, 0xff5e6c, 54, 380);
      this.cameraRig.addTrauma(0.45);
      this.cameraRig.zoomPunch(0.05, 110);
      enemy.sprite.setTint(0xff8a8a);
      this.hud.showToast(`${enemy.def.name} ENRAGED! Phase 2!`);
      const proj = enemy.def.projectileKey ?? 'monster_projectiles/FireballBig';
      for (let i = 0; i < 10; i++) {
        const ang = (Math.PI * 2 * i) / 10;
        const spr = this.add.image(enemy.x, enemy.y - 4, proj).setRotation(ang).setDepth(5000);
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
      spawnDeathBurst(this, enemy.x, enemy.y, enemy.def.id, enemy === this.boss);
      if (enemy !== this.boss) SFX.playEnemyDeath();
      gameState.recordQuestProgress('kill', enemy.def.id, 1);
      const bpName = tryUnlockBlueprintFromPool(
        getBlueprintsForMonster(enemy.def.id, enemy === this.boss),
        enemy === this.boss ? 1.0 : 0.22,
      );
      if (bpName) {
        this.hud.showToast(`BLUEPRINT UNLOCKED: ${bpName}!`);
      }
      this.spawnDrop(enemy.x, enemy.y, 'coin', Phaser.Math.Between(enemy.def.coins[0], enemy.def.coins[1]), true);
      for (const d of enemy.def.drops) {
        if (Math.random() <= d.chance) {
          this.spawnDrop(enemy.x, enemy.y, d.itemId, d.count, false);
        }
      }
      spawnFloatingText(this, this.player.x, this.player.y - 18, `+${enemy.def.xp} XP`, '#7ef5ff', '8px', 'xp');
      gameState.addXp(enemy.def.xp);

      if (enemy === this.boss && !this.relicSpawned) {
        this.relicSpawned = true;
        this.fx.play('boss_defeat', { x: enemy.x, y: enemy.y - 4 });
        this.cameraRig.zoomPunch(0.05, 150);
        this.hud.setBossBar(null);
        if (this.cfg.id === 'void_spire') {
          gameState.voidSpireHighestFloor = Math.max(gameState.voidSpireHighestFloor, this.voidFloor);
          if (this.voidFloor >= 15 && !gameState.isGearOwned('void_rod')) {
            gameState.addItem('void_rod', 1);
            this.hud.showToast(`FLOOR ${this.voidFloor} CLEARED! Unlocked Void Singularity Rod!`);
          } else if (this.voidFloor >= 20 && !gameState.finalBossDefeated) {
            gameState.finalBossDefeated = true;
            this.hud.showToast('OBSIDIAN SOVEREIGN DEFEATED! GRAND VICTORY UNLOCKED!');
          } else {
            this.hud.showToast(`Floor ${this.voidFloor} Cleared! Enter Next Floor Portal ->`);
          }
          const nx = 29 * TILE_PX + 8;
          const ny = 8 * TILE_PX;
          const ring = this.add.circle(0, 0, 12, 0x6ce5ff, 0.35).setStrokeStyle(2, 0xbef8ff, 0.9);
          const lbl = this.add
            .text(0, -17, fmtKeyPrompt('E', `Floor ${this.voidFloor + 1}`), {
              fontSize: '7px',
              fontStyle: 'bold',
              color: '#8ef5ff',
              stroke: '#000',
              strokeThickness: 2,
              resolution: 4,
            })
            .setOrigin(0.5);
          this.nextFloorPortal = this.add.container(nx, ny, [ring, lbl]).setDepth(4500);
        } else {
          gameState.clearedDungeons.add(this.cfg.id);
          gameState.addItem(this.cfg.relicId, 1);
          const relicDef = ITEMS[this.cfg.relicId];
          this.hud.showToast(`BOSS DEFEATED! Unlocked ${relicDef.name}!`);
          revealSequence.show({
            title: 'RELIC UNLOCKED!',
            subtitle: `${relicDef.name} — ${this.cfg.title} Cleared!`,
            iconKey: relicDef.iconKey,
            accentColor: '#c07dff',
          });
          if (this.wfcLayout) {
            const rx = enemy.x;
            const ry = enemy.y - 16;
            this.returnPortal = { x: rx, y: ry };
            this.add.circle(rx, ry, 11, 0x7ef29d, 0.35).setStrokeStyle(2, 0xbef8ff, 0.9).setDepth(4500);
            this.add
              .text(rx, ry - 16, fmtKeyPrompt('E', 'Return to Surface'), {
                fontSize: '7px',
                fontStyle: 'bold',
                color: '#9ee6ff',
                stroke: '#000',
                strokeThickness: 2,
                resolution: 4,
              })
              .setOrigin(0.5)
              .setDepth(7000);
          }
        }
        SFX.playBossDefeat();
        SFX.playStinger(
          this.cfg.id === 'void_spire' && this.voidFloor >= 20 ? 'grand_victory' : 'dungeon_clear',
        );
        SFX.setMusicSituation('dungeon');
        gameState.save();
      }
    }
  }

  private updateWfcDungeonState(dtMs: number): void {
    if (!this.wfcLayout) return;
    const { minGx, minGy } = this.wfcLayout.graph.bounds;
    const rx = Math.floor(this.player.x / (WFC_ROOM_W * TILE_PX)) + minGx;
    const ry = Math.floor(this.player.y / (WFC_ROOM_H * TILE_PX)) + minGy;
    let enteredRm: WfcRoomRuntime | undefined;
    for (const rm of this.wfcRooms.values()) {
      if (rm.plan.gx === rx && rm.plan.gy === ry) {
        enteredRm = rm;
        break;
      }
    }
    if (enteredRm && enteredRm.plan.id !== this.currentRoomId) {
      this.currentRoomId = enteredRm.plan.id;
      this.discoveredRooms.add(enteredRm.plan.id);
      if (enteredRm.fogOverlay) {
        const shroud = enteredRm.fogOverlay;
        enteredRm.fogOverlay = undefined;
        this.tweens.add({
          targets: shroud,
          alpha: 0,
          duration: 320,
          ease: 'Quad.Out',
          onComplete: () => shroud.destroy(),
        });
      }
      this.syncDungeonHud();
    }

    // Check sigils, chests, & combat lock-in / clear
    for (const rm of this.wfcRooms.values()) {
      rm.chest?.chest.update(dtMs);
      if (rm.sigils.length > 0 && !rm.puzzleSolved) {
        for (const sw of rm.sigils) {
          if (!sw.active && Math.hypot(sw.x - this.player.x, sw.y - this.player.y) <= 13) {
            sw.active = true;
            sw.spr.setTexture('ui_icons/sigil_on');
            SFX.playSwitch();
            spawnShockwaveRing(this, sw.x, sw.y, 0x7ac7ff, 22, 260);
          }
        }
        if (rm.sigils.every((s) => s.active)) {
          rm.puzzleSolved = true;
          if (rm.chest) {
            const chestRef = rm.chest.chest;
            this.cameraRig.focusOn(chestRef.x, chestRef.y, this.player, {
              onArrive: () => {
                chestRef.unlock();
                SFX.playSecretJingle();
                this.cameraRig.zoomPunch(0.04, 110);
                this.hud.showToast('Sigils Activated! Chamber Chest Unsealed!');
              },
            });
          } else {
            SFX.playSecretJingle();
            this.hud.showToast('Sigils Activated!');
          }
        }
      }

      // Ambush / Miniboss / Boss lock-in when player steps inside room interior
      if (rm.plan.lockOnClear && !rm.cleared && !rm.ambushTriggered) {
        const halfW = (WFC_ROOM_W * TILE_PX) * 0.5 - 22;
        const halfH = (WFC_ROOM_H * TILE_PX) * 0.5 - 22;
        if (Math.abs(this.player.x - rm.cx) <= halfW && Math.abs(this.player.y - rm.cy) <= halfH) {
          rm.ambushTriggered = true;
          for (const d of this.wfcDoors) {
            if ((d.a === rm.plan.id || d.b === rm.plan.id) && d.opened) {
              this.applyDoorLockVisuals(d, 'combat_seal');
              spawnBurstParticles(this, d.x, d.y, 0x9aa5b4, 6);
            }
          }
          SFX.playGateUnlock();
          this.cameraRig.addTrauma(0.22);
          this.hud.showToast(
            rm.plan.role === 'miniboss'
              ? 'Miniboss Ambush! Doors sealed!'
              : rm.plan.role === 'boss'
                ? 'Boss Arena Sealed!'
                : 'Ambush! Defeat all monsters to unlock!',
          );
        }
      }

      // Check room cleared
      if (!rm.cleared && rm.enemies.length > 0 && rm.enemies.every((e) => !e.active || e.isDead)) {
        rm.cleared = true;
        for (const d of this.wfcDoors) {
          if ((d.a === rm.plan.id || d.b === rm.plan.id) && d.lock === 'combat_seal') {
            this.openWfcDoor(d, false);
          }
        }
        SFX.playGateUnlock();
        if (rm.plan.grantsBossKey && !this.hasBossKey) {
          this.hasBossKey = true;
          SFX.playLevelUp();
          spawnFloatingText(this, this.player.x, this.player.y - 18, '+1 BOSS KEY!', '#d875ff', '10px');
          revealSequence.show({
            title: 'BOSS KEY OBTAINED!',
            subtitle: 'Seek the purple Boss Door to face the Guardian',
            badgeText: '🗝️',
            accentColor: '#d875ff',
          });
          this.syncDungeonHud();
        } else if (rm.plan.grantsSmallKey && !rm.plan.hasTreasureChest) {
          this.smallKeys += 1;
          SFX.playPickup();
          spawnFloatingText(this, this.player.x, this.player.y - 18, '+1 Small Key!', '#ffd95a', '9px');
          this.hud.showToast('Room Cleared! Found a Small Key!');
          this.syncDungeonHud();
        } else if (rm.ambushTriggered && rm.plan.role !== 'boss') {
          this.hud.showToast('Room Cleared! Doors Unlocked!');
        }
      }
    }
  }

  private igniteBrazier(rm: WfcRoomRuntime, bz: WfcBrazierRuntime): void {
    if (bz.lit) return;
    bz.lit = true;
    bz.spr.clearTint().setAlpha(1);
    if (this.anims.exists('prop_bonfire')) {
      const animSpr = this.add.sprite(bz.x, bz.y, 'extras/Bonfire', 0).setDepth(bz.y + 1);
      animSpr.play('prop_bonfire');
      bz.spr.setVisible(false);
    }
    SFX.playSwitch();
    spawnBurstParticles(this, bz.x, bz.y - 4, 0xffaa44, 8);
    if (!rm.puzzleSolved && rm.braziers.every((b) => b.lit)) {
      rm.puzzleSolved = true;
      if (rm.chest) {
        const chestRef = rm.chest.chest;
        this.cameraRig.focusOn(chestRef.x, chestRef.y, this.player, {
          onArrive: () => {
            chestRef.unlock();
            SFX.playSecretJingle();
            this.cameraRig.zoomPunch(0.04, 110);
            this.hud.showToast('Braziers Lit! Chamber Chest Unsealed!');
          },
        });
      } else {
        SFX.playSecretJingle();
        this.hud.showToast('Braziers Lit!');
      }
    }
  }

  private isWalkable = (wx: number, wy: number): boolean => {
    const tx = Math.floor(wx / TILE_PX);
    const ty = Math.floor(wy / TILE_PX);
    if (this.wfcLayout) {
      if (tx < 0 || ty < 0 || tx >= this.worldTilesW || ty >= this.worldTilesH) return false;
      if (this.solidGrid[ty][tx]) return false;
      for (const pil of this.pillarObstacles) {
        if (Math.hypot(wx - pil.x, wy - pil.y) < 9) return false;
      }
      for (const bp of this.breakables) {
        if (!bp.broken && Math.hypot(wx - bp.x, wy - bp.y) < bp.collisionRadius) return false;
      }
      for (const rm of this.wfcRooms.values()) {
        if (rm.chest && Math.hypot(wx - rm.chest.chest.x, wy - rm.chest.chest.y) < rm.chest.chest.collisionRadius) {
          return false;
        }
      }
      return true;
    }
    if (tx <= 0 || ty <= 0 || tx >= ROOM_W - 1 || ty >= ROOM_H - 1) return false;
    if (tx === 10 && (ty < 6 || ty > 9)) return false;
    if (tx === 20 && (ty < 6 || ty > 9)) return false;
    if (!this.gateOpen && tx === 20 && ty >= 6 && ty <= 9) return false;
    for (const bp of this.breakables) {
      if (!bp.broken && Math.hypot(wx - bp.x, wy - bp.y) < bp.collisionRadius) return false;
    }
    return true;
  };

  update(_time: number, dtMs: number): void {
    if (transitionManager.isActive) return;
    const dt = Math.min(dtMs, 50);
    this.promoTimeline?.update(dt * (this.time.timeScale || 1));

    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) {
      this.tryInteractPortal();
    }

    if (!this.hud.isBlockingInput() && !this.cameraRig.isFocusing()) {
      const tv = this.hud.getTouchMoveVector();
      const dir = new Phaser.Math.Vector2(
        (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0) -
          (this.keys.A.isDown || this.keys.LEFT.isDown ? 1 : 0) +
          tv.x,
        (this.keys.S.isDown || this.keys.DOWN.isDown ? 1 : 0) -
          (this.keys.W.isDown || this.keys.UP.isDown ? 1 : 0) +
          tv.y,
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
      this.player.updatePlayer(dt, dir, this.isWalkable, 1, 0xa8a8b8, 'stone');
      if (dir.lengthSq() > 0.01 || this.player.isDashing) {
        this.swordTargeter.onPlayerMoved();
      }
      if (dir.lengthSq() > 0.01) {
        this.cameraRig.setLookAhead(dir.x, dir.y, 12);
      } else {
        const fMap = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] } as const;
        const [fx, fy] = fMap[this.player.facing];
        this.cameraRig.setLookAhead(fx, fy, 8);
      }
      this.cameraRig.update(dt);
      if (this.fox) {
        this.fox.updateCompanion(dt, this.player.x, this.player.y, {
          findTarget: () => {
            let best: Enemy | null = null;
            let bestD = 135;
            for (const e of this.enemies) {
              if (!e.active || e.isDead || (e === this.boss && !this.gateOpen)) continue;
              const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
              if (d < bestD) {
                bestD = d;
                best = e;
              }
            }
            return best ? { x: best.x, y: best.y } : null;
          },
          onBite: (fx, fy, dmg, meta) => {
            const target = this.enemies.find(
              (e) => e.active && !e.isDead && Math.hypot(e.x - fx, e.y - fy) <= 22,
            );
            if (target) {
              spawnBurstParticles(this, target.x, target.y - 4, 0xffaa44, meta?.isSlam ? 9 : 5);
              const nx = (target.x - this.fox!.x) / (Math.hypot(target.x - this.fox!.x, target.y - this.fox!.y) || 1);
              const ny = (target.y - this.fox!.y) / (Math.hypot(target.x - this.fox!.x, target.y - this.fox!.y) || 1);
              this.damageEnemy(target, dmg, nx, ny);
              if (meta?.isCrit && gameState.hasSkill('fam_bm_t6')) {
                gameState.hp = Math.min(gameState.getMaxHp(), gameState.hp + 3);
              }
              if (meta?.isSlam) {
                for (const e of this.enemies) {
                  if (!e.active || e.isDead || e === target) continue;
                  if (Math.hypot(e.x - fx, e.y - fy) <= 48) {
                    this.damageEnemy(e, Math.round(dmg * 0.7), nx, ny);
                  }
                }
              }
            }
          },
          onRangedBolt: (fromX, fromY, target, meta) => {
            const baseAng = Math.atan2(target.y - fromY, target.x - fromX);
            const count = Math.max(1, meta.count);
            const spread = count > 1 ? 0.22 : 0;
            const tex = this.textures.exists('projectiles/FaerieBall') ? 'projectiles/FaerieBall' : 'projectiles/Arrow';
            const speed = gameState.hasSkill('fam_so_t4') ? 210 : 165;
            for (let i = 0; i < count; i++) {
              const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
              const ang = baseAng + offset;
              const spr = this.add
                .image(fromX, fromY, tex)
                .setRotation(ang)
                .setTint(meta.tint)
                .setScale(meta.isNova ? 1.35 : 0.9)
                .setDepth(5000);
              this.projectiles.push({
                sprite: spr,
                vx: Math.cos(ang) * speed,
                vy: Math.sin(ang) * speed,
                damage: meta.damage,
                fromPlayer: true,
                lifeMs: 1100,
                kind: gameState.heroClass === 'Swashbuckler' ? 'arrow' : 'thunder',
              });
            }
          },
        });
      }
      const ptr = this.input.activePointer;
      if (ptr.leftButtonDown() && !(ptr.event && ptr.event.target !== this.game.canvas)) {
        const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
        this.handleAttack(wp.x, wp.y);
      }
    }

    const curItem = gameState.hotbar[gameState.selectedHotbarIndex] || 'sword';
    if (!isSwordItem(curItem)) {
      this.swordTargeter.clear();
      this.targetIndicator?.setVisible(false);
    } else if (this.hud.isBlockingInput()) {
      this.targetIndicator?.setVisible(false);
    } else if (this.targetIndicator) {
      const swordAuto = this.swordTargeter.resolve(
        this.player.x,
        this.player.y,
        (ITEMS[curItem]?.range ?? 40) + 10,
        this.getSwordCombatCandidates(),
        false,
      );
      if (swordAuto) {
        this.targetIndicator
          .setPosition(swordAuto.x, swordAuto.y)
          .setDepth(swordAuto.item.depth - 0.5)
          .setStrokeStyle(swordAuto.locked ? 1.8 : 1.4, swordAuto.locked ? 0xff4757 : 0xff6b6b, swordAuto.locked ? 0.95 : 0.9)
          .setFillStyle(swordAuto.locked ? 0xff4757 : 0xff6b6b, swordAuto.locked ? 0.2 : 0.14)
          .setVisible(true);
      } else {
        this.targetIndicator.setVisible(false);
      }
    }

    // Check Floor Puzzle Sigils in Room 2 (Void Spire) or WFC rooms
    if (!this.wfcLayout && !this.gateOpen) {
      for (const sw of this.switches) {
        if (!sw.active && Math.hypot(sw.x - this.player.x, sw.y - this.player.y) <= 13) {
          sw.active = true;
          sw.spr.setTexture('ui_icons/sigil_on');
          SFX.playSwitch();
          spawnShockwaveRing(this, sw.x, sw.y, 0x7ac7ff, 22, 260);
        }
      }
      if (this.switches.every((s) => s.active)) {
        this.gateOpen = true;
        (this.bossGateGroup as Phaser.GameObjects.Group | undefined)?.clear(true, true);
        SFX.playGateUnlock();
        this.cameraRig.addTrauma(0.32);
        this.cameraRig.zoomPunch(0.05, 110);
        spawnShockwaveRing(this, 20 * TILE_PX + 8, 7.5 * TILE_PX, 0xffe066, 48, 420);
        this.hud.showToast('Boss Gate Unsealed!');
      }
    }

    if (this.wfcLayout) {
      this.updateWfcDungeonState(dt);
    }

    // Update Boss Bar if in Boss Room
    const inBossRoom = this.wfcLayout
      ? this.currentRoomId === this.wfcLayout.bossRoomId
      : this.player.x > 20 * TILE_PX;
    if (this.boss && !this.boss.isDead && inBossRoom) {
      SFX.setMusicContext({
        dungeonId: this.cfg.id,
        floor: this.voidFloor,
        isFinalBoss: this.cfg.id === 'void_spire' && this.voidFloor >= 20,
      });
      SFX.setMusicSituation('boss');
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
      if (!this.wfcLayout && e === this.boss && !this.gateOpen) continue;
      if (this.wfcLayout && e === this.boss && this.currentRoomId !== this.wfcLayout.bossRoomId) continue;

      const enemyWalkable = (wx: number, wy: number): boolean => {
        if (!this.isWalkable(wx, wy)) return false;
        if (!this.wfcLayout) return true;
        const { minGx, minGy } = this.wfcLayout.graph.bounds;
        const rx = Math.floor(e.x / (WFC_ROOM_W * TILE_PX)) + minGx;
        const ry = Math.floor(e.y / (WFC_ROOM_H * TILE_PX)) + minGy;
        const ox = (rx - minGx) * WFC_ROOM_W;
        const oy = (ry - minGy) * WFC_ROOM_H;
        const tx = Math.floor(wx / TILE_PX);
        const ty = Math.floor(wy / TILE_PX);
        return tx >= ox + 1 && tx <= ox + WFC_ROOM_W - 2 && ty >= oy + 1 && ty <= oy + WFC_ROOM_H - 2;
      };

      e.updateEnemy(this.bossEnraged && e === this.boss ? dt * 1.35 : dt, this.player.x, this.player.y, enemyWalkable, {
        onMeleeHitPlayer: (dmg, dx, dy) => {
          if (this.player.takeDamage(dmg, dx, dy, this.isWalkable)) {
            spawnFloatingText(this, this.player.x, this.player.y - 14, `-${dmg}`, '#ff5e6c');
            if (gameState.hp <= 0) {
              SFX.playStinger('defeat');
              gameState.hp = Math.round(gameState.getMaxHp() * 0.6);
              this.transitionToOverworld();
            }
          }
        },
        onFireProjectile: (px, py, vx, vy, dmg, texKey) => {
          const spr = this.add.image(px, py, texKey).setRotation(Math.atan2(vy, vx)).setDepth(5000);
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
              SFX.playStinger('defeat');
              gameState.hp = Math.round(gameState.getMaxHp() * 0.6);
              this.transitionToOverworld();
              return;
            }
          }
          hit = true;
        }
      }

      if (hit || p.lifeMs <= 0) {
        if (hit) {
          spawnProjectileImpact(this, p.sprite.x, p.sprite.y, p.kind);
        }
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

    // Proximity exit glow + action button indicator (no green box outside tutorial)
    const nearExit = Math.hypot(this.exitPortal.x - this.player.x, this.exitPortal.y - this.player.y) <= 28;
    const nearReturn =
      this.returnPortal !== undefined &&
      Math.hypot(this.returnPortal.x - this.player.x, this.returnPortal.y - this.player.y) <= 28;
    const nearNextFloor =
      this.nextFloorPortal !== undefined &&
      Math.hypot(this.nextFloorPortal.x - this.player.x, this.nextFloorPortal.y - this.player.y) <= 28;
    this.exitPortal.glow
      .setFillStyle(0x7ef29d, nearExit ? 0.58 : 0.22)
      .setScale(nearExit ? 1.25 : 1);

    let actHint: string | null = null;
    if (nearExit || nearReturn) {
      actHint = 'EXIT';
    } else if (nearNextFloor) {
      actHint = 'NEXT';
    } else {
      for (const door of this.wfcDoors) {
        if (!door.opened && Math.hypot(door.x - this.player.x, door.y - this.player.y) <= 26) {
          if (door.lock === 'small_key') actHint = this.smallKeys > 0 ? 'UNLOCK' : 'LOCKED';
          else if (door.lock === 'boss_key') actHint = this.hasBossKey ? 'UNLOCK' : 'LOCKED';
          else if (door.lock === 'combat_seal') actHint = 'SEALED';
          break;
        }
      }
      if (!actHint) {
        for (const rm of this.wfcRooms.values()) {
          if (rm.chest && !rm.chest.chest.opened && Math.hypot(rm.chest.chest.x - this.player.x, rm.chest.chest.y - this.player.y) <= 28) {
            actHint = rm.chest.chest.locked ? 'SEALED' : 'OPEN';
            break;
          }
          if (rm.braziers.some((bz) => !bz.lit && Math.hypot(bz.x - this.player.x, bz.y - this.player.y) <= 26)) {
            actHint = 'LIGHT';
            break;
          }
        }
      }
    }
    this.hud.setTouchActionHint(actHint);

    // Dark dungeon lighting + flickering torch point lights + exit glow + floating dust motes
    const lights: PointLightSource[] = [
      { x: this.player.x, y: this.player.y - 4, radius: 34, color: 0xffe4aa, intensity: 0.72 },
      {
        x: this.exitPortal.sprX,
        y: this.exitPortal.sprY + 4,
        radius: nearExit ? 48 : 26,
        color: 0x7ef29d,
        intensity: nearExit ? 1 : 0.78,
        flicker: true,
      },
      ...this.torchLights,
    ];
    for (const rm of this.wfcRooms.values()) {
      for (const bz of rm.braziers) {
        if (bz.lit) lights.push({ x: bz.x, y: bz.y, radius: 48, color: 0xff9844, intensity: 1, flicker: true });
      }
      for (const sw of rm.sigils) {
        if (sw.active) lights.push({ x: sw.x, y: sw.y, radius: 24, color: 0x6ce5ff, intensity: 0.85 });
      }
      if (rm.chest && !rm.chest.chest.opened && !rm.chest.chest.locked) {
        lights.push({ x: rm.chest.chest.x, y: rm.chest.chest.y, radius: 26, color: 0xffe066, intensity: 0.8 });
      }
    }

    // Subtle rising ember specks from nearby wall torches
    this.torchEmberTimerMs -= dt;
    if (this.torchEmberTimerMs <= 0 && this.torchPositions.length > 0) {
      this.torchEmberTimerMs = 260;
      const view = this.cameras.main.worldView;
      for (const tp of this.torchPositions) {
        if (tp.x < view.x - 16 || tp.x > view.right + 16 || tp.y < view.y - 16 || tp.y > view.bottom + 16) continue;
        if (Math.random() > 0.45) continue;
        const ember = this.add
          .rectangle(tp.x + (Math.random() - 0.5) * 4, tp.y, 1.5, 1.5, 0xffb85c, 0.9)
          .setDepth(tp.y + 4);
        this.tweens.add({
          targets: ember,
          y: tp.y - 10 - Math.random() * 6,
          x: ember.x + (Math.random() - 0.5) * 5,
          alpha: 0,
          duration: 520,
          ease: 'Quad.Out',
          onComplete: () => ember.destroy(),
        });
      }
    }
    this.lighting.update(dt, lights, []);
    this.atmosphere.update(dt);
  }
}
