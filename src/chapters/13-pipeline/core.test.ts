import test from 'node:test';
import assert from 'node:assert/strict';
import { identity } from '../../math/matrix.ts';
import { renderFrame, sourceOver, flatScene, inspectPixel } from './core.ts';
import type { Scene } from './core.ts';
const scene: Scene = flatScene(
  [
    [
      [-0.8, -0.8, 0],
      [0.8, -0.8, 0],
      [0, 0.8, 0],
    ],
    [
      [-0.8, -0.8, 0.5],
      [0.8, -0.8, 0.5],
      [0, 0.8, 0.5],
    ],
  ],
  [
    [1, 0, 0],
    [0, 1, 0],
  ],
);
test('完整管线的深度结果与提交顺序无关，早深度只减少着色', () => {
  const options = { width: 24, view: identity(4), projection: identity(4) },
    a = renderFrame(scene, options),
    b = renderFrame(scene, { ...options, reverse: true }),
    late = renderFrame(scene, { ...options, earlyDepth: false });
  assert.deepEqual(a.color, b.color);
  assert.deepEqual(a.color, late.color);
  assert.ok(a.counts.shaded < late.counts.shaded);
  assert.ok(a.owner.includes(0));
});
test('关闭深度后严格按提交顺序覆盖，像素检查可追溯', () => {
  const a = renderFrame(scene, {
    width: 24,
    view: identity(4),
    projection: identity(4),
    depthTest: false,
  });
  const probe = inspectPixel(a, 12, 12);
  assert.equal(probe.face, 1);
  assert.deepEqual(probe.color, [0, 1, 0]);
  assert.ok(Math.abs(probe.weights.reduce((a, b) => a + b, 0) - 1) < 1e-12);
});
test('透明合成在线性颜色中，顺序一般不交换', () => {
  assert.deepEqual(sourceOver([1, 0, 0], [0, 0, 1], 0.5), [0.5, 0, 0.5]);
  assert.notDeepEqual(
    sourceOver([1, 0, 0], sourceOver([0, 0, 1], [1, 1, 1], 0.5), 0.5),
    sourceOver([0, 0, 1], sourceOver([1, 0, 0], [1, 1, 1], 0.5), 0.5),
  );
});
