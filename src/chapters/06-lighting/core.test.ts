import test from 'node:test';
import assert from 'node:assert/strict';
import { dot } from '../../math/vector.ts';
import { transformNormals, shade, lightAt } from './core.ts';
test('非均匀变换后的正确法线仍垂直于切向', () => {
  const n = transformNormals(
    [[1, 1, 0]],
    [
      [2, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
  )[0];
  assert.ok(Math.abs(dot(n, [2, -1, 0])) < 1e-12);
  assert.ok(
    Math.abs(
      dot(
        transformNormals(
          [[1, 1, 0]],
          [
            [2, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ],
          false,
        )[0],
        [2, -1, 0],
      ),
    ) > 0.1,
  );
});
test('点光源距离加倍，入射比例降为四分之一', () => {
  assert.equal(lightAt([0, 0, 0], [0, 0, 2], true, 8).irradiance, 2);
  assert.equal(lightAt([0, 0, 0], [0, 0, 4], true, 8).irradiance, 0.5);
});
test('背光与背向观察者不产生单面直接光，半程零向量安全', () => {
  assert.deepEqual(shade([0, 0, 1], [0, 0, -1], [0, 0, 1], { ambient: 0 }).total, [0, 0, 0]);
  assert.deepEqual(shade([0, 0, 1], [0, 0, 1], [0, 0, -1], { ambient: 0 }).total, [0, 0, 0]);
});

test('正文单三角形手算：Flat、Gouraud、Phong 共用同一中心像素', async () => {
  const { rasterizeMesh } = await import('./mesh-shading.ts');
  const frame = rasterizeMesh(
    [
      [-1, -1, 0],
      [1, -1, 0],
      [0, 1, 0],
    ],
    [[0, 1, 2]],
    [
      [0.6, 0, 0.8],
      [-0.6, 0, 0.8],
      [0, 0.6, 0.8],
    ],
    3,
    1.5,
    [0, 0, 1],
    {},
    (_p, n) =>
      shade(n, [0, 0, 1], [0, 0, 1], { kd: [1, 1, 1], ks: 0, ambient: 0, irradiance: 1 }).total,
  );
  const i = (1 * 3 + 1) * 3;
  assert.equal(frame.owner[4], 0);
  assert.ok(Math.abs(frame.images.flat[i] - 1) < 1e-12);
  assert.ok(Math.abs(frame.images.gouraud[i] - 0.8) < 1e-12);
  assert.ok(Math.abs(frame.images.phong[i] - 0.8 / Math.sqrt(0.73)) < 1e-12);
});
