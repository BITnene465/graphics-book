/** 本章编程练习。所有 TODO 都只在此文件中；教材算法已有完整实现。 */
import type { Vec2, Vec3 } from '../../math/vector.ts';

/** 顶点 w 而非 1/w；分子与分母都由屏幕权重构成。 */
export function correctUV(weights: Vec3, uv: [Vec2, Vec2, Vec2], vertexW: Vec3): Vec2 {
  // TODO：按上方约定实现，并运行 npm run exercise -- 07。
  throw new Error('尚未完成 correctUV');
}
/** s 向右、t 向下；输入色值在线性光空间。 */
export function bilinear(c00: Vec3, c10: Vec3, c01: Vec3, c11: Vec3, s: number, t: number): Vec3 {
  // TODO：按上方约定实现，并运行 npm run exercise -- 07。
  throw new Error('尚未完成 bilinear');
}
/** 两层 mip 的插值只使用 LOD 的小数部分。 */
export function lodBlend(lower: Vec3, upper: Vec3, lod: number): Vec3 {
  // TODO：按上方约定实现，并运行 npm run exercise -- 07。
  throw new Error('尚未完成 lodBlend');
}
