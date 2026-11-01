import test from 'node:test';
import assert from 'node:assert/strict';
import { fitPolynomial, interpolate, polynomial } from './fitting.ts';
const close = (a: number[], b: number[], eps = 1e-9) =>
  a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < eps, `${x} != ${b[i]}`));

test('四点插值还原已知向量多项式，参数平移缩放不改变几何曲线', () => {
  const times = [0, 1 / 3, 2 / 3, 1],
    exact = (t: number) => [t, 1 - 2 * t + 3 * t * t - t ** 3],
    data = times.map(exact);
  for (const t of [0, 0.15, 0.5, 0.9, 1]) {
    close(interpolate(times, data, t), exact(t));
    close(
      interpolate(
        times.map((x) => (1 + 3 * x) / 4),
        data,
        (1 + 3 * t) / 4,
      ),
      exact(t),
    );
  }
  assert.throws(
    () =>
      interpolate(
        [0, 0],
        [
          [0, 1],
          [2, 3],
        ],
        0.5,
      ),
    /互异/,
  );
});

test('QR 拟合还原低次曲线，高次插值与 Lagrange 独立对照', () => {
  const times = Array.from({ length: 6 }, (_, i) => i / 5);
  const quadratic = times.map((t) => [t, 2 - 3 * t + 4 * t * t]);
  const fit = fitPolynomial(times, quadratic, 2);
  close(fit.coefficients.flat(), [0, 2, 1, -3, 0, 4]);
  assert.ok(fit.squaredError < 1e-26);
  const data = [
    [-2, 0],
    [-1, 1],
    [0, -1],
    [1, 1.5],
    [2, 0.5],
    [3, 0],
  ];
  const fifth = fitPolynomial(times, data, 5);
  for (const t of [0, 0.12, 0.48, 0.77, 1])
    close(polynomial(fifth.coefficients, t), interpolate(times, data, t));
});

test('最小二乘残差与各幂列正交，增加次数不增加样本误差', () => {
  const times = Array.from({ length: 8 }, (_, i) => i / 7),
    data = times.map((t, i) => [2 * t - 1, Math.sin(4 * t) + (i % 2 ? 0.2 : -0.1)]);
  let error = Infinity;
  for (let degree = 0; degree <= 5; degree++) {
    const fit = fitPolynomial(times, data, degree);
    assert.ok(fit.squaredError <= error + 1e-12);
    for (let j = 0; j <= degree; j++)
      for (let axis = 0; axis < 2; axis++)
        assert.ok(
          Math.abs(times.reduce((sum, t, i) => sum + t ** j * fit.residuals[i][axis], 0)) < 1e-10,
        );
    error = fit.squaredError;
  }
  assert.throws(() => fitPolynomial([0.5, 0.5, 0.5], [[0], [1], [2]], 1), /秩不足/);
  assert.doesNotThrow(() => fitPolynomial([0, 0, 1], [[0], [1], [2]], 1));
});
