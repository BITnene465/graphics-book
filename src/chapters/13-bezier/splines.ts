import { finite, dot } from '../../math/vector.ts';
import { controlPoints, bernstein } from './core.ts';

export type Continuity = 'free' | 'C0' | 'G1' | 'C1' | 'C2';
function pair(
  left: number[][],
  right: number[][],
  leftDuration: number,
  rightDuration: number,
): void {
  controlPoints(left);
  controlPoints(right);
  finite([leftDuration, rightDuration]);
  if (
    left.length !== 4 ||
    right.length !== 4 ||
    left[0].length !== right[0].length ||
    Math.min(leftDuration, rightDuration) <= 0
  )
    throw new RangeError('需要两条三次曲线与正参数跨度');
}
export function cubicJoin(
  left: number[][],
  right: number[][],
  mode: Continuity = 'free',
  leftDuration = 1,
  rightDuration = 1,
  tangentScale = 1,
) {
  pair(left, right, leftDuration, rightDuration);
  finite([tangentScale]);
  if (tangentScale <= 0) throw new RangeError('切线比例须为正');
  const p = left.map((v) => [...v]),
    q = right.map((v) => [...v]);
  if (mode !== 'free') q[0] = [...p[3]];
  if (mode === 'G1' || mode === 'C1' || mode === 'C2') {
    const tangent = p[3].map((x, i) => x - p[2][i]),
      ratio = mode === 'G1' ? tangentScale : rightDuration / leftDuration;
    if (mode === 'G1' && tangent.every((x) => x === 0)) throw new RangeError('零切线没有 G1 方向');
    q[1] = q[0].map((x, i) => x + ratio * tangent[i]);
    if (mode === 'C2')
      q[2] = q[0].map((x, i) => 2 * q[1][i] - x + ratio ** 2 * (p[3][i] - 2 * p[2][i] + p[1][i]));
  }
  finite(q.flat());
  return { left: p, right: q };
}
export function joinDiagnostics(
  left: number[][],
  right: number[][],
  leftDuration = 1,
  rightDuration = 1,
  tolerance = 1e-9,
) {
  pair(left, right, leftDuration, rightDuration);
  const lv = left[3].map((x, i) => (3 * (x - left[2][i])) / leftDuration),
    rv = right[1].map((x, i) => (3 * (x - right[0][i])) / rightDuration);
  const la = left[3].map((x, i) => (6 * (x - 2 * left[2][i] + left[1][i])) / leftDuration ** 2),
    ra = right[2].map((x, i) => (6 * (x - 2 * right[1][i] + right[0][i])) / rightDuration ** 2);
  const endpointGap = right[0].map((x, i) => x - left[3][i]),
    velocityGap = rv.map((x, i) => x - lv[i]),
    accelerationGap = ra.map((x, i) => x - la[i]);
  const c0 = Math.hypot(...endpointGap) <= tolerance,
    c1 = c0 && Math.hypot(...velocityGap) <= tolerance,
    c2 = c1 && Math.hypot(...accelerationGap) <= tolerance;
  const nl = Math.hypot(...lv),
    nr = Math.hypot(...rv),
    g1Defined = nl > 0 && nr > 0,
    ul = lv.map((x) => x / nl),
    ur = rv.map((x) => x / nr);
  return {
    endpointGap,
    velocityGap,
    accelerationGap,
    leftVelocity: lv,
    rightVelocity: rv,
    leftAcceleration: la,
    rightAcceleration: ra,
    c0,
    c1,
    c2,
    g1Defined,
    g1: c0 && g1Defined && Math.hypot(...ul.map((x, i) => x - ur[i])) <= tolerance,
    tangentCosine: g1Defined ? Math.max(-1, Math.min(1, dot(ul, ur))) : null,
  };
}
function inputs(knots: number[], degree: number, u: number): number {
  finite([...knots, u]);
  if (
    !Number.isInteger(degree) ||
    degree < 0 ||
    degree > 8 ||
    knots.length < 2 * (degree + 1) ||
    knots.some((x, i) => i > 0 && x < knots[i - 1])
  )
    throw new RangeError('结点必须非递减，次数须为 0 至 8');
  let run = 1;
  for (let i = 1; i < knots.length; i++) {
    run = knots[i] === knots[i - 1] ? run + 1 : 1;
    if (run > degree + 1) throw new RangeError('结点重数超过 p+1');
  }
  const n = knots.length - degree - 1;
  if (knots[degree] >= knots[n] || u < knots[degree] || u > knots[n])
    throw new RangeError('参数超出活动域');
  return n;
}
/** Cox–de Boor：内部结点取右侧；活动域最后端点取左极限。 */
function basisLevels(knots: number[], degree: number, u: number, count: number): number[][] {
  const finalSpan = knots.findIndex((x) => x === knots[count]) - 1;
  const levels = [
    knots
      .slice(0, -1)
      .map((x, i) => Number(u === knots[count] ? i === finalSpan : u >= x && u < knots[i + 1])),
  ];
  for (let p = 1; p <= degree; p++)
    levels.push(
      Array.from({ length: knots.length - p - 1 }, (_, i) => {
        const a = knots[i + p] - knots[i],
          b = knots[i + p + 1] - knots[i + 1];
        return (
          (a ? ((u - knots[i]) / a) * levels[p - 1][i] : 0) +
          (b ? ((knots[i + p + 1] - u) / b) * levels[p - 1][i + 1] : 0)
        );
      }),
    );
  return levels;
}
export function bsplineBasis(knots: number[], degree: number, u: number): number[] {
  const n = inputs(knots, degree, u);
  return basisLevels(knots, degree, u, n)[degree];
}
export function basisDerivative(knots: number[], degree: number, u: number, order = 1): number[] {
  const n = inputs(knots, degree, u);
  if (!Number.isInteger(order) || order < 0 || order > 8) throw new RangeError('导数阶数非法');
  if (order > degree) return Array(n).fill(0);
  let levels = basisLevels(knots, degree, u, n);
  for (let d = 1; d <= order; d++) {
    const next: number[][] = [];
    for (let p = d; p <= degree; p++)
      next[p] = Array.from({ length: knots.length - p - 1 }, (_, i) => {
        const a = knots[i + p] - knots[i],
          b = knots[i + p + 1] - knots[i + 1];
        return (a ? (p / a) * levels[p - 1][i] : 0) - (b ? (p / b) * levels[p - 1][i + 1] : 0);
      });
    levels = next;
  }
  return levels[degree];
}
function weightedCurve(control: number[][], basis: number[], weights: number[]): number[] {
  controlPoints(control);
  finite(weights);
  if (
    control.length !== basis.length ||
    weights.length !== basis.length ||
    weights.some((w) => w <= 0)
  )
    throw new RangeError('每个控制点须有一个正权重');
  const largest = Math.max(...weights),
    weighted = weights.map((w, i) => (w / largest) * basis[i]),
    total = weighted.reduce((a, b) => a + b, 0);
  if (total <= 0 || !Number.isFinite(total)) throw new RangeError('有理曲线分母超出数值范围');
  const value = control[0].map((_, c) =>
    control.reduce((s, p, i) => s + (weighted[i] / total) * p[c], 0),
  );
  finite(value);
  return value;
}
export function evaluateBSpline(
  control: number[][],
  knots: number[],
  degree: number,
  u: number,
  weights = control.map(() => 1),
): number[] {
  return weightedCurve(control, bsplineBasis(knots, degree, u), weights);
}
export function rationalBezier(control: number[][], weights: number[], t: number): number[] {
  return weightedCurve(control, bernstein(t, control.length - 1), weights);
}
