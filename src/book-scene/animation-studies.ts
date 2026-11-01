import { Drawing, palette } from '../figures/drawing.ts';
import { imagePanel, plot } from '../figures/advanced.ts';
import { slider, number, choice, vec2 } from '../figures/spec.ts';
import type { FigureSpec } from '../figures/spec.ts';
import { hermiteMotion } from '../chapters/37-keyframes/core.ts';
import { deskState, DESK, lampJoints } from './model.ts';
import { renderDesk, referenceFrame } from './render.ts';
import { lampFront, pixelPanels } from './drawing.ts';
import { openingDefaults } from './foundations.ts';
import { reachLamp, deskMotion } from './motion.ts';

export const keyframes: FigureSpec = {
  id: 'desk-keyframe-motion',
  chapter: '37',
  title: '小球的位置与速度',
  subtitle: '同一段位置变化使用物理时间；改变端点速度，对照图像与轨迹。',
  source: '/src/chapters/37-keyframes/core.ts',
  animated: true,
  initialProgress: 0,
  duration: 4,
  defaults: { duration: 3, start: 0, end: 0 },
  controls: [
    slider('duration', '区间时长', 1, 5, 0.1, 's'),
    slider('start', '起点速度', -0.3, 0.8, 0.05, 'm/s'),
    slider('end', '终点速度', -0.3, 0.8, 0.05, 'm/s'),
  ],
  compute(p, progress) {
    const T = number(p, 'duration'),
      sample = (t: number) =>
        hermiteMotion(DESK.ball[0], 1.6, number(p, 'start'), number(p, 'end'), t, T);
    const q = sample(progress * T),
      states = Array.from({ length: 101 }, (_, i) => sample((i * T) / 100));
    const state = deskState({ ball: [q.position, DESK.ball[1]] }),
      f = renderDesk(state, 160),
      d = new Drawing();
    imagePanel(d, '按关键帧移动的小球', f.width, f.height, f.color);
    const xs = states.map((s) => s.position);
    d.panel('世界 X / 物理时间', [0, T, Math.min(...xs) - 0.15, Math.max(...xs) + 0.15], () => {
      plot(d, xs, palette.yellow, 0, T);
      d.dot([progress * T, q.position], palette.green, 0.025);
    });
    d.values = {
      '时间 / s': progress * T,
      '世界 X / m': q.position,
      '速度 / m·s⁻¹': q.velocity,
      模型: '作者指定轨迹；未模拟力或滚动',
    };
    return d.result();
  },
};

export const kinematics: FigureSpec = {
  id: 'desk-lamp-ik',
  chapter: '38',
  title: '灯头目标与关节角',
  subtitle: '拖动灯头目标反求两关节角；长度保持，未达到目标时报告残差。',
  source: '/src/book-scene/motion.ts',
  animated: false,
  defaults: { target: lampJoints()[2].slice(0, 2) },
  controls: [],
  compute(p) {
    const target = vec2(p, 'target'),
      result = reachLamp(target),
      state = deskState({ angles: result.angles }),
      f = renderDesk(state, 192),
      d = new Drawing();
    lampFront(d, result.angles, target);
    imagePanel(d, '同一组关节驱动的台灯', f.width, f.height, f.color);
    d.values = {
      '相对关节角 / °': result.angles.map((x) => (x * 180) / Math.PI),
      连杆长度: DESK.lengths,
      目标: result.reachable ? '可达' : '超出范围',
      '目标误差 / m': result.error,
    };
    return d.result();
  },
};

export const ending: FigureSpec = {
  id: 'desk-return',
  chapter: '39',
  title: '一个周期之后',
  subtitle: '比较解析运动与数值积分，检查一个周期后的位置、能量与成像。',
  source: '/src/book-scene/motion.ts',
  animated: true,
  initialProgress: 0,
  duration: 8,
  defaults: { ...openingDefaults, method: 'analytic', step: 0.1, amplitude: 0.2 },
  controls: [
    choice('method', '状态推进', [
      ['analytic', '解析解'],
      ['explicit', '显式 Euler'],
      ['symplectic', '辛 Euler'],
      ['verlet', 'Verlet'],
    ]),
    slider('step', '最大时间步长', 0.02, 0.2, 0.01, 's'),
    slider('amplitude', '位移尺度', 0.05, 0.3, 0.01, 'm'),
  ],
  compute(p, progress) {
    const motion = deskMotion(
      progress,
      p.method as 'analytic' | 'explicit' | 'symplectic' | 'verlet',
      number(p, 'step'),
      number(p, 'amplitude'),
    );
    const frame =
      motion.displacement === 0
        ? referenceFrame(number(p, 'size'))
        : renderDesk(motion.state, number(p, 'size'));
    const d = new Drawing(),
      probe = pixelPanels(d, frame, vec2(p, 'probe'));
    d.values = {
      '时间 / s': motion.time,
      '本次步长 / s': motion.dt,
      相对能量: motion.relativeEnergy,
      '对解析位置的误差 / m': motion.positionError,
      灯头目标: motion.reachable ? '可达' : '超出范围',
      像素对象: probe.object,
      '行 / 列': [probe.row, probe.col],
      线性RGB: probe.rgb,
    };
    return d.result();
  },
};
