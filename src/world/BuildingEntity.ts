import Phaser from 'phaser';
import { gameState, type CraftQueueJob } from '../core/GameState';
import { SFX } from '../core/SoundFX';
import { ITEMS } from '../data/items';
import { RECIPES, type StructureType } from '../data/recipes';
import { getMaxHarvestsForCrop, SPROUT_CROP_BY_STRUCTURE, type SproutCropDef } from '../data/sproutCrops';
export { getMaxHarvestsForCrop };
import { computeWallCollisionBox } from './OutdoorBuildingStamps';
import { applyWindShader } from './WindShader';

export interface StructurePreviewSpec {
  texture: string;
  frame?: number;
  offsetY?: number;
  originY?: number;
  scale?: number;
}

export function getStructurePreviewSpec(type: StructureType): StructurePreviewSpec {
  switch (type) {
    case 'furnace':
      return { texture: 'ui_icons/furnace', offsetY: 3, originY: 0.8 };
    case 'anvil':
      return { texture: 'objects/Anvil', offsetY: 2, originY: 0.7 };
    case 'bonfire':
      return { texture: 'extras/Bonfire', frame: 0, offsetY: 2, originY: 0.7 };
    case 'alchemy_lab':
      return { texture: 'objects/Barrel', offsetY: 2, originY: 0.75, scale: 1.1 };
    case 'frost_kiln':
      return { texture: 'ui_icons/furnace', offsetY: 3, originY: 0.8, scale: 1.1 };
    case 'infernal_forge':
      return { texture: 'objects/Anvil', offsetY: 2, originY: 0.75, scale: 1.15 };
    case 'void_altar':
      return { texture: 'objects/Anvil', offsetY: 2, originY: 0.75, scale: 1.2 };
    case 'chest':
      return { texture: 'objects/Chest_small', frame: 0, offsetY: 2, originY: 0.7 };
    case 'nest':
      return { texture: 'tileset/Wooden logs', offsetY: 2, originY: 0.7, scale: 0.9 };
    case 'fence':
      return { texture: 'sprout/fences', frame: 0, offsetY: 2, originY: 0.75 };
    case 'fence_gate':
      return { texture: 'sprout/fence_gates', frame: 0, offsetY: 2, originY: 0.75 };
    case 'house_floor':
      return { texture: 'sprout/house_walls', frame: 6, offsetY: 0, originY: 0.5 };
    case 'house_wall':
      return { texture: 'sprout/house_walls', frame: 1, offsetY: 2, originY: 0.75 };
    case 'house_door':
      return { texture: 'sprout/house_door', frame: 5, offsetY: 2, originY: 0.75 };
    case 'furniture_bed':
      return { texture: 'sprout/furniture', frame: 18, offsetY: 2, originY: 0.75 };
    case 'furniture_lamp':
      return { texture: 'sprout/furniture', frame: 12, offsetY: 2, originY: 0.75 };
    case 'furniture_table':
      return { texture: 'sprout/furniture', frame: 30, offsetY: 2, originY: 0.75 };
    case 'furniture_rug':
      return { texture: 'sprout/furniture', frame: 45, offsetY: 0, originY: 0.5 };
    case 'water_well':
      return { texture: 'sprout/water_well', offsetY: 2, originY: 0.8, scale: 0.8 };
    case 'lighthouse':
      return { texture: 'ui_icons/lighthouse', offsetY: 5, originY: 0.9, scale: 1.35 };
    case 'mining_rod':
      return { texture: 'ui_icons/mining_rod', offsetY: 4, originY: 0.85, scale: 1.1 };
    case 'fish_trap':
      return { texture: 'objects/Barrel_water', offsetY: 0, originY: 0.5, scale: 0.9 };
    case 'bridge':
      return { texture: 'ui_icons/bridge', offsetY: 0, originY: 0.5 };
    case 'road_stone':
      return { texture: 'ui_icons/road', offsetY: 0, originY: 0.5 };
    case 'crop_berries':
      return { texture: 'objects/Crops (berries)', frame: 0, offsetY: 4, originY: 0.85 };
    case 'crop_carrot':
      return { texture: 'objects/Crops (carrot)', frame: 0, offsetY: 4, originY: 0.85 };
    case 'crop_sunflower':
      return { texture: 'objects/Crops (sunflower)', frame: 0, offsetY: 4, originY: 0.85 };
    default: {
      const sproutCrop = SPROUT_CROP_BY_STRUCTURE[type as SproutCropDef['structureType']];
      if (sproutCrop) {
        return { texture: 'sprout/farming_plants', frame: sproutCrop.plantRow * 5, offsetY: 4, originY: 0.85 };
      }
      return { texture: 'objects/Barrel', offsetY: 0, originY: 0.7 };
    }
  }
}

export class BuildingEntity extends Phaser.GameObjects.Container {
  public readonly id: string;
  public readonly structureType: StructureType;
  public readonly tx: number;
  public readonly ty: number;
  public readonly readOnly: boolean;
  public readonly needsTick: boolean;
  public readonly emitsLight: boolean;
  public solid: boolean;
  public isOpen = false;
  public looted = false;
  public readonly interactStation?:
    | 'furnace'
    | 'anvil'
    | 'bonfire'
    | 'alchemy_lab'
    | 'frost_kiln'
    | 'infernal_forge'
    | 'void_altar'
    | 'chest';
  public readonly collisionOffsetY: number;
  public readonly collisionRadius: number;

  public readonly maxQueueSize = 5;
  public craftQueue: CraftQueueJob[];
  public nestEgg: { speciesId: string; remainingMs: number; totalMs: number } | null = null;

  private actionTimerMs = 0;
  private bobClockMs = 0;
  private cropStage = 0; // 0..maxStage growing, maxStage = ripe
  private stageWatered = false;
  private wateredCount = 0;
  private harvestsLeft = 1;
  private stageProgressMs = 0;
  private rustleCooldownMs = 0;
  private mainSprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
  private auraCircle?: Phaser.GameObjects.Arc;
  private progressText?: Phaser.GameObjects.Text;
  private collisionBox?: { offsetX: number; offsetY: number; halfW: number; halfH: number };

  // Floating glowing craft preview + bar + radial gauge
  private craftGlow?: Phaser.GameObjects.Arc;
  private craftIcon?: Phaser.GameObjects.Image;
  private craftBarBg?: Phaser.GameObjects.Rectangle;
  private craftBarFill?: Phaser.GameObjects.Rectangle;
  private craftRadial?: Phaser.GameObjects.Sprite;

  constructor(
    scene: Phaser.Scene,
    id: string,
    type: StructureType,
    tx: number,
    ty: number,
    initialQueue: CraftQueueJob[] = [],
    initialCropStage = 0,
    readOnly = false,
    cropSaveState?: { stageWatered?: boolean; wateredCount?: number; harvestsLeft?: number },
  ) {
    const px = tx * 16 + 8;
    const py = ty * 16 + 8;
    super(scene, px, py);
    this.id = id;
    this.structureType = type;
    this.tx = tx;
    this.ty = ty;
    this.readOnly = readOnly;
    this.craftQueue = initialQueue;
    this.cropStage = initialCropStage;
    this.stageWatered = cropSaveState?.stageWatered ?? false;
    this.wateredCount = cropSaveState?.wateredCount ?? 0;
    this.harvestsLeft = cropSaveState?.harvestsLeft ?? getMaxHarvestsForCrop(type);
    this.solid =
      !type.startsWith('crop_') &&
      type !== 'fish_trap' &&
      type !== 'nest' &&
      type !== 'house_floor' &&
      type !== 'furniture_lamp' &&
      type !== 'furniture_rug';
    this.emitsLight =
      type === 'bonfire' ||
      type === 'furnace' ||
      type === 'infernal_forge' ||
      type === 'frost_kiln' ||
      type === 'mining_rod' ||
      type === 'furniture_lamp' ||
      type === 'lighthouse';
    this.needsTick =
      type === 'furnace' ||
      type === 'anvil' ||
      type === 'bonfire' ||
      type === 'alchemy_lab' ||
      type === 'frost_kiln' ||
      type === 'infernal_forge' ||
      type === 'void_altar' ||
      type === 'mining_rod' ||
      type === 'fish_trap' ||
      type === 'nest' ||
      type.startsWith('crop_');

    switch (type) {
      case 'furnace': {
        this.interactStation = 'furnace';
        this.mainSprite = scene.add.image(0, 3, 'ui_icons/furnace').setOrigin(0.5, 0.8);
        this.add(this.mainSprite);
        break;
      }
      case 'anvil': {
        this.interactStation = 'anvil';
        this.mainSprite = scene.add.image(0, 2, 'objects/Anvil').setOrigin(0.5, 0.7);
        this.add(this.mainSprite);
        break;
      }
      case 'bonfire': {
        this.interactStation = 'bonfire';
        const spr = scene.add.sprite(0, 2, 'extras/Bonfire').setOrigin(0.5, 0.7);
        spr.play('prop_bonfire');
        this.mainSprite = spr;
        this.add(spr);
        break;
      }
      case 'alchemy_lab': {
        this.interactStation = 'alchemy_lab';
        this.auraCircle = scene.add.circle(0, 0, 22, 0xc77dff, 0.1).setStrokeStyle(1, 0xc77dff, 0.35);
        this.mainSprite = scene.add.image(0, 2, 'objects/Barrel').setOrigin(0.5, 0.75).setTint(0xc78cff).setScale(1.1);
        this.add([this.auraCircle, this.mainSprite]);
        break;
      }
      case 'frost_kiln': {
        this.interactStation = 'frost_kiln';
        this.auraCircle = scene.add.circle(0, 0, 24, 0x6ce5ff, 0.1).setStrokeStyle(1, 0x6ce5ff, 0.35);
        this.mainSprite = scene.add.image(0, 3, 'ui_icons/furnace').setOrigin(0.5, 0.8).setTint(0x8ae8ff).setScale(1.1);
        this.add([this.auraCircle, this.mainSprite]);
        break;
      }
      case 'infernal_forge': {
        this.interactStation = 'infernal_forge';
        this.auraCircle = scene.add.circle(0, 0, 24, 0xff6b4a, 0.12).setStrokeStyle(1, 0xff6b4a, 0.4);
        this.mainSprite = scene.add.image(0, 2, 'objects/Anvil').setOrigin(0.5, 0.75).setTint(0xff8066).setScale(1.15);
        this.add([this.auraCircle, this.mainSprite]);
        break;
      }
      case 'void_altar': {
        this.interactStation = 'void_altar';
        this.auraCircle = scene.add.circle(0, 0, 26, 0xa864ff, 0.14).setStrokeStyle(1, 0xd8a8ff, 0.5);
        this.mainSprite = scene.add.image(0, 2, 'objects/Anvil').setOrigin(0.5, 0.75).setTint(0xc77dff).setScale(1.2);
        this.add([this.auraCircle, this.mainSprite]);
        break;
      }
      case 'chest': {
        this.interactStation = 'chest';
        this.mainSprite = scene.add.image(0, 2, 'objects/Chest_small', 0).setOrigin(0.5, 0.7);
        this.add(this.mainSprite);
        break;
      }
      case 'nest': {
        this.mainSprite = scene.add.image(0, 2, 'tileset/Wooden logs').setOrigin(0.5, 0.7).setTint(0xe8c474).setScale(0.9);
        this.add(this.mainSprite);
        break;
      }
      case 'fence': {
        this.mainSprite = scene.add.image(0, 2, 'sprout/fences', 0).setOrigin(0.5, 0.75);
        this.add(this.mainSprite);
        break;
      }
      case 'fence_gate': {
        this.mainSprite = scene.add.image(0, 2, 'sprout/fence_gates', 0).setOrigin(0.5, 0.75);
        this.add(this.mainSprite);
        break;
      }
      case 'house_floor': {
        this.mainSprite = scene.add.image(0, 0, 'sprout/house_walls', 6).setOrigin(0.5, 0.5);
        this.add(this.mainSprite);
        this.setDepth(2);
        break;
      }
      case 'house_wall': {
        this.mainSprite = scene.add.image(0, 2, 'sprout/house_walls', 1).setOrigin(0.5, 0.75);
        this.add(this.mainSprite);
        break;
      }
      case 'house_door': {
        this.mainSprite = scene.add.image(0, 2, 'sprout/house_door', 5).setOrigin(0.5, 0.75);
        this.add(this.mainSprite);
        break;
      }
      case 'furniture_bed': {
        this.mainSprite = scene.add.image(0, 2, 'sprout/furniture', 18).setOrigin(0.5, 0.75);
        this.add(this.mainSprite);
        break;
      }
      case 'furniture_lamp': {
        this.auraCircle = scene.add.circle(0, -2, 26, 0xffe08a, 0.12);
        this.mainSprite = scene.add.image(0, 2, 'sprout/furniture', 12).setOrigin(0.5, 0.75);
        this.add([this.auraCircle, this.mainSprite]);
        break;
      }
      case 'furniture_table': {
        this.mainSprite = scene.add.image(0, 2, 'sprout/furniture', 30).setOrigin(0.5, 0.75);
        this.add(this.mainSprite);
        break;
      }
      case 'furniture_rug': {
        this.mainSprite = scene.add.image(0, 0, 'sprout/furniture', 45).setOrigin(0.5, 0.5);
        this.add(this.mainSprite);
        this.setDepth(3);
        break;
      }
      case 'water_well': {
        this.mainSprite = scene.add.image(0, 2, 'sprout/water_well').setOrigin(0.5, 0.8).setScale(0.8);
        this.add(this.mainSprite);
        break;
      }
      case 'lighthouse': {
        this.auraCircle = scene.add.circle(0, 0, 96, 0xffe066, 0.06).setStrokeStyle(1, 0xffe066, 0.25);
        this.mainSprite = scene.add.image(0, 5, 'ui_icons/lighthouse').setOrigin(0.5, 0.9).setScale(1.35);
        this.add([this.auraCircle, this.mainSprite]);
        break;
      }
      case 'mining_rod': {
        this.auraCircle = scene.add.circle(0, 0, 80, 0x6ce5ff, 0.05).setStrokeStyle(1, 0x6ce5ff, 0.22);
        this.mainSprite = scene.add.image(0, 4, 'ui_icons/mining_rod').setOrigin(0.5, 0.85).setScale(1.1);
        this.add([this.auraCircle, this.mainSprite]);
        break;
      }
      case 'fish_trap': {
        this.mainSprite = scene.add.image(0, 0, 'objects/Barrel_water').setOrigin(0.5, 0.5).setScale(0.9);
        this.add(this.mainSprite);
        scene.tweens.add({
          targets: this.mainSprite,
          y: { from: -1, to: 1 },
          duration: 900,
          yoyo: true,
          repeat: -1,
        });
        break;
      }
      case 'crop_berries':
      case 'crop_carrot':
      case 'crop_sunflower': {
        const key =
          type === 'crop_berries'
            ? 'objects/Crops (berries)'
            : type === 'crop_carrot'
              ? 'objects/Crops (carrot)'
              : 'objects/Crops (sunflower)';
        this.mainSprite = scene.add.image(0, 4, key, this.cropStage).setOrigin(0.5, 0.85);
        applyWindShader(this.mainSprite, 3.0, tx * 1.9 + ty * 2.7);
        this.add(this.mainSprite);
        break;
      }
      default: {
        const sproutCrop = SPROUT_CROP_BY_STRUCTURE[type as SproutCropDef['structureType']];
        if (sproutCrop) {
          const frame = sproutCrop.plantRow * 5 + Math.min(sproutCrop.maxStage, this.cropStage);
          this.mainSprite = scene.add.image(0, 4, 'sprout/farming_plants', frame).setOrigin(0.5, 0.85);
          applyWindShader(this.mainSprite, 3.0, tx * 1.9 + ty * 2.7);
          this.add(this.mainSprite);
        } else {
          this.mainSprite = scene.add.image(0, 0, 'objects/Barrel').setOrigin(0.5, 0.7);
          this.add(this.mainSprite);
        }
        break;
      }
    }

    if (this.interactStation === 'furnace' || this.interactStation === 'anvil' || this.interactStation === 'bonfire') {
      this.craftGlow = scene.add.circle(0, -19, 8, 0xffe066, 0.45).setVisible(false);
      this.craftIcon = scene.add.image(0, -19, 'ui_icons/coin').setScale(0.8).setVisible(false);
      this.craftBarBg = scene.add.rectangle(0, -10, 16, 2.5, 0x101824).setOrigin(0.5).setVisible(false);
      this.craftBarFill = scene.add.rectangle(-7.5, -10, 0, 1.5, 0x7ae398).setOrigin(0, 0.5).setVisible(false);
      const children: Phaser.GameObjects.GameObject[] = [this.craftGlow, this.craftIcon, this.craftBarBg, this.craftBarFill];
      if (scene.textures.exists('sprout_ui/bars/stamina_circle_black')) {
        this.craftRadial = scene.add.sprite(10, -19, 'sprout_ui/bars/stamina_circle_black', 0).setScale(0.65).setVisible(false);
        children.push(this.craftRadial);
      }
      this.add(children);
    }

    if (this.interactStation) {
      this.progressText = scene.add
        .text(0, -29, `[E]`, {
          fontSize: '7px',
          fontStyle: 'bold',
          color: '#ffe9a6',
          stroke: '#000000',
          strokeThickness: 2,
          resolution: 4,
        })
        .setOrigin(0.5)
        .setVisible(false);
      this.add(this.progressText);
    }

    // Center collision region 25% up from the bottom edge of the sprite ("feet" of the structure)
    this.collisionOffsetY = this.solid
      ? this.mainSprite.y + (0.75 - this.mainSprite.originY) * this.mainSprite.displayHeight
      : 0;
    this.collisionRadius =
      type === 'lighthouse'
        ? 6.8
        : type === 'chest' ||
            type === 'furniture_bed' ||
            type === 'furniture_table' ||
            type === 'water_well' ||
            type === 'furnace' ||
            type === 'anvil' ||
            type === 'alchemy_lab'
          ? 4.8
          : 6;

    if (type === 'house_wall') {
      this.collisionBox = computeWallCollisionBox(1);
    } else if (type === 'house_door') {
      this.collisionBox = { offsetX: 0, offsetY: 0, halfW: 8.5, halfH: 6.5 };
    }

    this.setDepth(
      type === 'house_floor' ? 2 : type === 'furniture_rug' ? 3 : this.solid ? py + this.collisionOffsetY : 6,
    );
    scene.add.existing(this);
    this.syncCraftVisual();
  }

  public getCollisionCenter(): { x: number; y: number } {
    return { x: this.x, y: this.y + this.collisionOffsetY };
  }

  public collidesAt(wx: number, wy: number): boolean {
    if (!this.active || !this.solid) return false;
    if (this.collisionBox) {
      const cx = this.x + this.collisionBox.offsetX;
      const cy = this.y + this.collisionBox.offsetY;
      return (
        Math.abs(wx - cx) < this.collisionBox.halfW &&
        Math.abs(wy - cy) < this.collisionBox.halfH
      );
    }
    const c = this.getCollisionCenter();
    return Math.hypot(wx - c.x, wy - c.y) < this.collisionRadius;
  }

  public setIndoorLightVisible(alpha: number): void {
    if (!this.auraCircle) return;
    if (alpha <= 0.02) {
      this.auraCircle.setVisible(false);
    } else {
      this.auraCircle.setVisible(true).setAlpha(alpha);
    }
  }

  public playChestOpen(): void {
    if (this.structureType !== 'chest') return;
    SFX.playChestOpen();
    if (this.scene.anims.exists('prop_chest_small_open')) {
      const animSpr = this.scene.add.sprite(0, 2, 'objects/Chest_small', 0).setOrigin(0.5, 0.7);
      this.mainSprite.setVisible(false);
      this.add(animSpr);
      animSpr.play('prop_chest_small_open');
    }
  }

  public isCraftingStation(): boolean {
    return (
      this.structureType === 'furnace' ||
      this.structureType === 'anvil' ||
      this.structureType === 'bonfire'
    );
  }

  public enqueueCraft(recipeId: string): boolean {
    if (!this.isCraftingStation()) return false;
    if (this.craftQueue.length >= this.maxQueueSize) return false;
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (!recipe || !recipe.outputItemId || recipe.station !== this.structureType) return false;
    if (!gameState.consumeIngredients(recipe)) return false;

    const totalMs = gameState.getCraftDurationMs(recipe);
    this.craftQueue.push({
      recipeId: recipe.id,
      outputItemId: recipe.outputItemId,
      outputCount: recipe.outputCount ?? 1,
      totalMs,
      remainingMs: totalMs,
    });
    this.syncCraftVisual();
    return true;
  }

  public cancelCraft(index: number): boolean {
    if (index < 0 || index >= this.craftQueue.length) return false;
    const [removed] = this.craftQueue.splice(index, 1);
    const recipe = RECIPES.find((r) => r.id === removed.recipeId);
    if (recipe) {
      gameState.refundIngredients(recipe);
    }
    // Note: removing index 0 discards any partial progress; re-adding restarts from full craftTimeMs
    this.syncCraftVisual();
    return true;
  }

  private syncCraftVisual(): void {
    if (!this.craftGlow || !this.craftIcon || !this.craftBarBg || !this.craftBarFill) return;
    const activeJob = this.craftQueue[0];
    if (!activeJob) {
      this.craftGlow.setVisible(false);
      this.craftIcon.setVisible(false);
      this.craftBarBg.setVisible(false);
      this.craftBarFill.setVisible(false);
      this.craftRadial?.setVisible(false);
      return;
    }
    const def = ITEMS[activeJob.outputItemId];
    if (def?.iconKey && this.scene.textures.exists(def.iconKey)) {
      this.craftIcon.setTexture(def.iconKey);
    }
    this.craftGlow.setVisible(true);
    this.craftIcon.setVisible(true);
    this.craftBarBg.setVisible(true);
    this.craftBarFill.setVisible(true);
    this.craftRadial?.setVisible(true);
  }

  public setPromptVisible(visible: boolean): void {
    if (this.progressText) this.progressText.setVisible(visible);
  }

  public getCropStage(): number {
    return this.cropStage;
  }

  public isStageWatered(): boolean {
    return this.stageWatered;
  }

  public getWateredCount(): number {
    return this.wateredCount;
  }

  public getHarvestsLeft(): number {
    return this.harvestsLeft;
  }

  public getCropStatus(): {
    state: 'ripe' | 'needs_water' | 'growing';
    stage: number;
    maxStage: number;
    progressPct: number;
    harvestsLeft: number;
  } {
    const maxStage = this.getMaxCropStage();
    if (this.isCropRipe()) {
      return {
        state: 'ripe',
        stage: this.cropStage,
        maxStage,
        progressPct: 100,
        harvestsLeft: this.harvestsLeft,
      };
    }
    if (!this.stageWatered) {
      return {
        state: 'needs_water',
        stage: this.cropStage,
        maxStage,
        progressPct: 0,
        harvestsLeft: this.harvestsLeft,
      };
    }
    const growStepMs = gameState.hasSkill('foraging_farming') ? 22000 : 32000;
    const progressPct = Math.min(99, Math.max(0, Math.round((this.stageProgressMs / growStepMs) * 100)));
    return {
      state: 'growing',
      stage: this.cropStage,
      maxStage,
      progressPct,
      harvestsLeft: this.harvestsLeft,
    };
  }

  public isCrop(): boolean {
    return (
      this.structureType === 'crop_berries' ||
      this.structureType === 'crop_carrot' ||
      this.structureType === 'crop_sunflower' ||
      Boolean(SPROUT_CROP_BY_STRUCTURE[this.structureType as SproutCropDef['structureType']])
    );
  }

  private getMaxCropStage(): number {
    const sc = SPROUT_CROP_BY_STRUCTURE[this.structureType as SproutCropDef['structureType']];
    return sc ? sc.maxStage : 2;
  }

  private syncCropFrame(): void {
    const sc = SPROUT_CROP_BY_STRUCTURE[this.structureType as SproutCropDef['structureType']];
    const frame = sc ? sc.plantRow * 5 + Math.min(sc.maxStage, this.cropStage) : this.cropStage;
    (this.mainSprite as Phaser.GameObjects.Image).setFrame(frame);
  }

  public isCropRipe(): boolean {
    return this.isCrop() && this.cropStage >= this.getMaxCropStage() && this.wateredCount >= 1;
  }

  public waterCrop(fromRain = false): boolean {
    if (!this.isCrop() || this.cropStage >= this.getMaxCropStage()) return false;
    if (this.stageWatered) return false;
    this.stageWatered = true;
    this.wateredCount += 1;
    if (!fromRain && this.mainSprite?.active) {
      const baseSx = this.mainSprite.scaleX;
      const baseSy = this.mainSprite.scaleY;
      this.scene.tweens.add({
        targets: this.mainSprite,
        scaleX: { from: baseSx * 1.12, to: baseSx },
        scaleY: { from: baseSy * 0.9, to: baseSy },
        duration: 140,
        ease: 'Back.easeOut',
      });
    }
    return true;
  }

  public rustle(nowMs: number): void {
    if (!this.active || !this.isCrop() || nowMs < this.rustleCooldownMs) return;
    this.rustleCooldownMs = nowMs + 550;
    const baseSx = this.mainSprite.scaleX || 1;
    const baseSy = this.mainSprite.scaleY || 1;
    this.scene.tweens.add({
      targets: this.mainSprite,
      scaleX: { from: baseSx * 1.14, to: baseSx },
      scaleY: { from: baseSy * 0.88, to: baseSy },
      angle: { from: -6, to: 6 },
      duration: 170,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.InOut',
      onComplete: () => {
        if (this.mainSprite.active) {
          this.mainSprite.setAngle(0);
          this.mainSprite.setScale(baseSx, baseSy);
        }
      },
    });
    const leafCount = Math.random() < 0.5 ? 2 : 1;
    const leafKeys = ['extras/Leaf_particle1', 'extras/Leaf_particle2', 'extras/Leaf_particle3'];
    for (let i = 0; i < leafCount; i++) {
      const key = leafKeys[Math.floor(Math.random() * leafKeys.length)];
      const lx = this.x + Phaser.Math.Between(-5, 5);
      const ly = this.y - 5 + Phaser.Math.Between(-3, 3);
      if (this.scene.textures.exists(key)) {
        const leaf = this.scene.add.image(lx, ly, key).setDepth(this.depth + 6).setScale(0.8);
        this.scene.tweens.add({
          targets: leaf,
          x: lx + Phaser.Math.Between(-8, 8),
          y: ly + Phaser.Math.Between(5, 11),
          angle: Phaser.Math.Between(-90, 90),
          alpha: 0,
          duration: 480,
          ease: 'Sine.Out',
          onComplete: () => leaf.destroy(),
        });
      }
    }
  }

  public playPlacePop(): void {
    const baseY = this.mainSprite.y;
    const baseSx = this.mainSprite.scaleX;
    const baseSy = this.mainSprite.scaleY;
    this.mainSprite.y = baseY - 10;
    this.scene.tweens.add({
      targets: this.mainSprite,
      y: baseY,
      duration: 85,
      ease: 'Quad.In',
      onComplete: () => {
        if (!this.mainSprite.active) return;
        SFX.playBuildPlace();
        this.mainSprite.setScale(baseSx * 1.25, baseSy * 0.75);
        this.scene.tweens.add({
          targets: this.mainSprite,
          scaleX: baseSx,
          scaleY: baseSy,
          duration: 110,
          ease: 'Back.easeOut',
        });
      },
    });
  }

  public setWallFrame(frame: number): void {
    if (this.structureType !== 'house_wall') return;
    if (this.mainSprite instanceof Phaser.GameObjects.Image) {
      this.mainSprite.setFrame(frame);
    }
    this.collisionBox = computeWallCollisionBox(frame);
  }

  public harvestCrop(): { itemId: string; count: number; depleted: boolean; harvestsLeft: number } | null {
    if (!this.isCropRipe()) return null;
    this.harvestsLeft = Math.max(0, this.harvestsLeft - 1);
    const depleted = this.harvestsLeft <= 0;
    const baseSx = this.mainSprite.scaleX;
    const baseSy = this.mainSprite.scaleY;
    if (!depleted) {
      this.mainSprite.setScale(baseSx * 0.78, baseSy * 1.28);
      this.scene.tweens.add({
        targets: this.mainSprite,
        scaleX: baseSx,
        scaleY: baseSy,
        duration: 95,
        ease: 'Back.easeOut',
      });
      this.cropStage = 1;
      this.stageWatered = false;
      this.wateredCount = 0;
      this.stageProgressMs = 0;
      this.syncCropFrame();
    }
    const baseCount = gameState.hasSkill('foraging_farming') ? 4 : 2;
    const sc = SPROUT_CROP_BY_STRUCTURE[this.structureType as SproutCropDef['structureType']];
    const itemId = sc
      ? sc.id
      : this.structureType === 'crop_berries'
        ? 'berries'
        : this.structureType === 'crop_carrot'
          ? 'carrot'
          : 'sunflower';
    return {
      itemId,
      count: baseCount,
      depleted,
      harvestsLeft: this.harvestsLeft,
    };
  }

  public toggleDoor(): boolean {
    if (this.structureType !== 'house_door' && this.structureType !== 'fence_gate') return false;
    this.isOpen = !this.isOpen;
    this.solid = !this.isOpen;
    const openFrame = this.structureType === 'house_door' ? 0 : 4;
    const closedFrame = this.structureType === 'house_door' ? 5 : 0;
    (this.mainSprite as Phaser.GameObjects.Image).setFrame(this.isOpen ? openFrame : closedFrame);
    return this.isOpen;
  }

  public placeEggOnNest(speciesId: string, hatchMs: number): boolean {
    if (this.structureType !== 'nest' || this.nestEgg) return false;
    this.nestEgg = { speciesId, remainingMs: hatchMs, totalMs: hatchMs };
    if (this.craftGlow && this.craftIcon) {
      this.craftGlow.setVisible(true);
      this.craftIcon.setTexture('ui_icons/berries').setVisible(true);
    }
    return true;
  }

  public updateBuilding(
    dtMs: number,
    callbacks: {
      onMiningRodPulse: (bx: number, by: number, radiusPx: number, dmg: number) => void;
      onFishTrapCatch: (bx: number, by: number) => void;
      onCraftComplete: (bx: number, by: number, itemId: string, count: number) => void;
      onNestHatch?: (speciesId: string, bx: number, by: number) => void;
      isFertileSoil?: (tx: number, ty: number) => boolean;
      rainWatered?: boolean;
    },
  ): void {
    this.actionTimerMs += dtMs;
    this.bobClockMs += dtMs;

    // Nest Egg Hatching
    if (this.structureType === 'nest' && this.nestEgg) {
      this.nestEgg.remainingMs -= dtMs;
      if (this.craftIcon) {
        this.craftIcon.y = -18 + Math.sin(this.bobClockMs * 0.008) * 2;
      }
      if (this.nestEgg.remainingMs <= 0) {
        const hatchedSpecies = this.nestEgg.speciesId;
        this.nestEgg = null;
        this.craftGlow?.setVisible(false);
        this.craftIcon?.setVisible(false);
        callbacks.onNestHatch?.(hatchedSpecies, this.x, this.y);
      }
    }

    // Crafting Queue Processing
    if (this.craftQueue.length > 0) {
      const job = this.craftQueue[0];
      job.remainingMs -= dtMs;

      if (this.craftGlow && this.craftIcon && this.craftBarFill) {
        const bobY = -19 + Math.sin(this.bobClockMs * 0.004) * 2.2;
        const pulse = 0.4 + 0.3 * Math.sin(this.bobClockMs * 0.006);
        const scalePulse = 0.92 + 0.16 * Math.sin(this.bobClockMs * 0.006);
        this.craftGlow.setPosition(0, bobY).setAlpha(pulse).setScale(scalePulse);
        this.craftIcon.setPosition(0, bobY);
        const pct = Math.max(0, Math.min(1, 1 - job.remainingMs / job.totalMs));
        this.craftBarFill.width = Math.max(1, 15 * pct);
        if (this.craftRadial) {
          this.craftRadial.setFrame(Math.min(36, Math.max(0, Math.floor(pct * 36))));
        }
      }

      if (job.remainingMs <= 0) {
        const finished = this.craftQueue.shift()!;
        this.syncCraftVisual();
        callbacks.onCraftComplete(this.x, this.y + 12, finished.outputItemId, finished.outputCount);
      }
    }

    if (this.structureType === 'mining_rod') {
      const interval = gameState.hasSkill('industry_overclock') ? 2400 : 4500;
      if (this.actionTimerMs >= interval) {
        this.actionTimerMs = 0;
        callbacks.onMiningRodPulse(this.x, this.y, 80, 16);
      }
    } else if (this.structureType === 'fish_trap') {
      const interval = gameState.hasSkill('industry_overclock') ? 5500 : 10000;
      if (this.actionTimerMs >= interval) {
        this.actionTimerMs = 0;
        callbacks.onFishTrapCatch(this.x, this.y);
      }
    } else if (this.isCrop()) {
      if (this.cropStage < this.getMaxCropStage()) {
        if (callbacks.rainWatered && !this.stageWatered) {
          this.waterCrop(true);
        }
        if (this.stageWatered) {
          let growStepMs = gameState.hasSkill('foraging_farming') ? 22000 : 32000;
          if (callbacks.isFertileSoil?.(this.tx, this.ty)) {
            growStepMs = Math.round(growStepMs * 0.85);
          }
          if (callbacks.rainWatered) {
            growStepMs = Math.round(growStepMs * 0.85);
          }
          this.stageProgressMs += dtMs;
          if (this.stageProgressMs >= growStepMs) {
            this.stageProgressMs = 0;
            this.cropStage += 1;
            this.stageWatered = false;
            this.syncCropFrame();
            if (callbacks.rainWatered && this.cropStage < this.getMaxCropStage()) {
              this.waterCrop(true);
            }
          }
        }
      }
    }
  }
}
