import { adjacency } from '../../math/mesh.ts';
import type { PolyMesh } from '../../math/mesh.ts';
import { cross, dot, sub } from '../../math/vector.ts';
import type { Vec3 } from '../../math/vector.ts';
import { solve } from '../../math/linear.ts';

export function laplacian(
  mesh: PolyMesh,
  kind: 'uniform' | 'cotangent' = 'uniform',
  normalized = false,
): number[][] {
  const n = mesh.vertices.length,
    L = Array.from({ length: n }, () => Array(n).fill(0));
  const a = adjacency(mesh);
  for (const e of a.edges) {
    let w = 1;
    if (kind === 'cotangent') {
      if (e.faces.some((f) => mesh.faces[f].length !== 3)) throw new RangeError('余切权需要三角面');
      w = e.opposite.reduce((sum, k) => {
        const u = sub(mesh.vertices[e.a], mesh.vertices[k]),
          v = sub(mesh.vertices[e.b], mesh.vertices[k]),
          area = Math.hypot(...cross(u, v));
        if (area < 1e-12) throw new RangeError('退化三角形没有有效余切');
        return sum + dot(u, v) / (2 * area);
      }, 0);
    }
    L[e.a][e.a] += w;
    L[e.b][e.b] += w;
    L[e.a][e.b] -= w;
    L[e.b][e.a] -= w;
  }
  return normalized ? L.map((r, i) => (r[i] > 1e-12 ? r.map((x) => x / r[i]) : r)) : L;
}

/** 消去固定自由度，边界值直接进入右端；至少每个零空间分量要有约束。 */
export function constrainedSolve(A: number[][], b: number[], fixed: Map<number, number>): number[] {
  const free = b.map((_, i) => i).filter((i) => !fixed.has(i)),
    x = b.map((_, i) => fixed.get(i) ?? 0);
  if (!free.length) return x;
  const rhs = free.map((i) => b[i] - [...fixed].reduce((s, [j, v]) => s + A[i][j] * v, 0));
  const solution = solve(
    free.map((i) => free.map((j) => A[i][j])),
    rhs,
  );
  free.forEach((i, k) => {
    x[i] = solution[k];
  });
  return x;
}

/** 使用固定参考网格的算子；显式与隐式使用相同 L 及相同约束。 */
export function smooth(
  mesh: PolyMesh,
  steps: number,
  lambda: number,
  implicit = false,
  kind: 'uniform' | 'cotangent' = 'uniform',
  pins: number[] = [],
): PolyMesh {
  if (
    !Number.isInteger(steps) ||
    steps < 0 ||
    steps > 100 ||
    !Number.isFinite(lambda) ||
    lambda < 0
  )
    throw new RangeError('平滑参数无效');
  const L = laplacian(mesh, kind, true),
    A = L.map((row, i) => row.map((x, j) => Number(i === j) + lambda * x));
  let vertices = mesh.vertices.map((p) => [...p] as Vec3);
  for (let step = 0; step < steps; step++) {
    const result = [0, 1, 2].map((axis) => {
      const b = vertices.map((p) => p[axis]),
        fixed = new Map(pins.map((i) => [i, mesh.vertices[i][axis]]));
      return implicit
        ? constrainedSolve(A, b, fixed)
        : b.map((x, i) => fixed.get(i) ?? x - lambda * L[i].reduce((s, w, j) => s + w * b[j], 0));
    });
    vertices = vertices.map((_, i) => result.map((row) => row[i]) as Vec3);
  }
  return { vertices, faces: mesh.faces.map((f) => [...f]) };
}
export function dirichletEnergy(L: number[][], values: number[]): number {
  return (
    0.5 * values.reduce((s, x, i) => s + x * L[i].reduce((t, w, j) => t + w * values[j], 0), 0)
  );
}
