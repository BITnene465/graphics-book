import { Drawing, palette, circle } from '../../figures/drawing.ts';
import { axes3, grid } from '../../figures/helpers.ts';
import { number, points, slider } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { evaluate } from './core.ts';
import { bezierJet, curveFrame, helixJet } from './curvature.ts';
import { project } from '../12-geometry/core.ts';

export const curvatureFigures: FigureSpec[] = [
  {
    id: 'curve-curvature',
    chapter: '13',
    title: '局部弯曲，用一个相切的圆来度量',
    subtitle: '拖动控制点或播放；曲率变小时，黄色密切圆变大。',
    source: '/src/chapters/13-bezier/curvature.ts',
    defaults: {
      points: [
        [-2, -1],
        [-1, 1.6],
        [1, -1.6],
        [2, 1],
      ],
    },
    controls: [],
    initialProgress: 0.28,
    duration: 9,
    compute(p, t) {
      const d = new Drawing([-3.3, 3.3, -2.6, 2.6]),
        control = points(p, 'points'),
        jet = bezierJet(control, t);
      const frame = curveFrame(
          [...jet.velocity, 0] as Vec3,
          [...jet.acceleration, 0] as Vec3,
          [...jet.jerk, 0] as Vec3,
        ),
        at = jet.position;
      grid(d, [-3, 3, -2, 2]);
      d.line(control, palette.muted, 1, 0.5, true);
      d.line(
        Array.from({ length: 151 }, (_, i) => evaluate(control, i / 150)),
        palette.blue,
        2.8,
      );
      control.forEach((q, index) =>
        d.handle(q, 'points', `P${index}`, { index, limits: [-2.7, 2.7, -2, 2] }),
      );
      if (frame.tangent)
        d.arrow(
          at,
          at.map((x, i) => x + 0.8 * frame.tangent![i]),
          palette.blue,
          'T',
        );
      const radius = frame.normal && frame.curvature ? 1 / frame.curvature : null;
      if (radius && radius < 1e5) {
        const center = at.map((x, i) => x + radius * frame.normal![i]) as Vec2;
        if (radius < 6) d.line(circle(center, radius, 160), palette.yellow, 1.6, 0.8);
        else {
          const angle = Math.atan2(at[1] - center[1], at[0] - center[0]),
            span = 3 / radius;
          d.line(
            Array.from({ length: 81 }, (_, i) => [
              center[0] + radius * Math.cos(angle - span + (2 * span * i) / 80),
              center[1] + radius * Math.sin(angle - span + (2 * span * i) / 80),
            ]),
            palette.yellow,
            1.6,
            0.8,
          );
        }
        d.arrow(
          at,
          at.map((x, i) => x + 0.8 * frame.normal![i]),
          palette.green,
          'N',
        );
      }
      d.dot(at, palette.yellow, 0.065);
      d.values = {
        '参数 t': t,
        速率: frame.speed,
        '曲率 κ': frame.curvature ?? '未定义',
        密切圆半径: radius ?? (frame.regular ? '∞ / 直线极限' : '未定义'),
        Frenet标架: frame.normal ? '已定义' : frame.regular ? '曲率为零或接近零' : '零速率',
      };
      d.formula =
        '\\kappa=\\frac{\\|C^{\\prime}\\times C^{\\prime\\prime}\\|}{\\|C^{\\prime}\\|^3},\\quad O=C+N/\\kappa';
      return d.result();
    },
  },
  {
    id: 'curve-torsion',
    chapter: '13',
    title: '密切平面怎样沿曲线转动',
    subtitle: '改变半径与螺距参数；播放观察切向 T、主法线 N 和副法线 B。',
    source: '/src/chapters/13-bezier/curvature.ts',
    defaults: { radius: 1.2, pitch: 0.45, azimuth: 35, elevation: 25 },
    controls: [
      slider('radius', '螺线半径 R', 0, 1.8, 0.02),
      slider('pitch', '每弧度高度增量 h', -0.7, 0.7, 0.01),
      slider('azimuth', '观察方位', -180, 180, 1, '°'),
      slider('elevation', '观察仰角', -75, 75, 1, '°'),
    ],
    initialProgress: 0.65,
    duration: 8,
    compute(p, t) {
      const d = new Drawing([-3.2, 3.2, -3, 3]),
        radius = number(p, 'radius'),
        pitch = number(p, 'pitch'),
        u = (2 * t - 1) * Math.PI;
      const jet = helixJet(radius, pitch, u),
        frame = curveFrame(jet.velocity, jet.acceleration, jet.jerk);
      const az = number(p, 'azimuth'),
        el = number(p, 'elevation'),
        view = (v: Vec3[]) => project(v, az, el).xy;
      axes3(d, az, el, 1.6);
      d.line(
        view(
          Array.from(
            { length: 181 },
            (_, i) => helixJet(radius, pitch, (i / 90 - 1) * Math.PI).position,
          ),
        ),
        palette.blue,
        2.7,
      );
      if (frame.normal) {
        const plane = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(
          ([a, b]) =>
            jet.position.map(
              (x, i) => x + 0.55 * (a * frame.tangent![i] + b * frame.normal![i]),
            ) as Vec3,
        );
        d.polygon(view(plane), palette.yellow, 0.16);
        const xy = view(plane);
        d.line([...xy, xy[0]], palette.yellow, 1, 0.65);
      }
      [frame.tangent, frame.normal, frame.binormal].forEach((v, i) => {
        if (v) {
          const xy = view([jet.position, jet.position.map((x, j) => x + 0.8 * v[j]) as Vec3]);
          d.arrow(xy[0], xy[1], [palette.blue, palette.green, palette.red][i], ['T', 'N', 'B'][i]);
        }
      });
      d.dot(view([jet.position])[0], palette.yellow, 0.07);
      d.values = {
        '参数 u / rad': u,
        '曲率 κ': frame.curvature ?? '未定义',
        '有符号挠率 τ': frame.torsion ?? '未定义',
        每圈高度: 2 * Math.PI * pitch,
        曲线状态: !frame.regular
          ? '一个点'
          : !frame.normal
            ? '直线'
            : pitch === 0
              ? '平面圆'
              : '空间螺线',
      };
      d.formula = '\\kappa=\\frac{R}{R^2+h^2},\\quad \\tau=\\frac{h}{R^2+h^2}\\quad(R>0)';
      return d.result();
    },
  },
];
