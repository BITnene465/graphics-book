import test from 'node:test';

import { close } from '../../exercises/assert.ts';
import * as solutions from './solutions.ts';
import * as student from './exercises.ts';
const f = process.env.GRAPHICS_EXERCISES === 'student' ? student : solutions;

test('透视 UV：w 相等退化成仿射，不相等按倒数加权', () => {
  close(
    f.correctUV(
      [0.5, 0.5, 0],
      [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      [1, 4, 2],
    ),
    [0.2, 0],
  );
  close(
    f.correctUV(
      [0.25, 0.25, 0.5],
      [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      [2, 2, 2],
    ),
    [0.25, 0.5],
  );
});
test('双线性：角点与独立四项和', () => {
  close(f.bilinear([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.25, 0.5), [0.125, 0.375, 0.125]);
  close(f.bilinear([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], 1, 1), [0, 0, 1]);
});
test('LOD 混合只使用小数部分', () => {
  close(f.lodBlend([0, 0, 0], [1, 1, 1], 2.25), [0.25, 0.25, 0.25]);
  close(f.lodBlend([0.2, 0.3, 0.4], [1, 1, 1], 3), [0.2, 0.3, 0.4]);
});
