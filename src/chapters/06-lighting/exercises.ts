/** 本章编程练习。所有 TODO 都只在此文件中；教材算法已有完整实现。 */
import type { Vec3 } from '../../math/vector.ts';

/** Lambert 项；输入和输出都是线性 RGB。 */
export function lambert(normal: Vec3, light: Vec3, color: Vec3, intensity = 1): Vec3 {
  // TODO：按上方约定实现，并运行 npm run exercise -- 06。
  throw new Error('尚未完成 lambert');
}
/** 法线使用逆转置；非均匀缩放下不能当作切向量变换。 */
export function transformedNormal(linear: number[][], normal: Vec3): Vec3 {
  // TODO：按上方约定实现，并运行 npm run exercise -- 06。
  throw new Error('尚未完成 transformedNormal');
}
/** Gouraud：插值已经求得的三个顶点颜色。 */
export function gouraudColor(weights: Vec3, colors: [Vec3, Vec3, Vec3]): Vec3 {
  // TODO：按上方约定实现，并运行 npm run exercise -- 06。
  throw new Error('尚未完成 gouraudColor');
}
/** Phong：插值法线后重新归一化，再交给光照函数。 */
export function phongNormal(weights: Vec3, normals: [Vec3, Vec3, Vec3]): Vec3 {
  // TODO：按上方约定实现，并运行 npm run exercise -- 06。
  throw new Error('尚未完成 phongNormal');
}
