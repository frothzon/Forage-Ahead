import Phaser from 'phaser';
import { gameState } from '../core/GameState';
import { SFX } from '../core/SoundFX';
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
import { RECIPES } from '../data/recipes';
import {
  drawSlashArc,
  spawnBurstParticles,
  spawnFloatingText,
  type ActiveProjectile,
} from '../entities/CombatHelpers';
import { Enemy } from '../entities/Enemy';
import { LootDrop } from '../entities/LootDrop';
import { FoxCompanion, Player } from '../entities/Player';
import { HudController } from '../ui/HudController';
import {
  BIOME_TILESETS,
  computeOverlayTile,
  computeTerrainTile,
  isLand,
  type OverlayType,
  type TerrainType,
} from '../world/AutoTiler';
import { BuildingEntity } from '../world/BuildingEntity';
import { ResourceNode, type NodeKind } from '../world/ResourceNode';

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
  private tilesets!: {
    grass: Phaser.Tilemaps.Tileset;
    autumn: Phaser.Tilemaps.Tileset;
    winter: Phaser.Tilemaps.Tileset;
    dirt: Phaser.Tilemaps.Tileset;
    road: Phaser.Tilemaps.Tileset;
  };

  private player!: Player;
  private fox!: FoxCompanion;
  private hud!: HudController;

  private nodes: ResourceNode[] = [];
  private buildings: BuildingEntity[] = [];
  private enemies: Enemy[] = [];
  private drops: LootDrop[] = [];
  private projectiles: ActiveProjectile[] = [];
  private bombs: ActiveBomb[] = [];
  private purchaseMarkers: IslandPurchaseMarker[] = [];
  private npcs: NpcEntity[] = [];
  private dungeonPortals: DungeonPortalEntity[] = [];
  private bridgeSprites = new Map<string, Phaser.GameObjects.Image>();
  private buildCursor!: Phaser.GameObjects.Rectangle;

  private respawnTimerMs = 0;
  private regenTimerMs = 0;

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
    this.dungeonPortals = [];
    this.bridgeSprites.clear();
    this.bridgeSet.clear();

    this.initGrids();
    this.buildTilemap();
    this.populateOwnedWorld();

    const startPx = gameState.playerPos
      ? gameState.playerPos
      : {
          x: (2 * ISLAND_CELL_TILES + 7) * TILE_PX,
          y: (2 * ISLAND_CELL_TILES + 7) * TILE_PX,
        };
    this.player = new Player(this, startPx.x, startPx.y);
    this.fox = new FoxCompanion(this, startPx.x - 16, startPx.y + 6);

    this.buildCursor = this.add
      .rectangle(0, 0, TILE_PX, TILE_PX, 0xffe066, 0.25)
      .setStrokeStyle(1, 0xffe066, 0.9)
      .setDepth(5000)
      .setVisible(false);

    const worldPx = WORLD_TILES * TILE_PX;
    this.cameras.main.setBounds(0, 0, worldPx, worldPx);
    this.cameras.main.setZoom(3);
    this.cameras.main.startFollow(this.player, true, 0.14, 0.14);
    this.cameras.main.roundPixels = true;

    this.setupHud();
    this.setupInput();
    this.refreshPurchaseMarkers();
    if (SFX.musicEnabled) SFX.startAmbientMusic('overworld');
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

    for (let ly = 1; ly < ISLAND_CELL_TILES - 1; ly++) {
      for (let lx = 1; lx < ISLAND_CELL_TILES - 1; lx++) {
        // Shape sculpting for organic coastline silhouettes
        if (spec.shape === 'cove' && lx >= 5 && lx <= 8 && ly >= 10) continue;
        if (
          spec.shape === 'cross' &&
          ((lx <= 2 || lx >= 11) && (ly <= 2 || ly >= 11))
        ) {
          continue;
        }
        if (spec.shape === 'twin' && lx === 6 && (ly <= 3 || ly >= 10)) continue;

        this.terrainGrid[oy + ly][ox + lx] = spec.biome;
      }
    }
  }

  private buildTilemap(): void {
    this.map = this.make.tilemap({
      tileWidth: TILE_PX,
      tileHeight: TILE_PX,
      width: WORLD_TILES,
      height: WORLD_TILES,
    });

    const grass = this.map.addTilesetImage('tileset_grass', 'tileset_grass', 16, 16, 0, 0)!;
    const autumn = this.map.addTilesetImage('tileset_autumn', 'tileset_autumn', 16, 16, 0, 0)!;
    const winter = this.map.addTilesetImage('tileset_winter', 'tileset_winter', 16, 16, 0, 0)!;
    const dirt = this.map.addTilesetImage('tileset_dirt', 'tileset_dirt', 16, 16, 0, 0)!;
    const road = this.map.addTilesetImage('tileset_roads_stone', 'tileset_roads_stone', 16, 16, 0, 0)!;

    this.tilesets = { grass, autumn, winter, dirt, road };

    this.waterLayer = this.map.createBlankLayer('water', [grass], 0, 0)!.setDepth(0);
    this.terrainLayer = this.map.createBlankLayer('terrain', [grass, autumn, winter], 0, 0)!.setDepth(1);
    this.overlayLayer = this.map.createBlankLayer('overlays', [dirt, road], 0, 0)!.setDepth(2);

    const waterGid = grass.firstgid + BIOME_TILESETS.grass.waterFrame;
    this.waterLayer.fill(waterGid);

    this.refreshAutoTiles(0, 0, WORLD_TILES - 1, WORLD_TILES - 1);
  }

  private getTilesetFirstGid(key: string): number {
    if (key === 'tileset_autumn') return this.tilesets.autumn.firstgid;
    if (key === 'tileset_winter') return this.tilesets.winter.firstgid;
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
          if (tile && placement.tint) tile.tint = placement.tint;
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

  private ensureBridgeVisual(tx: number, ty: number): void {
    const key = `${tx},${ty}`;
    if (this.bridgeSprites.has(key)) return;
    const spr = this.add.image(tx * TILE_PX + 8, ty * TILE_PX + 8, 'ui_icons/bridge').setDepth(2.5);
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
  }

  private populateIslandContent(gx: number, gy: number, spawnNodes = true): void {
    const spec = getIslandAt(gx, gy);
    if (!spec) return;

    const ox = gx * ISLAND_CELL_TILES;
    const oy = gy * ISLAND_CELL_TILES;
    const centerTx = ox + 7;
    const centerTy = oy + 7;

    // 1. Dungeon Entrance
    if (spec.dungeonId) {
      const dtx = ox + 7;
      const dty = oy + 4;
      const spr = this.add
        .image(dtx * TILE_PX + 8, dty * TILE_PX + 8, 'tileset/Cave entrance_2', 1)
        .setDepth(dty * TILE_PX + 8);
      const cleared = gameState.clearedDungeons.has(spec.dungeonId);
      const prompt = this.add
        .text(
          spr.x,
          spr.y - 16,
          cleared ? `${spec.name} (Cleared)` : `[E] Enter ${spec.name.replace(' Isle', '')}`,
          {
            fontSize: '7px',
            color: cleared ? '#90ee90' : '#ffcf70',
            stroke: '#000',
            strokeThickness: 2,
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

    // 2. Quest NPC
    if (spec.npc) {
      const ntx = ox + 5;
      const nty = oy + 6;
      const spr = this.add
        .sprite(ntx * TILE_PX + 8, nty * TILE_PX + 6, spec.npc.spriteKey, 0)
        .setDepth(nty * TILE_PX + 8);
      const animKey = `npc_${spec.npc.spriteKey.split('/').pop()!.replace('_idle', '')}_idle_down`;
      if (this.anims.exists(animKey)) spr.play(animKey);
      const prompt = this.add
        .text(spr.x, spr.y - 18, `[E] ${spec.npc.name}`, {
          fontSize: '7px',
          color: '#ffe066',
          stroke: '#000',
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setDepth(8000);
      this.npcs.push({ spec: spec.npc, sprite: spr, prompt, x: spr.x, y: spr.y });
    }

    // 3. Ambient wildlife on peaceful biomes
    if (spec.biome === 'grass' || spec.biome === 'autumn') {
      const animalList = spec.biome === 'grass' ? ['Cow', 'Hen', 'Rabbit'] : ['Deer'];
      const pick = Phaser.Utils.Array.GetRandom(animalList);
      const ax = (ox + Phaser.Math.Between(3, 10)) * TILE_PX + 8;
      const ay = (oy + Phaser.Math.Between(3, 10)) * TILE_PX + 8;
      const keyMap: Record<string, string> = {
        Cow: 'animals/Cow_idle (20x16)',
        Deer: 'animals/Deer_Idle (32x32)',
        Hen: 'animals/Hen_idle (16x16)',
        Rabbit: 'animals/Rabbit_Idle (16x16)',
      };
      const anim = this.add.sprite(ax, ay, keyMap[pick], 0).setDepth(ay);
      if (this.anims.exists(`animal_${pick}_idle_down`)) anim.play(`animal_${pick}_idle_down`);
    }

    // 4. Spawn Resource Nodes & Fishing Spots on island (when not restoring from save)
    if (spawnNodes) {
      const count = spec.starterOwned ? 14 : 16;
      for (let i = 0; i < count; i++) {
        this.trySpawnNodeOnIsland(gx, gy, centerTx, centerTy);
      }

      for (let f = 0; f < 3; f++) {
        const fx = ox + Phaser.Math.Between(0, ISLAND_CELL_TILES - 1);
        const fy = oy + Phaser.Math.Between(0, ISLAND_CELL_TILES - 1);
        if (this.terrainGrid[fy][fx] === 'water' && !this.hasNodeAt(fx, fy)) {
          this.nodes.push(new ResourceNode(this, fx, fy, 'fish_spot', spec.biome));
        }
      }
    }

    // 6. Spawn Biome Monsters (avoid starter center)
    const monCount = spec.starterOwned ? 1 : spec.maxMonsters;
    for (let m = 0; m < monCount; m++) {
      const mtx = ox + Phaser.Math.Between(2, 11);
      const mty = oy + Phaser.Math.Between(2, 11);
      if (spec.starterOwned && Math.hypot(mtx - centerTx, mty - centerTy) < 4) continue;
      if (!isLand(this.terrainGrid[mty]?.[mtx])) continue;
      const monId = Phaser.Utils.Array.GetRandom(spec.monsterPool);
      this.enemies.push(new Enemy(this, monId, mtx * TILE_PX + 8, mty * TILE_PX + 8));
    }
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

    for (let attempt = 0; attempt < 12; attempt++) {
      const tx = ox + Phaser.Math.Between(1, ISLAND_CELL_TILES - 2);
      const ty = oy + Phaser.Math.Between(1, ISLAND_CELL_TILES - 2);
      if (!isLand(this.terrainGrid[ty]?.[tx])) continue;
      if (avoidTx >= 0 && Math.hypot(tx - avoidTx, ty - avoidTy) < 2.2) continue;
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
        .setDepth(3)
        .setInteractive({ useHandCursor: true });

      const label = this.add
        .text(cx, cy, `${spec.name}\n(${spec.biome})\nBuy: ${cost}g`, {
          fontSize: '8px',
          color: canAfford ? '#ffe680' : '#bfd4e8',
          align: 'center',
          stroke: '#0d1624',
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setDepth(10);

      rect.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event.stopPropagation();
        if (this.hud.isBlockingInput() || gameState.pendingBuildRecipeId) return;
        this.attemptBuyIsland(spec.gx, spec.gy);
      });

      this.purchaseMarkers.push({ gx: spec.gx, gy: spec.gy, rect, label });
    }
  }

  private attemptBuyIsland(gx: number, gy: number): void {
    if (!gameState.buyIsland(gx, gy)) {
      this.hud.showToast('Not enough Coins or island not adjacent!');
      return;
    }
    SFX.playLevelUp();
    this.stampIslandTerrain(gx, gy);
    const ox = gx * ISLAND_CELL_TILES;
    const oy = gy * ISLAND_CELL_TILES;
    this.refreshAutoTiles(ox - 1, oy - 1, ox + ISLAND_CELL_TILES, oy + ISLAND_CELL_TILES);
    this.populateIslandContent(gx, gy);
    this.refreshPurchaseMarkers();
    const spec = getIslandAt(gx, gy);
    this.hud.showToast(`Purchased ${spec?.name ?? 'New Island'}!`);
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
        this.hud.showToast('Adventure Saved!');
      },
      getStations: (stationType) =>
        this.buildings
          .filter((b) => b.active && b.structureType === stationType)
          .map((b) => ({
            id: b.id,
            type: b.structureType as 'furnace' | 'anvil' | 'bonfire',
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
          const tx = (gx * ISLAND_CELL_TILES + 7) * TILE_PX;
          const ty = (gy * ISLAND_CELL_TILES + 7) * TILE_PX;
          this.player.setPosition(tx, ty);
          this.fox.setPosition(tx - 16, ty + 6);
          gameState.emit();
          const spec = getIslandAt(gx, gy);
          this.hud.showToast(`Teleported to ${spec?.name ?? key}`);
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
    kb.on('keydown-M', () => this.hud.toggleModal('map'));
    kb.on('keydown-I', () => this.hud.toggleModal('inventory'));
    kb.on('keydown-P', () => this.hud.toggleModal('progress'));
    kb.on('keydown-ESC', () => {
      if (gameState.pendingBuildRecipeId) {
        gameState.pendingBuildRecipeId = null;
        this.hud.render();
      } else if (this.hud.activeModal !== 'none') {
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
        if (gameState.pendingBuildRecipeId) {
          this.tryPlaceBuilding(worldPt.x, worldPt.y);
        } else {
          this.handlePrimaryAction(worldPt.x, worldPt.y);
        }
      }
    });
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

    if (this.hasBuildingAt(tx, ty) || this.hasNodeAt(tx, ty)) {
      return { ok: false, reason: 'Tile is already occupied!', rec };
    }

    const isSolidBuild =
      st !== 'bridge' &&
      st !== 'road_stone' &&
      st !== 'fish_trap' &&
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

    SFX.playCraft();
    if (st === 'bridge') {
      this.overlayGrid[ty][tx] = 'bridge';
      this.bridgeSet.add(`${tx},${ty}`);
      gameState.overlays.push({ tx, ty, type: 'bridge' });
      this.refreshAutoTiles(tx - 1, ty - 1, tx + 1, ty + 1);
    } else if (st === 'road_stone') {
      this.overlayGrid[ty][tx] = 'road';
      gameState.overlays.push({ tx, ty, type: 'road' });
      this.refreshAutoTiles(tx - 1, ty - 1, tx + 1, ty + 1);
    } else {
      const id = `bld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.buildings.push(new BuildingEntity(this, id, st, tx, ty));
      gameState.buildings.push({ id, type: st, tx, ty });
    }

    // Keep placing bridges/roads smoothly while materials last!
    if ((st !== 'bridge' && st !== 'road_stone') || !gameState.canCraft(rec)) {
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
      SFX.playPickup();
      spawnFloatingText(this, this.player.x, this.player.y - 14, `+${def.healHp ?? 0}HP +${def.healEnergy ?? 0}EN`, '#7ef59a');
      gameState.emit();
    }
  }

  private handlePrimaryAction(wx: number, wy: number): void {
    const itemId = gameState.hotbar[gameState.selectedHotbarIndex] || 'pickaxe';
    const def = ITEMS[itemId];
    if (!def) return;

    if (def.healHp || def.healEnergy) {
      this.tryConsumeItem(itemId);
      return;
    }

    if (itemId === 'bomb') {
      if ((gameState.inventory.bomb ?? 0) <= 0) return;
      gameState.removeItem('bomb', 1);
      const bombSpr = this.add.image(this.player.x, this.player.y, 'projectiles/Bomb').setDepth(this.player.y);
      this.tweens.add({ targets: bombSpr, scale: { from: 1, to: 1.35 }, duration: 220, yoyo: true, repeat: -1 });
      this.bombs.push({ sprite: bombSpr, fuseMs: 1100 });
      return;
    }

    const dx = wx - this.player.x;
    const dy = wy - this.player.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    // Ranged Bow & Relic Rods
    if (itemId === 'bow' || def.category === 'relic') {
      const cd = gameState.hasSkill('magic_archmage') ? Math.round((def.cooldownMs ?? 320) * 0.7) : (def.cooldownMs ?? 320);
      const anim = itemId === 'bow' ? 'ranged' : 'cast';
      if (!this.player.startAction(anim, cd, nx, ny, 160)) return;
      SFX.playCast();
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
      for (const b of this.buildings) {
        if (b.active && b.isCrop() && Math.hypot(b.x - wxHit, b.y - wyHit) <= 26) {
          if (b.waterCrop()) {
            spawnFloatingText(this, b.x, b.y - 12, 'Watered!', '#7ce8ff');
          }
        }
      }
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
    drawSlashArc(this, this.player.x, this.player.y - 4, angle, range, itemId.startsWith('sword') ? 0xfff0a8 : 0xb5e2ff);
    SFX.playSwing();

    // Check Ripe Crops
    for (const b of this.buildings) {
      if (!b.active || !b.isCropRipe()) continue;
      if (Math.hypot(b.x - this.player.x, b.y - this.player.y) <= range + 8) {
        const res = b.harvestCrop();
        if (res) {
          this.spawnLoot(b.x, b.y, res.itemId, res.count);
          this.awardXp(8);
        }
      }
    }

    // Check Resource Nodes in front arc / range
    const hitX = this.player.x + nx * (range * 0.55);
    const hitY = this.player.y + ny * (range * 0.55);
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      if (!n.active) continue;
      if (Math.hypot(n.x - hitX, n.y - hitY) <= 20) {
        if (n.requiredTool === 'shovel' && itemId !== 'shovel') continue;
        if (n.requiredTool === 'fishing_rod' && itemId !== 'fishing_rod') continue;
        if (itemId === 'fishing_rod' && n.kind !== 'fish_spot') continue;

        const gDmg =
          itemId.startsWith('sword')
            ? Math.round(gameState.getGatherDamage(itemId) * 0.6)
            : gameState.getGatherDamage(itemId);
        this.hitResourceNode(n, gDmg);
        break;
      }
    }

    // Check Enemies in melee arc
    const wDmg = gameState.getWeaponDamage(itemId);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.active || e.isDead) continue;
      if (Math.hypot(e.x - hitX, e.y - hitY) <= range * 0.72) {
        this.damageEnemy(e, wDmg, nx, ny);
      }
    }
  }

  private hitResourceNode(node: ResourceNode, dmg: number): void {
    if (gameState.energy > 0) gameState.energy = Math.max(0, gameState.energy - 1.5);
    if (node.kind === 'tree' || node.kind === 'berry_bush') {
      SFX.playChop();
      spawnBurstParticles(this, node.x, node.y - 4, 0x6fd96b, 4);
    } else if (node.kind === 'fish_spot') {
      SFX.playPickup();
      spawnBurstParticles(this, node.x, node.y, 0x8af0ff, 5);
    } else {
      SFX.playMine();
      spawnBurstParticles(this, node.x, node.y - 4, 0xc9d4df, 4);
    }

    const destroyed = node.damage(dmg);
    if (!destroyed) return;

    const mult = this.getLighthouseMultiplier(node.x, node.y);
    for (const d of node.drops) {
      let qty = Phaser.Math.Between(d.min, d.max);
      if (gameState.hasSkill('foraging_bounty') && Math.random() < 0.35) qty += 1;
      if (gameState.hasSkill('industry_prospecting') && (d.itemId === 'coal' || d.itemId === 'iron_ore' || d.itemId === 'gold_ore' || d.itemId === 'crystal')) {
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
    this.nodes = this.nodes.filter((n) => n.active);
  }

  private getLighthouseMultiplier(x: number, y: number): number {
    let mult = 1;
    for (const b of this.buildings) {
      if (b.active && b.structureType === 'lighthouse' && Math.hypot(b.x - x, b.y - y) <= 96) {
        mult += 0.5;
      }
    }
    return mult;
  }

  private damageEnemy(enemy: Enemy, baseDmg: number, dirX: number, dirY: number): void {
    const crit = Math.random() < gameState.getCritChance();
    const dmg = crit ? Math.round(baseDmg * 2) : baseDmg;
    SFX.playHit();
    spawnFloatingText(this, enemy.x, enemy.y - 16, crit ? `${dmg}!` : `${dmg}`, crit ? '#ffe066' : '#ffffff');
    spawnBurstParticles(this, enemy.x, enemy.y - 4, 0xff6b6b, 5);

    const killed = enemy.takeDamage(dmg, dirX, dirY, (nx, ny) => this.isWalkable(nx, ny));
    if (killed) {
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
    const leveled = gameState.addXp(amount);
    if (leveled) {
      SFX.playLevelUp();
      spawnFloatingText(this, this.player.x, this.player.y - 22, `LEVEL ${gameState.level}! +1 SP`, '#ffe066', '10px');
      this.hud.showToast(`Level ${gameState.level}! Earned +1 Skill Point [K]`);
    }
  }

  private spawnLoot(x: number, y: number, itemId: string, count: number): void {
    this.drops.push(new LootDrop(this, x, y, itemId, count, false));
  }

  private spawnCoin(x: number, y: number, count: number): void {
    this.drops.push(new LootDrop(this, x, y, 'coin', count, true));
  }

  private isWalkable = (wx: number, wy: number): boolean => {
    const tx = Math.floor(wx / TILE_PX);
    const ty = Math.floor(wy / TILE_PX);
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return false;
    const terrain = this.terrainGrid[ty][tx];
    if (terrain === 'water' && !this.bridgeSet.has(`${tx},${ty}`)) return false;

    for (const n of this.nodes) {
      if (n.active && n.solid && n.tx === tx && n.ty === ty) {
        if (Math.hypot(wx - n.x, wy - n.y) < 7) return false;
      }
    }
    for (const b of this.buildings) {
      if (b.active && b.solid && b.tx === tx && b.ty === ty) {
        if (Math.hypot(wx - b.x, wy - b.y) < 7) return false;
      }
    }
    return true;
  };

  private handleInteractKey(): void {
    // 1. Check nearby Dungeon Portal
    for (const dp of this.dungeonPortals) {
      if (Math.hypot(dp.x - this.player.x, dp.y - this.player.y) <= 28) {
        gameState.playerPos = { x: this.player.x, y: this.player.y + 16 };
        this.syncBuildingQueuesToSave();
        gameState.save();
        this.hud.destroy();
        this.scene.start('DungeonScene', { dungeonId: dp.dungeonId });
        return;
      }
    }

    // 2. Check nearby Quest NPC
    for (const npc of this.npcs) {
      if (Math.hypot(npc.x - this.player.x, npc.y - this.player.y) <= 30) {
        const q = npc.spec;
        if (gameState.completedQuests.has(q.id)) {
          this.hud.showToast(`${q.name}: Safe travels, hero!`);
          return;
        }
        const have = gameState.inventory[q.requestItemId] ?? 0;
        if (have >= q.requestCount) {
          gameState.removeItem(q.requestItemId, q.requestCount);
          gameState.coins += q.rewardCoins;
          if (q.rewardItemId) gameState.addItem(q.rewardItemId, q.rewardItemCount ?? 1);
          gameState.completedQuests.add(q.id);
          this.awardXp(q.rewardXp);
          SFX.playLevelUp();
          npc.prompt.setText(`${q.name} (Done)`);
          this.hud.showToast(`Quest Complete! +${q.rewardCoins}g +${q.rewardXp} XP`);
        } else {
          const itemLabel = ITEMS[q.requestItemId]?.name ?? q.requestItemId;
          this.hud.showToast(`${q.name}: Bring ${q.requestCount} ${itemLabel} (${have}/${q.requestCount})`);
        }
        return;
      }
    }

    // 3. Check nearby Crafting Station or Chest
    for (const b of this.buildings) {
      if (b.active && b.interactStation && Math.hypot(b.x - this.player.x, b.y - this.player.y) <= 28) {
        if (b.interactStation === 'chest') {
          this.hud.toggleModal('inventory');
        } else {
          this.hud.toggleModal('craft', b.interactStation, b.id);
        }
        return;
      }
    }

    // 4. Check ripe Crops via [E]
    for (const b of this.buildings) {
      if (b.active && b.isCropRipe() && Math.hypot(b.x - this.player.x, b.y - this.player.y) <= 28) {
        const res = b.harvestCrop();
        if (res) {
          this.spawnLoot(b.x, b.y, res.itemId, res.count);
          this.awardXp(8);
        }
        return;
      }
    }
  }

  update(_time: number, dtMs: number): void {
    const dt = Math.min(dtMs, 50);

    // Passive HP/Energy trickle (only emit lightweight vitals update when values actually change)
    this.regenTimerMs += dt;
    if (this.regenTimerMs >= 1000) {
      this.regenTimerMs = 0;
      const maxEn = gameState.getMaxEnergy();
      const maxHp = gameState.getMaxHp();
      const prevEn = gameState.energy;
      const prevHp = gameState.hp;
      const enRegen = gameState.hasSkill('magic_vitality') ? 4.5 : 2.2;
      if (gameState.energy < maxEn) {
        gameState.energy = Math.min(maxEn, gameState.energy + enRegen);
      }
      if (gameState.hasSkill('magic_vitality') && gameState.hp < maxHp) {
        gameState.hp = Math.min(maxHp, gameState.hp + 2);
      }
      if (gameState.energy !== prevEn || gameState.hp !== prevHp) {
        gameState.emitVitals();
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) {
      this.handleInteractKey();
    }

    // Build cursor preview (green if valid tile, red if blocked)
    if (gameState.pendingBuildRecipeId && this.hud.activeModal === 'none') {
      const ptr = this.input.activePointer;
      const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
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

    if (!this.hud.isBlockingInput()) {
      const dir = new Phaser.Math.Vector2(
        (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0) -
          (this.keys.A.isDown || this.keys.LEFT.isDown ? 1 : 0),
        (this.keys.S.isDown || this.keys.DOWN.isDown ? 1 : 0) -
          (this.keys.W.isDown || this.keys.UP.isDown ? 1 : 0),
      );
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
        this.player.tryDash(dir);
      }
      const ptx = Math.floor(this.player.x / TILE_PX);
      const pty = Math.floor(this.player.y / TILE_PX);
      const onRoad = this.overlayGrid[pty]?.[ptx] === 'road';
      this.player.updatePlayer(dt, dir, this.isWalkable, onRoad ? 1.15 : 1);
      this.fox.updateCompanion(dt, this.player.x, this.player.y);
    }

    // Station prompts
    for (const b of this.buildings) {
      if (!b.active) continue;
      if (b.interactStation) {
        b.setPromptVisible(Math.hypot(b.x - this.player.x, b.y - this.player.y) <= 28);
      }
      b.updateBuilding(dt, {
        onMiningRodPulse: (bx, by, radiusPx, dmg) => {
          const target = this.nodes.find((n) => n.active && n.solid && Math.hypot(n.x - bx, n.y - by) <= radiusPx);
          if (target) {
            const beam = this.add.line(0, 0, bx, by - 8, target.x, target.y, 0x6ce5ff, 0.85).setOrigin(0).setDepth(6000);
            this.tweens.add({ targets: beam, alpha: 0, duration: 180, onComplete: () => beam.destroy() });
            this.hitResourceNode(target, dmg);
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
          this.awardXp(8);
          this.syncBuildingQueuesToSave();
          if (this.hud.activeModal === 'craft') {
            this.hud.render();
          }
        },
        isFertileSoil: (tx, ty) => this.overlayGrid[ty]?.[tx] === 'dirt',
      });
    }

    if (this.hud.activeModal === 'craft') {
      this.hud.updateCraftQueueInPlace();
    }

    // Enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.active) {
        this.enemies.splice(i, 1);
        continue;
      }
      e.updateEnemy(dt, this.player.x, this.player.y, this.isWalkable, {
        onMeleeHitPlayer: (dmg, dx, dy) => {
          if (this.player.takeDamage(dmg, dx, dy)) {
            spawnFloatingText(this, this.player.x, this.player.y - 14, `-${dmg}`, '#ff5e6c');
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
      });
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

    // Periodic Resource Respawn on owned islands
    this.respawnTimerMs += dt;
    if (this.respawnTimerMs >= 4200) {
      this.respawnTimerMs = 0;
      const owned = [...gameState.ownedIslands];
      const pick = Phaser.Utils.Array.GetRandom(owned);
      if (pick && this.nodes.length < owned.length * 16) {
        const [gx, gy] = pick.split(',').map(Number);
        this.trySpawnNodeOnIsland(gx, gy);
      }
    }
  }

  private detonateBomb(bx: number, by: number): void {
    SFX.playExplosion();
    this.cameras.main.shake(160, 0.008);
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
          if (this.player.takeDamage(p.damage, p.vx / spd, p.vy / spd)) {
            spawnFloatingText(this, this.player.x, this.player.y - 14, `-${p.damage}`, '#ff5e6c');
            this.checkPlayerDeath();
          }
          hit = true;
        }
      }

      if (hit || p.lifeMs <= 0) {
        p.sprite.destroy();
        this.projectiles.splice(i, 1);
      }
    }
  }

  private checkPlayerDeath(): void {
    if (gameState.hp > 0) return;
    gameState.hp = Math.round(gameState.getMaxHp() * 0.6);
    gameState.energy = gameState.getMaxEnergy();
    this.player.setPosition((2 * ISLAND_CELL_TILES + 7) * TILE_PX, (2 * ISLAND_CELL_TILES + 7) * TILE_PX);
    this.hud.showToast('Revived at Emerald Origin!');
    gameState.emit();
  }
}
