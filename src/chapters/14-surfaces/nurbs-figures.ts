import { Drawing, palette } from '../../figures/drawing.ts';
import { rectangle } from '../../figures/helpers.ts';
import { number, points, slider, vec2 } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec3 } from '../../math/vector.ts';
import { project } from '../12-geometry/core.ts';
import { splineSurface, deBoorSurface } from './nurbs.ts';
import type { SplinePatch } from './nurbs.ts';

function gridSurface(d: Drawing, patch: SplinePatch, az: number, el: number) {
  const view = (ps: Vec3[]) => project(ps, az, el).xy;
  for (let i = 0; i <= 16; i++) {
    const a = Array.from({ length: 41 }, (_, j) => splineSurface(patch, i / 16, j / 40).position),
      b = Array.from({ length: 41 }, (_, j) => splineSurface(patch, j / 40, i / 16).position);
    d.line(view(a), palette.blue, 1.1, 0.7);
    d.line(view(b), palette.blue, 1.1, 0.7);
  }
}
function domain(d: Drawing, uv: number[], uKnots: number[], vKnots: number[]) {
  rectangle(d, [0, 0], [1, 1], palette.blue, 0.06);
  for (const u of new Set(uKnots))
    d.line(
      [
        [u, 0],
        [u, 1],
      ],
      palette.muted,
      1,
      0.5,
    );
  for (const v of new Set(vKnots))
    d.line(
      [
        [0, v],
        [1, v],
      ],
      palette.muted,
      1,
      0.5,
    );
  d.line(
    [
      [uv[0], 0],
      [uv[0], 1],
    ],
    palette.yellow,
    1,
  );
  d.line(
    [
      [0, uv[1]],
      [1, uv[1]],
    ],
    palette.yellow,
    1,
  );
  d.handle(uv, 'uv', 'UV', { limits: [0, 1, 0, 1] });
  d.text([0, -0.1], '0', palette.muted, 12);
  d.text([0.9, -0.1], '1 · u', palette.muted, 12);
  d.text([-0.12, 0.97], 'v', palette.muted, 12);
}
export const nurbsFigures: FigureSpec[] = [
  {
    id: 'bspline-surface',
    chapter: '14',
    title: '局部控制，从一段区间扩展为一块参数区域',
    subtitle: '上下拖动任一控制网点改变高度；在右侧移动 UV，观察哪些控制点参与求值。',
    source: '/src/chapters/14-surfaces/nurbs.ts',
    animated: false,
    defaults: {
      uv: [0.5, 0.45],
      knot: 0.35,
      azimuth: 35,
      elevation: 35,
      control: Array.from({ length: 25 }, (_, k) => [
        (Math.floor(k / 5) - 2) * 0.8,
        ((k % 5) - 2) * 0.8,
        k === 6 ? 0.9 : 0.15 * Math.sin(k),
      ]),
    },
    controls: [
      slider('knot', 'u 方向首个内结点', 0.15, 0.7, 0.01),
      slider('azimuth', '观察方位', -180, 180, 1, '°'),
      slider('elevation', '观察仰角', -60, 70, 1, '°'),
    ],
    compute(p) {
      const d = new Drawing(),
        flat = points(p, 'control') as Vec3[],
        [u, v] = vec2(p, 'uv'),
        az = number(p, 'azimuth'),
        el = number(p, 'elevation'),
        patch: SplinePatch = {
          control: Array.from({ length: 5 }, (_, i) => flat.slice(5 * i, 5 * i + 5)),
          degreeU: 2,
          degreeV: 2,
          knotsU: [0, 0, 0, number(p, 'knot'), 0.75, 1, 1, 1],
          knotsV: [0, 0, 0, 0.25, 0.65, 1, 1, 1],
        },
        result = splineSurface(patch, u, v),
        view = (ps: Vec3[]) => project(ps, az, el).xy;
      d.panel(
        '可编辑的三维控制网',
        [-2.8, 2.8, -2.4, 2.7],
        () => {
          gridSurface(d, patch, az, el);
          patch.control.forEach((row) => d.line(view(row), palette.muted, 1, 0.6, true));
          for (let j = 0; j < 5; j++)
            d.line(view(patch.control.map((row) => row[j])), palette.muted, 1, 0.6, true);
          flat.forEach((point, index) => {
            const i = Math.floor(index / 5),
              j = index % 5,
              xy = view([point])[0],
              base = view([[point[0], point[1], 0]])[0],
              influence = result.influence[i][j];
            if (influence > 1e-10) d.dot(xy, palette.green, 0.09);
            d.handle(xy, 'control', `P${i}${j} · z`, {
              index,
              axes: [0, 2],
              limits: [point[0], point[0], -1.4, 1.8],
              mapping: {
                offset: [xy[0] - point[0], base[1]],
                scale: [1, Math.cos((el * Math.PI) / 180)],
              },
            });
          });
          d.dot(view([result.position])[0], palette.yellow, 0.075);
          d.text([-2.5, 2.4], '绿色底点：当前有非零影响', palette.muted, 12);
        },
        1.5,
      );
      d.panel('结点划分与参数位置', [-0.18, 1.18, -0.18, 1.2], () => {
        rectangle(d, [0, 0], [0.75, 0.65], palette.green, 0.17);
        domain(d, [u, v], patch.knotsU, patch.knotsV);
        d.text([0.02, 1.11], '色块：P₁₁ 的支撑范围', palette.muted, 12);
      });
      const independent = deBoorSurface(patch, u, v);
      d.values = {
        参数: [u, v],
        曲面点: result.position,
        非零影响数: result.influence.flat().filter((x) => x > 1e-10).length,
        影响之和: result.influence.flat().reduce((a, b) => a + b, 0),
        'P₁₁ 影响': result.influence[1][1],
        两种求值差: Math.hypot(...result.position.map((x, i) => x - independent[i])),
      };
      d.formula = 'S(u,v)=\\sum_{i,j}N_{i,p}(u)M_{j,q}(v)P_{ij}';
      return d.result();
    },
  },
  {
    id: 'nurbs-cylinder',
    chapter: '14',
    title: '给控制点权重，让曲面精确包含圆柱',
    subtitle: '拖动参数点或调整中间行权重；绿色圆弧是解析参考，重置恢复圆柱权重。',
    source: '/src/chapters/14-surfaces/nurbs.ts',
    animated: false,
    defaults: { uv: [0.5, 0.6], weight: Math.SQRT1_2, height: 2, azimuth: 45, elevation: 25 },
    controls: [
      slider('weight', '中间行权重', 0.2, 2, 0.01),
      slider('height', '圆柱高度', 0.5, 3, 0.02),
      slider('azimuth', '观察方位', -180, 180, 1, '°'),
      slider('elevation', '观察仰角', -65, 70, 1, '°'),
    ],
    compute(p) {
      const d = new Drawing(),
        [u, v] = vec2(p, 'uv'),
        w = number(p, 'weight'),
        height = number(p, 'height'),
        az = number(p, 'azimuth'),
        el = number(p, 'elevation'),
        patch: SplinePatch = {
          degreeU: 2,
          degreeV: 1,
          knotsU: [0, 0, 0, 1, 1, 1],
          knotsV: [0, 0, 1, 1],
          control: [
            [
              [1, 0, -height / 2],
              [1, 0, height / 2],
            ],
            [
              [1, 1, -height / 2],
              [1, 1, height / 2],
            ],
            [
              [0, 1, -height / 2],
              [0, 1, height / 2],
            ],
          ],
          weights: [
            [1, 1],
            [w, w],
            [1, 1],
          ],
        },
        result = splineSurface(patch, u, v),
        view = (ps: Vec3[]) => project(ps, az, el).xy;
      const section = Array.from(
          { length: 81 },
          (_, i) => splineSurface(patch, i / 80, v).position,
        ),
        reference = Array.from(
          { length: 81 },
          (_, i) =>
            [
              Math.cos((i * Math.PI) / 160),
              Math.sin((i * Math.PI) / 160),
              height * (v - 0.5),
            ] as Vec3,
        );
      d.panel(
        '有理曲面与控制网',
        [-1.8, 1.8, -2, 2],
        () => {
          gridSurface(d, patch, az, el);
          patch.control.forEach((row) => d.line(view(row), palette.muted, 1, 0.5, true));
          for (let j = 0; j < 2; j++)
            d.line(view(patch.control.map((row) => row[j])), palette.muted, 1, 0.7, true);
          d.line(view(reference), palette.green, 2.5, 0.9, true);
          d.line(view(section), palette.yellow, 2.3);
          d.dot(view([result.position])[0], palette.yellow, 0.065);
        },
        1.2,
      );
      d.panel('同高度的 XY 截线', [-0.2, 1.4, -0.2, 1.4], () => {
        d.axes(0, 1.2, 0, 1.2);
        d.line(
          [
            [1, 0],
            [1, 1],
            [0, 1],
          ],
          palette.muted,
          1,
          0.6,
          true,
        );
        d.line(
          reference.map((q) => q.slice(0, 2)),
          palette.green,
          2.5,
          1,
          true,
        );
        d.line(
          section.map((q) => q.slice(0, 2)),
          palette.blue,
          2.5,
        );
        d.dot(result.position.slice(0, 2), palette.yellow, 0.035);
        d.text([0.55, 1.2], '中间控制点 (1,1)', palette.muted, 11);
      });
      d.panel('两方向参数域', [-0.18, 1.18, -0.18, 1.2], () =>
        domain(d, [u, v], patch.knotsU, patch.knotsV),
      );
      const independent = deBoorSurface(patch, u, v);
      d.values = {
        参数: [u, v],
        位置: result.position,
        中间行权重: w,
        当前半径: Math.hypot(result.position[0], result.position[1]),
        采样最大径向差: Math.max(...section.map((q) => Math.abs(Math.hypot(q[0], q[1]) - 1))),
        两种求值差: Math.hypot(...result.position.map((x, i) => x - independent[i])),
      };
      d.formula = 'S=\\frac{\\sum_{i,j}N_iM_jw_{ij}P_{ij}}{\\sum_{i,j}N_iM_jw_{ij}}';
      return d.result();
    },
  },
];
