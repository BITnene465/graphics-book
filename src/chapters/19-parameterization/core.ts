import type { PolyMesh } from '../../math/mesh.ts';
import type { Vec2 } from '../../math/vector.ts';
import { dot, sub, cross } from '../../math/vector.ts';
import { laplacian, constrainedSolve } from '../17-fairing/core.ts';
import { leastSquares } from '../../math/linear.ts';

/** 固定边界的调和坐标；复用第 17 章的正号拉普拉斯。 */
export function harmonic(
  mesh: PolyMesh,
  boundary: Map<number, Vec2>,
  kind: 'uniform' | 'cotangent' = 'uniform',
): Vec2[] {
  const L = laplacian(mesh, kind),
    zero = mesh.vertices.map(() => 0);
  const uv = [0, 1].map((c) =>
    constrainedSolve(L, zero, new Map([...boundary].map(([i, p]) => [i, p[c]]))),
  );
  return mesh.vertices.map((_, i) => [uv[0][i], uv[1][i]]);
}
/** 将三角形放到自己的正交切基，返回线性基函数梯度。 */
export function gradients(mesh: PolyMesh, face: number[]) {
  const [a, b, c] = face.map((i) => mesh.vertices[i]),
    ab = sub(b, a),
    ac = sub(c, a),
    x = Math.hypot(...ab);
  const u = dot(ab, ac) / x,
    v = Math.hypot(...cross(ab, ac)) / x;
  if (x < 1e-10 || v < 1e-10) throw new RangeError('参数化需要非退化三角形');
  return {
    area: (x * v) / 2,
    g: [
      [-1 / x, (u / x - 1) / v],
      [1 / x, -u / (x * v)],
      [0, 1 / v],
    ],
  };
}
/** 三角形上的 Cauchy–Riemann 最小二乘；固定两点去掉相似变换自由度。 */
export function lscm(mesh: PolyMesh, pins: Map<number, Vec2>): Vec2[] {
  const n = mesh.vertices.length,
    rows: number[][] = [];
  for (const face of mesh.faces) {
    if (face.length !== 3) throw new RangeError('LSCM 需要三角面');
    const { area, g } = gradients(mesh, face),
      s = Math.sqrt(area),
      a = Array(2 * n).fill(0),
      b = [...a];
    face.forEach((i, k) => {
      a[i] = s * g[k][0];
      a[n + i] = -s * g[k][1];
      b[i] = s * g[k][1];
      b[n + i] = s * g[k][0];
    });
    rows.push(a, b);
  }
  const fixed = new Map<number, number>();
  for (const [i, p] of pins) {
    fixed.set(i, p[0]);
    fixed.set(n + i, p[1]);
  }
  const free = Array.from({ length: 2 * n }, (_, i) => i).filter((i) => !fixed.has(i));
  const rhs = rows.map((r) => -[...fixed].reduce((s, [i, x]) => s + r[i] * x, 0));
  const x = leastSquares(
    rows.map((r) => free.map((i) => r[i])),
    rhs,
  );
  free.forEach((i, k) => fixed.set(i, x[k]));
  return mesh.vertices.map((_, i) => [fixed.get(i)!, fixed.get(n + i)!]);
}
/** J 把表面正交切坐标映到 UV；面积带符号，奇异值不带符号。 */
export function distortion(mesh: PolyMesh, uv: Vec2[], face: number[]) {
  const { g } = gradients(mesh, face);
  const J = [0, 1].map((c) =>
    [0, 1].map((a) => face.reduce((s, i, k) => s + uv[i][c] * g[k][a], 0)),
  );
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  const trace = J.flat().reduce((s, x) => s + x * x, 0),
    disc = Math.sqrt(Math.max(0, trace * trace - 4 * det * det));
  const max = Math.sqrt((trace + disc) / 2),
    min = max > 0 ? Math.abs(det) / max : 0;
  return { det, min, max, ratio: min > 1e-12 ? max / min : Infinity };
}
