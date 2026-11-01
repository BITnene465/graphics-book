import { Drawing, palette } from '../../figures/drawing.ts';
import { number, vec2, slider, choice } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';

export const figures: FigureSpec[] = [
  {
    id: 'projection-rays',
    chapter: '03',
    title: '沿射线投影到成像平面',
    subtitle: '移动物点；透视投影由相似三角形决定。',
    source: '/src/chapters/03-camera/core.ts',
    defaults: { point: [4, 1.1], focal: 1.4, projection: 'perspective' },
    controls: [
      slider('focal', '像平面距离', 0.5, 2.5, 0.02),
      choice('projection', '投影', [
        ['perspective', '透视'],
        ['orthographic', '正交'],
      ]),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-0.7, 6, -2.5, 2.5]),
        point = vec2(p, 'point'),
        f = number(p, 'focal'),
        imageY = p.projection === 'perspective' ? (f * point[1]) / point[0] : point[1];
      d.axes(-0.4, 5.8, -2.2, 2.2);
      d.line(
        [
          [f, -2.1],
          [f, 2.1],
        ],
        palette.green,
        2,
      );
      d.dot([0, 0], palette.ink, 0.08);
      d.text([-0.3, -0.35], '相机');
      d.text([f + 0.1, 2.2], '像平面', palette.green);
      d.line(
        p.projection === 'perspective' ? [[0, 0], point] : [[f, point[1]], point],
        palette.blue,
        2,
      );
      d.dot([f, imageY], palette.yellow, 0.065);
      d.handle(point, 'point', '物点', { limits: [2.7, 5.5, -2, 2] });
      d.values = { '距离 d': point[0], '高度 y': point[1], 投影高度: imageY };
      d.formula = p.projection === 'perspective' ? "y'=f\\frac{y}{d}" : "y'=y";
      return d.result();
    },
  },
  {
    id: 'perspective-divide',
    chapter: '03',
    title: '同一个齐次点，不同的表示',
    subtitle: '改变共同尺度不会改变投影；单独改变 w 会改变结果。',
    source: '/src/chapters/03-camera/core.ts',
    defaults: { x: 0.8, y: 0.5, w: 1.2, scale: 1 },
    controls: [
      slider('x', 'clip x', -3, 3, 0.02),
      slider('y', 'clip y', -2, 2, 0.02),
      slider('w', 'clip w', 0.1, 4, 0.02),
      slider('scale', '共同尺度', 0.1, 4, 0.02),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-3, 3, -2.5, 2.5]),
        x = number(p, 'x'),
        y = number(p, 'y'),
        w = number(p, 'w'),
        s = number(p, 'scale');
      d.axes(-2.8, 2.8, -2.2, 2.2);
      d.polygon(
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ],
        palette.green,
        0.06,
      );
      d.line(
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
          [-1, -1],
        ],
        palette.green,
        1,
      );
      d.dot([x / w, y / w], palette.yellow, 0.07);
      d.arrow([0, 0], [x / w, y / w], palette.blue, 'NDC');
      d.values = {
        齐次坐标: [s * x, s * y, s * w],
        '除以 w': [x / w, y / w],
        在视口内: Math.abs(x / w) <= 1 && Math.abs(y / w) <= 1,
      };
      d.formula = '(kx,ky,kw)\\mapsto(x/w,y/w)';
      return d.result();
    },
  },
];
