import { Drawing, palette } from '../../figures/drawing.ts';
import { plot, bitmap } from '../../figures/helpers.ts';
import { slider, choice, number } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import {
  depthFromDistance,
  distanceFromDepth,
  quantizeDepth,
  clipVertices,
  render,
} from './core.ts';
import type { Triangle2 } from '../04-barycentric/core.ts';

export const figures: FigureSpec[] = [
  {
    id: 'depth-order',
    chapter: '05',
    title: '一整张面没有统一的前后顺序',
    subtitle: '两张相交斜面逐像素竞争；平均深度排序无法正确处理交叉。',
    source: '/src/chapters/05-depth/core.ts',
    defaults: { slope: 2, method: 'zbuffer', order: 'AB' },
    controls: [
      slider('slope', '深度起伏', 0, 3, 0.02),
      choice('method', '判定', [
        ['zbuffer', 'Z-buffer'],
        ['painter', '平均深度排序'],
      ]),
      choice('order', '提交顺序', [
        ['AB', 'A → B'],
        ['BA', 'B → A'],
      ]),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-1.1, 1.1, -1.1, 1.1]),
        xy: Triangle2 = [
          [-0.9, -0.8],
          [0.9, -0.8],
          [0, 0.9],
        ],
        s = number(p, 'slope'),
        triangles = [
          clipVertices(xy, [4 - s, 4 + s, 4], 0.1, 20),
          clipVertices(xy, [4 + s, 4 - s, 4.3], 0.1, 20),
        ];
      const frame = render(
        triangles,
        [
          [0.15, 0.42, 0.65],
          [0.16, 0.55, 0.33],
        ],
        96,
        96,
        { method: p.method as 'zbuffer' | 'painter', order: p.order === 'AB' ? [0, 1] : [1, 0] },
      );
      bitmap(d, { width: 96, height: 96, data: frame.color }, [-1, -1], [2, 2], true);
      d.values = {
        'A 可见像素': frame.owner.filter((x) => x === 0).length,
        'B 可见像素': frame.owner.filter((x) => x === 1).length,
      };
      d.formula = 'D_{new}<D_{stored}';
      return d.result();
    },
  },
  {
    id: 'depth-precision',
    chapter: '05',
    title: '深度刻度在远处越来越稀疏',
    subtitle: '近裁剪面决定大部分精度分配；查看相邻深度值对应的实际距离。',
    source: '/src/chapters/05-depth/core.ts',
    defaults: { near: 0.1, far: 50, bits: 8, distance: 20 },
    controls: [
      slider('near', '近平面', 0.01, 3, 0.01),
      slider('far', '远平面', 10, 100, 1),
      slider('distance', '观察距离', 3, 50, 0.1),
      choice('bits', '定点位数', [
        [4, '4'],
        [8, '8'],
        [16, '16'],
        [24, '24'],
      ]),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-0.1, 1.15, -0.15, 1.2]),
        n = number(p, 'near'),
        f = number(p, 'far'),
        distance = Math.min(f, number(p, 'distance')),
        bits = number(p, 'bits'),
        depth = depthFromDistance(distance, n, f),
        stored = quantizeDepth(depth, bits),
        step = 1 / (2 ** bits - 1),
        next = Math.min(1, stored + step);
      d.axes(0, 1, 0, 1);
      plot(d, (x) => depthFromDistance(n + (f - n) * x, n, f), [0, 1], palette.blue);
      d.dot([(distance - n) / (f - n), depth], palette.yellow, 0.018);
      for (let i = 0; i <= 16; i++) {
        const value = i / 16,
          x = (distanceFromDepth(value, n, f) - n) / (f - n);
        d.line(
          [
            [x, -0.04],
            [x, 0.035],
          ],
          palette.green,
          1,
        );
      }
      d.values = {
        存储深度: stored,
        还原距离: distanceFromDepth(stored, n, f),
        下一刻度距离差: distanceFromDepth(next, n, f) - distanceFromDepth(stored, n, f),
      };
      d.formula = 'D(d)=\\frac{f}{f-n}-\\frac{fn}{(f-n)d}';
      return d.result();
    },
  },
];
