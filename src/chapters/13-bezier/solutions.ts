/** 参考实现。建议先完成 exercises.ts，再逐步比较。 */

/** de Casteljau；复制工作数组，避免改写控制多边形。 */
export function curvePoint(control: number[][], t: number): number[] {
  if (!control.length) throw new RangeError('控制点不能为空');
  let row = control.map((p) => [...p]);
  while (row.length > 1)
    row = row.slice(0, -1).map((p, i) => p.map((x, c) => x * (1 - t) + row[i + 1][c] * t));
  return row[0];
}
/** 返回参数导数，不归一化；常数曲线的导数为零。 */
export function endpointTangents(control: number[][]): [number[], number[]] {
  if (!control.length) throw new RangeError('控制点不能为空');
  const n = control.length - 1;
  return n === 0
    ? [control[0].map(() => 0), control[0].map(() => 0)]
    : [
        control[0].map((x, c) => n * (control[1][c] - x)),
        control[n].map((x, c) => n * (x - control[n - 1][c])),
      ];
}
/** 三次曲线以实际参数时长拼接，匹配接缝速度。 */
export function joinVelocityHandle(
  left: number[][],
  rightDuration: number,
  leftDuration: number,
): number[] {
  if (left.length !== 4 || leftDuration <= 0 || rightDuration <= 0)
    throw new RangeError('需要四个控制点和正时长');
  return left[3].map((x, c) => x + (rightDuration / leftDuration) * (x - left[2][c]));
}
/** 将基函数与正权相乘，再归一化为有理基函数。 */
export function rationalWeights(basis: number[], weights: number[]): number[] {
  if (basis.length !== weights.length || weights.some((w) => w <= 0))
    throw new RangeError('需要同长度的正权');
  const products = basis.map((b, i) => b * weights[i]),
    sum = products.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) throw new RangeError('分母必须为正');
  return products.map((p) => p / sum);
}
