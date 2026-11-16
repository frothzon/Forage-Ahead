import Phaser from 'phaser';
import { ISLAND_CELL_TILES, TILE_PX, WORLD_TILES } from '../data/islands';
import type { TerrainType } from './AutoTiler';
import type { BuildingEntity } from './BuildingEntity';
import type { ResourceNode } from './ResourceNode';
import type { WindState } from './WeatherSystem';

const OCEAN_FRAG_SHADER = `
precision mediump float;

uniform vec2 resolution;
uniform float uTime;
uniform vec2 uCamPos;
uniform vec2 uCamSize;
uniform vec2 uWindDir;
uniform float uWindSpeed;
uniform float uNightFactor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  // screenUv: (0,0) top-left -> (1,1) bottom-right matching Phaser camera worldView
  vec2 screenUv = vec2(gl_FragCoord.x / max(1.0, resolution.x), 1.0 - gl_FragCoord.y / max(1.0, resolution.y));
  vec2 worldPos = uCamPos + screenUv * uCamSize;

  vec2 wDir = length(uWindDir) > 0.001 ? normalize(uWindDir) : vec2(1.0, 0.25);
  vec2 wPerp = vec2(-wDir.y, wDir.x);

  // Align ocean swells directly with current wind vector
  float along = dot(worldPos, wDir);
  float across = dot(worldPos, wPerp);
  float waveRate = 1.15 + uWindSpeed * 1.45;

  float swell1 = sin(along * 0.145 - uTime * waveRate + sin(across * 0.065 + uTime * 0.7) * 1.15);
  float swell2 = sin(along * 0.24 - across * 0.09 - uTime * (waveRate * 1.25));
  float waveBand = swell1 * 0.64 + swell2 * 0.36;

  // Stylised banded caustics (intersecting light lattice drifting gently)
  vec2 cUv1 = worldPos * 0.088 + wDir * (uTime * 0.28) + vec2(sin(worldPos.y * 0.07 + uTime), cos(worldPos.x * 0.07 - uTime * 0.8)) * 0.35;
  vec2 cUv2 = worldPos * 0.076 - wPerp * (uTime * 0.22) + vec2(cos(worldPos.y * 0.06 - uTime * 0.9), sin(worldPos.x * 0.06 + uTime)) * 0.35;
  float cellA = abs(sin(cUv1.x) * cos(cUv1.y));
  float cellB = abs(sin(cUv2.x + 1.2) * cos(cUv2.y - 0.8));
  float caustic = pow(clamp(1.0 - min(cellA, cellB) * 1.45, 0.0, 1.0), 2.8);

  // Base ocean teal-azure palette
  vec3 deepCol = vec3(0.16, 0.43, 0.58);
  vec3 midCol  = vec3(0.22, 0.56, 0.72);
  vec3 col = mix(deepCol, midCol, smoothstep(-0.6, 0.7, waveBand));

  // Add caustics beneath water surface
  col += vec3(0.18, 0.42, 0.48) * caustic * (0.65 - uNightFactor * 0.28);

  // Wind-driven foam crests on wave peaks
  float crest = smoothstep(0.68, 0.94, waveBand + (uWindSpeed - 1.0) * 0.14);
  col = mix(col, vec3(0.68, 0.91, 0.98), crest * 0.46);

  // Specular sun / moon glint reflections along wave crests
  float sparkleSeed = hash21(floor(worldPos * 0.48) + floor(uTime * 3.0) * 0.13);
  float glint = step(0.91, sparkleSeed) * smoothstep(0.35, 0.85, waveBand);
  vec3 glintCol = mix(vec3(0.95, 0.98, 1.0), vec3(0.75, 0.86, 1.0), uNightFactor);
  col += glintCol * glint * 0.38;

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
 * animated underwater caustics, coastal terrain/structure reflections, and fishing splashes.
 */
export class OceanSystem {
  private scene: Phaser.Scene;
  private shaderObj?: Phaser.GameObjects.Shader;
  private fallbackGfx?: Phaser.GameObjects.Graphics;
  private reflectionGfx: Phaser.GameObjects.Graphics;
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

    // Coastal & entity reflections render strictly BELOW terrainLayer (depth 1) so islands cleanly mask land
    this.reflectionGfx = scene.add.graphics().setDepth(0.65);
    // Concentric ripples render above ocean surface
    this.rippleGfx = scene.add.graphics().setDepth(0.85);
    // Splash droplets arc cleanly above entities
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

  public update(
    dtMs: number,
    wind: WindState,
    nightFactor: number,
    terrainGrid: TerrainType[][],
    nodes: ResourceNode[],
    buildings: BuildingEntity[],
  ): void {
    const dt = Math.min(0.05, dtMs / 1000);
    const tSec = this.scene.time.now * 0.001;
    const cam = this.scene.cameras.main;
    const vw = Math.max(320, this.scene.scale.width);
    const vh = Math.max(200, this.scene.scale.height);

    // 1. Update Ocean Wave & Caustics Shader
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

    // 2. Render Shoreline & Entity Reflections in adjacent water
    this.reflectionGfx.clear();
    const minTx = Math.max(0, Math.floor(cam.worldView.x / TILE_PX) - 1);
    const maxTx = Math.min(WORLD_TILES - 1, Math.ceil(cam.worldView.right / TILE_PX) + 1);
    const minTy = Math.max(0, Math.floor(cam.worldView.y / TILE_PX) - 1);
    const maxTy = Math.min(WORLD_TILES - 1, Math.ceil(cam.worldView.bottom / TILE_PX) + 1);

    const reflAlphaScale = 1 - nightFactor * 0.45;
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const tHere = terrainGrid[ty]?.[tx];
        if (!tHere || tHere === 'water') continue;
        // Reflect southern shoreline cliffs/land onto the water tile immediately below
        if (terrainGrid[ty + 1]?.[tx] === 'water') {
          const rx = tx * TILE_PX + 8 + Math.sin(tSec * 2.8 + tx * 0.9) * 1.4 * wind.dirX;
          const ry = (ty + 1) * TILE_PX + 4;
          const reflCol =
            tHere === 'winter'
              ? 0xbce3f7
              : tHere === 'autumn'
                ? 0xd6b072
                : tHere === 'graveyard'
                  ? 0x62737e
                  : tHere === 'infernal'
                    ? 0x9c4842
                    : 0x5aa864;
          this.reflectionGfx.fillStyle(0x16384a, 0.24 * reflAlphaScale);
          this.reflectionGfx.fillRect(rx - 8, ry - 4, 16, 4);
          this.reflectionGfx.fillStyle(reflCol, 0.16 * reflAlphaScale);
          this.reflectionGfx.fillRect(rx - 7, ry, 14, 5);
        }
      }
    }

    // Coastal Trees & Buildings mirrored softly onto south water tiles
    for (const n of nodes) {
      if (!n.active) continue;
      if (n.kind !== 'tree' && n.kind !== 'berry_bush') continue;
      if (n.x < cam.worldView.x - 24 || n.x > cam.worldView.right + 24) continue;
      if (n.y < cam.worldView.y - 24 || n.y > cam.worldView.bottom + 24) continue;
      const belowWater =
        terrainGrid[n.ty + 1]?.[n.tx] === 'water' || terrainGrid[n.ty + 2]?.[n.tx] === 'water';
      if (!belowWater) continue;
      const waveShift = Math.sin(tSec * 3.4 + n.tx * 1.1) * 1.6;
      const col = n.kind === 'tree' ? 0x2f6b47 : 0x3b804e;
      this.reflectionGfx.fillStyle(col, 0.19 * reflAlphaScale);
      this.reflectionGfx.fillEllipse(n.x + waveShift, n.y + 13, 12, 10);
      this.reflectionGfx.fillStyle(col, 0.12 * reflAlphaScale);
      this.reflectionGfx.fillEllipse(n.x - waveShift * 0.8, n.y + 20, 9, 6);
    }

    for (const b of buildings) {
      if (!b.active) continue;
      const belowWater =
        terrainGrid[b.ty + 1]?.[b.tx] === 'water' || terrainGrid[b.ty + 2]?.[b.tx] === 'water';
      if (!belowWater) continue;
      const waveShift = Math.sin(tSec * 3.2 + b.tx * 1.3) * 1.5;
      const isWarm = b.structureType === 'bonfire' || b.structureType === 'furnace' || b.structureType === 'lighthouse';
      const col = isWarm ? 0xffbf66 : 0x738596;
      this.reflectionGfx.fillStyle(col, (isWarm ? 0.24 : 0.18) * (isWarm ? 1 : reflAlphaScale));
      this.reflectionGfx.fillEllipse(b.x + waveShift, b.y + 12, 11, 9);
    }

    // Ignore unused import warning cleanly while keeping ISLAND_CELL_TILES handy if needed
    void ISLAND_CELL_TILES;

    // 3. Water Ripples & Fishing Splash Droplets
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
    this.reflectionGfx.destroy();
    this.rippleGfx.destroy();
    this.splashGfx.destroy();
  }
}
