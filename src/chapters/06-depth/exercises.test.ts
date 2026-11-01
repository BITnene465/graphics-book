import test from 'node:test';

import { close } from '../../exercises/assert.ts';
import * as solutions from './solutions.ts';
import * as student from './exercises.ts';
const f = process.env.GRAPHICS_EXERCISES === 'student' ? student : solutions;

test('深度不能进行二次校正', () => {
  close(f.pixelDepth([0.5, 0.5, 0], [2 / 9, 68 / 9, 8 / 3], [2, 8, 4]), 55 / 72);
  close(f.pixelDepth([1, 0, 0], [-1, 1, 1], [1, 1, 1]), 0);
  close(f.pixelDepth([0, 1, 0], [-1, 1, 1], [1, 1, 1]), 1);
});
test('可见性：次序、平局、背景与远平面', () => {
  close(f.nearestFragment([0.7, 0.2, 0.6], [3, 8, 1]), [0.2, 8]);
  close(f.nearestFragment([0.6, 0.2, 0.7], [1, 8, 3]), [0.2, 8]);
  close(f.nearestFragment([0.4, 0.4], [2, 9]), [0.4, 2]);
  close(f.nearestFragment([Infinity, 1], [-1, 7]), [1, 7]);
  close(f.nearestFragment([], []), [Infinity, -1]);
});
