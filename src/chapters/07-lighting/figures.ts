import { Drawing, palette } from '../../figures/drawing.ts';
import { plot, bitmap } from '../../figures/helpers.ts';
import { slider, number } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec3 } from '../../math/vector.ts';
import { radians, dot } from '../../math/vector.ts';
import { transformNormals, shade } from './core.ts';
import { makeMesh, analyticNormal } from '../12-geometry/core.ts';
import { rasterizeMesh } from './mesh-shading.ts';

export const figures: FigureSpec[] = [
  {
    id: 'normal-transform',
    chapter: '07',
    title: '缩放以后，法线还垂直吗？',
    subtitle: '切向量乘 A，法线必须乘 A 的逆转置。红色保留错误对照。',
    source: '/src/chapters/07-lighting/core.ts',
    defaults: { sx: 2, sy: 0.7, angle: 40 },
    controls: [
      slider('sx', '缩放 x', 0.2, 3, 0.02),
      slider('sy', '缩放 y', 0.2, 3, 0.02),
      slider('angle', '原切线角度', 0, 180, 1, '°'),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-3.5, 3.5, -2.8, 2.8]),
        a = radians(number(p, 'angle')),
        sx = number(p, 'sx'),
        sy = number(p, 'sy'),
        t: Vec3 = [Math.cos(a), Math.sin(a), 0],
        n: Vec3 = [-Math.sin(a), Math.cos(a), 0],
        matrix = [
          [sx, 0, 0],
          [0, sy, 0],
          [0, 0, 1],
        ],
        right = transformNormals([n], matrix)[0],
        wrong = transformNormals([n], matrix, false)[0],
        tangent: Vec3 = [sx * t[0], sy * t[1], 0];
      d.axes();
      d.line([[-tangent[0], -tangent[1]], tangent], palette.blue, 3);
      d.arrow([0, 0], right, palette.green, 'A⁻ᵀn');
      d.arrow([0, 0], wrong, palette.red, 'An');
      d.values = { '正确法线·切向': dot(right, tangent), '错误法线·切向': dot(wrong, tangent) };
      d.formula = '(A^{-T}n)\\cdot(At)=n\\cdot t=0';
      return d.result();
    },
  },
  {
    id: 'light-lobes',
    chapter: '07',
    title: '把光照拆成三个贡献',
    subtitle: '改变光源角度和高光指数，比较 Lambert 与 Blinn–Phong 项。',
    source: '/src/chapters/07-lighting/core.ts',
    defaults: { light: 35, exponent: 32, ks: 0.4 },
    controls: [
      slider('light', '光源角度', -85, 85, 1, '°'),
      slider('exponent', '高光指数', 1, 512, 1),
      slider('ks', '高光系数', 0, 1, 0.01),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-1.7, 1.7, -0.2, 1.4]),
        a = radians(number(p, 'light')),
        light: Vec3 = [Math.sin(a), 0, Math.cos(a)],
        power = number(p, 'exponent'),
        ks = number(p, 'ks');
      d.axes(-1.6, 1.6, 0, 1.2);
      const at = (x: number) =>
        shade([Math.sin(x), 0, Math.cos(x)], light, [0, 0, 1], {
          kd: [0.7, 0.7, 0.7],
          ks,
          exponent: power,
          ambient: 0.08,
        });
      plot(d, (x) => at(x).diffuse[0], [-Math.PI / 2, Math.PI / 2], palette.blue);
      plot(d, (x) => at(x).specular[0], [-Math.PI / 2, Math.PI / 2], palette.yellow);
      plot(d, (x) => at(x).total[0], [-Math.PI / 2, Math.PI / 2], palette.green);
      d.values = { 蓝色: '漫反射', 金色: '高光', 绿色: '总和', 正面总亮度: at(0).total[0] };
      d.formula = 'L=k_a+k_d\\max(0,n\\cdot l)+k_s\\max(0,n\\cdot h)^s';
      return d.result();
    },
  },
  {
    id: 'shading-frequency',
    chapter: '07',
    title: '同一张网格，三个计算光照的位置',
    subtitle: 'Flat 在面上算，Gouraud 在顶点算，Phong 在像素处算。',
    source: '/src/chapters/07-lighting/mesh-shading.ts',
    defaults: { detail: 8, exponent: 96 },
    controls: [slider('detail', '纬向分段', 3, 32, 1), slider('exponent', '高光指数', 1, 256, 1)],
    animated: false,
    compute(p) {
      const d = new Drawing([-3.4, 3.4, -1.2, 1.5]),
        mesh = makeMesh([1, 1, 1], number(p, 'detail'), number(p, 'detail') * 2),
        frame = rasterizeMesh(
          mesh.vertices,
          mesh.faces,
          mesh.vertices.map((v) => analyticNormal(v)),
          96,
          1.3,
          [-3, 4, 5],
          { exponent: number(p, 'exponent'), ks: 0.7 },
        );
      for (const [i, key] of (['flat', 'gouraud', 'phong'] as const).entries())
        d.panel(key, [-1.15, 1.15, -1.15, 1.4], () => {
          bitmap(d, { width: 96, height: 96, data: frame.images[key] }, [-1, -1], [2, 2]);
          d.text([-0.9, 1.2], key, palette.ink, 16);
        });
      d.values = {
        'Flat 求值': frame.evaluations.flat,
        'Gouraud 求值': frame.evaluations.gouraud,
        'Phong 求值': frame.evaluations.phong,
      };
      return d.result();
    },
  },
];
