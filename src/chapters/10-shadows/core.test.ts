import test from 'node:test';
import assert from 'node:assert/strict';
import { identity } from '../../math/matrix.ts';
import { pcfVisibility, shadowQuery, renderScene } from './core.ts';
test('PCF 先比较再平均，不平均深度', () => {
  assert.equal(pcfVisibility(0.5, [0.2, 0.7, 0.8]), 2 / 3);
  assert.equal(pcfVisibility(0.5, [0.2, 0.7, 0.8], 0.4), 1);
  assert.equal(pcfVisibility(0.5, [Infinity]), 1);
});
test('阴影 UV 向下，边界 1 对应最后纹素，越界视为可见', () => {
  const depth = new Float64Array([0.1, 0.2, 0.3, 0.4]);
  assert.equal(shadowQuery([-1, 1, 0], identity(4), depth, 2, 2, 0).stored, 0.1);
  assert.equal(shadowQuery([1, -1, 0], identity(4), depth, 2, 2, 0).stored, 0.4);
  assert.equal(shadowQuery([2, 0, 0], identity(4), depth, 2).visibility, 1);
});
test('两次光栅化得到可见面与阴影，PCF 含真实中间值', () => {
  const frame = renderScene(32, 32, [-3, 6, -2], 0.004, 1);
  assert.ok(frame.camera.owner.some((x) => x >= 0));
  assert.ok(frame.visibility.some((x) => x === 0));
  assert.ok(frame.visibility.some((x) => x > 0 && x < 1));
  assert.ok(frame.color.every(Number.isFinite));
});
