/** 参考实现。建议先完成 exercises.ts，再逐步比较。 */
import type { Vec3 } from '../../math/vector.ts';

/** 先在顶点处除以 w，再按屏幕权重插值 NDC 深度。 */
export function pixelDepth(weights: Vec3, clipZ: Vec3, clipW: Vec3): number {
  if (clipW.some((w) => w <= 0)) throw new RangeError('应先完成齐次裁剪');
  return 0.5 + 0.5 * weights.reduce((sum, w, i) => sum + (w * clipZ[i]) / clipW[i], 0);
}
/** 严格小于；同深度先提交者保留，Infinity 表示未覆盖。 */
export function nearestFragment(depths: number[], owners: number[]): [number, number] {
  if (depths.length !== owners.length) throw new RangeError('长度不一致');
  let depth = Infinity,
    owner = -1;
  depths.forEach((z, i) => {
    if (z < depth) {
      depth = z;
      owner = owners[i];
    }
  });
  return [depth, owner];
}
