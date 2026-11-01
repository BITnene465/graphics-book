import { cross, finite, scale, add } from '../../math/vector.ts';
import type { Vec3 } from '../../math/vector.ts';
import { identity, matVec } from '../../math/matrix.ts';
import type { Matrix } from '../../math/matrix.ts';
import { unit } from './spatial.ts';

/** 平面 n·p=d；输入法线会归一化，d 表示带符号的实际距离。 */
export function planeReflection(normal: Vec3, distance = 0): Matrix {
  finite([distance]);
  const n = unit(normal),
    m = identity(4);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) m[r][c] -= 2 * n[r] * n[c];
    m[r][3] = 2 * distance * n[r];
  }
  return m;
}

export function shearMatrix(amount: number, displacementAxis = 0, sourceAxis = 1): Matrix {
  finite([amount]);
  if (
    ![displacementAxis, sourceAxis].every((a) => Number.isInteger(a) && a >= 0 && a < 3) ||
    displacementAxis === sourceAxis
  )
    throw new RangeError('错切需要不同的有效坐标轴');
  const m = identity(4);
  m[displacementAxis][sourceAxis] = amount;
  return m;
}

export function transformPoints(m: Matrix, points: Vec3[]): Vec3[] {
  if (
    m.length !== 4 ||
    m.some((row) => row.length !== 4) ||
    m[3].some((x, i) => x !== Number(i === 3))
  )
    throw new RangeError('需要仿射 4×4 矩阵');
  finite(m.flat());
  finite(points.flat());
  return points.map((p) => matVec(m, [...p, 1]).slice(0, 3) as Vec3);
}

export function planePatch(normal: Vec3, distance = 0, extent = 1.8): Vec3[] {
  finite([distance, extent]);
  if (extent <= 0) throw new RangeError('平面范围必须为正');
  const n = unit(normal),
    helper = [0, 0, 0] as Vec3;
  helper[n.indexOf(n.reduce((a, b) => (Math.abs(a) < Math.abs(b) ? a : b)))] = 1;
  const u = unit(cross(n, helper)),
    v = cross(n, u),
    center = scale(n, distance);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => add(center, add(scale(u, a * extent), scale(v, b * extent))) as Vec3);
}
