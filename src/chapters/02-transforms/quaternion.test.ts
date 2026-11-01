import test from 'node:test';
import assert from 'node:assert/strict';
import {
  axisAngle,
  quaternionProduct,
  rotateQuaternion,
  slerp,
  unitQuaternion,
} from './quaternion.ts';
import type { Quaternion } from './quaternion.ts';
import { rotate } from './spatial.ts';
import type { Vec3 } from '../../math/vector.ts';
const close = (a: number[], b: number[], epsilon = 1e-10) =>
  a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < epsilon, `${a} != ${b}`));

test('四元数旋转符合手算、Rodrigues 与长度不变量', () => {
  close(rotateQuaternion(axisAngle([1, 0, 0], Math.PI / 2), [0, 1, 0]), [0, 0, 1]);
  const point: Vec3 = [2, -1, 3],
    axis: Vec3 = [1, 2, -1];
  for (const angle of [-3, -0.3, 0, 1, 2.7]) {
    const q = axisAngle(axis, angle),
      actual = rotateQuaternion(q, point);
    close(actual, rotate(point, axis, angle));
    close([Math.hypot(...actual)], [Math.hypot(...point)]);
    close(actual, rotateQuaternion(q.map((x) => -x) as Quaternion, point));
  }
});
test('旋转复合顺序与列向量约定一致', () => {
  const x = axisAngle([1, 0, 0], Math.PI / 2),
    z = axisAngle([0, 0, 1], Math.PI / 2);
  close(rotateQuaternion(quaternionProduct(z, x), [0, 1, 0]), [0, 0, 1]);
  close(rotateQuaternion(quaternionProduct(x, z), [0, 1, 0]), [-1, 0, 0]);
});
test('Slerp 处理相同姿态、反号表示、短弧及等角速度', () => {
  const start: Quaternion = [1, 0, 0, 0],
    end = axisAngle([0, 0, 1], 1.5 * Math.PI);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const q = slerp(start, end, t);
    close(rotateQuaternion(q, [1, 0, 0]), [
      Math.cos((-Math.PI * t) / 2),
      Math.sin((-Math.PI * t) / 2),
      0,
    ]);
    close([Math.hypot(...q)], [1]);
    close(slerp(start, [-1, 0, 0, 0], t), start);
  }
  assert.throws(() => unitQuaternion([0, 0, 0, 0]));
  assert.throws(() => axisAngle([0, 0, 0], 1));
});
