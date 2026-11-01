/** 参考实现。建议先完成 exercises.ts，再逐步比较。 */
import type { Vec3, Vec4 } from '../../math/vector.ts';

/** 齐次光源坐标映射到左上原点 UV 和 [0,1] 深度。 */
export function lightCoordinates(clip: Vec4): Vec3 {
  if (clip[3] <= 0) throw new RangeError('w 必须为正');
  return [
    0.5 + (0.5 * clip[0]) / clip[3],
    0.5 - (0.5 * clip[1]) / clip[3],
    0.5 + (0.5 * clip[2]) / clip[3],
  ];
}
/** PCF 平均比较结果，不能先平均深度再比较。 */
export function percentageVisible(current: number, samples: number[], bias = 0): number {
  if (!samples.length) throw new RangeError('样本不能为空');
  return samples.filter((z) => current - bias <= z).length / samples.length;
}
