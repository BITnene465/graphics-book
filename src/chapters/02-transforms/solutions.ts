/** 参考实现。建议先完成 exercises.ts，再逐步比较。 */
import type { Vec2 } from '../../math/vector.ts';

import { inverse, matVec } from '../../math/matrix.ts';
/** 先平移到中心，再旋转，最后移回；角度使用弧度。 */
export function rotateAbout(point: Vec2, center: Vec2, angle: number): Vec2 {
  const x = point[0] - center[0],
    y = point[1] - center[1],
    c = Math.cos(angle),
    s = Math.sin(angle);
  return [center[0] + c * x - s * y, center[1] + s * x + c * y];
}
/** 使用逆矩阵恢复仿射变换前的点；奇异矩阵必须明确失败。 */
export function recoverPoint(matrix: number[][], transformed: Vec2): Vec2 {
  const p = matVec(inverse(matrix), [...transformed, 1]);
  return [p[0] / p[2], p[1] / p[2]];
}
