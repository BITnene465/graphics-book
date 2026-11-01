import { Drawing, palette } from '../../figures/drawing.ts';
import { points, number, slider } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { hermite, hermiteBezier, deBoor } from './interpolation.ts';
import { evaluate } from './core.ts';
import { evaluateBSpline } from './splines.ts';

export const interpolationFigures: FigureSpec[] = [
  {
    id: 'hermite-tangents',
    chapter: '13',
    title: '规定经过哪里，也规定如何出发和到达',
    subtitle: '端点与切向手柄均可拖动；绿色 Bézier 控制点表示完全相同的曲线。',
    source: '/src/chapters/13-bezier/interpolation.ts',
    defaults: {
      ends: [
        [-2, -0.8],
        [2, 0.6],
      ],
      tangents: [
        [1.5, 2.3],
        [2, -1.5],
      ],
    },
    controls: [],
    initialProgress: 0.5,
    compute(p, t) {
      const d = new Drawing([-3.7, 3.7, -2.5, 3.2]),
        ends = points(p, 'ends'),
        tangents = points(p, 'tangents');
      const control = hermiteBezier(ends[0], ends[1], tangents[0], tangents[1]);
      d.line(control, palette.green, 1, 0.8, true);
      control.forEach((q) => d.dot(q, palette.green, 0.045));
      d.line(
        Array.from({ length: 101 }, (_, i) =>
          hermite(ends[0], ends[1], tangents[0], tangents[1], i / 100),
        ),
        palette.blue,
        2.5,
      );
      for (let i = 0; i < 2; i++) {
        const end = ends[i],
          handle = end.map((x, k) => x + tangents[i][k] / 3);
        d.arrow(end, handle, palette.yellow, `T${i}/3`);
        d.handle(end, 'ends', `P${i}`, { index: i, limits: [-2.7, 2.7, -1.4, 1.8] });
        d.handle(handle, 'tangents', `T${i}`, {
          index: i,
          mapping: { offset: end, scale: [1 / 3, 1 / 3] },
          limits: [-3, 3, -3, 3],
        });
      }
      const value = hermite(ends[0], ends[1], tangents[0], tangents[1], t),
        other = evaluate(control, t);
      d.dot(value, palette.yellow, 0.07);
      d.values = {
        '参数 t': t,
        曲线点: value,
        两种表示差: Math.hypot(...value.map((x, i) => x - other[i])),
        起点导数: tangents[0],
        终点导数: tangents[1],
      };
      d.formula = 'B_1=P_0+T_0/3,\\quad B_2=P_1-T_1/3';
      return d.result();
    },
  },
  {
    id: 'deboor-steps',
    chapter: '13',
    title: '只取局部控制点，也能逐层求出同一个点',
    subtitle: '拖动控制点；改变 u，观察当前结点区间和 de Boor 插值层。',
    source: '/src/chapters/13-bezier/interpolation.ts',
    defaults: {
      points: [
        [-3, 0],
        [-2, 1.4],
        [-1, -1],
        [0, 1.6],
        [1, -1],
        [2, 1.2],
        [3, 0],
      ],
      u: 1.7,
    },
    controls: [slider('u', '结点参数 u', 0, 4, 0.01)],
    animated: false,
    compute(p) {
      const d = new Drawing([-3.7, 3.7, -1.8, 2.2]),
        control = points(p, 'points'),
        knots = [0, 0, 0, 0, 1, 2, 3, 4, 4, 4, 4],
        u = number(p, 'u');
      const result = deBoor(control, knots, 3, u),
        reference = evaluateBSpline(control, knots, 3, u);
      d.line(control, palette.muted, 1, 0.6, true);
      d.line(
        Array.from({ length: 121 }, (_, i) => deBoor(control, knots, 3, i / 30).point),
        palette.blue,
        2,
      );
      result.levels.forEach((level, i) => {
        const color = [palette.muted, palette.green, palette.red, palette.yellow][i];
        d.line(level, color, 2);
        level.forEach((q) => d.dot(q, color, 0.045 + i * 0.009));
      });
      control.forEach((q, index) =>
        d.handle(q, 'points', `P${index}`, { index, limits: [-3.5, 3.5, -1.5, 1.8] }),
      );
      d.values = {
        '区间 k': result.span,
        使用控制点: Array.from({ length: 4 }, (_, i) => result.span - 3 + i),
        曲线位置: result.point,
        与基函数求和之差: Math.hypot(...reference.map((x, i) => x - result.point[i])),
      };
      d.formula = 'd_j^{(r)}=(1-\\alpha)d_{j-1}^{(r-1)}+\\alpha d_j^{(r-1)}';
      return d.result();
    },
  },
];
