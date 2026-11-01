/** 世界单位为米，焦距与像高为毫米；画幅高 24 mm，宽高比 1.8。 */
import { finite } from '../../math/vector.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';

export function framing(distance = 6, focal = 38, gap = 8, compensate = true) {
  finite([distance, focal, gap]);
  if (distance <= 0 || focal <= 0 || gap < 0)
    throw new RangeError('距离、焦距须为正数，间隔不能为负');
  if (compensate) focal = (38 * distance) / 6;
  const front = (focal * 2.2) / distance;
  const back = (focal * 2.2) / (distance + gap);
  return { focal, front, back, ratio: back / front };
}

/** 固定朝向 -Z、眼高 1.1 m 的针孔投影；以画幅高度为 1。 */
export function project(points: Vec3[], distance: number, focal: number): Vec2[] {
  finite([distance, focal, ...points.flat()]);
  if (distance <= 0 || focal <= 0 || points.some((p) => p[2] >= distance))
    throw new RangeError('此简化模型要求正距离、正焦距和正深度');
  return points.map(([x, y, z]) => [
    (x * focal) / 24 / (distance - z),
    ((y - 1.1) * focal) / 24 / (distance - z),
  ]);
}
