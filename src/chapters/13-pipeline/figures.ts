import { Drawing, palette } from '../../figures/drawing.ts';
import { rectangle, bitmap, rgb } from '../../figures/helpers.ts';
import { slider, choice, number } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';

import { lookAt, perspective } from '../03-camera/core.ts';
import { gridScene, renderFrame, sourceOver, fragmentStage } from './core.ts';

export const figures: FigureSpec[] = [
  {
    id: 'pipeline-stages',
    chapter: '13',
    title: '沿着一个三角形追踪成像',
    subtitle: '变换产生 clip 坐标，裁剪生成新顶点，覆盖再产生片元。',
    source: '/src/chapters/13-pipeline/core.ts',
    defaults: { stage: 3, near: 0.1, wave: 0.2 },
    controls: [
      choice('stage', '阶段', [
        [0, '模型'],
        [1, '裁剪空间'],
        [2, '屏幕'],
        [3, '片元'],
      ]),
      slider('near', '近平面', 0.05, 5, 0.05),
      slider('wave', '顶点波幅', 0, 0.7, 0.01),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-1.2, 1.2, -1.2, 1.2]),
        scene = gridScene(3),
        frame = renderFrame(scene, {
          width: 96,
          view: lookAt([2, 1.5, 4], [0, 0, 0]),
          projection: perspective(48, 1, number(p, 'near'), 20),
          wave: number(p, 'wave'),
          fragment: (f) => fragmentStage(f, [2, 1.5, 4], [-3, 4, 5], 'checker'),
        });
      if (number(p, 'stage') === 3)
        bitmap(d, { width: 96, height: 96, data: frame.color }, [-1, -1], [2, 2], true);
      else
        for (const face of scene.faces) {
          const xy = face.map((i) => {
            const v = frame.vertices[i];
            return number(p, 'stage') === 0
              ? [v.world[0] / 2, v.world[1] / 2]
              : number(p, 'stage') === 1
                ? [v.clip[0] / 5, v.clip[1] / 5]
                : [v.clip[0] / v.clip[3], v.clip[1] / v.clip[3]];
          });
          d.line([...xy, xy[0]], palette.blue, 1.5);
        }
      d.values = {
        提交三角形: frame.counts.submitted,
        裁剪后: frame.counts.clipped,
        覆盖片元: frame.counts.covered,
        着色求值: frame.counts.shaded,
        通过深度: frame.counts.passed,
        '首顶点 clip': frame.vertices[0].clip,
      };
      d.formula = 'p_{clip}=PVMp_{local}';
      return d.result();
    },
  },
  {
    id: 'alpha-compositing',
    chapter: '13',
    title: '透明表面的叠放顺序',
    subtitle: '固定两种颜色，交换前后层；混合始终在线性颜色中进行。',
    source: '/src/chapters/13-pipeline/core.ts',
    defaults: { alphaA: 0.5, alphaB: 0.5 },
    controls: [
      slider('alphaA', 'A 不透明度', 0, 1, 0.01),
      slider('alphaB', 'B 不透明度', 0, 1, 0.01),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-2.5, 2.5, -1.2, 1.5]),
        a: [number, number, number] = [0.05, 0.35, 0.65],
        b: [number, number, number] = [0.75, 0.25, 0.05],
        bg: [number, number, number] = [0.93, 0.92, 0.88],
        aa = number(p, 'alphaA'),
        ab = number(p, 'alphaB');
      for (const [i, label] of ['A 在上', 'B 在上'].entries()) {
        const x = i * 2.5 - 2.3,
          front = i ? b : a,
          back = i ? a : b,
          af = i ? ab : aa,
          at = i ? aa : ab;
        rectangle(d, [x, 0], [1.3, 0.8], rgb(sourceOver(back, bg, at)));
        rectangle(d, [x + 0.5, -0.5], [1.3, 0.8], rgb(sourceOver(front, bg, af)));
        rectangle(
          d,
          [x + 0.5, 0],
          [0.8, 0.3],
          rgb(sourceOver(front, sourceOver(back, bg, at), af)),
        );
        d.text([x, 1.1], label, palette.ink, 14);
      }
      d.values = {
        'A over B': sourceOver(a, sourceOver(b, bg, ab), aa),
        'B over A': sourceOver(b, sourceOver(a, bg, aa), ab),
      };
      d.formula = 'C_{out}=\\alpha C_{src}+(1-\\alpha)C_{dst}';
      return d.result();
    },
  },
];
