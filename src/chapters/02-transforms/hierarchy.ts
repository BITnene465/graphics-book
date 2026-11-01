import { finite, sub, add } from '../../math/vector.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { transpose, matVec, inverse, compose } from '../../math/matrix.ts';
import type { Matrix } from '../../math/matrix.ts';
import { translation, rotation, apply } from './core.ts';

export const basisMatrix = (columns: Vec3[]): Matrix => {
  if (columns.length !== 3) throw new RangeError('三维坐标系需要三个基向量');
  finite(columns.flat());
  return transpose(columns);
};

/** 单边 Jacobi SVD：直接正交化列，避免 BᵀB 把条件数平方。 */
export function basisDiagnostics(basis: Matrix, rcond = 1e-6) {
  if (basis.length !== 3 || basis.some((r) => r.length !== 3))
    throw new RangeError('需要 3×3 基矩阵');
  finite([...basis.flat(), rcond]);
  if (rcond <= 0 || rcond >= 1) throw new RangeError('阈值须在 (0,1)');
  const magnitude = Math.max(...basis.flat().map(Math.abs));
  const a = basis.map((row) => row.map((x) => (magnitude ? x / magnitude : 0)));
  for (let sweep = 0; sweep < 20; sweep++)
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      const alpha = a.reduce((s, r) => s + r[p] * r[p], 0),
        beta = a.reduce((s, r) => s + r[q] * r[q], 0),
        gamma = a.reduce((s, r) => s + r[p] * r[q], 0);
      if (Math.abs(gamma) <= Number.EPSILON * Math.sqrt(alpha * beta)) continue;
      const z = (beta - alpha) / (2 * gamma),
        t = (z >= 0 ? 1 : -1) / (Math.abs(z) + Math.hypot(1, z)),
        c = 1 / Math.hypot(1, t),
        s = c * t;
      for (const row of a) {
        const x = row[p],
          y = row[q];
        row[p] = c * x - s * y;
        row[q] = s * x + c * y;
      }
    }
  const singularValues = [0, 1, 2]
    .map((c) => Math.hypot(...a.map((r) => r[c])))
    .sort((a, b) => b - a);
  const ratio = singularValues[0] ? singularValues[2] / singularValues[0] : 0;
  const state =
    ratio <= 3 * Number.EPSILON ? 'singular' : ratio <= rcond ? 'near_singular' : 'regular';
  return {
    state,
    ratio,
    condition: ratio ? 1 / ratio : Infinity,
    singularValues: singularValues.map((x) => x * magnitude),
  };
}

export function localToWorld(basis: Matrix, local: Vec3, origin: Vec3 = [0, 0, 0]): Vec3 {
  finite([...local, ...origin]);
  return add(origin, matVec(basis, local)) as Vec3;
}
export function worldToLocal(basis: Matrix, world: Vec3, origin: Vec3 = [0, 0, 0]): Vec3 {
  if (basisDiagnostics(basis).state !== 'regular')
    throw new RangeError('此坐标系不能稳定恢复局部坐标');
  return matVec(inverse(basis), sub(world, origin)) as Vec3;
}

export function twoLinkFK(
  base: Vec2,
  parentAngle: number,
  childAngle: number,
  length1: number,
  length2: number,
) {
  finite([...base, parentAngle, childAngle, length1, length2]);
  if (Math.min(length1, length2) < 0) throw new RangeError('连杆长度不能为负');
  const parent = compose(translation(...base), rotation(parentAngle));
  const child = compose(parent, translation(length1, 0), rotation(childAngle));
  return {
    parent,
    child,
    joints: [base, apply(parent, [[length1, 0]])[0], apply(child, [[length2, 0]])[0]] as Vec2[],
  };
}
