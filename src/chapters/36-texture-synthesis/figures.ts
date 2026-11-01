import { Drawing, palette } from '../../figures/drawing.ts';
import { imagePanel } from '../../figures/advanced.ts';
import { slider, number, choice } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { makeImage } from '../../math/image.ts';
import { quiltStrip, movingStrokes } from './core.ts';
export const figures: FigureSpec[] = [
  {
    id: 'texture-quilting',
    chapter: '36',
    title: '先选相似块，再寻找低误差接缝',
    subtitle: '比较硬接缝与最小误差切割；代码复用删缝章的动态规划。',
    source: '/src/chapters/36-texture-synthesis/core.ts',
    animated: false,
    defaults: { overlap: 6, seed: 5, cut: 'cut' },
    controls: [
      slider('overlap', '重叠宽度', 2, 12, 1, 'px'),
      slider('seed', '候选种子', 1, 30, 1),
      choice('cut', '拼接', [
        ['cut', '最小误差缝'],
        ['hard', '重叠区中线'],
      ]),
    ],
    compute(p) {
      const d = new Drawing(),
        sample = makeImage(60, 40, (u, v) => {
          const t =
            0.4 +
            0.25 * Math.sin(55 * u + 4 * Math.sin(17 * v)) * 0.8 +
            0.12 * Math.cos(38 * v + 6 * u);
          return [0.15 + t * 0.6, 0.2 + t * 0.5, 0.12 + t * 0.3];
        }),
        out = quiltStrip(sample, 20, number(p, 'overlap'), 5, number(p, 'seed'), p.cut === 'cut');
      imagePanel(d, '输入样本', sample.width, sample.height, sample.data);
      imagePanel(d, '匹配得到的纹理条带', out.width, out.height, out.data);
      d.values = { 块数: 5, 块边长: 20, 候选块每步: 30, 输出宽度: out.width };
      return d.result();
    },
  },
  {
    id: 'temporal-strokes',
    chapter: '36',
    title: '每帧重画，或沿运动传播',
    subtitle: '两侧运动完全相同；差异仅在笔画身份是否跨帧保留。',
    source: '/src/chapters/36-texture-synthesis/core.ts',
    animated: true,
    duration: 8,
    defaults: { count: 140, seed: 7 },
    controls: [slider('count', '笔画数', 30, 300, 10), slider('seed', '种子', 1, 30, 1)],
    compute(p, progress) {
      const d = new Drawing(),
        time = progress * 5;
      for (const [title, coherent] of [
        ['每帧重新采样', false],
        ['沿物体运动传播', true],
      ] as const)
        d.panel(title, [-1.4, 1.4, -1.4, 1.4], () => {
          const a = time * 0.6;
          for (const v of movingStrokes(number(p, 'count'), time, coherent, number(p, 'seed')))
            d.line(
              [
                [v[0] - 0.025 * Math.cos(a), v[1] - 0.025 * Math.sin(a)],
                [v[0] + 0.025 * Math.cos(a), v[1] + 0.025 * Math.sin(a)],
              ],
              palette.blue,
              2.5,
            );
        });
      d.values = {
        '时间 / s': time,
        右侧身份: '固定种子 → 解析运动对应',
        左侧身份: '每个时间采样重新生成',
      };
      return d.result();
    },
  },
];
