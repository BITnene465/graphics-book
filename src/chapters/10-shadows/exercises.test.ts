import test from 'node:test';
import assert from 'node:assert/strict';
import { close } from '../../exercises/assert.ts';
import * as solutions from './solutions.ts';
import * as student from './exercises.ts';
const f = process.env.GRAPHICS_EXERCISES === 'student' ? student : solutions;

test('光源 UV：上下方向、齐次缩放与非法 w', () => {
  close(f.lightCoordinates([0, 1, 0, 1]), [0.5, 0, 0.5]);
  close(f.lightCoordinates([0, 2, 0, 2]), [0.5, 0, 0.5]);
  assert.throws(() => f.lightCoordinates([1, 1, 1, 0]));
});
test('PCF：先比较再平均、偏移与无穷远背景', () => {
  close(f.percentageVisible(0.5, [0.2, 0.6, 0.7, Infinity]), 0.75);
  close(f.percentageVisible(0.5, [0.49, 0.51], 0.02), 1);
  close(f.percentageVisible(0.5, [0.1, 0.1, 0.1, 0.9]), 0.25);
});
