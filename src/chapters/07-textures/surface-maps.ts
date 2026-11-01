import { cross, dot, finite, sub, scale } from '../../math/vector.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { matVec, transpose, multiply, determinant3 } from '../../math/matrix.ts';
import type { Matrix } from '../../math/matrix.ts';
import { unit } from '../02-transforms/spatial.ts';

export const LENGTHS: Vec2 = [2.4, 1.8];
export function heightField(uv: Vec2, amplitude = 0.25, frequency = 1.5, offset = 0) {
  finite([...uv, amplitude, frequency, offset]);
  if (frequency < 0) throw new RangeError('频率不能为负');
  const w = 2 * Math.PI * frequency,
    u = uv[0] * w,
    v = uv[1] * w,
    k = amplitude * w;
  return {
    height: offset + amplitude * Math.cos(u) * Math.cos(v),
    du: -k * Math.sin(u) * Math.cos(v),
    dv: -k * Math.cos(u) * Math.sin(v),
  };
}
export function tangentFrame(dpdu: Vec3, dpdv: Vec3): Matrix {
  const t = unit(dpdu),
    v = unit(dpdv),
    crossed = cross(t, v);
  if (Math.hypot(...crossed) < 1e-12) throw new RangeError('退化参数化不能定义切线框架');
  const n = unit(crossed),
    b = unit(sub(v, scale(t, dot(t, v))) as Vec3);
  return transpose([t, b, n]);
}
export const heightNormal = (du: number, dv: number): Vec3 =>
  unit([-du / LENGTHS[0], -dv / LENGTHS[1], 1]);
export function decodeNormal(encoded: Vec3, frame?: Matrix): Vec3 {
  finite(encoded);
  if (encoded.some((x) => x < 0 || x > 1)) throw new RangeError('法线数据须在 [0,1]');
  const n = unit(encoded.map((x) => 2 * x - 1) as Vec3);
  if (!frame) return n;
  if (frame.length !== 3 || frame.some((r) => r.length !== 3))
    throw new RangeError('需要 3×3 切线框架');
  const gram = multiply(transpose(frame), frame);
  if (
    gram.some((r, i) => r.some((x, j) => Math.abs(x - Number(i === j)) > 1e-10)) ||
    determinant3(frame) < 0
  )
    throw new RangeError('切线框架必须是右手正交矩阵');
  return matVec(frame, n) as Vec3;
}
export function surfaceSample(uv: Vec2, amplitude = 0.25, frequency = 1.5, offset = 0) {
  const field = heightField(uv, amplitude, frequency, offset),
    normal = heightNormal(field.du, field.dv);
  return { ...field, normal, encoded: normal.map((x) => (x + 1) / 2) as Vec3 };
}
export function gridMesh(divisions: number, height?: (uv: Vec2) => number) {
  if (!Number.isInteger(divisions) || divisions < 1 || divisions > 256)
    throw new RangeError('分段须为 1 至 256');
  const vertices: Vec3[] = [],
    uv: Vec2[] = [],
    faces: Vec3[] = [];
  for (let y = 0; y <= divisions; y++)
    for (let x = 0; x <= divisions; x++) {
      const at: Vec2 = [x / divisions, y / divisions];
      uv.push(at);
      vertices.push([(at[0] - 0.5) * LENGTHS[0], (at[1] - 0.5) * LENGTHS[1], height?.(at) ?? 0]);
      if (x < divisions && y < divisions) {
        const i = y * (divisions + 1) + x;
        faces.push([i, i + 1, i + divisions + 2], [i, i + divisions + 2, i + divisions + 1]);
      }
    }
  return { vertices, faces, uv };
}
