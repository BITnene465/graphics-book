import { cross, dot, finite, scale, sub } from '../../math/vector.ts';
import type { Vec3 } from '../../math/vector.ts';
import type { Matrix } from '../../math/matrix.ts';

/** 先缩放再归一化，避免有限的极大或极小向量导致平方和溢出。 */
export function unit(v: Vec3): Vec3 {
  finite(v);
  const largest = Math.max(...v.map(Math.abs));
  if (largest === 0) throw new RangeError('零向量没有方向');
  const a = v.map((x) => x / largest),
    norm = Math.hypot(...a);
  return a.map((x) => x / norm) as Vec3;
}

export function angleBetween(a: Vec3, b: Vec3): number {
  return Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b)))));
}

export function project(v: Vec3, direction: Vec3): Vec3 {
  finite(v);
  const n = unit(direction);
  return scale(n, dot(v, n)) as Vec3;
}

export function splitAlong(v: Vec3, axis: Vec3) {
  const parallel = project(v, axis);
  return { parallel, perpendicular: sub(v, parallel) as Vec3 };
}

export function parallelogramArea(a: Vec3, b: Vec3): number {
  return Math.hypot(...cross(a, b));
}

/** Rodrigues 公式：轴向分量不动，垂直平面中做普通二维旋转。 */
export function rotate(v: Vec3, axis: Vec3, angle: number): Vec3 {
  finite([angle]);
  const n = unit(axis),
    { parallel, perpendicular } = splitAlong(v, n),
    tangent = cross(n, perpendicular);
  return v.map(
    (_, i) => parallel[i] + Math.cos(angle) * perpendicular[i] + Math.sin(angle) * tangent[i],
  ) as Vec3;
}

export function rotationMatrix(axis: Vec3, angle: number): Matrix {
  const columns = (
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as Vec3[]
  ).map((v) => rotate(v, axis, angle));
  return columns[0].map((_, i) => columns.map((v) => v[i]));
}
