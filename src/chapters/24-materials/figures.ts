import { Drawing, palette } from '../../figures/drawing.ts';
import { slider, number, choice } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { fresnel, ggx, beerLambert } from './core.ts';
export const figures: FigureSpec[] = [
  {
    id: 'microfacet-lobe',
    chapter: '24',
    title: '粗糙度改变反射方向分布',
    subtitle: '曲线半径显示 BRDF 的压缩读数；数值栏保留真实单位。',
    source: '/src/chapters/24-materials/core.ts',
    animated: false,
    defaults: { alpha: 0.3, incident: 30, eta: 1.5 },
    controls: [
      slider('alpha', 'GGX α', 0.06, 1, 0.02),
      slider('incident', '入射角', -75, 75, 1, '°'),
      slider('eta', '折射率', 1.05, 2.5, 0.05),
    ],
    compute(p) {
      const d = new Drawing([-1.7, 1.7, -0.25, 1.8]),
        a = number(p, 'alpha'),
        ti = (number(p, 'incident') * Math.PI) / 180,
        eta = number(p, 'eta');
      d.axes(-1.5, 1.5, 0, 1.6);
      const curve = Array.from({ length: 181 }, (_, i) => {
        const t = ((i - 90) * Math.PI) / 181,
          f = ggx(ti, t, a, eta),
          r = Math.log1p(f) / 3;
        return [r * Math.sin(t), r * Math.cos(t)];
      });
      d.line(curve, palette.blue, 2.5);
      d.arrow([0, 0], [Math.sin(ti), Math.cos(ti)], palette.yellow, 'ωᵢ');
      d.arrow([0, 0], [0, 1.4], palette.green, 'n');
      d.values = {
        '镜向 BRDF / sr⁻¹': ggx(ti, -ti, a, eta),
        '法向 Fresnel': fresnel(1, 1, eta).reflectance,
        径向显示: 'log(1+fᵣ)/3',
      };
      return d.result();
    },
  },
  {
    id: 'fresnel-refraction',
    chapter: '24',
    title: '反射、折射与全反射',
    subtitle: '固定无吸收界面，分开观察界面分配与介质吸收。',
    source: '/src/chapters/24-materials/core.ts',
    animated: false,
    defaults: { angle: 35, eta: 1.5, side: 'in', absorption: 0.5, distance: 1 },
    controls: [
      slider('angle', '入射角', 0, 85, 1, '°'),
      slider('eta', '介质折射率', 1.05, 2.5, 0.05),
      choice('side', '传播次序', [
        ['in', '空气 → 介质'],
        ['out', '介质 → 空气'],
      ]),
      slider('absorption', '吸收系数', 0, 3, 0.05, 'm⁻¹'),
      slider('distance', '介质内路程', 0, 3, 0.05, 'm'),
    ],
    compute(p) {
      const d = new Drawing([-1.6, 1.6, -1.6, 1.6]),
        t = (number(p, 'angle') * Math.PI) / 180,
        eta = number(p, 'eta'),
        ei = p.side === 'in' ? 1 : eta,
        et = p.side === 'in' ? eta : 1,
        f = fresnel(Math.cos(t), ei, et);
      d.line(
        [
          [-1.5, 0],
          [1.5, 0],
        ],
        palette.ink,
        2,
      );
      d.line(
        [
          [0, -1.5],
          [0, 1.5],
        ],
        palette.muted,
        1,
        1,
        true,
      );
      d.arrow([-Math.sin(t), Math.cos(t)], [0, 0], palette.yellow);
      d.arrow([0, 0], [Math.sin(t), Math.cos(t)], palette.blue);
      if (f.cosTransmitted !== null)
        d.arrow([0, 0], [(ei / et) * Math.sin(t), -f.cosTransmitted], palette.green);
      d.values = {
        反射能量比例: f.reflectance,
        透射能量比例: 1 - f.reflectance,
        全反射: f.cosTransmitted === null,
        介质路程透射率: beerLambert(number(p, 'absorption'), number(p, 'distance')),
      };
      return d.result();
    },
  },
];
