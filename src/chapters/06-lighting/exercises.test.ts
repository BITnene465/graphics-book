import test from 'node:test';
import assert from 'node:assert/strict';
import { close } from '../../exercises/assert.ts';
import * as solutions from './solutions.ts';
import * as student from './exercises.ts';
const f = process.env.GRAPHICS_EXERCISES === 'student' ? student : solutions;

test('Lambert：归一化、背面、强度', () => {
  close(f.lambert([0, 0, 2], [0, 0, 8], [0.2, 0.4, 0.6], 2), [0.4, 0.8, 1.2]);
  close(f.lambert([0, 0, 1], [0, 0, -1], [1, 1, 1]), [0, 0, 0]);
});
test('法线逆转置：非均匀缩放的独立值', () => {
  close(
    f.transformedNormal(
      [
        [2, 0, 0],
        [0, 1, 0],
        [0, 0, 0.5],
      ],
      [1, 0, 1],
    ),
    [1 / Math.sqrt(17), 0, 4 / Math.sqrt(17)],
  );
  assert.throws(() =>
    f.transformedNormal(
      [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      [1, 0, 0],
    ),
  );
});
test('Gouraud 插值在线性颜色上进行', () => {
  close(
    f.gouraudColor(
      [0.25, 0.25, 0.5],
      [
        [0.2, 0.3, 0.8],
        [0.8, 0.1, 0.2],
        [0.4, 0.9, 0.6],
      ],
    ),
    [0.45, 0.55, 0.55],
  );
});
test('Phong 法线必须重新归一化', () => {
  close(
    f.phongNormal(
      [0.5, 0.5, 0],
      [
        [1, 0, 0],
        [0, 0, 1],
        [0, 1, 0],
      ],
    ),
    [Math.SQRT1_2, 0, Math.SQRT1_2],
  );
});
