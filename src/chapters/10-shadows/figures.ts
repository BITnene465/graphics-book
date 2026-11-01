import { Drawing, palette } from '../../figures/drawing.ts';
import { bitmap, rectangle } from '../../figures/helpers.ts';
import { slider, choice, number } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { pcfVisibility, renderScene } from './core.ts';

export const figures: FigureSpec[] = [
  {
    id: 'shadow-compare',
    chapter: '10',
    title: '先比较深度，再平均可见性',
    subtitle: '九个邻域样本独立回答是否被遮挡，PCF 平均这些回答。',
    source: '/src/chapters/10-shadows/core.ts',
    defaults: { current: 0.55, bias: 0 },
    controls: [
      slider('current', '当前表面深度', 0, 1, 0.005),
      slider('bias', '深度偏移', 0, 0.3, 0.005),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-2.1, 2.8, -1.7, 1.9]),
        stored = [0.3, 0.4, 0.8, 0.35, 0.5, 0.75, 0.4, 0.6, 0.9],
        current = number(p, 'current'),
        bias = number(p, 'bias');
      stored.forEach((z, i) => {
        const x = (i % 3) - 1.7,
          y = 1 - Math.floor(i / 3),
          passes = current - bias <= z;
        rectangle(d, [x, y], [0.8, 0.8], passes ? palette.green : palette.red, 0.2);
        d.text([x + 0.1, y + 0.48], z.toFixed(2), palette.ink, 16);
        d.text(
          [x + 0.1, y + 0.18],
          passes ? '可见' : '遮挡',
          passes ? palette.green : palette.red,
          10,
        );
      });
      const visibility = pcfVisibility(current, stored, bias);
      rectangle(
        d,
        [1.6, -0.6],
        [0.65, 1.6],
        `rgb(${Math.round(255 * visibility)} ${Math.round(255 * visibility)} ${Math.round(255 * visibility)})`,
      );
      d.values = {
        当前比较值: current - bias,
        通过数: stored.filter((z) => current - bias <= z).length,
        可见率: visibility,
      };
      d.formula = 'V=\\frac1N\\sum_i[ D_{current}-bias\\le D_i ]';
      return d.result();
    },
  },
  {
    id: 'shadow-bias',
    chapter: '10',
    title: '偏移太小长痤疮，太大让阴影脱离',
    subtitle: '两次实际光栅化产生阴影；深度偏移会改变比较结果。',
    source: '/src/chapters/10-shadows/core.ts',
    defaults: { bias: 0.004, resolution: 64, radius: 1 },
    controls: [
      slider('bias', '深度偏移', 0, 0.05, 0.0005),
      choice('resolution', '阴影图', [
        [32, '32²'],
        [64, '64²'],
        [128, '128²'],
        [256, '256²'],
      ]),
      choice('radius', '过滤', [
        [0, '硬阴影'],
        [1, '3×3 PCF'],
        [2, '5×5 PCF'],
      ]),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-0.05, 1.05, -0.05, 1.05]),
        frame = renderScene(
          128,
          number(p, 'resolution'),
          [-3, 6, -2],
          number(p, 'bias'),
          number(p, 'radius'),
        );
      bitmap(d, { width: 128, height: 128, data: frame.color }, [0, 0], [1, 1]);
      d.values = {
        阴影图尺寸: number(p, 'resolution'),
        邻域样本: (2 * number(p, 'radius') + 1) ** 2,
        被遮挡像素: frame.visibility.filter((v) => v < 1).length,
      };
      return d.result();
    },
  },
];
