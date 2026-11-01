import { finite, cross, dot, scale, mix } from '../../math/vector.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { bernstein, deCasteljau } from '../13-bezier/core.ts';
import { cubicJoin } from '../13-bezier/splines.ts';
import type { Continuity } from '../13-bezier/splines.ts';

export type ControlNet = Vec3[][];
export function defaultControl(): ControlNet {
  return Array.from({ length: 4 }, (_, i) =>
    Array.from({ length: 4 }, (_, j) => [
      (i - 1.5) * 0.9,
      Math.sin((i / 3) * Math.PI) * Math.sin((j / 3) * Math.PI) * 1.4,
      (1.5 - j) * 0.9,
    ]),
  );
}
function control(points: ControlNet): void {
  if (
    !points.length ||
    !points[0].length ||
    points.some((row) => row.length !== points[0].length || row.some((p) => p.length !== 3))
  )
    throw new RangeError('控制网须为非空 nu×nv×3 数组');
  finite(points.flat(2));
}
/** 第一索引沿 u，第二索引沿 v。 */
export function evaluatePatch(points: ControlNet, u: number, v: number): Vec3 {
  control(points);
  const bu = bernstein(u, points.length - 1),
    bv = bernstein(v, points[0].length - 1),
    result = [0, 0, 0] as Vec3;
  points.forEach((row, i) =>
    row.forEach((p, j) => p.forEach((x, c) => (result[c] += bu[i] * bv[j] * x))),
  );
  finite(result);
  return result;
}
export function deCasteljauPatch(points: ControlNet, u: number, v: number, order: 'u' | 'v' = 'u') {
  control(points);
  bernstein(u, 1);
  bernstein(v, 1);
  let net =
    order === 'u'
      ? points.map((row) => row.map((p) => [...p] as Vec3))
      : points[0].map((_, j) => points.map((row) => [...row[j]] as Vec3));
  const firstParameter = order === 'u' ? u : v,
    secondParameter = order === 'u' ? v : u,
    firstLevels = [net];
  while (net.length > 1) {
    net = net
      .slice(0, -1)
      .map((row, i) => row.map((p, j) => mix(p, net[i + 1][j], firstParameter) as Vec3));
    firstLevels.push(net);
  }
  const intermediate = net[0],
    secondLevels = deCasteljau(intermediate, secondParameter);
  return {
    order,
    firstParameter,
    secondParameter,
    firstLevels,
    intermediate,
    secondLevels,
    position: secondLevels.at(-1)![0] as Vec3,
  };
}
function partial(points: ControlNet, u: number, v: number, du: number, dv: number): Vec3 {
  if (du >= points.length || dv >= points[0].length) return [0, 0, 0];
  let net = points;
  for (let k = 0; k < du; k++) {
    const n = net.length - 1;
    net = net
      .slice(0, -1)
      .map((row, i) => row.map((p, j) => p.map((x, c) => n * (net[i + 1][j][c] - x)) as Vec3));
  }
  for (let k = 0; k < dv; k++) {
    const n = net[0].length - 1;
    net = net.map((row) =>
      row.slice(0, -1).map((p, j) => p.map((x, c) => n * (row[j + 1][c] - x)) as Vec3),
    );
  }
  return evaluatePatch(net, u, v);
}
export function surfacePartials(points: ControlNet, u: number, v: number) {
  return {
    du: partial(points, u, v, 1, 0),
    dv: partial(points, u, v, 0, 1),
    duu: partial(points, u, v, 2, 0),
    duv: partial(points, u, v, 1, 1),
    dvv: partial(points, u, v, 0, 2),
  };
}
export function surfaceFrame(points: ControlNet, u: number, v: number, tolerance = 1e-12) {
  if (tolerance <= 0 || tolerance >= 1) throw new RangeError('正则阈值须在 (0,1)');
  const position = evaluatePatch(points, u, v),
    d = surfacePartials(points, u, v),
    a = Math.hypot(...d.du),
    b = Math.hypot(...d.dv);
  const uu = scale(d.du, a ? 1 / a : 0),
    uv = scale(d.dv, b ? 1 / b : 0),
    unitCross = cross(uu, uv),
    sine = Math.hypot(...unitCross),
    crossed = cross(d.du, d.dv),
    area = Math.hypot(...crossed);
  const regular = a > 0 && b > 0 && sine > tolerance && area > 0,
    normal = (regular ? scale(unitCross, 1 / sine) : [NaN, NaN, NaN]) as Vec3;
  const cosine = dot(uu, uv),
    e = dot(d.duu, normal) / a / a,
    f = dot(d.duv, normal) / a / b,
    g = dot(d.dvv, normal) / b / b;
  const meanCurvature = regular ? (e + g - 2 * cosine * f) / (2 * sine * sine) : NaN,
    gaussianCurvature = regular ? (e * g - f * f) / (sine * sine) : NaN;
  finite([area]);
  if (regular) finite([...normal, meanCurvature, gaussianCurvature]);
  return {
    position,
    ...d,
    cross: crossed,
    area,
    normal,
    regular,
    meanCurvature,
    gaussianCurvature,
  };
}
export function patchMesh(points: ControlNet, divisions: number | Vec2 = 24) {
  const [nu, nv] = typeof divisions === 'number' ? [divisions, divisions] : divisions;
  if (![nu, nv].every((n) => Number.isInteger(n) && n >= 1 && n <= 256))
    throw new RangeError('曲面分段须为 1 至 256');
  const vertices: Vec3[] = [],
    normals: Vec3[] = [],
    uv: Vec2[] = [],
    faces: Vec3[] = [],
    regular: boolean[] = [];
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      const at: Vec2 = [i / nu, j / nv],
        frame = surfaceFrame(points, ...at);
      vertices.push(frame.position);
      normals.push(frame.normal);
      regular.push(frame.regular);
      uv.push(at);
      if (i < nu && j < nv) {
        const a = i * (nv + 1) + j,
          b = a + nv + 1;
        faces.push([a, b, b + 1], [a, b + 1, a + 1]);
      }
    }
  return { vertices, normals, uv, faces, regular };
}
export function stitchPatches(
  left: ControlNet,
  right: ControlNet,
  mode: Continuity = 'free',
  leftSpan = 1,
  rightSpan = 1,
  tangentScale = 1,
) {
  control(left);
  control(right);
  if (left.length !== 4 || right.length !== 4 || left[0].length !== 4 || right[0].length !== 4)
    throw new RangeError('拼接要求双三次控制网');
  const result = right.map((row) => row.map((p) => [...p] as Vec3));
  for (let j = 0; j < 4; j++) {
    // 曲面 G1 允许退化控制列；最终必须用正则性检查判断切平面。
    if (mode === 'G1' && left[3][j].every((x, c) => x === left[2][j][c])) {
      result[0][j] = [...left[3][j]];
      result[1][j] = [...left[3][j]];
      continue;
    }
    const joined = cubicJoin(
      left.map((row) => row[j]),
      right.map((row) => row[j]),
      mode,
      leftSpan,
      rightSpan,
      tangentScale,
    );
    for (let i = 0; i < 4; i++) result[i][j] = joined.right[i] as Vec3;
  }
  return { left: left.map((row) => row.map((p) => [...p] as Vec3)), right: result };
}
export function joinDiagnostics(
  left: ControlNet,
  right: ControlNet,
  v = 0.5,
  leftSpan = 1,
  rightSpan = 1,
  tolerance = 1e-9,
) {
  finite([leftSpan, rightSpan, tolerance]);
  if (Math.min(leftSpan, rightSpan, tolerance) <= 0)
    throw new RangeError('参数跨度及误差容限须为正');
  const a = surfaceFrame(left, 1, v),
    b = surfaceFrame(right, 0, v);
  const positionGap = Math.hypot(...a.position.map((x, i) => x - b.position[i]));
  const duGap = Math.hypot(...a.du.map((x, i) => x / leftSpan - b.du[i] / rightSpan));
  const duuGap = Math.hypot(...a.duu.map((x, i) => x / leftSpan ** 2 - b.duu[i] / rightSpan ** 2));
  const dvGap = Math.hypot(...a.dv.map((x, i) => x - b.dv[i])),
    duvGap = Math.hypot(...a.duv.map((x, i) => x / leftSpan - b.duv[i] / rightSpan)),
    dvvGap = Math.hypot(...a.dvv.map((x, i) => x - b.dvv[i]));
  const c0 = positionGap <= tolerance,
    c1 = c0 && duGap <= tolerance && dvGap <= tolerance,
    c2 = c1 && Math.max(duuGap, duvGap, dvvGap) <= tolerance;
  const regular = a.regular && b.regular,
    g1 = c0 && regular && Math.hypot(...a.normal.map((x, i) => x - b.normal[i])) <= tolerance;
  return {
    left: a,
    right: b,
    positionGap,
    duGap,
    dvGap,
    duuGap,
    duvGap,
    dvvGap,
    c0,
    c1,
    c2,
    g1,
    regular,
  };
}
