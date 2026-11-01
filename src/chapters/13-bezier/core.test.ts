import test from 'node:test';
import assert from 'node:assert/strict';
import { deCasteljau, evaluate, derivative, split, arcLengthParameters } from './core.ts';
import {
  cubicJoin,
  joinDiagnostics,
  bsplineBasis,
  basisDerivative,
  evaluateBSpline,
  rationalBezier,
} from './splines.ts';
const close = (a: number, b: number, t = 1e-10) => assert.ok(Math.abs(a - b) < t, `${a} ≠ ${b}`);
const controls = [
  [-2, -1],
  [-1, 2],
  [1, 2],
  [2, -1],
];
test('两种独立 Bézier 求值一致，端点导数有独立手算', () => {
  for (const t of [0, 0.1, 0.37, 0.9, 1])
    evaluate(controls, t).forEach((x, i) => close(x, deCasteljau(controls, t).at(-1)![0][i]));
  assert.deepEqual(derivative(controls, 0), [3, 9]);
});
test('精确分割后重参数化恢复原路径', () => {
  const t = 0.37,
    { left, right } = split(controls, t);
  for (const u of [0, 0.25, 0.8, 1]) {
    evaluate(left, u).forEach((x, i) => close(x, evaluate(controls, u * t)[i]));
    evaluate(right, u).forEach((x, i) => close(x, evaluate(controls, t + (1 - t) * u)[i]));
  }
});
test('直线弧长参数精确，零长度曲线拒绝伪反函数', () => {
  arcLengthParameters(
    [
      [0, 0],
      [3, 4],
    ],
    [0, 0.3, 1],
  ).forEach((x, i) => close(x, [0, 0.3, 1][i]));
  assert.throws(() =>
    arcLengthParameters(
      [
        [1, 1],
        [1, 1],
      ],
      [0.5],
    ),
  );
});
test('C2 拼接考虑不同参数跨度，G1 可方向相同但速度不同', () => {
  const right = [
      [2, -1],
      [3, 0],
      [4, 0],
      [5, 1],
    ],
    c2 = cubicJoin(controls, right, 'C2', 2, 0.5),
    g = cubicJoin(controls, right, 'G1', 1, 1, 2);
  assert.equal(joinDiagnostics(c2.left, c2.right, 2, 0.5).c2, true);
  const diag = joinDiagnostics(g.left, g.right);
  assert.equal(diag.g1, true);
  assert.equal(diag.c1, false);
});
test('B 样条非负分割、端点、局部支持和导数求和', () => {
  const knots = [0, 0, 0, 0, 1, 2, 3, 3, 3, 3];
  for (const u of [0, 0.3, 1, 2.4, 3]) {
    const b = bsplineBasis(knots, 3, u);
    close(
      b.reduce((a, b) => a + b, 0),
      1,
    );
    assert.ok(b.every((x) => x >= 0));
    assert.ok(b.filter((x) => x > 0).length <= 4);
    close(
      basisDerivative(knots, 3, u).reduce((a, b) => a + b, 0),
      0,
    );
  }
  assert.deepEqual(bsplineBasis(knots, 3, 0), [1, 0, 0, 0, 0, 0]);
  assert.deepEqual(bsplineBasis(knots, 3, 3), [0, 0, 0, 0, 0, 1]);
});
test('重复内部结点取右值，末端取左极限', () => {
  const knots = [0, 0, 1, 1, 2, 2],
    p = [[0], [1], [4], [5]];
  close(evaluateBSpline(p, knots, 1, 1)[0], 4);
  close(evaluateBSpline(p, knots, 1, 2)[0], 5);
});
test('正权有理二次精确表示四分之一圆，共同权重尺度不改变几何', () => {
  const p = [
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    w = [1, Math.SQRT1_2, 1];
  for (const t of [0, 0.2, 0.5, 0.8, 1]) {
    const xy = rationalBezier(p, w, t);
    close(Math.hypot(...xy), 1);
    rationalBezier(
      p,
      w.map((x) => x * 1e200),
      t,
    ).forEach((x, i) => close(x, xy[i]));
  }
});
