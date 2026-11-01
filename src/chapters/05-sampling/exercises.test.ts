import test from 'node:test';
import assert from 'node:assert/strict';
import { close } from '../../exercises/assert.ts';
import * as solutions from './solutions.ts';
import * as student from './exercises.ts';
const f = process.env.GRAPHICS_EXERCISES === 'student' ? student : solutions;

test('盒式平均：常数、独立和、空集', () => {
  close(
    f.boxAverage([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]),
    [1 / 3, 1 / 3, 1 / 3],
  );
  close(
    f.boxAverage([
      [0.2, 0.2, 0.2],
      [0.2, 0.2, 0.2],
    ]),
    [0.2, 0.2, 0.2],
  );
  assert.throws(() => f.boxAverage([]));
});
test('频率折叠：方向、周期性与 Nyquist 边界', () => {
  close(f.equivalentFrequency(7, 10), -3);
  close(f.equivalentFrequency(27, 10), -3);
  close(f.equivalentFrequency(-7, 10), 3);
  close(f.equivalentFrequency(5, 10), -5);
  assert.throws(() => f.equivalentFrequency(1, 0));
});
