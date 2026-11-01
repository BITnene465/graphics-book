import { Drawing, palette } from '../../figures/drawing.ts';
import { axes3, grid, wire3 } from '../../figures/helpers.ts';
import { number, slider, vec3 } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { project } from '../12-geometry/core.ts';
import { unit } from './spatial.ts';
import { axisAngle, rotateQuaternion, slerp } from './quaternion.ts';

const box: Vec3[] = [
  [-1, -0.55, -0.35],
  [1, -0.55, -0.35],
  [1, 0.55, -0.35],
  [-1, 0.55, -0.35],
  [-1, -0.55, 0.35],
  [1, -0.55, 0.35],
  [1, 0.55, 0.35],
  [-1, 0.55, 0.35],
];
const edges: Vec2[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

export const quaternionFigure: FigureSpec = {
  id: 'quaternion-rotation',
  chapter: '02',
  title: '姿态插值沿着旋转的短弧前进',
  subtitle: '在 XY／XZ 子图拖动旋转轴；播放比较起始姿态、当前姿态与目标姿态。',
  source: '/src/chapters/02-transforms/quaternion.ts',
  defaults: { axis: [0.6, 1, 0.4], angle: 140, azimuth: 35, elevation: 25 },
  controls: [
    slider('angle', '目标轴角', -330, 330, 1, '°'),
    slider('azimuth', '观察方位', -180, 180, 1, '°'),
    slider('elevation', '观察仰角', -75, 75, 1, '°'),
  ],
  duration: 6500,
  initialProgress: 0.45,
  compute(p, t) {
    const d = new Drawing(),
      axis = vec3(p, 'axis'),
      angle = (number(p, 'angle') * Math.PI) / 180;
    const az = number(p, 'azimuth'),
      el = number(p, 'elevation'),
      valid = Math.hypot(...axis) > 1e-8;
    const end = valid ? axisAngle(axis, angle) : ([1, 0, 0, 0] as [number, number, number, number]);
    const q = slerp([1, 0, 0, 0], end, t),
      current = box.map((v) => rotateQuaternion(q, v));
    d.panel(
      '空间姿态',
      [-2.4, 2.4, -1.9, 1.9],
      () => {
        d.text([-2.2, 1.65], '空间姿态', palette.muted, 12);
        axes3(d, az, el, 1.7);
        wire3(d, box, edges, az, el, palette.muted);
        wire3(
          d,
          box.map((v) => rotateQuaternion(end, v)),
          edges,
          az,
          el,
          palette.green,
        );
        const xy = project(current, az, el).xy;
        d.polygon([xy[0], xy[1], xy[2], xy[3]], palette.blue, 0.3);
        wire3(d, current, edges, az, el, palette.blue);
        const tip = project([[0, 0, 0], rotateQuaternion(q, [1.5, 0, 0])], az, el).xy;
        d.arrow(tip[0], tip[1], palette.yellow, '局部 x');
        if (valid) {
          const n = unit(axis).map((x) => x * 1.8) as Vec3;
          const a = project([[0, 0, 0], n], az, el).xy;
          d.arrow(a[0], a[1], palette.green, '轴');
        }
      },
      2,
    );
    for (const [label, axes] of [
      ['轴 · XY', [0, 1]],
      ['轴 · XZ', [0, 2]],
    ] as [string, number[]][])
      d.panel(label, [-1.7, 1.7, -1.7, 1.7], () => {
        grid(d, [-1.7, 1.7, -1.7, 1.7]);
        d.text([-1.5, 1.45], label, palette.muted, 12);
        d.text([1.35, -0.2], 'x', palette.blue, 12);
        d.text(
          [0.12, 1.3],
          axes[1] === 1 ? 'y' : 'z',
          axes[1] === 1 ? palette.green : palette.red,
          12,
        );
        const at = axes.map((i) => axis[i]);
        d.arrow([0, 0], at, palette.green);
        d.handle(at, 'axis', '轴分量', { axes, limits: [-1.5, 1.5, -1.5, 1.5] });
      });
    d.values = {
      '参数 t': t,
      '四元数 [w,x,y,z]': q,
      模长: Math.hypot(...q),
      '实际转角 / °': (2 * Math.acos(Math.min(1, Math.abs(q[0]))) * 180) / Math.PI,
      轴有效: valid,
    };
    d.formula = 'q=\\left(\\cos\\frac\\theta2,\\;\\hat n\\sin\\frac\\theta2\\right)';
    return d.result();
  },
};
