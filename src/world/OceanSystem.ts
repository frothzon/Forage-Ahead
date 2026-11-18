import Phaser from 'phaser';
import type { WindState } from './WeatherSystem';

const OCEAN_FRAG_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 resolution;
uniform float uTime;
uniform vec2 uCamPos;
uniform vec2 uCamSize;
uniform vec2 uWindDir;
uniform float uWindSpeed;
uniform float uNightFactor;

void main() {
  vec2 screenUv = vec2(gl_FragCoord.x / max(1.0, resolution.x), 1.0 - gl_FragCoord.y / max(1.0, resolution.y));
  vec2 worldPos = uCamPos + screenUv * uCamSize;

  vec2 wDir = length(uWindDir) > 0.001 ? normalize(uWindDir) : vec2(1.0, 0.25);
  vec2 wPerp = vec2(-wDir.y, wDir.x);

  float along = dot(worldPos, wDir);
  float across = dot(worldPos, wPerp);
  float waveRate = 1.65 + uWindSpeed * 1.55;

  float swell1 = sin(along * 0.14 - uTime * waveRate + sin(across * 0.065 + uTime * 0.9) * 1.15);
  float swell2 = sin(along * 0.23 - across * 0.09 - uTime * (waveRate * 1.25));
  float waveBand = swell1 * 0.64 + swell2 * 0.36;

  // Fast stylized caustics (no expensive pow() on mobile GPUs)
  vec2 cUv1 = worldPos * 0.088 + wDir * (uTime * 0.45);
  vec2 cUv2 = worldPos * 0.074 - wPerp * (uTime * 0.35);
  float cellA = abs(sin(cUv1.x + sin(cUv1.y * 0.8 + uTime)) * cos(cUv1.y));
  float cellB = abs(sin(cUv2.x + 1.2) * cos(cUv2.y - 0.8 + cos(cUv2.x * 0.7 - uTime)));
  float cRaw = clamp(1.0 - min(cellA, cellB) * 1.45, 0.0, 1.0);
  float caustic = cRaw * cRaw * cRaw;

  vec3 deepCol = vec3(0.12, 0.40, 0.60);
  vec3 midCol  = vec3(0.22, 0.60, 0.80);
  vec3 col = mix(deepCol, midCol, smoothstep(-0.55, 0.65, waveBand));

  col += vec3(0.26, 0.54, 0.62) * caustic * (0.78 - uNightFactor * 0.30);

  float crest = smoothstep(0.62, 0.92, waveBand + (uWindSpeed - 1.0) * 0.14);
  col = mix(col, vec3(0.74, 0.94, 1.0), crest * 0.56);

  gl_FragColor = vec4(col, 1.0);
}
`;

interface WaterRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  ageMs: number;
  lifeMs: number;
}

interface SplashDroplet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  vz: number;
  color: number;
  size: number;
  ageMs: number;
  lifeMs: number;
}

/**
 * Renders dynamic ocean wave patterns aligned with the active wind vector,
 * animated underwater caustics, specular wave glints, and fishing splash effects.
 */
export class OceanSystem {
  private scene: Phaser.Scene;
  private shaderObj?: Phaser.GameObjects.Shader;
  private fallbackGfx?: Phaser.GameObjects.Graphics;
  private rippleGfx: Phaser.GameObjects.Graphics;
  private splashGfx: Phaser.GameObjects.Graphics;

  private ripples: WaterRipple[] = [];
  private droplets: SplashDroplet[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const w = Math.max(320, scene.scale.width);
    const h = Math.max(200, scene.scale.height);

    if (scene.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      const baseShader = new Phaser.Display.BaseShader('ocean_waves', OCEAN_FRAG_SHADER, undefined, {
        uTime: { type: '1f', value: 0 },
        uCamPos: { type: '2f', value: { x: 0, y: 0 } },
        uCamSize: { type: '2f', value: { x: 512, y: 288 } },
        uWindDir: { type: '2f', value: { x: 1, y: 0.25 } },
        uWindSpeed: { type: '1f', value: 1 },
        uNightFactor: { type: '1f', value: 0 },
      });
      this.shaderObj = scene.add
        .shader(baseShader, 0, 0, w, h)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(0.35);
    } else {
      this.fallbackGfx = scene.add.graphics().setScrollFactor(0).setDepth(0.35);
    }

    this.rippleGfx = scene.add.graphics().setDepth(0.85);
    this.splashGfx = scene.add.graphics().setDepth(5200);
  }

  public spawnSplash(x: number, y: number, intensity = 1): void {
    const ringCount = intensity >= 1.2 ? 3 : 2;
    for (let i = 0; i < ringCount; i++) {
      this.ripples.push({
        x,
        y,
        radius: 2 + i * 2.5,
        maxRadius: (11 + i * 4.5) * Math.max(0.75, intensity),
        alpha: 0.85 - i * 0.16,
        ageMs: -i * 110,
        lifeMs: 680 + i * 140,
      });
    }

    const drops = Math.round(7 * intensity);
    for (let i = 0; i < drops; i++) {
      const ang = (Math.PI * 2 * i) / drops + (Math.random() - 0.5) * 0.45;
      const hSpd = 12 + Math.random() * 24 * intensity;
      this.droplets.push({
        x,
        y,
        vx: Math.cos(ang) * hSpd,
        vy: Math.sin(ang) * hSpd * 0.55,
        z: 1,
        vz: 48 + Math.random() * 36 * intensity,
        color: i % 2 === 0 ? 0xe0f7ff : 0x8be4ff,
        size: intensity >= 1.2 ? 1.8 : 1.35,
        ageMs: 0,
        lifeMs: 360 + Math.random() * 180,
      });
    }
  }

  public update(dtMs: number, wind: WindState, nightFactor: number): void {
    const dt = Math.min(0.05, dtMs / 1000);
    const tSec = (this.scene.time.now * 0.001) % 628.3185;
    const cam = this.scene.cameras.main;
    const vw = Math.max(320, this.scene.scale.width);
    const vh = Math.max(200, this.scene.scale.height);

    if (this.shaderObj) {
      if (this.shaderObj.width !== vw || this.shaderObj.height !== vh) {
        this.shaderObj.setSize(vw, vh);
      }
      this.shaderObj.setUniform('uTime.value', tSec);
      this.shaderObj.setUniform('uCamPos.value.x', cam.worldView.x);
      this.shaderObj.setUniform('uCamPos.value.y', cam.worldView.y);
      this.shaderObj.setUniform('uCamSize.value.x', cam.worldView.width);
      this.shaderObj.setUniform('uCamSize.value.y', cam.worldView.height);
      this.shaderObj.setUniform('uWindDir.value.x', wind.dirX);
      this.shaderObj.setUniform('uWindDir.value.y', wind.dirY);
      this.shaderObj.setUniform('uWindSpeed.value', wind.strength);
      this.shaderObj.setUniform('uNightFactor.value', nightFactor);
    } else if (this.fallbackGfx) {
      this.fallbackGfx.clear();
      this.fallbackGfx.fillStyle(0x2d7798, 1);
      this.fallbackGfx.fillRect(0, 0, vw, vh);
    }

    this.rippleGfx.clear();
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rp = this.ripples[i];
      rp.ageMs += dtMs;
      if (rp.ageMs < 0) continue;
      if (rp.ageMs >= rp.lifeMs) {
        this.ripples.splice(i, 1);
        continue;
      }
      const p = rp.ageMs / rp.lifeMs;
      const curR = rp.radius + (rp.maxRadius - rp.radius) * p;
      const a = rp.alpha * (1 - p);
      this.rippleGfx.lineStyle(1.2, 0xcff7ff, a);
      this.rippleGfx.strokeEllipse(rp.x, rp.y, curR * 2, curR * 1.15);
    }

    this.splashGfx.clear();
    for (let i = this.droplets.length - 1; i >= 0; i--) {
      const d = this.droplets[i];
      d.ageMs += dtMs;
      if (d.ageMs >= d.lifeMs) {
        this.droplets.splice(i, 1);
        continue;
      }
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vz -= 165 * dt;
      d.z = Math.max(0, d.z + d.vz * dt);
      const a = 1 - d.ageMs / d.lifeMs;
      this.splashGfx.fillStyle(d.color, a);
      this.splashGfx.fillCircle(d.x, d.y - d.z, d.size);
    }
  }

  public destroy(): void {
    this.shaderObj?.destroy();
    this.fallbackGfx?.destroy();
    this.rippleGfx.destroy();
    this.splashGfx.destroy();
  }
}
