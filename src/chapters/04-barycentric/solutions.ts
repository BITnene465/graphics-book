/** 参考实现。建议先完成 exercises.ts，再逐步比较。 */
import type { Vec2, Vec3 } from '../../math/vector.ts';

/** 有向面积：逆时针为正，交换两个顶点后反号。 */
export function signedArea(a: Vec2, b: Vec2, c: Vec2): number {
  return ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
}
/** 权重允许为负；退化三角形不能定义唯一重心坐标。 */
export function weights(p: Vec2, vertices: [Vec2, Vec2, Vec2]): Vec3 {
  const [a, b, c] = vertices,
    area = signedArea(a, b, c);
  if (area === 0) throw new RangeError('三角形退化');
  const w0 = signedArea(p, b, c) / area,
    w1 = signedArea(a, p, c) / area;
  return [w0, w1, 1 - w0 - w1];
}
