import type { Vec2 } from '../math/vector.ts';

export type Bounds = [number, number, number, number];
type Style = { color: string; opacity: number; panel?: string; role?: string };
export type Primitive =
  | (Style & { kind: 'line'; points: number[][]; width: number; dash: boolean })
  | (Style & { kind: 'polygon'; points: number[][] })
  | (Style & { kind: 'circle'; at: number[]; radius: number })
  | (Style & { kind: 'text'; at: number[]; text: string; size: number })
  | (Style & { kind: 'image'; at: number[]; size: number[]; url: string; pixelated: boolean })
  | (Style & {
      kind: 'raster';
      at: number[];
      size: number[];
      width: number;
      height: number;
      data: Uint8ClampedArray;
      pixelated: boolean;
    });

export type Handle = {
  at: number[];
  key: string;
  label?: string;
  index?: number;
  axes: number[];
  limits?: number[];
  panel?: string;
  mapping?: { offset: number[]; scale: number[] };
};
export type Panel = { key: string; bounds: Bounds; columns: number };
export type Frame<V = Record<string, unknown>> = {
  bounds: Bounds;
  items: Primitive[];
  handles: Handle[];
  panels: Panel[];
  values: V;
  formula: string;
};
export const palette = {
  blue: '#397baf',
  green: '#237e79',
  yellow: '#b88036',
  red: '#b95160',
  ink: '#334b50',
  muted: '#8fa29d',
};

/** 图形词汇只保存数学坐标；不包含浏览器、Canvas 或渲染库。 */
export class Drawing<V = Record<string, unknown>> {
  bounds: Bounds;
  items: Primitive[] = [];
  handles: Handle[] = [];
  panels: Panel[] = [];
  values: V;
  formula = '';
  private currentPanel?: string;

  constructor(bounds: Bounds = [-4, 4, -2.3, 2.3], values = {} as V) {
    this.bounds = bounds;
    this.values = values;
  }
  private add(item: Primitive): void {
    if (this.currentPanel) item.panel = this.currentPanel;
    this.items.push(item);
  }
  panel(key: string, bounds: Bounds, draw: () => void, columns = 1): void {
    if (this.panels.some((p) => p.key === key)) throw new RangeError('子图名称重复');
    this.panels.push({ key, bounds, columns });
    const previous = this.currentPanel;
    this.currentPanel = key;
    try {
      draw();
    } finally {
      this.currentPanel = previous;
    }
  }
  line(
    points: number[][],
    color = palette.muted,
    width = 1.4,
    opacity = 1,
    dash = false,
    role?: string,
  ): void {
    this.add({ kind: 'line', points, color, width, opacity, dash, role });
  }
  polygon(points: number[][], color = palette.blue, opacity = 0.2, role?: string): void {
    this.add({ kind: 'polygon', points, color, opacity, role });
  }
  dot(at: number[], color = palette.yellow, radius = 0.045, opacity = 1): void {
    this.add({ kind: 'circle', at, color, radius, opacity });
  }
  text(at: number[], text: string, color = palette.ink, size = 14): void {
    this.add({ kind: 'text', at, text, color, size, opacity: 1 });
  }
  image(at: number[], size: number[], url: string, pixelated = false): void {
    this.add({ kind: 'image', at, size, url, pixelated, color: '', opacity: 1 });
  }
  raster(
    at: number[],
    size: number[],
    width: number,
    height: number,
    data: Uint8ClampedArray,
    pixelated = false,
  ): void {
    if (data.length !== width * height * 4) throw new RangeError('像素缓冲尺寸不一致');
    this.add({ kind: 'raster', at, size, width, height, data, pixelated, color: '', opacity: 1 });
  }
  handle(at: number[], key: string, label = '', options: Partial<Handle> = {}): void {
    this.handles.push({ at, key, label, axes: [0, 1], panel: this.currentPanel, ...options });
  }
  arrow(a: number[], b: number[], color = palette.blue, label?: string): void {
    this.line([a, b], color, 2.5);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length > 1e-8) {
      const [dx, dy] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
      this.polygon(
        [
          b,
          [b[0] - 0.13 * dx - 0.055 * dy, b[1] - 0.13 * dy + 0.055 * dx],
          [b[0] - 0.13 * dx + 0.055 * dy, b[1] - 0.13 * dy - 0.055 * dx],
        ],
        color,
        1,
      );
    }
    if (label) this.text([b[0] + 0.12, b[1] + 0.12], label, color);
  }
  axes(xmin = -3, xmax = 3, ymin = -1.8, ymax = 1.8): void {
    this.line(
      [
        [xmin, 0],
        [xmax, 0],
      ],
      palette.muted,
      0.8,
    );
    this.line(
      [
        [0, ymin],
        [0, ymax],
      ],
      palette.muted,
      0.8,
    );
  }
  result(): Frame<V> {
    return {
      bounds: this.bounds,
      items: this.items,
      handles: this.handles,
      panels: this.panels,
      values: this.values,
      formula: this.formula,
    };
  }
}

export function circle(center: Vec2, radius: number, count = 64): Vec2[] {
  return Array.from({ length: count + 1 }, (_, i) => [
    center[0] + radius * Math.cos((i / count) * 2 * Math.PI),
    center[1] + radius * Math.sin((i / count) * 2 * Math.PI),
  ]);
}
