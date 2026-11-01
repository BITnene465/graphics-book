import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barycentric, interpolate, isInside } from './core.ts';
import type { Triangle2 } from './core.ts';
import { clipPolygon, rasterizeTriangle, triangleCoverage } from './raster.ts';
import type { Vec2 } from '../../math/vector.ts';

test('顶点、重心和外部点的权重', () => {
  const t: Triangle2 = [
    [0, 0],
    [3, 0],
    [0, 3],
  ];
  assert.deepEqual(barycentric([0, 0], t), [1, 0, 0]);
  const center = barycentric([1, 1], t);
  center.forEach((w) => assert.ok(Math.abs(w - 1 / 3) < 1e-12));
  assert.equal(isInside(barycentric([4, 4], t)), false);
  assert.ok(barycentric([4, 4], t)[0] < 0);
});
test('权重在尺度变化和反向绕序下仍重建原点', () => {
  for (const s of [1e-10, 1, 1e10]) {
    const t: Triangle2 = [
        [0, 0],
        [0, 3 * s],
        [3 * s, 0],
      ],
      p: Vec2 = [s, s];
    interpolate(barycentric(p, t), t).forEach((x, i) =>
      assert.ok(Math.abs(x - p[i]) <= Math.abs(s) * 1e-12),
    );
  }
});
test('退化三角形拒绝伪权重', () => {
  assert.throws(() =>
    barycentric(
      [0, 0],
      [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
    ),
  );
});
test('共享边 top-left 规则恰好覆盖一次，无缝拼成方形', () => {
  const owners = new Uint8Array(64);
  const triangles: Triangle2[] = [
    [
      [0, 0],
      [8, 0],
      [8, 8],
    ],
    [
      [0, 0],
      [8, 8],
      [0, 8],
    ],
  ];
  for (const t of triangles) rasterizeTriangle(t, 8, 8, (f) => owners[f.row * 8 + f.col]++);
  assert.ok(owners.every((n) => n === 1));
});
test('绕序反转保持覆盖与权重的顶点对应', () => {
  const t: Triangle2 = [
      [0, 0],
      [4, 0],
      [0, 4],
    ],
    points: Vec2[] = [
      [0.5, 0.5],
      [1.5, 1.5],
      [3.5, 3.5],
    ];
  const a = triangleCoverage(t, points),
    b = triangleCoverage([t[0], t[2], t[1]], points);
  assert.deepEqual(a.covered, b.covered);
  a.weights.forEach((w, i) =>
    assert.deepEqual(w, [b.weights[i][0], b.weights[i][2], b.weights[i][1]]),
  );
});
test('裁剪生成新的交点并同步插值属性', () => {
  const p = clipPolygon(
    [
      [-2, 0, 0, 1],
      [0, -1, 0, 1],
      [0, 1, 0, 1],
    ],
    [[0], [1], [1]],
  );
  assert.equal(p.vertices.length, 4);
  p.vertices.forEach((v, i) => {
    assert.ok(v[0] >= -v[3]);
    if (v[0] === -1) assert.equal(p.attributes[i][0], 0.5);
  });
});
test('相反方向遍历同一被裁边得到相同交点', () => {
  const a = clipPolygon([
    [-2, 0.2, 0, 1],
    [0.3, 1, 0, 1],
    [0.2, -1, 0, 1],
  ]);
  const b = clipPolygon([
    [0.2, -1, 0, 1],
    [0.3, 1, 0, 1],
    [-2, 0.2, 0, 1],
  ]);
  assert.deepEqual(
    a.vertices.map((v) => JSON.stringify(v)).sort(),
    b.vertices.map((v) => JSON.stringify(v)).sort(),
  );
});
