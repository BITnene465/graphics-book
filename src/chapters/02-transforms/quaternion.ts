import { finite, dot, radians } from '../../math/vector.ts';
import type { Vec3 } from '../../math/vector.ts';
import { unit } from './spatial.ts';

/** 标量在前：[w, x, y, z]；角度输入用弧度。 */
export type Quaternion = [number, number, number, number];

export function unitQuaternion(q: Quaternion): Quaternion {
  finite(q);
  const largest = Math.max(...q.map(Math.abs));
  if (largest === 0) throw new RangeError('零四元数不能表示旋转');
  const scaled = q.map((x) => x / largest),
    length = Math.hypot(...scaled);
  return scaled.map((x) => x / length) as Quaternion;
}

export function axisAngle(axis: Vec3, angle: number): Quaternion {
  finite([angle]);
  const n = unit(axis),
    s = Math.sin(angle / 2);
  return [Math.cos(angle / 2), n[0] * s, n[1] * s, n[2] * s];
}

/** Hamilton 乘积；先旋转 b 再旋转 a，对应 a*b。 */
export function quaternionProduct(a: Quaternion, b: Quaternion): Quaternion {
  finite([...a, ...b]);
  const [w, x, y, z] = a,
    [v, i, j, k] = b;
  return [
    w * v - x * i - y * j - z * k,
    w * i + x * v + y * k - z * j,
    w * j - x * k + y * v + z * i,
    w * k + x * j - y * i + z * v,
  ];
}

export function rotateQuaternion(q: Quaternion, point: Vec3): Vec3 {
  const [w, x, y, z] = unitQuaternion(q);
  return quaternionProduct(quaternionProduct([w, x, y, z], [0, ...point]), [w, -x, -y, -z]).slice(
    1,
  ) as Vec3;
}

/** 在单位四维球上走短弧；q 与 -q 表示同一个三维旋转。 */
export function slerp(a: Quaternion, b: Quaternion, t: number): Quaternion {
  finite([t]);
  if (t < 0 || t > 1) throw new RangeError('插值参数须在 [0,1] 内');
  const start = unitQuaternion(a);
  let end = unitQuaternion(b),
    cosine = dot(start, end);
  if (cosine < 0) {
    end = end.map((x) => -x) as Quaternion;
    cosine = -cosine;
  }
  // 极小夹角时避免除以接近零的 sin(phi)。
  if (cosine > 0.9995)
    return unitQuaternion(start.map((x, i) => (1 - t) * x + t * end[i]) as Quaternion);
  const phi = Math.acos(Math.min(1, cosine)),
    denominator = Math.sin(phi);
  return unitQuaternion(
    start.map(
      (x, i) => (Math.sin((1 - t) * phi) * x + Math.sin(t * phi) * end[i]) / denominator,
    ) as Quaternion,
  );
}

/** 便于和本章的 Rz Ry Rx 欧拉顺序核对；三个输入均为角度。 */
export function eulerQuaternion(x: number, y: number, z: number): Quaternion {
  return quaternionProduct(
    axisAngle([0, 0, 1], radians(z)),
    quaternionProduct(axisAngle([0, 1, 0], radians(y)), axisAngle([1, 0, 0], radians(x))),
  );
}
