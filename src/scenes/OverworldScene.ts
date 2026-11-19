import Phaser from 'phaser';
import { gameState, type RanchCreatureSave } from '../core/GameState';
import { computeResponsiveZoom } from '../core/ViewportScaler';
import { getSpeciesByEgg, getSpeciesById, RANCH_SPECIES } from '../data/ranchCreatures';
import { SFX } from '../core/SoundFX';
import { startSceneAndWaitCreate, transitionManager } from '../core/TransitionManager';
import { ITEMS } from '../data/items';
import {
  ISLANDS,
  ISLAND_CELL_TILES,
  TILE_PX,
  WORLD_TILES,
  getIslandAt,
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
import { FoxCompanion, Player } from '../entities/Player';
import { dialogueBox } from '../ui/DialogueBox';
import { FishingMinigame, type FishBehavior } from '../ui/FishingMinigame';
import { tryActivateGadget } from '../entities/GadgetHelper';
import { selectBestAimTarget, type AimCandidate } from '../entities/targeting';
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

interface ActiveBomb {
  sprite: Phaser.GameObjects.Image;
  fuseMs: number;
}

interface IslandPurchaseMarker {
  gx: number;
  gy: number;
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

interface NpcEntity {
  spec: NonNullable<IslandSpec['npc']>;
  sprite: Phaser.GameObjects.Sprite;
  prompt: Phaser.GameObjects.Text;
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
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  prompt: Phaser.GameObjects.Text;
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

  private player!: Player;
  private fox!: FoxCompanion;
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
  private bridgeSprites = new Map<string, Phaser.GameObjects.Image>();
  private houseRoofSprites = new Map<string, Phaser.GameObjects.Image>();
  private houseTileSet = new Set<string>();
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
    this.enemies = [];
    this.drops = [];
    this.projectiles = [];
    this.bombs = [];
    this.purchaseMarkers = [];
    this.npcs = [];
    this.ranchEntities = [];
    this.dungeonPortals = [];
    this.bridgeSprites.clear();
    this.houseRoofSprites.clear();
    this.houseTileSet.clear();
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
    this.fox = new FoxCompanion(this, safeStart.x - 16, safeStart.y + 6);

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
    // Gentle 2-second bobbing wave cycle staggered per plank
    const phaseMs = ((tx * 3 + ty * 5) % 10) * 180;
    this.tweens.add({
      targets: spr,
      y: { from: baseY - 1.5, to: baseY + 1.5 },
      duration: 1000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
      delay: phaseMs,
    });
    this.bridgeSprites.set(key, spr);
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
      this.buildings.push(
        new BuildingEntity(this, b.id, b.type, b.tx, b.ty, b.craftQueue ?? [], b.cropStage ?? 0),
      );
    }
    for (const rc of gameState.ranchCreatures) {
      this.spawnRanchSprite(rc);
    }
    this.rebuildHouseRoofs();
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
    for (const b of this.buildings) {
      if (b.active && this.isHousePart(b.structureType)) {
        this.houseTileSet.add(`${b.tx},${b.ty}`);
      }
    }
    for (const [k, spr] of this.houseRoofSprites) {
      if (!this.houseTileSet.has(k)) {
        spr.destroy();
        this.houseRoofSprites.delete(k);
      }
    }
    for (const k of this.houseTileSet) {
      const [tx, ty] = k.split(',').map(Number);
      const hasN = this.houseTileSet.has(`${tx},${ty - 1}`);
      const hasS = this.houseTileSet.has(`${tx},${ty + 1}`);
      // Pick shingle frame from 7x5 sprout/house_roof (row 3 col 2 = 23 interior, row 2 col 2 = 16 north ridge, row 4 col 2 = 30 south eave)
      const frame = !hasN ? 16 : !hasS ? 30 : 23;
      let spr = this.houseRoofSprites.get(k);
      if (!spr) {
        spr = this.add
          .image(tx * TILE_PX + 8, ty * TILE_PX + 8, 'sprout/house_roof', frame)
          .setDepth(8500);
        this.houseRoofSprites.set(k, spr);
      } else {
        spr.setFrame(frame);
      }
    }
  }

  private spawnRanchSprite(rc: RanchCreatureSave): void {
    const sp = getSpeciesById(rc.speciesId);
    if (!sp) return;
    const spr = this.add.sprite(rc.x, rc.y, sp.spriteKey, 0).setDepth(rc.y);
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
      const prompt = this.add
        .text(
          spr.x,
          spr.y - 16,
          cleared ? `${spec.name} (Cleared)` : `[E] Enter ${spec.name.replace(' Isle', '')}`,
          {
            fontSize: '7px',
            fontStyle: 'bold',
            color: cleared ? '#90ee90' : '#ffcf70',
            stroke: '#000',
            strokeThickness: 2,
            resolution: 4,
          },
        )
        .setOrigin(0.5)
        .setDepth(8000);
      this.dungeonPortals.push({
        dungeonId: spec.dungeonId,
        x: spr.x,
        y: spr.y,
        sprite: spr,
        prompt,
      });
    }

    // 1b. Void Spire Endless Dungeon Portal on Emerald Origin (2,2)
    if (spec.gx === 2 && spec.gy === 2) {
      const vTile = this.findNearestLandTileOnIsland(gx, gy, Math.floor(ISLAND_CELL_TILES * 0.72), Math.floor(ISLAND_CELL_TILES * 0.28));
      const spr = this.add
        .image(vTile.tx * TILE_PX + 8, vTile.ty * TILE_PX + 8, 'tileset/Cave entrance_2', 1)
        .setTint(0xc77dff)
        .setDepth(vTile.ty * TILE_PX + 8);
      const unlocked = gameState.clearedDungeons.has('infernal_sanctum');
      const checkpointFloor = Math.max(1, Math.floor(gameState.voidSpireHighestFloor / 5) * 5 + 1);
      const prompt = this.add
        .text(
          spr.x,
          spr.y - 16,
          unlocked
            ? `[E] Void Spire (Fl.${checkpointFloor})`
            : 'Void Spire (Clear Infernal Sanctum)',
          {
            fontSize: '7px',
            fontStyle: 'bold',
            color: unlocked ? '#d896ff' : '#9988aa',
            stroke: '#000',
            strokeThickness: 2,
            resolution: 4,
          },
        )
        .setOrigin(0.5)
        .setDepth(8000);
      this.dungeonPortals.push({
        dungeonId: 'void_spire',
        x: spr.x,
        y: spr.y,
        sprite: spr,
        prompt,
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
      const prompt = this.add
        .text(spr.x, spr.y - 14, this.getNpcPromptText(spec.npc.id, spec.npc.name, false), {
          fontSize: '8px',
          fontStyle: 'bold',
          color: '#ffe066',
          stroke: '#000',
          strokeThickness: 2,
          resolution: 4,
        })
        .setOrigin(0.5)
        .setDepth(8000);
      this.tweens.add({
        targets: prompt,
        y: spr.y - 17,
        duration: 720,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
      this.npcs.push({ spec: spec.npc, sprite: spr, prompt, x: nx, y: ny });
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

  private refreshPurchaseMarkers(): void {
    for (const m of this.purchaseMarkers) {
      m.rect.destroy();
      m.label.destroy();
    }
    this.purchaseMarkers = [];

    for (const spec of ISLANDS) {
      if (!gameState.isIslandAdjacentToOwned(spec.gx, spec.gy)) continue;
      const cx = (spec.gx * ISLAND_CELL_TILES + ISLAND_CELL_TILES / 2) * TILE_PX;
      const cy = (spec.gy * ISLAND_CELL_TILES + ISLAND_CELL_TILES / 2) * TILE_PX;
      const size = (ISLAND_CELL_TILES - 2) * TILE_PX;
      const cost = gameState.getIslandCost(spec.gx, spec.gy);
      const canAfford = gameState.coins >= cost;

      const rect = this.add
        .rectangle(cx, cy, size, size, canAfford ? 0xffe066 : 0x5c7a99, 0.1)
        .setStrokeStyle(1.5, canAfford ? 0xffe066 : 0x6c8aad, 0.75)
        .setDepth(3);

      const label = this.add
        .text(cx, cy, `${spec.name}\n(${spec.biome})\nMap [M]: ${cost}g`, {
          fontSize: '8px',
          fontStyle: 'bold',
          color: canAfford ? '#ffe680' : '#bfd4e8',
          align: 'center',
          stroke: '#0d1624',
          strokeThickness: 2,
          resolution: 4,
        })
        .setOrigin(0.5)
        .setDepth(10);

      this.purchaseMarkers.push({ gx: spec.gx, gy: spec.gy, rect, label });
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
    this.stampIslandTerrain(gx, gy);
    const ox = gx * ISLAND_CELL_TILES;
    const oy = gy * ISLAND_CELL_TILES;
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
        if (ent.isCrop()) bSave.cropStage = ent.getCropStage();
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

    for (let i = 1; i <= 9; i++) {
      kb.on(`keydown-${i}`, () => {
        if (this.hud.isBlockingInput()) return;
        if (gameState.selectedHotbarIndex !== i - 1) SFX.playHotbarSelect();
        gameState.selectedHotbarIndex = i - 1;
        this.hud.render();
      });
    }

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
          this.buildings.push(b);
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
    } else if (!isLand(terrain)) {
      return { ok: false, reason: `${rec.name} must be placed on land!`, rec };
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
      st !== 'crop_berries' &&
      st !== 'crop_carrot' &&
      st !== 'crop_sunflower';
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
      gameState.overlays.push({ tx, ty, type: 'bridge' });
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
      this.buildings.push(bld);
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
      if (!skipInteract && this.handleInteractKey()) return;
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
      let wateredAny = false;
      for (const b of this.buildings) {
        if (b.active && b.isCrop() && Math.hypot(b.x - wxHit, b.y - wyHit) <= 26) {
          if (b.waterCrop()) {
            wateredAny = true;
            spawnFloatingText(this, b.x, b.y - 12, 'Watered!', '#7ce8ff');
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

    // Check Ripe Crops
    for (const b of this.buildings) {
      if (!b.active || !b.isCropRipe()) continue;
      if (Math.hypot(b.x - this.player.x, b.y - this.player.y) <= range + 8) {
        if (!this.consumeToolEnergy(1.5)) break;
        const res = b.harvestCrop();
        if (res) {
          SFX.playHarvestCrop();
          spawnArcParticles(this, b.x, b.y - 4, 0x7ef29d, 8);
          this.spawnLoot(b.x, b.y, res.itemId, res.count);
          this.awardXp(8);
        }
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

  private findInteractableTarget(): { kind: 'portal' | 'animal' | 'ranch' | 'building' | 'npc'; x: number; y: number; depth: number } | null {
    for (const dp of this.dungeonPortals) {
      if (Math.hypot(dp.x - this.player.x, dp.y - this.player.y) <= 28) {
        return { kind: 'portal', x: dp.x, y: dp.y + dp.sprite.displayHeight * 0.25, depth: dp.sprite.depth };
      }
    }
    for (const b of this.buildings) {
      if (!b.active || Math.hypot(b.x - this.player.x, b.y - this.player.y) > 28) continue;
      if (
        b.structureType === 'nest' ||
        b.structureType === 'house_door' ||
        b.structureType === 'fence_gate' ||
        b.structureType === 'furniture_bed' ||
        b.structureType === 'water_well' ||
        b.interactStation ||
        b.isCropRipe()
      ) {
        return {
          kind: 'building',
          x: b.x,
          y: b.getCollisionCenter().y,
          depth: b.depth,
        };
      }
    }
    const heldItemId = gameState.hotbar[gameState.selectedHotbarIndex] ?? '';
    const holdingSword = heldItemId.startsWith('sword');
    if (!holdingSword) {
      for (const rc of this.ranchEntities) {
        if (Math.hypot(rc.save.x - this.player.x, rc.save.y - this.player.y) <= 28) {
          return { kind: 'ranch', x: rc.save.x, y: rc.save.y + rc.sprite.displayHeight * 0.3, depth: rc.sprite.depth };
        }
      }
      for (const a of this.animals) {
        if (Math.hypot(a.x - this.player.x, a.y - this.player.y) <= 28) {
          return { kind: 'animal', x: a.x, y: a.y, depth: a.sprite.depth };
        }
      }
    }
    // NPCs are lowest priority
    for (const npc of this.npcs) {
      if (Math.hypot(npc.x - this.player.x, npc.y - this.player.y) <= 30) {
        return { kind: 'npc', x: npc.x, y: npc.y, depth: npc.sprite.depth };
      }
    }
    return null;
  }

  private updateTargetIndicator(): void {
    if (!this.targetIndicator || this.hud.isBlockingInput()) {
      this.targetIndicator?.setVisible(false);
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
      this.targetIndicator
        .setPosition(aimed.x, aimed.y)
        .setDepth(aimed.depth - 0.5)
        .setStrokeStyle(1.4, 0xff6b6b, 0.9)
        .setFillStyle(0xff6b6b, 0.14)
        .setVisible(true);
      return;
    }

    const interactable = this.findInteractableTarget();
    // Non-NPC interactables take priority over nodes/animals, while NPCs are lowest priority
    if (interactable && (interactable.kind !== 'npc' || !aimed)) {
      this.targetIndicator
        .setPosition(interactable.x, interactable.y)
        .setDepth(interactable.depth - 0.5)
        .setStrokeStyle(1.4, 0x44ee88, 0.95)
        .setFillStyle(0x44ee88, 0.18)
        .setVisible(true);
      return;
    }

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
      this.hud.showToast(`Level ${gameState.level}! Earned +1 Skill Point [K]`);
      revealSequence.show({
        title: `LEVEL ${gameState.level}!`,
        subtitle: '+1 Skill Point Earned • Press [K] to upgrade',
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
    if (terrain === 'water' && !this.bridgeSet.has(`${tx},${ty}`)) return false;

    for (const n of this.nodes) {
      if (!n.active || !n.solid) continue;
      if (Math.abs(n.tx - tx) > 1 || Math.abs(n.ty - ty) > 1) continue;
      const c = n.getCollisionCenter();
      if (Math.hypot(wx - c.x, wy - c.y) < n.collisionRadius) return false;
    }
    for (const b of this.buildings) {
      if (!b.active || !b.solid) continue;
      if (Math.abs(b.tx - tx) > 1 || Math.abs(b.ty - ty) > 1) continue;
      const c = b.getCollisionCenter();
      if (Math.hypot(wx - c.x, wy - c.y) < b.collisionRadius) return false;
    }
    for (const npc of this.npcs) {
      if (Math.hypot(wx - npc.x, wy - (npc.y - 2)) < 11) return false;
    }
    return true;
  };

  private handleInteractKey(): boolean {
    // 1. Check nearby Dungeon Portal
    for (const dp of this.dungeonPortals) {
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
    const heldId = gameState.hotbar[gameState.selectedHotbarIndex] ?? '';
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

    // 4. Check nearby Doors, Gates, Bed, Water Well, Crafting Station or Chest
    for (const b of this.buildings) {
      if (!b.active || Math.hypot(b.x - this.player.x, b.y - this.player.y) > 28) continue;
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
        spawnFloatingText(this, this.player.x, this.player.y - 16, 'Rested! Full HP & EN', '#8ef5a7');
        return true;
      }
      if (b.structureType === 'water_well') {
        gameState.energy = Math.min(gameState.getMaxEnergy(), gameState.energy + 30);
        gameState.emitVitals();
        let watered = 0;
        for (const crop of this.buildings) {
          if (crop.active && crop.isCrop() && Math.hypot(crop.x - b.x, crop.y - b.y) <= 80 && crop.waterCrop()) {
            watered += 1;
          }
        }
        SFX.playPickup();
        this.hud.showToast(`Water Well: +30 EN${watered > 0 ? ` • Watered ${watered} crops!` : ''}`);
        return true;
      }
      if (b.interactStation) {
        if (b.interactStation === 'chest') {
          this.hud.toggleModal('inventory');
        } else {
          this.hud.toggleModal('craft', b.interactStation, b.id);
        }
        return true;
      }
    }

    // 4. Check ripe Crops via [E]
    for (const b of this.buildings) {
      if (b.active && b.isCropRipe() && Math.hypot(b.x - this.player.x, b.y - this.player.y) <= 28) {
        const res = b.harvestCrop();
        if (res) {
          SFX.playHarvestCrop();
          spawnArcParticles(this, b.x, b.y - 4, 0x7ef29d, 8);
          this.spawnLoot(b.x, b.y, res.itemId, res.count);
          this.awardXp(8);
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
                this.hud.showToast(`Quest Accepted: ${q.title} [Q]`);
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
      const dir = new Phaser.Math.Vector2(
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
      const stepPalette: Record<string, number> = {
        grass: 0x9be68e,
        autumn: 0xe6a85c,
        graveyard: 0x988eb8,
        winter: 0xe8f6ff,
        infernal: 0xff7b54,
      };
      const stepCol = this.bridgeSet.has(`${ptx},${pty}`) ? 0xc99c6b : (stepPalette[biome] ?? 0xd8d2c5);
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

      // Interactive foliage rustle when walking through berry bushes
      if (dir.lengthSq() > 0.01) {
        const nowMs = this.time.now;
        for (const n of this.nodes) {
          if (n.active && n.kind === 'berry_bush' && Math.hypot(n.x - this.player.x, n.y - this.player.y) <= 16) {
            n.rustle(nowMs);
          }
        }
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

      // Update wandering wildlife animals
      const aDtSec = dt / 1000;
      for (const a of this.animals) {
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
          let bestD = 78;
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
        onBite: (fx, fy, dmg) => {
          const target = this.enemies.find(
            (e) => e.active && !e.isDead && Math.hypot(e.x - fx, e.y - fy) <= 18,
          );
          if (target) {
            spawnBurstParticles(this, target.x, target.y - 4, 0xffaa44, 5);
            const nx = (target.x - this.fox.x) / (Math.hypot(target.x - this.fox.x, target.y - this.fox.y) || 1);
            const ny = (target.y - this.fox.y) / (Math.hypot(target.x - this.fox.x, target.y - this.fox.y) || 1);
            this.damageEnemy(target, dmg, nx, ny);
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

    for (const b of this.buildings) {
      if (!b.active) continue;
      const inCam = this.isNearCamera(b.x, b.y, 110);
      if (b.interactStation) {
        b.setPromptVisible(inCam && Math.hypot(b.x - this.player.x, b.y - this.player.y) <= 28);
      }
      if (!inCam && !runOffscreenTick) continue;
      const tickDt = inCam ? dt : offscreenDt;
      b.updateBuilding(tickDt, {
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
      });
    }

    // Friendly Ranch Creatures (wander on walkable land, blocked by water & fences, lay eggs when happy)
    for (const rc of this.ranchEntities) {
      const sp = getSpeciesById(rc.save.speciesId);
      if (!sp) continue;
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
      if (rc.save.happiness >= 40 && rc.save.readyEggs < 3) {
        const eggSpeedMult = gameState.hasSkill('foraging_egg_whisperer') ? 1.35 : 1;
        rc.save.layTimerMs -= dt * eggSpeedMult;
        if (rc.save.layTimerMs <= 0) {
          rc.save.layTimerMs = sp.layIntervalMs;
          rc.save.readyEggs += 1;
        }
      }
      rc.label.setPosition(rc.save.x, rc.save.y - 14);
      const near = Math.hypot(rc.save.x - this.player.x, rc.save.y - this.player.y) <= 32;
      if (rc.save.readyEggs > 0) {
        rc.label.setText(`[E] Egg x${rc.save.readyEggs}`);
        rc.label.setColor('#ffe066');
        rc.label.setVisible(true);
      } else if (near) {
        rc.label.setText(`[E] Pet ♥${rc.save.happiness}%`);
        rc.label.setColor('#ff9ec4');
        rc.label.setVisible(true);
      } else {
        rc.label.setVisible(false);
      }
    }

    if (this.hud.activeModal === 'craft') {
      this.hud.updateCraftQueueInPlace();
    }

    // Enemies (half-island leash & reduced aggro range in Sandstorms)
    const aggroMult = this.weather.weather === 'sandstorm' ? 0.8 : 1;
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
        { aggroMult },
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
    this.updateLighting(dt);

    // Blocked-out House Roof Fade: fade roofs when player steps inside a house
    if (this.houseRoofSprites.size > 0) {
      const ptx = Math.floor(this.player.x / TILE_PX);
      const pty = Math.floor(this.player.y / TILE_PX);
      const insideHouse = this.houseTileSet.has(`${ptx},${pty}`);
      const targetAlpha = insideHouse ? 0.12 : 1.0;
      const step = Math.min(1, dt / 160);
      for (const spr of this.houseRoofSprites.values()) {
        spr.setAlpha(Phaser.Math.Linear(spr.alpha, targetAlpha, step));
      }
    }

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

    // Corner Minimap refresh (~5 Hz)
    this.minimapTimerMs += dt;
    if (this.minimapTimerMs >= 200) {
      this.minimapTimerMs = 0;
      const bridges: Array<{ tx: number; ty: number }> = [];
      for (const bk of this.bridgeSet) {
        const [bx, by] = bk.split(',').map(Number);
        bridges.push({ tx: bx, ty: by });
      }
      const tracked = gameState.getTrackedQuest();
      const waypoint = tracked?.waypoint
        ? {
            tx: tracked.waypoint.gx * ISLAND_CELL_TILES + Math.floor(ISLAND_CELL_TILES / 2),
            ty: tracked.waypoint.gy * ISLAND_CELL_TILES + Math.floor(ISLAND_CELL_TILES / 2),
            label: tracked.waypoint.label,
          }
        : undefined;
      this.hud.updateMinimap({
        worldTiles: WORLD_TILES,
        playerTx: Math.floor(this.player.x / TILE_PX),
        playerTy: Math.floor(this.player.y / TILE_PX),
        terrainGrid: this.terrainGrid,
        bridges,
        buildings: this.buildings.filter((b) => b.active).map((b) => ({ tx: b.tx, ty: b.ty })),
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
    if (!q) return inRange ? `[E] ${name}` : '';
    if (gameState.isQuestActive(q.id)) {
      if (gameState.isQuestReadyToTurnIn(q.id)) return inRange ? `[E] ${name} (?)` : '?';
      return inRange ? `[E] ${name} (...)` : '...';
    }
    return inRange ? `[E] ${name} (!)` : '!';
  }

  private refreshNpcPrompts(): void {
    for (const npc of this.npcs) {
      const inRange = this.player ? Math.hypot(npc.x - this.player.x, npc.y - this.player.y) <= 34 : false;
      const nextTxt = this.getNpcPromptText(npc.spec.id, npc.spec.name, inRange);
      if (npc.prompt.text !== nextTxt) {
        const wasEmpty = !npc.prompt.text.startsWith('[E]');
        npc.prompt.setText(nextTxt);
        if (inRange && wasEmpty) {
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

    const pointLights: PointLightSource[] = [
      // Simple smooth circular light field fading outward around the player
      { x: this.player.x, y: this.player.y - 4, radius: 24, color: 0xffe4aa, intensity: 1.0 },
    ];
    const spotLights: SpotLightSource[] = [];

    for (const b of this.buildings) {
      if (!b.active) continue;
      if (b.structureType === 'bonfire') {
        pointLights.push({ x: b.x, y: b.y, radius: 56 * flicker, color: 0xff8c3b, intensity: 1, flicker: true });
      } else if (b.structureType === 'furnace' || b.structureType === 'infernal_forge') {
        pointLights.push({ x: b.x, y: b.y, radius: 24 * flicker, color: 0xff5f2e, intensity: 0.95, flicker: true });
      } else if (b.structureType === 'frost_kiln') {
        pointLights.push({ x: b.x, y: b.y, radius: 22 * flicker, color: 0x7ce8ff, intensity: 0.9, flicker: true });
      } else if (b.structureType === 'mining_rod') {
        pointLights.push({ x: b.x, y: b.y - 6, radius: 20, color: 0x5be6ff, intensity: 0.9, dayVisible: true });
      } else if (b.structureType === 'furniture_lamp') {
        pointLights.push({ x: b.x, y: b.y - 4, radius: 24, color: 0xffe08a, intensity: 0.85, flicker: true });
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
      pointLights.push({ x: dp.x, y: dp.y, radius: 20, color: 0xa275ff, intensity: 0.9, dayVisible: true });
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
        if (Math.hypot(this.player.x - p.sprite.x, this.player.y - p.sprite.y) <= 10) {
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
