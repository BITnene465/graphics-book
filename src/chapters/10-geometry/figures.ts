import { Drawing, palette } from '../../figures/drawing.ts';
import { slider, number } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec3 } from '../../math/vector.ts';
import { add, scale } from '../../math/vector.ts';
import {
  parametric,
  tangents,
  analyticNormal,
  implicit,
  makeMesh,
  meshStatistics,
  project,
  faceGeometry,
} from './core.ts';

const controls = [
  slider('a', '半轴 a', 0.3, 2, 0.02),
  slider('b', '半轴 b', 0.3, 2, 0.02),
  slider('c', '半轴 c', 0.3, 2, 0.02),
  slider('azimuth', '观察方位', -180, 180, 1, '°'),
  slider('elevation', '观察仰角', -80, 80, 1, '°'),
];
const defaults = { a: 1.4, b: 1, c: 0.75, azimuth: 35, elevation: 25 };
function drawMesh(
  d: Drawing,
  axes: Vec3,
  detail: number,
  azimuth: number,
  elevation: number,
): void {
  const m = makeMesh(axes, detail, detail * 2),
    projection = project(m.vertices, azimuth, elevation),
    geometry = faceGeometry(m.vertices, m.faces);
  const order = m.faces
    .map((_, i) => i)
    .sort(
      (a, b) =>
        m.faces[a].reduce((s, i) => s + projection.depth[i], 0) -
        m.faces[b].reduce((s, i) => s + projection.depth[i], 0),
    );
  order.forEach((i) => {
    const face = m.faces[i].map((j) => projection.xy[j]);
    d.polygon(face, palette.blue, 0.055);
    d.line([...face, face[0]], palette.green, 0.6, 0.45);
  });
}
export const figures: FigureSpec[] = [
  {
    id: 'surface-normal',
    chapter: '10',
    title: '隐式梯度与参数切向说的是同一张曲面',
    subtitle: '在表面移动参数点；极点处参数切向退化，但隐式法线仍可定义。',
    source: '/src/chapters/10-geometry/core.ts',
    defaults: { ...defaults, u: 45, v: 65 },
    controls: [
      slider('u', '经度 u', 0, 360, 1, '°'),
      slider('v', '极角 v', 0, 180, 1, '°'),
      ...controls,
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-2.6, 2.6, -2.3, 2.3]),
        axes: Vec3 = [number(p, 'a'), number(p, 'b'), number(p, 'c')],
        u = (number(p, 'u') * Math.PI) / 180,
        v = (number(p, 'v') * Math.PI) / 180,
        at = parametric(u, v, axes),
        t = tangents(u, v, axes),
        n = analyticNormal(at, axes),
        az = number(p, 'azimuth'),
        el = number(p, 'elevation');
      drawMesh(d, axes, 12, az, el);
      const xy = project(
        [
          at,
          add(at, scale(t.du, 0.6)) as Vec3,
          add(at, scale(t.dv, 0.6)) as Vec3,
          add(at, scale(n, 0.8)) as Vec3,
        ],
        az,
        el,
      ).xy;
      d.arrow(xy[0], xy[1], palette.blue, 'pᵤ');
      d.arrow(xy[0], xy[2], palette.green, 'pᵥ');
      d.arrow(xy[0], xy[3], palette.yellow, '∇F');
      d.dot(xy[0], palette.yellow, 0.045);
      d.values = { 'F(p)': implicit(at, axes), 位置: at, 法线: n, 参数正则: Math.sin(v) > 1e-10 };
      d.formula = 'n=\\frac{\\nabla F}{\\|\\nabla F\\|}';
      return d.result();
    },
  },
  {
    id: 'mesh-refine',
    chapter: '10',
    title: '三角网格在逼近什么？',
    subtitle: '增加分段保持解析曲面不变；网格体积与径向误差逐渐收敛。',
    source: '/src/chapters/10-geometry/core.ts',
    defaults: { ...defaults, detail: 8 },
    controls: [slider('detail', '纬向分段', 2, 48, 1), ...controls],
    animated: false,
    compute(p) {
      const d = new Drawing([-2.6, 2.6, -2.3, 2.3]),
        axes: Vec3 = [number(p, 'a'), number(p, 'b'), number(p, 'c')],
        n = number(p, 'detail'),
        m = makeMesh(axes, n, 2 * n),
        s = meshStatistics(m.vertices, m.faces, axes);
      drawMesh(d, axes, n, number(p, 'azimuth'), number(p, 'elevation'));
      d.values = {
        'V − E + F': s.euler,
        封闭边: s.closedEdges,
        三角形: s.faces,
        体积相对误差: s.relativeVolumeError,
        面心径向误差: s.maxRadialSampleError,
      };
      return d.result();
    },
  },
];
