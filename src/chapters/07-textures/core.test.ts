import test from 'node:test';
import assert from 'node:assert/strict';
import {
  texture,
  perspectiveInterpolate,
  sampleTexture,
  buildMipmaps,
  perspectiveJacobian,
  footprintMetrics,
  sampleAnisotropic,
} from './core.ts';
import { buildRipmap, ripmapWeights, ripmapProbe, ellipseFilter } from './footprint-filters.ts';
import { surfaceSample, decodeNormal, tangentFrame } from './surface-maps.ts';
const close = (a: number, b: number, t = 1e-10) => assert.ok(Math.abs(a - b) < t, `${a} ≠ ${b}`);
test('屏幕中点的正确表面权重为 0.2', () => {
  close(perspectiveInterpolate([0.5, 0.5], [[0], [1]], [1, 0.25])[0], 0.2);
});
test('材质 v 向上，源图像行向下，边界 clamp', () => {
  const t = texture(2, 2, (x, y) => [x, y, 0]);
  assert.deepEqual(sampleTexture(t, [0, 1]), [0, 0, 0]);
  assert.deepEqual(sampleTexture(t, [1, 0]), [1, 1, 0]);
  assert.deepEqual(sampleTexture(t, [0.5, 0.5]), [0.5, 0.5, 0]);
});
test('奇数尺寸 Mip 链保留全图线性均值', () => {
  const t = texture(5, 3, (x, y) => [x + 10 * y, x * y, 1]),
    levels = buildMipmaps(t),
    last = levels.at(-1)!;
  for (let c = 0; c < 3; c++)
    close(
      last.data[c],
      Array.from({ length: 15 }, (_, i) => t.data[3 * i + c]).reduce((s, x) => s + x, 0) / 15,
    );
  assert.deepEqual(
    levels.map((t) => [t.width, t.height]),
    [
      [5, 3],
      [2, 1],
      [1, 1],
    ],
  );
});
test('透视 Jacobian 与独立有限差分一致', () => {
  const xy: [[number, number], [number, number], [number, number]] = [
      [0, 0],
      [2, 0],
      [0, 2],
    ],
    uv: [[number, number], [number, number], [number, number]] = [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    w: [number, number, number] = [0.3, 0.4, 0.3],
    inv: [number, number, number] = [1, 0.5, 0.25];
  const j = perspectiveJacobian(w, xy, uv, inv),
    eps = 1e-5;
  for (let a = 0; a < 2; a++) {
    const left = [...w],
      right = [...w];
    left[0] += eps / 2;
    left[a + 1] -= eps / 2;
    right[0] -= eps / 2;
    right[a + 1] += eps / 2;
    const lo = perspectiveInterpolate(left, uv, inv),
      hi = perspectiveInterpolate(right, uv, inv);
    hi.forEach((v, c) => close((v - lo[c]) / (2 * eps), j[c][a], 1e-8));
  }
});
test('各向异性足迹轴与常量保持', () => {
  const m = footprintMetrics(
    [
      [0.1, 0],
      [0, 0.01],
    ],
    100,
    100,
  );
  close(m.major, 10);
  close(m.minor, 1);
  assert.equal(m.tapCount, 8);
  const mip = buildMipmaps(texture(8, 8, () => [0.2, 0.3, 0.4]));
  sampleAnisotropic(
    mip,
    [0.1, 0.8],
    [
      [1, 0.5],
      [0, 0.02],
    ],
  ).forEach((x, i) => close(x, [0.2, 0.3, 0.4][i]));
});
test('Ripmap 返回颜色等于原始纹素真实权重求和', () => {
  const image = texture(7, 5, (x, y) => [x / 7, y / 5, (x + y) / 12]),
    uv: [number, number] = [0.37, 0.81],
    lod: [number, number] = [1.2, 0.7],
    weights = ripmapWeights(7, 5, uv, lod),
    probe = ripmapProbe(buildRipmap(image), uv, lod);
  close(
    weights.reduce((a, b) => a + b, 0),
    1,
  );
  probe.color.forEach((x, c) =>
    close(
      x,
      weights.reduce((s, w, i) => s + w * image.data[3 * i + c], 0),
    ),
  );
});
test('椭圆核合并越界权重并归一化；零轴回退双线性', () => {
  const image = texture(8, 8, () => [0.2, 0.4, 0.6]),
    f = ellipseFilter(image, [0, 0], 10, 2, 31);
  close(
    f.weights.reduce((a, b) => a + b, 0),
    1,
  );
  f.color.forEach((x, i) => close(x, [0.2, 0.4, 0.6][i]));
  assert.equal(ellipseFilter(image, [0.5, 0.5], 0, 4).fallback, true);
});
test('高度法线使用真实尺寸，法线数据不做 sRGB 解码', () => {
  const s = surfaceSample([0.2, 0.3]),
    n = decodeNormal(s.encoded, tangentFrame([2.4, 0, 0], [0, 1.8, 0]));
  n.forEach((x, i) => close(x, s.normal[i]));
  assert.throws(() => decodeNormal([0.5, 0.5, 0.5]));
});

test('圆形 Gaussian 核的中心脉冲与手算权重相符', () => {
  const image = texture(9, 9, (x, y) => (x === 4 && y === 4 ? [1, 1, 1] : [0, 0, 0])),
    result = ellipseFilter(image, [0.5, 0.5], 4, 4);
  const center = 1 - Math.exp(-2),
    edge = Math.exp(-0.5) - Math.exp(-2),
    diagonal = Math.exp(-1) - Math.exp(-2);
  close(result.color[0], center / (center + 4 * edge + 4 * diagonal));
});
