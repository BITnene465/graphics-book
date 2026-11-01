import { ending as deskFigure } from '../../book-scene/animation-studies.ts';
import { Drawing, palette } from '../../figures/drawing.ts';
import { plot } from '../../figures/advanced.ts';
import { slider, number, choice, vec2 } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import { random } from '../../math/vector.ts';
import { oscillator, initialFlock, flockStep, particleAt } from './core.ts';
export const figures: FigureSpec[] = [
  deskFigure,
  {
    id: 'integrator-energy',
    chapter: '39',
    title: '更新次序怎样改变能量',
    subtitle: '比较同一个无阻尼振子的显式 Euler、辛 Euler 与 Verlet。',
    source: '/src/chapters/39-dynamics/core.ts',
    animated: true,
    defaults: { dt: 0.08, omega: 3, method: 'symplectic' },
    controls: [
      slider('dt', '时间步长', 0.01, 0.25, 0.01, 's'),
      slider('omega', '角频率', 1, 6, 0.1, 'rad/s'),
      choice('method', '积分器', [
        ['explicit', '显式 Euler'],
        ['symplectic', '辛 Euler'],
        ['verlet', '速度 Verlet'],
      ]),
    ],
    compute(p, progress) {
      const dt = number(p, 'dt'),
        steps = Math.floor((progress * 8) / dt),
        states = oscillator(
          dt,
          steps,
          number(p, 'omega'),
          p.method as 'explicit' | 'symplectic' | 'verlet',
        ),
        last = states.at(-1)!,
        scale = Math.max(
          1.2,
          ...states.map((s) => Math.abs(s.x)),
          ...states.map((s) => Math.abs(s.v / number(p, 'omega'))),
        ),
        d = new Drawing();
      d.panel('相空间 · x 与 v/ω', [-scale, scale, -scale, scale], () => {
        d.line(
          states.map((s) => [s.x, s.v / number(p, 'omega')]),
          palette.blue,
          2,
        );
        d.dot([last.x, last.v / number(p, 'omega')], palette.yellow, 0.04 * scale);
      });
      d.panel(
        '能量相对初值',
        [0, 8, 0, Math.max(1.5, ...states.map((s) => s.energy / states[0].energy))],
        () =>
          plot(
            d,
            states.map((s) => s.energy / states[0].energy),
            palette.green,
            0,
            last.t,
          ),
      );
      d.values = {
        '模拟时间 / s': last.t,
        相对能量: last.energy / states[0].energy,
        无量纲步长: dt * number(p, 'omega'),
      };
      return d.result();
    },
  },
  {
    id: 'particle-lifecycle',
    chapter: '39',
    title: '产生、运动与消亡',
    subtitle: '固定种子发射粒子，位置使用恒重力解析解，单独隔离生命周期。',
    source: '/src/chapters/39-dynamics/core.ts',
    animated: true,
    duration: 8,
    defaults: { rate: 30, life: 2.5, gravity: 1.5 },
    controls: [
      slider('rate', '发射率', 5, 100, 5, '个/s'),
      slider('life', '寿命', 0.5, 4, 0.1, 's'),
      slider('gravity', '重力加速度', 0.2, 3, 0.1),
    ],
    compute(p, progress) {
      const d = new Drawing([-3.5, 3.5, -1, 3.5]),
        time = progress * 6,
        rng = random(8);
      let live = 0;
      for (let i = 0; i <= Math.floor(time * number(p, 'rate')); i++) {
        const v: [number, number] = [(rng() - 0.5) * 2, 1.5 + rng() * 1.3],
          particle = particleAt(
            time,
            i / number(p, 'rate'),
            v,
            number(p, 'life'),
            number(p, 'gravity'),
          );
        if (particle) {
          live++;
          d.dot(particle.p, palette.yellow, 0.035, particle.opacity);
        }
      }
      d.dot([0, 0], palette.green, 0.09);
      d.values = { '时间 / s': time, 存活粒子数: live, 运动模型: '恒重力，无碰撞' };
      return d.result();
    },
  },
  {
    id: 'local-flocking',
    chapter: '39',
    title: '局部规则形成群体运动',
    subtitle: '拖动共同目标，调节分离强度；所有个体同步读取旧状态。',
    source: '/src/chapters/39-dynamics/core.ts',
    animated: true,
    duration: 10,
    defaults: { target: [1, 0], separation: 0.25, count: 40, seed: 5 },
    controls: [
      slider('separation', '分离强度', 0, 1, 0.05),
      slider('count', '个体数', 10, 80, 10),
      slider('seed', '初始种子', 1, 30, 1),
    ],
    compute(p, progress) {
      const d = new Drawing([-3, 3, -2.3, 2.3]),
        target = vec2(p, 'target'),
        steps = Math.floor(progress * 240);
      let state = initialFlock(number(p, 'count'), number(p, 'seed'));
      for (let i = 0; i < steps; i++)
        state = flockStep(state, 1 / 40, number(p, 'separation'), target);
      for (const b of state) {
        const a = Math.atan2(b.v[1], b.v[0]),
          dx = 0.08 * Math.cos(a),
          dy = 0.08 * Math.sin(a);
        d.polygon(
          [
            [b.p[0] + dx, b.p[1] + dy],
            [b.p[0] - dx - 0.5 * dy, b.p[1] - dy + 0.5 * dx],
            [b.p[0] - dx + 0.5 * dy, b.p[1] - dy - 0.5 * dx],
          ],
          palette.blue,
          0.8,
        );
      }
      d.handle(target, 'target', '目标', { limits: [-2, 2, -1.5, 1.5] });
      d.values = {
        '模拟时间 / s': steps / 40,
        个体数: state.length,
        规则: '分离 + 对齐 + 聚合 + 目标',
        保证: '行为模型不保证零碰撞',
      };
      return d.result();
    },
  },
];
