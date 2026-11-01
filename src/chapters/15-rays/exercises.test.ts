import test from 'node:test';
import assert from 'node:assert/strict';
import { close } from '../../exercises/assert.ts';
import * as solutions from './solutions.ts';
import * as student from './exercises.ts';
const f = process.env.GRAPHICS_EXERCISES === 'student' ? student : solutions;

test('球体根：非单位、球内、切线、背后和参数范围', () => {
  close(f.closestSphereT([0, 0, 3], [0, 0, -2], [0, 0, 0], 1), 1);
  close(f.closestSphereT([0, 0, 0], [0, 0, 2], [0, 0, 0], 1), 0.5);
  close(f.closestSphereT([1, 0, 3], [0, 0, -1], [0, 0, 0], 1), 3);
  assert.equal(f.closestSphereT([0, 0, 3], [0, 0, 1], [0, 0, 0], 1), null);
  assert.equal(f.closestSphereT([0, 0, 3], [0, 0, -1], [0, 0, 0], 1, 0, 1.9), null);
});
test('反射保长且两次反射恢复原向量', () => {
  close(f.reflected([2, -3, 0], [0, 1, 0]), [2, 3, 0]);
  close(f.reflected(f.reflected([2, -3, 0], [0, 1, 0]), [0, 1, 0]), [2, -3, 0]);
});
