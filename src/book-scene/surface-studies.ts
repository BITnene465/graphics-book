import { Drawing, palette } from '../figures/drawing.ts';
import { imagePanel } from '../figures/advanced.ts';
import { slider, choice, number, vec2 } from '../figures/spec.ts';
import type { FigureSpec } from '../figures/spec.ts';
import type { Vec2 } from '../math/vector.ts';
import { barycentric, isInside } from '../chapters/04-barycentric/core.ts';
import type { Triangle2 } from '../chapters/04-barycentric/core.ts';
import { deskState } from './model.ts';
import { referenceFrame, renderDesk } from './render.ts';

export const triangle: FigureSpec = {
  id: 'desk-shade-triangle',
  chapter: '04',
  title: '灯罩上的三角形',
  subtitle: '左侧标出来源；右侧放大同一投影，拖动点检查屏幕重心坐标。',
  source: '/src/book-scene/surface-studies.ts',
  animated: false,
  defaults: { point: [0, 0] },
  controls: [],
  compute(p) {
    const frame = referenceFrame(192),
      aspect = frame.width / frame.height;
    const screen = (v: number): Vec2 => {
      const q = frame.vertices[v].clip;
      return [(q[0] / q[3]) * aspect, q[1] / q[3]];
    };
    // 选实际可见样本最多的灯罩面，保证局部实验有清楚的来源。
    const coverage = new Int32Array(frame.scene.faces.length);
    for (const id of frame.owner) if (id >= 0 && frame.faceObjects[id] === 'shade') coverage[id]++;
    let face = 0;
    for (let i = 1; i < coverage.length; i++) if (coverage[i] > coverage[face]) face = i;
    const projected = frame.scene.faces[face].map(screen) as Triangle2;
    const center: Vec2 = [0, 1].map((c) => projected.reduce((s, v) => s + v[c], 0) / 3) as Vec2;
    const extent = Math.max(...projected.flatMap((v) => v.map((x, c) => Math.abs(x - center[c]))));
    const local = projected.map((v) =>
      v.map((x, c) => ((x - center[c]) / extent) * 0.8),
    ) as Triangle2;
    const point = vec2(p, 'point'),
      weights = barycentric(point, local),
      d = new Drawing();
    imagePanel(d, '三角形来自灯罩外壁', frame.width, frame.height, frame.color, 1, () =>
      d.line([...projected, projected[0]], palette.yellow, 2),
    );
    d.panel('只改变观察尺度的屏幕投影', [-1.3, 1.3, -1.1, 1.1], () => {
      d.polygon(local, palette.green, 0.13);
      d.line([...local, local[0]], palette.green, 2);
      local.forEach((v, i) => {
        d.line([v, point], palette.muted, 1);
        d.dot(v, palette.yellow, 0.02);
        d.text([v[0] + 0.03, v[1] + 0.06], `v${i}`, palette.ink, 12);
      });
      d.handle(point, 'point', '屏幕内的查询点', { limits: [-1.2, 1.2, -1, 1] });
    });
    d.values = {
      原网格面编号: face,
      屏幕重心坐标: weights,
      权重之和: weights.reduce((a, b) => a + b, 0),
      三角形内部: isInside(weights),
      已知量: '覆盖使用屏幕权重；表面属性还需第 08 章的透视校正',
    };
    return d.result();
  },
};

export const pattern: FigureSpec = {
  id: 'desk-ball-pattern',
  chapter: '09',
  title: '小球的斜纹是一条函数',
  subtitle: '只改变纹样周期与相位；比较反射率和受光结果，几何与阴影位置保持。',
  source: '/src/book-scene/render.ts',
  animated: false,
  defaults: { stripes: 6, phase: 0, mode: 'lit' },
  controls: [
    slider('stripes', '经向周期', 1, 18, 1),
    slider('phase', '相位', 0, 1, 0.01),
    choice('mode', '检查量', [
      ['lit', '成像'],
      ['albedo', '反射率'],
    ]),
  ],
  compute(p) {
    const state = deskState({ stripes: number(p, 'stripes'), phase: number(p, 'phase') });
    state.params.mode = p.mode;
    const f = renderDesk(state, 192),
      d = new Drawing();
    imagePanel(d, '同一小球的纹样', f.width, f.height, f.color);
    d.values = {
      三角形数: f.scene.faces.length,
      小球半径: state.objects.find((o) => o.key === 'ball')!.scale[0],
      浅色带判定: 'cos(2π(ku + 2v + φ)) > 0.72',
      采样: '每像素中心求值；高频条纹仍可能混叠',
    };
    d.formula =
      '\\rho(u,v)=\\begin{cases}\\rho_{\\rm light},&\\cos(2\\pi(ku+2v+\\varphi))>0.72,\\\\\\rho_{\\rm ochre},&\\text{otherwise}.\\end{cases}';
    return d.result();
  },
};
