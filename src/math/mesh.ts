import type { Vec3 } from './vector.ts';
import { finite } from './vector.ts';
import { halfedges } from '../chapters/12-geometry/halfedge.ts';

export type PolyMesh = { vertices: Vec3[]; faces: number[][] };
export const average = (points: number[][]): Vec3 =>
  [0, 1, 2].map((k) => points.reduce((s, p) => s + p[k], 0) / points.length) as Vec3;

/** 共享的面/边邻接；保持面绕序，边界只有一个邻接面。 */
export function adjacency(mesh: PolyMesh) {
  finite(mesh.vertices.flat());
  if (mesh.vertices.some((p) => p.length !== 3)) throw new RangeError('需要三维顶点');
  const h = halfedges(mesh.vertices.length, mesh.faces);
  const edges: { a: number; b: number; faces: number[]; opposite: number[] }[] = [];
  const neighbors = mesh.vertices.map(() => new Set<number>());
  const incident = mesh.vertices.map(() => new Set<number>());
  const boundary = mesh.vertices.map(() => new Set<number>());
  h.edges.forEach((e, i) => {
    const b = h.edges[e.next].origin,
      a = e.origin;
    neighbors[a].add(b);
    neighbors[b].add(a);
    incident[a].add(e.face);
    if (e.twin >= 0 && e.twin < i) return;
    const faces = e.twin < 0 ? [e.face] : [e.face, h.edges[e.twin].face];
    edges.push({
      a,
      b,
      faces,
      opposite: faces.flatMap((f) => mesh.faces[f].filter((v) => v !== a && v !== b)),
    });
    if (e.twin < 0) {
      boundary[a].add(b);
      boundary[b].add(a);
    }
  });
  return {
    edges,
    neighbors: neighbors.map((s) => [...s]),
    incident: incident.map((s) => [...s]),
    boundary: boundary.map((s) => [...s]),
  };
}

export function cubeMesh(): PolyMesh {
  return {
    vertices: [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
    faces: [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ],
  };
}
export function triangulate(mesh: PolyMesh): PolyMesh {
  return {
    vertices: mesh.vertices.map((p) => [...p]),
    faces: mesh.faces.flatMap((f) => f.slice(1, -1).map((v, i) => [f[0], v, f[i + 2]])),
  };
}
export function gridMesh(n = 6, height: (x: number, y: number) => number = () => 0): PolyMesh {
  if (!Number.isInteger(n) || n < 1 || n > 64) throw new RangeError('网格分段为 1–64');
  const vertices: Vec3[] = Array.from({ length: (n + 1) ** 2 }, (_, i) => {
    const x = (2 * (i % (n + 1))) / n - 1,
      y = (2 * Math.floor(i / (n + 1))) / n - 1;
    return [x, y, height(x, y)];
  });
  const faces: number[][] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const a = y * (n + 1) + x,
        b = a + 1,
        c = a + n + 1,
        d = c + 1;
      faces.push([a, b, d], [a, d, c]);
    }
  return { vertices, faces };
}
