import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cross, dot, normalize, random } from './vector.ts';
import { identity, inverse, matVec, multiply } from './matrix.ts';

test('叉积垂直于两个输入，符合右手系', () => {
  const a = [2, 3, -4],
    b = [-1, 5, 2],
    n = cross(a, b);
  assert.equal(dot(a, n), 0);
  assert.equal(dot(b, n), 0);
  assert.deepEqual(cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
});
test('单位化拒绝退化方向', () => {
  assert.deepEqual(normalize([3, 0, 0]), [1, 0, 0]);
  assert.throws(() => normalize([0, 0, 0]));
  assert.throws(() => normalize([NaN, 1]));
});
test('带换行主元的逆矩阵还原点', () => {
  const a = [
      [0, 2, 3],
      [1, 4, 1],
      [2, 0, 1],
    ],
    inverseA = inverse(a);
  multiply(a, inverseA)
    .flat()
    .forEach((x, i) => assert.ok(Math.abs(x - identity(3).flat()[i]) < 1e-12));
  const p = [2, 5, -1];
  matVec(inverseA, matVec(a, p)).forEach((x, i) => assert.ok(Math.abs(x - p[i]) < 1e-12));
  assert.throws(() =>
    inverse([
      [1, 2],
      [2, 4],
    ]),
  );
});
test('随机种子产生可复现的 [0,1) 序列', () => {
  const a = random(43),
    b = random(43);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});
