/** 参考实现。建议先完成 exercises.ts，再逐步比较。 */
import type { Vec3 } from '../../math/vector.ts';
import { dot, normalize } from '../../math/vector.ts';
import { inverse, matVec, transpose } from '../../math/matrix.ts';
/** Lambert 项；输入和输出都是线性 RGB。 */
export function lambert(normal: Vec3, light: Vec3, color: Vec3, intensity = 1): Vec3 {
  const cosine = Math.max(0, dot(normalize(normal), normalize(light)));
  return color.map((c) => c * intensity * cosine) as Vec3;
}
/** 法线使用逆转置；非均匀缩放下不能当作切向量变换。 */
export function transformedNormal(linear: number[][], normal: Vec3): Vec3 {
  return normalize(matVec(transpose(inverse(linear)), normal)) as Vec3;
}
/** Gouraud：插值已经求得的三个顶点颜色。 */
export function gouraudColor(weights: Vec3, colors: [Vec3, Vec3, Vec3]): Vec3 {
  return [0, 1, 2].map((c) => weights.reduce((s, w, i) => s + w * colors[i][c], 0)) as Vec3;
}
/** Phong：插值法线后重新归一化，再交给光照函数。 */
export function phongNormal(weights: Vec3, normals: [Vec3, Vec3, Vec3]): Vec3 {
  return normalize(gouraudColor(weights, normals)) as Vec3;
}
