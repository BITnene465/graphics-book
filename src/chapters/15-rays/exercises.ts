/** 本章编程练习。所有 TODO 都只在此文件中；教材算法已有完整实现。 */
import type { Vec3 } from '../../math/vector.ts';

/** 同时检查两个根；方向不要求单位长度，t 也未必是距离。 */
export function closestSphereT(
  origin: Vec3,
  direction: Vec3,
  center: Vec3,
  radius: number,
  tMin = 1e-5,
  tMax = Infinity,
): number | null {
  // TODO：按上方约定实现，并运行 npm run exercise -- 12。
  throw new Error('尚未完成 closestSphereT');
}
/** 输入法线为单位向量；反射保留方向向量的长度。 */
export function reflected(direction: Vec3, normal: Vec3): Vec3 {
  // TODO：按上方约定实现，并运行 npm run exercise -- 12。
  throw new Error('尚未完成 reflected');
}
