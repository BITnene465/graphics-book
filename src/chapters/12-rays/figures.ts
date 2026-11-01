import { Drawing, palette, circle } from '../../figures/drawing.ts';
import { number, vec2, slider } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { sphereRoots, reflect } from './core.ts';
import { unit } from '../02-transforms/spatial.ts';
export const figures: FigureSpec[] = [
  {
    id: 'ray-intersection',
    chapter: '12',
    title: '射线与球面什么时候相遇？',
    subtitle: '拖动射线起点与方向控制点；参数根可以在起点后方。',
    source: '/src/chapters/12-rays/core.ts',
    defaults: { origin: [-2.4, 0.5], target: [1.5, -0.1], radius: 1 },
    controls: [slider('radius', '球半径', 0.2, 1.5, 0.01)],
    animated: false,
    compute(p) {
      const d = new Drawing([-3.5, 3.5, -2.1, 2.1]),
        o = vec2(p, 'origin'),
        target = vec2(p, 'target'),
        direction = unit([target[0] - o[0], target[1] - o[1], 0]),
        roots = sphereRoots([...o, 0], direction, [0, 0, 0], number(p, 'radius'));
      d.line(circle([0, 0], number(p, 'radius')), palette.green, 2.5);
      d.line(
        [
          [o[0] - direction[0] * 5, o[1] - direction[1] * 5],
          [o[0] + direction[0] * 7, o[1] + direction[1] * 7],
        ],
        palette.muted,
        1,
        1,
        true,
      );
      d.arrow(o, target, palette.blue, 'd');
      d.handle(o, 'origin', 'o');
      d.handle(target, 'target', '方向');
      roots.forEach((t, i) => {
        if (Number.isFinite(t)) {
          const q = [o[0] + t * direction[0], o[1] + t * direction[1]];
          d.dot(q, t >= 0 ? palette.yellow : palette.red, 0.055);
          d.text([q[0] + 0.1, q[1] + 0.13], `t${i}`, palette.ink, 12);
        }
      });
      d.values = {
        't 近': roots[0],
        't 远': roots[1],
        前向命中: roots.some((t) => Number.isFinite(t) && t >= 0),
      };
      d.formula = '\\|o+td-c\\|^2=r^2';
      return d.result();
    },
  },
  {
    id: 'ray-reflection',
    chapter: '12',
    title: '反射保持切向分量，翻转法向分量',
    subtitle: '拖动入射方向，比较入射与反射的夹角。',
    source: '/src/chapters/12-rays/core.ts',
    defaults: { incoming: [-1.2, 1.4], angle: 15 },
    controls: [slider('angle', '表面倾角', -70, 70, 1, '°')],
    animated: false,
    compute(p) {
      const d = new Drawing([-2.6, 2.6, -2, 2.5]),
        a = (number(p, 'angle') * Math.PI) / 180,
        n = unit([-Math.sin(a), Math.cos(a), 0]),
        start = vec2(p, 'incoming'),
        incident = unit([-start[0], -start[1], 0]),
        r = reflect(incident, n);
      d.line(
        [
          [-2 * Math.cos(a), -2 * Math.sin(a)],
          [2 * Math.cos(a), 2 * Math.sin(a)],
        ],
        palette.green,
        3,
      );
      d.arrow(start, [0, 0], palette.blue, '入射');
      d.arrow([0, 0], [r[0] * 1.8, r[1] * 1.8], palette.yellow, '反射');
      d.arrow([0, 0], [n[0] * 1.3, n[1] * 1.3], palette.muted, 'n');
      d.handle(start, 'incoming', '入射方向');
      d.values = { 单位反射方向: r };
      d.formula = 'r=d-2(d\\cdot n)n';
      return d.result();
    },
  },
];
