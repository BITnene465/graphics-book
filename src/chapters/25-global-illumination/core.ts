import { solve } from '../../math/linear.ts';
/** F_ij 为 i 向 j 的出射比例；互易性将入射写为 Σ_j F_ij B_j。 */
export function radiosity(
  F: number[][],
  rho: number[],
  emission: number[],
  iterations?: number,
): number[] {
  const n = rho.length;
  if (
    F.length !== n ||
    emission.length !== n ||
    rho.some((x) => x < 0 || x >= 1) ||
    F.some(
      (r) => r.length !== n || r.some((x) => x < 0) || r.reduce((s, x) => s + x, 0) > 1 + 1e-10,
    )
  )
    throw new RangeError('面片系统参数无效');
  if (iterations === undefined)
    return solve(
      F.map((r, i) => r.map((f, j) => Number(i === j) - rho[i] * f)),
      emission,
    );
  let B = [...emission];
  for (let k = 0; k < iterations; k++)
    B = F.map((r, i) => emission[i] + rho[i] * r.reduce((s, f, j) => s + f * B[j], 0));
  return B;
}
/** 两个有限平行矩形的中点形状因子；投影方向和距离都进入核。 */
export function parallelFormFactor(width: number, height: number, distance: number, n = 8): number {
  let sum = 0;
  const area = width * height,
    cell = area / (n * n);
  for (let a = 0; a < n * n; a++)
    for (let b = 0; b < n * n; b++) {
      const dx = (((a % n) - (b % n)) * width) / n,
        dy = ((Math.floor(a / n) - Math.floor(b / n)) * height) / n,
        r2 = dx * dx + dy * dy + distance * distance;
      sum += ((distance * distance) / (Math.PI * r2 * r2)) * cell * cell;
    }
  return sum / area;
}
