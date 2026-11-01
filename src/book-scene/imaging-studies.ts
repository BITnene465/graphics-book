import { Drawing, palette } from '../figures/drawing.ts';
import { imagePanel } from '../figures/advanced.ts';
import { slider, choice, number } from '../figures/spec.ts';
import type { FigureSpec } from '../figures/spec.ts';
import type { Vec2, Vec3 } from '../math/vector.ts';
import { compose, matVec } from '../math/matrix.ts';
import { lookAt, perspective } from '../chapters/03-camera/core.ts';
import { homography, warp } from '../chapters/31-registration/core.ts';
import { composite } from '../chapters/28-matting/core.ts';
import { mosaic, demosaic, sensorSamples, bayerChannel } from '../chapters/33-sensors/core.ts';
import { deskState } from './model.ts';
import { renderDesk, deskImage } from './render.ts';
import { deskMatte, lensImage } from './imaging.ts';

export const matting: FigureSpec = {
  id: 'desk-object-matte',
  chapter: '28',
  title: '对象边缘与像素覆盖',
  subtitle: '使用同一次渲染的可见对象与子像素；观察边缘 alpha 和换背景后的颜色。',
  source: '/src/book-scene/imaging.ts',
  animated: false,
  defaults: { object: 'both', background: 0.18 },
  controls: [
    choice('object', '前景对象', [
      ['both', '台灯与小球'],
      ['ball', '小球'],
      ['lamp', '台灯'],
    ]),
    slider('background', '新背景亮度', 0.03, 0.9, 0.01),
  ],
  compute(p) {
    const m = deskMatte(p.object as 'ball' | 'lamp' | 'both'),
      d = new Drawing(),
      a = new Float64Array(m.foreground.length),
      out = new Float64Array(a.length);
    for (let i = 0; i < m.alpha.length; i++) {
      a.fill(m.alpha[i], 3 * i, 3 * i + 3);
      out.set(
        composite(
          Array.from(m.foreground.slice(3 * i, 3 * i + 3)) as Vec3,
          [number(p, 'background') * 0.6, number(p, 'background') * 0.85, number(p, 'background')],
          m.alpha[i],
        ),
        3 * i,
      );
    }
    imagePanel(d, '桌面场景的观测图像', m.width, m.height, m.color);
    imagePanel(d, '几何提供的覆盖 alpha', m.width, m.height, a);
    imagePanel(d, '线性颜色合成', m.width, m.height, out);
    d.values = {
      部分覆盖像素: m.alpha.filter((x) => x > 0 && x < 1).length,
      每像素覆盖样本: 4,
      已知信息: '可见对象身份；只合成不透明物体的像素覆盖',
    };
    return d.result();
  },
};

export const registration: FigureSpec = {
  id: 'desk-planar-registration',
  chapter: '31',
  title: '桌面对齐了，小球为什么仍会错位',
  subtitle: '四个桌面点求单应；用同一个变换预测离开桌面的球心，直接观察视差。',
  source: '/src/book-scene/imaging.ts',
  animated: false,
  defaults: { baseline: 0.8 },
  controls: [slider('baseline', '相机横向位移', -1.3, 1.3, 0.05, 'm')],
  compute(p) {
    const a = deskState(),
      b = deskState(),
      w = 160,
      h = 107;
    b.camera.eye[0] += number(p, 'baseline');
    const project = (state: typeof a, world: Vec3): Vec2 => {
      const q = matVec(
        compose(
          perspective(state.camera.fov, w / h, 0.1, 30),
          lookAt(state.camera.eye, state.camera.target),
        ),
        [...world, 1],
      );
      return [((q[0] / q[3]) * w) / h, q[1] / q[3]];
    };
    const corners: Vec3[] = [
        [-2, 0, -1.2],
        [2, 0, -1.2],
        [2, 0, 1.2],
        [-2, 0, 1.2],
      ],
      from = corners.map((v) => project(a, v)),
      to = corners.map((v) => project(b, v));
    const H = homography(from, to),
      ball = a.objects.find((o) => o.key === 'ball')!.position;
    const predicted = warp(H, project(a, ball)),
      actual = project(b, ball),
      d = new Drawing();
    for (const [state, title, cs] of [
      [a, '原相机', from],
      [b, '移动后的相机', to],
    ] as const) {
      const f = renderDesk(state, w, h);
      imagePanel(d, title, w, h, f.color, 1, () => {
        d.line([...cs, cs[0]], palette.green, 1.5);
        cs.forEach((v) => d.dot(v, palette.green, 0.025));
        if (state === b) {
          d.line([predicted, actual], palette.red, 2);
          d.dot(predicted, palette.red, 0.028);
          d.dot(actual, palette.yellow, 0.02);
        }
      });
    }
    const plane = project(b, [0.5, 0, 0.5]),
      check = warp(H, project(a, [0.5, 0, 0.5]));
    d.values = {
      '桌面检查点误差 / px': (Math.hypot(check[0] - plane[0], check[1] - plane[1]) * h) / 2,
      '球心预测误差 / px': (Math.hypot(predicted[0] - actual[0], predicted[1] - actual[1]) * h) / 2,
      红点: '按桌面单应预测',
      黄点: '新相机真实投影',
    };
    return d.result();
  },
};

export const lens: FigureSpec = {
  id: 'desk-aperture',
  chapter: '32',
  title: '桌面上的景深',
  subtitle: '实际移动孔径样本并重新投影；颜色在线性域累积，未使用图像模糊滤镜。',
  source: '/src/book-scene/imaging.ts',
  animated: false,
  defaults: { focus: 5.5, aperture: 0.18, samples: 13 },
  controls: [
    slider('focus', '对焦平面轴向距离', 3.6, 7.5, 0.05, 'm'),
    slider('aperture', '孔径半径', 0, 0.3, 0.01, 'm'),
    choice('samples', '孔径求积样本', [
      [1, '1'],
      [5, '5'],
      [13, '13'],
      [25, '25'],
    ]),
  ],
  compute(p) {
    const d = new Drawing(),
      out = lensImage(number(p, 'focus'), number(p, 'aperture'), number(p, 'samples')),
      reference = deskImage(out.width, out.height);
    imagePanel(d, '相同构图 · 针孔', reference.width, reference.height, reference.data);
    imagePanel(d, '有限孔径 · 偏轴视图累计', out.width, out.height, out.data);
    d.values = {
      '对焦距离 / m': number(p, 'focus'),
      孔径样本: p.samples,
      曝光约定: '归一化平均，保持接收总能量',
      近似: '几何光学；有限孔径求积；不含衍射',
    };
    return d.result();
  },
};

export const sensor: FigureSpec = {
  id: 'desk-sensor',
  chapter: '33',
  title: '同一幅图像怎样成为传感器读数',
  subtitle: '桌面场景的线性 RGB 经过 RGGB 采样、光子与读出噪声，再重建三个通道。',
  source: '/src/book-scene/imaging.ts',
  animated: false,
  defaults: { photons: 300, read: 3, seed: 7 },
  controls: [
    slider('photons', '单位线性值的平均电子数', 20, 1200, 20, 'e⁻'),
    slider('read', '读出噪声', 0, 12, 0.5, 'e⁻'),
    slider('seed', '测量种子', 1, 30, 1),
  ],
  compute(p) {
    const source = deskImage(),
      ideal = mosaic(source),
      gain = number(p, 'photons');
    const raw = ideal.map(
      (x, i) =>
        sensorSamples(
          Math.max(0, x * gain),
          number(p, 'read'),
          1,
          number(p, 'seed') + i * 7919,
        )[0] / gain,
    );
    const observed = source.data.map((_, i) =>
      i % 3 === bayerChannel(Math.floor(i / 3) % source.width, Math.floor(i / 3 / source.width))
        ? raw[Math.floor(i / 3)]
        : 0,
    );
    const out = demosaic(raw, source.width, source.height),
      d = new Drawing();
    imagePanel(d, '生成器的全通道参考', source.width, source.height, source.data);
    imagePanel(d, '每位置一个带噪通道', source.width, source.height, observed);
    imagePanel(d, '去马赛克后的图像', out.width, out.height, out.data);
    d.values = {
      全通道均方误差:
        out.data.reduce((s, x, i) => s + (x - source.data[i]) ** 2, 0) / out.data.length,
      原始观测值数: raw.length,
      未测得的通道: '由邻域估计；增加曝光不能补回空间采样信息',
    };
    return d.result();
  },
};
