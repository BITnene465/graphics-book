/** 从有向面积得到三个权重；外部点保留负权重，用于解释外推。 */
import { finite } from '../../math/vector.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
export type Triangle2 = [Vec2, Vec2, Vec2];

export function cross2(a: Vec2, b: Vec2): number {
  finite([...a, ...b]);
  return a[0] * b[1] - a[1] * b[0];
}

export function barycentric(point: Vec2, [a, b, c]: Triangle2): Vec3 {
  finite([...point, ...a, ...b, ...c]);
  const ab: Vec2 = [b[0] - a[0], b[1] - a[1]],
    ac: Vec2 = [c[0] - a[0], c[1] - a[1]];
  const scale = Math.max(...ab.map(Math.abs), ...ac.map(Math.abs));
  if (!Number.isFinite(scale) || scale === 0) throw new RangeError('三角形退化或范围过大');
  const u = ab.map((x) => x / scale) as Vec2,
    v = ac.map((x) => x / scale) as Vec2;
  const p: Vec2 = [(point[0] - a[0]) / scale, (point[1] - a[1]) / scale];
  const area = cross2(u, v);
  if (Math.abs(area) <= 32 * Number.EPSILON) throw new RangeError('三角形退化或接近退化');
  const wb = cross2(p, v) / area,
    wc = cross2(u, p) / area;
  return [1 - wb - wc, wb, wc];
}

export function isInside(weights: Vec3, tolerance = 1e-9): boolean {
  finite([...weights, tolerance]);
  if (tolerance < 0) throw new RangeError('容差不能为负数');
  return (
    Math.abs(weights.reduce((a, b) => a + b, 0) - 1) <= tolerance &&
    weights.every((x) => x >= -tolerance && x <= 1 + tolerance)
  );
}

export function interpolate(weights: Vec3, attributes: number[][]): number[] {
  finite([...weights, ...attributes.flat()]);
  if (attributes.length !== 3 || attributes.some((a) => a.length !== attributes[0].length))
    throw new RangeError('需要三组同维数的属性');
  return attributes[0].map((_, c) => weights.reduce((sum, w, i) => sum + w * attributes[i][c], 0));
}
