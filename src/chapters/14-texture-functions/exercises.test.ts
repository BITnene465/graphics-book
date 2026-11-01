import test from 'node:test';
import assert from 'node:assert/strict';
import { close } from '../../exercises/assert.ts';
import * as solutions from './solutions.ts';
import * as student from './exercises.ts';
const f = process.env.GRAPHICS_EXERCISES === 'student' ? student : solutions;

test('经纬度：赤道四向与极点', () => {
  close(f.directionUV([1, 0, 0]), [0, 0.5]);
  close(f.directionUV([0, 0, 1]), [0.25, 0.5]);
  close(f.directionUV([0, 0, -1]), [0.75, 0.5]);
  close(f.directionUV([0, 2, 0])[1], 0);
  close(f.directionUV([0, -1, 0])[1], 1);
});
test('多频加权：常量、gain=0 与手算', () => {
  close(f.octaveAverage([0.3, 0.3, 0.3], 0.5), 0.3);
  close(f.octaveAverage([0.2, 0.8, 1], 0), 0.2);
  close(f.octaveAverage([0, 1, 0], 0.5), 2 / 7);
  assert.throws(() => f.octaveAverage([], 0.5));
});
