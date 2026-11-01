import { solve } from '../../math/linear.ts';
export const measure = (A: number[][], x: number[]) =>
  A.map((r) => r.reduce((s, a, j) => s + a * x[j], 0));
/** 岭正则化逆问题：测量误差与解的能量之间的权衡。 */
export function regularizedInverse(A: number[][], y: number[], lambda: number): number[] {
  if (lambda <= 0 || A.length !== y.length) throw new RangeError('正则强度为正，测量尺寸匹配');
  const n = A[0].length,
    normal = Array.from({ length: n }, (_, i) =>
      Array.from(
        { length: n },
        (_, j) => A.reduce((s, r) => s + r[i] * r[j], 0) + Number(i === j) * lambda,
      ),
    );
  const rhs = Array.from({ length: n }, (_, i) => A.reduce((s, r, k) => s + r[i] * y[k], 0));
  return solve(normal, rhs);
}
export function blurMatrix(n: number, kernel: number[]): number[][] {
  const sum = kernel.reduce((a, b) => a + b, 0);
  return Array.from({ length: n }, (_, i) => {
    const r = Array(n).fill(0);
    kernel.forEach((w, k) => {
      r[(i + k - Math.floor(kernel.length / 2) + n) % n] += w / sum;
    });
    return r;
  });
}
/** 二平面光场的一维截面：angle 为子视点索引，shift 为像素/视点。 */
export function refocus(views: number[][], shift: number): number[] {
  const n = views[0].length,
    center = (views.length - 1) / 2;
  return Array.from(
    { length: n },
    (_, x) =>
      views.reduce((s, row, a) => {
        const p = x + shift * (a - center),
          i = Math.floor(p),
          t = p - i,
          at = (k: number) => (k >= 0 && k < n ? row[k] : 0);
        return s + (1 - t) * at(i) + t * at(i + 1);
      }, 0) / views.length,
  );
}
