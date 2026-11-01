/** 参考实现。建议先完成 exercises.ts，再逐步比较。 */
import type { Vec2, Vec3, Vec4 } from '../../math/vector.ts';
import { dot } from '../../math/vector.ts';

/** 相机看向 -Z；FOV 为度，aspect = 宽/高。 */
export function projectXY(point: Vec3, fovDegrees: number, aspect: number): Vec2 {
  if (point[2] >= 0 || !(fovDegrees > 0 && fovDegrees < 180) || aspect <= 0)
    throw new RangeError('无效投影输入');
  const s = 1 / Math.tan((fovDegrees * Math.PI) / 360);
  return [(point[0] * s) / (-point[2] * aspect), (point[1] * s) / -point[2]];
}
/** 保留 dot(plane,p)>=0 的部分；整段在外时返回 null。 */
export function clipOnePlane(start: Vec4, end: Vec4, plane: Vec4): [Vec4, Vec4] | null {
  const a = dot(start, plane),
    b = dot(end, plane);
  if (a < 0 && b < 0) return null;
  if (a >= 0 && b >= 0) return [[...start], [...end]];
  const t = a / (a - b),
    p = start.map((x, i) => x + t * (end[i] - x)) as Vec4;
  return a < 0 ? [p, [...end]] : [[...start], p];
}
