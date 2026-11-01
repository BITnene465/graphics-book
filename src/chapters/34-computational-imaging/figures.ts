import { Drawing, palette } from '../../figures/drawing.ts';
import { plot, imagePanel } from '../../figures/advanced.ts';
import { slider, choice, number } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { random } from '../../math/vector.ts';
import { measure, blurMatrix, regularizedInverse, refocus } from './core.ts';
export const figures: FigureSpec[] = [
  {
    id: 'coded-inverse',
    chapter: '34',
    title: '已知编码也不保证容易反演',
    subtitle: '比较模糊核、观测噪声和正则化强度。',
    source: '/src/chapters/34-computational-imaging/core.ts',
    animated: false,
    defaults: { noise: 0.03, lambda: 0.02, kernel: 'coded' },
    controls: [
      slider('noise', '观测噪声幅度', 0, 0.15, 0.005),
      slider('lambda', '正则强度 λ', 0.0001, 0.3, 0.001),
      choice('kernel', '核', [
        ['box', '均匀模糊'],
        ['coded', '非均匀编码'],
      ]),
    ],
    compute(p) {
      const d = new Drawing([0, 1, -0.4, 1.5]),
        n = 32,
        x = Array.from({ length: n }, (_, i) =>
          i > 8 && i < 15 ? 0.9 : i > 22 && i < 26 ? 0.65 : 0.12,
        ),
        A = blurMatrix(n, p.kernel === 'box' ? [1, 1, 1, 1, 1] : [1, 0, 1, 0, 2]),
        rng = random(7),
        y = measure(A, x).map((v) => v + number(p, 'noise') * (2 * rng() - 1)),
        out = regularizedInverse(A, y, number(p, 'lambda'));
      plot(d, x, palette.muted);
      plot(d, y, palette.yellow);
      plot(d, out, palette.blue);
      d.values = {
        灰线: '真实信号',
        黄线: '编码观测',
        蓝线: '正则解',
        重建均方误差: out.reduce((s, v, i) => s + (v - x[i]) ** 2, 0) / n,
      };
      return d.result();
    },
  },
  {
    id: 'light-field-refocus',
    chapter: '34',
    title: '沿光场中的斜线重新积分',
    subtitle: '不同深度具有不同视差斜率；拖动焦平面参数使一个深度对齐。',
    source: '/src/chapters/34-computational-imaging/core.ts',
    animated: false,
    defaults: { shift: 1.5, views: 13 },
    controls: [
      slider('shift', '重对焦位移', -2.5, 2.5, 0.05, '像素/视点'),
      slider('views', '子视点数', 3, 21, 2),
    ],
    compute(p) {
      const d = new Drawing(),
        n = 100,
        k = number(p, 'views'),
        views = Array.from({ length: k }, (_, a) =>
          Array.from({ length: n }, (_, x) => {
            const t = a - (k - 1) / 2;
            return (
              0.8 * Math.exp(-(((x - 30 - 1.5 * t) / 2) ** 2)) +
              0.7 * Math.exp(-(((x - 70 + 1 * t) / 2) ** 2))
            );
          }),
        ),
        out = refocus(views, number(p, 'shift')),
        rgb = views.flatMap((row) => row.flatMap((x) => [x, x, x]));
      imagePanel(d, '空间 × 子视点截面', n, k, rgb);
      d.panel('积分后的空间信号', [0, 1, 0, 1], () => plot(d, out, palette.blue));
      d.values = { 近层视差斜率: 1.5, 远层视差斜率: -1, 当前重对焦位移: number(p, 'shift') };
      return d.result();
    },
  },
  {
    id: 'spectral-metamerism',
    chapter: '34',
    title: '三个通道不足以唯一确定光谱',
    subtitle: '沿测量矩阵的零空间改变四个谱带，通道读数保持不变。',
    source: '/src/chapters/34-computational-imaging/core.ts',
    animated: false,
    defaults: { amount: 0 },
    controls: [slider('amount', '零空间位移', -0.45, 0.45, 0.01)],
    compute(p) {
      const d = new Drawing([-0.5, 3.5, 0, 1.1]),
        a = number(p, 'amount'),
        s = [0.5 - a, 0.5 + a, 0.5 - a, 0.5 + a],
        A = [
          [1, 1, 0, 0],
          [0, 1, 1, 0],
          [0, 0, 1, 1],
        ],
        y = measure(A, s);
      s.forEach((v, i) => {
        d.line(
          [
            [i, 0],
            [i, v],
          ],
          palette.blue,
          16,
        );
        d.text([i - 0.2, 0.98], String(450 + 80 * i) + ' nm', palette.muted, 11);
      });
      d.values = {
        三个通道测量: y,
        四个谱带: s,
        测量秩: 3,
        说明: '示意响应矩阵；不是实际 RGB 光谱响应',
      };
      return d.result();
    },
  },
];
