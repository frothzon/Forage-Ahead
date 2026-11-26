import Phaser from 'phaser';
import { gamepadManager } from '../core/GamepadManager';
import { onSettingsChange, settingsStore } from '../core/GameSettings';
import { gameState } from '../core/GameState';
import { computeResponsiveZoom } from '../core/ViewportScaler';
import { fmtKeyPrompt } from '../core/Platform';
import { SFX } from '../core/SoundFX';
import { startSceneAndWaitCreate, transitionManager } from '../core/TransitionManager';
import {
  buildDungeonLayout,
  type DungeonLayout,
  type DungeonPuzzleKind,
  type DungeonRoomPlan,
  type ExitWallDir,
} from '../world/DungeonLayoutBuilder';
import { getBombSpec, isBombItem, type BombSpec } from '../world/bombRules';
import { DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST } from '../world/WfcRoomGraph';
import { ITEMS } from '../data/items';
import { COMBAT_XP_MULT, getVoidSpireXpMultiplier } from '../data/economy';
import { ELITE_SPAWN_CHANCE, computeEliteStats, rollEliteDrops } from '../data/eliteLoot';
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
import {
  attachProjectileGlow,
  computeChainLightningDamage,
  drawLightningArc,
  spawnFuseSparks,
  spawnMaxBombExplosionJuice,
  spawnRodImpactJuice,
  spawnRodMuzzleJuice,
  spawnRodTrailParticle,
  type RodVfxKind,
} from '../vfx/RodAndBombJuice';
import { detailDungeonRoom } from '../world/DungeonDetailer';
import { LightingSystem, type PointLightSource } from '../world/LightingSystem';
import { Enemy } from '../entities/Enemy';
import { LootDrop } from '../entities/LootDrop';
import { FamiliarCompanion, Player } from '../entities/Player';
import {
  getProjectileRotation,
  isSwordItem,
  selectBestAimTarget,
  SwordAutoTargeter,
  type AimCandidate,
  type SwordAutoTargetCandidate,
} from '../entities/targeting';
import { dialogueBox } from '../ui/DialogueBox';
import { HudController } from '../ui/HudController';
import { LockpickMinigame } from '../ui/LockpickMinigame';
import { revealSequence } from '../ui/RevealSequence';
import { createDungeonPromoTimeline, getPromoConfig, markPromoReady, type PromoTimeline } from '../promo/PromoDirector';
import { buildBaseSnapshot, getQaConfig, isQaMode, markQaReady, registerQaApi } from '../qa/QaDirector';

interface SceneProjectile extends ActiveProjectile {
  glow?: Phaser.GameObjects.Image;
}

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
  flameSpr?: Phaser.GameObjects.Sprite;
  lit: boolean;
}

interface WfcPuzzleSigil {
  x: number;
  y: number;
  spr: Phaser.GameObjects.Image;
  active: boolean;
  label?: Phaser.GameObjects.Text;
  ring?: Phaser.GameObjects.Arc;
  color?: number;
  isCenterSeal?: boolean;
}

interface WfcPushBlock {
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  spr: Phaser.GameObjects.Image;
  ice: boolean;
  vx: number;
  vy: number;
  locked: boolean;
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
  sigils: WfcPuzzleSigil[];
  braziers: WfcBrazierRuntime[];
  fogOverlay?: Phaser.GameObjects.Rectangle;
  puzzleHint?: Phaser.GameObjects.Text;
  orderedIdx: number;
  timedResetMs: number;
  timedMaxMs: number;
  timerBarBg?: Phaser.GameObjects.Rectangle;
  timerBarFill?: Phaser.GameObjects.Rectangle;
  memorySeq: number[];
  memoryShowIdx: number;
  memoryFlashMs: number;
  hazardTiles: Array<{
    x: number;
    y: number;
    spr: Phaser.GameObjects.Rectangle;
    border?: Phaser.GameObjects.Rectangle;
    safe: boolean;
    group: number;
    active: boolean;
  }>;
  pushBlocks: WfcPushBlock[];
  sockets: Array<{ x: number; y: number; spr: Phaser.GameObjects.Arc; filled: boolean }>;
  resetRune?: { x: number; y: number; spr: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text };
  levers: Array<{ x: number; y: number; spr: Phaser.GameObjects.Image; pulled: boolean; label?: Phaser.GameObjects.Text }>;
  rubble: Array<{ x: number; y: number; spr: Phaser.GameObjects.Image; broken: boolean }>;
  kegs: Array<{
    x: number;
    y: number;
    homeX: number;
    homeY: number;
    spr: Phaser.GameObjects.Image;
    ring: Phaser.GameObjects.Arc;
    exploded: boolean;
    respawnMs: number;
  }>;
  frostVents: Array<{
    x: number;
    y: number;
    spr: Phaser.GameObjects.Ellipse;
    ring: Phaser.GameObjects.Arc;
    quenched: boolean;
    steamTimerMs: number;
  }>;
  frostCrystals: Array<{
    x: number;
    y: number;
    homeX: number;
    homeY: number;
    spr: Phaser.GameObjects.Image;
    broken: boolean;
    respawnMs: number;
  }>;
  pylons: Array<{
    x: number;
    y: number;
    spr: Phaser.GameObjects.Image;
    ring: Phaser.GameObjects.Arc;
    chargedMs: number;
    arcGfx?: Phaser.GameObjects.Graphics;
  }>;
  lanterns: Array<{ x: number; y: number; spr: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Arc; lit: boolean }>;
  totems: Array<{ x: number; y: number; spr: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Arc; hp: number; broken: boolean }>;
  targets: Array<{ x: number; y: number; spr: Phaser.GameObjects.Arc; inner: Phaser.GameObjects.Arc; hit: boolean }>;
  sentinel?: {
    x: number;
    y: number;
    spr: Phaser.GameObjects.Image;
    angle: number;
    beam: Phaser.GameObjects.Graphics;
    disabled: boolean;
  };
  darkOverlay?: Phaser.GameObjects.Rectangle;
  spikeTimerMs: number;
  spikePhase: number;
  vaultLockpick: boolean;
  pushCooldownMs: number;
  hazardCooldownMs: number;
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
  private projectiles: SceneProjectile[] = [];
  private projectileHitSets = new WeakMap<ActiveProjectile, Set<Enemy>>();
  private bombs: Array<{ sprite: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Arc; fuseMs: number; spec: BombSpec }> = [];
  private lockpickMinigame = new LockpickMinigame();
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
    this.bombs = [];
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
    this.cameras.main.setRoundPixels(settingsStore.get().graphics.roundPixels);
    const unsubSettings = onSettingsChange((s) => {
      this.cameras.main?.setRoundPixels(s.graphics.roundPixels);
    });
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
      unsubSettings();
      this.lockpickMinigame.stop();
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
        if (this.lockpickMinigame.isActive()) {
          this.lockpickMinigame.triggerPick();
          return;
        }
        if (this.hud.isBlockingInput()) return;
        if (this.tryInteractPortal()) return;
        const f = this.player.facing;
        const dx = f === 'left' ? -28 : f === 'right' ? 28 : 0;
        const dy = f === 'up' ? -28 : f === 'down' ? 28 : 0;
        this.handleAttack(this.player.x + dx, this.player.y + dy);
      },
      onTouchDash: () => {
        if (this.hud.isBlockingInput() || this.lockpickMinigame.isActive()) return;
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
    const layout = buildDungeonLayout(gameState.getDungeonSeed(this.cfg.id, this.voidFloor), 7, 10);
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

      const reserved: Array<{ lx: number; ly: number }> = this.getPuzzleReservedTiles(r);
      if (r.role === 'start') {
        const exitWall = r.exitWall ?? this.pickClosedWallFallback(r.mask);
        if (exitWall === 'north') reserved.push({ lx: Math.floor(WFC_ROOM_W / 2), ly: 1 });
        else if (exitWall === 'south') reserved.push({ lx: Math.floor(WFC_ROOM_W / 2), ly: WFC_ROOM_H - 2 });
        else if (exitWall === 'west') reserved.push({ lx: 1, ly: Math.floor(WFC_ROOM_H / 2) });
        else reserved.push({ lx: WFC_ROOM_W - 2, ly: Math.floor(WFC_ROOM_H / 2) });
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

      const alreadySolved =
        r.puzzleKind === undefined || gameState.isDungeonPuzzleSolved(this.cfg.id, this.voidFloor, r.id);

      const rt: WfcRoomRuntime = {
        plan: r,
        ox,
        oy,
        cx,
        cy,
        cleared: r.role === 'start' || r.enemyCount === 0,
        ambushTriggered: false,
        puzzleSolved: alreadySolved,
        enemies: [],
        sigils: [],
        braziers: [],
        fogOverlay,
        orderedIdx: 0,
        timedResetMs: 0,
        timedMaxMs: 0,
        memorySeq: [],
        memoryShowIdx: 0,
        memoryFlashMs: 0,
        hazardTiles: [],
        pushBlocks: [],
        sockets: [],
        levers: [],
        rubble: [],
        kegs: [],
        frostVents: [],
        frostCrystals: [],
        pylons: [],
        lanterns: [],
        totems: [],
        targets: [],
        spikeTimerMs: 0,
        spikePhase: 0,
        vaultLockpick: false,
        pushCooldownMs: 0,
        hazardCooldownMs: 0,
      };

      if (r.role === 'start') {
        const exitWall: ExitWallDir = r.exitWall ?? this.pickClosedWallFallback(r.mask);
        const midX = (ox + WFC_ROOM_W / 2) * TILE_PX;
        const midY = (oy + WFC_ROOM_H / 2) * TILE_PX;
        let sprX = midX;
        let sprY = oy * TILE_PX + 8;
        let portalX = midX;
        let portalY = (oy + 1.2) * TILE_PX;
        let doorX = midX;
        let doorY = (oy + 1) * TILE_PX;
        let labelX = midX;
        let labelY = (oy + 1.55) * TILE_PX;

        if (exitWall === 'south') {
          sprX = midX;
          sprY = (oy + WFC_ROOM_H - 1) * TILE_PX + 8;
          portalX = midX;
          portalY = (oy + WFC_ROOM_H - 1.2) * TILE_PX;
          doorX = midX;
          doorY = (oy + WFC_ROOM_H) * TILE_PX - 2;
          labelX = midX;
          labelY = (oy + WFC_ROOM_H - 1.6) * TILE_PX;
        } else if (exitWall === 'west') {
          sprX = ox * TILE_PX + 8;
          sprY = midY;
          portalX = (ox + 1.2) * TILE_PX;
          portalY = midY;
          doorX = (ox + 0.85) * TILE_PX;
          doorY = midY + 6;
          labelX = (ox + 1.8) * TILE_PX;
          labelY = midY - 12;
        } else if (exitWall === 'east') {
          sprX = (ox + WFC_ROOM_W - 1) * TILE_PX + 8;
          sprY = midY;
          portalX = (ox + WFC_ROOM_W - 1.2) * TILE_PX;
          portalY = midY;
          doorX = (ox + WFC_ROOM_W - 0.85) * TILE_PX;
          doorY = midY + 6;
          labelX = (ox + WFC_ROOM_W - 1.8) * TILE_PX;
          labelY = midY - 12;
        }

        const glow = this.add.ellipse(sprX, sprY, 24, 16, 0x7ef29d, 0.24).setDepth(sprY + 1);
        this.exitPortal = { x: portalX, y: portalY, sprX, sprY, glow };
        this.add
          .image(doorX, doorY, 'tileset/Door (open)')
          .setOrigin(0.5, 0.94)
          .setScale(0.82)
          .setDepth(sprY + 2);
        this.add
          .text(labelX, labelY, fmtKeyPrompt('E', 'Exit'), {
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

      if (r.hasTreasureChest || r.puzzleKind === 'lockpick_vault') {
        const alreadyOpened = gameState.isDungeonChestOpened(this.cfg.id, this.voidFloor, r.id);
        const isSealed = !rt.puzzleSolved && !alreadyOpened;
        const title = r.puzzleKind === 'lockpick_vault' ? 'Vault Chest' : r.grantsSmallKey ? 'Key Chest' : 'Treasure';
        const chest = new DungeonChest(this, { x: cx, y: cy, title, locked: isSealed });
        if (alreadyOpened) {
          chest.opened = true;
          chest.locked = false;
          chest.label.setVisible(false);
          chest.aura.setVisible(false);
          chest.sprite.clearTint().setFrame(3);
          if (r.grantsSmallKey) this.smallKeys += 1;
          if (r.grantsBossKey && r.role !== 'miniboss') this.hasBossKey = true;
        }
        rt.chest = {
          chest,
          grantsSmallKey: r.grantsSmallKey && !alreadyOpened,
          grantsBossKey: r.grantsBossKey && r.role !== 'miniboss' && !alreadyOpened,
        };
      }

      // Prefab puzzle setups
      if (r.puzzleKind && !alreadySolved) {
        this.setupRoomPuzzle(rt, r);
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
          const en = new Enemy(this, mId, cx + dx, cy + dy, { isElite: Math.random() < ELITE_SPAWN_CHANCE });
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
    kb.on('keydown-O', () => this.hud.toggleModal('settings' as never));
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
        if (this.hud.isBlockingInput() || this.lockpickMinigame.isActive()) return;
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

  private handleDungeonPlayerDeath(): void {
    SFX.playStinger('defeat');
    const { fee, spawnPoint } = gameState.applyDeathRevival();
    if (spawnPoint) {
      gameState.playerPos = { x: spawnPoint.x, y: spawnPoint.y };
    } else {
      gameState.playerPos = undefined;
    }
    gameState.pendingToast = `Revived at ${spawnPoint ? spawnPoint.label : 'Emerald Origin'}!${
      fee > 0 ? ` (-${fee}g revival fee)` : ''
    }`;
    this.transitionToOverworld();
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
    // Check WFC room chests, braziers, levers, lanterns, & block reset runes
    if (this.wfcLayout) {
      for (const rm of this.wfcRooms.values()) {
        if (rm.chest && !rm.chest.chest.opened && Math.hypot(rm.chest.chest.x - this.player.x, rm.chest.chest.y - this.player.y) <= 28) {
          const ch = rm.chest.chest;
          if (rm.vaultLockpick && ch.locked) {
            this.startLockpickVault(rm);
            return true;
          }
          if (ch.locked || !rm.puzzleSolved) {
            this.hud.showToast('Chest Sealed — Solve the room puzzle first!');
            return true;
          }
          this.openWfcChest(rm);
          return true;
        }
        for (const bz of rm.braziers) {
          if (!bz.lit && Math.hypot(bz.x - this.player.x, bz.y - this.player.y) <= 26) {
            this.igniteBrazier(rm, bz);
            return true;
          }
        }
        for (const lv of rm.levers) {
          if (!lv.pulled && Math.hypot(lv.x - this.player.x, lv.y - this.player.y) <= 28) {
            this.pullLever(rm, lv);
            return true;
          }
        }
        for (const lt of rm.lanterns) {
          if (!lt.lit && Math.hypot(lt.x - this.player.x, lt.y - this.player.y) <= 26) {
            this.lightLantern(rm, lt);
            return true;
          }
        }
        if (rm.resetRune && !rm.puzzleSolved && Math.hypot(rm.resetRune.x - this.player.x, rm.resetRune.y - this.player.y) <= 24) {
          for (const blk of rm.pushBlocks) {
            if (!blk.locked) {
              blk.x = blk.homeX;
              blk.y = blk.homeY;
              blk.vx = 0;
              blk.vy = 0;
              blk.spr.setPosition(blk.x, blk.y).setDepth(blk.y);
            }
          }
          SFX.playSwitch();
          spawnShockwaveRing(this, rm.resetRune.x, rm.resetRune.y, 0x6ce5ff, 22, 240);
          spawnFloatingText(this, rm.resetRune.x, rm.resetRune.y - 12, 'Blocks Reset!', '#6ce5ff');
          return true;
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

    if (isBombItem(itemId)) {
      if ((gameState.inventory[itemId] ?? 0) <= 0) return;
      if (!this.player.startAction('cast', 220, nx, ny, 140)) return;
      const spec = getBombSpec(itemId);
      gameState.removeItem(itemId, 1);
      const bombSpr = this.add.image(this.player.x, this.player.y, 'projectiles/Bomb').setDepth(this.player.y);
      if (spec.tint !== 0xffffff) bombSpr.setTint(spec.tint);
      this.tweens.add({ targets: bombSpr, scale: { from: 1, to: 1.35 }, duration: 220, yoyo: true, repeat: -1 });
      const ringColor = spec.tint !== 0xffffff ? spec.tint : 0xff5a36;
      const ring = this.add
        .circle(this.player.x, this.player.y, spec.radius, ringColor, 0.08)
        .setStrokeStyle(1.2, ringColor, 0.55)
        .setDepth(this.player.y - 1);
      this.tweens.add({
        targets: ring,
        scale: { from: 0.9, to: 1.04 },
        alpha: { from: 0.45, to: 0.85 },
        duration: 240,
        yoyo: true,
        repeat: -1,
      });
      this.bombs.push({ sprite: bombSpr, ring, fuseMs: spec.fuseMs, spec });
      return;
    }

    if (itemId === 'watering_can') {
      if (!this.player.startAction('cast', 280, nx, ny, 150)) return;
      SFX.playWaterSplash();
      const wxHit = this.player.x + nx * 18;
      const wyHit = this.player.y + ny * 18;
      spawnBurstParticles(this, wxHit, wyHit, 0x74e5ff, 8);
      this.hitRoomPuzzleTargets(wxHit, wyHit, 34, 'water');
      return;
    }

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
      const dmg = gameState.getWeaponDamage(itemId);

      if (itemId === 'thunder_rod') {
        this.cameraRig.kick(nx, ny, 2.6, 80);
        this.cameraRig.addTrauma(0.22);
        spawnRodMuzzleJuice(this, this.player.x + nx * 8, this.player.y - 4 + ny * 8, 'thunder', Math.atan2(ny, nx));

        let primaryAimed: Enemy | null = null;
        let primaryAimedDist = Infinity;
        let primaryLoose: Enemy | null = null;
        let primaryLooseDist = Infinity;
        for (const e of this.enemies) {
          if (!e.active || e.isDead || (!this.wfcLayout && e === this.boss && !this.gateOpen)) continue;
          const edx = e.x - this.player.x;
          const edy = e.y - this.player.y;
          const d = Math.hypot(edx, edy);
          if (d > 165) continue;
          const dot = d > 1e-4 ? (edx * nx + edy * ny) / d : 1;
          if (dot >= 0.45 && d < primaryAimedDist) {
            primaryAimed = e;
            primaryAimedDist = d;
          }
          if (d <= 145 && d < primaryLooseDist) {
            primaryLoose = e;
            primaryLooseDist = d;
          }
        }
        const primary = primaryAimed ?? primaryLoose;
        const startX = this.player.x + nx * 6;
        const startY = this.player.y - 6 + ny * 6;
        if (primary) {
          drawLightningArc(this, startX, startY, primary.x, primary.y - 4, {
            color: 0x6ce5ff,
            coreColor: 0xffffff,
            width: 2.2,
            durationMs: 240,
            branches: 3,
          });
          spawnRodImpactJuice(this, primary.x, primary.y - 4, 'thunder');
          const pdx = primary.x - this.player.x;
          const pdy = primary.y - this.player.y;
          const pLen = Math.hypot(pdx, pdy) || 1;
          this.damageEnemy(primary, dmg, pdx / pLen, pdy / pLen);
          this.hitRoomPuzzleTargets(primary.x, primary.y, 24, 'thunder');

          const chainDmg = computeChainLightningDamage(dmg);
          for (const e of this.enemies) {
            if (e === primary || !e.active || e.isDead || (!this.wfcLayout && e === this.boss && !this.gateOpen)) {
              continue;
            }
            if (Math.hypot(e.x - primary.x, e.y - primary.y) > 96) continue;
            drawLightningArc(this, primary.x, primary.y - 4, e.x, e.y - 4, {
              color: 0xffe066,
              coreColor: 0xffffff,
              width: 1.5,
              durationMs: 220,
              branches: 1,
            });
            spawnRodImpactJuice(this, e.x, e.y - 4, 'thunder');
            const cdx = e.x - primary.x;
            const cdy = e.y - primary.y;
            const cLen = Math.hypot(cdx, cdy) || 1;
            this.damageEnemy(e, chainDmg, cdx / cLen, cdy / cLen);
          }
        } else {
          const endX = this.player.x + nx * 130;
          const endY = this.player.y - 4 + ny * 130;
          drawLightningArc(this, startX, startY, endX, endY, {
            color: 0x6ce5ff,
            coreColor: 0xffffff,
            width: 2.2,
            durationMs: 240,
            branches: 3,
          });
          spawnRodImpactJuice(this, endX, endY, 'thunder');
          this.hitRoomPuzzleTargets(endX, endY, 30, 'thunder');
        }
        return;
      }

      const texMap: Record<string, { tex: string; kind: ActiveProjectile['kind'] | 'void' }> = {
        bow: { tex: 'projectiles/Arrow', kind: 'arrow' },
        necro_rod: { tex: 'monster_projectiles/DeathCoil', kind: 'necro' },
        thunder_rod: { tex: 'projectiles/LightningBolt', kind: 'thunder' },
        ice_rod: { tex: 'projectiles/IceShard', kind: 'ice' },
        fire_rod: { tex: 'projectiles/Fireball', kind: 'fire' },
        void_rod: { tex: 'monster_projectiles/DeathCoil', kind: 'void' },
      };
      const pInfo = texMap[itemId] ?? texMap.bow;
      if (itemId !== 'bow') {
        this.cameraRig.kick(nx, ny, itemId === 'void_rod' ? 2.8 : 2.0, 75);
        spawnRodMuzzleJuice(
          this,
          this.player.x + nx * 8,
          this.player.y - 4 + ny * 8,
          pInfo.kind as RodVfxKind,
          Math.atan2(ny, nx),
        );
      }
      const spr = this.add
        .image(this.player.x + nx * 8, this.player.y - 4 + ny * 8, pInfo.tex)
        .setRotation(getProjectileRotation(nx * 195, ny * 195))
        .setDepth(5000);
      if (itemId === 'void_rod') {
        spr.setTint(0xc77dff).setScale(1.25);
      }
      const glow =
        pInfo.kind !== 'arrow' ? attachProjectileGlow(this, spr, pInfo.kind as RodVfxKind) : undefined;
      this.projectiles.push({
        sprite: spr,
        glow,
        vx: nx * 195,
        vy: ny * 195,
        damage: dmg,
        fromPlayer: true,
        lifeMs: 1200,
        kind: pInfo.kind as ActiveProjectile['kind'],
        pierce: itemId === 'void_rod',
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
      this.hitRoomPuzzleTargets(this.player.x + aimNx * 14, this.player.y + aimNy * 14, range + 10, 'melee');
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
    this.hitRoomPuzzleTargets(this.player.x + nx * 14, this.player.y + ny * 14, range + 10, 'melee');
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

    gameState.recordDamageDealt(dmg);
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
        const vx = Math.cos(ang) * 115;
        const vy = Math.sin(ang) * 115;
        const spr = this.add.image(enemy.x, enemy.y - 4, proj).setRotation(getProjectileRotation(vx, vy)).setDepth(5000);
        this.projectiles.push({
          sprite: spr,
          vx,
          vy,
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
      gameState.recordMonsterKill(enemy.def.id, {
        isBoss: enemy === this.boss || enemy.def.isBoss,
        isElite: enemy.isElite,
      });
      gameState.recordQuestProgress('kill', enemy.def.id, 1);
      const bpName = tryUnlockBlueprintFromPool(
        getBlueprintsForMonster(enemy.def.id, enemy === this.boss),
        enemy === this.boss ? 1.0 : enemy.isElite ? 0.45 : 0.22,
      );
      if (bpName) {
        this.hud.showToast(`BLUEPRINT UNLOCKED: ${bpName}!`);
      }
      const eliteStats = enemy.isElite ? computeEliteStats(enemy.def) : null;
      const coinRange = eliteStats ? eliteStats.coins : enemy.def.coins;
      this.spawnDrop(enemy.x, enemy.y, 'coin', Phaser.Math.Between(coinRange[0], coinRange[1]), true);
      for (const d of enemy.def.drops) {
        if (Math.random() <= d.chance) {
          this.spawnDrop(enemy.x, enemy.y, d.itemId, d.count, false);
        }
      }
      if (enemy.isElite) {
        for (const ed of rollEliteDrops(enemy.def.level)) {
          this.spawnDrop(enemy.x, enemy.y, ed.itemId, ed.count, false);
        }
        spawnFloatingText(this, enemy.x, enemy.y - 22, 'ELITE SLAIN!', '#ffd166', '9px');
      }
      const baseXp = eliteStats ? eliteStats.xp : enemy.def.xp;
      const xpMult =
        this.cfg.id === 'void_spire'
          ? getVoidSpireXpMultiplier(this.voidFloor)
          : COMBAT_XP_MULT;
      const xpGain = Math.round(baseXp * xpMult);
      spawnFloatingText(this, this.player.x, this.player.y - 18, `+${xpGain} XP`, '#7ef5ff', '8px', 'xp');
      gameState.addXp(xpGain);

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

  private openWfcChest(rm: WfcRoomRuntime): void {
    if (!rm.chest || rm.chest.chest.opened) return;
    gameState.markDungeonChestOpened(this.cfg.id, this.voidFloor, rm.plan.id);
    const ch = rm.chest.chest;
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
  }

  private pickClosedWallFallback(mask: number): ExitWallDir {
    if ((mask & DIR_NORTH) === 0) return 'north';
    if ((mask & DIR_SOUTH) === 0) return 'south';
    if ((mask & DIR_WEST) === 0) return 'west';
    if ((mask & DIR_EAST) === 0) return 'east';
    return 'north';
  }

  private getPuzzleReservedTiles(r: DungeonRoomPlan): Array<{ lx: number; ly: number }> {
    const pk = r.puzzleKind;
    if (!pk || pk === 'ambush' || pk === 'lockpick_vault') return [];
    const midX = Math.floor(WFC_ROOM_W / 2);
    const midY = Math.floor(WFC_ROOM_H / 2);
    if (pk === 'sigils' || pk === 'ordered_sigils' || pk === 'timed_plates' || pk === 'memory_runes' || pk === 'crystal_totems') {
      return [
        { lx: 4, ly: 3 },
        { lx: WFC_ROOM_W - 5, ly: 3 },
        { lx: midX, ly: WFC_ROOM_H - 4 },
      ];
    }
    if (pk === 'braziers' || pk === 'brazier_chain') {
      return [
        { lx: 4, ly: 3 },
        { lx: WFC_ROOM_W - 5, ly: 3 },
        { lx: 4, ly: WFC_ROOM_H - 4 },
        { lx: WFC_ROOM_W - 5, ly: WFC_ROOM_H - 4 },
      ];
    }
    if (pk === 'mirror_plates' || pk === 'sentinel_statue') {
      return [
        { lx: 4, ly: 4 },
        { lx: WFC_ROOM_W - 5, ly: 4 },
        { lx: midX, ly: WFC_ROOM_H - 4 },
        { lx: 4, ly: WFC_ROOM_H - 4 },
        { lx: WFC_ROOM_W - 5, ly: WFC_ROOM_H - 4 },
        { lx: midX, ly: 4 },
      ];
    }
    if (pk === 'push_block_single' || pk === 'push_block_twin' || pk === 'ice_slide_block') {
      return [
        { lx: 4, ly: 3 },
        { lx: 5, ly: 5 },
        { lx: 4, ly: 4 },
        { lx: 4, ly: 8 },
        { lx: 11, ly: 3 },
        { lx: 11, ly: 5 },
        { lx: 11, ly: 4 },
        { lx: 11, ly: 8 },
        { lx: 3, ly: 9 },
      ];
    }
    return [
      { lx: 4, ly: 4 },
      { lx: 4, ly: 5 },
      { lx: 4, ly: 8 },
      { lx: 6, ly: 4 },
      { lx: 8, ly: 3 },
      { lx: 10, ly: 4 },
      { lx: 11, ly: 4 },
      { lx: 11, ly: 5 },
      { lx: 11, ly: 8 },
      { lx: midX, ly: midY },
    ];
  }

  private tileCenter(ox: number, oy: number, lx: number, ly: number): { x: number; y: number } {
    return { x: (ox + lx) * TILE_PX + 8, y: (oy + ly) * TILE_PX + 8 };
  }

  private createRoomHint(rm: WfcRoomRuntime, text: string, color = '#cdeeff'): void {
    rm.puzzleHint?.destroy();
    rm.puzzleHint = this.add
      .text(rm.cx, (rm.oy + 1.5) * TILE_PX, text, {
        fontSize: '6.5px',
        fontStyle: 'bold',
        color,
        stroke: '#000',
        strokeThickness: 2,
        resolution: 4,
      })
      .setOrigin(0.5)
      .setDepth(6500);
  }

  private createRoomTimerBar(rm: WfcRoomRuntime): void {
    const bx = rm.cx;
    const by = (rm.oy + 2.2) * TILE_PX;
    rm.timerBarBg = this.add.rectangle(bx, by, 54, 4, 0x11131a, 0.85).setStrokeStyle(0.8, 0xffe066, 0.7).setDepth(6600).setVisible(false);
    rm.timerBarFill = this.add.rectangle(bx - 26, by, 52, 2.5, 0xffe066, 1).setOrigin(0, 0.5).setDepth(6601).setVisible(false);
  }

  private setupRoomPuzzle(rm: WfcRoomRuntime, r: DungeonRoomPlan): void {
    const pk: DungeonPuzzleKind | undefined = r.puzzleKind;
    if (!pk || pk === 'ambush') return;
    const { ox, oy } = rm;

    if (pk === 'sigils' || pk === 'ordered_sigils' || pk === 'timed_plates') {
      const coords: Array<[number, number]> = [
        [4, 3],
        [WFC_ROOM_W - 5, 3],
        [Math.floor(WFC_ROOM_W / 2), WFC_ROOM_H - 4],
      ];
      coords.forEach(([lx, ly], idx) => {
        const { x, y } = this.tileCenter(ox, oy, lx, ly);
        const spr = this.add.image(x, y, 'ui_icons/sigil_off').setDepth(2);
        let label: Phaser.GameObjects.Text | undefined;
        if (pk === 'ordered_sigils') {
          label = this.add
            .text(x, y - 10, `${idx + 1}`, { fontSize: '7px', fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 2, resolution: 4 })
            .setOrigin(0.5)
            .setDepth(6500);
        }
        rm.sigils.push({ x, y, spr, active: false, label });
      });
      if (pk === 'ordered_sigils') this.createRoomHint(rm, 'Step in Order: 1 -> 2 -> 3', '#ffe066');
      if (pk === 'timed_plates') {
        this.createRoomHint(rm, 'Step on all 3 Plates quickly!', '#ffb86c');
        this.createRoomTimerBar(rm);
      }
      return;
    }

    if (pk === 'mirror_plates') {
      for (const [lx, ly] of [
        [4, 4],
        [WFC_ROOM_W - 5, 4],
      ]) {
        const { x, y } = this.tileCenter(ox, oy, lx, ly);
        const spr = this.add.image(x, y, 'ui_icons/sigil_off').setTint(0x74e5ff).setDepth(2);
        const ring = this.add.circle(x, y, 9, 0x74e5ff, 0.14).setStrokeStyle(1, 0x74e5ff, 0.7).setDepth(1.5);
        rm.sigils.push({ x, y, spr, active: false, ring, color: 0x74e5ff });
      }
      const centerSeal = this.tileCenter(ox, oy, Math.floor(WFC_ROOM_W / 2), WFC_ROOM_H - 4);
      const sealSpr = this.add.image(centerSeal.x, centerSeal.y, 'ui_icons/sigil_off').setTint(0xffd95a).setDepth(2);
      const sealRing = this.add.circle(centerSeal.x, centerSeal.y, 10, 0xffd95a, 0.12).setStrokeStyle(1.2, 0xffd95a, 0.65).setDepth(1.5);
      rm.sigils.push({ x: centerSeal.x, y: centerSeal.y, spr: sealSpr, active: false, ring: sealRing, color: 0xffd95a, isCenterSeal: true });
      this.createRoomHint(rm, 'Light Twin Plates -> Center Seal', '#74e5ff');
      return;
    }

    if (pk === 'memory_runes') {
      const runeColors = [0x6ce5ff, 0xffe066, 0xd875ff];
      const coords: Array<[number, number]> = [
        [4, 3],
        [WFC_ROOM_W - 5, 3],
        [Math.floor(WFC_ROOM_W / 2), WFC_ROOM_H - 4],
      ];
      coords.forEach(([lx, ly], idx) => {
        const { x, y } = this.tileCenter(ox, oy, lx, ly);
        const spr = this.add.image(x, y, 'ui_icons/sigil_off').setTint(runeColors[idx]).setDepth(2);
        const ring = this.add.circle(x, y, 9, runeColors[idx], 0.12).setStrokeStyle(1.2, runeColors[idx], 0.6).setDepth(1.5);
        rm.sigils.push({ x, y, spr, active: false, ring, color: runeColors[idx] });
      });
      const perms = [
        [0, 1, 2],
        [2, 0, 1],
        [1, 2, 0],
        [2, 1, 0],
      ];
      rm.memorySeq = perms[Math.abs(r.id) % perms.length];
      rm.memoryShowIdx = 0;
      rm.memoryFlashMs = 700;
      this.createRoomHint(rm, 'Watch & Repeat Rune Sequence', '#d875ff');
      return;
    }

    if (pk === 'safe_path') {
      const safeCoords: Array<[number, number]> = [
        [4, 3],
        [6, 8],
        [9, 3],
        [11, 8],
      ];
      const cursedCoords: Array<[number, number]> = [
        [4, 8],
        [6, 3],
        [9, 8],
        [11, 3],
      ];
      for (const [lx, ly] of safeCoords) {
        const { x, y } = this.tileCenter(ox, oy, lx, ly);
        const spr = this.add.image(x, y, 'ui_icons/sigil_off').setTint(0x7ef29d).setDepth(2);
        rm.sigils.push({ x, y, spr, active: false, color: 0x7ef29d });
      }
      for (const [lx, ly] of cursedCoords) {
        const { x, y } = this.tileCenter(ox, oy, lx, ly);
        const rect = this.add.rectangle(x, y, 13, 13, 0xff4757, 0.28).setStrokeStyle(1, 0xff4757, 0.8).setDepth(1.6);
        rm.hazardTiles.push({ x, y, spr: rect, safe: false, group: 0, active: true });
      }
      this.createRoomHint(rm, 'Step on Green Stones (Avoid Red!)', '#7ef29d');
      return;
    }

    if (pk === 'push_block_single' || pk === 'push_block_twin' || pk === 'ice_slide_block') {
      const pairs: Array<{ bx: number; by: number; sx: number; sy: number }> =
        pk === 'push_block_twin'
          ? [
              { bx: 4, by: 4, sx: 11, sy: 4 },
              { bx: 4, by: 8, sx: 11, sy: 8 },
            ]
          : pk === 'ice_slide_block'
            ? [{ bx: 4, by: 3, sx: 11, sy: 3 }]
            : [{ bx: 5, by: 5, sx: 11, sy: 5 }];
      const isIce = pk === 'ice_slide_block';
      const frame = 11 * 32 + 6;
      for (const pair of pairs) {
        const bPos = this.tileCenter(ox, oy, pair.bx, pair.by);
        const sPos = this.tileCenter(ox, oy, pair.sx, pair.sy);
        const sSpr = this.add
          .circle(sPos.x, sPos.y, 7, isIce ? 0x74e5ff : 0xffe066, 0.2)
          .setStrokeStyle(1.4, isIce ? 0x74e5ff : 0xffe066, 0.85)
          .setDepth(1.5);
        rm.sockets.push({ x: sPos.x, y: sPos.y, spr: sSpr, filled: false });
        const bSpr = this.add
          .image(bPos.x, bPos.y, 'cuterpg/dungeon', frame)
          .setTint(isIce ? 0x8be9ff : 0xc0c8d6)
          .setDepth(bPos.y);
        rm.pushBlocks.push({
          x: bPos.x,
          y: bPos.y,
          homeX: bPos.x,
          homeY: bPos.y,
          spr: bSpr,
          ice: isIce,
          vx: 0,
          vy: 0,
          locked: false,
        });
      }
      const rPos = this.tileCenter(ox, oy, 3, 9);
      const rSpr = this.add.circle(rPos.x, rPos.y, 6, 0x6ce5ff, 0.22).setStrokeStyle(1, 0x6ce5ff, 0.85).setDepth(1.5);
      const rLbl = this.add
        .text(rPos.x, rPos.y - 10, fmtKeyPrompt('E', 'Reset'), {
          fontSize: '6px',
          fontStyle: 'bold',
          color: '#6ce5ff',
          stroke: '#000',
          strokeThickness: 2,
          resolution: 4,
        })
        .setOrigin(0.5)
        .setDepth(6500);
      rm.resetRune = { x: rPos.x, y: rPos.y, spr: rSpr, label: rLbl };
      this.createRoomHint(rm, isIce ? 'Slide Ice Block to Socket' : 'Push Block(s) into Socket', isIce ? '#74e5ff' : '#ffe066');
      return;
    }

    if (pk === 'bridge_lever') {
      const { x, y } = this.tileCenter(ox, oy, 4, 4);
      const spr = this.add.image(x, y, 'objects/Wooden sign (sword)').setTint(0xffd95a).setDepth(y);
      const label = this.add
        .text(x, y - 12, fmtKeyPrompt('E', 'Pull'), {
          fontSize: '6.5px',
          fontStyle: 'bold',
          color: '#ffe066',
          stroke: '#000',
          strokeThickness: 2,
          resolution: 4,
        })
        .setOrigin(0.5)
        .setDepth(6500);
      rm.levers.push({ x, y, spr, pulled: false, label });
      this.createRoomHint(rm, 'Pull or Strike the Lever', '#ffe066');
      return;
    }

    if (pk === 'bomb_rubble') {
      for (const [lx, ly] of [
        [6, 4],
        [10, 4],
      ]) {
        const { x, y } = this.tileCenter(ox, oy, lx, ly);
        const spr = this.add.image(x, y, 'extras/Rock').setTint(0xc8a47c).setScale(1.15).setDepth(y);
        rm.rubble.push({ x, y, spr, broken: false });
      }
      for (const [lx, ly] of [
        [4, 8],
        [11, 8],
      ]) {
        const { x, y } = this.tileCenter(ox, oy, lx, ly);
        const ring = this.add.circle(x, y, 10, 0xff6b4a, 0.14).setStrokeStyle(1, 0xff6b4a, 0.7).setDepth(1.5);
        const spr = this.add.image(x, y, 'projectiles/Bomb_red').setScale(1.1).setDepth(y);
        rm.kegs.push({ x, y, homeX: x, homeY: y, spr, ring, exploded: false, respawnMs: 0 });
      }
      this.createRoomHint(rm, 'Blast Rubble (Bomb or Hit Keg!)', '#ff8c6b');
      return;
    }

    if (pk === 'powder_keg_chain') {
      for (const [lx, ly] of [
        [4, 4],
        [8, 3],
        [11, 4],
      ]) {
        const { x, y } = this.tileCenter(ox, oy, lx, ly);
        const ring = this.add.circle(x, y, 10, 0xff6b4a, 0.14).setStrokeStyle(1, 0xff6b4a, 0.7).setDepth(1.5);
        const spr = this.add.image(x, y, 'projectiles/Bomb_red').setScale(1.15).setDepth(y);
        rm.kegs.push({ x, y, homeX: x, homeY: y, spr, ring, exploded: false, respawnMs: 0 });
      }
      this.createRoomHint(rm, 'Strike Any Powder Keg to Chain!', '#ff7675');
      return;
    }

    if (pk === 'braziers' || pk === 'brazier_chain') {
      const coords: Array<[number, number]> =
        pk === 'brazier_chain'
          ? [
              [4, 3],
              [WFC_ROOM_W - 5, 3],
              [4, WFC_ROOM_H - 4],
              [WFC_ROOM_W - 5, WFC_ROOM_H - 4],
            ]
          : [
              [4, 3],
              [WFC_ROOM_W - 5, 3],
              [Math.floor(WFC_ROOM_W / 2), WFC_ROOM_H - 4],
            ];
      for (const [lx, ly] of coords) {
        const { x, y } = this.tileCenter(ox, oy, lx, ly);
        const spr = this.add.image(x, y, 'extras/Bonfire', 0).setTint(0x4a5568).setAlpha(0.75).setDepth(y);
        rm.braziers.push({ x, y, spr, lit: false });
      }
      if (pk === 'brazier_chain') {
        this.createRoomHint(rm, 'Light all 4 Braziers in 6s!', '#ffaa44');
        this.createRoomTimerBar(rm);
      }
      return;
    }

    if (pk === 'frost_vents') {
      for (const [lx, ly] of [
        [4, 5],
        [11, 5],
      ]) {
        const { x, y } = this.tileCenter(ox, oy, lx, ly);
        const ring = this.add.circle(x, y, 10, 0x74e5ff, 0.18).setStrokeStyle(1.2, 0x9ef0ff, 0.85).setDepth(1.5);
        const spr = this.add.ellipse(x, y, 12, 8, 0xbef8ff, 0.72).setDepth(2);
        rm.frostVents.push({ x, y, spr, ring, quenched: false, steamTimerMs: 0 });
      }
      const cPos = this.tileCenter(ox, oy, 8, 3);
      const cSpr = this.add.image(cPos.x, cPos.y, 'cuterpg/grotto', 1 * 32 + 27).setTint(0x8be9ff).setDepth(cPos.y);
      rm.frostCrystals.push({ x: cPos.x, y: cPos.y, homeX: cPos.x, homeY: cPos.y, spr: cSpr, broken: false, respawnMs: 0 });
      this.createRoomHint(rm, 'Quench Vents (Strike Crystal / Frost Bomb)', '#8be9ff');
      return;
    }

    if (pk === 'lightning_pylons') {
      for (const [lx, ly] of [
        [4, 5],
        [11, 5],
      ]) {
        const { x, y } = this.tileCenter(ox, oy, lx, ly);
        const ring = this.add.circle(x, y, 11, 0x6ce5ff, 0.12).setStrokeStyle(1.2, 0x6ce5ff, 0.7).setDepth(1.5);
        const spr = this.add.image(x, y, 'cuterpg/grotto', 1 * 32 + 27).setTint(0xc07dff).setDepth(y);
        rm.pylons.push({ x, y, spr, ring, chargedMs: 0 });
      }
      this.createRoomHint(rm, 'Strike Both Pylons within 4s!', '#a29bfe');
      return;
    }

    if (pk === 'shadow_lanterns') {
      rm.darkOverlay = this.add
        .rectangle(
          ox * TILE_PX + (WFC_ROOM_W * TILE_PX) / 2,
          oy * TILE_PX + (WFC_ROOM_H * TILE_PX) / 2,
          (WFC_ROOM_W - 2) * TILE_PX,
          (WFC_ROOM_H - 2) * TILE_PX,
          0x05030c,
          0.62,
        )
        .setDepth(4200);
      for (const [lx, ly] of [
        [4, 4],
        [11, 8],
      ]) {
        const { x, y } = this.tileCenter(ox, oy, lx, ly);
        const ring = this.add.circle(x, y, 9, 0xffe066, 0.14).setStrokeStyle(1, 0xffe066, 0.65).setDepth(4201);
        const spr = this.add.image(x, y, 'objects/Torch').setTint(0x5b6475).setDepth(4202);
        rm.lanterns.push({ x, y, spr, ring, lit: false });
      }
      const fPos = this.tileCenter(ox, oy, 8, 3);
      const fSpr = this.add.image(fPos.x, fPos.y, 'ui_icons/sigil_off').setTint(0xffe066).setDepth(2).setVisible(false);
      rm.sigils.push({ x: fPos.x, y: fPos.y, spr: fSpr, active: false, color: 0xffe066 });
      this.createRoomHint(rm, 'Light 2 Lanterns to Reveal Sigil', '#ffe066');
      return;
    }

    if (pk === 'crystal_totems') {
      for (const [lx, ly] of [
        [4, 3],
        [WFC_ROOM_W - 5, 3],
        [Math.floor(WFC_ROOM_W / 2), WFC_ROOM_H - 4],
      ]) {
        const { x, y } = this.tileCenter(ox, oy, lx, ly);
        const ring = this.add.circle(x, y, 9, 0xd875ff, 0.16).setStrokeStyle(1.2, 0xd875ff, 0.75).setDepth(1.5);
        const spr = this.add.image(x, y, 'cuterpg/grotto', 1 * 32 + 27).setTint(0xe082ff).setScale(1.15).setDepth(y);
        rm.totems.push({ x, y, spr, ring, hp: 2, broken: false });
      }
      this.createRoomHint(rm, 'Shatter all 3 Crystal Totems!', '#e082ff');
      return;
    }

    if (pk === 'bullseye_targets') {
      for (const [lx, ly] of [
        [3, 3],
        [WFC_ROOM_W - 4, 3],
        [Math.floor(WFC_ROOM_W / 2), WFC_ROOM_H - 3],
      ]) {
        const { x, y } = this.tileCenter(ox, oy, lx, ly);
        const outer = this.add.circle(x, y, 8, 0xff4757, 0.85).setStrokeStyle(1.4, 0xffffff, 0.95).setDepth(y);
        const inner = this.add.circle(x, y, 3.5, 0xffe066, 1).setDepth(y + 0.5);
        rm.targets.push({ x, y, spr: outer, inner, hit: false });
      }
      this.createRoomHint(rm, 'Hit all 3 Targets (Sword/Bow/Rod)', '#ff7675');
      return;
    }

    if (pk === 'sentinel_statue') {
      const sPos = this.tileCenter(ox, oy, 8, 4);
      const sSpr = this.add.image(sPos.x, sPos.y, 'cuterpg/dungeon', 11 * 32 + 6).setTint(0xb5a6e8).setScale(1.1).setDepth(sPos.y);
      const beam = this.add.graphics().setDepth(sPos.y + 5);
      rm.sentinel = { x: sPos.x, y: sPos.y, spr: sSpr, angle: 0, beam, disabled: false };
      for (const [lx, ly] of [
        [4, 8],
        [WFC_ROOM_W - 5, 8],
      ]) {
        const { x, y } = this.tileCenter(ox, oy, lx, ly);
        const spr = this.add.image(x, y, 'ui_icons/sigil_off').setDepth(2);
        rm.sigils.push({ x, y, spr, active: false });
      }
      this.createRoomHint(rm, 'Dodge Beam & Step on 2 Switches', '#c07dff');
      return;
    }

    if (pk === 'lockpick_vault') {
      rm.vaultLockpick = true;
      this.createRoomHint(rm, 'Interact [E] with Vault Chest to Pick!', '#ffe066');
      return;
    }

    if (pk === 'spike_gauntlet') {
      const spikeCoords: Array<[number, number, number]> = [
        [5, 4, 0],
        [10, 4, 1],
        [5, 8, 1],
        [10, 8, 0],
      ];
      for (const [lx, ly, group] of spikeCoords) {
        const { x, y } = this.tileCenter(ox, oy, lx, ly);
        const spr = this.add.rectangle(x, y, 14, 14, 0x4b5563, 0.55).setStrokeStyle(1, 0x9ca3af, 0.7).setDepth(1.5);
        rm.hazardTiles.push({ x, y, spr, safe: true, group, active: false });
      }
      this.createRoomHint(rm, 'Avoid Spikes & Defeat Monsters!', '#ff6b6b');
    }
  }

  private solveRoomPuzzle(rm: WfcRoomRuntime, label: string): void {
    if (rm.puzzleSolved) return;
    rm.puzzleSolved = true;
    gameState.markDungeonPuzzleSolved(this.cfg.id, this.voidFloor, rm.plan.id);
    rm.timedResetMs = 0;
    rm.timerBarBg?.setVisible(false);
    rm.timerBarFill?.setVisible(false);
    rm.puzzleHint?.setText(`${label} ✓`).setColor('#7ef29d');
    if (rm.sentinel) {
      rm.sentinel.disabled = true;
      rm.sentinel.beam.clear();
    }
    if (rm.darkOverlay) {
      this.tweens.add({ targets: rm.darkOverlay, alpha: 0, duration: 280, onComplete: () => rm.darkOverlay?.destroy() });
      rm.darkOverlay = undefined;
    }
    for (const ht of rm.hazardTiles) {
      ht.active = false;
      ht.spr.setFillStyle(0x374151, 0.25).setStrokeStyle(1, 0x6b7280, 0.35);
    }
    spawnSparklers(this, rm.cx, rm.cy, 14);
    SFX.playLevelUp();

    if (rm.chest && rm.chest.chest.locked) {
      const chestRef = rm.chest.chest;
      this.cameraRig.focusOn(chestRef.x, chestRef.y, this.player, {
        onArrive: () => {
          chestRef.unlock();
          SFX.playSecretJingle();
          this.cameraRig.zoomPunch(0.04, 110);
          this.hud.showToast(`${label} Chamber Chest Unsealed!`);
        },
      });
    } else {
      SFX.playSecretJingle();
      this.hud.showToast(label);
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

    this.updateRoomPuzzles(dtMs);

    // Combat lock-in / clear
    for (const rm of this.wfcRooms.values()) {
      rm.chest?.chest.update(dtMs);

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
        if (rm.plan.puzzleKind === 'ambush' && !rm.puzzleSolved) {
          this.solveRoomPuzzle(rm, 'Ambush Cleared!');
        } else if (rm.plan.puzzleKind === 'spike_gauntlet' && !rm.puzzleSolved) {
          this.solveRoomPuzzle(rm, 'Spike Gauntlet Cleared!');
        }
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
      } else if (rm.plan.puzzleKind === 'spike_gauntlet' && rm.cleared && !rm.puzzleSolved) {
        this.solveRoomPuzzle(rm, 'Spike Gauntlet Cleared!');
      }
    }
  }

  private updateRoomPuzzles(dtMs: number): void {
    for (const rm of this.wfcRooms.values()) {
      rm.pushCooldownMs = Math.max(0, rm.pushCooldownMs - dtMs);
      rm.hazardCooldownMs = Math.max(0, rm.hazardCooldownMs - dtMs);

      if (rm.puzzleSolved) continue;
      const pk = rm.plan.puzzleKind;
      if (!pk) continue;

      // 1. Respawnable free in-room kegs & frost crystals (prevents soft-locks)
      for (const keg of rm.kegs) {
        if (keg.exploded && pk === 'bomb_rubble') {
          keg.respawnMs -= dtMs;
          if (keg.respawnMs <= 0) {
            keg.exploded = false;
            keg.x = keg.homeX;
            keg.y = keg.homeY;
            keg.spr.setVisible(true).setScale(1.1);
            keg.ring.setVisible(true);
            spawnBurstParticles(this, keg.x, keg.y, 0xff8c42, 5);
          }
        }
      }
      for (const cry of rm.frostCrystals) {
        if (cry.broken) {
          cry.respawnMs -= dtMs;
          if (cry.respawnMs <= 0) {
            cry.broken = false;
            cry.spr.setVisible(true).setScale(1);
            spawnBurstParticles(this, cry.x, cry.y, 0x8be9ff, 5);
          }
        }
      }

      // 2. Timed countdown bar (`timed_plates` & `brazier_chain`)
      if (rm.timedResetMs > 0 && rm.timedMaxMs > 0) {
        rm.timedResetMs -= dtMs;
        const ratio = Math.max(0, rm.timedResetMs / rm.timedMaxMs);
        rm.timerBarBg?.setVisible(true);
        rm.timerBarFill?.setVisible(true).setSize(52 * ratio, 2.5);
        rm.timerBarFill?.setFillStyle(ratio < 0.35 ? 0xff4757 : 0xffe066);
        if (rm.timedResetMs <= 0) {
          rm.timedResetMs = 0;
          rm.timerBarBg?.setVisible(false);
          rm.timerBarFill?.setVisible(false);
          SFX.playUiError();
          if (pk === 'timed_plates') {
            for (const sw of rm.sigils) {
              sw.active = false;
              sw.spr.setTexture('ui_icons/sigil_off');
            }
            spawnFloatingText(this, rm.cx, rm.cy - 18, 'Time Up!', '#ff6b6b');
          } else if (pk === 'brazier_chain') {
            for (const bz of rm.braziers) {
              bz.lit = false;
              bz.flameSpr?.destroy();
              bz.flameSpr = undefined;
              bz.spr.setVisible(true).setTint(0x4a5568).setAlpha(0.75);
            }
            spawnFloatingText(this, rm.cx, rm.cy - 18, 'Braziers Extinguished!', '#ff6b6b');
          }
        }
      }

      // 3. Memory runes demo sequence flash
      if (pk === 'memory_runes' && rm.plan.id === this.currentRoomId && rm.orderedIdx === 0 && rm.memorySeq.length > 0) {
        rm.memoryFlashMs -= dtMs;
        if (rm.memoryFlashMs <= 0) {
          const stepIdx = rm.memoryShowIdx;
          if (stepIdx < rm.memorySeq.length) {
            const target = rm.sigils[rm.memorySeq[stepIdx]];
            if (target) {
              this.tweens.add({ targets: target.spr, scale: { from: 1, to: 1.45 }, duration: 200, yoyo: true });
              spawnShockwaveRing(this, target.x, target.y, target.color ?? 0xd875ff, 18, 280);
            }
            rm.memoryShowIdx += 1;
            rm.memoryFlashMs = 520;
          } else {
            rm.memoryShowIdx = 0;
            rm.memoryFlashMs = 1350;
          }
        }
      }

      // 4. Sigil / plate stepping mechanics
      if (rm.sigils.length > 0) {
        if (pk === 'sigils' || pk === 'timed_plates' || pk === 'safe_path' || pk === 'sentinel_statue') {
          for (const sw of rm.sigils) {
            if (!sw.active && Math.hypot(sw.x - this.player.x, sw.y - this.player.y) <= 13) {
              sw.active = true;
              sw.spr.setTexture('ui_icons/sigil_on');
              SFX.playSwitch();
              spawnShockwaveRing(this, sw.x, sw.y, sw.color ?? 0x7ac7ff, 22, 260);
              if (pk === 'timed_plates' && rm.timedResetMs <= 0) {
                rm.timedResetMs = 4500;
                rm.timedMaxMs = 4500;
              }
            }
          }
          if (rm.sigils.every((s) => s.active)) {
            const label =
              pk === 'timed_plates'
                ? 'Timed Plates Solved!'
                : pk === 'safe_path'
                  ? 'Safe Path Cleared!'
                  : pk === 'sentinel_statue'
                    ? 'Sentinel Disarmed!'
                    : 'Sigils Activated!';
            this.solveRoomPuzzle(rm, label);
            continue;
          }
        } else if (pk === 'ordered_sigils') {
          for (let idx = 0; idx < rm.sigils.length; idx++) {
            const sw = rm.sigils[idx];
            if (!sw.active && Math.hypot(sw.x - this.player.x, sw.y - this.player.y) <= 13) {
              if (idx === rm.orderedIdx) {
                sw.active = true;
                sw.spr.setTexture('ui_icons/sigil_on');
                rm.orderedIdx += 1;
                SFX.playSwitch();
                spawnShockwaveRing(this, sw.x, sw.y, 0xffe066, 22, 260);
                if (rm.orderedIdx >= rm.sigils.length) {
                  this.solveRoomPuzzle(rm, 'Ordered Sigils Solved!');
                }
              } else {
                SFX.playUiError();
                rm.orderedIdx = 0;
                for (const s of rm.sigils) {
                  s.active = false;
                  s.spr.setTexture('ui_icons/sigil_off').setTint(0xff4757);
                  this.time.delayedCall(260, () => {
                    if (s.spr.active && !s.active) s.spr.clearTint();
                  });
                }
                spawnFloatingText(this, sw.x, sw.y - 14, 'Wrong Order! 1->2->3', '#ff6b6b');
              }
              break;
            }
          }
        } else if (pk === 'memory_runes') {
          for (let idx = 0; idx < rm.sigils.length; idx++) {
            const sw = rm.sigils[idx];
            if (!sw.active && Math.hypot(sw.x - this.player.x, sw.y - this.player.y) <= 13) {
              if (idx === rm.memorySeq[rm.orderedIdx]) {
                sw.active = true;
                sw.spr.setTexture('ui_icons/sigil_on');
                rm.orderedIdx += 1;
                SFX.playSwitch();
                spawnShockwaveRing(this, sw.x, sw.y, sw.color ?? 0xd875ff, 22, 260);
                if (rm.orderedIdx >= rm.memorySeq.length) {
                  this.solveRoomPuzzle(rm, 'Memory Runes Solved!');
                }
              } else {
                SFX.playUiError();
                rm.orderedIdx = 0;
                rm.memoryShowIdx = 0;
                rm.memoryFlashMs = 350;
                for (const s of rm.sigils) {
                  s.active = false;
                  s.spr.setTexture('ui_icons/sigil_off');
                }
                spawnShockwaveRing(this, sw.x, sw.y, 0xff4757, 22, 260);
                spawnFloatingText(this, sw.x, sw.y - 14, 'Wrong Rune!', '#ff6b6b');
              }
              break;
            }
          }
        } else if (pk === 'mirror_plates') {
          const twins = rm.sigils.filter((s) => !s.isCenterSeal);
          const center = rm.sigils.find((s) => s.isCenterSeal);
          for (const tw of twins) {
            if (!tw.active && Math.hypot(tw.x - this.player.x, tw.y - this.player.y) <= 13) {
              tw.active = true;
              tw.spr.setTexture('ui_icons/sigil_on');
              SFX.playSwitch();
              spawnShockwaveRing(this, tw.x, tw.y, 0x74e5ff, 22, 260);
            }
          }
          if (center && !center.active && Math.hypot(center.x - this.player.x, center.y - this.player.y) <= 13) {
            if (twins.every((t) => t.active)) {
              center.active = true;
              center.spr.setTexture('ui_icons/sigil_on');
              SFX.playSwitch();
              this.solveRoomPuzzle(rm, 'Mirror Seal Unlocked!');
            } else if (rm.hazardCooldownMs <= 0) {
              rm.hazardCooldownMs = 900;
              spawnFloatingText(this, center.x, center.y - 14, 'Step Twin Plates First!', '#74e5ff');
            }
          }
        } else if (pk === 'shadow_lanterns' && rm.lanterns.every((l) => l.lit)) {
          const finalSigil = rm.sigils[0];
          if (finalSigil && !finalSigil.active && Math.hypot(finalSigil.x - this.player.x, finalSigil.y - this.player.y) <= 13) {
            finalSigil.active = true;
            finalSigil.spr.setTexture('ui_icons/sigil_on');
            this.solveRoomPuzzle(rm, 'Shadow Dispelled!');
          }
        }
      }

      // 5. Safe Path cursed red tiles
      if (pk === 'safe_path') {
        for (const ht of rm.hazardTiles) {
          if (ht.active && Math.hypot(ht.x - this.player.x, ht.y - this.player.y) <= 10 && rm.hazardCooldownMs <= 0) {
            rm.hazardCooldownMs = 750;
            SFX.playUiError();
            for (const sw of rm.sigils) {
              sw.active = false;
              sw.spr.setTexture('ui_icons/sigil_off');
            }
            spawnShockwaveRing(this, ht.x, ht.y, 0xff4757, 20, 220);
            spawnFloatingText(this, ht.x, ht.y - 12, 'Cursed Tile! Reset!', '#ff6b6b');
          }
        }
      }

      // 6. Push blocks & Ice slide blocks
      if (rm.pushBlocks.length > 0) {
        const dtSec = dtMs / 1000;
        for (const blk of rm.pushBlocks) {
          if (blk.locked) continue;
          if (blk.vx !== 0 || blk.vy !== 0) {
            const nx = blk.x + blk.vx * dtSec;
            const ny = blk.y + blk.vy * dtSec;
            if (this.canBlockOccupy(rm, blk, nx, ny)) {
              blk.x = nx;
              blk.y = ny;
              blk.spr.setPosition(blk.x, blk.y).setDepth(blk.y);
            } else {
              blk.vx = 0;
              blk.vy = 0;
              SFX.playStoneCrack();
            }
            this.checkBlockSocketSnap(rm, blk);
          } else if (rm.pushCooldownMs <= 0) {
            const dx = blk.x - this.player.x;
            const dy = blk.y - this.player.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= 14.5) {
              const stepX = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0;
              const stepY = Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0;
              if (blk.ice) {
                if (this.canBlockOccupy(rm, blk, blk.x + stepX * 6, blk.y + stepY * 6)) {
                  blk.vx = stepX * 145;
                  blk.vy = stepY * 145;
                  rm.pushCooldownMs = 220;
                  SFX.playSwitch();
                }
              } else {
                const tx = Math.round((blk.x - 8) / TILE_PX) * TILE_PX + 8 + stepX * TILE_PX;
                const ty = Math.round((blk.y - 8) / TILE_PX) * TILE_PX + 8 + stepY * TILE_PX;
                if (this.canBlockOccupy(rm, blk, tx, ty)) {
                  blk.x = tx;
                  blk.y = ty;
                  blk.spr.setPosition(blk.x, blk.y).setDepth(blk.y);
                  rm.pushCooldownMs = 200;
                  SFX.playStoneCrack();
                  this.checkBlockSocketSnap(rm, blk);
                }
              }
            }
          }
        }
        if (rm.sockets.length > 0 && rm.sockets.every((s) => s.filled)) {
          this.solveRoomPuzzle(rm, pk === 'ice_slide_block' ? 'Ice Block Socketed!' : 'Block Puzzle Solved!');
        }
      }

      // 7. Frost vents steam particles
      for (const fv of rm.frostVents) {
        if (fv.quenched) continue;
        fv.steamTimerMs -= dtMs;
        if (fv.steamTimerMs <= 0) {
          fv.steamTimerMs = 420;
          spawnBurstParticles(this, fv.x, fv.y - 2, 0xbef8ff, 2);
        }
      }

      // 8. Lightning pylons charge decay & arc check
      if (pk === 'lightning_pylons' && rm.pylons.length >= 2) {
        for (const py of rm.pylons) {
          if (py.chargedMs > 0) {
            py.chargedMs = Math.max(0, py.chargedMs - dtMs);
            py.ring.setStrokeStyle(1.8, 0x74e5ff, py.chargedMs > 0 ? 0.95 : 0.7);
            if (py.chargedMs <= 0) {
              py.spr.setTint(0xc07dff);
            }
          }
        }
        if (rm.pylons.every((p) => p.chargedMs > 0)) {
          const [p1, p2] = rm.pylons;
          const gfx = this.add.graphics().setDepth(6500);
          gfx.lineStyle(2, 0x74e5ff, 0.95);
          gfx.beginPath();
          gfx.moveTo(p1.x, p1.y);
          for (let s = 1; s <= 5; s++) {
            const t = s / 6;
            const lx = Phaser.Math.Linear(p1.x, p2.x, t);
            const ly = Phaser.Math.Linear(p1.y, p2.y, t) + (Math.random() - 0.5) * 14;
            gfx.lineTo(lx, ly);
          }
          gfx.lineTo(p2.x, p2.y);
          gfx.strokePath();
          this.time.delayedCall(450, () => gfx.destroy());
          spawnShockwaveRing(this, p1.x, p1.y, 0x74e5ff, 26, 260);
          spawnShockwaveRing(this, p2.x, p2.y, 0x74e5ff, 26, 260);
          this.solveRoomPuzzle(rm, 'Lightning Pylons Linked!');
        }
      }

      // 9. Sentinel statue rotating beam
      if (pk === 'sentinel_statue' && rm.sentinel && !rm.sentinel.disabled) {
        const sent = rm.sentinel;
        sent.angle = (sent.angle + dtMs * 0.00135) % (Math.PI * 2);
        const beamLen = 74;
        const ex = sent.x + Math.cos(sent.angle) * beamLen;
        const ey = sent.y + Math.sin(sent.angle) * beamLen;
        sent.beam.clear();
        sent.beam.lineStyle(3, 0xd875ff, 0.35);
        sent.beam.lineBetween(sent.x, sent.y - 2, ex, ey - 2);
        sent.beam.lineStyle(1.3, 0xff9ff3, 0.95);
        sent.beam.lineBetween(sent.x, sent.y - 2, ex, ey - 2);
        if (rm.plan.id === this.currentRoomId && rm.hazardCooldownMs <= 0) {
          const px = this.player.x - sent.x;
          const py = this.player.y - sent.y;
          const proj = px * Math.cos(sent.angle) + py * Math.sin(sent.angle);
          if (proj > 8 && proj < beamLen) {
            const perp = Math.abs(px * -Math.sin(sent.angle) + py * Math.cos(sent.angle));
            if (perp <= 7) {
              rm.hazardCooldownMs = 850;
              const dmg = 4;
              if (this.player.takeDamage(dmg, Math.cos(sent.angle), Math.sin(sent.angle), this.isWalkable)) {
                spawnFloatingText(this, this.player.x, this.player.y - 14, `-${dmg}`, '#ff5e6c');
                if (gameState.hp <= 0) {
                  this.handleDungeonPlayerDeath();
                  return;
                }
              }
            }
          }
        }
      }

      // 10. Spike gauntlet alternating telegraphed spike tiles
      if (pk === 'spike_gauntlet' && rm.hazardTiles.length > 0) {
        rm.spikeTimerMs += dtMs;
        if (rm.spikeTimerMs >= 1800) {
          rm.spikeTimerMs = 0;
          rm.spikePhase = 1 - rm.spikePhase;
        }
        const warning = rm.spikeTimerMs >= 1200;
        for (const ht of rm.hazardTiles) {
          const isActiveGroup = ht.group === rm.spikePhase;
          ht.active = isActiveGroup;
          if (isActiveGroup) {
            ht.spr.setFillStyle(0xff4757, 0.72).setStrokeStyle(1.3, 0xffffff, 0.9);
            if (rm.plan.id === this.currentRoomId && rm.hazardCooldownMs <= 0 && Math.hypot(ht.x - this.player.x, ht.y - this.player.y) <= 9) {
              rm.hazardCooldownMs = 800;
              const dmg = 4;
              if (this.player.takeDamage(dmg, 0, 1, this.isWalkable)) {
                spawnFloatingText(this, this.player.x, this.player.y - 14, `-${dmg}`, '#ff5e6c');
                if (gameState.hp <= 0) {
                  this.handleDungeonPlayerDeath();
                  return;
                }
              }
            }
          } else if (warning) {
            ht.spr.setFillStyle(0xffa502, 0.42).setStrokeStyle(1.1, 0xffd95a, 0.85);
          } else {
            ht.spr.setFillStyle(0x4b5563, 0.5).setStrokeStyle(1, 0x9ca3af, 0.6);
          }
        }
      }
    }
  }

  private canBlockOccupy(rm: WfcRoomRuntime, movingBlk: WfcPushBlock, wx: number, wy: number): boolean {
    const minX = (rm.ox + 1) * TILE_PX + 7;
    const maxX = (rm.ox + WFC_ROOM_W - 1) * TILE_PX - 7;
    const minY = (rm.oy + 1) * TILE_PX + 7;
    const maxY = (rm.oy + WFC_ROOM_H - 1) * TILE_PX - 7;
    if (wx < minX || wx > maxX || wy < minY || wy > maxY) return false;
    if (rm.chest && Math.hypot(wx - rm.chest.chest.x, wy - rm.chest.chest.y) < 14) return false;
    for (const pil of this.pillarObstacles) {
      if (Math.hypot(wx - pil.x, wy - pil.y) < 12) return false;
    }
    for (const other of rm.pushBlocks) {
      if (other !== movingBlk && Math.hypot(wx - other.x, wy - other.y) < 12) return false;
    }
    return true;
  }

  private checkBlockSocketSnap(rm: WfcRoomRuntime, blk: WfcPushBlock): void {
    for (const sock of rm.sockets) {
      if (!sock.filled && Math.hypot(blk.x - sock.x, blk.y - sock.y) <= 10) {
        blk.x = sock.x;
        blk.y = sock.y;
        blk.vx = 0;
        blk.vy = 0;
        blk.locked = true;
        blk.spr.setPosition(blk.x, blk.y).setTint(0x7ef29d).setDepth(blk.y);
        sock.filled = true;
        sock.spr.setFillStyle(0x7ef29d, 0.45).setStrokeStyle(1.4, 0x7ef29d, 0.95);
        SFX.playSwitch();
        spawnShockwaveRing(this, sock.x, sock.y, 0x7ef29d, 20, 240);
        return;
      }
    }
  }

  private hitRoomPuzzleTargets(
    wx: number,
    wy: number,
    radius: number,
    sourceKind: 'melee' | 'bomb' | 'water' | ActiveProjectile['kind'],
    bombSpec?: BombSpec,
  ): void {
    if (!this.wfcLayout) return;
    for (const rm of this.wfcRooms.values()) {
      // Braziers (melee, fire rod, or fire/alchemist bomb)
      if (sourceKind === 'melee' || sourceKind === 'fire' || (sourceKind === 'bomb' && bombSpec?.ignitesBraziers)) {
        for (const bz of rm.braziers) {
          if (!bz.lit && Math.hypot(bz.x - wx, bz.y - wy) <= radius) {
            this.igniteBrazier(rm, bz);
          }
        }
      }
      // Shadow lanterns (melee, fire rod, or fire/alchemist bomb)
      if (sourceKind === 'melee' || sourceKind === 'fire' || (sourceKind === 'bomb' && bombSpec?.ignitesBraziers)) {
        for (const lt of rm.lanterns) {
          if (!lt.lit && Math.hypot(lt.x - wx, lt.y - wy) <= radius) {
            this.lightLantern(rm, lt);
          }
        }
      }
      // Levers (any weapon/bomb except water)
      if (sourceKind !== 'water') {
        for (const lv of rm.levers) {
          if (!lv.pulled && Math.hypot(lv.x - wx, lv.y - wy) <= radius) {
            this.pullLever(rm, lv);
          }
        }
      }
      // Frost vents (Frost Bomb, Ice Rod, or Watering Can)
      if (sourceKind === 'water' || sourceKind === 'ice' || (sourceKind === 'bomb' && bombSpec?.quenchesVents)) {
        for (const fv of rm.frostVents) {
          if (!fv.quenched && Math.hypot(fv.x - wx, fv.y - wy) <= radius) {
            fv.quenched = true;
            fv.spr.setFillStyle(0x4a5568, 0.35);
            fv.ring.setStrokeStyle(1, 0x7ef29d, 0.65);
            SFX.playWaterSplash();
            spawnShockwaveRing(this, fv.x, fv.y, 0x74e5ff, 20, 220);
          }
        }
        if (!rm.puzzleSolved && rm.frostVents.length > 0 && rm.frostVents.every((v) => v.quenched)) {
          this.solveRoomPuzzle(rm, 'Frost Vents Quenched!');
        }
      }
      // Free in-room Frost Crystals (any hit shatters crystal and quenches all room vents)
      if (sourceKind !== 'water') {
        for (const cry of rm.frostCrystals) {
          if (!cry.broken && Math.hypot(cry.x - wx, cry.y - wy) <= radius) {
            cry.broken = true;
            cry.respawnMs = 2500;
            cry.spr.setVisible(false);
            SFX.playShatter();
            spawnShockwaveRing(this, cry.x, cry.y, 0x8be9ff, 58, 320);
            spawnBurstParticles(this, cry.x, cry.y, 0x8be9ff, 12);
            for (const fv of rm.frostVents) {
              fv.quenched = true;
              fv.spr.setFillStyle(0x4a5568, 0.35);
              fv.ring.setStrokeStyle(1, 0x7ef29d, 0.65);
            }
            if (!rm.puzzleSolved && rm.frostVents.length > 0) {
              this.solveRoomPuzzle(rm, 'Frost Vents Quenched!');
            }
          }
        }
      }
      // Bomb Rubble (only bombs or powder keg blasts shatter rubble)
      if (sourceKind === 'bomb') {
        for (const rb of rm.rubble) {
          if (!rb.broken && Math.hypot(rb.x - wx, rb.y - wy) <= radius) {
            rb.broken = true;
            rb.spr.destroy();
            SFX.playStoneCrack();
            spawnBurstParticles(this, rb.x, rb.y, 0xc8a47c, 10);
          }
        }
        if (!rm.puzzleSolved && rm.rubble.length > 0 && rm.rubble.every((r) => r.broken)) {
          this.solveRoomPuzzle(rm, 'Rubble Cleared!');
        }
      } else if (sourceKind === 'melee') {
        for (const rb of rm.rubble) {
          if (!rb.broken && Math.hypot(rb.x - wx, rb.y - wy) <= radius && SFX.canPlay('rubbleHint', 1200)) {
            spawnFloatingText(this, rb.x, rb.y - 12, 'Use Bomb or Keg!', '#ff8c6b');
          }
        }
      }
      // Powder Kegs (any strike/projectile/bomb detonates keg)
      if (sourceKind !== 'water') {
        for (const keg of rm.kegs) {
          if (!keg.exploded && Math.hypot(keg.x - wx, keg.y - wy) <= radius) {
            this.detonatePowderKeg(rm, keg);
          }
        }
      }
      // Lightning Pylons (any attack charges pylon for 4s)
      if (sourceKind !== 'water') {
        for (const py of rm.pylons) {
          if (!rm.puzzleSolved && Math.hypot(py.x - wx, py.y - wy) <= radius) {
            py.chargedMs = 4000;
            py.spr.setTint(0x74e5ff);
            SFX.playCast();
            spawnShockwaveRing(this, py.x, py.y, 0x74e5ff, 22, 240);
            spawnFloatingText(this, py.x, py.y - 12, 'Charged!', '#74e5ff');
          }
        }
      }
      // Crystal Totems
      if (sourceKind !== 'water') {
        for (const tot of rm.totems) {
          if (!tot.broken && Math.hypot(tot.x - wx, tot.y - wy) <= radius) {
            tot.hp -= sourceKind === 'bomb' ? 3 : 1;
            tot.spr.setTintFill(0xffffff);
            if (tot.hp <= 0) {
              tot.broken = true;
              tot.spr.destroy();
              tot.ring.destroy();
              SFX.playShatter();
              spawnBurstParticles(this, tot.x, tot.y, 0xe082ff, 10);
            } else {
              SFX.playHit();
              this.time.delayedCall(70, () => {
                if (tot.spr.active && !tot.broken) tot.spr.setTint(0xe082ff);
              });
            }
          }
        }
        if (!rm.puzzleSolved && rm.totems.length > 0 && rm.totems.every((t) => t.broken)) {
          this.solveRoomPuzzle(rm, 'Crystal Totems Shattered!');
        }
      }
      // Bullseye Targets
      if (sourceKind !== 'water') {
        for (const tgt of rm.targets) {
          if (!tgt.hit && Math.hypot(tgt.x - wx, tgt.y - wy) <= radius) {
            tgt.hit = true;
            tgt.spr.setFillStyle(0x7ef29d, 0.9).setStrokeStyle(1.4, 0xffe066, 1);
            tgt.inner.setFillStyle(0xffffff, 1);
            SFX.playSwitch();
            spawnShockwaveRing(this, tgt.x, tgt.y, 0x7ef29d, 20, 240);
          }
        }
        if (!rm.puzzleSolved && rm.targets.length > 0 && rm.targets.every((t) => t.hit)) {
          this.solveRoomPuzzle(rm, 'Bullseye Targets Hit!');
        }
      }
    }
  }

  private detonatePowderKeg(
    rm: WfcRoomRuntime,
    keg: WfcRoomRuntime['kegs'][number],
  ): void {
    if (keg.exploded) return;
    keg.exploded = true;
    keg.respawnMs = 2500;
    keg.spr.setVisible(false);
    keg.ring.setVisible(false);
    this.triggerDungeonBlast(keg.x, keg.y, 50, 56, 0xff6b4a, 0, true, true);
    if (rm.plan.puzzleKind === 'powder_keg_chain') {
      const remaining = rm.kegs.filter((k) => !k.exploded);
      remaining.forEach((nextKeg, idx) => {
        this.time.delayedCall(150 * (idx + 1), () => {
          if (this.sys?.isActive() && !nextKeg.exploded) {
            this.detonatePowderKeg(rm, nextKeg);
          }
        });
      });
      if (!rm.puzzleSolved && rm.kegs.every((k) => k.exploded)) {
        this.solveRoomPuzzle(rm, 'Powder Keg Chain Detonated!');
      }
    }
  }

  private pullLever(rm: WfcRoomRuntime, lv: WfcRoomRuntime['levers'][number]): void {
    if (lv.pulled) return;
    lv.pulled = true;
    lv.spr.setTint(0x7ef29d).setAngle(18);
    lv.label?.setVisible(false);
    SFX.playSwitch();
    spawnShockwaveRing(this, lv.x, lv.y, 0x7ef29d, 24, 260);
    if (!rm.puzzleSolved && rm.levers.every((l) => l.pulled)) {
      this.solveRoomPuzzle(rm, 'Lever Pulled!');
    }
  }

  private lightLantern(rm: WfcRoomRuntime, lt: WfcRoomRuntime['lanterns'][number]): void {
    if (lt.lit) return;
    lt.lit = true;
    lt.spr.clearTint();
    lt.ring.setStrokeStyle(1.4, 0xffe066, 0.95);
    SFX.playSwitch();
    spawnBurstParticles(this, lt.x, lt.y - 4, 0xffe066, 8);
    const litCount = rm.lanterns.filter((l) => l.lit).length;
    if (rm.darkOverlay) {
      const nextAlpha = Math.max(0, 0.62 - litCount * 0.31);
      this.tweens.add({ targets: rm.darkOverlay, alpha: nextAlpha, duration: 240 });
    }
    if (rm.lanterns.every((l) => l.lit)) {
      const finalSigil = rm.sigils[0];
      if (finalSigil) {
        finalSigil.spr.setVisible(true);
        spawnShockwaveRing(this, finalSigil.x, finalSigil.y, 0xffe066, 26, 320);
        this.createRoomHint(rm, 'Step on the Revealed Sigil!', '#7ef29d');
      }
    }
  }

  private startLockpickVault(rm: WfcRoomRuntime): void {
    if (this.lockpickMinigame.isActive() || !rm.chest) return;
    this.hud.setTouchActionHint('Pick Pin');
    this.lockpickMinigame.start(
      (unlocked) => {
        this.hud.setTouchActionHint(null);
        if (unlocked && rm.chest) {
          rm.vaultLockpick = false;
          rm.puzzleSolved = true;
          rm.chest.chest.unlock('Vault Chest');
          this.openWfcChest(rm);
          this.solveRoomPuzzle(rm, 'Vault Unlocked!');
        } else {
          this.hud.showToast('Pick snapped — try again!');
        }
      },
      { title: 'Dungeon Vault Lock' },
    );
  }

  private igniteBrazier(rm: WfcRoomRuntime, bz: WfcBrazierRuntime): void {
    if (bz.lit) return;
    bz.lit = true;
    bz.spr.clearTint().setAlpha(1);
    if (this.anims.exists('prop_bonfire')) {
      const animSpr = this.add.sprite(bz.x, bz.y, 'extras/Bonfire', 0).setDepth(bz.y + 1);
      animSpr.play('prop_bonfire');
      bz.flameSpr = animSpr;
      bz.spr.setVisible(false);
    }
    SFX.playSwitch();
    spawnBurstParticles(this, bz.x, bz.y - 4, 0xffaa44, 8);
    if (rm.plan.puzzleKind === 'brazier_chain' && rm.timedResetMs <= 0 && !rm.puzzleSolved) {
      rm.timedResetMs = 6000;
      rm.timedMaxMs = 6000;
    }
    if (!rm.puzzleSolved && rm.braziers.every((b) => b.lit)) {
      this.solveRoomPuzzle(rm, 'Braziers Lit!');
    }
  }

  private detonateBomb(bx: number, by: number, spec: BombSpec): void {
    this.triggerDungeonBlast(bx, by, spec.damage, spec.radius, spec.tint, spec.slowsMs, true, true, spec);
    if (spec.clusterCount > 0) {
      const miniDmg = Math.max(18, Math.round(spec.damage * 0.45));
      const miniRadius = Math.max(22, Math.round(spec.radius * 0.55));
      for (let c = 0; c < spec.clusterCount; c++) {
        const ang = (Math.PI * 2 * c) / spec.clusterCount + Math.random() * 0.4;
        const dist = 16 + Math.random() * (spec.radius * 0.55);
        const cx = bx + Math.cos(ang) * dist;
        const cy = by + Math.sin(ang) * dist;
        this.time.delayedCall(120 + c * 75, () => {
          if (!this.sys?.isActive()) return;
          this.triggerDungeonBlast(cx, cy, miniDmg, miniRadius, spec.tint, spec.slowsMs, false, false, spec);
        });
      }
    }
  }

  private triggerDungeonBlast(
    bx: number,
    by: number,
    damage: number,
    radius: number,
    tint: number,
    slowsMs: number,
    _isPrimary: boolean,
    triggerPuzzleTargets: boolean,
    spec?: BombSpec,
  ): void {
    SFX.playExplosion();
    spawnMaxBombExplosionJuice(this, bx, by, radius, tint, spec?.id ?? 'bomb', this.cameraRig);
    const fxScale = Math.max(2.0, (radius / 44) * 3.5);
    const fx = this.add
      .sprite(bx, by, 'projectiles/Bomb_impact')
      .setScale(fxScale)
      .setDepth(6000)
      .setBlendMode(Phaser.BlendModes.ADD);
    if (tint !== 0xffffff) fx.setTint(tint);
    fx.play('fx_bomb_impact');
    fx.once('animationcomplete', () => fx.destroy());

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.active || e.isDead || (!this.wfcLayout && e === this.boss && !this.gateOpen)) continue;
      if (Math.hypot(e.x - bx, e.y - by) <= radius) {
        const d = Math.hypot(e.x - bx, e.y - by) || 1;
        if (slowsMs > 0) e.applySlow(slowsMs);
        this.damageEnemy(e, damage, (e.x - bx) / d, (e.y - by) / d);
      }
    }
    for (const bp of this.breakables) {
      if (!bp.broken && Math.hypot(bp.x - bx, bp.y - by) <= radius) {
        bp.hp = 1;
        this.shatterBreakable(bp);
      }
    }
    if (triggerPuzzleTargets) {
      this.hitRoomPuzzleTargets(bx, by, radius, 'bomb', spec);
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
        for (const blk of rm.pushBlocks) {
          if (Math.hypot(wx - blk.x, wy - blk.y) < 8) return false;
        }
        for (const rb of rm.rubble) {
          if (!rb.broken && Math.hypot(wx - rb.x, wy - rb.y) < 8.5) return false;
        }
        if (rm.sentinel && Math.hypot(wx - rm.sentinel.x, wy - rm.sentinel.y) < 8.5) return false;
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

    const lockpickActive = this.lockpickMinigame.isActive();

    gamepadManager.poll();
    if (dialogueBox.isActive()) {
      if (gamepadManager.isJustPressed('primaryAction')) {
        dialogueBox.advance();
      } else if (gamepadManager.isJustPressed('dash') || gamepadManager.isJustPressed('menu')) {
        dialogueBox.close(true);
      }
    } else if (this.hud.activeModal !== 'none') {
      if (gamepadManager.isJustPressed('menu') || gamepadManager.isJustPressed('dash')) {
        this.hud.closeModal();
      }
    } else if (!lockpickActive) {
      if (gamepadManager.isJustPressed('menu')) {
        this.hud.toggleModal('settings' as never);
      } else if (gamepadManager.isJustPressed('inventory')) {
        this.hud.toggleModal('inventory');
      } else if (gamepadManager.isJustPressed('craft')) {
        this.hud.toggleModal('craft');
      } else if (gamepadManager.isJustPressed('quests')) {
        this.hud.toggleModal('quests');
      } else if (gamepadManager.isJustPressed('map')) {
        this.hud.toggleModal('map');
      } else if (gamepadManager.isJustPressed('minimap')) {
        this.hud.toggleMinimap();
      }
    }

    if (
      !lockpickActive &&
      (Phaser.Input.Keyboard.JustDown(this.keys.E) ||
        (!this.hud.isBlockingInput() && gamepadManager.isJustPressed('interact')))
    ) {
      this.tryInteractPortal();
    }

    if (!this.hud.isBlockingInput() && !this.cameraRig.isFocusing() && !lockpickActive) {
      if (gamepadManager.isJustPressed('hotbarPrev')) {
        gameState.selectedHotbarIndex = (gameState.selectedHotbarIndex + 8) % 9;
        SFX.playHotbarSelect();
        this.hud.render();
      } else if (gamepadManager.isJustPressed('hotbarNext')) {
        gameState.selectedHotbarIndex = (gameState.selectedHotbarIndex + 1) % 9;
        SFX.playHotbarSelect();
        this.hud.render();
      }
      const tv = this.hud.getTouchMoveVector();
      const gp = gamepadManager.getMoveVector();
      const dir = new Phaser.Math.Vector2(
        (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0) -
          (this.keys.A.isDown || this.keys.LEFT.isDown ? 1 : 0) +
          tv.x +
          gp.x,
        (this.keys.S.isDown || this.keys.DOWN.isDown ? 1 : 0) -
          (this.keys.W.isDown || this.keys.UP.isDown ? 1 : 0) +
          tv.y +
          gp.y,
      );
      if (dir.lengthSq() > 1) dir.normalize();
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || gamepadManager.isJustPressed('dash')) {
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
      if (gamepadManager.isJustPressed('primaryAction')) {
        const f = this.player.facing;
        const fx = f === 'left' ? -1 : f === 'right' ? 1 : 0;
        const fy = f === 'up' ? -1 : f === 'down' ? 1 : 0;
        this.handleAttack(this.player.x + fx * 20, this.player.y + fy * 20);
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
              const vx = Math.cos(ang) * speed;
              const vy = Math.sin(ang) * speed;
              const spr = this.add
                .image(fromX, fromY, tex)
                .setRotation(getProjectileRotation(vx, vy))
                .setTint(meta.tint)
                .setScale(meta.isNova ? 1.35 : 0.9)
                .setDepth(5000);
              this.projectiles.push({
                sprite: spr,
                vx,
                vy,
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
              this.handleDungeonPlayerDeath();
            }
          }
        },
        onFireProjectile: (px, py, vx, vy, dmg, texKey) => {
          const spr = this.add.image(px, py, texKey).setRotation(getProjectileRotation(vx, vy)).setDepth(5000);
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
      p.sprite.setRotation(getProjectileRotation(p.vx, p.vy));
      p.glow?.setPosition(p.sprite.x, p.sprite.y);
      const isRod = p.fromPlayer && p.kind !== 'arrow' && p.kind !== 'enemy';
      if (isRod) {
        spawnRodTrailParticle(this, p.sprite.x, p.sprite.y, p.kind as RodVfxKind);
      }
      let hit = !this.isWalkable(p.sprite.x, p.sprite.y);
      let impactedEnemy = false;

      if (!hit && p.fromPlayer) {
        for (const bp of this.breakables) {
          if (!bp.broken && Math.hypot(bp.x - p.sprite.x, bp.y - p.sprite.y) <= 10) {
            this.shatterBreakable(bp);
            hit = true;
            break;
          }
        }
        if (!hit && this.wfcLayout) {
          for (const rm of this.wfcRooms.values()) {
            const hitPuzzle =
              rm.levers.some((l) => !l.pulled && Math.hypot(l.x - p.sprite.x, l.y - p.sprite.y) <= 12) ||
              rm.kegs.some((k) => !k.exploded && Math.hypot(k.x - p.sprite.x, k.y - p.sprite.y) <= 12) ||
              rm.frostCrystals.some((c) => !c.broken && Math.hypot(c.x - p.sprite.x, c.y - p.sprite.y) <= 12) ||
              rm.pylons.some((py) => !rm.puzzleSolved && Math.hypot(py.x - p.sprite.x, py.y - p.sprite.y) <= 12) ||
              rm.totems.some((t) => !t.broken && Math.hypot(t.x - p.sprite.x, t.y - p.sprite.y) <= 12) ||
              rm.targets.some((tg) => !tg.hit && Math.hypot(tg.x - p.sprite.x, tg.y - p.sprite.y) <= 12) ||
              (p.kind === 'fire' &&
                (rm.braziers.some((b) => !b.lit && Math.hypot(b.x - p.sprite.x, b.y - p.sprite.y) <= 12) ||
                  rm.lanterns.some((l) => !l.lit && Math.hypot(l.x - p.sprite.x, l.y - p.sprite.y) <= 12))) ||
              (p.kind === 'ice' &&
                rm.frostVents.some((fv) => !fv.quenched && Math.hypot(fv.x - p.sprite.x, fv.y - p.sprite.y) <= 12));
            if (hitPuzzle) {
              this.hitRoomPuzzleTargets(p.sprite.x, p.sprite.y, 16, p.kind);
              hit = true;
              break;
            }
          }
        }
        if (!hit) {
          for (const e of this.enemies) {
            if (e.active && !e.isDead && Math.hypot(e.x - p.sprite.x, e.y - p.sprite.y) <= 15) {
              if (p.pierce) {
                let hitSet = this.projectileHitSets.get(p);
                if (hitSet?.has(e)) continue;
                if (!hitSet) {
                  hitSet = new Set<Enemy>();
                  this.projectileHitSets.set(p, hitSet);
                }
                hitSet.add(e);
              }
              const spd = Math.hypot(p.vx, p.vy) || 1;
              const kindStr = p.kind as string;
              if (isRod) {
                spawnRodImpactJuice(this, p.sprite.x, p.sprite.y, p.kind as RodVfxKind, {
                  x: this.player.x,
                  y: this.player.y,
                });
                impactedEnemy = true;
              }
              if (kindStr === 'ice') {
                for (const other of this.enemies) {
                  if (other.active && !other.isDead && Math.hypot(other.x - p.sprite.x, other.y - p.sprite.y) <= 44) {
                    other.applySlow(2800);
                  }
                }
              }
              if (kindStr === 'necro') {
                gameState.hp = Math.min(gameState.getMaxHp(), gameState.hp + 4);
                gameState.emitVitals();
              }
              this.damageEnemy(e, p.damage, p.vx / spd, p.vy / spd);
              if (kindStr === 'fire') {
                const splashDmg = Math.max(1, Math.round(p.damage * 0.25));
                for (const other of this.enemies) {
                  if (
                    other !== e &&
                    other.active &&
                    !other.isDead &&
                    (this.wfcLayout !== null || other !== this.boss || this.gateOpen) &&
                    Math.hypot(other.x - p.sprite.x, other.y - p.sprite.y) <= 38
                  ) {
                    const sdx = other.x - p.sprite.x;
                    const sdy = other.y - p.sprite.y;
                    const sLen = Math.hypot(sdx, sdy) || 1;
                    this.damageEnemy(other, splashDmg, sdx / sLen, sdy / sLen);
                  }
                }
              }
              if (kindStr === 'void') {
                this.cameraRig.addTrauma(0.18);
              }
              if (!p.pierce) {
                hit = true;
                break;
              }
            }
          }
        }
      } else if (!hit && !p.fromPlayer) {
        if (Math.hypot(this.player.x - p.sprite.x, this.player.y - p.sprite.y) <= 10) {
          const spd = Math.hypot(p.vx, p.vy) || 1;
          if (this.player.takeDamage(p.damage, p.vx / spd, p.vy / spd, this.isWalkable)) {
            spawnFloatingText(this, this.player.x, this.player.y - 14, `-${p.damage}`, '#ff5e6c');
            if (gameState.hp <= 0) {
              this.handleDungeonPlayerDeath();
              return;
            }
          }
          hit = true;
        }
      }

      if (hit || p.lifeMs <= 0) {
        if (hit && !impactedEnemy) {
          if (isRod) {
            spawnRodImpactJuice(this, p.sprite.x, p.sprite.y, p.kind as RodVfxKind, {
              x: this.player.x,
              y: this.player.y,
            });
          } else {
            spawnProjectileImpact(this, p.sprite.x, p.sprite.y, p.kind);
          }
        }
        p.sprite.destroy();
        p.glow?.destroy();
        this.projectiles.splice(i, 1);
      }
    }

    // Bombs
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.fuseMs -= dt;
      if (b.fuseMs <= 0) {
        const bx = b.sprite.x;
        const by = b.sprite.y;
        const spec = b.spec;
        b.sprite.destroy();
        b.ring.destroy();
        this.bombs.splice(i, 1);
        this.detonateBomb(bx, by, spec);
      } else {
        if (Math.random() < 0.35) {
          spawnFuseSparks(this, b.sprite.x, b.sprite.y, b.spec.tint);
        }
        if (b.fuseMs <= 350) {
          b.sprite.setTint(Math.floor(b.fuseMs / 50) % 2 === 0 ? 0xffffff : b.spec.tint);
        }
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
    if (lockpickActive) {
      actHint = 'Pick Pin';
    } else if (nearExit || nearReturn) {
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
            actHint = rm.vaultLockpick && rm.chest.chest.locked ? 'PICK' : rm.chest.chest.locked ? 'SEALED' : 'OPEN';
            break;
          }
          if (
            rm.braziers.some((bz) => !bz.lit && Math.hypot(bz.x - this.player.x, bz.y - this.player.y) <= 26) ||
            rm.lanterns.some((lt) => !lt.lit && Math.hypot(lt.x - this.player.x, lt.y - this.player.y) <= 26)
          ) {
            actHint = 'LIGHT';
            break;
          }
          if (rm.levers.some((lv) => !lv.pulled && Math.hypot(lv.x - this.player.x, lv.y - this.player.y) <= 28)) {
            actHint = 'PULL';
            break;
          }
          if (rm.resetRune && !rm.puzzleSolved && Math.hypot(rm.resetRune.x - this.player.x, rm.resetRune.y - this.player.y) <= 24) {
            actHint = 'RESET';
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
      for (const lt of rm.lanterns) {
        if (lt.lit) lights.push({ x: lt.x, y: lt.y, radius: 56, color: 0xffe066, intensity: 1, flicker: true });
      }
      for (const sw of rm.sigils) {
        if (sw.active) lights.push({ x: sw.x, y: sw.y, radius: 24, color: sw.color ?? 0x6ce5ff, intensity: 0.85 });
      }
      for (const py of rm.pylons) {
        if (py.chargedMs > 0) lights.push({ x: py.x, y: py.y, radius: 34, color: 0x74e5ff, intensity: 0.95 });
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
