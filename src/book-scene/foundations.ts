import { Drawing } from '../figures/drawing.ts';
import { imagePanel } from '../figures/advanced.ts';
import { slider, choice, number, vec2 } from '../figures/spec.ts';
import type { FigureSpec } from '../figures/spec.ts';
import type { Vec2 } from '../math/vector.ts';
import { deskState, DESK, lampJoints } from './model.ts';
import { renderDesk, referenceFrame } from './render.ts';
import { orbitCamera, deskPlan, lampFront, pixelPanels } from './drawing.ts';

export const openingDefaults = { size: 192, probe: [0.32, -0.1] };
export const opening: FigureSpec = {
  id: 'desk-first-image',
  chapter: '01',
  title: '台灯、小球与桌面',
  subtitle: '拖动探针回读像素；改变数组尺寸，保留同一场景和构图。',
  source: '/src/book-scene/render.ts',
  defaults: openingDefaults,
  animated: false,
  controls: [
    choice('size', '图像宽度', [
      [48, '48'],
      [96, '96'],
      [192, '192'],
      [384, '384'],
    ]),
  ],
  compute(p) {
    const d = new Drawing(),
      probe = pixelPanels(d, referenceFrame(number(p, 'size')), vec2(p, 'probe'));
    d.values = {
      '行 / 列': [probe.row, probe.col],
      线性RGB: probe.rgb,
      数组位置: `3 × (${probe.row} × ${p.size} + ${probe.col})`,
    };
    return d.result();
  },
};

export const hierarchy: FigureSpec = {
  id: 'desk-joint-frames',
  chapter: '02',
  title: '灯头跟随哪一组坐标轴',
  subtitle: '改变父关节与相对关节角；三维灯臂和正视剖面使用同一组位置。',
  source: '/src/book-scene/model.ts',
  animated: false,
  defaults: { shoulder: 70, elbow: -90 },
  controls: [
    slider('shoulder', '父关节角', 60, 100, 1, '°'),
    slider('elbow', '相对关节角', -100, -25, 1, '°'),
  ],
  compute(p) {
    const angles: Vec2 = [
      (number(p, 'shoulder') * Math.PI) / 180,
      (number(p, 'elbow') * Math.PI) / 180,
    ];
    const state = deskState({ angles }),
      frame = renderDesk(state, 160),
      d = new Drawing();
    lampFront(d, angles);
    imagePanel(d, '同一姿态的成像', frame.width, frame.height, frame.color);
    d.values = {
      灯头世界位置: lampJoints(angles)[2],
      第二臂世界角: number(p, 'shoulder') + number(p, 'elbow'),
      连杆长度: DESK.lengths,
    };
    d.formula =
      'p_2=p_0+\\ell_0(\\cos\\theta_0,\\sin\\theta_0)+\\ell_1(\\cos(\\theta_0+\\theta_1),\\sin(\\theta_0+\\theta_1))';
    return d.result();
  },
};

export const camera: FigureSpec = {
  id: 'desk-camera',
  chapter: '03',
  title: '场景不动，观察位置改变',
  subtitle: '直接拖动成像环绕相机；俯视图只改变小球在桌面上的位置。',
  source: '/src/book-scene/foundations.ts',
  animated: false,
  orbitPanels: ['相机成像'],
  defaults: { ball: [...DESK.ball], azimuth: 36, elevation: 19, distance: 5.73, fov: 38 },
  controls: [
    slider('azimuth', '方位', -160, 160, 1, '°'),
    slider('elevation', '仰角', 10, 65, 1, '°'),
    slider('distance', '相机到目标距离', 4, 10, 0.1, 'm'),
    slider('fov', '垂直视场角', 25, 65, 1, '°'),
  ],
  compute(p) {
    const state = deskState({ ball: vec2(p, 'ball') });
    orbitCamera(state, number(p, 'azimuth'), number(p, 'elevation'), number(p, 'distance'));
    state.camera.fov = number(p, 'fov');
    const frame = renderDesk(state, 160),
      d = new Drawing();
    imagePanel(d, '相机成像', frame.width, frame.height, frame.color);
    deskPlan(d, state);
    d.values = {
      小球世界位置: state.objects.find((o) => o.key === 'ball')!.position,
      相机位置: state.camera.eye,
      三角形数: frame.scene.faces.length,
    };
    return d.result();
  },
};

export const pipeline: FigureSpec = {
  id: 'desk-pixel-explained',
  chapter: '11',
  title: '一个像素的来源',
  subtitle: '移动像素探针，读取可见对象、表面位置、法线与纹理坐标。',
  source: '/src/book-scene/render.ts',
  animated: false,
  defaults: { ...openingDefaults, mode: 'lit' },
  controls: [
    choice('mode', '检查量', [
      ['lit', '成像'],
      ['albedo', '反射率'],
      ['normal', '法线'],
      ['depth', '距离倒数'],
    ]),
  ],
  compute(p) {
    const state = deskState();
    state.params.mode = p.mode;
    const frame =
      p.mode === 'lit' ? referenceFrame(number(p, 'size')) : renderDesk(state, number(p, 'size'));
    const d = new Drawing(),
      q = pixelPanels(d, frame, vec2(p, 'probe'));
    d.values = {
      对象: q.object,
      '行 / 列': [q.row, q.col],
      线性RGB: q.rgb,
      世界位置: q.face < 0 ? '背景无表面' : q.world,
      法线: q.face < 0 ? '不适用' : q.normal,
      UV: q.face < 0 ? '不适用' : q.uv,
      透视校正后的顶点权重: q.face < 0 ? '不适用' : q.weights,
    };
    return d.result();
  },
};

export const shadows: FigureSpec = {
  id: 'desk-light-shadow',
  chapter: '10',
  title: '小球位置与桌面阴影',
  subtitle: '拖动俯视图的小球；桌面点的位置不变，光源可见性会改变。',
  source: '/src/book-scene/render.ts',
  animated: false,
  defaults: { ball: [...DESK.ball], power: 36, shadowSize: 192, pcf: 1 },
  controls: [
    slider('power', '灯的通量', 0, 80, 1, 'W'),
    choice('shadowSize', '阴影图', [
      [64, '64'],
      [192, '192'],
      [384, '384'],
    ]),
    slider('pcf', 'PCF 半径', 0, 3, 1, 'px'),
  ],
  compute(p) {
    const state = deskState({ ball: vec2(p, 'ball'), power: number(p, 'power') });
    state.params.shadowSize = p.shadowSize;
    state.params.pcf = p.pcf;
    const f = renderDesk(state, 192),
      d = new Drawing();
    imagePanel(d, '台灯下的阴影', f.width, f.height, f.color);
    deskPlan(d, state);
    d.values = {
      小球位置: state.objects.find((o) => o.key === 'ball')!.position,
      光源位置: state.objects.find((o) => o.key === 'light')!.position,
      阴影模型: '点光源深度图；PCF 是可见性过滤',
    };
    return d.result();
  },
};
