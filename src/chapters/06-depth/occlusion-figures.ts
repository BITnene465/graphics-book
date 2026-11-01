import { Drawing, palette } from '../../figures/drawing.ts';
import { rectangle } from '../../figures/helpers.ts';
import { number, vec2, slider } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { depthPyramid, occlusionQuery, projectedSize, rectangleSamples } from './occlusion.ts';
import type { ScreenRect } from './occlusion.ts';

function outline(d: Drawing, r: ScreenRect, height: number, color: string) {
  const [x0, y0, x1, y1] = r;
  d.line(
    [
      [x0, height - y0],
      [x1, height - y0],
      [x1, height - y1],
      [x0, height - y1],
      [x0, height - y0],
    ],
    color,
    2.5,
  );
}
export const occlusionFigures: FigureSpec[] = [
  {
    id: 'hierarchical-depth',
    chapter: '06',
    title: '深度范围能否排除整个候选物体？',
    subtitle: '拖动包围框；打开一道缝，检查粗层还能否保证完全遮挡。',
    source: '/src/chapters/06-depth/occlusion.ts',
    defaults: { center: [8, 8], level: 1, gap: 0, depth: 0.65, size: 6 },
    controls: [
      slider('level', '深度层级', 0, 4, 1),
      slider('gap', '遮挡物开口宽度', 0, 4, 1),
      slider('depth', '候选最近深度', 0.1, 0.95, 0.01),
      slider('size', '包围框边长', 2, 8, 0.25),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing(),
        data = new Float64Array(256).fill(Infinity),
        gap = number(p, 'gap');
      for (let y = 2; y < 14; y++)
        for (let x = 2; x < 14; x++)
          if (!(x >= 8 - Math.floor(gap / 2) && x < 8 - Math.floor(gap / 2) + gap))
            data[y * 16 + x] = 0.35;
      const [x, y] = vec2(p, 'center'),
        half = number(p, 'size') / 2,
        rect: ScreenRect = [x - half, 16 - y - half, x + half, 16 - y + half],
        pyramid = depthPyramid({ width: 16, height: 16, data }),
        level = number(p, 'level'),
        query = occlusionQuery(pyramid, rect, number(p, 'depth'), level),
        color = query.occluded ? palette.red : palette.yellow;
      d.panel('已绘制遮挡物的深度', [-1, 17, -1, 17], () => {
        for (let row = 0; row < 16; row++)
          for (let col = 0; col < 16; col++) {
            rectangle(
              d,
              [col, 15 - row],
              [1, 1],
              Number.isFinite(data[row * 16 + col]) ? palette.blue : palette.muted,
              0.35,
            );
          }
        for (let col = 0; col <= 16; col++)
          d.line(
            [
              [col, 0],
              [col, 16],
            ],
            palette.muted,
            0.5,
            0.3,
          );
        for (let row = 0; row <= 16; row++)
          d.line(
            [
              [0, row],
              [16, row],
            ],
            palette.muted,
            0.5,
            0.3,
          );
        outline(d, rect, 16, color);
        d.handle([x, y], 'center', '候选中心', { limits: [4, 12, 4, 12] });
        d.text([0.2, 16.6], '蓝：D = 0.35 · 灰：未覆盖', palette.muted, 12);
      });
      d.panel('当前层的保守范围', [-1, 17, -1, 17], () => {
        const image = pyramid[level],
          step = 2 ** level,
          selected = new Set(query.cells);
        image.data.forEach((z, i) => {
          const cx = (i % image.width) * step,
            cy = 16 - (Math.floor(i / image.width) + 1) * step;
          rectangle(
            d,
            [cx, cy],
            [step, step],
            Number.isFinite(z) ? palette.blue : palette.muted,
            0.22,
          );
          const edge = selected.has(i) ? color : palette.muted;
          d.line(
            [
              [cx, cy],
              [cx + step, cy],
              [cx + step, cy + step],
              [cx, cy + step],
              [cx, cy],
            ],
            edge,
            selected.has(i) ? 2 : 0.7,
            0.7,
          );
          if (step >= 2)
            d.text([cx + 0.15, cy + step / 2], z === Infinity ? '∞' : z.toFixed(2), edge, 11);
        });
        outline(d, rect, 16, color);
        d.text([0.2, 16.6], '描边格必须全部通过深度保证', palette.muted, 12);
      });
      d.values = {
        结论: query.occluded ? '可剔除：全部被挡住' : '保留候选：尚无保证',
        最近深度: number(p, 'depth'),
        区域最大深度: query.farthest === Infinity ? '∞ · 存在未覆盖区域' : query.farthest,
        查询格数: query.cells.length,
        原始层格数: occlusionQuery(pyramid, rect, number(p, 'depth'), 0).cells.length,
      };
      d.formula = 'D_{\\min}^{\\rm object}>\\max_{\\rm covered\\ cells}D_{\\rm stored}';
      return d.result();
    },
  },
  {
    id: 'small-object-policy',
    chapter: '06',
    title: '小于一个像素，也可能留下一个亮点',
    subtitle: '拖动方形的亚像素位置；两图放大同一个 8 × 8 样本窗口。',
    source: '/src/chapters/06-depth/occlusion.ts',
    defaults: { center: [4.5, 4.5], side: 1, distance: 800, height: 720, threshold: 1 },
    controls: [
      slider('side', '正对相机的边长', 0.1, 3, 0.1),
      slider('distance', '轴向距离', 100, 2000, 10),
      slider('height', '图像高度 / px', 240, 2160, 120),
      slider('threshold', '省略阈值 / px', 0, 4, 0.1),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing(),
        center = vec2(p, 'center'),
        size = projectedSize(number(p, 'side'), number(p, 'distance'), 60, number(p, 'height')),
        rect: ScreenRect = [
          center[0] - size / 2,
          8 - center[1] - size / 2,
          center[0] + size / 2,
          8 - center[1] + size / 2,
        ],
        covered = new Set(rectangleSamples(rect, 8, 8)),
        discard = size < number(p, 'threshold');
      for (const [title, filtered] of [
        ['保留全部几何', false],
        ['使用尺寸阈值', true],
      ] as const)
        d.panel(title, [-0.5, 8.5, -0.5, 8.8], () => {
          for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++) {
              const lit = covered.has(8 * y + x) && !(filtered && discard);
              rectangle(
                d,
                [x, 7 - y],
                [1, 1],
                lit ? palette.blue : palette.muted,
                lit ? 0.75 : 0.07,
              );
              d.dot([x + 0.5, 7.5 - y], lit ? palette.blue : palette.muted, 0.035);
            }
          for (let i = 0; i <= 8; i++) {
            d.line(
              [
                [0, i],
                [8, i],
              ],
              palette.muted,
              0.7,
              0.35,
            );
            d.line(
              [
                [i, 0],
                [i, 8],
              ],
              palette.muted,
              0.7,
              0.35,
            );
          }
          outline(d, rect, 8, filtered && discard ? palette.muted : palette.yellow);
          if (!filtered) d.handle(center, 'center', '亚像素位置', { limits: [2.5, 5.5, 2.5, 5.5] });
          d.text(
            [0.15, 8.45],
            filtered ? (discard ? '策略省略了整个物体' : '策略保留物体') : '连续轮廓与离散样本',
            palette.muted,
            12,
          );
        });
      d.values = {
        投影边长: size,
        省略阈值: number(p, 'threshold'),
        省略物体: discard,
        局部覆盖样本: covered.size,
        局部丢失样本: discard ? covered.size : 0,
      };
      d.formula = 's_{px}=\\frac{H L}{2d\\tan(\\varphi/2)}';
      return d.result();
    },
  },
];
