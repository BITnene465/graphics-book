import test from 'node:test';
import assert from 'node:assert/strict';
import { bezierJet, curveFrame, helixJet } from './curvature.ts';
import type { Vec3 } from '../../math/vector.ts';
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('Bézier 的三阶导数与 (t,t²,t³) 手算一致', () => {
  const control = [
    [0, 0, 0],
    [1 / 3, 0, 0],
    [2 / 3, 1 / 3, 0],
    [1, 1, 1],
  ];
  for (const t of [0, 0.3, 0.5, 1]) {
    const d = bezierJet(control, t);
    [d.position, d.velocity, d.acceleration, d.jerk]
      .flat()
      .forEach((v, i) => near(v, [t, t * t, t ** 3, 1, 2 * t, 3 * t * t, 0, 2, 6 * t, 0, 0, 6][i]));
  }
});

test('圆和螺线的曲率、挠率匹配解析值，非线性换参仍不变', () => {
  for (const radius of [0.4, 1, 3])
    for (const pitch of [-0.6, 0, 0.8]) {
      const d = helixJet(radius, pitch, 0.7),
        f = curveFrame(d.velocity, d.acceleration, d.jerk);
      near(f.curvature!, radius / (radius * radius + pitch * pitch));
      near(f.torsion!, pitch / (radius * radius + pitch * pitch));
      const a = 1.4,
        b = 2;
      const g = curveFrame(
        d.velocity.map((x) => a * x) as Vec3,
        d.acceleration.map((x, i) => a * a * x + b * d.velocity[i]) as Vec3,
        d.jerk.map((x, i) => a ** 3 * x + 3 * a * b * d.acceleration[i]) as Vec3,
      );
      near(g.curvature!, f.curvature!);
      near(g.torsion!, f.torsion!);
      near(Math.hypot(...f.normal!), 1);
      near(Math.hypot(...f.binormal!), 1);
    }
});

test('零速率与直线分别报告正则性和 Frenet 标架的边界', () => {
  const stopped = curveFrame([0, 0, 0], [1, 0, 0], [0, 0, 0]);
  assert.equal(stopped.regular, false);
  assert.equal(stopped.curvature, null);
  const line = curveFrame([2, 0, 0], [4, 0, 0], [6, 0, 0]);
  assert.equal(line.regular, true);
  assert.equal(line.curvature, 0);
  assert.equal(line.normal, null);
  assert.equal(line.torsion, null);
});
