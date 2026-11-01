import { Drawing, palette } from '../../figures/drawing.ts';
import { cylindricalFigure } from './cylindrical-figure.ts';
import { bitmap, rectangle, rgb, axes3 } from '../../figures/helpers.ts';
import { slider, choice, number, vec2 } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { identity } from '../../math/matrix.ts';
import {
  texture,
  checkerTexture,
  buildMipmaps,
  sampleTexture,
  sampleTrilinear,
  sampleAnisotropic,
  perspectiveInterpolate,
  bilinearTaps,
} from './core.ts';
import { buildRipmap, ripmapProbe, ellipseFilter, ripmapWeights } from './footprint-filters.ts';
import { surfaceSample, gridMesh, heightField } from './surface-maps.ts';
import { project } from '../12-geometry/core.ts';
import { renderFrame, fragmentStage } from '../11-pipeline/core.ts';
import { lookAt, perspective } from '../03-camera/core.ts';

const source = '/src/chapters/08-textures/';
const demoTexture = checkerTexture(32, 8),
  mips = buildMipmaps(demoTexture),
  rips = buildRipmap(demoTexture);
export const figures: FigureSpec[] = [
  cylindricalFigure,
  {
    id: 'perspective-uv',
    chapter: '08',
    title: '屏幕中点并不是表面中点',
    subtitle: '拖动屏幕采样点或远端 B；同一条视线连接像素、表面点与纹理地址。',
    source: source + 'core.ts',
    defaults: { weight: 0.5, far: 4 },
    controls: [slider('weight', '屏幕权重 λ', 0, 1, 0.005), slider('far', '远端 w', 1, 12, 0.05)],
    animated: false,
    compute(p) {
      const d = new Drawing(),
        t = number(p, 'weight'),
        far = number(p, 'far'),
        u = perspectiveInterpolate([1 - t, t], [[0], [1]], [1, 1 / far])[0];
      // 剖面中的横轴是深度 w，纵轴是世界高度。两端投影始终位于 −0.7、+0.7。
      const a: Vec2 = [1, -0.7],
        b: Vec2 = [far, 0.7 * far],
        q: Vec2 = [(1 - u) * a[0] + u * b[0], (1 - u) * a[1] + u * b[1]],
        f = 0.55,
        imageY = f * (1.4 * t - 0.7);
      d.panel('投影与表面', [-0.6, far + 0.9, -1.35, 0.7 * far + 0.85], () => {
        d.polygon([[0, 0], a, b], palette.blue, 0.035);
        d.line([[0, 0], a], palette.muted, 1, 0.6, true);
        d.line([[0, 0], b], palette.muted, 1, 0.6, true);
        d.line(
          [
            [f, -0.75],
            [f, 0.8],
          ],
          palette.red,
          2,
        );
        d.text([f - 0.25, -0.97], '成像平面', palette.red, 11);
        d.line([a, b], palette.green, 3);
        for (let i = 0; i <= 8; i++)
          d.dot(
            [(1 - i / 8) * a[0] + (i / 8) * b[0], (1 - i / 8) * a[1] + (i / 8) * b[1]],
            palette.green,
            0.025,
          );
        d.line([[0, 0], q], palette.yellow, 2, 1, true);
        d.dot([0, 0], palette.ink, 0.05);
        d.text([-0.45, -0.3], '相机', palette.ink, 11);
        d.dot(a, palette.blue, 0.05);
        d.text([a[0] + 0.12, a[1] - 0.18], 'A · u=0', palette.blue, 12);
        d.handle(b, 'far', 'B · 深度 w', { axes: [0], limits: [1, 12, -10, 10] });
        d.dot(q, palette.green, 0.06);
        if (u > 0.03 && u < 0.95) d.text([q[0] + 0.18, q[1]], '表面点', palette.green, 11);
        d.handle([f, imageY], 'weight', 'λ', {
          axes: [1],
          limits: [0, 1, 0, 1],
          mapping: { offset: [0, -0.7 * f], scale: [1, 1.4 * f] },
        });
      });
      d.panel('同一像素，两种地址', [-0.2, 1.25, -0.45, 1.55], () => {
        for (const y of [0, 1]) {
          d.line(
            [
              [0, y],
              [1, y],
            ],
            palette.muted,
            2,
          );
          for (let i = 0; i <= 4; i++)
            d.line(
              [
                [i / 4, y - 0.045],
                [i / 4, y + 0.045],
              ],
              palette.muted,
              1,
            );
        }
        d.text([0, 1.32], '屏幕仿射 · 直接使用 λ', palette.red, 12);
        d.text([0, -0.28], '透视正确 · 表面地址 u', palette.green, 12);
        d.dot([t, 1], palette.red, 0.035);
        d.dot([u, 0], palette.green, 0.035);
        d.line(
          [
            [t, 1],
            [u, 0],
          ],
          palette.yellow,
          1.5,
          1,
          true,
        );
        d.handle([t, 1], 'weight', 'λ', { axes: [0], limits: [0, 1, -2, 2] });
      });
      d.values = { '屏幕 λ': t, '正确 u': u, '两端 w': [1, far], '表面点 [w,y]': q };
      d.formula =
        '\\color{#237e79}{u}=\\frac{(1-\\lambda)u_A/w_A+\\lambda u_B/w_B}{(1-\\lambda)/w_A+\\lambda/w_B}';
      return d.result();
    },
  },
  {
    id: 'texture-filter',
    chapter: '08',
    title: '四个纹素如何共同决定一个颜色',
    subtitle: '拖动查询点，实际权重与颜色随位置连续改变。',
    source: source + 'core.ts',
    defaults: { point: [0.5, 0.5], filter: 'bilinear' },
    controls: [
      choice('filter', '过滤', [
        ['nearest', '最近邻'],
        ['bilinear', '双线性'],
      ]),
    ],
    animated: false,
    compute(p) {
      const image = texture(
          2,
          2,
          (x, y) =>
            [
              [
                [0.1, 0.3, 0.8],
                [0.7, 0.2, 0.08],
              ],
              [
                [0.1, 0.55, 0.3],
                [0.9, 0.75, 0.2],
              ],
            ][y][x] as Vec3,
        ),
        d = new Drawing([-0.2, 1.8, -0.2, 1.3]),
        uv = vec2(p, 'point'),
        value = sampleTexture(image, uv, p.filter as 'nearest' | 'bilinear'),
        taps = bilinearTaps(uv, 2, 2);
      bitmap(d, image, [0, 0], [1, 1], true);
      d.handle(uv, 'point', 'UV', { limits: [0, 1, 0, 1] });
      rectangle(d, [1.2, 0.2], [0.4, 0.6], rgb(value));
      d.text([1.15, 1], '查询结果', palette.ink, 13);
      d.values = { 四个权重: taps.weights, '线性 RGB': value };
      d.formula = 'C=(1-s)(1-t)C_{00}+s(1-t)C_{10}+(1-s)tC_{01}+stC_{11}';
      return d.result();
    },
  },
  {
    id: 'mipmap-levels',
    chapter: '08',
    title: '从细节图像到面积平均',
    subtitle: '每层都由上一层的线性颜色平均生成；观察连续 LOD 的过渡。',
    source: source + 'core.ts',
    defaults: { lod: 1.5 },
    controls: [slider('lod', '连续 LOD', 0, 5, 0.01)],
    animated: false,
    compute(p) {
      const d = new Drawing([-1, 1, -1, 1]),
        lod = number(p, 'lod');
      mips.forEach((image, i) =>
        d.panel(`L${i}`, [-0.1, 1.1, -0.1, 1.25], () => {
          bitmap(d, image, [0, 0], [1, 1], true);
          d.text([0, 1.12], `L${i} · ${image.width}²`, palette.ink, 13);
        }),
      );
      d.panel('连续查询', [-0.1, 1.1, -0.1, 1.25], () => {
        bitmap(
          d,
          texture(64, 64, (x, y) =>
            sampleTrilinear(mips, [(x + 0.5) / 64, 1 - (y + 0.5) / 64], lod),
          ),
          [0, 0],
          [1, 1],
        );
        d.text([0, 1.12], '相邻层混合', palette.green, 13);
      });
      d.values = { 低层: Math.floor(lod), 高层: Math.min(5, Math.ceil(lod)), 混合比例: lod % 1 };
      return d.result();
    },
  },
  {
    id: 'texture-minification',
    chapter: '08',
    title: '一个屏幕像素会覆盖多少纹素？',
    subtitle: '对同一条纹理窗口比较点查询与足迹过滤。',
    source: source + 'core.ts',
    defaults: { span: 4, anisotropy: 4, filter: 'trilinear', phase: 0 },
    controls: [
      slider('span', '长轴跨度 / texel', 1, 16, 0.1),
      slider('anisotropy', '长短轴比例', 1, 16, 0.1),
      slider('phase', '纹理平移', 0, 1, 0.005),
      choice('filter', '过滤', [
        ['bilinear', '双线性'],
        ['trilinear', '三线性'],
        ['anisotropic', '各向异性'],
      ]),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-1, 1, -1, 1]),
        span = number(p, 'span'),
        ratio = number(p, 'anisotropy'),
        phase = number(p, 'phase'),
        jacobian = [
          [span / 32, 0],
          [0, span / ratio / 32],
        ];
      const sample = (filtered: boolean) =>
        texture(48, 48, (x, y) => {
          const uv: Vec2 = [((x + 0.5) / 48 + phase) % 1, 1 - (y + 0.5) / 48];
          return !filtered
            ? sampleTexture(demoTexture, uv, 'nearest')
            : p.filter === 'bilinear'
              ? sampleTexture(demoTexture, uv)
              : p.filter === 'trilinear'
                ? sampleTrilinear(mips, uv, Math.log2(span))
                : sampleAnisotropic(mips, uv, jacobian);
        });
      for (const [key, filtered] of [
        ['点查询', false],
        ['足迹过滤', true],
      ] as const)
        d.panel(key, [-0.1, 1.1, -0.1, 1.25], () => {
          bitmap(d, sample(filtered), [0, 0], [1, 1], true);
          d.text([0, 1.12], key, palette.ink, 13);
        });
      d.values = {
        '长轴 / texel': span,
        '短轴 / texel': span / ratio,
        '各向同性 LOD': Math.log2(span),
      };
      return d.result();
    },
  },
  {
    id: 'ripmap-axis',
    chapter: '08',
    title: '横向与纵向可以选择不同层级',
    subtitle: '两个独立 LOD 决定四个层对；右图显示原纹素的真实贡献权重。',
    source: source + 'footprint-filters.ts',
    defaults: { point: [0.5, 0.5], lodX: 2, lodY: 0.3 },
    controls: [slider('lodX', '横向 LOD', 0, 5, 0.02), slider('lodY', '纵向 LOD', 0, 5, 0.02)],
    animated: false,
    compute(p) {
      const d = new Drawing(),
        uv = vec2(p, 'point'),
        lod: Vec2 = [number(p, 'lodX'), number(p, 'lodY')],
        probe = ripmapProbe(rips, uv, lod),
        weights = ripmapWeights(32, 32, uv, lod),
        maximum = Math.max(...weights);
      d.panel('纹理', [-0.1, 1.1, -0.1, 1.25], () => {
        bitmap(d, demoTexture, [0, 0], [1, 1], true);
        d.handle(uv, 'point', 'UV', { limits: [0, 1, 0, 1] });
        d.text([0, 1.12], '源纹理', palette.ink, 13);
      });
      d.panel('贡献', [-0.1, 1.1, -0.1, 1.25], () => {
        bitmap(
          d,
          texture(32, 32, (x, y) => [
            weights[y * 32 + x] / maximum,
            (0.2 * weights[y * 32 + x]) / maximum,
            0,
          ]),
          [0, 0],
          [1, 1],
          true,
        );
        d.text([0, 1.12], '归一化贡献分布', palette.yellow, 13);
      });
      d.values = {
        层对: probe.queries.map((q) => q.level),
        层权重: probe.queries.map((q) => q.weight),
        '线性 RGB': probe.color,
      };
      return d.result();
    },
  },
  {
    id: 'elliptical-footprint',
    chapter: '08',
    title: '足迹的方向也会改变结果',
    subtitle: '同一中心与跨度，旋转椭圆会选择不同的实际纹素。',
    source: source + 'footprint-filters.ts',
    defaults: { point: [0.5, 0.5], major: 12, minor: 3, angle: 35 },
    controls: [
      slider('major', '轴 1 跨度', 0, 32, 0.1),
      slider('minor', '轴 2 跨度', 0, 16, 0.1),
      slider('angle', '足迹方向', -180, 180, 1, '°'),
    ],
    animated: false,
    compute(p) {
      const image = texture(32, 32, (x, y) => {
          const t = 0.5 + 0.45 * Math.cos((2 * Math.PI * (x + y)) / 6);
          return [0.05 + 0.85 * t, 0.15 + 0.5 * t, 0.4 - 0.2 * t];
        }),
        d = new Drawing(),
        uv = vec2(p, 'point'),
        a = number(p, 'major'),
        b = number(p, 'minor'),
        angle = number(p, 'angle'),
        result = ellipseFilter(image, uv, a, b, angle),
        m = Math.max(...result.weights);
      d.panel('足迹', [-0.1, 1.1, -0.1, 1.25], () => {
        bitmap(d, image, [0, 0], [1, 1], true);
        const theta = (angle * Math.PI) / 180;
        d.line(
          Array.from({ length: 81 }, (_, i) => {
            const x = (a / 64) * Math.cos((i / 80) * 2 * Math.PI),
              y = (b / 64) * Math.sin((i / 80) * 2 * Math.PI);
            return [
              uv[0] + Math.cos(theta) * x - Math.sin(theta) * y,
              uv[1] + Math.sin(theta) * x + Math.cos(theta) * y,
            ];
          }),
          palette.yellow,
          2.5,
        );
        d.handle(uv, 'point', 'UV', { limits: [0, 1, 0, 1] });
      });
      d.panel('权重', [-0.1, 1.1, -0.1, 1.25], () => {
        bitmap(
          d,
          texture(32, 32, (x, y) => {
            const w = result.weights[y * 32 + x] / m;
            return [w, 0.5 * w, 0.1 * w];
          }),
          [0, 0],
          [1, 1],
          true,
        );
      });
      d.values = {
        实际纹素: result.uniqueTexels,
        双线性回退: result.fallback,
        '线性 RGB': result.color,
        权重和: result.weights.reduce((a, b) => a + b, 0),
      };
      return d.result();
    },
  },
  {
    id: 'height-normal',
    chapter: '08',
    title: '从高度的变化率得到法线',
    subtitle: '高度本身决定位置，高度的偏导决定表面朝向。',
    source: source + 'surface-maps.ts',
    defaults: { point: [0.37, 0.42], amplitude: 0.25, frequency: 1.5 },
    controls: [
      slider('amplitude', '高度振幅', 0, 0.7, 0.01),
      slider('frequency', '频率', 0, 5, 0.05),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing(),
        uv = vec2(p, 'point'),
        a = number(p, 'amplitude'),
        f = number(p, 'frequency'),
        s = surfaceSample(uv, a, f);
      d.panel('高度场', [-0.1, 1.1, -0.1, 1.2], () => {
        bitmap(
          d,
          texture(64, 64, (x, y) => {
            const h = surfaceSample([(x + 0.5) / 64, 1 - (y + 0.5) / 64], a, f).height;
            return [0.4 + h * 0.4, 0.5 + h * 0.4, 0.4 + h * 0.4];
          }),
          [0, 0],
          [1, 1],
        );
        d.handle(uv, 'point', 'UV', { limits: [0, 1, 0, 1] });
      });
      d.panel('法线', [-1.5, 1.5, -1.2, 1.2], () => {
        axes3(d);
        const xy = project([[0, 0, 0], s.normal]).xy;
        d.arrow(xy[0], xy[1], palette.yellow, 'n');
      });
      d.values = {
        高度: s.height,
        '∂h/∂u': s.du,
        '∂h/∂v': s.dv,
        法线: s.normal,
        法线编码: s.encoded,
      };
      d.formula = 'n\\propto(-h_u/L_u,-h_v/L_v,1)';
      return d.result();
    },
  },
  {
    id: 'bump-displacement',
    chapter: '08',
    title: '改法线与改几何，会得到相同轮廓吗？',
    subtitle: '两图共用高度函数与相机；位移图重新计算覆盖和遮挡。',
    source: source + 'surface-maps.ts',
    defaults: { amplitude: 0.3, frequency: 1.5, detail: 24 },
    controls: [
      slider('amplitude', '振幅', 0, 0.7, 0.01),
      slider('frequency', '频率', 0.5, 4, 0.05),
      slider('detail', '网格分段', 4, 64, 1),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing(),
        a = number(p, 'amplitude'),
        f = number(p, 'frequency'),
        eye: Vec3 = [2, 1.4, 3.5];
      for (const displaced of [false, true]) {
        const mesh = gridMesh(
            number(p, 'detail'),
            displaced ? (uv) => heightField(uv, a, f).height : undefined,
          ),
          scene = {
            ...mesh,
            normals: mesh.uv.map((uv) => surfaceSample(uv, a, f).normal),
            colors: mesh.vertices.map(() => [0.12, 0.46, 0.27] as Vec3),
          };
        const frame = renderFrame(scene, {
          width: 112,
          model: identity(4),
          view: lookAt(eye, [0, 0, 0]),
          projection: perspective(42, 1, 0.1, 20),
          fragment: (fragment) =>
            fragmentStage(
              { ...fragment, normal: surfaceSample(fragment.uv, a, f).normal },
              eye,
              [-3, 4, 5],
            ),
        });
        d.panel(displaced ? '几何位移' : '仅改法线', [-0.1, 1.1, -0.1, 1.25], () => {
          bitmap(d, { width: 112, height: 112, data: frame.color }, [0, 0], [1, 1]);
          d.text([0, 1.12], displaced ? '位移：轮廓改变' : '凹凸：轮廓不变', palette.ink, 13);
        });
      }
      return d.result();
    },
  },
];
