import { Drawing, palette } from '../../figures/drawing.ts';
import { drawMesh } from '../../figures/advanced.ts';
import { slider, choice, number, points, vec2 } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { gridMesh } from '../../math/mesh.ts';
import { ffd, differentialEdit, arap2 } from './core.ts';
export const figures: FigureSpec[] = [
  {
    id: 'ffd-cage',
    chapter: '20',
    title: '编辑笼而不是逐个编辑顶点',
    subtitle: '拖动四个笼点，观察内部网格的双线性形变。',
    source: '/src/chapters/20-deformation/core.ts',
    animated: false,
    defaults: {
      cage: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    },
    controls: [],
    compute(p) {
      const d = new Drawing([-0.5, 1.5, -0.5, 1.5]),
        cage = points(p, 'cage') as Vec2[];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        d.line(
          Array.from({ length: 41 }, (_, i) => ffd([t, i / 40], cage)),
          palette.blue,
        );
        d.line(
          Array.from({ length: 41 }, (_, i) => ffd([i / 40, t], cage)),
          palette.blue,
        );
      }
      d.line([...cage, cage[0]], palette.yellow, 2);
      cage.forEach((x, i) =>
        d.handle(x, 'cage', 'P' + i, { index: i, limits: [-0.4, 1.4, -0.4, 1.4] }),
      );
      d.values = { 中心位置: ffd([0.5, 0.5], cage), 权重之和: 1 };
      return d.result();
    },
  },
  {
    id: 'differential-deformation',
    chapter: '20',
    title: '保持差分，还是允许局部旋转',
    subtitle: '拖动右上手柄；左边界固定，比较大转角下的形状。',
    source: '/src/chapters/20-deformation/core.ts',
    animated: false,
    defaults: { target: [1.2, 0.4], method: 'arap', iterations: 8 },
    controls: [
      choice('method', '模型', [
        ['arap', '局部刚性 ARAP'],
        ['differential', '固定差分坐标'],
      ]),
      slider('iterations', 'ARAP 迭代', 1, 16, 1),
    ],
    compute(p) {
      const d = new Drawing(),
        m = gridMesh(5),
        target = vec2(p, 'target'),
        handles = new Map<number, Vec3>();
      for (let i = 0; i < 36; i += 6) handles.set(i, m.vertices[i]);
      handles.set(35, [...target, 0]);
      const out =
        p.method === 'arap'
          ? {
              vertices: arap2(
                m,
                new Map([...handles].map(([i, v]) => [i, [v[0], v[1]] as Vec2])),
                number(p, 'iterations'),
              ).map((v) => [...v, 0] as Vec3),
              faces: m.faces,
            }
          : differentialEdit(m, handles);
      d.panel('参考网格', [-1.6, 2, -1.6, 2], () => drawMesh(d, m, -90, 90, palette.muted));
      d.panel('约束后的形状', [-1.6, 2, -1.6, 2], () => {
        drawMesh(d, out, -90, 90);
        d.handle(target, 'target', '移动手柄', { limits: [-0.8, 1.8, -1.3, 1.8] });
      });
      d.values = {
        固定点数: handles.size,
        手柄位置: target,
        迭代: p.method === 'arap' ? number(p, 'iterations') : 1,
      };
      return d.result();
    },
  },
];
