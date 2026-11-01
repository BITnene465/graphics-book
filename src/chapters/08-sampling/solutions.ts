/** 参考实现。建议先完成 exercises.ts，再逐步比较。 */
import type { Vec3 } from '../../math/vector.ts';

/** 盒式重建：所有样本同权；空集没有平均值。 */
export function boxAverage(samples: Vec3[]): Vec3 {
  if (!samples.length) throw new RangeError('样本不能为空');
  return [0, 1, 2].map((c) => samples.reduce((s, v) => s + v[c], 0) / samples.length) as Vec3;
}
/** 折叠到 [-fs/2,fs/2)，保留方向信息。 */
export function equivalentFrequency(f: number, fs: number): number {
  if (!(fs > 0)) throw new RangeError('采样频率必须为正');
  return ((((f + fs / 2) % fs) + fs) % fs) - fs / 2;
}
