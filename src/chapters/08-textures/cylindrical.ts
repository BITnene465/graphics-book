import { finite } from '../../math/vector.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';

/** z 为柱轴，底端 -h/2，顶端 h/2；u=0 与 u=1 是同一条接缝。 */
export function cylinderPoint(radius: number, height: number, u: number, v: number): Vec3 {
  finite([radius, height, u, v]);
  if (radius <= 0 || height <= 0) throw new RangeError('半径与高度须为正');
  return [
    radius * Math.cos(2 * Math.PI * u),
    radius * Math.sin(2 * Math.PI * u),
    height * (v - 0.5),
  ];
}

/** 反求方位与高度；离轴半径不影响地址，轴上的方位没有定义。 */
export function cylindricalUV(point: Vec3, height: number): Vec2 | null {
  finite([...point, height]);
  if (height <= 0) throw new RangeError('高度须为正');
  if (point[0] === 0 && point[1] === 0) return null;
  const turns = Math.atan2(point[1], point[0]) / (2 * Math.PI);
  return [((turns % 1) + 1) % 1, point[2] / height + 0.5];
}

/** 同高度的径向中间面投影；没有自动解开任意模型的 UV。 */
export function projectToCylinder(point: Vec3, radius: number, height: number): Vec3 | null {
  const uv = cylindricalUV(point, height);
  if (!(radius > 0 && Number.isFinite(radius))) throw new RangeError('半径须为正');
  return uv ? cylinderPoint(radius, height, ...uv) : null;
}
