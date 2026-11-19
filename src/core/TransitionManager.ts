import type Phaser from 'phaser';
import { TransitionShapeLibrary, type TransitionShape } from './TransitionShapeLibrary';

export interface TransitionGrid {
  cellSize: number;
  cols: number;
  rows: number;
}

export interface TransitionOptions {
  onMidpoint: () => void | Promise<void>;
  shapeName?: string;
  durationMs?: number;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function computeTransitionGrid(viewportW: number, viewportH: number): TransitionGrid {
  const w = Math.max(1, Math.round(viewportW));
  const h = Math.max(1, Math.round(viewportH));
  const cellSize = Math.max(16, Math.ceil(w / 20));
  const cols = Math.max(1, Math.ceil(w / cellSize));
  const rows = Math.max(1, Math.ceil(h / cellSize));
  return { cellSize, cols, rows };
}

export function computeTileProgress(
  col: number,
  row: number,
  cols: number,
  rows: number,
  phaseElapsedMs: number,
  phaseDurationMs: number,
): number {
  const denom = Math.max(1, cols - 1 + (rows - 1));
  const d = (col + row) / denom;
  const staggerWindow = phaseDurationMs * 0.6;
  const tileDuration = Math.max(1, phaseDurationMs * 0.4);
  return clamp01((phaseElapsedMs - d * staggerWindow) / tileDuration);
}

/**
 * Helper that starts a Phaser scene and resolves once the target scene finishes `create()`.
 */
export function startSceneAndWaitCreate(
  fromScene: Phaser.Scene,
  targetKey: string,
  data?: object,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const target = fromScene.scene.get(targetKey);
    if (!target) {
      fromScene.scene.start(targetKey, data);
      resolve();
      return;
    }
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    target.events.once('create', done);
    if (fromScene.scene.key === targetKey) {
      fromScene.scene.restart(data);
    } else {
      fromScene.scene.start(targetKey, data);
    }
    // Safety fallback in case create fires synchronously or scene is skipped
    window.setTimeout(done, 120);
  });
}

class TransitionManagerClass {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private _isActive = false;
  private width = 0;
  private height = 0;

  public get isActive(): boolean {
    return this._isActive;
  }

  public mount(): void {
    if (typeof document === 'undefined' || this.canvas) return;
    const existing = document.getElementById('transition-canvas') as HTMLCanvasElement | null;
    const canvas = existing ?? document.createElement('canvas');
    canvas.id = 'transition-canvas';
    canvas.style.cssText = [
      'position: fixed',
      'inset: 0',
      'width: 100vw',
      'height: 100vh',
      'z-index: 50',
      'pointer-events: none',
      'display: block',
    ].join(';');

    if (!existing) {
      const host = document.getElementById('app') ?? document.body;
      host.appendChild(canvas);
    }

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.syncSize();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.syncSize());
      this.resizeObserver.observe(document.documentElement);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.syncSize);
    }
  }

  private syncSize = (): void => {
    if (!this.canvas || typeof window === 'undefined') return;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    if (this.width !== w || this.height !== h) {
      this.width = w;
      this.height = h;
      this.canvas.width = w;
      this.canvas.height = h;
    }
  };

  public async transitionTo(opts: TransitionOptions): Promise<void> {
    if (this._isActive) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      await opts.onMidpoint();
      return;
    }

    this.mount();
    if (!this.canvas || !this.ctx) {
      await opts.onMidpoint();
      return;
    }

    this._isActive = true;
    this.canvas.style.pointerEvents = 'auto';
    this.syncSize();

    const durationMs = Math.max(200, opts.durationMs ?? 2000);
    const phaseMs = durationMs / 2;
    const shape: TransitionShape = opts.shapeName
      ? TransitionShapeLibrary.getShape(opts.shapeName)
      : TransitionShapeLibrary.getRandomShape(true);
    const tex = shape.getTexture();

    try {
      // Phase 1: Cover Out (0.0s -> 1.0s)
      await this.runPhase('cover', phaseMs, shape, tex);
      this.fillSolidBlack();

      // Midpoint: Scene swap & readiness gate
      await opts.onMidpoint();

      // Phase 2: Reveal In (1.0s -> 2.0s)
      await this.runPhase('reveal', phaseMs, shape, tex);
    } finally {
      this.clearCanvas();
      if (this.canvas) {
        this.canvas.style.pointerEvents = 'none';
      }
      this._isActive = false;
    }
  }

  private runPhase(
    mode: 'cover' | 'reveal',
    phaseDurationMs: number,
    shape: TransitionShape,
    tex: HTMLCanvasElement,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const startTime = performance.now();
      const step = (now: number) => {
        const elapsed = now - startTime;
        this.renderFrame(mode, elapsed, phaseDurationMs, shape, tex);
        if (elapsed >= phaseDurationMs) {
          resolve();
        } else {
          requestAnimationFrame(step);
        }
      };
      requestAnimationFrame(step);
    });
  }

  private renderFrame(
    mode: 'cover' | 'reveal',
    elapsedMs: number,
    phaseDurationMs: number,
    shape: TransitionShape,
    tex: HTMLCanvasElement,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;

    this.syncSize();
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);

    const { cellSize, cols, rows } = computeTransitionGrid(w, h);
    ctx.fillStyle = '#000000';

    for (let row = 0; row < rows; row++) {
      const cy = row * cellSize + cellSize / 2;
      for (let col = 0; col < cols; col++) {
        const cx = col * cellSize + cellSize / 2;
        const p = computeTileProgress(col, row, cols, rows, elapsedMs, phaseDurationMs);

        if (mode === 'cover') {
          if (p <= 0) continue;
          const eased = easeInOutCubic(p);
          const drawSize = cellSize * shape.maxScale * eased;
          if (drawSize > 0.5) {
            ctx.drawImage(tex, cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);
          }
          // Expand solid backing square over final 25% (0.75 -> 1.0) to guarantee zero gaps
          if (p > 0.75) {
            const backP = (p - 0.75) / 0.25;
            const backSize = Math.ceil((cellSize + 2) * backP);
            ctx.fillRect(cx - backSize / 2, cy - backSize / 2, backSize, backSize);
          }
        } else {
          // Reveal: top-left to bottom-right shrinks from full coverage -> 0
          if (p >= 1) continue;
          const invP = 1 - p;
          const eased = easeInOutCubic(invP);
          const alpha = p > 0.7 ? clamp01(1 - (p - 0.7) / 0.3) : 1;
          ctx.save();
          ctx.globalAlpha = alpha;
          if (p < 0.25) {
            const backP = 1 - p / 0.25;
            const backSize = Math.ceil((cellSize + 2) * backP);
            ctx.fillRect(cx - backSize / 2, cy - backSize / 2, backSize, backSize);
          }
          const drawSize = cellSize * shape.maxScale * eased;
          if (drawSize > 0.5) {
            ctx.drawImage(tex, cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);
          }
          ctx.restore();
        }
      }
    }
  }

  private fillSolidBlack(): void {
    if (!this.ctx) return;
    this.syncSize();
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  private clearCanvas(): void {
    if (!this.ctx) return;
    this.ctx.globalAlpha = 1;
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
}

export const transitionManager = new TransitionManagerClass();
