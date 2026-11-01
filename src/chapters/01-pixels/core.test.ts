import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeRgba,
  linearToSrgb,
  mixColors,
  pixelCenters,
  probePixel,
  renderImage,
  sampleOffsets,
  srgbToLinear,
} from './core.ts';

test('四个角的颜色与首行在顶部的数组一致', () => {
  assert.deepEqual([...renderImage(2, 2, 1, 'corners')], [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1]);
  assert.deepEqual(pixelCenters(2, 2), [
    [0.25, 0.75],
    [0.75, 0.75],
    [0.25, 0.25],
    [0.75, 0.25],
  ]);
});
test('sRGB 两个分支、裁切与往返误差', () => {
  assert.ok(Math.abs(srgbToLinear(0.04045) - 0.0031308) < 1e-7);
  for (let i = 0; i <= 255; i++)
    assert.ok(Math.abs(linearToSrgb(srgbToLinear(i / 255)) - i / 255) < 1e-7);
  assert.equal(linearToSrgb(-1), 0);
  assert.ok(Math.abs(linearToSrgb(2) - 1) < 1e-12);
});
test('黑白平均的线性光结果不同于编码均值', () => {
  const a = mixColors([0, 0, 0], [1, 1, 1], 0.5);
  assert.ok(Math.abs(a[0] - 0.7353569830524495) < 1e-12);
  assert.deepEqual(mixColors([0, 0, 0], [1, 1, 1], 0.5, false), [0.5, 0.5, 0.5]);
});
test('采样布局覆盖每个子格且关于中心对称', () => {
  for (const n of [1, 2, 4, 16]) {
    const s = sampleOffsets(n);
    assert.equal(s.length, n * n);
    assert.equal(s.reduce((a, p) => a + p[0], 0) / s.length, 0.5);
  }
  assert.throws(() => sampleOffsets(0));
  assert.throws(() => sampleOffsets(1.5));
});
test('每个像素的线性梯度均值等于像素中心', () => {
  for (const n of [1, 2, 4])
    [...renderImage(4, 3, n, 'gradient')].forEach((x, i) =>
      assert.ok(Math.abs(x - ((Math.floor(i / 3) % 4) + 0.5) / 4) < 1e-12),
    );
});
test('探针的连续边界与整数行列分别处理', () => {
  assert.deepEqual(probePixel(0, 0, 4, 3), [2, 0]);
  assert.deepEqual(probePixel(3.99, 2.99, 4, 3), [0, 3]);
  assert.throws(() => probePixel(4, 0, 4, 3));
  assert.throws(() => probePixel(0, 3, 4, 3));
});
test('Canvas 编码不再次上下翻转', () => {
  assert.deepEqual(
    [...encodeRgba(new Float64Array([1, 0, 0, 0, 0, 1]))],
    [255, 0, 0, 255, 0, 0, 255, 255],
  );
  assert.throws(() => srgbToLinear(2));
  assert.throws(() => linearToSrgb(NaN));
  assert.throws(() => pixelCenters(0, 2));
});
