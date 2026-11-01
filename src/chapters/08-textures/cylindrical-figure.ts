import { Drawing, palette } from '../../figures/drawing.ts';
import { axes3, rectangle } from '../../figures/helpers.ts';
import { number, slider, vec2 } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec3 } from '../../math/vector.ts';
import { project } from '../12-geometry/core.ts';
import { cylinderPoint, cylindricalUV } from './cylindrical.ts';

export const cylindricalFigure: FigureSpec = {
  id: 'cylindrical-address',
  chapter: '08',
  title: '把一张矩形地址图卷成圆柱',
  subtitle: '拖动右侧 UV 点；接缝两侧的地址不同，却对应同一条空间母线。',
  source: '/src/chapters/08-textures/cylindrical.ts',
  defaults: { uv: [0.15, 0.6], radius: 1, height: 2.2, azimuth: 35, elevation: 25 },
  controls: [
    slider('radius', '圆柱半径', 0.4, 1.6, 0.02),
    slider('height', '圆柱高度', 0.8, 3.8, 0.02),
    slider('azimuth', '观察方位', -180, 180, 1, '°'),
    slider('elevation', '观察仰角', -70, 70, 1, '°'),
  ],
  animated: false,
  compute(p) {
    const d = new Drawing(),
      [u, v] = vec2(p, 'uv'),
      r = number(p, 'radius'),
      h = number(p, 'height'),
      az = number(p, 'azimuth'),
      el = number(p, 'elevation'),
      point = cylinderPoint(r, h, u, v),
      uv = cylindricalUV(point, h)!,
      view = (points: Vec3[]) => project(points, az, el).xy,
      tile = (i: number, j: number) => ((i + j) % 2 ? palette.blue : palette.green);
    d.panel(
      '圆柱表面与空间位置',
      [-2.7, 2.7, -2.6, 2.6],
      () => {
        axes3(d, az, el, 1.7);
        const faces: { points: Vec3[]; depth: number; color: string }[] = [];
        for (let i = 0; i < 24; i++)
          for (let j = 0; j < 8; j++) {
            const ps = [
              [i / 24, j / 8],
              [(i + 1) / 24, j / 8],
              [(i + 1) / 24, (j + 1) / 8],
              [i / 24, (j + 1) / 8],
            ].map(([a, b]) => cylinderPoint(r, h, a, b));
            faces.push({
              points: ps,
              depth: project(ps, az, el).depth.reduce((s, x) => s + x, 0),
              color: tile(Math.floor(i / 3), j),
            });
          }
        faces
          .sort((a, b) => a.depth - b.depth)
          .forEach((f) => d.polygon(view(f.points), f.color, 0.32));
        for (const t of [0, 0.25, 0.5, 0.75, 1])
          d.line(
            view(Array.from({ length: 97 }, (_, i) => cylinderPoint(r, h, i / 96, t))),
            palette.muted,
            1,
            0.65,
          );
        for (let i = 0; i < 8; i++)
          d.line(
            view([cylinderPoint(r, h, i / 8, 0), cylinderPoint(r, h, i / 8, 1)]),
            i ? palette.muted : palette.yellow,
            i ? 1 : 2,
            0.8,
          );
        d.line(
          view(Array.from({ length: 97 }, (_, i) => cylinderPoint(r, h, i / 96, v))),
          palette.yellow,
          1.7,
        );
        d.line(view([cylinderPoint(r, h, u, 0), cylinderPoint(r, h, u, 1)]), palette.yellow, 1.7);
        d.dot(view([point])[0], palette.yellow, 0.075);
        d.text([-2.35, 2.27], '透明示意 · 黄色母线为 u = 0 / 1', palette.muted, 12);
      },
      1.3,
    );
    d.panel('材质参数域', [-0.2, 1.2, -0.2, 1.2], () => {
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 8; j++) rectangle(d, [i / 8, j / 8], [1 / 8, 1 / 8], tile(i, j), 0.35);
      d.line(
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
        palette.muted,
        1.2,
      );
      d.line(
        [
          [0, 0],
          [0, 1],
        ],
        palette.yellow,
        2,
      );
      d.line(
        [
          [1, 0],
          [1, 1],
        ],
        palette.yellow,
        2,
      );
      d.line(
        [
          [u, 0],
          [u, 1],
        ],
        palette.yellow,
        1.4,
      );
      d.line(
        [
          [0, v],
          [1, v],
        ],
        palette.yellow,
        1.4,
      );
      d.handle([u, v], 'uv', 'UV', { limits: [0, 1, 0, 1] });
      d.text([0, -0.1], '0', palette.muted, 12);
      d.text([0.92, -0.1], '1 · u', palette.muted, 12);
      d.text([-0.13, 0.95], 'v', palette.muted, 12);
      d.text([0.03, 1.12], '左右边属于同一条接缝', palette.muted, 12);
    });
    d.values = {
      输入UV: [u, v],
      空间位置: point,
      反求UV: uv,
      每单位u弧长: 2 * Math.PI * r,
      每单位v高度: h,
      等分纹格宽高比: (2 * Math.PI * r) / h,
    };
    d.formula = 'p(u,v)=(r\\cos2\\pi u,\\ r\\sin2\\pi u,\\ h(v-1/2))';
    return d.result();
  },
};
