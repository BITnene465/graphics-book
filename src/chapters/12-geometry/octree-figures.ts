import { Drawing, palette, circle } from '../../figures/drawing.ts';
import { grid, rectangle } from '../../figures/helpers.ts';
import { number, slider, vec2, vec3 } from '../../figures/spec.ts';
import type { FigureSpec } from '../../figures/spec.ts';
import type { Vec3 } from '../../math/vector.ts';
import { sphere, contains } from './csg.ts';
import { buildOctree, octreeLeaves, queryOctree, volumeBounds } from './octree.ts';
import type { Octant } from './octree.ts';
import { cubeWire } from './solid-drawing.ts';
import { project } from './core.ts';

const root = { center: [0, 0, 0] as Vec3, halfSize: 2 };
const stateName = { inside: '整盒在内', outside: '整盒在外', boundary: '边界候选' };
function slice(d: Drawing, tree: Octant, z: number): void {
  for (const n of octreeLeaves(tree)) {
    if (z < n.center[2] - n.halfSize || z >= n.center[2] + n.halfSize) continue;
    const at: [number, number] = [n.center[0] - n.halfSize, n.center[1] - n.halfSize],
      size = 2 * n.halfSize;
    const color =
      n.state === 'inside' ? palette.blue : n.state === 'boundary' ? palette.yellow : palette.muted;
    if (n.state !== 'outside') rectangle(d, at, [size, size], color, 0.27);
    d.line(
      [at, [at[0] + size, at[1]], [at[0] + size, at[1] + size], [at[0], at[1] + size], at],
      color,
      0.8,
      n.state === 'outside' ? 0.35 : 0.8,
    );
  }
}
export const octreeFigures: FigureSpec[] = [
  {
    id: 'octree-cells',
    chapter: '12',
    title: '只在尚不能确定的空间继续细分',
    subtitle: '拖动球心并增加深度；蓝色整盒在内，黄色盒仍可能跨越边界。',
    source: '/src/chapters/12-geometry/octree.ts',
    defaults: { center: [0.2, -0.15], radius: 1.1, depth: 3, z: 0 },
    controls: [
      slider('depth', '最大深度', 0, 5, 1),
      slider('radius', '球半径', 0.15, 1.4, 0.01),
      slider('z', '切片 z', -1.95, 1.95, 0.01),
    ],
    animated: false,
    compute(p) {
      const d = new Drawing(),
        center = vec2(p, 'center'),
        ball = sphere([...center, 0.1], number(p, 'radius'));
      const depth = number(p, 'depth'),
        tree = buildOctree(ball, root, depth),
        z = number(p, 'z'),
        bounds = volumeBounds(tree);
      d.panel(
        '三维八叉树的 XY 切片',
        [-2.3, 2.3, -2.3, 2.3],
        () => {
          slice(d, tree, z);
          const r2 = ball.radius ** 2 - (z - ball.center[2]) ** 2;
          if (r2 >= 0) d.line(circle(center, Math.sqrt(r2)), palette.green, 2.2);
          d.handle(center, 'center', '球心 XY', { limits: [-0.45, 0.45, -0.45, 0.45] });
          d.text([-2, 2.13], `XY · z = ${z.toFixed(2)}`, palette.muted, 12);
        },
        1.4,
      );
      d.panel('体积上下界', [-0.7, 5.8, -0.6, 4.8], () => {
        d.axes(0, 5, 0, 4);
        const low: number[][] = [],
          high: number[][] = [];
        for (let i = 0; i <= 5; i++) {
          const b = volumeBounds(buildOctree(ball, root, i));
          low.push([i, b.lower / 16]);
          high.push([i, b.upper / 16]);
        }
        const exact = (4 * Math.PI * ball.radius ** 3) / 3;
        d.line(
          [
            [0, exact / 16],
            [5, exact / 16],
          ],
          palette.green,
          1.4,
          1,
          true,
        );
        d.line(low, palette.blue, 2.4);
        d.line(high, palette.yellow, 2.4);
        d.line(
          [
            [depth, bounds.lower / 16],
            [depth, bounds.upper / 16],
          ],
          palette.ink,
          1,
          0.6,
        );
        d.dot([depth, bounds.lower / 16], palette.blue, 0.06);
        d.dot([depth, bounds.upper / 16], palette.yellow, 0.06);
        for (let i = 0; i <= 4; i++) d.text([-0.6, i], String(16 * i), palette.muted, 11);
        for (let i = 0; i <= 5; i++) d.text([i - 0.08, -0.3], String(i), palette.muted, 11);
        d.text([0.2, 4.5], '体积', palette.muted, 12);
        d.text([3, 4.3], '黄：上界', palette.yellow, 12);
        d.text([3, 3.8], '蓝：下界', palette.blue, 12);
        d.text([3, 3.3], '绿：解析体积', palette.green, 12);
      });
      d.values = {
        叶盒数: bounds.leaves,
        均匀细分盒数: 8 ** depth,
        体积下界: bounds.lower,
        球体积: (4 * Math.PI * ball.radius ** 3) / 3,
        体积上界: bounds.upper,
      };
      d.formula = 'V_{\\rm in}\\le V\\le V_{\\rm in}+V_{\\rm boundary}';
      return d.result();
    },
  },
  {
    id: 'octree-query',
    chapter: '12',
    title: '一个三维位置，只沿一条分支向下查',
    subtitle: '拖动 XY 查询点或改变 z；播放逐层选中的八分区。',
    source: '/src/chapters/12-geometry/octree.ts',
    defaults: { probe: [1.12, 0.2, 0.12], z: 0.12, depth: 4, azimuth: 35, elevation: 25 },
    controls: [
      slider('z', '查询点 z', -1.95, 1.95, 0.01),
      slider('depth', '最大深度', 1, 5, 1),
      slider('azimuth', '观察方位', -180, 180, 1, '°'),
      slider('elevation', '观察仰角', -75, 75, 1, '°'),
    ],
    initialProgress: 0.65,
    duration: 7,
    compute(p, t) {
      const d = new Drawing(),
        probe: Vec3 = [...vec3(p, 'probe')];
      probe[2] = number(p, 'z');
      const ball = sphere([0, 0, 0], 1.15),
        tree = buildOctree(ball, root, number(p, 'depth')),
        query = queryOctree(tree, probe);
      const level = Math.min(query.path.length - 1, Math.floor(t * query.path.length)),
        current = query.path[level];
      const az = number(p, 'azimuth'),
        el = number(p, 'elevation');
      d.panel('三维查询路径', [-3.3, 3.3, -3, 3], () => {
        cubeWire(d, root, az, el);
        if (level > 0)
          query.path[level - 1].children!.forEach((n) =>
            cubeWire(d, n, az, el, palette.muted, 0.25),
          );
        cubeWire(d, current, az, el, palette.yellow, 1);
        const xy = project([probe], az, el).xy[0];
        d.dot(xy, palette.yellow, 0.07);
        d.text([-2.9, 2.6], `第 ${level} 层 · ${stateName[current.state]}`, palette.muted, 12);
      });
      d.panel('查询点所在 XY 切片', [-2.3, 2.3, -2.3, 2.3], () => {
        slice(d, tree, probe[2]);
        const h = current.halfSize,
          [x, y] = current.center;
        d.line(
          [
            [x - h, y - h],
            [x + h, y - h],
            [x + h, y + h],
            [x - h, y + h],
            [x - h, y - h],
          ],
          palette.yellow,
          3,
        );
        d.handle(probe.slice(0, 2), 'probe', 'P', { limits: [-1.95, 1.95, -1.95, 1.95] });
      });
      d.values = {
        当前层: level,
        '子编号 · 已走路径': query.indices.slice(0, level).join(' → ') || '根',
        当前判定: stateName[current.state],
        最终叶判定: stateName[query.path.at(-1)!.state],
        '精确查询 P 在球内': contains(ball, probe),
        查询访问盒数: query.path.length,
      };
      d.formula = 'i=b_x+2b_y+4b_z';
      return d.result();
    },
  },
];
