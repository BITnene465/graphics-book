import { finite, dot } from './vector.ts';

/** 小型稠密系统的部分主元消元；不显式构造逆矩阵。 */
export function solve(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  if (!n || matrix.length !== n || matrix.some((r) => r.length !== n))
    throw new RangeError('需要匹配的方阵与右端');
  finite([...matrix.flat(), ...rhs]);
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  const scale = Math.max(...matrix.flat().map(Math.abs));
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(a[i][k]) > Math.abs(a[pivot][k])) pivot = i;
    if (Math.abs(a[pivot][k]) <= 1e-12 * scale) throw new RangeError('系统奇异或条件过差');
    [a[k], a[pivot]] = [a[pivot], a[k]];
    for (let i = k + 1; i < n; i++) {
      const ratio = a[i][k] / a[k][k];
      for (let j = k; j <= n; j++) a[i][j] -= ratio * a[k][j];
    }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--)
    x[i] = (a[i][n] - a[i].slice(i + 1, n).reduce((s, v, j) => s + v * x[i + j + 1], 0)) / a[i][i];
  return x;
}

/** 列满秩最小二乘；两遍修正 Gram–Schmidt，保留可读的 QR 过程。 */
export function leastSquares(a: number[][], b: number[]): number[] {
  const m = a.length,
    n = a[0]?.length ?? 0;
  if (!n || m < n || b.length !== m || a.some((r) => r.length !== n))
    throw new RangeError('最小二乘尺寸无效');
  finite([...a.flat(), ...b]);
  const q: number[][] = [],
    r = Array.from({ length: n }, () => Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    let v = a.map((row) => row[j]);
    const original = Math.hypot(...v);
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < j; i++) {
        const c = dot(q[i], v);
        r[i][j] += c;
        v = v.map((x, k) => x - c * q[i][k]);
      }
    const norm = Math.hypot(...v);
    if (norm < 1e-11 * Math.max(1, original)) throw new RangeError('约束不足或列秩退化');
    r[j][j] = norm;
    q.push(v.map((x) => x / norm));
  }
  const x = q.map((column) => dot(column, b));
  for (let i = n - 1; i >= 0; i--)
    x[i] = (x[i] - r[i].slice(i + 1).reduce((s, v, j) => s + v * x[i + j + 1], 0)) / r[i][i];
  return x;
}
