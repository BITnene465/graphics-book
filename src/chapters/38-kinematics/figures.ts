import { Drawing, palette, circle } from '../../figures/drawing.ts';
import { slider, number, choice, vec2 } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec2 } from '../../math/vector.ts';
import { forward, inverse, skin2 } from './core.ts';
export const figures: FigureSpec[] = [
  {
    id: 'two-link-ik',
    chapter: '38',
    title: '末端位置反求关节角',
    subtitle: '拖动目标点，切换肘部解；不可达目标保留残差。',
    source: '/src/chapters/38-kinematics/core.ts',
    animated: false,
    defaults: { target: [1.1, 1], length: 1, elbow: 1 },
    controls: [
      slider('length', '第二连杆长', 0.4, 1.5, 0.05),
      choice('elbow', '肘部方向', [
        [1, '正向'],
        [-1, '反向'],
      ]),
    ],
    compute(p) {
      const d = new Drawing([-2.8, 2.8, -2.2, 2.2]),
        lengths: Vec2 = [1, number(p, 'length')],
        target = vec2(p, 'target'),
        solution = inverse(target, lengths, number(p, 'elbow')),
        joints = forward(lengths, solution.angles);
      d.line(circle([0, 0], 1 + lengths[1]), palette.muted, 1, 0.5, true);
      if (Math.abs(1 - lengths[1]) > 0.01)
        d.line(circle([0, 0], Math.abs(1 - lengths[1])), palette.muted, 1, 0.5, true);
      d.line(joints, palette.blue, 5);
      joints.forEach((v) => d.dot(v, palette.green, 0.07));
      d.handle(target, 'target', '目标', { limits: [-2.6, 2.6, -2, 2] });
      d.values = {
        关节角度: solution.angles.map((x) => (x * 180) / Math.PI),
        可达: solution.reachable,
        末端误差: Math.hypot(...joints[2].map((x, c) => x - target[c])),
      };
      return d.result();
    },
  },
  {
    id: 'skinning-weights',
    chapter: '38',
    title: '绑定姿态与权重共同决定皮肤',
    subtitle: '改变弯曲和过渡宽度，观察 LBS 在关节附近的收缩。',
    source: '/src/chapters/38-kinematics/core.ts',
    animated: false,
    defaults: { angle: 90, width: 0.5 },
    controls: [
      slider('angle', '肘部弯曲', -150, 150, 1, '°'),
      slider('width', '权重过渡宽度', 0.1, 1, 0.05),
    ],
    compute(p) {
      const d = new Drawing([-0.3, 2.3, -1.8, 1.8]),
        a = (number(p, 'angle') * Math.PI) / 180,
        width = number(p, 'width'),
        weight = (x: number) => Math.max(0, Math.min(1, (x - 1) / width + 0.5));
      for (let y = -0.25; y <= 0.251; y += 0.125)
        d.line(
          Array.from({ length: 41 }, (_, i) => skin2([i / 20, y], weight(i / 20), 1, [0, a])),
          palette.green,
          1.5,
        );
      for (let i = 0; i <= 20; i++) {
        const x = i / 10;
        d.line(
          [skin2([x, -0.25], weight(x), 1, [0, a]), skin2([x, 0.25], weight(x), 1, [0, a])],
          palette.blue,
          1,
        );
      }
      d.line(forward([1, 1], [0, a]), palette.yellow, 4);
      d.values = { 权重之和: 1, 关节中心权重: weight(1), 绑定姿态: '两条连杆沿 +X' };
      return d.result();
    },
  },
];
