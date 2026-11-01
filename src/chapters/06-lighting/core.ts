import { dot, sub, finite } from '../../math/vector.ts';
import type { Vec3 } from '../../math/vector.ts';
import { inverse, transpose, matVec } from '../../math/matrix.ts';
import type { Matrix } from '../../math/matrix.ts';
import { unit } from '../02-transforms/spatial.ts';

export function normalize(v: Vec3): Vec3 {
  finite(v);
  return v.every((x) => x === 0) ? [0, 0, 0] : unit(v);
}
export function transformNormals(normals: Vec3[], linear: Matrix, correct = true): Vec3[] {
  if (linear.length !== 3 || linear.some((r) => r.length !== 3))
    throw new RangeError('需要 3×3 线性变换');
  const inv = inverse(linear),
    matrix = correct ? transpose(inv) : linear;
  return normals.map((n) => normalize(matVec(matrix, n) as Vec3));
}
export function lightAt(point: Vec3, light: Vec3, pointLight = false, power = 1) {
  finite([...point, ...light, power]);
  if (power < 0) throw new RangeError('光强不能为负');
  const delta = (pointLight ? sub(light, point) : light) as Vec3,
    r2 = dot(delta, delta);
  if (r2 === 0) throw new RangeError('光方向未定义');
  return { direction: unit(delta), irradiance: pointLight ? power / r2 : power };
}
export type Material = {
  kd?: Vec3;
  ks?: number;
  exponent?: number;
  ambient?: number;
  irradiance?: number;
};
/** 经验 Blinn–Phong 模型，在世界空间与线性 RGB 中计算。 */
export function shade(
  normal: Vec3,
  light: Vec3,
  view: Vec3,
  {
    kd = [0.12, 0.46, 0.27],
    ks = 0.3,
    exponent = 32,
    ambient = 0.025,
    irradiance = 1,
  }: Material = {},
) {
  finite([...kd, ks, exponent, ambient, irradiance]);
  if (Math.min(...kd, ks, ambient, irradiance) < 0 || exponent < 1)
    throw new RangeError('系数非负，高光指数至少为 1');
  const n = normalize(normal),
    l = normalize(light),
    v = normalize(view),
    h = normalize(l.map((x, i) => x + v[i]) as Vec3);
  const cosine = Math.max(0, dot(n, l)),
    visible = dot(n, v) > 0;
  const diffuse = kd.map((x) => x * irradiance * cosine * Number(visible)) as Vec3;
  const specular = Array(3).fill(
    irradiance * ks * Math.max(0, dot(n, h)) ** exponent * Number(cosine > 0 && visible),
  ) as Vec3;
  const constant = kd.map((x) => x * ambient) as Vec3;
  return {
    diffuse,
    specular,
    ambient: constant,
    total: constant.map((x, i) => x + diffuse[i] + specular[i]) as Vec3,
  };
}
export function ellipsoidSurface(
  size = 160,
  axes: Vec3 = [1, 1, 1],
  extent = 1.9,
  center: Vec3 = [0, 0, 0],
) {
  finite([...axes, ...center, extent]);
  if (axes.some((a) => a <= 0) || extent <= 0 || !Number.isInteger(size) || size < 2 || size > 4096)
    throw new RangeError('非法曲面采样范围');
  const points: Vec3[] = [],
    normals: Vec3[] = [],
    mask: boolean[] = [];
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++) {
      const x = (((col + 0.5) / size) * 2 - 1) * extent - center[0],
        y = (1 - ((row + 0.5) / size) * 2) * extent - center[1],
        r2 = (x / axes[0]) ** 2 + (y / axes[1]) ** 2;
      const local: Vec3 = [x / axes[0], y / axes[1], Math.sqrt(Math.max(0, 1 - r2))];
      mask.push(r2 <= 1);
      normals.push(local);
      points.push(local.map((x, i) => x * axes[i] + center[i]) as Vec3);
    }
  return { points, normals, mask };
}
