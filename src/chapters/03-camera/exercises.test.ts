import test from 'node:test';
import assert from 'node:assert/strict';
import { close } from '../../exercises/assert.ts';
import * as solutions from './solutions.ts';
import * as student from './exercises.ts';
const f = process.env.GRAPHICS_EXERCISES === 'student' ? student : solutions;

test('相似三角形：手算、尺度不变与相机背后', () => {
  close(f.projectXY([2, 1, -4], 90, 2), [0.25, 0.25]);
  close(f.projectXY([4, 2, -8], 90, 2), [0.25, 0.25]);
  assert.throws(() => f.projectXY([1, 1, 1], 90, 1));
});
test('半空间裁剪：穿越、反向、外部与边界', () => {
  close(f.clipOnePlane([-1, 0, 0, 1], [3, 0, 0, 1], [1, 0, 0, 0]), [
    [0, 0, 0, 1],
    [3, 0, 0, 1],
  ]);
  close(f.clipOnePlane([3, 0, 0, 1], [-1, 0, 0, 1], [1, 0, 0, 0]), [
    [3, 0, 0, 1],
    [0, 0, 0, 1],
  ]);
  assert.equal(f.clipOnePlane([-2, 0, 0, 1], [-1, 0, 0, 1], [1, 0, 0, 0]), null);
  close(f.clipOnePlane([0, 0, 0, 1], [0, 1, 0, 1], [1, 0, 0, 0]), [
    [0, 0, 0, 1],
    [0, 1, 0, 1],
  ]);
});
