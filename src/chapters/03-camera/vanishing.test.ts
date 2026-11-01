import test from 'node:test';
import assert from 'node:assert/strict';
import { vanishingPoint, viewDirection } from './vanishing.ts';
import type { Vec3 } from '../../math/vector.ts';

test('一二三点透视由三组方向的有限消失点数决定', () => {
  const axes: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (const [yaw, pitch, count] of [
    [0, 0, 1],
    [35, 0, 2],
    [35, 25, 3],
  ])
    assert.equal(
      axes.map((d) => vanishingPoint(viewDirection(d, yaw, pitch))).filter(Boolean).length,
      count,
    );
  assert.equal(vanishingPoint([1, 2, 0]), null);
});
test('不同位置的平行线投影都通过同一个消失点', () => {
  const d: Vec3 = [1, 0.5, -2],
    v = vanishingPoint(d, 2)!;
  for (const p of [
    [1, 2, -6],
    [-3, -1, -5],
    [0, 1, -8],
  ]) {
    const q = p.map((x, i) => x + d[i]);
    const a = [(-2 * p[0]) / p[2], (-2 * p[1]) / p[2]],
      b = [(-2 * q[0]) / q[2], (-2 * q[1]) / q[2]];
    const cross = (b[0] - a[0]) * (v[1] - a[1]) - (b[1] - a[1]) * (v[0] - a[0]);
    assert.ok(Math.abs(cross) < 1e-12);
  }
});
