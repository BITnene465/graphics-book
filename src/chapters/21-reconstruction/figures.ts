import { Drawing, palette } from '../../figures/drawing.ts';
import { drawMesh } from '../../figures/advanced.ts';
import { slider, number, vec2 } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { triangulateRays, icp, tetraSurface } from './core.ts';
export const figures: FigureSpec[] = [
  {
    id: 'stereo-triangulation',
    chapter: '21',
    title: '两条视线约束同一个点',
    subtitle: '拖动空间点，改变基线或匹配误差，比较深度误差。',
    source: '/src/chapters/21-reconstruction/core.ts',
    animated: false,
    defaults: { target: [0.3, 3], baseline: 1, error: 0 },
    controls: [
      slider('baseline', '基线', 0.15, 2, 0.05),
      slider('error', '右图归一化误差', -0.05, 0.05, 0.001),
    ],
    compute(p) {
      const d = new Drawing([-2, 2, -0.4, 5]),
        t = vec2(p, 'target'),
        b = number(p, 'baseline'),
        o: Vec3[] = [
          [-b / 2, 0, 0],
          [b / 2, 0, 0],
        ],
        dirs: Vec3[] = [
          [t[0] + b / 2, 0, -t[1]],
          [(t[0] - b / 2) / t[1] + number(p, 'error'), 0, -1],
        ];
      let out: Vec3 | null = null;
      try {
        out = triangulateRays(o, dirs);
      } catch {
        /* Parallel views do not determine a finite depth. */
      }
      o.forEach((v, i) => {
        const xy = [v[0], 0];
        d.dot(xy, palette.yellow, 0.07);
        const slope = dirs[i][0] / -dirs[i][2];
        d.line([xy, [v[0] + 5 * slope, 5]], i ? palette.green : palette.blue, 2);
      });
      if (out && out[0] >= -2 && out[0] <= 2 && -out[2] >= -0.4 && -out[2] <= 5)
        d.dot([out[0], -out[2]], palette.red, 0.07);
      d.handle(t, 'target', '真实点', { limits: [-1.3, 1.3, 1, 4.3] });
      d.values = {
        真实轴向距离: t[1],
        重建轴向距离: out ? -out[2] : '无法确定',
        距离误差: out ? -out[2] - t[1] : '无有限解',
        状态: !out
          ? '视线平行'
          : out[2] >= 0
            ? '交点在相机后方'
            : -out[2] > 5
              ? '交点超出当前视图'
              : '前方交点',
      };
      return d.result();
    },
  },
  {
    id: 'point-cloud-registration',
    chapter: '21',
    title: '对应关系与刚体变换交替求解',
    subtitle: '改变初始姿态，播放最近邻 ICP 的迭代。',
    source: '/src/chapters/21-reconstruction/core.ts',
    animated: true,
    defaults: { angle: 25, shift: [0.4, 0.2], steps: 12 },
    controls: [
      slider('angle', '初始转角', -100, 100, 1, '°'),
      slider('steps', '迭代次数', 1, 30, 1),
    ],
    compute(p, progress) {
      const d = new Drawing([-2.3, 2.3, -2, 2]),
        target: Vec2[] = Array.from({ length: 40 }, (_, i) => {
          const a = (i / 40) * 2 * Math.PI,
            r = 1 + 0.25 * Math.cos(3 * a);
          return [r * Math.cos(a), 0.7 * r * Math.sin(a)];
        }),
        a = (number(p, 'angle') * Math.PI) / 180,
        shift = vec2(p, 'shift'),
        source = target.map(
          ([x, y]) =>
            [
              Math.cos(a) * x - Math.sin(a) * y + shift[0],
              Math.sin(a) * x + Math.cos(a) * y + shift[1],
            ] as Vec2,
        ),
        out = icp(source, target, Math.floor(progress * number(p, 'steps')));
      target.forEach((v) => d.dot(v, palette.muted, 0.035));
      out.points.forEach((v) => d.dot(v, palette.blue, 0.03));
      d.handle(shift, 'shift', '初始位移', { limits: [-1, 1, -0.7, 0.7] });
      d.values = { 已执行迭代: out.errors.length, 配对均方误差: out.errors.at(-1) ?? '尚未迭代' };
      return d.result();
    },
  },
  {
    id: 'tetra-isosurface',
    orbitPanels: ['分片线性标量场'],
    chapter: '21',
    title: '标量样本之间的等值面',
    subtitle: '改变阈值，观察交点沿四面体边移动。',
    source: '/src/chapters/21-reconstruction/core.ts',
    animated: false,
    defaults: { level: 0.5, azimuth: 35, elevation: 25 },
    controls: [
      slider('level', '等值阈值', 0.05, 0.95),
      slider('azimuth', '观察方位', -180, 180, 1, '°'),
      slider('elevation', '观察仰角', -60, 70, 1, '°'),
    ],
    compute(p) {
      const d = new Drawing(),
        vertices: Vec3[] = [
          [-1, -1, 0],
          [1, -1, 0],
          [0, 1, 0],
          [0, 0, 1.5],
        ],
        triangles = tetraSurface(
          vertices,
          [0, 0.2, 0.7, 1].map((x) => x - number(p, 'level')),
        );
      d.panel('分片线性标量场', [-2, 2, -1.7, 1.7], () => {
        drawMesh(
          d,
          {
            vertices,
            faces: [
              [0, 2, 1],
              [0, 1, 3],
              [1, 2, 3],
              [2, 0, 3],
            ],
          },
          number(p, 'azimuth'),
          number(p, 'elevation'),
          palette.muted,
        );
        drawMesh(
          d,
          {
            vertices: triangles.flat(),
            faces: triangles.map((_, i) => [3 * i, 3 * i + 1, 3 * i + 2]),
          },
          number(p, 'azimuth'),
          number(p, 'elevation'),
          palette.green,
        );
      });
      d.values = { 输出三角形: triangles.length, 等值阈值: number(p, 'level') };
      return d.result();
    },
  },
];
