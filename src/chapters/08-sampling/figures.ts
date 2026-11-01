import { Drawing, palette } from '../../figures/drawing.ts';
import { plot, bitmap, rectangle } from '../../figures/helpers.ts';
import { slider, choice, number } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec2 } from '../../math/vector.ts';
import { texture } from '../07-textures/core.ts';
import {
  aliasFrequency,
  prefilteredCosine,
  boxResponse,
  cosineWindowIntegral,
  cosineSpectralLines,
  sampleCoverage,
  exactCoverage,
  averageColor,
  sampleOffsets,
  sceneValue,
  halfplaneCoverage,
} from './core.ts';
import type { SampleScene } from './core.ts';
import { renderScene } from './multisample.ts';
import {
  apparentSpeed,
  wheelFrame,
  wheelReference,
  wheelExposure,
  shutterInterval,
} from './temporal.ts';
import type { Triangle2 } from '../04-barycentric/core.ts';

const source = '/src/chapters/08-sampling/';
const waveDefaults = { frequency: 9, rate: 12, phase: 0 };
const waveControls = [
  slider('frequency', '信号频率', 0, 30, 0.1, ' Hz'),
  slider('rate', '采样率', 2, 30, 1, ' Hz'),
];
export const figures: FigureSpec[] = [
  {
    id: 'sampling-alias',
    chapter: '08',
    title: '不同的曲线，可以穿过同一批样本',
    subtitle: '蓝线是真实信号，红线是折回 Nyquist 区间的等价信号。',
    source: source + 'core.ts',
    defaults: waveDefaults,
    controls: waveControls,
    compute(p, t) {
      const d = new Drawing([-0.05, 1.1, -0.2, 1.3]),
        f = number(p, 'frequency'),
        rate = number(p, 'rate'),
        alias = aliasFrequency(f, rate),
        phase = t * 2 * Math.PI;
      d.axes(0, 1, 0, 1);
      plot(d, (x) => 0.5 + 0.4 * Math.sin(2 * Math.PI * f * x + phase), [0, 1], palette.blue, 400);
      plot(
        d,
        (x) => 0.5 + 0.4 * Math.sin(2 * Math.PI * alias * x + phase),
        [0, 1],
        palette.red,
        250,
      );
      for (let i = 0; i <= rate; i++)
        d.dot(
          [i / rate, 0.5 + 0.4 * Math.sin((2 * Math.PI * f * i) / rate + phase)],
          palette.yellow,
          0.008,
        );
      d.values = { 真实频率: f, 等价频率: alias, 'Nyquist 上限': rate / 2 };
      d.formula = 'f_{alias}=f-k f_s';
      return d.result();
    },
  },
  {
    id: 'sample-coverage',
    chapter: '08',
    title: '一个斜边像素中的样本',
    subtitle: '拖动边缘，比较有限采样与像素盒的解析覆盖面积。',
    source: source + 'core.ts',
    defaults: { phase: 0, angle: 35, samples: 16 },
    controls: [
      slider('phase', '亚像素位移', -0.8, 0.8, 0.005),
      slider('angle', '边缘角度', -180, 180, 1, '°'),
      choice('samples', '样本数', [
        [1, '1'],
        [4, '4'],
        [16, '16'],
        [64, '64'],
        [256, '256'],
      ]),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-0.8, 1.5, -0.8, 0.9]),
        a = (number(p, 'angle') * Math.PI) / 180,
        phase = number(p, 'phase'),
        n: Vec2 = [Math.cos(a), Math.sin(a)],
        sample = sampleOffsets(number(p, 'samples')),
        covered = sample.map((v) =>
          sceneValue([v[0] - 0.5, v[1] - 0.5], { scene: 'edge', angle: number(p, 'angle'), phase }),
        );
      rectangle(d, [-0.5, -0.5], [1, 1], palette.ink, 0.05);
      d.line(
        [
          [n[0] * phase - n[1] * 2, n[1] * phase + n[0] * 2],
          [n[0] * phase + n[1] * 2, n[1] * phase - n[0] * 2],
        ],
        palette.blue,
        2,
      );
      sample.forEach((v, i) =>
        d.dot([v[0] - 0.5, v[1] - 0.5], covered[i] ? palette.green : palette.red, 0.018),
      );
      const estimate = covered.reduce((a, b) => a + b, 0) / covered.length,
        exact = halfplaneCoverage([0, 0], n, phase);
      d.values = { 样本平均: estimate, 解析覆盖率: exact, 绝对误差: Math.abs(estimate - exact) };
      d.formula =
        '\\alpha=\\frac{\\operatorname{area}(pixel\\cap shape)}{\\operatorname{area}(pixel)}';
      return d.result();
    },
  },
  {
    id: 'convolution-window',
    chapter: '08',
    title: '像素窗口在连续信号上移动',
    subtitle: '有宽度的像素测量的是平均值；黄色区域是积分的当前进度。',
    source: source + 'core.ts',
    defaults: { frequency: 4, halfWidth: 0.12, center: 0.5 },
    controls: [
      slider('frequency', '频率', 0, 16, 0.1),
      slider('halfWidth', '窗口半宽', 0.005, 0.3, 0.005),
      slider('center', '窗口中心', 0, 1, 0.005),
    ],
    compute(p, t) {
      const d = new Drawing([-0.35, 1.35, -0.15, 1.2]),
        f = number(p, 'frequency'),
        h = number(p, 'halfWidth'),
        center = number(p, 'center');
      rectangle(d, [center - h, 0], [2 * h, 1], palette.blue, 0.05);
      const end = center - h + 2 * h * t,
        curve = Array.from({ length: 81 }, (_, i) => {
          const x = center - h + ((end - center + h) * i) / 80;
          return [x, prefilteredCosine(x, f, 0)];
        });
      d.polygon([[center - h, 0], ...curve, [end, 0]], palette.yellow, 0.2);
      plot(d, (x) => prefilteredCosine(x, f, 0), [-0.3, 1.3], palette.blue, 400);
      const average = prefilteredCosine(center, f, h);
      d.line(
        [
          [center - h, average],
          [center + h, average],
        ],
        palette.green,
        2.5,
      );
      d.dot([center, average], palette.green, 0.012);
      d.values = {
        积分当前值: cosineWindowIntegral(center, h, f, 0, t),
        完整窗口平均: average,
        频率响应: boxResponse(f, h),
      };
      d.formula = '(g*h)(x)=\\frac{1}{2a}\\int_{x-a}^{x+a}g(t)\\,dt';
      return d.result();
    },
  },
  {
    id: 'sampling-spectrum',
    chapter: '08',
    title: '采样让频谱周期性重复',
    subtitle: '谱线表示解析 δ 分布的系数；重叠时先加复系数。',
    source: source + 'core.ts',
    defaults: { frequency: 4, rate: 10, phase: 0 },
    controls: [...waveControls, slider('phase', '相位', 0, Math.PI * 2, 0.02)],
    animated: false,
    compute(p) {
      const d = new Drawing([-32, 32, -0.15, 1.2]),
        f = number(p, 'frequency'),
        rate = number(p, 'rate'),
        phase = number(p, 'phase'),
        lines = cosineSpectralLines(f, phase, rate, 30);
      rectangle(d, [-rate / 2, 0], [rate, 1], palette.green, 0.06);
      d.axes(-30, 30, 0, 1);
      for (const line of lines) {
        d.line(
          [
            [line.position, 0],
            [line.position, line.magnitude],
          ],
          palette.blue,
          2.5,
        );
        d.dot([line.position, line.magnitude], palette.yellow, 0.12);
      }
      d.values = {
        基带: [-rate / 2, rate / 2],
        折回频率: aliasFrequency(f, rate),
        谱线数: lines.length,
      };
      d.formula = 'X_s(f)/f_s=\\sum_{k\\in\\mathbb Z}X(f-kf_s)';
      return d.result();
    },
  },
  {
    id: 'multisample-compare',
    chapter: '08',
    title: '覆盖频率与着色频率是两回事',
    subtitle: 'SSAA 与 MSAA 共用逐样本覆盖和深度；只改变着色求值的位置。',
    source: source + 'multisample.ts',
    defaults: { offset: 0.15, frequency: 0, grid: 2 },
    controls: [
      slider('offset', '亚像素偏移', -1, 1, 0.01),
      slider('frequency', '着色频率', 0, 2, 0.01),
      choice('grid', '每轴样本', [
        [2, '2'],
        [4, '4'],
      ]),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing(),
        size = 32,
        o = number(p, 'offset'),
        triangles: Triangle2[] = [
          [
            [2 + o, 3],
            [30 + o, 7],
            [9 + o, 30],
          ],
          [
            [4 + o, 21],
            [30 + o, 11],
            [27 + o, 21],
          ],
        ],
        frame = renderScene(
          triangles,
          [
            [0.6, 0.6, 0.6],
            [0.2, 0.2, 0.2],
          ],
          [
            [0.15, 0.5, 0.7],
            [0.85, 0.4, 0.12],
          ],
          size,
          size,
          number(p, 'grid'),
          number(p, 'frequency'),
        );
      for (const key of ['center', 'ssaa', 'msaa'] as const)
        d.panel(key, [-0.1, 1.1, -0.1, 1.25], () => {
          bitmap(d, { width: size, height: size, data: frame[key].image }, [0, 0], [1, 1], true);
          d.text([0, 1.12], key.toUpperCase(), palette.ink, 14);
        });
      d.values = {
        单样本着色: frame.center.shadingCount,
        'SSAA 着色': frame.ssaa.shadingCount,
        'MSAA 着色': frame.msaa.shadingCount,
      };
      return d.result();
    },
  },
  {
    id: 'multisample-pixel',
    chapter: '08',
    title: '放大一个像素，检查每个样本的所有者',
    subtitle: '即使一个像素同时看到两个图元，MSAA 也分别为可见图元着色。',
    source: source + 'multisample.ts',
    defaults: { offset: 0.1, grid: 4, frequency: 0.8 },
    controls: [
      slider('offset', '边缘位置', -0.5, 0.5, 0.005),
      choice('grid', '每轴样本', [
        [2, '2'],
        [4, '4'],
        [8, '8'],
      ]),
      slider('frequency', '着色频率', 0, 4, 0.05),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-0.1, 1.8, -0.2, 1.3]),
        o = number(p, 'offset'),
        triangles: Triangle2[] = [
          [
            [o, -1],
            [2 + o, 0],
            [o, 2],
          ],
          [
            [-1, -1],
            [2, -1],
            [-1, 2],
          ],
        ],
        frame = renderScene(
          triangles,
          [
            [0.3, 0.3, 0.3],
            [0.6, 0.6, 0.6],
          ],
          [
            [0.12, 0.4, 0.7],
            [0.2, 0.65, 0.3],
          ],
          1,
          1,
          number(p, 'grid'),
          number(p, 'frequency'),
        );
      rectangle(d, [0, 0], [1, 1], palette.ink, 0.06);
      frame.positions.forEach((at, i) => {
        d.dot(
          at,
          frame.ssaa.owner[i] === 0
            ? palette.blue
            : frame.ssaa.owner[i] === 1
              ? palette.green
              : palette.muted,
          0.02,
        );
      });
      d.line(
        [
          [o, 0],
          [o, 1],
        ],
        palette.yellow,
        1.5,
      );
      d.values = {
        '逐样本 owner': [...frame.ssaa.owner],
        'SSAA RGB': [...frame.ssaa.image],
        'MSAA RGB': [...frame.msaa.image],
        'MSAA 求值': frame.msaa.shadingCount,
      };
      return d.result();
    },
  },
  {
    id: 'temporal-aliasing',
    chapter: '08',
    title: '为什么轮子看起来倒着转？',
    subtitle: '左侧显示真实连续运动；右侧在离散帧时刻保持采样图像。',
    source: source + 'temporal.ts',
    defaults: { speed: 1, fps: 12, blades: 8 },
    controls: [
      slider('speed', '转速', -5, 5, 0.05, ' rev/s'),
      slider('fps', '帧率', 2, 60, 1, ' fps'),
      slider('blades', '重复亮瓣', 2, 16, 1),
    ],
    duration: 1,
    compute(p, t) {
      const d = new Drawing(),
        speed = number(p, 'speed'),
        fps = number(p, 'fps'),
        blades = number(p, 'blades'),
        sampled = Math.floor(t * fps) / fps;
      for (const [name, time] of [
        ['真实运动', t],
        ['离散帧', sampled],
      ] as const)
        d.panel(name, [-0.1, 1.1, -0.1, 1.25], () => {
          bitmap(
            d,
            { width: 96, height: 96, data: wheelFrame(time, speed, blades, 96) },
            [0, 0],
            [1, 1],
          );
          d.text([0, 1.12], name, palette.ink, 13);
        });
      d.values = {
        真实转速: speed,
        等价低频转速: apparentSpeed(speed, fps, blades),
        当前帧时刻: sampled,
      };
      d.formula = '\\omega_{alias}=\\operatorname{alias}(B\\omega,f_s)/B';
      return d.result();
    },
  },
  {
    id: 'temporal-shutter',
    chapter: '08',
    title: '快门不是一个瞬间',
    subtitle: '比较有限时间样本的平均与同一运动的解析曝光。',
    source: source + 'temporal.ts',
    defaults: { speed: 1, fps: 12, duty: 1, samples: 2 },
    controls: [
      slider('speed', '转速', 0, 5, 0.05),
      slider('fps', '帧率', 2, 60, 1),
      slider('duty', '快门占空比', 0, 1, 0.02),
      choice('samples', '时间样本', [
        [1, '1'],
        [2, '2'],
        [4, '4'],
        [8, '8'],
        [16, '16'],
        [64, '64'],
      ]),
    ],
    duration: 2,
    compute(p, t) {
      const d = new Drawing(),
        speed = number(p, 'speed'),
        interval = shutterInterval(t, number(p, 'fps'), number(p, 'duty')),
        samples = number(p, 'samples'),
        estimate = wheelExposure(t, interval.duration, samples, speed, 8, 64),
        reference = wheelReference(t, interval.duration, speed, 8, 64);
      for (const [name, data] of [
        ['时间样本平均', estimate],
        ['解析曝光参考', reference],
      ] as const)
        d.panel(name, [-0.1, 1.1, -0.1, 1.25], () => {
          bitmap(d, { width: 64, height: 64, data }, [0, 0], [1, 1]);
          d.text([0, 1.12], name, palette.ink, 13);
        });
      d.values = {
        曝光时长: interval.duration,
        最大线性误差: estimate.reduce((m, x, i) => Math.max(m, Math.abs(x - reference[i])), 0),
      };
      d.formula = 'C=\\frac1{\\Delta t}\\int_{t-\\Delta t/2}^{t+\\Delta t/2}C(\\tau)\\,d\\tau';
      return d.result();
    },
  },
];
export const main: FigureSpec = {
  id: 'main',
  chapter: '08',
  title: '保持输出像素数，只改变像素内部的采样',
  subtitle: '解析参考仅用于斜边和细线；棋盘采用有限采样。',
  source: source + 'core.ts',
  defaults: {
    samples: 16,
    angle: 35,
    phase: 0,
    scene: 'line',
    strategy: 'grid',
    width: 0.8,
    cell: 3,
  },
  controls: [
    choice('samples', '每像素样本', [
      [1, '1'],
      [4, '4'],
      [16, '16'],
      [64, '64'],
      [256, '256'],
    ]),
    slider('angle', '边缘角度', -180, 180, 1, '°'),
    slider('phase', '亚像素位移', -3, 3, 0.01),
    slider('width', '线宽 / px', 0.05, 6, 0.05),
    choice('scene', '场景', [
      ['line', '细线'],
      ['edge', '斜边'],
      ['checker', '棋盘'],
    ]),
    choice('strategy', '采样', [
      ['grid', '规则'],
      ['jitter', '分层抖动'],
    ]),
  ],
  animated: false,
  compute(p) {
    const d = new Drawing(),
      scene: SampleScene = {
        scene: p.scene as SampleScene['scene'],
        phase: number(p, 'phase'),
        angle: number(p, 'angle'),
        width: number(p, 'width'),
        cell: number(p, 'cell'),
      },
      estimate = sampleCoverage(40, number(p, 'samples'), p.strategy as 'grid' | 'jitter', scene),
      reference = p.scene === 'checker' ? null : exactCoverage(40, scene);
    for (const [name, data] of [
      ['有限样本', estimate],
      ...(reference ? [['解析面积参考', reference] as const] : []),
    ] as const)
      d.panel(name, [-0.1, 1.1, -0.1, 1.25], () => {
        bitmap(
          d,
          texture(40, 40, (x, y) => averageColor(data[y * 40 + x])),
          [0, 0],
          [1, 1],
          true,
        );
        d.text([0, 1.12], name, palette.ink, 13);
      });
    d.values = {
      输出分辨率: '40 × 40',
      每像素样本: number(p, 'samples'),
      平均绝对误差: reference
        ? estimate.reduce((s, x, i) => s + Math.abs(x - reference[i]), 0) / 1600
        : '未提供解析参考',
    };
    return d.result();
  },
};
