import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, compose, inverse, rotation, scaling, translation } from './core.ts';

test('平移改变点但不改变方向', () => {
  const m = translation(3, -2);
  assert.deepEqual(apply(m, [[1, 2]]), [[4, 0]]);
  assert.deepEqual(apply(m, [[1, 2]], true), [[1, 2]]);
});
test('最右变换先作用，TR 与 RT 不可交换', () => {
  const a = apply(compose(translation(3, 0), rotation(Math.PI / 2)), [[1, 0]])[0];
  assert.ok(Math.abs(a[0] - 3) < 1e-12 && Math.abs(a[1] - 1) < 1e-12);
  const b = apply(compose(rotation(Math.PI / 2), translation(3, 0)), [[1, 0]])[0];
  assert.ok(Math.abs(b[0]) < 1e-12 && Math.abs(b[1] - 4) < 1e-12);
});
test('负缩放合法，零缩放只在求逆时失败', () => {
  assert.deepEqual(apply(scaling(-2, 0), [[1, 3]]), [[-2, 0]]);
  assert.throws(() => inverse(scaling(-2, 0)));
});
test('复合变换的逆恢复原点集', () => {
  const m = compose(translation(1e4, -3), rotation(0.7), scaling(-2, 0.4)),
    points: [number, number][] = [
      [0, 0],
      [2, 3],
      [-4, 1],
    ];
  const back = apply(inverse(m), apply(m, points));
  back.flat().forEach((x, i) => assert.ok(Math.abs(x - points.flat()[i]) < 1e-10));
});
test('仿射入口拒绝透视矩阵与非有限输入', () => {
  assert.throws(() =>
    apply(
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 1, 1],
      ],
      [[1, 2]],
    ),
  );
  assert.throws(() => apply(translation(NaN, 0), [[1, 2]]));
});
