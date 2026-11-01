import { Drawing, palette } from '../../figures/drawing.ts';
import { bitmap, axes3, rectangle, rgb } from '../../figures/helpers.ts';
import { slider, choice, number, vec2 } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec3 } from '../../math/vector.ts';
import { texture } from '../07-textures/core.ts';
import { project } from '../10-geometry/core.ts';

import {
  directionToLatlong,
  directionToCube,
  latlongToDirection,
  analyticEnvironment,
  environmentLocalDirection,
  buildLatlong,
  reflect,
} from './core.ts';
import { noiseProbe, fbm } from './procedural.ts';
const source = '/src/chapters/14-texture-functions/';
export const figures: FigureSpec[] = [
  {
    id: 'environment-direction',
    chapter: '14',
    title: '把方向映射成纹理地址',
    subtitle: '经纬图的地址表示方向，横向首尾相接；极点经度不唯一。',
    source: source + 'core.ts',
    defaults: { point: [0.125, 0.36], pattern: 'direction' },
    controls: [
      choice('pattern', '环境', [
        ['direction', '方向编码'],
        ['studio', '柔光空间'],
      ]),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing(),
        uv = vec2(p, 'point'),
        direction = latlongToDirection(uv),
        cube = directionToCube(direction),
        image = buildLatlong(128, 64, 0, p.pattern as 'direction' | 'studio');
      d.panel('经纬图', [-0.1, 2.1, -0.1, 1.2], () => {
        bitmap(d, image, [0, 0], [2, 1]);
        d.handle([uv[0] * 2, 1 - uv[1]], 'point', 'UV', {
          limits: [0, 1, 0, 1],
          mapping: { offset: [0, 1], scale: [2, -1] },
        });
      });
      d.panel('方向', [-1.6, 1.6, -1.5, 1.5], () => {
        axes3(d);
        d.line(
          project(Array.from({ length: 81 }, (_, i) => latlongToDirection([i / 80, uv[1]]))).xy,
          palette.yellow,
          1,
        );
        const xy = project([[0, 0, 0], direction]).xy;
        d.arrow(xy[0], xy[1], palette.yellow, 'd');
      });
      d.values = {
        '经纬 UV': uv,
        方向: direction,
        立方体面: ['+X', '−X', '+Y', '−Y', '+Z', '−Z'][cube.face],
        '面内 UV': cube.uv,
      };
      d.formula =
        'u=\\frac{\\operatorname{atan2}(z,x)}{2\\pi}\\bmod1,\\quad v=\\frac{\\arccos y}{\\pi}';
      return d.result();
    },
  },
  {
    id: 'environment-reflection',
    chapter: '14',
    title: '镜面球查询的是反射方向',
    subtitle: '拖动球面探针；环境的旋转通过逆旋转查询方向实现。',
    source: source + 'core.ts',
    defaults: { point: [0.3, 0.2], yaw: 0 },
    controls: [slider('yaw', '环境旋转', -180, 180, 1, '°')],
    animated: false,
    compute(p) {
      const d = new Drawing([-1.2, 2.4, -1.2, 1.2]),
        at = vec2(p, 'point'),
        r2 = at[0] ** 2 + at[1] ** 2;
      const image = texture(96, 96, (x, y) => {
        const sx = (2 * (x + 0.5)) / 96 - 1,
          sy = 1 - (2 * (y + 0.5)) / 96,
          r = sx * sx + sy * sy;
        return r > 1
          ? [0.93, 0.92, 0.88]
          : analyticEnvironment(
              reflect([0, 0, -1], [sx, sy, Math.sqrt(1 - r)]),
              (number(p, 'yaw') * Math.PI) / 180,
            );
      });
      bitmap(d, image, [-1, -1], [2, 2]);
      d.handle(at, 'point', '表面点', { limits: [-0.7, 0.7, -0.7, 0.7] });
      const n: Vec3 = [at[0], at[1], Math.sqrt(Math.max(0, 1 - r2))],
        reflected = reflect([0, 0, -1], n),
        color = analyticEnvironment(reflected, (number(p, 'yaw') * Math.PI) / 180);
      rectangle(d, [1.5, -0.4], [0.6, 0.8], rgb(color));
      d.text([1.3, 0.8], '环境查询', palette.ink, 13);
      d.values = {
        法线: n,
        反射方向: reflected,
        '经纬 UV': directionToLatlong(
          environmentLocalDirection(reflected, (number(p, 'yaw') * Math.PI) / 180),
        ),
        '线性 RGB': color,
      };
      d.formula = 'R=I-2(I\\cdot N)N';
      return d.result();
    },
  },
  {
    id: 'value-noise-lattice',
    chapter: '14',
    title: '噪声来自格点值与平滑权重',
    subtitle: '查询位置可以跨越格点；五次 fade 在格边保持二阶连续。',
    source: source + 'procedural.ts',
    defaults: { point: [0.35, 0.6], seed: 7 },
    controls: [slider('seed', '格点种子', 0, 100, 1)],
    animated: false,
    compute(p) {
      const d = new Drawing([-1.2, 2.2, -1.2, 2.2]),
        point = vec2(p, 'point'),
        seed = number(p, 'seed'),
        probe = noiseProbe(point, seed);
      bitmap(
        d,
        texture(96, 96, (x, y) => {
          const v = noiseProbe([-1 + (3 * (x + 0.5)) / 96, 2 - (3 * (y + 0.5)) / 96], seed).value;
          return [0.1 + 0.7 * v, 0.2 + 0.6 * v, 0.18 + 0.4 * v];
        }),
        [-1, -1],
        [3, 3],
      );
      probe.corners.forEach((q, i) => {
        d.dot(q, palette.yellow, 0.025);
        d.text([q[0] + 0.04, q[1] + 0.08], probe.cornerValues[i].toFixed(3), palette.ink, 12);
      });
      d.handle(point, 'point', '查询点', { limits: [-0.9, 1.9, -0.9, 1.9] });
      d.values = {
        格内坐标: probe.fraction,
        平滑坐标: probe.eased,
        权重: probe.weights,
        结果: probe.value,
      };
      d.formula = 'f(s)=6s^5-15s^4+10s^3';
      return d.result();
    },
  },
  {
    id: 'fbm-coordinate-space',
    chapter: '14',
    title: '纹理跟随物体，还是固定在世界里？',
    subtitle: '两图使用同一个 fBm 函数，区别只有查询坐标。',
    source: source + 'procedural.ts',
    defaults: { translation: 0.5, octaves: 4, gain: 0.5, lacunarity: 2 },
    controls: [
      slider('translation', '物体平移', -2, 2, 0.02),
      slider('octaves', '层数', 1, 8, 1),
      slider('gain', '振幅比', 0, 1, 0.02),
      slider('lacunarity', '频率比', 1, 4, 0.02),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing(),
        shift = number(p, 'translation');
      for (const world of [false, true])
        d.panel(world ? '世界坐标' : '物体坐标', [-0.1, 1.1, -0.1, 1.25], () => {
          const image = texture(64, 64, (x, y) => {
            const v = fbm(
              [((x + 0.5) / 64) * 3 + (world ? shift : 0), ((y + 0.5) / 64) * 3],
              number(p, 'octaves'),
              number(p, 'gain'),
              number(p, 'lacunarity'),
              7,
            );
            return [0.08 + 0.65 * v, 0.18 + 0.5 * v, 0.2 + 0.25 * v];
          });
          bitmap(d, image, [0, 0], [1, 1]);
          d.text([0, 1.12], world ? '世界：滑过物体' : '局部：附着物体', palette.ink, 13);
        });
      d.values = { 物体平移: shift, 层数: number(p, 'octaves') };
      d.formula = 'F(p)=\\frac{\\sum_k g^kN(\\lambda^k p)}{\\sum_k g^k}';
      return d.result();
    },
  },
];
