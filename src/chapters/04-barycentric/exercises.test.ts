import test from 'node:test';
import assert from 'node:assert/strict';
import { close } from '../../exercises/assert.ts';
import * as solutions from './solutions.ts';
import * as student from './exercises.ts';
const f = process.env.GRAPHICS_EXERCISES === 'student' ? student : solutions;

test('有向面积：符号与共线', () => {
  close(f.signedArea([0, 0], [2, 0], [0, 2]), 2);
  close(f.signedArea([0, 0], [0, 2], [2, 0]), -2);
  close(f.signedArea([0, 0], [1, 1], [2, 2]), 0);
});
test('重心坐标：内、外、顶点和退化', () => {
  close(
    f.weights(
      [0.5, 0.5],
      [
        [0, 0],
        [2, 0],
        [0, 2],
      ],
    ),
    [0.5, 0.25, 0.25],
  );
  close(
    f.weights(
      [3, 0],
      [
        [0, 0],
        [2, 0],
        [0, 2],
      ],
    ),
    [-0.5, 1.5, 0],
  );
  close(
    f.weights(
      [0, 2],
      [
        [0, 0],
        [2, 0],
        [0, 2],
      ],
    ),
    [0, 0, 1],
  );
  assert.throws(() =>
    f.weights(
      [0, 0],
      [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
    ),
  );
});
