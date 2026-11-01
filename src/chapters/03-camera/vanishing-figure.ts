import { Drawing, palette } from '../../figures/drawing.ts';
import { choice, number, slider } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { viewDirection, vanishingPoint } from './vanishing.ts';

export const vanishingFigure: FigureSpec = {
  id: 'vanishing-directions',
  chapter: '03',
  title: '消失点属于方向，不属于物体的位置',
  subtitle: '切换标准观察方向，再拖动方块；同色平行边的消失点保持不变。',
  source: '/src/chapters/03-camera/vanishing.ts',
  defaults: { mode: 2, offset: [0, 0], yaw: 35, pitch: 25 },
  controls: [
    choice('mode', '观察方式', [
      [1, '一点'],
      [2, '两点'],
      [3, '三点'],
    ]),
    slider('yaw', '左右转角', 15, 70, 1, '°'),
    slider('pitch', '俯仰角', 15, 50, 1, '°'),
  ],
  animated: false,
  compute(p) {
    const mode = number(p, 'mode'),
      yaw = mode === 1 ? 0 : number(p, 'yaw'),
      pitch = mode === 3 ? number(p, 'pitch') : 0;
    const offset = p.offset as number[],
      colors = [palette.blue, palette.green, palette.red],
      focal = 2,
      distance = 3.5;
    const directions = (
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ] as Vec3[]
    ).map((v) => viewDirection(v, yaw, pitch));
    const vanishing = directions.map((v) => vanishingPoint(v, focal));
    const d = new Drawing([-4, 4, -3.3, 3.3]);
    // 固定相机前方的物体中心，旋转只作用于局部边方向。
    const vertices: Vec3[] = Array.from({ length: 8 }, (_, i) => {
      const v = viewDirection([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1], yaw, pitch);
      return [v[0] + offset[0], v[1] + offset[1], v[2] - distance];
    });
    const xy = vertices.map((v) => [(-focal * v[0]) / v[2], (-focal * v[1]) / v[2]] as Vec2);
    for (let axis = 0; axis < 3; axis++) {
      for (let i = 0; i < 8; i++)
        if (!(i & (1 << axis))) {
          const a = xy[i],
            b = xy[i | (1 << axis)],
            target = vanishing[axis];
          if (target) d.line([a, target], colors[axis], 1, 0.35, true);
          else {
            const dx = b[0] - a[0],
              dy = b[1] - a[1];
            d.line(
              [
                [a[0] - 10 * dx, a[1] - 10 * dy],
                [a[0] + 10 * dx, a[1] + 10 * dy],
              ],
              colors[axis],
              1,
              0.25,
              true,
            );
          }
          d.line([a, b], colors[axis], 2.5);
        }
      const point = vanishing[axis];
      if (point) {
        if (Math.abs(point[0]) < 3.6 && Math.abs(point[1]) < 2.9) {
          d.dot(point, colors[axis], 0.06);
          d.text([point[0] + 0.12, point[1] + 0.12], `${'XYZ'[axis]}∞`, colors[axis]);
        } else d.text([-3.7, 3 - axis * 0.27], `${'XYZ'[axis]} 消失点在画外`, colors[axis], 12);
      }
    }
    // 物体中心的像坐标：拖动时逆换算到相机平面中的平移。
    d.handle(
      [(focal * offset[0]) / distance, (focal * offset[1]) / distance],
      'offset',
      '平移物体',
      {
        mapping: { offset: [0, 0], scale: [focal / distance, focal / distance] },
        limits: [-2, 2, -2, 2],
      },
    );
    d.values = {
      有限消失点: vanishing.filter(Boolean).length,
      'X 方向': vanishing[0] ?? '无穷远',
      'Y 方向': vanishing[1] ?? '无穷远',
      'Z 方向': vanishing[2] ?? '无穷远',
    };
    d.formula = 'p_\\infty=\\left(-f\\frac{d_x}{d_z},-f\\frac{d_y}{d_z}\\right),\\quad d_z\\ne0';
    return d.result();
  },
};
