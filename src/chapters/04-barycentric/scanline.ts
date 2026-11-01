import { finite } from '../../math/vector.ts';
import type { Vec2 } from '../../math/vector.ts';

export type Span = { left: number; right: number; first: number; end: number };

/** y 向上，采样中心为 (列+1/2, 行+1/2)。采用奇偶规则，跨度左闭右开。 */
export function scanlineSpans(vertices: Vec2[], y: number): { crossings: number[]; spans: Span[] } {
  finite([...vertices.flat(), y]);
  if (vertices.length < 3) throw new RangeError('多边形至少需要三个顶点');
  const crossings: number[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length];
    // 上端包含、下端排除，与本书 y 向上的 top-left 规则相接。
    // 水平边不产生交点；共享顶点不会被上下两条边重复计入。
    if (y > Math.min(a[1], b[1]) && y <= Math.max(a[1], b[1]))
      crossings.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }
  crossings.sort((a, b) => a - b);
  const spans: Span[] = [];
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const left = crossings[i],
      right = crossings[i + 1];
    spans.push({ left, right, first: Math.ceil(left - 0.5), end: Math.ceil(right - 0.5) });
  }
  return { crossings, spans };
}

export function scanlineFill(vertices: Vec2[], width: number, height: number): Vec2[] {
  if (![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= 1024))
    throw new RangeError('教学栅格边长须为 1 至 1024');
  const samples: Vec2[] = [];
  for (let row = 0; row < height; row++)
    for (const span of scanlineSpans(vertices, row + 0.5).spans)
      for (let column = Math.max(0, span.first); column < Math.min(width, span.end); column++)
        samples.push([column + 0.5, row + 0.5]);
  return samples;
}
