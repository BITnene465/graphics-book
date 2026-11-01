import test from 'node:test';
import assert from 'node:assert/strict';
import { dot, cross } from '../../math/vector.ts';
import type { Vec3 } from '../../math/vector.ts';
import { matVec, determinant3 } from '../../math/matrix.ts';
import { unit, rotate, rotationMatrix } from './spatial.ts';
import { planeReflection, shearMatrix, transformPoints } from './linear3d.ts';
import { basisDiagnostics, worldToLocal, localToWorld, twoLinkFK } from './hierarchy.ts';
const close = (a: number, b: number, t = 1e-10) => assert.ok(Math.abs(a - b) < t, `${a} ≠ ${b}`);
test('归一化在极小与极大尺度上给出相同方向', () => {
  for (const s of [1e-250, 1, 1e250]) {
    const n = unit([s, 2 * s, 3 * s]);
    close(Math.hypot(...n), 1);
    close(n[1] / n[0], 2);
  }
});
test('Rodrigues 保持轴向投影、长度与右手方向', () => {
  const axis: Vec3 = [1, 2, 3],
    v: Vec3 = [3, -1, 2],
    r = rotate(v, axis, 0.7);
  close(dot(r, unit(axis)), dot(v, unit(axis)));
  close(Math.hypot(...r), Math.hypot(...v));
  rotate([1, 0, 0], [0, 0, 1], Math.PI / 2).forEach((x, i) => close(x, [0, 1, 0][i]));
  matVec(rotationMatrix(axis, 0.7), v).forEach((x, i) => close(x, r[i]));
});
test('平面镜像固定平面上的点，镜像两次恢复原点', () => {
  const m = planeReflection([0, 1, 0], 2),
    points: Vec3[] = [
      [1, 2, 3],
      [1, 5, 3],
    ];
  assert.deepEqual(transformPoints(m, points), [
    [1, 2, 3],
    [1, -1, 3],
  ]);
  assert.deepEqual(transformPoints(m, transformPoints(m, points)), points);
  close(determinant3(m.slice(0, 3).map((r) => r.slice(0, 3))), -1);
  close(
    determinant3(
      shearMatrix(4)
        .slice(0, 3)
        .map((r) => r.slice(0, 3)),
    ),
    1,
  );
});
test('非正交变基不能用转置，病态判定与共同缩放无关', () => {
  const b = [
      [1, 1, 0],
      [0, 2, 0],
      [0, 0, 3],
    ],
    p: Vec3 = [0.3, 0.7, -1],
    o: Vec3 = [2, 3, 4];
  worldToLocal(b, localToWorld(b, p, o), o).forEach((x, i) => close(x, p[i]));
  for (const scale of [1e-200, 1, 1e200]) {
    assert.equal(
      basisDiagnostics(
        [
          [1, 0, 0],
          [0, 1e-8, 0],
          [0, 0, 1],
        ].map((r) => r.map((x) => x * scale)),
      ).state,
      'near_singular',
    );
    assert.equal(basisDiagnostics(b.map((r) => r.map((x) => x * scale))).state, 'regular');
  }
  assert.equal(
    basisDiagnostics([
      [1, 1, 0],
      [0, 0, 0],
      [0, 0, 1],
    ]).state,
    'singular',
  );
});
test('两连杆子变换沿父坐标轴平移', () => {
  const f = twoLinkFK([0, 0], Math.PI / 2, -Math.PI / 2, 2, 1);
  f.joints[2].forEach((x, i) => close(x, [1, 2][i]));
  close(Math.hypot(...cross([1, 0, 0], [0, 2, 0])), 2);
});
