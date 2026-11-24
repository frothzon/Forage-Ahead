import Phaser from 'phaser';

export const CYLINDER_WORLD_PIPELINE_KEY = 'CylinderWorldPipeline';

const FRAG_SHADER = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uHorizonY;
uniform float uCurvature;
uniform float uTaper;
uniform float uTime;

varying vec2 outTexCoord;

void main() {
  vec2 uv = outTexCoord;
  float sy = 1.0 - uv.y;
  float dx = uv.x - 0.5;
  float horizon = uHorizonY + uCurvature * (dx * dx) * 4.0;

  if (sy < horizon) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float t = clamp((sy - horizon) / max(0.001, 1.0 - horizon), 0.0, 1.0);
  float widthScale = mix(1.0 - uTaper, 1.05, pow(t, 0.85));
  float sampleX = 0.5 + dx / widthScale;

  float worldY = pow(t, 0.72);
  vec4 col = (sampleX < 0.0 || sampleX > 1.0)
    ? vec4(0.1765, 0.5255, 0.7216, 1.0)
    : texture2D(uMainSampler, vec2(sampleX, 1.0 - worldY));

  float haze = pow(1.0 - t, 2.6) * 0.55;
  col.rgb = mix(col.rgb, vec3(0.98, 0.84, 0.72) * col.a, haze);

  float edgeAlpha = smoothstep(0.0, 0.018, t);
  col *= edgeAlpha;

  gl_FragColor = col;
}
`;

export class CylinderWorldPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  public horizonY = 0.36;
  public curvature = 0.075;
  public taper = 0.42;

  constructor(game: Phaser.Game) {
    super({
      game,
      name: CYLINDER_WORLD_PIPELINE_KEY,
      fragShader: FRAG_SHADER,
    });
  }

  onPreRender(): void {
    this.set1f('uHorizonY', this.horizonY);
    this.set1f('uCurvature', this.curvature);
    this.set1f('uTaper', this.taper);
    this.set1f('uTime', (this.game.loop.time || 0) * 0.001);
  }
}

export function ensureCylinderWorldPipeline(scene: Phaser.Scene): boolean {
  const renderer = scene.game?.renderer;
  if (!renderer || renderer.type !== Phaser.WEBGL) return false;
  const webgl = renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!webgl.pipelines) return false;
  if (!webgl.pipelines.has(CYLINDER_WORLD_PIPELINE_KEY)) {
    webgl.pipelines.addPostPipeline(CYLINDER_WORLD_PIPELINE_KEY, CylinderWorldPipeline);
  }
  return true;
}

export interface CylinderWorldOptions {
  horizonY?: number;
  curvature?: number;
  taper?: number;
}

export function projectPointOnCylinder(
  screenX: number,
  screenY: number,
  viewW: number,
  viewH: number,
  opts?: CylinderWorldOptions,
): { x: number; y: number; scale: number; normalAngle: number } {
  const horizonY = opts?.horizonY ?? 0.36;
  const curvature = opts?.curvature ?? 0.075;
  const taper = opts?.taper ?? 0.42;

  const worldXNorm = screenX / Math.max(1, viewW);
  const worldYNorm = Phaser.Math.Clamp(screenY / Math.max(1, viewH), 0, 1);
  const t = Math.pow(worldYNorm, 1 / 0.72);
  const widthScale = 1 - taper + (1.05 - (1 - taper)) * Math.pow(t, 0.85);
  const outXNorm = 0.5 + (worldXNorm - 0.5) * widthScale;
  const dxOut = outXNorm - 0.5;
  const horizon = horizonY + curvature * dxOut * dxOut * 4.0;
  const outY = (horizon + (1 - horizon) * t) * viewH;
  const outX = outXNorm * viewW;
  const scale = 0.6 + 0.46 * Math.pow(t, 0.75);
  const normalAngle = dxOut * 0.24;

  return { x: outX, y: outY, scale, normalAngle };
}

export function applyCylinderWorldShader(
  target: {
    scene?: Phaser.Scene;
    setPostPipeline?: (pipeline: string) => unknown;
    getPostPipeline?: (pipeline: string) => unknown;
  },
  opts?: CylinderWorldOptions,
): CylinderWorldPipeline | null {
  const scene = target.scene;
  if (!scene || !ensureCylinderWorldPipeline(scene)) return null;
  if (typeof target.setPostPipeline !== 'function') return null;

  target.setPostPipeline(CYLINDER_WORLD_PIPELINE_KEY);
  const raw = target.getPostPipeline?.(CYLINDER_WORLD_PIPELINE_KEY);
  const pipeline = (Array.isArray(raw) ? raw[0] : raw) as CylinderWorldPipeline | undefined;
  if (!pipeline) return null;

  if (opts?.horizonY !== undefined) pipeline.horizonY = opts.horizonY;
  if (opts?.curvature !== undefined) pipeline.curvature = opts.curvature;
  if (opts?.taper !== undefined) pipeline.taper = opts.taper;
  return pipeline;
}
