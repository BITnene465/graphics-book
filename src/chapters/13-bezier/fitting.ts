import { dot, finite } from '../../math/vector.ts';
import { controlPoints } from './core.ts';

function samples(parameters: number[], data: number[][]): void {
  controlPoints(data);
  finite(parameters);
  if (parameters.length !== data.length || parameters.some((t) => t < 0 || t > 1))
    throw new RangeError('每个样本需要一个 [0,1] 内的参数');
}

/** Lagrange 插值；样本参数互异，结果次数至多 n-1。 */
export function interpolate(parameters: number[], data: number[][], t: number): number[] {
  samples(parameters, data);
  finite([t]);
  if (t < 0 || t > 1 || new Set(parameters).size !== parameters.length)
    throw new RangeError('插值参数须在 [0,1]，样本参数必须互异');
  const weights = parameters.map((ti, i) =>
    parameters.reduce((w, tj, j) => (i === j ? w : (w * (t - tj)) / (ti - tj)), 1),
  );
  return data[0].map((_, axis) => data.reduce((sum, p, i) => sum + weights[i] * p[axis], 0));
}

/** 幂基系数按常数项、一阶项……排列；每项是一个向量。 */
export function polynomial(coefficients: number[][], t: number): number[] {
  controlPoints(coefficients);
  finite([t]);
  return coefficients.reduceRight(
    (value, coefficient) => value.map((x, i) => x * t + coefficient[i]),
    coefficients[0].map(() => 0),
  );
}

/** 小规模多项式最小二乘：QR 正交化后回代，不构造 VᵀV 或矩阵逆。 */
export function fitPolynomial(parameters: number[], data: number[][], degree = 3) {
  samples(parameters, data);
  if (!Number.isInteger(degree) || degree < 0 || degree > 8 || degree >= data.length)
    throw new RangeError('次数须为 0–8 且小于样本数');
  const count = degree + 1,
    q: number[][] = [],
    r = Array.from({ length: count }, () => Array(count).fill(0));
  for (let column = 0; column < count; column++) {
    let v = parameters.map((t) => t ** column);
    const originalLength = Math.hypot(...v);
    // 再正交化一次，减轻相近幂列在浮点计算中的正交性损失。
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < column; i++) {
        const projection = dot(q[i], v);
        r[i][column] += projection;
        v = v.map((x, j) => x - projection * q[i][j]);
      }
    r[column][column] = Math.hypot(...v);
    if (r[column][column] <= 1e-12 * Math.max(1, originalLength))
      throw new RangeError('参数矩阵秩不足或数值上接近退化');
    q.push(v.map((x) => x / r[column][column]));
  }
  const coefficients = q.map((column) =>
    data[0].map((_, axis) =>
      dot(
        column,
        data.map((p) => p[axis]),
      ),
    ),
  );
  for (let i = count - 1; i >= 0; i--)
    coefficients[i] = coefficients[i].map(
      (x, axis) =>
        (x -
          r[i]
            .slice(i + 1)
            .reduce((sum, value, j) => sum + value * coefficients[i + 1 + j][axis], 0)) /
        r[i][i],
    );
  const residuals = data.map((p, i) =>
    polynomial(coefficients, parameters[i]).map((x, axis) => x - p[axis]),
  );
  const squaredError = residuals.flat().reduce((sum, x) => sum + x * x, 0);
  return { coefficients, residuals, squaredError };
}
