/** 参考实现。建议先完成 exercises.ts，再逐步比较。 */
import type { Vec2 } from '../../math/vector.ts';

/** 按行排列的归一化像素中心；第 0 行在图像顶部。 */
export function centers(width: number, height: number): Vec2[] {
  if (![width, height].every((x) => Number.isInteger(x) && x > 0))
    throw new RangeError('尺寸必须为正整数');
  return Array.from({ length: width * height }, (_, i) => [
    ((i % width) + 0.5) / width,
    1 - (Math.floor(i / width) + 0.5) / height,
  ]);
}
/** 在线性光空间混合黑白，再编码为 sRGB。 */
export function mixBlackWhite(t: number): number {
  if (t < 0 || t > 1 || !Number.isFinite(t)) throw new RangeError('权重应位于 [0,1]');
  return t <= 0.0031308 ? 12.92 * t : 1.055 * t ** (1 / 2.4) - 0.055;
}
