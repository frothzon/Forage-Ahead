import Phaser from 'phaser';
import { gameState } from '../core/GameState';
import { fmtKeyPrompt } from '../core/Platform';
import { SFX } from '../core/SoundFX';
import { startSceneAndWaitCreate, transitionManager } from '../core/TransitionManager';
import { computeResponsiveZoom } from '../core/ViewportScaler';
import { FamiliarCompanion, Player } from '../entities/Player';
import { spawnFloatingText } from '../entities/CombatHelpers';
import { TILE_PX } from '../data/islands';
import { dialogueBox } from '../ui/DialogueBox';
import { HudController } from '../ui/HudController';
import { CameraRig } from '../vfx/CameraRig';
import { buildHouseLayout, type HouseLayout, type HouseThemeId } from '../world/HouseLayoutBuilder';
import { DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST } from '../world/WfcRoomGraph';

const HOUSE_ROOM_W = 12;
const HOUSE_ROOM_H = 10;

export class HouseScene extends Phaser.Scene {
  private theme: HouseThemeId = 'farmer';
  private layout!: HouseLayout;
  private worldTilesW = HOUSE_ROOM_W;
  private worldTilesH = HOUSE_ROOM_H;
  private solidGrid: boolean[][] = [];

  private player!: Player;
  private fox?: FamiliarCompanion;
  private hud!: HudController;
  private cameraRig!: CameraRig;

  private exitDoor!: { x: number; y: number; glow: Phaser.GameObjects.Ellipse };
  private npcSpot!: { x: number; y: number };
  private bedSpot?: { x: number; y: number };

  private keys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    UP: Phaser.Input.Keyboard.Key;
    DOWN: Phaser.Input.Keyboard.Key;
    LEFT: Phaser.Input.Keyboard.Key;
    RIGHT: Phaser.Input.Keyboard.Key;
    E: Phaser.Input.Keyboard.Key;
    I: Phaser.Input.Keyboard.Key;
    ESC: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super('HouseScene');
  }

  init(data: { theme?: HouseThemeId }): void {
    this.theme = data?.theme ?? 'farmer';
    this.layout = buildHouseLayout(this.theme);
  }

  create(): void {
    this.buildInterior();

    this.player = new Player(this, this.exitDoor.x, this.exitDoor.y - 18);
    if (gameState.heroClass === 'Beastmaster') {
      this.fox = new FamiliarCompanion(this, this.player.x - 14, this.player.y + 4);
    }

    const worldW = this.worldTilesW * TILE_PX;
    const worldH = this.worldTilesH * TILE_PX;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setZoom(
      computeResponsiveZoom(this.scale.width, this.scale.height, {
        worldWidthPx: worldW,
        worldHeightPx: worldH,
        minZoom: 3,
      }),
    );
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.roundPixels = false;
    this.cameraRig = new CameraRig(this, { maxLookAheadPx: 8 });

    const onResize = (gameSize: Phaser.Structs.Size) => {
      this.cameras.main.setSize(gameSize.width, gameSize.height);
      this.cameras.main.setZoom(
        computeResponsiveZoom(gameSize.width, gameSize.height, {
          worldWidthPx: worldW,
          worldHeightPx: worldH,
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
      onUseHotbarItem: () => {},
      onSave: () => {
        gameState.save();
        this.hud.showToast('Saved!');
      },
      onTouchAction: () => {
        if (this.hud.isBlockingInput()) return;
        this.tryInteract();
      },
      onTouchDash: () => {
        if (this.hud.isBlockingInput()) return;
        const tv = this.hud.getTouchMoveVector();
        this.player.tryDash(new Phaser.Math.Vector2(tv.x, tv.y));
      },
    });
    this.hud.showToast(`${this.layout.houseName} (${this.layout.rooms.length} Rooms)`);
    this.setupInput();
  }

  private buildInterior(): void {
    const { minGx, maxGx, minGy, maxGy } = this.layout.graph.bounds;
    this.worldTilesW = (maxGx - minGx + 1) * HOUSE_ROOM_W;
    this.worldTilesH = (maxGy - minGy + 1) * HOUSE_ROOM_H;
    this.solidGrid = Array.from({ length: this.worldTilesH }, () => Array(this.worldTilesW).fill(true));
    this.bedSpot = undefined;

    const doorX = [5, 6];
    const doorY = [4, 5];

    for (const r of this.layout.rooms) {
      const ox = (r.gx - minGx) * HOUSE_ROOM_W;
      const oy = (r.gy - minGy) * HOUSE_ROOM_H;
      for (let ly = 1; ly < HOUSE_ROOM_H - 1; ly++) {
        for (let lx = 1; lx < HOUSE_ROOM_W - 1; lx++) {
          this.solidGrid[oy + ly][ox + lx] = false;
        }
      }
      if ((r.mask & DIR_EAST) !== 0) for (const ly of doorY) this.solidGrid[oy + ly][ox + HOUSE_ROOM_W - 1] = false;
      if ((r.mask & DIR_WEST) !== 0) for (const ly of doorY) this.solidGrid[oy + ly][ox] = false;
      if ((r.mask & DIR_NORTH) !== 0) for (const lx of doorX) this.solidGrid[oy][ox + lx] = false;
      if ((r.mask & DIR_SOUTH) !== 0) for (const lx of doorX) this.solidGrid[oy + HOUSE_ROOM_H - 1][ox + lx] = false;
    }

    for (let ty = 0; ty < this.worldTilesH; ty++) {
      for (let tx = 0; tx < this.worldTilesW; tx++) {
        const isWall = this.solidGrid[ty][tx];
        this.add
          .image(tx * TILE_PX + 8, ty * TILE_PX + 8, 'tileset/Stone tile')
          .setTint(isWall ? this.layout.wallTint : this.layout.floorTint)
          .setDepth(0);
      }
    }

    for (const r of this.layout.rooms) {
      const ox = (r.gx - minGx) * HOUSE_ROOM_W;
      const oy = (r.gy - minGy) * HOUSE_ROOM_H;
      const cx = (ox + HOUSE_ROOM_W / 2) * TILE_PX;
      const cy = (oy + HOUSE_ROOM_H / 2) * TILE_PX;

      // Room label
      this.add
        .text(cx, (oy + 1.2) * TILE_PX, r.title, {
          fontSize: '7px',
          fontStyle: 'bold',
          color: '#fff6e5',
          stroke: '#1b1109',
          strokeThickness: 2,
          resolution: 4,
        })
        .setOrigin(0.5)
        .setDepth(6000);

      // Cozy rug in room center
      this.add.rectangle(cx, cy, 44, 28, this.layout.accentTint, 0.25).setStrokeStyle(1, 0xfff6e5, 0.35).setDepth(1);

      if (r.role === 'foyer') {
        const ex = cx;
        const ey = (oy + HOUSE_ROOM_H - 1.5) * TILE_PX;
        const exitGlow = this.add.ellipse(ex, ey + 4, 22, 16, 0xffe066, 0.22).setDepth(ey - 1);
        this.exitDoor = { x: ex, y: ey, glow: exitGlow };
        this.add.image(ex, ey + 4, 'sprout/house_door', 0).setDepth(ey);
        this.add
          .text(ex, ey - 10, fmtKeyPrompt('E', 'Exit'), {
            fontSize: '7px',
            fontStyle: 'bold',
            color: '#ffe066',
            stroke: '#1b1109',
            strokeThickness: 2,
            resolution: 4,
          })
          .setOrigin(0.5)
          .setDepth(7000);

        this.npcSpot = { x: cx - 20, y: cy - 8 };
        this.add.sprite(this.npcSpot.x, this.npcSpot.y, this.layout.npcSpriteKey, 0).setDepth(this.npcSpot.y);
        this.add
          .text(this.npcSpot.x, this.npcSpot.y - 16, fmtKeyPrompt('E', this.layout.npcName.split(' ')[0]), {
            fontSize: '7px',
            fontStyle: 'bold',
            color: '#a8f5b8',
            stroke: '#1b1109',
            strokeThickness: 2,
            resolution: 4,
          })
          .setOrigin(0.5)
          .setDepth(7000);
      } else if (r.role === 'workshop') {
        this.add.image((ox + 2.5) * TILE_PX, (oy + 2.5) * TILE_PX, 'extras/Bonfire', 0).setDepth(oy * TILE_PX + 40);
        this.add.sprite((ox + HOUSE_ROOM_W - 2.5) * TILE_PX, (oy + 2.5) * TILE_PX, 'objects/Chest_small', 0).setDepth(oy * TILE_PX + 40);
        this.add.image(cx, cy - 12, 'sprout/furniture', 2).setDepth(cy - 12);
      } else if (r.role === 'bedroom') {
        const bx = (ox + HOUSE_ROOM_W - 3) * TILE_PX;
        const by = (oy + 3) * TILE_PX;
        this.bedSpot = { x: bx, y: by };
        this.add.image(bx, by, 'sprout/furniture', 6).setDepth(by);
        this.add
          .text(bx, by - 14, fmtKeyPrompt('E', 'Rest'), {
            fontSize: '7px',
            fontStyle: 'bold',
            color: '#9ee6ff',
            stroke: '#1b1109',
            strokeThickness: 2,
            resolution: 4,
          })
          .setOrigin(0.5)
          .setDepth(7000);
      }
    }
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
      E: kb.addKey('E'),
      I: kb.addKey('I'),
      ESC: kb.addKey('ESC'),
    };
    kb.on('keydown-I', () => this.hud.toggleModal('inventory'));
    kb.on('keydown-ESC', () => {
      if (this.hud.activeModal !== 'none') this.hud.closeModal();
    });
  }

  private tryInteract(): boolean {
    if (Math.hypot(this.exitDoor.x - this.player.x, this.exitDoor.y - this.player.y) <= 28) {
      if (transitionManager.isActive) return true;
      SFX.playPortalWarp();
      void transitionManager.transitionTo({
        onMidpoint: async () => {
          this.hud.destroy();
          SFX.setMusicSituation('overworld');
          await startSceneAndWaitCreate(this, 'OverworldScene');
        },
      });
      return true;
    }
    if (Math.hypot(this.npcSpot.x - this.player.x, this.npcSpot.y - this.player.y) <= 30) {
      dialogueBox.show({
        speaker: this.layout.npcName,
        portraitKey: this.layout.npcSpriteKey,
        subtitle: this.layout.houseName,
        lines: [
          `Welcome to my {c:#ffe066}${this.layout.houseName}{/c}! Make yourself at home, hero.`,
          `Each room was built to keep our island thriving. Feel free to rest whenever you need!`,
        ],
      });
      return true;
    }
    if (this.bedSpot && Math.hypot(this.bedSpot.x - this.player.x, this.bedSpot.y - this.player.y) <= 28) {
      gameState.hp = gameState.getMaxHp();
      gameState.energy = gameState.getMaxEnergy();
      gameState.emitVitals();
      SFX.playLevelUp();
      spawnFloatingText(this, this.player.x, this.player.y - 16, 'Rested! Full HP & EN', '#8ef5a7');
      return true;
    }
    return false;
  }

  private isWalkable = (wx: number, wy: number): boolean => {
    const tx = Math.floor(wx / TILE_PX);
    const ty = Math.floor(wy / TILE_PX);
    if (tx < 0 || ty < 0 || tx >= this.worldTilesW || ty >= this.worldTilesH) return false;
    return !this.solidGrid[ty][tx];
  };

  update(_time: number, dtMs: number): void {
    if (transitionManager.isActive) return;
    const dt = Math.min(dtMs, 50);

    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) {
      this.tryInteract();
    }

    if (!this.hud.isBlockingInput()) {
      const tv = this.hud.getTouchMoveVector();
      const dir = new Phaser.Math.Vector2(
        (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0) -
          (this.keys.A.isDown || this.keys.LEFT.isDown ? 1 : 0) +
          tv.x,
        (this.keys.S.isDown || this.keys.DOWN.isDown ? 1 : 0) -
          (this.keys.W.isDown || this.keys.UP.isDown ? 1 : 0) +
          tv.y,
      );
      this.player.updatePlayer(dt, dir, this.isWalkable, 1, 0xd9b382, 'stone');
      this.cameraRig.setLookAhead(dir.x, dir.y, 6);
      this.cameraRig.update(dt);
      if (this.fox) {
        this.fox.updateCompanion(dt, this.player.x, this.player.y, {
          findTarget: () => null,
          onBite: () => {},
          onForage: () => {},
        });
      }
    }

    const nearExit = Math.hypot(this.exitDoor.x - this.player.x, this.exitDoor.y - this.player.y) <= 28;
    this.exitDoor.glow
      .setFillStyle(0xffe066, nearExit ? 0.56 : 0.2)
      .setScale(nearExit ? 1.25 : 1);
    if (nearExit) {
      this.hud.setTouchActionHint('EXIT');
    } else if (Math.hypot(this.npcSpot.x - this.player.x, this.npcSpot.y - this.player.y) <= 30) {
      this.hud.setTouchActionHint('TALK');
    } else if (this.bedSpot && Math.hypot(this.bedSpot.x - this.player.x, this.bedSpot.y - this.player.y) <= 28) {
      this.hud.setTouchActionHint('REST');
    } else {
      this.hud.setTouchActionHint(null);
    }
  }
}
