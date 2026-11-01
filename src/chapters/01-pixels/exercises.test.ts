import test from 'node:test';
import assert from 'node:assert/strict';
import { close } from '../../exercises/assert.ts';
import * as solutions from './solutions.ts';
import * as student from './exercises.ts';
const f = process.env.GRAPHICS_EXERCISES === 'student' ? student : solutions;

test('像素中心：方向、非正方形与非法尺寸', () => {
  close(f.centers(2, 2), [
    [0.25, 0.75],
    [0.75, 0.75],
    [0.25, 0.25],
    [0.75, 0.25],
  ]);
  close(f.centers(1, 2), [
    [0.5, 0.75],
    [0.5, 0.25],
  ]);
  assert.throws(() => f.centers(0, 1));
});
test('线性黑白混合：端点、暗部与中间灰', () => {
  close(f.mixBlackWhite(0), 0);
  close(f.mixBlackWhite(1), 1);
  close(f.mixBlackWhite(0.5), 0.7353569830524495);
  close(f.mixBlackWhite(0.001), 0.01292);
});
