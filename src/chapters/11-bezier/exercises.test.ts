import test from 'node:test';
import assert from 'node:assert/strict';
import { close } from '../../exercises/assert.ts';
import * as solutions from './solutions.ts';
import * as student from './exercises.ts';
const f = process.env.GRAPHICS_EXERCISES === 'student' ? student : solutions;

test('de Casteljau：手算与输入不变', () => {
  const p = [
      [0, 0],
      [1, 2],
      [2, 0],
    ],
    copy = structuredClone(p);
  close(f.curvePoint(p, 0.5), [1, 1]);
  assert.deepEqual(p, copy);
  close(f.curvePoint(p, 0), [0, 0]);
});
test('端点导数保留速度，常数导数为零', () => {
  close(
    f.endpointTangents([
      [0, 0],
      [1, 2],
      [3, 2],
      [4, 0],
    ]),
    [
      [3, 6],
      [3, -6],
    ],
  );
  close(f.endpointTangents([[2, 3]]), [
    [0, 0],
    [0, 0],
  ]);
});
test('跨参数时长的 C1 手柄', () => {
  close(
    f.joinVelocityHandle(
      [
        [0, 0],
        [1, 0],
        [2, 1],
        [3, 1],
      ],
      2,
      1,
    ),
    [5, 1],
  );
});
test('有理权：归一化与统一缩放不变', () => {
  close(f.rationalWeights([0.25, 0.5, 0.25], [1, 2, 1]), [1 / 6, 2 / 3, 1 / 6]);
  close(f.rationalWeights([0.25, 0.5, 0.25], [3, 6, 3]), [1 / 6, 2 / 3, 1 / 6]);
});
