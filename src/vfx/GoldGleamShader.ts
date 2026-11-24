import Phaser from 'phaser';

export const GOLD_GLEAM_PIPELINE_KEY = 'GoldGleamPipeline';

const FRAG_SHADER = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTime;
uniform float uIntensity;
uniform float uSpeed;

varying vec2 outTexCoord;

void main() {
  vec4 col = texture2D(uMainSampler, outTexCoord);
  if (col.a < 0.02) {
    gl_FragColor = col;
    return;
  }

  float luma = dot(col.rgb, vec3(0.299, 0.587, 0.114));

  float cycle = fract(uTime * uSpeed);
  float sweepPos = -0.35 + cycle * 2.1;
  float diag = outTexCoord.x * 1.15 - outTexCoord.y * 0.45;
  float dist = abs(diag - sweepPos);

  float core = smoothstep(0.14, 0.0, dist);
  float sheen = smoothstep(0.34, 0.0, dist);
  float rimShimmer = 0.12 * smoothstep(0.52, 0.95, luma) * (0.65 + 0.35 * sin(uTime * 2.8 + outTexCoord.x * 12.0));

  vec3 warmGold = vec3(1.0, 0.84, 0.32);
  vec3 whiteGold = vec3(1.0, 0.97, 0.80);

  vec3 gleam = warmGold * (sheen * 0.52 + rimShimmer) + whiteGold * (core * 0.78);
  vec3 outRgb = clamp(col.rgb + gleam * uIntensity, 0.0, 1.0);

  gl_FragColor = vec4(outRgb * col.a + col.rgb * (1.0 - col.a), col.a);
}
`;

export class GoldGleamPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  public intensity = 1.0;
  public speed = 0.55;

  constructor(game: Phaser.Game) {
    super({
      game,
      name: GOLD_GLEAM_PIPELINE_KEY,
      fragShader: FRAG_SHADER,
    });
  }

  onPreRender(): void {
    this.set1f('uTime', (this.game.loop.time || 0) * 0.001);
    this.set1f('uIntensity', this.intensity);
    this.set1f('uSpeed', this.speed);
  }
}

export function ensureGoldGleamPipeline(scene: Phaser.Scene): boolean {
  const renderer = scene.game?.renderer;
  if (!renderer || renderer.type !== Phaser.WEBGL) return false;
  const webgl = renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!webgl.pipelines) return false;
  if (!webgl.pipelines.has(GOLD_GLEAM_PIPELINE_KEY)) {
    webgl.pipelines.addPostPipeline(GOLD_GLEAM_PIPELINE_KEY, GoldGleamPipeline);
  }
  return true;
}

export function applyGoldGleamShader(
  target: Phaser.GameObjects.GameObject,
  opts?: { intensity?: number; speed?: number },
): GoldGleamPipeline | null {
  const scene = target.scene;
  if (!scene || !ensureGoldGleamPipeline(scene)) return null;

  const fxTarget = target as Phaser.GameObjects.GameObject & {
    setPostPipeline?: (pipeline: string) => void;
    getPostPipeline?: (pipeline: string) => unknown;
  };
  if (typeof fxTarget.setPostPipeline !== 'function') return null;

  fxTarget.setPostPipeline(GOLD_GLEAM_PIPELINE_KEY);
  const raw = fxTarget.getPostPipeline?.(GOLD_GLEAM_PIPELINE_KEY);
  const pipeline = (Array.isArray(raw) ? raw[0] : raw) as GoldGleamPipeline | undefined;
  if (!pipeline) return null;

  if (opts?.intensity !== undefined) pipeline.intensity = opts.intensity;
  if (opts?.speed !== undefined) pipeline.speed = opts.speed;
  return pipeline;
}
