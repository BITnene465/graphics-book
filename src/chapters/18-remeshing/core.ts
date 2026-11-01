import type { PolyMesh } from '../../math/mesh.ts';
import { adjacency, average } from '../../math/mesh.ts';
import type { Vec3 } from '../../math/vector.ts';
import { cross, dot, sub } from '../../math/vector.ts';
import { solve } from '../../math/linear.ts';

type Quadric = number[][];
const zero = (): Quadric => Array.from({ length: 4 }, () => Array(4).fill(0));
export const quadricError = (q: Quadric, p: Vec3): number => {
  const h = [...p, 1];
  return Math.max(
    0,
    h.reduce((s, x, i) => s + x * q[i].reduce((t, y, j) => t + y * h[j], 0), 0),
  );
};
export function quadrics(mesh: PolyMesh): Quadric[] {
  const q = mesh.vertices.map(zero);
  for (const f of mesh.faces) {
    if (f.length !== 3) throw new RangeError('二次误差参考实现使用三角面');
    const n = cross(
        sub(mesh.vertices[f[1]], mesh.vertices[f[0]]),
        sub(mesh.vertices[f[2]], mesh.vertices[f[0]]),
      ),
      len = Math.hypot(...n);
    if (len < 1e-12) continue;
    const plane = [...n.map((x) => x / len), -dot(n, mesh.vertices[f[0]]) / len];
    for (const v of f)
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) q[v][i][j] += plane[i] * plane[j];
  }
  return q;
}
export function bestContraction(q: Quadric, a: Vec3, b: Vec3): Vec3 {
  const candidates = [a, b, average([a, b])];
  try {
    candidates.push(
      solve(
        q.slice(0, 3).map((r) => r.slice(0, 3)),
        q.slice(0, 3).map((r) => -r[3]),
      ) as Vec3,
    );
  } catch {
    /* 平面上的误差有零空间，比较三个有限候选。 */
  }
  return candidates.reduce((best, p) => (quadricError(q, p) < quadricError(q, best) ? p : best));
}
function compact(mesh: PolyMesh): PolyMesh {
  const used = [...new Set(mesh.faces.flat())].sort((a, b) => a - b),
    map = new Map(used.map((v, i) => [v, i]));
  return {
    vertices: used.map((i) => [...mesh.vertices[i]]),
    faces: mesh.faces.map((f) => f.map((i) => map.get(i)!)),
  };
}
/** 小型闭合三角流形的贪心边折叠；保留连接条件与法线翻转检查。 */
export function simplify(mesh: PolyMesh, steps: number) {
  if (!Number.isInteger(steps) || steps < 0 || steps > 100)
    throw new RangeError('折叠步数须为 0–100');
  let state: PolyMesh = structuredClone(mesh);
  const q = quadrics(state),
    history = [compact(state)],
    costs: number[] = [];
  for (let step = 0; step < steps; step++) {
    const a = adjacency(state);
    const candidates = a.edges
      .filter((e) => e.faces.length === 2 && !a.boundary[e.a].length && !a.boundary[e.b].length)
      .map((e) => {
        const Q = q[e.a].map((r, i) => r.map((v, j) => v + q[e.b][i][j])),
          p = bestContraction(Q, state.vertices[e.a], state.vertices[e.b]);
        return { e, Q, p, cost: quadricError(Q, p) };
      })
      .sort((a, b) => a.cost - b.cost);
    let accepted = false;
    for (const { e, Q, p, cost } of candidates) {
      const common = a.neighbors[e.a].filter((v) => a.neighbors[e.b].includes(v));
      if (common.length !== 2 || common.some((v) => !e.opposite.includes(v))) continue;
      const faces = state.faces
        .map((f) => f.map((v) => (v === e.b ? e.a : v)))
        .filter((f) => new Set(f).size === 3);
      const vertices = state.vertices.map((v, i) => (i === e.a ? p : v));
      let valid = true;
      for (const f of state.faces.filter(
        (f) => !(f.includes(e.a) && f.includes(e.b)) && (f.includes(e.a) || f.includes(e.b)),
      )) {
        const old = cross(
          sub(state.vertices[f[1]], state.vertices[f[0]]),
          sub(state.vertices[f[2]], state.vertices[f[0]]),
        );
        const points = f.map((v) => (v === e.a || v === e.b ? p : state.vertices[v])),
          next = cross(sub(points[1], points[0]), sub(points[2], points[0]));
        if (
          dot(old, next) <= 1e-10 * Math.hypot(...old) * Math.hypot(...next) ||
          Math.hypot(...next) < 1e-10
        ) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
      try {
        adjacency({ vertices, faces });
      } catch {
        continue;
      }
      state = { vertices, faces };
      q[e.a] = Q;
      costs.push(cost);
      history.push(compact(state));
      accepted = true;
      break;
    }
    if (!accepted) break;
  }
  return { mesh: compact(state), history, costs };
}

/** 顶点聚类保持旧面的索引关系，删除退化面；不能保证拓扑不变。 */
export function cluster(mesh: PolyMesh, size: number): PolyMesh {
  if (!(size > 0 && Number.isFinite(size))) throw new RangeError('格子尺寸须为正');
  const groups = new Map<string, number[]>(),
    index = mesh.vertices.map((p, i) => {
      const key = p.map((x) => Math.floor(x / size)).join(',');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(i);
      return key;
    }),
    keys = [...groups.keys()],
    ids = new Map(keys.map((k, i) => [k, i]));
  const vertices = keys.map((k) => average(groups.get(k)!.map((i) => mesh.vertices[i]))),
    seen = new Set<string>();
  const faces = mesh.faces
    .map((f) => f.map((v) => ids.get(index[v])!))
    .filter((f) => {
      const k = [...f].sort((a, b) => a - b).join(',');
      if (new Set(f).size < 3 || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  return { vertices, faces };
}
export function splitEdge(mesh: PolyMesh, a: number, b: number): PolyMesh {
  const e = adjacency(mesh).edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  if (!e || e.faces.some((f) => mesh.faces[f].length !== 3))
    throw new RangeError('需要三角网格中的一条边');
  const id = mesh.vertices.length,
    vertices = [
      ...mesh.vertices.map((p) => [...p] as Vec3),
      average([mesh.vertices[a], mesh.vertices[b]]),
    ];
  const faces = mesh.faces.flatMap((f, i) => {
    if (!e.faces.includes(i)) return [[...f]];
    const k = f.findIndex(
        (v, j) => (v === a && f[(j + 1) % 3] === b) || (v === b && f[(j + 1) % 3] === a),
      ),
      u = f[k],
      v = f[(k + 1) % 3],
      w = f[(k + 2) % 3];
    return [
      [u, id, w],
      [id, v, w],
    ];
  });
  return { vertices, faces };
}
