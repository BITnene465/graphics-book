import { Drawing, palette, circle } from '../../figures/drawing.ts';
import { plot } from '../../figures/helpers.ts';
import { slider, choice, number, points } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';

import { evaluate, deCasteljau, derivative, arcLengthParameters } from './core.ts';
import {
  cubicJoin,
  joinDiagnostics,
  evaluateBSpline,
  bsplineBasis,
  rationalBezier,
} from './splines.ts';
import type { Continuity } from './splines.ts';

const source = '/src/chapters/11-bezier/',
  control = [
    [-2, -1],
    [-1, 2],
    [1, 2],
    [2, -1],
  ],
  colors = [palette.muted, palette.blue, palette.green, palette.yellow];
function curve(d: Drawing, p: number[][], color = palette.blue): void {
  d.line(
    Array.from({ length: 101 }, (_, i) => evaluate(p, i / 100)),
    color,
    2.6,
  );
}
function handles(d: Drawing, p: number[][], key = 'points'): void {
  d.line(p, palette.muted, 1, 1, true);
  p.forEach((v, i) => d.handle(v, key, `P${i}`, { index: i }));
}
export const figures: FigureSpec[] = [
  {
    id: 'casteljau-steps',
    chapter: '11',
    title: '重复线性插值，就得到一条曲线',
    subtitle: '拖动控制点；播放观察每一层插值如何收敛到 C(t)。',
    source: source + 'core.ts',
    defaults: { points: control },
    controls: [],
    compute(p, t) {
      const d = new Drawing([-3, 3, -1.7, 2.6]),
        control = points(p, 'points'),
        levels = deCasteljau(control, t);
      curve(d, control);
      handles(d, control);
      levels.slice(1).forEach((level, i) => {
        d.line(level, colors[i + 1], 2);
        level.forEach((p) => d.dot(p, colors[i + 1], 0.045));
      });
      d.values = { '参数 t': t, 曲线位置: levels.at(-1)![0] };
      d.formula = 'P_i^{(k)}=(1-t)P_i^{(k-1)}+tP_{i+1}^{(k-1)}';
      return d.result();
    },
  },
  {
    id: 'bezier-tangent',
    chapter: '11',
    title: '参数匀速，不等于空间匀速',
    subtitle: '黄色点按参数移动，绿色点按近似弧长移动；导数表示瞬时速度。',
    source: source + 'core.ts',
    defaults: { points: control },
    controls: [],
    compute(p, t) {
      const d = new Drawing([-3, 3, -1.7, 2.6]),
        control = points(p, 'points'),
        at = evaluate(control, t),
        v = derivative(control, t),
        arc = arcLengthParameters(control, [t])[0];
      curve(d, control);
      handles(d, control);
      d.dot(at, palette.yellow, 0.075);
      d.dot(evaluate(control, arc), palette.green, 0.065);
      d.arrow(
        at,
        at.map((x, i) => x + v[i] * 0.15),
        palette.yellow,
        'C′',
      );
      d.values = { '参数 t': t, '弧长反查 t': arc, 速度大小: Math.hypot(...v) };
      d.formula = "C'(t)=n\\sum_{i=0}^{n-1}B_i^{n-1}(t)(P_{i+1}-P_i)";
      return d.result();
    },
  },
  {
    id: 'spline-join',
    chapter: '11',
    title: '位置连续、方向连续与导数连续',
    subtitle: '固定左段，用不同约束重建右段的必要控制点。',
    source: source + 'splines.ts',
    defaults: {
      left: [
        [-3, -0.8],
        [-2, 1],
        [-1, -0.5],
        [0, 0],
      ],
      right: [
        [0.2, 0.3],
        [0.6, 1.7],
        [2, 0.4],
        [3, 1],
      ],
      mode: 'C0',
      leftSpan: 1,
      rightSpan: 1,
      scale: 1.5,
    },
    controls: [
      choice('mode', '拼接', [
        ['free', '自由'],
        ['C0', 'C⁰'],
        ['G1', 'G¹'],
        ['C1', 'C¹'],
        ['C2', 'C²'],
      ]),
      slider('leftSpan', '左段跨度', 0.2, 3, 0.05),
      slider('rightSpan', '右段跨度', 0.2, 3, 0.05),
      slider('scale', 'G¹ 切线倍率', 0.2, 3, 0.05),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-4, 4, -2.4, 3]),
        joined = cubicJoin(
          points(p, 'left'),
          points(p, 'right'),
          p.mode as Continuity,
          number(p, 'leftSpan'),
          number(p, 'rightSpan'),
          number(p, 'scale'),
        ),
        diag = joinDiagnostics(
          joined.left,
          joined.right,
          number(p, 'leftSpan'),
          number(p, 'rightSpan'),
        );
      curve(d, joined.left, palette.blue);
      curve(d, joined.right, palette.green);
      handles(d, joined.left, 'left');
      handles(d, points(p, 'right'), 'right');
      d.line(joined.right, palette.green, 1, 1, true);
      joined.right.forEach((q) => d.dot(q, palette.green, 0.035));
      d.values = {
        'C⁰': diag.c0,
        'G¹': diag.g1,
        'C¹': diag.c1,
        'C²': diag.c2,
        速度差: Math.hypot(...diag.velocityGap),
        加速度差: Math.hypot(...diag.accelerationGap),
      };
      return d.result();
    },
  },
  {
    id: 'bspline-local',
    chapter: '11',
    title: '只影响局部的控制点',
    subtitle: '拖动控制点，观察基函数支持范围与曲线变化之间的对应。',
    source: source + 'splines.ts',
    defaults: {
      points: [
        [-3, 0],
        [-2, 1],
        [-1, -0.5],
        [0, 1.5],
        [1, -1],
        [2, 1],
        [3, 0],
      ],
      u: 1.8,
      selected: 3,
    },
    controls: [slider('u', '活动参数 u', 0, 4, 0.01), slider('selected', '检查控制点', 0, 6, 1)],
    animated: false,
    compute(p) {
      const d = new Drawing(),
        control = points(p, 'points'),
        knots = [0, 0, 0, 0, 1, 2, 3, 4, 4, 4, 4],
        u = number(p, 'u'),
        selected = number(p, 'selected'),
        b = bsplineBasis(knots, 3, u);
      d.panel('曲线', [-3.6, 3.6, -1.6, 2.1], () => {
        handles(d, control);
        d.line(
          Array.from({ length: 161 }, (_, i) => evaluateBSpline(control, knots, 3, i / 40)),
          palette.green,
          2.5,
        );
        d.dot(evaluateBSpline(control, knots, 3, u), palette.yellow, 0.07);
      });
      d.panel('基函数', [-0.2, 4.2, -0.15, 1.1], () => {
        d.axes(0, 4, 0, 1);
        for (let j = 0; j < control.length; j++)
          plot(
            d,
            (x) => bsplineBasis(knots, 3, x)[j],
            [0, 4],
            j === selected ? palette.yellow : palette.muted,
            180,
          );
        d.dot([u, b[selected]], palette.yellow, 0.03);
      });
      d.values = {
        基函数权重: b,
        权重和: b.reduce((a, b) => a + b, 0),
        选中控制点权重: b[selected],
      };
      return d.result();
    },
  },
  {
    id: 'rational-arc',
    chapter: '11',
    title: '一个权重把二次曲线变成圆弧',
    subtitle: '中间控制点权重为 √2/2 时，曲线精确落在单位圆上。',
    source: source + 'splines.ts',
    defaults: { weight: Math.SQRT1_2 },
    controls: [slider('weight', '中间权重', 0.05, 3, 0.001)],
    animated: false,
    compute(p) {
      const d = new Drawing([-0.2, 1.4, -0.2, 1.4]),
        control = [
          [1, 0],
          [1, 1],
          [0, 1],
        ],
        w = number(p, 'weight'),
        curve = Array.from({ length: 101 }, (_, i) => rationalBezier(control, [1, w, 1], i / 100));
      d.line(circle([0, 0], 1), palette.muted, 1, 1, true);
      d.line(control, palette.muted, 1);
      d.line(curve, palette.green, 3);
      control.forEach((q, i) => {
        d.dot(q, palette.yellow, 0.025);
        d.text([q[0] + 0.04, q[1] + 0.07], `P${i}`, palette.ink, 12);
      });
      d.values = {
        中间权重: w,
        圆弧所需权重: Math.SQRT1_2,
        最大径向偏差: Math.max(...curve.map((p) => Math.abs(Math.hypot(...p) - 1))),
      };
      d.formula = 'C(t)=\\frac{\\sum_i B_i(t)w_iP_i}{\\sum_i B_i(t)w_i}';
      return d.result();
    },
  },
];
export const main: FigureSpec = {
  ...figures[0],
  id: 'main',
  title: '编辑一条 Bézier 曲线',
  subtitle: '控制多边形、构造过程、曲线位置与导数来自同一份控制点。',
};
