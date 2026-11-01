/** 本章编程练习。所有 TODO 都只在此文件中；教材算法已有完整实现。 */
import type { Vec2, Vec3, Vec4 } from '../../math/vector.ts';

/** 相机看向 -Z；FOV 为度，aspect = 宽/高。 */
export function projectXY(point: Vec3, fovDegrees: number, aspect: number): Vec2 {
  // TODO：按上方约定实现，并运行 npm run exercise -- 03。
  throw new Error('尚未完成 projectXY');
}
/** 保留 dot(plane,p)>=0 的部分；整段在外时返回 null。 */
export function clipOnePlane(start: Vec4, end: Vec4, plane: Vec4): [Vec4, Vec4] | null {
  // TODO：按上方约定实现，并运行 npm run exercise -- 03。
  throw new Error('尚未完成 clipOnePlane');
}
