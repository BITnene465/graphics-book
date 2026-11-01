/** 参考实现。建议先完成 exercises.ts，再逐步比较。 */
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { normalize } from '../../math/vector.ts';

/** 球面方向映射；u=0 指向 +X，朝 +Z 增加，v 从 +Y 极点向下。 */
export function directionUV(direction: Vec3): Vec2 {
  const n = normalize(direction),
    longitude = Math.atan2(n[2], n[0]) / (2 * Math.PI),
    u = n[0] === 0 && n[2] === 0 ? 0 : ((longitude % 1) + 1) % 1;
  return [u, Math.acos(Math.max(-1, Math.min(1, n[1]))) / Math.PI];
}
/** gain^k 加权并归一化，恒定输入仍为恒定输出。 */
export function octaveAverage(values: number[], gain: number): number {
  if (!values.length || gain < 0) throw new RangeError('需要非空样本和非负 gain');
  let sum = 0,
    weight = 0,
    amplitude = 1;
  for (const value of values) {
    sum += amplitude * value;
    weight += amplitude;
    amplitude *= gain;
  }
  return sum / weight;
}
