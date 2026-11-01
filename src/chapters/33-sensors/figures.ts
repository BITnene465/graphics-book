import { Drawing, palette } from '../../figures/drawing.ts';
import { imagePanel, plot } from '../../figures/advanced.ts';
import { slider, number } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { makeImage } from '../../math/image.ts';
import { mosaic, demosaic, bayerChannel, sensorSamples } from './core.ts';
export const figures: FigureSpec[] = [
  {
    id: 'bayer-reconstruction',
    chapter: '33',
    title: '一个位置只测一个颜色通道',
    subtitle: '改变黑白条纹频率，观察彩色采样阵列产生的伪色。',
    source: '/src/chapters/33-sensors/core.ts',
    animated: false,
    defaults: { frequency: 17, angle: 25 },
    controls: [
      slider('frequency', '横跨图像的周期数', 1, 38, 0.5),
      slider('angle', '条纹方向', 0, 90, 1, '°'),
    ],
    compute(p) {
      const d = new Drawing(),
        w = 64,
        h = 48,
        a = (number(p, 'angle') * Math.PI) / 180,
        source = makeImage(w, h, (u, v) => {
          const g =
            0.5 +
            0.45 *
              Math.cos(2 * Math.PI * number(p, 'frequency') * (u * Math.cos(a) + v * Math.sin(a)));
          return [g, g, g];
        }),
        raw = mosaic(source),
        color = source.data.map((_, i) =>
          i % 3 === bayerChannel(Math.floor(i / 3) % w, Math.floor(i / 3 / w))
            ? raw[Math.floor(i / 3)]
            : 0,
        ),
        out = demosaic(raw, w, h);
      imagePanel(d, '理想全通道样本', w, h, source.data);
      imagePanel(d, 'RGGB 观测', w, h, color);
      imagePanel(d, '双线性去马赛克', w, h, out.data);
      d.values = {
        每像素原始通道数: 1,
        输出通道数: 3,
        通道均方误差:
          out.data.reduce((s, x, i) => s + (x - source.data[i]) ** 2, 0) / out.data.length,
      };
      return d.result();
    },
  },
  {
    id: 'photon-read-noise',
    chapter: '33',
    title: '平均值增加，绝对噪声和相对噪声不同',
    subtitle: '同一照明重复测量；图中曲线由固定种子的计数样本生成。',
    source: '/src/chapters/33-sensors/core.ts',
    animated: false,
    defaults: { photons: 100, read: 3, seed: 4 },
    controls: [
      slider('photons', '平均电子数', 2, 1000, 2),
      slider('read', '读出噪声标准差', 0, 20, 0.5, 'e⁻'),
      slider('seed', '随机种子', 1, 30, 1),
    ],
    compute(p) {
      const mean = number(p, 'photons'),
        read = number(p, 'read'),
        values = sensorSamples(mean, read, 160, number(p, 'seed')),
        sigma = Math.sqrt(mean + read * read),
        d = new Drawing([0, 1, Math.min(0, mean - 4 * sigma), mean + 4 * sigma]);
      plot(d, values, palette.blue);
      d.line(
        [
          [0, mean],
          [1, mean],
        ],
        palette.red,
        1.5,
      );
      d.values = {
        理论方差: mean + read * read,
        理论信噪比: mean / sigma,
        相对标准差: sigma / mean,
        计数模型: mean < 40 ? 'Poisson' : 'Poisson 的正态近似',
      };
      return d.result();
    },
  },
];
