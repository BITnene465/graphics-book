import type { Vec3 } from '../../math/vector.ts';
import { sphereRoots } from '../15-rays/core.ts';
export type Ball = { center: Vec3; radius: number };
export type Box = { min: Vec3; max: Vec3 };
export type BVH = Box & { ids: number[]; children: BVH[] };
export function boxInterval(o: Vec3, d: Vec3, box: Box, tMax = Infinity): [number, number] | null {
  let lo = 0,
    hi = tMax;
  for (let c = 0; c < 3; c++) {
    if (d[c] === 0) {
      if (o[c] < box.min[c] || o[c] > box.max[c]) return null;
      continue;
    }
    const a = (box.min[c] - o[c]) / d[c],
      b = (box.max[c] - o[c]) / d[c];
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
    if (lo > hi) return null;
  }
  return [lo, hi];
}
export function buildBVH(balls: Ball[], ids = balls.map((_, i) => i)): BVH {
  if (!ids.length) throw new RangeError('BVH 需要至少一个图元');
  const min = [0, 1, 2].map((c) =>
    Math.min(...ids.map((i) => balls[i].center[c] - balls[i].radius)),
  ) as Vec3;
  const max = [0, 1, 2].map((c) =>
    Math.max(...ids.map((i) => balls[i].center[c] + balls[i].radius)),
  ) as Vec3;
  if (ids.length <= 2) return { min, max, ids, children: [] };
  const axis = [0, 1, 2].sort((a, b) => max[b] - min[b] - (max[a] - min[a]))[0];
  const sorted = [...ids].sort((a, b) => balls[a].center[axis] - balls[b].center[axis]),
    mid = Math.floor(ids.length / 2);
  return {
    min,
    max,
    ids: [],
    children: [buildBVH(balls, sorted.slice(0, mid)), buildBVH(balls, sorted.slice(mid))],
  };
}
export function intersectBVH(o: Vec3, d: Vec3, balls: Ball[], root: BVH) {
  let t = Infinity,
    id = -1,
    boxes = 0,
    primitives = 0;
  const visited: BVH[] = [];
  const visit = (node: BVH) => {
    boxes++;
    if (!boxInterval(o, d, node, t)) return;
    visited.push(node);
    for (const i of node.ids) {
      primitives++;
      for (const hit of sphereRoots(o, d, balls[i].center, balls[i].radius))
        if (hit >= 0 && hit < t) {
          t = hit;
          id = i;
        }
    }
    const children = node.children
      .map((n) => ({ n, interval: boxInterval(o, d, n, t) }))
      .filter((x) => x.interval)
      .sort((a, b) => a.interval![0] - b.interval![0]);
    children.forEach((x) => visit(x.n));
  };
  visit(root);
  return { t, id, boxes, primitives, visited };
}
