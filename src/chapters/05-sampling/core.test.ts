import test from 'node:test';
import assert from 'node:assert/strict';
import {
  halfplaneCoverage,
  aliasFrequency,
  cosineSpectralLines,
  boxResponse,
  cosineWindowIntegral,
  prefilteredCosine,
  sampleOffsets,
} from './core.ts';
import { cosineExposure, wheelExposure, wheelReference, apparentSpeed } from './temporal.ts';
import { renderScene } from './multisample.ts';
test('像素半平面解析覆盖率及近轴向稳定性', () => {
  assert.equal(halfplaneCoverage([0, 0], [1, 0], 0), 0.5);
  assert.equal(halfplaneCoverage([0, 0], [1, 1], 0), 0.5);
  assert.ok(Math.abs(halfplaneCoverage([0, 0], [1, 1e-14], 0.25) - 0.75) < 1e-12);
});
test('抖动在每个分层单元内，随机种子可复现', () => {
  const a = sampleOffsets(16, 'jitter');
  assert.deepEqual(a, sampleOffsets(16, 'jitter'));
  a.forEach(([x, y], i) => {
    assert.equal(Math.floor(x * 4), i % 4);
    assert.equal(Math.floor(y * 4), Math.floor(i / 4));
  });
});
test('带符号混叠保留正弦采样值，包括负频率', () => {
  for (const f of [-13, 11, 31]) {
    const alias = aliasFrequency(f, 12);
    for (let k = 0; k < 10; k++)
      assert.ok(
        Math.abs(
          Math.sin((2 * Math.PI * f * k) / 12 + 0.3) -
            Math.sin((2 * Math.PI * alias * k) / 12 + 0.3),
        ) < 1e-12,
      );
  }
});
test('Nyquist 谱线复系数抵消，盒式卷积解析零点', () => {
  const s = cosineSpectralLines(4, Math.PI / 2, 8, 9);
  assert.ok(s.every((x) => x.magnitude < 1e-12));
  assert.ok(Math.abs(boxResponse(4, 0.125)) < 1e-12);
  assert.ok(
    Math.abs(cosineWindowIntegral(0.2, 0.1, 3) / 0.2 - prefilteredCosine(0.2, 3, 0.1)) < 1e-12,
  );
});
test('MSAA 与 SSAA 常量颜色相同，高频着色才分离', () => {
  const t: [number, number][][] = [
    [
      [0, 0],
      [4, 0],
      [0, 4],
    ],
  ];
  const scene = renderScene(
    t as [[number, number], [number, number], [number, number]][],
    [[0.5, 0.5, 0.5]],
    [[1, 0.5, 0.2]],
    4,
    4,
    2,
  );
  assert.deepEqual(scene.ssaa.image, scene.msaa.image);
  assert.ok(scene.ssaa.shadingCount > scene.msaa.shadingCount);
});
test('时间积分参考与密集中点求积一致，整周期曝光消掉运动相位', () => {
  assert.ok(Math.abs(cosineExposure(0.31, 0.25, 4) - 0.55) < 1e-12);
  assert.equal(apparentSpeed(2, 12, 8), 0.5);
  const a = wheelExposure(0.2, 0.1, 256, 1, 8, 8),
    b = wheelReference(0.2, 0.1, 1, 8, 8);
  assert.ok(a.every((x, i) => Math.abs(x - b[i]) < 1e-5));
});
