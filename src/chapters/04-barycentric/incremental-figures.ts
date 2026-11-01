import { Drawing, palette, circle } from '../../figures/drawing.ts';
import { grid, rectangle } from '../../figures/helpers.ts';
import { points, vec2, number, slider } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec2 } from '../../math/vector.ts';
import { lineSteps, circleSteps, symmetricPoints } from './incremental.ts';
import { scanlineFill, scanlineSpans } from './scanline.ts';

const integer = (p: Vec2): Vec2 => p.map(Math.round) as Vec2;
function pixel(d: Drawing, p: Vec2, color: string, opacity = 0.7): void {
  rectangle(d, [p[0] - 0.43, p[1] - 0.43], [0.86, 0.86], color, opacity);
}

export const incrementalFigures: FigureSpec[] = [
  {
    id: 'bresenham-line',
    chapter: '04',
    title: '沿直线走，每一步只更新一个误差',
    subtitle: '端点吸附到整数格点；时间轴逐步显示选中的像素与误差。',
    source: '/src/chapters/04-barycentric/incremental.ts',
    defaults: { a: [-7, -3], b: [7, 4] },
    controls: [],
    duration: 6,
    initialProgress: 0.5,
    compute(p, t) {
      const d = new Drawing([-10, 10, -6, 6]),
        a = integer(vec2(p, 'a')),
        b = integer(vec2(p, 'b'));
      const steps = lineSteps(a, b),
        index = Math.min(steps.length - 1, Math.floor(t * steps.length));
      grid(d, [-10, 10, -6, 6]);
      d.line([a, b], palette.muted, 1.5, 1, true);
      steps
        .slice(0, index + 1)
        .forEach((s, i) => pixel(d, s.point, i === index ? palette.yellow : palette.blue));
      d.handle(a, 'a', 'A', { limits: [-9, 9, -5, 5] });
      d.handle(b, 'b', 'B', { limits: [-9, 9, -5, 5] });
      d.values = {
        当前步: index,
        像素中心: steps[index].point,
        '误差 e': steps[index].error,
        总步数: steps.length,
        '端点 A': a,
        '端点 B': b,
      };
      d.formula = 'e=|\\Delta x|-|\\Delta y|,\\quad e_2=2e';
      return d.result();
    },
  },
  {
    id: 'midpoint-circle',
    chapter: '04',
    title: '算一个八分圆，得到完整的圆',
    subtitle: '拖动圆心或调整半径；黄色是当前八重对称点，蓝色是已完成的轮廓。',
    source: '/src/chapters/04-barycentric/incremental.ts',
    defaults: { center: [0, 0], radius: 6 },
    controls: [slider('radius', '整数半径', 0, 10, 1)],
    duration: 6,
    initialProgress: 0.6,
    compute(p, t) {
      const d = new Drawing([-14, 14, -12, 12]),
        center = integer(vec2(p, 'center')),
        radius = number(p, 'radius');
      const steps = circleSteps(radius),
        index = Math.min(steps.length - 1, Math.floor(t * steps.length));
      grid(d, [-14, 14, -12, 12]);
      d.line(circle(center, radius), palette.muted, 1.2, 1, true);
      steps
        .slice(0, index + 1)
        .forEach((s, i) =>
          symmetricPoints(center, s.point).forEach((q) =>
            pixel(d, q, i === index ? palette.yellow : palette.blue),
          ),
        );
      d.handle(center, 'center', '圆心', { limits: [-3, 3, -1, 1] });
      d.values = {
        八分圆步: index,
        局部坐标: steps[index].point,
        '决策量 d': steps[index].decision,
        对称点数: symmetricPoints(center, steps[index].point).length,
      };
      d.formula = 'F(x,y)=x^2+y^2-r^2,\\quad d_0=1-r';
      return d.result();
    },
  },
  {
    id: 'scanline-fill',
    chapter: '04',
    title: '一条扫描线，为什么可能有多段内部？',
    subtitle: '拖动凹多边形的顶点；交点排序后两两配对，黄色显示当前扫描行。',
    source: '/src/chapters/04-barycentric/scanline.ts',
    defaults: {
      vertices: [
        [2, 2],
        [14, 2],
        [14, 12],
        [10, 12],
        [8, 6],
        [6, 12],
        [2, 12],
      ],
    },
    controls: [],
    duration: 7.5,
    initialProgress: 0.65,
    compute(p, t) {
      const d = new Drawing([-1, 17, -1, 15]),
        vertices = points(p, 'vertices') as Vec2[],
        row = Math.min(13, Math.floor(t * 14)),
        y = row + 0.5;
      grid(d, [0, 16, 0, 14]);
      const fill = scanlineFill(vertices, 16, 14),
        current = scanlineSpans(vertices, y);
      for (const q of fill)
        if (q[1] <= y) pixel(d, q, q[1] === y ? palette.yellow : palette.blue, 0.55);
      d.line([...vertices, vertices[0]], palette.green, 2);
      d.line(
        [
          [0, y],
          [16, y],
        ],
        palette.yellow,
        1.5,
        0.65,
        true,
      );
      current.spans.forEach((s) =>
        d.line(
          [
            [s.left, y],
            [s.right, y],
          ],
          palette.yellow,
          4,
        ),
      );
      current.crossings.forEach((x) => d.dot([x, y], palette.red, 0.09));
      vertices.forEach((q, index) =>
        d.handle(q, 'vertices', `P${index}`, { index, limits: [0, 16, 0, 14] }),
      );
      d.values = {
        '扫描行 y': y,
        排序交点: current.crossings,
        跨度数量: current.spans.length,
        全图覆盖样本: fill.length,
      };
      d.formula = 'x(y)=x_a+\\frac{y-y_a}{y_b-y_a}(x_b-x_a)';
      return d.result();
    },
  },
];
