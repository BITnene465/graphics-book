import { Drawing, palette } from '../../figures/drawing.ts';
import { imagePanel, plot } from '../../figures/advanced.ts';
import { slider, number } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec3 } from '../../math/vector.ts';
import { makeImage } from '../../math/image.ts';
import { composite, knownAlpha, matteLine } from './core.ts';
export const figures: FigureSpec[] = [
  {
    id: 'alpha-color-line',
    chapter: '28',
    title: '合成方程与可识别性',
    subtitle: '减小前景与背景的颜色差，观察同样的颜色误差如何影响 alpha。',
    source: '/src/chapters/28-matting/core.ts',
    animated: false,
    defaults: { contrast: 0.7, error: 0 },
    controls: [
      slider('contrast', '颜色差', 0, 1, 0.02),
      slider('error', '红通道观测误差', -0.1, 0.1, 0.005),
    ],
    compute(p) {
      const d = new Drawing(),
        F: Vec3 = [0.1, 0.35, 0.65],
        B = F.map((x) => x + (1 - x) * number(p, 'contrast')) as Vec3,
        w = 64,
        h = 48;
      let error = 0,
        valid = 0;
      const observed = makeImage(w, h, (u, v) => {
        const a = 1 / (1 + Math.exp(35 * (Math.hypot((u - 0.5) * 1.4, v - 0.5) - 0.26))),
          c = composite(F, B, a);
        c[0] += number(p, 'error');
        return c;
      });
      const matte = makeImage(w, h, (u, v) => {
        const i = (Math.floor(v * h) * w + Math.floor(u * w)) * 3,
          c = Array.from(observed.data.slice(i, i + 3)) as Vec3,
          a = knownAlpha(c, F, B);
        if (a === null) return [0.25, 0.25, 0.25];
        const truth = 1 / (1 + Math.exp(35 * (Math.hypot((u - 0.5) * 1.4, v - 0.5) - 0.26)));
        error += Math.abs(a - truth);
        valid++;
        return [a, a, a];
      });
      imagePanel(d, '观测颜色 C', w, h, observed.data);
      if (!valid) {
        d.panel('alpha 无法确定', [-1, 1, -1, 1], () =>
          d.text([-0.85, 0], 'F = B：任意 alpha 均产生相同颜色', palette.muted, 12),
        );
        d.values = { 状态: '前景与背景同色，不能由 C 恢复 alpha', 合成空间: '线性 RGB' };
        return d.result();
      }
      imagePanel(d, '由已知 F、B 估计 alpha', w, h, matte.data);
      const out = makeImage(w, h, (u, v) => {
        const i = (Math.floor(v * h) * w + Math.floor(u * w)) * 3,
          a = matte.data[i];
        return composite(F, [0.65, 0.16, 0.1], a);
      });
      imagePanel(d, '更换背景', w, h, out.data);
      d.values = {
        平均alpha误差: valid ? error / valid : 'F=B，不可识别',
        已知条件: '前景与背景颜色',
        合成空间: '线性 RGB',
      };
      return d.result();
    },
  },
  {
    id: 'matting-constraints',
    chapter: '28',
    title: '颜色线模型怎样传播笔画约束',
    subtitle: '灰度一维截面保留局部窗口能量，边界分别标为背景和前景。',
    source: '/src/chapters/28-matting/core.ts',
    animated: false,
    defaults: { epsilon: 0.001, width: 0.12 },
    controls: [
      slider('epsilon', '正则强度', 0.0001, 0.05, 0.0001),
      slider('width', '边缘宽度', 0.03, 0.3, 0.01),
    ],
    compute(p) {
      const d = new Drawing([0, 1, -0.1, 1.15]),
        N = 40,
        a = Array.from(
          { length: N },
          (_, i) => 1 / (1 + Math.exp(-(i / (N - 1) - 0.5) / number(p, 'width'))),
        ),
        colors = a.map((x) => 0.2 + 0.6 * x),
        pins = new Map<number, number>([
          [0, 0],
          [1, 0],
          [N - 2, 1],
          [N - 1, 1],
        ]),
        out = matteLine(colors, pins, number(p, 'epsilon'));
      d.axes(0, 1, 0, 1);
      plot(d, colors, palette.muted);
      plot(d, a, palette.yellow);
      plot(d, out, palette.blue);
      d.values = {
        灰线: '观测灰度',
        黄线: '生成时的 alpha',
        蓝线: '约束求解 alpha',
        固定样本数: pins.size,
        最大误差: Math.max(...out.map((x, i) => Math.abs(x - a[i]))),
      };
      return d.result();
    },
  },
];
