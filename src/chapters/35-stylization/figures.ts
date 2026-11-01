import { Drawing } from '../../figures/drawing.ts';
import { imagePanel } from '../../figures/advanced.ts';
import { slider, number } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { illustration } from '../../math/image.ts';
import { linearToSrgb } from '../01-pixels/core.ts';
import { bilateral, toon, strokes } from './core.ts';
export const figures: FigureSpec[] = [
  {
    id: 'toon-abstraction',
    chapter: '35',
    title: '分开观察保边平滑、色阶与线条',
    subtitle: '同一幅自绘图案经过可检查的三个步骤。',
    source: '/src/chapters/35-stylization/core.ts',
    animated: false,
    defaults: { range: 0.15, radius: 2, levels: 5, threshold: 0.06 },
    controls: [
      slider('range', '颜色容差', 0.02, 0.6, 0.01),
      slider('radius', '邻域半径', 1, 4, 1, 'px'),
      slider('levels', '灰度层级', 2, 12, 1),
      slider('threshold', '边缘阈值', 0.01, 0.2, 0.005),
    ],
    compute(p) {
      const d = new Drawing(),
        source = illustration(72, 50),
        smooth = bilateral(source, number(p, 'radius'), number(p, 'range')),
        out = toon(smooth, number(p, 'levels'), number(p, 'threshold'));
      for (const [name, img] of [
        ['原图', source],
        ['双边平滑', smooth],
        ['量化与轮廓', out],
      ] as const)
        imagePanel(d, name, img.width, img.height, img.data);
      d.values = { 处理颜色空间: '线性 RGB', 边缘依据: '线性亮度梯度' };
      return d.result();
    },
  },
  {
    id: 'stroke-directions',
    chapter: '35',
    title: '笔画沿边缘切向排列',
    subtitle: '改变长度和密度，比较结构表达与细节损失。',
    source: '/src/chapters/35-stylization/core.ts',
    animated: true,
    defaults: { count: 700, length: 4, seed: 8 },
    controls: [
      slider('count', '笔画预算', 100, 1600, 50),
      slider('length', '笔画长度', 1, 10, 0.5, 'px'),
      slider('seed', '随机种子', 1, 30, 1),
    ],
    compute(p, progress) {
      const d = new Drawing([-1.5, 1.5, -1.05, 1.05]),
        source = illustration(96, 64),
        ss = strokes(source, number(p, 'count'), number(p, 'length'), number(p, 'seed')),
        count = Math.floor(progress * ss.length);
      for (const s of ss.slice(0, count)) {
        const xy = (x: number, y: number) => [x / 32 - 1.5, 1 - y / 32],
          color = 'rgb(' + s.color.map((x) => Math.round(linearToSrgb(x) * 255)).join(',') + ')';
        d.line(
          [xy(s.x - s.dx / 2, s.y - s.dy / 2), xy(s.x + s.dx / 2, s.y + s.dy / 2)],
          color,
          3,
          0.9,
        );
      }
      if (!count) d.text([-0.8, 0], '尚未铺下笔画');
      d.values = { 已绘笔画: count, 方向: '灰度梯度的垂直方向', 样本种子: number(p, 'seed') };
      return d.result();
    },
  },
];
