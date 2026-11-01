import type { Vec2, Vec3 } from '../../math/vector.ts';
import { dot, normalize, sub } from '../../math/vector.ts';
import { solve } from '../../math/linear.ts';

/** 多条单位视射线的正交距离最小二乘；位置、方向均在世界坐标。 */
export function triangulateRays(origins: Vec3[], directions: Vec3[]): Vec3 {
  if (origins.length !== directions.length || origins.length < 2)
    throw new RangeError('至少需要两条视射线');
  const A = Array.from({ length: 3 }, () => [0, 0, 0]),
    b = [0, 0, 0];
  origins.forEach((o, k) => {
    const d = normalize(directions[k]);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const a = Number(i === j) - d[i] * d[j];
        A[i][j] += a;
        b[i] += a * o[j];
      }
  });
  return solve(A, b) as Vec3;
}
/** 已校正平行双目，x 为右正图像坐标，D 为正轴向距离。 */
export function stereoDepth(focal: number, baseline: number, disparity: number): number {
  if (focal <= 0 || baseline <= 0 || disparity <= 0)
    throw new RangeError('焦距、基线与视差必须为正');
  return (focal * baseline) / disparity;
}
/** 点到点 ICP 的二维截面：最近邻 + 闭式刚体配准。 */
export function icp(
  source: Vec2[],
  target: Vec2[],
  steps: number,
): { points: Vec2[]; errors: number[] } {
  let points = source.map((p) => [...p] as Vec2);
  const errors: number[] = [];
  for (let k = 0; k < steps; k++) {
    const matches = points.map((p) =>
      target.reduce((a, b) => (Math.hypot(...sub(p, a)) < Math.hypot(...sub(p, b)) ? a : b)),
    );
    const center = (ps: Vec2[]) =>
      [0, 1].map((c) => ps.reduce((s, p) => s + p[c], 0) / ps.length) as Vec2;
    const a = center(points),
      b = center(matches);
    let c = 0,
      s = 0;
    points.forEach((p, i) => {
      const u = sub(p, a),
        v = sub(matches[i], b);
      c += dot(u, v);
      s += u[0] * v[1] - u[1] * v[0];
    });
    const angle = Math.atan2(s, c),
      co = Math.cos(angle),
      si = Math.sin(angle);
    points = points.map((p) => [
      co * (p[0] - a[0]) - si * (p[1] - a[1]) + b[0],
      si * (p[0] - a[0]) + co * (p[1] - a[1]) + b[1],
    ]);
    errors.push(
      points.reduce((sum, p, i) => sum + sub(p, matches[i]).reduce((t, v) => t + v * v, 0), 0) /
        points.length,
    );
  }
  return { points, errors };
}
/** 一个四面体中的分片线性等值面；每个交点在线性标量场的零集上。 */
export function tetraSurface(p: Vec3[], values: number[]): Vec3[][] {
  const inside = [0, 1, 2, 3].filter((i) => values[i] < 0),
    outside = [0, 1, 2, 3].filter((i) => values[i] >= 0);
  if (!inside.length || !outside.length) return [];
  const edge = (i: number, j: number): Vec3 => {
    const t = values[i] / (values[i] - values[j]);
    return p[i].map((x, c) => x + t * (p[j][c] - x)) as Vec3;
  };
  if (inside.length === 1) return [[...outside.map((j) => edge(inside[0], j))]];
  if (outside.length === 1) return [[...inside.map((i) => edge(i, outside[0])).reverse()]];
  const [a, b] = inside,
    [c, d] = outside,
    ac = edge(a, c),
    ad = edge(a, d),
    bc = edge(b, c),
    bd = edge(b, d);
  return [
    [ac, ad, bd],
    [ac, bd, bc],
  ];
}
