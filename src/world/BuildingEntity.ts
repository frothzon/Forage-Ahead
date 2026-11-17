import Phaser from 'phaser';
import { gameState, type CraftQueueJob } from '../core/GameState';
import { ITEMS } from '../data/items';
import { RECIPES, type StructureType } from '../data/recipes';
import { SPROUT_CROP_BY_STRUCTURE, type SproutCropDef } from '../data/sproutCrops';
import { applyWindShader } from './WindShader';

export class BuildingEntity extends Phaser.GameObjects.Container {
  public readonly id: string;
  public readonly structureType: StructureType;
  public readonly tx: number;
  public readonly ty: number;
  public solid: boolean;
  public isOpen = false;
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
  private cropStage = 0; // 0..2 growing, 2 = ripe
  private mainSprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
  private auraCircle?: Phaser.GameObjects.Arc;
  private progressText?: Phaser.GameObjects.Text;

  // Floating glowing craft preview + bar
  private craftGlow?: Phaser.GameObjects.Arc;
  private craftIcon?: Phaser.GameObjects.Image;
  private craftBarBg?: Phaser.GameObjects.Rectangle;
  private craftBarFill?: Phaser.GameObjects.Rectangle;

  constructor(
    scene: Phaser.Scene,
    id: string,
    type: StructureType,
    tx: number,
    ty: number,
    initialQueue: CraftQueueJob[] = [],
    initialCropStage = 0,
  ) {
    const px = tx * 16 + 8;
    const py = ty * 16 + 8;
    super(scene, px, py);
    this.id = id;
    this.structureType = type;
    this.tx = tx;
    this.ty = ty;
    this.craftQueue = initialQueue;
    this.cropStage = initialCropStage;
    this.solid =
      !type.startsWith('crop_') &&
      type !== 'fish_trap' &&
      type !== 'nest' &&
      type !== 'house_floor' &&
      type !== 'furniture_lamp' &&
      type !== 'furniture_rug';

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
        this.mainSprite = scene.add.image(0, 0, 'sprout/house_walls', 11).setOrigin(0.5, 0.5);
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
        this.mainSprite = scene.add.image(0, 2, 'sprout/house_door', 0).setOrigin(0.5, 0.75);
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
      this.add([this.craftGlow, this.craftIcon, this.craftBarBg, this.craftBarFill]);
    }

    if (this.interactStation) {
      this.progressText = scene.add
        .text(0, -29, `[E]`, {
          fontSize: '7px',
          color: '#ffe9a6',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setVisible(false);
      this.add(this.progressText);
    }

    // Center collision region 25% up from the bottom edge of the sprite ("feet" of the structure)
    this.collisionOffsetY = this.solid
      ? this.mainSprite.y + (0.75 - this.mainSprite.originY) * this.mainSprite.displayHeight
      : 0;
    this.collisionRadius = type === 'lighthouse' ? 6.8 : 6;

    this.setDepth(
      type === 'house_floor' ? 2 : type === 'furniture_rug' ? 3 : this.solid ? py + this.collisionOffsetY : 6,
    );
    scene.add.existing(this);
    this.syncCraftVisual();
  }

  public getCollisionCenter(): { x: number; y: number } {
    return { x: this.x, y: this.y + this.collisionOffsetY };
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
  }

  public setPromptVisible(visible: boolean): void {
    if (this.progressText) this.progressText.setVisible(visible);
  }

  public getCropStage(): number {
    return this.cropStage;
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
    return this.isCrop() && this.cropStage >= this.getMaxCropStage();
  }

  public waterCrop(): boolean {
    if (!this.isCrop() || this.cropStage >= this.getMaxCropStage()) return false;
    this.cropStage += 1;
    this.syncCropFrame();
    return true;
  }

  public harvestCrop(): { itemId: string; count: number } | null {
    if (!this.isCropRipe()) return null;
    this.cropStage = 1;
    this.syncCropFrame();
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
    };
  }

  public toggleDoor(): boolean {
    if (this.structureType !== 'house_door' && this.structureType !== 'fence_gate') return false;
    this.isOpen = !this.isOpen;
    this.solid = !this.isOpen;
    (this.mainSprite as Phaser.GameObjects.Image).setFrame(this.isOpen ? 4 : 0);
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
        let growStepMs = gameState.hasSkill('foraging_farming') ? 6000 : 12000;
        if (callbacks.isFertileSoil?.(this.tx, this.ty)) {
          growStepMs = Math.round(growStepMs * 0.65);
        }
        if (callbacks.rainWatered) {
          growStepMs = Math.round(growStepMs * 0.55);
        }
        if (this.actionTimerMs >= growStepMs) {
          this.actionTimerMs = 0;
          this.cropStage += 1;
          this.syncCropFrame();
        }
      }
    }
  }
}
