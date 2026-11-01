import { finite } from '../../math/vector.ts';
import type { Vec3 } from '../../math/vector.ts';
import { bsplineBasis, splineSize } from '../13-bezier/splines.ts';
import { deBoor } from '../13-bezier/interpolation.ts';
import type { ControlNet } from './core.ts';

export type SplinePatch = {
  control: ControlNet;
  knotsU: number[];
  knotsV: number[];
  degreeU: number;
  degreeV: number;
  weights?: number[][];
};

function homogeneous(patch: SplinePatch, u: number, v: number): number[][][] {
  const rows = splineSize(patch.knotsU, patch.degreeU, u),
    columns = splineSize(patch.knotsV, patch.degreeV, v),
    { control, weights } = patch;
  if (
    control.length !== rows ||
    control.some((row) => row.length !== columns) ||
    (weights && (weights.length !== rows || weights.some((row) => row.length !== columns)))
  )
    throw new RangeError('控制网、权重和两个方向的结点数量须一致');
  finite(control.flat(2));
  const w = weights ?? control.map((row) => row.map(() => 1));
  finite(w.flat());
  if (w.flat().some((x) => x <= 0) || control.some((row) => row.some((p) => p.length !== 3)))
    throw new RangeError('需要三维控制点与正权重');
  const largest = Math.max(...w.flat());
  return control.map((row, i) =>
    row.map((p, j) => {
      const weight = w[i][j] / largest;
      return [...p.map((x) => x * weight), weight];
    }),
  );
}
function divide(h: number[]): Vec3 {
  if (!(h[3] > 0)) throw new RangeError('有理曲面分母在数值上退化');
  const point = h.slice(0, 3).map((x) => x / h[3]) as Vec3;
  finite(point);
  return point;
}

/** 同时给出每个控制点的归一化影响；省略权重即普通 B-spline 曲面。 */
export function splineSurface(patch: SplinePatch, u: number, v: number) {
  const h = homogeneous(patch, u, v),
    bu = bsplineBasis(patch.knotsU, patch.degreeU, u),
    bv = bsplineBasis(patch.knotsV, patch.degreeV, v),
    sum = [0, 0, 0, 0];
  h.forEach((row, i) =>
    row.forEach((point, j) =>
      point.forEach((x, c) => {
        sum[c] += bu[i] * bv[j] * x;
      }),
    ),
  );
  const position = divide(sum);
  const influence = h.map((row, i) => row.map((point, j) => (bu[i] * bv[j] * point[3]) / sum[3]));
  return { position, influence };
}

/** 独立路线：在四维齐次空间先逐行 de Boor，再沿 u 求值，最后只除一次。 */
export function deBoorSurface(patch: SplinePatch, u: number, v: number): Vec3 {
  const h = homogeneous(patch, u, v);
  const rows = h.map((row) => deBoor(row, patch.knotsV, patch.degreeV, v).point);
  return divide(deBoor(rows, patch.knotsU, patch.degreeU, u).point);
}
