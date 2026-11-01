import { Drawing, palette } from '../../figures/drawing.ts';
import { plot, imagePanel } from '../../figures/advanced.ts';
import { slider, number, choice, vec2 } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { estimateSquare, renderPaths } from './core.ts';
let cacheKey = '';
let cache: Float64Array = new Float64Array();
export const figures: FigureSpec[] = [
  {
    id: 'monte-carlo-estimator',
    chapter: '26',
    title: '同一个积分，两种采样密度',
    subtitle: '固定种子逐步累积样本；红线是独立解析答案 1/3。',
    source: '/src/chapters/26-path-tracing/core.ts',
    animated: true,
    defaults: { samples: 512, seed: 7, method: 'importance' },
    controls: [
      slider('samples', '样本数 N', 16, 2048, 16),
      slider('seed', '种子', 1, 100, 1),
      choice('method', '密度', [
        ['uniform', 'p(x)=1'],
        ['importance', 'p(x)=2x'],
      ]),
    ],
    compute(p, progress) {
      const d = new Drawing([0, 1, 0, 0.8]),
        N = Math.max(1, Math.floor(progress * number(p, 'samples'))),
        e = estimateSquare(N, number(p, 'seed'), p.method === 'importance');
      d.axes(0, 1, 0, 0.75);
      d.line(
        [
          [0, 1 / 3],
          [1, 1 / 3],
        ],
        palette.red,
        1.5,
      );
      plot(d, e.running, palette.blue, 0, N / number(p, 'samples'));
      d.values = {
        样本数: N,
        估计积分: e.mean,
        绝对误差: Math.abs(e.mean - 1 / 3),
        估计标准误差: e.variance === null ? '至少需要两个样本' : Math.sqrt(e.variance / N),
      };
      return d.result();
    },
  },
  {
    id: 'diffuse-path-image',
    chapter: '26',
    title: '漫反射路径的成像结果',
    subtitle: '拖动俯视图中的球体位置；图像由本章 CPU 路径积分器计算。',
    source: '/src/chapters/26-path-tracing/core.ts',
    animated: true,
    duration: 10,
    defaults: { samples: 12, bounces: 3, seed: 11, position: [1, -0.5] },
    controls: [
      slider('samples', '每像素样本', 1, 48, 1),
      slider('bounces', '反射上限', 1, 8, 1),
      slider('seed', '随机种子', 1, 30, 1),
    ],
    compute(p, progress) {
      const d = new Drawing(),
        position = vec2(p, 'position'),
        N = Math.max(1, Math.floor(1 + progress * (number(p, 'samples') - 1))),
        key = JSON.stringify([N, p.bounces, p.seed, position]);
      if (key !== cacheKey) {
        cache = renderPaths(48, 36, N, number(p, 'bounces'), number(p, 'seed'), [
          position[0],
          0.7,
          position[1],
        ]);
        cacheKey = key;
      }
      imagePanel(d, '线性累积 → sRGB 显示', 48, 36, cache);
      d.panel('俯视位置 · x 与 z', [-3, 3, -2.25, 2.25], () => {
        d.axes(-2.8, 2.8, -2, 2);
        d.dot([-0.95, 0], palette.blue, 0.8, 0.3);
        d.dot(position, palette.red, 0.7, 0.4);
        d.handle(position, 'position', '球体', { limits: [0.1, 2.3, -1.7, 1.5] });
      });
      d.values = {
        每像素样本: N,
        反射上限: number(p, 'bounces'),
        输出像素: '48 × 36',
        光源: '无限远环境',
        模型: 'Lambert 漫反射；无去噪',
      };
      return d.result();
    },
  },
];
