/** 参考实现。建议先完成 exercises.ts，再逐步比较。 */
import type { Vec3 } from '../../math/vector.ts';
import { normalize } from '../../math/vector.ts';

/** u 为经度、v 为从 +Z 量起的极角，均用弧度。 */
export function ellipsoidPoint(u: number, v: number, axes: Vec3): Vec3 {
  if (axes.some((a) => a <= 0)) throw new RangeError('半轴必须为正');
  return [
    axes[0] * Math.sin(v) * Math.cos(u),
    axes[1] * Math.sin(v) * Math.sin(u),
    axes[2] * Math.cos(v),
  ];
}
/** 隐函数梯度决定法线；椭球的径向通常不是法向。 */
export function ellipsoidNormal(point: Vec3, axes: Vec3): Vec3 {
  if (axes.some((a) => a <= 0)) throw new RangeError('半轴必须为正');
  return normalize(point.map((p, i) => p / axes[i] ** 2)) as Vec3;
}
