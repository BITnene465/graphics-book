import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pointIrradiance,
  rectangleSolidAngle,
  rectangleIrradiance,
} from '../chapters/23-radiometry/core.ts';
import { fresnel, ggx, beerLambert } from '../chapters/24-materials/core.ts';
import { radiosity, parallelFormFactor } from '../chapters/25-global-illumination/core.ts';
import { cosineHemisphere, estimateSquare, renderPaths } from '../chapters/26-path-tracing/core.ts';
import { buildBVH, intersectBVH, boxInterval } from '../chapters/27-acceleration/core.ts';
import { sphereRoots } from '../chapters/15-rays/core.ts';
import { random, dot } from './vector.ts';
import type { Vec2, Vec3 } from './vector.ts';
import { makeImage } from './image.ts';
import { composite, knownAlpha, matteLine } from '../chapters/28-matting/core.ts';
import { poissonBlend, meanValueWeights, matchMoments } from '../chapters/29-image-editing/core.ts';
import { verticalSeam, removeSeam } from '../chapters/30-retargeting/core.ts';
import { homography, warp, robustHomography } from '../chapters/31-registration/core.ts';
import { imageDistance, circleOfConfusion, lensRay } from '../chapters/32-lenses/core.ts';
import { mosaic, demosaic, sensorSamples, toneMap } from '../chapters/33-sensors/core.ts';
import {
  measure,
  blurMatrix,
  regularizedInverse,
  refocus,
} from '../chapters/34-computational-imaging/core.ts';
import { bilateral } from '../chapters/35-stylization/core.ts';
import { quiltStrip, movingStrokes } from '../chapters/36-texture-synthesis/core.ts';
import { hermiteMotion, slerp, rotateQuaternion } from '../chapters/37-keyframes/core.ts';
import { forward, inverse, skin2 } from '../chapters/38-kinematics/core.ts';
import { oscillator, initialFlock, flockStep, particleAt } from '../chapters/39-dynamics/core.ts';
const near = (a: number, b: number, t = 1e-8) => assert.ok(Math.abs(a - b) < t, a + ' ≠ ' + b);
test('辐射量核对距离平方、余弦及面积远场极限', () => {
  near(pointIrradiance(100, 2), pointIrradiance(100, 1) / 4);
  near(pointIrradiance(100, 2, 0.5), pointIrradiance(100, 2) / 2);
  assert.ok(rectangleSolidAngle(1, 1, 1) < 2 * Math.PI);
  near(rectangleIrradiance(2, 0.01, 0.01, 10), (2 * 0.0004) / 100, 1e-10);
  near(parallelFormFactor(1, 1, 10), 1 / (100 * Math.PI), 3e-5);
});
test('Fresnel 法向、全反射、同介质与 GGX 互易性', () => {
  near(fresnel(1, 1, 1.5).reflectance, 0.04);
  assert.equal(fresnel(0.5, 1.5, 1).cosTransmitted, null);
  near(fresnel(0, 1, 1).reflectance, 0);
  near(ggx(0.3, -0.5, 0.4), ggx(-0.5, 0.3, 0.4));
  near(beerLambert(0.4, 3), beerLambert(0.4, 1) * beerLambert(0.4, 2));
});
test('辐射度迭代收敛到独立的二面片解析解', () => {
  const F = [
      [0, 0.5],
      [0.5, 0],
    ],
    rho = [0.5, 0.5],
    e = [1, 0],
    solution = radiosity(F, rho, e);
  near(solution[0], 16 / 15);
  near(solution[1], 4 / 15);
  radiosity(F, rho, e, 30).forEach((x, i) => near(x, solution[i]));
  assert.deepEqual(radiosity(F, [0, 0], e), e);
});
test('余弦采样单位长度、半球与方向一阶矩；重要性估计方差降低', () => {
  const rng = random(5),
    N = 20000;
  let cosine = 0;
  for (let i = 0; i < N; i++) {
    const d = cosineHemisphere([0, 1, 0], rng);
    near(Math.hypot(...d), 1);
    assert.ok(d[1] >= 0);
    cosine += d[1];
  }
  near(cosine / N, 2 / 3, 0.01);
  const uniform = estimateSquare(10000, 8),
    importance = estimateSquare(10000, 8, true);
  near(uniform.mean, 1 / 3, 0.01);
  near(importance.mean, 1 / 3, 0.01);
  assert.ok(importance.variance < uniform.variance);
  assert.deepEqual(renderPaths(5, 4, 3, 2, 7), renderPaths(5, 4, 3, 2, 7));
});
test('BVH 与穷举球求交一致，平行盒查询不丢失边界', () => {
  const rng = random(11),
    balls = Array.from({ length: 35 }, () => ({
      center: [rng() * 4, rng() * 4, rng() * 4] as Vec3,
      radius: 0.2,
    })),
    tree = buildBVH(balls);
  for (let k = 0; k < 80; k++) {
    const o: Vec3 = [-1, rng() * 4, rng() * 4],
      d: Vec3 = [1, (rng() - 0.5) * 0.2, (rng() - 0.5) * 0.2],
      hit = intersectBVH(o, d, balls, tree);
    let t = Infinity,
      id = -1;
    balls.forEach((b, i) =>
      sphereRoots(o, d, b.center, b.radius).forEach((x) => {
        if (x >= 0 && x < t) {
          t = x;
          id = i;
        }
      }),
    );
    assert.equal(hit.id, id);
    if (id >= 0) near(hit.t, t);
  }
  const box = { min: [0, 0, 0] as Vec3, max: [1, 1, 1] as Vec3 };
  assert.deepEqual(boxInterval([0, 0.5, 0.5], [1, 0, 0], box), [0, 1]);
  assert.equal(boxInterval([-1, 0.5, 0.5], [0, 1, 0], box), null);
});
test('alpha 反求与常量 alpha 的局部抠图零空间', () => {
  const F: Vec3 = [0.2, 0.4, 0.8],
    B: Vec3 = [0.9, 0.6, 0.1];
  near(knownAlpha(composite(F, B, 0.35), F, B)!, 0.35);
  assert.equal(knownAlpha(F, F, F), null);
  matteLine(
    [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
    new Map([
      [0, 0.4],
      [5, 0.4],
    ]),
  ).forEach((x) => near(x, 0.4));
});
test('Poisson 精确保留边界，恢复独立离散已知解', () => {
  const source = makeImage(9, 9, (u, v) => [u * u + v * v, 0.3 * u, 0.2 * v]),
    mask = Array.from(
      { length: 81 },
      (_, i) => i % 9 > 0 && i % 9 < 8 && Math.floor(i / 9) > 0 && Math.floor(i / 9) < 8,
    );
  const target = { ...source, data: source.data.map((x, i) => (mask[Math.floor(i / 3)] ? 0 : x)) },
    out = poissonBlend(source, target, mask, 500);
  source.data.forEach((x, i) => near(out.image.data[i], x, 1e-6));
  assert.ok(out.residual < 1e-7);
  const square: Vec2[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    weights = meanValueWeights([0.3, 0.7], square);
  near(
    weights.reduce((s, x) => s + x, 0),
    1,
  );
  for (let c = 0; c < 2; c++)
    near(
      square.reduce((s, p, i) => s + p[c] * weights[i], 0),
      [0.3, 0.7][c],
    );
  assert.deepEqual(meanValueWeights([0.5, 0], square), [0.5, 0.5, 0, 0]);
  assert.deepEqual(matchMoments([2, 2], 0.3, 1), [0.3, 0.3]);
});
test('动态规划与小网格全部合法路径的穷举一致', () => {
  const w = 4,
    h = 4,
    cost = [0.2, 0.6, 0.7, 0.5, 0.5, 0.1, 0.8, 0.3, 0.6, 0.4, 0.2, 0.1, 0.9, 0.8, 0.7, 0.2];
  let best = Infinity;
  const visit = (path: number[], sum: number) => {
    if (path.length === h) {
      best = Math.min(best, sum);
      return;
    }
    for (let x = 0; x < w; x++)
      if (!path.length || Math.abs(x - path.at(-1)!) <= 1)
        visit([...path, x], sum + cost[path.length * w + x]);
  };
  visit([], 0);
  near(verticalSeam(cost, w, h).cost, best);
  const image = makeImage(4, 4, (u, v) => [u, v, 0]),
    seam = [1, 1, 2, 2],
    out = removeSeam(image, seam);
  assert.equal(out.width, 3);
  near(out.data[3], image.data[6]);
});
test('单应变换复现对应，RANSAC 排除显著外点', () => {
  const source: Vec2[] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
      [0, 0],
      [0.2, 0.3],
      [0.3, -0.6],
      [-0.5, 0.3],
    ],
    H = [1, 0.1, 0.2, 0.2, 1, -0.1, 0.1, 0.05, 1],
    target = source.map((p) => warp(H, p)),
    fit = homography(source, target);
  source.forEach((p, i) => warp(fit, p).forEach((x, c) => near(x, target[i][c])));
  const corrupt = structuredClone(target);
  corrupt[4] = [8, 7];
  const robust = robustHomography(source, corrupt, 0.001);
  assert.equal(robust.inliers.length, 7);
  near(warp(robust.H, [0.4, 0.5])[0], warp(H, [0.4, 0.5])[0]);
  assert.throws(() => robustHomography([[0, 0]], [[0, 0]]));
});
test('薄透镜在 2f 形成等大倒像，CoC 与孔径成正比', () => {
  near(imageDistance(50, 100), 100);
  near(lensRay(50, 100, 10, 5, 100).sensorY, -10);
  near(circleOfConfusion(50, 2, 200, 200), 0);
  near(circleOfConfusion(50, 4, 200, 300), circleOfConfusion(50, 2, 200, 300) / 2);
});
test('Bayer 保留实际观测通道，常值颜色精确恢复', () => {
  const image = makeImage(6, 6, () => [0.2, 0.4, 0.7]),
    raw = mosaic(image),
    out = demosaic(raw, 6, 6);
  out.data.forEach((x, i) => near(x, image.data[i]));
  const samples = sensorSamples(12, 2, 20000, 7),
    mean = samples.reduce((s, x) => s + x, 0) / samples.length,
    variance = samples.reduce((s, x) => s + (x - mean) ** 2, 0) / samples.length;
  near(mean, 12, 0.2);
  near(variance, 16, 0.6);
  near(toneMap(3), 0.75);
});
test('编码反演与光谱零空间独立检查', () => {
  const A = [
      [1, 1, 0, 0],
      [0, 1, 1, 0],
      [0, 0, 1, 1],
    ],
    a = measure(A, [0.2, 0.8, 0.2, 0.8]),
    b = measure(A, [0.7, 0.3, 0.7, 0.3]);
  assert.deepEqual(a, b);
  const identity = [
    [1, 0],
    [0, 1],
  ];
  regularizedInverse(identity, [2, 4], 1).forEach((x, i) => near(x, [1, 2][i]));
  blurMatrix(8, [1, 1, 1]).forEach((r) =>
    near(
      r.reduce((s, x) => s + x, 0),
      1,
    ),
  );
  assert.deepEqual(
    refocus(
      [
        [0, 1, 0],
        [0, 1, 0],
      ],
      0,
    ),
    [0, 1, 0],
  );
});
test('双边与纹理拼接保留常量，运动传播保留笔画对应距离', () => {
  const image = makeImage(12, 12, () => [0.2, 0.4, 0.6]);
  bilateral(image, 2, 0.1).data.forEach((x, i) => near(x, image.data[i]));
  quiltStrip(image, 6, 2, 3, 4).data.forEach((x, i) => near(x, [0.2, 0.4, 0.6][i % 3]));
  const a = movingStrokes(8, 0, true),
    b = movingStrokes(8, 1, true);
  for (let i = 1; i < a.length; i++)
    near(
      Math.hypot(...a[i].map((x, c) => x - a[0][c])),
      Math.hypot(...b[i].map((x, c) => x - b[0][c])),
    );
});
test('Hermite 使用时间速度，四元数插值保持单位与长度', () => {
  near(hermiteMotion(0, 2, 0.3, -0.2, 0, 3).velocity, 0.3);
  near(hermiteMotion(0, 2, 0.3, -0.2, 3, 3).velocity, -0.2);
  const q = slerp([1, 0, 0, 0], [0, 0, 0, 1], 0.5);
  near(dot(q, q), 1);
  const p = rotateQuaternion(q, [1, 0, 0]);
  near(p[0], 0);
  near(p[1], 1);
  assert.deepEqual(slerp([1, 0, 0, 0], [-1, 0, 0, 0], 0.4), [1, 0, 0, 0]);
});
test('IK 代回 FK，绑定姿态蒙皮恒等，不可达目标明确标记', () => {
  for (const side of [-1, 1]) {
    const target: Vec2 = [1, 0.5],
      q = inverse(target, [1, 0.8], side),
      p = forward([1, 0.8], q.angles)[2];
    p.forEach((x, i) => near(x, target[i]));
  }
  assert.equal(inverse([5, 0], [1, 1]).reachable, false);
  skin2([0.7, 0.2], 0.4, 1, [0, 0]).forEach((x, i) => near(x, [0.7, 0.2][i]));
});
test('振子步长收敛与能量边界；粒子寿命与群体同步性', () => {
  const fine = oscillator(0.01, 100, 2, 'verlet').at(-1)!,
    coarse = oscillator(0.1, 10, 2, 'verlet').at(-1)!;
  assert.ok(Math.abs(fine.x - Math.cos(2)) < Math.abs(coarse.x - Math.cos(2)));
  const states = oscillator(0.02, 1000, 2, 'symplectic');
  assert.ok(Math.max(...states.map((s) => s.energy)) < 2.1);
  assert.ok(oscillator(0.1, 50, 2, 'explicit').at(-1)!.energy > 2);
  assert.equal(particleAt(3, 1, [1, 2], 2), null);
  assert.deepEqual(particleAt(2, 1, [1, 2], 2, 2)!.p, [1, 1]);
  const state = initialFlock(8, 4),
    before = JSON.stringify(state),
    out = flockStep(state, 0.02, 0.3, [0, 0]);
  assert.equal(JSON.stringify(state), before);
  assert.ok(out.every((b) => Math.hypot(...b.v) <= 1.2 + 1e-10));
});
