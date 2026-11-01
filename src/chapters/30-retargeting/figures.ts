import { deskImage } from '../../book-scene/render.ts';
import { Drawing, palette } from '../../figures/drawing.ts';
import { imagePanel } from '../../figures/advanced.ts';
import { slider, number, vec2 } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { makeImage, sample } from '../../math/image.ts';
import { energy, verticalSeam, removeSeam } from './core.ts';
export const figures: FigureSpec[] = [
  {
    id: 'content-aware-resize',
    chapter: '30',
    title: '宽度减少时，删掉哪些位置',
    subtitle: '拖动保护区域；每次删除后重新计算能量和连通缝。',
    source: '/src/chapters/30-retargeting/core.ts',
    animated: true,
    defaults: { remove: 20, protect: [-0.4, 0], strength: 2 },
    controls: [slider('remove', '删除列数', 0, 32, 1), slider('strength', '保护权重', 0, 10, 0.1)],
    compute(p, progress) {
      const d = new Drawing(),
        source = deskImage(80, 56),
        center = vec2(p, 'protect'),
        count = Math.floor(progress * number(p, 'remove'));
      let image = source,
        mask = makeImage(80, 56, (u, v) => {
          const r = Math.hypot(((u - 0.5) * 160) / 56 - center[0], 1 - 2 * v - center[1]),
            a = r < 0.35 ? number(p, 'strength') : 0;
          return [a, a, a];
        });
      for (let k = 0; k < count; k++) {
        const seam = verticalSeam(
          energy(
            image,
            Array.from({ length: image.width * image.height }, (_, i) => mask.data[3 * i]),
          ),
          image.width,
          image.height,
        );
        image = removeSeam(image, seam.path);
        mask = removeSeam(mask, seam.path);
      }
      imagePanel(d, '原图与保护区域', 80, 56, source.data, 1, () => {
        d.dot(center, palette.yellow, 0.35, 0.15);
        d.handle(center, 'protect', '保护中心', { limits: [-1.1, 1.1, -0.65, 0.65] });
      });
      imagePanel(d, '逐条删缝', image.width, image.height, image.data);
      const scaled = makeImage(image.width, image.height, (u, v) =>
        sample(source, u * source.width - 0.5, v * source.height - 0.5),
      );
      imagePanel(d, '同宽均匀缩放', scaled.width, scaled.height, scaled.data);
      d.values = { 输出宽度: image.width, 已删除缝: count, 输出高度: image.height };
      return d.result();
    },
  },
  {
    id: 'seam-dynamic-programming',
    chapter: '30',
    title: '最小代价路径需要保持连通',
    subtitle: '拖动高代价障碍，观察路径如何逐行绕开。',
    source: '/src/chapters/30-retargeting/core.ts',
    animated: false,
    defaults: { obstacle: [3, 3] },
    controls: [],
    compute(p) {
      const w = 8,
        h = 7,
        d = new Drawing([-0.5, 7.5, -0.5, 6.5]),
        o = vec2(p, 'obstacle'),
        cost = Array.from(
          { length: w * h },
          (_, i) =>
            0.1 + Math.exp(-(((i % w) - o[0]) ** 2 + (h - 1 - Math.floor(i / w) - o[1]) ** 2) / 2),
        ),
        seam = verticalSeam(cost, w, h);
      cost.forEach((c, i) => {
        const x = i % w,
          y = h - 1 - Math.floor(i / w);
        d.polygon(
          [
            [x - 0.45, y - 0.45],
            [x + 0.45, y - 0.45],
            [x + 0.45, y + 0.45],
            [x - 0.45, y + 0.45],
          ],
          palette.blue,
          c * 0.7,
        );
      });
      d.line(
        seam.path.map((x, y) => [x, h - 1 - y]),
        palette.yellow,
        3,
      );
      d.handle(o, 'obstacle', '代价中心', { limits: [0, 7, 0, 6] });
      d.values = { 最小累计代价: seam.cost, 列索引: seam.path };
      return d.result();
    },
  },
];
