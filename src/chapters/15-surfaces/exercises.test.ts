import test from 'node:test';
import assert from 'node:assert/strict';
import { close } from '../../exercises/assert.ts';
import * as solutions from './solutions.ts';
import * as student from './exercises.ts';
const f = process.env.GRAPHICS_EXERCISES === 'student' ? student : solutions;

test('张量积：平面手算、边界和不改写输入', () => {
  const net = [
      [
        [0, 0, 0],
        [0, 2, 0],
      ],
      [
        [2, 0, 0],
        [2, 2, 0],
      ],
    ],
    copy = structuredClone(net);
  close(f.tensorPoint(net, 0.25, 0.75), [0.5, 1.5, 0]);
  close(f.tensorPoint(net, 0, 1), [0, 2, 0]);
  assert.deepEqual(net, copy);
});
test('曲面 C1：跨参数跨度的控制排', () => {
  close(
    f.c1ControlRow(
      [
        [
          [0, 0, 0],
          [0, 1, 0],
        ],
        [
          [1, 0, 1],
          [1, 1, 1],
        ],
      ],
      1,
      2,
    ),
    [
      [3, 0, 3],
      [3, 1, 3],
    ],
  );
  assert.throws(() => f.c1ControlRow([[[0, 0, 0]]], 1, 2));
});
