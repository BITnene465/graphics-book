/** 本章编程练习。所有 TODO 都只在此文件中；教材算法已有完整实现。 */
import type { Vec3 } from '../../math/vector.ts';

/** 先在顶点处除以 w，再按屏幕权重插值 NDC 深度。 */
export function pixelDepth(weights: Vec3, clipZ: Vec3, clipW: Vec3): number {
  // TODO：按上方约定实现，并运行 npm run exercise -- 05。
  throw new Error('尚未完成 pixelDepth');
}
/** 严格小于；同深度先提交者保留，Infinity 表示未覆盖。 */
export function nearestFragment(depths: number[], owners: number[]): [number, number] {
  // TODO：按上方约定实现，并运行 npm run exercise -- 05。
  throw new Error('尚未完成 nearestFragment');
}
