import test from 'node:test';
import assert from 'node:assert/strict';
import { close } from '../../exercises/assert.ts';
import * as solutions from './solutions.ts';
import * as student from './exercises.ts';
const f = process.env.GRAPHICS_EXERCISES === 'student' ? student : solutions;

test('绕中心旋转：独立手算与中心不动', () => {
  close(f.rotateAbout([2, 1], [1, 1], Math.PI / 2), [1, 2]);
  close(f.rotateAbout([1, 1], [1, 1], 0.7), [1, 1]);
});
test('恢复仿射点：独立解与奇异输入', () => {
  close(
    f.recoverPoint(
      [
        [0, -2, 3],
        [1, 0, -1],
        [0, 0, 1],
      ],
      [-1, 0],
    ),
    [1, 2],
  );
  assert.throws(() =>
    f.recoverPoint(
      [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      [0, 1],
    ),
  );
});
