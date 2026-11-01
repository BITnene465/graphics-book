import { Drawing, palette, circle } from '../../figures/drawing.ts';
import { bitmap, rectangle, rgb } from '../../figures/helpers.ts';
import { number, vec2, slider, choice } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { sampleOffsets, mixColors, renderImage, probePixel } from './core.ts';

export const figures: FigureSpec[] = [
  {
    id: 'pixel-sampling',
    chapter: '01',
    title: '一个像素，许多个观察位置',
    subtitle: '拖动圆心，观察样本覆盖与像素亮度的关系。',
    source: '/src/chapters/01-pixels/core.ts',
    defaults: { point: [0.1, 0.15], samples: 4 },
    controls: [
      choice('samples', '每轴样本', [
        [1, '1'],
        [2, '2'],
        [4, '4'],
        [8, '8'],
        [16, '16'],
      ]),
    ],
    compute(p, t) {
      const d = new Drawing([-1.5, 2.8, -1.4, 1.4]),
        center = vec2(p, 'point'),
        samples = sampleOffsets(number(p, 'samples')).map((v) => [v[0] - 0.5, v[1] - 0.5]),
        count = Math.max(1, Math.ceil(samples.length * t));
      rectangle(d, [-0.5, -0.5], [1, 1], palette.ink, 0.06);
      d.line(
        [
          [-0.5, -0.5],
          [0.5, -0.5],
          [0.5, 0.5],
          [-0.5, 0.5],
          [-0.5, -0.5],
        ],
        palette.ink,
      );
      d.line(circle(center, 0.56), palette.blue, 2);
      let covered = 0;
      samples.slice(0, count).forEach((xy) => {
        const inside = Math.hypot(xy[0] - center[0], xy[1] - center[1]) < 0.56;
        covered += Number(inside);
        d.dot(xy, inside ? palette.green : palette.red, 0.025);
      });
      const coverage = covered / count;
      rectangle(d, [1.25, -0.5], [1, 1], rgb([coverage, coverage, coverage]));
      d.text([1.28, 0.8], '像素平均', palette.ink, 14);
      d.handle(center, 'point', '圆心', { limits: [-1, 1, -1, 1] });
      d.values = { 已观察: count, 总样本: samples.length, 覆盖率: coverage };
      d.formula = 'C_{pixel}=\\frac{1}{N}\\sum_{i=1}^{N}C(x_i,y_i)';
      return d.result();
    },
  },
  {
    id: 'color-average',
    chapter: '01',
    title: '颜色编码与光的平均',
    subtitle: '同样的黑与白，两种平均方式产生不同亮度。',
    source: '/src/chapters/01-pixels/core.ts',
    defaults: { weight: 0.5 },
    controls: [slider('weight', '白色比例', 0, 1, 0.005)],
    animated: false,
    compute(p) {
      const d = new Drawing([-3.1, 3.1, -1.2, 1.25]),
        t = number(p, 'weight'),
        a = mixColors([0, 0, 0], [1, 1, 1], t, true),
        b = mixColors([0, 0, 0], [1, 1, 1], t, false);
      // mixColors 返回显示编码；这里明确区分数据与显示。
      const css = (v: number[]) => `rgb(${v.map((c) => Math.round(c * 255)).join(' ')})`;
      rectangle(d, [-2.8, -0.6], [2.5, 1.2], css(a));
      rectangle(d, [0.3, -0.6], [2.5, 1.2], css(b));
      d.text([-2.8, 0.95], '在线性光中平均', palette.green);
      d.text([0.3, 0.95], '在 sRGB 编码中平均', palette.red);
      d.values = { 线性平均的显示编码: a[0], 编码平均: b[0] };
      d.formula = 'E\\bigl((1-t)L_0+tL_1\\bigr)';
      return d.result();
    },
  },
];
export const main: FigureSpec = {
  id: 'main',
  chapter: '01',
  title: '从连续场景到像素',
  subtitle: '改变采样密度；黄色探针跟踪同一位置所在的像素。',
  source: '/src/chapters/01-pixels/core.ts',
  defaults: { size: 32, samples: 2, pattern: 'disk', point: [0.5, 0.5] },
  controls: [
    slider('size', '每轴像素', 8, 128, 1),
    choice('samples', '每轴样本', [
      [1, '1'],
      [2, '2'],
      [4, '4'],
      [8, '8'],
    ]),
    choice('pattern', '场景', [
      ['disk', '圆'],
      ['gradient', '梯度'],
      ['corners', '四角'],
    ]),
  ],
  animated: false,
  compute(p) {
    const n = number(p, 'size'),
      d = new Drawing([-0.1, 1.1, -0.1, 1.1]),
      data = renderImage(n, n, number(p, 'samples'), p.pattern as 'disk' | 'gradient' | 'corners'),
      at = vec2(p, 'point');
    bitmap(d, { width: n, height: n, data }, [0, 0], [1, 1], true);
    d.handle(at, 'point', '采样位置', { limits: [0, 1, 0, 1] });
    const [row, col] = probePixel(
      Math.min(n - 1e-9, at[0] * n),
      Math.min(n - 1e-9, at[1] * n),
      n,
      n,
    );
    d.values = {
      像素列: col,
      数组行: row,
      '线性 RGB': [...data.slice((row * n + col) * 3, (row * n + col) * 3 + 3)],
    };
    return d.result();
  },
};
