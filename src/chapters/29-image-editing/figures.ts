import { Drawing, palette } from '../../figures/drawing.ts';
import { imagePanel } from '../../figures/advanced.ts';
import { slider, number, choice, vec2 } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec2 } from '../../math/vector.ts';
import { makeImage } from '../../math/image.ts';
import { poissonBlend, meanValueWeights } from './core.ts';
export const figures: FigureSpec[] = [
  {
    id: 'poisson-blending',
    chapter: '29',
    title: '相同梯度，不同边界颜色',
    subtitle: '拖动粘贴区域，比较直接覆盖与梯度域求解。',
    source: '/src/chapters/29-image-editing/core.ts',
    animated: true,
    defaults: { center: [0, 0], steps: 300, mixed: 'source', brightness: 0.35 },
    controls: [
      slider('steps', '迭代上限', 10, 800, 10),
      slider('brightness', '目标底色', 0.1, 0.65, 0.01),
      choice('mixed', '梯度', [
        ['source', '源梯度'],
        ['mixed', '较强梯度'],
      ]),
    ],
    compute(p, progress) {
      const d = new Drawing(),
        w = 48,
        h = 36,
        center = vec2(p, 'center'),
        source = makeImage(w, h, (u, v) => {
          const x = ((u - 0.5) * 2 * w) / h - center[0],
            y = 1 - 2 * v - center[1],
            g =
              0.12 +
              0.3 * Math.exp(-40 * ((x - 0.12) ** 2 + (y - 0.05) ** 2)) +
              0.12 * Math.sin(x * 24) * Math.cos(y * 20);
          return [g + 0.15, g, g + 0.1];
        }),
        target = makeImage(w, h, (u, v) => {
          const b = number(p, 'brightness') + 0.1 * u;
          return [b, b + 0.08, b + 0.13 + 0.04 * Math.sin(v * 50)];
        }),
        mask = Array.from({ length: w * h }, (_, i) => {
          const x = ((((i % w) + 0.5) / w) * 2 * w) / h - w / h - center[0],
            y = 1 - (2 * (Math.floor(i / w) + 0.5)) / h - center[1];
          return Math.abs(x) < 0.55 && Math.abs(y) < 0.5;
        }),
        paste = target.data.map((v, i) => (mask[Math.floor(i / 3)] ? source.data[i] : v)),
        out = poissonBlend(
          source,
          target,
          mask,
          Math.floor(progress * number(p, 'steps')),
          p.mixed === 'mixed',
        );
      imagePanel(d, '直接覆盖', w, h, paste, 1, () =>
        d.handle(center, 'center', '区域', { limits: [-0.6, 0.6, -0.35, 0.35] }),
      );
      imagePanel(d, '梯度域结果', w, h, out.image.data);
      d.values = {
        最大方程残差: out.residual,
        迭代数: Math.floor(progress * number(p, 'steps')),
        边界条件: '保持目标图像颜色',
      };
      return d.result();
    },
  },
  {
    id: 'mean-value-coordinates',
    chapter: '29',
    title: '边界差值的插值',
    subtitle: '拖动查询点，查看四个边界顶点的均值坐标。',
    source: '/src/chapters/29-image-editing/core.ts',
    animated: false,
    defaults: { point: [0.2, 0.1] },
    controls: [],
    compute(p) {
      const d = new Drawing([-1.4, 1.4, -1.3, 1.3]),
        poly: Vec2[] = [
          [-1, -1],
          [1, -0.8],
          [0.8, 1],
          [-0.8, 0.7],
        ],
        q = vec2(p, 'point'),
        weights = meanValueWeights(q, poly);
      d.polygon(poly);
      poly.forEach((v, i) => {
        d.line([q, v], palette.green, 1 + 4 * weights[i]);
        d.text([v[0], v[1] + 0.1], weights[i].toFixed(3), palette.ink, 12);
      });
      d.handle(q, 'point', '查询点', { limits: [-0.6, 0.6, -0.5, 0.5] });
      d.values = {
        权重之和: weights.reduce((a, b) => a + b, 0),
        重建位置: [0, 1].map((c) => poly.reduce((s, v, i) => s + v[c] * weights[i], 0)),
      };
      return d.result();
    },
  },
];
