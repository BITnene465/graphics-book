import { Drawing, palette } from '../../figures/drawing.ts';
import { grid, rectangle } from '../../figures/helpers.ts';
import { choice, number, points, slider } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { evaluate } from './core.ts';
import { fitPolynomial, interpolate, polynomial } from './fitting.ts';

function sampleTimes(data: number[][], chord: boolean): number[] | null {
  if (!chord) return data.map((_, i) => i / (data.length - 1));
  const accumulated = [0];
  for (let i = 1; i < data.length; i++) {
    const distance = Math.hypot(...data[i].map((x, axis) => x - data[i - 1][axis]));
    if (distance < 1e-8) return null;
    accumulated.push(accumulated.at(-1)! + distance);
  }
  return accumulated.map((x) => x / accumulated.at(-1)!);
}
export const fittingFigures: FigureSpec[] = [
  {
    id: 'polynomial-interpolation',
    chapter: '13',
    title: '经过四个样本点，还是受四个控制点影响？',
    subtitle: '拖动同一组点；蓝线逐点插值，绿线把这些位置当作 Bézier 控制点。',
    source: '/src/chapters/13-bezier/fitting.ts',
    defaults: {
      points: [
        [-2, -0.8],
        [-0.8, 1.4],
        [0.7, -0.4],
        [2, 1],
      ],
      parameters: 'uniform',
    },
    controls: [
      choice('parameters', '样本参数', [
        ['uniform', '均匀'],
        ['chord', '弦长比例'],
      ]),
    ],
    initialProgress: 0.35,
    duration: 8,
    compute(p, t) {
      const d = new Drawing([-3.1, 3.1, -2.5, 2.7]),
        data = points(p, 'points'),
        times = sampleTimes(data, p.parameters === 'chord');
      grid(d, [-3, 3, -2, 2]);
      d.line(data, palette.muted, 1, 0.6, true);
      d.line(
        Array.from({ length: 121 }, (_, i) => evaluate(data, i / 120)),
        palette.green,
        2,
        0.9,
        true,
      );
      data.forEach((at, index) =>
        d.handle(at, 'points', `P${index}`, { index, limits: [-2.5, 2.5, -1.7, 1.8] }),
      );
      if (times) {
        d.line(
          Array.from({ length: 161 }, (_, i) => interpolate(times, data, i / 160)),
          palette.blue,
          2.6,
        );
        d.dot(interpolate(times, data, t), palette.yellow, 0.07);
        d.dot(evaluate(data, t), palette.green, 0.05);
        d.values = {
          '样本参数 tᵢ': times,
          '当前参数 t': t,
          '插值 C(t)': interpolate(times, data, t),
          'Bézier C(t)': evaluate(data, t),
          样本最大偏差: Math.max(
            ...times.map((u, i) =>
              Math.hypot(...interpolate(times, data, u).map((x, axis) => x - data[i][axis])),
            ),
          ),
        };
      } else d.values = { 参数状态: '相邻样本重合，弦长参数重复；切换均匀参数或分开两点' };
      d.text([-2.8, 2.4], '蓝：样本插值', palette.blue, 13);
      d.text([0.2, 2.4], '绿：控制点曲线', palette.green, 13);
      d.formula = 'C(t_i)=P_i,\\quad C(t)=\\sum_i\\ell_i(t)P_i';
      return d.result();
    },
  },
  {
    id: 'least-squares-fit',
    chapter: '13',
    title: '允许留下误差，换取更低次的曲线',
    subtitle: '拖动样本，红线连接 Pᵢ 与固定参数处的 C(tᵢ)；它不是最近点距离。',
    source: '/src/chapters/13-bezier/fitting.ts',
    defaults: {
      points: [
        [-2.2, -0.6],
        [-1.3, 1.2],
        [-0.4, -0.2],
        [0.5, 1.4],
        [1.4, 0.3],
        [2.2, -0.7],
      ],
      degree: 3,
    },
    controls: [slider('degree', '多项式次数', 1, 5, 1)],
    animated: false,
    compute(p) {
      const d = new Drawing(),
        data = points(p, 'points'),
        times = sampleTimes(data, false)!,
        degree = number(p, 'degree');
      const fit = fitPolynomial(times, data, degree),
        errors = fit.residuals.map((r) => Math.hypot(...r)),
        max = Math.max(0.01, ...errors);
      d.panel(
        '参数最小二乘',
        [-3, 3, -2.4, 2.5],
        () => {
          grid(d, [-3, 3, -2, 2]);
          d.line(
            Array.from({ length: 161 }, (_, i) => polynomial(fit.coefficients, i / 160)),
            palette.blue,
            2.6,
          );
          data.forEach((at, index) => {
            const projected = polynomial(fit.coefficients, times[index]);
            d.line([at, projected], palette.red, 2);
            d.dot(projected, palette.blue, 0.04);
            d.handle(at, 'points', `P${index}`, { index, limits: [-2.6, 2.6, -1.7, 1.8] });
          });
        },
        1.6,
      );
      d.panel('各样本残差长度', [-0.7, 5.8, -0.5, 4.8], () => {
        d.axes(-0.3, 5.5, 0, 3.5);
        errors.forEach((error, i) => {
          rectangle(d, [i - 0.23, 0], [0.46, (3 * error) / max], palette.red, 0.8);
          d.text([i - 0.22, -0.3], `P${i}`, palette.muted, 11);
        });
        d.text([-0.2, 4.3], '红：‖C(tᵢ) − Pᵢ‖', palette.red, 12);
        d.text([-0.2, 3.8], `纵轴顶值 ${max.toFixed(3)}`, palette.muted, 12);
      });
      const orthogonality = Math.max(
        ...Array.from({ length: degree + 1 }, (_, j) =>
          [0, 1].map((axis) =>
            Math.abs(times.reduce((s, t, i) => s + t ** j * fit.residuals[i][axis], 0)),
          ),
        ).flat(),
      );
      d.values = {
        次数: degree,
        样本数: data.length,
        误差平方和: fit.squaredError,
        均方根距离: Math.sqrt(fit.squaredError / data.length),
        残差正交误差: orthogonality,
      };
      d.formula = '\\min_{c_0,\\ldots,c_d}\\sum_i\\left\\|\\sum_{j=0}^{d}c_jt_i^j-P_i\\right\\|^2';
      return d.result();
    },
  },
];
