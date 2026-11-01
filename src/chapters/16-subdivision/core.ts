import { adjacency, average } from '../../math/mesh.ts';
import type { PolyMesh } from '../../math/mesh.ts';
import type { Vec3 } from '../../math/vector.ts';
import { halfedges } from '../12-geometry/halfedge.ts';

export const weighted = (points: Vec3[], weights: number[]): Vec3 =>
  [0, 1, 2].map((k) => points.reduce((s, p, i) => s + weights[i] * p[k], 0)) as Vec3;
const edgeKey = (a: number, b: number) => (a < b ? a + ',' + b : b + ',' + a);

/** 光滑边界使用 3/4,1/8,1/8；内部面点、边点和旧顶点同时由旧网格求出。 */
export function catmullClark(mesh: PolyMesh): PolyMesh {
  const { edges, neighbors, incident, boundary } = adjacency(mesh),
    facePoints = mesh.faces.map((f) => average(f.map((i) => mesh.vertices[i])));
  const vertices = mesh.vertices.map((p, i): Vec3 => {
    if (boundary[i].length) {
      if (boundary[i].length !== 2) throw new RangeError('需要流形边界');
      return weighted([p, ...boundary[i].map((j) => mesh.vertices[j])], [0.75, 0.125, 0.125]);
    }
    const m = neighbors[i].length;
    if (!m) return [...p];
    const f = average(incident[i].map((j) => facePoints[j])),
      r = average(neighbors[i].map((j) => average([p, mesh.vertices[j]])));
    return weighted([f, r, p], [1 / m, 2 / m, (m - 3) / m]);
  });
  const edgeIndices = new Map<string, number>();
  for (const e of edges) {
    edgeIndices.set(edgeKey(e.a, e.b), vertices.length);
    vertices.push(
      average([
        mesh.vertices[e.a],
        mesh.vertices[e.b],
        ...e.faces.filter(() => e.faces.length === 2).map((f) => facePoints[f]),
      ]),
    );
  }
  const faceStart = vertices.length;
  vertices.push(...facePoints);
  const faces = mesh.faces.flatMap((f, fi) =>
    f.map((v, i) => [
      v,
      edgeIndices.get(edgeKey(v, f[(i + 1) % f.length]))!,
      faceStart + fi,
      edgeIndices.get(edgeKey(f[(i + f.length - 1) % f.length], v))!,
    ]),
  );
  return { vertices, faces };
}

export function loopBeta(m: number): number {
  if (!Number.isInteger(m) || m < 3) throw new RangeError('内部顶点度数至少为 3');
  return (5 / 8 - (3 / 8 + Math.cos((2 * Math.PI) / m) / 4) ** 2) / m;
}
function splitTriangles(
  mesh: PolyMesh,
  vertices: Vec3[],
  edges: ReturnType<typeof adjacency>['edges'],
  edgePoints: Vec3[],
): PolyMesh {
  const ids = new Map<string, number>();
  edges.forEach((e, i) => {
    ids.set(edgeKey(e.a, e.b), vertices.length);
    vertices.push(edgePoints[i]);
  });
  const faces = mesh.faces.flatMap(([a, b, c]) => {
    const ab = ids.get(edgeKey(a, b))!,
      bc = ids.get(edgeKey(b, c))!,
      ca = ids.get(edgeKey(c, a))!;
    return [
      [a, ab, ca],
      [b, bc, ab],
      [c, ca, bc],
      [ab, bc, ca],
    ];
  });
  return { vertices, faces };
}
/** 三角网格的 Loop 细分，旧点也会移动。 */
export function loopSubdivision(mesh: PolyMesh): PolyMesh {
  if (mesh.faces.some((f) => f.length !== 3)) throw new RangeError('Loop 需要三角网格');
  const a = adjacency(mesh);
  const vertices = mesh.vertices.map((p, i): Vec3 => {
    const b = a.boundary[i];
    if (b.length) {
      if (b.length !== 2) throw new RangeError('需要流形边界');
      return weighted([p, ...b.map((j) => mesh.vertices[j])], [0.75, 0.125, 0.125]);
    }
    const m = a.neighbors[i].length;
    if (!m) return [...p];
    const beta = loopBeta(m);
    return weighted(
      [p, ...a.neighbors[i].map((j) => mesh.vertices[j])],
      [1 - m * beta, ...Array(m).fill(beta)],
    );
  });
  const edgePoints = a.edges.map((e) =>
    e.faces.length === 1
      ? average([mesh.vertices[e.a], mesh.vertices[e.b]])
      : weighted(
          [e.a, e.b, ...e.opposite].map((i) => mesh.vertices[i]),
          [3 / 8, 3 / 8, 1 / 8, 1 / 8],
        ),
  );
  return splitTriangles(mesh, vertices, a.edges, edgePoints);
}

/** Doo–Sabin 的面内模板：每个旧面角生成一个新点。 */
export function dooSabinWeights(m: number, i: number): number[] {
  if (!Number.isInteger(m) || m < 3 || i < 0 || i >= m) throw new RangeError('面角无效');
  return Array.from({ length: m }, (_, j) =>
    i === j ? (m + 5) / (4 * m) : (3 + 2 * Math.cos((2 * Math.PI * (i - j)) / m)) / (4 * m),
  );
}
/** 此参考实现限闭合、定向流形；F/E/V 三类新面保留显式构造。 */
export function dooSabin(mesh: PolyMesh): PolyMesh {
  const h = halfedges(mesh.vertices.length, mesh.faces);
  if (h.edges.some((e) => e.twin < 0)) throw new RangeError('Doo–Sabin 示例要求闭合网格');
  const vertices: Vec3[] = [],
    corner: number[][] = [];
  for (const f of mesh.faces) {
    const row: number[] = [];
    f.forEach((_, i) => {
      row.push(vertices.length);
      vertices.push(
        weighted(
          f.map((v) => mesh.vertices[v]),
          dooSabinWeights(f.length, i),
        ),
      );
    });
    corner.push(row);
  }
  const faces = corner.map((f) => [...f]),
    previous = Array(h.edges.length).fill(0),
    cornerIndex = Array(h.edges.length).fill(0);
  h.edges.forEach((e, i) => {
    previous[e.next] = i;
    cornerIndex[i] = corner[e.face][i - h.faces[e.face]];
  });
  h.edges.forEach((e, i) => {
    if (e.twin > i)
      faces.push([
        cornerIndex[e.next],
        cornerIndex[i],
        cornerIndex[h.edges[e.twin].next],
        cornerIndex[e.twin],
      ]);
  });
  mesh.vertices.forEach((_, v) => {
    const first = h.edges.findIndex((e) => e.origin === v);
    if (first < 0) return;
    const ring: number[] = [];
    let k = first;
    do {
      ring.push(cornerIndex[k]);
      k = h.edges[previous[k]].twin;
      if (ring.length > h.edges.length) throw new RangeError('顶点邻域不是单环');
    } while (k !== first);
    faces.push(ring);
  });
  adjacency({ vertices, faces });
  return { vertices, faces };
}

/** 经典八点 Butterfly 模板；负权会过冲，奇异顶点需另选修正规则。 */
export function butterflyPoint(points: Vec3[]): Vec3 {
  if (points.length !== 8) throw new RangeError('模板需要八个点');
  return weighted(points, [0.5, 0.5, 0.125, 0.125, -0.0625, -0.0625, -0.0625, -0.0625]);
}
