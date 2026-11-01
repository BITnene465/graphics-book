/** 二维仿射变换：列向量，矩阵在左，正角度逆时针。 */
import { compose as composeMatrices, inverse as invert, matVec } from '../../math/matrix.ts';
import type { Matrix } from '../../math/matrix.ts';
import { finite } from '../../math/vector.ts';
import type { Vec2 } from '../../math/vector.ts';

export const translation = (tx: number, ty: number): Matrix => [
  [1, 0, tx],
  [0, 1, ty],
  [0, 0, 1],
];
export const scaling = (sx: number, sy: number): Matrix => [
  [sx, 0, 0],
  [0, sy, 0],
  [0, 0, 1],
];
export function rotation(angle: number): Matrix {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
}
export const compose = (...matrices: Matrix[]): Matrix =>
  matrices.length
    ? composeMatrices(...matrices)
    : [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];

export function apply(matrix: Matrix, coordinates: Vec2[], vector = false): Vec2[] {
  if (
    matrix.length !== 3 ||
    matrix.some((row) => row.length !== 3) ||
    matrix[2].some((x, i) => x !== Number(i === 2))
  ) {
    throw new RangeError('需要最后一行为 [0,0,1] 的 3×3 仿射矩阵');
  }
  finite(matrix.flat());
  finite(coordinates.flat());
  return coordinates.map((p) => matVec(matrix, [...p, vector ? 0 : 1]).slice(0, 2) as Vec2);
}

export function inverse(matrix: Matrix): Matrix {
  apply(matrix, [[0, 0]]);
  // 只检查线性部分，平移大小不影响仿射变换是否可逆。
  const a = invert(matrix.slice(0, 2).map((row) => row.slice(0, 2)));
  const offset = matVec(a, [matrix[0][2], matrix[1][2]]);
  return [
    [...a[0], -offset[0]],
    [...a[1], -offset[1]],
    [0, 0, 1],
  ];
}
