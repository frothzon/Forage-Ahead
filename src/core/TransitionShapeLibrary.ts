import {
  Anchor,
  Axe,
  Clover,
  Compass,
  Crown,
  Diamond,
  Feather,
  Flame,
  Gem,
  Ghost,
  Heart,
  Hexagon,
  Moon,
  Mountain,
  Shield,
  Skull,
  Snowflake,
  Sparkles,
  Star,
  Sun,
  Sword,
  Trees,
  Zap,
  type IconNode,
} from 'lucide';

export type ShapeDrawFn = (ctx: CanvasRenderingContext2D, size: number) => void;
export type ShapeSource = IconNode | ShapeDrawFn;

export interface TransitionShape {
  name: string;
  maxScale: number;
  getTexture: () => HTMLCanvasElement;
}

const TEXTURE_SIZE = 128;

function renderLucideNodeToCanvas(nodes: IconNode, size = TEXTURE_SIZE): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const scale = size / 24;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';
  // Bold stroke normalization so thin outlines become solid silhouettes
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const [tag, attrs] of nodes) {
    if (tag === 'path' && attrs.d) {
      const p = new Path2D(String(attrs.d));
      ctx.fill(p);
      ctx.stroke(p);
    } else if (tag === 'circle') {
      const cx = Number(attrs.cx ?? 12);
      const cy = Number(attrs.cy ?? 12);
      const r = Number(attrs.r ?? 4);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (tag === 'ellipse') {
      const cx = Number(attrs.cx ?? 12);
      const cy = Number(attrs.cy ?? 12);
      const rx = Number(attrs.rx ?? 4);
      const ry = Number(attrs.ry ?? 4);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (tag === 'rect') {
      const x = Number(attrs.x ?? 0);
      const y = Number(attrs.y ?? 0);
      const w = Number(attrs.width ?? 0);
      const h = Number(attrs.height ?? 0);
      const rx = Number(attrs.rx ?? 0);
      ctx.beginPath();
      if (rx > 0 && typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, rx);
      } else {
        ctx.rect(x, y, w, h);
      }
      ctx.fill();
      ctx.stroke();
    } else if (tag === 'line') {
      const x1 = Number(attrs.x1 ?? 0);
      const y1 = Number(attrs.y1 ?? 0);
      const x2 = Number(attrs.x2 ?? 0);
      const y2 = Number(attrs.y2 ?? 0);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else if ((tag === 'polygon' || tag === 'polyline') && attrs.points) {
      const nums = String(attrs.points)
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      if (nums.length >= 4) {
        ctx.beginPath();
        ctx.moveTo(nums[0], nums[1]);
        for (let i = 2; i < nums.length - 1; i += 2) {
          ctx.lineTo(nums[i], nums[i + 1]);
        }
        if (tag === 'polygon') {
          ctx.closePath();
          ctx.fill();
        }
        ctx.stroke();
      }
    }
  }

  ctx.restore();
  return canvas;
}

function renderCustomFnToCanvas(drawFn: ShapeDrawFn, size = TEXTURE_SIZE): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';
  drawFn(ctx, size);
  return canvas;
}

class TransitionShapeLibraryClass {
  private registry = new Map<string, { source: ShapeSource; maxScale: number; cache?: HTMLCanvasElement }>();
  private lastShapeName: string | null = null;

  constructor() {
    this.registerDefaults();
  }

  public register(name: string, source: ShapeSource, maxScale = 2.1): void {
    this.registry.set(name, { source, maxScale });
  }

  public registerShape(name: string, source: ShapeSource, maxScale = 2.1): void {
    this.register(name, source, maxScale);
  }

  public getShapeNames(): string[] {
    return Array.from(this.registry.keys());
  }

  public getShape(name: string): TransitionShape {
    const entry = this.registry.get(name) ?? this.registry.values().next().value;
    if (!entry) {
      throw new Error('TransitionShapeLibrary has no registered shapes');
    }
    return {
      name,
      maxScale: entry.maxScale,
      getTexture: () => {
        if (!entry.cache) {
          entry.cache = Array.isArray(entry.source)
            ? renderLucideNodeToCanvas(entry.source)
            : renderCustomFnToCanvas(entry.source);
        }
        return entry.cache;
      },
    };
  }

  public getRandomShape(excludePrevious = true): TransitionShape {
    const names = this.getShapeNames();
    let pool = names;
    if (excludePrevious && this.lastShapeName && names.length > 1) {
      pool = names.filter((n) => n !== this.lastShapeName);
    }
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    this.lastShapeName = chosen;
    return this.getShape(chosen);
  }

  private registerDefaults(): void {
    // Lucide RPG / Fantasy Icons
    const lucideShapes: Array<[string, IconNode, number]> = [
      ['star', Star, 2.25],
      ['heart', Heart, 2.05],
      ['shield', Shield, 2.1],
      ['sword', Sword, 2.35],
      ['flame', Flame, 2.2],
      ['snowflake', Snowflake, 2.3],
      ['skull', Skull, 2.1],
      ['crown', Crown, 2.15],
      ['moon', Moon, 2.2],
      ['sun', Sun, 2.25],
      ['diamond', Diamond, 2.15],
      ['hexagon', Hexagon, 2.05],
      ['clover', Clover, 2.15],
      ['sparkles', Sparkles, 2.3],
      ['compass', Compass, 2.1],
      ['ghost', Ghost, 2.1],
      ['trees', Trees, 2.2],
      ['mountain', Mountain, 2.2],
      ['gem', Gem, 2.1],
      ['feather', Feather, 2.3],
      ['anchor', Anchor, 2.2],
      ['zap', Zap, 2.3],
      ['axe', Axe, 2.3],
    ];
    for (const [name, node, maxScale] of lucideShapes) {
      this.register(name, node, maxScale);
    }

    // Custom Procedural Geometric Shapes
    this.register(
      'circle',
      (ctx, s) => {
        ctx.beginPath();
        ctx.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2);
        ctx.fill();
      },
      1.85,
    );

    this.register(
      'diamond_geo',
      (ctx, s) => {
        const h = s / 2;
        const r = s * 0.46;
        ctx.beginPath();
        ctx.moveTo(h, h - r);
        ctx.lineTo(h + r, h);
        ctx.lineTo(h, h + r);
        ctx.lineTo(h - r, h);
        ctx.closePath();
        ctx.fill();
      },
      2.15,
    );

    this.register(
      'four_point_star',
      (ctx, s) => {
        const h = s / 2;
        const outer = s * 0.47;
        const inner = s * 0.17;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const rad = i % 2 === 0 ? outer : inner;
          const ang = (i * Math.PI) / 4 - Math.PI / 2;
          const x = h + Math.cos(ang) * rad;
          const y = h + Math.sin(ang) * rad;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      },
      2.35,
    );

    this.register(
      'hexagon_geo',
      (ctx, s) => {
        const h = s / 2;
        const r = s * 0.45;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = (i * Math.PI) / 3 - Math.PI / 6;
          const x = h + Math.cos(ang) * r;
          const y = h + Math.sin(ang) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      },
      1.95,
    );

    this.register(
      'pixel_square',
      (ctx, s) => {
        const pad = Math.round(s * 0.08);
        ctx.fillRect(pad, pad, s - pad * 2, s - pad * 2);
      },
      1.8,
    );
  }
}

export const TransitionShapeLibrary = new TransitionShapeLibraryClass();
