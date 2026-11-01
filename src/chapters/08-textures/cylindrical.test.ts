import test from 'node:test';
import assert from 'node:assert/strict';
import { cylinderPoint, cylindricalUV, projectToCylinder } from './cylindrical.ts';
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
test('圆柱参数端点、反求地址与接缝的周期一致', () => {
  for (const u of [0, 0.1, 0.25, 0.5, 0.9, 1])
    for (const v of [0, 0.3, 1]) {
      const point = cylinderPoint(2, 4, u, v),
        uv = cylindricalUV(point, 4)!;
      near(Math.hypot(point[0], point[1]), 2);
      near(point[2], 4 * v - 2);
      near(Math.min(Math.abs(uv[0] - u), Math.abs(uv[0] - u + 1)), 0);
      near(uv[1], v);
    }
});
test('径向中间面投影保持高度与方位，轴上拒绝伪造经度', () => {
  const p = projectToCylinder([3, 4, 1], 2, 4)!;
  near(p[0], 1.2);
  near(p[1], 1.6);
  near(p[2], 1);
  near(cylindricalUV([3, 4, 1], 4)![1], 0.75);
  assert.equal(cylindricalUV([0, 0, 1], 4), null);
  assert.equal(projectToCylinder([0, 0, 1], 2, 4), null);
  assert.throws(() => cylinderPoint(0, 1, 0, 0));
});
test('高度归一化不是 v/h；越界高度不被悄悄折回', () => {
  near(cylinderPoint(1, 2, 0, 1)[2], 1);
  near(cylindricalUV([1, 0, 3], 2)![1], 2);
  near(cylindricalUV([0, -2, 0], 2)![0], 0.75);
});
