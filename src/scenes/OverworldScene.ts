import Phaser from 'phaser';
import { gameState, type RanchCreatureSave } from '../core/GameState';
import { computeResponsiveZoom } from '../core/ViewportScaler';
import { getSpeciesByEgg, getSpeciesById, RANCH_SPECIES } from '../data/ranchCreatures';
import { fmtKeyPrompt, fmtKeySuffix, isMobileTouchDevice } from '../core/Platform';
import { SFX } from '../core/SoundFX';
import { startSceneAndWaitCreate, transitionManager } from '../core/TransitionManager';
import { type HouseThemeId } from '../world/HouseLayoutBuilder';
import {
  OUTDOOR_NPC_BUILDINGS,
  computeHouseRoofEaveFrame,
  computeHouseRoofFrame,
  computeHouseWallFrame,
  groupConnectedHouseTiles,
  hasAll4CardinalHouseNeighbors,
} from '../world/OutdoorBuildingStamps';
import { ITEMS } from '../data/items';
import {
  ISLANDS,
  ISLAND_CELL_TILES,
  TILE_PX,
  WORLD_TILES,
  getIslandAt,
  isDungeonPortalEnterable,
  type BiomeKind,
  type DungeonId,
  type IslandSpec,
} from '../data/islands';
import { RECIPES, type CraftingStation } from '../data/recipes';
import {
  MAX_NODES_PER_ISLAND,
  NODE_RESPAWN_INTERVAL_MS,
  STARTER_ISLAND_NODES,
  getLighthouseMultiplier as computeLighthouseMultiplier,
} from '../data/economy';
import {
  drawSlashArc,
  getWeaponSlashColor,
  spawnArcParticles,
  spawnBurstParticles,
  spawnDeathBurst,
  spawnDirectionalSparks,
  spawnFloatingText,
  spawnProjectileImpact,
  spawnProjectileTrail,
  spawnShockwaveRing,
  spawnSparklers,
  type ActiveProjectile,
} from '../entities/CombatHelpers';
import { AmbientCritterSystem } from '../vfx/AmbientCritters';
import { CameraRig } from '../vfx/CameraRig';
import { EffectSequencer } from '../vfx/EffectSequencer';
import { showWorldEmote } from '../vfx/WorldEmote';
import { Enemy } from '../entities/Enemy';
import { LootDrop } from '../entities/LootDrop';
import { FamiliarCompanion, Player } from '../entities/Player';
import { dialogueBox } from '../ui/DialogueBox';
import { FishingMinigame, type FishBehavior } from '../ui/FishingMinigame';
import { tryActivateGadget } from '../entities/GadgetHelper';
import { isFacingTarget, selectBestAimTarget, type AimCandidate } from '../entities/targeting';
import { HudController, type QueuedStationType } from '../ui/HudController';
import { revealSequence } from '../ui/RevealSequence';
import { getBlueprintsForMonster, getBlueprintsForNode, tryUnlockBlueprintFromPool } from '../data/blueprints';
import {
  BIOME_TILESETS,
  computeOverlayTile,
  computeTerrainTile,
  isLand,
  type OverlayType,
  type TerrainType,
} from '../world/AutoTiler';
import { BuildingEntity, getStructurePreviewSpec } from '../world/BuildingEntity';
import { createOverworldPromoTimeline, getPromoConfig, markPromoReady, type PromoTimeline } from '../promo/PromoDirector';
import { INNER_ISLAND_SIZE, generateIslandMask } from '../world/IslandGenerator';
import {
  LightingSystem,
  type PointLightSource,
  type SpotLightSource,
} from '../world/LightingSystem';
import { OceanSystem } from '../world/OceanSystem';
import { ResourceNode, type NodeKind } from '../world/ResourceNode';
import { ensureCleanTilesets } from '../world/TilesetCleaner';
import { WeatherSystem, type WeatherKind } from '../world/WeatherSystem';
import { periodicPerlinFbm2D } from '../world/weatherRules';
import { playSpawnGrowAndJello } from '../vfx/SpawnJuice';

interface ActiveBomb {
  sprite: Phaser.GameObjects.Image;
  fuseMs: number;
}

interface FogCloudPuff {
  sprite: Phaser.GameObjects.Image;
  baseX: number;
  baseY: number;
  baseAlpha: number;
  phase: number;
  driftX: number;
  driftY: number;
  speed: number;
}

interface IslandPurchaseMarker {
  gx: number;
  gy: number;
  veil: Phaser.GameObjects.Image;
  puffs: FogCloudPuff[];
  label?: Phaser.GameObjects.Text;
}

interface NpcEntity {
  spec: NonNullable<IslandSpec['npc']>;
  sprite: Phaser.GameObjects.Sprite;
  promptBox: Phaser.GameObjects.Container;
  promptBg: Phaser.GameObjects.Graphics;
  prompt: Phaser.GameObjects.Text;
  redrawPrompt: () => void;
  x: number;
  y: number;
}

interface RanchEntity {
  save: RanchCreatureSave;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  vx: number;
  vy: number;
  wanderTimerMs: number;
}

interface DungeonPortalEntity {
  dungeonId: DungeonId;
  gx: number;
  gy: number;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  promptBox: Phaser.GameObjects.Container;
  prompt: Phaser.GameObjects.Text;
  redrawPrompt: () => void;
}

export function computeBridgeBobY(tx: number, ty: number, timeMs: number, baseY: number): number {
  const phase = tx * 0.55 + ty * 0.35;
  return baseY + Math.sin((timeMs / 2000) * Math.PI * 2 + phase) * 1.5;
}

export function computeSalvageRefundCount(usedCount: number): number {
  return Math.max(1, Math.floor(usedCount * 0.5));
}

export class OverworldScene extends Phaser.Scene {
  private terrainGrid: TerrainType[][] = [];
  private overlayGrid: OverlayType[][] = [];
  private bridgeSet = new Set<string>();

  private map!: Phaser.Tilemaps.Tilemap;
  private waterLayer!: Phaser.Tilemaps.TilemapLayer;
  private terrainLayer!: Phaser.Tilemaps.TilemapLayer;
  private overlayLayer!: Phaser.Tilemaps.TilemapLayer;
  private freckleGfx?: Phaser.GameObjects.Graphics;
  private freckleStamped = new Set<string>();
  private tilesets!: {
    grass: Phaser.Tilemaps.Tileset;
    autumn: Phaser.Tilemaps.Tileset;
    winter: Phaser.Tilemaps.Tileset;
    coastlines: Phaser.Tilemaps.Tileset;
    dirt: Phaser.Tilemaps.Tileset;
    hoedSoil: Phaser.Tilemaps.Tileset;
    road: Phaser.Tilemaps.Tileset;
  };

  public static readonly SOIL_UNUSED_DECAY_MS = 5 * 60 * 1000;
  public static readonly SOIL_UNWATERED_DECAY_MS = 10 * 60 * 1000;

  private player!: Player;
  private fox!: FamiliarCompanion;
  private hud!: HudController;
  private lighting!: LightingSystem;
  private ocean!: OceanSystem;
  private weather!: WeatherSystem;
  private cameraRig!: CameraRig;
  private fx!: EffectSequencer;
  private critters!: AmbientCritterSystem;
  private fishingMinigame = new FishingMinigame();
  private fishingBobber?: Phaser.GameObjects.Sprite;
  private fishingLine?: Phaser.GameObjects.Graphics;
  private fishingSplashTimerMs = 0;
  private fishingPending = false;
  private fishingIdle = false;
  private shoreSplashTimerMs = 0;
  private nearEnemyCooldownMs = 0;
  private lighthouseAngle = 0;

  private nodes: ResourceNode[] = [];
  private buildings: BuildingEntity[] = [];
  private buildingsByTile = new Map<number, BuildingEntity[]>();
  private houseDoors: BuildingEntity[] = [];
  private static readonly STEP_PALETTE: Record<string, number> = {
    grass: 0x9be68e,
    autumn: 0xe6a85c,
    graveyard: 0x988eb8,
    winter: 0xe8f6ff,
    infernal: 0xff7b54,
  };

  private cachedMinimapBuildings: Array<{ tx: number; ty: number }> | null = null;
  private cachedMinimapBridges: Array<{ tx: number; ty: number }> = [];
  private cachedMinimapBridgeCount = -1;
  private readonly moveDir = new Phaser.Math.Vector2();
  private readonly pointLightsBuf: PointLightSource[] = [];
  private readonly spotLightsBuf: SpotLightSource[] = [];
  private buildingTickCallbacks?: Parameters<BuildingEntity['updateBuilding']>[1];
  private soilStateMap = new Map<string, { lastWateredMs: number; lastUsedMs: number }>();
  private soilDecayTimerMs = 0;
  private cropStatusLabelBox?: {
    container: Phaser.GameObjects.Container;
    bg: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
    redraw: () => void;
    lastText: string;
    lastColor: string;
  };
  private enemies: Enemy[] = [];
  private drops: LootDrop[] = [];
  private projectiles: ActiveProjectile[] = [];
  private bombs: ActiveBomb[] = [];
  private purchaseMarkers: IslandPurchaseMarker[] = [];
  private npcs: NpcEntity[] = [];
  private ranchEntities: RanchEntity[] = [];
  private animals: Array<{
    kind: 'Cow' | 'Deer' | 'Hen' | 'Rabbit';
    sprite: Phaser.GameObjects.Sprite;
    shadow: Phaser.GameObjects.Ellipse;
    x: number;
    y: number;
    hp: number;
    vx: number;
    vy: number;
    wanderTimerMs: number;
    petCooldownMs: number;
  }> = [];
  private dungeonPortals: DungeonPortalEntity[] = [];
  private bridgeSprites = new Map<string, { sprite: Phaser.GameObjects.Image; tx: number; ty: number; baseY: number }>();
  private houseRoofSprites = new Map<string, Phaser.GameObjects.Image>();
  private houseRoofConcaveBaseSprites = new Map<string, Phaser.GameObjects.Image>();
  private houseRoofEaveSprites = new Map<string, Phaser.GameObjects.Image>();
  private houseRoofUnderlaySprites = new Map<string, Phaser.GameObjects.Image>();
  private houseUnderWallFloors = new Map<string, Phaser.GameObjects.Image>();
  private houseDoorSigns: Array<{
    doorX: number;
    doorY: number;
    baseY: number;
    container: Phaser.GameObjects.Container;
  }> = [];
  private houseTileSet = new Set<string>();
  private houseInteriorTileSet = new Set<string>();
  private houseGroupByTile = new Map<string, number>();
  private houseRoofGroup = new Map<string, number>();
  private houseRoofConcaveBaseGroup = new Map<string, number>();
  private houseRoofEaveGroup = new Map<string, number>();
  private houseGroupRoofAlpha = new Map<number, number>();
  private activeHouseGroupId = 0;
  private lastHarvestMs = 0;
  private harvestComboCount = 0;
  private stokeCooldownMs = 0;
  private buildCursor!: Phaser.GameObjects.Rectangle;
  private targetIndicator!: Phaser.GameObjects.Arc;
  private mobilePlaceActive = false;
  private mobilePlaceTx = 0;
  private mobilePlaceTy = 0;
  private mobilePlaceWorldX = 0;
  private mobilePlaceWorldY = 0;
  private mobilePlaceDragging = false;
  private mobileDragLastWorldX = 0;
  private mobileDragLastWorldY = 0;
  private buildPreviewSprite?: Phaser.GameObjects.Image;
  private buildGizmoGfx?: Phaser.GameObjects.Graphics;

  private respawnTimerMs = 0;
  private offscreenTickAccumMs = 0;
  private regenTimerMs = 0;
  private minimapTimerMs = 0;
  private lowEnergyToastMs = 0;
  private petActionCooldownMs = 0;
  private promoTimeline: PromoTimeline | null = null;
  private sandstormBonusTimerMs = 0;
  private autosaveTimerMs = 60000;

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
    TAB: Phaser.Input.Keyboard.Key;
    K: Phaser.Input.Keyboard.Key;
    M: Phaser.Input.Keyboard.Key;
    I: Phaser.Input.Keyboard.Key;
    P: Phaser.Input.Keyboard.Key;
    ESC: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super('OverworldScene');
  }

  create(): void {
    this.nodes = [];
    this.buildings = [];
    this.buildingsByTile.clear();
    this.houseDoors = [];
    this.cachedMinimapBuildings = null;
    this.buildingTickCallbacks = undefined;
    this.enemies = [];
    this.drops = [];
    this.projectiles = [];
    this.bombs = [];
    this.purchaseMarkers = [];
    this.npcs = [];
    this.ranchEntities = [];
    this.animals = [];
    this.dungeonPortals = [];
    this.buildPreviewSprite = undefined;
    this.buildGizmoGfx = undefined;
    this.bridgeSprites.clear();
    this.houseRoofSprites.clear();
    this.houseTileSet.clear();
    this.houseGroupByTile.clear();
    this.houseRoofGroup.clear();
    this.houseGroupRoofAlpha.clear();
    this.activeHouseGroupId = 0;
    this.bridgeSet.clear();

    this.initGrids();
    this.buildTilemap();

    const half = Math.floor(ISLAND_CELL_TILES / 2);
    const rawStart = gameState.playerPos
      ? gameState.playerPos
      : {
          x: (2 * ISLAND_CELL_TILES + half) * TILE_PX + 8,
          y: (2 * ISLAND_CELL_TILES + half) * TILE_PX + 8,
        };
    const safeStart = this.findNearestWalkablePoint(rawStart.x, rawStart.y);
    this.player = new Player(this, safeStart.x, safeStart.y);
    this.fox = new FamiliarCompanion(this, safeStart.x - 16, safeStart.y + 6);

    this.populateOwnedWorld();

    // Ensure player is never overlapping any restored/spawned solid node
    if (!this.isWalkable(this.player.x, this.player.y)) {
      const nudged = this.findNearestWalkablePoint(this.player.x, this.player.y);
      this.player.setPosition(nudged.x, nudged.y);
    }

    this.buildCursor = this.add
      .rectangle(0, 0, TILE_PX, TILE_PX, 0xffe066, 0.25)
      .setStrokeStyle(1, 0xffe066, 0.9)
      .setDepth(5000)
      .setVisible(false);

    this.targetIndicator = this.add
      .circle(0, 0, 9, 0xffe066, 0.14)
      .setStrokeStyle(1.3, 0xffe066, 0.9)
      .setDepth(1)
      .setVisible(false);
    this.cropStatusLabelBox = undefined;

    this.tweens.add({
      targets: this.targetIndicator,
      scale: { from: 0.75, to: 1.0 },
      duration: 1000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    const worldPx = WORLD_TILES * TILE_PX;
    this.cameras.main.setBounds(0, 0, worldPx, worldPx);
    this.cameras.main.setZoom(
      computeResponsiveZoom(this.scale.width, this.scale.height, {
        worldWidthPx: worldPx,
        worldHeightPx: worldPx,
        minZoom: 3,
      }),
    );
    this.cameras.main.startFollow(this.player, true, 0.14, 0.14);
    this.cameras.main.roundPixels = false;

    const onResize = (gameSize: Phaser.Structs.Size) => {
      this.cameras.main.setSize(gameSize.width, gameSize.height);
      const isMobBuild = Boolean(
        this.hud?.isTouchEnabled() && gameState.pendingBuildRecipeId && this.hud.activeModal === 'none',
      );
      this.cameras.main.setZoom(
        computeResponsiveZoom(gameSize.width, gameSize.height, {
          worldWidthPx: worldPx,
          worldHeightPx: worldPx,
          minZoom: isMobBuild ? 1.85 : 3,
        }),
      );
      this.lighting?.resize(gameSize.width, gameSize.height);
    };
    this.scale.on('resize', onResize);

    this.lighting = new LightingSystem(this);
    this.weather = new WeatherSystem(this);
    this.ocean = new OceanSystem(this);
    this.cameraRig = new CameraRig(this, { maxLookAheadPx: 11 });
    this.fx = new EffectSequencer(this, {
      cameraRig: this.cameraRig,
      onHitstop: (ms) => this.player.applyHitstop(ms),
    });
    this.critters = new AmbientCritterSystem(this);
    this.syncBiomeFromPlayer();
    this.setupHud();
    this.setupInput();
    this.refreshPurchaseMarkers();
    SFX.setMusicPaused(false);
    SFX.setMusicSituation('overworld');

    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
      this.fishingMinigame.finish(false);
      this.lighting.destroy();
      this.weather.destroy();
      this.ocean.destroy();
      this.critters.destroy();
      this.fishingLine?.destroy();
      this.fishingLine = undefined;
    });
  }

  private initGrids(): void {
    this.terrainGrid = Array.from({ length: WORLD_TILES }, () =>
      Array.from({ length: WORLD_TILES }, () => 'water' as TerrainType),
    );
    this.overlayGrid = Array.from({ length: WORLD_TILES }, () =>
      Array.from({ length: WORLD_TILES }, () => 'none' as OverlayType),
    );

    for (const key of gameState.ownedIslands) {
      const [gx, gy] = key.split(',').map(Number);
      this.stampIslandTerrain(gx, gy);
    }

    for (const ov of gameState.overlays) {
      if (ov.ty >= 0 && ov.ty < WORLD_TILES && ov.tx >= 0 && ov.tx < WORLD_TILES) {
        this.overlayGrid[ov.ty][ov.tx] = ov.type;
        if (ov.type === 'bridge') this.bridgeSet.add(`${ov.tx},${ov.ty}`);
      }
    }
  }

  private stampIslandTerrain(gx: number, gy: number): void {
    const spec = getIslandAt(gx, gy);
    if (!spec) return;
    const ox = gx * ISLAND_CELL_TILES;
    const oy = gy * ISLAND_CELL_TILES;
    const pad = Math.floor((ISLAND_CELL_TILES - INNER_ISLAND_SIZE) / 2);
    const mask = generateIslandMask(gx, gy, 1337);

    for (let ly = 0; ly < INNER_ISLAND_SIZE; ly++) {
      for (let lx = 0; lx < INNER_ISLAND_SIZE; lx++) {
        if (mask.land[ly][lx]) {
          this.terrainGrid[oy + pad + ly][ox + pad + lx] = spec.biome;
        }
      }
    }
  }

  private buildTilemap(): void {
    ensureCleanTilesets(this);

    this.map = this.make.tilemap({
      tileWidth: TILE_PX,
      tileHeight: TILE_PX,
      width: WORLD_TILES,
      height: WORLD_TILES,
    });

    // Assign non-overlapping firstgid ranges so every biome renders from its own tileset cleanly
    let nextGid = 1;
    const addTs = (name: string, textureKey: string): Phaser.Tilemaps.Tileset => {
      const key = this.textures.exists(textureKey) ? textureKey : name;
      const ts = this.map.addTilesetImage(name, key, 16, 16, 0, 0, nextGid)!;
      nextGid += ts.total;
      return ts;
    };

    const grass = addTs('tileset_grass', 'tileset_grass');
    const autumn = addTs('tileset_autumn', 'tileset_autumn_clean');
    const winter = addTs('tileset_winter', 'tileset_winter_clean');
    const coastlines = addTs('tileset_coastlines', 'tileset_coastlines_clean');
    const dirt = addTs('tileset_dirt', 'tileset_dirt');
    const hoedSoil = addTs('sprout_tilled_dirt', 'sprout_tilled_dirt');
    const road = addTs('tileset_roads_stone', 'tileset_roads_stone');

    this.tilesets = { grass, autumn, winter, coastlines, dirt, hoedSoil, road };

    this.waterLayer = this.map.createBlankLayer('water', [grass], 0, 0)!.setDepth(0);
    this.terrainLayer = this.map
      .createBlankLayer('terrain', [grass, autumn, winter, coastlines], 0, 0)!
      .setDepth(1);
    this.freckleGfx = this.add.graphics().setDepth(1.5);
    this.freckleStamped.clear();
    this.overlayLayer = this.map.createBlankLayer('overlays', [dirt, hoedSoil, road], 0, 0)!.setDepth(2);

    const waterGid = grass.firstgid + BIOME_TILESETS.grass.waterFrame;
    this.waterLayer.fill(waterGid);

    this.refreshAutoTiles(0, 0, WORLD_TILES - 1, WORLD_TILES - 1);
  }

  private getTilesetFirstGid(key: string): number {
    if (key === 'tileset_autumn') return this.tilesets.autumn.firstgid;
    if (key === 'tileset_winter') return this.tilesets.winter.firstgid;
    if (key === 'tileset_coastlines') return this.tilesets.coastlines.firstgid;
    if (key === 'sprout_tilled_dirt') return this.tilesets.hoedSoil.firstgid;
    if (key === 'tileset_dirt') return this.tilesets.dirt.firstgid;
    if (key === 'tileset_roads_stone') return this.tilesets.road.firstgid;
    return this.tilesets.grass.firstgid;
  }

  private refreshAutoTiles(minX: number, minY: number, maxX: number, maxY: number): void {
    const x0 = Math.max(0, minX);
    const y0 = Math.max(0, minY);
    const x1 = Math.min(WORLD_TILES - 1, maxX);
    const y1 = Math.min(WORLD_TILES - 1, maxY);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const placement = computeTerrainTile(this.terrainGrid, x, y);
        if (!placement) {
          this.terrainLayer.removeTileAt(x, y);
        } else {
          const gid = this.getTilesetFirstGid(placement.tilesetKey) + placement.frame;
          const tile = this.terrainLayer.putTileAt(gid, x, y);
          if (tile) {
            if (placement.tint) {
              tile.tint = placement.tint;
            } else {
              // Subtle Perlin-weighted brightness variation to reduce tile monotony
              const n = periodicPerlinFbm2D(x * 0.14, y * 0.14, 140, 2);
              const shade = Math.round(244 + Math.max(0, Math.min(1, n)) * 11);
              tile.tint = (shade << 16) | (shade << 8) | shade;
            }
          }
          this.stampTileFreckles(x, y, this.terrainGrid[y][x]);
        }

        const ov = this.overlayGrid[y][x];
        if (ov === 'bridge') {
          this.overlayLayer.removeTileAt(x, y);
          this.ensureBridgeVisual(x, y);
        } else {
          const ovPlace = computeOverlayTile(this.overlayGrid, x, y);
          if (!ovPlace) {
            this.overlayLayer.removeTileAt(x, y);
          } else {
            const gid = this.getTilesetFirstGid(ovPlace.tilesetKey) + ovPlace.frame;
            this.overlayLayer.putTileAt(gid, x, y);
          }
        }
      }
    }
  }

  private stampTileFreckles(tx: number, ty: number, biome: TerrainType): void {
    if (!this.freckleGfx || biome === 'water') return;
    const key = `${tx},${ty}`;
    if (this.freckleStamped.has(key)) return;
    this.freckleStamped.add(key);

    // Perlin-weighted density so freckles cluster naturally across the terrain
    const perlin = periodicPerlinFbm2D(tx * 0.18 + 3.1, ty * 0.18 + 7.4, 140, 2);
    const hash = (sx: number, sy: number, salt: number): number => {
      const v = Math.sin(sx * 127.1 + sy * 311.7 + salt * 74.7) * 43758.5453;
      return v - Math.floor(v);
    };

    const r0 = hash(tx, ty, 1);
    const prob = 0.25 + perlin * 0.65;
    if (r0 > prob) return;

    const paletteByBiome: Record<string, number[]> = {
      grass: [0x112612, 0x24180e, 0x0b1014],
      autumn: [0x2e1a0c, 0x1c120a, 0x0c0b0e],
      graveyard: [0x12101a, 0x1d1a14, 0x090a0e],
      winter: [0x1c2b3b, 0x16202b, 0x0b1016],
      infernal: [0x1a0b09, 0x12090a, 0x08070a],
    };
    const colors = paletteByBiome[biome] ?? paletteByBiome.grass;
    const count = perlin > 0.62 ? 3 : perlin > 0.35 ? 2 : 1;

    for (let i = 0; i < count; i++) {
      const ox = hash(tx, ty, 10 + i * 3) * (TILE_PX - 3) + 1.5;
      const oy = hash(tx, ty, 11 + i * 3) * (TILE_PX - 3) + 1.5;
      const rad = 0.8 + hash(tx, ty, 12 + i * 3) * 1.4;
      const col = colors[Math.floor(hash(tx, ty, 13 + i * 3) * colors.length) % colors.length];
      const alpha = 0.07 + hash(tx, ty, 14 + i * 3) * 0.05; // ~90% transparent
      this.freckleGfx.fillStyle(col, alpha);
      this.freckleGfx.fillCircle(tx * TILE_PX + ox, ty * TILE_PX + oy, rad);
    }
  }

  private ensureBridgeVisual(tx: number, ty: number): void {
    const key = `${tx},${ty}`;
    if (this.bridgeSprites.has(key)) return;
    const baseY = ty * TILE_PX + 8;
    const spr = this.add.image(tx * TILE_PX + 8, baseY, 'ui_icons/bridge').setDepth(2.5);
    this.bridgeSprites.set(key, { sprite: spr, tx, ty, baseY });
  }

  private removeBridgesOnLand(minX: number, minY: number, maxX: number, maxY: number, refundLoot = true): number {
    const x0 = Math.max(0, minX);
    const y0 = Math.max(0, minY);
    const x1 = Math.min(WORLD_TILES - 1, maxX);
    const y1 = Math.min(WORLD_TILES - 1, maxY);
    let removed = 0;

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!isLand(this.terrainGrid[ty]?.[tx])) continue;
        const key = `${tx},${ty}`;
        if (this.overlayGrid[ty]?.[tx] !== 'bridge' && !this.bridgeSet.has(key)) continue;

        this.overlayGrid[ty][tx] = 'none';
        this.bridgeSet.delete(key);
        const entry = this.bridgeSprites.get(key);
        if (entry) {
          entry.sprite.destroy();
          this.bridgeSprites.delete(key);
        }
        spawnBurstParticles(this, tx * TILE_PX + 8, ty * TILE_PX + 8, 0xb8763e, 5);
        removed += 1;
      }
    }

    if (removed > 0) {
      gameState.overlays = gameState.overlays.filter(
        (o) => !(o.type === 'bridge' && o.tx >= x0 && o.tx <= x1 && o.ty >= y0 && o.ty <= y1 && isLand(this.terrainGrid[o.ty]?.[o.tx])),
      );
      if (refundLoot) {
        const bridgeRec = RECIPES.find((r) => r.id === 'build_bridge');
        if (bridgeRec) {
          for (let i = 0; i < removed; i++) {
            gameState.refundIngredients(bridgeRec);
          }
          const woodTotal = bridgeRec.ingredients.reduce(
            (sum, ing) => sum + (ing.itemId === 'wood' ? gameState.getStructureCostCount(ing.itemId, ing.count, true) : 0),
            0,
          ) * removed;
          this.hud?.showToast(`Cleared ${removed} landlocked bridge(s) — refunded +${woodTotal} Wood!`);
        }
      }
    }
    return removed;
  }

  private populateOwnedWorld(): void {
    const hasSavedNodes = Array.isArray(gameState.savedNodes);
    for (const key of gameState.ownedIslands) {
      const [gx, gy] = key.split(',').map(Number);
      this.populateIslandContent(gx, gy, !hasSavedNodes);
    }
    if (hasSavedNodes && gameState.savedNodes) {
      for (const sn of gameState.savedNodes) {
        const node = new ResourceNode(this, sn.tx, sn.ty, sn.kind as NodeKind, sn.biome as BiomeKind);
        node.hp = Math.max(1, Math.min(node.maxHp, sn.hp));
        this.nodes.push(node);
      }
    }
    if (Array.isArray(gameState.savedDrops)) {
      for (const sd of gameState.savedDrops) {
        this.drops.push(new LootDrop(this, sd.x, sd.y, sd.itemId, sd.qty, sd.isCoin));
      }
    }
    for (const b of gameState.buildings) {
      this.registerBuilding(
        new BuildingEntity(this, b.id, b.type, b.tx, b.ty, b.craftQueue ?? [], b.cropStage ?? 0, false, {
          stageWatered: b.stageWatered,
          wateredCount: b.wateredCount,
          harvestsLeft: b.harvestsLeft,
          withered: b.withered,
        }),
      );
    }
    const nowMs = this.time?.now ?? 0;
    for (const ov of gameState.overlays) {
      if (ov.type === 'dirt') {
        this.soilStateMap.set(`${ov.tx},${ov.ty}`, { lastWateredMs: nowMs, lastUsedMs: nowMs });
      }
    }
    for (const rc of gameState.ranchCreatures) {
      this.spawnRanchSprite(rc);
    }
    this.removeBridgesOnLand(0, 0, WORLD_TILES - 1, WORLD_TILES - 1, true);
    this.rebuildHouseRoofs();
  }

  private registerBuilding(b: BuildingEntity): void {
    this.buildings.push(b);
    this.cachedMinimapBuildings = null;
    const key = (b.ty << 10) | b.tx;
    let bucket = this.buildingsByTile.get(key);
    if (!bucket) {
      bucket = [];
      this.buildingsByTile.set(key, bucket);
    }
    bucket.push(b);
    if (b.structureType === 'house_door') {
      this.houseDoors.push(b);
    }
  }

  private isHousePart(st: string): boolean {
    return (
      st === 'house_floor' ||
      st === 'house_wall' ||
      st === 'house_door' ||
      st.startsWith('furniture_')
    );
  }

  private rebuildHouseRoofs(): void {
    this.houseTileSet.clear();
    this.houseInteriorTileSet.clear();
    const wallOrDoorSet = new Set<string>();
    for (const b of this.buildings) {
      if (!b.active) continue;
      if (this.isHousePart(b.structureType)) {
        const key = `${b.tx},${b.ty}`;
        this.houseTileSet.add(key);
      }
      if (b.structureType === 'house_wall' || b.structureType === 'house_door') {
        wallOrDoorSet.add(`${b.tx},${b.ty}`);
      }
    }
    // Strictly classify interior tiles: all 4 cardinal neighbors must belong to houseTileSet.
    // This excludes 100% of exterior perimeter walls & exterior doors while keeping interior divider walls & interior doors.
    for (const key of this.houseTileSet) {
      const [tx, ty] = key.split(',').map(Number);
      if (hasAll4CardinalHouseNeighbors(this.houseTileSet, tx, ty)) {
        this.houseInteriorTileSet.add(key);
      }
    }

    // Extra floor layer under north/south walls & doors so world ground never pokes through inside houses
    // Strictly avoid left/right exterior walls & corners so floor tiles never stick out on the sides.
    const isPureFloor = (tx: number, ty: number) =>
      this.houseInteriorTileSet.has(`${tx},${ty}`) && !wallOrDoorSet.has(`${tx},${ty}`);

    const underFloorCrop = new Map<string, { y: number; h: number }>();
    for (const wk of wallOrDoorSet) {
      const [tx, ty] = wk.split(',').map(Number);
      const floorBelow = isPureFloor(tx, ty + 1);
      const floorAbove = isPureFloor(tx, ty - 1);
      if (floorBelow && floorAbove) {
        underFloorCrop.set(wk, { y: 0, h: 16 });
      } else if (floorBelow) {
        underFloorCrop.set(wk, { y: 8, h: 8 }); // Bottom half under North wall
      } else if (floorAbove) {
        underFloorCrop.set(wk, { y: 0, h: 8 }); // Top half under South wall / Door
      }
    }
    for (const [k, spr] of this.houseUnderWallFloors) {
      if (!underFloorCrop.has(k)) {
        spr.destroy();
        this.houseUnderWallFloors.delete(k);
      }
    }
    for (const [k, crop] of underFloorCrop) {
      const [tx, ty] = k.split(',').map(Number);
      let spr = this.houseUnderWallFloors.get(k);
      if (!spr) {
        spr = this.add
          .image(tx * TILE_PX + 8, ty * TILE_PX + 8, 'sprout/house_walls', 6)
          .setDepth(2.9);
        this.houseUnderWallFloors.set(k, spr);
      }
      spr.setPosition(tx * TILE_PX + 8, ty * TILE_PX + 8).setCrop(0, crop.y, 16, crop.h);
    }

    // Autotile all house_wall sprites (NPC-built and player-built alike) and place windows (frame 13) on blank south wall spans
    const doorKeySet = new Set(
      this.buildings
        .filter((b) => b.active && b.structureType === 'house_door')
        .map((b) => `${b.tx},${b.ty}`),
    );
    const southWallsByRow = new Map<number, BuildingEntity[]>();
    for (const b of this.buildings) {
      if (!b.active || b.structureType !== 'house_wall') continue;
      const hasN = wallOrDoorSet.has(`${b.tx},${b.ty - 1}`);
      const hasS = wallOrDoorSet.has(`${b.tx},${b.ty + 1}`);
      const hasW = wallOrDoorSet.has(`${b.tx - 1},${b.ty}`);
      const hasE = wallOrDoorSet.has(`${b.tx + 1},${b.ty}`);
      const hasFloorW = this.houseTileSet.has(`${b.tx - 1},${b.ty}`);
      const hasFloorE = this.houseTileSet.has(`${b.tx + 1},${b.ty}`);
      const frame = computeHouseWallFrame(hasN, hasS, hasW, hasE, hasFloorW, hasFloorE);
      b.setWallFrame(frame);
      if (frame === 11) {
        const list = southWallsByRow.get(b.ty) ?? [];
        list.push(b);
        southWallsByRow.set(b.ty, list);
      }
    }
    for (const [ty, rowWalls] of southWallsByRow) {
      rowWalls.sort((a, b) => a.tx - b.tx);
      let runStart = 0;
      while (runStart < rowWalls.length) {
        let runEnd = runStart;
        while (runEnd + 1 < rowWalls.length && rowWalls[runEnd + 1].tx === rowWalls[runEnd].tx + 1) {
          runEnd += 1;
        }
        const run = rowWalls.slice(runStart, runEnd + 1).filter(
          (w) => !doorKeySet.has(`${w.tx - 1},${ty}`) && !doorKeySet.has(`${w.tx + 1},${ty}`),
        );
        if (run.length >= 2) {
          for (let i = run.length === 2 ? 0 : 1; i < run.length; i += 2) {
            run[i].setWallFrame(13);
          }
        }
        runStart = runEnd + 1;
      }
    }

    this.houseGroupByTile = groupConnectedHouseTiles(this.houseTileSet);

    // Exclude every south-facing perimeter tile (same as GitHub 9d8f01e) so every wing of an L-shaped house shows its front/south wall cleanly
    const roofKeys = [...this.houseTileSet].filter((k) => {
      const [tx, ty] = k.split(',').map(Number);
      return this.houseTileSet.has(`${tx},${ty + 1}`);
    });
    const roofKeySet = new Set(roofKeys);
    const eaveKeys = new Set(
      roofKeys.filter((k) => {
        const [tx, ty] = k.split(',').map(Number);
        return !roofKeySet.has(`${tx},${ty + 1}`);
      }),
    );

    for (const [k, spr] of this.houseRoofSprites) {
      if (!roofKeySet.has(k)) {
        spr.destroy();
        this.houseRoofSprites.delete(k);
        this.houseRoofGroup.delete(k);
      }
    }
    for (const [k, spr] of this.houseRoofConcaveBaseSprites) {
      if (!roofKeySet.has(k)) {
        spr.destroy();
        this.houseRoofConcaveBaseSprites.delete(k);
        this.houseRoofConcaveBaseGroup.delete(k);
      }
    }
    for (const [k, spr] of this.houseRoofEaveSprites) {
      if (!eaveKeys.has(k)) {
        spr.destroy();
        this.houseRoofEaveSprites.delete(k);
        this.houseRoofEaveGroup.delete(k);
      }
    }
    for (const [k, spr] of this.houseRoofUnderlaySprites) {
      const [utx, uty] = k.split(',').map(Number);
      if (!roofKeySet.has(k) || !isPureFloor(utx, uty)) {
        spr.destroy();
        this.houseRoofUnderlaySprites.delete(k);
      }
    }
    const groupYBounds = new Map<number, { minTy: number; maxTy: number }>();
    for (const k of roofKeys) {
      const ty = Number(k.split(',')[1]);
      const gid = this.houseGroupByTile.get(k) ?? 0;
      const cur = groupYBounds.get(gid) ?? { minTy: ty, maxTy: ty };
      if (ty < cur.minTy) cur.minTy = ty;
      if (ty > cur.maxTy) cur.maxTy = ty;
      groupYBounds.set(gid, cur);
    }

    for (const k of roofKeys) {
      const [tx, ty] = k.split(',').map(Number);
      const gid = this.houseGroupByTile.get(k) ?? 0;
      const bounds = groupYBounds.get(gid) ?? { minTy: ty, maxTy: ty };
      const hasW = roofKeySet.has(`${tx - 1},${ty}`);
      const hasE = roofKeySet.has(`${tx + 1},${ty}`);
      const hasN = roofKeySet.has(`${tx},${ty - 1}`);
      const hasS = roofKeySet.has(`${tx},${ty + 1}`);
      let concave: 'se' | 'sw' | 'ne' | 'nw' | undefined;
      if (hasN && hasS && hasW && hasE) {
        if (!roofKeySet.has(`${tx + 1},${ty + 1}`)) concave = 'se';
        else if (!roofKeySet.has(`${tx - 1},${ty + 1}`)) concave = 'sw';
        else if (!roofKeySet.has(`${tx + 1},${ty - 1}`)) concave = 'ne';
        else if (!roofKeySet.has(`${tx - 1},${ty - 1}`)) concave = 'nw';
      }
      const frame = computeHouseRoofFrame(ty, bounds.minTy, bounds.maxTy, hasW, hasE, concave);
      const ridgeTy = Math.max(bounds.minTy, Math.floor((bounds.minTy + bounds.maxTy) / 2) - 1);
      const slopeTint = ty < ridgeTy ? 0xffffff : ty === ridgeTy ? 0xf2e4d4 : 0xdcc8b2;
      this.houseRoofGroup.set(k, gid);
      if (isPureFloor(tx, ty)) {
        let underlay = this.houseRoofUnderlaySprites.get(k);
        if (!underlay) {
          underlay = this.add
            .image(tx * TILE_PX + 8, ty * TILE_PX + 8, 'sprout/house_walls', 6)
            .setTint(0x100906)
            .setDepth(8499);
          this.houseRoofUnderlaySprites.set(k, underlay);
        } else {
          underlay.setPosition(tx * TILE_PX + 8, ty * TILE_PX + 8);
        }
      } else {
        const oldUnderlay = this.houseRoofUnderlaySprites.get(k);
        if (oldUnderlay) {
          oldUnderlay.destroy();
          this.houseRoofUnderlaySprites.delete(k);
        }
      }

      if (concave) {
        const baseFrame = computeHouseRoofFrame(ty, bounds.minTy, bounds.maxTy, true, true);
        this.houseRoofConcaveBaseGroup.set(k, gid);
        let baseSpr = this.houseRoofConcaveBaseSprites.get(k);
        if (!baseSpr) {
          baseSpr = this.add
            .image(tx * TILE_PX + 8, ty * TILE_PX + 8, 'sprout/house_roof', baseFrame)
            .setDepth(8499.5);
          this.houseRoofConcaveBaseSprites.set(k, baseSpr);
        } else {
          baseSpr.setPosition(tx * TILE_PX + 8, ty * TILE_PX + 8).setFrame(baseFrame);
        }
        baseSpr.setTint(slopeTint);
      } else {
        const oldBase = this.houseRoofConcaveBaseSprites.get(k);
        if (oldBase) {
          oldBase.destroy();
          this.houseRoofConcaveBaseSprites.delete(k);
          this.houseRoofConcaveBaseGroup.delete(k);
        }
      }

      let spr = this.houseRoofSprites.get(k);
      if (!spr) {
        spr = this.add
          .image(tx * TILE_PX + 8, ty * TILE_PX + 8, 'sprout/house_roof', frame)
          .setDepth(8500);
        this.houseRoofSprites.set(k, spr);
      } else {
        spr.setFrame(frame);
      }
      spr.setOrigin(0.5, 0.5).setPosition(tx * TILE_PX + 8, ty * TILE_PX + 8).setDisplaySize(16, 16).setTint(slopeTint);

      // Add per-wing scalloped bottom eave cap directly over the top rim of each wing's south wall
      if (!hasS) {
        const eaveFrame = computeHouseRoofEaveFrame(hasW, hasE);
        this.houseRoofEaveGroup.set(k, gid);
        let eaveSpr = this.houseRoofEaveSprites.get(k);
        if (!eaveSpr) {
          eaveSpr = this.add
            .image(tx * TILE_PX + 8, (ty + 1) * TILE_PX + 2, 'sprout/house_roof', eaveFrame)
            .setDepth(8500);
          this.houseRoofEaveSprites.set(k, eaveSpr);
        } else {
          eaveSpr.setPosition(tx * TILE_PX + 8, (ty + 1) * TILE_PX + 2).setFrame(eaveFrame);
        }
        eaveSpr.setTint(0xdcc8b2);
      }
    }
  }

  private createWorldLabelBox(
    x: number,
    y: number,
    text: string,
    textColor: string,
    borderColor = 0xd9a85b,
    fontSize = '7px',
  ): {
    container: Phaser.GameObjects.Container;
    bg: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
    redraw: () => void;
  } {
    const bg = this.add.graphics();
    const label = this.add
      .text(0, 0, text, {
        fontSize,
        fontStyle: 'bold',
        color: textColor,
        stroke: '#1b1109',
        strokeThickness: 2,
        resolution: 4,
      })
      .setOrigin(0.5);
    const container = this.add.container(x, y, [bg, label]).setDepth(8700);
    const redraw = () => {
      bg.clear();
      const padX = 5;
      const padY = 2.5;
      const w = Math.max(12, Math.ceil(label.width + padX * 2));
      const h = Math.max(11, Math.ceil(label.height + padY * 2));
      bg.fillStyle(0x1b1109, 0.9);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 3.5);
      bg.lineStyle(1.1, borderColor, 0.95);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 3.5);
    };
    redraw();
    return { container, bg, label, redraw };
  }

  private spawnRanchSprite(rc: RanchCreatureSave): void {
    const sp = getSpeciesById(rc.speciesId);
    if (!sp) return;
    const spr = this.add.sprite(rc.x, rc.y, sp.spriteKey, 0).setDepth(rc.y);
    playSpawnGrowAndJello(this, spr, 1, 1);
    const label = this.add
      .text(rc.x, rc.y - 14, '', {
        fontSize: '7px',
        fontStyle: 'bold',
        color: '#ff9ec4',
        stroke: '#000',
        strokeThickness: 2,
        resolution: 4,
      })
      .setOrigin(0.5)
      .setDepth(8000);
    this.ranchEntities.push({ save: rc, sprite: spr, label, vx: 0, vy: 0, wanderTimerMs: 1200 });
  }

  private findNearestLandTileOnIsland(
    gx: number,
    gy: number,
    targetLx: number,
    targetLy: number,
  ): { tx: number; ty: number } {
    const ox = gx * ISLAND_CELL_TILES;
    const oy = gy * ISLAND_CELL_TILES;
    const half = Math.floor(ISLAND_CELL_TILES / 2);
    let best = { tx: ox + half, ty: oy + half };
    let bestDist = Infinity;
    for (let ly = 1; ly < ISLAND_CELL_TILES - 1; ly++) {
      for (let lx = 1; lx < ISLAND_CELL_TILES - 1; lx++) {
        const tx = ox + lx;
        const ty = oy + ly;
        if (!isLand(this.terrainGrid[ty]?.[tx])) continue;
        const d = Math.hypot(lx - targetLx, ly - targetLy);
        if (d < bestDist) {
          bestDist = d;
          best = { tx, ty };
        }
      }
    }
    return best;
  }

  private findFlatLandRect(
    gx: number,
    gy: number,
    w: number,
    h: number,
    avoidPxX: number,
    avoidPxY: number,
  ): { ox: number; oy: number } | null {
    const baseOx = gx * ISLAND_CELL_TILES;
    const baseOy = gy * ISLAND_CELL_TILES;
    const half = Math.floor(ISLAND_CELL_TILES / 2);
    let best: { ox: number; oy: number } | null = null;
    let bestScore = Infinity;

    for (let ly = 2; ly <= ISLAND_CELL_TILES - h - 2; ly++) {
      for (let lx = 2; lx <= ISLAND_CELL_TILES - w - 2; lx++) {
        const tx0 = baseOx + lx;
        const ty0 = baseOy + ly;
        let allLand = true;
        for (let dy = -1; dy <= h && allLand; dy++) {
          for (let dx = -1; dx <= w && allLand; dx++) {
            const tx = tx0 + dx;
            const ty = ty0 + dy;
            if (!isLand(this.terrainGrid[ty]?.[tx])) allLand = false;
            if (this.hasBuildingAt(tx, ty)) allLand = false;
          }
        }
        if (!allLand) continue;

        const cx = (tx0 + w / 2) * TILE_PX;
        const cy = (ty0 + h / 2) * TILE_PX;
        if (Math.hypot(cx - avoidPxX, cy - avoidPxY) < 42) continue;
        if (this.dungeonPortals.some((dp) => Math.hypot(cx - dp.x, cy - dp.y) < 48)) continue;

        const centerDist = Math.hypot(lx + w / 2 - half, ly + h / 2 - half);
        if (centerDist < bestScore) {
          bestScore = centerDist;
          best = { ox: tx0, oy: ty0 };
        }
      }
    }
    return best;
  }

  private findNearestWalkablePoint(wx: number, wy: number): { x: number; y: number } {
    if (this.isWalkable(wx, wy)) return { x: wx, y: wy };
    const startTx = Math.floor(wx / TILE_PX);
    const startTy = Math.floor(wy / TILE_PX);
    for (let r = 1; r <= 12; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const cx = (startTx + dx) * TILE_PX + 8;
          const cy = (startTy + dy) * TILE_PX + 8;
          if (this.isWalkable(cx, cy)) return { x: cx, y: cy };
        }
      }
    }
    return { x: wx, y: wy };
  }

  private isDungeonEnterable(dungeonId: DungeonId, gx: number, gy: number): boolean {
    const storyLocked = Boolean(gameState.getIslandStoryLockReason(gx, gy));
    return isDungeonPortalEnterable(
      dungeonId,
      gx,
      gy,
      gameState.ownedIslands,
      gameState.clearedDungeons,
      storyLocked,
    );
  }

  private refreshDungeonPortals(): void {
    for (const dp of this.dungeonPortals) {
      const wasVisible = dp.sprite.visible;
      const enterable = this.isDungeonEnterable(dp.dungeonId, dp.gx, dp.gy);
      dp.sprite.setVisible(enterable);
      dp.promptBox.setVisible(enterable);
      if (!enterable) continue;

      if (dp.dungeonId === 'void_spire') {
        const checkpointFloor = Math.max(1, Math.floor(gameState.voidSpireHighestFloor / 5) * 5 + 1);
        dp.prompt.setText(fmtKeyPrompt('E', `Void Spire (Fl.${checkpointFloor})`));
        dp.prompt.setColor('#d896ff');
      } else {
        const spec = getIslandAt(dp.gx, dp.gy);
        const cleared = gameState.clearedDungeons.has(dp.dungeonId);
        const label = spec
          ? cleared
            ? `${spec.name} (Cleared)`
            : fmtKeyPrompt('E', `Enter ${spec.name.replace(' Isle', '')}`)
          : fmtKeyPrompt('E', 'Enter Dungeon');
        dp.prompt.setText(label);
        dp.prompt.setColor(cleared ? '#90ee90' : '#ffcf70');
      }
      dp.redrawPrompt();
      if (!wasVisible) {
        playSpawnGrowAndJello(this, dp.sprite, 1, 1);
        playSpawnGrowAndJello(this, dp.promptBox, 1, 1);
      }
    }
  }

  private populateIslandContent(gx: number, gy: number, spawnNodes = true): void {
    const spec = getIslandAt(gx, gy);
    if (!spec) return;

    const ox = gx * ISLAND_CELL_TILES;
    const oy = gy * ISLAND_CELL_TILES;
    const half = Math.floor(ISLAND_CELL_TILES / 2);
    const centerTile = this.findNearestLandTileOnIsland(gx, gy, half, half);
    const centerTx = centerTile.tx;
    const centerTy = centerTile.ty;

    // 1. Dungeon Entrance (placed on verified contiguous land tile)
    if (spec.dungeonId) {
      const dTile = this.findNearestLandTileOnIsland(gx, gy, half, Math.floor(ISLAND_CELL_TILES * 0.28));
      const spr = this.add
        .image(dTile.tx * TILE_PX + 8, dTile.ty * TILE_PX + 8, 'tileset/Cave entrance_2', 1)
        .setDepth(dTile.ty * TILE_PX + 8);
      const cleared = gameState.clearedDungeons.has(spec.dungeonId);
      const enterable = this.isDungeonEnterable(spec.dungeonId, gx, gy);
      const box = this.createWorldLabelBox(
        spr.x,
        spr.y - 18,
        cleared ? `${spec.name} (Cleared)` : fmtKeyPrompt('E', `Enter ${spec.name.replace(' Isle', '')}`),
        cleared ? '#90ee90' : '#ffcf70',
        0xd9a85b,
        '7px',
      );
      spr.setVisible(enterable);
      box.container.setVisible(enterable);
      if (enterable) {
        playSpawnGrowAndJello(this, spr, 1, 1);
        playSpawnGrowAndJello(this, box.container, 1, 1);
      }
      this.dungeonPortals.push({
        dungeonId: spec.dungeonId,
        gx,
        gy,
        x: spr.x,
        y: spr.y,
        sprite: spr,
        promptBox: box.container,
        prompt: box.label,
        redrawPrompt: box.redraw,
      });
    }

    // 1b. Void Spire Endless Dungeon Portal on Emerald Origin (2,2)
    if (spec.gx === 2 && spec.gy === 2) {
      const vTile = this.findNearestLandTileOnIsland(gx, gy, Math.floor(ISLAND_CELL_TILES * 0.72), Math.floor(ISLAND_CELL_TILES * 0.28));
      const spr = this.add
        .image(vTile.tx * TILE_PX + 8, vTile.ty * TILE_PX + 8, 'tileset/Cave entrance_2', 1)
        .setTint(0xc77dff)
        .setDepth(vTile.ty * TILE_PX + 8);
      const unlocked = this.isDungeonEnterable('void_spire', gx, gy);
      const checkpointFloor = Math.max(1, Math.floor(gameState.voidSpireHighestFloor / 5) * 5 + 1);
      const box = this.createWorldLabelBox(
        spr.x,
        spr.y - 18,
        fmtKeyPrompt('E', `Void Spire (Fl.${checkpointFloor})`),
        '#d896ff',
        0xb377ff,
        '7px',
      );
      spr.setVisible(unlocked);
      box.container.setVisible(unlocked);
      if (unlocked) {
        playSpawnGrowAndJello(this, spr, 1, 1);
        playSpawnGrowAndJello(this, box.container, 1, 1);
      }
      this.dungeonPortals.push({
        dungeonId: 'void_spire',
        gx,
        gy,
        x: spr.x,
        y: spr.y,
        sprite: spr,
        promptBox: box.container,
        prompt: box.label,
        redrawPrompt: box.redraw,
      });
    }

    // 2. Quest NPC (with grounded shadow overlapping feet)
    if (spec.npc) {
      const nTile = this.findNearestLandTileOnIsland(gx, gy, Math.floor(ISLAND_CELL_TILES * 0.36), half);
      const nx = nTile.tx * TILE_PX + 8;
      const ny = nTile.ty * TILE_PX + 8;
      this.add.ellipse(nx, ny - 1, 10, 4, 0x000000, 0.38).setDepth(ny - 1);
      const spr = this.add
        .sprite(nx, ny - 6, spec.npc.spriteKey, 0)
        .setDepth(ny);
      const animKey = `npc_${spec.npc.spriteKey.split('/').pop()!.replace('_idle', '')}_idle_down`;
      if (this.anims.exists(animKey)) spr.play(animKey);
      const promptBox = this.createWorldLabelBox(
        spr.x,
        spr.y - 16,
        this.getNpcPromptText(spec.npc.id, spec.npc.name, false),
        '#ffe066',
        0xd9a85b,
        '8px',
      );
      this.tweens.add({
        targets: promptBox.container,
        y: spr.y - 19,
        duration: 720,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
      this.npcs.push({
        spec: spec.npc,
        sprite: spr,
        promptBox: promptBox.container,
        promptBg: promptBox.bg,
        prompt: promptBox.label,
        redrawPrompt: promptBox.redraw,
        x: nx,
        y: ny,
      });

      // 2b. Outdoor Tile-Built NPC Building (same tileset & BuildingEntity system as player-built structures)
      const theme = spec.npc.id as HouseThemeId;
      const stamp = OUTDOOR_NPC_BUILDINGS[theme];
      if (stamp) {
        const plot = this.findFlatLandRect(
          gx,
          gy,
          stamp.width,
          stamp.height,
          nx,
          ny,
        );
        if (plot) {
          for (const pl of stamp.placements) {
            const tx = plot.ox + pl.lx;
            const ty = plot.oy + pl.ly;
            // Remove any overlapping resource node so the building interior is clean
            for (let ni = this.nodes.length - 1; ni >= 0; ni--) {
              const nd = this.nodes[ni];
              if (nd.tx === tx && nd.ty === ty) {
                nd.destroy();
                this.nodes.splice(ni, 1);
              }
            }
            const id = `npc_bld_${theme}_${pl.type}_${tx}_${ty}`;
            const bld = new BuildingEntity(this, id, pl.type, tx, ty, [], 0, true);
            this.registerBuilding(bld);
          }
          const doorX = (plot.ox + stamp.doorLx) * TILE_PX + 8;
          const doorY = (plot.oy + stamp.doorLy) * TILE_PX + 8;
          const signBox = this.createWorldLabelBox(doorX, doorY - 20, stamp.name, '#ffe6a8', 0xd9a85b, '7px');
          signBox.container.setAlpha(0).setVisible(false);
          this.houseDoorSigns.push({
            doorX,
            doorY,
            baseY: doorY - 20,
            container: signBox.container,
          });
          this.rebuildHouseRoofs();
        }
      }
    }

    // 3. Ambient wildlife on peaceful biomes (moving, pettable, and huntable)
    if (spec.biome === 'grass' || spec.biome === 'autumn') {
      const animalList: Array<'Cow' | 'Hen' | 'Rabbit' | 'Deer'> =
        spec.biome === 'grass' ? ['Cow', 'Hen', 'Rabbit'] : ['Deer'];
      const pick = Phaser.Utils.Array.GetRandom(animalList);
      const aTile = this.findNearestLandTileOnIsland(
        gx,
        gy,
        Phaser.Math.Between(Math.floor(ISLAND_CELL_TILES * 0.25), Math.floor(ISLAND_CELL_TILES * 0.75)),
        Phaser.Math.Between(Math.floor(ISLAND_CELL_TILES * 0.25), Math.floor(ISLAND_CELL_TILES * 0.75)),
      );
      const ax = aTile.tx * TILE_PX + 8;
      const ay = aTile.ty * TILE_PX + 8;
      const keyMap: Record<string, string> = {
        Cow: 'animals/Cow_idle (20x16)',
        Deer: 'animals/Deer_Idle (32x32)',
        Hen: 'animals/Hen_idle (16x16)',
        Rabbit: 'animals/Rabbit_Idle (16x16)',
      };
      const shadow = this.add.ellipse(ax, ay - 1, 10, 4, 0x000000, 0.35).setDepth(ay - 1);
      const anim = this.add.sprite(ax, ay - 4, keyMap[pick], 0).setDepth(ay);
      if (this.anims.exists(`animal_${pick}_idle_down`)) anim.play(`animal_${pick}_idle_down`);
      playSpawnGrowAndJello(this, anim, 1, 1);
      this.animals.push({
        kind: pick,
        sprite: anim,
        shadow,
        x: ax,
        y: ay,
        hp: 24,
        vx: 0,
        vy: 0,
        wanderTimerMs: Phaser.Math.Between(800, 2200),
        petCooldownMs: 0,
      });
    }

    // 4. Spawn Resource Nodes & Fishing Spots on island (when not restoring from save)
    if (spawnNodes) {
      const count = spec.starterOwned ? STARTER_ISLAND_NODES : MAX_NODES_PER_ISLAND;
      for (let i = 0; i < count; i++) {
        this.trySpawnNodeOnIsland(gx, gy, centerTx, centerTy);
      }

      for (let f = 0; f < 5; f++) {
        const fx = ox + Phaser.Math.Between(0, ISLAND_CELL_TILES - 1);
        const fy = oy + Phaser.Math.Between(0, ISLAND_CELL_TILES - 1);
        if (this.terrainGrid[fy][fx] === 'water' && !this.hasNodeAt(fx, fy)) {
          this.nodes.push(new ResourceNode(this, fx, fy, 'fish_spot', spec.biome));
        }
      }
    }

    // 6. Spawn Biome Monsters (avoid player & starter center)
    const monCount = spec.starterOwned ? 1 : spec.maxMonsters;
    for (let m = 0; m < monCount; m++) {
      this.trySpawnMonsterOnIsland(gx, gy, spec.starterOwned ? centerTx : -1, spec.starterOwned ? centerTy : -1);
    }
  }

  private trySpawnMonsterOnIsland(
    gx: number,
    gy: number,
    avoidTx = -1,
    avoidTy = -1,
  ): boolean {
    const spec = getIslandAt(gx, gy);
    if (!spec || spec.monsterPool.length === 0) return false;
    const ox = gx * ISLAND_CELL_TILES;
    const oy = gy * ISLAND_CELL_TILES;
    for (let attempt = 0; attempt < 10; attempt++) {
      const mtx = ox + Phaser.Math.Between(1, ISLAND_CELL_TILES - 2);
      const mty = oy + Phaser.Math.Between(1, ISLAND_CELL_TILES - 2);
      if (!isLand(this.terrainGrid[mty]?.[mtx])) continue;
      if (this.hasNodeAt(mtx, mty) || this.hasBuildingAt(mtx, mty)) continue;
      if (avoidTx >= 0 && Math.hypot(mtx - avoidTx, mty - avoidTy) < 4) continue;
      const wx = mtx * TILE_PX + 8;
      const wy = mty * TILE_PX + 8;
      if (this.player && Math.hypot(wx - this.player.x, wy - this.player.y) < 56) continue;
      const monId = Phaser.Utils.Array.GetRandom(spec.monsterPool);
      this.enemies.push(new Enemy(this, monId, wx, wy));
      return true;
    }
    return false;
  }

  private trySpawnNodeOnIsland(
    gx: number,
    gy: number,
    avoidTx = -1,
    avoidTy = -1,
  ): boolean {
    const spec = getIslandAt(gx, gy);
    if (!spec) return false;
    const ox = gx * ISLAND_CELL_TILES;
    const oy = gy * ISLAND_CELL_TILES;

    // Periodic respawns (when avoidTx < 0) can also spawn a water whirlpool (fish_spot)
    if (avoidTx < 0 && Math.random() < 0.2) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const fx = ox + Phaser.Math.Between(0, ISLAND_CELL_TILES - 1);
        const fy = oy + Phaser.Math.Between(0, ISLAND_CELL_TILES - 1);
        if (this.terrainGrid[fy]?.[fx] === 'water' && !this.hasNodeAt(fx, fy) && !this.hasBuildingAt(fx, fy)) {
          this.nodes.push(new ResourceNode(this, fx, fy, 'fish_spot', spec.biome));
          return true;
        }
      }
    }

    for (let attempt = 0; attempt < 16; attempt++) {
      const tx = ox + Phaser.Math.Between(1, ISLAND_CELL_TILES - 2);
      const ty = oy + Phaser.Math.Between(1, ISLAND_CELL_TILES - 2);
      if (!isLand(this.terrainGrid[ty]?.[tx])) continue;
      if (avoidTx >= 0 && Math.hypot(tx - avoidTx, ty - avoidTy) < 2.4) continue;
      // Never spawn on top of or adjacent-locking the player, NPCs, or dungeon portals
      const px = tx * TILE_PX + 8;
      const py = ty * TILE_PX + 8;
      if (this.player && Math.hypot(px - this.player.x, py - this.player.y) < 40) continue;
      if (this.npcs.some((npc) => Math.hypot(px - npc.x, py - npc.y) < 28)) continue;
      if (this.dungeonPortals.some((dp) => Math.hypot(px - dp.x, py - dp.y) < 28)) continue;
      if (this.houseTileSet.has(`${tx},${ty}`)) continue;
      if (this.hasNodeAt(tx, ty) || this.hasBuildingAt(tx, ty)) continue;

      const kind = this.pickNodeKindForBiome(spec.biome);
      this.nodes.push(new ResourceNode(this, tx, ty, kind, spec.biome));
      return true;
    }
    return false;
  }

  private pickNodeKindForBiome(biome: BiomeKind): NodeKind {
    const roll = Math.random();
    if (roll < 0.34) return 'tree';
    if (roll < 0.56) return 'rock';
    if (roll < 0.67) return 'coal_vein';
    if (roll < 0.77) return 'berry_bush';
    if (roll < 0.85) return 'dig_spot';
    if (biome === 'grass') return Math.random() < 0.65 ? 'iron_vein' : 'tree';
    if (biome === 'autumn') return Math.random() < 0.5 ? 'gold_vein' : 'iron_vein';
    if (biome === 'graveyard') return Math.random() < 0.55 ? 'iron_vein' : 'dig_spot';
    if (biome === 'winter') return Math.random() < 0.65 ? 'crystal_vein' : 'gold_vein';
    return Math.random() < 0.65 ? 'obsidian_vein' : 'gold_vein';
  }

  private hasNodeAt(tx: number, ty: number): boolean {
    return this.nodes.some((n) => n.active && n.tx === tx && n.ty === ty);
  }

  private hasBuildingAt(tx: number, ty: number): boolean {
    return this.buildings.some((b) => b.active && b.tx === tx && b.ty === ty);
  }

  private ensureFogTextures(): void {
    if (!this.textures.exists('_fog_veil_tile')) {
      const tex = this.textures.createCanvas('_fog_veil_tile', 128, 128);
      if (tex) {
        const ctx = tex.getContext();
        const grad = ctx.createRadialGradient(64, 64, 14, 64, 64, 64);
        grad.addColorStop(0, 'rgba(222, 234, 248, 0.72)');
        grad.addColorStop(0.55, 'rgba(206, 222, 242, 0.56)');
        grad.addColorStop(0.82, 'rgba(192, 212, 236, 0.28)');
        grad.addColorStop(1, 'rgba(186, 208, 234, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        tex.refresh();
      }
    }
    if (!this.textures.exists('_fog_cloud_puff')) {
      const tex = this.textures.createCanvas('_fog_cloud_puff', 96, 64);
      if (tex) {
        const ctx = tex.getContext();
        const lobes = [
          { x: 48, y: 34, r: 24, a: 0.68 },
          { x: 30, y: 36, r: 19, a: 0.56 },
          { x: 66, y: 36, r: 19, a: 0.56 },
          { x: 42, y: 24, r: 18, a: 0.62 },
          { x: 56, y: 26, r: 17, a: 0.60 },
        ];
        for (const l of lobes) {
          const g = ctx.createRadialGradient(l.x, l.y, l.r * 0.15, l.x, l.y, l.r);
          g.addColorStop(0, `rgba(240, 247, 255, ${l.a})`);
          g.addColorStop(0.6, `rgba(218, 232, 248, ${l.a * 0.62})`);
          g.addColorStop(1, 'rgba(200, 220, 244, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
          ctx.fill();
        }
        tex.refresh();
      }
    }
  }

  private refreshPurchaseMarkers(): void {
    this.ensureFogTextures();
    for (const m of this.purchaseMarkers) {
      m.veil.destroy();
      for (const p of m.puffs) p.sprite.destroy();
      m.label?.destroy();
    }
    this.purchaseMarkers = [];

    for (const spec of ISLANDS) {
      if (gameState.ownedIslands.has(`${spec.gx},${spec.gy}`)) continue;
      const cx = (spec.gx * ISLAND_CELL_TILES + ISLAND_CELL_TILES / 2) * TILE_PX;
      const cy = (spec.gy * ISLAND_CELL_TILES + ISLAND_CELL_TILES / 2) * TILE_PX;
      const size = ISLAND_CELL_TILES * TILE_PX;
      const isAdjacent = gameState.isIslandAdjacentToOwned(spec.gx, spec.gy);

      const veil = this.add
        .image(cx, cy, '_fog_veil_tile')
        .setDisplaySize(size * 1.24, size * 1.24)
        .setAlpha(isAdjacent ? 0.82 : 0.94)
        .setDepth(8500);

      const puffs: FogCloudPuff[] = [];
      const half = size * 0.44;
      const puffCount = isAdjacent ? 10 : 12;
      for (let i = 0; i < puffCount; i++) {
        const ang = (i / puffCount) * Math.PI * 2 + (spec.gx * 0.7 + spec.gy * 1.1);
        const ring = i < 4 ? 0.34 : 0.88 + ((i * 37) % 10) * 0.025;
        const px = cx + Math.cos(ang) * half * ring;
        const py = cy + Math.sin(ang) * half * ring;
        const scale = (isAdjacent ? 1.55 : 1.85) + ((i * 19) % 7) * 0.14;
        const baseAlpha = (isAdjacent ? 0.52 : 0.72) + ((i % 3) * 0.06);
        const sprite = this.add
          .image(px, py, '_fog_cloud_puff')
          .setScale(scale, scale * 0.82)
          .setAlpha(baseAlpha)
          .setDepth(8501 + (i % 3));
        puffs.push({
          sprite,
          baseX: px,
          baseY: py,
          baseAlpha,
          phase: i * 0.9 + spec.gx * 1.3 + spec.gy * 0.7,
          driftX: 6 + (i % 4) * 2.5,
          driftY: 2.5 + (i % 3) * 1.2,
          speed: 0.45 + (i % 5) * 0.08,
        });
      }

      let label: Phaser.GameObjects.Text | undefined;
      if (isAdjacent) {
        const cost = gameState.getIslandCost(spec.gx, spec.gy);
        const canAfford = gameState.coins >= cost;
        label = this.add
          .text(cx, cy, `${spec.name}\n(${spec.biome})\n${fmtKeySuffix('Map', 'M')}: ${cost}g`, {
            fontSize: '8px',
            fontStyle: 'bold',
            color: canAfford ? '#ffe680' : '#e2eefb',
            align: 'center',
            stroke: '#0d1624',
            strokeThickness: 2.5,
            resolution: 4,
          })
          .setOrigin(0.5)
          .setDepth(8510);
      }

      this.purchaseMarkers.push({ gx: spec.gx, gy: spec.gy, veil, puffs, label });
    }
  }

  private clearFogForIsland(gx: number, gy: number): void {
    const boughtIdx = this.purchaseMarkers.findIndex((m) => m.gx === gx && m.gy === gy);
    if (boughtIdx < 0) return;
    const [bought] = this.purchaseMarkers.splice(boughtIdx, 1);
    bought.label?.destroy();
    this.tweens.add({
      targets: bought.veil,
      alpha: 0,
      scaleX: bought.veil.scaleX * 1.25,
      scaleY: bought.veil.scaleY * 1.25,
      duration: 480,
      ease: 'Quad.Out',
      onComplete: () => bought.veil.destroy(),
    });
    const icx = (gx * ISLAND_CELL_TILES + ISLAND_CELL_TILES / 2) * TILE_PX;
    const icy = (gy * ISLAND_CELL_TILES + ISLAND_CELL_TILES / 2) * TILE_PX;
    for (const p of bought.puffs) {
      const ang = Math.atan2(p.baseY - icy, p.baseX - icx);
      this.tweens.add({
        targets: p.sprite,
        x: p.sprite.x + Math.cos(ang) * 44,
        y: p.sprite.y + Math.sin(ang) * 44,
        alpha: 0,
        duration: 560,
        ease: 'Quad.Out',
        onComplete: () => p.sprite.destroy(),
      });
    }
  }

  private attemptBuyIsland(gx: number, gy: number): void {
    const lockReason = gameState.getIslandStoryLockReason(gx, gy);
    if (lockReason) {
      this.hud.showToast(lockReason);
      return;
    }
    if (!gameState.buyIsland(gx, gy)) {
      this.hud.showToast('Not enough Coins or island not adjacent!');
      return;
    }
    this.clearFogForIsland(gx, gy);
    this.stampIslandTerrain(gx, gy);
    const ox = gx * ISLAND_CELL_TILES;
    const oy = gy * ISLAND_CELL_TILES;
    this.removeBridgesOnLand(ox, oy, ox + ISLAND_CELL_TILES - 1, oy + ISLAND_CELL_TILES - 1, true);
    this.refreshAutoTiles(ox - 1, oy - 1, ox + ISLAND_CELL_TILES, oy + ISLAND_CELL_TILES);
    this.populateIslandContent(gx, gy);
    this.refreshPurchaseMarkers();
    const spec = getIslandAt(gx, gy);
    const centerPx = (gx * ISLAND_CELL_TILES + ISLAND_CELL_TILES / 2) * TILE_PX;
    const centerPy = (gy * ISLAND_CELL_TILES + ISLAND_CELL_TILES / 2) * TILE_PX;
    this.fx.play('island_unlock', { x: centerPx, y: centerPy });
    this.cameraRig.zoomPunch(0.05, 160);
    this.hud.showToast(`Purchased ${spec?.name ?? 'New Island'}!`);
    revealSequence.show({
      title: 'ISLAND UNLOCKED!',
      subtitle: `${spec?.name ?? 'New Island'} (${spec?.biome?.toUpperCase() ?? 'ISLE'})`,
      badgeText: '🏝️',
      accentColor: '#7ef29d',
    });
    gameState.save();
  }

  private syncBuildingQueuesToSave(): void {
    for (const bSave of gameState.buildings) {
      const ent = this.buildings.find((b) => b.id === bSave.id);
      if (ent) {
        bSave.craftQueue = ent.craftQueue.map((j) => ({ ...j }));
        if (ent.isCrop()) {
          bSave.cropStage = ent.getCropStage();
          bSave.stageWatered = ent.isStageWatered();
          bSave.wateredCount = ent.getWateredCount();
          bSave.harvestsLeft = ent.getHarvestsLeft();
          bSave.withered = ent.isCropWithered();
        }
      }
    }
    gameState.savedNodes = this.nodes
      .filter((n) => n.active)
      .map((n) => ({ tx: n.tx, ty: n.ty, kind: n.kind, biome: n.biome, hp: n.hp }));
    gameState.savedDrops = this.drops
      .filter((d) => d.active)
      .map((d) => ({ x: d.x, y: d.y, itemId: d.itemId, qty: d.qty, isCoin: d.isCoin }));
  }

  private setupHud(): void {
    this.hud = new HudController({
      onBuyIsland: (gx, gy) => this.attemptBuyIsland(gx, gy),
      onSelectBuild: () => {},
      onUseHotbarItem: (itemId) => this.tryConsumeItem(itemId),
      onSave: () => {
        gameState.playerPos = { x: this.player.x, y: this.player.y };
        this.syncBuildingQueuesToSave();
        gameState.save();
        SFX.playCraft();
        this.hud.showToast(`File ${gameState.activeSlotIndex + 1} Saved!`);
      },
      onExitToTitle: () => {
        if (transitionManager.isActive) return;
        SFX.playPortalWarp();
        void transitionManager.transitionTo({
          onMidpoint: async () => {
            gameState.playerPos = { x: this.player.x, y: this.player.y };
            this.syncBuildingQueuesToSave();
            gameState.save();
            this.hud.destroy();
            SFX.setMusicSituation('title');
            await startSceneAndWaitCreate(this, 'TitleScene', { skipSplash: true });
          },
        });
      },
      onTouchAction: () => {
        if (this.fishingMinigame.isActive()) return;
        if (this.hud.isBlockingInput()) return;
        const f = this.player.facing;
        const dx = f === 'left' ? -28 : f === 'right' ? 28 : 0;
        const dy = f === 'up' ? -28 : f === 'down' ? 28 : 0;
        this.handlePrimaryAction(this.player.x + dx, this.player.y + dy);
      },
      onTouchActionHold: (holding) => {
        if (this.fishingMinigame.isActive()) {
          this.fishingMinigame.setHolding(holding);
        }
      },
      onTouchDash: () => {
        if (this.hud.isBlockingInput()) return;
        const tv = this.hud.getTouchMoveVector();
        this.player.tryDash(new Phaser.Math.Vector2(tv.x, tv.y));
      },
      onTouchPlaceBuilding: () => {
        if (!gameState.pendingBuildRecipeId) return;
        const f = this.player.facing;
        const dx = f === 'left' ? -18 : f === 'right' ? 18 : 0;
        const dy = f === 'up' ? -18 : f === 'down' ? 18 : 0;
        this.tryPlaceBuilding(this.player.x + dx, this.player.y + dy);
      },
      onTouchConfirmBuilding: () => {
        if (!gameState.pendingBuildRecipeId || !this.mobilePlaceActive) return;
        this.tryPlaceBuilding(this.mobilePlaceTx * TILE_PX + 8, this.mobilePlaceTy * TILE_PX + 8);
      },
      getNearbyStations: () => {
        const set = new Set<CraftingStation>();
        for (const b of this.buildings) {
          if (b.active && Math.hypot(b.x - this.player.x, b.y - this.player.y) <= 44) {
            set.add(b.structureType as CraftingStation);
          }
        }
        return set;
      },
      getStations: (stationType) =>
        this.buildings
          .filter((b) => b.active && b.structureType === stationType)
          .map((b) => ({
            id: b.id,
            type: b.structureType as QueuedStationType,
            maxQueueSize: b.maxQueueSize,
            craftQueue: b.craftQueue,
          })),
      onEnqueueCraft: (stationId, recipeId) => {
        const b = this.buildings.find((ent) => ent.active && ent.id === stationId);
        if (!b) return false;
        const ok = b.enqueueCraft(recipeId);
        if (ok) {
          SFX.playCraft();
          this.syncBuildingQueuesToSave();
        }
        return ok;
      },
      onCancelCraft: (stationId, queueIdx) => {
        const b = this.buildings.find((ent) => ent.active && ent.id === stationId);
        if (!b) return false;
        const ok = b.cancelCraft(queueIdx);
        if (ok) {
          SFX.playPickup();
          this.syncBuildingQueuesToSave();
        }
        return ok;
      },
      onStokeStation: (stationId) => this.stokeStation(stationId),
      getWorldDebugStats: () => ({
        scene: 'OverworldScene',
        playerTx: Math.floor(this.player.x / TILE_PX),
        playerTy: Math.floor(this.player.y / TILE_PX),
        nodesCount: this.nodes.filter((n) => n.active).length,
        enemiesCount: this.enemies.filter((e) => e.active && !e.isDead).length,
        buildingsCount: this.buildings.filter((b) => b.active).length,
        activeCraftJobs: this.buildings.reduce((acc, b) => acc + (b.active ? b.craftQueue.length : 0), 0),
        hasSavedData: gameState.hasSavedGame(),
      }),
      onDebugAction: (action, payload) => {
        if (action === 'unlock_all_islands') {
          for (const spec of ISLANDS) {
            const key = `${spec.gx},${spec.gy}`;
            if (!gameState.ownedIslands.has(key)) {
              gameState.ownedIslands.add(key);
              this.stampIslandTerrain(spec.gx, spec.gy);
              this.populateIslandContent(spec.gx, spec.gy);
            }
          }
          this.refreshAutoTiles(0, 0, WORLD_TILES - 1, WORLD_TILES - 1);
          this.refreshPurchaseMarkers();
          SFX.playLevelUp();
          gameState.emit();
          this.hud.showToast('Debug: Unlocked all 25 islands!');
        } else if (action === 'teleport_island' && payload) {
          const [gx, gy] = payload.split(',').map(Number);
          const key = `${gx},${gy}`;
          if (!gameState.ownedIslands.has(key)) {
            gameState.ownedIslands.add(key);
            this.stampIslandTerrain(gx, gy);
            const ox = gx * ISLAND_CELL_TILES;
            const oy = gy * ISLAND_CELL_TILES;
            this.removeBridgesOnLand(ox, oy, ox + ISLAND_CELL_TILES - 1, oy + ISLAND_CELL_TILES - 1, true);
            this.refreshAutoTiles(ox - 1, oy - 1, ox + ISLAND_CELL_TILES, oy + ISLAND_CELL_TILES);
            this.populateIslandContent(gx, gy);
            this.refreshPurchaseMarkers();
          }
          const half = Math.floor(ISLAND_CELL_TILES / 2);
          const tile = this.findNearestLandTileOnIsland(gx, gy, half, half);
          const pt = this.findNearestWalkablePoint(tile.tx * TILE_PX + 8, tile.ty * TILE_PX + 8);
          this.player.setPosition(pt.x, pt.y);
          this.fox.setPosition(pt.x - 16, pt.y + 6);
          gameState.emit();
          const spec = getIslandAt(gx, gy);
          this.hud.showToast(`Teleported to ${spec?.name ?? key}`);
        } else if (action === 'set_time' && payload) {
          this.lighting.timeOfDay = Number(payload);
          const info = this.lighting.getPhaseLabel();
          this.hud.setTimeLabel(
            `Day ${this.lighting.dayNumber} • ${info.label} ${info.clockStr} • ${this.weather.getStatusLabel()}`,
          );
          this.hud.showToast(`Time set to ${info.label} (${info.clockStr})`);
        } else if (action === 'set_weather' && payload) {
          this.weather.setDebugWeather(payload as WeatherKind | 'auto');
          this.hud.showToast(`Weather: ${this.weather.getStatusLabel()}`);
        } else if (action === 'next_day') {
          this.lighting.dayNumber++;
          this.weather.setDay(this.lighting.dayNumber);
          this.hud.showToast(`Day ${this.lighting.dayNumber} • ${this.weather.getStatusLabel()}`);
        } else if (action === 'clear_dungeons') {
          gameState.clearedDungeons.add('skull_crypt');
          gameState.clearedDungeons.add('sunken_tomb');
          gameState.clearedDungeons.add('frost_cavern');
          gameState.clearedDungeons.add('infernal_sanctum');
          gameState.debugUnlockAllRelics();
          this.refreshDungeonPortals();
          SFX.playLevelUp();
          this.hud.showToast('Debug: All 4 Dungeons Cleared + Relic Rods Unlocked!');
        } else if (action === 'reset_run') {
          gameState.reset(gameState.heroClass);
          this.hud.destroy();
          this.scene.restart();
        } else if (action === 'erase_save') {
          gameState.eraseAllSavedData();
          this.hud.destroy();
          this.scene.start('TitleScene');
        }
      },
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
      TAB: kb.addKey('TAB'),
      K: kb.addKey('K'),
      M: kb.addKey('M'),
      I: kb.addKey('I'),
      P: kb.addKey('P'),
      ESC: kb.addKey('ESC'),
    };

    kb.on('keydown-TAB', (ev: KeyboardEvent) => {
      ev.preventDefault();
      this.hud.toggleModal('craft');
    });
    kb.on('keydown-K', () => this.hud.toggleModal('skills'));
    kb.on('keydown-Q', () => this.hud.toggleModal('quests'));
    kb.on('keydown-M', () => this.hud.toggleModal('map'));
    kb.on('keydown-I', () => this.hud.toggleModal('inventory'));
    kb.on('keydown-P', () => this.hud.toggleModal('progress'));
    kb.on('keydown-N', () => this.hud.toggleMinimap());
    kb.on('keydown-ESC', () => {
      if (gameState.pendingBuildRecipeId) {
        gameState.pendingBuildRecipeId = null;
        this.hud.render();
      } else if (this.hud.activeModal !== 'none') {
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

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      if (this.hud.isBlockingInput()) return;
      if (pointer.event && pointer.event.target !== this.game.canvas) return;
      if (pointer.rightButtonDown()) {
        if (gameState.pendingBuildRecipeId) {
          gameState.pendingBuildRecipeId = null;
          this.hud.render();
        }
        return;
      }
      if (!gameState.pendingBuildRecipeId && currentlyOver && currentlyOver.length > 0) return;
      if (pointer.leftButtonDown()) {
        const worldPt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        if (this.mobilePlaceActive && gameState.pendingBuildRecipeId) {
          const curX = this.mobilePlaceTx * TILE_PX + 8;
          const curY = this.mobilePlaceTy * TILE_PX + 8;
          if (Math.hypot(worldPt.x - curX, worldPt.y - curY) > 40) {
            this.mobilePlaceWorldX = worldPt.x;
            this.mobilePlaceWorldY = worldPt.y;
            this.mobilePlaceTx = Phaser.Math.Clamp(Math.floor(worldPt.x / TILE_PX), 0, WORLD_TILES - 1);
            this.mobilePlaceTy = Phaser.Math.Clamp(Math.floor(worldPt.y / TILE_PX), 0, WORLD_TILES - 1);
          }
          this.mobilePlaceDragging = true;
          this.mobileDragLastWorldX = worldPt.x;
          this.mobileDragLastWorldY = worldPt.y;
        } else if (gameState.pendingBuildRecipeId) {
          this.tryPlaceBuilding(worldPt.x, worldPt.y);
        } else {
          this.handlePrimaryAction(worldPt.x, worldPt.y);
        }
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.mobilePlaceActive || !this.mobilePlaceDragging || !pointer.isDown) return;
      const worldPt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const dx = worldPt.x - this.mobileDragLastWorldX;
      const dy = worldPt.y - this.mobileDragLastWorldY;
      this.mobileDragLastWorldX = worldPt.x;
      this.mobileDragLastWorldY = worldPt.y;
      this.mobilePlaceWorldX = Phaser.Math.Clamp(this.mobilePlaceWorldX + dx, 8, WORLD_TILES * TILE_PX - 8);
      this.mobilePlaceWorldY = Phaser.Math.Clamp(this.mobilePlaceWorldY + dy, 8, WORLD_TILES * TILE_PX - 8);
      this.mobilePlaceTx = Phaser.Math.Clamp(Math.floor(this.mobilePlaceWorldX / TILE_PX), 0, WORLD_TILES - 1);
      this.mobilePlaceTy = Phaser.Math.Clamp(Math.floor(this.mobilePlaceWorldY / TILE_PX), 0, WORLD_TILES - 1);
    });

    this.input.on('pointerup', () => {
      if (!this.mobilePlaceDragging) return;
      this.mobilePlaceDragging = false;
      this.mobilePlaceWorldX = this.mobilePlaceTx * TILE_PX + 8;
      this.mobilePlaceWorldY = this.mobilePlaceTy * TILE_PX + 8;
    });

    // Save progress & suspend audio when app is backgrounded or closed
    const onVisibility = () => {
      if (document.hidden) {
        if (this.player) {
          gameState.playerPos = { x: this.player.x, y: this.player.y };
        }
        this.syncBuildingQueuesToSave();
        gameState.save();
        SFX.suspendAll();
      } else {
        SFX.resumeAll();
      }
    };
    const onPageHide = () => {
      if (this.player) {
        gameState.playerPos = { x: this.player.x, y: this.player.y };
      }
      this.syncBuildingQueuesToSave();
      gameState.save();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', onPageHide);
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onPageHide);
      }
    });

    const promo = getPromoConfig();
    if (promo.shotId && promo.shotId !== '07_void_dragon_climax' && promo.shotId !== '08_outro_cta') {
      this.promoTimeline = createOverworldPromoTimeline(promo.shotId, {
        scene: this,
        player: this.player,
        hud: this.hud,
        lighting: this.lighting,
        weather: this.weather,
        nodes: this.nodes,
        enemies: this.enemies,
        buildings: this.buildings,
        spawnNode: (tx, ty, kind, biome) => {
          const n = new ResourceNode(this, tx, ty, kind, biome);
          this.nodes.push(n);
          return n;
        },
        spawnEnemy: (monsterId, wx, wy) => {
          const e = new Enemy(this, monsterId, wx, wy);
          this.enemies.push(e);
          return e;
        },
        spawnBuilding: (type, tx, ty) => {
          const id = `promo_${type}_${tx}_${ty}`;
          const b = new BuildingEntity(this, id, type, tx, ty);
          this.registerBuilding(b);
          return b;
        },
        detonateBombAt: (wx, wy) => this.detonateBomb(wx, wy),
        fireWeaponAt: (itemId, wx, wy) => {
          const idx = gameState.hotbar.indexOf(itemId);
          if (idx !== -1) gameState.selectedHotbarIndex = idx;
          else gameState.hotbar[0] = itemId;
          gameState.selectedHotbarIndex = idx !== -1 ? idx : 0;
          this.handlePrimaryAction(wx, wy, false);
        },
        teleportIsland: (gx, gy) => {
          const key = `${gx},${gy}`;
          if (!gameState.ownedIslands.has(key)) {
            gameState.ownedIslands.add(key);
            this.stampIslandTerrain(gx, gy);
            const ox = gx * ISLAND_CELL_TILES;
            const oy = gy * ISLAND_CELL_TILES;
            this.refreshAutoTiles(ox - 1, oy - 1, ox + ISLAND_CELL_TILES, oy + ISLAND_CELL_TILES);
            this.populateIslandContent(gx, gy);
            this.refreshPurchaseMarkers();
          }
          const half = Math.floor(ISLAND_CELL_TILES / 2);
          const tile = this.findNearestLandTileOnIsland(gx, gy, half, half);
          const pt = this.findNearestWalkablePoint(tile.tx * TILE_PX + 8, tile.ty * TILE_PX + 8);
          this.player.setPosition(pt.x, pt.y);
          this.cameras.main.centerOn(pt.x, pt.y);
        },
        buyIsland: (gx, gy) => this.attemptBuyIsland(gx, gy),
        setZoom: (zoom) => this.cameras.main.setZoom(zoom),
        panCameraTo: (wx, wy) => {
          this.cameras.main.stopFollow();
          this.cameras.main.pan(wx, wy, 260, 'Sine.easeOut');
        },
      });
      markPromoReady();
    }
  }

  private drawPlacementGizmo(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, valid: boolean): void {
    gfx.clear();
    const ringCol = valid ? 0x5ef2ff : 0xff7a85;
    const arrowCol = valid ? 0xffe066 : 0xff9ea8;
    // Outer ring & crosshair
    gfx.lineStyle(1.4, ringCol, 0.95);
    gfx.strokeCircle(cx, cy, 13);
    gfx.lineStyle(1, 0xffffff, 0.45);
    gfx.strokeCircle(cx, cy, 16);

    // 4-way drag handle arrows (N, S, E, W)
    const tip = 19;
    const base = 14.5;
    const wing = 2.6;
    gfx.fillStyle(arrowCol, 0.98);
    // Up
    gfx.fillTriangle(cx, cy - tip, cx - wing, cy - base, cx + wing, cy - base);
    // Down
    gfx.fillTriangle(cx, cy + tip, cx - wing, cy + base, cx + wing, cy + base);
    // Left
    gfx.fillTriangle(cx - tip, cy, cx - base, cy - wing, cx - base, cy + wing);
    // Right
    gfx.fillTriangle(cx + tip, cy, cx + base, cy - wing, cx + base, cy + wing);
  }

  private validatePlacement(tx: number, ty: number): { ok: boolean; reason?: string; rec?: (typeof RECIPES)[number] } {
    const rec = RECIPES.find((r) => r.id === gameState.pendingBuildRecipeId);
    if (!rec || !rec.structureType) return { ok: false };
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return { ok: false };

    const terrain = this.terrainGrid[ty][tx];
    const st = rec.structureType;
    if (st === 'bridge' || st === 'fish_trap') {
      if (terrain !== 'water') return { ok: false, reason: `${rec.name} must be placed on water!`, rec };
      if (
        st === 'bridge' &&
        (this.overlayGrid[ty]?.[tx] === 'bridge' || this.bridgeSet.has(`${tx},${ty}`))
      ) {
        return { ok: false, reason: 'Wooden bridge already placed here!', rec };
      }
    } else if (!isLand(terrain)) {
      return { ok: false, reason: `${rec.name} must be placed on land!`, rec };
    }

    if (st.startsWith('crop_') && this.overlayGrid[ty]?.[tx] !== 'dirt') {
      return { ok: false, reason: 'Requires tilled soil (use Hoe first)!', rec };
    }

    const existingBld = this.buildings.find((b) => b.active && b.tx === tx && b.ty === ty);
    const canPlaceOnFloor =
      existingBld?.structureType === 'house_floor' &&
      (st.startsWith('furniture_') || st === 'house_wall' || st === 'house_door');
    if ((existingBld && !canPlaceOnFloor) || this.hasNodeAt(tx, ty)) {
      return { ok: false, reason: 'Tile is already occupied!', rec };
    }

    const isSolidBuild =
      st !== 'bridge' &&
      st !== 'road_stone' &&
      st !== 'fish_trap' &&
      st !== 'house_floor' &&
      st !== 'furniture_lamp' &&
      st !== 'furniture_rug' &&
      !st.startsWith('crop_');
    if (
      isSolidBuild &&
      Math.hypot(tx * TILE_PX + 8 - this.player.x, ty * TILE_PX + 8 - this.player.y) < 12
    ) {
      return { ok: false, reason: 'Step aside — cannot place a solid structure on yourself!', rec };
    }

    return { ok: true, rec };
  }

  private canPlacePendingAt(tx: number, ty: number): boolean {
    return this.validatePlacement(tx, ty).ok;
  }

  private tryPlaceBuilding(wx: number, wy: number): void {
    const tx = Math.floor(wx / TILE_PX);
    const ty = Math.floor(wy / TILE_PX);
    const check = this.validatePlacement(tx, ty);
    if (!check.rec || !check.rec.structureType) {
      gameState.pendingBuildRecipeId = null;
      this.hud.render();
      return;
    }
    if (!check.ok) {
      if (check.reason) this.hud.showToast(check.reason);
      return;
    }

    const rec = check.rec;
    const st = rec.structureType!;

    if (!gameState.craftRecipe(rec.id)) {
      this.hud.showToast('Missing materials!');
      gameState.pendingBuildRecipeId = null;
      this.hud.render();
      return;
    }

    if (st.startsWith('crop_')) SFX.playPlantSeed();
    spawnBurstParticles(this, tx * TILE_PX + 8, ty * TILE_PX + 8, st.startsWith('crop_') ? 0x7ef29d : 0xd8c8a8, 6);
    if (st === 'bridge') {
      SFX.playBuildPlace();
      this.overlayGrid[ty][tx] = 'bridge';
      this.bridgeSet.add(`${tx},${ty}`);
      if (!gameState.overlays.some((o) => o.tx === tx && o.ty === ty && o.type === 'bridge')) {
        gameState.overlays.push({ tx, ty, type: 'bridge' });
      }
      this.refreshAutoTiles(tx - 1, ty - 1, tx + 1, ty + 1);
    } else if (st === 'road_stone') {
      SFX.playBuildPlace();
      this.overlayGrid[ty][tx] = 'road';
      gameState.overlays.push({ tx, ty, type: 'road' });
      this.refreshAutoTiles(tx - 1, ty - 1, tx + 1, ty + 1);
    } else {
      const id = `bld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const bld = new BuildingEntity(this, id, st, tx, ty);
      bld.playPlacePop();
      this.registerBuilding(bld);
      gameState.buildings.push({ id, type: st, tx, ty });
      if (this.isHousePart(st)) this.rebuildHouseRoofs();
    }
    gameState.recordQuestProgress('build', st, 1);

    // Keep placing bridges/roads/floors/walls/fences smoothly while materials last!
    const multiPlace =
      st === 'bridge' ||
      st === 'road_stone' ||
      st === 'house_floor' ||
      st === 'house_wall' ||
      st === 'fence';
    if (!multiPlace || !gameState.canCraft(rec)) {
      gameState.pendingBuildRecipeId = null;
    }
    this.hud.render();
  }

  private tryConsumeItem(itemId: string): void {
    const def = ITEMS[itemId];
    if (!def) return;
    if (def.healHp || def.healEnergy) {
      if ((gameState.inventory[itemId] ?? 0) <= 0) return;
      gameState.removeItem(itemId, 1);
      if (def.healHp) gameState.hp = Math.min(gameState.getMaxHp(), gameState.hp + def.healHp);
      if (def.healEnergy) {
        gameState.energy = Math.min(gameState.getMaxEnergy(), gameState.energy + def.healEnergy);
      }
      if (itemId.startsWith('potion')) SFX.playDrinkPotion();
      else SFX.playEat();
      spawnBurstParticles(this, this.player.x, this.player.y - 6, 0x7ef59a, 6);
      spawnFloatingText(this, this.player.x, this.player.y - 14, `+${def.healHp ?? 0}HP +${def.healEnergy ?? 0}EN`, '#7ef59a');
      gameState.emit();
    }
  }

  private handlePrimaryAction(wx: number, wy: number, fromHold = false): void {
    const itemId = gameState.hotbar[gameState.selectedHotbarIndex] || 'pickaxe';
    const def = ITEMS[itemId];
    if (!def) {
      if (!fromHold) this.handleInteractKey();
      return;
    }

    // Seed planting takes top priority over all other interactions (pets, NPCs, etc.)
    if (def.plantStructureType) {
      if (fromHold) return;
      const targetSoil = this.findTargetSoilForSeed(wx, wy);
      if (targetSoil) {
        this.tryPlantHeldSeed(itemId, targetSoil.tx, targetSoil.ty);
      } else {
        this.hud.showToast('Target tilled soil (use Hoe first) to plant!');
      }
      return;
    }

    const dx = wx - this.player.x;
    const dy = wy - this.player.y;
    const dLen = Math.hypot(dx, dy) || 1;
    const preAimed =
      def.category === 'tool' || def.category === 'weapon'
        ? this.findAimedTarget(itemId, dx / dLen, dy / dLen, def.range ?? 36)
        : null;

    // When holding mouse button, only allow continuous tool/weapon swings (no 60fps interact/pet spam)
    if (!fromHold) {
      // Enemies always take highest priority over nearby interactables; any aimed target also beats NPCs (lowest priority)
      const skipInteract =
        preAimed?.kind === 'enemy' || (preAimed !== null && this.findInteractableTarget()?.kind === 'npc');
      if (!skipInteract && this.handleInteractKey(true)) return;
    }

    // Stop using tools if out of energy -> play exhausted animation & 2s cooldown
    if (def.category === 'tool' && gameState.energy < 1.5) {
      this.triggerPlayerExhausted();
      return;
    }

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

    if (itemId === 'salvage_hammer') {
      if (fromHold) return;
      if (!this.player.startAction('mining', def.cooldownMs ?? 300, dx / dLen, dy / dLen, 175)) return;
      this.trySalvageAt(wx, wy);
      return;
    }

    if (itemId === 'bomb') {
      if ((gameState.inventory.bomb ?? 0) <= 0) return;
      if (!this.player.startAction('melee', 240, dx, dy, 160)) return;
      gameState.removeItem('bomb', 1);
      const bombSpr = this.add.image(this.player.x, this.player.y, 'projectiles/Bomb').setDepth(this.player.y);
      this.tweens.add({ targets: bombSpr, scale: { from: 1, to: 1.35 }, duration: 220, yoyo: true, repeat: -1 });
      this.bombs.push({ sprite: bombSpr, fuseMs: 1100 });
      return;
    }
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    // Ranged Bow & Relic Rods consume Energy (EN)
    if (itemId === 'bow' || def.category === 'relic') {
      const enCost = gameState.getRangedEnergyCost(itemId);
      if (enCost > 0 && gameState.energy < enCost) {
        if (this.lowEnergyToastMs <= 0) {
          this.lowEnergyToastMs = 650;
          spawnFloatingText(this, this.player.x, this.player.y - 16, 'Low Energy!', '#ff8a93');
        }
        return;
      }
      const cd = gameState.hasSkill('magic_archmage') ? Math.round((def.cooldownMs ?? 320) * 0.7) : (def.cooldownMs ?? 320);
      const anim = itemId === 'bow' ? 'ranged' : 'cast';
      if (!this.player.startAction(anim, cd, nx, ny, 160)) return;
      if (enCost > 0) {
        gameState.energy = Math.max(0, gameState.energy - enCost);
        gameState.emitVitals();
      }
      if (itemId === 'bow') SFX.playBowShoot();
      else SFX.playCast();
      const projSpeed = 190;
      const dmg = gameState.getWeaponDamage(itemId);
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
        vx: nx * projSpeed,
        vy: ny * projSpeed,
        damage: dmg,
        fromPlayer: true,
        lifeMs: 1200,
        kind: pInfo.kind,
      });
      return;
    }

    // Farming Tools: Hoe (tills dirt) & Watering Can (waters nearby crops)
    if (itemId === 'hoe') {
      if (!this.player.startAction('hoeing', def.cooldownMs ?? 320, nx, ny, 190)) return;
      const targetTx = Math.floor((this.player.x + nx * 16) / TILE_PX);
      const targetTy = Math.floor((this.player.y + ny * 16) / TILE_PX);
      if (
        targetTx >= 0 &&
        targetTy >= 0 &&
        targetTx < WORLD_TILES &&
        targetTy < WORLD_TILES &&
        isLand(this.terrainGrid[targetTy][targetTx]) &&
        this.overlayGrid[targetTy][targetTx] === 'none'
      ) {
        if (!this.consumeToolEnergy(1.5)) return;
        this.overlayGrid[targetTy][targetTx] = 'dirt';
        gameState.overlays.push({ tx: targetTx, ty: targetTy, type: 'dirt' });
        const now = this.time.now;
        this.soilStateMap.set(`${targetTx},${targetTy}`, { lastWateredMs: now, lastUsedMs: now });
        this.refreshAutoTiles(targetTx - 1, targetTy - 1, targetTx + 1, targetTy + 1);
        spawnBurstParticles(this, targetTx * TILE_PX + 8, targetTy * TILE_PX + 8, 0x9c6544, 5);
        SFX.playChop();
      }
      return;
    }

    if (itemId === 'watering_can') {
      if (!this.player.startAction('watering', def.cooldownMs ?? 340, nx, ny, 210)) return;
      const wxHit = this.player.x + nx * 16;
      const wyHit = this.player.y + ny * 16;
      spawnBurstParticles(this, wxHit, wyHit, 0x6ce5ff, 6);
      SFX.playPickup();
      const now = this.time.now;
      let wateredAny = false;
      for (const b of this.buildings) {
        if (b.active && b.isCrop() && Math.hypot(b.x - wxHit, b.y - wyHit) <= 26) {
          this.refreshSoilWatered(b.tx, b.ty, now);
          if (b.waterCrop()) {
            wateredAny = true;
            spawnFloatingText(this, b.x, b.y - 12, 'Watered!', '#7ce8ff');
          }
        }
      }
      // Also hydrate tilled soil tiles within watering reach
      const cTx = Math.floor(wxHit / TILE_PX);
      const cTy = Math.floor(wyHit / TILE_PX);
      for (let ty = cTy - 2; ty <= cTy + 2; ty++) {
        for (let tx = cTx - 2; tx <= cTx + 2; tx++) {
          if (this.overlayGrid[ty]?.[tx] === 'dirt') {
            const tileCx = tx * TILE_PX + 8;
            const tileCy = ty * TILE_PX + 8;
            if (Math.hypot(tileCx - wxHit, tileCy - wyHit) <= 28) {
              this.refreshSoilWatered(tx, ty, now);
              wateredAny = true;
            }
          }
        }
      }
      if (wateredAny) this.consumeToolEnergy(1.5);
      return;
    }

    // Stardew-style Fishing Minigame (over a whirlpool) or fruitless idle bobber in open water
    if (itemId === 'fishing_rod') {
      if (this.fishingPending || this.fishingMinigame.isActive()) return;
      if (this.fishingIdle) {
        this.cancelIdleFishing();
        return;
      }
      const targetSpot = this.nodes.find(
        (n) =>
          n.active &&
          n.kind === 'fish_spot' &&
          Math.hypot(n.x - this.player.x, n.y - this.player.y) <= 72 &&
          Math.hypot(n.x - wx, n.y - wy) <= 32,
      );

      if (!targetSpot) {
        // Check aimed point or raycast up to 56px for open water
        let castX = wx;
        let castY = wy;
        const isWaterAt = (px: number, py: number): boolean => {
          const tx = Math.floor(px / TILE_PX);
          const ty = Math.floor(py / TILE_PX);
          return (
            tx >= 0 &&
            ty >= 0 &&
            tx < WORLD_TILES &&
            ty < WORLD_TILES &&
            this.terrainGrid[ty]?.[tx] === 'water' &&
            !this.bridgeSet.has(`${tx},${ty}`)
          );
        };
        let foundWater = Math.hypot(wx - this.player.x, wy - this.player.y) <= 72 && isWaterAt(wx, wy);
        if (!foundWater) {
          for (let d = 16; d <= 56; d += 8) {
            const px = this.player.x + nx * d;
            const py = this.player.y + ny * d;
            if (isWaterAt(px, py)) {
              castX = px;
              castY = py;
              foundWater = true;
              break;
            }
          }
        }
        if (!foundWater) return;
        if (!this.consumeToolEnergy(1.5)) return;

        this.fishingIdle = true;
        this.player.startAction('fishing_cast', 350, castX - this.player.x, castY - this.player.y, 260);
        this.fishingBobber?.destroy();
        this.fishingBobber = this.add.sprite(castX, castY, 'extras/Fishing bobber').setDepth(castY);
        this.fishingBobber.play('prop_bobber');
        this.fishingSplashTimerMs = 850;
        this.ocean.spawnSplash(castX, castY, 0.85);
        SFX.playFishCast();
        return;
      }

      if (!this.consumeToolEnergy(1.5)) return;
      const castX = targetSpot.x;
      const castY = targetSpot.y;
      this.fishingPending = true;
      this.player.startAction('fishing_cast', 1600, castX - this.player.x, castY - this.player.y, 1550);
      this.fishingBobber?.destroy();
      this.fishingBobber = this.add.sprite(castX, castY, 'extras/Fishing bobber').setDepth(castY);
      this.fishingBobber.play('prop_bobber');
      this.fishingSplashTimerMs = 850;
      this.ocean.spawnSplash(castX, castY, 1.0);
      SFX.playFishCast();

      this.time.delayedCall(550, () => {
        if (this.fishingBobber?.active) {
          this.ocean.spawnSplash(castX, castY, 0.8);
        }
      });

      this.time.delayedCall(1050, () => {
        if (this.fishingBobber?.active) {
          this.ocean.spawnSplash(castX, castY, 1.35);
          SFX.playFishBite();
          spawnFloatingText(this, castX, castY - 14, 'Hit!', '#ffe066', '11px');
        }
      });

      this.time.delayedCall(1550, () => {
        this.fishingPending = false;
        const gx = Phaser.Math.Clamp(Math.floor(castX / (ISLAND_CELL_TILES * TILE_PX)), 0, 4);
        const gy = Phaser.Math.Clamp(Math.floor(castY / (ISLAND_CELL_TILES * TILE_PX)), 0, 4);
        const islandBiome = getIslandAt(gx, gy)?.biome ?? 'grass';
        const fishTable: Record<string, { itemId: string; behavior: FishBehavior }> = {
          grass: { itemId: 'fish', behavior: 'steady' },
          autumn: { itemId: 'dune_catfish', behavior: 'heavy' },
          graveyard: { itemId: 'ghost_eel', behavior: 'erratic' },
          winter: { itemId: 'frost_salmon', behavior: 'dart' },
          infernal: { itemId: 'ember_koi', behavior: 'sinker' },
        };
        const catchSpec = fishTable[islandBiome] ?? fishTable.grass;
        const catchName = ITEMS[catchSpec.itemId]?.name ?? 'Fresh Fish';

        this.hud.setFishingMode(true);
        this.fishingMinigame.start(
          (caught) => {
            this.hud.setFishingMode(false);
            this.fishingBobber?.destroy();
            this.fishingBobber = undefined;
            this.fishingLine?.destroy();
            this.fishingLine = undefined;
            if (caught) {
              this.ocean.spawnSplash(castX, castY, 1.35);
              spawnSparklers(this, castX, castY - 4, 14);
              this.hud.triggerPortraitMood('happy', 2500);
              this.cameraRig.zoomPunch(0.04, 110);
              const mult = this.getLighthouseMultiplier(castX, castY);
              const count = Math.max(1, Math.round((targetSpot ? 2 : 1) * mult));
              this.spawnLoot(this.player.x + 8, this.player.y + 8, catchSpec.itemId, count);
              if (gameState.hasSkill('foraging_fishing')) {
                this.spawnCoin(this.player.x + 8, this.player.y + 8, Math.round(6 * mult));
              }
              this.awardXp(25);
              this.hud.showToast(`Caught ${catchName} x${count}!`);
              const bpName = tryUnlockBlueprintFromPool(['craft_charm_miner', 'craft_ring_copper'], 0.16);
              if (bpName) {
                SFX.playLevelUp();
                this.hud.showToast(`BLUEPRINT UNLOCKED: ${bpName}!`);
              }
            } else {
              this.hud.showToast('The fish got away!');
            }
            if (targetSpot && targetSpot.active) {
              targetSpot.destroy();
              this.nodes = this.nodes.filter((n) => n.active);
            }
          },
          { fishName: catchName, behavior: catchSpec.behavior },
        );
      });
      return;
    }

    // Melee / Tool Swing
    const anim = itemId.startsWith('pickaxe')
      ? 'mining'
      : itemId === 'shovel'
        ? 'shovelling'
        : itemId === 'fishing_rod'
          ? 'fishing_cast'
          : 'melee';
    if (!this.player.startAction(anim, def.cooldownMs ?? 280, nx, ny, 175)) return;

    const range = def.range ?? 36;
    const angle = Math.atan2(ny, nx);
    drawSlashArc(this, this.player.x, this.player.y - 4, angle, range, getWeaponSlashColor(itemId));
    SFX.playSwing();

    // Check Ripe or Withered Crops
    for (const b of [...this.buildings]) {
      if (!b.active) continue;
      if (b.isCropWithered() && Math.hypot(b.x - this.player.x, b.y - this.player.y) <= range + 8) {
        this.cullWitheredCrop(b);
        continue;
      }
      if (!b.isCropRipe()) continue;
      if (Math.hypot(b.x - this.player.x, b.y - this.player.y) <= range + 8) {
        if (!this.consumeToolEnergy(1.5)) break;
        this.handleCropHarvest(b);
      }
    }

    // Raycast closest target along aim vector (nx, ny)
    const aimed = this.findAimedTarget(itemId, nx, ny, range);
    if (aimed?.kind === 'node') {
      const gDmg = gameState.getGatherDamage(itemId);
      this.hitResourceNode(aimed.node, gDmg, true);
    } else if (aimed?.kind === 'enemy') {
      if (!itemId.startsWith('sword')) {
        if (SFX.canPlay('needSwordHint', 750)) {
          spawnFloatingText(this, aimed.enemy.x, aimed.enemy.y - 16, 'Use Sword!', '#ffbe76');
        }
      } else {
        const wDmg = gameState.getWeaponDamage(itemId);
        this.damageEnemy(aimed.enemy, wDmg, nx, ny);
      }
    } else if (aimed?.kind === 'animal' && itemId.startsWith('sword')) {
      const a = aimed.animal;
      const wDmg = gameState.getWeaponDamage(itemId);
      a.hp -= wDmg;
      SFX.playHit();
      spawnDirectionalSparks(this, a.x, a.y - 4, angle, 0xff8a8a, 6);
      spawnFloatingText(this, a.x, a.y - 14, `${wDmg}`, '#ffffff');
      a.sprite.setTintFill(0xff6b6b);
      this.time.delayedCall(110, () => {
        if (a.sprite.active) a.sprite.clearTint();
      });
      if (a.hp <= 0) {
        SFX.playEnemyDeath();
        spawnDeathBurst(this, a.x, a.y, a.kind, false);
        this.spawnLoot(a.x, a.y, 'raw_meat', Phaser.Math.Between(1, 2));
        a.sprite.destroy();
        a.shadow.destroy();
        const idx = this.animals.indexOf(a);
        if (idx >= 0) this.animals.splice(idx, 1);
      }
    }
  }

  private triggerPlayerExhausted(): void {
    if (!this.player.triggerExhausted(2000)) return;
    const lines = [
      "I'm exhausted...",
      'Need to catch my breath!',
      'Too tired to swing...',
      'Out of energy — need food or rest!',
      'My arms feel like lead...',
    ];
    const msg = lines[Math.floor(Math.random() * lines.length)];
    spawnFloatingText(this, this.player.x, this.player.y - 18, msg, '#9fd8ff', '8px', 'exhausted');
    if (this.lowEnergyToastMs <= 0) {
      this.lowEnergyToastMs = 2000;
      this.hud.showToast(msg);
    }
  }

  private consumeToolEnergy(amount = 1.5): boolean {
    if (gameState.energy < amount) {
      this.triggerPlayerExhausted();
      return false;
    }
    gameState.energy = Math.max(0, gameState.energy - amount);
    gameState.emitVitals();
    return true;
  }

  private findAimedTarget(
    itemId: string,
    nx: number,
    ny: number,
    range: number,
  ):
    | { kind: 'node'; node: ResourceNode; dist: number; x: number; y: number; depth: number }
    | { kind: 'enemy'; enemy: Enemy; dist: number; x: number; y: number; depth: number }
    | { kind: 'animal'; animal: OverworldScene['animals'][number]; dist: number; x: number; y: number; depth: number }
    | null {
    type TargetEntry =
      | { kind: 'node'; node: ResourceNode; x: number; y: number; depth: number }
      | { kind: 'enemy'; enemy: Enemy; x: number; y: number; depth: number }
      | { kind: 'animal'; animal: OverworldScene['animals'][number]; x: number; y: number; depth: number };

    const candidates: Array<AimCandidate<TargetEntry>> = [];

    // Highest priority (3): Enemies
    for (const e of this.enemies) {
      if (!e.active || e.isDead) continue;
      candidates.push({
        item: { kind: 'enemy', enemy: e, x: e.x, y: e.y, depth: e.depth },
        x: e.x,
        y: e.y,
        priority: 3,
      });
    }

    // Medium priority (2): Resource nodes (tools) and animals (sword)
    if (!itemId.startsWith('sword')) {
      for (const n of this.nodes) {
        if (!n.active) continue;
        if (n.requiredTool === 'shovel' && itemId !== 'shovel') continue;
        if (itemId === 'shovel' && n.requiredTool !== 'shovel') continue;
        if (n.requiredTool === 'fishing_rod' && itemId !== 'fishing_rod') continue;
        if (itemId === 'fishing_rod' && n.kind !== 'fish_spot') continue;
        const feet = n.getCollisionCenter();
        candidates.push({
          item: { kind: 'node', node: n, x: feet.x, y: feet.y, depth: n.depth },
          x: feet.x,
          y: feet.y,
          priority: 2,
          radius: n.solid ? n.collisionRadius : 4,
        });
      }
    } else {
      for (const a of this.animals) {
        candidates.push({
          item: { kind: 'animal', animal: a, x: a.x, y: a.y, depth: a.sprite.depth },
          x: a.x,
          y: a.y,
          priority: 2,
        });
      }
    }

    const match = selectBestAimTarget(this.player.x, this.player.y, nx, ny, range + 10, candidates);
    if (!match) return null;
    return { ...match.item, dist: match.dist };
  }

  private hasNearbyCombatEnemy(rangePx = 56): boolean {
    for (const e of this.enemies) {
      if (e.active && !e.isDead && Math.hypot(e.x - this.player.x, e.y - this.player.y) <= rangePx) {
        return true;
      }
    }
    return false;
  }

  private refreshSoilWatered(tx: number, ty: number, nowMs: number): void {
    const key = `${tx},${ty}`;
    const cur = this.soilStateMap.get(key);
    if (cur) {
      cur.lastWateredMs = nowMs;
    } else if (this.overlayGrid[ty]?.[tx] === 'dirt') {
      this.soilStateMap.set(key, { lastWateredMs: nowMs, lastUsedMs: nowMs });
    }
  }

  private removeBuilding(b: BuildingEntity): void {
    b.active = false;
    this.buildings = this.buildings.filter((ent) => ent !== b);
    const key = (b.ty << 10) | b.tx;
    const bucket = this.buildingsByTile.get(key);
    if (bucket) {
      const next = bucket.filter((ent) => ent !== b);
      if (next.length === 0) this.buildingsByTile.delete(key);
      else this.buildingsByTile.set(key, next);
    }
    this.houseDoors = this.houseDoors.filter((ent) => ent !== b);
    this.cachedMinimapBuildings = null;
    gameState.buildings = gameState.buildings.filter((s) => s.id !== b.id);
    b.destroy();
  }

  private spawnPlantDeathPuff(x: number, y: number): void {
    spawnBurstParticles(this, x, y - 4, 0x9c6544, 7);
    spawnBurstParticles(this, x, y - 6, 0x7ef29d, 6);
    const leafKeys = ['extras/Leaf_particle1', 'extras/Leaf_particle2', 'extras/Leaf_particle3'];
    for (let i = 0; i < 6; i++) {
      const key = leafKeys[i % leafKeys.length];
      if (!this.textures.exists(key)) continue;
      const ang = (Math.PI * 2 * i) / 6 + (Math.random() - 0.5) * 0.4;
      const dist = Phaser.Math.Between(10, 18);
      const leaf = this.add.image(x, y - 4, key).setDepth(y + 12).setScale(0.95);
      this.tweens.add({
        targets: leaf,
        x: x + Math.cos(ang) * dist,
        y: y - 6 + Math.sin(ang) * dist * 0.7 - 6,
        angle: Phaser.Math.Between(-160, 160),
        alpha: 0,
        scale: 0.35,
        duration: 460,
        ease: 'Quad.Out',
        onComplete: () => leaf.destroy(),
      });
    }
  }

  private cullWitheredCrop(b: BuildingEntity): boolean {
    if (!b.active || !b.isCropWithered()) return false;
    const tx = b.tx;
    const ty = b.ty;
    SFX.playChop();
    spawnBurstParticles(this, b.x, b.y - 4, 0x7a5c3e, 8);
    spawnBurstParticles(this, b.x, b.y - 2, 0x9c6544, 5);
    spawnFloatingText(this, b.x, b.y - 14, 'Culled Dried Plant', '#d6b88c');
    this.removeBuilding(b);
    const soilEntry = this.soilStateMap.get(`${tx},${ty}`);
    if (soilEntry) soilEntry.lastUsedMs = this.time.now;
    return true;
  }

  private handleCropHarvest(b: BuildingEntity): boolean {
    const res = b.harvestCrop();
    if (!res) return false;
    const nowMs = this.time.now;
    if (nowMs - this.lastHarvestMs <= 5000) {
      this.harvestComboCount += 1;
    } else {
      this.harvestComboCount = 1;
    }
    this.lastHarvestMs = nowMs;

    const isCombo = this.harvestComboCount >= 3;
    const bonusCount = isCombo ? res.count + 1 : res.count;
    const xpGain = isCombo ? 12 : 8;

    SFX.playHarvestCrop();
    spawnArcParticles(this, b.x, b.y - 4, 0x7ef29d, 8);
    this.spawnLoot(b.x, b.y, res.itemId, bonusCount);
    this.awardXp(xpGain);
    if (isCombo) {
      spawnFloatingText(this, b.x, b.y - 24, `HARVEST COMBO x${this.harvestComboCount}! (+1)`, '#ffe066');
    }
    if (res.depleted) {
      this.spawnPlantDeathPuff(b.x, b.y);
      spawnFloatingText(this, b.x, b.y - 16, 'Final Harvest!', '#ffe066');
      this.removeBuilding(b);
    }
    return true;
  }

  private findSalvageTarget(
    aimX?: number,
    aimY?: number,
  ):
    | { kind: 'building'; b: BuildingEntity; x: number; y: number; name: string }
    | { kind: 'overlay'; tx: number; ty: number; type: 'bridge' | 'road'; x: number; y: number; name: string }
    | null {
    const f = this.player.facing;
    let fx = f === 'left' ? -1 : f === 'right' ? 1 : 0;
    let fy = f === 'up' ? -1 : f === 'down' ? 1 : 0;
    if (aimX !== undefined && aimY !== undefined) {
      const dx = aimX - this.player.x;
      const dy = aimY - this.player.y;
      const len = Math.hypot(dx, dy);
      if (len > 4) {
        fx = dx / len;
        fy = dy / len;
      }
    }
    const maxRange = 36;

    // 1. Prefer player-placed non-floor buildings (stations, walls, doors, furniture, crops)
    let bestBld: BuildingEntity | null = null;
    let bestScore = Infinity;
    for (const b of this.buildings) {
      if (!b.active || b.readOnly) continue;
      const d = Math.hypot(b.x - this.player.x, b.y - this.player.y);
      if (d > maxRange) continue;
      const dot = d > 1 ? ((b.x - this.player.x) * fx + (b.y - this.player.y) * fy) / d : 1;
      const floorPenalty = b.structureType === 'house_floor' ? 20 : 0;
      const score = d - dot * 12 + floorPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestBld = b;
      }
    }
    if (bestBld) {
      const rec = RECIPES.find((r) => r.structureType === bestBld!.structureType);
      return {
        kind: 'building',
        b: bestBld,
        x: bestBld.x,
        y: bestBld.y,
        name: rec?.name ?? bestBld.structureType.replace(/_/g, ' '),
      };
    }

    // 2. Check player-placed bridge / stone road overlays
    const frontTx = Math.floor((this.player.x + fx * 16) / TILE_PX);
    const frontTy = Math.floor((this.player.y + fy * 16) / TILE_PX);
    const ptx = Math.floor(this.player.x / TILE_PX);
    const pty = Math.floor(this.player.y / TILE_PX);
    const candidates: Array<[number, number]> = [[frontTx, frontTy]];
    for (let ty = pty - 2; ty <= pty + 2; ty++) {
      for (let tx = ptx - 2; tx <= ptx + 2; tx++) {
        candidates.push([tx, ty]);
      }
    }
    for (const [tx, ty] of candidates) {
      const ov = this.overlayGrid[ty]?.[tx];
      if (ov !== 'bridge' && ov !== 'road') continue;
      const cx = tx * TILE_PX + 8;
      const cy = ty * TILE_PX + 8;
      if (Math.hypot(cx - this.player.x, cy - this.player.y) > maxRange) continue;
      return {
        kind: 'overlay',
        tx,
        ty,
        type: ov,
        x: cx,
        y: cy,
        name: ov === 'bridge' ? 'Wooden Bridge' : 'Stone Road',
      };
    }
    return null;
  }

  private trySalvageAt(aimX?: number, aimY?: number): boolean {
    const target = this.findSalvageTarget(aimX, aimY);
    if (!target) {
      this.hud.showToast('No crafted building, bridge, or road in range to salvage!');
      return false;
    }
    if (!this.consumeToolEnergy(1.5)) return false;

    if (target.kind === 'building') {
      const b = target.b;
      const st = b.structureType;
      // Refund any queued crafting jobs 100% so players never lose queued ingots/items
      while (b.craftQueue.length > 0) {
        b.cancelCraft(0);
      }
      const rec = RECIPES.find((r) => r.structureType === st);
      if (rec) {
        for (const ing of rec.ingredients) {
          const used = gameState.getStructureCostCount(ing.itemId, ing.count, rec.station === 'build');
          const refundQty = computeSalvageRefundCount(used);
          this.spawnLoot(b.x, b.y, ing.itemId, refundQty);
        }
      } else {
        this.spawnLoot(b.x, b.y, 'wood', 1);
      }
      SFX.playChop();
      spawnBurstParticles(this, b.x, b.y - 4, 0xffaa44, 8);
      spawnFloatingText(this, b.x, b.y - 14, `Salvaged ${target.name}! (50%)`, '#ffcf70');
      this.removeBuilding(b);
      if (this.isHousePart(st)) this.rebuildHouseRoofs();
      return true;
    }

    const { tx, ty, type, x, y, name } = target;
    this.overlayGrid[ty][tx] = 'none';
    if (type === 'bridge') {
      this.bridgeSet.delete(`${tx},${ty}`);
      const entry = this.bridgeSprites.get(`${tx},${ty}`);
      if (entry) {
        entry.sprite.destroy();
        this.bridgeSprites.delete(`${tx},${ty}`);
      }
    }
    gameState.overlays = gameState.overlays.filter(
      (o) => !(o.tx === tx && o.ty === ty && o.type === type),
    );
    this.refreshAutoTiles(tx - 1, ty - 1, tx + 1, ty + 1);
    const recId = type === 'bridge' ? 'build_bridge' : 'build_road_stone';
    const rec = RECIPES.find((r) => r.id === recId);
    if (rec) {
      for (const ing of rec.ingredients) {
        const used = gameState.getStructureCostCount(ing.itemId, ing.count, true);
        this.spawnLoot(x, y, ing.itemId, computeSalvageRefundCount(used));
      }
    }
    SFX.playChop();
    spawnBurstParticles(this, x, y, 0xffaa44, 7);
    spawnFloatingText(this, x, y - 14, `Salvaged ${name}! (50%)`, '#ffcf70');
    return true;
  }

  private stokeStation(stationId: string): boolean {
    if (this.stokeCooldownMs > 0) return false;
    const b = this.buildings.find((ent) => ent.active && ent.id === stationId);
    if (!b || b.craftQueue.length === 0) return false;
    this.stokeCooldownMs = 800;
    const job = b.craftQueue[0];
    const boostMs = Math.max(500, Math.round(job.totalMs * 0.25));
    job.remainingMs = Math.max(50, job.remainingMs - boostMs);
    SFX.playMine();
    spawnBurstParticles(this, b.x, b.y - 6, 0xffe066, 6);
    spawnFloatingText(this, b.x, b.y - 16, '⚡ Stoked (+25%)', '#ffe066');
    return true;
  }

  private isPlayerInsideHouseGroup(px: number, py: number): number {
    const ptx = Math.floor(px / TILE_PX);
    const pty = Math.floor(py / TILE_PX);
    const key = `${ptx},${pty}`;
    const gid = this.houseGroupByTile.get(key) ?? 0;
    if (!gid) return 0;

    // Exterior door tiles never count as strictly inside (leaving through the front door restores the roof)
    const onExteriorDoor = this.houseDoors.some(
      (d) => d.active && d.tx === ptx && d.ty === pty && !this.houseInteriorTileSet.has(key),
    );
    if (onExteriorDoor) return 0;

    // Hysteresis: once inside, stay inside anywhere in interior/inner-wall footprint; when outside, require strictly interior tile
    if (this.activeHouseGroupId === gid) {
      return gid;
    }
    return this.houseInteriorTileSet.has(key) ? gid : 0;
  }

  private findTargetSoilForSeed(aimX?: number, aimY?: number): { tx: number; ty: number; x: number; y: number } | null {
    const f = this.player.facing;
    let fx = f === 'left' ? -1 : f === 'right' ? 1 : 0;
    let fy = f === 'up' ? -1 : f === 'down' ? 1 : 0;
    if (aimX !== undefined && aimY !== undefined) {
      const dx = aimX - this.player.x;
      const dy = aimY - this.player.y;
      const len = Math.hypot(dx, dy);
      if (len > 4) {
        fx = dx / len;
        fy = dy / len;
      }
    }
    const frontTx = Math.floor((this.player.x + fx * 16) / TILE_PX);
    const frontTy = Math.floor((this.player.y + fy * 16) / TILE_PX);
    const isPlantableDirt = (tx: number, ty: number) =>
      tx >= 0 &&
      ty >= 0 &&
      tx < WORLD_TILES &&
      ty < WORLD_TILES &&
      this.overlayGrid[ty]?.[tx] === 'dirt' &&
      !this.buildings.some((b) => b.active && b.tx === tx && b.ty === ty) &&
      !this.hasNodeAt(tx, ty);

    if (isPlantableDirt(frontTx, frontTy)) {
      return { tx: frontTx, ty: frontTy, x: frontTx * TILE_PX + 8, y: frontTy * TILE_PX + 8 };
    }

    const ptx = Math.floor(this.player.x / TILE_PX);
    const pty = Math.floor(this.player.y / TILE_PX);
    let best: { tx: number; ty: number; x: number; y: number } | null = null;
    let bestScore = Infinity;
    for (let ty = pty - 2; ty <= pty + 2; ty++) {
      for (let tx = ptx - 2; tx <= ptx + 2; tx++) {
        if (!isPlantableDirt(tx, ty)) continue;
        const cx = tx * TILE_PX + 8;
        const cy = ty * TILE_PX + 8;
        const dist = Math.hypot(cx - this.player.x, cy - this.player.y);
        if (dist > 34) continue;
        const dirDot = dist > 1 ? ((cx - this.player.x) * fx + (cy - this.player.y) * fy) / dist : 1;
        const score = dist - dirDot * 10;
        if (score < bestScore) {
          bestScore = score;
          best = { tx, ty, x: cx, y: cy };
        }
      }
    }
    return best;
  }

  private playSeedPlantAnimation(itemId: string, bld: BuildingEntity, tx: number, ty: number): void {
    const cx = tx * TILE_PX + 8;
    const cy = ty * TILE_PX + 8;
    const def = ITEMS[itemId];
    const iconKey = def?.iconKey ?? 'ui_icons/berries';
    bld.setScale(0.15, 0.15);

    const startX = this.player.x;
    const startY = this.player.y - 8;
    if (this.textures.exists(iconKey)) {
      const seedSpr = this.add.image(startX, startY, iconKey).setDepth(cy + 20).setScale(0.7);
      const state = { t: 0 };
      this.tweens.add({
        targets: state,
        t: 1,
        duration: 210,
        ease: 'Quad.Out',
        onUpdate: () => {
          if (!seedSpr.active) return;
          const t = state.t;
          const arc = Math.sin(t * Math.PI) * 14;
          seedSpr.setPosition(Phaser.Math.Linear(startX, cx, t), Phaser.Math.Linear(startY, cy, t) - arc);
          seedSpr.setAngle(t * 360);
          seedSpr.setScale(0.7 - t * 0.2);
        },
        onComplete: () => {
          if (seedSpr.active) seedSpr.destroy();
          SFX.playPlantSeed();
          spawnBurstParticles(this, cx, cy, 0x9c6544, 6);
          spawnBurstParticles(this, cx, cy - 2, 0x8ef5a7, 5);
          spawnShockwaveRing(this, cx, cy, 0x8ef5a7, 14, 240);
          spawnFloatingText(this, cx, cy - 14, 'Planted!', '#8ef5a7');
          if (bld.active) {
            this.tweens.add({
              targets: bld,
              scaleX: 1,
              scaleY: 1,
              duration: 260,
              ease: 'Back.easeOut',
            });
          }
        },
      });
    } else {
      SFX.playPlantSeed();
      spawnBurstParticles(this, cx, cy, 0x8ef5a7, 7);
      bld.setScale(1, 1);
    }
  }

  private tryPlantHeldSeed(itemId: string, tx: number, ty: number): boolean {
    const def = ITEMS[itemId];
    const st = def?.plantStructureType as BuildingEntity['structureType'] | undefined;
    if (!st || !st.startsWith('crop_')) return false;
    if ((gameState.inventory[itemId] ?? 0) <= 0) return false;
    if (this.overlayGrid[ty]?.[tx] !== 'dirt') {
      this.hud.showToast('Requires tilled soil (use Hoe first)!');
      return false;
    }
    const existing = this.buildings.find((b) => b.active && b.tx === tx && b.ty === ty);
    if (existing?.isCropWithered()) {
      this.hud.showToast('Clear the withered plant first!');
      return false;
    }
    if (existing || this.hasNodeAt(tx, ty)) {
      this.hud.showToast('Tile is already occupied!');
      return false;
    }

    const cx = tx * TILE_PX + 8;
    const cy = ty * TILE_PX + 8;
    const dx = cx - this.player.x;
    const dy = cy - this.player.y;
    const dLen = Math.hypot(dx, dy) || 1;
    this.player.startAction('hoeing', 220, dx / dLen, dy / dLen, 160);

    if (!gameState.removeItem(itemId, 1)) return false;
    const id = `bld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const bld = new BuildingEntity(this, id, st, tx, ty);
    this.registerBuilding(bld);
    gameState.buildings.push({ id, type: st, tx, ty, cropStage: 0, stageWatered: false, wateredCount: 0, harvestsLeft: bld.getHarvestsLeft() });
    const now = this.time.now;
    const soilEntry = this.soilStateMap.get(`${tx},${ty}`);
    if (soilEntry) soilEntry.lastUsedMs = now;
    else this.soilStateMap.set(`${tx},${ty}`, { lastWateredMs: now, lastUsedMs: now });
    gameState.recordQuestProgress('build', st, 1);
    this.playSeedPlantAnimation(itemId, bld, tx, ty);
    return true;
  }

  private updateSoilDecay(nowMs: number): void {
    const isRaining = this.weather.weather === 'rain';
    const expired: Array<{ tx: number; ty: number }> = [];

    for (const [key, state] of this.soilStateMap.entries()) {
      const [txStr, tyStr] = key.split(',');
      const tx = Number(txStr);
      const ty = Number(tyStr);
      if (this.overlayGrid[ty]?.[tx] !== 'dirt') {
        this.soilStateMap.delete(key);
        continue;
      }
      if (isRaining) {
        state.lastWateredMs = nowMs;
      }
      const crop = this.buildings.find((b) => b.active && b.tx === tx && b.ty === ty && b.isCrop());
      if (crop) {
        state.lastUsedMs = nowMs;
        if (crop.isStageWatered()) {
          state.lastWateredMs = nowMs;
        }
      }
      const unusedTooLong =
        !crop &&
        nowMs - state.lastUsedMs >= OverworldScene.SOIL_UNUSED_DECAY_MS &&
        nowMs - state.lastWateredMs >= OverworldScene.SOIL_UNUSED_DECAY_MS;
      const unwateredTooLong =
        nowMs - state.lastWateredMs >= OverworldScene.SOIL_UNWATERED_DECAY_MS &&
        (!crop || !crop.isStageWatered());
      if (unusedTooLong || unwateredTooLong) {
        if (crop) {
          this.spawnPlantDeathPuff(crop.x, crop.y);
          this.removeBuilding(crop);
        }
        expired.push({ tx, ty });
      }
    }

    for (const { tx, ty } of expired) {
      this.overlayGrid[ty][tx] = 'none';
      this.soilStateMap.delete(`${tx},${ty}`);
      gameState.overlays = gameState.overlays.filter(
        (o) => !(o.tx === tx && o.ty === ty && o.type === 'dirt'),
      );
      this.refreshAutoTiles(tx - 1, ty - 1, tx + 1, ty + 1);
      spawnBurstParticles(this, tx * TILE_PX + 8, ty * TILE_PX + 8, 0x9c6544, 4);
    }
  }

  private findBestInteractableBuilding(skipStations = false): BuildingEntity | null {
    let best: BuildingEntity | null = null;
    let bestScore = Infinity;
    const ptx = Math.floor(this.player.x / TILE_PX);
    const pty = Math.floor(this.player.y / TILE_PX);

    for (const b of this.buildings) {
      if (!b.active) continue;
      if (Math.abs(b.tx - ptx) > 2 || Math.abs(b.ty - pty) > 2) continue;
      const dist = Math.hypot(b.x - this.player.x, b.y - this.player.y);
      if (dist > 28) continue;

      let priority = -1;
      if (b.interactStation) {
        if (skipStations) continue;
        if (dist > 20 && !isFacingTarget(this.player.x, this.player.y, this.player.facing, b.x, b.y, 0.35)) {
          continue;
        }
        priority = 0; // Chests & crafting stations highest priority
      } else if (
        b.structureType === 'furniture_bed' ||
        b.structureType === 'water_well' ||
        b.structureType === 'nest' ||
        b.isCropRipe()
      ) {
        priority = 1;
      } else if (b.isCrop()) {
        priority = 2;
      } else if (b.structureType === 'house_door' || b.structureType === 'fence_gate') {
        priority = 3; // Doors/gates lowest building priority (house_door auto-opens on proximity)
      }
      if (priority < 0) continue;

      const facingBonus = isFacingTarget(this.player.x, this.player.y, this.player.facing, b.x, b.y, 0.45) ? -6 : 0;
      const score = priority * 100 + dist + facingBonus;
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    return best;
  }

  private findInteractableTarget(
    skipStations = false,
  ): {
    kind: 'portal' | 'animal' | 'ranch' | 'building' | 'npc' | 'soil';
    actionLabel: string;
    x: number;
    y: number;
    depth: number;
    statusText?: string;
    statusColor?: string;
    ringColor?: number;
  } | null {
    const heldItemId = gameState.hotbar[gameState.selectedHotbarIndex] ?? '';
    const heldDef = heldItemId ? ITEMS[heldItemId] : undefined;

    // Check hovered crop under cursor first (on desktop) so pointing at any nearby plant highlights its needs
    let hoveredCrop: BuildingEntity | null = null;
    if (!this.hud.isTouchEnabled() && this.input?.activePointer) {
      const wp = this.cameras.main.getWorldPoint(this.input.activePointer.x, this.input.activePointer.y);
      let bestHoverDist = 14;
      for (const b of this.buildings) {
        if (!b.active || !b.isCrop()) continue;
        if (Math.hypot(b.x - this.player.x, b.y - this.player.y) > 52) continue;
        const hd = Math.hypot(b.x - wp.x, b.y - wp.y);
        if (hd < bestHoverDist) {
          bestHoverDist = hd;
          hoveredCrop = b;
        }
      }
    }

    // Prioritize seed planting above pets, wild animals, NPCs, portals, and other interactions
    if (heldDef?.plantStructureType && !hoveredCrop) {
      let aimX: number | undefined;
      let aimY: number | undefined;
      const ptr = this.input.activePointer;
      if (!this.hud.isTouchEnabled() && ptr) {
        const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
        aimX = wp.x;
        aimY = wp.y;
      }
      const targetSoil = this.findTargetSoilForSeed(aimX, aimY);
      if (targetSoil) {
        const cropLabel = heldDef.name.replace(/\s*Seeds$/i, '');
        return {
          kind: 'soil',
          actionLabel: 'PLANT',
          x: targetSoil.x,
          y: targetSoil.y,
          depth: 4,
          statusText: `🌱 [E] Plant ${cropLabel}`,
          statusColor: '#8ef5a7',
          ringColor: 0x6ee88a,
        };
      }
    }

    for (const dp of this.dungeonPortals) {
      if (!dp.sprite.visible || !this.isDungeonEnterable(dp.dungeonId, dp.gx, dp.gy)) continue;
      if (Math.hypot(dp.x - this.player.x, dp.y - this.player.y) <= 28) {
        return { kind: 'portal', actionLabel: 'ENTER', x: dp.x, y: dp.y + dp.sprite.displayHeight * 0.25, depth: dp.sprite.depth };
      }
    }
    if (heldItemId === 'salvage_hammer') {
      let aimX: number | undefined;
      let aimY: number | undefined;
      const ptr = this.input.activePointer;
      if (!this.hud.isTouchEnabled() && ptr) {
        const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
        aimX = wp.x;
        aimY = wp.y;
      }
      const salv = this.findSalvageTarget(aimX, aimY);
      if (salv) {
        return {
          kind: 'building',
          actionLabel: 'SALVAGE',
          x: salv.x,
          y: salv.y,
          depth: salv.kind === 'building' ? salv.b.depth : 4,
          statusText: `🔨 Salvage ${salv.name} (50%)`,
          statusColor: '#ffaa44',
          ringColor: 0xffaa44,
        };
      }
    }

    const bestBld = hoveredCrop ?? this.findBestInteractableBuilding(skipStations);
    const hasSeedPlantTarget = Boolean(heldDef?.plantStructureType && this.findTargetSoilForSeed());
    if (bestBld && (!bestBld.isCrop() || bestBld.isCropRipe() || !hasSeedPlantTarget || hoveredCrop === bestBld)) {
      if (bestBld.isCrop()) {
        const status = bestBld.getCropStatus();
        if (status.state === 'withered') {
          return {
            kind: 'building',
            actionLabel: 'CULL',
            x: bestBld.x,
            y: bestBld.getCollisionCenter().y,
            depth: bestBld.depth,
            statusText: 'WITHERED [Attack/E] Cull',
            statusColor: '#d6a468',
            ringColor: 0xc88a4b,
          };
        }
        const isRipe = status.state === 'ripe';
        const needsWater = status.state === 'needs_water';
        const hasCan = gameState.getItemCount('watering_can') > 0;
        const actionLabel = isRipe ? 'HARVEST' : needsWater && (heldItemId === 'watering_can' || hasCan) ? 'WATER' : '';
        const statusText = isRipe
          ? `READY [E] Harvest (${status.harvestsLeft} left)`
          : needsWater
            ? `NEEDS WATER (${status.stage}/${status.maxStage})`
            : `GROWING ${status.progressPct}% (${status.stage}/${status.maxStage})`;
        const statusColor = isRipe ? '#7ef29d' : needsWater ? '#7ce8ff' : '#ffe066';
        const ringColor = isRipe ? 0x44ee88 : needsWater ? 0x66ccff : 0xffe066;
        return {
          kind: 'building',
          actionLabel,
          x: bestBld.x,
          y: bestBld.getCollisionCenter().y,
          depth: bestBld.depth,
          statusText,
          statusColor,
          ringColor,
        };
      }
      const actionLabel = bestBld.interactStation
        ? bestBld.interactStation === 'chest'
          ? 'OPEN'
          : 'CRAFT'
        : bestBld.structureType === 'furniture_bed'
          ? 'REST'
          : bestBld.structureType === 'water_well'
            ? 'DRINK'
            : 'USE';
      return {
        kind: 'building',
        actionLabel,
        x: bestBld.x,
        y: bestBld.getCollisionCenter().y,
        depth: bestBld.depth,
      };
    }

    if (heldDef?.plantStructureType) {
      let aimX: number | undefined;
      let aimY: number | undefined;
      const ptr = this.input.activePointer;
      if (!this.hud.isTouchEnabled() && ptr) {
        const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
        aimX = wp.x;
        aimY = wp.y;
      }
      const targetSoil = this.findTargetSoilForSeed(aimX, aimY);
      if (targetSoil) {
        const cropLabel = heldDef.name.replace(/\s*Seeds$/i, '');
        return {
          kind: 'soil',
          actionLabel: 'PLANT',
          x: targetSoil.x,
          y: targetSoil.y,
          depth: 4,
          statusText: `🌱 [E] Plant ${cropLabel}`,
          statusColor: '#8ef5a7',
          ringColor: 0x6ee88a,
        };
      }
    }

    const holdingSword = heldItemId.startsWith('sword');
    if (!holdingSword) {
      for (const rc of this.ranchEntities) {
        if (Math.hypot(rc.save.x - this.player.x, rc.save.y - this.player.y) <= 28) {
          return {
            kind: 'ranch',
            actionLabel: rc.save.readyEggs > 0 ? 'EGG' : 'PET',
            x: rc.save.x,
            y: rc.save.y + rc.sprite.displayHeight * 0.3,
            depth: rc.sprite.depth,
          };
        }
      }
      for (const a of this.animals) {
        if (Math.hypot(a.x - this.player.x, a.y - this.player.y) <= 28) {
          return { kind: 'animal', actionLabel: 'PET', x: a.x, y: a.y, depth: a.sprite.depth };
        }
      }
    }
    // NPCs are lowest priority
    for (const npc of this.npcs) {
      if (Math.hypot(npc.x - this.player.x, npc.y - this.player.y) <= 30) {
        return { kind: 'npc', actionLabel: 'TALK', x: npc.x, y: npc.y, depth: npc.sprite.depth };
      }
    }
    return null;
  }

  private updateCropStatusLabel(x?: number, y?: number, text?: string, color = '#8ef5a7'): void {
    if (!text || x === undefined || y === undefined) {
      if (this.cropStatusLabelBox?.container.active) {
        this.cropStatusLabelBox.container.setVisible(false);
      }
      return;
    }
    if (!this.cropStatusLabelBox || !this.cropStatusLabelBox.container.active) {
      const box = this.createWorldLabelBox(x, y - 18, text, color, 0xd9a85b, '7px');
      box.container.setDepth(9000);
      this.cropStatusLabelBox = {
        ...box,
        lastText: text,
        lastColor: color,
      };
    }
    const b = this.cropStatusLabelBox;
    b.container.setPosition(x, y - 18).setVisible(true);
    if (b.lastText !== text || b.lastColor !== color) {
      b.lastText = text;
      b.lastColor = color;
      b.label.setText(text).setColor(color);
      b.redraw();
    }
  }

  private updateTargetIndicator(): void {
    if (!this.targetIndicator || this.hud.isBlockingInput()) {
      this.targetIndicator?.setVisible(false);
      this.updateCropStatusLabel();
      this.hud.setTouchActionHint(null);
      return;
    }
    const itemId = gameState.hotbar[gameState.selectedHotbarIndex];
    const def = itemId ? ITEMS[itemId] : undefined;
    let aimed: ReturnType<OverworldScene['findAimedTarget']> = null;
    if (itemId && def && (def.category === 'tool' || def.category === 'weapon')) {
      const f = this.player.facing;
      let nx = f === 'left' ? -1 : f === 'right' ? 1 : 0;
      let ny = f === 'up' ? -1 : f === 'down' ? 1 : 0;
      const ptr = this.input.activePointer;
      if (!this.hud.isTouchEnabled() && ptr) {
        const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
        const dx = wp.x - this.player.x;
        const dy = wp.y - this.player.y;
        const len = Math.hypot(dx, dy);
        if (len > 4) {
          nx = dx / len;
          ny = dy / len;
        }
      }
      const len = Math.hypot(nx, ny) || 1;
      aimed = this.findAimedTarget(itemId, nx / len, ny / len, def.range ?? 36);
    }

    // Enemies always take priority over interactables
    if (aimed?.kind === 'enemy') {
      this.hud.setTouchActionHint(null);
      this.updateCropStatusLabel();
      this.targetIndicator
        .setPosition(aimed.x, aimed.y)
        .setDepth(aimed.depth - 0.5)
        .setStrokeStyle(1.4, 0xff6b6b, 0.9)
        .setFillStyle(0xff6b6b, 0.14)
        .setVisible(true);
      return;
    }

    const interactable = this.findInteractableTarget(this.hasNearbyCombatEnemy());
    // Non-NPC interactables take priority over nodes/animals, while NPCs are lowest priority
    if (interactable && (interactable.kind !== 'npc' || !aimed)) {
      this.hud.setTouchActionHint(interactable.actionLabel || null);
      this.updateCropStatusLabel(interactable.x, interactable.y, interactable.statusText, interactable.statusColor);
      if (interactable.kind === 'portal') {
        this.targetIndicator.setVisible(false);
        return;
      }
      const ringCol = interactable.ringColor ?? 0x44ee88;
      this.targetIndicator
        .setPosition(interactable.x, interactable.y)
        .setDepth(interactable.depth - 0.5)
        .setStrokeStyle(1.4, ringCol, 0.95)
        .setFillStyle(ringCol, 0.18)
        .setVisible(true);
      return;
    }

    this.hud.setTouchActionHint(null);
    this.updateCropStatusLabel();
    if (!aimed) {
      this.targetIndicator.setVisible(false);
      return;
    }
    const color = aimed.kind === 'animal' ? 0xff6b6b : 0xffe066;
    this.targetIndicator
      .setPosition(aimed.x, aimed.y)
      .setDepth(aimed.depth - 0.5)
      .setStrokeStyle(1.4, color, 0.9)
      .setFillStyle(color, 0.14)
      .setVisible(true);
  }

  private cancelIdleFishing(): void {
    if (!this.fishingIdle) return;
    this.fishingIdle = false;
    this.fishingBobber?.destroy();
    this.fishingBobber = undefined;
    this.fishingLine?.destroy();
    this.fishingLine = undefined;
  }

  private hitResourceNode(node: ResourceNode, dmg: number, fromPlayer = true): void {
    if (fromPlayer && !this.consumeToolEnergy(1.5)) return;
    if (this.isNearCamera(node.x, node.y, 110)) {
      if (fromPlayer) this.cameraRig.addTrauma(0.12);
      if (node.kind === 'tree' || node.kind === 'berry_bush') {
        SFX.playChop();
        spawnArcParticles(this, node.x, node.y - 6, node.kind === 'berry_bush' ? 0xff6b8b : 0x6fd96b, 6);
        spawnArcParticles(this, node.x, node.y - 2, 0xb8763e, 3);
      } else if (node.kind === 'fish_spot') {
        SFX.playWaterSplash();
        spawnArcParticles(this, node.x, node.y, 0x8af0ff, 6);
      } else {
        SFX.playMine();
        spawnArcParticles(this, node.x, node.y - 4, 0xc9d4df, 6);
        spawnDirectionalSparks(this, node.x, node.y - 4, -Math.PI / 2, 0xffe066, 4, 1.2);
      }
    }

    const destroyed = node.damage(dmg, node.x - this.player.x);
    if (!destroyed) return;
    this.player.applyHitstop(70);
    if (node.kind === 'tree' || node.kind === 'berry_bush') {
      this.fx.play('node_break_wood', { x: node.x, y: node.y - 4 });
    } else if (node.kind !== 'fish_spot') {
      const oreTint =
        node.kind === 'crystal_vein'
          ? 0x6ce5ff
          : node.kind === 'obsidian_vein'
            ? 0x9945d6
            : node.kind === 'gold_vein'
              ? 0xffe066
              : undefined;
      this.fx.play('node_break_ore', { x: node.x, y: node.y - 4, tint: oreTint });
    }

    const mult = this.getLighthouseMultiplier(node.x, node.y);
    for (const d of node.drops) {
      let qty = Phaser.Math.Between(d.min, d.max);
      if (gameState.hasSkill('foraging_bounty') && Math.random() < 0.35) qty += 1;
      if (gameState.hasSkill('industry_prospecting') && (d.itemId === 'coal' || d.itemId === 'iron_ore' || d.itemId === 'gold_ore' || d.itemId === 'crystal')) {
        qty += 1;
      }
      // Nighttime rarity shimmer on Crystal & Obsidian veins
      if (
        (node.kind === 'crystal_vein' || node.kind === 'obsidian_vein') &&
        this.lighting.getAmbientColor().nightFactor >= 0.6 &&
        Math.random() < 0.4
      ) {
        qty += 1;
      }
      qty = Math.max(1, Math.round(qty * mult));
      this.spawnLoot(node.x, node.y, d.itemId, qty);
    }

    if (
      (node.kind === 'dig_spot' || (gameState.hasSkill('economy_golden_touch') && Math.random() < 0.25)) ||
      (node.kind === 'fish_spot' && gameState.hasSkill('foraging_fishing'))
    ) {
      const bonusCoins = Math.round(Phaser.Math.Between(3, 8) * mult * (gameState.hasSkill('economy_coinage') ? 1.4 : 1));
      this.spawnCoin(node.x, node.y, bonusCoins);
    }

    this.awardXp(node.xpReward);
    const bpName = tryUnlockBlueprintFromPool(getBlueprintsForNode(node.kind, node.biome), 0.18);
    if (bpName) {
      SFX.playLevelUp();
      this.hud.showToast(`BLUEPRINT UNLOCKED: ${bpName}!`);
    }
    this.nodes = this.nodes.filter((n) => n.active);
  }

  private getLighthouseMultiplier(x: number, y: number): number {
    const radius = gameState.getLighthouseRadius();
    let countInRange = 0;
    for (const b of this.buildings) {
      if (b.active && b.structureType === 'lighthouse' && Math.hypot(b.x - x, b.y - y) <= radius) {
        countInRange += 1;
      }
    }
    return computeLighthouseMultiplier(countInRange, gameState.getBeaconScale());
  }

  private isNearCamera(x: number, y: number, padPx = 96): boolean {
    const view = this.cameras.main.worldView;
    return (
      x >= view.x - padPx &&
      x <= view.right + padPx &&
      y >= view.y - padPx &&
      y <= view.bottom + padPx
    );
  }

  private damageEnemy(enemy: Enemy, baseDmg: number, dirX: number, dirY: number): void {
    const bonusCrit = this.player.dodgeMomentumMs > 0 ? 15 : 0;
    const crit = Math.random() < gameState.getCritChance(bonusCrit);
    const scale = gameState.getDamageScaleVsEnemy(enemy.def.level);
    const rawDmg = crit ? Math.round(baseDmg * 2) : baseDmg;
    const dmg = Math.max(1, Math.round(rawDmg * scale.dealMult));
    const hitAng = Math.atan2(dirY, dirX);
    this.cameraRig.kick(dirX, dirY, crit ? 3.5 : 2.2, 80);
    if (crit) {
      this.fx.play('crit_strike', { x: enemy.x, y: enemy.y - 4 });
      this.hud.triggerPortraitMood('angry', 1500);
    } else {
      SFX.playHit();
      this.cameraRig.addTrauma(0.14);
    }
    spawnDirectionalSparks(this, enemy.x, enemy.y - 4, hitAng, crit ? 0xffe066 : 0xffffff, crit ? 9 : 5);
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

    const killed = enemy.takeDamage(dmg, dirX, dirY, (nx, ny) => this.isWalkable(nx, ny));
    const stopMs = killed ? 70 : crit ? 55 : 35;
    this.player.applyHitstop(stopMs);
    if (!killed) enemy.applyHitstop(stopMs);
    if (killed && enemy.def.isBoss) this.cameraRig.zoomPunch(0.05, 130);
    if (killed) {
      SFX.playEnemyDeath();
      spawnDeathBurst(this, enemy.x, enemy.y, enemy.def.id, false);
      gameState.recordQuestProgress('kill', enemy.def.id, 1);
      const bpName = tryUnlockBlueprintFromPool(getBlueprintsForMonster(enemy.def.id, false), 0.22);
      if (bpName) {
        SFX.playLevelUp();
        this.hud.showToast(`BLUEPRINT UNLOCKED: ${bpName}!`);
        revealSequence.show({
          title: 'BLUEPRINT DISCOVERED!',
          subtitle: bpName,
          badgeText: '📜',
          accentColor: '#7ac7ff',
        });
      }
      const mult = this.getLighthouseMultiplier(enemy.x, enemy.y);
      const coinRoll = Phaser.Math.Between(enemy.def.coins[0], enemy.def.coins[1]);
      const finalCoins = Math.round(coinRoll * mult * (gameState.hasSkill('economy_coinage') ? 1.4 : 1));
      this.spawnCoin(enemy.x, enemy.y, finalCoins);
      for (const d of enemy.def.drops) {
        if (Math.random() <= d.chance) {
          this.spawnLoot(enemy.x, enemy.y, d.itemId, Math.max(1, Math.round(d.count * mult)));
        }
      }
      this.awardXp(enemy.def.xp);
    }
  }

  private awardXp(amount: number): void {
    if (amount > 0) {
      spawnFloatingText(this, this.player.x, this.player.y - 18, `+${amount} XP`, '#7ef5ff', '8px', 'xp');
    }
    const leveled = gameState.addXp(amount);
    if (leveled) {
      this.fx.play('level_up', { x: this.player.x, y: this.player.y - 6 });
      this.cameraRig.zoomPunch(0.05, 110);
      spawnSparklers(this, this.player.x, this.player.y - 8, 18);
      spawnShockwaveRing(this, this.player.x, this.player.y - 4, 0xffe066, 44, 380);
      spawnFloatingText(this, this.player.x, this.player.y - 22, `LEVEL ${gameState.level}! +1 SP`, '#ffe066', '10px');
      this.hud.showToast(fmtKeySuffix(`Level ${gameState.level}! Earned +1 Skill Point`, 'K'));
      revealSequence.show({
        title: `LEVEL ${gameState.level}!`,
        subtitle: isMobileTouchDevice()
          ? '+1 Skill Point Earned'
          : '+1 Skill Point Earned • Press [K] to upgrade',
        badgeText: `LV ${gameState.level}`,
        accentColor: '#ffe066',
      });
    }
  }

  private spawnLoot(x: number, y: number, itemId: string, count: number): void {
    const existing = this.drops.find(
      (d) => d.active && !d.isCoin && d.itemId === itemId && Math.hypot(d.x - x, d.y - y) <= 28,
    );
    if (existing) {
      existing.addCount(count);
      return;
    }
    this.drops.push(new LootDrop(this, x, y, itemId, count, false));
  }

  private spawnCoin(x: number, y: number, count: number): void {
    const existing = this.drops.find(
      (d) => d.active && d.isCoin && Math.hypot(d.x - x, d.y - y) <= 28,
    );
    if (existing) {
      existing.addCount(count);
      return;
    }
    this.drops.push(new LootDrop(this, x, y, 'coin', count, true));
  }

  private isWalkable = (wx: number, wy: number): boolean => {
    const tx = Math.floor(wx / TILE_PX);
    const ty = Math.floor(wy / TILE_PX);
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return false;
    const terrain = this.terrainGrid[ty][tx];
    if (terrain === 'water' && !this.bridgeSet.has(`${tx},${ty}`)) {
      // 1-tile bridge guard-rail forgiveness (3.5px edge margin) so walking across bridges never snags
      const nearBridge =
        (this.bridgeSet.has(`${tx - 1},${ty}`) && wx - tx * TILE_PX < 3.5) ||
        (this.bridgeSet.has(`${tx + 1},${ty}`) && (tx + 1) * TILE_PX - wx < 3.5) ||
        (this.bridgeSet.has(`${tx},${ty - 1}`) && wy - ty * TILE_PX < 3.5) ||
        (this.bridgeSet.has(`${tx},${ty + 1}`) && (ty + 1) * TILE_PX - wy < 3.5);
      if (!nearBridge) return false;
    }

    for (const n of this.nodes) {
      if (!n.active || !n.solid) continue;
      if (Math.abs(n.tx - tx) > 1 || Math.abs(n.ty - ty) > 1) continue;
      const c = n.getCollisionCenter();
      if (Math.hypot(wx - c.x, wy - c.y) < n.collisionRadius) return false;
    }
    for (let dy = -1; dy <= 1; dy++) {
      const ny = ty + dy;
      if (ny < 0 || ny >= WORLD_TILES) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = tx + dx;
        if (nx < 0 || nx >= WORLD_TILES) continue;
        const bucket = this.buildingsByTile.get((ny << 10) | nx);
        if (!bucket) continue;
        for (const b of bucket) {
          if (b.collidesAt(wx, wy)) return false;
        }
      }
    }
    for (const npc of this.npcs) {
      if (Math.hypot(wx - npc.x, wy - (npc.y - 2)) < 11) return false;
    }
    return true;
  };

  private handleInteractKey(fromPrimaryAction = false): boolean {
    const heldId = gameState.hotbar[gameState.selectedHotbarIndex] ?? '';
    const heldDef = heldId ? ITEMS[heldId] : undefined;

    // 0. Prioritize Held Seed Planting on Tilled Soil above pets, animals, NPCs, and other interactions
    if (heldDef?.plantStructureType) {
      let aimX: number | undefined;
      let aimY: number | undefined;
      const ptr = this.input?.activePointer;
      if (!this.hud.isTouchEnabled() && ptr) {
        const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
        aimX = wp.x;
        aimY = wp.y;
      }
      const targetSoil = this.findTargetSoilForSeed(aimX, aimY);
      if (targetSoil && this.tryPlantHeldSeed(heldId, targetSoil.tx, targetSoil.ty)) {
        return true;
      }
    }

    // 1. Check nearby Dungeon Portal (only if visible and enterable)
    for (const dp of this.dungeonPortals) {
      if (!dp.sprite.visible || !this.isDungeonEnterable(dp.dungeonId, dp.gx, dp.gy)) continue;
      if (Math.hypot(dp.x - this.player.x, dp.y - this.player.y) <= 28) {
        if (dp.dungeonId === 'void_spire' && !gameState.clearedDungeons.has('infernal_sanctum')) {
          this.hud.showToast('Clear the Infernal Sanctum (4th Dungeon) first to unlock the Void Spire!');
          return true;
        }
        SFX.playPortalWarp();
        const targetData =
          dp.dungeonId === 'void_spire'
            ? {
                dungeonId: 'void_spire' as DungeonId,
                floor: Math.max(1, Math.floor(gameState.voidSpireHighestFloor / 5) * 5 + 1),
              }
            : { dungeonId: dp.dungeonId };
        // Save playerPos just outside the portal so returning places player cleanly at the entrance
        const offX = this.player.x - dp.x;
        const offY = this.player.y - dp.y;
        const len = Math.hypot(offX, offY);
        const safeX = len > 1 ? dp.x + (offX / len) * 32 : dp.x;
        const safeY = len > 1 ? dp.y + (offY / len) * 32 : dp.y + 32;
        void transitionManager.transitionTo({
          onMidpoint: async () => {
            gameState.playerPos = { x: safeX, y: safeY };
            this.syncBuildingQueuesToSave();
            gameState.save();
            this.hud.destroy();
            SFX.setMusicSituation('dungeon');
            await startSceneAndWaitCreate(this, 'DungeonScene', targetData);
          },
        });
        return true;
      }
    }

    // 2. Check nearby Ranch Creature (Pet & Collect Eggs) or Wild Animal (Pet for items) or Nest
    // Skip petting animals/pets when holding a sword so cows/chickens can be harvested cleanly
    const holdingSword = heldId.startsWith('sword');
    if (!holdingSword) {
      for (const a of this.animals) {
      if (Math.hypot(a.x - this.player.x, a.y - this.player.y) <= 28) {
        if (this.petActionCooldownMs > 0) return true;
        this.petActionCooldownMs = 1000;
        SFX.playPickup();
        if (a.petCooldownMs <= 0) {
          a.petCooldownMs = 20000;
          const giftMap: Record<string, string> = {
            Cow: 'leather',
            Hen: 'berries',
            Rabbit: 'berries',
            Deer: 'wood',
          };
          const gift = giftMap[a.kind] ?? 'berries';
          this.spawnLoot(a.x, a.y, gift, 1);
          spawnSparklers(this, a.x, a.y - 6, 8);
          spawnFloatingText(this, a.x, a.y - 16, `♥ +1 ${ITEMS[gift]?.name ?? gift}`, '#ff9ec4');
        } else {
          spawnFloatingText(this, a.x, a.y - 16, '♥ Happy!', '#ff9ec4');
        }
        return true;
      }
    }
    for (const rc of this.ranchEntities) {
      if (Math.hypot(rc.save.x - this.player.x, rc.save.y - this.player.y) <= 28) {
        if (this.petActionCooldownMs > 0) return true;
        this.petActionCooldownMs = 1000;
        const sp = getSpeciesById(rc.save.speciesId);
        const res = gameState.petRanchCreature(rc.save.id);
        SFX.playPickup();
        showWorldEmote(this, rc.save.x, rc.save.y - 14, 'portraits/Emote_laughing', {
          hearts: true,
          durationMs: 1100,
        });
        if (res.eggsCollected > 0 && sp) {
          gameState.addItem(sp.eggItemId, res.eggsCollected);
          spawnFloatingText(this, rc.save.x, rc.save.y - 16, `+${res.eggsCollected} Egg!`, '#ffe066');
          this.hud.showToast(`Collected ${res.eggsCollected}x ${ITEMS[sp.eggItemId]?.name ?? 'Egg'} from ${sp.name}!`);
        } else {
          spawnFloatingText(this, rc.save.x, rc.save.y - 16, res.petted ? '♥ Happy!' : `♥ ${res.happiness}%`, '#ff8eb8');
          this.hud.showToast(`${sp?.name ?? 'Creature'} Happiness: ${res.happiness}%`);
        }
        return true;
      }
    }
    }

    for (const b of this.buildings) {
      if (b.active && b.structureType === 'nest' && Math.hypot(b.x - this.player.x, b.y - this.player.y) <= 28) {
        if (b.nestEgg) {
          const sp = getSpeciesById(b.nestEgg.speciesId);
          this.hud.showToast(`${sp?.name ?? 'Egg'} hatching in ${Math.ceil(b.nestEgg.remainingMs / 1000)}s...`);
          return true;
        }
        const selectedId = gameState.hotbar[gameState.selectedHotbarIndex];
        const chosenSpecies =
          (selectedId ? getSpeciesByEgg(selectedId) : undefined) ??
          RANCH_SPECIES.find((s) => (gameState.inventory[s.eggItemId] ?? 0) > 0);
        if (!chosenSpecies || (gameState.inventory[chosenSpecies.eggItemId] ?? 0) <= 0) {
          this.hud.showToast('Monster Nest: Bring an Egg from wild monsters to hatch!');
          return true;
        }
        gameState.removeItem(chosenSpecies.eggItemId, 1);
        b.placeEggOnNest(chosenSpecies.id, chosenSpecies.hatchMs);
        SFX.playCraft();
        this.hud.showToast(`Placed ${ITEMS[chosenSpecies.eggItemId]?.name} on Nest! Hatching...`);
        return true;
      }
    }

    // 4. Priority-sorted Building Interaction (stations/chests/bed/well take priority over doors)
    const targetBld = this.findBestInteractableBuilding(fromPrimaryAction && this.hasNearbyCombatEnemy());
    if (targetBld) {
      const b = targetBld;
      if (b.structureType === 'house_door' || b.structureType === 'fence_gate') {
        const opened = b.toggleDoor();
        SFX.playChop();
        this.hud.showToast(opened ? 'Opened' : 'Closed');
        return true;
      }
      if (b.structureType === 'furniture_bed') {
        gameState.hp = gameState.getMaxHp();
        gameState.energy = gameState.getMaxEnergy();
        gameState.emitVitals();
        SFX.playLevelUp();
        const { nightFactor } = this.lighting.getAmbientColor();
        if (nightFactor >= 0.45) {
          this.lighting.timeOfDay = 0.08;
          this.lighting.dayNumber += 1;
          this.weather.setDay(this.lighting.dayNumber);
          for (const crop of this.buildings) {
            if (crop.active && crop.isCrop() && crop.isStageWatered()) {
              crop.updateBuilding(20000, this.buildingTickCallbacks ?? {
                onMiningRodPulse: () => {},
                onFishTrapCatch: () => {},
                onCraftComplete: () => {},
                isFertileSoil: (tx, ty) => this.overlayGrid[ty]?.[tx] === 'dirt',
                rainWatered: this.weather.weather === 'rain',
              });
            }
          }
          spawnFloatingText(this, this.player.x, this.player.y - 16, `☀ Dawn (Day ${this.lighting.dayNumber})!`, '#ffe066');
          this.hud.showToast(`Rested Until Dawn! Day ${this.lighting.dayNumber} • Full HP & EN`);
        } else {
          spawnFloatingText(this, this.player.x, this.player.y - 16, 'Rested! Full HP & EN', '#8ef5a7');
        }
        return true;
      }
      if (b.structureType === 'water_well') {
        gameState.energy = Math.min(gameState.getMaxEnergy(), gameState.energy + 30);
        gameState.emitVitals();
        let watered = 0;
        const now = this.time.now;
        for (const crop of this.buildings) {
          if (crop.active && crop.isCrop() && Math.hypot(crop.x - b.x, crop.y - b.y) <= 80) {
            this.refreshSoilWatered(crop.tx, crop.ty, now);
            if (crop.waterCrop()) watered += 1;
          }
        }
        SFX.playPickup();
        this.hud.showToast(`Water Well: +30 EN${watered > 0 ? ` • Watered ${watered} crops!` : ''}`);
        return true;
      }
      if (b.isCropWithered()) {
        return this.cullWitheredCrop(b);
      }
      if (b.isCropRipe()) {
        return this.handleCropHarvest(b);
      }
      if (b.isCrop()) {
        if (heldId === 'watering_can' || (!fromPrimaryAction && gameState.getItemCount('watering_can') > 0)) {
          this.refreshSoilWatered(b.tx, b.ty, this.time.now);
          if (b.waterCrop()) {
            this.consumeToolEnergy(1.5);
            SFX.playPickup();
            spawnBurstParticles(this, b.x, b.y, 0x6ce5ff, 5);
            spawnFloatingText(this, b.x, b.y - 12, 'Watered!', '#7ce8ff');
            return true;
          }
        }
        if (!fromPrimaryAction) {
          const st = b.getCropStatus();
          this.hud.showToast(
            st.state === 'needs_water'
              ? 'Crop needs water! Craft a Watering Can (or wait for rain).'
              : `Crop growing: ${st.progressPct}% (Stage ${st.stage}/${st.maxStage})`,
          );
          return true;
        }
      }
      if (b.interactStation) {
        if (b.interactStation === 'chest') {
          b.playChestOpen();
          if (b.readOnly && !b.looted) {
            b.looted = true;
            this.spawnCoin(b.x, b.y + 8, 15);
            this.spawnLoot(b.x, b.y + 8, 'potion_red', 1);
            spawnSparklers(this, b.x, b.y - 4, 10);
            this.hud.showToast('Found a house stash!');
          } else {
            this.hud.toggleModal('inventory');
          }
        } else {
          this.hud.toggleModal('craft', b.interactStation, b.id);
        }
        return true;
      }
    }

    // 5. Check nearby Quest NPC (lowest priority)
    return this.tryInteractNpc();
  }

  private tryInteractNpc(): boolean {
    for (const npc of this.npcs) {
      if (Math.hypot(npc.x - this.player.x, npc.y - this.player.y) > 30) continue;
      const q = gameState.getNextQuestForNpc(npc.spec.id);
      if (!q) {
        dialogueBox.show({
          speaker: npc.spec.name,
          portraitKey: npc.spec.spriteKey,
          subtitle: 'Townsfolk',
          lines: ['{c:#7ef29d}Safe travels, hero!{/c} Our island is thriving thanks to your courage.'],
        });
        return true;
      }
      if (gameState.isQuestActive(q.id)) {
        if (gameState.isQuestReadyToTurnIn(q.id)) {
          dialogueBox.show({
            speaker: npc.spec.name,
            portraitKey: npc.spec.spriteKey,
            subtitle: `Quest Complete: ${q.title}`,
            voicePitch: q.voicePitch,
            lines: q.completeDialogue,
            choices: [
              {
                label: `Complete (+${q.rewards.coins}g, +${q.rewards.xp} XP)`,
                primary: true,
                onSelect: () => {
                  const done = gameState.completeQuest(q.id);
                  if (done) {
                    SFX.playQuestComplete();
                    spawnSparklers(this, this.player.x, this.player.y - 8, 16);
                    this.hud.showToast(`Quest Complete: ${done.title}! +${done.rewards.coins}g +${done.rewards.xp} XP`);
                    this.refreshNpcPrompts();
                  }
                },
              },
            ],
          });
        } else {
          const summary = q.objectives
            .map((o) => `{c:#ffe066}${o.label}{/c}: ${gameState.getObjectiveProgress(q.id, o)}/${o.count}`)
            .join(' • ');
          dialogueBox.show({
            speaker: npc.spec.name,
            portraitKey: npc.spec.spriteKey,
            subtitle: `In Progress: ${q.title}`,
            voicePitch: q.voicePitch,
            lines: [...q.progressDialogue, `Progress: ${summary}`],
          });
        }
      } else {
        dialogueBox.show({
          speaker: npc.spec.name,
          portraitKey: npc.spec.spriteKey,
          subtitle: `New Quest: ${q.title}`,
          voicePitch: q.voicePitch,
          lines: q.offerDialogue,
          choices: [
            {
              label: 'Accept Quest',
              primary: true,
              onSelect: () => {
                gameState.acceptQuest(q.id);
                gameState.setTrackedQuest(q.id);
                SFX.playPickup();
                spawnSparklers(this, this.player.x, this.player.y - 8, 14);
                this.hud.showToast(fmtKeySuffix(`Quest Accepted: ${q.title}`, 'Q'));
                this.refreshNpcPrompts();
                revealSequence.show({
                  title: 'QUEST ACCEPTED!',
                  subtitle: q.title,
                  badgeText: '📜',
                  accentColor: '#ffe066',
                });
              },
            },
            {
              label: 'Maybe Later',
              onSelect: () => {
                SFX.playUiClose();
              },
            },
          ],
        });
      }
      return true;
    }
    return false;
  }

  update(_time: number, dtMs: number): void {
    if (transitionManager.isActive) return;
    const dt = Math.min(dtMs, 50);
    this.promoTimeline?.update(dt);

    // Passive HP/Energy trickle (only emit lightweight vitals update when values actually change)
    this.regenTimerMs += dt;
    if (this.lowEnergyToastMs > 0) this.lowEnergyToastMs = Math.max(0, this.lowEnergyToastMs - dt);
    if (this.petActionCooldownMs > 0) this.petActionCooldownMs = Math.max(0, this.petActionCooldownMs - dt);
    if (this.stokeCooldownMs > 0) this.stokeCooldownMs = Math.max(0, this.stokeCooldownMs - dt);

    // Synchronized traveling wave bobbing across visible wooden bridges
    const waveNowMs = this.time.now;
    for (const b of this.bridgeSprites.values()) {
      if (b.sprite.active && this.isNearCamera(b.sprite.x, b.sprite.y, 48)) {
        b.sprite.y = computeBridgeBobY(b.tx, b.ty, waveNowMs, b.baseY);
      }
    }

    // Periodic 60s autosave
    this.autosaveTimerMs -= dt;
    if (this.autosaveTimerMs <= 0) {
      this.autosaveTimerMs = 60000;
      if (this.player) {
        gameState.playerPos = { x: this.player.x, y: this.player.y };
      }
      this.syncBuildingQueuesToSave();
      gameState.save();
    }

    if (this.regenTimerMs >= 1000) {
      this.regenTimerMs = 0;
      const maxEn = gameState.getMaxEnergy();
      const maxHp = gameState.getMaxHp();
      const prevEn = gameState.energy;
      const prevHp = gameState.hp;
      const { nightFactor } = this.lighting.getAmbientColor();
      const nearWarmth =
        nightFactor >= 0.45 &&
        this.buildings.some(
          (b) =>
            b.active &&
            (b.structureType === 'bonfire' || b.structureType === 'furnace' || b.structureType === 'lighthouse') &&
            Math.hypot(b.x - this.player.x, b.y - this.player.y) <= 72,
        );
      const enRegen = (gameState.hasSkill('magic_vitality') ? 4.5 : 2.2) * 0.2 * (nearWarmth ? 1.5 : 1);
      if (gameState.energy < maxEn) {
        gameState.energy = Math.min(maxEn, gameState.energy + enRegen);
      }
      if ((gameState.hasSkill('magic_vitality') || gameState.hasTrinketEffect('regen_out_combat')) && gameState.hp < maxHp) {
        gameState.hp = Math.min(maxHp, gameState.hp + 2);
      }
      if (gameState.energy !== prevEn || gameState.hp !== prevHp) {
        gameState.emitVitals();
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) {
      this.handleInteractKey();
    }

    // Build cursor preview (green if valid tile, red if blocked) + mobile zoom-out gizmo
    const isMobileBuild = Boolean(
      this.hud.isTouchEnabled() && gameState.pendingBuildRecipeId && this.hud.activeModal === 'none',
    );
    const worldPx = WORLD_TILES * TILE_PX;
    const targetZoom = computeResponsiveZoom(this.scale.width, this.scale.height, {
      worldWidthPx: worldPx,
      worldHeightPx: worldPx,
      minZoom: isMobileBuild ? 1.85 : 3,
    });
    this.cameraRig.update(dt, targetZoom);
    const cam = this.cameras.main;

    if (isMobileBuild) {
      const rec = RECIPES.find((r) => r.id === gameState.pendingBuildRecipeId);
      if (!this.mobilePlaceActive) {
        this.mobilePlaceActive = true;
        const f = this.player.facing;
        const offTx = f === 'left' ? -2 : f === 'right' ? 2 : 0;
        const offTy = f === 'up' ? -2 : f === 'down' ? 2 : 0;
        this.mobilePlaceTx = Phaser.Math.Clamp(Math.floor(this.player.x / TILE_PX) + offTx, 0, WORLD_TILES - 1);
        this.mobilePlaceTy = Phaser.Math.Clamp(Math.floor(this.player.y / TILE_PX) + offTy, 0, WORLD_TILES - 1);
        this.mobilePlaceWorldX = this.mobilePlaceTx * TILE_PX + 8;
        this.mobilePlaceWorldY = this.mobilePlaceTy * TILE_PX + 8;
      }

      const tx = this.mobilePlaceTx;
      const ty = this.mobilePlaceTy;
      const cx = tx * TILE_PX + 8;
      const cy = ty * TILE_PX + 8;
      const valid = this.canPlacePendingAt(tx, ty);

      this.buildCursor
        .setPosition(cx, cy)
        .setFillStyle(valid ? 0x6ee88a : 0xff6b78, 0.28)
        .setStrokeStyle(1, valid ? 0x8ef5a7 : 0xff8a93, 0.95)
        .setVisible(true);

      if (rec?.structureType) {
        const spec = getStructurePreviewSpec(rec.structureType);
        if (!this.buildPreviewSprite) {
          this.buildPreviewSprite = this.add.image(cx, cy, spec.texture, spec.frame).setDepth(8500);
        } else {
          this.buildPreviewSprite.setTexture(spec.texture, spec.frame);
        }
        this.buildPreviewSprite
          .setPosition(cx, cy + (spec.offsetY ?? 0))
          .setOrigin(0.5, spec.originY ?? 0.5)
          .setScale(spec.scale ?? 1)
          .setAlpha(0.78)
          .setTint(valid ? 0xa6ffbe : 0xff8a93)
          .setVisible(true);
      }

      if (!this.buildGizmoGfx) {
        this.buildGizmoGfx = this.add.graphics().setDepth(8550);
      }
      this.drawPlacementGizmo(this.buildGizmoGfx, cx, cy, valid);
      this.buildGizmoGfx.setVisible(true);

      const sx = (cx - cam.worldView.x) * cam.zoom;
      const sy = (cy - 20 - cam.worldView.y) * cam.zoom;
      this.hud.updateMobileBuildControls(sx, sy, valid, rec?.name ?? 'Build');
    } else {
      if (this.mobilePlaceActive) {
        this.mobilePlaceActive = false;
        this.mobilePlaceDragging = false;
        this.buildPreviewSprite?.setVisible(false);
        this.buildGizmoGfx?.setVisible(false);
        this.hud.hideMobileBuildControls();
      }
      if (gameState.pendingBuildRecipeId && this.hud.activeModal === 'none') {
        const ptr = this.input.activePointer;
        const wp = cam.getWorldPoint(ptr.x, ptr.y);
        const tx = Math.floor(wp.x / TILE_PX);
        const ty = Math.floor(wp.y / TILE_PX);
        const valid = this.canPlacePendingAt(tx, ty);
        this.buildCursor
          .setPosition(tx * TILE_PX + 8, ty * TILE_PX + 8)
          .setFillStyle(valid ? 0x6ee88a : 0xff6b78, 0.28)
          .setStrokeStyle(1, valid ? 0x8ef5a7 : 0xff8a93, 0.95)
          .setVisible(true);
      } else {
        this.buildCursor.setVisible(false);
      }
    }

    if (!this.hud.isBlockingInput() && !this.fishingMinigame.isActive()) {
      const tv = this.hud.getTouchMoveVector();
      const dir = this.moveDir.set(
        (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0) -
          (this.keys.A.isDown || this.keys.LEFT.isDown ? 1 : 0) +
          tv.x,
        (this.keys.S.isDown || this.keys.DOWN.isDown ? 1 : 0) -
          (this.keys.W.isDown || this.keys.UP.isDown ? 1 : 0) +
          tv.y,
      );
      if (this.fishingIdle && dir.lengthSq() > 0.01) {
        this.cancelIdleFishing();
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
        if (this.player.tryDash(dir)) {
          const dodgedThreat = this.enemies.some(
            (e) =>
              e.active &&
              !e.isDead &&
              (e.isWindingUp() || Math.hypot(e.x - this.player.x, e.y - this.player.y) <= 60),
          );
          if (dodgedThreat) {
            this.player.grantDodgeMomentum(2200);
            spawnFloatingText(this, this.player.x, this.player.y - 18, 'DODGE CRIT!', '#ffe57f', '8px');
          }
        }
      }
      // Hold Left Mouse Button for smooth continuous gather / attack swings (pass fromHold=true)
      const ptr = this.input.activePointer;
      if (
        ptr.leftButtonDown() &&
        !gameState.pendingBuildRecipeId &&
        !(ptr.event && ptr.event.target !== this.game.canvas)
      ) {
        const curItem = gameState.hotbar[gameState.selectedHotbarIndex] || 'pickaxe';
        if (curItem !== 'fishing_rod') {
          const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
          this.handlePrimaryAction(wp.x, wp.y, true);
        }
      }
      const ptx = Math.floor(this.player.x / TILE_PX);
      const pty = Math.floor(this.player.y / TILE_PX);
      const onRoad = this.overlayGrid[pty]?.[ptx] === 'road';
      const gx = Phaser.Math.Clamp(Math.floor(ptx / ISLAND_CELL_TILES), 0, 4);
      const gy = Phaser.Math.Clamp(Math.floor(pty / ISLAND_CELL_TILES), 0, 4);
      const biome = getIslandAt(gx, gy)?.biome ?? 'grass';
      const stepCol = this.bridgeSet.has(`${ptx},${pty}`) ? 0xc99c6b : (OverworldScene.STEP_PALETTE[biome] ?? 0xd8d2c5);
      const surface: 'grass' | 'sand' | 'stone' | 'snow' =
        onRoad || this.bridgeSet.has(`${ptx},${pty}`)
          ? 'stone'
          : biome === 'winter'
            ? 'snow'
            : biome === 'autumn'
              ? 'sand'
              : 'grass';
      this.player.updatePlayer(dt, dir, this.isWalkable, onRoad ? 1.15 : 1, stepCol, surface);

      // Subtle camera look-ahead in movement/facing direction
      if (dir.lengthSq() > 0.01) {
        this.cameraRig.setLookAhead(dir.x, dir.y, 11);
      } else {
        const fMap = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] } as const;
        const [fx, fy] = fMap[this.player.facing];
        this.cameraRig.setLookAhead(fx, fy, 7);
      }

      // Interactive foliage rustle when walking through berry bushes or planted crops
      if (dir.lengthSq() > 0.01) {
        const nowMs = this.time.now;
        for (const n of this.nodes) {
          if (n.active && n.kind === 'berry_bush' && Math.hypot(n.x - this.player.x, n.y - this.player.y) <= 16) {
            n.rustle(nowMs);
          }
        }
        for (const b of this.buildings) {
          if (b.active && b.isCrop() && Math.hypot(b.x - this.player.x, b.y - this.player.y) <= 15) {
            b.rustle(nowMs);
          }
        }
      }

      // Check tilled soil decay once per second (5m unused / 10m unwatered; rain & watering reset)
      this.soilDecayTimerMs += dt;
      if (this.soilDecayTimerMs >= 1000) {
        this.soilDecayTimerMs = 0;
        this.updateSoilDecay(this.time.now);
      }

      // Shoreline splash & sound when walking right along the water's edge
      if (dir.lengthSq() > 0.01 && !this.bridgeSet.has(`${ptx},${pty}`)) {
        const nearWater = [
          [10, 0],
          [-10, 0],
          [0, 10],
          [0, -10],
        ].some(([ox, oy]) => {
          const ntx = Math.floor((this.player.x + ox) / TILE_PX);
          const nty = Math.floor((this.player.y + oy) / TILE_PX);
          return this.terrainGrid[nty]?.[ntx] === 'water' && !this.bridgeSet.has(`${ntx},${nty}`);
        });
        if (nearWater) {
          this.shoreSplashTimerMs -= dt;
          if (this.shoreSplashTimerMs <= 0) {
            this.shoreSplashTimerMs = 250;
            this.ocean.spawnSplash(this.player.x, this.player.y + 3, 0.55);
            SFX.playWaterSplash();
          }
        } else {
          this.shoreSplashTimerMs = 40;
        }
      }

      const enemyNear = this.enemies.some(
        (e) => e.active && !e.isDead && Math.hypot(e.x - this.player.x, e.y - this.player.y) <= 115,
      );
      if (enemyNear) {
        this.nearEnemyCooldownMs = 2500;
        SFX.setMusicSituation('near_enemy');
      } else if (this.nearEnemyCooldownMs > 0) {
        this.nearEnemyCooldownMs = Math.max(0, this.nearEnemyCooldownMs - dt);
        if (this.nearEnemyCooldownMs <= 0) {
          SFX.setMusicSituation('overworld');
        }
      }
      this.refreshNpcPrompts();

      // Update wandering wildlife animals (camera-culled)
      const aDtSec = dt / 1000;
      for (const a of this.animals) {
        if (!a.sprite?.active || !a.sprite.anims) continue;
        if (!this.isNearCamera(a.x, a.y, 120)) continue;
        if (a.petCooldownMs > 0) a.petCooldownMs = Math.max(0, a.petCooldownMs - dt);
        a.wanderTimerMs -= dt;
        if (a.wanderTimerMs <= 0) {
          if (a.vx !== 0 || a.vy !== 0) {
            a.vx = 0;
            a.vy = 0;
            a.wanderTimerMs = Phaser.Math.Between(1400, 2800);
            if (this.anims.exists(`animal_${a.kind}_idle_down`)) a.sprite.play(`animal_${a.kind}_idle_down`, true);
          } else {
            const ang = Math.random() * Math.PI * 2;
            const spd = a.kind === 'Rabbit' ? 22 : 14;
            a.vx = Math.cos(ang) * spd;
            a.vy = Math.sin(ang) * spd;
            a.wanderTimerMs = Phaser.Math.Between(700, 1500);
            const dirName = Math.abs(a.vx) > Math.abs(a.vy) ? (a.vx > 0 ? 'right' : 'left') : a.vy > 0 ? 'down' : 'up';
            const walkKey = `animal_${a.kind}_walk_${dirName}`;
            if (this.anims.exists(walkKey)) a.sprite.play(walkKey, true);
          }
        }
        if (a.vx !== 0 || a.vy !== 0) {
          const nx = a.x + a.vx * aDtSec;
          const ny = a.y + a.vy * aDtSec;
          if (this.isWalkable(nx, ny)) {
            a.x = nx;
            a.y = ny;
            a.sprite.setPosition(nx, ny - 4).setDepth(ny);
            a.shadow.setPosition(nx, ny - 1).setDepth(ny - 1);
          } else {
            a.vx = 0;
            a.vy = 0;
          }
        }
      }
      this.fox.updateCompanion(dt, this.player.x, this.player.y, {
        findTarget: () => {
          let best: Enemy | null = null;
          let bestD = 135;
          for (const e of this.enemies) {
            if (!e.active || e.isDead) continue;
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
            spawnBurstParticles(this, target.x, target.y - 4, meta?.isSlam ? 0xff8833 : 0xffaa44, meta?.isSlam ? 9 : 5);
            const nx = (target.x - this.fox.x) / (Math.hypot(target.x - this.fox.x, target.y - this.fox.y) || 1);
            const ny = (target.y - this.fox.y) / (Math.hypot(target.x - this.fox.x, target.y - this.fox.y) || 1);
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
        onForage: (fx, fy) => {
          if (Math.random() < 0.55) {
            this.spawnLoot(fx, fy, 'berries', 1);
            spawnFloatingText(this, fx, fy - 12, 'Fox +1 Berries', '#8ef5a7', '7px');
          } else {
            this.spawnCoin(fx, fy, 3);
            spawnFloatingText(this, fx, fy - 12, 'Fox +3g', '#ffe066', '7px');
          }
        },
        onFetchLoot: (fx, fy, radius) => {
          for (const d of this.drops) {
            if (!d.active) continue;
            const dist = Math.hypot(d.x - fx, d.y - fy);
            if (dist <= radius) {
              d.x += (this.player.x - d.x) * 0.45;
              d.y += (this.player.y - d.y) * 0.45;
            }
          }
        },
        onTaunt: (fx, fy, radius) => {
          spawnBurstParticles(this, fx, fy, 0xffaa44, 8);
          for (const e of this.enemies) {
            if (!e.active || e.isDead) continue;
            if (Math.hypot(e.x - fx, e.y - fy) <= radius) {
              e.x += (fx - e.x) * 0.25;
              e.y += (fy - e.y) * 0.25;
            }
          }
        },
      },
      {
        isWaterAt: (fx, fy) => {
          const tx = Math.floor(fx / TILE_PX);
          const ty = Math.floor(fy / TILE_PX);
          return this.terrainGrid[ty]?.[tx] === 'water' && !this.bridgeSet.has(`${tx},${ty}`);
        },
        onSplash: (fx, fy) => {
          this.ocean.spawnSplash(fx, fy, 0.52);
        },
      });
    } else if (this.fishingMinigame.isActive()) {
      this.player.playHeroAnim('fishing');
      if (this.fishingBobber?.active) {
        this.fishingSplashTimerMs -= dt;
        if (this.fishingSplashTimerMs <= 0) {
          this.fishingSplashTimerMs = this.fishingMinigame.isHolding() ? 480 : 900;
          this.ocean.spawnSplash(this.fishingBobber.x, this.fishingBobber.y, this.fishingMinigame.isHolding() ? 0.78 : 0.55);
        }
      }
    }

    // Live fishing line between rod hand and bobber (slack when idle, taut/vibrating when reeling)
    if (this.fishingBobber?.active) {
      if (!this.fishingLine) {
        this.fishingLine = this.add.graphics().setDepth(5250);
      }
      const f = this.player.facing;
      const rodX = this.player.x + (f === 'left' ? -8 : f === 'right' ? 8 : 2);
      const rodY = this.player.y - (f === 'up' ? 12 : 8);
      const bx = this.fishingBobber.x;
      const by = this.fishingBobber.y - 2;
      const holding = this.fishingMinigame.isHolding();
      const sag = holding ? 1.5 : 8;
      const vibX = holding ? (Math.random() - 0.5) * 1.4 : 0;
      const vibY = holding ? (Math.random() - 0.5) * 1.4 : 0;
      const midX = (rodX + bx) * 0.5 + vibX;
      const midY = (rodY + by) * 0.5 + sag + vibY;

      this.fishingLine.clear();
      this.fishingLine.lineStyle(1, holding ? 0xdff6ff : 0xb8d8e8, holding ? 0.92 : 0.7);
      this.fishingLine.beginPath();
      this.fishingLine.moveTo(rodX, rodY);
      const segs = 6;
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const inv = 1 - t;
        const px = inv * inv * rodX + 2 * inv * t * midX + t * t * bx;
        const py = inv * inv * rodY + 2 * inv * t * midY + t * t * by;
        this.fishingLine.lineTo(px, py);
      }
      this.fishingLine.strokePath();
    } else if (this.fishingLine) {
      this.fishingLine.destroy();
      this.fishingLine = undefined;
    }

    // Station prompts & camera-prioritized building ticks
    // On-screen buildings tick every frame; off-screen buildings/resources tick at a lower 500ms rate.
    this.offscreenTickAccumMs += dt;
    const runOffscreenTick = this.offscreenTickAccumMs >= 500;
    const offscreenDt = runOffscreenTick ? this.offscreenTickAccumMs : 0;
    if (runOffscreenTick) {
      this.offscreenTickAccumMs = 0;
      for (const n of this.nodes) {
        if (!n.active) continue;
        n.setVisible(this.isNearCamera(n.x, n.y, 96));
      }
    }

    if (!this.buildingTickCallbacks) {
      this.buildingTickCallbacks = {
        onMiningRodPulse: (bx, by, radiusPx, dmg) => {
          const target = this.nodes.find((n) => n.active && n.solid && Math.hypot(n.x - bx, n.y - by) <= radiusPx);
          if (target) {
            if (this.isNearCamera(bx, by, 110)) {
              const beam = this.add.line(0, 0, bx, by - 8, target.x, target.y, 0x6ce5ff, 0.85).setOrigin(0).setDepth(6000);
              this.tweens.add({ targets: beam, alpha: 0, duration: 180, onComplete: () => beam.destroy() });
            }
            this.hitResourceNode(target, dmg, false);
          }
        },
        onFishTrapCatch: (bx, by) => {
          this.spawnLoot(bx, by, 'fish', 1);
          if (gameState.hasSkill('foraging_fishing') && Math.random() < 0.35) {
            this.spawnCoin(bx, by, 5);
          }
        },
        onCraftComplete: (bx, by, itemId, count) => {
          SFX.playCraft();
          spawnBurstParticles(this, bx, by - 10, 0xffe066, 6);
          this.spawnLoot(bx, by, itemId, count);
          for (const rec of RECIPES) {
            if (rec.outputItemId === itemId) {
              gameState.recordQuestProgress('craft', rec.id, 1);
            }
          }
          this.awardXp(8);
          this.syncBuildingQueuesToSave();
          const outName = ITEMS[itemId]?.name ?? itemId;
          if (!this.isNearCamera(bx, by, 80)) {
            this.hud.showToast(`Station finished: ${outName} x${count}!`);
          }
          if (this.hud.activeModal === 'craft') {
            this.hud.render();
          }
        },
        onNestHatch: (speciesId, bx, by) => {
          const sp = getSpeciesById(speciesId);
          if (!sp) return;
          const rc = gameState.addRanchCreature(speciesId, bx, by + 6, sp.layIntervalMs);
          this.spawnRanchSprite(rc);
          SFX.playLevelUp();
          spawnBurstParticles(this, bx, by, 0xffe066, 10);
          this.hud.showToast(`${sp.name} hatched! Build Fences to keep it safe & pet it for Eggs!`);
        },
        isFertileSoil: (tx, ty) => this.overlayGrid[ty]?.[tx] === 'dirt',
        rainWatered: this.weather.weather === 'rain',
      };
    } else {
      this.buildingTickCallbacks.rainWatered = this.weather.weather === 'rain';
    }

    for (const b of this.buildings) {
      if (!b.active) continue;
      if (b.interactStation) {
        const inCam = this.isNearCamera(b.x, b.y, 110);
        b.setPromptVisible(inCam && Math.hypot(b.x - this.player.x, b.y - this.player.y) <= 28);
      }
      if (!b.needsTick) continue;
      const inCam = this.isNearCamera(b.x, b.y, 110);
      if (!inCam && !runOffscreenTick) continue;
      b.updateBuilding(inCam ? dt : offscreenDt, this.buildingTickCallbacks);
    }

    // Friendly Ranch Creatures (wander on walkable land, blocked by water & fences, lay eggs when happy)
    for (const rc of this.ranchEntities) {
      const sp = getSpeciesById(rc.save.speciesId);
      if (!sp) continue;
      const inCam = this.isNearCamera(rc.save.x, rc.save.y, 120);
      if (!inCam && !runOffscreenTick) continue;

      const rcDt = inCam ? dt : offscreenDt;
      if (rc.save.happiness >= 40 && rc.save.readyEggs < 3) {
        const eggSpeedMult = gameState.hasSkill('foraging_egg_whisperer') ? 1.35 : 1;
        rc.save.layTimerMs -= rcDt * eggSpeedMult;
        if (rc.save.layTimerMs <= 0) {
          rc.save.layTimerMs = sp.layIntervalMs;
          rc.save.readyEggs += 1;
        }
      }

      if (!inCam) {
        if (rc.label.visible) rc.label.setVisible(false);
        continue;
      }

      rc.wanderTimerMs -= dt;
      if (rc.wanderTimerMs <= 0) {
        rc.wanderTimerMs = Phaser.Math.Between(1400, 3200);
        if (Math.random() < 0.45) {
          rc.vx = 0;
          rc.vy = 0;
        } else {
          const ang = Math.random() * Math.PI * 2;
          rc.vx = Math.cos(ang) * 16;
          rc.vy = Math.sin(ang) * 16;
        }
      }
      if (rc.vx !== 0 || rc.vy !== 0) {
        const nx = rc.save.x + (rc.vx * dt) / 1000;
        const ny = rc.save.y + (rc.vy * dt) / 1000;
        if (this.isWalkable(nx, ny)) {
          rc.save.x = nx;
          rc.save.y = ny;
          rc.sprite.setPosition(nx, ny);
          rc.sprite.setDepth(ny);
          if (rc.vx !== 0) rc.sprite.setFlipX(rc.vx < 0);
        } else {
          rc.vx = -rc.vx;
          rc.vy = -rc.vy;
        }
      }
      rc.label.setPosition(rc.save.x, rc.save.y - 14);
      const near = Math.hypot(rc.save.x - this.player.x, rc.save.y - this.player.y) <= 32;
      if (rc.save.readyEggs > 0) {
        const nextTxt = fmtKeyPrompt('E', `Egg x${rc.save.readyEggs}`);
        if (rc.label.text !== nextTxt) rc.label.setText(nextTxt);
        if (rc.label.style.color !== '#ffe066') rc.label.setColor('#ffe066');
        if (!rc.label.visible) rc.label.setVisible(true);
      } else if (near) {
        const nextTxt = fmtKeyPrompt('E', `Pet ♥${rc.save.happiness}%`);
        if (rc.label.text !== nextTxt) rc.label.setText(nextTxt);
        if (rc.label.style.color !== '#ff9ec4') rc.label.setColor('#ff9ec4');
        if (!rc.label.visible) rc.label.setVisible(true);
      } else if (rc.label.visible) {
        rc.label.setVisible(false);
      }
    }

    if (this.hud.activeModal === 'craft') {
      this.hud.updateCraftQueueInPlace();
    }

    // Enemies (half-island leash & reduced aggro range in Sandstorms; pacified during modals/dialogue/level-up)
    const aggroMult = this.weather.weather === 'sandstorm' ? 0.8 : 1;
    const isViewBlocked = this.hud.isBlockingInput() || this.fishingMinigame.isActive();
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.active) {
        this.enemies.splice(i, 1);
        continue;
      }
      e.updateEnemy(
        dt,
        this.player.x,
        this.player.y,
        this.isWalkable,
        {
          onMeleeHitPlayer: (dmg, dx, dy) => {
            const scaled = Math.max(1, Math.round(dmg * gameState.getDamageScaleVsEnemy(e.def.level).takeMult));
            if (this.player.takeDamage(scaled, dx, dy, this.isWalkable)) {
              spawnFloatingText(this, this.player.x, this.player.y - 14, `-${scaled}`, '#ff5e6c');
              this.checkPlayerDeath();
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
              lifeMs: 1800,
              kind: 'enemy',
            });
          },
          onBossSummon: () => {},
        },
        { aggroMult, pacified: isViewBlocked && !e.def.isBoss },
      );
    }

    // Projectiles
    this.updateProjectiles(dt);

    // Bombs
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.fuseMs -= dt;
      if (b.fuseMs <= 0) {
        const bx = b.sprite.x;
        const by = b.sprite.y;
        b.sprite.destroy();
        this.bombs.splice(i, 1);
        this.detonateBomb(bx, by);
      }
    }

    // Drops
    for (let i = this.drops.length - 1; i >= 0; i--) {
      if (this.drops[i].updateDrop(dt, this.player.x, this.player.y)) {
        this.drops.splice(i, 1);
      }
    }

    // Periodic Per-Island Resource & Night Monster Respawn on owned islands
    this.respawnTimerMs += dt;
    if (this.respawnTimerMs >= NODE_RESPAWN_INTERVAL_MS) {
      this.respawnTimerMs = 0;
      const { nightFactor: curNight } = this.lighting.getAmbientColor();
      const isNight = curNight >= 0.45;
      const countsByIsland = new Map<string, number>();
      for (const n of this.nodes) {
        if (!n.active) continue;
        const key = `${Math.floor(n.tx / ISLAND_CELL_TILES)},${Math.floor(n.ty / ISLAND_CELL_TILES)}`;
        countsByIsland.set(key, (countsByIsland.get(key) ?? 0) + 1);
      }
      const enemiesByIsland = new Map<string, number>();
      for (const e of this.enemies) {
        if (!e.active || e.isDead) continue;
        const key = `${Math.floor(e.x / TILE_PX / ISLAND_CELL_TILES)},${Math.floor(e.y / TILE_PX / ISLAND_CELL_TILES)}`;
        enemiesByIsland.set(key, (enemiesByIsland.get(key) ?? 0) + 1);
      }
      for (const key of gameState.ownedIslands) {
        const [gx, gy] = key.split(',').map(Number);
        const spec = getIslandAt(gx, gy);
        const curNodes = countsByIsland.get(key) ?? 0;
        const curMonsters = enemiesByIsland.get(key) ?? 0;
        const maxMon = (spec?.maxMonsters ?? 2) + (isNight ? 2 : 0);

        if (isNight) {
          // Skew heavily toward spawning monsters at night instead of plants/rocks
          if (curMonsters < maxMon && Math.random() < 0.78) {
            this.trySpawnMonsterOnIsland(gx, gy);
          } else if (curNodes < MAX_NODES_PER_ISLAND && Math.random() < 0.25) {
            this.trySpawnNodeOnIsland(gx, gy);
          }
        } else {
          if (curNodes < MAX_NODES_PER_ISLAND) {
            this.trySpawnNodeOnIsland(gx, gy);
          }
          if (curMonsters < maxMon && Math.random() < 0.25) {
            this.trySpawnMonsterOnIsland(gx, gy);
          }
        }
      }
    }

    // Target indicator & Ocean Waves, Caustics, Splashes & Weather + Day/Night Lighting
    this.updateTargetIndicator();
    this.syncBiomeFromPlayer();
    const { nightFactor } = this.lighting.getAmbientColor();
    this.ocean.update(dt, this.weather.wind, nightFactor);
    this.weather.update(dt);
    this.critters.update(
      dt,
      this.player.x,
      this.player.y,
      this.player.isDashing,
      this.weather.currentBiome,
      nightFactor,
    );
    // Per-building Roof Fade: run before updateLighting() and cull invisible roofs from WebGL
    this.houseGroupRoofAlpha.clear();
    if (this.houseRoofSprites.size > 0) {
      this.activeHouseGroupId = this.isPlayerInsideHouseGroup(this.player.x, this.player.y);
      const step = Math.min(1, dt / 160);
      for (const [k, spr] of this.houseRoofSprites) {
        const gid = this.houseRoofGroup.get(k) ?? 0;
        const targetAlpha = this.activeHouseGroupId > 0 && gid === this.activeHouseGroupId ? 0 : 1.0;
        const underlay = this.houseRoofUnderlaySprites.get(k);
        if (Math.abs(spr.alpha - targetAlpha) < 0.01) {
          spr.setAlpha(targetAlpha);
          spr.setVisible(targetAlpha > 0.01);
          if (underlay) {
            underlay.setAlpha(targetAlpha);
            underlay.setVisible(targetAlpha > 0.01);
          }
          this.houseGroupRoofAlpha.set(gid, targetAlpha);
        } else {
          if (!spr.visible && targetAlpha > 0.01) spr.setVisible(true);
          if (underlay && !underlay.visible && targetAlpha > 0.01) underlay.setVisible(true);
          const nextAlpha = Phaser.Math.Linear(spr.alpha, targetAlpha, step);
          spr.setAlpha(nextAlpha);
          if (underlay) underlay.setAlpha(nextAlpha);
          this.houseGroupRoofAlpha.set(gid, nextAlpha);
        }
      }
      for (const [k, baseSpr] of this.houseRoofConcaveBaseSprites) {
        const gid = this.houseRoofConcaveBaseGroup.get(k) ?? 0;
        const targetAlpha = this.activeHouseGroupId > 0 && gid === this.activeHouseGroupId ? 0 : 1.0;
        if (Math.abs(baseSpr.alpha - targetAlpha) < 0.01) {
          baseSpr.setAlpha(targetAlpha);
          baseSpr.setVisible(targetAlpha > 0.01);
        } else {
          if (!baseSpr.visible && targetAlpha > 0.01) baseSpr.setVisible(true);
          baseSpr.setAlpha(Phaser.Math.Linear(baseSpr.alpha, targetAlpha, step));
        }
      }
      for (const [k, eaveSpr] of this.houseRoofEaveSprites) {
        const gid = this.houseRoofEaveGroup.get(k) ?? 0;
        const targetAlpha = this.activeHouseGroupId > 0 && gid === this.activeHouseGroupId ? 0 : 1.0;
        if (Math.abs(eaveSpr.alpha - targetAlpha) < 0.01) {
          eaveSpr.setAlpha(targetAlpha);
          eaveSpr.setVisible(targetAlpha > 0.01);
        } else {
          if (!eaveSpr.visible && targetAlpha > 0.01) eaveSpr.setVisible(true);
          eaveSpr.setAlpha(Phaser.Math.Linear(eaveSpr.alpha, targetAlpha, step));
        }
      }
    } else {
      this.activeHouseGroupId = 0;
    }

    // Seamless auto-open/close for house doors on approach & departure
    for (const b of this.houseDoors) {
      if (!b.active) continue;
      const dist = Math.hypot(b.x - this.player.x, b.y - this.player.y);
      if (!b.isOpen && dist <= 22) {
        b.toggleDoor();
        SFX.playChop();
      } else if (b.isOpen && dist > 34) {
        b.toggleDoor();
      }
    }

    // Fade boxed house name signs in/out only when standing at the front door
    if (this.houseDoorSigns.length > 0) {
      const signStep = Math.min(1, dt / 140);
      for (const sign of this.houseDoorSigns) {
        const atDoor = Math.hypot(this.player.x - sign.doorX, this.player.y - sign.doorY) <= 28;
        const target = atDoor ? 1 : 0;
        const nextAlpha =
          Math.abs(sign.container.alpha - target) < 0.02
            ? target
            : Phaser.Math.Linear(sign.container.alpha, target, signStep);
        sign.container.setAlpha(nextAlpha);
        sign.container.setVisible(nextAlpha > 0.01);
        sign.container.setY(sign.baseY - nextAlpha * 3);
      }
    }

    this.updateLighting(dt);

    // Desert Sandstorm periodic wind-blown coin / amber finds
    if (this.weather.weather === 'sandstorm' && this.weather.currentBiome === 'autumn') {
      this.sandstormBonusTimerMs += dt;
      if (this.sandstormBonusTimerMs >= 16000) {
        this.sandstormBonusTimerMs = 0;
        const rx = this.player.x + Phaser.Math.Between(-56, 56);
        const ry = this.player.y + Phaser.Math.Between(-56, 56);
        if (this.isWalkable(rx, ry)) {
          if (Math.random() < 0.45) this.spawnLoot(rx, ry, 'amber', 1);
          else this.spawnCoin(rx, ry, 5);
        }
      }
    }

    // Corner Minimap refresh (~3 Hz on mobile, ~5 Hz on desktop)
    this.minimapTimerMs += dt;
    const minimapInterval = isMobileTouchDevice() ? 350 : 200;
    if (this.minimapTimerMs >= minimapInterval) {
      this.minimapTimerMs = 0;
      if (this.cachedMinimapBridgeCount !== this.bridgeSet.size) {
        this.cachedMinimapBridgeCount = this.bridgeSet.size;
        this.cachedMinimapBridges = [];
        for (const bk of this.bridgeSet) {
          const [bx, by] = bk.split(',').map(Number);
          this.cachedMinimapBridges.push({ tx: bx, ty: by });
        }
      }
      const tracked = gameState.getTrackedQuest();
      const waypoint = tracked?.waypoint
        ? {
            tx: tracked.waypoint.gx * ISLAND_CELL_TILES + Math.floor(ISLAND_CELL_TILES / 2),
            ty: tracked.waypoint.gy * ISLAND_CELL_TILES + Math.floor(ISLAND_CELL_TILES / 2),
            label: tracked.waypoint.label,
          }
        : undefined;
      if (!this.cachedMinimapBuildings) {
        this.cachedMinimapBuildings = this.buildings
          .filter((b) => b.active)
          .map((b) => ({ tx: b.tx, ty: b.ty }));
      }
      this.hud.updateMinimap({
        worldTiles: WORLD_TILES,
        playerTx: Math.floor(this.player.x / TILE_PX),
        playerTy: Math.floor(this.player.y / TILE_PX),
        terrainGrid: this.terrainGrid,
        bridges: this.cachedMinimapBridges,
        buildings: this.cachedMinimapBuildings,
        portals: this.dungeonPortals.map((p) => ({ tx: Math.floor(p.x / TILE_PX), ty: Math.floor(p.y / TILE_PX) })),
        enemies: this.enemies
          .filter((e) => e.active && !e.isDead)
          .map((e) => ({ tx: Math.floor(e.x / TILE_PX), ty: Math.floor(e.y / TILE_PX) })),
        waypoint,
      });
    }
  }

  private getNpcPromptText(npcId: string, name: string, inRange: boolean): string {
    const q = gameState.getNextQuestForNpc(npcId);
    if (!q) return inRange ? fmtKeyPrompt('E', name) : '';
    if (gameState.isQuestActive(q.id)) {
      if (gameState.isQuestReadyToTurnIn(q.id)) return inRange ? fmtKeyPrompt('E', `${name} (?)`) : '?';
      return inRange ? fmtKeyPrompt('E', `${name} (...)`) : '...';
    }
    return inRange ? fmtKeyPrompt('E', `${name} (!)`) : '!';
  }

  private refreshNpcPrompts(): void {
    for (const npc of this.npcs) {
      const inRange = this.player ? Math.hypot(npc.x - this.player.x, npc.y - this.player.y) <= 34 : false;
      const nextTxt = this.getNpcPromptText(npc.spec.id, npc.spec.name, inRange);
      if (npc.prompt.text !== nextTxt) {
        const wasInRange = npc.prompt.getData('inRange') === true;
        npc.prompt.setData('inRange', inRange);
        npc.prompt.setText(nextTxt);
        npc.redrawPrompt();
        if (inRange && !wasInRange) {
          const q = gameState.getNextQuestForNpc(npc.spec.id);
          const emote = q ? 'portraits/Emote_question' : 'portraits/Emote_talking';
          showWorldEmote(this, npc.x, npc.y - 22, emote, { durationMs: 950, scale: 0.68 });
        }
      }
    }
  }

  private syncBiomeFromPlayer(): void {
    const gx = Phaser.Math.Clamp(Math.floor(this.player.x / (ISLAND_CELL_TILES * TILE_PX)), 0, 4);
    const gy = Phaser.Math.Clamp(Math.floor(this.player.y / (ISLAND_CELL_TILES * TILE_PX)), 0, 4);
    const island = getIslandAt(gx, gy);
    if (island) {
      this.weather.setBiome(island.biome);
      if (this.hud) {
        if (island.biome === 'infernal') this.hud.setEnvironmentVignette('infernal');
        else if (island.biome === 'winter' && this.weather.weather === 'snow') this.hud.setEnvironmentVignette('frost');
        else this.hud.setEnvironmentVignette('none');
      }
    }
  }

  private updateLighting(dtMs: number): void {
    this.lighthouseAngle = (this.lighthouseAngle + dtMs * 0.0014) % (Math.PI * 2);
    const flicker = 0.92 + Math.sin(this.time.now * 0.015) * 0.08;

    const pointLights = this.pointLightsBuf;
    pointLights.length = 0;
    // Simple smooth circular light field fading outward around the player
    pointLights.push({ x: this.player.x, y: this.player.y - 4, radius: 24, color: 0xffe4aa, intensity: 1.0 });
    if (this.activeHouseGroupId > 0) {
      pointLights.push({ x: this.player.x, y: this.player.y - 4, radius: 52, color: 0xffe4aa, intensity: 0.45 });
    }
    const spotLights = this.spotLightsBuf;
    spotLights.length = 0;

    for (const b of this.buildings) {
      if (!b.active || !b.emitsLight) continue;
      // Suppress indoor lights & aura circles when the building's roof is visible
      const gid = this.houseGroupByTile.get(`${b.tx},${b.ty}`) ?? 0;
      let visAlpha = 1;
      if (gid > 0) {
        const roofAlpha = this.houseGroupRoofAlpha.get(gid) ?? 1;
        visAlpha = gid === this.activeHouseGroupId ? Math.max(0, 1 - roofAlpha) : 0;
        b.setIndoorLightVisible(visAlpha);
        if (visAlpha <= 0.02) continue;
      } else {
        b.setIndoorLightVisible(1);
      }

      if (b.structureType === 'bonfire') {
        pointLights.push({ x: b.x, y: b.y, radius: 56 * flicker, color: 0xff8c3b, intensity: 1 * visAlpha, flicker: true });
      } else if (b.structureType === 'furnace' || b.structureType === 'infernal_forge') {
        pointLights.push({ x: b.x, y: b.y, radius: 24 * flicker, color: 0xff5f2e, intensity: 0.95 * visAlpha, flicker: true });
      } else if (b.structureType === 'frost_kiln') {
        pointLights.push({ x: b.x, y: b.y, radius: 22 * flicker, color: 0x7ce8ff, intensity: 0.9 * visAlpha, flicker: true });
      } else if (b.structureType === 'mining_rod') {
        pointLights.push({ x: b.x, y: b.y - 6, radius: 20, color: 0x5be6ff, intensity: 0.9 * visAlpha, dayVisible: true });
      } else if (b.structureType === 'furniture_lamp') {
        pointLights.push({ x: b.x, y: b.y - 4, radius: 24, color: 0xffe08a, intensity: 0.85 * visAlpha, flicker: true });
      } else if (b.structureType === 'lighthouse') {
        const beaconY = b.y - 11;
        pointLights.push({ x: b.x, y: beaconY, radius: 28, color: 0xfff08a, intensity: 0.95, flicker: true });
        spotLights.push({
          x: b.x,
          y: beaconY,
          angle: this.lighthouseAngle,
          length: 155,
          width: 76,
          color: 0xfff3a8,
          intensity: 1,
        });
      }
    }

    for (const n of this.nodes) {
      if (!n.active || !this.isNearCamera(n.x, n.y, 120)) continue;
      if (n.kind === 'crystal_vein') {
        pointLights.push({ x: n.x, y: n.y, radius: 15, color: 0x6ce5ff, intensity: 0.8, dayVisible: true });
      } else if (n.kind === 'obsidian_vein') {
        pointLights.push({ x: n.x, y: n.y, radius: 15, color: 0xb86bff, intensity: 0.8, dayVisible: true });
      }
    }

    for (const dp of this.dungeonPortals) {
      if (!dp.sprite.visible) continue;
      pointLights.push({ x: dp.x, y: dp.y, radius: 20, color: 0xa275ff, intensity: 0.9, dayVisible: true });
    }

    // Animate & camera-cull drifting fog clouds over unpurchased islands
    const fogSec = this.time.now * 0.001;
    const islandSpan = ISLAND_CELL_TILES * TILE_PX;
    for (const m of this.purchaseMarkers) {
      const mcx = (m.gx * ISLAND_CELL_TILES + ISLAND_CELL_TILES / 2) * TILE_PX;
      const mcy = (m.gy * ISLAND_CELL_TILES + ISLAND_CELL_TILES / 2) * TILE_PX;
      const near = this.isNearCamera(mcx, mcy, islandSpan * 0.9);
      m.veil.setVisible(near);
      m.label?.setVisible(near);
      for (const p of m.puffs) {
        p.sprite.setVisible(near);
        if (!near) continue;
        const t = fogSec * p.speed + p.phase;
        p.sprite.x = p.baseX + Math.sin(t) * p.driftX;
        p.sprite.y = p.baseY + Math.cos(t * 0.7) * p.driftY;
        p.sprite.setAlpha(p.baseAlpha + Math.sin(t * 0.85) * 0.06);
      }
    }

    const dayWrapped = this.lighting.update(
      dtMs,
      pointLights,
      spotLights,
      this.weather.getLightModifier(),
    );
    if (dayWrapped) {
      this.weather.setDay(this.lighting.dayNumber);
    }
    const phase = this.lighting.getPhaseLabel();
    this.hud.setTimeLabel(
      `Day ${this.lighting.dayNumber} • ${phase.label} ${phase.clockStr} • ${this.weather.getStatusLabel()}`,
    );
  }

  private detonateBomb(bx: number, by: number): void {
    SFX.playExplosion();
    this.cameraRig.addTrauma(0.65);
    const fx = this.add.sprite(bx, by, 'projectiles/Bomb_impact').setScale(3.5).setDepth(6000);
    fx.play('fx_bomb_impact');
    fx.once('animationcomplete', () => fx.destroy());
    spawnBurstParticles(this, bx, by, 0xff8c42, 12);

    const radius = 44;
    for (const b of [...this.buildings]) {
      if (b.active && b.isCropWithered() && Math.hypot(b.x - bx, b.y - by) <= radius) {
        this.cullWitheredCrop(b);
      }
    }
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      if (n.active && Math.hypot(n.x - bx, n.y - by) <= radius) {
        this.hitResourceNode(n, 60);
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.active && !e.isDead && Math.hypot(e.x - bx, e.y - by) <= radius) {
        const dx = (e.x - bx) / (Math.hypot(e.x - bx, e.y - by) || 1);
        const dy = (e.y - by) / (Math.hypot(e.x - bx, e.y - by) || 1);
        this.damageEnemy(e, 55, dx, dy);
      }
    }
  }

  private updateProjectiles(dtMs: number): void {
    const dt = dtMs / 1000;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.lifeMs -= dtMs;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      if (Math.random() < 0.45) spawnProjectileTrail(this, p.sprite.x, p.sprite.y, p.kind);

      let hit = false;
      if (p.fromPlayer) {
        for (const e of this.enemies) {
          if (e.active && !e.isDead && Math.hypot(e.x - p.sprite.x, e.y - p.sprite.y) <= 13) {
            const spd = Math.hypot(p.vx, p.vy) || 1;
            if (p.kind === 'ice') e.applySlow(2600);
            if (p.kind === 'necro') {
              gameState.hp = Math.min(gameState.getMaxHp(), gameState.hp + 4);
              gameState.emit();
            }
            this.damageEnemy(e, p.damage, p.vx / spd, p.vy / spd);
            if (p.kind === 'fire') {
              spawnBurstParticles(this, p.sprite.x, p.sprite.y, 0xff7b29, 8);
            }
            hit = true;
            break;
          }
        }
        if (!hit) {
          for (const n of this.nodes) {
            if (n.active && n.solid && Math.hypot(n.x - p.sprite.x, n.y - p.sprite.y) <= 10) {
              this.hitResourceNode(n, Math.round(p.damage * 0.45));
              hit = true;
              break;
            }
          }
        }
      } else {
        const isViewBlocked = this.hud.isBlockingInput() || this.fishingMinigame.isActive();
        if (!isViewBlocked && Math.hypot(this.player.x - p.sprite.x, this.player.y - p.sprite.y) <= 10) {
          const spd = Math.hypot(p.vx, p.vy) || 1;
          if (this.player.takeDamage(p.damage, p.vx / spd, p.vy / spd, this.isWalkable)) {
            spawnFloatingText(this, this.player.x, this.player.y - 14, `-${p.damage}`, '#ff5e6c');
            this.checkPlayerDeath();
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
  }

  private checkPlayerDeath(): void {
    if (gameState.hp > 0) return;
    gameState.hp = Math.round(gameState.getMaxHp() * 0.6);
    gameState.energy = gameState.getMaxEnergy();
    const half = Math.floor(ISLAND_CELL_TILES / 2);
    const tile = this.findNearestLandTileOnIsland(2, 2, half, half);
    const pt = this.findNearestWalkablePoint(tile.tx * TILE_PX + 8, tile.ty * TILE_PX + 8);
    this.player.setPosition(pt.x, pt.y);
    this.hud.showToast('Revived at Emerald Origin!');
    gameState.emit();
  }
}
