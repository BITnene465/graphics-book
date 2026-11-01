import { Drawing, palette } from '../../figures/drawing.ts';
import { rectangle } from '../../figures/helpers.ts';
import { number, slider, choice } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { scheduleLanes, laneProgress } from './parallel.ts';

export const parallelFigure: FigureSpec = {
  id: 'parallel-lanes',
  chapter: '11',
  title: '相同工作量，怎样分配才少等待？',
  subtitle: '播放锁步循环；灰色是空闲通道，启动阶段不产生计算结果。',
  source: '/src/chapters/11-pipeline/parallel.ts',
  defaults: { lanes: 4, count: 30, heavy: 8, setup: 3, order: 'mixed' },
  initialProgress: 0.35,
  duration: 9,
  controls: [
    choice('lanes', '每组通道', [
      [2, '2'],
      [4, '4'],
      [8, '8'],
      [16, '16'],
    ]),
    choice('order', '任务编组', [
      ['mixed', '原顺序'],
      ['grouped', '按迭代数分组'],
    ]),
    slider('count', '任务数', 8, 48, 1),
    slider('heavy', '长任务迭代数', 1, 12, 1),
    slider('setup', '启动开销 / 周期', 0, 24, 1),
  ],
  compute(p, t) {
    const d = new Drawing(),
      n = number(p, 'count'),
      lanes = number(p, 'lanes'),
      tasks = Array.from({ length: n }, (_, id) => ({
        id,
        cost: id % 4 === 0 ? number(p, 'heavy') : 1,
      })),
      ordered = p.order === 'grouped' ? [...tasks].sort((a, b) => b.cost - a.cost) : tasks,
      schedule = scheduleLanes(
        ordered.map((x) => x.cost),
        lanes,
        number(p, 'setup'),
      ),
      time = t * schedule.total,
      progress = laneProgress(schedule, time),
      byId = Array(n).fill(0);
    ordered.forEach((task, i) => {
      byId[task.id] = progress[i];
    });
    const rows = Math.ceil(n / 6);
    d.panel('每个任务的有效迭代', [-0.4, 6.4, -0.4, rows + 0.8], () => {
      tasks.forEach((task) => {
        const x = task.id % 6,
          y = rows - 1 - Math.floor(task.id / 6),
          done = byId[task.id],
          complete = done === task.cost;
        rectangle(d, [x + 0.07, y + 0.07], [0.86, 0.86], palette.muted, 0.15);
        rectangle(
          d,
          [x + 0.07, y + 0.07],
          [0.86, (0.86 * done) / task.cost],
          complete ? palette.green : palette.blue,
          0.7,
        );
        d.text([x + 0.14, y + 0.5], `${done}/${task.cost}`, palette.ink, 11);
      });
      d.text([0.1, rows + 0.4], '每格：已完成 / 所需迭代', palette.muted, 12);
    });
    d.panel(
      '锁步通道的执行时间',
      [-0.5, 8.7, -0.6, 6.2],
      () => {
        const scale = 8 / schedule.total,
          dy = 5 / lanes;
        rectangle(d, [0, 0], [number(p, 'setup') * scale, 5], palette.muted, 0.15);
        schedule.groups.forEach((group) => {
          for (let lane = 0; lane < lanes; lane++) {
            const y = 5 - (lane + 1) * dy,
              cost = group.costs[lane] ?? 0;
            rectangle(
              d,
              [group.start * scale, y],
              [group.duration * scale, dy * 0.9],
              palette.muted,
              0.13,
            );
            rectangle(d, [group.start * scale, y], [cost * scale, dy * 0.9], palette.blue, 0.65);
            const done = Math.min(cost, Math.max(0, Math.floor(time - group.start)));
            if (done)
              rectangle(d, [group.start * scale, y], [done * scale, dy * 0.9], palette.green, 0.8);
          }
        });
        d.line(
          [
            [time * scale, -0.1],
            [time * scale, 5.2],
          ],
          palette.yellow,
          2,
        );
        d.text([0, 5.75], '示意机器 · 每次运行一个通道组', palette.muted, 12);
        for (let i = 0; i <= 4; i++)
          d.text([2 * i - 0.1, -0.3], ((schedule.total * i) / 4).toFixed(1), palette.muted, 11);
        d.text([5.9, 5.35], '横轴：模拟周期', palette.muted, 11);
      },
      1.45,
    );
    d.values = {
      总有效迭代: schedule.work,
      锁步计算周期: schedule.cycles,
      含启动总周期: schedule.total,
      通道利用率: schedule.utilization,
      模型加速比: schedule.work / schedule.total,
      已完成任务: tasks.filter((x) => byId[x.id] === x.cost).length,
    };
    d.formula =
      'T=T_{setup}+\\sum_g\\max_{i\\in g}c_i,\\quad\\eta=\\frac{\\sum_i c_i}{L(T-T_{setup})}';
    return d.result();
  },
};
