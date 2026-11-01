import test from 'node:test';
import assert from 'node:assert/strict';
import type { Vec2 } from '../../math/vector.ts';
import { lineSteps, circleSteps, symmetricPoints } from './incremental.ts';
import { scanlineFill, scanlineSpans } from './scanline.ts';
import { triangleCoverage } from './raster.ts';

test('增量线覆盖八象限、零长度、两端与最近格点误差', () => {
  for (let x = -8; x <= 8; x++)
    for (let y = -8; y <= 8; y++) {
      const path = lineSteps([0, 0], [x, y]).map((s) => s.point);
      assert.deepEqual(path[0], [0, 0]);
      assert.deepEqual(path.at(-1), [x, y]);
      assert.equal(path.length, Math.max(Math.abs(x), Math.abs(y)) + 1);
      assert.equal(new Set(path.map((p) => p.join(','))).size, path.length);
      path.forEach(([a, b], i) => {
        if (i)
          assert.equal(Math.max(Math.abs(a - path[i - 1][0]), Math.abs(b - path[i - 1][1])), 1);
        const error = Math.abs(x) >= Math.abs(y) ? (x ? b - (y * a) / x : 0) : a - (x * b) / y;
        assert.ok(Math.abs(error) <= 0.5 + 1e-12);
      });
    }
  assert.throws(() => lineSteps([0.5, 0], [1, 1]));
});

test('中点圆满足对称、半径误差与退化圆约定', () => {
  assert.deepEqual(
    circleSteps(0).map((s) => s.point),
    [[0, 0]],
  );
  for (let r = 1; r <= 60; r++) {
    const all = circleSteps(r).flatMap((s) => symmetricPoints([0, 0], s.point));
    const keys = new Set(all.map((p) => p.join(',')));
    for (const [x, y] of all) {
      assert.ok(Math.abs(Math.hypot(x, y) - r) <= 0.5);
      assert.ok(keys.has([-y, x].join(',')));
    }
    assert.ok(keys.has(`0,${r}`));
    assert.ok(keys.has(`${r},0`));
  }
});

test('扫描线凹多边形分成两段，反转绕序不改变奇偶填充', () => {
  const p: Vec2[] = [
    [1, 1],
    [7, 1],
    [7, 7],
    [5, 7],
    [5, 3],
    [3, 3],
    [3, 7],
    [1, 7],
  ];
  assert.deepEqual(scanlineSpans(p, 4.5).crossings, [1, 3, 5, 7]);
  assert.deepEqual(scanlineFill(p, 8, 8), scanlineFill([...p].reverse(), 8, 8));
  assert.deepEqual(scanlineSpans(p, 1).crossings, []);
  assert.deepEqual(scanlineSpans(p, 7).crossings, [1, 3, 5, 7]);
});

test('扫描线与独立边函数在整数子像素三角形的边界上逐样本相同', () => {
  const triangles: [Vec2, Vec2, Vec2][] = [
    [
      [0.5, 0.5],
      [7.5, 0.5],
      [2.5, 7.5],
    ],
    [
      [1.5, 1.5],
      [7.5, 7.5],
      [1.5, 7.5],
    ],
    [
      [0, 0],
      [8, 2],
      [3, 8],
    ],
  ];
  const samples: Vec2[] = Array.from({ length: 64 }, (_, i) => [
    (i % 8) + 0.5,
    Math.floor(i / 8) + 0.5,
  ]);
  for (const triangle of triangles) {
    const fill = new Set(scanlineFill(triangle, 8, 8).map((p) => p.join(',')));
    assert.deepEqual(
      samples.map((p) => fill.has(p.join(','))),
      triangleCoverage(triangle, samples, 'top_left').covered,
    );
  }
});
