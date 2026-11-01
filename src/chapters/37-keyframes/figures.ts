import { Drawing, palette } from '../../figures/drawing.ts';
import { drawMesh, plot } from '../../figures/advanced.ts';
import { slider, number, choice } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec3, Vec4 } from '../../math/vector.ts';
import { cubeMesh } from '../../math/mesh.ts';
import { hermiteMotion, slerp, rotateQuaternion } from './core.ts';
export const figures: FigureSpec[] = [
  {
    id: 'keyframe-velocity',
    chapter: '37',
    title: '位置经过端点，速度仍由切向决定',
    subtitle: '时间以秒计；改变区间时长时，速度和局部切向不能混用。',
    source: '/src/chapters/37-keyframes/core.ts',
    animated: true,
    defaults: { duration: 2, start: 0, end: 0 },
    controls: [
      slider('duration', '区间时长', 0.5, 5, 0.1, 's'),
      slider('start', '起点速度', -2, 3, 0.1, '单位/s'),
      slider('end', '终点速度', -2, 3, 0.1, '单位/s'),
    ],
    compute(p, progress) {
      const d = new Drawing(),
        T = number(p, 'duration'),
        sample = (u: number) => hermiteMotion(0, 1, number(p, 'start'), number(p, 'end'), u * T, T),
        states = Array.from({ length: 101 }, (_, i) => sample(i / 100)),
        current = sample(progress);
      const range = (values: number[]): [number, number] => {
        const lo = Math.min(0, ...values),
          hi = Math.max(1, ...values),
          pad = (hi - lo) * 0.12;
        return [lo - pad, hi + pad];
      };
      d.panel('位置 / 时间', [0, T, ...range(states.map((x) => x.position))], () => {
        plot(
          d,
          states.map((x) => x.position),
          palette.blue,
          0,
          T,
        );
        d.dot([progress * T, current.position], palette.yellow, 0.05);
      });
      d.panel('速度 / 时间', [0, T, ...range(states.map((x) => x.velocity))], () => {
        plot(
          d,
          states.map((x) => x.velocity),
          palette.green,
          0,
          T,
        );
        d.dot([progress * T, current.velocity], palette.yellow, 0.05);
      });
      d.values = {
        '时间 / s': progress * T,
        位置: current.position,
        '速度 / 单位·s⁻¹': current.velocity,
      };
      return d.result();
    },
  },
  {
    id: 'rotation-interpolation',
    chapter: '37',
    title: '旋转插值与位置混合',
    subtitle: '同样的起终姿态，比较中间形状是否保持长度。',
    source: '/src/chapters/37-keyframes/core.ts',
    animated: true,
    defaults: { angle: 150, method: 'slerp' },
    controls: [
      slider('angle', '目标旋转', 0, 180, 1, '°'),
      choice('method', '插值', [
        ['slerp', '单位四元数 SLERP'],
        ['linear', '顶点线性混合'],
      ]),
    ],
    compute(p, progress) {
      const d = new Drawing(),
        mesh = cubeMesh(),
        a = (number(p, 'angle') * Math.PI) / 180,
        q: Vec4 = [Math.cos(a / 2), 0, 0, Math.sin(a / 2)],
        qt = slerp([1, 0, 0, 0], q, progress),
        vertices = mesh.vertices.map((v) => {
          const end = rotateQuaternion(q, v);
          return p.method === 'slerp'
            ? rotateQuaternion(qt, v)
            : (v.map((x, c) => x + (end[c] - x) * progress) as Vec3);
        });
      d.panel('中间形状', [-2.1, 2.1, -2.1, 2.1], () =>
        drawMesh(d, { vertices, faces: mesh.faces }, 35, 25),
      );
      d.values = {
        归一化进度: progress,
        一条边长度: Math.hypot(...vertices[1].map((x, c) => x - vertices[0][c])),
        原边长度: 2,
      };
      return d.result();
    },
  },
];
