import { Drawing, palette } from '../../figures/drawing.ts';
import { slider, number } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { rewrite, turtle, midpointDisplacement } from './core.ts';
export const figures: FigureSpec[] = [
  {
    id: 'lsystem-growth',
    chapter: '22',
    title: '同一条产生式生成分枝',
    subtitle: '逐代展开符号，再由海龟解释器把符号变成几何。',
    source: '/src/chapters/22-procedural-modeling/core.ts',
    animated: true,
    defaults: { levels: 4, angle: 25 },
    controls: [slider('levels', '重写代数', 0, 5, 1), slider('angle', '分枝角', 5, 60, 1, '°')],
    compute(p, progress) {
      const d = new Drawing([-1.8, 1.8, -0.1, 3.5]),
        level = Math.floor(number(p, 'levels') * progress),
        text = rewrite('F', { F: 'F[+F]F[-F]F' }, level),
        lines = turtle(text, (number(p, 'angle') * Math.PI) / 180, 2.8 / 3 ** level);
      lines.forEach((l) => d.line(l, palette.green, Math.max(0.6, 2 - level * 0.2)));
      d.values = {
        已执行代数: level,
        符号数: text.length,
        线段数: lines.length,
        产生式: 'F → F[+F]F[−F]F',
      };
      return d.result();
    },
  },
  {
    id: 'fractal-midpoints',
    chapter: '22',
    title: '细节在各个尺度上出现',
    subtitle: '固定随机种子，观察新增中点与尺度衰减。',
    source: '/src/chapters/22-procedural-modeling/core.ts',
    animated: true,
    defaults: { levels: 8, roughness: 0.7, seed: 23 },
    controls: [
      slider('levels', '细化层数', 0, 10, 1),
      slider('roughness', '衰减指数 H', 0.15, 1.5, 0.05),
      slider('seed', '随机种子', 1, 100, 1),
    ],
    compute(p, progress) {
      const d = new Drawing([-0.05, 1.05, -1.4, 1.4]),
        level = Math.floor(number(p, 'levels') * progress),
        ps = midpointDisplacement(level, number(p, 'roughness'), number(p, 'seed'));
      d.axes(0, 1, -1.3, 1.3);
      d.line(ps, palette.blue, 2);
      if (ps.length < 70) ps.forEach((x) => d.dot(x, palette.yellow, 0.008));
      d.values = {
        层数: level,
        样本数: ps.length,
        下一级位移幅度: 2 ** (-number(p, 'roughness') * level),
      };
      return d.result();
    },
  },
];
