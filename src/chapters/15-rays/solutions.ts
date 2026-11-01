/** 参考实现。建议先完成 exercises.ts，再逐步比较。 */
import type { Vec3 } from '../../math/vector.ts';
import { dot } from '../../math/vector.ts';

/** 同时检查两个根；方向不要求单位长度，t 也未必是距离。 */
export function closestSphereT(
  origin: Vec3,
  direction: Vec3,
  center: Vec3,
  radius: number,
  tMin = 1e-5,
  tMax = Infinity,
): number | null {
  const offset = origin.map((x, i) => x - center[i]),
    a = dot(direction, direction),
    b = 2 * dot(offset, direction),
    c = dot(offset, offset) - radius * radius;
  if (a === 0 || radius <= 0) throw new RangeError('方向和半径无效');
  const d = b * b - 4 * a * c;
  if (d < 0) return null;
  const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(d));
  const roots = q === 0 ? [-b / (2 * a)] : [q / a, c / q].sort((x, y) => x - y);
  return roots.find((t) => t >= tMin && t <= tMax) ?? null;
}
/** 输入法线为单位向量；反射保留方向向量的长度。 */
export function reflected(direction: Vec3, normal: Vec3): Vec3 {
  const projection = 2 * dot(direction, normal);
  return direction.map((x, i) => x - projection * normal[i]) as Vec3;
}
