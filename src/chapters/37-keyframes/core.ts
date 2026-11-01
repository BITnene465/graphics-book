import { clamp } from '../../math/vector.ts';
// 直接复用第 02 章，保持标量在前的 [w, x, y, z] 约定。
export { slerp, rotateQuaternion } from '../02-transforms/quaternion.ts';
/** 端点速度以单位时间计；乘区间长度后才是局部 Hermite 切向。 */
export function hermiteMotion(
  p0: number,
  p1: number,
  v0: number,
  v1: number,
  t: number,
  duration: number,
): { position: number; velocity: number } {
  if (duration <= 0) throw new RangeError('时间区间长度必须为正');
  const u = clamp(t / duration),
    u2 = u * u,
    u3 = u2 * u;
  return {
    position:
      (2 * u3 - 3 * u2 + 1) * p0 +
      (u3 - 2 * u2 + u) * duration * v0 +
      (-2 * u3 + 3 * u2) * p1 +
      (u3 - u2) * duration * v1,
    velocity:
      ((6 * u2 - 6 * u) * p0 +
        (3 * u2 - 4 * u + 1) * duration * v0 +
        (-6 * u2 + 6 * u) * p1 +
        (3 * u2 - 2 * u) * duration * v1) /
      duration,
  };
}
