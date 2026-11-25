import Phaser from 'phaser';
import { onSettingsChange, settingsStore } from '../core/GameSettings';

export interface PointLightSource {
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity?: number;
  /** Optional subtle illumination even during overcast daytime */
  dayVisible?: boolean;
  /** Optional sinusoidal+noise hearth flicker for torches/bonfires/furnaces */
  flicker?: boolean;
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

export interface WeatherLightModifier {
  /** Multiplier tint for atmospheric weather (0xffffff = none) */
  tint?: number;
  /** Extra darkness factor [0..0.45] on cloudy/stormy/night-like overcast days */
  darknessBoost?: number;
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

function multiplyColors(c1: number, c2: number): number {
  const r = Math.round((((c1 >> 16) & 0xff) * ((c2 >> 16) & 0xff)) / 255);
  const g = Math.round((((c1 >> 8) & 0xff) * ((c2 >> 8) & 0xff)) / 255);
  const b = Math.round(((c1 & 0xff) * (c2 & 0xff)) / 255);
  return (r << 16) | (g << 8) | b;
}

/**
 * Day/Night Cycle + Multi-Colored Point & Soft-Falloff Tower Spot Lighting System.
 * Renders a viewport-sized lightmap RenderTexture using MULTIPLY blending so circular
 * point lights and smooth-fading spotlights illuminate the world naturally.
 */
export class LightingSystem {
  private static readonly EDGE_PAD = 64;
  private static readonly MAX_DARKNESS_OPACITY = 0.65;
  private static readonly LIGHT_REDRAW_INTERVAL_MS = 33;

  private scene: Phaser.Scene;
  private lightmap: Phaser.GameObjects.RenderTexture;
  private beamMap: Phaser.GameObjects.RenderTexture;
  private stampImg: Phaser.GameObjects.Image;
  private spotImg: Phaser.GameObjects.Image;
  private pureAddBlendMode: number = Phaser.BlendModes.ADD;
  private lastRenderTime = -Infinity;
  private lastRenderViewX = 0;
  private lastRenderViewY = 0;
  private lastRenderZoom = 1;
  private lastAmbient = -1;
  private forceRedraw = true;
  private beamMapClean = true;
  private dynamicLightingEnabled = true;
  private unsubSettings?: () => void;
  private destroyed = false;

  /** 0.00..0.20 Dawn, 0.20..0.60 Day, 0.60..0.78 Dusk, 0.78..1.00 Night */
  public timeOfDay = 0.32;
  public dayNumber = 1;
  public cycleDurationSec = 360;
  public paused = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.ensureLightTextures();

    const w = Math.max(320, scene.scale.width);
    const h = Math.max(200, scene.scale.height);
    const pad = LightingSystem.EDGE_PAD;
    const rtW = w + pad * 2;
    const rtH = h + pad * 2;

    this.lightmap = scene.add
      .renderTexture(w / 2, h / 2, rtW, rtH)
      .setOrigin(0.5, 0.5)
      .setFlipY(true)
      .setScrollFactor(0)
      .setDepth(8900)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);

    this.beamMap = scene.add
      .renderTexture(w / 2, h / 2, rtW, rtH)
      .setOrigin(0.5, 0.5)
      .setFlipY(true)
      .setScrollFactor(0)
      .setDepth(8901)
      .setBlendMode(Phaser.BlendModes.ADD);

    // Register pure RGB additive blend mode (ONE, ONE, ZERO, ONE) so dst.alpha stays 1.0
    // and overlapping light quads never carve dark squares via DST_ALPHA.
    const renderer = scene.renderer;
    if (renderer && renderer.type === Phaser.WEBGL) {
      const glRenderer = renderer as Phaser.Renderer.WebGL.WebGLRenderer;
      const gl = glRenderer.gl;
      this.pureAddBlendMode = glRenderer.addBlendMode(
        [gl.ONE, gl.ONE, gl.ZERO, gl.ONE],
        gl.FUNC_ADD,
      );
    }

    // Off-scene stamp helpers
    this.stampImg = scene.make.image({ key: '_light_radial', add: false });
    // Anchor at left emitter tip inside 256x128 cone texture (x = 12px / 256 = 0.047)
    this.spotImg = scene.make.image({ key: '_light_cone_soft', add: false }).setOrigin(12 / 256, 0.5);

    this.setDynamicLightingEnabled(settingsStore.get().graphics.dynamicLighting);
    this.unsubSettings = onSettingsChange((s) => {
      this.setDynamicLightingEnabled(s.graphics.dynamicLighting);
    });
    scene.events?.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupSettingsSub, this);
    scene.events?.once(Phaser.Scenes.Events.DESTROY, this.cleanupSettingsSub, this);
  }

  private cleanupSettingsSub(): void {
    if (this.unsubSettings) {
      this.unsubSettings();
      this.unsubSettings = undefined;
    }
  }

  public setDynamicLightingEnabled(enabled: boolean): void {
    this.dynamicLightingEnabled = enabled;
    if (this.destroyed) return;
    if (!enabled) {
      this.lightmap.setVisible(false);
      this.beamMap.setVisible(false);
    } else {
      this.lightmap.setVisible(true);
      this.forceRedraw = true;
    }
  }

  private ensureLightTextures(): void {
    if (!this.scene.textures.exists('_light_radial')) {
      const tex = this.scene.textures.createCanvas('_light_radial', 128, 128);
      if (tex) {
        const ctx = tex.getContext();
        const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.28, 'rgba(255,255,255,0.78)');
        grad.addColorStop(0.55, 'rgba(255,255,255,0.42)');
        grad.addColorStop(0.8, 'rgba(255,255,255,0.14)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        tex.refresh();
      }
    }

    if (!this.scene.textures.exists('_light_cone_soft')) {
      const w = 256;
      const h = 128;
      const tex = this.scene.textures.createCanvas('_light_cone_soft', w, h);
      if (tex) {
        const ctx = tex.getContext();
        const img = ctx.createImageData(w, h);
        const data = img.data;
        const ox = 12;
        const oy = 64;
        const maxRange = w - ox - 4;
        const maxHalfSpread = Math.atan2(56, maxRange);

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const dx = x - ox;
            const dy = y - oy;
            const dist = Math.hypot(dx, dy);
            const rNorm = dist / maxRange;

            let alpha = 0;
            // Small omnidirectional bulb halo right at tower emitter origin
            if (dist < 14) {
              alpha = Math.pow(1 - dist / 14, 1.5) * 0.92;
            }

            if (dx >= -2 && rNorm < 1) {
              const effDist = Math.max(0, dx);
              const ang = Math.atan2(Math.abs(dy), Math.max(4, effDist));
              // Narrow neck near tower opening gently flaring out to maxHalfSpread
              const spreadAtR = 0.08 + maxHalfSpread * Math.min(1, rNorm * 1.15);
              if (ang < spreadAtR) {
                const angRatio = ang / spreadAtR;
                const angFade = Math.pow(Math.max(0, Math.cos(angRatio * Math.PI * 0.5)), 1.65);
                // Smooth cubic fade to zero well before range limit -> no hard outer cutoff
                const rangeFade = Math.pow(Math.max(0, 1 - rNorm), 2.15);
                alpha = Math.max(alpha, angFade * rangeFade * 0.96);
              }
            }

            const idx = (y * w + x) * 4;
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = Math.max(0, Math.min(255, Math.round(alpha * 255)));
          }
        }
        ctx.putImageData(img, 0, 0);
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
    if (t < 0.22) return { label: 'Dawn', clockStr, darkness: 0.45 };
    if (t < 0.60) return { label: 'Midday', clockStr, darkness: 0 };
    if (t < 0.72) return { label: 'Dusk', clockStr, darkness: 0.55 };
    return { label: 'Night', clockStr, darkness: 1 };
  }

  public getAmbientColor(): { color: number; nightFactor: number } {
    const t = this.timeOfDay;
    const DAY = 0xffffff;
    const DAWN = 0xffbfa0; // Soft peach dawn
    const DUSK = 0xd98aa8; // Amber-violet dusk
    const NIGHT = 0x0e1430; // Deep indigo night (~35% light / 65% darkness)

    if (t < 0.16) {
      const k = t / 0.16;
      return { color: lerpColor(NIGHT, DAWN, k), nightFactor: 1 - k * 0.68 };
    }
    if (t < 0.24) {
      // Early morning orange glow (~1 in-game hour) transitioning to full day
      const k = (t - 0.16) / 0.08;
      return { color: lerpColor(DAWN, DAY, k), nightFactor: 0.32 * (1 - k) };
    }
    if (t < 0.60) {
      return { color: DAY, nightFactor: 0 };
    }
    if (t < 0.67) {
      // Evening orange glow (~1 in-game hour)
      const k = (t - 0.60) / 0.07;
      return { color: lerpColor(DAY, DUSK, k), nightFactor: k * 0.42 };
    }
    if (t < 0.78) {
      const k = (t - 0.67) / 0.11;
      return { color: lerpColor(DUSK, NIGHT, k), nightFactor: 0.42 + k * 0.58 };
    }
    return { color: NIGHT, nightFactor: 1 };
  }

  /**
   * Advances time-of-day. Returns `true` if a new day started.
   */
  public update(
    dtMs: number,
    pointLights: PointLightSource[],
    spotLights: SpotLightSource[],
    weatherMod?: WeatherLightModifier,
  ): boolean {
    let dayWrapped = false;
    if (!this.paused) {
      const prev = this.timeOfDay;
      this.timeOfDay = (this.timeOfDay + dtMs / (this.cycleDurationSec * 1000)) % 1;
      if (this.timeOfDay < prev) {
        this.dayNumber++;
        dayWrapped = true;
      }
    }

    if (!this.dynamicLightingEnabled) {
      return dayWrapped;
    }

    const cam = this.scene.cameras.main;
    const vw = Math.max(320, this.scene.scale.width);
    const vh = Math.max(200, this.scene.scale.height);
    const pad = LightingSystem.EDGE_PAD;
    const rtW = vw + pad * 2;
    const rtH = vh + pad * 2;
    if (this.lightmap.width !== rtW || this.lightmap.height !== rtH) {
      this.lightmap.resize(rtW, rtH);
      this.beamMap.resize(rtW, rtH);
      this.forceRedraw = true;
      this.beamMapClean = false;
    }

    const base = this.getAmbientColor();
    let ambient = base.color;
    if (weatherMod?.tint && weatherMod.tint !== 0xffffff) {
      ambient = multiplyColors(ambient, weatherMod.tint);
    }
    const nightFactor = Math.min(1, base.nightFactor + (weatherMod?.darknessBoost ?? 0));
    if (weatherMod?.darknessBoost && weatherMod.darknessBoost > 0) {
      ambient = lerpColor(ambient, 0x0a1024, Math.min(1, weatherMod.darknessBoost));
    }
    // Cap darkness overlay at 65% opacity (35% light at peak night)
    ambient = lerpColor(0xffffff, ambient, LightingSystem.MAX_DARKNESS_OPACITY);

    const viewW = vw / cam.zoom;
    const viewH = vh / cam.zoom;
    const viewX = cam.scrollX + (vw - viewW) * 0.5;
    const viewY = cam.scrollY + (vh - viewH) * 0.5;
    const dispScale = 1 / cam.zoom;

    const now = this.scene.time.now;
    const scrollDx = this.lastRenderViewX - viewX;
    const scrollDy = this.lastRenderViewY - viewY;
    const needsRedraw =
      this.forceRedraw ||
      now - this.lastRenderTime >= LightingSystem.LIGHT_REDRAW_INTERVAL_MS ||
      cam.zoom !== this.lastRenderZoom ||
      ambient !== this.lastAmbient ||
      Math.abs(scrollDx * cam.zoom) > pad * 0.75 ||
      Math.abs(scrollDy * cam.zoom) > pad * 0.75;

    if (!needsRedraw) {
      // Shift cached lightmaps by exact world camera delta so lights stay 100% locked to world coordinates
      this.lightmap.setPosition(vw / 2 + scrollDx, vh / 2 + scrollDy).setScale(dispScale);
      this.beamMap.setPosition(vw / 2 + scrollDx, vh / 2 + scrollDy).setScale(dispScale);
      return dayWrapped;
    }

    this.forceRedraw = false;
    this.lastRenderTime = now;
    this.lastRenderViewX = viewX;
    this.lastRenderViewY = viewY;
    this.lastRenderZoom = cam.zoom;
    this.lastAmbient = ambient;

    this.lightmap.setPosition(vw / 2, vh / 2).setScale(dispScale);
    this.beamMap.setPosition(vw / 2, vh / 2).setScale(dispScale);

    const skipLightmap = ambient === 0xffffff && nightFactor <= 0.02;
    if (skipLightmap) {
      this.lightmap.setVisible(false);
    } else {
      this.lightmap.setVisible(true);
      this.lightmap.fill(ambient, 1);
    }

    const toRtX = (wx: number) => (wx - viewX) * cam.zoom + pad;
    const toRtY = (wy: number) => (wy - viewY) * cam.zoom + pad;

    const tSec = now * 0.001;
    const hasLights = nightFactor > 0.04 || pointLights.length > 0;
    if (!hasLights) {
      if (!this.beamMapClean) {
        this.beamMap.clear();
        this.beamMapClean = true;
      }
      this.beamMap.setVisible(false);
      return dayWrapped;
    }

    const renderer = this.scene.renderer;
    const glRenderer =
      renderer && renderer.type === Phaser.WEBGL
        ? (renderer as Phaser.Renderer.WebGL.WebGLRenderer)
        : null;

    // Pass 1: Draw point & spot lights directly into lightmap (on top of fill(ambient, 1))
    if (!skipLightmap && nightFactor > 0.05) {
      const lmCamera = (this.lightmap.texture as unknown as { camera: Phaser.Cameras.Scene2D.Camera }).camera;
      const drawLightmapStamps = () => {
        for (const pl of pointLights) {
          const sx = toRtX(pl.x);
          const sy = toRtY(pl.y);
          const seed = pl.x * 0.13 + pl.y * 0.07;
          const flicker = pl.flicker
            ? 1 + Math.sin(tSec * 9.5 + seed) * 0.055 + Math.sin(tSec * 17.3 + seed * 1.7) * 0.035
            : 1;
          const sr = pl.radius * flicker * cam.zoom;
          if (sx < -sr || sy < -sr || sx > rtW + sr || sy > rtH + sr) continue;

          const scale = (sr * 2) / 128;
          const baseInt = (pl.intensity ?? 0.9) * flicker;
          const lightPower = Math.min(1, baseInt * Math.max(pl.dayVisible ? 0.22 : 0.12, nightFactor));
          this.stampImg
            .setPosition(sx, sy)
            .setScale(scale)
            .setTint(pl.color)
            .setAlpha(lightPower)
            .setBlendMode(this.pureAddBlendMode);
          if (glRenderer) {
            this.renderImgWebGL(glRenderer, this.stampImg, lmCamera);
          } else {
            this.lightmap.draw(this.stampImg);
          }
        }
        for (const sp of spotLights) {
          const sx = toRtX(sp.x);
          const sy = toRtY(sp.y);
          const lenPx = sp.length * cam.zoom;
          const wPx = sp.width * cam.zoom;
          if (sx < -lenPx || sy < -lenPx || sx > rtW + lenPx || sy > rtH + lenPx) continue;

          const baseInt = sp.intensity ?? 0.95;
          const intensity = Math.min(1, baseInt * Math.max(0.25, nightFactor));
          this.spotImg
            .setPosition(sx, sy)
            .setRotation(sp.angle)
            .setScale(lenPx / 240, wPx / 112)
            .setTint(sp.color)
            .setAlpha(intensity)
            .setBlendMode(this.pureAddBlendMode);
          if (glRenderer) {
            this.renderImgWebGL(glRenderer, this.spotImg, lmCamera);
          } else {
            this.lightmap.draw(this.spotImg);
          }
        }
      };

      if (glRenderer) {
        this.renderDirectToRT(glRenderer, this.lightmap, rtW, rtH, drawLightmapStamps);
      } else {
        drawLightmapStamps();
      }
    }

    // Pass 2: Subtle additive colored halo in beamMap
    let drewBeam = false;
    if (nightFactor > 0.14 || pointLights.some((p) => p.dayVisible)) {
      if (!this.beamMapClean) {
        this.beamMap.clear();
        this.beamMapClean = true;
      }
      const bmCamera = (this.beamMap.texture as unknown as { camera: Phaser.Cameras.Scene2D.Camera }).camera;
      const drawBeamStamps = () => {
        for (const pl of pointLights) {
          if (nightFactor <= 0.14 && !pl.dayVisible) continue;
          const sx = toRtX(pl.x);
          const sy = toRtY(pl.y);
          const seed = pl.x * 0.13 + pl.y * 0.07;
          const flicker = pl.flicker
            ? 1 + Math.sin(tSec * 9.5 + seed) * 0.055 + Math.sin(tSec * 17.3 + seed * 1.7) * 0.035
            : 1;
          const sr = pl.radius * flicker * cam.zoom;
          if (sx < -sr || sy < -sr || sx > rtW + sr || sy > rtH + sr) continue;

          drewBeam = true;
          const scale = ((sr * 2) / 128) * 0.85;
          const baseInt = (pl.intensity ?? 0.9) * flicker;
          const haloAlpha = Math.max(pl.dayVisible ? 0.11 : 0, 0.16 * nightFactor) * baseInt;
          this.stampImg
            .setPosition(sx, sy)
            .setScale(scale)
            .setTint(pl.color)
            .setAlpha(haloAlpha)
            .setBlendMode(this.pureAddBlendMode);
          if (glRenderer) {
            this.renderImgWebGL(glRenderer, this.stampImg, bmCamera);
          } else {
            this.beamMap.draw(this.stampImg);
          }
        }
        if (nightFactor > 0.14) {
          for (const sp of spotLights) {
            const sx = toRtX(sp.x);
            const sy = toRtY(sp.y);
            const lenPx = sp.length * cam.zoom;
            const wPx = sp.width * cam.zoom;
            if (sx < -lenPx || sy < -lenPx || sx > rtW + lenPx || sy > rtH + lenPx) continue;

            drewBeam = true;
            const baseInt = sp.intensity ?? 0.95;
            this.spotImg
              .setPosition(sx, sy)
              .setRotation(sp.angle)
              .setScale(lenPx / 240, wPx / 112)
              .setTint(sp.color)
              .setAlpha(0.22 * nightFactor * baseInt)
              .setBlendMode(this.pureAddBlendMode);
            if (glRenderer) {
              this.renderImgWebGL(glRenderer, this.spotImg, bmCamera);
            } else {
              this.beamMap.draw(this.spotImg);
            }
          }
        }
      };

      if (glRenderer) {
        this.renderDirectToRT(glRenderer, this.beamMap, rtW, rtH, drawBeamStamps);
      } else {
        drawBeamStamps();
      }
    } else if (!this.beamMapClean) {
      this.beamMap.clear();
      this.beamMapClean = true;
    }

    if (drewBeam) {
      this.beamMap.setVisible(true);
      this.beamMapClean = false;
    } else {
      this.beamMap.setVisible(false);
    }

    return dayWrapped;
  }

  /**
   * Stamps directly onto a RenderTexture's WebGL renderTarget without beginDraw's
   * transparent canvasTarget + full-screen blitFrame (eliminates DST_ALPHA square artifacts
   * and keeps fill(ambient, 1) untouched).
   */
  private renderDirectToRT(
    glRenderer: Phaser.Renderer.WebGL.WebGLRenderer,
    rt: Phaser.GameObjects.RenderTexture,
    rtW: number,
    rtH: number,
    drawFn: () => void,
  ): void {
    const dt = rt.texture as unknown as {
      renderTarget: Phaser.Renderer.WebGL.RenderTarget | null;
      camera: Phaser.Cameras.Scene2D.Camera;
      dirty: boolean;
    };
    if (!dt.renderTarget) return;
    dt.camera.preRender();
    dt.renderTarget.bind(true, rtW, rtH);
    glRenderer.setProjectionMatrix(rtW, rtH);
    drawFn();
    dt.renderTarget.unbind(true);
    glRenderer.resetProjectionMatrix();
    glRenderer.resetViewport();
    glRenderer.resetScissor();
    dt.dirty = true;
  }

  private renderImgWebGL(
    glRenderer: Phaser.Renderer.WebGL.WebGLRenderer,
    img: Phaser.GameObjects.Image,
    camObj: Phaser.Cameras.Scene2D.Camera,
  ): void {
    glRenderer.setBlendMode(this.pureAddBlendMode);
    (img as unknown as {
      renderWebGL: (
        r: Phaser.Renderer.WebGL.WebGLRenderer,
        src: Phaser.GameObjects.Image,
        c: Phaser.Cameras.Scene2D.Camera,
      ) => void;
    }).renderWebGL(glRenderer, img, camObj);
  }

  public resize(width: number, height: number): void {
    const vw = Math.max(320, width);
    const vh = Math.max(200, height);
    const pad = LightingSystem.EDGE_PAD;
    const rtW = vw + pad * 2;
    const rtH = vh + pad * 2;
    if (this.lightmap.width !== rtW || this.lightmap.height !== rtH) {
      this.lightmap.resize(rtW, rtH);
      this.beamMap.resize(rtW, rtH);
      this.beamMapClean = false;
    }
    const cam = this.scene.cameras?.main;
    const zoom = cam?.zoom ?? 1;
    const dispScale = 1 / zoom;
    this.lightmap.setPosition(vw / 2, vh / 2).setScale(dispScale);
    this.beamMap.setPosition(vw / 2, vh / 2).setScale(dispScale);
    this.forceRedraw = true;
  }

  public destroy(): void {
    this.destroyed = true;
    this.cleanupSettingsSub();
    this.scene.events?.off(Phaser.Scenes.Events.SHUTDOWN, this.cleanupSettingsSub, this);
    this.scene.events?.off(Phaser.Scenes.Events.DESTROY, this.cleanupSettingsSub, this);
    this.lightmap.destroy();
    this.beamMap.destroy();
    this.stampImg.destroy();
    this.spotImg.destroy();
  }
}
