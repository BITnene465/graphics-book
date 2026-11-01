import test from 'node:test';
import assert from 'node:assert/strict';
import { splineSurface, deBoorSurface } from './nurbs.ts';
import type { SplinePatch } from './nurbs.ts';
import { defaultControl, evaluatePatch } from './core.ts';
const near = (a: number[], b: number[]) =>
  a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-10));
const patch: SplinePatch = {
  control: defaultControl(),
  degreeU: 3,
  degreeV: 3,
  knotsU: [0, 0, 0, 0, 1, 1, 1, 1],
  knotsV: [0, 0, 0, 0, 1, 1, 1, 1],
};
test('单区间夹持 B-spline 曲面还原 Bernstein 曲面，包括边界', () => {
  for (const u of [0, 0.17, 0.5, 1])
    for (const v of [0, 0.61, 1])
      near(splineSurface(patch, u, v).position, evaluatePatch(patch.control, u, v));
});
test('非均匀曲面局部支撑、凸组合与二维 de Boor 一致', () => {
  const p: SplinePatch = {
    ...patch,
    degreeU: 2,
    degreeV: 2,
    knotsU: [0, 0, 0, 0.4, 1, 1, 1],
    knotsV: [0, 0, 0, 0.6, 1, 1, 1],
  };
  const old = splineSurface(p, 0.8, 0.9);
  near(old.position, deBoorSurface(p, 0.8, 0.9));
  near([old.influence.flat().reduce((a, b) => a + b, 0)], [1]);
  assert.equal(old.influence[0][0], 0);
  const edited = structuredClone(p);
  edited.control[0][0][1] += 100;
  near(old.position, splineSurface(edited, 0.8, 0.9).position);
});
test('有理张量积精确表示四分之一圆柱，等权多项式不能', () => {
  const p: SplinePatch = {
    degreeU: 2,
    degreeV: 1,
    knotsU: [0, 0, 0, 1, 1, 1],
    knotsV: [0, 0, 1, 1],
    control: [
      [
        [1, 0, -1],
        [1, 0, 1],
      ],
      [
        [1, 1, -1],
        [1, 1, 1],
      ],
      [
        [0, 1, -1],
        [0, 1, 1],
      ],
    ],
    weights: [
      [1, 1],
      [Math.SQRT1_2, Math.SQRT1_2],
      [1, 1],
    ],
  };
  for (const u of [0, 0.13, 0.5, 0.88, 1])
    for (const v of [0, 0.37, 1]) {
      const q = splineSurface(p, u, v).position;
      near([q[0] ** 2 + q[1] ** 2, q[2]], [1, 2 * v - 1]);
      near(q, deBoorSurface(p, u, v));
    }
  near(splineSurface({ ...p, weights: undefined }, 0.5, 0.5).position, [0.75, 0.75, 0]);
});
test('非可分离权重必须在四维做两轮，最后统一相除', () => {
  const weighted: SplinePatch = {
    ...patch,
    weights: patch.control.map((row, i) => row.map((_, j) => 1 + ((i + 2 * j) % 5))),
  };
  for (const [u, v] of [
    [0.2, 0.7],
    [0.73, 0.41],
    [1, 0],
  ]) {
    const expected = splineSurface(weighted, u, v).position;
    near(expected, deBoorSurface(weighted, u, v));
    near(
      expected,
      splineSurface(
        { ...weighted, weights: weighted.weights!.map((row) => row.map((w) => w * 7)) },
        u,
        v,
      ).position,
    );
  }
});
test('控制网和结点不匹配、负权或域外参数不能悄悄给出曲面', () => {
  assert.throws(() => splineSurface({ ...patch, control: patch.control.slice(1) }, 0.5, 0.5));
  assert.throws(() =>
    splineSurface({ ...patch, weights: patch.control.map((row) => row.map(() => 0)) }, 0.5, 0.5),
  );
  assert.throws(() => deBoorSurface(patch, 1.1, 0.5));
});
