import { registration as deskFigure } from '../../book-scene/imaging-studies.ts';
import { Drawing, palette } from '../../figures/drawing.ts';
import { choice, number, points, slider } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec2 } from '../../math/vector.ts';
import { homography, warp, robustHomography } from './core.ts';
const corners: Vec2[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
export const figures: FigureSpec[] = [
  deskFigure,
  {
    id: 'homography-grid',
    chapter: '31',
    title: '四对点确定一张平面的投影',
    subtitle: '拖动目标四角，观察直线保持与透视尺度变化。',
    source: '/src/chapters/31-registration/core.ts',
    animated: false,
    defaults: {
      corners: [
        [-1, -1],
        [1, -0.8],
        [0.6, 1],
        [-0.7, 0.8],
      ],
    },
    controls: [],
    compute(p) {
      const d = new Drawing([-1.6, 1.6, -1.6, 1.6]),
        target = points(p, 'corners') as Vec2[],
        H = homography(corners, target);
      for (let i = 0; i <= 10; i++) {
        const t = -1 + i * 0.2;
        d.line([warp(H, [t, -1]), warp(H, [t, 1])], palette.blue);
        d.line([warp(H, [-1, t]), warp(H, [1, t])], palette.green);
      }
      target.forEach((v, i) =>
        d.handle(v, 'corners', '对应 ' + i, {
          index: i,
          limits: [
            corners[i][0] - 0.4,
            corners[i][0] + 0.4,
            corners[i][1] - 0.4,
            corners[i][1] + 0.4,
          ],
        }),
      );
      d.values = { 单应矩阵H: H.map((v) => Number(v.toFixed(4))), 中心映射: warp(H, [0, 0]) };
      return d.result();
    },
  },
  {
    id: 'robust-correspondences',
    chapter: '31',
    title: '错误匹配怎样影响变换',
    subtitle: '比较全点最小二乘与随机一致性估计。',
    source: '/src/chapters/31-registration/core.ts',
    animated: false,
    defaults: { outliers: 5, method: 'ransac' },
    controls: [
      slider('outliers', '错误对应数', 0, 10, 1),
      choice('method', '估计', [
        ['ransac', 'RANSAC'],
        ['least', '全部对应'],
      ]),
    ],
    compute(p) {
      const d = new Drawing([-1.8, 1.8, -1.8, 1.8]),
        source: Vec2[] = Array.from({ length: 25 }, (_, i) => [
          -1 + (i % 5) * 0.5,
          -1 + Math.floor(i / 5) * 0.5,
        ]),
        truth = [1, 0.1, 0.1, -0.05, 0.9, -0.1, 0.08, -0.03, 1],
        target = source.map((v, i) => {
          const q = warp(truth, v);
          return i < number(p, 'outliers')
            ? ([q[0] + 0.5 * Math.sin(i * 13 + 1), q[1] + 0.6 * Math.cos(i * 7)] as Vec2)
            : q;
        }),
        result =
          p.method === 'ransac'
            ? robustHomography(source, target)
            : { H: homography(source, target), inliers: source.map((_, i) => i) };
      source.forEach((v, i) => {
        const q = warp(result.H, v);
        d.line([q, target[i]], palette.muted);
        d.dot(target[i], i < number(p, 'outliers') ? palette.red : palette.green, 0.035);
        d.dot(q, palette.blue, 0.025);
      });
      d.values = {
        一致点数: result.inliers.length,
        总对应数: 25,
        真实变换均方误差:
          source.reduce((s, v) => {
            const a = warp(result.H, v),
              b = warp(truth, v);
            return s + (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
          }, 0) / 25,
      };
      return d.result();
    },
  },
];
