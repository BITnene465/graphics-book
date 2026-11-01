import { Drawing, palette } from '../../figures/drawing.ts';
import { plot } from '../../figures/advanced.ts';
import { slider, number, vec2 } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { pointIrradiance, rectangleSolidAngle, rectangleIrradiance } from './core.ts';
export const figures: FigureSpec[] = [
  {
    id: 'flux-distance',
    chapter: '23',
    title: '同一通量，分布在不同面积上',
    subtitle: '拖动接收点，分别观察距离和入射倾角的作用。',
    source: '/src/chapters/23-radiometry/core.ts',
    animated: false,
    defaults: { receiver: [2, 0], flux: 100, tilt: 0 },
    controls: [
      slider('flux', '辐射通量 Φ', 1, 300, 1, 'W'),
      slider('tilt', '接收面倾角', 0, 85, 1, '°'),
    ],
    compute(p) {
      const d = new Drawing(),
        r = vec2(p, 'receiver'),
        distance = Math.hypot(...r),
        cos = Math.cos((number(p, 'tilt') * Math.PI) / 180),
        flux = number(p, 'flux');
      d.panel('几何与接收面', [-0.5, 5, -1.5, 1.5], () => {
        d.dot([0, 0], palette.yellow, 0.12);
        d.line([[0, 0], r], palette.yellow, 2);
        d.handle(r, 'receiver', '接收点', { limits: [0.5, 4.5, -1, 1] });
        const a = Math.atan2(r[1], r[0]) + Math.PI / 2 + (number(p, 'tilt') * Math.PI) / 180;
        d.line(
          [
            [r[0] - 0.45 * Math.cos(a), r[1] - 0.45 * Math.sin(a)],
            [r[0] + 0.45 * Math.cos(a), r[1] + 0.45 * Math.sin(a)],
          ],
          palette.green,
          4,
        );
      });
      d.panel('E 随距离变化', [0.4, 4.5, 0, 105], () => {
        d.axes(0.5, 4.5, 0, 100);
        plot(
          d,
          Array.from({ length: 100 }, (_, i) => pointIrradiance(flux, 0.5 + (4 * i) / 99, cos)),
          palette.blue,
          0.5,
          4.5,
        );
        d.dot([distance, pointIrradiance(flux, distance, cos)], palette.red, 0.06);
      });
      d.values = {
        '距离 d / m': distance,
        '辐射强度 I / W·sr⁻¹': flux / (4 * Math.PI),
        '辐照度 E / W·m⁻²': pointIrradiance(flux, distance, cos),
      };
      return d.result();
    },
  },
  {
    id: 'area-light-measure',
    chapter: '23',
    title: '立体角与投影立体角',
    subtitle: '面积光源越近，点光源近似越不合适。',
    source: '/src/chapters/23-radiometry/core.ts',
    animated: false,
    defaults: { size: 1, distance: 2, radiance: 1 },
    controls: [
      slider('size', '光源半边长', 0.2, 2, 0.05, 'm'),
      slider('distance', '平行面距离', 0.5, 5, 0.05, 'm'),
      slider('radiance', '辐亮度 L', 0.1, 5, 0.1, 'W/(m²·sr)'),
    ],
    compute(p) {
      const d = new Drawing([-2.5, 2.5, -0.5, 5.5]),
        a = number(p, 'size'),
        r = number(p, 'distance'),
        L = number(p, 'radiance');
      d.line(
        [
          [-a, r],
          [a, r],
        ],
        palette.yellow,
        5,
      );
      d.line(
        [
          [-0.5, 0],
          [0.5, 0],
        ],
        palette.green,
        4,
      );
      for (let i = 0; i <= 12; i++)
        d.line(
          [
            [0, 0],
            [-a + (2 * a * i) / 12, r],
          ],
          palette.blue,
          1,
          0.4,
        );
      d.values = {
        '立体角 Ω / sr': rectangleSolidAngle(a, a, r),
        '辐照度 E / W·m⁻²': rectangleIrradiance(L, a, a, r),
        '远场近似 E': (4 * a * a * L) / (r * r),
      };
      return d.result();
    },
  },
];
