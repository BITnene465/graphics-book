import { finite, mix } from '../../math/vector.ts';

export function controlPoints(control: number[][]): number[][] {
  if (!control.length || !control[0].length || control.some((p) => p.length !== control[0].length))
    throw new RangeError('控制点须为非空矩形数组');
  finite(control.flat());
  return control;
}
export function deCasteljau(control: number[][], t: number): number[][][] {
  controlPoints(control);
  finite([t]);
  if (t < 0 || t > 1) throw new RangeError('参数须在 [0,1]');
  const levels = [control.map((p) => [...p])];
  while (levels.at(-1)!.length > 1) {
    const previous = levels.at(-1)!;
    levels.push(previous.slice(0, -1).map((p, i) => mix(p, previous[i + 1], t)));
  }
  return levels;
}
export function bernstein(t: number, degree = 3): number[] {
  finite([t]);
  if (t < 0 || t > 1 || !Number.isInteger(degree) || degree < 0 || degree > 64)
    throw new RangeError('Bézier 参数或次数非法');
  let combination = 1;
  return Array.from({ length: degree + 1 }, (_, i) => {
    const result = combination * t ** i * (1 - t) ** (degree - i);
    combination *= (degree - i) / (i + 1);
    return result;
  });
}
/** Bernstein 形式与 de Casteljau 独立，方便交叉检查。 */
export function evaluate(control: number[][], t: number): number[] {
  controlPoints(control);
  const weights = bernstein(t, control.length - 1);
  return control[0].map((_, c) => control.reduce((s, p, i) => s + p[c] * weights[i], 0));
}
export function derivative(control: number[][], t: number): number[] {
  controlPoints(control);
  const n = control.length - 1;
  return n === 0
    ? evaluate(control, t).map(() => 0)
    : evaluate(
        control.slice(0, -1).map((p, i) => p.map((x, c) => n * (control[i + 1][c] - x))),
        t,
      );
}
export function split(control: number[][], t: number) {
  const levels = deCasteljau(control, t);
  return { left: levels.map((l) => l[0]), right: [...levels].reverse().map((l) => l.at(-1)!) };
}
export function arcLengthParameters(
  control: number[][],
  fractions: number[],
  steps = 800,
): number[] {
  controlPoints(control);
  finite(fractions);
  if (fractions.some((t) => t < 0 || t > 1) || !Number.isInteger(steps) || steps < 2)
    throw new RangeError('弧长比例或积分段数非法');
  let previous = evaluate(control, 0);
  const cumulative = [0];
  for (let i = 1; i <= steps; i++) {
    const p = evaluate(control, i / steps);
    cumulative.push(cumulative.at(-1)! + Math.hypot(...p.map((x, j) => x - previous[j])));
    previous = p;
  }
  const total = cumulative.at(-1)!;
  if (total === 0) throw new RangeError('零长度曲线没有唯一的弧长反函数');
  return fractions.map((f) => {
    const target = f * total;
    let lo = 0,
      hi = steps;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cumulative[m] <= target) lo = m;
      else hi = m;
    }
    const span = cumulative[hi] - cumulative[lo];
    return (lo + (span ? (target - cumulative[lo]) / span : 0)) / steps;
  });
}
