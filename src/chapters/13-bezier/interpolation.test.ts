import test from 'node:test';
import assert from 'node:assert/strict';
import { hermite, hermiteBezier, deBoor } from './interpolation.ts';
import { evaluate } from './core.ts';
import { evaluateBSpline } from './splines.ts';
const close = (a: number[], b: number[], epsilon = 1e-9) =>
  a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < epsilon, `${a} != ${b}`));

test('Hermite 满足端点、端点导数与独立中点手算', () => {
  const a = [0, 0],
    b = [2, 0],
    u = [0, 4],
    v = [0, -4],
    h = 1e-6;
  close(hermite(a, b, u, v, 0), a);
  close(hermite(a, b, u, v, 1), b);
  close(hermite(a, b, u, v, 0.5), [1, 1]);
  close(
    hermite(a, b, u, v, h).map((x, i) => (x - a[i]) / h),
    u,
    1e-4,
  );
  close(
    hermite(a, b, u, v, 1 - h).map((x, i) => (b[i] - x) / h),
    v,
    1e-4,
  );
  for (const t of [0, 0.13, 0.5, 0.81, 1])
    close(hermite(a, b, u, v, t), evaluate(hermiteBezier(a, b, u, v), t));
});
test('de Boor 与基函数求和在结点、重复结点、两端及区间内部一致', () => {
  const cases = [
    { degree: 0, knots: [0, 1, 2, 3] },
    { degree: 1, knots: [0, 0, 1, 2, 3, 3] },
    { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2] },
    { degree: 3, knots: [0, 0, 0, 0, 1, 2, 3, 4, 4, 4, 4] },
    { degree: 2, knots: [0, 1, 2, 3, 4, 5, 6, 7] },
    { degree: 2, knots: [0, 0, 0, 1, 1, 1, 2, 2, 2] },
  ];
  for (const { degree, knots } of cases) {
    const count = knots.length - degree - 1,
      control = Array.from({ length: count }, (_, i) => [i, Math.sin(i), i % 2]);
    const saved = JSON.stringify(control),
      lo = knots[degree],
      hi = knots[count];
    const params = [
      ...knots.filter((u) => u >= lo && u <= hi),
      ...Array.from({ length: 31 }, (_, i) => lo + ((hi - lo) * i) / 30),
    ];
    for (const u of params) {
      const result = deBoor(control, knots, degree, u);
      close(result.point, evaluateBSpline(control, knots, degree, u));
      assert.deepEqual(
        result.levels.map((l) => l.length),
        Array.from({ length: degree + 1 }, (_, i) => degree + 1 - i),
      );
    }
    assert.equal(JSON.stringify(control), saved);
  }
});
test('de Boor 在夹持二次曲线上与 Bernstein 手算相同', () => {
  close(
    deBoor(
      [
        [0, 0],
        [2, 2],
        [4, 0],
      ],
      [0, 0, 0, 1, 1, 1],
      2,
      0.5,
    ).point,
    [2, 1],
  );
  assert.throws(() => deBoor([[0], [1]], [0, 0, 0, 1, 1, 1], 2, 0.3));
});
