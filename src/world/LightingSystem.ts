import Phaser from 'phaser';

export interface PointLightSource {
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity?: number;
}

export interface SpotLightSource {
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  color: number;
  intensity?: number;
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpColor(c1: number, c2: number, t: number): number {
  const r = lerpChannel((c1 >> 16) & 0xff, (c2 >> 16) & 0xff, t);
  const g = lerpChannel((c1 >> 8) & 0xff, (c2 >> 8) & 0xff, t);
  const b = lerpChannel(c1 & 0xff, c2 & 0xff, t);
  return (r << 16) | (g << 8) | b;
}

/**
 * Day/Night Cycle + Multi-Colored Point & Spot Lighting System.
 * Renders a viewport-sized lightmap RenderTexture using MULTIPLY blending so colored
 * point lights and directional spotlights naturally illuminate the world at dusk/night.
 */
export class LightingSystem {
  private scene: Phaser.Scene;
  private lightmap: Phaser.GameObjects.RenderTexture;
  private glowOverlay: Phaser.GameObjects.Graphics;
  private stampImg: Phaser.GameObjects.Image;
  private spotImg: Phaser.GameObjects.Image;

  /** 0.00..0.20 Dawn, 0.20..0.60 Day, 0.60..0.78 Dusk, 0.78..1.00 Night */
  public timeOfDay = 0.32;
  public cycleDurationSec = 120;
  public paused = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.ensureLightTextures();

    const w = Math.max(320, scene.scale.width);
    const h = Math.max(200, scene.scale.height);

    this.lightmap = scene.add
      .renderTexture(0, 0, w, h)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(8900)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);

    this.glowOverlay = scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(8901)
      .setBlendMode(Phaser.BlendModes.ADD);

    // Off-scene stamp helpers (never added to display list directly)
    this.stampImg = scene.make.image({ key: '_light_radial', add: false });
    this.spotImg = scene.make.image({ key: '_light_cone', add: false }).setOrigin(0, 0.5);
  }

  private ensureLightTextures(): void {
    if (!this.scene.textures.exists('_light_radial')) {
      const tex = this.scene.textures.createCanvas('_light_radial', 64, 64);
      if (tex) {
        const ctx = tex.getContext();
        const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.45, 'rgba(255,255,255,0.65)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
        tex.refresh();
      }
    }

    if (!this.scene.textures.exists('_light_cone')) {
      const tex = this.scene.textures.createCanvas('_light_cone', 128, 64);
      if (tex) {
        const ctx = tex.getContext();
        const grad = ctx.createLinearGradient(0, 32, 128, 32);
        grad.addColorStop(0, 'rgba(255,255,255,0.95)');
        grad.addColorStop(0.65, 'rgba(255,255,255,0.45)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.moveTo(0, 28);
        ctx.lineTo(128, 2);
        ctx.lineTo(128, 62);
        ctx.lineTo(0, 36);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        tex.refresh();
      }
    }
  }

  public getPhaseLabel(): { label: string; clockStr: string; darkness: number } {
    const t = this.timeOfDay;
    const totalMinutes = Math.floor(t * 24 * 60);
    const hrs = Math.floor((totalMinutes / 60 + 6) % 24);
    const mins = totalMinutes % 60;
    const clockStr = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    if (t < 0.2) return { label: 'Dawn', clockStr, darkness: 0.35 };
    if (t < 0.6) return { label: 'Day', clockStr, darkness: 0 };
    if (t < 0.78) return { label: 'Dusk', clockStr, darkness: 0.45 };
    return { label: 'Night', clockStr, darkness: 1 };
  }

  public getAmbientColor(): { color: number; nightFactor: number } {
    const t = this.timeOfDay;
    const DAY = 0xffffff;
    const DAWN = 0xf2b59b;
    const DUSK = 0xd48599;
    const NIGHT = 0x3b4875;

    if (t < 0.2) {
      const k = t / 0.2;
      return { color: lerpColor(NIGHT, DAWN, k), nightFactor: 1 - k * 0.65 };
    }
    if (t < 0.28) {
      const k = (t - 0.2) / 0.08;
      return { color: lerpColor(DAWN, DAY, k), nightFactor: 0.35 * (1 - k) };
    }
    if (t < 0.6) {
      return { color: DAY, nightFactor: 0 };
    }
    if (t < 0.72) {
      const k = (t - 0.6) / 0.12;
      return { color: lerpColor(DAY, DUSK, k), nightFactor: k * 0.55 };
    }
    if (t < 0.82) {
      const k = (t - 0.72) / 0.1;
      return { color: lerpColor(DUSK, NIGHT, k), nightFactor: 0.55 + k * 0.45 };
    }
    if (t < 0.96) {
      return { color: NIGHT, nightFactor: 1 };
    }
    const k = (t - 0.96) / 0.04;
    return { color: lerpColor(NIGHT, NIGHT, k), nightFactor: 1 };
  }

  public update(
    dtMs: number,
    pointLights: PointLightSource[],
    spotLights: SpotLightSource[],
  ): void {
    if (!this.paused) {
      this.timeOfDay = (this.timeOfDay + dtMs / (this.cycleDurationSec * 1000)) % 1;
    }

    const cam = this.scene.cameras.main;
    const vw = Math.max(320, this.scene.scale.width);
    const vh = Math.max(200, this.scene.scale.height);
    if (this.lightmap.width !== vw || this.lightmap.height !== vh) {
      this.lightmap.resize(vw, vh);
    }

    const { color: ambient, nightFactor } = this.getAmbientColor();
    this.lightmap.fill(ambient, 1);
    this.glowOverlay.clear();

    const toScreenX = (wx: number) => (wx - cam.worldView.x) * cam.zoom;
    const toScreenY = (wy: number) => (wy - cam.worldView.y) * cam.zoom;

    // Stamp colored point lights into lightmap + subtle additive glow
    if (nightFactor > 0.04 || pointLights.length > 0) {
      for (const pl of pointLights) {
        const sx = toScreenX(pl.x);
        const sy = toScreenY(pl.y);
        const sr = pl.radius * cam.zoom;
        if (sx < -sr || sy < -sr || sx > vw + sr || sy > vh + sr) continue;

        const scale = (sr * 2) / 64;
        const intensity = Math.min(1, (pl.intensity ?? 0.9) * Math.max(0.25, nightFactor));
        if (nightFactor > 0.05) {
          this.stampImg
            .setPosition(sx, sy)
            .setScale(scale)
            .setTint(pl.color)
            .setAlpha(intensity)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.lightmap.draw(this.stampImg);
        }

        if (nightFactor > 0.15) {
          this.glowOverlay.fillStyle(pl.color, 0.08 * nightFactor * (pl.intensity ?? 1));
          this.glowOverlay.fillCircle(sx, sy, sr * 0.65);
        }
      }

      // Stamp directional spotlights
      for (const sp of spotLights) {
        const sx = toScreenX(sp.x);
        const sy = toScreenY(sp.y);
        const lenPx = sp.length * cam.zoom;
        const wPx = sp.width * cam.zoom;
        const intensity = Math.min(1, (sp.intensity ?? 0.9) * Math.max(0.25, nightFactor));
        if (nightFactor > 0.05) {
          this.spotImg
            .setPosition(sx, sy)
            .setRotation(sp.angle)
            .setScale(lenPx / 128, wPx / 64)
            .setTint(sp.color)
            .setAlpha(intensity)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.lightmap.draw(this.spotImg);
        }

        if (nightFactor > 0.18) {
          this.glowOverlay.fillStyle(sp.color, 0.07 * nightFactor);
          const halfSpread = Math.atan2(wPx * 0.45, lenPx);
          this.glowOverlay.beginPath();
          this.glowOverlay.moveTo(sx, sy);
          this.glowOverlay.arc(sx, sy, lenPx * 0.85, sp.angle - halfSpread, sp.angle + halfSpread, false);
          this.glowOverlay.closePath();
          this.glowOverlay.fillPath();
        }
      }
    }
  }

  public destroy(): void {
    this.lightmap.destroy();
    this.glowOverlay.destroy();
    this.stampImg.destroy();
    this.spotImg.destroy();
  }
}
