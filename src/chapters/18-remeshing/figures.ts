import { Drawing, palette } from '../../figures/drawing.ts';
import { slider, number, choice } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { drawMesh } from '../../figures/advanced.ts';
import { cubeMesh, triangulate, gridMesh, adjacency } from '../../math/mesh.ts';
import { catmullClark } from '../16-subdivision/core.ts';
import { simplify, cluster, splitEdge } from './core.ts';
import { latheMesh, shadeProfile } from '../../book-scene/geometry.ts';

export const figures: FigureSpec[] = [
  {
    id: 'quadric-collapse',
    orbitPanels: ['原网格', '折叠后'],
    chapter: '18',
    title: '少一条边，需要付出多少平面误差',
    subtitle: '播放合法边折叠；原始面的误差二次型沿合并累积，轮廓与面数同时观察。',
    source: '/src/chapters/18-remeshing/core.ts',
    animated: true,
    duration: 8,
    defaults: { steps: 10, azimuth: 35, elevation: 30, shape: 'shade' },
    controls: [
      choice('shape', '参考几何', [
        ['shade', '台灯灯罩'],
        ['cube', '细分立方体'],
      ]),
      slider('steps', '折叠上限', 0, 18, 1),
      slider('azimuth', '观察方位', -180, 180, 1, '°'),
      slider('elevation', '观察仰角', -60, 70, 1, '°'),
    ],
    compute(p, t) {
      const d = new Drawing(),
        original = triangulate(
          p.shape === 'shade' ? latheMesh(shadeProfile(0, 3), 8) : catmullClark(cubeMesh()),
        ),
        result = simplify(original, Math.floor(number(p, 'steps') * t)),
        az = number(p, 'azimuth'),
        el = number(p, 'elevation');
      // 世界 Y 在这张局部数学图中显示为竖直 Z；仅调整显示，不改变误差求解。
      const display = (mesh: typeof original) =>
        p.shape === 'shade'
          ? {
              ...mesh,
              vertices: mesh.vertices.map(
                ([x, y, z]) => [2 * x, 2 * z, 2 * (y - 0.17)] as [number, number, number],
              ),
            }
          : mesh;
      d.panel('原网格', [-1.4, 1.4, -1.4, 1.4], () =>
        drawMesh(d, display(original), az, el, palette.muted),
      );
      d.panel('折叠后', [-1.4, 1.4, -1.4, 1.4], () => drawMesh(d, display(result.mesh), az, el));
      const E = adjacency(result.mesh).edges.length;
      d.values = {
        执行折叠: result.costs.length,
        顶点: result.mesh.vertices.length,
        面: result.mesh.faces.length,
        Euler值: result.mesh.vertices.length - E + result.mesh.faces.length,
        最后代价: result.costs.at(-1) ?? 0,
      };
      d.formula = 'E(p)=\\bar p^T(Q_a+Q_b)\\bar p';
      return d.result();
    },
  },
  {
    id: 'vertex-clusters',
    orbitPanels: ['原始位置与连接', '格内合并'],
    chapter: '18',
    title: '聚类的格子不是表面误差保证',
    subtitle: '改变空间格子尺寸，观察顶点数与局部连接怎样一同改变。',
    source: '/src/chapters/18-remeshing/core.ts',
    animated: false,
    defaults: { cell: 0.3, azimuth: 35, elevation: 35 },
    controls: [
      slider('cell', '空间格子边长', 0.12, 0.9, 0.02),
      slider('azimuth', '观察方位', -180, 180, 1, '°'),
      slider('elevation', '观察仰角', -60, 70, 1, '°'),
    ],
    compute(p) {
      const d = new Drawing(),
        mesh = gridMesh(14, (x, y) => 0.3 * Math.sin(3 * x) * Math.cos(3 * y)),
        next = cluster(mesh, number(p, 'cell')),
        az = number(p, 'azimuth'),
        el = number(p, 'elevation');
      d.panel('原始位置与连接', [-1.8, 1.8, -1.6, 1.6], () =>
        drawMesh(d, mesh, az, el, palette.muted),
      );
      d.panel('格内合并', [-1.8, 1.8, -1.6, 1.6], () => drawMesh(d, next, az, el));
      d.values = {
        原始顶点: mesh.vertices.length,
        聚类顶点: next.vertices.length,
        保留面: next.faces.length,
        退化或重复面: mesh.faces.length - next.faces.length,
      };
      return d.result();
    },
  },
  {
    id: 'remesh-long-edges',
    orbitPanels: ['粗参考网格', '拆分与投影'],
    chapter: '18',
    title: '重采样先问哪些地方太稀',
    subtitle: '逐次拆分最长边，再投回已知参考表面；细分规则与表面投影承担不同职责。',
    source: '/src/chapters/18-remeshing/core.ts',
    animated: true,
    duration: 7,
    defaults: { steps: 20, azimuth: 35, elevation: 35 },
    controls: [
      slider('steps', '分裂步数', 0, 40, 1),
      slider('azimuth', '观察方位', -180, 180, 1, '°'),
      slider('elevation', '观察仰角', -60, 70, 1, '°'),
    ],
    compute(p, t) {
      const d = new Drawing(),
        height = (x: number, y: number) => 0.4 * Math.cos(2 * x) * Math.sin(2 * y);
      let mesh = gridMesh(3, height);
      const original = mesh,
        k = Math.floor(t * number(p, 'steps'));
      for (let i = 0; i < k; i++) {
        const e = adjacency(mesh).edges.sort(
          (a, b) =>
            Math.hypot(...mesh.vertices[b.a].map((v, j) => v - mesh.vertices[b.b][j])) -
            Math.hypot(...mesh.vertices[a.a].map((v, j) => v - mesh.vertices[a.b][j])),
        )[0];
        mesh = splitEdge(mesh, e.a, e.b);
        const v = mesh.vertices.at(-1)!;
        v[2] = height(v[0], v[1]);
      }
      const az = number(p, 'azimuth'),
        el = number(p, 'elevation'),
        lengths = adjacency(mesh).edges.map((e) =>
          Math.hypot(...mesh.vertices[e.a].map((v, j) => v - mesh.vertices[e.b][j])),
        );
      d.panel('粗参考网格', [-1.8, 1.8, -1.5, 1.5], () =>
        drawMesh(d, original, az, el, palette.muted),
      );
      d.panel('拆分与投影', [-1.8, 1.8, -1.5, 1.5], () => drawMesh(d, mesh, az, el));
      d.values = {
        分裂: k,
        面数: mesh.faces.length,
        最短边: Math.min(...lengths),
        最长边: Math.max(...lengths),
      };
      return d.result();
    },
  },
];
