import test from 'node:test';
import assert from 'node:assert/strict';
import { sphereRoots, planeT, reflect, cameraRay, shadowHit, trace, defaultScene } from './core.ts';
test('球求交支持非单位射线、球内起点、切线和未命中', () => {
  assert.deepEqual(sphereRoots([0, 0, 3], [0, 0, -2], [0, 0, 0], 1), [1, 2]);
  assert.deepEqual(sphereRoots([0, 0, 0], [1, 0, 0], [0, 0, 0], 1), [-1, 1]);
  assert.deepEqual(sphereRoots([1, 0, 1], [0, 0, -1], [0, 0, 0], 1), [1, 1]);
  assert.deepEqual(sphereRoots([2, 0, 1], [0, 0, -1], [0, 0, 0], 1), [Infinity, Infinity]);
});
test('平行射线没有唯一平面交点，反射长度保持', () => {
  assert.equal(planeT([0, 1, 0], [1, 0, 0]), Infinity);
  assert.deepEqual(reflect([1, -2, 0], [0, 1, 0]), [1, 2, 0]);
});
test('中心射线看向目标，数组首行向上', () => {
  const a = cameraRay(0, 0, 1, 1, [0, 0, 3], [0, 0, 0], 90);
  assert.deepEqual(a.direction, [0, 0, -1]);
  assert.ok(cameraRay(0, 0, 3, 3, [0, 0, 3], [0, 0, 0], 90).direction[1] > 0);
});
test('点光源之后的球不遮挡阴影线段，近光源不延长区间', () => {
  const scene = defaultScene();
  scene.spheres = [{ center: [0, 3, 0], radius: 0.5, color: [1, 1, 1], mirror: 0 }];
  assert.equal(shadowHit([0, 0, 0], [0, 1, 0], [0, 1, 0], 0.0001, scene).blocked, false);
  assert.equal(shadowHit([0, 0, 0], [0, 1, 0], [0, 0.0001, 0], 0.001, scene).blocked, false);
});
test('反射预算有界，返回可以检查的实际射线路径', () => {
  const ray = cameraRay(4, 4, 9, 9),
    result = trace(ray.origin, ray.direction, { bounces: 3 });
  assert.ok(result.segments.length <= 4);
  assert.ok(result.color.every(Number.isFinite));
  assert.ok(result.segments.every((s) => s.throughput >= 0 && s.throughput <= 1));
});
