import test from 'node:test';
import assert from 'node:assert/strict';
import { depthPyramid, occlusionQuery, projectedSize, rectangleSamples } from './occlusion.ts';

test('Hi-Z 保留背景洞和最远深度，相等深度仍保留候选', () => {
  const base = { width: 2, height: 2, data: new Float64Array([0.2, 0.3, 0.4, 0.8]) };
  const pyramid = depthPyramid(base);
  assert.equal(pyramid[1].data[0], 0.8);
  assert.equal(occlusionQuery(pyramid, [0, 0, 2, 2], 0.7, 1).occluded, false);
  assert.equal(occlusionQuery(pyramid, [0, 0, 2, 2], 0.9, 1).occluded, true);
  assert.equal(occlusionQuery(pyramid, [0, 0, 2, 2], 0.8, 1).occluded, false);
  base.data[3] = Infinity;
  assert.equal(depthPyramid(base)[1].data[0], Infinity);
  assert.equal(pyramid[0].data[3], 0.8, '构建保留独立快照');
  assert.throws(() => depthPyramid({ ...base, data: new Float64Array([NaN, 0, 0, 0]) }));
});
test('奇数尺寸的粗层查询只可漏剔除，不能误剔除仍可见的中心样本', () => {
  const width = 7,
    height = 5;
  const data = Float64Array.from({ length: width * height }, (_, i) =>
    i % 9 ? (i % 5) / 10 : Infinity,
  );
  const levels = depthPyramid({ width, height, data });
  assert.deepEqual(
    levels.map((l) => [l.width, l.height]),
    [
      [7, 5],
      [4, 3],
      [2, 2],
      [1, 1],
    ],
  );
  for (let x = -0.3; x < 6; x += 0.7)
    for (let y = 0.1; y < 4; y += 0.8) {
      const rect: [number, number, number, number] = [x, y, x + 1.4, y + 1.3];
      const samples = rectangleSamples(rect, width, height);
      for (let level = 0; level < levels.length; level++)
        if (occlusionQuery(levels, rect, 0.65, level).occluded)
          assert.ok(samples.every((i) => 0.65 > data[i]));
    }
  assert.equal(occlusionQuery(levels, [8, 8, 10, 10], 0.9, 0).occluded, false);
});
test('投影尺寸遵守相似三角形，小于一像素不等于没有中心样本', () => {
  assert.ok(Math.abs(projectedSize(2, 4, 90, 800) - 200) < 1e-12);
  assert.equal(projectedSize(1, 8, 60, 800), projectedSize(2, 16, 60, 800));
  assert.deepEqual(rectangleSamples([0, 0, 0.8, 0.8], 2, 2), [0]);
  assert.deepEqual(rectangleSamples([0.6, 0.6, 1.4, 1.4], 2, 2), []);
  assert.deepEqual(rectangleSamples([0.5, 0.5, 1.5, 1.5], 2, 2), [0]);
  assert.throws(() => projectedSize(1, 0, 60, 800));
});
