/** 参考实现。建议先完成 exercises.ts，再逐步比较。 */
import type { Vec2, Vec3 } from '../../math/vector.ts';

/** 顶点 w 而非 1/w；分子与分母都由屏幕权重构成。 */
export function correctUV(weights: Vec3, uv: [Vec2, Vec2, Vec2], vertexW: Vec3): Vec2 {
  if (vertexW.some((w) => w <= 0)) throw new RangeError('w 必须为正');
  const q = weights.map((w, i) => w / vertexW[i]),
    sum = q.reduce((a, b) => a + b, 0);
  return [0, 1].map((c) => q.reduce((s, w, i) => s + w * uv[i][c], 0) / sum) as Vec2;
}
/** s 向右、t 向下；输入色值在线性光空间。 */
export function bilinear(c00: Vec3, c10: Vec3, c01: Vec3, c11: Vec3, s: number, t: number): Vec3 {
  return c00.map(
    (c, i) => (1 - t) * ((1 - s) * c + s * c10[i]) + t * ((1 - s) * c01[i] + s * c11[i]),
  ) as Vec3;
}
/** 两层 mip 的插值只使用 LOD 的小数部分。 */
export function lodBlend(lower: Vec3, upper: Vec3, lod: number): Vec3 {
  const t = lod - Math.floor(lod);
  return lower.map((x, i) => x * (1 - t) + upper[i] * t) as Vec3;
}
