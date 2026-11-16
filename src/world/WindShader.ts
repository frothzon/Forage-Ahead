import Phaser from 'phaser';

const WIND_FRAG_SHADER = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTime;
uniform float uSwayUv;
uniform float uPhase;
uniform float uWindBias;
uniform vec2 uUvBounds;

varying vec2 outTexCoord;

void main() {
  vec2 uv = outTexCoord;
  // uUvBounds.x = bottom of sprite in FBO UV.y (smaller), uUvBounds.y = top of sprite in FBO UV.y (larger)
  float span = max(0.0001, uUvBounds.y - uUvBounds.x);
  float normY = clamp((uv.y - uUvBounds.x) / span, 0.0, 1.0);
  // Keep bottom 16% (ground padding + root/trunk/stem base) completely anchored (0.00 displacement)
  float upper = clamp((normY - 0.16) / 0.84, 0.0, 1.0);
  float heightWeight = pow(upper, 1.65);

  float gust = sin(uTime * 2.1 + uPhase + normY * 2.2) * 0.72 + sin(uTime * 3.8 + uPhase * 1.35) * 0.28 + uWindBias;
  uv.x += gust * uSwayUv * heightWeight;

  if (uv.x < 0.0 || uv.x > 1.0) {
    gl_FragColor = vec4(0.0);
  } else {
    gl_FragColor = texture2D(uMainSampler, uv);
  }
}
`;

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

export class WindSwayPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private swayPixels = 2.0;
  private phase = 0;

  constructor(game: Phaser.Game) {
    super({
      game,
      name: WIND_PIPELINE_KEY,
      fragShader: WIND_FRAG_SHADER,
    });
  }

  public configure(swayPixels: number, phase: number): this {
    this.swayPixels = swayPixels;
    this.phase = phase;
    return this;
  }

  onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget): void {
    const go = this.gameObject as Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | undefined;
    const cam = go?.scene?.cameras?.main;

    let botUvY = 0;
    let topUvY = 1;
    let swayUv = this.swayPixels / Math.max(1, renderTarget.width);

    if (go && cam && cam.height > 0) {
      const m = go.getWorldTransformMatrix();
      const topWorld = m.transformPoint(0, -go.displayOriginY);
      const botWorld = m.transformPoint(0, go.height - go.displayOriginY);

      const sfx = go.scrollFactorX ?? 1;
      const sfy = go.scrollFactorY ?? 1;
      const camMatrix = (cam as unknown as { matrix?: Phaser.GameObjects.Components.TransformMatrix }).matrix;
      let topScreenY: number;
      let botScreenY: number;
      if (camMatrix) {
        topScreenY = camMatrix.transformPoint(topWorld.x - cam.scrollX * sfx, topWorld.y - cam.scrollY * sfy).y;
        botScreenY = camMatrix.transformPoint(botWorld.x - cam.scrollX * sfx, botWorld.y - cam.scrollY * sfy).y;
      } else {
        const originPxY = cam.height * cam.originY;
        topScreenY = (topWorld.y - cam.scrollY * sfy - originPxY) * cam.zoomY + cam.y + originPxY;
        botScreenY = (botWorld.y - cam.scrollY * sfy - originPxY) * cam.zoomY + cam.y + originPxY;
      }

      // WebGL RenderTarget outTexCoord.y has 0 at bottom and 1 at top
      const rawTopUv = 1 - topScreenY / cam.height;
      const rawBotUv = 1 - botScreenY / cam.height;
      botUvY = Math.min(rawBotUv, rawTopUv);
      topUvY = Math.max(rawBotUv, rawTopUv);

      swayUv = (this.swayPixels * globalWindStrength * cam.zoom) / Math.max(1, renderTarget.width);
    }

    this.set1f('uTime', this.game.loop.time / 1000);
    this.set1f('uSwayUv', swayUv);
    this.set1f('uPhase', this.phase);
    this.set1f('uWindBias', globalWindDirX * 0.35);
    this.set2f('uUvBounds', botUvY, topUvY);
    this.bindAndDraw(renderTarget);
  }
}

export function ensureWindPipelineRegistered(scene: Phaser.Scene): boolean {
  const renderer = scene.game.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return false;
  if (!renderer.pipelines.has(WIND_PIPELINE_KEY)) {
    renderer.pipelines.addPostPipeline(WIND_PIPELINE_KEY, WindSwayPipeline);
  }
  return true;
}

/**
 * Applies the WebGL wind sway shader to a plant/crop/tree sprite.
 * Uses local vertical bounds so the bottom/roots remain 100% anchored while only the upper canopy sways.
 * Trees use a dampened pixel sway (~1.35 world px) so they look heavy & sturdy,
 * whereas bushes/crops sway more visibly (~2.8–3.0 world px).
 */
export function applyWindShader(
  target: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
  swayPixels: number,
  phase: number,
): void {
  if (!ensureWindPipelineRegistered(target.scene)) return;
  target.setPostPipeline(WIND_PIPELINE_KEY);
  const pipe = target.getPostPipeline(WIND_PIPELINE_KEY) as WindSwayPipeline | WindSwayPipeline[] | undefined;
  const inst = Array.isArray(pipe) ? pipe[0] : pipe;
  inst?.configure(swayPixels, phase);
}
