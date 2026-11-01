import { Drawing, palette } from '../../figures/drawing.ts';
import { rectangle } from '../../figures/helpers.ts';
import { number, slider, vec3 } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { classifyBox, frustumPlanes } from './culling.ts';

export const cullingFigure: FigureSpec = {
  id: 'frustum-box',
  chapter: '06',
  title: '先排除整盒，再决定逐个样本的可见性',
  subtitle: '两个视图编辑同一个三维包围盒；红色可剔除，黄色须继续检查，绿色完全在视锥内。',
  source: '/src/chapters/06-depth/culling.ts',
  defaults: { center: [0, 0, -4], half: 0.8, fov: 60 },
  controls: [
    slider('half', '包围盒半长', 0.1, 2, 0.05),
    slider('fov', '垂直视野', 30, 100, 1, '°'),
  ],
  animated: false,
  compute(p) {
    const d = new Drawing(),
      center = vec3(p, 'center'),
      half = number(p, 'half'),
      fov = number(p, 'fov');
    const result = classifyBox(
      { center, halfSize: [half, half, half] },
      frustumPlanes(fov, 1, 1, 8),
    );
    const color =
      result.state === 'outside'
        ? palette.red
        : result.state === 'inside'
          ? palette.green
          : palette.yellow;
    const slope = Math.tan((fov * Math.PI) / 360);
    for (const [label, axis] of [
      ['俯视 · XZ', 0],
      ['侧视 · YZ', 1],
    ] as const)
      d.panel(label, [-10.5, 10.5, -10.5, 1.5], () => {
        d.text([-9.8, 0.7], label, palette.muted, 12);
        const shape = [
          [-slope, -1],
          [slope, -1],
          [8 * slope, -8],
          [-8 * slope, -8],
        ];
        d.polygon(shape, palette.blue, 0.12);
        d.line([...shape, shape[0]], palette.blue, 1.8);
        d.line(
          [
            [0, 0],
            [0, -9],
          ],
          palette.muted,
          1,
          0.6,
          true,
        );
        d.dot([0, 0], palette.blue, 0.12);
        d.text([0.2, 0.6], '相机', palette.blue);
        d.text([8 * slope + 0.2, -8], 'far');
        d.text([slope + 0.2, -1], 'near');
        rectangle(d, [center[axis] - half, center[2] - half], [2 * half, 2 * half], color, 0.3);
        d.handle([center[axis], center[2]], 'center', '盒中心', {
          axes: [axis, 2],
          limits: [-9, 9, -9, 1],
        });
      });
    d.values = {
      判定: { outside: '可剔除', inside: '完全在内', candidate: '保留候选' }[result.state],
      拒绝平面: result.rejecting ?? '无',
      '最小值 · 左右下上近远': result.ranges.map((r) => r.min),
      '最大值 · 左右下上近远': result.ranges.map((r) => r.max),
    };
    d.formula = 's=n\\cdot c+d,\\quad r=|n|\\cdot e,\\quad s+r<0\\Rightarrow\\text{outside}';
    return d.result();
  },
};
