import { incrementalFigures } from './incremental-figures.ts';
import { Drawing, palette } from '../../figures/drawing.ts';
import { grid, rgb } from '../../figures/helpers.ts';
import { number, vec2, points, slider, choice } from '../../figures/spec.ts';
import type { FigureSpec, Params } from '../../figures/spec.ts';
import type { Vec2 } from '../../math/vector.ts';
import { barycentric, isInside } from './core.ts';
import type { Triangle2 } from './core.ts';
import { triangleCoverage } from './raster.ts';

const defaults = {
  vertices: [
    [-1.5, -1],
    [1.6, -0.7],
    [-0.2, 1.6],
  ],
  point: [0.1, 0.1],
};
function areaFrame(p: Params) {
  const d = new Drawing([-2.6, 2.6, -1.9, 2.2]),
    vertices = points(p, 'vertices') as Triangle2,
    point = vec2(p, 'point'),
    weights = barycentric(point, vertices),
    colors = [palette.blue, palette.green, palette.red];
  grid(d, [-2.6, 2.6, -1.9, 2.2], 0.5);
  for (let i = 0; i < 3; i++) {
    d.polygon([point, vertices[(i + 1) % 3], vertices[(i + 2) % 3]], colors[i], 0.2);
    d.handle(vertices[i], 'vertices', ['A', 'B', 'C'][i], { index: i });
  }
  d.line([...vertices, vertices[0]], palette.ink, 2);
  d.handle(point, 'point', 'P');
  d.values = {
    'λ A': weights[0],
    'λ B': weights[1],
    'λ C': weights[2],
    总和: weights.reduce((a, b) => a + b, 0),
    在三角形内: isInside(weights),
  };
  d.formula = 'P=\\lambda_A A+\\lambda_B B+\\lambda_C C,\\quad\\sum_i\\lambda_i=1';
  return d;
}
export const figures: FigureSpec[] = [
  deskFigure,
  {
    id: 'barycentric-area',
    chapter: '04',
    title: '用三个面积描述一个位置',
    subtitle: '顶点和探针都可拖动；三角形外的权重允许为负。',
    source: '/src/chapters/04-barycentric/core.ts',
    defaults,
    controls: [],
    animated: false,
    compute: (p) => areaFrame(p).result(),
  },
  {
    id: 'edge-rule',
    chapter: '04',
    title: '共享边到底属于哪个三角形？',
    subtitle: '移动方形跨过像素中心，比较包含规则与 top-left 规则。',
    source: '/src/chapters/04-barycentric/raster.ts',
    defaults: { offset: 0.5, rule: 'top_left' },
    controls: [
      slider('offset', '亚像素平移', 0, 1, 0.01),
      choice('rule', '覆盖规则', [
        ['top_left', 'Top-left'],
        ['inclusive', '两侧都包含'],
      ]),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-0.5, 5, -0.5, 5]),
        o = number(p, 'offset'),
        vertices: Vec2[] = [
          [o, o],
          [o + 3, o],
          [o + 3, o + 3],
          [o, o + 3],
        ],
        triangles: Triangle2[] = [
          [vertices[0], vertices[1], vertices[2]],
          [vertices[0], vertices[2], vertices[3]],
        ],
        samples: Vec2[] = Array.from({ length: 25 }, (_, i) => [
          (i % 5) + 0.5,
          Math.floor(i / 5) + 0.5,
        ]);
      const result = triangles.map((t) =>
        triangleCoverage(t, samples, p.rule as 'top_left' | 'inclusive'),
      );
      grid(d, [-0.5, 5, -0.5, 5]);
      triangles.forEach((t, i) => {
        d.polygon(t, i ? palette.green : palette.blue, 0.12);
        d.line([...t, t[0]], i ? palette.green : palette.blue, 2);
      });
      let double = 0;
      result[0].covered.forEach((a, i) => {
        const b = result[1].covered[i],
          count = Number(a) + Number(b);
        double += Number(count === 2);
        d.dot(
          samples[i],
          count === 2 ? palette.red : a ? palette.blue : b ? palette.green : palette.muted,
          0.05,
        );
      });
      d.values = {
        重复覆盖: double,
        'A 样本': result[0].covered.filter(Boolean).length,
        'B 样本': result[1].covered.filter(Boolean).length,
      };
      return d.result();
    },
  },
  ...incrementalFigures,
];
export const main: FigureSpec = {
  id: 'main',
  chapter: '04',
  title: '三角形内的每个像素',
  subtitle: '同一份重心权重同时决定位置、颜色与覆盖。',
  source: '/src/chapters/04-barycentric/core.ts',
  defaults: { ...defaults, density: 30, mode: 'color' },
  controls: [
    slider('density', '采样密度', 8, 72, 1),
    choice('mode', '显示', [
      ['color', '颜色插值'],
      ['weights', '权重'],
      ['coverage', '覆盖'],
    ]),
  ],
  animated: false,
  compute(p) {
    const d = areaFrame(p),
      v = points(p, 'vertices') as Triangle2,
      n = number(p, 'density'),
      step = 4 / n;
    const fill = [];
    for (let y = -1.8; y < 2; y += step)
      for (let x = -2.2; x < 2.2; x += step) {
        const w = barycentric([x, y], v);
        if (!isInside(w)) continue;
        const color =
          p.mode === 'coverage'
            ? palette.green
            : rgb(p.mode === 'weights' ? [w[0], w[0], w[0]] : w);
        fill.push({ kind: 'circle' as const, at: [x, y], radius: step * 0.4, color, opacity: 1 });
      }
    d.items.unshift(...fill);
    return d.result();
  },
};
import { triangle as deskFigure } from '../../book-scene/surface-studies.ts';
