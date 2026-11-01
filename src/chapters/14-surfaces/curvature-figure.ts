import { Drawing, palette, circle } from '../../figures/drawing.ts';
import { number, slider, vec2 } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec3 } from '../../math/vector.ts';
import { project } from '../12-geometry/core.ts';
import { normalCurvature, principalCurvatures } from './curvature.ts';
import type { SurfaceJet } from './curvature.ts';

export const normalCurvatureFigure: FigureSpec = {
  id: 'normal-curvature',
  chapter: '14',
  title: '同一个曲面点，沿不同方向弯曲',
  subtitle: '拖动右侧黄色方向；左侧黄色截线对应经过该方向与曲面法线的平面。',
  source: '/src/chapters/14-surfaces/curvature.ts',
  defaults: { a: 1, b: 0.35, c: -0.6, direction: [0.8, 0.6], azimuth: -40, elevation: 32 },
  controls: [
    slider('a', '二阶项 a', -1.6, 1.6, 0.02),
    slider('b', '混合项 b', -1.2, 1.2, 0.02),
    slider('c', '二阶项 c', -1.6, 1.6, 0.02),
    slider('azimuth', '观察方位', -180, 180, 1, '°'),
    slider('elevation', '观察仰角', -75, 75, 1, '°'),
  ],
  animated: false,
  compute(p) {
    const d = new Drawing(),
      a = number(p, 'a'),
      b = number(p, 'b'),
      c = number(p, 'c');
    const jet: SurfaceJet = {
        du: [1, 0, 0],
        dv: [0, 1, 0],
        duu: [0, 0, a],
        duv: [0, 0, b],
        dvv: [0, 0, c],
      },
      frame = principalCurvatures(jet)!;
    const raw = vec2(p, 'direction'),
      length = Math.hypot(...raw),
      w = length ? raw.map((x) => x / length) : [0, 0];
    const k = normalCurvature(jet, [w[0], w[1]]),
      az = number(p, 'azimuth'),
      el = number(p, 'elevation');
    const surface = (x: number, y: number): Vec3 => [
      x,
      y,
      (a * x * x + 2 * b * x * y + c * y * y) / 2,
    ];
    const view = (v: Vec3[]) => project(v, az, el).xy;
    d.panel(
      '原点的法截线',
      [-2, 2, -1.9, 2.1],
      () => {
        if (length) {
          const plane: Vec3[] = [
            [-w[0], -w[1], -0.7],
            [w[0], w[1], -0.7],
            [w[0], w[1], 1.2],
            [-w[0], -w[1], 1.2],
          ];
          d.polygon(view(plane), palette.yellow, 0.07);
          d.line(view([...plane, plane[0]]), palette.yellow, 0.8, 0.35);
        }
        const faces: { xy: number[][]; depth: number }[] = [];
        for (let i = 0; i < 12; i++)
          for (let j = 0; j < 12; j++) {
            const x = -0.8 + (1.6 * i) / 12,
              y = -0.8 + (1.6 * j) / 12,
              step = 1.6 / 12;
            const v = project(
              [
                surface(x, y),
                surface(x + step, y),
                surface(x + step, y + step),
                surface(x, y + step),
              ],
              az,
              el,
            );
            faces.push({ xy: v.xy, depth: v.depth.reduce((s, x) => s + x, 0) });
          }
        faces
          .sort((a, b) => a.depth - b.depth)
          .forEach((f) => {
            d.polygon(f.xy, palette.blue, 0.13);
            d.line([...f.xy, f.xy[0]], palette.blue, 0.7, 0.45);
          });
        const n = view([
          [0, 0, 0],
          [0, 0, 1.2],
        ]);
        d.arrow(n[0], n[1], palette.red, 'n');
        if (k !== null) {
          d.line(
            view(
              Array.from({ length: 101 }, (_, i) => {
                const s = -0.8 + (1.6 * i) / 100;
                return surface(s * w[0], s * w[1]);
              }),
            ),
            palette.yellow,
            3,
          );
          const t = view([
            [0, 0, 0],
            [w[0], w[1], 0],
          ]);
          d.arrow(t[0], t[1], palette.yellow, 'T');
        }
        d.dot(view([[0, 0, 0]])[0], palette.ink, 0.04);
      },
      1.4,
    );
    d.panel('切平面中的方向', [-1.8, 1.8, -1.8, 1.8], () => {
      d.axes(-1.5, 1.5, -1.5, 1.5);
      d.line(circle([0, 0], 1), palette.muted, 1, 0.6);
      if (frame.unique)
        [frame.direction1, frame.direction2].forEach((v, i) =>
          d.arrow(
            [0, 0],
            v.slice(0, 2).map((x) => 1.3 * x),
            i ? palette.green : palette.blue,
            i ? 'k₂' : 'k₁',
          ),
        );
      d.arrow([0, 0], w, palette.yellow);
      d.handle(w, 'direction', '方向', { limits: [-1.4, 1.4, -1.4, 1.4] });
      d.text([-1.55, 1.6], frame.unique ? '蓝／绿：主方向' : '各方向曲率相同', palette.muted, 12);
    });
    d.values = {
      '法曲率 kₙ': k ?? '零方向：未定义',
      '最大 k₁': frame.k1,
      '最小 k₂': frame.k2,
      '平均曲率 H': (frame.k1 + frame.k2) / 2,
      '高斯曲率 K': frame.k1 * frame.k2,
      '与主轴夹角 θ / °': !length
        ? '未定义'
        : !frame.unique
          ? '主方向不唯一'
          : (Math.acos(
              Math.min(1, Math.abs(w[0] * frame.direction1[0] + w[1] * frame.direction1[1])),
            ) *
              180) /
            Math.PI,
      主方向唯一: frame.unique,
    };
    d.formula = 'k_n(\\theta)=k_1\\cos^2\\theta+k_2\\sin^2\\theta';
    return d.result();
  },
};
