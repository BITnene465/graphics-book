import { subdivision as deskFigure } from '../../book-scene/geometry-studies.ts';
import { Drawing, palette } from '../../figures/drawing.ts';
import { choice, slider, number, points } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { drawMesh, heightHandle } from '../../figures/advanced.ts';
import { cubeMesh, triangulate } from '../../math/mesh.ts';
import type { Vec3 } from '../../math/vector.ts';
import {
  catmullClark,
  loopSubdivision,
  dooSabin,
  butterflyPoint,
  dooSabinWeights,
  weighted,
} from './core.ts';
import { project } from '../12-geometry/core.ts';

export const figures: FigureSpec[] = [
  deskFigure,
  {
    id: 'subdivision-editor',
    orbitPanels: ['控制网', '有限细分网格'],
    chapter: '16',
    title: '同一控制网，怎样趋向一张曲面',
    subtitle: '上下拖动左图顶点；播放逐层细分，观察旧点是否移动与面数怎样增长。',
    source: '/src/chapters/16-subdivision/core.ts',
    animated: true,
    duration: 7,
    defaults: {
      control: cubeMesh().vertices,
      method: 'catmull',
      levels: 2,
      azimuth: 35,
      elevation: 28,
    },
    controls: [
      choice('method', '细分规则', [
        ['catmull', 'Catmull–Clark'],
        ['loop', 'Loop'],
        ['doo', 'Doo–Sabin'],
      ]),
      slider('levels', '细分层数', 0, 3, 1),
      slider('azimuth', '观察方位', -180, 180, 1, '°'),
      slider('elevation', '观察仰角', -60, 70, 1, '°'),
    ],
    compute(p, progress) {
      const d = new Drawing(),
        az = number(p, 'azimuth'),
        el = number(p, 'elevation'),
        input = { vertices: points(p, 'control') as Vec3[], faces: cubeMesh().faces };
      let mesh = p.method === 'loop' ? triangulate(input) : input;
      const level = Math.floor(progress * number(p, 'levels') + 1e-8);
      for (let i = 0; i < level; i++)
        mesh =
          p.method === 'catmull'
            ? catmullClark(mesh)
            : p.method === 'loop'
              ? loopSubdivision(mesh)
              : dooSabin(mesh);
      d.panel('控制网', [-2, 2, -2, 2], () => {
        drawMesh(d, input, az, el, palette.muted);
        input.vertices.forEach((v, i) => heightHandle(d, v, i, 'control', az, el, 'P' + i));
      });
      d.panel('有限细分网格', [-2, 2, -2, 2], () => drawMesh(d, mesh, az, el));
      d.values = {
        已执行层数: level,
        顶点数: mesh.vertices.length,
        面数: mesh.faces.length,
        控制点数: input.vertices.length,
      };
      d.formula =
        p.method === 'catmull'
          ? 'p^{\\prime}=(\\bar F+2\\bar R+(m-3)p)/m'
          : p.method === 'loop'
            ? 'p^{\\prime}=(1-m\\beta_m)p+\\beta_m\\sum_j p_j'
            : 'p_i^{\\prime}=\\sum_j\\alpha_{ij}p_j';
      return d.result();
    },
  },
  {
    id: 'subdivision-stencils',
    orbitPanels: ['空间模板'],
    chapter: '16',
    title: '局部模板的正权、负权与插值',
    subtitle: '拖动模板点的高度；比较输出与权重，检查仿射组合为什么可能越出凸包。',
    source: '/src/chapters/16-subdivision/core.ts',
    animated: false,
    defaults: {
      control: [
        [-0.7, 0, 0],
        [0.7, 0, 0],
        [0, 0.8, 0.2],
        [0, -0.8, 0.2],
        [-1.4, 0.8, 0],
        [1.4, 0.8, 0],
        [-1.4, -0.8, 0],
        [1.4, -0.8, 0],
      ],
      method: 'butterfly',
      azimuth: 35,
      elevation: 45,
    },
    controls: [
      choice('method', '局部规则', [
        ['butterfly', 'Butterfly 八点'],
        ['doo', 'Doo–Sabin 四边形'],
      ]),
      slider('azimuth', '观察方位', -180, 180, 1, '°'),
      slider('elevation', '观察仰角', 10, 70, 1, '°'),
    ],
    compute(p) {
      const d = new Drawing(),
        ps = points(p, 'control') as Vec3[],
        az = number(p, 'azimuth'),
        el = number(p, 'elevation');
      const ids = p.method === 'butterfly' ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 2, 1, 3],
        weights =
          p.method === 'butterfly'
            ? [0.5, 0.5, 0.125, 0.125, -0.0625, -0.0625, -0.0625, -0.0625]
            : dooSabinWeights(4, 0);
      const out =
          p.method === 'butterfly'
            ? butterflyPoint(ps)
            : weighted(
                ids.map((i) => ps[i]),
                weights,
              ),
        xy = project(ps, az, el).xy;
      d.panel('空间模板', [-2.3, 2.3, -2, 2], () => {
        for (const i of ids) {
          d.line(
            [xy[i], project([out], az, el).xy[0]],
            weights[ids.indexOf(i)] < 0 ? palette.red : palette.blue,
            1,
          );
          heightHandle(d, ps[i], i, 'control', az, el, 'P' + i);
        }
        d.dot(project([out], az, el).xy[0], palette.green, 0.08);
      });
      d.panel('输入点的权重', [-0.5, ids.length - 0.5, -0.2, 0.7], () => {
        d.axes(-0.4, ids.length - 0.6, -0.15, 0.65);
        weights.forEach((w, i) => {
          d.line(
            [
              [i, 0],
              [i, w],
            ],
            w < 0 ? palette.red : palette.blue,
            8,
          );
          d.text([i - 0.15, -0.1], String(ids[i]), palette.muted, 12);
        });
      });
      d.values = {
        输出位置: out,
        权重之和: weights.reduce((a, b) => a + b, 0),
        最小权重: Math.min(...weights),
        旧点是否保留: p.method === 'butterfly' ? '保留；这里只算新边点' : '近似模板会移动点',
      };
      return d.result();
    },
  },
];
