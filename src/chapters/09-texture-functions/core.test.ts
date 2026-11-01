import test from 'node:test';
import assert from 'node:assert/strict';
import {
  directionToLatlong,
  latlongToDirection,
  directionToCube,
  cubeToDirection,
  buildLatlong,
  sampleLatlong,
  environmentLocalDirection,
} from './core.ts';
import { latticeHash, noiseProbe, valueNoise, fbm } from './procedural.ts';
import { unit } from '../02-transforms/spatial.ts';
const close = (a: number, b: number, t = 1e-10) => assert.ok(Math.abs(a - b) < t, `${a} ≠ ${b}`);
test('经纬与立方体方向往返一致，主轴并列优先 X', () => {
  for (const v of [
    [1, 2, 3],
    [-3, 1, 2],
    [0, 1, 0],
    [0, -1, 0],
    [1, 1, 1],
  ] as [number, number, number][]) {
    const n = unit(v),
      l = latlongToDirection(directionToLatlong(v)),
      c = directionToCube(v),
      r = cubeToDirection(c.face, c.uv);
    l.forEach((x, i) => close(x, n[i]));
    r.forEach((x, i) => close(x, n[i]));
  }
  assert.equal(directionToCube([1, 1, 1]).face, 0);
  assert.throws(() => directionToCube([0, 0, 0]));
});
test('经纬图水平包裹，环境主动旋转使用逆方向查询', () => {
  const image = buildLatlong(32, 16);
  assert.deepEqual(sampleLatlong(image, [0, 0.4]), sampleLatlong(image, [1, 0.4]));
  environmentLocalDirection([0, 0, -1], Math.PI / 2).forEach((x, i) => close(x, [1, 0, 0][i]));
});
test('格点 hash 与查询次序无关，噪声是角值的凸组合', () => {
  assert.equal(latticeHash([0, 0], 0), 0);
  const p = noiseProbe([-0.3, 0.7, 1.2], 42);
  close(
    p.weights.reduce((a, b) => a + b, 0),
    1,
  );
  assert.ok(p.value >= Math.min(...p.cornerValues) && p.value <= Math.max(...p.cornerValues));
  assert.equal(valueNoise([1, 2], 7), latticeHash([1, 2], 7));
});
test('五次插值跨格一阶连续，fBm 零 gain 退化为首层', () => {
  const h = 1e-4,
    left = (valueNoise([1, 0.3]) - valueNoise([1 - h, 0.3])) / h,
    right = (valueNoise([1 + h, 0.3]) - valueNoise([1, 0.3])) / h;
  close(left, right, 1e-6);
  close(fbm([0.3, 0.7], 5, 0), valueNoise([0.3, 0.7]));
});
