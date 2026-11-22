import Phaser from 'phaser';
import { gameState } from '../core/GameState';
import { fmtKeyPrompt, isMobileTouchDevice } from '../core/Platform';
import { SFX } from '../core/SoundFX';
import { startSceneAndWaitCreate, transitionManager } from '../core/TransitionManager';
import { computeResponsiveZoom } from '../core/ViewportScaler';
import { ITEMS } from '../data/items';
import { DUNGEON_THEME_VISUALS } from '../data/dungeonTilesets';
import { TILE_PX } from '../data/islands';
import {
  crumbleStoneBlocks,
  drawSlashArc,
  getWeaponSlashColor,
  spawnBurstParticles,
  spawnDeathBurst,
  spawnDirectionalSparks,
  spawnFloatingText,
  spawnShockwaveRing,
} from '../entities/CombatHelpers';
import { DungeonChest } from '../entities/DungeonChest';
import { DungeonProp } from '../entities/DungeonProp';
import { Enemy } from '../entities/Enemy';
import { LootDrop } from '../entities/LootDrop';
import { FamiliarCompanion, Player } from '../entities/Player';
import { selectBestAimTarget, type AimCandidate } from '../entities/targeting';
import { dialogueBox } from '../ui/DialogueBox';
import { HudController } from '../ui/HudController';
import { revealSequence } from '../ui/RevealSequence';
import { CameraRig } from '../vfx/CameraRig';
import { DungeonAtmosphere } from '../vfx/DungeonAtmosphere';
import { detailDungeonRoom } from '../world/DungeonDetailer';
import { LightingSystem, type PointLightSource } from '../world/LightingSystem';
import { DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST } from '../world/WfcRoomGraph';

const ROOM_W = 16;
const ROOM_H = 12;
const WORLD_W = ROOM_W * 2; // 32
const WORLD_H = ROOM_H * 2; // 24

interface TutorialChestEntry {
  id: 'pickaxe' | 'sword' | 'shovel' | 'rod' | 'vault_key';
  chest: DungeonChest;
}

export class TutorialDungeonScene extends Phaser.Scene {
  private solidGrid: boolean[][] = [];
  private player!: Player;
  private fox?: FamiliarCompanion;
  private hud!: HudController;
  private cameraRig!: CameraRig;
  private lighting!: LightingSystem;
  private atmosphere!: DungeonAtmosphere;
  private torchLights: PointLightSource[] = [];

  private enemies: Enemy[] = [];
  private drops: LootDrop[] = [];
  private breakables: DungeonProp[] = [];
  private chests: TutorialChestEntry[] = [];

  private room1Sigil!: { x: number; y: number; spr: Phaser.GameObjects.Image; active: boolean };
  private room3Sigils: Array<{ x: number; y: number; spr: Phaser.GameObjects.Image; active: boolean }> = [];
  private room3PuzzleSolved = false;

  private r1ToR2Open = false;
  private r1ToR2Sprites: Phaser.GameObjects.Image[] = [];

  private ambushTriggered = false;
  private ambushCleared = false;
  private ambushDoorSprites: Phaser.GameObjects.Image[] = [];

  private hasVaultKey = false;
  private exitUnlocked = false;
  private exitDoor!: {
    x: number;
    y: number;
    spr: Phaser.GameObjects.Image;
    glow: Phaser.GameObjects.Ellipse;
    label: Phaser.GameObjects.Text;
  };

  private skipBtnEl?: HTMLButtonElement;

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
    super('TutorialDungeonScene');
  }

  create(): void {
    this.enemies = [];
    this.drops = [];
    this.breakables = [];
    this.chests = [];
    this.room3Sigils = [];
    this.r1ToR2Sprites = [];
    this.ambushDoorSprites = [];
    this.room3PuzzleSolved = false;
    this.r1ToR2Open = false;
    this.ambushTriggered = false;
    this.ambushCleared = false;
    this.hasVaultKey = false;
    this.exitUnlocked = false;
    this.torchLights = [];

    this.buildTutorialMap();
    this.lighting = new LightingSystem(this);
    this.lighting.timeOfDay = 0.88;
    this.lighting.paused = true;
    this.atmosphere = new DungeonAtmosphere(this, 0xe8dec8, 34);
    this.player = new Player(this, 8 * TILE_PX, 6 * TILE_PX);
    if (gameState.heroClass === 'Beastmaster') {
      this.fox = new FamiliarCompanion(this, this.player.x - 14, this.player.y + 6);
    }

    const worldW = WORLD_W * TILE_PX;
    const worldH = WORLD_H * TILE_PX;
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
    this.cameraRig = new CameraRig(this, { maxLookAheadPx: 10 });

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
      this.skipBtnEl?.remove();
      this.skipBtnEl = undefined;
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
        if (this.tryInteract()) return;
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
    });

    this.mountSkipButton();
    this.setupInput();
    SFX.setMusicPaused(false);
    SFX.setMusicSituation('dungeon');

    const moveHint = isMobileTouchDevice()
      ? 'Use the joystick to move and tap ACT near the glowing chest.'
      : 'Use WASD / Arrows to move and Left-Click or [E] near the glowing chest.';
    dialogueBox.show({
      speaker: 'Awakening Vault',
      subtitle: 'Tutorial',
      lines: [
        'The exit above is {c:#ffe066}locked{/c}! Recover your starter gear and find the {c:#ffd95a}Vault Key{/c} to escape.',
        moveHint,
      ],
    });
  }

  private mountSkipButton(): void {
    const root = document.getElementById('hud-root');
    if (!root) return;
    const btn = document.createElement('button');
    btn.className = 'hud-btn tan hud-interactive';
    btn.textContent = 'Skip Tutorial';
    btn.style.cssText = 'position:absolute; top:56px; right:10px; z-index:22; padding:3px 9px; font-size:11px;';
    btn.onclick = () => this.skipTutorialToOverworld();
    root.appendChild(btn);
    this.skipBtnEl = btn;
  }

  private skipTutorialToOverworld(): void {
    if (transitionManager.isActive) return;
    const starters: Array<[string, number, number]> = [
      ['pickaxe', 1, 0],
      ['sword', 1, 1],
      ['shovel', 1, 2],
      ['fishing_rod', 1, 3],
    ];
    for (const [id, count, slot] of starters) {
      if ((gameState.inventory[id] ?? 0) <= 0) gameState.addItem(id, count);
      if (!gameState.hotbar.includes(id)) gameState.hotbar[slot] = id;
    }
    if (!gameState.equipment.tool) gameState.equipment.tool = 'pickaxe';
    if (!gameState.equipment.weapon) gameState.equipment.weapon = 'sword';
    if ((gameState.inventory.wood ?? 0) < 6) gameState.addItem('wood', 6 - (gameState.inventory.wood ?? 0));
    if ((gameState.inventory.stone ?? 0) < 4) gameState.addItem('stone', 4 - (gameState.inventory.stone ?? 0));
    this.finishAndEnterOverworld();
  }

  private finishAndEnterOverworld(): void {
    if (transitionManager.isActive) return;
    gameState.completeTutorial();
    gameState.playerPos = undefined;
    gameState.save();
    SFX.playPortalWarp();
    void transitionManager.transitionTo({
      onMidpoint: async () => {
        this.skipBtnEl?.remove();
        this.skipBtnEl = undefined;
        this.hud.destroy();
        SFX.setMusicSituation('overworld');
        await startSceneAndWaitCreate(this, 'OverworldScene');
      },
    });
  }

  private buildTutorialMap(): void {
    this.solidGrid = Array.from({ length: WORLD_H }, () => Array(WORLD_W).fill(true));
    const carveRoom = (rx: number, ry: number) => {
      const ox = rx * ROOM_W;
      const oy = ry * ROOM_H;
      for (let ly = 1; ly < ROOM_H - 1; ly++) {
        for (let lx = 1; lx < ROOM_W - 1; lx++) {
          this.solidGrid[oy + ly][ox + lx] = false;
        }
      }
    };
    carveRoom(0, 0); // Room 1
    carveRoom(1, 0); // Room 2
    carveRoom(1, 1); // Room 3
    carveRoom(0, 1); // Room 4 (shortcut back to Room 1)

    // Doorways: R1 <-> R2 (East), R2 <-> R3 (South), R3 <-> R4 (West), R4 <-> R1 (North)
    for (const ly of [5, 6]) {
      this.solidGrid[ly][ROOM_W - 1] = false;
      this.solidGrid[ly][ROOM_W] = false;
      this.solidGrid[ROOM_H + ly][ROOM_W - 1] = false;
      this.solidGrid[ROOM_H + ly][ROOM_W] = false;
    }
    for (const lx of [7, 8]) {
      this.solidGrid[ROOM_H - 1][ROOM_W + lx] = false;
      this.solidGrid[ROOM_H][ROOM_W + lx] = false;
      this.solidGrid[ROOM_H - 1][lx] = false;
      this.solidGrid[ROOM_H][lx] = false;
    }

    const vis = DUNGEON_THEME_VISUALS.tutorial;
    for (let ty = 0; ty < WORLD_H; ty++) {
      for (let tx = 0; tx < WORLD_W; tx++) {
        const isWall = this.solidGrid[ty][tx];
        if (!isWall) continue;
        const belowFloor = ty + 1 < WORLD_H && !this.solidGrid[ty + 1][tx];
        this.add
          .image(tx * TILE_PX + 8, ty * TILE_PX + 8, vis.sheet, belowFloor ? vis.wallFrontFrame : vis.wallVoidFrame)
          .setTint(vis.wallTint)
          .setDepth(belowFloor ? 0 : ty * TILE_PX + 15);
      }
    }

    // Detail all 4 rooms with CuteRPG floors, rugs, torches, and destructibles
    const roomConfigs = [
      { rx: 0, ry: 0, mask: DIR_EAST | DIR_SOUTH, role: 'start' as const, reserved: [{ lx: 5, ly: 5 }, { lx: 12, ly: 6 }, { lx: 8, ly: 2 }] },
      { rx: 1, ry: 0, mask: DIR_WEST | DIR_SOUTH, role: 'combat' as const, reserved: [{ lx: 4, ly: 4 }, { lx: 10, ly: 4 }, { lx: 10, ly: 8 }] },
      { rx: 1, ry: 1, mask: DIR_NORTH | DIR_WEST, role: 'key_puzzle' as const, reserved: [{ lx: 4, ly: 4 }, { lx: 11, ly: 4 }, { lx: 8, ly: 8 }, { lx: 5, ly: 8 }, { lx: 11, ly: 8 }] },
      { rx: 0, ry: 1, mask: DIR_NORTH | DIR_EAST, role: 'treasure' as const, reserved: [] },
    ];
    for (const rc of roomConfigs) {
      const ox = rc.rx * ROOM_W;
      const oy = rc.ry * ROOM_H;
      const detail = detailDungeonRoom({
        roomW: ROOM_W,
        roomH: ROOM_H,
        mask: rc.mask,
        role: rc.role,
        theme: vis,
        seed: 7001 + rc.rx * 31 + rc.ry * 97,
        reservedTiles: rc.reserved,
        propCount: 4,
      });
      for (const f of detail.floors) {
        this.add
          .image((ox + f.lx) * TILE_PX + 8, (oy + f.ly) * TILE_PX + 8, vis.sheet, f.frame)
          .setTint(f.tint)
          .setDepth(0);
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
        this.torchLights.push({ x: txPx, y: tyPx, radius: 44, color: 0xffb85c, intensity: 1, flicker: true });
      }
      for (const p of detail.props) {
        const px = (ox + p.lx) * TILE_PX + 8;
        const py = (oy + p.ly) * TILE_PX + 8;
        this.breakables.push(new DungeonProp(this, px, py, p.spec));
      }
    }
    // Floor tiles on doorway passages
    for (const ly of [5, 6]) {
      for (const tx of [ROOM_W - 1, ROOM_W]) {
        this.add.image(tx * TILE_PX + 8, ly * TILE_PX + 8, vis.sheet, vis.floorFrames[0]).setTint(vis.floorTint).setDepth(0);
        this.add.image(tx * TILE_PX + 8, (ROOM_H + ly) * TILE_PX + 8, vis.sheet, vis.floorFrames[0]).setTint(vis.floorTint).setDepth(0);
      }
    }
    for (const lx of [7, 8]) {
      for (const ty of [ROOM_H - 1, ROOM_H]) {
        this.add.image((ROOM_W + lx) * TILE_PX + 8, ty * TILE_PX + 8, vis.sheet, vis.floorFrames[0]).setTint(vis.floorTint).setDepth(0);
        this.add.image(lx * TILE_PX + 8, ty * TILE_PX + 8, vis.sheet, vis.floorFrames[0]).setTint(vis.floorTint).setDepth(0);
      }
    }

    // --- ROOM 1: Locked Exit Flush on North (South-Facing) Wall + Pickaxe Chest + Stone Block Barrier ---
    const ex = 8 * TILE_PX;
    const wallCenterY = 8; // Exact center of Row 0 (North wall)
    const exitGlow = this.add.ellipse(ex, wallCenterY, 24, 16, 0xff9b5a, 0.22).setDepth(wallCenterY + 1);
    const exitSpr = this.add
      .image(ex, TILE_PX, 'tileset/Door (closed)')
      .setOrigin(0.5, 0.94)
      .setScale(0.82)
      .setDepth(wallCenterY + 2);
    const exitLbl = this.add
      .text(ex, 1.55 * TILE_PX, 'Exit Locked (Need Vault Key)', {
        fontSize: '7px',
        fontStyle: 'bold',
        color: '#ffd95a',
        stroke: '#000',
        strokeThickness: 2,
        resolution: 4,
      })
      .setOrigin(0.5)
      .setDepth(7000);
    this.exitDoor = { x: ex, y: 1.2 * TILE_PX, spr: exitSpr, glow: exitGlow, label: exitLbl };

    this.addChest('pickaxe', 5 * TILE_PX + 8, 5 * TILE_PX + 8, 'Pickaxe');

    // Seal R1->R2 horizontal passage with stone blocks (NOT doors) until sigil is stepped on
    const stoneBlockFrame = 11 * 32 + 6;
    for (const ly of [5, 6]) {
      for (const tx of [ROOM_W - 1, ROOM_W]) {
        this.solidGrid[ly][tx] = true;
        const block = this.add
          .image(tx * TILE_PX + 8, ly * TILE_PX + 8, 'cuterpg/dungeon', stoneBlockFrame)
          .setDepth(ly * TILE_PX + 8);
        this.r1ToR2Sprites.push(block);
      }
    }

    const s1x = 12 * TILE_PX + 8;
    const s1y = 6 * TILE_PX;
    this.room1Sigil = {
      x: s1x,
      y: s1y,
      spr: this.add.image(s1x, s1y, 'ui_icons/sigil_off').setDepth(2),
      active: false,
    };

    // --- ROOM 2: Sword Chest + Ambush Slimes ---
    this.addChest('sword', (ROOM_W + 4) * TILE_PX + 8, 4 * TILE_PX + 8, 'Sword');
    for (const [ex2, ey2] of [
      [ROOM_W + 10, 4],
      [ROOM_W + 10, 8],
    ]) {
      const slime = new Enemy(this, 'Slime', ex2 * TILE_PX + 8, ey2 * TILE_PX + 8);
      slime.maxHp = 16;
      slime.hp = 16;
      this.enemies.push(slime);
    }

    // --- ROOM 3: Shovel, Fishing Rod, 2 Sigils -> Vault Key Chest ---
    this.addChest('shovel', (ROOM_W + 4) * TILE_PX + 8, (ROOM_H + 4) * TILE_PX + 8, 'Shovel');
    this.addChest('rod', (ROOM_W + 11) * TILE_PX + 8, (ROOM_H + 4) * TILE_PX + 8, 'Fishing Rod');
    this.addChest('vault_key', (ROOM_W + 8) * TILE_PX, (ROOM_H + 8) * TILE_PX, 'Vault Key', true);

    for (const [lx, ly] of [
      [ROOM_W + 5, ROOM_H + 8],
      [ROOM_W + 11, ROOM_H + 8],
    ]) {
      const sx = lx * TILE_PX + 8;
      const sy = ly * TILE_PX + 8;
      this.room3Sigils.push({
        x: sx,
        y: sy,
        spr: this.add.image(sx, sy, 'ui_icons/sigil_off').setDepth(2),
        active: false,
      });
    }
  }

  private addChest(id: TutorialChestEntry['id'], x: number, y: number, title: string, locked = false): void {
    this.chests.push({
      id,
      chest: new DungeonChest(this, { x, y, title, locked }),
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
      I: kb.addKey('I'),
      K: kb.addKey('K'),
      P: kb.addKey('P'),
      ESC: kb.addKey('ESC'),
    };
    kb.on('keydown-I', () => this.hud.toggleModal('inventory'));
    kb.on('keydown-K', () => this.hud.toggleModal('skills'));
    kb.on('keydown-P', () => this.hud.toggleModal('progress'));
    kb.on('keydown-ESC', () => {
      if (this.hud.activeModal !== 'none') this.hud.closeModal();
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
    SFX.playEat();
    spawnBurstParticles(this, this.player.x, this.player.y - 6, 0x7ef59a, 6);
    gameState.emitVitals();
  }

  private grantStarterGear(itemId: string, hotbarSlot: number, equipSlot?: 'tool' | 'weapon'): void {
    gameState.grantStarterTool(itemId, hotbarSlot, equipSlot);
    const def = ITEMS[itemId];
    if (def) {
      revealSequence.show({
        title: `ACQUIRED ${def.name.toUpperCase()}!`,
        subtitle: def.description,
        iconKey: def.iconKey,
        accentColor: '#ffe066',
      });
    }
  }

  private tryInteract(): boolean {
    if (Math.hypot(this.exitDoor.x - this.player.x, this.exitDoor.y - this.player.y) <= 28) {
      if (this.exitUnlocked) {
        this.finishAndEnterOverworld();
        return true;
      }
      if (this.hasVaultKey) {
        this.exitUnlocked = true;
        this.exitDoor.spr.setTexture('tileset/Door (open)').clearTint();
        this.exitDoor.label.setText(fmtKeyPrompt('E', 'Exit to Emerald Origin')).setColor('#7ef29d');
        SFX.playSecretJingle();
        this.cameraRig.addTrauma(0.24);
        spawnShockwaveRing(this, this.exitDoor.x, this.exitDoor.y, 0xffd95a, 44, 380);
        this.hud.showToast('Exit Unlocked! Step through to Emerald Origin!');
        return true;
      }
      this.hud.showToast('Exit Locked — Find the Vault Key!');
      return true;
    }

    for (const entry of this.chests) {
      const ch = entry.chest;
      if (ch.opened || Math.hypot(ch.x - this.player.x, ch.y - this.player.y) > 28) continue;
      if (ch.locked) {
        this.hud.showToast('Chest Sealed — Step on both floor sigils!');
        return true;
      }

      ch.playOpenJuice();
      this.cameraRig.zoomPunch(0.035, 110);

      if (entry.id === 'pickaxe') {
        this.grantStarterGear('pickaxe', 0, 'tool');
        gameState.unlockMenuTab('inventory');
        this.hud.showToast('Menu Unlocked: Character! Smash the crates East to proceed.');
      } else if (entry.id === 'sword') {
        this.grantStarterGear('sword', 1, 'weapon');
        this.hud.showToast('Sword equipped! Defeat the slimes ahead!');
      } else if (entry.id === 'shovel') {
        this.grantStarterGear('shovel', 2);
      } else if (entry.id === 'rod') {
        this.grantStarterGear('fishing_rod', 3);
      } else if (entry.id === 'vault_key') {
        this.hasVaultKey = true;
        gameState.unlockMenuTab('skills', 'quests');
        SFX.playLevelUp();
        revealSequence.show({
          title: 'VAULT KEY FOUND!',
          subtitle: 'Skills & Quests unlocked! Head West through the shortcut to the Exit.',
          badgeText: '🔑',
          accentColor: '#ffd95a',
        });
      }
      return true;
    }
    return false;
  }

  private shatterBreakable(bp: DungeonProp, dirX = 0, dirY = 0): void {
    if (!bp.hit(1, dirX, dirY)) return;
    for (const d of bp.spec.drops) {
      if (Math.random() <= d.chance) {
        const count = Phaser.Math.Between(d.count[0], d.count[1]);
        this.drops.push(new LootDrop(this, bp.x, bp.y, d.itemId, count, Boolean(d.isCoin)));
      }
    }
  }

  private handleAttack(wx: number, wy: number): void {
    if (this.tryInteract()) return;
    const itemId = gameState.hotbar[gameState.selectedHotbarIndex] || gameState.equipment.weapon || 'pickaxe';
    const def = ITEMS[itemId];
    if (!def) return;
    const dx = wx - this.player.x;
    const dy = wy - this.player.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    if (!this.player.startAction('melee', def.cooldownMs ?? 260, nx, ny, 170)) return;
    const range = def.range ?? 40;
    drawSlashArc(this, this.player.x, this.player.y - 4, Math.atan2(ny, nx), range, getWeaponSlashColor(itemId));
    SFX.playSwing();

    type Tgt = { kind: 'enemy'; enemy: Enemy } | { kind: 'breakable'; bp: DungeonProp };
    const candidates: Array<AimCandidate<Tgt>> = [];
    for (const e of this.enemies) {
      if (e.active && !e.isDead) candidates.push({ item: { kind: 'enemy', enemy: e }, x: e.x, y: e.y, priority: 3 });
    }
    for (const bp of this.breakables) {
      if (!bp.broken) candidates.push({ item: { kind: 'breakable', bp }, x: bp.x, y: bp.y, priority: 2 });
    }
    const aimed = selectBestAimTarget(this.player.x, this.player.y, nx, ny, range + 10, candidates);
    if (aimed?.item.kind === 'breakable') {
      this.shatterBreakable(aimed.item.bp, nx, ny);
    } else if (aimed?.item.kind === 'enemy') {
      const dmg = gameState.getWeaponDamage(itemId);
      const killed = aimed.item.enemy.takeDamage(dmg, nx, ny, this.isWalkable);
      SFX.playHit();
      spawnDirectionalSparks(this, aimed.item.enemy.x, aimed.item.enemy.y - 4, Math.atan2(ny, nx), 0xffffff, 5);
      spawnFloatingText(this, aimed.item.enemy.x, aimed.item.enemy.y - 16, `${dmg}`, '#ffffff', '8px', 'damage');
      if (killed) {
        spawnDeathBurst(this, aimed.item.enemy.x, aimed.item.enemy.y, aimed.item.enemy.def.id, false);
        SFX.playEnemyDeath();
        gameState.addXp(aimed.item.enemy.def.xp);
      }
    }
  }

  private isWalkable = (wx: number, wy: number): boolean => {
    const tx = Math.floor(wx / TILE_PX);
    const ty = Math.floor(wy / TILE_PX);
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return false;
    if (this.solidGrid[ty][tx]) return false;
    for (const entry of this.chests) {
      if (Math.hypot(wx - entry.chest.x, wy - entry.chest.y) < entry.chest.collisionRadius) return false;
    }
    for (const bp of this.breakables) {
      if (!bp.broken && Math.hypot(wx - bp.x, wy - bp.y) < bp.collisionRadius) return false;
    }
    return true;
  };

  update(_time: number, dtMs: number): void {
    if (transitionManager.isActive) return;
    const dt = Math.min(dtMs, 50);

    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) {
      this.tryInteract();
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
        this.player.tryDash(dir);
      }
      this.player.updatePlayer(dt, dir, this.isWalkable, 1, 0xa8a8b8, 'stone');
      this.cameraRig.setLookAhead(dir.x, dir.y, 10);
      this.cameraRig.update(dt);
      if (this.fox) {
        this.fox.updateCompanion(dt, this.player.x, this.player.y, {
          findTarget: () => null,
          onBite: () => {},
          onForage: () => {},
        });
      }
    }

    // Room 1 Sigil crumbles East stone blocks to dust with camera focus + secret jingle
    if (!this.r1ToR2Open && Math.hypot(this.room1Sigil.x - this.player.x, this.room1Sigil.y - this.player.y) <= 13) {
      this.r1ToR2Open = true;
      this.room1Sigil.active = true;
      this.room1Sigil.spr.setTexture('ui_icons/sigil_on');
      SFX.playSwitch();
      spawnShockwaveRing(this, this.room1Sigil.x, this.room1Sigil.y, 0x7ac7ff, 26, 280);
      this.cameraRig.focusOn(ROOM_W * TILE_PX, 6 * TILE_PX, this.player, {
        onArrive: () => {
          crumbleStoneBlocks(this, this.r1ToR2Sprites, 0xc9c2b8);
          this.r1ToR2Sprites = [];
          for (const ly of [5, 6]) {
            this.solidGrid[ly][ROOM_W - 1] = false;
            this.solidGrid[ly][ROOM_W] = false;
          }
          SFX.playSecretJingle();
          this.cameraRig.addTrauma(0.22);
          this.hud.showToast('Path Cleared! Grab the Sword ahead.');
        },
      });
    }

    // Room 2 Combat Lock-In (stone blocks, only if player is well inside Room 2 and slimes remain)
    if (
      !this.ambushTriggered &&
      !this.ambushCleared &&
      this.player.x > (ROOM_W + 2.5) * TILE_PX &&
      this.player.y < (ROOM_H - 1) * TILE_PX &&
      this.enemies.some((e) => e.active && !e.isDead)
    ) {
      this.ambushTriggered = true;
      const stoneBlockFrame = 11 * 32 + 6;
      for (const ly of [5, 6]) {
        for (const tx of [ROOM_W - 1, ROOM_W]) {
          this.solidGrid[ly][tx] = true;
          this.ambushDoorSprites.push(
            this.add.image(tx * TILE_PX + 8, ly * TILE_PX + 8, 'cuterpg/dungeon', stoneBlockFrame).setDepth(ly * TILE_PX + 8),
          );
        }
      }
      for (const lx of [7, 8]) {
        for (const ty of [ROOM_H - 1, ROOM_H]) {
          this.solidGrid[ty][ROOM_W + lx] = true;
          this.ambushDoorSprites.push(
            this.add.image((ROOM_W + lx) * TILE_PX + 8, ty * TILE_PX + 8, 'cuterpg/dungeon', stoneBlockFrame).setDepth(ty * TILE_PX + 8),
          );
        }
      }
      SFX.playGateUnlock();
      this.cameraRig.addTrauma(0.2);
      this.hud.showToast('Ambush! Defeat both Slimes to crumble the blocks!');
    }

    if (this.ambushTriggered && !this.ambushCleared && this.enemies.every((e) => !e.active || e.isDead)) {
      this.ambushCleared = true;
      this.cameraRig.focusOn((ROOM_W + 8) * TILE_PX, ROOM_H * TILE_PX, this.player, {
        onArrive: () => {
          crumbleStoneBlocks(this, this.ambushDoorSprites, 0xc9c2b8);
          this.ambushDoorSprites = [];
          for (const ly of [5, 6]) {
            this.solidGrid[ly][ROOM_W - 1] = false;
            this.solidGrid[ly][ROOM_W] = false;
          }
          for (const lx of [7, 8]) {
            this.solidGrid[ROOM_H - 1][ROOM_W + lx] = false;
            this.solidGrid[ROOM_H][ROOM_W + lx] = false;
          }
          SFX.playSecretJingle();
          gameState.unlockMenuTab('craft');
          this.hud.showToast("Menu Unlocked: Craft! Head South into Explorer's Alcove.");
        },
      });
    }

    for (const entry of this.chests) entry.chest.update(dt);

    // Proximity reticle, exit door glow & mobile ACT hint for chests and exit door
    const nearExit = Math.hypot(this.exitDoor.x - this.player.x, this.exitDoor.y - this.player.y) <= 28;
    const exitColor = this.exitUnlocked ? 0x7ef29d : this.hasVaultKey ? 0xffe066 : 0xff9b5a;
    this.exitDoor.glow
      .setFillStyle(exitColor, nearExit ? 0.55 : 0.2)
      .setScale(nearExit ? 1.25 : 1);

    let hintSet = false;
    if (nearExit) {
      this.hud.setTouchActionHint(this.exitUnlocked ? 'EXIT' : this.hasVaultKey ? 'UNLOCK' : 'LOCKED');
      hintSet = true;
    } else {
      for (const entry of this.chests) {
        const ch = entry.chest;
        if (!ch.opened && Math.hypot(ch.x - this.player.x, ch.y - this.player.y) <= 28) {
          this.hud.setTouchActionHint(ch.locked ? 'SEALED' : 'OPEN');
          hintSet = true;
          break;
        }
      }
    }
    if (!hintSet) {
      this.hud.setTouchActionHint(null);
    }

    // Room 3 Sigils -> unseal Vault Key chest
    if (!this.room3PuzzleSolved) {
      for (const sw of this.room3Sigils) {
        if (!sw.active && Math.hypot(sw.x - this.player.x, sw.y - this.player.y) <= 13) {
          sw.active = true;
          sw.spr.setTexture('ui_icons/sigil_on');
          SFX.playSwitch();
          spawnShockwaveRing(this, sw.x, sw.y, 0x7ac7ff, 22, 260);
        }
      }
      if (this.room3Sigils.length > 0 && this.room3Sigils.every((s) => s.active)) {
        this.room3PuzzleSolved = true;
        const keyChest = this.chests.find((c) => c.id === 'vault_key');
        if (keyChest) {
          this.cameraRig.focusOn(keyChest.chest.x, keyChest.chest.y, this.player, {
            onArrive: () => {
              keyChest.chest.unlock('Vault Key!');
              SFX.playSecretJingle();
              this.cameraRig.zoomPunch(0.04, 110);
              this.hud.showToast('Vault Key Chest Unsealed!');
            },
          });
        }
      }
    }

    // Update Room 2 enemies with strict Room 2 interior bounds so they can NEVER escape
    const isRoom2Walkable = (wx: number, wy: number): boolean => {
      if (!this.isWalkable(wx, wy)) return false;
      const tx = Math.floor(wx / TILE_PX);
      const ty = Math.floor(wy / TILE_PX);
      return tx >= ROOM_W + 1 && tx <= ROOM_W * 2 - 2 && ty >= 1 && ty <= ROOM_H - 2;
    };
    if (this.player.x > (ROOM_W + 1.5) * TILE_PX && this.player.y < ROOM_H * TILE_PX) {
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (!e.active) {
          this.enemies.splice(i, 1);
          continue;
        }
        e.updateEnemy(dt, this.player.x, this.player.y, isRoom2Walkable, {
          onMeleeHitPlayer: (dmg, dx, dy) => {
            if (this.player.takeDamage(dmg, dx, dy, this.isWalkable)) {
              spawnFloatingText(this, this.player.x, this.player.y - 14, `-${dmg}`, '#ff5e6c');
              if (gameState.hp <= 0) gameState.hp = Math.round(gameState.getMaxHp() * 0.5);
            }
          },
          onFireProjectile: () => {},
          onBossSummon: () => {},
        });
      }
    }

    // Dark dungeon lighting + flickering torch point lights + exit door glow + floating dust motes
    const lights: PointLightSource[] = [
      { x: this.player.x, y: this.player.y - 4, radius: 34, color: 0xffe4aa, intensity: 0.72 },
      {
        x: this.exitDoor.glow.x,
        y: this.exitDoor.glow.y + 2,
        radius: nearExit ? 48 : 26,
        color: exitColor,
        intensity: nearExit ? 1 : 0.75,
        flicker: true,
      },
      ...this.torchLights,
    ];
    if (this.room1Sigil.active) lights.push({ x: this.room1Sigil.x, y: this.room1Sigil.y, radius: 24, color: 0x6ce5ff, intensity: 0.85 });
    for (const sw of this.room3Sigils) {
      if (sw.active) lights.push({ x: sw.x, y: sw.y, radius: 24, color: 0x6ce5ff, intensity: 0.85 });
    }
    for (const entry of this.chests) {
      if (!entry.chest.opened && !entry.chest.locked) {
        lights.push({ x: entry.chest.x, y: entry.chest.y, radius: 26, color: 0xffe066, intensity: 0.8 });
      }
    }
    this.lighting.update(dt, lights, []);
    this.atmosphere.update(dt);

    for (let i = this.drops.length - 1; i >= 0; i--) {
      if (this.drops[i].updateDrop(dt, this.player.x, this.player.y)) {
        this.drops.splice(i, 1);
      }
    }
  }
}
