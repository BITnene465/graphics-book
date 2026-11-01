import { dot, finite } from './vector.ts';

/** 按行存储，作用于列向量；存储方式不改变公式 M p 的含义。 */
export type Matrix = number[][];

export function identity(n: number): Matrix {
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => Number(r === c)));
}

export function transpose(a: Matrix): Matrix {
  if (!a.length || !a.every((row) => row.length === a[0].length))
    throw new RangeError('矩阵必须为非空矩形');
  return a[0].map((_, c) => a.map((row) => row[c]));
}

export function matVec(a: Matrix, v: readonly number[]): number[] {
  if (!a.every((row) => row.length === v.length)) throw new RangeError('矩阵与向量维数不匹配');
  return a.map((row) => dot(row, v));
}

export function multiply(a: Matrix, b: Matrix): Matrix {
  const columns = transpose(b);
  return a.map((row) => columns.map((column) => dot(row, column)));
}

export function compose(...matrices: Matrix[]): Matrix {
  if (!matrices.length) throw new RangeError('至少需要一个矩阵');
  return matrices.reduce(multiply, identity(matrices[0].length));
}

/** 带部分主元选择的 Gauss–Jordan 消元；适用于教材中的小型矩阵。 */
export function inverse(matrix: Matrix): Matrix {
  const n = matrix.length;
  if (!n || !matrix.every((row) => row.length === n)) throw new RangeError('逆矩阵需要方阵');
  finite(matrix.flat());
  const magnitude = Math.max(...matrix.flat().map(Math.abs));
  const a = matrix.map((row, i) => [...row, ...identity(n)[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++)
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) <= magnitude * 32 * Number.EPSILON)
      throw new RangeError('矩阵奇异或接近奇异');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    a[col] = a[col].map((x) => x / divisor);
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      a[row] = a[row].map((x, i) => x - factor * a[col][i]);
    }
  }
  return a.map((row) => row.slice(n));
}

export function determinant3(a: Matrix): number {
  if (a.length !== 3 || a.some((row) => row.length !== 3)) throw new RangeError('需要 3×3 矩阵');
  return (
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
  );
}
