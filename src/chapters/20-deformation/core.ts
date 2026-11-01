import type { PolyMesh } from '../../math/mesh.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { laplacian, constrainedSolve } from '../17-fairing/core.ts';
import { leastSquares } from '../../math/linear.ts';

/** 二维双线性 FFD；它是三维张量积体形变的一个截面。 */
export function ffd(p: Vec2, cage: Vec2[]): Vec2 {
  if (cage.length !== 4) throw new RangeError('需要四个笼点');
  const [u, v] = p,
    w = [(1 - u) * (1 - v), u * (1 - v), u * v, (1 - u) * v];
  return [0, 1].map((c) => w.reduce((s, x, i) => s + x * cage[i][c], 0)) as Vec2;
}
/** 最小化 ||Lx'−Lx||²，精确消去手柄约束。 */
export function differentialEdit(mesh: PolyMesh, handles: Map<number, Vec3>): PolyMesh {
  const L = laplacian(mesh),
    free = mesh.vertices.map((_, i) => i).filter((i) => !handles.has(i));
  const coords = [0, 1, 2].map((c) => {
    const rhs = L.map(
      (row) =>
        row.reduce((s, w, j) => s + w * mesh.vertices[j][c], 0) -
        [...handles].reduce((s, [i, p]) => s + row[i] * p[c], 0),
    );
    const x = leastSquares(
      L.map((r) => free.map((i) => r[i])),
      rhs,
    );
    return mesh.vertices.map((_, i) => handles.get(i)?.[c] ?? x[free.indexOf(i)]);
  });
  return {
    vertices: mesh.vertices.map((_, i) => coords.map((a) => a[i]) as Vec3),
    faces: mesh.faces,
  };
}
/** 二维 ARAP：局部求最优旋转，整体解位置；使用非负均匀边权。 */
export function arap2(mesh: PolyMesh, handles: Map<number, Vec2>, iterations = 8): Vec2[] {
  const L = laplacian(mesh),
    p = mesh.vertices.map((v) => v.slice(0, 2) as Vec2);
  let x = p.map((v) => [...v] as Vec2);
  for (let step = 0; step < iterations; step++) {
    const angles = p.map((pi, i) => {
      let a = 0,
        b = 0;
      for (let j = 0; j < p.length; j++)
        if (i !== j && L[i][j]) {
          const w = -L[i][j],
            dx = p[j][0] - pi[0],
            dy = p[j][1] - pi[1],
            ex = x[j][0] - x[i][0],
            ey = x[j][1] - x[i][1];
          a += w * (dx * ex + dy * ey);
          b += w * (dx * ey - dy * ex);
        }
      return Math.atan2(b, a);
    });
    const rhs = p.map((pi, i) => {
      const b: Vec2 = [0, 0];
      for (let j = 0; j < p.length; j++)
        if (i !== j && L[i][j]) {
          const dx = pi[0] - p[j][0],
            dy = pi[1] - p[j][1],
            c = (Math.cos(angles[i]) + Math.cos(angles[j])) / 2,
            s = (Math.sin(angles[i]) + Math.sin(angles[j])) / 2,
            w = -L[i][j];
          b[0] += w * (c * dx - s * dy);
          b[1] += w * (s * dx + c * dy);
        }
      return b;
    });
    const axes = [0, 1].map((c) =>
      constrainedSolve(
        L,
        rhs.map((b) => b[c]),
        new Map([...handles].map(([i, v]) => [i, v[c]])),
      ),
    );
    x = p.map((_, i) => [axes[0][i], axes[1][i]]);
  }
  return x;
}
