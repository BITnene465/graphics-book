import { finite } from '../../math/vector.ts';
import { controlPoints } from './core.ts';
import { splineSize } from './splines.ts';

/** 切向量是对归一化参数 t 的导数；不是单位方向。 */
export function hermite(
  p0: number[],
  p1: number[],
  t0: number[],
  t1: number[],
  t: number,
): number[] {
  controlPoints([p0, p1, t0, t1]);
  finite([t]);
  if (t < 0 || t > 1) throw new RangeError('参数须在 [0,1] 内');
  const h00 = 2 * t ** 3 - 3 * t ** 2 + 1,
    h10 = t ** 3 - 2 * t ** 2 + t;
  const h01 = -2 * t ** 3 + 3 * t ** 2,
    h11 = t ** 3 - t ** 2;
  return p0.map((x, i) => h00 * x + h10 * t0[i] + h01 * p1[i] + h11 * t1[i]);
}

export function hermiteBezier(p0: number[], p1: number[], t0: number[], t1: number[]): number[][] {
  controlPoints([p0, p1, t0, t1]);
  return [[...p0], p0.map((x, i) => x + t0[i] / 3), p1.map((x, i) => x - t1[i] / 3), [...p1]];
}

/** de Boor 只更新当前结点区间的 p+1 个控制点；保留各层供演示检查。 */
export function deBoor(control: number[][], knots: number[], degree: number, u: number) {
  controlPoints(control);
  const count = splineSize(knots, degree, u);
  if (control.length !== count) throw new RangeError('控制点数量与结点向量不匹配');
  // 内部结点取右区间，活动域右端点取左侧最后一个非零区间。
  const span =
    u === knots[count]
      ? knots.findIndex((x) => x === knots[count]) - 1
      : knots.findIndex((x, i) => i >= degree && x <= u && u < knots[i + 1]);
  const work = control.slice(span - degree, span + 1).map((p) => [...p]);
  const levels = [work.map((p) => [...p])];
  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const i = span - degree + j;
      const denominator = knots[i + degree - r + 1] - knots[i];
      const alpha = denominator === 0 ? 0 : (u - knots[i]) / denominator;
      work[j] = work[j - 1].map((x, c) => (1 - alpha) * x + alpha * work[j][c]);
    }
    levels.push(work.slice(r).map((p) => [...p]));
  }
  return { point: [...work[degree]], span, levels };
}
