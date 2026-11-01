import test from 'node:test';
import assert from 'node:assert/strict';
import { close } from '../../exercises/assert.ts';
import * as solutions from './solutions.ts';
import * as student from './exercises.ts';
const f = process.env.GRAPHICS_EXERCISES === 'student' ? student : solutions;

test('椭球参数点：两极、轴端与隐函数', () => {
  close(f.ellipsoidPoint(0, 0, [2, 3, 4]), [0, 0, 4]);
  close(f.ellipsoidPoint(0, Math.PI / 2, [2, 3, 4]), [2, 0, 0]);
  const p = f.ellipsoidPoint(0.4, 0.8, [2, 3, 4]);
  close(
    p.reduce((s, x, i) => s + (x / [2, 3, 4][i]) ** 2, 0),
    1,
  );
});
test('椭球法线来自梯度', () => {
  close(f.ellipsoidNormal([2, 1, 0], [2, 1, 1]), [1 / Math.sqrt(5), 2 / Math.sqrt(5), 0]);
  assert.throws(() => f.ellipsoidNormal([1, 1, 1], [0, 1, 1]));
});
