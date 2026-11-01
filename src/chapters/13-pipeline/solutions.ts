/** 参考实现。建议先完成 exercises.ts，再逐步比较。 */
import type { Vec3 } from '../../math/vector.ts';

/** 普通顶点属性的透视正确恢复；invW 在顶点处给定。 */
export function recoverAttribute(screenWeights: Vec3, values: number[][], invW: Vec3): number[] {
  const weighted = screenWeights.map((w, i) => w * invW[i]),
    sum = weighted.reduce((a, b) => a + b, 0);
  if (sum === 0) throw new RangeError('透视恢复分母为零');
  return values[0].map((_, c) => weighted.reduce((s, w, i) => s + w * values[i][c], 0) / sum);
}
/** 不透明目标上的 source-over；输入色值在线性光空间。 */
export function blendLinear(source: Vec3, destination: Vec3, alpha: number): Vec3 {
  return source.map((s, i) => alpha * s + (1 - alpha) * destination[i]) as Vec3;
}
