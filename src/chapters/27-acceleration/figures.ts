import { Drawing, palette, circle } from '../../figures/drawing.ts';
import { slider, number, vec2, choice } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec3 } from '../../math/vector.ts';
import { random } from '../../math/vector.ts';
import { buildBVH, intersectBVH, boxInterval } from './core.ts';
export const figures: FigureSpec[] = [
  {
    id: 'bvh-traversal',
    chapter: '27',
    title: '先问包围盒，再问图元',
    subtitle: '拖动射线目标点，观察被访问的包围盒和实际求交数量。',
    source: '/src/chapters/27-acceleration/core.ts',
    animated: false,
    defaults: { target: [2, 0.7], count: 32, seed: 3, boxes: 'visited' },
    controls: [
      slider('count', '球体数', 8, 96, 8),
      slider('seed', '布局种子', 1, 20, 1),
      choice('boxes', '包围盒', [
        ['visited', '通过测试的节点'],
        ['root', '根节点'],
      ]),
    ],
    compute(p) {
      const d = new Drawing([-3.7, 3.2, -2.3, 2.3]),
        rng = random(number(p, 'seed')),
        balls = Array.from({ length: number(p, 'count') }, () => ({
          center: [-2 + 4.5 * rng(), -1.6 + 3.2 * rng(), 0] as Vec3,
          radius: 0.08 + 0.1 * rng(),
        })),
        root = buildBVH(balls),
        target = vec2(p, 'target'),
        o: Vec3 = [-3.3, 0, 0],
        dir: Vec3 = [target[0] - o[0], target[1], 0],
        hit = intersectBVH(o, dir, balls, root);
      balls.forEach((b, i) =>
        d.line(
          circle([b.center[0], b.center[1]], b.radius, 24),
          i === hit.id ? palette.red : palette.muted,
          1.5,
        ),
      );
      for (const box of p.boxes === 'root' ? [root] : hit.visited)
        d.line(
          [
            [box.min[0], box.min[1]],
            [box.max[0], box.min[1]],
            [box.max[0], box.max[1]],
            [box.min[0], box.max[1]],
            [box.min[0], box.min[1]],
          ],
          palette.green,
          0.8,
          0.45,
        );
      d.line(
        [
          [o[0], o[1]],
          [o[0] + 2 * dir[0], 2 * dir[1]],
        ],
        palette.yellow,
        2,
      );
      d.handle(target, 'target', '射线方向', { limits: [-2.8, 2.8, -2, 2] });
      d.values = {
        图元总数: balls.length,
        实际球求交次数: hit.primitives,
        节点盒测试次数: hit.boxes,
        最近命中: hit.id < 0 ? '无' : hit.id,
      };
      return d.result();
    },
  },
  {
    id: 'ray-box-slabs',
    chapter: '27',
    title: '三组区间的交集',
    subtitle: '拖动方向点，观察平行、穿过与错过包围盒。',
    source: '/src/chapters/27-acceleration/core.ts',
    animated: false,
    defaults: { target: [2, 0.6] },
    controls: [],
    compute(p) {
      const d = new Drawing([-2.5, 3, -1.8, 1.8]),
        t = vec2(p, 'target'),
        o: Vec3 = [-2, 0, 0],
        v: Vec3 = [t[0] + 2, t[1], 0],
        box = { min: [-0.5, -0.8, -0.5] as Vec3, max: [1, 0.8, 0.5] as Vec3 },
        interval = boxInterval(o, v, box);
      d.polygon(
        [
          [-0.5, -0.8],
          [1, -0.8],
          [1, 0.8],
          [-0.5, 0.8],
        ],
        palette.blue,
        0.15,
      );
      d.line(
        [
          [-2, 0],
          [o[0] + 2 * v[0], 2 * v[1]],
        ],
        palette.yellow,
        2,
      );
      if (interval)
        d.line(
          interval.map((x) => [o[0] + x * v[0], x * v[1]]),
          palette.green,
          5,
        );
      d.handle(t, 'target', '方向点', { limits: [-2.4, 2.8, -1.6, 1.6] });
      d.values = { 射线参数区间: interval ?? '空集', 方向已单位化: false };
      return d.result();
    },
  },
];
