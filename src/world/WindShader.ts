import Phaser from 'phaser';

interface WindConfig {
  swayPixels: number;
  phase: number;
}

const windConfigs = new WeakMap<Phaser.GameObjects.GameObject, WindConfig>();

let globalWindStrength = 1.0;
let globalWindDirX = 0.8;

/**
 * Sets global daily wind parameters applied to every foliage wind shader instance.
 */
export function setGlobalWind(strength: number, dirX: number): void {
  globalWindStrength = Math.max(0.2, Math.min(2.4, strength));
  globalWindDirX = Math.max(-1, Math.min(1, dirX));
}

export const WIND_PIPELINE_KEY = 'WindSwayPipeline';

/**
 * Batched MultiPipeline subclass that applies foliage wind sway directly to the
 * top two vertices of each quad, avoiding per-sprite PostFX FBO binds/blits.
 */
export class WindSwayPipeline extends Phaser.Renderer.WebGL.Pipelines.MultiPipeline {
  constructor(game: Phaser.Game) {
    super({
      game,
      name: WIND_PIPELINE_KEY,
    });
  }

  public override batchQuad(
    gameObject: Phaser.GameObjects.GameObject | null,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    tintTL: number,
    tintTR: number,
    tintBL: number,
    tintBR: number,
    tintEffect: number | boolean,
    texture?: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper,
    unit?: number,
  ): boolean {
    if (gameObject) {
      const cfg = windConfigs.get(gameObject);
      if (cfg) {
        const t = this.game.loop.time * 0.001;
        const gust =
          Math.sin(t * 2.1 + cfg.phase) * 0.72 +
          Math.sin(t * 3.8 + cfg.phase * 1.35) * 0.28 +
          globalWindDirX * 0.35;
        const zoom = gameObject.scene?.cameras?.main?.zoom ?? 1;
        const swayDx = gust * cfg.swayPixels * globalWindStrength * zoom;
        x0 += swayDx;
        x3 += swayDx;
      }
    }

    return super.batchQuad(
      gameObject,
      x0,
      y0,
      x1,
      y1,
      x2,
      y2,
      x3,
      y3,
      u0,
      v0,
      u1,
      v1,
      tintTL,
      tintTR,
      tintBL,
      tintBR,
      tintEffect,
      texture,
      unit,
    );
  }
}

export function ensureWindPipelineRegistered(scene: Phaser.Scene): boolean {
  const renderer = scene.game.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return false;
  if (!renderer.pipelines.has(WIND_PIPELINE_KEY)) {
    renderer.pipelines.add(WIND_PIPELINE_KEY, new WindSwayPipeline(scene.game));
  }
  return true;
}

/**
 * Applies the batched WebGL wind sway pipeline to a plant/crop/tree sprite.
 * Offsets only the top two vertices so the bottom/roots remain 100% anchored while the canopy sways.
 * Trees use a dampened pixel sway (~1.35 world px) so they look heavy & sturdy,
 * whereas bushes/crops sway more visibly (~2.8–3.0 world px).
 */
export function applyWindShader(
  target: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
  swayPixels: number,
  phase: number,
): void {
  if (!ensureWindPipelineRegistered(target.scene)) return;
  windConfigs.set(target, { swayPixels, phase });
  target.setPipeline(WIND_PIPELINE_KEY);
}
