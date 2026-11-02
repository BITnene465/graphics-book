import { parameterization as deskFigure } from '../../book-scene/geometry-studies.ts';
import { Drawing, palette } from '../../figures/drawing.ts';
import { drawMesh } from '../../figures/advanced.ts';
import { slider, choice, number, vec2, points } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { gridMesh, adjacency } from '../../math/mesh.ts';
import { harmonic, lscm, distortion } from './core.ts';
export const figures: FigureSpec[] = [
  deskFigure,
  {
    id: 'mesh-uv-map',
    orbitPanels: ['空间表面'],
    chapter: '19',
    title: '同一曲面，两种展开约束',
    subtitle: '固定整个边界，或仅固定两个点；观察角度失真和翻转计数。',
    source: '/src/chapters/19-parameterization/core.ts',
    animated: false,
    defaults: { height: 0.7, method: 'harmonic', azimuth: 35, elevation: 40, pin: [1, 1] },
    controls: [
      slider('height', '曲面起伏', 0, 1.4),
      choice('method', '约束', [
        ['harmonic', '调和 · 圆边界'],
        ['lscm', 'LSCM · 两点'],
      ]),
      slider('azimuth', '观察方位', -180, 180, 1, '°'),
      slider('elevation', '观察仰角', 10, 75, 1, '°'),
    ],
    compute(p) {
      const d = new Drawing(),
        m = gridMesh(6, (x, y) => number(p, 'height') * (1 - x * x) * (1 - y * y)),
        boundary = new Map<number, Vec2>();
      adjacency(m).boundary.forEach((b, i) => {
        if (b.length) {
          const [x, y] = m.vertices[i],
            t = Math.atan2(y, x);
          boundary.set(i, [Math.cos(t), Math.sin(t)]);
        }
      });
      const pin = vec2(p, 'pin'),
        uv =
          p.method === 'harmonic'
            ? harmonic(m, boundary)
            : lscm(
                m,
                new Map([
                  [0, [-1, -1]],
                  [48, pin],
                ]),
              );
      d.panel('空间表面', [-2, 2, -1.8, 1.8], () =>
        drawMesh(d, m, number(p, 'azimuth'), number(p, 'elevation')),
      );
      d.panel('参数域', [-2, 2, -1.8, 1.8], () => {
        drawMesh(d, { vertices: uv.map((v) => [...v, 0] as Vec3), faces: m.faces }, -90, 90);
        if (p.method === 'lscm') d.handle(pin, 'pin', '固定点', { limits: [0.2, 1.5, 0.2, 1.5] });
      });
      const ds = m.faces.map((f) => distortion(m, uv, f));
      d.values = {
        最大角度失真比: Math.max(...ds.map((x) => x.ratio)),
        翻转面数: ds.filter((x) => x.det <= 0).length,
        固定顶点数: p.method === 'harmonic' ? boundary.size : 2,
      };
      return d.result();
    },
  },
  {
    id: 'uv-jacobian',
    chapter: '19',
    title: '把小圆映成椭圆',
    subtitle: '拖动参数三角形的顶点，直接检查长度、面积和定向。',
    source: '/src/chapters/19-parameterization/core.ts',
    animated: false,
    defaults: {
      uv: [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
    },
    controls: [],
    compute(p) {
      const d = new Drawing(),
        uv = points(p, 'uv') as Vec2[],
        m = {
          vertices: [
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 0],
          ] as Vec3[],
          faces: [[0, 1, 2]],
        },
        v = distortion(m, uv, [0, 1, 2]);
      d.panel('单位切平面', [-0.6, 2.6, -1.6, 1.6], () => {
        d.polygon([
          [0, 0],
          [1, 0],
          [0, 1],
        ]);
        d.line(
          Array.from({ length: 65 }, (_, i) => [
            0.3 + 0.2 * Math.cos((i * Math.PI) / 32),
            0.3 + 0.2 * Math.sin((i * Math.PI) / 32),
          ]),
          palette.green,
          2,
        );
      });
      d.panel('UV 映射', [-0.6, 2.6, -1.6, 1.6], () => {
        d.polygon(uv, v.det > 0 ? palette.blue : palette.red);
        d.line(
          Array.from({ length: 65 }, (_, i) => {
            const u = 0.3 + 0.2 * Math.cos((i * Math.PI) / 32),
              v = 0.3 + 0.2 * Math.sin((i * Math.PI) / 32);
            return [0, 1].map((c) => (1 - u - v) * uv[0][c] + u * uv[1][c] + v * uv[2][c]);
          }),
          palette.green,
          2,
        );
        uv.forEach((x, i) =>
          d.handle(x, 'uv', 'UV' + i, { index: i, limits: [-0.4, 2.4, -1.4, 1.4] }),
        );
      });
      d.values = {
        面积倍率: v.det,
        最大伸长: v.max,
        最小伸长: v.min,
        角度失真比: Number.isFinite(v.ratio) ? v.ratio : '退化',
      };
      return d.result();
    },
  },
];
