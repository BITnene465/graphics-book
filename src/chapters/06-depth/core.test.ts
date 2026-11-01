import test from 'node:test';
import assert from 'node:assert/strict';
import {
  depthFromDistance,
  distanceFromDepth,
  clipVertices,
  render,
  interpolateDepth,
  quantizeDepth,
} from './core.ts';
import type { Triangle2 } from '../04-barycentric/core.ts';
test('深度 near/far 边界与反函数', () => {
  for (const d of [0.1, 0.2, 1, 10, 100])
    assert.ok(Math.abs(distanceFromDepth(depthFromDistance(d, 0.1, 100), 0.1, 100) - d) < 1e-9);
  assert.equal(depthFromDistance(0.1, 0.1, 100), 0);
  assert.ok(Math.abs(depthFromDistance(100, 0.1, 100) - 1) < 1e-12);
});
test('z_ndc 按屏幕权重线性插值，不再次透视校正', () => {
  assert.equal(interpolateDepth([0.5, 0.5], [-1, 0.5]), 0.375);
});
test('相交三角形逐像素决定所有者，顺序不影响不同深度', () => {
  const xy: Triangle2 = [
      [-0.9, -0.8],
      [0.9, -0.8],
      [0, 0.9],
    ],
    triangles = [clipVertices(xy, [2, 8, 4], 0.1, 20), clipVertices(xy, [8, 2, 4], 0.1, 20)],
    colors: [[number, number, number], [number, number, number]] = [
      [1, 0, 0],
      [0, 1, 0],
    ];
  const a = render(triangles, colors, 32, 32),
    b = render(triangles, colors, 32, 32, { order: [1, 0] });
  assert.deepEqual(a.color, b.color);
  assert.ok(a.owner.includes(0) && a.owner.includes(1));
});
test('相同存储深度先画者赢，定点量化暴露精度损失', () => {
  const triangle = clipVertices(
      [
        [-1, -1],
        [1, -1],
        [0, 1],
      ],
      [2, 2, 2],
      0.1,
      10,
    ),
    a = render(
      [triangle, triangle],
      [
        [1, 0, 0],
        [0, 1, 0],
      ],
      8,
      8,
      { order: [1, 0] },
    );
  assert.ok(a.owner.every((x) => x === -1 || x === 1));
  assert.equal(quantizeDepth(0.5001, 8), quantizeDepth(0.5002, 8));
});
