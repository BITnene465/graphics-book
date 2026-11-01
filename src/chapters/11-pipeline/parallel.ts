import { finite } from '../../math/vector.ts';

/** 抽象锁步机器：同组通道共用循环步，组间顺序运行；不模拟具体 GPU。 */
export function scheduleLanes(iterations: number[], lanes: number, setup = 0) {
  finite([...iterations, setup]);
  if (
    !Number.isInteger(lanes) ||
    lanes < 1 ||
    lanes > 64 ||
    setup < 0 ||
    iterations.some((n) => !Number.isInteger(n) || n < 0)
  )
    throw new RangeError('通道为 1–64，任务迭代数为非负整数，启动开销非负');
  let cursor = setup;
  const groups = [];
  for (let i = 0; i < iterations.length; i += lanes) {
    const costs = iterations.slice(i, i + lanes),
      duration = Math.max(...costs);
    groups.push({ first: i, costs, start: cursor, duration, end: cursor + duration });
    cursor += duration;
  }
  const work = iterations.reduce((sum, n) => sum + n, 0),
    cycles = cursor - setup;
  return { groups, work, cycles, total: cursor, utilization: cycles ? work / (lanes * cycles) : 0 };
}

/** 在相同的模拟时刻查询任务进度；每步恰完成一次有效迭代。 */
export function laneProgress(schedule: ReturnType<typeof scheduleLanes>, time: number): number[] {
  finite([time]);
  return schedule.groups.flatMap((group) =>
    group.costs.map((cost) => Math.min(cost, Math.max(0, Math.floor(time - group.start)))),
  );
}
