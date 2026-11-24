import Phaser from 'phaser';
import { buildBaseSnapshot, isQaMode, markQaReady, registerQaApi } from '../qa/QaDirector';
import { getStructurePreviewSpec } from '../world/BuildingEntity';
import { type HouseThemeId } from '../world/HouseLayoutBuilder';
import {
  OUTDOOR_NPC_BUILDINGS,
  computeHouseRoofFrame,
  computeHouseWallFrame,
} from '../world/OutdoorBuildingStamps';

const TILE_PX = 16;

/**
 * Developer test room for inspecting every frame of the Sprout house tilesets
 * and testing WFC-generated multi-room outdoor houses in the browser.
 * Access via `?test=houses`.
 */
export class HouseTestScene extends Phaser.Scene {
  private roofSprites: Phaser.GameObjects.Image[] = [];
  private showRoof = true;
  private themeIdx = 0;
  private readonly themes: HouseThemeId[] = ['farmer', 'blacksmith', 'alchemist', 'fisherman'];
  private wfcGroup?: Phaser.GameObjects.Group;

  constructor() {
    super('HouseTestScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#2b4a32');
    const applyCameraLayout = (w: number, h: number) => {
      this.cameras.main.setSize(w, h);
      const zoom = Math.max(1, Math.min(2.2, Math.min(w / 680, h / 430)));
      this.cameras.main.setZoom(zoom);
      this.cameras.main.centerOn(330, 205);
    };
    applyCameraLayout(this.scale.width, this.scale.height);
    const onResize = (sz: Phaser.Structs.Size) => applyCameraLayout(sz.width, sz.height);
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));

    // 1. Tileset Frame Contact Sheets (left side)
    this.drawSheetGrid('sprout/house_walls', 5, 3, 16, 20, 'house_walls (5x3)');
    this.drawSheetGrid('sprout/house_roof', 7, 5, 16, 100, 'house_roof (7x5)');
    this.drawSheetGrid('sprout/house_door', 18, 2, 16, 220, 'house_door (18x2)');
    this.drawSheetGrid('sprout/furniture', 9, 6, 16, 280, 'furniture (9x6)');

    // 2. WFC Multi-Room Outdoor House Preview (right side)
    this.wfcGroup = this.add.group();
    this.buildWfcHousePreview();

    // 3. Controls
    const hint = this.add
      .text(395, 10, '[R] Toggle Roof   [T] Cycle Theme', {
        fontSize: '8px',
        fontStyle: 'bold',
        color: '#ffe6a8',
        backgroundColor: '#1b1109',
        padding: { x: 4, y: 2 },
        resolution: 4,
      })
      .setDepth(9000);
    hint.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.toggleRoof();
    });

    this.input.keyboard?.on('keydown-R', () => this.toggleRoof());
    this.input.keyboard?.on('keydown-T', () => {
      this.themeIdx = (this.themeIdx + 1) % this.themes.length;
      this.buildWfcHousePreview();
    });

    if (isQaMode()) {
      registerQaApi({
        getStateSnapshot: () => buildBaseSnapshot('HouseTestScene'),
        triggerAction: (action) => {
          if (action === 'toggle_roof') {
            this.toggleRoof();
            return true;
          }
          if (action === 'cycle_theme') {
            this.themeIdx = (this.themeIdx + 1) % this.themes.length;
            this.buildWfcHousePreview();
            return true;
          }
          return false;
        },
      });
      markQaReady();
    }
  }

  private toggleRoof(): void {
    this.showRoof = !this.showRoof;
    for (const spr of this.roofSprites) {
      spr.setAlpha(this.showRoof ? 1 : 0.15);
    }
  }

  private drawSheetGrid(
    key: string,
    cols: number,
    rows: number,
    ox: number,
    oy: number,
    title: string,
  ): void {
    this.add
      .text(ox, oy - 12, title, {
        fontSize: '7px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000',
        strokeThickness: 2,
        resolution: 4,
      })
      .setDepth(500);

    const cell = 20;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const x = ox + c * cell + 8;
        const y = oy + r * cell + 8;
        this.add.rectangle(x, y, 17, 17, 0x16261a, 0.7).setStrokeStyle(0.5, 0x4b7556, 0.8);
        this.add.image(x, y, key, idx).setDepth(10);
        this.add
          .text(x - 7, y - 8, String(idx), {
            fontSize: '5px',
            color: '#ffd95a',
            stroke: '#000',
            strokeThickness: 1.5,
            resolution: 4,
          })
          .setDepth(20);
      }
    }
  }

  private buildWfcHousePreview(): void {
    this.wfcGroup?.clear(true, true);
    this.roofSprites = [];

    const theme = this.themes[this.themeIdx];
    const stamp = OUTDOOR_NPC_BUILDINGS[theme];
    const basePxX = 395;
    const basePxY = 48;

    const title = this.add
      .text(basePxX, basePxY - 26, `WFC House: ${stamp.name} (${stamp.width}x${stamp.height})`, {
        fontSize: '8px',
        fontStyle: 'bold',
        color: '#8ef5a7',
        stroke: '#000',
        strokeThickness: 2,
        resolution: 4,
      })
      .setDepth(9000);
    this.wfcGroup?.add(title);

    const floorSet = new Set<string>();
    const footprintSet = new Set<string>();
    const wallOrDoorSet = new Set<string>();
    for (const pl of stamp.placements) {
      footprintSet.add(`${pl.lx},${pl.ly}`);
      if (pl.type === 'house_floor') floorSet.add(`${pl.lx},${pl.ly}`);
      if (pl.type === 'house_wall' || pl.type === 'house_door') wallOrDoorSet.add(`${pl.lx},${pl.ly}`);
    }

    for (const pl of stamp.placements) {
      const px = basePxX + pl.lx * TILE_PX + 8;
      const py = basePxY + pl.ly * TILE_PX + 8;
      if (pl.type === 'house_floor') {
        const fl = this.add.image(px, py, 'sprout/house_walls', 6).setDepth(2);
        this.wfcGroup?.add(fl);
      } else if (pl.type === 'house_wall') {
        const frame = computeHouseWallFrame(
          wallOrDoorSet.has(`${pl.lx},${pl.ly - 1}`),
          wallOrDoorSet.has(`${pl.lx},${pl.ly + 1}`),
          wallOrDoorSet.has(`${pl.lx - 1},${pl.ly}`),
          wallOrDoorSet.has(`${pl.lx + 1},${pl.ly}`),
          footprintSet.has(`${pl.lx - 1},${pl.ly}`),
          footprintSet.has(`${pl.lx + 1},${pl.ly}`),
        );
        const wl = this.add.image(px, py + 2, 'sprout/house_walls', frame).setOrigin(0.5, 0.75).setDepth(py + 2);
        this.wfcGroup?.add(wl);
      } else {
        const spec = getStructurePreviewSpec(pl.type);
        const spr = this.add
          .image(px, py + (spec.offsetY ?? 0), spec.texture, spec.frame)
          .setOrigin(0.5, spec.originY ?? 0.5)
          .setScale(spec.scale ?? 1)
          .setDepth(pl.type === 'furniture_rug' ? 3 : pl.type === 'house_door' ? py + 3 : py + 1);
        this.wfcGroup?.add(spr);
      }
    }

    // Place roof on all rows except the exposed south exterior wall (!hasS), aligned directly over the north wall down to the eave
    const roofKeys = [...footprintSet].filter((k) => {
      const [lx, ly] = k.split(',').map(Number);
      return footprintSet.has(`${lx},${ly + 1}`);
    });
    const roofKeySet = new Set(roofKeys);
    let minLy = Infinity;
    let maxLy = -Infinity;
    for (const k of roofKeys) {
      const ly = Number(k.split(',')[1]);
      if (ly < minLy) minLy = ly;
      if (ly > maxLy) maxLy = ly;
    }

    for (const k of roofKeys) {
      const [lx, ly] = k.split(',').map(Number);
      const px = basePxX + lx * TILE_PX + 8;
      const py = basePxY + ly * TILE_PX + 8;
      const hasW = roofKeySet.has(`${lx - 1},${ly}`);
      const hasE = roofKeySet.has(`${lx + 1},${ly}`);
      const hasN = roofKeySet.has(`${lx},${ly - 1}`);
      const hasS = roofKeySet.has(`${lx},${ly + 1}`);
      let concave: 'se' | 'sw' | 'ne' | 'nw' | undefined;
      if (hasN && hasS && hasW && hasE) {
        if (!footprintSet.has(`${lx + 1},${ly + 1}`)) concave = 'se';
        else if (!footprintSet.has(`${lx - 1},${ly + 1}`)) concave = 'sw';
        else if (!footprintSet.has(`${lx + 1},${ly - 1}`)) concave = 'ne';
        else if (!footprintSet.has(`${lx - 1},${ly - 1}`)) concave = 'nw';
      }
      const frame = computeHouseRoofFrame(ly, minLy, maxLy, hasW, hasE, concave);
      const rf = this.add
        .image(px, py, 'sprout/house_roof', frame)
        .setAlpha(this.showRoof ? 1 : 0.15)
        .setDepth(8500);
      this.roofSprites.push(rf);
      this.wfcGroup?.add(rf);
    }
  }
}
