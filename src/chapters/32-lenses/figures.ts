import { lens as deskFigure } from '../../book-scene/imaging-studies.ts';
import { Drawing, palette } from '../../figures/drawing.ts';
import { imagePanel } from '../../figures/advanced.ts';
import { slider, number, vec2, choice } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { imageDistance, circleOfConfusion, lensRay } from './core.ts';
export const figures: FigureSpec[] = [
  deskFigure,
  {
    id: 'thin-lens-rays',
    chapter: '32',
    title: '光线相交的位置与传感器的位置',
    subtitle: '拖动物点，改变对焦距离；图中所有长度使用同一单位。',
    source: '/src/chapters/32-lenses/core.ts',
    animated: false,
    defaults: { object: [-4, 0.6], focus: 4, fNumber: 2 },
    controls: [slider('focus', '对焦物距', 2, 7, 0.05), slider('fNumber', '光圈数', 1, 16, 0.1)],
    compute(p) {
      const d = new Drawing([-7.7, 2.4, -1, 1]),
        o = vec2(p, 'object'),
        focus = number(p, 'focus'),
        sensor = imageDistance(1, focus),
        radius = 0.5 / number(p, 'fNumber');
      d.axes(-7.5, 2.2, -0.9, 0.9);
      d.line(
        [
          [0, -0.8],
          [0, 0.8],
        ],
        palette.blue,
        5,
      );
      d.line(
        [
          [sensor, -0.85],
          [sensor, 0.85],
        ],
        palette.green,
        3,
      );
      for (let i = 0; i <= 6; i++) {
        const y = -radius + (2 * radius * i) / 6,
          r = lensRay(1, -o[0], o[1], y, sensor);
        d.line([o, [0, y], [sensor, r.sensorY]], palette.yellow, 1.5);
        d.line(
          [
            [sensor, r.sensorY],
            [r.image, r.imageY],
          ],
          palette.muted,
          1,
          0.4,
          true,
        );
      }
      d.handle(o, 'object', '物点', { limits: [-7, -2, 0.1, 0.85] });
      d.values = {
        焦距: 1,
        像距: imageDistance(1, -o[0]),
        传感器距离: sensor,
        弥散圆直径: circleOfConfusion(1, number(p, 'fNumber'), focus, -o[0]),
      };
      return d.result();
    },
  },
  {
    id: 'aperture-footprint',
    chapter: '32',
    title: '点光源的散焦足迹',
    subtitle: '固定每个点的总接收能量，比较不同深度与光圈形状的足迹。',
    source: '/src/chapters/32-lenses/core.ts',
    animated: false,
    defaults: { focus: 4, fNumber: 2, shape: 'circle' },
    controls: [
      slider('focus', '对焦物距', 2, 8, 0.1),
      slider('fNumber', '光圈数', 1, 8, 0.1),
      choice('shape', '光圈', [
        ['circle', '圆形'],
        ['hexagon', '六边形'],
      ]),
    ],
    compute(p) {
      const d = new Drawing(),
        w = 120,
        h = 64,
        data = new Float64Array(w * h * 3),
        depths = [2.5, 4, 7],
        diam = depths.map(
          (z) => circleOfConfusion(1, number(p, 'fNumber'), number(p, 'focus'), z) * 160,
        );
      depths.forEach((_, k) => {
        const radius = Math.max(0.65, diam[k] / 2),
          color = [
            [0.85, 0.32, 0.12],
            [0.18, 0.65, 0.45],
            [0.2, 0.4, 0.85],
          ][k],
          weights = new Float64Array(w * h);
        let total = 0;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const dx = x - (25 + 35 * k),
              dy = y - 31,
              a = Math.atan2(dy, dx),
              edge =
                p.shape === 'circle'
                  ? radius
                  : (radius * Math.cos(Math.PI / 6)) /
                    Math.cos(((a + Math.PI / 6 + 2 * Math.PI) % (Math.PI / 3)) - Math.PI / 6),
              coverage = Math.max(0, Math.min(1, edge + 0.5 - Math.hypot(dx, dy)));
            weights[y * w + x] = coverage;
            total += coverage;
          }
        const luminance = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
        for (let i = 0; i < weights.length; i++)
          for (let c = 0; c < 3; c++)
            data[3 * i + c] += (color[c] * weights[i] * 12) / (total * luminance);
      });
      imagePanel(d, '能量归一化后的传感器局部放大', w, h, data);
      d.values = {
        物距: depths,
        弥散圆像素直径: diam,
        显示比例: '160 像素 / 长度单位',
        说明: '几何光学足迹；不含衍射',
        显示约定: '最小足迹半径 0.65 像素；高亮显示截断',
      };
      return d.result();
    },
  },
];
