import test from 'node:test';

import { close } from '../../exercises/assert.ts';
import * as solutions from './solutions.ts';
import * as student from './exercises.ts';
const f = process.env.GRAPHICS_EXERCISES === 'student' ? student : solutions;

test('属性恢复：倒数 w 与常数保持', () => {
  close(
    f.recoverAttribute(
      [0.5, 0.5, 0],
      [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      [1, 0.25, 0.5],
    ),
    [0.2, 0],
  );
  close(
    f.recoverAttribute(
      [0.2, 0.3, 0.5],
      [
        [4, 2],
        [4, 2],
        [4, 2],
      ],
      [1, 0.25, 0.5],
    ),
    [4, 2],
  );
});
test('线性 source-over：透明、不透明与顺序', () => {
  close(f.blendLinear([1, 0, 0], [0, 0, 1], 0.25), [0.25, 0, 0.75]);
  close(f.blendLinear([1, 0, 0], [0, 0, 1], 0), [0, 0, 1]);
  close(f.blendLinear([1, 0, 0], [0, 0, 1], 1), [1, 0, 0]);
});
