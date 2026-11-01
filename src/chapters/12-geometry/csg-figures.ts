import { Drawing, palette, circle } from '../../figures/drawing.ts';
import { axes3, grid } from '../../figures/helpers.ts';
import { choice, number, slider, vec2, vec3 } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { sphere, block, contains, sampleSolid } from './csg.ts';
import type { BooleanOperation, Solid } from './csg.ts';
import { solidSlice, voxelSurface } from './solid-drawing.ts';
import { project } from './core.ts';

export const csgFigures: FigureSpec[] = [
  {
    id: 'csg-solids',
    chapter: '12',
    title: '同一个位置，先问 A，再问 B',
    subtitle: '拖动截面中的球心；并、交、差同时改变三维结果和切片。',
    source: '/src/chapters/12-geometry/csg.ts',
    defaults: {
      center: [0.55, 0.35, 0],
      radius: 1.1,
      z: 0,
      slice: 0,
      operation: 'difference',
      resolution: 24,
      azimuth: 35,
      elevation: 25,
    },
    controls: [
      choice('operation', '集合运算', [
        ['union', 'A ∪ B'],
        ['intersection', 'A ∩ B'],
        ['difference', 'A − B'],
        ['reverse', 'B − A'],
      ]),
      slider('radius', '球 B 半径', 0.3, 1.4, 0.02),
      slider('z', '球心 z', -1, 1, 0.02),
      slider('slice', '切片 z', -2.3, 2.3, 0.02),
      slider('resolution', '体素分辨率', 12, 36, 2),
      slider('azimuth', '观察方位', -180, 180, 1, '°'),
      slider('elevation', '观察仰角', -75, 75, 1, '°'),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing(),
        center: Vec3 = [...vec3(p, 'center')];
      center[2] = number(p, 'z');
      const a = block([0, 0, 0], [1.1, 0.85, 0.8]),
        b = sphere(center, number(p, 'radius'));
      const solid: Solid =
        p.operation === 'reverse'
          ? { kind: 'difference', left: b, right: a }
          : { kind: p.operation as BooleanOperation, left: a, right: b };
      const n = number(p, 'resolution'),
        cells = sampleSolid(solid, 2.5, n),
        z = number(p, 'slice');
      const az = number(p, 'azimuth'),
        el = number(p, 'elevation');
      d.panel(
        '三维体素显示',
        [-3.1, 3.1, -2.6, 2.6],
        () => {
          axes3(d, az, el, 2.2);
          voxelSurface(d, cells, n, 2.5, az, el);
          const cut: Vec3[] = [
            [-2.4, -2.4, z],
            [2.4, -2.4, z],
            [2.4, 2.4, z],
            [-2.4, 2.4, z],
          ];
          const xy = project(cut, az, el).xy;
          d.line([...xy, xy[0]], palette.yellow, 1, 0.7, true);
          d.text([-2.8, 2.25], '三维 · 中心采样', palette.muted, 12);
        },
        1.3,
      );
      d.panel('XY 切片', [-2.6, 2.6, -2.6, 2.6], () => {
        grid(d, [-2.5, 2.5, -2.5, 2.5]);
        solidSlice(d, solid, z);
        if (Math.abs(z) <= 0.8)
          d.line(
            [
              [-1.1, -0.85],
              [1.1, -0.85],
              [1.1, 0.85],
              [-1.1, 0.85],
              [-1.1, -0.85],
            ],
            palette.green,
            1.5,
            0.9,
            true,
          );
        const r2 = b.radius ** 2 - (z - center[2]) ** 2;
        if (r2 >= 0)
          d.line(circle([center[0], center[1]], Math.sqrt(r2)), palette.yellow, 1.5, 1, true);
        d.handle(center.slice(0, 2), 'center', '球心 XY', { limits: [-1, 1, -1, 1] });
        d.text([-2.35, 2.3], `XY · z = ${z.toFixed(2)}`, palette.muted, 12);
      });
      d.values = {
        体素数量: cells.reduce((s, x) => s + x, 0),
        采样间距: 5 / n,
        '连续球心 B': center,
        '切片 z': z,
      };
      d.formula =
        p.operation === 'union'
          ? '\\chi_{A\\cup B}=\\chi_A\\lor\\chi_B'
          : p.operation === 'intersection'
            ? '\\chi_{A\\cap B}=\\chi_A\\land\\chi_B'
            : p.operation === 'reverse'
              ? '\\chi_{B\\setminus A}=\\chi_B\\land\\neg\\chi_A'
              : '\\chi_{A\\setminus B}=\\chi_A\\land\\neg\\chi_B';
      return d.result();
    },
  },
  {
    id: 'csg-tree',
    chapter: '12',
    title: '改变括号，就改变构造树',
    subtitle: '拖动 C 或查询点 P；叶子先回答内外，父节点按集合运算合并。',
    source: '/src/chapters/12-geometry/csg.ts',
    defaults: { cutter: [-0.65, 0.3], probe: [-1, 0.65], grouping: 'left' },
    controls: [
      choice('grouping', '构造次序', [
        ['left', '(A ∪ B) − C'],
        ['right', 'A ∪ (B − C)'],
      ]),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing(),
        center = vec2(p, 'cutter'),
        probe = vec2(p, 'probe'),
        at: Vec3 = [...probe, 0];
      const a = sphere([-0.65, 0, 0], 1.1),
        b = sphere([0.65, 0, 0], 1),
        c = sphere([...center, 0], 0.65);
      const left: Solid = {
        kind: 'difference',
        left: { kind: 'union', left: a, right: b },
        right: c,
      };
      const right: Solid = {
        kind: 'union',
        left: a,
        right: { kind: 'difference', left: b, right: c },
      };
      const isLeft = p.grouping === 'left',
        solid = isLeft ? left : right;
      const values = [contains(a, at), contains(b, at), contains(c, at)];
      d.panel(
        '集合切片',
        [-2.3, 2.3, -1.9, 1.9],
        () => {
          solidSlice(d, solid, 0, 2.3);
          [a, b, c].forEach((s, i) => {
            d.line(
              circle([s.center[0], s.center[1]], s.radius),
              [palette.green, palette.blue, palette.red][i],
              1.5,
              0.8,
              true,
            );
            d.text([s.center[0] - 0.12, s.center[1] - 0.25], ['A', 'B', 'C'][i]);
          });
          d.handle(center, 'cutter', 'C', { limits: [-1.5, 1.5, -1.1, 1.1] });
          d.handle(probe, 'probe', 'P', { limits: [-2.1, 2.1, -1.6, 1.6] });
        },
        1.5,
      );
      d.panel('自叶向根求值', [-1.8, 1.8, -1.9, 1.9], () => {
        const nodes: [Vec2, string, boolean][] = isLeft
          ? [
              [[-1.25, -1.25], 'A', values[0]],
              [[0, -1.25], 'B', values[1]],
              [[1.15, -0.25], 'C', values[2]],
              [[-0.65, 0], '∪', values[0] || values[1]],
              [[0, 1.2], '−', contains(left, at)],
            ]
          : [
              [[-1.15, -0.25], 'A', values[0]],
              [[0, -1.25], 'B', values[1]],
              [[1.25, -1.25], 'C', values[2]],
              [[0.65, 0], '−', values[1] && !values[2]],
              [[0, 1.2], '∪', contains(right, at)],
            ];
        const edges = isLeft
          ? [
              [0, 3],
              [1, 3],
              [3, 4],
              [2, 4],
            ]
          : [
              [1, 3],
              [2, 3],
              [0, 4],
              [3, 4],
            ];
        edges.forEach(([a, b]) => d.line([nodes[a][0], nodes[b][0]], palette.muted, 1.4));
        nodes.forEach(([xy, label, value]) => {
          d.dot(xy, value ? palette.green : palette.red, 0.22);
          d.text([xy[0] - 0.1, xy[1]], label, palette.ink, 16);
          d.text(
            [xy[0] - 0.25, xy[1] - 0.4],
            value ? '内部' : '外部',
            value ? palette.green : palette.red,
            12,
          );
        });
      });
      d.values = {
        'P ∈ A': values[0],
        'P ∈ B': values[1],
        'P ∈ C': values[2],
        'P ∈ (A ∪ B) − C': contains(left, at),
        'P ∈ A ∪ (B − C)': contains(right, at),
      };
      return d.result();
    },
  },
];
