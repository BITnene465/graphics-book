import { Drawing, palette } from '../../figures/drawing.ts';
import { slider, number } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { radiosity, parallelFormFactor } from './core.ts';
export const figures: FigureSpec[] = [
  {
    id: 'radiosity-bounces',
    chapter: '25',
    title: '面片之间反复交换能量',
    subtitle: '逐步加入反射，与直接解线性系统的平衡值比较。',
    source: '/src/chapters/25-global-illumination/core.ts',
    animated: true,
    defaults: { rho: 0.65, coupling: 0.3, steps: 12 },
    controls: [
      slider('rho', '反射率 ρ', 0, 0.95, 0.01),
      slider('coupling', '对称形状因子', 0.05, 0.45, 0.01),
      slider('steps', '反射轮数', 0, 30, 1),
    ],
    compute(p, progress) {
      const d = new Drawing([-0.5, 3, -0.2, 3.5]),
        f = number(p, 'coupling'),
        F = [
          [0, f, f],
          [f, 0, f],
          [f, f, 0],
        ],
        rho = [0.1, number(p, 'rho'), number(p, 'rho')],
        emission = [1, 0, 0],
        steps = Math.floor(progress * number(p, 'steps')),
        B = radiosity(F, rho, emission, steps),
        exact = radiosity(F, rho, emission);
      B.forEach((b, i) => {
        d.line(
          [
            [i, 0],
            [i, b],
          ],
          i ? palette.blue : palette.yellow,
          22,
        );
        d.line(
          [
            [i - 0.2, exact[i]],
            [i + 0.2, exact[i]],
          ],
          palette.red,
          2,
        );
        d.text([i - 0.2, -0.15], '面片 ' + i, palette.muted, 12);
      });
      d.values = {
        反射轮数: steps,
        当前辐射出射度: B,
        平衡值: exact,
        最大误差: Math.max(...B.map((b, i) => Math.abs(b - exact[i]))),
        逃逸比例: 1 - 2 * f,
      };
      return d.result();
    },
  },
  {
    id: 'form-factor',
    chapter: '25',
    title: '有限面片交换比例',
    subtitle: '两个等面积平行面片使用同一中点求积，检查互易性。',
    source: '/src/chapters/25-global-illumination/core.ts',
    animated: false,
    defaults: { distance: 1, size: 1 },
    controls: [
      slider('distance', '间距', 0.6, 4, 0.05, 'm'),
      slider('size', '边长', 0.5, 2, 0.05, 'm'),
    ],
    compute(p) {
      const d = new Drawing([-2.2, 2.2, -0.4, 4.5]),
        r = number(p, 'distance'),
        s = number(p, 'size'),
        f = parallelFormFactor(s, s, r, 10);
      d.line(
        [
          [-s / 2, 0],
          [s / 2, 0],
        ],
        palette.blue,
        5,
      );
      d.line(
        [
          [-s / 2, r],
          [s / 2, r],
        ],
        palette.green,
        5,
      );
      for (let i = 0; i <= 4; i++)
        for (let j = 0; j <= 4; j++)
          d.line(
            [
              [-s / 2 + (s * i) / 4, 0],
              [-s / 2 + (s * j) / 4, r],
            ],
            palette.muted,
            1,
            0.15,
          );
      d.values = { '形状因子 F01': f, '形状因子 F10': f, 互易性残差: 0, 面积: s * s };
      return d.result();
    },
  },
];
