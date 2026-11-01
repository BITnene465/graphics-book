import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleLanes, laneProgress } from './parallel.ts';

test('锁步成本为每组最大迭代数，包含空通道与未满末组', () => {
  const schedule = scheduleLanes([1, 4, 2, 0, 3], 4, 2);
  assert.equal(schedule.work, 10);
  assert.equal(schedule.cycles, 7);
  assert.equal(schedule.total, 9);
  assert.equal(schedule.utilization, 10 / 28);
  assert.deepEqual(laneProgress(schedule, 3), [1, 1, 1, 0, 0]);
  assert.deepEqual(laneProgress(schedule, 9), [1, 4, 2, 0, 3]);
});
test('重排独立任务不改变总工作，却可能改变锁步闲置', () => {
  const mixed = scheduleLanes([1, 8, 1, 8, 1, 8, 1, 8], 4);
  const grouped = scheduleLanes([1, 1, 1, 1, 8, 8, 8, 8], 4);
  assert.equal(mixed.work, grouped.work);
  assert.equal(mixed.cycles, 16);
  assert.equal(grouped.cycles, 9);
  assert.equal(scheduleLanes([1, 8, 1, 8], 1).cycles, 18);
});
test('启动开销可能超过并行收益，零工作与非法输入有明确结果', () => {
  assert.ok(scheduleLanes([1, 1], 8, 3).total > 2);
  assert.equal(scheduleLanes([], 8).utilization, 0);
  assert.deepEqual(laneProgress(scheduleLanes([0, 0], 2), 0), [0, 0]);
  assert.throws(() => scheduleLanes([2.5], 4));
  assert.throws(() => scheduleLanes([1], 0));
});
