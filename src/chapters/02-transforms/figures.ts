import { Drawing, palette } from '../../figures/drawing.ts';
import { grid, wire3 } from '../../figures/helpers.ts';
import { number, vec2, vec3, slider, choice } from '../../figures/spec.ts';
import type { FigureSpec, Params } from '../../figures/spec.ts';
import type { Vec2, Vec3 } from '../../math/vector.ts';
import { dot, cross, radians, scale, add } from '../../math/vector.ts';
import { matVec, compose } from '../../math/matrix.ts';
import { translation, rotation, scaling, apply } from './core.ts';
import { splitAlong, rotate, unit, angleBetween } from './spatial.ts';
import { planeReflection, shearMatrix, transformPoints, planePatch } from './linear3d.ts';
import {
  basisMatrix,
  basisDiagnostics,
  localToWorld,
  worldToLocal,
  twoLinkFK,
} from './hierarchy.ts';
import { project } from '../12-geometry/core.ts';

const source = '/src/chapters/02-transforms/';
const house: Vec2[] = [
  [-0.7, -0.6],
  [0.7, -0.6],
  [0.7, 0.4],
  [0, 1],
  [-0.7, 0.4],
  [-0.7, -0.6],
];
const look = [
  slider('azimuth', '观察方位', -180, 180, 1, '°'),
  slider('elevation', '观察仰角', -80, 80, 1, '°'),
];
const camera = { azimuth: 35, elevation: 25 };
const projectAt = (p: Params, points: Vec3[]) =>
  project(points, number(p, 'azimuth'), number(p, 'elevation')).xy;
const orthogonalViews = [
  { name: 'XY', axes: [0, 1] },
  { name: 'YZ', axes: [1, 2] },
  { name: 'ZX', axes: [2, 0] },
];
function views(d: Drawing, draw: (pick: (v: number[]) => Vec2, axes: number[]) => void): void {
  for (const view of orthogonalViews)
    d.panel(view.name, [-3.2, 3.2, -3.2, 3.2], () => {
      grid(d, [-3, 3, -3, 3]);
      d.text([-2.9, 2.8], view.name, palette.ink, 13);
      draw((v) => view.axes.map((i) => v[i]) as Vec2, view.axes);
    });
}

export const figures: FigureSpec[] = [
  {
    id: 'basis-transform',
    chapter: '02',
    title: '矩阵的列，就是基向量的去向',
    subtitle: '直接拖动两根基向量与输入向量；网格接受同一个变换。',
    source: source + 'core.ts',
    defaults: { basisX: [1.4, 0.35], basisY: [0.45, 1.1], point: [1, 0.5] },
    controls: [],
    compute(p, t) {
      const d = new Drawing([-3, 3, -2.2, 2.2]),
        x = vec2(p, 'basisX'),
        y = vec2(p, 'basisY'),
        v = vec2(p, 'point'),
        a = [
          [1 + (x[0] - 1) * t, y[0] * t],
          [x[1] * t, 1 + (y[1] - 1) * t],
        ],
        q = matVec(a, v);
      grid(d, [-3, 3, -2.2, 2.2]);
      for (let i = -4; i <= 4; i++) {
        d.line([matVec(a, [i, -4]), matVec(a, [i, 4])], palette.blue, 0.8, 0.3);
        d.line([matVec(a, [-4, i]), matVec(a, [4, i])], palette.green, 0.8, 0.3);
      }
      d.arrow([0, 0], [a[0][0], a[1][0]], palette.blue, 'Aeₓ');
      d.arrow([0, 0], [a[0][1], a[1][1]], palette.green, 'Aeᵧ');
      d.arrow([0, 0], v, palette.muted, 'v');
      d.arrow([0, 0], q, palette.yellow, 'Av');
      d.handle(x, 'basisX', 'x 基');
      d.handle(y, 'basisY', 'y 基');
      d.handle(v, 'point', '输入 v');
      d.values = { 当前矩阵: a, 输出: q, 行列式: a[0][0] * a[1][1] - a[0][1] * a[1][0] };
      d.formula = 'Av=v_x(Ae_x)+v_y(Ae_y)';
      return d.result();
    },
  },
  {
    id: 'transform-order',
    chapter: '02',
    title: '同样的变换，不同的顺序',
    subtitle: '平移向量可以拖动；播放逐步显示两条路线。',
    source: source + 'core.ts',
    defaults: { translation: [1.7, 0.5], angle: 90 },
    controls: [slider('angle', '旋转角度', -180, 180, 1, '°')],
    compute(p, t) {
      const d = new Drawing([-3.5, 3.5, -2.5, 3.5]),
        offset = vec2(p, 'translation'),
        angle = radians(number(p, 'angle')),
        first = Math.min(1, t * 2),
        second = Math.max(0, t * 2 - 1);
      const tr = compose(
          translation(offset[0] * second, offset[1] * second),
          rotation(angle * first),
        ),
        rt = compose(rotation(angle * second), translation(offset[0] * first, offset[1] * first));
      grid(d, [-3.5, 3.5, -2.5, 3.5]);
      d.line(house, palette.muted, 1, 1, true);
      d.line(apply(tr, house), palette.blue, 2);
      d.line(apply(rt, house), palette.green, 2);
      d.arrow([0, 0], offset, palette.yellow, 't');
      d.handle(offset, 'translation', '平移');
      d.values = {
        '先转后移 TR': apply(compose(translation(...offset), rotation(angle)), [[1, 0]])[0],
        '先移后转 RT': apply(compose(rotation(angle), translation(...offset)), [[1, 0]])[0],
      };
      d.formula = 'TRp=Rp+t,\\qquad RTp=Rp+Rt';
      return d.result();
    },
  },
  {
    id: 'vector-products',
    chapter: '02',
    title: '同一对向量，三个正交视图',
    subtitle: '拖动 a、b 的端点；每个视图只修改两个分量，第三个分量保持不变。',
    source: source + 'spatial.ts',
    defaults: { a: [1.5, 0.7, 0.2], b: [0.3, 1.3, 0.8] },
    controls: [],
    compute(p, t) {
      const d = new Drawing(),
        a = vec3(p, 'a'),
        b = vec3(p, 'b'),
        n = cross(a, b),
        area = Math.hypot(...n),
        validB = Math.hypot(...b) > 0,
        parallel = validB ? splitAlong(a, b).parallel : null;
      views(d, (xy, axes) => {
        d.polygon([xy([0, 0, 0]), xy(a), xy(add(a, b)), xy(b)], palette.blue, 0.1);
        d.arrow(xy([0, 0, 0]), xy(a), palette.blue);
        d.arrow(xy([0, 0, 0]), xy(b), palette.green);
        if (area) d.arrow(xy([0, 0, 0]), xy(scale(n, 1 / area)), palette.red, 'n̂');
        if (parallel) {
          d.arrow(xy([0, 0, 0]), xy(parallel), palette.yellow);
          d.line([xy(a), xy(parallel)], palette.yellow, 1, 1, true);
          d.dot(xy(a.map((x, i) => x * (1 - t) + parallel[i] * t)), palette.yellow, 0.06);
        }
        d.handle(xy(a), 'a', 'a', { axes, limits: [-3, 3, -3, 3] });
        d.handle(xy(b), 'b', 'b', { axes, limits: [-3, 3, -3, 3] });
      });
      d.values = {
        a: a,
        b: b,
        'a·b': dot(a, b),
        '夹角 / °':
          validB && Math.hypot(...a) > 0 ? (angleBetween(a, b) * 180) / Math.PI : '未定义',
        投影: parallel ?? '未定义',
        平行四边形面积: area,
        叉积: n,
      };
      d.formula = 'a_\\parallel=\\frac{a\\cdot b}{b\\cdot b}b';
      return d.result();
    },
  },
  {
    id: 'axis-rotation',
    chapter: '02',
    title: '绕任意轴旋转',
    subtitle: '拖动旋转轴与原始点，播放或拖动进度检查 Rodrigues 分解。',
    source: source + 'spatial.ts',
    defaults: { axis: [1, 2, 1], point: [1.8, 0.3, -0.1], angle: 120 },
    controls: [slider('angle', '旋转角度', -360, 360, 1, '°')],
    compute(p, t) {
      const d = new Drawing(),
        axis = vec3(p, 'axis'),
        v = vec3(p, 'point'),
        valid = Math.hypot(...axis) > 0,
        angle = radians(number(p, 'angle')) * t,
        n = valid ? unit(axis) : ([0, 0, 0] as Vec3),
        r = valid ? rotate(v, axis, angle) : null,
        parts = valid ? splitAlong(v, axis) : null;
      views(d, (xy, axes) => {
        d.arrow([0, 0], xy(axis), palette.blue);
        d.handle(xy(axis), 'axis', 'a', { axes, limits: [-3, 3, -3, 3] });
        d.handle(xy(v), 'point', 'p', { axes, limits: [-3, 3, -3, 3] });
        if (!r || !parts) return;
        d.line(
          Array.from({ length: 101 }, (_, i) => xy(rotate(v, axis, (i / 100) * 2 * Math.PI))),
          palette.muted,
          1,
        );
        d.line(
          Array.from({ length: 61 }, (_, i) => xy(rotate(v, axis, (i / 60) * angle))),
          palette.yellow,
          2,
        );
        const middle = add(parts.parallel, scale(parts.perpendicular, Math.cos(angle)));
        d.arrow([0, 0], xy(parts.parallel), palette.blue);
        d.arrow(xy(parts.parallel), xy(middle), palette.green);
        d.arrow(xy(middle), xy(r), palette.red);
        d.dot(xy(r), palette.yellow, 0.07);
      });
      d.values = {
        '当前角度 / °': (angle * 180) / Math.PI,
        旋转结果: r ?? '轴方向未定义',
        旋转前长度: Math.hypot(...v),
        旋转后长度: r ? Math.hypot(...r) : '未定义',
        旋转前轴向坐标: valid ? dot(v, n) : '未定义',
        旋转后轴向坐标: r ? dot(r, n) : '未定义',
      };
      d.formula = 'Rv=v_\\parallel+\\cos\\theta\,v_\\perp+\\sin\\theta(n\\times v)';
      return d.result();
    },
  },
  {
    id: 'reflection-shear',
    chapter: '02',
    title: '镜像翻转朝向，错切保持体积',
    subtitle: '同一立方体在不同线性变换下的几何结果。',
    source: source + 'linear3d.ts',
    defaults: { ...camera, mode: 'reflection', distance: 0, amount: 1 },
    controls: [
      choice('mode', '变换', [
        ['reflection', '平面镜像'],
        ['shear', '错切'],
      ]),
      slider('distance', '平面距离', -2, 2, 0.02),
      slider('amount', '错切量', -3, 3, 0.02),
      ...look,
    ],
    compute(p, t) {
      const d = new Drawing([-3.5, 3.5, -3, 3]),
        vertices: Vec3[] = [
          [-0.6, -0.6, -0.6],
          [0.6, -0.6, -0.6],
          [0.6, 0.6, -0.6],
          [-0.6, 0.6, -0.6],
          [-0.6, -0.6, 0.6],
          [0.6, -0.6, 0.6],
          [0.6, 0.6, 0.6],
          [-0.6, 0.6, 0.6],
        ],
        edges: Vec2[] = [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 0],
          [4, 5],
          [5, 6],
          [6, 7],
          [7, 4],
          [0, 4],
          [1, 5],
          [2, 6],
          [3, 7],
        ];
      const matrix =
          p.mode === 'reflection'
            ? planeReflection([1, 0.5, 0], number(p, 'distance'))
            : shearMatrix(number(p, 'amount')),
        transformed = transformPoints(matrix, vertices).map(
          (q, i) => q.map((x, c) => vertices[i][c] * (1 - t) + x * t) as Vec3,
        );
      if (p.mode === 'reflection')
        d.polygon(
          projectAt(p, planePatch([1, 0.5, 0], number(p, 'distance'))),
          palette.green,
          0.08,
        );
      wire3(d, vertices, edges, number(p, 'azimuth'), number(p, 'elevation'), palette.muted);
      wire3(d, transformed, edges, number(p, 'azimuth'), number(p, 'elevation'), palette.blue);
      d.values = { 变换矩阵: matrix, 行列式: p.mode === 'reflection' ? -1 : 1 };
      return d.result();
    },
  },
  {
    id: 'general-basis',
    chapter: '02',
    title: '点不动，描述它的坐标可以改变',
    subtitle: '在三个同步视图中编辑原点、世界点和三根基；条件数揭示坐标恢复的敏感性。',
    source: source + 'hierarchy.ts',
    defaults: {
      origin: [0, 0, 0],
      point: [1.3, 0.8, 0.5],
      b1: [1, 0, 0],
      b2: [0.6, 1, 0],
      b3: [0.2, 0.3, 1],
      selected: 'point',
    },
    controls: [
      choice('selected', '编辑对象', [
        ['point', '世界点 p'],
        ['origin', '原点 o'],
        ['b1', '基 b₁'],
        ['b2', '基 b₂'],
        ['b3', '基 b₃'],
      ]),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing(),
        origin = vec3(p, 'origin'),
        point = vec3(p, 'point'),
        basis = [vec3(p, 'b1'), vec3(p, 'b2'), vec3(p, 'b3')],
        matrix = basisMatrix(basis),
        diagnostics = basisDiagnostics(matrix),
        local = diagnostics.state === 'regular' ? worldToLocal(matrix, point, origin) : null;
      views(d, (xy, axes) => {
        basis.forEach((b, i) =>
          d.arrow(
            xy(origin),
            xy(add(origin, b)),
            [palette.blue, palette.green, palette.red][i],
            'b' + (i + 1),
          ),
        );
        d.dot(xy(origin), palette.muted, 0.04);
        d.dot(xy(point), palette.yellow, 0.07);
        if (local) {
          let at = origin;
          basis.forEach((b, i) => {
            const next = add(at, scale(b, local[i])) as Vec3;
            d.line([xy(at), xy(next)], palette.yellow, 1.2, 1, true);
            at = next;
          });
        }
        const key = String(p.selected),
          isBasis = key.startsWith('b'),
          value = vec3(p, key),
          at = isBasis ? add(origin, value) : value;
        d.handle(xy(at), key, key, {
          axes,
          mapping: isBasis ? { offset: xy(origin), scale: [1, 1] } : undefined,
        });
      });
      d.values = {
        状态: diagnostics.state,
        局部坐标: local ?? '不可稳定恢复',
        重建世界点: local ? localToWorld(matrix, local, origin) : '未定义',
        条件数: diagnostics.condition,
        基矩阵: matrix,
      };
      d.formula = 'p=o+Bc,\\qquad c=B^{-1}(p-o)';
      return d.result();
    },
  },
  {
    id: 'two-link-hierarchy',
    chapter: '02',
    title: '父坐标系带着子坐标系一起运动',
    subtitle: '移动基座或转动关节，观察局部变换如何组合。',
    source: source + 'hierarchy.ts',
    defaults: { base: [-1, -0.4], parent: 35, child: -55, length1: 1.6, length2: 1.2 },
    controls: [
      slider('parent', '肩关节', -180, 180, 1, '°'),
      slider('child', '肘关节', -180, 180, 1, '°'),
      slider('length1', '上臂长度', 0.2, 3, 0.02),
      slider('length2', '前臂长度', 0.2, 3, 0.02),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing([-3, 4, -2.5, 3]),
        f = twoLinkFK(
          vec2(p, 'base'),
          radians(number(p, 'parent')),
          radians(number(p, 'child')),
          number(p, 'length1'),
          number(p, 'length2'),
        );
      grid(d, [-3, 4, -2.5, 3]);
      d.line(f.joints.slice(0, 2), palette.blue, 9);
      d.line(f.joints.slice(1), palette.green, 7);
      f.joints.forEach((q) => d.dot(q, palette.yellow, 0.07));
      d.handle(f.joints[0], 'base', '基座');
      d.values = { 肘关节: f.joints[1], 末端: f.joints[2] };
      d.formula = 'M_{child}=M_{parent}\,T(L_1,0)\,R(\\theta_2)';
      return d.result();
    },
  },
];

export const main: FigureSpec = {
  id: 'main',
  chapter: '02',
  title: '点、向量与复合变换',
  subtitle: '拖动黄色输入点；调整变换次序并检查最终矩阵。',
  source: source + 'core.ts',
  defaults: {
    point: [1, 0.5],
    angle: 25,
    tx: 0.6,
    ty: 0.4,
    sx: 1.2,
    sy: 0.8,
    shear: 0,
    order: 'TRS',
  },
  controls: [
    slider('angle', '旋转', -180, 180, 1, '°'),
    slider('tx', '平移 x', -4, 4, 0.02),
    slider('ty', '平移 y', -4, 4, 0.02),
    slider('sx', '缩放 x', -3, 3, 0.02),
    slider('sy', '缩放 y', -3, 3, 0.02),
    slider('shear', '错切', -2, 2, 0.02),
    choice('order', '次序', [
      ['TRS', 'TRS'],
      ['RTS', 'RTS'],
      ['SRT', 'SRT'],
      ['TSR', 'TSR'],
    ]),
  ],
  animated: false,
  compute(p) {
    const d = new Drawing([-4, 4, -3, 3]),
      h = [
        [1, number(p, 'shear'), 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      transforms = {
        T: translation(number(p, 'tx'), number(p, 'ty')),
        R: rotation(radians(number(p, 'angle'))),
        S: scaling(number(p, 'sx'), number(p, 'sy')),
      },
      m = compose(
        ...String(p.order)
          .split('')
          .map((k) => transforms[k as keyof typeof transforms]),
        h,
      );
    grid(d, [-4, 4, -3, 3]);
    d.line(house, palette.muted, 1.4, 1, true);
    d.polygon(apply(m, house), palette.blue, 0.1);
    d.line(apply(m, house), palette.blue, 2.5);
    const point = vec2(p, 'point'),
      out = apply(m, [point])[0],
      vector = apply(m, [point], true)[0];
    d.handle(point, 'point', '输入 p');
    d.dot(out, palette.yellow, 0.08);
    d.arrow([0, 0], vector, palette.green, 'Mv');
    d.line([point, out], palette.yellow, 1, 1, true);
    d.values = { 矩阵: m, 点的像: out, 向量的像: vector };
    return d.result();
  },
};
