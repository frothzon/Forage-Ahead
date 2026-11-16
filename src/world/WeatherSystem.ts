import Phaser from 'phaser';
import type { BiomeKind } from '../data/islands';
import type { WeatherLightModifier } from './LightingSystem';
import { setGlobalWind } from './WindShader';
import {
  WEATHER_LABELS,
  getCompassLabel,
  periodicPerlinFbm2D,
  rollWeatherForBiome,
  rollWindForDay,
  type WeatherKind,
  type WindState,
} from './weatherRules';

export {
  WEATHER_LABELS,
  getCompassLabel,
  rollWeatherForBiome,
  rollWindForDay,
  type WeatherKind,
  type WindState,
};

interface WeatherParticle {
  x: number;
  y: number;
  speed: number;
  len: number;
  size: number;
  phase: number;
  alpha: number;
}

const CLOUD_SHADOW_TEX_KEY = '_perlin_cloud_shadows';

/**
 * Biome-aware Weather & Wind System:
 * - Invisible clouds casting seamless 2D Gradient Perlin Noise FBM ground shadows
 * - Day-to-day wind strength & direction driving foliage wind shader + ocean waves
 * - Rain streaks, snowflakes, persistent desert haze, and light desert sandstorms
 */
export class WeatherSystem {
  private scene: Phaser.Scene;
  private cloudTile: Phaser.GameObjects.TileSprite;
  private hazeGfx: Phaser.GameObjects.Graphics;
  private precipGfx: Phaser.GameObjects.Graphics;

  public currentBiome: BiomeKind = 'grass';
  public currentDay = 1;
  public weather: WeatherKind = 'sunny';
  public wind: WindState = rollWindForDay(1);

  private manualOverride: WeatherKind | null = null;
  private hazeAlpha = 0;
  private hazeColor = 0xe6ba78;
  private cloudOpacity = 0.28;
  private cloudDriftX = 0;
  private cloudDriftY = 0;
  private particles: WeatherParticle[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.ensurePerlinCloudTexture();

    const vw = Math.max(320, scene.scale.width);
    const vh = Math.max(200, scene.scale.height);

    // Seamless Perlin-noise cloud shadows drifted across the world (no visible clouds)
    this.cloudTile = scene.add
      .tileSprite(0, 0, vw, vh, CLOUD_SHADOW_TEX_KEY)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(8800)
      .setAlpha(this.cloudOpacity);

    // Desert / heat atmospheric haze overlay
    this.hazeGfx = scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(8840);

    // Rain / snow / sandstorm grains
    this.precipGfx = scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(8860);

    this.initParticles();
    this.applyWindToWorld();
  }

  private ensurePerlinCloudTexture(): void {
    if (this.scene.textures.exists(CLOUD_SHADOW_TEX_KEY)) return;
    const size = 256;
    const tex = this.scene.textures.createCanvas(CLOUD_SHADOW_TEX_KEY, size, size);
    if (!tex) return;
    const ctx = tex.getContext();
    const img = ctx.createImageData(size, size);
    const data = img.data;

    for (let y = 0; y < size; y++) {
      const vNorm = y / size;
      for (let x = 0; x < size; x++) {
        const uNorm = x / size;
        const n = periodicPerlinFbm2D(uNorm, vNorm, 4, 73);
        // Smoothstep threshold into soft organic cloud shadow billows
        const t = Math.max(0, Math.min(1, (n + 0.04) / 0.34));
        const smooth = t * t * (3 - 2 * t);
        const alpha = Math.round(smooth * 132); // up to ~52% shadow opacity when tile alpha = 1
        const i = (y * size + x) * 4;
        data[i] = 10;
        data[i + 1] = 20;
        data[i + 2] = 40;
        data[i + 3] = alpha;
      }
    }

    ctx.putImageData(img, 0, 0);
    tex.refresh();
  }

  private initParticles(): void {
    this.particles = [];
    for (let i = 0; i < 110; i++) {
      this.particles.push({
        x: Math.random() * 1400,
        y: Math.random() * 820,
        speed: 0.75 + Math.random() * 0.6,
        len: 8 + Math.random() * 8,
        size: 1.5 + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.45 + Math.random() * 0.45,
      });
    }
  }

  public applyWindToWorld(): void {
    setGlobalWind(this.wind.strength, this.wind.dirX);
  }

  public setDay(dayNumber: number): void {
    this.currentDay = Math.max(1, dayNumber);
    this.wind = rollWindForDay(this.currentDay);
    this.applyWindToWorld();
    if (!this.manualOverride) {
      this.weather = rollWeatherForBiome(this.currentBiome, this.currentDay);
    }
  }

  public setBiome(biome: BiomeKind): void {
    if (this.currentBiome === biome) return;
    this.currentBiome = biome;
    if (!this.manualOverride) {
      this.weather = rollWeatherForBiome(biome, this.currentDay);
    }
  }

  public setDebugWeather(kind: WeatherKind | 'auto'): void {
    if (kind === 'auto') {
      this.manualOverride = null;
      this.weather = rollWeatherForBiome(this.currentBiome, this.currentDay);
    } else {
      this.manualOverride = kind;
      this.weather = kind;
    }
  }

  public bumpWind(strength?: number): void {
    this.wind = rollWindForDay(this.currentDay + Math.floor(Math.random() * 97) + 1, strength);
    this.applyWindToWorld();
  }

  public getLightModifier(): WeatherLightModifier {
    switch (this.weather) {
      case 'cloudy':
        return { tint: 0xd9e4f2, darknessBoost: 0.14 };
      case 'rain':
        return { tint: 0xb5cae3, darknessBoost: 0.25 };
      case 'snow':
        return { tint: 0xe6f1fc, darknessBoost: 0.12 };
      case 'sandstorm':
        return { tint: 0xedd29f, darknessBoost: 0.16 };
      case 'sunny':
      default:
        return { tint: 0xffffff, darknessBoost: 0 };
    }
  }

  public getStatusLabel(): string {
    const hazeTag = this.currentBiome === 'autumn' && this.weather !== 'sandstorm' ? ' • Hazy' : '';
    const windTier =
      this.wind.strength >= 1.45 ? 'Gale' : this.wind.strength >= 1.05 ? 'Gusty' : this.wind.strength >= 0.7 ? 'Breeze' : 'Calm';
    return `${WEATHER_LABELS[this.weather]}${hazeTag} • Wind ${windTier} ${this.wind.compass}`;
  }

  public update(dtMs: number): void {
    const dt = Math.min(0.05, dtMs / 1000);
    const vw = Math.max(320, this.scene.scale.width);
    const vh = Math.max(200, this.scene.scale.height);
    const cam = this.scene.cameras.main;

    // 1. Perlin-Noise Cloud Shadows drifting in world coordinates with wind
    const targetCloudAlpha =
      this.weather === 'cloudy'
        ? 0.92
        : this.weather === 'rain' || this.weather === 'snow' || this.weather === 'sandstorm'
          ? 0.68
          : 0.28;
    this.cloudOpacity += (targetCloudAlpha - this.cloudOpacity) * Math.min(1, dt * 2.5);

    const driftSpeed = 16 * Math.max(0.45, this.wind.strength);
    this.cloudDriftX -= this.wind.dirX * driftSpeed * dt;
    this.cloudDriftY -= this.wind.dirY * driftSpeed * dt;

    if (this.cloudTile.width !== vw || this.cloudTile.height !== vh) {
      this.cloudTile.setSize(vw, vh);
    }
    const worldScale = 1.65 * cam.zoom;
    this.cloudTile.setTileScale(worldScale, worldScale);
    this.cloudTile.tilePositionX = (cam.worldView.x * cam.zoom + this.cloudDriftX * cam.zoom) / worldScale;
    this.cloudTile.tilePositionY = (cam.worldView.y * cam.zoom + this.cloudDriftY * cam.zoom) / worldScale;
    this.cloudTile.setAlpha(this.cloudOpacity);

    // 2. Desert / Volcanic Atmospheric Haze
    let targetHazeAlpha = 0;
    let targetHazeColor = 0xe6ba78;
    if (this.currentBiome === 'autumn') {
      targetHazeColor = 0xe8c382;
      targetHazeAlpha = this.weather === 'sandstorm' ? 0.24 : 0.12;
    } else if (this.currentBiome === 'infernal') {
      targetHazeColor = 0xc95d3e;
      targetHazeAlpha = this.weather === 'sandstorm' ? 0.2 : 0.08;
    } else if (this.weather === 'sandstorm') {
      targetHazeColor = 0xe2bc7e;
      targetHazeAlpha = 0.22;
    }
    this.hazeAlpha += (targetHazeAlpha - this.hazeAlpha) * Math.min(1, dt * 2.5);
    this.hazeColor = targetHazeColor;
    this.hazeGfx.clear();
    if (this.hazeAlpha > 0.01) {
      const shimmer = 1 + Math.sin(this.scene.time.now * 0.0022) * 0.08;
      this.hazeGfx.fillStyle(this.hazeColor, this.hazeAlpha * shimmer);
      this.hazeGfx.fillRect(0, 0, vw, vh);
    }

    // 3. Precipitation (Rain, Snow, Light Sandstorm Grains)
    this.precipGfx.clear();
    if (this.weather !== 'rain' && this.weather !== 'snow' && this.weather !== 'sandstorm') return;

    const count =
      this.weather === 'rain' ? 105 : this.weather === 'sandstorm' ? 85 : 75;
    const tSec = this.scene.time.now * 0.001;

    for (let i = 0; i < count; i++) {
      const p = this.particles[i];
      if (this.weather === 'rain') {
        const vx = this.wind.dirX * 150 * this.wind.strength;
        const vy = 440 * p.speed;
        p.x = (p.x + vx * dt + vw) % vw;
        p.y = (p.y + vy * dt + vh) % vh;

        const norm = Math.hypot(vx, vy) || 1;
        const sx = p.x - (vx / norm) * p.len;
        const sy = p.y - (vy / norm) * p.len;
        this.precipGfx.lineStyle(1.3, 0xa8d8ff, p.alpha * 0.72);
        this.precipGfx.lineBetween(sx, sy, p.x, p.y);
      } else if (this.weather === 'snow') {
        const vx = (this.wind.dirX * 52 * this.wind.strength) + Math.sin(tSec * 2 + p.phase) * 18;
        const vy = 48 * p.speed;
        p.x = (p.x + vx * dt + vw) % vw;
        p.y = (p.y + vy * dt + vh) % vh;
        this.precipGfx.fillStyle(0xf5f9ff, p.alpha * 0.88);
        this.precipGfx.fillCircle(p.x, p.y, p.size * 0.85);
      } else {
        const wx = this.wind.dirX || 0.9;
        const wy = this.wind.dirY * 0.45 + 0.15;
        const spd = 240 * p.speed * Math.max(0.9, this.wind.strength);
        p.x = (p.x + wx * spd * dt + vw) % vw;
        p.y = (p.y + wy * spd * dt + vh) % vh;

        this.precipGfx.lineStyle(1.4, 0xf2d194, p.alpha * 0.55);
        this.precipGfx.lineBetween(p.x - wx * p.len * 1.4, p.y - wy * p.len * 1.4, p.x, p.y);
        this.precipGfx.fillStyle(0xf7dfb0, p.alpha * 0.75);
        this.precipGfx.fillCircle(p.x, p.y, 1.1);
      }
    }
  }

  public destroy(): void {
    this.cloudTile.destroy();
    this.hazeGfx.destroy();
    this.precipGfx.destroy();
  }
}
