import test from 'node:test';
import assert from 'node:assert/strict';
import { EditHistory } from './history.ts';

test('撤销与重做保存独立快照，新编辑会结束旧重做分支', () => {
  const history = new EditHistory<{ point: number[] }>();
  const state = { point: [1, 2] };
  history.remember(state);
  state.point[0] = 8;
  const original = history.undo(state)!;
  assert.deepEqual(original.point, [1, 2]);
  state.point[0] = 99;
  assert.deepEqual(history.redo(original)!.point, [8, 2]);
  history.undo({ point: [8, 2] });
  history.remember({ point: [3, 4] });
  assert.equal(history.canRedo, false);
  assert.equal(history.redo({ point: [5, 6] }), undefined);
});
