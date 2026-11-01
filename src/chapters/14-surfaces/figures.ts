import { Drawing, palette } from '../../figures/drawing.ts';
import { slider, choice, number } from '../../figures/spec.ts';
import type { FigureSpec, Params } from '../../figures/spec.ts';
import type { Vec3 } from '../../math/vector.ts';
import { add, scale } from '../../math/vector.ts';
import { project } from '../12-geometry/core.ts';
import {
  evaluatePatch,
  deCasteljauPatch,
  surfaceFrame,
  stitchPatches,
  joinDiagnostics,
  defaultControl,
} from './core.ts';
import type { ControlNet } from './core.ts';
import type { Continuity } from '../13-bezier/splines.ts';

function net(p: Params): ControlNet {
  const control = defaultControl();
  control[1][1][1] = number(p, 'height');
  return control;
}
const defaults = { u: 0.4, v: 0.6, height: 1.05, azimuth: 35, elevation: 25 };
const controls = [
  slider('u', '参数 u', 0, 1, 0.005),
  slider('v', '参数 v', 0, 1, 0.005),
  slider('height', '控制点 P₁₁ 高度', -2, 3, 0.02),
  slider('azimuth', '观察方位', -180, 180, 1, '°'),
  slider('elevation', '观察仰角', -80, 80, 1, '°'),
];
function projection(p: Params, vertices: Vec3[]) {
  return project(vertices, number(p, 'azimuth'), number(p, 'elevation')).xy;
}
function drawPatch(d: Drawing, p: Params, control: ControlNet, color = palette.green) {
  for (let i = 0; i <= 10; i++) {
    d.line(
      projection(
        p,
        Array.from({ length: 41 }, (_, j) => evaluatePatch(control, i / 10, j / 40)),
      ),
      color,
      1.1,
      0.7,
    );
    d.line(
      projection(
        p,
        Array.from({ length: 41 }, (_, j) => evaluatePatch(control, j / 40, i / 10)),
      ),
      color,
      1.1,
      0.7,
    );
  }
}
export const figures: FigureSpec[] = [
  {
    id: 'patch-construction',
    chapter: '14',
    title: '先沿一个参数收缩，再沿另一个参数收缩',
    subtitle: '两轮 de Casteljau 与张量积公式得到同一个曲面点。',
    source: '/src/chapters/14-surfaces/core.ts',
    defaults: { ...defaults, order: 'u' },
    controls: [
      ...controls,
      choice('order', '构造顺序', [
        ['u', '先 u 后 v'],
        ['v', '先 v 后 u'],
      ]),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-2.8, 2.8, -2.4, 2.4]),
        control = net(p),
        result = deCasteljauPatch(control, number(p, 'u'), number(p, 'v'), p.order as 'u' | 'v');
      drawPatch(d, p, control);
      control.forEach((row) => d.line(projection(p, row), palette.muted, 1, 1, true));
      control[0].forEach((_, j) =>
        d.line(
          projection(
            p,
            control.map((row) => row[j]),
          ),
          palette.muted,
          1,
          1,
          true,
        ),
      );
      d.line(projection(p, result.intermediate), palette.blue, 2);
      d.dot(projection(p, [result.position])[0], palette.yellow, 0.07);
      d.values = { 曲面位置: result.position, 第一轮控制点: result.intermediate };
      d.formula = 'S(u,v)=\\sum_i\\sum_jB_i^m(u)B_j^n(v)P_{ij}';
      return d.result();
    },
  },
  {
    id: 'patch-frame',
    chapter: '14',
    title: '局部切平面、面积与曲率',
    subtitle: '等参线的切向给出法线；二阶偏导决定局部弯曲。',
    source: '/src/chapters/14-surfaces/core.ts',
    defaults,
    controls,
    animated: false,
    compute(p) {
      const d = new Drawing([-2.8, 2.8, -2.4, 2.4]),
        control = net(p),
        frame = surfaceFrame(control, number(p, 'u'), number(p, 'v'));
      drawPatch(d, p, control);
      const ps = projection(p, [
        frame.position,
        add(frame.position, scale(frame.du, 0.3)) as Vec3,
        add(frame.position, scale(frame.dv, 0.3)) as Vec3,
        add(frame.position, scale(frame.normal, 0.8)) as Vec3,
      ]);
      d.arrow(ps[0], ps[1], palette.blue, 'Sᵤ');
      d.arrow(ps[0], ps[2], palette.green, 'Sᵥ');
      if (frame.regular) d.arrow(ps[0], ps[3], palette.yellow, 'n');
      d.values = {
        参数正则: frame.regular,
        面积缩放: frame.area,
        '平均曲率 H': frame.meanCurvature,
        '高斯曲率 K': frame.gaussianCurvature,
      };
      d.formula = 'n=\\frac{S_u\\times S_v}{\\|S_u\\times S_v\\|}';
      return d.result();
    },
  },
  {
    id: 'patch-seam',
    chapter: '14',
    title: '两张曲面的接缝',
    subtitle: '位置接上仍可能有折痕；检查横向导数与法线是否连续。',
    source: '/src/chapters/14-surfaces/core.ts',
    defaults: { ...defaults, mode: 'C0', leftSpan: 1, rightSpan: 1, tangentScale: 1.5 },
    controls: [
      choice('mode', '拼接', [
        ['free', '自由'],
        ['C0', 'C⁰'],
        ['G1', 'G¹'],
        ['C1', 'C¹'],
        ['C2', 'C²'],
      ]),
      slider('leftSpan', '左片跨度', 0.3, 2, 0.05),
      slider('rightSpan', '右片跨度', 0.3, 2, 0.05),
      slider('tangentScale', 'G¹ 比例', 0.2, 3, 0.05),
      ...controls.slice(1),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-4, 4, -3, 3]),
        left = net(p),
        right = defaultControl().map((row) =>
          row.map((q) => [q[0] + 2.7, q[1] + 0.3 * q[0], q[2]] as Vec3),
        ),
        joined = stitchPatches(
          left,
          right,
          p.mode as Continuity,
          number(p, 'leftSpan'),
          number(p, 'rightSpan'),
          number(p, 'tangentScale'),
        ),
        diag = joinDiagnostics(
          joined.left,
          joined.right,
          number(p, 'v'),
          number(p, 'leftSpan'),
          number(p, 'rightSpan'),
        );
      drawPatch(d, p, joined.left, palette.blue);
      drawPatch(d, p, joined.right, palette.green);
      for (const f of [diag.left, diag.right])
        if (f.regular) {
          const xy = projection(p, [f.position, add(f.position, scale(f.normal, 0.7)) as Vec3]);
          d.arrow(xy[0], xy[1], palette.yellow);
        }
      d.values = {
        '该点 C⁰': diag.c0,
        '该点 G¹': diag.g1,
        '该点 C¹': diag.c1,
        '该点 C²': diag.c2,
        一阶导数差: diag.duGap,
        二阶导数差: diag.duuGap,
      };
      return d.result();
    },
  },
];
