import { Drawing, palette } from '../figures/drawing.ts';
import { drawMesh, imagePanel } from '../figures/advanced.ts';
import { slider, number, choice, points, vec2 } from '../figures/spec.ts';
import type { FigureSpec } from '../figures/spec.ts';
import type { Vec2, Vec3 } from '../math/vector.ts';
import { normalize, sub } from '../math/vector.ts';
import { compose, matVec } from '../math/matrix.ts';
import { deCasteljau } from '../chapters/13-bezier/core.ts';
import { catmullClark } from '../chapters/16-subdivision/core.ts';
import { lscm, distortion } from '../chapters/19-parameterization/core.ts';
import { triangulateRays } from '../chapters/21-reconstruction/core.ts';
import { shadeControl, shadeProfile, latheMesh, shadeStrip } from './geometry.ts';
import { deskState, DESK, lampJoints } from './model.ts';
import { renderDesk, deskCamera } from './render.ts';

export const shade: FigureSpec = {
  id: 'desk-shade-profile',
  chapter: '14',
  title: '灯罩的轮廓从哪里来',
  subtitle: '拖动母线的两个内部控制点；右侧使用同一母线重新生成完整台灯。',
  source: '/src/book-scene/geometry.ts',
  animated: false,
  defaults: { control: shadeControl() },
  controls: [],
  compute(p) {
    const control = points(p, 'control') as Vec2[],
      d = new Drawing();
    d.panel('母线 · 半径 / 高度', [0, 0.65, -0.06, 0.4], () => {
      d.axes(0, 0.62, 0, 0.38);
      d.line(control, palette.muted, 1, 1, true);
      d.line(
        Array.from({ length: 61 }, (_, i) => deCasteljau(control, i / 60).at(-1)![0]),
        palette.green,
        3,
      );
      [1, 2].forEach((i) =>
        d.handle(control[i], 'control', `母线控制点 ${i}`, {
          index: i,
          limits: [0.12, 0.6, 0.025, 0.315],
        }),
      );
      d.dot(control[0], palette.yellow, 0.006);
      d.dot(control[3], palette.yellow, 0.006);
    });
    const f = renderDesk(deskState({ profile: control }), 192);
    imagePanel(d, '同一母线生成的灯罩', f.width, f.height, f.color);
    d.values = {
      顶部半径: control[0][0],
      开口半径: control[3][0],
      灯罩高度: 0.34,
      内外壁径向间距: 0.035,
    };
    d.formula = 'S(u,v)=(r(v)\\cos 2\\pi u,\\;y(v),\\;r(v)\\sin 2\\pi u)';
    return d.result();
  },
};

export const subdivision: FigureSpec = {
  id: 'desk-shade-subdivision',
  chapter: '16',
  title: '灯罩控制网格与细分曲面',
  subtitle: '左侧是母线采样得到的粗四边形网格；右侧显示 Catmull–Clark 细分结果。',
  source: '/src/book-scene/geometry-studies.ts',
  animated: false,
  orbitPanels: ['粗网格', '细分后的网格'],
  defaults: { levels: 1, azimuth: 35, elevation: 28 },
  controls: [
    slider('levels', '细分次数', 0, 2, 1),
    slider('azimuth', '方位', -180, 180, 1, '°'),
    slider('elevation', '仰角', 5, 75, 1, '°'),
  ],
  compute(p) {
    const mesh = latheMesh(shadeProfile(0, 3), 8);
    let refined = mesh;
    for (let k = 0; k < number(p, 'levels'); k++) refined = catmullClark(refined);
    const d = new Drawing();
    for (const [name, item] of [
      ['粗网格', mesh],
      ['细分后的网格', refined],
    ] as const)
      d.panel(name, [-0.65, 0.65, -0.45, 0.55], () =>
        drawMesh(
          d,
          { ...item, vertices: item.vertices.map(([x, y, z]) => [x, z, y - 0.17]) },
          number(p, 'azimuth'),
          number(p, 'elevation'),
          palette.green,
        ),
      );
    d.values = {
      粗网格顶点: mesh.vertices.length,
      细分顶点: refined.vertices.length,
      最大半径: Math.max(...refined.vertices.map((v) => Math.hypot(v[0], v[2]))),
      原开口半径: 0.5,
    };
    return d.result();
  },
};

export const parameterization: FigureSpec = {
  id: 'desk-shade-uv',
  chapter: '19',
  title: '灯罩的接缝与展开',
  subtitle: '先沿母线切开外壁；比较生成参数与按三角形几何反求的 LSCM。',
  source: '/src/book-scene/geometry-studies.ts',
  animated: false,
  orbitPanels: ['已切开的灯罩外壁'],
  defaults: { method: 'lscm', pin: [1, 0], azimuth: 35, elevation: 28 },
  controls: [
    choice('method', '二维坐标', [
      ['generated', '原始生成参数'],
      ['lscm', 'LSCM'],
    ]),
    slider('azimuth', '方位', -180, 180, 1, '°'),
    slider('elevation', '仰角', 5, 75, 1, '°'),
  ],
  compute(p) {
    const n = 6,
      mesh = shadeStrip(n),
      pin = vec2(p, 'pin');
    const uv =
      p.method === 'lscm'
        ? lscm(
            mesh,
            new Map([
              [0, [0, 0]],
              [n, pin],
            ]),
          )
        : mesh.vertices.map((_, i) => [(i % (n + 1)) / n, Math.floor(i / (n + 1)) / n] as Vec2);
    const d = new Drawing();
    d.panel('已切开的灯罩外壁', [-0.65, 0.65, -0.45, 0.55], () =>
      drawMesh(
        d,
        { ...mesh, vertices: mesh.vertices.map(([x, y, z]) => [x, z, y - 0.17]) },
        number(p, 'azimuth'),
        number(p, 'elevation'),
        palette.green,
      ),
    );
    const xs = uv.map((v) => v[0]),
      ys = uv.map((v) => v[1]);
    d.panel(
      '同一批顶点的 UV',
      [
        Math.min(...xs) - 0.15,
        Math.max(...xs) + 0.15,
        Math.min(...ys) - 0.15,
        Math.max(...ys) + 0.15,
      ],
      () => {
        for (const f of mesh.faces)
          d.line(
            [...f, f[0]].map((i) => uv[i]),
            palette.green,
            0.8,
          );
        d.dot(uv[0], palette.yellow, 0.025);
        if (p.method === 'lscm')
          d.handle(pin, 'pin', '第二个固定 UV', { limits: [0.35, 1.8, -0.6, 0.6] });
      },
    );
    const metrics = mesh.faces.map((f) => distortion(mesh, uv, f));
    d.values = {
      '接缝两侧三维距离 / m': Math.hypot(...sub(mesh.vertices[0], mesh.vertices[n])),
      接缝UV距离: Math.hypot(...sub(uv[0], uv[n])),
      翻转面数: metrics.filter((m) => m.det < 0).length,
      平均伸长比: metrics.reduce((s, m) => s + m.ratio, 0) / metrics.length,
    };
    return d.result();
  },
};

export const stereo: FigureSpec = {
  id: 'desk-reconstruction',
  chapter: '21',
  title: '由双目观测重建空间位置',
  subtitle: '球的位置来自桌面场景；改变基线和像面误差，核对三角测量的重建偏差。',
  source: '/src/book-scene/geometry-studies.ts',
  animated: false,
  defaults: { baseline: 1.2, error: 0, object: 'ball' },
  controls: [
    slider('baseline', '双目基线', 0.3, 2.4, 0.05, 'm'),
    slider('error', '右像面横向误差', -0.02, 0.02, 0.001),
    choice('object', '对应点', [
      ['ball', '球心'],
      ['head', '灯头关节'],
    ]),
  ],
  compute(p) {
    const state = deskState(),
      target =
        p.object === 'ball'
          ? state.objects.find((o) => o.key === 'ball')!.position
          : lampJoints()[2];
    const b = number(p, 'baseline'),
      origins: Vec3[] = [
        [-b / 2, 1.6, 6],
        [b / 2, 1.6, 6],
      ];
    const observed = origins.map((o, i) => [
      (target[0] - o[0]) / (6 - target[2]) + (i ? number(p, 'error') : 0),
      (target[1] - o[1]) / (6 - target[2]),
    ]);
    const rays = observed.map(([u, v]) => normalize([u, v, -1]) as Vec3),
      q = triangulateRays(origins, rays);
    const d = new Drawing(),
      f = renderDesk(state, 160);
    const camera = deskCamera(state, f.width, f.height);
    const clip = matVec(compose(camera.projection, camera.view), [...target, 1]);
    imagePanel(d, '对应点所属的原场景', f.width, f.height, f.color, 1, () =>
      d.dot([((clip[0] / clip[3]) * f.width) / f.height, clip[1] / clip[3]], palette.yellow, 0.035),
    );
    d.panel('俯视 · 两条观测射线', [-2.2, 2.2, -1.5, 6.5], () => {
      origins.forEach((o, i) => {
        d.line(
          [
            [o[0], o[2]],
            [q[0], q[2]],
          ],
          i ? palette.green : palette.blue,
          2,
        );
        d.dot([o[0], o[2]], palette.yellow, 0.08);
      });
      d.dot([target[0], target[2]], palette.yellow, 0.09);
      d.dot([q[0], q[2]], palette.red, 0.06);
    });
    d.values = {
      已知位置: target,
      重建位置: q,
      '位置误差 / m': Math.hypot(...sub(q, target)),
      左右像坐标: observed,
    };
    return d.result();
  },
};
